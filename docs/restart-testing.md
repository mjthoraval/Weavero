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

1. **Build the workspace.** Run `test/restart/fixture.js` first (same way as
   cycle.js): it adds, on top of whatever is open, every tab-related feature
   the protocol must see survive -- two main windows, four reader windows
   (multi-tab, same-window duplicate, single document, orphan), live /
   collapsed / parked groups, pinned tabs in both window kinds, note tabs
   (selected, background, grouped, in a reader window), same- and
   cross-window duplicates, an EPUB and snapshot tabs, a custom reader
   sidebar, moved windows, an active named session, a reader window focused --
   and a DUPLICATES matrix: the same item open twice or three times in every
   configuration Weavero distinguishes (both copies in one group, in different
   groups, one grouped, neither, across main windows, main + reader-window
   extra, main + a reader window's own document, same reader window, across
   reader windows, a pinned copy beside a plain one, a note twice and in a
   reader window, a parked group's member reopened, the selected tab being a
   copy, EPUB and snapshot copies). Duplicates were behind a run of fixes in
   June-July 2026 and again on 2026-09-16.
   `Zotero._wvFixtureOpts = { reset: true }` closes everything first. The
   report's **COVERAGE** section lists what the before-workspace contained and
   flags any essential element at zero, so a green run on a thin workspace
   cannot pass for a full one. `fixture-notes.md` is the human-readable
   description of the same workspace.
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
- **Plugin reload before the restart**: `{ reloadFirst: true }` hot-reloads
  Weavero, then captures and restarts -- a reload once rewrote windows.json
  with a single entry (July run 2).
- **Tab mid-load at quit**: `{ loadingAtQuit: true }` selects an unloaded
  reader tab of the anchor window and quits 150 ms later, so the session is
  saved while that tab is `reader-loading` (the type Zotero once dropped).
- **Troubleshooting Mode**: see the section below.
- **Empty Zotero session** (the upstream bug of forums 133542, fixed in
  10.0.3-beta.1 but present in 10.0.2: a startup error made the quit save
  overwrite `session.json` with an empty state). Quit Zotero, overwrite
  `<profile>/session.json` with `{"windows":[]}`, start it again: Weavero
  must rebuild the anchor window's tabs from its own `windows.json`
  (`restore: anchor tabs rebuilt from store — N tab(s)` in the trace) and
  reopen every reader window. 2026-09-16: 20 tabs + 2 reader windows came
  back from an emptied session.
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

## Every tab loss so far, and what catches it now

Each row is a defect met during Weavero's development (commit in brackets),
the fixture element that reproduces its precondition, and the cycle.js check
that fails if it comes back. The COVERAGE section of a report tells you which
rows a given run actually exercised.

