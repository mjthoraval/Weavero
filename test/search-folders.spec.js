/* global describe, it, before, after, assert, Zotero, IOUtils */

// Folders for saved searches, kept by Weavero (search-folders.ts; MJT 2026-11-27, "a
// similar thing [to the Saved Search Folders plugin] in Weavero, but without touching
// the data itself"). His picks: one structure, which folders are open kept per
// session; the plugin's "A/B/C" names read too; drag onto a folder, Move to Folder, a
// folder menu; alphabetical; in place, where Zotero lists a library's saved searches.
// Every check reads the pane's own collection tree; nothing in any library changes but
// the saved searches this spec makes (and its one rename, which a user would do).

describe("Weavero — folders for saved searches, kept by Weavero", function () {
    this.timeout(90000);
    let wv, win, cv, L;
    const made = [];
    let fBeta = null, fAlpha = null;
    const P = "WVSF ";

    const rowsOf = () => {
        const out = [];
        for (let i = 0; i < cv.rowCount; i++) {
            const r = cv.getRow(i);
            if (!r) continue;
            if (r.ref && r.ref.wvSf) out.push({ i, level: r.level, kind: "folder", name: r.getName(), open: !!r.isOpen, r });
            else if (r.isSearch && r.isSearch() && String(r.ref.name).startsWith(P)) out.push({ i, level: r.level, kind: "search", name: r.getName(), r });
        }
        return out;
    };
    const shape = () => rowsOf().map(x => (x.kind === "folder" ? "F" : "S") + x.level + ":" + x.name.replace(P, ""));
    const settle = async (pred, what) => {
        const ok = await wvT.waitFor(() => { try { return pred() || null; } catch (e) { return null; } }, 10000, 60);
        assert.ok(ok, what + " (rows: " + JSON.stringify(shape()) + ")");
    };
    const mkSearch = async (name) => {
        const s = /** @type {any} */ (new Zotero.Search());
        s.libraryID = L;
        s.name = name;
        s.addCondition("title", "contains", "wv-sf-nothing-matches-this");
        await s.saveTx();
        made.push(s);
        return s;
    };
    const libShape = () => /** @type {any} */ (Zotero.Searches).getByLibrary(L).filter(s => String(s.name).startsWith(P)).map(s => [s.key, s.name]).sort();

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvSfOn", "_wvSfRegroup", "_wvSfNewFolder", "_wvSfAssign", "_wvSfToggle", "_wvSfCapture", "_wvSfRestore", "_wvSfTeardown", "_wvSfWire"]) wvT.method(m);
        win = Zotero.getMainWindow();
        cv = win.ZoteroPane.collectionsView;
        L = Zotero.Libraries.userLibraryID;
        await wv._wvSfLoad();
        wv._wvSfDoc = { version: 1, libs: {} };
        win._wvSfClosed = new Set();
        assert.isTrue(wv._wvSfOn(), "fixture: on in a pre-release build (devOnly)");
        await win.ZoteroPane.collectionsView.selectLibrary(L);
        await mkSearch(P + "Zeta");
        await mkSearch(P + "Eta");
        await mkSearch(P + "Theta");
        await settle(() => rowsOf().filter(x => x.kind === "search").length === 3, "fixture: three saved searches in the tree");
    });

    after(async function () {
        try { wv._wvSfDoc = { version: 1, libs: {} }; await wv._wvSfPersist(); } catch (e) {}
        try { win._wvSfClosed = new Set(); } catch (e) {}
        for (const s of made) { try { await s.eraseTx(); } catch (e) {} }
        try { wv._wvSfRefreshAll(); } catch (e) {}
    });

    it("no folder: Zotero's flat list, untouched", () => {
        assert.deepEqual(shape(), ["S1:Eta", "S1:Theta", "S1:Zeta"]);
    });

    it("a folder of Weavero's sits under its library before the unfiled searches, its search inside; folders and searches alphabetical; an empty one stays", async () => {
        const before = libShape();
        fBeta = wv._wvSfNewFolder(L, P + "Beta", null);
        fAlpha = wv._wvSfNewFolder(L, P + "Alpha", null);
        wv._wvSfAssign([made[0]], fBeta);   // Zeta into Beta
        await settle(() => shape().join() === ["F1:Alpha", "F1:Beta", "S2:Zeta", "S1:Eta", "S1:Theta"].join(), "the folders first, then the unfiled searches");
        const folder = rowsOf().find(x => x.kind === "folder" && x.name === P + "Beta");
        assert.equal(cv.getIconName(folder.i), "wv-search-folder", "its icon");
        assert.isFalse(cv.isSelectable(folder.i), "a heading: not selectable");
        assert.isFalse(cv.isContainerEmpty(folder.i), "a twisty over its search");
        const alpha = rowsOf().find(x => x.kind === "folder" && x.name === P + "Alpha");
        assert.isTrue(cv.isContainerEmpty(alpha.i), "the empty one: no twisty");
        assert.deepEqual(libShape(), before, "no search renamed, none added");
    });

    it("a twisty closes and opens a folder; which are closed is the window's, and goes into its session record", async () => {
        const i = rowsOf().find(x => x.kind === "folder" && x.name === P + "Beta").i;
        await cv.toggleOpenState(i);
        await settle(() => shape().join() === ["F1:Alpha", "F1:Beta", "S1:Eta", "S1:Theta"].join(), "closed: its search out of the list");
        const cap = wv._wvSfCapture(win);
        assert.ok(cap && cap.some(k => k.endsWith("l:" + fBeta)), "the closed folder in the window's capture: " + JSON.stringify(cap));
        const st = wv._wvWinStateCapture(win);
        assert.deepEqual(st.sfOpen, cap, "and in the window's saved state");
        wv._wvSfRefreshAll();
        await wvT.sleep(400);
        await settle(() => shape().includes("F1:Beta") && !shape().includes("S2:Zeta"), "a redraw keeps it closed");
        wv._wvSfRestore(win, []);
        await settle(() => shape().includes("S2:Zeta"), "a session where all are open: open again");
        assert.isUndefined(wv._wvSfCapture(win), "nothing closed, nothing saved");
    });

    // dev.99 triage (2026-11-27): a wrap of the tree's toggleOpenState under
    // another tag (people-gate.spec.js changed wv._version, part of the tag, for
    // a moment; group-fold re-wrapped at a refresh then) dropped the folder
    // layer, and a boolean said "wired": the twisty then closed the folder
    // through Zotero's own toggle, unrecorded (the case above failed at its
    // capture). The layer itself is looked for at every rebuild of the rows
    // (search-folders.ts _wvSfAdopt).
    it("a twisty still records after the tree's folder layer was lost: the next rebuild of the rows puts it back", async () => {
        const lib = wvT.lib();
        const live = wv._wvWireTag();
        const layers = () => lib.wvWrapLayers(cv, "toggleOpenState").map(l => l.layer + "@" + (l.tag === live ? "live" : l.tag));
        assert.include(layers(), "srchfold@live", "fixture: the tree's folder layer is on");
        lib.wvWrap(cv, "toggleOpenState", "wv-test-other", "wv@test#other", (orig) => function () { return orig.apply(this, arguments); });
        try {
            assert.notInclude(layers(), "srchfold@live", "fixture: another tag's wrap dropped it: " + JSON.stringify(layers()));
            await cv.refresh();
            assert.include(layers(), "srchfold@live", "back after a rebuild of the rows: " + JSON.stringify(layers()));
            await settle(() => shape().includes("F1:Beta") && shape().includes("S2:Zeta"), "fixture: Beta open, Zeta in it");
            await cv.toggleOpenState(rowsOf().find(x => x.kind === "folder" && x.name === P + "Beta").i);
            await settle(() => shape().includes("F1:Beta") && !shape().includes("S2:Zeta"), "closed: its search out of the list");
            const cap = wv._wvSfCapture(win);
            assert.ok(cap && cap.some(k => k.endsWith("l:" + fBeta)), "the closed folder recorded: " + JSON.stringify(cap));
        }
        finally {
            try { lib.wvUnwrap(cv, "toggleOpenState", "wv-test-other"); } catch (e) {}
            wv._wvSfRestore(win, []);
        }
        await settle(() => shape().includes("S2:Zeta"), "open again");
        assert.include(layers(), "srchfold@live", "the folder layer kept");
    });

    it("the plugin's names: \"A/B/C\" shows as C in folder A › B, ordered by its \"N_\" prefixes; off, the names as they are", async () => {
        const s1 = await mkSearch(P + "People/2_Students/Marie");
        const s2 = await mkSearch(P + "People/1_Staff/Bob");
        await settle(() => shape().includes("F2:Students") && shape().includes("F2:Staff"), "two name folders");
        const sh = shape();
        const at = sh.indexOf("F1:People");
        assert.isAtLeast(at, 0, "the top folder, named without its prefix: " + JSON.stringify(sh));
        assert.deepEqual(sh.slice(at, at + 5), ["F1:People", "F2:Staff", "S3:Bob", "F2:Students", "S3:Marie"], "1_ before 2_, the leaves shown");
        const leaf = rowsOf().find(x => x.kind === "search" && x.r.ref.id === s1.id);
        assert.equal(leaf.name, "Marie", "getName: the leaf (the label, the tab title)");
        await wvT.withPref("weavero.collectionsSearchFoldersNames", false, async () => {
            await settle(() => !shape().some(x => x.startsWith("F") && x.endsWith("People")) && shape().includes("S1:People/1_Staff/Bob"), "off: flat, the full names");
        });
        await settle(() => shape().includes("F2:Students"), "on again");
        void s2;
    });

    it("Move to Folder lists the folders, the one it is in greyed, and files it; Not in a Folder takes it out", async () => {
        const doc = win.document;
        const pop = doc.createXULElement("menupopup");
        doc.documentElement.appendChild(pop);
        try {
            const eta = made[1];
            wv._wvSfFillMoveMenu(doc, win, pop, eta);
            const items = Array.from(pop.querySelectorAll("menuitem"));
            const unf = items.find(x => x.getAttribute("data-wv-sf-target") === "@root");
            assert.equal(unf.getAttribute("disabled"), "true", "unfiled already");
            const beta = items.find(x => x.getAttribute("label") === P + "Beta");
            assert.ok(beta, "its folders: " + items.map(x => x.getAttribute("label")).join(" | "));
            beta.doCommand();
            await settle(() => { const s = shape(); const b = s.indexOf("F1:Beta"); return b >= 0 && s.slice(b + 1, b + 3).join() === "S2:Eta,S2:Zeta"; }, "Eta in Beta, alphabetical with Zeta");
            wv._wvSfFillMoveMenu(doc, win, pop, eta);
            const again = Array.from(pop.querySelectorAll("menuitem"));
            assert.equal(again.find(x => x.getAttribute("label") === P + "Beta").getAttribute("disabled"), "true", "the folder it is in, greyed");
            again.find(x => x.getAttribute("data-wv-sf-target") === "@root").doCommand();
            await settle(() => shape().includes("S1:Eta"), "Not in a Folder: back at the top");
        }
        finally { pop.remove(); }
    });

    it("a drop of saved searches on a folder files them; on their library takes them out of folders; other drags are Zotero's", async () => {
        const theta = made[2];
        const fake = (ids, row) => ({
            dataTransfer: { types: ["zotero/search"], getData: (t) => (t === "zotero/search" ? ids.join(",") : ""), dropEffect: "" },
            currentTarget: win.document.getElementById(cv.id + "-row-" + row) || { classList: { contains: () => true } },
            preventDefault() {}, stopPropagation() {},
        });
        const fi = rowsOf().find(x => x.kind === "folder" && x.name === P + "Alpha").i;
        const ov = fake([theta.id], fi);
        assert.isTrue(wv._wvSfDragOver(cv, ov, fi), "over a folder: Weavero's");
        assert.equal(ov.dataTransfer.dropEffect, "move");
        assert.isTrue(wv._wvSfDrop(cv, fake([theta.id], fi), fi), "dropped");
        await settle(() => { const s = shape(); return s[s.indexOf("F1:Alpha") + 1] === "S2:Theta"; }, "Theta in Alpha");
        const li = cv.getRowIndexByID("L" + L);
        assert.isTrue(wv._wvSfDrop(cv, fake([theta.id], li), li), "on My Library: out of its folder");
        await settle(() => shape().includes("S1:Theta"), "Theta back at the top");
        const libRow = cv.getRowIndexByID("L" + L);
        assert.isFalse(wv._wvSfDrop(cv, fake([theta.id], libRow), libRow), "an unfiled search on its library: left to Zotero");
        const items = { dataTransfer: { types: ["zotero/item"], getData: () => "1" }, currentTarget: { classList: { contains: () => true } }, preventDefault() {} };
        assert.isFalse(wv._wvSfDragOver(cv, items, fi), "items over a folder: left to Zotero");
    });

    it("selecting a search inside a closed folder opens the folder (a bookmark, a link); \"+\" opens every folder", async () => {
        const zeta = made[0];
        const i = rowsOf().find(x => x.kind === "folder" && x.name === P + "Beta").i;
        await cv.toggleOpenState(i);
        await settle(() => !shape().includes("S2:Zeta"), "fixture: closed");
        await cv.selectByID("S" + zeta.id);
        await settle(() => shape().includes("S2:Zeta"), "open again");
        assert.equal(cv.getRow(cv.selection.focused).ref.id, zeta.id, "and selected");
        await cv.selectLibrary(L);
        await cv.toggleOpenState(rowsOf().find(x => x.kind === "folder" && x.name === P + "Beta").i);
        await settle(() => !shape().includes("S2:Zeta"), "fixture: closed again");
        await cv.expandLibrary(L, true);
        await settle(() => shape().includes("S2:Zeta"), "expandLibrary(recursive): open");
    });

    it("a search renamed from one name path to another moves with its name", async () => {
        const bob = made.find(s => String(s.name).endsWith("1_Staff/Bob"));
        bob.name = P + "Other/Bob";
        await bob.saveTx();
        await settle(() => { const s = shape(); const o = s.indexOf("F1:Other"); return o >= 0 && s[o + 1] === "S2:Bob" && !s.includes("F2:Staff"); }, "under Other; Staff gone with its last search");
    });

    it("beside the Saved Search Folders plugin, Weavero's folders stand down", async () => {
        wv._wvSfForeign = true;
        try {
            wv._wvSfRefreshAll();
            await settle(() => !rowsOf().some(x => x.kind === "folder"), "no folder of Weavero's");
        }
        finally { wv._wvSfForeign = false; wv._wvSfRefreshAll(); }
        await settle(() => rowsOf().some(x => x.kind === "folder"), "back");
    });

    it("the store holds the folders by library and search KEY; the library holds nothing of them", async () => {
        await wv._wvSfPersist();
        const doc = JSON.parse(await IOUtils.readUTF8(wv._wvSfPath()));
        const u = doc.libs.u;
        assert.ok(u && u.folders[fBeta] && u.folders[fBeta].name === P + "Beta", "My Library's part under \"u\"");
        assert.equal(u.assign[made[0].key], fBeta, "Zeta filed by its key");
        const row = await /** @type {any} */ (Zotero.DB).valueQueryAsync("SELECT COUNT(*) FROM savedSearches WHERE savedSearchName LIKE ?", ["%" + P + "Beta%"]);
        assert.equal(row, 0, "no saved search carries a folder's name");
    });

    it("teardown draws the tree flat and leaves no layer; wiring again brings the folders back", async () => {
        wv._wvSfTeardown();
        await settle(() => !rowsOf().some(x => x.kind === "folder"), "flat");
        const proto = Object.getPrototypeOf(cv);
        const layers = (m) => { try { return Array.from((proto._wvWraps && proto._wvWraps[m] && proto._wvWraps[m].recs) || []).map(r => r.layer); } catch (e) { return []; } };
        for (const m of ["_expandRow", "_refreshRowMap", "getIconName", "selectByID", "expandLibrary", "notify", "onDragOver", "onDrop"]) assert.notInclude(layers(m), "srchfold", m + ": no folder layer");
        assert.notOk(rowsOf().some(x => Object.prototype.hasOwnProperty.call(x.r, "getName")), "no search row keeps Weavero's getName");
        wv._wvSfWire(win);
        wv._wvSfRefreshAll();
        await settle(() => rowsOf().some(x => x.kind === "folder"), "back after wiring");
    });
});
