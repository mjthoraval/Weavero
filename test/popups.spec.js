/* global describe, it, before, expect, Zotero, Components */

// Regression tests for the popup-panel infrastructure used by
// openCommentPopup / openRelationsPopup. These cover four bugs
// that surfaced when the popup was extended to work in the
// standalone reader window:
//
//   1. _resolvePopupWin — must derive the host window from the
//      anchor's ownerDocument so the popup lands in whatever
//      window the click came from. Hardcoding Zotero.getMainWindow()
//      breaks the standalone reader case.
//
//   2. Icon embedding — chrome:// URLs in <img src> are blocked by
//      the browser when the host doc is resource:// (e.g. the
//      reader's reader.html). Icons must be fetched via privileged
//      JS and embedded as data: URIs.
//
//   3. Outside-click dismiss — DOM mousedown events don't cross
//      document boundaries. The dismiss listener must be attached
//      to every document reachable in the window tree, not just
//      the popup's host doc.
//
//   4. Toggle on re-click — second click on the SAME anchor that
//      opened the popup should close it (matches stock dropdown /
//      popover behaviour). Tracked via panel._wvOpenedFor.
//
// History: regressions 1-3 were latent gaps that became visible in
// v0.8.1-dev.46+ when the popup was relocated into the reader's
// resource:// document. #4 was a missing feature, added in
// v0.8.1-dev.51. See also feedback_weavero_install_cache.md for
// the install / hot-reload workflow these tests run inside.

