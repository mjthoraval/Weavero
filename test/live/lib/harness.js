/* Weavero — shared harness for the live suites (test/live/*.js).
 *
 * Load THIS FILE first (the runner does it for you; a manual paste into
 * Tools -> Developer -> Run JavaScript is two pastes now: this file, then the
 * suite). It installs `Zotero._wvLH`; every suite fails fast with a clear
 * message when it is missing.
 *
 * WHY IT EXISTS (2026-08-25). The four suites each carried private copies of
 * the earned-rules machinery, and an audit found them drifted exactly where
 * drift is dangerous:
 *
 *   - `faSettle` did not exist in filter-matrix at all, and search-modes'
 *     copy predated the `_wvStaleKeepTimer` wait interactions already had --
 *     so two suites were exposed to the dev.15 phantom-miss class their
 *     sibling had been hardened against.
 *   - filter-matrix's `search()` still used the fixed 4200ms sleep that
 *     interactions MEASURED as lying on 2026-08-08 (search-clear blocks
 *     ~5.5s; the sleep snapshots mid-rebuild). (Fixed in its own commit,
 *     not silently inside this extraction.)
 *   - three different `reset()` clear-lists, two of them stale enumerations.
 *
 * One copy, so a lesson learned in one suite is learned by all of them.
 *
 * THE RULES THIS FILE ENCODES (each paid for -- see the suites' headers for
 * the incidents):
 *   1. Space applies >= 950ms (post-apply observer-suppression window).
 *   2. Gate on STABILITY, never on a fixed sleep or a minimum row count.
 *   3. Drive quick search with a `command` event, never `input`.
 *   4. Wait out Weavero's final-apply/stale-keep schedulers before
 *      snapshotting (faSettle) -- a snapshot before quiescence reads the
 *      pre-final state and reports a phantom miss.
 *   5. A run during which the library changed is not evidence
 *      (syncControl + itemsChangedSince certification).
 *
 * WHAT DELIBERATELY STAYS IN THE SUITES: their oracles. The matrix's grey
 * predicate + dual-hash snapshot, search-modes' DB ground truth, the
 * interaction sequences, multi-window's per-window isolation checks. Those
 * are what each suite PROVES; sharing them would blur what a green run
 * means. The harness is transport, not truth.
 *
 * `make(win)` binds a kit to ONE window, so multi-window work is just two
 * kits.
 */
