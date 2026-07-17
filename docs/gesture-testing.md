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
- [ ] Merge-back: the target window has focus and the merged tab is
      selected.
- [ ] Closing a window: focus falls to a sensible surviving window; the
      library tab is a fallback, not the default.
- [ ] Restoring a saved window/session: the restored window opens with
      its saved geometry (maximized windows reopen maximized) and does
      not steal focus from where you are typing (background restore).

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
