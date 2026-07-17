// Node-tier unit tests for src/lib/links.ts — plain Node, no Zotero.
// The in-Zotero links.spec.js remains as the adapter/pref-integration
// check (URL_REGEX assembly is pref-driven there; here we test the pure
// assembly and classification directly).
import { expect } from "chai";
import { MD_REGEX, schemeAltPart, joinSchemeAlt, buildUrlRegex, urlLinkClass } from "../../src/lib/links";

describe("lib/links — urlLinkClass()", () => {
    it("zotero:// → wv-link-zotero", () => {
        expect(urlLinkClass("zotero://select/library/items/X")).to.equal("wv-link-zotero");
    });
    it("https:// and http:// → wv-link-http (case-insensitive)", () => {
        expect(urlLinkClass("https://x.org")).to.equal("wv-link-http");
        expect(urlLinkClass("HTTP://x.org")).to.equal("wv-link-http");
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
