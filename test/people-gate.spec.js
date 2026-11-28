/* global describe, it, before, after, assert, Zotero, Services, wvT */
// People stays in testing (MJT 2026-11-25: "keep that people part in testing for
// a while before releasing"; branch peoplenet): `weavero.enablePeople` is ON by
// default when the build's version has a pre-release suffix ("1.3.0-dev.91",
// "1.3.0-peoplenet.1"), OFF for a release ("1.3.0"), and the user's own setting
// wins either way (prefs-table.ts `devOnly`).
describe("Weavero — People is on by default in pre-release builds only", function () {
    this.timeout(30000);
    let wv;
    const KEY = "extensions.zotero.weavero.enablePeople";
    const D = () => Services.prefs.getDefaultBranch("");
    const B = () => Services.prefs.getBranch("");

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvIsPrerelease");
        wvT.method("_wvPrefDefault");
        wvT.method("_wvRegisterTableDefaults");
        wvT.method("_wvPeopleOn");
    });

    it("a version with a suffix is a pre-release; a bare version, or none, is a release", function () {
        const v = (x) => wv._wvIsPrerelease(x);
        assert.deepEqual(["1.3.0-dev.91", "1.3.0-peoplenet.1", "1.2.3-hotfix.4", "1.3.0", "10.0.0", "", null, undefined, 3].map(v),
            [true, true, true, false, false, false, false, false, false]);
    });

    it("this build registers the default that its version gives", function () {
        const want = wv._wvIsPrerelease(wv._version);
        assert.strictEqual(wv._wvPrefDefault("enablePeople"), want, "the table's answer for " + wv._version);
        assert.strictEqual(D().getBoolPref(KEY), want, "the default branch (what Settings' checkbox reads)");
        // Every other row keeps its own default.
        assert.strictEqual(wv._wvPrefDefault("enableFeeds"), true);
        assert.strictEqual(wv._wvPrefDefault("enableAppLinks"), false);
    });

    // Another build's defaults through _wvRegisterTableDefaults(version), never by
    // changing wv._version: the version is part of the wire tag (_wvWireTag), and
    // a collections-tree refresh inside that moment (the devOnly search-folders
    // default flips with it) re-wrapped under the borrowed tag and dropped the
    // search folders' twisty layer -- search-folders.spec.js failed after this
    // spec (dev.99 triage, 2026-11-27).
    it("a release build is off by default, a pre-release on; the user's own setting wins in both", async function () {
        const version = wv._version;
        const tag = wv._wvWireTag();
        const hadUser = B().prefHasUserValue(KEY);
        const userVal = hadUser ? B().getBoolPref(KEY) : null;
        const settle = () => wvT.sleep(120);   // the people pref observer's 30 ms debounce, then its apply
        try {
            if (hadUser) B().clearUserPref(KEY);
            wv._wvRegisterTableDefaults("1.3.0");
            assert.isFalse(D().getBoolPref(KEY), "a release: default off");
            assert.isFalse(wv._wvPeopleOn(), "and the feature off");
            Zotero.Prefs.set("weavero.enablePeople", true);
            assert.isTrue(B().prefHasUserValue(KEY), "the user's ON is stored");
            assert.isTrue(wv._wvPeopleOn(), "the user's ON wins over the release default");
            B().clearUserPref(KEY);
            await settle();
            wv._wvRegisterTableDefaults("1.3.0-peoplenet.1");
            assert.isTrue(D().getBoolPref(KEY), "a pre-release: default on");
            assert.isTrue(wv._wvPeopleOn(), "and the feature on");
            Zotero.Prefs.set("weavero.enablePeople", false);
            assert.isFalse(wv._wvPeopleOn(), "the user's OFF wins over the pre-release default");
            // The same choice survives an update to a release.
            wv._wvRegisterTableDefaults("1.3.0");
            assert.isFalse(wv._wvPeopleOn(), "still off after a release");
            Zotero.Prefs.set("weavero.enablePeople", true);
            wv._wvRegisterTableDefaults("1.3.1-dev.1");
            assert.isTrue(wv._wvPeopleOn(), "a user's ON stays on, whatever the build");
            assert.strictEqual(wv._version, version, "the build's version untouched");
            assert.strictEqual(wv._wvWireTag(), tag, "and so the wire tag");
        }
        finally {
            wv._wvRegisterTableDefaults();
            try { if (B().prefHasUserValue(KEY)) B().clearUserPref(KEY); } catch (e) {}
            if (hadUser) B().setBoolPref(KEY, userVal);
            await settle();
        }
        assert.strictEqual(D().getBoolPref(KEY), wv._wvIsPrerelease(version), "the build's own default is back");
    });
});
