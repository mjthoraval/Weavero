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
  (2026-10-12; guard tabs-wrap-args.spec.js). `wvInjectStyle(doc, id, css)` / `wvRemoveStyle`
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
- `winOf(node)` from `src/lib/dom.ts`, never `node.ownerGlobal` (renamed in
  FF153/Zotero 11; works on the dev platform, breaks silently later —
  `test/compat.spec.js` enforces this on the bundle).
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
