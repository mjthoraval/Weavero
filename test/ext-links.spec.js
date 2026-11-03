/* global describe, it, before, after, assert, Zotero, wvT */

// The External Links column (MJT 2026-10-30, "Rename properly the Links
// column, and add a External Links column" -> "Number + popup", "Each link
// written"): the web and app links written in a row's notes and annotation
// comments -- what Has External Link looks for, a zotero:// link being Item
// Links' -- each written link once (a link whose text repeats its address
// is one), counted as Item Links counts: collapsed, the whole item;
// expanded, the row's own. Its number lists them under the note or
// annotation each is written in. Written before the code (the feature
// skill's check-first rule): every `it` fails on 0.22.3-dev.134.

describe("Weavero — External Links column", function () {
    this.timeout(90000);
    let wv, win, doc, lib, P, A, X, N, S;
    const note = async (html, parentID) => {
        const n = /** @type {any} */ (new Zotero.Item("note"));
        n.libraryID = lib;
        if (parentID) n.parentID = parentID;
        n.setNote(html);
        await n.saveTx({ skipSelect: true });
        return n;
    };
    const panel = () => /** @type {any} */ (doc.getElementById("weavero-panel"));

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvBlEnsure", "_wvExtOwnCount", "_wvExtCount", "_wvExtEntries", "_wvOpenCountPopup"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; lib = Zotero.Libraries.userLibraryID;
        P = await wvT.createItem("journalArticle", { title: "WVEX paper" });
        A = await wvT.createTestPDFItem("wvex-pdf", { parentItemID: P.id });
        X = /** @type {any} */ (new Zotero.Item("annotation"));
        X.libraryID = A.libraryID; X.parentID = A.id;
        X.annotationType = "highlight"; X.annotationText = "external words"; X.annotationColor = "#ffd400";
        X.annotationPageLabel = "3"; X.annotationSortIndex = "00002|000001|00000";
        X.annotationPosition = JSON.stringify({ pageIndex: 2, rects: [[10, 10, 60, 20]] });
        X.annotationComment = "See https://example.org/a and https://example.org/b, not zotero://select/library/items/" + P.key + ".";
        await X.saveTx();
        // A link whose text repeats its address, a named link, a schemeless
        // www. link, and a zotero:// link (not external): three.
        N = await note('<h1>WVEX child note</h1><p>One <a href="https://example.org/c">https://example.org/c</a>, a <a href="https://example.org/d">named link</a>, www.example.org/e and zotero://select/library/items/' + P.key + "</p>", P.id);
        S = await note("<h1>WVEX standalone</h1><p>Plain https://example.org/f here.</p>");
        await wv._wvBlEnsure();
        await wvT.waitFor(() => (wv._wvExtOwnCount(X) === 2 && wv._wvExtOwnCount(N) === 3 && wv._wvExtOwnCount(S) === 1) || null, 10000);
    });

    after(async function () {
        try { const p = panel(); if (p) p.style.display = "none"; } catch (e) {}
        await wvT.erase(S, P);
    });

    it("counts each external link written, once, in notes and annotation comments; a zotero:// link is not one", function () {
        assert.strictEqual(wv._wvExtOwnCount(X), 2, "the comment's two web links");
        assert.strictEqual(wv._wvExtOwnCount(N), 3, "the note's: the repeated address once, the named link, the www. one");
        assert.strictEqual(wv._wvExtOwnCount(S), 1, "a standalone note's");
        assert.strictEqual(wv._wvExtOwnCount(P), 0, "a paper writes none itself");
        assert.strictEqual(wv._wvExtCount(P), 5, "collapsed: the whole paper's, its note's and its annotation's");
        assert.strictEqual(wv._wvExtCount(A), 2, "its file: the annotation's");
        assert.strictEqual(wv._wvExtCount(S), 1);
        assert.deepEqual(wv._wvExtEntries(N, "own").map((e) => e.link.url), ["https://example.org/c", "https://example.org/d", "www.example.org/e"], "in text order");
    });

    it("the column: External Links, by Has External Link's icon; its number lists each link under its note or annotation", function () {
        const lib2 = Zotero.Weavero.lib;
        const col = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns().find((c) => /weaveroExtLinks$/.test(String(c.dataKey)));
        assert.isOk(col, "registered (its switch on by default)");
        assert.strictEqual(col.label, "External Links");
        assert.include(decodeURIComponent(String(col.iconPath)), lib2.WV_EXTLINK_PATHS[0], "the box with the arrow out");
        wv._wvOpenCountPopup("extlinks", P.id, { anchorNode: doc.documentElement, scope: "subtree", win });
        const p = panel();
        assert.match(p.querySelector(".wv-relations-header-title").textContent, /^5 External Links$/);
        const heads = [...p.querySelectorAll(".wv-count-group-head .wv-count-group-title")].map((e) => e.textContent);
        assert.deepEqual(heads, [N.getNoteTitle(), X.getDisplayTitle()], "the note's, then the annotation's");
        const rows = [...p.querySelectorAll(".wv-count-row")];
        assert.lengthOf(rows, 5);
        assert.include(rows[1].textContent, "https://example.org/d", "each row its address");
        assert.isOk(rows[1].querySelector(".wv-bl-excerpt"), "with the text around it");
        p.style.display = "none";
        wv._wvOpenCountPopup("extlinks", N.id, { anchorNode: doc.documentElement, scope: "own", win });
        assert.match(panel().querySelector(".wv-relations-header-title").textContent, /^3 External Links$/, "a note's own");
        panel().style.display = "none";
    });

    it("an edit updates the counts without a rebuild", async function () {
        N.setNote("<h1>WVEX child note</h1><p>now only https://example.org/z</p>");
        await N.saveTx({ skipSelect: true });
        await wvT.waitFor(() => wv._wvExtOwnCount(N) === 1 || null, 10000);
        assert.strictEqual(wv._wvExtOwnCount(N), 1);
        assert.strictEqual(wv._wvExtCount(P), 3, "the paper's follows");
    });
});
