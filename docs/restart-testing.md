# Restart reliability testing

Weavero restores a multi-window workspace across Zotero restarts: several main
windows, standalone multi-tab reader windows, tab groups (live, saved,
collapsed), note tabs, pinned tabs, duplicate tabs, window geometry, reader
sidebar state, the focused window, and the named tab-sessions store. This
protocol verifies that a restart loses **nothing** and measures where the
startup time goes.

It was built against Zotero 10 beta with Better BibTeX and Better Notes
installed alongside (both are part of the checks). See `test/restart/` for the
scripts.

## What is checked

- Every tab of every window (main, secondary main, reader) is restored, in
  order, matched by `libraryID:itemKey`.
- Tab groups: membership stamps, name/color, saved (parked) flag, and
  **collapsed/expanded state**.
- Note tabs (selected and background), duplicate tabs (same window and across
  windows), pinned tabs.
- **Pinned tabs are VISIBLE, not merely present.** Check the rendered box, not
  the DOM: Weavero hides the real pinned tab and shows a mirror in its place,
  so a mirror mounted in a container upstream has hidden takes the pinned tab
  off the tab bar entirely while every DOM query still passes. Zotero
  10.0.1-beta.1 did exactly that to `.pinned-tabs` (`display: none`), and the
  bug was invisible to every automated check we had. Assert a non-zero
  `getBoundingClientRect()` on the mirror, and read it as the guard for the
  whole family: any Weavero decoration whose host is an upstream container.
- Only the selected tab of each window loads; everything else restores
  lazily (`*-unloaded`) — minimal reload work.
- The selected tab of each window, the focused window, window geometry
  (multi-monitor placement), and the reader sidebar (open + width).
- The named tab-sessions store is byte-identical (the active session must NOT
  absorb a half-restored workspace).
- Companion plugins (Better BibTeX, Better Notes) are active and error-free
  after the restart. (Better Notes recreates note tabs on window load —
  Weavero's managed-window verify-and-repair covers the case where that
  recreation fails in a secondary window.)
- Reader page index per loaded tab (asserts Zotero's per-item view state
  end-to-end), each main window's selected collection and item-pane
  width/collapsed state, and window maximized state.
- **Crash restore**: kill the process (no clean quit) and verify how much the
  debounced saves recover — expected: everything up to the last ~1 s of
  changes (windows.json debounce is 400 ms; Zotero's session save is
  debounced 5 min but written on tab churn by plugins' `Session.debounceSave`
  calls, so anchor tabs may lose the last few minutes after a hard crash).
- **Curated outlines (per document family)**: for a snapshot AND an EPUB tab
  with a curated outline (`<data dir>/weavero/outlines.json`), after restart:
  the store is title-identical, the reader's Outline tab renders the CURATED
  view (a renamed entry is the tell — re-extraction would show the original
  title), clicking an entry still navigates (anchors/hrefs resolve against
  the restored document), and the scroll-spy current-section highlight comes
  alive once content loads. The spy check needs patience by design: entries
  that fail to resolve while sections stream in are retried on a ~3 s
  cool-down (`outline-spy-cache.spec.js` locks that rule — the 2026-09-03
  run found permanently-poisoned misses leaving the highlight dead).

## Running a cycle — one script, run twice

`test/restart/cycle.js` does the whole cycle; `snapshot.js` is the capture it
uses and still runs on its own. It needs a way to execute privileged JS in
Zotero: **Tools → Developer → Run JavaScript** with *Run as async function*
checked, or the dev bridge.

1. **Build a workspace worth testing** — your real one, or the reference
   fixture in `test/restart/fixture-notes.md`. Add one **single-document
   torn-off reader window** (a window with exactly one tab): those are left to
   Zotero's own session and are the one case still under suspicion
   (2026-08-05, lost across two quick restarts).
2. **Run `cycle.js`.** It backs up `<profile>/session.json` and
   `<data dir>/weavero/*.json` into `<data dir>/weavero/restart-test/backup-<stamp>/`,
   writes `before.json`, turns on startup logging (`debug.store`), and
   restarts Zotero. If the repo is not at the default path, set
   `Zotero._wvRestartOpts = { root: "<path>\\test\\restart\\" }` first.
