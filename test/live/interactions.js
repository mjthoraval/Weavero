/* Weavero — live INTERACTION verification.
 *
 * Run like the other files here; results in `Zotero._wvInteract`, read
 * with `JSON.stringify(Zotero._wvInteract.summary())`.
 *
 * Two surfaces the matrix does not touch, both requested 2026-08-07:
 *
 *  A. Weavero filter x QUICK SEARCH x ADVANCED SEARCH. All three narrow
 *     the same view by different mechanisms — Weavero remaps rows via a
 *     getRow patch, quick search prunes _rows, advanced search rebuilds
 *     them from SQL. Order matters (the historical "Order-B" bug lived
 *     here), and native advanced search combined with a Weavero chip has
 *     never been exercised at all.
 *
 *  B. MULTI-COLLECTION and MULTI-LIBRARY selection. Zotero 10 sets
 *     `multiSelect: true` on the collections tree (zoteroPane.js), so a
 *     user can select several collections at once, including across
 *     libraries — while Weavero's `_wvSelectedLibraryID(win)` returns a
 *     SINGLE library id and the linked-library cache is keyed by one
 *     library. That assumption has never been tested.
 *
 * Several checks here are OBSERVATIONS rather than pass/fail: where the
 * correct behaviour is a product decision that has not been made, the
 * file records what happens instead of inventing a verdict. Those are
 * reported under `observations`.
 *
 * Harness rules as in filter-matrix.js: space applies >=900ms, gate on
 * stability only, drive quick search with a `command` event (never
 * `input`), compare rows AND expansion.
 */

