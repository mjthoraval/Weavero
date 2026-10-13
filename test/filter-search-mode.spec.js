/* global describe, it, before, after, assert, Zotero */

// The filter panel's multi-select search (Tag / Author / Added By / ...):
// switching its mode while the previous mode's values are still loading
// (survey 2026-10-06, smaller bugs). The load stored and rendered whatever
// it got under whichever mode was current WHEN IT LANDED, so a slow load
// of the previous mode filled the new mode's suggestion list.

describe("Weavero — filter panel search: a mode switch supersedes the load in flight", function () {
    this.timeout(30000);
    let wv, win, doc;
    const KEEP = ["_unifiedSearchMode", "_tagSearchQuery", "_authorSearchQuery"];
    const saved = {};
    const stubs = [];
    let release = null;

    /** Replace a plugin method for this spec (opening the panel clears the
     *  value caches, so the COLLECTORS are what the spec controls). */
    const stub = (name, fn) => {
        stubs.push({ name, own: Object.prototype.hasOwnProperty.call(wv, name), orig: wv[name] });
        wv[name] = fn;
    };

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_openFilterPanel", "_collectAnnotationTags", "_collectAnnotationAuthors"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        for (const k of KEEP) saved[k] = wv[k];
    });

    after(() => {
        try { if (release) release(); } catch (_) {}
        try { const m = doc.querySelector("menupopup.wv-filter-mode-menupopup"); if (m) m.hidePopup(); } catch (_) {}
        try { const p = doc.getElementById("wv-filter-popup"); if (p) p.hidePopup(); } catch (_) {}
        for (const s of stubs.reverse()) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; }
        for (const k of KEEP) wv[k] = saved[k];
        wv._cachedAnnotationTags = null;
        wv._cachedAnnotationAuthors = null;
    });

    it("a slow load of the previous mode never fills the new mode's list", async () => {
        const pending = [];
        release = () => { for (const r of pending.splice(0)) r(["wv-slow-tag"]); };
        stub("_collectAnnotationTags", () => new Promise((r) => { pending.push(r); }));
        stub("_collectAnnotationAuthors", async () => ["wv-fast-author"]);
        wv._tagSearchQuery = "";
        wv._authorSearchQuery = "";
        wv._unifiedSearchMode = "author";
        wv._openFilterPanel();
        const popup = await wvT.waitFor(() => {
            const p = doc.getElementById("wv-filter-popup");
            return p && p.state === "open" && p.querySelector(".wv-filter-mode-trigger") ? p : null;
        }, 10000);
        assert.isOk(popup, "the filter panel opened");
        // The panel re-renders its sections after opening, so every step
        // reads the LIVE section (a captured one can be a detached render).
        const live = () => {
            const t = doc.getElementById("wv-filter-popup").querySelector(".wv-filter-mode-trigger");
            const sec = t.closest(".wv-filter-section");
            return { trigger: t, input: sec.querySelector(".wv-filter-search-input"), box: sec.querySelector(".wv-filter-tag-list") };
        };
        assert.isOk(await wvT.waitFor(() => live().box.textContent.includes("wv-fast-author"), 5000), "Author values listed");
        await wvT.sleep(500);
        assert.isOk(live().box.textContent.includes("wv-fast-author"), "Author values still listed once settled");

        // The mode menu as a user drives it: the trigger builds it for its
        // section; the item's doCommand is a trusted command, which the popup
        // manager delivers ASYNCHRONOUSLY (verified live) -- so wait for it.
        const pick = async (label) => {
            live().trigger.click();
            const menu = doc.querySelector("menupopup.wv-filter-mode-menupopup");
            const it = [...menu.querySelectorAll("menuitem")].find(m => m.getAttribute("label") === label);
            assert.isOk(it, "menu item " + label);
            it.doCommand();
            assert.isOk(await wvT.waitFor(() => live().input.placeholder === label, 5000), "switched to " + label);
        };
        await pick("Tag");                                        // its load hangs until release()
        assert.isAbove(pending.length, 0, "the Tag load is in flight");
        await pick("Author");                                     // lands at once
        assert.isOk(await wvT.waitFor(() => live().box.textContent.includes("wv-fast-author"), 5000), "Author values back");
        release();                                                // the Tag load lands LAST
        await wvT.sleep(300);

        const end = live();
        assert.strictEqual(end.input.placeholder, "Author");
        assert.include(end.box.textContent, "wv-fast-author");
        assert.notInclude(end.box.textContent, "wv-slow-tag", "the superseded Tag load did not land");
    });
});
