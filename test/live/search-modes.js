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
    // Shared machinery: test/live/lib/harness.js (load it first).
    const LH = Zotero._wvLH;
    if (!LH) throw new Error("load test/live/lib/harness.js first (Zotero._wvLH missing)");
    const H = LH.make();
    const { win, zp, lp, sleep, rp, G, syncControl, faSettle, reset } = H;

    const TERM = "drop";
    const CHIP = "journalArticle";
    // The scope menu's modes, read from Zotero's own quick-search element
    // (`_searchModes`, the object its menu is built from) so a mode added
    // upstream is tested the day it appears; the 10.0.2-beta.9 list is the
    // fallback. NOTE: `quicksearch-titleCreatorYearNote` is a search
    // CONDITION (the citation dialog's), not a scope-menu mode -- it is not
    // in this list on purpose (checked against the source 2026-09-10).
    const qsEl = zp.document.getElementById("zotero-tb-search");
    const MODE_KEYS = (qsEl && qsEl._searchModes && Object.keys(qsEl._searchModes).length)
        ? Object.keys(qsEl._searchModes)
        : ["titleCreatorYear", "fields", "everything"];
    const MODES = MODE_KEYS.map(key => ({ key, cond: "quicksearch-" + key }));

    // This suite's historical paddings/guards, passed explicitly.
    const TUNE = { guard: 250 };
    const stable = () => H.stable(TUNE);

    const { R, check, observe } = H.mkReport("search-modes");
    Zotero._wvModes = R;


    /* dev.15 made the last word ASYNCHRONOUS by design: after a search
     * settles, the final-apply scheduler waits for quiescence and then
     * re-applies once. A snapshot taken before that pass sees the
     * pre-final state and reports a phantom miss (observed: chip-first
     * `everything` read 11,107 here while a direct check with a longer
     * wait held 11,108 stably). Wait for the scheduler's tick loop to go
     * idle rather than sleeping blind. */

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

    const clearChip = () => H.clearChip({ post: 500, stable: TUNE });
    const applyChip = () => H.applyChip(g => { g.itemType = [CHIP]; },
        { post: 500, stable: TUNE });

    const search = (text) => H.search(text, { pre: 600, post: 500, stable: TUNE });

    const advSearch = (x) => H.advSearch(x, { post: 600, stable: TUNE });

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

            // ---- SCOPE MENU switch under an active search + chip ----
            // The loop above starts every mode from a clean view. A user
            // changes scope WITH a term and a chip live, through the menu
            // next to the box: Zotero's handler sets the pref, updates the
            // mode and re-fires the search. The view must land on the NEW
            // mode's ground truth for every ordered pair -- the transition
            // is where a stale-generation bug would show (2026-09-10).
            // Driven through the menuitem's `doCommand()`, the trusted
            // path: synthetic clicks on XUL menus are ignored.
            R.modes = MODE_KEYS;
            const gtByMode = {};
            for (const m of MODES) gtByMode[m.key] = await groundTruth(m.cond);
            const menuItem = (key) => qsEl && qsEl.searchModePopup
                && qsEl.searchModePopup.querySelector('menuitem[value="' + key + '"]');
            check("scope menu exposes every mode", MODES.every(m => !!menuItem(m.key)),
                { modes: MODE_KEYS, missing: MODES.filter(m => !menuItem(m.key)).map(m => m.key) });
            for (const from of MODES) {
                for (const to of MODES) {
                    if (from.key === to.key) continue;
                    const tag = from.key + " → " + to.key + " via the scope menu";
                    await search(""); await clearChip();
                    try { rp().collapseAllRows(); } catch (e) {}
                    await stable();
                    Zotero.Prefs.set("search.quicksearch-mode", from.key);
                    await sleep(400);
                    await search(TERM);
                    await applyChip();
                    await faSettle();
                    const before = topIDs();
                    const mi = menuItem(to.key);
                    if (!mi) { check(tag + ": menu item present", false, {}); continue; }
                    mi.doCommand();
                    await sleep(600);
                    await faSettle();
                    await stable();
                    const got = topIDs();
                    const d = diff(got, gtByMode[to.key]);
                    check(tag + ": pref switched",
                        Zotero.Prefs.get("search.quicksearch-mode") === to.key);
                    check(tag + ": shows nothing spurious", d.extra === 0, d);
                    check(tag + ": matches the new mode's ground truth",
                        d.missing === 0 && d.extra === 0, d);
                    observe(tag, { before: before.size, after: got.size, expected: gtByMode[to.key].size });
                }
            }

            // ---- WEAVERO "APPLY TO" scope x native mode -------------
            // The dropdown next to the box (Parent / Attachment / Note /
            // Annotation) drops matched rows of a kind toggled off; a row
            // survives when it, an ancestor or a descendant of an
            // in-scope kind is in Zotero's strict match set, and ancestors
            // of survivors stay as context. Oracle from the DB: a top-level
            // row is expected iff some row in its tree of an in-scope kind
            // matches `quicksearch-<mode>`; with the chip, only trees whose
            // top is a regular item of the chip's type. State is written the
            // way the dropdown's checkbox handler writes it (scope key +
            // cascade apply). MJT 2026-09-10: "the 4 scopes from the Weavero
            // plugin, and their interactions with the 3 native scopes".
            const SCOPES = {
                "all four":        { parent: true,  attachment: true,  note: true,  annotation: true },
                "parent only":     { parent: true,  attachment: false, note: false, annotation: false },
                "attachment only": { parent: false, attachment: true,  note: false, annotation: false },
                "note only":       { parent: false, attachment: false, note: true,  annotation: false },
                "annotation only": { parent: false, attachment: false, note: false, annotation: true },
                "children only":   { parent: false, attachment: true,  note: true,  annotation: true },
                // Only Notes off: the one shape that did NOT activate the
                // group before dev.34 (the four-type split forgot `note`
                // in _isGroupActive), so the dropdown silently did nothing.
                "all but note":    { parent: true,  attachment: true,  note: false, annotation: true },
            };
            // Chip variants on ONE mode only: every case costs ~12 s and the
            // first run overran the runner's cap (2026-09-10).
            const WITH_CHIP = ["parent only", "annotation only", "all but note"];
            const CHIP_MODE = "fields";
            const kindOf = (it) => it.isRegularItem() ? "parent"
                : it.isAnnotation() ? "annotation"
                : it.isNote() ? "note"
                : it.isAttachment() ? "attachment" : null;
            const topOf = (it) => { let p = it; while (p && p.parentItemID) p = Zotero.Items.get(p.parentItemID); return p; };
            async function scopedGroundTruth(cond, scope, chip) {
                const s = new Zotero.Search();
                s.libraryID = Zotero.Libraries.userLibraryID;
                s.addCondition(cond, "contains", TERM);
                const ids = await s.search();
                const items = await Zotero.Items.getAsync(ids);
                await Zotero.Items.loadDataTypes(items);
                const gt = new Set();
                for (const it of items) {
                    if (!it) continue;
                    const k = kindOf(it);
                    if (!k || scope[k] === false) continue;
                    const top = topOf(it);
                    if (!top) continue;
                    if (chip && !(top.isRegularItem() && top.itemType === CHIP)) continue;
                    gt.add(top.id);
                }
                return gt;
            }
            R.applyToScopes = Object.keys(SCOPES);
            for (const mode of MODES) {
                Zotero.Prefs.set("search.quicksearch-mode", mode.key);
                await sleep(400);
                for (const [name, scope] of Object.entries(SCOPES)) {
                    for (const chip of (WITH_CHIP.includes(name) && mode.key === CHIP_MODE ? [false, true] : [false])) {
                        const tag = mode.key + " × Apply to " + name + (chip ? " + chip" : "");
                        const gt = await scopedGroundTruth(mode.cond, scope, chip);
                        await search(""); await clearChip();
                        try { rp().collapseAllRows(); } catch (e) {}
                        await stable();
                        await search(TERM);
                        await applyChip(g => {
                            g.quickSearchScope = Object.assign({}, scope);
                            if (chip) g.itemType = [CHIP];
                        });
                        await faSettle();
                        const got = topIDs();
                        const d = diff(got, gt);
                        check(tag + ": shows nothing spurious", d.extra === 0, d);
                        check(tag + ": matches ground truth", d.missing === 0 && d.extra === 0, d);
                        observe(tag, { got: got.size, expected: gt.size,
                            scopeButtonMarked: (() => { try { const b = zp.document.querySelector(".wv-qs-scope-btn"); return b ? b.getAttribute("data-modified") : null; } catch (e) { return "err"; } })() });
                    }
                }
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
