/* global describe, it, before, after, assert, Zotero */

// Plugins Manager → Recent Updates time frame (2026-09-23): about:addons
// hard-codes "recent" as the last 2 days and never says so. Weavero puts a
// button on the heading row that opens the page's own <panel-list> (Last day /
// 2 / 7 / 30 / 90 days / All), stores the pick in
// `weavero.pluginsRecentUpdatesDays`, and re-filters the page's <addon-list>
// through its `setSections` + `render`. The stand-in list below implements
// exactly that API the way aboutaddons.js does: render() wipes the element,
// builds one <section> per section entry, and renders the heading only when a
// card made it in. The menu machinery (<panel-list>) is the page's; the
// stand-in document has none, so a pick goes through the row's `_wvPick`, the
// same function the menu items call.

describe("Weavero — Plugins Manager: Recent Updates time frame", () => {
    let wv, savedPref;
    const PREF = "weavero.pluginsRecentUpdatesDays";
    const DAY = 86400000;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvPMEnsureRecentFrame !== "function") this.skip();
        savedPref = Zotero.Prefs.get(PREF);
    });
    after(() => {
        if (savedPref === undefined) { try { Zotero.Prefs.clear(PREF); } catch (e) {} }
        else Zotero.Prefs.set(PREF, savedPref);
    });

    const fixture = (addons) => {
        const mw = Zotero.getMainWindow();
        const d = mw.document.implementation.createHTMLDocument("wv-pm-recent-test");
        const main = d.createElement("div");
        main.id = "main";
        d.body.appendChild(main);
        const list = /** @type {any} */ (d.createElement("addon-list"));
        main.appendChild(list);
        // The page's own recent view: 2 days, heading id, same filter shape.
        const zoteroSections = () => {
            const limit = Date.now() - 2 * DAY;
            return [{ headingId: "recent-updates-heading", filterFn: a => !a.hidden && a.updateDate && a.updateDate > limit }];
        };
        list.setSections = function (sections) { this.sections = sections.map(s => Object.assign({}, s)); };
        list.render = async function () {
            this.textContent = "";
            for (let i = 0; i < this.sections.length; i++) {
                const s = this.sections[i];
                const section = d.createElement("section");
                const matching = addons.filter(s.filterFn).sort((a, b) => b.updateDate - a.updateDate);
                if (matching.length) {
                    const h2 = d.createElement("h2");
                    h2.className = "list-section-heading";
                    h2.setAttribute("data-l10n-id", s.headingId);
                    h2.textContent = "Recent Updates";
                    section.appendChild(h2);
                }
                for (const a of matching) {
                    const card = /** @type {any} */ (d.createElement("addon-card"));
                    card.setAttribute("addon-id", a.id);
                    const n = d.createElement("h3"); n.className = "addon-name"; n.textContent = a.name; card.appendChild(n);
                    card.addon = a;
                    section.appendChild(card);
                }
                s.node = section;
                this.appendChild(section);
            }
            if (!this.querySelector("addon-card")) { const p = d.createElement("p"); p.id = "empty-list-message"; this.appendChild(p); }
            this.renders = (this.renders || 0) + 1;
        };
        list.setSections(zoteroSections());
        const win = { document: d, MutationObserver: mw.MutationObserver, location: { href: "chrome://zotero/content/standalone/basicViewer.xhtml" } };
        const cards = () => [...d.querySelectorAll("addon-card")].map(c => c.getAttribute("addon-id"));
        const row = () => /** @type {any} */ (d.getElementById("wv-pm-recent-row"));
        const button = () => /** @type {any} */ (d.getElementById("wv-pm-recent-frame"));
        const label = () => { const b = button(); return b && b.querySelector(".wv-pm-recent-label").textContent; };
        const items = () => /** @type {any[]} */ ([...d.querySelectorAll("#wv-pm-recent-row panel-item")]);
        const pick = (days) => row()._wvPick(days);
        const tick = () => new Promise(r => mw.setTimeout(r, 30));
        return { d, list, win, cards, row, button, label, items, pick, tick, mw, zoteroSections };
    };
    const addons = () => [
        { id: "today@x", name: "Today", updateDate: Date.now() - DAY / 2 },
        { id: "fivedays@x", name: "Five days", updateDate: Date.now() - 5 * DAY },
        { id: "forty@x", name: "Forty days", updateDate: Date.now() - 40 * DAY },
        { id: "hidden@x", name: "Hidden", hidden: true, updateDate: Date.now() - DAY / 2 },
    ];

    it("default 2 days: the button sits on the heading row with the page's menu behind it; the list is left as the page rendered it", async () => {
        Zotero.Prefs.set(PREF, 2);
        const f = fixture(addons());
        await f.list.render();                       // the page's own render
        wv._wvPMInject(f.win, f.d);                  // the observer's first sync runs inside
        await f.tick();
        const btn = f.button();
        assert.isOk(btn, "button injected");
        assert.equal(btn.tagName, "BUTTON", "a plain page button, not a select");
        assert.equal(f.label(), "Last 2 days", "shows the stored frame");
        assert.deepEqual(f.items().map(i => i.dataset.days), ["1", "2", "7", "30", "90", "0"], "the frames, All last");
        assert.deepEqual(f.items().map(i => i.textContent), ["Last day", "Last 2 days (default)", "Last 7 days", "Last 30 days", "Last 90 days", "All"], "Zotero's own frame named as the default");
        assert.deepEqual(f.items().filter(i => i.hasAttribute("checked")).map(i => i.dataset.days), ["2"], "the current frame is checked");
        const row = f.row();
        assert.equal(row.parentNode, f.list.sections[0].node, "row at the top of the section");
        assert.equal(row.firstElementChild.getAttribute("data-l10n-id"), "recent-updates-heading", "the page's heading moved into the row");
        assert.equal(row.querySelector("button"), btn, "button after the heading");
        assert.equal(row.querySelector("panel-list").previousElementSibling, btn, "menu right after its button");
        assert.deepEqual(f.cards(), ["today@x"], "2 days: only today's, hidden ones never");
        assert.equal(f.list.renders, 1, "no second render for the page's own frame");
    });

    it("picking a frame re-filters at once and stores the choice; All shows every dated plugin", async () => {
        Zotero.Prefs.set(PREF, 2);
        const f = fixture(addons());
        await f.list.render();
        wv._wvPMInject(f.win, f.d);
        await f.tick();
        f.pick(7);
        await f.tick(); await f.tick();
        assert.equal(Zotero.Prefs.get(PREF), 7, "stored");
        assert.deepEqual(f.cards(), ["today@x", "fivedays@x"], "7 days");
        assert.isOk(f.button(), "button back after the re-render");
        assert.equal(f.label(), "Last 7 days");
        assert.deepEqual(f.items().filter(i => i.hasAttribute("checked")).map(i => i.dataset.days), ["7"]);
        f.pick(0);
        await f.tick(); await f.tick();
        assert.deepEqual(f.cards(), ["today@x", "fivedays@x", "forty@x"], "All");
        assert.equal(Zotero.Prefs.get(PREF), 0);
        assert.equal(f.label(), "All");
    });

    it("a stored frame is applied to a fresh page render, once; a re-render keeps the row", async () => {
        Zotero.Prefs.set(PREF, 30);
        const f = fixture(addons());
        await f.list.render();                       // the page: 2 days
        assert.deepEqual(f.cards(), ["today@x"]);
        wv._wvPMInject(f.win, f.d);
        await f.tick(); await f.tick();
        assert.deepEqual(f.cards(), ["today@x", "fivedays@x"], "30 days applied");
        assert.equal(f.list.renders, 2, "exactly one extra render");
        assert.equal(f.label(), "Last 30 days");
        // The page reloads its view: a new render with its own sections.
        f.list.setSections(f.zoteroSections());
        f.list._wvRecentDays = undefined;
        await f.list.render();
        await f.tick(); await f.tick();
        assert.deepEqual(f.cards(), ["today@x", "fivedays@x"], "re-applied after the page's reload");
        assert.lengthOf(f.d.querySelectorAll("#wv-pm-recent-row"), 1, "one row");
        assert.lengthOf(f.d.querySelectorAll("#wv-pm-recent-frame"), 1, "one button");
        await f.tick(); await f.tick();
        assert.equal(f.list.renders, 4, "and then quiet (no render loop)");
    });

    it("an empty result still shows the row with its own heading, so the frame can be widened", async () => {
        Zotero.Prefs.set(PREF, 1);
        const f = fixture(addons().filter(a => a.id !== "today@x" && a.id !== "hidden@x"));
        await f.list.render();
        wv._wvPMInject(f.win, f.d);
        await f.tick(); await f.tick();
        assert.deepEqual(f.cards(), [], "nothing within a day");
        const row = f.row();
        assert.isOk(row, "row present");
        assert.equal(row.querySelector("h2").textContent, "Recent Updates", "its own heading");
        assert.equal(f.label(), "Last day");
        f.pick(90);
        await f.tick(); await f.tick();
        assert.deepEqual(f.cards(), ["fivedays@x", "forty@x"], "widened");
        assert.isNotOk(f.d.querySelector("#wv-pm-recent-row h2[data-wv-own]"), "the page's heading replaced our stand-in");
    });

    it("a fresh manager starts on the Plugins list: the last-view pref is reset before the window opens", () => {
        // about:addons restores `extensions.ui.lastCategory` at initialization;
        // Weavero's open path resets it (MJT 2026-09-23: Recent Updates must
        // not persist across closing and reopening the window).
        const PREF_LAST = "extensions.ui.lastCategory";
        let saved = null;
        try { saved = Services.prefs.getStringPref(PREF_LAST); } catch (e) {}
        try {
            Services.prefs.setStringPref(PREF_LAST, "addons://updates/recent");
            wv._wvPMResetLastView();
            assert.equal(Services.prefs.getStringPref(PREF_LAST), "addons://list/extension");
        }
        finally { if (saved !== null) Services.prefs.setStringPref(PREF_LAST, saved); }
    });

    it("removal puts the heading back and drops the row", async () => {
        Zotero.Prefs.set(PREF, 2);
        const f = fixture(addons());
        await f.list.render();
        wv._wvPMInject(f.win, f.d);
        await f.tick();
        wv._wvPMRemoveRecentFrame(f.d);
        assert.isNotOk(f.d.getElementById("wv-pm-recent-row"));
        assert.equal(f.list.sections[0].node.firstElementChild.getAttribute("data-l10n-id"), "recent-updates-heading", "heading first in the section again");
    });
});
