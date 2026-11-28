---
paths:
  - "src/**/*.ts"
---

# TypeScript source rules, part 3 of 4: windows, readers and per-window state

> Split by topic so that each file loads whole; all four load for `src/**/*.ts`: [core](src-ts-core.md), [DOM, CSS and XUL](src-ts-dom.md), **windows and readers** (this file), [commits, style and UI](src-ts-ui.md). Index: [src-ts.md](src-ts.md).

## Survival rules (each paid for with a regression), continued

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
- Zotero 9/10's `Reader.open` takes no window: a reader tab goes to the main
  window most recently ACTIVATED (ReaderTab's constructor reads
  `Services.wm.getMostRecentWindow`, xpcom/reader.js 10.0.8 -- not
  `Zotero.getMainWindow()`, so `_wvWithMainWindow` does not steer it;
  `Notes.open` reads `Zotero.getMainWindow()`, the same window unless steered).
  `focus()` does not make a window that: GTK and macOS activate later, a
  foreground lock (Windows) or GitHub's macOS / Ubuntu runners never. Before
  such an open, wait for the window (`_wvAwaitFrontMain`, bounded), and check
  the result's `_window` before acting on it; without it, land the tab
  window-explicitly (`Zotero_Tabs.add` of an unloaded tab). The no-reload move
  committed its swap into a donor Zotero had opened in the SOURCE: the tab
  never moved and its reader was re-homed on a window not holding it
  (2026-11-20; guard move-tab-context-pane.spec.js "a move to a window that
  never comes to the front").
- `Reader.open(id, loc, { openInWindow: true })` is "SHOW it in a window",
  never "a NEW window": Zotero 11 (zotero#6035) hands back ANY open tab of the
  item, `allowDuplicate` or not, and Zotero 9/10 any open ReaderWindow of it
  (xpcom/reader.js). A second window of a document that is open goes through
  `_wvOpenDupReader` (Zotero 11: `Reader._openInNewWindow`), and the caller
  checks that what came back is not the reader it started from. Shift+click on
  a link coupled the source to itself and drove the pane clicked from
  (2026-11-20; guard shift-click-window.spec.js).
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
  And `selectByID` / `selectCollection` answer FALSE for a collection or
  saved search hidden in the window (itself or under a hidden parent):
  `expandToCollection` asks `_includedInTree` first, and the hidden
  collections' wrap says no. A path that must REACH such a row (a bookmark's
  click) falls back to `_wvHidReveal(win, obj)` (pane.ts): shown while
  selected, hidden again after. A bookmark's click did nothing until
  1.3.0-bmpane (guard test/bookmark-hidden-collection.spec.js).
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
- On a Zotero with its OWN windows (zotero#6035; `Zotero.Prefs.setForWindow`
  exists) the settings Zotero keeps per window -- whatever upstream reads
  through `getForWindow` (`search.quicksearch-mode`, `pinnedPane`,
  `panes.<pane>.open`, `sidenav.order`) -- are read and written with
  `Zotero.Prefs.getForWindow/setForWindow(win, …)`. A plain `Zotero.Prefs.set`
  there is "a change made outside of a main window" and EVERY window takes it
  (ZoteroPane.setWindowSetting). Feature-test `setForWindow`; Zotero 9/10 keep
  the one pref. Weavero's collapse to the quick search set every window's mode
  (align review 2026-11-11; guard quicksearch-mode-per-window.spec.js).
- A callback that belongs to ONE window acts for THAT window: an observer on
  its tree, a wrap on its items view, a wrap on a row prototype (each window
  loads its own `zotero/itemTreeRow`), a handler on a row in its document.
  Bind the filter's `_wvFilterWinOverride` to it, read its own view
  (`itemsView.getSelectedItems()`, `winOf(row)`, the section's own `.item`),
  and keep per-view snapshots per view (`_wvSafeSelMap`) -- never
  `Zotero.getMainWindow()`, the filter accessors' focused fallback, or a
  plugin-wide slot. The filter's tree observer, the child filter's fallback,
  the selection capture and the Related-row lookup all read the FOCUSED window
  until 2026-11-11 (align review; guard per-window-state.spec.js, which makes
  another window the focused one with `_wvWithMainWindow`). A TIMER armed for
  a window remembers that window and binds it when it fires -- the override
  is gone by then and focus may have moved: the filter's deliberate retry,
  stale-keep repair, final apply at quiescence and data-change ladder all
  fired for the focused window, and the items view's setFilter, `_refresh`
  and `notify` wraps applied there, until 1.0.5-dev.10. Bind with
  `_wvWithFilterWin(win, fn)` around SYNCHRONOUS work only: the override is
  one plugin-wide slot, and held across an `await` it binds whatever else
  runs meanwhile.
- A box that clips a view it does not lay out (a split view's card, any
  Weavero container around Zotero's panes) uses `overflow: clip`, never
  `hidden`: a hidden box is a scroll container, a focus pass inside it
  scrolls it, and its start edge goes under the box's edge (the right side of
  a library split lost its Tag Selector padding, MJT 2026-11-11). And a
  library view in a box narrower than the window has nothing holding it
  whole: Zotero keeps a view's minimum through `#main-window`'s min-width
  (_mainWindow.scss), and `#zotero-trees`'s automatic minimum (its content's;
  the items toolbar measured 418px) pushed the item pane's side navigation
  out of the box. Give it `min-width: 0` there and let a pane yield
  (tab-split.ts). Guard: split-view.spec.js "a library side keeps its whole
  view". Room kept free inside such a box (the item pane drawn over a card's
  end) is a margin on its CONTENT, never the box's own padding: a flex item's
  border box never goes under its padding, and a 357px padding held a reader
  side at ~530px against a 140px floor (2026-11-11; guard split-panes.spec.js
  section 4).
