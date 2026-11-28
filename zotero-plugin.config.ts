import { defineConfig } from "zotero-plugin-scaffold";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { parseShard, planShards, specTimes } from "./scripts/spec-shard.mjs";

/** A hash of a source file's CODE: whole-line comments (`//` lines and block
 *  comments starting a line) dropped, whitespace runs collapsed. The Cited by
 *  index's fingerprints take the matcher's and the list reader's modules whole
 *  (cited-by.ts wvCbMatchFp / wvCbListFp): a change in a helper either calls
 *  re-reads or re-matches what it read, where the functions' own text missed it
 *  (review of M1, 2026-11-21; D's fixes were mostly helpers). A comment edit
 *  changes nothing. */
function wvSrcHash(...files: string[]): string {
  const h = createHash("sha256");
  for (const f of files) {
    const code = readFileSync(f, "utf8").replace(/\r\n/g, "\n")
      .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\s+/g, " ");
    h.update(f + "\n" + code + "\n");
  }
  return h.digest("hex").slice(0, 16);
}

/** WV_TEST_SHARD=k/n: the k-th of n parts of the suite's spec files whose
 *  predicted RUN TIMES are balanced -- longest first into the least-loaded
 *  part, by the timing table test/spec-times.json (scripts/spec-shard.mjs; a
 *  file the table lacks is weighed by its size). A slow CI job runs as n side
 *  by side (the 2026-11-03 CI study, recommendation 7; Zotero shards its own
 *  suite, test/content/runtests.js) and a part is reproducible locally. The
 *  000- files are added to every part below. Until 2026-11-20 the parts were
 *  contiguous slices of equal BYTES: on CI shard 1/2 ran ~7 min and 2/2 ~23
 *  (test.yml run 44546104702; MJT 2026-11-20, "Ok"). */
function wvTestShard(spec: string): string[] {
  const { k, n } = parseShard(spec);
  const files = readdirSync("test").filter(f => f.endsWith(".spec.js") && !f.startsWith("000-")).sort()
    .map(f => ({ name: f, bytes: statSync(join("test", f)).size }));
  let times: Record<string, number> = {};
  try { times = specTimes(JSON.parse(readFileSync("test/spec-times.json", "utf8"))); }
  catch (e) { console.log("[weavero] test/spec-times.json unreadable, parts weighed by size: " + e); }
  const plan = planShards(files, times, n);
  console.log("[weavero] shard " + spec + ": predicted " + plan.loads.map(ms => Math.round(ms / 1000) + " s").join(" / ")
    + " for the " + n + " parts" + (plan.estimated.length ? "; weighed by size: " + plan.estimated.join(", ") : ""));
  return plan.bins[k - 1].map(f => "test/" + f);
}

/** `test` (the whole suite), or a scratch directory holding only the specs
 *  named in WV_TEST_ENTRIES, or the shard WV_TEST_SHARD names -- see the
 *  `test.entries` note below. */
function wvTestEntries(): string[] {
  let listed = (process.env.WV_TEST_ENTRIES || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!listed.length && process.env.WV_TEST_SHARD) {
    listed = wvTestShard(process.env.WV_TEST_SHARD);
    console.log("[weavero] shard " + process.env.WV_TEST_SHARD + ": " + listed.length + " spec files");
  }
  if (!listed.length) return ["test"];
  // The 000- files (failure recorder, shared helpers + readiness + pending
  // allowlist) are part of every run: a targeted spec may call `wvT.*`.
  const want = ["test/000-diagnostics.spec.js", "test/000-helpers.spec.js", ...listed]
    .filter((f, i, a) => a.indexOf(f) === i);
  // Not under `.scaffold/`: the scaffold's glob skips dot-directories.
  const dir = "test-targeted";
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of want) copyFileSync(f, join(dir, basename(f)));
  console.log("[weavero] targeted specs: " + readdirSync(dir).join(", "));
  return [dir];
}

