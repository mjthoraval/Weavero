// Method wrappers on long-lived Zotero objects (a window's `Zotero_Tabs`,
// an itemsView, a singleton) with the src-ts.md wire-stamp contract built
// in, plus LAYERS: several features may wrap one member (`Zotero_Tabs.close`
// carries the restore tracing and the last-view guard).
//
// The host keeps one table, `host._wvWraps[member] = { native, own, recs, chain, stubs }`:
// the NATIVE function captured at the first wrap, whether it was an own
// property (restore on unwrap) or a prototype method (delete, so the
// prototype shows through), the layer records `{ layer, tag, make }` in
// install order, the CHAIN they make over the native, and the STUBS put in
// the member's slot. Every change rebuilds the chain from the native, so:
//  - a layer from another INSTANCE (foreign tag: a reload, an upgrade) is
//    dropped at the next wrap -- never stacked on, never left acting;
//  - unwrapping an inner layer re-applies the outer ones on the native;
//  - unwrapping the last layer restores the member exactly.
// `make(orig)` returns the wrapper for the function below it; inside, use
// `orig.apply(this, arguments)` (or `.call(host, ...)`) and resolve the
// live plugin with `wvLivePlugin()`, never a captured `this`.
//
// THE SLOT HOLDS A STUB, NEVER THE CHAIN. Another plugin may wrap a member over
// Weavero's: "Saved Search Folders" 1.1 replaces nine members of the collections tree
// with functions that call what it found there, Weavero's included (2026-11-27,
// work/ssf-coexistence-2026-11-26.md F1/F2). Writing a rebuilt chain into the slot threw
// its patches away: at every tree refresh (its folders lost their twisty), at every
// reload, update or disable of Weavero (its folders vanished while it believed itself
// active). So a stub stands in the slot and runs the entry's chain as it is at CALL
// time -- or, with no layer left, what is below Weavero (a pass-through). A change of
// layers rebuilds the chain only. The slot is written only while it holds one of our
// stubs or what is below our layers; a foreign function there holds our stub inside it:
// it stays, and at the last unwrap so does the entry ("parked"), so the next instance's
// layers go back in at the same place, through the stub that function calls. A stub of
// an older instance found in the slot again (the other plugin's shutdown puts back what
// it found, after a Weavero reload the previous instance's stub) is replaced by this
// instance's at the next wrap or `wvWrapSettle`. Guard: test/zz-ssf-coexist.spec.js
// (A, B, B+C, D) and test/lib-helpers.spec.js (wvWrap).
// A stub another plugin captured lives in Weavero's scope: on a Zotero that nukes a
// stopped plugin's scope (zotero#6080, 10 s after unload) it would be a dead object
// inside that plugin's function, thrown on at every call. There, the instance that
// goes takes the slot back at its last unwrap, as before -- the other plugin's function
// is dropped (its patch lost, Zotero's tree intact); on a Zotero that keeps the scope
// the parked stub is a pass-through, called but harmless.

import { wvWireOwnerNoteWrap } from "./wire-owner";
import { wvLivePlugin } from "./live";

interface WvWrapRec { layer: string; tag: string; make: (orig: any) => any }
interface WvWrapStub { fn: any; tag: string }
interface WvWrapEntry { native: any; own: boolean; recs: WvWrapRec[]; chain: any; stubs: WvWrapStub[] }

declare const Components: any;

// THE TABLE LIVES IN THE HOST'S COMPARTMENT, not the plugin's. Under
// zotero#6080 a plugin's scope is nuked 10 s after unload: every object it
// made becomes a dead wrapper. A table made by the old instance then threw
// "can't access dead object" at the next instance's wrap and unwrap, and the
// wraps it held -- `native` included -- could never be peeled: after a reload
// and a disable, ZoteroPane.serializePersist / unserializePersist,
// Zotero_Tabs.updateSidebarLayout, ZoteroContextPane.update and the context
// pane's _handleTabSelect stayed Weavero's (canary 40b5f3a1, 2026-11-22). Made
// with the host's own Object / Array, the table, its entries and the records'
// strings survive; only the old instance's `make` functions (and its chain and
// stubs) die, and a dead one is skipped (its layer is foreign anyway). Guard:
// test/zotero-api-shapes.spec.js.
// Only a CHROME host (a system-principal global: Zotero's xpcom objects, the
// main and reader windows' chrome objects): a content host (a page reached
// through an Xray) keeps a table of the plugin's own, as it always did -- an
// Xray would not hand back the functions stored on a content object.
function hostGlobal(host: any): any {
    try {
        const Cu = Components.utils;
        const g = Cu.getGlobalForObject(host);
        if (!g || typeof g.Object !== "function" || typeof g.Array !== "function") return null;
        const p = Cu.getObjectPrincipal(g);
        return p && p.isSystemPrincipal ? g : null;
    }
    catch (e) {}
    return null;
}

