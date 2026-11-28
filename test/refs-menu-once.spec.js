/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils, Components, Services */
// A reference's menu -- the card of the cited work, then its entries -- opens ONCE,
// at its final size (refs.ts refsCardMoreAhead, refsGaBoxSize). MJT 2026-11-24, a
// green in-library mark of a PDF's reference list clicked: "the menu opens in two
// steps with a flicker". "More" (the abstract cut at four lines) was decided at
// popupshown and the graphical abstract's box shown when its picture had loaded:
// the menu was drawn, then grew -- a native resize of a menu already on screen.
// The mark, a row's ⋯ and a right-click all open it through _wvRefsMenu, called
// here directly (a stand-in reader in the main window: no PDF needed).
// The menu's height is read at its popupshown in the CAPTURE phase at the window,
// before any listener of the menu's own runs (the card's work is one), i.e. the
// size it was shown at; then again once that work has settled (the picture
// loaded). The two are equal.
describe("Weavero — references: the card's menu opens once, at its final size", function () {
    this.timeout(120000);
    let wv, win, doc;
    const made = [];
    let long, longImg, wideImg, short, sweep;
    const LONG = "We study drops falling on a plate heated above the Leidenfrost point inside a vacuum chamber. "
        + "High-speed imaging resolves the first microseconds of the impact, and simulations reproduce the shapes measured. "
        + "The maximal spreading follows a scaling law derived from an energy balance that includes the vapour layer. "
        + "Three regimes are separated by critical impact velocities, and a model of the vapour layer under the drop explains "
        + "the transitions between them. The model agrees with the experiments within ten percent over two decades of pressure.";

    async function pngBytes(w, h) {
        const c = /** @type {any} */ (Zotero.getMainWindow().document.createElementNS("http://www.w3.org/1999/xhtml", "canvas"));
        c.width = w; c.height = h;
        const g = c.getContext("2d");
        g.fillStyle = "#2c7be5"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#f5a623"; g.beginPath(); g.arc(w / 2, h / 2, h / 3, 0, Math.PI * 2); g.fill();
        const bin = atob(c.toDataURL("image/png").split(",")[1]);
        const a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return a;
    }
    async function article(title, abs) {
        const it = new Zotero.Item("journalArticle");
        it.libraryID = Zotero.Libraries.userLibraryID;
        it.setField("title", title);
        it.setField("date", "2016");
        it.setField("abstractNote", abs);
        it.setCreators([{ creatorType: "author", lastName: "Adams", firstName: "J." }]);
        await it.saveTx();
        made.push(it);
        return it;
    }
    async function picture(parent, w, h) {
        const path = PathUtils.join(PathUtils.tempDir, "wv-refs-once-" + w + "x" + h + "-" + Date.now() + ".png");
        await IOUtils.write(path, await pngBytes(w, h));
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: parent.id });
        try { await IOUtils.remove(path); } catch (e) {}
        made.unshift(att);
        return att;
    }

    /** The menu as it is drawn: its height (the element's and its window's), "More" on
     *  screen or not, the picture's box. */
    function snap(pop) {
        const card = pop.querySelector(".wv-refs-card");
        const more = card && card.querySelector(".wv-refs-card-more");
        const box = card && card.querySelector(".wv-refs-card-ga");
        const br = box ? box.getBoundingClientRect() : null;
        return {
            h: pop.getBoundingClientRect().height,
            oh: pop.getOuterScreenRect().height,
            more: !!more && win.getComputedStyle(more).display !== "none",
            box: br ? [Math.round(br.width * 10) / 10, Math.round(br.height * 10) / 10] : null,
        };
    }

    /** Open `item`'s menu; its snap when it was shown (capture at the window) and once
     *  the card's work has settled. */
    async function openMenu(item, picture) {
        const reader = { _window: win, itemID: null, tabID: null };
        const btn = doc.getElementById("tab-bar-container") || doc.documentElement;
        let first = null;
        const onShown = (e) => {
            const p = doc.getElementById("wv-refs-menu");
            if (p && e.target === p && !first) { try { first = snap(p); } catch (er) { first = { err: String(er) }; } }
        };
        win.addEventListener("popupshown", onShown, true);
        let pop;
        try {
            wv._wvRefsMenu(reader, [item.id], "primary", btn);
            pop = doc.getElementById("wv-refs-menu");
            assert.ok(pop, "the menu");
            assert.ok(await wvT.waitFor(() => first, 5000, 10), "shown (" + pop.state + ")");
        }
        finally { win.removeEventListener("popupshown", onShown, true); }
        if (picture) {
            assert.ok(await wvT.waitFor(() => { const i = pop.querySelector(".wv-refs-card-ga > img"); return i && i.complete && i.naturalWidth > 0; }, 5000, 20), "the picture loaded");
        }
        await wvT.sleep(400);
        return { pop, first, last: snap(pop) };
    }
    async function closeMenu(pop) {
        try { pop.hidePopup(); } catch (e) {}
        await wvT.waitFor(() => !doc.getElementById("wv-refs-menu"), 3000, 50);
    }
    function sameSize(m, what) {
        assert.notProperty(m.first, "err");
        assert.approximately(m.last.h, m.first.h, 0.5, what + ": the menu's height as it was shown (" + JSON.stringify(m.first) + " -> " + JSON.stringify(m.last) + ")");
        assert.approximately(m.last.oh, m.first.oh, 0.5, what + ": its window's too");
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvRefsMenu");
        win = Zotero.getMainWindow(); doc = win.document;
        long = await article("Drop impact on a heated plate in a vacuum chamber", LONG);
        longImg = await article("Drop impact, with a graphical abstract", LONG);
        await picture(longImg, 480, 280);
        wideImg = await article("Drop impact, with a wide graphical abstract", LONG);
        await picture(wideImg, 600, 150);
        short = await article("Splashing of ethanol drops", "Ethanol drops splash on glass.");
        sweep = await article("Drop impact, abstracts of every length", LONG);
    });

    after(async function () {
        const p = doc && doc.getElementById("wv-refs-menu");
        if (p) await closeMenu(p);
        await wvT.erase(...made);
    });

    it("a long abstract: \"More\" is there when the menu is first drawn, and the menu keeps its height", async function () {
        const m = await openMenu(long, false);
        try {
            assert.isTrue(m.first.more, "More at the menu's first layout: " + JSON.stringify(m.first));
            assert.isTrue(m.last.more, "and after");
            sameSize(m, "a long abstract");
        }
        finally { await closeMenu(m.pop); }
    });

    it("a short abstract: no \"More\", and the menu keeps its height", async function () {
        const m = await openMenu(short, false);
        try {
            assert.isFalse(m.first.more, "no More: " + JSON.stringify(m.first));
            assert.isFalse(m.last.more);
            sameSize(m, "a short abstract");
        }
        finally { await closeMenu(m.pop); }
    });

    // The cut is decided on an off-screen double of the card (the menu's content has no
    // layout before it opens): its verdict must be the open menu's own, on both sides of
    // the fourth line.
    it("at every length of abstract, the \"More\" decided before the open is the open menu's own verdict", async function () {
        const words = LONG.split(" ");
        const reader = { _window: win, itemID: null, tabID: null };
        const btn = doc.getElementById("tab-bar-container") || doc.documentElement;
        const out = [];
        for (let n = 24; n <= words.length; n += 3) {
            sweep.setField("abstractNote", words.slice(0, n).join(" "));
            await sweep.saveTx();
            let at = null;
            const onShown = (e) => {
                const p = doc.getElementById("wv-refs-menu");
                if (!p || e.target !== p || at) return;
                const abs = p.querySelector(".wv-refs-card-abs"), more = p.querySelector(".wv-refs-card-more");
                at = { n, ahead: !more.hidden, menu: abs.scrollHeight > abs.clientHeight + 1, lines: Math.round(abs.scrollHeight / Math.max(1, parseFloat(win.getComputedStyle(abs).lineHeight) || 17)) };
            };
            win.addEventListener("popupshown", onShown, true);
            try {
                wv._wvRefsMenu(reader, [sweep.id], "primary", btn);
                assert.ok(await wvT.waitFor(() => at, 5000, 10), "shown, " + n + " words");
            }
            finally { win.removeEventListener("popupshown", onShown, true); }
            await closeMenu(doc.getElementById("wv-refs-menu"));
            out.push(at);
        }
        assert.deepEqual(out.filter(x => x.ahead !== x.menu), [], "the verdict before the open is the menu's: " + JSON.stringify(out));
        assert.ok(out.some(x => x.menu) && out.some(x => !x.menu), "both sides of the cut tried: " + JSON.stringify(out));
    });

    it("a graphical abstract: its box has its room before the picture loads; the menu keeps its height", async function () {
        const m = await openMenu(longImg, true);
        try {
            assert.isTrue(m.first.more, "More at the first layout");
            assert.deepEqual(m.first.box, [240, 140], "the picture's room kept from the start (240 x 140: its size not known yet)");
            assert.deepEqual(m.last.box, [240, 140], "the same once it has loaded");
            const r = m.pop.querySelector(".wv-refs-card-ga > img").getBoundingClientRect();
            assert.ok(r.width <= 240.5 && r.height <= 140.5 && r.width > 50, "the picture at most 240 x 140 (" + r.width + " x " + r.height + ")");
            sameSize(m, "a graphical abstract");
        }
        finally { await closeMenu(m.pop); }
    });

    // MJT 2026-11-24, the card's menu "first appears as a rectangle with a grey background": Windows
    // 11 draws menus on its Mica backdrop, and a NEW popup window shows that backdrop alone until
    // Gecko's first frame of it (filmed off the screen: 60-80 ms; Zotero's own items-list menu at its
    // first opening only, a kept menu never). The reference menu was a new menupopup at every opening;
    // it is now one element per window, kept between openings with its popup window (refs.ts
    // refsMenuPopup). What a spec can see is that element: the same at every opening, the new
    // reference's content in it, and, closed, emptied and out of the way -- no #wv-refs-menu, none of
    // this instance's listeners or expandos left on it.
    it("one menu element per window, kept between openings (its popup window with it), emptied while closed", async function () {
        const Cu = Components.utils;
        const scope = Cu.getGlobalForObject(wv._wvWireTag);
        const ours = (el) => Array.from(Services.els.getListenerInfoFor(el)).filter((li) => { try { return typeof li.listenerObject === "function" && Cu.getGlobalForObject(li.listenerObject) === scope; } catch (e) { return false; } }).length;
        const m1 = await openMenu(long, false);
        const el = m1.pop;
        const n1 = ours(el);
        m1.pop._wvFdFeed = 1;   // an opener's expando (feeds-badge.ts)
        await closeMenu(m1.pop);
        // Booleans, never an element, in an assertion: a failure carrying one is not reported.
        assert.isFalse(!!doc.getElementById("wv-refs-menu"), "closed: no #wv-refs-menu");
        const idle = doc.getElementById("wv-refs-menu-idle");
        assert.isTrue(!!idle && idle === el, "the closed menu waits, the same element (" + (idle ? idle.localName : "none") + ")");
        assert.equal(idle.childNodes.length, 0, "emptied");
        assert.equal(ours(idle), 0, "none of the opening's listeners left on it");
        assert.isFalse("_wvFdFeed" in idle, "nor its expandos");
        const m2 = await openMenu(short, false);
        try {
            assert.isTrue(m2.pop === el, "the next opening is the same element");
            assert.equal(m2.pop.querySelector(":scope > .wv-refs-card").getAttribute("data-wv-refs-card"), String(short.id), "with the new reference's card, alone");
            assert.equal(m2.pop.querySelectorAll(".wv-refs-card").length, 1);
            assert.equal(ours(m2.pop), n1, "as many listeners as one opening has (" + n1 + ")");
            sameSize(m2, "the kept menu");
        }
        finally { await closeMenu(m2.pop); }
    });

    it("a picture of another shape: reserved whole the first time, fitted to the picture from the next opening on", async function () {
        const m1 = await openMenu(wideImg, true);
        try {
            assert.deepEqual(m1.first.box, [240, 140], "first opening: the whole room");
            const r = m1.pop.querySelector(".wv-refs-card-ga > img").getBoundingClientRect();
            assert.approximately(r.width, 240, 0.5, "the picture fitted in its width");
            assert.approximately(r.height, 60, 0.5, "and its height (600 x 150 at 240 wide)");
            sameSize(m1, "a wide picture, first opening");
        }
        finally { await closeMenu(m1.pop); }
        const m2 = await openMenu(wideImg, true);
        try {
            assert.deepEqual(m2.first.box, [240, 60], "next opening: the box fits the picture");
            sameSize(m2, "a wide picture, next opening");
        }
        finally { await closeMenu(m2.pop); }
    });
});
