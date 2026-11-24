/* global describe, it, before, after, assert, Zotero, wvT, Services, Components */
// Stand-ins for Zotero bugs MJT reported (src/modules/upstream-fixes.ts). Each case shows
// the fix at work, and a TRIPWIRE: torn down, Zotero's bug shows -- the tripwire fails
// the day Zotero fixes it, and then the WV-TEMP is retired (upstream-check skill, step 3;
// the private upstream-bugs register lists each one).
describe("Weavero — upstream fixes", function () {
    this.timeout(120000);
    let wv, win, ZT, note;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const mainWins = () => Array.from(Services.wm.getEnumerator("navigator:browser")).filter(w => !w.closed);
    const noteTab = (w) => (w && w.Zotero_Tabs && w.Zotero_Tabs._tabs.find(t => t && t.data && t.data.itemID === note.id)) || null;
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    async function closeNew(before) {
        for (const w of mainWins()) if (!before.includes(w)) { try { w.close(); } catch (er) {} }
        await sleep(1500);
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWireNoteWindowFix", "_wvTeardownNoteWindowFix", "_wvNoteWindowFromTab", "_wvWireCtxHeaderFix", "_wvTeardownCtxHeaderFix", "_wvWireNarrowPaneFix", "_wvTeardownNarrowPaneFix", "_wvWireReaderMenuFix", "_wvTeardownReaderMenuFix", "_wvWireAddSelectFix", "_wvTeardownAddSelectFix", "_wvWirePaneJumpFix", "_wvTeardownPaneJumpFix", "_wvWireExtAnnDeleteFix", "_wvTeardownExtAnnDeleteFix", "_wvWirePageCountFix", "_wvTeardownPageCountFix", "_wvPageCountRefresh","_wvWireRowCountFix", "_wvTeardownRowCountFix", "_wvWireTagReshowFix", "_wvTeardownTagReshowFix", "_wvTagSelectorReselect", "_wvWireFeedAbstractFix", "_wvTeardownFeedAbstractFix", "_wvWireAdvSearchSeedFix", "_wvTeardownAdvSearchSeedFix", "_wvAdvSearchSeedBugIn", "_wvWireIntroCrashFix", "_wvTeardownIntroCrashFix"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); ZT = win.Zotero_Tabs;
        note = new Zotero.Item("note");
        note.setNote("<h1>wv upstream fix note</h1><p>Edit in a separate window</p>");
        await note.saveTx();
    });

    after(async function () {
        for (const w of mainWins()) { const t = noteTab(w); if (t) { try { w.Zotero_Tabs.close(t.id); } catch (er) {} } }
        await sleep(500);
        if (note) await wvT.erase(note);
    });

    // Forum 134823, register #64: a reader tab selected while the item pane is closed;
    // the pane opened again draws the sections but not the header (title / citation),
    // until another tab is selected. Zotero 10.0.8 draws it.
    describe("WV-TEMP-134823: the item pane header after the pane is opened again", function () {
        const made = [];
        const parents = [];
        let ow, oh;
        const CP = () => win.ZoteroContextPane;
        const tabOfAtt = (att) => ZT._tabs.find(t => t && t.data && t.data.itemID === att.id) || null;
        /** The header's words for tab `id` ("" while blank). */
        const header = (id) => {
            const d = win.document.getElementById(id + "-context");
            const h = d && d.querySelector("item-pane-header");
            if (!h) return "";
            const bib = h.bibEntry && h.bibEntry.shadowRoot ? h.bibEntry.shadowRoot.textContent.trim() : "";
            const title = h.titleField ? String(h.titleField.value || "").trim() : "";
            return bib || title;
        };
        async function readerTab(att) {
            await Zotero.Reader.open(att.id, null, { openInWindow: false });
            const t = await wvT.waitFor(() => tabOfAtt(att), 20000, 100);
            assert.ok(t, "fixture: the reader tab");
            await wvT.waitFor(() => { const r = /** @type {any} */ (Zotero.Reader.getByTabID(t.id)); return r && r._internalReader; }, 20000, 100);
            await sleep(1200);
            return t;
        }
        /** Paper A's PDF with the pane open, the pane closed, paper `att` opened, the pane opened. */
        async function scenario(att) {
            const a = await readerTab(made[0]);
            if (CP().collapsed) { CP().collapsed = false; await sleep(800); }
            assert.ok(header(a.id), "fixture: A's header drawn with the pane open");
            CP().collapsed = true; await sleep(700);
            // As in the steps reproduced without Weavero (D:/tmp/hunt/mw_ui64.js): back in
            // My Library, then the second PDF.
            ZT.select(libTab().id); await sleep(1000);
            const b = await readerTab(att);
            CP().collapsed = false; await sleep(1800);
            return header(b.id);
        }

        before(async function () {
            const inner = win.document.getElementById("zotero-context-pane-inner");
            const nat = inner && inner._wvWraps && inner._wvWraps.handleCollapse ? inner._wvWraps.handleCollapse.native : inner && inner.handleCollapse;
            const d = Object.getOwnPropertyDescriptor(win.ZoteroContextPane, "collapsed");
            // Zotero 11 with the mismatch only (the fix installs nothing elsewhere).
            if (!/prevState\s*===\s*["']true["']/.test(String(nat)) || !/toggleAttribute\(\s*['"]collapsed['"]/.test(d && d.set ? String(d.set) : "")) this.skip();
            // The standard (side-by-side) layout: a window wider than Zotero's 930px.
            // Resized only when narrower (and given back in after(), waited for): a
            // later spec reads the reader's zoom, which follows the window's width.
            if (win.innerWidth < 1200) {
                ow = win.outerWidth; oh = win.outerHeight;
                try { win.resizeTo(1600, 1000); } catch (er) {}
                await wvT.waitFor(() => win.outerWidth === 1600 || null, 3000, 50);
                await sleep(400);
            }
            // Papers with a PDF each, as in the reproduction (the header shows the paper).
            for (const n of ["A", "B", "C"]) {
                const parent = await wvT.createItem("journalArticle", { title: "WV-HDR paper " + n });
                parents.push(parent);
                made.push(await wvT.createTestPDFItem("wv-hdr-" + n, { parentItemID: parent.id }));
            }
        });

        after(async function () {
            for (const att of made) { const t = tabOfAtt(att); if (t) { try { ZT.close(t.id); } catch (er) {} } }
            await sleep(400);
            try { if (win.ZoteroContextPane.collapsed) win.ZoteroContextPane.collapsed = false; } catch (er) {}
            if (ow) {
                try { win.resizeTo(ow, oh); } catch (er) {}
                await wvT.waitFor(() => win.outerWidth === ow || null, 3000, 50);
                await sleep(600);
            }
            if (made.length) await wvT.erase(...made);
            if (parents.length) await wvT.erase(...parents);
        });

        it("opened again on a PDF selected while it was closed, the pane draws its header", async function () {
            const h = await scenario(made[1]);
            assert.ok(h, "the header drawn: " + JSON.stringify(h));
        });

        it("torn down, the header stays blank (tripwire: fails once Zotero fixes it -- retire WV-TEMP-134823)", async function () {
            wv._wvTeardownCtxHeaderFix();
            try {
                const h = await scenario(made[2]);
                assert.strictEqual(h, "", "blank (if drawn, Zotero fixed it: retire WV-TEMP-134823)");
            }
            finally { wv._wvWireCtxHeaderFix(win); }
        });
    });

    // Forum 133075 (MJT; also 133002, 129464, 133790): after a change to an Info field, the
    // focus moving on to a field near the item pane's bottom edge made the pane scroll
    // ~550 px, the field ending above the view (11.0-beta.4 and 10.0.8 with no add-on,
    // check pass 2026-11-19). The steps of that reproduction (D:/tmp/hunt/chk5_jump.js):
    // a Book with its fields filled, a short window, ISBN the last visible field, "1"
    // typed at the end of the field before it (trusted keys), then Tab into ISBN.
    describe("WV-TEMP-133075: the item pane keeps its place after an Info edit", function () {
        let book = null, ow = 0, oh = 0;
        const Cc = Components.classes, Ci = Components.interfaces;
        const det = () => {
            let d = null;
            try { const lv = /** @type {any} */ (win.ZoteroPane).libraryView; if (lv) d = lv.querySelector("item-details"); } catch (er) {}
            return /** @type {any} */ (d || win.document.querySelector("#zotero-item-pane item-details"));
        };
        const pane = () => { const d = det(); return d && (d._paneParent || d.querySelector(".zotero-view-item")); };
        const field = (f) => { const d = det(); return d && d.querySelector(`info-box editable-text[fieldname="${f}"]`); };
        function key(k) {
            const t = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor);
            if (!t.beginInputTransactionForTests(win)) throw new Error("text input processor busy");
            const named = { Tab: 9, Escape: 27, End: 35 };
            const code = k.length === 1 ? "Digit" + k : k;
            const keyCode = k.length === 1 ? k.charCodeAt(0) : named[k];
            const ev = new win.KeyboardEvent("", { key: k, code, keyCode });
            t.keydown(ev); t.keyup(ev);
        }
        /** ISBN's bottom edge just above the pane's bottom edge. */
        function place() {
            const sc = pane(), t = field("ISBN");
            const pr = sc.getBoundingClientRect(), tr = t.getBoundingClientRect();
            sc.scrollTop += (tr.bottom - pr.bottom) + 2;
        }
        /** Change (or not) the field before ISBN, Tab into ISBN: how far the pane moved,
         *  and whether ISBN is still in view. */
        async function run(change) {
            const order = Array.from(det().querySelectorAll("info-box editable-text[fieldname]")).map(e => e.getAttribute("fieldname"));
            const source = order[order.indexOf("ISBN") - 1];
            try { win.document.activeElement && win.document.activeElement.blur(); } catch (er) {}
            await sleep(600);
            place(); await sleep(500);
            win.focus();
            await wvT.waitFor(() => Services.focus.activeWindow === win || null, 3000, 50);
            field(source).focus(); await sleep(500);
            if (change) { key("End"); key(String(Date.now() % 10)); await sleep(300); }
            const sc = pane(), mid = sc.scrollTop;
            key("Tab"); await sleep(1500);
            const pr = sc.getBoundingClientRect(), tr = field("ISBN").getBoundingClientRect();
            const ae = /** @type {any} */ (win.document.activeElement);
            const fe = ae && ae.closest ? ae.closest("editable-text") : null;
            const out = { source, moved: Math.round(sc.scrollTop - mid), inView: tr.top >= pr.top - 1 && tr.bottom <= pr.bottom + 1,
                focused: fe ? fe.getAttribute("fieldname") : null };
            key("Escape"); await sleep(600);
            return out;
        }

        before(async function () {
            const cls = win.customElements.get("info-box");
            assert.ok(cls, "fixture: Zotero's info-box element");
            ow = win.outerWidth; oh = win.outerHeight;
            try { if (win.windowState !== win.STATE_NORMAL) win.restore(); } catch (er) {}
            try { win.resizeTo(1100, 620); } catch (er) {}
            await sleep(1500);
            book = new Zotero.Item("book");
            const F = { title: "WV-133075 jumping view", series: "Series", seriesNumber: "3", volume: "2", numberOfVolumes: "4", edition: "2nd",
                place: "Paris", publisher: "Pub", date: "2001", numPages: "300", language: "en", ISBN: "978-0-00-000000-2", shortTitle: "short",
                url: "https://example.org", accessDate: "2024-01-01", archive: "arch", archiveLocation: "loc", libraryCatalog: "cat", callNumber: "QA1",
                rights: "r", extra: "x" };
            for (const [k, v] of Object.entries(F)) { try { book.setField(k, v); } catch (er) {} }
            book.setCreators([{ firstName: "Ann", lastName: "Author", creatorType: "author" }, { firstName: "Bob", lastName: "Second", creatorType: "author" }]);
            await book.saveTx();
            ZT.select(libTab().id); await sleep(800);
            await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await sleep(800);
            await win.ZoteroPane.selectItem(book.id);
            assert.ok(await wvT.waitFor(() => field("ISBN"), 10000, 100), "fixture: the book's Info drawn");
            await sleep(1000);
            const sc = pane();
            assert.isAbove(sc.scrollHeight, sc.clientHeight + 100, "fixture: the item pane scrolls in this window");
        });

        after(async function () {
            try { win.document.activeElement && win.document.activeElement.blur(); } catch (er) {}
            if (ow) { try { win.resizeTo(ow, oh); } catch (er) {} await sleep(800); }
            if (book) await wvT.erase(book);
        });

        it("Tab into a field at the bottom edge after a change: the pane stays, the field in view", async function () {
            const still = await run(false);
            assert.isAtMost(Math.abs(still.moved), 20, "control, no change: no movement " + JSON.stringify(still));
            const r = await run(true);
            assert.equal(r.focused, "ISBN", "the focus in ISBN " + JSON.stringify(r));
            assert.isAtMost(Math.abs(r.moved), 40, "the pane keeps its place " + JSON.stringify(r));
            assert.isTrue(r.inView, "ISBN in view " + JSON.stringify(r));
        });

        it("torn down, the pane jumps and ISBN leaves the view (tripwire: fails once Zotero fixes it -- retire WV-TEMP-133075)", async function () {
            wv._wvTeardownPaneJumpFix();
            try {
                const r = await run(true);
                assert.isAbove(Math.abs(r.moved), 200, "the pane jumps (if not, Zotero fixed forum 133075: retire WV-TEMP-133075) " + JSON.stringify(r));
            }
            finally { wv._wvWirePaneJumpFix(win); }
        });
    });

    // Forum 124063 (MJT; zotero#5262): an annotation stored in the PDF file (external,
    // read-only in the reader) was erased from the items list by the Delete key, and came
    // back as a new item at the next import of the file (11.0-beta.4 and 10.0.8, no add-on,
    // check pass 2026-11-19). The Delete key's path asks canDeleteSelectedItems first.
    describe("WV-TEMP-124063: an external annotation cannot be deleted from the items list", function () {
        let att = null, ext = null, own = null;
        async function annotation(isExternal) {
            const a = new Zotero.Item("annotation");
            a.libraryID = att.libraryID;
            a.parentID = att.id;
            a.annotationType = "highlight";
            a.annotationIsExternal = isExternal;
            a.annotationText = isExternal ? "stored in the PDF" : "made in Zotero";
            a.annotationColor = "#ffd400";
            a.annotationSortIndex = isExternal ? "00000|000100|00000" : "00000|000200|00000";
            a.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[72, 700, 200, 712]] });
            await a.saveTx();
            return a;
        }
        async function select(it) {
            ZT.select(libTab().id); await sleep(600);
            await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await sleep(600);
            await win.ZoteroPane.selectItem(it.id);
            const ok = await wvT.waitFor(() => { const s = win.ZoteroPane.getSelectedItems(); return s.length === 1 && s[0].id === it.id || null; }, 8000, 100);
            assert.ok(ok, "fixture: the annotation selected in the items list");
        }

        before(async function () {
            att = await wvT.createTestPDFItem("wv-124063");
            ext = await annotation(true);
            own = await annotation(false);
            assert.isTrue(!!ext.annotationIsExternal, "fixture: an external annotation");
        });

        after(async function () {
            try { ZT.select(libTab().id); } catch (er) {}
            if (att) await wvT.erase(att);
        });

        it("an external annotation selected: Delete is refused; an annotation made in Zotero still can be", async function () {
            await select(ext);
            assert.isFalse(!!win.ZoteroPane.canDeleteSelectedItems(), "the external annotation cannot be deleted");
            await select(own);
            assert.isTrue(!!win.ZoteroPane.canDeleteSelectedItems(), "an annotation made in Zotero can");
        });

        it("torn down, the external annotation can be deleted (tripwire: fails once Zotero fixes it -- retire WV-TEMP-124063)", async function () {
            wv._wvTeardownExtAnnDeleteFix();
            try {
                await select(ext);
                assert.isTrue(!!win.ZoteroPane.canDeleteSelectedItems(), "Zotero allows it (if not, Zotero fixed forum 124063: retire WV-TEMP-124063)");
            }
            finally { wv._wvWireExtAnnDeleteFix(win); }
        });
    });

    // Forum 99239 (MJT, 2022), zotero#2780: after Delete Page in the reader, the PDF's
    // stored page count (the item pane's Pages row) and its indexed words stay as they
    // were. Driven through the reader's own Delete Page, its prompt answered yes, so a
    // fix Zotero makes in reader.js rather than in deletePages trips the tripwire too.
    describe("WV-TEMP-99239: the page count and the index follow a page delete", function () {
        const made = [];
        // Three pages, each with its own words (wvdelpg1 wvdelwa, wvdelpg2 wvdelwb, ...).
        function pdf(n) {
            const objs = ["<< /Type /Catalog /Pages 2 0 R >>"];
            const kids = [];
            for (let i = 0; i < n; i++) kids.push((4 + 2 * i) + " 0 R");
            objs.push("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>");
            objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
            for (let i = 0; i < n; i++) {
                const s = "BT /F1 24 Tf 40 100 Td (wvdelpg" + (i + 1) + " wvdelw" + "abcdefgh"[i] + ") Tj ET";
                objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents " + (5 + 2 * i) + " 0 R >>");
                objs.push("<< /Length " + s.length + " >>\nstream\n" + s + "\nendstream");
            }
            let body = "%PDF-1.4\n";
            const off = [];
            objs.forEach((o, i) => { off.push(body.length); body += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
            const x = body.length;
            let xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
            for (const o of off) xref += String(o).padStart(10, "0") + " 00000 n \n";
            return body + xref + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + x + "\n%%EOF\n";
        }
        const FT = () => /** @type {any} */ (Zotero).FullText || /** @type {any} */ (Zotero).Fulltext;
        async function fresh(name) {
            const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + ".pdf");
            await IOUtils.writeUTF8(path, pdf(3));
            const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), libraryID: Zotero.Libraries.userLibraryID });
            try { await IOUtils.remove(path); } catch (er) {}
            made.push(att);
            await FT().indexItems([att.id], { complete: true });
            const pg = await FT().getPages(att.id);
            assert.equal(pg && pg.total, 3, "fixture: the 3-page PDF indexed, 3 pages stored");
            assert.isTrue(await matches(att, "wvdelwb"), "fixture: page 2's word found by a full-text search");
            return att;
        }
        async function matches(att, word) {
            const s = /** @type {any} */ (new Zotero.Search());
            s.libraryID = att.libraryID;
            s.addCondition("fulltextContent", "contains", word);
            return (await s.search()).includes(att.id);
        }
        async function pagesInFile(att) {
            try { return (await Zotero.PDFWorker.getFullText(att.id, null)).totalPages; } catch (er) { return null; }
        }
        // The reader's Delete Page on page 2, as the page's context menu runs it.
        async function deletePage2(att) {
            const reader = /** @type {any} */ (await wvT.openReaderTab(att.id));
            assert.ok(reader, "fixture: the PDF open in a reader tab");
            reader._promptToDeletePages = () => true;
            reader._internalReader.deletePages(Components.utils.cloneInto([1], reader._iframeWindow));
            const t0 = Date.now();
            while (Date.now() - t0 < 20000 && (await pagesInFile(att)) !== 2) await sleep(250);
            assert.equal(await pagesInFile(att), 2, "fixture: the file has 2 pages after the delete");
            return reader;
        }
        function libraryBox() {
            const lv = /** @type {any} */ (win.ZoteroPane).libraryView;
            return (lv && typeof lv.getElement === "function" && lv.getElement("zotero-attachment-box")) || win.document.getElementById("zotero-attachment-box");
        }
        async function closeReaders(att) {
            for (const r of (/** @type {any} */ (Zotero.Reader)._readers || []).slice()) {
                try { if (r.itemID === att.id && r.tabID) ZT.close(r.tabID); } catch (er) {}
            }
            try { ZT.select(libTab().id); } catch (er) {}
            await sleep(500);
        }

        after(async function () {
            for (const a of made) { await closeReaders(a); await wvT.erase(a); }
        });

        it("Delete Page: the stored count follows the file, the deleted page's words go, the Pages row reads 2", async function () {
            const att = await fresh("wv-99239-fix");
            ZT.select(libTab().id); await sleep(400);
            await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await win.ZoteroPane.selectItem(att.id);
            const shown = await wvT.waitFor(() => { const b = libraryBox(); return b && b.item && b.item.id === att.id || null; }, 8000, 100);
            assert.ok(shown, "fixture: the attachment shown in the library's item pane");
            await deletePage2(att);
            const t0 = Date.now();
            let pg = null;
            while (Date.now() - t0 < 20000) { pg = await FT().getPages(att.id); if (pg && pg.total === 2) break; await sleep(250); }
            assert.equal(pg && pg.total, 2, "the stored page count follows the file");
            assert.equal(pg && pg.indexedPages, 2, "every page indexed, as before the delete");
            assert.isFalse(await matches(att, "wvdelwb"), "the deleted page's word is no longer found");
            assert.isTrue(await matches(att, "wvdelwc"), "page 3's word still is");
            await closeReaders(att);
            const row = await wvT.waitFor(() => { const b = libraryBox(); const v = b && b.querySelector("#pages"); return v && String(v.value) === "2" || null; }, 8000, 100);
            assert.ok(row, "the item pane's Pages row reads 2 (it reads " + String((libraryBox() && libraryBox().querySelector("#pages") || {}).value) + ")");
        });

        it("torn down, the count stays 3 and the deleted page's words are still found (tripwire: fails once Zotero fixes it -- retire WV-TEMP-99239)", async function () {
            wv._wvTeardownPageCountFix();
            try {
                const att = await fresh("wv-99239-trip");
                await deletePage2(att);
                await sleep(3000);
                const pg = await FT().getPages(att.id);
                assert.equal(pg && pg.total, 3, "Zotero keeps 3 pages (if 2, Zotero fixed forum 99239 / zotero#2780: retire WV-TEMP-99239)");
                assert.isTrue(await matches(att, "wvdelwb"), "Zotero still finds the deleted page's word");
                await closeReaders(att);
            }
            finally { wv._wvWirePageCountFix(); }
        });
    });

    // Forum 134824, registers #58/#59: a new item made in one window takes the selection
    // of every window showing that list (and wipes its quick search); a new collection
    // moves every window and library tab. The active window is set by stubbing
    // Zotero.getActiveZoteroPane: the runner's focus is not to be trusted.
    describe("WV-TEMP-134824: a new item selects in the window it was made in only", function () {
        let w2 = null, keep = null, getActive = null;
        const made = [];
        const selectedIn = (w) => { try { const s = w.ZoteroPane.getSelectedItems(); return s && s.length === 1 ? s[0].id : null; } catch (er) { return null; } };
        async function newItem(title) {
            const it = new Zotero.Item("book"); it.setField("title", title); await it.saveTx();
            made.push(it);
            await sleep(1500);
            return it;
        }
        before(async function () {
            const ct = win.ZoteroPane.collectionsView;
            const cw = ct && ct._wvWraps && ct._wvWraps.notify;
            const nat = String(ct && (ct._wvOrigNotifyForSelectGuard || (cw ? cw.native : ct.notify)));
            if (!wvT.nativeWindows() || !/selectRow\s*=\s*ids\.length\s*==\s*1/.test(nat) || /getActiveZoteroPane|isActiveView/.test(nat)) this.skip();
            ZT.select(libTab().id); await sleep(500);
            await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID); await sleep(800);
            keep = new Zotero.Item("book"); keep.setField("title", "wv add-select keep"); await keep.saveTx();
            made.push(keep);
            w2 = await wvT.openMainWindow();
            assert.ok(w2, "fixture: a second main window");
            await sleep(1500);
            await w2.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID); await sleep(800);
            getActive = /** @type {any} */ (Zotero).getActiveZoteroPane;
            /** @type {any} */ (Zotero).getActiveZoteroPane = () => w2.ZoteroPane;
        });
        after(async function () {
            if (getActive) /** @type {any} */ (Zotero).getActiveZoteroPane = getActive;
            if (w2) { try { w2.close(); } catch (er) {} await sleep(1200); }
            if (made.length) await wvT.erase(...made);
        });

        it("made in window 2: window 1 keeps its selection", async function () {
            await win.ZoteroPane.selectItem(keep.id); await sleep(800);
            assert.strictEqual(selectedIn(win), keep.id, "fixture: window 1 on its item");
            const y = await newItem("wv add-select new 1");
            assert.strictEqual(selectedIn(win), keep.id, "window 1 still on its item (not the new one)");
            assert.strictEqual(selectedIn(w2), y.id, "window 2, where it was made, on the new item");
        });

        it("torn down, window 1 jumps to the new item (tripwire: fails once Zotero fixes it -- retire WV-TEMP-134824)", async function () {
            await win.ZoteroPane.selectItem(keep.id); await sleep(800);
            wv._wvTeardownAddSelectFix();
            try {
                const z = await newItem("wv add-select new 2");
                assert.strictEqual(selectedIn(win), z.id, "window 1 took the new item (if not, Zotero fixed it: retire WV-TEMP-134824)");
            }
            finally { for (const w of mainWins()) { try { wv._wvWireAddSelectFix(w); } catch (er) {} } }
        });
    });

    // Forum 134772, register #18: Zotero's own entries of a PDF page's right-click menu
    // (Automatically Resize, Zoom to Page Width / Height, Split ...) greyed on 11.0-beta.4:
    // an item without `disabled` is built with toggleAttribute('disabled', undefined).
    // Fixed upstream (zotero 3e32faa0a, 2026-11-14), not in a beta yet.
    describe("WV-TEMP-134772: reader menu entries without a disabled value are enabled", function () {
        let att = null, reader = null;
        const protoOf = (r) => { let p = Object.getPrototypeOf(r); while (p && !Object.prototype.hasOwnProperty.call(p, "_openContextMenu")) p = Object.getPrototypeOf(p); return p; };
        /** Zotero's own menu builder on `items`: the built entry's disabled attribute. */
        async function built(label) {
            // Its promise settles when the menu closes (popuphidden): not awaited.
            reader._openContextMenu({ x: 200, y: 200, itemGroups: [[{ label, onCommand() {} }]] });
            const mi = await wvT.waitFor(() => Array.from(reader._popupset.querySelectorAll("menuitem")).find(m => m.getAttribute("label") === label), 3000, 50);
            const out = mi ? mi.hasAttribute("disabled") : null;
            try { const pop = mi && mi.closest("menupopup"); if (pop) { if (pop.state === "open" || pop.state === "showing") pop.hidePopup(); else pop.remove(); } } catch (er) {}
            await sleep(300);
            return out;
        }
        before(async function () {
            att = await wvT.createTestPDFItem("wv-menu-disabled");
            await Zotero.Reader.open(att.id, null, { openInWindow: false });
            const t = await wvT.waitFor(() => ZT._tabs.find(x => x && x.data && x.data.itemID === att.id), 20000, 100);
            reader = await wvT.waitFor(() => { const r = /** @type {any} */ (Zotero.Reader.getByTabID(t.id)); return r && r._internalReader ? r : null; }, 20000, 100);
            assert.ok(reader, "fixture: a reader");
            const p = protoOf(reader);
            const wr = p && p._wvWraps && p._wvWraps._openContextMenu;
            const nat = wr ? wr.native : p && p._openContextMenu;
            if (!/toggleAttribute\(\s*['"]disabled['"]\s*,\s*item\.disabled\s*\)/.test(String(nat))) this.skip();
        });
        after(async function () {
            const t = att && ZT._tabs.find(x => x && x.data && x.data.itemID === att.id);
            if (t) { try { ZT.close(t.id); } catch (er) {} }
            await sleep(400);
            if (att) await wvT.erase(att);
        });

        it("an entry with no disabled value comes out enabled", async function () {
            assert.isFalse(await built("wv menu test on"), "enabled");
        });

        it("torn down, it comes out greyed (tripwire: fails once the beta has zotero 3e32faa0a -- retire WV-TEMP-134772)", async function () {
            wv._wvTeardownReaderMenuFix();
            try {
                assert.isTrue(await built("wv menu test off"), "greyed (if enabled, Zotero's fix shipped: retire WV-TEMP-134772)");
            }
            finally { wv._wvWireReaderMenuFix(reader); }
        });
    });

    // Forum 134826, register #53: a window without a library (a note in a window of its
    // own) can be narrowed until its open item pane is cut off: its minimum is 570px for
    // a 927px need (deck 570 + item pane 320 + side navigation 37).
    describe("WV-TEMP-134826: a window without a library counts its open item pane in its minimum width", function () {
        let nw = null;
        const minOf = (w) => parseFloat(w.getComputedStyle(w.document.documentElement).minWidth) || 0;
        before(async function () {
            const ZP = win.ZoteroPane;
            const wr = ZP._wvWraps && ZP._wvWraps.updateLayoutConstraints;
            const nat = wr ? wr.native : ZP.updateLayoutConstraints;
            if (!wvT.nativeWindows() || !/!this\.libraryView[\s\S]{0,200}--width-of-fixed-components['"]\s*,\s*['"]0px/.test(String(nat))) this.skip();
            const before = mainWins();
            /** @type {any} */ (Zotero).openMainWindow({ noteTabState: { itemID: note.id, title: "wv upstream fix note" } });
            nw = await wvT.waitFor(() => mainWins().find(w => !before.includes(w) && w.ZoteroPane && w.ZoteroContextPane && noteTab(w)), 20000, 100);
            assert.ok(nw, "fixture: a window holding the note alone");
            await sleep(1500);
            assert.notOk(nw.ZoteroPane.libraryView, "fixture: no library view in it");
            if (nw.ZoteroContextPane.collapsed) { nw.ZoteroContextPane.collapsed = false; await sleep(800); }
        });
        after(async function () { if (nw) { try { nw.close(); } catch (er) {} await sleep(1200); } });

        it("its item pane open beside the tabs: the window's minimum width counts it (570 + 320 + 37)", async function () {
            nw.ZoteroPane.updateLayoutConstraints(); await sleep(300);
            assert.approximately(minOf(nw), 927, 1, "min-width " + minOf(nw));
            nw.ZoteroContextPane.collapsed = true; await sleep(600);
            assert.approximately(minOf(nw), 570, 1, "pane closed: Zotero's own minimum");
            nw.ZoteroContextPane.collapsed = false; await sleep(600);
            assert.approximately(minOf(nw), 927, 1, "open again: counted again");
        });

        it("torn down, Zotero's minimum leaves the pane out (tripwire: fails once Zotero fixes it -- retire WV-TEMP-134826)", async function () {
            wv._wvTeardownNarrowPaneFix();
            try {
                nw.ZoteroPane.updateLayoutConstraints(); await sleep(300);
                assert.approximately(minOf(nw), 570, 1, "570px with the pane open (if it counts the pane, Zotero fixed it: retire WV-TEMP-134826)");
            }
            finally {
                for (const w of mainWins()) { try { wv._wvWireNarrowPaneFix(w); } catch (er) {} }
            }
        });
    });

    // Forum 134317 (MJT), register #30: View > Layout > Tag Selector hides the Tag Selector
    // by taking it down (toggleTagSelector: uninit, tagSelector = null) and leaves the
    // items list filtered by the selected tag (the collection row keeps it); shown again,
    // Zotero builds an EMPTY selector over the filtered list -- no tag highlighted, nothing
    // to click to turn the filter off. 11.0-beta.4 (libraryView.js) and 10.0.8
    // (zoteroPane.js) alike. Driven through what View > Layout > Tag Selector runs,
    // ZoteroPane.toggleTagSelector() (standalone.js onViewMenuItemClick; the menu's
    // handler is a lexical const of the window, out of a spec's reach).
    describe("WV-TEMP-134317: View > Layout shows the Tag Selector again with the filter's tags selected", function () {
        const TAG = "wv-134317-tag";
        let item = null, ZP = null, doc = null;
        const ct = () => {
            const lv = ZP.libraryView;
            return (lv && typeof lv.getElement === "function" && lv.getElement("zotero-tag-selector-container")) || doc.getElementById("zotero-tag-selector-container");
        };
        const rowTags = () => {
            const iv = ZP.itemsView;
            const row = (iv.collectionTreeRows && iv.collectionTreeRows[0]) || iv.collectionTreeRow;
            return row && row.tags ? [...row.tags] : [];
        };
        const shown = () => !!ZP.tagSelector && !!ZP.tagSelectorShown();
        const highlighted = () => [...ct().querySelectorAll(".tag-selector-item.selected")].map(e => e.textContent.trim());
        /** View > Layout > Tag Selector (not awaited: the menu does not wait either). */
        function viewMenu() {
            Promise.resolve(ZP.toggleTagSelector()).catch(e => Zotero.logError(e));
        }
        /** The library, the Tag Selector shown, the list filtered by TAG. */
        async function filtered() {
            ZT.select(libTab().id); await sleep(500);
            await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await sleep(500);
            if (!shown()) { viewMenu(); await wvT.waitFor(() => shown() || null, 10000, 100); }
            assert.isTrue(shown(), "fixture: the Tag Selector shown");
            await ZP.setTagScope();
            ZP.tagSelector.selectedTags = new Set([TAG]);
            await ZP.updateTagFilter();
            const ok = await wvT.waitFor(() => (rowTags().includes(TAG) && ZP.itemsView.getRowIndexByID(item.id) !== false) || null, 10000, 100);
            assert.ok(ok, "fixture: the list filtered by the tag");
        }
        /** View > Layout > Tag Selector twice: hidden, then shown again. */
        async function hideShow() {
            viewMenu();
            assert.ok(await wvT.waitFor(() => !ZP.tagSelector || null, 10000, 100), "hidden: Zotero took the selector down");
            assert.deepEqual(rowTags(), [TAG], "hidden: the list still filtered");
            viewMenu();
            assert.ok(await wvT.waitFor(() => shown() || null, 10000, 100), "shown again");
            await sleep(800);
        }

        before(async function () {
            ZP = win.ZoteroPane; doc = win.document;
            item = await wvT.createItem("book", { title: "WV-134317 tagged book" });
            item.addTag(TAG);
            await item.saveTx();
        });
        after(async function () {
            try { if (ZP.tagSelector) { ZP.tagSelector.clearTagSelection(); await ZP.updateTagFilter(); } } catch (er) {}
            try { if (!shown()) viewMenu(); await sleep(500); } catch (er) {}
            if (item) await wvT.erase(item);
        });

        it("hidden and shown again: the tag the list is filtered by is selected and highlighted", async function () {
            await filtered();
            await hideShow();
            assert.isTrue(ZP.tagSelector.getTagSelection().has(TAG), "the tag selected again, as the list is filtered");
            assert.deepEqual(rowTags(), [TAG], "the list untouched");
            const hl = await wvT.waitFor(() => highlighted().includes(TAG) || null, 10000, 100);
            assert.ok(hl, "the tag highlighted: " + JSON.stringify(highlighted()));
            // Deselecting it now turns the filter off, as for any selected tag.
            ZP.tagSelector.clearTagSelection();
            await ZP.updateTagFilter();
            assert.ok(await wvT.waitFor(() => !rowTags().length || null, 5000, 100), "the filter off");
        });

        it("torn down, the selector comes back empty over the filtered list (tripwire: fails once Zotero fixes it -- retire WV-TEMP-134317)", async function () {
            if (typeof wv._wvTeardownTagReshowFix !== "function") wvT.absent("plugin._wvTeardownTagReshowFix");
            wv._wvTeardownTagReshowFix();
            try {
                await filtered();
                await hideShow();
                assert.strictEqual(ZP.tagSelector.getTagSelection().size, 0,
                    "nothing selected (if the tag is, Zotero fixed forum 134317: retire WV-TEMP-134317)");
                assert.deepEqual(rowTags(), [TAG], "the list still filtered by it");
            }
            finally { for (const w of mainWins()) { try { wv._wvWireTagReshowFix(w); } catch (er) {} } }
        });
    });

    // Forum 134831, register #66: a note tab's More > "Edit in a Separate Window" calls
    // ZoteroPane.openNoteWindow, and Zotero 11's Notes.open lets the note's own tab stand
    // in for a window -- nothing opens. Zotero 10.0.8 opens a note window.
    describe("WV-TEMP-134831: Edit in a Separate Window from a note tab", function () {
        before(function () {
            // Zotero 11 (its own windows) with the stand-in rule only; anywhere else Zotero
            // opens the window itself and the fix installs nothing.
            const N = /** @type {any} */ (Zotero).Notes;
            const rule = [N._wvMwOrigOpen, N._wvOrigOpen, N.open].some(f => typeof f === "function" && /stands in for a window of its own/.test(String(f)));
            if (!wvT.nativeWindows() || !rule) this.skip();
        });
        async function openTab() {
            await win.ZoteroPane.openNote(note.id, { openInWindow: false });
            await wvT.waitFor(() => noteTab(win) && ZT.selectedID === noteTab(win).id, 15000, 100);
            await sleep(900);
            assert.ok(noteTab(win) && ZT.selectedID === noteTab(win).id, "fixture: the note's tab selected");
            assert.isAtLeast(ZT._tabs.filter(Boolean).length, 2, "fixture: the window has other tabs");
        }

        it("from the note's own tab: the tab moves to a new window of its own, as Move to New Window", async function () {
            await openTab();
            const before = mainWins();
            try {
                // What the note editor's More > Edit in a Separate Window calls.
                win.ZoteroPane.openNoteWindow(note.id);
                const nw = await wvT.waitFor(() => mainWins().find(w => !before.includes(w) && noteTab(w)), 20000, 100);
                assert.ok(nw, "a new window holding the note's tab");
                await sleep(800);
                assert.notOk(noteTab(win), "the tab left the first window");
            }
            finally { await closeNew(before); }
        });

        it("from elsewhere (the library selected, the note's tab open): Zotero's own -- its tab selected, no window", async function () {
            await openTab();
            ZT.select(libTab().id); await sleep(600);
            const before = mainWins();
            try {
                await win.ZoteroPane.openNoteWindow(note.id);
                await sleep(2500);
                assert.strictEqual(mainWins().length, before.length, "no window");
                assert.ok(noteTab(win) && ZT.selectedID === noteTab(win).id, "Zotero selected the note's tab");
            }
            finally { await closeNew(before); }
        });

        it("torn down, Zotero only selects the tab (tripwire: fails once Zotero fixes it -- retire WV-TEMP-134831)", async function () {
            await openTab();
            wv._wvTeardownNoteWindowFix();
            const before = mainWins();
            try {
                await win.ZoteroPane.openNoteWindow(note.id);
                await sleep(3000);
                assert.strictEqual(mainWins().length, before.length,
                    "Zotero opened no window (if it did, Zotero fixed it: retire WV-TEMP-134831)");
                assert.ok(noteTab(win), "the tab still here");
            }
            finally {
                wv._wvWireNoteWindowFix(win);
                await closeNew(before);
            }
        });
    });

    // Forum 132551 (MJT), register #1: expanding or collapsing rows in the items list
    // left "N items in this view" at the old number (stock 11.0-beta.4 in Troubleshooting
    // Mode, 2026-11-19; 10.0.8's source has no redraw either). Driven through the items
    // view's own entry points: toggleOpenState is what a twisty click and the arrow keys
    // call, expandAllRows / collapseAllRows what `+` / `-` call (itemTree handleKeyDown).
    // Nothing selected, the count read from Zotero's own message. The items-list filter
    // feature is switched OFF where it matters: its tree observer redrew the count by
    // accident (filter.ts clear path), which hid the bug before this stand-in.
    describe("WV-TEMP-132551: an expand or collapse with nothing selected redraws the item count", function () {
        const FILTER = "weavero.enableItemsTreeFilter";
        let parent = null, ZP = null;
        const iv = () => ZP.itemsView;
        const el = (id) => { const lv = ZP.libraryView; return (lv && typeof lv.getElement === "function" && lv.getElement(id)) || win.document.getElementById(id); };
        /** The number "N items in this view" shows (null when another message is up). */
        const shown = () => {
            const box = el("zotero-item-pane-message-box");
            const d = box && box.firstElementChild;
            if (!d || d.getAttribute("data-l10n-id") !== "item-pane-message-unselected") return null;
            try { return JSON.parse(d.getAttribute("data-l10n-args")).count; } catch (er) { return null; }
        };
        const rowOf = (it) => { for (let i = 0; i < iv().rowCount; i++) { const r = iv().getRow(i); if (r && r.ref && r.ref.id === it.id) return i; } return -1; };
        /** Nothing selected, the paper closed, the count drawn afresh: its value. */
        async function settle() {
            iv().selection.clearSelection();
            await sleep(200);
            const i = rowOf(parent);
            assert.isAbove(i, -1, "fixture: the paper's row");
            if (iv().isContainerOpen(i)) { iv().toggleOpenState(i); await sleep(300); }
            await ZP.itemSelected();
            const ok = await wvT.waitFor(() => (shown() !== null && shown() === iv().objectRowCount) || null, 5000, 50);
            assert.ok(ok, "fixture: the count drawn, shown " + shown() + " of " + iv().objectRowCount);
            return iv().objectRowCount;
        }
        /** Wait for the message to show the live count. */
        const follows = async () => !!(await wvT.waitFor(() => (shown() === iv().objectRowCount) || null, 3000, 50));

        before(async function () {
            ZP = win.ZoteroPane;
            parent = await wvT.createItem("book", { title: "WV-132551 paper with two notes" });
            for (const n of [1, 2]) {
                const c = new Zotero.Item("note");
                c.parentID = parent.id;
                c.setNote("<p>WV-132551 child note " + n + "</p>");
                await c.saveTx();
            }
            ZT.select(libTab().id); await sleep(600);
            await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await sleep(800);
        });
        after(async function () {
            // The filter feature came back with its manual-expand layer outermost: wire
            // the stand-in again so the layers are in their start order.
            try { wv._wvTeardownRowCountFix(); for (const w of mainWins()) wv._wvWireRowCountFix(w); } catch (er) {}
            if (parent) await wvT.erase(parent);
        });

        it("the filter feature off: a twisty's toggle, `-` and `+` each redraw the count", async function () {
            await wvT.withPref(FILTER, false, async () => {
                const n0 = await settle();
                iv().toggleOpenState(rowOf(parent));
                assert.strictEqual(iv().objectRowCount, n0 + 2, "fixture: the paper opened on its two notes");
                assert.isTrue(await follows(), "expanded: the count follows, shown " + shown() + " of " + iv().objectRowCount);
                const open = iv().objectRowCount;
                iv().collapseAllRows();
                assert.isBelow(iv().objectRowCount, open, "fixture: `-` closed rows");
                assert.isTrue(await follows(), "`-`: the count follows, shown " + shown() + " of " + iv().objectRowCount);
                const closed = iv().objectRowCount;
                iv().expandAllRows();
                assert.isAbove(iv().objectRowCount, closed, "fixture: `+` opened rows");
                assert.isTrue(await follows(), "`+`: the count follows, shown " + shown() + " of " + iv().objectRowCount);
            });
        });

        it("as shipped (the filter feature on, no filter applied): an expand redraws the count", async function () {
            await wvT.withPref(FILTER, true, async () => {
                const n0 = await settle();
                iv().toggleOpenState(rowOf(parent));
                assert.strictEqual(iv().objectRowCount, n0 + 2, "fixture: the paper opened on its two notes");
                assert.isTrue(await follows(), "the count follows, shown " + shown() + " of " + iv().objectRowCount);
            });
        });

        it("torn down, the filter feature off: an expand leaves the count stale (tripwire: fails once Zotero fixes it -- retire WV-TEMP-132551)", async function () {
            await wvT.withPref(FILTER, false, async () => {
                wv._wvTeardownRowCountFix();
                try {
                    const n0 = await settle();
                    iv().toggleOpenState(rowOf(parent));
                    assert.strictEqual(iv().objectRowCount, n0 + 2, "fixture: the paper opened on its two notes");
                    await sleep(1500);
                    assert.strictEqual(shown(), n0, "still the old count, " + shown() + " of " + iv().objectRowCount
                        + " (if it follows, Zotero redraws on an expand: retire WV-TEMP-132551)");
                }
                finally { for (const w of mainWins()) { try { wv._wvWireRowCountFix(w); } catch (er) {} } }
            });
        });
    });

    // Not posted yet (MJT 2026-11-22 "Ok" to a forum report): a feed item's abstract blank
    // after the item pane's sections moved (a plugin adding or removing a section, or a drag
    // in the side navigation). Zotero's Abstract section keeps a reference to its abstract
    // browser across the move, the browser is gone, and no new one is made.
    describe("WV-TEMP-feedabstract: a feed abstract shows after the item pane's sections moved", function () {
        let feed = null, A = null, B = null, order0 = null;
        const det = () => {
            let d = null;
            try { const lv = /** @type {any} */ (win.ZoteroPane).libraryView; if (lv) d = lv.querySelector("item-details"); } catch (er) {}
            return /** @type {any} */ (d || win.document.querySelector("#zotero-item-pane item-details"));
        };
        const box = () => /** @type {any} */ (det().querySelector("abstract-box"));
        const shown = () => { const b = box() && box().querySelector('browser[messagemanagergroup="feedAbstract"]'); return !!(b && b.isConnected && b.browsingContext); };
        async function feedItem(title) {
            const it = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
            it.libraryID = feed.libraryID;
            it.guid = "wv-feedabs-" + Zotero.Utilities.randomString();
            it.setField("title", title);
            it.setField("abstractNote", "<div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"abstract\"><p>" + title + ": the abstract.</p></div>");
            await it.saveTx();
            return it;
        }
        async function select(it) {
            await win.ZoteroPane.selectItem(it.id);
            await sleep(300);
        }
        /** Zotero's own reorder, as a drag in the side navigation: the Abstract down and back. */
        async function move() {
            const d = det();
            const ids = d.getPanes().map(e => e.dataset.pane);
            const i = ids.indexOf("abstract");
            try { await d.changePaneOrder("abstract", Math.min(i + 3, ids.length)); } catch (er) {}
            try { await d.changePaneOrder("abstract", i); } catch (er) {}
        }

        before(async function () {
            feed = /** @type {any} */ (new Zotero.Feed());
            feed.name = "WV-TEST feed abstract";
            feed.url = "https://wv-feedabs-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
            feed.refreshInterval = 24 * 60; feed.cleanupReadAfter = 60; feed.cleanupUnreadAfter = 90;
            await feed.saveTx();
            A = await feedItem("WV feed abstract A");
            B = await feedItem("WV feed abstract B");
            ZT.select(libTab().id); await sleep(500);
            const cv = win.ZoteroPane.collectionsView;
            assert.ok(await wvT.waitFor(() => cv.getRowIndexByID("L" + feed.libraryID) !== false, 15000, 100), "fixture: the feed's row");
            await cv.selectByID("L" + feed.libraryID);
            await win.ZoteroPane.itemsView.waitForLoad();
            order0 = det().getPanes().map(e => e.dataset.pane);
            await select(A);
            assert.ok(await wvT.waitFor(() => shown() || null, 10000, 100), "fixture: Zotero draws A's abstract");
        });

        after(async function () {
            try { wv._wvWireFeedAbstractFix(win); } catch (er) {}
            try { const b = box(); if (b && b._feedAbstractBrowser && !b._feedAbstractBrowser.isConnected) b._feedAbstractBrowser = null; } catch (er) {}
            try {
                const d = det(), now = d.getPanes().map(e => e.dataset.pane);
                if (order0 && now.indexOf("abstract") !== order0.indexOf("abstract")) await d.changePaneOrder("abstract", order0.indexOf("abstract"));
            } catch (er) {}
            try { await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID); } catch (er) {}
            try { if (feed) await feed.eraseTx(); } catch (er) {}
        });

        it("the sections move, the next feed item's abstract still shows", async function () {
            // CI only, macOS with Zotero 11 (1.2.1 release CI run 45200266733, both
            // attempts): B's abstract was not drawn after the move -- the stand-in
            // does not take effect on GitHub's macOS beta runner, while the tripwire
            // below (Zotero still blanks it) passes there. No regression (the same
            // blank abstract as without Weavero); Windows and Ubuntu CI and local
            // runs pass. MJT 2026-11-23: "Go" (skip and follow up, work/TODO.md).
            if (Services.env.exists("CI") && Zotero.isMac && /^11\./.test(Zotero.version)) this.skip();
            await move();
            await select(B);
            assert.ok(await wvT.waitFor(() => shown() || null, 10000, 100), "B's abstract drawn after the move");
            await select(A);
            assert.ok(await wvT.waitFor(() => shown() || null, 10000, 100), "and A's again");
        });

        it("torn down, the abstract stays blank after a move (tripwire: fails once Zotero fixes it -- retire WV-TEMP-feedabstract)", async function () {
            wv._wvTeardownFeedAbstractFix();
            try {
                await move();
                await select(B);
                await sleep(2500);
                assert.isFalse(shown(), "no abstract after the move (if it shows, Zotero lets go of the dead browser now: retire WV-TEMP-feedabstract)");
            }
            finally {
                wv._wvWireFeedAbstractFix(win);
                const b = box();
                try { if (b && b._feedAbstractBrowser && !b._feedAbstractBrowser.isConnected) b._feedAbstractBrowser = null; } catch (er) {}
            }
        });
    });

    // MJT 2026-11-22 (forum thread to come; upstream register #72): on the Feeds row, a
    // quick search and then the Advanced Search button in the search field opened the
    // Advanced Search with no Collapse or Close button -- the search field stayed, with its
    // text, and "libraryID not provided" went to the Error Console (stock 11.0-beta.5 and
    // 10.0.8 with no add-on, D:/tmp/wv-scripts/advsrch-probe.py). Driven as a user does it:
    // the word typed into the quick search (setUserInput, a trusted input event: the
    // field's own timer runs the search), then the Advanced Search button, Collapse and
    // Close clicked (XUL click() from chrome: a trusted command event to each button's own
    // handler).
    describe("WV-TEMP-advsrchcollapse: the Advanced Search opened from a quick search on Feeds can be collapsed", function () {
        const WORD = "wvadvseed";
        const COLLAPSE = "weavero.collapseAdvancedToQuickSearch";
        const Ci = Components.interfaces;
        let ZP = null, feeds = [], hit = null, miss = [];
        const view = () => ZP.libraryView || null;
        const el = (id) => { const lv = view(); return (lv && typeof lv.getElement === "function" && lv.getElement(id)) || win.document.getElementById(id); };
        const qs = () => /** @type {any} */ (el("zotero-tb-search"));
        const deck = () => /** @type {any} */ (el("zotero-advanced-search-pane-deck"));
        const bar = () => (qs().deck.selectedIndex === 0 ? "the search field" : "the Advanced Search indicator");
        const conds = () => { try { return JSON.stringify(deck().pane.search.toJSON().conditions.map(c => c.condition + " " + c.operator + " " + (c.value || ""))); } catch (er) { return "?"; } };
        const listed = (it) => ZP.itemsView.getRowIndexByID(it.id) !== false;
        const onlyHit = () => listed(hit) && miss.every(it => !listed(it));
        const state = () => "pane " + deck().state + ", " + bar() + ", field \"" + qs().value + "\", conditions " + conds();
        const paneProto = () => { const C = win.customElements.get("advanced-search-pane"); return C && C.prototype; };
        async function feedWith(name, titles) {
            const f = /** @type {any} */ (new Zotero.Feed());
            f.name = name;
            f.url = "https://wv-advseed-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
            f.refreshInterval = 24 * 60; f.cleanupReadAfter = 60; f.cleanupUnreadAfter = 90;
            await f.saveTx();
            feeds.push(f);
            const out = [];
            for (const t of titles) {
                const it = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
                it.libraryID = f.libraryID;
                it.guid = "wv-advseed-" + Zotero.Utilities.randomString();
                it.setField("title", t);
                await it.saveTx();
                out.push(it);
            }
            return out;
        }
        /** Whatever is open closed, the quick search empty, the Feeds row selected. */
        async function feedsRow() {
            try { if (deck().state !== "closed") await (view() || ZP).setAdvancedSearchState("closed"); } catch (er) {}
            try { if (qs().value) { qs().value = ""; await (view() || ZP).search(); } } catch (er) {}
            ZT.select(libTab().id); await sleep(300);
            const cv = ZP.collectionsView;
            assert.ok(await wvT.waitFor(() => cv.getRowIndexByID("F1") !== false || null, 15000, 100), "fixture: the Feeds row");
            await cv.selectByID("F1");
            await ZP.itemsView.waitForLoad();
            assert.ok(await wvT.waitFor(() => (listed(hit) && miss.every(listed)) || null, 10000, 100), "fixture: the Feeds row lists the three feed items");
        }
        /** The quick search WORD typed, then the Advanced Search button; the errors it logged. */
        async function openFromQuickSearch() {
            await feedsRow();
            const field = qs().searchTextbox.inputField;
            field.focus();
            field.setUserInput(WORD);
            assert.ok(await wvT.waitFor(() => onlyHit() || null, 10000, 100), "fixture: the quick search ran, one feed item left");
            const errs = [];
            const obs = { observe(m) { try { if (m instanceof Ci.nsIScriptError && /libraryID not provided/.test(m.errorMessage)) errs.push(m.errorMessage); } catch (er) {} } };
            Services.console.registerListener(obs);
            try {
                qs().querySelector("#zotero-tb-search-advanced-button").click();
                await wvT.waitFor(() => (deck().state === "open") || null, 10000, 100);
                await sleep(1500);
            }
            finally { Services.console.unregisterListener(obs); }
            return errs;
        }

        before(async function () {
            ZP = win.ZoteroPane;
            if (!paneProto()) this.skip();   // version: Zotero 9 has no Advanced Search in the items pane
            [hit, ...miss] = await feedWith("WV-TEST advanced search A", [WORD + " paper", "Another paper A"]);
            miss = miss.concat(await feedWith("WV-TEST advanced search B", ["Another paper B"]));
        });
        after(async function () {
            try { if (deck().state !== "closed") await (view() || ZP).setAdvancedSearchState("closed"); } catch (er) {}
            try { if (qs().value) { qs().value = ""; await (view() || ZP).search(); } } catch (er) {}
            try { for (const w of mainWins()) wv._wvWireAdvSearchSeedFix(w); } catch (er) {}
            try { await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID); } catch (er) {}
            for (const f of feeds) { try { await f.eraseTx(); } catch (er) {} }
        });

        it("the gate: installed on this Zotero, and nothing for a pane that takes a search with no library", async function () {
            const cur = /** @type {any} */ (Object.getOwnPropertyDescriptor(paneProto(), "search"));
            assert.ok(cur && cur.set && cur.set._wvAdvSeedNative,
                "the stand-in's setter is on the window's advanced-search-pane class (if not, its gate found Zotero's fix: retire WV-TEMP-advsrchcollapse)");
            assert.isTrue(wv._wvAdvSearchSeedBugIn(win, cur.set._wvAdvSeedNative.set),
                "Zotero's own setter still refuses a search with no library (if not, Zotero fixed it: retire WV-TEMP-advsrchcollapse)");
            assert.isFalse(wv._wvAdvSearchSeedBugIn(win, function (s) { this._search = s; }), "a setter that takes it: nothing installed");
        });

        it("Zotero's own Collapse and Close: the indicator holds them, the seeded search runs across the feeds", async function () {
            await wvT.withPref(COLLAPSE, false, async () => {
                const errs = await openFromQuickSearch();
                assert.deepEqual(errs, [], "no \"libraryID not provided\"");
                assert.strictEqual(bar(), "the Advanced Search indicator", "the bar: " + state());
                assert.strictEqual(qs().value, "", "the quick search text moved into the Advanced Search");
                assert.include(conds(), WORD, "the search seeded with the quick search");
                assert.isTrue(!!deck().pane.active, "and run");
                assert.ok(await wvT.waitFor(() => onlyHit() || null, 10000, 100), "the list: the one feed item matching");
                qs().querySelector(".advanced-collapse-button").click();
                assert.ok(await wvT.waitFor(() => (deck().state === "collapsed") || null, 10000, 100), "Collapse collapses: " + state());
                assert.strictEqual(bar(), "the Advanced Search indicator", "collapsed: the indicator stays, with Expand and Close");
                assert.isTrue(onlyHit(), "collapsed: the search still applies");
                qs().querySelector(".advanced-close-button").click();
                assert.ok(await wvT.waitFor(() => (deck().state === "closed") || null, 10000, 100), "Close closes: " + state());
                assert.strictEqual(bar(), "the search field", "closed: the search field is back");
                assert.ok(await wvT.waitFor(() => (listed(hit) && miss.every(listed)) || null, 10000, 100), "closed: every feed item listed again");
            });
        });

        it("as shipped (Weavero's collapse back to the quick search on): Collapse gives the quick search back", async function () {
            await wvT.withPref("weavero.enableFilters", true, async () => {
                await wvT.withPref(COLLAPSE, true, async () => {
                    await openFromQuickSearch();
                    assert.strictEqual(bar(), "the Advanced Search indicator", "the bar: " + state());
                    qs().querySelector(".advanced-collapse-button").click();
                    assert.ok(await wvT.waitFor(() => (deck().state === "closed" && qs().value === WORD) || null, 10000, 100), "back to the quick search: " + state());
                    assert.ok(await wvT.waitFor(() => onlyHit() || null, 10000, 100), "the list: the one feed item matching");
                });
            });
        });

        it("torn down, the search field stays and Collapse and Close are out of reach (tripwire: fails once Zotero fixes it -- retire WV-TEMP-advsrchcollapse)", async function () {
            wv._wvTeardownAdvSearchSeedFix();
            try {
                await wvT.withPref(COLLAPSE, false, async () => {
                    const errs = await openFromQuickSearch();
                    assert.strictEqual(deck().state, "open", "the Advanced Search shown");
                    assert.strictEqual(bar(), "the search field",
                        "no indicator, so no Collapse or Close (if it shows, Zotero fixed it: retire WV-TEMP-advsrchcollapse): " + state());
                    assert.strictEqual(qs().value, WORD, "the field keeps its text");
                    assert.isAbove(errs.length, 0, "\"libraryID not provided\" logged");
                });
            }
            finally {
                for (const w of mainWins()) { try { wv._wvWireAdvSearchSeedFix(w); } catch (er) {} }
            }
        });
    });

    // Found by Weavero's own suite (2026-11-24, merge agent): Zotero 10 CRASHED (WER APPCRASH,
    // xul.dll+0x19f329d) when a main window closed while its items list loaded over an empty
    // My Library -- _updateIntroText() awaits hasItems(), then writes "Welcome to Zotero!" into
    // the closed window's document. Weavero gives Zotero 10 several main windows, hence the
    // stand-in. The crash case runs the method on a CLOSED window: on unfixed code Zotero dies
    // (the merge agent's probe, D:/tmp/zz-wvprobe-intro.spec.js, crashed within seconds).
    describe("WV-TEMP-INTROCRASH: no intro text is written into a closed main window (Zotero 10)", function () {
        const z10 = () => parseInt(String(Zotero.version), 10) <= 10;
        const protoOf = (w) => { try { return w.require("zotero/collectionViewItemTree").prototype; } catch (e) { return null; } };
        const emptyLib = async () => !Zotero.Groups.getAll().length && !(await Zotero.Libraries.userLibrary.hasItems());

        it("is wired on Zotero 10 and older only", function () {
            const proto = protoOf(win);
            assert.isOk(proto, "the main window's items-list class");
            const wired = !!(Object.prototype.hasOwnProperty.call(proto, "_wvWraps") && proto._wvWraps && proto._wvWraps._updateIntroText);
            assert.equal(wired, z10(), "wrapped on " + Zotero.version + ": " + wired);
        });

        it("a window closed while its list loads gets no intro text, and Zotero stays up", async function () {
            if (!z10()) this.skip();
            if (!(await emptyLib())) this.skip();   // the intro shows only for an empty My Library with no groups
            const s = wv._wvSpawnMainWindowStart(undefined, { restore: true });
            const w = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win, dropOnTimeout: true });
            assert.isOk(w, "a second main window");
            // The new window restores the last view: put it on My Library, the one view whose
            // intro takes the await.
            await w.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            const iv = await wvT.waitFor(() => (w.ZoteroPane && w.ZoteroPane.itemsView) || null, 10000);
            await iv.waitForLoad();
            await wvT.waitFor(() => iv._introText === true || null, 8000, "the intro shown in the open window first");
            w._wvSavedParkClose = true;
            w.close();
            await wvT.waitFor(() => (w.closed && mainWins().length === 1) || null, 8000);
            let err = null;
            try { await iv._updateIntroText(); } catch (e) { err = e; }
            assert.isNull(err, "the method ends quietly: " + err);
            assert.isTrue(iv._introText === true, "nothing written after the await: the intro state is still the open window's (" + iv._introText + ")");
            assert.isTrue(await Zotero.Libraries.userLibrary.hasItems() === false, "Zotero still answers after the call");
        });

        it("an open window still gets its intro text", async function () {
            if (!z10()) this.skip();
            if (!(await emptyLib())) this.skip();
            await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            const iv = win.ZoteroPane.itemsView;
            await iv.waitForLoad();
            iv._introText = false;
            await iv._updateIntroText();
            assert.isTrue(iv._introText === true, "the intro set by Zotero's own code (" + iv._introText + ")");
        });

        it("Zotero 10's method still awaits hasItems() and then writes in the document taken before (tripwire: fails once Zotero checks the window -- retire WV-TEMP-INTROCRASH)", function () {
            if (!z10()) this.skip();
            const proto = protoOf(win);
            const own = Object.prototype.hasOwnProperty.call(proto, "_wvWraps") && proto._wvWraps && proto._wvWraps._updateIntroText;
            const src = String(own ? own.native : proto._updateIntroText);
            assert.match(src, /this\._ownerDocument[\s\S]{0,600}await\s+this\.collectionTreeRows\[0\]\.ref\.hasItems\(\)[\s\S]{0,400}createElement/, "the await between the document and its use");
            assert.notMatch(src, /\.closed\b/, "no check of the window after the await (if there is one now: retire WV-TEMP-INTROCRASH)");
        });
    });
});
