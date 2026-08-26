/* global describe, it, before, assert, Zotero */

// Hot-upgrade wiring: wire stamps are BUILD-KEYED, never booleans
// (2026-08-25).
//
// Upgrading the plugin in a running Zotero replaces the instance but not the
// long-lived view objects. The old instance's own-prop wrappers stay
// installed (stale closures over the previous plugin) and its "already
// wired" stamps stay stamped. With boolean stamps the new instance saw
// `true`, skipped wiring, and the items-list filter went silently dead:
// state active, chip bar rendered, `_applyItemsListFilter` resolving in
// 294ms -- and 17,932 rows untouched (found on the default profile,
// dev.2 -> dev.51; a restart cured it, which is why the dev profile's
// constant restarts never saw it).
//
// The fix: every wire stamp is `_wvWireTag()` -- "wv@" + the BUILD version,
// not a hand-bumped constant (a hand-bumped version re-breaks on the first
// release that forgets the bump). A foreign stamp means "wired by some other
// build": peel the own-prop wrapper with `delete` (every wrapped member has
// a live prototype fallback, verified live) and wire fresh.
//
// Same lesson _patchRefreshForReveals paid for on 2026-07-16 ("old
// boolean-only guard survived plugin reloads and kept a STALE wrap
// running") -- these cases lock the generalization. Each case simulates the
// upgrade: plant a boolean-era stamp plus a stale wrapper, run the wiring,
// and require the stale wrapper GONE. Every case fails on pre-fix code
// (boolean stamp => wiring skipped => stale wrapper survives).

