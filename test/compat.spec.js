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

    // Firefox 153 made hidden/collapsed/selected/disabled/checked BOOLEAN XUL
    // attributes, matched on presence alone: any value -- including the string
    // "false" -- means true. Measured on 11.0.SOURCE.77a3a8815 (2026-08-21):
    // setAttribute("disabled", "false") leaves el.disabled === true, so the
    // four sites that wrote String(cond) disabled their menu items
    // unconditionally. The 2026-08-21 fix moved them to toggleAttribute(),
    // which is WRONG THE OTHER WAY on Zotero 10 (Firefox 140), measured
    // 2026-09-23 on 10.0.3-beta.2: toggleAttribute(name, true) writes "",
    // which that platform does not honour -- the IDL getter stays false, a
    // vbox stays visible, a menuitem stays enabled -- it honours only the
    // literal "true" (the Advanced Search window's side panes never
    // collapsed; twelve menu entries never greyed or checked). Zotero 11
    // matches presence, which "true" satisfies. The one form correct on
    // both is the literal "true" / removeAttribute: wvSetBoolAttr() in
    // lib/dom.ts. So: no toggleAttribute() on these five, and no
    // setAttribute() with anything but the literal "true".
    it("writes boolean XUL attributes with the literal \"true\" (wvSetBoolAttr), never toggleAttribute or a computed value", () => {
        const reToggle = /toggleAttribute\(\s*["'](hidden|collapsed|selected|disabled|checked)["']/g;
        const toggles = bundle.match(reToggle) || [];
        expect(toggles, `toggleAttribute is a no-op on Zotero 10 for: ${toggles.join(", ")}`)
            .to.have.lengthOf(0);
        // the whitespace lives INSIDE the lookahead: after `,\s*` the engine backtracks
        // the spaces and tests the lookahead against a space, which then passes
        const reComputed = /setAttribute\(\s*["'](hidden|collapsed|selected|disabled|checked)["']\s*,(?!\s*["']true["']\s*\)|\s*true\s*\))/g;
        const computed = bundle.match(reComputed) || [];
        expect(computed, `boolean attrs take the literal "true" only: ${computed.join(", ")}`)
            .to.have.lengthOf(0);
        expect(bundle, "wvSetBoolAttr must ship").to.include("wvSetBoolAttr");
    });

    // The sneakier half: once anything sets these by presence, getAttribute()
    // returns "" and `=== "true"` is FALSE while the element IS hidden. The
    // reverse also bites -- measured, toggleAttribute("collapsed", true) sets
    // .collapsed on Zotero 11 but NOT on Zotero 10, which honours only the
    // literal "true". wvIsHiddenOrCollapsed() covers every form.
    it("reads hidden/collapsed through wvIsHiddenOrCollapsed, not === \"true\"", () => {
        const re = /getAttribute\(\s*["'](hidden|collapsed|selected|disabled|checked)["']\s*\)\s*===\s*["']true["']/g;
        const hits = bundle.match(re) || [];
        expect(hits, `boolean attr reads must not compare to "true": ${hits.join(", ")}`)
            .to.have.lengthOf(0);
        expect(bundle, "wvIsHiddenOrCollapsed must ship")
            .to.include("wvIsHiddenOrCollapsed");
    });

    // Menu icons: the Z11 notes say <menuitem> icons became <html:img> and
    // point at the --menuitem-icon CSS variable. MEASURED 2026-08-21 on
    // 11.0.SOURCE.77a3a8815: the legacy `image` attribute still populates the
    // img (currentSrc set, naturalWidth 16), and Zotero 11 itself still calls
    // setAttribute("image", ...) in utilities_internal.js/locateMenu.js. So the
    // 34 call sites need NO migration. This guard exists to record that the
    // question was settled by measurement, and to fail loudly if a future beta
    // ever does drop the attribute -- at which point the icons vanish silently.
    it("still relies on the image attribute for menu icons (verified on Z11)", () => {
        expect(bundle, "menu icons are set via the image attribute")
            .to.include('setAttribute("image"');
    });
});
