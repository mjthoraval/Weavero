/* global describe, it, before, after, assert, Zotero */

// Collapse / expand button for the collections pane (v0.20.2). The library's
// left pane had no toggle where the item pane (sidenav) and both reader panes
// have one. The button is a `.zotero-tb-button` first in the items toolbar,
// wired with Zotero's own View -> Layout logic (splitter state + pane
// `collapsed` + updateLayoutConstraints), behind Extras -> Collections pane
// (on by default). A real click is a trusted `command`; here `doCommand()`
// stands in -- it reaches a toolbarbutton's JS listener (measured 2026-09-22,
// unlike a menuitem's).

describe("Weavero — collections-pane toggle button", () => {
    let wv, win, doc, pane, splitter;
    const ID = "wv-tb-toggle-collections-pane";
    const btn = () => doc.getElementById(ID);
    const state = () => (pane.hasAttribute("collapsed") ? "collapsed" : "open") + "/" + (splitter.getAttribute("state") || "open");
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await new Promise(r => win.setTimeout(r, 50)); }
        throw new Error("timeout: " + what);
    };
    let savedPref, savedState;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvApplyCollectionsPaneToggle !== "function") this.skip();
        win = Zotero.getMainWindow();
        doc = win.document;
        pane = doc.getElementById("zotero-collections-pane");
        splitter = doc.getElementById("zotero-collections-splitter");
        assert.ok(pane && splitter, "collections pane and its splitter");
        savedPref = Zotero.Prefs.get("weavero.collectionsPaneToggle");
        savedState = state();
        Zotero.Prefs.set("weavero.collectionsPaneToggle", true);
        wv._wvApplyCollectionsPaneToggle(win);
    });

    after(() => {
        // Leave the pane as found (the toggles below are attribute-level).
        if (state() !== savedState) wv._wvCollectionsPaneToggle(win);
        Zotero.Prefs.set("weavero.collectionsPaneToggle", savedPref === undefined ? true : !!savedPref);
        wv._wvApplyCollectionsPaneToggle(win);
    });

    it("sits at the top-left: first in the collections toolbar while the pane is open", () => {
        const b = btn();
        assert.ok(b, "button present");
        if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
        const bar = doc.getElementById("zotero-collections-toolbar");
        assert.strictEqual(bar.firstElementChild, b, "first in the collections toolbar, before New Collection");
        assert.strictEqual(b.localName, "toolbarbutton");
        assert.include(b.className, "zotero-tb-button");
        assert.include(win.getComputedStyle(b).listStyleImage, "20/universal/sidebar.svg");
        assert.strictEqual(b.getAttribute("tooltiptext"), "Toggle Collections Pane");
        const cs = win.getComputedStyle(b);
        assert.strictEqual(cs.fill, cs.color, "the glyph takes the button's colour (context-fill), as Zotero's do");
        const ref = win.getComputedStyle(doc.getElementById("zotero-tb-collection-add"));
        assert.strictEqual(cs.padding, ref.padding, "same padding as New Collection");
        assert.strictEqual(cs.borderRadius, ref.borderRadius, "same radius");
        if (!doc.hidden) {
            // The run of buttons at the toolbar's start -- the toggle, New
            // Collection, Weavero's Bookmarks -- keeps the 8-px rhythm.
            const run = [];
            for (let el = b; el && el.localName === "toolbarbutton"; el = el.nextElementSibling) run.push(el);
            assert.isAtLeast(run.length, 2, "at least the toggle and New Collection");
            const gaps = run.slice(1).map((el, i) => Math.round(el.getBoundingClientRect().left - run[i].getBoundingClientRect().right));
            assert.deepEqual(gaps, gaps.map(() => 8), "8 px between each pair: " + run.map(e => e.id).join(" > ") + " = " + gaps.join(","));
        }
    });

    it("toggles the pane the way View → Layout does, and re-homes without moving", async () => {
        if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
        assert.strictEqual(state(), "open/open");
        const leftOpen = Math.round(btn().getBoundingClientRect().left);
        btn().doCommand();
        assert.strictEqual(state(), "collapsed/collapsed", "one press flips splitter and pane together");
        await new Promise(r => win.setTimeout(r, 120));
        assert.strictEqual(btn().parentNode, doc.getElementById("zotero-items-toolbar"), "collapsed: first in the items toolbar");
        assert.strictEqual(btn().parentNode.firstElementChild, btn());
        if (!doc.hidden) {
            const leftCollapsed = Math.round(btn().getBoundingClientRect().left);
            assert.isAtMost(Math.abs(leftCollapsed - leftOpen), 1, "same screen position (" + leftOpen + " vs " + leftCollapsed + ")");
            const gap = Math.round(btn().nextElementSibling.getBoundingClientRect().left - btn().getBoundingClientRect().right);
            assert.strictEqual(gap, 8, "8 px to New Item, the toolbar rhythm");
        }
        btn().doCommand();
        assert.strictEqual(state(), "open/open", "a second press brings it back");
        await new Promise(r => win.setTimeout(r, 120));
        assert.strictEqual(btn().parentNode, doc.getElementById("zotero-collections-toolbar"), "open: back in the collections toolbar");
        assert.strictEqual(btn().parentNode.firstElementChild, btn());
    });

    it("re-homes when the pane is toggled by other means (View → Layout, the splitter)", async () => {
        if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
        splitter.setAttribute("state", "collapsed"); pane.setAttribute("collapsed", "true");
        await waitFor(() => btn().parentNode === doc.getElementById("zotero-items-toolbar"), 3000, "observer re-homed the button");
        splitter.setAttribute("state", "open"); pane.removeAttribute("collapsed");
        await waitFor(() => btn().parentNode === doc.getElementById("zotero-collections-toolbar"), 3000, "and back");
    });

    it("follows its setting without a reload: off removes the button, on brings it back; the Extras master too", async () => {
        Zotero.Prefs.set("weavero.collectionsPaneToggle", false);
        await waitFor(() => !btn(), 3000, "button removed on pref change");
        Zotero.Prefs.set("weavero.collectionsPaneToggle", true);
        await waitFor(() => !!btn(), 3000, "button back on pref change");
        const master = Zotero.Prefs.get("weavero.enableVisualExtras");
        try {
            Zotero.Prefs.set("weavero.enableVisualExtras", false);
            await waitFor(() => !btn(), 3000, "button removed with the Extras master off");
        }
        finally { Zotero.Prefs.set("weavero.enableVisualExtras", master === undefined ? true : !!master); }
        await waitFor(() => !!btn(), 3000, "button back with the master on");
    });

    // The collections search box opens on a line of its own at the pane's
    // full width (Zotero caps it at 180 px and squeezes it into what the
    // button row leaves -- a few characters once the toggle and Bookmarks
    // sit there). Zotero's own click listener opens it; hideCollectionSearch
    // closes it when empty.
    it("the collections search box opens on its own full-width line and the toolbar grows for it", async function () {
        const field = doc.getElementById("zotero-collections-search"), sbtn = doc.getElementById("zotero-tb-collections-search");
        const tb = doc.getElementById("zotero-toolbar-collection-tree"), bar = doc.getElementById("zotero-collections-toolbar");
        if (!field || !sbtn || pane.hasAttribute("collapsed")) this.skip();
        const r = el => el.getBoundingClientRect();
        const rowTopBefore = Math.round(r(btn()).top), tbBefore = Math.round(r(tb).height);
        const magnifierBefore = Math.round(r(sbtn).left);
        sbtn.click();
        await waitFor(() => field.classList.contains("visible"), 3000, "search box opened");
        // Focused and enabled at once -- not after Zotero's 250-ms animation
        // wait, which the full-width line has no use for.
        await new Promise(res => win.setTimeout(res, 30));
        assert.isFalse(field.hasAttribute("disabled"), "enabled at once");
        assert.ok(doc.activeElement === field || (doc.activeElement && doc.activeElement.closest && doc.activeElement.closest("#zotero-collections-search")), "focused at once");
        await new Promise(res => win.setTimeout(res, 400));
        try {
            assert.isAtLeast(Math.round(r(field).top), Math.round(r(btn()).bottom), "below the button row");
            assert.isAtLeast(r(field).width, r(bar).width * 0.9, "the pane's full width, not a slot");
            assert.isAtLeast(Math.round(r(tb).height), tbBefore + 28, "the toolbar grew for the second line");
            assert.strictEqual(Math.round(r(btn()).top), rowTopBefore, "row 1 stays where it was");
            // The magnifier keeps its place at the end of row 1 (Zotero hides
            // it inline) and shows Zotero's pressed look.
            assert.isAbove(r(sbtn).width, 0, "the magnifier is still shown");
            assert.strictEqual(Math.round(r(sbtn).top), rowTopBefore, "on row 1");
            assert.isAtMost(Math.abs(Math.round(r(sbtn).right) - Math.round(r(bar).right)), 1, "at the row's right end");
            assert.strictEqual(Math.round(r(sbtn).left), magnifierBefore, "the magnifier has not moved");
            assert.strictEqual(sbtn.getAttribute("open"), "true", "pressed look while the box is open");
            // A second click there collapses the box (Zotero's own would only focus it).
            field.value = "abc";
            sbtn.click();
            await waitFor(() => !field.classList.contains("visible"), 3000, "second click collapsed the box");
            await new Promise(res => win.setTimeout(res, 300));
            assert.strictEqual(field.value, "", "and cleared the filter");
            assert.isNull(sbtn.getAttribute("open"), "pressed look gone");
            // A REAL click on an empty box: mousedown blurs it, Zotero's blur
            // handler closes it, then the click arrives on a closed box -- it
            // must not reopen it. (Past the 350-ms window first: the collapse
            // above started one.)
            await new Promise(res => win.setTimeout(res, 500));
            sbtn.click();
            await waitFor(() => field.classList.contains("visible"), 3000, "reopened for the real-click case");
            await new Promise(res => win.setTimeout(res, 300));
            field.blur();
            await waitFor(() => !field.classList.contains("visible"), 3000, "blur closed the empty box");
            await new Promise(res => win.setTimeout(res, 60));
            sbtn.click();
            await new Promise(res => win.setTimeout(res, 400));
            assert.isFalse(field.classList.contains("visible"), "the same gesture's click did not reopen it");
        }
        finally {
            if (field.classList.contains("visible")) { field.value = ""; field.blur(); win.ZoteroPane.hideCollectionSearch(); }
            await waitFor(() => !field.classList.contains("visible"), 3000, "search box closed");
            await new Promise(res => win.setTimeout(res, 300));
        }
        assert.strictEqual(Math.round(r(tb).height), tbBefore, "closed: the toolbar is one row again");
        assert.strictEqual(Math.round(r(sbtn).left), magnifierBefore, "closed: the magnifier is where it started");
    });

    // Ctrl+F / ⌘F with the focus in the collections pane opens the
    // collections search, not the items quick search. Trusted key events
    // cannot be made here; the wired handler is called with a stand-in
    // event, the focus placed for real.
    it("Ctrl+F in the collections pane opens the collections search; elsewhere it stays Zotero's", async function () {
        const field = doc.getElementById("zotero-collections-search"), tree = doc.getElementById("collection-tree") || doc.querySelector("#zotero-collections-pane .virtualized-table");
        if (!field || !tree || pane.hasAttribute("collapsed")) this.skip();
        const ev = () => ({ key: "f", ctrlKey: !Zotero.isMac, metaKey: !!Zotero.isMac, shiftKey: false, altKey: false, prevented: 0, preventDefault() { this.prevented++; }, stopPropagation() {} });
        // Find the wired handler through a probe: it is the capture keydown
        // that reacts to accel+F while the collections tree has focus.
        tree.focus();
        assert.ok(doc.getElementById("zotero-collections-pane").contains(doc.activeElement), "focus in the collections pane");
        let e = ev();
        const handlers = doc._wvCollSearchKeyHandler ? [doc._wvCollSearchKeyHandler] : [];
        assert.strictEqual(handlers.length, 1, "keydown handler exposed for the guard");
        handlers[0](e);
        await waitFor(() => field.classList.contains("visible"), 3000, "collections search opened");
        assert.strictEqual(e.prevented, 1, "Zotero's find pre-empted");
        await new Promise(res => win.setTimeout(res, 350));
        field.value = ""; field.blur(); win.ZoteroPane.hideCollectionSearch();
        await waitFor(() => !field.classList.contains("visible"), 3000, "closed again");
        // Focus in the items pane: untouched.
        const search = doc.getElementById("zotero-tb-search"); if (search && search.focus) search.focus();
        e = ev(); handlers[0](e);
        await new Promise(res => win.setTimeout(res, 200));
        assert.strictEqual(e.prevented, 0, "elsewhere the key is Zotero's");
        assert.isFalse(field.classList.contains("visible"));
    });

    // An empty box closes on blur (Zotero); a blur because the window lost
    // focus keeps it. The window cannot be deactivated here: hasFocus() is
    // shadowed on the document for one real blur.
    it("the search box survives the window losing focus, and still closes on a blur inside it", async function () {
        const field = doc.getElementById("zotero-collections-search"), sbtn = doc.getElementById("zotero-tb-collections-search");
        const tree = doc.getElementById("collection-tree") || doc.querySelector("#zotero-collections-pane .virtualized-table");
        if (!field || !sbtn || !tree || pane.hasAttribute("collapsed")) this.skip();
        if (field.classList.contains("visible")) { field.value = ""; field.blur(); win.ZoteroPane.hideCollectionSearch(); }
        await new Promise(r => win.setTimeout(r, 500));   // past the same-gesture window a previous close may have started
        sbtn.click();
        await waitFor(() => field.classList.contains("visible"), 3000, "opened");
        await new Promise(r => win.setTimeout(r, 400));
        Object.defineProperty(doc, "hasFocus", { value: () => false, configurable: true });
        try { field.blur(); await new Promise(r => win.setTimeout(r, 200)); }
        finally { delete doc.hasFocus; }
        assert.isTrue(field.classList.contains("visible"), "window lost focus: the box stays");
        field.focus(); await new Promise(r => win.setTimeout(r, 100));
        tree.focus();
        await waitFor(() => !field.classList.contains("visible"), 3000, "a blur inside the window closes it");
    });

    it("re-applying never duplicates the button", () => {
        wv._wvApplyCollectionsPaneToggle(win);
        wv._wvApplyCollectionsPaneToggle(win);
        assert.strictEqual(doc.querySelectorAll("#" + ID).length, 1);
    });
});
