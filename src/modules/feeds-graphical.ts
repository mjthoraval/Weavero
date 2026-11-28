// Feeds: the Graphical Abstract section (MJT 2026-11-22, "Ok for the Graphical
// Abstract section").
//
// Some journals' feeds put a graphical abstract into the item's abstract (the
// Journal of Fluid Mechanics: `<div class="abstract" data-abstract-type=
// "graphical"><p style="float: left;"><img class="graphic" src="http://static.
// cambridge.org//content/...figAb.png"/></p><p>text</p></div>`), and Zotero
// draws picture and text together in its Abstract section. Here, for a feed
// item only (`item.isFeedItem`), a section of its own shows the picture alone,
// fitted to the pane's width; a click shows it full size over the window; and
// Zotero's Abstract section draws the text without it. A feed item without a
// picture gets no section and the Abstract Zotero draws; library items are
// never touched. Settings -> Weavero -> Feeds (`_wvFdOn`) switches it with the
// rest of the Feeds: off, the section goes and the Abstract draws everything
// again (feeds.ts _wvFdApply / _wvFdStop call `_wvGaApply` / `_wvGaStop`).
//
// THE ABSTRACT WITHOUT THE PICTURE. Zotero draws a feed abstract in
// AbstractBox#_renderFeedItem (elements/abstractBox.js, 11.0-beta.5:177-186,
// the same in 10.0.8): `await this._ensureFeedAbstractBrowserExists()`, then
// `this.item.library.url` and `this.item.getField('abstractNote')`, which it
// hands to its FeedAbstract actor's `setContent`. A layer on that method (the
// window's own abstract-box class, wvWrap layer "graphicalAbstract", beside
// WV-TEMP-feedabstract's "feedAbstract" layer of the citations branch) calls
// Zotero's method with a STAND-IN `this`: a Proxy of the section element whose
// `item` is a Proxy of the feed item answering getField('abstractNote') with
// the abstract minus the pictures this section shows (lib/graphical-abstract.ts
// wvGaParse) -- everything else read from the real element and the real item,
// any write to the item dropped. So: nothing is written to the item (a feed item
// is read-only anyway), no other code ever sees a changed item or element (the
// stand-in exists only as the `this` of that one call, across its awaits), and
// Zotero's own code does the drawing, in its own sandboxed browser. Should
// Zotero's method ever fail on the stand-in, it runs again on the real element:
// the Abstract then shows the picture as before.
//
// THE PICTURE, SAFELY. The bytes come from the publisher's server -- the address
// Zotero itself loads today to draw the abstract, which the Abstract now no
// longer loads -- through an anonymous request (Zotero.HTTP, `anon`: no cookie,
// and chrome code sends no Referer), http(s) addresses only, 10 MB at most;
// they are taken only when their first bytes say they are a picture
// (lib/graphical-abstract.ts wvGaSniff). They are DECODED and drawn in a
// browser made as Zotero makes its own feed-abstract browser: every sandbox
// flag (no script, no navigation, no form, no popup), the "feedAbstract"
// message-manager group, drawn by Zotero's own FeedAbstract actor (setContent:
// a <style> and one <img src="data:..." referrerpolicy="no-referrer">, built
// here, nothing of the feed's markup but an escaped alt text), and out of
// Zotero's process where Zotero puts its own there (`remote`: Zotero 11; Zotero
// 10 keeps it in process, its Firefox could not show a remote about:blank --
// zoteroFeedRemote). An <img> in the main window was the other way: no script
// either, but the publisher's bytes would be decoded inside Zotero's own
// privileged document, and on Zotero 11 inside its main process, where a flaw
// of an image decoder (libwebp's CVE-2023-4863) reaches everything; in the
// content process it meets the sandbox. So the picture is never handled more
// openly than Zotero's own Abstract handles it on the same Zotero. Fetching the
// bytes first (not letting the sandboxed page load the address) is what lets
// the section say when the picture did not load, and gives the full-size view
// the picture's natural size from its header.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvTimeout } from "../lib/timers";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl, winOf } from "../lib/dom";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvMainWins } from "../lib/windows";
import { WvSectionDesc } from "./backlinks";
import { WvGaParsed, WvGaPic, wvGaParse, wvGaPictureURL, wvGaSniff, wvGaDataURI, wvGaFit, wvGaAttr, WV_GA_LB_MARGIN } from "../lib/graphical-abstract";

