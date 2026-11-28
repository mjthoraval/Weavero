// One persistence writer and reader for Weavero's JSON files under
// <data dir>/weavero/ (survey 2026-10-06 §3.4).
//
// Every store had its own copy of the same idea -- snapshot, per-module
// promise chain, mkdir, `writeUTF8` with a `tmpPath` -- and the copies
// drifted: ann-order wrote unchained (two edits in flight could land out of
// order), a module chain died with its instance on a hot reload (a write
// issued by the old instance and one by the new could interleave), and two
// stores still answered a transient READ error (a lock, antivirus, sync)
// the way they answer a corrupt file: move it aside and start empty, so the
// next persist overwrote the user's data with nothing (the bookmarks #25
// class). Here:
//  - the write chain is PER PATH on the Zotero global, so it survives a
//    reload and serialises every writer of a file;
//  - the snapshot is taken synchronously (the caller's document may change
//    before the I/O runs), the write is atomic (`tmpPath`), the directory
//    is created, failures are logged, never thrown;
//  - a read tells "missing", "parse-error" (the file is moved aside to
//    `*.corrupt-<ts>` by default) and "io-error" (the file is KEPT; the
//    caller runs read-only) apart, retries a failed read once, and waits
//    for the path's pending writes first so a read after a write sees it.

export type WvStoreReadStatus = "ok" | "missing" | "io-error" | "parse-error";

export interface WvStoreReadResult {
    status: WvStoreReadStatus;
    /** The parsed document on "ok"; null otherwise. */
    doc: any;
    error?: any;
    /** Where a corrupt file was moved ("parse-error" with move-aside). */
    movedTo?: string;
}

export interface WvStoreWriteOptions {
    /** JSON.stringify indentation; 2 by default, null for compact. */
    pretty?: number | null;
    /** Given the PREVIOUS on-disk document (parsed; null when none or
     *  unreadable), return true to copy the file to `<path>.bak` before
     *  overwriting it -- a rotation that happens only when the caller
     *  says the new document loses something (tab-groups). */
    rotateBak?: (prevDoc: any) => boolean;
    /** Write the file compressed, as Firefox's session store writes its
     *  `.jsonlz4` (IOUtils `compress: true`, the mozlz4 format; checked on
     *  Zotero 10.0.8 / Firefox 140 and 11.0-beta.4 / Firefox 153, plan
     *  work/citations-plan-2026-11-21.md M1). Read it back with
     *  `decompress: true`. */
    compress?: boolean;
}

export interface WvStoreReadOptions {
    /** Extra read attempts after a failure (default 1), `retryDelay` ms apart. */
    retries?: number;
    retryDelay?: number;
    /** What to do with a file that reads but does not parse: move it aside
     *  (default) or keep it in place. */
    onParseError?: "move-aside" | "keep";
    /** The file was written with `compress: true`. A file that is not mozlz4
     *  (cut short, another program's) answers "parse-error", as a document
     *  that does not parse: the read of its bytes works, the decompression
     *  does not. */
    decompress?: boolean;
}

// The STARTUP GATE (modules/backups.ts _wvBkBoot): while Weavero copies its data
// before an update, or writes a staged restore back, every read, write and
// removal of THIS instance waits for it. A store must never read a file a
// restore is about to replace (its in-memory copy would later be written over
// the restored one), and the update backup must copy a file before the new
// version's first write or migration of it. Module scope, not the Zotero
// global: each loaded bundle has its own gate, and a previous instance's
// writes never wait for the next one's (the gate awaits THEM).
let wvGate: Promise<void> | null = null;

/** Resolves once the startup gate is open (at once when there is none). */
export function wvStoreGate(): Promise<void> {
    return wvGate || Promise.resolve();
}

/** Hold every store operation of this bundle until `p` settles (null: open). */
export function wvStoreSetGate(p: Promise<any> | null): void {
    if (!p) { wvGate = null; return; }
    const g: Promise<void> = p.then(() => {}, () => {});
    wvGate = g;
    g.then(() => { if (wvGate === g) wvGate = null; });
}

/** `<data dir>/weavero`. */
export function wvStoreDir(): string {
    return PathUtils.join((Zotero as any).DataDirectory.dir, "weavero");
}

/** `<data dir>/weavero/<name>`. `name` is ONE file name: a file in a
 *  sub-folder goes through `PathUtils.join(wvStoreDir(), dir, file)`, as
 *  feeds.ts and cited-by.ts build theirs -- on Windows PathUtils.join refuses
 *  a component holding a slash (NS_ERROR_FILE_UNRECOGNIZED_PATH; People's
 *  cache, 2026-11-22). */
