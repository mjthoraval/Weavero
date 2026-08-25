// Weavero — filter & search timings, per dimension and per search mode,
// window A and (when open) window B. Requires Weavero enabled.
//
// READ-ONLY: applies filters/searches and restores them, the selected
// collection, and the quicksearch mode. Safe on a real library — that is the
// point: timing numbers on a small dev library are toys (measured 2026-08-25:
// filter apply ~1.0s on 17,932 visible rows vs ~instant on 103).
//
// Self-reporting: results in `Zotero._wvBenchFS` (status "running" → "done");
// read with JSON.stringify(Zotero._wvBenchFS). Paste into Tools → Developer →
// Run JavaScript (check "run as async function"), or load via the bridge and
// poll the global. NO fixed poll cap on the ops themselves — the predecessor
// (bench-weavero-ui) carried a 5s cap that simply returned -1 on a real
// library; ops here are watched by a 50ms sampler with a 90s safety ceiling.
//
// Standalone ON PURPOSE (no test/live harness): bench/ is public methodology
// other plugin authors can paste as-is; the tiny helpers are duplicated here
// deliberately.
//
// Timing vocabulary (report each, never conflate — see test/live/README.md):
//   applyPromiseMs — the awaited plugin call resolving (blocking cost)
//   firstChangeMs  — first visible row-count change (latency)
//   settledMs      — last observed row-count change (user-perceived-ish;
//                    carries up to ~250ms sampler padding)
(function () {
    const R = {
        started: new Date().toISOString(),
        zotero: Zotero.version,
        weavero: (Zotero.Weavero && Zotero.Weavero.plugin
            && "wv@" + (Zotero.Weavero.plugin._version || "?")) || "NOT LOADED",
        status: "running",
        windows: {},
    };
    Zotero._wvBenchFS = R;
    const p = Zotero.Weavero && Zotero.Weavero.plugin;
    if (!p) { R.status = "error: Weavero not loaded"; return "no plugin"; }

    const LOOPS = 3;
    const median = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };

    (async () => {
        const startedSql = Zotero.Date.dateToSQL(new Date(), true);
        const prevMode = Zotero.Prefs.get("search.quicksearch-mode", true);
        try {
            // A colour actually used by this library's annotations, so the
            // colour dimension measures real work everywhere.
            const annColor = await Zotero.DB.valueQueryAsync(
                "SELECT LOWER(color) FROM itemAnnotations WHERE color IS NOT NULL "
                + "AND color != '' GROUP BY LOWER(color) ORDER BY COUNT(*) DESC LIMIT 1");

            const wins = Zotero.getMainWindows();
            for (let wi = 0; wi < Math.min(2, wins.length); wi++) {
                const win = wins[wi];
                const label = wi === 0 ? "A" : "B";
                const zp = win.ZoteroPane;
                const iv = zp.itemsView;
                if (!iv) { R.windows[label] = "no items view"; continue; }
                const rp = () => iv.rowProvider || iv;
                const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));

                // Restore points: selection + tab.
                win.Zotero_Tabs.select("zotero-pane");
                const prevCollRow = zp.collectionsView.selection.focused;
                await iv.waitForLoad();

                // BIND the filter accessors to THIS window. The plugin's
                // `_filterState` and apply resolve the FOCUSED main window by
                // default, so with two windows open every "window A" filter op
                // landed on whichever window had focus -- the first two-window
                // run measured nulls in A while quietly filtering B. The
                // override is the plugin's own mechanism for exactly this
                // (targeted setup of a background main window).
                p._wvFilterWinOverride = win;
                // AND focus it: the override binds the state accessors, but
                // the apply pipeline operates on the FOCUSED main window (the
                // corrected two-window run still measured nulls in the
                // unfocused A while B's colour apply worked). Same approach
                // as test/live/multi-window.js's focusWin.
                try { win.focus(); } catch (e) {}
                await sleep(700);

                /** Watch the row count while `fire` runs; sample every 50ms
                 *  until 5 equal samples follow at least one change (or the
                 *  90s ceiling). */
                async function measure(fire) {
                    const out = { applyPromiseMs: null, firstChangeMs: null,
                        settledMs: null, fromRows: rp().getRowCount(), toRows: null };
                    const t0 = win.performance.now();
                    const done = Promise.resolve()
                        .then(fire)
                        .then(() => { out.applyPromiseMs = Math.round(win.performance.now() - t0); })
                        .catch(e => { out.err = String(e); });
                    let last = out.fromRows, lastChangeAt = null, stable = 0;
                    while (win.performance.now() - t0 < 90000) {
                        await sleep(50);
                        let n = last;
                        try { n = rp().getRowCount(); } catch (e) {}
                        if (n !== last) {
                            if (out.firstChangeMs === null) {
                                out.firstChangeMs = Math.round(win.performance.now() - t0);
                            }
                            lastChangeAt = win.performance.now();
                            last = n; stable = 0;
                        } else if (lastChangeAt !== null && ++stable >= 5) break;
                        // No change at all: give the op 10s to produce one, then
                        // accept "no visible change" (a filter matching all).
                        // NOT 3s: a real-library search can take longer than
                        // that to its first change, and bailing reads as
                        // "no change" when the truth is "slow".
                        if (lastChangeAt === null && win.performance.now() - t0 > 10000
                            && out.applyPromiseMs !== null) break;
                    }
                    await done;
                    out.settledMs = lastChangeAt === null ? null
                        : Math.round(lastChangeAt - t0);
                    out.toRows = last;
                    return out;
                }

                const applyGroup = (mutate) => async () => {
                    const g = p._emptyFilterGroup(); mutate(g);
                    p._filterState = { groups: [g], activeGroupIndex: 0 };
                    p._renderFilterBar();
                    await p._applyItemsListFilter({});
                };
                const clearAll = () => async () => { p._clearAllFilters(); };

                async function loopOp(name, fireFactory, resetFactory) {
                    const runs = [];
                    for (let i = 0; i < LOOPS; i++) {
                        runs.push(await measure(fireFactory()));
                        if (resetFactory) await measure(resetFactory());
                        await sleep(400);
                    }
                    const firsts = runs.map(r => r.firstChangeMs).filter(v => v != null);
                    const settleds = runs.map(r => r.settledMs).filter(v => v != null);
                    return { runs,
                        medianFirstChangeMs: firsts.length ? median(firsts) : null,
                        medianSettledMs: settleds.length ? median(settleds) : null,
                        runsWithNoChange: runs.length - firsts.length };
                }

                const W = R.windows[label] = { baselineRows: rp().getRowCount(), ops: {} };

                // ---- filter dimensions ----
                // Reset between loop runs, or iterations 2..N re-apply onto an
                // already-filtered view and measure nothing.
                W.ops["filter itemType apply"] = await loopOp("itemType",
                    () => applyGroup(g => { g.itemType = ["journalArticle"]; }), clearAll);
                await applyGroup(g => { g.itemType = ["journalArticle"]; })();
                await sleep(800);
                W.ops["filter clear"] = await measure(clearAll());
                if (annColor) {
                    W.ops["filter annotationColor apply"] = await loopOp("annColor",
                        () => applyGroup(g => { g.annotationColor = [annColor]; }), clearAll);
                } else {
                    W.ops["filter annotationColor apply"] = "skipped: no annotation colours";
                }

                // ---- quick search per mode ----
                const sb = zp.document.getElementById("zotero-tb-search");
                const TERM = "the";
                for (const mode of ["titleCreatorYear", "fields", "everything"]) {
                    Zotero.Prefs.set("search.quicksearch-mode", mode, true);
                    await sleep(300);
                    const applyRes = await measure(async () => {
                        sb.value = TERM;
                        sb.dispatchEvent(new Event("command"));   // never `input`
                    });
                    const clearRes = await measure(async () => {
                        sb.value = "";
                        sb.dispatchEvent(new Event("command"));
                    });
                    W.ops["search " + mode] = { apply: applyRes, clear: clearRes };
                    await sleep(400);
                }
                Zotero.Prefs.set("search.quicksearch-mode", "fields", true);

                // ---- combined: chip + search (the invariant-bearing path) ----
                await measure(applyGroup(g => { g.itemType = ["journalArticle"]; }));
                W.ops["search fields UNDER an active chip"] = await measure(async () => {
                    sb.value = TERM; sb.dispatchEvent(new Event("command"));
                });
                await measure(async () => { sb.value = ""; sb.dispatchEvent(new Event("command")); });
                W.ops["clear chip after combined"] = await measure(clearAll());

                // ---- restore this window ----
                try { await zp.collectionsView.selectWait(prevCollRow); } catch (e) {}
                W.restoredRows = rp().getRowCount();
                W.restoredExactly = W.restoredRows === W.baselineRows;
                delete p._wvFilterWinOverride;
            }
            if (Zotero.getMainWindows().length < 2) {
                R.windows.B = "skipped: no second main window open (open one to measure it)";
            }
            R.status = "done";
        } catch (e) {
            R.status = "error: " + e;
        } finally {
            try { Zotero.Prefs.set("search.quicksearch-mode", prevMode || "fields", true); } catch (e) {}
            try { delete p._wvFilterWinOverride; } catch (e) {}
            // Safety clear in EVERY main window, explicitly targeted.
            for (const w2 of Zotero.getMainWindows()) {
                try { p._wvFilterWinOverride = w2; p._clearAllFilters(); } catch (e) {}
            }
            try { delete p._wvFilterWinOverride; } catch (e) {}
            R.itemsChangedDuringRun = await Zotero.DB.valueQueryAsync(
                "SELECT COUNT(*) FROM items WHERE clientDateModified > ?", [startedSql]);
            R.finished = new Date().toISOString();
        }
    })();

    return "bench-filter-search running — read Zotero._wvBenchFS";
})()
