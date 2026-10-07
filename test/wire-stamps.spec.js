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

    // 2026-09-10: build-keyed was not enough. A SAME-build reload (install,
    // then the bridge's plugin_reload; or two reloads) creates a new
    // instance that finds its own build tag on the wraps, skips wiring, and
    // leaves setFilter & co. bound to the torn-down instance -- the live
    // suites caught it as "clearing the quick search drops the chip". The
    // tag is now instance-keyed: same build, new instance, new tag.
    it("a second instance of the same build gets a different tag", () => {
        const twin = Object.create(Object.getPrototypeOf(wv));
        twin._version = wv._version;
        const a = wv._wvWireTag(), b = twin._wvWireTag();
        assert.notStrictEqual(a, b, "same build, different instance, different tag");
        assert.strictEqual(wv._wvWireTag(), a, "stable within an instance");
        if (wv._version) assert.include(b, String(wv._version), "the build stays readable in the stamp");
    });

    it("a same-build stamp from ANOTHER instance is peeled like a foreign build's", () => {
        const twinTag = "wv@" + (wv._version || "dev") + "#deadbeef";
        const stale = plantStale(iv, "_handleSelectionChange", "_wvSelChangeWired", twinTag);
        wv._wvPatchSelectionChangeForCapture(iv);
        assert.notStrictEqual(iv._handleSelectionChange, stale,
            "the dead instance's wrapper must not be trusted");
        assert.strictEqual(iv._wvSelChangeWired, wv._wvWireTag());
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

    // Zotero.Notes.open / Zotero.Reader.open carry TWO Weavero layers (the
    // multi-window wrapper, then the deck-window / hosted-tab wrapper). Their
    // guard was a hand-bumped constant (`WV_OPEN_PATCH_V = 2`) until the
    // 2026-10-07 survey pass. `open` is an OWN property of those singletons
    // (no prototype fallback), so a peel restores the saved native instead of
    // deleting. Pre-fix code finds its own constant on the planted stamp,
    // skips, and the dead chain survives.
    // The hold stamp travels with the chain: on a real app start the hold
    // layer sits between the outer wrapper and the multi-window one.
    const saveOpen = (host) => ({ open: host.open, o: host._wvOrigOpen, mw: host._wvMwOrigOpen, v: host._wvOpenPatchedV, w: host._wvOpenWired, h: host._wvHoldWrapped });
    const restoreOpen = (host, s) => {
        host.open = s.open;
        for (const [k, v] of [["_wvOrigOpen", s.o], ["_wvMwOrigOpen", s.mw], ["_wvOpenPatchedV", s.v], ["_wvOpenWired", s.w], ["_wvHoldWrapped", s.h]]) {
            if (v === undefined) delete host[k]; else host[k] = v;
        }
    };

    it("Notes.open / Reader.open: a constant-era stamp over a dead two-layer chain is peeled to the native and re-wrapped", function () {
        if (typeof wv._wvPatchNotesOpenForMultiWindow !== "function" || typeof wv._wvOpenPatchPeel !== "function") this.skip();
        for (const host of [Zotero.Notes, Zotero.Reader]) {
            const saved = saveOpen(host);
            const native = host._wvMwOrigOpen || host._wvOrigOpen || host.open;
            try {
                const staleMw = function _wvStaleMwFromOldBuild() { throw new Error("stale wrapper ran"); };
                const staleOuter = function _wvStaleOuterFromOldBuild() { throw new Error("stale wrapper ran"); };
                host._wvMwOrigOpen = native;
                host._wvOrigOpen = staleMw;
                host.open = staleOuter;
                host._wvOpenPatchedV = 2;          // the constant that shipped
                host._wvOpenWired = true;
                wv._wvPatchNotesOpenForMultiWindow();
                assert.notStrictEqual(host.open, staleOuter, "the dead outer wrapper is gone");
                assert.notStrictEqual(host.open, staleMw, "the dead multi-window wrapper is gone");
                assert.strictEqual(host._wvMwOrigOpen, native, "the native is the saved original again");
                assert.isUndefined(host._wvOrigOpen, "the dead outer layer's saved ref is dropped (init re-wraps that layer)");
                assert.strictEqual(host._wvOpenPatchedV, wv._wvWireTag());
                assert.include(String(host.open), "_wvWithMainWindow", "the live wrapper is this build's");
                const cur = host.open;
                wv._wvPatchNotesOpenForMultiWindow();
                assert.strictEqual(host.open, cur, "same tag must not re-wrap");
            }
            finally { restoreOpen(host, saved); }
        }
    });

    it("the live Notes.open / Reader.open chains carry this instance's multi-window wrapper under tag stamps", () => {
        for (const host of [Zotero.Notes, Zotero.Reader]) {
            // With the boot-only hold in place (a real app start) the
            // multi-window wrapper is inside the hold's closure, not a slot.
            if (!host._wvHoldWrapped) {
                const chain = [host.open, host._wvOrigOpen, host._wvMwOrigOpen].filter(f => typeof f === "function").map(String);
                assert.isTrue(chain.some(s => s.includes("_wvWithMainWindow")), "the multi-window wrapper is in the live chain");
            }
            assert.strictEqual(host._wvOpenPatchedV, wv._wvWireTag(), "multi-window layer: tag-stamped, not a constant");
            assert.strictEqual(host._wvOpenWired, wv._wvWireTag(), "outer layer: tag-stamped, not a boolean");
        }
    });

    it("Reader.getWindowStates: a constant-era inner stamp over a dead two-layer chain is peeled to the native and re-wrapped", function () {
        if (typeof wv._wvPatchReaderGetWindowStates !== "function" || typeof wv._wvReaderGWSPeel !== "function") this.skip();
        const R = Zotero.Reader;
        const saved = { f: R.getWindowStates, a: R._wvGWSOrig, b: R._wvOrigGetWindowStates, v: R._wvGWSPatchVer, w: R._wvGWSWired };
        const native = R._wvGWSOrig || R._wvOrigGetWindowStates || R.getWindowStates;
        try {
            const staleInner = function _wvStaleInnerFromOldBuild() { throw new Error("stale wrapper ran"); };
            const staleOuter = function _wvStaleOuterFromOldBuild() { throw new Error("stale wrapper ran"); };
            R._wvGWSOrig = native;
            R._wvOrigGetWindowStates = staleInner;
            R.getWindowStates = staleOuter;
            R._wvGWSPatchVer = 3;              // the constant that shipped
            wv._wvPatchReaderGetWindowStates();
            assert.notStrictEqual(R.getWindowStates, staleOuter, "the dead outer wrapper is gone");
            assert.notStrictEqual(R.getWindowStates, staleInner, "the dead inner wrapper is gone");
            assert.strictEqual(R._wvGWSOrig, native, "the native is the saved original again");
            assert.isUndefined(R._wvOrigGetWindowStates, "the dead outer layer's saved ref is dropped");
            assert.strictEqual(R._wvGWSPatchVer, wv._wvWireTag());
            assert.deepEqual(R.getWindowStates(), native.call(R), "the live wrapper passes through outside a quit");
        }
        finally {
            R.getWindowStates = saved.f;
            for (const [k, v] of [["_wvGWSOrig", saved.a], ["_wvOrigGetWindowStates", saved.b], ["_wvGWSPatchVer", saved.v], ["_wvGWSWired", saved.w]]) {
                if (v === undefined) delete R[k]; else R[k] = v;
            }
        }
    });

    it("the destroy-side peel returns a singleton member to the innermost saved original with no stamp left", function () {
        if (typeof wv._wvSingletonPeel !== "function") this.skip();
        const native = function native() { return "native"; };
        const mid = function mid() { return "mid"; };
        const fake = { open: function outer() {}, _wvMwOrigOpen: native, _wvOrigOpen: mid, _wvOpenPatchedV: "x", _wvOpenWired: "y", _wvHoldWrapped: "z", _wvOther: 1 };
        wv._wvOpenPatchPeel(fake);
        assert.strictEqual(fake.open, native, "innermost saved original wins");
        assert.deepEqual(Object.keys(fake).filter(k => /^_wv/.test(k)), ["_wvOther"], "every open stamp and saved ref is gone; unrelated keys stay");
        const g = { getWindowStates: function outer() {}, _wvGWSOrig: native, _wvOrigGetWindowStates: mid, _wvGWSPatchVer: 3, _wvGWSWired: "t" };
        wv._wvReaderGWSPeel(g);
        assert.strictEqual(g.getWindowStates, native);
        assert.deepEqual(Object.keys(g).filter(k => /^_wv/.test(k)), []);
        const l = { getByTabID: function outer() {}, _wvOrigGetByTabID: native, _wvLookupVer: 1 };
        wv._wvReaderLookupPeel(l);
        assert.strictEqual(l.getByTabID, native);
        assert.deepEqual(Object.keys(l).filter(k => /^_wv/.test(k)), []);
        // Nothing saved: the member is left alone (never set to undefined).
        const n = { open: native };
        wv._wvOpenPatchPeel(n);
        assert.strictEqual(n.open, native);
    });

    it("no boolean or constant wire stamps remain on the Zotero.Notes / Zotero.Reader singletons", () => {
        const offenders = [];
        for (const o of [Zotero.Notes, Zotero.Reader].filter(Boolean)) {
            for (const k of Object.getOwnPropertyNames(o)) {
                if (!/^_wv.*(Wired|Wrapped|Patched|PatchedV|Ver)$/.test(k)) continue;
                const v = o[k];
                if (typeof v === "boolean" || typeof v === "number") offenders.push(k + "=" + v);
            }
        }
        assert.deepEqual(offenders, [], "a stamp that survives destroy() skips the re-wire (2026-08-25 / 2026-10-07)");
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
