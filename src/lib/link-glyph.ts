// The links glyph, one source for every surface that says "link" (MJT
// 2026-10-23): Weavero's own icon (src/icons/icon.svg) WITHOUT its needle
// and thread -- the two interlocking chain links only, stroked. Until then
// the link marker was the whole Weavero logo, which read as "Weavero"
// rather than "link"; and Zotero's two-link chain (16/universal/related.svg)
// means Related, so it is never used for links.
//
// Backlinks draw the same chain with an arrow pointing into it from the
// corner the thread used to fill -- a link coming back.
//
// Stroke-based on a 24-unit grid (the logo's). `paint` is any SVG paint:
// `currentColor` for inline SVG that follows the text colour, `context-fill`
// for images whose host exposes `-moz-context-properties: fill` (Zotero's
// own attachment.svg strokes with context-fill the same way), or a hex
// colour where the host paints the image as is.

import { wvSvgEl } from "./svg";
import { WV_LINK_PALETTE } from "./links";

export const WV_LINK_VIEWBOX = "0 0 24 24";

/** The two chain links, verbatim from src/icons/icon.svg. */
export const WV_LINK_CHAIN_PATHS = [
    "M10,12.76c1.65,2.21,4.79,2.66,7,1.01.19-.14.37-.3.54-.47l3-3c1.92-1.99,1.86-5.15-.12-7.07-1.94-1.87-5.01-1.87-6.95,0l-1.72,1.71",
    "M14,10.76c-1.65-2.21-4.79-2.66-7-1.01-.19.14-.37.3-.54.47l-3,3c-1.92,1.99-1.86,5.15.12,7.07,1.94,1.87,5.01,1.87,6.95,0l1.71-1.71",
];

/** Backlinks: the chain shrunk toward the top-left corner (its strokes
 *  widened by the inverse, so they still draw 2 units), and an arrow from
 *  the bottom-right corner pointing up-left into it. Three layouts were
 *  rendered at 16 px (2026-10-23); at full size the chain left room for a
 *  4-unit head only, which rasterised as a blob, and this one keeps a
 *  6.5-unit right-angled head. */
export const WV_BACKLINK_CHAIN_SCALE = 0.78;
export const WV_BACKLINK_ARROW_PATH = "M22,22L14.5,14.5M14.5,21V14.5H21";
/** Links (outgoing, the Links section): the same shrunk chain with the
 *  arrow on the same diagonal pointing OUT of it, its head at the
 *  bottom-right corner -- a link leaving (2026-10-27). */
export const WV_OUTLINK_ARROW_PATH = "M14.5,14.5L22,22M22,15.5V22H15.5";
/** An internal link (both ends in one item; MJT 2026-10-29, "Try option 2
 *  and also option 4 with an icon"): the same shrunk chain with a U-turn in
 *  that corner -- a link that leaves and comes back, at once a Link and a
 *  Backlink of the item. Picked of four corner layouts rendered at 12-16 px
 *  (a circle, a return arrow and a lone loop read as a blob or as refresh). */
export const WV_LOOPLINK_ARROW_PATH = "M14,13.5H18.5A3.25,3.25 0 0 1 18.5,20H13M15.8,17.2L13,20L15.8,22.8";
/** A broken link (its item gone, its group library not in this profile;
 *  the Links header's count, MJT 2026-10-30 "Icon A"): the same shrunk
 *  chain with an x in that corner. Picked of three drawn at 14 px (a corner
 *  "!", the whole chain pulled apart). */
export const WV_BROKENLINK_MARK_PATH = "M15,15L21,21M21,15L15,21";
/** Which mark the chain carries: none (the plain links glyph), `true`
 *  (a backlink, pointing in), "out" (an outgoing link), "loop" (an internal
 *  one) or "broken". */
export type WvLinkGlyphArrow = boolean | "out" | "loop" | "broken" | undefined;

/** The two makes of item link, named with Zotero's words -- a Zotero link
 *  (a zotero:// address; Zotero's "Include Zotero Links") and a note
 *  citation (a citation or an annotation Zotero's note editor writes into a
 *  note) -- each by its own mark alone (MJT 2026-11-02, "For the link types
 *  icons, it is actually difficult to distinguish the 2. Drop the chain
 *  icon, and keep only "z" (lowercase) and """; the chain with a corner Z
 *  or quote mark in dev.144-152): a lowercase z, stroked as the chain is; a
 *  closing quote mark, Zotero's own -- the bottom-right marks of
 *  16/universal/cite.svg, the note editor's Insert Citation icon -- filled,
 *  scaled to the 24-unit grid by WV_CITE_KIND_TRANSFORM. The chain alone
 *  names the Item Links and Backlinks sections. */
