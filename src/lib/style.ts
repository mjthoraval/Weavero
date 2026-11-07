// Weavero stylesheets in Zotero documents.
//
// A skip-if-exists guard (`if (doc.getElementById(id)) return;`) keeps the
// PREVIOUS build's rules alive after a hot upgrade, and a version constant
// only works while someone remembers to bump it (src-ts.md "sheet replace";
// survey 2026-10-06 §3.2, ~15 injection sites in four spellings). One
// helper: find or create the element, write the text when it differs.

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** Library-view element ids Weavero's rules name. On a Zotero with its own windows
 *  every library tab but a window's first suffixes them with "-" + its tab id,
 *  "tab-" and random characters (libraryView.js init, tabs.js; zotero#6035), and
 *  ItemTree's own id the same way (itemTree.jsx `get id`). */
const WV_VIEW_IDS = [
    "zotero-items-pane-container", "zotero-toolbar-collection-tree", "zotero-collections-splitter",
    "zotero-collections-toolbar", "zotero-collections-search", "zotero-tag-selector-container",
    "zotero-view-item-sidenav", "zotero-collections-tree", "zotero-collections-pane", "zotero-items-splitter",
    "zotero-items-toolbar", "zotero-layout-switcher", "zotero-tag-selector", "item-tree-main-default",
    "zotero-items-tree", "zotero-items-pane", "zotero-item-pane", "zotero-view-item", "zotero-tb-search",
    "item-tree-main",
];
const WV_VIEW_ID_RE = new RegExp("#(" + WV_VIEW_IDS.join("|") + ")(?![\\w-])", "g");

/** A stylesheet's library-view ids, made to match every library tab: `#x` becomes
 *  `:is(#x, [id^="x-tab-"])`, the same specificity. Until 2026-11-07 a rule
 *  reached the window's first library tab alone: in a second one the multi-line
 *  titles did not wrap, so their rows were measured back to one line. */
export function wvViewIdsCss(css: string): string {
    return css.replace(WV_VIEW_ID_RE, (_m, id) => ':is(#' + id + ',[id^="' + id + '-tab-"])');
}

/** Inject (or refresh) the stylesheet `id` in `doc`. Idempotent and cheap:
 *  the text is written only when it changed, so an "ensure" pass that runs
 *  on every apply costs a string compare. `parent` overrides the default
 *  host (`doc.head`, else the document element -- XUL documents have no
 *  head) but NOT the lookup, which is `doc.getElementById`: a shadow root
 *  host would get a new copy on every call (look it up in the root
 *  instead). Returns the element, or null without a document. */
export function wvInjectStyle(doc: any, id: string, css: string, parent?: any): any {
    if (!doc) return null;
    css = wvViewIdsCss(css);
    let st: any = doc.getElementById(id);
    if (st && st.localName !== "style") { try { st.remove(); } catch (e) {} st = null; }
    if (!st) {
        st = doc.createElementNS(HTML_NS, "style");
        st.id = id;
        (parent || doc.head || doc.documentElement).appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
    return st;
}

/** The option-tile rules of the filter popups (survey 2026-10-06 §4 #10):
 *  the library filter, the reader annotations filter, the bookmarks chip
 *  popup and the reader-window file-type popup each carried a copy of
 *  `.wv-filter-opt` -- idle, hover, selected (+hover), excluded (+hover: the
 *  diagonal slash), the 26x26 icon tile (4 px around a 16-px glyph, Zotero's
 *  glyph-in-button ratio; the height PINNED, since the reader iframe's
 *  line-height otherwise gave tiles of three heights, 2026-09-21) -- and
 *  two had drifted. `prefix` scopes the rules (`#wv-reader-filter-popup`,
 *  `.wv-bm-chip-popup`, "" for the library sheet); `dark` says how the
 *  surface signals a dark theme for the selected tile's brighter variant:
 *  the `wv-ui-dark` root class, the OS scheme, or not at all. */
export function wvFilterTileRules(prefix: string, dark: "class" | "media" | "none" = "none"): string[] {
    const p = prefix ? prefix + " " : "";
    const sel = p + ".wv-filter-opt[data-selected=\"true\"]";
    const exc = p + ".wv-filter-opt[data-excluded=\"true\"]";
    const slash = (line: string, wash: string) =>
        "background:linear-gradient(to top right,transparent calc(50% - 1px)," + line + " calc(50% - 1px)," + line + " calc(50% + 1px),transparent calc(50% + 1px))," + wash + ";";
    const out = [
        p + ".wv-filter-opt{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(127,127,127,0.4);background:transparent;color:inherit;font:inherit;font-size:12px;}",
        p + ".wv-filter-opt:hover{background:rgba(127,127,127,0.08);}",
        sel + "{background:rgba(94,106,210,0.34);border-color:rgba(94,106,210,0.95);box-shadow:inset 0 0 0 1px rgba(94,106,210,0.55);}",
        sel + ":hover{background:rgba(94,106,210,0.45);}",
        exc + "{border-color:rgba(220,72,72,0.7);" + slash("rgba(220,72,72,0.85)", "rgba(220,72,72,0.10)") + "}",
        exc + ":hover{" + slash("rgba(220,72,72,0.95)", "rgba(220,72,72,0.16)") + "}",
        p + ".wv-filter-opt-icon{padding:4px;min-width:26px;height:26px;box-sizing:border-box;justify-content:center;gap:0;}",
    ];
    const darkSel = [
        sel + "{background:rgba(120,134,255,0.40);border-color:rgba(150,162,255,1);box-shadow:inset 0 0 0 1px rgba(150,162,255,0.6);}",
        sel + ":hover{background:rgba(120,134,255,0.52);}",
    ];
    if (dark === "class") out.push(...darkSel.map((r) => ":root.wv-ui-dark " + r));
    else if (dark === "media") out.push("@media (prefers-color-scheme: dark){" + darkSel.join("") + "}");
    return out;
}

/** Remove the stylesheet `id` from `doc` if present. */
export function wvRemoveStyle(doc: any, id: string): void {
    try {
        const st = doc && doc.getElementById(id);
        if (st) st.remove();
    }
    catch (e) {}
}
