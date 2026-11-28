// The pure parts of the Graphical Abstract section (modules/feeds-graphical.ts):
// which pictures a feed abstract carries, the abstract without them, what the
// fetched bytes are, and how big to draw them.
//
// A feed's abstract is publisher HTML (Journal of Fluid Mechanics: a
// `<div class="abstract" data-abstract-type="graphical">` whose first `<p>`
// holds the figure's `<img>`). It is parsed with a DOMParser of a chrome
// window: such a document is loaded as data -- no script runs and nothing it
// names is fetched -- and only read here.

/** One picture of an abstract: its absolute http(s) address and its alt text. */
export interface WvGaPic { src: string; alt: string }

/** An abstract that carries pictures: them, and the abstract without them. */
export interface WvGaParsed { pics: WvGaPic[]; stripped: string }

/** At most this many pictures of one abstract are shown (each its own frame). */
export const WV_GA_MAX_PICS = 4;

/** The full-size view keeps this much of the window free around the picture (px). */
export const WV_GA_LB_MARGIN = 32;

/** A declared width or height at or below this is a tracking pixel, not a
 *  picture (feed services append a 1x1 image to their entries). */
const PIXEL_MAX = 2;

/** `src` as an absolute http(s) address (resolved against `base`, the feed's
 *  own address, as Zotero's abstract resolves it through its <base>), or null:
 *  any other scheme -- data:, file:, chrome:, javascript:, blob: -- is not a
 *  picture this section loads. */
