// Module: clickable column counts (MJT 2026-10-22, "Can you make the numbers
// in the columns clickable?"; design picked at intake: a popup listing
// exactly what was counted). The Tags, Related and Backlinks columns draw a
// non-zero number as a `.wv-col-count` span; the items-tree delegate
// (pane.ts `_setupTreeClickDelegate`) records a plain left press on one and
// opens the popup on the matching release, after Zotero has selected the
// row as usual. Ctrl / Shift / Cmd / Alt and drags keep their native
// meaning and open nothing.
//
// The popup is the shared Weavero overlay (`_getOrCreatePanel`), so it keeps
// the four popup contracts (memory "popup invariants", test/popups.spec.js):
// host window through `_resolvePopupWin`, icons through `_makeChromeIcon`,
// the outside-click dismisser, toggle on a second click of the same number.
// Its entries are the column's own: an OPEN row's number counts the item's
// own entries, a COLLAPSED row's the whole subtree (the item, its
// attachments and their annotations, its notes), and the Tags column's
// manual and automatic numbers each list their own kind. Backlinks and Links
// follow the same scope (2026-10-23 / 10-27) and render with their sections'
// rows; a collapsed row's Backlinks are grouped by the part each link is
// aimed at, as the other popups group theirs (2026-10-28,
// backlinks.ts `_wvBlRenderByPart`).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvHtmlEl } from "../lib/dom";
import { wvListener } from "../lib/listen";
import { wvLivePlugin } from "../lib/live";
import { WV_BL_ICON_CONTEXT, wvBlAttFile, wvBlDrawSegs } from "./backlinks";
import { WV_LK_ICON_CONTEXT } from "./links";
import { wvExternalLinkGlyphEl, wvExternalLinkGlyphUri } from "../lib/link-glyph";
import { wvViewEl } from "../lib/windows";

/** The External Links column's and popup's icon: Has External Link's box
 *  with the arrow out, painted by its host's context fill. */
export const WV_EXT_ICON_CONTEXT = wvExternalLinkGlyphUri("context-fill", 16);

declare const Zotero: any;

export type WvCountKind = "tags-manual" | "tags-auto" | "related" | "backlinks" | "links" | "extlinks";
export type WvCountScope = "own" | "subtree";

export interface WvCountGroup {
    /** Where the entries sit: the item itself, an attachment, an annotation, a note. */
    source: any;
    /** Related items, or `{ tag, type }` for tags. */
    entries: any[];
}

const PRESS_SLOP = 4;          // px a press may move and still be a click
const PRESS_MAX_MS = 900;
/** A press on a number, per main window (not an expando: per-window state
 *  stays out of the wiring recording, tests.md). */
const presses: WeakMap<any, any> = new WeakMap();

const KINDS: WvCountKind[] = ["tags-manual", "tags-auto", "related", "backlinks", "links", "extlinks"];

/** Each popup's header icon in its column header's colour (constants.ts):
 *  the Tags column's tag Zotero's orange `--accent-orange`, the Related
 *  column's chain `--accent-wood` (Zotero's Related section colour; the
 *  shared popup sheet's amber read as a different icon, MJT 2026-10-23
 *  "Same color problem as the tag icon"), the Backlinks column's glyph the
 *  neutral `--fill-secondary`. The automatic tags' popup takes the grey
 *  Zotero gives automatic tags everywhere (_tagsBox.scss tagType 1; MJT
 *  2026-10-26, on the "1 Automatic Tag" title's orange tag: "Not the right
 *  color for automatic tags"). */
const WV_COUNT_TINT: { [k: string]: string } = {
    "tags-manual": "var(--accent-orange)",
    "tags-auto": "var(--fill-secondary)",
    "related": "var(--accent-wood)",
    "backlinks": "var(--fill-secondary)",
    "links": "var(--fill-secondary)",
    "extlinks": "var(--fill-secondary)",
};

// ---- Weavero's tooltip on a cut count cell -----------------------------
// MJT 2026-10-23: "Hovering on an ellipsis should show the complete content
// of that cell in a tooltip", "Can you keep the colors in the tooltip?";
// 2026-10-26: "Make sure this tooltip rule also works on the counts in the
// items list" -- the rule he chose on 2026-08-27 (work/tooltip-conventions.md):
// show after a 500 ms rest, hide on any move (a visible tip survives 7 DEVICE
// px of jitter, as Gecko's does), and show AGAIN on every new rest; Gecko's
// own title tooltip is one-shot per element. With the hidden pref
// weavero.tooltipPersist the tip stays while the pointer stays on the same
// cell (5 s stationary auto-hide), as the reader's link tip does.
// Drawn as an in-document fixed div styled from a never-opened <tooltip>
// donor, like the reader's link tip: an OS popup opened by script went blank
// under open/hide churn (2026-08-27). The copy keeps the numbers' colour
// classes. The count cells carry no `title`, so Gecko's tooltip never
// doubles it; the dwell hit-tests the remembered point when it fires (rows
// re-render under a still pointer).

