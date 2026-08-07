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
                    lp._applyItemsListFilter({ cascade: true });
                    await stable();
                    await sleep(400);
                    const ring = (Zotero._wvFilterPerf || [])[0] || {};
                    rec[mode] = Object.assign(
                        { engaged: !!ring.buildMode, ms: ring.total }, snapshot());
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
