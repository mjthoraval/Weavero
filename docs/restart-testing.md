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
- Only the selected tab of each window loads; everything else restores
  lazily (`*-unloaded`) — minimal reload work.
- The selected tab of each window, the focused window, window geometry
  (multi-monitor placement), and the reader sidebar (open + width).
- The named tab-sessions store is byte-identical (the active session must NOT
  absorb a half-restored workspace).
- Companion plugins (Better BibTeX, Better Notes) are active and error-free
  after the restart.

## Running a cycle

Requires a way to execute privileged JS in Zotero — Tools → Developer → Run
JavaScript works; an MCP/RDP dev bridge makes it scriptable.

1. **Backup** `<profile>/session.json` and `<data dir>/weavero/*.json`.
2. Build a workspace worth testing (or use `test/restart/fixture-notes.md`
   for the reference fixture: 2 main windows + 2 reader windows + 3 groups +
   notes + duplicates + a pinned tab + a collapsed group + a named session).
3. Enable startup logging: `Zotero.Prefs.set("debug.store", true)`.
4. Run `test/restart/snapshot.js` (Run JavaScript, async) → save the JSON as
   `before.json`.
5. Optionally start `test/restart/probe.sh <port>` to timestamp the process
   down/up transitions.
6. Restart: `Zotero.Utilities.Internal.quit(true)`.
7. After the workspace settles (~15–30 s), run `snapshot.js` again → `after.json`.
8. Diff the two JSON files. Windows are matched by name/content; tabs by
   `libraryID:itemKey`; expect only `lazy`/`-unloaded` differences.
9. Read the restore trace: filter the debug log for `[Weavero][trace]`
   (timings for every restore phase), and `<data dir>/weavero/trace-quit.json`
   for the quit-side breadcrumbs of the PREVIOUS session.

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
