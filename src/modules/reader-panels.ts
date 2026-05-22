// Module: reader-panels — reader-side filter + bookmarks affordances.
//
// Two features that bring library-pane conveniences into the PDF/EPUB reader:
//
//  A. Annotation filter — a funnel button in the reader's top toolbar (to the
//     right of the Find/search icon) that opens a popup mirroring the library
//     filter pane's design, scoped to the open document's annotations:
//     annotation type, colour, has-comment, and tags. Applying the filter
//     drives the reader's own annotation-manager (`setFilter({ hiddenIDs })`),
//     so matched-out annotations vanish from BOTH the sidebar list AND the
//     rendered page/EPUB view — which means the filter still works with the
//     left sidebar collapsed (the reason it lives in the toolbar, not the
//     sidebar strip). The native colour/tag strip is intentionally duplicated
//     here so all dimensions are reachable when the sidebar is hidden.
//
//  B. Bookmarks tab — (added incrementally) a Bookmarks tab beside Outline in
//     the reader sidebar for manually-created in-document location bookmarks.
//
// Both are injected into the reader's React-app document and re-applied on
// every sidebar scan via the hook in reader.ts `_processReaderSidebar`, so
// they self-heal against React re-renders (idempotent: inject only if absent).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

declare const Components: any;
declare const Services: any;

const RP_FILTER_BTN_CLASS = "wv-reader-filter-btn";
const RP_FILTER_POPUP_ID = "wv-reader-filter-popup";
const RP_STYLE_ID = "wv-reader-panels-style";
const NS_HTML_RP = "http://www.w3.org/1999/xhtml";

// Same funnel + related icons as the library filter.
const RP_FUNNEL_ICON = "chrome://zotero/skin/16/universal/filter.svg";
const RP_RELATED_ICON = "chrome://zotero/skin/16/universal/related.svg";

// Person glyph for Added By / Modified By chips — the same Font Awesome
// "user" icon the reader uses for annotation authors (IconUser). Inline so
// it renders inside the reader iframe (chrome:// images are blocked there).
const RP_USER_SVG =
    '<svg viewBox="0 0 448 512" aria-hidden="true">'
    + '<path fill="currentColor" d="M224 256c70.7 0 128-57.31 128-128s-57.3-128-128-128C153.3 0 96 57.31 96 128'
    + 'S153.3 256 224 256zM274.7 304H173.3C77.61 304 0 381.6 0 477.3c0 19.14 15.52 34.67 34.66 34.67h378.7'
    + 'C432.5 512 448 496.5 448 477.3C448 381.6 370.4 304 274.7 304z"/></svg>';

