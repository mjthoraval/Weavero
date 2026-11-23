/* global describe, it, before, after, assert, Zotero */

// Issue #68 (Calorion, Zotero 11.0-beta.4, macOS, snapshots): (1) a link in an
// annotation comment made Weavero's preview show the comment as plain text -- Zotero
// 11 keeps a comment's formatting IN its text (`<b>`, `<i>`, `<sub>`, `<sup>`) and
// draws it in .content as those elements (zotero/reader editor.js walkFormat), and the
// preview read the text alone; (2) in the annotation popup under a highlight (the
// sidebar closed), a click on the comment did nothing: the reader's FocusManager
// cancels a pointerdown in reader.html outside its exemption list, and the preview over
// the comment is none of them, so the mousedown that the edit forwarder and the link
// handler waited for never came (also issue #62: links in that popup). Built on a real
// reader page carrying Weavero's wiring.

describe("Weavero — a rich comment's preview keeps its formatting; the popup's preview takes presses (#68)", function () {
    this.timeout(60000);
    let wv, att, reader, idoc, root, origOpen;
    const URL = "https://example.org/wv68";

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_renderPreviewPanel");
        wvT.method("_wvBuildFormattedCommentFragment");
        att = await wvT.createTestPDFItem("wv-68-rich");
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "reader opened");
        idoc = reader._iframeWindow.document;
        // The reader's wiring (Weavero's listeners on reader.html) in place.
        assert.ok(await wvT.waitFor(() => { const d = wv._readerObservers.get(reader); return !!(d && d.popupPointerDown); }, 20000, 100),
            "the reader page is wired, the popup's press handler with it");
        wv._ensureReaderOuterStyles(idoc);
        root = idoc.createElement("div");
        root.style.cssText = "position: fixed; left: 0; top: 0; width: 320px; z-index: 99999";
        idoc.body.appendChild(root);
        origOpen = wv._wvOpenTarget;
    });

    after(async function () {
        try { wv._wvOpenTarget = origOpen; } catch (e) {}
        try { if (root) root.remove(); } catch (e) {}
        wvT.closeReaderTab(reader);
        await wvT.erase(att);
    });

    /** Zotero's comment shape inside `wrapperClass`: .comment > .editor > .content
     *  (contenteditable), its text drawn as Zotero draws it (`build` adds the nodes). */
    const make = (wrapperClass, build) => {
        const wrap = idoc.createElement("div");
        wrap.className = wrapperClass;
        const comment = idoc.createElement("div");
        comment.className = "comment";
        const editor = idoc.createElement("div");
        editor.className = "editor";
        const content = idoc.createElement("div");
        content.className = "content";
        content.setAttribute("contenteditable", "true");
        build(content);
        editor.appendChild(content);
        comment.appendChild(editor);
        wrap.appendChild(comment);
        root.replaceChildren(wrap);
        return { comment, content };
    };
    const rich = (content) => {
        content.appendChild(idoc.createTextNode("see "));
        const b = idoc.createElement("b");
        b.textContent = "bold words";
        content.appendChild(b);
        content.appendChild(idoc.createTextNode(" and " + URL + " end"));
    };

    it("a formatted comment with a link: the preview keeps Zotero's <b>, the link drawn", () => {
        const { comment } = make("view-popup annotation-popup", rich);
        assert.isTrue(wv._renderPreviewPanel(comment), "a preview drawn");
        const preview = comment.querySelector(".wv-md-preview");
        assert.ok(preview, "the preview");
        const b = preview.querySelector("b");
        assert.ok(b, "the bold run kept: " + preview.innerHTML);
        assert.strictEqual(b.textContent, "bold words");
        const link = preview.querySelector(".wv-url-span");
        assert.ok(link, "the link drawn: " + preview.innerHTML);
        assert.include(link.textContent + " " + (link.getAttribute("data-href") || ""), URL);
        assert.include(preview.textContent.replace(/\s+/g, " "), "see bold words and");
    });

    it("a plain comment with a link: the text path, as before", () => {
        const { comment } = make("view-popup annotation-popup", (c) => { c.textContent = "plain " + URL + " text"; });
        assert.isTrue(wv._renderPreviewPanel(comment));
        const preview = comment.querySelector(".wv-md-preview");
        assert.isNull(preview.querySelector("b"));
        assert.ok(preview.querySelector(".wv-url-span"), "the link drawn");
    });

    it("in the popup, a press on the preview's text enters editing (the press itself, not a mousedown)", async () => {
        const { comment } = make("view-popup annotation-popup", rich);
        wv._renderPreviewPanel(comment);
        const preview = comment.querySelector(".wv-md-preview");
        const textNode = preview.querySelector("b");
        textNode.dispatchEvent(new idoc.defaultView.PointerEvent("pointerdown", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, idoc.defaultView)));
        assert.isTrue(comment.classList.contains("wv-editing"), "editing: the raw comment shows, the preview hides");
    });

    it("in the popup, a press on a link opens it", async () => {
        const opened = [];
        wv._wvOpenTarget = async (_w, t, where) => { opened.push([t && t.url, where]); };
        const { comment } = make("view-popup annotation-popup", rich);
        wv._renderPreviewPanel(comment);
        const link = comment.querySelector(".wv-md-preview .wv-url-span");
        link.dispatchEvent(new idoc.defaultView.PointerEvent("pointerdown", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, idoc.defaultView)));
        await wvT.sleep(50);
        assert.strictEqual(opened.length, 1, "opened once: " + JSON.stringify(opened));
        assert.include(String(opened[0][0]), URL);
        assert.isFalse(comment.classList.contains("wv-editing"), "a link press opens the link, no editing");
        wv._wvOpenTarget = origOpen;
    });
});
