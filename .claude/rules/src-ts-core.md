---
paths:
  - "src/**/*.ts"
---

> TypeScript source rules, part 1 of 4: naming, structure, lifecycle, listeners, wiring and wraps.
> Split by topic so that each file loads whole; all four load for `src/**/*.ts`: **core** (this file), [DOM, CSS and XUL](src-ts-dom.md), [windows and readers](src-ts-windows.md), [commits, style and UI](src-ts-ui.md). Index: [src-ts.md](src-ts.md).

# TypeScript source rules (GitHub/src)

## After every Edit/Write

`npm run typecheck` — 0 errors before anything else happens.
(A Stop-hook safety net also runs it, but don't rely on the net.)

## Naming is namespacing

Everything Weavero adds to shared surfaces is prefixed: `_wv*` methods and
window/DOM expandos, `wv-` DOM ids/classes, `weavero.` prefs (full branch
`extensions.zotero.weavero.*`), `Weavero.*` AUMIDs. Never add an unprefixed
name to a Zotero object, window, or document.

## Structure

- New methods go in the right `modules/*.ts` bundle as
  `function(this: WeaveroPlugin, …)`; they land on the prototype via
  `Object.assign` in index.ts. Accessor pairs need `defineProperties` mixing
  (see the `filterMethods` comment in index.ts).
- Reusable multi-instance widgets follow upstream's `XULElementBase` pattern
  (init()/destroy()/content getter, customElements.define) — not build-by-hand.
- ONE URL rule: anything that finds links in text uses `lib/links.ts` --
  `this.URL_REGEX` (buildUrlRegex) for a test or a match, `urlPattern(alt)`
  inside a tokenizer's alternation. Never rebuild `URL_SCHEME_ALT + body`
  by hand: the two comment renderers had their own copies, so a rule added
  to one surface left the others showing links the badge did not count
  (issue #56, xmlns values, 2026-10-14).
- ONE undo rule: the bookmark and outline stores record their steps at
  their write choke point (`_bmPersist`, `_wvOutlinePersist`). A new edit
  goes through the store's setter or persist and records itself; never
  push a step by hand (it would count twice). A gesture that writes
  several times runs inside `_wvUndoBatch` -- never held open across a
  dialog, the batch depth is global. A write that is NOT the user's
  (repair, migration, a box navigation establishes, a label sync) goes
  through the store's silent persist and patches the pending baseline
  with what it changed, or a gesture in progress takes it for its own.
  Until survey §3.7 (2026-10-17) the outline recorded only add and delete
  by hand, and Ctrl+Z after a rename or reorder undid an older step.

## Survival rules (each paid for with a regression)

- Defensive boundaries: `try {} catch (e) {}` at every event/lifecycle
  boundary — a Weavero bug must never break core Zotero. Log via
  `Zotero.debug("[Weavero] …")`, never `console`.
- Persistent listeners resolve the live plugin AT EVENT TIME
  (`Zotero.Weavero && Zotero.Weavero.plugin`) — closures over `this`/`self`
  go stale across reloads. Async-setup continuations: liveness-check
  (`this._wvDestroyed`) after every await -- `init()` itself included, and
  every retry on a WINDOW timer (it outlives destroy()): an install then an
  immediate reload let a half-initialized instance wire the windows after
  its destroy(), its plain listeners stayed for the session (2026-10-13,
  guard `test/destroyed-instance-wiring.spec.js`); callbacks
  self-neutralize; long-lived listeners go through `wvListen` (see below),
  not hand-bumped `_wv*Wired` stamps.
- OBJECTS HANDED TO THE READER ARE BUILT IN THE READER'S WINDOW. The
  reader (`reader._internalReader`, its views) refuses an object made in
  the plugin's sandbox: "Permission denied to pass object to privileged
  code", thrown or as a rejected promise, often inside a try that hides
  it. Wrap every argument object or array:
  `Cu.cloneInto(obj, reader._iframeWindow)` (pdf.js view: its own
  `_iframeWindow`). Strings and numbers pass as they are. Specs with a
  stand-in reader cannot see this boundary -- verify reader calls live.
  (2026-10-05: the annotation-undo scroll and selection were rejected on
  every real Ctrl+Z while the spec passed.)
- A READER EVENT'S `doc` IS THE PAGE'S OWN VIEW. Zotero hands
  `renderSidebarAnnotationHeader` & co. `event.detail.wrappedJSObject`
  (xpcom/reader.js), so `doc`, and every element built with it, is waived:
  chrome-only members are ABSENT there, silently `undefined`
  (`defaultView.browsingContext` measured 2026-10-28; `mozInnerScreenX` stays
  a number). The same element reached through
  `reader._iframeWindow.document` (a re-inject pass, a probe) is an Xray and
  has them -- so a live check through the bridge passes while the
  event-built button fails. Unwaive before reading one:
  `Cu.unwaiveXrays(el.ownerDocument.defaultView)`. (2026-10-28: the reader's
  Backlinks popup opened inside the reader page instead of the main window;
  guard backlinks.spec.js reader test.)
- WINDOW DRAG AREAS EAT REAL CLICKS. Zotero's tab bar / title bar AND the
  reader toolbar's empty space (`.toolbar`, measured 2026-10-01) carry
  `-moz-window-dragging: drag`: the OS takes a real press there and NO DOM
  event fires (no pointerdown, mousedown or click), while synthetic events
  dispatched in a spec or probe work perfectly. Two consequences: (1) any
  element Weavero puts there sets `-moz-window-dragging: no-drag`; (2) any
  Weavero popup/menu whose "click outside closes it" must cover such an
  area sets the area to `no-drag` while open and restores it on close
  (`_wvTabShowHistoryMenu` / `_wvCloseReaderBmContextMenu`). Before
  wiring a dismiss or a click handler near a strip or toolbar, check the
  element's drag value; a "real click does nothing" report there is THIS
  until proven otherwise. Hit three times (tab-group chips 2026-06; outline
  header-strip History menu 2026-09-30; toolbar History menu 2026-10-01).
  FIREFOX 153 (Zotero 11) keeps the property OUT OF CSSOM: CSS.supports()
  is false, `getComputedStyle(...)` reads "" and an inline
  `style.setProperty(...)` / `style.MozWindowDragging = ...` is DROPPED in
  every document. Set it with a SHEET rule (keyed on a class or attribute):
  sheets still apply in chrome:// and resource:// documents (main window,
  reader iframe), not in about:blank ones. Read it with
  `InspectorUtils.getMatchingCSSRules(el)`. Found 2026-10-12 (the undo
  menu's toolbar no-drag was dead on 11); guard compat.spec.js.
- A CLICK-OUTSIDE DISMISSER TESTS "INSIDE" WITH `wvWithin(el, e.target)`
  (lib/dom.ts), never `el.contains(e.target)` or `composedPath()`. A real
  press on the element's own scrollbar targets the scrollbar's
  native-anonymous `thumb`/`slider`/`scrollbar`. It is not retargeted, and
  for a popup in the reader's iframe it arrives only in the main window's
  document. Neither `contains()` nor `composedPath()` includes the popup,
  so every press on its scrollbar closed it (issue #55, 2026-10-13).
  `closest()` does cross that boundary. A scripted mousedown dispatched at
  the thumb IS retargeted, so the bug never shows in a spec that dispatches
  events: hand the thumb to the check or the handler directly
  (test/outside-dismiss-scrollbar.spec.js).
- THE READER CANCELS PRESSES IN `reader.html`. FocusManager calls
  `preventDefault()` on every pointerdown outside its exemption list
  (inputs, `.annotation`, `.thumbnails-view`, `.outline-view`, `.preview-popup`,
  ... -- zotero/reader src/common/focus-manager.js). So anything Weavero
  injects there gets no `:active` on press (Zotero's own buttons get
  the `active-pseudo-class-fix` class instead), and the press's
  mousedown/mouseup never reach `reader.html` -- only the main window's
  document sees them. Wire a press handler on `pointerdown`, or listen in
  the main window. Presses on native scrollbars are exempted by Weavero's
  WV-TEMP-134233 (`_wvReaderScrollbarPressFix`, reader.ts) until upstream
  fixes forum 134233 (2026-10-13).
- XUL `popupshowing`/`popuphidden` BUBBLE: every handler on a menu that can
  contain a submenu (native Move To / Copy To, Weavero's own Copy As / Add
  Bookmark) early-returns unless `ev.target === menu`, and a cleanup
  listener is never `{once: true}` on such a menu (a bubbled submenu close
  consumes it). Otherwise a submenu closing on cursor-move strips the
  injected entries — or removes the whole open menu — mid-hover (issue #8,
  fixed v0.11.4 in pane.ts only; every entry added since without the guard
  regressed it, swept 2026-09-03). Guard: test/menu-bubble-guard.spec.js.
- WHAT A TAB SWITCH SHOWS is set IN Zotero's `select`, never only from the
  `tab` notifier: `Zotero.Notifier.trigger` calls its first observer in the
  call and each later one after an `await` (microtasks, or later tasks behind
  any observer that awaits), so a pane put away from an observer -- plus a
  timeout -- is painted late. Zotero's select (10.0.8 and 11) ends with the new
  tab content's `onTabSelectionChanged(true)`: a non-bubbling
  `tab-selection-change` on its `tab-content` (every tab type, a plugin's
  too); a capture listener on `#tabs-deck` hears every select, the tab bar's
  included (it calls a `select` bound at Zotero's init, past any wrap of
  `Zotero_Tabs.select`). The People tab was painted with the last reader's
  item pane beside it (MJT 2026-11-24; people.ts `_wvPeopleWireSelect`,
  tab-split.ts `tsplit:selchange`). Guard: test/people-pane-sync.spec.js.
- A XUL MENU IS SIZED BY ITS FIRST LAYOUT, the one that shows it: a closed
  menupopup's content has no layout and no computed style (every read 0,
  every property "", 10.0.8 and 11 measured 2026-11-24), nor at
  `popupshowing` (XUL makes its frames after that event). Whatever sets the
  size of a menu's content -- a "More" decided by measuring, a picture's box
  -- is settled BEFORE the open, never at `popupshown`: that is a native
  resize of a menu already on screen, a visible second step (the reference
  card's menu, MJT 2026-11-24). Measure on an off-screen double in the same
  document carrying the menupopup's computed font (refs.ts
  `refsCardMoreAhead`); give a picture its box before it loads
  (`refsGaBoxSize`). Guard: test/refs-menu-once.spec.js.
- TIMER HOSTS are closures over windows too: a `win.setTimeout` chain dies
  silently when `win` closes, and a lifecycle flag it was due to clear
  sticks forever (bg-restore teardown, 2026-09-01 — every later window
  open got fought). Long-lived tick loops re-resolve a live window per
  schedule (global setTimeout fallback), never bind the host once. Cancel
  on the clock that set the timer: a `wvTimeout` handle passed to a
  window's `clearTimeout` is never cancelled (another clock's id -- at worst
  it cancels an unrelated window timer of that number). The filter's
  data-change debounce did that from 0.22.0 to 1.0.5-dev.9, so every
  notification started a re-apply ladder of its own (guard
  per-window-state.spec.js).
- `onMainWindowLoad` fires at the window's `load` event (xpcom/plugins.js),
  BEFORE ZoteroPane.init has created `itemsView` / `collectionsView` (it
  awaits initItemsTree, then initCollectionsTree). A wire that needs a pane
  view and returns when it is absent silently skips every window opened
  mid-session; the first window never shows it, because init wires that one
  after its views exist. Mark such a wiring-table entry `views: true` (it
  then runs through `_wvWhenPaneViewsReady`). Found 2026-10-09: a second
  window had no collection-select guard, no collections-tree aids and no
  setFilter / changeCollectionTreeRow / selectItems wraps. Guard:
  `test/window-wiring.spec.js` (the parity test).
  `views: true` promises `itemsView`, NOT `itemsView.tree`: the view can
  exist first. A wire that needs the table waits for it instead of returning:
  title lines stayed off in a new window in 2 runs of 3 (`iv=true tree=false`,
  2026-11-05, `_wvApplyTitleLines`).
- PER-MAIN-WINDOW wiring is ONE ordered table, `WV_MAIN_WIRES` in
  `src/modules/window-wiring.ts`: onMainWindowLoad runs every entry, init
  runs the `on: "both"` ones for the window already open. A new step goes
  in the table (`both` unless it is a plugin-wide re-assert, a timer for a
  restoring window, or something init already does for every window) --
  never into onMainWindowLoad or an init loop of its own. Until 2026-10-09
  init repeated the steps by hand in ~15 "onMainWindowLoad only fires for
  new windows" loops, and the lists drifted. Guard:
  `test/window-wiring-table.spec.js`.
  STANDALONE READER windows have their own table, `WV_READER_WIRES`, with
  three paths: `render` (the reader's renderToolbar event), `init`, and
  `pref` (the reader "Hide title bar" toggle). A new reader-window step
  goes in it, on every path whose trigger can leave the window without it.
  Until 2026-10-12 each path called its own subset: with the title bar
  kept, a reload dropped Edit > Undo, Ctrl+Y and Move to Tab, and a window
  opened that way had no taskbar identity. Guard:
  `test/zz-reader-window-wiring.spec.js`.
- Wraps installed on LONG-LIVED Zotero objects (itemsView, rowProvider,
  windows) stamp themselves with `this._wvWireTag()` — build version PLUS a
  per-instance nonce — never a boolean and never a hand-bumped constant. A
  foreign stamp means "wired by another INSTANCE": peel the own-prop wrapper
  with `delete` (wrapped members must have a live prototype fallback) and
  wire fresh. Booleans shipped the hot-upgrade filter death (2026-08-25:
  stamps survived the upgrade, the new instance skipped wiring, the filter
  went silently dead until restart); build-only stamps shipped the SAME
  death on a same-build reload (2026-09-10: install + plugin_reload, the
  new instance found its own build tag and skipped, `setFilter`'s re-apply
  kept running on the dead instance — clearing a quick search dropped the
  chip; every bridge verification after a reload had run on a half-dead
  filter). Guard: `test/wire-stamps.spec.js`.
  Members of the `Zotero.Notes` / `Zotero.Reader` singletons (`open`,
  `getWindowStates`, `getByTabID`) are OWN properties with no prototype
  fallback and carry several Weavero layers: the peel there is a restore
  of the INNERMOST saved original with every stamp deleted
  (`_wvSingletonPeel`, used by destroy() and by each foreign-stamp
  re-wire). A hand-bumped `WV_OPEN_PATCH_V` guarded them until 2026-10-07,
  and destroy() restored only the outer `getWindowStates` layer, leaving a
  dead inner wrapper live after every disable.
- SHARED HELPERS in `src/lib/` are the canonical spellings (survey
  2026-10-06 step 3; guard `test/lib-helpers.spec.js`):
  `wvLivePlugin()` — the live instance or null; never `|| self` / `|| this`
  (a captured instance kept acting after disable at eleven sites).
  `wvWrap(host, member, layer, tag, make)` / `wvUnwrap(host, member, layer?)`
  — layered, tag-stamped method wraps on long-lived objects: the chain is
  rebuilt from the native on every change, foreign-instance layers drop,
  a prototype original is deleted and an own-property one restored
  (`Zotero_Tabs` getState/close/restoreState/markAsLoaded/select,
  itemsView.selectItems; the filter's row-provider translation is the
  "filter" layer set reading `rp._wvFilterView` — an apply publishes a
  view, it never re-wraps; the manual-expand tracker is the
  "userOpenTracking" layer under it). A wrapper forwards EVERY argument
  (`orig.apply(this, arguments)` or `(a, ...rest) => orig(a, ...rest)`),
  never a fixed list: Zotero 11 added `Zotero_Tabs.close(ids,
  { skipHistory })` and the tracing layer's `origClose(ids)` dropped it
  (2026-10-12; guard tabs-wrap-args.spec.js). A Zotero handler written as
  an ARROW-FUNCTION FIELD (`_handleContainerScroll = () => {...}`) is an own
  property of each instance, and `init()` registered THAT function as the
  listener: wrapping the property changes nothing the event calls. Swap the
  listener with the property both ways (remove the old value, add the new
  one, on wrap and on unwrap); Zotero's own `destroy()` / re-`init()` then
  stay consistent because they read the property (item-pane creep fix,
  pane.ts `_wvFixItemPaneCreep`, 2026-10-28). `ZoteroContextPane.update` is
  one too (its window `resize` listener): the window takes trusted resize
  events at an UNCHANGED size whenever Zotero recomputes its layout
  constraints, so a wrap that missed the listener was undone within the same
  second (tab-split.ts `_wvTabSplitStackWire`, 2026-11-17). And a ReaderTab
  setter that awaits (`setBottomPlaceholderHeight`, `setContextPaneOpen`:
  `await this._initPromise`) lands after the current task: reading the
  reader's state right after Zotero called one sees the OLD value. `wvInjectStyle(doc, id, css)` / `wvRemoveStyle`
  — a sheet is always replaced, never skip-if-exists or version-stamped.
  It finds its sheet with `doc.getElementById`, which cannot see into a
  shadow root: a sheet that must live in one is looked up there
  (`sr.getElementById`), or it is appended again on every pass.
  `wvWhenWindowLoaded(w, fn)` — the only way a window-mediator listener
  (onOpenWindow) waits for a new window: on Firefox 153 the window arrives
  holding its initial about:blank, already "complete", and a
  `readyState === "complete"` check there never saw the real document
  (Software Update version line, pop-out note windows; 2026-10-12, guard
  window-load-timing.spec.js).
  `wvStoreWrite` (lib/store.ts) is the only writer of the JSON stores: it
  retries a write the OS refuses for a moment -- on Windows the atomic replace
  needs delete access to the target, which an antivirus scan or an indexer
  holding the file denies -- where a private `IOUtils.writeUTF8` would drop it
  and resolve as if written (2026-11-20; guard lib-store.spec.js).
  Every other replace, removal or rename under `weavero/` that the OS may
  refuse for a moment goes through `wvStoreRetry` (lib/store.ts), its
  schedule; a retried `IOUtils.move` of a FOLDER first looks at what the
  refused move left: Gecko leaves an empty target folder, and a move onto an
  existing folder nests the source inside it (a staged backup restore gave up
  on one refused replace or rename and used up the staged restore, backups.ts,
  2026-11-28; guard backups.spec.js "(Windows)" tests).
  A store's FILES are removed under a live writer only after `wvStoreSettled(dir)`
  (lib/store.ts): a write its caller never awaits (cited-by's entries files) lands
  after the removal and brings the folder back. And a background pass that holds
  the store in memory runs in an EPOCH its reset moves (cited-by.ts `_wvCbHalt` /
  `_wvCbReset`): the pass halts at its next check and its end writes nothing, and
  a load overtaken by the reset is never published. Remove Built Data
  (sdt-build.ts `_wvSbCleanRun`, 2026-11-24; guard sdt-clean.spec.js "a Cited by
  pass under way").
  The one exception is a DIAGNOSTIC trace that must reach the disk while the
  main thread is blocked: `wvTraceFilePush` (lib/trace-file.ts) dispatches
  its `IOUtils` write at the call, where `wvStoreWrite` starts its I/O from a
  promise continuation that a blocked thread never runs; it is never read
  back (filter-trace.json, MJT's freezes of 2026-11-22; guard
  filter-trace-file.spec.js).
  `wvTimeout` / `wvSleep` / `wvClearTimeout` — the sandbox clock for
  plugin-level work. Published as `Zotero.Weavero.lib` for the suite.
  `wvListen(target, key, type, fn, opts, tag)` / `wvListener(tag)` /
  `wvUnlisten(target, key)` — every listener on a LONG-LIVED target (a
  window, a document, a native element, a reader or note-editor frame,
  an element cached by id across instances): keyed per target, replaced
  when another instance wires the key, removed by destroy()
  (`wvUnlistenAll`), and refused once the instance is destroyed (its
  retry timers still fire). Never a boolean or version stamp next to an
  `addEventListener` (a reload skipped wiring and the old code kept
  running), and never a plain `addEventListener` on such a target (it
  doubled per reload). Key prefixes the reload audit understands:
  `boot:` (app startup only), `lazy:` (wired on first use). An element
  Weavero builds once and caches by id (a menupopup, a tooltip, an
  overlay) carries `data-wv-tag` and is rebuilt when the tag is another
  instance's. Guard: `test/zz-reload-listeners.spec.js` (records every
  listener whose function belongs to the previous instance after a
  reload; 95 kinds on 2026-10-12 before the migration).
  destroy() reaches reader pages only through `Zotero.Reader._readers`
  (`_wvReaderPageTeardown` per reader): code that takes a reader OUT of
  `_readers` while its page stays loaded (a reader window dropping its
  native tab, as a deck window does) runs `_wvReaderPageTeardown(reader)`
  itself first -- else that page keeps the instance's listeners for good
  (2026-10-13).
  EVERY wrap, prototype patch, page global switch and observer has its
  give-back in destroy(), not only in a window's unload: a disable must
  leave nothing of Weavero in a slot Zotero calls. A wrap that "checks for
  a live plugin" is NOT enough -- under zotero#6080 a plugin's scope is
  nuked 10 s after unload and any function left behind becomes a dead
  object inside Zotero. Keep the original where the give-back can find it
  (`wvWrap` does this; a hand-written wrap stores `_wvOrig*`, and a
  prototype member is given back by `delete`). `delete` is right ONLY when
  the native was inherited: a CLASS FIELD is the instance's own property
  (CollectionViewItemTree's `_handleSelectionChange`, 10.0.8 and 11), and
  deleting the wrapper left ItemTree's prototype method -- Duplicate Items
  selected one item until a restart, after any reload, upgrade or disable
  (2026-11-11; guard selection-native.spec.js). Check `hasOwnProperty`
  before wrapping and keep the native. Objects Weavero hangs on
  the `Zotero` global go in `_wvReleaseGlobalState`. Guard:
  `test/zzz-disable-leftovers.spec.js` (disables the plugin and sweeps
  Zotero's singletons, windows, views, row classes, readers and note
  editors for functions from Weavero's global; 69 found on 2026-11-11).
  An OPTIONS OBJECT (`{ capture, passive, once }`) passed to a CONTENT
  target (a reader or pdf.js frame, a note editor's document) is a
  chrome object the content side cannot read: the listener silently goes
  on with the defaults -- bubble, not passive, not once -- and a
  capture-phase removal never matches. `wvListen` hands the target its own
  copy; a plain `addEventListener` there passes a boolean or
  `wvEventOpts(target, opts)` (the URL tip's listeners survived every
  reload this way until 2026-10-12).
- Inside a wrapper installed ON a host object (`rp._refresh = async
  function (...) {…}`, `iv.setFilter = …`), `this` is the HOST, not the
  plugin: never call `this._wv…` there — resolve the live plugin
  (`Zotero.Weavero && Zotero.Weavero.plugin`) at call time. A refactor
  that replaced an inline test with `this._wvIsStructuralRow(row)` inside
  the row provider's refresh threw "not a function" on every search
  refresh for six weeks, swallowed by a catch (found 2026-09-10 only
  because a debug-storage run happened to show "cleanup err").
- Zotero's INDEX-BASED row helpers (`_refreshContainer`, `_toggleOpenState`,
  `expandRows`, `_expandMatchParents`, the notify paths that walk
  `_rowMap`) read `getRow` / `isContainer*` / `getLevel` through the row
  provider but splice `_rows` DIRECTLY. Never call one while the filter's
  keep[] translation is installed: `_pauseFilterPatches()` first (or the
  `_wvFilterSelfCall` SELF flag, as the cascade branch does), mutate, THEN
  `_applyItemsListFilter` so keep[] is computed against the final rows.
  The setFilter wrapper ran its container re-refresh AFTER the apply for a
  month: the translated reads resolved a different row than the raw index
  being spliced, the close loop ate unrelated top-level rows, and every
  everything-mode search landing under a chip lost a full-text-only
  parent (search-modes 86/88, 2026-09-10). Guard:
  `test/setfilter-order.spec.js` + live `search-modes` scope-menu cases.
- An items-list filter apply the USER asked for passes `{ deliberate: true }`
  (or `{ cascade: true }`): `_applyItemsListFilter` DROPS a plain apply that
  lands inside the post-apply suppression window or while another apply runs
  -- by design, those are the tree observer's own re-applies, whose retry
  would loop -- and retries only flagged ones (`_wvScheduleCascadeRetry`).
  Clear all and a chip's x applied plainly: within ~1 s of clearing a quick
  search they were dropped, and the list stayed filtered under an empty
  filter state (seen 2026-10-02, fixed 2026-10-13; guard
  `test/filter-deliberate-retry.spec.js`).
- NOTIFIER OBSERVERS registered on the Zotero global are long-lived
  hooks like the wraps: stamp them with `this._wvWireTag()` and
  re-register on a mismatch. `_wvWireFilterCacheInvalidator` guarded on
  `if (g._wvFilterCacheObsID) return;`, so after every hot reload the
  PREVIOUS BUILD's `notify` stayed registered and no edit to that
  observer took effect until a full restart (2026-09-14: a new
  post-edit re-apply did nothing while the method was demonstrably on
  the live instance; only a stamped re-register fixed it). Same rule as
  the pref watchers (`_wvOutlineTakeoverPrefObs`), which already do it.
- SNAPSHOTS captured by a wrap are only valid for the operation that
  captured them. `_wvBaseSearchIDs` (captured in the `getItems` wrap) is
  stamped with `_wvRefreshSeq`, and the `_refresh` wrap re-applies it only
  when the stamps match; a fresh collection-tree row is wrapped INSIDE the
  refresh so the stamp exists. Before that, switching to a saved search
  re-applied the previous view's ids and dimmed 17 of 18 results as
  context rows (2026-09-14). Guard: live `interactions.js` section C.
- ONE-SHOT ARMED LISTENERS on content documents (the select-region and
  pin-placement arms) are the same failure family: the listener closures
  survive plugin reloads on the content doc, and a stale arm CONSUMES the
  user's next gesture (2026-08-26: a zombie select-region arm collapsed
  every EPUB selection 13ms after mouseup — "Edit Region does nothing" was
  undiagnosable at the call sites). Every arm stamps a per-reader
  generation (`reader._wv*ArmGen` — `reader` survives reloads) and checks
  generation + live plugin instance on its FIRST event, self-detaching when
  stale. Never arm without both checks.
- INJECTED DOM outlives the build that injected it: on a hot reload the
  OLD build's teardown runs (whatever it knew to remove), then the NEW
  build injects into what is left. An "if it exists, skip" guard on an
  injected `<style>`/box therefore keeps the previous build's rules alive
  (2026-09-09: the Plugins Manager clear-× min-size fix was invisible in
  the open window because dev.20's stylesheet was still there). Injection
  REPLACES what it owns; teardown removes everything it injects; a guard
  spec re-injects after a simulated teardown. Guard:
  `test/plugins-search.spec.js`.
- The same in a note editor's ProseMirror: a plugin swapped in one
  `reconfigure` under the SAME key keeps the OLD plugin's state field (only
  new keys run `init`), so a note open across an update carries the older
  bundle's state shape. Read a plugin's state through a normaliser that
  fills what an older shape lacks, and let `apply` start from it -- never
  assume `init`'s shape (2026-11-09: 1.0.0's fold state had no `lists`;
  in notes open across the 1.0.1 update the list arrows folded nothing and
  typing threw). Guard: `test/note-fold.spec.js` ("a note open across an
  update from 1.0.0").