| Loss (commit) | Fixture element | Check |
|---|---|---|
| Selected note tab dropped: mid-load `note-loading` type serialized, `restoreState` skipped it (9f9eaa9) | W1's selected tab is a note; `loadingAtQuit` leg | tab multiset + selected tab |
| Selected note tab dropped by the native anchor restore, item not yet in the cache (de3052c) | selected note tab in W1 | tab multiset + selected tab; note-link wiring |
| Duplicate claimed into another window's group by the startup claim pass (16fd19d) | RTF-A member also open ungrouped in W2 | group stamps as a multiset of key\|group |
| Reader window lost wholesale at quit: teardown ran the user-close path, group parked (79f2e93) | R1 multi-tab with group RTF-D | reader window matched by tab overlap; group `saved` flag |
| Only one of two saved reader windows natively reopened, `Items.exists` race (ee26914) | R1 and R2 both multi-tab | reader windows missing |
| Plugin reload rewrote windows.json with one entry (July run 2) | `reloadFirst` leg | everything |
| Active session absorbed a lossy restore (b3b9faf) | "RTF session" saved and active | sessions digest + active session id |
| Pinned tabs lost across restart (78ea810) | pinned tab in W1, pinned extra in R1 | pinned multiset per window |
| Window restored on the wrong monitor / at off-screen minimized coordinates (f7be1ef, b3ac95d) | W2, R1..R4 moved; W1 maximized | whole geometry object, x/y included |
| Reader sidebar state and focused window not restored (ce42d3e) | R1 sidebar open at 320 px; R1 focused at quit | sidebar equality; focused descriptor |
| Managed window lost 3 of 5 tabs: `restoreState` aborts wholesale on one error (de3052c) | W2 with 5 tabs incl. a note | tab multiset per window, windows matched by name |
| Better Notes closed a note tab in a secondary window and failed to recreate it (824583d) | background note tab in W2 | tab multiset; companion plugin active |
| Group definitions lost or mutated: collapsed state, parked groups, reader-window groups, groups with a note; group deleted by a window close or a move (5528bc9, 590317a) | RTF-B collapsed, RTF-E parked, RTF-D in R1, RTF-A with a note | group name/colour/saved/collapsed/members |
| Single-document reader window recorded by neither side (8cda060) | R3 | reader windows missing |
| Same-window duplicate of a group member pulled into the group at restore by the boot re-stamp (found by this protocol's first full run, 2026-09-16; fixed in 0.19.9) | P1 open twice in W1, one copy in RTF-A | group stamps as a multiset; tab order |
| Orphan reader window (native tab closed) not recreated | R4 | reader window + orphan flag |
| Duplicate copies counted as group members / in the open count (0331362, ac40523: copies are independent per-tab members) | D0 twice in RTF-F plus a third copy in W2; D1 in RTF-F and RTF-G | group members deduped; stamps as a multiset; per-position signature |
| Claim pass grabbed a duplicate copy of a member, first-come per item key (16fd19d; tab-groups.ts "move-mess") | P2 in W1 (RTF-A) and W2 (ungrouped); W2's selected tab is that copy | stamps as a multiset; selected copy by position |
| Every copy of a pinned item marked pinned, mirrors multiplied (150d399, bad3a8f, 8717ee9) | D3 pinned once and open again plain | pinned multiset per window; visible mirror count |
| Focused reader window reopened twice at restore (677edbf) | R3's document also open as a tab in W1; R1 focused at quit | EXTRA window fails |
| New Main Window opened with the whole session's tabs, i.e. duplicates of everything (49451a1) | W2 | tabs ADDED to a window fails |
| Same-window and cross-window duplicates collapsed or lost (ac40523) | P1 twice in W1; P11 twice in R2; P2 in W1 and W2; note N1 twice in W1 and in R1; D4 in R1 and R2; the orphan's document in W2; EPUB and snapshot twice | multiset diff (a set diff never saw them) |
| Restored note editors without Weavero's link wiring (97ba936) | loaded note tab | `noteEditors[].wired` |
| Reader-window tab order: extras mounted after the native tab (order field) | R1's note tab moved first | tab order per window |
| Stale legacy store resurrecting long-closed windows (b3ac95d) | any | EXTRA window after restart fails |
| Spawned window mirroring the whole session (ff6e998, e0236d2) | W2 | tabs ADDED to a window fails |
| Anchor window restored at the geometry of whichever main window closed LAST (Zotero persists one XUL geometry for all main windows; found by the `loadingAtQuit` leg 2026-09-16, fixed in 0.19.9) | W2 with its own geometry, W1 maximized | whole geometry object per main window |
| Quit while the reader restore is still in flight dropped the unrestored reader window from the store and the active session absorbed the loss (found by the two-quick-restarts leg 2026-09-16, fixed in 0.19.9) | four reader windows, second restart 6–10 s after boot | reader windows missing; sessions digest |
| A reader window's document also open as a main-window tab: Zotero's `Reader.open` redirected the window reopen to that tab, selecting and loading it in the main window (found by the duplicates matrix + two quick restarts, 2026-09-16; fixed in 0.19.9 with `allowDuplicate` on every restore-time window reopen) | R3's document also open in W1; the orphan's document open in W2 | selected tab per window; reader windows missing |
| An explicitly ungrouped copy of an old group's member was claimed into that group at restore (item-key fallback of the claim pass; found by the duplicates matrix 2026-09-16, fixed in 0.19.9: a null stored stamp marks the restored tab kept-out) | D4 in R1 and R2 while a pre-existing group lists it as a member; every ungrouped copy | per-position signature; stamps as a multiset |
| A background main window's deferred selection was lost by a quit before its first activation (the capture saved the library tab; found 2026-09-16, fixed in 0.19.9) | W2 with a selected reader tab, quick second restart | selected tab per window, deferred item counted |
| Startup error emptied Zotero's session (forums 133542, upstream) | any main window | "Empty Zotero session" leg: tabs rebuilt from Weavero's store |
| Crash loses the last seconds (debounced stores) | any | `noQuit` leg |
| Curated outlines of EPUB / snapshot tabs (2026-09-03 leg) | EPUB and snapshot tabs in W1 and R1 | tab presence here; the outline checks stay in that leg |

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
