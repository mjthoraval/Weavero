# Gesture & focus testing — the hand-only checklist

Some Weavero surfaces cannot be tested programmatically: synthetic DOM
events are untrusted (`isTrusted: false`) and XUL/native handlers ignore
them, real drag sessions can't be forged, and OS window focus is
meaningless under a headless display. These run by hand. Companion
pages: [disable-testing](disable-testing.md),
[restart-testing](restart-testing.md),
[taskbar-overlay-testing](taskbar-overlay-testing.md) (its S6/S7/S11
rows are part of this checklist on Windows).

Run the full checklist before a release; run the relevant section after
touching drag/drop, window moves, or focus code.

## Tab drags (main window)

- [ ] Reorder a tab within the strip — drop indicator tracks the cursor,
      tab lands at the indicated slot.
- [ ] Drag a tab **down out of the strip** → tears off into a standalone
      reader window under the cursor; the new window is **focused**; the
      source window reveals a **loaded neighbor tab** (not the library,
      unless nothing loaded remains); reading position preserved
      (no-reload swap).
- [ ] Drag a tab into **another main window's strip at a specific slot**
      → lands at that slot; the dragged tab becomes the target's
      **active tab** (Firefox rule); tab id preserved (check via List
      all tabs if in doubt).
- [ ] Multi-select (Ctrl+click) several tabs, drag the selection to
      another window → all move; the **dragged** tab (not the first) is
      active in the target.
- [ ] Drop a tab into the **pinned region** → auto-pins.
- [ ] ESC / drop back on the source strip mid-drag → nothing moves,
      no ghost window.

## Reader-window drags

- [ ] Drag a reader-window strip tab into a main window's tab bar →
      merges back as a tab, selected, same tab identity; the reader
      window closes if that was its last tab.
- [ ] Drag a main-window reader tab onto a reader window → mounts into
      its strip (move semantics — source tab closes).
- [ ] Drag a **group chip** onto another window → the whole group
      travels; onto the desktop → group pops into its own window.
- [ ] After each move: scroll the document — position/zoom/selection
      survived; sidebar previews still render.

## Cross-window item drag & drop

- [ ] Drag items from one window's items list onto another window's
      items list → items are added to the collection shown there
      (all of them, when multiple collections are selected).
- [ ] Cross-library variant → items copy once (linked copies reused);
      attached files follow when the target library allows file editing
      (group libraries with files disabled legitimately skip files).
- [ ] The **source** window's collection selection and items list do not
      flicker or jump during the drop.

## Focus rules (after any window/tab machinery change)

- [ ] Tear-off: the new window has OS focus.
      **Known limitation (Windows, 2026-07-21):** if the drag is *released
      over another application's window*, that app keeps the foreground —
      Windows' foreground lock forbids a background process stealing it
      back, so the plugin's `focus()` is a no-op and the new reader window
      opens behind. Expected-fail; only drops on Zotero's own surfaces or
      the desktop guarantee focus.
- [ ] Merge-back: the target window has focus and the merged tab is
      selected.
- [ ] Closing a window: focus falls to a sensible surviving window; the
      library tab is a fallback, not the default.
- [ ] Restoring a saved window/session: the restored window opens with
      its saved geometry (maximized windows reopen maximized) and does
      not steal focus from where you are typing (background restore).

## Reader pin bookmarks (after touching pin drag / `_wvReaderShowPin`)

The in-document pushpin for a **position** bookmark. Surface it: open a
PDF, open Weavero's reader **Bookmarks** panel, click a position-type
bookmark row → the pin drops at that spot (it fades after a moment but
stays while hovered). Then, at the mouse:

