// A window's own state on a Zotero with its own windows (zotero#6035).
//
// Zotero saves, restores and reopens every window there, so Weavero's window
// store stands down (wvNativeWindows, lib/windows.ts). Two things stay Weavero's:
//
//   - What Zotero does not know about a window: its custom title, its hidden
//     collections, its own Tags-column count, its colour. They ride `weavero.windowState`,
//     one of the settings a window keeps for itself (ZoteroPane.setWindowSetting).
//     Zotero saves those with the window, so they go where it goes: a restart, a
//     closed window reopened.
//   - The windows windows.json still holds on the first start on such a Zotero:
//     they open once as Zotero's own (_wvWindowsTransferOnce). The file is never
//     written or removed, so an older Zotero finds it as it was.
//
// Guards: test/window-transfer.spec.js, and the real update (an older Zotero's
// profile started on the new build) in the z6035 live check.

import { wvIsLibraryTabID, wvLibraryViews, wvMainWins, wvNativeWindows, wvPaneOpenSettingNames, wvPaneSizesRead, wvPaneSizesWrite, wvPlanWindowTransfer, wvTransferItemIDs, wvWinType, WV_WINDOW_STATE_PREF } from "../lib/windows";
import { wvSleep } from "../lib/timers";
import { wvUnwrap, wvWrap } from "../lib/wrap";

declare const Zotero: any;
declare const IOUtils: any;

/** windows.json's modified time at the last transfer. A time, not a flag: a
 *  round trip through an older Zotero writes the file again, and the windows
 *  of that session transfer in their turn. */
const WV_TRANSFERRED_PREF = "weavero.windowsTransferred";

const live = (): any => {
    const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
    return p && !p._wvDestroyed ? p : null;
};

class _WindowStateMixin {
    /** What Weavero keeps of main window `w`, empty when it is a plain window. */
    _wvWinStateCapture(w: any): any {
        const p: any = this;
        const st: any = {};
        const hidden = p._wvHidCapture(w);
        if (hidden) st.hiddenColl = hidden;
        const title = p._wvWindowCustomTitle(w);
        if (title) st.title = title;
        const tagsAuto = p._wvTagsAutoCapture(w);
        if (typeof tagsAuto === "boolean") st.tagsAuto = tagsAuto;
        // The Advanced Search window's hidden side panes (pane.ts
        // _wvAdvSearchHidePanesNative): Zotero's shared layout never has them.
        const advPanes = p._wvAdvSearchPanesHidden(w);
        if (advPanes.length) st.advPanes = advPanes;
        // Its colour, drawn or picked (tabs.ts _wvGlyphRestore).
        Object.assign(st, p._wvGlyphFields(w));
        // Its own pane sizes (_wvPaneSizesApply).
        const sizes = this._wvPaneSizesCapture(w);
        if (sizes) st.paneSizes = sizes;
        return st;
    }

    /** Where window `w`'s panes are: in `view` (a library tab's, on a Zotero with
     *  its own windows; the one shown by default), else in its document. */
    _wvPaneSizesGetter(w: any, view?: any): (id: string) => any {
        const v = view || (w && w.ZoteroPane && w.ZoteroPane.libraryView);
        if (v && typeof v.getElement === "function") return (id: string) => v.getElement(id);
        if (wvNativeWindows()) return () => null;   // a window with no library tab
        return (id: string) => w.document.getElementById(id);
    }

    /** Window `w`'s pane sizes (lib/windows.ts wvPaneSizesRead), its last known
     *  when it shows no library view, null when none. */
    _wvPaneSizesCapture(w: any): any {
        try { return wvPaneSizesRead(this._wvPaneSizesGetter(w)) || (w && w._wvPaneSizes) || null; }
        catch (e) { return null; }
    }

