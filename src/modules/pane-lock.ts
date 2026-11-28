// Module: lock item-pane sections at the bottom or at the top (branch
// panelock; MJT 2026-11-22: "I would like to be able to see directly the
// relevance card at the bottom right, without scrolling. But this is the same
// also for other item pane sections. I want to be able to lock the content of
// a pane at the bottom of the item pane, with fixed height. ... In the feeds,
// the relevance card would appear locked as default."; then, after trying
// 1.2.1-panelock.1: "Allow multiple sections with Lock at Bottom"; then, on
// branch locktop: "Also provide an option to lock at the top. Top or bottom
// should be distinguished by the position of the lock in the sidenav: top
// right or bottom right").
//
// LOCK AT TOP (branch locktop, MJT's picks): the same as at the bottom,
// mirrored -- the sections locked at the top stick at the top of the scroller,
// stacked in side-navigation order, FIRST in its flex column (`order: -1`),
// each with its divider at its BOTTOM edge (drag down: taller); their badge in
// the side navigation at the button's TOP end (Zotero's pin-mark spot); the
// same header padlock (a click unlocks); the same remembered height per
// section (`weavero.paneLock.heights`), whatever the position, so a section
// moved between top and bottom keeps it. Top and bottom locks share the pane
// (one fit: proportional shrink, PL_MIN_H, PL_ROOM for the scrolling middle).
// Menus: an unlocked section offers Lock at Top and Lock at Bottom, a section
// locked at the bottom Lock at Top (it moves) and Unlock, one locked at the
// top Lock at Bottom and Unlock. Stored in the same per-view list as the entry
// "top:<paneID>" (bottom locks stay bare ids: a build before locktop ignores a
// top entry -- it matches no section). The stack's height is written on the
// scroller (`--wv-panelock-inset`): its `scroll-padding-top`, so Zotero's
// scrollToPane (scrollIntoView, itemPaneContainerBase.mjs) lands a section
// BELOW the stack, not under it; Weavero's sticky section heads stick under
// it (pane.ts); WV-TEMP-134569's pin anchor holds the pinned section at the
// stack's bottom edge (pane.ts `_wvFixPinAnchor`, wvPaneLockInset).
//
// His picks:
//   - "Lock at Bottom" / "Unlock" in every section's own right-click menu --
//     Zotero's sections, Weavero's, other plugins' -- right after Zotero's Pin
//     Section / Unpin Section there (collapsibleSection.js _buildContextMenu;
//     "The ability to pin or unpin is also in the section header. Do the same
//     for the lock / unlock"), and in the side navigation's menu, beside the
//     same entries (itemPaneSidenav.js `.context-menu`);
//   - a padlock, closed, right before the twisty in a LOCKED section's header
//     only -- a click unlocks it; an unlocked section has none (panelock.2 drew
//     an open one on every other section: "I cannot make the difference
//     between the open padlock and the closed padlock. Just put the closed
//     padlock and no open padlock", MJT 2026-11-22);
//   - several sections may be locked: they stack at the bottom in the side
//     navigation's order (the order of the sections in the scroller), each with
//     its own divider (its top edge) -- a drag resizes it -- and its own
//     height, remembered per section (`weavero.paneLock.heights`, by pane id);
//     together they never take more than the pane holds (shrunk in proportion,
//     PL_ROOM kept for the scrolling part above); content taller than a
//     section's height scrolls inside it; unlocking one leaves the others;
//   - a locked section's button in the side navigation carries the locked
//     tab's gold padlock at its bottom end, Zotero's pin mark keeping the top
//     end ("Also show the lock icon in the sidenav, similar to the pinned
//     section", then "Use the same lock as the locked tab icon" and "Top or
//     bottom should be distinguished by the position of the lock in the
//     sidenav", MJT 2026-11-22; `_wvPaneLockMarkSidenav`);
//   - per VIEW -- library items, feed items, a reader's item pane (reader tab or
//     reader window) -- each its own list (`weavero.paneLock.<view>`, JSON);
//     the feeds start with Weavero's Why relevant locked (prefs-table.ts), the
//     others with nothing. Local prefs, never synced. panelock.1 stored ONE id
//     as a plain string: read as a list of one, rewritten (_wvPaneLockMigrate).
//
// Zotero's sections are NOT moved in the DOM (approach agreed with MJT): CSS
// keeps the locked ones at the bottom of the scroller -- last in its flex
// column (`order`), `position: sticky` at its visible bottom, fixed heights,
// an opaque background above the pinned headers -- so Zotero's own section
// code, Pin Section, the side navigation and its order keep working. Each
// locked section's `bottom` is the height of the locked ones below it; `top`
// is the scroller's height minus that and its own, so a section also stays
// in place past the last section, in the spacer Zotero adds so a pinned or
// clicked section can reach the top (`--min-scroll-height`,
// itemPaneContainerBase.mjs _makeSpaceForPane -- with `bottom` alone it would
// float above blank space; Gecko's sticky limits for a child of the scrolled
// frame take its scrollable overflow). Both written on every size change of
// the scroller or a locked section (`_wvPaneLockPlace`).
//
// Pin and lock exclude each other: Pin Section on a locked section unlocks
// that one (and scrolls it to the top, as Zotero's pin does -- Zotero's own
// scroll ran while it was still locked, and a locked section is never
// scrolled to: see the scrollToPane layer); locking the pinned section unpins
// it. A pin Zotero itself RESTORES (its render reads the saved pin, a reader
// tab takes the previous tab's: itemDetails.js _restorePinnedPane,
// contextPane.js _selectItemContext) is not the user's: the lock stays and
// the pin goes. A pin seen first by the pane's mutation observer, outside a
// render, is a gesture (the side navigation's menu or double-click, the
// header's menu).
//
// A section the item does not have (hidden: Why relevant on a library item)
// locks nothing for that item; the view's choice stays for the next item that
// has it. A collapsed locked section shows its header alone at the bottom.
//
// Every window: each main window's library item pane (one per library tab on
// zotero#6035), every reader tab's context pane (contextPane.js, one
// item-details per tab; the pane observer takes the ones created later,
// pane.ts), and the item pane Weavero builds in a standalone reader window
// (MJT 2026-11-22, "Also cover"; reader.ts _ensureReaderWindowItemPane wires
// it each time it builds or binds it). A reader window's pane takes the
// "reader" view's list: it shows the open document's item, as a reader tab's
// pane does. Per-element state in a WeakMap (window-wiring.spec.js records
// expandos). Reversible: destroy() takes every button, menu entry, class,
// variable, observer, listener, wrap and the sheet away.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvL10n } from "../lib/l10n";
import { winOf, wvSetBoolAttr, wvIsHiddenOrCollapsed } from "../lib/dom";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvMainWins, wvWinType } from "../lib/windows";
import { WV_BL_PLUGIN_ID } from "./backlinks";
import { WV_LOCK_GOLD_ICON } from "./tab-split-dock";

declare const Zotero: any;
declare const Services: any;

export type WvPlView = "library" | "feed" | "reader";
const PL_VIEWS: WvPlView[] = ["library", "feed", "reader"];

/** The class on a locked section element (the pane, a direct child of the
 *  scroller): WV-TEMP-134569's anchor counts such a pane as taking no room in
 *  the flow above the pinned section (pane.ts _wvFixPinAnchor). */
export const WV_PL_LOCKED = "wv-panelock-locked";
/** With WV_PL_LOCKED: the section is locked at the TOP (none: at the bottom). */
const PL_TOP = "wv-panelock-top";
/** The scroller's variable: the height of its sections locked at the top. */
export const WV_PL_INSET = "--wv-panelock-inset";
const PL_CLOSED = "wv-panelock-closed";
const PL_DRAGGING = "wv-panelock-dragging";
const PL_BTN = "wv-panelock-btn";
/** The side navigation menu's entries. */
const PL_MI_LOCK_TOP = "wv-panelock-mi-lock-top";
const PL_MI_LOCK = "wv-panelock-mi-lock";
const PL_MI_UNLOCK = "wv-panelock-mi-unlock";
const PL_MI_SEP = "wv-panelock-mi-sep";
/** A section header menu's entries (one set per section). */
const PL_HMI_LOCK_TOP = "wv-panelock-hmi-lock-top";
const PL_HMI_LOCK = "wv-panelock-hmi-lock";
const PL_HMI_UNLOCK = "wv-panelock-hmi-unlock";
const PL_HMI_SEP = "wv-panelock-hmi-sep";
const PL_OWNED = "panelock";
const PL_STYLE_ID = "wv-panelock-style";
const PL_VARS = ["--wv-panelock-h", "--wv-panelock-top", "--wv-panelock-bottom"];
/** A stored entry for a section locked at the top: "top:<paneID>". */
const PL_TOP_PREFIX = "top:";

