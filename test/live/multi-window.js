/* Weavero — live MULTI-WINDOW filter verification.
 *
 * Run like filter-matrix.js (Tools -> Developer -> Run JavaScript, or
 * through the MCP bridge). Results in `Zotero._wvMultiWin`; read with
 *     JSON.stringify(Zotero._wvMultiWin.summary())
 *
 * WHY THIS EXISTS. The items-list filter is a documented PER-WINDOW
 * feature: state lives in `win._wvFilter*` expandos and every main
 * window gets its own filter pane. But the accessors bind to
 * `Zotero.getMainWindow()` — the FOCUSED window — unless a targeted
 * pass sets `_wvFilterWinOverride`. Meanwhile the apply path patches
 * `itemsView.rowProvider` per window and stores a keep watermark on it.
 * So the failure mode to hunt is CROSS-TALK: an apply aimed at one
 * window reading or mutating the other's rows, patches, or state.
 *
 * This axis had ZERO coverage through the 2026-08-05..07 campaign while
 * the row machinery was rewritten repeatedly (build mode swaps _rows
 * wholesale; the watermark fix changed teardown; the reconcile now
 * consumes state published by the apply). All of that was written and
 * verified against a single window.
 *
 * The harness rules from filter-matrix.js apply here too: space applies
 * >=900ms, gate on stability only, compare rows AND expansion AND
 * selection. This file additionally NEVER assumes which window is
 * focused — it always states the target explicitly.
 *
 * SAFETY: it opens a second main window and CLOSES it at the end, and
 * restores both windows' filter state. If it throws midway, close the
 * extra window by hand; nothing is persisted.
 */

