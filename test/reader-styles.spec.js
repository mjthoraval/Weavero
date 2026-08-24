/* global describe, it, before, assert, Zotero */

// `_ensureReaderOuterStyles` must be IDEMPOTENT (2026-08-24).
//
// It injects Weavero's ~35KB reader stylesheet into the reader's outer
// iframe. It used to remove-then-add unconditionally, "defensively", in case
// a previous plugin instance had left a stale element behind. But
// `_sidebarHandlerImpl` calls it on EVERY annotation row render — so opening
// a 226-annotation PDF removed and re-created a stylesheet 226 times, inside
// React's synchronous flushSync.
//
// Removing a <style> invalidates the whole document's styles and re-parses
// the CSS, so each call forced a full restyle of the reader. Measured by
// differential Gecko profile:
//
//   arm            settled     main-thread block
//   no Weavero     3,773 ms    0
//   Weavero, no reader surfaces
//                  3,847 ms    0
//   BEFORE        14,883 ms    7,256 ms
//   AFTER          5,850 ms    0
//
//   execCommand in blocking stacks   3,367 -> 72
//   Style computation                2,513 -> 131
//   Update stylesheet information        82 -> 1
//
// The bug also defeated diagnosis for hours: disabling Weavero's stylesheets
// changed nothing, because this code recreated them — undisabled — on the
// very next row.
//
// The guard: calling it repeatedly on the same document must keep the SAME
// element instance. A regression re-introducing remove-then-add fails here.

describe("Weavero — reader stylesheet injection is idempotent", () => {
    let wv, doc, host;
    const ID = "weavero-reader-outer-styles";

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._ensureReaderOuterStyles !== "function") this.skip();
        doc = Zotero.getMainWindow().document;
        // A detached document stands in for the reader's outer iframe: the
        // method only needs getElementById / createElement / head.
        host = doc.implementation.createHTMLDocument("wv-style-test");
    });

    it("injects the stylesheet on first call", () => {
        wv._ensureReaderOuterStyles(host);
        const el = host.getElementById(ID);
        assert.ok(el, "stylesheet must be injected");
        assert.isAbove((el.textContent || "").length, 100, "should carry real CSS");
    });

    it("keeps the SAME element across repeated calls", () => {
        wv._ensureReaderOuterStyles(host);
        const first = host.getElementById(ID);
        for (let i = 0; i < 25; i++) wv._ensureReaderOuterStyles(host);
        const after = host.getElementById(ID);
        assert.strictEqual(after, first,
            "remove-then-add on every call forces a full document restyle — "
            + "this is called once per annotation row");
    });

    it("never accumulates duplicates", () => {
        for (let i = 0; i < 10; i++) wv._ensureReaderOuterStyles(host);
        assert.equal(host.querySelectorAll("#" + ID).length, 1);
    });

    it("still replaces an element left by a DIFFERENT plugin instance", () => {
        // The original defensive intent must survive: a stale element from a
        // previous instance carries no (or a foreign) instance stamp.
        const stale = host.createElement("style");
        stale.id = ID;
        stale.setAttribute("data-wv-instance", "some-older-instance");
        stale.textContent = "/* stale */";
        host.getElementById(ID).remove();
        (host.head || host.documentElement).appendChild(stale);

        wv._ensureReaderOuterStyles(host);
        const fresh = host.getElementById(ID);
        assert.notStrictEqual(fresh, stale, "a foreign-stamped element must be replaced");
        assert.notInclude(fresh.textContent || "", "/* stale */");
    });

    it("is cheap when already present — 200 calls stay well under a second", () => {
        wv._ensureReaderOuterStyles(host);
        const t0 = Date.now();
        for (let i = 0; i < 200; i++) wv._ensureReaderOuterStyles(host);
        const ms = Date.now() - t0;
        assert.isBelow(ms, 1000,
            "200 calls is the real-world shape (one per annotation row); "
            + "re-creating the element made this pathological");
    });
});