/** Where a section is locked: "top", "bottom", or "" (not locked). */
export type WvPlPos = "top" | "bottom" | "";
/** A section's height until the user drags its divider (px). */
const PL_DEF_H = 200;
/** The smallest height a locked section is given while there is room for it,
 *  and the room always kept above the locked sections for the rest of the
 *  pane (px). */
const PL_MIN_H = 60;
const PL_ROOM = 40;
/** The divider: the section's 1-px top border and 4-px top padding. */
const PL_BAND = 5;

/** The windows whose item panes the lock reaches: every main window, and
 *  every standalone reader window -- Weavero builds an item pane of its own
 *  there (reader.ts _ensureReaderWindowItemPane: `#wv-reader-item-details`
 *  and `#wv-reader-item-sidenav`, outside any main window). */
function plWins(): any[] {
    const out: any[] = wvMainWins().slice();
    try {
        const en = Services.wm.getEnumerator("zotero:reader");
        while (en.hasMoreElements()) {
            const w: any = en.getNext();
            if (w && !w.closed && w.document && !out.includes(w)) out.push(w);
        }
    } catch (e) {}
    return out;
}

/** A view's locked sections as stored: a JSON list of entries, a pane id for a
 *  section locked at the bottom, "top:" and the id for one locked at the top
 *  ('["abstract","top:weavero-feeds"]'). 1.2.1-panelock.1 stored ONE id as a
 *  plain string ("abstract"): a list of one. "" and anything unreadable: none. */
function plParseList(v: any): string[] {
    if (typeof v !== "string") return [];
    const s = v.trim();
    if (!s) return [];
    if (s.charAt(0) !== "[") return [s];
    try {
        const a = JSON.parse(s);
        return Array.isArray(a) ? a.filter((x: any) => typeof x === "string" && !!plEntryID(x)) : [];
    } catch (e) { return []; }
}

/** A stored entry's pane id ("top:abstract" -> "abstract"). */
function plEntryID(s: string): string {
    return s.startsWith(PL_TOP_PREFIX) ? s.slice(PL_TOP_PREFIX.length) : s;
}

function plEntryTop(s: string): boolean {
    return s.startsWith(PL_TOP_PREFIX);
}

/** The height of the sections locked at the top of scroller `pp` (px), from
 *  the layout: the bottom edge of the stack -- where a section is "at the
 *  top" now (Zotero's scrollToPane lands it there through the scroller's
 *  scroll-padding; WV-TEMP-134569's anchor holds the pinned one there, pane.ts
 *  `_wvFixPinAnchor`). 0 without one. The stack is contiguous from the
 *  scroller's top edge (_wvPaneLockPlace). */
export function wvPaneLockInset(pp: any): number {
    let h = 0;
    try {
        for (const p of Array.from(pp.querySelectorAll(":scope > ." + WV_PL_LOCKED + "." + PL_TOP + ":not([hidden])")) as any[]) h += p.getBoundingClientRect().height;
    } catch (e) {}
    return h;
}

/** The padlock: the locked tab's (tab-split-dock.ts WV_LOCK_GOLD_ICON, gold body,
 *  steel shackle), one lock icon for Weavero -- a locked section's header, its
 *  side-navigation mark, Lock at Bottom and Unlock alike (MJT 2026-11-22, of the
 *  first mark, a white padlock on Zotero's blue pin round: "It is difficult to
 *  distinguish between the pin icon and the lock icon. Use the same lock as the
 *  locked tab icon"). No open padlock anywhere: drawn on every unlocked section in
 *  panelock.2, it could not be told from the closed one at 16 px ("Just put the
 *  closed padlock and no open padlock"). Zotero has no lock icon. */
const PL_ICON = WV_LOCK_GOLD_ICON;
/** The class on a side-navigation button's `.pin-wrapper` while its section is
 *  locked at the bottom; at the top, PL_SN_TOP. */
const PL_SN = "wv-panelock-sn";
const PL_SN_TOP = "wv-panelock-sn-top";

const PL_CSS = [
    // A locked section: stuck at its place (see the header for `top` and
    // `bottom`: both written, so the box sits at its slot whatever its place
    // in the flow -- the scroller's 1-px flex gap included), its own opaque
    // background over the 8-px gutters of the scroller's padding, above the
    // pinned section headers (pane.ts, z-index 3; they read the stack's height
    // from the scroller's --wv-panelock-inset, 0 inside a locked section).
    ".zotero-view-item > ." + WV_PL_LOCKED + ":not([hidden]) { position: sticky; bottom: var(--wv-panelock-bottom, 0px); top: var(--wv-panelock-top, auto); z-index: 4;"
        + " flex: none; display: flex; flex-direction: column; box-sizing: border-box; height: var(--wv-panelock-h, " + PL_DEF_H + "px); min-height: 0;"
        + " margin-inline: -8px; width: calc(100% + 16px); background-color: var(--material-sidepane); " + WV_PL_INSET + ": 0px;"
        // The divider: an edge resizes (the cursor on the section's own edge
        // alone: its children keep theirs), a short grip drawn in it.
        + " cursor: ns-resize; background-image: linear-gradient(var(--fill-tertiary), var(--fill-tertiary)); background-repeat: no-repeat; background-size: 24px 2px; }",
    // At the bottom: last in the scroller's column (the locked ones in their
    // own order), the divider its top edge.
    ".zotero-view-item > ." + WV_PL_LOCKED + ":not(." + PL_TOP + "):not([hidden]) { order: 1; padding: 4px 8px 0;"
        + " border-top: 1px solid var(--color-panedivider, var(--fill-quinary)); background-position: center 1px; }",
    // At the top: first in the column, the divider its bottom edge.
    ".zotero-view-item > ." + WV_PL_LOCKED + "." + PL_TOP + ":not([hidden]) { order: -1; padding: 0 8px 4px;"
        + " border-bottom: 1px solid var(--color-panedivider, var(--fill-quinary)); background-position: center calc(100% - 1px); }",
    // Zotero's scrollToPane (scrollIntoView, block start) and a focus scroll
    // stop under the sections locked at the top.
    ".zotero-view-item { scroll-padding-top: var(" + WV_PL_INSET + ", 0px); }",
    ".zotero-view-item > ." + WV_PL_LOCKED + " > * { cursor: auto; }",
    // Collapsed (or empty): its header alone, nothing to resize.
    ".zotero-view-item > ." + WV_PL_LOCKED + "." + PL_CLOSED + ":not([hidden]) { height: auto; cursor: auto; background-image: none; }",
    // The section fills its height; its body scrolls inside it. Zotero's
    // separator under a section that is not the scroller's last child goes:
    // each locked one has its divider above it.
    ".zotero-view-item > ." + WV_PL_LOCKED + " > collapsible-section { flex: 1 1 auto; min-height: 0; border-bottom: none; }",
    ".zotero-view-item > ." + WV_PL_LOCKED + " > collapsible-section[open]:not([empty]) > :not(.head) { flex: 1 1 auto; min-height: 0; overflow-y: auto; }",
    ".zotero-view-item." + PL_DRAGGING + ", .zotero-view-item." + PL_DRAGGING + " * { cursor: ns-resize !important; }",
    // A locked section's padlock, among Zotero's header buttons
    // (collapsibleSection.js: `.head` holds the title, the extra buttons and
    // the twisty; their size, colour and focus ring come from
    // _collapsibleSection.scss).
    "collapsible-section > .head > toolbarbutton." + PL_BTN + " { -moz-context-properties: fill, fill-opacity; fill: currentColor; list-style-image: url(\"" + PL_ICON + "\"); }",
    // A locked section's button in the side navigation: the locked tab's gold
    // padlock, alone, 12 px (as on a locked tab's icon), in the box Zotero gives
    // its pin mark (_itemPaneSidenav.scss `.pin-wrapper::after`: 12 px, 1 px from
    // the button's end) but at the BOTTOM end -- a section locked at the bottom
    // (MJT 2026-11-22: "Top or bottom should be distinguished by the position of
    // the lock in the sidenav: top right or bottom right"); Zotero's pin mark keeps
    // the top end. Never both on one button: pinning a locked section unlocks it.
    "item-pane-sidenav .pin-wrapper." + PL_SN + "::after { top: auto; bottom: 1px; border-radius: 0; background: url(\"" + PL_ICON + "\") center / 12px 12px no-repeat; }",
    // A section locked at the TOP: the same padlock at the button's top end,
    // where Zotero draws its pin mark (top 1px, inset-inline-end 1px) -- the
    // two exclude each other, as pin and lock do.
    "item-pane-sidenav .pin-wrapper." + PL_SN_TOP + "::after { border-radius: 0; background: url(\"" + PL_ICON + "\") center / 12px 12px no-repeat; }",
].join("\n");