function hostObj(host: any): any {
    const g = hostGlobal(host);
    return g ? g.Object.create(null) : Object.create(null);
}

function hostArr<T>(host: any, items: T[]): T[] {
    const g = hostGlobal(host);
    const a: any = g ? new g.Array() : [];
    for (const r of items) a.push(r);
    return a;
}

function hostRec(host: any, layer: string, tag: string, make: (orig: any) => any): WvWrapRec {
    const r: any = hostObj(host);
    r.layer = layer;
    r.tag = tag;
    r.make = make;
    return r;
}

function hostStub(host: any, fn: any, tag: string): WvWrapStub {
    const s: any = hostObj(host);
    s.fn = fn;
    s.tag = tag;
    return s;
}

function isDead(v: any): boolean {
    try { return !!v && Components.utils.isDeadWrapper(v); }
    catch (e) { return false; }
}

const own = (o: any, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function wvWrapTable(host: any): Record<string, WvWrapEntry> {
    // The host's OWN table: an instance of a wrapped prototype inherits
    // `_wvWraps` through the chain, and sharing it would put an instance's
    // layers into the class's entry (2026-11-02: a class-level wrap of
    // attachment-preview's setPreviewStatus took REG41's instance layer in,
    // so unwrapping either would have rebuilt the prototype with the
    // other's instance-bound wrapper).
    if (own(host, "_wvWraps") && isDead(host._wvWraps)) {
        // A table an older build made in its own (now nuked) scope: nothing in it
        // can be read any more. Start afresh; the member keeps what it has.
        try { delete host._wvWraps; } catch (e) {}
    }
    if (!own(host, "_wvWraps")) host._wvWraps = hostObj(host);
    return host._wvWraps;
}

/** What is below Weavero's layers, as the chain's base. An own member: the native.
 *  A member that came from the PROTOTYPE: what the prototype holds at CALL time,
 *  not the function captured at the first wrap, so a class layer put on later is
 *  not skipped for good (2026-11-27: each window's collectionsView.notify
 *  "selectGuard" layer kept the class notify of its wiring time, and the
 *  saved-search folders' class layer, wired after it, never ran there -- added
 *  and renamed searches stayed out of their folders). Guard:
 *  test/lib-helpers.spec.js (wvWrap).
 *  Spread, never apply(this, arguments): a host in a content compartment (the reader's
 *  PDFDocumentData, resource://zotero) cannot read a chrome argument list -- every page the
 *  reader composed lost its link areas (no citation hover or click on a PDF's own links,
 *  1.3.0-paneorg.4, 2026-11-27; the same trap cite-zones.ts's layer notes). */
function wvWrapBase(host: any, member: string, e: WvWrapEntry): any {
    if (e.own) return e.native;
    const nat = e.native;
    return function (this: any, ...args: any[]) {
        let now: any = null;
        try { const p = Object.getPrototypeOf(host); now = p ? p[member] : null; } catch (err) {}
        return (typeof now === "function" ? now : nat).call(this, ...args);
    };
}

function wvWrapRebuild(host: any, member: string, e: WvWrapEntry): void {
    let fn = wvWrapBase(host, member, e);
    let n = 0;
    for (const r of e.recs) {
        if (isDead(r.make)) continue;
        fn = r.make(fn);
        n++;
    }
    e.chain = n ? fn : null;
}

/** The function the slot holds: the entry's chain at call time, else (no layer left:
 *  this instance's teardown, or a reload's gap) what is below Weavero's layers. */
function wvWrapStub(host: any, member: string, e: WvWrapEntry, tag: string): any {
    const stub: any = function (this: any, ...args: any[]) {
        const c = e.chain;
        if (typeof c === "function") return c.call(this, ...args);
        if (e.own) return e.native.call(this, ...args);
        let now: any = null;
        try { const p = Object.getPrototypeOf(host); now = p ? p[member] : null; } catch (err) {}
        return (typeof now === "function" ? now : e.native).call(this, ...args);
    };
    try { stub._wvTag = tag; } catch (err) {}
    return stub;
}

/** The slot holds nothing of Weavero's: what is below its layers (the native of an
 *  own member; the prototype's member showing through), or nothing alive. */
function wvWrapBelow(host: any, member: string, e: WvWrapEntry, slot: any): boolean {
    if (typeof slot !== "function" || isDead(slot)) return true;
    return e.own ? slot === e.native : !own(host, member);
}

function wvWrapStubOf(e: WvWrapEntry, slot: any): WvWrapStub | null {
    for (const s of Array.from(e.stubs || [])) { if (s && s.fn === slot) return s; }
    return null;
}

/** A function of ANOTHER Weavero instance in the slot, not one of the entry's stubs: an
 *  older build's own wrapper (stamped `_wvTag`) put back by the other plugin's shutdown
 *  -- Weavero's, stale: taken like a stub of another tag. */
function wvWrapStale(slot: any, tag: string): boolean {
    try { const t = typeof slot === "function" && !isDead(slot) ? slot._wvTag : null; return typeof t === "string" && t !== tag; }
    catch (e) { return false; }
}

/** This instance's stub into the slot when the slot is Weavero's (a stub of another
 *  tag) or holds what is below its layers; a foreign function is left where it is
 *  (Weavero's stub is inside it and runs the new chain). `legacy`: an entry from a
 *  build before the stubs, whose slot holds that build's chain -- taken, as that
 *  build did. True when a stub went in. */
function wvWrapPlace(host: any, member: string, e: WvWrapEntry, tag: string, legacy: boolean): boolean {
    let slot: any;
    try { slot = host[member]; } catch (err) { slot = undefined; }
    const mine = wvWrapStubOf(e, slot);
    if (mine) { if (mine.tag === tag) return false; }
    else if (!legacy && !wvWrapStale(slot, tag) && !wvWrapBelow(host, member, e, slot)) return false;
    const stub = wvWrapStub(host, member, e, tag);
    host[member] = stub;
    // The last few: an older stub may still sit in another plugin's function and come
    // back to the slot at its shutdown (one per instance; an unknown one stays where it
    // is and still runs the live chain).
    const keep: WvWrapStub[] = Array.from(e.stubs || []).slice(-7);
    keep.push(hostStub(host, stub, tag));
    e.stubs = hostArr(host, keep);
    return true;
}

/** Zotero nukes a stopped plugin's scope (zotero#6080; Zotero.Plugins.getBaseURI, the
 *  sign test/zz-stale-instance-calls.spec.js reads). */
function wvScopeNuked(): boolean {
    try { const P: any = (Zotero as any).Plugins; return !!(P && P.getBaseURI); }
    catch (e) { return false; }
}

/** The instance that laid `tag`'s layers is going (destroy(), a reload): no live plugin,
 *  or one of another tag. */
function wvTagGoing(tag: string): boolean {
    try { const p: any = wvLivePlugin(); return !p || typeof p._wvWireTag !== "function" || p._wvWireTag() !== tag; }
    catch (e) { return true; }
}

/** An entry from a build before the stubs: give it the fields; true when it was one. */
function wvWrapLegacy(host: any, e: WvWrapEntry): boolean {
    if (e.stubs) return false;
    e.stubs = hostArr(host, []);
    e.chain = null;
    return true;
}

/** Wrap `host[member]` as layer `layer` under the instance `tag`
 *  (`this._wvWireTag()`). Returns false when this layer is already
 *  installed under this tag (idempotent), true when it (re)wrapped. */
export function wvWrap(host: any, member: string, layer: string, tag: string, make: (orig: any) => any): boolean {
    if (!host || typeof host[member] !== "function") return false;
    const T = wvWrapTable(host);
    let e = T[member];
    if (!e) {
        const ne: any = hostObj(host);
        ne.native = host[member];
        ne.own = own(host, member);
        ne.recs = hostArr(host, []);
        ne.chain = null;
        ne.stubs = hostArr(host, []);
        e = T[member] = ne;
    }
    const legacy = wvWrapLegacy(host, e!);
    const recs: WvWrapRec[] = Array.from(e!.recs);
    const cur = recs.find((r) => r.layer === layer);
    if (cur && cur.tag === tag) {
        // Installed under this tag: at most the slot wants this instance's stub back.
        if (legacy) wvWrapRebuild(host, member, e!);
        wvWrapPlace(host, member, e!, tag, legacy);
        return false;
    }
    // Foreign layers (dead instances) and this layer's old record go; the
    // live instance's other layers stay in their order.
    const keep = recs.filter((r) => r.layer !== layer && r.tag === tag);
    keep.push(hostRec(host, layer, tag, make));
    e!.recs = hostArr(host, keep);
    wvWrapRebuild(host, member, e!);
    wvWrapPlace(host, member, e!, tag, legacy);
    // The wiring entry running, if any, owns this layer (lib/wire-owner.ts).
    try { wvWireOwnerNoteWrap(host, member, layer, tag); } catch (err) {}
    return true;
}

/** Remove layer `layer` from `host[member]` -- or every layer with no
 *  `layer` -- rebuilding the remaining chain on the native. Returns false
 *  when nothing was wrapped. With the last layer gone, the member is
 *  restored -- unless another plugin's function holds the slot (it wrapped
 *  Weavero's stub): that one stays, and Weavero's stub inside it passes
 *  straight through to what is below (2026-11-27, F2). */
export function wvUnwrap(host: any, member: string, layer?: string): boolean {
    if (!host || !own(host, "_wvWraps")) return false;
    const T = host._wvWraps;
    if (isDead(T)) { try { delete host._wvWraps; } catch (err) {} return false; }
    const e: WvWrapEntry = T[member];
    if (!e) return false;
    const legacy = wvWrapLegacy(host, e);
    const before = Array.from(e.recs);
    const tag = before.length ? before[before.length - 1].tag : "";
    e.recs = hostArr(host, layer ? before.filter((r) => r.layer !== layer) : []);
    if (e.recs.length) {
        wvWrapRebuild(host, member, e);
        const left = Array.from(e.recs);
        wvWrapPlace(host, member, e, left[left.length - 1].tag, legacy);
        return true;
    }
    e.chain = null;
    let slot: any;
    try { slot = host[member]; } catch (err) { slot = undefined; }
    // Parked: the entry stays for the next instance; the slot is the other plugin's --
    // but for a going instance on a Zotero that nukes its scope (see the header).
    const foreign = !legacy && !wvWrapStubOf(e, slot) && !wvWrapStale(slot, tag) && !wvWrapBelow(host, member, e, slot);
    if (foreign && !(wvScopeNuked() && wvTagGoing(tag))) return true;
    try {
        if (e.own) host[member] = e.native;
        else delete host[member];
    }
    catch (err) {}
    delete T[member];
    if (!Object.keys(T).length) { try { delete host._wvWraps; } catch (err) {} }
    return true;
}

/** Every wrapped member of `host`: this instance's stub back in a slot that holds an
 *  older stub of Weavero's (another plugin's shutdown restores what it found there --
 *  after a Weavero reload, the previous instance's stub: the previous scope, kept
 *  called, 2026-11-27 F3) or what is below Weavero's layers. A foreign function stays.
 *  Cheap; run where such a restore is followed by a refresh (group-fold.ts, each pane
 *  tree's rows rebuilt). */
export function wvWrapSettle(host: any): void {
    try {
        if (!host || !own(host, "_wvWraps")) return;
        const T = host._wvWraps;
        if (isDead(T)) return;
        for (const m of Object.keys(T)) {
            const e: WvWrapEntry = T[m];
            const recs = e && e.recs ? Array.from(e.recs) : [];
            if (!recs.length) continue;
            const legacy = wvWrapLegacy(host, e);
            if (legacy) wvWrapRebuild(host, m, e);
            wvWrapPlace(host, m, e, recs[recs.length - 1].tag, legacy);
        }
    }
    catch (err) {}
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
