// Module: split view -- two tabs of a main window side by side (MJT 2026-11-10:
// "Firefox can show 2 tabs in split view. I want to be able to get this, first
// from the My Library tab ("Open Link in Split View"), and then also for 2 PDF
// tabs"; forum 132980). Firefox's design (mirror browser/components/tabbrowser:
// tabsplitview.mjs, tab-context-menu.js, split-view-footer.mjs,
// themes/shared/tabbrowser/content-area.css; labels from tabbrowser.ftl and
// browserContext.ftl), weighed by what Zotero plugins that split views learned
// (survey 2026-11-10: none shows two real tabs, none puts the library beside a
// reader -- this is the two-real-tabs model, the only one that can host the
// library view).
//
// MJT's intake picks: every way in (the items list's "Open PDF in Split View",
// "Open Link in Split View" in notes and comments, the tab menu's "Open in Split
// View" for two selected tabs and "Add Split View" with a picker); a pinned My
// Library may be one side and stays pinned (Firefox refuses pinned tabs); the
// split survives a restart; the reader's item and notes pane stays at the
// window's right edge and follows the PDF side. MJT then delegated the rest.
//
// How Zotero is bent to it:
//   - #tabs-deck is a XUL deck: display grid, every non-selected child
//     `visibility: hidden` (xul.css, not !important). A split turns the deck into
//     a flex row showing the two members' <tab-content> panels; the selected
//     one stays `.deck-selected`, so Zotero's own lookups (selectedPanel,
//     selectedIndex by id) are untouched. Nothing is added to the deck: the
//     splitter, the footer and the picker live in a layer beside it.
//   - Zotero deactivates every reader but the selected tab's
//     (reader.js _updateDocShellActivity): the partner is kept active by the
//     prototype wrap in reader.ts (_wvTabSplitVisible).
//   - Zotero unloads tabs not selected for a while or beyond 3-5 per type
//     (tabs.js unloadUnusedTabs / canUnload): canUnload is wrapped to spare the
//     partner on screen.
//   - The context pane collapses whenever a library tab is selected
//     (contextPane.js _handleTabSelect): with a reader on the other side it is
//     put back, showing that reader's item (MJT's pick). Since 2026-11-11 it is
//     drawn INSIDE the card it serves, the other reader side showing its own item
//     beside it (MJT: "The item pane should probably stay inside the split view on
//     each side"; Firefox keeps its sidebar outside the split panels, this follows
//     Zotero's library view, whose item pane lives inside the view).
//   - Clicking into a side selects its tab (a reader's frame: a capture listener
//     on its window; the library: on the panel).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvHtmlEl, wvBoolAttrOn } from "../lib/dom";
import { wvListen, wvListener, wvUnlisten } from "../lib/listen";
import { wvLivePlugin } from "../lib/live";
import { wvUIRoot, wvUIRootsPrune } from "../lib/ui-roots";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvIsLibraryTabID, wvIsFixedLibraryTab, wvMainWins, wvNativeWindows, wvFirstMovableIndex, wvZoteroPinsTabs, wvZoteroPinsLibraryTabs } from "../lib/windows";
import { wvL10n, wvStr, wvAttr, wvDataLabel, wvZoteroLabel, wvZoteroText } from "../lib/l10n";

declare const Zotero: any;
declare const Services: any;

const PREF = "weavero.tabSplits";
const ENABLE_PREF = "weavero.enableSplitView";
const STYLE_ID = "wv-tsplit-style";
const LAYER_ID = "wv-tsplit-layer";
const GHOST_ID = "wv-tsplit-ghost";
// Zotero's context pane at its narrowest: $min-width-context-pane 320 + $width-sidenav
// 37 (scss/components/_contextPane.scss; 357px measured on 11.0-beta.4).
const CTX_PANE_MIN = 357;

// Firefox's split view as cards (content-area.css, nova: 127-162 and 448-615 in
// the mirror; MJT 2026-11-11, "the separation between the 2 tabs should be more
// clear, same as in Firefox"): each panel a card `margin: var(--space-xsmall)`
// (4px) on its outer sides, `border: var(--border-width) solid
// var(--chrome-content-separator-color)` with `var(--border-radius-medium)`
// corners; between the two a 4px splitter with a 1px margin, 2px on the active
// panel's side; the active panel's border in the focus colour plus an outline of
// `--focus-outline-width` minus the border, 1px. In Zotero's own colours:
// --color-panedivider for the separator, --color-accent for the focus ring.
const EDGE_PX = 4;
const GAP_PX = 7;
const BAR_PX = 4;
// Firefox's --panel-min-width, every side's floor (_wvTabSplitSideMin).
const PANEL_MIN_PX = 140;
// Zotero's library panes at their narrowest (abstracts/_variables.scss): the
// collections pane 200, the item pane 320 + its 37px side navigation, which a side
// never cuts. A pane's drawn width is the larger of its minimum and its own.
const LIB_COLLECTIONS_MIN = 200;
const LIB_ITEM_PANE_MIN = 357;
const LIB_SIDENAV = 37;
// The pair in the strip (CSS above). Zotero's tab: 28px tall, at most 200px wide,
// 4px apart (_tabBar.scss .tab / .tabs column-gap). Firefox's wrapper: the tabs
// inset 2px (--split-view-padding-block, --split-view-tab-padding-inline, tabs.css),
// --space-small = 0.5rem = 8px from its neighbours (tokens-shared.css, read in
// Zotero 11's own toolkit), as wide as one tab, each half at least --tab-min-width
// (76px). Its outer tabs take 8px of margin: two pairs 16px apart (Firefox's 8 + 8),
// a pair 10px from a lone tab (8 + the 2px a Firefox tab's background sits inside
// its own box).
const TAB_H = 28;
const TAB_GAP = 4;
const PILL_PAD = 2;
const PILL_MARGIN = 8;
const PILL_HALF_MAX = (200 - 2 * PILL_PAD - TAB_GAP) / 2;
const PILL_HALF_MIN = 76;
// Firefox's keyboard step for the splitter (browser_tab_splitview_splitter_keyboard_boundary.js: ~5px).
const KEY_STEP_PX = 5;

/** A reader|reader split's own side panes (MJT 2026-11-11: "By default, the side
 *  panes for 2 PDF split view should be collapsed, considering the small width
 *  available. Put them back as they were before when going back to normal tabs"),
 *  per side since item 9 ("I should be able to open the panes independantly in each
 *  side"): each reader side's item pane open and its width (item 13, "Allow
 *  different width for each side"), its left sidebar open and its width. Starts
 *  closed; what the user opens in the split stays the split's. */
/** A library view's persisted panes (Zotero's `zotero-persist` attributes, by base
 *  id; a width or height with its inline style as `style.width`); null: absent. */
export type WvTabSplitLib = Record<string, Record<string, string | null>>;
export type WvTabSplitSidePanes = { ctx: boolean; sb: boolean; sbW: number | null; ctxW?: number | null; pin?: string; lib?: WvTabSplitLib };
export type WvTabSplitPanes = { left?: WvTabSplitSidePanes; right?: WvTabSplitSidePanes };
/** A side the split took off the pins, and its place among them (_wvTabSplitTakePins). */
export type WvTabSplitPin = { side: "left" | "right"; index: number };
export type WvTabSplit = { id: string; left: string; right: string | null; ratio: number; picker?: boolean; panes?: WvTabSplitPanes; pins?: WvTabSplitPin[] };

const live = () => wvLivePlugin();

const CSS = `
#tabs-deck[wv-tsplit] {
  display: flex !important; flex-direction: row;
  background: var(--material-tabbar, var(--color-tabbar));
}
#tabs-deck[wv-tsplit] > :not(.wv-tsplit-panel) { display: none !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel {
  visibility: visible !important; position: relative;
  /* clip, never hidden: a hidden box can still be scrolled, and a focus pass
     scrolled a side whose library view was wider than the card -- its left
     edge, the Tag Selector's padding with it, went under the card's edge
     (MJT 2026-11-11, "Padding missing"). */
  overflow: clip;
  min-width: 0; flex: 1 1 0px; box-sizing: border-box;
  margin: ${EDGE_PX}px;
  border: 1px solid var(--color-panedivider, #dadada);
  border-radius: 8px;
  /* zotero.css hides every deck child but the selected one with
     -moz-subtree-hidden-only-visually: laid out, never painted nor hit
     (1.0.5-dev.1 showed an empty right side, 2026-11-10). */
  -moz-subtree-hidden-only-visually: 0 !important;
}
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[data-wv-side="left"] { order: 0; margin-inline-end: 0; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[data-wv-side="right"] { order: 2; margin-inline-start: ${GAP_PX}px; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel.wv-tsplit-active {
  border-color: var(--color-accent, var(--accent-blue, #4072e5));
  outline: 1px solid var(--color-accent, var(--accent-blue, #4072e5)); outline-offset: 0;
  z-index: 1;
}
/* A library view inside a card: its panes yield before the item pane and its
   side navigation leave the card. Zotero keeps a view whole through the
   window's min-width (#main-window, _mainWindow.scss), which a side does not
   have; #zotero-trees's automatic minimum (its content's) then held a view
   26px wider than its side, and the sidenav -- the item pane's collapse
   button -- was cut off (MJT 2026-11-11). The items list gives way first, as
   Zotero's narrow window gives its collections pane a max-width. */
#tabs-deck[wv-tsplit] > .wv-tsplit-panel :is(#zotero-trees, [id^="zotero-trees-tab-"], .zotero-trees) { min-width: 0 !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel #zotero-items-pane-container { min-width: 0 !important; overflow: clip; }
/* Down to Firefox's 140px floor (MJT 2026-11-11: "Let me go to a very small width, as
   long as they can still be dragable"), a library side SHRINKS its panes instead of
   cutting them: the items list first (its basis 0), then the collections pane (with
   the tag selector) and the item pane together, each in proportion to its width --
   the layout box takes the item pane's width as its basis (--wv-tsplit-ipw,
   _wvTabSplitLibraryFit) -- and never the item pane's side navigation (37px). Only
   minimums and flex: Zotero's widths (zotero-persist) stay, and come back exactly as
   the side widens or leaves the split. Zotero's stacked layout is left alone. */
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-libfit] #zotero-collections-pane { min-width: 0 !important; flex: 0 1 var(--wv-tsplit-collw, auto) !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-libfit] #zotero-layout-switcher { min-width: ${LIB_SIDENAV}px !important; flex: 1 1 var(--wv-tsplit-ipw, auto) !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-libfit] #zotero-items-pane-container { flex: 1 1 0px !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-libfit] #zotero-item-pane { min-width: ${LIB_SIDENAV}px !important; flex: 0 1 var(--wv-tsplit-ipw, auto) !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-libfit] #zotero-item-pane > :not(.zotero-view-item-sidenav) { min-width: 0 !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-libfit] #zotero-item-pane > * > :not(.zotero-view-item-sidenav) { min-width: 0 !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel .zotero-view-item-sidenav { flex-shrink: 0 !important; }
/* A note side the same: Weavero's note outline (notenav, 200px) held the editor at
   200px in a 142px card, its toolbar's context-pane toggle out of sight. */
#tabs-deck[wv-tsplit] > .wv-tsplit-panel note-editor #note-editor { min-width: 0 !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel note-editor #note-editor:has(> .wv-note-outline) { grid-template-columns: minmax(0, auto) minmax(0, 1fr) !important; }
/* Each side keeps its item pane inside its card (MJT 2026-11-11: "The item pane
   should probably stay inside the split view on each side"). Zotero has ONE context
   pane per window, beside #tabs-deck (zoteroPane.xhtml); while a split is on screen it
   leaves that column -- the deck spans the window -- and is drawn over the end of the
   card it serves, which keeps that room free (a margin on its content: padding
   would hold the card at the pane's width); the side not selected shows
   its own item in the same place (#wv-tsplit-ghost). Zotero's elements stay where
   Zotero put them: only their position changes. Zotero's splitter would size the
   deck, its in-flow neighbour, so the pane's edge has a handle of its own. */
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-paned] > :not(popupset) { margin-inline-end: var(--wv-tsplit-pane-w, 0px) !important; min-width: 0 !important; }
#tabs-deck[wv-tsplit] > .wv-tsplit-panel[wv-tsplit-paned] > note-editor.note-tab { width: auto !important; flex: 1 1 0px !important; }
#tabs-deck[wv-tsplit] ~ #zotero-context-splitter { display: none !important; }
#tabs-deck[wv-tsplit] ~ #zotero-context-pane:not(.stacked) {
  position: fixed !important; inset-inline: auto !important; right: auto !important;
  left: var(--wv-tsplit-pane-x, -100000px) !important; top: var(--wv-tsplit-pane-y, 0px) !important;
  width: var(--wv-tsplit-pane-w, 0px) !important; height: var(--wv-tsplit-pane-h, 0px) !important;
  min-width: 0 !important; z-index: 2; overflow: clip;
  border-start-end-radius: 7px; border-end-end-radius: 7px;
}
#tabs-deck[wv-tsplit] ~ #zotero-context-pane:not(.stacked) #zotero-context-pane-inner { min-width: 0 !important; }
#tabs-deck[wv-tsplit] ~ #zotero-context-pane:not(.stacked) > .zotero-view-item-sidenav { flex-shrink: 0; }
#${LAYER_ID} { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
#${LAYER_ID}[hidden] { display: none; }
#${LAYER_ID} #wv-tsplit-ghost {
  position: absolute; display: flex; pointer-events: auto; overflow: clip;
  background: var(--material-sidepane); border-start-end-radius: 7px; border-end-end-radius: 7px;
}
#${LAYER_ID} #wv-tsplit-ghost > item-details { flex: 1 1 0; min-width: 0; }
#${LAYER_ID} #wv-tsplit-ghost > item-pane-sidenav { flex: none; }
#${LAYER_ID} .wv-tsplit-pane-handle {
  position: absolute; width: 6px; pointer-events: auto; cursor: ew-resize; background: transparent;
}
/* The splitter takes the whole gap (Firefox's is its 4px box alone) and draws
   Firefox's 4px bar, 1px from the inactive side, 2px from the active one. */
#${LAYER_ID} .wv-tsplit-splitter {
  position: absolute; top: 0; bottom: 0; width: ${GAP_PX}px; pointer-events: auto; cursor: ew-resize;
  background: transparent;
}
#${LAYER_ID} .wv-tsplit-splitter::before {
  content: ""; position: absolute; top: 0; bottom: 0; inset-inline-start: 1px; width: ${BAR_PX}px;
  border-radius: ${BAR_PX / 2}px; background-color: transparent; transition: background-color 0.5s ease-in-out;
}
#${LAYER_ID} .wv-tsplit-splitter[data-active-side="left"]::before { inset-inline-start: 2px; }
#${LAYER_ID} .wv-tsplit-splitter:hover::before, #${LAYER_ID} .wv-tsplit-splitter[data-dragging]::before {
  background-color: var(--color-accent, var(--accent-blue, #4072e5));
}
#${LAYER_ID} .wv-tsplit-splitter:focus-visible { outline: auto; }
#${LAYER_ID} .wv-tsplit-footer {
  position: absolute; display: flex; align-items: center; gap: 6px; max-width: 60%;
  padding: 2px 4px 2px 8px; pointer-events: auto; font: message-box; font-size: 12px;
  background: var(--material-toolbar, #f2f2f2); color: var(--fill-primary, #222);
  border-top: 1px solid var(--color-panedivider, #ccc); border-left: 1px solid var(--color-panedivider, #ccc);
  border-start-start-radius: 6px; border-end-end-radius: 7px; cursor: default;
}
#${LAYER_ID} .wv-tsplit-footer[hidden] { display: none; }
#${LAYER_ID} .wv-tsplit-footer .wv-tsplit-icon { width: 16px; height: 16px; flex: none; }
#${LAYER_ID} .wv-tsplit-footer .wv-tsplit-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${LAYER_ID} .wv-tsplit-footer .wv-tsplit-more {
  appearance: none; border: none; background: transparent; color: inherit; border-radius: 4px;
  width: 22px; height: 20px; padding: 0; font-size: 14px; line-height: 1; flex: none;
}
#${LAYER_ID} .wv-tsplit-footer .wv-tsplit-more:hover { background: var(--fill-quinary, #ddd); }
#${LAYER_ID} .wv-tsplit-picker {
  position: absolute; pointer-events: auto; overflow: auto; box-sizing: border-box; padding: 16px;
  background: var(--material-background, #fff); color: var(--fill-primary, #222); font: message-box;
  border: 1px solid var(--color-panedivider, #dadada); border-radius: 8px;
}
#${LAYER_ID} .wv-tsplit-picker h2 { font-size: 14px; margin: 0 0 4px; }
#${LAYER_ID} .wv-tsplit-picker p { margin: 0 0 10px; color: var(--fill-secondary, #666); font-size: 12px; }
#${LAYER_ID} .wv-tsplit-picker input { width: 100%; box-sizing: border-box; margin: 0 0 8px; }
#${LAYER_ID} .wv-tsplit-picker .wv-tsplit-row {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 5px; cursor: default;
}
#${LAYER_ID} .wv-tsplit-picker .wv-tsplit-row:hover, #${LAYER_ID} .wv-tsplit-picker .wv-tsplit-row:focus { background: var(--fill-quinary, #e5e5e5); outline: none; }
#${LAYER_ID} .wv-tsplit-picker .wv-tsplit-row .wv-tsplit-icon { width: 16px; height: 16px; flex: none; }
#${LAYER_ID} .wv-tsplit-picker .wv-tsplit-close { position: absolute; top: 8px; right: 8px; }
/* The two tabs of a split as ONE unit in the strip, as Firefox's
   tab-split-view-wrapper (MJT 2026-11-11: "It is not clear which are the 2 tabs in
   split view ... Do the same", with a screenshot of Firefox's; tabs.css 1483-1640):
   one container as wide as one tab (max-width: --tab-max-width; Zotero's 200px), as
   tall as one (the tabs inside lose --split-view-padding-block, 2px, above and
   below), the tabs inset by --split-view-tab-padding-inline (2px), the container
   --space-small (8px, tokens-shared.css) from its neighbours, filled with
   --tab-background-color-hover while it holds the selected tab, the two tabs parted
   by a line while it does not. Zotero's strip is React's (tabBar.jsx): the tabs are
   not wrapped -- React would undo it, and Zotero's own drag code counts the strip's
   children -- but marked (React keeps an attribute it does not render), and the
   container is drawn behind them in #wv-tsplit-pills, the first child of
   .tabs-wrapper (a foreign first child survives React's reconciliation). */
#tab-bar-container .tabs > .tab[data-wv-tsplit] {
  flex: 1 1 ${PILL_HALF_MAX}px !important; max-width: ${PILL_HALF_MAX}px !important; min-width: ${PILL_HALF_MIN}px !important;
  height: ${TAB_H - 2 * PILL_PAD}px !important; margin-block: ${PILL_PAD}px !important;
}
#tab-bar-container .tabs > .tab[data-wv-tsplit="left"] { margin-inline-start: ${PILL_MARGIN + 2 * PILL_PAD - TAB_GAP}px !important; }
#tab-bar-container .tabs > .tab[data-wv-tsplit="right"] { margin-inline-end: ${PILL_MARGIN + 2 * PILL_PAD - TAB_GAP}px !important; }
/* Narrow halves: the close button on the selected one only (Firefox's narrow tabs),
   its room given to the title -- never by changing the padding (src-ts.md). */
#tab-bar-container .tabs > .tab[data-wv-tsplit]:not(.selected) .tab-close { display: none !important; }
#tab-bar-container .tabs > .tab[data-wv-tsplit]:not(.selected) .tab-name { margin-inline-end: -17px; }
#wv-tsplit-pills { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
#wv-tsplit-pills[hidden] { display: none; }
#wv-tsplit-pills .wv-tsplit-pill { position: absolute; box-sizing: border-box; border-radius: 7px; }
#wv-tsplit-pills[data-look="nova"] .wv-tsplit-pill { border-radius: 24px; }
#wv-tsplit-pills .wv-tsplit-pill[data-active] { background-color: var(--fill-quinary); }
#wv-tsplit-pills[data-look="nova"] .wv-tsplit-pill[data-active] { background-color: rgba(117, 102, 159, 0.25); }
@media (prefers-color-scheme: dark) {
  #wv-tsplit-pills[data-look="nova"] .wv-tsplit-pill[data-active] { background-color: rgba(182, 170, 217, 0.25); }
}
#wv-tsplit-pills .wv-tsplit-pill:not([data-active])::after {
  content: ""; position: absolute; top: ${PILL_PAD}px; bottom: ${PILL_PAD}px; left: var(--wv-tsplit-pill-mid, 50%); width: 1px;
  background: var(--fill-secondary);
}
@media (forced-colors) {
  #wv-tsplit-pills .wv-tsplit-pill[data-active] { background: SelectedItemText; outline: 1px solid SelectedItem; }
}
`;

/** A tab, by id, in `win`. */
function tabIn(win: any, id: any): any {
    try { return win && win.Zotero_Tabs && id ? win.Zotero_Tabs._tabs.find((t: any) => t && t.id === id) || null : null; } catch (e) { return null; }
}
/** The tab's base type (library / reader / note / ...), unloaded or not. */
function baseType(t: any): string { return String((t && t.type) || "").replace(/-(unloaded|loading|reloaded)$/, ""); }
/** A restart-proof description of a tab: a library tab ("lib"), else its item. */
function descOf(t: any): string | null {
    try {
        if (!t) return null;
        if (wvIsLibraryTabID(t.id) || baseType(t) === "library") return "lib";
        const iid = t.data && t.data.itemID;
        const it = iid ? Zotero.Items.get(iid) : null;
        return it ? baseType(t) + ":" + it.libraryID + "/" + it.key : null;
    } catch (e) { return null; }
}
function matches(t: any, desc: string): boolean {
    if (!t || !desc) return false;
    if (desc === "lib") return wvIsLibraryTabID(t.id) || baseType(t) === "library";
    return descOf(t) === desc;
}
/** A window by what it holds: every tab's description, sorted. A recorded split
 *  carries its window's, so a restart or a session switch gives it back to that
 *  window. The two sides alone ("lib" + an item) also matched another window
 *  holding a library tab and a copy of the item, whichever came back first: the
 *  split moved there, its right side left its tab group, and the next restart
 *  moved it back (restart protocol on 11.0-beta.4, 2026-11-11). */
function fingerprintOf(win: any): string[] {
    try { return ((win && win.Zotero_Tabs && win.Zotero_Tabs._tabs) || []).map((t: any) => descOf(t)).filter(Boolean).sort(); }
    catch (e) { return []; }
}
/** How much of fingerprint `fp` the tabs `cur` hold: copies matched one for one,
 *  over the larger of the two (0..1). */
