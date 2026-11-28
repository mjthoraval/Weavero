/* global describe, it, before, after, assert, Zotero, wvT */
// The People tab and Zotero's context pane IN the tab switch (people.ts
// _wvPeopleWireSelect; MJT 2026-11-24, "When I switch to a researcher tab, it
// keeps the item pane for a short time before showing it correctly"). Zotero
// does nothing to its context pane for a tab type it does not know
// (contextPane.js _handleTabSelect), and Weavero put it away from its tab
// notifier plus a timeout: the switch was painted with the last reader's item
// pane first. Every check here reads the window right after the select
// returns, in the SAME task -- no await between the select and the reads: what
// the user sees at the next paint.
describe("Weavero — People tab: Zotero's context pane follows the tab switch at once", function () {
    this.timeout(120000);
    let wv, win, doc, ZT, pdf, rt, pp, prevState = null;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id && String(t.type).startsWith("reader")) || null;
    const pane = () => doc.getElementById("zotero-context-pane");
    const splitter = () => (win.ZoteroContextPane && win.ZoteroContextPane.splitter) || doc.getElementById("zotero-context-splitter");
    /** Takes room in the window (a collapsed, hidden or display:none box takes none). */
    const drawn = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const marked = () => doc.documentElement.hasAttribute("wv-people-paneoff");
    /** The window as the next paint shows it. */
    const now = () => ({ pane: drawn(pane()), splitter: drawn(splitter()), mark: marked(), paneDisplay: win.getComputedStyle(pane()).display });
    /** A press on tab `id` in the tab bar: Zotero's tab bar calls the select it bound
     *  at its init (tabs.js `onTabSelect: this.select.bind(this)`), past any wrap of
     *  Zotero_Tabs.select. The window is read right after the press, then the click
     *  is finished. */
    const stripPress = (id) => {
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"]')).find(x => x.getBoundingClientRect().width > 0);
        assert.ok(el, "fixture: tab " + id + " in the strip");
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, button: 0, clientX: r.left + Math.min(20, r.width / 2), clientY: r.top + r.height / 2 };
        el.dispatchEvent(new win.MouseEvent("mousedown", o));
        const s = now();
        for (const type of ["mouseup", "click"]) el.dispatchEvent(new win.MouseEvent(type, o));
        return s;
    };
    /** The reader selected and its item pane on screen (Zotero's own handler done:
     *  a select from another tab, Zotero lays the pane out only then). */
    async function onReader() {
        if (ZT.selectedID === rt.id) { ZT.select(libTab().id); await sleep(300); }
        ZT.select(rt.id);
        assert.ok(await wvT.waitFor(() => !marked() && drawn(pane()) && drawn(splitter()), 8000, 50), "precondition: the reader's item pane on screen " + JSON.stringify(now()));
        await sleep(300);
    }
    async function onPeople() {
        ZT.select(pp.id);
        assert.ok(await wvT.waitFor(() => marked() && !drawn(pane()), 8000, 50), "precondition: the People tab with no item pane " + JSON.stringify(now()));
        await sleep(300);
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleTabOf", "_wvPeopleTabClose"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        // The splitter open (a collapsed one hides the pane anyway), before any reader
        // is selected: Zotero reads its state when a reader tab is selected.
        const sp = splitter();
        prevState = sp ? sp.getAttribute("state") : null;
        if (sp && prevState === "collapsed") sp.setAttribute("state", "open");
        pdf = await wvT.createTestPDFItem("wv-people-pane-sync");
        await Zotero.Reader.open(pdf.id, null, { openInWindow: false });
        rt = await wvT.waitFor(() => tabOfItem(pdf), 20000, 100);
        assert.ok(rt, "a reader tab");
        pp = wv._wvPeopleTabOpen(win, { select: false });
        assert.ok(pp, "the People tab");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        const t = pdf && tabOfItem(pdf);
        if (t) { try { ZT.close(t.id); } catch (e) {} }
        await sleep(300);
        try { ZT.select(libTab().id); } catch (e) {}
        // The splitter as it was: the specs after this one lay readers out with it.
        try { const sp = splitter(); if (sp && prevState === "collapsed") sp.setAttribute("state", "collapsed"); } catch (e) {}
        await wvT.erase(pdf);
    });

    it("a reader, then the People tab: the reader's item pane is away when the select returns", async function () {
        await onReader();
        ZT.select(pp.id);
        const s = now();
        assert.isFalse(s.pane, "no item pane in the switch's own task: " + JSON.stringify(s));
        assert.isFalse(s.splitter, "nor its splitter: " + JSON.stringify(s));
        assert.isTrue(s.mark, "the window's mark on");
        // And it stays away once Zotero's own handlers (the notifier's) have run.
        await sleep(600);
        assert.isFalse(drawn(pane()), "still away after: " + JSON.stringify(now()));
    });

    it("the People tab, then the reader: the mark is gone and the pane laid out again when the select returns", async function () {
        await onPeople();
        ZT.select(rt.id);
        const s = now();
        assert.isFalse(s.mark, "the mark off in the switch's own task: " + JSON.stringify(s));
        assert.notEqual(s.paneDisplay, "none", "the pane no longer kept off by the sheet");
        assert.ok(await wvT.waitFor(() => drawn(pane()), 5000, 50), "the reader's item pane back: " + JSON.stringify(now()));
    });

    it("the same through a press in the tab bar (Zotero's bound select, no wrap of Zotero_Tabs.select)", async function () {
        await onReader();
        const a = stripPress(pp.id);
        assert.strictEqual(ZT.selectedID, pp.id, "the press selected the People tab");
        assert.isFalse(a.pane, "no item pane in the press's own task: " + JSON.stringify(a));
        assert.isTrue(a.mark, "the mark on");
        await sleep(400);
        const b = stripPress(rt.id);
        assert.strictEqual(ZT.selectedID, rt.id, "the press selected the reader");
        assert.isFalse(b.mark, "the mark off in the press's own task: " + JSON.stringify(b));
        assert.notEqual(b.paneDisplay, "none");
        assert.ok(await wvT.waitFor(() => drawn(pane()), 5000, 50), "the reader's item pane back");
    });

    it("the library, then the People tab, then the library: no mark left behind", async function () {
        ZT.select(libTab().id);
        await sleep(300);
        ZT.select(pp.id);
        assert.isTrue(marked(), "the mark on with People");
        ZT.select(libTab().id);
        assert.isFalse(marked(), "off in the switch's own task");
        await sleep(300);
        assert.isFalse(drawn(pane()), "Zotero's library layout: no context pane");
    });
});
