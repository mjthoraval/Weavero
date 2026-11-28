/* global describe, it, before, after, afterEach, assert, Zotero, Services, Ci, ChromeUtils, wvT */

// Zotero's progress window -- Find Full Text, Retrieve Metadata -- with real
// minimize and maximize buttons (MJT 2026-11-26: "Weavero should add buttons to
// minimize or maximize that Find Full Text window"; intake: both windows, the
// window's own title-bar buttons, on by default with a switch; the plan approved
// with "Minimize to taskbar" for Zotero's own Minimize button).
//
// Zotero opens it from the most recently focused main window:
// `win.openDialog("chrome://zotero/content/progressQueueDialog.xhtml", "",
// "chrome,close=yes,resizable=yes,dependent,dialog,centerscreen", io)`
// (xpcom/progressQueueDialog.js open(), the same in 10.0.6 and 11.0-beta.6).
// `dialog` takes minimize and maximize off the title bar on Windows; the
// window's own "Minimize" button closes it while the work goes on.

describe("Weavero — the progress window has real minimize and maximize buttons", function () {
    this.timeout(60000);
    const KEY = "weavero.progressWindowButtons";
    const URL = "chrome://zotero/content/progressQueueDialog.xhtml";
    let wv;
    let opened = [];
    let user32 = null;

    const withPref = async (value, fn) => {
        const had = Zotero.Prefs.get(KEY);
        try { Zotero.Prefs.set(KEY, value); return await fn(); }
        finally { try { if (had === undefined) Zotero.Prefs.clear(KEY); else Zotero.Prefs.set(KEY, had); } catch (_) {} }
    };

    const progressWins = () => {
        const out = [];
        const en = Services.wm.getEnumerator(null);
        while (en.hasMoreElements()) {
            const w = /** @type {any} */ (en.getNext());
            try { if (!w.closed && String(w.location.href) === URL) out.push(w); } catch (e) {}
        }
        return out;
    };

    // A throwaway queue (never registered in Zotero.ProgressQueues), one queued
    // row so that Zotero shows its Minimize and Cancel buttons.
    async function openQueue() {
        const PQ = /** @type {any} */ (Zotero).ProgressQueue;
        const q = new PQ({ id: "wv-test-progwin", title: "pane.items.menu.findAvailableFile",
            columns: ["general.item", "attachment.fullText"] });
        q.addRow({ id: 987654321, getDisplayTitle: () => "Weavero test row" });
        const d = q.getDialog();
        const before = new Set(progressWins());
        d.open();
        const pw = await wvT.waitFor(() => progressWins().find((w) => !before.has(w)
            && w.document.readyState === "complete" && w.document.getElementById("minimize-button")) || null, 15000);
        assert.isOk(pw, "the progress window opened");
        // Zotero wires its buttons at pageshow and shows Minimize for an unfinished queue.
        await wvT.waitFor(() => pw.document.getElementById("minimize-button").hidden === false, 5000);
        opened.push({ q, d, pw });
        return { q, d, pw };
    }

    const appWin = (pw) => pw.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow);
    const isDialog = (pw) => !!(appWin(pw).chromeFlags & Ci.nsIWebBrowserChrome.CHROME_OPENAS_DIALOG);

    // Windows: what the title bar really carries (WS_MINIMIZEBOX, WS_MAXIMIZEBOX), and
    // whether the window has an owner -- an owned window gets no taskbar button.
    const native = (pw) => {
        if (!Zotero.isWin) return null;
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
        if (!user32) {
            const lib = ctypes.open("user32.dll");
            user32 = {
                lib,
                getLong: lib.declare("GetWindowLongPtrW", ctypes.winapi_abi, ctypes.intptr_t, ctypes.voidptr_t, ctypes.int),
                getWindow: lib.declare("GetWindow", ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.uint32_t),
            };
        }
        const h = pw.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle;
        const hwnd = ctypes.voidptr_t(ctypes.UInt64(h));
        const style = Number(user32.getLong(hwnd, -16).toString());
        const owner = user32.getWindow(hwnd, 4);
        return { min: !!(style & 0x00020000), max: !!(style & 0x00010000), owned: !owner.isNull() };
    };

    const minimized = (pw) => pw.windowState === pw.STATE_MINIMIZED;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        if (typeof wv._wvWireProgressWindow !== "function") wvT.absent("_wvWireProgressWindow");
        if (typeof wv._wvProgressWindowTeardown !== "function") wvT.absent("_wvProgressWindowTeardown");
        if (typeof /** @type {any} */ (Zotero).ProgressQueue !== "function") wvT.absent("Zotero.ProgressQueue");
    });

    afterEach(async function () {
        for (const o of opened) {
            try { if (!o.pw.closed) o.d.close(); } catch (e) {}
        }
        await wvT.waitFor(() => opened.every((o) => o.pw.closed), 5000);
        opened = [];
    });

    after(function () {
        try { if (user32) user32.lib.close(); } catch (e) {}
        user32 = null;
    });

    it("on by default: the window opens as a normal window -- minimize and maximize on its title bar, its own taskbar button", async function () {
        assert.strictEqual(Services.prefs.getDefaultBranch("extensions.zotero.").getBoolPref(KEY), true, "the setting is on by default");
        await withPref(true, async () => {
            const { pw } = await openQueue();
            assert.isFalse(isDialog(pw), "not opened as a dialog");
            const n = native(pw);
            if (n) {
                assert.isTrue(n.min, "a minimize button on the title bar (Windows)");
                assert.isTrue(n.max, "a maximize button on the title bar (Windows)");
                assert.isFalse(n.owned, "no owner window: a taskbar button of its own (Windows)");
            }
        });
    });

    it("setting off: Zotero's dialog exactly", async function () {
        await withPref(false, async () => {
            const { pw } = await openQueue();
            assert.isTrue(isDialog(pw), "Zotero's dialog");
            const n = native(pw);
            if (n) {
                assert.isFalse(n.min, "no minimize button (Windows)");
                assert.isFalse(n.max, "no maximize button (Windows)");
            }
        });
    });

    it("its own Minimize button minimizes it to the taskbar and the work window stays open; Zotero showing the queue again brings it back", async function () {
        await withPref(true, async () => {
            const { d, pw } = await openQueue();
            pw.document.getElementById("minimize-button").click();
            const m = await wvT.waitFor(() => minimized(pw) || pw.closed, 10000);
            assert.isOk(m, "something happened");
            assert.isFalse(pw.closed, "the window stays open");
            assert.isTrue(minimized(pw), "minimized");
            assert.isTrue(d.isOpen(), "Zotero still holds its window");
            // Find Full Text again on more items: Zotero's open() focuses the window it has.
            d.open();
            const back = await wvT.waitFor(() => !minimized(pw), 10000);
            assert.isOk(back, "restored when Zotero brings it forward");
        });
    });

    it("setting off: its Minimize button closes the window, as Zotero does", async function () {
        await withPref(false, async () => {
            const { pw } = await openQueue();
            pw.document.getElementById("minimize-button").click();
            assert.isOk(await wvT.waitFor(() => pw.closed, 10000), "closed");
        });
    });

    // A window's `openDialog` is an OWN property natively (a global's WebIDL operations live on
    // the object itself): the native one is told apart by its source.
    const isNative = (fn) => /\[native code\]/.test(Function.prototype.toString.call(fn));

    it("the teardown gives every main window Zotero's openDialog back, and an open window's Minimize button closes it again; wiring again restores the feature", async function () {
        const mains = Zotero.getMainWindows();
        try {
            await withPref(true, async () => {
                for (const w of mains) assert.isFalse(isNative(w.openDialog), "wired: " + w.location.href);
                const { pw } = await openQueue();
                wv._wvProgressWindowTeardown();
                for (const w of mains) assert.isTrue(isNative(w.openDialog), "Zotero's own openDialog again");
                pw.document.getElementById("minimize-button").click();
                assert.isOk(await wvT.waitFor(() => pw.closed, 10000), "Zotero's Minimize: the window closes");
                const second = await openQueue();
                assert.isTrue(isDialog(second.pw), "the next window is Zotero's dialog");
            });
        }
        finally {
            for (const w of mains) wv._wvWireProgressWindow(w);
        }
        for (const w of mains) assert.isFalse(isNative(w.openDialog), "wired again");
    });
});
