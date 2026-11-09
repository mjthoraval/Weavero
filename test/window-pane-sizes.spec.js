/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// Each main window keeps its own pane widths (MJT 2026-11-08, "Ok as described and
// recommended"): the collections pane's width, the item pane's width and, in the
// stacked layout, its height. Whether a pane is collapsed stays Zotero's shared
// setting. A new window starts from the window it was opened from, as before.
//
// Zotero main (zotero#6035) keeps ONE layout for every window and library tab on
// purpose ("Library views share one set of values", zoteroPane.js serializePersist)
// and puts it back each time a library tab is shown (libraryView.adoptSharedState):
// a window took the widths whichever window saved last, without a restart (restart
// checks 2026-11-07: one shared width). On an older Zotero every window started from
// that one saved value at each start.
//
// The records and the pool half run on every Zotero; the live adoption needs the
// real build.

describe("Weavero — each window keeps its own pane widths", () => {
    let wv, lib, spare, persist;
    const Z = /** @type {any} */ (Zotero);
    const realNative = wvT.nativeWindows();
    const STATE = "weavero.windowState";

    before(function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPaneSizesCapture", "_wvPaneSizesApply"]) wvT.method(m);
        if (!lib || !lib.wvPaneSizesRead || !lib.wvPaneSizesWrite) wvT.absent("lib.wvPaneSizesRead / wvPaneSizesWrite");
        spare = Zotero.getMainWindows().length;
        persist = Zotero.Prefs.get("pane.persist");
    });

    after(function () {
        if (persist === undefined) Zotero.Prefs.clear("pane.persist");
        else Zotero.Prefs.set("pane.persist", persist);
    });

    async function closeOurs() {
        for (const w of Zotero.getMainWindows().slice(spare)) {
            try { w.close(); } catch (e) {}
            await wvT.waitFor(() => w.closed, 8000);
            await wvT.sleep(300);
        }
    }

    /** The element `id` of window `w`'s shown library view (or its document). */
    const el = (w, id) => {
        const v = w.ZoteroPane && w.ZoteroPane.libraryView;
        return v && typeof v.getElement === "function" ? v.getElement(id) : w.document.getElementById(id);
    };
    const widthOf = (w) => Number(el(w, "zotero-collections-pane").getAttribute("width"));

    describe("the records", () => {
        it("read and write the three sizes, and leave out what is not a size", () => {
            const els = {};
            const fake = (id) => els[id] || (els[id] = { attrs: {}, style: {}, getAttribute(a) { return this.attrs[a] ?? null; }, setAttribute(a, v) { this.attrs[a] = v; } });
            assert.isNull(lib.wvPaneSizesRead(fake), "nothing set, nothing read");
            assert.isTrue(lib.wvPaneSizesWrite(fake, { coll: 260, item: 410, itemH: 300 }));
            assert.strictEqual(els["zotero-collections-pane"].attrs.width, "260");
            assert.strictEqual(els["zotero-collections-pane"].style.width, "260px");
            assert.strictEqual(els["zotero-item-pane"].attrs.width, "410");
            assert.strictEqual(els["zotero-item-pane"].attrs.height, "300");
            assert.deepEqual(lib.wvPaneSizesRead(fake), { coll: 260, item: 410, itemH: 300 });
            assert.isFalse(lib.wvPaneSizesWrite(fake, { coll: "wide", item: -3, itemH: NaN }), "no size, nothing written");
            assert.isFalse(lib.wvPaneSizesWrite(fake, null));
        });

        it("the move to Zotero's own windows and a session's window take the sizes along", () => {
            const p = lib.wvPlanWindowTransfer({ anchorPaneSizes: { coll: 240 }, windows: [
                { kind: "main-dev", tabs: [{ type: "library", title: "My Library" }], wvMainState: { paneSizes: { coll: 300, item: 420 } } },
            ] }, new Map(), () => null, { newId: () => "new" });
            assert.deepEqual(JSON.parse(p.windows[0].settings.prefs[STATE]), { paneSizes: { coll: 300, item: 420 }, id: "new" });
            assert.deepEqual(p.first.state, { paneSizes: { coll: 240 } }, "the first window's, from its own store field");
            const stored = wv._wvTabSessionStoredWindow({ kind: "main", tabs: [], paneSizes: { coll: 280 } }, false);
            assert.deepEqual(stored.wvMainState.paneSizes, { coll: 280 });
        });
    });

    describe("a real window", () => {
        let a;
        before(async function () {
            this.timeout(60000);
            a = await wvT.openMainWindow();
            assert.isOk(a, "a second window");
        });
        after(async function () {
            this.timeout(30000);
            await closeOurs();
        });

        it("its record carries its sizes, and gives them back", async () => {
            wv._wvPaneSizesApply(a, { coll: 271, item: 433 });
            assert.strictEqual(widthOf(a), 271, "applied");
            const ms = wv._wvTabSessionCaptureMainState(a);
            assert.deepEqual(ms.paneSizes && { coll: ms.paneSizes.coll, item: ms.paneSizes.item }, { coll: 271, item: 433 }, "captured");
            await wv._wvTabSessionApplyMainState(a, { paneSizes: { coll: 288, item: 401 } });
            assert.strictEqual(widthOf(a), 288, "given back");
            assert.strictEqual(Number(el(a, "zotero-item-pane").getAttribute("width")), 401);
        });

        it("the first window's sizes ride a store field of their own", () => {
            const first = Zotero.getMainWindows()[0];
            const pane = el(first, "zotero-collections-pane");
            const keep = { attr: pane.getAttribute("width"), style: pane.style.width, own: first._wvPaneSizes };
            try {
                wv._wvPaneSizesApply(first, { coll: 261 });
                const doc = wv._wvWindowStoreBuildDoc([]);
                assert.strictEqual(doc.anchorPaneSizes && doc.anchorPaneSizes.coll, 261);
            }
            finally {
                if (keep.attr == null) pane.removeAttribute("width"); else pane.setAttribute("width", keep.attr);
                pane.style.width = keep.style;
                if (keep.own === undefined) delete first._wvPaneSizes; else first._wvPaneSizes = keep.own;
            }
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

        it("a window shown again keeps its own widths, not the ones another window saved last", async function () {
            this.timeout(60000);
            const a = await wvT.openMainWindow(), b = await wvT.openMainWindow();
            assert.isOk(a && b, "two windows");
            assert.isOk(await ready(a) && await ready(b), "read");
            wv._wvPaneSizesApply(a, { coll: 333 });
            a.ZoteroPane.serializePersist();
            wv._wvPaneSizesApply(b, { coll: 222 });
            b.ZoteroPane.serializePersist();
            assert.strictEqual(JSON.parse(String(Zotero.Prefs.get("pane.persist")))["zotero-collections-pane"].width, "222", "Zotero's shared value: the last window's");
            a.ZoteroPane.libraryView.adoptSharedState();
            assert.strictEqual(widthOf(a), 333, "a keeps its own");
            b.ZoteroPane.libraryView.adoptSharedState();
            assert.strictEqual(widthOf(b), 222, "b too");
        });

        it("a window's widths go into Zotero's saved state, and come back with it", async function () {
            this.timeout(60000);
            const w = await wvT.openMainWindow();
            assert.isOk(await ready(w), "read");
            wv._wvPaneSizesApply(w, { coll: 314, item: 415 });
            wv._wvWinStateSave(w);
            const st = JSON.parse(w.ZoteroPane.getWindowSettings().prefs[STATE] || "{}");
            assert.strictEqual(st.paneSizes && st.paneSizes.coll, 314, "saved");
            const sessionState = w.ZoteroPane.getState();
            w.ZoteroPane.serializePersist();
            w.close();
            await wvT.waitFor(() => w.closed, 8000);
            Zotero.Prefs.set("pane.persist", JSON.stringify({ "zotero-collections-pane": { width: "205" } }));
            const again = Z.openMainWindow({ sessionState });
            assert.isOk(await ready(again), "read again");
            assert.isOk(await wvT.waitFor(() => widthOf(again) === 314, 8000), "its own width back, not the shared 205: " + widthOf(again));
            assert.strictEqual(Number(el(again, "zotero-item-pane").getAttribute("width")), 415);
        });

        it("a window opened from another starts with that window's widths", async function () {
            this.timeout(60000);
            const w = await wvT.openMainWindow();
            assert.isOk(await ready(w), "read");
            wv._wvPaneSizesApply(w, { coll: 297 });
            wv._wvWinStateSave(w);
            const before = Zotero.getMainWindows();
            w.ZoteroPane.newWindow();
            const n = await wvT.waitFor(() => {
                const x = Zotero.getMainWindows().find(y => !before.includes(y));
                return x && x.ZoteroPane && x.ZoteroPane.libraryView && x.ZoteroPane.libraryView.loaded ? x : null;
            }, 15000);
            assert.isOk(n, "the new window");
            await ready(n);
            assert.strictEqual(widthOf(n), 297);
        });
    });
});
