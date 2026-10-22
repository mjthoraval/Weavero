// One SVG element builder (survey 2026-10-06 §4 #10). Twenty-odd local
// `NS` / `SVG_NS` / `NS_SVG` / `SVG` constants spelled the namespace out
// before each hand-built icon, followed by a setAttribute chain and an
// appendChild; the builder takes the attributes as one object (numbers
// stringified) and appends to a parent when given. Markup strings
// (`<svg xmlns=...>` in innerHTML / data: URLs) are data, not builders,
// and stay as they are.

export const WV_SVG_NS = "http://www.w3.org/2000/svg";

/** An SVG element in `doc`'s SVG namespace with `attrs` set (values
 *  stringified: a number is a valid width or coordinate), appended to
 *  `parent` when given. */
export function wvSvgEl(doc: any, tag: string, attrs?: { [name: string]: string | number }, parent?: any): any {
    const el: any = doc.createElementNS(WV_SVG_NS, tag);
    if (attrs) for (const k of Object.keys(attrs)) el.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(el);
    return el;
}