describe("Weavero — wire stamps are build-keyed (hot-upgrade rewiring)", () => {
    let wv, win, iv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvWireTag !== "function") this.skip();
        win = Zotero.getMainWindow();
        iv = win.ZoteroPane && win.ZoteroPane.itemsView;
        if (!iv) this.skip();
    });

    it("the tag is build-keyed, not a constant", () => {
        const tag = wv._wvWireTag();
        assert.match(tag, /^wv@/, "tag must carry the build identity");
        // The version half must be the running build, so every release
        // re-wires without anyone remembering to bump anything.
        if (wv._version) assert.include(tag, String(wv._version));
    });

    const plantStale = (obj, member, stampKey, stampValue) => {
        const stale = function _wvStaleFromOldBuild() {
            throw new Error("stale wrapper ran");
        };
        obj[member] = stale;
        obj[stampKey] = stampValue;
        return stale;
    };

    it("selection-change wiring peels a boolean-era wrapper", () => {
        const stale = plantStale(iv, "_handleSelectionChange", "_wvSelChangeWired", 1);
        wv._wvPatchSelectionChangeForCapture(iv);
        assert.notStrictEqual(iv._handleSelectionChange, stale,
            "a stale stamp must trigger re-wiring, not be trusted");
        assert.strictEqual(iv._wvSelChangeWired, wv._wvWireTag());
    });

    it("cache-state wiring peels a boolean-era wrapper", () => {
        const stale = plantStale(iv, "_cacheState", "_wvCacheStateWired", 1);
        wv._wvPatchCacheStateForSelection(iv);
        assert.notStrictEqual(iv._cacheState, stale);
        assert.strictEqual(iv._wvCacheStateWired, wv._wvWireTag());
    });

    // _setupItemsListFilterIn early-returns while the filter BAR exists (a
    // wired window). On a real upgrade the OLD instance's shutdown removes
    // the bar, so the new instance's setup runs fully -- replay that state,
    // or the planted stale wrapper is never even considered (the first run
    // of this spec failed exactly there).
    const replayPostShutdown = () => {
        const bar = win.document.getElementById("wv-filter-bar");
        if (bar) bar.remove();
    };

    it("setFilter wiring peels a foreign-build wrapper", () => {
        const stale = plantStale(iv, "setFilter", "_wvSetFilterWrapped", true);
        replayPostShutdown();
        wv._setupItemsListFilterIn(win);
        assert.notStrictEqual(iv.setFilter, stale,
            "the incident's exact shape: stamp true, wrapper from a dead build");
        assert.strictEqual(iv._wvSetFilterWrapped, wv._wvWireTag());
    });

    it("changeCollectionTreeRow wiring peels a foreign-build wrapper", () => {
        const stale = plantStale(iv, "changeCollectionTreeRow", "_wvCollChangeWrapped", true);
        replayPostShutdown();
        wv._setupItemsListFilterIn(win);
        assert.notStrictEqual(iv.changeCollectionTreeRow, stale);
        assert.strictEqual(iv._wvCollChangeWrapped, wv._wvWireTag());
    });

    it("expand-match-parents re-sniffs Zotero's source, not our replacement", () => {
        const rp = iv.rowProvider || iv;
        // Plant OUR OWN replacement under a stale stamp: the source sniff
        // (`rowsToOpen`) must run against Zotero's prototype function after
        // the peel, or the patch silently classifies itself "upstream-fixed".
        const before = rp._wvExpandMatchParentsPatched;
        rp._wvExpandMatchParentsPatched = "weavero-patched";   // boolean-era value
        wv._patchExpandMatchParents();
        const after = rp._wvExpandMatchParentsPatched;
        assert.notStrictEqual(after, "weavero-patched",
            "a stale stamp must be replaced by a tag-keyed one");
        assert.include(String(after), wv._wvWireTag(),
            "either <tag> (patched) or upstream-fixed@<tag>");
        // Restore whatever classification the suite environment had.
        if (before !== undefined) rp._wvExpandMatchParentsPatched = before;
    });

    it("the native-navigate outline wrapper peels a boolean-era wrap", function () {
        if (typeof wv._wvOutlineInstallRecovery !== "function") this.skip();
        // A view whose navigate lives on the PROTOTYPE, wrapped by a stale
        // own-prop from "another build" under the boolean stamp -- the exact
        // state that killed native outline clicks on 2026-08-26.
        const proto = { navigate() { return "proto"; } };
        const pv = Object.create(proto);
        const stale = function _wvStaleFromOldBuild() { throw new Error("stale wrapper ran"); };
        pv.navigate = stale;
        pv._wvOutlineWired = true;
        pv._wvOutlineOrigNavigate = stale;   // dead saved bind from the old build
        wv._wvOutlineInstallRecovery({ _internalReader: { _primaryView: pv } });
        assert.notStrictEqual(pv.navigate, stale, "a stale stamp must trigger re-wiring");
        assert.strictEqual(pv._wvOutlineWired, wv._wvWireTag());
        assert.notStrictEqual(pv._wvOutlineOrigNavigate, stale,
            "the dead saved bind must be dropped, not trusted for restore");
    });

    it("re-running the wiring under the CURRENT tag is a no-op (idempotent)", () => {
        wv._setupItemsListFilterIn(win);
        const sf = iv.setFilter, cc = iv.changeCollectionTreeRow;
        wv._setupItemsListFilterIn(win);
        assert.strictEqual(iv.setFilter, sf, "same tag must not re-wrap");
        assert.strictEqual(iv.changeCollectionTreeRow, cc);
    });

    it("no boolean wire stamps remain on the view after wiring", () => {
        wv._setupItemsListFilterIn(win);
        wv._wvPatchSelectionChangeForCapture(iv);
        wv._wvPatchCacheStateForSelection(iv);
        const offenders = [];
        for (const o of [iv, iv.rowProvider].filter(Boolean)) {
            for (const k of Object.getOwnPropertyNames(o)) {
                if (!/^_wv.*(Wired|Wrapped|Patched)$/.test(k)) continue;
                if (o[k] === true || o[k] === 1) offenders.push(k + "=" + o[k]);
            }
        }
        // Known exception, self-healing by restore-first (not by tag):
        // _wvRefreshChevronComputePatched re-arms on every apply.
        const real = offenders.filter(x => !x.startsWith("_wvRefreshChevronComputePatched"));
        assert.deepEqual(real, [],
            "boolean wire stamps are how the hot-upgrade bug ships again");
    });
});
