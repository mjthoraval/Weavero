/* Weavero — live QUICK-SEARCH MODE x FILTER compatibility.
 *
 * Run like the other files here; results in `Zotero._wvModes`, read with
 *     JSON.stringify(Zotero._wvModes.summary())
 *
 * WHY THIS EXISTS (requested 9 Aug 2026). Zotero's quick search has THREE
 * modes and they are not interchangeable — measured on the real library
 * for the term "drop":
 *
 *     titleCreatorYear   4 873 matches
 *     fields             7 776   <- "All Fields & Tags", the UI default here
 *     everything        21 287
 *
 * Every earlier comparison used whichever mode happened to be set, and one
 * whole investigation stalled because 7 776 matched neither of the two
 * modes I had tested. Mode is now an explicit axis, and the pref
 * (`search.quicksearch-mode`) is set per case rather than assumed.
 *
 * Advanced search is included as a fourth mechanism: it narrows through
 * the same `setFilter` channel but with `resultLevel` semantics, and it
 * had no coverage combined with a Weavero chip at all.
 *
 * GROUND TRUTH, not order comparison. Earlier work compared the two apply
 * ORDERS against each other, which can only prove they disagree. Each case
 * here is compared against a set computed independently from
 * `Zotero.Search` + the parent-of-matching-child rule, so a case can be
 * called right or wrong on its own. (Established 9 Aug 2026: both orders
 * are subsets of ground truth, each dropping ONE different item, so
 * "which order is correct" was the wrong question.)
 *
 * Harness rules as elsewhere: space applies >=900ms, gate on stability
 * only, drive quick search with a `command` event (never `input`), and
 * control auto-sync — a run during which the library changes is not
 * evidence.
 */

