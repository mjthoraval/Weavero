// Module: links (outgoing references), the mirror of Backlinks (MJT
// 2026-10-27, "Ok for the proposed plan"; work/links-feature-plan): where
// an item LINKS OUT. The data is the backlinks index read the other way
// round (backlinks.ts `outBySource`): a paper's section lists the
// references written in its notes and in its attachments' annotations, one
// row each, in two lines -- the note or annotation that carries it, then
// the item it points at, each drawn as the Related section draws an item
// (2026-10-29). A count popup heads each source and shows the TARGET in its
// rows -- its icon, its paper's title, what the reference is ("Link",
// "Citation p. 7", "Quoted annotation p. 4") and where inside that paper it
// points ("→ PDF p. 5") -- over the source's words around it; the hover
// card shows both. A reference nothing resolves (its item gone, or its group
// library not in this profile) is listed greyed and never counted; it
// heals by itself when such an item lands.
//
// Everything here is DERIVED: links, citations and quotes are plain Zotero
// data; nothing is stored. The section registers through the descriptor
// helpers of backlinks.ts and shares its sheet, card, keys and menus.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvHtmlEl, wvPopupHost, winOf } from "../lib/dom";
import { wvMenuItem, wvMenuSeparator } from "../lib/menu";
import { wvItemsTreeEls, wvMainWins } from "../lib/windows";
import { wvLinkGlyphUri } from "../lib/link-glyph";
import { WvSectionDesc, WvLkRow, WvBlEnd, WV_BL_CARD_FOOT, wvBlBodyRegister, wvBlBodyForget, wvBlCardHide, wvBlCardHost, wvBlHtmlToText, wvBlAttOf, wvBlAnnText, wvBlTargetHl } from "./backlinks";

/** A note citation node and a quoted annotation node, as the note editor
 *  draws them (its node views set the class alone) or as a note's stored
 *  HTML holds them (the data attribute). */
const LK_CITATION_SEL = ".citation, [data-citation]";
const LK_QUOTE_SEL = ".highlight, .underline, [data-annotation]";

declare const Zotero: any;

export const WV_LK_PANE_ID = "weavero-links";
const LK_MENU_ID = "wv-links-menu";

/** The glyph: the links chain with the arrow pointing OUT of it
 *  (lib/link-glyph.ts), painted as the Backlinks one is per surface. */
export const WV_LK_ICON_CONTEXT = wvLinkGlyphUri("context-fill", 16, "out");
const LK_ICON_16_LIGHT = wvLinkGlyphUri("#5a5a5a", 16, "out");
const LK_ICON_16_DARK = wvLinkGlyphUri("#c8c8c8", 16, "out");
const LK_ICON_20_LIGHT = wvLinkGlyphUri("#5a5a5a", 20, "out");
const LK_ICON_20_DARK = wvLinkGlyphUri("#c8c8c8", 20, "out");

const LK_SECTION: WvSectionDesc = {
    paneID: WV_LK_PANE_ID,
    inst: "_wvLkPaneKey", glob: "_wvLkPaneKey", at: "_wvLkUnregisteredAt", timer: "_wvLkRegisterTimer",
    header: { l10nID: "weavero-links-header", icon: LK_ICON_16_LIGHT, darkIcon: LK_ICON_16_DARK },
    sidenav: { l10nID: "weavero-links-sidenav", icon: LK_ICON_20_LIGHT, darkIcon: LK_ICON_20_DARK },
    bodyXHTML: '<html:div class="wv-lk-body"></html:div>',
    hooks: { init: "_wvLkHookInit", destroy: "_wvLkHookDestroy", itemChange: "_wvLkHookItemChange", render: "_wvLkHookRender", asyncRender: "_wvLkHookAsyncRender" },
    enabled: (p) => { try { return !!p._getEnableLinks(); } catch (e) { return false; } },
};

const isAnn = (it: any) => !!(it && it.isAnnotation && it.isAnnotation());
const isNote = (it: any) => !!(it && it.isNote && it.isNote());

