/* global describe, it, expect, Zotero */

// Smoke test for the scaffold tester pipeline. The ONLY thing this
// test proves is that:
//   1. zotero-plugin-scaffold launched a Zotero instance,
//   2. installed the Weavero plugin,
//   3. loaded Mocha + Chai inside that instance,
//   4. ran our spec, and
//   5. piped results back to the host reporter.
// If this passes, the toolchain is wired up; we can then add
// real unit tests that exercise actual Weavero code paths.

describe("Weavero — toolchain smoke test", () => {
    it("Zotero global is in scope", () => {
        // In Zotero's privileged context, `Zotero` is exposed as a
        // function (constructor) — `typeof` returns "function".
        expect(typeof Zotero).to.equal("function");
        expect(typeof Zotero.getMainWindow).to.equal("function");
    });

    it("Zotero.Libraries exposes the user library ID", () => {
        expect(Zotero.Libraries).to.exist;
        expect(typeof Zotero.Libraries.userLibraryID).to.equal("number");
    });

    it("Probe what's available on Zotero", () => {
        // Diagnostic — log the surface so we can pick a real check.
        const keys = Object.keys(Zotero).filter(
            k => k[0] !== "_").slice(0, 40);
        Zotero.debug("[smoke] Zotero.* sample keys: " + keys.join(", "));
        Zotero.debug("[smoke] typeof Zotero.Plugins = "
            + typeof Zotero.Plugins);
        Zotero.debug("[smoke] typeof Zotero.AddonManager = "
            + typeof Zotero.AddonManager);
        // Use Mozilla's own AddonManager via Components.
        try {
            const { AddonManager } = ChromeUtils.importESModule(
                "resource://gre/modules/AddonManager.sys.mjs");
            Zotero.debug("[smoke] AddonManager imported OK");
            return AddonManager.getAllAddons().then(list => {
                Zotero.debug("[smoke] AddonManager addons: "
                    + list.map(a => a.id).join(", "));
            });
        }
        catch (e) {
            Zotero.debug("[smoke] AddonManager probe err: " + e);
        }
    });
});