    /** Give window `w` its own pane sizes (MJT 2026-11-08: each window keeps its
     *  own widths; whether a pane is collapsed stays Zotero's shared setting).
     *  On a Zotero with its own windows: every library view it holds, and the ones
     *  its library tabs take when shown again (_wvPaneSizesWire). */
    _wvPaneSizesApply(w: any, sizes: any) {
        if (!w || !sizes || typeof sizes !== "object") return;
        try {
            if (wvNativeWindows()) {
                w._wvPaneSizes = Object.assign({}, sizes);
                for (const v of wvLibraryViews(w)) wvPaneSizesWrite((id: string) => v.getElement(id), sizes);
            }
            else wvPaneSizesWrite((id: string) => w.document.getElementById(id), sizes);
            try { w.ZoteroPane.updateLayoutConstraints(); } catch (e) {}
        }
        catch (e) { Zotero.debug("[Weavero] _wvPaneSizesApply err: " + e); }
    }

    /** Window `w`'s own sizes: the ones it last held, else its saved state's,
     *  unless that state is the copy Zotero hands a window opened from another
     *  (_wvWinStateApply's rule: that window starts from its opener's, as Zotero's). */
    _wvPaneSizesOwn(w: any): any {
        if (w._wvPaneSizes) return w._wvPaneSizes;
        try {
            const text = w.ZoteroPane.getWindowSettings().prefs[WV_WINDOW_STATE_PREF];
            const st = text ? JSON.parse(text) : null;
            if (!st || !st.paneSizes) return null;
            if (st.id && wvMainWins().some((x: any) => x !== w && x._wvWinStateId === st.id)) return null;
            return st.paneSizes;
        }
        catch (e) { return null; }
    }

    /** On a Zotero with its own windows, Zotero keeps ONE layout for every window
     *  and library tab, on purpose ("Library views share one set of values",
     *  zoteroPane.js serializePersist), and puts it back on each library tab shown
     *  (libraryView.adoptSharedState): a window took the widths whichever window
     *  saved last (restart checks 2026-11-07). What a window saves is noted as its
     *  own, and its own go back on after Zotero's. Zotero's shared value is left as
     *  it is: a window opened from another starts from it, and without Weavero
     *  nothing changes. Before the window's first library view shows.
     *  Guard: test/window-pane-sizes.spec.js. */
    _wvPaneSizesWire(w: any) {
        const zp = w && w.ZoteroPane;
        if (!wvNativeWindows() || !zp || typeof zp.serializePersist !== "function" || typeof zp.unserializePersist !== "function") return;
        const tag = (this as any)._wvWireTag();
        wvWrap(zp, "serializePersist", "paneSizes", tag, (orig: any) => function (this: any, view?: any) {
            const r = orig.apply(this, arguments);
            try {
                const lp = live();
                const sizes = lp && wvPaneSizesRead(lp._wvPaneSizesGetter(w, view));
                // Zotero saves its layout when a library tab is left, a window
                // opened from this one, and this window closing: the window's own
                // state with it, when the sizes changed.
                if (sizes && JSON.stringify(sizes) !== JSON.stringify(w._wvPaneSizes || null)) {
                    w._wvPaneSizes = sizes;
                    try { lp._wvWinStateSave(w); } catch (e) {}
                }
            }
            catch (e) {}
            return r;
        });
        wvWrap(zp, "unserializePersist", "paneSizes", tag, (orig: any) => function (this: any, view?: any) {
            const r = orig.apply(this, arguments);
            try {
                const lp = live();
                const own = lp && lp._wvPaneSizesOwn(w);
                if (own) {
                    const views = view ? [view] : wvLibraryViews(w);
                    for (const v of views) wvPaneSizesWrite((id: string) => v.getElement(id), own);
                }
            }
            catch (e) {}
            return r;
        });
    }

    _wvPaneSizesUnwire(w: any) {
        const zp = w && w.ZoteroPane;
        if (!zp) return;
        try { wvUnwrap(zp, "serializePersist", "paneSizes"); } catch (e) {}
        try { wvUnwrap(zp, "unserializePersist", "paneSizes"); } catch (e) {}
    }

