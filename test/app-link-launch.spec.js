/* global describe, it, before, after, afterEach, assert, Zotero, Services */

// App-link launching on Zotero 10.0.2 (Gecko 140.15.0esr).
//
// 140.15 made nsIExternalProtocolService.loadURI()'s triggering principal
// mandatory, and 10.0.2 STABLE ships a Zotero.launchURL that still calls
// loadURI(uri) alone -- every non-HTTP scheme (mailto:, obsidian://, …)
// throws NS_ERROR_ILLEGAL_VALUE. Upstream fixed it in 10.0.3-beta.1
// (zotero/zotero@30f26d6b3, forums 133709); 10.0.3 is not on the stable
// channel yet (2026-09-16). Weavero's default app-link path defers to
// Zotero.launchURL, so on stable it died silently in a catch.
//
// `_wvLaunchNonHttpWithPrincipal` is the shim: the same call upstream now
// makes, entered only when Zotero.launchURL throws. These cases drive it
// through a FAKE external-protocol service so nothing opens on the test
// machine, and prove both halves: the shim hands loadURI a principal, and
// `_launchURL` actually reaches it when Zotero.launchURL throws.
//
// RETIRE with the shim when strict_min_version >= 10.0.3.

describe("Weavero — app links launch with a triggering principal (10.0.2 shim)", () => {
    let wv, calls, fake, origLaunchURL, prevSkip;

    const mkFake = (hasHandler) => {
        calls = [];
        return {
            getProtocolHandlerInfoFromOS(scheme, found) {
                calls.push({ fn: "handlerInfo", scheme });
                found.value = hasHandler;
                return {};
            },
            loadURI(uri, principal) {
                calls.push({ fn: "loadURI", spec: uri && uri.spec, principal });
            },
        };
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvLaunchNonHttpWithPrincipal !== "function") this.skip();
        origLaunchURL = Zotero.launchURL;
        prevSkip = Zotero.Prefs.get("weavero.enableAppLinksSkipConfirm");
    });

    afterEach(() => {
        Zotero.launchURL = origLaunchURL;
        delete wv._wvLaunchSvcOverride;
    });

    after(() => {
        if (prevSkip === undefined) Zotero.Prefs.clear("weavero.enableAppLinksSkipConfirm");
        else Zotero.Prefs.set("weavero.enableAppLinksSkipConfirm", !!prevSkip);
    });

    it("hands loadURI the system principal for an app scheme with a handler", () => {
        fake = mkFake(true);
        const ok = wv._wvLaunchNonHttpWithPrincipal("obsidian://open?vault=Notes", fake);
        assert.isTrue(ok);
        const load = calls.find(c => c.fn === "loadURI");
        assert.isOk(load, "loadURI was called");
        assert.equal(load.spec, "obsidian://open?vault=Notes");
        assert.strictEqual(load.principal, Services.scriptSecurityManager.getSystemPrincipal(),
            "the SYSTEM principal, exactly what upstream passes");
    });

    it("declines when the OS has no handler for the scheme", () => {
        fake = mkFake(false);
        assert.isFalse(wv._wvLaunchNonHttpWithPrincipal("nosuchapp://x", fake));
        assert.isUndefined(calls.find(c => c.fn === "loadURI"), "nothing dispatched");
    });

    it("leaves http(s), zotero:// and the schemes upstream refuses alone", () => {
        fake = mkFake(true);
        for (const u of ["https://zotero.org", "http://x.org/a", "zotero://select/library/items/ABCD1234",
            "javascript:alert(1)", "data:text/html,hi", "chrome://zotero/content/x", "resource://x/y"]) {
            assert.isFalse(wv._wvLaunchNonHttpWithPrincipal(u, fake), u);
        }
        assert.lengthOf(calls, 0, "the service was never consulted");
    });

    it("_launchURL reaches the shim when Zotero.launchURL throws (the 10.0.2 case)", () => {
        Zotero.Prefs.set("weavero.enableAppLinksSkipConfirm", false);   // the default path
        Zotero.launchURL = () => {
            const e = new Error("NS_ERROR_ILLEGAL_VALUE");
            e.name = "NS_ERROR_ILLEGAL_VALUE";
            throw e;
        };
        fake = mkFake(true);
        wv._wvLaunchSvcOverride = fake;
        wv._launchURL("mailto:someone@example.org");
        const load = calls.find(c => c.fn === "loadURI");
        assert.isOk(load, "the shim dispatched after launchURL threw");
        assert.equal(load.spec, "mailto:someone@example.org");
        assert.strictEqual(load.principal, Services.scriptSecurityManager.getSystemPrincipal());
    });

    it("_launchURL does not touch the shim when Zotero.launchURL succeeds (10.0.3+)", () => {
        Zotero.Prefs.set("weavero.enableAppLinksSkipConfirm", false);
        let launched = null;
        Zotero.launchURL = (u) => { launched = u; };
        fake = mkFake(true);
        wv._wvLaunchSvcOverride = fake;
        wv._launchURL("obsidian://open?vault=Notes");
        assert.equal(launched, "obsidian://open?vault=Notes", "upstream handled it");
        assert.lengthOf(calls, 0, "the shim stayed out of the way");
    });
});
