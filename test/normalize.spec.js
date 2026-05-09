/* global describe, it, before, expect, Zotero */

// Real unit tests on Weavero internals — `normalize`, INVISIBLE_RE,
// TRAILING_RE. These are pure-string helpers that don't touch
// Zotero state, so they're safe to run as soon as the plugin
// instance is mounted on Zotero.Weavero.

describe("Weavero — string normalization", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero;
        if (!wv) this.skip();
    });

    describe("normalize()", () => {
        it("returns empty string for null/undefined/empty input", () => {
            expect(wv.normalize(null)).to.equal("");
            expect(wv.normalize(undefined)).to.equal("");
            expect(wv.normalize("")).to.equal("");
        });

        it("preserves visible characters unchanged", () => {
            const s = "Hello, world! https://example.com";
            expect(wv.normalize(s)).to.equal(s);
        });

        it("strips zero-width space U+200B", () => {
            expect(wv.normalize("a​b")).to.equal("ab");
        });

        it("strips zero-width joiner U+200D", () => {
            expect(wv.normalize("x‍y")).to.equal("xy");
        });

        it("strips bidi controls (LRE/RLE/PDF/LRO/RLO)", () => {
            // ‪ LRE, ‫ RLE, ‬ PDF, ‭ LRO, ‮ RLO
            const dirty = "a‪‫‬‭‮b";
            expect(wv.normalize(dirty)).to.equal("ab");
        });

        it("strips line/paragraph separators U+2028 and U+2029", () => {
            expect(wv.normalize("a b c")).to.equal("abc");
        });

        it("strips BOM U+FEFF anywhere in the string", () => {
            expect(wv.normalize("﻿https://example.com﻿"))
                .to.equal("https://example.com");
        });

        it("coerces non-string inputs via String()", () => {
            expect(wv.normalize(42)).to.equal("42");
            expect(wv.normalize({ toString: () => "x" })).to.equal("x");
        });
    });

    describe("INVISIBLE_RE", () => {
        it("matches every invisible code point in the class", () => {
            const codepoints = [
                0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
                0x2028, 0x2029,
                0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
                0x2066, 0x2067, 0x2068, 0x2069,
                0xFEFF,
            ];
            for (const cp of codepoints) {
                const ch = String.fromCharCode(cp);
                expect(wv.INVISIBLE_RE.test(ch),
                    `U+${cp.toString(16).padStart(4, "0").toUpperCase()}`)
                    .to.equal(true);
                wv.INVISIBLE_RE.lastIndex = 0; // /g regex stateful reset
            }
        });

        it("does NOT match plain ASCII or common punctuation", () => {
            for (const ch of "abc 123 .,;:") {
                expect(wv.INVISIBLE_RE.test(ch), `char "${ch}"`)
                    .to.equal(false);
                wv.INVISIBLE_RE.lastIndex = 0;
            }
        });
    });

    describe("TRAILING_RE", () => {
        it("matches a trailing period", () => {
            expect(wv.TRAILING_RE.test("foo.")).to.equal(true);
        });

        it("matches a trailing closing bracket / paren", () => {
            expect(wv.TRAILING_RE.test("foo)")).to.equal(true);
            expect(wv.TRAILING_RE.test("foo]")).to.equal(true);
            expect(wv.TRAILING_RE.test("foo}")).to.equal(true);
        });

        it("matches a run of trailing punctuation", () => {
            expect(wv.TRAILING_RE.test('foo!?")')).to.equal(true);
        });

        it("does NOT match when trailing char is a letter or digit", () => {
            expect(wv.TRAILING_RE.test("foo")).to.equal(false);
            expect(wv.TRAILING_RE.test("foo123")).to.equal(false);
        });
    });
});
