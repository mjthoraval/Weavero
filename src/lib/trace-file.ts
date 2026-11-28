// A persistent diagnostic ring: `<data dir>/weavero/<name>.json`, kept for a
// freeze that ends in a kill. MJT's filter froze Zotero twice on 2026-11-22
// and had to be killed; every in-memory trace (`Zotero._wvFilterTrace`, the
// perf ring) died with the process. The bugfix skill: "intermittent +
// user-reported = bake a persistent ring buffer into the build at FIRST
// report".
//
// Two properties are the point:
//  - an URGENT record's write is DISPATCHED before the caller goes on.
//    `IOUtils.writeUTF8` hands the I/O to its own background thread at the
//    call, so a record pushed just before the main thread blocks reaches the
//    disk while it is blocked (guard: test/filter-trace-file.spec.js, which
//    blocks the thread and watches the file appear). `wvStoreWrite` starts
//    its I/O from a promise continuation, which a blocked thread never runs.
//  - the PREVIOUS session's file is moved to `<name>.prev.json` before this
//    session's first write, so the record of a freeze survives the restart
//    that follows the kill.
//
// Bounded: at most `max` records (oldest dropped), at most one write in
// flight, non-urgent records flushed at most once per `gapMs`. Not a store:
// Weavero never reads it back (the stores go through lib/store.ts). The
// state lives on the Zotero global as plain data, so a plugin reload keeps
// the session's records and does not rotate again.

declare const Zotero: any;
declare const IOUtils: any;
declare const PathUtils: any;

interface WvTraceFileState {
    ring: any[];
    inflight: boolean;
    pending: boolean;
    lastWrite: number;
    timer: any;
    timerAt: number;
    ready: boolean;
    preparing: boolean;
    session: string;
}

export interface WvTraceFileOpts {
    urgent?: boolean;
    max?: number;
    gapMs?: number;
    build?: string;
    /** A non-urgent record of the same `ev` within this many ms of the last
     *  record folds into it (`rep` counts them, `tLast` is the latest): a
     *  sync's hundreds of notifications must not push the applies out. */
    coalesceMs?: number;
}

function wvTraceFileState(name: string): WvTraceFileState {
    const g: any = Zotero;
    const all = g._wvTraceFiles || (g._wvTraceFiles = Object.create(null));
    return all[name] || (all[name] = {
        ring: [], inflight: false, pending: false, lastWrite: 0, timer: null, timerAt: 0,
        ready: false, preparing: false, session: new Date().toISOString(),
    });
}

/** The file of trace `name` (`<data dir>/weavero/<name>.json`). */
export function wvTraceFilePath(name: string): string {
    return PathUtils.join(Zotero.DataDirectory.dir, "weavero", name + ".json");
}

/** The records pushed this session (for a spec or a probe). */
export function wvTraceFileRecords(name: string): any[] {
    return wvTraceFileState(name).ring.slice();
}

function wvTraceFileWrite(name: string, build: string) {
    const st = wvTraceFileState(name);
    if (!st.ready) { st.pending = true; return; }
    // A write whose completion never came back (its instance was unloaded
    // mid-write) must not block the file for the rest of the session.
    if (st.inflight && Date.now() - st.lastWrite < 10000) { st.pending = true; return; }
    st.inflight = true;
    st.pending = false;
    st.lastWrite = Date.now();
    const path = wvTraceFilePath(name);
    const text = '{"build":' + JSON.stringify(build || "") + ',"session":' + JSON.stringify(st.session)
        + ',"written":' + JSON.stringify(new Date().toISOString()) + ',"records":[\n'
        + st.ring.map((r) => JSON.stringify(r, (k, v) => (k === "_at" ? undefined : v))).join(",\n") + "\n]}\n";
    let p: any;
    try { p = IOUtils.writeUTF8(path, text, { tmpPath: path + ".tmp" }); }
    catch (e) { st.inflight = false; return; }
    Promise.resolve(p).catch(() => {}).then(() => {
        st.inflight = false;
        if (st.pending) wvTraceFileWrite(name, build);
    });
}

async function wvTraceFilePrepare(name: string, build: string) {
    const st = wvTraceFileState(name);
    if (st.ready || st.preparing) return;
    st.preparing = true;
    try {
        const path = wvTraceFilePath(name);
        await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
        // The previous session's records: kept once, before this session's
        // first write (a reload in the same session finds `ready` and skips).
        try {
            if (await IOUtils.exists(path)) await IOUtils.move(path, PathUtils.join(PathUtils.parent(path), name + ".prev.json"));
        } catch (e) {}
        st.ready = true;
    }
    catch (e) {}
    finally { st.preparing = false; }
    if (st.ready && st.ring.length) wvTraceFileWrite(name, build);
}

/** Add `rec` to trace `name` and write the file: at once when `urgent`
 *  (the write is dispatched before this returns), else at most once per
 *  `gapMs` (default 2 s). */
export function wvTraceFilePush(name: string, rec: any, opts?: WvTraceFileOpts) {
    try {
        const st = wvTraceFileState(name);
        const max = (opts && opts.max) || 300;
        const build = (opts && opts.build) || "";
        const last = st.ring.length ? st.ring[st.ring.length - 1] : null;
        const now = Date.now();
        if (opts && opts.coalesceMs && !opts.urgent && last && last.ev === rec.ev
            && now - (last._at || 0) <= opts.coalesceMs) {
            last.rep = (last.rep || 1) + 1;
            last.tLast = rec.t;
            last._at = now;
        }
        else {
            rec._at = now;
            st.ring.push(rec);
        }
        if (st.ring.length > max) st.ring.splice(0, st.ring.length - max);
        if (!st.ready) { wvTraceFilePrepare(name, build); return; }
        if (opts && opts.urgent) { wvTraceFileWrite(name, build); return; }
        const gap = (opts && opts.gapMs) || 2000;
        const due = st.lastWrite + gap - Date.now();
        if (due <= 0) { wvTraceFileWrite(name, build); return; }
        // A timer of an unloaded instance never fires: past its time, re-arm.
        if (st.timer == null || Date.now() > st.timerAt + 5000) {
            st.timerAt = Date.now() + due;
            st.timer = setTimeout(() => { st.timer = null; wvTraceFileWrite(name, build); }, due);
        }
    } catch (e) {}
}
