/* global describe, it, before, after, assert, Zotero */

// Survey 2026-10-06, second round of bounded fixes (branch next, 0.21.9-next.6).
// Behavioural where a stand-in suffices; source contracts where the real
// behaviour needs windows or a restore.

describe("Weavero — survey fixes, round B", () => {
    let wv;
    const src = (name) => { assert.isFunction(wv[name], name); return String(wv[name]); };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent('!wv');
    });

    it("the multi-window getMainWindow swap is re-entrant: overlapping loads restore the real function", async () => {
        assert.isFunction(wv._wvWithMainWindow);
        const Z = /** @type {any} */ (Zotero);
        const real = Z.getMainWindow;
        const A = { name: "A" }, B = { name: "B" };
        let releaseA, releaseB;
        const pA = wv._wvWithMainWindow(A, () => new Promise(r => { releaseA = r; }));
        const pB = wv._wvWithMainWindow(B, () => new Promise(r => { releaseB = r; }));
        try {
            assert.strictEqual(Z.getMainWindow(), B, "the most recent owner answers");
            releaseA(); await pA;
            assert.strictEqual(Z.getMainWindow(), B, "A left first: B still loading, still answers");
            releaseB(); await pB;
            assert.strictEqual(Z.getMainWindow, real, "all done: the real function is back (not A's lambda)");
            // The other order: the inner leaves first.
            const pA2 = wv._wvWithMainWindow(A, () => new Promise(r => { releaseA = r; }));
            const pB2 = wv._wvWithMainWindow(B, () => new Promise(r => { releaseB = r; }));
            releaseB(); await pB2;
            assert.strictEqual(Z.getMainWindow(), A, "B left first: A takes over again");
            releaseA(); await pA2;
            assert.strictEqual(Z.getMainWindow, real);
        }
        finally {
            try { if (releaseA) releaseA(); if (releaseB) releaseB(); } catch (_) {}
            await Promise.allSettled([pA, pB]);
            Z.getMainWindow = real;
            delete Z._wvGMWStack; delete Z._wvGMWOrig;
        }
    });

    it("'Hide Annotations in the Reader' is undone by the panels teardown", () => {
        assert.isFunction(wv._wvReaderHideAnnotationsTeardown);
        const sdoc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-hide");
        const calls = [];
        const origSet = function (a) { calls.push(a); };
        const view = { setAnnotations: origSet, _iframeWindow: { document: sdoc } };
        const fake = { _internalReader: { _primaryView: view }, _iframeWindow: { document: sdoc } };
        wv._wvReaderSetViewAnnotationsBlocked(fake, true);
        wv._wvReaderSetOverlayHideCss(fake, true);
        wv._wvReaderHideAnnWM = wv._wvReaderHideAnnWM || new WeakMap();
        wv._wvReaderHideAnnWM.set(fake, true);
        assert.notStrictEqual(view.setAnnotations, origSet, "blocked");
        assert.isOk(sdoc.getElementById("wv-hide-annotations"), "hide sheet in place");
        wv._wvReaderHideAnnotationsTeardown(fake);
        assert.strictEqual(view.setAnnotations, origSet, "setAnnotations restored");
        assert.isNull(sdoc.getElementById("wv-hide-annotations"), "hide sheet removed");
        assert.isNotOk(wv._wvReaderHideAnnWM.get(fake), "the hidden flag is dropped");
        assert.include(src("_wvReaderTeardownPanels"), "_wvReaderHideAnnotationsTeardown(reader)");
    });

    it("the DOM-view sort-index backfill is a silent, derived write (no undo step)", () => {
        assert.isTrue(wv._wvBmUndoDerived("_wvDomSortTried"));
        assert.isTrue(wv._wvBmUndoDerived("_sortIndexTried"));
        const s = src("_wvBackfillDomSortIndices");
        assert.include(s, "_bmPersistSilent()");
        assert.notInclude(s, "await this._bmPersist()");
    });

    it("a pane-filter state read before ann-order.json loads is provisional and re-applied after the load", () => {
        const savedDoc = wv._wvAnnOrderDoc;
        const fake = { _iframeWindow: null };
        try {
            wv._wvAnnOrderDoc = null;
            wv._wvAnnPaneState(fake);
            assert.isOk(wv._wvAnnPaneProvisional && wv._wvAnnPaneProvisional.has(fake), "marked provisional while unloaded");
        }
        finally {
            wv._wvAnnOrderDoc = savedDoc;
            try { wv._wvAnnPaneForget(fake); } catch (_) {}
            try { wv._wvAnnPaneProvisional.delete(fake); } catch (_) {}
        }
        const loader = src("_wvAnnOrderEnsureLoaded");
        assert.include(loader, "_wvAnnPaneProvisional");
        assert.include(loader, "_wvAnnPaneForget(r)");
        // Loaded: a fresh state is not provisional.
        const fake2 = { _iframeWindow: null };
        try {
            if (wv._wvAnnOrderDoc) { wv._wvAnnPaneState(fake2); assert.isNotOk(wv._wvAnnPaneProvisional.has(fake2)); }
        }
        finally { try { wv._wvAnnPaneForget(fake2); } catch (_) {} }
    });

    it("the no-prompt app-link launch is limited to schemes the user enabled", () => {
        assert.isFunction(wv._wvAppSchemeEnabled);
        const K = ["weavero.enableAppLinks", "weavero.enableMailtoScheme"];
        const saved = K.map(k => Zotero.Prefs.get(k));
        try {
            Zotero.Prefs.set("weavero.enableAppLinks", true);
            Zotero.Prefs.set("weavero.enableMailtoScheme", true);
            assert.isTrue(wv._wvAppSchemeEnabled("mailto"));
            assert.isFalse(wv._wvAppSchemeEnabled("ms-msdt"), "an unlisted scheme never takes the fast path");
            Zotero.Prefs.set("weavero.enableMailtoScheme", false);
            assert.isFalse(wv._wvAppSchemeEnabled("mailto"), "its own tick off");
            Zotero.Prefs.set("weavero.enableMailtoScheme", true);
            Zotero.Prefs.set("weavero.enableAppLinks", false);
            assert.isFalse(wv._wvAppSchemeEnabled("mailto"), "the App links master off");
        }
        finally {
            K.forEach((k, i) => { try { if (saved[i] === undefined) Zotero.Prefs.clear(k); else Zotero.Prefs.set(k, saved[i]); } catch (_) {} });
        }
        const s = src("_launchURL");
        assert.isBelow(s.indexOf("_wvAppSchemeEnabled(scheme)"), s.indexOf("launchWithURI"), "the gate decides before the launch");
    });

    it("the tabs-menu row filter reads the panel window's tabs, not a bare global", () => {
        const s = src("_wvApplyTabsMenuRowFilters");
        assert.notInclude(s, "Zotero_Tabs._tabs.find");
        assert.include(s, "winOf(panel)");
    });

    it("restore retries put a tab back at its saved slot, in ascending order", () => {
        const s = src("_wvWireRestoreTracing");
        assert.include(s, "failed.sort(");
        assert.include(s, "Math.min(i, Z._tabs.length)");
        assert.notInclude(s, "runOne(tab, Z._tabs.length)");
    });

    it("clearing the filter leaves manual-expand tracking installed", () => {
        // Step 4 (2026-10-07) made the tracker its own wrap layer under the
        // filter's translation; the clear removes the translation only.
        // The behavioural contract lives in test/filter-patch-layers.spec.js.
        // The clear branch is the apply's inactive phase (step 4 split).
        const s = src("_wvFilterApplyInactive");
        assert.include(s, "this._wvFilterPatchRemove(rp, itemsView)");
        assert.notInclude(s, "_wvUserOpenTrackingPatched");
        assert.notInclude(src("_wvFilterPatchRemove"), "userOpenTracking");
    });
});