// Popup CSS. The contents use the EXACT library-filter classes
// (.wv-filter-section / .wv-filter-opt / .wv-chip-swatch / .wv-filter-svg /
// .wv-filter-or-inline / data-selected / data-excluded), copied verbatim from
// constants.ts so the reader filter is visually identical to the library one.
// They're scoped under #wv-reader-filter-popup so they can't leak into the
// reader's own UI. Only the popup-frame chrome is bespoke (the library uses a
// XUL <panel>; here it's an HTML div inside the reader iframe).
const RP_POPUP_CSS = [
    // ---- popup frame ----
    "#" + RP_FILTER_POPUP_ID + "{",
    "  position:absolute; z-index:2147483600; min-width:230px; max-width:360px;",
    "  background:Canvas; color:CanvasText;",
    "  border:1px solid rgba(127,127,127,.55); border-radius:5px;",
    "  box-shadow:0 6px 24px rgba(0,0,0,.30); padding:8px 10px;",
    "  font-size:12px; line-height:1.4; user-select:none;",
    "}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-stack{display:flex;flex-direction:column;gap:4px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-head{display:flex;align-items:center;gap:8px;margin:0 0 2px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-title{font-weight:600;flex:1;opacity:.85;}",
    // Clear / Clear-and-Close — copied verbatim from the library filter
    // (constants.ts .wv-filter-clear-btn / .wv-filter-clear-icon) so the
    // reader popup's actions look identical.
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-btn{margin-left:auto;font:inherit;font-size:11px;line-height:1;",
    "  color:inherit;cursor:pointer;padding:3px 8px;border-radius:10px;",
    "  border:1px solid rgba(127,127,127,0.4);background:rgba(127,127,127,0.10);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-btn:hover{background:rgba(127,127,127,0.22);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon{background:rgba(127,127,127,0.18);border:none;padding:0;",
    "  color:rgb(220,72,72);cursor:pointer;width:24px;height:24px;border-radius:50%;position:relative;",
    "  display:inline-block;font-size:0;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::before,",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::after{content:\"\";position:absolute;top:50%;left:50%;",
    "  width:12px;height:1.5px;background:currentColor;border-radius:1px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::before{transform:translate(-50%,-50%) rotate(45deg);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::after{transform:translate(-50%,-50%) rotate(-45deg);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon:hover{background:rgba(220,72,72,0.28);color:rgb(255,255,255);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-empty{opacity:.5;font-style:italic;}",
    // ---- library-filter classes (verbatim from constants.ts) ----
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-section{display:flex;flex-direction:row;align-items:center;gap:4px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-or-inline{display:flex;align-items:center;gap:3px;",
    "  background:rgba(127,127,127,0.18);border-radius:6px;padding:3px 6px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-section-title{display:none;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-options{flex:1 1 auto;display:flex;flex-wrap:wrap;gap:3px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt{display:inline-flex;align-items:center;gap:6px;",
    "  padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(127,127,127,0.4);",
    "  background:transparent;color:inherit;font:inherit;font-size:12px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt:hover{background:rgba(127,127,127,0.08);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-selected=\"true\"]{",
    "  background:rgba(94,106,210,0.34);border-color:rgba(94,106,210,0.95);",
    "  box-shadow:inset 0 0 0 1px rgba(94,106,210,0.55);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-selected=\"true\"]:hover{background:rgba(94,106,210,0.45);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-excluded=\"true\"]{",
    "  border-color:rgba(220,72,72,0.7);",
    "  background:linear-gradient(to top right,transparent calc(50% - 1px),",
    "    rgba(220,72,72,0.85) calc(50% - 1px),rgba(220,72,72,0.85) calc(50% + 1px),",
    "    transparent calc(50% + 1px)),rgba(220,72,72,0.10);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt-icon{padding:4px 6px;min-width:26px;justify-content:center;gap:0;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-svg{display:inline-block;width:16px;height:16px;",
    "  -moz-context-properties:fill,stroke,fill-opacity,stroke-opacity;fill:currentColor;stroke:currentColor;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-chip-swatch{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,0.15);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-vertical-separator{width:1px;align-self:stretch;background:rgba(127,127,127,0.45);margin:2px 4px;}",
    // OR-group card tint (same as the library's .wv-filter-or-group) for
    // the "pick any of these" rows (colour, tags, added/modified by).
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-or-group{background:rgba(127,127,127,0.18);border-radius:6px;padding:5px 6px;margin:1px 0;}",
    // Has Link inline SVG sizing inside a chip.
    "#" + RP_FILTER_POPUP_ID + " .wv-link-svg{width:16px;height:16px;display:inline-block;}",
    // Added By / Modified By person glyph.
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-user-svg{display:inline-flex;align-items:center;margin-right:5px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-user-svg svg{height:11px;width:auto;display:block;opacity:.8;}",
    // Group heading on its own line (separates Added By / Modified By without
    // eating chip width).
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-grouphead{font-size:10px;opacity:.55;text-transform:uppercase;",
    "  letter-spacing:.04em;margin:3px 2px 1px;}",
    // Faded chip — value not present in the current filtered view (Tag Selector
    // style). Still clickable.
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-inactive=\"true\"]{opacity:.35;}",
    // Bottom "Alt+Click to exclude" hint (same as library).
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-bottom-controls{display:flex;justify-content:center;align-items:center;margin-top:4px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-bottom-hint{font-size:10px;opacity:0.5;text-align:center;padding:4px 0 2px;}",
    // "Hide annotations in the reader" — checkbox row (bottom of the popup).
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-hideann{display:flex;align-items:center;gap:6px;margin-top:6px;",
    "  padding:4px 2px;font-size:12px;cursor:pointer;color:inherit;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-hideann input{cursor:pointer;margin:0;flex:0 0 auto;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-hideann:hover{opacity:.85;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt.wv-filter-tag-colored{font-weight:600;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt.wv-filter-tag-colored::before{content:\" \";display:inline-block;",
    "  width:8px;height:8px;margin-right:4px;border-radius:50%;background:var(--wv-tag-color,currentColor);",
    "  border:1px solid rgba(127,127,127,0.3);vertical-align:-1px;flex:0 0 auto;}",
    // ---- toolbar button ----
    "." + RP_FILTER_BTN_CLASS + " .wv-filter-svg{width:16px;height:16px;-moz-context-properties:fill,stroke;fill:currentColor;stroke:currentColor;}",
    "." + RP_FILTER_BTN_CLASS + ".wv-rf-active{position:relative;}",
    "." + RP_FILTER_BTN_CLASS + ".wv-rf-active::after{content:'';position:absolute;top:4px;right:4px;",
    "  width:6px;height:6px;border-radius:50%;background:var(--color-accent,#5e6ad2);}",
].join("");

// ---- Feature B: Bookmarks sidebar tab ----------------------------------
const RP_BM_TAB_CLASS = "wv-bm-reader-tab";
const RP_BM_VIEW_CLASS = "wv-bm-reader-view";
const RP_BM_TAB_ON = "wv-bm-tab-on";

// Outline-ribbon bookmark glyph (currentColor; themes with the toolbar).
const RP_BM_RIBBON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
const RP_PLUS_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7 7V2h2v5h5v2H9v5H7V9H2V7z"/></svg>';
// Quote glyph for selected-text bookmarks.
const RP_TEXT_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 4h7v1.4H3zM3 7.3h10v1.4H3zM3 10.6h7V12H3z"/></svg>';
// Pushpin glyph for position bookmarks — the 📌 emoji (user preference over a
// line map-pin). Used both as the list-row icon and the temporary in-document
// marker dropped on click.
const RP_PIN_EMOJI = "📌";
// Outline folder for bookmark folder rows; folder-with-plus for "New folder";
// chevrons for expand/collapse. All themed by currentColor.
const RP_FOLDER_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">'
    + '<path d="M1.5 4.5H6L7.3 6H14.5V13H1.5Z"/></svg>';
const RP_FOLDER_PLUS_SVG =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M18 11.5V6.5H8.5L7 5H2.5V15.5H10"/><path d="M14.5 12.5v5M12 15h5"/></svg>';
const RP_CHEV_RIGHT =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
const RP_CHEV_DOWN =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';

const RP_BM_CSS = [
    // When our tab is active, hide the React view wrappers and show ours.
    "#sidebarContainer." + RP_BM_TAB_ON + " #sidebarContent > .viewWrapper:not(." + RP_BM_VIEW_CLASS + "){display:none!important;}",
    "." + RP_BM_VIEW_CLASS + "{display:none;flex-direction:column;height:100%;min-height:0;overflow:hidden;}",
    "#sidebarContainer." + RP_BM_TAB_ON + " ." + RP_BM_VIEW_CLASS + "{display:flex!important;}",
    "." + RP_BM_TAB_CLASS + " svg{width:20px;height:20px;}",
    ".wv-bm-reader-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.2);}",
    ".wv-bm-reader-head .wv-bm-reader-htitle{flex:1;font-weight:600;opacity:.75;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}",
    ".wv-bm-reader-add{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;background:none;cursor:pointer;border-radius:4px;color:inherit;}",
    ".wv-bm-reader-add:hover{background:rgba(127,127,127,.16);}",
    ".wv-bm-reader-add svg{width:15px;height:15px;fill:currentColor;}",
    ".wv-bm-reader-list{flex:1 1 auto;overflow:auto;min-height:0;padding:4px;}",
    ".wv-bm-reader-row{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:13px;}",
    ".wv-bm-reader-row:hover{background:rgba(127,127,127,.14);}",
    ".wv-bm-reader-row .wv-bm-reader-ic{flex:0 0 auto;width:14px;height:14px;opacity:.85;}",
    ".wv-bm-reader-row .wv-bm-reader-ic svg{width:14px;height:14px;}",
    ".wv-bm-reader-row .wv-bm-reader-ic.wv-bm-emoji{display:flex;align-items:center;justify-content:center;font-size:12px;line-height:14px;opacity:1;}",
    ".wv-bm-reader-row .wv-bm-reader-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-bm-reader-row .wv-bm-reader-page{flex:0 0 auto;opacity:.5;font-size:11px;}",
    ".wv-bm-reader-row .wv-bm-reader-actions{display:none;gap:1px;flex:0 0 auto;}",
    ".wv-bm-reader-row:hover .wv-bm-reader-actions{display:flex;}",
    ".wv-bm-reader-actbtn{border:none;background:none;cursor:pointer;opacity:.55;padding:1px 4px;border-radius:3px;color:inherit;font-size:12px;line-height:1;}",
    ".wv-bm-reader-actbtn:hover{opacity:1;background:rgba(127,127,127,.2);}",
    ".wv-bm-reader-empty{opacity:.5;padding:14px 10px;font-size:12px;text-align:center;line-height:1.5;}",
    ".wv-bm-reader-grouphead{font-size:10px;opacity:.55;text-transform:uppercase;letter-spacing:.04em;padding:6px 8px 2px;}",
    "." + RP_BM_TAB_CLASS + ".wv-bm-dropok{outline:2px solid var(--color-accent,#5e6ad2);outline-offset:-2px;}",
    ".wv-bm-reader-row.wv-bm-dragging{opacity:.4;}",
    ".wv-bm-reader-row.wv-bm-drop-before{box-shadow:inset 0 2px 0 0 var(--color-accent,#5e6ad2);}",
    ".wv-bm-reader-row.wv-bm-drop-after{box-shadow:inset 0 -2px 0 0 var(--color-accent,#5e6ad2);}",
    // Group drop feedback: local accepts (accent ring), global rejects (faint).
    ".wv-bm-reader-group{border-radius:6px;}",
    ".wv-bm-reader-group.wv-bm-grp-dropok{box-shadow:inset 0 0 0 2px var(--color-accent,#5e6ad2);}",
    ".wv-bm-reader-group.wv-bm-grp-nodrop{opacity:.5;cursor:no-drop;}",
    // Folder rows: chevron + folder glyph; nested children indent via padding.
    ".wv-bm-reader-row .wv-bm-reader-chev{flex:0 0 auto;width:12px;height:12px;display:flex;align-items:center;justify-content:center;opacity:.6;}",
    ".wv-bm-reader-row .wv-bm-reader-chev svg{width:12px;height:12px;}",
    ".wv-bm-reader-row .wv-bm-reader-chev.wv-bm-reader-chev-spacer{visibility:hidden;}",
    ".wv-bm-reader-row.wv-bm-drop-into{box-shadow:inset 0 0 0 2px var(--color-accent,#5e6ad2);border-radius:4px;}",
].join("");

class _ReaderPanelsMixin {
    [k: string]: any;

    // ---- Entry: called from reader.ts _processReaderSidebar -----------------

    /** Idempotent per-scan processing for the reader React-app document.
     *  Re-applies button/tab injection (self-heals against React). */
    _wvProcessReaderPanels(idoc: any) {
        try {
            if (!idoc) return;
            const reader = this._findReaderForDoc(idoc);
            if (!reader) return;
            this._wvEnsureReaderPanelStyles(idoc);
            this._wvReaderPrefetchIcons();
            this._wvReaderEnsureFilterButton(reader, idoc);
            this._wvReaderEnsureBookmarksTab(reader, idoc);
        } catch (e) {
            Zotero.debug("[Weavero] _wvProcessReaderPanels err: " + e);
        }
    }

    /** The reader iframe blocks chrome:// resource loads (CSP), so its
     *  <img src="chrome://…"> icons come up blank. We fetch the SVG text in
     *  the privileged context (where chrome:// is reachable) and cache a
     *  data: URI, which the iframe DOES allow. Synchronous cache getter. */
    _wvReaderIconUri(chromeUrl: string) {
        return (this._wvReaderIconCache && this._wvReaderIconCache[chromeUrl]) || null;
    }

    _wvReaderPrefetchIcons() {
        if (this._wvReaderIconsReady || this._wvReaderIconsPrefetching) return;
        this._wvReaderIconsPrefetching = true;
        if (!this._wvReaderIconCache) this._wvReaderIconCache = {};
        const urls = [RP_FUNNEL_ICON, RP_RELATED_ICON];
        try { for (const t of this._ANNOTATION_TYPES) if (t && t.icon) urls.push(t.icon); } catch (_) {}
        Promise.all(urls.map(async (u: string) => {
            try {
                const txt = await fetch(u).then((r: any) => r.text());
                this._wvReaderIconCache[u] = "data:image/svg+xml," + encodeURIComponent(txt);
            } catch (_) {}
        })).then(() => {
            this._wvReaderIconsReady = true;
            this._wvReaderIconsPrefetching = false;
            // Refresh any already-rendered funnel buttons + open popups.
            try {
                for (const r of (Zotero.Reader._readers || [])) {
                    const iw = r._iframeWindow || (r._iframe && r._iframe.contentWindow);
                    const d = iw && iw.document;
                    if (!d) continue;
                    const f = d.querySelector("." + RP_FILTER_BTN_CLASS + " img");
                    const furi = this._wvReaderIconCache[RP_FUNNEL_ICON];
                    if (f && furi) f.setAttribute("src", furi);
                    const pop = d.getElementById(RP_FILTER_POPUP_ID);
                    if (pop) this._wvRenderReaderFilterPopup(r, d, pop);
                }
            } catch (_) {}
        }).catch(() => { this._wvReaderIconsPrefetching = false; });
    }

    _wvEnsureReaderPanelStyles(idoc: any) {
        const css = RP_POPUP_CSS + RP_BM_CSS;
        const existing = idoc.getElementById(RP_STYLE_ID);
        if (existing) {
            // A reader left open across a plugin update keeps its stale
            // <style> — refresh it if the CSS changed.
            if (existing.textContent !== css) existing.textContent = css;
            return;
        }
        const s = idoc.createElementNS(NS_HTML_RP, "style");
        s.id = RP_STYLE_ID;
        s.textContent = css;
        (idoc.head || idoc.documentElement).appendChild(s);
    }

    // ---- Per-reader filter state -------------------------------------------

    /** Per-reader filter state. Include/exclude mirror the library filter's
     *  click (include) / Alt+click (exclude) model. hasComment is tri-state:
     *  true (require) / false (require absent) / null (off). */
    _wvReaderFilterState(reader: any) {
        if (!this._wvReaderFilters) this._wvReaderFilters = new WeakMap();
        let st = this._wvReaderFilters.get(reader);
        if (!st) {
            st = {
                // Colour / tag / author INCLUDES live in the reader's own
                // annotation-filter (the native sidebar strip's channel), so
                // the strip and this popup share one source of truth and never
                // stack. Only EXCLUDES and the dimensions the native filter
                // lacks (type, has-comment, has-related, has-link, modified-by)
                // are stored here and applied via hiddenIDs. Author dims are
                // keyed by display name (what the native `authors` filter uses).
                types: [], typesExcl: [],
                colorsExcl: [],
                tagsExcl: [],
                addedByExcl: [],
                modifiedBy: [], modifiedByExcl: [],
                hasComment: null as (boolean | null),
                hasRelated: null as (boolean | null),
                hasLink: null as (boolean | null),
            };
            this._wvReaderFilters.set(reader, st);
        }
        return st;
    }

    /** The reader's own annotation filter includes ({colors,tags,authors})
     *  — the channel the native sidebar strip uses; our popup shares it. */
    _wvReaderNativeIncludes(reader: any) {
        const out = { colors: [] as string[], tags: [] as string[], authors: [] as string[] };
        try {
            const f = reader._internalReader && reader._internalReader._state
                && reader._internalReader._state.filter;
            if (f) {
                if (f.colors) out.colors = Array.from(f.colors as any);
                if (f.tags) out.tags = Array.from(f.tags as any);
                if (f.authors) out.authors = Array.from(f.authors as any);
            }
        } catch (_) {}
        return out;
    }

    _wvReaderFilterActive(reader: any) {
        const st = this._wvReaderFilterState(reader);
        const nat = this._wvReaderNativeIncludes(reader);
        return !!(nat.colors.length || nat.tags.length || nat.authors.length
            || st.types.length || st.typesExcl.length
            || st.colorsExcl.length || st.tagsExcl.length
            || st.addedByExcl.length || st.modifiedBy.length || st.modifiedByExcl.length
            || st.hasComment !== null || st.hasRelated !== null || st.hasLink !== null
            // "Hide Annotations in the Reader" counts as an active filter.
            || this._wvReaderAnnotationsHidden(reader));
    }

    /** The open document's annotation items (Zotero items, same compartment). */
    _wvReaderAnnotations(reader: any): any[] {
        try {
            const att: any = Zotero.Items.get(reader.itemID);
            if (!att || typeof att.getAnnotations !== "function") return [];
            return att.getAnnotations() || [];
        } catch (e) { return []; }
    }

    // ---- Feature A: toolbar filter button + popup --------------------------

    _wvReaderEnsureFilterButton(reader: any, idoc: any) {
        try {
            const find = idoc.querySelector(".toolbar-button.find");
            const end = (find && find.parentNode)
                || idoc.querySelector(".toolbar .end")
                || idoc.querySelector(".end");
            if (!end) return;
            let btn = idoc.querySelector("." + RP_FILTER_BTN_CLASS);
            if (!btn) {
                btn = idoc.createElementNS(NS_HTML_RP, "button");
                btn.className = "toolbar-button " + RP_FILTER_BTN_CLASS;
                btn.setAttribute("tabindex", "-1");
                btn.setAttribute("title", "Filter annotations");
                const fimg = idoc.createElementNS(NS_HTML_RP, "img");
                fimg.className = "wv-filter-svg";
                fimg.setAttribute("src", this._wvReaderIconUri(RP_FUNNEL_ICON) || RP_FUNNEL_ICON);
                btn.appendChild(fimg);
                btn.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                    this._wvToggleReaderFilterPopup(reader, idoc, btn);
                });
                // Right of the Find button when possible.
                if (find && find.nextSibling) end.insertBefore(btn, find.nextSibling);
                else end.appendChild(btn);
            }
            btn.classList.toggle("wv-rf-active", this._wvReaderFilterActive(reader));
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderEnsureFilterButton err: " + e);
        }
    }

    _wvToggleReaderFilterPopup(reader: any, idoc: any, anchorBtn: any) {
        if (idoc.getElementById(RP_FILTER_POPUP_ID)) {
            this._wvCloseReaderFilterPopup(idoc);
            return;
        }
        this._wvOpenReaderFilterPopup(reader, idoc, anchorBtn);
    }

    _wvCloseReaderFilterPopup(idoc: any) {
        try {
            const p = idoc.getElementById(RP_FILTER_POPUP_ID);
            if (p) p.remove();
        } catch (_) {}
        if (this._wvReaderFilterDismiss) {
            try {
                const { docs, wins, onDown, onKey } = this._wvReaderFilterDismiss;
                for (const d of (docs || [])) { try { d.removeEventListener("mousedown", onDown, true); } catch (_) {} }
                for (const w of (wins || [])) { try { w.removeEventListener("keydown", onKey, true); } catch (_) {} }
            } catch (_) {}
            this._wvReaderFilterDismiss = null;
        }
    }

    _wvOpenReaderFilterPopup(reader: any, idoc: any, anchorBtn: any) {
        try {
            this._wvEnsureReaderPanelStyles(idoc);
            const popup = idoc.createElementNS(NS_HTML_RP, "div");
            popup.id = RP_FILTER_POPUP_ID;
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            (idoc.body || idoc.documentElement).appendChild(popup);

            // Position under the anchor button, right-aligned to stay on-screen.
            const r = anchorBtn.getBoundingClientRect();
            const pw = popup.offsetWidth || 240;
            let left = r.left;
            const vw = (idoc.documentElement && idoc.documentElement.clientWidth) || 9999;
            if (left + pw > vw - 6) left = Math.max(6, vw - pw - 6);
            popup.style.left = left + "px";
            popup.style.top = (r.bottom + 4) + "px";

            // Dismiss on a click ANYWHERE else in the UI / Escape. The popup
            // lives in the reader-app iframe, so we listen across every
            // reachable document: the reader app doc, the chrome window
            // (item pane, tabs, collections), and the inner content iframes
            // (PDF.js / EPUB page) — events don't cross iframe boundaries,
            // so one listener per document is needed.
            const onDown = (e: any) => {
                try {
                    const t = e.target;
                    if (t && popup.contains && popup.contains(t)) return;
                    if (anchorBtn && (anchorBtn === t || (anchorBtn.contains && anchorBtn.contains(t)))) return;
                    this._wvCloseReaderFilterPopup(idoc);
                } catch (_) {}
            };
            const onKey = (e: any) => {
                if (e.key === "Escape") { e.preventDefault(); this._wvCloseReaderFilterPopup(idoc); }
            };
            const docs: any[] = [idoc];
            const wins: any[] = [];
            try { const w = idoc.defaultView; if (w) wins.push(w); } catch (_) {}
            try {
                const top = idoc.defaultView && idoc.defaultView.top;
                if (top && top.document && docs.indexOf(top.document) < 0) { docs.push(top.document); wins.push(top); }
            } catch (_) {}
            // Nested content iframes (PDF.js / EPUB page) — walk 2 levels so
            // a click on the page itself also dismisses.
            const collectFrames = (doc2: any, depth: number) => {
                if (!doc2 || depth > 2) return;
                try {
                    for (const f of doc2.querySelectorAll("iframe")) {
                        try {
                            const d = f.contentDocument;
                            if (d && docs.indexOf(d) < 0) { docs.push(d); collectFrames(d, depth + 1); }
                        } catch (_) {}
                    }
                } catch (_) {}
            };
            collectFrames(idoc, 1);
            // Also the primary view's own iframe doc (robust for PDF.js).
            try {
                const ir = reader._internalReader;
                const v = ir && (ir._primaryView || ir._lastView);
                const vd = v && v._iframeWindow && v._iframeWindow.document;
                if (vd && docs.indexOf(vd) < 0) docs.push(vd);
            } catch (_) {}
            for (const d of docs) { try { d.addEventListener("mousedown", onDown, true); } catch (_) {} }
            for (const w of wins) { try { w.addEventListener("keydown", onKey, true); } catch (_) {} }
            this._wvReaderFilterDismiss = { docs, wins, onDown, onKey };
        } catch (e) {
            Zotero.debug("[Weavero] _wvOpenReaderFilterPopup err: " + e);
        }
    }

    /** (Re)build the popup body using the EXACT library-filter markup so the
     *  reader filter is visually identical: hidden section titles, icon-only
     *  `.wv-filter-opt` chips with `data-selected`/`data-excluded`, type icons
     *  wrapped in a `.wv-filter-or-inline` pill, colour swatches, the Has
     *  Comment speech-bubble tile, and tag chips. Click = include, Alt+click
     *  = exclude (mirrors `_toggleIncludeExclude`). */
    _wvRenderReaderFilterPopup(reader: any, idoc: any, popup: any) {
        while (popup.firstChild) popup.firstChild.remove();
        try { popup.style.colorScheme = (this._bmIsDark && this._bmIsDark(idoc.defaultView)) ? "dark" : "light"; } catch (_) {}
        const st = this._wvReaderFilterState(reader);
        const anns = this._wvReaderAnnotations(reader);

        // What's present in this document.
        const typesPresent = new Set<string>();
        const colorsPresent = new Set<string>();
        const tagColors: { [k: string]: string } = {};
        const tagsPresent = new Set<string>();
        const addedByNames = new Set<string>();    // by display name (== native authorName)
        const modifiedByNames = new Set<string>();
        let anyComment = false;
        for (const a of anns) {
            try {
                if (a.annotationType) typesPresent.add(a.annotationType);
                if (a.annotationColor) colorsPresent.add(a.annotationColor);
                if (a.annotationComment) anyComment = true;
                for (const t of (a.getTags() || [])) if (t && t.tag) tagsPresent.add(t.tag);
                if (a.createdByUserID != null) addedByNames.add(this._wvUserName(a.createdByUserID));
                if (a.lastModifiedByUserID != null) modifiedByNames.add(this._wvUserName(a.lastModifiedByUserID));
            } catch (_) {}
        }
        const nat = this._wvReaderNativeIncludes(reader);

        // Values present in the CURRENTLY-VISIBLE (filtered) annotation set —
        // chips whose value isn't here get faded (like Zotero's Tag Selector).
        const visible = anns.filter((a: any) =>
            this._wvReaderPluginMatch(st, a) && this._wvReaderNativeMatch(a, nat));
        const actColors = new Set<string>();
        const actTags = new Set<string>();
        const actTypes = new Set<string>();
        const actAddedBy = new Set<string>();
        const actModifiedBy = new Set<string>();
        for (const a of visible) {
            if (a.annotationColor) actColors.add(a.annotationColor);
            if (a.annotationType) actTypes.add(a.annotationType);
            for (const t of (a.getTags() || [])) if (t && t.tag) actTags.add(t.tag);
            if (a.createdByUserID != null) actAddedBy.add(this._wvUserName(a.createdByUserID));
            if (a.lastModifiedByUserID != null) actModifiedBy.add(this._wvUserName(a.lastModifiedByUserID));
        }
        // Added By / Modified By are group-library-only (createdByUserID is
        // never set in My Library).
        let isGroupLib = false;
        try {
            const libID = (Zotero.Items.get(reader.itemID) || {}).libraryID;
            const lib: any = Zotero.Libraries.get(libID);
            isGroupLib = !!(lib && lib.libraryType === "group");
        } catch (_) {}
        // Tag colours (for the coloured dot), from the library's colour map.
        try {
            const libID = (this.libraryIDFromReader && this.libraryIDFromReader(reader))
                || (Zotero.Items.get(reader.itemID) || {}).libraryID;
            const cols = Zotero.Tags.getColors ? Zotero.Tags.getColors(libID) : null;
            if (cols && cols.forEach) cols.forEach((v: any, k: string) => { if (v && v.color) tagColors[k] = v.color; });
        } catch (_) {}

        const NS = NS_HTML_RP;
        const mk = (tag: string, cls?: string) => {
            const el = idoc.createElementNS(NS, tag);
            if (cls) el.className = cls;
            return el;
        };
        const stack = mk("div", "wv-rf-stack");
        popup.appendChild(stack);

        // Header + Clear / Clear-and-Close (mirrors the library filter).
        const head = mk("div", "wv-rf-head");
        const title = mk("div", "wv-rf-title");
        title.textContent = "Filter annotations";
        head.appendChild(title);
        const clearState = () => {
            st.types = []; st.typesExcl = []; st.colorsExcl = []; st.tagsExcl = [];
            st.addedByExcl = []; st.modifiedBy = []; st.modifiedByExcl = [];
            st.hasComment = null; st.hasRelated = null; st.hasLink = null;
            // The hide-annotations toggle counts as a filter — clear it too.
            if (this._wvReaderAnnotationsHidden(reader)) this._wvReaderApplyHideAnnotations(reader, false);
            // Also clear the native include channel (colour/tag/author).
            this._wvApplyReaderFilter(reader, { colors: [], tags: [], authors: [] });
        };
        // "Clear" — clears every filter but keeps the popup open.
        const clearBtn = mk("button", "wv-filter-clear-btn");
        clearBtn.type = "button";
        clearBtn.textContent = "Clear";
        clearBtn.title = "Clear all filters (keep this window open)";
        clearBtn.setAttribute("aria-label", "Clear all filters");
        clearBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            clearState();
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            this._wvReaderEnsureFilterButton(reader, idoc);
        });
        // Red × — "Clear and Close": clears every filter AND dismisses.
        const clearCloseBtn = mk("button", "wv-filter-clear-icon");
        clearCloseBtn.type = "button";
        clearCloseBtn.title = "Clear and Close";
        clearCloseBtn.setAttribute("aria-label", "Clear and Close");
        clearCloseBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            clearState();
            this._wvReaderEnsureFilterButton(reader, idoc);
            this._wvCloseReaderFilterPopup(idoc);
        });
        // Both are only meaningful when something is set — hide otherwise
        // (same visibility rule as the library popup's renderHeader).
        const anyActive = this._wvReaderFilterActive(reader);
        clearBtn.style.visibility = anyActive ? "" : "hidden";
        clearCloseBtn.style.visibility = anyActive ? "" : "hidden";
        head.appendChild(clearBtn);
        head.appendChild(clearCloseBtn);
        stack.appendChild(head);

        if (!anns.length) {
            const empty = mk("div", "wv-rf-empty");
            empty.textContent = "No annotations in this document.";
            stack.appendChild(empty);
            return;
        }

        // An icon-only `.wv-filter-opt` chip with include/exclude state.
        const mkOpt = (incl: string[], excl: string[], value: string, title2: string,
                       fillIcon: (b: any) => void, onChange: (next: any) => void, active?: Set<string>) => {
            const btn = mk("button", "wv-filter-opt wv-filter-opt-icon");
            btn.type = "button";
            btn.title = title2;
            const sel = incl.indexOf(value) >= 0, exc = excl.indexOf(value) >= 0;
            if (sel) btn.dataset.selected = "true";
            if (exc) btn.dataset.excluded = "true";
            if (active && !sel && !exc && !active.has(value)) btn.dataset.inactive = "true";
            fillIcon(btn);
            btn.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(value, incl.slice(), excl.slice(), e.altKey);
                onChange.call(null, next);
                this._wvApplyReaderFilter(reader);
                this._wvRenderReaderFilterPopup(reader, idoc, popup);
                this._wvReaderEnsureFilterButton(reader, idoc);
            });
            return btn;
        };
        const addRow = (build: (opts: any) => void, groupBg?: boolean, label?: string) => {
            const sec = mk("div", "wv-filter-section" + (groupBg ? " wv-filter-or-group" : ""));
            const t = mk("div", "wv-filter-section-title"); sec.appendChild(t);
            // Optional visible label — used to separate the otherwise-identical
            // Added By / Modified By person rows.
            if (label) { const lb = mk("span", "wv-rf-grouplabel"); lb.textContent = label; sec.appendChild(lb); }
            const opts = mk("div", "wv-filter-options");
            build(opts);
            if (opts.childNodes.length) { sec.appendChild(opts); stack.appendChild(sec); }
        };
        // A small heading on its OWN line (full-width chips below it) — used to
        // label the Added By / Modified By rows without eating chip width.
        const addHead = (text: string) => {
            const h = mk("div", "wv-rf-grouphead");
            h.textContent = text;
            stack.appendChild(h);
        };
        // Chip whose INCLUDE lives in the reader's native filter channel
        // (colour/tag/author) and whose EXCLUDE lives in plugin state. dimKey
        // ∈ "colors"|"tags"|"authors". inclArr = native include snapshot;
        // exclArr = the st.*Excl array (mutated in place).
        const mkNativeOpt = (dimKey: string, inclArr: string[], exclArr: string[],
                             value: string, title2: string, fillIcon: (b: any) => void, active?: Set<string>) => {
            const btn = mk("button", "wv-filter-opt wv-filter-opt-icon");
            btn.type = "button";
            btn.title = title2;
            const sel = inclArr.indexOf(value) >= 0, exc = exclArr.indexOf(value) >= 0;
            if (sel) btn.dataset.selected = "true";
            if (exc) btn.dataset.excluded = "true";
            if (active && !sel && !exc && !active.has(value)) btn.dataset.inactive = "true";
            fillIcon(btn);
            btn.addEventListener("click", (e: any) => {
                e.stopPropagation();
                // Read the LIVE native include at click time so a sidebar-strip
                // change to the same dimension (while the popup is open) isn't
                // clobbered by a stale render-time snapshot.
                const live = (this._wvReaderNativeIncludes(reader) as any)[dimKey] || [];
                const next = this._toggleIncludeExclude(value, live.slice(), exclArr.slice(), e.altKey);
                exclArr.length = 0; for (const v of next.exclude) exclArr.push(v);
                const inc: any = {}; inc[dimKey] = next.include;
                this._wvApplyReaderFilter(reader, inc);
                this._wvRenderReaderFilterPopup(reader, idoc, popup);
                this._wvReaderEnsureFilterButton(reader, idoc);
            });
            return btn;
        };
        // Tri-state icon tile (Has Related / Has Link / Has Comment):
        // click=require / Alt+click=require-absent / re-click=off.
        const mkTriTile = (cur: any, title2: string, iconBuilder: () => any, apply: (alt: boolean) => void) => {
            const btn = mk("button", "wv-filter-opt wv-filter-opt-icon");
            btn.type = "button";
            btn.title = title2;
            if (cur === true) btn.dataset.selected = "true";
            else if (cur === false) btn.dataset.excluded = "true";
            try { const ic = iconBuilder(); if (ic) btn.appendChild(ic); } catch (_) {}
            btn.addEventListener("click", (e: any) => {
                e.stopPropagation();
                apply(!!e.altKey);
                this._wvApplyReaderFilter(reader);
                this._wvRenderReaderFilterPopup(reader, idoc, popup);
                this._wvReaderEnsureFilterButton(reader, idoc);
            });
            return btn;
        };

        // Order (annotation-first per user request): Colour → Type+Has-Comment
        // → Cross-level (Has Related, Has Link) → Tags → Added By → Modified By.

        // ---- Annotation Colour (swatches) — include via native channel.
        addRow((opts: any) => {
            for (const def of this._ANNOTATION_COLORS) {
                if (!colorsPresent.has(def.value)) continue;
                // Black is the ink/text-only "extra" colour — push it to the
                // right edge after a separator, same as the library filter.
                if (def.value === "#000000") {
                    const sep = mk("div", "wv-filter-vertical-separator");
                    sep.style.marginLeft = "auto";
                    opts.appendChild(sep);
                }
                opts.appendChild(mkNativeOpt("colors", nat.colors, st.colorsExcl, def.value,
                    def.label + " — Alt+click to exclude",
                    (b: any) => { const sw = mk("span", "wv-chip-swatch"); sw.style.background = def.value; b.appendChild(sw); },
                    actColors));
            }
        }, true);

        // ---- Annotation Type (icons in an OR-inline pill) + Has Comment.
        addRow((opts: any) => {
            const grp = mk("div", "wv-filter-or-inline");
            let any = false;
            for (const def of this._ANNOTATION_TYPES) {
                if (!typesPresent.has(def.value)) continue;
                any = true;
                const btn = mkOpt(st.types, st.typesExcl, def.value,
                    def.label + " — Alt+click to exclude",
                    (b: any) => { const img = mk("img"); img.className = "wv-filter-svg"; img.src = this._wvReaderIconUri(def.icon) || def.icon; b.appendChild(img); },
                    (next: any) => { st.types = next.include; st.typesExcl = next.exclude; },
                    actTypes);
                grp.appendChild(btn);
            }
            if (any) opts.appendChild(grp);
            if (anyComment) {
                const sep = mk("div", "wv-filter-vertical-separator");
                sep.style.marginLeft = "auto";
                opts.appendChild(sep);
                opts.appendChild(this._wvMakeReaderHasCommentTile(reader, idoc, popup, st));
            }
        });

        // ---- Cross-level: Has Related, Has Link (single-level here → no
        //      per-kind scope arrow). AND filters, so no OR-group tint.
        addRow((opts: any) => {
            opts.appendChild(mkTriTile(st.hasRelated,
                "Has Related — annotations with at least one related-item link. Alt+click to exclude.",
                () => { const img = mk("img"); img.className = "wv-filter-svg"; img.src = this._wvReaderIconUri(RP_RELATED_ICON) || RP_RELATED_ICON; img.style.color = "var(--accent-wood)"; return img; },
                (alt: boolean) => { st.hasRelated = alt ? (st.hasRelated === false ? null : false) : (st.hasRelated === true ? null : true); }));
            opts.appendChild(mkTriTile(st.hasLink,
                "Has Link — annotations whose comment contains a URL. Alt+click to exclude.",
                () => this._makeLinkSvg(idoc),
                (alt: boolean) => { st.hasLink = alt ? (st.hasLink === false ? null : false) : (st.hasLink === true ? null : true); }));
        });

        // ---- Tags (coloured dot when the tag has a colour) — include via native.
        if (tagsPresent.size) {
            const tags = Array.from(tagsPresent).sort((a, b) => a.localeCompare(b));
            addRow((opts: any) => {
                for (const tg of tags) {
                    const col = tagColors[tg];
                    opts.appendChild(mkNativeOpt("tags", nat.tags, st.tagsExcl, tg,
                        "Tag: " + tg + " — Alt+click to exclude",
                        (b: any) => {
                            if (col) { b.classList.add("wv-filter-tag-colored"); b.style.setProperty("--wv-tag-color", col); }
                            const sp = mk("span"); sp.textContent = tg; b.appendChild(sp);
                        },
                        actTags));
                }
            }, true);
        }

        // ---- Added By (group libraries only) — include via native authors.
        //      Heading on its own line (chips full-width below) so the label
        //      doesn't eat chip space, and to separate it from Modified By.
        if (isGroupLib && addedByNames.size) {
            const names = Array.from(addedByNames).sort((a, b) => a.localeCompare(b));
            addHead("Added by");
            addRow((opts: any) => {
                for (const name of names) {
                    opts.appendChild(mkNativeOpt("authors", nat.authors, st.addedByExcl, name,
                        "Added by " + name + " — Alt+click to exclude",
                        (b: any) => { const ic = mk("span", "wv-rf-user-svg"); ic.innerHTML = RP_USER_SVG; b.appendChild(ic); const sp = mk("span"); sp.textContent = name; b.appendChild(sp); },
                        actAddedBy));
                }
            }, true);
        }
        // ---- Modified By (group libraries only) — plugin-only (no native dim).
        if (isGroupLib && modifiedByNames.size) {
            const names = Array.from(modifiedByNames).sort((a, b) => a.localeCompare(b));
            addHead("Modified by");
            addRow((opts: any) => {
                for (const name of names) {
                    opts.appendChild(mkOpt(st.modifiedBy, st.modifiedByExcl, name,
                        "Modified by " + name + " — Alt+click to exclude",
                        (b: any) => { const ic = mk("span", "wv-rf-user-svg"); ic.innerHTML = RP_USER_SVG; b.appendChild(ic); const sp = mk("span"); sp.textContent = name; b.appendChild(sp); },
                        (next: any) => { st.modifiedBy = next.include; st.modifiedByExcl = next.exclude; },
                        actModifiedBy));
                }
            }, true);
        }

        // ---- Bottom hint (same as the library filter).
        const bottom = mk("div", "wv-filter-bottom-controls");
        const hint = mk("span", "wv-filter-bottom-hint");
        hint.textContent = "Alt+Click to exclude";
        bottom.appendChild(hint);
        stack.appendChild(bottom);

        // ---- "Hide annotations in the reader" — checkbox with a fixed label
        // (mirrors the library filter's bottom display toggles). Checked =
        // hidden in the document view; the sidebar list is unaffected.
        const hidden = this._wvReaderAnnotationsHidden(reader);
        const hideRow = mk("label", "wv-rf-hideann");
        hideRow.title = "Hide the annotation marks in the document view (the sidebar list is unaffected).";
        const hideCb: any = mk("input");
        hideCb.type = "checkbox";
        hideCb.checked = hidden;
        const hideLbl = mk("span");
        hideLbl.textContent = "Hide Annotations in the Reader";
        hideRow.appendChild(hideCb);
        hideRow.appendChild(hideLbl);
        hideCb.addEventListener("change", (e: any) => {
            e.stopPropagation();
            this._wvReaderApplyHideAnnotations(reader, !!hideCb.checked);
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            this._wvReaderEnsureFilterButton(reader, idoc);   // refresh the funnel dot
        });
        stack.appendChild(hideRow);
    }

    _wvReaderAnnotationsHidden(reader: any) {
        if (!this._wvReaderHideAnnWM) this._wvReaderHideAnnWM = new WeakMap();
        return !!this._wvReaderHideAnnWM.get(reader);
    }

    /** Show/hide annotation marks in the reader's document view(s).
     *
     *  Two paths, chosen by view type (NOT by Zotero version):
     *   - EPUB / snapshot (DOM views) implement `setShowAnnotations`, so the
     *     reader's native `showAnnotations()` works — one clean call.
     *   - PDF does NOT: `setShowAnnotations` is defined only on the DOM view
     *     (`reader/src/dom/common/dom-view.tsx`), never on the PDF view, in
     *     every Zotero version (checked against latest reader source). And PDF
     *     highlights/underlines/ink are painted on the page CANVAS, not a
     *     hideable DOM layer. So for PDF we re-render the views without
     *     annotations via `setAnnotations([])` (hide) / re-apply the filter
     *     (show). This PDF fallback is permanent, not a version stopgap.
     *
     *  The sidebar list (driven by `_state.annotations`) is untouched either
     *  way. We feature-detect `pv.setShowAnnotations` so each view type takes
     *  the right path automatically. */
    _wvReaderApplyHideAnnotations(reader: any, hide: boolean) {
        try {
            if (!this._wvReaderHideAnnWM) this._wvReaderHideAnnWM = new WeakMap();
            this._wvReaderHideAnnWM.set(reader, !!hide);
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            // Weavero's OWN DOM overlays (note/link/relation badges,
            // text-annotation controls) and the PDF text-annotation layer are
            // NOT part of Zotero's annotation rendering, so neither
            // showAnnotations nor setAnnotations([]) removes them — hide those
            // via CSS in each view's inner doc, both paths.
            this._wvReaderSetOverlayHideCss(reader, hide);
            // Native path — only EPUB/snapshot views support it (see above).
            if (pv && typeof pv.setShowAnnotations === "function" && typeof ir.showAnnotations === "function") {
                try { ir.showAnnotations(!hide); return; } catch (_) {}
            }
            // PDF (and any view lacking setShowAnnotations): the annotation
            // manager re-renders the view from the filter, so a one-shot clear
            // loses the race. Instead BLOCK the view's setAnnotations (always
            // render []) while hidden — the filter then updates only the
            // sidebar (driven by _state.annotations). On show, unblock and
            // re-render the real (filtered) set.
            if (hide) this._wvReaderSetViewAnnotationsBlocked(reader, true);
            else { this._wvReaderSetViewAnnotationsBlocked(reader, false); try { this._wvApplyReaderFilter(reader); } catch (_) {} }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderApplyHideAnnotations err: " + e);
        }
    }

    /** Inject/remove a CSS rule in each view's inner doc that hides the DOM
     *  overlays Zotero's annotation hiding doesn't touch: the PDF
     *  `.customAnnotationLayer` (text-annotation textareas + Weavero badges),
     *  Weavero's `.wv-marker-badge` / `.wv-text-annotation-btn`, and the EPUB
     *  `.annotation-container`. Doubled-class selectors out-specify Weavero's
     *  own anti-flash rule (`.page > .customAnnotationLayer{display:block!important}`). */
    _wvReaderSetOverlayHideCss(reader: any, hide: boolean) {
        try {
            const ir = reader._internalReader;
            for (const v of [ir && ir._primaryView, ir && ir._secondaryView, ir && ir._lastView]) {
                try {
                    const d = v && v._iframeWindow && v._iframeWindow.document;
                    if (!d) continue;
                    let st = d.getElementById("wv-hide-annotations");
                    if (hide) {
                        if (!st) { st = d.createElement("style"); st.id = "wv-hide-annotations"; (d.head || d.documentElement).appendChild(st); }
                        st.textContent =
                            ".page > .customAnnotationLayer.customAnnotationLayer,"
                            + ".page.loading > .customAnnotationLayer.customAnnotationLayer,"
                            + ".page.loadingIcon > .customAnnotationLayer.customAnnotationLayer,"
                            + ".customAnnotationLayer.customAnnotationLayer{display:none !important;}"
                            + ".wv-marker-badge.wv-marker-badge,.wv-text-annotation-btn.wv-text-annotation-btn{display:none !important;}"
                            + ".annotation-container.annotation-container{display:none !important;}";
                    } else if (st) { st.remove(); }
                } catch (_) {}
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderSetOverlayHideCss err: " + e);
        }
    }

    /** Block/unblock the rendered annotations in every view. While blocked, the
     *  view's `setAnnotations` always renders [] (so the annotation manager's
     *  filter re-renders can't bring annotations back into the view) — the
     *  sidebar (driven by `_state.annotations`) is unaffected. Unblocking
     *  restores the original method. */
    _wvReaderSetViewAnnotationsBlocked(reader: any, block: boolean) {
        try {
            const ir = reader._internalReader;
            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            const mkEmpty = () => { try { return (iwin && Components && Components.utils) ? Components.utils.cloneInto([], iwin) : []; } catch (_) { return []; } };
            for (const v of [ir && ir._primaryView, ir && ir._secondaryView, ir && ir._lastView]) {
                if (!v || typeof v.setAnnotations !== "function") continue;
                if (block) {
                    if (!v._wvOrigSetAnnotations) {
                        v._wvOrigSetAnnotations = v.setAnnotations;
                        v.setAnnotations = function () { try { v._wvOrigSetAnnotations.call(v, mkEmpty()); } catch (_) {} };
                    }
                    try { v.setAnnotations(); } catch (_) {}   // clear now
                } else if (v._wvOrigSetAnnotations) {
                    v.setAnnotations = v._wvOrigSetAnnotations;
                    v._wvOrigSetAnnotations = null;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderSetViewAnnotationsBlocked err: " + e);
        }
    }

    /** Display name for a group-library user ID. */
    _wvUserName(uid: any) {
        try {
            const n = Zotero.Users && Zotero.Users.getName && Zotero.Users.getName(uid);
            if (n) return n;
        } catch (_) {}
        return "User " + uid;
    }

    /** Has Comment tile mirroring the library's: speech-bubble glyph,
     *  click=require / Alt+click=require-absent / re-click=off. */
    _wvMakeReaderHasCommentTile(reader: any, idoc: any, popup: any, st: any) {
        const btn = idoc.createElementNS(NS_HTML_RP, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        if (st.hasComment === true) btn.dataset.selected = "true";
        else if (st.hasComment === false) btn.dataset.excluded = "true";
        btn.title = "Has Comment — annotations with non-empty comment text. Alt+click to exclude.";
        try { btn.appendChild(this._makeHasCommentSvg(idoc)); } catch (_) {}
        btn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            if (e.altKey) st.hasComment = (st.hasComment === false) ? null : false;
            else st.hasComment = (st.hasComment === true) ? null : true;
            this._wvApplyReaderFilter(reader);
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            this._wvReaderEnsureFilterButton(reader, idoc);
        });
        return btn;
    }

    /** Plugin-layer match (dimensions the native filter lacks + all excludes).
     *  An annotation is hidden (added to hiddenIDs) when this returns false. */
    _wvReaderPluginMatch(st: any, a: any) {
        try {
            const ty = a.annotationType;
            if (st.types.length && st.types.indexOf(ty) < 0) return false;
            if (st.typesExcl.length && st.typesExcl.indexOf(ty) >= 0) return false;
            if (st.colorsExcl.length && st.colorsExcl.indexOf(a.annotationColor) >= 0) return false;
            const hasC = !!(a.annotationComment && String(a.annotationComment).trim());
            if (st.hasComment === true && !hasC) return false;
            if (st.hasComment === false && hasC) return false;
            if (st.tagsExcl.length) {
                const tset = new Set((a.getTags() || []).map((t: any) => t.tag));
                for (const tg of st.tagsExcl) if (tset.has(tg)) return false;
            }
            if (st.hasRelated !== null) {
                const rel = !!(a.relatedItems && a.relatedItems.length);
                if (st.hasRelated === true && !rel) return false;
                if (st.hasRelated === false && rel) return false;
            }
            if (st.hasLink !== null) {
                const link = !!this.hasURI(a.annotationComment || "");
                if (st.hasLink === true && !link) return false;
                if (st.hasLink === false && link) return false;
            }
            if (st.addedByExcl.length) {
                const an = a.createdByUserID != null ? this._wvUserName(a.createdByUserID) : null;
                if (an != null && st.addedByExcl.indexOf(an) >= 0) return false;
            }
            if (st.modifiedBy.length || st.modifiedByExcl.length) {
                const mn = a.lastModifiedByUserID != null ? this._wvUserName(a.lastModifiedByUserID) : null;
                if (st.modifiedBy.length && (mn == null || st.modifiedBy.indexOf(mn) < 0)) return false;
                if (mn != null && st.modifiedByExcl.indexOf(mn) >= 0) return false;
            }
            return true;
        } catch (_) { return true; }
    }

    /** Native-channel match (colour/tag/author INCLUDES the reader applies). */
    _wvReaderNativeMatch(a: any, nat: any) {
        try {
            if (nat.colors.length && nat.colors.indexOf(a.annotationColor) < 0) return false;
            if (nat.tags.length) {
                const tset = new Set((a.getTags() || []).map((t: any) => t.tag));
                let any = false;
                for (const tg of nat.tags) if (tset.has(tg)) { any = true; break; }
                if (!any) return false;
            }
            if (nat.authors.length) {
                const an = a.createdByUserID != null ? this._wvUserName(a.createdByUserID) : null;
                if (an == null || nat.authors.indexOf(an) < 0) return false;
            }
            return true;
        } catch (_) { return true; }
    }

    /** Compute the non-matching annotation keys and push them to the reader's
     *  annotation manager as hiddenIDs — hides in BOTH sidebar and view. */
    _wvApplyReaderFilter(reader: any, inc?: any) {
        try {
            const st = this._wvReaderFilterState(reader);
            const anns = this._wvReaderAnnotations(reader);
            // Colour / tag / author INCLUDES go through the native channel
            // (shared with the sidebar strip). `inc` lets a chip click pass the
            // just-toggled include array; otherwise keep the current native one.
            const natCur = this._wvReaderNativeIncludes(reader);
            const colors = (inc && inc.colors) ? inc.colors : natCur.colors;
            const tags = (inc && inc.tags) ? inc.tags : natCur.tags;
            const authors = (inc && inc.authors) ? inc.authors : natCur.authors;
            // hiddenIDs carries everything the native filter can't: type,
            // has-comment/related/link, modified-by, and ALL excludes.
            const hiddenIDs = anns.filter(a => !this._wvReaderPluginMatch(st, a)).map(a => a.key);
            const ir = reader._internalReader;
            if (ir && typeof ir.setFilter === "function") {
                const iwin = reader._iframeWindow
                    || (reader._iframe && reader._iframe.contentWindow);
                let arg: any = { colors, tags, authors, hiddenIDs };
                try {
                    if (iwin && Components && Components.utils) {
                        arg = Components.utils.cloneInto(arg, iwin);
                    }
                } catch (_) {}
                ir.setFilter(arg);
            }
            // When "Hide Annotations in the Reader" is on (fallback path), the
            // view's setAnnotations is blocked, so this filter only updates the
            // sidebar — nothing extra to do here.
        } catch (e) {
            Zotero.debug("[Weavero] _wvApplyReaderFilter err: " + e);
        }
    }

    // ---- Feature B: Bookmarks tab -----------------------------------------

    /** Resolve a row icon src for use inside the reader iframe (which blocks
     *  chrome:// loads). data: URIs pass through; chrome/resource SVGs are
     *  fetched + cached as data: URIs, re-rendering the list when ready.
     *  Returns null while a fetch is pending (caller uses a fallback glyph). */
    _wvReaderResolveRowIcon(reader: any, idoc: any, src: string) {
        if (!src) return null;
        if (src.indexOf("data:") === 0) return src;
        if (src.indexOf("chrome://") !== 0 && src.indexOf("resource://") !== 0) return src;
        if (!/\.svg(\?|$)/.test(src)) return null;   // only SVGs are inlinable this way
        const cached = this._wvReaderIconUri(src);
        if (cached) return cached;
        if (!this._wvReaderIconCache) this._wvReaderIconCache = {};
        if (!this._wvReaderIconFetching) this._wvReaderIconFetching = {};
        if (!this._wvReaderIconFetching[src]) {
            this._wvReaderIconFetching[src] = true;
            fetch(src).then((r: any) => r.text()).then((txt: string) => {
                this._wvReaderIconCache[src] = "data:image/svg+xml," + encodeURIComponent(txt);
                delete this._wvReaderIconFetching[src];
                try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
            }).catch(() => { delete this._wvReaderIconFetching[src]; });
        }
        return null;
    }

    /** { libraryID, itemKey, att } for the reader's attachment, or null. */
    _wvReaderAtt(reader: any) {
        try {
            const att: any = Zotero.Items.get(reader.itemID);
            if (att) return { libraryID: att.libraryID, itemKey: att.key, att };
        } catch (_) {}
        return null;
    }

    _wvReaderBmActive(reader: any) {
        if (!this._wvReaderBmActiveWM) this._wvReaderBmActiveWM = new WeakMap();
        // An explicit choice this session wins; otherwise fall back to the
        // persisted pref. Read every scan so the Bookmarks tab is restored AND
        // STAYS restored — even if the reader's own late tab-restore re-selects
        // a native tab after us (`_wvReaderApplyBmTabState` re-asserts).
        if (this._wvReaderBmActiveWM.has(reader)) return !!this._wvReaderBmActiveWM.get(reader);
        try {
            const att = this._wvReaderAtt(reader);
            if (att) {
                const m = JSON.parse(String(Zotero.Prefs.get("weavero.readerBmTabs") || "{}"));
                return !!m[att.libraryID + ":" + att.itemKey];
            }
        } catch (_) {}
        return false;
    }
    _wvReaderSetBmActive(reader: any, idoc: any, on: boolean) {
        if (!this._wvReaderBmActiveWM) this._wvReaderBmActiveWM = new WeakMap();
        this._wvReaderBmActiveWM.set(reader, !!on);
        this._wvReaderSaveBmActive(reader, !!on);
        if (on) this._wvReaderRenderBmList(reader, idoc);
        this._wvReaderApplyBmTabState(reader, idoc);
    }

    /** Remember per-attachment whether the Bookmarks tab is the active reader
     *  sidebar tab, so it can be restored on reopen/restart (Zotero restores
     *  its own native tabs, but doesn't know about ours). Stored in a small
     *  JSON pref keyed by libraryID:itemKey; only "active" entries are kept. */
    _wvReaderSaveBmActive(reader: any, on: boolean) {
        try {
            const att = this._wvReaderAtt(reader);
            if (!att) return;
            const key = att.libraryID + ":" + att.itemKey;
            let map: any = {};
            try { map = JSON.parse(String(Zotero.Prefs.get("weavero.readerBmTabs") || "{}")) || {}; } catch (_) {}
            if (on) map[key] = true; else delete map[key];
            Zotero.Prefs.set("weavero.readerBmTabs", JSON.stringify(map));
        } catch (_) {}
    }

    /** Inject the Bookmarks tab (beside Outline) and its view panel. */
    _wvReaderEnsureBookmarksTab(reader: any, idoc: any) {
        try {
            const tablist = idoc.querySelector("#sidebarContainer .sidebar-toolbar .start")
                || idoc.querySelector(".sidebar-toolbar .start");
            const content = idoc.getElementById("sidebarContent");
            if (!tablist || !content) return;

            // Tab button.
            let tab = idoc.querySelector("." + RP_BM_TAB_CLASS);
            if (!tab) {
                tab = idoc.createElementNS(NS_HTML_RP, "button");
                tab.className = "toolbar-button " + RP_BM_TAB_CLASS;
                tab.setAttribute("tabindex", "-1");
                tab.setAttribute("role", "tab");
                tab.setAttribute("title", "Bookmarks");
                tab.innerHTML = RP_BM_RIBBON;
                tab.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                    this._wvReaderSetBmActive(reader, idoc, true);
                });
                // Drop an annotation/selection (from the sidebar OR the center
                // pane) onto the tab to bookmark it (activates the tab).
                tab.addEventListener("dragover", (e: any) => {
                    if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) { e.preventDefault(); tab.classList.add("wv-bm-dropok"); }
                });
                tab.addEventListener("dragleave", () => tab.classList.remove("wv-bm-dropok"));
                tab.addEventListener("drop", (e: any) => {
                    tab.classList.remove("wv-bm-dropok");
                    if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                    if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                    e.preventDefault();
                    const payload = this._wvReaderReadDropPayload(e);
                    this._wvReaderSetBmActive(reader, idoc, true);
                    this._wvReaderDropPayload(reader, idoc, payload);
                });
                const outlineTab = idoc.getElementById("viewOutline");
                if (outlineTab && outlineTab.nextSibling) tablist.insertBefore(tab, outlineTab.nextSibling);
                else if (outlineTab) tablist.appendChild(tab);
                else tablist.appendChild(tab);
            }

            // Deactivate our tab whenever a native tab is clicked (one
            // document-level capture listener, survives React re-renders).
            if (!idoc._wvBmTabClickWired) {
                idoc._wvBmTabClickWired = true;
                idoc.addEventListener("click", (e: any) => {
                    try {
                        const t = e.target;
                        if (t && t.closest && t.closest("#viewThumbnail,#viewAnnotations,#viewOutline")) {
                            this._wvReaderSetBmActive(reader, idoc, false);
                        }
                    } catch (_) {}
                }, true);
            }
            // Capture which annotation is being dragged from the sidebar so a
            // drop on our tab/view can bookmark it (MIME-independent).
            if (!idoc._wvBmAnnDragWired) {
                idoc._wvBmAnnDragWired = true;
                idoc.addEventListener("dragstart", (e: any) => {
                    try {
                        const a = e.target && e.target.closest && e.target.closest("[data-sidebar-annotation-id]");
                        this._wvDraggedAnnKey = a ? a.getAttribute("data-sidebar-annotation-id") : null;
                    } catch (_) { this._wvDraggedAnnKey = null; }
                }, true);
                idoc.addEventListener("dragend", () => { this._wvDraggedAnnKey = null; }, true);
            }

            // View panel.
            let view = content.querySelector("." + RP_BM_VIEW_CLASS);
            if (!view) {
                view = idoc.createElementNS(NS_HTML_RP, "div");
                view.className = "viewWrapper " + RP_BM_VIEW_CLASS;
                const head = idoc.createElementNS(NS_HTML_RP, "div");
                head.className = "wv-bm-reader-head";
                const htitle = idoc.createElementNS(NS_HTML_RP, "div");
                htitle.className = "wv-bm-reader-htitle";
                htitle.textContent = "Bookmarks";
                const add = idoc.createElementNS(NS_HTML_RP, "button");
                add.className = "wv-bm-reader-add";
                add.setAttribute("title", "Add a bookmark (anywhere in Zotero)…");
                add.innerHTML = RP_PLUS_SVG;
                add.addEventListener("click", () => this._wvReaderAddViaDialog(reader, idoc));
                // New-folder button — always visible in the pane header (the
                // per-section hover button caused the header to grow/shift).
                // Folders organise the "In this document" section.
                const newFolder = idoc.createElementNS(NS_HTML_RP, "button");
                newFolder.className = "wv-bm-reader-add";
                newFolder.setAttribute("title", "New folder");
                newFolder.innerHTML = RP_FOLDER_PLUS_SVG;
                newFolder.addEventListener("click", () => {
                    const att2 = this._wvReaderAtt(reader);
                    if (!att2) return;
                    const name = this._bmPromptName(Zotero.getMainWindow(), "New Folder", "New Folder");
                    if (name) this._bmReaderAddFolder(att2.libraryID, att2.itemKey, "local", name)
                        .then(() => this._wvReaderRenderBmList(reader, idoc));
                });
                head.appendChild(htitle);
                head.appendChild(add);
                head.appendChild(newFolder);
                const list = idoc.createElementNS(NS_HTML_RP, "div");
                list.className = "wv-bm-reader-list";
                view.appendChild(head);
                view.appendChild(list);
                // Drop an annotation/selection (from the sidebar OR the center
                // pane) anywhere on the bookmarks pane to bookmark it.
                view.addEventListener("dragover", (e: any) => {
                    if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) e.preventDefault();
                });
                view.addEventListener("drop", (e: any) => {
                    if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                    if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                    e.preventDefault();
                    this._wvReaderDropPayload(reader, idoc, this._wvReaderReadDropPayload(e));
                });
                content.appendChild(view);
                this._wvReaderRenderBmList(reader, idoc);
            }

            // Apply the active state (restored from the pref via _wvReaderBmActive
            // when no explicit choice was made this session).
            this._wvReaderApplyBmTabState(reader, idoc);
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderEnsureBookmarksTab err: " + e);
        }
    }

    /** Show/hide our view vs the React views via inline display (React owns
     *  the wrappers' className, not their inline style, so this survives
     *  re-renders); toggle the active class on the tabs. */
    _wvReaderApplyBmTabState(reader: any, idoc: any) {
        try {
            const on = this._wvReaderBmActive(reader);
            const content = idoc.getElementById("sidebarContent");
            const view = content && content.querySelector("." + RP_BM_VIEW_CLASS);
            if (!content || !view) return;
            const wrappers = content.querySelectorAll(".viewWrapper");
            for (const w of wrappers) {
                if (w === view) continue;
                w.style.display = on ? "none" : "";
            }
            view.style.display = on ? "flex" : "none";
            const myTab = idoc.querySelector("." + RP_BM_TAB_CLASS);
            if (myTab) myTab.classList.toggle("active", on);
            const sc = idoc.getElementById("sidebarContainer");
            if (sc) sc.classList.toggle(RP_BM_TAB_ON, on);
            if (on) {
                for (const id of ["viewThumbnail", "viewAnnotations", "viewOutline"]) {
                    const t = idoc.getElementById(id);
                    if (t) { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); }
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderApplyBmTabState err: " + e);
        }
    }

    /** Render the per-attachment bookmarks in two sections — "In this document"
     *  (local) and "Elsewhere in Zotero" (global) — each a manually-ordered,
     *  foldered tree. A section header (with a "new folder" button) shows for
     *  every non-empty section. */
    _wvReaderRenderBmList(reader: any, idoc: any) {
        try {
            const content = idoc.getElementById("sidebarContent");
            const view = content && content.querySelector("." + RP_BM_VIEW_CLASS);
            const list = view && view.querySelector(".wv-bm-reader-list");
            if (!list) return;
            const att = this._wvReaderAtt(reader);
            if (!att) return;
            // The store loads bookmarks.json asynchronously. On a fresh restart
            // the reader can render before it's ready (_bmDoc still undefined),
            // which would show a false "No bookmarks yet". Defer until loaded,
            // then render for real — don't paint an empty list meanwhile.
            if (!this._bmDoc) {
                this._bmInit().then(() => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} });
                return;
            }
            const NS = NS_HTML_RP;
            while (list.firstChild) list.firstChild.remove();
            const doc = this._bmReaderDoc(att.libraryID, att.itemKey);
            if (!doc.local.length && !doc.global.length) {
                const empty = idoc.createElementNS(NS, "div");
                empty.className = "wv-bm-reader-empty";
                empty.textContent = "No bookmarks yet.\n+ bookmarks anywhere in Zotero. Right-click in the page to bookmark a position or selection; drag an annotation here to bookmark it.";
                list.appendChild(empty);
                return;
            }
            const addSection = (heading: string, nodes: any[], section: "local" | "global") => {
                if (!nodes.length) return;
                const gc = idoc.createElementNS(NS, "div");
                gc.className = "wv-bm-reader-group " + (section === "local" ? "wv-bm-grp-local" : "wv-bm-grp-global");
                const h = idoc.createElementNS(NS, "div");
                h.className = "wv-bm-reader-grouphead";
                h.textContent = heading;
                gc.appendChild(h);
                const treeWrap = idoc.createElementNS(NS, "div");
                treeWrap.className = "wv-bm-reader-tree";
                this._wvReaderRenderTree(reader, idoc, att, treeWrap, nodes, section, 0);
                gc.appendChild(treeWrap);
                this._wvReaderWireGroupDrop(reader, idoc, gc, section === "local");
                list.appendChild(gc);
            };
            addSection("In this document", doc.local, "local");
            addSection("Elsewhere in Zotero", doc.global, "global");
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderRenderBmList err: " + e);
        }
    }

    /** Render one tree level (folders + bookmarks) into a container; folders
     *  recurse when expanded. `depth` drives indentation. */
    _wvReaderRenderTree(reader: any, idoc: any, att: any, container: any, nodes: any[], section: "local" | "global", depth: number) {
        for (const node of nodes) {
            if (node.type === "folder") {
                container.appendChild(this._wvReaderFolderRow(reader, idoc, att, node, section, depth));
                if (node.expanded) {
                    this._wvReaderRenderTree(reader, idoc, att, container, node.children || [], section, depth + 1);
                }
            } else {
                container.appendChild(this._wvReaderBmRow(reader, idoc, att, node, section, depth));
            }
        }
    }

    /** A folder row: chevron (expand/collapse) + folder glyph + name +
     *  rename/delete; click toggles; draggable + drop target (before/after/
     *  into). */
    _wvReaderFolderRow(reader: any, idoc: any, att: any, folder: any, section: "local" | "global", depth: number) {
        const NS = NS_HTML_RP;
        const row = idoc.createElementNS(NS, "div");
        row.className = "wv-bm-reader-row wv-bm-reader-folder";
        row.style.paddingLeft = (8 + depth * 14) + "px";
        const chev = idoc.createElementNS(NS, "span");
        chev.className = "wv-bm-reader-chev";
        chev.innerHTML = folder.expanded ? RP_CHEV_DOWN : RP_CHEV_RIGHT;
        const ic = idoc.createElementNS(NS, "span");
        ic.className = "wv-bm-reader-ic";
        ic.innerHTML = RP_FOLDER_SVG;
        const label = idoc.createElementNS(NS, "span");
        label.className = "wv-bm-reader-label";
        label.textContent = folder.name || "Folder";
        label.setAttribute("title", folder.name || "");
        const actions = idoc.createElementNS(NS, "span");
        actions.className = "wv-bm-reader-actions";
        const renameBtn = idoc.createElementNS(NS, "button");
        renameBtn.className = "wv-bm-reader-actbtn"; renameBtn.textContent = "✎"; renameBtn.setAttribute("title", "Rename");
        renameBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            const name = this._bmPromptName(Zotero.getMainWindow(), "Rename Folder", folder.name || "");
            if (name) this._bmReaderRename(att.libraryID, att.itemKey, folder.id, name).then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        const delBtn = idoc.createElementNS(NS, "button");
        delBtn.className = "wv-bm-reader-actbtn"; delBtn.textContent = "✕"; delBtn.setAttribute("title", "Delete folder");
        delBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            const n = (folder.children && folder.children.length) || 0;
            if (n > 0) {
                const ok = Services.prompt.confirm(Zotero.getMainWindow(), "Delete Folder",
                    'Delete the folder "' + (folder.name || "") + '" and its ' + n + " item" + (n === 1 ? "" : "s") + "?");
                if (!ok) return;
            }
            this._bmReaderRemove(att.libraryID, att.itemKey, folder.id).then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        actions.appendChild(renameBtn); actions.appendChild(delBtn);
        row.appendChild(chev); row.appendChild(ic); row.appendChild(label); row.appendChild(actions);
        row.addEventListener("click", (e: any) => {
            e.stopPropagation();
            this._bmReaderToggleFolder(att.libraryID, att.itemKey, folder.id).then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        this._wvReaderWireRowDrag(reader, idoc, att, row, folder, section, true);
        return row;
    }

    /** Drop wiring for one bookmark group. The local ("In this document")
     *  group accepts annotation/selection drops; the global ("Elsewhere")
     *  group refuses them — annotations and selections always belong to the
     *  open document, so they'd be confusing filed under Elsewhere. Internal
     *  row-reorder drags (a distinct MIME) pass through to the row handlers in
     *  both groups. */
    _wvReaderWireGroupDrop(reader: any, idoc: any, gc: any, isLocal: boolean) {
        if (isLocal) {
            gc.addEventListener("dragover", (e: any) => {
                if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                e.preventDefault();
                gc.classList.add("wv-bm-grp-dropok");
            });
            gc.addEventListener("dragleave", (e: any) => {
                if (!gc.contains(e.relatedTarget)) gc.classList.remove("wv-bm-grp-dropok");
            });
            gc.addEventListener("drop", (e: any) => {
                gc.classList.remove("wv-bm-grp-dropok");
                if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                e.preventDefault();
                this._wvReaderDropPayload(reader, idoc, this._wvReaderReadDropPayload(e));
            });
        } else {
            gc.addEventListener("dragover", (e: any) => {
                if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                // Refuse here AND stop the pane-level handler from accepting,
                // so the cursor reads "no drop" over Elsewhere.
                e.stopPropagation();
                try { e.dataTransfer.dropEffect = "none"; } catch (_) {}
                gc.classList.add("wv-bm-grp-nodrop");
            });
            gc.addEventListener("dragleave", (e: any) => {
                if (!gc.contains(e.relatedTarget)) gc.classList.remove("wv-bm-grp-nodrop");
            });
            gc.addEventListener("drop", (e: any) => {
                gc.classList.remove("wv-bm-grp-nodrop");
                if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) {
                    e.stopPropagation(); e.preventDefault(); e._wvBmDropHandled = true;
                }
            });
        }
    }

    /** True for bookmarks that point INTO the currently-open document
     *  (positions, selected-text, and annotations of this attachment). */
    _wvReaderBookmarkIsLocal(reader: any, bm: any) {
        try {
            if (!bm) return false;
            if (bm.type === "position" || bm.type === "text") return true;
            if (bm.type === "item") {
                const it: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
                if (!it) return false;
                if (it.id === reader.itemID) return true;
                if (typeof it.isAnnotation === "function" && it.isAnnotation()
                    && it.parentItemID === reader.itemID) return true;
            }
            return false;
        } catch (_) { return false; }
    }

    /** Click a bookmark. For targets INSIDE the open document (positions,
     *  selected text, this-doc annotations) the same three modifier options as
     *  the collections-pane bookmark apply, mapped to the reader:
     *    • plain click    → jump to it within THIS reader
     *    • Shift-click    → open it in a NEW reader window (at the location)
     *    • Ctrl/Cmd-click → show the document in the library
     *  Global bookmarks (Elsewhere in Zotero) keep the collections-pane
     *  behavior (new tab / new window / show in library). */
    _wvNavigateReaderBookmark(reader: any, bm: any, e: any) {
        if (!bm) return;
        const ctrl = !!(e && (e.ctrlKey || e.metaKey));
        const shift = !!(e && e.shiftKey);
        const isLocalLoc = bm.type === "position" || bm.type === "text";
        const isLocalAnno = bm.type === "item" && this._wvReaderBookmarkIsLocal(reader, bm);
        if (isLocalLoc || isLocalAnno) {
            const att = this._wvReaderAtt(reader);
            if (ctrl) {
                this._bmShowInLibrary(isLocalAnno ? bm
                    : (att ? { type: "item", libraryID: att.libraryID, itemKey: att.itemKey } : null));
                return;
            }
            if (shift) {
                if (att) {
                    let loc: any = null;
                    if (isLocalAnno) loc = { annotationID: bm.itemKey };
                    else if (bm.position) loc = { position: bm.position };
                    else if (bm.viewType === "pdf" && bm.location && Number.isInteger(bm.location.pageIndex)) loc = { pageIndex: bm.location.pageIndex };
                    else if (bm.location && bm.location.cfi) loc = { pageNumber: bm.location.cfi };
                    try { Zotero.Reader.open(att.att.id, loc, { openInWindow: true }); } catch (_) {}
                }
                return;
            }
            if (isLocalAnno) { try { reader.navigate({ annotationID: bm.itemKey }); } catch (_) {} }
            else this._wvNavigateReaderLocation(reader, bm);
            return;
        }
        this._bmActivateBookmark(bm, e);
    }

    /** Build one bookmark row (icon by type, label, page, rename/delete,
     *  click→navigate, drag reorder/nest). `depth` indents nested rows; a
     *  hidden chevron spacer keeps icons aligned with folder rows. */
    _wvReaderBmRow(reader: any, idoc: any, att: any, bm: any, section?: "local" | "global", depth?: number) {
        const NS = NS_HTML_RP;
        const row = idoc.createElementNS(NS, "div");
        row.className = "wv-bm-reader-row";
        row.style.paddingLeft = (8 + (depth || 0) * 14) + "px";
        const chevSpacer = idoc.createElementNS(NS, "span");
        chevSpacer.className = "wv-bm-reader-chev wv-bm-reader-chev-spacer";
        chevSpacer.innerHTML = RP_CHEV_RIGHT;
        row.appendChild(chevSpacer);
        const ic = idoc.createElementNS(NS, "span");
        ic.className = "wv-bm-reader-ic";
        if (bm.type === "position") { ic.classList.add("wv-bm-emoji"); ic.textContent = RP_PIN_EMOJI; }
        else if (bm.type === "text") ic.innerHTML = RP_TEXT_SVG;
        else {
            let done = false;
            try {
                const info = this._bmIconInfo(bm, idoc.defaultView);
                const src = info && this._wvReaderResolveRowIcon(reader, idoc, info.image);
                if (src) {
                    const img = idoc.createElementNS(NS, "img");
                    img.setAttribute("src", src);
                    img.setAttribute("width", "14"); img.setAttribute("height", "14");
                    if (info.fill) img.setAttribute("style", "-moz-context-properties:fill;fill:" + info.fill + ";");
                    ic.appendChild(img); done = true;
                }
            } catch (_) {}
            if (!done) ic.innerHTML = RP_BM_RIBBON;
        }
        const label = idoc.createElementNS(NS, "span");
        label.className = "wv-bm-reader-label";
        label.textContent = bm.label || "Bookmark";
        label.setAttribute("title", bm.label || "");
        const page = idoc.createElementNS(NS, "span");
        page.className = "wv-bm-reader-page";
        page.textContent = bm.pageLabel ? ("p. " + bm.pageLabel) : "";
        const actions = idoc.createElementNS(NS, "span");
        actions.className = "wv-bm-reader-actions";
        const renameBtn = idoc.createElementNS(NS, "button");
        renameBtn.className = "wv-bm-reader-actbtn"; renameBtn.textContent = "✎"; renameBtn.setAttribute("title", "Rename");
        renameBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            const name = this._bmPromptName(Zotero.getMainWindow(), "Rename Bookmark", bm.label || "");
            if (name) this._bmReaderRename(att.libraryID, att.itemKey, bm.id, name).then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        const delBtn = idoc.createElementNS(NS, "button");
        delBtn.className = "wv-bm-reader-actbtn"; delBtn.textContent = "✕"; delBtn.setAttribute("title", "Delete");
        delBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            this._bmReaderRemove(att.libraryID, att.itemKey, bm.id).then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        actions.appendChild(renameBtn); actions.appendChild(delBtn);
        row.appendChild(ic); row.appendChild(label); row.appendChild(page); row.appendChild(actions);
        row.addEventListener("click", (e: any) => this._wvNavigateReaderBookmark(reader, bm, e));
        this._wvReaderWireRowDrag(reader, idoc, att, row, bm,
            section || (this._wvReaderBookmarkIsLocal(reader, bm) ? "local" : "global"), false);
        return row;
    }

    /** Shared drag wiring for bookmark + folder rows. The dragged node id is
     *  carried via a distinct reorder MIME (so pane/tab targets ignore it);
     *  drop zones are before/after on every row plus a middle "into" zone on
     *  folders. Moves stay within the row's own section. A center-pane
     *  bookmarkable drop onto a LOCAL row files it there; onto a GLOBAL row
     *  it's refused (annotations/selections belong to the open document). */
    _wvReaderWireRowDrag(reader: any, idoc: any, att: any, row: any, node: any, section: "local" | "global", isFolder: boolean) {
        row.setAttribute("draggable", "true");
        const clearDrop = () => row.classList.remove("wv-bm-drop-before", "wv-bm-drop-after", "wv-bm-drop-into");
        const modeAt = (e: any) => {
            const r = row.getBoundingClientRect();
            const y = e.clientY - r.top;
            if (isFolder) {
                if (y < r.height * 0.28) return "before";
                if (y > r.height * 0.72) return "after";
                return "into";
            }
            return (y > r.height / 2) ? "after" : "before";
        };
        const isReorder = (dt: any) => {
            try {
                const t = dt && dt.types;
                if (!t) return false;
                return (typeof t.includes === "function") ? t.includes("application/x-weavero-bm-reorder")
                    : Array.prototype.indexOf.call(t, "application/x-weavero-bm-reorder") >= 0;
            } catch (_) { return false; }
        };
        row.addEventListener("dragstart", (e: any) => {
            try {
                e.dataTransfer.setData("application/x-weavero-bm-reorder", node.id);
                e.dataTransfer.setData("text/plain", "wvbm:" + node.id);
                e.dataTransfer.effectAllowed = "move";
            } catch (_) {}
            e.stopPropagation();
            row.classList.add("wv-bm-dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("wv-bm-dragging"));
        row.addEventListener("dragover", (e: any) => {
            if (!isReorder(e.dataTransfer) && section === "global"
                && this._wvReaderDragHasBookmarkable(e.dataTransfer)) {
                e.stopPropagation();
                try { e.dataTransfer.dropEffect = "none"; } catch (_) {}
                return;
            }
            e.preventDefault();
            const m = modeAt(e);
            clearDrop();
            row.classList.add(m === "before" ? "wv-bm-drop-before" : m === "after" ? "wv-bm-drop-after" : "wv-bm-drop-into");
        });
        row.addEventListener("dragleave", clearDrop);
        row.addEventListener("drop", (e: any) => {
            clearDrop();
            if (!isReorder(e.dataTransfer) && section === "global"
                && this._wvReaderDragHasBookmarkable(e.dataTransfer)) {
                e.stopPropagation(); e.preventDefault(); e._wvBmDropHandled = true; return;
            }
            if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
            e.preventDefault(); e.stopPropagation();
            const m = modeAt(e);
            let reorderId = ""; try { reorderId = e.dataTransfer.getData("application/x-weavero-bm-reorder"); } catch (_) {}
            if (reorderId) {
                if (reorderId !== node.id) this._bmReaderMove(att.libraryID, att.itemKey, reorderId, node.id, m)
                    .then(() => this._wvReaderRenderBmList(reader, idoc));
            } else if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) {
                this._wvReaderDropPayload(reader, idoc, this._wvReaderReadDropPayload(e));
            }
        });
    }

    /** True if a drag carries something bookmarkable: an annotation being
     *  dragged from the sidebar (`_wvDraggedAnnKey`), or a center-pane drag
     *  whose dataTransfer has `zotero/annotation` or `text/plain`. */
    _wvReaderDragHasBookmarkable(dt: any) {
        try {
            if (this._wvDraggedAnnKey) return true;
            const t = dt && dt.types;
            if (!t) return false;
            const has = (k: string) => (typeof t.includes === "function") ? t.includes(k) : (Array.prototype.indexOf.call(t, k) >= 0);
            if (has("application/x-weavero-bm-reorder")) return false;   // internal reorder
            return has("zotero/annotation") || has("text/plain");
        } catch (_) { return false; }
    }

    /** Read the drop payload SYNCHRONOUSLY (dataTransfer is neutered after an
     *  await): the sidebar annotation key, the center-pane `zotero/annotation`
     *  JSON, and any plain text. */
    _wvReaderReadDropPayload(e: any) {
        let annJson = "", txt = "";
        try { annJson = e.dataTransfer.getData("zotero/annotation"); } catch (_) {}
        try { txt = e.dataTransfer.getData("text/plain"); } catch (_) {}
        return { sidebarKey: this._wvDraggedAnnKey, annJson, txt };
    }

    /** Turn a drop payload into bookmark(s): annotation(s) → item bookmarks;
     *  otherwise a text selection → a location bookmark labelled with the text.
     *  Used by the Bookmarks tab button, the bookmarks pane, and rows. */
    async _wvReaderDropPayload(reader: any, idoc: any, payload: any) {
        try {
            const att = this._wvReaderAtt(reader); if (!att) return;
            this._wvDraggedAnnKey = null;
            // Saved annotations (have a key) → item bookmarks; an unsaved text
            // selection (no key, but carries text + position) → a text bookmark.
            const entries: any[] = [];
            let selAnn: any = null;
            if (payload.sidebarKey) entries.push({ key: payload.sidebarKey, label: null });
            else if (payload.annJson) {
                try {
                    const arr = JSON.parse(payload.annJson);
                    for (const a of (arr || [])) {
                        if (a && a.id) entries.push({ key: a.id, label: String(a.text || a.comment || "").trim() });
                        else if (a && !selAnn && (a.text || a.position)) selAnn = a;
                    }
                } catch (_) {}
            }
            if (entries.length) {
                let added = 0;
                for (const en of entries) {
                    let label = en.label;
                    if (!label) {
                        try { const it: any = Zotero.Items.getByLibraryAndKey(att.libraryID, en.key); label = it ? String(it.annotationText || it.annotationComment || "").trim() : ""; } catch (_) {}
                    }
                    label = (label || "Annotation").slice(0, 100);
                    if (await this._bmReaderAdd(att.libraryID, att.itemKey, { type: "item", libraryID: att.libraryID, itemKey: en.key, label })) added++;
                }
                if (added) this._wvReaderRenderBmList(reader, idoc);
                return;
            }
            // Selected text → text bookmark, storing the selection's position
            // so a click scrolls to AND highlights it (like dragging to a
            // note). (The internal reorder marker is ignored.)
            const selText = (selAnn && String(selAnn.text || "").trim())
                || ((payload.txt && payload.txt.indexOf("wvbm:") !== 0) ? payload.txt.trim() : "");
            if (selText) {
                const cap = this._wvCaptureReaderLocation(reader);
                let position: any = null;
                if (selAnn && selAnn.position) { try { position = JSON.parse(JSON.stringify(selAnn.position)); } catch (_) {} }
                const pageLabel = (selAnn && selAnn.pageLabel) || cap.pageLabel;
                await this._bmReaderAdd(att.libraryID, att.itemKey,
                    { type: "text", viewType: cap.viewType, location: cap.location, position, pageLabel, label: selText.slice(0, 160) });
                this._wvReaderRenderBmList(reader, idoc);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderDropPayload err: " + e); }
    }

    /** + → Zotero's select-items picker; bookmark the chosen item / collection
     *  / library / saved-search into the per-document list (same picker the
     *  collections-pane bookmark uses). */
    async _wvReaderAddViaDialog(reader: any, idoc: any) {
        try {
            const att = this._wvReaderAtt(reader); if (!att) return;
            const win = Zotero.getMainWindow(); if (!win) return;
            const io: any = { dataIn: null, dataOut: null, deferred: Zotero.Promise.defer(), itemTreeID: "weavero-reader-bm-select" };
            const dlg: any = win.openDialog("chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            let pickedCollection: any = null, pickedLibraryID: any = null, pickedTreeRow: any = null;
            try {
                dlg && dlg.addEventListener("dialogaccept", () => {
                    try {
                        const cv = dlg.collectionsView; const tr = cv && cv.selectedTreeRow;
                        if (!tr) return;
                        if (typeof tr.isCollection === "function" && tr.isCollection()) pickedCollection = tr.ref;
                        else if (this._bmTreeRowIsLibrary(tr) && tr.ref) pickedLibraryID = tr.ref.libraryID;
                        else if (this._bmTreeRowIsSpecial(tr) && tr.id && tr.getName) pickedTreeRow = { rowID: tr.id, libraryID: tr.ref && tr.ref.libraryID, label: tr.getName() };
                    } catch (_) {}
                }, true);
            } catch (_) {}
            await io.deferred.promise;
            const add = (rec: any) => this._bmReaderAdd(att.libraryID, att.itemKey, rec);
            if (io.dataOut && io.dataOut.length) {
                const targets: any = await Zotero.Items.getAsync(io.dataOut);
                for (const it of (targets || [])) {
                    let label = ""; try { label = it.getDisplayTitle ? it.getDisplayTitle() : (it.getField ? it.getField("title") : ""); } catch (_) {}
                    await add({ type: "item", libraryID: it.libraryID, itemKey: it.key, label: label || it.key });
                }
            } else if (pickedCollection && pickedCollection.key) {
                await add({ type: "collection", libraryID: pickedCollection.libraryID, collectionKey: pickedCollection.key, label: pickedCollection.name || pickedCollection.key });
            } else if (typeof pickedLibraryID === "number") {
                let label = ""; try { const lib: any = Zotero.Libraries.get(pickedLibraryID); label = lib && lib.name; } catch (_) {}
                await add({ type: "library", libraryID: pickedLibraryID, label: label || ("Library " + pickedLibraryID) });
            } else if (pickedTreeRow) {
                await add({ type: "treerow", rowID: pickedTreeRow.rowID, libraryID: pickedTreeRow.libraryID, label: pickedTreeRow.label || pickedTreeRow.rowID });
            }
            this._wvReaderRenderBmList(reader, idoc);
        } catch (e) { Zotero.debug("[Weavero] _wvReaderAddViaDialog err: " + e); }
    }

    /** Bookmark the current text selection (label = the selected text). Stores
     *  the selection's position so clicking it later scrolls to AND highlights
     *  the text, the same way dragging a selection to a note does. */
    async _wvReaderAddSelectedText(reader: any) {
        try {
            const att = this._wvReaderAtt(reader); if (!att) return;
            let text = "", position: any = null;
            try {
                const sel = reader._internalReader._state.primaryViewSelectionPopup.annotation;
                text = String(sel.text || "").trim();
                if (sel.position) { try { position = JSON.parse(JSON.stringify(sel.position)); } catch (_) {} }
            } catch (_) {}
            if (!text) return;
            const cap = this._wvCaptureReaderLocation(reader);
            await this._bmReaderAdd(att.libraryID, att.itemKey,
                { type: "text", viewType: cap.viewType, location: cap.location, position, pageLabel: cap.pageLabel, label: text.slice(0, 160) });
            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            if (iwin && iwin.document) this._wvReaderRenderBmList(reader, iwin.document);
        } catch (e) { Zotero.debug("[Weavero] _wvReaderAddSelectedText err: " + e); }
    }

    /** Append reader-context-menu items (called from reader.ts
     *  _viewContextHandlerImpl): bookmark current position / selection. */
    _wvReaderViewContextMenu(event: any) {
        try {
            const { append, reader } = event || {};
            if (typeof append !== "function" || !reader) return;
            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            const idoc = iwin && iwin.document;
            let text = "";
            try { text = String(reader._internalReader._state.primaryViewSelectionPopup.annotation.text || "").trim(); } catch (_) {}
            const icon = this._wvReaderBmMenuIconURL();
            // With a text selection, offer to bookmark the selected text (which
            // also highlights it on click). Otherwise, bookmark the position.
            if (text) {
                const LABEL = "Add Selected Text to Bookmarks";
                append({ label: LABEL, onCommand: () => this._wvReaderAddSelectedText(reader) });
                this._wvReaderStampMenuIcon(reader, LABEL, icon);
            } else {
                const LABEL = "Add Bookmark to This Position";
                // Snapshot the exact click point NOW (params are stale by command
                // time): the cursor's x/y (chrome coords, → any point on the page,
                // text or whitespace) plus the word position as a fallback.
                let click: any = null;
                try {
                    const params = event.params || {};
                    const pp = params.position || (params.overlay && params.overlay.position);
                    click = {
                        position: pp ? JSON.parse(JSON.stringify(pp)) : null,
                        x: (typeof params.x === "number") ? params.x : null,
                        y: (typeof params.y === "number") ? params.y : null,
                    };
                } catch (_) {}
                append({ label: LABEL, onCommand: () => this._wvReaderAddCurrentBookmark(reader, idoc, click) });
                this._wvReaderStampMenuIcon(reader, LABEL, icon);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderViewContextMenu err: " + e); }
    }

    /** Bookmark-ribbon data URI for the reader context-menu icon, themed to
     *  the reader window (the menu lives in chrome, so a baked-colour data URI
     *  is simplest). Same ribbon glyph as the Bookmarks tab. */
    _wvReaderBmMenuIconURL() {
        let dark = true;
        try { dark = this._detectUIDark(); } catch (_) {}
        const color = dark ? "#e3e3e3" : "#555555";
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" '
            + 'viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" '
            + 'stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
    }

    /** Stamp an icon onto a reader context-menu item (matched by label) once
     *  the popup renders — the reader's `append()` API carries no icon, so we
     *  decorate the rendered XUL menuitem (mirrors "Copy Link to This Page").
     *  The listener removes itself after stamping or a 3 s timeout. */
    _wvReaderStampMenuIcon(reader: any, label: string, iconURL: string) {
        try {
            const win = reader._window;
            const ps = reader._popupset;
            if (!win || !ps || typeof ps.addEventListener !== "function" || !iconURL) return;
            const st = (win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            const ct = (win.clearTimeout) ? win.clearTimeout.bind(win) : clearTimeout;
            let timer: any = null;
            const onShow = (ev: any) => {
                let done = false;
                try {
                    const popup = ev && ev.target;
                    const mi = popup && popup.querySelector
                        && popup.querySelector('menuitem[label="' + label + '"]');
                    if (mi) {
                        mi.classList.add("menuitem-iconic");
                        mi.setAttribute("image", iconURL);
                        done = true;
                    }
                } catch (_) { done = true; }
                if (done) {
                    try { ps.removeEventListener("popupshowing", onShow, true); } catch (_) {}
                    if (timer != null) { try { ct(timer); } catch (_) {} timer = null; }
                }
            };
            ps.addEventListener("popupshowing", onShow, true);
            timer = st(() => {
                try { ps.removeEventListener("popupshowing", onShow, true); } catch (_) {}
                timer = null;
            }, 3000);
        } catch (_) {}
    }

    /** Map a point in the PDF.js iframe (clientX/Y) to a precise PDF position
     *  `{pageIndex, rects:[[x,y,x,y]]}` — works anywhere on a page (mirrors
     *  pdf-view's pointerEventToPosition). Null if the point isn't over a page. */
    _wvReaderPdfPosFromPoint(pv: any, clientX: number, clientY: number) {
        try {
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            if (!app || !app.pdfViewer || !win) return null;
            const targets = win.document.elementsFromPoint(clientX, clientY) || [];
            let div: any = null;
            for (let i = 0; i < targets.length; i++) {
                const d = targets[i] && targets[i].closest && targets[i].closest(".page");
                if (d) { div = d; break; }
            }
            if (!div) return null;
            const pages = app.pdfViewer._pages;
            let pageIndex = -1;
            for (let i = 0; i < pages.length; i++) { if (pages[i] && pages[i].div === div) { pageIndex = i; break; } }
            if (pageIndex < 0) return null;
            const page = pages[pageIndex];
            const rect = div.getBoundingClientRect();
            const x = clientX + (div.scrollLeft || 0) - rect.left;
            const y = clientY + (div.scrollTop || 0) - rect.top;
            const r = page.viewport.convertToPdfPoint(x, y);
            return { pageIndex, rects: [[r[0], r[1], r[0], r[1]]] };
        } catch (_) { return null; }
    }

    /** Drop a location pin at a PDF position to flag a position bookmark's exact
     *  spot. It pops in, then fades after a moment — but stays alive while
     *  hovered, and can be DRAGGED to move the bookmark: on drop the new precise
     *  point is written back (`_bmReaderUpdatePosition`) and the list refreshes.
     *  Lives in the PDF.js iframe. No-op for non-PDF or if the page isn't ready. */
    _wvReaderShowPin(reader: any, position: any, bmId?: string) {
        try {
            if (!position || !Array.isArray(position.rects) || !position.rects.length) return;
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            if (!app || !app.pdfViewer || !win || !win.document) return;
            const pageIndex = position.pageIndex || 0;
            const pageView = app.pdfViewer._pages && app.pdfViewer._pages[pageIndex];
            if (!pageView || !pageView.div || !pageView.viewport) return;
            const rect = position.rects[0];
            const a = pageView.viewport.convertToViewportPoint(rect[0], rect[1]);
            const b = pageView.viewport.convertToViewportPoint(rect[2], rect[3]);
            const left = (a[0] + b[0]) / 2;
            const top = Math.min(a[1], b[1]);
            const doc = win.document;
            try { const old = doc.querySelector(".wv-reader-pin"); if (old) old.remove(); } catch (_) {}
            const pin: any = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            pin.className = "wv-reader-pin";
            pin.textContent = RP_PIN_EMOJI;
            pin.setAttribute("title", bmId ? "Drag to move this bookmark" : "");
            pin.style.cssText = "position:absolute;z-index:2147483646;"
                + (bmId ? "pointer-events:auto;cursor:grab;" : "pointer-events:none;")
                + "user-select:none;font-size:26px;line-height:1;left:" + left + "px;top:" + top + "px;"
                + "transform:translate(-50%,-118%) scale(.4);opacity:0;"
                + "transition:opacity .18s ease-out,transform .18s ease-out;"
                + "filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));";
            pageView.div.appendChild(pin);
            const raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : ((f: any) => win.setTimeout(f, 16));
            raf(() => { try { pin.style.opacity = "1"; pin.style.transform = "translate(-50%,-100%) scale(1)"; } catch (_) {} });

            // Lifecycle: fade after a beat, but pause while hovered/dragged so
            // there's time to grab it.
            let fadeT: any = null, killT: any = null;
            const stopFade = () => { try { win.clearTimeout(fadeT); win.clearTimeout(killT); } catch (_) {} fadeT = killT = null; };
            const startFade = (delay: number) => {
                stopFade();
                fadeT = win.setTimeout(() => { try { pin.style.transition = "opacity .25s,transform .25s"; pin.style.opacity = "0"; pin.style.transform = "translate(-50%,-118%) scale(.6)"; } catch (_) {} }, delay);
                killT = win.setTimeout(() => { try { pin.remove(); } catch (_) {} }, delay + 320);
            };
            startFade(2200);
            pin.addEventListener("mouseenter", () => { stopFade(); try { pin.style.transition = "transform .12s"; pin.style.opacity = "1"; pin.style.transform = "translate(-50%,-100%) scale(1)"; } catch (_) {} });
            pin.addEventListener("mouseleave", () => { if (!pin._wvDragging) startFade(900); });

            if (bmId) {
                const ridoc = reader._iframeWindow ? reader._iframeWindow.document
                    : (reader._iframe && reader._iframe.contentWindow && reader._iframe.contentWindow.document);
                const rootEl = doc.documentElement;
                const onDown = (e: any) => {
                    if (e.button !== 0) return;
                    e.preventDefault(); e.stopPropagation();
                    stopFade();
                    pin._wvDragging = true;
                    // Suppress text selection for the whole drag — otherwise the
                    // cursor sweeping the page selects text. user-select:none on
                    // the root + a selectstart blocker + clearing live ranges,
                    // and pointer capture so the text layer never sees the moves.
                    const prevUS = rootEl.style.userSelect;
                    rootEl.style.userSelect = "none";
                    try { rootEl.style.setProperty("-moz-user-select", "none"); } catch (_) {}
                    try { win.getSelection().removeAllRanges(); } catch (_) {}
                    const onSelStart = (se: any) => { se.preventDefault(); };
                    try { doc.addEventListener("selectstart", onSelStart, true); } catch (_) {}
                    const cleanup = () => {
                        try { doc.removeEventListener("selectstart", onSelStart, true); } catch (_) {}
                        rootEl.style.userSelect = prevUS;
                        try { rootEl.style.removeProperty("-moz-user-select"); } catch (_) {}
                    };
                    pin.style.transition = "none"; pin.style.opacity = "1"; pin.style.cursor = "grabbing";
                    pin.style.position = "fixed";
                    try { rootEl.appendChild(pin); } catch (_) {}
                    try { pin.setPointerCapture(e.pointerId); } catch (_) {}
                    const place = (cx: number, cy: number) => { pin.style.left = cx + "px"; pin.style.top = cy + "px"; pin.style.transform = "translate(-50%,-100%) scale(1)"; };
                    place(e.clientX, e.clientY);
                    const onMove = (ev: any) => { ev.preventDefault(); try { win.getSelection().removeAllRanges(); } catch (_) {} place(ev.clientX, ev.clientY); };
                    const onUp = (ev: any) => {
                        cleanup();
                        pin._wvDragging = false;
                        const newPos = this._wvReaderPdfPosFromPoint(pv, ev.clientX, ev.clientY);
                        try { pin.remove(); } catch (_) {}
                        if (newPos) {
                            const att = this._wvReaderAtt(reader);
                            if (att) {
                                let pageLabel = "";
                                try { if (Array.isArray(pv._pageLabels) && pv._pageLabels[newPos.pageIndex]) pageLabel = pv._pageLabels[newPos.pageIndex]; } catch (_) {}
                                if (!pageLabel) pageLabel = String((newPos.pageIndex || 0) + 1);
                                this._bmReaderUpdatePosition(att.libraryID, att.itemKey, bmId,
                                    { position: newPos, pageLabel, label: "Page " + pageLabel })
                                    .then(() => { try { if (ridoc) this._wvReaderRenderBmList(reader, ridoc); } catch (_) {} });
                            }
                            // Re-drop the pin where it landed (then it fades).
                            this._wvReaderShowPin(reader, newPos, bmId);
                        }
                    };
                    const onCancel = () => { cleanup(); pin._wvDragging = false; try { pin.remove(); } catch (_) {} };
                    pin.addEventListener("pointermove", onMove);
                    pin.addEventListener("pointerup", onUp);
                    pin.addEventListener("pointercancel", onCancel);
                };
                pin.addEventListener("pointerdown", onDown, true);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderShowPin err: " + e); }
    }

    /** Capture the reader's current location as a bookmark record. */
    _wvCaptureReaderLocation(reader: any) {
        const type = reader._type || "pdf";
        const ir = reader._internalReader;
        if (type === "pdf") {
            let pageIndex: any = null, pageLabel = "";
            // Prefer the PDF viewer's LIVE current page (the debounced
            // primaryViewStats can lag a navigation by a frame or two).
            try {
                const pv = ir._primaryView || ir._lastView;
                const app = pv && pv._iframeWindow && pv._iframeWindow.PDFViewerApplication;
                if (app && app.pdfViewer) pageIndex = app.pdfViewer.currentPageNumber - 1;
                if (pageIndex != null && pv && Array.isArray(pv._pageLabels)) {
                    pageLabel = pv._pageLabels[pageIndex] || "";
                }
            } catch (_) {}
            if (pageIndex == null) {
                try { pageIndex = (ir._state.primaryViewStats || {}).pageIndex || 0; } catch (_) { pageIndex = 0; }
            }
            if (!pageLabel) {
                try { pageLabel = (ir._state.primaryViewStats || {}).pageLabel || ""; } catch (_) {}
            }
            if (!pageLabel) pageLabel = String((pageIndex || 0) + 1);
            return { viewType: "pdf", location: { pageIndex }, pageLabel, label: "Page " + pageLabel };
        }
        // EPUB / snapshot (DOM views): capture a live, full CFI.
        let cfi: any = null, offset: any = undefined;
        try {
            const v = ir._lastView || ir._primaryView;
            if (v && v.flow && v.flow.startCFI) {
                cfi = v.flow.startCFI.toString();
                offset = v.flow.startCFIOffset;
            }
        } catch (_) {}
        if (!cfi) { try { cfi = ir._state.primaryViewState.cfi; } catch (_) {} }
        let scrollYPercent: any = undefined;
        try { scrollYPercent = ir._state.primaryViewState.scrollYPercent; } catch (_) {}
        return {
            viewType: type,
            location: { cfi, cfiElementOffset: offset, scrollYPercent },
            pageLabel: "",
            label: "Bookmark",
        };
    }

    async _wvReaderAddCurrentBookmark(reader: any, idoc: any, click?: any) {
        try {
            const att = this._wvReaderAtt(reader);
            if (!att) return;
            const rec: any = this._wvCaptureReaderLocation(reader);
            rec.type = "position";
            // Store a PRECISE position (the exact clicked point — text OR
            // whitespace) so the bookmark returns to that spot and drops the pin
            // there, not at the page top. (EPUB/snapshot use the CFI location.)
            const pos = this._wvCaptureReaderPosition(reader, click);
            if (pos) {
                rec.position = pos;
                // Page label from the resolved page, in case it differs from the
                // viewport-top page captured by _wvCaptureReaderLocation.
                try {
                    const pv = reader._internalReader._primaryView || reader._internalReader._lastView;
                    if (pv && Array.isArray(pv._pageLabels) && pv._pageLabels[pos.pageIndex]) {
                        rec.pageLabel = pv._pageLabels[pos.pageIndex];
                        rec.label = "Page " + rec.pageLabel;
                    }
                } catch (_) {}
            }
            await this._bmReaderAdd(att.libraryID, att.itemKey, rec);
            this._wvReaderRenderBmList(reader, idoc);
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderAddCurrentBookmark err: " + e);
        }
    }

    /** A precise PDF position for a "this position" bookmark, resolved in order:
     *  1. the EXACT clicked point (`click.x/y`, chrome coords) mapped to a PDF
     *     point via the page under the cursor — works ANYWHERE on the page,
     *     text or whitespace (mirrors pdf-view's `pointerEventToPosition`);
     *  2. the word position under the cursor (`click.position`, has rects);
     *  3. a point at the current viewport top (PDF viewer `_location`).
     *  Returns null for non-PDF or on failure → caller falls back to the
     *  page/CFI location from `_wvCaptureReaderLocation`. */
    _wvCaptureReaderPosition(reader: any, click?: any) {
        try {
            if ((reader._type || "pdf") !== "pdf") {
                return (click && click.position && Number.isInteger(click.position.pageIndex)) ? click.position : null;
            }
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            if (!app || !app.pdfViewer || !win) return null;

            // 1) Exact clicked point → PDF point (anywhere on the page).
            if (click && typeof click.x === "number" && typeof click.y === "number" && pv._iframe) {
                try {
                    const br = pv._iframe.getBoundingClientRect();
                    const pos = this._wvReaderPdfPosFromPoint(pv, click.x - br.x, click.y - br.y);
                    if (pos) return pos;
                } catch (_) {}
            }
            // 2) Word position under the cursor.
            if (click && click.position && Number.isInteger(click.position.pageIndex)
                && Array.isArray(click.position.rects)) {
                return click.position;
            }
            // 3) Viewport top (last resort).
            const loc = app.pdfViewer._location;
            if (loc && Number.isInteger(loc.pageNumber)) {
                const left = Math.max((typeof loc.left === "number") ? loc.left : 0, 8);
                const top = (typeof loc.top === "number") ? loc.top : 0;
                return { pageIndex: loc.pageNumber - 1, rects: [[left, Math.max(0, top - 12), left + 12, top]] };
            }
        } catch (_) {}
        return null;
    }

    _wvNavigateReaderLocation(reader: any, bm: any) {
        try {
            if (bm && bm.position) {
                if (bm.type === "position") {
                    // Scroll precisely WITHOUT the built-in highlight box, then
                    // drop a temporary pin marking the exact spot.
                    let scrolled = false;
                    try {
                        const pv = reader._internalReader
                            && (reader._internalReader._primaryView || reader._internalReader._lastView);
                        if (pv && typeof pv.navigateToPosition === "function") {
                            pv.navigateToPosition(bm.position); scrolled = true;
                        }
                    } catch (_) {}
                    if (!scrolled) { try { reader.navigate({ position: bm.position }); } catch (_) {} }
                    this._wvReaderShowPin(reader, bm.position, bm.id);
                    return;
                }
                // A stored selection position scrolls to AND highlights the
                // text (the same flash as navigating to an annotation). Works
                // for PDF (rects) and EPUB/snapshot (selector) alike.
                reader.navigate({ position: bm.position });
                return;
            }
            const loc = bm && bm.location;
            if (!loc) return;
            if (bm.viewType === "pdf") {
                reader.navigate({ pageIndex: loc.pageIndex || 0 });
            } else if (loc.cfi) {
                reader.navigate({ pageNumber: loc.cfi });
            } else if (typeof loc.scrollYPercent === "number") {
                reader.navigate({ scrollYPercent: loc.scrollYPercent });
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvNavigateReaderLocation err: " + e);
        }
    }
}

const _readerPanelsDescriptors = Object.getOwnPropertyDescriptors(_ReaderPanelsMixin.prototype);
delete (_readerPanelsDescriptors as any).constructor;
export const readerPanelsMethods = _readerPanelsDescriptors;
