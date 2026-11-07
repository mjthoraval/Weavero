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
        return st;
    };
    const settings = (ms: any) => {
        const prefs: any = {}, itemTreeColumns: any = {};
        if (ms && ms.pinnedPane) prefs.pinnedPane = ms.pinnedPane;
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
        geom: (anchor && anchor.geom) || null,
        state: own({ hiddenColl: d.anchorHidden, title: d.anchorTitle, tagsAuto: d.anchorTagsAuto }),
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
        const ms = e.wvMainState;
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

/** Where a window's document tabs start: past the library tab, which an older
 *  Zotero always has at 0. A Zotero with its own windows may hold a document
 *  there (a window with only a reader, a window whose library tab closed), and a
 *  loop from 1 skipped it: its group chip never showed. */
export function wvFirstDocTab(tabs: any[]): number {
    if (!wvNativeWindows()) return 1;
    return tabs && tabs[0] && wvIsLibraryTabID(tabs[0].id) ? 1 : 0;
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
