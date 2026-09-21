---
paths:
  - "test/**"
---

# Test rules (GitHub/test)

- `npm test -- --exit-on-finish` ALWAYS (the CLI flag is required — config
  `watch: false` gets overridden). Run backgrounded with the log redirected;
  monitor with bounded checks — the runner can stall silently at 0 bytes on a
  Zotero binary/profile lock. Kill orphaned temp-profile `zotero.exe`
  afterwards (the `--profile …/.scaffold/test/profile` one), never the user's.
- Popup contracts are locked by `test/popups.spec.js` — run after touching
  popup code. `test/compat.spec.js` asserts the ownerGlobal/documentGlobal
  bundle invariants.
- Live suites (`test/live/*.js`) run inside the real Zotero via the bridge:
  results go on a `Zotero._wv*` global (read them in a separate eval — heavy
  rAF/eval loops can drop the bridge connection). Certification rule: a run
  during which the library changed is not evidence (`itemsChangedDuringRun`).
  Reset `search.quicksearch-mode` to `fields` before and after — a polluted
  mode produces phantom failures.
- A spec runs in a FRESH TEMP PROFILE, not the dev one: no user column
  choices (the items tree shows Zotero's three defaults, none of Weavero's
  opt-in columns), no collections, no stored widths, no saved searches.
  Never assert on profile-specific state — `assert.isAbove(cells, 3)` in
  the header-containment guard passed on dev (12 columns) and failed at 3
  on both `npm test` and CI (2026-09-14). Assert the INVARIANT, and derive
  the comparison from what the run itself measures.
- A NEW or changed spec is run in the runner BEFORE it is committed, and
  the full-suite gate ("after the user validates") does not excuse it:
  `WV_TEST_ENTRIES=test/foo.spec.js[,test/bar.spec.js] npm test` runs only
  those specs in the temp profile (~1 min). Two red CI runs came from specs
  committed unrun (2026-09-14, 2026-09-21); the second also hid a real
  plugin defect (`instanceof Set` false across globals) behind "it's just
  the test". Objects a spec hands the plugin come from ANOTHER global:
  `instanceof` on built-ins is false there — duck-type, in specs and in code.
- Instrumentation masks races: verify timing-family fixes with plain loops
  only.
- Restart/session testing: `test/restart/cycle.js` (canonical) — run it
  once (backup + before snapshot + restart) and once more after the restart
  (settle + after snapshot + diff + verdict, `restart-test/report.md`);
  `snapshot.js` is its capture. In the sessions UI expand via the twisty
  ONLY — clicking the row switches sessions (destructive). Full protocol:
  `docs/restart-testing.md`.
- Long live runs (matrix, benches): make the script SELF-REPORTING — it
  writes its full analysis to a file on finish (filter-matrix writes
  `<data dir>/weavero/filter-matrix-report.json`). Launch once, read the
  file once; never poll status through the bridge or stream large JSON
  into the conversation. The user can also launch these themselves via
  Run JavaScript and just hand over the report path.
