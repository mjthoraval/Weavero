---
paths:
  - "src/**/*.ts"
---

# TypeScript source rules, part 2 of 4: DOM, CSS, XUL and version compatibility

> Split by topic so that each file loads whole; all four load for `src/**/*.ts`: [core](src-ts-core.md), **DOM, CSS and XUL** (this file), [windows and readers](src-ts-windows.md), [commits, style and UI](src-ts-ui.md). Index: [src-ts.md](src-ts.md).

## Survival rules (each paid for with a regression), continued

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
  `test/drag-overlay-locks.spec.js`. The same in an observer's callback
  that keeps boxes on pdf.js's pages: it runs on every style change pdf.js
  makes while rendering, and a read-write loop over a book's 54 pages made
  one 117 ms frame per scroll through its references (refs.ts
  `refsPlaceBoxes`, 2026-11-20).
- A walk that picks "the box at an edge" by `getBoundingClientRect` skips
  XUL popups (`menupopup`, `panel`, `tooltip`) with their `popupset`, and
  boxes out of the scroller's flow, as Gecko's own scroll anchoring does
  (ScrollAnchorContainer.cpp): a popup shown once keeps its last rect
  after it closes (nsMenuPopupFrame::CanSkipLayout). The item pane's width
  anchor held Zotero's closed author menu as the box at the top edge after
  one right-click on an author, and the text moved a line during a
  splitter drag (pane.ts `anchorIn`, 2026-11-28). Guard:
  `test/pin-anchor.spec.js` "no pin: a closed popup of a section ...".
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
  To SHOW a Zotero icon elsewhere (a tab's icon in a list), copy the icon
  element's classes and attributes (`data-item-type`), as Zotero's own tabs
  menu does, and let Zotero's rules draw it -- never its computed background:
  the split picker did, with one size, and showed a white page for every PDF
  (2026-11-15; guard split-view.spec.js "the picker draws each tab's icon").
- WINDOW GEOMETRY ACROSS MONITORS is in DEVICE pixels, through the tree
  owner: `win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow)`
  `get/setPositionAndSize` (AppWindow::MoveResize). `screenX` / `moveTo` /
  `resizeTo` / `outerWidth` are CSS pixels of the window's CURRENT monitor:
  on a 100% + 125% desktop device x 3840 reads screenX 3072, and one
  `resizeTo` cannot size a window across the scale boundary. Measured
  2026-11-11 (11.0-beta.4, Windows 11): setPositionAndSize lands exactly,
  also on a maximized window (it becomes normal); desktop px = device px on
  Windows; a normal window's frame is INVISIBLE, 8 device px (10 at 125%) on
  the left, right and bottom (`mozInnerScreenX` - outer x), so place by the
  inner rect, as Snap does. The screen manager scripts no screen list
  (screenForRect / primaryScreen only): probe outside each known monitor's
  edges (lib/screens.ts). Every restore CLAMPS a window to one monitor
  (AppWindow::SetSpecifiedSize, zoteroPane.js constrainToScreen): a size
  wider than a monitor survives a restart only if Weavero puts it back.
  Zotero's caption buttons hit-test as non-client (HTMAXBUTTON, the Windows
  11 snap-layouts button): messages posted to the runner's own HWND
  (PostMessageW, not real input) show a right-click on them reaching the
  page as mousedown / mouseup / click with button 2 (WM_NCRBUTTON*), a left
  click as an ordinary click and `command`, and a title-bar double-click as
  a mousedown with detail 2 and a mouseup -- the first press only as the
  chrome-only `draggableregionleftmousedown` (nsWindow.cpp) -- whose
  preventDefault cancels the OS's maximize (GTK takes the same mouseup).
  Guard: `test/maximize-span.spec.js` (max-span.ts).
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
