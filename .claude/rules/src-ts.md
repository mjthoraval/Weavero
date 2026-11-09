---
paths:
  - "src/**/*.ts"
---

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
- TIMER HOSTS are closures over windows too: a `win.setTimeout` chain dies
  silently when `win` closes, and a lifecycle flag it was due to clear
  sticks forever (bg-restore teardown, 2026-09-01 — every later window
  open got fought). Long-lived tick loops re-resolve a live window per
  schedule (global setTimeout fallback), never bind the host once.
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
  pane.ts `_wvFixItemPaneCreep`, 2026-10-28). `wvInjectStyle(doc, id, css)` / `wvRemoveStyle`
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
- Never vary PADDING between Zotero tabs by state (selected, narrow...):
  they are `flex: 1 1 200px; box-sizing: border-box`, so while shrinking a
  tab with more padding comes out wider -- the selected tab grew ~6 px and
  every switch shifted the strip (2026-09-28). Give a title extra room with
  a negative margin on the title instead. Guard:
  `test/selected-tab-ring.spec.js`.
- A Weavero container that holds elements with native class names (a
  pinned `.row`, a copied `.cell`) needs a `wv-` ID, not just a `wv-`
  class: the shutdown sweep `_wvStripWindowChrome` removes `[id^='wv-']`
  whole but UNWRAPS a class-only `wv-` shell with native-classed children,
  on the assumption that it wraps native content. The collections-tree
  pinned rows were dumped into the tree on every reload that way
  (2026-09-25). Guard: `test/collections-tree-aids.spec.js`.
- A synchronous DOM walk never interleaves a style WRITE with a layout
  READ (scrollHeight, clientHeight, getBoundingClientRect, getComputedStyle):
  each write invalidates layout and the next read reflows the whole
  document. Reads first (collect), writes last; and walk only what the
  operation needs (the drag scroll-lock wrote on 6,709 elements of a
  snapshot -- every inline element "overflows" its 0 clientHeight -- and
  froze Zotero at every tab-drag start, 2026-10-15). Guard:
  `test/drag-overlay-locks.spec.js`.
- Tab-bar drags: the sliding gap never moves the real tab until the commit
  (`_wvCommitGapDrop`), so nothing may read a dragged tab's LIVE index for
  a verdict -- it is the pre-drag index (tabs.ts's pin/unpin verdict did,
  and unpinned the last pin on a drag that ended without a drop,
  2026-10-15). Pin/unpin and membership come from the previewed slot
  (`win._wvGapResult`), in the commit, one owner. A loose pin's real tab is
  display:none behind its mirror: mirrors are drag sources AND drop
  elements in `_wvDragCacheGeom`; a group stamp counts only when its group
  is live (`_wvTabGroupLiveStamp`). Guard: `test/pinned-drag.spec.js`.
- A WINDOW-level capture drag handler acts only over its own area: a
  `stopPropagation` / `dropEffect = "none"` it applies elsewhere reaches
  every drop target in the window first, iframes included. The reader and
  note windows' strip handler refused library items off the strip, and
  no note editor there could take an item as a citation for four months
  (2026-06-30 to 2026-10-30). Guard: `test/window-item-drop.spec.js`.
- Never set one `background-size` / `-position` / `-repeat` on a Zotero
  `.icon-css` element: its rules are several `background` layers (the
  item-type icons: the theme's icon at `contain`, then the white, light and
  dark variants preloaded at `0px auto`), and a single value applies to
  every layer, so the hidden variants paint under the icon (the header's
  own-count icon showed a white page in dark mode, 2026-10-30). Size the
  box; Zotero's `contain` fits it. Guard: `test/pane-scope.spec.js`.
- `winOf(node)` from `src/lib/dom.ts`, never `node.ownerGlobal` (renamed in
  FF153/Zotero 11; works on the dev platform, breaks silently later —
  `test/compat.spec.js` enforces this on the bundle).
