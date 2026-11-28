// Which wiring entry is wiring (ADR-0001, docs/adr/0001-each-wiring-entry-owns-its-undo.md).
//
// The main-window wiring table (modules/window-wiring.ts) runs each entry's wire()
// inside `wvWireOwnerRun(win, id, ...)`. While it runs, every listener wvListen adds
// (lib/listen.ts) and every wrap layer wvWrap installs (lib/wrap.ts) is RECORDED
// against that window and entry, with the instance tag it went on under. An entry
// whose undo is "auto" is unwired by removing exactly those records' listeners and
// layers -- the ones still carrying that tag: never another instance's.
//
// Only what the wire() installs SYNCHRONOUSLY is recorded: a listener or a layer added
// later, from a retry timer or a deferred pass, is not. An entry that wires that way
// keeps a hand-written unwire (the round-trip spec, test/window-unwire.spec.js, finds
// one that does not).
//
// A record keeps its target only when the target belongs to the owner window: the
// window itself, its document and elements, the objects made in its scope
// (Zotero_Tabs, ZoteroPane, its views, its classes' prototypes). Anything else (a
// Zotero singleton, another window) is kept as a label only: per-window undo must not
// touch it, and a reference to another window from here would keep that window alive
// after it closes (lib/listen.ts, "WEAK FOR THE GC"). The table is a WeakMap keyed by
// window, so a closed window takes its records with it; the runner drops them at its
// close anyway.

import { winOf } from "./dom";

declare const Components: any;

export interface WvOwnedRec {
    kind: "listen" | "wrap";
    /** The listener's target / the wrapped host; null for a foreign one. */
    target: any;
    /** listen: the key; wrap: the member. */
    key: string;
    /** wrap: the layer. */
    layer?: string;
    /** The instance tag it went on under. */
    tag: string;
    /** listen: what addEventListener was given (for the round-trip spec's census). */
    type?: string;
    fn?: any;
    capture?: boolean;
    /** Set when the target is not the owner window's: what it was, by name only. */
    foreign?: string;
}

const owners: Array<{ win: any; id: string }> = [];
const records: WeakMap<any, Map<string, WvOwnedRec[]>> = new WeakMap();

/** Run `fn` with entry `id` of window `win` as the owner of what it installs. */
export function wvWireOwnerRun<T>(win: any, id: string, fn: () => T): T {
    owners.push({ win, id });
    try { return fn(); }
    finally { owners.pop(); }
}

/** `target` belongs to window `win`: the window, a node of its document, or an
 *  object made in its scope. */
function ownedBy(target: any, win: any): boolean {
    try {
        if (target === win) return true;
        const w = winOf(target);
        if (w) return w === win;
        return Components.utils.getGlobalForObject(target) === win;
    }
    catch (e) {
        return false;
    }
}

function note(rec: WvOwnedRec): void {
    const o = owners[owners.length - 1];
    if (!o || !o.win) return;
    try {
        if (!ownedBy(rec.target, o.win)) {
            let what = "";
            try { what = (rec.target && (rec.target.id || (rec.target.constructor && rec.target.constructor.name))) || typeof rec.target; } catch (e) {}
            rec = { kind: rec.kind, target: null, key: rec.key, layer: rec.layer, tag: rec.tag, type: rec.type, foreign: String(what) };
        }
        let byId = records.get(o.win);
        if (!byId) { byId = new Map(); records.set(o.win, byId); }
        const list = byId.get(o.id) || [];
        // One record per target and key (and layer): a re-wire after an undo replaces it.
        const same = (r: WvOwnedRec) => r.kind === rec.kind && r.key === rec.key && r.layer === rec.layer
            && (r.target ? r.target === rec.target : (!rec.target && r.foreign === rec.foreign));
        byId.set(o.id, list.filter((r) => !same(r)).concat([rec]));
    }
    catch (e) {}
}

/** lib/listen.ts wvListen: listener `key` went on `target` under `tag`. */
export function wvWireOwnerNoteListen(target: any, key: string, type: string, fn: any, capture: boolean, tag: string): void {
    if (!owners.length) return;
    note({ kind: "listen", target, key, tag, type, fn, capture });
}

/** lib/wrap.ts wvWrap: layer `layer` went on `host[member]` under `tag`. */
export function wvWireOwnerNoteWrap(host: any, member: string, layer: string, tag: string): void {
    if (!owners.length) return;
    note({ kind: "wrap", target: host, key: member, layer, tag });
}

/** What entry `id` installed on window `win`, as recorded (a copy, install order). */
export function wvWireOwned(win: any, id: string): WvOwnedRec[] {
    try {
        const byId = records.get(win);
        return byId ? (byId.get(id) || []).slice() : [];
    }
    catch (e) {
        return [];
    }
}

/** The same, removed from the record (the entry is being unwired). */
export function wvWireOwnedTake(win: any, id: string): WvOwnedRec[] {
    const out = wvWireOwned(win, id);
    try { const byId = records.get(win); if (byId) byId.delete(id); } catch (e) {}
    return out;
}

/** Drop every record of window `win` (its close, or the instance's end). */
export function wvWireOwnedForget(win: any): void {
    try { records.delete(win); } catch (e) {}
}
