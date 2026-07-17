/* global describe, it, before, after, expect, Zotero, Components, ChromeUtils, Services */

// Reader/tab lifecycle regression suite — encodes the invariants behind the
// four 2026-07 beta.10 incidents (docShell deactivation of torn-off readers,
// frozen/zombie merge-backs, drag-out losing the tab, and the Firefox
// focusing rules) as automated checks. Every test drives the REAL app in the
// scaffold's temp-profile Zotero, following upstream zotero/zotero's
// integration-test approach (test/content/support.js patterns; helpers below
// are self-contained per spec file because the scaffold loads spec files in
// unspecified order).
//
// Deliberately NOT tested here (manual checklist instead): OS window focus
// (flaky under CI/xvfb), real drag gestures (synthetic drags are untrusted
// and ignored), taskbar overlays.

describe("Weavero — reader tear-off / merge-back lifecycle", function () {
    this.timeout(120000);

    let win = null;       // main window
    let p = null;         // live plugin
    let itemA = null;     // neighbour PDF (stays a tab)
    let itemB = null;     // subject PDF (torn off / merged)
    let tabA = null;      // itemA's main tab id
    let tabB = null;      // itemB's original main tab id
    let tornWin = null;   // current torn-off window (test-to-test state)

    // ---- helpers (support.js-style, self-contained) ----------------------

    const sleep = ms => new Promise(r => win.setTimeout(r, ms));

    async function waitFor(cb, timeout = 15000, interval = 150) {
        const start = Date.now();
        for (;;) {
            let v = null;
            try { v = cb(); } catch (e) {}
            if (v) return v;
            if (Date.now() - start > timeout) return null;
            await sleep(interval);
        }
    }

    // Minimal one-page PDF assembled with correct xref offsets, so pdf.js
    // opens it without recovery heuristics. No text content needed — the
    // suite only cares about reader lifecycle, not rendering.
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

    async function createTestPDFItem(name) {
        const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        const file = Zotero.File.pathToFile(path);
        const att = await Zotero.Attachments.importFromFile({ file });
        expect(att.attachmentContentType).to.equal("application/pdf");
        return att;
    }

    // Open an item as a main-window reader tab and wait until its internal
    // reader is live enough for the no-reload swap machinery.
    async function openAsReadyTab(itemID) {
        win.focus();
        await Zotero.Reader.open(itemID, null, { allowDuplicate: false });
        const reader = await waitFor(() => {
            const r = (Zotero.Reader._readers || []).find(x => {
                try { return x.itemID === itemID && x._window === win; } catch (e) { return false; }
            });
            return (r && r._internalReader && r._iframeWindow) ? r : null;
        });
        expect(reader, "reader for item " + itemID + " never became swappable").to.exist;
        return reader;
    }

    const mainTabFor = itemID =>
        win.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === itemID) || null;

    const readerFor = itemID =>
        (Zotero.Reader._readers || []).find(r => {
            try { return r.itemID === itemID; } catch (e) { return false; }
        }) || null;

    function tornWindows() {
        const out = [];
        const en = Services.wm.getEnumerator("zotero:reader");
        while (en.hasMoreElements()) {
            const w = /** @type {any} */ (en.getNext());
            if (!w.closed) out.push(w);
        }
        return out;
    }

    // ---- fixtures ---------------------------------------------------------

    before(async function () {
        win = Zotero.getMainWindow();
        p = await waitFor(() => Zotero.Weavero && Zotero.Weavero.plugin, 20000);
        expect(p, "Weavero plugin not initialized").to.exist;
        // Isolation: a watch-mode re-run executes in the SAME Zotero after a
        // plugin reload, leaving dead reader wrappers from the previous pass
        // in Zotero.Reader._readers — the select-notify loop then throws
        // "can't access dead object" and lookups return stale instances.
        // Purge anything unreadable or window-dead before starting.
        try {
            const rs = Zotero.Reader._readers || [];
            for (let i = rs.length - 1; i >= 0; i--) {
                let dead = false;
                try {
                    const r = rs[i];
                    dead = !r || !r._window || Components.utils.isDeadWrapper(r._window) || r._window.closed;
                } catch (e) { dead = true; }
                if (dead) rs.splice(i, 1);
            }
        } catch (e) {}
        itemA = await createTestPDFItem("wv-tearoff-A");
        itemB = await createTestPDFItem("wv-tearoff-B");
    });

    after(async function () {
        // Leave the temp profile tidy for any later spec file: close every
        // torn-off window and every tab this suite created.
        for (const w of tornWindows()) { try { w.close(); } catch (e) {} }
        await sleep(500);
        for (const it2 of [itemA, itemB]) {
            if (!it2) continue;
            const t = mainTabFor(it2.id);
            if (t) { try { win.Zotero_Tabs.close(t.id); } catch (e) {} }
        }
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
    });

    // ---- tests (sequential; each builds on the previous state) ------------

    it("opens fixture PDFs as reader tabs", async function () {
        const rA = await openAsReadyTab(itemA.id);
        const rB = await openAsReadyTab(itemB.id);
        expect(rA.constructor.name).to.equal("ReaderTab");
        expect(rB.constructor.name).to.equal("ReaderTab");
        tabA = mainTabFor(itemA.id).id;
        tabB = mainTabFor(itemB.id).id;
        expect(tabA).to.be.a("string");
        expect(tabB).to.be.a("string");
    });

    it("tears off without reload; source selects a loaded neighbour (Firefox rule)", async function () {
        win.Zotero_Tabs.select(tabB);
        await sleep(300);
        const S = readerFor(itemB.id);
        tornWin = await p._wvSwapTearOffToWindow(win, S, itemB.id);
        expect(tornWin, "swap tear-off fell back / failed").to.be.ok;
        // tab left the main window…
        expect(mainTabFor(itemB.id)).to.equal(null);
        // …the SAME reader instance was re-homed (no reload)…
        expect(S._window).to.equal(tornWin);
        expect(S._iframeWindow.document.readyState).to.equal("complete");
        // …its shell ends up active despite beta.10's deactivation machinery
        // (sync assert + 700 ms deferred re-assert in the tear-off)…
        const active = await waitFor(() => S._iframe.docShellIsActive === true, 5000);
        expect(active, "torn-off shell stayed deactivated").to.be.ok;
        // …the strip tab keeps the original main-tab id (identity carry)…
        const stripIds = tornWin._wvWT.tabs.map(t => t.id);
        expect(stripIds).to.include(tabB);
        // …and the source window reveals the loaded neighbour, NOT the library
        // (Firefox adjacent-tab rule; library only as fallback).
        expect(win.Zotero_Tabs.selectedID).to.equal(tabA);
    });

    it("torn-off reader survives the beta.10 select-notify loop", async function () {
        const S = readerFor(itemB.id);
        S._iframe.docShellIsActive = false;
        // The exact upstream call path that froze/crashed pre-v0.16.1-dev.32:
        // every tab select recomputes every ReaderTab's docShell activity.
        expect(() => Zotero.Reader.notify("select", "tab", ["zotero-pane"], {})).to.not.throw();
        await sleep(300);
        expect(S._iframe.docShellIsActive, "safety wrapper did not re-activate").to.equal(true);
    });

    it("merges back with identity, selection (Firefox rule), and native lookup", async function () {
        const S = readerFor(itemB.id);
        p._wvWTMoveTabToMain(tornWin, tabB, win);
        // The tab appears under the DONOR's id first; the commit renames it
        // back to the original id ~150-300ms later — wait for the rename, not
        // just for existence (asserting on first appearance races it).
        const tab = await waitFor(() => {
            const t = mainTabFor(itemB.id);
            return (t && t.id === tabB) ? t : null;
        });
        expect(tab, "merged tab never re-appeared under its original id").to.exist;
        // …the dragged tab is the ACTIVE tab (adoptTab selectTab rule) — this
        // was the dev.36 stale-donor-id regression…
        const selected = await waitFor(() => win.Zotero_Tabs.selectedID === tabB, 5000);
        expect(selected, "merged tab not selected").to.be.ok;
        // …the native tab machinery can resolve it…
        expect(Zotero.Reader.getByTabID(tabB)).to.equal(S);
        // …and the source window is gone.
        const closed = await waitFor(() => tornWin.closed, 5000);
        expect(closed, "torn-off window still open after merge").to.be.ok;
        tornWin = null;
    });

    it("classic ReaderWindow adopts the ReaderTab class on merge-back", async function () {
        // Drop the tab so the classic window is the only holder of item B —
        // the RESTORED-torn-window shape that produced the frozen/zombie
        // merge-backs (dev.34) and the drag-out tab loss (dev.35).
        const t = mainTabFor(itemB.id);
        if (t) { win.Zotero_Tabs.close(t.id); await sleep(600); }
        await Zotero.Reader.open(itemB.id, null, { openInWindow: true, allowDuplicate: true });
        const S = await waitFor(() => {
            const r = readerFor(itemB.id);
            return (r && r.constructor.name === "ReaderWindow" && r._internalReader) ? r : null;
        });
        expect(S, "classic reader window never became ready").to.exist;
        const rwWin = S._window;
        // The strip model wires from renderToolbar; ensure it exists.
        await waitFor(() => rwWin._wvWT && rwWin._wvWT.tabs.length, 10000);
        if (!(rwWin._wvWT && rwWin._wvWT.tabs.length)) p._wvWTEnsureNativeTab(rwWin);
        const stripId = rwWin._wvWT.tabs[0].id;
        p._wvWTMoveTabToMain(rwWin, stripId, win);
        const tab = await waitFor(() => mainTabFor(itemB.id));
        expect(tab, "merged tab never appeared").to.exist;
        // CLASS ADOPTION: the re-homed instance must be a real ReaderTab so
        // every `instanceof ReaderTab` filter in reader.js sees it.
        expect(S.constructor.name).to.equal("ReaderTab");
        expect(Zotero.Reader.getByTabID(tab.id)).to.equal(S);
        // Native activity semantics govern it: selected -> active.
        const active = await waitFor(() => S._iframe.docShellIsActive === true, 5000);
        expect(active, "adopted reader's shell not active while selected").to.be.ok;
        expect(S._iframeWindow.document.readyState).to.equal("complete");
    });

    it("closing the merged tab disposes its reader — no zombie", async function () {
        const tab = mainTabFor(itemB.id);
        expect(tab).to.exist;
        win.Zotero_Tabs.close(tab.id);
        const gone = await waitFor(() => !readerFor(itemB.id), 5000);
        // On failure, name the corpse: which wrapper leaked and in what state
        // (aborted-uninit corpses have _isUninitialized true; a missing flag
        // means disposal never even found the reader).
        let forensics = "";
        if (!gone) {
            try {
                // Dump EVERY entry for the item — a duplicate means the leak is
                // the abandoned merge DONOR, not the re-homed instance; the
                // discriminator is _isReaderInitialized (donor never finishes).
                const all = (Zotero.Reader._readers || []).filter(x => {
                    try { return x._item && x._item.id === itemB.id; } catch (e) { return true; }
                }).map((x) => {
                    const r = /** @type {any} */ (x);
                    const own = k => !!Object.getOwnPropertyDescriptor(r, k);
                    return "{ctor=" + (r.constructor && r.constructor.name)
                        + " init=" + (own("_isReaderInitialized") ? r._isReaderInitialized : "(absent)")
                        + " uninitFlag=" + (own("_isUninitialized") ? r._isUninitialized : "(absent)")
                        + " tabID=" + (own("tabID") ? r.tabID : "(proto)")
                        + " lookupHitsIt=" + (() => { try { return Zotero.Reader.getByTabID(r.tabID) === r; } catch (e) { return "threw"; } })()
                        + " idx=" + Zotero.Reader._readers.indexOf(x) + "}";
                });
                const r = /** @type {any} */ (readerFor(itemB.id));
                forensics = " [leaked " + all.length + ": " + all.join(" ") + " lookupVer=" + (/** @type {any} */ (Zotero.Reader))._wvLookupVer + "]";
                // Re-run uninit to surface the exact line that aborted it at
                // close time (the same trick that exposed the stale guidance
                // panel in the live instance).
                try {
                    r._isUninitialized = false;
                    r.uninit();
                    forensics += " [reUninit completed]";
                } catch (e2) {
                    forensics += " [reUninit THREW: " + e2.message + " @ " + String(e2.stack).split("\n").slice(0, 2).join(" | ") + "]";
                } finally {
                    try { r._isUninitialized = true; } catch (e3) {}
                }
            } catch (e) { forensics = " [forensics threw: " + e.message + "]"; }
        }
        expect(gone, "reader instance leaked in Zotero.Reader._readers" + forensics).to.be.ok;
        // The zombie poisoned Reader.open pre-dev.34 — reopening must work.
        await Zotero.Reader.open(itemB.id, null, {});
        const back = await waitFor(() => mainTabFor(itemB.id));
        expect(back, "item could not be reopened after close").to.exist;
        tabB = back.id;
    });

    it("plain-closing a torn-off window records it for Reopen Closed Window", async function () {
        const S = readerFor(itemB.id);
        await waitFor(() => S._internalReader && S._iframeWindow);
        tornWin = await p._wvSwapTearOffToWindow(win, S, itemB.id);
        expect(tornWin).to.be.ok;
        await sleep(400);
        const stackBefore = (p._wvClosedStack || []).length;
        tornWin.reader.close();
        const recorded = await waitFor(() => {
            const top = p._wvClosedPeek && p._wvClosedPeek();
            return top && top.kind === "readerWindow"
                && (top.tabs || []).some(x => x.itemID === itemB.id) ? top : null;
        }, 5000);
        expect(recorded, "close was not pushed onto the closed-window stack").to.exist;
        expect((p._wvClosedStack || []).length).to.be.greaterThan(stackBefore - 1);
        // …and reopening restores it as a live reader window.
        const ok = p._wvClosedReopenLast(win);
        expect(ok).to.equal(true);
        const reopened = await waitFor(() => {
            const r = readerFor(itemB.id);
            try {
                return r && r._window.document.documentElement.getAttribute("windowtype") === "zotero:reader"
                    && r._iframeWindow && r._iframeWindow.document.readyState === "complete" ? r : null;
            } catch (e) { return null; }
        }, 20000);
        expect(reopened, "Reopen Closed Window did not restore the reader").to.exist;
        tornWin = reopened._window;
    });
});