- The filter's APPLY state is per window and per view too, behind accessors
  (filter.ts `_wvApplyWinStOf` / `_wvApplyViewStOf`): the flags
  (`_suppressTreeObserverUntil`, `_filterApplying`, `_collectionSwapping`) per
  window, the no-op memo, reveal / opened sets, chevron maps and
  `_currentQuickSearchValue` per items view (keyed by its row provider: one
  per library tab on zotero#6035). A new field an apply reads or writes joins
  them -- a plain `this._x` is one slot for every window. Until 1.0.5-dev.11
  they were plugin-wide: one window's apply silenced another's observer,
  skipped its apply onto stale rows, and cleared what the user opened there
  (measured 2026-11-11; guard per-window-apply-state.spec.js). A wrap on a
  row provider reaches its own view directly (`_wvApplyViewStOf(rp)`). Per-row
  code reads them inside an apply, where `_wvPinnedApply` has resolved the
  window once: never resolve a window per row. A timer captures the state
  object it will write, not the accessor.
- A global pref that changes what the filter keeps (the Show Non-Matching
  toggles) acts in EVERY main window and voids every view's memo
  (`_wvApplyMemoInvalidate`): the signature does not name it, and a library
  tab off screen would skip its next apply onto the old rows (2026-11-11).
- Zotero 10.0 and later switch collections through the PLURAL
  `itemsView.changeCollectionTreeRows` (the pane calls it; the singular only
  forwards to it): a wrap on the singular never runs there. Wrap the method
  the pane calls, feature-tested; Zotero 9 has only the singular (2026-11-11,
  guard per-window-apply-state.spec.js).
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
  registerLocales gives every Zotero locale Weavero does not translate the
  en-US file, so under such a locale `[one]` follows THAT language (French
  `[one]` caught 0, "0 Backlink", 2026-10-23). en-US therefore selects on
  the exact `[1]`, and a count that must read plural at zero gets an exact
  `[0]` variant WITH the number; a translation uses its own language's
  categories.
  ALL interface text is in weavero.ftl (l10n branch, 2026-11-19): a word
  Weavero shows -- a tooltip, a pane's text, a hover card, a prompt, a
  status line -- is a message read with `wvStr(id, args)` (lib/l10n.ts),
  written synchronously; never `data-l10n-id` on an HTML element (Fluent
  replaces its children and removes any localizable attribute the message
  lacks); menu entries keep `wvL10n` / MenuManager l10nID. One message per
  sentence, numbers and names as variables (a number is grouped by locale:
  pass a page label or an id as a string), no wvStr at import time (tables
  take getters). Weavero ships fr-FR, de, es-ES and zh-CN translations: a
  NEW or CHANGED en-US message goes into all four files in the same commit
  (machine-assisted, terms Zotero shares taken from Zotero's own locale
  files), or test/l10n-locales.spec.js fails; test/l10n-code.spec.js fails
  on English written in the code's text contexts.
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
  item pane, any pane in a window Zotero did not lay out) is registered
  with Zotero.UIProperties through `wvUIRoot` (lib/ui-roots.ts), as
  zoteroPane.js registers `#zotero-context-pane`: View -> Font Size and the
  density setting reach only registered roots (issue #63, 2026-11-04).
  Never `registerRoot` directly: Zotero keeps a WeakRef per root and never
  drops it, and the cycle collector treats a WeakRef as strong -- the root's
  closed window was never freed (2026-11-12). Guards:
  reader-window-pane-ui.spec.js, reader-leak.spec.js.
- No WeakRef in anything long-lived that names a window, a document or a
  node: Gecko's cycle collector follows a WeakRef to its target like a strong
  edge, so the target is never freed (lib/listen.ts, WEAK FOR THE GC). Key by
  a number (an inner-window id), or drop the entry when the window unloads.
  Guard: reader-leak.spec.js.
- A plugin field that names a window (the user's pick, a target, a press)
  is cleared when that window closes -- the main-window teardown and the
  reader window's unload -- even when every reader checks `.closed`: the
  field alone keeps the closed window and its DOM (`_wvBgUserChosenWin`,
  2026-11-13). Guard: reader-leak.spec.js.
- Never undo, at a main window's close, what Zotero's own teardown undoes:
  Zotero tells plugins of the close (its window-mediator listener) BEFORE
  the window's unload runs ZoteroPane.destroy(), so a removal of the same
  observer first makes Zotero's throw, and the rest of destroy() is skipped
  (Zotero 10.0.8, 2026-11-13: every main window close, quit included).
  lib/ui-roots.ts removes only what destroy() leaves. Guard:
  reader-leak.spec.js.
- Windows taskbar and window icons go through Gecko's services, never
  native calls of Weavero's own (js-ctypes made the Zotero Plugins Atlas
  grade Weavero "Use with care", 2026-11-27): nsIWinTaskbar
  (`setGroupIdForWindow`, the window's `getTaskbarWindowPreview`, its
  overlay controller) and nsIWindowsUIUtils (`setWindowIcon`,
  `setWindowIconFromExe`), all on Zotero 9-11. A window's
  nsITaskbarWindowPreview is kept by Gecko only WEAKLY, and its destructor
  removes the window's taskbar button while the window is open
  (TaskbarWindowPreview::~ -> SetVisible(false) -> DeleteTab): once made it
  stays anchored on its own window (`_wvOvTaskbar`, tabs.ts
  `_wvTaskbarPreview`), never in a plugin field or a module map, and
  destroy() leaves it. The one use Gecko has no service for (the startup
  restore's z-order, tabs.ts `_wvBgRestoreStart`) stays listed in
  test/native-calls.spec.js. Guards: win-taskbar.spec.js, win-icons.spec.js.
- A window's minimize / maximize buttons come from how it is opened
  (`dialog=no` in Weavero's openers for Settings and the Plugins Manager),
  never from rewriting the style of an open window: that took native code
  (MJT 2026-11-27, "1a, drop the live change", "same as Settings"). A window
  open across an enable or a disable keeps its buttons until it is closed.
  Guard: prefs-window-buttons.spec.js.

