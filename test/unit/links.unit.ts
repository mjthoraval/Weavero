// Node-tier unit tests for src/lib/links.ts — plain Node, no Zotero.
// The in-Zotero links.spec.js remains as the adapter/pref-integration
// check (URL_REGEX assembly is pref-driven there; here we test the pure
// assembly and classification directly).
import { expect } from "chai";
import { MD_REGEX, schemeAltPart, joinSchemeAlt, buildUrlRegex, urlLinkClass, urlPattern } from "../../src/lib/links";

describe("lib/links — urlLinkClass()", () => {
    it("zotero:// → wv-link-zotero", () => {
        expect(urlLinkClass("zotero://select/library/items/X")).to.equal("wv-link-zotero");
    });
    it("https:// and http:// → wv-link-http (case-insensitive)", () => {
        expect(urlLinkClass("https://x.org")).to.equal("wv-link-http");
        expect(urlLinkClass("HTTP://x.org")).to.equal("wv-link-http");
    });
    it("schemeless www. → wv-link-http", () => {
        expect(urlLinkClass("www.google.fr")).to.equal("wv-link-http");
        expect(urlLinkClass("WWW.X.ORG")).to.equal("wv-link-http");
    });
    it("everything else → wv-link-app", () => {
        expect(urlLinkClass("obsidian://open?vault=v")).to.equal("wv-link-app");
        expect(urlLinkClass("mailto:a@b.c")).to.equal("wv-link-app");
    });
    it("falsy input falls back to wv-link-http (sane default)", () => {
        expect(urlLinkClass(null)).to.equal("wv-link-http");
        expect(urlLinkClass("")).to.equal("wv-link-http");
    });
});

describe("lib/links — scheme alternation assembly", () => {
    it("schemeAltPart escapes `/` in the separator", () => {
        expect(schemeAltPart("obsidian", "://")).to.equal("obsidian:\\/\\/");
        expect(schemeAltPart("mailto", ":")).to.equal("mailto:");
    });
    it("joinSchemeAlt joins with |", () => {
        expect(joinSchemeAlt(["a", "b"])).to.equal("a|b");
    });
    it("joinSchemeAlt returns the never-matching sentinel for empty input", () => {
        const alt = joinSchemeAlt([]);
        expect(alt).to.equal("\\b\\B");
        // the whole point: a regex built from it matches NOTHING
        const re = buildUrlRegex(alt);
        expect(re.test("https://x.org")).to.equal(false);
        expect(re.test("any text at all")).to.equal(false);
    });
});

describe("lib/links — buildUrlRegex()", () => {
    const re = () => buildUrlRegex(joinSchemeAlt(["https?:\\/\\/", "zotero:\\/\\/"]));
    it("matches bare https and zotero URLs", () => {
        expect(re().test("https://doi.org/10.1017/jfm")).to.equal(true);
        expect(re().test("zotero://select/library/items/ABCD1234")).to.equal(true);
    });
    it("matches a URL embedded in surrounding text", () => {
        const m = "see https://x.org/p for details".match(re());
        expect(m && m[0]).to.equal("https://x.org/p");
    });
    it("does NOT match plain text without a scheme", () => {
        expect(re().test("no links here")).to.equal(false);
    });
    it("URL body stops at whitespace and quote characters", () => {
        const m = 'x https://x.org/a"quoted'.match(re());
        expect(m && m[0]).to.equal("https://x.org/a");
    });
});

// Issue #56: a namespace declaration's value is not a link.
describe("lib/links — never a link inside an xmlns value (#56)", () => {
    const ALT = joinSchemeAlt(["https?:\\/\\/", "\\bwww\\.", "zotero:\\/\\/"]);
    const all = (t: string) => Array.from(t.matchAll(new RegExp(buildUrlRegex(ALT).source, "gi")), m => m[0]);
    const viaPattern = (t: string) => Array.from(t.matchAll(new RegExp("(" + urlPattern(ALT) + ")", "g")), m => m[1]);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">\n'
        + '  <rect x="10" y="10" width="80" height="80" fill="#fed7aa"/>\n</svg>';

    it("bare SVG source: no link (nor its www. tail)", () => {
        expect(all(svg)).to.deep.equal([]);
        expect(buildUrlRegex(ALT).test(svg)).to.equal(false);
    });
    it("fenced SVG source: no link", () => {
        expect(all("```svg\n" + svg + "\n```")).to.deep.equal([]);
    });
    it("prefixed, single-quoted, spaced and unquoted declarations", () => {
        expect(all("<svg xmlns:xlink='http://www.w3.org/1999/xlink'>")).to.deep.equal([]);
        expect(all('<x xmlns = "https://example.org/ns">')).to.deep.equal([]);
        expect(all("<x xmlns=http://example.org/ns>")).to.deep.equal([]);
    });
    it("real links around and inside the same markup stay links", () => {
        expect(all(svg + "\nSee https://example.com/figure for the source."))
            .to.deep.equal(["https://example.com/figure"]);
        expect(all('<a href="https://example.com/a">x</a>')).to.deep.equal(["https://example.com/a"]);
        expect(all('<use xlink:href="https://example.com/s.svg#i"/>')).to.deep.equal(["https://example.com/s.svg#i"]);
        expect(all('<svg xmlns="http://www.w3.org/2000/svg"> www.example.org')).to.deep.equal(["www.example.org"]);
    });
    it("prose mentioning xmlns keeps its link", () => {
        expect(all("the xmlns attribute: see https://www.w3.org/TR/xml-names/"))
            .to.deep.equal(["https://www.w3.org/TR/xml-names/"]);
    });
    it("urlPattern (the renderers' tokenizer piece) follows the same rule", () => {
        expect(viaPattern(svg)).to.deep.equal([]);
        expect(viaPattern(svg + " https://example.com/x")).to.deep.equal(["https://example.com/x"]);
        // The renderers number their groups around it: it must add none.
        expect(new RegExp("(?:" + urlPattern(ALT) + ")|").exec("")!.length - 1).to.equal(0);
    });
});

describe("lib/links — MD_REGEX", () => {
    it("matches **bold**, *italic*, ~~strike~~, `code`, [label](url)", () => {
        expect(MD_REGEX.test("a **b** c")).to.equal(true);
        expect(MD_REGEX.test("a *b* c")).to.equal(true);
        expect(MD_REGEX.test("a ~~b~~ c")).to.equal(true);
        expect(MD_REGEX.test("a `b` c")).to.equal(true);
        expect(MD_REGEX.test("a [b](https://x.org) c")).to.equal(true);
    });
    it("does NOT match unmatched single asterisks or space-hugged stars", () => {
        expect(MD_REGEX.test("a * b c")).to.equal(false);
        expect(MD_REGEX.test("2 * 3 * 4")).to.equal(false);
    });
    it("does NOT match multi-line single-star italic (single-line by construction)", () => {
        expect(MD_REGEX.test("a *b\nc* d")).to.equal(false);
    });
});
