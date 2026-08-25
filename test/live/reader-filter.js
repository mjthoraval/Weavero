/* Weavero — live READER annotation-filter suite: PDF, EPUB and snapshot.
 *
 * Load lib/harness.js first (run-all.js does). Results in
 * `Zotero._wvReaderFilter`; read with
 *     JSON.stringify(Zotero._wvReaderFilter.summary())
 *
 * WHY THIS EXISTS (2026-08-25, test-architecture phase 2). The reader
 * filter's only coverage was the temp-profile spec (test/reader-filter.spec.js)
 * with three fixture annotations on a PDF — while its worst regression
 * (beta.16 removing `hiddenIDs`: every Weavero dim silently no-oping) was
 * only observable LIVE, its hide channel just changed under us again (beta.2
 * made unsetAnnotations async), and its interplay with an ACTIVE items-list
 * filter was tested nowhere.
 *
 * ALL THREE VIEW FAMILIES, per the standing parity rule (2026-08-24: "check a
 * reader feature against all three view types before calling it done"). The
 * filter's machinery is view-agnostic by design — the hide channel is the
 * chrome-side set/unsetAnnotations wrapper and the manager model exists on
 * DOM views too (verified live on an EPUB before writing this) — so each
 * family runs the same case block, and a family with no annotated document in
 * the library SKIPS as an observation.
 *
 * READ-ONLY by design (the default-profile rule — volume runs happen on the
 * real library, so nothing here may write): it filters whatever annotations
 * each target document already has and certifies EXACT restore. Dimensions
 * whose fixture would be trivial on a target (one colour, no comments...)
 * SKIP as observations, not failures — fixture power is reported, never
 * faked.
 *
 * THE ORACLE: the reader's own visibility model (annotation-manager entries
 * not flagged `_hidden`, Xrays waived) compared against sets computed from
 * the ANNOTATION ITEMS — always relative to the INITIAL visible set, so a
 * pre-existing native sidebar filter (colour/tag includes ride Zotero's own
 * channel by design) cannot poison the expectations.
 */
