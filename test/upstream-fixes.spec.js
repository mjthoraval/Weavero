/* global describe, it, before, after, assert, Zotero, wvT, Services */
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
        for (const m of ["_wvWireNoteWindowFix", "_wvTeardownNoteWindowFix", "_wvNoteWindowFromTab", "_wvWireCtxHeaderFix", "_wvTeardownCtxHeaderFix", "_wvWireNarrowPaneFix", "_wvTeardownNarrowPaneFix", "_wvWireReaderMenuFix", "_wvTeardownReaderMenuFix", "_wvWireAddSelectFix", "_wvTeardownAddSelectFix"]) {
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
});
