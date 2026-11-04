/* global describe, it, before, after, assert, Zotero, Services */
// Issue #63 (2026-11-04, GNOME, Zotero 11.0-beta.3): "After enabling the
// option for item pane in new reader windows, item pane's font size stays
// small." Zotero applies View -> Font Size and Settings -> Density only to
// the roots it registers with Zotero.UIProperties (zoteroPane.js registers
// #zotero-pane and #zotero-context-pane; uiProperties.js sets the root's
// font-size, --zotero-font-size and `zoteroUIDensity`, and again on every
// change of either pref). Weavero's item pane in a separate reader window
// (#wv-reader-pane, reader.ts _ensureReaderWindowItemPane) was never
// registered: 13 px at Font Size 1.23 while the main item pane read 16.
// FAILED on 1.0.0-beta.2-dev.7.
describe("Weavero — a reader window's item pane follows Zotero's Font Size and density (issue #63)", function () {
    this.timeout(120000);
    let wv, win, att;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(100);
        }
        throw new Error("timeout waiting for " + what);
    };
    const windowsOf = (type) => { const out = []; const en = Services.wm.getEnumerator(type); while (en.hasMoreElements()) { const w = /** @type {any} */ (en.getNext()); if (w && !w.closed) out.push(w); } return out; };
    const saved = {};
    const WV = ["readerItemPane", "enableTabsAndWindows"];

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._ensureReaderWindowItemPane !== "function") wvT.absent("plugin._ensureReaderWindowItemPane");
        win = Zotero.getMainWindow();
        for (const k of WV) saved[k] = Zotero.Prefs.get("weavero." + k);
        saved.fontSize = Zotero.Prefs.get("fontSize");
        saved.uiDensity = Zotero.Prefs.get("uiDensity");
        for (const k of WV) Zotero.Prefs.set("weavero." + k, true);
        att = await wvT.createTestPDFItem("wv-issue63-pane");
    });

    after(async function () {
        Zotero.Prefs.set("fontSize", saved.fontSize);
        Zotero.Prefs.set("uiDensity", saved.uiDensity);
        for (const k of WV) Zotero.Prefs.set("weavero." + k, saved[k] === undefined ? true : !!saved[k]);
        await wvT.erase(att);
    });

    it("the pane takes the main item pane's font size and density, and follows a change of either", async function () {
        const before = new Set(windowsOf("zotero:reader"));
        let w = null;
        try {
            await Zotero.Reader.open(att.id, null, { openInWindow: true });
            w = await waitFor(() => windowsOf("zotero:reader").find(x => !before.has(x)) || null, 15000, "the reader window");
            const pane = await waitFor(() => w.document.getElementById("wv-reader-pane"), 30000, "Weavero's reader-window item pane");
            const main = win.document.getElementById("zotero-item-pane");
            const zp = win.document.getElementById("zotero-pane");
            const read = () => ({
                font: w.getComputedStyle(pane).fontSize,
                density: pane.getAttribute("zoteroUIDensity"),
            });
            const want = () => ({
                font: win.getComputedStyle(main).fontSize,
                density: zp.getAttribute("zoteroUIDensity"),
            });
            for (const [fontSize, uiDensity] of [["1.23", "comfortable"], ["1.00", "compact"]]) {
                Zotero.Prefs.set("fontSize", fontSize);
                Zotero.Prefs.set("uiDensity", uiDensity);
                await sleep(200);
                assert.deepEqual(read(), want(), "Font Size " + fontSize + ", density " + uiDensity + ": the main item pane's");
            }
            // Never close a window before it has finished loading (tests.md).
            await waitFor(() => w.document.readyState === "complete", 10000, "the window loaded");
        }
        finally {
            try { if (w && !w.closed) w.close(); } catch (e) {}
            for (let i = 0; i < 50 && w && !w.closed; i++) await sleep(100);
            wvT.purgeDeadReaders();
        }
    });
});