(function () {
    "use strict";

    const LH = {
        VERSION: 1,

        make(win) {
            win = win || Zotero.getMainWindows()[0];
            const zp = win.ZoteroPane;
            const lp = Zotero.Weavero && Zotero.Weavero.plugin;
            if (!lp) throw new Error("Weavero is not loaded");

            const sleep = ms => new Promise(r => win.setTimeout(r, ms));
            const rp = () => zp.itemsView.rowProvider || zp.itemsView;
            const G = () => lp._activeGroup();

            const fnv = (arr) => {
                let h = 0x811c9dc5;
                for (const x of arr) { h = (h ^ x) >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
                return h.toString(16);
            };

            /* Rule 2: stability, never min-rows. `steady` consecutive equal
             * row counts, sampled every `interval` ms, capped by `guard`
             * samples. Defaults are the historical (200-guard) values;
             * search-modes passes its 250. */
            async function stable(opts) {
                const o = opts || {};
                const steadyN = o.steady || 4, guardMax = o.guard || 200,
                    interval = o.interval || 150;
                let last = -1, steady = 0, guard = 0;
                while (steady < steadyN && guard++ < guardMax) {
                    await sleep(interval);
                    let n = 0;
                    try { n = rp().getRowCount(); } catch (e) {}
                    if (n === last) steady++; else { steady = 0; last = n; }
                }
                return last;
            }

            /* Rule 4. Canonical form waits on BOTH schedulers -- the
             * final-apply timer AND the stale-keep repair timer
             * (interactions gained the second on 2026-08-08; search-modes
             * never did until this consolidation; the matrix had neither).
             * Waiting on one more timer can only make settling more
             * conservative, so adopting the superset is safe everywhere. */
            async function faSettle() {
                const t0 = Date.now();
                while ((lp._wvFATimer || lp._wvStaleKeepTimer)
                    && Date.now() - t0 < 15000) await sleep(300);
                await sleep(1200);
            }

            /* Rule 3: `command`, never `input`. Two settle modes:
             *   {} (default)              -> pre-sleep, stable(), post-sleep
             *                                (the rule-2-correct form)
             *   { settle: "sleep", ms }   -> the legacy fixed sleep, kept ONLY
             *                                so the extraction commit changes
             *                                no suite's measurement semantics;
             *                                the matrix migrates off it in its
             *                                own commit. */
            async function search(text, opts) {
                const o = opts || {};
                const sb = zp.document.getElementById("zotero-tb-search");
                if (!sb) return;
                sb.value = text;
                sb.dispatchEvent(new Event("command"));
                if (o.settle === "sleep") { await sleep(o.ms || 4200); return; }
                await sleep(o.pre != null ? o.pre : 500);
                await stable(o.stable);
                await sleep(o.post != null ? o.post : 400);
            }

            /* Canonical reset: build the group the way the PLUGIN does, so a
             * newly added dimension can never leak between cases through a
             * stale hand-kept clear-list (the audit found two of those). */
            function reset() {
                lp._filterState.groups.length = 0;
                lp._filterState.groups.push(lp._emptyFilterGroup());
                lp._filterState.collections = [];
                lp._filterState.savedSearches = [];
            }

            /* Rule 1 lives in the 950. `mutate` writes the case's dimensions
             * onto the fresh group. */
            async function applyChip(mutate, opts) {
                const o = opts || {};
                reset();
                if (mutate) mutate(G());
                await sleep(950);
                lp._applyItemsListFilter({ cascade: true });
                await stable(o.stable);
                await sleep(o.post != null ? o.post : 400);
            }

            async function clearChip(opts) {
                const o = opts || {};
                reset();
                await sleep(950);
                lp._applyItemsListFilter({ cascade: true });
                await stable(o.stable);
                await sleep(o.post != null ? o.post : 300);
            }

            async function advSearch(searchOrNull, opts) {
                const o = opts || {};
                await zp.itemsView.setFilter("advanced-search", searchOrNull);
                await stable(o.stable);
                await sleep(o.post != null ? o.post : 500);
            }

            /* Rule 5. */
            const syncControl = {
                prevAutoSync: null,
                async disable() {
                    try {
                        this.prevAutoSync = Zotero.Prefs.get("sync.autoSync");
                        Zotero.Prefs.set("sync.autoSync", false);
                    } catch (e) {}
                },
                restore() {
                    try {
                        if (this.prevAutoSync !== null) {
                            Zotero.Prefs.set("sync.autoSync", this.prevAutoSync);
                        }
                    } catch (e) {}
                },
                async itemsChangedSince(sqlDate) {
                    try {
                        return await Zotero.DB.valueQueryAsync(
                            "SELECT COUNT(*) FROM items WHERE clientDateModified > ?",
                            [sqlDate]);
                    } catch (e) { return null; }
                },
            };

            /* The row-walk every snapshot shares: sorted visible ids + open
             * container ids + their hashes. Suites LAYER their oracles on
             * top (grey predicate, selection, patch watermarks, raw ids). */
            function rowWalk(provider) {
                const p = provider || rp();
                const ids = [], open = [];
                const n = p.getRowCount();
                for (let i = 0; i < n; i++) {
                    let row;
                    try { row = p.getRow(i); } catch (e) { continue; }
                    if (!row || !row.ref) continue;
                    ids.push(row.ref.id);
                    if (row.isOpen) open.push(row.ref.id);
                }
                ids.sort((a, b) => a - b);
                open.sort((a, b) => a - b);
                return {
                    ids, open,
                    rows: ids.length, idsHash: fnv(ids),
                    openCount: open.length, openHash: fnv(open),
                };
            }

            /* Uniform check/observe reporter. Suites with a richer result
             * model (the matrix) keep their own R; the runner only relies on
             * `status` and `summary()`. */
            function mkReport(suite) {
                const R = {
                    suite,
                    started: new Date().toISOString(),
                    zotero: Zotero.version,
                    weavero: (Zotero.Weavero && Zotero.Weavero.version) || null,
                    harness: LH.VERSION,
                    status: "running",
                    checks: [],
                    observations: [],
                    summary() {
                        const failed = this.checks.filter(c => !c.pass);
                        return {
                            suite: this.suite,
                            status: this.status,
                            ran: this.checks.length,
                            passed: this.checks.filter(c => c.pass).length,
                            itemsChangedDuringRun: this.itemsChangedDuringRun,
                            // null = this suite ran no DB certification --
                            // "not certified" must not read as "untrustworthy".
                            trustworthy: this.itemsChangedDuringRun == null
                                ? null : this.itemsChangedDuringRun === 0,
                            failures: failed.map(c => ({ name: c.name, detail: c.detail })),
                            observations: this.observations,
                        };
                    },
                };
                const check = (name, pass, detail) =>
                    R.checks.push({ name, pass: !!pass, detail });
                const observe = (name, detail) =>
                    R.observations.push({ name, detail });
                return { R, check, observe };
            }

            return {
                win, zp, lp, sleep, rp, G, fnv,
                stable, faSettle, search, reset,
                applyChip, clearChip, advSearch,
                syncControl, rowWalk, mkReport,
            };
        },
    };

    Zotero._wvLH = LH;
    return "wvLH v" + LH.VERSION + " loaded";
})();
