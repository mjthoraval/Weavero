// Node-tier unit tests for src/lib/dom.ts — plain Node, no Zotero.
//
// winOf() exists because Firefox 153 (the platform behind Zotero 11) RENAMED
// `ownerGlobal` to `documentGlobal` and moved it from EventTarget to Node
// (Bug 2033243). Weavero had 16 bare `X.ownerGlobal` uses, every one of which
// would evaluate to undefined there and throw at the next property access.
//
// The point of these tests is that the helper must work on BOTH platforms at
// once — Zotero 9/10 (old name) and 11 (new name) — so it can land, and be
// verified, long before the runtime actually moves. That is exactly what a
// plain-Node test can assert without a Zotero of either vintage.
import { expect } from "chai";
import { winOf } from "../../src/lib/dom";

describe("lib/dom — winOf()", () => {
    const win = { name: "the window" };

    it("prefers documentGlobal — the Firefox 153 spelling", () => {
        expect(winOf({ documentGlobal: win })).to.equal(win);
    });

    it("falls back to ownerGlobal — Zotero 9/10 (Firefox 115/140)", () => {
        expect(winOf({ ownerGlobal: win })).to.equal(win);
    });

    // During the migration a node may legitimately expose both. The new name
    // must win, so behaviour does not change again when the old one is dropped.
    it("uses documentGlobal when BOTH are present", () => {
        const other = { name: "stale" };
        expect(winOf({ documentGlobal: win, ownerGlobal: other })).to.equal(win);
    });

    it("accepts a Document directly, via defaultView", () => {
        expect(winOf({ defaultView: win })).to.equal(win);
    });

    it("falls back to ownerDocument.defaultView for a plain element", () => {
        expect(winOf({ ownerDocument: { defaultView: win } })).to.equal(win);
    });

    // Every caller sits in Zotero's UI paths, so this must degrade rather than
    // throw: a Weavero failure must never break the app.
    it("returns null instead of throwing for nodes with no window", () => {
        expect(winOf(null)).to.equal(null);
        expect(winOf(undefined)).to.equal(null);
        expect(winOf({})).to.equal(null);
        expect(winOf({ ownerDocument: null })).to.equal(null);
        expect(winOf({ ownerDocument: {} })).to.equal(null);
    });

    it("never throws on a hostile node", () => {
        const hostile = {
            get documentGlobal() { throw new Error("boom"); },
        };
        expect(() => winOf(hostile)).to.not.throw();
        expect(winOf(hostile)).to.equal(null);
    });
});