/** Extra test-profile prefs from WV_TEST_PREFS (a JSON object), {} when unset. */
function wvTestExtraPrefs(): Record<string, string | number | boolean> {
  const raw = process.env.WV_TEST_PREFS;
  if (!raw) return {};
  const o = JSON.parse(raw);
  console.log("[weavero] extra test prefs: " + JSON.stringify(o));
  return o;
}

/** Local test runs on Linux use Gecko's own headless mode (MOZ_HEADLESS --
 *  nothing to install, unlike the scaffold's `test.headless`, which runs
 *  `sudo apt install` for Xvfb). On a desktop session -- GNOME/Wayland,
 *  measured 2026-10-01 -- the runner's window is never the active one and
 *  no code may activate it, so focus()/blur() fire NO events and the
 *  focus-dependent specs failed every time (collections search: 3 tests,
 *  the same on main 019dd71); results also changed whenever the user typed
 *  or clicked during a run. Headless, the windows are activatable and
 *  nothing pops up over the user's work. CI (Ubuntu/Xvfb) is untouched.
 *  `WV_TEST_HEADED=1 npm test` shows the window again. Only for `test`:
 *  the same config serves `npm start`, which must stay visible. */
if (process.platform === "linux" && !process.env.CI && process.env.WV_TEST_HEADED !== "1"
    && process.argv.includes("test")) {
  process.env.MOZ_HEADLESS ??= "1";
}