- [ ] **Click the pin without moving** → it stays put; the bookmark's
      stored position is unchanged. (A press under the drag threshold is a
      click, not a drag — the lift is deferred until the pointer travels
      past it, so a click can't nudge the tip.)
- [ ] **Grab the head and drag slowly** → the pin follows the hand **from
      the grab point**, not snapping its tip under the cursor (grab offset
      preserved).
- [ ] **Drop on the page** → the bookmark re-anchors to where the **tip**
      landed; the sidebar list re-sorts by location; the label
      auto-updates to "Page N" **only** if it wasn't manually renamed.
- [ ] **Drag off the page and drop** → pin greys out / no-drop cursor
      while off-page, and on release the bookmark is **unchanged**
      (cancels back to its original spot).

## Outline tab menu (after touching the Outline-tab wiring / page labels)

Page numbers ("p. N") in Weavero's Outline tab, issue #42. Open a PDF
with an outline, switch the sidebar to **Outline** (Weavero takeover
active), then:

- [ ] **Right-click the Outline tab button** → a menu in the annotations
      sort-menu format opens under it: heading **PAGE NUMBERS**, rows
      **✓ Show (default)** and **Hide**. (Left-click and double-click keep
      their native meanings: switch tab, expand/collapse all.)
- [ ] **Click "Hide"** → the labels disappear at once, the menu closes.
      Right-click again → the tick is on **Hide**; "(default)" stays on
      **Show**.
- [ ] **Switch to another document** → its labels are still shown (the
      choice is per document). Back to the first → still hidden, also
      after closing and reopening the tab, and after a Zotero restart.
- [ ] **Click "Show (default)"** → labels return; `weavero/outlines.json`
      no longer carries a `settings` entry for the document (picking the
      default drops the record).
- [ ] **Preferences → Reader outline → uncheck "Show page numbers"** →
      every open reader's outline drops the labels without a tab
      round-trip; the menu now reads **Show** / **✓ Hide (default)**; a
      document switched to Show from there still shows them.

## Bookmarks tab menu (after touching the Bookmarks-tab wiring / page labels)

The Outline tab's page-number menu, on the Bookmarks tab. Open a PDF with
at least two bookmarks on different pages, Bookmarks tab active, then:

- [ ] **Right-click the Bookmarks tab button** → the same menu opens under
      it: heading **PAGE NUMBERS**, rows **✓ Show (default)** and **Hide**.
      Left-click still switches to the tab; dragging an annotation onto the
      tab still bookmarks it.
- [ ] **Click "Hide"** → the "p. N" labels disappear from every row at
      once, the menu closes. The **hover card still shows the page** (it is
      the detail view).
- [ ] **Switch to another document** → its labels are still shown. Back to
      the first → still hidden, also after closing and reopening the tab
      and after a Zotero restart.
- [ ] **Click "Show (default)"** → labels return and `weavero/outlines.json`
      no longer carries a `bmPageNumbers` entry for the document.
- [ ] **Preferences → Bookmarks → uncheck "Show page numbers next to
      document bookmarks"** → every open reader's bookmark list drops the
      labels without a tab round-trip; the menu now reads **Show** /
      **✓ Hide (default)**; the Outline tab's own labels are unaffected.

## Annotations-list funnel (after touching the sidebar funnel / list filter)

Issue #43: hide annotation types from the reader's sidebar list while they
stay on the page. Open a PDF with at least one highlight and one ink
stroke, Annotations tab active.

- [ ] **A funnel sits right of the sidebar search magnifier** (same look as
      the Bookmarks tab's funnel). It is absent on the Bookmarks, Outline and
      Thumbnails tabs.
- [ ] **Hover the funnel** -> background tint only, exactly like the funnel in
      the reader's own toolbar; the funnel icon must NOT change colour
      (synthetic events cannot drive `:hover`, so this one is hand-only).
- [ ] **Click the magnifier** -> the search input opens on its own line under
      the toolbar, full width, the funnel stays where it was; typing filters
      the list; Escape closes the line; whatever sat under the toolbar (sort
      bar or list) moved down and moves back.
- [ ] **Open the funnel** -> the popup is titled "Filter Annotations Pane",
      opens BESIDE the sidebar (over the reader, top-aligned with the button,
      never covering the pane), and carries every row the funnel above the
      reader has: colours, types + Has Comment, Has Tag / Related / Link,
      tags, people (group libraries), Added and Modified date ranges, the
      "Alt+Click to Exclude" hint. It must NOT carry "Hide Annotations in the
      Reader" -- that one is document scope.
- [ ] **Alt+click Ink** -> ink rows leave the pane, the strokes stay drawn on
      the page. **Click a colour** -> only that colour is listed, the page
      still shows everything. **Click an active chip again** -> neutral.
      **Clear** and the red **x** reset every row.
- [ ] The funnel gets the accent dot while anything is set, and the footer
      says "N of M hidden from the pane" plus "this document only" with "Use
      as default" / "Back to default" (or "default for all documents").
- [ ] **Select All in the sidebar (Ctrl/Cmd+A)** -> no ink annotation is
      selected; arrow keys skip them.
- [ ] **Click an ink stroke on the page** -> it selects on the page; the list
      shows no row for it (expected: hidden means hidden).
- [ ] **Reopen the tab / restart** -> ink still hidden in this document; a
      different document lists ink.
- [ ] **Use as default** -> footer reads "Default for all documents";
      Preferences -> Reader annotations pane shows Ink unchecked; another
      document now hides ink too. **Back to default** on a document that
      departs restores the default set there.
- [ ] **Toolbar funnel excludes Highlights** while the list hides Ink -> the
      list shows neither; clearing the toolbar funnel brings highlights back
      and ink stays hidden (the list never re-shows what the toolbar funnel
      removed).
- [ ] **In-view popup** for a hidden ink annotation (sidebar closed, click
      the stroke) still renders.
- [ ] **Use as Default** -> the CHIPS DO NOT MOVE (an included chip stays
      included; it must never turn into the equivalent set of exclusions), the
      footer flips to "Default for All Documents", **Use as Default** gives
      way to **Clear Default**, the funnel gets a GREEN LINE underneath (a
      default other than "show everything" exists; the chips the default sets
      carry the same line, in every document), the blue dot goes (the dot
      means this document DEPARTS from the default, not that a filter is
      active), and Preferences -> Reader annotations pane shows the matching
      types unchecked. Another document follows. Add a chip on top -> dot AND
      line. While a default exists the header reads **Clear All** /
      **Reset** (tooltip "Back to Default", just before the red ×, which is
      then "Back to Default and Close"); without one it is the plain
      **Clear** / "Clear and Close" pair and no Reset. **Reset** restores a
      departing document; **Clear Default** returns every document to
      showing everything. Alt+click **Use as Default** ADDS this document's
      chips to the existing default instead of replacing it.
- [ ] **Zotero's own selector** (colours / tags at the foot of the pane) is
      GONE by default while the funnel is enabled. Settings -> Reader
      annotations pane -> untick "Hide Zotero's colour and tag selector" brings it
      back live.
- [ ] **Settings -> uncheck "Filter the annotations pane"** -> the funnel
      disappears, the pane shows every annotation again, Zotero's selector
      comes back. Re-checking restores the funnel and the document's own
      filter.

## Items-list width (after touching the table CSS or registering columns)

The items-list header must not size the centre pane (2026-09-11: with three
Weavero columns the header's intrinsic width exceeded the pane's share, the
side panes were squeezed, column drags moved the centre pane, and titles on
the ellipsis boundary blinked). Show a dozen columns including Weavero's
Annotations / Tags / Related, then:

- [ ] **Narrow the window** until the items pane is at roughly its minimum
      → the collections pane and item pane keep their splitter widths;
      columns shrink inside the items pane instead.
- [ ] **Drag a column separator** (e.g. Creator | Year) → only that pair of
      columns changes; the centre pane and the other columns stay put.
- [ ] **Watch truncated titles** for a few seconds at that width → no
      blinking between "Tes…" and "Test12"-style renderings.
- [ ] **Narrow the window to ~1000 px with a dozen columns shown** → at
      its minimum the FIRST column (whichever it is: Title, or Creator
      once moved first) still shows about as much text as the other
      squeezed columns do (its floor is Zotero's 30 px plus the 36 px of
      twisty slot and type icon its text sits behind); below 930 px Zotero
      stacks the item pane by itself. Then drag the first separator hard
      to the left → the first column stops at 66 px and no other column
      moves.
- [ ] **Move another column first** (drag its header to the left edge, or
      right-click the header → Move Column) → the floor follows: the new
      first column stops at 66 px, the previous one shrinks to 30 px like
      any other. Move it back → same, reversed.

## Popups (after touching popup code)

Run `test/popups.spec.js` first, then by hand:

- [ ] Comment popup and relations popup open anchored to their trigger,
      in the main window **and** in a standalone reader window.
- [ ] Second click on the same anchor toggles the popup closed.
- [ ] A click anywhere outside — including other documents/iframes —
      dismisses it.

## Windows taskbar (multi-monitor, after identity/badge changes)

Follow the [taskbar overlay matrix](taskbar-overlay-testing.md) —
minimum hand pass: S6 (drag across monitors without dropping), S7 (new
window), and one fresh-reboot S13 run. Verify with your eyes (or screen
captures), not logs: the failure modes are visible states the
bookkeeping can believe it prevented.