(function () {
    const win = Zotero.getMainWindows()[0];
    const zp = win.ZoteroPane;
    const lp = Zotero.Weavero && Zotero.Weavero.plugin;
    if (!lp) throw new Error("Weavero is not loaded");

    const TERM = "drop";
    const CHIP = "journalArticle";
    const MODES = [
        { key: "titleCreatorYear", cond: "quicksearch-titleCreatorYear" },
        { key: "fields", cond: "quicksearch-fields" },
        { key: "everything", cond: "quicksearch-everything" },
    ];

    const sleep = ms => new Promise(r => win.setTimeout(r, ms));
    const rp = () => zp.itemsView.rowProvider || zp.itemsView;
    const G = () => lp._activeGroup();

    const R = {
        started: new Date().toISOString(),
        status: "running",
        checks: [],
        observations: [],
        summary() {
            const failed = this.checks.filter(c => !c.pass);
            return {
                status: this.status,
                ran: this.checks.length,
                passed: this.checks.filter(c => c.pass).length,
                itemsChangedDuringRun: this.itemsChangedDuringRun,
                trustworthy: this.itemsChangedDuringRun === 0,
                failures: failed.map(c => ({ name: c.name, detail: c.detail })),
                observations: this.observations,
            };
        },
    };
    Zotero._wvModes = R;
    const check = (name, pass, detail) => R.checks.push({ name, pass: !!pass, detail });
    const observe = (name, detail) => R.observations.push({ name, detail });

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
                    "SELECT COUNT(*) FROM items WHERE clientDateModified > ?", [sqlDate]);
            } catch (e) { return null; }
        },
    };

    /* dev.15 made the last word ASYNCHRONOUS by design: after a search
     * settles, the final-apply scheduler waits for quiescence and then
     * re-applies once. A snapshot taken before that pass sees the
     * pre-final state and reports a phantom miss (observed: chip-first
     * `everything` read 11,107 here while a direct check with a longer
     * wait held 11,108 stably). Wait for the scheduler's tick loop to go
     * idle rather than sleeping blind. */
    async function faSettle() {
        const t0 = Date.now();
        while (lp._wvFATimer && Date.now() - t0 < 15000) await sleep(300);
        await sleep(1200);
    }

    async function stable() {
        let last = -1, steady = 0, guard = 0;
        while (steady < 4 && guard++ < 250) {
            await sleep(150);
            let n = 0;
            try { n = rp().getRowCount(); } catch (e) {}
            if (n === last) steady++; else { steady = 0; last = n; }
        }
        return last;
    }

    /** TOP-LEVEL ids only. Child rows change with expansion, so they cannot
     *  be compared against a set-based ground truth; top level can. */
    function topIDs() {
        const out = [];
        const n = rp().getRowCount();
        for (let i = 0; i < n; i++) {
            let row, lvl = 0;
            try { row = rp().getRow(i); lvl = rp().getLevel(i); } catch (e) { continue; }
            if (row && row.ref && lvl === 0) out.push(row.ref.id);
        }
        return new Set(out);
    }

    /** The set a correct view SHOULD show: top-level items of the chip's
     *  type that either match the search themselves, or hold a matching
     *  descendant. Computed from the DB, never from a view. */
    async function groundTruth(cond) {
        const s = new Zotero.Search();
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition(cond, "contains", TERM);
        const ids = await s.search();
        const items = await Zotero.Items.getAsync(ids);
        await Zotero.Items.loadDataTypes(items);
        const gt = new Set();
        for (const it of items) {
            if (!it) continue;
            if (it.isRegularItem()) {
                if (it.itemType === CHIP) gt.add(it.id);
                continue;
            }
            // climb to the top-level ancestor (annotation -> attachment -> item)
            let p = it.parentItemID ? Zotero.Items.get(it.parentItemID) : null;
            if (p && !p.isRegularItem() && p.parentItemID) {
                p = Zotero.Items.get(p.parentItemID);
            }
            if (p && p.isRegularItem() && p.itemType === CHIP) gt.add(p.id);
        }
        return gt;
    }

    /* Reset via Weavero's OWN factory, `_emptyFilterGroup()`.
     *
     * Two harness bugs came from hand-written resets on 9 Aug 2026:
     * clearing only the obvious dimensions left a cross-level one
     * (`hasTag` / `hasRelated` / `hasLink` / `addedBy`) set, which makes
     * `_effectiveSelectionTargetKinds` report all three row kinds and
     * flips the Order-B re-route gate ON even for a pure itemType chip —
     * three "failing" runs were contaminated that way. Enumerating more
     * keys then broke a different leg, because blanket-nulling a key that
     * wants an array corrupts the group.
     *
     * The factory cannot drift from the real shape, and cannot miss a
     * dimension added later. Never hand-enumerate this again.
     */
    function reset() {
        lp._filterState.groups.length = 0;
        lp._filterState.groups.push(lp._emptyFilterGroup());
        lp._filterState.collections = [];
        lp._filterState.savedSearches = [];
    }

    /* Fail loudly if the reset left anything active — otherwise a stale
     * dimension silently reroutes the whole run. */
    function assertClean(label) {
        const g = G();
        const stray = [];
        for (const k of Object.keys(g)) {
            if (/Scope$/.test(k)) continue;              // scope objects are config, not filters
            const v = g[k];
            const on = Array.isArray(v) ? v.length > 0 : (v != null && v !== false);
            if (on) stray.push(k);
        }
        if (stray.length) check("reset left the group clean before " + label, false, { stray });
    }

    async function clearChip() {
        reset();
        await sleep(950);
        lp._applyItemsListFilter({ cascade: true });
        await stable();
        await sleep(500);
    }

    async function applyChip() {
        reset();
        G().itemType = [CHIP];
        await sleep(950);
        lp._applyItemsListFilter({ cascade: true });
        await stable();
        await sleep(500);
    }

    async function search(text) {
        const sb = zp.document.getElementById("zotero-tb-search");
        if (!sb) return;
        sb.value = text;
        sb.dispatchEvent(new Event("command"));        // never `input`
        await sleep(600);
        await stable();
        await sleep(500);
    }

    async function advSearch(searchOrNull) {
        await zp.itemsView.setFilter("advanced-search", searchOrNull);
        await stable();
        await sleep(600);
    }

    const diff = (got, gt) => ({
        got: got.size, expected: gt.size,
        missing: [...gt].filter(x => !got.has(x)).length,
        extra: [...got].filter(x => !gt.has(x)).length,
        missingSample: [...gt].filter(x => !got.has(x)).slice(0, 4),
        extraSample: [...got].filter(x => !gt.has(x)).slice(0, 4),
    });

    (async function run() {
        const startedSql = Zotero.Date.dateToSQL(new Date(), true);
        const prevMode = Zotero.Prefs.get("search.quicksearch-mode");
        await syncControl.disable();
        try {
            await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await zp.itemsView.waitForLoad();

            for (const mode of MODES) {
                Zotero.Prefs.set("search.quicksearch-mode", mode.key);
                await sleep(400);
                const gt = await groundTruth(mode.cond);

                // ---- search THEN chip -------------------------------
                await search(""); await clearChip();
                assertClean(mode.key);
                try { rp().collapseAllRows(); } catch (e) {}
                await stable();
                await search(TERM);
                const searchOnly = topIDs().size;
                await applyChip();
                await faSettle();
                const A = topIDs();

                // ---- chip THEN search -------------------------------
                await search(""); await clearChip();
                try { rp().collapseAllRows(); } catch (e) {}
                await stable();
                await applyChip();
                await search(TERM);
                await faSettle();
                const B = topIDs();

                const dA = diff(A, gt), dB = diff(B, gt);
                check(mode.key + ": chip narrows the search result",
                    A.size < searchOnly,
                    { searchOnly, withChip: A.size });
                // A view must never invent rows. Missing rows are the known
                // open bug; EXTRA rows would be a new and worse defect.
                check(mode.key + ": search-then-chip shows nothing spurious",
                    dA.extra === 0, dA);
                check(mode.key + ": chip-then-search shows nothing spurious",
                    dB.extra === 0, dB);
                check(mode.key + ": ORDER INDEPENDENCE at top level",
                    A.size === B.size
                        && [...A].every(x => B.has(x)),
                    { searchThenChip: A.size, chipThenSearch: B.size,
                      onlyInFirst: [...A].filter(x => !B.has(x)).slice(0, 4),
                      onlyInSecond: [...B].filter(x => !A.has(x)).slice(0, 4) });
                check(mode.key + ": matches ground truth (search-then-chip)",
                    dA.missing === 0 && dA.extra === 0, dA);
                check(mode.key + ": matches ground truth (chip-then-search)",
                    dB.missing === 0 && dB.extra === 0, dB);
                observe(mode.key + " summary", {
                    groundTruth: gt.size, searchThenChip: A.size,
                    chipThenSearch: B.size,
                    unionCoversGroundTruth:
                        [...gt].every(x => A.has(x) || B.has(x)),
                });
            }

            // ---- ADVANCED SEARCH x chip -----------------------------
            await search(""); await clearChip();
            try { rp().collapseAllRows(); } catch (e) {}
            await stable();
            const s = new Zotero.Search();
            s.libraryID = Zotero.Libraries.userLibraryID;
            s.addCondition("resultLevel", "item", null);
            s.addCondition("title", "contains", TERM);
            await advSearch(s);
            const advOnly = topIDs();
            check("advanced search alone narrows the view",
                advOnly.size > 0, { rows: advOnly.size });
            await applyChip();
            const advChip = topIDs();
            check("advanced search + chip narrows further and stays a subset",
                advChip.size <= advOnly.size
                    && [...advChip].every(x => advOnly.has(x)),
                { advOnly: advOnly.size, withChip: advChip.size });
            // every surviving row must actually be of the chip's type
            let wrongType = 0;
            for (const id of advChip) {
                const it = Zotero.Items.get(id);
                if (!it || it.itemType !== CHIP) wrongType++;
            }
            check("advanced search + chip: every row matches the chip",
                wrongType === 0, { wrongType, rows: advChip.size });
            await clearChip();
            await advSearch(null);

            R.status = "done";
        }
        catch (e) {
            R.status = "error: " + e;
        }
        finally {
            try { Zotero.Prefs.set("search.quicksearch-mode", prevMode); } catch (e) {}
            try { await search(""); } catch (e) {}
            try { await clearChip(); } catch (e) {}
            try { await zp.itemsView.setFilter("advanced-search", null); } catch (e) {}
            syncControl.restore();
            R.itemsChangedDuringRun = await syncControl.itemsChangedSince(startedSql);
            R.autoSyncRestoredTo = Zotero.Prefs.get("sync.autoSync");
            R.quicksearchModeRestoredTo = Zotero.Prefs.get("search.quicksearch-mode");
        }
    })();

    return "search-mode suite running — read Zotero._wvModes.summary()";
})();
