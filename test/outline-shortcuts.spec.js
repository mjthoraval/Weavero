/* global describe, it, before, after, assert, Zotero, Services */

// Outline keyboard shortcuts (issue #51, MJT 2026-10-05): user-recorded,
// no defaults, any combination (a bare letter included), removable;
// combinations the reader / pdf.js / Zotero already use are refused with
// their owner named; typing in a text field always wins.

describe("Weavero — outline keyboard shortcuts (#51)", () => {
    let wv;
    const IDS = ["selection", "pin", "anchorTop", "anchorBottom"];
    const prev = {};
    const sp = (code, label, m = {}) => ({ code, label, ctrl: !!m.c, alt: !!m.a, shift: !!m.s, meta: !!m.m });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineShortcutKey !== "function") wvT.absent('!wv || typeof wv._wvOutlineShortcutKey !== "function"');
        for (const id of IDS) prev[id] = Zotero.Prefs.get("weavero.outlineKey." + id);
    });

    after(() => {
        if (!wv) return;
        for (const id of IDS) Zotero.Prefs.set("weavero.outlineKey." + id, typeof prev[id] === "string" ? prev[id] : "");
    });

    it("nothing is bound out of the box", () => {
        for (const id of IDS) {
            const v = Services.prefs.getDefaultBranch("extensions.zotero.").getCharPref("weavero.outlineKey." + id, "missing");
            assert.strictEqual(v, "", id + " defaults to empty");
        }
    });

    it("refuses what the reader, pdf.js and Zotero use, accepts free keys", () => {
        assert.isNull(wv._wvOutlineKeyConflict(sp("KeyT", "T")), "bare T is free");
        assert.match(wv._wvOutlineKeyConflict(sp("KeyH", "H")), /Hand tool/);
        assert.match(wv._wvOutlineKeyConflict(sp("KeyN", "N")), /next page/);
        assert.match(wv._wvOutlineKeyConflict(sp("Digit3", "3")), /colour/);
        assert.match(wv._wvOutlineKeyConflict(sp("Digit2", "2", { a: 1 })), /annotation tools/);
        const accel = Zotero.isMac ? { m: 1 } : { c: 1 };
        assert.match(wv._wvOutlineKeyConflict(sp("KeyZ", "Z", accel)), /Undo/);
        assert.match(wv._wvOutlineKeyConflict(sp("KeyO", "O", Object.assign({ s: 1 }, accel))), /Zotero’s “New note”/);
    });

    it("another outline shortcut is a conflict, the same action is not", () => {
        Zotero.Prefs.set("weavero.outlineKey.pin", JSON.stringify(sp("KeyT", "T")));
        assert.match(wv._wvOutlineKeyConflict(sp("KeyT", "T"), "selection"), /Pin a Spot/);
        assert.isNull(wv._wvOutlineKeyConflict(sp("KeyT", "T"), "pin"));
        Zotero.Prefs.set("weavero.outlineKey.pin", "");
    });

    it("records the physical key and labels it", () => {
        const s = wv._wvOutlineKeySpecFromEvent({ code: "KeyT", key: "t", ctrlKey: true, shiftKey: true });
        assert.include(s, { code: "KeyT", label: "T", ctrl: true, shift: true, alt: false, meta: false });
        assert.isNull(wv._wvOutlineKeySpecFromEvent({ code: "ShiftLeft", key: "Shift", shiftKey: true }), "a lone modifier waits");
        assert.equal(wv._wvOutlineKeySpecFromEvent({ code: "Digit1", key: "&" }).label, "1", "AZERTY digit row");
        assert.equal(wv._wvOutlineKeyLabel(sp("KeyT", "T")), "T");
    });

    it("fires on an exact match only, and never while typing", () => {
        const calls = [];
        const orig = wv._wvOutlineAddWithPin;
        wv._wvOutlineAddWithPin = () => calls.push("pin");
        try {
            Zotero.Prefs.set("weavero.outlineKey.pin", JSON.stringify(sp("KeyT", "T")));
            const doc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-okeys");
            const input = doc.createElement("input");
            doc.body.appendChild(input);
            const reader = { _type: "pdf", _iframeWindow: { document: doc }, _internalReader: { _state: {} } };
            const ev = (target, m = {}) => ({ code: "KeyT", key: "t", ctrlKey: !!m.c, altKey: false, shiftKey: !!m.s, metaKey: false,
                target, preventDefault() {}, stopPropagation() {} });
            assert.isTrue(wv._wvOutlineShortcutKey(reader, ev(doc.body)), "bare T on the page");
            assert.isFalse(wv._wvOutlineShortcutKey(reader, ev(doc.body, { s: 1 })), "Shift+T is another combination");
            assert.isFalse(wv._wvOutlineShortcutKey(reader, ev(input)), "typing in a field");
            assert.deepEqual(calls, ["pin"]);
            Zotero.Prefs.set("weavero.outlineKey.pin", "");
            assert.isFalse(wv._wvOutlineShortcutKey(reader, ev(doc.body)), "removed: nothing bound");
        }
        finally { wv._wvOutlineAddWithPin = orig; delete wv._wvOutlineAddWithPin; }
    });
});
