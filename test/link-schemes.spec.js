/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// Which links Weavero draws and opens (security review 2026-11-22):
// - a markdown link is a link only when its address STARTS with a scheme the
//   user has on (the rule plugin-api.ts openLink already used); an enabled
//   scheme somewhere inside it is not enough -- in the sidebar, the items list,
//   the item pane AND the comment popup;
// - a note link of a scheme Weavero does not know is left to Zotero's own link
//   popup: no single-click open;
// - a label that spells out an address other than its target shows the real
//   target;
// - View Online opens a web page only (as Zotero's own View Online);
// - a zotero:// link of a kind Weavero does not handle is not handed to the
//   system.

describe("Weavero — links open only what they say, with a scheme the user has on", function () {
    this.timeout(30000);
    let wv, doc, origLaunchURL, launched, created = [];

    before(() => {
        wv = wvT.plugin();
        for (const m of ["_buildCommentFragment", "_renderInlineMarkdown", "_noteTakeoverForHref", "handleZoteroURI"]) wvT.method(m);
        doc = wvT.win().document;
        origLaunchURL = Zotero.launchURL;
    });
    afterEach(() => { Zotero.launchURL = origLaunchURL; });
    after(async () => { for (const it of created) { try { await it.eraseTx(); } catch (e) {} } });

    const frag = (text, useMd = true) => {
        const box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        box.appendChild(wv._buildCommentFragment(text, { doc, useMd, isTreeMode: false, stripMarkers: true, lineBreaks: false }));
        return box;
    };
    const popup = (text) => {
        const box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        box.appendChild(wv._renderInlineMarkdown(text, doc, { hidePopup() {} }, new Set()));
        return box;
    };
    const hrefs = (box) => Array.from(box.querySelectorAll("[data-href]")).map((s) => s.getAttribute("data-href"));

    it("a markdown link whose scheme is not at its start is text, in every renderer", () => {
        const bad = [
            "[Supplementary data (PDF)](search-ms:query=paper&crumb=location:x&x=https://doi.org/10.1/x)",
            "[https://doi.org/10.1103/PhysRevLett.1](ms-officecmd:x#https://a)",
            "[Open the dataset](ms-settings:privacy-webcam)",
        ];
        for (const t of bad) {
            for (const useMd of [true, false]) assert.deepEqual(hrefs(frag(t, useMd)), [], "comment renderer, md " + useMd + ": " + t);
            assert.lengthOf(popup(t).querySelectorAll("a"), 0, "comment popup: " + t);
        }
        assert.deepEqual(hrefs(frag("[a paper](https://doi.org/10.1/x)")), ["https://doi.org/10.1/x"], "a web link stays a link");
        assert.lengthOf(popup("[a paper](https://doi.org/10.1/x)").querySelectorAll("a"), 1, "and in the popup");
        assert.deepEqual(hrefs(frag("[it](zotero://select/library/items/ABCD2345)")), ["zotero://select/library/items/ABCD2345"]);
    });

    it("a label that spells another address shows the real target", () => {
        const box = frag("[https://doi.org/10.1038/nature12345](https://evil.example/login)");
        const span = box.querySelector("[data-href]");
        assert.isOk(span, "still a link");
        assert.include(span.textContent, "evil.example", "the real target is what the reader sees");
        const a = popup("[www.nature.com/articles/x](https://evil.example/login)").querySelector("a");
        assert.include(a.textContent, "evil.example", "and in the popup");
        assert.strictEqual(frag("[Smith 2020, p. 4](https://doi.org/10.1/x)").querySelector("[data-href]").textContent, "Smith 2020, p. 4",
            "a label that is no address keeps the author's words");
        assert.strictEqual(frag("[https://doi.org/10.1/x](https://doi.org/10.1/x?via=mail)").querySelector("[data-href]").textContent,
            "https://doi.org/10.1/x", "the same site keeps its label");
        // The comment's own words are never lost: the source rebuilt from the
        // drawn spans keeps the label, and the edit view (markers kept, the
        // address written out beside the label) keeps it as written.
        const src = "[https://doi.org/10.1038/nature12345](https://evil.example/login)";
        assert.strictEqual(wv._reconstructSourceFromSpans(frag(src)), src, "the source round-trips");
        const kept = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        kept.appendChild(wv._buildCommentFragment(src, { doc, useMd: true, isTreeMode: false, stripMarkers: false, lineBreaks: false }));
        assert.strictEqual(kept.textContent, src, "with the markers kept, the text is the comment as written");
    });

    it("a note link of a scheme Weavero does not know is left to Zotero's link popup", () => {
        for (const h of ["ms-msdt:/id PCWDiagnostic", "search-ms:query=x", "javascript:alert(1)", "foo://x"]) {
            assert.isFalse(wv._noteTakeoverForHref(h), h);
        }
        for (const h of ["https://example.org", "zotero://select/library/items/ABCD2345", "www.example.org"]) {
            assert.isTrue(wv._noteTakeoverForHref(h), h);
        }
    });

    it("View Online opens a web page only", async () => {
        wvT.method("_wvViewOnlineURL");
        const mk = async (fields) => {
            const it = new Zotero.Item("journalArticle");
            for (const k of Object.keys(fields)) it.setField(k, fields[k]);
            await it.saveTx();
            created.push(it);
            return it;
        };
        assert.isNull(wv._wvViewOnlineURL(await mk({ url: "file:///C:/Windows/System32/calc.exe" })), "a file URL is not a web page");
        assert.isNull(wv._wvViewOnlineURL(await mk({ url: "ms-settings:privacy" })), "nor an application link");
        assert.strictEqual(wv._wvViewOnlineURL(await mk({ url: "https://example.org/a" })), "https://example.org/a");
        assert.strictEqual(wv._wvViewOnlineURL(await mk({ url: "vscode://x", DOI: "10.1000/abc" })), "https://doi.org/10.1000/abc",
            "a DOI when the URL field is no web page, as Zotero's View Online");
        assert.include(wvT.src("_openRelatedItemContextMenu"), "wvIsWebURL", "the related-item menu's View Online, the same rule");
    });

    it("a zotero:// link of a kind Weavero does not open is not handed to the system", async () => {
        launched = [];
        Zotero.launchURL = (u) => { launched.push(u); };
        for (const u of ["zotero://report/library/items/ABCD2345", "zotero://attachment/library/items/ABCD2345/", "zotero://nosuch/x"]) {
            await wv.handleZoteroURI(u);
        }
        assert.deepEqual(launched, [], "nothing went to the system");
    });
});