- An HTML element toggled with `el.hidden` must not get an author
  `display:` rule without its `[hidden] { display: none }` twin: the author
  rule outranks the UA's `[hidden]`, and the element stays drawn whatever
  the attribute says (2026-10-27: the Backlinks "N more…" and the Links
  "N broken" bodies, `display: flex`, were always expanded while their
  toggles flipped nothing visible). Assert the COMPUTED display in a spec,
  not the attribute (links.spec.js's fold test).
- Boolean XUL attributes (`hidden`, `collapsed`, `disabled`, `checked`,
  `selected`): write them with `wvSetBoolAttr(el, name, on)` from
  `src/lib/dom.ts` (the literal `"true"` or the attribute removed) and read
  them with `wvIsHiddenOrCollapsed()` (hidden/collapsed) or
  `wvBoolAttrOn(el, name)` (any of them, platform-exact: presence on 11,
  the literal "true" on 10). `toggleAttribute(name, true)` writes
  `""`, which Zotero 10 (FF140) does NOT honour — measured 2026-09-23: the
  vbox stays visible, the menuitem stays enabled — while Zotero 11 (FF153)
  matches presence, where `setAttribute(name, String(cond))` is the trap
  ("false" = true). `compat.spec.js` forbids both wrong forms. Never read
  them with `=== "true"` / `!== "true"`, nor COPY them by value (an empty
  string is "on" on 11): the Edit-menu Undo takeover and the reader-window
  menu mirror both did (audit 2026-10-13; guards edit-menu-undo.spec.js,
  menu-mirror.spec.js).
- Reader plugin-menu items (`append(...)` in createViewContextMenu,
  createAnnotationContextMenu, createThumbnailContextMenu) carry an
  EXPLICIT boolean `disabled`: Zotero 11 renders each with
  `toggleAttribute('disabled', item.disabled)`, and a missing key toggles
  it ON -- every Weavero entry came out greyed (issue #57). A new handler
  goes through `wvReaderMenuEvent` (src/lib/dom.ts) at its entry. Guard:
  `test/reader-menu-disabled.spec.js`; upstream register #18.
- Menu icons on Zotero 11 (FF153) come only from `--menuitem-icon` (menu.css
  resets `list-style-image` to none on every menu/menuitem; the `image`
  attribute still works -- menu.js maps it onto the icon). A CSS-drawn menu
  icon sets BOTH (`list-style-image` for Zotero 10 and macOS native menus);
  a `<menu>` shows its icon only with `.menu-iconic`. A copied icon copies
  both. Guards: hidden-collections.spec.js, menu-mirror.spec.js.
- `<input type="search">` in a chrome document gets a NATIVE clear button on
  Zotero 11 (forms.css `::-moz-search-clear-button`): a box that draws its
  own × hides the native one (plugins-search.spec.js).
- Zotero 9 compatibility: plural-first selection APIs with singular fallback
  guarded on the plural's ABSENCE (the singular getters THROW on v10 — an
  `existence-check && call()` passes the check then throws inside).
- CSS `data-item-type` values are camelCase (`attachmentPDF`); kebab-case
  selectors fail silently.
- Chrome XML docs sanitize innerHTML SVG — build via `createElementNS`.
  Icons: viewBox must equal rendered size (1-px strokes blur otherwise);
  copy Zotero artwork verbatim where possible.
- A CSS `min-width` on an items-tree column is never alone: pair it with
  the column MODEL's `minWidth` (CSS = model + COLUMN_PADDING 16). Zotero's
  resizer clamps a drag at the model value and never reads CSS; a floor
  without its twin let a drag squeeze every other column (dev.13,
  2026-09-16). The twisty + icon prefix belongs to the FIRST column (lowest
  ordinal), not to the Title, so target it positionally (`:first-child`
  header, `.first-column` rows) and re-evaluate on
  `Columns#_updateVirtualizedTable` (reorder / toggle) and
  `ItemTree#_resetColumns` (the objects are rebuilt on every
  `itemtree/refresh` notification); restore by deleting the key when the
  column had none (Zotero's columns have none). Guard:
  `test/items-header-contain.spec.js`.
- A window that sets `customtitlebar` BY HAND (basicViewer loads no
  titlebar.js) gets Gecko's CSD -- the WM title bar goes away -- plus only
  what the PLATFORM skin happens to style: `scss/win/_titleBar.scss` makes
  `.menubar-container` a row and absolute-positions `.titlebar-buttonbox`;
  `scss/linux/_titleBar.scss` has no `.menubar-container` rule, keys its
  row on `#titlebar` and keeps the box in flow, so the Plugins Manager's
  drawn bar stacked into a 128px column on Ubuntu (issue #50, 2026-09-30;
  measured 2026-10-01). Drawn chrome ships its own row/box rules for every
  platform it runs on (the PM block's `@media (-moz-platform: linux)`,
  copied from the main window's compact-title-bar declarations) -- a rule
  that "the skin provides" is one platform's skin. And the attribute goes
  on BEFORE the window is first shown (DOMContentLoaded of the chrome
  document, as upstream's titlebar.js does at script time): set ~270ms
  after the show, GTK re-maps the window and it visibly opens, closes and
  reopens (2026-10-01). Its window NAME looks like the platform's own
  title: GTK centres it on the window in the system UI font (`font:
  caption`), bold; Windows keeps it left-aligned. A 12px regular name at
  the left read as a foreign bar on Ubuntu (MJT 2026-10-14). Guard:
  `test/plugins-chrome-platform.spec.js`.
- "Is this document open in a reader window?" also asks ZOTERO, not only
  Weavero's window state: a `ReaderWindow` is in `Zotero.Reader._readers`
  (its `_window` set by the constructor) the moment `Reader.open` creates it,
  while `_wvWT` comes up only after the window loads. The note-deck anchor
  picker read `_wvWT` alone and took a just-opened PDF window as its
  throwaway anchor -- then closed it (2026-10-13; guard
  `test/note-deck-anchor.spec.js`).
- A mark that follows the WINDOW COUNT (the anchor ⚓ and the colour dots,
  `_wvAnchorDecorVisible`) is re-evaluated when a main or reader window
  opens AND when one closes, on every platform. The close side leaned on
  the Windows taskbar overlay's close-repair pass (`_wvOvSetBadge` returns
  at once elsewhere) and on onMainWindowUnload's managed-window branch: on
  Linux a lone main window kept its ⚓ after a reader window or a natively
  opened main window closed (2026-10-14). A Windows-only subsystem never
  carries a cross-platform side effect. Guard:
  `test/anchor-mark-close.spec.js`.
- A pass that PERSISTS what it derives (a load-time migration or repair, a
  label sync) decides only from state that is there: "cannot tell" keeps
  the stored value, never takes a default. A group library's items are not
  loaded at Zotero startup (`Zotero.Items.get` THROWS for them until then),
  and a reader's page labels arrive after its document -- a catch that
  answered "global", or a fallback to the capture-time label, rewrote the
  bookmark store on every start and back on the next load (2026-10-13).
  Guard: `test/bookmark-store-flipflop.spec.js`.
- A window opened on ANOTHER document as host (`ww.openWindow` on
  basicViewer.xhtml for the hidden manager) inherits that document's
  window behaviour: its `persist` attribute (xulStore keys on the document
  URL, so the Plugins Manager's saved size is the same key) and its
  `onload="window.sizeToContent()"`. Remove `persist` before the first
  resize and size the window after the host's own load handler. An
  `unload` listener added right after `openWindow` also hears the initial
  about:blank document going away: add it inside the `load` listener and
  check the event target. Without this the dev.43 manager lost its handle
  at once (a second click opened a second window), grew to 8441px
  (`flex: 1` = a 0% basis, which resolves to `content` in a column of
  indefinite height), and wrote that size into the Plugins Manager's
  (2026-10-16). Guard: `test/hidden-collections.spec.js`.
- Zotero's own trees mount outside their pane: `win.require(
  "zotero/collectionTree")` -> `CollectionTree.init(host, opts)`, as its
  Select Items dialog does. The host must carry `#zotero-collections-tree`
  (the collection-tree icons and sizes key on that id); an instance
  `_includedInTree` decides the rows; `refresh()` / `reload()` leave
  `selection.selectEventsSuppressed` TRUE -- set it false after every
  reload or nothing hears the next selection; `_storeOpenStates` writes the
  pane's `sourceList.persist` unless replaced; `unregister()` at the host
  window's unload (a notifier observer otherwise outlives it). Zotero's
  `customElements.js` registers LAZILY: `customElements.get("search-
  textbox")` is undefined until one is created -- create it and check
  `inputField`. Guard: `test/hidden-collections.spec.js`.
- A tree's `getRowIndexByID` answers VISIBLE rows only: a row under a
  collapsed parent is `false` however long you wait. Never poll it for a
  row that may sit under a closed container -- `selectByID` /
  `expandToCollection` expands to the row and is the pane's own path (a
  manager drop under a closed collection waited its full 2 s before
  expanding, 2026-10-21, dev.113).
- Zotero state kept in ONE pref for every window (`pinnedPane`,
  `panes.<pane>.open`, `lastViewedFolder`, `sidebarState`, `pane.persist`)
  is watched by pref observers BOUND AT INIT (`this._restoreX.bind(this)`):
  wrapping the method later never reaches them. To make such state per
  window: unregister the element's observer (`_prefsObserverID`) and wrap
  the instance (item-details) or the window's own custom-element class --
  each chrome window has its own `customElements` registry, so
  `win.customElements.get("collapsible-section").prototype` is that window's
  alone; elements built after the wrap bind to it. Also look for the other
  readers (item-details re-reads `pinnedPane` on EVERY render). The first
  window keeps Zotero's pref (works without Weavero). Example: pane.ts
  `_wvWireWindowPanePrefs` (0.22.3-dev.47).
- A NEW main window's collection tree selects `lastViewedFolder` when it
  mounts (collectionTree.jsx makeVisible, not awaited), after a plugin's
  init has run: one `selectByID` from the init loses to it. Set the pref to
  the wanted row before the tree reads it (the adoption, window-wiring.ts)
  or re-assert until it holds (the clean path's enforcer, tabs.ts). A
  restored window's saved collection lost this race (2026-10-26, measured
  on a library-only window: C16 applied, L1 130 ms later). Guard:
  test/library-only-window-restart.spec.js.
- `Zotero.DB.queryAsync` BINDS its LIKE patterns (`LIKE ?`, `["%x%"]`),
  as Zotero's own queries do: an inline `LIKE '%zotero://%'` was refused
  on the dev instance ("Please enter a LIKE clause with bindings") and the
  backlinks index came up empty while the runner's copy passed
  (2026-10-22, dev.4).
- Fluent: `src/locale/<locale>/*.ftl`, shipped AS WRITTEN (the config's
  `build.fluent` turns the scaffold's renaming and id-prefixing off), ids
  spelled `weavero-…` by hand, the file linked into a window by
  `MozXULElement.insertFTLIfNeeded("weavero.ftl")` (the wiring table's
  `backlinks-ftl`). Zotero registers the directory itself at plugin start
  (xpcom/plugins.js registerLocales). An ItemPaneManager section takes
  l10n ids only: `header.l10nID` -> `.label`, `sidenav.l10nID` ->
  `.tooltiptext`, args through `setL10nArgs(JSON.stringify({…}))`.
  Plural selectors run under the UI locale's rules, not English ones:
  registerLocales copies the en-US file into EVERY Zotero locale's bundle,
  so under French `[one]` catches 0 ("0 Backlink", 2026-10-23, caught by
  the test runner's French locale, not by the en-GB dev profile). A count
  that must read plural at zero gets an exact `[0]` variant WITH the number.
  Every linked FTL file goes away at shutdown (`_wvBlRemoveFtl`, as
  make-it-red's removeFromWindow does): Zotero unregisters the plugin's
  locale files AFTER its shutdown (plugins.js unregisterLocales), and one
  linked file the registry cannot find makes the window's WHOLE
  Localization resolve nothing -- Zotero's own strings included
  (2026-10-26: item-pane headers and the column menu went blank). Guard:
  backlinks.spec.js "shutdown unlinks weavero.ftl".
- A dropdown Weavero draws itself (a div a click opens, as the filter's
  ▾ "Apply to" menus) sets its anchor's `title` aside while it is open and
  gives it back when it closes: Gecko keeps tooltips off a XUL menu
  button's open menu only, and the ▾'s tooltip rose over its own menu while
  the pointer rested on it (MJT 2026-11-02; a mousedown `wvDismissTooltip`
  hides only the tooltip already up). Never cancel or open the engine's
  tooltips instead (the stateful-engine incidents, the private
  tooltip-conventions notes). Guard: filter-icons.spec.js "a ▾ shows no
  tooltip while its menu is open".
- The items VIEW's `rowCount` / `getRow` bypass the filter's translation;
  a check of what a chip shows reads `rowProvider.getRowCount()` /
  `rowProvider.getRow(i)` (memory `reference_weavero_filter_rowprovider_count`;
  the Has Backlinks check read 441 raw rows for a 29-row view on
  2026-10-22 and chased a bug that was not there).
- Before removing or renaming a Zotero attribute to change a BEHAVIOUR,
  grep Zotero's scss for selectors on it and keep what they draw. The
  "stops at minimum width" setting removes the collections splitter's
  `collapse="before"`, and _splitter.scss keys the open splitter's
  zero-room geometry on exactly that attribute: a 5-px strip of window
  background, invisible on Windows (the same colour), dark on Linux
  (issue #63, 2026-11-04). Guard: collections-pane-toggle.spec.js "the
  open collections splitter takes no room".
- A Zotero pane Weavero builds outside `#zotero-pane` (the reader-window
  item pane, any pane in a window Zotero did not lay out) is passed to
  `Zotero.UIProperties.registerRoot`, as zoteroPane.js does for
  `#zotero-context-pane`: View -> Font Size and the density setting reach
  only registered roots (issue #63, 2026-11-04). Guard:
  reader-window-pane-ui.spec.js.

## fix: commits name their guard

Every `fix:` commit message states which regression guard now covers the
behaviour ("Guard: test/popups.spec.js", "Guard: live suite greyPairs
census", "Guard: manual-only — docs/taskbar-overlay-testing.md") or the
written exemption. /release audits this; /bugfix Step 6 is where the guard
gets created.

## Style

Match upstream Zotero for upstream-destined code: tabs; `let` over `const`
(const only for true scalar constants); no cuddled braces (`else`/`catch` on
their own line); `--` in comments, not em-dashes; new user-visible strings in
Fluent `.ftl` only. Comments state constraints and hard-won invariants (with
date/incident when non-obvious), never narration of the next line.

## CSS overrides must out-rank what they override

An override rule needs at least the specificity of the rule it undoes and
must come after it. `.annotation-popup .wv-md-preview { -webkit-line-clamp:
unset }` (2 classes) silently lost to the sidebar clamp
`.comment.wv-comment-preview .wv-md-preview` (3), so every in-PDF popup
preview was cut to 3 lines and could not scroll (issue #59, 2026-10-14).
When adding a clamp / hide / overflow rule, grep for the rules meant to
undo it and check their specificity; a spec reading the computed style in
both contexts is the guard (test/annotation-popup-preview.spec.js).

## Item-pane sections take Zotero's row geometry

A Weavero section's rows sit where Zotero's own do: the body 12 px in, each
row box 4 px padding, 4 px icon gap, 5 px corners (`_notesBox.scss`, shared
by Related; the `clicky-item` mixin), and a nested level 16 px further in by
margin (`_librariesCollectionsBox.scss`). Links and Backlinks started with
their own 4 px / 22 px and read as misaligned against Related (MJT
2026-10-28). Measure a new section against a native row in the same pane,
as test/links.spec.js "the sections indent as Zotero's Related rows" does.

An ITEM in such a row is drawn as Related draws one (relatedBox.js):
`getCSSItemTypeIcon(item.getItemTypeIconName(), annotation key)` and
`item.getDisplayTitle()` -- not a label of Weavero's own ("Annotation p. 26:
…", "This item"). Anything else a row says goes after the title, muted
(backlinks.ts `_wvBlEnd`; MJT 2026-10-29, "use the same pattern as in the
related section").

A block Weavero puts INSIDE one of Zotero's sections (pane-scope.ts, the
widened Tags / Related; each cost a build on 2026-10-29):

- `contain: inline-size` on it: a long line in it otherwise sets the pane's
  minimum width, and the header's buttons (Zotero's + and twisty too) slide
  out of view (dev.100: 422 -> 514 px in a 475-px pane). The same for ANY
  new line in Weavero's own sections (Links, Backlinks): a heading copied
  from the Tags / Related look without it held the Links section at 1053 px
  in a 410-px pane (dev.121). Check with the longest real title in a
  `width: min-content` host (links.spec.js "a long heading never widens
  the item pane"). The section HEADER too: counts added to Zotero's title
  box held the item details at 413 px in a 320-px pane (dev.130), every
  section's right end -- Zotero's own Attachments header included -- under
  the side navigation; the title box is contained and the counts fit by
  dropping (pane-scope.ts `_wvScopeFitWire`). Measure a section's minimum
  width as `width: min-content` on the section itself, not on a parent (a
  parent's stretch hides it).
- `data-wv-owned` on it when anything inside carries a Zotero class (an
  annotation icon's `annotation-icon`): the shutdown sweep
  (`_wvStripWindowChrome`) UNWRAPS an all-`wv-` element that holds native
  content, and left every such icon on the section at each reload, 514 px
  wide (dev.99: 280 after one reload). Guard by running the sweep on a copy
  in a scratch document (pane-scope.spec.js), never on the live window.
- A header changed through `data-l10n-args` gets an explicit
  `doc.l10n.translateElements([section])`: Fluent's own observer left
  Zotero's "5 Tags" in place (backlinks.ts `_wvBlSetHeader` met the same).
- Find Zotero's item-pane sections by their pane id (`tags-box[data-pane=
  "tags"]`): the note editor's links box holds a `tags-box` and a
  `related-box` of its own, without one, and with no item.

## Editing mechanics

Use the native Edit/Write tools. Quote-heavy or backslash-heavy scripted
patches: write the patch script with the Write tool and run `python file.py` —
bash heredocs eat one backslash level and have corrupted source before.
Size-delta sanity after writes: a one-line change never shrinks a file by
hundreds of bytes.

## Inline SVG inherits the container's fill/stroke

`.wv-filter-svg` (and friends) set `fill: currentColor; stroke: currentColor`
so that `<img src="chrome://…">` icons theme correctly. An **inline** SVG
built with `createElementNS` is a different animal: its children INHERIT that
stroke, so a shape declaring only a fill still gets a 1-px outline — 1-px bars
render 2 px and the glyph reads thick. Opt out on the root with
`svg.style.stroke = "none"` (a `stroke` *attribute* loses to the class rule);
children that want a stroke set their own, which still wins.

This is invisible to standalone rasterisation: serialising the same markup to
a data URI and drawing it to a canvas shows it crisp, because the class rule
never applies there. **Verify icons in situ** — `getComputedStyle` on a child
of the rendered node — not on a copy (2026-08-20, three rounds lost to it).

A `chrome://zotero/skin/…` icon path is a claim: check that the file EXISTS
(`await fetch(url)` in the running Zotero; `naturalWidth > 0` on the img), not
just that the name matches. Not every icon lives in `16/universal/`: Zotero's
scss `icon-url('x.svg')` resolves against the skin ROOT, so the Tags section's
`tag-fill.svg` is `chrome://zotero/skin/tag-fill.svg` -- the
`16/universal/tag-fill.svg` that dev.23 used does not exist and drew a
broken-image square (MJT 2026-10-23). A spec asserting the file name passed;
the guard now fetches it.

Match the native DRAWING, not just the colour: an icon shown at 12 px uses
Zotero's 12-px drawing when one exists (the skin-root `tag.svg` /
`tag-fill.svg` of the Tags section), never a 16-px one shrunk -- its 1-px
lines become 0.75 px and the same fill reads darker (MJT 2026-10-26, "Not the
right color for automatic tags", with the fill measured equal to Zotero's).
Read what the native element draws (`getComputedStyle(el).backgroundImage`
or `content`) before picking a path.

Zotero's context menus `#zotero-collectionmenu` and `#zotero-itemmenu` are
addressed **by child index** in `buildCollectionContextMenu` /
`buildItemContextMenu` (`menu.childNodes[i]`; ids, labels and commands are
rewritten on every build). Never insert anything before Zotero's own children
there — dev.37 turned "Open in New Window" into "Sync" and renamed Zotero's
separators (2026-09-22). Plugin entries live after them, MenuManager's group
separator marks the boundary, and MenuManager refuses a whole registration
that carries a top-level separator for those targets.

The menubar stays Zotero's own: never hide a native menubar item because a
Weavero surface (the hamburger) also offers it. Where the two would show
together -- the hamburger's cascades ARE the live native popups -- hide
only while the popup is open from there (`anchorNode` inside
`#wv-hamburger-popup`), marked, and restore on `popuphidden`. Hiding
Settings / Plugins / Exit for good left Edit ending on a bare separator
(MJT 2026-10-13). Guard: test/menubar-window-entries.spec.js. ADDING
entries is fine and decided: File's New Tab / New Reader Window / New
Main Window and Edit's Advanced Search in New Window stay in the menubar
(MJT 2026-10-13, "It is good as it is") -- do not re-raise.

An element Weavero adds to a NATIVE menu carries a `wv-` id, not just a
`wv-` class: destroy's chrome sweep (`_wvStripWindowChrome`) removes id'd
elements whole but UNWRAPS a class-only element whose descendants have
other classes -- a rendered XUL menuitem's `img.menu-icon` / `label.menu-
text` -- and the View -> Layout items left twelve stray img / label nodes
in the popup on every reload (2026-10-14). The only hide of native
menubar items is View -> Layout's library items in reader / note tabs
(zotero#2814, MJT's call), restored on popuphidden.

## Decorating a XUL `<splitter>`: never a child, never its neighbour

The splitter captures the mouse on press (`PresShell::SetCapturingContent`),
so a button placed INSIDE it gets no click of its own: mouseup and click
land on the splitter. And it resizes / collapses its IMMEDIATE siblings
(`collapse="after"` sets `collapsed` on the next sibling; `resizebefore /
resizeafter="closest"` resize the nearest one), so a 0-height host next to
it would be the thing collapsed or asked to grow. And it PAINTS NOTHING of
its own: neither children nor `::before` / `::after` get a box (verified
2026-10-14: a red `::after` and a blue child both invisible while a red
background painted -- and `getComputedStyle(sp, "::after")` still reported
the pseudo's width, so computed style is no proof of a box). Draw the
decoration in a `position: fixed` host elsewhere in the pane (at its end),
placed from the splitter's rect on a ResizeObserver of the splitter's
neighbours. A drag resizes EVERY child of the pane box except XUL elements
marked `fixed` / `hidden` (CollectChildInfos checks nsXULElement only):
an HTML host got `height: 0px` written on it; make the host a XUL `box`
with `fixed="true"` (it paints `::before`; a splitter does not), and give
it an `!important` height anyway. Let the host take the click itself --
a pill drawn half outside the 5 px band is not clickable through the
splitter. The Tag Selector handle is the worked example (pane.ts
`_wvApplyTagSelectorHandle`, 2026-10-14).

A foreign node as the FIRST child of a React-rendered container survives
React's reconciliation (React inserts and removes its own nodes around it,
and drops the container whole on unmount -- re-add the node on the next
ensure, with a MutationObserver that is mutation-quiet: compare before
every attribute write). The reader selector handle is the worked example
(`_wvAnnSelHandleEnsure`). Never put a class on a React element's `className`
host: key CSS on the foreign child (`:has(> .wv-sel-handle)`) instead.
