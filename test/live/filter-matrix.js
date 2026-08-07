/* Weavero — live filter verification matrix.
 *
 * NOT part of `npm test`. This runs against the REAL library (it needs
 * real data volume and real search results), so it lives here as a tool
 * to be run inside a running Zotero:
 *
 *     Tools -> Developer -> Run JavaScript, paste this file, run
 *     (or load it through the MCP bridge)
 *
 * Results land in `Zotero._wvMatrix`; read them with:
 *     JSON.stringify(Zotero._wvMatrix.summary())
 *
 * WHY THIS FILE EXISTS: every false result in the 2026-08-05..07
 * verification campaign came from an ad-hoc harness, not from the
 * plugin. The rules below are the ones that cost real time to learn;
 * they are encoded here so they are never re-derived by hand.
 *
 *   1. SPACE APPLIES >= 900ms. An apply issued inside the 300ms
 *      post-apply observer-suppression window is bounced to a retry, so
 *      a snapshot taken straight after reads the PREVIOUS state. This
 *      produced 3 phantom "failures" on 2026-08-06.
 *   2. GATE ON STABILITY ONLY, never on a minimum row count. Tiny result
 *      sets are legitimate; a min-rows gate spins for 30s and then lies.
 *   3. DRIVE QUICK SEARCH WITH A `command` EVENT, never `input`. Zotero
 *      searches from ZoteroPane.search() via `command`; dispatching
 *      `input` sets the value but never runs a native search, so only
 *      the plugin reacts -- an ordering no real user can produce. This
 *      invalidated an entire day of quick-search measurements.
 *   4. COMPARE BOTH HASHES: visible row ids AND open-container ids. Row
 *      counts alone hide expansion differences, and the expansion rules
 *      are a key part of the feature (standing user requirement).
 *   5. EXPECT LIVE CHURN of +-1 row if the library is in use. Re-run a
 *      flagged case and check self-consistency (same mode twice) before
 *      believing it.
 */

