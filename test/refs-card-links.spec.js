/* global describe, it, before, after, assert, Zotero, wvT */

// The reference card's bibliography entry is Zotero's CSL output, which wraps
// the URL and DOI fields in <a href> (security review 2026-11-22). Its links go
// through Weavero's launcher, like every other link Weavero draws: no anchor
// keeps an href a click would follow in the document it sits in (the reader's
// page, a chrome popup), as the item pane's header does it (itemPaneHeader.js).

describe("Weavero — the reference card's entry opens its links through the launcher", function () {
    this.timeout(60000);
    let wv, item;

    before(async function () {
        wv = wvT.plugin();
        wvT.method("_wvRefsCardBib");
        const S = /** @type {any} */ (Zotero).Styles;
        if (S && typeof S.init === "function") { try { await S.init(); } catch (e) {} }
        item = new Zotero.Item("journalArticle");
        item.setField("title", "WV-TEST card links");
        item.setField("url", "https://evil.example/login");
        item.setField("DOI", "10.1000/wv-test");
        item.setField("date", "2020");
        item.setCreators([{ firstName: "Ada", lastName: "Tester", creatorType: "author" }]);
        await item.saveTx();
    });
    after(async () => { try { await item.eraseTx(); } catch (e) {} delete wv._launchURL; });

    it("no anchor keeps an href, and a click goes to _launchURL", async () => {
        const doc = wvT.win().document;
        let box = null;
        for (let i = 0; i < 20 && !box; i++) { box = wv._wvRefsCardBib(doc, item); if (!box) await wvT.sleep(250); }
        assert.isOk(box, "the entry is drawn (Zotero's styles loaded)");
        const anchors = Array.from(box.querySelectorAll("a"));
        assert.isAbove(anchors.length, 0, "the style wrote links for the URL or the DOI");
        assert.lengthOf(box.querySelectorAll("a[href]"), 0, "no href left to follow");
        const urls = anchors.map((a) => a.getAttribute("data-wv-url"));
        assert.isTrue(urls.every(Boolean), "each link keeps its address for the launcher");
        const calls = [];
        wv._launchURL = (u) => { calls.push(u); };
        try {
            doc.documentElement.appendChild(box);
            anchors[0].click();
        }
        finally { box.remove(); delete wv._launchURL; }
        assert.deepEqual(calls, [urls[0]], "the click opened it through the launcher");
    });
});
