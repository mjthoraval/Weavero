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
- SKIP DISCIPLINE (survey 2026-10-06 §6, step 5): a missing plugin, method
  or constant is a FAILURE — `wvT.absent("plugin.x")` (or `wvT.method`,
  `wvT.src`), never `this.skip()`: 141 guards used to skip exactly when the
  regression happened. `this.skip()` is for platform / version / runner
  reasons only, with the reason in a trailing comment, and every pending
  test must match an entry of `wvT.PENDING_ALLOWLIST` in
  test/000-helpers.spec.js (reason per entry) — the root `after` hook
  there fails the run on any other. The run starts once
  `Zotero._weaveroReady` is raised (init settled) AND a root `before`
  barrier has awaited Zotero's own readiness (schemaUpdatePromise — the
  bundled-files install on a fresh profile holds the DB for many seconds —
  uiReadyPromise, the items tree's load, a free DB): without it the first
  spec's `saveTx` timed out at 20 s. The readiness spec in the same file
  is the first of every run.
- SHARED HELPERS: `wvT` (test/000-helpers.spec.js, a global of the runner
  page; typed in test/wvT.d.ts) — plugin/lib/win, sleep/waitFor, withPref
  (restores a user value, clears a defaulted pref, never writes a default
  as a user value), minimalPDFBytes/createTestPDFItem, createTestSnapshotItem,
  createTestEPUBItem (temp files removed at the end of the run),
  openReaderTab / domViewOf (the Xray-waived DOM view once its document
  holds a text) / closeReaderTab, createItem/erase, purgeDeadReaders.
  Prefer them to a per-file copy; a targeted run always stages the 000-
  files. A chrome-side position/selector handed to a DOM view must be
  `Cu.cloneInto(obj, pv._iframeWindow)` first or `toDisplayedRange`
  returns null (test/dom-view-fixture.spec.js runs the real views). The
  same for an EVENT built with a content window's constructor: its init
  dictionary must be cloned in (`new view.KeyboardEvent("keydown",
  Cu.cloneInto({ key: "Escape", bubbles: true }, view))`), or the event
  arrives with key "" and listeners ignore it (test/bm-menu-dismiss.spec.js,
  2026-10-09).
- The library filter panel re-renders its sections after it opens: a spec
  that captured a section's input/list right away holds a DETACHED render.
  Re-query the live section at every step (test/filter-search-mode.spec.js).
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
- Menu entries: a synthetic `command` (untrusted) is not delivered to chrome
  `addEventListener` listeners, and `menuitem.doCommand()` showed no effect
  when checked right after the call (measured 2026-09-22). On an item of an
  OPEN menupopup it IS delivered, trusted, but ASYNCHRONOUSLY (the popup
  manager closes the menu first): wait for the effect, never read it on the
  next line (test/filter-search-mode.spec.js, 2026-10-09). For MenuManager
  entries keep the route below. Drive the popup with a synthetic `popupshowing` on the
  popup element (inline `onpopupshowing` handlers do run) and call the
  plugin's own stored `onCommand(null, { menuElem })`
  (`test/menubar-window-entries.spec.js`, via `_wvMenubarMenus`). And when
  an `onShowing` both moves a menuitem and labels it: move FIRST -- a fresh
  `acceltext` does not survive `insertBefore`.
- A test that cares about the selected collection sets it FIRST -- never
  rely on the previous test's trailing restore: an assertion failure there
  skips it, and the next test then fails on the leftover state and looks
  like a second bug (the dev.35 landing test, 2026-09-22).
- The runner's window is NEVER raised: `document.hasFocus()` is false there
  for the whole run, while it is true in the dev instance even with VS Code
  in front (Gecko keeps the last-raised window "active"). Any plugin path
  gated on focus behaves differently in the runner -- the cross-window
  collection guard (tabs.ts) adds `skipSelect` to a collection add, so
  Zotero neither expands the parent nor selects the new row (2026-09-23:
  a green live check, a red runner, a whole trace to find it). Pin
  `doc.hasFocus = () => true/false` in the spec (delete it in `finally`)
  and test BOTH paths when the feature has both.
- Linux desktop runs are HEADLESS by default (zotero-plugin.config.ts sets
  MOZ_HEADLESS for local `test` runs on Linux; `WV_TEST_HEADED=1` shows the
  window). On GNOME/Wayland the runner's window could never be activated, so
  focus()/blur() fired no events at all and the focus-driven specs failed
  every run -- also on main -- and results shifted when the user typed
  during a run (2026-10-01). Separately, the scaffold's runner PAGE takes the
  activation ~800 ms into a run: a spec that needs focus events re-activates
  the main window first (`win.focus()` until `Services.focus.activeWindow
  === win`; collections-pane-toggle.spec.js `beforeEach`). Do not use the
  scaffold's `test.headless` locally: it `sudo apt install`s Xvfb.
- A spec's MutationObserver that checks what the plugin's own observer
  leaves in the DOM (the collections-tree paint guard) must be REGISTERED
  AFTER the plugin's -- observers are notified in registration order, so
  one registered before the right-click sees Zotero's paint before the
  guard corrects it (three false "selected" entries, 2026-09-23). For a
  paint-visible check, sample at TASK level too (a 20 ms `setInterval`):
  a task never runs between a mutation and the guard's microtask.
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
- A spec that OPENS a main window: take timers from a window captured
  BEFORE it opens. `Zotero.getMainWindow()` returns the newest window, and
  its `setTimeout` does not fire until that window has loaded -- a
  `sleep()` built on `getMainWindow()` hung the whole spec past its timeout
  (hidden-collections.spec.js, 2026-10-05). And Weavero's onMainWindowLoad
  runs before a new window has its collections tree: wiring that needs
  `ZoteroPane.collectionsView` must retry until it exists (now: a
  `views: true` entry of the wiring table).
  Then SET FOCUS explicitly (`win.focus()` on the window that should have
  it): whether the new window takes focus differs between a targeted run
  (it does) and the full suite (it does not), so code that reads the
  focused window passed alone and failed in the suite
  (window-wiring.spec.js, 2026-10-09: the filter's patch installers used
  `Zotero.getMainWindow()`; the spec now keeps focus on the first window).