    /** Into the window's own settings. Only a window whose saved state has been
     *  read: earlier, the capture is blank and would wipe it. "" for nothing,
     *  never cleared: setWindowSetting(name, undefined) clears the pref, and a
     *  cleared pref can refuse to come back until a restart
     *  (reference_gecko_cleared_pref_uncreatable). */
    _wvWinStateSave(w: any) {
        const p: any = this;
        const zp = w && w.ZoteroPane;
        if (!zp || typeof zp.setWindowSetting !== "function") return;
        if (!p._wvWinStateReady || !p._wvWinStateReady.has(w)) return;
        const st = this._wvWinStateCapture(w);
        if (Object.keys(st).length) {
            if (!w._wvWinStateId) w._wvWinStateId = Zotero.Utilities.randomString(8);
            st.id = w._wvWinStateId;
        }
        const text = Object.keys(st).length ? JSON.stringify(st) : "";
        if ((zp.getWindowSettings().prefs[WV_WINDOW_STATE_PREF] || "") !== text) zp.setWindowSetting(WV_WINDOW_STATE_PREF, text);
    }

    /** The window store's native side: called where a change used to save it. */
    _wvWinStateSaveAll() {
        for (const w of wvMainWins()) {
            try { this._wvWinStateSave(w); }
            catch (e) { Zotero.debug("[Weavero] _wvWinStateSave err: " + e); }
        }
    }

    /** Read a window's saved state once it has taken it from Zotero. Zotero copies
     *  a window's settings to a window opened from it, and a new window starts
     *  plain: the same id still open elsewhere is such a copy, dropped here. */
    async _wvWinStateApply(w: any) {
        const p: any = this;
        try {
            if (!w || w.closed) return;
            const zp = w.ZoteroPane;
            const text = zp.getWindowSettings().prefs[WV_WINDOW_STATE_PREF];
            let st: any = null;
            try { st = text ? JSON.parse(text) : null; } catch (e) {}
            if (st && st.id && wvMainWins().some((x: any) => x !== w && x._wvWinStateId === st.id)) st = null;
            if (text && !st) zp.setWindowSetting(WV_WINDOW_STATE_PREF, "");
            if (st) {
                w._wvWinStateId = st.id;
                if (st.glyph != null) p._wvGlyphRestore(w, st.glyph, st.glyphPicked === true);
                if (st.paneSizes) this._wvPaneSizesApply(w, st.paneSizes);
                if (st.title && w._wvWindowTitle == null) p._wvWindowSetCustomTitle(w, st.title);
                if (typeof st.tagsAuto === "boolean") p._wvTagsAutoSet(w, st.tagsAuto, { save: false });
                // An Advanced Search window back from a restart or reopened:
                // its panes hidden again, its size remembered from now on.
                if (Array.isArray(st.advPanes) && st.advPanes.length && p._wvAdvSearchWindowsOn() && p._getAdvSearchWindowHidePanes()) {
                    w._wvAdvSearchWin = true;
                    p._wvAdvSearchHidePanesNative(w, st.advPanes);
                    try { p._wvAdvSearchRememberSize(w); } catch (e) {}
                }
                // The tree may not exist yet: _wvHidApply refreshes it when it comes.
                if (st.hiddenColl) await p._wvHidRestore(w, st.hiddenColl);
            }
        }
        catch (e) { Zotero.debug("[Weavero] _wvWinStateApply err: " + e); }
        finally {
            (p._wvWinStateReady || (p._wvWinStateReady = new WeakSet())).add(w);
        }
    }