class _LinksMixin {
    _wvLkInit() { this._wvLkApplySectionPref(); }

    _wvLkDestroy() {
        const self: any = this;
        try { self._wvBlUnregisterSectionFor(LK_SECTION); } catch (e) {}
        self._wvLkCountCache = null;
        for (const w of wvMainWins()) {
            try { const m = w.document.getElementById(LK_MENU_ID); if (m) m.remove(); } catch (e) {}
        }
    }

    /** Register or unregister the section after the pref it follows. */
    _wvLkApplySectionPref() {
        const self: any = this;
        if (LK_SECTION.enabled(self)) self._wvBlRegisterSectionFor(LK_SECTION);
        else self._wvBlUnregisterSectionFor(LK_SECTION);
        // The reader cards' Links buttons follow the switch (2026-10-28).
        try { self._wvBlRefreshReaders(); } catch (e) {}
        // A Has Item Links chip follows the switch (dormant while it is
        // off): redraw the chip bar and re-apply, as Has Backlinks does.
        try {
            const g = self._filterState && self._filterState.groups;
            if (g && g.some((x: any) => x && x.hasItemLinks != null)) {
                self._renderFilterBar();
                self._applyItemsListFilter({ deliberate: true });
            }
        } catch (e) {}
    }

    // ---- the section's hooks (thin dispatchers to the live instance) -----

    _wvLkHookInit({ body, doc, refresh }: any) {
        const self: any = this;
        try {
            self._wvBlEnsureFtl(doc.defaultView);
            self._wvBlEnsureStyle(doc);
            wvBlBodyRegister(body, refresh);
        } catch (e) {}
    }

    _wvLkHookDestroy({ body }: any) {
        try { wvBlBodyForget(body); } catch (e) {}
    }

    _wvLkHookItemChange({ body, doc, item, setEnabled, setL10nArgs }: any) {
        const self: any = this;
        try {
            const ok = !!(item && (
                (item.isRegularItem && item.isRegularItem())
                || (item.isAttachment && item.isAttachment())
                || isNote(item) || isAnn(item)));
            setEnabled(ok);
            if (ok) this._wvLkHeader(body, doc, setL10nArgs, item, self._wvBlReady());
        } catch (e) { try { setEnabled(false); } catch (e2) {} }
    }

    // A render with no item leaves the section as it is (a section rebuilt
    // in a background tab has none until the tab is selected; backlinks.ts).
    _wvLkHookRender({ body, item, doc, setL10nArgs }: any) {
        const self: any = this;
        try {
            if (!item || !self._wvBlReady()) return;
            this._wvLkRenderBody(body, item, doc);
            this._wvLkHeader(body, doc, setL10nArgs, item);
        } catch (e) {}
    }

    async _wvLkHookAsyncRender({ body, item, doc, setL10nArgs }: any) {
        const self: any = this;
        try {
            if (!item) return;
            await self._wvBlEnsure();
            if (!body.isConnected) return;
            this._wvLkRenderBody(body, item, doc);
            this._wvLkHeader(body, doc, setL10nArgs, item);
        } catch (e) {}
    }

    /** The section's header for `item`, over the whole item: the resolved
     *  references in the title (MJT 2026-10-30, "Show the total number
     *  instead in the title"), the broken ones beside it ($broken); then the
     *  counts beside the title -- its own (a note's, an annotation's), its
     *  notes' and its annotations' links, the internal ones -- the window's
     *  filter on them (pane-scope.ts). The broken references keep the
     *  section open (not `empty`) when nothing resolves. Before the index is
     *  built: 0, and `empty` left alone. */
    _wvLkHeader(body: any, doc: any, setL10nArgs: any, item: any, ready = true) {
        const self: any = this;
        const c = ready ? self._wvLkSectionCounts(item) : null;
        const sec = body && body.closest ? body.closest("collapsible-section") : null;
        // The title counts the resolved links alone ("16 Links"); the broken
        // ones have their count at the end of the counts (MJT 2026-10-30,
        // "Can you put a broken link icon and make it a toggle at the end?").
        self._wvBlSetHeader(body, doc, setL10nArgs, c ? c.all : 0, c ? c.broken : null);
        // The counts by their icons (MJT 2026-10-29, "I would like to use
        // the icons as filter toggles"; 2026-10-30, the item's own first);
        // the links and Zotero's references by theirs; the internal links,
        // by theirs ("option 4 with an icon"); the broken links last.
        try {
            const f = c ? self._wvScopeFilterIn(sec, "links") : null;
            self._wvScopeSetCounts(self._wvScopeSectionTitle(body), c && self._wvScopeHasChildren(item) ? c.lv : null, "In",
                c ? { n: c.loops, of: c.all, what: "links" } : null, f ? { kind: "links", sec, f, item } : null,
                c ? { refs: c.refs, broken: c.broken } : null);
        } catch (e) {}
    }

