/* global describe, it, before, after, assert, Zotero, Services, wvT */

// Widen or narrow the item pane's Tags, Related, Links and Backlinks
// sections (MJT 2026-10-29, "For the sections Tags, Related, Links and
// Backlinks, it should be possible to extend or narrow whether to show only
// for the parent, or also for the childs and annotations"; intake: a button
// in each section's header, the children's entries grouped by part,
// remembered per section, Links narrow = the paper's own notes; plan "ok").
// Written before the code (the feature skill's check-first rule): every
// `it` fails on 0.22.3-dev.97.

describe("Weavero — item-pane sections widen to the children and annotations", function () {
    this.timeout(90000);
    let wv, win, doc, lib, P, A, X, N, S, P2, N2, R1, R2, T1, T2;
    // The main window's filter on a section's header counts (dev.113: the
    // items list's, per window; MJT 2026-10-30), set as the header button's
    // widen / narrow (dev.98-111) -- no filter, or the item's own only
    // (Links: its notes') -- and a redraw (selecting the item already
    // selected renders nothing again).
    const set = (k, wide) => {
        Object.assign(wv._wvScopeFilterFor(win, k), { inc: wide ? [] : [k === "links" ? "note" : "own"], exc: [], loop: 0 });
        wv._wvScopeRefresh(k);
    };
    const det = () => doc.querySelector("#zotero-item-pane item-details");
    // The item pane's sections (the note editor's links box holds a tags-box
    // and a related-box too, without a pane id).
    const box = (tag) => det() && det().querySelector(tag + '[data-pane="' + tag.replace(/-box$/, "") + '"]');
    const sec = (tag) => { const b = box(tag); return b && b.querySelector(":scope > collapsible-section"); };
    const custom = (k) => det() && det().querySelector('item-pane-custom-section[data-pane$="weavero-' + k + '"]');
    const btn = (el) => el && el.querySelector(".head .section-custom-button.wv-scope");
    const block = (tag) => { const s = sec(tag); return s && s.querySelector(":scope > .wv-scope-block"); };
    const heads = (b) => [...b.querySelectorAll(".wv-count-group-head .wv-count-group-title")].map((e) => e.textContent);
    const rowsOf = (b) => [...b.querySelectorAll(".wv-count-group")].map((g) => [...g.querySelectorAll(".wv-count-row")].map((r) => r.textContent.trim()));
    const title = (s) => s.querySelector(".head .title").textContent;
    // The level counts beside a header's title (MJT 2026-10-29: "I would
    // like to use icons to make it more compact"): [level, number].
    const counts = (s) => { const c = s && s.querySelector(".head .wv-scope-counts"); return c ? [...c.querySelectorAll(".wv-scope-count")].map((e) => [e.dataset.kind, e.querySelector(".wv-scope-count-n").textContent]) : []; };
    const titleIs = async (s, re) => (await wvT.waitFor(() => re.test(title(s)) || null, 5000)) ? title(s) : title(s);
    const lkRows = () => [...custom("links").querySelectorAll(".wv-bl-row")].filter((r) => !r.closest(".wv-bl-more"));
    const blRows = () => [...custom("backlinks").querySelectorAll(".wv-bl-row")];
    const note = async (t, body, parentID) => {
        const n = /** @type {any} */ (new Zotero.Item("note"));
        n.libraryID = lib;
        if (parentID) n.parentID = parentID;
        n.setNote("<h1>" + t + "</h1><p>" + body + "</p>");
        await n.saveTx({ skipSelect: true });
        return n;
    };
    const ann = async (att, text, page, comment) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = "highlight";
        a.annotationText = text;
        a.annotationComment = comment || "";
        a.annotationColor = "#ffd400";
        a.annotationPageLabel = page;
        a.annotationSortIndex = "0000" + page + "|000001|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: Number(page) - 1, rects: [[10, 10, 60, 20]] });
        await a.saveTx();
        return a;
    };
    const tag = async (it, t) => { it.addTag(t); await it.saveTx({ skipSelect: true }); };
    const relate = async (a, b) => { a.addRelatedItem(b); await a.saveTx({ skipSelect: true }); b.addRelatedItem(a); await b.saveTx({ skipSelect: true }); };
    const select = async (it) => {
        await win.ZoteroPane.selectItem(it.id);
        const ok = await wvT.waitFor(() => {
            const b = box("tags-box"), r = box("related-box");
            return b && b.item && b.item.id === it.id && r && r.item && r.item.id === it.id && sec("tags-box") && sec("related-box") ? true : null;
        }, 15000);
        assert.isOk(ok, "the item pane shows " + it.id);
        for (const t of ["tags-box", "related-box"]) { try { sec(t).open = true; } catch (e) {} }
    };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvScopeFilterFor", "_wvScopeFilterReset", "_wvScopeFilterToggle", "_wvScopeInit", "_wvScopeDestroy", "_wvBlEnsure", "_wvCountSourceLabel"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; lib = Zotero.Libraries.userLibraryID;
        R1 = await wvT.createItem("book", { title: "WVSC related one" });
        R2 = await wvT.createItem("book", { title: "WVSC related two" });
        T1 = await wvT.createItem("book", { title: "WVSC target one" });
        T2 = await wvT.createItem("book", { title: "WVSC target two" });
        P = await wvT.createItem("journalArticle", { title: "WVSC paper" });
        await tag(P, "wvsc-own");
        A = await wvT.createTestPDFItem("wvsc-pdf", { parentItemID: P.id });
        await tag(A, "wvsc-pdf");
        X = await ann(A, "scope words", "2", "See zotero://select/library/items/" + T1.key + " here.");
        await tag(X, "wvsc-ann");
        N = await note("WVSC note", "Go zotero://select/library/items/" + T2.key + " now.", P.id);
        await tag(N, "wvsc-note");
        await relate(P, R2);
        await relate(X, R1);
        S = await note("WVSC source", "Links zotero://select/library/items/" + P.key + " and zotero://open/library/items/" + A.key + "?annotation=" + X.key + " here.");
        P2 = await wvT.createItem("book", { title: "WVSC bare" });
        N2 = await note("WVSC bare note", "nothing", P2.id);
        await tag(N2, "wvsc-n2");
        await wv._wvBlEnsure();
        await wvT.waitFor(() => wv._wvBlDirect(P).some((s) => s.srcID === S.id) && wv._wvBlDirect(X).some((s) => s.srcID === S.id)
            && wv._wvLkOut(N).length === 1 && wv._wvLkOut(X).length === 1, 10000);
    });

    after(async function () {
        // The next spec finds the window as a new one: from the defaults.
        wv._wvScopeFilterReset(win);
        wv._wvScopeRefresh();
        await wvT.erase(S, P, P2, R1, R2, T1, T2);
    });

    // The header button (dev.98-111) widened a whole section; the counts
    // beside the title list each level now (MJT 2026-10-29, "I feel that the
    // top right toggle ... is redondant with the icons on the left" -> "Ok
    // for A"). dev.111 still had the button on all four.
    it("no header button: Zotero's + alone in Tags and Related, nothing in Links and Backlinks; a left-over button goes", async function () {
        set("tags", false); set("related", false); set("links", true); set("backlinks", false);
        await select(P);
        await wvT.waitFor(() => custom("links") && custom("backlinks") || null, 15000);
        for (const t of ["tags-box", "related-box"]) {
            assert.strictEqual(sec(t).getAttribute("extra-buttons"), "add", t + ": Zotero's own buttons");
            assert.isNull(btn(sec(t)), t + ": no scope button");
        }
        for (const k of ["links", "backlinks"]) assert.isNull(btn(custom(k)), k + ": no scope button");
        // A section a build before dev.112 left with its button is given back.
        sec("tags-box").setAttribute("extra-buttons", "wv-scope,add");
        wv._wvScopeRefresh("tags");
        assert.strictEqual(sec("tags-box").getAttribute("extra-buttons"), "add", "the left-over button removed");
    });

    // A new window, and every window after a restart, starts from the
    // Settings defaults (MJT 2026-10-30, "I should be able to decide in the
    // settings what is the default for new windows and after restart"; 2b:
    // the header button's defaults). FAILED on dev.112 (no per-window filter).
    it("a window's filter starts from the Settings defaults: the levels checked shown alone, all or none checked no filter", async function () {
        const fresh = (k) => { wv._wvScopeFilterReset(win, k); const f = wv._wvScopeFilterFor(win, k); return [f.inc.slice(), f.exc.slice(), f.loop, f.broken]; };
        try {
            assert.deepEqual(fresh("tags"), [["own"], [], 0, 0], "Tags: the item's own only");
            assert.deepEqual(fresh("related"), [["own"], [], 0, 0], "Related: the item's own only");
            // Links' broken links shown by default (MJT 2026-10-30, "Always show
            // broken links. The square barred is too flashy to be the default";
            // hidden from dev.121 to dev.127), their count a toggle ("1a").
            assert.deepEqual(fresh("links"), [[], [], 0, 0], "Links: notes and annotations checked, so no level filter; the broken links shown");
            assert.deepEqual(fresh("backlinks"), [["own"], [], 0, 0], "Backlinks: the item's own only");
            await wvT.withPref("weavero.paneScope.backlinks.ann", true, () => assert.deepEqual(fresh("backlinks"), [["own", "ann"], [], 0, 0], "two checked: either"));
            await wvT.withPref("weavero.paneScope.links.loop", false, () => assert.deepEqual(fresh("links"), [[], [], -1, 0], "internal links unchecked: hidden"));
            await wvT.withPref("weavero.paneScope.links.broken", false, () => assert.deepEqual(fresh("links"), [[], [], 0, -1], "broken links unchecked: hidden"));
            await wvT.withPref("weavero.paneScope.links.note", false, () => wvT.withPref("weavero.paneScope.links.ann", false,
                () => assert.deepEqual(fresh("links"), [[], [], 0, 0], "none checked: no level filter")));
            // The two kinds of reference too, as the levels (MJT 2026-11-02,
            // "The new additions are missing from here"): both checked (the
            // default) or none, no filter; one alone, only those. Until
            // dev.153 every window started with both. FAILED on dev.153.
            const ref = (k) => { wv._wvScopeFilterReset(win, k); return wv._wvScopeFilterFor(win, k).ref; };
            assert.strictEqual(ref("links"), 0, "both checked: no filter");
            assert.strictEqual(ref("backlinks"), 0);
            await wvT.withPref("weavero.paneScope.links.citations", false, () => assert.strictEqual(ref("links"), 1, "Zotero links alone"));
            await wvT.withPref("weavero.paneScope.backlinks.zlinks", false, () => assert.strictEqual(ref("backlinks"), -1, "note citations alone"));
            await wvT.withPref("weavero.paneScope.links.zlinks", false, () => wvT.withPref("weavero.paneScope.links.citations", false,
                () => assert.strictEqual(ref("links"), 0, "none checked: no filter")));
            // A window that changed its filter keeps it; a new one starts afresh.
            const f = wv._wvScopeFilterFor(win, "tags");
            f.inc = ["ann"];
            assert.strictEqual(wv._wvScopeFilterFor(win, "tags"), f, "kept while the window lives");
            // A filter kept from an older build (an update reloads the plugin
            // under open windows) gets the newer states' defaults, its own
            // kept (dev.121's first install: the broken count drawn stateless).
            win._wvScopeFilters.links = { inc: ["note"], exc: [], loop: 0 };
            const lf = wv._wvScopeFilterFor(win, "links");
            assert.deepEqual([lf.inc, lf.loop, lf.broken, lf.ref], [["note"], 0, 0, 0], "the old levels kept, the broken links shown, both kinds");
            // The defaults' Settings grid (dev.114-161) is gone from the pane
            // (MJT 2026-11-03, "Remove these settings ... I will just design
            // the default first"; prefs-search-blocks.spec.js): the prefs
            // stand, at the table's defaults.
        }
        finally {
            for (const k of ["tags", "related", "links", "backlinks"]) wv._wvScopeFilterReset(win, k);
        }
    });

    it("Tags widened: Zotero's list, then each part with its tags under a heading; a child's tag goes to that child; narrow again restores Zotero's header", async function () {
        set("tags", false);
        await select(P);
        assert.isNull(block("tags-box"), "narrow: Zotero's list alone");
        set("tags", true);
        const b = await wvT.waitFor(() => block("tags-box"), 5000);
        assert.isOk(b, "the children's block");
        assert.deepEqual(heads(b), [A.getDisplayTitle(), X.getDisplayTitle(), N.getNoteTitle()], "the file, its annotation, then the note");
        // An annotation's heading as a row's line names it: Zotero's title for
        // it, then in grey its page (MJT 2026-10-30, "For the origin of links,
        // why not use the same format as the targets" -> the headings too;
        // "Annotation p. 2: “scope words”" until dev.129).
        assert.deepEqual([...b.querySelectorAll(".wv-count-group-head")].map((h) => (h.querySelector(".wv-count-group-chip") || { textContent: "" }).textContent), ["", "p. 2", ""], "its page after it");
        assert.deepEqual(rowsOf(b), [["wvsc-pdf"], ["wvsc-ann"], ["wvsc-note"]]);
        assert.deepEqual([...b.querySelectorAll(".wv-count-group-n")].map((e) => e.textContent), ["1", "1", "1"], "each part's count");
        assert.include([...box("tags-box").querySelectorAll("#rows editable-text")].map((e) => e.value), "wvsc-own", "the item's own tags stay Zotero's");
        // Each level counted apart, an annotation on the file and not on the
        // paper (MJT 2026-10-29, "I would separate the children and the
        // annotations levels"), by Zotero's own icon beside the title ("I
        // would like to use icons to make it more compact"); the title is
        // Zotero's own text still.
        assert.deepEqual(counts(sec("tags-box")), [["own", "1"], ["att", "1"], ["note", "1"], ["ann", "1"]], "its own, one tag on its PDF, one on its note, one on the PDF's annotation");
        const ownIcon = sec("tags-box").querySelector('.head .wv-scope-count[data-kind="own"] .wv-scope-count-type');
        assert.isOk(ownIcon, "its own by its item-type icon");
        // Zotero's item-type rule is several layers: the theme's icon, then
        // its other variants preloaded at 0 px. A single size sized them all
        // and the light theme's white page showed under the dark outline
        // (MJT 2026-10-30, "Why is it not similar to the other ones?").
        const ics = ownIcon.ownerDocument.defaultView.getComputedStyle(ownIcon);
        // One image-set() per layer (its url()s are its resolutions).
        const layerCount = (ics.backgroundImage.match(/image-set\(/g) || []).length;
        const sizes = ics.backgroundSize.split(/,\s*/);
        const shown = [];
        for (let i = 1; i < layerCount; i++) if (!/^0px\b/.test(sizes[i % sizes.length])) shown.push(i + ": " + sizes[i % sizes.length]);
        assert.deepEqual(shown, [], "Zotero's preloaded variants stay at 0 px (" + ics.backgroundSize + ")");
        // Every count's icon at one size, 14 px: 16 px was tried and MJT kept
        // 14 ("Go back to 14 px. It felt better", 2026-10-30).
        assert.deepEqual([...sec("tags-box").querySelectorAll(".head .wv-scope-count-icon")].map((e) => { const r = e.getBoundingClientRect(); return [e.closest(".wv-scope-count").dataset.kind, r.width, r.height]; }),
            [["own", 14, 14], ["att", 14, 14], ["note", 14, 14], ["ann", 14, 14]], "each count's icon at 14 px");
        assert.match(await titleIs(sec("tags-box"), /^4 /), /^4 /, "the title counts the whole item's (MJT 2026-10-30)");
        assert.strictEqual(sec("tags-box").getAttribute("data-l10n-id"), "section-tags", "Zotero's header message stays");
        const c0 = sec("tags-box").querySelector('.head .wv-scope-count[data-kind="att"]');
        assert.match(c0.title, /^On its attachments: 1\n/, "the tooltip says what it counts");
        assert.isOk(c0.querySelector("img.wv-scope-count-icon"), "Zotero's icon");
        // The item's own get their heading too, the count popups' first one
        // ("This item" and its count), Zotero's rows one step in under it
        // (MJT 2026-10-29, "This Item classification should also appear in
        // the Related section of the item pane when the children and
        // annotations are displayed").
        const own = sec("tags-box").querySelector(":scope > .wv-scope-own");
        assert.isOk(own, "the item's own heading");
        assert.strictEqual(own.nextElementSibling, sec("tags-box").querySelector(":scope > .body"), "right above Zotero's list");
        assert.deepEqual([own.querySelector(".wv-count-group-title").textContent, own.querySelector(".wv-count-group-n").textContent], ["This item", "1"]);
        // A child's new tag shows without a reselect.
        await tag(X, "wvsc-ann2");
        assert.isOk(await wvT.waitFor(() => rowsOf(block("tags-box"))[1].length === 2 || null, 5000), "the annotation's second tag");
        const went = [];
        wv._openAnnotationInReader = (it) => { went.push(["reader", it.id]); return Promise.resolve(true); };   // own properties over the shared methods
        wv._navigateToItem = (it) => { went.push(["select", it.id]); };
        try {
            const g = block("tags-box").querySelectorAll(".wv-count-group");
            g[1].querySelector(".wv-count-row").click();
            g[2].querySelector(".wv-count-group-head").click();
            await wvT.waitFor(() => went.length >= 2 || null, 3000);
        }
        finally { delete wv._openAnnotationInReader; delete wv._navigateToItem; }
        assert.deepEqual(went, [["reader", X.id], ["select", N.id]], "an annotation's tag opens it in the reader; a note's heading selects it");
        // Remembered for the next item.
        await select(R2);
        await select(P);
        assert.isOk(await wvT.waitFor(() => block("tags-box"), 5000), "still widened on coming back");
        set("tags", false);
        assert.isOk(await wvT.waitFor(() => !block("tags-box") || null, 5000), "narrow again: the block goes");
        assert.strictEqual(sec("tags-box").getAttribute("data-l10n-id"), "section-tags", "Zotero's own header message back");
        // Zotero's own words, in the runner's UI locale ("1 marqueur").
        assert.notMatch(await titleIs(sec("tags-box"), /^((?!children).)*$/), /children/);
        assert.isNull(sec("tags-box").querySelector(":scope > .wv-scope-own"), "narrow: no heading over Zotero's list");
        // The counts stay beside the title, narrow too: they are the
        // filter toggles (MJT 2026-10-29, "I would like to use the icons as
        // filter toggles"; dev.111).
        assert.deepEqual(counts(sec("tags-box")), [["own", "1"], ["att", "1"], ["note", "1"], ["ann", "2"]], "...the counts stay, the toggles");
        assert.isFalse(sec("tags-box").hasAttribute("data-wv-scope-wide"), "...and its rows back in place");
    });

    // The title counts the whole item's (MJT 2026-10-30): an item whose only
    // tag is its note's is not empty, filtered to its own or not. Every
    // toggle the Settings default puts in a non-neutral state is pinned:
    // drawn at 0 on every item, so the default is always within reach; a
    // toggle the default does not name is drawn while its count is above 0
    // or the window's filter names it, or when Settings pins it, and goes
    // only at its default state, on an item with nothing at that level
    // (MJT 2026-11-02, "I should always be able to go back to the default";
    // dev.148-158 pinned "This item" alone, by a rule of its own, and a
    // cleared toggle at 0 vanished under the hand). FAILED on dev.158.
    it("an item whose entries all sit on children: the default's toggles pinned at 0, a Settings pin keeps any other, an unpinned one goes only at its default state", async function () {
        set("tags", false);
        await select(P2);
        assert.isOk(await wvT.waitFor(() => counts(sec("tags-box")).length === 2 || null, 5000));
        assert.isFalse(sec("tags-box").hasAttribute("empty"), "its note's tag counted: not empty");
        assert.deepEqual(counts(sec("tags-box")), [["own", "0"], ["note", "1"]], "its own at 0, the default's; its note's");
        const own = () => sec("tags-box").querySelector('.head .wv-scope-count[data-kind="own"]');
        assert.strictEqual(own().dataset.selected, "true");
        assert.strictEqual(own().dataset.pinned, "true", "pinned by the default (Tags: this item only)");
        const pinned = (k) => Array.from(wv._wvScopePinned(k)).sort();
        assert.deepEqual(pinned("tags"), ["own"]);
        assert.isNull(block("tags-box"), "the item's own only: none of its note's");
        set("tags", true);
        const b = await wvT.waitFor(() => block("tags-box"), 5000);
        assert.deepEqual(heads(b), [N2.getNoteTitle()]);
        assert.deepEqual(counts(sec("tags-box")), [["own", "0"], ["note", "1"]], "no filter: its own kept at 0, the way back");
        assert.isUndefined(own().dataset.selected, "...neutral");
        assert.isNull(sec("tags-box").querySelector(":scope > .wv-scope-own"), "nothing of its own: no \"This item\" heading");
        // A toggle the default does not name: drawn while the filter names it...
        const f = wv._wvScopeFilterFor(win, "tags");
        f.inc = ["ann"];
        wv._wvScopeRefresh("tags");
        assert.deepEqual(counts(sec("tags-box")), [["own", "0"], ["note", "1"], ["ann", "0"]], "annotations shown alone: its count drawn at 0");
        // ...and gone once cleared there: its default state, nothing to show.
        wv._wvScopeFilterToggle(sec("tags-box"), "tags", "ann", false);
        assert.deepEqual(f.inc, [], "cleared");
        assert.deepEqual(counts(sec("tags-box")), [["own", "0"], ["note", "1"]], "the annotations toggle goes at its default state");
        // Pinned in Settings: kept at 0, neutral, whatever the filter.
        await wvT.withPref("weavero.paneScope.tags.pin.ann", true, async () => {
            wv._wvScopeRefresh("tags");
            assert.deepEqual(counts(sec("tags-box")), [["own", "0"], ["note", "1"], ["ann", "0"]], "pinned: drawn at 0");
            assert.deepEqual(pinned("tags"), ["ann", "own"]);
            const ann = sec("tags-box").querySelector('.head .wv-scope-count[data-kind="ann"]');
            assert.strictEqual(ann.dataset.pinned, "true");
            assert.isUndefined(ann.dataset.selected, "...neutral");
        });
        wv._wvScopeRefresh("tags");
        assert.deepEqual(counts(sec("tags-box")), [["own", "0"], ["note", "1"]], "unpinned again: gone");
        // What the defaults pin by necessity: the levels shown alone, none
        // when all or none are checked; the internal links hidden; the
        // broken links hidden; one kind of reference alone (both counts of
        // the pair, as a pin on either cell).
        await wvT.withPref("weavero.paneScope.tags.att", true, () => assert.deepEqual(pinned("tags"), ["att", "own"], "two levels shown alone: both pinned"));
        await wvT.withPref("weavero.paneScope.tags.own", false, () => assert.deepEqual(pinned("tags"), [], "no level checked: no level filter, nothing pinned"));
        assert.deepEqual(pinned("links"), [], "Item Links: every box checked, no filter -- nothing pinned");
        await wvT.withPref("weavero.paneScope.links.loop", false, () => assert.deepEqual(pinned("links"), ["loop"], "internal links hidden by default: pinned"));
        await wvT.withPref("weavero.paneScope.links.broken", false, () => assert.deepEqual(pinned("links"), ["broken"], "broken links hidden by default: pinned"));
        await wvT.withPref("weavero.paneScope.backlinks.citations", false, () => assert.deepEqual(pinned("backlinks"), ["link", "own", "zotero"], "Zotero links alone: the pair pinned"));
        await wvT.withPref("weavero.paneScope.backlinks.pin.zlinks", true, () => assert.deepEqual(pinned("backlinks"), ["link", "own", "zotero"], "a pin on either cell: the pair"));
        set("tags", false);
    });

    // "Reset Filters to Default" in the section's own context menu (MJT
    // 2026-11-02, "Back to default can be added in the right-click menu of
    // the section"), greyed at the defaults. A real right-click opens
    // Zotero's menu with it (needs hands: a synthetic command is not
    // delivered to chrome listeners). FAILED on dev.158 (no entry).
    it("the section menu's Reset Filters to Default: Weavero's entry on every section, greyed at the defaults, the window's filter back", async function () {
        set("tags", false); set("links", true);
        await select(P);
        await wvT.waitFor(() => custom("links") && custom("backlinks") || null, 15000);
        const entry = (s) => s && s._contextMenu && s._contextMenu.querySelector(":scope > .wv-scope-menu-reset");
        const s = sec("tags-box");
        assert.isOk(entry(s), "Weavero's entry in Zotero's menu of the Tags section");
        assert.strictEqual(entry(s).getAttribute("label"), "Reset Filters to Default");
        assert.strictEqual(entry(s).getAttribute("data-wv-owned"), "true", "Weavero's own node");
        assert.strictEqual(entry(s).previousElementSibling.localName, "menuseparator", "after a separator of its own");
        assert.strictEqual(entry(s).previousElementSibling.getAttribute("data-wv-owned"), "true");
        assert.isTrue(entry(s).hasAttribute("disabled"), "at the defaults (the item's own only): greyed");
        set("tags", true);
        assert.isFalse(entry(s).hasAttribute("disabled"), "a filter set: enabled");
        await wv._wvScopeFilterRestore(s, "tags");
        const f = wv._wvScopeFilterFor(win, "tags");
        assert.deepEqual([f.inc, f.exc, f.loop, f.broken, f.ref], [["own"], [], 0, 0, 0], "the defaults again");
        assert.isTrue(entry(s).hasAttribute("disabled"), "...greyed again");
        assert.isAtLeast(counts(s).length, 2, "drawn again from the defaults");
        // Links and Backlinks: their sections' menus too, the filter of their kind.
        for (const k of ["links", "backlinks"]) {
            const cs = await wvT.waitFor(() => { const c = custom(k).querySelector("collapsible-section"); return entry(c) ? c : null; }, 5000);
            assert.isOk(cs, k + ": the entry");
            wv._wvScopeFilterFor(win, k).loop = 1;
            await wv._wvScopeRedraw(win, k);
            assert.isFalse(entry(cs).hasAttribute("disabled"), k + ": enabled with a filter");
            await wv._wvScopeFilterRestore(cs, k);
            assert.strictEqual(wv._wvScopeFilterFor(win, k).loop, 0, k + ": back to the default");
            assert.isTrue(entry(cs).hasAttribute("disabled"), k + ": greyed");
        }
        set("tags", false);
    });

    it("Related widened: each part's related items under its heading; a click opens the related item", async function () {
        set("related", false);
        await select(P);
        assert.isNull(block("related-box"));
        set("related", true);
        const b = await wvT.waitFor(() => block("related-box"), 5000);
        assert.isOk(b);
        assert.deepEqual(heads(b), [wv._wvCountSourceLabel(X, P)]);
        assert.deepEqual(rowsOf(b), [[R1.getDisplayTitle()]]);
        // Zotero's own rule for a Related title: it wraps, cut at 10 lines
        // (the clicky-item mixin, _mixins.scss `.label`); the block's titles
        // follow it (MJT 2026-10-29, "What I'd suggest: Ok").
        const clamp = (el) => win.getComputedStyle(el).getPropertyValue("-webkit-line-clamp");
        const zl = sec("related-box").querySelector(".body .row .box .label");
        assert.strictEqual(clamp(zl), "10", "Zotero's Related label: 10 lines");
        assert.strictEqual(clamp(b.querySelector(".wv-count-row .wv-rel-title")), clamp(zl), "the block's titles wrap as Zotero's do");
        assert.deepEqual(counts(sec("related-box")), [["own", "1"], ["ann", "1"]], "its own; X is an annotation: no child of the paper's");
        const own = sec("related-box").querySelector(":scope > .wv-scope-own");
        assert.deepEqual(own && [own.querySelector(".wv-count-group-title").textContent, own.querySelector(".wv-count-group-n").textContent], ["This item", "1"], "P's own relation, under its heading");
        const went = [];
        wv._navigateToItem = (it) => { went.push(it.id); };
        try {
            b.querySelector(".wv-count-row").click();
            await wvT.waitFor(() => went.length || null, 3000);
        }
        finally { delete wv._navigateToItem; }
        assert.deepEqual(went, [R1.id], "the related item, as a Related row opens it");
        set("related", false);
        assert.isOk(await wvT.waitFor(() => !block("related-box") || null, 5000));
    });

    // MJT 2026-10-30, "For Related items, the current format does not allow
    // me to know to which item the annotation or the attachment or the item
    // note belong to. Please make an hover popup to show that, similar to the
    // links" -> "Both ends, like Links", "Everywhere Related rows show": the
    // item the relation is on and the related item, each with its lineage,
    // a head at both ends of the arrow -- a relation goes both ways.
    it("a Related row's hover card shows both ends with their lineage, both ways: Zotero's rows, the widened ones, the popups'", async function () {
        // An inactive window gets no focus events (links.spec.js's card test).
        for (let i = 0; i < 30 && Services.focus.activeWindow !== win; i++) { win.focus(); await new Promise((r) => win.setTimeout(r, 100)); }
        const P3 = await wvT.createItem("book", { title: "WVSC far paper" });
        const A3 = await wvT.createTestPDFItem("wvsc-far", { parentItemID: P3.id });
        const Y = await ann(A3, "far words", "5");
        const card = () => { const c = doc.getElementById("wv-bl-card"); return c && !c.hidden ? c : null; };
        const side = (c, s) => [...c.querySelectorAll('[data-side="' + s + '"] .wv-bl-card-node-main')].map((e) => e.textContent);
        const heads = (c) => c.querySelectorAll("svg.wv-bl-card-arrow > path").length;
        const shared = (c) => [...c.querySelectorAll(".wv-bl-card-shared .wv-bl-card-node-main")].map((e) => e.textContent);
        try {
            await relate(P, Y);
            set("related", true);
            await select(P);
            // Zotero's own row for Y, under P.
            const zbox = await wvT.waitFor(() => { const s = sec("related-box"); return (s && [...s.querySelectorAll(".body .row .box")].find((b) => b.getAttribute("aria-label") === Y.getDisplayTitle())) || null; }, 5000);
            assert.isOk(zbox, "Zotero's row for the annotation");
            wv._processRelatedBoxes(doc);
            zbox.focus();
            let c = await wvT.waitFor(card, 3000);
            assert.isOk(c, "Zotero's row: focus opens the card");
            assert.deepEqual(side(c, "source"), ["WVSC paper"], "the item the relation is on");
            assert.deepEqual(side(c, "target"), ["WVSC far paper", A3.getDisplayTitle(), "Page 5"], "the related annotation under its file and its paper");
            assert.strictEqual(heads(c), 3, "the line and a head at each end");
            assert.deepEqual(shared(c), [], "two papers: nothing shared above");
            // Zotero's Related icon on the arrow, in the gap between the two
            // columns (MJT 2026-11-02, "Can you put a related icon on the
            // double arrow?"). FAILED on dev.136.
            const icon = c.querySelector("svg.wv-bl-card-arrow .wv-bl-card-rel-icon");
            assert.isOk(icon, "the Related icon on the arrow");
            assert.match(icon.querySelector(".wv-bl-card-rel-glyph").getAttribute("d"), /^M12\.5 13H8\.5/, "Zotero's glyph (itempane/16/related.svg)");
            // In the Related section's colour, as the Related column's header
            // (Zotero's $item-pane-sections "related": --accent-wood; MJT
            // 2026-11-02, "Use the correct color for the related icon" -- the
            // arrow's grey until dev.138). FAILED on dev.138.
            const wood = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
            wood.style.color = "var(--accent-wood)";
            c.appendChild(wood);
            assert.strictEqual(win.getComputedStyle(icon.querySelector(".wv-bl-card-rel-glyph")).fill, win.getComputedStyle(wood).color, "--accent-wood");
            wood.remove();
            const C = c.getBoundingClientRect(), rS = c.querySelector('[data-side="source"]').getBoundingClientRect(), rT = c.querySelector('[data-side="target"]').getBoundingClientRect();
            const ab = c.querySelector("svg.wv-bl-card-arrow > path").getBBox(), ib = icon.getBBox();
            const ix = ib.x + ib.width / 2, iy = ib.y + ib.height / 2;
            assert.isAbove(ix, rS.right - C.left, "past the item's column");
            assert.isBelow(ix, rT.left - C.left, "...short of the related one's");
            assert.isAtLeast(iy, ab.y - 0.5, "on the arrow's height");
            assert.isAtMost(iy, ab.y + ab.height + 0.5);
            zbox.blur();
            // Both ends in one PDF: the paper and the file once, above the
            // ITEM / RELATED headers (MJT 2026-11-02, "Can you find a format
            // where the parent item is not repeated?" -> "Every shared
            // parent"). FAILED on dev.136. An end that IS the paper goes up
            // there too, the arrow climbing to its title through the gap and
            // reaching the annotation from its left ("Arrow to the top title,
            // but arrow stays on the left side of the target"; dev.137 kept
            // the paper in both columns). FAILED on dev.137.
            const Y2 = await ann(A, "near words", "9");
            const hr = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            hr.style.cssText = "position:fixed;left:10px;top:10px;width:300px;height:20px;";
            doc.documentElement.appendChild(hr);
            try {
                wv._wvRelCardShow(hr, X, Y2, "");
                c = card();
                assert.deepEqual(shared(c), ["WVSC paper", A.getDisplayTitle()], "the paper and the file, once");
                assert.deepEqual(side(c, "source"), ["Page 2"]);
                assert.deepEqual(side(c, "target"), ["Page 9"]);
                const sh = c.querySelector(".wv-bl-card-shared").getBoundingClientRect();
                for (const lab of c.querySelectorAll(".wv-bl-card-side")) assert.isAtMost(sh.bottom, lab.getBoundingClientRect().top + 0.5, "above the headers");
                assert.strictEqual(heads(c), 3, "the arrow, both ways");
                // An annotation's line is the reader's annotation header: the
                // page on the left, who wrote it at the right end -- the icon
                // already says "annotation" and its kind (MJT 2026-11-02, "Use a
                // format similar the header line in the annotations pane of the
                // reader, showing who has written the annotation, and the page
                // on the left"; reader preview.js; "Annotation p. 9 ·
                // highlight" until dev.139). An imported author name is dimmed,
                // as the reader's `non-authoritative`. FAILED on dev.139.
                Y2.annotationAuthorName = "Ada Lovelace";
                await Y2.saveTx({ skipSelect: true });
                wv._wvRelCardShow(hr, X, Y2, "");
                c = card();
                const yNode = [...c.querySelectorAll('[data-side="target"] .wv-bl-card-node')].pop();
                const pg = yNode.querySelector(".wv-bl-card-node-page"), au = yNode.querySelector(".wv-bl-card-node-author");
                assert.strictEqual(pg && pg.textContent, "Page 9", "the page, left");
                assert.strictEqual(au && au.textContent, "Ada Lovelace", "who wrote it");
                assert.isAbove(au.getBoundingClientRect().left, pg.getBoundingClientRect().right, "after the page");
                assert.closeTo(au.getBoundingClientRect().right, yNode.getBoundingClientRect().right, 1.5, "at the line's right end, as in the reader");
                assert.strictEqual(win.getComputedStyle(au).opacity, "0.4", "an imported name, dimmed");
                assert.notInclude(yNode.querySelector(".wv-bl-card-node-main").textContent, "highlight", "the kind is the icon's");
                wv._wvRelCardShow(hr, P, X, "");
                c = card();
                assert.deepEqual(shared(c), ["WVSC paper"], "an end that is the paper: above, once");
                assert.deepEqual(side(c, "source"), [], "...its column empty");
                assert.deepEqual(side(c, "target"), [A.getDisplayTitle(), "Page 2"]);
                assert.strictEqual(heads(c), 3, "the arrow, both ways");
                const C2 = c.getBoundingClientRect();
                const path = c.querySelector("svg.wv-bl-card-arrow > path");
                const pts = path.getAttribute("d").match(/-?[\d.]+,-?[\d.]+/g).map((p) => p.split(",").map(Number));
                const ys = [pts[0][1], pts[pts.length - 1][1]].sort((u, v) => u - v);
                const title = c.querySelector(".wv-bl-card-shared .wv-bl-card-node-main").getBoundingClientRect();
                const leafIcon = [...c.querySelectorAll('[data-side="target"] .wv-bl-card-node')].pop().querySelector(".wv-bl-kind").getBoundingClientRect();
                assert.closeTo(ys[0], title.top - C2.top + title.height / 2, 2, "one end at the paper's title");
                assert.closeTo(ys[1], leafIcon.top - C2.top + leafIcon.height / 2, 2, "the other at the annotation");
                const bb = path.getBBox();
                assert.isAtMost(bb.x + bb.width, leafIcon.left - C2.left + 0.5, "the arrow stays left of the annotation");
                const ib2 = c.querySelector(".wv-bl-card-rel-icon").getBBox();
                const cS = c.querySelector('[data-side="source"]').getBoundingClientRect(), cT = c.querySelector('[data-side="target"]').getBoundingClientRect();
                assert.isAbove(ib2.x + ib2.width / 2, cS.right - C2.left, "the Related icon in the gap");
                assert.isBelow(ib2.x + ib2.width / 2, cT.left - C2.left);
                c.hidden = true;
            }
            finally { hr.remove(); await wvT.erase(Y2); }
            assert.isNull(card(), "gone with the focus");
            // The widened block: R1 under X's heading.
            const b = await wvT.waitFor(() => block("related-box"), 5000);
            const brow = [...b.querySelectorAll(".wv-count-row")].find((r) => r.textContent.includes(R1.getDisplayTitle()));
            brow.focus();
            c = await wvT.waitFor(card, 3000);
            assert.isOk(c, "a widened row: focus opens the card");
            assert.deepEqual(side(c, "source"), ["WVSC paper", A.getDisplayTitle(), "Page 2"], "the part under whose heading the row sits");
            assert.deepEqual(side(c, "target"), ["WVSC related one"]);
            assert.strictEqual(brow.title, "", "no tooltip over the card: its foot says what a click does");
            brow.blur();
            // The Related count popup.
            wv._wvOpenCountPopup("related", P.id, { anchorNode: doc.documentElement, scope: "subtree", win });
            const panel = doc.getElementById("weavero-panel");
            try {
                const prow = [...panel.querySelectorAll(".wv-count-row")].find((r) => r.textContent.includes(Y.getDisplayTitle()));
                assert.isOk(prow, "the popup lists Y");
                prow.focus();
                c = await wvT.waitFor(card, 3000);
                assert.isOk(c, "a popup row: focus opens the card");
                assert.deepEqual(side(c, "target"), ["WVSC far paper", A3.getDisplayTitle(), "Page 5"]);
                prow.blur();
                // The popup's Related rows at the item pane Related section's
                // row geometry: a one-line row as tall as Zotero's own, no gap
                // between rows (MJT 2026-11-02, "The vertical spacing between
                // related items when clicking on the count column number should
                // be the same as in the item pane Related section"; 26.8-px rows
                // 1 px apart against Zotero's 21.3 until dev.140). FAILED on
                // dev.140.
                const nat = zbox.closest(".row").getBoundingClientRect().height;
                const two = [...panel.querySelectorAll(".wv-count-group")].map((g) => [...g.querySelectorAll(".wv-count-row")]).find((rs) => rs.length >= 2);
                assert.isOk(two, "two rows under one heading");
                const [r1, r2] = two.map((r) => r.getBoundingClientRect());
                assert.closeTo(r1.height, nat, 0.5, "a row as tall as Zotero's Related row (" + nat + ")");
                assert.closeTo(r2.top - r1.top, nat, 0.5, "...the next one right under it");
                // The relations popup of an annotation's Related button -- in
                // the reader, in the item pane -- shows the card too (MJT
                // 2026-11-02, "The preview on hover is missing here"; a plain
                // "Open in library" tooltip until dev.148). FAILED on dev.148.
                panel.style.display = "none";
                wv.openRelationsPopup(X, { anchorNode: doc.documentElement, win });
                const rrow = [...doc.getElementById("weavero-panel").querySelectorAll(".wv-rel-row")].find((r) => r.textContent.includes(R1.getDisplayTitle()));
                assert.isOk(rrow, "the relations popup lists R1");
                assert.strictEqual(rrow.title, "", "no tooltip over the card");
                rrow.focus();
                c = await wvT.waitFor(card, 3000);
                assert.isOk(c, "its row: focus opens the card");
                assert.deepEqual(side(c, "source"), ["WVSC paper", A.getDisplayTitle(), "Page 2"], "X under its file and paper");
                assert.deepEqual(side(c, "target"), ["WVSC related one"]);
                rrow.blur();
                // A row in a frame -- the reader's iframe draws that popup in a
                // reader tab -- opens its card in the chrome window around it,
                // at the row: the frame's HTML document has neither Zotero's
                // interface font nor its icon styles (MJT 2026-11-02, "The font
                // is not consistent with the item pane": a serif card, the
                // items' icons missing). FAILED on dev.151.
                const fr = doc.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
                fr.style.cssText = "position:fixed;left:120px;top:90px;width:400px;height:200px;border:0;";
                doc.documentElement.appendChild(fr);
                try {
                    await wvT.waitFor(() => (fr.contentDocument && fr.contentDocument.body) || null, 3000);
                    const fdoc = fr.contentDocument;
                    const frow = fdoc.createElement("div");
                    frow.textContent = "a row in a frame";
                    frow.style.cssText = "position:absolute;left:10px;top:20px;width:100px;height:20px;";
                    fdoc.body.appendChild(frow);
                    wv._wvBlCardHover(frow, "test-frame", () => {});
                    wv._wvRelCardShow(frow, X, R1, "");
                    const fc = doc.getElementById("wv-bl-card");
                    assert.isOk(fc && !fc.hidden, "the card in the chrome window");
                    assert.isNull(fdoc.getElementById("wv-bl-card"), "...not in the frame");
                    const cr = fc.getBoundingClientRect(), rr = frow.getBoundingClientRect(), fe = fr.getBoundingClientRect();
                    assert.closeTo(cr.top, fe.top + rr.bottom + 4, 2, "under the row, in the window's coordinates");
                    assert.closeTo(cr.left, fe.left + rr.left, 2, "...at its left");
                    assert.strictEqual(win.getComputedStyle(fc).fontFamily, win.getComputedStyle(doc.documentElement).fontFamily, "the window's font");
                    frow.dispatchEvent(new fdoc.defaultView.MouseEvent("mouseleave"));
                    assert.isTrue(fc.hidden, "leaving the row hides it");
                }
                finally { fr.remove(); }
            }
            finally { doc.getElementById("weavero-panel").style.display = "none"; }
        }
        finally {
            set("related", false);
            await wvT.erase(P3);
        }
    });

    it("Links narrow lists the paper's own notes' links and names the rest in the header; widened adds its annotations'", async function () {
        set("links", false);
        await select(P);
        await wvT.waitFor(() => custom("links") && lkRows().length || null, 15000);
        assert.deepEqual(lkRows().map((r) => r._wvLkRow.src.id), [N.id], "narrow: the note's link only");
        const s = custom("links").querySelector("collapsible-section");
        assert.match(await titleIs(s, /^2 Item Links$/), /^2 Item Links$/, "the title counts the whole item's (MJT 2026-10-30)");
        // Its notes' and its annotations' counted apart, both scopes: the
        // filter toggles (dev.111).
        assert.deepEqual(counts(s), [["note", "1"], ["ann", "1"]], "the note's and the annotation's, by their icons");
        assert.match(s.querySelector('.head .wv-scope-count[data-kind="ann"]').title, /^In its annotations: 1\n/);
        set("links", true);
        assert.isOk(await wvT.waitFor(() => lkRows().length === 2 || null, 5000), "widened");
        assert.deepEqual(lkRows().map((r) => r._wvLkRow.src.id), [N.id, X.id], "the note's, then the annotation's");
        assert.match(await titleIs(s, /^2 Item Links$/), /^2 Item Links$/);
        assert.deepEqual(counts(s), [["note", "1"], ["ann", "1"]], "widened: the same toggles");
    });

    it("Backlinks narrow lists the item's own, with no fold; widened adds those aimed at its parts, part by part", async function () {
        set("backlinks", false);
        await select(P);
        await wvT.waitFor(() => custom("backlinks") && blRows().length || null, 15000);
        assert.deepEqual(blRows().map((r) => r._wvBlTarget.id), [P.id], "narrow: aimed at the paper itself");
        assert.isNull(custom("backlinks").querySelector(".wv-bl-more"), "no collapsed row any more: the button replaces it");
        const s = custom("backlinks").querySelector("collapsible-section");
        assert.match(await titleIs(s, /^2 Backlinks$/), /^2 Backlinks$/, "the title counts the whole item's (MJT 2026-10-30)");
        assert.deepEqual(counts(s), [["own", "1"], ["ann", "1"]], "its own; the one aimed at its annotation, by its icon");
        assert.match(s.querySelector('.head .wv-scope-count[data-kind="ann"]').title, /^To its annotations: 1\n/);
        set("backlinks", true);
        assert.isOk(await wvT.waitFor(() => blRows().length === 2 || null, 5000), "widened");
        assert.deepEqual(blRows().map((r) => r._wvBlTarget.id), [P.id, X.id], "this item first, then the annotation");
        assert.match(title(s), /^2 Backlinks$/, "the header as before");
        assert.deepEqual(counts(s), [["own", "1"], ["ann", "1"]]);
        set("backlinks", false);
        assert.isOk(await wvT.waitFor(() => blRows().length === 1 || null, 5000), "narrow again");
    });

    // The counts beside a header's title filter the section as the items
    // list's funnel does (MJT 2026-10-30: the item's own a count too, by its
    // type icon -- "I want to be able to choose whether the parent shows or
    // not while looking at the others" -- and "just the same filtering as in
    // the items list"): click = only these (several: either), Alt+click =
    // hide these, the same again = clear, one direction at a time; kept
    // while the window moves between items. FAILED on dev.112 (no count for
    // the item's own; a click a passing look, Alt+click a listing).
    it("the header counts filter as the items list's funnel: the item's own a count too; click only, Alt+click hide; kept across items", async function () {
        const cnt = (s, k) => s.querySelector('.head .wv-scope-count[data-kind="' + k + '"]');
        const press = (el, alt) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, altKey: !!alt }));
        const state = (el) => el.dataset.selected === "true" ? "only" : el.dataset.excluded === "true" ? "hide" : "";
        set("tags", false); set("related", false); set("links", false); set("backlinks", false);
        await select(P);
        // Tags, the item's own only: its count, by its type icon, selected.
        const ts = sec("tags-box");
        const own = await wvT.waitFor(() => cnt(ts, "own"), 5000);
        assert.isOk(own, "the item's own count");
        assert.strictEqual(own.getAttribute("role"), "button");
        assert.strictEqual(state(own), "only");
        assert.match(cnt(ts, "ann").title, /Click: show only these · Alt\+click: hide these/, "the tooltip says what a press does");
        assert.isNull(block("tags-box"), "no block: its own only");
        // A click on its annotations': its own or its annotations', together.
        press(cnt(ts, "ann"));
        const b = await wvT.waitFor(() => block("tags-box"), 5000);
        assert.deepEqual(heads(b), [wv._wvCountSourceLabel(X, P)], "the annotation's, under the item's own");
        assert.isFalse(ts.hasAttribute("data-wv-scope-hide-own"), "the item's own still shown");
        assert.deepEqual([state(cnt(ts, "own")), state(cnt(ts, "ann"))], ["only", "only"]);
        assert.isTrue(ts.open, "a click on a count does not fold the section");
        // A click on its own again: its annotations' alone.
        press(cnt(ts, "own"));
        assert.isOk(await wvT.waitFor(() => ts.hasAttribute("data-wv-scope-hide-own") || null, 5000), "the item's own set aside");
        assert.strictEqual(win.getComputedStyle(ts.querySelector(":scope > .body")).display, "none");
        assert.deepEqual(heads(block("tags-box")), [wv._wvCountSourceLabel(X, P)]);
        // Alt+click the annotations': everything but them, the "only" cleared.
        press(cnt(ts, "ann"), true);
        assert.isOk(await wvT.waitFor(() => { const x = block("tags-box"); return x && heads(x).length === 2 || null; }, 5000));
        assert.deepEqual(heads(block("tags-box")), [A.getDisplayTitle(), N.getNoteTitle()], "the file's and the note's");
        assert.isFalse(ts.hasAttribute("data-wv-scope-hide-own"), "the item's own back");
        assert.deepEqual([state(cnt(ts, "own")), state(cnt(ts, "ann"))], ["", "hide"]);
        // Again: no filter, everything.
        press(cnt(ts, "ann"), true);
        assert.isOk(await wvT.waitFor(() => { const x = block("tags-box"); return x && heads(x).length === 3 || null; }, 5000), "all three parts");
        // Kept while the window moves between items, as the items list's.
        press(cnt(ts, "note"));
        assert.isOk(await wvT.waitFor(() => { const x = block("tags-box"); return x && heads(x).length === 1 || null; }, 5000));
        await select(R2);
        await select(P);
        assert.isOk(await wvT.waitFor(() => cnt(sec("tags-box"), "note") && state(cnt(sec("tags-box"), "note")) === "only" || null, 5000), "still set on coming back");
        assert.deepEqual(heads(block("tags-box")), [N.getNoteTitle()]);
        // Related: its own and its annotation's, then its annotation's alone.
        const rs = sec("related-box");
        press(await wvT.waitFor(() => cnt(rs, "ann"), 5000));
        assert.deepEqual(rowsOf(await wvT.waitFor(() => block("related-box"), 5000)), [[R1.getDisplayTitle()]], "the annotation's related item");
        assert.isFalse(rs.hasAttribute("data-wv-scope-hide-own"), "P's own relation with it");
        press(cnt(rs, "own"));
        assert.isOk(await wvT.waitFor(() => rs.hasAttribute("data-wv-scope-hide-own") || null, 5000), "then without it");
        // Links, its notes' only: Alt+click its notes' -- its annotation's.
        const ls = custom("links").querySelector("collapsible-section");
        press(await wvT.waitFor(() => cnt(ls, "note"), 15000), true);
        assert.isOk(await wvT.waitFor(() => lkRows().length === 1 && lkRows()[0]._wvLkRow.src.id === X.id || null, 5000), "the annotation's link, the note's hidden");
        assert.strictEqual(state(cnt(ls, "note")), "hide");
        assert.match(await titleIs(ls, /^2 Item Links$/), /^2 Item Links$/, "the title the whole item's");
        // Backlinks, its own only: and its annotation's; then its own hidden.
        const bs = custom("backlinks").querySelector("collapsible-section");
        press(await wvT.waitFor(() => cnt(bs, "ann"), 15000));
        assert.isOk(await wvT.waitFor(() => blRows().length === 2 || null, 5000), "its own and its annotation's");
        assert.deepEqual(blRows().map((r) => r._wvBlTarget.id), [P.id, X.id]);
        press(cnt(bs, "own"), true);
        assert.isOk(await wvT.waitFor(() => blRows().length === 1 && blRows()[0]._wvBlTarget.id === X.id || null, 5000), "its own hidden: the annotation's");
        assert.deepEqual([state(cnt(bs, "own")), state(cnt(bs, "ann"))], ["hide", ""], "one direction at a time: the 'only' cleared");
        assert.isTrue(bs.open, "not folded");
    });

    // The block takes the item pane's row geometry (src-ts.md "Item-pane
    // sections take Zotero's row geometry"): a heading where a native row
    // sits, its rows one 16 px step in, hung on the guide under its icon.
    it("the children's block sits at Zotero's row geometry, its rows on the guide line under each heading's icon", async function () {
        set("tags", true);
        await select(P);
        const b = await wvT.waitFor(() => block("tags-box"), 5000);
        const nat = await wvT.waitFor(() => { const x = det().querySelector("notes-box .body .row .box"); return x && x.querySelector(".icon") && x.querySelector(".label") ? x : null; }, 15000);
        const L = (el) => el.getBoundingClientRect().left;
        const from = (el) => L(el) - L(el.closest("collapsible-section").querySelector(".head .title"));
        const icon = from(nat.querySelector(".icon")), label = from(nat.querySelector(".label"));
        const head = b.querySelector(".wv-count-group-head");
        assert.closeTo(from(head.firstElementChild), icon, 0.5, "a heading's icon where a native row's is");
        assert.closeTo(from(head.querySelector(".wv-count-group-title")), label, 0.5, "its title too");
        const row = head.parentElement.querySelector(".wv-count-row");
        // Its tags drawn where Zotero's own then sit, one step in under the
        // "This item" heading: the 12-px icon at the row's start, as in
        // Zotero's Tags section (its icon at +16, the name at +32).
        const ownHead = sec("tags-box").querySelector(":scope > .wv-scope-own .wv-count-group-head");
        assert.closeTo(from(ownHead.firstElementChild), icon, 0.5, "\"This item\": its icon where a native row's is");
        assert.closeTo(from(ownHead.querySelector(".wv-count-group-title")), label, 0.5, "...and its title");
        const zt = sec("tags-box").querySelector("#rows .row");
        assert.closeTo(from(zt.querySelector(".zotero-box-icon")), icon + 16, 0.5, "Zotero's own tag rows one step in");
        assert.closeTo(from(row.firstElementChild), from(zt.querySelector(".zotero-box-icon")), 0.5, "a part's tag icon level with Zotero's");
        assert.closeTo(from(row.querySelector(".wv-rel-title")), from(zt.querySelector("editable-text")), 1, "...its name too");
        const r = head.firstElementChild.getBoundingClientRect();
        const g = win.getComputedStyle(row, "::before");
        assert.notStrictEqual(g.content, "none", "the guide");
        assert.closeTo(L(row) + parseFloat(g.left) + 0.5, r.left + r.width / 2, 1, "under the heading's icon");
        const zb = sec("tags-box").querySelector(":scope > .body");
        const zg = win.getComputedStyle(zb, "::before");
        assert.notStrictEqual(zg.content, "none", "Zotero's rows hang on the guide too");
        const ro = ownHead.firstElementChild.getBoundingClientRect();
        assert.closeTo(L(zb) + parseFloat(zg.left) + 0.5, ro.left + ro.width / 2, 1, "...under the \"This item\" icon");
        // A long part name never widens the pane: it is cut, its count
        // stays in view (MJT's dev pane, dev.100: the block took the Tags
        // section from 422 to 514 px in a 475-px pane; the dev.52 rule,
        // src-ts.md / backlinks.ts `contain: inline-size`).
        const LN = await note("WVSC " + "very long note title words ".repeat(12), "x", P.id);
        try {
            await tag(LN, "wvsc-long");
            set("tags", false);
            const narrow = sec("tags-box").getBoundingClientRect().width;
            set("tags", true);
            const lb = await wvT.waitFor(() => { const x = block("tags-box"); return x && x.textContent.includes("wvsc-long") ? x : null; }, 5000);
            assert.isOk(lb, "the long-titled note's tag listed");
            assert.closeTo(sec("tags-box").getBoundingClientRect().width, narrow, 1, "the section keeps its width");
            const lh = [...lb.querySelectorAll(".wv-count-group-head")].find((h) => h.textContent.includes("very long note title"));
            assert.isAtMost(lh.querySelector(".wv-count-group-n").getBoundingClientRect().right, sec("tags-box").getBoundingClientRect().right + 0.5, "its count in view");
        }
        finally { await wvT.erase(LN); }
        set("tags", false);
    });

    // MJT 2026-10-30 ("At small width, the broken links icon disappears"):
    // the Backlinks header's counts -- "81 Backlinks", four levels, three
    // end counts -- could not shrink, held Zotero's item details at 413 px in
    // a 320-px pane, and every section's right end, Zotero's own Attachments
    // header too, went under the side navigation. The counts never widen
    // the pane now; short of room, the links' and Zotero's references'
    // counts go first, then the internal links' -- never the broken links',
    // nor a count whose filter is on ("Drop counts, keep broken").
    it("a header's counts never widen the pane: short of room the kinds go, then the internal links, never the broken links", async function () {
        const XHTML = "http://www.w3.org/1999/xhtml";
        const wrap = doc.createElementNS(XHTML, "div");
        wrap.style.cssText = "position:fixed;left:0;top:0;width:600px;";
        const s = doc.createXULElement("collapsible-section");
        s.dataset.pane = "wv-test-fit";   // init() builds the head only with one (collapsibleSection.js)
        s.setAttribute("label", "81 Backlinks");
        s.appendChild(doc.createElementNS(XHTML, "div"));
        wrap.appendChild(s);
        doc.documentElement.appendChild(wrap);
        try {
            const tb = s.querySelector(":scope > .head .title-box");
            const f = { inc: [], exc: [], loop: 0, broken: 0, ref: 0 };
            const draw = () => wv._wvScopeSetCounts(s.querySelector(":scope > .head .title"), { own: 19, att: 27, note: 14, ann: 21 }, "To",
                { n: 12, of: 81, what: "backlinks" }, { kind: "backlinks", sec: s, f, item: P }, { refs: { link: 73, zotero: 8 }, broken: 1 });
            const shown = () => [...tb.querySelectorAll(":scope > .wv-scope-counts-end .wv-scope-count")].filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.dataset.kind);
            const at = (w) => { wrap.style.width = w + "px"; wv._wvScopeFit(tb); return shown(); };
            draw();
            assert.deepEqual(at(600), ["link", "zotero", "internal", "broken"], "room for all");
            assert.isAtMost(tb.scrollWidth, tb.clientWidth + 0.5, "...on one line");
            const narrow = at(370);
            assert.notInclude(narrow, "link", "the links' count goes first");
            assert.notInclude(narrow, "zotero", "...with Zotero's references'");
            // ...and their grey card with them (2026-11-02): no empty card.
            const kindsCard = tb.querySelector(":scope > .wv-scope-counts-end > .wv-scope-or-group");
            assert.isOk(kindsCard, "the two kinds on their card");
            assert.strictEqual(kindsCard.getBoundingClientRect().width, 0, "the card goes with them");
            assert.include(narrow, "broken");
            assert.deepEqual(at(300), ["broken"], "then the internal links'; the broken links' stays");
            assert.isAtMost(tb.scrollWidth, tb.clientWidth + 0.5, "nothing cut");
            assert.deepEqual(at(600), ["link", "zotero", "internal", "broken"], "all back when the pane widens");
            // A count whose filter is on stays, whatever the room.
            f.ref = 1;
            draw();
            assert.include(at(300), "link", "the links shown alone: their count stays");
            f.ref = 0;
            draw();
            // A pinned count stays too (2026-11-02): Settings pins the internal links.
            await wvT.withPref("weavero.paneScope.backlinks.pin.loop", true, () => {
                draw();
                assert.include(at(300), "internal", "pinned: the internal links' count stays");
            });
            draw();
            assert.deepEqual(at(300), ["broken"], "unpinned: goes again");
            // However many counts, the header never sets the pane's width.
            wrap.style.width = "min-content";
            assert.isBelow(s.getBoundingClientRect().width, 160, "the section's minimum width leaves the counts out");
            // The pane narrowed or widened by hand: a resize watch refits.
            wrap.style.width = "600px";
            assert.isOk(tb._wvScopeFitRO, "watched");
        }
        finally { wrap.remove(); }
    });

    // MJT 2026-11-03 ("Have you gated the new Links and Backlinks features
    // behind a toggle in the settings, so that users who don't like it can
    // disable it?" -> "Ok for the fixes you recommend"): what Weavero adds to
    // Zotero's own Tags and Related sections -- the counts beside the title,
    // the This item heading, the children's block -- has a switch of its
    // own; off, the two are as Zotero draws them, its own count in the
    // header, while Item Links and Backlinks keep their counts (their
    // sections' own switches). Until dev.172 only the Relations master
    // turned them off. FAILED on dev.172.
    it("the Tags and Related switch off: Zotero's two sections as Zotero draws them, Item Links and Backlinks keep their counts; on again, back", async function () {
        set("tags", true); set("related", true);
        await select(P);
        assert.isOk(await wvT.waitFor(() => block("tags-box") && block("related-box") || null, 5000), "both widened, their blocks drawn");
        const native = (t) => {
            const s = sec(t);
            return !s.querySelector(".head .wv-scope-counts") && !s.querySelector(":scope > ." + "wv-scope-block")
                && !s.querySelector(":scope > .wv-scope-own .wv-count-group-head") && !s.hasAttribute("data-wv-scope-hide-own");
        };
        try {
            await wvT.withPref("weavero.enableTagsRelatedScope", false, async () => {
                assert.isOk(await wvT.waitFor(() => native("tags-box") && native("related-box") || null, 5000), "off: no counts, no block, no This item heading");
                // The count Zotero's message is given (its text is in the
                // runner's locale: "1 marqueur" in French).
                const args = () => { try { return JSON.parse(sec("tags-box").getAttribute("data-l10n-args")); } catch (e) { return null; } };
                assert.isOk(await wvT.waitFor(() => (args() || {}).count === 1 || null, 5000), "Zotero's own count in the header, P's own tag: " + JSON.stringify(args()));
                assert.isOk(await wvT.waitFor(() => custom("links") && custom("links").querySelector(".head .wv-scope-counts") || null, 5000), "Item Links keeps its counts");
                assert.isOk(custom("backlinks").querySelector(".head .wv-scope-counts"), "Backlinks too");
            });
            assert.isOk(await wvT.waitFor(() => block("tags-box") && sec("tags-box").querySelector(".head .wv-scope-counts") || null, 5000), "on again: the counts and the block back");
        }
        finally { set("tags", false); set("related", false); }
    });

    it("leaves nothing behind on shutdown, and comes back", async function () {
        set("tags", true); set("related", true);
        await select(P);
        await wvT.waitFor(() => block("tags-box") && block("related-box"), 5000);
        // The shutdown sweep (index.ts _wvStripWindowChrome) unwraps an
        // all-wv element that holds native content -- the Related block's
        // annotation icons carry Zotero's class -- and dev.99 left every such
        // icon on the section at each reload, 514 px wide (MJT's dev pane,
        // 2026-10-29: 280 after one reload). Run on a copy of the section in
        // a scratch document: nothing of the block may remain.
        assert.isOk(block("related-box").querySelector("img.annotation-icon"), "the block holds an annotation's icon (Zotero's class)");
        const scratch = doc.implementation.createHTMLDocument("wv-scope-sweep");
        const copy = scratch.importNode(sec("related-box"), true);
        scratch.body.appendChild(copy);
        wv._wvStripWindowChrome({ document: scratch });
        assert.deepEqual([...copy.children].map((c) => c.tagName.toLowerCase()).filter((t) => t === "img"), [], "no icon left on the section");
        assert.isNull(copy.querySelector(".wv-scope-block, .wv-scope-own, .wv-scope-counts, .wv-count-group, img.annotation-icon:not(.body img)"), "the block, the heading and the counts gone whole");
        wv._wvScopeDestroy();
        try {
            for (const t of ["tags-box", "related-box"]) {
                assert.strictEqual(sec(t).getAttribute("extra-buttons"), "add", t + ": Zotero's own buttons");
                assert.isNull(btn(sec(t)), t + ": no button");
                assert.isNull(block(t), t + ": no block");
                assert.isNull(sec(t).querySelector(":scope > .wv-scope-own"), t + ": no heading");
                assert.isFalse(sec(t).hasAttribute("data-wv-scope-wide"), t + ": Zotero's rows back in place");
                assert.deepEqual(counts(sec(t)), [], t + ": no counts");
                const tbox = sec(t).querySelector(":scope > .head .title-box");
                assert.isFalse(tbox.hasAttribute("data-wv-counts"), t + ": Zotero's title box as it was");
                assert.isNotOk(tbox._wvScopeFitRO, t + ": no resize watch left");
            }
            assert.strictEqual(sec("tags-box").getAttribute("data-l10n-id"), "section-tags");
            assert.strictEqual(sec("related-box").getAttribute("data-l10n-id"), "section-related");
        }
        finally { wv._wvScopeInit(); }
        assert.isOk(await wvT.waitFor(() => block("tags-box") && sec("tags-box").querySelector(".head .wv-scope-counts"), 5000), "back after init");
        set("tags", false); set("related", false);
    });
});
