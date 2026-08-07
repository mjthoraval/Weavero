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

    // rule 4 — rows AND open containers
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
        return { rows: ids.length, idsHash: fnv(ids), open: open.length, openHash: fnv(open) };
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
        /** The engine-comparison guard rail: never mix fields. */
        note: "Compare engines with lastPaintMs only, matched cache warmth. "
            + "ringTotal excludes paint; stableMs includes ~600ms polling padding.",
    };
    Zotero._wvMatrix = R;

    (async function run() {
        const prevBuildPref = Zotero.Prefs.get("weavero.filterBuildMode");
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
                        quiet,
                        stableMs,
                    }, snapshot());
                    reset();
                    await sleep(SETTLE);
                    lp._applyItemsListFilter({ cascade: true });
                    await sleep(300);
                }
                rec.MATCH = rec.cascade.idsHash === rec.build.idsHash
                    && rec.cascade.openHash === rec.build.openHash;   // rule 4
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
        }
    })();

    return "matrix running — read Zotero._wvMatrix.summary()";
})();