    // ---- the hover card where the reference is written -----------------
    // (LK_CITATION_SEL / LK_QUOTE_SEL: the nodes as the editor draws them,
    // or as a note's stored HTML holds them.)
    // MJT 2026-11-03: "Hovering on a Zotero link in a note or an annotation,
    // or a Note Citation in a note should display a similar preview as in
    // the item pane" (intake: the note editors and the reader sidebar's
    // annotation comments). The card is the Item Links row's
    // (backlinks.ts _wvBlCardShow), opened on the node as drawn where the
    // text is read -- a zotero:// anchor or Weavero's own link span, a note
    // citation node, a quoted annotation node -- in the chrome window of
    // whatever frame holds it (blCardHost). The index row behind the node
    // gives the reference and its target: by address for a link (the k-th
    // of that address when a note writes it twice), by order for citations
    // and quotes (the index lists them in text order). The note editor's
    // hook is in note-editor.ts (its mousemove, after the rows' rest), the
    // sidebar's in reader.ts (_renderPreviewPanel, _wvBlCardHover).

    /** The nearest node a card can stand for, from an event target. The
     *  editor DRAWS a citation and a highlight through node views that set
     *  the class alone (note-editor node-views/citation.js, highlight.js;
     *  the `data-citation` / `data-annotation` attributes are the stored
     *  form, nodes.js toDOM), so the classes are what to match there. */
    _wvLkHoverNode(target: any): any {
        try {
            let t = target;
            if (t && t.nodeType === 3) t = t.parentNode;
            if (!t || !t.closest) return null;
            return t.closest('a[href^="zotero://"], [data-wv-href^="zotero://"], [data-href^="zotero://"], ' + LK_CITATION_SEL + ", " + LK_QUOTE_SEL);
        } catch (e) { return null; }
    }

    _wvLkHoverKind(node: any): "link" | "citation" | "quote" | null {
        try {
            if (!node || !node.matches) return null;
            if (node.matches(LK_CITATION_SEL)) return "citation";
            if (node.matches(LK_QUOTE_SEL)) return "quote";
            if (node.matches("a[href], [data-wv-href], [data-href]")) return "link";
        } catch (e) {}
        return null;
    }

