// The open main windows, one way (survey 2026-10-06 §4 #9).
//
// Fifty sites spelled `Zotero.getMainWindows ? Zotero.getMainWindows() :
// [...]` out by hand, with five different fallbacks ([], [getMainWindow()],
// `.filter(Boolean)` inside or outside the ternary, [win]). The fallback
// only ever ran on a Zotero without getMainWindows -- none Weavero supports
// (9, 10, 11 all have it) -- so the spellings differed for nothing.

/** Every open main window (`Zotero.getMainWindows()`), nulls dropped; the
 *  focused one alone on a Zotero without the plural getter. */
export function wvMainWins(): any[] {
    try {
        const Z: any = Zotero;
        const wins: any[] = typeof Z.getMainWindows === "function" ? Z.getMainWindows() : [Z.getMainWindow()];
        return (wins || []).filter(Boolean);
    }
    catch (e) {
        return [];
    }
}

/** Zotero has its own multiple windows and library tabs (zotero#6035, on main
 *  since 2026-11-07 at 65ece2cdf): a window of its own for a reader or a note,
 *  tabs that move between windows, every window saved and restored by Zotero.
 *  Weavero's window features built for one main window stand down:
 *  `_wvMultiMainOn()` is false, the window store neither reads nor writes
 *  (windows.json stays on disk, so they can come back), and `nativeOff` entries
 *  of the wiring table are skipped. Older Zotero keeps everything.
 *
 *  TWO signs, either is enough, because one name is not: this switch first read
 *  `Zotero.getAllMainWindows`, which the merge folded back into `getMainWindows`,
 *  and on the real commits it stayed off with no error (2026-11-07, caught by a
 *  grep before any release). Neither sign is in the omni.ja of Zotero 9, 10,
 *  11-beta.3 or main before the merge. A feature test, not a version: the work
 *  may reach any 11.x. Guard: the tripwire in test/native-windows.spec.js, which
 *  compares this with the library-view element itself. */
export function wvNativeWindows(): boolean {
    try {
        const Z: any = Zotero;
        return typeof Z.Prefs?.setForWindow === "function" || typeof Z.Session?.addClosedWindow === "function";
    }
    catch (e) {
        return false;
    }
}

/** The window setting that carries Weavero's own state of a window on a Zotero
 *  with its own windows: a JSON string, "" for none (modules/window-state.ts). */
export const WV_WINDOW_STATE_PREF = "weavero.windowState";

declare const Services: any;

/** The section open / collapsed settings a window can hold (`panes.<pane>.open`):
 *  its own sections, and every one Zotero has saved a state for. */
export function wvPaneOpenSettingNames(win: any): string[] {
    const out = new Set<string>();
    try {
        for (const s of win.document.querySelectorAll("collapsible-section[data-pane]")) out.add("panes." + s.dataset.pane + ".open");
    }
    catch (e) {}
    try {
        for (const p of Services.prefs.getChildList("extensions.zotero.panes.")) {
            if (/\.open$/.test(p)) out.add(p.replace(/^extensions\.zotero\./, ""));
        }
    }
    catch (e) {}
    return [...out];
}

/** The object a main window was opened with (`Zotero.openMainWindow(args)`),
 *  boxed through `wrappedJSObject` as zoteroPane.js getWindowArgs reads it;
 *  null for none. */
export function wvWindowArgs(win: any): any {
    try {
        let a = win && win.arguments && win.arguments[0];
        if (a && a.wrappedJSObject) a = a.wrappedJSObject;
        return a && typeof a === "object" ? a : null;
    }
    catch (e) {
        return null;
    }
}

/** A window opened for an Advanced Search on a Zotero with its own windows
 *  (zotero#6035): `openAdvancedSearchInNewWindow` -- Zotero's Shift+click on
 *  the funnel, and every route of Weavero's -- passes a library tab whose
 *  search is open and nothing else. A plain New Window carries only the
 *  collections, a torn-off library tab (its search may be open) comes with
 *  `geometry`, where it was dropped, a restored or reopened window with
 *  `sessionState`. Read in Zotero main at 228f132e1: libraryView.js 1431-1476,
 *  zoteroPane.js 1974-2031, tabs.js 212-216. */
