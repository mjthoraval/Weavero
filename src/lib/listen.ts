// Event listeners on LONG-LIVED targets -- a window, a document, a chrome
// element that outlives a render, a reader or note-editor frame -- with the
// src-ts.md wire-stamp contract built in: the listener sibling of wvWrap.
//
// The target keeps one table, `target._wvListen[key] = { type, fn, capture,
// tag }`:
//  - wiring `key` again under the same instance tag is a no-op;
//  - a record from another INSTANCE (a reload, an upgrade) is removed before
//    the new listener goes on. A boolean or hand-bumped stamp used to make
//    the new instance SKIP its wiring, so the previous build's handler kept
//    running until a restart; a listener with no stamp doubled instead.
// Each instance also keeps WEAK references to what it wired, and destroy()
// removes them all (`wvUnlistenAll`), so a disable leaves no listener and a
// reload hands the next instance a clean target. That second path is the
// one that reaches content documents (reader and note-editor frames): an
// expando set through an Xray is visible to the instance that set it only.
//
// A handler should still reach the plugin through wvLivePlugin() when it
// can run after its instance is gone (an event already being dispatched).

import { winOf } from "./dom";
import { wvWinType } from "./windows";

interface WvListenRec { type: string; fn: any; capture: boolean; tag: string }

// The registry: per wiring, WEAK references to the target, its table and
// the record. destroy() removes each listener through these -- never by
// re-reading `_wvListen` off the dereferenced target: a reader frame's
// table is written through its WAIVED wrapper (a real content property),
// and the wrapper a WeakRef hands back did not see it, so wvUnlistenAll
// removed nothing on reader frames (measured 2026-10-13: 46 chrome
// listeners removed, all 9 keyed on a live PDF frame left; the next
// instance's peel hid it, except on a page nothing re-wires -- a deck
// window's anchor -- and on a disable). Weak, so a closed window is not
// kept alive by its listener closures.
interface WvWired { ref: any; key: string; tag: string; tableRef: any; recRef: any }
const wired: WvWired[] = [];

// Tags whose instance was destroyed. A timer or retry chain of that instance
// can still fire after destroy() (sandbox timers are not cancelled), and a
// listener it wired then would never be removed: the reload audit caught
// the URL tip's 250 ms retry doing exactly that (wiring slice 3, 2026-10-12).
const dead: Set<string> = new Set();

declare const WeakRef: any;

function table(target: any): Record<string, WvListenRec> {
    return target._wvListen || (target._wvListen = Object.create(null));
}

/** An options object built here belongs to the plugin's (chrome) scope, and
 *  a CONTENT target -- a reader frame, through its waived wrapper -- cannot
 *  read its properties: addEventListener silently took the defaults, the
 *  URL tip's capture listeners went on as bubble ones, and every
 *  capture-phase removal missed them (they outlived each reload; wiring
 *  slice 3, 2026-10-12). The target gets its own copy. Exported for the
 *  few plain addEventListener calls left on content targets (a one-shot
 *  `{ once: true }` awaiting a frame's load). */
export function wvEventOpts(target: any, opts: any): any {
    if (!opts || typeof opts !== "object") return opts;
    try {
        // winOf, never a bare ownerGlobal (Firefox 153 renamed it; the
        // compat spec allows winOf's one fallback). A window is its own scope.
        const scope = winOf(target) || target;
        return (Components as any).utils.cloneInto(opts, scope);
    }
    catch (e) {
        return opts;
    }
}

/** Add `fn` for `type` on `target` as `key`, under the instance `tag`
 *  (`this._wvWireTag()`). `opts` is addEventListener's third argument.
 *  Returns false when `key` is already wired under this tag, or the tag's
 *  instance is destroyed. */
export function wvListen(target: any, key: string, type: string, fn: any,
    opts: boolean | { capture?: boolean; passive?: boolean } | undefined, tag: string): boolean {
    if (!target || typeof target.addEventListener !== "function" || dead.has(tag)) return false;
    const T = table(target);
    const cur = T[key];
    if (cur && cur.tag === tag) return false;
    if (cur) { try { target.removeEventListener(cur.type, cur.fn, cur.capture); } catch (e) {} }
    const capture = typeof opts === "boolean" ? opts : !!(opts && opts.capture);
    target.addEventListener(type, fn, wvEventOpts(target, opts));
    const rec: WvListenRec = { type, fn, capture, tag };
    T[key] = rec;
    try { wired.push({ ref: new WeakRef(target), key, tag, tableRef: new WeakRef(T), recRef: new WeakRef(rec) }); } catch (e) {}
    // Per-row listeners (related-box and annotation rows re-render all the
    // time) would grow the registry for the whole session: drop the entries
    // whose target is gone, now and then.
    if (wired.length >= 2000 && wired.length % 500 === 0) {
        const live = wired.filter((w) => { try { return !!w.ref.deref(); } catch (e) { return false; } });
        wired.length = 0;
        wired.push(...live);
    }
    return true;
}

