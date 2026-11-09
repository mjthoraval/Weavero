/* global describe, it, before, after, beforeEach, afterEach, assert, Zotero, wvT */

// A window keeps its colour on a Zotero with its own windows (zotero#6035).
//
// Zotero reopens its windows in its own order there, the one in front at quit last,
// so the colour pool handed every window another colour at each restart and a
// colour picked by hand was lost (restart checks 2026-11-07, three restarts). The
// colour now rides the window's own saved state (window-state.ts), and a saved
// colour wins over one another window only drew from the pool before it came back.
//
// The pool half runs on every Zotero. The saved state needs the real build.
//
// Few windows, closed one at a time: the runner's Zotero can die at a window's
// close (000-helpers.spec.js, the quit trace), and it did twice in five runs of
// this spec's first form, nine windows closed two at a time (2026-11-08).

describe("Weavero — a window keeps its colour (zotero#6035)", () => {
    let wv, spare;
    const Z = /** @type {any} */ (Zotero);
    const realNative = wvT.nativeWindows();
    const STATE = "weavero.windowState";

    before(function () {
        wv = wvT.plugin();
        for (const m of ["_wvWindowSetColour", "_wvGlyphRestore", "_wvTitleGlyphIdx"]) wvT.method(m);
        spare = Zotero.getMainWindows().length;
    });

    /** Close the windows this spec opened, one at a time. */
    async function closeOurs() {
        for (const w of Zotero.getMainWindows().slice(spare)) {
            try { w.close(); } catch (e) {}
            await wvT.waitFor(() => w.closed, 8000);
            await wvT.sleep(300);
        }
    }

    /** A colour index no open window but `except` holds. */
    const free = (except) => {
        const used = new Set(Zotero.getMainWindows().filter(w => w !== except).map(w => w._wvTitleGlyphIdx));
        let i = 0;
        while (used.has(i)) i++;
        return i;
    };

    /** A window's colour forgotten, then drawn again from the pool. */
    const redraw = (w) => {
        delete w._wvTitleGlyphIdx;
        delete w._wvGlyphLazy;
        delete w._wvGlyphPicked;
        return wv._wvTitleGlyphIdx(w);
    };

    describe("the pool", () => {
        let a, b;

        before(async function () {
            this.timeout(60000);
            a = await wvT.openMainWindow();
            b = await wvT.openMainWindow();
            assert.isOk(a && b, "two more windows");
        });
        beforeEach(() => { redraw(a); redraw(b); });
        after(async function () {
            this.timeout(30000);
            await closeOurs();
        });

        it("a colour drawn from the pool is marked drawn; one picked by hand is the window's, verbatim", () => {
            const drawn = redraw(a);
            assert.strictEqual(a._wvGlyphLazy, drawn, "drawn, not chosen");
            wv._wvWindowSetColour(a, 4, false);
            assert.strictEqual(a._wvTitleGlyphIdx, 4);
            assert.isUndefined(a._wvGlyphLazy, "chosen now");
            assert.isTrue(a._wvGlyphPicked);
        });

        it("a saved colour comes back: a window that only drew it gives it up and draws again", () => {
            const want = free(b);
            assert.strictEqual(redraw(b), want, "b drew it");
            wv._wvGlyphRestore(a, want);
            assert.strictEqual(a._wvTitleGlyphIdx, want, "back on its own window");
            assert.isUndefined(a._wvGlyphLazy);
            assert.isNumber(b._wvTitleGlyphIdx, "b holds a colour still");
            assert.notStrictEqual(b._wvTitleGlyphIdx, want, "another one");
        });

        it("a colour another window got back as its own stays there", () => {
            const mine = a._wvTitleGlyphIdx;
            const want = Math.max(free(null), mine + 1) + 2;
            wv._wvGlyphRestore(b, want);
            wv._wvGlyphRestore(a, want);
            assert.strictEqual(b._wvTitleGlyphIdx, want, "it stays");
            assert.strictEqual(a._wvTitleGlyphIdx, mine, "and the window keeps the one it has");
        });

        // dev.4's restart check: a window sharing its colour with one picked to match
        // lost it when the picked one came back first.
        it("a colour shared with a window that picked it comes back shared, in either order", () => {
            const want = Math.max(free(null), a._wvTitleGlyphIdx + 1) + 2;
            wv._wvWindowSetColour(b, want, false);
            wv._wvGlyphRestore(a, want);
            assert.strictEqual(a._wvTitleGlyphIdx, want, "back, shared");
            assert.isNotOk(a._wvGlyphPicked, "and still not picked");
            assert.strictEqual(b._wvTitleGlyphIdx, want, "the pick stays");
            redraw(a); redraw(b);
            const two = Math.max(free(null), a._wvTitleGlyphIdx + 1) + 2;
            wv._wvGlyphRestore(a, two);
            wv._wvGlyphRestore(b, two, true);
            assert.strictEqual(a._wvTitleGlyphIdx, two, "the other order: the first one keeps it");
            assert.strictEqual(b._wvTitleGlyphIdx, two, "and the pick comes back beside it");
        });

        it("a colour picked by hand comes back as chosen, the same as another window's if so chosen", () => {
            const want = a._wvTitleGlyphIdx + 3;
            wv._wvWindowSetColour(b, want, false);
            wv._wvGlyphRestore(a, want, true);
            assert.strictEqual(a._wvTitleGlyphIdx, want, "back as chosen");
            assert.isTrue(a._wvGlyphPicked);
            assert.strictEqual(b._wvTitleGlyphIdx, want, "the other keeps it too");
        });

        it("a saved value that is no colour is left alone", () => {
            const mine = a._wvTitleGlyphIdx;
            for (const bad of [null, undefined, -1, 1.5, "2", NaN]) wv._wvGlyphRestore(a, bad);
            assert.strictEqual(a._wvTitleGlyphIdx, mine);
        });

        // MJT 2026-11-08, "OK" to a hand-picked colour surviving a restart on the
        // current beta too: there a window's record is its tab-session / restart-store
        // record (wvMainState), on every Zotero the one a session keeps.
        it("a window's state record carries its colour and gives it back", async () => {
            const want = Math.max(free(null), a._wvTitleGlyphIdx + 1) + 2;
            wv._wvWindowSetColour(a, want, false);
            const ms = wv._wvTabSessionCaptureMainState(a);
            assert.strictEqual(ms.glyph, want, "captured");
            assert.isTrue(ms.glyphPicked, "as picked");
            const stored = wv._wvTabSessionStoredWindow(Object.assign({ kind: "main", tabs: [] }, ms), false);
            assert.strictEqual(stored.wvMainState.glyph, want, "a session's window, reopened through Zotero's own restore");
            assert.isTrue(stored.wvMainState.glyphPicked);
            redraw(a);
            await wv._wvTabSessionApplyMainState(a, { glyph: want, glyphPicked: true });
            assert.strictEqual(a._wvTitleGlyphIdx, want, "given back");
            assert.isTrue(a._wvGlyphPicked);
            redraw(a);
            assert.notProperty(wv._wvTabSessionCaptureMainState(a), "glyphPicked", "a drawn colour: not picked");
        });
    });

    describe("the records that carry it", () => {
        let lib;
        before(() => {
            lib = wvT.lib();
            if (!lib || !lib.wvPlanWindowTransfer || !lib.wvStoredFromSaved) wvT.absent("lib.wvPlanWindowTransfer / wvStoredFromSaved");
            wvT.method("_wvWindowStoreCaptureReaderWindow");
        });

        it("a reader window's restart-store entry carries its colour", () => {
            const fake = (tabs, activeId, extra) => Object.assign({ _wvWT: { tabs, activeId, shared: {} },
                screenX: 1, screenY: 1, outerWidth: 900, outerHeight: 700, devicePixelRatio: 1, windowState: 3 }, extra);
            const e = wv._wvWindowStoreCaptureReaderWindow(fake([{ id: "t1", native: true, itemID: 4242 }], "t1", { _wvTitleGlyphIdx: 3, _wvGlyphPicked: true }));
            assert.strictEqual(e.kind, "reader");
            assert.strictEqual(e.glyph, 3);
            assert.isTrue(e.glyphPicked);
            const o = wv._wvWindowStoreCaptureReaderWindow(fake([{ id: "t2", itemID: 2 }], "t2", { _wvTitleGlyphIdx: 2 }));
            assert.strictEqual(o.kind, "reader-orphan");
            assert.strictEqual(o.glyph, 2, "an orphan one too");
            assert.notProperty(o, "glyphPicked");
            assert.notProperty(wv._wvWindowStoreCaptureReaderWindow(fake([{ id: "t1", native: true, itemID: 1 }], "t1")), "glyph", "no colour, none recorded");
        });

        it("the move to Zotero's own windows takes each window's colour along", () => {
            const kinds = { 1: "reader" };
            const plan = (doc, opts) => lib.wvPlanWindowTransfer(doc, new Map(), id => kinds[id] || null, Object.assign({ newId: () => "new" }, opts));
            const p = plan({ windows: [
                { kind: "main-dev", tabs: [{ type: "library", title: "My Library" }], wvMainState: { glyph: 3, glyphPicked: true } },
                { kind: "reader", nativeItemID: 1, extras: [], glyph: 4 },
            ] });
            assert.deepEqual(JSON.parse(p.windows[0].settings.prefs[STATE]), { glyph: 3, glyphPicked: true, id: "new" });
            assert.deepEqual(JSON.parse(p.windows[1].settings.prefs[STATE]), { glyph: 4, id: "new" }, "a reader window's");
            const f = plan({ windows: [{ kind: "main-dev", tabs: [{ type: "library", title: "My Library" }], wvMainState: { glyph: 2 } }] }, { spare: 1 });
            assert.deepEqual(f.fills[0].state, { glyph: 2 }, "into a window Zotero reopened itself");
        });

        it("a window saved and closed before keeps its colour", () => {
            assert.strictEqual(lib.wvStoredFromSaved({ kind: "main", tabs: [], glyph: 4 }).wvMainState.glyph, 4);
            assert.strictEqual(lib.wvStoredFromSaved({ kind: "reader", tabs: [{ itemID: 3 }], glyph: 1 }).wvMainState.glyph, 1);
            assert.strictEqual(lib.wvStoredFromSaved({ kind: "main", tabs: [], glyph: 4, wvMainState: { glyph: 5 } }).wvMainState.glyph, 5, "its window's own record first");
        });
    });

    describe("on a real native build", () => {
        before(function () { if (!realNative) this.skip(); });
        afterEach(async function () {
            if (!realNative) return;
            this.timeout(30000);
            await closeOurs();
        });

        const ready = w => wvT.waitFor(() => wv._wvWinStateReady && wv._wvWinStateReady.has(w), 10000);
        const saved = w => JSON.parse(w.ZoteroPane.getWindowSettings().prefs[STATE] || "{}");

        it("a colour picked by hand goes into Zotero's saved state at once, and comes back with the window", async function () {
            this.timeout(60000);
            const w = await wvT.openMainWindow();
            assert.isOk(await ready(w), "read");
            const c = free(w) + 1;
            wv._wvWindowSetColour(w, c, false);
            assert.strictEqual(saved(w).glyph, c, "saved at once");
            assert.isTrue(saved(w).glyphPicked, "as picked");
            const sessionState = w.ZoteroPane.getState();
            w.close();
            await wvT.waitFor(() => w.closed, 8000);
            const again = Z.openMainWindow({ sessionState });
            assert.isOk(await ready(again), "read again");
            assert.strictEqual(again._wvTitleGlyphIdx, c, "its colour back");
            assert.isUndefined(again._wvGlyphLazy, "as its own, not drawn");
            assert.isTrue(again._wvGlyphPicked, "and still picked");
        });

        it("a colour drawn from the pool is saved too; a window opened from another draws its own", async function () {
            this.timeout(60000);
            const w = await wvT.openMainWindow();
            assert.isOk(await ready(w), "read");
            const idx = redraw(w);
            wv._wvWinStateSave(w);
            assert.strictEqual(saved(w).glyph, idx);
            assert.notProperty(saved(w), "glyphPicked", "drawn, not picked");
            const copy = Z.openMainWindow({ windowSettings: w.ZoteroPane.getWindowSettings() });
            assert.isOk(await ready(copy), "read");
            assert.notStrictEqual(wv._wvTitleGlyphIdx(copy), w._wvTitleGlyphIdx, "not the first one's");
        });
    });
});
