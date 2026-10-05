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
- [ ] Reader tab: click into the item pane on the right, press Ctrl+F —
      the reader's find bar opens (Zotero's own binding only selects the
      hidden library search box there). With the cursor in a note in the
      context pane, Ctrl+F stays the note editor's.

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
      sort-menu format opens under it: heading **ENTRIES TREE**, then
      heading **PAGE NUMBERS** with rows **✓ Show (default)** and **Hide**. No
      History section there. (Left-click and double-click keep their
      native meanings: switch tab, expand/collapse all.)
- [ ] **Outline shortcuts (#51)**: *Settings → Weavero → Extras → Reader
      outline → Keyboard shortcuts*: all four boxes read **None**. Click
      *Add selected text*, press **H** → refused, "already used by the
      reader's Hand tool"; press **Ctrl+Z** → refused (Undo); press **T** →
      "Saved.", the box shows **T**. In a PDF, select text and press T → an
      entry is added from the selection; with nothing selected, T asks you
      to select text. Click into an annotation comment and type "t" → only
      the letter appears. The "+" menu and the page's right-click menu show
      **T** next to *Select text…* / *Add Selected Text to Outline*. Press
      **Remove** → back to **None**, T does nothing in the reader.
- [ ] **Outline undo keys**: add an entry (any "+" flow) → Ctrl+Z with
      the outline focused → the entry disappears, the note strip says
      "Undone: Add Outline Entry"; Ctrl+Y (Windows; ⇧⌘Z on macOS,
      Ctrl+Shift+Z on Linux) brings it back. Select two entries, Del →
      Ctrl+Z → both are back at their places, selected. Right-click on the
      outline's header strip → nothing (the history lives on the toolbar
      arrows since 2026-10-01); the source chip keeps its own menu. The
      history is per document and lasts this Zotero run — a plugin reload
      or update keeps it, a Zotero restart clears it.
