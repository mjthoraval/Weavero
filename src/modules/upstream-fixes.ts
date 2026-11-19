// Module: stand-ins for Zotero bugs MJT reported on the forums, kept until Zotero fixes
// them (MJT 2026-11-18: "fix in Weavero the recent bugs that I have reported, in a way
// that is compatible with the native fix if already in the commits or PRs, or ready for
// compatibility when Zotero native fixes them. Keep track of the native Zotero bugs
// that are fixed in Weavero, so that the fixes can be retired when Zotero fixes them").
//
// Every fix here:
//   - is marked WV-TEMP-<forum thread> and listed in the private upstream-bugs register
//     (its entry says "PATCHED in Weavero by WV-TEMP-..." and keeps its "Retire when");
//   - checks Zotero's own code first and installs nothing once Zotero's fix is in (a
//     stale stand-in would fight the native fix);
//   - has a tripwire in its spec: torn down, the spec shows Zotero's bug, and fails the
//     day Zotero fixes it -- then retire the fix (upstream-check skill, step 3);
//   - is torn down by destroy() (test/zzz-disable-leftovers.spec.js).
// None of them was in Zotero's commits or pull requests on 2026-11-18 (zotero/zotero
// since 11-09; zotero/reader since 11-09).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvMainWins, wvNativeWindows } from "../lib/windows";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvTimeout } from "../lib/timers";

declare const Zotero: any;
declare const Services: any;

const live = () => wvLivePlugin();

/** Zotero.Notes.open's rule that a tab stands in for a note window (11.0-beta.4,
 *  xpcom/data/notes.js): the source line it is recognised by. */
const NOTE_TAB_STANDS_IN = /stands in for a window of its own/;

