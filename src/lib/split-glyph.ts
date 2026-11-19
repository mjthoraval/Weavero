// The split view's menu icons (MJT 2026-11-18: "Add an icon for the split view
// menus"): 16px, one-pixel lines in `context-fill`, so Zotero's menu CSS paints
// them like its own menu icons (scss/components/_menu.scss: menu images expose
// fill; the link glyph does the same, lib/link-glyph.ts). Zotero ships no split
// drawing (16/universal, checked 2026-11-18) and Firefox's icons are not in the
// mirror, so they are drawn here, in the manner of Zotero's 16/universal set
// (1px lines on the half pixel, 1.5px corner radius):
//   - WV_SPLIT_ICON: a window cut in two panes -- Add Split View, Open in Split
//     View;
//   - WV_SPLIT_SEPARATE_ICON: the two panes apart -- Separate Split View,
//     Separate Tabs;
//   - WV_SPLIT_REVERSE_ICON: two arrows, one each way -- Reverse Tabs.
// The left pane of the two pane glyphs is drawn in Zotero's accent blue, as the
// side you are on is framed in it in a split (tab-split.ts .wv-tsplit-active) --
// MJT 2026-11-18: "add the blue color on the split view icon, mirroring the fact
// that one side of the split view is focused ... It will make the icon more easily
// recognisable". The blue is fixed (context-fill is one colour): Zotero's
// --accent-blue, #4072e5, readable on the light and the dark menu.
// No "(", ")" or "'" in the markup: MenuManager writes an icon into `url(...)`
// unquoted (menuManager.js --custom-menu-icon-light), and encodeURIComponent
// leaves those characters as they are.

const WV_SPLIT_BLUE = "#4072e5";

function wvGlyphUri(body: string): string {
    return "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="context-fill" stroke-width="1">'
        + body + "</svg>");
}

export const WV_SPLIT_ICON = wvGlyphUri(
    // The right pane in the menu's colour, the left one -- the side you are on -- in blue.
    '<path d="M8 2.5h5a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8"/>'
    + '<path d="M8 2.5H3A1.5 1.5 0 0 0 1.5 4v8A1.5 1.5 0 0 0 3 13.5h5z" stroke="' + WV_SPLIT_BLUE + '"/>');

export const WV_SPLIT_SEPARATE_ICON = wvGlyphUri(
    '<rect x="0.5" y="2.5" width="6" height="11" rx="1.5" stroke="' + WV_SPLIT_BLUE + '"/>'
    + '<rect x="9.5" y="2.5" width="6" height="11" rx="1.5"/>');

export const WV_SPLIT_REVERSE_ICON = wvGlyphUri(
    '<path d="M2 5.5h11.5M11 3l2.5 2.5L11 8"/>'
    + '<path d="M14 10.5H2.5M5 8l-2.5 2.5L5 13"/>');
