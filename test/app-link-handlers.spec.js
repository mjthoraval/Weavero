/* global describe, it, before, after, assert, Zotero, Components, wvT */
// App links' "skip the confirmation" sets the handler service's "ask before handling" off for the
// schemes Weavero opens (url.ts _applyAppLinkConfirmPref). Until 1.0.5-dev.7 every start set it ON
// again for all 17 schemes, undoing a user's own "remember my choice", and a disable or an
// uninstall left Weavero's "don't ask" behind (alignment review 2026-11-11, survey 2026-10-06
// §2 #29). Now Weavero records the schemes it set (weavero.appLinkHandlersSkipped) and gives back
// only those.
describe("Weavero — app-link handlers: only Weavero's own changes are given back", () => {
    let wv, ext, hs, saved;
    const SCHEME = "mailto";
    const info = () => ext.getProtocolHandlerInfo(SCHEME);
    const setAsk = (v) => { const hi = info(); hi.alwaysAskBeforeHandling = v; hs.store(hi); };

    before(function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._wvAppLinkHandlersRestore !== "function") wvT.absent("_wvAppLinkHandlersRestore");
        ext = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Components.interfaces.nsIExternalProtocolService);
        hs = Components.classes["@mozilla.org/uriloader/handler-service;1"]
            .getService(Components.interfaces.nsIHandlerService);
        const hi = info();
        saved = { ask: hi.alwaysAskBeforeHandling, action: hi.preferredAction, list: Zotero.Prefs.get("weavero.appLinkHandlersSkipped") };
    });

    after(() => {
        try { const hi = info(); hi.alwaysAskBeforeHandling = saved.ask; hi.preferredAction = saved.action; hs.store(hi); } catch (e) {}
        if (saved.list === undefined) Zotero.Prefs.clear("weavero.appLinkHandlersSkipped");
        else Zotero.Prefs.set("weavero.appLinkHandlersSkipped", saved.list);
        wv._applyAppLinkConfirmPref();
    });

    it("a user's own \"remember my choice\" survives a start with the skip off", async () => {
        Zotero.Prefs.clear("weavero.appLinkHandlersSkipped");
        setAsk(false);   // the user's choice, made in Firefox's app picker
        await wvT.withPref("weavero.enableAppLinksSkipConfirm", false, async () => {
            wv._applyAppLinkConfirmPref();
            assert.isFalse(info().alwaysAskBeforeHandling, "the user's choice is not Weavero's to undo");
        });
    });

    it("the skip sets \"don't ask\" and records it; switching it off gives \"ask\" back", async () => {
        Zotero.Prefs.clear("weavero.appLinkHandlersSkipped");
        setAsk(true);
        await wvT.withPref("weavero.enableAppLinks", true, () =>
            wvT.withPref("weavero.enableMailtoScheme", true, async () => {
                await wvT.withPref("weavero.enableAppLinksSkipConfirm", true, async () => {
                    wv._applyAppLinkConfirmPref();
                    assert.isFalse(info().alwaysAskBeforeHandling, "skip on: no prompt");
                    assert.include(String(Zotero.Prefs.get("weavero.appLinkHandlersSkipped") || "").split(","), SCHEME, "recorded as Weavero's");
                });
                await wvT.withPref("weavero.enableAppLinksSkipConfirm", false, async () => {
                    wv._applyAppLinkConfirmPref();
                    assert.isTrue(info().alwaysAskBeforeHandling, "skip off: Firefox asks again");
                    assert.notInclude(String(Zotero.Prefs.get("weavero.appLinkHandlersSkipped") || "").split(","), SCHEME, "forgotten");
                });
            }));
    });

    it("a disable or an uninstall gives back what the skip set", async () => {
        Zotero.Prefs.clear("weavero.appLinkHandlersSkipped");
        setAsk(true);
        await wvT.withPref("weavero.enableAppLinks", true, () =>
            wvT.withPref("weavero.enableMailtoScheme", true, () =>
                wvT.withPref("weavero.enableAppLinksSkipConfirm", true, async () => {
                    wv._applyAppLinkConfirmPref();
                    assert.isFalse(info().alwaysAskBeforeHandling);
                    wv._wvAppLinkHandlersRestore();   // destroy(), reason 4 or 6
                    assert.isTrue(info().alwaysAskBeforeHandling, "Firefox asks again after the disable");
                    assert.notOk(Zotero.Prefs.get("weavero.appLinkHandlersSkipped"), "nothing left recorded");
                })));
    });
});
