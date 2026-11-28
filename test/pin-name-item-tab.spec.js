/* global describe, it, before, after, assert, Zotero, wvT */
// "Show Tab Name" on an ITEM tab, on every Zotero (MJT 2026-11-21:
// "Also add a show name when pinned to any tab: it does not cost much and can
// give emphasis when the user wants"; "Show the option to display the name
// when pinned only on pinned tabs"). library-tab-native.spec.js checks the
// same entry where library tabs are tabs (Zotero 11); this one runs on Zotero
// 10 too, with note tabs: the entry only on a pinned tab, that tab's own
// choice (tabs.ts _wvTabShowsPinName, `weavero.pinnedTabNames`), kept by item
// across an unpin and a re-pin.
describe("Weavero — a pinned item tab can show its name", function () {
    this.timeout(120000);
    let wv, win, doc, ZT, p, u, prevTW;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const tabOf = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const node = (id) => Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"]')).find(el => el.getBoundingClientRect().width > 0) || null;
    const mirror = (it) => { const t = tabOf(it); return t && doc.querySelector('#wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + t.id + '"]'); };
    const rect = (el) => el.getBoundingClientRect();
    const zpins = () => !!(wvT.lib().wvZoteroPinsTabs && wvT.lib().wvZoteroPinsTabs());
    const apply = () => { wv._applyPinnedTabs(win); };
    const pin = (it) => { wv._pinnedTabsAdd(it.libraryID, it.key); apply(); };
    const unpin = (it) => {
        if (zpins()) { const t = tabOf(it); if (t && t.pinned) ZT.setPinned(t.id, false); }
        wv._pinnedTabsRemove(it.libraryID, it.key);
        apply();
    };
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    function closeMenus() {
        for (const pp of doc.querySelectorAll("popupset > menupopup")) { try { if (pp.state === "open") pp.hidePopup(); } catch (er) {} }
    }
    /** The tab menu of `it`'s tab, open: the "pinName" entry, the one before it. */
    async function entry(it) {
        const t = tabOf(it);
        const r = rect(mirror(it) || node(t.id));
        const before = new Set(doc.querySelectorAll("popupset > menupopup"));
        const popup = ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), t.id);
        await waitFor(() => {
            const pp = popup || Array.from(doc.querySelectorAll("popupset > menupopup")).find(x => !before.has(x));
            return pp && pp.state === "open";
        }, 5000, "the tab menu to open");
        await sleep(300);
        for (const pp of doc.querySelectorAll("popupset > menupopup")) {
            if (pp.state !== "open" && pp.state !== "showing") continue;
            const shown = Array.from(pp.children).filter(ch => !ch.hidden && win.getComputedStyle(ch).display !== "none");
            const i = shown.findIndex(ch => ch.getAttribute("data-wv-key") === "pinName");
            return { mi: i >= 0 ? shown[i] : null, prev: i > 0 ? shown[i - 1] : null, popup: pp,
                desc: shown.map(ch => (wv._wvTabMenuItemKey(ch) || "-") + ":" + (ch.getAttribute("label") || ch.localName)).join(" | ") };
        }
        return { mi: null, popup: null, desc: "no open menu" };
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_applyPinnedTabs", "_pinnedTabsAdd", "_pinnedTabsRemove", "_wvTabShowsPinName", "_wvPinNameSet", "_wvTabMenuItemKey"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        if (typeof ZT._openMenu !== "function") wvT.absent("Zotero_Tabs._openMenu");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        try { Zotero.Prefs.clear("weavero.pinnedTabNames"); } catch (er) {}
        const made = [];
        for (const name of ["P", "U"]) {
            const it = new Zotero.Item("note"); it.setNote("<p>wv pin name " + name + "</p>"); await it.saveTx();
            await win.ZoteroPane.openNote(it.id, { openInWindow: false });
            await waitFor(() => tabOf(it), 15000, "note tab " + name);
            made.push(it);
        }
        [p, u] = made;
        pin(p);
        await waitFor(() => mirror(p), 5000, "P drawn as a pin");
        try { ZT.select("zotero-pane"); } catch (er) {}
        await sleep(300);
    });

    after(async function () {
        closeMenus();
        try { Zotero.Prefs.clear("weavero.pinnedTabNames"); } catch (er) {}
        for (const it of [p, u]) { if (it) { try { unpin(it); } catch (er) {} } }
        for (const it of [p, u]) { const t = it && tabOf(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(400);
        await wvT.erase(p, u);
        try { if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW); } catch (er) {}
    });

    it("a pinned item tab: the entry, unchecked, right after the pin entry; it shows that tab's name alone", async function () {
        const w0 = rect(mirror(p)).width;
        assert.notOk(mirror(p).hasAttribute("data-wv-named"), "an icon by default");
        const e = await entry(p);
        assert.ok(e.mi, "on the pinned tab's menu: " + e.desc);
        assert.strictEqual(e.mi.getAttribute("type"), "checkbox", "a checkbox");
        assert.notOk(wvT.lib().wvBoolAttrOn(e.mi, "checked"), "unchecked");
        assert.strictEqual(wv._wvTabMenuItemKey(e.prev), "pin", "right after the pin entry: " + e.desc);
        e.mi.doCommand();
        closeMenus();
        await waitFor(() => mirror(p) && mirror(p).hasAttribute("data-wv-named"), 3000, "the name shown");
        const ttl = mirror(p).querySelector(".wv-pinned-mirror-title");
        assert.notStrictEqual(win.getComputedStyle(ttl).display, "none", "the title is drawn");
        assert.strictEqual(ttl.textContent, tabOf(p).title, "the tab's own title");
        assert.isAbove(rect(mirror(p)).width, w0 + 10, "wider than the icon (" + rect(mirror(p)).width + " vs " + w0 + ")");
        assert.isAtMost(rect(mirror(p)).width, 200.5, "a tab's width at most");
        assert.include(String(Zotero.Prefs.get("weavero.pinnedTabNames")), p.key, "kept by item");
        assert.isFalse(wv._wvTabShowsPinName(tabOf(u)), "the other tab's choice untouched");
        const e2 = await entry(p);
        assert.ok(e2.mi && wvT.lib().wvBoolAttrOn(e2.mi, "checked"), "checked once on: " + e2.desc);
        closeMenus();
        await sleep(200);
    });

    it("an unpinned tab's menu has no such entry", async function () {
        const e = await entry(u);
        assert.ok(e.popup, "fixture: the menu opened");
        assert.notOk(e.mi, "none on an unpinned tab: " + e.desc);
        closeMenus();
        await sleep(200);
    });

    it("the choice is kept across an unpin and a re-pin, and the entry turns it off", async function () {
        unpin(p);
        await waitFor(() => !mirror(p), 3000, "unpinned");
        pin(p);
        await waitFor(() => mirror(p) && mirror(p).hasAttribute("data-wv-named"), 3000, "re-pinned with its name");
        const e = await entry(p);
        assert.ok(e.mi && wvT.lib().wvBoolAttrOn(e.mi, "checked"), "checked: " + e.desc);
        e.mi.doCommand();
        closeMenus();
        await waitFor(() => mirror(p) && !mirror(p).hasAttribute("data-wv-named"), 3000, "off: the icon alone");
        assert.notInclude(String(Zotero.Prefs.get("weavero.pinnedTabNames") || ""), p.key, "the choice removed");
    });
});
