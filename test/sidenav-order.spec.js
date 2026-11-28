/* global describe, it, before, after, assert, Zotero, wvT */

// Weavero's item-pane sections right after Zotero's own, before other plugins' (MJT
// 2026-11-19, on seeing Reference Checker's section above Weavero's: "After Zotero's own
// sections, before other plugins'"). Zotero 11 keeps each window's section order in
// `sidenav.order` and appends a section missing from it last, in registration order;
// backlinks.ts _wvSidenavPlaceOurs writes Weavero's in after Zotero's last own section
// when they are missing, and leaves them where the user put them otherwise.
describe("Weavero — its item-pane sections after Zotero's own, before other plugins'", function () {
    this.timeout(60000);
    const OTHER = "other\\@plugin-sec";
    let wv, win, sn, item, saved0;
    const prefs = /** @type {any} */ (Zotero.Prefs);
    const perWin = typeof prefs.setForWindow === "function";
    const getOrder = () => String((perWin ? prefs.getForWindow(win, "sidenav.order") : prefs.get("sidenav.order")) || "");
    const setOrder = (v) => { if (perWin) prefs.setForWindow(win, "sidenav.order", v); else prefs.set("sidenav.order", v); };
    // Every side navigation of the window (the library's item pane and the reader's
    // context pane each have one), each section once.
    const ours = () => [...new Set(Array.from(win.document.querySelectorAll("item-pane-sidenav .btn[data-pane]"))
        .map(b => String(/** @type {any} */ (b).dataset.pane)).filter(id => id.startsWith(win.CSS.escape("weavero@mjthoraval") + "-")))];
    // Weavero's default order: References above the link sections (MJT 2026-11-20).
    const DEFAULT = ["weavero-references", "weavero-citedby", "weavero-links", "weavero-backlinks"];
    const rank = (id) => { const r = DEFAULT.indexOf(id.slice(id.lastIndexOf("-weavero-") + 1)); return r < 0 ? DEFAULT.length : r; };
    const inOrder = (ids) => ids.slice().sort((a, b) => rank(a) - rank(b));
    const pane = (name) => ours().find(id => id.endsWith("-" + name)) || null;
    // A section tied to one of Zotero's goes right before or after it (backlinks.ts WV_SIDENAV_TIE):
    // the Graphical Abstract just above the Abstract (feeds-graphical.ts; MJT 2026-11-22).
    const TIE = { "weavero-graphical-abstract": { anchor: "abstract", before: true } };
    const tieOf = (id) => { const n = Object.keys(TIE).find(k => id.endsWith("-" + k)); return n ? TIE[n] : null; };
    const anchorOf = (id) => { const t = tieOf(id); return t ? t.anchor : null; };

    before(async function () {
        wv = wvT.plugin();
        wvT.method("_wvSidenavPlaceOurs");
        win = Zotero.getMainWindow();
        sn = /** @type {any} */ (Array.from(win.document.querySelectorAll("item-pane-sidenav")).find(s => typeof (/** @type {any} */ (s)).getPersistedOrder === "function"));
        saved0 = getOrder();
        // An item shown in the library's pane: the side navigation draws every section's button.
        item = await wvT.createItem("journalArticle", { title: "WV sidenav order" });
        await win.ZoteroPane.selectItem(item.id);
        await wvT.waitFor(() => ours().length >= 2 || null, 15000, 100);
    });

    after(async function () {
        try { setOrder(saved0); } catch (e) {}
        if (item) await wvT.erase(item);
    });

    it("missing from the saved order: Weavero's sections are written in right after Related, before another plugin's", function () {
        if (!sn) {
            // A Zotero with no section order: nothing to do, nothing written.
            assert.isTrue(wv._wvSidenavPlaceOurs(win), "no-op");
            return;
        }
        const mine = ours().filter(id => !anchorOf(id));
        const tied = ours().filter(id => anchorOf(id));
        assert.isAtLeast(mine.length, 2, "fixture: Links and Backlinks drawn in the side navigation " + JSON.stringify(mine));
        const own = sn._builtInPanes;
        setOrder(own.concat([OTHER]).join(","));
        assert.isTrue(wv._wvSidenavPlaceOurs(win), "placed");
        const order = getOrder().split(",");
        const rel = order.indexOf("related");
        assert.deepEqual(order.slice(rel + 1, rel + 1 + mine.length), inOrder(mine), "Weavero's sections right after Related, References first: " + order.join(", "));
        assert.isAbove(order.indexOf(OTHER), Math.max(...mine.map(id => order.indexOf(id))), "the other plugin's section after Weavero's");
        for (const id of tied) assert.equal(order[order.indexOf(anchorOf(id)) + (tieOf(id).before ? -1 : 1)], id, id + " right " + (tieOf(id).before ? "before " : "after ") + anchorOf(id) + ": " + order.join(", "));
    });

    it("References (and Cited by) missing while the link sections are placed: they go above them", function () {
        if (!sn) return;
        const refs = pane("weavero-references"), links = pane("weavero-links"), bl = pane("weavero-backlinks");
        const cb = pane("weavero-citedby");
        assert.ok(refs && links && bl, "fixture: References, Item Links and Backlinks drawn " + JSON.stringify(ours()));
        const own = sn._builtInPanes;
        // As a window set up before References and Cited by existed: the link sections placed after Related.
        setOrder(own.concat([links, bl, OTHER]).join(","));
        assert.isTrue(wv._wvSidenavPlaceOurs(win), "placed");
        const order = getOrder().split(",");
        const rel = order.indexOf("related");
        const want = cb ? [refs, cb, links, bl] : [refs, links, bl];
        assert.deepEqual(order.slice(rel + 1, rel + 1 + want.length), want, "References right above Item Links, Cited by right after it: " + order.join(", "));
    });

    it("already in the saved order: where the user put them stays", function () {
        if (!sn) return;   // a Zotero with no section order: the case above checked the no-op
        const mine = ours();
        const own = sn._builtInPanes;
        const userOrder = own.concat([OTHER], mine).join(",");
        setOrder(userOrder);
        assert.isTrue(wv._wvSidenavPlaceOurs(win), "nothing left to place");
        assert.equal(getOrder(), userOrder, "the user's order untouched");
    });
});