export function wvStorePath(name: string): string {
    return PathUtils.join(wvStoreDir(), name);
}

// The table lives only while a write is pending: the last write of a path
// removes its entry, the last entry the table (a disable leaves nothing on the
// Zotero global once its final writes land; zzz-disable-leftovers.spec.js).
function wvStoreChainsIf(): Record<string, Promise<void>> | null {
    let c = (Zotero as any)._wvStoreChains;
    // Left by an instance whose scope Zotero has since destroyed (zotero#6080
    // nukes it 10 s after unload; an update keeps the chains): start afresh.
    try { if (c && (Components as any).utils.isDeadWrapper(c)) c = null; } catch (e) { c = null; }
    return c || null;
}

function wvStoreChains(): Record<string, Promise<void>> {
    return wvStoreChainsIf() || ((Zotero as any)._wvStoreChains = Object.create(null));
}

/** The pending writes of `path` (resolved when there are none). */
export function wvStoreChain(path: string): Promise<void> {
    const t = wvStoreChainsIf();
    const c = t && t[path];
    return c ? c.catch(() => {}) : Promise.resolve();
}

/** Every pending write of a file in folder `dir` (its whole tree) done, those
 *  issued meanwhile too: what a removal of the folder waits for. A write not
 *  awaited by its caller (cited-by.ts's entries files) would otherwise land
 *  after the removal and bring the folder back (Remove Built Data,
 *  sdt-build.ts _wvSbCleanRun). Bounded: a writer that never stops does not
 *  hold the caller for good. */
export async function wvStoreSettled(dir: string): Promise<void> {
    const sep = (s: string) => s === "/" || s === "\\";
    for (let round = 0; round < 50; round++) {
        const t = wvStoreChainsIf();
        const pending = t ? Object.keys(t).filter((p) => p === dir || (p.startsWith(dir) && sep(p.charAt(dir.length)))) : [];
        if (!pending.length) return;
        await Promise.all(pending.map((p) => (t as Record<string, Promise<void>>)[p].catch(() => {})));
    }
}

/** Waits before each new attempt of a refused write (ms). On Windows the
 *  atomic replace -- the tmp file renamed over the store -- needs delete
 *  access to the target, and a process holding the file open without
 *  sharing it (an antivirus scan or an indexer reading the file just written)
 *  refuses it for a moment. The refused write was logged and DROPPED: the
 *  awaited persist resolved and the file kept the previous document
 *  (bookmark-page-numbers.spec.js read outlines.json back without the
 *  settings just written, Zotero 10 full run, 2026-11-20; a 250 ms hold
 *  reproduced it). Guard: test/lib-store.spec.js "a write refused while
 *  another process holds the file". The backups module's own writes, its
 *  removals of a store and its folder rename take the same delays
 *  (wvStoreRetry; 2026-11-28). */
const WV_STORE_WRITE_RETRY_MS = [100, 300, 1000];

/** Run `op`, and again after each refusal, WV_STORE_WRITE_RETRY_MS apart; the
 *  last refusal is thrown. Each retry is logged ("[Weavero] <what> refused,
 *  retrying (<path>)"). `settle`, when given, runs after every refusal: it
 *  looks at what the refused attempt left and answers "done" (it landed after
 *  all) or "retry", or throws to refuse a retry into a state the operation
 *  must not run on. ONE copy of the retry: the stores' writes (wvStoreWrite)
 *  and the backups' (modules/backups.ts), whose store replace, store removal
 *  and folder rename had none -- one of them was refused once during a
 *  staged restore, and the restore was undone and used up (backups.spec.js,
 *  Zotero 11 full run, 2026-11-28). */
export async function wvStoreRetry(what: string, path: string, op: () => Promise<any>, settle?: (e: any) => Promise<"done" | "retry">): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try { await op(); return; }
        catch (e) {
            if (settle && (await settle(e)) === "done") return;
            if (attempt >= WV_STORE_WRITE_RETRY_MS.length) throw e;
            try { Zotero.debug("[Weavero] " + what + " refused, retrying (" + path + "): " + e); } catch (_) {}
            await new Promise((r) => setTimeout(r, WV_STORE_WRITE_RETRY_MS[attempt]));
        }
    }
}

/** Issue an atomic, serialised write of `doc` to `path`. The snapshot is
 *  taken NOW; the I/O runs on the path's chain. Returns the chain so a
 *  caller can await durability; it never rejects. */
