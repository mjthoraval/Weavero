// Module: backlinks (issue #60, 2026-10-22) -- "what links here" for an
// item: the zotero:// links other annotation comments and notes carry,
// turned around, and Zotero's own references in notes (2026-10-26): a
// citation (`span.citation[data-citation]`) and a quoted annotation
// (`[data-annotation]`), each marked as such. A link is enough; no
// symmetric relation is written.
//
// The index is DERIVED and never stored (links are plain Zotero data,
// backlinks are a view over them -- the no-plugin-only-data rule): two SQL
// scans on first use (notes with a link, a citation or a quote; annotation
// comments with a link), parsed with the one URL rule (lib/links.ts), one
// map from target `libraryID/key` to its sources plus the reverse map per
// source. Zotero's item notifier re-parses one source when it changes and
// drops it when it goes (priority 85: before the filter cache's reapply at
// 90, so a reapply reads fresh data). A reference to an attachment or an
// annotation also counts for its parent: in the parent's section behind
// one collapsed row, each with what it is aimed at. A note's link to its
// own parent (or to itself) is not a backlink.
//
// Three consumers: the item-pane section (ItemPaneManager; it shows for
// the parent item in reader tabs and for the note itself in note tabs --
// elements/contextPane.js hands a note tab's item-details the note), the
// Backlinks column (pane.ts, next to Related) and the Has Backlinks chip
// (filter.ts). Each consumer kicks the build and is refreshed when it ends.
//
// The same pass also keeps each source's OUTGOING references in text order
// (`outBySource`, 2026-10-27), the Links section's data (modules/links.ts):
// a resolved reference is the very entry its target's list holds, and an
// unresolved one -- its item gone, or its group library not in this
// profile -- is kept there alone, marked, so Links can show it greyed while
// nothing counts it. The row, card and section helpers below serve both.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvHtmlEl, wvPopupHost } from "../lib/dom";
import { wvLivePlugin } from "../lib/live";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvMenuItem, wvMenuSeparator } from "../lib/menu";
import { wvMainWins } from "../lib/windows";
import { urlPattern, schemeAltPart, joinSchemeAlt, urlLinkClass } from "../lib/links";
import { URL_SCHEMES } from "./url";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvListen } from "../lib/listen";
import { wvLinkGlyphUri, wvLinkGlyphEl, wvRefMarkGlyphEl, WvRefMark } from "../lib/link-glyph";
import { wvSvgEl } from "../lib/svg";
import { wvStageNativeUndo } from "./undo";
import { BTN_CLASS, BTN_SIDEBAR_CLASS, WV_GUIDE_COLOR } from "./constants";

declare const Zotero: any;

export const WV_BL_PANE_ID = "weavero-backlinks";
export const WV_BL_COLUMN_KEY = "weaveroBacklinks";
/** The Links column (slice 2, 2026-10-27): the index read the other way. */
export const WV_LK_COLUMN_KEY = "weaveroLinks";
/** The External Links column (2026-10-30): the web and app links. */
export const WV_EXT_COLUMN_KEY = "weaveroExtLinks";
export const WV_BL_PLUGIN_ID = "weavero@mjthoraval";
const BL_STYLE_ID = "wv-backlinks-style";
const BL_MENU_ID = "wv-backlinks-menu";
const BL_FTL = "weavero.ftl";
const BL_FTL_LINK = `link[rel="localization"][href="${BL_FTL}"]`;
const BL_EXCERPT = 70;
/** A row's excerpt (MJT 2026-10-26, "2 lines + hover card"): from the clause
 *  before the reference, at most BL_BEFORE characters, and BL_AFTER after
 *  it, clamped to two lines; the hover card holds BL_CARD each side. */
const BL_BEFORE = 40;
const BL_AFTER = 110;
const BL_CARD = 400;
/** The card's context BEFORE the reference: its reference block spans the
 *  card (MJT 2026-10-28, "So that the preview can display more context"),
 *  and 600 characters -- about 7 of its 12 lines at full width, 10 in a
 *  stacked card -- keep the reference itself in view. */
const BL_CARD_BEFORE = 600;
const BL_CARD_ID = "wv-bl-card";
const BL_CARD_DELAY = 450;   // the bookmark card's rest (reader-panels.ts)
// `_wvBlCardHover`'s rest timers and mouse-press marks, kept off Zotero's
// elements (no expando left on them at a reload).
const blHoverT = new WeakMap<any, any>();
const blHoverMouse = new WeakSet<any>();

/** The glyph: Weavero's links glyph with an arrow pointing into it -- a
 *  link coming BACK (lib/link-glyph.ts). It was Zotero's two-link chain
 *  until 2026-10-23, which is Zotero's RELATED icon (related.svg and
 *  link.svg hold the same path): MJT, "You have used the related icon
 *  shape instead of the links shape". Stroked with a paint the surface
 *  decides: `context-fill` where the host styles it (the column header,
 *  the chip tile, the count popup), a baked colour where the host paints
 *  the image as is (the custom section header and sidenav use it as a
 *  plain background image, light and dark each). */
export const WV_BL_ICON_CONTEXT = wvLinkGlyphUri("context-fill", 16, true);
const BL_ICON_16_LIGHT = wvLinkGlyphUri("#5a5a5a", 16, true);
const BL_ICON_16_DARK = wvLinkGlyphUri("#c8c8c8", 16, true);
const BL_ICON_20_LIGHT = wvLinkGlyphUri("#5a5a5a", 20, true);
const BL_ICON_20_DARK = wvLinkGlyphUri("#c8c8c8", 20, true);
/** An annotation's two reference buttons (reader card, PDF popup, item-pane
 *  card, items-list row): what it links, what links it. */
export type WvRefKind = "links" | "backlinks";
/** "1 Item Link" / "3 Item Links" / "1 Backlink" / "3 Backlinks" ("Item
 *  Links" since 2026-10-30, the section's and column's name). */
export function wvRefTitle(n: number, kind: WvRefKind): string {
    return n + (kind === "links" ? (n === 1 ? " Item Link" : " Item Links") : (n === 1 ? " Backlink" : " Backlinks"));
}

/** The hover card's last line, shared by every row kind. */
export const WV_BL_CARD_FOOT = "Click to open · Shift+click: new window · Right-click for more";

/** An item-pane section registered through ItemPaneManager by the
 *  descriptor-driven helpers of this module (Backlinks here, Links in
 *  links.ts). The slot names hold the registration key on the instance and
 *  on the Zotero global (a leftover of an earlier instance is cleared
 *  first), the unregistered-at stamp and the deferred-register timer; the
 *  hooks are method names resolved on the LIVE instance at call time. */
export interface WvSectionDesc {
    paneID: string;
    inst: string;
    glob: string;
    at: string;
    timer: string;
    header: { l10nID: string; icon: string; darkIcon: string };
    sidenav: { l10nID: string; icon: string; darkIcon: string };
    bodyXHTML: string;
    hooks: { init: string; destroy: string; itemChange: string; render: string; asyncRender: string };
    enabled: (plugin: any) => boolean;
}

const BL_SECTION: WvSectionDesc = {
    paneID: WV_BL_PANE_ID,
    inst: "_wvBlPaneKey", glob: "_wvBlPaneKey", at: "_wvBlUnregisteredAt", timer: "_wvBlRegisterTimer",
    header: { l10nID: "weavero-backlinks-header", icon: BL_ICON_16_LIGHT, darkIcon: BL_ICON_16_DARK },
    sidenav: { l10nID: "weavero-backlinks-sidenav", icon: BL_ICON_20_LIGHT, darkIcon: BL_ICON_20_DARK },
    bodyXHTML: '<html:div class="wv-bl-body"></html:div>',
    hooks: { init: "_wvBlHookInit", destroy: "_wvBlHookDestroy", itemChange: "_wvBlHookItemChange", render: "_wvBlHookRender", asyncRender: "_wvBlHookAsyncRender" },
    enabled: (p) => { try { return !!p._getEnableBacklinks(); } catch (e) { return false; } },
};

const BL_CSS = [
    ".wv-bl-body { display: flex; flex-direction: column; gap: 1px; }",
    ".wv-bl-group { display: flex; flex-direction: column; }",
    // One line, cut: `contain: inline-size` keeps a title's full length out
    // of the pane's minimum width -- a 109-character title held the whole
    // item pane (and the empty-selection message) at 721 px in a 320-px
    // pane (MJT 2026-10-26, dev.52 screenshot: "This went out of screen").
    // On the heading, not its title, so the title keeps its own width and an
    // annotation's grey file and page follow it (MJT 2026-10-30).
    ".wv-bl-owner { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 4px; cursor: default; contain: inline-size; }",
    ".wv-bl-owner:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }",
    ".wv-bl-owner .wv-bl-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".wv-bl-row { display: flex; align-items: flex-start; gap: 6px; padding: 2px 4px 3px 22px; border-radius: 4px; cursor: default; }",
    ".wv-bl-row:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }",
    ".wv-bl-kind { flex: none; width: 16px; height: 16px; margin-top: 1px; }",
    // Zotero's annotation icon is an <img> whose `style.fill` holds the
    // annotation's colour (components/icons.jsx getCSSIcon); the fill only
    // reaches the SVG through -moz-context-properties, which Zotero sets in
    // its own rows only (the clicky-item mixin, item-tree cells). Without it
    // every annotation drew black here (MJT 2026-10-23).
    ".wv-bl-kind.annotation-icon { -moz-context-properties: fill; }",
    ".wv-bl-text { flex: 1; min-width: 0; }",
    ".wv-bl-row:focus-visible, .wv-bl-more-toggle:focus-visible { outline: 2px solid var(--color-focus-outer, Highlight); outline-offset: -2px; }",
    // A Backlinks source under its paper in a popup's source tree
    // (`_wvBlRenderList`): one level step in, its links one more.
    ".wv-bl-src { display: flex; flex-direction: column; margin-inline-start: 18px; }",
    // A popup heading's rows hang on the collections pane's indent guide
    // (MJT 2026-10-29, screenshot of a Related popup: "can you add a vertical
    // line like in the collections pane?"), under the heading's icon (its
    // 4-px padding + 7, the guide's place in a 16-px column): beside a source
    // block, 18 px in by margin; inside a row, whose 22-px padding holds it;
    // beside a part's groups, 14 px in. Each child draws its own length and
    // the pixel above it. The other popups' headings: constants.ts.
    ".wv-bl-owner ~ :is(.wv-bl-src, .wv-bl-row), .wv-bl-part > .wv-count-group-head ~ .wv-bl-group { position: relative; }",
    ".wv-bl-owner ~ :is(.wv-bl-src, .wv-bl-row)::before, .wv-bl-part > .wv-count-group-head ~ .wv-bl-group::before {"
        + " content: ''; position: absolute; top: -1px; bottom: 0; width: 1px; background: " + WV_GUIDE_COLOR + "; }",
    ".wv-bl-owner ~ .wv-bl-src::before { inset-inline-start: -7px; }",
    ".wv-bl-owner ~ .wv-bl-row::before { inset-inline-start: 11px; }",
    ".wv-bl-part > .wv-count-group-head ~ .wv-bl-group::before { inset-inline-start: -3px; }",
    // In the item pane, Zotero's own row geometry (MJT 2026-10-28,
    // screenshot: "The indentation should be consistent with the native
    // indentation in the Related section"): the body 12 px in, a box's 4 px
    // padding, 4 px icon gap and 5 px corners (_notesBox.scss, which Related
    // shares; the clicky-item mixin). The count popups keep their own layout.
    "item-pane-custom-section :is(.wv-bl-body, .wv-lk-body) { padding-inline-start: 12px; }",
    "item-pane-custom-section :is(.wv-bl-row, .wv-bl-more-toggle) { gap: 4px; padding-inline-start: 4px; border-radius: 5px; }",
    // The item pane's rows (MJT 2026-10-29, "I would like to have a compact
    // design showing more clearly what part is for the source of the link and
    // what part is for the target" -> "Try one line for the source and one
    // line for the target"): one row a link, the line it is written in over
    // the line it points to, hung from it -- the arrow under the first line's
    // icon, the target's icon under its text. Each line cut to the pane
    // (`contain: inline-size`, the dev.52 rule above), its text giving way
    // before its place.
    ".wv-bl-row.wv-bl-pair { flex-direction: column; align-items: stretch; gap: 0; padding: 2px 4px 3px; }",
    ".wv-bl-end { display: flex; align-items: center; gap: 4px; contain: inline-size; }",
    ".wv-bl-end > .wv-bl-kind { margin-top: 0; }",
    ".wv-bl-end-main { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    // The line's grey end: an annotation's file, then the place -- its page,
    // or what the link says (a citation's page, a Better Notes line). Short
    // of room the file is cut and the page after it kept whole (MJT
    // 2026-10-30, "(a) Show both, page last"); a place alone is cut itself.
    // The file never takes more than ~6 em, whatever the room: "Full Text
    // PDF" stays whole, a longer name leaves the line to the text (MJT
    // 2026-11-02, "Fixed, ~6 em"; it could take most of the 60% until dev.135).
    ".wv-bl-end-chip { flex: 0 0 auto; max-width: 60%; display: flex; min-width: 0; overflow: hidden; white-space: nowrap; color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; }",
    ".wv-bl-end-file, .wv-bl-end-place { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: pre; }",
    ".wv-bl-end-file { max-width: 6em; }",
    ".wv-bl-end-file + .wv-bl-end-place { flex-shrink: 0; }",
    // The arrow's cell; a Zotero link's arrow in the Zotero links' colour,
    // a note citation's in Zotero's primary text colour (blArrow; MJT
    // 2026-11-03, "keeping white for the Note Citations", then "The white
    // and colored links seem to be gray and full color": --fill-tertiary,
    // white at 30%, read as grey beside the opaque Zotero-link colour).
    ".wv-bl-arrow { flex: none; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: var(--fill-primary, #222); }",
    ".wv-bl-arrow[data-mark='zotero'] { color: var(--wv-link-zotero, #8b4513); }",
    ".wv-bl-arrow svg { display: block; }",
    // A row whose first line is the one above it (`cont`): its own line only,
    // close under the previous row, so a group reads as one.
    ".wv-bl-row.wv-bl-pair.wv-bl-cont { padding-top: 0; }",
    // An internal link's mark, at the end of the line naming its far end
    // (wvBlInternalMark; MJT 2026-10-29, "Try option 2").
    ".wv-bl-internal { flex: none; display: inline-flex; align-items: center; margin-inline-start: auto; padding-inline-start: 4px; color: var(--fill-secondary, #6b6b6b); }",
    ".wv-bl-internal svg { display: block; width: 14px; height: 14px; }",
    // The item pane's group headings (MJT 2026-10-30, "The format for This
    // item and similar lines is not consistent between links and backlinks"
    // -> "Option (b)"): the Tags and Related sections' -- an icon, the name
    // muted and cut, the group's count at the right end (pane-scope.ts,
    // constants.ts `.wv-scope-block`) -- the rows under it hung on the guide
    // under its icon, each keeping its arrow. Here as well as in the main
    // window's sheet: a reader window's context pane draws them too.
    ".wv-bl-hgroup { display: flex; flex-direction: column; gap: 1px; }",
    ".wv-bl-hgroup + .wv-bl-hgroup { margin-top: 4px; }",
    // `contain: inline-size`, as a row's line (dev.52): a long heading is cut,
    // never the pane's minimum width -- a long annotation heading held the
    // Links section at 1053 px in a 410-px pane, its right side (the end
    // counts, the U-turns) out of view (MJT 2026-10-30, dev.121).
    ".wv-bl-hgroup > .wv-count-group-head { display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 5px; cursor: default; color: var(--fill-secondary, #5a5a5a); font-size: 0.92em; contain: inline-size; }",
    ".wv-bl-hgroup > .wv-count-group-head[role='button']:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }",
    ".wv-bl-hgroup > .wv-count-group-head > .wv-count-group-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".wv-bl-hgroup > .wv-count-group-head > .wv-count-group-n { margin-inline-start: auto; padding-inline-start: 10px; flex-shrink: 0; font-variant-numeric: tabular-nums; }",
    // A section heading's rows start under its icon, their arrow the
    // tree's mark: no guide line (MJT 2026-11-03, "Try removing the vertical
    // line so that the arrows get shifted left"; dev.123-161 hung them 16 px
    // in on the collections pane's indent guide).
    ".wv-bl-hgroup > .wv-bl-row { margin-inline-start: 0; position: relative; }",
    ".wv-bl-head { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; contain: inline-size; }",
    ".wv-bl-meta { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; }",
    ".wv-bl-label { color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; }",
    // What a link aimed at a child points at ("→ PDF p. 5").
    ".wv-bl-chip { color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; border: 1px solid var(--fill-quinary, rgba(128,128,128,0.3)); border-radius: 3px; padding: 0 4px; }",
    ".wv-bl-excerpt { overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
    // An annotation source's annotated text, above its comment's excerpt.
    ".wv-bl-ann-text { color: var(--fill-secondary, #6b6b6b); font-style: italic; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
    // The collapsed row for the links aimed at the item's children.
    ".wv-bl-more { display: flex; flex-direction: column; margin-top: 2px; }",
    ".wv-bl-more-toggle { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 4px; color: var(--fill-secondary, #6b6b6b); cursor: default; }",
    ".wv-bl-more-toggle:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }",
    ".wv-bl-more-toggle::before { content: '▸'; width: 16px; text-align: center; }",
    ".wv-bl-more-toggle[aria-expanded='true']::before { content: '▾'; }",
    ".wv-bl-more-body { display: flex; flex-direction: column; gap: 1px; }",
    // An author `display` beats the UA's `[hidden] { display: none }`: the
    // collapsed bodies were drawn expanded and the toggle flipped nothing
    // visible (MJT 2026-10-27, "A click on this right triangle does not do
    // anything").
    ".wv-bl-more-body[hidden] { display: none; }",
    // The hover card: the whole context, also on keyboard focus. Its
    // background is the side pane's material, not the menu's: Zotero's
    // --material-menu is TRANSLUCENT on the dark theme (rgba(40,40,40,0.58),
    // meant for blurred native menus), and the card read through to the
    // rows under it (MJT 2026-10-27, "The hover card is transparent").
    "#" + BL_CARD_ID + " { position: fixed; z-index: 2147483000; box-sizing: border-box; max-width: 380px; padding: 8px 10px; pointer-events: none;"
        // Zotero's raised surface, its button material (#404040 dark, white
        // light), over the item pane's sidepane, inside Zotero's popup border
        // (MJT 2026-11-03, "Cards have the same background as the item
        // pane" -> "Try A"; the sidepane's own colour until 1.0.0-beta.1).
        + " background: var(--material-button, var(--material-background, Field)); color: var(--fill-primary, FieldText);"
        + " border: var(--material-border, 1px solid rgba(128,128,128,0.3)); border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }",
    "#" + BL_CARD_ID + "[hidden] { display: none; }",
    "#" + BL_CARD_ID + " .wv-bl-card-head { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    "#" + BL_CARD_ID + " .wv-bl-card-meta { color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; margin-top: 1px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-text { margin-top: 5px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 12; -webkit-box-orient: vertical; overflow: hidden; }",
    "#" + BL_CARD_ID + " .wv-bl-card-foot { margin-top: 6px; color: var(--fill-tertiary, #8c8c8c); font-size: 0.9em; }",
    // The lineage card (MJT 2026-10-27, "I need full context of the source
    // and the target"): SOURCE left, TARGET right, an arrow between; each
    // side an indented tree climbed from the item's paper. Under ~480 px of
    // window the columns stack (`wv-bl-card-stack`, set by _wvBlCardOpen).
    "#" + BL_CARD_ID + " .wv-bl-card-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 34px; align-items: start; }",
    "#" + BL_CARD_ID + ".wv-bl-card-stack .wv-bl-card-cols { grid-template-columns: minmax(0, 1fr); row-gap: 16px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-side { font-size: 0.78em; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fill-tertiary, #8c8c8c); margin-bottom: 3px; }",
    // The arrow (an SVG over the card, _wvBlCardArrow): from the note or
    // annotation the reference is written in to what it points at (MJT
    // 2026-10-27, "The arrow should go from the place where the link is to
    // its target").
    "#" + BL_CARD_ID + " .wv-bl-card-arrow { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; color: var(--fill-secondary, #6b6b6b); }",
    // A broken link's cross on the arrow, in Zotero's red (its missing
    // file's cross; the Links header's broken count), on the card's colour.
    "#" + BL_CARD_ID + " .wv-bl-card-broken-x { color: var(--accent-red, #db2c3a); }",
    // The Related icon on a relation's arrow, in the Related section's
    // colour (Zotero's $item-pane-sections "related": --accent-wood), as the
    // Related column's header (MJT 2026-11-02, "Use the correct color for
    // the related icon"; the arrow's grey in dev.137-138).
    "#" + BL_CARD_ID + " .wv-bl-card-rel-icon { color: var(--accent-wood, #cc7a52); }",
    "#" + BL_CARD_ID + " .wv-bl-card-broken-x-bg, #" + BL_CARD_ID + " .wv-bl-card-icon-bg { fill: var(--material-button, var(--material-background, Field)); }",
    // What both ends share, once above the two columns (_wvBlCardShared);
    // as wide as the left column when an end is up there, so the arrow
    // climbing the gap reaches its title's end without crossing it.
    "#" + BL_CARD_ID + " .wv-bl-card-shared { margin-bottom: 6px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-shared[data-wv-end] { max-width: calc((100% - 34px) / 2); }",
    "#" + BL_CARD_ID + " .wv-bl-card-node { display: flex; align-items: flex-start; gap: 5px; margin-top: 2px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node[data-depth='1'] { margin-inline-start: 14px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node[data-depth='2'] { margin-inline-start: 28px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node[data-depth='3'] { margin-inline-start: 42px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node[data-depth]:not([data-depth='0'])::before { content: '└'; color: var(--fill-tertiary, #8c8c8c); margin-inline-start: -12px; width: 8px; flex: none; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node .wv-bl-kind { flex: none; width: 16px; height: 16px; margin-top: 1px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node-body { min-width: 0; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node-main { overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
    // An annotation's line, the reader's annotation header (_wvBlCardNode;
    // reader _preview.scss `.author`): the page left, the author at the right
    // end in the secondary grey, cut first, dimmed when imported.
    "#" + BL_CARD_ID + " .wv-bl-card-node-main.wv-bl-card-node-head { display: flex; align-items: baseline; gap: 8px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node-page { flex: none; white-space: nowrap; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node-author { margin-inline-start: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fill-secondary, #6b6b6b); }",
    "#" + BL_CARD_ID + " .wv-bl-card-node-author.wv-non-authoritative { opacity: 0.4; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node-authored > .wv-bl-card-node-body { flex: 1 1 auto; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node[data-kind='paper'] .wv-bl-card-node-main { font-weight: 600; }",
    "#" + BL_CARD_ID + " .wv-bl-card-node-sub { color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
    "#" + BL_CARD_ID + " .wv-bl-card-ref { margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--fill-quinary, rgba(128,128,128,0.3)); }",
    "#" + BL_CARD_ID + " .wv-bl-card-ref-label { display: flex; align-items: center; gap: 4px; color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; }",
    "#" + BL_CARD_ID + " .wv-bl-card-ref-icon { flex: none; width: 14px; height: 14px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-ref .wv-bl-card-text { margin-top: 2px; }",
    "#" + BL_CARD_ID + " .wv-bl-card-broken { color: var(--fill-secondary, #6b6b6b); font-style: italic; }",
    "#" + BL_CARD_ID + " .wv-bl-card-url { overflow-wrap: anywhere; font-size: 0.92em; margin-top: 2px; }",
    // Links in an excerpt keep their kind's colour (the main window defines
    // the --wv-link-* variables; the fallbacks are the light palette). The
    // link pointing HERE gets a background highlight, the way Obsidian's
    // backlinks pane marks its matched text (2026-10-23).
    ".wv-bl-link.wv-link-http { color: var(--wv-link-http, #1a73e8); }",
    ".wv-bl-link.wv-link-zotero { color: var(--wv-link-zotero, #8b4513); }",
    ".wv-bl-link.wv-link-app { color: var(--wv-link-app, #9333ea); }",
    ".wv-bl-hit { background: color-mix(in srgb, currentColor 22%, transparent); border-radius: 3px; padding: 0 2px; box-decoration-break: clone; }",
    // A note citation the excerpt is about: outlined, its runs in the note's
    // own colours inside (blDrawSegs; the grey fill until dev.144).
    ".wv-bl-hit.wv-bl-hit-cite { background: none; border: 1px solid color-mix(in srgb, currentColor 55%, transparent); padding: 0 1px; }",
    ".wv-bl-ann-icon { display: inline-block; width: 16px; height: 16px; }",
    // Links rows (links.ts): a broken reference reads greyed, its head in
    // italics; the card's annotation swatch and lines.
    ".wv-lk-broken { opacity: 0.65; }",
    ".wv-lk-broken :is(.wv-bl-head, .wv-bl-to > .wv-bl-end-main) { font-style: italic; color: var(--fill-secondary, #6b6b6b); }",
    ".wv-lk-why { color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; margin-top: 3px; }",
    // A row aimed at an annotation: its highlighted text, one clipped line,
    // with Zotero's reader-card bar in the annotation's colour (preview.js
    // `.blockquote-border`, 2 px; the inline colour set per row). MJT
    // 2026-10-28. `contain: inline-size`: a long text never widens the pane.
    ".wv-bl-target-hl { margin-top: 1px; padding-inline-start: 6px; border-inline-start: 2px solid var(--fill-tertiary, #8c8c8c); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; contain: inline-size; }",
    // The card's annotation nodes draw their highlighted text the same way.
    "#" + BL_CARD_ID + " .wv-bl-card-node-hl { margin-top: 2px; padding-inline-start: 6px; border-inline-start: 2px solid var(--fill-tertiary, #8c8c8c); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }",
    // A collapsed row's popup by part (`_wvBlRenderByPart`): the rows sit
    // under their part's heading, indented as the other popups' rows are
    // (constants.ts `.wv-count-group-head ~ .wv-count-row`).
    ".wv-bl-part > .wv-bl-group { margin-inline-start: 14px; }",
    // A Links popup's source heading: its share at the right end, as the
    // part headings' (constants.ts `.wv-count-group-n`).
    ".wv-bl-owner .wv-lk-group-n { margin-inline-start: auto; padding-inline-start: 10px; flex-shrink: 0; font-variant-numeric: tabular-nums; color: var(--fill-secondary, #6b6b6b); font-size: 0.92em; }",
    ".wv-bl-part > .wv-count-group-head .wv-bl-kind { width: 16px; height: 16px; margin-top: 0; }",
    // The Attachments section's badge (`_wvBlDecorateAttRow`): Zotero's
    // annotation-count button's metrics (_attachmentRow.scss .annotation-btn),
    // its clicky-item rule's `flex: 1` undone the same way.
    "attachment-row > .head > .clicky-item.wv-att-bl-btn { flex-grow: 0; flex-basis: content; }",
    "attachment-row > .head > .wv-att-bl-btn .wv-att-bl-icon { flex: none; width: 12px; height: 12px; padding-block: 4px; color: var(--fill-secondary); }",
    // The mixin's `.label { width: 0; flex: 1 }` would fold the number away
    // in a content-sized button (Zotero gives its own `width: 100%`).
    "attachment-row > .head > .wv-att-bl-btn .label { flex: none; width: auto; padding-block: 2px; line-height: 16px; color: var(--fill-secondary); }",
].join("\n");

