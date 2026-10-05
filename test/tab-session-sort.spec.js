/* global describe, it, before, after, assert, Zotero */

// Sort order of the saved-session list (MJT 2026-09-29): Created (the stored
// order -- the only order before, still the default) / Name / Last used,
// chosen from the glyph on the Sessions header and held in the
// `weavero.sessionSort` pref. The section is rendered into the CLOSED
// List-all-tabs panel with a stubbed session document; no popup is opened
// and the real document is put back after every render.

describe("Weavero — session list sort order", () => {
    let wv, win, doc, panel, list, realDoc, prefBefore, revBefore;
    const AUTO = "__wv_autosave__";
    const W = () => [{ kind: "main", tabs: [] }];
    const fixture = () => ({
        version: 1,
        activeSessionId: "act",
        sessions: [
            { id: "b", name: "Session 10", created: 2, modified: 2, lastUsed: 50, windows: W() },
            { id: "a", name: "session 2", created: 1, modified: 9, windows: W() },        // pre-stamp: falls back to modified
            { id: "c", name: "Alpha", created: 3, modified: 3, lastUsed: 70, windows: W() },
            { id: AUTO, name: "Last workspace (auto)", created: 0, modified: 100, lastUsed: 100, windows: W() },
            { id: "act", name: "Active", created: 4, modified: 4, lastUsed: 200, windows: W() },
        ],
    });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvTabSessionSorted !== "function") this.skip();
        win = Zotero.getMainWindow(); doc = win.document;
        panel = doc.getElementById("zotero-tabs-menu-panel");
        list = panel && (panel._tabsList || panel.querySelector("#zotero-tabs-menu-list"));
        if (!list || !wv._wvGetEnableTabSessions()) this.skip();
        realDoc = wv._wvTabSessionDoc;
        prefBefore = Zotero.Prefs.get("weavero.sessionSort");
        revBefore = Zotero.Prefs.get("weavero.sessionSortReverse") === true;
    });

    after(() => {
        if (!wv) return;
        wv._wvTabSessionDoc = realDoc;
        Zotero.Prefs.set("weavero.sessionSort", prefBefore || "created");
        Zotero.Prefs.set("weavero.sessionSortReverse", revBefore);
        clear();
    });

    const clear = () => { for (const el of list.querySelectorAll(".wv-sessmenu-header, .wv-sessmenu-row, .wv-sessmenu-scope")) el.remove(); };
    const render = (mode, reverse = false) => {
        Zotero.Prefs.set("weavero.sessionSort", mode);
        Zotero.Prefs.set("weavero.sessionSortReverse", reverse);
        wv._wvTabSessionDoc = fixture();
        try { wv._wvTabSessionsMenuSection(panel); }
        finally { wv._wvTabSessionDoc = realDoc; }
        // Session rows sit in their scope boxes; the "+ New session" row does not.
        const names = [...list.querySelectorAll(".wv-sessmenu-scope .wv-sessmenu-row .wv-sessmenu-name")].map(n => n.textContent);
        // The header's sort control: dropdown chip (kind) + direction arrow.
        const drop = list.querySelector(".wv-sessmenu-header .wv-sessmenu-sortdrop");
        const dir = list.querySelector(".wv-sessmenu-header .wv-sessmenu-sortdir");
        const rows = [...list.querySelectorAll(".wv-sessmenu-scope .wv-sessmenu-row")];
        const out = {
            names, state: panel.state,
            kind: drop && drop.firstChild.textContent, mode: drop && drop.getAttribute("data-wv-sort"),
            arrow: dir && dir.textContent, dirTitle: dir && dir.getAttribute("title"),
            dates: rows.map(r => { const d = r.querySelector(".wv-sessmenu-date"); return d ? d.textContent : null; }),
            titles: rows.map(r => r.getAttribute("title")),
        };
        clear();
        return out;
    };

    it("created (default): newest first, the active session omitted, the auto slot last", () => {
        const r = render("created");   // stored order b, a, c -> newest first c, a, b
        assert.deepEqual(r.names, ["Alpha", "session 2", "Session 10", "Last workspace (auto)"]);
        assert.strictEqual(r.kind, "Created", "the chip names the current kind");
        assert.strictEqual(r.mode, "created");
        assert.strictEqual(r.arrow, "↓", "newest first = descending");
        assert.strictEqual(r.dirTitle, "Newest first (click to reverse)");
        assert.strictEqual(r.state, "closed", "no popup opened");
    });

    it("name: locale-aware, numeric and case-insensitive; the auto slot still last", () => {
        const r = render("name");
        assert.deepEqual(r.names, ["Alpha", "session 2", "Session 10", "Last workspace (auto)"]);
        assert.strictEqual(r.kind, "Name");
        assert.strictEqual(r.arrow, "↑");
        assert.strictEqual(r.dirTitle, "A to Z (click to reverse)");
    });

    it("last used: most recent first, with the modified/created fallbacks; the auto slot still last", () => {
        const r = render("lastUsed");
        assert.deepEqual(r.names, ["Alpha", "Session 10", "session 2", "Last workspace (auto)"]);
        assert.strictEqual(r.kind, "Last used");
        assert.strictEqual(r.arrow, "↓", "most recent first = descending");
        assert.strictEqual(r.dirTitle, "Most recent first (click to reverse)");
    });

    it("the comparator is stable, copies its input and knows the fallbacks", () => {
        const input = [{ id: 1, name: "x", created: 5 }, { id: 2, name: "x", created: 1 }, { id: 3, name: "a", created: 9 }];
        const byName = wv._wvTabSessionSorted(input, "name");
        assert.deepEqual(byName.map(s => s.id), [3, 1, 2], "equal names keep the stored order");
        assert.deepEqual(input.map(s => s.id), [1, 2, 3], "input untouched");
        assert.deepEqual(wv._wvTabSessionSorted(input, "bogus").map(s => s.id), [1, 2, 3], "unknown mode = stored order");
        assert.strictEqual(wv._wvTabSessionUsedAt({ created: 7 }), 7, "created is the last fallback");
        assert.strictEqual(wv._wvTabSessionUsedAt({ created: 7, modified: 8 }), 8, "modified before created");
        assert.strictEqual(wv._wvTabSessionUsedAt({ created: 7, modified: 8, lastUsed: 6 }), 6, "lastUsed wins");
        assert.strictEqual(wv._wvTabSessionUsedAt({}), 0);
        Zotero.Prefs.set("weavero.sessionSort", "bogus");
        assert.strictEqual(wv._wvTabSessionSortMode(), "created", "a garbage pref reads as the default");
    });

    it("the sort menu: three radio entries, the current one checked, '(default)' on Created", () => {
        Zotero.Prefs.set("weavero.sessionSort", "lastUsed");
        const pop = wv._wvTabSessionSortMenuBuild(doc);
        try {
            assert.strictEqual(pop.id, "wv-sessmenu-sort");
            assert.isTrue(pop.isConnected, "parked in the document, unopened");
            assert.strictEqual(pop.state, "closed");
            const items = [...pop.querySelectorAll("menuitem[type=radio]")];   // the kinds; Reverse order is a checkbox below
            assert.deepEqual(items.map(i => i.getAttribute("label")), ["Created", "Name", "Last used"]);
            assert.isTrue(items.every(i => i.getAttribute("type") === "radio"));
            assert.deepEqual(items.filter(i => i.getAttribute("checked") === "true").map(i => i.getAttribute("data-wv-sort")), ["lastUsed"], "exactly the current order is ticked");
            assert.deepEqual(items.map(i => i.getAttribute("acceltext")), ["(default)", null, null], "the default is marked in the acceltext slot");
            // A rebuild replaces the parked popup, never duplicates it.
            const again = wv._wvTabSessionSortMenuBuild(doc);
            assert.strictEqual(doc.querySelectorAll("#wv-sessmenu-sort").length, 1);
            again.remove();
        }
        finally { try { pop.remove(); } catch (e) {} }
    });

    it("the arrow flips any kind, ties included, and says which way it runs", () => {
        const c = render("created", true);
        assert.deepEqual(c.names, ["Session 10", "session 2", "Alpha", "Last workspace (auto)"], "created reversed = oldest first, the stored order");
        assert.strictEqual(c.arrow, "↑"); assert.strictEqual(c.dirTitle, "Oldest first (click to reverse)");
        assert.strictEqual(c.mode, "created reversed");
        const n = render("name", true);
        assert.deepEqual(n.names, ["Session 10", "session 2", "Alpha", "Last workspace (auto)"], "name reversed = Z to A");
        assert.strictEqual(n.arrow, "↓"); assert.strictEqual(n.dirTitle, "Z to A (click to reverse)");
        const r = render("lastUsed", true);
        assert.deepEqual(r.names, ["session 2", "Session 10", "Alpha", "Last workspace (auto)"], "last used reversed = least recent first");
        assert.strictEqual(r.arrow, "↑"); assert.strictEqual(r.dirTitle, "Least recent first (click to reverse)");
        // The explicit argument wins over the pref, both ways.
        const input = [{ id: 1, name: "b" }, { id: 2, name: "a" }];
        assert.deepEqual(wv._wvTabSessionSorted(input, "name", true).map(s => s.id), [1, 2]);
        assert.deepEqual(wv._wvTabSessionSorted(input, "name", false).map(s => s.id), [2, 1]);
    });

    it("changing the kind clears the reverse flag; re-picking the same kind keeps it", () => {
        Zotero.Prefs.set("weavero.sessionSort", "name");
        wv._wvTabSessionSetSortReverse(true);
        wv._wvTabSessionSetSortMode("name");
        assert.isTrue(wv._wvTabSessionSortReverse(), "same kind: flag kept");
        wv._wvTabSessionSetSortMode("lastUsed");
        assert.isFalse(wv._wvTabSessionSortReverse(), "new kind: natural direction");
        assert.strictEqual(wv._wvTabSessionSortMode(), "lastUsed");
    });

    it("the menu holds the kinds only; direction lives on the arrow chip", () => {
        Zotero.Prefs.set("weavero.sessionSort", "created");
        wv._wvTabSessionSetSortReverse(true);
        const pop = wv._wvTabSessionSortMenuBuild(doc);
        try {
            assert.deepEqual([...pop.children].map(k => k.localName), ["menuitem", "menuitem", "menuitem"]);
            assert.strictEqual(pop.children[0].getAttribute("checked"), "true", "the kind's tick is independent of the flag");
        }
        finally { try { pop.remove(); } catch (e) {} }
        const d = (m, rev) => wv._wvTabSessionSortDirInfo(m, rev);
        assert.deepEqual(d("created", false), { asc: false, arrow: "↓", label: "Newest first" });
        assert.deepEqual(d("created", true), { asc: true, arrow: "↑", label: "Oldest first" });
        assert.deepEqual(d("lastUsed", false), { asc: false, arrow: "↓", label: "Most recent first" });
        assert.deepEqual(d("lastUsed", true), { asc: true, arrow: "↑", label: "Least recent first" });
        assert.deepEqual(d("name", true), { asc: false, arrow: "↓", label: "Z to A" });
    });

    it("dates: always in the row tooltip; under the name only while sorting on that date", () => {
        const L = ts => new Date(ts).toLocaleString();   // 1970 stamps: never "today", so the full form
        const c = render("created");   // rows, newest first: c(created 3), a(1), b(2), auto(0)
        assert.deepEqual(c.dates, ["Created " + L(3), "Created " + L(1), "Created " + L(2), null], "auto slot: no usable stamp, no line");
        assert.include(c.titles[0], "Switch to this session\nCreated: " + L(3) + "\nLast used: " + L(70));
        assert.include(c.titles[1], "Last used: " + L(9), "pre-stamp session: modified stands in");
        const u = render("lastUsed");  // rows: c(70), b(50), a(9), auto(100)
        assert.deepEqual(u.dates, ["Last used " + L(70), "Last used " + L(50), "Last used " + L(9), "Last used " + L(100)]);
        const n = render("name");
        assert.deepEqual(n.dates, [null, null, null, null], "no date line when sorting by name");
        assert.include(n.titles[0], "Created: ", "the tooltip keeps the dates in every mode");
        assert.strictEqual(wv._wvTabSessionDateLabel(0, true), "");
        assert.strictEqual(wv._wvTabSessionDateLabel(NaN, false), "");
        const now = Date.now();
        assert.strictEqual(wv._wvTabSessionDateLabel(now, true), new Date(now).toLocaleTimeString(), "today = time only in the short form");
        assert.strictEqual(wv._wvTabSessionDateLabel(now, false), new Date(now).toLocaleString(), "full form always dated");
    });
});
