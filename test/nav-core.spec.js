/* global describe, it, before, assert, Zotero */

// The navigation core (survey 2026-10-06 §3.6, branch navcore): one way to
// mark an in-place jump the way the reader's own navigate() does, one
// placement per view family, one pin controller. Each step keeps a guard
// here: a unit on fakes plus a source scan that the copies are gone.

describe("Weavero — navigation core", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
    });

    const scan = (rx, except) => {
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function" || (except || []).includes(k)) continue;
                    if (rx.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        return offenders;
    };

    // N1: the manual-navigation triad -- tell the view, stamp the time, push
    // a Back point -- which five in-place jumps spelled out by hand.
    it("_wvReaderMarkNav tells the view, stamps the time and pushes a Back point; history:false does only the stamp; no method spells the triad out any more", () => {
        assert.isFunction(wv._wvReaderMarkNav);
        const calls = [];
        const pv = { _onManualNavigation: () => calls.push("manual"), _pushHistoryPoint: () => calls.push("push") };
        const t0 = Date.now();
        wv._wvReaderMarkNav(pv);
        assert.deepEqual(calls, ["manual", "push"], "the view is told, then the Back point");
        assert.isAtLeast(pv._lastNavigationTime, t0, "the time is stamped");
        calls.length = 0;
        const pv2 = { _onManualNavigation: () => calls.push("manual"), _pushHistoryPoint: () => calls.push("push") };
        wv._wvReaderMarkNav(pv2, { history: false });
        assert.deepEqual(calls, [], "skipHistory: neither the view nor the Back point");
        assert.isAtLeast(pv2._lastNavigationTime, t0, "but the stamp");
        wv._wvReaderMarkNav({});   // a view without the hooks: no throw
        wv._wvReaderMarkNav(null);
        assert.deepEqual(scan(/_lastNavigationTime = Date\.now\(\)/, ["_wvReaderMarkNav"]), [], "the stamp is written in one place");
        assert.deepEqual(scan(/_onManualNavigation === "function"\)[^;]*_onManualNavigation\(\)/, ["_wvReaderMarkNav", "_wvOutlineRmNavigate"]), [],
            "the view is told in one place (the Reading Mode overlay's own call excepted)");
    });

    /** Run `fn` with plugin methods replaced, restoring them after. */
    function withStubs(stubs, fn) {
        const saved = Object.keys(stubs).map((name) => {
            const own = Object.prototype.hasOwnProperty.call(wv, name);
            const orig = wv[name];
            wv[name] = stubs[name];
            return { name, own, orig };
        });
        try { return fn(); }
        finally { for (const s of saved) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; } }
    }

    // N2: a click generation, and one placement per view family.
    it("_wvHlNext takes a new generation and clears a stale pin; no method spells the pair out any more", () => {
        const cleared = [];
        withStubs({ _wvClearStalePin: (pv) => cleared.push(pv) }, () => {
            const pv = {};
            assert.strictEqual(wv._wvHlNext(pv), 1);
            assert.strictEqual(wv._wvHlNext(pv), 2);
            assert.strictEqual(pv._wvHlSeq, 2);
            assert.strictEqual(cleared.length, 2, "the stale pin goes each time");
        });
        assert.deepEqual(scan(/_wvHlSeq = \(pv\._wvHlSeq \|\| 0\) \+ 1/, ["_wvHlNext", "_wvReaderShowPin"]), [],
            "the generation is taken in one place (the pin's own bump excepted)");
    });

    it("_wvJumpToRect: a generation unless given, navigate's tail when asked, the quarter-rule scroll with the caller's fallback, every rect highlighted; _wvJumpToAnchor: clear, a Back point when asked, the DOM quarter rule, highlight when asked", () => {
        let landed = true; const log = [];
        withStubs({
            _wvClearStalePin: () => log.push("clear"),
            _wvReaderMarkNav: (pv, o) => log.push("mark:" + (o && o.history === false ? "nohist" : "hist")),
            _wvOutlineScrollToRect: (pv, pi, r) => { log.push("scroll:" + pi + ":" + r.join(",")); return landed; },
            _wvOutlineHighlightInPlace: (pv, pi, rects, gen) => log.push("hl:" + pi + ":" + rects.length + ":" + gen),
        }, () => {
            const pv = {};
            const rects = [[1, 2, 3, 4], [5, 6, 7, 8]];
            assert.strictEqual(wv._wvJumpToRect(pv, 3, rects), 1, "the generation is returned");
            assert.deepEqual(log, ["clear", "scroll:3:1,2,3,4"], "default: a generation, the first rect's scroll, no tail, no highlight");
            log.length = 0;
            assert.strictEqual(wv._wvJumpToRect(pv, 3, rects, { gen: 7, mark: true, history: false, highlight: true }), 7);
            assert.strictEqual(pv._wvHlSeq, 1, "a given generation is not bumped");
            assert.deepEqual(log, ["mark:nohist", "scroll:3:1,2,3,4", "hl:3:2:7"], "the tail without history, every rect highlighted under the given generation");
            log.length = 0; landed = false;
            let fb = 0;
            wv._wvJumpToRect(pv, 4, rects, { fallback: () => { fb++; throw new Error("x"); } });
            assert.strictEqual(fb, 1, "a failed scroll runs the fallback; its throw is swallowed");
            assert.deepEqual(log, ["clear", "scroll:4:1,2,3,4"]);
            log.length = 0; landed = true;
            wv._wvJumpToRect(pv, 5, [], { highlight: true });
            assert.deepEqual(log, ["clear"], "no rect: nothing to scroll to or to highlight");
        });
        const log2 = []; let range = { wvRange: true };
        withStubs({
            _wvClearStalePin: () => log2.push("clear"),
            _wvDomClearHighlight: () => log2.push("domclear"),
            _wvReaderPushHistoryPoint: () => log2.push("push"),
            _wvDomQuarterPlace: (pv, a) => { log2.push("place:" + (a.href || "pos")); return range; },
            _wvDomHighlightRange: () => log2.push("hl"),
        }, () => {
            const pv = {};
            assert.strictEqual(wv._wvJumpToAnchor(pv, { href: "c1.xhtml" }, { history: true, highlight: true }), range);
            assert.deepEqual(log2, ["clear", "domclear", "push", "place:c1.xhtml", "hl"]);
            log2.length = 0;
            assert.strictEqual(wv._wvJumpToAnchor(pv, { position: {} }), range);
            assert.deepEqual(log2, ["clear", "domclear", "place:pos"], "no Back point, no highlight unless asked");
            log2.length = 0; range = null;
            assert.isNull(wv._wvJumpToAnchor(pv, { href: "x" }, { highlight: true }));
            assert.deepEqual(log2, ["clear", "domclear", "place:x"], "unresolved: no highlight, null for the caller's fallback");
        });
    });

    // N3: the pin clear -- this pin with its followers; the document's pin,
    // a pending Edit-Position pin kept unless forced.
    it("_wvPinRemove drops the document's pin with its followers and the caret, keeps a pending Edit-Position pin unless forced; _wvPinDrop drops one pin; no method removes a pin by hand any more", () => {
        const doc = Zotero.getMainWindow().document, X = "http://www.w3.org/1999/xhtml";
        const mk = (cls) => { const e = /** @type {any} */ (doc.createElementNS(X, "div")); e.className = cls; return e; };
        const host = mk("wv-lib-pin-host"); doc.documentElement.appendChild(host);
        try {
            const pin = mk("wv-reader-pin"), caret = mk("wv-reader-pin-caret");
            host.appendChild(pin); host.appendChild(caret);
            const hooks = [];
            pin._wvOff = [() => hooks.push("fade"), () => { hooks.push("away"); throw new Error("x"); }];
            pin._wvOffObs = { disconnect: () => hooks.push("obs") };
            assert.isTrue(wv._wvPinRemove(doc), "removed");
            assert.deepEqual(hooks, ["fade", "away", "obs"], "every follower unhooked, a throwing one skipped over");
            assert.isFalse(pin.isConnected); assert.isFalse(caret.isConnected, "the caret goes with the pin");
            assert.deepEqual(pin._wvOff, [], "hooks run once");
            const edit = mk("wv-reader-pin"); edit.appendChild(mk("wv-reader-pin-approve")); host.appendChild(edit);
            assert.isFalse(wv._wvPinRemove(doc), "a pending edit stays");
            assert.isTrue(edit.isConnected);
            assert.isTrue(wv._wvPinRemove(doc, { force: true }), "forced: it goes");
            assert.isFalse(edit.isConnected);
            assert.isTrue(wv._wvPinRemove(doc), "nothing to remove: true");
            const p2 = mk("wv-reader-pin"), c2 = mk("wv-reader-pin-caret"); host.appendChild(p2); host.appendChild(c2);
            wv._wvPinDrop(mk("wv-reader-pin"));
            assert.isTrue(c2.isConnected, "dropping a detached pin leaves the document's caret");
            wv._wvPinDrop(p2);
            assert.isFalse(p2.isConnected); assert.isFalse(c2.isConnected, "dropping the document's pin takes the caret");
            wv._wvPinDrop(null);
        } finally { host.remove(); }
        assert.deepEqual(scan(/querySelector\("\.wv-reader-pin"\)[^;]*\.remove\(\)/, ["_wvPinRemove"]), [], "a pin is removed in one place");
    });
});