export function wvAdvSearchWindowArgs(args: any): boolean {
    try {
        if (!args || typeof args !== "object") return false;
        if (args.geometry || args.sessionState || args.movedTab) return false;
        const adv = args.libraryTabState && args.libraryTabState.advancedSearch;
        return !!(adv && adv.state === "open");
    }
    catch (e) {
        return false;
    }
}

/** Where an Advanced Search window opens: the remembered CONTENT size
 *  ("WxH", weavero.advSearchWindowSize; 1100 x 720 without one) plus the
 *  window's frame, centred in `avail` (a screen's available rect) and never
 *  larger. Zotero's restoreWindowGeometry resizes the OUTER window, while the
 *  size is remembered as the content (the older Zotero's open features set the
 *  content area), hence the frame: without it the window shrank by its frame
 *  at every open. */
export function wvAdvSearchGeometry(saved: string, frame: { w: number; h: number }, avail: { left: number; top: number; width: number; height: number }): { screenX: number; screenY: number; width: number; height: number } {
    let w = 1100, h = 720;
    const m = String(saved || "").match(/^(\d{3,5})x(\d{3,5})$/);
    if (m) { w = parseInt(m[1], 10); h = parseInt(m[2], 10); }
    const fw = Number.isFinite(frame && frame.w) && frame.w >= 0 && frame.w <= 80 ? frame.w : 0;
    const fh = Number.isFinite(frame && frame.h) && frame.h >= 0 && frame.h <= 120 ? frame.h : 0;
    const width = Math.min(w + fw, avail.width), height = Math.min(h + fh, avail.height);
    return {
        screenX: Math.round(avail.left + (avail.width - width) / 2),
        screenY: Math.round(avail.top + (avail.height - height) / 2),
        width, height,
    };
}

/** A window's geometry as windows.json keeps it (`_wvWindowGeom`), in the form
 *  of Zotero's saved windows (`ZoteroPane.getState`). A minimized window has no
 *  position, and an older store can hold Windows' parking spot. */
export function wvGeomToPane(g: any): any {
    if (!g) return undefined;
    const out: any = { sizemode: g.st === 1 ? "maximized" : (g.st === 4 ? "fullscreen" : "normal") };
    if (Number.isFinite(g.x) && Number.isFinite(g.y) && g.x > -30000 && g.y > -30000) {
        out.screenX = g.x;
        out.screenY = g.y;
    }
    if (g.w > 200 && g.h > 150) {
        out.width = g.w;
        out.height = g.h;
    }
    return out;
}

/** A parked saved window (saved-windows.json), as an entry of the plan. A name
 *  the user gave it comes back as the window's title; an old reader-window entry
 *  comes back as what a reader window is now. */
export function wvStoredFromSaved(e: any): any {
    const ms = Object.assign({}, e.wvMainState);
    if (e.named && e.name) ms.title = e.name;
    // Its colour: the entry's own field, from before the window record carried it.
    if (ms.glyph == null && Number.isInteger(e.glyph)) ms.glyph = e.glyph;
    if (e.kind === "main") return { kind: "main-dev", tabs: e.tabs || [], geom: e.geom, wvMainState: ms };
    const tabs = (e.tabs || []).filter((t: any) => t && t.itemID != null).map((t: any) => ({ itemID: t.itemID }));
    return { kind: "reader-orphan", tabs, activeIndex: 0, geom: e.geom, wvMainState: ms };
}

/** Every item windows.json names, so they can be loaded before the plan. */
export function wvTransferItemIDs(doc: any): number[] {
    const ids = new Set<number>();
    const add = (id: any) => { if (id != null) ids.add(id); };
    for (const e of (doc && Array.isArray(doc.windows) ? doc.windows : [])) {
        if (!e) continue;
        for (const t of e.tabs || []) add(t && (t.itemID != null ? t.itemID : t.data && t.data.itemID));
        add(e.nativeItemID);
        for (const x of e.extras || []) add(x && x.itemID);
        for (const id of e.order || []) add(id);
    }
    return [...ids];
}