(function () {
    const win = Zotero.getMainWindows()[0];
    const zp = win.ZoteroPane;
    const lp = Zotero.Weavero && Zotero.Weavero.plugin;
    if (!lp) { throw new Error("Weavero is not loaded"); }

    const sleep = ms => new Promise(r => win.setTimeout(r, ms));
    const rp = () => zp.itemsView.rowProvider || zp.itemsView;
    const G = () => lp._activeGroup();

    const SETTLE = 950;          // rule 1
    const fnv = (arr) => {
        let h = 0x811c9dc5;
        for (const x of arr) { h = (h ^ x) >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
        return h.toString(16);
    };

    // rule 2 — stability only
    async function stable() {
        let last = -1, steady = 0, guard = 0;
        while (steady < 4 && guard++ < 200) {
            await sleep(150);
            let n = 0;
            try { n = rp().getRowCount(); } catch (e) {}
            if (n === last) steady++; else { steady = 0; last = n; }
        }
        return last;
    }

    /* TIMING MODEL — three different clocks, reported separately because
     * they answer different questions and conflating them produced a
     * misleading "Weavero is ~7x faster than native" claim (2026-08-07):
     *
     *   ring.*      per-phase breakdown INSIDE _applyItemsListFilterInner
     *               (setup / pass1 cascade / pass2 keep-build / gatePatch /
     *               invalidate). Diagnoses WHERE time goes. Excludes the
     *               outer guards, the selection reconcile, and all paint —
     *               so it always UNDER-states what a user waits for.
     *   syncMs      wall-clock across the _applyItemsListFilter() call:
     *               the synchronous work, still before any pixels change.
     *   lastPaintMs wall-clock from the call to the LAST MozAfterPaint —
     *               Gecko's real "pixels reached the screen" event. This is
     *               the closest proxy for what the user actually
     *               experiences. firstPaintMs is when something first
     *               visibly changed.
     *   stableMs    when the row count stopped moving, measured by polling.
     *               Includes ~600ms of polling padding by construction —
     *               useful for settling behaviour, USELESS as a user-time
     *               figure. Never quote it as one.
     *
     * Any engine-vs-engine comparison must use the SAME field, gathered
     * the same way, with matched cache warmth.
     */
    /* PAINT TIMING IS OPPORTUNISTIC, NOT GUARANTEED (measured 2026-08-07).
     * Gecko suppresses painting for an OCCLUDED window, so MozAfterPaint
     * never fires when Zotero sits behind other windows -- a clean
     * unattended run produced paints:0 on all 39 cases, while a run with
     * the user working in Zotero produced paints but timings polluted by
     * their interaction. There is no automated way out of that: the
     * window must be genuinely visible for paint to mean anything, and a
     * visible window invites interference. So:
     *   - `syncMs` + `ring.*` are the RELIABLE automated numbers,
     *   - paint fields are a bonus when the window happens to be visible,
     *   - `windowVisible` below records which situation applied, so a
     *     null paint time is self-explaining rather than mysterious.
     */
    function windowVisible() {
        try { return !win.document.hidden; } catch (e) { return null; }
    }

    /* AUTO-SYNC IS DISABLED FOR THE RUN AND RESTORED AFTERWARDS.
     * A sync that writes items mid-run fires the notifier, which nulls
     * the verdict caches -- so random cases would be measured cold while
     * others are warm, and row counts could shift under the hash
     * comparison. The user keeps auto-sync ON normally, so this is a
     * borrow-and-return, done in the same finally that restores the
     * filter state. `itemsChanged` below certifies after the fact that
     * nothing wrote to the library during the run. */
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

    function paintRecorder() {
        const t0 = win.performance.now();
        let first = null, last = null, count = 0;
        const onPaint = () => {
            const t = win.performance.now();
            if (first === null) first = t;
            last = t;
            count++;
        };
        win.addEventListener("MozAfterPaint", onPaint);
        return {
            t0,
            stop() {
                win.removeEventListener("MozAfterPaint", onPaint);
                return {
                    firstPaintMs: first === null ? null : Math.round(first - t0),
                    lastPaintMs: last === null ? null : Math.round(last - t0),
                    paints: count,
                };
            },
            // Quiescence: no paint for `quietMs`, so the view has settled
            // visually rather than merely stopped changing row counts.
            async waitQuiet(quietMs = 500, capMs = 20000) {
                const start = win.performance.now();
                for (;;) {
                    const now = win.performance.now();
                    if (now - start > capMs) return "cap";
                    if (last !== null && now - last > quietMs) return "quiet";
                    if (last === null && now - start > quietMs * 2) return "no-paint";
                    await sleep(100);
                }
            },
        };
    }

    // rule 3 — the ONLY correct way to drive the quick search
    async function search(text) {
        const sb = zp.document.getElementById("zotero-tb-search");
        if (!sb) return;
        sb.value = text;
        sb.dispatchEvent(new Event("command"));
        await sleep(4200);
    }

    // rule 4 — rows AND open containers AND selection. All three are
    // user-visible state; two engines agreeing on rows while disagreeing
    // on what stays selected are NOT equivalent (user requirement,
    // 2026-08-07).
    function snapshot() {
        const ids = [], open = [];
        const n = rp().getRowCount();
        for (let i = 0; i < n; i++) {
            let row;
            try { row = rp().getRow(i); } catch (e) { continue; }
            if (!row || !row.ref) continue;
            ids.push(row.ref.id);
            if (row.isOpen) open.push(row.ref.id);
        }
        ids.sort((a, b) => a - b);
        open.sort((a, b) => a - b);
        let sel = [];
        try { sel = zp.getSelectedItems().map(it => it.id).sort((a, b) => a - b); }
        catch (e) { sel = ["ERR"]; }
        return {
            rows: ids.length, idsHash: fnv(ids),
            open: open.length, openHash: fnv(open),
            selCount: sel.length, selHash: fnv(sel), sel: sel.slice(0, 12),
        };
    }

    /* A comparison of SELECTION only means something if both engines
     * start from the same selection, so each run seeds a deterministic
     * one: the first `n` top-level regular items of the collapsed view,
     * chosen by id order so the choice does not depend on scroll or
     * previous state. */
    async function seedSelection(n = 3) {
        const picked = [];
        const total = rp().getRowCount();
        for (let i = 0; i < total && picked.length < n; i++) {
            let row;
            try { row = rp().getRow(i); } catch (e) { continue; }
            const it = row && row.ref;
            if (it && it.isRegularItem && it.isRegularItem()) picked.push(it.id);
        }
        try { zp.itemsView.selectItems(picked); } catch (e) {}
        await sleep(500);
        return picked;
    }

    function reset() {
        lp._filterState.groups.length = 1;
        const g = G();
        for (const k of ["itemType", "itemTypeExclude", "annotationColor",
            "annotationColorExclude", "annotationType", "attachmentFileType",
            "attachmentFileTypeExclude", "publication", "publicationExclude",
            "readStatus", "annotationTag", "annotationTagExclude"]) g[k] = [];
        for (const k of ["hasURL", "hasAttachment", "hasDOI", "hasPMID", "hasPMCID",
            "inOtherLibrary", "annotationHasComment", "itemNote", "standaloneNote",
            "hasAnnotations", "hasAbstract", "hasRelated", "hasLink", "hasBookmarks",
            "hasTag"]) g[k] = null;
        g.quickSearchScope = null;
        lp._filterState.collections = [];
        lp._filterState.savedSearches = [];
    }

    // The canonical case list. Keep in sync with
    // work/filter-test-cases.md -- that file is the human-readable
    // register; this is the executable one.
    const CASES = [
        ["itemType", () => { G().itemType = ["journalArticle"]; }],
        ["itemTypeEXCL", () => { G().itemTypeExclude = ["journalArticle"]; }],
        ["hasURL", () => { G().hasURL = true; }],
        ["hasURL FALSE", () => { G().hasURL = false; }],
        ["hasAttachment", () => { G().hasAttachment = true; }],
        ["hasAttachment FALSE", () => { G().hasAttachment = false; }],
        ["hasDOI", () => { G().hasDOI = true; }],
        ["hasPMID", () => { G().hasPMID = true; }],
        ["hasPMCID", () => { G().hasPMCID = true; }],
        ["hasAbstract", () => { G().hasAbstract = true; }],
        ["inOtherLibrary", () => { G().inOtherLibrary = true; }],
        ["inOtherLibrary FALSE", () => { G().inOtherLibrary = false; }],
        ["annotationColor", () => { G().annotationColor = ["#ffd400"]; }],
        ["annotationColorEXCL", () => { G().annotationColorExclude = ["#ffd400"]; }],
        ["annotationType", () => { G().annotationType = ["highlight"]; }],
        ["annotationHasComment", () => { G().annotationHasComment = true; }],
        ["annotationHasComment FALSE", () => { G().annotationHasComment = false; }],
        ["fileType PDF", () => { G().attachmentFileType = ["attachmentPDF"]; }],
        ["fileType EPUB", () => { G().attachmentFileType = ["attachmentEPUB"]; }],
        ["fileType linkedFile", () => { G().attachmentFileType = ["attachmentLinkedFile"]; }],
        ["itemNote", () => { G().itemNote = true; }],
        ["standaloneNote", () => { G().standaloneNote = true; }],
        ["hasAnnotations", () => { G().hasAnnotations = true; }],
        ["hasAnnotations FALSE", () => { G().hasAnnotations = false; }],
        ["hasRelated", () => { G().hasRelated = true; }],
        ["hasLink", () => { G().hasLink = true; }],
        ["hasBookmarks", () => { G().hasBookmarks = true; }],
        ["hasTag", () => { G().hasTag = true; }],
        ["PDF + yellow", () => { G().attachmentFileType = ["attachmentPDF"];
            G().annotationColor = ["#ffd400"]; }],
        ["EPUB + highlight", () => { G().attachmentFileType = ["attachmentEPUB"];
            G().annotationType = ["highlight"]; }],
        ["itemType + colorEXCL", () => { G().itemType = ["journalArticle"];
            G().annotationColorExclude = ["#ffd400"]; }],
        ["itemTypeEXCL + color", () => { G().itemTypeExclude = ["book"];
            G().annotationColor = ["#ffd400"]; }],
        ["hasAttachment + fileType", () => { G().hasAttachment = true;
            G().attachmentFileType = ["attachmentPDF"]; }],
        ["hasAtt FALSE + otherLib", () => { G().hasAttachment = false;
            G().inOtherLibrary = true; }],
        ["multi-group OR (2)", () => { G().annotationColor = ["#ffd400"];
            lp._filterState.groups.push({ itemType: ["book"] }); }],
        ["multi-group OR (3)", () => { G().annotationColor = ["#ffd400"];
            lp._filterState.groups.push({ itemType: ["book"] });
            lp._filterState.groups.push({ hasDOI: true }); }],
        ["all five stacked", () => { G().inOtherLibrary = true; G().hasURL = true;
            G().itemType = ["journalArticle"]; G().annotationColor = ["#ffd400"];
            G().attachmentFileType = ["attachmentPDF"]; }],
        ["empty result", () => { G().publication = ["ZZZ-NO-SUCH-PUBLICATION"]; }],
        ["scope excludes annotations", () => { G().annotationColor = ["#ffd400"];
            G().quickSearchScope = { annotation: false, attachment: true, parent: true }; }],
    ];

    const R = {
        started: new Date().toISOString(),
        zotero: Zotero.version,
        weavero: null,
        results: [],
        status: "running",
        summary() {
            const fails = this.results.filter(r => !r.MATCH);
            return {
                status: this.status,
                zotero: this.zotero,
                weavero: this.weavero,
                ran: this.results.length,
                passed: this.results.filter(r => r.MATCH).length,
                buildEngaged: this.results.filter(r => r.build && r.build.engaged).length,
                // Paint data is only collected while the window is visible;
                // occluded runs legitimately report none (see paintRecorder).
                paintTiming: (() => {
                    const withPaint = this.results.filter(r => r.build
                        && r.build.lastPaintMs != null).length;
                    const visible = this.results.filter(r => r.build
                        && r.build.windowVisible).length;
                    return withPaint + "/" + this.results.length
                        + (visible ? "" : " (window occluded — paint suppressed by Gecko)");
                })(),
                failures: fails.map(f => ({
                    name: f.name,
                    cascade: f.cascade.rows + "/" + f.cascade.open,
                    build: f.build.rows + "/" + f.build.open,
                    bothEngagedFalse: !f.cascade.engaged && !f.build.engaged,
                })),
            };
        },
        /** Per-phase timings, slowest first by user-perceived paint time.
         *  Use this to see WHERE a slow case spends its time; use
         *  `summary()` for pass/fail. */
        timings(mode = "build") {
            return this.results
                .map(r => {
                    const m = r[mode] || {};
                    const g = m.ring || {};
                    return {
                        name: r.name,
                        lastPaintMs: m.lastPaintMs,   // user-perceived
                        syncMs: m.syncMs,
                        ringTotal: g.total,
                        setup: g.setup, pass1: g.pass1, pass2: g.pass2,
                        gatePatch: g.gatePatch, invalidate: g.invalidate,
                        invSkipped: g.invSkipped,
                        rows: m.rows, open: m.open, paints: m.paints,
                    };
                })
                .sort((a, b) => (b.lastPaintMs || 0) - (a.lastPaintMs || 0));
        },
        /** Weavero vs Zotero's own engine, for the cases with an exact
         *  native equivalent. Same view, same clock, same snapshot
         *  function, both from a collapsed baseline — the like-for-like
         *  comparison that ad-hoc measurements failed to provide. */
        vsNative() {
            return this.results
                .filter(r => r.native && r.native.rows != null)
                .map(r => {
                    const b = r.build || {};
                    const nv = r.native;
                    const sameRows = b.idsHash === nv.idsHash;
                    const sameOpen = b.openHash === nv.openHash;
                    const sameSel = b.selHash === nv.selHash;
                    const known = EXPECTED_DIVERGENCE[r.name] || {};
                    // An UNEXPLAINED disagreement is the thing to look at;
                    // documented semantic differences are not failures.
                    const unexplained = (!sameRows && !known.rows)
                        || (!sameOpen && !known.open)
                        || (!sameSel && !known.sel);
                    return {
                        name: r.name,
                        // EQUIVALENT only if all three user-visible states agree
                        EQUIVALENT: sameRows && sameOpen && sameSel,
                        UNEXPLAINED: unexplained,
                        knownDivergence: Object.keys(known).length ? known : undefined,
                        sameRows, sameOpen, sameSel,
                        weavero: b.rows + "/" + b.open + " sel:" + b.selCount,
                        native: nv.rows + "/" + nv.open + " sel:" + nv.selCount,
                        weaveroSyncMs: b.syncMs,
                        nativeSyncMs: nv.syncMs,
                        // Only meaningful when EQUIVALENT — otherwise the
                        // two engines did different work.
                        ratio: (b.syncMs && nv.syncMs)
                            ? +(nv.syncMs / b.syncMs).toFixed(2) : null,
                    };
                });
        },
        /** The engine-comparison guard rail: never mix fields. */
        note: "Compare engines with vsNative() (same clock, same view). "
            + "ringTotal excludes paint; stableMs includes ~600ms polling padding.",
    };
    Zotero._wvMatrix = R;

    /* NATIVE COMPARISON — the same question asked of Zotero's own engine.
     * `itemsView.setFilter('advanced-search', search)` applies a
     * Zotero.Search to the CURRENT view in place (the channel the
     * advanced-search pane uses), so it is genuinely comparable: same
     * view, same starting expansion, same clock, same snapshot function.
     * Only cases whose chips have an exact native equivalent are
     * compared; the rest report `native: "inexpressible"` rather than a
     * misleading number. Cache warmth is matched by running native from
     * the same collapsed baseline as the Weavero modes. */
    const NATIVE_EQUIV = {
        "itemType": () => [["resultLevel", "item", null], ["itemType", "is", "journalArticle"]],
        "hasURL": () => [["resultLevel", "item", null], ["url", "isNotEmpty", null]],
        "annotationColor": () => [["resultLevel", "annotation", null],
            ["annotationColor", "is", "#ffd400"]],
        // annotationType stores an INTEGER in itemAnnotations.type, so the
        // condition needs the constant, not the name. Passing "highlight"
        // matched 0 rows and looked like a Weavero defect until traced
        // (2026-08-07); with the constant native returns 1658, exactly the
        // raw DB count.
        "annotationType": () => [["resultLevel", "annotation", null],
            ["annotationType", "is", Zotero.Annotations.ANNOTATION_TYPE_HIGHLIGHT]],
        // fileTypeID alone matches any attachment DECLARING a PDF content
        // type, including linkMode 3 web links — 111 of them here, which
        // looked like an irreducible semantic gap until
        // attachmentStorageType turned out to express exactly the missing
        // half. It maps to itemAttachments.linkMode and takes
        // 'storedFile' | 'linkedFile' | 'webLink' (an integer throws, and
        // the error message names the accepted values). With `isNot
        // webLink` the two engines match EXACTLY: 18037 = 18037 across all
        // 22019 attachments, 0 either side. 2026-08-07.
        "fileType PDF": () => [["resultLevel", "attachment", null],
            ["joinMode", "all", null],
            ["fileTypeID", "is", Zotero.FileTypes.getID("pdf")],
            ["attachmentStorageType", "isNot", "webLink"]],
    };

    /* KNOWN, INTENTIONAL DIVERGENCES from native. Recorded so they are not
     * re-investigated every run, and so a NEW disagreement stands out.
     * Each was traced to a deliberate Weavero semantic, not a defect. */
    const EXPECTED_DIVERGENCE = {
        // ROWS are NOT listed here any more: the 111-row gap was my
        // incomplete translation, not a semantic difference — see
        // NATIVE_EQUIV above. Only genuinely irreducible differences
        // belong in this table, or it hides real regressions.
        "fileType PDF": {
            sel: "Weavero restricts the selection to PRIMARY (matching) rows, "
                + "so top-level items seeded before an attachment-level filter "
                + "are deselected; native keeps any still-visible row selected. "
                + "This is a display-layer policy, not a matching one — no "
                + "search condition can reproduce it.",
        },
    };

    async function runNative(name, seedIDs) {
        const build = NATIVE_EQUIV[name];
        if (!build) return { native: "inexpressible" };
        try {
            const s = new Zotero.Search();
            s.libraryID = Zotero.Libraries.userLibraryID;
            for (const [c, op, v] of build()) s.addCondition(c, op, v);
            try { rp().collapseAllRows(); } catch (e) {}
            await stable();
            // Same starting selection as the Weavero runs, so the
            // selection comparison is meaningful rather than incidental.
            if (seedIDs && seedIDs.length) {
                try { zp.itemsView.selectItems(seedIDs); } catch (e) {}
                await sleep(500);
            }
            const paint = paintRecorder();
            const t0 = win.performance.now();
            await zp.itemsView.setFilter("advanced-search", s);
            const syncMs = Math.round(win.performance.now() - t0);
            await paint.waitQuiet();
            const painted = paint.stop();
            const snap = snapshot();
            await zp.itemsView.setFilter("advanced-search", null);
            await sleep(SETTLE);
            return Object.assign({ syncMs, lastPaintMs: painted.lastPaintMs,
                paints: painted.paints }, snap);
        }
        catch (e) { return { native: "error: " + e }; }
    }

    (async function run() {
        const prevBuildPref = Zotero.Prefs.get("weavero.filterBuildMode");
        const startedSql = Zotero.Date.dateToSQL(new Date(), true);
        await syncControl.disable();
        try {
            const { AddonManager } = ChromeUtils.importESModule(
                "resource://gre/modules/AddonManager.sys.mjs");
            R.weavero = (await AddonManager.getAddonByID("weavero@mjthoraval")).version;
            await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await zp.itemsView.waitForLoad();
            await search("");                    // rule 3

            for (const [name, apply] of CASES) {
                const rec = { name };
                for (const mode of ["cascade", "build"]) {
                    Zotero.Prefs.set("weavero.filterBuildMode", mode === "build");
                    try { rp().collapseAllRows(); } catch (e) {}
                    await stable();
                    reset();
                    rec.seeded = await seedSelection();   // identical start state
                    apply();
                    await sleep(SETTLE);          // rule 1
                    Zotero._wvFilterPerf = [];
                    const paint = paintRecorder();
                    const tSync0 = win.performance.now();
                    lp._applyItemsListFilter({ cascade: true });
                    const syncMs = Math.round(win.performance.now() - tSync0);
                    const quiet = await paint.waitQuiet();      // visual settle
                    const painted = paint.stop();
                    const tStable0 = win.performance.now();
                    await stable();                             // row-count settle
                    const stableMs = Math.round(win.performance.now() - tStable0);
                    const ring = (Zotero._wvFilterPerf || [])[0] || {};
                    rec[mode] = Object.assign({
                        engaged: !!ring.buildMode,
                        // full per-phase breakdown, not just the total
                        ring: {
                            total: ring.total, setup: ring.setup, pass1: ring.pass1,
                            pass2: ring.pass2, gatePatch: ring.gatePatch,
                            invalidate: ring.invalidate, rows: ring.rows,
                            invSkipped: !!ring.invSkipped,
                            cascadeCapped: ring.cascadeCapped || false,
                        },
                        syncMs,
                        firstPaintMs: painted.firstPaintMs,
                        lastPaintMs: painted.lastPaintMs,   // closest to user-perceived
                        paints: painted.paints,
                        windowVisible: windowVisible(),     // why paints may be 0
                        quiet,
                        stableMs,
                    }, snapshot());
                    reset();
                    await sleep(SETTLE);
                    lp._applyItemsListFilter({ cascade: true });
                    await sleep(300);
                }
                rec.MATCH = rec.cascade.idsHash === rec.build.idsHash
                    && rec.cascade.openHash === rec.build.openHash
                    && rec.cascade.selHash === rec.build.selHash;     // rule 4
                rec.native = await runNative(name, rec.seeded);   // same clock + same seed
                R.results.push(rec);
            }
            R.status = "done";
        }
        catch (e) {
            R.status = "error: " + e;
        }
        finally {
            if (prevBuildPref === undefined) {
                Zotero.Prefs.clear("weavero.filterBuildMode");
            }
            else {
                Zotero.Prefs.set("weavero.filterBuildMode", prevBuildPref);
            }
            reset();
            try { lp._applyItemsListFilter({ cascade: true }); } catch (e) {}
            try { await zp.itemsView.setFilter("advanced-search", null); } catch (e) {}
            syncControl.restore();
            // Certify that nothing wrote to the library during the run;
            // a non-zero count means cache-nulling notifier traffic could
            // have made some cases cold, so timings are suspect.
            R.itemsChangedDuringRun = await syncControl.itemsChangedSince(startedSql);
            R.autoSyncRestoredTo = Zotero.Prefs.get("sync.autoSync");
        }
    })();

    return "matrix running — read Zotero._wvMatrix.summary()";
})();
