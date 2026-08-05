/* global describe, it, before, after, expect, Zotero, PathUtils, IOUtils */
// UI-state recovery invariants — regression locks for the 2026-08-05 pair of
// "Weavero left global UI state stuck" bugs:
//
//  1. Tab-drag overlay suppression (pointer-events: none on reader content)
//     MUST self-heal even when no dragend ever fires — Firefox drops dragend
//     entirely when the drag's source node is removed mid-drag, which left a
//     reader window's center pane mouse-proof. The watchdog polls the OS drag
//     session and runs the hide when it's gone.
//
//  2. The boot selection guard (re-asserts the quit-captured tab selection
//     during startup) MUST yield permanently to a real user gesture — on a
//     big library the reconcile lands 15-30 s in, and the guard was yanking a
//     freshly opened reader tab back to the library.
//
// Both are invariants about WHO WINS a fight over shared UI state, so they
// are locked here rather than left to manual protocols.

describe("Weavero — UI-state recovery invariants", function () {
    this.timeout(60000);

    let win, p, att;

    function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

    async function waitFor(cb, timeout = 15000, interval = 150) {
        const t0 = Date.now();
        for (;;) {
            let v = null;
            try { v = await cb(); } catch (e) {}
            if (v) return v;
            if (Date.now() - t0 > timeout) return null;
            await sleep(interval);
        }
    }

    // Minimal one-page PDF with correct xref offsets (same fixture recipe as
    // tearoff.spec.js — lifecycle only, no rendering needed).
    function minimalPDFBytes() {
        const objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n",
        ];
        const header = "%PDF-1.4\n";
        let body = header;
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 4\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        const trailer = "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
        return body + xref + trailer;
    }

    function readerFor(itemID) {
        return (Zotero.Reader._readers || []).find((r) => r && r.itemID === itemID) || null;
    }

    before(async function () {
        win = Zotero.getMainWindow();
        p = await waitFor(() => Zotero.Weavero && Zotero.Weavero.plugin, 20000);
        expect(p, "Weavero plugin not initialized").to.exist;
        const path = PathUtils.join(PathUtils.tempDir, "wv-uistate-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        await Zotero.Reader.open(att.id, null, { allowDuplicate: false });
        const ready = await waitFor(() => {
            const r = readerFor(att.id);
            return r && r._iframe ? r : null;
        }, 20000);
        expect(ready, "fixture reader never became ready").to.exist;
    });

    after(async function () {
        try {
            const r = readerFor(att && att.id);
            if (r && r.tabID) win.Zotero_Tabs.close(r.tabID);
        } catch (e) {}
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
    });

    it("drag-overlay watchdog restores pointer-events without any dragend", async function () {
        const r = readerFor(att.id);
        p._wvShowReaderDragOverlays();
        expect(r._iframe.style.pointerEvents, "show must suppress the iframe").to.equal("none");
        // Deliberately NO _wvHideReaderDragOverlays() — the lost-dragend case.
        // No OS drag session exists in the test env, so the watchdog's first
        // poll (≤400 ms) must conclude the drag is over and run the hide.
        const healed = await waitFor(() => r._iframe.style.pointerEvents !== "none", 5000, 100);
        expect(!!healed, "watchdog never restored pointer-events").to.equal(true);
    });

    it("hide sweeps straggler pointer-events even with no stash (reload orphan)", async function () {
        const r = readerFor(att.id);
        // Simulate the orphaned-stash case: the style is set but no instance
        // map remembers it (plugin reload mid-drag).
        r._iframe.style.pointerEvents = "none";
        p._wvReaderIframePEByInstance = null;
        p._wvHideReaderDragOverlays();
        expect(r._iframe.style.pointerEvents).to.not.equal("none");
    });

    it("boot selection guard yields permanently to a user gesture", async function () {
        const r = readerFor(att.id);
        const saved = {
            doc: p._wvBootWindowStoreDoc,
            acted: p._wvBootUserActed,
            reconciled: p._wvAnchorReconciled,
            guardOn: p._wvBootSelGuardOn,
        };
        try {
            // Quit capture says: library tab selected.
            p._wvBootWindowStoreDoc = { windows: [{
                kind: "main-anchor",
                tabs: [{ id: "zotero-pane", type: "library", selected: true }],
            }] };
            p._wvBootUserActed = false;
            // Idle boot: enforcement flips a freshly selected tab back.
            win.Zotero_Tabs.select(r.tabID);
            p._wvEnforceAnchorSelectionFromStore("spec-idle");
            expect(win.Zotero_Tabs.selectedID, "idle enforcement must apply the capture")
                .to.equal("zotero-pane");
            // Arm the guard loop, then act like a user: one real gesture must
            // latch _wvBootUserActed and stop the loop.
            p._wvAnchorReconciled = false;
            p._wvBootSelGuardOn = false;
            p._wvBootSelectionGuardStart();
            win.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
            const latched = await waitFor(() => p._wvBootUserActed === true, 3000, 50);
            expect(!!latched, "gesture never latched _wvBootUserActed").to.equal(true);
            const stopped = await waitFor(() => p._wvBootSelGuardOn === false, 3000, 100);
            expect(!!stopped, "guard loop kept running after the gesture").to.equal(true);
            // Post-latch, enforcement is a no-op — the user keeps their tab.
            win.Zotero_Tabs.select(r.tabID);
            p._wvEnforceAnchorSelectionFromStore("spec-latched");
            expect(win.Zotero_Tabs.selectedID, "post-gesture enforcement must not fight the user")
                .to.equal(r.tabID);
        }
        finally {
            p._wvBootWindowStoreDoc = saved.doc;
            p._wvBootUserActed = saved.acted;
            p._wvAnchorReconciled = saved.reconciled;
            p._wvBootSelGuardOn = saved.guardOn;
        }
    });
});
