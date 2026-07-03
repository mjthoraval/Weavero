# Plugin disable / re-enable / reinstall testing

Companion to `restart-testing.md` (which verifies the workspace survives a
Zotero restart). This protocol verifies the plugin's own **lifecycle**:

- **Disable** removes every Weavero artifact — UI, styles, wrapped Zotero
  methods, prototype patches, note-editor wiring, observers. Zotero must
  behave as if Weavero was never installed (native link colors, native tab
  strip, native drag-and-drop), including for content that loads *after*
  the disable.
- **Re-enable** brings every surface back, exactly once — no duplicated
  chips, panes, or stacked wrappers — with the workspace (tabs, groups,
  pins, sessions) unchanged.
- **Reinstall** (over a running copy, and uninstall→install) behaves like a
  clean enable and preserves the user's data (groups/pins/sessions live in
  `weavero.*` prefs + `<data dir>/weavero/*.json`, which survive reinstall).

Scripts live in `test/disable/`; the workspace snapshot is reused from
`test/restart/snapshot.js`.

## Why each check exists (observed failures, 2026-07-03)

- **Resurrecting UI**: per-window teardown only ran on window close, so
  disable left the tab-bar MutationObserver alive — destroy's own DOM strip
  triggered it and the dead instance re-painted chips/pins immediately.
- **Late-loading note tabs**: a note tab still loading (or unloaded) at
  disable-time finished loading afterwards, and surviving `Zotero_Tabs`
  wrappers re-wired its editor from dead code — brown Weavero links with the
  plugin off. Hence the *late-load leg* below.
- **Secondary windows**: cleanup only covered the first main window; window
  2 kept its buttons, styles and editor wiring.
- **Reader windows**: kept Weavero's right-pane skeleton, tooltips, menus.
- **Prototype patches**: `ZoteroItemTreeRow.getChildItems` stayed wrapped.
- **Stacked wrappers** (reinstall/reload): "wire once per window" guards
  skipped re-wiring, leaving wrappers whose closures pointed at dead
  instances from older builds.

## What is checked

`test/disable/leftovers.js` (run after disable/uninstall — must return
`pass: true`):

1. `Zotero.Weavero.plugin` cleared.
2. Every window (all mains, `zotero:reader`, `zotero:note`, `zotero:pref`,
   `zotero:basicViewer`): no `wv-`/`weavero`-id elements, no `wv-` classes,
   no `data-wv-*` attributes, no Weavero root classes.
3. `Zotero_Tabs.select/close/restoreState/markAsLoaded` back to native in
   every main window (source-marker check + no stored originals); tab-bar
   decoration observer disconnected.
4. Note-editor iframes: no `weavero-note-editor-styles`; claim tokens
   cleared (warning level).
5. Global patches restored: `Zotero.Notes.open`, `Zotero.Reader.open`,
   `Reader.getWindowStates`, `openPreferences`.
6. `ZoteroItemTreeRow.prototype.getChildItems` unwrapped.
7. Pref pane unregistered; custom item-tree columns unregistered.

`test/disable/presence.js` (run ~5 s after enable/reinstall — must return
`pass: true`):

1. Plugin loaded; **expected version** running (catches a reinstall that
   silently kept the old XPI via the bytecode cache).
2. Per main window: `weavero-styles` exactly once; lifecycle wrappers
   installed **with stored originals** (i.e. unwire-able, current-build
   wrappers); decoration observer connected.
3. Group chips: exactly one per group with open members in that window.
4. Pinned tabs re-collapsed; loose pins carry the sticky index.
5. All loaded note editors wired (Weavero stylesheet present).
6. Pref pane registered exactly once (two = the duplicate-pane bug).
7. Multi-tab reader windows have their strip back.

## Running a cycle