export interface WvBacklinkSource {
    /** The note or annotation item carrying the link. */
    srcID: number;
    kind: "annotation" | "itemNote" | "standaloneNote";
    /** What carries it (MJT 2026-10-26: Zotero's own references count too,
     *  well identified): a zotero:// `link`; a Zotero `citation` in a note
     *  (`span.citation[data-citation]`); an annotation `quote`d in a note
     *  (`[data-annotation]`, "Add Note from Annotations" or a drag). */
    ref: "link" | "citation" | "quote";
    /** The link as written; for a citation the cited item's URI, for a
     *  quote "annotation:<key>" -- what finds it again in the note. */
    url: string;
    /** The text around the link, each side trimmed to a few words; `segs`
     *  is the same window as drawn: text runs, links as written, the
     *  matching link flagged `hit`. */
    excerpt: { before: string; after: string; segs: WvBlSeg[] };
    /** `?page=` of an open link, when any. */
    page: string | null;
    /** A citation's locator (its page), when given. */
    locator: string | null;
    /** Where it sits in the source's raw text (the hover card's wider
     *  excerpt is cut from there). */
    at: number;
    len: number;
    /** A citation's or quote's text as the note reads it. */
    label?: string;
    /** Which of the source's references with this `ref` and `url` it is, in
     *  the text's order (0 = the first): what opens the note at THIS one. */
    nth?: number;
    /** A reference whose two ends sit in the same item -- a child note or an
     *  annotation linking its own paper, file, note or annotation, or
     *  itself; a child note's citation or quote of its own paper (MJT
     *  2026-10-30, "I want all internal references to be added to the
     *  internal links") -- counted as any reference, its rows and the
     *  headers marked (`wvBlInternalMark`). */
    internal?: boolean;
    /** A quote with Zotero's citation of its paper right after it, read as
     *  one reference (MJT 2026-10-30, "One reference" / "Under the
     *  annotation"): `at`/`len` span both, `locator` is the citation's page,
     *  and "Show in Source" marks both. */
    joined?: boolean;
}

/** One outgoing reference of a source, in the text's order: the SAME entry
 *  Backlinks holds for its target, or a broken one Backlinks never sees. */
export interface WvLkOut {
    entry: WvBacklinkSource;
    /** The target's `libraryID/key`; null when the reference is broken. */
    tKey: string | null;
    /** Why: the group library is not in this profile, or no item has the key. */
    broken?: "library" | "missing";
    /** The library the key is in, when known. */
    lib: number | null;
    /** The group the reference names, when its library is not here. */
    group: number | null;
    /** The key as written. */
    key: string;
}

/** A Links row as read now: the entry, its target resolved at read time
 *  (an item erased since the index saw it reads broken), its source. */
export interface WvLkRow {
    src: any;
    entry: WvBacklinkSource;
    target: any | null;
    broken: "library" | "missing" | null;
    url: string;
    group: number | null;
    key: string;
}

interface WvBlIndex {
    byTarget: Map<string, WvBacklinkSource[]>;
    bySource: Map<number, string[]>;
    /** Every reference per source in text order, broken ones included
     *  (the Links section, 2026-10-27). */
    outBySource: Map<number, WvLkOut[]>;
    /** The sources holding a broken reference, by what it names
     *  (`<libraryID>/<key>`; a group not here as `g<gid>/<key>`): an item
     *  landing under that key re-indexes them. */
    brokenByKey: Map<string, Set<number>>;
    /** Annotations a conversion replaced (`<libraryID>/<old key>` -> the
     *  current key, the `dc:replaces` of reader-panels' _wvAnnMoveRelated): a
     *  reference to the old key is a reference to the annotation. */
    fwd: Map<string, string>;
    /** The web and app links per source, in text order (the External
     *  Links column, MJT 2026-10-30): every scheme but zotero://, whichever
     *  the user has on -- the counts keep the enabled ones at read time. */
    extBySource: Map<number, WvExtLink[]>;
    seq: number;
    built: boolean;
    building: Promise<void> | null;
}

/** One external link as written: its address and its place in the source's
 *  text. The text around it is cut when a popup lists it (`_wvExtExcerpt`):
 *  a library holds far more web links than zotero:// ones. */
export interface WvExtLink { url: string; at: number; len: number }

/** An internal link's mark on its row: the links glyph's U-turn, the
 *  tooltip naming the item both ends are in. */
export function wvBlInternalMark(doc: any, owner: string): any {
    const el = wvHtmlEl(doc, "span", "wv-bl-internal");
    el.title = "Internal link: both ends are in “" + owner + "”";
    el.appendChild(wvLinkGlyphEl(doc, { backlink: "loop" }));
    return el;
}

/** What a broken reference names, as `brokenByKey` keys it. */
function blBrokenKey(o: WvLkOut): string | null {
    if (!o.broken || !o.key) return null;
    return (o.lib != null ? String(o.lib) : "g" + o.group) + "/" + o.key;
}
/** The key an item URI ends with, and the group it names (if any). */
function blUriKey(uri: string): string { return String(uri || "").replace(/\/+$/, "").split("/").pop() || ""; }
function blUriGroup(uri: string): number | null { const m = /\/groups\/(\d+)\//.exec(String(uri || "")); return m ? Number(m[1]) : null; }

/** One parsed link: the library token, the item keys (or legacy ids) it
 *  names, an annotation key for the `?annotation=` form, a page. */
export interface WvBlLink {
    lib: "user" | number;      // number = group id
    keys: string[];
    annotationKey: string | null;
    page: string | null;
}

const ENTITIES: { [k: string]: string } = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
function unescapeEntities(s: string): string {
    return s.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] || m);
}
/** HTML (a note body) to the text the reader sees. */
function htmlToText(s: string): string {
    return unescapeEntities(s.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h\d|blockquote|tr)>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");
}

/** The link forms the index understands (the ones Weavero emits and
 *  parses, plus Better Notes' note form):
 *    zotero://select/<lib>/items/<key>           zotero://select/<lib>/items?itemKey=K1,K2
 *    zotero://select/<lib>/collections/<ck>/items/<key> (scoped)
 *    zotero://open[-pdf]/<lib>/items/<key>[?page=N][&annotation=<key>]
 *    zotero://open-pdf/<libID>_<key>/<page>       (the ZotFile form)
 *    zotero://note/<u | gid | g/gid | groups/gid>/<key>/[?line=..]
 *  <lib> is `library` or `groups/<gid>` (`g/<gid>`). A key may be a legacy
 *  numeric item id or the `<libID>_<key>` hash (resolved by the caller).
 *  Collection and search links name no item: null. */
export function wvBlParseLink(raw: string): WvBlLink | null {
    try {
        const url = unescapeEntities(String(raw || "")).replace(/[.,;:)\]]+$/, "");
        const m = /^zotero:\/\/(select|open|open-pdf|note)\/([^?#]*)(?:\?([^#]*))?/.exec(url);
        if (!m) return null;
        const host = m[1];
        const parts = m[2].split("/").filter(Boolean);
        const q = new Map<string, string>();
        if (m[3]) for (const kv of m[3].split("&")) {
            const i = kv.indexOf("=");
            if (i > 0) q.set(decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1)));
        }
        let lib: "user" | number = "user";
        let rest = parts;
        if (host === "note") {
            // zotero://note/<libToken>/<key>/
            const key = parts[parts.length - 1];
            const tok = parts.length >= 2 ? parts[parts.length - 2] : "u";
            if (!key) return null;
            if (tok === "g" || tok === "groups") {
                // zotero://note/g/<gid>/<key>: the key is last, the gid before it.
                return null;
            }
            if (/^\d+$/.test(tok)) lib = Number(tok);
            if (parts.length >= 3 && (parts[0] === "g" || parts[0] === "groups") && /^\d+$/.test(parts[1])) lib = Number(parts[1]);
            return { lib, keys: [key], annotationKey: null, page: null };
        }
        if (rest[0] === "groups" || rest[0] === "g") {
            if (!/^\d+$/.test(rest[1] || "")) return null;
            lib = Number(rest[1]);
            rest = rest.slice(2);
        }
        else if (rest[0] === "library") rest = rest.slice(1);
        if (host === "select") {
            let keys: string[] = [];
            const ik = q.get("itemKey");
            if (ik) keys = ik.split(",").map(s => s.trim()).filter(Boolean);
            if (rest[0] === "items" && rest[1]) keys.push(rest[1]);
            else if ((rest[0] === "collections" || rest[0] === "searches") && rest[2] === "items" && rest[3]) keys.push(rest[3]);
            else if (rest[0] !== "items" && !keys.length) return null;
            if (!keys.length) return null;
            return { lib, keys, annotationKey: null, page: null };
        }
        // open / open-pdf
        let key: string | null = null;
        let page: string | null = q.get("page") || null;
        if (rest[0] === "items" && rest[1]) key = rest[1];
        else if (rest.length === 2 && /_/.test(rest[0]) && /^\d+$/.test(rest[1])) { key = rest[0]; page = rest[1]; }
        else if (rest.length === 1 && rest[0]) key = rest[0];
        if (!key) return null;
        return { lib, keys: [key], annotationKey: q.get("annotation") || null, page };
    }
    catch (e) { return null; }
}

/** One of Zotero's own references in a note's HTML: a citation (the cited
 *  items' URIs and locators) or a quoted annotation (the attachment's URI
 *  and the annotation's key), with where it sits and the text it reads as. */
export interface WvBlRef {
    ref: "citation" | "quote";
    at: number;
    len: number;
    label: string;
    cites?: { uri: string; locator: string | null }[];
    attachmentURI?: string;
    annotationKey?: string;
}

function wvBlDecodeAttr(v: string): any {
    try { return JSON.parse(decodeURIComponent(unescapeEntities(v))); } catch (e) { return null; }
}

/** Zotero's references in a note (note-editor schema/nodes.js): citations
 *  `<span class="citation" data-citation="…">` -- its text nests
 *  `span.citation-item`s, so the close is found by depth -- and quotes:
 *  `<span class="highlight|underline" data-annotation="…">` and an image
 *  annotation's `<img data-annotation="…">`. */
export function wvBlExtractRefs(html: string): WvBlRef[] {
    const out: WvBlRef[] = [];
    if (!html || (html.indexOf("data-citation") < 0 && html.indexOf("data-annotation") < 0)) return out;
    const open = /<(span|img)\b[^>]*?\bdata-(citation|annotation)\s*=\s*"([^"]*)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = open.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        const data = wvBlDecodeAttr(m[3]);
        if (!data) continue;
        let end = open.lastIndex;
        let inner = "";
        if (tag === "span") {
            const re = /<\/?span\b[^>]*>/gi;
            re.lastIndex = open.lastIndex;
            let depth = 1, t: RegExpExecArray | null;
            while (depth > 0 && (t = re.exec(html)) !== null) {
                depth += t[0][1] === "/" ? -1 : 1;
                if (depth === 0) { inner = html.slice(open.lastIndex, t.index); end = re.lastIndex; }
            }
            if (depth !== 0) continue;
            open.lastIndex = end;
        }
        const label = tag === "img" ? "[image]" : htmlToText(inner).trim();
        if (m[2].toLowerCase() === "citation") {
            const cites = (Array.isArray(data.citationItems) ? data.citationItems : [])
                .map((ci: any) => ({ uri: ci && Array.isArray(ci.uris) ? String(ci.uris[0] || "") : "", locator: ci && ci.locator != null && ci.locator !== "" ? String(ci.locator) : null }))
                .filter((c: any) => c.uri);
            if (cites.length) out.push({ ref: "citation", at: m.index, len: end - m.index, label, cites });
        }
        else if (data.attachmentURI || data.uri) {
            // `uri` and no `annotationKey`: a quote saved before note schema
            // v4 (note-editor schema/README.md) -- it names the file only.
            out.push({ ref: "quote", at: m.index, len: end - m.index, label, attachmentURI: String(data.attachmentURI || data.uri), annotationKey: String(data.annotationKey || "") });
        }
    }
    return out;
}

/** Start the before-side at its last sentence boundary, so the excerpt opens
 *  on the clause that holds the reference ("First … here. Then the link"
 *  -> "Then the link"); a link is never cut, nor the ellipsis kept. A
 *  full stop ends a sentence only before a capital or an opening quote or
 *  bracket, and never after an abbreviation: a citation's "2013, p. 1)"
 *  started an excerpt at "1)" (dev.51, the dev library). */
const CLAUSE_END = /(?:[.!?]\s+(?=[A-ZÀ-Þ“‘"'(\[])|;\s+)/g;
const CLAUSE_ABBREV = /(?:^|[\s(])(?:p|pp|al|cf|fig|figs|eq|eqs|vol|no|ch|sec|ref|refs|vs|etc|e\.g|i\.e|ca|approx|resp|Dr|Mr|Mrs|Ms|Prof|St)\.$/i;
function clauseStart(segs: WvBlSeg[]): WvBlSeg[] {
    const txt = segsText(segs);
    const re = new RegExp(CLAUSE_END.source, "g");
    let cutAt = -1, m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null) {
        if (m[0][0] === "." && CLAUSE_ABBREV.test(txt.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
        cutAt = m.index + m[0].length;
    }
    if (cutAt < 0) return segs;
    const out: WvBlSeg[] = [];
    let skip = cutAt;
    for (const s of segs) {
        if (skip <= 0) { out.push(s); continue; }
        if (s.t.length <= skip) { skip -= s.t.length; continue; }
        if (s.href) { out.push(s); skip = 0; continue; }
        out.push(Object.assign({}, s, { t: s.t.slice(skip) }));
        skip = 0;
    }
    return out;
}

/** A note as `getNote()` returns it, from its stored text: Zotero keeps
 *  every note in `itemNotes` wrapped in `<div class="zotero-note znvN">` ...
 *  `</div>` and drops the wrapper when it loads one (items.js, "Don't
 *  include <div> wrapper when returning value"). The startup scan read the
 *  stored text, so its positions sat 30 characters past the ones the hover
 *  card cuts its context from (`_wvBlWideSegs`), which then fell back to the
 *  short excerpt for every note until its first edit (2026-10-28). */
function blNoteText(stored: string): string {
    const m = /^<div class="zotero-note znv[0-9]+">/.exec(stored.slice(0, 36));
    return m && /<\/div>$/.test(stored) ? stored.slice(m[0].length, stored.length - 6) : stored;
}

/** Every zotero:// link in `text` as written, with its position: each one
 *  its own, the same address written twice included (MJT 2026-10-28, "Do
 *  one row per written link"; until then a repeat was dropped). In a note
 *  (`html`) an anchor's address is its href: its text is its label, even
 *  when the label spells an address out (`<a href=X>X</a>` is one link). */
export function wvBlExtractLinks(text: string, html = false): { url: string; at: number }[] {
    const out: { url: string; at: number }[] = [];
    if (!text || text.indexOf("zotero://") < 0) return out;
    const labels: Array<[number, number]> = [];
    if (html) {
        const ra = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
        let a: RegExpExecArray | null;
        while ((a = ra.exec(text)) !== null) {
            const s = a.index + a[0].length - a[1].length - 4;
            labels.push([s, s + a[1].length]);
        }
    }
    const re = new RegExp(urlPattern(schemeAltPart("zotero", "://")), "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index === re.lastIndex) re.lastIndex++;
        const url = m[0], at = m.index;
        if (!url || labels.some(([s, e]) => at >= s && at < e)) continue;
        out.push({ url, at });
    }
    return out;
}

/** Every scheme Weavero links but zotero:// (Item Links'): the web, the
 *  schemeless `www.`, every app scheme -- on or off in Settings; the counts
 *  keep the enabled ones at read time (`_wvExtOn`). */
const BL_EXT_ALT = joinSchemeAlt(["https?:\\/\\/", "\\bwww\\."].concat(URL_SCHEMES.map((d: any) => schemeAltPart(d.name, d.sep))));

/** The web and app links in a source's text, as written (the External
 *  Links column, MJT 2026-10-30): a note's link label is skipped, so a link
 *  whose text repeats its address counts once, by its href -- as
 *  wvBlExtractLinks counts a zotero:// one; trailing sentence punctuation
 *  is not part of a link. */
export function wvBlExtractExternal(text: string, html = false): { url: string; at: number }[] {
    const out: { url: string; at: number }[] = [];
    if (!text) return out;
    const labels: Array<[number, number]> = [];
    if (html) {
        const ra = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
        let a: RegExpExecArray | null;
        while ((a = ra.exec(text)) !== null) {
            const s = a.index + a[0].length - a[1].length - 4;
            labels.push([s, s + a[1].length]);
        }
    }
    const re = new RegExp(urlPattern(BL_EXT_ALT), "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index === re.lastIndex) re.lastIndex++;
        const url = m[0].replace(/[.,;:!?]+$/, ""), at = m.index;
        if (!url || labels.some(([s, e]) => at >= s && at < e)) continue;
        out.push({ url, at });
    }
    return out;
}

/** One run of an excerpt: text, or a link as written (`href` set), the
 *  matching link flagged `hit`. A note's colours on it: `bg` its background,
 *  `ul` an underline ("" uncoloured, else its colour). `cite`: a run of the
 *  note citation the excerpt is about (outlined as one, `blDrawSegs`). */
export interface WvBlSeg { t: string; href?: string; hit?: boolean; bg?: string; ul?: string; cite?: boolean }

/** Bare URLs in plain text (an annotation comment, a note's unlinked
 *  text): any scheme://, plus mailto:; trailing sentence punctuation is
 *  not part of the link. */
const BARE_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'\]]+|\bmailto:[^\s<>"'\]]+/gi;

function textSegs(s: string): WvBlSeg[] {
    const out: WvBlSeg[] = [];
    if (!s) return out;
    const re = new RegExp(BARE_URL.source, "gi");
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
        let url = m[0];
        const trail = /[.,;:!?)]+$/.exec(url);
        if (trail) url = url.slice(0, url.length - trail[0].length);
        if (!url) continue;
        if (m.index > last) out.push({ t: s.slice(last, m.index) });
        out.push({ t: url, href: url });
        last = m.index + url.length;
        re.lastIndex = last;
    }
    if (last < s.length) out.push({ t: s.slice(last) });
    return out;
}

/** A note's HTML as runs: anchors become links labelled as the reader sees
 *  them, the rest text (bare URLs in it still links). Each run keeps the
 *  colours the note gives it -- a background, an underline and its colour,
 *  Zotero's note editor's backgroundColor and underline marks
 *  (note-editor schema/marks.js: `<span style="background-color: …">`,
 *  `<u style="text-decoration-color: …">`), what "Show Annotation Colors"
 *  writes on the annotations it adds -- so an excerpt draws them as the note
 *  does (MJT 2026-11-02, "Can you also display the Note Citations color
 *  same as in the note?" -> "All, like the note"). A tag the slice cut open
 *  at its start was dropped by the caller; one left open at its end colours
 *  to the end. */
function htmlSegs(h: string): WvBlSeg[] {
    const out: WvBlSeg[] = [];
    const open: Array<{ tag: string; bg?: string; ul?: string }> = [];
    const push = (segs: WvBlSeg[]) => {
        let bg: string | undefined, ul: string | undefined;
        for (const o of open) { if (o.bg) bg = o.bg; if (o.ul != null) ul = o.ul; }
        for (const s of segs) {
            const r: WvBlSeg = Object.assign({}, s);
            if (bg) r.bg = bg;
            if (ul != null) r.ul = ul;
            const prev = out[out.length - 1];
            // Plain runs of one look are one run (a citation's inner
            // `citation-item` span split "(Shah, 2024)" into three).
            if (prev && !prev.href && !r.href && prev.bg === r.bg && prev.ul === r.ul) prev.t += r.t;
            else out.push(r);
        }
    };
    const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
    let last = 0, m: RegExpExecArray | null;
    let a: { href: string; from: number } | null = null;
    while ((m = re.exec(h)) !== null) {
        const close = m[1] === "/", tag = m[2].toLowerCase(), attrs = m[3];
        if (a) {
            if (close && tag === "a") {
                const label = htmlToText(h.slice(a.from, m.index));
                if (label.trim()) push([{ t: label, href: a.href }]);
                a = null;
                last = re.lastIndex;
            }
            continue;
        }
        if (m.index > last) push(textSegs(htmlToText(h.slice(last, m.index))));
        last = re.lastIndex;
        if (tag === "a") {
            const hm = close ? null : /\bhref\s*=\s*"([^"]*)"/i.exec(attrs);
            if (hm) a = { href: unescapeEntities(hm[1]), from: re.lastIndex };
            continue;
        }
        // Where htmlToText puts a space: a line break, a block's end.
        if (tag === "br" || (close && /^(p|div|li|h\d|blockquote|tr)$/.test(tag))) { push([{ t: " " }]); continue; }
        if (tag !== "span" && tag !== "u") continue;
        if (close) {
            for (let i = open.length - 1; i >= 0; i--) if (open[i].tag === tag) { open.splice(i, 1); break; }
            continue;
        }
        const st = unescapeEntities((/\bstyle\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || "");
        const bg = (/background-color\s*:\s*([^;]+)/i.exec(st) || [])[1];
        const dc = (/text-decoration-color\s*:\s*([^;]+)/i.exec(st) || [])[1];
        open.push({ tag, bg: bg ? bg.trim() : undefined, ul: tag === "u" ? (dc ? dc.trim() : "") : undefined });
    }
    if (a) push(textSegs(htmlToText(h.slice(a.from))));
    else if (last < h.length) push(textSegs(htmlToText(h.slice(last))));
    return out;
}

const segsText = (segs: WvBlSeg[]) => segs.map(s => s.t).join("");

/** Keep the last (`fromEnd`) or first `n` visible characters, cut on a word,
 *  with an ellipsis where text was dropped. A link is kept whole or not at
 *  all: cut, it showed as a fragment ("otero.org", "zotero://select/libra"
 *  on the dev library, 2026-10-23). `edgeCut`: the raw window itself ended
 *  inside the text, so its far-edge word (or link) is partial and goes. */
function trimSegs(segs: WvBlSeg[], n: number, fromEnd: boolean, edgeCut: boolean): WvBlSeg[] {
    const list = fromEnd ? segs.slice().reverse() : segs.slice();
    if (edgeCut && list.length) {
        const k = list.length - 1, s = list[k];
        const i = fromEnd ? s.t.indexOf(" ") : s.t.lastIndexOf(" ");
        if (s.href || i < 0) list.pop();
        else list[k] = Object.assign({}, s, { t: fromEnd ? s.t.slice(i + 1) : s.t.slice(0, i) });
    }
    const kept: WvBlSeg[] = [];
    let acc = 0, cut = edgeCut;
    for (const s of list) {
        if (acc + s.t.length <= n) { kept.push(s); acc += s.t.length; continue; }
        cut = true;
        if (s.href) break;
        // Text: cut at a space, never inside a word ("Coll …", "App lin …"
        // ended dev.17's excerpts); a piece with no space is all half word.
        const room = n - acc;
        let t = fromEnd ? s.t.slice(s.t.length - room) : s.t.slice(0, room);
        const i = fromEnd ? t.indexOf(" ") : t.lastIndexOf(" ");
        t = i < 0 ? "" : fromEnd ? t.slice(i + 1) : t.slice(0, i);
        if (t.trim()) kept.push(Object.assign({}, s, { t }));
        break;
    }
    const out = fromEnd ? kept.reverse() : kept;
    if (cut) { if (fromEnd) out.unshift({ t: "… " }); else out.push({ t: " …" }); }
    return out;
}

/** The words around a link, drawn as the source shows them (MJT
 *  2026-10-23: "Better show the links as they appear in the original
 *  place"): a note link by its label, a bare URL as typed, the other links
 *  of the window kept as links. Until then the match was an invented
 *  "⟨link⟩" and every other zotero:// link was cut to "zotero://…" -- in a
 *  note whose link label IS the URL that read "⟨link⟩ zotero://…", the
 *  same link twice. `n` visible characters each side, cut on a word. */
export interface WvBlExcerptOpts {
    /** Characters after the reference (default: `n`, the before-side's). */
    after?: number;
    /** Start the before-side at its last sentence boundary. */
    clause?: boolean;
    /** The reference's text when it is not a link (a citation, a quote): the
     *  span `at`..`at + len` is replaced by it, highlighted, not a link. */
    label?: string;
}