declare const Zotero: any;
declare const Services: any;
declare const ChromeUtils: any;
declare const Components: any;

const SEC_PANE_ID = "weavero-graphical-abstract";
const SEC_STYLE_ID = "wv-ga-sec-style";
const LB_ID = "wv-ga-lightbox";
const LB_STYLE_ID = "wv-ga-lb-style";
const LAYER = "graphicalAbstract";
/** Zotero's own feed-abstract browser takes every flag (abstractBox.js). */
const SANDBOX_ALL_FLAGS = 0xFFFFF;
const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_MS = 20000;
/** How long a new browser may take to load its first, empty page. */
const BROWSER_WAIT_MS = 5000;
const IMG_CACHE = 12;
const PARSE_CACHE = 64;
/** What Firefox asks for when an <img> loads (image/avif first). */
const IMG_ACCEPT = "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5";

/** The section's icon: a picture -- a frame, a sun, a hill -- in the grey, the
 *  24-unit box and the 2-unit stroke of the References / Cited by glyphs
 *  (lib/link-glyph.ts wvPaperGlyphUri). DOUBLE quotes only: Zotero puts the URI
 *  in `url('...')`, and a single quote ended that string (feeds.ts secIcon). */
function secIcon(color: string, size: number): string {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<rect x="3" y="4" width="18" height="16" rx="2" stroke="' + color + '" stroke-width="2"/>'
        + '<circle cx="8.5" cy="9.5" r="2" fill="' + color + '"/>'
        + '<path d="M4,18L9.5,12.5L13.5,16.5L16,14L20,18" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
}

const GA_SECTION: WvSectionDesc = {
    paneID: SEC_PANE_ID,
    inst: "_wvGaSecKey", glob: "_wvGaSecKey", at: "_wvGaSecUnregAt", timer: "_wvGaSecTimer",
    header: { l10nID: "weavero-ga-header", icon: secIcon("#5a5a5a", 16), darkIcon: secIcon("#c8c8c8", 16) },
    sidenav: { l10nID: "weavero-ga-sidenav", icon: secIcon("#5a5a5a", 20), darkIcon: secIcon("#c8c8c8", 20) },
    bodyXHTML: '<html:div class="wv-ga-sec"></html:div>',
    hooks: { init: "_wvGaSecInit", destroy: "_wvGaSecDestroy", itemChange: "_wvGaSecItemChange", render: "_wvGaSecRender", asyncRender: "_wvGaSecAsyncRender" },
    enabled: (p) => { try { return !!p._wvFdOn(); } catch (e) { return false; } },
};

/** The section: one frame per picture, the browser at the body's width (its
 *  height the picture's at that width: fitHeight), a transparent
 *  layer over it taking the click -- a press inside a remote browser reaches
 *  the content process, never this document. `contain: inline-size` keeps the
 *  browser out of the pane's minimum width (src-ts.md). */
const SEC_CSS = `
.wv-ga-sec { display: flex; flex-direction: column; gap: 8px; contain: inline-size; }
.wv-ga-pic { position: relative; display: flex; min-width: 0; contain: inline-size; }
.wv-ga-pic > browser.wv-ga-browser { flex: 1 1 auto; width: 0; min-width: 0; border: 0; }
.wv-ga-hit { position: absolute; inset: 0; cursor: zoom-in; border-radius: 4px; }
.wv-ga-hit:focus-visible { outline: 2px solid var(--color-focus-border, var(--accent-blue, #4072e5)); outline-offset: 1px; }
.wv-ga-note { padding: 2px 4px; color: var(--fill-secondary, GrayText); }
`;

/** The full-size view: over the whole window, the picture centred. It covers
 *  the tab bar and title bar, whose `-moz-window-dragging: drag` takes a real
 *  press for the OS (no click would reach it): no-drag on it, by a sheet rule
 *  (Firefox 153 drops the property set inline; src-ts.md). */
