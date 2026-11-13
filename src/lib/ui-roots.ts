// Zotero.UIProperties roots (View -> Font Size and Density reach registered
// roots only), and what a closed window leaves behind in Zotero.
//
// Zotero keeps each registered root as a WeakRef in `UIProperties._roots`
// (uiProperties.js) and drops one only when its deref() comes back empty. For
// Gecko's cycle collector a WeakRef holds its target (see lib/listen.ts, WEAK
// FOR THE GC): a registered root keeps its document and its window, and the
// deref() never comes back empty. Every reader window Weavero gave an item
// pane stayed in memory after it closed, with its frames; so did every main
// window closed while Zotero kept running (zoteroPane.js registers two roots
// per window). Measured 2026-11-12, test/reader-leak.spec.js. So Weavero
// registers through wvUIRoot, and drops the entries whose root is gone: in a
// closing or closed window, or a Weavero root taken out of its document.
//
// WV-TEMP-UIROOTS: the entries of Zotero's own roots in a closed window go too,
// and a closed main window's observers (wvReleaseClosedMainWindow). Retire
// when Zotero lets go of them itself: uiProperties.js drops a closed window's
// roots, zoteroPane.js removes `_reloadObserver` from both topics (10.0.8:
// "zotero-reloaded" only; main has both), standalone.js removes
// `gXPInstallObserver` (never removed, 10.0.8 and main).

import { winOf } from "./dom";
import { wvListen } from "./listen";
import { wvWrap, wvUnwrap } from "./wrap";

/** Register `root` with Zotero.UIProperties, and drop it again when its window
 *  unloads. `tag` is the instance's wire tag. */
export function wvUIRoot(root: any, tag: string): void {
    const UIP: any = (Zotero as any).UIProperties;
    if (!UIP || !root) return;
    try { root._wvUIRoot = true; } catch (e) {}
    UIP.registerRoot(root);
    hookRootWindow(root, tag);
}

function hookRootWindow(root: any, tag: string): void {
    const win: any = winOf(root);
    if (!win) return;
    // "lazy:": wired with a root's first registration, not by every instance
    // (zz-reload-listeners.spec.js).
    wvListen(win, "lazy:uiRoots:unload", "unload", (e: any) => {
        try {
            if (e && e.target && e.target !== win.document) return;
            wvUIRootsPrune(win.document);
        }
        catch (er) {}
    }, false, tag);
}

/** At init: the unload hook again for the roots a previous instance registered
 *  (a reload removed its listener with it). */
export function wvUIRootsRehook(tag: string): void {
    let roots: any = null;
    try { roots = (Zotero as any).UIProperties._roots; } catch (e) {}
    if (!roots || typeof roots.forEach !== "function") return;
    for (const ref of Array.from(roots) as any[]) {
        try {
            const r: any = ref && typeof ref.deref === "function" ? ref.deref() : null;
            if (r && r._wvUIRoot && r.isConnected) hookRootWindow(r, tag);
        }
        catch (e) {}
    }
}

/** Drop the UIProperties entries whose root is gone: collected, a dead
 *  wrapper, in `closingDoc` or a closed window, or a Weavero root out of its
 *  document. Returns how many went. */
export function wvUIRootsPrune(closingDoc?: any): number {
    let roots: any = null;
    try { roots = (Zotero as any).UIProperties._roots; } catch (e) {}
    if (!roots || typeof roots.delete !== "function") return 0;
    let n = 0;
    for (const ref of Array.from(roots) as any[]) {
        let gone = false;
        try {
            const r: any = ref && typeof ref.deref === "function" ? ref.deref() : null;
            if (!r) gone = true;
            else {
                const d: any = r.ownerDocument;
                const w: any = d && d.defaultView;
                if ((closingDoc && d === closingDoc) || !w || w.closed) gone = true;
                else if (r._wvUIRoot && !r.isConnected) gone = true;
            }
        }
        catch (e) {
            gone = true;   // a dead wrapper
        }
        if (gone) { try { roots.delete(ref); n++; } catch (e) {} }
    }
    return n;
}

// The observers a main window's scripts add and do not remove (WV-TEMP-UIROOTS):
// zoteroPane.js `_reloadObserver` (10.0.8 removes it from "zotero-reloaded"
// only) and standalone.js `gXPInstallObserver` (never removed). Each is a JS
// object of the window's own scope, so the observer service kept the closed
// window alive. Neither is reachable from outside the window, and what
// enumerateObservers hands back is an opaque wrapper (its scope cannot be
// read), so each window is given its own by the order they were added in
// (settleClaims).
const OBS_GROUPS: Array<{ key: string; topics: string[] }> = [
    { key: "_wvObsReload", topics: ["zotero-reloaded", "zotero-before-reload"] },
    { key: "_wvObsXpi", topics: ["addon-install-disabled", "addon-install-started", "addon-install-blocked", "addon-install-failed", "addon-install-complete"] },
];

