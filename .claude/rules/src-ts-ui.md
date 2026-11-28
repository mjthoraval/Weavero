---
paths:
  - "src/**/*.ts"
---

# TypeScript source rules, part 4 of 4: commits, style and building UI

> Split by topic so that each file loads whole; all four load for `src/**/*.ts`: [core](src-ts-core.md), [DOM, CSS and XUL](src-ts-dom.md), [windows and readers](src-ts-windows.md), **commits, style and UI** (this file). Index: [src-ts.md](src-ts.md).

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
- Zotero ORDERS some sections' rows itself: the Attachments section puts
  `getBestAttachment()` first (attachmentsBox.js `_updateAttachmentIDs` -- a
  FILE, never a linked URL), the Notes section lists `getNotes()` and its
  rows carry no note id (the section's `_noteIDs` is in row order). An order
  rule reaches the Attachments section through a layer on the window's own
  `attachments-box` class (each window has its own customElements registry;
  `wvWrap`, given back in destroy()), not through `getAttachments` alone: a
  default linked URL stayed second there while the items list showed it
  first (attachments.ts `_wvDefPaneHoist`, 2026-11-20; guard
  default-attachment-pane.spec.js).

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