(function () {
    const LH = Zotero._wvLH;
    if (!LH) throw new Error("load test/live/lib/harness.js first (Zotero._wvLH missing)");
    const H = LH.make();
    const { win, lp, sleep, syncControl } = H;

    const { R, check, observe } = H.mkReport("reader-filter");
    Zotero._wvReaderFilter = R;

    const FAMILIES = [
        { type: "pdf", contentType: "application/pdf" },
        { type: "epub", contentType: "application/epub+zip" },
        { type: "snapshot", contentType: "text/html" },
    ];

    const keysOf = (arr) => arr.map(String).sort();
    const diff = (got, want) => ({
        got: got.length, want: want.length,
        missing: want.filter(k => !got.includes(k)).slice(0, 8),
        extra: got.filter(k => !want.includes(k)).slice(0, 8),
    });
    const sameSet = (got, want) => got.length === want.length
        && got.every((k, i) => k === want[i]);

    function visibleKeys(reader) {
        const am = reader && reader._internalReader
            && reader._internalReader._annotationManager;
        if (!am) return null;
        const w = Components.utils.waiveXrays(am);
        return keysOf((w._annotations || []).filter(a => !a._hidden).map(a => a.id));
    }

    async function applyAndSettle(reader, mutate) {
        const st = lp._wvReaderFilterState(reader);
        mutate(st);
        await lp._wvApplyReaderFilter(reader);
        await sleep(400);   // manager render pass (same settle the spec uses)
    }

    /** The full case block for ONE reader. Check names carry the family tag
     *  so a red row says WHICH view regressed. */
    async function runFor(fam, reader) {
        const tag = "[" + fam.type + "] ";
        const att = Zotero.Items.get(reader.itemID);

        const t1 = Date.now();
        let initial = null;
        while (Date.now() - t1 < 20000) {
            initial = visibleKeys(reader);
            if (initial && initial.length) break;
            await sleep(400);
        }
        if (!initial || !initial.length) {
            check(tag + "annotations become visible in the manager", false,
                { visible: initial ? initial.length : null });
            return;
        }

        const anns = att.getAnnotations()
            .map(a => ({
                key: String(a.key), type: a.annotationType,
                color: (a.annotationColor || "").toLowerCase(),
                hasComment: !!(a.annotationComment && a.annotationComment.trim()),
            }))
            .filter(a => initial.includes(a.key));
        observe(tag + "fixture", {
            document: att.getDisplayTitle().slice(0, 40),
            visible: initial.length, ofItemAnnotations: att.getAnnotations().length,
            types: [...new Set(anns.map(a => a.type))],
            colors: [...new Set(anns.map(a => a.color))].length,
            withComment: anns.filter(a => a.hasComment).length,
        });

        const st0 = lp._wvReaderFilterState(reader);
        let stSnapshot = { types: [...st0.types], typesExcl: [...st0.typesExcl],
            colorsExcl: [...st0.colorsExcl], hasComment: st0.hasComment };
        const restoreState = async () => {
            await applyAndSettle(reader, s => {
                s.types = [...stSnapshot.types]; s.typesExcl = [...stSnapshot.typesExcl];
                s.colorsExcl = [...stSnapshot.colorsExcl]; s.hasComment = stSnapshot.hasComment;
            });
        };

        try {
            // ---- type include / exclude ----
            const byType = {};
            for (const a of anns) (byType[a.type] = byType[a.type] || []).push(a.key);
            const typeNames = Object.keys(byType).sort((x, y) => byType[y].length - byType[x].length);
            if (typeNames.length >= 2) {
                const t = typeNames[0];
                await applyAndSettle(reader, s => { s.types = [t]; s.typesExcl = []; });
                const got = visibleKeys(reader), want = keysOf(byType[t]);
                check(tag + "type INCLUDE (" + t + ") shows exactly that type",
                    sameSet(got, want), diff(got, want));

                await applyAndSettle(reader, s => { s.types = []; s.typesExcl = [t]; });
                const got2 = visibleKeys(reader);
                const want2 = keysOf(anns.filter(a => a.type !== t).map(a => a.key));
                check(tag + "type EXCLUDE (" + t + ") shows exactly the complement",
                    sameSet(got2, want2), diff(got2, want2));
                await applyAndSettle(reader, s => { s.typesExcl = []; });
            } else {
                observe(tag + "type dims SKIPPED", { reason: "one annotation type", types: typeNames });
            }

            // ---- colour EXCLUDE (the hiddenIDs-era dimension) ----
            const colors = [...new Set(anns.map(a => a.color))].filter(Boolean);
            if (colors.length >= 2) {
                const c = colors[0];
                await applyAndSettle(reader, s => { s.colorsExcl = [c]; });
                const got = visibleKeys(reader);
                const want = keysOf(anns.filter(a => a.color !== c).map(a => a.key));
                check(tag + "colour EXCLUDE hides exactly that colour",
                    sameSet(got, want), diff(got, want));
                await applyAndSettle(reader, s => { s.colorsExcl = []; });
            } else {
                observe(tag + "colour EXCLUDE SKIPPED", { reason: "one colour" });
            }

            // ---- has-comment ----
            const withC = anns.filter(a => a.hasComment).map(a => a.key);
            if (withC.length && withC.length < anns.length) {
                await applyAndSettle(reader, s => { s.hasComment = true; });
                const got = visibleKeys(reader), want = keysOf(withC);
                check(tag + "has-comment shows exactly the commented ones",
                    sameSet(got, want), diff(got, want));
                await applyAndSettle(reader, s => { s.hasComment = null; });
            } else {
                observe(tag + "has-comment SKIPPED", { withComment: withC.length, of: anns.length });
            }

            // ---- the hide channel's resolution contract (beta.2) ----
            // Works on every family: it is the chrome-side wrapper, and the
            // awaited call must resolve with the annotation ALREADY absent
            // (0.18.7-dev.51 fix).
            const probeKey = initial[0];
            const res = await lp._wvReaderSyncHidden(reader, [probeKey]);
            const absentAtResolution = !(visibleKeys(reader) || []).includes(probeKey);
            check(tag + "hide-only sync resolves with the annotation already hidden",
                res && res.hid === 1 && absentAtResolution,
                { res, absentAtResolution });
            await lp._wvReaderSyncHidden(reader, []);
            await sleep(300);

            // ---- interplay: an ACTIVE items-list filter must not disturb
            //      the reader filter ----
            if (anns.length >= 2) {
                const half = keysOf(anns.slice(0, Math.ceil(anns.length / 2)).map(a => a.key));
                await lp._wvReaderSyncHidden(reader, half);
                await sleep(300);
                const before = visibleKeys(reader);
                await H.applyChip(g => { g.itemType = ["journalArticle"]; });
                const during = visibleKeys(reader);
                check(tag + "items-list chip APPLY leaves the reader filter intact",
                    sameSet(during, before), diff(during, before));
                await H.clearChip();
                const after = visibleKeys(reader);
                check(tag + "items-list chip CLEAR leaves the reader filter intact",
                    sameSet(after, before), diff(after, before));
                await lp._wvReaderSyncHidden(reader, []);
                await sleep(300);
            } else {
                observe(tag + "interplay SKIPPED", { reason: "needs >= 2 annotations" });
            }

            // ---- exact restore ----
            await restoreState();
            stSnapshot = null;
            const fin = visibleKeys(reader);
            check(tag + "EXACT restore: final visible set equals the initial one",
                sameSet(fin, initial), diff(fin, initial));
        } finally {
            if (stSnapshot) { try { await restoreState(); } catch (e) {} }
        }
    }

    (async () => {
        const startedSql = Zotero.Date.dateToSQL(new Date(), true);
        await syncControl.disable();
        const opened = [];
        try {
            for (const fam of FAMILIES) {
                // Prefer an already-open annotated reader of this family.
                let reader = (Zotero.Reader._readers || []).find(r => {
                    try {
                        if (r._type !== fam.type || !r._internalReader) return false;
                        const it = Zotero.Items.get(r.itemID);
                        return it && it.getAnnotations().length >= 1;
                    } catch (e) { return false; }
                }) || null;
                if (!reader) {
                    const attID = await Zotero.DB.valueQueryAsync(
                        "SELECT ia.itemID FROM itemAttachments ia "
                        + "JOIN itemAnnotations ann ON ann.parentItemID = ia.itemID "
                        + "JOIN items i ON i.itemID = ia.itemID "
                        + "WHERE i.libraryID = ? AND ia.contentType = ? "
                        + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems) "
                        + "GROUP BY ia.itemID ORDER BY COUNT(*) DESC LIMIT 1",
                        [Zotero.Libraries.userLibraryID, fam.contentType]);
                    if (!attID) {
                        observe("[" + fam.type + "] SKIPPED",
                            { reason: "no annotated " + fam.type + " in this library" });
                        continue;
                    }
                    await Zotero.Reader.open(attID, null, { allowDuplicate: false });
                    const t0 = Date.now();
                    while (Date.now() - t0 < 30000) {
                        reader = (Zotero.Reader._readers || []).find(r => r.itemID === attID
                            && r._internalReader && r._iframeWindow);
                        if (reader && visibleKeys(reader) !== null) break;
                        await sleep(400);
                    }
                    if (!reader) {
                        check("[" + fam.type + "] opened reader becomes ready", false, { attID });
                        continue;
                    }
                    opened.push(reader);
                }
                await runFor(fam, reader);
            }
            R.status = "done";
        } catch (e) {
            R.status = "error: " + e;
        } finally {
            for (const r of opened) { try { win.Zotero_Tabs.close(r.tabID); } catch (e) {} }
            syncControl.restore();
            R.itemsChangedDuringRun = await syncControl.itemsChangedSince(startedSql);
            if (R.status === "running") R.status = "done";
        }
    })();

    return "reader-filter suite running — read Zotero._wvReaderFilter.summary()";
})();
