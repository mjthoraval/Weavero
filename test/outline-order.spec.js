/* global describe, it, before, assert, Zotero */

// Document-order insertion for outline entries (2026-08-24).
//
// `_wvOutlineDocOrderGap` decides WHERE a newly added outline entry lands. It
// was pure PDF page geometry -- `pos.pageIndex` and `pos.rects[0][3]`. A DOM
// view (snapshot / EPUB) anchors by WADM selector and has NEITHER, so every
// value collapsed to 0 / -1, the loop never broke, and every entry added from
// a snapshot selection fell silently to the bottom of the list.
//
// The DOM path resolves each anchor against the LIVE document via the view's
// own `toDisplayedRange` (EPUB TOC entries via `_getHrefTarget`) and compares
// boundary points. These tests use a REAL document and REAL ranges, so the
// ordering comparison under test is the genuine one -- only the view's
// selector-resolution is stubbed, because that is the reader's job, not ours.

// Location->title matching for the native-outline highlight interception:
// AMBIGUITY DECLINES (2026-08-26). Some embedded outlines stamp every entry
// with one degenerate destination (Kundu: y=666 on every entry), so two
// entries on the same page are indistinguishable by position. Taking the
// first in tree order recovered the WRONG title and highlighted the page's
// running head ("β-Plane Model" lighting up "13.4 GEOSTROPHIC FLOW"). No
// highlight beats a confidently wrong one -- the scroll still lands.
describe("Weavero — outline location→title matching declines ambiguity", () => {
    let wv;
    const loc = (page, x, y) => ({ position: { pageIndex: page, rects: [[x, y, x, y]] } });
    const entry = (title, l, items) => ({ title, location: l, items: items || [] });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineFindTitle !== "function") this.skip();
    });

    it("a unique position resolves to its title", () => {
        const o = [entry("One", loc(3, 0, 666)), entry("Two", loc(4, 0, 666))];
        assert.equal(wv._wvOutlineFindTitle(o, loc(4, 0, 666)), "Two");
    });

    it("identity beats position, even among twins", () => {
        const shared = loc(7, 0, 666);
        const o = [entry("A", loc(7, 0, 666)), entry("B", shared)];
        assert.equal(wv._wvOutlineFindTitle(o, shared), "B");
    });

    it("two entries at one degenerate position -> NO title (the Kundu case)", () => {
        const o = [entry("13.3", loc(1, 0, 0), [entry("β-Plane Model", loc(720, 0, 666))]),
                   entry("13.4 Geostrophic Flow", loc(720, 0, 666))];
        assert.equal(wv._wvOutlineFindTitle(o, loc(720, 0, 666)), "",
            "a guessed title highlights the wrong text; declining scrolls cleanly");
    });

    it("duplicate matches of the SAME title still resolve", () => {
        const o = [entry("Same", loc(9, 0, 666)), entry("Same", loc(9, 0, 666))];
        assert.equal(wv._wvOutlineFindTitle(o, loc(9, 0, 666)), "Same");
    });
});

