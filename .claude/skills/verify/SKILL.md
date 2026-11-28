---
name: verify
description: The Weavero build-install-verify cycle. Use whenever a Weavero build is to be made or installed ("install the latest work", "make a build", "put it in my Zotero", a branch build to try, a reinstall), and after any src/ change, to get the new code running and proven in the live Zotero. Also the reference for version bumping (which -dev.N or branch suffix) and for which specs to run on which Zotero versions.
---

# Build → install → verify cycle

## 1. Version bump (every cycle, no exceptions)

- Iterating: `-dev.N` of the NEXT version (`0.18.5` → `0.18.6-dev.1`, then
  `-dev.2`, …). Never a bare clean version for work-in-progress.
- One `N` per code state, NEVER reused: every build whose code differs gets a
  fresh `-dev.N` — including rebuilds of an amended commit and instrumented
  diagnostic builds. Reusing a number breaks "which code is running?" and
  "which version replaced which" (2026-08-20: six different builds shipped as
  dev.11; a whole debugging round was spent unsure whether the user's popup
  ran the code under test). A commit may span several N; a single N must
  never span several code states.
- Branch builds get their own suffix (`-defatt.N`, `-fx153.N`), never main's
  `-dev.N`.
- Bump in `src/manifest.json` AND `package.json` (and `package-lock.json` if
  present) — versions must match. Zotero won't reinstall an identical version.
- Publish ≠ release: squash-pushing dev commits does NOT reset the cycle —
  `-dev.N` continues on the same next-version target; only an actual release
  (bare version + tag) starts a new one.

## 2. Build

```bash
npm run build
```

`prebuild` runs typecheck — 0 errors is non-negotiable. If prefs.html or the
manifest changed, their rules files carry the extra checks.

## 3. Install into the RUNNING Zotero

- First check WHICH profile is running: `PathUtils.profileDir` via
  `zotero_execute_js` — install into the DEV profile, never a real library.
- Stage `.scaffold/build/weavero.xpi` somewhere stable, then
  `zotero_plugin_install`, then FORCE-RELOAD past the bytecode cache
  (AddonManager `addon.reload()`), else the old code keeps running.
- Note: an install only persists in the profile that was running; after a
  profile switch, re-install there too.

## 4. Live verification

- Verify the actual change via the bridge: DOM state, row counts, computed
  styles, screenshots. Keep evals short; store results on a `Zotero._wv*`
  global before heavy async work so a bridge hiccup doesn't lose them.
