/* global describe, it, before, after, assert, Zotero, Services, Components, PathUtils, IOUtils */
// Annotations-pane funnel (issue #43): filter the reader's annotations pane
// while the document keeps every annotation.
//
// Contract under test:
//   * the popup is the READER FUNNEL's, scoped to the pane -- same renderer,
//     same include/exclude gestures, every dimension (colour, type, has-*,
//     tags, people, dates), minus the reader-only "Hide Annotations" toggle;
//   * resolution -- the six global `weavero.annListShow<Type>` prefs give the
//     default (a type exclude set); a per-document DEPARTURE in ann-order.json
//     wins; a state equal to the default removes the departure (the outline
//     page-numbers rule); a sort write must not drop it;
//   * the live reader -- a filtered type leaves the pane (Zotero's own
//     `_hidden`, so Select All skips it too) while the page view still holds
//     the annotation; clearing restores it.
describe("Weavero — annotations-pane funnel (issue #43)", function () {
    this.timeout(90000);
    let wv, win, att, hl, ink, reader;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(250);
        }
        throw new Error("timeout waiting for " + what);
    };
    function minimalPDFBytes() {
        const objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n",
        ];
        let body = "%PDF-1.4\n";
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 4\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        return body + xref + "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n"
            + xrefPos + "\n%%EOF\n";
    }
    const cards = (idoc) => [...idoc.querySelectorAll("#annotationsView .annotation[data-sidebar-annotation-id]")]
        .map(c => c.getAttribute("data-sidebar-annotation-id"));
    const pageKeys = () => {
        const Cu = Components.utils;
        const pv = Cu.waiveXrays(reader._internalReader._primaryView);
        return (pv._annotations || []).map(a => String(a.id));
    };
    const visibleKeys = () => {
        const Cu = Components.utils;
        const ir = Cu.waiveXrays(reader._internalReader);
        return (ir._state.annotations || []).filter(a => !a._hidden).map(a => String(a.id));
    };
    /** Mutate the pane state the way a chip click does, then apply. */
    const setPane = async (patch) => {
        const st = wv._wvAnnPaneState(reader);
        Object.assign(st, patch);
        await wv._wvAnnPaneApply(reader);
    };

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvAnnPaneState !== "function") this.skip();
        win = Zotero.getMainWindow();
        const path = PathUtils.join(PathUtils.tempDir, "wv-al-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        const mk = async (type, text, y, extra) => {
            const a = /** @type {any} */ (new Zotero.Item("annotation"));
            a.libraryID = att.libraryID;
            a.parentID = att.id;
            a.annotationType = type;
            if (text) a.annotationText = text;
            a.annotationComment = "";
            a.annotationColor = "#ffd400";
            a.annotationPageLabel = "1";
            a.annotationSortIndex = "00000|" + String(700 - y).padStart(6, "0") + "|00000";
            a.annotationPosition = JSON.stringify(Object.assign({ pageIndex: 0 }, extra));
            await a.saveTx();
            return a;
        };
        hl = await mk("highlight", "a highlight", 700, { rects: [[40, 700, 300, 712]] });
        ink = await mk("ink", null, 600, { paths: [[40, 600, 120, 640, 200, 600]], width: 2 });
        await Zotero.Reader.open(att.id, null, { allowDuplicate: false });
        reader = await waitFor(() => Zotero.Reader._readers.find(r => r.itemID === att.id
            && r._internalReader && r._iframeWindow), 30000, "reader");
        try { reader._internalReader.toggleSidebar(true); } catch (e) {}
        try { reader._internalReader.setSidebarView("annotations"); } catch (e) {}
        await waitFor(() => cards(reader._iframeWindow.document).length === 2, 30000, "two pane cards");
    });

    after(async function () {
        try { await wv._wvAnnPaneBackToDefault(reader); } catch (e) {}
        for (const t of wv._wvAnnListTypes()) { try { Zotero.Prefs.set(wv._wvAnnListPrefName(t), true); } catch (e) {} }
        try { if (reader && reader.tabID) win.Zotero_Tabs.close(reader.tabID); } catch (e) {}
        try { if (hl) await hl.eraseTx(); } catch (e) {}
        try { if (ink) await ink.eraseTx(); } catch (e) {}
        try { if (att) await att.eraseTx(); } catch (e) {}
    });

    it("global default: nothing filtered, the six prefs registered TRUE", function () {
        assert.deepEqual(wv._wvAnnPaneCanon(wv._wvAnnPaneDefaultState()), {});
        for (const t of wv._wvAnnListTypes()) {
            assert.strictEqual(Zotero.Prefs.get(wv._wvAnnListPrefName(t)), true, t);
        }
        assert.isFalse(wv._wvAnnPaneActive(reader));
        assert.deepEqual(wv._wvAnnPaneHiddenKeys(reader), []);
    });

    it("the state carries every dimension the reader funnel has", function () {
        const pane = Object.keys(wv._wvAnnPaneBlankState()).sort();
        const funnel = Object.keys(wv._wvReaderFilterState(reader)).sort();
        for (const k of funnel) assert.include(pane, k, "pane state is missing " + k);
        // …plus the include arrays the reader funnel delegates to Zotero.
        for (const k of ["colors", "tags", "addedBy"]) assert.include(pane, k);
    });

    it("include and exclude resolve the way the reader funnel resolves them", async function () {
        await setPane({ types: ["highlight"], typesExcl: [] });
        assert.deepEqual(wv._wvAnnListHidden(reader).sort(),
            ["image", "ink", "note", "text", "underline"], "include = list only these");
        await setPane({ types: ["highlight", "ink"], typesExcl: ["ink"] });
        assert.include(wv._wvAnnListHidden(reader), "ink", "an exclude wins over an include");
        assert.notInclude(wv._wvAnnListHidden(reader), "highlight");
        let next = wv._toggleIncludeExclude("note", [], [], false);
        assert.deepEqual(next, { include: ["note"], exclude: [] });
        next = wv._toggleIncludeExclude("note", next.include, next.exclude, false);
        assert.deepEqual(next, { include: [], exclude: [] });
        next = wv._toggleIncludeExclude("ink", [], [], true);
        assert.deepEqual(next, { include: [], exclude: ["ink"] });
        await wv._wvAnnPaneClear(reader);
    });

    it("a per-document state is stored only as a DEPARTURE from the default", async function () {
        assert.isFalse(wv._wvAnnListIsDeparture(reader));
        await setPane({ typesExcl: ["ink"] });
        assert.isTrue(wv._wvAnnListIsDeparture(reader));
        await wv._wvAnnPaneClear(reader);
        assert.isFalse(wv._wvAnnListIsDeparture(reader), "equal to the default -> no record");
    });

    it("a per-document filter survives the store round trip, every dimension", async function () {
        // The earlier specs read the CACHED state, so a writer that kept
        // only two keys passed them all while every document's own filter
        // came back as "show everything" (2026-09-18). Write, drop the cache,
        // re-read from the store.
        const set = { types: [], typesExcl: ["ink"], colors: [], colorsExcl: ["#ffd400"],
                      tags: ["alpha"], hasTag: true, dateAddedMode: "last", dateAddedN: 3, dateAddedUnit: "h" };
        await setPane(set);
        const written = wv._wvAnnPaneCanon(wv._wvAnnPaneState(reader));
        wv._wvAnnPaneForget(reader);
        const reread = wv._wvAnnPaneCanon(wv._wvAnnPaneState(reader));
        assert.deepEqual(reread, written, "what was written is what comes back");
        assert.isTrue(wv._wvAnnListIsDeparture(reader));
        assert.deepEqual(wv._wvAnnListHidden(reader), ["ink"], "and it still filters after the re-read");

        // A "show everything" override over a filtering default is a real
        // record and must survive as such.
        await wv._wvAnnPaneClearDefault(reader, reader._iframeWindow.document);
        await setPane({ typesExcl: ["ink"], colorsExcl: [], tags: [], hasTag: null, dateAddedMode: null, dateAddedN: 1, dateAddedUnit: "d" });
        await wv._wvAnnListUseAsDefault(reader);
        await wv._wvAnnPaneClear(reader);
        wv._wvAnnPaneForget(reader);
        assert.isTrue(wv._wvAnnListIsDeparture(reader), "the override is a record");
        assert.deepEqual(wv._wvAnnPaneCanon(wv._wvAnnPaneState(reader)), {}, "and it shows everything");
        await wv._wvAnnPaneClearDefault(reader, reader._iframeWindow.document);
        await wv._wvAnnPaneBackToDefault(reader);
    });

    it("the two older store dialects still read, and the corrupted empty pair reads as no record", function () {
        const norm = (v) => wv._wvAnnListNormalizeStored(v);
        assert.deepEqual(norm({ inc: ["highlight"], excl: ["ink"] }), { types: ["highlight"], typesExcl: ["ink"] });
        assert.deepEqual(norm({ inc: [], excl: ["ink"] }), { typesExcl: ["ink"] });
        assert.isNull(norm({ inc: [], excl: [] }), "what the broken writer left behind");
        assert.deepEqual(norm({}), {}, "a genuine show-everything override");
        assert.deepEqual(norm({ typesExcl: ["ink"], bogus: 1 }), { typesExcl: ["ink"] }, "unknown keys are dropped");
        assert.isNull(norm(null));
    });

    it("a sort write keeps the departure", async function () {
        await setPane({ typesExcl: ["ink"] });
        wv._wvAnnSetSort("dateModified", "desc", reader);
        await sleep(600);
        assert.deepEqual(wv._wvAnnListHidden(reader), ["ink"], "the list choice survived the sort write");
        wv._wvAnnSetSort("position", "asc", reader);
        await sleep(600);
        assert.deepEqual(wv._wvAnnListHidden(reader), ["ink"]);
        await wv._wvAnnPaneClear(reader);
    });

    it("the funnel sits in the sidebar toolbar beside the search box", function () {
        const idoc = reader._iframeWindow.document;
        const host = idoc.querySelector("#sidebarContainer .sidebar-toolbar .end .wv-al-actions");
        assert.isOk(host, "host in the toolbar's end slot");
        const btn = host.querySelector("button.wv-al-btn");
        assert.isOk(btn, "funnel button");
        assert.include(btn.className, "toolbar-button", "a native toolbar button: native hover, no icon recolour");
        assert.isOk(idoc.querySelector("#sidebarContainer .sidebar-toolbar .end .search-box"), "native search box still there");
        assert.isFalse(btn.classList.contains("wv-rf-active"), "no dot while nothing is filtered");
    });

    it("filtering a type empties its rows from the pane, keeps them on the page, and Select All skips them", async function () {
        const idoc = reader._iframeWindow.document;
        assert.sameMembers(cards(idoc), [hl.key, ink.key], "both rows before");
        await setPane({ typesExcl: ["ink"] });
        await waitFor(() => cards(idoc).length === 1, 15000, "ink row gone");
        assert.deepEqual(cards(idoc), [hl.key]);
        assert.sameMembers(visibleKeys(), [hl.key], "Zotero's own visible set (Select All) excludes ink");
        assert.sameMembers(pageKeys(), [hl.key, ink.key], "the page keeps both");
        const btn = idoc.querySelector("#sidebarContainer .wv-al-btn");
        assert.isTrue(btn.classList.contains("wv-rf-active"), "accent dot while the pane is filtered");
    });

    it("the popup is the reader funnel's, minus the document-scope toggle", async function () {
        const idoc = reader._iframeWindow.document;
        const btn = idoc.querySelector("#sidebarContainer .wv-al-btn");
        wv._wvAnnListTogglePopup(reader, idoc, btn);
        const popup = await waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "popup");
        assert.equal(popup.dataset.wvKind, "list");
        assert.equal(popup.querySelector(".wv-rf-title").textContent, "Filter Annotations Pane");
        assert.equal(popup.querySelectorAll(".wv-filter-opt[data-excluded='true']").length, 1,
            "the excluded type carries the funnel's own styling");
        assert.isOk(popup.querySelector(".wv-filter-clear-btn"), "Clear");
        assert.isOk(popup.querySelector(".wv-filter-clear-icon"), "Clear and Close");
        assert.isOk(popup.querySelector(".wv-filter-bottom-controls"), "the Alt+Click hint");
        assert.isNull(popup.querySelector(".wv-rf-hideann"),
            "no 'Hide Annotations in the Reader' — that one is document scope");
        // The footer states two different things in two rows: the effect and
        // the scope. Both must be readable on their own.
        assert.include(popup.querySelector(".wv-al-foot-count").textContent, "hidden from the pane");
        assert.equal(popup.querySelector(".wv-al-scope").textContent, "This Document Only");
        assert.isFalse(popup.querySelector(".wv-al-foot-scope").classList.contains("wv-al-is-default"),
            "the scope block is only tinted while it IS the default");
        // Beside the sidebar, top-aligned with the button: it must not cover
        // the pane it filters.
        const pr = popup.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        const sr = idoc.getElementById("sidebarContainer").getBoundingClientRect();
        assert.equal(Math.round(pr.top), Math.round(br.top), "top-aligned with the button");
        assert.isAtLeast(Math.round(pr.left), Math.round(sr.right), "beside the sidebar, not over it");
        wv._wvCloseReaderFilterPopup(idoc);
        assert.isNull(idoc.getElementById("wv-reader-filter-popup-v2"));
    });

    it("clearing restores the rows and the default footer", async function () {
        const idoc = reader._iframeWindow.document;
        await wv._wvAnnPaneClear(reader);
        await waitFor(() => cards(idoc).length === 2, 15000, "ink row back");
        assert.sameMembers(visibleKeys(), [hl.key, ink.key]);
        assert.isFalse(wv._wvAnnListIsDeparture(reader));
        assert.isFalse(idoc.querySelector("#sidebarContainer .wv-al-btn").classList.contains("wv-rf-active"));
    });

    it("'Use as Default' keeps the filter EXACTLY as it stands, chips included", async function () {
        // The first cut normalised an include set into the equivalent exclude
        // set: same result, but one selected chip became five excluded ones in
        // front of the user (MJT, 2026-09-18).
        await setPane({ types: ["highlight"], typesExcl: [] });
        const beforeCanon = wv._wvAnnPaneCanon(wv._wvAnnPaneState(reader));
        await wv._wvAnnListUseAsDefault(reader);
        assert.deepEqual(wv._wvAnnPaneCanon(wv._wvAnnPaneState(reader)), beforeCanon,
            "the document's own state is untouched");
        assert.deepEqual(wv._wvAnnPaneCanon(wv._wvAnnPaneDefaultState()), beforeCanon,
            "and the default is that same state, verbatim");
        assert.isFalse(wv._wvAnnListIsDeparture(reader), "no departure once the default matches");
        // Settings still tells the truth about which types the pane leaves out.
        assert.strictEqual(Zotero.Prefs.get(wv._wvAnnListPrefName("highlight")), true);
        assert.strictEqual(Zotero.Prefs.get(wv._wvAnnListPrefName("ink")), false);
    });

    it("a Settings checkbox rewrites the default's type part; 'Clear Default' drops it", async function () {
        const idoc = reader._iframeWindow.document;
        // Continues from the previous case: the default lists only highlights.
        Zotero.Prefs.set(wv._wvAnnListPrefName("ink"), true);
        await sleep(800);
        assert.notInclude(wv._wvAnnListHidden(reader), "ink", "the checkbox won over the include set");
        await waitFor(() => cards(idoc).length === 2, 15000, "ink listed again");
        await wv._wvAnnPaneClearDefault(reader, idoc);
        await sleep(600);
        assert.deepEqual(wv._wvAnnPaneCanon(wv._wvAnnPaneDefaultState()), {}, "default gone");
        assert.deepEqual(wv._wvAnnListTypes().filter(t => !wv._getAnnListShow(t)), [],
            "every checkbox back on");
        await waitFor(() => cards(idoc).length === 2, 15000, "everything listed");
    });

    it("disabling the feature removes the funnel, unfilters the pane and restores Zotero's selector", async function () {
        const idoc = reader._iframeWindow.document;
        const sc = idoc.getElementById("sidebarContainer");
        await setPane({ typesExcl: ["ink"] });
        await waitFor(() => cards(idoc).length === 1, 15000, "ink hidden");
        assert.isTrue(sc.classList.contains("wv-al-nonative"),
            "Zotero's own selector is hidden while the funnel replaces it");
        try {
            Zotero.Prefs.set("weavero.enableAnnPaneFilter", false);
            await waitFor(() => !idoc.querySelector(".wv-al-actions"), 15000, "funnel gone");
            await waitFor(() => cards(idoc).length === 2, 15000, "pane unfiltered again");
            assert.isFalse(sc.classList.contains("wv-al-nonative"), "the native selector is back");
            assert.sameMembers(pageKeys(), [hl.key, ink.key], "the page never changed");
        }
        finally {
            Zotero.Prefs.set("weavero.enableAnnPaneFilter", true);
        }
        await waitFor(() => !!idoc.querySelector(".wv-al-actions"), 15000, "funnel back");
        // The document's own filter is still on record and applies again.
        await waitFor(() => cards(idoc).length === 1, 15000, "ink hidden again");
        await wv._wvAnnPaneClear(reader);
    });

    it("the native selector can be kept on request", async function () {
        const idoc = reader._iframeWindow.document;
        const sc = idoc.getElementById("sidebarContainer");
        assert.isTrue(sc.classList.contains("wv-al-nonative"), "hidden by default");
        try {
            Zotero.Prefs.set("weavero.showNativeAnnSelector", true);
            await waitFor(() => !sc.classList.contains("wv-al-nonative"), 15000, "selector shown");
        }
        finally {
            Zotero.Prefs.set("weavero.showNativeAnnSelector", false);
        }
        await waitFor(() => sc.classList.contains("wv-al-nonative"), 15000, "hidden again");
    });

    it("the funnel's cues: green line = a filtering default exists, dot = this document departs from it", async function () {
        const idoc = reader._iframeWindow.document;
        const btn = () => idoc.querySelector("#sidebarContainer .wv-al-btn");
        const cues = () => {
            wv._wvAnnListEnsureButton(reader, idoc);
            const v = idoc.defaultView;
            const bar = v.getComputedStyle(btn(), "::before");
            return {
                dot: btn().classList.contains("wv-rf-active"),
                green: btn().classList.contains("wv-al-def-on")
                    && bar.content !== "none" && bar.backgroundColor.indexOf("95, 178, 54") >= 0,
                bowlGone: (btn().querySelector("img").getAttribute("src") || "").indexOf("5fb236") < 0,
            };
        };
        await wv._wvAnnPaneClearDefault(reader, idoc);
        await wv._wvAnnPaneBackToDefault(reader);
        await sleep(600);
        assert.deepEqual(cues(), { dot: false, green: false, bowlGone: true }, "nothing set anywhere");

        await setPane({ typesExcl: ["ink"] });
        assert.deepEqual(cues(), { dot: true, green: false, bowlGone: true }, "this document's own filter departs from an empty default");

        // Made the default: the document now sits on it -- base state, no dot,
        // green line (MJT, 2026-09-18: "with a chip active as default, it
        // should not show the blue dot").
        await wv._wvAnnListUseAsDefault(reader);
        assert.deepEqual(cues(), { dot: false, green: true, bowlGone: true }, "the same filter, now the default");

        // A default aimed at a type this document does not have: still the
        // base state here, still green.
        await setPane({ typesExcl: ["image"] });
        await wv._wvAnnListUseAsDefault(reader);
        assert.equal(wv._wvAnnPaneHiddenKeys(reader).length, 0, "no image annotation in the fixture");
        assert.deepEqual(cues(), { dot: false, green: true, bowlGone: true }, "following, nothing to hide");

        // Clear over a filtering default: away from the base state -> dot,
        // and the green stays, because the default still exists (MJT,
        // 2026-09-18: "just add the blue dot on top of the green underline").
        await wv._wvAnnPaneClear(reader);
        assert.isTrue(wv._wvAnnListIsDeparture(reader), "the override is recorded");
        assert.deepEqual(cues(), { dot: true, green: true, bowlGone: true }, "cleared over a default");

        // A filter on top of the default: the same two marks.
        await setPane({ colorsExcl: ["#ffd400"] });
        assert.deepEqual(cues(), { dot: true, green: true, bowlGone: true }, "own filter on top of a default");

        await wv._wvAnnPaneClearDefault(reader, idoc);
        await wv._wvAnnPaneBackToDefault(reader);
        assert.deepEqual(cues(), { dot: false, green: false, bowlGone: true }, "back to a clean slate");
    });

    it("a document that overrides the default is told what the default would do", async function () {
        const idoc = reader._iframeWindow.document;
        await setPane({ typesExcl: ["ink"] });
        await wv._wvAnnListUseAsDefault(reader);   // default: hide ink
        await wv._wvAnnPaneClear(reader);          // this document: show everything
        if (idoc.getElementById("wv-reader-filter-popup-v2")) wv._wvCloseReaderFilterPopup(idoc);
        wv._wvAnnListTogglePopup(reader, idoc, idoc.querySelector("#sidebarContainer .wv-al-btn"));
        const popup = await waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "popup");
        assert.equal(popup.querySelector(".wv-al-foot-count").textContent, "Every annotation shown");
        assert.equal(popup.querySelector(".wv-al-scope").textContent, "This Document Only");
        // With a default in place the header reads [Clear All] [Reset] [x]:
        // Reset (tooltip "Back to Default") just before the x, shown while
        // the document departs; Use as Default stays in the footer.
        const head = popup.querySelector(".wv-rf-head");
        const back = head.querySelector(".wv-al-back-btn");
        assert.isOk(back, "Reset in the header");
        assert.equal(back.textContent, "Reset");
        assert.equal(back.title, "Back to Default");
        assert.equal(back.style.visibility, "", "shown while the document departs");
        assert.equal(back.nextElementSibling.className, "wv-filter-clear-icon", "just before the red x");
        const clearAll = head.querySelector(".wv-filter-clear-btn:not(.wv-al-back-btn)");
        assert.equal(clearAll.textContent, "Clear All", "renamed while a default exists");
        assert.equal(clearAll.style.visibility, "hidden", "hidden: nothing is set in this document");
        assert.deepEqual([...popup.querySelectorAll(".wv-al-foot-btn")].map(b => b.textContent), ["Use as Default"]);
        const x = head.querySelector(".wv-filter-clear-icon");
        assert.equal(x.title, "Back to Default and Close", "the red x follows Reset while a default exists");
        assert.equal(x.style.visibility, "", "shown while the document departs");
        const note = popup.querySelector(".wv-al-scope-note");
        assert.isOk(note, "the default is stated where it is overridden");
        assert.include(note.textContent, "Default: not Ink \u00b7 hides 1 here");
        wv._wvCloseReaderFilterPopup(idoc);
        await wv._wvAnnPaneClearDefault(reader, idoc);
        await wv._wvAnnPaneBackToDefault(reader);

        // No default other than "show everything": the reader funnel's plain
        // pair, [Clear] [x -- Clear and Close], and no Reset at all.
        await setPane({ typesExcl: ["ink"] });
        wv._wvAnnListTogglePopup(reader, idoc, idoc.querySelector("#sidebarContainer .wv-al-btn"));
        const p2 = await waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "popup");
        const h2 = p2.querySelector(".wv-rf-head");
        assert.isNotOk(h2.querySelector(".wv-al-back-btn"), "no Reset without a default");
        assert.equal(h2.querySelector(".wv-filter-clear-btn").textContent, "Clear");
        assert.equal(h2.querySelector(".wv-filter-clear-btn").style.visibility, "", "shown: a filter is set");
        assert.equal(h2.querySelector(".wv-filter-clear-icon").title, "Clear and Close");
        assert.equal(h2.querySelector(".wv-filter-clear-icon").style.visibility, "");
        wv._wvCloseReaderFilterPopup(idoc);
        await wv._wvAnnPaneClear(reader);
    });

    it("the default's chips stay marked and seeded in every document, and the footer names the default where the document departs", async function () {
        const idoc = reader._iframeWindow.document;
        const openPane = async () => {
            if (idoc.getElementById("wv-reader-filter-popup-v2")) wv._wvCloseReaderFilterPopup(idoc);
            wv._wvAnnListTogglePopup(reader, idoc, idoc.querySelector("#sidebarContainer .wv-al-btn"));
            return waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "pane popup");
        };
        const chip = (popup, label) => [...popup.querySelectorAll(".wv-filter-opt")]
            .find(b => (b.title || "").indexOf(label) === 0);

        // The default aims at two types this fixture does not have. Without
        // the seeding the popup would say nothing about them at all -- the
        // default's parameters would be invisible exactly where they bite.
        await setPane({ typesExcl: ["image", "note"] });
        await wv._wvAnnListUseAsDefault(reader);
        let popup = await openPane();
        for (const label of ["Image", "Note"]) {
            const c = chip(popup, label);
            assert.isOk(c, label + " chip rendered although the document has none");
            assert.isTrue(c.classList.contains("wv-al-def-chip"), label + " carries the default marking");
            assert.include(c.title, "Part of the default filter");
            assert.equal(c.dataset.excluded, "true", label + " shows the default's own direction");
        }
        assert.isFalse(chip(popup, "Highlight").classList.contains("wv-al-def-chip"),
            "a type the default leaves alone stays unmarked");
        // The marking owns no property the state uses: it is a pseudo-element
        // bar under the chip, so an excluded default chip still paints the
        // exclude red (background image + border) exactly as an ordinary
        // excluded chip does.
        const view = idoc.defaultView;
        const marked = chip(popup, "Image");
        const cs = view.getComputedStyle(marked);
        const bar = view.getComputedStyle(marked, "::after");
        assert.include(bar.backgroundColor.replace(/\s/g, ""), "95,178,54", "green underline");
        assert.include(cs.backgroundImage, "220, 72, 72", "the exclude red still paints the chip");
        assert.include(cs.borderColor.replace(/\s/g, ""), "220,72,72", "and its red border");
        const plain = view.getComputedStyle(chip(popup, "Highlight"));
        assert.notInclude(cs.backgroundColor, "95, 178, 54", "the fill is the state's, not the marking's");
        assert.notEqual(cs.backgroundColor, plain.backgroundColor, "excluded still differs from neutral");
        wv._wvCloseReaderFilterPopup(idoc);

        // A document that DEPARTS from the default (Clear here) keeps the
        // default's chips underlined and seeded -- the mark is a fact about
        // the default -- while the chips carry this document's own (empty)
        // state, and the footer names the default too.
        await wv._wvAnnPaneClear(reader);
        assert.isTrue(wv._wvAnnListIsDeparture(reader), "the override is recorded");
        popup = await openPane();
        const img = chip(popup, "Image");
        assert.isOk(img, "still rendered where the document departs from the default");
        assert.isTrue(img.classList.contains("wv-al-def-chip"), "still underlined");
        assert.notEqual(img.dataset.excluded, "true", "this document's state is what the chip paints");
        assert.equal(img.dataset.inactive, "true", "and it reads as absent from this document");
        const note = popup.querySelector(".wv-al-scope-note");
        assert.isOk(note, "the default is named in the footer");
        assert.include(note.textContent, "Default: not Image, not Note");
        assert.include(note.textContent, "hides none here");
        wv._wvCloseReaderFilterPopup(idoc);
        await wv._wvAnnPaneBackToDefault(reader);

        // A tri-state flag the default sets marks its tile the same way.
        await setPane({ hasTag: true });
        await wv._wvAnnListUseAsDefault(reader);
        popup = await openPane();
        assert.isTrue(chip(popup, "Has Tag").classList.contains("wv-al-def-chip"), "Has Tag marked");
        assert.isFalse(chip(popup, "Has Link").classList.contains("wv-al-def-chip"), "Has Link untouched");
        wv._wvCloseReaderFilterPopup(idoc);

        // The READER funnel has no default of its own: nothing is marked
        // there, and nothing is seeded into it either.
        const rbtn = idoc.querySelector(".wv-reader-filter-btn");
        assert.isOk(rbtn, "the reader funnel button");
        wv._wvToggleReaderFilterPopup(reader, idoc, rbtn);
        const rp = await waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "reader popup");
        assert.equal(rp.dataset.wvKind, "filter");
        assert.equal(rp.querySelectorAll(".wv-al-def-chip").length, 0, "no default marking in the reader funnel");
        assert.isNotOk([...rp.querySelectorAll(".wv-filter-opt")].find(b => (b.title || "").indexOf("Image") === 0),
            "and no chip for a type the document does not have");
        wv._wvCloseReaderFilterPopup(idoc);

        await wv._wvAnnPaneClearDefault(reader, idoc);
        await wv._wvAnnPaneBackToDefault(reader);
    });

    it("Use as Default replaces; Alt+click adds to what the default already holds", async function () {
        const idoc = reader._iframeWindow.document;
        await wv._wvAnnPaneClearDefault(reader, idoc);
        await wv._wvAnnPaneBackToDefault(reader);

        await setPane({ typesExcl: ["ink"] });
        await wv._wvAnnListUseAsDefault(reader);
        assert.deepEqual(wv._wvAnnPaneCanon(wv._wvAnnPaneDefaultState()), { typesExcl: ["ink"] },
            "this document's filter became the default");

        // A plain click REPLACES -- the only way to drop a chip from the
        // default is to set a filter without it and use that.
        await setPane({ typesExcl: [], colorsExcl: ["#ffd400"] });
        await wv._wvAnnListUseAsDefault(reader);
        assert.deepEqual(wv._wvAnnPaneCanon(wv._wvAnnPaneDefaultState()), { colorsExcl: ["#ffd400"] },
            "replaced: ink is no longer in the default");

        // Alt+click MERGES, and the document adopts the merged default rather
        // than being left departing from what it just contributed to.
        await setPane({ colorsExcl: [], typesExcl: ["ink"], hasTag: true });
        await wv._wvAnnListUseAsDefault(reader, true);
        const merged = wv._wvAnnPaneCanon(wv._wvAnnPaneDefaultState());
        assert.sameMembers(merged.typesExcl || [], ["ink"], "the document's chip was added");
        assert.sameMembers(merged.colorsExcl || [], ["#ffd400"], "the default kept its own colour");
        assert.strictEqual(merged.hasTag, true, "and the flag it set");
        assert.isFalse(wv._wvAnnListIsDeparture(reader), "the document follows the merged default");

        // Where the two disagree about a value, the document wins: it is the
        // later instruction.
        await setPane({ colorsExcl: [], colors: ["#ffd400"] });
        await wv._wvAnnListUseAsDefault(reader, true);
        const m2 = wv._wvAnnPaneCanon(wv._wvAnnPaneDefaultState());
        assert.sameMembers(m2.colors || [], ["#ffd400"], "moved to the include side");
        assert.notInclude(m2.colorsExcl || [], "#ffd400", "and left the exclude side");

        await wv._wvAnnPaneClearDefault(reader, idoc);
        await wv._wvAnnPaneBackToDefault(reader);
    });

    it("no error-console entries from the feature", function () {
        const errs = (Zotero.getErrors(true) || []).map(String);
        assert.deepEqual(errs.filter(e => /_wvAnnList|_wvAnnPane/.test(e)), []);
    });
});