function observersOn(topic: string): any[] {
    const out: any[] = [];
    const en: any = Services.obs.enumerateObservers(topic);
    while (en.hasMoreElements()) out.push(en.getNext());
    return out;
}

// Which observer is whose: enumerateObservers lists a topic's observers newest
// first (checked on 10.0.8 and 11.0-beta.4, 2026-11-12), and each main window
// adds one per group at its load. So the unclaimed observers of a group, in
// that order, are those of the unclaimed windows, newest window first -- once
// there are as many of one as of the other. More observers than windows: the
// oldest belong to windows closed before the plugin could claim (before it
// started); they are marked as nobody's and left (each is one Zotero keeps for
// good anyway). Fewer: a window has not registered yet; tried again.
const notNew: Record<string, Set<any>> = {};
const ORDER_KEY = "_wvWinOrder";
let orderSeq = 0;

/** A window's place in the order the main windows were opened (noted once). */
function orderOf(w: any): number {
    try {
        if (!w[ORDER_KEY]) {
            let id = 0;
            try { id = Number(w.docShell.outerWindowID) || 0; } catch (e) {}
            w[ORDER_KEY] = id || (1e12 + ++orderSeq);
        }
        return w[ORDER_KEY];
    }
    catch (e) {
        return 0;
    }
}

/** Give every unclaimed window of `wins` its observers where the counts allow
 *  it. Returns false while some window still has none. */
function settleClaims(wins: any[]): boolean {
    let done = true;
    for (const g of OBS_GROUPS) {
        const claimed = new Set(wins.map((w: any) => { try { return w[g.key]; } catch (e) { return null; } }).filter(Boolean));
        const old = notNew[g.key] || (notNew[g.key] = new Set());
        let common = observersOn(g.topics[0]);
        for (const t of g.topics.slice(1)) { const on = new Set(observersOn(t)); common = common.filter((o) => on.has(o)); }
        let fresh = common.filter((o) => !claimed.has(o) && !old.has(o));
        const open = wins.filter((w: any) => { try { return !w[g.key]; } catch (e) { return false; } })
            .sort((a: any, b: any) => orderOf(b) - orderOf(a));
        if (fresh.length > open.length) {
            for (const o of fresh.slice(open.length)) old.add(o);
            fresh = fresh.slice(0, open.length);
        }
        if (fresh.length < open.length) { done = false; continue; }
        open.forEach((w: any, i: number) => { try { w[g.key] = fresh[i]; } catch (e) {} });
    }
    return done;
}

/** At a main window's load (and at init for the windows already open): claim
 *  the observers the main windows' scripts added (see OBS_GROUPS), kept on
 *  each window for its close. Tried again for a few seconds: standalone.js
 *  adds its observer after an await. */
export function wvClaimMainWindowObservers(win: any, tries?: number): void {
    const n = tries || 0;
    let done = false;
    try {
        if (!win || win.closed) return;
        const wins: any[] = (Zotero.getMainWindows() || []).filter((w: any) => !w.closed);
        for (const w of wins) orderOf(w);
        done = settleClaims(wins);
    }
    catch (e) {}
    if (!done && n < 25) {
        try { win.setTimeout(() => wvClaimMainWindowObservers(win, n + 1), 200); } catch (e) {}
    }
}

/** For destroy(): drop the claims kept on the main windows, and the watch
 *  on Zotero.Prefs' and Zotero.Notifier's registerObserver. */
export function wvForgetMainWindowObservers(): void {
    for (const w of (Zotero.getMainWindows() || []) as any[]) {
        for (const g of OBS_GROUPS) { try { delete w[g.key]; } catch (e) {} }
        try { delete w[ORDER_KEY]; } catch (e) {}
        for (const x of WATCHED) { try { delete w[x.key]; } catch (e) {} }
        try { delete w[PQ_KEY]; } catch (e) {}
    }
    for (const k of Object.keys(notNew)) delete notNew[k];
    for (const x of WATCHED) { try { wvUnwrap((Zotero as any)[x.host], "registerObserver", "winObs"); } catch (e) {} }
    for (const q of progressQueues()) { try { wvUnwrap(q, "addListener", "winObs"); } catch (e) {} }
}