/** What windows.json holds, as Zotero's own: the tabs for the window already
 *  open, and a saved window (the form of `ZoteroPane.getState`) for each other.
 *
 *  A document open now answers ONE saved tab, wherever it is open: on the update
 *  Zotero's own session can hold a tab the store holds too, and opening both
 *  would double it, while a document the user had open twice comes back twice.
 *  A gone item is left out, and so is a reader window left with nothing; a
 *  library window stays, since a restart reopens what was open. Reader windows
 *  had no library view, and that is what they stay: Zotero's window with only
 *  a reader tab. Their pins and sidebar width have no twin there.
 *
 *  Zotero's own session lists every main window, so on the update it reopens the
 *  extra ones itself, each with only its library tab (Weavero's wrap kept the rest
 *  out). `opts.spare` counts those: that many main windows of the store go into
 *  `fills`, to be poured into them, instead of opening a second time (measured on a
 *  real update, 2026-11-07). They are told apart by nothing, and hold the same
 *  thing, so the order does not matter.
 *
 *  `first.tabs` keeps the saved slots (`{}` for what is not to open), which is
 *  what `_wvReaddDroppedTabs` places by. `opts.newId` names a window's state.
 *  Pure, so the specs run it on every Zotero. */
export function wvPlanWindowTransfer(doc: any, open: Map<number, number>, kindOf: (itemID: number) => string | null,
    opts: { columnsId?: string; newId: () => string; spare?: number }): { first: any; fills: any[]; windows: any[]; focusFirst: boolean; pins: number[] } {
    const d: any = doc || {};
    const entries: any[] = (Array.isArray(d.windows) ? d.windows : []).filter(Boolean);
    const left = new Map(open);
    const toOpen = (id: number) => {
        const n = left.get(id) || 0;
        if (n > 0) {
            left.set(id, n - 1);
            return false;
        }
        return !!kindOf(id);
    };
    const own = (ms: any) => {
        const st: any = {};
        if (ms && ms.hiddenColl) st.hiddenColl = ms.hiddenColl;
        if (ms && ms.title) st.title = ms.title;
        if (ms && typeof ms.tagsAuto === "boolean") st.tagsAuto = ms.tagsAuto;
        // Its colour (tabs.ts _wvGlyphRestore), into the window state that keeps it there.
        if (ms && Number.isInteger(ms.glyph)) {
            st.glyph = ms.glyph;
            if (ms.glyphPicked === true) st.glyphPicked = true;
        }
        // Its pane sizes (window-state.ts _wvPaneSizesApply).
        if (ms && ms.paneSizes && typeof ms.paneSizes === "object") st.paneSizes = ms.paneSizes;
        return st;
    };
    const settings = (ms: any) => {
        const prefs: any = {}, itemTreeColumns: any = {};
        // "" is a window with no pin, saved as such: left out, the window would
        // take the pin last saved by any window (transition test 2026-11-07).
        if (ms && typeof ms.pinnedPane === "string") prefs.pinnedPane = ms.pinnedPane;
        for (const [pane, isOpen] of Object.entries((ms && ms.paneOpen) || {})) prefs["panes." + pane + ".open"] = !!isOpen;
        if (ms && ms.columnPrefs && opts.columnsId) itemTreeColumns[opts.columnsId] = ms.columnPrefs;
        const st = own(ms);
        if (Object.keys(st).length) prefs[WV_WINDOW_STATE_PREF] = JSON.stringify(Object.assign(st, { id: opts.newId() }));
        return { prefs, itemTreeColumns };
    };
    const baseOf = (t: any) => String((t && t.type) || "").replace(/-(unloaded|loading)$/, "");
    const flagged = (t: any, selected: any) => {
        if (selected) t.selected = true;
        return t;
    };

    const anchor = entries.find((e: any) => e.kind === "main-anchor" && Array.isArray(e.tabs));
    const anchorSel = anchor && anchor.tabs.find((t: any) => t && t.selected);
    const first = {
        tabs: anchor ? anchor.tabs.map((t: any) => {
            const id = t && t.data && t.data.itemID;
            return id == null || toOpen(id) ? t : {};
        }) : [],
        selectID: (anchorSel && anchorSel.data && anchorSel.data.itemID) ?? null,
        // Its entry's, else the store's own field (no entry: it held only its library tab).
        geom: (anchor && anchor.geom) || d.anchorGeom || null,
        state: own({ hiddenColl: d.anchorHidden, title: d.anchorTitle, tagsAuto: d.anchorTagsAuto, paneSizes: d.anchorPaneSizes }),
        // The first window's collection too: only the others carried theirs, and the
        // first came back on My Library (transition test 2026-11-07, "C3" saved).
        collection: (anchor && anchor.wvMainState && anchor.wvMainState.collection) || null,
    };

    const mainTabs = (e: any) => {
        const ms = e.wvMainState || {};
        const tabs: any[] = [];
        for (const t of e.tabs) {
            const base = baseOf(t);
            if (base === "library") {
                const data = Object.assign({}, t.data);
                if (!data.state && ms.collection) data.state = { collections: [ms.collection], focusedCollection: ms.collection };
                tabs.push(flagged({ type: "library", title: t.title || "", data }, t.selected));
            }
            else if ((base === "reader" || base === "note") && t.data && t.data.itemID != null && toOpen(t.data.itemID)) {
                tabs.push(flagged({ type: base, title: t.title || "", data: t.data }, t.selected));
            }
        }
        return tabs;
    };
    // Reader-window entries name items only. "" is a title Zotero fills in itself
    // (Zotero_Tabs.add).
    // A reader window's own pins: on a Zotero with its own windows it is a window like
    // any other, and Weavero's pins (one list, item-keyed) work there; the transfer adds
    // these to it. Its sidebar width has no twin: Zotero keeps one reader sidebar width
    // for every window (tabs.js sidebarState).
    const pins: number[] = [];
    const pin = (id: any, on: any) => { if (on && id != null && !pins.includes(id)) pins.push(id); };
    const docTab = (id: number, grp: any, selected: boolean) => {
        const data: any = { itemID: id };
        if (grp) data.wvGroupId = grp;
        return flagged({ type: kindOf(id), title: "", data }, selected);
    };
    const readerTabs = (e: any) => {
        const listed = [{ itemID: e.nativeItemID, grp: e.nativeGrp, pinned: e.nativePinned }, ...(e.extras || [])];
        const active = listed[e.activeIndex || 0];
        const rest = listed.slice();
        const tabs: any[] = [];
        for (const id of (Array.isArray(e.order) && e.order.length ? e.order : listed.map((x: any) => x.itemID))) {
            const i = rest.findIndex((x: any) => x.itemID === id);
            const src = i >= 0 ? rest.splice(i, 1)[0] : { itemID: id, grp: null };
            if (toOpen(id)) {
                tabs.push(docTab(id, src.grp, src === active));
                pin(id, src.pinned);
            }
        }
        return tabs;
    };
    const orphanTabs = (e: any) => {
        const tabs: any[] = [];
        (e.tabs || []).forEach((t: any, i: number) => {
            if (t && t.itemID != null && toOpen(t.itemID)) {
                tabs.push(docTab(t.itemID, t.grp, i === (e.activeIndex || 0)));
                pin(t.itemID, t.pinned);
            }
        });
        return tabs;
    };

    const f = d.focused;
    const isFocused = (e: any) => !!f && ((f.kind === "main-dev" && e.kind === "main-dev" && f.wvWinId != null && e.wvWinId === f.wvWinId)
        || (f.kind === "reader" && (e.nativeItemID === f.itemID || (e.kind === "reader-orphan" && (e.tabs || []).some((t: any) => t && t.itemID === f.itemID)))));
    const windows: any[] = [], fills: any[] = [];
    let spare = opts.spare || 0;
    for (const e of entries) {
        const tabs = e.kind === "main-dev" && Array.isArray(e.tabs) ? mainTabs(e)
            : e.kind === "reader" ? readerTabs(e)
                : e.kind === "reader-orphan" ? orphanTabs(e) : null;
        if (!tabs || !tabs.length) continue;
        // A reader window's entry has no window record, only its colour.
        const ms = e.wvMainState || (Number.isInteger(e.glyph) ? { glyph: e.glyph, glyphPicked: e.glyphPicked } : undefined);
        if (e.kind === "main-dev" && spare > 0) {
            spare--;
            const sel = tabs.find((t: any) => t.selected);
            const set = settings(ms);
            delete set.prefs[WV_WINDOW_STATE_PREF];   // the setters write it, through the window
            fills.push({ tabs, selectID: (sel && sel.data && sel.data.itemID) ?? null, geom: e.geom || null, state: own(ms),
                collection: (ms && ms.collection) || null, settings: set });
            continue;
        }
        windows.push({ focused: isFocused(e), state: { type: "pane", geometry: wvGeomToPane(e.geom), tabs, settings: settings(ms) } });
    }
    windows.sort((a: any, b: any) => (a.focused ? 1 : 0) - (b.focused ? 1 : 0));
    return { first, fills, windows: windows.map((w: any) => w.state), focusFirst: !f || f.kind === "anchor", pins };
}