    /** Every main window, the ones with no library view too: Zotero's
     *  onMainWindowLoad fires only when a library view loads, so a torn-off reader
     *  stayed plain Zotero (hidden title row and nothing more, its window buttons
     *  on top of the tab bar's: MJT 2026-11-07), and the wiring table runs here for
     *  it, as a plugin reload does. The entries needing the views wait for the
     *  onMainWindowLoad of a library tab opened there. Called from the early
     *  window listener, so twice for a window opened while Weavero runs. */
    _wvWinStateOpened(w: any) {
        if (!wvNativeWindows() || wvWinType(w) !== "navigator:browser") return;
        const zp = w.ZoteroPane;
        if (!zp || typeof zp.getWindowSettings !== "function") return;
        const p: any = this;
        try { this._wvPaneSizesWire(w); } catch (e) { Zotero.debug("[Weavero] _wvPaneSizesWire err: " + e); }
        const seen = p._wvWinStateSeen || (p._wvWinStateSeen = new WeakSet());
        if (seen.has(w)) return;
        seen.add(w);
        Promise.resolve(zp.loadedPromise).then(() => {
            const lp = live();
            if (!lp || w.closed) return;
            if (!zp.libraryView) lp._wvWireMainWindow(w, "load");
            return lp._wvWinStateApply(w);
        }).catch((e: any) => Zotero.debug("[Weavero] _wvWinStateOpened err: " + e));
    }

    /** Until Zotero has reopened what it saved: its last windows open after the
     *  first one is ready, and a tab still on its way would look unopened. */
    async _wvWindowsSettled() {
        let calm = 0;
        for (let i = 0; i < 80 && calm < 3; i++) {
            const S: any = Zotero.Session;
            const pending = S && S.getPendingPaneStates ? S.getPendingPaneStates().length : 0;
            const loading = wvMainWins().some((w: any) => !w.Zotero_Tabs || !w.Zotero_Tabs._tabs.length);
            calm = pending || loading ? 0 : calm + 1;
            await wvSleep(250);
        }
    }

    /** The kind of tab an item opens in, null when it cannot open one or is gone. */
    _wvItemTabKind(id: number): string | null {
        const item = Zotero.Items.exists(id) ? Zotero.Items.get(id) : null;
        if (!item) return null;
        if (item.isNote()) return "note";
        return item.isAttachment() && item.attachmentReaderType ? "reader" : null;
    }

    /** A saved tab of a group library not loaded yet reads as gone otherwise. */
    async _wvLoadStoredItems(doc: any) {
        for (const id of wvTransferItemIDs(doc)) {
            try { await Zotero.Items.getAsync(id); } catch (e) {}
        }
    }

    /** Until windows opened with a saved state hold their tabs, then draw their
     *  groups: a window with no library view has no later pass to do it. */
    async _wvWindowsOpened(opened: any[]) {
        const p: any = this;
        for (let i = 0; i < 80; i++) {
            if (!opened.some((w: any) => !w.closed && !(w.Zotero_Tabs && w.Zotero_Tabs._tabs.length))) break;
            await wvSleep(250);
        }
        for (const w of opened) { try { p._applyTabGroups(w); } catch (e) {} }
    }

    /** Open one stored window (an entry in the store's shape: a saved window, a
     *  session's window) through Zotero's own restore. Its documents open whether
     *  or not they are open elsewhere: reopening a window asks for all of it.
     *  Returns the window, null when nothing of it is left. */
    async _wvOpenStoredWindow(entry: any) {
        const doc = { windows: [entry] };
        await this._wvLoadStoredItems(doc);
        const main: any = Zotero.getMainWindow();
        const iv = main && main.ZoteroPane && main.ZoteroPane.itemsView;
        const plan = wvPlanWindowTransfer(doc, new Map(), (id: number) => this._wvItemTabKind(id), {
            columnsId: (iv && iv.prefsId) || "item-tree-main-default",
            newId: () => Zotero.Utilities.randomString(8),
        });
        if (!plan.windows.length) return null;
        const w = Zotero.openMainWindow({ sessionState: plan.windows[0] });
        await this._wvWindowsOpened([w]);
        return w;
    }