// Zotero.Prefs and Zotero.Notifier observers a main window's scripts register
// and do not remove (WV-TEMP-UIROOTS): 10.0.8's tagSelectorContainer.js keeps
// one id for its two pref observers (`_prefObserverID`, written twice), so the
// 'fontSize' one is never unregistered (main keeps both); zoteroPane.js
// initSyncReminders registers an 'api-key' notifier observer at startup and
// keeps no id (10.0.8 and main). Their handlers belong to the window's scope
// and kept the closed window. Both registries are out of reach, so the ids a
// main window's handlers get are noted on the window as they are registered,
// and unregistered at its close.
const WATCHED: Array<{ host: string; key: string; handlerArg: number }> = [
    { host: "Prefs", key: "_wvPrefObsIDs", handlerArg: 1 },
    { host: "Notifier", key: "_wvNotifierObsIDs", handlerArg: 0 },
];

/** The main window a handler belongs to, or null. */
function mainWindowOf(handler: any): any {
    try {
        const Cu = (Components as any).utils;
        let g: any = Cu.getGlobalForObject(handler);
        // A notifier observer is an object: its scope is its notify()'s too.
        if (g && !g.ZoteroPane && handler && typeof handler.notify === "function") g = Cu.getGlobalForObject(handler.notify);
        const de: any = g && g.ZoteroPane && g.document && g.document.documentElement;
        return de && de.getAttribute("windowtype") === "navigator:browser" ? g : null;
    }
    catch (e) {
        return null;
    }
}

// Zotero.ProgressQueues listeners too: 10.0.8's ZoteroPane.init adds an
// 'empty' and a 'nonempty' listener to every queue (its toolbar buttons) and
// never removes them (main moved the buttons; not checked there).
const PQ_KEY = "_wvPQListeners";

function progressQueues(): any[] {
    try {
        const PQ: any = (Zotero as any).ProgressQueues;
        return PQ && typeof PQ.getAll === "function" ? PQ.getAll() : [];
    }
    catch (e) {
        return [];
    }
}

/** Note, on the main window whose scope a handler belongs to, the id of each
 *  Zotero.Prefs and Zotero.Notifier observer registered from now on, and each
 *  progress-queue listener. */
export function wvWatchWindowObservers(tag: string): void {
    for (const q of progressQueues()) {
        wvWrap(q, "addListener", "winObs", tag, (orig: any) => function (this: any, ...args: any[]) {
            const r = orig.apply(this, args);
            try {
                const win = mainWindowOf(args[1]);
                if (win) (win[PQ_KEY] || (win[PQ_KEY] = [])).push([q, args[0], args[1]]);
            }
            catch (e) {}
            return r;
        });
    }
    for (const w of WATCHED) {
        const host: any = (Zotero as any)[w.host];
        if (!host) continue;
        wvWrap(host, "registerObserver", "winObs", tag, (orig: any) => function (this: any, ...args: any[]) {
            const id = orig.apply(this, args);
            try {
                const win = mainWindowOf(args[w.handlerArg]);
                if (win && id != null) (win[w.key] || (win[w.key] = [])).push(id);
            }
            catch (e) {}
            return id;
        });
    }
}

/** A main window is closing while Zotero runs on: let go of what its scripts
 *  left in Zotero -- its UIProperties roots, and the observers it claimed at
 *  load. Returns how many went. */
export function wvReleaseClosedMainWindow(win: any): number {
    if (!win) return 0;
    let doc: any = null;
    try { doc = win.document; } catch (e) {}
    let n = wvUIRootsPrune(doc);
    // A last chance for a window closed before its claim (with the others').
    try {
        const wins: any[] = (Zotero.getMainWindows() || []).filter((w: any) => w !== win && !w.closed);
        settleClaims(wins.concat([win]));
    }
    catch (e) {}
    for (const g of OBS_GROUPS) {
        let o: any = null;
        try { o = win[g.key]; } catch (e) {}
        if (!o) continue;
        for (const t of g.topics) { try { Services.obs.removeObserver(o, t); n++; } catch (e) {} }
        try { delete win[g.key]; } catch (e) {}
    }
    try { delete win[ORDER_KEY]; } catch (e) {}
    for (const x of WATCHED) {
        let ids: any[] = [];
        try { ids = win[x.key] || []; } catch (e) {}
        for (const id of ids) { try { (Zotero as any)[x.host].unregisterObserver(id); n++; } catch (e) {} }
        try { delete win[x.key]; } catch (e) {}
    }
    let pq: any[] = [];
    try { pq = win[PQ_KEY] || []; } catch (e) {}
    for (const [q, name, cb] of pq) { try { q.removeListener(name, cb); n++; } catch (e) {} }
    try { delete win[PQ_KEY]; } catch (e) {}
    return n;
}
