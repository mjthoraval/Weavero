// Module: a tab locked on one side of a main window -- the locked tab stays on one side
// while the other side shows whichever other tab is selected.
//
// It began as the library kept beside every tab (forum 132980, jandavid 2026-11-14, on
// the split view of two tabs: "what I'm hoping for is have the library always open in
// the left split, and then in the right split be able to cycle through different open
// tabs and open/close tabs individually. So it shouldn't be a 'preview' pane in that it
// always shows what's selected in the library. But it should be independent from a
// particular split"; MJT: "Study the options for his request in a separate branch with
// A"). Then MJT, 2026-11-17, after "I have no way to see that I have locked the left
// part of the split view" (My Library's tab is pinned, icon only: the mark drawn before
// its title never showed), his picks:
//   - Any tab can be locked: every tab's menu has "Lock Tab" ("Unlock Tab" on the locked
//     tab, as Pin Tab / Unpin Tab -- MJT 2026-11-18; a checkbox before), one locked
//     tab per window, locking another moves the lock. The locked tab goes on the LEFT
//     at once, beside "the last viewed tab ... the active tab": the tab selected when
//     another tab is locked from its menu, else the tab viewed before the locked one,
//     which is then selected.
//   - The lock comes FIRST ("a tab in split view still appears as one single tab on the
//     side of a locked tab"): a pair's tab selected shows alone beside the locked tab;
//     the pair stays a pair -- drawn joined in the strip, recorded, its menus acting on
//     it -- and shows again once the lock is off. Locking a paired tab separates its
//     pair; a pair made WITH the locked tab ends the lock.
//   - The look: the locked tab marked in the STRIP only. First "Badge + 'locked'
//     header" (a badge on the corner of the tab's icon, at Firefox's own place for a
//     pinned tab's badges, and a header over the locked side); then, on trial.9, of
//     the header: "This top bar is also not needed", and of the badge alone, his pick
//     "Accent frame + accent padlock": a 2px frame around the whole tab (gold since
//     2026-11-18, the accent being the active side's colour; WV_TAB_DOCK_CSS), and the
//     badge a padlock (gold and alone since 2026-11-18, WV_LOCK_GOLD_ICON; white on an
//     accent round before). The tab's
//     tooltip says it is locked and what a click does.
//   - And (the same day: "For the locked tab, it would be useful to have a quick way
//     to collapse it and [expand it]") a collapse: the locked side leaves the screen
//     and the active tab has the window, as a tab alone -- first down to a thin rail
//     at the window's edge, then (trial.9: "The left band is not needed. A click on
//     the tab header should be sufficient") not drawn at all. The lock stays on,
//     switching tabs changes the tab shown as ever. A plain click on the locked tab
//     in the strip ("Try making a click on the tab header to toggle it collapsed or
//     expanded") collapses it, or expands it again at its ratio -- it does not select
//     it; a press inside its card does. The locked tab's menu ("Collapse Locked Tab"
//     / "Expand Locked Tab") and a command for a keyboard shortcut
//     (_wvTabDockToggleCollapsed, no key of its own) do the same; selecting the
//     locked tab another way (a key that switches tabs) shows it, expanded. Kept in
//     the lock's record; unlocking clears it.
//
// Neither Firefox nor Zotero has it (mirrors, 2026-11-14): Firefox's split view is a
// fixed pair, and a tab outside it is shown alone (tabsplitview.mjs on_TabSelect ->
// #suspend); Zotero's deck shows one tab at a time (tabs.js select).
//
// How it rides on the split view (tab-split.ts), drawing only its mark in the strip
// (below):
//   - A window's lock is `win._wvTDock` (`lib`: the locked tab, any kind -- the name is
//     the library's, from where it began, and other modules read it): its side, and ONE
//     split object whose other side is re-pointed at every tab selection
//     (_wvTabDockReconcile, called at the top of the split's own select and sync).
//     While that split has a tab to show it sits in the window's list of splits, marked
//     `dock`, and the split view draws it as any split: the cards, the bar between them,
//     each side's own panes, the partner kept drawing and loaded. The split view looks
//     up the split ON SCREEN for a tab through _wvTabSplitShownOf, which takes this
//     split before a pair; its passes over PAIRS (the pair drawn as one unit in the
//     strip, the two tabs kept together, the pair records, the pair's menus) skip it:
//     no tab moves.
//   - The record of the lock travels with the split records (the pref
//     weavero.tabSplits and a session's `splits`), marked `dock`: the same window
//     matching brings it back after a restart or a session switch.
//   - The locked tab keeps its own panes whatever the other side shows (a pair keeps
//     them only beside a PDF or a library): a library its own view's panes, a reader
//     its sidebar and item pane, open or closed, and their widths -- beside a note too
//     (MJT 2026-11-17 on trial.11, a locked PDF with both closed: "When I go to the
//     note tab, it toggles both panes in the locked tab"; tab-split.ts
//     _wvTabSplitNormalSide). The other side's are a pair's: its own beside a PDF or
//     a library, Zotero's own on a note.
//   - Collapsed, the lock's split leaves the window's list (as with no other tab to
//     show): Zotero's deck shows the selected tab alone, with its normal panes; the
//     split, its ratio and its sides' own panes wait in the lock.
//   - Unlock: the tab's menu (Unlock Tab), Separate Split View, or closing it.
//   - The padlock is Firefox's shape since MJT asked "What is this icon?" of the
//     side-panel glyph used first (2026-11-17); gold since 2026-11-18.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvIsLibraryTabID, wvMainWins } from "../lib/windows";
import { wvL10n, wvStr } from "../lib/l10n";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvListen, wvUnlisten } from "../lib/listen";

declare const Zotero: any;

/** The lock's sign on the tab's badge: Firefox's padlock (the address bar's, toolkit
 *  icons/security.svg, 16px, context-fill), shipped inside Zotero -- Zotero has no lock
 *  drawing of its own (no 16/universal/lock.svg, checked on 11.0-beta.4 2026-11-17).
 *  MJT 2026-11-17, on the side-panel glyph used before ("What is this icon?"): the
 *  padlock. A padlock has no side: never mirrored. */
const LOCK_ICON = "chrome://global/skin/icons/security.svg";
/** The lock's padlock in its usual colours, on the tab's badge and on the menu's Lock
 *  Tab / Unlock Tab (MJT 2026-11-18: "The lock tab icon should get the usual lock
 *  colours instead of this blue", his pick "Gold padlock", and "Lock tab in the menu
 *  should get the same icon as on the locked tab"): a gold body with a darker edge and
 *  keyhole, a steel-grey shackle, as the padlock emoji -- the same in light and dark
 *  (on the tab's icon, and in a menu beside the words). LOCK_ICON's shape, not
 *  its drawing: context-fill paints one colour only. No "(", ")" or "'" in the markup:
 *  MenuManager writes the icon into `url(...)` unquoted (menuManager.js
 *  --custom-menu-icon-light), and encodeURIComponent leaves those as they are. */
