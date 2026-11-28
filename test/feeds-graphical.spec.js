/* global describe, it, before, after, assert, Zotero, Services, ChromeUtils, wvT */

// The Graphical Abstract section (src/modules/feeds-graphical.ts,
// src/lib/graphical-abstract.ts; MJT 2026-11-22, "Ok for the Graphical
// Abstract section"). A feed item whose abstract carries a picture (Journal of
// Fluid Mechanics: `<div class="abstract" data-abstract-type="graphical">`,
// its first `<p>` holding the figure) gets a section of its own with the
// picture alone, fitted to the pane's width, a click showing it full size;
// Zotero's Abstract section then draws the text only. Feed items without a
// picture, and every library item, are left as Zotero has them.
//
// No network: the picture's address is an https one (the only kind the
// section loads), and the spec stands in for the fetch through the plugin's
// own seam, `_wvGaFetch` (an instance property shadows the prototype's), with
// the bytes of a PNG drawn here. The pure parts are checked directly.

describe("Weavero — Feeds: the Graphical Abstract section", function () {
    this.timeout(180000);
    let wv, L, win, feed = null, lib1 = null;
    let G1, G2, G3, G4;
    let PNG = null;
    const calls = [];
    const W = 2400, H = 1200;
    const SEC = 'item-pane-custom-section[data-pane$="weavero-graphical-abstract"]';
    const URL1 = "https://wv-ga-test.invalid/content/S0022112026121557_figAb.png";
    const URL3 = "https://wv-ga-test.invalid/fail/missing.png";
    const ABS1 = '<div xmlns="http://www.w3.org/1999/xhtml" class="abstract" data-abstract-type="graphical"><p style="float: left;">'
        + '<img class="graphic" alt="" src="' + URL1 + '"/></p><p>WVGA-TEXT-1 In this work, we describe a drop &amp; its bubble.</p></div>';
    const ABS2 = "<p>WVGA-TEXT-2 A plain abstract &amp; nothing more.</p>";
    const ABS3 = '<div class="abstract"><p><img src="' + URL3 + '"/></p><p>WVGA-TEXT-3 A picture that never comes.</p></div>';
    const ABS4 = '<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="/></p><p>WVGA-TEXT-4 An inline picture.</p>';

    const iv = () => win.ZoteroPane.itemsView;
    const pane = () => win.document.getElementById("zotero-item-pane");
    const section = () => pane() && pane().querySelector(SEC);
    async function showRow(id) {
        const cv = win.ZoteroPane.collectionsView;
        assert.ok(await wvT.waitFor(() => cv.getRowIndexByID(id) !== false, 15000, 100), "collection-tree row " + id + " present");
        await cv.selectByID(id);
        await iv().waitForLoad();
        await wvT.waitFor(() => iv().collectionTreeRows && iv().collectionTreeRows[0] && iv().collectionTreeRows[0].id === id, 10000, 50);
    }
    async function show(item) {
        await showRow("L" + item.libraryID);
        await iv().selectItem(item.id);
        await wvT.waitFor(() => { const b = abstractBox(); return b && b.item && b.item.id === item.id; }, 10000, 50);
    }
    /** Zotero's Abstract section of the main item pane. A feed abstract's browser
     *  that a section move left dead is dropped first, as WV-TEMP-feedabstract
     *  (upstream-fixes.ts, citations branch) does: without it every later feed
     *  abstract stays blank, whatever this feature does. */
    function abstractBox() {
        const b = pane() && pane().querySelector("abstract-box");
        try { if (b && b._feedAbstractBrowser && (!b._feedAbstractBrowser.isConnected || !b._feedAbstractBrowser.browsingContext)) b._feedAbstractBrowser = null; } catch (e) {}
        return b;
    }
    /** What Zotero's Abstract section hands its FeedAbstract actor for the item
     *  it shows (setContent's html), on a fresh render of the section. A render
     *  Zotero starts meanwhile (a section registered or gone re-renders the
     *  pane) sends too: every one must say the same. */
    async function abstractHTML() {
        const box = abstractBox();
        assert.ok(box, "the Abstract section");
        // Every FeedAbstract actor's queries, those of a browser inside this Abstract
        // section kept: the class's own (Zotero's actor module, one instance for the
        // app), since the actor a render reaches is its browser's CURRENT window
        // global's -- a browser made for the render has a new one (Zotero 10).
        const { FeedAbstractParent } = ChromeUtils.importESModule("chrome://zotero/content/actors/FeedAbstractParent.mjs");
        const proto = FeedAbstractParent.prototype;
        assert.isFalse(Object.prototype.hasOwnProperty.call(proto, "sendQuery"), "fixture: no spy left");
        const sent = [];
        proto.sendQuery = function (name, data) {
            try {
                const emb = this.browsingContext && this.browsingContext.embedderElement;
                if (name === "setContent" && emb && box.contains(emb)) sent.push(String(data && data.html));
            } catch (e) {}
            return Object.getPrototypeOf(proto).sendQuery.apply(this, arguments);
        };
        try { await box._forceRenderAll(); }
        finally { delete proto.sendQuery; }
        assert.isAtLeast(sent.length, 1, "a setContent");
        assert.deepEqual([...new Set(sent)], [sent[0]], "every render the same");
        return sent[0];
    }
    async function makeFeed(name) {
        const f = /** @type {any} */ (new Zotero.Feed());
        f.name = name;
        f.description = "";
        f.url = "https://wv-ga-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
        f.refreshInterval = 24 * 60;
        f.cleanupReadAfter = 60;
        f.cleanupUnreadAfter = 90;
        await f.saveTx();
        return f;
    }
    async function feedItem(title, abstractNote) {
        const it = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
        it.libraryID = feed.libraryID;
        it.guid = "wv-ga-" + Zotero.Utilities.randomString();
        it.setField("title", title);
        it.setField("abstractNote", abstractNote);
        await it.saveTx();
        return it;
    }
    /** The colour the remote page of browser `b` shows at (x, y), CSS px: a
     *  snapshot of what its content process drew (WindowGlobalParent
     *  drawSnapshot), so the picture is seen, not inferred from a size. */
    async function pixelAt(b, x, y) {
        try {
            const wg = b && b.browsingContext && b.browsingContext.currentWindowGlobal;
            if (!wg) return null;
            const bmp = await wg.drawSnapshot(new win.DOMRect(Math.floor(x), Math.floor(y), 2, 2), 1, "rgb(255,0,255)");
            const c = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            c.width = 2; c.height = 2;
            const g = c.getContext("2d");
            g.drawImage(bmp, 0, 0);
            return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
        }
        catch (e) { return null; }
    }
    const near = (px, rgb) => !!px && px.every((v, i) => Math.abs(v - rgb[i]) <= 16);
    const GREEN = [0x2a, 0x7a, 0x5a], WHITE = [255, 255, 255];
    /** The fixture's picture drawn in `b` at `w` CSS px wide: green at a corner,
     *  white inside its white block (natural 200-800 x 200-600). */
    async function drawsPicture(b, w) {
        const k = w / W;
        let a = null, c = null;
        for (let i = 0; i < 40; i++) {
            a = await pixelAt(b, 3, 3);
            c = await pixelAt(b, 500 * k, 400 * k);
            if (near(a, GREEN) && near(c, WHITE)) return true;
            await wvT.sleep(150);
        }
        return "corner " + JSON.stringify(a) + ", block " + JSON.stringify(c);
    }

    /** A PNG of W x H drawn here: its bytes. */
    function pngBytes() {
        const c = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
        c.width = W; c.height = H;
        const g = c.getContext("2d");
        g.fillStyle = "#2a7a5a"; g.fillRect(0, 0, W, H);
        g.fillStyle = "#ffffff"; g.fillRect(200, 200, 600, 400);
        const bin = win.atob(c.toDataURL("image/png").split(",")[1]);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const m of ["_wvFdOn", "_wvGaFetch", "_wvGaStandIn", "_wvGaParse", "_wvGaShowFull", "_wvGaCloseFull", "_wvGaForget", "_wvGaApply", "_wvGaStop"]) wvT.method(m);
        for (const f of ["wvGaParse", "wvGaPictureURL", "wvGaSniff", "wvGaFit", "wvGaDataURI", "wvGaAttr", "WV_GA_LB_MARGIN", "WV_GA_MAX_PICS"]) {
            if (L[f] === undefined) wvT.absent("lib." + f);
        }
        win = Zotero.getMainWindow();
        assert.isTrue(wv._wvFdOn(), "Feeds on (the default)");
        PNG = pngBytes();
        wv._wvGaForget();
        wv._wvGaFetch = async function (url) {
            calls.push(String(url));
            if (/\/fail\//.test(url)) throw new Error("HTTP 404 (the spec's stand-in)");
            // A static host's word for it: the bytes say what they are.
            return { bytes: PNG, type: "application/octet-stream" };
        };
        feed = await makeFeed("WV-TEST graphical abstracts");
        G1 = await feedItem("WV-TEST graphical abstract", ABS1);
        G2 = await feedItem("WV-TEST plain abstract", ABS2);
        G3 = await feedItem("WV-TEST picture that fails", ABS3);
        G4 = await feedItem("WV-TEST inline data picture", ABS4);
        lib1 = await wvT.createItem("journalArticle", { title: "WV-TEST library item with a picture in its abstract", abstractNote: ABS1 });
    });

    after(async function () {
        try { wv._wvGaCloseFull(win); } catch (e) {}
        try { delete wv._wvGaFetch; } catch (e) {}
        try { wv._wvGaForget(); } catch (e) {}
        try { await showRow("L" + Zotero.Libraries.userLibraryID); } catch (e) {}
        try { if (feed) await feed.eraseTx(); } catch (e) {}
        await wvT.erase(...[lib1].filter(Boolean));
    });

    // ---- the pure parts (lib/graphical-abstract.ts) ----

    it("takes http(s) pictures only, resolved against the feed's address", function () {
        const base = "https://www.cambridge.org/core/rss/product/id/X";
        assert.equal(L.wvGaPictureURL("http://static.cambridge.org//content/a.png", base), "http://static.cambridge.org//content/a.png");
        assert.equal(L.wvGaPictureURL("//static.cambridge.org/b.jpg", base), "https://static.cambridge.org/b.jpg", "protocol-relative: the feed's scheme");
        assert.equal(L.wvGaPictureURL("/c.png", base), "https://www.cambridge.org/c.png", "relative: the feed's host");
        for (const bad of ["data:image/png;base64,AAAA", "javascript:alert(1)", "file:///C:/x.png", "chrome://zotero/skin/x.svg", "blob:https://a/b", "about:blank", "", null, "   "]) {
            assert.isNull(L.wvGaPictureURL(bad, base), String(bad));
        }
        assert.isNull(L.wvGaPictureURL("/c.png", null), "relative without a base: nothing");
        assert.equal(L.wvGaPictureURL("https://a.example/x.png", "not an address"), "https://a.example/x.png", "an absolute src despite a bad base");
    });

    it("finds an abstract's pictures and gives the abstract back without them, its text kept", function () {
        const P = win.DOMParser;
        const r = L.wvGaParse(ABS1, "https://x.example/feed.xml", P);
        assert.ok(r, "a picture");
        assert.deepEqual(r.pics.map(p => p.src), [URL1]);
        assert.notInclude(r.stripped, "<img", "no picture left");
        assert.notInclude(r.stripped, "float: left", "the picture's own paragraph went with it");
        assert.include(r.stripped, "WVGA-TEXT-1 In this work, we describe a drop &amp; its bubble.", "the text as it was");
        assert.include(r.stripped, 'data-abstract-type="graphical"', "the abstract's own element kept");
        // A tracking pixel is no picture; a data: picture is none of this section's.
        assert.isNull(L.wvGaParse('<p>Text</p><img src="http://feeds.feedburner.com/~r/x/~4/y" height="1" width="1"/>', null, P));
        assert.isNull(L.wvGaParse(ABS4, null, P));
        assert.isNull(L.wvGaParse(ABS2, null, P));
        assert.isNull(L.wvGaParse("", null, P));
        // Mixed: only what the section shows leaves the abstract.
        const m = L.wvGaParse('<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="/></p><p><img src="https://a.example/1.png" alt=" A  figure "/></p><p>T</p>', null, P);
        assert.deepEqual(m.pics, [{ src: "https://a.example/1.png", alt: "A figure" }]);
        assert.include(m.stripped, "data:image/gif", "the data: picture stays in the abstract");
        assert.notInclude(m.stripped, "a.example", "the shown one is gone");
        // More than the section shows: the rest stays in the abstract.
        const many = Array.from({ length: L.WV_GA_MAX_PICS + 1 }, (_, i) => '<img src="https://a.example/' + i + '.png">').join("") + "<p>T</p>";
        const mr = L.wvGaParse(many, null, P);
        assert.equal(mr.pics.length, L.WV_GA_MAX_PICS);
        assert.include(mr.stripped, "https://a.example/" + L.WV_GA_MAX_PICS + ".png", "the one past the limit stays");
    });

    it("reads what the bytes are and their size, and fits a picture into a box", function () {
        const png = L.wvGaSniff(PNG, "application/octet-stream");
        assert.deepEqual(png, { mime: "image/png", w: W, h: H });
        const gif = L.wvGaSniff(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2C, 0x01, 0xC8, 0x00, 0, 0, 0]));
        assert.deepEqual(gif, { mime: "image/gif", w: 300, h: 200 });
        // A JPEG: SOI, an APP0 segment, then SOF0 with height 0x0190 (400) and width 0x0258 (600).
        const jpg = L.wvGaSniff(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x02, 0x58, 0x03, 0, 0, 0, 0]));
        assert.deepEqual(jpg, { mime: "image/jpeg", w: 600, h: 400 });
        assert.isNull(L.wvGaSniff(new TextEncoder().encode("<html><body>Not found</body></html>"), "text/html"), "an error page is no picture");
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
        assert.equal(L.wvGaSniff(svg, "image/svg+xml").mime, "image/svg+xml");
        assert.isNull(L.wvGaSniff(svg, "application/octet-stream"), "SVG only when the server says so");
        assert.deepEqual(L.wvGaFit(W, H, 1000, 800), [1000, 500]);
        assert.deepEqual(L.wvGaFit(100, 50, 1000, 800), [100, 50], "never enlarged");
        assert.deepEqual(L.wvGaFit(W, H, 4000, 300), [600, 300]);
        assert.deepEqual(L.wvGaFit(0, 0, 1000, 800), [0, 0]);
        assert.equal(L.wvGaDataURI("image/png", new Uint8Array([1, 2, 3])), "data:image/png;base64,AQID");
        assert.equal(L.wvGaDataURI("image/png", new Uint8Array([1, 2])), "data:image/png;base64,AQI=");
        assert.equal(L.wvGaDataURI("image/png", new Uint8Array([1])), "data:image/png;base64,AQ==");
        assert.equal(L.wvGaDataURI("image/png", PNG), "data:image/png;base64," + win.btoa(String.fromCharCode.apply(null, Array.from(PNG))));
        assert.equal(L.wvGaAttr('a"b<c>&d'), "a&quot;b&lt;c&gt;&amp;d");
    });

    // ---- the section and Zotero's Abstract ----

    it("a feed item with a picture: the section draws it alone at the pane's width, in a sandboxed browser like Zotero's", async function () {
        calls.length = 0;
        await show(G1);
        const sec = await wvT.waitFor(() => { const s = section(); return s && !s.hidden ? s : null; }, 10000, 100);
        assert.ok(sec, "the section is shown");
        try { await pane().querySelector("item-details").scrollToPane(wv._wvGaSecKey, "instant"); } catch (e) {}
        const pic = await wvT.waitFor(() => sec.querySelector(".wv-ga-pic[data-wv-ga-state='shown']"), 15000, 100);
        assert.ok(pic, "the picture is drawn: " + (sec.querySelector(".wv-ga-pic") || {}).outerHTML);
        assert.equal(pic.getAttribute("data-wv-ga-src"), URL1);
        assert.deepEqual(calls, [URL1], "fetched once, the abstract's own address");
        const b = pic.querySelector("browser.wv-ga-browser");
        assert.ok(b, "a browser");
        assert.equal(b.getAttribute("type"), "content");
        // In or out of Zotero's process as Zotero's own feed-abstract browser (out on
        // Zotero 11; in on Zotero 10, whose Firefox showed nothing in a remote one).
        const own = await wvT.waitFor(() => { const ab = abstractBox(); return ab && ab._feedAbstractBrowser; }, 10000, 50);
        assert.ok(own, "Zotero's own feed-abstract browser");
        assert.equal(b.getAttribute("remote"), own.getAttribute("remote"), "remote as Zotero's own");
        if (parseInt(Services.appinfo.platformVersion, 10) >= 153) assert.equal(b.getAttribute("remote"), "true", "Zotero 11: out of process");
        assert.equal(b.getAttribute("messagemanagergroup"), "feedAbstract", "Zotero's FeedAbstract actor draws it");
        assert.equal(b.browsingContext.sandboxFlags & 0xFFFFF, 0xFFFFF, "every sandbox flag, as Zotero's");
        // 2400 x 1200 fitted to the pane: half as high as wide.
        const fitted = await wvT.waitFor(() => {
            const r = b.getBoundingClientRect();
            return r.width > 50 && Math.abs(r.height - r.width / 2) <= 2 ? r : null;
        }, 15000, 100);
        assert.ok(fitted, "at the pane's width: " + JSON.stringify(b.getBoundingClientRect()));
        assert.strictEqual(await drawsPicture(b, fitted.width), true, "the content process drew the picture at that width");
        assert.include(String(win.getComputedStyle(sec.querySelector(".wv-ga-sec")).contain), "inline-size", "contain: inline-size (never widens the pane)");
        // Its icon shows in the side navigation (double quotes only in the data: URI).
        const nav = pane().querySelector('item-pane-sidenav [data-pane$="weavero-graphical-abstract"]');
        const navImg = nav && win.getComputedStyle(nav.querySelector(".icon, image") || nav).backgroundImage;
        assert.ok(navImg && navImg !== "none", "the side navigation's icon: " + navImg);
    });

    it("Zotero's Abstract of that item gets the text without the picture; the item itself is untouched", async function () {
        await show(G1);
        const html = await abstractHTML();
        assert.notInclude(html, "<img", "no picture in Zotero's Abstract");
        assert.include(html, "WVGA-TEXT-1 In this work", "its text");
        assert.equal(G1.getField("abstractNote"), ABS1, "the item's abstract as it was");
        assert.isFalse(G1.hasChanged(), "nothing changed on the item");
        const stored = await Zotero.DB.valueQueryAsync("SELECT value FROM itemData JOIN itemDataValues USING (valueID) WHERE itemID=? AND fieldID=?",
            [G1.id, Zotero.ItemFields.getID("abstractNote")]);
        assert.equal(String(stored), ABS1, "nothing written");
    });

    it("a feed item without a picture: no section, Zotero's Abstract exactly as it is", async function () {
        const before = calls.length;
        for (const [it, abs] of [[G2, ABS2], [G4, ABS4]]) {
            await show(it);
            assert.ok(await wvT.waitFor(() => { const s = section(); return !s || s.hidden; }, 5000, 50), "no section for " + it.getField("title"));
            assert.equal(await abstractHTML(), abs, "Zotero's Abstract unchanged for " + it.getField("title"));
        }
        assert.equal(calls.length, before, "nothing fetched");
    });

    it("a picture that does not load: the section says so", async function () {
        await show(G3);
        const sec = await wvT.waitFor(() => { const s = section(); return s && !s.hidden ? s : null; }, 10000, 100);
        assert.ok(sec, "the section is shown");
        try { await pane().querySelector("item-details").scrollToPane(wv._wvGaSecKey, "instant"); } catch (e) {}
        const pic = await wvT.waitFor(() => sec.querySelector(".wv-ga-pic[data-wv-ga-state='failed']"), 10000, 100);
        assert.ok(pic, "failed");
        assert.equal(pic.querySelector(".wv-ga-note").textContent, L.wvStr("weavero-ga-failed", null, null));
        assert.isNull(pic.querySelector("browser"), "no browser for it");
        assert.include(calls, URL3);
    });

    it("a library item is left alone, whatever its abstract holds", async function () {
        const before = calls.length;
        await show(lib1);
        assert.ok(await wvT.waitFor(() => { const s = section(); return !s || s.hidden; }, 5000, 50), "no section");
        const box = abstractBox();
        assert.ok(await wvT.waitFor(() => box._abstractField && box._abstractField.value === ABS1, 5000, 50), "Zotero's own abstract field, the whole text");
        assert.isNotOk(box._feedAbstractBrowser, "no feed browser");
        assert.isNull(wv._wvGaStandIn(box), "no stand-in for a library item");
        assert.equal(calls.length, before, "nothing fetched");
    });

    it("a click shows the picture full size over the window; Escape or a click closes it", async function () {
        await show(G1);
        const sec = await wvT.waitFor(() => { const s = section(); return s && !s.hidden ? s : null; }, 10000, 100);
        try { await pane().querySelector("item-details").scrollToPane(wv._wvGaSecKey, "instant"); } catch (e) {}
        const hit = await wvT.waitFor(() => sec.querySelector(".wv-ga-pic[data-wv-ga-state='shown'] .wv-ga-hit"), 15000, 100);
        assert.ok(hit, "the picture takes a click");
        assert.equal(hit.getAttribute("role"), "button");
        const open = async () => {
            hit.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            const lb = await wvT.waitFor(() => win.document.getElementById("wv-ga-lightbox"), 5000, 50);
            assert.ok(lb, "the full-size view");
            return lb;
        };
        const lb = await open();
        const b = await wvT.waitFor(() => lb.querySelector("browser.wv-ga-browser"), 10000, 50);
        assert.ok(b, "drawn in a browser of its own");
        assert.equal(b.getAttribute("messagemanagergroup"), "feedAbstract");
        assert.equal(b.browsingContext.sandboxFlags & 0xFFFFF, 0xFFFFF, "sandboxed as the section's");
        const m = 2 * L.WV_GA_LB_MARGIN;
        const [fw, fh] = L.wvGaFit(W, H, win.innerWidth - m, win.innerHeight - m);
        assert.equal(b.style.width, fw + "px", "its natural size, fitted to the window");
        assert.ok(await wvT.waitFor(() => Math.abs(b.getBoundingClientRect().height - fh) <= 1, 10000, 50), "height " + b.getBoundingClientRect().height + " for " + fh);
        assert.ok(await wvT.waitFor(() => lb.querySelector(".wv-ga-hit"), 10000, 50), "drawn");
        assert.strictEqual(await drawsPicture(b, fw), true, "the content process drew it at that size");
        lb.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        assert.ok(await wvT.waitFor(() => !win.document.getElementById("wv-ga-lightbox"), 3000, 50), "Escape closes it");
        const lb2 = await open();
        const hit2 = await wvT.waitFor(() => lb2.querySelector(".wv-ga-hit"), 10000, 50);
        (hit2 || lb2).dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        assert.ok(await wvT.waitFor(() => !win.document.getElementById("wv-ga-lightbox"), 3000, 50), "a click closes it");
    });

    it("switched off: no section, Zotero's Abstract shows the picture again, nothing of the feature left; on again, all of it", async function () {
        await show(G1);
        const proto = win.customElements.get("abstract-box").prototype;
        const layers = () => L.wvWrapLayers(proto, "_renderFeedItem").map(l => l.layer);
        assert.include(layers(), "graphicalAbstract", "on: the layer on Zotero's Abstract");
        await wvT.withPref("weavero.enableFeeds", false, async () => {
            assert.ok(await wvT.waitFor(() => !wv._wvGaSecKey, 5000, 50), "the section unregistered");
            assert.notInclude(layers(), "graphicalAbstract", "the Abstract given back");
            assert.isNull(win.document.getElementById("wv-ga-lightbox"), "no full-size view");
            assert.isNull(win.document.getElementById("wv-ga-sec-style"), "no sheet");
            assert.isNull(wv._wvGaStandIn(abstractBox()), "no stand-in");
            const html = await abstractHTML();
            assert.equal(html, ABS1, "Zotero's Abstract with its picture, as Zotero has it");
        });
        assert.ok(await wvT.waitFor(() => !!wv._wvGaSecKey && layers().includes("graphicalAbstract"), 8000, 50), "on again");
        // The Feeds' own deferred pass after switching on (feeds.ts _wvFdApply: the column's
        // registration, then 600 ms later a re-sort of the feed views) lands before the
        // teardown switches collections: once, a switch right after it crashed Zotero
        // (libraryView itemSelected -> "elem is null" in itemPane.js, whose feed buttons --
        // setTranslateButton / setReadLabel -- were not there; 2026-11-22, not reproduced
        // with this wait).
        await wvT.sleep(1500);
    });
});
