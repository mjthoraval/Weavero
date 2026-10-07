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

## Survival rules (each paid for with a regression)

- Defensive boundaries: `try {} catch (e) {}` at every event/lifecycle
  boundary — a Weavero bug must never break core Zotero. Log via
  `Zotero.debug("[Weavero] …")`, never `console`.
- Persistent listeners resolve the live plugin AT EVENT TIME
  (`Zotero.Weavero && Zotero.Weavero.plugin`) — closures over `this`/`self`
  go stale across reloads. Async-setup continuations: liveness-check after
  every await; callbacks self-neutralize; long-lived per-window wiring uses a
  numeric `_wv*Wired` version stamp + stored handler refs.
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
  wiring a dismiss or a click handler near a strip or toolbar, check
  `getComputedStyle(el).getPropertyValue("-moz-window-dragging")`; a "real
  click does nothing" report there is THIS until proven otherwise. Hit
  three times (tab-group chips 2026-06; outline header-strip History menu
  2026-09-30; toolbar History menu 2026-10-01).
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
  itemsView.selectItems). `wvInjectStyle(doc, id, css)` / `wvRemoveStyle`
  — a sheet is always replaced, never skip-if-exists or version-stamped.
  `wvTimeout` / `wvSleep` / `wvClearTimeout` — the sandbox clock for
  plugin-level work. Published as `Zotero.Weavero.lib` for the suite.
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
  them with `wvIsHiddenOrCollapsed()`. `toggleAttribute(name, true)` writes
  `""`, which Zotero 10 (FF140) does NOT honour — measured 2026-09-23: the
  vbox stays visible, the menuitem stays enabled — while Zotero 11 (FF153)
  matches presence, where `setAttribute(name, String(cond))` is the trap
  ("false" = true). `compat.spec.js` forbids both wrong forms.
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
  reopens (2026-10-01). Guard: `test/plugins-chrome-platform.spec.js`.

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
