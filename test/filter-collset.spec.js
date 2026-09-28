/* global describe, it, before, after, assert, Zotero */

// Several collections selected (MJT 2026-09-28, forum 132772): Zotero shows
// their UNION; the "N collections selected" header's ∩ button narrows it to
// the items in ALL of them ("all"), Alt+click to those in some but NOT all
// ("notAll" = union minus intersection). Per library; each selected
// collection covers its sub-collections when Zotero shows them. FAILS on the
// pre-feature code (no such mode / button).

describe("Weavero — intersection of the selected collections", () => {
    let wv, win, A, B, B1, iAB, iA, iB1, prevRec, prevState;
    const LIB = () => Zotero.Libraries.userLibraryID;

    before(async function () {
        this.timeout(30000);
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvCollSetPasses !== "function") this.skip();
        win = Zotero.getMainWindow();
        prevRec = Zotero.Prefs.get("recursiveCollections");
        prevState = win._wvFilterState;
        const mkC = async (name, parentID) => { const c = new Zotero.Collection(); c.name = name; if (parentID) c.parentID = parentID; await c.saveTx(); return c; };
        A = await mkC("wv-cs-A"); B = await mkC("wv-cs-B"); B1 = await mkC("wv-cs-B1", B.id);
        const mkI = async (title, cols) => { const i = new Zotero.Item("book"); i.setField("title", title); for (const c of cols) i.addToCollection(c.id); await i.saveTx(); return i; };
        iAB = await mkI("wv-cs-AB", [A, B]); iA = await mkI("wv-cs-A-only", [A]); iB1 = await mkI("wv-cs-A-and-B1", [A, B1]);
    });

    after(async () => {
        try { Zotero.Prefs.set("recursiveCollections", !!prevRec); } catch (e) {}
        if (win) win._wvFilterState = prevState;
        if (wv) { wv._wvCollSetMemo = null; wv._wvCollFilterMemo = null; }
        for (const o of [iAB, iA, iB1, B1, B, A]) { try { if (o) await o.eraseTx(); } catch (e) {} }
    });

    const withGroups = (fn) => {
        wv._wvCollSetMemo = new Map([[LIB(), [A.id, B.id]]]);
        wv._wvCollFilterMemo = null;
        try { return fn(); } finally { wv._wvCollSetMemo = null; }
    };

    it("\"in all\": only items in every selected collection", () => {
        Zotero.Prefs.set("recursiveCollections", false);
        withGroups(() => {
            assert.isTrue(wv._wvCollSetPasses(iAB, "all"));
            assert.isFalse(wv._wvCollSetPasses(iA, "all"));
            assert.isFalse(wv._wvCollSetPasses(iB1, "all"), "B1 is not B while sub-collections are hidden");
        });
    });

    it("\"not in all\": union minus intersection", () => {
        Zotero.Prefs.set("recursiveCollections", false);
        withGroups(() => {
            assert.isFalse(wv._wvCollSetPasses(iAB, "notAll"));
            assert.isTrue(wv._wvCollSetPasses(iA, "notAll"));
        });
    });

    it("a selected collection covers its sub-collections when Zotero shows them", () => {
        Zotero.Prefs.set("recursiveCollections", true);
        withGroups(() => {
            assert.isTrue(wv._wvCollSetPasses(iB1, "all"), "in A and (via B1) in B");
            assert.isFalse(wv._wvCollSetPasses(iB1, "notAll"));
        });
        Zotero.Prefs.set("recursiveCollections", false);
    });

    it("a library without a 2+ collection selection is untouched", () => {
        wv._wvCollSetMemo = new Map();
        try { assert.isTrue(wv._wvCollSetPasses(iA, "all")); } finally { wv._wvCollSetMemo = null; }
    });

    it("the header gets the ∩ toggle: click = in all, Alt+click = not in all, again = union", () => {
        const doc = win.document;
        const H = "http://www.w3.org/1999/xhtml";
        const saveFor = wv._wvCollSetGroupsFor;
        wv._wvCollSetGroupsFor = () => new Map([[LIB(), [A.id, B.id]]]);
        win._wvFilterState = { groups: [] };
        try {
            const mkHeader = () => {
                const div = doc.createElementNS(H, "div");
                const cell = doc.createElementNS(H, "span"); cell.className = "cell primary library-header";
                const t = doc.createElementNS(H, "span"); t.className = "cell-text"; t.textContent = "2 collections selected";
                cell.appendChild(t); div.appendChild(cell);
                wv._wvCollSetDecorateHeader({ ref: { libraryID: LIB() } }, div);
                return div;
            };
            let div = mkHeader();
            let btn = div.querySelector(".wv-collset-btn");
            assert.isOk(btn, "button present");
            // Pressing it must not move keyboard focus into the items list
            // (that paints Zotero's focus ring on the header row, row 0).
            assert.equal(btn.tabIndex, -1);
            const md = new win.MouseEvent("mousedown", { bubbles: true, cancelable: true });
            btn.dispatchEvent(md);
            assert.isTrue(md.defaultPrevented, "mousedown default (focus) prevented");
            btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
            assert.equal(win._wvFilterState.collSetMode, "all");
            div = mkHeader();
            assert.equal(div.querySelector(".wv-collset-btn").dataset.selected, "true");
            assert.include(div.querySelector(".cell-text").textContent, "in all");
            div.querySelector(".wv-collset-btn").dispatchEvent(new win.MouseEvent("click", { bubbles: true, altKey: true }));
            assert.equal(win._wvFilterState.collSetMode, "notAll");
            mkHeader().querySelector(".wv-collset-btn").dispatchEvent(new win.MouseEvent("click", { bubbles: true, altKey: true }));
            assert.isNull(win._wvFilterState.collSetMode, "Alt+click again: back to the union");
        } finally {
            wv._wvCollSetGroupsFor = saveFor;
        }
    });

    it("counts the intersection before any click, next to the button", () => {
        Zotero.Prefs.set("recursiveCollections", false);
        wv._wvCollSetCountMemo = null;
        assert.deepEqual(wv._wvCollSetCounts([A.id, B.id]), { all: 1, union: 3 }, "iAB in both; iA, iB1 in A only");
        Zotero.Prefs.set("recursiveCollections", true);
        assert.deepEqual(wv._wvCollSetCounts([A.id, B.id]), { all: 2, union: 3 }, "iB1 counts for B via B1");
        Zotero.Prefs.set("recursiveCollections", false);
        const saveFor = wv._wvCollSetGroupsFor;
        wv._wvCollSetGroupsFor = () => new Map([[LIB(), [A.id, B.id]]]);
        win._wvFilterState = { groups: [] };
        try {
            const H = "http://www.w3.org/1999/xhtml", doc = win.document;
            const div = doc.createElementNS(H, "div");
            const cell = doc.createElementNS(H, "span"); cell.className = "cell primary library-header"; div.appendChild(cell);
            wv._wvCollSetDecorateHeader({ ref: { libraryID: LIB() } }, div);
            const btn = div.querySelector(".wv-collset-btn");
            assert.equal(btn && btn.textContent, "∩: 1", "the count sits inside the button");
        } finally {
            wv._wvCollSetGroupsFor = saveFor;
        }
    });

    it("works with saved searches too (\"2 sources selected\")", async function () {
        this.timeout(15000);
        Zotero.Prefs.set("recursiveCollections", false);
        const s = /** @type {any} */ (new Zotero.Search());
        s.name = "wv-cs-search-B"; s.libraryID = LIB();
        s.addCondition("collection", "is", B.key);
        await s.saveTx();
        try {
            const srcs = [A.id, "S" + s.id];
            wv._wvCollSetSrcCache = null;
            assert.isNull(wv._wvCollSetCounts(srcs), "pending: the search runs async");
            await wv._wvCollSetFetchSearch("S" + s.id);
            assert.deepEqual(wv._wvCollSetCounts(srcs), { all: 1, union: 3 });
            wv._wvCollSetMemo = new Map([[LIB(), srcs]]);
            assert.isTrue(wv._wvCollSetPasses(iAB, "all"));
            assert.isFalse(wv._wvCollSetPasses(iA, "all"));
            assert.isTrue(wv._wvCollSetPasses(iA, "notAll"));
        } finally {
            wv._wvCollSetMemo = null;
            wv._wvCollSetSrcCache = null;
            await s.eraseTx();
        }
    });

    it("switches off when the selection drops to a single source", () => {
        const saveFor = wv._wvCollSetGroupsFor;
        win._wvFilterState = { groups: [], collSetMode: "all" };
        try {
            wv._wvCollSetGroupsFor = () => new Map([[LIB(), [A.id, B.id]]]);
            wv._wvCollSetMemo = null;
            wv._wvCollSetDropIfInert();
            assert.equal(win._wvFilterState.collSetMode, "all", "kept while 2+ are selected");
            wv._wvCollSetGroupsFor = () => new Map();
            wv._wvCollSetMemo = null;
            wv._wvCollSetDropIfInert();
            assert.isNull(win._wvFilterState.collSetMode, "one collection: the mode is off");
        } finally {
            wv._wvCollSetGroupsFor = saveFor;
            wv._wvCollSetMemo = null;
        }
    });

    it("stays independent of the panel filter: no chip bar / funnel dot, and Clear keeps it", () => {
        const saveFor = wv._wvCollSetGroupsFor;
        wv._wvCollSetGroupsFor = () => new Map([[LIB(), [A.id, B.id]]]);
        const st = { groups: [wv._emptyFilterGroup()], collSetMode: "all" };
        try {
            wv._wvCollSetMemo = null;
            assert.isTrue(wv._isFilterActive(st), "the engine runs");
            assert.isFalse(wv._wvUserFilterActive(st), "but the filter UI sees no filter");
            win._wvFilterState = st;
            wv._clearAllFilters();
            assert.equal(win._wvFilterState.collSetMode, "all", "Clear all filters leaves the ∩ mode on");
        } finally {
            wv._wvCollSetGroupsFor = saveFor;
            wv._wvCollSetMemo = null;
        }
    });
});
