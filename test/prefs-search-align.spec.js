/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-10-20: on a wide Settings window Zotero's search box sits at the
// far right of its full-width row while every pane stops at 800 px. Weavero
// caps the row to the content column with a window-level style (Visual
// Extras master), applied by a zotero:pref window watcher.
describe("Weavero — the Settings search box stays aligned with the content column", function () {
    this.timeout(60000);
    let wv, pw;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const rightOf = (el) => el.getBoundingClientRect().right;
    const box = () => pw.document.getElementById("prefs-search");
    const contentRight = () => {
        const kids = [...pw.document.querySelectorAll("#prefs-content > *")].filter(e => !e.hidden && e.getBoundingClientRect().width > 0);
        return kids.length ? Math.max(...kids.map(rightOf)) : NaN;
    };
    const until = async (fn, ms) => { for (let t = 0; t < ms; t += 50) { if (fn()) return true; await sleep(50); } return fn(); };
    // Geometry in the failure message: the style's text + the rects involved.
    const geo = () => {
        try {
            const d = pw.document, r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; };
            const st = d.getElementById("wv-prefs-search-align");
            return JSON.stringify({ style: st && st.textContent, row: r(d.getElementById("prefs-search-container")), box: r(box()),
                kids: [...d.querySelectorAll("#prefs-content > *")].filter(e => !e.hidden).map(e => (e.id || e.localName) + ":" + r(e)) });
        } catch (e) { return String(e); }
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._wvPrefsAlignSearch !== "function") wvT.absent("_wvPrefsAlignSearch");
        pw = Zotero.Utilities.Internal.openPreferences("general");
        // The window starts on about:blank; wait for the real document and a loaded pane.
        assert.isTrue(await until(() => { try { return !!pw.document.getElementById("prefs-search"); } catch (e) { return false; } }, 10000), "Settings window loaded");
        assert.isTrue(await until(() => contentRight() > 0, 10000), "a pane rendered");
        pw.resizeTo(1500, 700);
        await sleep(500);
    });

    after(function () { try { pw.close(); } catch (e) {} });

    it("the style is injected on open and the box's right edge meets the content's", async function () {
        assert.isAbove(pw.innerWidth, 1200, "window wide enough for the cap to matter");
        assert.isTrue(await until(() => !!pw.document.getElementById("wv-prefs-search-align"), 3000), "style present");
        assert.closeTo(rightOf(box()), contentRight(), 1.5, "search box right edge == content right edge " + geo());
    });

    it("without the style the box floats to the window's edge (the native layout the cap corrects)", async function () {
        wv._wvPrefsUnalignSearch(pw);
        await sleep(100);
        assert.isNull(pw.document.getElementById("wv-prefs-search-align"));
        assert.isAbove(rightOf(box()), contentRight() + 100, "native: far from the content");
        wv._wvPrefsAlignSearch(pw);
        await sleep(100);
        assert.closeTo(rightOf(box()), contentRight(), 1.5, "re-applied " + geo());
    });

    // Zotero.PreferencePanes._refreshPreferences() reloads every open Settings
    // window when a pane is registered or unregistered (a plugin reload,
    // update or disable): the document under the style is replaced, and a
    // window watcher (domwindowopened) never hears of it -- the cap vanished
    // on every reload with Settings open (2026-10-20).
    it("a reload of the Settings document (what a pane registration does) gets the style again", async function () {
        // The old document is marked: the new one (no mark) is the reloaded one.
        pw.document.documentElement.setAttribute("data-wv-test-old-doc", "1");
        pw.location.reload();
        assert.isTrue(await until(() => { try { return !pw.document.documentElement.hasAttribute("data-wv-test-old-doc") && pw.document.readyState === "complete" && !!pw.document.getElementById("prefs-search"); } catch (e) { return false; } }, 10000), "reloaded");
        assert.isTrue(await until(() => !!pw.document.getElementById("wv-prefs-search-align"), 5000), "style back after the reload");
        assert.isTrue(await until(() => contentRight() > 0, 10000), "a pane rendered again");
        // The reload puts the window back at its default 800 px, where the cap has nothing to do.
        pw.resizeTo(1500, 700);
        await sleep(500);
        assert.isAbove(pw.innerWidth, 1200, "wide again");
        assert.closeTo(rightOf(box()), contentRight(), 1.5, "aligned again " + geo());
    });

    it("the Visual Extras master removes and restores it live", async function () {
        const key = "weavero.enableVisualExtras";
        const was = Zotero.Prefs.get(key);
        try {
            Zotero.Prefs.set(key, false);
            assert.isTrue(await until(() => !pw.document.getElementById("wv-prefs-search-align"), 3000), "off: style removed");
            Zotero.Prefs.set(key, true);
            assert.isTrue(await until(() => !!pw.document.getElementById("wv-prefs-search-align"), 3000), "on: style back");
            assert.closeTo(rightOf(box()), contentRight(), 1.5);
        } finally {
            Zotero.Prefs.set(key, was !== false);
        }
    });
});
