// Method wrappers on long-lived Zotero objects (a window's `Zotero_Tabs`,
// an itemsView, a singleton) with the src-ts.md wire-stamp contract built
// in, plus LAYERS: several features may wrap one member (`Zotero_Tabs.close`
// carries the restore tracing and the last-view guard).
//
// The host keeps one table, `host._wvWraps[member] = { native, own, recs }`:
// the NATIVE function captured at the first wrap, whether it was an own
// property (restore on unwrap) or a prototype method (delete, so the
// prototype shows through), and the layer records `{ layer, tag, make }` in
// install order. Every change rebuilds the chain from the native, so:
//  - a layer from another INSTANCE (foreign tag: a reload, an upgrade) is
//    dropped at the next wrap -- never stacked on, never left acting;
//  - unwrapping an inner layer re-applies the outer ones on the native;
//  - unwrapping the last layer restores the member exactly.
// `make(orig)` returns the wrapper for the function below it; inside, use
// `orig.apply(this, arguments)` (or `.call(host, ...)`) and resolve the
// live plugin with `wvLivePlugin()`, never a captured `this`.

interface WvWrapRec { layer: string; tag: string; make: (orig: any) => any }
interface WvWrapEntry { native: any; own: boolean; recs: WvWrapRec[] }

function wvWrapTable(host: any): Record<string, WvWrapEntry> {
    return host._wvWraps || (host._wvWraps = Object.create(null));
}

function wvWrapRebuild(host: any, member: string, e: WvWrapEntry): void {
    let fn = e.native;
    for (const r of e.recs) fn = r.make(fn);
    host[member] = fn;
}

/** Wrap `host[member]` as layer `layer` under the instance `tag`
 *  (`this._wvWireTag()`). Returns false when this layer is already
 *  installed under this tag (idempotent), true when it (re)wrapped. */
export function wvWrap(host: any, member: string, layer: string, tag: string, make: (orig: any) => any): boolean {
    if (!host || typeof host[member] !== "function") return false;
    const T = wvWrapTable(host);
    let e = T[member];
    if (!e) {
        e = T[member] = {
            native: host[member],
            own: Object.prototype.hasOwnProperty.call(host, member),
            recs: [],
        };
    }
    const cur = e.recs.find((r) => r.layer === layer);
    if (cur && cur.tag === tag) return false;
    // Foreign layers (dead instances) and this layer's old record go; the
    // live instance's other layers stay in their order.
    e.recs = e.recs.filter((r) => r.layer !== layer && r.tag === tag);
    e.recs.push({ layer, tag, make });
    wvWrapRebuild(host, member, e);
    return true;
}

/** Remove layer `layer` from `host[member]` -- or every layer with no
 *  `layer` -- rebuilding the remaining chain on the native. Returns false
 *  when nothing was wrapped. */
export function wvUnwrap(host: any, member: string, layer?: string): boolean {
    if (!host || !host._wvWraps) return false;
    const T = host._wvWraps;
    const e: WvWrapEntry = T[member];
    if (!e) return false;
    e.recs = layer ? e.recs.filter((r) => r.layer !== layer) : [];
    if (e.recs.length) {
        wvWrapRebuild(host, member, e);
        return true;
    }
    try {
        if (e.own) host[member] = e.native;
        else delete host[member];
    }
    catch (err) {}
    delete T[member];
    if (!Object.keys(T).length) { try { delete host._wvWraps; } catch (err) {} }
    return true;
}

/** The layers currently on `host[member]`, innermost first (for tests and
 *  leftover scans). */
export function wvWrapLayers(host: any, member: string): Array<{ layer: string; tag: string }> {
    try {
        const e = host && host._wvWraps && host._wvWraps[member];
        return e ? e.recs.map((r: WvWrapRec) => ({ layer: r.layer, tag: r.tag })) : [];
    }
    catch (e) {
        return [];
    }
}
