// The small LIBRARY BADGE Weavero puts on an icon or a mark to say which
// library a thing lives in: Zotero's library icon (collection-tree/16/
// library.svg, library-group.svg -- one temple drawing, blue #4072E5 for My
// Library, teal #59ADC4 for a group, the same in light and dark), redrawn
// bold: Zotero's own has 1px columns that blur when scaled down to badge
// size, so this one is a symmetric three-column temple centred on x8 that
// stays sharp at 8-12px.
//
// One drawing for every badge, edit here only:
//  - the tab strip and the List All Tabs dropdown, a group tab's item icon
//    (tabs.ts `_decorateTabBar`, `_wvGroupLibBadgeSvg`), as a data: URI;
//  - the references' marks (refs.ts): a cited paper whose only copies are
//    in other libraries than the citing paper's carries the badge of the
//    library its best copy is in, drawn inline (`wvLibBadgeEl`).

import { wvSvgEl } from "./svg";

/** The temple, in a 16x16 box: roof, three columns, base. */
export const WV_LIB_BADGE_SHAPES: ReadonlyArray<[string, Record<string, string>]> = [
    ["path", { d: "M8 1.5L13.5 6.5H2.5Z" }],
    ["rect", { x: "3.5", y: "7", width: "2", height: "6" }],
    ["rect", { x: "7", y: "7", width: "2", height: "6" }],
    ["rect", { x: "10.5", y: "7", width: "2", height: "6" }],
    ["rect", { x: "2", y: "13", width: "12", height: "2" }],
];

/** Zotero's library colours: My Library's blue, the groups' teal. */
export const WV_LIB_BADGE_FILL: Record<"user" | "group", string> = { user: "#4072e5", group: "#59adc4" };

/** The badge as SVG markup (for a data: URI). */
export function wvLibBadgeMarkup(kind: "user" | "group"): string {
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='" + WV_LIB_BADGE_FILL[kind] + "'>"
        + WV_LIB_BADGE_SHAPES.map(([tag, attrs]) => "<" + tag + Object.keys(attrs).map((k) => " " + k + "='" + attrs[k] + "'").join("") + "/>").join("")
        + "</svg>";
}

/** The group-library badge's markup, the tab strip's since it was drawn. */
export const WV_GROUPLIB_BADGE_SVG = wvLibBadgeMarkup("group");

/** The badge as an inline <svg> of `doc` (any document: the reader's page,
 *  a PDF view, the item pane), `data-wv-lib` = `kind`, appended to `parent`
 *  when given. */
export function wvLibBadgeEl(doc: any, kind: "user" | "group", parent?: any): any {
    const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", fill: WV_LIB_BADGE_FILL[kind], "data-wv-lib": kind }, parent);
    for (const [tag, attrs] of WV_LIB_BADGE_SHAPES) wvSvgEl(doc, tag, attrs, svg);
    return svg;
}