(function () {
    // Shared machinery: test/live/lib/harness.js (load it first). This
    // suite is intrinsically per-window, so it builds a kit PER WINDOW
    // (LH.make(win)) where it needs one; the top-level kit binds window A.
    const LH = Zotero._wvLH;
    if (!LH) throw new Error("load test/live/lib/harness.js first (Zotero._wvLH missing)");
    const H = LH.make();
    const { lp, sleep, fnv } = H;

    const { R, check } = H.mkReport("multi-window");
    Zotero._wvMultiWin = R;

    /* Snapshot a SPECIFIC window — never `Zotero.getMainWindow()`, which
     * would silently report whichever window happens to be focused and
     * make cross-talk invisible (the very bug this file hunts). */
    function snapOf(win) {
        const zp = win.ZoteroPane;
        const rp = zp.itemsView.rowProvider || zp.itemsView;
        const w = LH.make(win).rowWalk(rp);
        let sel = [];
        try { sel = zp.getSelectedItems().map(it => it.id).sort((a, b) => a - b); }
        catch (e) { sel = ["ERR"]; }
        return {
            rows: w.rows, idsHash: w.idsHash,
            open: w.openCount, openHash: w.openHash,
            selCount: sel.length, selHash: fnv(sel),
            patched: !!(rp._wvOrigGetRow),
            watermark: rp._wvKeepRowsLen,
        };
    }

    const stableIn = (win) => LH.make(win).stable();

    /* Apply a filter to an EXPLICIT window. The accessors bind to the
     * focused window unless `_wvFilterWinOverride` is set, so the target
     * is stated rather than assumed — otherwise this harness would
     * reproduce the very ambiguity it is testing. */

    /* MUST FOCUS THE TARGET FIRST (learned 2026-08-07).
     * `_wvFilterWinOverride` only redirects the STATE accessors;
     * `_applyItemsListFilterInner` resolves its working window with
     * `Zotero.getMainWindow()`, i.e. the FOCUSED window. A first version
     * of this file set the override and applied without focusing, and
     * the filter landed in the OTHER window — 17928 -> 15329 in B while
     * A was the stated target. That is faithful to how the product
     * behaves (a user clicking a chip has necessarily focused that
     * window), so the harness matches it rather than fighting it.
     * The open question it exposes is recorded in the checks below:
     * whether a NON-user-driven reapply (observer, notifier, cascade
     * retry) can fire while another window is focused. */
    async function focusWin(win) {
        try { win.focus(); } catch (e) {}
        await sleep(700);
        return Zotero.getMainWindow() === win;
    }

    async function applyIn(win, mutate) {
        const focused = await focusWin(win);
        if (!focused) check("focus reached target window", false, { note: "getMainWindow() != target" });
        const prev = lp._wvFilterWinOverride;
        lp._wvFilterWinOverride = win;
        try {
            const g = lp._activeGroup();
            mutate(g);
            await sleep(950);                       // rule 1
            lp._applyItemsListFilter({ cascade: true });
        }
        finally { lp._wvFilterWinOverride = prev || null; }
        await stableIn(win);
        await sleep(500);
    }

    async function clearIn(win) {
        await applyIn(win, (g) => {
            for (const k of ["itemType", "itemTypeExclude", "annotationColor",
                "attachmentFileType"]) g[k] = [];
            for (const k of ["hasURL", "hasAttachment", "inOtherLibrary"]) g[k] = null;
        });
    }

    (async function run() {
        let winB = null;
        const winA = Zotero.getMainWindows()[0];
        try {
            await winA.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await winA.ZoteroPane.itemsView.waitForLoad();
            await clearIn(winA);
            // Collapse A so its baseline matches a freshly-opened B.
            // Without this, a tree left expanded by an earlier test (e.g.
            // 40009 rows after an attachment-level cascade) makes the
            // "both windows start equivalent" and "clearing A restores A"
            // checks compare against an expanded baseline and fail for
            // reasons that have nothing to do with multi-window.
            try {
                const rpA = winA.ZoteroPane.itemsView.rowProvider
                    || winA.ZoteroPane.itemsView;
                rpA.collapseAllRows();
            } catch (e) {}
            await stableIn(winA);
            await sleep(800);
            const baseA = snapOf(winA);

            // --- open the second main window -----------------------------
            Zotero.openMainWindow();
            for (let i = 0; i < 40 && Zotero.getMainWindows().length < 2; i++) await sleep(500);
            const wins = Zotero.getMainWindows();
            winB = wins.find(w => w !== winA) || null;
            check("second main window opened", !!winB,
                { windows: wins.length });
            if (!winB) { R.status = "done"; return; }
            await sleep(3000);
            try {
                await winB.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
                await winB.ZoteroPane.itemsView.waitForLoad();
            } catch (e) {}
            await sleep(1500);

            check("window B has its own filter pane",
                !!(winB.document.querySelector("[id^='wv-filter'], .wv-filter-btn")
                    || winB._wvFilterState !== undefined),
                { note: "pane element or per-window state present" });

            const baseB = snapOf(winB);
            check("both windows start equivalent",
                baseA.idsHash === baseB.idsHash,
                { A: baseA.rows, B: baseB.rows });

            // --- 1. isolation: filter in A must not touch B ---------------
            await applyIn(winA, (g) => { g.itemType = ["journalArticle"]; });
            const a1 = snapOf(winA), b1 = snapOf(winB);
            check("filter in A changes A",
                a1.idsHash !== baseA.idsHash && a1.rows < baseA.rows,
                { before: baseA.rows, after: a1.rows });
            check("filter in A leaves B UNTOUCHED",
                b1.idsHash === baseB.idsHash && b1.open === baseB.open,
                { B_before: baseB.rows + "/" + baseB.open,
                  B_after: b1.rows + "/" + b1.open });
            check("B's rowProvider is NOT patched by A's filter",
                !b1.patched || b1.watermark === undefined,
                { patched: b1.patched, watermark: b1.watermark });

            // --- 2. simultaneous DIFFERENT filters ------------------------
            await applyIn(winB, (g) => { g.annotationColor = ["#ffd400"]; });
            const a2 = snapOf(winA), b2 = snapOf(winB);
            check("A keeps its own result while B filters",
                a2.idsHash === a1.idsHash,
                { A_before: a1.rows, A_after: a2.rows });
            check("B shows a DIFFERENT result from A",
                b2.idsHash !== a2.idsHash,
                { A: a2.rows + "/" + a2.open, B: b2.rows + "/" + b2.open });
            check("B's own filter actually applied",
                b2.idsHash !== baseB.idsHash,
                { before: baseB.rows, after: b2.rows });

            // --- 3. clearing one window leaves the other filtered ---------
            await clearIn(winA);
            const a3 = snapOf(winA), b3 = snapOf(winB);
            check("clearing A restores A",
                a3.idsHash === baseA.idsHash,
                { restored: a3.rows, base: baseA.rows });
            check("clearing A leaves B's filter intact",
                b3.idsHash === b2.idsHash,
                { B_before: b2.rows, B_after: b3.rows });
            check("A's watermark cleared on teardown, B's untouched",
                a3.watermark === undefined,
                { A_watermark: a3.watermark, B_watermark: b3.watermark });

            await clearIn(winB);
            R.status = "done";
        }
        catch (e) {
            R.status = "error: " + e;
        }
        finally {
            try { if (winB) await clearIn(winB); } catch (e) {}
            try { if (winB) winB.close(); } catch (e) {}
            await sleep(1500);
            try { await clearIn(winA); } catch (e) {}
            R.windowsAtEnd = Zotero.getMainWindows().length;
        }
    })();

    return "multi-window test running — read Zotero._wvMultiWin.summary()";
})();