/** One item-details' state (off the element: window-wiring.spec.js). */
interface PlDet {
    tag: string;
    mo: any;
    ro: any;
    /** The locked sections observed for their size. */
    observed: Set<any>;
    /** The sections this item-details locks now, in their order. */
    panes: any[];
    /** Those of them locked at the top. */
    tops: Set<any>;
    /** `pinnedPane` as last seen: a change since is a pin to judge. */
    pin: string;
    /** A divider drag in progress: the section, where it started, its height
     *  then, and whether its divider is its bottom edge (locked at the top). */
    drag: { pane: any; y0: number; h0: number; top: boolean } | null;
    /** The height the drag asks for (px), 0 outside a drag. */
    dragH: number;
}
const PL_DETS: WeakMap<any, PlDet> = new WeakMap();
/** The panelock.1 settings rewritten as lists, once per instance. */
let plMigrated = false;

/** The ways Weavero's own sections' pane ids are spelled: Zotero namespaces a
 *  plugin's pane id with the plugin id, CSS-escaped (pluginAPIBase.mjs
 *  _namespacedMainKey); the raw spelling too, in case a build does not escape. */
function plPrefixes(win: any): string[] {
    const raw = WV_BL_PLUGIN_ID + "-";
    try {
        const esc = win.CSS.escape(WV_BL_PLUGIN_ID) + "-";
        if (esc !== raw) return [esc, raw];
    } catch (e) {}
    return [raw];
}

/** The id a pane is stored under: Weavero's own sections by their bare id
 *  ("weavero-feeds", feeds.ts SEC_PANE_ID), any other as Zotero names it. */
function plNorm(win: any, paneID: string): string {
    for (const p of plPrefixes(win)) if (paneID.startsWith(p)) return paneID.slice(p.length);
    return paneID;
}

function plMatches(win: any, paneID: string, stored: string): boolean {
    if (!stored || !paneID) return false;
    if (paneID === stored) return true;
    for (const p of plPrefixes(win)) if (paneID === p + stored) return true;
    return false;
}

/** The scroller's sections (Zotero's getPanes: its direct [data-pane] children). */
function plPanes(pp: any): any[] {
    try { return Array.from(pp.querySelectorAll(":scope > [data-pane]")); } catch (e) { return []; }
}

/** A section that is shown (Zotero's getEnabledPane: not [hidden]). */
function plEnabled(pp: any, paneID: string): any {
    for (const p of plPanes(pp)) if (p.dataset.pane === paneID && !p.hasAttribute("hidden")) return p;
    return null;
}

/** Zotero's own answer for a section's open state (collapsibleSection.js:
 *  false while it is empty). */
function plOpen(sec: any): boolean {
    try { return typeof sec.open === "boolean" ? sec.open : (sec.hasAttribute("open") && !sec.hasAttribute("empty")); } catch (e) { return true; }
}

function plSetVar(p: any, name: string, v: string) {
    if (p.style.getPropertyValue(name) !== v) p.style.setProperty(name, v);
}

/** A menu entry of Weavero's (hidden until its menu's popupshowing). */
function plMenuItem(doc: any, cls: string, l10n: string, tag: string, onCommand: () => void): any {
    const mi = doc.createXULElement("menuitem");
    mi.className = "menuitem-iconic " + cls;
    mi.setAttribute("data-wv-owned", PL_OWNED);
    mi.setAttribute("data-wv-tag", tag);
    mi.setAttribute("image", PL_ICON);
    wvL10n(mi, l10n);
    wvSetBoolAttr(mi, "hidden", true);
    mi.addEventListener("command", onCommand);
    return mi;
}

function plMenuSep(doc: any, cls: string, tag: string): any {
    const sep = doc.createXULElement("menuseparator");
    sep.className = cls;
    sep.setAttribute("data-wv-owned", PL_OWNED);
    sep.setAttribute("data-wv-tag", tag);
    wvSetBoolAttr(sep, "hidden", true);
    return sep;
}

/** Lock at Top / Lock at Bottom for an unlocked section; Lock at Top and Unlock
 *  for one locked at the bottom, Lock at Bottom and Unlock for one locked at
 *  the top (MJT 2026-11-22); none without a section. Weavero's separator only
 *  where Zotero's pin separator (`zsep`) is hidden and an entry follows. Run
 *  after Zotero's popupshowing. */
function plShowEntries(lockTop: any, lock: any, unlock: any, sep: any, zsep: any, target: boolean, pos: WvPlPos) {
    if (lockTop) wvSetBoolAttr(lockTop, "hidden", !target || pos === "top");
    wvSetBoolAttr(lock, "hidden", !target || pos === "bottom");
    wvSetBoolAttr(unlock, "hidden", !target || !pos);
    if (!sep) return;
    let after = false;
    for (let n = sep.nextElementSibling; n; n = n.nextElementSibling) {
        if (n.localName === "menuitem" && !wvIsHiddenOrCollapsed(n)) { after = true; break; }
    }
    wvSetBoolAttr(sep, "hidden", !target || !after || !!(zsep && !wvIsHiddenOrCollapsed(zsep)));
}

class _PaneLockMixin {
    // ---- the settings ----

    /** The view an item-details shows: a reader's item pane ("reader": a
     *  reader tab's -- contextPane.js gives it the tab's content type -- or a
     *  standalone reader window's), else the library's, for a feed item
     *  ("feed") or any other ("library"). */
    _wvPaneLockView(det: any): WvPlView {
        try {
            // A standalone reader window's pane (reader.ts) shows the open
            // document's item, as a reader tab's does: the same remembered lock.
            // By the window: the pane has no tabType until it first binds an item.
            if (det && det.ownerDocument && wvWinType(det.ownerDocument) === "zotero:reader") return "reader";
            const t = String((det && (det.tabType || (det.getAttribute && det.getAttribute("tabType")))) || "library");
            if (t !== "library") return "reader";
            const it = det.item;
            return it && it.isFeedItem ? "feed" : "library";
        } catch (e) { return "library"; }
    }

    /** The pane ids locked in `view`, as stored (a list; see plParseList). */
    _wvPaneLockPref(view: WvPlView): string[] {
        try { return plParseList(Zotero.Prefs.get("weavero.paneLock." + view)); } catch (e) { return []; }
    }

    _wvPaneLockSetPref(view: WvPlView, ids: string[]) {
        const seen: string[] = [];
        for (const id of ids) if (id && !seen.includes(id)) seen.push(id);
        try { Zotero.Prefs.set("weavero.paneLock." + view, JSON.stringify(seen)); } catch (e) { Zotero.debug("[Weavero] pane lock pref err: " + e); }
    }

    /** panelock.1's settings (ONE pane id as a plain string) rewritten as
     *  lists. A setting left at its default stays at it. */
    _wvPaneLockMigrate() {
        for (const view of PL_VIEWS) {
            try {
                const key = "weavero.paneLock." + view;
                if (!Services.prefs.getBranch("extensions.zotero.").prefHasUserValue(key)) continue;
                const v = Zotero.Prefs.get(key);
                if (typeof v === "string" && v.trim() && v.trim().charAt(0) !== "[") Zotero.Prefs.set(key, JSON.stringify(plParseList(v)));
            } catch (e) {}
        }
    }

    _wvPaneLockHeights(): Record<string, number> {
        try {
            const o = JSON.parse(String(Zotero.Prefs.get("weavero.paneLock.heights") || "{}"));
            return o && typeof o === "object" && !Array.isArray(o) ? o : {};
        } catch (e) { return {}; }
    }

    /** A section's remembered height (px), by pane id. */
    _wvPaneLockHeight(win: any, paneID: string): number {
        const v = this._wvPaneLockHeights()[plNorm(win, paneID)];
        return typeof v === "number" && v > 0 ? v : PL_DEF_H;
    }