Requires privileged JS (Tools → Developer → Run JavaScript, "Run as async
function") or the MCP dev bridge. Use a workspace worth testing: 2 main
windows, a multi-tab reader window, groups (incl. a collapsed one and a
saved one), a pinned tab, note tabs (one loaded, one unloaded), and open
note editors showing links.

### Path A — disable → verify → enable → verify

1. `test/restart/snapshot.js` → save as `before.json`.
2. Disable Weavero (Plugins Manager toggle, or
   `(await AddonManager.getAddonByID("weavero@mjthoraval")).disable()`).
3. `test/disable/leftovers.js` → must be `pass: true`.
4. Eyeball the natives: link colors in an open note (native blue), tab strip
   (no chips, pinned tab full width), List All Tabs popup (native layout),
   items list (context attachment rows visible if the filter pref hid them).
5. Re-enable; wait ~5 s.
6. `test/disable/presence.js` → must be `pass: true`.
7. `test/restart/snapshot.js` → `after.json`; diff vs `before.json` — only
   `lazy`/`-unloaded` differences allowed.

### Path B — the late-load leg (regression: post-disable re-wiring)

1. With the plugin enabled, unload a note tab
   (`Zotero_Tabs.unload(tabID)`) or pick an already-unloaded one.
2. Disable Weavero.
3. Select the note tab; let it load fully (~5 s).
4. `leftovers.js` again → must STILL be `pass: true`, and the note's links
   must render in the editor's **native** color. This is the leg that
   caught wrappers re-wiring editors from dead code.

### Path C — reinstall over a running copy (the dev-iteration path)

1. `snapshot.js` → `before.json`; note the currently running version.
2. Install the new XPI **without disabling first** (Plugins Manager →
   Install From File, or `zotero_plugin_install` + a forced reload — the
   bytecode cache serves stale code otherwise; see
   `feedback_weavero_install_cache`).
3. Wait ~5 s. `presence.js` → `pass: true` **and** the version field shows
   the NEW version.
4. Duplicate hunt is built into presence.js (styles ×1, pane ×1, chips ×1
   per group) — stacked-wrapper regressions show up as a `_wvOrig*` failure.
5. `snapshot.js` diff vs `before.json` — workspace unchanged.

### Path D — full uninstall → reinstall

1. `snapshot.js` → `before.json`.
2. Uninstall Weavero (Plugins Manager → ⋯ → Remove). This is `reason 6`:
   reader-window extra tabs are migrated into the main window first
   (by design — see note below).
3. `leftovers.js` → `pass: true`.
4. Install the XPI fresh; enable; wait ~5 s.
5. `presence.js` → `pass: true`.
6. Groups / pins / sessions must be intact (they persist in prefs + the
   data-dir store). Reader-window tabs rescued in step 2 reopen as main
   window tabs; re-creating the reader windows is manual (uninstall is not
   expected to round-trip them).

## What happens to extra tabs and extra windows on disable

Weavero can leave the session with content stock Zotero has no UI for:
extra tabs inside multi-tab reader windows, and (to a lesser degree) extra
main windows. Disable handles the two differently — in both cases the rule
is **never orphan content, never destroy the user's layout**.

### Save all → close to the anchor → restore on enable

On a genuine disable/uninstall (`ADDON_DISABLE`/`ADDON_UNINSTALL` —
hot-reloads and app quit are excluded), `_wvDisableCloseExtraWindows`:

1. relies on destroy's step-0 **final store capture + freeze** — the
   snapshot in `windows.json` is immutable for the whole time the plugin
   is off;
2. **closes every reader window** (multi-tab decks, note-only decks, and
   plain ones alike) and **every managed main window** — only the untagged
   **anchor** main window stays open;
3. records which tab groups were live (reader-window closes park the
   groups homed there; the record lets enable un-park exactly those);
4. writes a marker (`<data dir>/weavero/disable-closed.json`).

On the next **enable**, `_wvEnableRestoreClosedWindows` consumes the
marker, un-parks the recorded groups, and restores every closed window
from the frozen store through the SAME machinery the startup restore uses
(`_wvWindowStoreRestoreDevWindows` for managed main windows,
`_wvWindowStoreRestoreOrphanReaderWindows` for reader windows, including
note-only decks). Both entry points carry once-guards, so a race with the
normal startup restore is a no-op.

Why this design (and not the alternatives):

- **Leave everything open** (the previous behavior): secondary main
  windows don't survive a quit/restart while disabled — verified upstream:
  `Session.save` captures every pane, but the startup restore reads only
  the FIRST pane state (`zoteroPane.js` — `windows.find(x => x.type ==
  'pane')`) and stock Zotero opens one main window. And reader-window
  content migrated into main tabs could lose its anchor (user closes the
  tab or the leftover single-tab window while the plugin is off), breaking
  the pull-back. Save-and-close has neither failure mode: the snapshot
  can't be edited while the plugin is off, so restarts while disabled are
  harmless — enable restores the exact disable-time state.
- **Merge secondary windows' tabs into the anchor**: survives restarts but
  destroys the user's window layout with no way to rebuild it on enable.
- **Close without saving**: plain data loss.

The trade-off accepted: the closed windows' content is not reachable
while the plugin is disabled (it lives only in the frozen store). Items
remain openable from the library as usual.

## Known gotchas

- **Legacy wrappers need one restart.** Sessions that hot-reloaded builds
  older than 0.15.3-dev.101 carry un-peelable wrappers from those builds
  (they stored no originals). `leftovers.js` flags them as wrapped
  `Zotero_Tabs` methods. One Zotero restart flushes them; from dev.101 on,
  wrappers are replaced on every reload and unwired on disable.
- **Better Notes interplay**: BN rebuilds note editors on its own schedule;
  give presence.js's editor sweep a beat (~5 s after enable) before calling
  a missing wire a failure.
- **The prefs window** caches panes; if Settings was open on the Weavero
  pane during disable, it navigates away — reopen Settings to re-check.
