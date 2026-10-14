/* global describe, it, before, after, assert, Zotero, Components, InspectorUtils */

// WV-TEMP-134233 (https://forums.zotero.org/discussion/134233): the reader's
// FocusManager cancels every pointerdown in reader.html outside its exemption
// list, a press on a scroll box's native scrollbar included, so the
// scrollbar never got :active and a Windows 11 overlay scrollbar shrank back
// mid-drag. Weavero's _wvReaderScrollbarPressFix drops that cancel for
// scrollbar presses only. A scripted pointerdown dispatched at the thumb
// reaches the reader's handler with the scroll box as its target, exactly
// as a real press does (measured 2026-10-13), so the cancel is observable
// here as `defaultPrevented`.

describe("Weavero — reader: a press on a scrollbar is not cancelled (WV-TEMP-134233)", function () {
    this.timeout(60000);
    let wv, att, reader, iwin, idoc, box, thumb;
    const KEY = "readerScrollbarPress:pointerdown";

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvReaderScrollbarPressFix");
        att = await wvT.createTestPDFItem("wv-sbpress");
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "reader opened");
        iwin = reader._iframeWindow;
        idoc = iwin.document;
        // Weavero wires the reader page asynchronously (_setupReaderObserver).
        const lib = wvT.lib();
        const wired = await wvT.waitFor(() => lib.wvListenKeys(iwin).some(k => k.key === KEY) || null, 20000);
        assert.ok(wired, "the workaround's listener is on the reader page");
        box = idoc.createElement("div");
        box.style.cssText = "position: fixed; left: 0; top: 0; width: 160px; height: 80px; overflow: auto; z-index: 99999";
        box.textContent = "x ".repeat(800);
        idoc.body.appendChild(box);
        box.getBoundingClientRect();
        const all = [];
        const walk = (n, depth) => {
            if (depth > 6) return;
            for (const c of InspectorUtils.getChildrenForNode(n, true, false)) {
                if (c.nodeType === 1) { all.push(c); walk(c, depth + 1); }
            }
        };
        walk(box, 0);
        thumb = all.find(e => e.localName === "thumb") || null;
        assert.ok(thumb, "the scroll box has an anonymous scrollbar thumb");
    });

    after(async function () {
        try { if (box) box.remove(); } catch (e) {}
        wvT.closeReaderTab(reader);
        await wvT.erase(att);
    });

    const press = (el) => {
        const ev = new iwin.PointerEvent("pointerdown", Components.utils.cloneInto(
            { bubbles: true, cancelable: true, composed: true, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }, iwin));
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
    };

    it("a press on the scrollbar's thumb is not cancelled", () => {
        assert.isFalse(press(thumb));
    });

    it("a press on the scroll box itself is still cancelled by the reader (the workaround stays narrow)", () => {
        assert.isTrue(press(box));
    });

    it("upstream still cancels scrollbar presses (fails once Zotero fixes it: retire WV-TEMP-134233)", () => {
        const lib = wvT.lib();
        lib.wvUnlisten(iwin, KEY);
        try {
            assert.isTrue(press(thumb),
                "the reader no longer cancels a scrollbar press -- Zotero fixed forum 134233: remove _wvReaderScrollbarPressFix and this spec");
        }
        finally { wv._wvReaderScrollbarPressFix(iwin); }
        assert.isFalse(press(thumb), "workaround re-wired");
    });
});