    /** Remember heights (px) by pane id, in one write. */
    _wvPaneLockSetHeights(win: any, hs: Array<[string, number]>) {
        try {
            const o = this._wvPaneLockHeights();
            for (const [id, h] of hs) o[plNorm(win, id)] = Math.round(h);
            Zotero.Prefs.set("weavero.paneLock.heights", JSON.stringify(o));
        } catch (e) { Zotero.debug("[Weavero] pane lock height err: " + e); }
    }

    /** The sections `det` should lock now, each with its position: the view's
     *  choice, those the item shows, in their order in the scroller (the side
     *  navigation's). A section stored both ways (never written so) is locked
     *  at the top. */
    _wvPaneLockTargets(det: any): Array<{ p: any; top: boolean }> {
        const stored = this._wvPaneLockPref(this._wvPaneLockView(det));
        const pp = det && det._paneParent;
        if (!stored.length || !pp) return [];
        const win = winOf(det);
        const out: Array<{ p: any; top: boolean }> = [];
        for (const p of plPanes(pp)) {
            if (p.hasAttribute("hidden")) continue;
            const id = String(p.dataset.pane || "");
            let pos: WvPlPos = "";
            for (const s of stored) {
                if (!plMatches(win, id, plEntryID(s))) continue;
                pos = plEntryTop(s) ? "top" : (pos || "bottom");
            }
            if (pos) out.push({ p, top: pos === "top" });
        }
        return out;
    }

    /** The pane ids `det` has locked (top and bottom), in their order. */
    _wvPaneLockLockedIDs(det: any): string[] {
        const st = PL_DETS.get(det);
        return st ? st.panes.filter((p: any) => p.classList.contains(WV_PL_LOCKED)).map((p: any) => String(p.dataset.pane || "")) : [];
    }

    /** Where `det` holds `paneID` locked now: "top", "bottom" or "". */
    _wvPaneLockPos(det: any, paneID: any): WvPlPos {
        const st = PL_DETS.get(det);
        const id = String(paneID || "");
        if (!st || !id) return "";
        for (const p of st.panes) {
            if (String(p.dataset.pane || "") !== id || !p.classList.contains(WV_PL_LOCKED)) continue;
            return st.tops.has(p) ? "top" : "bottom";
        }
        return "";
    }

    /** `det` holds `paneID` locked (at its top or its bottom) now. */
    _wvPaneLockHolds(det: any, paneID: any): boolean {
        return !!this._wvPaneLockPos(det, paneID);
    }

    /** Lock `paneID` in `det`'s view at `pos` -- moved there when it is locked
     *  at the other end -- or unlock it (""). The others stay as they are;
     *  locking the pinned section unpins it. */
    _wvPaneLockSet(det: any, paneID: string, pos: WvPlPos) {
        try {
            if (!det || !paneID) return;
            const win = winOf(det);
            const view = this._wvPaneLockView(det);
            const list = this._wvPaneLockPref(view).filter((s) => !plMatches(win, paneID, plEntryID(s)));
            if (pos) {
                list.push((pos === "top" ? PL_TOP_PREFIX : "") + plNorm(win, paneID));
                try {
                    if (String(det.pinnedPane || "") === paneID) {
                        det.pinnedPane = "";
                        const st = PL_DETS.get(det);
                        if (st) st.pin = "";
                    }
                } catch (e) {}
            }
            this._wvPaneLockSetPref(view, list);
            this._wvPaneLockApplyAll();
        } catch (e) { Zotero.debug("[Weavero] pane lock set err: " + e); }
    }

    /** Unlock `paneID` when `det`'s view locks it (top or bottom), else lock
     *  it at the bottom (the padlock; the spec). */
    _wvPaneLockToggle(det: any, paneID: string) {
        try {
            if (!det || !paneID) return;
            const win = winOf(det);
            const stored = this._wvPaneLockPref(this._wvPaneLockView(det)).some((s) => plMatches(win, paneID, plEntryID(s)));
            this._wvPaneLockSet(det, paneID, stored ? "" : "bottom");
        } catch (e) { Zotero.debug("[Weavero] pane lock toggle err: " + e); }
    }

    // ---- wiring ----

    /** Main window `win` (wiring table "pane-lock"): the sheet, every item
     *  pane (the library's, each reader tab's), every side navigation's menu.
     *  A standalone reader window the same (its pane's builder, reader.ts). */
    _wvPaneLockWire(win: any) {
        try {
            if ((this as any)._wvDestroyed || !win || win.closed || !win.document) return;
            if (!plMigrated) { plMigrated = true; this._wvPaneLockMigrate(); }
            const doc = win.document;
            wvInjectStyle(doc, PL_STYLE_ID, PL_CSS);
            for (const det of Array.from(doc.querySelectorAll("item-details")) as any[]) this._wvPaneLockWireDet(det);
            for (const sn of Array.from(doc.querySelectorAll("item-pane-sidenav")) as any[]) this._wvPaneLockWireSidenav(sn);
        } catch (e) { Zotero.debug("[Weavero] pane lock wire err: " + e); }
    }

    /** Every item pane of every main and reader window, the settings applied
     *  (a setting changed; the spec after writing the prefs). Unwired ones are
     *  wired first. */
    _wvPaneLockApplyAll() {
        if ((this as any)._wvDestroyed) return;
        for (const w of plWins()) {
            try { for (const det of Array.from(w.document.querySelectorAll("item-details")) as any[]) this._wvPaneLockWireDet(det); } catch (e) {}
        }
    }

    /** One item-details: an observer of its sections (added, shown or hidden,
     *  opened or collapsed) and of its pin, one of its scroller's and its
     *  locked sections' sizes, a layer on its render (applied after Zotero's
     *  sync part, where the pin is restored and the sections' hooks have said
     *  whether they show), a layer on its scrollToPane (a locked section is
     *  never scrolled to: it is in view, and a sticky box scrolled "to the
     *  top" would only add Zotero's spacer and move the pane into it).
     *  Idempotent per instance. */
    _wvPaneLockWireDet(det: any) {
        try {
            if ((this as any)._wvDestroyed) return;
            const pp = det && det._paneParent;
            const win = winOf(det);
            if (!pp || !win || !win.MutationObserver || !win.ResizeObserver || typeof det.render !== "function") return;
            const tag = (this as any)._wvWireTag();
            let st = PL_DETS.get(det);
            if (st && st.tag === tag) { this._wvPaneLockApplyDet(det, ""); return; }
            if (st) this._wvPaneLockUnwireDet(det);
            wvInjectStyle(win.document, PL_STYLE_ID, PL_CSS);
            st = { tag, mo: null, ro: null, observed: new Set(), panes: [], tops: new Set(), pin: String(det.pinnedPane || ""), drag: null, dragH: 0 };
            PL_DETS.set(det, st);
            st.mo = new win.MutationObserver((muts: any[]) => {
                const lp: any = wvLivePlugin();
                if (lp && typeof lp._wvPaneLockOnMutations === "function") lp._wvPaneLockOnMutations(det, muts);
            });
            st.mo.observe(pp, { childList: true });
            st.mo.observe(det, { attributes: true, attributeFilter: ["pinnedPane", "pinnedpane"] });
            for (const p of plPanes(pp)) this._wvPaneLockObservePane(st, p);
            st.ro = new win.ResizeObserver(() => {
                const lp: any = wvLivePlugin();
                if (lp && typeof lp._wvPaneLockPlace === "function") lp._wvPaneLockPlace(det);
            });
            st.ro.observe(pp);
            wvWrap(det, "render", "paneLock", tag, (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                const after = () => {
                    try {
                        const lp: any = wvLivePlugin();
                        if (lp && typeof lp._wvPaneLockApplyDet === "function") lp._wvPaneLockApplyDet(det, "render");
                    } catch (e) {}
                };
                after();
                if (r && typeof r.then === "function") r.then(after, () => {});
                return r;
            });
            wvWrap(det, "scrollToPane", "paneLock", tag, (orig: any) => function (this: any, ...args: any[]) {
                try {
                    const lp: any = wvLivePlugin();
                    if (lp && typeof lp._wvPaneLockHolds === "function" && lp._wvPaneLockHolds(det, args[0])) return Promise.resolve(true);
                    // Under a stack locked at the top, Zotero's "already at the
                    // top" test (less than 1 px from the scroller's top edge,
                    // itemPaneContainerBase.mjs) never holds, and a smooth
                    // scroll that does not move waits 3 s for a scroll that
                    // never starts (_waitForScroll), the pane's lazy renders
                    // with it: already in place under the stack, instant.
                    if (lp && (args[1] === undefined || args[1] === "smooth") && typeof lp._wvPaneLockAtInset === "function" && lp._wvPaneLockAtInset(det, args[0])) {
                        args = [args[0], "instant", ...args.slice(2)];
                    }
                } catch (e) {}
                return orig.apply(this, args);
            });
            this._wvPaneLockApplyDet(det, "");
        } catch (e) { Zotero.debug("[Weavero] pane lock det wire err: " + e); }
    }