3. **Wait for Zotero to come back**, then **run `cycle.js` again.** It waits
   for the restore to settle (two identical window/tab digests 3 s apart, up to
   90 s), writes `after.json`, diffs, and prints the verdict. The same report
   is in `restart-test/report.md`; one line per cycle is appended to
   `restart-test/history.log`.

The diff FAILs on: a missing window or tab, a changed tab order, a different
selected tab, a changed group stamp / pin / group definition, any change to the
**whole geometry object** (`x`/`y` included — a window that comes back the
right size on the wrong monitor is a failure; an eye-diff passed exactly that
on 2026-08-21), a changed tab-sessions digest, a different focused window, a
loaded note editor without Weavero's link wiring, or a companion plugin
(Better BibTeX, Better Notes) inactive. It WARNs on: added tabs or windows,
a changed reader page, sidebar or item-pane state, and error-console entries.
`lazy` / unloaded tabs are expected after a restart and never flagged.

### Legs

- **Two quick restarts** (the 2026-08-05 case): set
  `Zotero._wvRestartOpts = { restarts: 2 }` before the first run. The run
  after the first restart restarts *again* at once, without a snapshot; the
  run after the second restart produces the report.
- **Crash restore**: set `Zotero._wvRestartOpts = { noQuit: true }`. The
  first run writes `before.json` and prints the PID with a
  `Stop-Process -Id <pid> -Force` line; kill the process that way (no clean
  quit), start Zotero by hand, run `cycle.js` again. Expected losses are the
  last ~1 s of Weavero's stores (400 ms debounce) and, for the anchor window,
  whatever Zotero's own session save had not flushed.
- **Troubleshooting Mode**: see the section below.
- **Timing**: `report.md` carries quit → process start and quit → first
  paint (Gecko's startup info) plus the settle wait. `test/restart/probe.sh
  <port>` still exists for a port-level down/up timeline if you want one.

### Reading a failure

`before.json` / `after.json` are the evidence. To decide save-side vs
restore-side, read the backup's `session.json` (what Zotero saved at the
previous quit) and `<data dir>/weavero/windows.json`. The restore trace is in
Debug Output filtered on `[Weavero][trace]` (a timing line per restore
phase); the quit-side breadcrumbs of the previous session are in
`<data dir>/weavero/trace-quit.json`.

## How the restore works (as of 0.15.3)

- Zotero natively restores the oldest ("anchor") main window and reopens
  reader-window shells; Weavero restores everything else from
  `<data dir>/weavero/windows.json`: managed main windows, reader-window extra
  tabs (+ pins, group stamps, geometry, sidebar), and the focused window.
- At quit (`quit-application-requested`/`granted`, Firefox RunState model) a
  single atomic capture writes the store and freezes it; windows closed during
  teardown are folded back into the open set (Firefox's closed-in-series
  pattern) and any groups their close parked are un-parked.
- `Zotero_Tabs.restoreState` is hardened per-tab with one retry (upstream
  aborts the whole list on the first error), and the anchor window is
  verified-and-repaired against the quit-time session file after startup
  settles (Zotero's native restore silently drops tabs whose items aren't in
  the memory cache yet — including the selected note tab).
- Known upstream Zotero issues found by this protocol: transient
  `note-loading`/`reader-loading` types serialized into session.json (dropped
  at restore); `Zotero.Notes.open` hardcoding `getMainWindow()` (note tabs
  wedge at "Loading…" with multiple main windows); only one of several saved
  reader windows natively reopened. Weavero works around all three.

## Troubleshooting-Mode leg

After a normal quit (takeover: full panes, no reader windows in session.json),
restart INTO Troubleshooting Mode (`Services.startup.restartInSafeMode(
Ci.nsIAppStartup.eAttemptQuit)`), then restart normally from there. Checks:

1. In safe mode (no plugins): the main windows' tabs restore natively — the
   user's core workspace must be visible. Reader windows are absent (their
   content is Weavero-only) — expected.
2. The safe-mode session's CLEAN QUIT rewrites session.json without Weavero's
   wraps — verify `weavero/windows.json` is untouched (no plugin, no writes)
   and session.json still carries the full panes.
3. After the normal restart: the FULL checklist must pass — reader windows,
   groups, pins, sessions, note-link wiring all restored from Weavero's store.