- [ ] **One history per tab, the most recent action first** (2026-10-01):
      Ctrl+Z does the same thing from the page, the Outline tab and the
      Bookmarks tab. Add an entry from a text selection (focus stays in the
      page) → Ctrl+Z right away undoes that entry ("Undone: Add Outline
      Entry"); make a highlight after an entry → Ctrl+Z removes the
      highlight first ("Undone: Add Annotation" on the strip), the next
      Ctrl+Z the entry. With the outline focused, a highlight made after
      the entry is undone first too. **Visible**: collapse the sidebar,
      press Ctrl+Z after deleting an entry → the sidebar reopens on the
      Outline tab with the entry back and selected. **Hidden panes count
      too** (2026-10-02): delete an outline entry, switch to the
      **Bookmarks tab**, press Ctrl+Z → the sidebar switches to the
      Outline tab with the entry back; the History list shows outline,
      bookmark and annotation steps together whichever tab is showing.
- [ ] **Bookmarks undo**: in the Bookmarks tab add a bookmark (pin, page,
      selection) → **Undo Add Bookmark** (toolbar arrow, Ctrl+Z, Edit
      menu); rename → **Undo Rename Bookmark**; drag into a folder →
      **Undo Move Bookmark**; delete a folder with contents → **Undo Delete
      Folder** puts the folder and its children back where they were;
      select three rows, Del → one **Undo Delete 3 Bookmarks**. Drag a
      document bookmark into the Library section (move) → ONE step: undo
      it from either scope (Ctrl+Z in library scope or document scope) →
      the library copy goes, the document's bookmark is back. Expanding
      and collapsing folders records nothing. Right-click on the pane's
      header → no history menu (toolbar arrows only).
- [ ] **Reach back and pick**: after several steps, right-click a
      toolbar Undo / Redo arrow → **HISTORY** opens at the pointer; below
      Undo/Redo, **UNDO HISTORY** lists the 12 most
      recent steps, newest first, each with its age; a last row **Show 12
      older steps** ("N more") extends it by 12 per click, as often as
      needed, keeping ticks; a long list scrolls inside the menu. Each row (and the
      Undo / Redo rows) carries the glyph of the stack it belongs to — the
      Outline tab's dot-and-line motif, the bookmark ribbon, Zotero's
      annotation icon — and names it first in the tooltip ("Annotations —
      Undo this step and the 2 that go with it"). **Click a row** → that
      step and exactly the rows its hover bracket shows are undone, an
      unrelated newer step (e.g. a bookmark deletion between annotation
      steps) stays. **Pick one or several**: tick the
      box at the left of a row (or Ctrl+click the row) → the menu stays
      open, the row is ticked, and every later step that touched the same
      entries is ticked with it, dimmer (hover: "Needed by your pick");
      a footer reads **Undo N selected**. Make steps on two different
      entries (add A, add B, rename A) → tick "add B" alone → **Undo 1
      selected** → B is gone, A keeps its new name, Ctrl+Y brings B back;
      tick "add A" → "rename A" ticks with it. **Groups are visible
      before ticking**: hover any row → it and every row that must go
      with it get a blue left bracket and a tint (the hovered one
      darker); a row that cannot go alone says why in its tooltip. Untick
      a dimmer row → the pick that needed it is unticked too. Annotation
      steps group only by the annotations they changed (2026-10-02): make
      highlight A, highlight B, then change A's colour → tick "add A" →
      "edit A" ticks with it, "add B" does not; tick "add B" alone →
      **Undo 1 selected** removes B and leaves A (with its colour). Click the footer → the ticked steps
      are undone newest first, the others stay ("Undone: N steps" on the
      strip). After two or more undos, a **REDO HISTORY** list (8 rows)
      follows, the next redo first, with the same boxes and its own
      **Redo N selected** footer; the tick box is a full-height zone
      from the row's left edge to the glyph, so a click beside the box
      ticks rather than runs the row.
- [ ] **Annotation undo shows where it happened** (2026-10-02): with
      the Outline or Bookmarks tab showing (or the sidebar collapsed),
      delete a highlight on another page, scroll away, Ctrl+Z → the
      sidebar opens on **Annotations**, the highlight is back and
      selected, the page scrolls to it. Ctrl+Y → the highlight goes again
      and the page stays at its place. Same from the toolbar arrows and
      the History list.
- [ ] **Toolbar arrows** (PDF, EPUB, snapshot; main window and reader
      window): after the annotation tools (right of the colour picker),
      behind a divider, an **Undo** and a **Redo** arrow (Acrobat's
      placement: tools, then the arrows); nothing overlaps the page
      count. The lower part of each curve is Weavero amber, like the
      funnel's stem, so they don't read as Zotero's Back button. Greyed when there is nothing
      to do; hover → "Undo Add Outline Entry (Ctrl+Z) / Right-click:
      history". Click → same as Ctrl+Z (strip note, reveal), the arrows
      swap their greyed state at once; make a highlight → Undo lights up
      without any other action. Right-click either arrow → the
      **HISTORY** menu at the pointer — also on a greyed arrow (then
      Undo / Redo greyed, no lists).
- [ ] **Right-click in the page**: no Undo / Redo items (removed
      2026-10-01; the toolbar arrows carry them).
- [ ] **Edit menu** (menubar or the hamburger's Edit ▸) shows the tab's
      choice, like Ctrl+Z: after deleting an entry → **Undo Delete Outline
      Entry — Ctrl+Z** enabled and working, **Redo** greyed until something
      was undone; after a highlight → **Undo Add Annotation**. Never the
      library's own actions ("Redo Trash 2 Items") while a reader tab is
      selected. Click into a text field (the quick search, a note, an
      annotation comment) → Zotero's own Undo, even right after a library
      action that Zotero could undo too. With focus in the outline or
      bookmarks, holding Ctrl+Z down undoes one step, not a burst. Library tab → Zotero's own; there, **Add
      Related** / **Remove Related** done from Weavero's relations popup
      and an annotation comment edited from a bookmark's editor appear as
      Zotero's own **Undo Add Related** / **Undo Edit of “Comment”**
      (Zotero 10+).
- [ ] **ENTRIES TREE** section: **Expand All** and **Collapse All**, their
      shortcuts dimmed at the right (`+` / `−`); "Double-click, " prefixes
      the one the tab's double-click would do now (any entry collapsed →
      Expand All). Click one → the outline follows, the menu closes;
      right-click again → the "Double-click" hint has moved to the other row.
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
- [ ] **With another sidebar view selected** (Annotations or Bookmarks),
      right-click the Outline tab → the same menu opens (it does not need
      the Outline view to be showing).
- [ ] **TEXT SIZE** section: **Zotero Outline** and **Zotero Item Pane**
      show their current size in a right-hand column (11 px / 13 px at
      *View → Font Size → Reset*), **Fixed ▸** opens 8–24 px on hover. The
      three sizes line up vertically; "(default)" (dimmed) sits at the end
      of the Settings value's line.
- [ ] Pick **Fixed ▸ 20 px** → the outline entries grow at once, only in
      this document; *View → Font Size → Bigger* leaves them at 20 px, while
      **Zotero Outline** / **Zotero Item Pane** documents grow with it.
      Pick the "(default)" line → back to Settings, and `outlines.json` no
      longer carries a `textSize` entry for the document.
- [ ] **Right-click Outline → Bookmarks → Annotations → Annotations →
      Outline** in a row → each right-click opens that tab's menu, the
      second one on the same tab included (no toggle-close).

## Outline entry right-click menu (after touching outline rows, menus or re-renders)

Collections-pane parity (2026-09-24). Any Weavero outline with a few
entries; click one entry first so it has the blue cursor.

- [ ] **Right-click another entry** → dashed outline on it while the menu
      is open; the blue cursor and the selection do not move.
- [ ] **Mark as Box / Sidebar** (or Reset, Fix Spacing, Edit Region → Save)
      from that menu → after the outline redraws, the blue cursor is still
      on the entry you clicked first. (Not covered by a spec: the redraw
      needs a real reader.)
- [ ] **Rename…** from the menu → Enter → cursor stays; the renamed entry
      keeps the dashed outline until the next click or key. **Reset to
      Original Name and Region** does the same.
- [ ] **Delete** an entry you were not on → the selection and cursor stay.
- [ ] Ctrl+click two entries, right-click one of them → the menu says
      **Delete 2 Entries** and has no Rename…, Edit Region… or Reset.
- [ ] **Open** from the menu → the entry becomes the cursor and the only
      selection, and the view jumps to it.

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

## Session list sort (after touching the Sessions section of the List-all-tabs panel)

Open the List-all-tabs dropdown; the **Sessions** header carries the
annotations-pane sort control at its right: a dropdown chip naming the
kind (**Created ▾**) and an arrow chip (**↑** / **↓**).

- [ ] Click the chip → a menu with *Created*, *Name*, *Last used*; the
      current kind ticked; "(default)" dimmed at the right of *Created*.
- [ ] Pick *Name* → the saved sessions re-order in place, the panel stays
      open, the chip reads **Name ▾**; the current session stays the header
      at the top and *Last workspace (auto)* stays last.
- [ ] Hover the arrow → the tooltip says which way the list runs ("A to Z",
      "Oldest first", "Most recent first"…) and "(click to reverse)". Click
      it → the list flips, the arrow turns. Pick another kind → its natural
      direction again (Name ↑; Created and Last used ↓, newest / most
      recent first).
- [ ] Sort by *Created* or *Last used* → each session shows that date under
      its name (time only when it is today's); *Name* shows no date line.
      Hover a row → the tooltip carries the action, then "Created: …" and
      "Last used: …" in full, in every mode.
- [ ] Reopen the panel after a restart → the chosen kind and direction are
      still in force.
- [ ] Clicking a session row still switches to it (the two chips are the
      only new click targets).

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

## Side panes: drag, collapse, reopen (after touching splitters or the reader-window item pane)

Synthetic drags do not move Gecko splitters, so these are hands-only. Setting:
*Extras → Collections pane → Resizing a side pane stops at its minimum width*.

- [ ] **Setting on**: drag each pane edge hard past its minimum → it stops:
      collections pane 200 px, item pane 357 px, the context pane of a reader
      tab 357 px, the item pane of a reader window 357 px.
- [ ] **Setting off**: the same drags snap each pane shut, as in Zotero. In a
      reader window the pane and its icon column go and the reader toolbar
      shows the toggle at its right end.
- [ ] **Reader window, either setting**: collapse with the icon column's top
      button → pane and column gone, toolbar toggle appears with no frame of
      the funnel at the toolbar's end; the toolbar toggle reopens the pane;
      the MAIN window's context pane never changes.
- [ ] **Reader window open across a plugin update or reload** → its item pane
      behaves as the new build (it is rebuilt in place, collapsed state kept).
- [ ] **Collections-pane button on, pane collapsed** → the band at the left
      edge is 1 px; button off → Zotero's 8/10 px band is back.

## Hidden collections (after touching the collections menu or tree filter)

Real right-click menus; the spec builds them without opening.

- [ ] Right-click a collection → **Hide Collection** (next to Delete); it
      and its sub-collections vanish, a **blue dot** appears at the end of
      the My Library line (hover: "In this window: 1 hidden …").
- [ ] Ctrl+click two collections and a saved search, right-click inside the
      selection → **Hide 3 Collections and Saved Searches**.
- [ ] Right-click **My Library** → **Show Hidden Collections ▸** (after
      Zotero's own Show items) → **Show All (n)**, then each by path; pick
      one → it is back, the dot goes when none are left.
- [ ] Right-click a group library → **Hide Group Library**; dots on the
      **Group Libraries** line and My Library. Right-click the Group
      Libraries line → **Show Hidden Group Libraries ▸**. Hide every group →
      the line goes; My Library's Show menu lists them under "Group
      Libraries".
- [ ] A second main window (Ctrl+N) shows everything: the set is per
      window. Restart → each window gets its own set back, the first window
      included even with only its library tab open.
- [ ] Save & Close a window with something hidden → reopen it from the
      tabs menu → the same set. Switch tab sessions and back → each
      session's windows have their own sets.

## Popups (after touching popup code)

Run `test/popups.spec.js` first, then by hand:

- [ ] Comment popup and relations popup open anchored to their trigger,
      in the main window **and** in a standalone reader window.
- [ ] Second click on the same anchor toggles the popup closed.
- [ ] A click anywhere outside — including other documents/iframes —
      dismisses it.

## File / Edit menubar entries (macOS, after touching the window commands)

`test/menubar-window-entries.spec.js` proves the entries, their order and
their gating on whatever platform runs the suite; the point of the feature
is the Mac, where the hamburger does not exist and no Windows check can
stand in. On macOS, by hand:

- [ ] *File* opens with **New Tab…** (⌘T), **New Reader Window…** and
      **New Main Window** (⌘N) as its first three entries, a separator
      under them, then Zotero's *New Item*; the two shortcut glyphs render.
- [ ] *Edit* shows **Advanced Search in New Window** ("Shift+Click")
      directly under *Advanced Search*.
- [ ] Each of the four does what its name says: the picker opens as a
      dialog; a new main window comes up clean; the Advanced Search window
      opens on the current collection with the search already open.
- [ ] *Settings → Weavero → Tabs and Windows*: untick *Open new main
      windows* → *New Main Window* and the Edit entry are gone on the next
      open of the menu, the other two stay, ⌘N / Ctrl+N does nothing, the
      hamburger (Windows/Linux) drops its *New Main Window*, the item menu
      its *New Window* row, and Shift+click on the funnel opens Zotero's
      in-window search; untick the section master → all four entries gone.
      No restart in between.
- [ ] (Any platform, primary window maximized.) *Edit → Advanced Search in
      New Window*: the new window is NOT maximized -- a modest window in the
      middle of the screen. Resize it, close it, open it again: it comes back
      at the size you gave it.
- [ ] (Any platform.) With *"Hide the side panes in the Advanced Search
      window"* on (the default): the Advanced Search window has no
      collections pane and no item pane; *View → Layout* brings one back
      there; the primary window's panes are untouched, also after a restart.
- [ ] (Any platform.) The collections-pane button at the window's top-left
      collapses the pane and stays exactly where it was (it re-homes from
      the collections toolbar to the items toolbar under the same pixels);
      a second press expands the pane; *View → Layout → Collections Pane*
      shows the matching tick and, used itself, leaves the button in place;
      the state survives a restart. *Extras → Collections pane* off removes
      the button at once.
- [ ] (Any platform.) Collections tree: with *My Library* selected,
      right-click another collection — *My Library* stays highlighted and
      the items list stays (no reload); the right-clicked row only shows a
      dashed outline while its menu is open; press Escape — outline gone,
      nothing else changed. Right-click → *New Subcollection…*: while the
      dialog is up nothing moves; *Cancel* — still nothing, the outline
      goes at your next click; *Create Collection* — you stay on *My
      Library*, the new subcollection appears with the dashed outline
      (gone at your next click). *Rename Collection…* → Enter — same:
      you stay, the renamed row keeps the outline until your next click.
      Right-click a saved search you are not on → *Edit Saved Search* —
      the search is selected at once (list and editor agree). Right-click a
      collection you are not on → *Delete Collection…* → confirm — the
      collection goes, you stay where you were. Right-click a saved search
      you are not on → *Generate Report from Saved Search…* — the report is
      that search's (the list switches to it first). Right-click *Group
      Libraries* — no menu; middle-click it — nothing.
      Right-click → *Open in New Window* (first entry of the plugin section
      at the bottom, a separator under it when other plugins' entries
      follow; Zotero's own actions keep their places) — a new window on
      that collection, the first window still on *My Library*.
      Middle-click a collection — a new window on it, the first window
      unchanged, no selection change; Shift+click and Ctrl+click still
      select several collections (Zotero's own gestures). Same with
      *Multiple main windows* off: middle-click and right-click behave as
      in plain Zotero except the restore, and the menu entry is absent.
- [ ] (Any platform.) Tick *"Ctrl+Shift+F / ⇧⌘F opens Advanced Search in a
      new window"*: the shortcut opens a new window on the current collection
      and the in-window pane stays closed; *Edit* now shows the shortcut on
      Weavero's entry and none on Zotero's. Untick: the shortcut opens the
      pane again and the shortcut text is back on Zotero's line. Trusted key
      events cannot be scripted -- this one is hands only.
- [ ] (Any platform.) Middle-click the Advanced Search funnel at the right
      end of the search box — the search opens in a new window, the same
      as Shift+click; the in-window pane stays closed. With *Multiple main
      windows* off the middle-click does nothing.
- [ ] A focused standalone reader window: its *File* leads with **New
      Reader Window…** and **New Main Window** (⌘N); **New Tab…** appears
      only when the window has Weavero's tab strip (*Hide title bar* →
      reader windows). No Edit entry there.

## Windows taskbar (multi-monitor, after identity/badge changes)

Follow the [taskbar overlay matrix](taskbar-overlay-testing.md) —
minimum hand pass: S6 (drag across monitors without dropping), S7 (new
window), and one fresh-reboot S13 run. Verify with your eyes (or screen
captures), not logs: the failure modes are visible states the
bookkeeping can believe it prevented.