    /** Section `paneID` of `det` sits right under the stack locked at the top
     *  (within Zotero's 1 px), with such a stack. */
    _wvPaneLockAtInset(det: any, paneID: any): boolean {
        try {
            const pp = det && det._paneParent;
            const p = pp && paneID ? plEnabled(pp, String(paneID)) : null;
            if (!p) return false;
            const inset = wvPaneLockInset(pp);
            return inset > 0 && Math.abs(p.getBoundingClientRect().top - pp.getBoundingClientRect().top - inset) < 1;
        } catch (e) { return false; }
    }

    _wvPaneLockObservePane(st: PlDet, p: any) {
        try { st.mo.observe(p, { attributes: true, attributeFilter: ["hidden"] }); } catch (e) {}
        try {
            const sec = p.querySelector(":scope > collapsible-section");
            if (sec) st.mo.observe(sec, { attributes: true, attributeFilter: ["open", "empty"] });
        } catch (e) {}
    }

    /** The pane observer's records: a pin change of the item-details (a
     *  gesture -- the render layer has already seen a restored one), a
     *  section added (Zotero renders plugin sections on first use, and
     *  rebuilds a section it reorders), shown, hidden, opened or collapsed. */
    _wvPaneLockOnMutations(det: any, muts: any[]) {
        try {
            const st = PL_DETS.get(det);
            if (!st || (this as any)._wvDestroyed) return;
            let pin = false;
            for (const m of muts || []) {
                if (m.target === det) { pin = true; continue; }
                if (m.type === "childList") {
                    for (const n of Array.from(m.addedNodes || []) as any[]) {
                        if (n && n.nodeType === 1 && n.dataset && n.dataset.pane) this._wvPaneLockObservePane(st, n);
                    }
                }
            }
            this._wvPaneLockApplyDet(det, pin ? "pin" : "");
        } catch (e) {}
    }

    /** The view's choice on `det`: the sections to lock marked, any other
     *  unmarked, the padlocks drawn, the places written. `how`: "render"
     *  (after Zotero's render: a pin that came with it is Zotero's restore),
     *  "pin" (the observer saw the pin change: a pin new since the last look
     *  is the user's), "" (anything else). */
    _wvPaneLockApplyDet(det: any, how: "render" | "pin" | "") {
        try {
            if ((this as any)._wvDestroyed) return;
            const st = PL_DETS.get(det);
            const pp = det && det._paneParent;
            if (!st || !pp) return;
            const view = this._wvPaneLockView(det);
            const pinned = String(det.pinnedPane || "");
            const ts = this._wvPaneLockTargets(det);
            const targets = ts.map((t) => t.p);
            if (pinned && targets.some((p: any) => p.dataset.pane === pinned)) {
                if (how === "pin" && st.pin !== pinned) {
                    // Pin Section on a locked section: the pin wins, that
                    // section's lock goes (every window; the others stay), and
                    // it is scrolled to the top as a pin is (Zotero's own
                    // scroll ran while it was locked: the layer skipped it).
                    st.pin = pinned;
                    const win = winOf(det);
                    this._wvPaneLockSetPref(view, this._wvPaneLockPref(view).filter((s) => !plMatches(win, pinned, plEntryID(s))));
                    this._wvPaneLockApplyAll();
                    win.requestAnimationFrame(() => {
                        try {
                            const lp: any = wvLivePlugin();
                            if (lp && String(det.pinnedPane || "") === pinned && !lp._wvPaneLockHolds(det, pinned)) {
                                // Zotero measured the pin's spacer floor (the pinnedPane
                                // setter's _pinnedPaneMinScrollHeight) while the section
                                // was still drawn at the bottom: pinned again, from
                                // where it is now. The pin is already seen: no gesture.
                                try { det.pinnedPane = pinned; } catch (e) {}
                                const r = det.scrollToPane(pinned, "smooth");
                                if (r && typeof r.catch === "function") r.catch(() => {});
                            }
                        } catch (e) {}
                    });
                    return;
                }
                // A pin Zotero restored (or set before this lock): the lock stays.
                try { det.pinnedPane = ""; } catch (e) {}
            }
            st.pin = String(det.pinnedPane || "");
            for (const p of plPanes(pp)) {
                if (!targets.includes(p) && (p.classList.contains(WV_PL_LOCKED) || p.classList.contains(PL_CLOSED) || p.classList.contains(PL_TOP))) this._wvPaneLockUnmark(det, p);
            }
            for (const t of ts) this._wvPaneLockMark(det, t.p, t.top);
            st.panes = targets;
            st.tops = new Set(ts.filter((t) => t.top).map((t) => t.p));
            this._wvPaneLockEnsureButtons(det);
            // Its side navigation's menu too, at every apply, not only at the
            // wiring: a side navigation made or rebuilt later -- or one whose
            // entries another instance's teardown took -- kept none (the reader
            // tabs' context pane after the cited-by spec, citations.30's
            // battery on 11 and 10, 2026-11-22). Idempotent: a lookup when wired.
            if (det.sidenav && det.sidenav.container === det) this._wvPaneLockWireSidenav(det.sidenav);
            this._wvPaneLockMarkSidenav(det);
            this._wvPaneLockPlace(det);
        } catch (e) { Zotero.debug("[Weavero] pane lock apply err: " + e); }
    }

    /** The padlock mark on the locked sections' buttons of `det`'s side
     *  navigation, at the button's bottom end (PL_SN) or its top end
     *  (PL_SN_TOP) as the section is locked -- while `det` is what it shows:
     *  the context pane's is shared by every reader tab and follows the tab
     *  selected (contextPane.js _selectItemContext sets its container, then
     *  renders: the render layer brings the marks along). `off`: none. */
    _wvPaneLockMarkSidenav(det: any, off?: boolean) {
        try {
            const sn = det && det.sidenav;
            if (!sn || sn.container !== det || typeof sn.querySelectorAll !== "function") return;
            for (const w of Array.from(sn.querySelectorAll(".pin-wrapper")) as any[]) {
                const b = w.querySelector(":scope > .btn[data-pane]");
                const pos = off || !b ? "" : this._wvPaneLockPos(det, b.dataset.pane);
                if (w.classList.contains(PL_SN) !== (pos === "bottom")) w.classList.toggle(PL_SN, pos === "bottom");
                if (w.classList.contains(PL_SN_TOP) !== (pos === "top")) w.classList.toggle(PL_SN_TOP, pos === "top");
            }
        } catch (e) {}
    }

    _wvPaneLockMark(det: any, p: any, top: boolean) {
        const st = PL_DETS.get(det);
        if (!st) return;
        const win = winOf(det);
        if (p.classList.contains(PL_TOP) !== top) {
            // Moved between the ends: placed afresh (its old stack's offsets
            // would pin it at the wrong end until the place).
            p.classList.toggle(PL_TOP, top);
            for (const v of PL_VARS) if (v !== "--wv-panelock-h") p.style.removeProperty(v);
        }
        if (!p.classList.contains(WV_PL_LOCKED)) {
            p.classList.add(WV_PL_LOCKED);
            // Its height before the first place (a pane in a tab not shown
            // has no height to clamp against yet).
            p.style.setProperty("--wv-panelock-h", Math.round(this._wvPaneLockHeight(win, String(p.dataset.pane || ""))) + "px");
        }
        const sec = p.querySelector(":scope > collapsible-section");
        const closed = !!sec && !plOpen(sec);
        if (p.classList.contains(PL_CLOSED) !== closed) p.classList.toggle(PL_CLOSED, closed);
        if (!st.observed.has(p)) {
            try { st.ro.observe(p); } catch (e) {}
            st.observed.add(p);
        }
        wvListen(p, "paneLock:press", "mousedown", (ev: any) => {
            const lp: any = wvLivePlugin();
            if (lp && typeof lp._wvPaneLockPress === "function") lp._wvPaneLockPress(p, ev);
        }, undefined, (this as any)._wvWireTag());
    }

