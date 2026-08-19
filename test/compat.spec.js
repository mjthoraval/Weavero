/* global describe, it, before, expect, Zotero */

// Compatibility guards asserted against the SHIPPED BUNDLE, not the source.
//
// Firefox 153 — the platform behind Zotero 11 — renamed `ownerGlobal` to
// `documentGlobal` and moved it from EventTarget to Node (Bug 2033243), so
// `node.ownerGlobal` reads undefined there and throws at the next property
// access off it. Every site was routed through `winOf()` in src/lib/dom.ts.
//
// Why a test rather than a convention note: the old spelling is the obvious
// thing to reach for, it is what every Zotero example still shows, and the
// breakage is INVISIBLE on the platform we develop against — the Windows
// Gecko pin is still 140, where ownerGlobal works perfectly. A regression
// would therefore sit unnoticed until Zotero 11. This fails the build the
// moment it reappears.
//
// Reading the BUNDLE rather than src/ is deliberate: it is what actually
// ships, so it also catches a stray use arriving through a dependency or a
// build-time transform, which a source scan would miss.

describe("Weavero — Firefox 153 compatibility", () => {
    let bundle;

    before(async function () {
        if (!(Zotero.Weavero && Zotero.Weavero.plugin)) this.skip();
        // Zotero.Plugins.getRootURI resolves the installed XPI's jar: URI.
        // Deliberately NOT wrapped in a try/skip: a guard that quietly skips
        // itself when it cannot read the bundle is worse than no guard, since
        // it would report green while checking nothing.
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const res = await fetch(rootURI + "index.js");
        bundle = await res.text();
        expect(bundle.length, "bundle looks empty").to.be.above(1000);
    });

    it("ships winOf() and the documentGlobal spelling", () => {
        expect(bundle).to.contain("documentGlobal");
    });

    // FF153 paints plain panels' shadow ::part(content) and ignores the
    // --panel-background var chain (verified live 2026-08-18) — without a
    // DIRECT background on the part every Weavero plain panel renders
    // translucent on Zotero 11. Both stylesheets must carry the rule: the
    // main-window sheet (constants.ts) and the reader-iframe hovercard
    // sheet (reader-panels.ts BM_HOVERCARD_CSS).
    it("ships the FF153 plain-panel background rule (both sheets)", () => {
        const rule = /panel\[id\^="wv-"\]:not\(\[type="arrow"\]\)::part\(content\)/g;
        const hits = (bundle.match(rule) || []).length;
        expect(hits, "part-background rule present in main + reader sheets")
            .to.be.at.least(2);
    });

    // Exactly ONE occurrence is expected: the deliberate fallback inside
    // winOf(). Anything above that is a bare use that will break on Zotero 11.
    it("contains no bare ownerGlobal outside winOf()", () => {
        const hits = (bundle.match(/\.ownerGlobal\b/g) || []).length;
        expect(
            hits,
            "Expected exactly 1 (winOf's fallback). Extra hits are bare uses "
            + "that read undefined on Firefox 153 — use winOf(node) from "
            + "src/lib/dom.ts instead.",
        ).to.equal(1);
    });

    // The order inside winOf matters: documentGlobal must be tried FIRST, so
    // behaviour does not change again once the old spelling disappears.
    it("prefers documentGlobal over ownerGlobal in the fallback chain", () => {
        const iDoc = bundle.indexOf("documentGlobal");
        const iOwn = bundle.indexOf(".ownerGlobal");
        expect(iDoc).to.be.above(-1);
        expect(iOwn).to.be.above(-1);
        expect(iDoc, "documentGlobal must be checked first").to.be.below(iOwn);
    });
});