const LB_CSS = `
#${LB_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.6); cursor: zoom-out; -moz-window-dragging: no-drag; }
#${LB_ID} * { -moz-window-dragging: no-drag; }
#${LB_ID}:focus { outline: none; }
#${LB_ID} .wv-ga-lb-frame { position: relative; display: flex; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5); }
#${LB_ID} browser.wv-ga-browser { flex: none; border: 0; }
#${LB_ID} .wv-ga-hit { cursor: zoom-out; border-radius: 0; }
`;

interface WvGaImg { uri: string; w: number; h: number; mime: string }

/** Each item's parsed abstract, by item id, while its abstract stays the same. */
const parseCache: Map<string, { html: string; r: WvGaParsed | null }> = new Map();
/** The pictures, by address (a failed load is not kept: the next render asks again). */
const imgCache: Map<string, Promise<WvGaImg | null>> = new Map();
/** A section body's draw in progress (a newer one makes it stale). */
const bodyGen: WeakMap<any, number> = new WeakMap();
/** The element a full-size view gives the focus back to. */
const lbFrom: WeakMap<any, any> = new WeakMap();
/** Progress listeners waiting for a browser's first page: a web progress holds
 *  its listeners weakly. */
const waiting: Set<any> = new Set();

/** A picture whose header gave no size starts this high; Zotero's FeedAbstract
 *  actor then sets what it drew (Zotero 11). */
const UNSIZED_H = 150;

/** The height `img` takes at the width of `box` (its own width at most: never
 *  enlarged, as the page's `max-width: 100%` draws it); 0 when not known. The
 *  section sets it itself: Zotero's actor reports a height only for a browser
 *  whose first page it saw (on Zotero 10.0.8 never for this one, measured
 *  2026-11-22: 0 px tall, no resize message, where Zotero's own abstract
 *  browser got its 81 px). */
function fitHeight(box: any, img: WvGaImg): number {
    try {
        if (!(img.w > 0 && img.h > 0)) return 0;
        const w = box.getBoundingClientRect().width;
        if (!(w > 0)) return 0;
        return Math.max(1, Math.round(Math.min(img.w, w) * img.h / img.w));
    }
    catch (e) { return 0; }
}

/** The browser's height follows its frame's width (the pane resized). */
function fitOnResize(box: any, b: any, img: WvGaImg): void {
    try {
        const w = winOf(box);
        if (!w || !w.ResizeObserver || !(img.w > 0 && img.h > 0)) return;
        let lastW = -1;
        const ro = new w.ResizeObserver(() => {
            try {
                if (!b.isConnected) { ro.disconnect(); return; }
                const bw = box.getBoundingClientRect().width;
                if (bw === lastW) return;
                lastW = bw;
                const h = fitHeight(box, img);
                if (h && b.style.height !== h + "px") b.style.height = h + "px";
            } catch (e) {}
        });
        ro.observe(box);
    } catch (e) {}
}

/** Whether this Zotero draws its feed abstract out of process: Zotero 11
 *  (Firefox 153) makes the browser `remote="true"`, Zotero 10 `"false"` --
 *  "fx128: about:blank no longer displays content when loaded remotely"
 *  (abstractBox.js 10.0.8:264-266); a remote one stayed blank there (measured
 *  2026-11-22). Read from Zotero's own class (its fields are in its source),
 *  else from the platform. */
function zoteroFeedRemote(win: any): boolean {
    try {
        const C = win && win.customElements && win.customElements.get("abstract-box");
        const m = C ? /setAttribute\(\s*["']remote["']\s*,\s*["'](true|false)["']\s*\)/.exec(Function.prototype.toString.call(C)) : null;
        if (m) return m[1] === "true";
    } catch (e) {}
    try { return parseInt(String(Services.appinfo.platformVersion), 10) >= 153; }
    catch (e) { return false; }
}

const isNative = (fn: any): boolean => {
    try { return /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn)); }
    catch (e) { return true; }
};

class _FeedsGraphicalMixin {
    [k: string]: any;

    // ---- the abstract and its pictures ---------------------------------------------------

