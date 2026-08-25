---
name: verify
description: The Weavero build-install-verify cycle. Use after any src/ change to get the new code running and proven in the live Zotero. Also the reference for version bumping and test-suite etiquette.
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
- Frequency: popups specs after touching popup code; targeted specs for
  suite-covered machinery; the FULL suite only pre-release or on request.
- SEQUENCE: hand the build over for the user's own validation FIRST, and
  run the suite after they confirm the feature works — not between the
  install and the handover. The runner launches its OWN Zotero, which
  competes for CPU and focus with the instance the user is testing in,
  and a suite result on a feature they have not seen yet answers a
  question nobody asked (MJT, 2026-08-24, after four full runs in one
  session on small changes).
- Perf-relevant changes (filter apply path, per-row rendering, reader
  load): run the matching `bench/` suite (TESTING.md Level 5) —
  `bench-weavero-ui.js` times items-list filter apply/clear.

## 6. Report

Confirm with the version in the link text, e.g.
`[View the rebuilt XPI — v0.18.6-dev.3](weavero-v0.18.6-dev.3.xpi)`, state
what was verified with evidence, and list any remaining manual checks at the
end. Commit in logical units (feature/fix commit separate from the `chore:`
bump; never `git add -A`).