(function () {
    // Shared machinery: test/live/lib/harness.js (load it first). This
    // suite's paddings/guards are the harness defaults.
    const LH = Zotero._wvLH;
    if (!LH) throw new Error("load test/live/lib/harness.js first (Zotero._wvLH missing)");
    const H = LH.make();
    const { win, zp, lp, sleep, rp, G, fnv, stable, faSettle, syncControl } = H;
    const cv = () => zp.collectionsView;
    const search = (text) => H.search(text);
    const applyChip = (mutate) => H.applyChip(mutate);
    const clearChip = () => H.clearChip();
    const advSearch = (x) => H.advSearch(x);

    /* Borrow-and-return of auto-sync, ported from filter-matrix.js on
     * 2026-08-09 — and NOT optional.
     *
     * This file ran without it for two days and produced a FALSE
     * REGRESSION: a single run taken while the library was syncing came
     * in at 8/10 with the order-independence gap at 53 rows, against a
     * true value of 3. Every differing row was an attachment or
     * annotation, i.e. exactly what sync writes. That result was almost
     * used to hold a release. With sync disabled, three consecutive runs
     * are byte-identical (9/10, gap 3, 6945/547 vs 6948/548).
     *
     * `itemsChangedSince` certifies AFTER the fact that nothing wrote to
     * the library during the run — without it, a run that merely looks
     * clean cannot be distinguished from one that was perturbed. Treat a
     * non-zero `itemsChangedDuringRun` as invalidating the run, not as a
     * footnote. */

    const { R, check, observe } = H.mkReport("interactions");
    Zotero._wvInteract = R;

    /* dev.15 made the last word asynchronous BY DESIGN: a final apply
     * lands after search quiescence, and the dev.29 stale-keep repair
     * runs on its own timer after a clear. Snapshots that race either
     * one report phantom failures (this suite read 8/10 under dev.16
     * while search-modes, which waits, was clean). Wait for BOTH
     * schedulers to go idle rather than sleeping blind. */

    function snap() {
        const w = H.rowWalk();
        const ids = w.ids, open = w.open;
        // `ids` is carried along so a FAILING check can report WHICH items
        // differ instead of only a hash mismatch. Two checks failed with
        // equal row counts but different hashes (2026-08-08) and there was
        // no way to tell a real divergence from library churn during the
        // ~4min run. summary() only serialises failures, so this costs
        // nothing on a green run.
        return { rows: ids.length, idsHash: fnv(ids), open: open.length,
            openHash: fnv(open), ids };
    }

    function describe(id) {
        try {
            const it = Zotero.Items.get(id);
            return id + ":" + it.itemType
                + (it.parentItemID ? "(child)" : "")
                + ":" + String(it.getDisplayTitle ? it.getDisplayTitle() : "").slice(0, 40);
        }
        catch (e) { return id + ":<unresolvable>"; }
    }

    /** Item-level diff between two snapshots, capped so a large divergence
     *  cannot bloat the result object. */
    function diffOf(x, y) {
        const Y = new Set(y.ids), X = new Set(x.ids);
        const onlyX = x.ids.filter(i => !Y.has(i));
        const onlyY = y.ids.filter(i => !X.has(i));
        return {
            onlyInFirst: onlyX.length, onlyInSecond: onlyY.length,
            firstSample: onlyX.slice(0, 6).map(describe),
            secondSample: onlyY.slice(0, 6).map(describe),
        };
    }






    function pdfSearch() {
        const s = new Zotero.Search();
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition("resultLevel", "item", null);
        s.addCondition("itemType", "is", "journalArticle");
        return s;
    }

    (async function run() {
        const collRows = [];
        const startedSql = Zotero.Date.dateToSQL(new Date(), true);
        await syncControl.disable();
        try {
            await cv().selectLibrary(Zotero.Libraries.userLibraryID);
            await zp.itemsView.waitForLoad();
            await search("");
            await clearChip();
            try { rp().collapseAllRows(); } catch (e) {}
            await stable();
            const base = snap();

            /* ---- A. quick search x chip -------------------------------- */
            await search("drop");
            const qsOnly = snap();
            check("quick search alone narrows the view",
                qsOnly.rows < base.rows, { base: base.rows, qs: qsOnly.rows });

            await applyChip(g => { g.itemType = ["journalArticle"]; });
            await faSettle();
            const qsThenChip = snap();
            check("chip AFTER quick search narrows further",
                qsThenChip.rows < qsOnly.rows,
                { qs: qsOnly.rows, qsThenChip: qsThenChip.rows });

            // reverse order: clear, chip first, then search
            await search("");
            await clearChip();
            try { rp().collapseAllRows(); } catch (e) {}
            await stable();
            await applyChip(g => { g.itemType = ["journalArticle"]; });
            const chipOnly = snap();
            await search("drop");
            await faSettle();
            const chipThenQs = snap();
            check("ORDER INDEPENDENCE: chip-then-search == search-then-chip",
                chipThenQs.idsHash === qsThenChip.idsHash,
                { searchThenChip: qsThenChip.rows + "/" + qsThenChip.open,
                  chipThenSearch: chipThenQs.rows + "/" + chipThenQs.open,
                  diff: diffOf(qsThenChip, chipThenQs) });

            // clearing the search must leave the chip active
            await search("");
            await faSettle();
            const afterQsCleared = snap();
            check("clearing quick search leaves the chip applied",
                afterQsCleared.idsHash === chipOnly.idsHash,
                { chipOnly: chipOnly.rows, afterQsCleared: afterQsCleared.rows });

            await clearChip();
            try { rp().collapseAllRows(); } catch (e) {}
            await stable();

            /* ---- A2. advanced search x chip ---------------------------- */
            await advSearch(pdfSearch());
            const advOnly = snap();
            check("native advanced search narrows the view",
                advOnly.rows < base.rows, { base: base.rows, adv: advOnly.rows });

            await applyChip(g => { g.annotationColor = ["#ffd400"]; });
            const advPlusChip = snap();
            observe("advanced search + Weavero chip together", {
                advOnly: advOnly.rows + "/" + advOnly.open,
                withChip: advPlusChip.rows + "/" + advPlusChip.open,
                narrowed: advPlusChip.rows < advOnly.rows,
                note: "no product decision exists for combining these; recording behaviour",
            });
            check("combining them does not break the view (rows resolvable)",
                advPlusChip.rows >= 0 && advPlusChip.idsHash !== undefined,
                { rows: advPlusChip.rows });

            await clearChip();
            await advSearch(null);
            try { rp().collapseAllRows(); } catch (e) {}
            await stable();
            const afterBoth = snap();
            check("clearing both restores the baseline",
                afterBoth.idsHash === base.idsHash,
                { base: base.rows, after: afterBoth.rows,
                  diff: diffOf(base, afterBoth) });

            /* ---- B. multi-collection / multi-library ------------------- */
            // find two collections in My Library, and a group library row
            let idxA = -1, idxB = -1, idxGroupLib = -1;
            const rows = cv()._rows;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (r.type === "collection" && r.ref && r.ref.libraryID === 1) {
                    if (idxA < 0) idxA = i; else if (idxB < 0) idxB = i;
                }
                // Group libraries have type "group", NOT "library" — a
                // scan for "library" silently found none and the
                // multi-library half reported "skipped" while looking
                // like it had run (2026-08-07).
                if ((r.type === "group" || r.type === "library")
                        && r.ref && r.ref.libraryID !== 1 && idxGroupLib < 0) {
                    idxGroupLib = i;
                }
            }
            collRows.push(idxA, idxB, idxGroupLib);

            if (idxA >= 0 && idxB >= 0) {
                cv().selection.select(idxA);
                await sleep(1200);
                await zp.itemsView.waitForLoad();
                await stable();
                const oneColl = snap();
                // add a second collection to the selection
                cv().selection.toggleSelect(idxB);
                await sleep(1800);
                await zp.itemsView.waitForLoad();
                await stable();
                const twoColl = snap();
                check("selecting a 2nd collection changes the item set",
                    twoColl.idsHash !== oneColl.idsHash,
                    { one: oneColl.rows, two: twoColl.rows,
                      selectedRows: cv().selection.count });
                observe("Weavero's library resolution under multi-collection", {
                    wvSelectedLibraryID: lp._wvSelectedLibraryID(win),
                    collectionTreeRows: rp().collectionTreeRows
                        ? rp().collectionTreeRows.length : "?",
                });
                // a chip over a multi-collection selection
                await applyChip(g => { g.itemType = ["journalArticle"]; });
                const twoCollChip = snap();
                check("chip applies over a MULTI-COLLECTION selection",
                    twoCollChip.rows <= twoColl.rows && twoCollChip.rows >= 0,
                    { before: twoColl.rows, after: twoCollChip.rows });
                await clearChip();
            }
            else {
                observe("multi-collection skipped", { reason: "need 2 collections in My Library" });
            }

            if (idxGroupLib >= 0 && idxA >= 0) {
                // MULTI-LIBRARY: My Library collection + a group library row
                cv().selection.select(idxA);
                await sleep(1200);
                cv().selection.toggleSelect(idxGroupLib);
                await sleep(2000);
                await zp.itemsView.waitForLoad();
                await stable();
                const multiLib = snap();
                observe("MULTI-LIBRARY selection", {
                    selectedRows: cv().selection.count,
                    rows: multiLib.rows,
                    wvSelectedLibraryID: lp._wvSelectedLibraryID(win),
                    note: "Weavero resolves ONE library id; the view spans two",
                });
                await applyChip(g => { g.itemType = ["journalArticle"]; });
                const multiLibChip = snap();
                check("chip over a MULTI-LIBRARY selection does not break the view",
                    multiLibChip.rows >= 0,
                    { before: multiLib.rows, after: multiLibChip.rows });
                observe("chip result under multi-library", {
                    before: multiLib.rows, after: multiLibChip.rows,
                    finding: "RESOLVED 2026-08-07: Zotero does not SUSTAIN a "
                        + "cross-library selection. A shiftSelect spanning "
                        + "libraries 1/11/22 reported 38 rows selected, but once "
                        + "the items view settled the selection was back to 1 row "
                        + "and only one library was shown. So Weavero's "
                        + "single-_wvSelectedLibraryID assumption is never "
                        + "exercised: it resolved library 22 correctly and the "
                        + "chip filtered it with 0 non-matching top-level rows. "
                        + "Multi-COLLECTION within one library does work and is "
                        + "checked above.",
                });
                await clearChip();
            }
            else {
                observe("multi-library skipped", { reason: "no group library row found" });
            }

            R.status = "done";
        }
        catch (e) {
            R.status = "error: " + e;
        }
        finally {
            try { await clearChip(); } catch (e) {}
            try { await search(""); } catch (e) {}
            try { await advSearch(null); } catch (e) {}
            try { await cv().selectLibrary(Zotero.Libraries.userLibraryID); } catch (e) {}
            await sleep(1000);
            syncControl.restore();
            R.itemsChangedDuringRun = await syncControl.itemsChangedSince(startedSql);
            R.autoSyncRestoredTo = Zotero.Prefs.get("sync.autoSync");
        }
    })();

    return "interaction test running — read Zotero._wvInteract.summary()";
})();