const TIP_ID = "wv-count-tip";
const TIP_DWELL_MS = 500;           // the Weavero hover delay = ui.tooltip.delay_ms
const TIP_JITTER_DEV_PX = 7;        // nsXULTooltipListener kTooltipMouseMoveTolerance
const TIP_AUTOPOP_MS = 5000;        // persist mode, Win32 TTDT_AUTOPOP
const TIP_GAP_PX = 21;              // the tooltip frame's offset below the pointer
/** Per main window: timers, the remembered point, where and on which cell
 *  the tip went up. A WeakMap, not an expando (per-window state stays out of
 *  the wiring recording, tests.md). */
const tips: WeakMap<any, any> = new WeakMap();

/** True when the cell's content runs past its content box -- the edge where
 *  Gecko draws the "…". Not scrollWidth with slack: "1|1" cut by 1.3 px
 *  showed its "…" with scrollWidth 35 against clientWidth 34 (2026-10-23). */
export function wvCountCellCut(span: any): boolean {
    if (span.scrollWidth > span.clientWidth) return true;
    const w = span.ownerDocument.defaultView;
    const r = span.ownerDocument.createRange();
    r.selectNodeContents(span);
    const right = r.getBoundingClientRect().right;
    const box = span.getBoundingClientRect().right - (parseFloat(w.getComputedStyle(span).paddingRight) || 0);
    return right > box + 0.1;
}

function tipState(win: any): any {
    let s = tips.get(win);
    if (!s) { s = { timer: null, autopop: null, at: null, shownAt: null, cell: null }; tips.set(win, s); }
    return s;
}
function tipEl(win: any): any { try { return win.document.getElementById(TIP_ID); } catch (e) { return null; } }
function tipVisible(win: any): boolean { const t = tipEl(win); return !!(t && t.style.display !== "none"); }
function tipClear(win: any, s: any, key: string) {
    if (s[key]) { try { win.clearTimeout(s[key]); } catch (e) {} s[key] = null; }
}
function tipHide(win: any) {
    const s = tips.get(win);
    if (s) { tipClear(win, s, "autopop"); s.shownAt = null; s.cell = null; }
    const t = tipEl(win);
    if (t) t.style.display = "none";
}
/** Hide, and forget the point: nothing shows until the pointer moves again. */
function tipCancel(win: any) {
    tipHide(win);
    const s = tips.get(win);
    if (s) { tipClear(win, s, "timer"); s.at = null; }
}
function tipLive(): any {
    const lp: any = wvLivePlugin();
    return lp && !lp._wvDestroyed ? lp : null;
}

/** The tip at (x, y): the cell's numbers with their colour classes, the look
 *  copied from a <tooltip> donor, placed as Gecko places its tooltip and kept
 *  inside the window. */
function tipRender(win: any, cell: any, x: number, y: number) {
    const doc = win.document;
    let tip = tipEl(win);
    if (!tip) {
        tip = wvHtmlEl(doc, "div");
        tip.id = TIP_ID;
        tip.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;white-space:nowrap;"
            + "box-sizing:border-box;width:max-content;display:none;";
        doc.documentElement.appendChild(tip);
    }
    // The reader's link tip uses the same never-opened donor.
    let donor = doc.getElementById("wv-exttip-style-donor");
    if (!donor) {
        donor = doc.createXULElement("tooltip");
        donor.id = "wv-exttip-style-donor";
        doc.documentElement.appendChild(donor);
    }
    try {
        const cs = win.getComputedStyle(donor);
        tip.style.background = cs.backgroundColor;
        tip.style.color = cs.color;
        tip.style.border = cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor;
        tip.style.borderRadius = cs.borderRadius;
        tip.style.padding = cs.paddingTop + " " + cs.paddingRight + " " + cs.paddingBottom + " " + cs.paddingLeft;
        tip.style.fontSize = cs.fontSize;
        tip.style.fontFamily = cs.fontFamily;
    } catch (e) {}
    tip.textContent = "";
    for (const k of Array.from(cell.children as ArrayLike<any>)) {
        // The colour classes, not the link's (no hand, no underline).
        const cls = String(k.className || "").split(/\s+/).filter((c) => c && c !== "wv-col-count").join(" ");
        wvHtmlEl(doc, "span", cls || undefined, k.textContent || "", tip);
    }
    if (!tip.childNodes.length) tip.textContent = cell.textContent || "";
    tip.style.display = "block";
    let left = x, top = y + TIP_GAP_PX;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    try {
        const b = tip.getBoundingClientRect();
        if (b.right > win.innerWidth - 4) left = Math.max(4, win.innerWidth - 4 - b.width);
        if (b.bottom > win.innerHeight - 4) top = Math.max(4, y - b.height - 8);
        tip.style.left = left + "px";
        tip.style.top = top + "px";
    } catch (e) {}
}

