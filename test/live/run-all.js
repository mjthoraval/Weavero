/* Weavero — live-suite runner: harness + suites, sequentially, ONE report.
 *
 * Load into a running Zotero (bridge, or Tools -> Developer -> Run
 * JavaScript). Edit ROOT if your checkout lives elsewhere, or predefine
 * `Zotero._wvLiveRoot` before loading. Progress in `Zotero._wvRunAll`;
 * when done, the combined report is written to
 *
 *     <data dir>/weavero/live-report.json   (+ live-report.md digest)
 *
 * Profiles ("core" default):
 *     core = search-modes, interactions, multi-window   (~5-8 min)
 *     full = core + filter-matrix                       (~10-20 min)
 * Predefine `Zotero._wvLiveProfile = "full"` to pick.
 *
 * WHY a runner: the suites are self-reporting one-shot files, and running
 * them by hand means loading five files in the right order and polling
 * five different globals — every step of which has been done wrong at
 * least once. The runner owns the order (harness FIRST), the quicksearch
 * -mode etiquette, the per-suite status polling, and the report, so a
 * "fast correctness path" is one paste instead of a checklist.
 *
 * The runner does not interpret results beyond pass-counts: each suite's
 * summary() stays the authority on what its numbers mean.
 */
(function () {
    const ROOT = (typeof Zotero._wvLiveRoot === "string" && Zotero._wvLiveRoot)
        || "D:\\MyData\\Code\\Zotero\\Weavero\\GitHub\\test\\live\\";
    const PROFILE = Zotero._wvLiveProfile === "full" ? "full" : "core";

    const SUITES = [
        { file: "search-modes.js", global: "_wvModes", capMs: 8 * 60000 },
        { file: "interactions.js", global: "_wvInteract", capMs: 8 * 60000 },
        { file: "multi-window.js", global: "_wvMultiWin", capMs: 6 * 60000 },
    ];
    if (PROFILE === "full") {
        SUITES.push({ file: "filter-matrix.js", global: "_wvMatrix", capMs: 25 * 60000 });
    }

    const win = Zotero.getMainWindows()[0];
    const sleep = ms => new Promise(r => win.setTimeout(r, ms));

    const RUN = {
        started: new Date().toISOString(),
        profile: PROFILE,
        status: "running",
        current: null,
        suites: [],
    };
    Zotero._wvRunAll = RUN;

    (async () => {
        try {
            // Etiquette: a polluted quicksearch mode produces phantom
            // failures (test rules); pin it, restore at the end.
            const prevMode = Zotero.Prefs.get("search.quicksearch-mode", true);
            Zotero.Prefs.set("search.quicksearch-mode", "fields", true);

            // Harness FIRST — every suite fails fast without it.
            const hText = await Zotero.File.getContentsAsync(ROOT + "lib\\harness.js");
            new Function(hText)();

            for (const s of SUITES) {
                RUN.current = s.file;
                delete Zotero[s.global];
                const entry = { file: s.file, startedAt: new Date().toISOString() };
                RUN.suites.push(entry);
                try {
                    const text = await Zotero.File.getContentsAsync(ROOT + s.file);
                    new Function(text)();
                    const t0 = Date.now();
                    while (Zotero[s.global] && Zotero[s.global].status === "running"
                        && Date.now() - t0 < s.capMs) {
                        await sleep(2000);
                    }
                    // Let the suite's finally (restore + certification) land
                    // before summarising — status flips to "done" BEFORE the
                    // finally runs, and the cleanup is stability-gated, so a
                    // fixed 2.5s read interactions' certification as missing
                    // (observed on the first full run). Wait for the
                    // itemsChangedDuringRun stamp, capped.
                    const R = Zotero[s.global];
                    const tCert = Date.now();
                    while (R && R.status === "done"
                        && R.itemsChangedDuringRun === undefined
                        && Date.now() - tCert < 45000) {
                        await sleep(1500);
                    }
                    entry.summary = R ? R.summary() : { status: "no result global" };
                    entry.durationMs = Date.now() - t0;
                    entry.timedOut = !!(R && R.status === "running");
                } catch (e) {
                    entry.summary = { status: "launch error: " + e };
                }
            }

            Zotero.Prefs.set("search.quicksearch-mode", prevMode || "fields", true);

            // ---- combined report ----
            const ok = (e) => e.summary && (e.summary.status === "done")
                && (e.summary.failures ? e.summary.failures.length === 0 : true)
                && !e.timedOut;
            RUN.finished = new Date().toISOString();
            RUN.zotero = Zotero.version;
            RUN.weavero = (Zotero.Weavero && Zotero.Weavero.version) || null;
            RUN.green = RUN.suites.every(e => ok(e));
            RUN.status = "done";
            RUN.current = null;

            try {
                const dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero");
                await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                const jsonPath = PathUtils.join(dir, "live-report.json");
                await Zotero.File.putContentsAsync(jsonPath,
                    JSON.stringify(RUN, null, 1));
                RUN.reportPath = jsonPath;

                const lines = [
                    "# Weavero live run — " + RUN.started,
                    "",
                    "Zotero " + RUN.zotero + " · Weavero " + RUN.weavero
                        + " · profile " + PROFILE + " · "
                        + (RUN.green ? "**GREEN**" : "**FAILURES — see JSON**"),
                    "",
                    "| suite | ran | passed | trustworthy | failures |",
                    "|---|---|---|---|---|",
                ];
                for (const e of RUN.suites) {
                    const s = e.summary || {};
                    lines.push("| " + e.file + " | " + (s.ran != null ? s.ran : "—")
                        + " | " + (s.passed != null ? s.passed : "—")
                        + " | " + (s.trustworthy == null ? "n/a" : s.trustworthy)
                        + " | " + ((s.failures && s.failures.length)
                            ? s.failures.map(f => f.name).join("; ") : "none")
                        + " |");
                }
                const mdPath = PathUtils.join(dir, "live-report.md");
                await Zotero.File.putContentsAsync(mdPath, lines.join("\n") + "\n");
                RUN.digestPath = mdPath;
            } catch (e) { RUN.reportError = String(e); }
        } catch (e) {
            RUN.status = "error: " + e;
        }
    })();

    return "run-all (" + PROFILE + ") running — read Zotero._wvRunAll";
})();