    _wvPaneLockUnmark(det: any, p: any) {
        try {
            p.classList.remove(WV_PL_LOCKED, PL_CLOSED, PL_TOP);
            for (const v of PL_VARS) p.style.removeProperty(v);
        } catch (e) {}
        try { wvUnlisten(p, "paneLock:press"); } catch (e) {}
        const st = PL_DETS.get(det);
        if (st && st.observed.has(p)) {
            try { st.ro.unobserve(p); } catch (e) {}
            st.observed.delete(p);
        }
    }

    /** The locked sections' heights and places. Each open one takes its
     *  remembered height (the drag's, for the one being dragged); when they do
     *  not fit in the scroller less PL_ROOM -- the collapsed ones' headers
     *  counted first, the top and bottom ones together -- they shrink in
     *  proportion, each to PL_MIN_H at least while there is room for that.
     *  The one being dragged follows the pointer and the others share what it
     *  leaves. The bottom ones stacked from the bottom: each one's `bottom` is
     *  the heights below it, its `top` the scroller's height less those and
     *  its own; the top ones from the top, mirrored, and their total written
     *  on the scroller (WV_PL_INSET). Reads first, writes last. */
    _wvPaneLockPlace(det: any) {
        try {
            const st = PL_DETS.get(det);
            const pp = det && det._paneParent;
            if (!st || !pp) return;
            const panes = st.panes.filter((p: any) => p.isConnected && p.classList.contains(WV_PL_LOCKED) && !p.hasAttribute("hidden"));
            const noInset = () => { if (pp.style.getPropertyValue(WV_PL_INSET)) pp.style.removeProperty(WV_PL_INSET); };
            if (!panes.length) { noInset(); return; }
            const ch = pp.getBoundingClientRect().height;
            if (!(ch > 0)) return;   // a tab not shown: placed when it is (the observer)
            const win = winOf(det);
            const h = new Map<any, number>();
            const open: any[] = [];
            let closedSum = 0;
            for (const p of panes) {
                if (p.classList.contains(PL_CLOSED)) {
                    const v = p.getBoundingClientRect().height;
                    h.set(p, v);
                    closedSum += v;
                }
                else open.push(p);
            }
            const avail = Math.max(0, ch - PL_ROOM - closedSum);
            const floor = open.length ? Math.min(PL_MIN_H, avail / open.length) : 0;
            const dragged = st.drag && st.dragH > 0 && open.includes(st.drag.pane) ? st.drag.pane : null;
            const want = new Map<any, number>();
            for (const p of open) want.set(p, p === dragged ? st.dragH : this._wvPaneLockHeight(win, String(p.dataset.pane || "")));
            /** `list`'s heights into `room`: as asked when they fit, else in proportion. */
            const fit = (list: any[], room: number) => {
                let sum = 0;
                for (const p of list) sum += want.get(p) || 0;
                const k = sum > room && sum > 0 ? Math.max(0, room) / sum : 1;
                for (const p of list) h.set(p, Math.round(Math.max(floor, (want.get(p) || 0) * k)));
            };
            if (dragged) {
                const others = open.filter((p) => p !== dragged);
                const hd = Math.round(Math.max(floor, Math.min(want.get(dragged) || 0, avail - floor * others.length)));
                h.set(dragged, hd);
                fit(others, avail - hd);
            }
            else fit(open, avail);
            const r2 = (v: number) => Math.round(v * 100) / 100 + "px";
            const put = (p: any, top: number, hp: number) => {
                if (!p.classList.contains(PL_CLOSED)) plSetVar(p, "--wv-panelock-h", hp + "px");
                plSetVar(p, "--wv-panelock-top", r2(top));
                plSetVar(p, "--wv-panelock-bottom", r2(ch - top - hp));
            };
            const bots = panes.filter((p: any) => !p.classList.contains(PL_TOP));
            let below = 0;
            for (let i = bots.length - 1; i >= 0; i--) {
                const hp = h.get(bots[i]) || 0;
                put(bots[i], ch - below - hp, hp);
                below += hp;
            }
            let above = 0;
            for (const p of panes) {
                if (!p.classList.contains(PL_TOP)) continue;
                const hp = h.get(p) || 0;
                put(p, above, hp);
                above += hp;
            }
            if (above > 0) plSetVar(pp, WV_PL_INSET, r2(above));
            else noInset();
        } catch (e) {}
    }

    // ---- the padlocks ----

    /** Each section's header: Lock at Top / Lock at Bottom / Unlock in its
     *  right-click menu, and, on a locked section only (at either end), the
     *  closed padlock right before the
     *  twisty (none on the others). A padlock of another instance is
     *  replaced; Zotero's own extra buttons (rebuilt on `extra-buttons`,
     *  before the twisty) are left where they are and the padlock goes back
     *  after them. */
    _wvPaneLockEnsureButtons(det: any) {
        const st = PL_DETS.get(det);
        const pp = det && det._paneParent;
        if (!st || !pp) return;
        const tag = (this as any)._wvWireTag();
        for (const p of plPanes(pp)) {
            try {
                const head = p.querySelector(":scope > collapsible-section > .head");
                if (!head) continue;
                this._wvPaneLockWireHeadMenu(p, tag);
                let b = head.querySelector(":scope > ." + PL_BTN);
                if (!st.panes.includes(p)) {
                    if (b) b.remove();
                    continue;
                }
                if (b && b.getAttribute("data-wv-tag") !== tag) { b.remove(); b = null; }
                if (!b) b = this._wvPaneLockMakeButton(head.ownerDocument, tag);
                const tw = head.querySelector(":scope > .twisty");
                if (tw) { if (b.nextElementSibling !== tw) head.insertBefore(b, tw); }
                else if (b.parentNode !== head) head.appendChild(b);
            } catch (e) {}
        }
    }