export function wvStoreWrite(path: string, doc: any, opts?: WvStoreWriteOptions): Promise<void> {
    const pretty = (opts && opts.pretty !== undefined) ? opts.pretty : 2;
    const snapshot = JSON.stringify(doc, null, pretty === null ? undefined : pretty);
    const rotate = opts && opts.rotateBak;
    const wopts: any = { tmpPath: path + ".tmp" };
    if (opts && opts.compress) wopts.compress = true;
    const chains = wvStoreChains();
    const next = (chains[path] || Promise.resolve())
        .catch(() => {})
        .then(async () => {
            await wvStoreGate();
            await IOUtils.makeDirectory(PathUtils.parent(path) as string, { ignoreExisting: true });
            if (rotate) {
                let prev: any = null;
                try { prev = JSON.parse(await IOUtils.readUTF8(path)); } catch (e) {}   // none / unreadable: nothing to rotate
                try { if (rotate(prev)) await IOUtils.copy(path, path + ".bak"); } catch (e) {}
            }
            await wvStoreRetry("store write", path, () => IOUtils.writeUTF8(path, snapshot, wopts));
        })
        .catch((e: any) => { try { Zotero.debug("[Weavero] store write failed (" + path + "): " + e); } catch (_) {} })
        .then(() => {
            try {
                const t = wvStoreChainsIf();
                if (t && t[path] === next) {
                    delete t[path];
                    if (!Object.keys(t).length) delete (Zotero as any)._wvStoreChains;
                }
            } catch (_) {}
        });
    chains[path] = next;
    return next;
}

/** Read and parse `path`; see the module comment for the three failure
 *  answers. Never throws. */
export async function wvStoreRead(path: string, opts?: WvStoreReadOptions): Promise<WvStoreReadResult> {
    const retries = (opts && opts.retries != null) ? opts.retries : 1;
    const retryDelay = (opts && opts.retryDelay != null) ? opts.retryDelay : 300;
    const onParseError = (opts && opts.onParseError) || "move-aside";
    const lz4 = !!(opts && opts.decompress);
    try { await wvStoreGate(); } catch (e) {}
    try { await wvStoreChain(path); } catch (e) {}
    let exists = false;
    try { exists = await IOUtils.exists(path); } catch (e) {}
    if (!exists) return { status: "missing", doc: null };
    // Zotero's own reader (not IOUtils.readUTF8): what every store used, and
    // what the suite can stub to simulate a transient read failure. A
    // compressed file goes through IOUtils, the only reader of mozlz4.
    let text: string | null = null, readErr: any = null, undecodable = false;
    for (let attempt = 0; attempt <= retries && text == null && !undecodable; attempt++) {
        try {
            text = lz4 ? String(await IOUtils.readUTF8(path, { decompress: true } as any)) : String(await (Zotero as any).File.getContentsAsync(path));
            readErr = null;
        }
        catch (e) {
            readErr = e;
            // Its bytes read, its content does not decompress: a corrupt file,
            // never a lock (a lock refuses the plain read as well).
            if (lz4) { try { await IOUtils.read(path, { maxBytes: 16 } as any); undecodable = true; break; } catch (e2) {} }
            if (attempt < retries) await new Promise((r) => setTimeout(r, retryDelay));
        }
    }
    if (text == null && !undecodable) {
        try { Zotero.debug("[Weavero] store unreadable, kept (" + path + "): " + readErr); } catch (_) {}
        return { status: "io-error", doc: null, error: readErr };
    }
    try {
        if (undecodable) throw readErr;
        return { status: "ok", doc: JSON.parse(text as string) };
    }
    catch (e) {
        let movedTo: string | undefined;
        if (onParseError === "move-aside") {
            movedTo = path + ".corrupt-" + Date.now();
            try { await IOUtils.move(path, movedTo); } catch (e2) { movedTo = undefined; }
        }
        try { Zotero.debug("[Weavero] store corrupt (" + path + ")" + (movedTo ? ", backed up to " + movedTo : "") + ": " + e); } catch (_) {}
        return { status: "parse-error", doc: null, error: e, movedTo };
    }
}

/** Remove `path` (absent is fine), after its pending writes. */
export async function wvStoreRemove(path: string): Promise<void> {
    try { await wvStoreGate(); } catch (e) {}
    try { await wvStoreChain(path); } catch (e) {}
    try { await IOUtils.remove(path, { ignoreAbsent: true }); } catch (e) {}
}
