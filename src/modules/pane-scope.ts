// Module: pane-scope -- what the item pane's Tags, Related, Links and
// Backlinks sections list of the item's children and annotations (MJT
// 2026-10-29: "For the sections Tags, Related, Links and Backlinks, it
// should be possible to extend or narrow whether to show only for the
// parent, or also for the childs and annotations"; the children's entries
// grouped by part, the choice remembered per section).
//
// The header's counts are the controls (MJT 2026-10-29, "I would like to
// use the icons as filter toggles" -> "Ok for A", the header button
// dropped as redundant with them): each level -- the item's own, its
// attachments, notes, annotations, and for Links and Backlinks the two
// kinds of reference, the internal links, Links' broken links -- counted
// beside the title by its icon. The counts filter as the items list's
// funnel does (dev.113, MJT 2026-10-30, "just the same filtering as in the
// items list"): click shows a level alone, Alt+click hides it, remembered
// per main window and lost at restart; a new window starts from the
// Settings grid's defaults (`paneScope.<kind>.<cell>`). A toggle is drawn
// while its count is above 0, while the filter names it, or when pinned
// (`paneScope.<kind>.pin.<cell>`, and the defaults' own toggles by
// necessity): the default is always within reach, and the section's
// context menu brings it back in one gesture (MJT 2026-11-02). Until
// dev.112 a header button widened a whole section (Zotero's
// `extra-buttons` for Tags and Related, an ItemPaneManager section button
// for the others): wiring a section puts Zotero's own "add" back if a
// build left it there.
//
// Tags and Related keep Zotero's own list on top, editable as ever, and
// add a block after the section's body for the listed levels: one heading
// per part (a file, an annotation, a note) with its entries, drawn as the
// count popups draw theirs (count-popups.ts), on the guide line. Zotero's
// renders replace the tags list (#rows) or the related body's children
// only, so the block survives them, and it collapses with the section
// (`:not([open]) > :not(.head)`, _collapsibleSection.scss). Zotero's own
// list gets a "This item" heading over it while a block shows. Zotero's
// setCount writes `data-l10n-args` and `empty` on every render: the redraw
// follows. Links and Backlinks list in their own renderers (links.ts,
// backlinks.ts) through `_wvScopePass`.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvHtmlEl, wvSetBoolAttr, winOf } from "../lib/dom";
import { wvUnlisten } from "../lib/listen";
import { wvMainWins } from "../lib/windows";
import { wvLivePlugin } from "../lib/live";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvLinkGlyphEl, wvRefMarkGlyphEl } from "../lib/link-glyph";
import { WV_SCOPE_CELLS, wvScopeDefaults, wvScopeDefaultNamedCells } from "../lib/pane-scope-defaults";
import { wvBlBodyRefreshIn } from "./backlinks";
import { wvL10n, wvStr, wvAttr, wvDataLabel, wvZoteroLabel, wvZoteroText } from "../lib/l10n";

declare const Zotero: any;

export type WvScopeKind = "tags" | "related" | "links" | "backlinks";
type WvNativeKind = "tags" | "related";

/** Zotero's two sections: their element and their own header message. The
 *  item pane's carry their pane id; the note editor's links box holds a
 *  tags-box and a related-box of its own, without one (a note has nothing
 *  to widen to). */
const NATIVE: Record<WvNativeKind, { box: string; l10n: string }> = {
    tags: { box: 'tags-box[data-pane="tags"]', l10n: "section-tags" },
    related: { box: 'related-box[data-pane="related"]', l10n: "section-related" },
};
/** The levels below an item, counted beside a header's title, each by
 *  Zotero's own icon: its items list's Attachments and Notes column icons
 *  (itemTreeColumns.jsx IconAttachSmall / IconTreeitemNoteSmall), the one
 *  Weavero's Annotations column carries. The item's own come first, by the
 *  item's own type icon (MJT 2026-10-30: "there is only one parent item,
 *  with one specific type. Just use that"). */
const LEVELS: { key: "att" | "note" | "ann"; name: string; icon: string }[] = [
    { key: "att", name: "attachments", icon: "chrome://zotero/skin/16/universal/attachment.svg" },
    { key: "note", name: "notes", icon: "chrome://zotero/skin/16/universal/note.svg" },
    { key: "ann", name: "annotations", icon: "chrome://zotero/skin/16/universal/annotation.svg" },
];
export type WvScopeLevels = { own?: number; att: number; note: number; ann: number };
/** A row's level for the counts' filter: the item's own, or the part it is
 *  on. */
export type WvScopeLevel = "own" | "att" | "note" | "ann";
/** A section's filter by its header counts, held as the items list's filter
 *  funnel holds its own (MJT 2026-10-30, "just the same filtering as in the
 *  items list"; filter.ts _toggleIncludeExclude): the levels shown alone
 *  (`inc`, alternatives) or hidden (`exc`), one direction at a time, and
 *  the internal links -- 1 only them, -1 none, 0 either. One per section
 *  kind and main window (`win._wvScopeFilters`, filter.ts's per-window
 *  rule): kept while the window moves between items, lost with it; a new
 *  window, and every window after a restart, starts from the Settings
 *  defaults (`_wvScopeFilterFor`). */
export type WvScopeFilter = { inc: WvScopeLevel[]; exc: WvScopeLevel[]; loop: number; broken: number; ref: number };
/** `broken` (Links): its broken links, 1 only them, -1 none, 0 with the
 *  others (MJT 2026-10-30, "Can you put a broken link icon and make it a
 *  toggle at the end?" -> "1a"). `ref` (Links, Backlinks): what the
 *  references are, 1 the Zotero links (zotero://) only, -1 the note
 *  citations only, 0 both (MJT 2026-10-30, "I think that showing the link type
 *  icon at the end of the line is too much. Put them as toggles in the
 *  header for now") -- two counts, one state. */
type WvScopeKey = WvScopeLevel | "loop" | "broken" | "link" | "zotero";
/** What a count needs to act as a toggle: its section, the section's kind,
 *  the filter it sets, the item shown (the item's own icon). */
export type WvScopeCtl = { kind: WvScopeKind; sec: any; f: WvScopeFilter; item: any };
/** Each section's Settings grid row -- the levels it names, a
 *  `paneScope.<kind>.<level>` default pref and a `paneScope.<kind>.pin.<level>`
 *  pin pref each, and for Item Links and Backlinks the two kinds of
 *  reference and the internal links, for Item Links the broken links -- is
 *  lib/pane-scope-defaults.ts's (WV_SCOPE_CELLS), shared with the Settings
 *  pane's script. Links' levels are where a link is written: a note or an
 *  annotation -- a paper writes none itself, a file none. */
