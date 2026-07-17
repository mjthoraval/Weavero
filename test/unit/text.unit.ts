// Node-tier unit tests for src/lib/text.ts — run in plain Node via
// `npm run test:unit` (mocha + tsx), NO Zotero required. Named *.unit.ts
// (not *.spec.ts) so the scaffold's in-Zotero glob
// (test/**/*.{spec,test}.[jt]s) does not pick them up.
// The in-Zotero normalize.spec.js remains as the thin adapter check
// (verifies the plugin methods delegate here correctly).
import { expect } from "chai";
import { normalize, makeInvisibleRe, TRAILING_RE } from "../../src/lib/text";

describe("lib/text — normalize()", () => {
    it("returns empty string for null/undefined/empty input", () => {
        expect(normalize(null)).to.equal("");
        expect(normalize(undefined)).to.equal("");
        expect(normalize("")).to.equal("");
    });
    it("preserves visible characters unchanged", () => {
        expect(normalize("plain text, éàü, 中文")).to.equal("plain text, éàü, 中文");
    });
    it("strips zero-width space U+200B and joiner U+200D", () => {
        expect(normalize("a​b‍c")).to.equal("abc");
    });
    it("strips bidi controls (LRE/RLE/PDF/LRO/RLO)", () => {
        expect(normalize("‪a‫b‬c‭d‮e")).to.equal("abcde");
    });
    it("strips line/paragraph separators U+2028 and U+2029", () => {
        expect(normalize("a b c")).to.equal("abc");
    });
    it("strips BOM U+FEFF anywhere in the string", () => {
        expect(normalize("﻿https://x﻿.org")).to.equal("https://x.org");
    });
    it("coerces non-string inputs via String()", () => {
        expect(normalize(42)).to.equal("42");
        expect(normalize(true)).to.equal("true");
    });
});

describe("lib/text — makeInvisibleRe()", () => {
    it("matches every invisible code point in the class", () => {
        for (const ch of ["​", "‍", "‎", "‪", "⁦", "﻿", " "]) {
            expect(makeInvisibleRe().test(ch), "U+" + ch.codePointAt(0)!.toString(16)).to.equal(true);
        }
    });
    it("does NOT match plain ASCII or common punctuation", () => {
        expect(makeInvisibleRe().test("abc .,;:!?()[]")).to.equal(false);
    });
    it("returns a FRESH regex each call (shared /g regexes carry lastIndex state)", () => {
        expect(makeInvisibleRe()).to.not.equal(makeInvisibleRe());
    });
});

describe("lib/text — TRAILING_RE", () => {
    it("matches a trailing period / bracket / punctuation run", () => {
        expect(TRAILING_RE.test("https://x.org.")).to.equal(true);
        expect(TRAILING_RE.test("https://x.org)")).to.equal(true);
        expect(TRAILING_RE.test('https://x.org)."')).to.equal(true);
    });
    it("does NOT match when the trailing char is a letter or digit", () => {
        expect(TRAILING_RE.test("https://x.org/a1")).to.equal(false);
    });
});