/** A tab id is a library tab's. "zotero-pane" is only the FIRST library tab's
 *  on a Zotero with its own windows (zotero#6035): a window can hold several,
 *  and its others have random ids, so a plain comparison took them for document
 *  tabs. Tab ids are unique across windows, so no window is needed. */
export function wvIsLibraryTabID(id: any): boolean {
    if (id === "zotero-pane") return true;
    if (id == null || !wvNativeWindows()) return false;
    return wvMainWins().some((w: any) => {
        const Z = w.Zotero_Tabs;
        return !!Z && typeof Z.isLibraryTab === "function" && Z.isLibraryTab(id);
    });
}

/** A library tab Weavero keeps out of the tab behaviours (drag, groups, pins,
 *  the multi-tab menus): only on an older Zotero, where the library tab is fixed
 *  at index 0. On a Zotero with its own windows a library tab is a tab like any
 *  other (MJT 2026-11-10: "the My Library tab should behave the same as the other
 *  tabs. No need for special treatment"). Identity checks -- which tab shows the
 *  library, its icon, its tooltip -- keep `wvIsLibraryTabID`. */
export function wvIsFixedLibraryTab(id: any): boolean {
    return !wvNativeWindows() && wvIsLibraryTabID(id);
}

/** The first index a tab may be moved to: past the fixed library tab on an older
 *  Zotero; on a Zotero with its own windows, past the tabs Zotero itself holds
 *  pinned (none today -- Weavero's pins are its own), so the first place. */