export type WvRefMark = "zotero" | "cite";
export const WV_ZLINK_KIND_PATH = "M7,9.5H17L7,19.5H17";
export const WV_CITE_KIND_PATH = "M13 12H11V14H12L11.5 15.5H12.5L13 14V12ZM16 12H14V14H15L14.5 15.5H15.5L16 14V12Z";
const WV_CITE_KIND_TRANSFORM = "translate(-28.5,-29.25) scale(3)";

/** `tight`: the box drawn around the mark alone (both marks sit in the
 *  grid's 4-20 square), for a small glyph beside an arrow (the section
 *  rows, 2026-11-03) -- on the full grid a 10-px glyph would show a 4-px z. */
export const WV_REF_MARK_TIGHT_VIEWBOX = "4 5 16 16";

/** The z in the colour a Zotero link's address is written in, wherever it
 *  is drawn -- the Item Links header's count, the hover card's label and
 *  arrow (MJT 2026-11-03, "Make the z icon in the Zotero link color
 *  everywhere"): the `--wv-link-zotero` variable the main window defines
 *  per theme, its light value where a document has none. On the glyph
 *  itself, so a host's own colour (a count's grey, a selected count's
 *  primary text) never reaches it; the quote mark keeps the host's. */
export const WV_ZLINK_MARK_COLOR = "var(--wv-link-zotero, " + WV_LINK_PALETTE.zotero.light + ")";

export function wvRefMarkGlyphEl(doc: any, mark: WvRefMark, opts?: { cls?: string; paint?: string; size?: number; tight?: boolean; stroke?: string }): any {
    const o = opts || {};
    const paint = o.paint || "currentColor";
    const attrs: any = { viewBox: o.tight ? WV_REF_MARK_TIGHT_VIEWBOX : WV_LINK_VIEWBOX, "aria-hidden": "true", fill: "none" };
    if (o.cls) attrs.class = o.cls;
    if (mark === "zotero" && !o.paint) attrs.style = "color: " + WV_ZLINK_MARK_COLOR;
    if (o.size) { attrs.width = o.size; attrs.height = o.size; }
    const svg = wvSvgEl(doc, "svg", attrs);
    if (mark === "cite") wvSvgEl(doc, "path", { d: WV_CITE_KIND_PATH, fill: paint, stroke: "none", transform: WV_CITE_KIND_TRANSFORM }, svg);
    // `stroke`: the z's stroke width in grid units (2.2, the chain's; a
    // 10-px glyph takes 3, or its 1.4-px line fades).
    else wvSvgEl(doc, "path", Object.assign({ d: WV_ZLINK_KIND_PATH, stroke: paint, "stroke-width": o.stroke || "2.2" }, LINE), svg);
    return svg;
}

// Every drawn node carries fill="none" and its stroke ITSELF: the filter
// tiles' `.wv-filter-svg` rule sets `fill: currentColor` on the <svg>,
// which beats the root's presentation attribute and would flood open
// stroke paths (the old rectangle tile set them per child for this).
const LINE = { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };

function parts(paint: string, arrow?: WvLinkGlyphArrow): Array<{ tag: string; attrs: any; kids?: string[] }> {
    const d = arrow === "out" ? WV_OUTLINK_ARROW_PATH : arrow === "loop" ? WV_LOOPLINK_ARROW_PATH : arrow === "broken" ? WV_BROKENLINK_MARK_PATH : arrow ? WV_BACKLINK_ARROW_PATH : null;
    const s = d ? WV_BACKLINK_CHAIN_SCALE : 1;
    const g: any = Object.assign({ stroke: paint, "stroke-width": String(+(2 / s).toFixed(3)) }, LINE);
    if (s !== 1) g.transform = "scale(" + s + ")";
    const out: Array<{ tag: string; attrs: any; kids?: string[] }> = [{ tag: "g", attrs: g, kids: WV_LINK_CHAIN_PATHS }];
    if (d) out.push({ tag: "path", attrs: Object.assign({ d, stroke: paint, "stroke-width": "2" }, LINE) });
    return out;
}

/** Inline <svg> of the links glyph (or the backlinks / outgoing-links
 *  glyph), stroked with `paint` (default currentColor). */