class _CountPopupsMixin {
    /** The items whose OWN entries a number counts: the item alone for an
     *  open row; for a collapsed one the same walk the columns' roll-ups
     *  make (pane.ts tagSubtreeCount / relatedSubtreeCount): the item, each
     *  attachment followed by its annotations, then the notes. */
    _wvCountSources(item: any, scope: WvCountScope): any[] {
        const out: any[] = [];
        if (!item) return out;
        out.push(item);
        if (scope !== "subtree") return out;
        const addAnns = (att: any) => {
            try {
                if (att && att.isFileAttachment && att.isFileAttachment()) {
                    for (const a of (att.getAnnotations && att.getAnnotations()) || []) if (a) out.push(a);
                }
            } catch (e) {}
        };
        try {
            if (item.isFileAttachment && item.isFileAttachment()) addAnns(item);
            else if (item.isRegularItem && item.isRegularItem()) {
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
        } catch (e) {}
        return out;
    }

    /** The entries behind a number, grouped by where they sit (the item's
     *  own group first), and their total. Backlinks come back as one group
     *  per target; the popup renders them with the section's renderer, which
     *  groups them the same way (`_wvBlRenderByPart`). */
    _wvCountEntries(kind: WvCountKind, item: any, scope: WvCountScope): { total: number; groups: WvCountGroup[] } {
        const self: any = this;
        const groups: WvCountGroup[] = [];
        let total = 0;
        if (!item) return { total, groups };
        if (kind === "backlinks") {
            const byTarget = new Map<number, WvCountGroup>();
            for (const e of (self._wvBlEntries(item, scope) || [])) {
                let g = byTarget.get(e.target.id);
                if (!g) { g = { source: e.target, entries: [] }; byTarget.set(e.target.id, g); groups.push(g); }
                g.entries.push(e.src);
                total++;
            }
            return { total, groups };
        }
        if (kind === "links") {
            // One group per source (a note, an annotation), its resolved
            // references in text order; a broken one is the renderer's to
            // list greyed, never counted (backlinks.ts _wvLkEntries).
            const bySrc = new Map<number, WvCountGroup>();
            for (const r of (self._wvLkEntries(item, scope) || [])) {
                if (!r.target) continue;
                let g = bySrc.get(r.src.id);
                if (!g) { g = { source: r.src, entries: [] }; bySrc.set(r.src.id, g); groups.push(g); }
                g.entries.push(r);
                total++;
            }
            return { total, groups };
        }
        if (kind === "extlinks") {
            // One group per note or annotation, its web and app links in text
            // order (backlinks.ts _wvExtEntries).
            const bySrc = new Map<number, WvCountGroup>();
            for (const e of (self._wvExtEntries(item, scope) || [])) {
                let g = bySrc.get(e.src.id);
                if (!g) { g = { source: e.src, entries: [] }; bySrc.set(e.src.id, g); groups.push(g); }
                g.entries.push(e.link);
                total++;
            }
            return { total, groups };
        }
        for (const src of this._wvCountSources(item, scope)) {
            let entries: any[] = [];
            try {
                if (kind === "related") entries = self._getAnnotationRelatedItems(src) || [];
                else {
                    const want = kind === "tags-auto";
                    entries = ((src.getTags && src.getTags()) || []).filter((t: any) => t && ((t.type === 1) === want));
                }
            } catch (e) { entries = []; }
            if (!entries.length) continue;
            groups.push({ source: src, entries });
            total += entries.length;
        }
        return { total, groups };
    }

    /** A column's number as a link, or null for zero (the cell stays blank,
     *  as before). The span names its kind, its item and the scope its
     *  number counts. */
    _wvCountSpan(doc: any, n: number, kind: WvCountKind, itemID: number, scope: WvCountScope): any {
        if (!doc || !(n > 0) || KINDS.indexOf(kind) < 0) return null;
        const s = doc.createElement("span");
        s.className = "wv-col-count";
        s.textContent = String(n);
        s.dataset.wvCount = kind;
        s.dataset.wvItem = String(itemID);
        s.dataset.wvScope = scope;
        return s;
    }

    // ---- the press -> release path (pane.ts tree delegate) -------------

    /** Record a plain left press on a number. False (and nothing kept) for
     *  any other press: a modifier keeps Zotero's multi-select. */
    _wvCountOnPress(e: any, win: any): boolean {
        try {
            const t = e && e.target;
            const s = t && t.closest && t.closest(".wv-col-count");
            if (!s || e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) {
                if (win) presses.delete(win);
                return false;
            }
            let rect: any = null;
            try {
                const r = s.getBoundingClientRect();
                if (r.width || r.height) rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
            } catch (er) {}
            presses.set(win, {
                kind: s.dataset.wvCount, item: Number(s.dataset.wvItem), scope: s.dataset.wvScope || "subtree",
                x: e.clientX, y: e.clientY, t: Date.now(), rect, anchor: s,
            });
            return true;
        }
        catch (er) { return false; }
    }

    /** The matching release opens the popup a tick later (Zotero's own
     *  mouseup finishes the row selection first). Moved more than a few px,
     *  held too long, another button, a modifier: nothing. */
    _wvCountOnRelease(e: any, win: any): boolean {
        const p = win ? presses.get(win) : null;
        if (win) presses.delete(win);
        try {
            if (!p || !e || e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return false;
            if (Math.abs((e.clientX || 0) - p.x) > PRESS_SLOP || Math.abs((e.clientY || 0) - p.y) > PRESS_SLOP) return false;
            if (Date.now() - p.t > PRESS_MAX_MS) return false;
            // The row may have re-rendered under the pointer: the span at the
            // release (if any) must still be the same number.
            const t = e.target;
            const s = t && t.closest && t.closest(".wv-col-count");
            if (s && (s.dataset.wvCount !== p.kind || Number(s.dataset.wvItem) !== p.item)) return false;
            const anchor = (s && s.isConnected) ? s : p.anchor;
            win.setTimeout(() => {
                try {
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvOpenCountPopup(p.kind, p.item, { anchorNode: anchor, anchorRect: p.rect, scope: p.scope, win, fromClick: true });
                } catch (er) { Zotero.debug("[Weavero] count popup open err: " + er); }
            }, 0);
            return true;
        }
        catch (er) { return false; }
    }

    // ---- the popup -------------------------------------------------------

    /** True while `win`'s Tags column shows the manual and the automatic
     *  count side by side: the first number's popup then lists the manual
     *  tags only and says so (MJT 2026-10-26: "it is not all tags"). Per
     *  window: each main window has its own choice (pane.ts _wvTagsAutoFor). */
    _wvCountTagsSplit(win?: any): boolean {
        try { return !!(this as any)._wvTagsAutoFor(win || Zotero.getMainWindow()); } catch (e) { return false; }
    }

    _wvCountTitle(kind: WvCountKind, n: number, win?: any): string {
        const pl = n === 1 ? "" : "s";
        if (kind === "tags-manual") return n + (this._wvCountTagsSplit(win) ? " Manual Tag" : " Tag") + pl;
        if (kind === "tags-auto") return n + " Automatic Tag" + pl;
        if (kind === "backlinks") return n + " Backlink" + pl;
        if (kind === "links") return n + " Item Link" + pl;   // the section's and column's name (2026-10-30)
        if (kind === "extlinks") return n + " External Link" + pl;
        return n + " Related";
    }

    /** Zotero's icon for an item in a popup row (annotations by type and
     *  colour, as the relations popup draws them). */
    _wvCountItemIcon(doc: any, win: any, item: any): any {
        const self: any = this;
        try {
            if (item.isAnnotation && item.isAnnotation()) {
                const t = item.annotationType || "highlight";
                const el = self._makeChromeIcon(doc, "chrome://zotero/skin/16/universal/annotate-" + (t === "image" ? "area" : t) + ".svg", "annotation-icon wv-rel-icon");
                if (item.annotationColor) el.style.fill = item.annotationColor;
                return el;
            }
            const name = (typeof item.getItemTypeIconName === "function") ? item.getItemTypeIconName(true) : "document";
            return self._makeItemTypeIcon(doc, win, name);
        }
        catch (e) { return self._makeItemTypeIcon(doc, win, "document"); }
    }

    /** A tag's icon, drawn as Zotero's Tags section draws it
     *  (scss/elements/_tagsBox.scss; MJT 2026-10-23, "The tag icon color
     *  should match Zotero native in the popup"): a coloured tag in its
     *  colour with the filled icon (its name bold, the caller's); otherwise a
     *  manual tag in --accent-blue, an automatic one in --fill-secondary; a
     *  12-px icon. Both drawings are the Tags section's own 12-px ones at the
     *  skin root (its icon-url('tag.svg') / ('tag-fill.svg')), not
     *  16/universal/: that tag-fill.svg does not exist (a broken-image square,
     *  MJT 2026-10-23), and the 16-px tag.svg shrunk to 12 px draws 0.75-px
     *  lines that read darker than the same grey in the Tags section (MJT
     *  2026-10-26: "Not the right color for automatic tags"). `tagColors`:
     *  Zotero.Tags.getColors of the library, or null. */
    _wvCountTagIcon(doc: any, tag: any, tagColors: any): any {
        const self: any = this;
        const tagColor = tagColors && tagColors.get(String(tag.tag));
        const icon = self._makeChromeIcon(doc, tagColor ? "chrome://zotero/skin/tag-fill.svg" : "chrome://zotero/skin/tag.svg", "wv-rel-icon wv-count-tag-icon");
        icon.style.color = tagColor ? tagColor.color : (tag.type === 1 ? "var(--fill-secondary)" : "var(--accent-blue)");
        return icon;
    }

    /** Open a related item from a list of them: in a new window when asked
     *  (Shift+click, a middle click or Shift+Enter -- MJT 2026-10-26, "Also
     *  from the popups"), an annotation in the reader, anything else
     *  selected in the library. */
    async _wvCountOpenItem(it: any, newWindow = false) {
        const self: any = this;
        let opened = false;
        if (newWindow) { try { opened = await self._wvOpenItemInNewWindow(it); } catch (er) {} }
        try { if (!opened && it.isAnnotation && it.isAnnotation()) opened = await self._openAnnotationInReader(it); } catch (er) {}
        if (!opened) { try { self._navigateToItem(it); } catch (er) {} }
    }

    /** The group heading: what the entries sit on. An annotation by
     *  Zotero's title for it, as a row's line names it (MJT 2026-10-30, "For
     *  the origin of links, why not use the same format as the targets" ->
     *  "Item pane + popups"); its file and page follow in grey
     *  (`_wvCountHeadChip`). Until dev.129 "Annotation p. 1 (file): “text”",
     *  whose text the file pushed out of view. */
    _wvCountSourceLabel(src: any, item: any): string {
        try {
            if (src.id === item.id) return "This item";
            if (src.isAnnotation && src.isAnnotation()) return src.getDisplayTitle() || "Annotation";
            if (src.isNote && src.isNote()) return src.getNoteTitle() || "Note";
            return src.getDisplayTitle() || "(untitled)";
        }
        catch (e) { return ""; }
    }

    /** A heading's grey end for an annotation, after its title: its file
     *  when its paper has several Zotero annotates, then its page -- a row's
     *  line (backlinks.ts `_wvBlEnd`). The file is cut first, the page kept
     *  whole. Returns its text ("" for anything else, nothing drawn). */
    _wvCountHeadChip(doc: any, head: any, src: any, item: any): string {
        try {
            if (!src || !src.isAnnotation || !src.isAnnotation() || (item && src.id === item.id)) return "";
            const file = wvBlAttFile(src), pl = src.annotationPageLabel ? "p. " + src.annotationPageLabel : "";
            if (!file && !pl) return "";
            const chip = wvHtmlEl(doc, "span", "wv-count-group-chip", undefined, head);
            if (file) wvHtmlEl(doc, "span", "wv-count-group-file", file, chip);
            if (pl) wvHtmlEl(doc, "span", "wv-count-group-place", (file ? " · " : "") + pl, chip);
            return chip.textContent;
        }
        catch (e) { return ""; }
    }

    /** Open the popup for one number; a second call for the same number
     *  closes it. `opts`: anchorNode, anchorRect (captured at the press: the
     *  row may re-render on selection), anchorScreen (screen coordinates:
     *  an anchor inside a reader page, whose rect is not in `win`'s
     *  coordinates), scope, win, fromClick. */
    _wvOpenCountPopup(kind: WvCountKind, itemID: number, opts: any = {}) {
        const self: any = this;
        const item = Zotero.Items.get(itemID);
        if (!item || KINDS.indexOf(kind) < 0) return;
        // Every kind follows the number's scope: own on an expanded row,
        // the subtree on a collapsed one (backlinks too since 2026-10-23).
        // An annotation has no children -- its own entries ARE its subtree --
        // and its popup, from whichever surface, is laid out as a collapsed
        // item's: its heading, then the rows (MJT 2026-10-28, "The popup for
        // annotations backlinks should be the same as for items" / "Same also
        // for links").
        const scope: WvCountScope = (opts.scope === "own" && !(item.isAnnotation && item.isAnnotation())) ? "own" : "subtree";
        const win = self._resolvePopupWin(opts);
        const doc = win.document;
        const key = kind + ":" + itemID + ":" + scope;
        const existing: any = doc.getElementById("weavero-panel");
        if (existing && existing.style.display === "block" && existing._wvCountKey === key
            && existing.querySelector(".wv-count-popup")) {
            existing.style.display = "none";
            return;
        }
        // The press on the same number already closed it through the
        // outside-click dismisser (the row re-rendered, so the opener check
        // there could not match): that press was the closing click.
        if (opts.fromClick && existing && existing._wvCountClosedKey === key
            && Date.now() - (existing._wvCountClosedAt || 0) < 600) {
            existing._wvCountClosedKey = null;
            return;
        }
        const { total, groups } = this._wvCountEntries(kind, item, scope);
        const panel: any = self._getOrCreatePanel(doc);
        while (panel.firstChild) panel.removeChild(panel.firstChild);
        panel._wvOpenedFor = opts.anchorNode || null;
        panel._wvCountKey = key;
        const close = () => { try { panel.style.display = "none"; } catch (e) {} };

        const container = wvHtmlEl(doc, "div", "wv-popup-container wv-relations-popup wv-count-popup");
        container.setAttribute("tabindex", "-1");
        const header = wvHtmlEl(doc, "div", "wv-relations-header", undefined, container);
        try {
            let icon: any;
            if (kind === "related") icon = self._makeRelationsSvg(doc);
            else if (kind === "backlinks") { icon = wvHtmlEl(doc, "img"); icon.src = WV_BL_ICON_CONTEXT; }
            else if (kind === "links") { icon = wvHtmlEl(doc, "img"); icon.src = WV_LK_ICON_CONTEXT; }
            else if (kind === "extlinks") { icon = wvHtmlEl(doc, "img"); icon.src = WV_EXT_ICON_CONTEXT; }
            else icon = self._makeChromeIcon(doc, "chrome://zotero/skin/16/universal/tag.svg", "");
            icon.classList.add("wv-relations-header-icon");
            icon.setAttribute("aria-hidden", "true");
            // The header icon in its column's colour (MJT 2026-10-23, "Wrong
            // tags icon color" / "Same color problem": the shared header rule
            // paints the relations popup's amber) -- WV_COUNT_TINT. With the
            // two kinds of tags side by side, the manual tags' popup takes
            // the blue Zotero gives manual tags, as the automatic one takes
            // their grey (MJT 2026-10-26: "This one also should change, when
            // the 2 types of tags are separated").
            const tint = (kind === "tags-manual" && this._wvCountTagsSplit(win)) ? "var(--accent-blue)" : WV_COUNT_TINT[kind];
            if (tint) icon.style.color = tint;
            header.appendChild(icon);
        } catch (e) {}
        wvHtmlEl(doc, "span", "wv-relations-header-title", this._wvCountTitle(kind, total, win), header);

        const list = wvHtmlEl(doc, "div", "wv-relations-list wv-count-list", undefined, container);
        list.setAttribute("data-kind", kind);
        // Zotero's density (Settings → General), for the Related rows' padding:
        // its `zoteroUIDensity` attribute sits on #zotero-pane (uiProperties.js),
        // which this popup is not inside.
        try { list.setAttribute("data-wv-density", String(Zotero.Prefs.get("uiDensity") || "")); } catch (e) {}
        if (kind === "backlinks" || kind === "links") {
            // Both sections' renderers (one sheet, backlinks.ts); a Links
            // popup lists the broken references greyed, as the section does.
            try { self._wvBlEnsureStyle(doc); } catch (e) {}
            const host = wvHtmlEl(doc, "div", kind === "links" ? "wv-lk-body" : "wv-bl-body", undefined, list);
            if (kind === "links") self._wvLkRenderBody(host, item, doc, scope);
            else self._wvBlRenderBody(host, item, doc, scope);
            // The section's rows open their source; the popup closes after --
            // a middle click (new window, MJT 2026-10-26) too.
            container.addEventListener("click", (e: any) => {
                try { if (e.target && e.target.closest && e.target.closest(".wv-bl-row, .wv-bl-owner")) win.setTimeout(close, 0); } catch (er) {}
            }, true);
            container.addEventListener("auxclick", (e: any) => {
                try { if (e.button === 1 && e.target && e.target.closest && e.target.closest(".wv-bl-row")) win.setTimeout(close, 0); } catch (er) {}
            }, true);
        }
        else {
            const flat = scope === "own" && groups.length <= 1;
            // The library's assigned tag colours (name -> { color, position }).
            let tagColors: any = null;
            try { if (kind !== "related") tagColors = Zotero.Tags.getColors(item.libraryID); } catch (e) { tagColors = null; }
            for (const g of groups) {
                const box = wvHtmlEl(doc, "div", "wv-count-group", undefined, list);
                if (!flat) {
                    const head = wvHtmlEl(doc, "div", "wv-count-group-head", undefined, box);
                    head.appendChild(this._wvCountItemIcon(doc, win, g.source));
                    wvHtmlEl(doc, "span", "wv-count-group-title", this._wvCountSourceLabel(g.source, item), head);
                    this._wvCountHeadChip(doc, head, g.source, item);
                    // How many of the total sit here -- the item, an
                    // attachment, an annotation, a note (MJT 2026-10-23:
                    // "Show the total number of tags for each, parent, child
                    // and annotations").
                    wvHtmlEl(doc, "span", "wv-count-group-n", String(g.entries.length), head);
                }
                for (const ent of g.entries) {
                    const row = wvHtmlEl(doc, "div", "wv-rel-row wv-count-row", undefined, box);
                    row.setAttribute("role", "button");
                    row.setAttribute("tabindex", "0");
                    if (kind === "related") {
                        row.appendChild(this._wvCountItemIcon(doc, win, ent));
                        let t = "(untitled)";
                        try { t = ent.getDisplayTitle() || t; } catch (e) {}
                        wvHtmlEl(doc, "span", "wv-rel-title", t, row);
                        // Both ends with their lineage on a rest or keyboard
                        // focus, the press's effect in its foot -- no native
                        // tooltip over it (MJT 2026-10-30, the Related card).
                        const own = g.source;
                        self._wvBlCardHover(row, "relCard", (lp: any) => lp._wvRelCardShow(row, own, ent, "Click: open in library · Shift+click: new window"));
                        // Shift+click, a middle click or Shift+Enter: a new
                        // window (MJT 2026-10-26, "Also from the popups"),
                        // else the plain action when nothing opens there.
                        const activate = async (e: any, newWindow = false) => {
                            try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
                            await this._wvCountOpenItem(ent, newWindow || !!(e && e.shiftKey));
                            close();
                        };
                        row.addEventListener("click", (e: any) => activate(e));
                        row.addEventListener("mousedown", (e: any) => { if (e.button === 1) e.preventDefault(); });
                        row.addEventListener("auxclick", (e: any) => { if (e.button === 1) activate(e, true); });
                        row.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") activate(e); });
                        row.addEventListener("contextmenu", (e: any) => {
                            e.preventDefault(); e.stopPropagation();
                            // Kept open under the menu, as the relations popup
                            // does; Remove Relation rebuilds the list.
                            self._openRelatedItemContextMenu(ent, e.screenX, e.screenY, {
                                sourceItem: g.source,
                                onRelationRemoved: () => {
                                    try { panel._wvCountKey = null; } catch (er) {}
                                    try { this._wvOpenCountPopup(kind, itemID, Object.assign({}, opts, { fromClick: false })); } catch (er) {}
                                },
                            });
                        });
                    }
                    else if (kind === "extlinks") {
                        // The link as written, coloured and live (its kind's
                        // colour, `_markTextLinks`), the text around it under
                        // it; a press opens it, as a click on it in its note
                        // or comment does (`_launchURL`, the app links' rule
                        // included).
                        row.classList.add("wv-ext-row");
                        row.appendChild(wvExternalLinkGlyphEl(doc, { cls: "wv-ext-row-icon" }));
                        const text = wvHtmlEl(doc, "div", "wv-ext-text", undefined, row);
                        const t = wvHtmlEl(doc, "span", "wv-rel-title", String(ent.url), text);
                        try { self._markTextLinks(t, { mode: "tree" }); } catch (e) {}
                        try { self._wvBlEnsureStyle(doc); wvBlDrawSegs(doc, wvHtmlEl(doc, "div", "wv-bl-excerpt", undefined, text), self._wvExtExcerpt(g.source, ent)); } catch (e) {}
                        const activate = (e: any) => {
                            try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
                            close();
                            try { self._launchURL(String(ent.url)); } catch (er) { Zotero.debug("[Weavero] external link open err: " + er); }
                        };
                        row.addEventListener("click", activate);
                        row.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") activate(e); });
                    }
                    else {
                        row.appendChild(this._wvCountTagIcon(doc, ent, tagColors));
                        const label = wvHtmlEl(doc, "span", "wv-rel-title", String(ent.tag), row);
                        if (tagColors && tagColors.get(String(ent.tag))) label.style.fontWeight = "600";
                        row.title = "Filter the list by this tag";
                        const activate = (e: any) => {
                            try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
                            close();
                            try { this._wvCountApplyTag(win, String(ent.tag)); } catch (er) { Zotero.debug("[Weavero] count tag filter err: " + er); }
                        };
                        row.addEventListener("click", activate);
                        row.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") activate(e); });
                    }
                }
            }
            if (!total) wvHtmlEl(doc, "div", "wv-rel-empty", "Nothing here any more.", list);
        }
        panel.appendChild(container);

        try {
            panel.style.display = "block";
            Object.defineProperty(panel, "state", { value: "open", configurable: true, writable: true });
            const margin = 6;
            const vw = (win.innerWidth || doc.documentElement.clientWidth) - margin;
            const vh = (win.innerHeight || doc.documentElement.clientHeight) - margin;
            let left = 240, top = 200;
            if (opts.anchorRect) { left = opts.anchorRect.left; top = opts.anchorRect.bottom + 4; }
            else if (opts.anchorScreen) {
                left = opts.anchorScreen.x - (typeof win.mozInnerScreenX === "number" ? win.mozInnerScreenX : 0);
                top = opts.anchorScreen.y - (typeof win.mozInnerScreenY === "number" ? win.mozInnerScreenY : 0);
            }
            else if (opts.anchorNode && opts.anchorNode.getBoundingClientRect) {
                const r = opts.anchorNode.getBoundingClientRect();
                if (r.width > 0 || r.height > 0) { left = r.left; top = r.bottom + 4; }
            }
            panel.style.left = "0px"; panel.style.top = "0px";
            const m = panel.getBoundingClientRect();
            const w = m.width || 320, h = m.height || 80;
            if (left + w > vw) left = Math.max(margin, vw - w);
            if (top + h > vh) top = Math.max(margin, vh - h);
            panel.style.left = Math.round(left) + "px";
            panel.style.top = Math.round(top) + "px";
            const teardown = self._attachOutsideClickDismiss(panel, doc, win, () => {
                panel._wvCountClosedKey = panel._wvCountKey;
                panel._wvCountClosedAt = Date.now();
                close();
                teardown();
            });
        }
        catch (e) { Zotero.debug("[Weavero] count popup position err: " + e); }
    }

    /** Add `tag` to the Tag filter of `win` (the window whose number was
     *  clicked: the filter is per main window) and apply it. */
    _wvCountApplyTag(win: any, tag: string) {
        const self: any = this;
        const prev = self._wvFilterWinOverride;
        self._wvFilterWinOverride = win;
        try {
            let st = self._filterState;
            if (!st || !st.groups || !st.groups.length) {
                self._filterState = st = { groups: [self._emptyFilterGroup()], activeGroupIndex: 0 };
            }
            const g = self._activeGroup();
            if (!g) return;
            const sel = new Set<string>(g.annotationTag || []);
            sel.add(tag);
            g.annotationTag = [...sel];
            g.annotationTagExclude = (g.annotationTagExclude || []).filter((x: string) => x !== tag);
            self._renderFilterBar();
            self._applyItemsListFilter({ cascade: true, deliberate: true });
        }
        finally { self._wvFilterWinOverride = prev || null; }
    }

    // ---- Weavero's tooltip on a cut count cell (see tipRender) -----------

    _wvCountCellCut(span: any): boolean { return wvCountCellCut(span); }

    /** A pointer move over the items tree: keep a visible tip on a wobble
     *  (or, in persist mode, while still on its cell); otherwise hide it and,
     *  over a count cell, restart the rest timer. */
    _wvCountTipMove(win: any, ev: any) {
        try {
            const s = tipState(win);
            const x = ev.clientX, y = ev.clientY;
            const target = ev.target;
            if (tipVisible(win)) {
                if (s.cell && s.cell.isConnected && target && s.cell.contains(target) && (this as any)._wvTooltipPersist()) {
                    s.at = { x, y };
                    this._wvCountTipArmAutopop(win);
                    return;
                }
                const dpr = win.devicePixelRatio || 1;
                if (s.shownAt && Math.abs(x - s.shownAt.x) * dpr <= TIP_JITTER_DEV_PX
                        && Math.abs(y - s.shownAt.y) * dpr <= TIP_JITTER_DEV_PX) return;
            }
            tipHide(win);
            tipClear(win, s, "timer");
            s.at = { x, y };
            const cell = target && target.closest && target.closest(".wv-count-cell");
            if (!cell) return;
            // A cell drawn by an older build still sets a title on hover: drop
            // it, or Gecko's tooltip shows on top of this one.
            if (cell.hasAttribute("title")) cell.removeAttribute("title");
            s.timer = win.setTimeout(() => {
                s.timer = null;
                const lp = tipLive();
                if (lp) lp._wvCountTipShow(win);
            }, TIP_DWELL_MS);
        }
        catch (e) { Zotero.debug("[Weavero] count tip move err: " + e); }
    }

    /** The rest is over: the tip for the cut count cell now under the
     *  remembered point, if any. */
    _wvCountTipShow(win: any): boolean {
        try {
            const s = tipState(win);
            if (!s.at) return false;
            const el = win.document.elementFromPoint(s.at.x, s.at.y);
            const cell = el && el.closest && el.closest(".wv-count-cell");
            if (!cell || !wvCountCellCut(cell)) return false;
            tipRender(win, cell, s.at.x, s.at.y);
            s.shownAt = { x: s.at.x, y: s.at.y };
            s.cell = cell;
            if ((this as any)._wvTooltipPersist()) this._wvCountTipArmAutopop(win);
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] count tip show err: " + e); return false; }
    }

    _wvCountTipArmAutopop(win: any) {
        const s = tipState(win);
        tipClear(win, s, "autopop");
        s.autopop = win.setTimeout(() => { s.autopop = null; tipHide(win); }, TIP_AUTOPOP_MS);
    }

    /** Wheel scrolling moves the rows under a still pointer: hide, and rest
     *  again at the same point (the dwell hit-tests what is there then). */
    _wvCountTipScrolled(win: any) {
        const s = tipState(win);
        const at = s.at;
        tipHide(win);
        tipClear(win, s, "timer");
        if (!at) return;
        s.timer = win.setTimeout(() => {
            s.timer = null;
            const lp = tipLive();
            if (lp) lp._wvCountTipShow(win);
        }, TIP_DWELL_MS);
    }

    _wvCountTipHide(win: any) { tipCancel(win); }

    /** destroy() / a new instance: no timer, no tip left in the window. */
    _wvCountTipTeardown(win: any) {
        try { tipCancel(win); } catch (e) {}
        try { const t = tipEl(win); if (t) t.remove(); } catch (e) {}
        tips.delete(win);
    }

    /** Per main window: the moves over the items tree drive the tip; a
     *  press, a scroll, leaving the list, a key or leaving the window end it
     *  (Gecko's tooltip goes on the same). The tree of the library tab on
     *  screen: each further tab's comes through the table's perView run. */
    _wvWireCountTip(win: any): void {
        const doc = win && win.document;
        const tree = doc && wvViewEl(doc, "zotero-items-tree");
        if (!tree) return;
        const on = wvListener((this as any)._wvWireTag());
        on(tree, "countTip:pointermove", "pointermove", (e: any) => { const lp = tipLive(); if (lp) lp._wvCountTipMove(win, e); }, { passive: true });
        on(tree, "countTip:pointerleave", "pointerleave", () => tipCancel(win));
        on(tree, "countTip:mousedown", "mousedown", () => tipCancel(win), true);
        on(tree, "countTip:scroll", "scroll", () => { const lp = tipLive(); if (lp) lp._wvCountTipScrolled(win); }, { capture: true, passive: true });
        on(win, "countTip:keydown", "keydown", () => tipCancel(win), true);
        on(win, "countTip:blur", "blur", () => tipCancel(win));
    }
}

const _countPopupsDescriptors = Object.getOwnPropertyDescriptors(_CountPopupsMixin.prototype);
delete (_countPopupsDescriptors as any).constructor;
export const countPopupsMethods = _countPopupsDescriptors;
