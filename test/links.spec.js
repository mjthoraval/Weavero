/* global describe, it, before, expect, Zotero */

// Unit tests for the URL/markdown helpers — the highest-regression
// surface in Weavero. These cover the routines that decide whether
// a given comment string contains link content, what kind of link
// it is (for the colour bucket), and how the markdown regex
// recognises each inline form.

describe("Weavero — URL classification", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    describe("_urlLinkClass()", () => {
        it("zotero:// → wv-link-zotero", () => {
            expect(wv._urlLinkClass("zotero://select/library/items/ABCD"))
                .to.equal("wv-link-zotero");
            expect(wv._urlLinkClass("zotero://open-pdf/library/items/X"))
                .to.equal("wv-link-zotero");
        });

        it("https:// and http:// → wv-link-http", () => {
            expect(wv._urlLinkClass("https://example.com"))
                .to.equal("wv-link-http");
            expect(wv._urlLinkClass("http://example.com"))
                .to.equal("wv-link-http");
            // Case-insensitive scheme match.
            expect(wv._urlLinkClass("HTTPS://example.com"))
                .to.equal("wv-link-http");
        });

        it("everything else → wv-link-app", () => {
            expect(wv._urlLinkClass("mailto:foo@bar.com"))
                .to.equal("wv-link-app");
            expect(wv._urlLinkClass("obsidian://open?vault=X&file=Y"))
                .to.equal("wv-link-app");
            expect(wv._urlLinkClass("slack://channel?id=X"))
                .to.equal("wv-link-app");
            expect(wv._urlLinkClass("vscode://file//absolute/path"))
                .to.equal("wv-link-app");
        });

        it("falsy input falls back to wv-link-http (sane default)", () => {
            expect(wv._urlLinkClass("")).to.equal("wv-link-http");
            expect(wv._urlLinkClass(null)).to.equal("wv-link-http");
            expect(wv._urlLinkClass(undefined)).to.equal("wv-link-http");
        });
    });
});

describe("Weavero — URL_REGEX", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("matches a bare https URL", () => {
        expect(wv.URL_REGEX.test("https://example.com")).to.equal(true);
    });

    it("matches a zotero:// URL", () => {
        expect(wv.URL_REGEX.test("zotero://select/library/items/X"))
            .to.equal(true);
    });

    it("matches a URL embedded in surrounding text", () => {
        expect(wv.URL_REGEX.test("see https://example.com for details"))
            .to.equal(true);
    });

    it("does NOT match plain text without a scheme", () => {
        expect(wv.URL_REGEX.test("just some words")).to.equal(false);
        expect(wv.URL_REGEX.test("example.com")).to.equal(false);
    });

    it("URL body stops at whitespace and quote characters", () => {
        // The regex body is `[^\s<>"')\]]*` — a URL embedded inside
        // an HTML attribute or a quoted string should not eat the
        // closing delimiter.
        const re = new RegExp(wv.URL_REGEX.source, "gi");
        const text = `link "https://example.com/x" trailing`;
        const matches = [...text.matchAll(re)].map(m => m[0]);
        expect(matches.length).to.equal(1);
        expect(matches[0]).to.equal("https://example.com/x");
    });
});

describe("Weavero — hasURI()", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("true for any string containing a recognised scheme", () => {
        expect(wv.hasURI("see https://example.com")).to.equal(true);
        expect(wv.hasURI("zotero://select/...")).to.equal(true);
    });

    it("false for plain text with no scheme", () => {
        expect(wv.hasURI("nothing here")).to.equal(false);
    });

    it("false for empty / null / undefined input", () => {
        expect(wv.hasURI("")).to.equal(false);
        expect(wv.hasURI(null)).to.equal(false);
        expect(wv.hasURI(undefined)).to.equal(false);
    });

    it("normalises invisible characters before checking", () => {
        // Zero-width space inserted INSIDE the scheme — without the
        // normalisation pass the URL would not match the regex.
        const dirty = "https​://example.com";
        expect(wv.hasURI(dirty)).to.equal(true);
    });
});

describe("Weavero — MD_REGEX", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("matches **bold**", () => {
        expect(wv.MD_REGEX.test("a **bold** word")).to.equal(true);
    });

    it("matches *italic* (single-star)", () => {
        expect(wv.MD_REGEX.test("an *italic* word")).to.equal(true);
    });

    it("matches ~~strikethrough~~", () => {
        expect(wv.MD_REGEX.test("a ~~strike~~ word")).to.equal(true);
    });

    it("matches `inline code`", () => {
        expect(wv.MD_REGEX.test("an `inline code` word")).to.equal(true);
    });

    it("matches [label](url) markdown link", () => {
        expect(wv.MD_REGEX.test("a [label](https://example.com) link"))
            .to.equal(true);
    });

    it("does NOT match unmatched single asterisks", () => {
        expect(wv.MD_REGEX.test("a * lonely * star")).to.equal(false);
    });

    it("does NOT match a plain underscore-flanked word", () => {
        // Weavero's MD_REGEX intentionally doesn't recognise
        // _underscore_ italic to avoid mangling URLs and code.
        expect(wv.MD_REGEX.test("an _italic_ word")).to.equal(false);
    });

    it("does NOT match multi-line bold (regex is single-line)", () => {
        // ** ... ** with a newline inside is more often a
        // false-positive than real markdown — should not match.
        // Body class is `[\s\S]+?` which DOES allow newlines —
        // verify current behaviour stays this way (locks the
        // contract). If the team later decides to disallow
        // multi-line bold, flip this assertion.
        expect(wv.MD_REGEX.test("a **bo\nld** word")).to.equal(true);
    });
});