const NATIVE_KINDS: WvNativeKind[] = ["tags", "related"];
/** The Settings grid's cells for the two kinds of reference, and the
 *  header's two toggles for them. */
const CELL_KEY: Record<string, WvScopeKey> = { zlinks: "link", citations: "zotero" };
/** The section menu's entry (`collapsibleSection.js` `_contextMenu`). */
const MENU_RESET = "wv-scope-menu-reset";
const MENU_SEP = "wv-scope-menu-sep";
const BLOCK = "wv-scope-block";
/** Until dev.112: the header button's type, and its press listener's key
 *  on a native section (lib/listen.ts) -- taken off a section a build left
 *  them on. */
const OLD_BUTTON = "wv-scope";
const PRESS_KEY = "wvScopePress";

class _PaneScopeMixin {
    /** The gate of what Weavero adds to Zotero's Tags and Related sections
     *  (its only callers: the native wiring and draw): their own switch,
     *  under the Relations one (MJT 2026-11-03, "so that users who don't
     *  like it can disable it"; the Relations switch alone until dev.172).
     *  Item Links and Backlinks draw their counts under their sections'
     *  switches. */
    _wvScopeOn(): boolean {
        try { return !!(this as any)._wvPref("enableTagsRelatedScope"); } catch (e) { return false; }
    }

    /** Anything under `item` a section could list: a file, a child note, an
     *  annotation. A note or an annotation has none: the levels do not
     *  apply to it, and its header carries no level count. */
    _wvScopeHasChildren(item: any): boolean {
        try {
            if (!item || (item.isNote && item.isNote()) || (item.isAnnotation && item.isAnnotation())) return false;
            return (this as any)._wvBlTargetsUnder(item).length > 1;
        } catch (e) { return false; }
    }

    /** Redraw `kind`'s sections (all four without one) in every main
     *  window: the plugin sections re-render through their refresh, Zotero's
     *  two are redrawn here. */
    _wvScopeRefresh(kind?: WvScopeKind) {
        const self: any = this;
        if (!kind || kind === "links" || kind === "backlinks") { try { self._wvBlRefreshBodies(); } catch (e) {} }
        if (!kind || kind === "tags" || kind === "related") {
            for (const w of wvMainWins()) { try { this._wvScopeProcessDoc(w.document, kind as WvNativeKind | undefined); } catch (e) {} }
        }
    }

    /** A plugin section's header title, from its body. */
    _wvScopeSectionTitle(body: any): any {
        const el = body && body.closest && body.closest("item-pane-custom-section");
        return el && el.querySelector("collapsible-section > .head .title");
    }