export default defineConfig({
  // Plain-JS plugin: scaffold copies src/* into the build verbatim
  // — no esbuild, no transpilation. The XPI it produces is
  // functionally equivalent to what scripts/build.ps1 makes.
  source: ["src"],
  dist: ".scaffold/build",

  // Identity — must match src/manifest.json so Zotero installs the
  // right add-on into the temp test profile.
  name: "Weavero",
  id: "weavero@mjthoraval",
  namespace: "weavero",

  build: {
    // Non-bundled assets are copied verbatim; .ts files are
    // bundled by esbuild (below) and must NOT also be copied as
    // sources, so we negate them here.
    assets: ["src/**/*", "!src/**/*.ts"],
    // esbuild entry points. Scaffold passes each block straight
    // to esbuild; an `outfile` not already inside `dist` gets
    // `dist/` prepended automatically. The bundled output lands
    // at `<dist>/addon/index.js`, which is the XPI root, so
    // bootstrap.js can load it as `rootURI + "index.js"`.
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        bundle: true,
        target: "firefox115",
        platform: "browser",
        format: "iife",
        outfile: "addon/index.js",
        define: {
          __WV_REFMATCH_SRC__: JSON.stringify(wvSrcHash("src/lib/ref-match.ts")),
          __WV_REFLIST_SRC__: JSON.stringify(wvSrcHash("src/lib/ref-list.ts")),
          // The document layer's component fingerprints (lib/doc-layer.ts
          // wvDlChainFps): each component's code, its helpers' modules
          // included (outline-build imports ref-list, which imports ref-match).
          __WV_DL_OL_SRC__: JSON.stringify(wvSrcHash("src/lib/outline-build.ts", "src/lib/outline-sdt.ts", "src/lib/ref-list.ts", "src/lib/ref-match.ts", "src/lib/doc-layer.ts")),
          __WV_DL_PL_SRC__: JSON.stringify(wvSrcHash("src/lib/doc-layer-pl.ts")),
        },
      },
      {
        // The document layer's ChromeWorker (modules/doc-layer.ts): the outline
        // builder and the page-label rule, run off the main thread.
        entryPoints: ["src/doc-layer-worker.ts"],
        bundle: true,
        target: "firefox115",
        platform: "browser",
        format: "iife",
        outfile: "addon/doc-layer-worker.js",
      },
      {
        entryPoints: ["src/prefs/index.ts"],
        bundle: true,
        target: "firefox115",
        platform: "browser",
        format: "iife",
        outfile: "addon/prefs.js",
      },
      {
        // Injected INTO the note-editor iframe (page compartment) to add a
        // ProseMirror decoration plugin. Bundles version-matched
        // prosemirror-view/-state so `Decoration` is available there.
        entryPoints: ["src/note-editor-inject.ts"],
        bundle: true,
        target: "firefox115",
        platform: "browser",
        format: "iife",
        outfile: "addon/note-editor-inject.js",
      },
    ],
    // Disable scaffold's PrefsManager. It expects `prefs.js` to be
    // in Mozilla's default-preferences format (lines like
    // `pref("key", value)`). Weavero's `prefs.js` is an IIFE that
    // binds the prefs-pane HTML at runtime — different role, same
    // filename. Setting both flags false makes `buildPrefs` return
    // before parsing.
    prefs: { prefixPrefKeys: false, dts: false, prefix: "" },
    // Fluent files are shipped AS WRITTEN: `src/locale/en-US/weavero.ftl`
    // is the file each window links (`insertFTLIfNeeded("weavero.ftl")`),
    // and its ids already carry the `weavero-` prefix. The scaffold's
    // defaults rename the file `weavero-weavero.ftl`, prefix every id
    // again and write a typings/i10n.d.ts (found on the first .ftl,
    // 2026-10-22: the Backlinks section's header stayed untranslated).
    fluent: { prefixFluentMessages: false, prefixLocaleFiles: false, ignore: [], dts: false },
  },

  server: {
    // No Browser Toolbox on the runner's Zotero. The scaffold's default
    // (devtools: true) launches the TEST Zotero with --jsdebugger too (its
    // Tester passes ctx.server.devtools to the runner), and a toolbox
    // attached to the process keeps every closed reader document alive:
    // ~90 MB per reader tab opened and closed, 3.2 GB after thirty, 60 ghost
    // windows -- the memory the CI suites died of (macOS's 7 GB runner,
    // 2026-11-03). A normal Zotero releases them (2026-11-04 probes).
    devtools: false,
  },

  test: {
    // Targeted run: `WV_TEST_ENTRIES=test/foo.spec.js[,test/bar.spec.js] npm
    // test` runs only those specs in the temp-profile runner -- the way a
    // NEW spec is proven before it is committed, without the full suite
    // (2026-09-21, after a new spec went red on CI twice). The scaffold
    // globs DIRECTORIES, so the listed files are copied into a scratch
    // directory it can scan; specs are self-contained (no relative imports).
    entries: wvTestEntries(),
    // The suite starts once the plugin's init has SETTLED: index.ts raises
    // `Zotero._weaveroReady` when `init()` resolves (or rejects -- the
    // error is recorded for the readiness spec in test/000-helpers.spec.js
    // to report). The scaffold evals this string in its bootstrap and polls
    // it every 100 ms for up to 10 s after `startupDelay` (survey
    // 2026-10-06 §6, step 5; a fixed 8 s delay before, with nothing
    // asserting that the plugin had loaded at all).
    startupDelay: 3_000,
    waitForPlugin: "() => Zotero._weaveroReady === true",
    // The runner keeps rendering when its window is not in front. Windows
    // reports a covered window (or every window, once the display sleeps)
    // as occluded and Gecko then throttles or stops its frames: Zotero's
    // collection selectWait never settled and specs timed out in their
    // setup, five runs on 2026-10-16, each with the runner out of sight.
    prefs: {
      // The runner's UI language. A fresh temp profile follows the OS, so
      // local runs on a French Windows were French while CI's are English;
      // once Weavero shipped its own translations (fr-FR, de, es-ES, zh-CN;
      // l10n branch 2026-11-19; it-IT 2026-11-23) the specs that assert Weavero's English would
      // read French locally. Pinned to en-US, as CI runs;
      // WV_TEST_LOCALE=fr-FR (any Zotero locale) runs the suite in another
      // language on purpose. test/l10n-locales.spec.js checks every
      // translation through a Localization of its own locale whatever this is.
      "intl.locale.requested": process.env.WV_TEST_LOCALE || "en-US",
      "widget.windows.window_occlusion_tracking.enabled": false,
      "widget.windows.window_occlusion_tracking_display_state.enabled": false,
      // macOS: an app in the background cannot take focus there, and the
      // runner's Zotero is one (CI's, and a local run behind the editor):
      // every spec that waits for a focus or blur failed on macOS CI.
      // Gecko's own test pref -- its mochitests run with it -- lets windows
      // and elements take focus as if the app were in front. Shard 1/2 went
      // from 14 failures to the 6 menu ones with it (2026-11-09, round 3).
      ...(process.platform === "darwin" ? { "focusmanager.testmode": true } : {}),
      // A CI job's own prefs on top (WV_TEST_PREFS, a JSON object): the
      // macOS rounds of 2026-11-09 test one platform setting at a time.
      ...wvTestExtraPrefs(),
    },
    abortOnFail: false,
    // One-shot run: exit after a single pass instead of staying in
    // watch mode (the scaffold's local default). This is the
    // detectable-completion contract — `npm test` STOPS when the
    // suite finishes, so its process exit (and exit code) is the
    // signal that it's done. In watch mode the runner never exits,
    // so a finished OR a stalled run looked identical (it just sat
    // there) — which is exactly the "is it done or hung?" ambiguity
    // we hit. With watch off: clean exit = done; no exit past a
    // sensible wall-clock timeout = stalled (kill the temp-profile
    // Zotero — the one launched with `-profile .scaffold/test/profile`
    // — and retry). CI already runs with watch off.
    // ⚠ This config value ALONE is not enough: scaffold's CLI (0.8.7,
    // cli.js `watch: !options.exitOnFinish && options.watch`) always
    // overrides it with the commander default (true) — the npm script
    // must pass `--exit-on-finish`. Without it the runner stays alive,
    // and editing any test file mid-run triggers a plugin reload + full
    // re-run INSIDE the same Zotero: dead readers from the previous
    // pass then poison reader-lifecycle tests with cross-run state.
    watch: false,
  },

  release: {
    // Match the existing v0.7.0 release flow — version-tagged
    // releases (`vX.Y.Z`) carry the XPI as an asset, and a
    // separate rolling `release` tag holds `update.json` so
    // Zotero's auto-updater can find the latest version.
    bumpp: {
      // Critical: bump src/manifest.json AS WELL AS package.json.
      // The shipped XPI's user-visible version comes from
      // src/manifest.json — without this, every release would
      // package an XPI labelled with the OLD version while the
      // GitHub release tag carries the new one.
      files: ["package.json", "src/manifest.json"],
      execute: "npm run build",
      // Don't open an editor for the commit message — use the
      // default.
      confirm: true,
      tag: "v%s",
    },
    github: {
      // Scaffold's isEnabled() only accepts the strings "always" |
      // "ci" | "local". Boolean `true` SILENTLY returns false, so
      // the publish step never ran (this was the v0.8.1 release
      // bug). "always" enables both CI runs and local
      // `npm run release` invocations.
      enable: "always",
      // Stage, then flip (2026-11-03): release.yml publishes the release
      // and its XPI with WV_RELEASE_STAGE=1, leaving the update manifests
      // on the rolling `release` tag as they are; flip.yml writes them for
      // the published XPI once it has been checked. Without the variable
      // (a local `npm run release`), the scaffold's own refresh.
      updater: process.env.WV_RELEASE_STAGE === "1" ? false : "release",
      // No custom `releaseNote` — fall back to the scaffold default
      // (`ctx => ctx.release.changelog`), which is changelogen's
      // convention-based changelog grouped by type (🚀 Enhancements,
      // 🩹 Fixes, …) built from our `feat(scope): …` / `fix(scope): …`
      // commit messages. This is the compact, readable format the
      // windingwind plugins (e.g. Better Notes) use. Hand-curated
      // bodies can still be edited via the GitHub UI after publish.
    },
  },
});
