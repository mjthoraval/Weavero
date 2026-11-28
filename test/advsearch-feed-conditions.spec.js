/* global describe, it, before, after, assert, Zotero, wvT, Services, IOUtils, PathUtils */
// The Advanced Search in a feed view offers only the conditions a feed item can match
// (MJT 2026-11-22: "keep it with only the conditions a feed item can match";
// src/modules/advsearch-feed.ts).
//
// The fixture is what Zotero itself makes of real feeds: three feed files (RSS 1.0 with
// PRISM and Dublin Core, RSS 2.0 with an enclosure, Atom with an enclosure link), read by
// Zotero's own Feed.updateFeed() -> FeedReader -> FeedItem.fromJSON, the PDF enclosures
// linked by Zotero.Attachments.linkFromURL (feed.js _updateFeed). Every field FeedReader
// reads (feedReader.js _getFeedItem) is in them; they come out as journal articles and a
// book section (its ISBN), the PDFs as linked-URL attachments. (FeedReader's third guess,
// conferencePaper, needs a `pubType` that this RSS 1.0 one does not hand over: the a3 item
// stays a journal article on 11.0-beta.5 and 10.0.8 -- its fields are the same ones.)
//
// The menus are read from the entries' `hidden` attribute, the hidden submenus included:
// a closed popup's entries have no computed style to read.
describe("Weavero — the Advanced Search in a feed view offers the conditions a feed item can match", function () {
    this.timeout(180000);
    let wv, win, ZP, KEPT;
    const feeds = [];
    let dir = "";

    const RSS1 = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns:content="http://purl.org/rss/1.0/modules/content/">
 <channel rdf:about="https://wv-advfeed.invalid/a">
  <title>WV-TEST advfeed A</title>
  <link>https://wv-advfeed.invalid/a</link>
  <description>Wvchannel description</description>
  <dc:publisher>Wvchannelpublisher</dc:publisher>
  <dc:language>en</dc:language>
  <dc:rights>Wvchannelrights</dc:rights>
  <dc:creator>Wvchannel Author</dc:creator>
  <items><rdf:Seq>
   <rdf:li rdf:resource="https://wv-advfeed.invalid/a1"/>
   <rdf:li rdf:resource="https://wv-advfeed.invalid/a2"/>
   <rdf:li rdf:resource="https://wv-advfeed.invalid/a3"/>
  </rdf:Seq></items>
 </channel>
 <item rdf:about="https://wv-advfeed.invalid/a1">
  <title>Wvjournal alpha article</title>
  <link>https://wv-advfeed.invalid/a1</link>
  <description>Wvsummary alpha</description>
  <content:encoded><![CDATA[<p>Wvabstract alpha</p>]]></content:encoded>
  <dc:creator>Ada Wvlovelace</dc:creator>
  <dc:creator>Charles Wvbabbage</dc:creator>
  <dc:contributor>Grace Wvhopper</dc:contributor>
  <dc:date>2024-05-22</dc:date>
  <dc:identifier>doi: 10.5555/wv.a1</dc:identifier>
  <dc:publisher>Wvitempublisher</dc:publisher>
  <dc:language>fr</dc:language>
  <dc:rights>Wvitemrights</dc:rights>
  <prism:publicationName>Wvjournal of Tests</prism:publicationName>
  <prism:volume>9</prism:volume>
  <prism:number>6</prism:number>
  <prism:section>Wvsection</prism:section>
  <prism:startingPage>120</prism:startingPage>
  <prism:endingPage>130</prism:endingPage>
  <prism:issn>1234-5679</prism:issn>
  <prism:isbn>9783161484100</prism:isbn>
 </item>
 <item rdf:about="https://wv-advfeed.invalid/a2">
  <title>Wvchapter beta section</title>
  <link>https://wv-advfeed.invalid/a2</link>
  <description>Wvsummary beta</description>
  <dc:creator>Alan Wvturing</dc:creator>
  <dc:date>2023-01-02</dc:date>
  <dc:identifier>10.5555/wv.a2</dc:identifier>
  <dc:publisher>Wvbookpublisher</dc:publisher>
  <prism:publicationName>Wvbook of Chapters</prism:publicationName>
  <prism:isbn>9780306406157</prism:isbn>
  <prism:pageRange>11-20</prism:pageRange>
  <prism:volume>2</prism:volume>
  <prism:section>Wvbooksection</prism:section>
 </item>
 <item rdf:about="https://wv-advfeed.invalid/a3">
  <title>Wvconference gamma paper</title>
  <link>https://wv-advfeed.invalid/a3</link>
  <description>Wvsummary gamma</description>
  <pubType>Conference Proceedings</pubType>
  <dc:creator>Edsger Wvdijkstra</dc:creator>
  <dc:date>2022-03-04</dc:date>
  <dc:identifier>doi:10.5555/wv.a3</dc:identifier>
  <prism:publicationName>Wvproceedings of Tests</prism:publicationName>
  <prism:startingPage>5</prism:startingPage>
 </item>
</rdf:RDF>`;

    const RSS2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
 <channel>
  <title>WV-TEST advfeed B</title>
  <link>https://wv-advfeed.invalid/b</link>
  <description>Wvchannel b</description>
  <language>de</language>
  <copyright>Wvbrights</copyright>
  <item>
   <title>Wvenclosure delta post</title>
   <link>https://wv-advfeed.invalid/b1</link>
   <description>Wvsummary delta</description>
   <author>wvauthor@example.com (Wvauthor Delta)</author>
   <category>Wvcategory</category>
   <pubDate>Tue, 03 Jun 2025 09:39:21 GMT</pubDate>
   <guid>https://wv-advfeed.invalid/b1</guid>
   <comments>https://wv-advfeed.invalid/b1#c</comments>
   <enclosure url="https://wv-advfeed.invalid/b1.pdf" length="1000" type="application/pdf"/>
  </item>
  <item>
   <title>Wvplain epsilon post</title>
   <link>https://wv-advfeed.invalid/b2</link>
   <description>Wvsummary epsilon</description>
   <dc:creator>Wvcreator Epsilon</dc:creator>
   <pubDate>Wed, 04 Jun 2025 10:00:00 GMT</pubDate>
   <guid>https://wv-advfeed.invalid/b2</guid>
  </item>
 </channel>
</rss>`;

    const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
 <title>WV-TEST advfeed C</title>
 <id>urn:wv:advfeed:c</id>
 <updated>2025-01-01T00:00:00Z</updated>
 <rights>Wvcrights</rights>
 <entry>
  <title>Wvatom zeta entry</title>
  <id>urn:wv:advfeed:c1</id>
  <link href="https://wv-advfeed.invalid/c1"/>
  <link rel="enclosure" type="application/pdf" href="https://wv-advfeed.invalid/c1.pdf"/>
  <updated>2025-02-02T00:00:00Z</updated>
  <published>2025-02-01T00:00:00Z</published>
  <author><name>Wvatom Author</name></author>
  <contributor><name>Wvatom Contributor</name></contributor>
  <category term="Wvatomcat"/>
  <summary>Wvsummary zeta</summary>
  <content type="html">&lt;p&gt;Wvcontent zeta&lt;/p&gt;</content>
 </entry>
</feed>`;

    async function makeFeed(name, file, text) {
        const path = PathUtils.join(dir, file);
        await IOUtils.writeUTF8(path, text);
        const f = /** @type {any} */ (new Zotero.Feed());
        f.name = name;
        f.url = "https://wv-advfeed.invalid/" + Zotero.Utilities.randomString() + "/" + file;
        f.refreshInterval = 24 * 60; f.cleanupReadAfter = 60; f.cleanupUnreadAfter = 90;
        await f.saveTx();
        feeds.push(f);
        // The url setter takes http(s) only (feed.js _set): the file is read as Zotero's own
        // feed tests read theirs (feedTest.js, `feed._feedUrl = ...`), unsaved.
        f._feedUrl = PathUtils.toFileURI(path);
        await f.updateFeed();
        return f;
    }
    /** Every item of the fixture feeds, the linked PDFs included. */
    async function feedItems() {
        const out = [];
        for (const f of feeds) for (const it of /** @type {any[]} */ (await Zotero.Items.getAll(f.libraryID, false, true))) out.push(it);
        return out;
    }
    const byTitle = async (t) => (await feedItems()).find((it) => it.getField("title") === t);

    const view = () => ZP.libraryView || ZP;
    const el = (id) => { const lv = ZP.libraryView; return (lv && typeof lv.getElement === "function" && lv.getElement(id)) || win.document.getElementById(id); };
    const deck = () => /** @type {any} */ (el("zotero-advanced-search-pane-deck"));
    /** @returns {any[]} */
    const rowsIn = (w) => Array.from(w.pane.querySelectorAll("zoterosearchcondition"));
    const menuOf = (row) => row.querySelector("#conditionsmenu");
    const isHidden = (e) => e.hasAttribute("hidden") && e.getAttribute("hidden") !== "false";
    /** The fields a row's menu offers: its entries not hidden, under no hidden submenu. */
    const offered = (row) => {
        const m = menuOf(row);
        return Array.from(m.querySelectorAll("menuitem[value]")).filter((it) => {
            for (let e = /** @type {any} */ (it); e && e !== m; e = e.parentElement) if (isHidden(e)) return false;
            return true;
        }).map((it) => it.getAttribute("value")).sort();
    };
    /** Every field the menu holds, as Zotero built it. */
    const allOf = (row) => Array.from(menuOf(row).querySelectorAll("menuitem[value]")).map((it) => it.getAttribute("value")).sort();
    const listed = (it) => ZP.itemsView.getRowIndexByID(it.id) !== false;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const diff = (got, want) => JSON.stringify({ extra: got.filter((x) => !want.includes(x)), missing: want.filter((x) => !got.includes(x)) });

    async function select(id) {
        const cv = ZP.collectionsView;
        for (let i = 0; i < 60; i++) {
            try { await cv.selectByID(id); } catch (er) {}
            if (cv.selectedTreeRow && cv.selectedTreeRow.id === id) break;
            await wvT.sleep(250);
        }
        assert.strictEqual(cv.selectedTreeRow && cv.selectedTreeRow.id, id, "fixture: the row " + id + " selected");
        await ZP.itemsView.waitForLoad();
        await wvT.sleep(200);
    }
    const FEEDS = "F1";
    const feedRow = (i) => "L" + feeds[i].libraryID;
    const MYLIB = () => "L" + Zotero.Libraries.userLibraryID;
    async function openPane() {
        if (deck().state !== "open") await view().setAdvancedSearchState("open");
        assert.ok(await wvT.waitFor(() => (deck().state === "open" && rowsIn(deck()).length) || null, 10000, 50), "fixture: the Advanced Search open");
    }
    async function closePane() {
        try { if (deck().state !== "closed") await view().setAdvancedSearchState("closed"); } catch (er) {}
        await wvT.waitFor(() => (deck().state === "closed") || null, 5000, 50);
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvAdvFeedWire", "_wvAdvFeedKeepFor", "_wvAdvFeedApply", "_wvAdvFeedTeardown", "_wvAdvFeedKept"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); ZP = win.ZoteroPane;
        win.Zotero_Tabs.select(win.Zotero_Tabs._tabs.find((t) => String(t.type).startsWith("library")).id);
        if (!deck()) this.skip();   // version: Zotero 9 has no Advanced Search in the items pane
        KEPT = wv._wvAdvFeedKept();
        dir = PathUtils.join(PathUtils.tempDir, "wv-advfeed-" + Zotero.Utilities.randomString(6));
        await IOUtils.makeDirectory(dir);
        await makeFeed("WV-TEST advfeed A", "a.rdf", RSS1);
        await makeFeed("WV-TEST advfeed B", "b.rss", RSS2);
        await makeFeed("WV-TEST advfeed C", "c.atom", ATOM);
        assert.isAtLeast((await feedItems()).length, 8, "fixture: six feed items and two linked PDFs");
    });
    after(async function () {
        await closePane();
        try { await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID); } catch (er) {}
        for (const w of Zotero.getMainWindows()) { try { wv._wvAdvFeedWire(w); } catch (er) {} }
        for (const f of feeds) { try { await f.eraseTx(); } catch (er) {} }
        try { if (dir) await IOUtils.remove(dir, { recursive: true }); } catch (er) {}
    });

    // The evidence for the kept set (advsearch-feed.ts, the table): for each standard
    // condition, a POSITIVE test of it run as a temporary search in each fixture feed's
    // library -- "has a value" (isNotEmpty) where the condition offers it, each value of a
    // fixed-value condition, a count above 0, a date after 1900, a word of the fixture's own
    // texts. Negative operators do not count: "is not" / "does not contain" on a field no
    // feed item holds matches every feed item and says nothing about it. A condition is kept
    // exactly when one test matched.
    it("evidence: the conditions a feed item (or its linked PDF) matches are exactly the kept ones", async function () {
        const all = await feedItems();
        const words = new Set();
        for (const it of all) {
            for (const f of ["title", "abstractNote", "publicationTitle"]) {
                for (const w of String(it.getField(f, false, true) || "").split(/[^A-Za-z]+/)) if (/^wv/i.test(w)) words.add(w);
            }
        }
        const tests = (name, ops) => {
            const T = [];
            if (ops.isNotEmpty) T.push(["isNotEmpty", ""]);
            switch (name) {
                case "itemType": for (const t of Zotero.ItemTypes.getTypes()) T.push(["is", t.name]); break;
                case "fileTypeID": for (const t of /** @type {any[]} */ (Zotero.FileTypes.getTypes())) T.push(["is", String(t.id)]); break;
                case "attachmentStorageType": for (const v of ["storedFile", "linkedFile", "webLink"]) T.push(["is", v]); break;
                case "annotationType": for (const v of [1, 2, 3, 4, 5, 6]) T.push(["is", String(v)]); break;
                case "annotationColor": for (const c of /** @type {any[]} */ (/** @type {any} */ (Zotero.Annotations).COLORS || [])) T.push(["is", c[1]]); break;
                case "numTags": case "numNotes": case "numAttachments": case "numAnnotations": T.push(["isGreaterThan", "0"]); break;
                case "dateAdded": case "dateModified": case "lastRead": T.push(["isAfter", "1900-01-01"]); break;
            }
            if (!T.length && ops.contains) for (const w of words) T.push(["contains", w]);
            return T;
        };
        const kept = [], table = [];
        for (const sc of /** @type {any[]} */ (Zotero.SearchConditions.getStandardConditions())) {
            let hit = null;
            for (const [op, value] of tests(sc.name, sc.operators || {})) {
                for (const f of feeds) {
                    try {
                        const s = /** @type {any} */ (new Zotero.Search());
                        s.libraryID = f.libraryID;
                        s.addCondition(sc.name, op, value);
                        const ids = await s.search();
                        if (ids.length) {
                            const it = /** @type {any} */ (Zotero.Items.get(ids[0]));
                            hit = op + " " + JSON.stringify(value) + " -> " + it.itemType + " \"" + it.getDisplayTitle() + "\"";
                            break;
                        }
                    }
                    catch (e) {}
                }
                if (hit) break;
            }
            if (hit) kept.push(sc.name);
            table.push(sc.name + ": " + (hit ? "kept, " + hit : "hidden"));
        }
        kept.sort();
        const line = "[wv-test] advsearch-feed evidence on " + Zotero.version + ":\n  " + table.join("\n  ");
        try { Zotero.debug(line); } catch (e) {}
        assert.deepEqual(kept, KEPT, "the kept set (advsearch-feed.ts WV_ADVFEED_KEEP) is what feed items match " + diff(kept, KEPT));
        // What backs the hidden ones: Zotero's feed code writes no tag and no note, and a
        // feed library takes no collection and no saved search.
        for (const it of all) {
            assert.deepEqual(it.getTags(), [], "no tag on " + it.getDisplayTitle());
            if (it.isRegularItem()) assert.deepEqual(it.getNotes(), [], "no note under " + it.getDisplayTitle());
        }
        const lib = feeds[0].libraryID;
        let err = "";
        try { await new Zotero.Collection({ name: "wv", libraryID: lib }).saveTx(); } catch (e) { err = String(e); }
        assert.match(err, /Cannot add collection/, "a feed library takes no collection");
        err = "";
        try { const s = /** @type {any} */ (new Zotero.Search({ name: "wv", libraryID: lib })); s.addCondition("title", "contains", "x"); await s.saveTx(); } catch (e) { err = String(e); }
        assert.match(err, /Cannot add search/, "a feed library takes no saved search");
    });

    it("the Feeds row: every row's field menu holds exactly the kept conditions; the Save button stays off, Search runs", async function () {
        await closePane();
        await select(FEEDS);
        await openPane();
        const [row] = rowsIn(deck());
        assert.deepEqual(offered(row), KEPT, "offered " + diff(offered(row), KEPT));
        const m = menuOf(row);
        assert.isTrue(isHidden(m.querySelector("#annotation-conditions-menu")), "the Annotation submenu, emptied, hidden");
        assert.isFalse(isHidden(m.querySelector("#attachment-conditions-menu")), "the Attachment submenu stays: File Type, Storage Type");
        assert.isFalse(isHidden(m.querySelector("#more-conditions-menu")), "More stays");
        assert.isTrue(!!deck().pane._saveButton.disabled, "Save Search: off in a feed view (Zotero's _canSaveInSelection)");
        // Search runs as ever: Title contains a word of one feed item.
        const hit = await byTitle("Wvjournal alpha article"), miss = await byTitle("Wvplain epsilon post");
        row.querySelector("#valuefield").value = "Wvjournal";
        await deck().pane.submit();   // it folds the row's edit into the search first
        assert.ok(await wvT.waitFor(() => (listed(hit) && !listed(miss)) || null, 10000, 100), "the search ran across the feeds");
        await closePane();
    });

    it("a single feed: the same kept conditions", async function () {
        await select(feedRow(0));
        await openPane();
        const [row] = rowsIn(deck());
        assert.deepEqual(offered(row), KEPT, "offered " + diff(offered(row), KEPT));
        await closePane();
    });

    it("My Library: Zotero's whole menu, nothing hidden", async function () {
        await select(MYLIB());
        await openPane();
        const [row] = rowsIn(deck());
        assert.isAbove(allOf(row).length, KEPT.length + 20, "fixture: Zotero's menu");
        assert.deepEqual(offered(row), allOf(row), "nothing hidden");
        assert.isNull(win.document.querySelector("[data-wv-feed-hidden]"), "no entry marked anywhere");
        await closePane();
    });

    // A search built in My Library, then the view switched to Feeds with the Advanced Search
    // open: Zotero rebuilds every row at the switch (refresh -> renderConditions), so the
    // menus follow at once; the Tag row is kept as it is, its own field still offered.
    it("switching the view with the Advanced Search open: the menus follow at once, a row whose field is hidden stays editable", async function () {
        await select(MYLIB());
        await openPane();
        const s = /** @type {any} */ (new Zotero.Search());
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition("title", "contains", "Wv");
        s.addCondition("tag", "is", "wvx");
        deck().pane.search = s;
        const rowsNow = () => rowsIn(deck());
        const tagRow = () => rowsNow().find((r) => r.selectedCondition === "tag");
        assert.ok(tagRow(), "fixture: the Tag row");
        assert.deepEqual(offered(tagRow()), allOf(tagRow()), "My Library: the whole menu");
        await select(FEEDS);
        assert.ok(await wvT.waitFor(() => (rowsNow().length === 2 && tagRow() && same(offered(rowsNow()[0]), KEPT)) || null, 3000, 50),
            "Feeds: the rows rebuilt with the kept conditions " + diff(offered(rowsNow()[0]), KEPT));
        assert.deepEqual(offered(tagRow()), [...KEPT, "tag"].sort(), "the Tag row keeps its own field in its menu");
        assert.strictEqual(menuOf(tagRow()).getAttribute("value"), "tag", "and shows it");
        const conds = JSON.stringify(Object.values(deck().pane.search.getConditions()).map((c) => c.condition));
        assert.include(conds, "\"tag\"", "the search keeps the Tag condition: " + conds);
        // Picked away from, the hidden field goes from the menu at once.
        const row = tagRow();
        /** @type {any} */ (menuOf(row).querySelector("menuitem[value=\"title\"]")).doCommand();
        assert.strictEqual(row.selectedCondition, "title", "the row took Title (the menu's own command)");
        assert.deepEqual(offered(row), KEPT, "Tag gone from its menu " + diff(offered(row), KEPT));
        // Back in My Library: Zotero's whole menu again.
        await select(MYLIB());
        assert.ok(await wvT.waitFor(() => (rowsNow().length && rowsNow().every((r) => same(offered(r), allOf(r)))) || null, 3000, 50), "My Library: nothing hidden");
        assert.isNull(win.document.querySelector("[data-wv-feed-hidden]"), "no entry marked");
        await closePane();
    });

    // The quick search seeds the Advanced Search (openAdvancedSearchFromQuickSearch, what the
    // search field's Advanced Search button calls); in "All Fields & Tags + Everything" mode
    // each word is an "any" group of Any Field and Attachment Content.
    it("the quick-search seed on the Feeds row: its Attachment Content row stays, the results are right", async function () {
        await closePane();
        await select(FEEDS);
        const hit = await byTitle("Wvjournal alpha article");
        const others = (await feedItems()).filter((it) => it.isRegularItem() && it.id !== hit.id);
        await view().openAdvancedSearchFromQuickSearch("Wvjournal", "everything");
        assert.ok(await wvT.waitFor(() => (deck().state === "open" && rowsIn(deck()).length === 2) || null, 10000, 50), "the Advanced Search seeded: two rows");
        const any = rowsIn(deck()).find((r) => r.selectedCondition === "anyField");
        const ft = rowsIn(deck()).find((r) => r.selectedCondition === "fulltextContent");
        assert.ok(any && ft, "Any Field and Attachment Content rows");
        assert.deepEqual(offered(any), KEPT, "Any Field's row: the kept conditions");
        assert.deepEqual(offered(ft), [...KEPT, "fulltextContent"].sort(), "Attachment Content's row keeps its own field");
        assert.isFalse(isHidden(menuOf(ft).querySelector("#attachment-conditions-menu")), "in its Attachment submenu");
        assert.ok(await wvT.waitFor(() => (listed(hit) && others.every((it) => !listed(it))) || null, 10000, 100), "the list: the one feed item matching");
        await closePane();
    });

    // Typing on the CLOSED field menu: Zotero 10 walks its own list of every condition
    // (findConditionByPrefix), Zotero 11 the menu's entries not hidden (addMenuFindAsYouType).
    // A letter whose first condition is hidden in a feed: Zotero's pick in My Library, the
    // first kept one in Feeds.
    it("typing on the closed menu picks only an offered condition in a feed, Zotero's own pick elsewhere", async function () {
        const z10 = typeof win.customElements.get("zoterosearchcondition").prototype.findConditionByPrefix === "function";
        await closePane();
        await select(FEEDS);
        await openPane();
        let row = rowsIn(deck())[0];
        const name = (v) => String(Zotero.SearchConditions.getLocalizedName(v)).toLowerCase();
        const full = z10 ? row._conditions.map((c) => ({ v: c.name, n: String(c.localized).toLowerCase() }))
            : Array.from(menuOf(row).querySelectorAll("menuitem[value]")).map((it) => ({ v: it.getAttribute("value"), n: name(it.getAttribute("value")) }));
        const shown = new Set(offered(row));
        let L = null, zp = null, tp = null;
        for (const c of "abcdefghijklmnopqrstuvwxyz") {
            const z = full.find((x) => x.n.startsWith(c)), t = full.find((x) => x.n.startsWith(c) && shown.has(x.v));
            if (z && t && !shown.has(z.v) && t.v !== row.selectedCondition) { L = c; zp = z.v; tp = t.v; break; }
        }
        assert.ok(L, "fixture: a letter whose first condition is hidden in a feed");
        const type = (r) => menuOf(r).dispatchEvent(new win.KeyboardEvent("keydown", { key: L, bubbles: true, cancelable: true }));
        type(row);
        assert.strictEqual(row.selectedCondition, tp, "Feeds: \"" + L + "\" picks " + tp + ", not " + zp);
        await closePane();
        await select(MYLIB());
        await openPane();
        row = rowsIn(deck())[0];
        type(row);
        assert.strictEqual(row.selectedCondition, zp, "My Library: \"" + L + "\" picks Zotero's " + zp);
        await closePane();
    });

    // The Advanced Search in a new window: on a Zotero with its own windows, Zotero opens it
    // on the view's selection (libraryView.js openAdvancedSearchInNewWindow, Shift+click on
    // the funnel; Weavero's routes call it) -- a feed view stays one there, trimmed by that
    // window's own class. On Zotero 9/10 Weavero's own window lands on My Library by design
    // (pane.ts _wvAdvSearchOpenNewWindow): Zotero's whole menu there.
    it("the Advanced Search in a new window from the Feeds row", async function () {
        this.timeout(90000);
        await closePane();
        await select(FEEDS);
        const before = new Set(Zotero.getMainWindows());
        wv._wvAdvSearchLastOpen = 0;
        if (wvT.nativeWindows()) await view().openAdvancedSearchInNewWindow("", "fields");
        else await wv._wvAdvSearchOpenNewWindow(win);
        const nw = /** @type {any} */ (await wvT.waitFor(() => Zotero.getMainWindows().find((w) => !before.has(w) && w.ZoteroPane && w.ZoteroPane.collectionsView) || null, 25000));
        assert.ok(nw, "a new window");
        try {
            const nz = nw.ZoteroPane;
            const nd = () => { const lv = nz.libraryView; return /** @type {any} */ ((lv && lv.getElement && lv.getElement("zotero-advanced-search-pane-deck")) || nw.document.getElementById("zotero-advanced-search-pane-deck")); };
            assert.ok(await wvT.waitFor(() => (nd() && nd().state === "open" && rowsIn(nd()).length && nz.getCollectionTreeRows().length) || null, 20000, 100), "its Advanced Search open");
            await wvT.sleep(500);
            const rows = nz.getCollectionTreeRows();
            const [row] = rowsIn(nd());
            if (wvT.nativeWindows()) {
                assert.isTrue(rows.every((r) => r.isFeedsOrFeed()), "Zotero's window shows the Feeds row: " + rows.map((r) => r.id));
                assert.deepEqual(offered(row), KEPT, "its menu: the kept conditions " + diff(offered(row), KEPT));
            }
            else {
                assert.strictEqual(rows[0] && rows[0].id, MYLIB(), "Weavero's window lands on My Library");
                assert.deepEqual(offered(row), allOf(row), "its menu: Zotero's whole one");
            }
        }
        finally {
            try { nw.close(); } catch (er) {}
            await wvT.waitFor(() => (nw.closed ? true : null), 10000);
            await wvT.sleep(500);
        }
    });

    it("torn down: Zotero's menu and class as they were; wired again, trimmed again (the rows already built too)", async function () {
        await closePane();
        await select(FEEDS);
        await openPane();
        const P = /** @type {any} */ (win.customElements.get("zoterosearchcondition")).prototype;
        assert.deepEqual(offered(rowsIn(deck())[0]), KEPT, "fixture: trimmed");
        // Zotero's own methods, as the layer table keeps them (findConditionByPrefix: 10.0.8 only).
        const natives = {};
        for (const m of ["onConditionSelected", "findConditionByPrefix"]) {
            if (P._wvWraps && P._wvWraps[m]) natives[m] = P._wvWraps[m].native;
        }
        assert.isFunction(natives.onConditionSelected, "fixture: the layer on onConditionSelected");
        wv._wvAdvFeedTeardown();
        try {
            const [row] = rowsIn(deck());
            assert.deepEqual(offered(row), allOf(row), "the open menu: Zotero's whole one");
            assert.isNull(win.document.querySelector("[data-wv-feed-hidden]"), "no entry marked");
            for (const m of Object.keys(natives)) assert.strictEqual(P[m], natives[m], m + ": Zotero's own again");
            assert.isFalse(Object.prototype.hasOwnProperty.call(P, "_wvWraps"), "no layer table left on the class");
            await closePane();
            await openPane();
            const [fresh] = rowsIn(deck());
            assert.deepEqual(offered(fresh), allOf(fresh), "a row built after: Zotero's whole menu");
        }
        finally {
            for (const w of Zotero.getMainWindows()) wv._wvAdvFeedWire(w);
        }
        assert.deepEqual(offered(rowsIn(deck())[0]), KEPT, "wired again: the open rows trimmed at once");
        await closePane();
    });
});
