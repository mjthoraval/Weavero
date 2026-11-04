/* global describe, it, before, after, assert, Zotero, wvT */

// Clickable counts in the Tags, Related and Backlinks columns (MJT
// 2026-10-22, "Can you make the numbers in the columns clickable?"; design
// picked: a popup listing exactly what was counted, grouped by where each
// entry sits). The popup must agree with the number the column shows: own
// entries for an open row, the whole subtree for a collapsed one, the
// manual and the automatic tag numbers each their own list. Written before
// the code (feature skill, check first).

describe("Weavero — clickable column counts open a popup of what was counted", function () {
    this.timeout(90000);
    let wv, win, doc, ZP, iv, rp, lib;
    let P, R1, R2, R3, C, A, N, S;
    const made = [];
    const PANEL = "weavero-panel";

    const mkAnn = async (att, i, patch) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = "highlight";
        a.annotationText = "count fixture " + i;
        a.annotationColor = "#ffd400";
        a.annotationComment = patch.comment || "";
        a.annotationPageLabel = "3";
        a.annotationSortIndex = "00000|00000" + i + "|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: 2, rects: [[10, 10, 60, 20]] });
        for (const t of patch.tags || []) a.addTag(t);
        await a.saveTx();
        return a;
    };
    const relate = async (a, b) => { a.addRelatedItem(b); await a.saveTx(); b.addRelatedItem(a); await b.saveTx(); };
    const panel = () => /** @type {any} */ (doc && doc.getElementById(PANEL));
    const closePanel = () => { const p = panel(); if (p) { try { p.style.display = "none"; } catch (e) {} } };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvCountEntries", "_wvOpenCountPopup", "_wvCountSpan", "_wvCountOnPress", "_wvCountOnRelease"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane; iv = ZP.itemsView; rp = iv.rowProvider;
        lib = Zotero.Libraries.userLibraryID;
        P = await wvT.createItem("journalArticle", { title: "WVCNT parent" });
        P.addTag("m1"); P.addTag("a1", 1); await P.saveTx();
        R1 = await wvT.createItem("book", { title: "WVCNT related one" });
        R2 = await wvT.createItem("book", { title: "WVCNT related two" });
        R3 = await wvT.createItem("book", { title: "WVCNT related three" });
        C = new Zotero.Item("note"); C.libraryID = lib; C.parentID = P.id; C.setNote("<p>WVCNT child note</p>"); C.addTag("m2"); await C.saveTx();
        A = await wvT.createTestPDFItem("wvcnt-a", { parentItemID: P.id });
        N = await mkAnn(A, 1, { tags: ["m3"] });
        await relate(P, R1);
        await relate(C, R2);
        await relate(N, R3);
        S = new Zotero.Item("note"); S.libraryID = lib;
        S.setNote("<p>WVCNT source zotero://select/library/items/" + P.key + " and zotero://open/library/items/" + A.key + "?annotation=" + N.key + "</p>");
        await S.saveTx();
        made.push(P, R1, R2, R3, S);
        await wv._wvBlEnsure();
        await ZP.collectionsView.selectLibrary(lib);
        await iv.waitForLoad();
    });

    after(async function () {
        closePanel();
        try { wv._clearAllFilters(); } catch (e) {}
        await wvT.erase(...made);
    });

    it("the entries behind each number: own for an open row, the subtree for a collapsed one", function () {
        const sub = (k) => wv._wvCountEntries(k, P, "subtree");
        const own = (k) => wv._wvCountEntries(k, P, "own");
        assert.strictEqual(sub("tags-manual").total, 3, "m1 on the item, m2 on the note, m3 on the annotation");
        assert.strictEqual(sub("tags-auto").total, 1, "a1");
        assert.strictEqual(own("tags-manual").total, 1);
        assert.strictEqual(sub("related").total, 3, "R1 on the item, R2 on the note, R3 on the annotation");
        assert.strictEqual(own("related").total, 1);
        assert.strictEqual(sub("backlinks").total, 2, "S links the item and its annotation");
        assert.strictEqual(own("backlinks").total, 1, "own: S's link to the item itself (2026-10-23, the Tags / Related convention)");
        // Links (slice 2, 2026-10-27): the references the row's notes and
        // annotations carry. P's carry none; S, a standalone note, two.
        assert.strictEqual(sub("links").total, 0, "P's note and annotation reference nothing");
        const sLinks = wv._wvCountEntries("links", S, "own");
        assert.strictEqual(sLinks.total, 2, "S's two references, to the item and to its annotation");
        assert.strictEqual(sLinks.groups.length, 1, "one group: the note itself");
        assert.strictEqual(sLinks.groups[0].source.id, S.id);
        const groups = sub("related").groups;
        assert.strictEqual(groups.length, 3, "grouped by where each entry sits");
        assert.deepEqual(groups.map(g => g.source.id).sort((a, b) => a - b), [P.id, C.id, N.id].sort((a, b) => a - b));
        assert.strictEqual(groups[0].source.id, P.id, "the item's own entries come first");
    });

    it("a number becomes a link only when it is not zero, carrying its kind, item and scope", function () {
        const s = wv._wvCountSpan(doc, 3, "related", P.id, "subtree");
        assert.isOk(s && s.classList.contains("wv-col-count"));
        assert.strictEqual(s.textContent, "3");
        assert.strictEqual(s.dataset.wvCount, "related");
        assert.strictEqual(s.dataset.wvItem, String(P.id));
        assert.strictEqual(s.dataset.wvScope, "subtree");
        assert.isNull(wv._wvCountSpan(doc, 0, "related", P.id, "subtree"), "zero stays blank");
    });

    it("the real column cells draw their numbers as links (collapsed row: the subtree)", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        const col = (suffix) => cols.find((c) => new RegExp(suffix + "$").test(String(c.dataKey)));
        const idx = rp.getRowIndexByID(P.id);
        assert.isAtLeast(idx, 0, "the parent row is in the view");
        if (iv.isContainerOpen(idx)) iv.toggleOpenState(idx);
        const cellOf = (suffix) => { const c = col(suffix); assert.isOk(c, suffix + " column registered"); return c.renderCell(idx, c.dataProvider(P), c, false, doc); };
        const links = (cell) => [...cell.querySelectorAll(".wv-col-count")].map((s) => s.dataset.wvCount + "=" + s.textContent + "@" + s.dataset.wvScope);
        assert.deepEqual(links(cellOf("weaveroRelated")), ["related=3@subtree"]);
        assert.deepEqual(links(cellOf("weaveroBacklinks")), ["backlinks=2@subtree"]);
        const sIdx = rp.getRowIndexByID(S.id);
        assert.isAtLeast(sIdx, 0, "the standalone note's row is in the view");
        const lk = col("weaveroLinks");
        assert.isOk(lk, "weaveroLinks column registered");
        assert.deepEqual(links(lk.renderCell(sIdx, lk.dataProvider(S), lk, false, doc)), ["links=2@subtree"], "the note's two references");
        assert.deepEqual(links(cellOf("weaveroLinks")), [], "P's rows carry no references: blank");
        const tags = links(cellOf("weaveroTags"));
        assert.include(tags, "tags-manual=3@subtree");
        if (wv._getEnableTagsCountAuto()) assert.include(tags, "tags-auto=1@subtree");
    });

    // MJT 2026-10-23: "I cannot resize columns here" -> "relax the fix width
    // constrain on count columns". A fixedWidth column is never resized and
    // stops the resizer when every column after a border is fixed
    // (virtualized-table.jsx _getResizeColumns); Zotero's own Notes count
    // column is staticWidth + minWidth, resizable.
    it("the count columns are resizable like Zotero's Notes column", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        for (const suffix of ["weaveroAnnotations", "weaveroTags", "weaveroRelated", "weaveroBacklinks", "weaveroLinks"]) {
            const c = cols.find((x) => new RegExp(suffix + "$").test(String(x.dataKey)));
            if (!c) continue;   // a column switched off in Settings
            assert.isNotOk(c.fixedWidth, suffix + " is not fixed-width");
            assert.isTrue(!!c.staticWidth, suffix + " keeps its width when the pane resizes");
            // MJT 2026-10-23, "The ellipsis has disappeared": at Zotero's
            // 26 px a cut number showed no "…" (Gecko keeps the first
            // character and drops an ellipsis that does not fit after it);
            // 34 px fits one bold digit + "…".
            assert.isAtLeast(Number(c.minWidth) || 0, 34, suffix + " leaves room for a digit and the ellipsis");
        }
    });

    // ---- Weavero's tooltip on a cut count cell ---------------------------
    // MJT 2026-10-23: "Hovering on an ellipsis should show the complete
    // content of that cell in a tooltip", "Can you keep the colors in the
    // tooltip?", and 2026-10-26 "Make sure this tooltip rule also works on the
    // counts in the items list" -- the rule of work/tooltip-conventions.md:
    // show after a 500 ms rest, hide on any move (7 device px of jitter
    // kept), and show AGAIN on every new rest (Gecko's own title tooltip is
    // one-shot per element); with weavero.tooltipPersist, stay while the
    // pointer stays on the cell.
    const cssColor = (v) => {
        const probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        probe.style.color = v;
        doc.documentElement.appendChild(probe);
        const col = win.getComputedStyle(probe).color;
        probe.remove();
        return col;
    };
    /** P's Tags cell ("3|1", collapsed row) fixed on screen. */
    const tagsCell = (style) => {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        const c = cols.find((x) => /weaveroTags$/.test(String(x.dataKey)));
        if (!c) return null;
        const idx = rp.getRowIndexByID(P.id);
        if (iv.isContainerOpen(idx)) iv.toggleOpenState(idx);
        const cell = c.renderCell(rp.getRowIndexByID(P.id), c.dataProvider(P), c, false, doc);
        cell.style.cssText = "display:block;position:fixed;left:40px;top:40px;z-index:2147483646;overflow:hidden;white-space:nowrap;padding:0;" + style;
        doc.documentElement.appendChild(cell);
        return cell;
    };
    const fullWidth = (cell) => { const r = doc.createRange(); r.selectNodeContents(cell); return r.getBoundingClientRect().width; };
    const tipShown = () => { const t = doc.getElementById("wv-count-tip"); return !!(t && t.style.display !== "none"); };
    const move = (x, y) => wv._wvCountTipMove(win, { clientX: x, clientY: y, target: doc.elementFromPoint(x, y) });
    const pointOn = (cell) => { const r = cell.querySelector(".wv-col-count").getBoundingClientRect(); return [Math.round(r.left + 2), Math.round(r.top + r.height / 2)]; };

    // MJT 2026-10-26: "What is the standard alignment for count columns?" ->
    // "Ok to fix": centred, as Zotero centres Notes and Attachments
    // (_item-tree.scss text-align: center). A cut number still starts at
    // the left edge, where its "…" needs it.
    it("the count cells are centred like Zotero's Notes column, and a cut one still starts at its left edge", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        for (const suffix of ["weaveroAnnotations", "weaveroTags", "weaveroRelated", "weaveroBacklinks"]) {
            const c = cols.find((x) => new RegExp(suffix + "$").test(String(x.dataKey)));
            if (!c) continue;   // a column switched off in Settings
            const cell = c.renderCell(rp.getRowIndexByID(P.id), c.dataProvider(P), c, false, doc);
            doc.documentElement.appendChild(cell);
            try { assert.strictEqual(win.getComputedStyle(cell).textAlign, "center", suffix + " centred"); }
            finally { cell.remove(); }
        }
        const cell = tagsCell("width:6px;");
        if (!cell) this.skip();
        try {
            const range = doc.createRange();
            range.selectNodeContents(cell);
            assert.closeTo(range.getBoundingClientRect().left, cell.getBoundingClientRect().left, 0.5, "a cut number starts at the left edge");
        }
        finally { cell.remove(); }
    });

    // Cut = the content runs past the content box, where Gecko draws the
    // "…": "1|1" cut by 1.3 px showed its "…" (scrollWidth 35 against
    // clientWidth 34) and a scrollWidth test missed it.
    it("a count cell is cut when its content passes its box, by a pixel too", function () {
        const cell = tagsCell("width:6px;");
        if (!cell) this.skip();
        try {
            assert.isTrue(wv._wvCountCellCut(cell), "6 px: cut");
            cell.style.width = "300px";
            assert.isFalse(wv._wvCountCellCut(cell), "shown in full");
            cell.style.width = (fullWidth(cell) - 1) + "px";
            assert.isTrue(wv._wvCountCellCut(cell), "a pixel short: cut");
        }
        finally { cell.remove(); }
    });

    it("a cut count cell gets Weavero's tooltip after a 500 ms rest, in the numbers' colours, and no title for Gecko", async function () {
        if (!wv._getEnableTagsCountAuto()) this.skip();
        const cell = tagsCell("width:6px;");
        if (!cell) this.skip();
        try {
            const [x, y] = pointOn(cell);
            assert.strictEqual(doc.elementFromPoint(x, y).closest(".wv-count-cell"), cell, "the point is on the cell");
            move(x, y);
            await wvT.sleep(250);
            assert.isFalse(tipShown(), "not before the rest");
            await wvT.sleep(450);
            assert.isTrue(tipShown(), "after 500 ms");
            const t = doc.getElementById("wv-count-tip");
            assert.deepEqual([...t.children].map((s) => s.textContent), ["3", "|", "1"], "the cell's numbers, bar included");
            const manual = t.querySelector(".wv-tags-count-manual");
            assert.strictEqual(win.getComputedStyle(manual).color, cssColor("var(--accent-blue)"), "the manual count blue");
            assert.strictEqual(win.getComputedStyle(manual).fontWeight, "600", "and bold");
            assert.isNull(t.querySelector(".wv-col-count"), "no link class: no hand, no underline");
            const b = t.getBoundingClientRect();
            assert.closeTo(b.left, x, 1, "at the pointer");
            assert.closeTo(b.top, y + 21, 1, "21 px below it, as Gecko's tooltip");
            cell.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
            assert.isNull(cell.getAttribute("title"), "no title: Gecko's one-shot tooltip never doubles it");
        }
        finally { wv._wvCountTipHide(win); cell.remove(); }
    });

    it("a wobble keeps the tooltip, a move hides it, and the next rest shows it again", async function () {
        const cell = tagsCell("width:6px;");
        if (!cell) this.skip();
        try {
            const [x, y] = pointOn(cell);
            move(x, y);
            await wvT.sleep(700);
            assert.isTrue(tipShown());
            move(x + 3 / (win.devicePixelRatio || 1), y);
            assert.isTrue(tipShown(), "3 device px: kept, as Gecko keeps its tooltip");
            move(x + 30, y);
            assert.isFalse(tipShown(), "a real move hides it at once");
            move(x, y);
            await wvT.sleep(700);
            assert.isTrue(tipShown(), "back on the cell and resting: shown again (Gecko's would not)");
        }
        finally { wv._wvCountTipHide(win); cell.remove(); }
    });

    it("a count cell shown in full gets no tooltip", async function () {
        const cell = tagsCell("width:300px;");
        if (!cell) this.skip();
        try {
            const [x, y] = pointOn(cell);
            move(x, y);
            await wvT.sleep(700);
            assert.isFalse(tipShown());
        }
        finally { wv._wvCountTipHide(win); cell.remove(); }
    });

    it("with weavero.tooltipPersist the tooltip stays while the pointer stays on the cell", async function () {
        const cell = tagsCell("");
        if (!cell) this.skip();
        cell.style.width = (fullWidth(cell) - 1) + "px";   // cut, and wide enough to move inside
        try {
            await wvT.withPref("weavero.tooltipPersist", true, async () => {
                const r = cell.getBoundingClientRect();
                const y = Math.round(r.top + r.height / 2);
                const x1 = Math.round(r.left + 2), x2 = Math.round(r.right - 3);
                assert.isAbove((x2 - x1) * (win.devicePixelRatio || 1), 7, "room to move past the jitter inside the cell");
                move(x1, y);
                await wvT.sleep(700);
                assert.isTrue(tipShown());
                move(x2, y);
                assert.isTrue(tipShown(), "moved inside the same cell: kept");
                move(x2 + 60, y);
                assert.isFalse(tipShown(), "left the cell: hidden");
            });
        }
        finally { wv._wvCountTipHide(win); cell.remove(); }
    });

    it("a click, a key or leaving the list hides the tooltip (wired per window)", async function () {
        const tree = /** @type {any} */ (doc.getElementById("zotero-items-tree"));
        assert.includeMembers(Object.keys(tree._wvListen || {}), ["countTip:pointermove", "countTip:pointerleave", "countTip:mousedown", "countTip:scroll"], "on the items tree");
        assert.includeMembers(Object.keys(/** @type {any} */ (win)._wvListen || {}), ["countTip:keydown", "countTip:blur"], "on the window");
        const cell = tagsCell("width:6px;");
        if (!cell) this.skip();
        try {
            const [x, y] = pointOn(cell);
            const show = async () => { move(x, y); await wvT.sleep(700); assert.isTrue(tipShown()); };
            await show();
            tree.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
            assert.isFalse(tipShown(), "a click");
            await show();
            win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "a" }));
            assert.isFalse(tipShown(), "a key");
            await show();
            tree.dispatchEvent(new win.PointerEvent("pointerleave"));
            assert.isFalse(tipShown(), "leaving the list");
        }
        finally { wv._wvCountTipHide(win); cell.remove(); }
    });

    // MJT 2026-10-23: "The hand appears on the number and on the right side
    // of the ellipsis, but not in between" -- the "|" and its margins took
    // the pointer between the manual and the automatic number.
    it("the hand runs without a break from the first number of a Tags cell to the last", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        const c = cols.find((x) => /weaveroTags$/.test(String(x.dataKey)));
        if (!c || !wv._getEnableTagsCountAuto()) this.skip();
        const idx = rp.getRowIndexByID(P.id);
        if (iv.isContainerOpen(idx)) iv.toggleOpenState(idx);
        const cell = c.renderCell(rp.getRowIndexByID(P.id), c.dataProvider(P), c, false, doc);
        cell.style.cssText = "display:block;position:fixed;left:0;top:0;z-index:2147483647;white-space:nowrap;padding:0;";
        doc.documentElement.appendChild(cell);
        try {
            const links = cell.querySelectorAll(".wv-col-count");
            assert.strictEqual(links.length, 2, "a manual and an automatic number (" + cell.textContent + ")");
            const first = links[0].getBoundingClientRect(), last = links[1].getBoundingClientRect();
            const y = first.top + first.height / 2;
            const dead = [];
            for (let x = Math.ceil(first.left); x < Math.floor(last.right); x++) {
                const e = /** @type {any} */ (doc.elementFromPoint(x, y));
                const l = e && e.closest && e.closest(".wv-col-count");
                if (!l || win.getComputedStyle(e).cursor !== "pointer") dead.push(x);
            }
            assert.deepEqual(dead, [], "every x between the numbers hits a number");
        }
        finally { cell.remove(); }
    });

    it("a count column saved narrower than its minimum comes back up to it", function () {
        const mgr = iv.tree._columns;
        const arr = mgr.getAsArray ? mgr.getAsArray() : mgr._columns;
        const col = arr.find((c) => /weaveroAnnotations$/.test(String(c.dataKey)));
        if (!col) this.skip();
        const was = col.width;
        try {
            col.width = 20;   // a pre-dev.24 drag could leave 26 or less
            wv._wvClampCountColumnWidths();
            assert.strictEqual(Number(col.width), Number(col.minWidth), "raised to the minimum");
        }
        finally { mgr.onResize({ [col.dataKey]: Math.max(Number(was) || 0, Number(col.minWidth)) }, true); }
    });

    it("an expanded row's numbers are the item's own, Backlinks included", async function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        const col = (suffix) => cols.find((c) => new RegExp(suffix + "$").test(String(c.dataKey)));
        const idx = rp.getRowIndexByID(P.id);
        assert.isAtLeast(idx, 0);
        const wasOpen = iv.isContainerOpen(idx);
        if (!wasOpen) await iv.toggleOpenState(idx);
        try {
            const i2 = rp.getRowIndexByID(P.id);
            const cellOf = (suffix) => { const c = col(suffix); return c.renderCell(i2, c.dataProvider(P), c, false, doc); };
            const links = (cell) => [...cell.querySelectorAll(".wv-col-count")].map((s) => s.dataset.wvCount + "=" + s.textContent + "@" + s.dataset.wvScope);
            assert.deepEqual(links(cellOf("weaveroRelated")), ["related=1@own"]);
            assert.deepEqual(links(cellOf("weaveroBacklinks")), ["backlinks=1@own"], "only S's link to the item itself; the annotation's is on its own row");
        }
        finally {
            const i3 = rp.getRowIndexByID(P.id);
            if (!wasOpen && iv.isContainerOpen(i3)) await iv.toggleOpenState(i3);
        }
    });

    it("the popup's header reads the number and lists every entry, grouped", async function () {
        closePanel();
        const anchor = doc.documentElement;
        wv._wvOpenCountPopup("related", P.id, { anchorNode: anchor, scope: "subtree", win });
        const p = panel();
        assert.isOk(p, "the shared Weavero popup");
        assert.strictEqual(p.style.display, "block");
        assert.match(p.querySelector(".wv-relations-header-title").textContent, /^3 Related$/);
        // The header chain in the Related column's colour (--accent-wood),
        // not the relations popup's amber (MJT 2026-10-23).
        const woodProbe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        woodProbe.style.color = "var(--accent-wood)";
        p.appendChild(woodProbe);
        const wood = win.getComputedStyle(woodProbe).color;
        woodProbe.remove();
        assert.strictEqual(win.getComputedStyle(p.querySelector(".wv-relations-header-icon")).color, wood, "the header's chain is the column's wood");
        assert.strictEqual(p.querySelectorAll(".wv-count-group").length, 3);
        assert.strictEqual(p.querySelectorAll(".wv-count-row").length, 3);
        // Each group's heading carries its share of the total (MJT
        // 2026-10-23): one related item on the parent, one on the note, one
        // on the annotation.
        assert.deepEqual([...p.querySelectorAll(".wv-count-group-head .wv-count-group-n")].map(n => n.textContent), ["1", "1", "1"]);
        // The same number again closes it (toggle on re-click).
        wv._wvOpenCountPopup("related", P.id, { anchorNode: anchor, scope: "subtree", win });
        assert.strictEqual(p.style.display, "none", "second click on the same number closes the popup");
        wv._wvOpenCountPopup("tags-auto", P.id, { anchorNode: anchor, scope: "subtree", win });
        assert.match(p.querySelector(".wv-relations-header-title").textContent, /^1 Automatic Tag$/);
        // MJT 2026-10-23: the header's tag in the Tags column's orange ("Wrong
        // tags icon color"); each row's tag as Zotero's Tags section draws
        // it ("should match Zotero native in the popup", _tagsBox.scss): an
        // automatic tag grey, a manual one blue, a coloured one its colour
        // with the filled icon.
        const colorOf = (v) => {
            const probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
            probe.style.color = v;
            p.appendChild(probe);
            const c = win.getComputedStyle(probe).color;
            probe.remove();
            return c;
        };
        // MJT 2026-10-26, on the "1 Automatic Tag" title's orange tag: "Not the
        // right color for automatic tags" -- grey, as Zotero draws them.
        assert.strictEqual(win.getComputedStyle(p.querySelector(".wv-relations-header-icon")).color, colorOf("var(--fill-secondary)"), "the automatic tags' header tag is grey");
        for (const ic of p.querySelectorAll(".wv-count-row .wv-rel-icon")) assert.strictEqual(win.getComputedStyle(ic).color, colorOf("var(--fill-secondary)"), "an automatic tag's icon is grey");
        await Zotero.Tags.setColor(lib, "m1", "#FF6666", 0);
        try {
            // MJT 2026-10-26: "This one also should change, when the 2 types
            // of tags are separated" / "adjust the name: it is not all tags".
            // Side by side, the manual tags' popup is "Manual Tags" in
            // Zotero's manual-tag blue; with one number, "Tags" in the
            // column's orange.
            const head = () => [p.querySelector(".wv-relations-header-title").textContent, win.getComputedStyle(p.querySelector(".wv-relations-header-icon")).color];
            for (const split of [true, false]) {
                wv._getEnableTagsCountAuto = () => split;   // own property over the prototype getter
                try {
                    p.style.display = "none";
                    wv._wvOpenCountPopup("tags-manual", P.id, { anchorNode: anchor, scope: "subtree", win });
                    assert.deepEqual(head(), split ? ["3 Manual Tags", colorOf("var(--accent-blue)")] : ["3 Tags", colorOf("var(--accent-orange)")],
                        split ? "two kinds side by side" : "one number");
                }
                finally { delete wv._getEnableTagsCountAuto; }
            }
            p.style.display = "none";
            wv._wvOpenCountPopup("tags-manual", P.id, { anchorNode: anchor, scope: "subtree", win });
            const rowOf = (t) => [...p.querySelectorAll(".wv-count-row")].find(r => r.querySelector(".wv-rel-title").textContent === t);
            const m1 = rowOf("m1").querySelector(".wv-rel-icon"), m2 = rowOf("m2").querySelector(".wv-rel-icon");
            assert.strictEqual(win.getComputedStyle(m1).color, colorOf("#FF6666"), "a coloured tag in its colour");
            assert.match(m1.getAttribute("src") || "", /tag-fill\.svg$|^data:/, "the filled icon");
            assert.strictEqual(win.getComputedStyle(m2).color, colorOf("var(--accent-blue)"), "a manual tag blue");
            // The icon must exist, not just be named right: dev.23 asked for
            // 16/universal/tag-fill.svg, which Zotero does not ship, and drew
            // a broken-image square (MJT 2026-10-23, "Problem for colored
            // tags"). A data: src means the chrome fetch already succeeded.
            for (const ic of [m1, m2]) {
                const src = ic.getAttribute("src") || "";
                let loads = src.startsWith("data:");
                if (!loads) { try { loads = (await fetch(src)).ok; } catch (e) { loads = false; } }
                assert.isTrue(loads, "the icon loads: " + src);
                // The Tags section's own 12-px drawing (_tagsBox.scss
                // icon-url('tag.svg')): the 16-px one shrunk to 12 px drew
                // 0.75-px lines that read darker (MJT 2026-10-26, "Not the
                // right color for automatic tags").
                const svg = src.startsWith("data:") ? decodeURIComponent(src.slice(src.indexOf(",") + 1)) : await (await fetch(src)).text();
                assert.include(svg, 'viewBox="0 0 12 12"', "the Tags section's 12-px drawing: " + src.slice(0, 60));
            }
            p.style.display = "none";
        }
        finally { await Zotero.Tags.setColor(lib, "m1", "", 0); }   // "" clears it (tags.js: if (!color))
        wv._wvOpenCountPopup("backlinks", P.id, { anchorNode: anchor, scope: "subtree", win });
        assert.match(p.querySelector(".wv-relations-header-title").textContent, /^2 Backlinks$/);
        assert.strictEqual(p.querySelectorAll(".wv-bl-row").length, 2, "backlink rows are the section's rows");
        wv._wvOpenCountPopup("backlinks", P.id, { anchorNode: anchor, scope: "own", win });
        assert.match(p.querySelector(".wv-relations-header-title").textContent, /^1 Backlink$/, "an expanded row's number lists the item's own");
        assert.strictEqual(p.querySelectorAll(".wv-bl-row").length, 1);
        closePanel();
    });

    // MJT 2026-11-02 (screenshot of a Backlinks popup: source trees, labels,
    // quotes and excerpts): "I find the display of links from a click on
    // count numbers in the count columns is too complex to read. Keep the
    // same format as in the item pane." A count popup draws its links as the
    // item pane's section does: a collapsed row's number as the widened
    // section -- "This item" and each part the links are aimed at under its
    // heading (Zotero's title for an annotation, its page in grey), its
    // share; each row its source's line, no excerpt (the card holds it); an
    // open row's number the item's own rows alone, under "This item" as the
    // section draws them since 2026-11-03 (no heading from dev.148). Only the
    // section reads the window's filter on its header's counts. (From
    // Backlinks part 2, 2026-10-28, to dev.147 the popups drew source trees
    // with labels, chips and excerpts.) FAILED on dev.147.
    it("a count popup draws its links as the item pane's section does", function () {
        const anchor = doc.documentElement;
        closePanel();
        wv._wvOpenCountPopup("backlinks", P.id, { anchorNode: anchor, scope: "subtree", win });
        const p = panel();
        assert.match(p.querySelector(".wv-relations-header-title").textContent, /^2 Backlinks$/);
        const heads = [...p.querySelectorAll(".wv-bl-hgroup > .wv-count-group-head")];
        assert.deepEqual(heads.map(h => h.querySelector(".wv-count-group-title").textContent), ["This item", "“count fixture 1”"], "the section's headings, the item first");
        assert.deepEqual(heads.map(h => (h.querySelector(".wv-count-group-chip") || { textContent: "" }).textContent), ["", "p. 3"], "the annotation's page after its title");
        assert.deepEqual(heads.map(h => h.querySelector(".wv-count-group-n").textContent), ["1", "1"], "each part's share");
        const rows = [...p.querySelectorAll(".wv-bl-row")];
        assert.lengthOf(rows, 2);
        assert.isTrue(rows.every(r => r.classList.contains("wv-bl-pair")), "the section's rows");
        assert.isNull(p.querySelector(".wv-bl-excerpt, .wv-bl-owner, .wv-bl-part, .wv-bl-chip"), "no excerpt, no source tree, no chip");
        closePanel();
        wv._wvOpenCountPopup("backlinks", P.id, { anchorNode: anchor, scope: "own", win });
        assert.deepEqual([...panel().querySelectorAll(".wv-bl-hgroup .wv-count-group-title")].map((e) => e.textContent), ["This item"], "an open row's popup: the item's own rows alone, under This item");
        assert.strictEqual(panel().querySelectorAll(".wv-bl-row.wv-bl-pair").length, 1);
        closePanel();
    });

    // MJT 2026-11-03 (screenshot of the 19-Backlinks popup): "Why 2
    // scrollbars?" -> "Go". The popup's container keeps the comment popup's
    // 400-px cap (.wv-popup-container) while a count popup's list scrolls
    // inside it at up to 460 px: the list and its header no longer fit, and
    // the container scrolled too, moving the header out of view. In a count
    // popup only the list scrolls now; the comment popup keeps its cap.
    // FAILED on 1.0.0-beta.2-dev.3.
    it("a count popup scrolls in one place, its list: the container keeps no height cap of its own", function () {
        closePanel();
        wv._wvOpenCountPopup("backlinks", P.id, { anchorNode: doc.documentElement, scope: "subtree", win });
        const box = panel().querySelector(".wv-popup-container.wv-count-popup");
        const list = panel().querySelector(".wv-count-list");
        assert.isOk(box && list, "the count popup's container and list");
        const cs = win.getComputedStyle(box), ls = win.getComputedStyle(list);
        assert.strictEqual(cs.maxHeight, "none", "no cap on the container");
        assert.include(["visible", "clip"], cs.overflowY, "the container never scrolls: " + cs.overflowY);
        assert.include(["auto", "scroll"], ls.overflowY, "the list scrolls");
        assert.notStrictEqual(ls.maxHeight, "none", "within its own cap");
        closePanel();
        wv.openCommentPopup("a comment", { anchorNode: doc.documentElement });
        const cbox = panel().querySelector(".wv-popup-container");
        assert.strictEqual(win.getComputedStyle(cbox).maxHeight, "400px", "the comment popup keeps its 400-px scroll");
        closePanel();
    });

    // MJT 2026-11-04: "The counts popup do not have the same width. Why?" ->
    // "Let Backlinks and Links grow like the others." The popup box takes the
    // width of its longest line between its 300- and 520-px limits, as the
    // Tags, Related and External Links popups do; the Backlinks and Links
    // lines kept the item pane's `contain: inline-size` (dev.52) and gave the
    // box no width, so those two popups always opened at the 300-px floor.
    // A line longer than the box is still cut, never scrolled sideways.
    // FAILED on 1.0.0-beta.2-dev.6 (302 px for both).
    it("the Backlinks and Links popups grow with their longest line, as the other count popups do", async function () {
        const long = "WVCNT wide " + "a rather long title word ".repeat(8);
        const Q = await wvT.createItem("book", { title: long });
        const L = new Zotero.Item("note"); L.libraryID = lib;
        L.setNote("<p>" + long + " zotero://select/library/items/" + Q.key + "</p>");
        await L.saveTx();
        try {
            await wv._wvBlEnsure();
            for (const [kind, id, scope] of [["backlinks", Q.id, "subtree"], ["links", L.id, "own"]]) {
                closePanel();
                wv._wvOpenCountPopup(kind, id, { anchorNode: doc.documentElement, scope, win });
                const p = panel();
                assert.strictEqual(p.querySelectorAll(".wv-bl-row").length, 1, kind + ": the one row");
                const cs = win.getComputedStyle(p);
                const widest = parseFloat(cs.maxWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
                assert.closeTo(p.getBoundingClientRect().width, widest, 1, kind + ": the box at its widest for a long line");
                assert.isAtMost(p.scrollWidth, p.clientWidth, kind + ": no sideways scroll");
                const cut = [...p.querySelectorAll(".wv-bl-row .wv-bl-end-main, .wv-bl-row .wv-bl-head")].some((e) => e.scrollWidth > e.clientWidth);
                assert.isTrue(cut, kind + ": the long line cut to the box");
            }
            closePanel();
        }
        finally {
            closePanel();
            await wvT.erase(L, Q);
        }
    });

    // MJT 2026-10-29 (screenshot of a Related popup, the rows under "This
    // item" bracketed: "I would like to make the structure more clear: can
    // you add a vertical line like in the collections pane?"): a heading's
    // rows hang on Weavero's collections-pane indent guide -- 1 px of
    // currentColor at 22% (pane.ts, collectionsIndentGuides) -- under the
    // heading's icon, down the whole run of its rows, the gaps between them
    // included. Red on dev.95: no guide.
    it("a popup heading's rows hang on a guide line under its icon, as the collections pane's indent guides", function () {
        const anchor = doc.documentElement;
        const hangs = (head, what) => {
            const r = head.firstElementChild.getBoundingClientRect(), mid = r.left + r.width / 2;
            const kids = [];
            for (let k = head.nextElementSibling; k; k = k.nextElementSibling) kids.push(k);
            assert.isAbove(kids.length, 0, what + ": rows under the heading");
            for (const k of kids) {
                const g = win.getComputedStyle(k, "::before");
                assert.notStrictEqual(g.content, "none", what + ": a guide beside " + k.className);
                assert.strictEqual(g.position, "absolute", what);
                assert.strictEqual(g.width, "1px", what + ": one pixel");
                assert.closeTo(k.getBoundingClientRect().left + parseFloat(g.left) + 0.5, mid, 1, what + ": under the heading's icon");
                assert.strictEqual(g.top, "-1px", what + ": across the gap above the row");
                assert.strictEqual(g.bottom, "0px", what + ": down to the row's end");
                // Gecko serialises a color-mix() as "color(srgb r g b / a)".
                const alphaOf = (c) => { const x = String(c).match(/(?:rgba\((?:[^,]*,){3}|\/)\s*([\d.]+)\)$/); return x ? parseFloat(x[1]) : 1; };
                // 22% of the text colour, itself translucent in some themes
                // (the macOS runner's light theme: 0.186 = 22% of ~0.85 black,
                // 2026-11-03; opaque on this machine's dark theme).
                const want = 0.22 * alphaOf(win.getComputedStyle(k).color);
                assert.closeTo(alphaOf(g.backgroundColor), want, 0.01, what + ": the collections guide's 22% of the text colour: " + g.backgroundColor + " over " + win.getComputedStyle(k).color);
            }
        };
        closePanel();
        wv._wvOpenCountPopup("related", P.id, { anchorNode: anchor, scope: "subtree", win });
        const heads = [...panel().querySelectorAll(".wv-count-group-head")];
        assert.lengthOf(heads, 3);
        heads.forEach((h, i) => hangs(h, "Related, group " + i));
        closePanel();
        // The Backlinks popup's headings are the section's since 2026-11-02
        // (no source tree under them; a note's own Links popup only "This item"),
        // and the section's rows hang on no guide since 2026-11-03 (MJT,
        // "Try removing the vertical line so that the arrows get shifted
        // left"): they start under the heading's icon, their arrow the mark.
        wv._wvOpenCountPopup("backlinks", P.id, { anchorNode: anchor, scope: "subtree", win });
        const parts = [...panel().querySelectorAll(".wv-bl-hgroup > .wv-count-group-head")];
        assert.lengthOf(parts, 2);
        parts.forEach((h, i) => {
            const icon = h.firstElementChild.getBoundingClientRect();
            const kids = [];
            for (let k = h.nextElementSibling; k; k = k.nextElementSibling) kids.push(k);
            assert.isAbove(kids.length, 0, "Backlinks, part " + i + ": rows under the heading");
            for (const k of kids) {
                assert.strictEqual(win.getComputedStyle(k, "::before").content, "none", "Backlinks, part " + i + ": no guide beside " + k.className);
                const arrow = k.querySelector(".wv-bl-arrow");
                if (arrow) assert.closeTo(arrow.getBoundingClientRect().left, icon.left, 1, "Backlinks, part " + i + ": the arrow under the heading's icon");
            }
        });
        closePanel();
    });

    // An annotation's popups -- from its row's icon, its card in the item
    // pane, the reader -- and a note's draw as their section does: the rows
    // under "This item", every row written in (Links) or aimed at
    // (Backlinks) the item itself (MJT 2026-11-02, "Keep the same format as
    // in the item pane"; 2026-11-03, the section's own rows alone keep
    // their heading: "the links color now add another information"; from
    // 2026-10-28 to dev.147 under "This item" too, none from dev.148 to
    // dev.171).
    it("an annotation's and a note's Backlinks and Links popups draw as their section: the rows under This item", async function () {
        const N3 = await mkAnn(A, 3, { comment: "see zotero://select/library/items/" + R1.key });
        const titles = (sel) => [...panel().querySelectorAll(sel)].map((e) => e.textContent);
        try {
            assert.isOk(await wvT.waitFor(() => wv._wvLkOwnCount(N3) === 1 || null, 10000), "N3 indexed");
            for (const scope of ["own", "subtree"]) {
                closePanel();
                wv._wvOpenCountPopup("backlinks", N.id, { anchorNode: doc.documentElement, scope, win });
                assert.deepEqual(titles(".wv-bl-hgroup .wv-count-group-title"), ["This item"], "Backlinks, called with scope " + scope + ": under This item");
                assert.isNull(panel().querySelector(".wv-bl-part"), "no by-part popup");
                assert.strictEqual(panel().querySelectorAll(".wv-bl-row.wv-bl-pair").length, 1, "S's row");
                closePanel();
                wv._wvOpenCountPopup("links", N3.id, { anchorNode: doc.documentElement, scope, win });
                assert.match(panel().querySelector(".wv-relations-header-title").textContent, /^1 Item Link$/);
                assert.deepEqual(titles(".wv-lk-body .wv-bl-hgroup .wv-count-group-title"), ["This item"], "Links, called with scope " + scope + ": under This item");
                assert.isNull(panel().querySelector(".wv-lk-body .wv-bl-owner"), "no source tree");
                assert.strictEqual(panel().querySelectorAll(".wv-lk-row").length, 1);
            }
            // A note's own popup (a note row's count) too.
            closePanel();
            wv._wvOpenCountPopup("links", S.id, { anchorNode: doc.documentElement, scope: "subtree", win });
            assert.deepEqual(titles(".wv-lk-body .wv-bl-hgroup .wv-count-group-title"), ["This item"], "a note's Links popup: under This item");
            assert.isAbove(panel().querySelectorAll(".wv-lk-row").length, 0, "its rows");
        }
        finally { closePanel(); await N3.eraseTx(); }
    });

    it("a press and release on a number opens its popup; with Ctrl or Shift it does not", async function () {
        closePanel();
        const s = wv._wvCountSpan(doc, 3, "tags-manual", P.id, "subtree");
        doc.documentElement.appendChild(s);
        try {
            const ev = (type, extra) => Object.assign({ type, target: s, button: 0, clientX: 5, clientY: 5, ctrlKey: false, shiftKey: false, metaKey: false, altKey: false }, extra || {});
            assert.isFalse(wv._wvCountOnPress(ev("mousedown", { ctrlKey: true }), win), "Ctrl+press: Zotero's multi-select only");
            wv._wvCountOnRelease(ev("mouseup", { ctrlKey: true }), win);
            await wvT.sleep(60);
            assert.isOk(!panel() || panel().style.display !== "block", "no popup on a modified click");
            assert.isTrue(wv._wvCountOnPress(ev("mousedown"), win), "a plain press on a number is recorded");
            wv._wvCountOnRelease(ev("mouseup", { clientX: 40, clientY: 5 }), win);
            await wvT.sleep(60);
            assert.isOk(!panel() || panel().style.display !== "block", "a drag opens nothing");
            wv._wvCountOnPress(ev("mousedown"), win);
            wv._wvCountOnRelease(ev("mouseup"), win);
            const opened = await wvT.waitFor(() => panel() && panel().style.display === "block", 3000);
            assert.isOk(opened, "a plain click opens the popup");
            assert.match(panel().querySelector(".wv-relations-header-title").textContent, wv._getEnableTagsCountAuto() ? /^3 Manual Tags$/ : /^3 Tags$/);
        }
        finally { s.remove(); }
    });

    // MJT 2026-10-26: "Backlinks section rows (Shift or middle-click = open
    // the note in a new window); Ok" / "Also from the popups".
    it("a related or backlink row opens in a new window with Shift+click or a middle click, and the popup closes", async function () {
        const anchor = doc.documentElement;
        const calls = [];
        wv._wvOpenItemInNewWindow = async (item) => { calls.push(item && item.id); return true; };   // own properties over the shared methods
        wv._wvBlOpenSource = (srcItem, src, opts) => { calls.push("bl:" + (srcItem && srcItem.id) + ":" + !!(opts && opts.newWindow)); };
        try {
            for (const ev of [new win.MouseEvent("click", { bubbles: true, shiftKey: true }), new win.MouseEvent("auxclick", { bubbles: true, button: 1 })]) {
                closePanel();
                wv._wvOpenCountPopup("related", P.id, { anchorNode: anchor, scope: "own", win });
                panel().querySelector(".wv-count-row").dispatchEvent(ev);
                await wvT.waitFor(() => panel().style.display === "none", 2000);
                assert.strictEqual(panel().style.display, "none", "the popup closes after " + ev.type);
            }
            closePanel();
            wv._wvOpenCountPopup("backlinks", P.id, { anchorNode: anchor, scope: "own", win });
            panel().querySelector(".wv-bl-row").dispatchEvent(new win.MouseEvent("auxclick", { bubbles: true, button: 1 }));
            await wvT.waitFor(() => panel().style.display === "none", 2000);
            assert.strictEqual(panel().style.display, "none", "a backlink's middle click closes it too");
        }
        finally { delete wv._wvOpenItemInNewWindow; delete wv._wvBlOpenSource; closePanel(); }
        assert.deepEqual(calls, [R1.id, R1.id, "bl:" + S.id + ":true"]);
    });

    it("a tag row adds that tag to the clicked window's Tag filter and closes the popup", async function () {
        wv._clearAllFilters();
        wv._wvOpenCountPopup("tags-manual", P.id, { anchorNode: doc.documentElement, scope: "subtree", win });
        const row = [...panel().querySelectorAll(".wv-count-row")].find(r => /m3/.test(r.textContent));
        assert.isOk(row, "the annotation's tag is listed");
        row.click();
        const g = await wvT.waitFor(() => { const x = wv._activeGroup(); return x && (x.annotationTag || []).includes("m3") ? x : null; }, 3000);
        assert.isOk(g, "the Tag filter carries m3");
        assert.strictEqual(panel().style.display, "none", "the popup closed");
        wv._clearAllFilters();
    });
});
