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
}

export interface WvStoreReadOptions {
    /** Extra read attempts after a failure (default 1), `retryDelay` ms apart. */
    retries?: number;
    retryDelay?: number;
    /** What to do with a file that reads but does not parse: move it aside
     *  (default) or keep it in place. */
    onParseError?: "move-aside" | "keep";
}

/** `<data dir>/weavero`. */
export function wvStoreDir(): string {
    return PathUtils.join((Zotero as any).DataDirectory.dir, "weavero");
}

/** `<data dir>/weavero/<name>`. */
export function wvStorePath(name: string): string {
    return PathUtils.join(wvStoreDir(), name);
}

function wvStoreChains(): Record<string, Promise<void>> {
    const Z: any = Zotero as any;
    return Z._wvStoreChains || (Z._wvStoreChains = Object.create(null));
}

/** The pending writes of `path` (resolved when there are none). */
export function wvStoreChain(path: string): Promise<void> {
    const c = wvStoreChains()[path];
    return c ? c.catch(() => {}) : Promise.resolve();
}

/** Issue an atomic, serialised write of `doc` to `path`. The snapshot is
 *  taken NOW; the I/O runs on the path's chain. Returns the chain so a
 *  caller can await durability; it never rejects. */
export function wvStoreWrite(path: string, doc: any, opts?: WvStoreWriteOptions): Promise<void> {
    const pretty = (opts && opts.pretty !== undefined) ? opts.pretty : 2;
    const snapshot = JSON.stringify(doc, null, pretty === null ? undefined : pretty);
    const rotate = opts && opts.rotateBak;
    const chains = wvStoreChains();
    const next = (chains[path] || Promise.resolve())
        .catch(() => {})
        .then(async () => {
            await IOUtils.makeDirectory(PathUtils.parent(path) as string, { ignoreExisting: true });
            if (rotate) {
                let prev: any = null;
                try { prev = JSON.parse(await IOUtils.readUTF8(path)); } catch (e) {}   // none / unreadable: nothing to rotate
                try { if (rotate(prev)) await IOUtils.copy(path, path + ".bak"); } catch (e) {}
            }
            await IOUtils.writeUTF8(path, snapshot, { tmpPath: path + ".tmp" });
        })
        .catch((e: any) => { try { Zotero.debug("[Weavero] store write failed (" + path + "): " + e); } catch (_) {} });
    chains[path] = next;
    return next;
}

/** Read and parse `path`; see the module comment for the three failure
 *  answers. Never throws. */
export async function wvStoreRead(path: string, opts?: WvStoreReadOptions): Promise<WvStoreReadResult> {
    const retries = (opts && opts.retries != null) ? opts.retries : 1;
    const retryDelay = (opts && opts.retryDelay != null) ? opts.retryDelay : 300;
    const onParseError = (opts && opts.onParseError) || "move-aside";
    try { await wvStoreChain(path); } catch (e) {}
    let exists = false;
    try { exists = await IOUtils.exists(path); } catch (e) {}
    if (!exists) return { status: "missing", doc: null };
    // Zotero's own reader (not IOUtils.readUTF8): what every store used, and
    // what the suite can stub to simulate a transient read failure.
    let text: string | null = null, readErr: any = null;
    for (let attempt = 0; attempt <= retries && text == null; attempt++) {
        try { text = String(await (Zotero as any).File.getContentsAsync(path)); readErr = null; }
        catch (e) {
            readErr = e;
            if (attempt < retries) await new Promise((r) => setTimeout(r, retryDelay));
        }
    }
    if (text == null) {
        try { Zotero.debug("[Weavero] store unreadable, kept (" + path + "): " + readErr); } catch (_) {}
        return { status: "io-error", doc: null, error: readErr };
    }
    try {
        return { status: "ok", doc: JSON.parse(text) };
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
    try { await wvStoreChain(path); } catch (e) {}
    try { await IOUtils.remove(path, { ignoreAbsent: true }); } catch (e) {}
}