    /** Close windows that are being put away, not closed: Zotero keeps a closed
     *  window for reopening, which would bring back a copy of what is stored. */
    async _wvCloseQuietly(wins: any[]) {
        const S: any = Zotero.Session;
        const before = S.getLastClosed ? S.getLastClosed() : null;
        for (const w of wins) { try { w.close(); } catch (e) {} }
        for (let i = 0; i < 40 && wins.some((w: any) => !w.closed); i++) await wvSleep(100);
        // The unload that records it runs as the window goes.
        await wvSleep(50);
        for (let n = 0; S.getLastClosed && n < 100; n++) {
            const last = S.getLastClosed();
            if (!last || last === before) break;
            S.takeLastClosed();
        }
    }

    /** Pour a saved window into one that is open: its missing tabs, selection,
     *  geometry and own state. Its columns and pane settings take at the next
     *  start, like any window setting. Returns the tabs added. */
    async _wvWindowsFill(w: any, fill: any) {
        const p: any = this;
        const Z = w.Zotero_Tabs, zp = w.ZoteroPane;
        const added = await p._wvReaddDroppedTabs(Z, fill.tabs, { tag: "transfer" });
        if (fill.selectID != null) {
            const t = Z._tabs.find((x: any) => x.data && x.data.itemID === fill.selectID);
            if (t) Z.select(t.id);
        }
        if (fill.geom) p._wvApplyWindowGeom(w, fill.geom);
        for (const [name, value] of Object.entries((fill.settings && fill.settings.prefs) || {})) zp.setWindowSetting(name, value);
        for (const [id, prefs] of Object.entries((fill.settings && fill.settings.itemTreeColumns) || {})) zp.setItemTreeColumnPrefs(id, prefs);
        const st = fill.state;
        if (st.glyph != null) p._wvGlyphRestore(w, st.glyph, st.glyphPicked === true);
        if (st.paneSizes) this._wvPaneSizesApply(w, st.paneSizes);
        if (st.title && w._wvWindowTitle == null) p._wvWindowSetCustomTitle(w, st.title);
        if (typeof st.tagsAuto === "boolean") p._wvTagsAutoSet(w, st.tagsAuto, { save: false });
        if (st.hiddenColl) await p._wvHidRestore(w, st.hiddenColl);
        if (fill.collection) {
            if (zp.collectionsView) {
                try { await zp.collectionsView.selectByID(fill.collection); } catch (e) {}
            }
            else {
                // Its library tab not shown yet, so no view to select in: Zotero makes the
                // view from the tab's `data.state` when it first shows, and saves that state
                // until then (tabs.js load / _getLibraryTabCollectionsState). The first
                // window came back on My Library with a document in front (dev.8 rerun,
                // 2026-11-07, "libraryView": false).
                try {
                    const lib = Z._tabs.find((t: any) => wvIsLibraryTabID(t.id));
                    if (lib) {
                        lib.data = lib.data || {};
                        lib.data.state = Object.assign({}, lib.data.state, { collections: [fill.collection], focusedCollection: fill.collection });
                    }
                } catch (e) {}
            }
        }
        try { p._applyTabGroups(w); } catch (e) {}
        return added;
    }

    /** Make the pinned section and the section states `win` shows its own
     *  before other windows open. A setting a window has not read yet comes
     *  from the pref of that name, and every window that draws its item pane
     *  writes its own pin there (zoteroPane.js getWindowSetting /
     *  setWindowSetting, zotero#6035); read that late, the first window took
     *  the pin of a window opened after it (transition test 2026-11-07:
     *  Window A came back with Window C's "libraries-collections" for its
     *  "tags"). Reading fixes the value the window has now. */
    _wvWindowSettingsOwn(win: any) {
        try {
            const zp: any = win && win.ZoteroPane;
            if (!zp || typeof zp.getWindowSetting !== "function") return;
            zp.getWindowSetting("pinnedPane");
            for (const name of wvPaneOpenSettingNames(win)) zp.getWindowSetting(name);
        }
        catch (e) { Zotero.debug("[Weavero] _wvWindowSettingsOwn err: " + e); }
    }