    /** The levels' counts beside a header's title (MJT 2026-10-29: "I
     *  would separate the children and the annotations levels" -> "I would
     *  like to use icons to make it more compact"): the item's own first (by
     *  its type icon), then each level's icon and number, the tooltip naming
     *  it ("On its notes: 3" -- `prep` "On", "To", "In"); a level with none
     *  left out unless the filter names it, the item's own unless another
     *  count shows. Zotero's title text is left as Zotero writes it.
     *  `levels` null takes the counts away. `loops`: Links' and Backlinks'
     *  internal links, `n` of the `of` the header counts, last, by the links
     *  glyph's U-turn (MJT 2026-10-29, "option 4 with an icon"). `ctl`: each
     *  count is a filter toggle too (`_wvScopeFilterToggle`), drawn in the
     *  state the filter holds. `more.refs`: Links' and Backlinks' references
     *  by what they are -- Zotero links (zotero://) by the chain with a Z,
     *  note citations (Zotero's citations and annotations in notes) by the
     *  chain with a closing quote mark (MJT 2026-11-02; the plain chain and
     *  Zotero's cite.svg until dev.143) -- shown when the item has both
     *  (or the filter names one). `more.broken`: Links' broken links, by the
     *  chain with a corner x; shown when there are some, or the filter shows
     *  only them. The item's own and the levels sit beside the title -- they
     *  add up to the title's count; the others, which do not, at the end of
     *  the title's line (MJT 2026-10-30, "The internal links toggle does not
     *  count in the total number of backlinks, as the first 4 toggles. So
     *  place it at the end of the line"): the links, Zotero's references,
     *  the internal links, the broken links. */
    _wvScopeSetCounts(title: any, levels: WvScopeLevels | null, prep: string, loops: { n: number; of: number; what: string } | null = null, ctl: WvScopeCtl | null = null,
        more: { refs?: { link: number; zotero: number } | null; broken?: number | null } | null = null) {
        if (!title || !title.parentNode) return;
        const self: any = this;
        const olds: any[] = Array.from(title.parentNode.querySelectorAll(":scope > .wv-scope-counts"));
        const old = olds[0] || null;
        const f = ctl ? ctl.f : null;
        // A toggle is drawn when its count is above 0, when the window's
        // filter names it (shown alone or hidden: an active toggle stays in
        // reach until it is cleared), or when it is pinned -- Settings' own
        // pins and the toggles the Settings default puts in a non-neutral
        // state (`_wvScopePinned`). So nothing disappears except at its
        // default state, on an item where it has nothing to show, and the
        // default is always within reach (MJT 2026-11-02, "I should always
        // be able to go back to the default"; until dev.158 only "This
        // item" was pinned, by a rule of its own, and a cleared toggle at 0
        // vanished under the hand). The broken links' hidden state is drawn
        // at 0 too since then (shown only at 1 before).
        const pinned: Set<WvScopeKey> = ctl ? this._wvScopePinned(ctl.kind) : new Set();
        const named = (key: WvScopeKey) => !!f && (key === "loop" ? f.loop !== 0 : key === "broken" ? f.broken !== 0 : key === "link" || key === "zotero" ? !!f.ref
            : f.inc.indexOf(key) >= 0 || f.exc.indexOf(key) >= 0);
        const keep = (key: WvScopeKey) => named(key) || pinned.has(key);
        const parts = levels ? LEVELS.filter((l) => levels[l.key] > 0 || keep(l.key)) : [];
        const loopShown = !!loops && (loops.n > 0 || keep("loop"));
        const refs = more && more.refs ? more.refs : null;
        const refsShown = !!refs && ((refs.link > 0 && refs.zotero > 0) || keep("link"));
        const broken = more && more.broken != null ? more.broken : null;
        const brokenShown = broken != null && (broken > 0 || keep("broken"));
        // The item's own only while another toggle is drawn: alone, the
        // title's count says it all.
        const ownShown = !!levels && levels.own != null && !!ctl && (levels.own > 0 || keep("own")) && (parts.length > 0 || loopShown || refsShown || brokenShown);
        // The section menu's "Reset Filters to Default" follows the filter
        // whatever the draw below decides.
        if (ctl) this._wvScopeMenuWire(ctl.sec, ctl.kind, f);
        if (!parts.length && !loopShown && !refsShown && !brokenShown) { for (const o of olds) o.remove(); return; }
        let ownIcon = "";
        try { ownIcon = ownShown ? String(ctl!.item.getItemTypeIconName()) : ""; } catch (e) {}
        const sig = prep + ":" + (ownShown ? "own" + levels!.own + ownIcon + "," : "") + parts.map((l) => l.key + levels![l.key]).join(",")
            + (refsShown ? ";refs" + refs!.link + "/" + refs!.zotero : "")
            + (loopShown ? ";" + loops!.what + loops!.n + "/" + loops!.of : "")
            + (brokenShown ? ";broken" + broken : "")
            + (f ? "|" + ctl!.kind + ":" + f.inc.join("+") + "/" + f.exc.join("+") + "/" + f.loop + "/" + f.broken + "/" + f.ref : "")
            + "|pin:" + Array.from(pinned).sort().join("+");
        if (old && old._wvScopeSig === sig && old._wvScopeSec === (ctl && ctl.sec)) return;
        const doc = title.ownerDocument;
        // The levels, and the two kinds of reference: sets a row or a
        // reference holds only one of, each on the grey card of the funnel
        // filter's "pick any of these" groups (MJT 2026-11-02, "When the
        // icons are exclusive in the Weavero funnel filter, they get a grey
        // background. Same rule should apply in the filters of the item pane
        // sections"). The internal and the broken links cut across both.
        const el = wvHtmlEl(doc, "span", "wv-scope-counts wv-scope-or-group");
        el.setAttribute("data-wv-owned", "true");
        const end = wvHtmlEl(doc, "span", "wv-scope-counts wv-scope-counts-end");
        end.setAttribute("data-wv-owned", "true");
        // A count as a toggle, the items list's filter funnel's (reader-
        // panels.ts mkTriTile): a click shows its level alone, Alt+click
        // hides it, the same gesture again undoes it, in the funnel's states
        // (lib/style.ts wvFilterTileRules). Its own listeners stop the press
        // so the header does not fold (collapsibleSection.js _handleClick /
        // _handleKeyDown); the live instance is found at press time (a hot
        // reload keeps the element).
        const toggle = (c: any, key: WvScopeKey, base: string) => {
            if (!ctl) { c.title = base; return; }
            const v = key === "loop" ? f!.loop : key === "broken" ? f!.broken : key === "link" ? f!.ref : key === "zotero" ? -f!.ref
                : f!.inc.indexOf(key) >= 0 ? 1 : f!.exc.indexOf(key) >= 0 ? -1 : 0;
            c.setAttribute("role", "button");
            c.setAttribute("tabindex", "0");
            c.setAttribute("aria-pressed", v === 1 ? "true" : "false");
            if (v === 1) c.dataset.selected = "true";
            else if (v === -1) c.dataset.excluded = "true";
            // Pinned: kept whatever the room (`_wvScopeFit`), as an active one.
            if (pinned.has(key)) c.dataset.pinned = "true";
            c.title = base + "\n" + (v === 1 ? "Only these are shown · click again: show all"
                : v === -1 ? "These are hidden · Alt+click again: show them"
                : "Click: show only these · Alt+click: hide these");
            const sec = ctl.sec, kind = ctl.kind;
            const fire = (alt: boolean) => { const lp: any = wvLivePlugin(); if (lp) lp._wvScopeFilterToggle(sec, kind, key, alt); };
            c.addEventListener("click", (e: any) => { e.preventDefault(); e.stopPropagation(); fire(!!e.altKey); });
            c.addEventListener("keydown", (e: any) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault(); e.stopPropagation();
                fire(!!e.altKey);
            });
        };
        if (ownShown) {
            const c = wvHtmlEl(doc, "span", "wv-scope-count", undefined, el);
            c.dataset.kind = "own";
            const ic = self._wvBlIcon(doc, ctl!.item);
            ic.classList.add("wv-scope-count-icon", "wv-scope-count-type");
            c.appendChild(ic);
            wvHtmlEl(doc, "span", "wv-scope-count-n", String(levels!.own), c);
            toggle(c, "own", prep + " this item: " + levels!.own);
        }
        for (const l of parts) {
            const n = levels![l.key];
            const c = wvHtmlEl(doc, "span", "wv-scope-count", undefined, el);
            c.dataset.kind = l.key;
            c.appendChild(self._makeChromeIcon(doc, l.icon, "wv-scope-count-icon"));
            wvHtmlEl(doc, "span", "wv-scope-count-n", String(n), c);
            toggle(c, l.key, prep + " its " + l.name + ": " + n);
        }
        if (refsShown) {
            const kinds = wvHtmlEl(doc, "span", "wv-scope-kinds wv-scope-or-group", undefined, end);
            const cl = wvHtmlEl(doc, "span", "wv-scope-count", undefined, kinds);
            cl.dataset.kind = "link";
            cl.appendChild(wvRefMarkGlyphEl(doc, "zotero", { cls: "wv-scope-count-icon" }));
            wvHtmlEl(doc, "span", "wv-scope-count-n", String(refs!.link), cl);
            toggle(cl, "link", "Zotero links: " + refs!.link);
            const cz = wvHtmlEl(doc, "span", "wv-scope-count", undefined, kinds);
            cz.dataset.kind = "zotero";
            cz.appendChild(wvRefMarkGlyphEl(doc, "cite", { cls: "wv-scope-count-icon" }));
            wvHtmlEl(doc, "span", "wv-scope-count-n", String(refs!.zotero), cz);
            toggle(cz, "zotero", "Note citations: " + refs!.zotero);
        }
        if (loopShown) {
            const c = wvHtmlEl(doc, "span", "wv-scope-count", undefined, end);
            c.dataset.kind = "internal";
            c.appendChild(wvLinkGlyphEl(doc, { cls: "wv-scope-count-icon", backlink: "loop" }));
            wvHtmlEl(doc, "span", "wv-scope-count-n", String(loops!.n), c);
            toggle(c, "loop", "Internal " + loops!.what + ": " + loops!.n + " of " + loops!.of + " (both ends in the same item)");
        }
        if (brokenShown) {
            const c = wvHtmlEl(doc, "span", "wv-scope-count", undefined, end);
            c.dataset.kind = "broken";
            c.appendChild(wvLinkGlyphEl(doc, { cls: "wv-scope-count-icon", backlink: "broken" }));
            wvHtmlEl(doc, "span", "wv-scope-count-n", String(broken), c);
            toggle(c, "broken", "Broken links: " + broken + " (the item is gone, or its group library is not in this profile)");
        }
        for (const o of olds) o.remove();
        // The levels beside the title; the rest last in the title's box,
        // after Zotero's summary, at the line's end.
        if (el.firstChild) title.after(el);
        if (end.firstChild) title.parentNode.appendChild(end);
        const first = el.firstChild ? el : end;
        first._wvScopeSig = sig;
        first._wvScopeSec = ctl ? ctl.sec : null;
        this._wvScopeFitWire(title.parentNode);
    }

    /** The header's counts on one line, never wider than the pane (MJT
     *  2026-10-30, "At small width, the broken links icon disappears" ->
     *  "Drop counts, keep broken"): Zotero's title box is contained
     *  (constants.ts `[data-wv-counts]`) -- the Backlinks counts had held
     *  the item details at 413 px in a 320-px pane, every section's right
     *  end, Zotero's own too, under the side navigation -- and short of room
     *  the links' and Zotero's references' counts go first, then the
     *  internal links'; never the broken links', nor a count whose filter
     *  is on, nor a pinned one. A resize watch refits; `_wvScopeDestroy`
     *  drops it. */
    _wvScopeFitWire(tb: any) {
        const self: any = this;
        try {
            if (!tb.hasAttribute("data-wv-counts")) tb.setAttribute("data-wv-counts", "true");
            const win = tb.ownerDocument.defaultView;
            if (!tb._wvScopeFitRO && win && win.ResizeObserver) {
                const ro = new win.ResizeObserver(() => { const lp: any = wvLivePlugin(); if (lp) lp._wvScopeFit(tb); });
                ro.observe(tb);
                tb._wvScopeFitRO = ro;
                const set: Set<any> = self._wvScopeFitBoxes || (self._wvScopeFitBoxes = new Set());
                for (const b of Array.from(set)) if (!b.isConnected) { try { b._wvScopeFitRO.disconnect(); } catch (e) {} delete b._wvScopeFitRO; set.delete(b); }
                set.add(tb);
            }
        } catch (e) {}
        this._wvScopeFit(tb);
    }

    /** Fit `tb`'s counts to its width; the last resort, once the counts
     *  that may go have gone, is the title clipped ("81 Backl", `data-wv-tight`)
     *  -- "81 Backlinks" and five level counts need 293 px, a 320-px pane
     *  leaves the title box 284. */
    _wvScopeFit(tb: any) {
        try {
            if (!tb) return;
            if (tb.hasAttribute("data-wv-tight")) tb.removeAttribute("data-wv-tight");
            const end = tb.querySelector(":scope > .wv-scope-counts-end");
            const cs = end ? Array.from(end.querySelectorAll(".wv-scope-count")) as any[] : [];
            const cards = end ? Array.from(end.querySelectorAll(":scope > .wv-scope-or-group")) as any[] : [];
            for (const c of cs) if (c.hidden) c.hidden = false;
            for (const g of cards) if (g.hidden) g.hidden = false;
            const over = () => tb.scrollWidth > tb.clientWidth + 0.5;
            for (const kinds of [["link", "zotero"], ["internal"]]) {
                if (!over()) return;
                for (const c of cs) if (kinds.indexOf(c.dataset.kind) >= 0 && !c.dataset.selected && !c.dataset.excluded && !c.dataset.pinned) c.hidden = true;
                // A grey card left with no count goes too.
                for (const g of cards) if (Array.from(g.children).every((c: any) => c.hidden)) g.hidden = true;
            }
            if (over()) tb.setAttribute("data-wv-tight", "true");
        } catch (e) {}
    }

    // ---- the counts as the items list's filter ---------------------------

    /** The filter `kind`'s sections hold in `win`, started the first time
     *  that window asks -- a new window, any window after a restart -- from
     *  the Settings defaults (MJT 2026-10-30, "I should be able to decide
     *  in the settings what is the default for new windows and after
     *  restart"): the levels checked shown alone (all or none checked: no
     *  filter), the internal links hidden when unchecked. */
    _wvScopeFilterFor(win: any, kind: WvScopeKind): WvScopeFilter {
        let all: any = null;
        try { all = win ? (win._wvScopeFilters || (win._wvScopeFilters = {})) : null; } catch (e) { all = null; }
        if (all && all[kind]) {
            // A filter a window kept from an older build lacks the newer
            // states: they start from their defaults, the rest is kept (an
            // update hot-reloads the plugin under open windows; dev.121's
            // first install drew the broken links' count stateless).
            const old = all[kind];
            if (old.broken == null || old.ref == null) {
                const d = this._wvScopeDefaults(kind);
                if (old.broken == null) old.broken = d.broken;
                if (old.ref == null) old.ref = d.ref;
            }
            return old;
        }
        const f = this._wvScopeDefaults(kind);
        if (all) all[kind] = f;
        return f;
    }

    /** A Settings grid cell's box for `kind`, `cell` a default's or a
     *  pin's (`pin.<cell>`); a read that throws answers the row's default. */
    _wvScopeCellPref(kind: WvScopeKind, cell: string): boolean {
        const self: any = this;
        const key = "paneScope." + kind + "." + cell;
        try { return !!self._wvPref(key); }
        catch (e) {
            try { return !!self._wvPrefsTable()[key].def; } catch (e2) { return false; }
        }
    }

    /** The filter a window starts from for `kind`: the Settings grid's
     *  default row (lib/pane-scope-defaults.ts wvScopeDefaults; the two
     *  kinds of reference as the levels since dev.153, MJT 2026-11-02,
     *  "The new additions are missing from here"). A fresh object each call. */
    _wvScopeDefaults(kind: WvScopeKind): WvScopeFilter {
        const d = wvScopeDefaults(kind, (cell) => this._wvScopeCellPref(kind, cell));
        return { inc: d.inc.slice() as WvScopeLevel[], exc: [], loop: d.loop, broken: d.broken, ref: d.ref };
    }

    /** Whether `f` is `kind`'s defaults (the section menu's reset greyed). */
    _wvScopeAtDefaults(kind: WvScopeKind, f: WvScopeFilter): boolean {
        const d = this._wvScopeDefaults(kind);
        const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.indexOf(x) >= 0);
        return same(f.inc, d.inc) && !f.exc.length && f.loop === d.loop && f.broken === d.broken && f.ref === d.ref;
    }

    /** The toggles `kind`'s sections draw whatever the item, at 0 too (MJT
     *  2026-11-02, "the settings could decide which toggle is pinned, as
     *  well as what is the default. The idea is that I should always be
     *  able to go back to the default"): the cells pinned in Settings
     *  (`paneScope.<kind>.pin.<cell>`), and every cell the Settings default
     *  puts in a non-neutral state -- a default whose toggle is not drawn
     *  on an item where that toggle's count is 0 is out of reach from
     *  there, so no such default exists (the pane forces those pin boxes
     *  on, prefs/index.ts). The two kinds of reference are one pair: either
     *  cell pins both. Read at every draw (a dozen pref reads). */
    _wvScopePinned(kind: WvScopeKind): Set<WvScopeKey> {
        const get = (cell: string) => this._wvScopeCellPref(kind, cell);
        const cells = new Set<string>(wvScopeDefaultNamedCells(kind, get));
        for (const cell of WV_SCOPE_CELLS[kind]) if (get("pin." + cell)) cells.add(cell);
        const out = new Set<WvScopeKey>();
        for (const c of Array.from(cells)) {
            if (CELL_KEY[c]) { out.add("link"); out.add("zotero"); }
            else out.add(c as WvScopeKey);
        }
        return out;
    }

    /** The filter of the window `el` is in (a section, its body, its rows'
     *  host). The count popups list what their number counts and never ask. */
    _wvScopeFilterIn(el: any, kind: WvScopeKind): WvScopeFilter | null {
        let win: any = null;
        try { win = el && el.ownerDocument && el.ownerDocument.defaultView; } catch (e) { win = null; }
        return win ? this._wvScopeFilterFor(win, kind) : null;
    }

    /** Drop `win`'s filters (`kind`'s, or all): the next draw starts from
     *  the Settings defaults again. */
    _wvScopeFilterReset(win: any, kind?: WvScopeKind) {
        try {
            if (!win || !win._wvScopeFilters) return;
            if (kind) delete win._wvScopeFilters[kind]; else delete win._wvScopeFilters;
        } catch (e) {}
    }

    /** Whether `f` lets a row through, the items list's rule: the levels
     *  shown alone are alternatives, a hidden level is out, the internal
     *  links' state applies as well. `level` is the item's own or the part
     *  the row is on; `internal` an internal link. `levels` false -- an item
     *  with nothing below it -- leaves the levels out of it. */
    _wvScopePass(f: WvScopeFilter | null, level: WvScopeLevel, internal = false, levels = true, broken = false, ref: string | null = null): boolean {
        if (!f) return true;
        if (levels) {
            if (f.inc.length && f.inc.indexOf(level) < 0) return false;
            if (f.exc.indexOf(level) >= 0) return false;
        }
        if (f.loop === 1 && !internal) return false;
        if (f.loop === -1 && internal) return false;
        // `broken`, `ref`: a Links / Backlinks row's (the levels' callers
        // leave them out).
        if (f.broken === 1 && !broken) return false;
        if (f.broken === -1 && broken) return false;
        if (ref && f.ref === 1 && ref !== "link") return false;
        if (ref && f.ref === -1 && ref === "link") return false;
        return true;
    }

    /** A part's level under its item. */
    _wvScopeLevelOf(it: any): "att" | "note" | "ann" {
        if (it && it.isAnnotation && it.isAnnotation()) return "ann";
        if (it && it.isNote && it.isNote()) return "note";
        return "att";
    }

    /** A count's press, the funnel's: a click shows its level alone (a
     *  second one: either), an Alt+click hides it, the same gesture again
     *  undoes it, one direction at a time (filter.ts _toggleIncludeExclude);
     *  the internal links' count: only them / none. Then `kind`'s sections
     *  in that window redraw, and the one pressed opens if it was folded --
     *  without saving that open state (collapsibleSection.js _saveOpenState
     *  honours `_skipSaveOpenState`). */
    _wvScopeFilterToggle(sec: any, kind: WvScopeKind, key: WvScopeKey, alt: boolean) {
        let win: any = null;
        try { win = sec.ownerDocument.defaultView; } catch (e) { win = null; }
        if (!win) return;
        const f = this._wvScopeFilterFor(win, kind);
        if (key === "loop") f.loop = alt ? (f.loop === -1 ? 0 : -1) : (f.loop === 1 ? 0 : 1);
        else if (key === "broken") f.broken = alt ? (f.broken === -1 ? 0 : -1) : (f.broken === 1 ? 0 : 1);
        // Links and Zotero's references are one state: only the links is
        // hiding Zotero's, and the other way round.
        else if (key === "link" || key === "zotero") {
            const only = key === "link" ? 1 : -1;
            f.ref = alt ? (f.ref === -only ? 0 : -only) : (f.ref === only ? 0 : only);
        }
        else {
            const mine = alt ? f.exc : f.inc;
            const i = mine.indexOf(key);
            if (i >= 0) mine.splice(i, 1);
            else {
                mine.push(key);
                if (alt) f.inc = []; else f.exc = [];
            }
        }
        const open = () => {
            try {
                if (sec.open || sec.empty) return;
                sec._skipSaveOpenState = true;
                try { sec.open = true; } finally { sec._skipSaveOpenState = false; }
            } catch (e) {}
        };
        if (kind === "tags" || kind === "related") {
            this._wvScopeRedraw(win, kind);
            open();
            return;
        }
        this._wvScopeRedraw(win, kind).then(open, open);
    }

    /** `kind`'s sections in `win` drawn again after its filter moved:
     *  Zotero's two at once, Links and Backlinks through their bodies'
     *  refresh (backlinks.ts). */
    _wvScopeRedraw(win: any, kind: WvScopeKind): Promise<void> {
        if (kind === "tags" || kind === "related") {
            try { this._wvScopeProcessDoc(win.document, kind); } catch (e) {}
            return Promise.resolve();
        }
        let p: Promise<void>;
        try { p = wvBlBodyRefreshIn(win.document); } catch (e) { p = Promise.resolve(); }
        return p;
    }

    /** The section menu's "Reset Filters to Default" (MJT 2026-11-02, "Back
     *  to default can be added in the right-click menu of the section"):
     *  the window's filter for `kind` back to the Settings defaults, in one
     *  gesture, and the sections drawn again. */
    _wvScopeFilterRestore(sec: any, kind: WvScopeKind): Promise<void> {
        const win = winOf(sec);
        if (!win) return Promise.resolve();
        this._wvScopeFilterReset(win, kind);
        return this._wvScopeRedraw(win, kind);
    }

    /** Every section of every kind in every main window drawn again: a
     *  Settings default or pin changed (prefs-observers.ts), and the pinned
     *  toggles follow at once; a window's own filter is kept (the defaults
     *  are for new windows, dev.113). */
    _wvScopeRefreshAll() {
        this._wvScopeRefresh();
        for (const w of wvMainWins()) { try { wvBlBodyRefreshIn(w.document); } catch (e) {} }
    }

    /** Weavero's entry in a section's own context menu: Zotero builds one
     *  per section (collapsibleSection.js _buildContextMenu, kept as
     *  `sec._contextMenu`; the head's right-click opens it). The entry is
     *  Weavero's own node (`data-wv-owned`: the shutdown sweep takes it),
     *  finds the live instance at command time, and is greyed while the
     *  filter is at the defaults -- set at every draw, since every change
     *  of the filter or of the Settings draws the header again. `disabled`
     *  by presence (Zotero 11, #57). */
    _wvScopeMenuWire(sec: any, kind: WvScopeKind, f: WvScopeFilter | null) {
        try {
            const menu = sec && sec._contextMenu;
            if (!menu || typeof menu.appendChild !== "function") return;
            const doc = sec.ownerDocument;
            let item: any = menu.querySelector(":scope > ." + MENU_RESET);
            if (!item) {
                const sep = doc.createXULElement("menuseparator");
                sep.className = MENU_SEP;
                sep.setAttribute("data-wv-owned", "true");
                item = doc.createXULElement("menuitem");
                item.className = MENU_RESET;
                item.setAttribute("data-wv-owned", "true");
                wvL10n(item, "weavero-menu-section-reset-filters");
                item.addEventListener("command", () => { const lp: any = wvLivePlugin(); if (lp) lp._wvScopeFilterRestore(sec, kind); });
                menu.appendChild(sep);
                menu.appendChild(item);
            }
            wvSetBoolAttr(item, "disabled", !f || this._wvScopeAtDefaults(kind, f));
        } catch (e) {}
    }

    /** The entry taken off a section's menu. */
    _wvScopeMenuUnwire(sec: any) {
        try {
            const menu = sec && sec._contextMenu;
            if (!menu || !menu.querySelectorAll) return;
            for (const el of Array.from(menu.querySelectorAll(":scope > ." + MENU_RESET + ", :scope > ." + MENU_SEP)) as any[]) el.remove();
        } catch (e) {}
    }

    // ---- Zotero's Tags and Related -------------------------------------

    /** Wire and draw Zotero's Tags and Related sections in `doc`'s item
     *  panes (the library's and each tab's context pane); `only` one kind. */
    _wvScopeProcessDoc(doc: any, only?: WvNativeKind) {
        if (!doc) return;
        const self: any = this;
        try { self._wvBlEnsureFtl(doc.defaultView); } catch (e) {}
        for (const kind of NATIVE_KINDS) {
            if (only && only !== kind) continue;
            for (const box of Array.from(doc.querySelectorAll(NATIVE[kind].box)) as any[]) {
                try { this._wvScopeWireNative(box, kind); }
                catch (e) { Zotero.debug("[Weavero] scope " + kind + " wire: " + e); }
            }
        }
    }

    /** The redraw after each of Zotero's renders of one of its sections;
     *  then a first draw. A header button a build before dev.112 put there
     *  goes (Zotero's "add" alone again). With the feature off, the section
     *  is given back as Zotero built it. */
    _wvScopeWireNative(box: any, kind: WvNativeKind) {
        const sec = box.querySelector(":scope > collapsible-section");
        if (!sec) return;
        if (!this._wvScopeOn()) { this._wvScopeUnwireNative(box, kind); return; }
        if (String(sec.getAttribute("extra-buttons") || "").split(",").indexOf(OLD_BUTTON) >= 0) sec.setAttribute("extra-buttons", "add");
        try { wvUnlisten(sec, PRESS_KEY); } catch (e) {}
        // Zotero's setCount writes the args (and `empty`) on every render:
        // the draw follows. The observer outlives a hot reload on the
        // element, so it reaches the live instance at call time.
        if (!sec._wvScopeMO) {
            const MO = sec.ownerDocument.defaultView.MutationObserver;
            sec._wvScopeMO = new MO(() => {
                const lp: any = wvLivePlugin();
                if (lp) { try { lp._wvScopeDrawNative(box, kind); } catch (e) {} }
            });
            sec._wvScopeMO.observe(sec, { attributes: true, attributeFilter: ["data-l10n-args", "empty"] });
        }
        this._wvScopeDrawNative(box, kind);
    }

    /** Give one of Zotero's sections back as Zotero built it: its own count
     *  in its header again. */
    _wvScopeUnwireNative(box: any, kind: WvNativeKind) {
        const sec = box.querySelector(":scope > collapsible-section");
        if (!sec) return;
        try { if (sec._wvScopeMO) sec._wvScopeMO.disconnect(); } catch (e) {}
        sec._wvScopeMO = null;
        sec._wvScopeSig = null;
        try { wvUnlisten(sec, PRESS_KEY); } catch (e) {}
        this._wvScopeMenuUnwire(sec);
        const blk = sec.querySelector(":scope > ." + BLOCK);
        if (blk) blk.remove();
        sec.removeAttribute("data-wv-scope-hide-own");
        this._wvScopeOwnHeading(sec, null, 0);
        this._wvScopeSetCounts(sec.querySelector(":scope > .head .title"), null, "");
        if (String(sec.getAttribute("extra-buttons") || "").split(",").indexOf(OLD_BUTTON) >= 0) sec.setAttribute("extra-buttons", "add");
        this._wvScopeNativeHeader(sec, kind, this._wvScopeOwnCount(box, kind));
    }

    /** Zotero's own count for the section, from the box -- its header shows
     *  the whole item's (`_wvScopeNativeHeader`): the tags box keeps it as
     *  `count` (tagsBox.js updateCount), the related box counts its items
     *  (relatedBox.js _updateCount). */
    _wvScopeOwnCount(box: any, kind: WvNativeKind): number {
        try {
            if (kind === "tags") {
                const n = Number(box.count);
                if (box.count != null && !isNaN(n)) return n;
                return ((box.item && box.item.getTags()) || []).length;
            }
            if (typeof box._getRelatedItems === "function") return box._getRelatedItems().length;
            return ((box.item && box.item.relatedItems) || []).length;
        } catch (e) { return 0; }
    }

    /** The header: Zotero's message, in the UI language, with the whole
     *  item's count -- its own and its children's (MJT 2026-10-30, "Show
     *  the total number instead in the title"; the item's own is the first
     *  count beside it) -- and `empty` only when that is none. Zotero's
     *  setCount writes its own count on every render; the section's
     *  observer brings this back. A header a build before dev.103 left on
     *  Weavero's own message ("5 Tags · 7 on its children") is given back --
     *  translated explicitly: Fluent's own observer lagged on such a change
     *  (dev.98, the lag backlinks.ts _wvBlSetHeader met). Writes only what
     *  differs: the observer sees every write. */
    _wvScopeNativeHeader(sec: any, kind: WvNativeKind, total: number) {
        const args = JSON.stringify({ count: total });
        const idOff = sec.getAttribute("data-l10n-id") !== NATIVE[kind].l10n;
        if (idOff) sec.setAttribute("data-l10n-id", NATIVE[kind].l10n);
        if (idOff || sec.getAttribute("data-l10n-args") !== args) {
            sec.setAttribute("data-l10n-args", args);
            try {
                const l10n = sec.ownerDocument && sec.ownerDocument.l10n;
                const p = l10n && l10n.translateElements([sec]);
                if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (e) {}
        }
        const empty = !total;
        if (sec.hasAttribute("empty") !== empty) sec.empty = empty;
    }

    /** Draw one of Zotero's sections for the item it shows: the counts --
     *  the item's own first -- and the window's filter on them (MJT
     *  2026-10-30, "just the same filtering as in the items list"): the
     *  block lists the parts of the levels let through, and Zotero's own
     *  list shows while the item's own are (the `data-wv-scope-hide-own`
     *  CSS, constants.ts). An item with nothing below it has no counts, and
     *  the filter leaves it whole. A redraw with the same item and entries
     *  leaves the block alone. */
    _wvScopeDrawNative(box: any, kind: WvNativeKind) {
        const sec = box.querySelector(":scope > collapsible-section");
        if (!sec) return;
        const item = box.item;
        const can = !!item && this._wvScopeOn() && this._wvScopeHasChildren(item);
        const all = can ? this._wvScopeGroups(kind, item) : [];
        const own = this._wvScopeOwnCount(box, kind);
        const levels: WvScopeLevels = { own, att: 0, note: 0, ann: 0 };
        for (const g of all) levels[this._wvScopeLevelOf(g.source)] += g.entries.length;
        let win: any = null;
        try { win = sec.ownerDocument.defaultView; } catch (e) { win = null; }
        const f = can ? this._wvScopeFilterFor(win, kind) : null;
        const ownShown = this._wvScopePass(f, "own", false, can);
        const groups = all.filter((g) => this._wvScopePass(f, this._wvScopeLevelOf(g.source)));
        if (sec.hasAttribute("data-wv-scope-hide-own") !== !ownShown) sec.toggleAttribute("data-wv-scope-hide-own", !ownShown);
        const title = sec.querySelector(":scope > .head .title");
        this._wvScopeSetCounts(title, can ? levels : null, "On", null, f ? { kind, sec, f, item } : null);
        this._wvScopeNativeHeader(sec, kind, own + levels.att + levels.note + levels.ann);
        const old = sec.querySelector(":scope > ." + BLOCK);
        if (!groups.length) {
            if (old) old.remove();
            sec._wvScopeSig = null;
            this._wvScopeOwnHeading(sec, item, 0);
            return;
        }
        this._wvScopeOwnHeading(sec, item, ownShown ? own : 0);
        const sig = item.id + "|" + groups.map((g) => g.source.id + ":" + g.entries.map((e: any) => (kind === "tags" ? e.type + "/" + e.tag : e.id + "/" + e.getDisplayTitle())).join(",")).join(";");
        if (old && sec._wvScopeSig === sig) return;
        const doc = sec.ownerDocument;
        const blk = wvHtmlEl(doc, "div", BLOCK);
        // Weavero's whole: the shutdown sweep (index.ts _wvStripWindowChrome)
        // unwraps an all-wv element holding native content -- the annotation
        // icons carry Zotero's `annotation-icon` -- and left each of them on
        // the section at every reload (dev.99, 2026-10-29: 280 after one,
        // 514 px wide). Marked, it goes whole.
        blk.setAttribute("data-wv-owned", "true");
        this._wvScopeRenderGroups(blk, kind, item, groups);
        if (old) old.replaceWith(blk); else sec.appendChild(blk);
        sec._wvScopeSig = sig;
    }

    /** While parts are listed under them, the item's own entries -- Zotero's
     *  list, `own` of them -- get the heading the count popups give them,
     *  "This item" with its count (MJT 2026-10-29, "This Item classification
     *  should also appear in the Related section of the item pane when the
     *  children and annotations are displayed"); Zotero's rows step in under
     *  it on the guide line (the `data-wv-scope-wide` CSS, constants.ts).
     *  `own` 0 (none, or not shown): neither. Marked data-wv-owned as the
     *  block is. */
    _wvScopeOwnHeading(sec: any, item: any, own: number) {
        const self: any = this;
        const old = sec.querySelector(":scope > .wv-scope-own");
        if (!own || !item) {
            if (old) old.remove();
            if (sec.hasAttribute("data-wv-scope-wide")) sec.removeAttribute("data-wv-scope-wide");
            return;
        }
        const sig = item.id + ":" + own;
        if (!old || old._wvScopeSig !== sig) {
            const doc = sec.ownerDocument, win = doc.defaultView;
            const h = wvHtmlEl(doc, "div", "wv-scope-own");
            h.setAttribute("data-wv-owned", "true");
            const head = wvHtmlEl(doc, "div", "wv-count-group-head", undefined, h);
            head.appendChild(self._wvCountItemIcon(doc, win, item));
            let label = "This item";
            try { label = self._wvCountSourceLabel(item, item) || label; } catch (e) {}
            wvHtmlEl(doc, "span", "wv-count-group-title", label, head);
            wvHtmlEl(doc, "span", "wv-count-group-n", String(own), head);
            h._wvScopeSig = sig;
            const body = sec.querySelector(":scope > .body");
            if (old) old.replaceWith(h);
            else if (body) body.before(h);
            else sec.appendChild(h);
        }
        if (!sec.hasAttribute("data-wv-scope-wide")) sec.setAttribute("data-wv-scope-wide", "true");
    }

    /** The children's entries of `item`, one group per part that has any,
     *  in the by-part order (backlinks.ts _wvBlParts): each file followed by
     *  its annotations in reading order, then the notes. Tags in Zotero's
     *  Tags-section order; related items as the count popups list them. */
    _wvScopeGroups(kind: WvNativeKind, item: any): { source: any; entries: any[] }[] {
        const self: any = this;
        const out: { source: any; entries: any[] }[] = [];
        let parts: any[] = [];
        try { parts = self._wvBlParts(item); } catch (e) { parts = []; }
        for (const src of parts) {
            if (!src || src.id === item.id) continue;
            let entries: any[] = [];
            try {
                if (kind === "related") entries = self._getAnnotationRelatedItems(src) || [];
                else {
                    entries = ((src.getTags && src.getTags()) || []).slice();
                    entries.sort((a: any, b: any) => Zotero.Tags.compareTagsOrder(src.libraryID, a.tag, b.tag));
                }
            } catch (e) { entries = []; }
            if (entries.length) out.push({ source: src, entries });
        }
        return out;
    }

    /** The block's groups: a heading per part -- its icon, its name, its
     *  count, as the count popups head theirs -- that goes to the part;
     *  under it the part's tags (a press goes to the part too: MJT's
     *  approved "click goes to that child") or its related items (a press
     *  opens the related item, as Zotero's Related rows do; right-click,
     *  the popups' menu). */
    _wvScopeRenderGroups(parent: any, kind: WvNativeKind, item: any, groups: { source: any; entries: any[] }[]) {
        const self: any = this;
        const doc = parent.ownerDocument, win = doc.defaultView;
        let tagColors: any = null;
        try { if (kind === "tags") tagColors = Zotero.Tags.getColors(item.libraryID); } catch (e) { tagColors = null; }
        const press = (el: any, fn: (e: any) => void) => {
            el.setAttribute("role", "button");
            el.setAttribute("tabindex", "0");
            el.addEventListener("click", (e: any) => { e.stopPropagation(); fn(e); });
            el.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); fn(e); } });
        };
        for (const g of groups) {
            const box = wvHtmlEl(doc, "div", "wv-count-group", undefined, parent);
            const head = wvHtmlEl(doc, "div", "wv-count-group-head", undefined, box);
            head.appendChild(self._wvCountItemIcon(doc, win, g.source));
            let label = "";
            try { label = self._wvCountSourceLabel(g.source, item) || ""; } catch (e) {}
            wvHtmlEl(doc, "span", "wv-count-group-title", label, head);
            const chip = self._wvCountHeadChip(doc, head, g.source, item);
            head.title = label + (chip ? " · " + chip : "");
            wvHtmlEl(doc, "span", "wv-count-group-n", String(g.entries.length), head);
            const toPart = () => this._wvScopeGoTo(g.source);
            press(head, toPart);
            for (const ent of g.entries) {
                const row = wvHtmlEl(doc, "div", "wv-rel-row wv-count-row", undefined, box);
                if (kind === "related") {
                    row.appendChild(self._wvCountItemIcon(doc, win, ent));
                    let t = "(untitled)";
                    try { t = ent.getDisplayTitle() || t; } catch (e) {}
                    const span = wvHtmlEl(doc, "span", "wv-rel-title", t, row);
                    // Its links coloured and live, as Zotero's Related labels
                    // are in Weavero (pane.ts _processRelatedBoxes).
                    try { self._markTextLinks(span, { mode: "tree" }); } catch (e) {}
                    // The Related card: the part and the related item, each
                    // with its lineage (backlinks.ts _wvRelCardShow); the
                    // press's effect in its foot, no native tooltip over it.
                    const own = g.source;
                    self._wvBlCardHover(row, "relCard", (lp: any) => lp._wvRelCardShow(row, own, ent, "Click: open in library · Shift+click: new window"));
                    press(row, (e: any) => { self._wvCountOpenItem(ent, !!(e && e.shiftKey)); });
                    row.addEventListener("mousedown", (e: any) => { if (e.button === 1) e.preventDefault(); });
                    row.addEventListener("auxclick", (e: any) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); self._wvCountOpenItem(ent, true); } });
                    row.addEventListener("contextmenu", (e: any) => {
                        e.preventDefault(); e.stopPropagation();
                        try {
                            self._openRelatedItemContextMenu(ent, e.screenX, e.screenY, {
                                sourceItem: g.source,
                                onRelationRemoved: () => { const lp: any = wvLivePlugin(); if (lp) lp._wvScopeRefresh("related"); },
                            });
                        } catch (er) {}
                    });
                }
                else {
                    row.appendChild(self._wvCountTagIcon(doc, ent, tagColors));
                    const span = wvHtmlEl(doc, "span", "wv-rel-title", String(ent.tag), row);
                    if (tagColors && tagColors.get(String(ent.tag))) span.style.fontWeight = "600";
                    row.title = label;
                    press(row, toPart);
                }
            }
        }
    }

    /** Go to a part: an annotation opens in the reader, anything else is
     *  selected in the library. */
    _wvScopeGoTo(it: any) {
        const self: any = this;
        try {
            if (it.isAnnotation && it.isAnnotation()) {
                const p = self._openAnnotationInReader(it);
                if (p && typeof p.catch === "function") p.catch(() => {});
                return;
            }
            self._navigateToItem(it);
        } catch (e) { Zotero.debug("[Weavero] scope go-to: " + e); }
    }

    // ---- lifecycle -------------------------------------------------------

    /** A child's tags or relations moved (an annotation tagged, an item
     *  related): Zotero redraws the item's own list, Weavero the block. */
    _wvScopeNotify() {
        const self: any = this;
        wvClearTimeout(self._wvScopeNotifyT);
        self._wvScopeNotifyT = wvTimeout(() => {
            self._wvScopeNotifyT = null;
            if (self._wvDestroyed) return;
            this._wvScopeRefresh("tags");
            this._wvScopeRefresh("related");
        }, 150);
    }

    _wvScopeInit() {
        const self: any = this;
        try {
            if (!self._wvScopeNotifierID) {
                self._wvScopeNotifierID = Zotero.Notifier.registerObserver({
                    notify: () => { const lp: any = wvLivePlugin(); if (lp) lp._wvScopeNotify(); },
                }, ["item", "item-tag"], "weavero-scope");
            }
        } catch (e) { Zotero.debug("[Weavero] scope notifier: " + e); }
        for (const w of wvMainWins()) { try { this._wvScopeProcessDoc(w.document); } catch (e) {} }
    }

    _wvScopeDestroy() {
        const self: any = this;
        try { if (self._wvScopeNotifierID) Zotero.Notifier.unregisterObserver(self._wvScopeNotifierID); } catch (e) {}
        self._wvScopeNotifierID = null;
        wvClearTimeout(self._wvScopeNotifyT); self._wvScopeNotifyT = null;
        for (const tb of Array.from((self._wvScopeFitBoxes || []) as Set<any>)) {
            try { tb._wvScopeFitRO.disconnect(); } catch (e) {}
            delete tb._wvScopeFitRO;
            try { tb.removeAttribute("data-wv-counts"); } catch (e) {}
        }
        self._wvScopeFitBoxes = null;
        for (const w of wvMainWins()) {
            for (const kind of NATIVE_KINDS) {
                for (const box of Array.from(w.document.querySelectorAll(NATIVE[kind].box)) as any[]) {
                    try { this._wvScopeUnwireNative(box, kind); } catch (e) {}
                }
            }
            // The Links and Backlinks sections' menu entries (their
            // sections go with their ItemPaneManager registration).
            try { for (const sec of Array.from(w.document.querySelectorAll("collapsible-section")) as any[]) this._wvScopeMenuUnwire(sec); } catch (e) {}
        }
    }
}

const _paneScopeDescriptors = Object.getOwnPropertyDescriptors(_PaneScopeMixin.prototype);
delete (_paneScopeDescriptors as any).constructor;
export const paneScopeMethods = _paneScopeDescriptors;