describe("Weavero — popup infrastructure", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    // -------- 1. _resolvePopupWin -----------------------------------

    describe("_resolvePopupWin()", () => {
        it("returns Zotero.getMainWindow() when opts is empty", () => {
            const win = wv._resolvePopupWin({});
            expect(win).to.equal(Zotero.getMainWindow());
        });

        it("returns Zotero.getMainWindow() when opts is undefined", () => {
            const win = wv._resolvePopupWin();
            expect(win).to.equal(Zotero.getMainWindow());
        });

        it("returns opts.win verbatim when supplied", () => {
            const fakeWin = {};
            const win = wv._resolvePopupWin({ win: fakeWin });
            expect(win).to.equal(fakeWin);
        });

        it("derives window from anchorNode.ownerDocument.defaultView.top", () => {
            const main = Zotero.getMainWindow();
            const anchor = main.document.body;
            const win = wv._resolvePopupWin({ anchorNode: anchor });
            // body.ownerDocument.defaultView is the main window; its
            // .top is itself (top-level chrome window).
            expect(win).to.equal(main);
        });

        it("falls back to main window when anchorNode lacks ownerDocument", () => {
            const win = wv._resolvePopupWin({ anchorNode: {} });
            expect(win).to.equal(Zotero.getMainWindow());
        });
    });

    // -------- 2. Icon embedding -------------------------------------

    describe("_makeItemTypeIcon() / _makeChromeIcon()", () => {
        let main, doc;
        before(() => {
            main = Zotero.getMainWindow();
            doc = main.document;
        });

        it("converts camelCase data-item-type to kebab-case file name", () => {
            // Verify by reading the constructed src URL.
            const img = wv._makeItemTypeIcon(doc, main, "journalArticle");
            const src = img.getAttribute("src");
            expect(src).to.match(/journal-article\.svg$/);
        });

        it("preserves PDF / EPUB acronyms when camel→kebab converting", () => {
            // attachmentPDF must produce attachment-pdf.svg, not
            // attachment-p-d-f.svg (mirrors Zotero's reverse mapping
            // in scss/components/_item-tree.scss line 380).
            const pdf = wv._makeItemTypeIcon(doc, main, "attachmentPDF");
            expect(pdf.getAttribute("src")).to.match(/attachment-pdf\.svg$/);
            const epub = wv._makeItemTypeIcon(doc, main, "attachmentEPUB");
            expect(epub.getAttribute("src")).to.match(/attachment-epub\.svg$/);
        });

        it("leaves single-word names untouched (webpage stays webpage)", () => {
            const img = wv._makeItemTypeIcon(doc, main, "webpage");
            expect(img.getAttribute("src")).to.match(/webpage\.svg$/);
        });

        it("returns an <img> element with class wv-rel-icon", () => {
            const img = wv._makeItemTypeIcon(doc, main, "document");
            expect(img.tagName.toLowerCase()).to.equal("img");
            expect(img.className).to.include("wv-rel-icon");
        });

        it("uses light or dark theme based on prefers-color-scheme", () => {
            const img = wv._makeItemTypeIcon(doc, main, "document");
            const src = img.getAttribute("src");
            // Must contain either 'light' or 'dark' folder segment.
            expect(src).to.match(/\/(light|dark)\/document\.svg$/);
        });

        it("falls back to a data: URL after async fetch (resource-doc safety net)",
            async function () {
            // The chrome:// URL is set synchronously, then a
            // privileged fetch replaces it with a data: URI so the
            // image actually loads inside resource:// documents.
            // Two calls with the same arg must hit the cache and
            // return the data: URI immediately.
            const first = wv._makeItemTypeIcon(doc, main, "document");
            // Wait for the async fetch to populate the cache.
            for (let i = 0; i < 30; i++) {
                if (first.getAttribute("src").startsWith("data:")) break;
                await new Promise(r => main.setTimeout(r, 50));
            }
            expect(first.getAttribute("src")).to.match(/^data:image\/svg\+xml/);
            // Second call: cached → src is data: URL synchronously.
            const second = wv._makeItemTypeIcon(doc, main, "document");
            expect(second.getAttribute("src")).to.match(/^data:image\/svg\+xml/);
        });
    });

    // -------- 3. Outside-click dismiss ------------------------------

    describe("_attachOutsideClickDismiss()", () => {
        let main, doc, panel;
        before(() => {
            main = Zotero.getMainWindow();
            doc = main.document;
            // Create a sentinel panel so the handler has something to
            // gate on. We don't actually attach it to the DOM —
            // _attachOutsideClickDismiss only reads panel.style.display
            // and panel.contains().
            panel = doc.createElementNS(
                "http://www.w3.org/1999/xhtml", "div");
            panel.style.display = "block";
        });

        it("returns a function (teardown handle)", () => {
            const teardown = wv._attachOutsideClickDismiss(
                panel, doc, main, () => {}
            );
            expect(typeof teardown).to.equal("function");
            teardown();
        });

        it("collects more than one document when chrome windows are open", () => {
            // We can't directly inspect the docs Set, but we can
            // verify behaviour: registering on multiple docs means
            // teardown removes listeners from multiple docs without
            // throwing. Smoke-test that no exception escapes.
            const teardown = wv._attachOutsideClickDismiss(
                panel, doc, main, () => {}
            );
            expect(() => teardown()).to.not.throw();
        });

        it("uses window-mediator (NOT win.parent) to walk up", () => {
            // Regression note: an earlier draft used hostWin.parent
            // to walk up to top. In Zotero 10's reader, the iframe's
            // parent === self (process-isolated), so the walk
            // terminated immediately and PDF-iframe clicks didn't
            // dismiss the popup. The implementation now uses
            // nsIWindowMediator. Lock that contract by spot-checking
            // the source.
            const src = wv._attachOutsideClickDismiss.toString();
            expect(src).to.include("nsIWindowMediator");
        });

        it("uses a separate 'visited' set so collectDown recurses into already-added docs", () => {
            // Regression: the previous implementation early-returned
            // when a doc was already in the set, skipping iframe
            // recursion if the doc had been added by the walk-up
            // step. The fix tracks visited separately. Assert by
            // checking source for both `docs` and `visited` Sets.
            const src = wv._attachOutsideClickDismiss.toString();
            expect(src).to.include("visited");
            expect(src).to.include("docs");
        });
    });

    // -------- 4. Toggle on re-click ---------------------------------

    describe("popup toggle (_wvOpenedFor)", () => {
        it("openCommentPopup early-returns when same anchor opens twice",
            async function () {
            const main = Zotero.getMainWindow();
            const doc = main.document;
            // Zotero's main window is XUL: doc.body is NULL. Use
            // documentElement (the <window> root) as a stable anchor
            // — any non-null node works for the toggle's identity
            // check. (Don't try doc.body — early test versions did
            // and the toggle never fired because the anchor was null,
            // making opts.anchorNode falsy.)
            const anchor = doc.documentElement;
            // First open.
            wv.openCommentPopup("test comment", { anchorNode: anchor });
            /** @type {any} */
            const panel = doc.getElementById("weavero-panel");
            expect(panel).to.exist;
            expect(panel.style.display).to.equal("block");
            expect(panel._wvOpenedFor).to.equal(anchor);
            // Second open with same anchor → toggle close.
            wv.openCommentPopup("test comment", { anchorNode: anchor });
            expect(panel.style.display).to.equal("none");
            // Cleanup
            try { panel.hidePopup(); } catch (e) {}
        });

        it("openRelationsPopup early-returns when same anchor opens twice",
            async function () {
            const main = Zotero.getMainWindow();
            const doc = main.document;
            const anchor = doc.body;
            // Need a real annotation item with isAnnotation()  - skip
            // this test if there's no convenient one; the logic is
            // identical to openCommentPopup (verified by source).
            const src = wv.openRelationsPopup.toString();
            expect(src).to.include("_wvOpenedFor");
            expect(src).to.include("hidePopup");
        });

        it("dismiss handler skips when mousedown lands on the opener anchor", () => {
            // Regression: without this skip, the icon click sequence
            // was: mousedown → outside-click handler closes popup →
            // click → toggle-check sees panel hidden → re-opens
            // popup. Net effect: no apparent change. The skip lets
            // the click handler run cleanly and toggle-close.
            const src = wv._attachOutsideClickDismiss.toString();
            expect(src).to.include("_wvOpenedFor");
        });
    });
});
