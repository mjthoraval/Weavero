/* global describe, it, before, assert, Zotero */

// Outline click moves the current-section marker AT ONCE (MJT 2026-09-24:
// "the outline position takes time to move" after clicking another entry).
// Navigation stamps a 1.5 s scroll-spy suppression so the jump cannot move
// the marker away from the click -- but nothing marked the clicked entry, so
// the marker sat on the PREVIOUS entry for the whole window. FAILS on the
// pre-fix code (the marker stayed on the first row).

describe("Weavero — outline click marks the current section", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    const fixture = () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-spy-click");
        const list = d.createElement("div");
        list.className = "wv-outline-list";
        d.body.appendChild(list);
        const mkRow = (title) => {
            const row = /** @type {any} */ (d.createElement("div"));
            row.className = "wv-outline-row";
            row._wvOl = { entry: { id: title, title }, index: 0, curatedView: true };
            list.appendChild(row);
            return row;
        };
        const a = mkRow("First"), b = mkRow("Second");
        a.classList.add("wv-outline-current");
        return { d, a, b };
    };
    // No view at all: navigation itself bails out, the marking must not.
    const reader = { _type: "snapshot", _internalReader: {} };

    it("the clicked row becomes current immediately", () => {
        const { d, a, b } = fixture();
        wv._wvOutlineNavigate(reader, d, b._wvOl.entry, b);
        assert.isTrue(b.classList.contains("wv-outline-current"), "clicked row marked");
        assert.isFalse(a.classList.contains("wv-outline-current"), "previous marker moved");
    });

    it("navigation without a row (menu Open) finds the entry's row", () => {
        const { d, a, b } = fixture();
        wv._wvOutlineNavigate(reader, d, b._wvOl.entry, null);
        assert.isTrue(b.classList.contains("wv-outline-current"));
        assert.isFalse(a.classList.contains("wv-outline-current"));
    });

    // Follow-up the same day: after the landing, the user's OWN scrolling was
    // also frozen for the rest of the 1.5 s window. The window is for the
    // jump's scroll only -- user input since the jump lifts it.
    it("user input after the jump lifts the spy suppression", () => {
        const { d, a, b } = fixture();
        const orig = wv._wvOutlineSpyPickDom;
        wv._wvOutlineSpyPickDom = () => b;
        const rd = { _type: "snapshot", _wvOutlineNavTime: Date.now() };
        // the picker's list lookup needs the outline view class around the list
        const view = d.createElement("div");
        view.className = "wv-outline-reader-view";
        d.body.appendChild(view);
        view.appendChild(d.querySelector(".wv-outline-list"));
        try {
            wv._wvOutlineSpyUpdate(rd, d);
            assert.isTrue(a.classList.contains("wv-outline-current"), "the jump's own scroll is absorbed");
            rd._wvSpyUserInputAt = Date.now() + 1;
            wv._wvOutlineSpyUpdate(rd, d);
            assert.isTrue(b.classList.contains("wv-outline-current"), "the user's scroll moves the marker");
        }
        finally { wv._wvOutlineSpyPickDom = orig; }
    });

    it("a link entry leaves the marker alone", () => {
        const { d, a, b } = fixture();
        const orig = Zotero.launchURL;
        Zotero.launchURL = () => {};
        try {
            b._wvOl.entry.url = "https://example.org";
            wv._wvOutlineNavigate(reader, d, b._wvOl.entry, b);
            assert.isTrue(a.classList.contains("wv-outline-current"));
        }
        finally { Zotero.launchURL = orig; }
    });
});
