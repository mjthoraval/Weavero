/* global describe, it, before, assert, Zotero */

// Robust DOM anchors (2026-09-01). Upstream's toSelector emits a TAG-BASED
// selector, which failed twice on real snapshots:
//   * non-unique: an in-image pin stored the bare tag "svg", which matches
//     the first svg anywhere -- and resolved to NOTHING once the page
//     rendered its figures as <img> data-URIs ("Where is it?", MJT);
//   * invalid CSS: saved HTML with colon tag names (`xhtml:span`) makes
//     querySelector throw outright (upstream-bugs #15).
// Weavero stores a tag-free index path plus, for media, an identity hint,
// both inside the standard CssSelector shape so upstream still resolves them.

describe("Weavero — robust DOM anchors", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvDomIndexPath !== "function") this.skip();
    });

    const docWith = (html) => {
        const d = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-anchor");
        d.body.innerHTML = html;
        return d;
    };

    describe("index path", () => {
        it("is tag-free, valid, and resolves back to the same element", () => {
            const d = docWith("<div><p>one</p><p>two</p><section><b>deep</b></section></div>");
            const target = d.querySelector("section > b");
            const path = wv._wvDomIndexPath(target);
            assert.isString(path);
            // Tag-free: only the body anchor and *:nth-child segments.
            assert.match(path, /^body( > \*:nth-child\(\d+\))+$/,
                "no tag names in the path");
            assert.equal(d.querySelector(path), target, "resolves to the same element");
        });

        it("distinguishes siblings", () => {
            const d = docWith("<div><p>one</p><p>two</p><p>three</p></div>");
            const ps = [...d.querySelectorAll("p")];
            const paths = ps.map((p) => wv._wvDomIndexPath(p));
            assert.equal(new Set(paths).size, 3, "three distinct paths");
            ps.forEach((p, i) => assert.equal(d.querySelector(paths[i]), p));
        });

        it("survives a document whose tag names are invalid CSS", () => {
            // The exact shape that breaks upstream: an element literally
            // named "xhtml:span" in the ancestor chain.
            const d = docWith("<div><ol><li></li></ol></div>");
            const li = d.querySelector("li");
            const weird = d.createElement("xhtml:span");
            weird.textContent = "reference text";
            li.appendChild(weird);
            assert.throws(() => d.querySelector("xhtml:span > b"), /selector/i);
            const path = wv._wvDomIndexPath(weird);
            assert.equal(d.querySelector(path), weird, "index path still resolves");
        });
    });

    describe("media identity hint", () => {
        const HTML = '<div><img id="a" src="data:image/png;base64,AAAABBBBCCCCDDDD" alt="Figure 1">'
            + '<img id="b" src="data:image/png;base64,ZZZZYYYYXXXXWWWW" alt="Figure 2"></div>';

        it("recovers the element by src tail even if it moved", () => {
            const d = docWith(HTML);
            const hint = wv._wvDomMediaHint(d.querySelector("#a"));
            assert.equal(hint.tag, "img");
            assert.isOk(hint.srcTail);
            // move it: the path would now be wrong, the hint still finds it
            const holder = d.createElement("section");
            d.body.appendChild(holder);
            holder.appendChild(d.querySelector("#a"));
            assert.equal(wv._wvDomFindByHint(d, hint).id, "a");
        });

        it("falls back to alt text when the source changed", () => {
            const d = docWith(HTML);
            const hint = wv._wvDomMediaHint(d.querySelector("#b"));
            d.querySelector("#b").setAttribute("src", "data:image/png;base64,TOTALLYDIFFERENT");
            assert.equal(wv._wvDomFindByHint(d, hint).id, "b");
        });

        it("refuses a wildly different element rather than pinning the wrong one", () => {
            const d = docWith(HTML);
            const hint = { tag: "svg", srcTail: "NOTHINGMATCHES", alt: "", w: 900, h: 700 };
            // both candidates are 0x0 in a detached document -> size gate fails
            assert.isNull(wv._wvDomFindByHint(d, hint));
        });

        it("returns null when the document holds no media at all", () => {
            const d = docWith("<p>text only</p>");
            assert.isNull(wv._wvDomFindByHint(d, { tag: "img", srcTail: "x", alt: "", w: 10, h: 10 }));
        });
    });

    describe("selector validation", () => {
        it("accepts a selector that hits the intended element", () => {
            const d = docWith("<div><p id='p1'>one</p></div>");
            const el = d.querySelector("#p1");
            assert.isTrue(wv._wvDomSelectorHits(d, "#p1", el));
        });

        it("rejects a non-unique selector pointing at a different element", () => {
            const d = docWith("<div><svg id='s1'></svg><svg id='s2'></svg></div>");
            const second = d.querySelector("#s2");
            assert.isFalse(wv._wvDomSelectorHits(d, "svg", second),
                "bare tag matches the FIRST svg, not this one");
        });

        it("rejects (without throwing) an invalid selector", () => {
            const d = docWith("<div></div>");
            assert.isFalse(wv._wvDomSelectorHits(d, "xhtml:span > div", d.querySelector("div")));
        });
    });

    describe("EPUB CFI anchors (the dev.7-11 corruption family)", () => {
        // A FragmentSelector's value is an epubcfi -- NEVER a CSS selector.
        // The dev.7 hardening tested it as CSS ("fails" every time) and
        // overwrote it with an index path while keeping the CFI type: an
        // anchor nothing could resolve, so a dragged EPUB pin snapped back
        // to its old spot on the next click (MJT 2026-09-01).

        const stubPv = (doc) => ({
            toDisplayedRange: () => null,          // upstream can't resolve it
            _iframeDocument: doc,
        });

        it("salvages a corrupted anchor: CSS path stored under a CFI type", () => {
            const d = docWith("<div><p>one</p><p>two</p></div>");
            const rng = wv._wvDomRangeForAnchor(stubPv(d), { position: {
                type: "FragmentSelector", value: "body > *:nth-child(1) > *:nth-child(2)",
            } });
            assert.isOk(rng, "resolved via the salvage branch");
            assert.equal(rng.startContainer.childNodes[rng.startOffset],
                d.querySelectorAll("p")[1]);
        });

        it("never tries a real epubcfi value as a CSS selector", () => {
            const d = docWith("<div><p>one</p></div>");
            const rng = wv._wvDomRangeForAnchor(stubPv(d), { position: {
                type: "FragmentSelector", value: "epubcfi(/6/8!/4/2)",
            } });
            assert.isNull(rng, "unresolvable CFI stays null -- honest failure");
        });

        it("falls back to the spare wvPath when the primary value is dead", () => {
            const d = docWith("<div><p>one</p><p>two</p></div>");
            const rng = wv._wvDomRangeForAnchor(stubPv(d), { position: {
                type: "FragmentSelector", value: "epubcfi(/6/8!/4/2)",
                wvPath: "body > *:nth-child(1) > *:nth-child(1)",
            } });
            assert.isOk(rng, "spare path resolved");
            assert.equal(rng.startContainer.childNodes[rng.startOffset],
                d.querySelector("p"));
        });
    });
});
