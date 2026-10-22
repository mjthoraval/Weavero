/* global describe, it, before, after, assert, Zotero, Services, Components */
// Issue #58 follow-up (MJT, 2026-10-14): one handle, two selectors.
//
// A centred pill on a selector's top edge; a click folds the selector to that
// edge or opens it again. The reader's colour / tag / author selector at the
// foot of the annotations pane (Zotero's own, hidden outright by Weavero
// since the pane funnel arrived) and the Tag Selector of the library tab.
//
// Contract under test:
//   * reader -- the handle is the selector's first child, so it comes and
//     goes with the selector (Zotero renders it only when there are tags,
//     more than one colour or more than one author). Collapsed = only the
//     handle; the pref `hideNativeAnnSelector` IS the state (the Settings box
//     and the handle are one switch; one global state, kept across restarts).
//     Zotero's selection survives a collapse (the page stays filtered) and the
//     pill says so. React rebuilding the selector brings the handle back. The
//     Filters master off leaves Zotero's selector as it is.
//   * library -- the pill sits on Zotero's own splitter; collapsing goes
//     through the splitter's `state`, the way a drag shut does: the selector
//     object stays, the selected tag stays, the list stays filtered, and
//     View -> Layout -> Tag Selector reads the same state (Zotero persists
//     it). Expanding after Zotero took the selector down (View menu hide, or
//     collapsed at startup) rebuilds it through Zotero's own path and
//     re-highlights the tag the list is still filtered by -- Zotero's own
//     re-show builds an empty selector over a filtered list (verified
//     2026-10-14, upstream register #30). Drag still resizes: a click at the
//     splitter's end is not a toggle.
describe("Weavero — selector handle (issue #58): reader selector and library Tag Selector", function () {
    this.timeout(120000);
    let wv, win, doc, ZP;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(150);
        }
        throw new Error("timeout waiting for " + what);
    };
    // A step that never settles fails with its NAME instead of mocha's
    // 120 s timeout. The clock is an nsITimer, which no window state can
    // suspend; the report says whether the main window's own timers (the
    // ones `sleep` uses) still fire (2026-10-17: the View -> Layout test
    // hung only deep in long runs, unattributed).
    // React roots on the selector's host: two (different React instances)
    // was the Zotero.TagSelector class of a CLOSED window
    // (test/tag-selector-multiwindow.spec.js).
    const selectorHost = () => {
        try {
            const host = doc.getElementById("zotero-tag-selector");
            return host ? "host children " + host.childElementCount + ", React roots " + Object.keys(host).filter(k => k.startsWith("__reactContainer")).length : "no host";
        } catch (e) { return "? " + e; }
    };
    const bounded = (what, p, ms = 20000) => new Promise((resolve, reject) => {
        let winTimer = false;
        try { win.setTimeout(() => { winTimer = true; }, 0); } catch (e) {}
        const t = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
        t.initWithCallback(() => reject(new Error("hung: " + what + " [main-window timers fire: " + winTimer
            + ", tagSelector: " + !!ZP.tagSelector + ", collapsed: " + doc.getElementById("zotero-tag-selector-container").hasAttribute("collapsed")
            + ", hidden: " + doc.hidden + ", " + selectorHost() + "]")), ms, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
        Promise.resolve(p).then(v => { t.cancel(); resolve(v); }, e => { t.cancel(); reject(e); });
    });
    const savedPrefs = {};
    const savePref = (k) => { savedPrefs[k] = Zotero.Prefs.get("weavero." + k); };
    const restorePref = (k, dflt) => {
        const v = savedPrefs[k];
        Zotero.Prefs.set("weavero." + k, v === undefined ? dflt : !!v);
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvAnnSelHandleEnsure", "_wvAnnSelHandleToggle", "_wvApplyTagSelectorHandle", "_wvTagSelectorHandleToggle", "_getTagSelectorHandle"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow();
        doc = win.document;
        ZP = win.ZoteroPane;
        for (const k of ["hideNativeAnnSelector", "annSelectorHandle", "enableFilters", "tagSelectorHandle", "enableVisualExtras"]) savePref(k);
    });

    after(function () {
        restorePref("hideNativeAnnSelector", true);
        restorePref("annSelectorHandle", true);
        restorePref("enableFilters", true);
        restorePref("tagSelectorHandle", true);
        restorePref("enableVisualExtras", true);
    });

    // ------------------------------------------------------------ reader
    describe("reader: Zotero's colour / tag selector at the foot of the annotations pane", function () {
        let att, a1, a2, reader, idoc;
        const sel = () => idoc.getElementById("selector");
        // Just before the selector in #annotationsView: a zero-height button
        // whose pill is drawn over the selector's own top padding, so the
        // colours never move (MJT 2026-10-14; an in-flow row pushed them
        // 6 px down).
        const handle = () => { const s = sel(); const p = s && s.previousElementSibling; return p && p.classList.contains("wv-sel-handle") ? p : null; };
        const sc = () => idoc.getElementById("sidebarContainer");
        const shown = (el) => !!el && idoc.defaultView.getComputedStyle(el).display !== "none";
        const colorsRow = () => { const s = sel(); return s && s.querySelector(".colors"); };
        const mk = async (color, y) => {
            const a = /** @type {any} */ (new Zotero.Item("annotation"));
            a.libraryID = att.libraryID;
            a.parentID = att.id;
            a.annotationType = "highlight";
            a.annotationText = "wv handle " + color;
            a.annotationComment = "";
            a.annotationColor = color;
            a.annotationPageLabel = "1";
            a.annotationSortIndex = "00000|" + String(700 - y).padStart(6, "0") + "|00000";
            a.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[20, y, 150, y + 12]] });
            await a.saveTx();
            return a;
        };

        before(async function () {
            Zotero.Prefs.set("weavero.enableFilters", true);
            Zotero.Prefs.set("weavero.enableVisualExtras", true);   // the pane's master (prefs.4)
            Zotero.Prefs.set("weavero.annSelectorHandle", true);
            Zotero.Prefs.set("weavero.hideNativeAnnSelector", true);
            att = await wvT.createTestPDFItem("wv-selh");
            // Two colours: Zotero renders the selector for more than one.
            a1 = await mk("#ffd400", 150);
            a2 = await mk("#ff6666", 100);
            reader = await wvT.openReaderTab(att.id);
            if (!reader) throw new Error("reader did not open");
            try { reader._internalReader.toggleSidebar(true); } catch (e) {}
            try { reader._internalReader.setSidebarView("annotations"); } catch (e) {}
            idoc = reader._iframeWindow.document;
            await waitFor(() => sel() && colorsRow() && colorsRow().children.length === 2, 30000, "the selector with two colours");
        });

        after(async function () {
            Zotero.Prefs.set("weavero.enableFilters", true);
            Zotero.Prefs.set("weavero.enableVisualExtras", true);   // the pane's master (prefs.4)
            Zotero.Prefs.set("weavero.annSelectorHandle", true);
            Zotero.Prefs.set("weavero.hideNativeAnnSelector", true);
            try { wvT.closeReaderTab(reader); } catch (e) {}
            await wvT.erase(a1, a2, att);
        });

        it("folded (the state on): a handle at the selector's top edge, the colours folded away", async function () {
            const h = await waitFor(handle, 15000, "the handle just before the selector");
            assert.isTrue(sc().classList.contains("wv-al-nonative"), "the collapsed class (the pref's state)");
            assert.strictEqual(h.getAttribute("aria-expanded"), "false");
            assert.isFalse(shown(colorsRow()), "the colours are folded away");
            assert.isTrue(shown(h), "the handle shows");
            const r = sel().getBoundingClientRect();
            assert.isAbove(r.height, 0, "the selector keeps a strip");
            assert.isAtMost(r.height, 12, "and no more than its border and top padding: " + r.height);
            const pill = idoc.defaultView.getComputedStyle(h, "::after");
            assert.notEqual(pill.content, "none", "the pill is drawn");
            assert.strictEqual(pill.width, "32px", "32 px wide");
            assert.strictEqual(Math.round(h.getBoundingClientRect().height), 0, "the handle takes no space of its own");
        });

        it("a click on the handle expands it: the setting flips, the colours show where Zotero puts them, the handle stays", async function () {
            handle().click();
            await waitFor(() => Zotero.Prefs.get("weavero.hideNativeAnnSelector") === false, 5000, "the pref flipped");
            await waitFor(() => !sc().classList.contains("wv-al-nonative"), 5000, "the class gone");
            await waitFor(() => shown(colorsRow()), 5000, "the colours shown");
            const h = handle();
            assert.ok(h, "the handle is still just before the selector");
            assert.strictEqual(h.getAttribute("aria-expanded"), "true");
            assert.isAbove(sel().getBoundingClientRect().height, 24, "the selector is open");
            assert.isTrue(shown(h), "the handle shows while open");
            // Nothing moved: the colours sit at Zotero's own 8 px padding
            // (plus the 1 px top border), and the pill is in that padding.
            const s = sel().getBoundingClientRect(), c = colorsRow().getBoundingClientRect();
            assert.strictEqual(Math.round(c.top - s.top), 9, "the colours row at border + padding, as native");
            const pad = idoc.defaultView.getComputedStyle(sel()).paddingTop;
            assert.strictEqual(pad, "8px", "Zotero's padding untouched");
        });

        it("the state is one global pref the handle moves; every open reader follows it", async function () {
            Zotero.Prefs.set("weavero.hideNativeAnnSelector", true);
            await waitFor(() => sc().classList.contains("wv-al-nonative") && handle() && handle().getAttribute("aria-expanded") === "false", 5000, "collapsed from the pref");
            assert.isFalse(shown(colorsRow()));
            Zotero.Prefs.set("weavero.hideNativeAnnSelector", false);
            await waitFor(() => !sc().classList.contains("wv-al-nonative") && handle() && handle().getAttribute("aria-expanded") === "true", 5000, "expanded from the pref");
            assert.isTrue(shown(colorsRow()));
        });

        it("the Settings box enables the handle, it is not the toggle: off = Zotero's selector, always shown", async function () {
            // MJT 2026-10-14: "the settings should enable the feature, not
            // work as a toggle. With the option off, it should go back to
            // the native behaviour (cannot be collapsed)."
            Zotero.Prefs.set("weavero.hideNativeAnnSelector", true);
            await waitFor(() => sc().classList.contains("wv-al-nonative"), 5000, "folded going in");
            Zotero.Prefs.set("weavero.annSelectorHandle", false);
            await waitFor(() => !handle() && !sc().classList.contains("wv-al-nonative"), 10000, "off: no handle, not folded");
            assert.isTrue(shown(colorsRow()), "Zotero's selector, shown");
            assert.strictEqual(Zotero.Prefs.get("weavero.hideNativeAnnSelector"), true, "the folded state is kept for when the handle returns");
            Zotero.Prefs.set("weavero.annSelectorHandle", true);
            await waitFor(() => handle() && sc().classList.contains("wv-al-nonative"), 10000, "on: the handle, folded as it was");
            assert.isFalse(shown(colorsRow()));
            Zotero.Prefs.set("weavero.hideNativeAnnSelector", false);
            await waitFor(() => !sc().classList.contains("wv-al-nonative") && shown(colorsRow()), 5000, "expanded for the next case");
        });

        it("collapsed with a colour selected: the selection stands and the pill is marked", async function () {
            const Cu = Components.utils;
            const ir = () => Cu.waiveXrays(reader._internalReader);
            const first = colorsRow().querySelector("button.color");
            first.click();   // React's own listener (root-delegated): a synthetic click reaches it
            await waitFor(() => colorsRow().querySelector("button.color.selected"), 5000, "a colour selected");
            assert.lengthOf(ir()._state.filter.colors, 1, "Zotero's filter holds the colour");
            handle().click();
            await waitFor(() => sc().classList.contains("wv-al-nonative"), 5000, "collapsed");
            await waitFor(() => handle() && handle().getAttribute("data-wv-mark") === "1", 5000, "the pill marked");
            assert.include(idoc.defaultView.getComputedStyle(handle(), "::after").backgroundColor, "rgb", "the pill painted (the accent)");
            assert.lengthOf(ir()._state.filter.colors, 1, "the selection survives the collapse");
            assert.include(handle().title.toLowerCase(), "selection is active", "the tooltip says so");
            // Deselect: expand, click the colour again, collapse -> no mark.
            handle().click();
            await waitFor(() => !sc().classList.contains("wv-al-nonative") && shown(colorsRow()), 5000, "expanded again");
            colorsRow().querySelector("button.color.selected").click();
            await waitFor(() => !colorsRow().querySelector("button.color.selected"), 5000, "deselected");
            handle().click();
            await waitFor(() => sc().classList.contains("wv-al-nonative"), 5000, "collapsed");
            await waitFor(() => handle() && handle().getAttribute("data-wv-mark") === "0", 5000, "no mark");
            assert.notInclude(handle().title.toLowerCase(), "selection is active");
        });

        it("React rebuilding the selector brings the handle back", async function () {
            // One colour and no tags: Zotero drops the selector; a second
            // colour brings a NEW selector node, which needs its handle again.
            await a2.eraseTx();
            await waitFor(() => !sel(), 15000, "the selector gone with one colour left");
            const orphan = idoc.querySelector("#annotationsView .wv-sel-handle");
            if (orphan) assert.strictEqual(idoc.defaultView.getComputedStyle(orphan).display, "none", "no selector, no handle shown");
            a2 = await mk("#5fb236", 100);
            await waitFor(() => sel() && colorsRow() && colorsRow().children.length === 2, 15000, "the selector back");
            await waitFor(handle, 10000, "the handle back, just before the new selector");
            assert.isTrue(shown(handle()), "and shown again");
            assert.isTrue(sc().classList.contains("wv-al-nonative"), "still collapsed");
            assert.isFalse(shown(colorsRow()), "and folded");
        });

        // Its master is EXTRAS, the section Settings greys the box under
        // (prefs.4, MJT 2026-10-17; Sort & Filters until then).
        it("the Extras master off leaves Zotero's selector as Zotero draws it", async function () {
            try {
                Zotero.Prefs.set("weavero.enableVisualExtras", false);
                await waitFor(() => !handle() && !sc().classList.contains("wv-al-nonative"), 10000, "handle and class gone");
                assert.isTrue(shown(colorsRow()), "Zotero's selector, open");
            }
            finally { Zotero.Prefs.set("weavero.enableVisualExtras", true); }
            await waitFor(() => handle() && sc().classList.contains("wv-al-nonative"), 10000, "handle back, collapsed (the pref is still on)");
        });
    });

    // ----------------------------------------------------------- library
    describe("library: the Tag Selector", function () {
        const TAG = "wv-handle-tag";
        let item, sp, ct, savedCollapsed;
        const pill = () => [...sp.parentNode.children].find(c => c.classList && c.classList.contains("wv-ts-handle")) || null;
        const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
        const selectedInDom = () => [...doc.querySelectorAll("#zotero-tag-selector .tag-selector-item.selected")].map(e => e.textContent.trim());
        const listedInDom = () => [...doc.querySelectorAll("#zotero-tag-selector .tag-selector-item")].map(e => e.textContent.trim());
        const rowTags = () => {
            const iv = ZP.itemsView;
            const row = (iv.collectionTreeRows && iv.collectionTreeRows[0]) || iv.collectionTreeRow;
            return row && row.tags ? [...row.tags] : [];
        };
        const viewMenuSaysShown = () => {
            const popup = doc.querySelector("#view-menu > menupopup");
            try { popup.dispatchEvent(new win.Event("popupshowing", { bubbles: false })); } catch (e) {}
            return doc.getElementById("view-menuitem-tag-selector").getAttribute("checked") === "true";
        };

        before(async function () {
            sp = doc.getElementById("zotero-tags-splitter");
            ct = doc.getElementById("zotero-tag-selector-container");
            assert.ok(sp && ct, "Zotero's splitter and container");
            savedCollapsed = ct.hasAttribute("collapsed");
            Zotero.Prefs.set("weavero.enableVisualExtras", true);
            Zotero.Prefs.set("weavero.tagSelectorHandle", true);
            wv._wvApplyTagSelectorHandle(win);
            // Zotero bug (work/zotero-upstream-bugs.md, 2026-10-17): once the
            // collections tree is refreshed with the selection unchanged (any
            // earlier spec's hide / show or Extras toggle; Zotero's own
            // Show / Hide Unfiled Items too), the items list keeps its old row
            // object while setTagScope() hands the Tag Selector the tree's new
            // one, whose cached search results nothing clears: a tag added
            // afterwards is never listed. Moving the selection away and back
            // gives both the same row again.
            const lib = Zotero.Libraries.userLibraryID;
            const away = ["T", "U", "D"].map(p => p + lib).find(id => ZP.collectionsView.getRowIndexByID(id) !== false);
            if (away) await ZP.collectionsView.selectByID(away);
            await ZP.collectionsView.selectLibrary(lib);
            await sleep(300);
            item = await wvT.createItem("journalArticle", { title: "WV handle item" });
            item.addTag(TAG);
            await item.saveTx();
            // Start with the collections pane open (a previous spec may have
            // left it shut: the selector lists nothing at zero width) and a
            // live, open selector.
            const pane = doc.getElementById("zotero-collections-pane");
            if (pane && pane.hasAttribute("collapsed") && typeof wv._wvCollectionsPaneToggle === "function") wv._wvCollectionsPaneToggle(win);
            if (ct.hasAttribute("collapsed")) await wv._wvTagSelectorHandleToggle(win);
            await waitFor(() => ZP.tagSelector && ZP.tagSelectorShown(), 10000, "the selector shown");
            await ZP.setTagScope();
            try { ZP.tagSelector.handleResize(); } catch (e) {}
            const diag = () => {
                try {
                    const st = ZP.tagSelector && ZP.tagSelector.state;
                    const r = ct.getBoundingClientRect();
                    return " [loaded=" + (st && st.loaded) + " tags=" + (st && st.tags && st.tags.length) + " listed=" + listedInDom().length
                        + " container=" + Math.round(r.width) + "x" + Math.round(r.height) + " paneCollapsed=" + (pane && pane.hasAttribute("collapsed")) + "]";
                } catch (e) { return " [diag err " + e + "]"; }
            };
            try { await waitFor(() => listedInDom().includes(TAG), 15000, "the tag listed"); }
            catch (e) { throw new Error(String(e && e.message || e) + diag()); }
        });

        after(async function () {
            try { if (ZP.tagSelector) { ZP.tagSelector.clearTagSelection(); await ZP.updateTagFilter(); } } catch (e) {}
            try { if (ct.hasAttribute("collapsed") !== savedCollapsed) await wv._wvTagSelectorHandleToggle(win); } catch (e) {}
            await wvT.erase(item);
            Zotero.Prefs.set("weavero.tagSelectorHandle", true);
            wv._wvApplyTagSelectorHandle(win);
        });

        it("the pill sits over Zotero's splitter, on by default", function () {
            assert.isTrue(wv._getTagSelectorHandle(), "default on");
            assert.strictEqual(sp.getAttribute("wv-handle"), "true", "the splitter carries the handle's state");
            // A XUL splitter paints neither children nor generated content
            // (2026-10-14), and it collapses / resizes its immediate
            // siblings: the pill is a fixed host at the END of the pane.
            const host = pill();
            assert.ok(host, "the pill host in the collections pane");
            assert.strictEqual(host.parentNode, sp.parentNode);
            assert.strictEqual(host.parentNode.lastElementChild, host, "last in the pane");
            assert.notEqual(sp.nextElementSibling, host, "never the splitter's neighbour");
            assert.notEqual(sp.previousElementSibling, host);
            const b = win.getComputedStyle(host, "::before");
            assert.notEqual(b.content, "none", "the pill is drawn");
            assert.strictEqual(b.width, "32px");
            assert.strictEqual(win.getComputedStyle(host).cursor, "pointer", "the pill takes the click itself");
            // The splitter's drag writes `height: 0px` inline on every child
            // of the pane but XUL elements marked fixed / hidden (MJT's real
            // drags on an HTML host, 2026-10-14, twice: the pill sat 6 px up
            // over the tree). The host is a XUL box marked fixed, and the
            // stylesheet's !important height outranks an inline write anyway.
            assert.strictEqual(host.namespaceURI, "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "a XUL host");
            assert.strictEqual(host.getAttribute("fixed"), "true", "skipped by the splitter's drag");
            host.style.height = "0px";
            host.setAttribute("height", "0");
            try {
                assert.strictEqual(win.getComputedStyle(host).height, "12px", "an inline height: 0px from the splitter does not shrink the host");
                if (!doc.hidden) assert.strictEqual(Math.round(host.getBoundingClientRect().height), 12);
            }
            finally { host.style.removeProperty("height"); host.removeAttribute("height"); }
            if (!doc.hidden) {
                const h = centre(host), s = centre(sp);
                assert.isAtMost(Math.abs(h.x - s.x), 1, "centred on the splitter (" + h.x + " vs " + s.x + ")");
                assert.isAtMost(Math.abs(h.y - (s.r.bottom + 3)), 2, "just under the divider, in the selector's top padding (" + h.y + " vs " + s.r.bottom + ")");
            }
            assert.strictEqual(sp.getAttribute("data-wv-mark"), "0", "no filter, no mark");
        });

        it("collapsing keeps the selected tag and the filtered list; View → Layout follows; the pill is marked", async function () {
            const before_ = ZP.itemsView.rowCount;
            ZP.tagSelector.selectedTags = new Set([TAG]);
            await ZP.updateTagFilter();
            await waitFor(() => rowTags().includes(TAG) && ZP.itemsView.getRowIndexByID(item.id) !== false, 10000, "the list filtered by the tag");
            const filtered = ZP.itemsView.rowCount;
            assert.isAtMost(filtered, before_);
            await waitFor(() => selectedInDom().includes(TAG), 10000, "the tag highlighted");
            assert.isTrue(viewMenuSaysShown(), "View menu: shown");

            await wv._wvTagSelectorHandleToggle(win);
            assert.isTrue(ct.hasAttribute("collapsed"), "collapsed");
            assert.strictEqual(sp.getAttribute("state"), "collapsed", "through the splitter's state");
            assert.ok(ZP.tagSelector, "the selector object stays");
            assert.isTrue(ZP.tagSelector.getTagSelection().has(TAG), "the selection stays");
            assert.deepEqual(rowTags(), [TAG], "the list is still filtered");
            assert.strictEqual(ZP.itemsView.rowCount, filtered);
            await waitFor(() => sp.getAttribute("data-wv-mark") === "1", 5000, "the pill marked");
            assert.include((pill().getAttribute("title") || "").toLowerCase(), "tag", "the tooltip says a tag is selected");
            assert.isFalse(viewMenuSaysShown(), "View menu: hidden");
            if (!doc.hidden) {
                // The pill followed the splitter onto the band at the pane's foot.
                await waitFor(() => Math.abs(centre(pill()).y - centre(sp).y) <= 2, 3000, "the pill on the collapsed band");
                assert.isAtMost(Math.abs(centre(pill()).x - centre(sp).x), 1);
            }

            await wv._wvTagSelectorHandleToggle(win);
            assert.isFalse(ct.hasAttribute("collapsed"), "open again");
            assert.isTrue(ZP.tagSelectorShown());
            assert.isTrue(ZP.tagSelector.getTagSelection().has(TAG));
            await waitFor(() => selectedInDom().includes(TAG), 10000, "still highlighted");
            assert.deepEqual(rowTags(), [TAG]);
            assert.strictEqual(ZP.itemsView.rowCount, filtered);
            await waitFor(() => sp.getAttribute("data-wv-mark") === "0", 5000, "no mark while open");
            assert.isTrue(viewMenuSaysShown(), "View menu: shown");
        });

        it("after View → Layout hid it, the handle brings it back with the filter's tag highlighted", async function () {
            // Zotero's hide takes the selector down and leaves the filter on
            // the list; its own re-show builds an empty selector (upstream #30).
            assert.deepEqual(rowTags(), [TAG], "filtered going in");
            await bounded("Zotero's toggleTagSelector (hide)", ZP.toggleTagSelector());
            assert.isNull(ZP.tagSelector, "Zotero took the selector down");
            assert.isTrue(ct.hasAttribute("collapsed"));
            await bounded("the mark", waitFor(() => sp.getAttribute("data-wv-mark") === "1", 5000, "marked: the list is still filtered"));
            await bounded("the handle's toggle (rebuild)", wv._wvTagSelectorHandleToggle(win));
            await bounded("the rebuilt selector", waitFor(() => ZP.tagSelector && ZP.tagSelectorShown(), 10000, "rebuilt and shown"));
            assert.isTrue(ZP.tagSelector.getTagSelection().has(TAG), "the selection matches the list again");
            await bounded("the highlight", waitFor(() => selectedInDom().includes(TAG), 10000, "and is highlighted"));
            assert.deepEqual(rowTags(), [TAG], "the list was never touched");
            // Zotero's own path would have shown an empty selection here.
        });

        it("collapsed at startup (no selector built yet): the handle builds it", async function () {
            ZP.tagSelector.clearTagSelection();
            await ZP.updateTagFilter();
            await waitFor(() => !rowTags().length, 5000, "filter cleared");
            // What a restart with the splitter persisted collapsed leaves:
            // the container collapsed and no selector object.
            sp.setAttribute("state", "collapsed");
            await waitFor(() => ct.hasAttribute("collapsed"), 3000, "collapsed");
            ZP.tagSelector.uninit();
            ZP.tagSelector = null;
            await wv._wvTagSelectorHandleToggle(win);
            await waitFor(() => ZP.tagSelector && ZP.tagSelectorShown(), 10000, "built and shown");
            await waitFor(() => listedInDom().length > 0, 15000, "tags listed, not 'Loading Tags…'");
            assert.strictEqual(sp.getAttribute("data-wv-mark"), "0");
        });

        it("a click on the pill toggles; the splitter itself stays Zotero's (drag only)", async function () {
            const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            assert.isFalse(ct.hasAttribute("collapsed"), "open going in");
            click(sp);
            await sleep(300);
            assert.isFalse(ct.hasAttribute("collapsed"), "the band is for dragging");
            click(pill());
            await waitFor(() => ct.hasAttribute("collapsed"), 3000, "the pill collapses");
            click(pill());
            await waitFor(() => !ct.hasAttribute("collapsed") && ZP.tagSelectorShown(), 5000, "and expands");
        });

        it("its setting, and the Extras master", async function () {
            Zotero.Prefs.set("weavero.tagSelectorHandle", false);
            await waitFor(() => !sp.hasAttribute("wv-handle"), 3000, "off: the splitter is Zotero's again");
            assert.isNull(pill(), "no pill");
            Zotero.Prefs.set("weavero.tagSelectorHandle", true);
            await waitFor(() => sp.getAttribute("wv-handle") === "true" && pill(), 3000, "on: back");
            Zotero.Prefs.set("weavero.enableVisualExtras", false);
            await waitFor(() => !sp.hasAttribute("wv-handle"), 3000, "Extras off: gone");
            Zotero.Prefs.set("weavero.enableVisualExtras", true);
            await waitFor(() => sp.getAttribute("wv-handle") === "true", 3000, "Extras on: back");
        });

        it("re-applying never doubles the wiring", function () {
            const lib = wvT.lib();
            wv._wvApplyTagSelectorHandle(win);
            wv._wvApplyTagSelectorHandle(win);
            assert.lengthOf(doc.querySelectorAll(".wv-ts-handle"), 1, "one pill");
            const keys = lib.wvListenKeys(pill()).map(k => k.key);
            assert.deepEqual(keys, ["tsHandle:click"], "the pill's click listener, keyed, once");
            assert.deepEqual(lib.wvListenKeys(sp), [], "nothing on the splitter");
        });
    });
});