export function wvGaPictureURL(src: string | null | undefined, base?: string | null): string | null {
    const s = String(src == null ? "" : src).trim();
    if (!s) return null;
    let u: any = null;
    // A base that is no address itself (a feed without one) leaves an
    // absolute `src` absolute and a relative one unresolvable.
    try { u = base ? new URL(s, base) : null; }
    catch (e) { u = null; }
    if (!u) {
        try { u = new URL(s); }
        catch (e) { return null; }
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return String(u.href);
}

const declared = (img: any, attr: string): number => {
    const n = parseInt(String(img.getAttribute(attr) || ""), 10);
    return isFinite(n) ? n : 0;
};

/** Nothing left worth showing: no text but white space, no element but <br>. */
const isEmpty = (el: any): boolean => {
    if (String(el.textContent || "").trim()) return false;
    for (const c of Array.from(el.children || []) as any[]) {
        if (String(c.localName || "").toLowerCase() !== "br") return false;
    }
    return true;
};

/** The pictures of the abstract `html` (null when it carries none), and the
 *  abstract without them: each picture's <img> removed, with the wrappers it
 *  leaves empty (JFM's `<p style="float: left;">`). An image this section does
 *  not show (another scheme, a tracking pixel) stays where it is. `Parser`:
 *  a window's DOMParser constructor. */
export function wvGaParse(html: string, base: string | null | undefined, Parser: any): WvGaParsed | null {
    const s = String(html == null ? "" : html);
    if (!/<img\b/i.test(s) || typeof Parser !== "function") return null;
    let doc: any = null;
    try { doc = new Parser().parseFromString(s, "text/html"); }
    catch (e) { return null; }
    const body = doc && doc.body;
    if (!body) return null;
    const pics: WvGaPic[] = [];
    for (const img of Array.from(body.querySelectorAll("img")) as any[]) {
        const src = wvGaPictureURL(img.getAttribute("src"), base);
        if (!src) continue;
        const w = declared(img, "width"), h = declared(img, "height");
        if ((w > 0 && w <= PIXEL_MAX) || (h > 0 && h <= PIXEL_MAX)) continue;
        // Only what the section shows leaves the abstract: a picture past the
        // section's limit stays in it (the same address twice is shown once).
        const dup = pics.some((p) => p.src === src);
        if (!dup && pics.length >= WV_GA_MAX_PICS) continue;
        if (!dup) pics.push({ src, alt: String(img.getAttribute("alt") || "").replace(/\s+/g, " ").trim() });
        let up: any = img.parentNode;
        img.remove();
        while (up && up !== body && isEmpty(up)) {
            const next = up.parentNode;
            up.remove();
            up = next;
        }
    }
    if (!pics.length) return null;
    return { pics, stripped: String(body.innerHTML) };
}

/** What a picture's bytes are, read from their first bytes (never from the
 *  server's word alone: static hosts send octet-stream): the type and, where
 *  the header says it, the natural size (0 when it does not). SVG is taken
 *  only when the server calls it SVG and it starts as one. null: not a
 *  picture. */
export function wvGaSniff(b: Uint8Array, contentType?: string): { mime: string; w: number; h: number } | null {
    if (!b || !b.length) return null;
    const n = b.length;
    const at = (i: number) => (i < n ? b[i] : 0);
    const ascii = (i: number, len: number) => { let s = ""; for (let k = 0; k < len; k++) s += String.fromCharCode(at(i + k)); return s; };
    const be16 = (i: number) => (at(i) << 8) | at(i + 1);
    const be32 = (i: number) => ((at(i) << 24) >>> 0) + (at(i + 1) << 16) + (at(i + 2) << 8) + at(i + 3);
    const le16 = (i: number) => at(i) | (at(i + 1) << 8);
    const le24 = (i: number) => at(i) | (at(i + 1) << 8) | (at(i + 2) << 16);
    const sane = (w: number, h: number) => (w > 0 && h > 0 && w <= 65535 && h <= 65535 ? [w, h] : [0, 0]);
    // PNG: the signature, then IHDR's width and height.
    if (at(0) === 0x89 && ascii(1, 3) === "PNG" && at(4) === 0x0D && at(5) === 0x0A) {
        const [w, h] = ascii(12, 4) === "IHDR" ? sane(be32(16), be32(20)) : [0, 0];
        return { mime: "image/png", w, h };
    }
    // GIF87a / GIF89a: the logical screen's size.
    if (ascii(0, 4) === "GIF8" && (at(4) === 0x37 || at(4) === 0x39) && at(5) === 0x61) {
        const [w, h] = sane(le16(6), le16(8));
        return { mime: "image/gif", w, h };
    }
    // JPEG: the first start-of-frame marker's size.
    if (at(0) === 0xFF && at(1) === 0xD8 && at(2) === 0xFF) {
        let i = 2, w = 0, h = 0;
        for (let guard = 0; i + 9 < n && guard < 10000; guard++) {
            if (at(i) !== 0xFF) { i++; continue; }
            const m = at(i + 1);
            if (m === 0xFF) { i++; continue; }
            if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
            if (m === 0xD9 || m === 0xDA) break;
            if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
                [w, h] = sane(be16(i + 7), be16(i + 5));
                break;
            }
            const len = be16(i + 2);
            if (len < 2) break;
            i += 2 + len;
        }
        return { mime: "image/jpeg", w, h };
    }
    // WebP: RIFF....WEBP, then a VP8 / VP8L / VP8X chunk.
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
        const c = ascii(12, 4);
        let w = 0, h = 0;
        if (c === "VP8 ") [w, h] = sane(le16(26) & 0x3FFF, le16(28) & 0x3FFF);
        else if (c === "VP8L") [w, h] = sane(1 + (((at(22) & 0x3F) << 8) | at(21)), 1 + (((at(24) & 0x0F) << 10) | (at(23) << 2) | ((at(22) & 0xC0) >> 6)));
        else if (c === "VP8X") [w, h] = sane(1 + le24(24), 1 + le24(27));
        return { mime: "image/webp", w, h };
    }
    // BMP: the info header's width and height (a negative height is top-down).
    if (ascii(0, 2) === "BM" && n > 26) {
        const w = (at(18) | (at(19) << 8) | (at(20) << 16) | (at(21) << 24));
        const h = (at(22) | (at(23) << 8) | (at(24) << 16) | (at(25) << 24));
        const [sw, sh] = sane(Math.abs(w), Math.abs(h));
        return { mime: "image/bmp", w: sw, h: sh };
    }
    // AVIF: an ISO-BMFF file of brand avif / avis (its size is deep in the boxes).
    if (ascii(4, 4) === "ftyp" && (ascii(8, 4) === "avif" || ascii(8, 4) === "avis")) return { mime: "image/avif", w: 0, h: 0 };
    if (/^\s*image\/svg\+xml\b/i.test(String(contentType || "")) && /<svg[\s>]/i.test(ascii(0, Math.min(n, 1024)))) return { mime: "image/svg+xml", w: 0, h: 0 };
    return null;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** `bytes` as a data: URI of type `mime` (one of wvGaSniff's). */
export function wvGaDataURI(mime: string, bytes: Uint8Array): string {
    const out: string[] = [];
    let chunk = "";
    const n = bytes.length;
    for (let i = 0; i < n; i += 3) {
        const a = bytes[i], b = i + 1 < n ? bytes[i + 1] : 0, c = i + 2 < n ? bytes[i + 2] : 0;
        chunk += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
            + (i + 1 < n ? B64[((b & 15) << 2) | (c >> 6)] : "=")
            + (i + 2 < n ? B64[c & 63] : "=");
        if (chunk.length >= 65536) { out.push(chunk); chunk = ""; }
    }
    out.push(chunk);
    return "data:" + mime + ";base64," + out.join("");
}

/** The size to draw a `w` x `h` picture at, inside `maxW` x `maxH`: its own
 *  size when it fits, else scaled down to fit, proportions kept. [0, 0] when
 *  its size is not known. */
export function wvGaFit(w: number, h: number, maxW: number, maxH: number): [number, number] {
    if (!(w > 0 && h > 0) || !(maxW > 0 && maxH > 0)) return [0, 0];
    const k = Math.min(1, maxW / w, maxH / h);
    return [Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k))];
}

/** `s` as an HTML attribute value (between double quotes). */
export function wvGaAttr(s: string): string {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