    _wvPaneLockMakeButton(doc: any, tag: string): any {
        const b = doc.createXULElement("toolbarbutton");
        b.className = PL_BTN;
        b.setAttribute("data-wv-owned", PL_OWNED);
        b.setAttribute("data-wv-tag", tag);
        b.setAttribute("tabindex", "0");
        wvL10n(b, "weavero-panelock-button-unlock");
        let at = 0;
        // Only a locked section has it: a press unlocks.
        const act = () => {
            try {
                const lp: any = wvLivePlugin();
                const sec = b.closest("collapsible-section");
                const pane = sec && sec.parentElement;
                const det = pane && pane.closest("item-details");
                const id = pane && pane.dataset && String(pane.dataset.pane || "");
                if (lp && det && id && typeof lp._wvPaneLockToggle === "function" && lp._wvPaneLockHolds(det, id)) lp._wvPaneLockToggle(det, id);
            } catch (e) {}
        };
        // The header toggles its section on a click (collapsibleSection.js
        // _handleClick, Zotero's own buttons excepted by their class): the
        // click stays on the padlock. Zotero's toolbarbutton sends `command`
        // after a click and on Enter / Space: the one right after a click is
        // the same press.
        b.addEventListener("click", (ev: any) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            at = Date.now();
            act();
        });
        b.addEventListener("command", () => {
            if (Date.now() - at < 400) return;
            act();
        });
        return b;
    }

    // ---- the side navigation's menu ----

    /** "Lock at Top" / "Lock at Bottom" / "Unlock" after Zotero's Pin Section
     *  / Unpin Section in a side navigation's right-click menu
     *  (itemPaneSidenav.js: one `.context-menu` per side navigation -- the
     *  library pane's, the context pane's shared by every reader tab, a
     *  reader window's own), shown in its popupshowing for the section
     *  right-clicked (`_contextMenuTarget`, set by Zotero first). Entries of
     *  another instance -- or a set without Lock at Top, a build before
     *  locktop's -- are rebuilt. */
    _wvPaneLockWireSidenav(sn: any) {
        try {
            const popup = sn && sn.querySelector("menupopup.context-menu");
            if (!popup) return;
            const doc = sn.ownerDocument;
            const tag = (this as any)._wvWireTag();
            let lock = popup.querySelector(":scope > ." + PL_MI_LOCK);
            if (lock && (lock.getAttribute("data-wv-tag") !== tag || !popup.querySelector(":scope > ." + PL_MI_LOCK_TOP))) {
                for (const el of Array.from(popup.querySelectorAll(":scope > [data-wv-owned='" + PL_OWNED + "']")) as any[]) el.remove();
                lock = null;
            }
            if (!lock) {
                const act = (a: "top" | "bottom" | "unlock") => () => {
                    const lp: any = wvLivePlugin();
                    if (lp && typeof lp._wvPaneLockMenuAct === "function") lp._wvPaneLockMenuAct(sn, a);
                };
                const lockTop = plMenuItem(doc, PL_MI_LOCK_TOP, "weavero-panelock-menu-lock-top", tag, act("top"));
                lock = plMenuItem(doc, PL_MI_LOCK, "weavero-panelock-menu-lock", tag, act("bottom"));
                const unlock = plMenuItem(doc, PL_MI_UNLOCK, "weavero-panelock-menu-unlock", tag, act("unlock"));
                // Zotero hides its pin separator for a section it cannot pin
                // (the first one): then this one separates the entries from
                // Zotero's Move Section Up / Down.
                const sep = plMenuSep(doc, PL_MI_SEP, tag);
                const anchor = popup.querySelector(":scope > .zotero-menuitem-unpin");
                if (anchor) anchor.after(lockTop, lock, unlock, sep);
                else popup.prepend(lockTop, lock, unlock, sep);
            }
            wvListen(popup, "paneLock:showing", "popupshowing", (ev: any) => {
                if (ev.target !== popup) return;
                const lp: any = wvLivePlugin();
                if (lp && typeof lp._wvPaneLockMenuShowing === "function") lp._wvPaneLockMenuShowing(sn);
            }, undefined, tag);
            wvListen(sn, "paneLock:ctx", "contextmenu", (ev: any) => {
                const lp: any = wvLivePlugin();
                if (lp && typeof lp._wvPaneLockMenuFallback === "function") lp._wvPaneLockMenuFallback(sn, ev);
            }, undefined, tag);
        } catch (e) { Zotero.debug("[Weavero] pane lock sidenav wire err: " + e); }
    }

    /** The section a side navigation's menu was opened on, with its item-details. */
    _wvPaneLockMenuTarget(sn: any): { det: any; id: string } | null {
        try {
            const det = sn && sn.container;
            const id = String((sn && sn._contextMenuTarget) || "");
            if (!det || !id || !PL_DETS.has(det) || !det._paneParent || !plEnabled(det._paneParent, id)) return null;
            return { det, id };
        } catch (e) { return null; }
    }

    _wvPaneLockMenuShowing(sn: any) {
        try {
            const popup = sn.querySelector("menupopup.context-menu");
            const lockTop = popup && popup.querySelector(":scope > ." + PL_MI_LOCK_TOP);
            const lock = popup && popup.querySelector(":scope > ." + PL_MI_LOCK);
            const unlock = popup && popup.querySelector(":scope > ." + PL_MI_UNLOCK);
            const sep = popup && popup.querySelector(":scope > ." + PL_MI_SEP);
            if (!lock || !unlock) return;
            const t = this._wvPaneLockMenuTarget(sn);
            plShowEntries(lockTop, lock, unlock, sep, popup.querySelector(":scope > .zotero-menuitem-pin-separator"),
                !!t, t ? this._wvPaneLockPos(t.det, t.id) : "");
        } catch (e) {}
    }

    /** A menu's entry for the section `t`: lock it at the "top" or the
     *  "bottom" ("lock": the bottom) -- moved when it is locked at the other
     *  end -- or "unlock" it. */
    _wvPaneLockAct(t: { det: any; id: string } | null, act: "top" | "bottom" | "lock" | "unlock") {
        if (!t) return;
        const pos: WvPlPos = act === "unlock" ? "" : act === "top" ? "top" : "bottom";
        if (this._wvPaneLockPos(t.det, t.id) !== pos) this._wvPaneLockSet(t.det, t.id, pos);
    }

    /** The side navigation menu's entry, for the section it was opened on. */
    _wvPaneLockMenuAct(sn: any, act: "top" | "bottom" | "lock" | "unlock") {
        this._wvPaneLockAct(this._wvPaneLockMenuTarget(sn), act);
    }

    /** Zotero opens nothing when every entry of its own is hidden
     *  (itemPaneSidenav.js handleButtonContextMenu, "Don't open an empty
     *  popup"; it has set `_contextMenuTarget` by then): the menu opens for
     *  Weavero's entries. */
    _wvPaneLockMenuFallback(sn: any, ev: any) {
        try {
            const btn = ev && ev.target && ev.target.closest && ev.target.closest(".btn[data-pane]");
            const popup = sn.querySelector("menupopup.context-menu");
            if (!btn || !popup || popup.state !== "closed") return;
            if (String(sn._contextMenuTarget || "") !== String(btn.dataset.pane || "")) return;
            if (!this._wvPaneLockMenuTarget(sn)) return;
            popup.openPopupAtScreen(ev.screenX, ev.screenY, true);
        } catch (e) {}
    }

    // ---- a section header's own menu ----

    /** "Lock at Top" / "Lock at Bottom" / "Unlock" after Zotero's Pin Section
     *  / Unpin Section in section `p`'s right-click menu (collapsibleSection.js
     *  _buildContextMenu: one menupopup per section, in its header's
     *  popupset, built once when the section is; its popupshowing sets
     *  Zotero's entries, then this one's). Entries of another instance -- or
     *  a set without Lock at Top -- are rebuilt. */
    _wvPaneLockWireHeadMenu(p: any, tag: string) {
        try {
            const sec = p.querySelector(":scope > collapsible-section");
            const menu = sec && (sec._contextMenu || sec.querySelector(":scope > .head > popupset > menupopup"));
            if (!menu || menu.localName !== "menupopup") return;
            let lock = menu.querySelector(":scope > ." + PL_HMI_LOCK);
            if (lock && (lock.getAttribute("data-wv-tag") !== tag || !menu.querySelector(":scope > ." + PL_HMI_LOCK_TOP))) {
                for (const el of Array.from(menu.querySelectorAll(":scope > [data-wv-owned='" + PL_OWNED + "']")) as any[]) el.remove();
                lock = null;
            }
            if (!lock) {
                const doc = menu.ownerDocument;
                const act = (a: "top" | "bottom" | "unlock") => () => {
                    const lp: any = wvLivePlugin();
                    if (lp && typeof lp._wvPaneLockHeadMenuAct === "function") lp._wvPaneLockHeadMenuAct(menu, a);
                };
                const lockTop = plMenuItem(doc, PL_HMI_LOCK_TOP, "weavero-panelock-menu-lock-top", tag, act("top"));
                lock = plMenuItem(doc, PL_HMI_LOCK, "weavero-panelock-menu-lock", tag, act("bottom"));
                const unlock = plMenuItem(doc, PL_HMI_UNLOCK, "weavero-panelock-menu-unlock", tag, act("unlock"));
                // Zotero hides its (unclassed) pin separator where it hides Pin
                // / Unpin -- a section it cannot pin, a pane with no side
                // navigation: then this one separates the entries from
                // Collapse Other Sections.
                const sep = plMenuSep(doc, PL_HMI_SEP, tag);
                const anchor = menu.querySelector(":scope > .zotero-menuitem-unpin");
                if (anchor) anchor.after(lockTop, lock, unlock, sep);
                else menu.prepend(lockTop, lock, unlock, sep);
            }
            wvListen(menu, "paneLock:headShowing", "popupshowing", (ev: any) => {
                if (ev.target !== menu) return;
                const lp: any = wvLivePlugin();
                if (lp && typeof lp._wvPaneLockHeadMenuShowing === "function") lp._wvPaneLockHeadMenuShowing(menu);
            }, undefined, tag);
        } catch (e) { Zotero.debug("[Weavero] pane lock header menu wire err: " + e); }
    }

    /** The section a header menu belongs to, with its item-details. */
    _wvPaneLockHeadTarget(menu: any): { det: any; id: string } | null {
        try {
            const sec = menu && menu.closest && menu.closest("collapsible-section");
            const pane = sec && sec.parentElement;
            const det = pane && pane.closest && pane.closest("item-details");
            const id = pane && pane.dataset ? String(pane.dataset.pane || "") : "";
            if (!det || !id || !PL_DETS.has(det) || !det._paneParent || plEnabled(det._paneParent, id) !== pane) return null;
            return { det, id };
        } catch (e) { return null; }
    }

    _wvPaneLockHeadMenuShowing(menu: any) {
        try {
            const lockTop = menu.querySelector(":scope > ." + PL_HMI_LOCK_TOP);
            const lock = menu.querySelector(":scope > ." + PL_HMI_LOCK);
            const unlock = menu.querySelector(":scope > ." + PL_HMI_UNLOCK);
            const sep = menu.querySelector(":scope > ." + PL_HMI_SEP);
            if (!lock || !unlock) return;
            // Zotero's pin separator: the first separator after the entries
            // that is not Weavero's.
            let zsep: any = null;
            for (let n = (sep || unlock).nextElementSibling; n; n = n.nextElementSibling) {
                if (n.localName === "menuseparator" && !n.hasAttribute("data-wv-owned")) { zsep = n; break; }
                if (n.localName === "menuitem") break;
            }
            const t = this._wvPaneLockHeadTarget(menu);
            plShowEntries(lockTop, lock, unlock, sep, zsep, !!t, t ? this._wvPaneLockPos(t.det, t.id) : "");
        } catch (e) {}
    }

    _wvPaneLockHeadMenuAct(menu: any, act: "top" | "bottom" | "lock" | "unlock") {
        this._wvPaneLockAct(this._wvPaneLockHeadTarget(menu), act);
    }

    // ---- the dividers ----

    /** A press on a locked section's divider starts a drag of its height: the
     *  top edge of one locked at the bottom (up: taller), the bottom edge of
     *  one locked at the top (down: taller). Anywhere else the press is the
     *  section's own. */
    _wvPaneLockPress(p: any, ev: any) {
        try {
            if (!ev || ev.button !== 0 || ev.target !== p || !p.classList.contains(WV_PL_LOCKED) || p.classList.contains(PL_CLOSED)) return;
            const r = p.getBoundingClientRect();
            const top = p.classList.contains(PL_TOP);
            if ((top ? r.bottom - ev.clientY : ev.clientY - r.top) > PL_BAND + 1) return;
            const det = p.closest("item-details");
            const st = det && PL_DETS.get(det);
            const win = winOf(p);
            if (!st || !st.panes.includes(p) || !win) return;
            ev.preventDefault();
            ev.stopPropagation();
            st.drag = { pane: p, y0: ev.clientY, h0: r.height, top };
            st.dragH = r.height;
            try { det._paneParent.classList.add(PL_DRAGGING); } catch (e) {}
            const tag = (this as any)._wvWireTag();
            wvUnlisten(win, "paneLock:dragMove");
            wvUnlisten(win, "paneLock:dragUp");
            wvListen(win, "paneLock:dragMove", "mousemove", (e: any) => {
                const lp: any = wvLivePlugin();
                if (!lp || typeof lp._wvPaneLockDragTo !== "function") return;
                // The button was let go where no mouseup reached the window.
                if (typeof e.buttons === "number" && !(e.buttons & 1)) { lp._wvPaneLockDragEnd(det); return; }
                lp._wvPaneLockDragTo(det, e.clientY);
            }, true, tag);
            wvListen(win, "paneLock:dragUp", "mouseup", (e: any) => {
                const lp: any = wvLivePlugin();
                if (!lp || typeof lp._wvPaneLockDragEnd !== "function") return;
                lp._wvPaneLockDragTo(det, e.clientY);
                lp._wvPaneLockDragEnd(det);
            }, true, tag);
        } catch (e) { Zotero.debug("[Weavero] pane lock press err: " + e); }
    }

    _wvPaneLockDragTo(det: any, y: number) {
        const st = PL_DETS.get(det);
        if (!st || !st.drag || typeof y !== "number") return;
        st.dragH = Math.max(1, st.drag.h0 + (st.drag.top ? y - st.drag.y0 : st.drag.y0 - y));
        this._wvPaneLockPlace(det);
    }

    /** What the drag leaves drawn is remembered: the dragged section's
     *  height, and those of the others it made smaller than theirs (so
     *  nothing moves at the release); every window's pane takes them. */
    _wvPaneLockDragEnd(det: any) {
        const st = PL_DETS.get(det);
        const win = winOf(det);
        try { if (win) { wvUnlisten(win, "paneLock:dragMove"); wvUnlisten(win, "paneLock:dragUp"); } } catch (e) {}
        try { det._paneParent.classList.remove(PL_DRAGGING); } catch (e) {}
        if (!st || !st.drag) return;
        const dragged = st.drag.pane;
        st.drag = null;
        st.dragH = 0;
        try {
            const keep: Array<[string, number]> = [];
            for (const p of st.panes) {
                if (!p.classList.contains(WV_PL_LOCKED) || p.classList.contains(PL_CLOSED)) continue;
                const id = String(p.dataset.pane || "");
                const h = parseFloat(p.style.getPropertyValue("--wv-panelock-h"));
                if (!(h > 0)) continue;
                if (p === dragged || h < this._wvPaneLockHeight(win, id) - 0.5) keep.push([id, h]);
            }
            if (keep.length) this._wvPaneLockSetHeights(win, keep);
        } catch (e) {}
        this._wvPaneLockApplyAll();
    }

    // ---- teardown ----

    _wvPaneLockUnwireDet(det: any) {
        const st = PL_DETS.get(det);
        this._wvPaneLockMarkSidenav(det, true);
        try { wvUnwrap(det, "render", "paneLock"); } catch (e) {}
        try { wvUnwrap(det, "scrollToPane", "paneLock"); } catch (e) {}
        if (st) {
            try { if (st.mo) st.mo.disconnect(); } catch (e) {}
            try { if (st.ro) st.ro.disconnect(); } catch (e) {}
            if (st.drag) this._wvPaneLockDragEnd(det);
        }
        const pp = det && det._paneParent;
        if (pp) {
            for (const p of plPanes(pp)) {
                this._wvPaneLockUnmark(det, p);
                try { for (const b of Array.from(p.querySelectorAll("." + PL_BTN)) as any[]) b.remove(); } catch (e) {}
                try {
                    const sec = p.querySelector(":scope > collapsible-section");
                    const menu = sec && (sec._contextMenu || sec.querySelector(":scope > .head > popupset > menupopup"));
                    if (menu) {
                        wvUnlisten(menu, "paneLock:headShowing");
                        for (const el of Array.from(menu.querySelectorAll(":scope > [data-wv-owned='" + PL_OWNED + "']")) as any[]) el.remove();
                    }
                } catch (e) {}
            }
            try { pp.classList.remove(PL_DRAGGING); } catch (e) {}
            try { pp.style.removeProperty(WV_PL_INSET); } catch (e) {}
        }
        PL_DETS.delete(det);
    }

    /** destroy(): every main and reader window back to Zotero's own item panes. */
    _wvPaneLockDestroy() {
        for (const w of plWins()) {
            try {
                const doc = w.document;
                for (const det of Array.from(doc.querySelectorAll("item-details")) as any[]) this._wvPaneLockUnwireDet(det);
                for (const sn of Array.from(doc.querySelectorAll("item-pane-sidenav")) as any[]) {
                    try { wvUnlisten(sn, "paneLock:ctx"); } catch (e) {}
                    const popup = sn.querySelector("menupopup.context-menu");
                    if (popup) { try { wvUnlisten(popup, "paneLock:showing"); } catch (e) {} }
                }
                for (const el of Array.from(doc.querySelectorAll("[data-wv-owned='" + PL_OWNED + "']")) as any[]) { try { el.remove(); } catch (e) {} }
                // A section of a pane Weavero no longer reaches (left by an
                // instance that went without its teardown).
                for (const p of Array.from(doc.querySelectorAll("." + WV_PL_LOCKED + ", ." + PL_CLOSED + ", ." + PL_TOP)) as any[]) {
                    try {
                        p.classList.remove(WV_PL_LOCKED, PL_CLOSED, PL_TOP);
                        for (const v of PL_VARS) p.style.removeProperty(v);
                        wvUnlisten(p, "paneLock:press");
                    } catch (e) {}
                }
                for (const el of Array.from(doc.querySelectorAll("." + PL_DRAGGING + ", ." + PL_SN + ", ." + PL_SN_TOP)) as any[]) { try { el.classList.remove(PL_DRAGGING, PL_SN, PL_SN_TOP); } catch (e) {} }
                for (const sc of Array.from(doc.querySelectorAll(".zotero-view-item")) as any[]) { try { sc.style.removeProperty(WV_PL_INSET); } catch (e) {} }
                try { wvUnlisten(w, "paneLock:dragMove"); wvUnlisten(w, "paneLock:dragUp"); } catch (e) {}
                wvRemoveStyle(doc, PL_STYLE_ID);
            } catch (e) {}
        }
    }
}

const _plDescriptors = Object.getOwnPropertyDescriptors(_PaneLockMixin.prototype);
delete (_plDescriptors as any).constructor;
export const paneLockMethods = _plDescriptors;