    /** The index row behind `node` in `srcItem`'s text; `scope` is where
     *  that text is drawn (the editor's document, a comment's preview),
     *  the nodes counted in it. */
    _wvLkHoverRow(node: any, srcItem: any, scope?: any): WvLkRow | null {
        try {
            if (!node || !srcItem) return null;
            const rows: WvLkRow[] = (this as any)._wvLkOut(srcItem) || [];
            if (!rows.length) return null;
            const root = scope || node.ownerDocument;
            const kind = this._wvLkHoverKind(node);
            if (!kind) return null;
            const hrefOf = (n: any) => String(n.getAttribute("href") || n.getAttribute("data-wv-href") || n.getAttribute("data-href") || "").trim();
            if (kind === "link") {
                const href = hrefOf(node);
                if (!/^zotero:\/\//i.test(href)) return null;
                const same = Array.from(root.querySelectorAll("a[href], [data-wv-href], [data-href]")).filter((n: any) => hrefOf(n) === href);
                const k = Math.max(0, same.indexOf(node));
                const hits = rows.filter((r) => r.entry.ref === "link" && r.entry.url === href);
                return hits[k] || hits[0] || null;
            }
            const all = Array.from(root.querySelectorAll(kind === "citation" ? LK_CITATION_SEL : LK_QUOTE_SEL));
            const k = all.indexOf(node);
            const hits = rows.filter((r) => r.entry.ref === kind);
            return hits[k >= 0 ? k : 0] || null;
        } catch (e) { return null; }
    }

    /** The card for the reference `node` stands for; true when there is
     *  one. The node carries what the card reads, as a row does. */
    _wvLkHoverCardShow(node: any, srcItem: any, scope?: any): boolean {
        try {
            // The Item Links switch, wherever the card opens: every hook
            // calls through here, so a switch flipped after a node was wired
            // still holds (MJT 2026-11-03).
            if (!this._wvLkCardOn()) return false;
            const row = this._wvLkHoverRow(node, srcItem, scope);
            if (!row) return false;
            // The Item Links card, source on the left: a reference read where
            // it is written goes out from here. Only a Backlinks card is
            // mirrored (from dev.169 to 1.0.0-beta.4-dev.4 this opened that one).
            node._wvLkRow = row;
            (this as any)._wvLkCardShow(node);
            return true;
        } catch (e) { Zotero.debug("[Weavero] link hover card err: " + e); return false; }
    }

    /** The card hidden, wherever `node`'s frame opened it. */
    _wvLkHoverCardHide(node: any): boolean {
        try { return wvBlCardHide(wvBlCardHost(node).doc); } catch (e) { return false; }
    }

    // The items list (MJT 2026-11-03, "I also want the Zotero hover preview
    // in the items list"): a zotero:// address drawn as a Weavero span in
    // the tree -- an annotation's comment, a note annotation's text, a
    // note's first line (pane.ts _markCellLinks) -- gets the card, the row's
    // item its source. Zotero rebuilds a row's cells in place on every
    // render (itemTree.jsx renderItem: `div.innerHTML = ""`), so each new
    // span is wired as it is drawn, with the rows' rest and dismissal
    // (backlinks.ts _wvBlCardHover). Its address tooltip goes: the card says
    // more (the tree's restore skips it, pane.ts).

    /** The card for a tree span, its row's item the source; true when shown.
     *  The row's index is the DISPLAYED one (virtualized-table.jsx
     *  `-row-<index>`); `itemsView.getRow` reads the row provider, which a
     *  Weavero filter translates (itemTree.jsx getRow), in the span's own
     *  window. */
    _wvTreeLkCardShow(span: any): boolean {
        try {
            const row = span && span.closest && span.closest(".row");
            const m = row && /-row-(\d+)$/.exec(row.id || "");
            if (!m) return false;
            const win = span.ownerDocument.defaultView;
            const view = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            const r: any = view && view.getRow(parseInt(m[1], 10));
            const item = r && r.ref;
            if (!item || !(item.isAnnotation() || item.isNote())) return false;
            return this._wvLkHoverCardShow(span, item, span.closest(".cell") || row);
        } catch (e) { return false; }
    }

    /** Whether the card opens where a reference is written -- a note's
     *  editor, the reader sidebar, the items list: the Item Links section's
     *  switch, the card being its row's (MJT 2026-11-03, "users who don't
     *  like it can disable it"; until dev.172 only the items list asked). */
    _wvLkCardOn(): boolean {
        try { return !!(this as any)._getEnableLinks(); } catch (e) { return false; }
    }

    /** Wire the card on the tree's zotero:// spans not yet wired; idempotent
     *  (keyed listeners), run at the end of each cell-marking pass. */
    _wvTreeLkCardWire(doc: any) {
        try {
            if (!this._wvLkCardOn()) return;
            // Every library tab's tree (a Zotero with its own windows has one per tab).
            for (const tree of wvItemsTreeEls(doc)) {
                // No expando to skip a wired span: the keyed listeners are the
                // record, and a reloaded instance re-wires what an old one left.
                for (const span of tree.querySelectorAll(".row .wv-url-span.wv-link-zotero") as any) {
                    if (span.hasAttribute("title")) span.removeAttribute("title");
                    (this as any)._wvBlCardHover(span, "lkcard", (lp: any) => lp._wvTreeLkCardShow(span));
                }
            }
        } catch (e) { Zotero.debug("[Weavero] tree link card wire err: " + e); }
    }

    // ---- rows ------------------------------------------------------------

    /** The row's title line: the target's paper (a standalone note or
     *  attachment is its own), or why the reference is broken. */
    _wvLkRowHead(r: WvLkRow): string {
        const self: any = this;
        if (!r.target) return r.broken === "library" ? "Library not in this profile" : "Item not found";
        try {
            const owner = self._wvBlOwnerOf(r.target) || r.target;
            const t = isNote(owner) ? owner.getNoteTitle() : owner.getDisplayTitle();
            return t || "(untitled)";
        } catch (e) { return "(untitled)"; }
    }

    /** What the reference is, as the Backlinks rows say it
     *  (backlinks.ts _wvBlRowLabel). */
    _wvLkRowLabel(r: WvLkRow): string {
        return (this as any)._wvBlRowLabel(r.entry, r.target);
    }

    /** Where inside its paper the reference points ("→ PDF p. 5",
     *  "→ annotation p. 4", "→ note"); "" at the paper itself. */
    _wvLkChip(r: WvLkRow): string {
        const self: any = this;
        if (!r.target) return "";
        try { return self._wvBlChip(r.entry, r.target, self._wvBlOwnerOf(r.target) || r.target) || ""; } catch (e) { return ""; }
    }

    /** The section row's two lines (MJT 2026-10-29): the note or annotation
     *  the reference is written in, then the item it points at, each drawn
     *  as the Related section draws an item (backlinks.ts `_wvBlEnd`); a
     *  broken one's second line says why, by a plain box. */
    _wvLkPair(doc: any, r: WvLkRow, cont = false): { from: WvBlEnd; to: WvBlEnd; lead: "from"; cont: boolean; mark: "zotero" | "cite" } {
        const self: any = this;
        // The reference's kind, the row's arrow's colour (backlinks.ts blArrow).
        let mark: "zotero" | "cite" = "zotero";
        try { mark = self._wvBlRefKind(r.entry, r.target).mark; } catch (e) {}
        // The target's line, the other end: no file name (backlinks.ts
        // `_wvBlEnd`, MJT 2026-11-02 "Same for the target of links").
        const to: WvBlEnd = r.target ? self._wvBlEnd(doc, r.target, self._wvBlWhere(r.entry, r.target), false) : { icon: this._wvLkIcon(doc, r), main: this._wvLkRowHead(r) };
        // This item's end, the source, leads -- named once over its links
        // (`cont`, MJT 2026-10-29: "the logic for all sections is to show the
        // current item as first line").
        return { from: self._wvBlEnd(doc, r.src), to, lead: "from", cont, mark };
    }

    /** The target's own icon (an annotation in its colour, a note, an
     *  attachment, the item type); a plain box for a broken reference. */
    _wvLkIcon(doc: any, r: WvLkRow): any {
        const self: any = this;
        if (!r.target) return wvHtmlEl(doc, "span", "wv-bl-kind wv-lk-kind-broken");
        return self._wvBlIcon(doc, r.target);
    }

    /** Fill `body` with `item`'s outgoing references; returns the number
     *  resolved (the header's count). "section" (the item pane, the
     *  default) and "subtree": the item's notes and its attachments'
     *  annotations, notes first by title, then annotations in reading
     *  order, the rows in text order. "own": the item alone. In the section
     *  and the count popups alike (MJT 2026-11-02) each source heads its
     *  rows, as the Tags and Related sections head a part (backlinks.ts
     *  `_wvBlHeadGroup`; MJT 2026-10-30, "Option (b)"), each row its target's
     *  line with the arrow down to it, no annotated text, no excerpt (the
     *  card's). A broken reference is drawn greyed in place, not counted,
     *  shown or not by the header's broken count (hidden by default). A
     *  note's or an annotation's own section heads its rows "This item",
     *  each keeping its arrow (MJT 2026-11-03, "keep the "This item" header
     *  ... because the links color now add another information"; from
     *  2026-10-30 to dev.171 it named no source and drew no arrow). */
    _wvLkRenderBody(body: any, item: any, doc: any, scope: "section" | "own" | "subtree" = "section"): number {
        const self: any = this;
        try {
            let host: any = body.querySelector && body.querySelector(".wv-lk-body");
            if (!host) {
                host = body.classList && body.classList.contains("wv-lk-body") ? body : wvHtmlEl(doc, "div", "wv-lk-body", undefined, body);
            }
            wvBlCardHide(doc);
            while (host.firstChild) host.removeChild(host.firstChild);
            if (!item) return 0;
            // The section lists the links that pass the window's filter on
            // its header's counts, by where they are written -- the item
            // itself, its notes, its annotations (pane-scope.ts _wvScopePass;
            // MJT 2026-10-30, "just the same filtering as in the items list");
            // an item with nothing below it is not filtered by level. A
            // broken link -- never an internal one -- is a row as the others
            // are, shown as the broken count says.
            const f = scope === "section" ? self._wvScopeFilterIn(host, "links") : null;
            const lv = !!self._wvScopeHasChildren(item);
            const sources: any[] = self._wvLkSourcesUnder(item, scope === "own" ? "own" : "subtree");
            const levelOf = (src: any) => src.id === item.id ? "own" : self._wvScopeLevelOf(src);
            const passes = (src: any, r: WvLkRow) => self._wvScopePass(f, levelOf(src), !!(r.target && r.entry.internal), lv, !r.target, r.entry.ref);
            // A count popup draws as the section does (MJT 2026-11-02, "I
            // find the display of links from a click on count numbers in the
            // count columns is too complex to read. Keep the same format as
            // in the item pane"): the same source headings and rows. Until
            // dev.147 a popup drew its rows' long form (labels, chips,
            // excerpts).
            const compact = true;
            const cmp = (a: string, b: string) => { try { return Zotero.localeCompare(a, b); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; } };
            const titleOf = (it: any) => { try { return String(it.getNoteTitle() || ""); } catch (e) { return ""; } };
            sources.sort((a, b) => {
                const ra = isAnn(a) ? 1 : 0, rb = isAnn(b) ? 1 : 0;
                if (ra !== rb) return ra - rb;
                if (ra) return cmp(String(a.annotationSortIndex || ""), String(b.annotationSortIndex || "")) || a.id - b.id;
                return cmp(titleOf(a), titleOf(b)) || a.id - b.id;
            });
            const onKey = self._wvBlKeyHandler(host, doc);
            let n = 0;
            // The section's source headings are the Tags and Related
            // sections' (`_wvBlHeadGroup`); a note's or an annotation's own
            // reads "This item".
            const group = (parent: any, src: any, count: number) => {
                if (compact) {
                    const box = self._wvBlHeadGroup(doc, parent, src, item);
                    box._wvBlSetN(count);
                    return box;
                }
                const box = wvHtmlEl(doc, "div", "wv-bl-group", undefined, parent);
                const head = wvHtmlEl(doc, "div", "wv-bl-owner", undefined, box);
                head.appendChild(self._wvBlIcon(doc, src));
                let title = "";
                try { title = self._wvCountSourceLabel(src, item) || ""; } catch (e) { title = ""; }
                title = title || "(untitled)";
                wvHtmlEl(doc, "span", "wv-bl-title", title, head);
                const chip = self._wvCountHeadChip(doc, head, src, item);
                head.title = title + (chip ? " · " + chip : "");
                // Its share, as the Backlinks popup's part headings carry
                // theirs (2026-10-28).
                wvHtmlEl(doc, "span", "wv-lk-group-n", String(count), head);
                head.addEventListener("click", (ev: any) => {
                    ev.stopPropagation();
                    try { const p = self._wvBlOpenSource(src, null); if (p && typeof p.catch === "function") p.catch(() => {}); } catch (e) {}
                });
                head.addEventListener("contextmenu", (ev: any) => { ev.preventDefault(); ev.stopPropagation(); self._wvBlOpenMenu(ev, src, self._wvBlOwnerOf(src) || src, item); });
                return box;
            };
            const draw = (parent: any, r: WvLkRow) => {
                    const row = self._wvBlMakeRow(doc, parent, {
                        cls: "wv-lk-row wv-bl-ref-" + r.entry.ref + (r.target ? "" : " wv-lk-broken"),
                        ...(compact
                            ? { pair: this._wvLkPair(doc, r, true) }
                            : { icon: this._wvLkIcon(doc, r), head: this._wvLkRowHead(r), label: this._wvLkRowLabel(r), chip: this._wvLkChip(r) }),
                        // The annotation it is aimed at, its highlighted text
                        // (the chip's "→ annotation p. N"); popups only.
                        targetHl: r.target ? wvBlTargetHl(r.target, self._wvBlOwnerOf(r.target) || null) : null,
                        // A link inside its own item, counted and marked
                        // (MJT 2026-10-29, "Try option 2").
                        internal: r.target && r.entry.internal ? this._wvLkRowHead(r) : null,
                        annText: wvBlAnnText(r.src),
                        segs: r.entry.excerpt.segs,
                        compact,
                        open: (newWindow: boolean) => self._wvLkOpen(r, { newWindow, win: winOf(row) }),
                        menu: (ev: any) => self._wvLkOpenMenu(ev, r),
                        card: (el: any) => self._wvLkCardShow(el),
                        onKey,
                    });
                row._wvLkRow = r;
                row._wvBlItem = item;
                return row;
            };
            // Each source's rows in the text's order, a broken one in its
            // place (MJT 2026-10-30, "1a": the broken count a filter toggle;
            // until dev.120 they sat in one collapsed row at the end).
            for (const src of sources) {
                const shown = (self._wvLkOut(src) as WvLkRow[]).filter((r) => passes(src, r));
                if (!shown.length) continue;
                const box = group(host, src, shown.length);
                for (const r of shown) { draw(box, r); if (r.target) n++; }
            }
            return n;
        }
        catch (e) { Zotero.debug("[Weavero] links render err: " + e); return 0; }
    }

    /** A click follows the reference. A note target opens in a tab -- the
     *  note-tab invariant: ZoteroPane.openNote with openInWindow false, in
     *  the row's own main window -- or, with Shift or a middle click, in a
     *  note window; Better Notes' `zotero://note/` form goes through the
     *  link handler, which hands it to that plugin (its workspace, `?line=`).
     *  Any other link opens as written (page, annotation, wvpos); a
     *  citation selects the cited item; a quote opens the quoted
     *  annotation in its file; a broken reference shows where it is written. */
    async _wvLkOpen(r: WvLkRow, opts: { newWindow?: boolean; win?: any } = {}) {
        const self: any = this;
        try {
            if (!r) return;
            if (!r.target) { await self._wvBlOpenSource(r.src, r.entry, { newWindow: !!opts.newWindow }); return; }
            const t = r.target;
            if (r.entry.ref === "link" && /^zotero:\/\/note\//i.test(r.entry.url)) { await self.handleZoteroURI(r.entry.url); return; }
            if (isNote(t)) {
                const w = (opts.win && opts.win.ZoteroPane) ? opts.win : Zotero.getMainWindow();
                if (w && w.ZoteroPane && typeof w.ZoteroPane.openNote === "function") await w.ZoteroPane.openNote(t.id, { openInWindow: !!opts.newWindow });
                return;
            }
            if (opts.newWindow && await self._wvOpenItemInNewWindow(t)) return;
            if (r.entry.ref === "link") { await self.handleZoteroURI(r.entry.url); return; }
            if (r.entry.ref === "quote" || isAnn(t)) {
                const link = self._buildOpenLink(t);
                if (link) { await self.handleZoteroURI(link); return; }
            }
            self._wvBlOpenItem(t, "select");
        } catch (e) { Zotero.debug("[Weavero] links open err: " + e); }
    }

    /** The link to copy: a link as written (a broken one too); a citation's
     *  item as a select link; a quote's annotation as an open link. */
    _wvLkLinkOf(r: WvLkRow): string | null {
        const self: any = this;
        if (r.entry.ref === "link" || !r.target) return r.entry.url;
        try { return r.entry.ref === "quote" ? self._buildOpenLink(r.target) : self._buildSelectLink(r.target); } catch (e) { return null; }
    }

    /** The row menu: Show in Library (the target), Copy Link, Show in
     *  Source (the note scrolled to the reference, the annotation in its
     *  file), Add as Related -- the source's item and the target, Zotero's
     *  symmetric relation, never automatic. */
    _wvLkOpenMenu(ev: any, r: WvLkRow) {
        const self: any = this;
        try {
            const doc = ev.target.ownerDocument;
            const tag = self._wvWireTag();
            let menu: any = doc.getElementById(LK_MENU_ID);
            if (menu && menu.getAttribute("data-wv-tag") !== tag) { menu.remove(); menu = null; }
            if (!menu) {
                menu = doc.createXULElement("menupopup");
                menu.id = LK_MENU_ID;
                menu.setAttribute("data-wv-tag", tag);
                wvPopupHost(doc).appendChild(menu);
            }
            while (menu.firstChild) menu.removeChild(menu.firstChild);
            const t = r.target;
            wvMenuItem(doc, { label: "Show in Library", disabled: !t, onCommand: () => self._wvBlOpenItem(t, "select") }, menu);
            wvMenuItem(doc, {
                label: "Copy Link",
                onCommand: () => { const link = this._wvLkLinkOf(r); if (link) Zotero.Utilities.Internal.copyTextToClipboard(link); },
            }, menu);
            wvMenuItem(doc, {
                label: "Show in Source",
                onCommand: () => { try { const p = self._wvBlOpenSource(r.src, r.entry); if (p && typeof p.catch === "function") p.catch(() => {}); } catch (e) {} },
            }, menu);
            const owner = self._wvBlOwnerOf(r.src) || r.src;
            // Never an item and a part of itself (backlinks.ts _wvBlOpenMenu).
            const canRelate = !!(t && owner && owner.id !== t.id && owner.libraryID === t.libraryID && !isAnn(owner)
                && (self._wvBlOwnerOf(t) || t).id !== owner.id);
            wvMenuSeparator(doc, menu);
            wvMenuItem(doc, { label: "Add as Related", disabled: !canRelate, onCommand: () => self._wvBlAddRelated(owner, t) }, menu);
            menu.openPopupAtScreen(ev.screenX, ev.screenY, true);
        } catch (e) { Zotero.debug("[Weavero] links menu err: " + e); }
    }

    /** The hover card: the source's lineage and the reference on the left,
     *  the target's lineage on the right -- or, for a broken reference, the
     *  address as written and why (backlinks.ts _wvBlCardLineage). */
    _wvLkCardShow(row: any) {
        const self: any = this;
        const r: WvLkRow = row._wvLkRow;
        if (!r) return;
        self._wvBlCardOpen(row, (card: any, doc: any) => {
            self._wvBlCardLineage(card, doc, { srcItem: r.src, src: r.entry, target: r.target, broken: r.broken, url: r.entry.url });
            wvHtmlEl(doc, "div", "wv-bl-card-foot", WV_BL_CARD_FOOT, card);
        });
    }
}

const _linksDescriptors = Object.getOwnPropertyDescriptors(_LinksMixin.prototype);
delete (_linksDescriptors as any).constructor;
export const linksMethods = _linksDescriptors;
