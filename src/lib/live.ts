// The one way to reach the running plugin from code that outlives an
// instance: wrappers on Zotero objects, listeners on long-lived DOM, timers.
//
// A hot reload or a disable replaces or removes `Zotero.Weavero.plugin`,
// and a wrapper that captured `this` / `self` at wire time keeps a DEAD
// instance acting (survey 2026-10-06 §3.2: eleven `|| self` / `|| this`
// fallbacks did exactly that -- a torn-down instance's popup store, drag
// state and reader hold kept answering). Null means "no live plugin": do
// the native thing, never fall back to a captured instance.

/** The live plugin instance, or null when absent or torn down. */
export function wvLivePlugin(): any {
    try {
        const ns: any = (Zotero as any).Weavero;
        const p = ns && ns.plugin;
        return (p && !p._wvDestroyed) ? p : null;
    }
    catch (e) {
        return null;
    }
}