function fpScore(fp: string[], cur: string[]): number {
    if (!fp.length || !cur.length) return 0;
    const left = new Map<string, number>();
    for (const d of cur) left.set(d, (left.get(d) || 0) + 1);
    let n = 0;
    for (const d of fp) { const k = left.get(d) || 0; if (k > 0) { n++; left.set(d, k - 1); } }
    return n / Math.max(fp.length, cur.length);
}
/** Below this a window is not the recorded one. A window comes back with the
 *  tabs it had (Zotero restores them all at once, unloaded), and the record is
 *  re-taken as tabs open and close (_wvTabSplitPersistSoon), so its own window
 *  scores near 1; a window holding the two sides among other tabs scores low --
 *  0.6 let a three-tab window take a two-tab window's split before that window
 *  was back. Two windows holding exactly the same tabs cannot be told apart this
 *  way: the first back takes it. */
const FP_MIN = 0.8;

class _TabSplitMixin {
    /** Split view is on (Tabs and Windows master + its own setting). */
    _wvTabSplitOn(): boolean {
        try {
            if (Zotero.Prefs.get("weavero.enableTabsAndWindows") === false) return false;
            return Zotero.Prefs.get(ENABLE_PREF) !== false;
        } catch (e) { return true; }
    }

    _wvTabSplits(win: any): WvTabSplit[] {
        if (!win) return [];
        if (!Array.isArray(win._wvTSplits)) win._wvTSplits = [];
        return win._wvTSplits;
    }

    /** The split `tabID` is a side of in `win`, or null. */
    _wvTabSplitOf(win: any, tabID: any): WvTabSplit | null {
        if (!tabID) return null;
        return this._wvTabSplits(win).find((s) => s.left === tabID || s.right === tabID) || null;
    }