export function wvBlExcerpt(text: string, at: number, len: number, html: boolean, n = BL_EXCERPT, opts: WvBlExcerptOpts = {}): { before: string; after: string; segs: WvBlSeg[] } {
    const href = text.slice(at, at + len);
    const nAfter = opts.after != null ? opts.after : n;
    const W = Math.max(n, nAfter) * (html ? 8 : 3);   // raw window: a note's markup is dense
    let label = opts.label != null ? opts.label : (html ? unescapeEntities(href) : href);
    const isRef = opts.label != null;
    let before: WvBlSeg[], after: WvBlSeg[], beforeCut: boolean, afterCut: boolean;
    if (html) {
        // The anchor the address sits in (`<a ... href="URL" ...>label</a>`):
        // the match is its label, the sides start outside it.
        let start = at, end = at + len;
        const open = isRef ? -1 : text.lastIndexOf("<a", at);
        const gt = open >= 0 ? text.indexOf(">", open) : -1;
        const close = gt >= 0 ? text.indexOf("</a>", gt) : -1;
        if (open >= 0 && /^<a\b/i.test(text.slice(open, open + 3)) && gt >= at + len && close > gt) {
            const l = htmlToText(text.slice(gt + 1, close)).trim();
            if (l) label = l;
            start = open; end = close + 4;
        }
        // Drop the partial tag a side was cut inside of (`ass="citation-item">`
        // led an excerpt on the dev library, 2026-10-22). A quote's or a
        // citation's attribute runs to hundreds of characters (464 on the
        // dev library): the window widens until it holds the text it needs,
        // else a side ended after a word or two, on a dangling "(" (dev.50).
        let wb = W, wa = W;
        for (;;) {
            before = htmlSegs(text.slice(Math.max(0, start - wb), start).replace(/^[^<]*>/, ""));
            if (start - wb <= 0 || segsText(before).length > n + 20 || wb > 1 << 16) break;
            wb *= 2;
        }
        for (;;) {
            after = htmlSegs(text.slice(end, end + wa).replace(/<[^>]*$/, ""));
            if (end + wa >= text.length || segsText(after).length > nAfter + 20 || wa > 1 << 16) break;
            wa *= 2;
        }
        beforeCut = start - wb > 0; afterCut = end + wa < text.length;
    }
    else {
        before = textSegs(text.slice(Math.max(0, at - W), at));
        after = textSegs(text.slice(at + len, at + len + W));
        beforeCut = at - W > 0; afterCut = at + len + W < text.length;
    }
    const squash = (segs: WvBlSeg[]) => segs.map(s => Object.assign({}, s, { t: s.t.replace(/\s+/g, " ") })).filter(s => s.t);
    before = trimSegs(squash(before), n, true, beforeCut);
    if (opts.clause) before = clauseStart(before);
    after = trimSegs(squash(after), nAfter, false, afterCut);
    if (before.length) before[0] = Object.assign({}, before[0], { t: before[0].t.replace(/^\s+/, "") });
    if (after.length) { const k = after.length - 1; after[k] = Object.assign({}, after[k], { t: after[k].t.replace(/\s+$/, "") }); }
    // A citation or an annotation in a note: its own runs, in the note's
    // colours (the annotation coloured, the citation after it plain, MJT
    // 2026-11-02), flagged as the one this excerpt is about; its label when
    // it holds no text (an annotation's image).
    let hit: WvBlSeg[] = [];
    if (isRef && html) hit = squash(htmlSegs(text.slice(at, at + len))).map(s => Object.assign(s, { hit: true, cite: true }));
    if (!segsText(hit).trim()) hit = [isRef ? { t: label, hit: true, cite: true } : { t: label, href: html ? unescapeEntities(href) : href, hit: true }];
    else { hit[0].t = hit[0].t.replace(/^\s+/, ""); const k = hit.length - 1; hit[k].t = hit[k].t.replace(/\s+$/, ""); }
    const segs = [...before, ...hit, ...after].filter(s => s.t);
    return { before: segsText(before).trim(), after: segsText(after).trim(), segs };
}

/** The DOM range of a link inside a note editor's content: the anchor whose
 *  href is `url`, else `url` written as text. A citation is the
 *  `[data-citation]` citing `url` (the item URI); a quote the
 *  `[data-annotation]` whose annotation key `url` names ("annotation:KEY"):
 *  the editor keeps both attributes in its DOM (note-editor schema/nodes.js
 *  toDOM). */
/** The `nth` reference (0 = the first) of the note editor's text with this
 *  `ref` and `url`, in the note's order -- the order the index numbered them
 *  in (`nth`): an anchor by its href, an address typed outside any anchor;
 *  the first when the note now has fewer. */
function wvBlFindInNote(root: any, url: string, ref: WvBacklinkSource["ref"] = "link", nth = 0, joined = false): any {
    const doc = root.ownerDocument;
    const found: any[] = [];
    if (ref !== "link") {
        const sel = ref === "citation" ? "[data-citation]" : "[data-annotation]";
        for (const el of root.querySelectorAll(sel)) {
            const d = wvBlDecodeAttr(el.getAttribute(ref === "citation" ? "data-citation" : "data-annotation") || "");
            if (!d) continue;
            const hit = ref === "citation"
                ? (Array.isArray(d.citationItems) && d.citationItems.some((ci: any) => ci && Array.isArray(ci.uris) && ci.uris.indexOf(url) >= 0))
                : ("annotation:" + (d.annotationKey || "")) === url;
            if (!hit) continue;
            const r = doc.createRange();
            if (el.localName === "img") r.selectNode(el); else r.selectNodeContents(el);
            // A quote read with its citation (`joined`): the citation after it too.
            if (joined) {
                let nx = el.nextSibling;
                while (nx && nx.nodeType === 3 && !/\S/.test(String(nx.textContent).replace(/ /g, " "))) nx = nx.nextSibling;
                if (nx && nx.nodeType === 1 && nx.hasAttribute && nx.hasAttribute("data-citation")) r.setEndAfter(nx);
            }
            found.push(r);
        }
        return found[nth] || found[0] || null;
    }
    const tw = doc.createTreeWalker(root, 1 | 4 /* NodeFilter.SHOW_ELEMENT | SHOW_TEXT */);
    let node: any;
    while ((node = tw.nextNode())) {
        if (node.nodeType === 1) {
            if (node.localName === "a" && unescapeEntities(node.getAttribute("href") || "") === url) {
                const r = doc.createRange();
                r.selectNodeContents(node);
                found.push(r);
            }
            continue;
        }
        if (node.parentElement && node.parentElement.closest("a")) continue;
        const v = String(node.nodeValue || "");
        for (let i = v.indexOf(url); i >= 0; i = v.indexOf(url, i + url.length)) {
            const r = doc.createRange();
            r.setStart(node, i);
            r.setEnd(node, i + url.length);
            found.push(r);
        }
    }
    return found[nth] || found[0] || null;
}

/** A highlighter-yellow flash over `range` (Zotero's yellow annotation
 *  colour), fixed-positioned above the editor and repainted while the note
 *  scrolls, fading out after 1.6 s. */
function wvBlFlash(iwin: any, range: any) {
    const doc = iwin.document;
    const layer = doc.createElement("div");
    layer.className = "wv-bl-flash";
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;";
    const paint = () => {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
        for (const rc of Array.from(range.getClientRects()) as any[]) {
            const b = doc.createElement("div");
            b.style.cssText = "position:fixed;left:" + (rc.left - 2) + "px;top:" + (rc.top - 1) + "px;width:" + (rc.width + 4)
                + "px;height:" + (rc.height + 2) + "px;border-radius:3px;background:rgba(255,212,0,0.45);transition:opacity 0.6s;";
            layer.appendChild(b);
        }
    };
    paint();
    (doc.body || doc.documentElement).appendChild(layer);
    const onScroll = () => { try { paint(); } catch (e) {} };
    iwin.addEventListener("scroll", onScroll, true);
    iwin.setTimeout(() => { for (const b of Array.from(layer.children) as any[]) b.style.opacity = "0"; }, 1600);
    iwin.setTimeout(() => { try { iwin.removeEventListener("scroll", onScroll, true); layer.remove(); } catch (e) {} }, 2400);
}

/** An excerpt's runs into `parent`: text; links as the source shows them,
 *  in their kind's colour; the reference pointing here highlighted like a
 *  search hit (a citation or a quote is no link: highlighted text). */
function blDrawSegs(doc: any, parent: any, segs: WvBlSeg[]) {
    // A run's note colours, set through the style object: the note's value
    // is parsed as a colour or dropped, never markup.
    const paint = (el: any, s: WvBlSeg) => {
        if (s.bg) el.style.backgroundColor = s.bg;
        if (s.ul != null) { el.style.textDecorationLine = "underline"; if (s.ul) el.style.textDecorationColor = s.ul; }
        return el;
    };
    // The note citation this excerpt is about: its runs in one outlined box,
    // their own colours inside it (MJT 2026-11-02, "All, like the note").
    let box: any = null;
    for (const s of segs || []) {
        let host = parent;
        if (s.cite) { if (!box) box = wvHtmlEl(doc, "span", "wv-bl-hit wv-bl-hit-cite", undefined, parent); host = box; }
        else box = null;
        if (!s.href) {
            if (s.hit && !s.cite) wvHtmlEl(doc, "span", "wv-bl-hit", s.t, host);
            else if (s.bg || s.ul != null) paint(wvHtmlEl(doc, "span", "wv-bl-note-mark", s.t, host), s);
            else host.appendChild(doc.createTextNode(s.t));
            continue;
        }
        let kind = "wv-link-zotero";
        try { kind = urlLinkClass(s.href) || kind; } catch (e) {}
        paint(wvHtmlEl(doc, "span", "wv-bl-link " + kind + (s.hit && !s.cite ? " wv-bl-hit" : ""), s.t, host), s);
    }
}

/** An attachment's kind in words: the reader's type, else file / attachment. */
/** Better Notes' position inside a note link -- `zotero://note/...?line=3`
 *  (its line index) or `?section=Name` -- worded as BN's own Outbound
 *  Links shows it ("Line 3", "#Name"; the section wins when both are set;
 *  BN fork, workspace/link.ts): "line 3", "#Name", or "". */