/** `wvListen` bound to one instance tag -- `const on = wvListener(this.
 *  _wvWireTag())`, then `on(target, key, type, fn, opts)`: the drop-in shape
 *  for `target.addEventListener(type, fn, opts)` plus its key. */
export function wvListener(tag: string) {
    return (target: any, key: string, type: string, fn: any,
        opts?: boolean | { capture?: boolean; passive?: boolean }): boolean =>
        wvListen(target, key, type, fn, opts, tag);
}

/** Remove the listener wired as `key` on `target`, whatever instance wired
 *  it. Returns false when there was none. */
export function wvUnlisten(target: any, key: string): boolean {
    try {
        const T = target && target._wvListen;
        const cur = T && T[key];
        if (!cur) return false;
        try { target.removeEventListener(cur.type, cur.fn, cur.capture); } catch (e) {}
        delete T[key];
        if (!Object.keys(T).length) { try { delete target._wvListen; } catch (e) {} }
        return true;
    }
    catch (e) {
        return false;
    }
}

/** Remove every listener this instance wired under `tag` (destroy()), and
 *  refuse any it would wire later. Returns how many went. */
export function wvUnlistenAll(tag: string): number {
    dead.add(tag);
    let n = 0;
    // Entries under OTHER tags stay registered. This used to splice the
    // whole registry and drop them: a call with a scratch tag
    // (test/listen-frames.spec.js, on the live module) erased the live
    // instance's entries, and its destroy() later left every main-window
    // keyed listener it had wired before that call (full suite 2026-10-13:
    // 29, caught by wvSweepTagOnChrome).
    const keep: WvWired[] = [];
    for (const w of wired.splice(0)) {
        let target: any = null, T: any = null, rec: any = null;
        try { target = w.ref.deref(); T = w.tableRef.deref(); rec = w.recRef.deref(); } catch (e) {}
        if (!target || !rec) continue;   // gone: nothing to keep
        if (rec.tag !== tag) { keep.push(w); continue; }
        try { target.removeEventListener(rec.type, rec.fn, rec.capture); n++; } catch (e) {}
        try {
            if (T && T[w.key] === rec) {
                delete T[w.key];
                if (!Object.keys(T).length) { try { delete target._wvListen; } catch (e) {} }
            }
        }
        catch (e) {}
    }
    wired.push(...keep);
    return n;
}

/** destroy()'s second pass, after wvUnlistenAll: remove every record still
 *  under `tag` from the keyed tables of every CHROME window, its document
 *  and its elements -- whatever the registry holds. A chrome table is
 *  visible to every instance (no Xray), so this catches what the registry
 *  lost -- as it did when a call under another tag erased its entries (see
 *  wvUnlistenAll; full suite 2026-10-13, the outline click-focus capture
 *  outlived a reload). Returns what it removed ("where key", for the
 *  report): non-empty means the registry missed something. */
export function wvSweepTagOnChrome(tag: string): string[] {
    const out: string[] = [];
    const sweep = (t: any, where: string) => {
        let T: any = null;
        try { T = Object.prototype.hasOwnProperty.call(t, "_wvListen") ? t._wvListen : null; } catch (e) {}
        if (!T) return;
        for (const k of Object.keys(T)) {
            const r = T[k];
            if (!r || r.tag !== tag) continue;
            try { t.removeEventListener(r.type, r.fn, r.capture); } catch (e) {}
            delete T[k];
            out.push(where + " " + k);
        }
        if (!Object.keys(T).length) { try { delete t._wvListen; } catch (e) {} }
    };
    try {
        const en = Services.wm.getEnumerator(null);
        while (en.hasMoreElements()) {
            const w: any = en.getNext();
            let d: any = null;
            try { d = w.document; } catch (e) {}
            let wt = "";
            try { wt = (d && wvWinType(d)) || ""; } catch (e) {}
            sweep(w, wt + " window");
            if (!d) continue;
            sweep(d, wt + " document");
            try { for (const el of d.querySelectorAll("*")) sweep(el, wt + " " + (el.id ? "#" + el.id : el.localName)); } catch (e) {}
        }
    }
    catch (e) {}
    return out;
}

/** Remove every keyed listener on `target`, whatever instance wired it --
 *  for a page being torn down (a reader whose window stays open without
 *  it). Read through the same wrapper the wiring used. Returns how many. */
export function wvUnlistenAllOn(target: any): number {
    let n = 0;
    for (const k of wvListenKeys(target)) if (wvUnlisten(target, k.key)) n++;
    return n;
}

/** The keys wired on `target`, with their tags (for tests and leftover
 *  scans). */
export function wvListenKeys(target: any): Array<{ key: string; type: string; tag: string }> {
    try {
        const T = target && target._wvListen;
        return T ? Object.keys(T).map((k) => ({ key: k, type: T[k].type, tag: T[k].tag })) : [];
    }
    catch (e) {
        return [];
    }
}