    /** Open what `doc` (windows.json) holds as Zotero's own windows: the first
     *  window's tabs in the window that is there, each other window in the one
     *  Zotero reopened for it or through Zotero's own restore. Returns
     *  `{ added, opened }`. */
    async _wvWindowsTransfer(doc: any, opts?: { focus?: boolean }) {
        const p: any = this;
        const wins = wvMainWins();
        const first: any = wins[0];
        if (!first || !first.Zotero_Tabs) return { added: 0, opened: [] };
        this._wvWindowSettingsOwn(first);
        const others = wins.slice(1).filter((w: any) => w.Zotero_Tabs && w.Zotero_Tabs._tabs.some((t: any) => wvIsLibraryTabID(t.id)));
        const open = new Map<number, number>();
        for (const w of wins) {
            for (const t of (w.Zotero_Tabs && w.Zotero_Tabs._tabs) || []) {
                const id = t && t.data && t.data.itemID;
                if (id != null) open.set(id, (open.get(id) || 0) + 1);
            }
        }
        await this._wvLoadStoredItems(doc);
        const iv = first.ZoteroPane && first.ZoteroPane.itemsView;
        const plan = wvPlanWindowTransfer(doc, open, (id: number) => this._wvItemTabKind(id), {
            columnsId: (iv && iv.prefsId) || "item-tree-main-default",
            newId: () => Zotero.Utilities.randomString(8),
            spare: others.length,
        });
        let added = await this._wvWindowsFill(first, plan.first);
        for (let i = 0; i < plan.fills.length; i++) added += await this._wvWindowsFill(others[i], plan.fills[i]);
        // In saved order, the focused one last and so on top, as Zotero does.
        const opened: any[] = plan.windows.map((sessionState: any) => Zotero.openMainWindow({ sessionState }));
        await this._wvWindowsOpened(opened);
        // A reader window's pinned tabs, pinned in the window it became (lib/windows.ts).
        if (plan.pins && plan.pins.length) {
            for (const id of plan.pins) {
                try { const it = Zotero.Items.get(id); if (it) p._pinnedTabsAdd(it.libraryID, it.key); } catch (e) {}
            }
            for (const w of wvMainWins()) { try { p._applyPinnedTabs(w); } catch (e) {} }
        }
        if (opts && opts.focus && plan.focusFirst && opened.length) { try { first.focus(); } catch (e) {} }
        try { p._wvTrace("transfer: " + added + " tab(s) in the first window, " + opened.length + " window(s) opened"); } catch (e) {}
        return { added, opened };
    }

    /** The update itself: a real start on a Zotero with its own windows, and a
     *  windows.json this has not transferred yet. Marked before anything opens:
     *  a window left behind by a crash halfway is better than every window
     *  twice. A reload or an enable leaves it to the next real start, because
     *  an open session may hold anything. */
    async _wvWindowsTransferOnce() {
        const p: any = this;
        try {
            if (!wvNativeWindows() || p._wvStartupReason !== 1) return;
            const path = p._wvWindowStorePath();
            let stamp = "";
            try { stamp = String((await IOUtils.stat(path)).lastModified); }
            catch (e) { return; }   // no store: nothing was ever saved
            if (Zotero.Prefs.get(WV_TRANSFERRED_PREF) === stamp) return;
            await this._wvWindowsSettled();
            let doc: any = null;
            try { doc = JSON.parse(await p._wvWindowStoreReadText()); } catch (e) {}
            Zotero.Prefs.set(WV_TRANSFERRED_PREF, stamp);
            if (doc && Array.isArray(doc.windows) && doc.windows.length) await this._wvWindowsTransfer(doc, { focus: true });
        }
        catch (e) { Zotero.debug("[Weavero] _wvWindowsTransferOnce err: " + e); }
    }
}

const _windowStateDescriptors = Object.getOwnPropertyDescriptors(_WindowStateMixin.prototype);
delete (_windowStateDescriptors as any).constructor;
export const windowStateMethods = _windowStateDescriptors;
