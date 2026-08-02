// Node-tier unit tests for the wvpos selection-link payload — the pure
// encode/decode pair in src/modules/url.ts (no Zotero needed at import or
// call time; btoa/atob are Node globals since 16+).
//
// Field scheme (v1, designed 2026-08-02):
//   p  pageIndex          r  rects (Zotero annotation position format, 2dp)
//   v  format version     k  "pin" for point markers
//   t  quote: full when <=400 chars, else the FIRST 200
//   tt LAST 200 chars, present only when t is truncated (exact-span recovery)
//   tp/ts 16-char TextQuoteSelector-style context, short selections only
import { expect } from "chai";
import { urlMethods } from "../../src/modules/url";

const enc = (sel: any) => (urlMethods as any)._wvEncodeSelectionPos(sel);
const dec = (raw: any) => (urlMethods as any)._wvDecodeSelectionPos(raw);
const decodePayload = (raw: string) => {
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
};

const RECTS = [[72.123456, 600.5, 340.99, 612.2], [72.1, 588.4, 290.05, 600.1]];

describe("wvpos — encode/decode round trip", () => {
    it("medium text: full t, no tt/tp/ts, v=1", () => {
        const text = "a".repeat(120);
        const raw = enc({ position: { pageIndex: 15, rects: RECTS }, text });
        const o = decodePayload(raw);
        expect(o.v).to.equal(1);
        expect(o.t).to.equal(text);
        expect(o.tt).to.equal(undefined);
        expect(o.tp).to.equal(undefined);
        const d = dec(raw);
        expect(d.text).to.equal(text);
        expect(d.textTail).to.equal("");
        expect(d.kind).to.equal("text");
        expect(d.version).to.equal(1);
        expect(d.position.pageIndex).to.equal(15);
    });

    it("rects are rounded to 2dp and round-trip exactly", () => {
        const d = dec(enc({ position: { pageIndex: 3, rects: RECTS }, text: "x".repeat(80) }));
        expect(d.position.rects).to.deep.equal([[72.12, 600.5, 340.99, 612.2], [72.1, 588.4, 290.05, 600.1]]);
    });

    it("output is URL-safe base64 (no + / =)", () => {
        const raw = enc({ position: { pageIndex: 0, rects: RECTS }, text: "é å ← ⭐ some unicode →" });
        expect(/[+/=]/.test(raw)).to.equal(false);
        expect(dec(raw).text).to.contain("⭐");
    });
});

describe("wvpos — role-based text fields", () => {
    it("short text (<60) carries tp/ts context, capped at 16 and normalised", () => {
        const raw = enc({
            position: { pageIndex: 1, rects: RECTS }, text: "the results",
            prefix: "in   agreement\nwith the following words before ",
            suffix: " of Stow and Hadfield plus much   more after",
        });
        const o = decodePayload(raw);
        expect(o.t).to.equal("the results");
        expect(o.tp).to.have.lengthOf(16);
        expect(o.ts).to.have.lengthOf(16);
        // tp is the LAST 16 of the normalised prefix; ts the FIRST 16 of the suffix.
        const normPrefix = "in agreement with the following words before ";
        expect(o.tp).to.equal(normPrefix.slice(-16));
        expect(o.ts).to.equal(" of Stow and Had");
        const d = dec(raw);
        expect(d.prefix).to.equal(o.tp);
        expect(d.suffix).to.equal(o.ts);
    });

    it("short text without context omits tp/ts", () => {
        const o = decodePayload(enc({ position: { pageIndex: 1, rects: RECTS }, text: "short" }));
        expect(o.tp).to.equal(undefined);
        expect(o.ts).to.equal(undefined);
    });

    it("medium text (>=60) never carries tp/ts even when context is supplied", () => {
        const o = decodePayload(enc({
            position: { pageIndex: 1, rects: RECTS }, text: "m".repeat(60),
            prefix: "before", suffix: "after",
        }));
        expect(o.tp).to.equal(undefined);
        expect(o.ts).to.equal(undefined);
    });

    it("long text (>400) splits into first-200 head + last-200 tail", () => {
        const text = "S".repeat(10) + "x".repeat(500) + "E".repeat(10);   // 520 chars
        const o = decodePayload(enc({ position: { pageIndex: 2, rects: RECTS }, text }));
        expect(o.t).to.equal(text.slice(0, 200));
        expect(o.tt).to.equal(text.slice(-200));
        expect(o.t).to.have.lengthOf(200);
        expect(o.tt).to.have.lengthOf(200);
        expect(o.tp).to.equal(undefined);
        const d = dec(enc({ position: { pageIndex: 2, rects: RECTS }, text }));
        expect(d.textTail).to.equal(text.slice(-200));
    });

    it("exactly 400 chars stays whole (no tail)", () => {
        const o = decodePayload(enc({ position: { pageIndex: 2, rects: RECTS }, text: "q".repeat(400) }));
        expect(o.t).to.have.lengthOf(400);
        expect(o.tt).to.equal(undefined);
    });

    it("whitespace is normalised before length rules apply", () => {
        const o = decodePayload(enc({ position: { pageIndex: 0, rects: RECTS }, text: "  a\n\n selected \t sentence  " }));
        expect(o.t).to.equal("a selected sentence");
    });
});

describe("wvpos — pin kind", () => {
    const POINT = [[300.5, 400.25, 300.5, 400.25]];
    it("anchor 'point' encodes k=pin and decodes kind=pin", () => {
        const raw = enc({ position: { pageIndex: 5, rects: POINT, anchor: "point" }, text: "" });
        expect(decodePayload(raw).k).to.equal("pin");
        expect(dec(raw).kind).to.equal("pin");
    });
    it("degenerate rect without the flag still decodes as pin (pre-flag links)", () => {
        const legacy = { p: 2, r: POINT };   // hand-built, no k, no v
        const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(legacy))))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const d = dec(b64);
        expect(d.kind).to.equal("pin");
        expect(d.version).to.equal(0);
    });
    it("a real selection decodes as kind=text", () => {
        expect(dec(enc({ position: { pageIndex: 5, rects: RECTS }, text: "hi" })).kind).to.equal("text");
    });
});

describe("wvpos — malformed input", () => {
    it("decode returns null on garbage / empty / missing rects", () => {
        expect(dec("not-base64!!")).to.equal(null);
        expect(dec("")).to.equal(null);
        const noRects = btoa(JSON.stringify({ p: 1 })).replace(/=+$/, "");
        expect(dec(noRects)).to.equal(null);
    });
    it("encode returns null without rects", () => {
        expect(enc({ position: { pageIndex: 1 }, text: "x" })).to.equal(null);
        expect(enc(null)).to.equal(null);
    });
    it("decoder ignores unknown future keys", () => {
        const future = { p: 1, r: RECTS, v: 9, zz: "future-field", t: "ok" };
        const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(future))))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const d = dec(b64);
        expect(d.text).to.equal("ok");
        expect(d.version).to.equal(9);
    });
});