    /** The pictures of a feed item's abstract and the abstract without them
     *  (null: not a feed item, or no picture this section shows). */
    _wvGaParse(item: any, win?: any): WvGaParsed | null {
        try {
            if (!item || !item.isFeedItem) return null;
            const html = String(item.getField("abstractNote") || "");
            const key = String(item.id);
            const had = parseCache.get(key);
            if (had && had.html === html) return had.r;
            let base: string | null = null;
            try { const u = item.library && item.library.url; if (u) base = String(u); } catch (e) {}
            const w = win || Zotero.getMainWindow();
            const r = wvGaParse(html, base, w && w.DOMParser);
            parseCache.delete(key);
            parseCache.set(key, { html, r });
            while (parseCache.size > PARSE_CACHE) parseCache.delete(parseCache.keys().next().value as string);
            return r;
        }
        catch (e) { Zotero.debug("[Weavero] graphical abstract parse err: " + e); return null; }
    }

    /** What Zotero's _renderFeedItem should take as `this` for the abstract-box
     *  `box`: a stand-in whose item answers the abstract without its pictures;
     *  null when the box shows anything else (Zotero then draws as it does). */
    _wvGaStandIn(box: any): any {
        if (!box || !this._wvFdOn()) return null;
        const item = box.item;
        if (!item || !item.isFeedItem) return null;
        const r = this._wvGaParse(item, winOf(box));
        if (!r) return null;
        const stripped = r.stripped;
        const itemView = new Proxy(item, {
            get(t: any, k: any) {
                if (k === "getField") {
                    return function (field: any, ...rest: any[]) {
                        return field === "abstractNote" ? stripped : t.getField(field, ...rest);
                    };
                }
                const v = Reflect.get(t, k, t);
                return typeof v === "function" ? v.bind(t) : v;
            },
            // Nothing is ever written to the item through the stand-in.
            set() { return true; },
            defineProperty() { return true; },
            deleteProperty() { return true; },
        });
        return new Proxy(box, {
            get(t: any, k: any) {
                if (k === "item") return itemView;
                const v = Reflect.get(t, k, t);
                // A DOM method checks its `this`: it runs on the element itself.
                return typeof v === "function" && isNative(v) ? v.bind(t) : v;
            },
            set(t: any, k: any, v: any) { return Reflect.set(t, k, v, t); },
        });
    }

    // ---- Zotero's Abstract section, per window -------------------------------------------

