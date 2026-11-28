/* global describe, it, before, beforeEach, after, assert, Zotero, Services */

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
        if (!wv || typeof wv._wvApplyCollectionsPaneToggle !== "function") wvT.absent('!wv || typeof wv._wvApplyCollectionsPaneToggle !== "function"');
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

    // Focus-driven tests (the search box closes on blur, Ctrl+F follows the
    // focused pane) need Zotero's MAIN window to be the active one, and the
    // scaffold's runner page takes the activation ~800 ms into a run
    // (measured 2026-10-01, headless). An inactive window gets no
    // focus/blur events at all, so re-activate the main window before each
    // test and wait until it is. A desktop session that refuses activation
    // (GNOME/Wayland) is why local Linux runs go headless
    // (zotero-plugin.config.ts).
    beforeEach(async () => {
        for (let i = 0; i < 30 && Services.focus.activeWindow !== win; i++) {
            win.focus();
            await new Promise(r => win.setTimeout(r, 100));
        }
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

    it("collapsed, keeps its inset from the library view's own start wherever the view sits (a split's right side)", async function () {
        // 2026-11-17 (MJT, trial.10): a library tab shown as a split view's right
        // side (beside a locked tab) collapsed its collections pane; the button's
        // offset was measured from the WINDOW's left (target 8 px), so it got
        // margin-inline-start -962 px and took New Item, Add Attachment and New Note
        // off screen with it once the tab was drawn on the left again.
        if (doc.hidden) this.skip();
        const trees = doc.getElementById("zotero-trees");
        assert.ok(trees, "#zotero-trees");
        if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
        const tb = doc.getElementById("zotero-toolbar-collection-tree");
        const inset = Math.round(parseFloat(win.getComputedStyle(tb).paddingInlineStart)) || 8;
        const was = trees.style.marginInlineStart;
        try {
            // The library view moved away from the window's start, as a split's right
            // side is: the button must follow it.
            trees.style.marginInlineStart = "300px";
            btn().doCommand();
            await waitFor(() => btn().parentNode === doc.getElementById("zotero-items-toolbar"), 3000, "collapsed: in the items toolbar");
            await new Promise(r => win.requestAnimationFrame(() => win.setTimeout(r, 120)));
            const off = Math.round(btn().getBoundingClientRect().left - trees.getBoundingClientRect().left);
            assert.isAtMost(Math.abs(off - inset), 1, "the button sits " + inset + " px into the view, not at the window's x = " + inset + " (offset " + off + ", margin " + btn().style.marginInlineStart + ")");
        } finally {
            trees.style.marginInlineStart = was;
            if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
        }
    });

    it("re-homes when the pane is toggled by other means (View → Layout, the splitter)", async () => {
        if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
        splitter.setAttribute("state", "collapsed"); pane.setAttribute("collapsed", "true");
        await waitFor(() => btn().parentNode === doc.getElementById("zotero-items-toolbar"), 3000, "observer re-homed the button");
        splitter.setAttribute("state", "open"); pane.removeAttribute("collapsed");
        await waitFor(() => btn().parentNode === doc.getElementById("zotero-collections-toolbar"), 3000, "and back");
    });

    it("side-pane splitters stop at the minimum width while the setting is on; off gives Zotero's snap back", async () => {
        const cs = doc.getElementById("zotero-collections-splitter"), is = doc.getElementById("zotero-items-splitter");
        const xs = doc.getElementById("zotero-context-splitter");
        const saved = Zotero.Prefs.get("weavero.paneDragNoCollapse");
        try {
            Zotero.Prefs.set("weavero.paneDragNoCollapse", true);
            await waitFor(() => !cs.hasAttribute("collapse") && !is.hasAttribute("collapse") && !xs.hasAttribute("collapse"), 3000, "snap removed on every side");
            assert.equal(cs.getAttribute("data-wv-collapse"), "before");
            assert.equal(is.getAttribute("data-wv-collapse"), "after");
            assert.equal(xs.getAttribute("data-wv-collapse"), "after", "reader tabs' context pane too");
            Zotero.Prefs.set("weavero.paneDragNoCollapse", false);
            await waitFor(() => cs.getAttribute("collapse") === "before" && is.getAttribute("collapse") === "after" && xs.getAttribute("collapse") === "after", 3000, "Zotero's snap back");
            assert.isFalse(cs.hasAttribute("data-wv-collapse"));
            // Independent of the collections-pane button.
            Zotero.Prefs.set("weavero.paneDragNoCollapse", true);
            Zotero.Prefs.set("weavero.collectionsPaneToggle", false);
            await waitFor(() => !btn(), 3000, "button off");
            assert.isFalse(cs.hasAttribute("collapse"), "still no snap without the button");
            Zotero.Prefs.set("weavero.collectionsPaneToggle", true);
            await waitFor(() => !!btn(), 3000, "button back");
        }
        finally { Zotero.Prefs.set("weavero.paneDragNoCollapse", saved === undefined ? true : !!saved); }
    });

    // Issue #63 (2026-11-04, GNOME, Zotero 11.0-beta.3): "After enabling
    // Weavero, a gap appears between Collections Pane and top bar of middle
    // pane." Zotero's _splitter.scss makes the open collections splitter
    // take no room (`splitter-invisible-size`: negative margins, a 1-px
    // border as the pane edge) only through `[collapse="before"]`, the
    // attribute "stops at the minimum width" takes away: the splitter then
    // took its 5 px and showed the window background -- the pane's own
    // colour on Windows, Linux's darker one (#main-window background-color:
    // initial). With the setting on, the open splitter keeps Zotero's
    // geometry. FAILED on 1.0.0-beta.2-dev.7 (a 5-px gap, margins 0).
    it("the open collections splitter takes no room with the setting on, as with Zotero's snap (issue #63)", async () => {
        if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
        const ls = doc.getElementById("zotero-layout-switcher");
        const geo = () => {
            const c = win.getComputedStyle(splitter);
            return {
                gap: Math.round(ls.getBoundingClientRect().left - pane.getBoundingClientRect().right),
                margins: c.marginLeft + " " + c.marginRight,
                borders: c.borderLeftWidth + " " + c.borderLeftStyle + " " + c.borderRightWidth + " " + c.borderRightStyle,
                edge: c.borderLeftColor,
            };
        };
        const saved = Zotero.Prefs.get("weavero.paneDragNoCollapse");
        try {
            Zotero.Prefs.set("weavero.paneDragNoCollapse", false);
            await waitFor(() => splitter.getAttribute("collapse") === "before", 3000, "Zotero's snap");
            const zotero = geo();
            assert.strictEqual(zotero.gap, 0, "Zotero: the items pane meets the collections pane");
            Zotero.Prefs.set("weavero.paneDragNoCollapse", true);
            await waitFor(() => splitter.getAttribute("data-wv-collapse") === "before" && !splitter.hasAttribute("collapse"), 3000, "the snap taken away");
            assert.deepEqual(geo(), zotero, "the same splitter geometry with the setting on");
        }
        finally { Zotero.Prefs.set("weavero.paneDragNoCollapse", saved === undefined ? true : !!saved); }
    });

    it("collapsed splitters with no way to drag back open take no pointer (no dead resize cursor; MJT 2026-10-05)", async () => {
        const pe = (el) => win.getComputedStyle(el).pointerEvents;
        const is = doc.getElementById("zotero-items-splitter");
        const itemPaneEl = doc.getElementById("zotero-item-pane");
        const ipCollapsed = itemPaneEl.getAttribute("collapsed");
        const saved = Zotero.Prefs.get("weavero.paneDragNoCollapse");
        const isState = is.getAttribute("state");
        try {
            Zotero.Prefs.set("weavero.paneDragNoCollapse", true);
            await waitFor(() => is.hasAttribute("data-wv-collapse"), 3000, "snap removed");
            // Left: collapsed by the button -> the 1 px edge line takes no pointer.
            if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
            assert.notEqual(pe(splitter), "none", "open: the splitter drags as usual");
            wv._wvCollectionsPaneToggle(win);
            assert.equal(pe(splitter), "none", "collapsed with the button: no resize cursor, no drag");
            wv._wvCollectionsPaneToggle(win);
            // Right: the item pane's collapsed splitter (Zotero's sidenav reopens it).
            // Collapsed as Zotero does it (collapsiblePane.mjs setPaneCollapsed: the
            // pane's `collapsed` AND the splitter's state), not the state alone: the
            // rule needs both since a splitter left collapsed beside an OPEN pane
            // must stay draggable (Zutilo's sticky toggle, 2026-11-15).
            itemPaneEl.setAttribute("collapsed", "true");
            is.setAttribute("state", "collapsed");
            assert.equal(pe(is), "none", "collapsed item-pane splitter takes no pointer");
            Zotero.Prefs.set("weavero.paneDragNoCollapse", false);
            await waitFor(() => !is.hasAttribute("data-wv-collapse"), 3000, "snap back");
            assert.notEqual(pe(is), "none", "Zotero's snap back: the strip drags the pane open again");
            // Left too: with Zotero's snap back, the collapsed strip drags open again.
            wv._wvCollectionsPaneToggle(win);
            assert.notEqual(pe(splitter), "none", "setting off: the collapsed collections strip drags open again");
            wv._wvCollectionsPaneToggle(win);
        }
        finally {
            if (isState) is.setAttribute("state", isState); else is.removeAttribute("state");
            if (ipCollapsed === null) itemPaneEl.removeAttribute("collapsed"); else itemPaneEl.setAttribute("collapsed", ipCollapsed);
            Zotero.Prefs.set("weavero.paneDragNoCollapse", saved === undefined ? true : !!saved);
        }
    });

    it("a splitter left at state=collapsed beside an OPEN pane stays draggable (Zutilo's sticky toggle, 2026-11-15)", async () => {
        // Zutilo's "sticky" show/hide opens the pane again and leaves its
        // splitter at state="collapsed" (a 10 px draggable divider). Weavero's
        // thin, pointer-less treatment of a collapsed splitter keyed on that
        // state alone, so the open pane could no longer be resized.
        const cs = win.getComputedStyle(splitter);
        const is = doc.getElementById("zotero-items-splitter");
        const itemPane = doc.getElementById("zotero-item-pane");
        const saved = Zotero.Prefs.get("weavero.paneDragNoCollapse");
        const sState = splitter.getAttribute("state"), iState = is.getAttribute("state");
        try {
            Zotero.Prefs.set("weavero.paneDragNoCollapse", true);
            await waitFor(() => splitter.hasAttribute("data-wv-collapse") && is.hasAttribute("data-wv-collapse"), 3000, "snap removed");
            if (pane.hasAttribute("collapsed")) wv._wvCollectionsPaneToggle(win);
            assert.isTrue(splitter.hasAttribute("wv-thin"), "the toggle button is on");
            assert.isFalse(pane.hasAttribute("collapsed") || itemPane.hasAttribute("collapsed"), "both panes open");
            splitter.setAttribute("state", "collapsed");
            is.setAttribute("state", "collapsed");
            assert.notEqual(cs.pointerEvents, "none", "collections splitter beside an open pane takes the pointer");
            assert.notEqual(cs.getPropertyValue("--draggable-size").trim(), "1px", "and keeps Zotero's drag band");
            assert.notEqual(win.getComputedStyle(is).pointerEvents, "none", "item-pane splitter beside an open pane takes the pointer");
        }
        finally {
            if (sState) splitter.setAttribute("state", sState); else splitter.removeAttribute("state");
            if (iState) is.setAttribute("state", iState); else is.removeAttribute("state");
            Zotero.Prefs.set("weavero.paneDragNoCollapse", saved === undefined ? true : !!saved);
        }
    });

    it("follows its setting without a reload: off removes the button, on brings it back; the Extras master too", async () => {
        // With the button, the collapsed splitter's drag band shrinks to 1 px
        // (Zotero's own treatment of the context pane's splitter); without it,
        // Zotero's band is the way back and keeps its width.
        const splitter = doc.getElementById("zotero-collections-splitter");
        assert.isTrue(splitter.hasAttribute("wv-thin"), "button on: splitter marked thin");
        Zotero.Prefs.set("weavero.collectionsPaneToggle", false);
        await waitFor(() => !btn(), 3000, "button removed on pref change");
        assert.isFalse(splitter.hasAttribute("wv-thin"), "button off: Zotero's band back");
        Zotero.Prefs.set("weavero.collectionsPaneToggle", true);
        await waitFor(() => !!btn(), 3000, "button back on pref change");
        assert.isTrue(splitter.hasAttribute("wv-thin"), "and thin again");
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
    // At the pane's NARROWEST width (Zotero's min-width, 200 px -- a fresh
    // profile's width too): the row holds every button there, closed and open.
    // 1.3.0-beta.1 (2026-11-28): the collections funnel's 40-px menu button
    // (coll-funnel.ts) pushed the magnifier 20 px past the toolbar's end there
    // (closed) and onto a line of its own (open).
    it("the collections search box opens on its own full-width line and the toolbar grows for it", async function () {
        const field = doc.getElementById("zotero-collections-search"), sbtn = doc.getElementById("zotero-tb-collections-search");
        const tb = doc.getElementById("zotero-toolbar-collection-tree"), bar = doc.getElementById("zotero-collections-toolbar");
        if (!field || !sbtn || pane.hasAttribute("collapsed")) this.skip();
        const r = el => el.getBoundingClientRect();
        // The row's buttons, for the messages: id@left-right/top.
        const row = () => [...bar.querySelectorAll(":scope > toolbarbutton, :scope > div > toolbarbutton")]
            .map(b => b.id + "@" + Math.round(r(b).left) + "-" + Math.round(r(b).right) + "/" + Math.round(r(b).top)).join(" ")
            + " | bar " + Math.round(r(bar).left) + "-" + Math.round(r(bar).right);
        const widthWas = pane.style.width, minW = win.getComputedStyle(pane).minWidth;
        pane.style.width = minW;
        try {
            await new Promise(res => win.requestAnimationFrame(() => win.setTimeout(res, 60)));
            assert.isAtMost(Math.abs(r(pane).width - parseFloat(minW)), 1, "the pane at its narrowest width (" + minW + ")");
            // Closed: one row, Zotero's magnifier at its end, inside the toolbar.
            assert.isAtMost(Math.round(r(sbtn).right), Math.round(r(bar).right), "closed: the magnifier inside the toolbar: " + row());
            assert.isAtMost(Math.abs(Math.round(r(sbtn).right) - Math.round(r(bar).right)), 1, "closed: at the row's right end: " + row());
            assert.strictEqual(Math.round(r(sbtn).top), Math.round(r(btn()).top), "closed: on the button row: " + row());
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
                assert.strictEqual(Math.round(r(sbtn).top), rowTopBefore, "on row 1: " + row());
                assert.isAtMost(Math.abs(Math.round(r(sbtn).right) - Math.round(r(bar).right)), 1, "at the row's right end: " + row());
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
        }
        finally { pane.style.width = widthWas; }
    });

    // Ctrl+F / ⌘F with the focus in the collections pane opens the
    // collections search, not the items quick search. Trusted key events
    // cannot be made here; the wired handler is called with a stand-in
    // event, the focus placed for real.
    it("Ctrl+F in the collections pane opens the collections search; elsewhere it stays Zotero's", async function () {
        const field = doc.getElementById("zotero-collections-search"), tree = doc.getElementById("collection-tree") || doc.querySelector("#zotero-collections-pane .virtualized-table");
        if (!field || !tree || pane.hasAttribute("collapsed")) this.skip();
        // Past the same-gesture window a previous close may have started, as the
        // test after this one does: the handler opens the box through the
        // magnifier's click, and a click within 350 ms of a close is swallowed
        // (pane.ts _wvWireCollectionsSearchToggle). The previous test's `finally`
        // ends 300 ms after the close it makes when an assertion failed there --
        // this test then timed out on its own first step, a second red line for
        // one defect (1.3.0-beta.1 gates, 2026-11-28).
        if (field.classList.contains("visible")) { field.value = ""; field.blur(); win.ZoteroPane.hideCollectionSearch(); }
        await new Promise(res => win.setTimeout(res, 500));
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