class _UpstreamFixesMixin {
    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134831 (forums.zotero.org/discussion/134831, upstream register #66).
    // Zotero 11: a note tab's More (...) > "Edit in a Separate Window" does nothing:
    // the editor's "openWindow" message calls ZoteroPane.openNoteWindow, which is
    // Zotero.Notes.open with openInWindow, and Notes.open lets "a tab for the note in
    // any window stand in for a window of its own" -- from the note's own tab it only
    // selects that tab. Zotero 10.0.8 opens the note in a window (checked with no
    // add-on, 2026-11-18). Here: called while that note's tab is the selected one of a
    // window holding other tabs too, the tab moves to a new window -- Zotero's own
    // "Move Tab > Move to New Window" (Zotero_Tabs' moveToNewWindow hook), on Zotero
    // 11 the window a note opens in. Anything else (the item pane's note editor, a
    // window with that tab alone) goes to Zotero as before.
    //
    // RETIRE WHEN Notes.open no longer has the stand-in rule, or "Edit in a Separate
    // Window" from a note tab opens a window on a plain beta; the tripwire in
    // test/upstream-fixes.spec.js says when. Installs nothing without the rule.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireNoteWindowFix(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            const Z = win && win.Zotero_Tabs;
            const N = (Zotero as any).Notes;
            if (!ZP || typeof ZP.openNoteWindow !== "function" || !Z || typeof Z._getHook !== "function") return;
            // Zotero's own Notes.open, under Weavero's layers (index.ts deck-window
            // patch `_wvOrigOpen`, tabs.ts multi-window patch `_wvMwOrigOpen`).
            const natives = N ? [N._wvMwOrigOpen, N._wvOrigOpen, N.open].filter((f: any) => typeof f === "function") : [];
            if (!natives.some((f: any) => NOTE_TAB_STANDS_IN.test(String(f)))) return;   // Zotero's own fix is in
            wvWrap(ZP, "openNoteWindow", "noteWindow", (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                try {
                    const lp = live();
                    if (lp && !lp._wvDestroyed && lp._wvNoteWindowFromTab(win, args[0])) return undefined;
                } catch (e) {}
                return orig.apply(this, args);
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireNoteWindowFix err: " + e); }
    }

    /** "Edit in a Separate Window" for note `itemID` from its own tab in `win`: the tab
     *  moved to a new window, as Zotero's Move to New Window does. True when done. */
    _wvNoteWindowFromTab(win: any, itemID: any): boolean {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z || !Array.isArray(Z._tabs)) return false;
            const tab = Z._tabs.find((t: any) => t && t.id === Z.selectedID);
            if (!tab || !/^note/.test(String(tab.type)) || !tab.data || tab.data.itemID !== itemID) return false;
            // Alone in its window: it is in a window of its own already (Zotero focuses it).
            if (Z._tabs.filter((t: any) => !!t).length < 2) return false;
            const kind = (typeof Z.parseTabType === "function" && Z.parseTabType(tab.type).tabContentType) || "note";
            if (typeof Z._hasHook === "function" && !Z._hasHook(kind, "moveToNewWindow")) return false;
            const move = Z._getHook(kind, "moveToNewWindow");
            if (typeof move !== "function") return false;
            Zotero.debug("[Weavero] WV-TEMP-134831: Edit in a Separate Window from note tab " + tab.id + " -> Move to New Window");
            Promise.resolve(move(tab, Z._tabs.indexOf(tab))).catch((e: any) => Zotero.logError(e));
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvNoteWindowFromTab err: " + e); return false; }
    }

    _wvTeardownNoteWindowFix() {
        for (const w of wvMainWins() as any[]) {
            try { if (w && w.ZoteroPane) wvUnwrap(w.ZoteroPane, "openNoteWindow", "noteWindow"); } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134823 (forums.zotero.org/discussion/134823, upstream register #64).
    // Zotero 11: a reader tab selected while the item pane is closed renders its item
    // details collapsed (every box skipped); opening the pane again draws the sections
    // as they come into view, but the HEADER (title / citation) stays blank until another
    // tab is selected. The context pane's re-render on opening (elements/contextPane.js
    // handleCollapse) runs only when the inner pane's old `collapsed` value was "true",
    // and Zotero's own collapse writes it with toggleAttribute -- "" (contextPane.js
    // `collapsed` setter) -- in the standard layout. Zotero 10.0.8 draws it (no add-on,
    // 2026-11-17). Here: the same re-render for an old value of "" (Zotero's own call,
    // `_getItemContext(selected).render()`).
    //
    // RETIRE WHEN handleCollapse re-renders for any old value, or the setter writes
    // "true"; installs nothing once either changes (the gate reads both). Tripwire in
    // test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireCtxHeaderFix(win: any) {
        try {
            const doc = win && win.document;
            const inner: any = doc && doc.getElementById("zotero-context-pane-inner");
            const CP: any = win && win.ZoteroContextPane;
            if (!inner || typeof inner.handleCollapse !== "function" || !CP) return;
            const wraps = inner._wvWraps && inner._wvWraps.handleCollapse;
            const native = wraps ? wraps.native : inner.handleCollapse;
            if (!/prevState\s*===\s*["']true["']/.test(String(native))) return;   // Zotero's own fix is in
            let setter = "";
            try { const d = Object.getOwnPropertyDescriptor(CP, "collapsed"); setter = d && d.set ? String(d.set) : ""; } catch (e) {}
            if (!/toggleAttribute\(\s*['"]collapsed['"]/.test(setter)) return;   // the setter writes "true" now
            wvWrap(inner, "handleCollapse", "ctxHeader", (this as any)._wvWireTag(), (orig: any) => function (this: any, prevState: any, newState: any) {
                const r = orig.call(this, prevState, newState);
                try {
                    if (prevState === "" && (!newState || newState === "false")) {
                        const Z = win.Zotero_Tabs;
                        const ctx = Z && typeof this._getItemContext === "function" ? this._getItemContext(Z.selectedID) : null;
                        if (ctx && typeof ctx.render === "function") ctx.render();
                    }
                } catch (e) {}
                return r;
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireCtxHeaderFix err: " + e); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134826 (forums.zotero.org/discussion/134826, upstream register #53).
    // Zotero 11: a window with no library view (a PDF or note moved to a window of its
    // own) can be narrowed until its open item pane and side navigation are cut off at
    // the right edge. ZoteroPane.updateLayoutConstraints sets --width-of-fixed-components
    // to 0px in such a window, and the window's minimum is max(that + 370, 570)
    // (_mainWindow.scss), so the item pane (min 320) and its side navigation (37) beside
    // the tabs deck (min 570) are not counted: 570px allowed for a 927px need. A window
    // with a library counts them (same function). Here: after Zotero's pass, in a window
    // without a library whose item pane is open beside the deck (standard layout), the
    // fixed width is set so the minimum is 570 + 320 + 37 -- the same minimums Zotero
    // uses. Closed pane, stacked layout, or a library window: Zotero's own value.
    //
    // RETIRE WHEN updateLayoutConstraints no longer zeroes the fixed width for a window
    // without a library (the gate reads its source). Tripwire in
    // test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireNarrowPaneFix(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            if (!ZP || typeof ZP.updateLayoutConstraints !== "function") return;
            const wraps = ZP._wvWraps && ZP._wvWraps.updateLayoutConstraints;
            const native = wraps ? wraps.native : ZP.updateLayoutConstraints;
            if (!/!this\.libraryView[\s\S]{0,200}--width-of-fixed-components['"]\s*,\s*['"]0px/.test(String(native))) return;   // Zotero's own fix is in
            wvWrap(ZP, "updateLayoutConstraints", "narrowPane", (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                try { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvNarrowPaneMin(win); } catch (e) {}
                return r;
            });
            try { ZP.updateLayoutConstraints(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvWireNarrowPaneFix err: " + e); }
    }

    /** The fixed width of a window without a library while its item pane is open beside
     *  the tabs deck: Zotero's minimum rule then gives 570 + 320 + 37 (WV-TEMP-134826). */
    _wvNarrowPaneMin(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            const doc = win && win.document;
            if (!ZP || !doc || ZP.libraryView) return;
            const stack = doc.getElementById("zotero-pane-stack");
            if (stack && stack.hidden) return;
            const CP = win.ZoteroContextPane;
            const stacked = Zotero.Prefs.get("layout") === "stacked" || !!Zotero.Prefs.get("tempStackedMode");
            if (!CP || CP.collapsed || stacked) return;
            // Keep in sync with Zotero's _variables.scss: $min-width-tabs-deck 570,
            // $min-width-item-pane 320, $width-sidenav 37, $min-width-items-pane 370
            // (the rule adds the last to the fixed width).
            const fixed = 570 + 320 + 37 - 370;
            doc.documentElement.style.setProperty("--width-of-fixed-components", fixed + "px");
        } catch (e) {}
    }

    _wvTeardownNarrowPaneFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                if (w && w.ZoteroPane && wvUnwrap(w.ZoteroPane, "updateLayoutConstraints", "narrowPane")) {
                    try { w.ZoteroPane.updateLayoutConstraints(); } catch (e) {}
                }
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134772 (forums.zotero.org/discussion/134772, upstream register #18).
    // Zotero 11.0-beta.4: right-click on a PDF page -> Automatically Resize, Zoom to Page
    // Width / Height, Split Horizontally / Vertically greyed and dead. ReaderInstance.
    // _openContextMenu builds each item by toggling its disabled attribute with
    // item.disabled as the force: an item with no `disabled` key passes undefined, which
    // is no `force`, and the call turns the attribute ON. (Not quoted as code here:
    // compat.spec.js scans the bundle, comments included, for that call form.) FIXED UPSTREAM: zotero 3e32faa0a (2026-11-14, linking the
    // thread): `!!item.disabled` -- not in a beta yet on 2026-11-18. Weavero's own entries
    // were already safe (lib/dom.ts wvReaderMenuEvent); this gives Zotero's own the same
    // boolean, before Zotero builds the menu: exactly what its fix does.
    //
    // RETIRE WHEN the beta ships 3e32faa0a: the gate (the unfixed line in the shared
    // ReaderInstance prototype's _openContextMenu) then installs nothing. Tripwire in
    // test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    /** Wraps the shared reader prototype's _openContextMenu once, from reader `r` (or
     *  any open reader): ReaderInstance is not exported, its prototype is on every
     *  reader's chain. Called by the reader toolbar handler (every reader) and init. */
    _wvWireReaderMenuFix(r?: any) {
        try {
            const P: any = this;
            if (P._wvReaderMenuProto) return;
            const R: any = (Zotero as any).Reader;
            const reader = r || (R && Array.isArray(R._readers) ? R._readers[0] : null);
            if (!reader) return;
            let proto = Object.getPrototypeOf(reader);
            while (proto && !Object.prototype.hasOwnProperty.call(proto, "_openContextMenu")) proto = Object.getPrototypeOf(proto);
            if (!proto) return;
            const wraps = proto._wvWraps && proto._wvWraps._openContextMenu;
            const native = wraps ? wraps.native : proto._openContextMenu;
            if (!/toggleAttribute\(\s*['"]disabled['"]\s*,\s*item\.disabled\s*\)/.test(String(native))) return;   // Zotero's own fix is in
            const fix = (items: any) => {
                if (!items || typeof items.length !== "number") return;
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    if (!it || typeof it !== "object") continue;
                    if (it.disabled === undefined) { try { it.disabled = false; } catch (e) {} }
                    if (it.groups && typeof it.groups.length === "number") for (let g = 0; g < it.groups.length; g++) fix(it.groups[g]);
                }
            };
            wvWrap(proto, "_openContextMenu", "menuDisabled", P._wvWireTag(), (orig: any) => function (this: any, params: any, ...rest: any[]) {
                try {
                    const groups = params && params.itemGroups;
                    if (groups && typeof groups.length === "number") for (let g = 0; g < groups.length; g++) fix(groups[g]);
                } catch (e) {}
                return orig.call(this, params, ...rest);
            });
            P._wvReaderMenuProto = proto;
        } catch (e) { Zotero.debug("[Weavero] _wvWireReaderMenuFix err: " + e); }
    }

    _wvTeardownReaderMenuFix() {
        try {
            const P: any = this;
            if (P._wvReaderMenuProto) wvUnwrap(P._wvReaderMenuProto, "_openContextMenu", "menuDisabled");
            P._wvReaderMenuProto = null;
        } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134824 (forums.zotero.org/discussion/134824, upstream registers #58, #59).
    // Zotero 11 with several windows: a new item made in one window (File > New Item,
    // New Standalone Note, a Connector save) takes the selection of every window showing
    // that list and wipes their quick search; a new collection or saved search moves
    // EVERY window and library tab onto it. Every library view's item tree and
    // collection tree observes the notifier and, on 'add', selects the new object unless
    // its extraData says `skipSelect` (collectionViewItemTree.jsx 822 + 1048,
    // itemTree.jsx handleRowModelUpdate 1349; collectionTree.jsx 1127 `selectRow`);
    // nothing in extraData names the window it came from. Zotero 10 had one view.
    // Here: each view's trees are wrapped; an 'add' reaching a view that is not the
    // active view of the active main window (where the command ran; the Connector's
    // target too) is passed on with `skipSelect` (on a copy: the notifier hands every
    // observer the same object), so Zotero's own keep-the-selection path runs there.
    //
    // RETIRE WHEN the collection tree's 'add' stops selecting in every view (the gate
    // reads `selectRow = ids.length == 1` without an active-window check in
    // collectionTree.notify) -- or a plain beta keeps the other windows as they were.
    // Tripwire in test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireAddSelectFix(win: any) {
        try {
            const P: any = this;
            const ZP = win && win.ZoteroPane;
            const views: any[] = ZP && Array.isArray(ZP.libraryViews) ? ZP.libraryViews : (ZP && ZP.libraryView ? [ZP.libraryView] : []);
            if (!views.length) return;
            const tag = P._wvWireTag();
            for (const view of views) {
                const ct = view && view.collectionsView;
                const it = view && view.itemsView;
                if (!ct || typeof ct.notify !== "function") continue;
                // Zotero's own notify, under Weavero's layers: tabs.ts
                // _wvGuardCollectionSelectCrossWindow (2026-07, a window's ACTIVE
                // collection tree, collections only: kept, and this one leaves that tree
                // alone) and wvWrap's table.
                const guarded = !!ct._wvOrigNotifyForSelectGuard;
                const cw = ct._wvWraps && ct._wvWraps.notify;
                const base = guarded ? ct._wvOrigNotifyForSelectGuard : (cw ? cw.native : ct.notify);
                const nat = String(base);
                if (!/selectRow\s*=\s*ids\.length\s*==\s*1/.test(nat) || /getActiveZoteroPane|isActiveView/.test(nat)) continue;   // Zotero's own fix is in
                const isOrigin = (tree: any) => {
                    try {
                        const lv = tree && tree.domEl && typeof tree.domEl.closest === "function" ? tree.domEl.closest("library-view") : null;
                        if (!lv) return true;   // a tree outside a library view (a dialog): Zotero's own
                        const ap = (Zotero as any).getActiveZoteroPane && (Zotero as any).getActiveZoteroPane();
                        return !!ap && ap.libraryView === lv;
                    } catch (e) { return true; }
                };
                const make = (types: string[]) => (orig: any) => function (this: any, action: any, type: any, ids: any, extraData: any, ...rest: any[]) {
                    try {
                        if (action === "add" && types.includes(type) && Array.isArray(ids) && !isOrigin(this)) {
                            const ed: any = Object.assign({}, extraData || {});
                            for (const id of ids) ed[id] = Object.assign({}, ed[id] || {}, { skipSelect: true });
                            extraData = ed;
                        }
                    } catch (e) {}
                    return orig.call(this, action, type, ids, extraData, ...rest);
                };
                if (!guarded) wvWrap(ct, "notify", "addSelect", tag, make(["collection", "search", "feed"]));
                if (it && typeof it.notify === "function") wvWrap(it, "notify", "addSelect", tag, make(["item"]));
            }
        } catch (e) { Zotero.debug("[Weavero] _wvWireAddSelectFix err: " + e); }
    }

    _wvTeardownAddSelectFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const ZP = w && w.ZoteroPane;
                const views: any[] = ZP && Array.isArray(ZP.libraryViews) ? ZP.libraryViews : (ZP && ZP.libraryView ? [ZP.libraryView] : []);
                for (const view of views) {
                    try { if (view && view.collectionsView) wvUnwrap(view.collectionsView, "notify", "addSelect"); } catch (e) {}
                    try { if (view && view.itemsView) wvUnwrap(view.itemsView, "notify", "addSelect"); } catch (e) {}
                }
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134825 (forums.zotero.org/discussion/134825, upstream register #50).
    // Zotero 11, several windows, one showing a PDF: after a restart the PDF window is
    // in front with the focus, not the window you were in. Zotero restores the window
    // you were in LAST (it moves to the end of the window list); a reader loading in
    // another window then takes the focus. Reproduced with no add-on, 5 of 5 (2026-11-17);
    // without a PDF window the focus held 2 of 3. Weavero's own restore shepherd for its
    // windows on older Zotero (tabs.ts _wvFocusShepherdStart) is off on Zotero's own
    // windows. Here, at application start only: once the windows and their readers have
    // settled, if the focus is not on the window Zotero restored last and the user has
    // not pressed a key or a button in any Zotero window meanwhile, that window gets the
    // focus back. Once. Behaviour gate: nothing to do when Zotero keeps it.
    //
    // RETIRE WHEN a plain beta keeps the window you were in after a restart with a PDF
    // window open (z6035-focus-probe.py --no-addon, register #50). No spec can restart
    // the runner; manual protocol: work/zotero-upstream-bugs.md #50 steps (needs an idle
    // machine: Windows' foreground lock).
    // ─────────────────────────────────────────────────────────────────────────
    _wvStartRestoreFocusFix() {
        try {
            const P: any = this;
            if (!wvNativeWindows() || P._wvRestoreFocusWatch) return;
            const st: any = { input: false, done: false, t0: Date.now() };
            P._wvRestoreFocusWatch = st;
            const onInput = (e: any) => { if (e && e.isTrusted !== false) st.input = true; };
            const heard = new Set<any>();
            const listen = () => {
                for (const w of wvMainWins() as any[]) {
                    if (heard.has(w)) continue;
                    heard.add(w);
                    try { w.addEventListener("mousedown", onInput, true); w.addEventListener("keydown", onInput, true); } catch (e) {}
                }
            };
            const finish = () => {
                st.done = true;
                for (const w of heard) { try { w.removeEventListener("mousedown", onInput, true); w.removeEventListener("keydown", onInput, true); } catch (e) {} }
                heard.clear();
            };
            st.finish = finish;
            let count = -1;
            let stableSince = Date.now();
            const busy = (w: any) => {
                try {
                    const Z = w.Zotero_Tabs;
                    if (!Z || !Array.isArray(Z._tabs) || !w.ZoteroPane) return true;
                    if (Z._tabs.some((t: any) => t && /-loading$/.test(String(t.type)))) return true;
                    const sel = Z._tabs.find((t: any) => t && t.id === Z.selectedID);
                    if (sel && String(sel.type) === "reader") {
                        const r: any = (Zotero as any).Reader.getByTabID(sel.id);
                        if (!r || !r._internalReader) return true;
                    }
                    return false;
                } catch (e) { return true; }
            };
            const tick = () => {
                try {
                    if (st.done) return;
                    if (P._wvDestroyed || st.input || Date.now() - st.t0 > 45000) { finish(); return; }
                    listen();
                    const wins: any[] = wvMainWins();
                    if (wins.length !== count) { count = wins.length; stableSince = Date.now(); }
                    if (Date.now() - stableSince < 3000 || wins.some(busy)) { wvTimeout(tick, 500); return; }
                    const target = wins[wins.length - 1];
                    const active = (Services as any).focus.activeWindow;
                    if (wins.length > 1 && target && !target.closed && active && active !== target && wins.includes(active)) {
                        Zotero.debug("[Weavero] WV-TEMP-134825: after the restart the focus was on another window; the window restored last gets it back");
                        try { target.focus(); } catch (e) {}
                    }
                    finish();
                } catch (e) { finish(); }
            };
            wvTimeout(tick, 1500);
        } catch (e) { Zotero.debug("[Weavero] _wvStartRestoreFocusFix err: " + e); }
    }

    _wvTeardownRestoreFocusFix() {
        try { const st = (this as any)._wvRestoreFocusWatch; if (st && !st.done && st.finish) st.finish(); } catch (e) {}
    }

    _wvTeardownCtxHeaderFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const inner = w && w.document && w.document.getElementById("zotero-context-pane-inner");
                if (inner) wvUnwrap(inner, "handleCollapse", "ctxHeader");
            } catch (e) {}
        }
    }
}

const _upstreamFixesDescriptors = Object.getOwnPropertyDescriptors(_UpstreamFixesMixin.prototype);
delete (_upstreamFixesDescriptors as any).constructor;
export const upstreamFixesMethods = _upstreamFixesDescriptors;
