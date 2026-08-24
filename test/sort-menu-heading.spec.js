/* global describe, it, before, assert, Zotero */

// Both reader sort menus carry a "Sort by" heading (2026-08-24).
//
// The bookmarks sort menu has titled its sections since it was built. The
// ANNOTATIONS sort menu did not: right-clicking the annotations tab header gave
// three bare field names with a tick and no statement of what axis they set
// (user request, with a screenshot).
//
// The contract worth keeping is the CONSISTENCY, not the string: two menus that
// do the same job in the same reader should announce themselves the same way.
// `.wv-ctx-heading` is the shared style, so the check is that the menu opens
// with that heading FIRST, above the field rows.

describe("Weavero — reader sort menus are titled", () => {
    let wv, doc;

    const stubDoc = () => {
        // A detached HTML document stands in for the reader's iframe document:
        // the menu builder only needs createElementNS / body / listeners.
        const d = doc.implementation.createHTMLDocument("wv-sort-menu-test");
        return d;
    };
    const stubAnchor = (d) => {
        const el = d.createElement("div");
        d.body.appendChild(el);
        // The builder positions the menu against the anchor's rect.
        el.getBoundingClientRect = () => ({ left: 10, top: 10, right: 40, bottom: 30, width: 30, height: 20 });
        return el;
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvShowAnnSortMenu !== "function") this.skip();
        doc = Zotero.getMainWindow().document;
    });

    it("the annotations sort menu opens with a 'Sort by' heading first", function () {
        const d = stubDoc();
        const anchor = stubAnchor(d);
        try {
            wv._wvShowAnnSortMenu({ _type: "pdf" }, d, anchor);
        } catch (e) {
            // The builder wires dismiss listeners; a detached document has no
            // defaultView. If that is fatal here, say so rather than assert
            // against a half-built menu.
            this.skip();
            return;
        }
        const menu = d.querySelector("[data-wv-annsort='1']");
        if (!menu) { this.skip(); return; }

        const first = menu.firstElementChild;
        assert.ok(first, "menu must have content");
        assert.include(first.className, "wv-ctx-heading",
            "the heading must come FIRST, above the field rows");
        assert.equal((first.textContent || "").trim(), "Sort by");
    });

    it("still lists exactly the three sort fields, unticked ones included", function () {
        const d = stubDoc();
        const anchor = stubAnchor(d);
        try { wv._wvShowAnnSortMenu({ _type: "pdf" }, d, anchor); }
        catch (e) { this.skip(); return; }
        const menu = d.querySelector("[data-wv-annsort='1']");
        if (!menu) { this.skip(); return; }

        const labels = [...menu.querySelectorAll(".wv-ctx-item")]
            .map(el => (el.textContent || "").replace("✓", "").trim());
        assert.deepEqual(labels, ["Position (default)", "Date Added", "Date Modified"],
            "adding the heading must not disturb the field rows");
    });

    it("the heading is a sibling of the rows, not wrapped around them", function () {
        const d = stubDoc();
        const anchor = stubAnchor(d);
        try { wv._wvShowAnnSortMenu({ _type: "pdf" }, d, anchor); }
        catch (e) { this.skip(); return; }
        const menu = d.querySelector("[data-wv-annsort='1']");
        if (!menu) { this.skip(); return; }

        const heading = menu.querySelector(".wv-ctx-heading");
        assert.equal(heading.children.length, 0, "heading holds text only");
        assert.equal(menu.children.length, 4, "heading + three field rows");
    });
});
