/* global describe, it, before, after, assert, Zotero, Components */

// lib/listen.ts on a reader's CONTENT frames (wiring slice 3, 2026-10-13).
// destroy() removes every keyed listener of the dying instance through the
// registry (wvUnlistenAll). It re-read the `_wvListen` table off the
// dereferenced target -- and a reader frame's table, written through the
// frame's WAIVED wrapper, was not visible through it: on a live PDF frame
// all 9 keyed listeners survived wvUnlistenAll (46 on chrome targets went).
// The next instance's peel hid it after a reload; a disable, and a page
// nothing re-wires (a deck window's anchor), kept them. A scratch tag keeps
// the live instance's own wiring out of it.

describe("Weavero — keyed listeners on a reader's frames are removed by wvUnlistenAll", function () {
    this.timeout(60000);
    let lib, item, reader;
    const Cu = Components.utils;
    const els = Components.classes["@mozilla.org/eventlistenerservice;1"].getService(Components.interfaces.nsIEventListenerService);

    before(async function () {
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        if (!lib || typeof lib.wvUnlistenAll !== "function") wvT.absent("Zotero.Weavero.lib.wvUnlistenAll");
        item = await wvT.createTestPDFItem("wv-listen-frames");
        await Zotero.Reader.open(item.id);
        for (let i = 0; i < 150; i++) {
            await wvT.sleep(100);
            reader = (Zotero.Reader._readers || []).find(r => r.itemID === item.id);
            if (reader && reader._internalReader && reader._internalReader._primaryView && reader._internalReader._primaryView._iframeWindow) break;
        }
        if (!(reader && reader._internalReader && reader._internalReader._primaryView._iframeWindow)) wvT.absent("a PDF reader frame");
    });

    after(async function () {
        try { const t = Zotero.getMainWindow().Zotero_Tabs; const tab = t._tabs.find(x => x.data && x.data.itemID === item.id); if (tab) t.close(tab.id); } catch (e) {}
        await wvT.sleep(500);
        try { await wvT.erase(item); } catch (e) {}
    });

    it("removes them from the PDF frame (window and document), the way destroy() does", () => {
        const TAG = "wv-test#frames-" + Date.now();
        const fw = reader._internalReader._primaryView._iframeWindow;   // waived, as Weavero wires it
        const fnW = function () {}, fnD = function () {};
        const has = (t, fn) => [...els.getListenerInfoFor(t)].some(li => { try { return li.listenerObject === fn; } catch (e) { return false; } });
        assert.isTrue(lib.wvListen(fw, "wvtest:frameWin", "pointerdown", fnW, true, TAG));
        assert.isTrue(lib.wvListen(fw.document, "wvtest:frameDoc", "keydown", fnD, true, TAG));
        assert.isTrue(has(Cu.unwaiveXrays(fw), fnW) || has(fw, fnW), "wired on the frame window");
        lib.wvUnlistenAll(TAG);
        const keys = (t) => { try { const T = Cu.waiveXrays(t)._wvListen; return T ? Object.keys(T).filter(k => k.startsWith("wvtest:")) : []; } catch (e) { return []; } };
        assert.deepEqual(keys(fw), [], "the frame window's record is gone");
        assert.deepEqual(keys(fw.document), [], "the frame document's record is gone");
        assert.isFalse(has(Cu.unwaiveXrays(fw), fnW) || has(fw, fnW), "and the listener itself");
        assert.isFalse(has(Cu.unwaiveXrays(fw.document), fnD) || has(fw.document, fnD));
    });

    // wvUnlistenAll emptied the WHOLE registry and dropped other tags'
    // entries: the call above (a scratch tag, on the live module) erased the
    // live instance's, and its destroy() later left every main-window keyed
    // listener it had wired before -- 29 in the full suite (2026-10-13).
    it("a call under one tag leaves other tags' entries registered", () => {
        const A = "wv-test#keepA-" + Date.now(), B = "wv-test#keepB-" + Date.now();
        const w = Zotero.getMainWindow();
        const fn = function () {};
        const on = () => [...els.getListenerInfoFor(w)].some(li => { try { return li.listenerObject === fn; } catch (e) { return false; } });
        try {
            assert.isTrue(lib.wvListen(w, "wvtest:keepA", "wvtest-keep", fn, false, A));
            lib.wvUnlistenAll(B);
            assert.isTrue(on(), "another tag's call leaves it on");
            lib.wvUnlistenAll(A);
            assert.isFalse(on(), "its own tag's call removes it -- the registry still had it");
        }
        finally { lib.wvUnlisten(w, "wvtest:keepA"); }
    });
});