    /** The window's abstract-box class draws a feed abstract without the
     *  pictures this section shows (the wiring table's `feeds-graphical`). */
    _wvGaWire(win: any) {
        const P: any = this;
        try {
            if (!this._wvFdOn() || !win || win.closed) return;
            const CE = win.customElements;
            if (!CE) return;
            const C = CE.get("abstract-box");
            if (!C) {
                // Defined as the window builds its item pane.
                try {
                    CE.whenDefined("abstract-box").then(() => {
                        try { const lp: any = wvLivePlugin(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvGaWire(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = C.prototype;
            if (!proto || typeof proto._renderFeedItem !== "function") return;
            const fresh = wvWrap(proto, "_renderFeedItem", LAYER, P._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                let view: any = null;
                try { const lp: any = wvLivePlugin(); view = lp ? lp._wvGaStandIn(this) : null; } catch (e) { view = null; }
                if (!view) return orig.apply(this, args);
                const real = this;
                const asIs = (e: any) => {
                    try { Zotero.debug("[Weavero] graphical abstract: Zotero's Abstract drawn as it is (" + e + ")"); } catch (e2) {}
                    return orig.apply(real, args);
                };
                let p: any;
                try { p = orig.apply(view, args); }
                catch (e) { return asIs(e); }
                return p && typeof p.then === "function" ? p.then(undefined, asIs) : p;
            });
            if (fresh) this._wvGaRedrawAbstracts(win);
        } catch (e) { Zotero.debug("[Weavero] graphical abstract wire err: " + e); }
    }

    /** Zotero's Abstract drawn again where it shows a feed item with a picture
     *  (the layer just came or went). */
    _wvGaRedrawAbstracts(win: any) {
        try {
            for (const box of Array.from(win.document.querySelectorAll("abstract-box")) as any[]) {
                try {
                    const item = box.item;
                    if (!item || !item.isFeedItem || !this._wvGaParse(item, win) || typeof box._forceRenderAll !== "function") continue;
                    const p = box._forceRenderAll();
                    if (p && typeof p.catch === "function") p.catch(() => {});
                } catch (e) {}
            }
        } catch (e) {}
    }

    // ---- the section -----------------------------------------------------------------------

    _wvGaSecInit({ doc }: any) {
        try {
            (this as any)._wvBlEnsureFtl(doc.defaultView);
            wvInjectStyle(doc, SEC_STYLE_ID, SEC_CSS);
        } catch (e) {}
    }

    _wvGaSecDestroy({ body }: any) {
        try {
            bodyGen.delete(body);
            const host = body && body.querySelector(":scope > .wv-ga-sec");
            if (host) host.textContent = "";
        } catch (e) {}
    }

    _wvGaSecItemChange({ item, doc, setEnabled }: any) {
        try { setEnabled(!!(this._wvFdOn() && item && item.isFeedItem && this._wvGaParse(item, doc && doc.defaultView))); }
        catch (e) { try { setEnabled(false); } catch (e2) {} }
    }

    /** A body drawn for another item is emptied at once: its picture never
     *  shows under the next item while that one loads. */
    _wvGaSecRender({ body, item }: any) {
        try {
            const host = body && body.querySelector(":scope > .wv-ga-sec");
            if (host && host.getAttribute("data-wv-ga-item") !== String(item ? item.id : "")) {
                host.textContent = "";
                host.removeAttribute("data-wv-ga-sig");
                host.removeAttribute("data-wv-ga-item");
            }
        } catch (e) {}
    }

    async _wvGaSecAsyncRender({ body, item, doc }: any) {
        try { await this._wvGaSecBuild(body, doc, item); }
        catch (e) { Zotero.debug("[Weavero] graphical abstract section err: " + e); }
    }

    /** Each picture of the item's abstract in a frame of its own: loaded, then
     *  drawn in a sandboxed browser; or a line saying it did not load. */
    async _wvGaSecBuild(body: any, doc: any, item: any) {
        const P: any = this;
        let host: any = body.querySelector(":scope > .wv-ga-sec");
        if (!host) host = wvHtmlEl(doc, "div", "wv-ga-sec", undefined, body);
        const r = item && item.isFeedItem && this._wvFdOn() ? this._wvGaParse(item, doc.defaultView) : null;
        const gen = (bodyGen.get(body) || 0) + 1;
        bodyGen.set(body, gen);
        if (!r) {
            host.textContent = "";
            host.removeAttribute("data-wv-ga-sig");
            host.removeAttribute("data-wv-ga-item");
            return;
        }
        const sig = item.id + "|" + r.pics.map((p) => p.src).join(" ");
        if (host.getAttribute("data-wv-ga-sig") === sig && host.firstChild) return;
        host.textContent = "";
        host.setAttribute("data-wv-ga-sig", sig);
        host.setAttribute("data-wv-ga-item", String(item.id));
        const current = () => wvLivePlugin() === P && !P._wvDestroyed && body.isConnected && bodyGen.get(body) === gen;
        let base = "about:blank";
        try { const u = item.library && item.library.url; if (u) base = String(u); } catch (e) {}
        await Promise.all(r.pics.map(async (pic: WvGaPic) => {
            const box = wvHtmlEl(doc, "div", "wv-ga-pic", undefined, host);
            box.setAttribute("data-wv-ga-src", pic.src);
            box.setAttribute("data-wv-ga-state", "loading");
            const img = await this._wvGaLoad(pic.src);
            if (!current()) return;
            if (!img) { this._wvGaFailed(doc, box); return; }
            const b = await this._wvGaBrowser(doc, box, { w: 0, h: fitHeight(box, img) || UNSIZED_H });
            if (b) fitOnResize(box, b, img);
            if (!current()) { try { if (b) b.remove(); } catch (e) {} return; }
            if (!b) { this._wvGaFailed(doc, box); return; }
            const ok = await this._wvGaSetContent(b, base, this._wvGaHtml(img, pic.alt, null));
            if (!current()) return;
            if (!ok) { try { b.remove(); } catch (e) {} this._wvGaFailed(doc, box); return; }
            box.setAttribute("data-wv-ga-state", "shown");
            const hit = this._wvGaHit(doc, box, "weavero-ga-open");
            const go = () => {
                try {
                    const lp: any = wvLivePlugin();
                    if (!lp) return;
                    const p = lp._wvGaShowFull(winOf(hit), pic.src, pic.alt, hit);
                    if (p && typeof p.catch === "function") p.catch(() => {});
                } catch (e) {}
            };
            hit.addEventListener("click", (e: any) => { if (e.button === 0) { e.preventDefault(); e.stopPropagation(); go(); } });
            hit.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); go(); } });
        }));
    }

    _wvGaFailed(doc: any, box: any) {
        try {
            box.textContent = "";
            wvHtmlEl(doc, "div", "wv-ga-note", wvStr("weavero-ga-failed", null, null), box);
            box.setAttribute("data-wv-ga-state", "failed");
        } catch (e) {}
    }

    /** The transparent layer over a drawn picture that takes its click. */
    _wvGaHit(doc: any, parent: any, tipID: string): any {
        const hit = wvHtmlEl(doc, "div", "wv-ga-hit", undefined, parent);
        const tip = wvStr(tipID, null, "title");
        hit.setAttribute("role", "button");
        hit.setAttribute("tabindex", "0");
        hit.setAttribute("title", tip);
        hit.setAttribute("aria-label", tip);
        return hit;
    }

    // ---- loading and drawing a picture --------------------------------------------------

    /** The bytes at `url`, fetched anonymously (no cookie; chrome code sends no
     *  Referer). The suite stands in for it on the instance (test/feeds-graphical.spec.js). */
    async _wvGaFetch(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
        const xhr = await Zotero.HTTP.request("GET", url, {
            responseType: "arraybuffer", timeout: FETCH_MS, errorDelayMax: 0, anon: true, successCodes: [200],
            headers: { Accept: IMG_ACCEPT },
        });
        const buf = xhr && xhr.response;
        if (!buf) return null;
        let type = "";
        try { type = String(xhr.getResponseHeader("Content-Type") || ""); } catch (e) {}
        return { bytes: new Uint8Array(buf), type };
    }

    /** The picture at `src` as a data: URI with its natural size, or null when
     *  it cannot be had: not an http(s) address, not fetched, too big, not a
     *  picture. Kept for the session (a failure is not). */
    _wvGaLoad(src: string): Promise<WvGaImg | null> {
        const had = imgCache.get(src);
        if (had) { imgCache.delete(src); imgCache.set(src, had); return had; }
        const p = (async (): Promise<WvGaImg | null> => {
            if (!wvGaPictureURL(src)) return null;
            let got: any = null;
            try { got = await this._wvGaFetch(src); }
            catch (e) { Zotero.debug("[Weavero] graphical abstract: not loaded (" + e + ")"); return null; }
            const bytes: Uint8Array | null = got && got.bytes ? got.bytes : null;
            if (!bytes || !bytes.length || bytes.length > MAX_BYTES) return null;
            const s = wvGaSniff(bytes, got.type);
            if (!s) { Zotero.debug("[Weavero] graphical abstract: not a picture (" + got.type + ")"); return null; }
            return { uri: wvGaDataURI(s.mime, bytes), w: s.w, h: s.h, mime: s.mime };
        })();
        imgCache.set(src, p);
        while (imgCache.size > IMG_CACHE) imgCache.delete(imgCache.keys().next().value as string);
        const drop = () => { if (imgCache.get(src) === p) imgCache.delete(src); };
        p.then((v) => { if (!v) drop(); }, drop);
        return p;
    }

    /** A new browser in `parent`, as Zotero makes its feed-abstract browser
     *  (abstractBox.js _ensureFeedAbstractBrowserExists, 10.0.8 and 11):
     *  remote as Zotero's (zoteroFeedRemote), every sandbox flag set before its
     *  first page, in the "feedAbstract" message-manager group, once that first
     *  page has loaded; sized first when `size` says so. null when it cannot be
     *  had. */
    async _wvGaBrowser(doc: any, parent: any, size?: { w: number; h: number }): Promise<any> {
        let b: any = null;
        try {
            b = doc.createXULElement("browser");
            b.setAttribute("type", "content");
            b.setAttribute("remote", zoteroFeedRemote(winOf(parent)) ? "true" : "false");
            b.setAttribute("maychangeremoteness", "true");
            b.setAttribute("messagemanagergroup", "feedAbstract");
            b.className = "wv-ga-browser";
            if (size && size.w) b.style.width = size.w + "px";
            if (size && size.h) b.style.height = size.h + "px";
            parent.appendChild(b);
            const bc = b.browsingContext;
            if (!bc) { b.remove(); return null; }
            bc.sandboxFlags |= SANDBOX_ALL_FLAGS;
            await this._wvGaFirstPage(b);
            return b.isConnected ? b : null;
        }
        catch (e) {
            Zotero.debug("[Weavero] graphical abstract browser err: " + e);
            try { if (b) b.remove(); } catch (e2) {}
            return null;
        }
    }

    /** The browser's first (empty) page has loaded: its FeedAbstract actor is up. */
    _wvGaFirstPage(b: any): Promise<void> {
        return new Promise((resolve) => {
            const Ci = Components.interfaces;
            let wp: any = null, done = false;
            const listener: any = {
                onStateChange(_p: any, _r: any, flags: number) {
                    if (flags & Ci.nsIWebProgressListener.STATE_STOP) finish();
                },
                QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
            };
            const finish = () => {
                if (done) return;
                done = true;
                waiting.delete(listener);
                try { if (wp) wp.removeProgressListener(listener); } catch (e) {}
                resolve();
            };
            try {
                wp = b.browsingContext.webProgress;
                waiting.add(listener);
                wp.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_STATE_ALL);
            }
            catch (e) { finish(); return; }
            wvTimeout(finish, BROWSER_WAIT_MS);
        });
    }

    /** Zotero's FeedAbstract actor draws `html` in `b` (setContent, as the
     *  Abstract section has it drawn). */
    async _wvGaSetContent(b: any, url: string, html: string): Promise<boolean> {
        try {
            const wg = b && b.browsingContext && b.browsingContext.currentWindowGlobal;
            if (!wg) return false;
            await wg.getActor("FeedAbstract").sendQuery("setContent", { url, html });
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] graphical abstract: not drawn (" + e + ")"); return false; }
    }

    /** The page drawn in a browser: the picture alone, fitted to the browser's
     *  width (`size` null) or at `size`; `maxH` caps a picture of unknown size. */
    _wvGaHtml(img: WvGaImg, alt: string, size: [number, number] | null, maxH?: number): string {
        const css = size
            ? "html,body{margin:0;padding:0}img{display:block;width:" + size[0] + "px;height:" + size[1] + "px}"
            : "html,body{margin:0;padding:0}img{display:block;max-width:100%;height:auto;margin:0 auto"
                + (maxH ? ";max-height:" + Math.floor(maxH) + "px" : "") + "}";
        return "<style>" + css + "</style><img src=\"" + wvGaAttr(img.uri) + "\" alt=\"" + wvGaAttr(alt || wvStr("weavero-ga-header")) + "\" referrerpolicy=\"no-referrer\">";
    }

    // ---- the full-size view -----------------------------------------------------------------

    /** The picture at `src` over the whole of `win`, at its natural size or
     *  fitted to the window; a click or Escape closes it. */
    async _wvGaShowFull(win: any, src: string, alt: string, from?: any) {
        const P: any = this;
        try {
            if (!win || win.closed) return;
            const img = await this._wvGaLoad(src);
            if (!img || win.closed || wvLivePlugin() !== P || P._wvDestroyed) return;
            // One view at a time: an earlier open still on its way is dropped.
            this._wvGaCloseFull(win);
            const doc = win.document;
            wvInjectStyle(doc, LB_STYLE_ID, LB_CSS);
            const lb = wvHtmlEl(doc, "div");
            lb.id = LB_ID;
            lb.setAttribute("role", "dialog");
            lb.setAttribute("aria-label", alt || wvStr("weavero-ga-header"));
            lb.setAttribute("tabindex", "-1");
            lb.setAttribute("title", wvStr("weavero-ga-close", null, "title"));
            lb.setAttribute("data-wv-ga-src", src);
            const frame = wvHtmlEl(doc, "div", "wv-ga-lb-frame", undefined, lb);
            const maxW = Math.max(64, win.innerWidth - 2 * WV_GA_LB_MARGIN);
            const maxH = Math.max(64, win.innerHeight - 2 * WV_GA_LB_MARGIN);
            const fit = wvGaFit(img.w, img.h, maxW, maxH);
            const close = (e: any) => {
                // The second click of a double-click on the picture lands on the
                // view it just opened: not a click to close it.
                if (e.type === "click" && e.detail > 1) return;
                try { e.preventDefault(); e.stopPropagation(); } catch (er) {}
                try { const lp: any = wvLivePlugin(); if (lp) lp._wvGaCloseFull(win); else lb.remove(); } catch (er) {}
            };
            lb.addEventListener("click", close);
            lb.addEventListener("keydown", (e: any) => { if (e.key === "Escape") close(e); });
            if (from) lbFrom.set(lb, from);
            doc.documentElement.appendChild(lb);
            try { lb.focus(); } catch (e) {}
            // Sized before its first page: the picture's own size, fitted, or the
            // whole room for a picture whose header gave none (Zotero 11's actor
            // then sets the height it drew).
            const b = await this._wvGaBrowser(doc, frame, fit[0] ? { w: fit[0], h: fit[1] } : { w: maxW, h: maxH });
            if (!b || !lb.isConnected) { try { if (b) b.remove(); } catch (e) {} return; }
            await this._wvGaSetContent(b, "about:blank", this._wvGaHtml(img, alt, fit[0] ? fit : null, maxH));
            if (!lb.isConnected) return;
            this._wvGaHit(doc, frame, "weavero-ga-close");
            try { lb.focus(); } catch (e) {}
        }
        catch (e) { Zotero.debug("[Weavero] graphical abstract full size err: " + e); }
    }

    _wvGaCloseFull(win: any) {
        try {
            const lb = win && !win.closed && win.document.getElementById(LB_ID);
            if (!lb) return;
            const from = lbFrom.get(lb);
            lbFrom.delete(lb);
            lb.remove();
            if (from && from.isConnected) { try { from.focus(); } catch (e) {} }
        } catch (e) {}
    }

    // ---- on, off ----------------------------------------------------------------------------

    /** On (feeds.ts _wvFdApply): every main window's Abstract wired, the
     *  section registered. A window opened later: the wiring table. */
    _wvGaApply() {
        const P: any = this;
        for (const w of wvMainWins()) this._wvGaWire(w);
        try { P._wvBlRegisterSectionFor(GA_SECTION); } catch (e) {}
    }

    /** Off (feeds.ts _wvFdStop; destroy() through it): the section, every
     *  window's Abstract given back and drawn again with its picture, the
     *  full-size views, the sheets, what was kept. */
    _wvGaStop() {
        const P: any = this;
        try { P._wvBlUnregisterSectionFor(GA_SECTION); } catch (e) {}
        for (const w of wvMainWins()) {
            try {
                const C = w.customElements && w.customElements.get("abstract-box");
                if (C && C.prototype && wvUnwrap(C.prototype, "_renderFeedItem", LAYER)) this._wvGaRedrawAbstracts(w);
            } catch (e) {}
            this._wvGaCloseFull(w);
        }
        // The section's sheet goes into whatever document renders it.
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try { wvRemoveStyle(w.document, SEC_STYLE_ID); wvRemoveStyle(w.document, LB_STYLE_ID); } catch (e) {}
            }
        } catch (e) {}
        this._wvGaForget();
    }

    /** Forget the parsed abstracts and the pictures (off; the suite). */
    _wvGaForget() {
        parseCache.clear();
        imgCache.clear();
    }
}

const _gaDescriptors = Object.getOwnPropertyDescriptors(_FeedsGraphicalMixin.prototype);
delete (_gaDescriptors as any).constructor;
export const feedsGraphicalMethods = _gaDescriptors;
