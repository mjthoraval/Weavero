/* global describe, it, before, after, assert, Zotero */

// Issue #48 (macOS): the column picker is opened as a context menu, which
// Gecko shows as a native NSMenu on Mac; a native item cannot carry the
// provenance mark Weavero draws at the right end. On Mac, Weavero opens
// that one popup without the context flag, so Gecko draws it itself and
// the mark shows. Exercised here through the force flag (the runner is
// Windows/Linux); the look on a real Mac is checked by hand.
// FAILS on the pre-fix code (no wrap: the picker keeps the context flag).

describe("Weavero — column picker on macOS opens as a non-context popup (#48)", () => {
    let wv, prevForce;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvWireColumnPickerNativeFix !== "function") this.skip();
        prevForce = wv._wvForceMacPickerFix;
    });

    after(() => { if (wv) wv._wvForceMacPickerFix = prevForce; });

    const fakeWin = (calls) => {
        const proto = {
            openPopupAtScreen(...args) { calls.push([this.id, ...args]); return "opened"; },
        };
        return { win: { XULPopupElement: { prototype: proto } }, proto };
    };

    it("the picker loses the context flag; every other popup keeps its arguments", () => {
        const calls = [];
        const { win, proto } = fakeWin(calls);
        const orig = proto.openPopupAtScreen;
        wv._wvForceMacPickerFix = true;
        wv._wvWireColumnPickerNativeFix(win);
        assert.notEqual(proto.openPopupAtScreen, orig, "wrapped");
        const picker = Object.create(proto); picker.id = "zotero-column-picker";
        const other = Object.create(proto); other.id = "zotero-itemmenu";
        assert.equal(picker.openPopupAtScreen(10, 20, true), "opened", "the original's result comes back");
        other.openPopupAtScreen(10, 20, true);
        picker.openPopupAtScreen(10, 20, false);
        assert.deepEqual(calls, [
            ["zotero-column-picker", 10, 20, false],
            ["zotero-itemmenu", 10, 20, true],
            ["zotero-column-picker", 10, 20, false],
        ]);
        // Idempotent, and the unwire restores the original.
        const wrapped = proto.openPopupAtScreen;
        wv._wvWireColumnPickerNativeFix(win);
        assert.equal(proto.openPopupAtScreen, wrapped, "wired once");
        wv._wvUnwireColumnPickerNativeFix(win);
        assert.equal(proto.openPopupAtScreen, orig, "original back");
        picker.openPopupAtScreen(1, 2, true);
        assert.deepEqual(calls[calls.length - 1], ["zotero-column-picker", 1, 2, true]);
    });

    it("is not installed off macOS", function () {
        if (Zotero.isMac) this.skip();
        const calls = [];
        const { win, proto } = fakeWin(calls);
        const orig = proto.openPopupAtScreen;
        wv._wvForceMacPickerFix = false;
        wv._wvWireColumnPickerNativeFix(win);
        assert.equal(proto.openPopupAtScreen, orig, "untouched on Windows / Linux");
    });
});