    /** Tab `tabID` is on screen beside the selected tab (the other side of the
     *  selected tab's split). Read by the reader activity wrap (reader.ts). */
    _wvTabSplitVisible(win: any, tabID: any): boolean {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z || !tabID) return false;
            const s = this._wvTabSplitOf(win, Z.selectedID);
            return !!(s && !s.picker && (s.left === tabID || s.right === tabID));
        } catch (e) { return false; }
    }

    /** Wire one main window: style, the layer, Zotero's unload check and its
     *  context-pane handler, and the splits recorded for a restart. Reload-proof
     *  (the wraps peel a previous instance's first). */
    _wvTabSplitWire(win: any) {
        try {
            if (!win || !win.document || !win.Zotero_Tabs) return;
            const doc = win.document;
            // Replaced, never skipped when present (src-ts.md sheet replace).
            wvInjectStyle(doc, STYLE_ID, CSS);
            const Z: any = win.Zotero_Tabs;
            // Zotero's unload check: never the side on screen beside the selected tab.
            if (Z._wvOrigCanUnloadTS) { Z.canUnload = Z._wvOrigCanUnloadTS; delete Z._wvOrigCanUnloadTS; }
            if (typeof Z.canUnload === "function") {
                const orig = Z.canUnload;
                Z._wvOrigCanUnloadTS = orig;
                Z.canUnload = function (this: any, id: any) {
                    try { const lp = live(); if (lp && !lp._wvDestroyed && lp._wvTabSplitVisible(win, id)) return false; } catch (e) {}
                    return orig.apply(this, arguments as any);
                };
            }
            // The context pane: Zotero collapses it for a library tab; beside a reader
            // it shows that reader's item (MJT: "Right edge, follows the PDF").
            const cp: any = doc.getElementById("zotero-context-pane-inner");
            if (cp && typeof cp._handleTabSelect === "function") {
                // A wvWrap layer since 1.0.5-dev.7: the cross-window guard
                // (tabs.ts, Zotero 9/10) wraps the same member, and two hand
                // wraps given back in the wrong order put one back after a
                // disable (zzz-disable-leftovers.spec.js on Zotero 10).
                if (cp._wvOrigHandleTabSelectTS) { cp._handleTabSelect = cp._wvOrigHandleTabSelectTS; delete cp._wvOrigHandleTabSelectTS; }
                wvWrap(cp, "_handleTabSelect", "splitContextPane", (this as any)._wvWireTag(), (origSel: any) => async function (this: any) {
                    // Zotero's own selection carries a pin over: not a user's pin (9b).
                    win._wvTSplitSelecting = (win._wvTSplitSelecting || 0) + 1;
                    let r: any;
                    try { r = await origSel.apply(this, arguments as any); }
                    finally { win._wvTSplitSelecting = Math.max(0, (win._wvTSplitSelecting || 1) - 1); if (!win._wvTSplitSelecting) delete win._wvTSplitSelecting; }
                    try { const lp = live(); if (lp && !lp._wvDestroyed) await lp._wvTabSplitContextPane(win); } catch (e) {}
                    // Zotero's selection carried the previous tab's pinned section over
                    // (contextPane.js _selectItemContext): each side's own, the normal
                    // one outside (9b).
                    try { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabSplitPinsAfterSelect(win); } catch (e) {}
                    return r;
                });
            }
            // The split's pane state follows the selection AT ONCE, inside Zotero's
            // own select (item 20, MJT 2026-11-12: "Sometimes, opening a right pane
            // opens it in the other side of the split view"): a press on the other
            // side selects it on mousedown and the reader's toggle answers the click;
            // the state moved only later (the tab notifier's Sync, the context pane's
            // async handler), so a toggle landing first toggled the side selected
            // before, and the switch then filed that state under it.
            // Hooked where EVERY select ends, not on Zotero_Tabs.select: the tab bar
            // calls a select bound at Zotero's init (tabs.js `onTabSelect:
            // this.select.bind(this)`), so a click in the strip passed no wrap
            // (item 18). Zotero's select ends with the selected tab content's
            // onTabSelectionChanged(true), a "tab-selection-change" event (it does not
            // bubble: a capture listener on the deck sees it). A layer of 1.0.5-splitpane.9.
            try { wvUnwrap(Z, "select", "splitSelect"); } catch (e) {}
            const deckEl = doc.getElementById("tabs-deck");
            if (deckEl) {
                wvListen(deckEl, "tsplit:selchange", "tab-selection-change", (e: any) => {
                    try {
                        if (!e || !e.detail || !e.detail.selected) return;
                        const lp = live();
                        if (lp && !lp._wvDestroyed) lp._wvTabSplitSelectNow(win);
                    } catch (er) {}
                }, true, (this as any)._wvWireTag());
            }
            // A reader|reader split's own side panes (_wvTabSplitPanesState): the
            // readers' sidebar state goes to the split while one is on screen, and
            // what Zotero saves of the panes stays the normal state.
            if (typeof Z.updateSidebarLayout === "function") {
                wvWrap(Z, "updateSidebarLayout", "splitSidebar", (this as any)._wvWireTag(), (orig: any) => function (this: any, arg?: any) {
                    try {
                        const lp = live();
                        const st = win._wvTSplitPanes;
                        if (lp && !lp._wvDestroyed && st) {
                            const s = lp._wvTabSplits(win).find((x: any) => x.id === st.id);
                            if (s && (win.Zotero_Tabs.selectedID === s.left || win.Zotero_Tabs.selectedID === s.right)) {
                                const r = lp._wvTabSplitSidebarRoute(win, s, arg);
                                if (r !== undefined) return r;
                            }
                        }
                    } catch (e) {}
                    return orig.apply(this, arguments as any);
                });
            }
            const ZP: any = win.ZoteroPane;
            if (ZP && typeof ZP.serializePersist === "function") {
                wvWrap(ZP, "serializePersist", "splitPersist", (this as any)._wvWireTag(), (orig: any) => function (this: any, view?: any) {
                    // What Zotero saves of a library view a split side holds its own
                    // panes in is put back to the normal panes after (item 15).
                    let before: any = null;
                    try { if (win._wvTSplitLibNormal instanceof Map && win._wvTSplitLibNormal.size) before = Zotero.Prefs.get("pane.persist") || "{}"; } catch (e) {}
                    const r = orig.apply(this, arguments as any);
                    try {
                        const lp = live();
                        if (lp && !lp._wvDestroyed) {
                            lp._wvTabSplitPersistNormal(win);
                            if (before != null) lp._wvTabSplitPersistNormalLib(win, before, view);
                        }
                    } catch (e) {}
                    return r;
                });
            }
            // Nor are Zotero's shared panes put on such a view when its tab is shown
            // (libraryView.js adoptSharedState -> unserializePersist(view)).
            if (ZP && typeof ZP.unserializePersist === "function") {
                wvWrap(ZP, "unserializePersist", "splitLibPersist", (this as any)._wvWireTag(), (orig: any) => function (this: any, view?: any) {
                    try { const lp = live(); if (view && lp && !lp._wvDestroyed && lp._wvTabSplitLibOwned(win, view)) return; } catch (e) {}
                    return orig.apply(this, arguments as any);
                });
            }
            this._wvTabSplitNotifier();
            // Splits recorded before a restart: once this window's tabs are back.
            if (!win._wvTSplitRestoreArmed) {
                win._wvTSplitRestoreArmed = true;
                const tryRestore = (n: number) => {
                    const lp = live();
                    if (!lp || lp._wvDestroyed || win.closed) return;
                    if (lp._wvTabGroupRestoreGuard && n < 40) { win.setTimeout(() => tryRestore(n + 1), 500); return; }
                    try { lp._wvTabSplitRestore(win); } catch (e) {}
                    // Records still waiting: this window's tabs may not all be back
                    // yet (its fingerprint short of the recorded one), or they are
                    // another window's. Look again while they can be matched.
                    try { if (n < 40 && lp._wvTabSplitPending().length) win.setTimeout(() => tryRestore(n + 4), 2000); } catch (e) {}
                };
                win.setTimeout(() => tryRestore(0), 1500);
            }
            // Splits this window kept across a reload or a re-enable: their pinned
            // sides, given back by the previous instance's destroy, leave the pins again.
            for (const s of this._wvTabSplits(win)) this._wvTabSplitTakePins(win, s);
            this._wvTabSplitSync(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitWire err: " + e); }
    }

    /** One tab observer for every window: selection and closing drive the view. */
    _wvTabSplitNotifier() {
        if ((this as any)._wvTSplitObserverID) return;
        try {
            (this as any)._wvTSplitObserverID = Zotero.Notifier.registerObserver({
                notify: (action: string, type: string, ids: any[]) => {
                    try {
                        const lp = live();
                        if (!lp || lp._wvDestroyed || type !== "tab") return;
                        for (const w of wvMainWins()) {
                            if (!w || w.closed || !(w as any)._wvTSplits) continue;
                            if (action === "close") lp._wvTabSplitOnClose(w, ids || []);
                            if (action === "select" || action === "close" || action === "add" || action === "load") {
                                (w as any).setTimeout(() => { try { lp._wvTabSplitSync(w); } catch (e) {} }, 0);
                            }
                        }
                        if (action === "add" || action === "close") lp._wvTabSplitPersistSoon();
                    } catch (e) {}
                },
            }, ["tab"], "weavero-tab-split");
        } catch (e) { Zotero.debug("[Weavero] tab split notifier err: " + e); }
    }

    /** A side closed: the split goes, the other tab stays (Firefox). A tab being
     *  re-added in place by Zotero's unload keeps its split (same id). */
    _wvTabSplitOnClose(win: any, ids: any[]) {
        if ((this as any)._wvQuitting) return;
        const splits = this._wvTabSplits(win);
        let changed = false;
        for (const s of splits.slice()) {
            const hit = ids.filter((id) => id === s.left || id === s.right);
            if (!hit.length) continue;
            win.setTimeout(() => {
                const lp = live();
                if (!lp) return;
                const gone = hit.filter((id) => !tabIn(win, id));
                if (gone.length) { lp._wvTabSplitRemove(win, s.id); lp._wvTabSplitSync(win); }
            }, 50);
            changed = true;
        }
        return changed;
    }

    _wvTabSplitRemove(win: any, splitID: string) {
        // A reader|reader split's own panes go first: the leave gives ITS two readers
        // the normal sidebar back, and needs the split to name them.
        if (win._wvTSplitPanes && win._wvTSplitPanes.id === splitID) { try { this._wvTabSplitPanesLeave(win); } catch (e) {} }
        const splits = this._wvTabSplits(win);
        const i = splits.findIndex((s) => s.id === splitID);
        if (i >= 0) {
            const s = splits[i];
            splits.splice(i, 1);
            // A side that was pinned goes back to its place among the pins.
            this._wvTabSplitGivePins(win, s);
        }
        this._wvTabSplitPersist();
    }

    /** A pinned tab that becomes a side leaves the pins and sits beside its partner,
     *  inside the pair (MJT 2026-11-11: "In split view, the 2 tabs should be next to
     *  each other. So you can move the pinned tab out of the pinned tabs group. It
     *  goes back to its original position after separating the split tabs"; Firefox
     *  refuses a pinned tab in a split outright: tabsplitview.mjs addTabs). Every pin
     *  kind: Zotero's own (Zotero_Tabs.setPinned, where Zotero pins tabs), Weavero's
     *  library-tab flag and item pins. Zotero draws a pinned tab only in its pinned
     *  run (tabBar.jsx) and keeps it there (move() clamps), so the pin is really taken
     *  off; the split keeps where it was among the pins (`pins`, also in its restart
     *  record), and gives it back when the split ends (_wvTabSplitGivePins), or once a
     *  restart could not re-form the split (_wvTabSplitExpire). */
    _wvTabSplitTakePins(win: any, s: WvTabSplit) {
        try {
            if (!s.right || s.picker) return;
            const P: any = this;
            const Z: any = win.Zotero_Tabs;
            let took = false;
            for (const side of ["left", "right"] as const) {
                const id = side === "left" ? s.left : s.right;
                const t = tabIn(win, id);
                if (!t || wvIsFixedLibraryTab(t.id) || !P._wvTabIsPinned(win, t)) continue;
                const index = Z._tabs.filter((x: any) => x && P._wvTabIsPinned(win, x)).map((x: any) => x.id).indexOf(id);
                if (!s.pins) s.pins = [];
                if (!s.pins.some((p) => p.side === side)) s.pins.push({ side, index: Math.max(0, index) });
                P._wvSetTabPinned(win, t, false);
                took = true;
            }
            if (took) { try { P._applyPinnedTabs(win); } catch (e) {} }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitTakePins err: " + e); }
    }

    /** The pins split `s` took, given back (the tab found in its window, or the
     *  window it moved to; not while it is a side of another split). */
    _wvTabSplitGivePins(win: any, s: WvTabSplit) {
        try {
            if (!s || !s.pins || !s.pins.length) return;
            const pins = s.pins;
            s.pins = [];
            for (const p of pins) {
                const id = p.side === "left" ? s.left : s.right;
                let w: any = win, t: any = tabIn(win, id);
                if (!t) for (const w2 of wvMainWins()) { const t2 = tabIn(w2, id); if (t2) { w = w2; t = t2; break; } }
                if (!t) continue;
                const other = this._wvTabSplitOf(w, id);
                if (other && other !== s) continue;
                this._wvTabSplitPin(w, t, p.index);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitGivePins err: " + e); }
    }

    /** Pin tab `t` of `win` again, at `index` among the pins (clamped when the pins
     *  changed meanwhile), by the pin kind it had. */
    _wvTabSplitPin(win: any, t: any, index: number) {
        try {
            const P: any = this;
            const Z: any = win.Zotero_Tabs;
            if (!Z || P._wvTabIsPinned(win, t)) return;
            if (wvIsLibraryTabID(t.id) && !wvZoteroPinsLibraryTabs()) P._wvSetLibraryTabPinned(win, t.id, true);
            else if (!wvZoteroPinsTabs() && t.data && t.data.itemID) P._pinTabByCommand(win, Zotero.Items.get(t.data.itemID));
            else P._wvSetTabPinned(win, t, true);
            try { P._applyPinnedTabs(win); } catch (e) {}
            const others = Z._tabs.filter((x: any) => x && x !== t && P._wvTabIsPinned(win, x));
            const k = Math.max(0, Math.min(index | 0, others.length));
            const cur = Z._tabs.indexOf(t);
            const target = k < others.length ? Z._tabs.indexOf(others[k]) : (others.length ? Z._tabs.indexOf(others[others.length - 1]) + 1 : wvFirstMovableIndex(Z));
            if (cur >= 0 && cur !== target && !(cur === target - 1 && k >= others.length)) { try { Z.move(t.id, target); } catch (e) {} }
            try { P._applyPinnedTabs(win); } catch (e) {}
            try { P._applyTabGroups(win); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPin err: " + e); }
    }

    /** Records whose wait is over (_wvTabSplitPending): a side they had taken off the
     *  pins gets its pin back, in its window (the one holding the recorded tabs). */
    _wvTabSplitExpire(recs: any[]) {
        try {
            for (const rec of recs || []) {
                if (!Array.isArray(rec && rec.pin) || !rec.pin.length) continue;
                const wins = wvMainWins().slice().sort((a: any, b: any) => (Array.isArray(rec.w) ? fpScore(rec.w, fingerprintOf(b)) - fpScore(rec.w, fingerprintOf(a)) : 0));
                for (const p of rec.pin) {
                    const desc = p && p.side === "right" ? rec.r : rec.l;
                    for (const w of wins) {
                        const Z: any = (w as any).Zotero_Tabs;
                        const t = Z && Z._tabs.find((x: any) => x && matches(x, desc) && !this._wvTabSplitOf(w, x.id));
                        if (!t) continue;
                        this._wvTabSplitPin(w, t, Number(p.index) || 0);
                        break;
                    }
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitExpire err: " + e); }
    }

    /** Make tabs `aID` and `bID` of `win` a split and show it. The two keep their
     *  order in the strip: the one further left is the left side (item 16, MJT
     *  2026-11-12: "Before: Library tab on the left. After: Library tab on the right.
     *  Can you keep the order when going to split view?"), a pinned tab counting as
     *  before every other, as drawn. The right tab then moves next to the left one
     *  and takes its tab group -- unless the left one has just left the pins, which
     *  then lands just before its partner (_wvTabSplitAdjoin): nothing else in the
     *  strip changes order. `select`: which of the two GIVEN tabs to select, "left"
     *  `aID`, "right" `bID` (default: as Firefox's Open Link in Split View selects
     *  the link's tab), whatever side it takes; `ratio`: `aID`'s share. A restart
     *  re-forms a split in its recorded order (_wvTabSplitRestore), Reverse Tabs
     *  swaps it. */
    _wvTabSplitCreate(win: any, aID: any, bID: any, opts: { select?: "left" | "right" | "none", ratio?: number } = {}): WvTabSplit | null {
        try {
            if (!this._wvTabSplitOn()) return null;
            const Z: any = win && win.Zotero_Tabs;
            if (!Z || !aID || !bID || aID === bID) return null;
            const A = tabIn(win, aID), B = tabIn(win, bID);
            if (!A || !B) return null;
            // A tab already in a split never goes into another one (MJT 2026-11-11:
            // "I should not be able to apply split view multiple times for tabs
            // already in split view"; Firefox hides its entries for such a tab:
            // tab-context-menu.js `hasSplitViewTab`). Every way in comes here.
            for (const id of [aID, bID]) {
                const old = this._wvTabSplitOf(win, id);
                if (old && !old.picker) return null;
                if (old) this._wvTabSplitRemove(win, old.id);
            }
            const P: any = this;
            const pos = (t: any) => {
                let pinned = false;
                try { pinned = typeof P._wvTabIsPinned === "function" && !!P._wvTabIsPinned(win, t); } catch (e) {}
                return (pinned ? 0 : 1e6) + Z._tabs.indexOf(t);
            };
            const swap = pos(B) < pos(A);
            const leftID = swap ? bID : aID, rightID = swap ? aID : bID;
            const ratio = opts.ratio ? (swap ? 1 - opts.ratio : opts.ratio) : 0.5;
            const s: WvTabSplit = { id: "tsplit-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                left: leftID, right: rightID, ratio };
            this._wvTabSplits(win).push(s);
            this._wvTabSplitTakePins(win, s);
            this._wvTabSplitAdjoin(win, s);
            this._wvTabSplitPersist();
            const sel = opts.select || "right";
            if (sel !== "none") {
                const id = sel === "left" ? aID : bID;
                if (Z.selectedID !== id) Z.select(id);
            }
            // Only the active tab stays selected (MJT 2026-11-11: "Just after opening
            // in split view in Firefox, only one tab gets selected, which is the one
            // currently active"; Firefox's selection change clears its multiselection,
            // Tabbrowser.sys.mjs clearMultiSelectedTabs).
            try {
                if (win._wvSelTabIDs && typeof win._wvSelTabIDs.clear === "function" && win._wvSelTabIDs.size) {
                    win._wvSelTabIDs.clear();
                    if (typeof (this as any)._wvTabMultiSelSync === "function") (this as any)._wvTabMultiSelSync(win);
                }
            } catch (e) {}
            this._wvTabSplitSync(win);
            return s;
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitCreate err: " + e); return null; }
    }

    /** Keep a split's two tabs side by side in the bar, left then right, in one
     *  tab group: the right one moves next to the left one and takes its group --
     *  unless the left one has just left the pins (_wvTabSplitTakePins), which then
     *  goes to its partner, into its partner's group. */
    _wvTabSplitAdjoin(win: any, s: WvTabSplit) {
        try {
            const Z: any = win.Zotero_Tabs;
            if (!s.right) return;
            const L = tabIn(win, s.left), R = tabIn(win, s.right);
            if (!L || !R) return;
            const leftMoves = !!(s.pins && s.pins.some((p) => p.side === "left") && !s.pins.some((p) => p.side === "right"));
            this._wvTabSplitJoinGroup(win, s, leftMoves ? "right" : "left");
            const li = Z._tabs.indexOf(L), ri = Z._tabs.indexOf(R);
            if (ri === li + 1 || typeof Z.move !== "function") return;
            try {
                if (leftMoves) Z.move(L.id, ri);
                else Z.move(R.id, li + 1);
            } catch (e) {}
        } catch (e) {}
    }

    /** Swap the two sides (Firefox: Reverse Tabs). */
    _wvTabSplitReverse(win: any, splitID: string) {
        const s = this._wvTabSplits(win).find((x) => x.id === splitID);
        if (!s || !s.right) return;
        const l = s.left; s.left = s.right; s.right = l; s.ratio = 1 - s.ratio;
        this._wvTabSplitAdjoin(win, s);
        this._wvTabSplitPersist();
        this._wvTabSplitSync(win);
    }

    /** Back to two ordinary tabs (Firefox: Separate Split View / Separate Tabs). */
    _wvTabSplitSeparate(win: any, splitID: string) {
        this._wvTabSplitRemove(win, splitID);
        this._wvTabSplitSync(win);
    }

    /** Close both sides (Firefox: Close Both Tabs). A tab the user may not close
     *  (a pin, or a side the split took off the pins: it goes back there) stays. */
    _wvTabSplitCloseBoth(win: any, splitID: string) {
        const s = this._wvTabSplits(win).find((x) => x.id === splitID);
        if (!s) return;
        const Z: any = win.Zotero_Tabs;
        const wasPinned = new Set((s.pins || []).map((p) => (p.side === "left" ? s.left : s.right)));
        const ids = [s.left, s.right].filter((id) => {
            const t = tabIn(win, id);
            return t && t.closable !== false && !t.pinned && !wasPinned.has(id as string);
        });
        this._wvTabSplitRemove(win, splitID);
        try { if (ids.length) Z.close(ids); } catch (e) {}
        this._wvTabSplitSync(win);
    }

    /** Draw `win` for its selected tab: the split it is part of side by side, or
     *  the deck as Zotero has it. Idempotent; runs on every tab event. */
    _wvTabSplitSync(win: any) {
        if ((this as any)._wvDestroyed || !win || win.closed) return;
        if (win._wvTSplitSyncing) return;
        win._wvTSplitSyncing = true;
        try {
            const doc = win.document;
            const Z: any = win.Zotero_Tabs;
            const deck = doc && doc.getElementById("tabs-deck");
            if (!Z || !deck) return;
            // Drop splits whose tabs are gone (closed while not observed).
            for (const s of this._wvTabSplits(win).slice()) {
                if (!tabIn(win, s.left) || (s.right && !tabIn(win, s.right))) this._wvTabSplitRemove(win, s.id);
            }
            // A library tab no longer a side: its panes as a normal tab's (item 15).
            this._wvTabSplitLibReconcile(win, false);
            this._wvTabSplitMarkStrip(win);
            const sel = Z.selectedID;
            const s = this._wvTabSplitOn() ? this._wvTabSplitOf(win, sel) : null;
            const want = new Set<string>(s ? [s.left, s.right].filter(Boolean) as string[] : []);
            for (const el of Array.from(deck.children) as any[]) {
                if (want.has(el.id)) continue;
                if (el.classList.contains("wv-tsplit-panel")) {
                    el.classList.remove("wv-tsplit-panel", "wv-tsplit-active");
                    el.removeAttribute("data-wv-side");
                    el.style.removeProperty("flex");
                    this._wvTabSplitCardUnreserve(el);
                    this._wvTabSplitLibraryUnfit(win, el);
                    this._wvTabSplitUnwirePanel(el);
                }
            }
            // A tab selection: Zotero told the selected tab the pane's state; tell
            // the sides again (_wvTabSplitPaneToggles, which makes the cache).
            if (win._wvTSplitCtxSent) win._wvTSplitCtxSent = new Map();
            const layer = this._wvTabSplitLayer(win);
            if (!s) {
                if (deck.hasAttribute("wv-tsplit")) deck.removeAttribute("wv-tsplit");
                if (layer) { layer.hidden = true; layer.textContent = ""; }
                this._wvTabSplitObserve(win, false);
                const pane = doc.getElementById("zotero-context-pane");
                if (pane) this._wvTabSplitPaneUnplace(pane);
                this._wvTabSplitPanesState(win, null);
                // Nothing of a split's state left on the window off screen.
                delete win._wvTSplitCtxSent;
                if (win._wvTSplitFitMOs instanceof Map && !win._wvTSplitFitMOs.size) delete win._wvTSplitFitMOs;
                return;
            }
            // A side Zotero unloaded (a restart, or before the wrap was in): a reader
            // loads in place, as Zotero's select loads a tab but in the background
            // (item 18: never selected on the way, the split laid out meanwhile);
            // another kind through Zotero's own select, then back.
            const other = s.left === sel ? s.right : s.left;
            const ot = other ? tabIn(win, other) : null;
            if (ot && /-unloaded$/.test(String(ot.type)) && !win._wvTSplitLoading && !this._wvTabSplitLoadPartner(win, ot)) {
                win._wvTSplitLoading = true;
                win._wvTSplitSyncing = false;
                try { Z.select(other, false, { skipFocus: true }); Z.select(sel, false, {}); }
                catch (e) {}
                finally { win._wvTSplitLoading = false; }
                win.setTimeout(() => { const lp = live(); if (lp) lp._wvTabSplitSync(win); }, 50);
                return;
            }
            if (!deck.hasAttribute("wv-tsplit")) deck.setAttribute("wv-tsplit", "");
            const sides: Array<[string | null, string]> = [[s.left, "left"], [s.right, "right"]];
            for (const [id, side] of sides) {
                const el = id ? doc.getElementById(id) : null;
                if (!el || el.parentNode !== deck) continue;
                el.classList.add("wv-tsplit-panel");
                el.classList.toggle("wv-tsplit-active", id === sel);
                if (el.getAttribute("data-wv-side") !== side) el.setAttribute("data-wv-side", side);
                this._wvTabSplitWirePanel(win, el, id);
            }
            // A reader|reader split's own side panes, the normal ones outside it.
            this._wvTabSplitPanesState(win, s);
            // A picker side: the left tab alone, the picker where the right one goes.
            if (s.picker) {
                const lel = doc.getElementById(s.left);
                if (lel) lel.style.setProperty("flex", "0 0 " + Math.round(s.ratio * 100) + "%");
            }
            else this._wvTabSplitApplyRatio(win, s);
            // The deck resizes with the window: the sides keep their minimums and
            // the splitter, footer and picker follow.
            this._wvTabSplitObserve(win, true);
            // The other side's reader keeps drawing (reader.ts wraps the activity).
            for (const id of [s.left, s.right]) {
                try { const r = id && Zotero.Reader.getByTabID(id); if (r && typeof r._updateDocShellActivity === "function") r._updateDocShellActivity(); } catch (e) {}
            }
            // A timer, not requestAnimationFrame: a hidden or covered window
            // suspends rAF, and the layer (splitter, footer, picker) would never draw.
            win.setTimeout(() => { const lp = live(); if (lp) lp._wvTabSplitDrawLayer(win); }, 0);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitSync err: " + e); }
        finally { win._wvTSplitSyncing = false; }
    }

    /** Load an unloaded reader side in place, without selecting it (item 18): what
     *  Zotero's select does for the tab it selects (tabs.js: type `-loading`, its
     *  `load` hook -- Zotero.Reader.open with the tab's id -- then markAsLoaded), with
     *  `openInBackground` so the reader takes no focus (a focus in a side selects it).
     *  False for another kind: the caller loads it through Zotero's select. */
    _wvTabSplitLoadPartner(win: any, ot: any): boolean {
        try {
            const Z: any = win.Zotero_Tabs;
            const { tabContentType, tabState } = Z.parseTabType(ot.type);
            if (tabState !== "unloaded" || tabContentType !== "reader" || !ot.data || !ot.data.itemID || typeof Z.markAsLoaded !== "function") return false;
            const idx = Z._tabs.indexOf(ot);
            const primaryViewState = ot.data.primaryViewState;
            delete ot.data.primaryViewState;
            ot.type = "reader-loading";
            try { Z._update(); } catch (e) {}
            this._wvTabSplitRing("partner " + ot.id + " loads in place beside " + Z.selectedID);
            ot.loadPromise = (async () => {
                const r: any = await Zotero.Reader.open(ot.data.itemID, null, {
                    tabID: ot.id, title: ot.title, tabIndex: idx, allowDuplicate: true, primaryViewState,
                    secondViewState: ot.data.secondViewState, preventJumpback: true, openInBackground: true, window: win,
                } as any);
                if (r && r._initPromise) await r._initPromise;
                Z.markAsLoaded(ot.id);
                const lp = live();
                if (lp && !lp._wvDestroyed) lp._wvTabSplitPartnerLoaded(win, ot.id);
            })().catch((e: any) => {
                Zotero.debug("[Weavero] split partner load err: " + e);
                try { if (/-loading$/.test(String(ot.type))) { ot.type = "reader-unloaded"; Z._update(); } } catch (er) {}
            });
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitLoadPartner err: " + e); return false; }
    }

    /** A side loaded in place: its card wired and drawn, its own sidebar and pin. */
    _wvTabSplitPartnerLoaded(win: any, id: string) {
        try {
            this._wvTabSplitSync(win);
            const s = this._wvTabSplitOf(win, id);
            const st = win._wvTSplitPanes;
            if (s && st && st.id === s.id) {
                this._wvTabSplitSidebarsApply(win, s);
                this._wvTabSplitPinsApply(win, s);
            }
            this._wvTabSplitRelayout(win);
            this._wvTabSplitRing("partner " + id + " loaded");
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPartnerLoaded err: " + e); }
    }

    /** Clicking into a side selects its tab: the panel (chrome content, the
     *  library) and, for a reader, its frame's window (a click there never
     *  reaches the chrome document). */
    _wvTabSplitWirePanel(win: any, el: any, tabID: string) {
        const on = wvListener((this as any)._wvWireTag());
        const pick = (ev?: any) => {
            try {
                const Z = win.Zotero_Tabs;
                const lp = live();
                if (Z && Z.selectedID !== tabID && lp && lp._wvTabSplitOf(win, tabID) && lp._wvTabSplitVisible(win, tabID)) {
                    lp._wvTabSplitRing((ev && ev.type) + " in " + lp._wvTabSplitSideName(win, tabID) + " (selected " + lp._wvTabSplitSideName(win, Z.selectedID) + ") on " + ((ev && ev.target && (ev.target.id || ev.target.className || ev.target.localName)) || "?"));
                    Z.select(tabID, false, { skipFocus: true });
                }
            } catch (e) {}
        };
        on(el, "tsplit:mousedown", "mousedown", pick, true);
        on(el, "tsplit:focusin", "focusin", pick, true);
        try {
            const r = Zotero.Reader.getByTabID(tabID);
            const iw = r && r._iframeWindow;
            if (iw) on(iw, "tsplit:mousedown:" + tabID, "mousedown", pick, true);
            // The document itself sits in a view frame of its own: a press there never
            // reaches the reader's window, and selected the side only through a focus
            // change -- none when the focus was already in it (item 19).
            try {
                const ir: any = (r as any)._internalReader;
                for (const v of [ir && ir._primaryView, ir && ir._secondaryView]) {
                    const vw = v && v._iframeWindow;
                    if (vw) on(vw, "tsplit:mousedown:" + tabID, "mousedown", pick, true);
                }
            } catch (e) {}
            // A side's own pane toggles -- the item pane's and the sidebar's -- act on
            // THAT side (item 9): its tab is selected first and its own state put on
            // Zotero's pane, before the reader's own handler toggles it (a press there
            // already selects it; a click alone, keyboard or script, would have
            // changed the selected side's state).
            if (iw) on(iw.document, "tsplit:ctxtoggle:" + tabID, "click", (e: any) => {
                try {
                    const t = e && e.target;
                    const ctl = t && typeof t.closest === "function" ? t.closest(".context-pane-toggle, #sidebarToggle") : null;
                    if (!ctl) return;
                    const Z = win.Zotero_Tabs;
                    const lp = live();
                    if (!Z || !lp || lp._wvDestroyed || !lp._wvTabSplitVisible(win, tabID)) return;
                    const st = win._wvTSplitPanes;
                    lp._wvTabSplitRing("toggle-click " + (ctl.id ? "#" + ctl.id : ".context-pane-toggle") + " in " + lp._wvTabSplitSideName(win, tabID)
                        + " (selected " + lp._wvTabSplitSideName(win, Z.selectedID) + ", live " + (st ? st.live : "-") + ", pane " + (win.ZoteroContextPane && win.ZoteroContextPane.collapsed ? "closed" : "open") + ")");
                    if (Z.selectedID === tabID) return;
                    Z.select(tabID, false, { skipFocus: true });
                    lp._wvTabSplitSync(win);
                } catch (er) {}
            }, true);
        } catch (e) {}
    }

    /** A panel no longer a side: its click-to-select listeners go (the reload
     *  spec holds every keyed listener to be wired again by a new instance, and a
     *  new instance wires only the sides on screen). */
    _wvTabSplitUnwirePanel(el: any) {
        try {
            wvUnlisten(el, "tsplit:mousedown");
            wvUnlisten(el, "tsplit:focusin");
            const r = Zotero.Reader.getByTabID(el.id);
            if (r && r._iframeWindow) {
                wvUnlisten(r._iframeWindow, "tsplit:mousedown:" + el.id);
                wvUnlisten(r._iframeWindow.document, "tsplit:ctxtoggle:" + el.id);
            }
            try {
                const ir: any = r && (r as any)._internalReader;
                for (const v of [ir && ir._primaryView, ir && ir._secondaryView]) {
                    if (v && v._iframeWindow) wvUnlisten(v._iframeWindow, "tsplit:mousedown:" + el.id);
                }
            } catch (e) {}
        } catch (e) {}
    }

    _wvTabSplitLayer(win: any): any {
        try {
            const doc = win.document;
            const deck = doc.getElementById("tabs-deck");
            if (!deck || !deck.parentNode) return null;
            let layer = doc.getElementById(LAYER_ID);
            if (!layer) {
                const host = deck.parentNode;
                if (!host.style.position) host.style.position = "relative";
                layer = wvHtmlEl(doc, "div");
                layer.id = LAYER_ID;
                layer.hidden = true;
                host.appendChild(layer);
            }
            return layer;
        } catch (e) { return null; }
    }

    /** The narrowest a side may be drawn: Firefox's --panel-min-width plus the
     *  card's border, whatever the side shows (MJT 2026-11-11: "Library sides in a
     *  split: Let me go to a very small width, as long as they can still be
     *  dragable. Relax the constraints when in split view"). Until then a library
     *  side took Zotero's own minimum (collections 200 + items 370 + item pane 357
     *  = 929px; zoteroPane.js updateLayoutConstraints), and two library sides at
     *  1920px moved by 47px. Its panes now shrink inside the card (CSS above,
     *  _wvTabSplitLibraryFit). The same constant for every side and state also keeps
     *  the divider still when a pane opens or closes (a library side's minimum
     *  followed its collapsed panes). */
    _wvTabSplitSideMin(_win: any, _id: any): number {
        return PANEL_MIN_PX + 2;
    }

    /** The width the two sides share: the deck less the cards' outer margins
     *  and the gap between them. */
    _wvTabSplitTotal(win: any): number {
        try {
            const deck = win.document.getElementById("tabs-deck");
            return deck ? Math.max(1, deck.getBoundingClientRect().width - 2 * EDGE_PX - GAP_PX) : 1;
        } catch (e) { return 1; }
    }

    /** Ratio `r` (the split's own by default) as drawn: off each side's minimum,
     *  as Firefox keeps --panel-min-width. When the two minimums do not fit side
     *  by side (two library views below ~1870px), Firefox's 140px alone: a side
     *  then gets what the user gave it, its items list yielding first (CSS
     *  above). The split keeps its own ratio, so a window narrowed for a while
     *  gives it back when widened. */
    _wvTabSplitDrawnRatio(win: any, s: WvTabSplit, W?: number, r?: number): number {
        const want = typeof r === "number" ? r : s.ratio;
        const total = W || this._wvTabSplitTotal(win);
        if (!(total > 1)) return want;
        const [a, b] = this._wvTabSplitMins(win, s, total);
        if (a + b >= total) return 0.5;
        return Math.max(a / total, Math.min(1 - b / total, want));
    }

    /** The two sides' minimums in force for a total width (see above). */
    _wvTabSplitMins(win: any, s: WvTabSplit, W?: number): [number, number] {
        const total = W || this._wvTabSplitTotal(win);
        const a = this._wvTabSplitSideMin(win, s.left), b = this._wvTabSplitSideMin(win, s.right);
        if (a + b >= total) return [PANEL_MIN_PX + 2, PANEL_MIN_PX + 2];
        return [a, b];
    }

    _wvTabSplitApplyRatio(win: any, s: WvTabSplit): number {
        const r = this._wvTabSplitDrawnRatio(win, s);
        try {
            const doc = win.document;
            const lel = doc.getElementById(s.left), rel = s.right ? doc.getElementById(s.right) : null;
            if (lel) lel.style.setProperty("flex", r.toFixed(4) + " 1 0px");
            if (rel) rel.style.setProperty("flex", (1 - r).toFixed(4) + " 1 0px");
        } catch (e) {}
        return r;
    }

    /** A ResizeObserver on the deck while a split is on screen. Its callback
     *  resolves the live plugin; destroy() disconnects it (_wvTabSplitUnwireAll). */
    _wvTabSplitObserve(win: any, on: boolean) {
        try {
            if (!on) {
                if (win._wvTSplitRO) { try { win._wvTSplitRO.disconnect(); } catch (e) {} }
                delete win._wvTSplitRO;
                if (win._wvTSplitPaneMO) { try { win._wvTSplitPaneMO.disconnect(); } catch (e) {} }
                delete win._wvTSplitPaneMO;
                if (win._wvTSplitPinMO) { try { win._wvTSplitPinMO.disconnect(); } catch (e) {} }
                delete win._wvTSplitPinMO;
                return;
            }
            const doc = win.document;
            // The context pane opened, closed or resized by any of Zotero's ways (the
            // reader toolbar's toggle, the side navigation's, View -> Layout, a
            // restored state): the cards keep or give back its room, and every side's
            // toolbar toggle follows.
            if (!win._wvTSplitPaneMO && typeof win.MutationObserver === "function") {
                const pane = doc.getElementById("zotero-context-pane");
                const sp = doc.getElementById("zotero-context-splitter");
                if (pane) {
                    const mo = new win.MutationObserver(() => {
                        const lp = live();
                        if (!lp || lp._wvDestroyed) return;
                        try { lp._wvTabSplitRelayout(win); } catch (e) {}
                    });
                    mo.observe(pane, { attributes: true, attributeFilter: ["collapsed", "width"] });
                    if (sp) mo.observe(sp, { attributes: true, attributeFilter: ["state"] });
                    win._wvTSplitPaneMO = mo;
                    // A section pinned or unpinned in Zotero's pane: the live side's (9b).
                    const deckEl = doc.getElementById("zotero-context-pane-item-deck");
                    if (deckEl) {
                        const pmo = new win.MutationObserver((recs: any[]) => {
                            const lp = live();
                            if (!lp || lp._wvDestroyed) return;
                            try { lp._wvTabSplitPinCapture(win, recs); } catch (e) {}
                        });
                        pmo.observe(deckEl, { attributes: true, subtree: true, attributeFilter: ["pinnedPane"] });
                        win._wvTSplitPinMO = pmo;
                    }
                }
            }
            if (win._wvTSplitRO) return;
            const deck = doc.getElementById("tabs-deck");
            if (!deck || typeof win.ResizeObserver !== "function") return;
            const ro = new win.ResizeObserver(() => {
                const lp = live();
                if (!lp || lp._wvDestroyed) return;
                try { lp._wvTabSplitRelayout(win); } catch (e) {}
            });
            ro.observe(deck);
            win._wvTSplitRO = ro;
        } catch (e) {}
    }

    _wvTabSplitRelayout(win: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            const deck = win.document.getElementById("tabs-deck");
            const s = Z && this._wvTabSplitOf(win, Z.selectedID);
            if (!s || !deck || !deck.hasAttribute("wv-tsplit")) return;
            if (!s.picker) this._wvTabSplitApplyRatio(win, s);
            this._wvTabSplitPlaceLayer(win);
        } catch (e) {}
    }

    /** The layer for the split on screen: the splitter between the sides, the
     *  footers (Firefox's split-view-footer: a side's icon and title, and a menu;
     *  here one for each side whose item pane is closed), the picker. */
    _wvTabSplitDrawLayer(win: any) {
        try {
            const doc = win.document;
            const Z: any = win.Zotero_Tabs;
            const deck = doc.getElementById("tabs-deck");
            const layer = this._wvTabSplitLayer(win);
            const s = this._wvTabSplitOf(win, Z.selectedID);
            if (!layer || !deck || !s || !deck.hasAttribute("wv-tsplit")) { if (layer) { layer.hidden = true; layer.textContent = ""; } return; }
            layer.hidden = false;
            const lel = doc.getElementById(s.left);
            const rel = s.right ? doc.getElementById(s.right) : null;
            const H = (tag: string, cls: string, parent: any) => wvHtmlEl(doc, tag, cls || undefined, undefined, parent);
            // The other side's item pane stays (its item-details renders once per
            // item, _wvTabSplitGhost); the rest is drawn again.
            for (const c of Array.from(layer.children) as any[]) { if (c.id !== GHOST_ID) c.remove(); }
            layer.setAttribute("data-split", s.id);
            if (s.picker) {
                const pk = H("div", "wv-tsplit-picker", layer);
                this._wvTabSplitFillPicker(win, s, pk);
                this._wvTabSplitPlaceLayer(win);
                return;
            }
            if (!lel || !rel) return;
            // Splitter (Firefox's tabpanels splitViewSplitter): a separator the
            // pointer drags in screen coordinates (over a reader frame the client
            // coordinates are the frame's: z-transplit #4), and the keyboard moves
            // 5px a press (browser_tab_splitview_splitter_keyboard.js).
            const sp = H("div", "wv-tsplit-splitter", layer);
            sp.setAttribute("role", "separator");
            sp.setAttribute("aria-orientation", "vertical");
            sp.setAttribute("aria-label", "Resize split view tabs");
            sp.setAttribute("aria-controls", s.left);
            sp.setAttribute("tabindex", "0");
            sp.addEventListener("pointerdown", (e: any) => { const lp = live(); if (lp) lp._wvTabSplitDragStart(win, s, sp, e); });
            sp.addEventListener("keydown", (e: any) => { const lp = live(); if (lp) lp._wvTabSplitKey(win, s, e); });
            sp.addEventListener("dblclick", () => { const lp = live(); if (!lp) return; s.ratio = 0.5; lp._wvTabSplitPersist(); lp._wvTabSplitSync(win); });
            // A footer for each side (MJT 2026-11-12: each side has its own toolbar
            // here, so Firefox's "the side not selected" does not apply): shown in
            // the corner of a side whose item pane is closed (_wvTabSplitPlaceLayer),
            // unless Settings turns the footers off.
            const footers = (this as any)._wvPref("splitViewFooter");
            for (const otherID of footers ? [s.left, s.right] : []) {
                const ot = tabIn(win, otherID);
                if (!otherID || !doc.getElementById(otherID) || !ot) continue;
                const ft = H("div", "wv-tsplit-footer", layer);
                ft.hidden = true;
                ft.setAttribute("data-tab-id", otherID);
                const icon = H("span", "wv-tsplit-icon", ft);
                this._wvTabSplitIcon(win, ot, icon);
                const title = H("span", "wv-tsplit-title", ft);
                title.textContent = ot.title || "";
                const more = H("button", "wv-tsplit-more", ft);
                more.textContent = "⋯";
                more.setAttribute("title", "Split view");
                more.setAttribute("aria-label", "Split view menu");
                ft.addEventListener("mousedown", (e: any) => {
                    if (e.button !== 0 || e.target === more) return;
                    try { Z.select(otherID); } catch (er) {}
                });
                more.addEventListener("click", (e: any) => { e.stopPropagation(); const lp = live(); if (lp) lp._wvTabSplitFooterMenu(win, s, more); });
            }
            this._wvTabSplitPlaceLayer(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitDrawLayer err: " + e); }
    }

    /** Put the layer's splitter, footer and picker where the cards are now. */
    _wvTabSplitPlaceLayer(win: any) {
        try {
            const doc = win.document;
            const Z: any = win.Zotero_Tabs;
            const deck = doc.getElementById("tabs-deck");
            const layer = doc.getElementById(LAYER_ID);
            const s = Z && this._wvTabSplitOf(win, Z.selectedID);
            if (!deck || !layer || !s) return;
            const hr = deck.parentNode.getBoundingClientRect();
            const dr = deck.getBoundingClientRect();
            const lel = doc.getElementById(s.left);
            const lr = lel && lel.getBoundingClientRect();
            const px = (n: number) => Math.round(n) + "px";
            const pk = layer.querySelector(".wv-tsplit-picker");
            if (pk) {
                const left = (lr ? lr.right : dr.left) + GAP_PX;
                pk.style.left = px(left - hr.left);
                pk.style.top = px(dr.top + EDGE_PX - hr.top);
                pk.style.width = px(Math.max(0, dr.right - EDGE_PX - left));
                pk.style.height = px(Math.max(0, dr.height - 2 * EDGE_PX));
            }
            const rel = s.right ? doc.getElementById(s.right) : null;
            if (!lr || !rel) return;
            const rr = rel.getBoundingClientRect();
            const sp = layer.querySelector(".wv-tsplit-splitter");
            if (sp) {
                sp.style.left = px(lr.right - hr.left);
                sp.style.width = px(Math.max(1, rr.left - lr.right));
                sp.style.top = px(lr.top - hr.top);
                sp.style.height = px(lr.height);
                const active = Z.selectedID === s.left ? "left" : "right";
                if (sp.getAttribute("data-active-side") !== active) sp.setAttribute("data-active-side", active);
                const W = this._wvTabSplitTotal(win);
                const [minL, minR] = this._wvTabSplitMins(win, s, W);
                sp.setAttribute("aria-valuenow", String(Math.floor(lr.width)));
                sp.setAttribute("aria-valuemin", String(Math.round(minL)));
                sp.setAttribute("aria-valuemax", String(Math.round(W - minR)));
            }
            // The item panes inside the cards, before the footer that sits beside them.
            this._wvTabSplitLibraryFit(win, s);
            this._wvTabSplitPlacePane(win, s);
            this._wvTabSplitPlaceFooters(win);
        } catch (e) {}
    }

    /** The footers: the bottom end corner of each side whose item pane is closed,
     *  inside its border (Firefox: inset by the border width, under its rounded
     *  corner). A side with its item pane open has none: the pane's header names
     *  the item. */
    _wvTabSplitPlaceFooters(win: any) {
        try {
            const doc = win.document;
            const deck = doc.getElementById("tabs-deck");
            const layer = doc.getElementById(LAYER_ID);
            if (!deck || !layer) return;
            const hr = deck.parentNode.getBoundingClientRect();
            const px = (n: number) => Math.round(n) + "px";
            for (const ft of Array.from(layer.querySelectorAll(".wv-tsplit-footer")) as any[]) {
                const oel = doc.getElementById(ft.getAttribute("data-tab-id"));
                const off = !oel || this._wvTabSplitSidePaneOpen(oel);
                if (ft.hidden !== off) ft.hidden = off;
                if (off) continue;
                const or = oel.getBoundingClientRect();
                const fr = ft.getBoundingClientRect();
                ft.style.left = px(or.right - 1 - hr.left - fr.width);
                ft.style.top = px(or.bottom - 1 - hr.top - fr.height);
            }
        } catch (e) {}
    }

    /** Whether the item pane of a side (its card) is open: a reader's or a note's
     *  drawn in its card (_wvTabSplitPlacePane), a library's own inside its view. */
    _wvTabSplitSidePaneOpen(card: any): boolean {
        try {
            if (card.hasAttribute("wv-tsplit-paned")) return true;
            const view = card.querySelector("library-view") || (card.querySelector("#zotero-collections-pane") ? card : null);
            if (!view) return false;
            const ip: any = view.querySelector("#zotero-item-pane, [id^='zotero-item-pane-tab-']");
            return !!ip && !(typeof ip.collapsed === "boolean" ? ip.collapsed : wvBoolAttrOn(ip, "collapsed"));
        }
        catch (e) {
            return false;
        }
    }

    /** A library side's panes, as Zotero draws them at full width, for the CSS that
     *  lets them shrink in proportion inside a narrow card (--wv-tsplit-collw,
     *  --wv-tsplit-ipw): each pane's own width (zotero-persist), never under its
     *  minimum; a collapsed collections pane takes nothing, a collapsed item pane its
     *  side navigation. Kept current by an observer of those panes while the side is
     *  on screen. Zotero's stacked layout is left as Zotero lays it out. */
    _wvTabSplitLibraryFit(win: any, s: WvTabSplit) {
        try {
            const doc = win.document;
            const stacked = Zotero.Prefs.get("layout") === "stacked";
            if (!(win._wvTSplitFitMOs instanceof Map)) win._wvTSplitFitMOs = new Map();
            const mos: Map<string, any> = win._wvTSplitFitMOs;
            for (const id of [s.left, s.right]) {
                const card = id ? doc.getElementById(id) : null;
                if (!card) continue;
                // A Zotero with its own windows: the tab's library-view; an older
                // Zotero: its one library pane, the deck child #zotero-pane itself.
                const view = card.querySelector("library-view") || (card.querySelector("#zotero-collections-pane") ? card : null);
                if (!view || stacked) { this._wvTabSplitLibraryUnfit(win, card); continue; }
                const q = (base: string) => view.querySelector("#" + base + ", [id^='" + base + "-tab-']");
                const cp: any = q("zotero-collections-pane"), ip: any = q("zotero-item-pane");
                const own = (el: any) => { const v = parseFloat(el && el.style && el.style.width); return v > 0 ? v : (parseFloat(el && el.getAttribute && el.getAttribute("width")) || 0); };
                const cpOff = !cp || wvBoolAttrOn(cp, "collapsed");
                const ipOff = !ip || (typeof ip.collapsed === "boolean" ? ip.collapsed : wvBoolAttrOn(ip, "collapsed"));
                const collw = cpOff ? 0 : Math.round(Math.max(LIB_COLLECTIONS_MIN, own(cp)));
                const ipw = ipOff ? LIB_SIDENAV : Math.round(Math.max(LIB_ITEM_PANE_MIN, own(ip)));
                const set = (k: string, v: number) => { if (card.style.getPropertyValue(k) !== v + "px") card.style.setProperty(k, v + "px"); };
                set("--wv-tsplit-collw", collw);
                set("--wv-tsplit-ipw", ipw);
                if (!card.hasAttribute("wv-tsplit-libfit")) card.setAttribute("wv-tsplit-libfit", "");
                if (!mos.has(card.id) && typeof win.MutationObserver === "function") {
                    const mo = new win.MutationObserver(() => {
                        const lp = live();
                        if (!lp || lp._wvDestroyed) return;
                        try { const cur = lp._wvTabSplitOf(win, win.Zotero_Tabs.selectedID); if (cur) { lp._wvTabSplitLibraryFit(win, cur); lp._wvTabSplitPlaceFooters(win); } } catch (e) {}
                    });
                    for (const el of [cp, ip]) if (el) mo.observe(el, { attributes: true, attributeFilter: ["collapsed", "width", "style"] });
                    mos.set(card.id, mo);
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitLibraryFit err: " + e); }
    }

    _wvTabSplitLibraryUnfit(win: any, card: any) {
        try {
            if (card.hasAttribute("wv-tsplit-libfit")) card.removeAttribute("wv-tsplit-libfit");
            for (const k of ["--wv-tsplit-collw", "--wv-tsplit-ipw"]) if (card.style.getPropertyValue(k)) card.style.removeProperty(k);
            const mos = win && win._wvTSplitFitMOs;
            if (mos instanceof Map && mos.has(card.id)) { try { mos.get(card.id).disconnect(); } catch (e) {} mos.delete(card.id); }
        } catch (e) {}
    }

    /** Zotero's context-pane width as Zotero draws it: its own (the splitter's
     *  `width`, mirrored inline by ZoteroContextPane.update), never under its CSS
     *  minimum ($min-width-context-pane 320 + $width-sidenav 37). */
    _wvTabSplitPaneWidth(win: any): number {
        try {
            const pane = win.document.getElementById("zotero-context-pane");
            let w = parseFloat(pane.style.width);
            if (!(w > 0)) w = parseFloat(pane.getAttribute("width"));
            return Math.max(w > 0 ? w : 0, CTX_PANE_MIN);
        } catch (e) { return CTX_PANE_MIN; }
    }

    /** The item panes of split `s` inside their cards (CSS above): Zotero's context
     *  pane over the end of the card it serves -- the selected side when it has one,
     *  else the other (a library selected beside a reader or a note) -- and the
     *  other side's own item pane, when it has one too, at the same place, at that
     *  side's own width where the split keeps its own panes (item 13), else at the
     *  same width (MJT: "on each side"; a side switch then moves neither reader:
     *  Zotero's pane takes the incoming side's width). Closed, or in
     *  Zotero's stacked layout, nothing is reserved. A card narrower than the pane:
     *  the document gives way first, then the pane, never its side navigation. */
    _wvTabSplitPlacePane(win: any, s: WvTabSplit) {
        try {
            const doc = win.document;
            const Z: any = win.Zotero_Tabs;
            const deck = doc.getElementById("tabs-deck");
            const pane = doc.getElementById("zotero-context-pane");
            const layer = doc.getElementById(LAYER_ID);
            if (!deck || !pane || !layer || !Z) return;
            const hasPane = (id: any) => { const t = tabIn(win, id); try { return !!(t && Z.hasContextPane(baseType(t))); } catch (e) { return false; } };
            const sel = Z.selectedID;
            const other = s.left === sel ? s.right : s.left;
            let host: string | null = null, ghostID: string | null = null;
            if (!s.picker && s.right && (sel === s.left || sel === s.right)) {
                if (hasPane(sel)) { host = sel; if (other && hasPane(other)) ghostID = other; }
                else if (other && hasPane(other)) host = other;
            }
            const CP: any = win.ZoteroContextPane;
            const stacked = Zotero.Prefs.get("layout") === "stacked";
            // A split that keeps its own panes: each side its own (item 9); Zotero's
            // pane state is the live side's, switched in first.
            const managed = this._wvTabSplitManaged(win, s) && win._wvTSplitPanes && win._wvTSplitPanes.id === s.id;
            if (managed) { this._wvTabSplitPanesSwitch(win, s, false); this._wvTabSplitPanesCapture(win, s); }
            // A press in the other side's own pane holds the roles until its release
            // (item 19, MJT 2026-11-12: "the first click only focuses that part of the
            // split view ... No delay by focus click"): the press selected that side,
            // and swapping the panes now would put Zotero's pane, another element, under
            // the pointer before the release -- no click on either. Its own pane stays
            // where it is; Zotero's, already showing that side's item, waits hidden
            // over the other card; the swap follows the release (_wvTabSplitHoldRelease).
            const hold = managed && win._wvTSplitHold && win._wvTSplitHold.until > Date.now() ? win._wvTSplitHold : null;
            const holding = !!(hold && hold.id === sel && host === sel && other && ghostID === other);
            if (holding) { host = other; ghostID = sel; }
            const liveID = managed ? (win._wvTSplitPanes.live === "left" ? s.left : (win._wvTSplitPanes.live === "right" ? s.right : null)) : null;
            const ownOf = (id: string): any => s.panes && (s.panes as any)[id === s.left ? "left" : "right"];
            // Zotero's pane holds the live side's state, every other side its own.
            const sideOpen = (id: string | null) => {
                if (!id || stacked || !CP) return false;
                if (!managed || id === liveID) return !CP.collapsed;
                const p = ownOf(id);
                return !!(p && p.ctx);
            };
            const open = !!host && sideOpen(host);
            const W = this._wvTabSplitPaneWidth(win);
            // Each side its own width where the split keeps its own panes (item 13):
            // Zotero's pane holds the live side's, the other side's own pane its own.
            const wOf = (id: string) => {
                if (!managed || id === liveID) return W;
                const p: any = ownOf(id);
                return p && p.ctxW > 0 ? Math.max(p.ctxW, CTX_PANE_MIN) : W;
            };
            const rtl = win.getComputedStyle(deck).direction === "rtl";
            const widths = new Map<string, number>();
            for (const id of [s.left, s.right]) {
                const card = id ? doc.getElementById(id) : null;
                if (!card) continue;
                if ((id === host && open) || (id === ghostID && sideOpen(ghostID))) {
                    const inner = Math.max(0, card.getBoundingClientRect().width - 2);
                    const w = Math.round(Math.max(Math.min(wOf(id as string), inner), Math.min(LIB_SIDENAV, inner)));
                    widths.set(id as string, w);
                    if (card.style.getPropertyValue("--wv-tsplit-pane-w") !== w + "px") card.style.setProperty("--wv-tsplit-pane-w", w + "px");
                    if (!card.hasAttribute("wv-tsplit-paned")) card.setAttribute("wv-tsplit-paned", "");
                }
                else this._wvTabSplitCardUnreserve(card);
            }
            const hr = deck.parentNode.getBoundingClientRect();
            const geom = (id: string) => {
                const cr = doc.getElementById(id).getBoundingClientRect();
                const w = widths.get(id) || 0;
                return { x: rtl ? cr.left + 1 : cr.right - 1 - w, y: cr.top + 1, w, h: Math.max(0, cr.height - 2) };
            };
            if (open && host) {
                const g = geom(host);
                const set = (k: string, v: number) => { if (pane.style.getPropertyValue(k) !== Math.round(v) + "px") pane.style.setProperty(k, Math.round(v) + "px"); };
                set("--wv-tsplit-pane-x", g.x); set("--wv-tsplit-pane-y", g.y); set("--wv-tsplit-pane-w", g.w); set("--wv-tsplit-pane-h", g.h);
            }
            else this._wvTabSplitPaneUnplace(pane);
            // Held: Zotero's pane shows the pressed side's item already -- not over
            // the other card.
            const vis = holding ? "hidden" : "";
            if (pane.style.visibility !== vis) pane.style.visibility = vis;
            const ghostOpen = !!ghostID && sideOpen(ghostID);
            this._wvTabSplitGhost(win, ghostOpen ? ghostID : null, ghostOpen ? geom(ghostID as string) : null, hr);
            // The pane's own edge resizes it (Zotero's splitter, in the window's flow,
            // would size the deck).
            let h = layer.querySelector(".wv-tsplit-pane-handle");
            if (open && host && !holding) {
                const g = geom(host);
                if (!h) {
                    h = wvHtmlEl(doc, "div", "wv-tsplit-pane-handle", undefined, layer);
                    h.setAttribute("role", "separator");
                    h.setAttribute("aria-orientation", "vertical");
                    h.addEventListener("pointerdown", (e: any) => { const lp = live(); if (lp) lp._wvTabSplitPaneDragStart(win, h, e); });
                }
                h.style.left = Math.round((rtl ? g.x + g.w : g.x) - 3 - hr.left) + "px";
                h.style.top = Math.round(g.y - hr.top) + "px";
                h.style.height = Math.round(g.h) + "px";
            }
            else if (h) h.remove();
            this._wvTabSplitPaneToggles(win, s);
            if (managed) this._wvTabSplitPinsApply(win, s);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPlacePane err: " + e); }
    }

    _wvTabSplitCardUnreserve(card: any) {
        try {
            if (card.hasAttribute("wv-tsplit-paned")) card.removeAttribute("wv-tsplit-paned");
            if (card.style.getPropertyValue("--wv-tsplit-pane-w")) card.style.removeProperty("--wv-tsplit-pane-w");
        } catch (e) {}
    }

    _wvTabSplitPaneUnplace(pane: any) {
        try { for (const k of ["--wv-tsplit-pane-x", "--wv-tsplit-pane-y", "--wv-tsplit-pane-w", "--wv-tsplit-pane-h"]) if (pane.style.getPropertyValue(k)) pane.style.removeProperty(k); } catch (e) {}
        // A press hold's (item 19), never left behind.
        try { if (pane.style.visibility === "hidden") pane.style.visibility = ""; } catch (e) {}
    }

    /** Each side's toolbar toggle follows the pane: Zotero tells only the selected
     *  tab (ZoteroContextPane.update -> tab-content setContextPaneOpen), and the side
     *  beside it kept the state it had when last selected -- no toggle in its toolbar
     *  while the pane was closed. Sent once per state and tab (sync resets it). */
    _wvTabSplitPaneToggles(win: any, s: WvTabSplit) {
        try {
            const CP: any = win.ZoteroContextPane;
            if (!CP) return;
            const live = !CP.collapsed;
            const managed = this._wvTabSplitManaged(win, s) && win._wvTSplitPanes && win._wvTSplitPanes.id === s.id;
            const liveSide = managed ? win._wvTSplitPanes.live : null;
            if (!(win._wvTSplitCtxSent instanceof Map)) win._wvTSplitCtxSent = new Map();
            const sent: Map<string, boolean> = win._wvTSplitCtxSent;
            for (const id of [s.left, s.right]) {
                if (!id) continue;
                // Each side's own state where the split keeps its own panes.
                const side = id === s.left ? "left" : "right";
                const own = managed && s.panes && (s.panes as any)[side];
                const open = managed && side !== liveSide && own ? !!own.ctx : live;
                const el = win.document.getElementById(id);
                if (!el || typeof el.setContextPaneOpen !== "function" || sent.get(id) === open) continue;
                sent.set(id, open);
                try { el.setContextPaneOpen(open); } catch (e) {}
            }
        } catch (e) {}
    }

    /** The side not selected shows its own item in the place Zotero's pane takes on
     *  the selected side: a Weavero <item-details> with its own side navigation, in
     *  the layer. Its observer of the tab selection is set aside (it would freeze the
     *  pane on the first item: reference_zotero_itemdetails_standalone) and it renders
     *  on a new item only. A press on it selects its side, whose Zotero pane then
     *  takes over. `tabID` null: gone. */
    _wvTabSplitGhost(win: any, tabID: string | null, g: { x: number; y: number; w: number; h: number } | null, hr: any) {
        try {
            const doc = win.document;
            const layer = doc.getElementById(LAYER_ID);
            let gh: any = doc.getElementById(GHOST_ID);
            if (!tabID || !g || !layer) { if (gh) { gh.remove(); wvUIRootsPrune(); } return; }
            const tag = (this as any)._wvWireTag();
            if (gh && (gh.getAttribute("data-wv-tag") !== tag || gh.parentNode !== layer)) { gh.remove(); gh = null; wvUIRootsPrune(); }
            if (!gh) {
                gh = doc.createXULElement("hbox");
                gh.id = GHOST_ID;
                gh.setAttribute("data-wv-tag", tag);
                const det = doc.createXULElement("item-details");
                det.id = GHOST_ID + "-details";
                det.className = "zotero-item-pane-content";
                const sn = doc.createXULElement("item-pane-sidenav");
                sn.id = GHOST_ID + "-sidenav";
                sn.className = "zotero-view-item-sidenav";
                gh.append(det, sn);
                layer.appendChild(gh);
                try { det._handleTabSelect = function () {}; } catch (e) {}
                try { if (typeof sn.toggleDefaultStatus === "function") sn.toggleDefaultStatus(false); } catch (e) {}
                try { det.sidenav = sn; } catch (e) {}
                // A pin set in this side's own pane (its side navigation, a section's
                // menu) is that side's own (9b): Zotero's pane takes it when the side
                // is selected (item 19, the press hold's swap included).
                try {
                    if (typeof win.MutationObserver === "function") {
                        const mo = new win.MutationObserver(() => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabSplitGhostPin(win, gh); });
                        mo.observe(det, { attributes: true, attributeFilter: ["pinnedPane"] });
                    }
                } catch (e) {}
                // View -> Font Size and the density reach registered roots only (src-ts.md);
                // through wvUIRoot, dropped again with the ghost (lib/ui-roots.ts).
                try { wvUIRoot(gh, tag); } catch (e) {}
                gh.addEventListener("mousedown", (e: any) => {
                    try {
                        const id = gh.getAttribute("data-tab-id");
                        const Z = win.Zotero_Tabs;
                        const lp = live();
                        // Its own collapse button closes this side's pane (item 9),
                        // without selecting the side.
                        const tg = e && e.target && e.target.closest && e.target.closest('[data-action="toggle-pane"]');
                        const s = lp && id ? lp._wvTabSplitOf(win, id) : null;
                        if (tg && s && s.panes) {
                            const own = (s.panes as any)[id === s.left ? "left" : "right"];
                            if (own) {
                                e.preventDefault(); e.stopPropagation();
                                lp._wvTabSplitRing("ghost toggle closes " + lp._wvTabSplitSideName(win, id) + " (selected " + lp._wvTabSplitSideName(win, Z.selectedID) + ")");
                                own.ctx = false;
                                lp._wvTabSplitRelayout(win);
                                lp._wvTabSplitPersistSoon();
                                return;
                            }
                        }
                        if (id && Z && Z.selectedID !== id) {
                            // The press reaches what it was on (item 19): the panes
                            // keep their places until its release.
                            if (lp && (e.button === 0 || e.button === 2)) lp._wvTabSplitHoldPress(win, id, e.button);
                            Z.select(id);
                        }
                    } catch (er) {}
                }, true);
            }
            const px = (n: number) => Math.round(n) + "px";
            gh.style.left = px(g.x - hr.left);
            gh.style.top = px(g.y - hr.top);
            gh.style.width = px(g.w);
            gh.style.height = px(g.h);
            // Bind its item as Zotero binds a tab's (contextPane.js _addItemContext):
            // a note itself, an attachment its parent.
            const t = tabIn(win, tabID);
            const iid = t && t.data && t.data.itemID;
            const item = iid ? Zotero.Items.get(iid) : null;
            const det: any = gh.querySelector("item-details");
            if (!item || !det) return;
            const target = item.isNote() ? item : (item.parentID ? Zotero.Items.get(item.parentID) : item);
            if (gh.getAttribute("data-tab-id") === tabID && det.item === target) return;
            gh.setAttribute("data-tab-id", tabID);
            try { det.editable = Zotero.Libraries.get(item.libraryID).editable && !item.deleted && !target.deleted; } catch (e) {}
            det.tabID = GHOST_ID;
            try { det.tabType = win.Zotero_Tabs.parseTabType(t.type).tabContentType || baseType(t); } catch (e) { det.tabType = baseType(t); }
            det.item = target;
            det.parentID = item.parentID;
            det.skipRender = false;
            try { det.render(); } catch (e) { Zotero.debug("[Weavero] split ghost render err: " + e); }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitGhost err: " + e); }
    }

    /** A press in the other side's own pane (item 19): the panes keep their places
     *  until the press is over -- the release of the left button (the click lands
     *  on the element the press was on), or for the right one the context menu it
     *  opened closing (its entries act on that pane). Bounded. */
    _wvTabSplitHoldPress(win: any, id: string, button: number) {
        try {
            const prev = win._wvTSplitHold;
            if (prev && typeof prev.stop === "function") prev.stop();
            const h: any = { id, button, until: Date.now() + (button === 2 ? 15000 : 4000) };
            const release = () => { h.stop(); win.setTimeout(() => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabSplitHoldRelease(win, h); }, 0); };
            const onUp = (ev: any) => {
                if (!ev || ev.button !== button) return;
                if (button !== 2) { release(); return; }
                // The right button: the context menu opens after the release, or not.
                h.menuWait = win.setTimeout(() => { if (!h.menu) release(); }, 500);
            };
            const onShown = (ev: any) => { if (button === 2 && ev && ev.target && ev.target.localName === "menupopup") h.menu = ev.target; };
            const onHidden = (ev: any) => { if (h.menu && ev && ev.target === h.menu) release(); };
            const onEnd = () => release();
            h.stop = () => {
                try { win.removeEventListener("mouseup", onUp, true); win.removeEventListener("dragend", onEnd, true); win.removeEventListener("popupshown", onShown, true); win.removeEventListener("popuphidden", onHidden, true); } catch (e) {}
                try { win.clearTimeout(h.timer); win.clearTimeout(h.menuWait); } catch (e) {}
                if (win._wvTSplitHold === h) h.done = true;
            };
            win.addEventListener("mouseup", onUp, true);
            win.addEventListener("dragend", onEnd, true);
            win.addEventListener("popupshown", onShown, true);
            win.addEventListener("popuphidden", onHidden, true);
            h.timer = win.setTimeout(release, h.until - Date.now());
            win._wvTSplitHold = h;
            this._wvTabSplitRing("press held in the own pane of " + this._wvTabSplitSideName(win, id) + " (button " + button + ")");
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitHoldPress err: " + e); }
    }

    /** The press is over: the panes take their places for the selected side (the
     *  swap the press held), and a field it began to edit in the side's own pane goes
     *  on in Zotero's, which now shows that item. */
    _wvTabSplitHoldRelease(win: any, h: any) {
        try {
            if (win._wvTSplitHold !== h) return;
            delete win._wvTSplitHold;
            const doc = win.document;
            const gh = doc.getElementById(GHOST_ID);
            let field: string | null = null;
            try {
                const ae: any = doc.activeElement;
                const et = ae && gh && gh.contains(ae) && typeof ae.closest === "function" ? ae.closest("editable-text") : null;
                if (et && et.id) field = et.id;
            } catch (e) {}
            this._wvTabSplitRelayout(win);
            if (field) {
                try {
                    const cp: any = doc.getElementById("zotero-context-pane-inner");
                    const det = cp && typeof cp._getItemContext === "function" ? cp._getItemContext(win.Zotero_Tabs.selectedID) : null;
                    const el = det && det.querySelector("#" + win.CSS.escape(field));
                    if (el && typeof el.focus === "function") el.focus();
                } catch (e) {}
            }
            this._wvTabSplitRing("press released: panes for " + this._wvTabSplitSideName(win, win.Zotero_Tabs && win.Zotero_Tabs.selectedID) + (field ? ", editing " + field : ""));
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitHoldRelease err: " + e); }
    }

    /** A pin set in a side's own pane: that side's own (9b). */
    _wvTabSplitGhostPin(win: any, gh: any) {
        try {
            const id = gh.getAttribute("data-tab-id");
            const s = id ? this._wvTabSplitOf(win, id) : null;
            const det: any = gh.querySelector("item-details");
            if (!s || !s.panes || !det) return;
            const own: any = (s.panes as any)[id === s.left ? "left" : "right"];
            if (!own) return;
            const pin = det.pinnedPane || "";
            if (own.pin === pin) return;
            own.pin = pin;
            this._wvTabSplitRing("pin " + (pin || "none") + " in the own pane of " + this._wvTabSplitSideName(win, id));
            this._wvTabSplitPersistSoon();
        } catch (e) {}
    }

    /** The splits that keep their own side panes: readers and library views (MJT
     *  2026-11-11: "I should be able to open the panes independantly in each side.
     *  The opening and closing of panes should be independant also from the opening
     *  state in normal tabs", and "Same for pinning the item pane sections"). A note
     *  side keeps Zotero's. */
    _wvTabSplitManaged(win: any, s: WvTabSplit | null): boolean {
        if (!s || s.picker || !s.right) return false;
        const a = baseType(tabIn(win, s.left)), b = baseType(tabIn(win, s.right));
        const ok = (k: string) => k === "reader" || k === "library";
        return ok(a) && ok(b);
    }

    /** The side whose item pane Zotero's context pane shows now: the selected side
     *  when it is a reader, else the reader beside the selected library. */
    _wvTabSplitLiveSide(win: any, s: WvTabSplit): "left" | "right" | null {
        const Z: any = win.Zotero_Tabs;
        const isReader = (id: any) => baseType(tabIn(win, id)) === "reader";
        const sel = Z && Z.selectedID;
        if (sel !== s.left && sel !== s.right) return null;
        const selSide = sel === s.left ? "left" : "right";
        if (isReader(sel)) return selSide;
        const other = selSide === "left" ? s.right : s.left;
        return isReader(other) ? (selSide === "left" ? "right" : "left") : null;
    }

    /** A split that keeps its own panes shows them; leaving it (another tab
     *  selected, the split separated or closed, a disable) gives back exactly the
     *  normal ones, widths too. Each reader side has its own item pane and its own
     *  left sidebar, open or closed (item 9), and its own item pane width (item 13);
     *  a reader side starts with both closed, beside a reader or a library (item 14).
     *  Where Zotero keeps them: the context pane's open state and width in its own
     *  attributes, saved only through serializePersist (zotero-persist: the
     *  splitter's `state`, the pane's `width`; at a window's close, a library-tab
     *  switch, a new window) -- they hold the LIVE side's state while the split is on
     *  screen, and the serializePersist wrap writes the normal ones into what Zotero
     *  saves (_wvTabSplitPersistNormal); the readers' sidebar in one state per tab
     *  type, saved at every change (Zotero_Tabs updateSidebarLayout -> pref
     *  sidebarState) -- routed to the side's own while the split is on screen
     *  (_wvTabSplitSidebarRoute), never reaching Zotero. */
    /** Right after Zotero's select (the "splitSelect" layer), in its own task: the
     *  split's pane state moved to the newly selected side before anything can
     *  toggle a pane (item 20), and the split laid out and its layer drawn before
     *  the first frame paints (item 18, MJT 2026-11-12: "it first appears only one
     *  tab before getting into split view. Is it possible to make it directly
     *  appear in split view correctly?" -- the tab notifier's Sync and the layer's
     *  timer ran in later tasks, ~50-110 ms of the tab alone, the context pane at
     *  the window's edge). Leaving a split, its layout goes in the same task. */
    _wvTabSplitSelectNow(win: any) {
        try {
            if (!this._wvTabSplitOn()) return;
            const Z: any = win.Zotero_Tabs;
            if (!Z) return;
            const s = this._wvTabSplitOf(win, Z.selectedID);
            const st = win._wvTSplitPanes;
            const want = s && !s.picker && this._wvTabSplitManaged(win, s) ? s : null;
            const deck = win.document.getElementById("tabs-deck");
            const wasSplit = !!(deck && deck.hasAttribute("wv-tsplit"));
            if (!st && !want && !s && !wasSplit) return;
            const before = st ? st.live : null;
            // Inside Zotero's select: the pins wait for its own selection handler
            // (contextPane.js _selectItemContext carries the previous tab's pin over),
            // the context pane wrap puts them after it (_wvTabSplitPinsAfterSelect).
            win._wvTSplitSelectNow = true;
            try {
                if (st || want) this._wvTabSplitPanesState(win, want);
                // Not while a side is loaded through Zotero's select and back: laid
                // out once that is over.
                if (!win._wvTSplitLoading) {
                    this._wvTabSplitSync(win);
                    if (s) this._wvTabSplitDrawLayer(win);
                }
            }
            finally { delete win._wvTSplitSelectNow; }
            const after = win._wvTSplitPanes ? win._wvTSplitPanes.live : null;
            if (before !== after) this._wvTabSplitRing("select " + Z.selectedID + ": live " + before + " -> " + after);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitSelectNow err: " + e); }
    }

    /** A capped ring of every pane request on a split (item 20, an intermittent
     *  report: the next occurrence is already recorded). Read through the bridge
     *  with `Zotero._wvSplitRing.join("\n")`. */
    _wvTabSplitRing(m: string) {
        try {
            const Z: any = Zotero as any;
            if (!Array.isArray(Z._wvSplitRing)) Z._wvSplitRing = [];
            Z._wvSplitRing.push(new Date().toISOString().slice(11, 23) + " " + m);
            if (Z._wvSplitRing.length > 300) Z._wvSplitRing.shift();
        } catch (e) {}
    }

    /** "left"/"right" for a split's tab, for the ring. */
    _wvTabSplitSideName(win: any, id: any): string {
        const s = this._wvTabSplitOf(win, id);
        return s ? (s.left === id ? "L" : "R") + ":" + id : "-:" + id;
    }

    _wvTabSplitPanesState(win: any, s: WvTabSplit | null) {
        try {
            const want = this._wvTabSplitManaged(win, s) ? s : null;
            const cur = win._wvTSplitPanes;
            if (cur && (!want || cur.id !== want.id)) this._wvTabSplitPanesLeave(win);
            if (want && !win._wvTSplitPanes) this._wvTabSplitPanesEnter(win, want as WvTabSplit);
            else if (want) this._wvTabSplitPanesSwitch(win, want as WvTabSplit, false);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPanesState err: " + e); }
    }

    _wvTabSplitPanesEnter(win: any, s: WvTabSplit) {
        const CP: any = win.ZoteroContextPane;
        const Z: any = win.Zotero_Tabs;
        const pane = win.document.getElementById("zotero-context-pane");
        if (!CP || !pane || !Z) return;
        const spState = (id: string) => { const sp = win.document.getElementById(id); return sp ? sp.getAttribute("state") : null; };
        win._wvTSplitPanes = { id: s.id, live: null, normal: { collapsed: !!CP.collapsed, widthAttr: pane.getAttribute("width"), styleW: pane.style.width,
            sp: { "zotero-context-splitter": spState("zotero-context-splitter"), "zotero-context-splitter-stacked": spState("zotero-context-splitter-stacked") } } };
        if (!s.panes) s.panes = {};
        // A reader side starts with its panes closed and no pinned section, beside a
        // reader or a library alike (item 14, MJT 2026-11-11: "Start with panes
        // closed"); its item pane width starts at the normal one (item 13).
        const normalW = this._wvTabSplitPaneWidth(win);
        for (const side of ["left", "right"] as const) {
            const kind = baseType(tabIn(win, side === "left" ? s.left : s.right));
            if (!s.panes[side]) {
                if (kind === "library") { s.panes[side] = { ctx: false, sb: false, sbW: null }; continue; }
                if (kind !== "reader") continue;
                s.panes[side] = { ctx: false, sb: false, sbW: null, pin: "" };
            }
            const own = s.panes[side] as WvTabSplitSidePanes;
            if (kind === "reader" && !((own.ctxW as number) > 0)) own.ctxW = normalW;
        }
        // A library side's own panes (item 15).
        this._wvTabSplitLibForm(win, s);
        // The pinned section the context pane carries from tab to tab (contextPane.js
        // _selectItemContext), given back on leaving.
        try { const cp: any = win.document.getElementById("zotero-context-pane-inner"); const c = cp && cp._sidenav && cp._sidenav.container; win._wvTSplitPanes.normal.ctxPin = (c && c.pinnedPane) || ""; } catch (e) {}
        this._wvTabSplitPanesSwitch(win, s, true);
        this._wvTabSplitSidebarsApply(win, s);
        this._wvTabSplitPinsApply(win, s);
    }

    /** Zotero's context pane takes the live side's own state, open and width: on
     *  entering, and whenever the live side changes (a side switch), after keeping
     *  the outgoing side's (what the user did to Zotero's pane while it was that
     *  side's). Its width before its open state: the toggle draws it (update). */
    _wvTabSplitPanesSwitch(win: any, s: WvTabSplit, entering: boolean) {
        const st = win._wvTSplitPanes;
        if (!st || st.id !== s.id || !s.panes) return;
        const CP: any = win.ZoteroContextPane;
        if (!CP) return;
        const live = this._wvTabSplitLiveSide(win, s);
        if (!entering && live === st.live) return;
        const out = !entering && st.live ? (s.panes as any)[st.live] : null;
        if (out) { out.ctx = !CP.collapsed; const w = this._wvTabSplitPaneAttrW(win); if (w) out.ctxW = w; }
        const own = live ? (s.panes as any)[live] : null;
        this._wvTabSplitRing("switch " + (entering ? "(enter) " : "") + (st.live || "-") + (out ? "(kept ctx " + out.ctx + ")" : "") + " -> " + (live || "-") + (own ? "(gets ctx " + !!own.ctx + ")" : ""));
        st.live = live;
        if (own && own.ctxW > 0) this._wvTabSplitSetPaneW(win, own.ctxW);
        if (own && !!CP.collapsed !== !own.ctx) CP.collapsed = !own.ctx;
    }

    /** What the user did to Zotero's pane (any of Zotero's ways, and the pane
     *  handle) is the live side's: open and width. */
    _wvTabSplitPanesCapture(win: any, s: WvTabSplit) {
        const st = win._wvTSplitPanes;
        if (!st || st.id !== s.id || !st.live || !s.panes) return;
        if (this._wvTabSplitLiveSide(win, s) !== st.live) return;
        const own = (s.panes as any)[st.live];
        const CP: any = win.ZoteroContextPane;
        if (own && CP && !!own.ctx !== !CP.collapsed) {
            this._wvTabSplitRing("pane " + (CP.collapsed ? "closed" : "opened") + " on " + st.live + " (selected " + this._wvTabSplitSideName(win, win.Zotero_Tabs && win.Zotero_Tabs.selectedID) + ")");
            own.ctx = !CP.collapsed;
        }
        const w = this._wvTabSplitPaneAttrW(win);
        if (own && w) own.ctxW = w;
    }

    /** Zotero's context-pane width, its own attribute (what it persists). */
    _wvTabSplitPaneAttrW(win: any): number | null {
        try {
            const w = parseFloat(win.document.getElementById("zotero-context-pane").getAttribute("width"));
            return w > 0 ? w : null;
        } catch (e) { return null; }
    }

    /** Zotero's context-pane width set as its splitter sets it: the attribute, and
     *  the inline width ZoteroContextPane.update mirrors it into (not in the stacked
     *  layout, where Zotero's is `auto`). */
    _wvTabSplitSetPaneW(win: any, w: number) {
        try {
            const pane = win.document.getElementById("zotero-context-pane");
            if (!pane) return;
            if (pane.getAttribute("width") !== String(w)) pane.setAttribute("width", String(w));
            if (Zotero.Prefs.get("layout") !== "stacked" && pane.style.width !== w + "px") pane.style.width = w + "px";
        } catch (e) {}
    }

    _wvTabSplitPanesLeave(win: any) {
        const st = win._wvTSplitPanes;
        if (!st) return;
        const CP: any = win.ZoteroContextPane;
        const pane = win.document.getElementById("zotero-context-pane");
        const s = this._wvTabSplits(win).find((x) => x.id === st.id) || null;
        try {
            const own = s && s.panes && st.live ? (s.panes as any)[st.live] : null;
            if (own && CP && pane) {
                own.ctx = !CP.collapsed;
                const w = this._wvTabSplitPaneAttrW(win);
                if (w) own.ctxW = w;
            }
        } catch (e) {}
        delete win._wvTSplitPanes;
        try {
            if (pane) {
                const n = st.normal;
                if (n.widthAttr == null) pane.removeAttribute("width"); else pane.setAttribute("width", n.widthAttr);
                pane.style.width = n.styleW || "";
                if (CP && !!CP.collapsed !== !!n.collapsed) CP.collapsed = !!n.collapsed;
                for (const id of Object.keys(n.sp || {})) {
                    const sp = win.document.getElementById(id);
                    const v = n.sp[id];
                    if (sp && v != null && sp.getAttribute("state") !== v) sp.setAttribute("state", v);
                }
            }
        } catch (e) {}
        // Its readers back to Zotero's own sidebar state. A reader selected later
        // re-reads it anyway (reader.js _updateLayout); the one beside it would not.
        try {
            const Z: any = win.Zotero_Tabs;
            const zs = Z && Z.getSidebarState ? Z.getSidebarState("reader") : null;
            for (const id of s ? [s.left, s.right] : []) {
                const r: any = id && baseType(tabIn(win, id)) === "reader" && Zotero.Reader.getByTabID(id);
                if (!r || !zs || typeof r.toggleSidebar !== "function") continue;
                try { r.toggleSidebar(!!zs.open); if (zs.width) r.setSidebarWidth(zs.width); } catch (e) {}
            }
        } catch (e) {}
        this._wvTabSplitPinsLeave(win, st);
        // Its record keeps what it had; a split already gone (a restart's empty
        // list) leaves the records alone.
        if (s) this._wvTabSplitPersist();
    }

    /** The item pane's pinned section, per side (MJT 2026-11-11: "Same for pinning
     *  the item pane sections. In split view, they should behave independantly on
     *  each side, and separate from what they are in the normal tabs"). Where Zotero
     *  keeps it (itemDetails.js, contextPane.js): a library view's item-details saves
     *  it as the window's setting (`_savePinnedPane` -> Prefs.setForWindow
     *  'pinnedPane'; Zotero 10: the pref) and follows that setting (an observer bound
     *  at init), so two library sides shared one pin; the reader context pane keeps
     *  it in memory, carried from tab to tab (_selectItemContext). Each side keeps
     *  its own (`pin`, in its record): a library side's item-details neither saves
     *  nor follows the window's setting while it is a side (a wrap layer, its
     *  observer cut off, both given back on leaving); a reader side's pin is put back
     *  on Zotero's pane after every selection and on the other side's own pane. */
    _wvTabSplitPinsApply(win: any, s: WvTabSplit) {
        try {
            const st = win._wvTSplitPanes;
            if (!st || st.id !== s.id || !s.panes) return;
            const doc = win.document;
            const cp: any = doc.getElementById("zotero-context-pane-inner");
            for (const side of ["left", "right"] as const) {
                const id = side === "left" ? s.left : s.right;
                const own: any = (s.panes as any)[side];
                if (!id || !own) continue;
                const kind = baseType(tabIn(win, id));
                let det: any = null;
                if (kind === "library") {
                    det = this._wvTabSplitLibDet(win, id);
                    if (det) this._wvTabSplitPinWire(win, det, st);
                }
                else if (kind === "reader") {
                    if (st.live === side) det = cp && typeof cp._getItemContext === "function" ? cp._getItemContext(id) : null;
                    else { const g = doc.getElementById(GHOST_ID); det = g && g.getAttribute("data-tab-id") === id ? g.querySelector("item-details") : null; }
                }
                if (!det) continue;
                // A library side starts from the pin it shows; a reader side starts
                // with none (item 14) -- a record from before it, from what it shows.
                if (typeof own.pin !== "string") { own.pin = det.pinnedPane || ""; continue; }
                if ((det.pinnedPane || "") !== own.pin) { try { det.pinnedPane = own.pin; } catch (e) {} }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPinsApply err: " + e); }
    }

    /** A library side's item-details. */
    _wvTabSplitLibDet(win: any, id: string): any {
        try {
            const card = win.document.getElementById(id);
            const view = card && (card.querySelector("library-view") || card);
            const ip = view && view.querySelector("#zotero-item-pane, [id^='zotero-item-pane-tab-']");
            return ip ? ip.querySelector("item-details") : null;
        } catch (e) { return null; }
    }

    /** The split side `det` belongs to, while its split's panes are applied. */
    _wvTabSplitPinSide(win: any, det: any): { s: WvTabSplit; side: "left" | "right" } | null {
        try {
            const st = win._wvTSplitPanes;
            if (!st) return null;
            const s = this._wvTabSplits(win).find((x) => x.id === st.id);
            if (!s) return null;
            for (const side of ["left", "right"] as const) {
                const id = side === "left" ? s.left : s.right;
                const card = id ? win.document.getElementById(id) : null;
                if (card && card.contains(det)) return { s, side };
            }
        } catch (e) {}
        return null;
    }

    /** A library side's item-details keeps its own pin: it neither saves it as the
     *  window's setting nor follows that setting while it is a side. */
    _wvTabSplitPinWire(win: any, det: any, st: any) {
        try {
            if (!st.libDets) st.libDets = [];
            if (st.libDets.some((x: any) => x.det === det)) return;
            const rec: any = { det, pin: det.pinnedPane || "", obs: null };
            // Its observer of the window's setting is bound at init (itemDetails.js):
            // cut off, given back on leaving (src-ts.md, observers bound at init).
            if (typeof det._unobservePinnedPane === "function") { try { det._unobservePinnedPane(); } catch (e) {} rec.obs = "window"; }
            else if (det._prefsObserverID != null && !det._wvPinOwn) { try { Zotero.Prefs.unregisterObserver(det._prefsObserverID); } catch (e) {} det._prefsObserverID = null; rec.obs = "pref"; }
            st.libDets.push(rec);
            const tag = (this as any)._wvWireTag();
            wvWrap(det, "_savePinnedPane", "splitPin", tag, (orig: any) => function (this: any) {
                try {
                    const lp = live();
                    const at = lp && !lp._wvDestroyed ? lp._wvTabSplitPinSide(win, this) : null;
                    const own: any = at && at.s.panes && (at.s.panes as any)[at.side];
                    if (own) { own.pin = this.pinnedPane || ""; lp._wvTabSplitPersistSoon(); return; }
                } catch (e) {}
                return orig.apply(this, arguments as any);
            });
            wvWrap(det, "_restorePinnedPane", "splitPin", tag, (orig: any) => function (this: any) {
                try { const lp = live(); if (lp && !lp._wvDestroyed && lp._wvTabSplitPinSide(win, this)) return; } catch (e) {}
                return orig.apply(this, arguments as any);
            });
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPinWire err: " + e); }
    }

    /** Leaving: the library sides' item-details back to the pin they had and to
     *  Zotero's own saving and following; the context pane's normal pin pending
     *  for the next reader tab Zotero shows (it carries the split side's over). */
    _wvTabSplitPinsLeave(win: any, st: any) {
        try {
            for (const rec of (st && st.libDets) || []) {
                const det = rec.det;
                try { wvUnwrap(det, "_savePinnedPane", "splitPin"); wvUnwrap(det, "_restorePinnedPane", "splitPin"); } catch (e) {}
                try { if ((det.pinnedPane || "") !== rec.pin) det.pinnedPane = rec.pin; } catch (e) {}
                try {
                    if (rec.obs === "window" && typeof Zotero.Prefs.observeForWindow === "function") det._unobservePinnedPane = Zotero.Prefs.observeForWindow(win, "pinnedPane", det._restorePinnedPane.bind(det));
                    else if (rec.obs === "pref") det._prefsObserverID = Zotero.Prefs.registerObserver("pinnedPane", det._restorePinnedPane.bind(det));
                } catch (e) {}
            }
            if (st && st.normal && typeof st.normal.ctxPin === "string") {
                win._wvTSplitPinRestore = st.normal.ctxPin;
                // Left inside Zotero's select (item 20): applied after Zotero's own
                // handler has carried a pin over, by the context pane wrap.
                if (!win._wvTSplitSelectNow) this._wvTabSplitPinsAfterSelect(win);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPinsLeave err: " + e); }
    }

    /** After Zotero's context pane selected a tab's item: inside a split, each side's
     *  own pin; outside, once, the normal pin the split set aside. */
    _wvTabSplitPinsAfterSelect(win: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            const st = win._wvTSplitPanes;
            const s = st ? this._wvTabSplits(win).find((x) => x.id === st.id) : null;
            if (s) { this._wvTabSplitPinsApply(win, s); return; }
            if (typeof win._wvTSplitPinRestore !== "string" || !Z) return;
            const t = tabIn(win, Z.selectedID);
            if (!t || baseType(t) !== "reader") return;
            const cp: any = win.document.getElementById("zotero-context-pane-inner");
            const det = cp && typeof cp._getItemContext === "function" ? cp._getItemContext(Z.selectedID) : null;
            if (!det) return;
            const pin = win._wvTSplitPinRestore;
            delete win._wvTSplitPinRestore;
            if ((det.pinnedPane || "") !== pin) det.pinnedPane = pin;
        } catch (e) {}
    }

    /** A pin set or cleared in Zotero's pane (sidenav menu, a scroll to the top): the
     *  live side's. */
    _wvTabSplitPinCapture(win: any, recs: any[]) {
        const st = win._wvTSplitPanes;
        if (!st || !st.live || win._wvTSplitSelecting) return;
        const s = this._wvTabSplits(win).find((x) => x.id === st.id);
        if (!s || !s.panes) return;
        if (this._wvTabSplitLiveSide(win, s) !== st.live) return;
        const id = st.live === "left" ? s.left : s.right;
        for (const r of recs || []) {
            const el = r && r.target;
            if (!el || el.getAttribute("data-tab-id") !== id) continue;
            const own: any = (s.panes as any)[st.live];
            if (own) { own.pin = el.getAttribute("pinnedPane") || ""; this._wvTabSplitPersistSoon(); }
        }
    }

    // ---- Each library side its own panes (item 15) --------------------------------
    // MJT 2026-11-12, on "Zotero's library views share one set of pane widths":
    // "Allow different". Where Zotero keeps them (libraryView.js, zoteroPane.js): each
    // library view's panes in its own `zotero-persist` attributes (the collections
    // pane's width, the tag selector's height and open state, the item pane's width
    // and height, the splitters' open state), ONE set for every library view in the
    // pane.persist pref, keyed by base id: a library tab puts it on its view when
    // shown (adoptSharedState -> unserializePersist(view)) and writes its own into it
    // when left (flushSharedState -> serializePersist(view)); a window's close saves
    // the active view's. Nothing else copies sizes between views. A library side of a
    // split that keeps its own panes holds its own in its view: the shared set is
    // neither put on it nor written from it, and a normal tab's panes come back when
    // it is one again. Weavero's per-window sizes (window-state.ts) skip it too.

    /** A library tab's library view: its library-view on a Zotero with its own
     *  windows, else (an older Zotero) the one library pane, the tab's deck child. */
    _wvTabSplitLibRoot(win: any, tabID: string): any {
        try {
            const card = tabID ? win.document.getElementById(tabID) : null;
            if (!card) return null;
            return card.querySelector("library-view") || (card.querySelector("#zotero-collections-pane") ? card : null);
        } catch (e) { return null; }
    }

    /** What a library view persists of its panes, by base id; the layout's `orient`
     *  aside (Zotero's one layout setting). A width or height with its inline style:
     *  Zotero's own restore writes both (unserializePersist). */
    _wvTabSplitLibRead(root: any): WvTabSplitLib {
        const out: WvTabSplitLib = {};
        try {
            for (const el of Array.from(root.querySelectorAll("[zotero-persist]")) as any[]) {
                if (!el.id) continue;
                const attrs = String(el.getAttribute("zotero-persist") || "").split(/[\s,]+/).filter((a) => a && a !== "orient");
                if (!attrs.length) continue;
                const rec: Record<string, string | null> = {};
                for (const a of attrs) {
                    rec[a] = el.hasAttribute(a) ? el.getAttribute(a) : null;
                    if (a === "width" || a === "height") rec["style." + a] = el.style[a] || "";
                }
                out[typeof root.getBaseID === "function" ? root.getBaseID(el.id) : el.id] = rec;
            }
        } catch (e) {}
        return out;
    }

    /** `data` back on a library view's panes, in the view's order: the attributes
     *  first (a splitter's state opens or closes its pane, which sizes it), then the
     *  inline sizes. */
    _wvTabSplitLibApply(root: any, data: WvTabSplitLib) {
        try {
            for (const el of Array.from(root.querySelectorAll("[zotero-persist]")) as any[]) {
                if (!el.id) continue;
                const rec = data[typeof root.getBaseID === "function" ? root.getBaseID(el.id) : el.id];
                if (!rec) continue;
                for (const a of Object.keys(rec)) {
                    if (a.startsWith("style.")) continue;
                    const v = rec[a];
                    if (v == null) { if (el.hasAttribute(a)) el.removeAttribute(a); }
                    else if (el.getAttribute(a) !== String(v)) el.setAttribute(a, String(v));
                }
                for (const a of Object.keys(rec)) {
                    if (!a.startsWith("style.")) continue;
                    const prop = a.slice(6), v = rec[a] || "";
                    if (el.style[prop] !== v) el.style[prop] = v;
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitLibApply err: " + e); }
    }

    /** The panes a normal tab shows, set aside for each library tab whose view holds
     *  a split side's own (tab id -> its panes as a normal tab). */
    _wvTabSplitLibMap(win: any): Map<string, WvTabSplitLib> {
        if (!(win._wvTSplitLibNormal instanceof Map)) win._wvTSplitLibNormal = new Map();
        return win._wvTSplitLibNormal;
    }

    /** The normal panes set aside for library view `root` while it holds a split
     *  side's own, else null. Without `root`: the window's (an older Zotero's one
     *  library pane). Read by window-state.ts. */
    _wvTabSplitLibOwned(win: any, root?: any): WvTabSplitLib | null {
        try {
            const m = win && win._wvTSplitLibNormal;
            if (!(m instanceof Map) || !m.size) return null;
            for (const [id, snap] of m) if (!root || this._wvTabSplitLibRoot(win, id) === root) return snap;
        } catch (e) {}
        return null;
    }

    /** A split's library sides take their own panes, once per stint as a side: what
     *  the view shows as a normal tab set aside (a view not the window's active one
     *  first takes Zotero's shared panes, as when its tab is shown), then the side's
     *  own from its record, else what it shows ("a library side still starts from
     *  what it shows"). */
    _wvTabSplitLibForm(win: any, s: WvTabSplit) {
        try {
            if (!s.panes) return;
            const map = this._wvTabSplitLibMap(win);
            const ZP: any = win.ZoteroPane;
            for (const side of ["left", "right"] as const) {
                const id = side === "left" ? s.left : s.right;
                const own = s.panes[side];
                if (!id || !own || map.has(id) || baseType(tabIn(win, id)) !== "library") continue;
                const root = this._wvTabSplitLibRoot(win, id);
                if (!root) continue;
                if (root.localName === "library-view" && ZP && ZP.libraryView !== root && typeof ZP.unserializePersist === "function") {
                    try { ZP.unserializePersist(root); } catch (e) {}
                }
                map.set(id, this._wvTabSplitLibRead(root));
                if (own.lib && typeof own.lib === "object") this._wvTabSplitLibApply(root, own.lib);
                else own.lib = this._wvTabSplitLibRead(root);
                this._wvTabSplitLibWatch(win, id, root);
            }
            if (!map.size) delete win._wvTSplitLibNormal;
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitLibForm err: " + e); }
    }

    /** A side's pane resized, opened or closed: into its record soon (the quit
     *  writes none). `root` null: no longer watched. */
    _wvTabSplitLibWatch(win: any, id: string, root: any) {
        try {
            const mos: Map<string, any> = win._wvTSplitLibMOs instanceof Map ? win._wvTSplitLibMOs : (win._wvTSplitLibMOs = new Map());
            const old = mos.get(id);
            if (old) { try { old.disconnect(); } catch (e) {} mos.delete(id); }
            if (root && typeof win.MutationObserver === "function") {
                const mo = new win.MutationObserver(() => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabSplitPersistSoon(); });
                for (const el of Array.from(root.querySelectorAll("[zotero-persist]")) as any[]) {
                    mo.observe(el, { attributes: true, attributeFilter: ["width", "height", "state", "collapsed", "style"] });
                }
                mos.set(id, mo);
            }
            if (!mos.size) delete win._wvTSplitLibMOs;
        } catch (e) {}
    }

    /** Library tabs no longer a side of a split that keeps its own panes (separated,
     *  closed, the split gone or off; `all`: a disable): the side's own kept in the
     *  split still there, then the panes the tab showed as a normal one and Zotero's
     *  shared ones over them (as when its tab is shown). */
    _wvTabSplitLibReconcile(win: any, all: boolean) {
        try {
            const map = win && win._wvTSplitLibNormal;
            if (!(map instanceof Map) || !map.size) return;
            const on = !all && this._wvTabSplitOn();
            const ZP: any = win.ZoteroPane;
            for (const [id, snap] of Array.from(map.entries())) {
                const s = this._wvTabSplitOf(win, id);
                if (on && s && !s.picker && this._wvTabSplitManaged(win, s)) continue;
                const root = this._wvTabSplitLibRoot(win, id);
                const own = s && s.panes ? (s.panes as any)[id === s.left ? "left" : "right"] : null;
                if (own && root) own.lib = this._wvTabSplitLibRead(root);
                map.delete(id);
                this._wvTabSplitLibWatch(win, id, null);
                if (!root) continue;
                this._wvTabSplitLibApply(root, snap);
                if (root.localName === "library-view" && ZP && typeof ZP.unserializePersist === "function") {
                    try { ZP.unserializePersist(root); } catch (e) {}
                }
            }
            if (!map.size) delete win._wvTSplitLibNormal;
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitLibReconcile err: " + e); }
    }

    /** After Zotero saved its panes (serializePersist, wrapped): a library view
     *  holding a split side's own wrote them as everyone's -- what Zotero had saved
     *  before goes back (a Zotero with its own windows: the view saved, `view` or the
     *  active one); an older Zotero saves its one library pane at a window's close --
     *  the normal panes set aside go there. */
    _wvTabSplitPersistNormalLib(win: any, beforeText: string, view: any) {
        try {
            const map = win._wvTSplitLibNormal;
            if (!(map instanceof Map) || !map.size) return;
            const saved: any = JSON.parse(Zotero.Prefs.get("pane.persist") || "{}");
            const before: any = JSON.parse(beforeText || "{}");
            const ZP: any = win.ZoteroPane;
            const native = !!ZP && Array.isArray(ZP.libraryViews);
            const v = native ? (view !== undefined ? view : ZP.libraryView) : null;
            let changed = false;
            for (const [id, snap] of map) {
                const root = this._wvTabSplitLibRoot(win, id);
                if (!root) continue;
                if (native) {
                    if (v !== root) continue;
                    for (const key of Object.keys(snap)) {
                        const was = before[key];
                        if (was === undefined) { if (key in saved) { delete saved[key]; changed = true; } }
                        else if (JSON.stringify(saved[key]) !== JSON.stringify(was)) { saved[key] = was; changed = true; }
                    }
                }
                else {
                    for (const key of Object.keys(snap)) {
                        const cur: any = Object.assign({}, saved[key] || {});
                        for (const a of Object.keys(snap[key])) {
                            if (a.startsWith("style.")) continue;
                            const x = snap[key][a];
                            if (x == null) delete cur[a]; else cur[a] = x;
                        }
                        if (JSON.stringify(cur) === JSON.stringify(saved[key] || {})) continue;
                        if (Object.keys(cur).length) saved[key] = cur; else delete saved[key];
                        changed = true;
                    }
                }
            }
            if (changed) Zotero.Prefs.set("pane.persist", JSON.stringify(saved));
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPersistNormalLib err: " + e); }
    }

    /** Each reader side its own sidebar. */
    _wvTabSplitSidebarsApply(win: any, s: WvTabSplit) {
        const p = s.panes;
        if (!p) return;
        for (const side of ["left", "right"] as const) {
            const id = side === "left" ? s.left : s.right;
            const own = (p as any)[side];
            const r: any = id && own && Zotero.Reader.getByTabID(id);
            if (!r || typeof r.toggleSidebar !== "function") continue;
            try { r.toggleSidebar(!!own.sb); if (own.sbW) r.setSidebarWidth(own.sbW); } catch (e) {}
        }
        void win;
    }

    /** Zotero_Tabs.updateSidebarLayout while a split that keeps its own panes is on
     *  screen and a reader side is selected: that side's own sidebar (opened,
     *  closed, resized by its reader -- a press in a side selects it first), never
     *  the other reader's (reader.js _updateLayout reads it for the selected reader
     *  only, so a side switch re-lays out neither); nothing reaches Zotero's
     *  sidebarState pref. Returns what Zotero's would; undefined when not its call. */
    _wvTabSplitSidebarRoute(win: any, s: WvTabSplit, arg: any): any {
        const Z: any = win.Zotero_Tabs;
        const sel = Z && Z.selectedID;
        const side = sel === s.left ? "left" : (sel === s.right ? "right" : null);
        const own = side && s.panes && baseType(tabIn(win, sel)) === "reader" ? (s.panes as any)[side] : null;
        if (!own) return undefined;
        const width = arg && arg.width;
        let changed = false;
        if (typeof width === "number") { if (width > 0) own.sbW = width; own.sb = width > 0; changed = true; }
        else if (typeof width === "boolean") { own.sb = width; changed = true; }
        if (changed) {
            this._wvTabSplitRing("sidebar " + (own.sb ? "open" : "closed") + " on " + side + " (selected " + this._wvTabSplitSideName(win, sel) + ")");
            this._wvTabSplitPersistSoon();
        }
        let w = own.sbW;
        if (!w) { try { w = Z.getSidebarState("reader").width; } catch (e) {} }
        return { sidebarState: { open: !!own.sb, width: w || 240 } };
    }

    /** After Zotero serialized the window's panes (serializePersist, wrapped): while a
     *  reader|reader split shows its own context pane, what Zotero saved for it is
     *  put back to the normal state the split set aside. */
    _wvTabSplitPersistNormal(win: any) {
        const st = win._wvTSplitPanes;
        if (!st) return;
        let saved: any;
        try { saved = JSON.parse(Zotero.Prefs.get("pane.persist") || "{}"); } catch (e) { return; }
        if (!saved || typeof saved !== "object") return;
        const n = st.normal;
        // The splitters' own attribute, as Zotero would have saved it.
        for (const id of ["zotero-context-splitter", "zotero-context-splitter-stacked"]) {
            const v = n.sp && n.sp[id];
            if (v == null) { if (saved[id]) { delete saved[id].state; if (!Object.keys(saved[id]).length) delete saved[id]; } }
            else saved[id] = Object.assign({}, saved[id] || {}, { state: v });
        }
        if (n.widthAttr == null) {
            if (saved["zotero-context-pane"]) { delete saved["zotero-context-pane"].width; if (!Object.keys(saved["zotero-context-pane"]).length) delete saved["zotero-context-pane"]; }
        }
        else saved["zotero-context-pane"] = Object.assign({}, saved["zotero-context-pane"] || {}, { width: n.widthAttr });
        const json = JSON.stringify(saved);
        if (Zotero.Prefs.get("pane.persist") !== json) Zotero.Prefs.set("pane.persist", json);
    }

    /** The pane handle's drag: Zotero's own width, as its splitter writes it (the
     *  persisted `width` attribute, then ZoteroContextPane.update draws it). */
    _wvTabSplitPaneDragStart(win: any, h: any, e: any) {
        try {
            if (e.button !== 0) return;
            e.preventDefault();
            const doc = win.document;
            const pane = doc.getElementById("zotero-context-pane");
            const deck = doc.getElementById("tabs-deck");
            const rtl = win.getComputedStyle(deck).direction === "rtl";
            const x0 = e.screenX;
            const W0 = this._wvTabSplitPaneWidth(win);
            try { h.setPointerCapture(e.pointerId); } catch (er) {}
            const move = (ev: any) => {
                const lp = live();
                if (!lp) return;
                const dx = (ev.screenX - x0) * (rtl ? -1 : 1);
                const w = Math.round(Math.max(CTX_PANE_MIN, W0 - dx));
                pane.setAttribute("width", String(w));
                pane.style.width = w + "px";
                lp._wvTabSplitPlaceLayer(win);
            };
            const up = () => {
                h.removeEventListener("pointermove", move);
                h.removeEventListener("pointerup", up);
                h.removeEventListener("lostpointercapture", up);
                try { win.ZoteroContextPane.update(); } catch (er) {}
                const lp = live();
                // Laid out, the width is the live side's own (_wvTabSplitPanesCapture);
                // into its record.
                if (lp) { lp._wvTabSplitPlaceLayer(win); lp._wvTabSplitPersistSoon(); }
            };
            h.addEventListener("pointermove", move);
            h.addEventListener("pointerup", up);
            h.addEventListener("lostpointercapture", up);
        } catch (er) {}
    }

    _wvTabSplitDragStart(win: any, s: WvTabSplit, sp: any, e: any) {
        try {
            if (e.button !== 0) return;
            e.preventDefault();
            const doc = win.document;
            const deck = doc.getElementById("tabs-deck");
            const rtl = win.getComputedStyle(deck).direction === "rtl";
            const x0 = e.screenX;
            const W = this._wvTabSplitTotal(win);
            // From the ratio as drawn: a ratio held off a minimum would otherwise
            // need a long pull before the splitter moved at all.
            const r0 = this._wvTabSplitDrawnRatio(win, s, W);
            sp.setAttribute("data-dragging", "");
            try { sp.setPointerCapture(e.pointerId); } catch (er) {}
            const move = (ev: any) => {
                const lp = live();
                if (!lp) return;
                const dx = (ev.screenX - x0) * (rtl ? -1 : 1);
                s.ratio = lp._wvTabSplitDrawnRatio(win, s, W, r0 + dx / W);
                lp._wvTabSplitApplyRatio(win, s);
                lp._wvTabSplitPlaceLayer(win);
            };
            const up = () => {
                sp.removeEventListener("pointermove", move);
                sp.removeEventListener("pointerup", up);
                sp.removeEventListener("lostpointercapture", up);
                sp.removeAttribute("data-dragging");
                const lp = live();
                if (lp) { lp._wvTabSplitPersist(); lp._wvTabSplitPlaceLayer(win); }
            };
            sp.addEventListener("pointermove", move);
            sp.addEventListener("pointerup", up);
            sp.addEventListener("lostpointercapture", up);
        } catch (er) {}
    }

    /** Arrow keys on the focused splitter move it 5px (Firefox's splitter). */
    _wvTabSplitKey(win: any, s: WvTabSplit, e: any) {
        try {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            e.stopPropagation();
            const deck = win.document.getElementById("tabs-deck");
            const rtl = win.getComputedStyle(deck).direction === "rtl";
            const dir = ((e.key === "ArrowRight") !== rtl) ? 1 : -1;
            const W = this._wvTabSplitTotal(win);
            const cur = this._wvTabSplitDrawnRatio(win, s, W);
            s.ratio = this._wvTabSplitDrawnRatio(win, s, W, cur + dir * KEY_STEP_PX / W);
            this._wvTabSplitApplyRatio(win, s);
            this._wvTabSplitPlaceLayer(win);
            this._wvTabSplitPersist();
        } catch (er) {}
    }

    /** A tab's icon in the footer or the picker: the tab bar's own icon class. */
    _wvTabSplitIcon(win: any, t: any, el: any) {
        try {
            const node = win.document.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"] .tab-icon');
            if (node) {
                el.className += " " + node.className;
                const st = win.getComputedStyle(node);
                el.style.backgroundImage = st.backgroundImage;
                el.style.backgroundSize = "16px";
                el.style.backgroundRepeat = "no-repeat";
                el.style.setProperty("-moz-context-properties", "fill, fill-opacity");
                el.style.fill = "currentColor";
            }
        } catch (e) {}
    }

    _wvTabSplitFooterMenu(win: any, s: WvTabSplit, anchor: any) {
        try {
            const doc = win.document;
            let pop: any = doc.getElementById("wv-tsplit-menu");
            if (pop) pop.remove();
            pop = doc.createXULElement("menupopup");
            pop.id = "wv-tsplit-menu";
            const add = (l10nID: string, fn: () => void) => {
                const mi = doc.createXULElement("menuitem");
                wvL10n(mi, l10nID);
                mi.addEventListener("command", () => { const lp = live(); if (lp) try { fn(); } catch (e) {} });
                pop.appendChild(mi);
            };
            add("weavero-menu-split-separate-tabs", () => live()._wvTabSplitSeparate(win, s.id));
            add("weavero-menu-split-reverse", () => live()._wvTabSplitReverse(win, s.id));
            add("weavero-menu-split-close-both", () => live()._wvTabSplitCloseBoth(win, s.id));
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.addEventListener("popuphidden", () => { try { pop.remove(); } catch (e) {} }, { once: true });
            pop.openPopup(anchor, "after_end");
        } catch (e) { Zotero.debug("[Weavero] split footer menu err: " + e); }
    }

    /** Firefox's "Add Split View": the tab on one side, a list of this window's
     *  other tabs (and its library tab) on the other; a pick makes the split,
     *  Escape or the close button cancels. */
    _wvTabSplitAddPicker(win: any, tabID: any) {
        try {
            if (!this._wvTabSplitOn()) return;
            const Z: any = win.Zotero_Tabs;
            if (!tabIn(win, tabID)) return;
            const old = this._wvTabSplitOf(win, tabID);
            // Never a second split for a tab already in one (item 10).
            if (old && !old.picker) return;
            if (old) this._wvTabSplitRemove(win, old.id);
            const s: WvTabSplit = { id: "tsplit-pick-" + Date.now().toString(36), left: tabID, right: null, ratio: 0.5, picker: true };
            this._wvTabSplits(win).push(s);
            if (Z.selectedID !== tabID) Z.select(tabID);
            this._wvTabSplitSync(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitAddPicker err: " + e); }
    }

    _wvTabSplitFillPicker(win: any, s: WvTabSplit, pk: any) {
        const doc = win.document;
        const Z: any = win.Zotero_Tabs;
        const H = (tag: string, cls: string, parent: any) => wvHtmlEl(doc, tag, cls || undefined, undefined, parent);
        const cancel = () => { const lp = live(); if (lp) { lp._wvTabSplitRemove(win, s.id); lp._wvTabSplitSync(win); } };
        const close = H("button", "wv-tsplit-close", pk);
        close.textContent = "✕";
        close.setAttribute("title", "Cancel");
        close.addEventListener("click", cancel);
        H("h2", "", pk).textContent = "Add Split View";
        H("p", "", pk).textContent = "Choose a tab to show beside this one.";
        const input = H("input", "", pk);
        input.setAttribute("type", "search");
        input.setAttribute("placeholder", "Search open tabs");
        const list = H("div", "wv-tsplit-list", pk);
        const tabs = Z._tabs.filter((t: any) => t && t.id !== s.left && !this._wvTabSplitOf(win, t.id));
        const render = () => {
            list.textContent = "";
            const q = String(input.value || "").toLowerCase();
            for (const t of tabs) {
                const title = String(t.title || (wvIsLibraryTabID(t.id) ? "My Library" : ""));
                if (q && title.toLowerCase().indexOf(q) < 0) continue;
                const row = H("div", "wv-tsplit-row", list);
                row.setAttribute("tabindex", "0");
                row.setAttribute("data-tab-id", t.id);
                const ic = H("span", "wv-tsplit-icon", row);
                this._wvTabSplitIcon(win, t, ic);
                H("span", "", row).textContent = title;
                const pick = () => {
                    const lp = live();
                    if (!lp) return;
                    lp._wvTabSplitRemove(win, s.id);
                    lp._wvTabSplitCreate(win, s.left, t.id, { select: "right", ratio: s.ratio });
                };
                row.addEventListener("click", pick);
                row.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
            }
            if (!list.firstChild) H("p", "", list).textContent = "No other open tab.";
        };
        input.addEventListener("input", render);
        pk.addEventListener("keydown", (e: any) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } });
        render();
        win.setTimeout(() => { try { input.focus(); } catch (e) {} }, 0);
    }

    /** The context pane beside a split (MJT's pick "Right edge, follows the
     *  PDF"): when the selected side has no context pane of its own (the library)
     *  and the other side does (a reader, a note), Zotero has just collapsed the
     *  pane; show it again with the other side's item. When both sides have one,
     *  Zotero's own (the selected side's) stands. */
    async _wvTabSplitContextPane(win: any) {
        try {
            const doc = win.document;
            const Z: any = win.Zotero_Tabs;
            const s = this._wvTabSplitOf(win, Z.selectedID);
            if (!s || s.picker || !s.right) return;
            const sel = tabIn(win, Z.selectedID);
            const otherID = s.left === Z.selectedID ? s.right : s.left;
            const other = tabIn(win, otherID);
            if (!sel || !other) return;
            const hasPane = (t: any) => { try { return !!Z.hasContextPane(baseType(t)); } catch (e) { return false; } };
            if (hasPane(sel) || !hasPane(other)) return;
            const cp: any = doc.getElementById("zotero-context-pane-inner");
            const pane = doc.getElementById("zotero-context-pane");
            const CP: any = win.ZoteroContextPane;
            if (!cp || !pane || !CP) return;
            const splitter = CP.splitter || doc.getElementById("zotero-context-splitter");
            if (splitter) splitter.removeAttribute("hidden");
            const collapsed = splitter && splitter.getAttribute("state") === "collapsed";
            if (collapsed) pane.setAttribute("collapsed", "true"); else pane.removeAttribute("collapsed");
            if (cp._sidenav) cp._sidenav.hidden = false;
            try {
                if (typeof Z.hasNoteContext === "function" && Z.hasNoteContext(baseType(other))) { if (typeof cp._setupNotesContext === "function") await cp._setupNotesContext(otherID); }
                else if (typeof cp._disableNotesContext === "function") cp._disableNotesContext();
            } catch (e) {}
            if (typeof cp._addItemContext === "function" && other.data && other.data.itemID) await cp._addItemContext(otherID, other.data.itemID, other.type);
            if (typeof cp._selectItemContext === "function") cp._selectItemContext(otherID);
            try { CP.update(); } catch (e) {}
            try { Z.updateSidebarLayout(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitContextPane err: " + e); }
    }

    /** The tab bar draws a split's two tabs as one unit (Firefox's split-view
     *  wrapper: the CSS above, the container in _wvTabSplitPlacePills) and keeps them
     *  side by side. Called on every tab-bar mutation (React redraws the tabs). */
    _wvTabSplitMarkStrip(win: any) {
        try {
            const doc = win.document;
            this._wvTabSplitKeepTogether(win);
            const want = new Map<string, string>();
            for (const s of this._wvTabSplits(win)) {
                if (s.picker || !s.right) continue;
                want.set(s.left, "left"); want.set(s.right, "right");
            }
            for (const el of doc.querySelectorAll("#tab-bar-container .tab[data-id], #wv-pinned-mirrors [data-wv-tsplit]")) {
                const id = el.getAttribute("data-id");
                const v = want.get(id);
                if (v) { if (el.getAttribute("data-wv-tsplit") !== v) el.setAttribute("data-wv-tsplit", v); }
                else if (el.hasAttribute("data-wv-tsplit")) el.removeAttribute("data-wv-tsplit");
            }
            this._wvTabSplitPlacePills(win);
        } catch (e) {}
    }

    /** A split's tabs stay side by side, left then right (Firefox moves the wrapper
     *  as one): when one of them moved -- a drag, Zotero_Tabs.move, a group change --
     *  the other follows it, joining its tab group. Never during a tab drag (the
     *  sliding gap moves the real tab only at its drop). */
    _wvTabSplitKeepTogether(win: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            if (!Z || !Z._tabs || win._wvDragGeom || win._wvTSplitKeeping) return;
            win._wvTSplitKeeping = true;
            try {
                for (const s of this._wvTabSplits(win)) {
                    if (s.picker || !s.right) continue;
                    // Where each side stands among the OTHER tabs: the side whose
                    // place changed is the one that moved (an index alone also
                    // changes for the side the mover passed over).
                    const before = (id: string) => {
                        let n = 0;
                        for (const t of Z._tabs) { if (!t) continue; if (t.id === id) return n; if (t.id !== s.left && t.id !== s.right) n++; }
                        return -1;
                    };
                    const li = Z._tabs.findIndex((t: any) => t && t.id === s.left);
                    const ri = Z._tabs.findIndex((t: any) => t && t.id === s.right);
                    if (li < 0 || ri < 0) continue;
                    const prev: any = (s as any)._wvAt;
                    if (ri !== li + 1) {
                        const rightMoved = !!prev && prev.l === s.left && before(s.left) === prev.lb && before(s.right) !== prev.rb;
                        try {
                            if (rightMoved) Z.move(s.left, ri);
                            else Z.move(s.right, li + 1);
                        } catch (e) {}
                        this._wvTabSplitJoinGroup(win, s, rightMoved ? "right" : "left");
                    }
                    (s as any)._wvAt = { l: s.left, lb: before(s.left), rb: before(s.right) };
                }
            }
            finally { delete win._wvTSplitKeeping; }
        } catch (e) {}
    }

    /** The other side joins the tab group of side `lead` (or leaves its own). */
    _wvTabSplitJoinGroup(win: any, s: WvTabSplit, lead: "left" | "right") {
        try {
            const P: any = this;
            const A = tabIn(win, lead === "left" ? s.left : s.right), B = tabIn(win, lead === "left" ? s.right : s.left);
            if (!A || !B || !P._wvTabGroupStamp) return;
            const ag = P._wvTabGroupStamp(A), bg = P._wvTabGroupStamp(B);
            if (ag === bg) return;
            if (ag && P._wvTabGroupStampJoin) P._wvTabGroupStampJoin(B, ag);
            else if (bg && P._wvTabGroupStampLeave) P._wvTabGroupStampLeave(B, bg);
        } catch (e) {}
    }

    /** One container per split in the strip, drawn behind its two tabs (CSS above):
     *  2px around them, filled while it holds the selected tab, a line between them
     *  while it does not. Placed from the tabs' boxes, again on every strip mutation,
     *  scroll and resize; hidden while a tab is dragged (the tabs move under it). */
    _wvTabSplitPlacePills(win: any) {
        try {
            const doc = win.document;
            const Z: any = win.Zotero_Tabs;
            const wrap = doc.querySelector("#tab-bar-container .tabs-wrapper");
            const tabsEl = wrap && wrap.querySelector(":scope > .tabs");
            let host: any = doc.getElementById("wv-tsplit-pills");
            const splits = this._wvTabSplits(win).filter((s) => !s.picker && s.right);
            if (!wrap || !tabsEl || !splits.length) {
                // No pair in the strip: its listeners go too (the reload spec holds every
                // keyed listener to be wired again, and a new instance wires these only
                // for a strip that holds a pair).
                if (host) host.remove();
                const bar = doc.getElementById("tab-bar-container");
                try { if (tabsEl) wvUnlisten(tabsEl, "tsplit:pills:scroll"); } catch (e) {}
                try { if (bar) { wvUnlisten(bar, "tsplit:pills:dragstart"); wvUnlisten(bar, "tsplit:pills:dragend"); } } catch (e) {}
                if (win._wvTSplitPillRO) { try { win._wvTSplitPillRO.disconnect(); } catch (e) {} delete win._wvTSplitPillRO; }
                return;
            }
            const tag = (this as any)._wvWireTag();
            if (host && (host.parentNode !== wrap || host.getAttribute("data-wv-tag") !== tag)) { host.remove(); host = null; }
            if (!host) {
                host = wvHtmlEl(doc, "div");
                host.id = "wv-tsplit-pills";
                host.setAttribute("data-wv-tag", tag);
                wrap.insertBefore(host, wrap.firstChild);
            }
            else if (wrap.firstChild !== host) wrap.insertBefore(host, wrap.firstChild);
            // Weavero's Firefox look (the pill-shaped tabs) or Zotero's own.
            const nova = !!doc.getElementById("wv-selected-tab-ring");
            if ((host.getAttribute("data-look") === "nova") !== nova) { if (nova) host.setAttribute("data-look", "nova"); else host.removeAttribute("data-look"); }
            const on = wvListener(tag);
            on(tabsEl, "tsplit:pills:scroll", "scroll", () => { const lp = live(); if (lp) lp._wvTabSplitPlacePills(win); }, { passive: true });
            on(doc.getElementById("tab-bar-container"), "tsplit:pills:dragstart", "dragstart", () => { const h = doc.getElementById("wv-tsplit-pills"); if (h) h.hidden = true; }, true);
            on(doc.getElementById("tab-bar-container"), "tsplit:pills:dragend", "dragend", () => {
                const h = doc.getElementById("wv-tsplit-pills"); if (h) h.hidden = false;
                win.setTimeout(() => { const lp = live(); if (lp) lp._wvTabSplitMarkStrip(win); }, 0);
            }, true);
            if (!win._wvTSplitPillRO && typeof win.ResizeObserver === "function") {
                const ro = new win.ResizeObserver(() => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabSplitPlacePills(win); });
                ro.observe(tabsEl);
                win._wvTSplitPillRO = ro;
            }
            // .tabs-wrapper is 0px tall (its .tabs is positioned): the host takes
            // the strip's own height, or its clip hides every pill.
            const th = Math.round(tabsEl.getBoundingClientRect().height) + "px";
            if (host.style.height !== th) host.style.height = th;
            const hr = host.getBoundingClientRect();
            const seen = new Set<string>();
            for (const s of splits) {
                const lt = tabsEl.querySelector(':scope > .tab[data-id="' + s.left + '"]');
                const rt = tabsEl.querySelector(':scope > .tab[data-id="' + s.right + '"]');
                const lr = lt && lt.getBoundingClientRect(), rr = rt && rt.getBoundingClientRect();
                if (!lr || !rr || !lr.width || !rr.width) continue;
                seen.add(s.id);
                let p = host.querySelector('.wv-tsplit-pill[data-split="' + s.id + '"]');
                if (!p) { p = wvHtmlEl(doc, "div", "wv-tsplit-pill", undefined, host); p.setAttribute("data-split", s.id); }
                const x0 = Math.min(lr.left, rr.left) - PILL_PAD, x1 = Math.max(lr.right, rr.right) + PILL_PAD;
                const y0 = Math.min(lr.top, rr.top) - PILL_PAD, y1 = Math.max(lr.bottom, rr.bottom) + PILL_PAD;
                const px = (n: number) => (Math.round(n * 100) / 100) + "px";
                p.style.left = px(x0 - hr.left);
                p.style.top = px(y0 - hr.top);
                p.style.width = px(x1 - x0);
                p.style.height = px(y1 - y0);
                // The line between the two tabs, mid-gap.
                const mid = (Math.min(lr.right, rr.right) + Math.max(lr.left, rr.left)) / 2 - x0;
                p.style.setProperty("--wv-tsplit-pill-mid", px(mid - 0.5));
                const active = Z && (Z.selectedID === s.left || Z.selectedID === s.right);
                if (active) { if (!p.hasAttribute("data-active")) p.setAttribute("data-active", ""); }
                else if (p.hasAttribute("data-active")) p.removeAttribute("data-active");
            }
            for (const p of Array.from(host.querySelectorAll(".wv-tsplit-pill")) as any[]) {
                if (!seen.has(p.getAttribute("data-split"))) p.remove();
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitPlacePills err: " + e); }
    }

    /** Firefox's tooltip line for a split tab: "{label}, Split view left|right". */
    _wvTabSplitTooltip(win: any, tabID: any, label: string): string {
        const s = this._wvTabSplitOf(win, tabID);
        if (!s || s.picker || !s.right) return label;
        return label + ", Split view " + (s.left === tabID ? "left" : "right");
    }

    // ---- Ways in ---------------------------------------------------------

    /** Items list: open `item` (a PDF, EPUB or snapshot attachment, the best one
     *  of a regular item, or a note) in a tab beside the library tab on screen
     *  (Firefox's Open Link in Split View: the current tab left, the new one right
     *  and selected). The library tab already split: its other side is replaced
     *  -- browsing the list, each item can be put beside it in turn (Firefox
     *  hides the entry instead). */
    async _wvTabSplitOpenItem(win: any, item: any) {
        try {
            if (!this._wvTabSplitOn() || !item) return;
            const Z: any = win.Zotero_Tabs;
            const from = Z.selectedID;
            let tabID: any = null;
            if (item.isNote && item.isNote()) {
                await win.ZoteroPane.openNote(item.id, { openInWindow: false });
                const t = Z._tabs.find((x: any) => x && x.data && x.data.itemID === item.id && baseType(x) === "note");
                tabID = t && t.id;
            }
            else {
                const att = this._wvTabSplitUsableAttachment(item);
                if (!att) return;
                const r: any = await Zotero.Reader.open(att.id, null, { openInWindow: false, allowDuplicate: false });
                tabID = r && r.tabID;
            }
            if (!tabID || tabID === from || !tabIn(win, tabID)) return;
            this._wvTabSplitCreate(win, from, tabID, { select: "right" });
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitOpenItem err: " + e); }
    }

    /** The attachment a split opens for `item`, as Zotero's "Open PDF" picks it
     *  (locateMenu.js _getFirstUsableItem: the item itself or its first attachment
     *  with a reader type, not a linked URL), synchronously for the menu. */
    _wvTabSplitUsableAttachment(item: any): any {
        try {
            if (!item) return null;
            const ok = (a: any) => a && a.isAttachment && a.isAttachment() && a.attachmentReaderType
                && a.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL;
            if (ok(item)) return item;
            if (!item.isRegularItem || !item.isRegularItem()) return null;
            const best = item.getBestAttachmentState ? null : null;
            void best;
            for (const id of item.getAttachments()) {
                const a = Zotero.Items.get(id);
                if (ok(a)) return a;
            }
        } catch (e) {}
        return null;
    }

    /** The items list's entry: "Open PDF in Split View" (EPUB / Snapshot / Note),
     *  after Zotero's "Open … in New Window" (its l10n args say openIn "window"),
     *  for one selected item a tab can show. */
    _wvTabSplitItemsMenu(doc: any, menu: any, selected: any[], win: any) {
        const ID = "wv-itemmenu-split";
        try {
            const old = doc.getElementById(ID);
            if (old) old.remove();
            if (!this._wvTabSplitOn() || !win || !win.Zotero_Tabs) return;
            if (!selected || selected.length !== 1) return;
            // Not from a tab already in a split (item 10; Firefox hides it).
            const cur = this._wvTabSplitOf(win, win.Zotero_Tabs.selectedID);
            if (cur && !cur.picker) return;
            const it = selected[0];
            let kind: string | null = null;
            if (it.isNote && it.isNote()) kind = "note";
            else {
                const att = this._wvTabSplitUsableAttachment(it);
                const t = att && att.attachmentReaderType;
                kind = t === "pdf" || t === "epub" || t === "snapshot" ? t : null;
                if (att && Zotero.Prefs.get("fileHandler." + t)) kind = null;   // an external viewer
            }
            if (!kind) return;
            // Nor for an item whose tab is already a side.
            try {
                const att = kind === "note" ? it : this._wvTabSplitUsableAttachment(it);
                const open = att && win.Zotero_Tabs._tabs.find((t: any) => t && t.data && t.data.itemID === att.id);
                const os = open && this._wvTabSplitOf(win, open.id);
                if (os && !os.picker) return;
            } catch (e) {}
            const mi = doc.createXULElement("menuitem");
            mi.id = ID;
            wvL10n(mi, "weavero-menu-items-open-split", { type: kind });
            mi.addEventListener("command", () => { const lp = live(); if (lp) lp._wvTabSplitOpenItem(win, it); });
            const place = () => {
                try {
                    let after: any = null;
                    for (const x of menu.querySelectorAll(":scope > menuitem")) {
                        if (x.getAttribute("data-l10n-id") !== "item-menu-viewAttachment" || x.hidden) continue;
                        const args = x.getAttribute("data-l10n-args") || "";
                        if (/"openIn"\s*:\s*"window"/.test(args)) after = x;
                        else if (!after) after = x;
                    }
                    if (after) {
                        if (after.nextSibling !== mi) menu.insertBefore(mi, after.nextSibling);
                        // Its neighbour's icon, aligned with it (item 17, MJT
                        // 2026-11-12: "Add icons for Open in Split View"): Zotero's
                        // own class for the attachment type (locateMenu.js
                        // ViewItem.className: zotero-menuitem-attachments-pdf / -epub /
                        // -snapshot, zotero-menuitem-attach-note), set by
                        // _addViewOption only where the menu shows icons -- so none
                        // where its neighbours have none.
                        const cls = after.getAttribute("class");
                        if (cls) { if (mi.getAttribute("class") !== cls) mi.setAttribute("class", cls); }
                        else if (mi.hasAttribute("class")) mi.removeAttribute("class");
                    }
                    else if (!mi.parentNode) menu.insertBefore(mi, menu.firstChild);
                } catch (e) {}
            };
            place();
            // Zotero fills its Open entries asynchronously (locateMenu.js updateMenuItem).
            win.setTimeout(place, 0);
            win.setTimeout(place, 60);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitItemsMenu err: " + e); }
    }

    /** A zotero:// link a split can show: an attachment or note to open, or an
     *  item to select in the library. Not when it is the selected tab's own
     *  document (Zotero's reader has its own Split Vertically / Horizontally for
     *  that). */
    _wvTabSplitLinkOK(win: any, url: string): boolean {
        try {
            if (!this._wvTabSplitOn() || !win || !win.Zotero_Tabs) return false;
            const m = /^zotero:\/\/(open-pdf|open|select|note)\b/.exec(String(url || ""));
            if (!m) return false;
            const Z: any = win.Zotero_Tabs;
            // Not from a tab already in a split (item 10; Firefox hides it).
            const sp = this._wvTabSplitOf(win, Z.selectedID);
            if (sp && !sp.picker) return false;
            const cur = tabIn(win, Z.selectedID);
            if (cur && cur.data && cur.data.itemID && (m[1] === "open-pdf" || m[1] === "open")) {
                const it = Zotero.Items.get(cur.data.itemID);
                if (it && String(url).indexOf("/items/" + it.key) >= 0) return false;
            }
            return true;
        } catch (e) { return false; }
    }

    /** Open Link in Split View: the link's target in a tab (or the library
     *  selecting its item) beside the selected tab, which stays on the left; the
     *  target's tab is selected (Firefox, nsContextMenu.openLinkInSplitView). */
    async _wvTabSplitOpenLink(win: any, url: string) {
        try {
            if (!this._wvTabSplitLinkOK(win, url)) return;
            const Z: any = win.Zotero_Tabs;
            const from = Z.selectedID;
            await (this as any).handleZoteroURI(url);
            await new Promise((r) => win.setTimeout(r, 150));
            const to = Z.selectedID;
            if (!to || to === from) return;
            this._wvTabSplitCreate(win, from, to, { select: "right" });
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitOpenLink err: " + e); }
    }

    /** The tab menu's split entries (Firefox tab-context-menu.js): "Add Split
     *  View" on one tab, "Open in Split View" on two selected tabs, "Separate
     *  Split View" and "Reverse Tabs" on a split's tab. */
    _wvTabSplitRegisterMenus() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if (!(MM && typeof MM.registerMenu === "function")) return;
            this._wvTabSplitUnregisterMenus();
            const self = this;
            const winOf = (ctx: any) => ctx.menuElem && ctx.menuElem.ownerDocument && ctx.menuElem.ownerDocument.defaultView;
            const targets = (win: any, tabID: any): string[] => {
                try { const tg = (self as any)._wvTabMultiSelTargets && (self as any)._wvTabMultiSelTargets(win, tabID); if (tg && tg.length) return tg; } catch (e) {}
                return [tabID];
            };
            // The selection is read when the menu SHOWS and kept on the entry: by the
            // command it has gone back to the clicked tab alone (as Weavero's other
            // multi-tab entries, which take their targets at showing too; the
            // split-view spec caught it, 2026-11-10).
            // `l10nID`: the entry's weavero.ftl message, MenuManager's l10nID.
            // `key`: its place in the canonical tab-menu order (tabs.ts
            // _wvTabMenuOrder): the repositioner moves them up beside the group
            // entries, where Firefox keeps them (tab-context-menu.js MENU_SECTIONS
            // "priority-items"), out of MenuManager's place at the menu's end.
            const inSplit = (win: any, id: any) => { const s = self._wvTabSplitOf(win, id); return !!(s && s.right && !s.picker); };
            const entry = (key: string, l10nID: string, show: (win: any, tabID: any, tg: string[]) => boolean, run: (win: any, tabID: any, tg: string[]) => void) => ({
                menuType: "menuitem",
                l10nID,
                onShowing: (_ev: any, ctx: any) => {
                    try {
                        const win = winOf(ctx);
                        const tg = win && win.Zotero_Tabs ? targets(win, ctx.tabID) : [];
                        ctx.menuElem._wvTSplitTargets = tg;
                        const ok = !!(win && win.Zotero_Tabs && self._wvTabSplitOn() && show(win, ctx.tabID, tg));
                        ctx.setVisible(ok);
                        ctx.menuElem.setAttribute("data-wv-key", key);
                        // The words at once, from Weavero's own bundle: MenuManager
                        // only sets data-l10n-id and leaves the text to the
                        // document's Fluent, and the entry was seen shown BLANK
                        // 600 ms after the menu opened (two full runs of 2026-11-12/13,
                        // Zotero main and the companion run). wvL10n also links
                        // weavero.ftl again if the window lost it.
                        if (ok) wvL10n(ctx.menuElem, l10nID);
                    } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                },
                onCommand: (_ev: any, ctx: any) => {
                    try {
                        const win = winOf(ctx); const lp = live();
                        const tg = (ctx.menuElem && ctx.menuElem._wvTSplitTargets) || [ctx.tabID];
                        if (win && lp) run.call(lp, win, ctx.tabID, tg);
                    } catch (e) { Zotero.debug("[Weavero] split menu " + l10nID + " err: " + e); }
                },
            });
            const id = MM.registerMenu({
                menuID: "weavero-tab-split",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [
                    // Firefox (tab-context-menu.js, `hasSplitViewTab` over every
                    // targeted tab): Add / Open in Split View only when no targeted
                    // tab is in a split (item 10); Separate Split View when any is,
                    // separating every split among them (unsplitTabs, item 12);
                    // Reverse Tabs on one tab only (`this.multiselected` hides it).
                    entry("splitAdd", "weavero-menu-split-add", (win, tabID, tg) => tg.length === 1 && !inSplit(win, tabID),
                        function (this: any, win, tabID) { this._wvTabSplitAddPicker(win, tabID); }),
                    entry("splitOpen", "weavero-menu-split-open", (win, _tabID, tg) => tg.length === 2 && !tg.some((id) => inSplit(win, id)),
                        function (this: any, win, tabID, tg) {
                            // The two keep their order in the strip (item 16; Firefox
                            // moveTabsToSplitView puts the selected tab first instead)
                            // and the active tab stays active (Firefox keeps the
                            // selection); neither of them active: the tab right-clicked
                            // is selected, so the split shows.
                            const other = tg.find((x) => x !== tabID);
                            if (!other) return;
                            const cur = win.Zotero_Tabs && win.Zotero_Tabs.selectedID;
                            this._wvTabSplitCreate(win, tabID, other, { select: cur === tabID || cur === other ? "none" : "left" });
                        }),
                    entry("splitSeparate", "weavero-menu-split-separate", (win, _tabID, tg) => tg.some((id) => inSplit(win, id)),
                        function (this: any, win, _tabID, tg) {
                            const ids = new Set<string>();
                            for (const id of tg) { const s = this._wvTabSplitOf(win, id); if (s && s.right) ids.add(s.id); }
                            for (const sid of ids) this._wvTabSplitSeparate(win, sid);
                        }),
                    entry("splitReverse", "weavero-menu-split-reverse", (win, tabID, tg) => tg.length === 1 && inSplit(win, tabID),
                        function (this: any, win, tabID) { const s = this._wvTabSplitOf(win, tabID); if (s) this._wvTabSplitReverse(win, s.id); }),
                ],
            });
            if (id) (this as any)._wvTabSplitMenuID = id;
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitRegisterMenus err: " + e); }
    }

    _wvTabSplitUnregisterMenus() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if ((this as any)._wvTabSplitMenuID && MM && typeof MM.unregisterMenu === "function") MM.unregisterMenu((this as any)._wvTabSplitMenuID);
        } catch (e) {}
        (this as any)._wvTabSplitMenuID = null;
    }

    // ---- Restart ---------------------------------------------------------

    /** Splits of every main window, by restart-proof description, for the next
     *  start (MJT: "Yes, as Firefox"). Zotero's own restore drops Weavero's data on
     *  a reader tab, so the pairs live in a pref, keyed by what each side shows. */
    _wvTabSplitPersist() {
        try {
            const out: any[] = [];
            for (const w of wvMainWins()) {
                const Z: any = (w as any).Zotero_Tabs;
                const splits = this._wvTabSplits(w);
                if (!splits.length) continue;
                const fp = fingerprintOf(w);
                for (const s of splits) {
                    if (s.picker || !s.right) continue;
                    const l = descOf(tabIn(w, s.left)), r = descOf(tabIn(w, s.right));
                    if (!l || !r) continue;
                    const rec: any = { l, r, ratio: Math.round(s.ratio * 1000) / 1000, sel: Z && Z.selectedID === s.left ? "left" : (Z && Z.selectedID === s.right ? "right" : ""), w: fp };
                    const p = this._wvTabSplitPanesNow(w, s);
                    if (p) rec.p = p;
                    if (s.pins && s.pins.length) rec.pin = s.pins.map((x) => ({ side: x.side, index: x.index }));
                    out.push(rec);
                }
            }
            // Records still waiting for their window (one restored later, at a
            // start or a session switch) are kept until they are matched or time out.
            for (const p of this._wvTabSplitPending()) out.push(p);
            const json = JSON.stringify(out);
            if (Zotero.Prefs.get(PREF) !== json) Zotero.Prefs.set(PREF, json);
        } catch (e) {}
    }

    /** Record the splits again a moment after tabs open or close in a window that
     *  has one: a record carries its window's fingerprint, and one taken when the
     *  split was made no longer matches a window that gained many tabs since. Not
     *  while quitting: windows close then, and the record of the restart is the
     *  one already written. */
    _wvTabSplitPersistSoon() {
        try {
            const P: any = this;
            if (P._wvQuitting || P._wvDestroyed) return;
            if (!wvMainWins().some((w: any) => Array.isArray(w._wvTSplits) && w._wvTSplits.length)) return;
            const host: any = wvMainWins()[0];
            if (!host) return;
            if (P._wvTSplitPersistTimer) { try { host.clearTimeout(P._wvTSplitPersistTimer); } catch (e) {} }
            P._wvTSplitPersistTimer = host.setTimeout(() => {
                P._wvTSplitPersistTimer = null;
                const lp = live();
                if (lp && !lp._wvDestroyed && !lp._wvQuitting) lp._wvTabSplitPersist();
            }, 1500);
        } catch (e) {}
    }

    /** Recorded splits not re-formed yet: read from the pref once, at the first
     *  call (the start), and kept for 90 s -- windows come back one by one. A
     *  record a split ON SCREEN already answers is not waiting: a reload or an
     *  upgrade keeps each window's live splits, and the new instance took their
     *  own records for pending ones -- no free tab could re-form them, so every
     *  persist for 90 s wrote each split twice, and a restart then re-formed the
     *  copy too wherever a window held spare tabs of both sides (weavero-dev
     *  2026-11-11, l10n.5 -> l10n.6 and l10n.6 -> l10n.8). */
    _wvTabSplitPending(): any[] {
        const P: any = this;
        if (P._wvTSplitPending == null) {
            let recs: any[] = [];
            try { recs = JSON.parse(Zotero.Prefs.get(PREF) || "[]"); } catch (e) {}
            P._wvTSplitPending = this._wvTabSplitNotLive(Array.isArray(recs) ? recs : []);
            P._wvTSplitPendingUntil = Date.now() + 90000;
            // A side taken off the pins gets its pin back once its split cannot come
            // back: look again when the wait is over.
            if (P._wvTSplitPending.some((r: any) => Array.isArray(r && r.pin) && r.pin.length)) {
                try {
                    const host: any = wvMainWins()[0];
                    if (host) host.setTimeout(() => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTabSplitPending(); }, 91000);
                } catch (e) {}
            }
        }
        if (Date.now() > (P._wvTSplitPendingUntil || 0) && P._wvTSplitPending.length) {
            const expired = P._wvTSplitPending;
            P._wvTSplitPending = [];
            this._wvTabSplitExpire(expired);
        }
        return P._wvTSplitPending;
    }

    /** `recs` less the records of splits on screen in an open window: the same
     *  two sides, and the record's window fingerprint matching that window (a
     *  record without one: its sides alone), each live split answering one record. */
    _wvTabSplitNotLive(recs: any[]): any[] {
        try {
            const liveRecs: Array<{ l: string; r: string; fp: string[] }> = [];
            for (const w of wvMainWins()) {
                const splits = (w as any)._wvTSplits;
                if (!Array.isArray(splits) || !splits.length) continue;
                let fp: string[] | null = null;
                for (const s of splits) {
                    if (s.picker || !s.right) continue;
                    const l = descOf(tabIn(w, s.left)), r = descOf(tabIn(w, s.right));
                    if (l && r) liveRecs.push({ l, r, fp: fp || (fp = fingerprintOf(w)) });
                }
            }
            if (!liveRecs.length) return recs;
            return recs.filter((rec) => {
                const i = liveRecs.findIndex((x) => x.l === rec.l && x.r === rec.r
                    && (!Array.isArray(rec.w) || !rec.w.length || fpScore(rec.w, x.fp) >= FP_MIN));
                if (i < 0) return true;
                liveRecs.splice(i, 1);
                return false;
            });
        } catch (e) { return recs; }
    }

    /** Re-form the splits recorded before the restart in `win`, where both sides
     *  are open again (a library side: the window's library tab next to the
     *  other side, or its first). */
    _wvTabSplitRestore(win: any) {
        try {
            if (!this._wvTabSplitOn()) return;
            const recs = this._wvTabSplitPending();
            if (!recs.length) return;
            const Z: any = win.Zotero_Tabs;
            const cur = fingerprintOf(win);
            const others = wvMainWins().filter((x: any) => x !== win && !x.closed);
            let made = 0;
            for (const rec of recs.slice()) {
                // Only into its own window: the one holding the recorded window's
                // tabs, unless another open window holds them better. A record
                // from before 1.0.5-dev.4 has no fingerprint: matched by its sides.
                if (Array.isArray(rec.w) && rec.w.length) {
                    const mine = fpScore(rec.w, cur);
                    if (mine < FP_MIN) continue;
                    if (others.some((x: any) => fpScore(rec.w, fingerprintOf(x)) > mine)) continue;
                }
                const free = (t: any) => t && !this._wvTabSplitOf(win, t.id);
                // A split's sides sit together in the strip, left first (Adjoin), and
                // Zotero restores the order: the first such pair. Two sides recorded
                // alike (two library tabs, both "lib") took the right side first, so
                // the split came back reversed. Else (a side pinned again at the
                // quit, away from its partner) each side on its own, the left one
                // first: it is further left in the strip (item 16). The recorded
                // sides stand: the order is not worked out again.
                const tabs: any[] = Z._tabs;
                let L: any = null, R: any = null;
                for (let i = 0; i + 1 < tabs.length && !L; i++) {
                    if (free(tabs[i]) && free(tabs[i + 1]) && matches(tabs[i], rec.l) && matches(tabs[i + 1], rec.r)) { L = tabs[i]; R = tabs[i + 1]; }
                }
                if (!L) {
                    L = tabs.find((t: any) => free(t) && matches(t, rec.l));
                    R = tabs.find((t: any) => free(t) && t !== L && matches(t, rec.r));
                }
                if (!L || !R) continue;
                const s: WvTabSplit = { id: "tsplit-" + Date.now().toString(36) + made, left: L.id, right: R.id, ratio: Number(rec.ratio) || 0.5 };
                const panes = this._wvTabSplitPanesOf(rec);
                if (panes) s.panes = panes;
                // The pins it had taken: kept to give back (a side found pinned again --
                // the quit's destroy gave it back -- leaves the pins anew).
                if (Array.isArray(rec.pin)) s.pins = rec.pin.filter((p: any) => p && (p.side === "left" || p.side === "right")).map((p: any) => ({ side: p.side, index: Math.max(0, Number(p.index) || 0) }));
                this._wvTabSplits(win).push(s);
                this._wvTabSplitTakePins(win, s);
                this._wvTabSplitAdjoin(win, s);
                recs.splice(recs.indexOf(rec), 1);
                made++;
            }
            if (made) { this._wvTabSplitPersist(); this._wvTabSplitSync(win); }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSplitRestore err: " + e); }
    }

    /** Records of `win`'s splits for a named session (sessions.ts). */
    _wvTabSplitRecords(win: any): any[] {
        const out: any[] = [];
        let fp: string[] | null = null;
        for (const s of this._wvTabSplits(win)) {
            if (s.picker || !s.right) continue;
            const l = descOf(tabIn(win, s.left)), r = descOf(tabIn(win, s.right));
            if (!l || !r) continue;
            const rec: any = { l, r, ratio: s.ratio, w: fp || (fp = fingerprintOf(win)) };
            const p = this._wvTabSplitPanesNow(win, s);
            if (p) rec.p = p;
            if (s.pins && s.pins.length) rec.pin = s.pins.map((x) => ({ side: x.side, index: x.index }));
            out.push(rec);
        }
        return out;
    }

    /** A split's own pane state as it stands (the live side's read from Zotero's
     *  pane while the split is on screen), for its records; null for other splits. */
    _wvTabSplitPanesNow(win: any, s: WvTabSplit): WvTabSplitPanes | null {
        try {
            if (!this._wvTabSplitManaged(win, s) || !s.panes) return null;
            // A library side holding its own panes: as its view has them now.
            const map = win._wvTSplitLibNormal;
            for (const side of ["left", "right"] as const) {
                const id = side === "left" ? s.left : s.right;
                const own = s.panes[side];
                if (!own || !id || !(map instanceof Map) || !map.has(id)) continue;
                const root = this._wvTabSplitLibRoot(win, id);
                if (root) own.lib = this._wvTabSplitLibRead(root);
            }
            const p: any = {};
            for (const side of ["left", "right"] as const) if (s.panes[side]) p[side] = Object.assign({}, s.panes[side]);
            const st = win._wvTSplitPanes;
            if (st && st.id === s.id && st.live && p[st.live]) {
                p[st.live].ctx = !win.ZoteroContextPane.collapsed;
                const w = this._wvTabSplitPaneAttrW(win);
                if (w) p[st.live].ctxW = w;
            }
            return p;
        } catch (e) { return null; }
    }

    /** A record's pane state, checked. A record of 1.0.5-l10n.9 (one state for the
     *  whole split: {ctx, ctxW, sb, sbW}) gives that state to both sides; one of
     *  1.0.5-splitpane.5 (one item-pane width for the split, `ctxW` beside the
     *  sides) gives that width to both. */
    _wvTabSplitPanesOf(rec: any): WvTabSplitPanes | undefined {
        const p = rec && rec.p;
        if (!p || typeof p !== "object") return undefined;
        const num = (v: any) => (typeof v === "number" && v > 0 ? v : null);
        const splitW = num(p.ctxW);
        const side = (x: any) => {
            if (!x || typeof x !== "object") return undefined;
            const out: WvTabSplitSidePanes = { ctx: !!x.ctx, sb: !!x.sb, sbW: num(x.sbW) };
            const w = num(x.ctxW) || splitW;
            if (w) out.ctxW = w;
            if (typeof x.pin === "string") out.pin = x.pin;
            // A library side's own panes (item 15; none in a record of
            // 1.0.5-splitpane.6: the side starts from what it shows).
            if (x.lib && typeof x.lib === "object" && !Array.isArray(x.lib)) {
                const lib: WvTabSplitLib = {};
                for (const key of Object.keys(x.lib)) {
                    const r = x.lib[key];
                    if (!r || typeof r !== "object") continue;
                    const o: Record<string, string | null> = {};
                    for (const a of Object.keys(r)) if (r[a] === null || typeof r[a] === "string") o[a] = r[a];
                    lib[key] = o;
                }
                if (Object.keys(lib).length) out.lib = lib;
            }
            return out;
        };
        if (!("left" in p) && !("right" in p) && ("ctx" in p || "sb" in p)) {
            return { left: side(p), right: side(p) };
        }
        const out: WvTabSplitPanes = {};
        const l = side(p.left), r = side(p.right);
        if (l) out.left = l;
        if (r) out.right = r;
        return out;
    }

    /** A session window record's fingerprint (sessions.ts tab records: type,
     *  libraryID, itemKey), for split records saved without one. */
    _wvTabSplitFingerprintOfRecord(rec: any): string[] {
        try {
            const out: string[] = [];
            const libs = Array.isArray(rec && rec.libraryTabs) ? rec.libraryTabs.length : (rec && rec.noLibrary ? 0 : 1);
            for (let i = 0; i < libs; i++) out.push("lib");
            for (const t of ((rec && rec.tabs) || [])) {
                if (t && t.itemKey && t.libraryID != null) out.push(String(t.type || "").replace(/-(unloaded|loading|reloaded)$/, "") + ":" + t.libraryID + "/" + t.itemKey);
            }
            return out.sort();
        } catch (e) { return []; }
    }

    /** A named session's splits (sessions.ts, after its switch): waiting for
     *  their windows as at a start, matched now and as the windows come back
     *  (a window loading later restores itself, _wvTabSplitWire). */
    _wvTabSplitSessionAdopt(recs: any[]) {
        try {
            const P: any = this;
            P._wvTSplitPending = Array.isArray(recs) ? recs.slice() : [];
            P._wvTSplitPendingUntil = Date.now() + 30000;
            const pass = () => { const lp = live(); if (!lp || lp._wvDestroyed) return; for (const w of wvMainWins()) { try { lp._wvTabSplitRestore(w); } catch (e) {} } };
            pass();
            for (const ms of [1500, 4000, 9000]) { try { const w0: any = wvMainWins()[0]; if (w0) w0.setTimeout(pass, ms); } catch (e) {} }
        } catch (e) {}
    }

    /** Destroy: every window back to Zotero's deck, the wraps peeled. */
    _wvTabSplitUnwireAll() {
        try {
            const MMid = (this as any)._wvTSplitObserverID;
            if (MMid) { try { Zotero.Notifier.unregisterObserver(MMid); } catch (e) {} (this as any)._wvTSplitObserverID = null; }
            this._wvTabSplitUnregisterMenus();
            for (const w of wvMainWins()) {
                try {
                    const doc = (w as any).document;
                    const Z: any = (w as any).Zotero_Tabs;
                    if (Z && Z._wvOrigCanUnloadTS) { Z.canUnload = Z._wvOrigCanUnloadTS; delete Z._wvOrigCanUnloadTS; }
                    // The normal side panes back before the wraps go (a disable while a
                    // reader|reader split is on screen).
                    try { this._wvTabSplitPanesLeave(w); } catch (e) {}
                    // The library sides' normal panes back (item 15), before the wraps go.
                    try { this._wvTabSplitLibReconcile(w, true); } catch (e) {}
                    // The pins the splits took, given back: a disable leaves the pins as
                    // they were before (the splits stay recorded; a re-enable or a reload
                    // takes them off again, _wvTabSplitWire).
                    for (const s of this._wvTabSplits(w)) { try { this._wvTabSplitGivePins(w, s); } catch (e) {} }
                    if (Z) { wvUnwrap(Z, "updateSidebarLayout", "splitSidebar"); wvUnwrap(Z, "select", "splitSelect"); }
                    try { const dk = doc.getElementById("tabs-deck"); if (dk) wvUnlisten(dk, "tsplit:selchange"); } catch (e) {}
                    const ZP: any = (w as any).ZoteroPane;
                    if (ZP) { wvUnwrap(ZP, "serializePersist", "splitPersist"); wvUnwrap(ZP, "unserializePersist", "splitLibPersist"); }
                    delete (w as any)._wvTSplitLibNormal;
                    if ((w as any)._wvTSplitLibMOs instanceof Map) { for (const mo of (w as any)._wvTSplitLibMOs.values()) { try { mo.disconnect(); } catch (e) {} } }
                    delete (w as any)._wvTSplitLibMOs;
                    const cp: any = doc.getElementById("zotero-context-pane-inner");
                    if (cp) wvUnwrap(cp, "_handleTabSelect", "splitContextPane");
                    const deck = doc.getElementById("tabs-deck");
                    if (deck) {
                        deck.removeAttribute("wv-tsplit");
                        for (const el of Array.from(deck.children) as any[]) {
                            el.classList.remove("wv-tsplit-panel", "wv-tsplit-active");
                            el.removeAttribute("data-wv-side");
                            el.style.removeProperty("flex");
                            this._wvTabSplitCardUnreserve(el);
                            this._wvTabSplitLibraryUnfit(w, el);
                            this._wvTabSplitUnwirePanel(el);
                        }
                    }
                    delete (w as any)._wvTSplitFitMOs;
                    const pane = doc.getElementById("zotero-context-pane");
                    if (pane) this._wvTabSplitPaneUnplace(pane);
                    delete (w as any)._wvTSplitCtxSent;
                    this._wvTabSplitObserve(w, false);
                    wvRemoveStyle(doc, STYLE_ID);
                    for (const id of [LAYER_ID, "wv-tsplit-menu", "wv-tsplit-pills"]) { const e = doc.getElementById(id); if (e) e.remove(); }
                    if ((w as any)._wvTSplitPillRO) { try { (w as any)._wvTSplitPillRO.disconnect(); } catch (e) {} delete (w as any)._wvTSplitPillRO; }
                    delete (w as any)._wvTSplitKeeping;
                    for (const el of doc.querySelectorAll("[data-wv-tsplit]")) el.removeAttribute("data-wv-tsplit");
                    (w as any)._wvTSplitRestoreArmed = false;
                } catch (e) {}
            }
        } catch (e) {}
    }
}

const _tabSplitDescriptors = Object.getOwnPropertyDescriptors(_TabSplitMixin.prototype);
delete (_tabSplitDescriptors as any).constructor;
export const tabSplitMethods = _tabSplitDescriptors;
void wvNativeWindows;
void Services;