export function wvFirstMovableIndex(Z: any): number {
    if (!wvNativeWindows()) return 1;
    try { if (Z && typeof Z._getFirstUnpinnedIndex === "function") return Z._getFirstUnpinnedIndex(); } catch (e) {}
    return 0;
}

/** A library tab Weavero pinned on a Zotero with its own windows: the flag rides
 *  in the tab's data, which Zotero saves with the session and restores
 *  (tabs.js getState / restoreState), so the pin survives a restart and a
 *  Zotero without Weavero ignores it. Item tabs pin through the item-keyed store
 *  (`weavero.pinnedTabs`); a library tab has no item. */
export function wvLibraryTabPinned(tab: any): boolean {
    return !!(tab && wvNativeWindows() && tab.data && tab.data.wvPinned && wvIsLibraryTabID(tab.id));
}

/** An element of the library view on screen, by its base id. A Zotero with its own
 *  windows suffixes the ids in every library tab but the first, so a plain lookup
 *  found the first tab's element, or nothing once that tab had closed. */
export function wvViewEl(doc: any, id: string): any {
    try {
        const view = doc.defaultView && doc.defaultView.ZoteroPane && doc.defaultView.ZoteroPane.libraryView;
        if (view && typeof view.getElement === "function") return view.getElement(id);
    }
    catch (e) {}
    try { return doc.getElementById(id); }
    catch (e) { return null; }
}

/** The items tree element of the library view on screen. ItemTree's own `id`:
 *  "item-tree-main-default" on 11.0-beta.3 and older, "item-tree-main" plus the
 *  tab's suffix on a Zotero with its own windows (itemTree.jsx `get id`), where a
 *  plain lookup found the first library tab's tree, or nothing. */
export function wvItemsTreeEl(doc: any): any {
    try {
        const iv = doc.defaultView && doc.defaultView.ZoteroPane && doc.defaultView.ZoteroPane.itemsView;
        const el = iv && iv.id && doc.getElementById(iv.id);
        if (el) return el;
    }
    catch (e) {}
    return doc.getElementById("item-tree-main") || doc.getElementById("item-tree-main-default");
}