- No bridge (the test runner, or the user's instance off limits): a temporary
  probe spec, never committed, screenshots the runner's window itself --
  `win.browsingContext.currentWindowGlobal.drawSnapshot(rect|null, 1,
  "white")` onto a canvas, `IOUtils.write` the PNG -- and
  `Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0|1)` switches light
  and dark live for a shot of each (split-view cards, 2026-11-11). Move the
  probe out before `npm run build`: the typecheck covers test/.
  An open XUL menu (menupopup, panel) is a window of its own: drawSnapshot
  never paints it. The probe writes the menu's `getOuterScreenRect()` times
  `devicePixelRatio` to a request file and a helper script outside Zotero
  grabs exactly that rectangle off the screen (PIL `ImageGrab`, per-monitor
  DPI aware, the virtual desktop's origin subtracted), nothing around it
  (refs.9 reference card, 2026-11-20). And a scroll of a PDF view closes
  Zotero's overlay popups: scroll first, wait, then open the popup.
- Timing measurements: beware sampling inside a CSS transition or debounce
  window — a wrong first read cost a false "dimming is broken" alarm once.
- **A hidden or occluded window suspends `requestAnimationFrame`**, and
  anything driven by it silently freezes: pdf.js's `pdfViewer._location`
  stops tracking scroll (programmatic scrollTop "works" while every position
  read returns the same stale value), and the filter matrix captures no paint
  timings at all. Check `window.document.hidden` BEFORE trusting any
  scroll / position / paint measurement, and say so rather than reporting a
  frozen reading as a result (2026-08-20, both failure modes in one day).
- Hot reload leaves stale DOM handlers in open reader tabs — reopen the tab
  before judging reader behaviour.
- Synthetic clicks/keys are `isTrusted: false`; XUL handlers may ignore them.
  Drive plugin methods directly, or flag the check as needs-human-hands.
- Never mutate the user's library for a test when a DOM-only probe works; if
  data must be created, create it, verify, and REMOVE it in the same session
  (check WHERE a bookmark/item lives before restoring stores).

## 5. Test suite etiquette

- `npm test -- --exit-on-finish`, run in background with the log redirected;
  MONITOR the log (it can stall at 0 bytes on a profile lock) — bounded
  checks, never blind waits, and answer the user immediately if they check in.
- Afterwards kill any orphaned temp-profile `zotero.exe` (the one launched
  with `--profile …/.scaffold/test/profile`) — never the user's instance.
- A run that fails at once with `"before all" hook in "{root}"` (the 90 s
  Zotero-readiness wait in 000-helpers) proves nothing about the code: look
  for another clone's runner (`--profile …\<clone>\.scaffold\test\profile`
  in the process list) and rerun when it is gone. Two such failures in a row
  on 2026-11-11 (api2 branch, another clone's runner up); the same code ran
  normally once that runner had finished.
- Frequency: popups specs after touching popup code; targeted specs for
  suite-covered machinery; the FULL suite only pre-release or on request.
- **Which specs (MJT 2026-11-15, "not everything is needed each time").**
  Day to day, and on a branch, run what the change needs:
  `npm run test:pick -- --list` (scripts/pick-specs.mjs) lists the specs that
  name what the diff changed, plus a base set (popups, compat, reader-leak,
  prefs-defaults, option-gates), and prints the `WV_TEST_ENTRIES` value. Run
  them on Zotero 11 beta and on Zotero 10. Since 2026-11-20 it follows the
  IMPORT GRAPH -- a `src/lib/` change picks the specs of the methods that use
  it, each pick printed with the changed file that led to it. It says "run
  the full suite", with the reason, when `src/index.ts` or the scaffold config
  changed, when a changed file cannot be followed, or when more than half of
  the suite is picked; then do. `--base A --head B` tries it on any range.
- **One full run per tree that lands.** The full suite runs once on the tree
  that lands on main (a branch merge, see the branch skill) and at a release,
  on every Zotero version of the gate; never again on the same tree (a merge
  that is a fast-forward of a tree that already passed reuses its runs). Zotero
  10 gets full runs only then; in between, its picked specs. 2026-11-14/15:
  three branches ran their own full suites on two versions and the merge would
  have run them again -- about six machine-hours for one night's work.
  A release candidate that differs from the last tree whose full runs passed
  on both versions ONLY by the version files reuses those runs (release skill
  §3, MJT 2026-11-20): `git diff --stat <tested> <candidate>` lists nothing but
  `src/manifest.json`, `package.json`, `package-lock.json`.
- **Full runs record their times.** Run them with
  `WV_TEST_TIMES=D:/tmp/<tag>-times.json` (each spec file's wall time,
  test/000-helpers.spec.js); after a green full run on each Zotero major,
  `node scripts/spec-times.mjs --json <file>` refreshes `test/spec-times.json`
  -- the table CI's shards are balanced by (`--predict 2,3` shows the parts)
  -- committed as `test:`.
- Full runs go to an idle machine (overnight when possible): they take ~25 min
  per Zotero version, and a runner in use competes with the user's instance.
- A symptom seen ONLY in the runner is the runner's until a normal Zotero
  shows it too (bridge-driven in the dev profile, and by hand). 2026-11-04:
  "Zotero retains ~85 MB per reader opened and closed" was the scaffold's
  Browser Toolbox (`--jsdebugger`, its `server.devtools` default) attached
  to the runner's Zotero; an upstream report was drafted before the
  hands-on check disproved it. `server.devtools` is now false in
  zotero-plugin.config.ts; the full suite peaks near 2 GB. The quit
  trace's MEM/MEMGROW lines (000-helpers) name the heavy specs.
- SEQUENCE: install first, then run the suite at once, in parallel with the
  user's own testing -- never hold the install behind a run, and never
  hold a run waiting for the user to confirm the feature (MJT, 2026-11-25:
  "You can start the test suite directly. I just want to be able to test
  it directly also, without having to wait for the result of the suite. So
  you can install while the test suite runs."; same since 2026-11-12). Per
  code state: build, install into the running instance, short live check,
  tell the user it is in, THEN start the runs in the background and report
  them when they finish; a problem the user's hands find means fix,
  reinstall, rerun. The runner launches its OWN Zotero (CPU, a window that
  can take focus): say when a long run starts. Superseded: "suite only
  after the user validates" (2026-08-24).
- Perf-relevant changes (filter apply path, per-row rendering, reader
  load): run the matching `bench/` suite (TESTING.md Level 5) —
  `bench-filter-search.js` times filter/search per dimension, mode and
  window (it superseded bench-weavero-ui's filter numbers, whose 5s poll
  cap returned -1 on a real library). Compare against
  `work/perf-baselines.json`; >1.5x = flag it. For "where did the time
  go", re-run with `Zotero._wvBenchProfile = true` and read the WV
  markers in the saved Gecko profile.
- Touched filter/search/reader-filter machinery: run the live suites via
  `test/live/run-all.js` (core profile) -- same sequencing as the full npm
  suite above (install first, runs at once in parallel). Pre-release:
  `full` (adds the matrix).
- **Speed and accuracy, per feature (MJT 2026-11-27).** A change to a feature
  that has a speed check (a bench, a timing spec) or an accuracy check (a
  gold set measuring how often a heuristic is right: reference
  identification, outline headings, Cited by matching...) runs that check
  too, and compares with its last value; a heuristic change is kept only if
  no set gains a wrong answer. The maintainer's coverage table of features x
  review dimensions (when present) says which checks exist; a feature that
  has none gets a line there, so the periodic review can add one.
- **One machine, one queue.** Every Zotero runner (suite, bench, probe) goes
  through the suite lock, full suites alone; several runs are chained in one
  queued script, never started by several agents at once (2026-11-26/27: a
  release gate waited three hours behind agents' own runs).

## 6. Report

Confirm with the version in the link text, e.g.
`[View the rebuilt XPI — v0.18.6-dev.3](weavero-v0.18.6-dev.3.xpi)`, state
what was verified with evidence, and list any remaining manual checks at the
end. Say what you left: any warning, failing or skipped check you decided to
accept, and why — never silently. Commit in logical units (feature/fix commit separate from the `chore:`
bump; never `git add -A`).