export const WV_LOCK_GOLD_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path d="M4.75 7.5V5.25a3.25 3.25 0 0 1 6.5 0V7.5" fill="none" stroke="#8a949d" stroke-width="1.7"/>'
    + '<rect x="2.5" y="7" width="11" height="8.25" rx="1.75" fill="#f5b30f" stroke="#a87100" stroke-width="1"/>'
    + '<circle cx="8" cy="10.4" r="1.2" fill="#6b4600"/>'
    + '<path d="M7.4 11h1.2v2.2H7.4z" fill="#6b4600"/>'
    + "</svg>").replace(/'/g, "%27");
/** The locked tab's frame in the strip, the padlock's gold (WV_TAB_DOCK_CSS): darker on
 *  the light tab bar (3.3:1 on #f2f2f2), the padlock's own on the dark one. */
const WV_LOCK_FRAME_LIGHT = "#b57800";
const WV_LOCK_FRAME_DARK = "#f5b30f";
/** The split view's sheet (tab-split.ts STYLE_ID), which holds the rules below: the
 *  strip mark is written only while it is in the window. */
const SPLIT_STYLE_ID = "wv-tsplit-style";
/** The strip's listeners for a click on the locked tab (_wvTabDockWireStrip). */
const STRIP_KEYS = ["tdock:strip:mousedown", "tdock:strip:click"];

/** Part of the split view's own sheet (tab-split.ts): the locked tab's mark in the
 *  strip, on the tab itself and on the icon a pinned tab is drawn as (Weavero's mirror
 *  of it, #wv-pinned-mirrors, or Zotero's own pinned tab), whether the lock is
 *  collapsed or not (MJT 2026-11-17, trial.9, his pick "Accent frame + accent padlock").
 *  - The frame: a 2px outline in the padlock's GOLD, drawn inside the tab's edge
 *    (outline-offset -2px), so the tab's width and padding stay as Zotero has them
 *    (src-ts.md, never vary padding between tabs); an outline follows the tab's own
 *    corners and paints above its background and its content, the selected tab's fill
 *    included -- but NOT above Weavero's selected ring (the Firefox look's 1px gradient
 *    band, a positioned ::before of the selected tab, tab-groups.ts
 *    _wvEnsureSelectedTabRing, on by default): it painted violet over the frame's edge
 *    whenever the locked tab was the selected one (1.2.0 gate, 2026-11-19, every full
 *    Zotero 11 run and CI). A locked tab draws no ring: its gold frame is its mark,
 *    selected or not; the selected fill still says it is selected. Gold, not Zotero's accent: the active side's
 *    card is framed in the accent (tab-split.ts .wv-tsplit-active), and an accent frame
 *    on the locked tab said the side you are on was the locked one (MJT 2026-11-18 on
 *    1.1.1-dev.7: "The blue line around the locked tab and around the focused tab
 *    suggest that the focused tab is the locked tab, which is wrong"). One colour per
 *    meaning: blue = the side you are on, gold = locked. Light: a darker gold, 3.3:1 on
 *    the light tab bar (WCAG 1.4.11 asks 3:1 of a control's mark); dark: the padlock's
 *    own gold.
 *  - The badge: on the corner of the tab's icon where Firefox puts a pinned tab's
 *    badges (tabs.css .tab-icon-overlay: `padding: 2px; top: -7px; inset-inline-end:
 *    -7px`, over the icon, above the title), the gold padlock (WV_LOCK_GOLD_ICON) at
 *    12px (Firefox's small badge drawings are 12px: tab-audio-playing-small.svg), alone:
 *    until trial.14 a white padlock on an accent round ("this blue"), on trial.15 on a
 *    white round ("No white background for the lock icon", MJT 2026-11-18). Its own
 *    dark edge and keyhole keep it apart from the icon under it. On the tab's icon, so
 *    it shows on a pinned tab as on any tab; out of the layout. A ::before: the
 *    group-library badge is the icon's ::after (tabs.ts _decorateTabBar).
 *  - The tab on screen beside the locked one, when it is not the selected tab
 *    (`data-wv-tdock-beside`, _wvTabDockMarkStrip): the fill of Firefox's split-view
 *    wrapper -- the pair's pill in tab-split.ts, the same values (Zotero's
 *    --fill-quinary; the lavender tint with Weavero's Firefox look, the
 *    #wv-selected-tab-ring sheet). With the locked tab selected, it shows which tab
 *    is on the other side (MJT 2026-11-18).
 *  - High contrast: a DASHED frame in the text colour (the active card's frame there is
 *    solid SelectedItem), and Zotero's own accent pair on the badge (SelectedItem,
 *    SelectedItemText) with Firefox's one-colour padlock (LOCK_ICON) -- fixed colours do
 *    not belong there. */
export const WV_TAB_DOCK_CSS = `
#tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock] {
  outline: 2px solid ${WV_LOCK_FRAME_LIGHT} !important; outline-offset: -2px !important;
}
@media (prefers-color-scheme: dark) {
  #tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock] { outline-color: ${WV_LOCK_FRAME_DARK} !important; }
}
#tab-bar-container .tab.selected[data-wv-tdock]::before,
#tab-bar-container #wv-pinned-mirrors .wv-pinned-mirror.selected[data-wv-tdock]::before {
  background: none !important;
}
#tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock-beside]:not(.selected) {
  background-color: var(--fill-quinary) !important;
}
:root:has(#wv-selected-tab-ring) #tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock-beside]:not(.selected) {
  background-color: rgba(117, 102, 159, 0.25) !important;
}
@media (prefers-color-scheme: dark) {
  :root:has(#wv-selected-tab-ring) #tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock-beside]:not(.selected) {
    background-color: rgba(182, 170, 217, 0.25) !important;
  }
}
#tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock] .tab-icon { position: relative; overflow: visible; }
#tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock] .tab-icon::before {
  content: ""; position: absolute; z-index: 1; top: -7px; inset-inline-end: -7px;
  box-sizing: content-box; width: 12px; height: 12px; padding: 2px; border-radius: 50%;
  background: url("${WV_LOCK_GOLD_ICON}") center / 12px 12px no-repeat;
  pointer-events: none;
}
@media (forced-colors) {
  #tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock] { outline: 2px dashed CanvasText !important; outline-offset: -2px !important; }
  #tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock-beside]:not(.selected) {
    background-color: SelectedItemText !important; outline: 1px solid SelectedItem !important; outline-offset: -1px !important;
  }
  #tab-bar-container :is(.tab, .wv-pinned-mirror)[data-wv-tdock] .tab-icon::before {
    background: SelectedItem url("${LOCK_ICON}") center / 12px 12px no-repeat;
    -moz-context-properties: fill, fill-opacity; fill: SelectedItemText; box-shadow: none; outline: 1px solid CanvasText;
  }
}
`;

/** A window's lock (`win._wvTDock`). `lib`: the locked tab, any kind; `split`: the one
 *  split of the lock, a tab-split.ts WvTabSplit marked `dock`; `last`: the tab on the
 *  other side, or the one shown there last; `lastDesc`: that tab by what it shows, from
 *  a record, until it is found; `mru`: the tabs selected in this window, the latest
 *  first; `collapsed`: the locked side off the screen, the lock kept. */
export type WvTabDock = { lib: string; side: "left" | "right"; split: any; last: string | null; lastDesc?: string | null; mru: string[]; sel?: string | null; sig?: string; collapsed?: boolean };

const live = () => wvLivePlugin();

function tabIn(win: any, id: any): any {
    try { return win && win.Zotero_Tabs && id ? win.Zotero_Tabs._tabs.find((t: any) => t && t.id === id) || null : null; } catch (e) { return null; }
}
function isLibTab(t: any): boolean {
    return !!t && (wvIsLibraryTabID(t.id) || /^library(-|$)/.test(String(t.type || "")));
}

/** The tabs selected in each main window, the latest first, whether a tab is locked or
 *  not: the tab "viewed before" the one being locked. Keyed by the window, outside it (no
 *  expando on Zotero's window; nothing here keeps a closed one). */
const seenByWin: WeakMap<any, string[]> = new WeakMap();
function seenOf(win: any): string[] {
    let a = seenByWin.get(win);
    if (!a) { a = []; seenByWin.set(win, a); }
    return a;
}

/** A tab the lock of `win` may show beside its locked tab: any other tab of the window,
 *  a pair's too (the lock comes first), but not one Add Split View's picker waits on. */
function freeOf(P: any, win: any, d: WvTabDock): (id: any) => boolean {
    return (id: any) => !!id && id !== d.lib && !!tabIn(win, id)
        && !P._wvTabSplits(win).some((x: any) => x.picker && (x.left === id || x.right === id));
}

class _TabSplitDockMixin {
    /** The lock of `win`, or null. */
    _wvTabDockOf(win: any): WvTabDock | null {
        try {
            const d = win && win._wvTDock;
            return d && typeof d === "object" && d.split && d.lib ? d : null;
        } catch (e) { return null; }
    }

    /** The tab locked in `win`, or null. */
    _wvTabDockLib(win: any): string | null {
        const d = this._wvTabDockOf(win);
        return d ? d.lib : null;
    }

    /** `tabID` is the tab locked in `win` (on screen or not): no pair takes it when the
     *  splits come back (tab-split.ts _wvTabSplitRestore). */
    _wvTabDockHolds(win: any, tabID: any): boolean {
        const d = this._wvTabDockOf(win);
        return !!d && !!tabID && d.lib === tabID;
    }

    /** The tab selected in `win` now, first in the window's list of tabs seen. */
    _wvTabDockSeen(win: any) {
        try {
            const Z: any = win && win.Zotero_Tabs;
            const sel = Z && Z.selectedID;
            if (!sel) return;
            const a = seenOf(win);
            const i = a.indexOf(sel);
            if (i === 0) return;
            if (i > 0) a.splice(i, 1);
            a.unshift(sel);
            if (a.length > 40) a.length = 40;
        } catch (e) {}
    }

    /** Lock tab `tabID` of `win`; `tabID` null: unlock. One locked tab per window:
     *  locking another moves the lock. A pair the tab is in ends. The locked tab goes on
     *  the left (or `opts.side`) at once, beside the active tab: the tab selected now,
     *  or -- the locked tab being the selected one -- the tab viewed before it, which is
     *  selected (MJT 2026-11-17: "the last viewed tab on its right - the active tab").
     *  False when the split view is off or `tabID` is not a tab of `win`. */
    _wvTabDockSet(win: any, tabID: any, opts: { side?: string; ratio?: number; panes?: any; lastDesc?: string | null; collapsed?: boolean; restoring?: boolean } = {}): boolean {
        try {
            const P: any = this;
            if (!win || !win.Zotero_Tabs) return false;
            const cur = this._wvTabDockOf(win);
            if (!tabID) { if (cur) this._wvTabDockEnd(win); return true; }
            if (!P._wvTabSplitOn() || !tabIn(win, tabID)) return false;
            if (cur && cur.lib === tabID) return true;
            if (cur) this._wvTabDockEnd(win, true);
            // A pair the tab is in, or Add Split View's picker on it: gone.
            for (const old of P._wvTabSplits(win).slice()) {
                if (!old.dock && (old.left === tabID || old.right === tabID)) P._wvTabSplitRemove(win, old.id);
            }
            const ratio = typeof opts.ratio === "number" && opts.ratio > 0 && opts.ratio < 1 ? opts.ratio : 0.5;
            const split: any = { id: "tsplit-dock-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), left: tabID, right: null, ratio, dock: true };
            if (opts.panes && typeof opts.panes === "object") split.panes = opts.panes;
            const d: WvTabDock = { lib: tabID, side: opts.side === "right" ? "right" : "left", split, last: null, lastDesc: opts.lastDesc || null,
                mru: seenOf(win).filter((id) => id !== tabID) };
            if (opts.collapsed) d.collapsed = true;
            win._wvTDock = d;
            P._wvTabSplitRing("lock: on for " + tabID + " (" + d.side + ")");
            // A restart's or a session's record: its caller records and draws.
            if (opts.restoring) return true;
            P._wvTabSplitPersist();
            const Z: any = win.Zotero_Tabs;
            const sel = Z.selectedID;
            const beside = sel && sel !== tabID ? sel : this._wvTabDockFallback(win, d, freeOf(P, win, d));
            if (beside && beside !== sel) { try { Z.select(beside); } catch (e) {} }
            P._wvTabSplitSync(win);
            this._wvTabDockAfterSwap(win);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockSet err: " + e); return false; }
    }

    /** The lock of `win` ends: its split off the screen, the locked tab's and the other
     *  tab's normal panes back, nothing of it left on the window. `quiet`: the caller
     *  draws. */
    _wvTabDockEnd(win: any, quiet?: boolean) {
        try {
            const P: any = this;
            const d = this._wvTabDockOf(win);
            if (!d) return;
            this._wvTabDockHide(win, d);
            delete win._wvTDock;
            this._wvTabDockMarkStrip(win);
            P._wvTabSplitRing("lock: off");
            if (!P._wvQuitting) P._wvTabSplitPersist();
            if (!quiet) P._wvTabSplitSync(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockEnd err: " + e); }
    }

    /** Collapse the locked side of `win` (`on`: off the screen, the active tab alone
     *  in the window), or expand it again at its ratio, which a collapse never
     *  changes, the selection as it is. False when no tab is locked there. */
    _wvTabDockSetCollapsed(win: any, on: boolean): boolean {
        try {
            const P: any = this;
            const d = this._wvTabDockOf(win);
            if (!d) return false;
            if (!!d.collapsed === !!on) return true;
            if (on) d.collapsed = true; else delete d.collapsed;
            P._wvTabSplitRing("lock: " + (on ? "collapsed" : "expanded"));
            P._wvTabSplitPersist();
            // Collapsed with the locked tab selected (a click on it in the strip, its
            // menu, the command): the tab beside it keeps the window, selected -- the
            // locked tab selected is the locked tab shown (_wvTabDockReconcile).
            const Z: any = win.Zotero_Tabs;
            if (on && Z && Z.selectedID === d.lib && d.last && tabIn(win, d.last)) { try { Z.select(d.last); } catch (e) {} }
            P._wvTabSplitSync(win);
            P._wvTabSplitDrawLayer(win);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockSetCollapsed err: " + e); return false; }
    }

    /** The command a keyboard shortcut runs (it has no key of its own): the locked
     *  side of `win` collapsed, or expanded again. False when no tab is locked there. */
    _wvTabDockToggleCollapsed(win: any): boolean {
        const d = this._wvTabDockOf(win);
        return !!d && this._wvTabDockSetCollapsed(win, !d.collapsed);
    }

    /** The lock's split leaves the window's list (nothing to show beside the locked
     *  tab, or a picker on screen): the split view gives the normal panes back, a locked
     *  library's own kept in the split first -- once the split is out of the list its
     *  view takes the normal ones (tab-split.ts _wvTabSplitLibReconcile). True when it
     *  was in the list. */
    _wvTabDockHide(win: any, d: WvTabDock): boolean {
        try {
            const P: any = this;
            const s = d.split;
            if (P._wvTabSplits(win).indexOf(s) < 0) return false;
            this._wvTabDockKeepLibPanes(win, d);
            P._wvTabSplitRemove(win, s.id);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockHide err: " + e); return false; }
    }

    /** A locked library's own panes as its view has them now, into the split. */
    _wvTabDockKeepLibPanes(win: any, d: WvTabDock) {
        try {
            const P: any = this;
            const map = win._wvTSplitLibNormal;
            const own = d.split.panes && d.split.panes[d.side];
            if (!own || !(map instanceof Map) || !map.has(d.lib)) return;
            const root = P._wvTabSplitLibRoot(win, d.lib);
            if (root) own.lib = P._wvTabSplitLibRead(root);
        } catch (e) {}
    }

    /** The lock's split for the tab selected now, before the split view lays the
     *  window out (tab-split.ts _wvTabSplitSelectNow and _wvTabSplitSync call this
     *  first): the other side is the selected tab, a pair's tab included (the lock
     *  comes first: MJT 2026-11-17, "a tab in split view still appears as one single
     *  tab on the side of a locked tab"); with the locked tab itself selected, the tab
     *  shown there last, else the tab used before it; with no other tab, Add Split
     *  View's picker on the selected tab, or the lock collapsed, the split leaves the
     *  list. Ends the lock when its tab is gone or was put in a pair. Idempotent. */
    _wvTabDockReconcile(win: any) {
        try {
            const P: any = this;
            this._wvTabDockSeen(win);
            const d = this._wvTabDockOf(win);
            if (!d || P._wvDestroyed || P._wvQuitting || !win || win.closed) return;
            const Z: any = win.Zotero_Tabs;
            if (!Z || !Array.isArray(Z._tabs)) return;
            const splits: any[] = P._wvTabSplits(win);
            const s = d.split;
            const shown = splits.indexOf(s) >= 0;
            // Another split of the locked tab: a pair ends the lock; Add Split View's
            // picker on it takes the screen meanwhile.
            const lockOther = splits.filter((x: any) => x !== s && (x.left === d.lib || x.right === d.lib));
            if (!tabIn(win, d.lib) || lockOther.some((x: any) => !x.picker)) { this._wvTabDockEnd(win); return; }
            const sel = Z.selectedID;
            const free = freeOf(P, win, d);
            // The locked tab selected (a key that switches tabs, a session; a plain click
            // on it in the strip toggles the collapse instead, _wvTabDockStripClick):
            // shown, expanded.
            if (sel === d.lib && d.collapsed) {
                delete d.collapsed;
                P._wvTabSplitRing("lock: expanded (the locked tab selected)");
                this._wvTabDockPersistSoon();
            }
            if (sel && sel !== d.lib) {
                const i = d.mru.indexOf(sel);
                if (i !== 0) { if (i > 0) d.mru.splice(i, 1); d.mru.unshift(sel); if (d.mru.length > 40) d.mru.length = 40; }
            }
            let right: string | null = null;
            // Collapsed: nothing beside the locked tab -- the selected tab alone, as
            // Zotero shows a tab (MJT 2026-11-17, trial.9).
            if (P._wvTabSplitOn() && !lockOther.length && !d.collapsed) {
                if (sel === d.lib) {
                    if (free(d.last)) right = d.last;
                    else {
                        // After a restart: the tab that was there, by what it shows.
                        if (d.lastDesc) {
                            const t = Z._tabs.find((x: any) => x && free(x.id) && P._wvTabSplitDescOf(x) === d.lastDesc);
                            if (t) right = t.id;
                        }
                        if (!right) right = this._wvTabDockFallback(win, d, free);
                    }
                }
                else if (free(sel)) right = sel;
            }
            const selWas = d.sel;
            d.sel = sel;
            if (!right) {
                if (shown) { this._wvTabDockHide(win, d); P._wvTabSplitRing("lock: off screen (selected " + sel + ")"); }
                this._wvTabDockNote(win, d, null);
                this._wvTabDockMarkStrip(win);
                return;
            }
            const changed = !shown || d.last !== right;
            d.last = right;
            d.lastDesc = null;
            const L = d.side === "right" ? right : d.lib, R = d.side === "right" ? d.lib : right;
            if (s.left !== L) s.left = L;
            if (s.right !== R) s.right = R;
            if (!shown) splits.push(s);
            // A locked library keeps its own panes beside a note too (the split view
            // forms them only for a split that keeps both sides' panes).
            if (!P._wvTabSplitManaged(win, s) && isLibTab(tabIn(win, d.lib))) {
                if (!s.panes) s.panes = {};
                if (!s.panes[d.side]) s.panes[d.side] = { ctx: false, sb: false, sbW: null };
                P._wvTabSplitLibForm(win, s);
            }
            if (changed) {
                P._wvTabSplitRing("lock: " + right + " beside " + d.lib + " (selected " + sel + ")");
                // The other side changed with no tab selected (the tab there was
                // closed, or a tab opened in the background, while the locked tab is
                // the active side): what a selection would have done for it.
                if (sel === d.lib && selWas === d.lib) {
                    const st = win._wvTSplitPanes;
                    if (shown && st && st.id === s.id) { try { P._wvTabSplitSidebarsApply(win, s); } catch (e) {} }
                    this._wvTabDockAfterSwap(win);
                }
            }
            this._wvTabDockNote(win, d, right);
            // The tab beside it marked in the strip at once (its own pass runs on the
            // strip's next mutation, which a change of the other side alone may not make).
            this._wvTabDockMarkStrip(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockReconcile err: " + e); }
    }

    /** Tabs closed (the split view's tab observer, _wvTabSplitOnClose): when one of
     *  them is on screen in the lock's split, the split is re-pointed and laid out
     *  NOW, in the observer's own turn. Zotero removes a closed tab's panel in its
     *  next task (tabs.js close), and the sync the observer schedules comes after
     *  that one: a frame of the locked tab beside an empty side. A tab Zotero re-adds
     *  in place (its unload: same id) is still there, and nothing is done. */
    _wvTabDockOnClose(win: any, ids: any[]) {
        try {
            const P: any = this;
            const d = this._wvTabDockOf(win);
            if (!d || !ids || !ids.length) return;
            const s = d.split;
            if (P._wvTabSplits(win).indexOf(s) < 0) return;
            const gone = [s.left, s.right].filter((id: any) => ids.includes(id) && !tabIn(win, id));
            if (!gone.length) return;
            P._wvTabSplitSync(win);
            if (P._wvTabSplits(win).indexOf(s) >= 0) P._wvTabSplitDrawLayer(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockOnClose err: " + e); }
    }

    /** The record follows the window's tabs and the tab shown: again a moment
     *  after either changed (a record carries its window's tabs, tab-split.ts
     *  fingerprintOf). */
    _wvTabDockNote(win: any, d: WvTabDock, right: string | null) {
        try {
            const sig = win.Zotero_Tabs._tabs.map((t: any) => t && t.id).join(",") + "|" + (right || "") + "|" + d.side;
            if (sig === d.sig) return;
            const first = d.sig == null;
            d.sig = sig;
            if (!first) this._wvTabDockPersistSoon();
        } catch (e) {}
    }

    /** The tab to show beside the locked tab when none is there: the tab selected last
     *  in this window, else by Zotero's own clock (tabs.js timeSelected /
     *  timeUnselected, in whole seconds), else the locked tab's neighbour in the strip
     *  (the order Zotero's close picks its next tab in). */
    _wvTabDockFallback(win: any, d: WvTabDock, free: (id: any) => boolean): string | null {
        try {
            const Z: any = win.Zotero_Tabs;
            for (const id of d.mru) if (free(id)) return id;
            let best: any = null, bt = 0;
            for (const t of Z._tabs) {
                if (!t || !free(t.id)) continue;
                const ts = Math.max(Number(t.timeSelected) || 0, Number(t.timeUnselected) || 0);
                if (ts > bt) { bt = ts; best = t; }
            }
            if (best) return best.id;
            const li = Z._tabs.findIndex((t: any) => t && t.id === d.lib);
            const next = Z._tabs.slice(li + 1).concat(Z._tabs.slice(0, Math.max(0, li)).reverse()).find((t: any) => t && free(t.id));
            return next ? next.id : null;
        } catch (e) { return null; }
    }

    /** The other side changed without a tab selection, the locked tab being the
     *  selected one: the item pane beside it shows the new tab's item (the split view
     *  does this after every selection, tab-split.ts _wvTabSplitContextPane), and the
     *  layout follows. Not while Zotero's own selection handler runs: the split view's
     *  wrap does it then. */
    _wvTabDockAfterSwap(win: any) {
        try {
            win.setTimeout(async () => {
                try {
                    const lp = live();
                    const d = lp && !lp._wvDestroyed && !win.closed ? lp._wvTabDockOf(win) : null;
                    if (!d || win._wvTSplitSelecting || win.Zotero_Tabs.selectedID !== d.lib) return;
                    if (lp._wvTabSplits(win).indexOf(d.split) < 0) return;
                    await lp._wvTabSplitContextPane(win);
                    lp._wvTabSplitPinsAfterSelect(win);
                    lp._wvTabSplitRelayout(win);
                } catch (e) {}
            }, 0);
        } catch (e) {}
    }

    /** Reverse Tabs on the lock's split (tab-split.ts _wvTabSplitReverse hands it
     *  over): the locked tab to the other side, each side with its width and its own
     *  panes. */
    _wvTabDockReverse(win: any) {
        try {
            const P: any = this;
            const d = this._wvTabDockOf(win);
            if (!d) return;
            const s = d.split;
            const st = win._wvTSplitPanes;
            const mine = !!st && st.id === s.id;
            // What the user did to Zotero's pane is the live side's, before it moves.
            if (mine) { try { P._wvTabSplitPanesCapture(win, s); } catch (e) {} }
            this._wvTabDockKeepLibPanes(win, d);
            d.side = d.side === "left" ? "right" : "left";
            s.ratio = 1 - s.ratio;
            const l = s.left; s.left = s.right; s.right = l;
            if (s.panes) {
                const pl = s.panes.left, pr = s.panes.right;
                if (pr) s.panes.left = pr; else delete s.panes.left;
                if (pl) s.panes.right = pl; else delete s.panes.right;
            }
            if (mine && st.live) st.live = st.live === "left" ? "right" : "left";
            P._wvTabSplitRing("lock: to the " + d.side);
            P._wvTabSplitPersist();
            P._wvTabSplitSync(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockReverse err: " + e); }
    }

    /** Separate Split View on the lock's split ends the lock (tab-split.ts
     *  _wvTabSplitSeparate asks first). True when `splitID` was its split. */
    _wvTabDockSeparate(win: any, splitID: string): boolean {
        const d = this._wvTabDockOf(win);
        if (!d || d.split.id !== splitID) return false;
        this._wvTabDockEnd(win);
        return true;
    }

    /** The locked tab marked in the strip, whatever tab is selected and whether its
     *  split is on screen or not (the frame and the badge, CSS above; the value: the
     *  side of the window it is locked on), its tooltip with the lock's line
     *  (_wvTabDockTip); every other mark and line removed. The tab itself and the icon
     *  a pinned tab is drawn as (Weavero's #wv-pinned-mirrors: the pinned .tab is
     *  hidden behind it). The strip's listeners for a click on the locked tab are wired
     *  here too: a rebuilt tab bar gets them. Called with the split view's own strip
     *  pass, on every tab-bar mutation: an attribute is written only when it changes.
     *  Only while the split view's sheet is in the window: the lock's data outlives the
     *  split view's teardown on purpose (_wvTabDockUnwireAll), and the tab bar's
     *  observer (tabs.ts) calls this pass on every strip mutation -- it marked the tab
     *  again 400ms after the split view's teardown, with nothing left to draw it. */
    _wvTabDockMarkStrip(win: any) {
        try {
            const P: any = this;
            const doc = win.document;
            const d = this._wvTabDockOf(win);
            const lock = d && !P._wvDestroyed && P._wvTabSplitOn() && doc.getElementById(SPLIT_STYLE_ID) ? d.lib : null;
            const side = lock ? this._wvTabDockScreenSide(win) : "";
            // The tab on screen beside the locked one (MJT 2026-11-18 on dev.7: "if I
            // focus the locked tab, I do not have any visual information of which tab is
            // currently on the other side"): marked `data-wv-tdock-beside`, drawn with the
            // fill Firefox's split-view wrapper gives the tab of a split that is not the
            // selected one (WV_TAB_DOCK_CSS; tab-split.ts draws a pair the same way). Only
            // while the lock's split is on screen (not collapsed, not off the list).
            let beside: string | null = null;
            if (lock && d && P._wvTabSplits(win).indexOf(d.split) >= 0) {
                const o = d.split.left === lock ? d.split.right : (d.split.right === lock ? d.split.left : null);
                beside = o || null;
            }
            const sel = lock
                ? "#tab-bar-container .tab[data-id], #tab-bar-container .wv-pinned-mirror[data-tab-id]"
                : "#tab-bar-container [data-wv-tdock], #tab-bar-container [data-wv-tdock-beside]";
            for (const el of doc.querySelectorAll(sel)) {
                const id = el.getAttribute("data-id") || el.getAttribute("data-tab-id");
                const by = !!beside && id === beside;
                if (by !== el.hasAttribute("data-wv-tdock-beside")) {
                    if (by) el.setAttribute("data-wv-tdock-beside", "true");
                    else el.removeAttribute("data-wv-tdock-beside");
                }
                const on = !!lock && id === lock;
                if (!on && !el.hasAttribute("data-wv-tdock")) continue;
                if (on) { if (el.getAttribute("data-wv-tdock") !== side) el.setAttribute("data-wv-tdock", side); }
                else el.removeAttribute("data-wv-tdock");
                this._wvTabDockTipOn(win, el, id);
            }
            // The strip's click listeners only while a lock is drawn: an unlock left them
            // wired, and a reload (which wires them only for a lock) then counted them
            // as lost (zz-reload-listeners, citedby picked set, 2026-11-20).
            if (lock) this._wvTabDockWireStrip(win);
            else {
                const cont = doc.getElementById("tab-bar-container");
                if (cont) for (const k of STRIP_KEYS) wvUnlisten(cont, k);
            }
        } catch (e) {}
    }

    /** The lock's line under a tab's tooltip: that it is locked, and what a click on it
     *  does now ($collapsed). */
    _wvTabDockTipLine(collapsed: boolean): string {
        return wvStr("weavero-dock-tab-tip", { collapsed: collapsed ? "yes" : "no" }, null);
    }

    /** `base`, a tab's own tooltip, with the lock's line under it when `tabID` is the
     *  tab locked in `win` and the lock is drawn (the split view's sheet in the window);
     *  else `base`. Weavero's pinned icon writes its tooltip through this too (tabs.ts
     *  _applyPinnedTabs), so the two writers agree. */
    _wvTabDockTip(win: any, tabID: any, base: string): string {
        try {
            const P: any = this;
            const d = this._wvTabDockOf(win);
            if (!d || d.lib !== tabID || P._wvDestroyed || !P._wvTabSplitOn() || !win.document.getElementById(SPLIT_STYLE_ID)) return base;
            const line = this._wvTabDockTipLine(!!d.collapsed);
            return base ? base + "\n" + line : line;
        } catch (e) { return base; }
    }

    /** A tab's tooltip in the strip as _wvTabDockTip has it. Zotero's tab: its title's
     *  own tooltip (tabBar.jsx, `.tab-name` title, rewritten by React only when the
     *  title changes) with the line under it, and the same on the tab itself, which
     *  Zotero gives none (its icon, a pinned tab drawn as an icon); Weavero's pinned
     *  icon: the tab's title with the line. Without the lock, or `off` (a teardown,
     *  which keeps the lock on the window), the line goes and the tab's own tooltip is
     *  Zotero's again. */
    _wvTabDockTipOn(win: any, el: any, id: any, off?: boolean) {
        try {
            const lines = [this._wvTabDockTipLine(true), this._wvTabDockTipLine(false)];
            const strip = (t: string) => {
                for (const l of lines) {
                    if (t === l) return "";
                    if (t.endsWith("\n" + l)) return t.slice(0, t.length - l.length - 1);
                }
                return t;
            };
            const set = (x: any, v: string | null) => {
                if (v == null || v === "") { if (x.hasAttribute("title")) x.removeAttribute("title"); }
                else if (x.getAttribute("title") !== v) x.setAttribute("title", v);
            };
            if (el.classList.contains("wv-pinned-mirror")) {
                const t = tabIn(win, id);
                const title = (t && t.title) || "";
                set(el, off ? title : this._wvTabDockTip(win, id, title));
                return;
            }
            const name = el.querySelector(".tab-name");
            const base = name ? strip(name.getAttribute("title") || "") : "";
            const tip = off ? base : this._wvTabDockTip(win, id, base);
            if (name && (name.getAttribute("title") || "") !== tip) name.setAttribute("title", tip);
            // The tab's own tooltip is Weavero's alone: Zotero sets none there.
            set(el, tip === base ? null : tip);
        } catch (e) {}
    }

    /** A plain click on the locked tab in the strip toggles the collapse instead of
     *  selecting the tab (MJT 2026-11-17, trial.9: "Try making a click on the tab
     *  header to toggle it collapsed or expanded"). Zotero selects on the press
     *  (tabBar.jsx handleTabMouseDown, React's listener on #tab-bar-container, its
     *  root) and Weavero's pinned icon does too (tabs.ts): the press stops here, in the
     *  container's capture phase, before either; the toggle comes on the click, which
     *  a drag never fires, so a drag of the tab still moves it. Keyed listeners: a
     *  wired container is left as it is. */
    _wvTabDockWireStrip(win: any) {
        try {
            const P: any = this;
            const cont = win.document.getElementById("tab-bar-container");
            if (!cont) return;
            const tag = P._wvWireTag();
            wvListen(cont, STRIP_KEYS[0], "mousedown", (e: any) => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabDockStripPress(win, e); }, true, tag);
            wvListen(cont, STRIP_KEYS[1], "click", (e: any) => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabDockStripClick(win, e); }, true, tag);
        } catch (e) {}
    }

    /** `e` is a plain press or click of the main button on the locked tab of `win`, or
     *  on the icon its pinned tab is drawn as -- not on its close or sound button. Every
     *  other press keeps Zotero's meaning: the middle button closes, the right one opens
     *  the tab's menu, Ctrl and Shift build a selection (tab-groups.ts). */
    _wvTabDockStripHit(win: any, e: any): boolean {
        try {
            const P: any = this;
            if (!e || e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return false;
            const d = this._wvTabDockOf(win);
            if (!d || P._wvDestroyed || !P._wvTabSplitOn()) return false;
            const t = e.target;
            if (!t || typeof t.closest !== "function" || t.closest(".tab-close, .tab-audio-status")) return false;
            const el = t.closest(".tab[data-id], .wv-pinned-mirror[data-tab-id]");
            return !!el && el.hasAttribute("data-wv-tdock") && (el.getAttribute("data-id") || el.getAttribute("data-tab-id")) === d.lib;
        } catch (er) { return false; }
    }

    /** The press on the locked tab: no selection (the click toggles). */
    _wvTabDockStripPress(win: any, e: any) {
        if (this._wvTabDockStripHit(win, e)) e.stopPropagation();
    }

    /** The click on the locked tab: collapsed, the active tab keeping the window and
     *  the selection; or expanded again at its ratio, the selection as it is. */
    _wvTabDockStripClick(win: any, e: any) {
        if (!this._wvTabDockStripHit(win, e)) return;
        e.stopPropagation();
        const P: any = this;
        try { P._wvTabSplitRing("lock: a click on the locked tab in the strip"); } catch (er) {}
        this._wvTabDockToggleCollapsed(win);
    }

    /** The side of the window the locked tab is drawn on, "left" or "right" on screen:
     *  the lock's side ("left" is the split's first card, which a right-to-left window
     *  draws on the right): the value of its mark in the strip. */
    _wvTabDockScreenSide(win: any): "left" | "right" {
        const d = this._wvTabDockOf(win);
        let rtl = false;
        try { rtl = win.getComputedStyle(win.document.getElementById("tabs-deck")).direction === "rtl"; } catch (e) {}
        return ((!!d && d.side === "right") !== rtl) ? "right" : "left";
    }

    /** Every tab's menu entry "Lock Tab", "Unlock Tab" on the tab locked in this window
     *  (as Pin Tab / Unpin Tab; MJT 2026-11-18 "The lock menu should change to unlock,
     *  same as for pin tab" -- a checkbox until trial.14), with the lock's padlock
     *  (WV_LOCK_GOLD_ICON, the badge's). One tab only (as the split view's own entries
     *  for one tab). One of the split view's tab-menu entries (tab-split.ts
     *  _wvTabSplitRegisterMenus), placed after them (tabs.ts _wvTabMenuOrder, key
     *  "dockLibrary"). */
    _wvTabDockMenu(): any {
        const winOf = (ctx: any) => ctx.menuElem && ctx.menuElem.ownerDocument && ctx.menuElem.ownerDocument.defaultView;
        // The id spelled here, in the method: the menu-strings guard reads the
        // methods' own text for the ids in use (test/menus-l10n.spec.js).
        return {
            menuType: "menuitem",
            l10nID: "weavero-menu-lock-tab",
            l10nArgs: JSON.stringify({ action: "lock" }),
            icon: WV_LOCK_GOLD_ICON,
            darkIcon: WV_LOCK_GOLD_ICON,
            onShowing: (_ev: any, ctx: any) => {
                try {
                    const win = winOf(ctx);
                    const lp = live();
                    ctx.menuElem.setAttribute("data-wv-key", "dockLibrary");
                    let many = false;
                    try { const tg = lp && lp._wvTabMultiSelTargets && lp._wvTabMultiSelTargets(win, ctx.tabID); many = !!(tg && tg.length > 1); } catch (e) {}
                    const ok = !!(lp && win && win.Zotero_Tabs && lp._wvTabSplitOn() && !many && tabIn(win, ctx.tabID));
                    ctx.setVisible(ok);
                    if (!ok) return;
                    // The words at once (tab-split.ts: MenuManager leaves them to the
                    // document's Fluent, seen blank after the menu opened).
                    wvL10n(ctx.menuElem, "weavero-menu-lock-tab", { action: lp._wvTabDockLib(win) === ctx.tabID ? "unlock" : "lock" });
                    ctx.menuElem.removeAttribute("type");
                    ctx.menuElem.removeAttribute("checked");
                } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
            },
            onCommand: (_ev: any, ctx: any) => {
                try {
                    const win = winOf(ctx);
                    const lp = live();
                    if (!win || !lp) return;
                    if (lp._wvTabDockLib(win) === ctx.tabID) lp._wvTabDockSet(win, null);
                    else lp._wvTabDockSet(win, ctx.tabID);
                } catch (e) { Zotero.debug("[Weavero] lock menu err: " + e); }
            },
        };
    }

    /** The locked tab's menu entry "Collapse Locked Tab" / "Expand Locked Tab" (its
     *  words follow the state), on the locked tab only. After Lock Tab (tabs.ts
     *  _wvTabMenuOrder, key "dockCollapse"). */
    _wvTabDockCollapseMenu(): any {
        const winOf = (ctx: any) => ctx.menuElem && ctx.menuElem.ownerDocument && ctx.menuElem.ownerDocument.defaultView;
        // The id spelled here, in the method (test/menus-l10n.spec.js).
        return {
            menuType: "menuitem",
            l10nID: "weavero-menu-lock-collapse",
            onShowing: (_ev: any, ctx: any) => {
                try {
                    const win = winOf(ctx);
                    const lp = live();
                    ctx.menuElem.setAttribute("data-wv-key", "dockCollapse");
                    let many = false;
                    try { const tg = lp && lp._wvTabMultiSelTargets && lp._wvTabMultiSelTargets(win, ctx.tabID); many = !!(tg && tg.length > 1); } catch (e) {}
                    const d = lp && win ? lp._wvTabDockOf(win) : null;
                    const ok = !!(d && lp._wvTabSplitOn() && !many && d.lib === ctx.tabID);
                    ctx.setVisible(ok);
                    if (!ok) return;
                    wvL10n(ctx.menuElem, "weavero-menu-lock-collapse", { collapsed: d.collapsed ? "yes" : "no" });
                } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
            },
            onCommand: (_ev: any, ctx: any) => {
                try {
                    const win = winOf(ctx);
                    const lp = live();
                    if (win && lp && lp._wvTabDockLib(win) === ctx.tabID) lp._wvTabDockToggleCollapsed(win);
                } catch (e) { Zotero.debug("[Weavero] lock collapse menu err: " + e); }
            },
        };
    }

    // ---- Restart and sessions: one record with the split records -------------------

    /** The record of `win`'s lock, for the pref and a session (tab-split.ts
     *  _wvTabSplitPersist / _wvTabSplitRecords put it before the window's pairs):
     *  marked `dock`; the locked tab by what it shows (`l`, the split view's
     *  description: "lib" for a library tab, else its kind and item) and a library tab
     *  by its place among the window's library tabs (`k`; a library tab has no item to
     *  name it by); its side, the left side's share, the tab shown beside it by what it
     *  shows (`c`), each side's own panes, and the window's tabs (`fp`). `r` is empty:
     *  a build without this module finds no tab for it and lets the record go. */
    _wvTabDockRecord(win: any, fp: () => string[]): any {
        try {
            const P: any = this;
            const d = this._wvTabDockOf(win);
            const Z: any = win && win.Zotero_Tabs;
            const t = d && Z ? tabIn(win, d.lib) : null;
            if (!d || !t) return null;
            const lib = isLibTab(t);
            const l = lib ? "lib" : P._wvTabSplitDescOf(t);
            if (!l) return null;
            const rec: any = { dock: 1, l, r: "", side: d.side, ratio: Math.round(d.split.ratio * 1000) / 1000, w: fp() };
            if (lib) rec.k = Math.max(0, Z._tabs.filter((x: any) => isLibTab(x)).map((x: any) => x.id).indexOf(d.lib));
            if (d.collapsed) rec.col = 1;
            const lt = d.last ? tabIn(win, d.last) : null;
            const c = lt ? P._wvTabSplitDescOf(lt) : (d.lastDesc || null);
            if (c) rec.c = c;
            const p = this._wvTabDockPanesNow(win, d);
            if (p) rec.p = p;
            return rec;
        } catch (e) { return null; }
    }

    /** Each side's own panes as they stand: the split view's own reading while it
     *  keeps both sides' (beside a PDF or a library); else what the split holds,
     *  a locked library's read from its view. */
    _wvTabDockPanesNow(win: any, d: WvTabDock): any {
        try {
            const P: any = this;
            const s = d.split;
            if (!s.panes) return null;
            const shown = P._wvTabSplits(win).indexOf(s) >= 0;
            if (shown && P._wvTabSplitManaged(win, s)) {
                const p = P._wvTabSplitPanesNow(win, s);
                if (p) return p;
            }
            if (shown) this._wvTabDockKeepLibPanes(win, d);
            const out: any = {};
            for (const side of ["left", "right"]) if (s.panes[side]) out[side] = Object.assign({}, s.panes[side]);
            return Object.keys(out).length ? out : null;
        } catch (e) { return null; }
    }

    /** A recorded lock goes back on `win`, the window its record names (tab-split.ts
     *  _wvTabSplitRestore, which checked the window's tabs and then records and draws):
     *  a library tab by its place among the window's library tabs (a record of
     *  1.1.1-libdock.3 and before names no other), any other tab by what it shows -- one
     *  in no pair first. True when the record is answered: the lock is on, or was
     *  already (a reload keeps it on the window). */
    _wvTabDockAdopt(win: any, rec: any): boolean {
        try {
            const P: any = this;
            if (this._wvTabDockOf(win)) return true;
            const Z: any = win && win.Zotero_Tabs;
            if (!Z || !rec) return false;
            let T: any = null;
            if (!rec.l || rec.l === "lib") {
                const libs = Z._tabs.filter((t: any) => isLibTab(t));
                if (!libs.length) return false;
                T = libs[Math.min(libs.length - 1, Math.max(0, Number(rec.k) || 0))];
            }
            else {
                const alike = Z._tabs.filter((t: any) => t && P._wvTabSplitDescOf(t) === rec.l);
                T = alike.find((t: any) => !P._wvTabSplitOf(win, t.id)) || alike[0] || null;
            }
            if (!T || P._wvTabSplitOf(win, T.id)) return false;
            if (!this._wvTabDockSet(win, T.id, { side: rec.side, ratio: Number(rec.ratio), panes: P._wvTabSplitPanesOf(rec), lastDesc: typeof rec.c === "string" ? rec.c : null,
                collapsed: !!rec.col, restoring: true })) return false;
            // Once the caller has drawn it: the item pane beside a selected locked tab.
            this._wvTabDockAfterSwap(win);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvTabDockAdopt err: " + e); return false; }
    }

    /** A session switch: the windows start without a lock, and the session's own
     *  records lock where it had one (tab-split.ts _wvTabSplitSessionAdopt). */
    _wvTabDockOffAll() {
        try {
            for (const w of wvMainWins()) { if (this._wvTabDockOf(w)) this._wvTabDockEnd(w); }
        } catch (e) {}
    }

    /** The record again a moment after the window's tabs or the tab shown changed
     *  (the split view's own delay). On the sandbox clock: no window to outlive. */
    _wvTabDockPersistSoon() {
        try {
            const P: any = this;
            if (P._wvQuitting || P._wvDestroyed) return;
            if (P._wvTDockPersistTimer != null) wvClearTimeout(P._wvTDockPersistTimer);
            P._wvTDockPersistTimer = wvTimeout(() => {
                P._wvTDockPersistTimer = null;
                const lp = live();
                if (lp && !lp._wvDestroyed && !lp._wvQuitting) lp._wvTabSplitPersist();
            }, 1500);
        } catch (e) {}
    }

    /** Destroy, after the split view put every window back to Zotero's deck and
     *  gave the normal panes back (tab-split.ts _wvTabSplitUnwireAll, whose last
     *  step this is): the lock's split out of each window's list, which holds the
     *  window's pairs again, its mark and its tooltip line off the strip, the strip's
     *  listeners off. The lock itself stays on the window as the pairs do (plain
     *  data): a reload's or a re-enable's first sync shows it again. */
    _wvTabDockUnwireAll() {
        try {
            const P: any = this;
            if (P._wvTDockPersistTimer != null) { wvClearTimeout(P._wvTDockPersistTimer); P._wvTDockPersistTimer = null; }
            for (const w of wvMainWins()) {
                try {
                    const d = this._wvTabDockOf(w);
                    if (d) {
                        const splits: any[] = P._wvTabSplits(w);
                        const i = splits.indexOf(d.split);
                        if (i >= 0) splits.splice(i, 1);
                        delete d.sig;
                        delete d.sel;
                    }
                    const doc = (w as any).document;
                    for (const el of doc.querySelectorAll("[data-wv-tdock-beside]")) el.removeAttribute("data-wv-tdock-beside");
                    for (const el of doc.querySelectorAll("[data-wv-tdock]")) {
                        el.removeAttribute("data-wv-tdock");
                        this._wvTabDockTipOn(w, el, el.getAttribute("data-id") || el.getAttribute("data-tab-id"), true);
                    }
                    const cont = doc.getElementById("tab-bar-container");
                    if (cont) for (const k of STRIP_KEYS) wvUnlisten(cont, k);
                } catch (e) {}
            }
        } catch (e) {}
    }
}

const _tabSplitDockDescriptors = Object.getOwnPropertyDescriptors(_TabSplitDockMixin.prototype);
delete (_tabSplitDockDescriptors as any).constructor;
export const tabSplitDockMethods = _tabSplitDockDescriptors;