/** Every library view of a main window: one per library tab on a Zotero with its
 *  own windows (ZoteroPane.libraryViews), none on an older one. */
/** A window's own pane sizes (MJT 2026-11-08): the collections pane's width, the
 *  item pane's width and, in the stacked layout, its height. The attributes Zotero
 *  persists for them (`zotero-persist`), under short keys. */
const WV_PANE_SIZES: Array<[string, string, string]> = [
    ["coll", "zotero-collections-pane", "width"],
    ["item", "zotero-item-pane", "width"],
    ["itemH", "zotero-item-pane", "height"],
];

/** The sizes `get(id)`'s elements hold, null when none. */
export function wvPaneSizesRead(get: (id: string) => any): any {
    const out: any = {};
    for (const [key, id, attr] of WV_PANE_SIZES) {
        let v = NaN;
        try { const el = get(id); v = el ? parseFloat(el.getAttribute(attr)) : NaN; } catch (e) {}
        if (Number.isFinite(v) && v > 0) out[key] = Math.round(v);
    }
    return Object.keys(out).length ? out : null;
}

/** Put `sizes` on `get(id)`'s elements as Zotero's own restore does
 *  (zoteroPane.js unserializePersist: the attribute and the style). Returns
 *  whether anything was written. */
export function wvPaneSizesWrite(get: (id: string) => any, sizes: any): boolean {
    let n = 0;
    for (const [key, id, attr] of WV_PANE_SIZES) {
        const v = sizes && sizes[key];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
        try {
            const el = get(id);
            if (!el) continue;
            el.setAttribute(attr, String(v));
            el.style[attr] = v + "px";
            n++;
        }
        catch (e) {}
    }
    return n > 0;
}

export function wvLibraryViews(win: any): any[] {
    try {
        const v = win && win.ZoteroPane && win.ZoteroPane.libraryViews;
        if (Array.isArray(v)) return v;
    }
    catch (e) {}
    return [];
}

/** Every items tree element of a main window: each library tab's on a Zotero with
 *  its own windows (a background tab's tree re-renders too), else the one. */
export function wvItemsTreeEls(doc: any): any[] {
    const out: any[] = [];
    for (const v of wvLibraryViews(doc && doc.defaultView)) {
        try {
            const id = v.itemsView && v.itemsView.id;
            const el = id && doc.getElementById(id);
            if (el && !out.includes(el)) out.push(el);
        }
        catch (e) {}
    }
    if (!out.length) {
        const el = wvItemsTreeEl(doc);
        if (el) out.push(el);
    }
    return out;
}

/** An element of EVERY library view by its base id (wvViewEl is the view on screen). */
export function wvViewEls(doc: any, id: string): any[] {
    const out: any[] = [];
    for (const v of wvLibraryViews(doc && doc.defaultView)) {
        try {
            const el = typeof v.getElement === "function" ? v.getElement(id) : null;
            if (el && !out.includes(el)) out.push(el);
        }
        catch (e) {}
    }
    if (!out.length) {
        const el = wvViewEl(doc, id);
        if (el) out.push(el);
    }
    return out;
}

/** Where the tabs that take part in the tab behaviours (order, pins, groups)
 *  start: past the library tab, which an older Zotero always has at 0. On a
 *  Zotero with its own windows every tab takes part, the library tabs included
 *  (MJT 2026-11-10: a library tab moves, groups and pins like any tab), so 0.
 *  Until 1.0.2 the native case skipped a library tab at 0, which kept the pins
 *  after it and made the order pass loop once it had moved (24 moves in 3 s). */
export function wvFirstDocTab(tabs: any[]): number {
    void tabs;
    return wvNativeWindows() ? 0 : 1;
}

/** Show `win`'s library tab. `Zotero_Tabs.select` throws on an id the window does
 *  not hold, and there a window can have closed "zotero-pane" or never had it
 *  (a torn-off reader); Zotero's own call picks the last used library tab and
 *  opens one when there is none. */
export function wvSelectLibraryTab(win: any) {
    const Z = win && win.Zotero_Tabs;
    if (!Z) return;
    if (typeof Z.selectLibraryTab === "function") Z.selectLibraryTab();
    else Z.select("zotero-pane");
}