describe("Weavero — outline document-order insertion", () => {
    let wv, host, host2, pv;

    const sel = (id) => ({ type: "CssSelector", value: id });
    const entryAt = (id) => ({ position: sel(id), indentLevel: 0 });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineDocOrderGap !== "function") this.skip();
        const doc = Zotero.getMainWindow().document;
        host = doc.implementation.createHTMLDocument("wv-order-test");
        host.body.innerHTML = "<p id='a'>Alpha</p><p id='b'>Beta</p>"
            + "<p id='c'>Gamma</p><p id='d'>Delta</p>";
        // A SECOND document, to prove cross-document points are not compared.
        host2 = doc.implementation.createHTMLDocument("wv-order-other");
        host2.body.innerHTML = "<p id='x'>Elsewhere</p>";

        const rangeIn = (d, id) => {
            const el = d.getElementById(id);
            if (!el) return null;
            const r = d.createRange();
            r.selectNodeContents(el);
            return r;
        };
        pv = {
            // No _iframeWindow -> _wvOutlineDomPoint skips cloneInto and passes
            // the selector straight through, which is what we want in-process.
            _iframeWindow: null,
            toDisplayedRange: (s) => {
                if (!s || !s.value) return null;
                if (s.value === "OTHERDOC") return rangeIn(host2, "x");
                return rangeIn(host, s.value);   // null for an unknown id
            },
            _getHrefTarget: (href) => host.getElementById(href),
        };
    });

    describe("snapshot selectors", () => {
        it("inserts between the entries that surround the selection", () => {
            const entries = [entryAt("a"), entryAt("b"), entryAt("d")];
            // Selection sits at "c": after a and b, before d.
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("c"), pv);
            assert.equal(gap, 2, "should land after b and before d");
        });

        it("inserts at the top when the selection precedes everything", () => {
            const entries = [entryAt("b"), entryAt("c"), entryAt("d")];
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("a"), pv);
            assert.equal(gap, 0);
        });

        it("appends when the selection follows everything", () => {
            const entries = [entryAt("a"), entryAt("b"), entryAt("c")];
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("d"), pv);
            assert.equal(gap, 3);
        });

        it("appends -- not prepends -- when the selection cannot be resolved", () => {
            const entries = [entryAt("a"), entryAt("b")];
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("nonexistent"), pv);
            assert.equal(gap, 2,
                "an unplaceable entry goes to the end; guessing a position is worse");
        });
    });

    describe("entries that will not resolve", () => {
        it("skips them instead of breaking on them", () => {
            // A stale selector sits BEFORE the true insertion point. If it were
            // treated as a break the entry would land at index 1, above content
            // it actually follows.
            const entries = [entryAt("a"), entryAt("gone"), entryAt("c")];
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("b"), pv);
            assert.equal(gap, 2, "the unresolvable entry must be skipped, not break the scan");
        });

        it("does not compare points from a different document", () => {
            // An entry resolving into another document is not orderable here.
            const entries = [entryAt("a"), entryAt("OTHERDOC"), entryAt("d")];
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("c"), pv);
            assert.equal(gap, 2, "cross-document point skipped, so d is the break");
        });
    });

    describe("EPUB href anchors", () => {
        it("orders TOC entries that anchor by href, not position", () => {
            const entries = [{ href: "a", indentLevel: 0 }, { href: "d", indentLevel: 0 }];
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("b"), pv);
            assert.equal(gap, 1, "between the a and d chapters");
        });

        it("mixes href TOC entries with selector entries in one list", () => {
            // Real shape after a user adds to a native EPUB outline.
            const entries = [{ href: "a", indentLevel: 0 }, entryAt("b"), { href: "d", indentLevel: 0 }];
            const { gap } = wv._wvOutlineDocOrderGap(entries, sel("c"), pv);
            assert.equal(gap, 2);
        });
    });

    describe("indent", () => {
        it("adopts the deeper of the neighbours, as the PDF path always did", () => {
            const entries = [
                { position: sel("a"), indentLevel: 0 },
                { position: sel("d"), indentLevel: 2 },
            ];
            const { gap, indent } = wv._wvOutlineDocOrderGap(entries, sel("b"), pv);
            assert.equal(gap, 1);
            assert.equal(indent, 2, "next entry is deeper, so match it");
        });
    });

    describe("the PDF geometry path is untouched", () => {
        const pdf = (page, top) => ({ pageIndex: page, rects: [[0, top, 10, top]] });

        it("still orders by page then by rect top", () => {
            const entries = [
                { position: pdf(0, 700), indentLevel: 0 },
                { position: pdf(1, 500), indentLevel: 0 },
                { position: pdf(3, 200), indentLevel: 0 },
            ];
            // Page 2 sits between page 1 and page 3. No pv passed at all.
            const { gap } = wv._wvOutlineDocOrderGap(entries, pdf(2, 400));
            assert.equal(gap, 2);
        });

        it("ignores a DOM view when the position IS page geometry", () => {
            const entries = [
                { position: pdf(0, 700), indentLevel: 0 },
                { position: pdf(2, 300), indentLevel: 0 },
            ];
            // pv present, but rects mean this is a PDF position: geometry wins.
            const { gap } = wv._wvOutlineDocOrderGap(entries, pdf(1, 400), pv);
            assert.equal(gap, 1);
        });
    });
});
