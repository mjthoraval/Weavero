---
paths:
  - "src/**/*.ts"
---

# TypeScript source rules: index

The rules for `src/**/*.ts` were this one file until 2026-11-25. At 66,000
characters it was past what Claude Code loads of a single file (about
40,000 characters on 200K-context sessions, per its docs), so its end was
lost there. The text is now four files with the same `paths:`, all loaded
together, unchanged and in the same order:

- [src-ts-core.md](src-ts-core.md) -- After every Edit/Write; Naming is
  namespacing; Structure (one URL rule, one undo rule); Survival rules,
  first part: defensive boundaries, the live plugin at event time, objects
  handed to the reader, a reader event's `doc`, window drag areas,
  click-outside dismissers (`wvWithin`), the reader's FocusManager,
  popupshowing bubbling, tab switches, XUL menu sizing, timer hosts,
  onMainWindowLoad, the per-main-window wiring table, wraps on long-lived
  objects (wire stamps), shared helpers in `src/lib/` (sheet replace,
  `wvListen`, `wvWrap`, `wvWhenWindowLoaded`), wrappers on host objects,
  index-based row helpers, deliberate filter applies, notifier observers,
  wrap snapshots, one-shot armed listeners, injected DOM after a reload,
  ProseMirror plugins.
- [src-ts-dom.md](src-ts-dom.md) -- Survival rules, continued: padding
  between tabs, native class names inside Weavero containers, DOM reads
  before writes, tab-bar drags, window-level drag handlers, background
  layers, window geometry across monitors, `winOf(node)`, `el.hidden`,
  boolean XUL attributes, reader plugin-menu items, menu icons on Zotero
  11, search inputs, Zotero 9 selection APIs, `data-item-type` values,
  innerHTML SVG, items-tree column min-width.
- [src-ts-windows.md](src-ts-windows.md) -- Survival rules, continued: a
  hand-set customtitlebar, `Reader.open` and reader windows, window-count
  marks, passes that persist, windows hosted on another document, Zotero
  trees outside their pane, `getRowIndexByID`, Zotero state in one pref,
  Zotero's own windows (zotero#6035), callbacks that belong to one window,
  boxes that clip a view, per-window filter state, Zotero 10 collection
  switching, a new window's lastViewedFolder, `Zotero.DB` LIKE binding,
  Fluent, dropdowns Weavero draws, the items view's `rowCount`, removing a
  Zotero attribute, Zotero panes outside `#zotero-pane` (registered
  roots), WeakRef, fields that name a window, main-window close.
- [src-ts-ui.md](src-ts-ui.md) -- fix: commits name their guard; Style;
  CSS overrides must out-rank what they override; Item-pane sections take
  Zotero's row geometry; Editing mechanics; Inline SVG inherits the
  container's fill/stroke (icon paths are claims, context menus by child
  index, the menubar); Decorating a XUL `<splitter>`.

A code comment that cites "src-ts.md" and a rule means that rule in one of
the four files: search them for the rule's words.