export function wvLinkGlyphEl(doc: any, opts?: { cls?: string; paint?: string; backlink?: WvLinkGlyphArrow; size?: number }): any {
    const o = opts || {};
    const attrs: any = { viewBox: WV_LINK_VIEWBOX, "aria-hidden": "true", fill: "none" };
    if (o.cls) attrs.class = o.cls;
    if (o.size) { attrs.width = o.size; attrs.height = o.size; }
    const svg = wvSvgEl(doc, "svg", attrs);
    for (const part of parts(o.paint || "currentColor", o.backlink)) {
        const el = wvSvgEl(doc, part.tag, part.attrs, svg);
        for (const d of part.kids || []) wvSvgEl(doc, "path", { d, fill: "none" }, el);
    }
    return svg;
}

/** Has External Link's icon (MJT 2026-10-30, "Make a special icon for Has
 *  External Link" -> "B: box + arrow out", of three drawn at 16 px: the
 *  chain with a globe, this, the chain with a small box-and-arrow): the
 *  usual "leaves the app" mark, a box with an arrow out of its corner. The
 *  chain stays the link marker's and Has Item Links'. Same 24-unit grid
 *  and 2-unit strokes as the chain. */
export const WV_EXTLINK_PATHS = [
    "M14,3.5H20.5V10",
    "M20.5,3.5L11,13",
    "M18,14.5V19.5A1.5,1.5 0 0 1 16.5,21H4.5A1.5,1.5 0 0 1 3,19.5V7.5A1.5,1.5 0 0 1 4.5,6H9.5",
];

export function wvExternalLinkGlyphEl(doc: any, opts?: { cls?: string; paint?: string; size?: number }): any {
    const o = opts || {};
    const attrs: any = { viewBox: WV_LINK_VIEWBOX, "aria-hidden": "true", fill: "none" };
    if (o.cls) attrs.class = o.cls;
    if (o.size) { attrs.width = o.size; attrs.height = o.size; }
    const svg = wvSvgEl(doc, "svg", attrs);
    const g = wvSvgEl(doc, "g", Object.assign({ stroke: o.paint || "currentColor", "stroke-width": "2" }, LINE), svg);
    for (const d of WV_EXTLINK_PATHS) wvSvgEl(doc, "path", { d, fill: "none" }, g);
    return svg;
}

/** The same as an SVG data: URI (the External Links column's header). */
export function wvExternalLinkGlyphUri(paint: string, size: number): string {
    const line = Object.keys(LINE).map(k => " " + k + '="' + (LINE as any)[k] + '"').join("");
    return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size
        + '" viewBox="' + WV_LINK_VIEWBOX + '" fill="none" aria-hidden="true"><g stroke="' + paint + '" stroke-width="2"' + line + ">"
        + WV_EXTLINK_PATHS.map(d => '<path d="' + d + '" fill="none"/>').join("") + "</g></svg>");
}

/** The same glyph as SVG markup (for innerHTML in HTML documents -- the
 *  reader's; chrome XML documents sanitise SVG out of innerHTML, use the
 *  element builder there). */
export function wvLinkGlyphMarkup(paint: string, size: number, backlink?: WvLinkGlyphArrow): string {
    const attr = (o: any) => Object.keys(o).map(k => " " + k + '="' + o[k] + '"').join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size
        + '" viewBox="' + WV_LINK_VIEWBOX + '" fill="none" aria-hidden="true">'
        + parts(paint, backlink).map(p => "<" + p.tag + attr(p.attrs) + ">"
            + (p.kids || []).map(d => '<path d="' + d + '" fill="none"/>').join("") + "</" + p.tag + ">").join("")
        + "</svg>";
}

/** The same glyph as an SVG data: URI (for <img>, column iconPath, CSS
 *  background, menu images). */
export function wvLinkGlyphUri(paint: string, size: number, backlink?: WvLinkGlyphArrow): string {
    return "data:image/svg+xml," + encodeURIComponent(wvLinkGlyphMarkup(paint, size, backlink));
}

/** The copy-link menu entries' icon ("Copy Select Link", "Copy Open
 *  Link", "Copy Collection Link", "Copy Link to This Page", ...): stroked in
 *  `context-fill`, which Zotero's menu CSS paints like its own menu icons
 *  (scss/components/_menu.scss: `menupopup :is(image, .menu-icon)` exposes
 *  fill, `--fill-secondary`). They carried the Weavero logo until
 *  2026-10-23 (MJT: "Ok" to the links icon). Mixed "Copy As" submenus keep
 *  the logo as the plugin's mark. */
export const WV_LINK_MENU_ICON = wvLinkGlyphUri("context-fill", 16);
