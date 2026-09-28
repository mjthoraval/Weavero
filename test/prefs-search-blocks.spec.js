/* global describe, it, assert, Zotero */

// Settings search granularity (MJT 2026-09-28): Zotero's search hides each
// direct child of the pane's .main-section that has no match, so a child
// holding many settings shows all of them for one hit ("firefox" showed three
// whole sections). Each setting is its own child (.wv-block); headers stay in
// theirs and prefs.js keeps them visible via [data-wv-head] / [data-wv-in].
// FAILS on the pre-change pane (a section's settings shared one container).

describe("Weavero — Settings pane: one search block per setting", () => {
    // Rows that hold several related toggles on purpose: one setting group.
    const GROUPED = ".wv-show-row, .wv-apply-row, .wv-scheme-grid, .wv-anntypes-row, .wv-dep, .wv-tophead, .wv-subhead";

    // Parsed the way Zotero mounts plugin panes (a plain DOMParser refuses
    // the XUL namespace outright).
    const pane = async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const html = await (await fetch(rootURI + "prefs.html")).text();
        const frag = Zotero.getMainWindow().MozXULElement.parseXULToFragment(html);
        const ms = frag.querySelector(".main-section");
        assert.isOk(ms, "prefs.html parses");
        return ms;
    };

    it("no direct child of the pane holds more than one standalone setting", async () => {
        const ms = await pane();
        const crowded = [];
        for (const child of ms.children) {
            const own = [...child.querySelectorAll("checkbox[preference]")]
                .filter((cb) => !cb.closest(GROUPED) || !child.contains(cb.closest(GROUPED)));
            if (own.length > 1) {
                crowded.push((child.getAttribute("id") || child.localName) + ": "
                    + own.map((c) => c.getAttribute("preference").replace("extensions.zotero.weavero.", "")).join(", "));
            }
        }
        assert.deepEqual(crowded, []);
    });

    it("every header key a block names exists, and comes before the block", async () => {
        const ms = await pane();
        const seen = new Set();
        const bad = [];
        for (const child of ms.children) {
            for (const k of (child.getAttribute("data-wv-in") || "").split(/\s+/).filter(Boolean)) {
                if (!seen.has(k)) bad.push(k + " before its header");
            }
            const h = child.getAttribute("data-wv-head");
            if (h) seen.add(h);
        }
        assert.deepEqual(bad, []);
    });
});
