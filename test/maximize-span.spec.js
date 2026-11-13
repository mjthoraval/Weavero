/* global describe, it, before, assert, Zotero, Components, Services, wvT */

// Maximize across monitors (MJT 2026-11-11: "maximize only on 2 out of 3
// monitors"; option 1): a right-click on a window's maximize button lists the
// runs of monitors side by side, and a choice fills exactly the free area those
// monitors share; the restore button, or a double-click on the title bar, puts
// the window back. modules/max-span.ts, lib/screens.ts.
//
// The spans are computed from stand-in desktops first (MJT's three monitors,
// measured 2026-11-11: 1920x1080 at 100%, 1920x1080 at 100%, 1920x1200 at 125%,
// taskbar at the bottom), then the runner's own window is spanned on the
// runner's desktop when it has two monitors side by side, and put back.
//
// FAILS on 1.0.5-l10n.3 (no such feature).

describe("Weavero — maximize across monitors", function () {
    this.timeout(90000);
    let wv, lib, win, timerWin;
    const sleep = (ms) => new Promise(r => timerWin.setTimeout(r, ms));
    // MJT's desktop, as the screen manager reported it (desktop px = device px on Windows).
    const MJT = [
        { rect: [0, 0, 1920, 1080], avail: [0, 0, 1920, 1040], scale: 1 },
        { rect: [1920, 0, 1920, 1080], avail: [1920, 0, 1920, 1040], scale: 1 },
        { rect: [3840, 0, 1920, 1200], avail: [3840, 0, 1920, 1150], scale: 1.25 },
    ];
    // The plugin's own: real labels from weavero.ftl, stand-in monitors.
    const combos = (screens) => wv._wvMaxSpanCombos(screens);
    const labels = (screens) => combos(screens).map(c => lib.wvStr(c.l10n.id, c.l10n.args));

    before(function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib) wvT.absent("plugin");
        for (const f of ["wvSpanByRect", "wvScreenLayout"]) if (typeof lib[f] !== "function") wvT.absent("Zotero.Weavero.lib." + f);
        for (const m of ["_wvMaxSpanWire", "_wvMaxSpanOpenMenu", "_wvMaxSpanApply", "_wvMaxSpanRestore", "_wvMaxSpanMark",
            "_wvMaxSpanIsSpanned", "_wvMaxSpanForgetAll", "_wvMaxSpanCombos", "_wvMaxSpanCapture", "_wvMaxSpanReapply", "_wvMaxSpanDevRect"]) wvT.method(m);
        win = Zotero.getMainWindow();
        timerWin = win;
    });

    // ---- the spans, from stand-in desktops ----------------------------------

    it("MJT's three monitors: Left + Middle, Middle + Right, All Three -- the shared free band", () => {
        const c = combos(MJT);
        assert.deepEqual(c.map(x => x.key), ["h:0,1", "h:1,2", "h:0,1,2"]);
        assert.deepEqual(c.map(x => x.rect), [[0, 0, 3840, 1040], [1920, 0, 3840, 1040], [0, 0, 5760, 1040]],
            "the 1200-px monitor's span keeps to the 1040-px band its neighbours have free");
        assert.deepEqual(c.map(x => x.mixed), [false, true, true], "the 125% monitor mixes scales");
        assert.deepEqual(labels(MJT), ["Maximize to Left + Middle", "Maximize to Middle + Right", "Maximize to All Three"]);
        assert.deepEqual(combos(MJT.slice().reverse()).map(x => x.rect), c.map(x => x.rect), "whatever order the screens come in");
    });

    it("one monitor: no entry; two: one", () => {
        assert.deepEqual(combos([MJT[0]]), []);
        assert.deepEqual(combos([]), []);
        assert.deepEqual(labels(MJT.slice(0, 2)), ["Maximize to Left + Right"]);
    });

    it("the same-scale spans come first, and the mixed ones say so in their tooltip", () => {
        const left150 = [Object.assign({}, MJT[0], { scale: 1.5 }), MJT[1], Object.assign({}, MJT[2], { scale: 1 })];
        assert.deepEqual(combos(left150).map(x => x.key), ["h:1,2", "h:0,1", "h:0,1,2"]);
        const mixed = combos(MJT).find(x => x.mixed), same = combos(MJT).find(x => !x.mixed);
        const tip = (c) => lib.wvStr(c.l10n.id, c.l10n.args, "tooltiptext");
        assert.include(tip(mixed), "display scales");
        assert.notInclude(tip(same), "display scales");
        assert.isAbove(tip(same).length, 20, "every entry has a tooltip (never an empty one)");
    });

    it("monitors of different heights or offsets: the band all of them have free, or nothing", () => {
        const at = (y, h) => [MJT[0], { rect: [1920, y, 1920, h], avail: [1920, y, 1920, h - 40], scale: 1 }];
        assert.deepEqual(combos(at(100, 1080)).map(x => x.rect), [[0, 100, 3840, 940]], "shifted down 100 px: the shared 940");
        assert.deepEqual(combos(at(600, 1080)), [], "shifted down 600 px: under half a monitor in common");
        assert.deepEqual(combos(at(1080, 1080)), [], "below the other one: not side by side");
    });

    it("a taskbar standing between two monitors keeps them apart", () => {
        const tb = [{ rect: [0, 0, 1920, 1080], avail: [0, 0, 1872, 1080], scale: 1 }, { rect: [1920, 0, 1920, 1080], avail: [1920, 0, 1920, 1080], scale: 1 }];
        assert.deepEqual(combos(tb), []);
        const outer = [{ rect: [0, 0, 1920, 1080], avail: [48, 0, 1872, 1080], scale: 1 }, tb[1]];
        assert.deepEqual(combos(outer).map(x => x.rect), [[48, 0, 3792, 1080]], "one at the outer edge is left uncovered");
    });

    it("stacked monitors: Top + Bottom; four in a row: numbered", () => {
        const col = [{ rect: [0, 0, 1920, 1080], avail: [0, 0, 1920, 1080], scale: 1 }, { rect: [0, 1080, 1920, 1080], avail: [0, 1080, 1920, 1040], scale: 1 }];
        assert.deepEqual(labels(col), ["Maximize to Top + Bottom"]);
        assert.deepEqual(combos(col).map(x => x.rect), [[0, 0, 1920, 2120]]);
        const four = [0, 1, 2, 3].map(i => ({ rect: [i * 1920, 0, 1920, 1080], avail: [i * 1920, 0, 1920, 1040], scale: 1 }));
        assert.deepEqual(labels(four), [
            "Maximize to Monitor 1 + Monitor 2", "Maximize to Monitor 2 + Monitor 3", "Maximize to Monitor 3 + Monitor 4",
            "Maximize to Monitor 1 through Monitor 3", "Maximize to Monitor 2 through Monitor 4", "Maximize to All 4 Monitors",
        ]);
    });

    it("a saved span is found again by its area", () => {
        const c = combos(MJT);
        assert.strictEqual(lib.wvSpanByRect(c, [1920, 0, 3840, 1040]).key, "h:1,2");
        assert.strictEqual(lib.wvSpanByRect(c, [1920, 0, 3841, 1041]).key, "h:1,2", "a pixel off");
        assert.isNull(lib.wvSpanByRect(c, [0, 0, 1920, 1040]), "one monitor is not a span");
    });

    // ---- the menu ------------------------------------------------------------

    const popupOf = () => win.document.getElementById("wv-maxspan-popup");
    const waitOpen = async (p) => { for (let i = 0; i < 40 && !(p && (p.state === "open" || p.state === "showing")); i++) await sleep(50); return p && (p.state === "open" || p.state === "showing"); };
    const hide = async () => { const p = popupOf(); if (p) { try { p.hidePopup(); } catch (e) {} } await sleep(150); };

    it("the menu: one entry per span, every label and tooltip from weavero.ftl", async () => {
        const c = combos(MJT);
        const pop = wv._wvMaxSpanOpenMenu(win, win.screenX + 200, win.screenY + 60, c);
        try {
            assert.isOk(await waitOpen(pop), "opened");
            const items = [...pop.querySelectorAll("menuitem")];
            assert.strictEqual(items.length, 3);
            for (const [i, el] of items.entries()) {
                assert.match(el.getAttribute("data-l10n-id"), /^weavero-menu-maxspan-/, "a Fluent id");
                assert.strictEqual(el.getAttribute("label"), lib.wvStr(c[i].l10n.id, c[i].l10n.args));
                assert.isAbove(String(el.getAttribute("tooltiptext") || "").length, 20, "a tooltip");
                assert.strictEqual(el.getAttribute("data-wv-maxspan"), c[i].key);
            }
        }
        finally { await hide(); }
    });

    it("a right-click on the maximize button opens it, anywhere else nothing", async function () {
        const btn = win.document.querySelector(".titlebar-buttonbox .titlebar-max");
        if (!btn || win.getComputedStyle(btn).display === "none") this.skip();   // macOS: the system's buttons
        const keys = lib.wvListenKeys(win).map(k => k.key);
        assert.includeMembers(keys, ["maxSpan:contextmenu", "maxSpan:rbup"], "wired on the main window");
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvMaxSpanCombos");
        const orig = wv._wvMaxSpanCombos;
        // The runner may have one monitor: the menu lists MJT's.
        const mjt = combos(MJT);
        wv._wvMaxSpanCombos = () => mjt;
        try {
            const r = btn.getBoundingClientRect();
            const ctx = (el) => {
                const e = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2,
                    screenX: win.mozInnerScreenX + r.x + 10, screenY: win.mozInnerScreenY + r.y + 10 });
                el.dispatchEvent(e);
                return e;
            };
            const other = win.document.getElementById("zotero-items-toolbar") || win.document.documentElement;
            const eo = ctx(other);
            await sleep(200);
            assert.isFalse(!!(popupOf() && popupOf().state === "open"), "nothing on another element");
            assert.isFalse(eo.defaultPrevented, "another element's context menu left alone");
            const e = ctx(btn);
            assert.isTrue(e.defaultPrevented, "the button's taken");
            assert.isOk(await waitOpen(popupOf()), "the menu opened");
            assert.strictEqual(popupOf().querySelectorAll("menuitem").length, 3);
        }
        finally {
            await hide();
            if (own) wv._wvMaxSpanCombos = orig; else delete wv._wvMaxSpanCombos;
        }
    });

    // ---- the spanned state, on the runner's window (no move) ------------------

    /** Mark the window spanned where it stands: its span is its own rect. */
    const fakeSpan = () => {
        const dev = wv._wvMaxSpanDevRect(win);
        win._wvMaxSpan = { key: "h:0,1", rect: dev.slice(), pre: { dev: dev.slice(), max: false }, outer: dev.slice() };
        wv._wvMaxSpanMark(win, true);
        return dev;
    };
    const SPAN_KEYS = ["maxSpan:resize", "maxSpan:sizemode", "maxSpan:command", "maxSpan:dragdown", "maxSpan:down", "maxSpan:up"];
    const assertClean = (what) => {
        assert.isUndefined(win._wvMaxSpan, what + ": no _wvMaxSpan");
        assert.isFalse(win.document.documentElement.hasAttribute("wv-maxspan"), what + ": no root attribute");
        assert.isNull(win.document.getElementById("wv-maxspan-style"), what + ": no style");
        const keys = lib.wvListenKeys(win).map(k => k.key);
        assert.deepEqual(SPAN_KEYS.filter(k => keys.includes(k)), [], what + ": no span listener");
    };

    it("while spanned the button shows the restore glyph, and a click on it puts the window back", async function () {
        if (win.windowState !== win.STATE_NORMAL) this.skip();
        const max = win.document.querySelector(".titlebar-buttonbox .titlebar-max");
        const res = win.document.querySelector(".titlebar-buttonbox .titlebar-restore");
        if (!max || !res || win.getComputedStyle(max).display === "none") this.skip();
        const before = win.getComputedStyle(max).display;
        fakeSpan();
        try {
            assert.isTrue(wv._wvMaxSpanIsSpanned(win));
            assert.strictEqual(win.getComputedStyle(max).display, "none", "maximize glyph hidden");
            assert.strictEqual(win.getComputedStyle(res).display, before, "restore glyph shown in its place");
            const cmd = new win.CustomEvent("command", { bubbles: true, cancelable: true });
            res.dispatchEvent(cmd);
            assert.isTrue(cmd.defaultPrevented, "the button's own restore (a no-op on a normal window) did not run");
            assertClean("after the restore click");
            assert.strictEqual(win.getComputedStyle(max).display, before, "maximize glyph back");
        }
        finally { wv._wvMaxSpanForget(win); }
    });

    it("a double-click on the title bar puts it back (Windows' signals), a double-click elsewhere does not", async function () {
        if (win.windowState !== win.STATE_NORMAL) this.skip();
        const bar = win.document.getElementById("zotero-title-bar");
        const mouse = (el, type, detail) => {
            const e = new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, detail });
            el.dispatchEvent(e);
            return e;
        };
        fakeSpan();
        try {
            // A double-click in the items list: no title-bar press before it.
            const list = win.document.getElementById("zotero-items-tree") || win.document.documentElement;
            mouse(list, "mousedown", 2);
            const up0 = mouse(list, "mouseup", 2);
            assert.isFalse(up0.defaultPrevented, "a double-click elsewhere is left alone");
            await sleep(100);
            assert.isOk(win._wvMaxSpan, "still spanned");
            // The title bar: Windows reports the first press as
            // draggableregionleftmousedown, the second as a mousedown with detail 2.
            if (Zotero.isWin) win.dispatchEvent(new win.CustomEvent("draggableregionleftmousedown"));
            mouse(bar, "mousedown", 2);
            const up = mouse(bar, "mouseup", 2);
            assert.isTrue(up.defaultPrevented, "the OS's maximize on that mouseup is prevented");
            await sleep(300);
            assertClean("after the double-click");
        }
        finally { wv._wvMaxSpanForget(win); }
    });

    it("a disable while spanned leaves the window where it is and nothing of the span", async function () {
        const dev = fakeSpan();
        try {
            wv._wvMaxSpanForgetAll();
            assertClean("after the teardown");
            assert.deepEqual(wv._wvMaxSpanDevRect(win), dev, "not moved");
            assert.isNull(popupOf(), "the menu went");
        }
        finally {
            wv._wvMaxSpanForget(win);
            wv._wvMaxSpanWire(win);   // the live instance's own wiring back
        }
    });

    // A restart on Zotero 9/10: Weavero's window store puts the first window's
    // geometry back (tabs.ts _wvRestoreAnchorTabs), then its span. On a Zotero
    // with its own windows the span rides the window's own state instead (the
    // runner test below re-spans from it).
    it("Zotero 9/10: the window store keeps the first window's span and a restart spans it again", async function () {
        if (wvT.nativeWindows()) this.skip();
        for (const m of ["_wvWindowStoreBuildDoc", "_wvRestoreAnchorTabs", "_wvApplyWindowGeom"]) wvT.method(m);
        const first = Zotero.getMainWindows()[0];
        const dev = wv._wvMaxSpanDevRect(first);
        first._wvMaxSpan = { key: "h:0,1", rect: [0, 0, 3840, 1040], pre: { dev: dev.slice(), max: true }, outer: dev.slice() };
        let doc;
        try { doc = wv._wvWindowStoreBuildDoc([]); }
        finally { delete first._wvMaxSpan; }
        assert.deepEqual(doc.anchorSpan, { rect: [0, 0, 3840, 1040], pre: { dev, max: true } }, "in the store");
        const keep = { doc: wv._wvBootWindowStoreDoc, done: wv._wvAnchorTabsRestored };
        const owns = { apply: Object.prototype.hasOwnProperty.call(wv, "_wvApplyWindowGeom"), re: Object.prototype.hasOwnProperty.call(wv, "_wvMaxSpanReapply") };
        const orig = { apply: wv._wvApplyWindowGeom, re: wv._wvMaxSpanReapply };
        const calls = [];
        wv._wvApplyWindowGeom = (w, g) => { calls.push(["geom", w === first, g.w]); };
        wv._wvMaxSpanReapply = (w, s) => { calls.push(["span", w === first, s.rect.join(",")]); return Promise.resolve(true); };
        try {
            wv._wvBootWindowStoreDoc = { version: 4, windows: [], anchorGeom: { x: -8, y: 0, w: 3856, h: 1048, dpr: 1, st: 3 }, anchorSpan: doc.anchorSpan };
            wv._wvAnchorTabsRestored = false;
            await wv._wvRestoreAnchorTabs();
            await sleep(1800);
            assert.deepEqual(calls, [["geom", true, 3856], ["span", true, "0,0,3840,1040"]], "the geometry, then the span");
        }
        finally {
            if (owns.apply) wv._wvApplyWindowGeom = orig.apply; else delete wv._wvApplyWindowGeom;
            if (owns.re) wv._wvMaxSpanReapply = orig.re; else delete wv._wvMaxSpanReapply;
            wv._wvBootWindowStoreDoc = keep.doc;
            wv._wvAnchorTabsRestored = keep.done;
        }
    });

    it("a Zotero with its own windows: the span rides the window's own state, and a window coming back with it is spanned again", async function () {
        if (!wvT.nativeWindows()) this.skip();
        for (const m of ["_wvWinStateCapture", "_wvWinStateApply"]) wvT.method(m);
        const zp = win.ZoteroPane;
        const dev = wv._wvMaxSpanDevRect(win);
        win._wvMaxSpan = { key: "h:1,2", rect: [1920, 0, 3840, 1040], pre: { dev: dev.slice(), max: false }, outer: dev.slice() };
        let st;
        try { st = wv._wvWinStateCapture(win); }
        finally { delete win._wvMaxSpan; }
        assert.deepEqual(st.span, { rect: [1920, 0, 3840, 1040], pre: { dev, max: false } }, "in the window's state");
        const text0 = zp.getWindowSettings().prefs["weavero.windowState"];
        const id0 = win._wvWinStateId;
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvMaxSpanReapply");
        const orig = wv._wvMaxSpanReapply;
        const calls = [];
        wv._wvMaxSpanReapply = (w, s) => { calls.push([w === win, s.rect.join(",")]); return Promise.resolve(true); };
        try {
            zp.setWindowSetting("weavero.windowState", JSON.stringify({ span: st.span }));
            await wv._wvWinStateApply(win);
            assert.deepEqual(calls, [[true, "1920,0,3840,1040"]], "spanned again from it");
        }
        finally {
            if (own) wv._wvMaxSpanReapply = orig; else delete wv._wvMaxSpanReapply;
            zp.setWindowSetting("weavero.windowState", text0 || "");
            if (id0 === undefined) delete win._wvWinStateId; else win._wvWinStateId = id0;
        }
    });

    // Zotero 9/10: a reader window with Weavero's tab strip draws its own
    // buttons (reader.ts _ensureReaderWindowControls).
    it("a reader window's own maximize button: right-click opens the menu there; spanned, it shows restore and a click puts the window back", async function () {
        if (wvT.nativeWindows() || Zotero.isMac) this.skip();
        this.timeout(60000);
        const pdf = await wvT.createTestPDFItem("wv-maxspan-reader");
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvMaxSpanCombos");
        const orig = wv._wvMaxSpanCombos;
        const mjt = combos(MJT);
        let rw = null;
        try {
            await wvT.withPref("weavero.compactTitleBarReader", true, async () => {
                const windows = () => [...Services.wm.getEnumerator("zotero:reader")];
                const before = new Set(windows());
                await Zotero.Reader.open(pdf.id, null, { openInWindow: true });
                for (let i = 0; i < 150 && !rw; i++) { await sleep(100); rw = windows().find(x => !before.has(x)) || null; }
                assert.isOk(rw, "a reader window opened");
                let btn = null;
                for (let i = 0; i < 150 && !btn; i++) { await sleep(100); btn = rw.document.querySelector(".wv-window-max"); }
                assert.isOk(btn, "Weavero's maximize button");
                wv._wvMaxSpanCombos = () => mjt;
                const e = new rw.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: rw.screenX + 300, screenY: rw.screenY + 20 });
                btn.dispatchEvent(e);
                assert.isTrue(e.defaultPrevented, "taken");
                const pop = rw.document.getElementById("wv-maxspan-popup");
                for (let i = 0; i < 40 && !(pop && pop.state === "open"); i++) await sleep(50);
                assert.strictEqual(pop && pop.state, "open", "the menu opened in the reader window");
                assert.strictEqual(pop.querySelectorAll("menuitem").length, 3);
                try { pop.hidePopup(); } catch (er) {}
                await sleep(150);
                if (rw.windowState !== rw.STATE_NORMAL) { rw.restore(); await sleep(600); }
                const dev = wv._wvMaxSpanDevRect(rw);
                rw._wvMaxSpan = { key: "h:0,1", rect: dev.slice(), pre: { dev: dev.slice(), max: false }, outer: dev.slice() };
                wv._wvMaxSpanMark(rw, true);
                assert.strictEqual(btn.getAttribute("data-state"), "maximized", "the restore glyph");
                btn.click();
                await sleep(300);
                assert.isUndefined(rw._wvMaxSpan, "put back");
                assert.isNull(btn.getAttribute("data-state"), "the maximize glyph again");
                assert.strictEqual(rw.windowState, rw.STATE_NORMAL, "not maximized by the click");
            });
        }
        finally {
            if (own) wv._wvMaxSpanCombos = orig; else delete wv._wvMaxSpanCombos;
            if (rw) { try { wv._wvMaxSpanForget(rw); } catch (e) {} try { rw.close(); } catch (e) {} await sleep(800); }
            wvT.purgeDeadReaders();
            await wvT.erase(pdf);
        }
    });

    // ---- on the runner's desktop ---------------------------------------------

    it("spans the runner's own window, switches span, puts it back, and comes back after a restart's clamp (needs two monitors side by side)", async function () {
        const real = wv._wvMaxSpanSupported() ? wv._wvMaxSpanCombos() : [];
        if (!real.length) this.skip();
        this.timeout(60000);
        const Ci = Components.interfaces;
        const dpd = win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).devicePixelsPerDesktopPixel || 1;
        const inner = () => { const s = win.devicePixelRatio; return [win.mozInnerScreenX * s, win.mozInnerScreenY * s, win.innerWidth * s, win.innerHeight * s]; };
        const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
        const wasMax = win.windowState === win.STATE_MAXIMIZED;
        if (wasMax) { win.restore(); await sleep(800); }
        const start = wv._wvMaxSpanDevRect(win);
        const log = ["screens " + JSON.stringify(wv._wvMaxSpanScreens()),
            "spans " + real.map(c => lib.wvStr(c.l10n.id, c.l10n.args) + " " + JSON.stringify(c.rect)).join("; ")];
        try {
            const first = real.find(c => !c.mixed) || real[0];
            assert.isTrue(await wv._wvMaxSpanApply(win, first), "spanned " + first.key);
            const want = first.rect.map(v => v * dpd);
            log.push(first.key + " inner " + inner().map(Math.round).join(",") + " want " + want.join(","));
            assert.isTrue(near(inner(), want, 2), "what it draws fills " + first.key + ": " + log[log.length - 1]);
            assert.isTrue(wv._wvMaxSpanIsSpanned(win));
            assert.strictEqual(win.document.documentElement.getAttribute("wv-maxspan"), first.key);
            const st = wv._wvMaxSpanCapture(win);
            assert.deepEqual(st.pre.dev, start, "the place before the span is kept");
            const other = real.find(c => c.key !== first.key);
            if (other) {
                assert.isTrue(await wv._wvMaxSpanApply(win, other), "switched to " + other.key);
                const w2 = other.rect.map(v => v * dpd);
                log.push(other.key + " inner " + inner().map(Math.round).join(",") + " want " + w2.join(","));
                assert.isTrue(near(inner(), w2, 2), "fills " + other.key + ": " + log[log.length - 1]);
                assert.deepEqual(wv._wvMaxSpanCapture(win).pre.dev, start, "still the place before the FIRST span");
            }
            // A restart: Zotero puts the window back on one monitor (its
            // restores clamp), then the window's state spans it again.
            const saved = wv._wvMaxSpanCapture(win);
            wv._wvMaxSpanForget(win);
            const m0 = real[0].rect;
            win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).setPositionAndSize(m0[0] * dpd, m0[1] * dpd, Math.round(m0[2] / 2) * dpd, Math.round(m0[3] / 2) * dpd, 0);
            await sleep(400);
            assert.isTrue(await wv._wvMaxSpanReapply(win, saved), "spanned again from the saved state");
            assert.isTrue(near(inner(), saved.rect.map(v => v * dpd), 2), "the same area");
            assert.isTrue(wv._wvMaxSpanRestore(win), "put back");
            await sleep(500);
            assert.deepEqual(wv._wvMaxSpanDevRect(win), start, "where it was");
            assertClean("after the restore");
            // From maximized: back to maximized.
            win.maximize();
            await sleep(800);
            assert.isTrue(await wv._wvMaxSpanApply(win, first), "spanned from maximized");
            assert.strictEqual(win.windowState, win.STATE_NORMAL, "a span is not an OS maximize");
            assert.isTrue(wv._wvMaxSpanRestore(win));
            await sleep(800);
            assert.strictEqual(win.windowState, win.STATE_MAXIMIZED, "maximized again");
        }
        finally {
            // The measured fills, in the run's log.
            const line = "[wv-test] max span: " + log.join(" | ");
            try { Zotero.debug(line); } catch (e) {}
            try { if (typeof globalThis.debug === "function") globalThis.debug(line); } catch (e) {}
            wv._wvMaxSpanForget(win);
            if (win.windowState !== win.STATE_NORMAL) { win.restore(); await sleep(600); }
            win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).setPositionAndSize(start[0], start[1], start[2], start[3], 0);
            await sleep(500);
            if (wasMax) { win.maximize(); await sleep(600); }
        }
    });
});