/** Show `win`'s library and wait for its view. A library tab makes its view when
 *  first shown, so until then `ZoteroPane.collectionsView` is null: after a restart
 *  with a reader tab selected, every window can be in that state. */
export async function wvOpenLibraryView(win: any) {
    wvSelectLibraryTab(win);
    const zp = win && win.ZoteroPane, Z = win && win.Zotero_Tabs;
    if (zp && Z && typeof zp.waitForLibraryView === "function") await zp.waitForLibraryView(Z.selectedID);
}

/** The `windowtype` of a window or of a document -- "navigator:browser" a
 *  main window, "zotero:reader" a reader window, "zotero:note", "zotero:pref",
 *  "Update:Wizard"... -- and "" when there is none yet (a window still on
 *  its about:blank, a closed one) or the argument is not a window. Thirty-
 *  nine sites spelled the guarded read out (`win && win.document &&
 *  win.document.documentElement && ...getAttribute("windowtype")`), in two
 *  and three-line chains. */
export function wvWinType(winOrDoc: any): string {
    try {
        if (!winOrDoc) return "";
        const doc = winOrDoc.documentElement ? winOrDoc : winOrDoc.document;
        return (doc && doc.documentElement && doc.documentElement.getAttribute("windowtype")) || "";
    }
    catch (e) {
        return "";
    }
}

/** Windows only: a window's native style (GWL_STYLE) through user32, read,
 *  or with `next` rewritten and the frame refreshed (SWP_FRAMECHANGED --
 *  without it the title bar keeps its old buttons until the next resize).
 *  Returns the style now in force, null when it cannot be read (not
 *  Windows, no native handle, ctypes unavailable). The same js-ctypes path
 *  as the window icons (modules/tabs.ts _wvSetWindowIconFromFile).
 *  `open` replaces the user32 handle (the specs' stand-in for a 32-bit one). */
export function wvWin32Style(win: any, next?: (style: number) => number, open?: (ctypes: any) => any): number | null {
    let lib: any = null;
    try {
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs") as any;
        const bw = win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
        const handle = bw.nativeHandle;
        if (!handle) return null;
        lib = open ? open(ctypes) : ctypes.open("user32.dll");
        const HWND = ctypes.voidptr_t;
        const GWL_STYLE = -16;
        // A 32-bit user32.dll exports no *WindowLongPtrW (macros for the plain
        // names there) and declaring a missing symbol throws, which left a
        // 32-bit Zotero with no style at all (2026-11-05). intptr_t is the
        // right width either way.
        const declareLong = (verb: "Get" | "Set", ...args: any[]) => {
            try { return lib.declare(verb + "WindowLongPtrW", ctypes.winapi_abi, ctypes.intptr_t, ...args); }
            catch (e) { return lib.declare(verb + "WindowLongW", ctypes.winapi_abi, ctypes.intptr_t, ...args); }
        };
        const GetWindowLong = declareLong("Get", HWND, ctypes.int);
        const hwnd = HWND(ctypes.UInt64(handle));
        // The style is 32 bits, sign-extended into LONG_PTR: `| 0` keeps it
        // an int32 so the bit operations and the write-back agree.
        const style = Number(GetWindowLong(hwnd, GWL_STYLE).toString()) | 0;
        if (!next) return style;
        const want = next(style) | 0;
        if (want === style) return style;
        const SetWindowLong = declareLong("Set", HWND, ctypes.int, ctypes.intptr_t);
        const SetWindowPos = lib.declare("SetWindowPos", ctypes.winapi_abi, ctypes.bool, HWND, HWND,
            ctypes.int, ctypes.int, ctypes.int, ctypes.int, ctypes.unsigned_int);
        SetWindowLong(hwnd, GWL_STYLE, ctypes.Int64(want));
        // NOSIZE | NOMOVE | NOZORDER | NOACTIVATE | FRAMECHANGED
        SetWindowPos(hwnd, HWND(0), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020);
        return Number(GetWindowLong(hwnd, GWL_STYLE).toString()) | 0;
    }
    catch (e) {
        try { Zotero.debug("[Weavero] wvWin32Style err: " + e); } catch (e2) {}
        return null;
    }
    finally {
        try { if (lib) lib.close(); } catch (e) {}
    }
}