function blNotePos(url: string): string {
    try {
        const m = /^zotero:\/\/note\/[^?#]*\?([^#]*)/.exec(unescapeEntities(String(url || "")));
        if (!m) return "";
        let line = "", section = "", heading = false;
        for (const kv of m[1].split("&")) {
            const i = kv.indexOf("=");
            if (i <= 0) continue;
            const k = decodeURIComponent(kv.slice(0, i)), v = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
            if (k === "section" && v) section = v;
            else if (k === "line" && /^\d+$/.test(v)) line = v;
            else if (k === "wvheading" && v) heading = true;
        }
        return section ? "#" + section : line ? "line " + line : heading ? "heading" : "";
    }
    catch (e) { return ""; }
}

function blAttKind(att: any): string {
    let t: any = "";
    try { t = att.attachmentReaderType || ""; } catch (e) {}
    if (t === "pdf") return "PDF";
    if (t === "epub") return "EPUB";
    if (t === "snapshot") return "snapshot";
    try { return att.isFileAttachment && att.isFileAttachment() ? "file" : "attachment"; } catch (e) { return "attachment"; }
}

/** Which file an annotation sits in, as " (Full Text PDF)", when its paper
 *  has more than one file attachment -- "Annotation p. 1" alone does not
 *  say which (MJT 2026-10-27, on a paper with a PDF, an EPUB and an image:
 *  "I do not see the information on which attachment the annotation belongs
 *  to"). "" for a paper with one file, and for a standalone attachment,
 *  whose title heads the row anyway. */
/** An annotation's annotated text, one run of spaces; "" for anything else. */
/** A row's `targetHl`: the highlighted text and colour of the annotation it
 *  is aimed at; null when the target is no annotation, has no text (an
 *  image, an ink), or is the row's own reference point -- the item a section
 *  or a by-part heading already names. */
export function wvBlTargetHl(target: any, ref: any): { text: string; color: string } | null {
    try {
        if (!target || !(target.isAnnotation && target.isAnnotation())) return null;
        if (ref && target.id === ref.id) return null;
        const t = String(target.annotationText || "").replace(/\s+/g, " ").trim();
        return t ? { text: t, color: String(target.annotationColor || "") } : null;
    } catch (e) { return null; }
}

function blAnnText(item: any): string {
    try { return (item && item.isAnnotation && item.isAnnotation()) ? String(item.annotationText || "").replace(/\s+/g, " ").trim() : ""; }
    catch (e) { return ""; }
}

/** From an item's paper down to the item -- [paper, file, annotation],
 *  [paper, note], [file, annotation] or [item] -- what the lineage card
 *  draws, one node per step. */
function blLineage(item: any): any[] {
    const out: any[] = [];
    let it = item, guard = 0;
    try {
        while (it && guard++ < 4) {
            out.unshift(it);
            if (!it.parentItemID) break;
            it = Zotero.Items.get(it.parentItemID);
        }
    } catch (e) {}
    return out;
}

/** Zotero's own "Page" (reader.ftl `reader-page`), the word the reader's
 *  annotation header puts before the page label. */
function blReaderPage(): string {
    try { const s = (Zotero as any).ftl?.formatValueSync?.("reader-page"); if (s) return String(s); } catch (e) {}
    return "Page";
}

/** Who wrote an annotation, as Zotero hands it to the reader
 *  (xpcom/annotations.js toJSONSync): its stored author name -- imported,
 *  so not authoritative, which the reader dims --, else in a group the user
 *  who created it; nobody in a personal library. */
function blAnnAuthor(item: any): { name: string; authoritative: boolean } {
    try {
        if (item.annotationAuthorName) return { name: String(item.annotationAuthorName), authoritative: false };
        if (!item.annotationIsExternal && item.library && item.library.libraryType === "group" && item.createdByUserID) {
            const n = Zotero.Users.getName(item.createdByUserID);
            if (n) return { name: String(n), authoritative: true };
        }
    } catch (e) {}
    return { name: "", authoritative: false };
}

/** A window too narrow for the lineage card's two columns side by side:
 *  they stack (`wv-bl-card-stack`). */
function blCardStacked(win: any): boolean {
    try { return win.innerWidth - 16 < 480; } catch (e) { return false; }
}

const BL_READER_TYPES = ["application/pdf", "application/epub+zip", "text/html"];

/** An annotation's file title, when its paper has several files Zotero
 *  annotates and this one is not the paper's default attachment; ""
 *  otherwise. The default is what a double-click opens -- Weavero's chosen
 *  child, else Zotero's own pick (pane.ts _wvGetBestAttachmentSync) -- and
 *  an annotation usually lives there, so only the others name their file
 *  (MJT 2026-11-02, "as the annotation usually lives in the main
 *  attachment, I would put the name of the attachment only when it is not
 *  the default attachment"; every file was named once the paper had
 *  several, dev.64-159). Named for the shown item's own parts (its
 *  headings, its end of a row, the chips aimed at it); the other end of a
 *  row carries no file at all (`_wvBlEnd`). */
function blAttFile(ann: any): string {
    try {
        if (!ann || !ann.isAnnotation || !ann.isAnnotation()) return "";
        const att = Zotero.Items.get(ann.parentItemID);
        if (!att || !att.parentItemID) return "";
        const paper = Zotero.Items.get(att.parentItemID);
        if (!paper || !paper.getAttachments) return "";
        // Only the files Zotero annotates (MJT 2026-10-30): a Word file or a
        // spreadsheet beside the PDF holds no annotation, so it leaves no
        // doubt which file one is in. item.js attachmentReaderType's content
        // types, read directly so the rule holds on every supported Zotero.
        let files = 0;
        for (const id of paper.getAttachments() || []) {
            const a = Zotero.Items.get(id);
            if (a && a.isFileAttachment && a.isFileAttachment() && BL_READER_TYPES.includes(a.attachmentContentType)) files++;
        }
        if (files <= 1) return "";
        try {
            const lp: any = wvLivePlugin();
            const best = lp && typeof lp._wvGetBestAttachmentSync === "function" ? lp._wvGetBestAttachmentSync(paper) : null;
            if (best && best.id === att.id) return "";
        } catch (e) {}
        return String(att.getDisplayTitle() || blAttKind(att)).replace(/\s+/g, " ").trim();
    } catch (e) { return ""; }
}

/** The same, as a name's suffix: " (Full Text PDF)". */
function blAttOf(ann: any): string {
    const t = blAttFile(ann);
    return t ? " (" + t + ")" : "";
}

/** The arrow at the start of an item-pane row's second line, in the 16-px
 *  column under the first line's icon: "down" from the line above to this
 *  one (Links: the source to its target), "up" from this one to the line
 *  above (Backlinks: the source to this item). ONE drawing -- the stem
 *  from the line above, the corner, the run towards this line, traced
 *  either way -- with the same head on the TARGET's side: at the run's end
 *  pointing at this line (down), on top of the stem pointing at the line
 *  above (up). MJT
 *  2026-11-03 ("I would expect the design of the link and backlink arrows
 *  in the item pane to be exactly the same, except the direction of the
 *  arrow. They feel different now") and 2026-11-04 ("The arrow should
 *  still be on the target side", after dev.5 put the up arrow's head at
 *  the corner's end pointing back): until dev.4 the up arrow had its own
 *  stem, from the right and only up to the head. SVG by createElementNS:
 *  chrome documents sanitize markup.
 *  `mark`: the reference's kind, which colours the arrow -- a Zotero
 *  link's in the Zotero links' colour (`--wv-link-zotero`, the colour its
 *  address is written in everywhere), a note citation's in the arrow's
 *  usual grey (MJT 2026-11-03, "The arrows are still not clear. Go back
 *  to the old design, except that you will use the zotero links color on
 *  the arrows for Zotero links and backlinks, while keeping white for the
 *  Note Citations"). Before that, dev.162-167 drew a z or a quote mark
 *  beside, then inside the cell, each try either crowding the row or
 *  hiding the arrow; the row-end kind marks had gone in dev.121-123 ("too
 *  much"). The header's kind counts and the card's arrow keep the marks. */
function blArrow(doc: any, dir: "down" | "up", mark?: WvRefMark | null): any {
    const NS = "http://www.w3.org/2000/svg";
    const span = wvHtmlEl(doc, "span", "wv-bl-arrow");
    span.dataset.dir = dir;
    if (mark) span.dataset.mark = mark;
    span.setAttribute("aria-hidden", "true");
    const svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    const line = doc.createElementNS(NS, "path");
    // The same polyline both ways, (7.5,1) - (7.5,9.5) - (15,9.5), the head
    // filling its last 3 px at the target's end.
    line.setAttribute("d", dir === "down" ? "M7.5 1V9.5H12" : "M15 9.5H7.5V4");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    const head = doc.createElementNS(NS, "path");
    head.setAttribute("d", dir === "down" ? "M15 9.5L12 7V12Z" : "M7.5 1L5 4H10Z");
    head.setAttribute("fill", "currentColor");
    svg.appendChild(line);
    svg.appendChild(head);
    span.appendChild(svg);
    return span;
}

/** Hide `doc`'s hover card; true when it was showing. */
/** Where a card for `el` opens: the chrome document around it, with the
 *  offsets of the frames on the way -- a row in a frame (the reader's
 *  iframe, which draws an annotation's relations popup in a reader tab)
 *  opens its card in the window holding that frame. A frame's HTML
 *  document has neither Zotero's interface font nor its icon styles: the
 *  card drew there in a serif, the items' icons missing (MJT 2026-11-02,
 *  "The font is not consistent with the item pane"). */
const BL_XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
function blCardHost(el: any): { doc: any; win: any; dx: number; dy: number } {
    let doc = el.ownerDocument || el, win = doc.defaultView, dx = 0, dy = 0;
    try {
        for (let i = 0; i < 4 && doc.documentElement && doc.documentElement.namespaceURI !== BL_XUL_NS; i++) {
            // A content frame's `frameElement` reads null; its browsing
            // context still names the element it is embedded in.
            const fe = win && (win.frameElement || (win.browsingContext && win.browsingContext.embedderElement));
            if (!fe) break;
            const r = fe.getBoundingClientRect();
            dx += r.left + (fe.clientLeft || 0);
            dy += r.top + (fe.clientTop || 0);
            doc = fe.ownerDocument;
            win = doc.defaultView;
        }
    } catch (e) {}
    return { doc, win, dx, dy };
}

/** Hide the card shown for a row of `doc`: in `doc` itself, or in the
 *  chrome document a frame's row opens its card in (`blCardHost`). */
function blCardHide(doc: any): boolean {
    let hid = false;
    try {
        if (!doc) return false;
        const host = blCardHost(doc.documentElement || doc).doc;
        for (const d of host && host !== doc ? [doc, host] : [doc]) {
            const c = d.getElementById(BL_CARD_ID);
            if (c && !c.hidden) { c.hidden = true; hid = true; }
        }
    } catch (e) {}
    return hid;
}

function blCardRemove(doc: any) {
    try { const c = doc && doc.getElementById(BL_CARD_ID); if (c) c.remove(); } catch (e) {}
}

/** Per-document section bodies and their refresh callbacks (the Backlinks
 *  and Links sections both; every body re-renders when the index moves). */
const blBodies: Map<any, () => Promise<void>> = new Map();
export function wvBlBodyRegister(body: any, refresh: () => Promise<void>) { blBodies.set(body, refresh); }
export function wvBlBodyForget(body: any) { blBodies.delete(body); }
/** Re-render every Links and Backlinks body inside `root` (a section, a
 *  window's document) -- its header counts' filter moved, pane-scope.ts. */
export function wvBlBodyRefreshIn(root: any): Promise<void> {
    const ps: Promise<void>[] = [];
    for (const [body, refresh] of Array.from(blBodies.entries())) {
        try { if (body.isConnected && root && root.contains(body)) ps.push(Promise.resolve(refresh())); } catch (e) {}
    }
    return Promise.all(ps).then(() => undefined, () => undefined);
}
export { blCardHide as wvBlCardHide, blCardHost as wvBlCardHost, blDrawSegs as wvBlDrawSegs, htmlToText as wvBlHtmlToText, blAttOf as wvBlAttOf, blAttFile as wvBlAttFile, blAnnText as wvBlAnnText };

/** One line of an item-pane row: an item drawn as Zotero's Related section
 *  draws one (its icon, its display title), and what else the link says. */
export interface WvBlEnd { icon: any; main: string; chip?: string; file?: string }

/** What `_wvBlMakeRow` draws and wires. */
export interface WvBlRowOpts {
    /** Classes after `wv-bl-row`. */
    cls: string;
    /** A popup row: the icon, its title line (a Links row's), label, chip. */
    icon?: any;
    head?: string | null;
    label?: string;
    chip?: string;
    /** An item-pane row instead: where the reference is written (`from`)
     *  and where it points (`to`), the CURRENT item's end first (`lead`:
     *  Links' source, Backlinks' target), the other under it after the arrow
     *  -- down from the source, up from it to the target (MJT 2026-10-29,
     *  "the logic for all sections is to show the current item as first
     *  line and then the other one as second line. Just change the
     *  direction of the link arrow"). `cont`: the row above leads with the
     *  same end, which is not named again ("so that the backlinks to the
     *  same item get grouped"). `mark`: the reference's kind, the arrow's
     *  colour (blArrow, 2026-11-03). (A `solo` row -- the other end alone, no
     *  arrow, for the item's own rows listed alone -- went in dev.172: those
     *  rows keep "This item" and their arrows, MJT 2026-11-03.) */
    pair?: { from: WvBlEnd; to: WvBlEnd; lead: "from" | "to"; cont?: boolean; mark?: WvRefMark | null };
    /** The annotated text when the row's source is an annotation: drawn
     *  quoted above the comment's excerpt (MJT 2026-10-27, "show also the
     *  annotated text for annotations, on top of the annotation comment"). */
    annText?: string;
    segs: WvBlSeg[];
    /** The item-pane section's rows carry neither the annotated text nor
     *  the excerpt: at the pane's width the two-line clamp shows little but
     *  the address (MJT 2026-10-27, "showing the link or backlink preview
     *  directly in the item pane is not useful, as it is too small"); both
     *  stay in the card and in the count popups. */
    compact?: boolean;
    /** The highlighted text of the annotation the row is aimed at (its
     *  "→ annotation p. N" chip): one clipped line with a bar in its colour
     *  (MJT 2026-10-28, "I cannot see in the item pane ... what is the
     *  highlighted text of the annotation"), in the popups only -- not in
     *  the compact item-pane rows ("no need to show the highlighted text in
     *  the item pane", the same day). `wvBlTargetHl`. */
    targetHl?: { text: string; color: string } | null;
    /** An internal link: the title of the item both ends are in, for the
     *  mark's tooltip (`wvBlInternalMark`) -- a popup row's; the item pane's
     *  rows carry none since 2026-10-30. */
    internal?: string | null;
    open: (newWindow: boolean) => any;
    menu: (ev: any) => void;
    card: (row: any) => void;
    onKey: (ev: any) => void;
}

class _BacklinksMixin {
    /** The index, created on first touch. */
    _wvBl(): WvBlIndex {
        const self: any = this;
        if (!self._wvBlIndex) {
            self._wvBlIndex = { byTarget: new Map(), bySource: new Map(), outBySource: new Map(), brokenByKey: new Map(), fwd: new Map(), extBySource: new Map(), seq: 0, built: false, building: null } as WvBlIndex;
        }
        return self._wvBlIndex;
    }

    _wvBlKey(lib: number, key: string): string { return lib + "/" + key; }

    _wvBlReady(): boolean { return this._wvBl().built; }

    /** Build the index once (concurrent callers share the build). */
    _wvBlEnsure(): Promise<void> {
        const ix = this._wvBl();
        if (ix.built) return Promise.resolve();
        if (ix.building) return ix.building;
        ix.building = (async () => {
            const self: any = this;
            try {
                await Zotero.Schema.schemaUpdatePromise;
                // The LIKE pattern is BOUND, as Zotero's own queries bind
                // theirs (db.js getNextName): an inline pattern was refused
                // on the dev instance ("Please enter a LIKE clause with
                // bindings", 2026-10-22) and the index came up empty.
                // Notes only: `itemNotes` also holds a file attachment's own
                // note, Zotero's legacy note shown read-only with a "convert
                // to note" button (attachmentBox.js). The live updates
                // (`_wvBlIndexSource`) and Has Link never read one; reading it
                // here alone left an attachment a source until the next
                // restart, beside the note it was converted into (2026-10-28).
                // Any link Weavero reads: "://" (zotero:// and the web and
                // most app schemes), a schemeless www., the bare-colon app
                // schemes (mailto:, tel:, ...) -- the External Links column's
                // too (2026-10-30; zotero:// and Zotero's citations alone
                // before).
                const linkPats = ["%://%", "%www.%"].concat(URL_SCHEMES.filter((d: any) => d.sep === ":").map((d: any) => "%" + d.name + ":%"));
                const like = (col: string, pats: string[]) => "(" + pats.map(() => col + " LIKE ?").join(" OR ") + ")";
                const notePats = linkPats.concat(["%data-citation=%", "%data-annotation=%"]);
                const notes: any[] = await Zotero.DB.queryAsync(
                    "SELECT n.itemID AS itemID, i.libraryID AS libraryID, n.parentItemID AS parentItemID, n.note AS text"
                    + " FROM itemNotes n JOIN items i USING (itemID)"
                    + " WHERE " + like("n.note", notePats) + " AND n.itemID NOT IN (SELECT itemID FROM deletedItems)"
                    + " AND n.itemID NOT IN (SELECT itemID FROM itemAttachments)",
                    notePats);
                const anns: any[] = await Zotero.DB.queryAsync(
                    "SELECT a.itemID AS itemID, i.libraryID AS libraryID, a.parentItemID AS parentItemID, a.comment AS text"
                    + " FROM itemAnnotations a JOIN items i USING (itemID)"
                    + " WHERE " + like("a.comment", linkPats) + " AND a.itemID NOT IN (SELECT itemID FROM deletedItems)", linkPats);
                if (self._wvDestroyed) return;
                const fwd: any[] = await Zotero.DB.queryAsync(
                    "SELECT i.libraryID AS libraryID, i.key AS key, r.object AS object"
                    + " FROM itemRelations r JOIN relationPredicates p USING (predicateID)"
                    + " JOIN items i USING (itemID) JOIN itemAnnotations a USING (itemID) WHERE p.predicate=?",
                    [(Zotero as any).Relations.replacedItemPredicate]);
                for (const r of fwd) ix.fwd.set(this._wvBlKey(r.libraryID, blUriKey(String(r.object))), r.key);
                for (const r of notes) this._wvBlIndexText(r.itemID, r.libraryID, r.parentItemID, r.parentItemID ? "itemNote" : "standaloneNote", blNoteText(String(r.text || "")));
                for (const r of anns) this._wvBlIndexText(r.itemID, r.libraryID, r.parentItemID, "annotation", String(r.text || ""));
                ix.built = true;
                ix.seq++;
                Zotero.debug("[Weavero] backlinks index built: " + ix.byTarget.size + " target(s) from " + ix.bySource.size + " source(s); "
                    + ix.extBySource.size + " source(s) with external links; " + (notes.length + anns.length) + " read");
            }
            catch (e) {
                Zotero.debug("[Weavero] backlinks index build err: " + e);
                ix.built = true;   // an empty index beats a build that never ends
            }
            finally {
                ix.building = null;
                this._wvBlChanged();
            }
        })();
        return ix.building;
    }

    /** The annotation that replaced `key`, or null. */
    _wvBlForwarded(lib: number, key: string): any {
        const k = this._wvBl().fwd.get(this._wvBlKey(lib, key));
        const it: any = k ? Zotero.Items.getByLibraryAndKey(lib, k) : null;
        return it && it.isAnnotation() ? it : null;
    }

    /** An annotation arriving with keys it replaces, from this reader or by
     *  sync: the sources naming them move onto it. */
    _wvBlFwdLearn(item: any): boolean {
        const ix = this._wvBl();
        const lib = item.libraryID, keys: string[] = [];
        for (const uri of item.getRelationsByPredicate((Zotero as any).Relations.replacedItemPredicate)) {
            const key = blUriKey(String(uri)), k = this._wvBlKey(lib, key);
            if (ix.fwd.get(k) !== item.key) { ix.fwd.set(k, item.key); keys.push(key); }
        }
        if (!keys.length) return false;
        const todo = new Set<number>();
        // Aimed at the erased annotation, at its file (what a link to a
        // missing annotation falls back on), or broken.
        for (const key of keys) {
            const k = this._wvBlKey(lib, key);
            for (const s of ix.byTarget.get(k) || []) todo.add(s.srcID);
            for (const id of ix.brokenByKey.get(k) || []) todo.add(id);
        }
        let file: any = null;
        try { file = item.parentItem; } catch (e) { file = null; }
        for (const s of (file && ix.byTarget.get(this._wvBlKey(lib, file.key))) || []) {
            if (keys.some(key => String(s.url || "").indexOf(key) >= 0)) todo.add(s.srcID);
        }
        for (const id of todo) { try { const it = Zotero.Items.get(id); if (it) this._wvBlIndexSource(it); } catch (e) {} }
        return true;
    }

    /** Forget a source's entries: its targets' lists and its outgoing
     *  references (the broken ones leave `brokenByKey` too). The outgoing
     *  list goes FIRST: a source with only broken references has no
     *  `bySource` row, and the early return would keep it. */
    _wvBlDropSource(srcID: number): boolean {
        const ix = this._wvBl();
        let had = false;
        if (ix.extBySource.delete(srcID)) had = true;
        const outs = ix.outBySource.get(srcID);
        if (outs) {
            for (const o of outs) {
                const bk = blBrokenKey(o);
                const s = bk ? ix.brokenByKey.get(bk) : null;
                if (s && bk) { s.delete(srcID); if (!s.size) ix.brokenByKey.delete(bk); }
            }
            ix.outBySource.delete(srcID);
            had = true;
        }
        const keys = ix.bySource.get(srcID);
        if (!keys) return had;
        for (const k of keys) {
            const list = ix.byTarget.get(k);
            if (!list) continue;
            const kept = list.filter(s => s.srcID !== srcID);
            if (kept.length) ix.byTarget.set(k, kept); else ix.byTarget.delete(k);
        }
        ix.bySource.delete(srcID);
        return true;
    }

    /** Index one source's text (its previous entries dropped first): each
     *  resolved reference into its target's list AND the source's outgoing
     *  list; an unresolved one into the outgoing list alone, marked (the
     *  Links section shows it greyed; nothing counts it). */
    _wvBlIndexText(srcID: number, libraryID: number, parentItemID: number | null, kind: WvBacklinkSource["kind"], text: string): number {
        const self: any = this;
        const ix = this._wvBl();
        this._wvBlDropSource(srcID);
        const html = kind !== "annotation";
        // The External Links column's (2026-10-30): addresses and places only.
        const ext = wvBlExtractExternal(text, html);
        // A note's address as read (`&amp;` -> `&`); its length as written,
        // which places the text around it.
        if (ext.length) ix.extBySource.set(srcID, ext.map(({ url, at }) => ({ url: html ? unescapeEntities(url) : url, at, len: url.length })));
        const links = wvBlExtractLinks(text, html);
        const refs = html ? wvBlExtractRefs(text) : [];
        if (!links.length && !refs.length) return 0;
        const top = (it: any) => { let p = it; try { while (p && p.parentItemID) p = Zotero.Items.get(p.parentItemID); } catch (e) {} return p; };
        // The item the source sits in; a standalone note is its own (its
        // links to itself are internal; its citations and quotes never
        // aim at it).
        let srcTop: any = null;
        try { srcTop = parentItemID ? top(Zotero.Items.get(parentItemID)) : Zotero.Items.get(srcID); } catch (e) { srcTop = null; }
        const targets: string[] = [];
        const outs: WvLkOut[] = [];
        // One entry per reference AS WRITTEN (MJT 2026-10-28, "Do one row per
        // written link"): the same target linked twice is two rows, each
        // with its own context and page; only a target named twice by ONE
        // reference (a citation cluster citing it twice) is one.
        const seen = new Set<string>();
        const add = (target: any, entry: WvBacklinkSource) => {
            const tKey = this._wvBlKey(target.libraryID, target.key);
            const sk = tKey + "|" + entry.ref + "|" + entry.at;
            if (seen.has(sk)) return;
            // A reference inside its own item is an internal link: counted as
            // any, its own paper and file included, and marked where it is
            // listed (MJT 2026-10-29, "I prefer counting all the internal
            // links in the links count. Try option 2 and also option 4 with
            // an icon"). A link typed or copied with a dragged annotation's
            // comment; a link to the source itself (MJT 2026-10-29, "if it is
            // in the library, there is no reason to exclude it"); and Zotero's
            // own citations and quotes in a child note of its paper -- "Add
            // Note from Annotations", a highlight dragged into the note (MJT
            // 2026-10-30, "I want all internal references to be added to the
            // internal links so that they are always displayed, and can be
            // hidden with the internal links toggle" -> counted, "(a)").
            // Those sat in an uncounted fold from dev.107 to dev.118.
            const within = !!srcTop && top(target) === srcTop;
            if (within) entry.internal = true;
            seen.add(sk);
            const list = ix.byTarget.get(tKey) || [];
            list.push(entry);
            ix.byTarget.set(tKey, list);
            if (targets.indexOf(tKey) < 0) targets.push(tKey);
            outs.push({ entry, tKey, lib: target.libraryID, group: null, key: target.key });
        };
        // A broken reference is a row per written reference too, as a
        // resolved one is.
        const broken = (entry: WvBacklinkSource, why: "library" | "missing", lib: number | null, group: number | null, key: string) => {
            const k = (lib != null ? String(lib) : "g" + group) + "/" + key + "|" + entry.ref + "|" + entry.at;
            if (!key || seen.has(k)) return;
            seen.add(k);
            outs.push({ entry, tKey: null, broken: why, lib, group, key });
        };
        for (const { url, at } of links) {
            const parsed = wvBlParseLink(url);
            if (!parsed) continue;
            let lib: number | null = null;
            try {
                lib = parsed.lib === "user" ? Zotero.Libraries.userLibraryID
                    : (Zotero.Groups.getLibraryIDFromGroupID(parsed.lib) || null);
            } catch (e) { lib = null; }
            const excerpt = wvBlExcerpt(text, at, url.length, html, BL_BEFORE, { after: BL_AFTER, clause: true });
            const entryFor = (): WvBacklinkSource => ({ srcID, kind, ref: "link", url, excerpt, page: parsed.page, locator: null, at, len: url.length });
            if (lib == null) {
                for (const rawKey of parsed.keys) broken(entryFor(), "library", null, parsed.lib === "user" ? null : parsed.lib, rawKey);
                continue;
            }
            for (const rawKey of parsed.keys) {
                let item: any = null;
                try { item = self._wvResolveItemByKey(lib, rawKey) || this._wvBlForwarded(lib, rawKey); } catch (e) { item = null; }
                if (!item) { broken(entryFor(), "missing", lib, null, rawKey); continue; }
                let target: any = item;
                if (parsed.annotationKey) {
                    let ann: any = null;
                    try { ann = Zotero.Items.getByLibraryAndKey(item.libraryID, parsed.annotationKey) || this._wvBlForwarded(item.libraryID, parsed.annotationKey); } catch (e) { ann = null; }
                    if (ann && ann.isAnnotation && ann.isAnnotation()) target = ann;
                }
                add(target, entryFor());
            }
        }
        // A URI's library, then its item: `getURIItemLibraryKey` answers
        // false for a library not in this profile (uri.js
        // _getURIObjectLibrary), which tells "library" from "missing".
        const byURI = (uri: string): { item: any; lib: number | null; key: string } => {
            try {
                const o = Zotero.URI.getURIItemLibraryKey(uri);
                if (!o || !o.key) return { item: null, lib: null, key: blUriKey(uri) };
                return { item: Zotero.Items.getByLibraryAndKey(o.libraryID, o.key) || this._wvBlForwarded(o.libraryID, o.key) || null, lib: o.libraryID, key: o.key };
            } catch (e) { return { item: null, lib: null, key: blUriKey(uri) }; }
        };
        const brokenURI = (entry: WvBacklinkSource, uri: string, got: { lib: number | null; key: string }) => {
            if (got.lib != null) broken(entry, "missing", got.lib, null, got.key);
            else broken(entry, "library", null, blUriGroup(uri), got.key);
        };
        for (let i = 0; i < refs.length; i++) {
            const r = refs[i];
            if (r.ref === "citation") {
                const excerpt = wvBlExcerpt(text, r.at, r.len, true, BL_BEFORE, { after: BL_AFTER, clause: true, label: r.label });
                for (const c of r.cites || []) {
                    const got = byURI(c.uri);
                    const entry: WvBacklinkSource = { srcID, kind, ref: "citation", url: c.uri, excerpt, page: null, locator: c.locator, at: r.at, len: r.len, label: r.label };
                    if (got.item) add(got.item, entry); else brokenURI(entry, c.uri, got);
                }
                continue;
            }
            const got = byURI(r.attachmentURI || "");
            let ann: any = null;
            try { ann = got.item && r.annotationKey ? (Zotero.Items.getByLibraryAndKey(got.item.libraryID, r.annotationKey) || this._wvBlForwarded(got.item.libraryID, r.annotationKey)) : null; } catch (e) { ann = null; }
            if (!(ann && ann.isAnnotation && ann.isAnnotation())) ann = null;
            // A quote with Zotero's citation of its paper right after it --
            // what "Add Note from Annotations" and a highlight dragged into a
            // note write -- is ONE reference, at the annotation, with the
            // citation's page (MJT 2026-10-30, "One reference" / "Under the
            // annotation"). Only spaces between them, the citation citing
            // that paper alone; else each stands alone (a quote whose
            // citation was hidden, a citation of another paper or of several).
            // A quote whose annotation is gone is aimed at its file and joins
            // all the same (dev library, 2026-10-30).
            const next = refs[i + 1];
            const quoted = ann || got.item;
            let cite: { uri: string; locator: string | null } | null = null;
            if (quoted && next && next.ref === "citation" && next.cites && next.cites.length === 1
                && /^(?:\s|&nbsp;|&#160;|&#xa0;)*$/i.test(text.slice(r.at + r.len, next.at))) {
                const cited = byURI(next.cites[0].uri).item;
                if (cited && top(quoted) === cited) cite = next.cites[0];
            }
            const len = cite ? next.at + next.len - r.at : r.len;
            const label = cite ? r.label + " " + next.label : r.label;
            const excerpt = wvBlExcerpt(text, r.at, len, true, BL_BEFORE, { after: BL_AFTER, clause: true, label });
            const entry: WvBacklinkSource = { srcID, kind, ref: "quote", url: "annotation:" + r.annotationKey, excerpt, page: null, locator: cite ? cite.locator : null, at: r.at, len, label };
            if (cite) { entry.joined = true; i++; }
            if (!quoted) { brokenURI(entry, r.attachmentURI || "", got); continue; }
            add(quoted, entry);
        }
        if (targets.length) ix.bySource.set(srcID, targets);
        outs.sort((a, b) => a.entry.at - b.entry.at);
        // Each reference's rank among the source's references with the same
        // `ref` and `url` (a multi-key link's entries share one): what opens
        // the note at THAT one.
        const ranks = new Map<string, number[]>();
        for (const o of outs) {
            const k = o.entry.ref + "|" + (o.entry.ref === "link" && html ? unescapeEntities(o.entry.url) : o.entry.url);
            const ats = ranks.get(k) || [];
            if (ats.indexOf(o.entry.at) < 0) ats.push(o.entry.at);
            ranks.set(k, ats);
            o.entry.nth = ats.indexOf(o.entry.at);
        }
        if (outs.length) {
            ix.outBySource.set(srcID, outs);
            for (const o of outs) {
                const bk = blBrokenKey(o);
                if (!bk) continue;
                const s = ix.brokenByKey.get(bk) || new Set<number>();
                s.add(srcID);
                ix.brokenByKey.set(bk, s);
            }
        }
        return targets.length;
    }

    /** The after-side's reach of a row's excerpt (specs size their text by it). */
    _wvBlExcerptAfter(): number { return BL_AFTER; }

    /** (Re)index a live note or annotation item; anything else is ignored. */
    _wvBlIndexSource(item: any): boolean {
        try {
            if (!item) return false;
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            const isNote = !!(item.isNote && item.isNote());
            if (!isAnn && !isNote) return false;
            if (item.deleted) { this._wvBlDropSource(item.id); return true; }
            const text = isAnn ? String(item.annotationComment || "") : String((item.getNote && item.getNote()) || "");
            const parentID = item.parentItemID || item.parentID || null;
            const kind: WvBacklinkSource["kind"] = isAnn ? "annotation" : (parentID ? "itemNote" : "standaloneNote");
            this._wvBlIndexText(item.id, item.libraryID, parentID, kind, text);
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] backlinks reindex err: " + e); return false; }
    }

    /** The sources linking `item` itself. */
    _wvBlDirect(item: any): WvBacklinkSource[] {
        try {
            if (!item || !item.key) return [];
            return this._wvBl().byTarget.get(this._wvBlKey(item.libraryID, item.key)) || [];
        } catch (e) { return []; }
    }

    /** The item and everything under it that can be a target: a regular
     *  item's attachments, notes and the attachments' annotations; a file
     *  attachment's annotations. */
    _wvBlTargetsUnder(item: any): any[] {
        const out: any[] = [];
        if (!item) return out;
        out.push(item);
        try {
            const addAnns = (att: any) => {
                try {
                    if (att && att.isFileAttachment && att.isFileAttachment()) {
                        for (const a of (att.getAnnotations && att.getAnnotations()) || []) if (a) out.push(a);
                    }
                } catch (e) {}
            };
            if (item.isRegularItem && item.isRegularItem()) {
                for (const id of (item.getAttachments && item.getAttachments()) || []) {
                    const att = Zotero.Items.get(id);
                    if (!att) continue;
                    out.push(att);
                    addAnns(att);
                }
                for (const id of (item.getNotes && item.getNotes()) || []) {
                    const n = Zotero.Items.get(id);
                    if (n) out.push(n);
                }
            }
            else if (item.isAttachment && item.isAttachment()) addAnns(item);
        } catch (e) {}
        return out;
    }

    /** Every (target, source) pair under `item` ("subtree", the default), or
     *  the item's own links only ("own"). The Tags / Related convention
     *  (MJT 2026-10-23): a collapsed row counts the item with its children
     *  and annotations, an expanded row and the item-pane section only the
     *  item itself. */
    _wvBlEntries(item: any, scope: "own" | "subtree" = "subtree"): { target: any; src: WvBacklinkSource }[] {
        const out: { target: any; src: WvBacklinkSource }[] = [];
        const targets = scope === "own" ? (item ? [item] : []) : this._wvBlTargetsUnder(item);
        for (const t of targets) for (const src of this._wvBlDirect(t)) out.push({ target: t, src });
        return out;
    }

    /** The rolled-up count, memoised per item until the index changes. */
    _wvBlCount(item: any): number {
        const self: any = this;
        if (!item || item.id == null) return 0;
        const ix = this._wvBl();
        const cache: Map<number, { seq: number; n: number }> = self._wvBlCountCache || (self._wvBlCountCache = new Map());
        const hit = cache.get(item.id);
        if (hit && hit.seq === ix.seq) return hit.n;
        let n = 0;
        for (const t of this._wvBlTargetsUnder(item)) n += this._wvBlDirect(t).length;
        cache.set(item.id, { seq: ix.seq, n });
        return n;
    }

    /** The column's answer: the count once built; before that, 0 and a
     *  build whose end repaints the trees. */
    _wvBlCountForColumn(item: any): number {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return 0; }
        return this._wvBlCount(item);
    }

    /** The chip's answers. Before the build: every row passes the tree
     *  test and none is primary; the build's end schedules the reapply. */
    _wvBlTreeHas(root: any): boolean | null {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return null; }
        return this._wvBlCount(root) > 0;
    }
    _wvBlRowHas(item: any): boolean | null {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return null; }
        return this._wvBlDirect(item).length > 0;
    }
    /** Has Backlinks narrowed by its ▾ (MJT 2026-10-30, "Ok for what is
     *  proposed"): the tree is in when one of its parts of a kind `sc`
     *  keeps -- the item, an attachment, a note, an annotation
     *  (filter.ts `_rowKindOf` / `_wvScopeAllows`) -- is linked itself. */
    _wvBlTreeHasIn(root: any, sc: any): boolean | null {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return null; }
        const self: any = this;
        for (const t of this._wvBlTargetsUnder(root)) {
            if (self._wvScopeAllows(sc, self._rowKindOf(t)) && this._wvBlDirect(t).length) return true;
        }
        return false;
    }

    // ---- Links (outgoing): the index read the other way round -----------

    /** A source's references in text order, each resolved NOW: an entry
     *  whose item went since the index saw it reads broken ("missing"), and
     *  a broken one whose item has landed (a group library loads after
     *  startup; its items throw until then, src-ts.md) heals -- the source
     *  is re-indexed off a timer and every consumer refreshed. */
    _wvLkOut(src: any): WvLkRow[] {
        const self: any = this;
        const out: WvLkRow[] = [];
        if (!src || src.id == null) return out;
        const list = this._wvBl().outBySource.get(src.id) || [];
        let heal = false;
        for (const o of list) {
            let target: any = null, broken: WvLkRow["broken"] = o.broken || null;
            if (o.tKey) {
                try { target = (o.lib != null && Zotero.Items.getByLibraryAndKey(o.lib, o.key)) || null; } catch (e) { target = null; }
                if (!target) broken = "missing";
            }
            else {
                try {
                    const lib = o.lib != null ? o.lib : (o.group != null ? (Zotero.Groups.getLibraryIDFromGroupID(o.group) || null) : null);
                    if (lib != null && Zotero.Items.getByLibraryAndKey(lib, o.key)) heal = true;
                } catch (e) {}
            }
            out.push({ src, entry: o.entry, target, broken, url: o.entry.url, group: o.group, key: o.key });
        }
        if (heal) {
            const ids: Set<number> = self._wvLkHealIDs || (self._wvLkHealIDs = new Set());
            ids.add(src.id);
            if (!self._wvLkHealT) {
                self._wvLkHealT = wvTimeout(() => {
                    self._wvLkHealT = null;
                    const todo = Array.from(ids);
                    ids.clear();
                    if (self._wvDestroyed) return;
                    let changed = false;
                    for (const id of todo) { try { const it = Zotero.Items.get(id); if (it && this._wvBlIndexSource(it)) changed = true; } catch (e) {} }
                    if (changed) { this._wvBl().seq++; this._wvBlChanged(); }
                }, 50);
            }
        }
        return out;
    }

    /** An item landing (an `add` event): the sources whose broken reference
     *  it heals are re-indexed; a resolved reference whose item is back
     *  under its key needs only the counts moved. */
    _wvLkHeal(item: any): boolean {
        const ix = this._wvBl();
        if (!ix.outBySource.size || !item || !item.key) return false;
        let changed = false;
        const keys = [this._wvBlKey(item.libraryID, item.key)];
        try { const g = Zotero.Groups.getGroupIDFromLibraryID(item.libraryID); if (g) keys.push("g" + g + "/" + item.key); } catch (e) {}
        for (const k of keys) {
            const srcs = ix.brokenByKey.get(k);
            if (srcs) {
                for (const s of Array.from(srcs)) {
                    try { const it = Zotero.Items.get(s); if (it) this._wvBlIndexSource(it); else this._wvBlDropSource(s); } catch (e) {}
                }
                changed = true;
            }
            if (ix.byTarget.has(k)) changed = true;
        }
        return changed;
    }

    /** The notes and annotations whose references `item` lists: a paper's
     *  notes and its attachments' annotations ("subtree", the default), an
     *  attachment's annotations, a note or an annotation itself. "own": the
     *  item alone, which for a paper or an attachment is nothing. */
    _wvLkSourcesUnder(item: any, scope: "own" | "notes" | "subtree" = "subtree"): any[] {
        const out: any[] = [];
        if (!item) return out;
        try {
            if ((item.isNote && item.isNote()) || (item.isAnnotation && item.isAnnotation())) { out.push(item); return out; }
            if (scope === "own") return out;
            // "notes": the Links section narrowed (pane-scope.ts, MJT
            // 2026-10-29, "Notes only vs + annotations"): a paper's own notes.
            const addAnns = (att: any) => {
                if (scope === "notes") return;
                try { if (att && att.isFileAttachment && att.isFileAttachment()) for (const a of (att.getAnnotations && att.getAnnotations()) || []) if (a) out.push(a); } catch (e) {}
            };
            if (item.isRegularItem && item.isRegularItem()) {
                for (const id of (item.getNotes && item.getNotes()) || []) { const n = Zotero.Items.get(id); if (n) out.push(n); }
                for (const id of (item.getAttachments && item.getAttachments()) || []) addAnns(Zotero.Items.get(id));
            }
            else if (item.isAttachment && item.isAttachment()) addAnns(item);
        } catch (e) {}
        return out;
    }

    /** The Links section's numbers for `item` (pane-scope.ts), over the
     *  whole item -- its header's: all the resolved references (`all`, the
     *  title's count, MJT 2026-10-30), the broken ones, the internal links
     *  among the resolved ones (`loops`), the resolved ones by where they
     *  are written (`lv`: the item itself -- a note's, an annotation's own
     *  --, its notes, its annotations) and by what they are (`refs`). */
    _wvLkSectionCounts(item: any): { broken: number; loops: number; all: number; lv: { own: number; att: number; note: number; ann: number }; refs: { link: number; zotero: number } } {
        const self: any = this;
        let broken = 0, loops = 0, all = 0;
        const lv = { own: 0, att: 0, note: 0, ann: 0 };
        const refs = { link: 0, zotero: 0 };
        for (const src of this._wvLkSourcesUnder(item, "subtree")) {
            const level = src.id === item.id ? "own" : self._wvScopeLevelOf(src);
            for (const r of this._wvLkOut(src)) {
                if (!r.target) { broken++; continue; }
                all++;
                if (r.entry.internal) loops++;
                lv[level as "own" | "att" | "note" | "ann"]++;
                if (r.entry.ref === "link") refs.link++; else refs.zotero++;
            }
        }
        return { broken, loops, all, lv, refs };
    }

    /** Every Links row under `item`. */
    _wvLkEntries(item: any, scope: "own" | "notes" | "subtree" = "subtree"): WvLkRow[] {
        const out: WvLkRow[] = [];
        for (const src of this._wvLkSourcesUnder(item, scope)) for (const r of this._wvLkOut(src)) out.push(r);
        return out;
    }

    /** The resolved references under `item`, memoised per item until the
     *  index changes; a broken one never counts. */
    _wvLkCount(item: any): number {
        const self: any = this;
        if (!item || item.id == null) return 0;
        const ix = this._wvBl();
        const cache: Map<number, { seq: number; n: number }> = self._wvLkCountCache || (self._wvLkCountCache = new Map());
        const hit = cache.get(item.id);
        if (hit && hit.seq === ix.seq) return hit.n;
        let n = 0;
        for (const r of this._wvLkEntries(item, "subtree")) if (r.target) n++;
        cache.set(item.id, { seq: ix.seq, n });
        return n;
    }

    /** The Links column's answer: the subtree's resolved count once built;
     *  before that, 0 and a build whose end repaints the trees (Backlinks'
     *  rule). */
    _wvLkCountForColumn(item: any): number {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return 0; }
        return this._wvLkCount(item);
    }

    /** An expanded row's number: the item's own resolved references -- a
     *  note's or an annotation's count; nothing for a paper or an
     *  attachment, whose notes and annotations carry theirs on their own
     *  rows (the Tags / Related convention). */
    _wvLkOwnCount(item: any): number {
        let n = 0;
        for (const r of this._wvLkEntries(item, "own")) if (r.target) n++;
        return n;
    }

    /** The broken references under `item` (listed greyed, never counted). */
    _wvLkBrokenCount(item: any): number {
        let n = 0;
        for (const r of this._wvLkEntries(item, "subtree")) if (!r.target) n++;
        return n;
    }

    /** Has Item Links' answers (Links plan slice 3), Has Backlinks' mirror:
     *  a tree is in when the Links column would show a number for its root;
     *  a row is primary when it carries a resolved reference itself (a note,
     *  an annotation). Before the build: every tree passes and no row is
     *  primary; the build's end schedules the reapply (`_wvBlChanged`). */
    _wvLkTreeHas(root: any): boolean | null {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return null; }
        return this._wvLkCount(root) > 0;
    }
    _wvLkRowHas(item: any): boolean | null {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return null; }
        return this._wvLkOwnCount(item) > 0;
    }
    /** Has Item Links narrowed by its ▾ (MJT 2026-10-30): the tree is in
     *  when a note or an annotation in it, written where `sc` keeps --
     *  Has External Link's keys, filter.ts `_hasLinkScopeKeyOf` --, carries
     *  a resolved reference itself. */
    _wvLkTreeHasIn(root: any, sc: any): boolean | null {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return null; }
        const self: any = this;
        for (const src of this._wvLkSourcesUnder(root, "subtree")) {
            const k = self._hasLinkScopeKeyOf(src);
            if (k && sc[k] !== false && this._wvLkOwnCount(src) > 0) return true;
        }
        return false;
    }

    // ---- External links (the External Links column) ---------------------
    // MJT 2026-10-30, "Rename properly the Links column, and add a External
    // Links column" -> "Number + popup", "Each link written": the web and app
    // links written in notes and annotation comments -- what Has External
    // Link looks for -- counted as Item Links counts: collapsed, the whole
    // item; expanded, the row's own.

    /** Is `url` a link the user has on (Settings -> Links: web links, app
     *  links and each scheme) -- Has External Link's rule (url.ts
     *  `URL_SCHEME_ALT`); never a zotero:// one. */
    _wvExtOn(url: string): boolean {
        const self: any = this;
        if (!url || /^zotero:/i.test(url)) return false;
        let alt = "";
        try { alt = String(self.URL_SCHEME_ALT || ""); } catch (e) { return true; }
        let c = self._wvExtOnRe;
        if (!c || c.alt !== alt) c = self._wvExtOnRe = { alt, re: new RegExp("^(?:" + alt + ")") };
        return c.re.test(url);
    }

    /** A note's or an annotation's own external links, in text order. */
    _wvExtOf(src: any): WvExtLink[] {
        try { return src ? (this._wvBl().extBySource.get(src.id) || []).filter((l) => this._wvExtOn(l.url)) : []; } catch (e) { return []; }
    }

    _wvExtOwnCount(item: any): number {
        return this._wvExtOf(item).length;
    }

    /** The subtree's external links, memoised per item until the index or
     *  the enabled schemes change. */
    _wvExtCount(item: any): number {
        const self: any = this;
        if (!item || item.id == null) return 0;
        const ix = this._wvBl();
        let alt = "";
        try { alt = String(self.URL_SCHEME_ALT || ""); } catch (e) {}
        const cache: Map<number, { seq: number; alt: string; n: number }> = self._wvExtCountCache || (self._wvExtCountCache = new Map());
        const hit = cache.get(item.id);
        if (hit && hit.seq === ix.seq && hit.alt === alt) return hit.n;
        let n = 0;
        for (const src of this._wvLkSourcesUnder(item, "subtree")) n += this._wvExtOf(src).length;
        cache.set(item.id, { seq: ix.seq, alt, n });
        return n;
    }

    _wvExtCountForColumn(item: any): number {
        if (!this._wvBlReady()) { this._wvBlEnsure(); return 0; }
        return this._wvExtCount(item);
    }

    /** Every external link under `item` ("subtree") or its own ("own"),
     *  each with the note or annotation it is written in. */
    _wvExtEntries(item: any, scope: "own" | "subtree" = "subtree"): { src: any; link: WvExtLink }[] {
        const out: { src: any; link: WvExtLink }[] = [];
        for (const src of this._wvLkSourcesUnder(item, scope)) for (const link of this._wvExtOf(src)) out.push({ src, link });
        return out;
    }

    /** The text around a link, cut from its source's current text. */
    _wvExtExcerpt(src: any, link: WvExtLink): WvBlSeg[] {
        try {
            const isAnn = !!(src.isAnnotation && src.isAnnotation());
            const text = isAnn ? String(src.annotationComment || "") : String((src.getNote && src.getNote()) || "");
            return wvBlExcerpt(text, link.at, link.len, !isAnn, BL_BEFORE, { after: BL_AFTER, clause: true }).segs;
        } catch (e) { return []; }
    }

    // ---- notifier -------------------------------------------------------

    /** The item observer, stamped like every long-lived hook (a reload
     *  re-registers; the previous build's `notify` never stays). */
    _wvBlWireNotifier() {
        const self: any = this;
        try {
            const g: any = Zotero;
            const tag = self._wvWireTag();
            if (g._wvBlObsID) {
                if (g._wvBlObsVer === tag) return;
                try { Zotero.Notifier.unregisterObserver(g._wvBlObsID); } catch (e) {}
                delete g._wvBlObsID;
            }
            g._wvBlObsVer = tag;
            const obs = {
                notify: (event: string, type: string, ids: any[]) => {
                    try {
                        const lp: any = wvLivePlugin();
                        if (!lp || type !== "item") return;
                        lp._wvBlOnItems(event, ids || []);
                    } catch (e) {}
                },
            };
            g._wvBlObsID = Zotero.Notifier.registerObserver(obs, ["item"], "weavero-backlinks", 85);
        } catch (e) { Zotero.debug("[Weavero] backlinks notifier err: " + e); }
    }

    _wvBlUnwireNotifier() {
        try {
            const g: any = Zotero;
            if (g._wvBlObsID) { try { Zotero.Notifier.unregisterObserver(g._wvBlObsID); } catch (e) {} }
            delete g._wvBlObsID; delete g._wvBlObsVer;
        } catch (e) {}
    }

    _wvBlOnItems(event: string, ids: any[]) {
        const ix = this._wvBl();
        if (!ix.built) return;   // the build reads the database itself
        let changed = false;
        for (const id of ids) {
            const n = typeof id === "number" ? id : parseInt(String(id), 10);
            if (!Number.isFinite(n)) continue;
            if (event === "delete" || event === "trash") {
                if (this._wvBlDropSource(n)) changed = true;
                // An erased TARGET: the references aimed at it read broken
                // from now on (resolved at read time), so the counts
                // memoised per `seq` must move.
                else if (event === "delete" && ix.outBySource.size) changed = true;
                continue;
            }
            if (event !== "add" && event !== "modify") continue;
            let item: any = null;
            try { item = Zotero.Items.get(n); } catch (e) { item = null; }
            if (!item) { if (this._wvBlDropSource(n)) changed = true; continue; }
            if (event === "add" && this._wvLkHeal(item)) changed = true;
            try { if (item.isAnnotation() && this._wvBlFwdLearn(item)) changed = true; } catch (e) {}
            // A source holding anything a section lists -- a resolved or a
            // broken reference -- before or after the edit.
            const holds = () => ix.bySource.has(n) || ix.outBySource.has(n) || ix.extBySource.has(n);
            const had = holds();
            if (this._wvBlIndexSource(item) && (had || holds())) changed = true;
        }
        if (changed) { ix.seq++; this._wvBlChanged(); }
    }

    /** Re-render every live Links and Backlinks section body: after the
     *  index moved, and after the inline-links setting flipped (its rows'
     *  titles carry link spans, `_wvBlMakeRow`). */
    _wvBlRefreshBodies() {
        for (const [body, refresh] of Array.from(blBodies.entries())) {
            try { if (!body.isConnected) { blBodies.delete(body); continue; } refresh(); } catch (e) {}
        }
    }

    /** The consumers after the index moved: live section bodies re-render,
     *  the trees repaint when the column is on, the filter re-applies when
     *  the chip is set. Debounced: an edit fires several notifications. */
    _wvBlChanged() {
        const self: any = this;
        wvClearTimeout(self._wvBlChangedT);
        self._wvBlChangedT = wvTimeout(() => {
            self._wvBlChangedT = null;
            if (self._wvDestroyed) return;
            this._wvBlRefreshBodies();
            // The children's own counts (Backlinks part 2): the Attachments
            // section's badges and the reader's annotation cards.
            for (const w of wvMainWins()) { try { self._wvBlDecorateAttRows(w.document); } catch (e) {} }
            try { self._wvBlRefreshReaders(); } catch (e) {}
            try {
                if (self._weaveroColumnKeys && self._weaveroColumnKeys.some((k: string) => String(k).indexOf(WV_BL_COLUMN_KEY) >= 0 || String(k).indexOf(WV_LK_COLUMN_KEY) >= 0 || String(k).indexOf(WV_EXT_COLUMN_KEY) >= 0)) {
                    for (const w of wvMainWins()) {
                        try {
                            const iv = w.ZoteroPane && w.ZoteroPane.itemsView;
                            if (!iv || !iv.tree) continue;
                            // Zotero caches each row's column values until
                            // that row's item changes: a repaint alone reuses
                            // the count from before the change -- a row drawn
                            // before the build kept its 0 (MJT 2026-10-26, "4
                            // Backlinks in the section, but 0 in the column").
                            // Zotero's own pattern for a pref that changes a
                            // column (showAttachmentFilenames, itemTree.jsx).
                            if (typeof iv.invalidateRowCache === "function") iv.invalidateRowCache(true);
                            iv.tree.invalidate();
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            try {
                const g = self._filterState && self._filterState.groups;
                if (g && g.some((x: any) => x && (x.hasBacklinks != null || x.hasItemLinks != null)) && typeof self._wvScheduleReapplyAfterDataChange === "function") {
                    self._wvScheduleReapplyAfterDataChange();
                }
            } catch (e) {}
            // The reader's annotation filters (reader funnel and pane funnel,
            // reader-panels.ts) with Has Backlinks or Has Item Links set
            // re-apply: a link added or removed elsewhere changes no
            // annotation of theirs. Only states that exist -- reading the
            // pane's would create one.
            try {
                const linky = (s: any) => !!s && (s.hasBacklinks != null || s.hasItemLinks != null);
                for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
                    try {
                        const fst = self._wvReaderFilters && self._wvReaderFilters.get(r);
                        if (linky(fst)) self._wvApplyReaderFilter(r);
                        const pst = self._wvAnnPaneWM && self._wvAnnPaneWM.get(r);
                        if (linky(pst)) self._wvAnnListApply(r, true);
                    } catch (e) {}
                }
            } catch (e) {}
        }, 150);
    }

    // ---- the children's own counts (Backlinks part 2) ---------------------
    // MJT 2026-10-28, "Backlinks part 2" / "Ok" to the design report's
    // "counts go on the children they count": a file's row in the
    // Attachments section and an annotation's card in the reader (and its
    // popup in the PDF) say how many links are aimed at them, as the item
    // pane's annotation cards have since 2026-10-23 (pane.ts
    // `_decoratePaneRowRefs`). Nothing here is stored: the index is read
    // when they are drawn, and `_wvBlChanged` brings the drawn ones up to date
    // -- a link written elsewhere changes neither the file nor the annotation,
    // so neither Zotero's row nor the reader re-renders on its own.

    /** The badge on one `attachment-row`: the links aimed at the file or at
     *  its annotations (`_wvBlCount`, the number of the file's collapsed
     *  items-list row), after Zotero's annotation count and drawn like it
     *  (attachmentRow.js, _attachmentRow.scss): the glyph and the number,
     *  nothing at zero or while the Backlinks switch is off. A click (Enter
     *  and Space through ZoteroPane's `keyboard-clickable` rule) opens the
     *  Backlinks popup by part. */
    _wvBlDecorateAttRow(row: any) {
        const self: any = this;
        try {
            const att = row && row.attachment;
            const head = row && row.querySelector && row.querySelector(":scope > .head");
            if (!att || !head) return;
            let btn = head.querySelector(":scope > .wv-att-bl-btn");
            let n = 0;
            if (self._getEnableBacklinks()) {
                if (!this._wvBlReady()) { this._wvBlEnsure(); return; }   // its end calls _wvBlChanged
                n = this._wvBlCount(att);
            }
            if (!n) { if (btn) btn.remove(); return; }
            const doc = row.ownerDocument;
            const title = n + (n === 1 ? " Backlink" : " Backlinks");
            if (!btn) {
                this._wvBlEnsureStyle(doc);
                btn = wvHtmlEl(doc, "div", "clicky-item keyboard-clickable wv-att-bl-btn");
                btn.setAttribute("tabindex", "0");
                btn.setAttribute("role", "button");
                btn.appendChild(wvLinkGlyphEl(doc, { cls: "wv-att-bl-icon", backlink: true }));
                wvHtmlEl(doc, "span", "label", "", btn);
                btn.addEventListener("click", (e: any) => {
                    e.stopPropagation();
                    try {
                        const lp: any = wvLivePlugin();
                        const a = row.attachment;
                        if (lp && a) lp._wvOpenCountPopup("backlinks", a.id, { anchorNode: btn, scope: "subtree", fromClick: true });
                    } catch (er) { Zotero.debug("[Weavero] attachment backlinks click err: " + er); }
                });
                const ann = head.querySelector(":scope > .annotation-btn");
                head.insertBefore(btn, ann ? ann.nextSibling : head.querySelector(":scope > .zotero-clicky-minus"));
            }
            if (btn.title !== title) { btn.title = title; btn.setAttribute("aria-label", title); }
            const lab = btn.querySelector(".label");
            if (lab && lab.textContent !== String(n)) lab.textContent = String(n);
        } catch (e) { Zotero.debug("[Weavero] attachment backlinks badge err: " + e); }
    }

    /** Every attachment row of `doc` (the library's item pane and the
     *  reader tabs' context panes). */
    _wvBlDecorateAttRows(doc: any) {
        try { for (const r of (doc && doc.querySelectorAll("attachment-row")) || []) this._wvBlDecorateAttRow(r); } catch (e) {}
    }

    /** How many references an annotation's button counts -- "backlinks":
     *  aimed at `ann`; "links": written in its comment and resolved (MJT
     *  2026-10-28, "Same also for links" -> "Add a Links button") -- 0 while
     *  that feature's switch is off or the index is still building (its end
     *  refreshes the readers through `_wvBlChanged`). */
    _wvBlReaderCount(ann: any, kind: WvRefKind = "backlinks"): number {
        const self: any = this;
        try {
            if (!ann || !(kind === "links" ? self._getEnableLinks() : self._getEnableBacklinks())) return 0;
            if (!this._wvBlReady()) { this._wvBlEnsure(); return 0; }
            return kind === "links" ? this._wvLkOwnCount(ann) : this._wvBlDirect(ann).length;
        } catch (e) { return 0; }
    }

    /** The reader's Links or Backlinks button for `ann` (`cls`: the
     *  sidebar's or the popup's button class), or null when it has nothing
     *  to count. Drawn as the item pane's: the links glyph with its arrow
     *  out or in, "N Links" / "N Backlinks"; a click opens the annotation's
     *  popup of that kind. Both carry `wv-btn-ref`, which the comment-icon
     *  lookups skip. */
    _wvBlReaderBtn(doc: any, ann: any, cls: string, popup = false, kind: WvRefKind = "backlinks"): any {
        const n = this._wvBlReaderCount(ann, kind);
        if (!n) return null;
        const btn = wvHtmlEl(doc, "button", BTN_CLASS + " " + cls + " wv-btn-ref wv-btn-" + kind);
        if (popup) btn.setAttribute("tabindex", "-1");
        btn.title = wvRefTitle(n, kind);
        btn.appendChild(wvLinkGlyphEl(doc, { cls: "wv-bl-btn-svg", backlink: kind === "links" ? "out" : true }));
        const lib = ann.libraryID, key = ann.key;
        btn.addEventListener("click", (e: any) => {
            e.stopPropagation(); e.preventDefault();
            try { const lp: any = wvLivePlugin(); if (lp) lp._wvBlOpenFromReader(btn, lib, key, kind); }
            catch (er) { Zotero.debug("[Weavero] reader " + kind + " click err: " + er); }
        });
        return btn;
    }

    /** The popup for a reader button, in the CHROME window holding the
     *  reader (the main window for a tab, the reader window for one): the
     *  reader page is its own top window (a content browser, checked live
     *  2026-10-28), where Zotero's item icons are out of reach. Placed from
     *  the button's screen position, as the reader's other popups are. */
    _wvBlOpenFromReader(btn: any, lib: number, key: string, kind: WvRefKind = "backlinks") {
        const a = Zotero.Items.getByLibraryAndKey(lib, key);
        if (!a) return;
        // A button built in the sidebar's render event lives in the page's
        // own (waived) view -- Zotero hands plugins `event.detail.wrappedJSObject`
        // (xpcom/reader.js) -- where the chrome-only `browsingContext` is
        // absent: the popup landed inside the reader page (runner, 2026-10-28).
        let iwin: any = btn.ownerDocument.defaultView;
        try { iwin = (Components as any).utils.unwaiveXrays(iwin); } catch (e) {}
        let win: any = null;
        try { win = iwin.browsingContext && iwin.browsingContext.topChromeWindow; } catch (e) { win = null; }
        if (!win) {
            for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try { if (r._iframeWindow === iwin && r._window) { win = r._window; break; } } catch (e) {}
            }
        }
        let anchorScreen: any = null;
        try {
            const r = btn.getBoundingClientRect();
            if (typeof iwin.mozInnerScreenX === "number") anchorScreen = { x: iwin.mozInnerScreenX + r.left, y: iwin.mozInnerScreenY + r.bottom + 4 };
        } catch (e) {}
        (this as any)._wvOpenCountPopup(kind, a.id, Object.assign({ anchorNode: btn, scope: "own", fromClick: true },
            win ? { win } : {}, anchorScreen ? { anchorScreen } : {}));
    }

    /** One reader sidebar card's Links and Backlinks buttons brought to the
     *  counts now: added, retitled or removed, in the order [comment]
     *  [related] [links] [backlinks] [⋯]. `slot` finds the header end when
     *  the card has no Weavero button yet. */
    _wvBlSyncSidebarCard(row: any, ann: any, slot: (row: any) => any) {
        for (const kind of ["links", "backlinks"] as WvRefKind[]) {
            try {
                const existing = row.querySelector(".wv-btn-" + kind);
                const n = this._wvBlReaderCount(ann, kind);
                if (!n) { if (existing) existing.remove(); continue; }
                const title = wvRefTitle(n, kind);
                if (existing) { if (existing.title !== title) existing.title = title; continue; }
                const b = this._wvBlReaderBtn(row.ownerDocument, ann, BTN_SIDEBAR_CLASS, false, kind);
                if (!b) continue;
                // Links goes before an existing Backlinks button; either one
                // after Related or the comment icon; else before the kebab.
                const bl = kind === "links" ? row.querySelector(".wv-btn-backlinks") : null;
                const after = kind === "backlinks" ? row.querySelector(".wv-btn-links") : null;
                const prev = after || row.querySelector(".wv-btn-relations") || row.querySelector("." + BTN_SIDEBAR_CLASS + ":not(.wv-btn-ref)");
                if (bl && bl.parentNode) bl.parentNode.insertBefore(b, bl);
                else if (prev && prev.parentNode) prev.parentNode.insertBefore(b, prev.nextSibling);
                else {
                    const target = slot(row);
                    const last = target.lastElementChild;
                    if (last) target.insertBefore(b, last); else target.appendChild(b);
                }
            } catch (e) { Zotero.debug("[Weavero] sidebar " + kind + " sync err: " + e); }
        }
    }

    /** Every open reader's annotation cards (the Links and Backlinks
     *  buttons only: the full `_reinjectAllSidebars` pass re-reads every
     *  comment). */
    _wvBlRefreshReaders() {
        const self: any = this;
        try {
            if (typeof self._getEnableReaderSidebar === "function" && !self._getEnableReaderSidebar()) return;
            const slot = (row: any) => row.querySelector(".head .end") || row.querySelector("header .end") || row.querySelector("header") || row;
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const idoc = reader._iframeWindow && reader._iframeWindow.document;
                    if (!idoc) continue;
                    const lib = self.libraryIDFromReader(reader);
                    for (const row of idoc.querySelectorAll(".annotation[data-sidebar-annotation-id]")) {
                        const key = row.getAttribute("data-sidebar-annotation-id");
                        let ann: any = null;
                        try { ann = key ? Zotero.Items.getByLibraryAndKey(lib, key) : null; } catch (e) { ann = null; }
                        if (ann) this._wvBlSyncSidebarCard(row, ann, slot);
                        else for (const b of row.querySelectorAll(".wv-btn-ref")) b.remove();
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }

    // ---- the section -----------------------------------------------------

    /** `weavero.ftl` into a main window (Zotero registers the plugin's
     *  locale/ directory; each document links the file itself).
     *
     *  A window must never keep the link while the file is unregistered: one
     *  missing resource makes the window's whole Localization resolve
     *  NOTHING, Zotero's own strings included (2026-10-26, dev profile: every
     *  item-pane header and column-menu label went blank). Zotero
     *  unregisters a plugin's locale files after its shutdown on disable,
     *  uninstall and update (plugins.js unregisterLocales), so shutdown
     *  unlinks the file (`_wvBlRemoveFtl`, as make-it-red's removeFromWindow
     *  does), and the window wiring (`refresh`) replaces a link an older
     *  build left behind, which rebuilds a window already stuck. */
    _wvBlEnsureFtl(win: any, refresh = false) {
        try {
            if (refresh && win && win.document && win.document.querySelector(BL_FTL_LINK)) this._wvBlRemoveFtl(win);
            const M = win && win.MozXULElement;
            if (M && typeof M.insertFTLIfNeeded === "function") M.insertFTLIfNeeded(BL_FTL);
        } catch (e) {}
    }

    _wvBlRemoveFtl(win: any) {
        const doc = win && win.document;
        if (!doc) return;
        try { for (const l of doc.querySelectorAll(BL_FTL_LINK)) l.remove(); } catch (e) {}
        try { if (doc.l10n) doc.l10n.removeResourceIds([BL_FTL]); } catch (e) {}
    }

    _wvBlInit() {
        this._wvBlWireNotifier();
        // Links first: the item pane appends plugin sections in registration
        // order (MJT 2026-10-27, "The links section should be above the
        // backlinks"; `_wvBlKeepSectionOrder` holds it across pref toggles).
        // The Links section reads the same index (links.ts).
        try { (this as any)._wvLkInit(); } catch (e) { Zotero.debug("[Weavero] links init err: " + e); }
        this._wvBlApplySectionPref();
    }

    _wvBlDestroy() {
        const self: any = this;
        try { self._wvLkDestroy(); } catch (e) {}
        try { this._wvBlUnregisterSection(); } catch (e) {}
        try { this._wvBlUnwireNotifier(); } catch (e) {}
        wvClearTimeout(self._wvBlChangedT); self._wvBlChangedT = null;
        wvClearTimeout(self._wvLkHealT); self._wvLkHealT = null;
        blBodies.clear();
        for (const w of wvMainWins()) {
            try { const m = w.document.getElementById(BL_MENU_ID); if (m) m.remove(); } catch (e) {}
            // The Attachments section's badges (the reader's buttons carry the
            // sidebar / popup class the reader teardown strips).
            try { for (const b of w.document.querySelectorAll(".wv-att-bl-btn")) b.remove(); } catch (e) {}
        }
        // Every window, not only the main ones: the section's init links the
        // file and injects the sheet into whatever document renders it -- a
        // reader window's item pane too (its sheet outlived a disable until
        // 2026-10-26).
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try { this._wvBlRemoveFtl(w); } catch (e) {}
                try { wvRemoveStyle(w.document, BL_STYLE_ID); } catch (e) {}
                blCardRemove(w.document);
            }
        } catch (e) {}
    }

    /** Register or unregister the section after the pref it follows. */
    _wvBlApplySectionPref() {
        const self: any = this;
        let on = false;
        try { on = !!self._getEnableBacklinks(); } catch (e) { on = false; }
        if (on) this._wvBlRegisterSection(); else this._wvBlUnregisterSection();
        // The badges and reader buttons follow the switch too.
        for (const w of wvMainWins()) { try { this._wvBlDecorateAttRows(w.document); } catch (e) {} }
        try { this._wvBlRefreshReaders(); } catch (e) {}
        try {
            const g = self._filterState && self._filterState.groups;
            if (g && g.some((x: any) => x && x.hasBacklinks != null)) {
                self._renderFilterBar();
                self._applyItemsListFilter({ deliberate: true });
            }
        } catch (e) {}
    }

    /** The section's hooks are THIN DISPATCHERS to the live instance: the
     *  `item-pane-custom-section` element keeps the closures it was built
     *  with, and it outlives a hot reload (itemDetails keeps the element
     *  for a pane id it already has). With the bodies inlined, dev.8's
     *  header fix never ran on the dev instance -- the rows rendered
     *  through `wvLivePlugin()`, the header through dev.7's closure
     *  (2026-10-22). The registration key is kept on the Zotero global so
     *  the next instance clears a leftover registration before its own. */
    _wvBlRegisterSection(): boolean { return this._wvBlRegisterSectionFor(BL_SECTION); }
    _wvBlSweepStaleSections() { this._wvBlSweepStaleSectionsFor(BL_SECTION); }
    _wvBlUnregisterSection() { this._wvBlUnregisterSectionFor(BL_SECTION); }

    /** Register the section `desc` describes (Backlinks, Links). */
    _wvBlRegisterSectionFor(desc: WvSectionDesc): boolean {
        const self: any = this;
        try {
            const M = Zotero.ItemPaneManager;
            if (!M || typeof M.registerSection !== "function") return false;
            if (self[desc.inst]) return true;
            const g: any = Zotero;
            if (g[desc.glob]) { try { M.unregisterSection(g[desc.glob]); } catch (e) {} g[desc.glob] = null; g[desc.at] = Date.now(); }
            // itemDetails.renderCustomSections keeps an element whose pane id
            // is still registered and creates only the missing ones: an
            // unregister followed by a register in the same tick leaves the
            // OLD element (and its hooks) in every item pane, because the
            // removal notice arrives after the new registration. So the
            // registration waits for the notice to land first.
            if (g[desc.at] && Date.now() - g[desc.at] < 1500) {
                if (!self[desc.timer]) {
                    self[desc.timer] = wvTimeout(() => {
                        self[desc.timer] = null;
                        g[desc.at] = 0;
                        try {
                            if (self._wvDestroyed || self[desc.inst]) return;
                            if (wvLivePlugin() !== self) return;
                            if (!desc.enabled(self)) return;
                            self._wvBlRegisterSectionFor(desc);
                        } catch (e) {}
                    }, 400);
                }
                return true;
            }
            const hook = (name: string) => (props: any) => {
                const lp: any = wvLivePlugin();
                if (lp && typeof lp[name] === "function") return lp[name](props);
                return undefined;
            };
            const key = M.registerSection({
                paneID: desc.paneID,
                pluginID: WV_BL_PLUGIN_ID,
                header: { l10nID: desc.header.l10nID, l10nArgs: JSON.stringify({ count: 0 }), icon: desc.header.icon, darkIcon: desc.header.darkIcon },
                sidenav: { l10nID: desc.sidenav.l10nID, icon: desc.sidenav.icon, darkIcon: desc.sidenav.darkIcon },
                bodyXHTML: desc.bodyXHTML,
                onInit: hook(desc.hooks.init),
                onDestroy: hook(desc.hooks.destroy),
                onItemChange: hook(desc.hooks.itemChange),
                onRender: hook(desc.hooks.render),
                onAsyncRender: hook(desc.hooks.asyncRender),
                // No header button: the header's counts list the levels
                // (pane-scope.ts; MJT 2026-10-29, "Ok for A" -- the scope
                // button dev.98-111 carried here was redundant with them).
            });
            if (!key) return false;
            self[desc.inst] = key;
            g[desc.glob] = key;
            this._wvBlKeepSectionOrder();
            // A pane busy rendering processes the removal notice after this
            // registration and keeps its old element (the main library pane
            // did, 2026-10-22, while the context panes rebuilt theirs): sweep.
            for (const ms of [350, 1500]) {
                wvTimeout(() => { try { if (!self._wvDestroyed && wvLivePlugin() === self) self._wvBlSweepStaleSectionsFor(desc); } catch (e) {} }, ms);
            }
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] " + desc.paneID + " section register err: " + e); return false; }
    }

    /** Links above Backlinks (MJT 2026-10-27): itemDetails.renderCustomSections
     *  appends the sections in registration order and a section its pref
     *  brings back lands last, so a Backlinks registered before Links is
     *  registered again, after it (deferred: its unregister stamps the
     *  notice wait). The user's own order (`sidenav.order`, a drag in the
     *  side navigation or the header menu's Move Section Up / Down) is
     *  applied over the registration order and wins. */
    _wvBlKeepSectionOrder() {
        const self: any = this;
        try {
            const bl = self[BL_SECTION.inst], lk = self._wvLkPaneKey;   // LK_SECTION.inst (links.ts)
            if (!bl || !lk) return;
            const data = Zotero.ItemPaneManager.customSectionData;
            const ids = ((data && data.options) || []).map((o: any) => o.paneID);
            if (ids.indexOf(bl) < ids.indexOf(lk)) { this._wvBlUnregisterSection(); this._wvBlRegisterSection(); }
        } catch (e) {}
    }

    /** Drop every section element built from an earlier registration (its
     *  hooks are not the current option's) and have its item-details
     *  recreate it: itemDetails.renderCustomSections keeps an element
     *  whose pane id is registered, so a hot reload otherwise leaves the
     *  previous build's closures in place until Zotero restarts. */
    _wvBlSweepStaleSectionsFor(desc: WvSectionDesc) {
        const self: any = this;
        const key = self[desc.inst];
        if (!key) return;
        let opt: any = null;
        try {
            const data = Zotero.ItemPaneManager.customSectionData;
            opt = ((data && data.options) || []).find((o: any) => o.paneID === key) || null;
        } catch (e) { opt = null; }
        if (!opt || typeof opt.onRender !== "function") return;
        for (const w of wvMainWins()) {
            let dets: any[] = [];
            try { dets = Array.from(w.document.querySelectorAll("item-details")); } catch (e) { dets = []; }
            for (const det of dets) {
                try {
                    let stale = false;
                    for (const el of Array.from(det.querySelectorAll("item-pane-custom-section")) as any[]) {
                        if (el.dataset.pane !== key) continue;
                        const hooks = el._hooks;
                        if (hooks && hooks.render && hooks.render !== opt.onRender) {
                            try { el.remove(); } catch (e) {}
                            try { if (det.sidenav && typeof det.sidenav.removePane === "function") det.sidenav.removePane(key); } catch (e) {}
                            stale = true;
                        }
                    }
                    if (!stale) continue;
                    det._lastUpdateCustomSection = null;
                    if (typeof det.renderCustomSections === "function") det.renderCustomSections();
                    if (det.item && typeof det.render === "function") { const p = det.render(); if (p && typeof p.catch === "function") p.catch(() => {}); }
                } catch (e) {}
            }
        }
    }

    _wvBlUnregisterSectionFor(desc: WvSectionDesc) {
        const self: any = this;
        try {
            wvClearTimeout(self[desc.timer]); self[desc.timer] = null;
            const M = Zotero.ItemPaneManager;
            const g: any = Zotero;
            const key = self[desc.inst] || g[desc.glob];
            if (key && M && typeof M.unregisterSection === "function") { M.unregisterSection(key); g[desc.at] = Date.now(); }
            if (g[desc.glob] === key) g[desc.glob] = null;
        } catch (e) {}
        self[desc.inst] = null;
    }

    /** The rows' sheet into `doc` (the section injects it at init; the
     *  Backlinks column's popup renders the same rows elsewhere). */
    _wvBlEnsureStyle(doc: any) {
        try { wvInjectStyle(doc, BL_STYLE_ID, BL_CSS); } catch (e) {}
    }

    _wvBlHookInit({ body, doc, refresh }: any) {
        try {
            this._wvBlEnsureFtl(doc.defaultView);
            wvInjectStyle(doc, BL_STYLE_ID, BL_CSS);
            blBodies.set(body, refresh);
        } catch (e) {}
    }

    _wvBlHookDestroy({ body }: any) {
        try { blBodies.delete(body); } catch (e) {}
    }

    _wvBlHookItemChange({ body, doc, item, setEnabled, setL10nArgs }: any) {
        try {
            const ok = !!(item && (
                (item.isRegularItem && item.isRegularItem())
                || (item.isAttachment && item.isAttachment())
                || (item.isNote && item.isNote())));
            setEnabled(ok);
            // The section lists the item's OWN backlinks, as Zotero's Related
            // section lists the item's own relations (MJT 2026-10-23: "only
            // the data for the parent item"); its children's and annotations'
            // are on their own rows and in the column's roll-up.
            if (ok) {
                const ready = this._wvBlReady();
                this._wvBlHeader(body, doc, setL10nArgs, item, ready ? this._wvBlDirect(item).length : 0, ready);
            }
        } catch (e) { try { setEnabled(false); } catch (e2) {} }
    }

    // A render with no item leaves the section as it is: a section rebuilt
    // in a background tab (a reload re-registers it) has no item until the
    // tab is selected, and the index refresh rendered it anyway -- it read
    // as nothing listed and greyed a paper with 5 backlinks (dev.52).
    _wvBlHookRender({ body, item, doc, setL10nArgs }: any) {
        try {
            if (!item || !this._wvBlReady()) return;
            this._wvBlHeader(body, doc, setL10nArgs, item, this._wvBlRenderBody(body, item, doc));
        } catch (e) {}
    }

    async _wvBlHookAsyncRender({ body, item, doc, setL10nArgs }: any) {
        try {
            if (!item) return;
            await this._wvBlEnsure();
            if (!body.isConnected) return;
            this._wvBlHeader(body, doc, setL10nArgs, item, this._wvBlRenderBody(body, item, doc));
        } catch (e) {}
    }

    /** The section's header for `item`: the whole item's backlinks in the
     *  title -- its own and its parts' (MJT 2026-10-30, "Show the total
     *  number instead in the title"; `_n`, the own count the hooks pass, is
     *  the first count beside it now) -- `empty` with none; beside it the
     *  counts, the item's own, its files', notes'
     *  and annotations' (pane-scope.ts _wvScopeSetCounts; MJT 2026-10-29, "I
     *  would separate the children and the annotations levels" / "I would
     *  like to use icons to make it more compact"), then the internal links
     *  ("option 4 with an icon") -- the window's filter on them (none while
     *  the index builds). */
    _wvBlHeader(body: any, doc: any, setL10nArgs: any, item: any, _n: number, ready = true) {
        const self: any = this;
        const sec = body && body.closest ? body.closest("collapsible-section") : null;
        const total = ready ? this._wvBlCount(item) : 0;
        this._wvBlSetHeader(body, doc, setL10nArgs, total, ready ? 0 : null);
        if (!ready) { try { self._wvScopeSetCounts(self._wvScopeSectionTitle(body), null, "To"); } catch (e) {} return; }
        const f = self._wvScopeFilterIn(sec, "backlinks");
        const levels = Object.assign({ own: this._wvBlDirect(item).length }, this._wvBlLevelCounts(item));
        try {
            self._wvScopeSetCounts(self._wvScopeSectionTitle(body), self._wvScopeHasChildren(item) ? levels : null, "To",
                { n: this._wvBlLoops(item), of: total, what: "backlinks" }, f ? { kind: "backlinks", sec, f, item } : null,
                { refs: this._wvBlRefCounts(item) });
        } catch (e) {}
    }

    /** The backlinks `_wvBlCount` counts for `item`, by what they are:
     *  zotero:// links, Zotero's citations and quotes (the header's two
     *  kind counts, MJT 2026-10-30). */
    _wvBlRefCounts(item: any): { link: number; zotero: number } {
        const out = { link: 0, zotero: 0 };
        try { for (const t of this._wvBlTargetsUnder(item)) for (const s of this._wvBlDirect(t)) { if (s.ref === "link") out.link++; else out.zotero++; } } catch (e) {}
        return out;
    }

    /** The references aimed below `item`, level by level: its files, its
     *  notes, its files' annotations (together `_wvBlChildCount`). */
    _wvBlLevelCounts(item: any): { att: number; note: number; ann: number } {
        const out = { att: 0, note: 0, ann: 0 };
        try {
            for (const t of this._wvBlTargetsUnder(item)) {
                if (t.id === item.id) continue;
                const k = t.isAnnotation && t.isAnnotation() ? "ann" : t.isNote && t.isNote() ? "note" : "att";
                out[k] += this._wvBlDirect(t).length;
            }
        } catch (e) {}
        return out;
    }

    /** How many of the backlinks `_wvBlCount` counts for `item` are
     *  internal links (`WvBacklinkSource.internal`). */
    _wvBlLoops(item: any): number {
        let n = 0;
        for (const t of this._wvBlTargetsUnder(item)) for (const s of this._wvBlDirect(t)) if (s.internal) n++;
        return n;
    }

    /** The references aimed at the item's children (the collapsed row). */
    _wvBlChildCount(item: any): number {
        return item ? Math.max(0, this._wvBlCount(item) - this._wvBlDirect(item).length) : 0;
    }


    /** The header's count: the l10n args, then an explicit retranslation
     *  of the section. The args attribute alone lagged one selection
     *  behind on the dev instance (an item with 1 backlink kept the
     *  previous item's "15 Backlinks", 2026-10-22): Fluent's mutation
     *  observer does not always re-run for an args-only change here.
     *  Nothing listed and nothing aimed at a child (`childN`): the section
     *  is `empty`, greyed and closed as Zotero's own (collapsibleSection.js
     *  setCount); `childN` null (the index still building) leaves it. */
    _wvBlSetHeader(body: any, doc: any, setL10nArgs: any, n: number, childN: number | null = 0, extra?: Record<string, any>) {
        try { setL10nArgs(JSON.stringify(Object.assign({ count: n }, extra || {}))); } catch (e) {}
        try {
            const sec = body && body.closest && body.closest("collapsible-section");
            if (sec && childN != null) {
                const v = n === 0 && childN === 0;
                if ("empty" in sec) sec.empty = v; else sec.toggleAttribute("empty", v);
            }
            if (sec && doc && doc.l10n && typeof doc.l10n.translateElements === "function") {
                const p = doc.l10n.translateElements([sec]);
                if (p && typeof p.catch === "function") p.catch(() => {});
            }
        } catch (e) {}
    }

    /** The source's top-level item (a standalone note is its own). */
    _wvBlOwnerOf(src: any): any {
        let it = src;
        try { while (it && it.parentItemID) { const p = Zotero.Items.get(it.parentItemID); if (!p) break; it = p; } } catch (e) {}
        return it;
    }

    /** Zotero's own item-type icon for the row (components/icons), or a
     *  plain span where the module is out of reach. */
    _wvBlIcon(doc: any, item: any): any {
        try {
            const win = doc.defaultView;
            const mod = win && win.require && win.require("components/icons");
            if (mod && typeof mod.getCSSItemTypeIcon === "function" && item.getItemTypeIconName) {
                const key = (item.isAnnotation && item.isAnnotation()) ? "annotation-" + item.annotationType + "-" + item.annotationColor : undefined;
                const el = mod.getCSSItemTypeIcon(item.getItemTypeIconName(), key);
                if (el) { el.classList.add("wv-bl-kind"); return el; }
            }
        } catch (e) {}
        return wvHtmlEl(doc, "span", "wv-bl-kind");
    }

    /** A popup row's label: what the reference is, as a Links row says it
     *  (a link; a citation with its page; a quote with the quoted
     *  annotation's page) -- the source is named by the headings above it. */
    _wvBlRowLabel(src: WvBacklinkSource, target: any): string {
        if (src.ref === "citation") return "Note citation" + (src.locator ? " p. " + src.locator : "");
        if (src.ref === "quote") {
            let pl = ""; try { pl = (target && target.isAnnotation && target.isAnnotation() && target.annotationPageLabel) || ""; } catch (e) {}
            return "Note citation, annotation" + (pl ? " p. " + pl : "") + blAttOf(target);
        }
        return "Zotero link";
    }

    /** Which make of item link a reference is, and what it does (MJT
     *  2026-11-02, "I understand that there are different types of links.
     *  Can you list them? Can you show that information in the hover card?"
     *  -> "Icon, kind and action"), named with Zotero's own words: a "Zotero
     *  link" -- a zotero:// address (its "Include Zotero Links" export
     *  option; ZoteroProtocolHandler.mjs's select and open extensions,
     *  Better Notes' note form) -- by what it opens; a "Note citation" -- a
     *  citation or an annotation Zotero's note editor writes into a note (its
     *  `citation` and `highlight` nodes; Zotero calls the second an
     *  annotation, Weavero said "quote" until dev.143) -- by its page.
     *  `mark`: the chain's corner mark for it (lib/link-glyph.ts). */
    _wvBlRefKind(src: WvBacklinkSource, target: any): { mark: "zotero" | "cite"; kind: string; action: string } {
        try {
            if (src.ref === "citation") return { mark: "cite", kind: "Note citation", action: src.locator ? "p. " + src.locator : "" };
            if (src.ref === "quote") {
                let pl = "", ann = false;
                try { ann = !!(target && target.isAnnotation && target.isAnnotation()); pl = (ann && target.annotationPageLabel) || ""; } catch (e) {}
                // Cited at a page of its own when the citation after it names
                // another; an annotation gone leaves the citation's page.
                const cited = src.locator && src.locator !== pl ? src.locator : "";
                const action = ann ? "annotation" + (pl ? " p. " + pl : "") + (cited ? ", cited p. " + cited : "")
                    : "annotation" + (src.locator ? ", p. " + src.locator : "");
                return { mark: "cite", kind: "Note citation", action };
            }
            const url = unescapeEntities(String(src.url || ""));
            const host = (/^zotero:\/\/(select|open-pdf|open|note)\//.exec(url) || [])[1] || "";
            if (host === "note") {
                const pos = blNotePos(url);
                const at = pos ? " at " + (pos.charAt(0) === "#" ? "section " + pos.slice(1) : pos) : "";
                return { mark: "zotero", kind: "Zotero link", action: "Open note" + at + (pos === "heading" ? "" : " (Better Notes)") };
            }
            if (host === "select") return { mark: "zotero", kind: "Zotero link", action: "Show in library" };
            const p = wvBlParseLink(url);
            const action = p && p.annotationKey ? "Open at annotation" : p && p.page ? "Open at page " + p.page : "Open";
            return { mark: "zotero", kind: "Zotero link", action };
        } catch (e) { return { mark: "zotero", kind: "Zotero link", action: "" }; }
    }

    /** An item as one line of an item-pane row (MJT 2026-10-29: "you should
     *  use the same pattern as in the related section, using the same
     *  convention on what to show for the icon and for the text for each
     *  line"): Zotero's icon and display title, as relatedBox.js draws a
     *  related item; after them `where`, what the link itself says about the
     *  place (`_wvBlWhere`). An annotation on the shown item's own end
     *  (`withFile`) shows its file when its paper has several Zotero
     *  annotates and it is not the default one (`blAttFile`; MJT
     *  2026-10-27, "I do not see the information on which attachment the
     *  annotation belongs to"), then its page: the link's, else its own (MJT
     *  2026-10-30, "(a) Show both, page last" + "Annotation's page"; until
     *  dev.129 the link's place replaced the file, and an annotation with
     *  neither showed no page). The other end's line -- a Backlinks source,
     *  an Item Links target -- names no file: the row names nothing of
     *  that item's tree, so a file name alone says nothing (MJT 2026-11-02,
     *  "the row does not even mention any information on the parent item";
     *  named there until dev.159). `where` is always a place IN `it`: a
     *  line never carries the other end's page (MJT 2026-11-02, "The page
     *  number should refer to the current line only, not the other side of
     *  the link"; a Backlinks source's line showed the target's place until
     *  dev.142). */
    _wvBlEnd(doc: any, it: any, where = "", withFile = true): WvBlEnd {
        let main = "", chip = where, file = "";
        try { main = String(it.getDisplayTitle() || ""); } catch (e) {}
        try {
            if (it.isAnnotation && it.isAnnotation()) {
                file = withFile ? blAttFile(it) : "";
                const pl = it.annotationPageLabel;
                chip = where || (pl ? "p. " + pl : "");
            }
        } catch (e) {}
        return { icon: this._wvBlIcon(doc, it), main: main || "(untitled)", chip, file };
    }

    /** What a reference says about where in its target it lands, beyond
     *  the target itself: a citation's page, a page in a file, a Better
     *  Notes line or section; "" for none. */
    _wvBlWhere(src: WvBacklinkSource, target: any): string {
        try {
            // A quote with its citation carries the citation's page (`joined`).
            if (src.ref === "citation" || src.ref === "quote") return src.locator ? "p. " + src.locator : "";
            if (target.isNote && target.isNote()) return blNotePos(src.url);
            if (target.isAttachment && target.isAttachment()) { const pg = src.page || src.locator; return pg ? "p. " + pg : ""; }
        } catch (e) {}
        return "";
    }

    /** What a reference aimed at one of `item`'s children points at ("→ PDF
     *  p. 5", "→ annotation p. 12", "→ note", with a Better Notes position
     *  "→ note line 3" / "→ note #Methods"); "" when it is aimed at `item`
     *  itself -- unless that is a note and the link carries such a position
     *  ("→ line 3"), which is the only thing left to say. */
    _wvBlChip(src: WvBacklinkSource, target: any, item: any): string {
        try {
            if (!target || !item) return "";
            const isNote = !!(target.isNote && target.isNote());
            const pos = isNote ? blNotePos(src && src.url) : "";
            if (target.id === item.id) return pos ? "→ " + pos : "";
            if (target.isAnnotation && target.isAnnotation()) {
                const pl = target.annotationPageLabel || "";
                return "→ annotation" + (pl ? " p. " + pl : "") + blAttOf(target);
            }
            if (isNote) return "→ note" + (pos ? " " + pos : "");
            if (target.isAttachment && target.isAttachment()) {
                const pg = src.page || src.locator;
                return "→ " + blAttKind(target) + (pg ? " p. " + pg : "");
            }
        } catch (e) {}
        return "";
    }

    /** Fill `body` with `item`'s backlinks; returns the number listed as the
     *  item's own. Nothing is listed for none. `scope` "section" (the item
     *  pane, the default; MJT 2026-10-23, "only the data for the parent
     *  item"): the item's own, then -- the section widened from its header
     *  (pane-scope.ts, 2026-10-29) -- those aimed at its parts, part by
     *  part. A count popup lists what
     *  its number counted: "own" (an expanded items-list row) the item's own
     *  only, "subtree" (a collapsed one) all of them, grouped by the part
     *  each is aimed at (`_wvBlRenderByPart`, 2026-10-28).
     *  The rows follow the source tree (`_wvBlRenderList`). The section's
     *  rows are compact: two lines, source then target, and no annotated
     *  text, no excerpt (the card's and the popups' -- MJT 2026-10-27, "too
     *  small to show anything useful"). */
    _wvBlRenderBody(body: any, item: any, doc: any, scope: "section" | "own" | "subtree" = "section"): number {
        const self: any = this;
        try {
            // Rows go into the `.wv-bl-body` column the bodyXHTML provides
            // (or a bare host from a spec); the host itself stays.
            let host: any = body.querySelector && body.querySelector(".wv-bl-body");
            if (!host) {
                host = body.classList && body.classList.contains("wv-bl-body") ? body : wvHtmlEl(doc, "div", "wv-bl-body", undefined, body);
            }
            blCardHide(doc);
            while (host.firstChild) host.removeChild(host.firstChild);
            if (!item) return 0;
            const onKey = this._wvBlKeyHandler(host, doc);
            // A count popup draws as the section does (MJT 2026-11-02, "I
            // find the display of links from a click on count numbers in the
            // count columns is too complex to read. Keep the same format as
            // in the item pane"): "subtree" as the widened section, "own" the
            // item's own rows alone. Until dev.147 they drew source trees
            // with labels and excerpts (`_wvBlRenderByPart`, the rows'
            // non-compact form).
            // The section lists the item's own, then its parts', through the
            // window's filter on the header's counts (pane-scope.ts
            // _wvScopePass; MJT 2026-10-30, "just the same filtering as in
            // the items list"): the item's own rows at level "own", a part's
            // at the part's; an item with nothing below it is not filtered by
            // level. A count popup lists what its number counts: no filter.
            const f = scope === "section" ? self._wvScopeFilterIn(host, "backlinks") : null;
            const lv = !!self._wvScopeHasChildren(item);
            const pass = (level: string, s: WvBacklinkSource) => self._wvScopePass(f, level, !!s.internal, lv, false, s.ref);
            const own = this._wvBlEntries(item, "own");
            if (scope === "own") { this._wvBlRenderList(host, own, item, doc, onKey, true); return own.length; }
            // Those aimed at its parts follow its own, part by part, each
            // row naming its part on its second line.
            const parts: { target: any; src: WvBacklinkSource }[][] = [];
            for (const part of this._wvBlParts(item)) {
                if (part.id === item.id) continue;
                const level = self._wvScopeLevelOf(part);
                const entries = this._wvBlDirect(part).map(src => ({ target: part, src })).filter((e) => pass(level, e.src));
                if (entries.length) parts.push(entries);
            }
            // The item's own lead with "This item" and its type icon, as the
            // Tags and Related sections head them, alone or with its parts'
            // rows (MJT 2026-11-03, "keep the "This item" header even when
            // there is only the parent item selected, because the links color
            // now add another information. It is not needed for Tags and
            // Related" -- the arrows carry the reference's kind; from
            // 2026-10-30 to dev.171 its own rows alone had no heading and no
            // arrow, where Zotero's Related rows sit; until dev.118 the
            // item's title led them).
            this._wvBlRenderList(host, own.filter((e) => pass("own", e.src)), item, doc, onKey, true);
            for (const entries of parts) this._wvBlRenderList(host, entries, item, doc, onKey, true);
            // The section's header counts the item's own; a collapsed row's
            // popup lists all its number counts.
            return scope === "subtree" ? own.length + parts.reduce((n, p) => n + p.length, 0) : own.length;
        }
        catch (e) { Zotero.debug("[Weavero] backlinks render err: " + e); return 0; }
    }

    /** `item` and its parts, in the order the by-part lists show them: the
     *  item, each file followed by its annotations in reading order, then
     *  the notes. `_wvBlTargetsUnder` lists the annotations in the order
     *  Zotero loaded them: each run is sorted. */
    _wvBlParts(item: any): any[] {
        const isAnn = (it: any) => !!(it && it.isAnnotation && it.isAnnotation());
        const cmp = (a: string, b: string) => { try { return Zotero.localeCompare(a, b); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; } };
        const parts: any[] = [];
        let run: any[] = [];
        const flush = () => {
            run.sort((a, b) => cmp(String(a.annotationSortIndex || ""), String(b.annotationSortIndex || "")));
            parts.push(...run);
            run = [];
        };
        for (const t of this._wvBlTargetsUnder(item)) { if (isAnn(t)) run.push(t); else { flush(); parts.push(t); } }
        flush();
        return parts;
    }

    /** A collapsed row's popup (scope "subtree"; Backlinks part 2, MJT
     *  2026-10-28, "Backlinks part 2" / "Ok" to the design report's by-part
     *  popups): one heading per PART of `item` a link is aimed at -- the item
     *  ("This item"), a file, an annotation (in reading order under its
     *  file), a note -- in the Related and Tags popups' heading style and
     *  wording (count-popups.ts), with the part's share; under it the
     *  part's rows, drawn with the part as their reference point: no
     *  "→ annotation" chip (the heading says it), and Add as Related on a
     *  group's head relates to the part, not to the popup's root. Returns
     *  the number of rows. No caller since dev.148 (the popups draw as the
     *  section, MJT 2026-11-02): kept, with the rows' long form, until the
     *  new popups are validated. */
    _wvBlRenderByPart(host: any, item: any, doc: any, onKey: (ev: any) => void): number {
        const self: any = this;
        let n = 0;
        for (const part of this._wvBlParts(item)) {
            const entries = this._wvBlDirect(part).map(src => ({ target: part, src }));
            if (!entries.length) continue;
            const box = wvHtmlEl(doc, "div", "wv-count-group wv-bl-part", undefined, host);
            const head = wvHtmlEl(doc, "div", "wv-count-group-head", undefined, box);
            head.appendChild(this._wvBlIcon(doc, part));
            let label = "";
            try { label = self._wvCountSourceLabel(part, item) || ""; } catch (e) {}
            wvHtmlEl(doc, "span", "wv-count-group-title", label, head);
            const chip = self._wvCountHeadChip(doc, head, part, item);
            head.title = label + (chip ? " · " + chip : "");
            wvHtmlEl(doc, "span", "wv-count-group-n", String(entries.length), head);
            n += this._wvBlRenderList(box, entries, part, doc, onKey, false);
        }
        return n;
    }

    /** Rows for `entries` into `parent` as the tree of where each link is
     *  written (MJT 2026-10-28, "Source tree", after "For Backlinks, the
     *  first line shows the origin of the link, but at the parent level. I
     *  find this confusing"): the source's top-level item, the groups sorted
     *  by title; under it each note, by title, then each annotation, in
     *  reading order, headed as the Links section heads its sources
     *  (`_wvCountSourceLabel`); under that the links in text order, each
     *  read as a Links row reads one -- the target's icon, the kind, where
     *  in `item` it lands. A standalone note is its own top-level item: its
     *  links sit right under it. Returns the number of rows. `compact`: the
     *  item pane's rows, in that order but without the source tree's
     *  headings. Each call there lists ONE target's rows (the item's own, or
     *  a part's), under a heading for that target as the Tags and Related
     *  sections head theirs -- "This item" or the part's name, its icon, the
     *  rows' count (`_wvBlHeadGroup`; MJT 2026-10-30, "Option (b)") -- each
     *  row its source's line with the arrow up from it (MJT 2026-10-29, "the
     *  logic for all sections is to show the current item as first line ...
     *  Just change the direction of the link arrow"); the item's own rows
     *  too when they are all there is (MJT 2026-11-03; headless, arrowless
     *  from 2026-10-30 to dev.171). */
    _wvBlRenderList(parent: any, entries: { target: any; src: WvBacklinkSource }[], item: any, doc: any, onKey: (ev: any) => void, compact = false): number {
        const self: any = this;
        type Row = { target: any; src: WvBacklinkSource; srcItem: any };
        const groups = new Map<number, { owner: any; title: string; srcs: Map<number, Row[]> }>();
        for (const e of entries) {
            let srcItem: any = null;
            try { srcItem = Zotero.Items.get(e.src.srcID); } catch (x) { srcItem = null; }
            if (!srcItem) continue;
            const owner = this._wvBlOwnerOf(srcItem) || srcItem;
            let g = groups.get(owner.id);
            if (!g) {
                let title = "";
                try { title = (owner.isNote && owner.isNote()) ? owner.getNoteTitle() : owner.getDisplayTitle(); } catch (x) {}
                g = { owner, title: title || "(untitled)", srcs: new Map() };
                groups.set(owner.id, g);
            }
            let rows = g.srcs.get(srcItem.id);
            if (!rows) { rows = []; g.srcs.set(srcItem.id, rows); }
            rows.push({ target: e.target, src: e.src, srcItem });
        }
        const cmp = (a: string, b: string) => { try { return Zotero.localeCompare(a, b); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; } };
        const isAnn = (it: any) => !!(it && it.isAnnotation && it.isAnnotation());
        const titleOf = (it: any) => { try { return String(it.getNoteTitle() || ""); } catch (e) { return ""; } };
        // The Links section's source order (links.ts _wvLkRenderBody).
        const srcCmp = (a: any, b: any) => {
            const ra = isAnn(a) ? 1 : 0, rb = isAnn(b) ? 1 : 0;
            if (ra !== rb) return ra - rb;
            if (ra) return cmp(String(a.annotationSortIndex || ""), String(b.annotationSortIndex || "")) || a.id - b.id;
            return cmp(titleOf(a), titleOf(b)) || a.id - b.id;
        };
        const heading = (box: any, it: any, title: string, open: () => any, owner: any) => {
            const head = wvHtmlEl(doc, "div", "wv-bl-owner", undefined, box);
            head.appendChild(this._wvBlIcon(doc, it));
            wvHtmlEl(doc, "span", "wv-bl-title", title, head);
            const chip = self._wvCountHeadChip(doc, head, it, owner);
            head.title = title + (chip ? " · " + chip : "");
            head.addEventListener("click", (ev: any) => {
                ev.stopPropagation();
                try { const p = open(); if (p && typeof p.catch === "function") p.catch(() => {}); } catch (e) {}
            });
            head.addEventListener("contextmenu", (ev: any) => { ev.preventDefault(); ev.stopPropagation(); self._wvBlOpenMenu(ev, it, owner, item); });
        };
        let n = 0;
        const head = compact && entries.length ? this._wvBlHeadGroup(doc, parent, entries[0].target, item) : null;
        for (const g of Array.from(groups.values()).sort((a, b) => cmp(a.title, b.title))) {
            // The item pane's rows name their source themselves (`compact`,
            // MJT 2026-10-29): no source headings, the tree's order kept.
            let box = head || parent;
            if (!compact) {
                box = wvHtmlEl(doc, "div", "wv-bl-group", undefined, parent);
                heading(box, g.owner, g.title, () => self._wvBlOpenItem(g.owner, "select"), g.owner);
            }
            const srcItems = Array.from(g.srcs.values()).map(rows => rows[0].srcItem).sort(srcCmp);
            for (const srcItem of srcItems) {
                let rowParent = box;
                if (!compact && srcItem.id !== g.owner.id) {
                    rowParent = wvHtmlEl(doc, "div", "wv-bl-src", undefined, box);
                    let title = "";
                    try { title = self._wvCountSourceLabel(srcItem, g.owner) || ""; } catch (e) {}
                    heading(rowParent, srcItem, title || "(untitled)", () => self._wvBlOpenSource(srcItem, null), g.owner);
                }
                const rows = (g.srcs.get(srcItem.id) || []).sort((a, b) => (a.src.at || 0) - (b.src.at || 0));
                for (const r of rows) {
                    // The item pane's rows: the source's line with only its
                    // own page -- the place the link names is the target's,
                    // the heading's (MJT 2026-11-02, "For backlinks, the
                    // information that the annotation cited is on page 3 is
                    // already contained in the annotation row above"); the
                    // card's reference block still names it.
                    const row = this._wvBlMakeRow(doc, rowParent, {
                        cls: "wv-bl-ref-" + r.src.ref,
                        ...(compact
                            ? { pair: { from: this._wvBlEnd(doc, r.srcItem, "", false), to: this._wvBlEnd(doc, r.target), lead: "to" as const, cont: !!head, mark: this._wvBlRefKind(r.src, r.target).mark } }
                            : { icon: this._wvBlIcon(doc, r.target), label: this._wvBlRowLabel(r.src, r.target), chip: this._wvBlChip(r.src, r.target, item) }),
                        annText: blAnnText(r.srcItem),
                        targetHl: wvBlTargetHl(r.target, item),
                        internal: r.src.internal ? g.title : null,
                        segs: r.src.excerpt.segs,
                        compact,
                        open: (newWindow) => self._wvBlOpenSource(r.srcItem, r.src, { newWindow }),
                        menu: (ev) => self._wvBlOpenMenu(ev, r.srcItem, g.owner, r.target),
                        card: (el) => self._wvBlCardShow(el),
                        onKey,
                    });
                    row._wvBlSrcID = r.src.srcID;
                    row._wvBlTargetID = r.target ? r.target.id : null;
                    row._wvBlSrc = r.src;
                    row._wvBlSrcItem = r.srcItem;
                    row._wvBlTarget = r.target;
                    row._wvBlItem = item;
                    row._wvBlOwnerTitle = g.title;
                    n++;
                }
            }
        }
        if (head) head._wvBlSetN(n);
        return n;
    }

    /** An item-pane group: a heading for `target` under `item` as the Tags
     *  and Related sections head a part (pane-scope.ts
     *  `_wvScopeRenderGroups`; constants.ts `.wv-scope-block`) -- its icon,
     *  its name ("This item" for `item` itself), the group's count at the
     *  right end, set by `_wvBlSetN` once the rows are in -- a press going to
     *  the part as theirs does; the rows go into the box under it (MJT
     *  2026-10-30, "The format for This item and similar lines is not
     *  consistent" -> "Option (b)": the same headings, the rows keeping their
     *  arrows). */
    _wvBlHeadGroup(doc: any, parent: any, target: any, item: any): any {
        const self: any = this;
        const win = doc.defaultView;
        const box = wvHtmlEl(doc, "div", "wv-count-group wv-bl-hgroup", undefined, parent);
        const head = wvHtmlEl(doc, "div", "wv-count-group-head", undefined, box);
        try { head.appendChild(self._wvCountItemIcon(doc, win, target)); } catch (e) {}
        let label = "";
        try { label = self._wvCountSourceLabel(target, item) || ""; } catch (e) {}
        wvHtmlEl(doc, "span", "wv-count-group-title", label || "(untitled)", head);
        const chip = self._wvCountHeadChip(doc, head, target, item);
        head.title = label + (chip ? " · " + chip : "");
        const n = wvHtmlEl(doc, "span", "wv-count-group-n", "", head);
        box._wvBlSetN = (k: number) => { n.textContent = String(k); };
        if (target && item && target.id !== item.id) {
            const go = () => { try { self._wvScopeGoTo(target); } catch (e) {} };
            head.setAttribute("role", "button");
            head.setAttribute("tabindex", "0");
            head.addEventListener("click", (e: any) => { e.stopPropagation(); go(); });
            head.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); go(); } });
        }
        return box;
    }

    /** The arrow / Enter / Escape handling of a row list drawn from the
     *  index (Backlinks, Links): Up/Down, Home/End between the rows and
     *  the collapsed-row toggles not hidden; Enter or Space opens a row
     *  (`_wvBlOpen`, Shift for a new window) or works a toggle
     *  (`_wvBlToggle`, Right/Left open and close it); Escape hides the card. */
    _wvBlKeyHandler(host: any, doc: any): (ev: any) => void {
        return (ev: any) => {
            const el = ev.currentTarget, k = ev.key;
            if (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End") {
                const stops = (Array.from(host.querySelectorAll(".wv-bl-row, .wv-bl-more-toggle")) as any[]).filter(s => !s.closest("[hidden]"));
                const i = stops.indexOf(el);
                const j = k === "Home" ? 0 : k === "End" ? stops.length - 1 : i + (k === "ArrowDown" ? 1 : -1);
                if (j >= 0 && j < stops.length && j !== i) stops[j].focus();
                ev.preventDefault(); ev.stopPropagation();
                return;
            }
            if (k === "Escape") { if (blCardHide(doc)) { ev.preventDefault(); ev.stopPropagation(); } return; }
            if (el._wvBlToggle) {
                if (k === "Enter" || k === " ") el._wvBlToggle();
                else if (k === "ArrowRight") el._wvBlToggle(true);
                else if (k === "ArrowLeft") el._wvBlToggle(false);
                else return;
                ev.preventDefault(); ev.stopPropagation();
                return;
            }
            if (k === "Enter" || k === " ") {
                ev.preventDefault(); ev.stopPropagation();
                if (typeof el._wvBlOpen === "function") el._wvBlOpen(!!ev.shiftKey);
            }
        };
    }

    /** One row of a list drawn from the index: icon, an optional head line,
     *  the label and chip, then the annotated text and the two-line excerpt
     *  unless `compact` -- or, given a `pair`, the item pane's two lines, the
     *  second hung from the first by an arrow; a click opens it (Shift, a
     *  middle click or Shift+Enter in a new window -- MJT 2026-10-26;
     *  Zotero's Shift rule for notes, the collections tree's middle click;
     *  the middle press is taken so it starts no autoscroll), a right-click
     *  gets `menu`, a rest or keyboard focus `card`. `open` is called at
     *  gesture time, so an own-property stub over the shared method is seen. */
    _wvBlMakeRow(doc: any, parent: any, o: WvBlRowOpts): any {
        const row = wvHtmlEl(doc, "div", "wv-bl-row " + o.cls + (o.pair ? " wv-bl-pair" : ""), undefined, parent);
        row.setAttribute("tabindex", "0");
        if (o.pair) {
            const lead = o.pair.lead, other = lead === "from" ? "to" : "from";
            if (o.pair.cont) row.classList.add("wv-bl-cont");
            for (const side of (o.pair.cont ? [other] : [lead, other])) {
                const e = o.pair[side];
                const line = wvHtmlEl(doc, "div", "wv-bl-end wv-bl-" + side, undefined, row);
                if (side === other) line.appendChild(blArrow(doc, lead === "from" ? "down" : "up", o.pair.mark || null));
                line.appendChild(e.icon);
                const main = wvHtmlEl(doc, "span", "wv-bl-end-main", e.main, line);
                // A link in the title, marked as the Related section's labels
                // are (pane.ts _processRelatedBoxes): in its kind's colour,
                // opened by the main window's press handler, not by the row
                // (MJT 2026-10-29, "Links in Links and Backlinks should be
                // clickable and in the appropriate color").
                try { (this as any)._markTextLinks(main, { mode: "tree" }); } catch (x) {}
                if (e.chip || e.file) {
                    const chip = wvHtmlEl(doc, "span", "wv-bl-end-chip", undefined, line);
                    if (e.file) wvHtmlEl(doc, "span", "wv-bl-end-file", e.file, chip);
                    if (e.chip) wvHtmlEl(doc, "span", "wv-bl-end-place", (e.file ? " · " : "") + e.chip, chip);
                }
                // No U-turn here: the header's internal-links count says how
                // many and filters them (MJT 2026-10-30, "Also remove the
                // internal link icon at the end of the line for now"; it ended
                // each internal row from dev.109). The popups' rows keep it.
            }
        }
        else {
            row.appendChild(o.icon);
            const text = wvHtmlEl(doc, "div", "wv-bl-text", undefined, row);
            if (o.head) wvHtmlEl(doc, "div", "wv-bl-head", o.head, text);
            const meta = wvHtmlEl(doc, "div", "wv-bl-meta", undefined, text);
            wvHtmlEl(doc, "span", "wv-bl-label", o.label, meta);
            if (o.chip) wvHtmlEl(doc, "span", "wv-bl-chip", o.chip, meta);
            if (o.internal != null) meta.appendChild(wvBlInternalMark(doc, o.internal));
            if (!o.compact) {
                if (o.targetHl && o.targetHl.text) {
                    const hl = wvHtmlEl(doc, "div", "wv-bl-target-hl", o.targetHl.text, text);
                    if (o.targetHl.color) hl.style.borderInlineStartColor = o.targetHl.color;
                }
                if (o.annText) wvHtmlEl(doc, "div", "wv-bl-ann-text", "“" + o.annText + "”", text);
                blDrawSegs(doc, wvHtmlEl(doc, "div", "wv-bl-excerpt", undefined, text), o.segs);
            }
        }
        row._wvBlOpen = (newWindow: boolean) => {
            blCardHide(doc);
            try { const p = o.open(newWindow); if (p && typeof p.catch === "function") p.catch(() => {}); } catch (e) {}
        };
        row.addEventListener("click", (ev: any) => { ev.stopPropagation(); row._wvBlOpen(!!ev.shiftKey); });
        row.addEventListener("mousedown", (ev: any) => { if (ev.button === 1) ev.preventDefault(); row._wvBlMouse = true; });
        row.addEventListener("auxclick", (ev: any) => {
            if (ev.button !== 1) return;
            ev.preventDefault(); ev.stopPropagation();
            row._wvBlOpen(true);
        });
        row.addEventListener("contextmenu", (ev: any) => { ev.preventDefault(); ev.stopPropagation(); blCardHide(doc); o.menu(ev); });
        row.addEventListener("keydown", o.onKey);
        // The card after a rest (the bookmark card's 450 ms), at once on
        // keyboard focus; a mouse press focuses the row too, and that focus
        // is not asking for it.
        const win = doc.defaultView;
        row.addEventListener("mouseenter", () => {
            try { win.clearTimeout(row._wvBlCardT); } catch (e) {}
            row._wvBlCardT = win.setTimeout(() => { if (row.matches(":hover")) o.card(row); }, BL_CARD_DELAY);
        });
        row.addEventListener("mouseleave", () => { try { win.clearTimeout(row._wvBlCardT); } catch (e) {} blCardHide(doc); });
        row.addEventListener("focus", () => { if (row._wvBlMouse) { row._wvBlMouse = false; return; } o.card(row); });
        row.addEventListener("blur", () => { row._wvBlMouse = false; blCardHide(doc); });
        return row;
    }

    /** The source's whole context around the reference, for the card: cut
     *  from the source's current text where the index found it; the row's
     *  own excerpt when the text moved since. */
    _wvBlWideSegs(srcItem: any, src: WvBacklinkSource): WvBlSeg[] {
        try {
            const isAnn = !!(srcItem.isAnnotation && srcItem.isAnnotation());
            const text = isAnn ? String(srcItem.annotationComment || "") : String((srcItem.getNote && srcItem.getNote()) || "");
            const at = src.at, len = src.len;
            const here = text.slice(at, at + len);
            const ok = src.ref === "link" ? here === src.url : /^<(span|img)\b/i.test(here);
            if (ok) return wvBlExcerpt(text, at, len, !isAnn, BL_CARD_BEFORE, src.ref === "link" ? { after: BL_CARD } : { after: BL_CARD, label: src.label || "" }).segs;
        } catch (e) {}
        return src.excerpt.segs;
    }

    /** The hover card for a Backlinks `row`: the source's lineage and the
     *  reference on the left, the target's lineage on the right. */
    _wvBlCardShow(row: any) {
        const src: WvBacklinkSource = row._wvBlSrc, srcItem = row._wvBlSrcItem;
        if (!src || !srcItem) return;
        this._wvBlCardOpen(row, (card: any, doc: any) => {
            this._wvBlCardLineage(card, doc, { srcItem, src, target: row._wvBlTarget, back: true });
            wvHtmlEl(doc, "div", "wv-bl-card-foot", WV_BL_CARD_FOOT, card);
        });
    }

    /** The Related rows' card (MJT 2026-10-30, "For Related items, the
     *  current format does not allow me to know to which item the
     *  annotation or the attachment or the item note belong to. Please make
     *  an hover popup to show that, similar to the links" -> "Both ends,
     *  like Links", "Everywhere Related rows show"): the item the relation
     *  is on and the related item, each with its lineage as a Links card
     *  draws a reference's two ends; the arrow has a head at both ends -- a
     *  relation goes both ways. `foot`: what a press on the row does. */
    _wvRelCardShow(row: any, own: any, rel: any, foot: string) {
        if (!own || !rel) return;
        this._wvBlCardOpen(row, (card: any, doc: any) => {
            card.setAttribute("data-wv-both-ways", "true");
            const linS = blLineage(own), linT = blLineage(rel);
            const k = this._wvBlCardShared(card, doc, linS, linT);
            const cols = wvHtmlEl(doc, "div", "wv-bl-card-cols", undefined, card);
            const colS = wvHtmlEl(doc, "div", "wv-bl-card-col", undefined, cols);
            colS.setAttribute("data-side", "source");
            wvHtmlEl(doc, "div", "wv-bl-card-side", "Item", colS);
            linS.forEach((it, i) => { if (i >= k) this._wvBlCardNode(doc, colS, it, i); });
            const colT = wvHtmlEl(doc, "div", "wv-bl-card-col", undefined, cols);
            colT.setAttribute("data-side", "target");
            wvHtmlEl(doc, "div", "wv-bl-card-side", "Related", colT);
            linT.forEach((it, i) => { if (i >= k) this._wvBlCardNode(doc, colT, it, i); });
            if (foot) wvHtmlEl(doc, "div", "wv-bl-card-foot", foot, card);
        });
    }

    /** `el` shows a card as a Links row does (`_wvBlMakeRow`): after a rest
     *  (BL_CARD_DELAY), at once on keyboard focus -- not on the focus a
     *  mouse press gives --; leaving, a blur, a press or Escape hides it.
     *  Keyed listeners, swept with the instance; `show` is looked up on the
     *  live plugin at the gesture (a hot reload keeps Zotero's rows). */
    _wvBlCardHover(el: any, key: string, show: (lp: any) => void) {
        try {
            const doc = el.ownerDocument, win = doc.defaultView, tag = (this as any)._wvWireTag();
            const fire = () => { const lp: any = wvLivePlugin(); if (lp) show(lp); };
            const stop = () => { try { win.clearTimeout(blHoverT.get(el)); } catch (e) {} };
            wvListen(el, key + ":enter", "mouseenter", () => {
                stop();
                blHoverT.set(el, win.setTimeout(() => { if (el.matches(":hover")) fire(); }, BL_CARD_DELAY));
            }, false, tag);
            wvListen(el, key + ":leave", "mouseleave", () => { stop(); blCardHide(doc); }, false, tag);
            wvListen(el, key + ":down", "mousedown", () => { blHoverMouse.add(el); stop(); blCardHide(doc); }, false, tag);
            wvListen(el, key + ":focus", "focus", () => { if (blHoverMouse.delete(el)) return; fire(); }, false, tag);
            wvListen(el, key + ":blur", "blur", () => { blHoverMouse.delete(el); blCardHide(doc); }, false, tag);
            wvListen(el, key + ":esc", "keydown", (ev: any) => { if (ev.key === "Escape" && blCardHide(doc)) { ev.preventDefault(); ev.stopPropagation(); } }, false, tag);
        } catch (e) {}
    }

    /** One line of a lineage tree: Zotero's icon for the item (an annotation
     *  in its colour), its title -- an annotation's line the reader's header,
     *  its page and who wrote it --, grey sub-lines -- a paper's creators ·
     *  year · publication, an annotation's text and comment (clipped). The
     *  file is its own node, so an annotation line never repeats it. */
    _wvBlCardNode(doc: any, parent: any, item: any, depth: number, opts: { noComment?: boolean } = {}) {
        const node = wvHtmlEl(doc, "div", "wv-bl-card-node", undefined, parent);
        node.setAttribute("data-depth", String(depth));
        let kind = "paper", main = "", hl = "", hlColor = "";
        let author = { name: "", authoritative: false };
        const sub: string[] = [];
        const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
        try {
            if (item.isAnnotation && item.isAnnotation()) {
                kind = "annotation";
                // The reader's annotation header (reader preview.js): "Page N"
                // on the left -- "Page -" for a PDF's annotation without a
                // label, nothing for an EPUB's or a snapshot's --, who wrote it
                // at the right end. The icon already says it is an annotation
                // and of which kind (MJT 2026-11-02, "The information
                // annotation and highlight are already contained in the icon.
                // Use a format similar the header line in the annotations pane
                // of the reader"; "Annotation p. N · type" until dev.139).
                const pl = String(item.annotationPageLabel || "");
                let pdf = false;
                try { const att = Zotero.Items.get(item.parentItemID); pdf = !!(att && att.attachmentContentType === "application/pdf"); } catch (e) {}
                main = pl || pdf ? blReaderPage() + " " + (pl || "-") : "";
                author = blAnnAuthor(item);
                // The highlighted text drawn as Zotero's reader cards draw it:
                // a bar in the annotation's colour, the normal text colour, no
                // quotes -- a grey quoted sub-line read as a caption (MJT
                // 2026-10-28, "I cannot see ... what is the highlighted text").
                const txt = String(item.annotationText || "").replace(/\s+/g, " ").trim();
                if (txt) { hl = clip(txt, 240); hlColor = String(item.annotationColor || ""); }
                // The source annotation's comment IS the reference block
                // under the tree (the link highlighted in it): not twice
                // (MJT 2026-10-27, "The link context is displayed twice").
                const cm = opts.noComment ? "" : String(item.annotationComment || "").replace(/\s+/g, " ").trim();
                if (cm) sub.push("comment: " + clip(cm));
            }
            else if (item.isNote && item.isNote()) { kind = "note"; main = item.getNoteTitle() || "Note"; }
            else if (item.isAttachment && item.isAttachment()) { kind = "attachment"; main = item.getDisplayTitle() || blAttKind(item); }
            else {
                main = item.getDisplayTitle() || "(untitled)";
                let who = "", year = "", pub = "";
                try { who = item.firstCreator || ""; } catch (e) {}
                try { year = String(item.getField("date", true, true) || "").slice(0, 4); } catch (e) {}
                try { pub = item.getField("publicationTitle") || item.getField("publisher") || ""; } catch (e) {}
                const meta = [who, year, pub].filter(Boolean).join(" · ");
                if (meta) sub.push(meta);
            }
        } catch (e) {}
        node.setAttribute("data-kind", kind);
        node.appendChild(this._wvBlIcon(doc, item));
        const body = wvHtmlEl(doc, "div", "wv-bl-card-node-body", undefined, node);
        const m = wvHtmlEl(doc, "div", "wv-bl-card-node-main", kind === "annotation" ? undefined : main, body);
        if (kind === "annotation") {
            m.classList.add("wv-bl-card-node-head");
            wvHtmlEl(doc, "span", "wv-bl-card-node-page", main, m);
            if (author.name) {
                node.classList.add("wv-bl-card-node-authored");
                const a = wvHtmlEl(doc, "span", "wv-bl-card-node-author", author.name, m);
                if (!author.authoritative) a.classList.add("wv-non-authoritative");
            }
        }
        if (hl) {
            const h = wvHtmlEl(doc, "div", "wv-bl-card-node-hl", hl, body);
            if (hlColor) h.style.borderInlineStartColor = hlColor;
        }
        for (const s of sub) wvHtmlEl(doc, "div", "wv-bl-card-node-sub", s, body);
        return node;
    }

    /** What two lineages share -- the paper, the file too when both ends
     *  are in it -- drawn once at the card's top, above the two columns'
     *  headers; returns how many nodes that is, for the columns to go on
     *  from (MJT 2026-11-02, "Can you find a format where the parent item is
     *  not repeated? Maybe put it above the Source / Target headers?" ->
     *  "Every shared parent"). An end that IS what they share -- a note
     *  linking to its own paper, a paper related to its own annotation --
     *  goes up there too, its column left empty and marked
     *  (`data-wv-end`: "source" for `a`'s, "target" for `b`'s) for the
     *  arrow to climb to it ("Arrow to the top title", _wvBlCardArrowUp);
     *  not on a stacked card, which has no gap for that arrow, nor when
     *  both ends are the same item. */
    _wvBlCardShared(card: any, doc: any, a: any[], b: any[]): number {
        let k = 0;
        const n = Math.min(a.length, b.length);
        while (k < n && a[k] && b[k] && a[k].id === b[k].id) k++;
        const isEnd = () => k === a.length || k === b.length;
        if (k === a.length && k === b.length) k--;
        if (k > 0 && isEnd() && blCardStacked(doc.defaultView)) k--;
        if (k <= 0) return 0;
        const top = wvHtmlEl(doc, "div", "wv-bl-card-shared", undefined, card);
        if (isEnd()) top.setAttribute("data-wv-end", k === a.length ? "source" : "target");
        for (let i = 0; i < k; i++) this._wvBlCardNode(doc, top, a[i], i);
        return k;
    }

    /** The card's body for one reference (both sections, the count popups
     *  too): SOURCE on the left -- its lineage; TARGET on the right -- its
     *  lineage, or why it is broken; an arrow between, the reference's
     *  direction (MJT 2026-10-27, "I need full context of the source and the
     *  target"); under both, the reference's kind and its excerpt with the
     *  reference highlighted, across the card (2026-10-28). */
    _wvBlCardLineage(card: any, doc: any, o: { srcItem: any; src: WvBacklinkSource; target: any; broken?: string | null; url?: string; back?: boolean }) {
        const linS = blLineage(o.srcItem), linT = o.target ? blLineage(o.target) : [];
        const k = this._wvBlCardShared(card, doc, linS, linT);
        const cols = wvHtmlEl(doc, "div", "wv-bl-card-cols", undefined, card);
        // A Backlinks row reads right to left -- the target first, the source
        // after it, the arrow back (MJT 2026-10-27: "When it is a backlink, the
        // target should be on the left"); a Links row source first.
        const colT = wvHtmlEl(doc, "div", "wv-bl-card-col", undefined, o.back ? cols : undefined);
        colT.setAttribute("data-side", "target");
        const colS = wvHtmlEl(doc, "div", "wv-bl-card-col", undefined, cols);
        colS.setAttribute("data-side", "source");
        if (!o.back) cols.appendChild(colT);
        wvHtmlEl(doc, "div", "wv-bl-card-side", "Source", colS);
        linS.forEach((it, i) => { if (i >= k) this._wvBlCardNode(doc, colS, it, i, { noComment: it === o.srcItem }); });
        // The reference and its context under BOTH columns, the card's full
        // width: the arrow already says where it is written and where it
        // points (MJT 2026-10-28, "the link can use the full width" / "So
        // that the preview can display more context"); in the source column
        // it took half the width and its 12 lines held half the text.
        const ref = wvHtmlEl(doc, "div", "wv-bl-card-ref", undefined, card);
        // Its kind by its icon, then what it does: "Zotero link — Open at
        // page 1", "Note citation — p. 7" (_wvBlRefKind). The icon is on the
        // arrow too (`data-wv-ref-mark`, _wvBlCardArrowDraw; MJT 2026-11-02,
        // "Move the link type icon to the arrow, same as for related", then
        // "Actually, also keep the link type icon in front of the Zotero Link
        // header" -- dev.145 had it on the arrow only).
        const rk = this._wvBlRefKind(o.src, o.target);
        card.setAttribute("data-wv-ref-mark", rk.mark);
        const lab = wvHtmlEl(doc, "div", "wv-bl-card-ref-label", undefined, ref);
        lab.appendChild(wvRefMarkGlyphEl(doc, rk.mark, { cls: "wv-bl-card-ref-icon" }));
        wvHtmlEl(doc, "span", "wv-bl-card-ref-kind", rk.kind + (rk.action ? " — " + rk.action : ""), lab);
        blDrawSegs(doc, wvHtmlEl(doc, "div", "wv-bl-card-text", undefined, ref), this._wvBlWideSegs(o.srcItem, o.src));
        wvHtmlEl(doc, "div", "wv-bl-card-side", "Target", colT);
        if (o.target) linT.forEach((it, i) => { if (i >= k) this._wvBlCardNode(doc, colT, it, i); });
        else {
            wvHtmlEl(doc, "div", "wv-bl-card-broken", o.broken === "library" ? "Library not in this profile" : "Item not found", colT);
            if (o.url) wvHtmlEl(doc, "div", "wv-bl-card-url", o.url, colT);
            wvHtmlEl(doc, "div", "wv-lk-why", o.broken === "library"
                ? "The link names a group library that is not in this profile."
                : "No item in the library has this key: it was deleted, or the link is wrong.", colT);
        }
    }

    /** The one hover card of `row`'s window, filled by `fill` and shown
     *  fixed there, below the row (above when it would leave the window);
     *  it never takes the pointer. A row in a frame opens it in the chrome
     *  window around the frame (`blCardHost`). */
    _wvBlCardOpen(row: any, fill: (card: any, doc: any) => void) {
        try {
            if (!row.isConnected) return;
            const host = blCardHost(row);
            const doc = host.doc, win = host.win;
            // A scroll in the row's own frame moves the row too.
            const rowWin = row.ownerDocument.defaultView;
            if (rowWin && rowWin !== win) wvListen(rowWin, "lazy:bl-card-scroll-frame", "scroll", () => blCardHide(doc), true, (this as any)._wvWireTag());
            this._wvBlEnsureStyle(doc);
            let card: any = doc.getElementById(BL_CARD_ID);
            if (!card) {
                card = wvHtmlEl(doc, "div");
                card.id = BL_CARD_ID;
                card.setAttribute("role", "tooltip");
                card.hidden = true;
                doc.documentElement.appendChild(card);
            }
            card.removeAttribute("data-wv-both-ways");
            card.removeAttribute("data-wv-ref-mark");
            // Any scroll hides it (it is fixed, its row moves); wired on the
            // first card, swept with the instance.
            wvListen(win, "lazy:bl-card-scroll", "scroll", () => blCardHide(doc), true, (this as any)._wvWireTag());
            while (card.firstChild) card.removeChild(card.firstChild);
            fill(card, doc);
            const W = win.innerWidth, H = win.innerHeight;
            // Two columns side by side (the lineage card); stacked in a
            // window too narrow for them.
            card.style.maxWidth = Math.max(160, Math.min(580, W - 16)) + "px";
            card.classList.toggle("wv-bl-card-stack", blCardStacked(win));
            card.style.left = "0px"; card.style.top = "0px";
            card.hidden = false;
            const rr = row.getBoundingClientRect();
            const r = { left: rr.left + host.dx, top: rr.top + host.dy, bottom: rr.bottom + host.dy };
            const cw = card.offsetWidth, ch = card.offsetHeight;
            const left = Math.max(8, Math.min(r.left, W - cw - 8));
            let top = r.bottom + 4;
            if (top + ch > H - 8) top = Math.max(8, r.top - ch - 4);
            card.style.left = left + "px";
            card.style.top = top + "px";
            // Laid out: the arrow between the two lineages' leaves.
            try { this._wvBlCardArrow(card, doc); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] backlinks card err: " + e); }
    }

    /** The lineage card's arrow, drawn over the laid-out card: from the
     *  source's leaf -- the note or annotation the reference is written in
     *  -- to the target's leaf (its icon), or to the broken line. A curve
     *  across the gap; down the column when the card is stacked. */
    _wvBlCardArrow(card: any, doc: any) {
        const old = card.querySelector(".wv-bl-card-arrow");
        if (old) old.remove();
        const colS = card.querySelector('[data-side="source"]'), colT = card.querySelector('[data-side="target"]');
        if (!colS || !colT) return;
        const C = card.getBoundingClientRect(), rS = colS.getBoundingClientRect(), rT = colT.getBoundingClientRect();
        const stacked = card.classList.contains("wv-bl-card-stack");
        const up = card.querySelector(".wv-bl-card-shared[data-wv-end]");
        if (up && !stacked) { this._wvBlCardArrowUp(card, doc, up, colS, colT, C); return; }
        const nodesS = colS.querySelectorAll(".wv-bl-card-node"), nodesT = colT.querySelectorAll(".wv-bl-card-node");
        const leafS = nodesS[nodesS.length - 1];
        const leafT = nodesT.length ? nodesT[nodesT.length - 1] : colT.querySelector(".wv-bl-card-broken");
        if (!leafS || !leafT) return;
        // Which way the arrow runs follows where the columns are: a Links
        // card source left, a Backlinks card source right (the arrow back).
        const forward = stacked ? rS.top <= rT.top : rS.left <= rT.left;
        // Leaving the source's leaf at the end of its line when the target is
        // to the right, at its icon when it is to the left; arriving at the
        // target's icon from the left, at the end of its line from the right.
        const mainS = leafS.querySelector(".wv-bl-card-node-main") || leafS, iconS = leafS.querySelector(".wv-bl-kind") || leafS;
        const mainT = leafT.querySelector(".wv-bl-card-node-main") || leafT, iconT = leafT.querySelector(".wv-bl-kind") || leafT;
        const a = (forward || stacked ? mainS : iconS).getBoundingClientRect(), b = (forward || stacked ? iconT : mainT).getBoundingClientRect();
        if (!C.width || !a.width || !b.width) return;
        let x1: number, y1: number, x2: number, y2: number;
        if (!stacked) {
            y1 = a.top - C.top + a.height / 2; y2 = b.top - C.top + b.height / 2;
            if (forward) { x1 = a.right - C.left + 5; x2 = b.left - C.left - 4; }
            else { x1 = a.left - C.left - 4; x2 = b.right - C.left + 5; }
        }
        else if (forward) { x1 = a.left - C.left + 10; y1 = a.bottom - C.top + 2; x2 = b.left - C.left + b.width / 2; y2 = b.top - C.top - 3; }
        else { x1 = a.left - C.left + 10; y1 = a.top - C.top - 2; x2 = b.left - C.left + b.width / 2; y2 = b.bottom - C.top + 3; }
        const sign = forward ? 1 : -1;
        let d: string, c2: number[];
        if (!stacked) {
            // Across the gap only: out of the source's line to the gap's near
            // edge, the vertical travel as an S inside the gap, then along the
            // target's own line to its end -- never over the other column's
            // text (MJT 2026-10-27, "avoid that the arrow overlaps with the
            // text").
            const near = (forward ? rS.right : rS.left) - C.left, far = (forward ? rT.left : rT.right) - C.left;
            const ga = forward ? Math.max(x1, near) : Math.min(x1, near), gb = forward ? Math.min(x2, far) : Math.max(x2, far);
            const mid = (ga + gb) / 2;
            c2 = [mid, y2];
            d = "M" + x1 + "," + y1 + " L" + ga + "," + y1 + " C" + mid + "," + y1 + " " + mid + "," + y2 + " " + gb + "," + y2 + " L" + x2 + "," + y2;
        }
        else {
            const bend = Math.max(14, Math.abs(y2 - y1) * 0.5);
            const c1 = [x1, y1 + sign * bend];
            c2 = [x2, y2 - sign * bend];
            d = "M" + x1 + "," + y1 + " C" + c1[0] + "," + c1[1] + " " + c2[0] + "," + c2[1] + " " + x2 + "," + y2;
        }
        // Halfway along the arrow: the middle of the S across the gap; the
        // cubic's point at t = 1/2 when stacked.
        let mx: number, my: number;
        if (!stacked) { mx = Number(c2[0]); my = (y1 + y2) / 2; }
        else {
            const p1 = [x1, y1 + sign * Math.max(14, Math.abs(y2 - y1) * 0.5)];
            mx = 0.125 * x1 + 0.375 * p1[0] + 0.375 * c2[0] + 0.125 * x2;
            my = 0.125 * y1 + 0.375 * p1[1] + 0.375 * c2[1] + 0.125 * y2;
        }
        // The head along the end tangent (across the gap: the target's line);
        // a relation's at the start too, along the start tangent reversed.
        this._wvBlCardArrowDraw(card, doc, d, [x2, y2, stacked ? x2 - c2[0] : sign, stacked ? y2 - c2[1] : 0],
            [x1, y1, stacked ? 0 : -sign, stacked ? -sign : 0], [mx, my], !nodesT.length);
    }

    /** The arrow to an end drawn at the card's top (`_wvBlCardShared`'s
     *  `data-wv-end`): from the other end's leaf into the gap between the
     *  columns, up the gap, then left to the end of that item's title --
     *  reaching a leaf in the right column at its icon, one in the left
     *  column out of its line's end: never across a column's text (MJT
     *  2026-11-02, "Arrow to the top title, but arrow stays on the left side
     *  of the target"). The shared block is as wide as the left column, so
     *  the title ends before the gap. */
    _wvBlCardArrowUp(card: any, doc: any, up: any, colS: any, colT: any, C: any) {
        const topSide = up.getAttribute("data-wv-end");
        const col = topSide === "source" ? colT : colS, empty = topSide === "source" ? colS : colT;
        const nodes = col.querySelectorAll(".wv-bl-card-node"), tops = up.querySelectorAll(".wv-bl-card-node");
        const leaf = nodes[nodes.length - 1], topNode = tops[tops.length - 1];
        if (!leaf || !topNode || !C.width) return;
        const rC = col.getBoundingClientRect(), rE = empty.getBoundingClientRect();
        const right = rC.left > rE.left;
        const tm = (topNode.querySelector(".wv-bl-card-node-main") || topNode).getBoundingClientRect();
        const lb = (right ? leaf.querySelector(".wv-bl-kind") : leaf.querySelector(".wv-bl-card-node-main")) || leaf;
        const lr = lb.getBoundingClientRect();
        if (!tm.width || !lr.width) return;
        const gx = ((right ? rE.right : rC.right) + (right ? rC.left : rE.left)) / 2 - C.left;
        const lx = right ? lr.left - C.left - 4 : lr.right - C.left + 5, ly = lr.top - C.top + lr.height / 2;
        const tx = tm.right - C.left + 5, ty = tm.top - C.top + tm.height / 2;
        const r = Math.max(0, Math.min(8, (ly - ty) / 2)), into = right ? r : -r;
        const d = "M" + lx + "," + ly + " L" + (gx + into) + "," + ly + " Q" + gx + "," + ly + " " + gx + "," + (ly - r)
            + " L" + gx + "," + (ty + r) + " Q" + gx + "," + ty + " " + (gx - r) + "," + ty + " L" + tx + "," + ty;
        // The leaf's head points into it from the gap; the title's, leftward.
        const atLeaf = [lx, ly, right ? 1 : -1, 0], atTop = [tx, ty, -1, 0];
        // The path runs leaf -> title; the target's end takes the head.
        this._wvBlCardArrowDraw(card, doc, d, topSide === "target" ? atTop : atLeaf, topSide === "target" ? atLeaf : atTop, [gx, (ly + ty) / 2], false);
    }

    /** The card's arrow SVG: the line `d`, a head at `end` ([x, y, and the
     *  direction the line runs there]), one at `start` too on a relation's
     *  card, and on the point `mid` the Related icon or a broken link's
     *  cross. */
    _wvBlCardArrowDraw(card: any, doc: any, d: string, end: number[], start: number[], mid: number[], broken: boolean) {
        const svg = wvSvgEl(doc, "svg", { class: "wv-bl-card-arrow", "aria-hidden": "true" });
        wvSvgEl(doc, "path", { d, fill: "none", stroke: "currentColor", "stroke-width": "1.5" }, svg);
        const head = (px: number, py: number, tx: number, ty: number) => {
            const len = Math.hypot(tx, ty) || 1, ux = tx / len, uy = ty / len;
            const hl = 6.5, hw = 3.5, hx = px - ux * hl, hy = py - uy * hl;
            wvSvgEl(doc, "path", { d: "M" + px + "," + py + " L" + (hx - uy * hw) + "," + (hy + ux * hw) + " L" + (hx + uy * hw) + "," + (hy - ux * hw) + " Z", fill: "currentColor" }, svg);
        };
        head(end[0], end[1], end[2], end[3]);
        const [mx, my] = mid;
        // A relation goes both ways (the Related card, `_wvRelCardShow`).
        if (card.hasAttribute("data-wv-both-ways")) {
            head(start[0], start[1], start[2], start[3]);
            // Zotero's Related icon halfway (MJT 2026-11-02, "Can you put a
            // related icon on the double arrow?"): its glyph from
            // itempane/16/related.svg (_makeRelationsSvg), 14 px, in the
            // Related section's colour, on a disc of the card's background as
            // the broken link's cross.
            const g = wvSvgEl(doc, "g", { class: "wv-bl-card-rel-icon" }, svg);
            wvSvgEl(doc, "circle", { cx: mx, cy: my, r: 9, class: "wv-bl-card-icon-bg" }, g);
            const glyph = (this as any)._makeRelationsSvg(doc).querySelector("path");
            wvSvgEl(doc, "path", { class: "wv-bl-card-rel-glyph", d: glyph.getAttribute("d"), fill: "currentColor",
                transform: "translate(" + (mx - 7) + "," + (my - 7) + ") scale(0.875)" }, g);
        }
        // A reference's kind -- a Zotero link, a note citation -- by its icon
        // halfway, as the Related card's (MJT 2026-11-02, "Move the link type
        // icon to the arrow, same as for related"): the chain with its Z or
        // its quote mark (lib/link-glyph.ts), 14 px, in the arrow's grey, on a
        // disc of the card's background. A broken link's cross takes the place.
        const refMark = card.getAttribute("data-wv-ref-mark");
        if (refMark && !broken && !card.hasAttribute("data-wv-both-ways")) {
            const g = wvSvgEl(doc, "g", { class: "wv-bl-card-ref-mark" }, svg);
            wvSvgEl(doc, "circle", { cx: mx, cy: my, r: 9, class: "wv-bl-card-icon-bg" }, g);
            const icon = wvRefMarkGlyphEl(doc, refMark as WvRefMark);
            icon.setAttribute("x", String(mx - 7));
            icon.setAttribute("y", String(my - 7));
            icon.setAttribute("width", "14");
            icon.setAttribute("height", "14");
            g.appendChild(icon);
        }
        // A broken link: a red cross halfway along the arrow (MJT 2026-10-30,
        // "Make a red cross on the broken link line in the popup"), on a disc
        // of the card's background so the line does not run through it.
        if (broken) {
            const g = wvSvgEl(doc, "g", { class: "wv-bl-card-broken-x" }, svg);
            wvSvgEl(doc, "circle", { cx: mx, cy: my, r: 6.5, class: "wv-bl-card-broken-x-bg" }, g);
            const k = 4;
            wvSvgEl(doc, "path", { d: "M" + (mx - k) + "," + (my - k) + " L" + (mx + k) + "," + (my + k) + " M" + (mx + k) + "," + (my - k) + " L" + (mx - k) + "," + (my + k),
                fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }, g);
        }
        card.insertBefore(svg, card.firstChild);
    }

    /** A click on a source: a note opens in a tab (the note-tab invariant:
     *  ZoteroPane.openNote with openInWindow false); an annotation opens its
     *  file at that annotation through the same path a link click takes. */
    async _wvBlOpenSource(srcItem: any, src: WvBacklinkSource, opts: { newWindow?: boolean } = {}) {
        const self: any = this;
        try {
            if (!srcItem) return;
            if (srcItem.isNote && srcItem.isNote()) {
                const win = Zotero.getMainWindow();
                if (win && win.ZoteroPane && typeof win.ZoteroPane.openNote === "function") {
                    // A tab, or with Shift / a middle click a note window
                    // (MJT 2026-10-26); either way scrolled to the reference.
                    const inst = await win.ZoteroPane.openNote(srcItem.id, { openInWindow: !!opts.newWindow });
                    if (inst || !opts.newWindow) {
                        try { await this._wvBlRevealInNote(inst, srcItem, src && src.url, (src && src.ref) || "link", (src && src.nth) || 0, !!(src && src.joined)); } catch (e) {}
                    }
                }
                return;
            }
            if (opts.newWindow && await self._wvOpenItemInNewWindow(srcItem)) return;
            if (srcItem.isAnnotation && srcItem.isAnnotation()) {
                const link = self._buildOpenLink(srcItem);
                if (link) { await self.handleZoteroURI(link); return; }
            }
            this._wvBlOpenItem(srcItem, "select");
        } catch (e) { Zotero.debug("[Weavero] backlinks open err: " + e); }
    }

    /** After a note backlink opens: scroll its link to the middle of the
     *  note and flash it, as Obsidian's Backlinks pane does (MJT 2026-10-23,
     *  "can it highlight the link in the note? What does Obsidian do?" ->
     *  "OK"). The flash is an overlay above the editor that fades out --
     *  never a change to the note's DOM (ProseMirror owns it) nor its
     *  selection (typing would replace a selected link). The editor fills
     *  its content asynchronously, so the link is polled for (3 s). */
    async _wvBlRevealInNote(inst: any, note: any, url: string | null, ref: WvBacklinkSource["ref"] = "link", nth = 0, joined = false): Promise<boolean> {
        if (!url) return false;
        const want = ref === "link" ? unescapeEntities(String(url)) : String(url);
        let iwin: any = null, range: any = null;
        for (let i = 0; i < 30 && !range; i++) {
            try {
                iwin = inst && inst._iframeWindow;
                if (!iwin) {
                    // A tab opened another way: its note-editor element.
                    const win = Zotero.getMainWindow();
                    const tabID = win && win.Zotero_Tabs && win.Zotero_Tabs.getTabIDByItemID(note.id);
                    const ed = tabID && win.document.getElementById(tabID) && win.document.getElementById(tabID).querySelector("note-editor");
                    iwin = ed && ed._editorInstance && ed._editorInstance._iframeWindow;
                }
                const root = iwin && iwin.document && (iwin.document.querySelector(".primary-editor") || iwin.document.querySelector(".ProseMirror"));
                if (root) range = wvBlFindInNote(root, want, ref, nth, joined);
            } catch (e) { range = null; }
            if (!range) await new Promise(r => setTimeout(r, 100));
        }
        if (!range || !iwin) return false;
        try {
            const el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
            if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" });
        } catch (e) {}
        wvBlFlash(iwin, range);
        return true;
    }

    /** Select an item in the library tab. */
    _wvBlOpenItem(item: any, _mode: "select") {
        const self: any = this;
        try {
            if (!item) return;
            const link = self._buildSelectLink(item);
            if (link) self.handleZoteroURI(link);
        } catch (e) {}
    }

    /** The row menu: Show in Library (Zotero's wording, zotero.ftl
     *  general-show-in-library), Copy Link, Add as Related -- relating the
     *  source's item to what the reference is aimed at. */
    _wvBlOpenMenu(ev: any, srcItem: any, owner: any, target: any) {
        const self: any = this;
        try {
            const doc = ev.target.ownerDocument;
            const tag = self._wvWireTag();
            let menu: any = doc.getElementById(BL_MENU_ID);
            if (menu && menu.getAttribute("data-wv-tag") !== tag) { menu.remove(); menu = null; }
            if (!menu) {
                menu = doc.createXULElement("menupopup");
                menu.id = BL_MENU_ID;
                menu.setAttribute("data-wv-tag", tag);
                wvPopupHost(doc).appendChild(menu);
            }
            while (menu.firstChild) menu.removeChild(menu.firstChild);
            wvMenuItem(doc, { label: "Show in Library", onCommand: () => self._wvBlOpenItem(srcItem, "select") }, menu);
            wvMenuItem(doc, {
                label: "Copy Link",
                onCommand: () => {
                    const link = (srcItem.isAnnotation && srcItem.isAnnotation()) ? self._buildOpenLink(srcItem) : self._buildSelectLink(srcItem);
                    if (link) Zotero.Utilities.Internal.copyTextToClipboard(link);
                },
            }, menu);
            // Never an item and a part of itself (an internal link: a note
            // quoting its own paper's annotation).
            const canRelate = owner && target && owner.id !== target.id && owner.libraryID === target.libraryID
                && !(owner.isAnnotation && owner.isAnnotation()) && (this._wvBlOwnerOf(target) || target).id !== owner.id;
            wvMenuSeparator(doc, menu);
            wvMenuItem(doc, {
                label: "Add as Related",
                disabled: !canRelate,
                onCommand: () => self._wvBlAddRelated(owner, target),
            }, menu);
            menu.openPopupAtScreen(ev.screenX, ev.screenY, true);
        } catch (e) { Zotero.debug("[Weavero] backlinks menu err: " + e); }
    }

    /** The user's explicit promotion of a backlink into Zotero's symmetric
     *  relation (both directions, Zotero's own undo). Never automatic. */
    async _wvBlAddRelated(a: any, b: any) {
        try {
            if (!a || !b || a.id === b.id || a.libraryID !== b.libraryID) return;
            await Zotero.DB.executeTransaction(async () => {
                let changed = false;
                if (a.addRelatedItem(b)) { await a.save({ skipDateModifiedUpdate: true }); changed = true; }
                if (b.addRelatedItem(a)) { await b.save({ skipDateModifiedUpdate: true }); changed = true; }
                if (changed) wvStageNativeUndo("undo-action-add-related");
            });
        } catch (e) { Zotero.debug("[Weavero] backlinks add related err: " + e); }
    }
}

const _backlinksDescriptors = Object.getOwnPropertyDescriptors(_BacklinksMixin.prototype);
delete (_backlinksDescriptors as any).constructor;
export const backlinksMethods = _backlinksDescriptors;
