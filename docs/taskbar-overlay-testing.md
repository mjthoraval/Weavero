# Windows taskbar overlay badges — measured shell behavior & test matrix

Weavero badges each Zotero window's (merged) taskbar button with the
window's identity color, per monitor. Getting this stable on Windows 11
required measuring how the shell actually treats
`ITaskbarList3::SetOverlayIcon` across merged buttons and monitors —
facts that are not documented anywhere and that any developer badging a
multi-window app will hit. They are published here, with the situation
matrix used to test Weavero's implementation.

## Measured shell facts (Windows 11, screen-capture verified, 2026-07)

- **F1.** A merged taskbar button shows the overlay of the **last window
  to set one** among the windows it holds. Requests do not queue; last
  received is shown.
- **F2.** Bursts of `SetOverlayIcon` calls from different windows land
  in **random order**.
- **F3.** Re-setting the **same image** on a button is visually
  invisible — no flash. (This makes idempotent re-asserts free.)
- **F4.** **Sticky associations:** a window that resided on a button
  while holding an overlay request keeps an entry in that button's stack
  *after it leaves* — its later sets repaint that foreign button.
  Clearing the overlay, `DeleteTab`+`AddTab`, and minimize/restore do
  **not** purge the stale entry. An Explorer restart does.
- **F5.** A window dragged across monitors while holding **no** request
  does not poison the buttons it passes over — clearing the overlay
  before a move ("drag-clear") is a real defense.
- **F6.** Gecko has no window-move event, and same-resolution drags emit
  no DOM events — full-geometry polling (~1 s) combined with the mouse
  button state is the practical move detector.

## The algorithm these facts force ("poison ledger")

- Per window, record the monitors whose buttons may hold a stale entry
  for it (recorded whenever the window leaves a monitor where it held a
  badge), and where it last held one.
- Keep a model of what image each monitor's button currently shows.
- A single entry point for every badge write: **skip** if the button
  already shows this image (no set → no new stale entry → no flash, per
  F3/F4); otherwise set, update the ledger, mark the predicted foreign
  repaints, and **chase** each leaked monitor — re-assert its own top
  window shortly after (~120 ms), depth-capped.
- Decouple *image* from *setter*: `SetOverlayIcon` accepts any icon, so
  when a monitor's natural setter is itself poisoned elsewhere, issue
  the image via the resident with the fewest foreign poisons. If every
  resident of a monitor is foreign-poisoned, don't chase — degrade to
  both buttons coherently following the focused window (one set per
  focus, no ping-pong, no flash) until a clean setter exists again.
- **Boot settle gate:** no badge until a window's geometry is stable for
  two consecutive samples, and the first set from a non-primary monitor
  is followed by a forced primary re-assert — an early set can register
  against the wrong transient button during session restore, invisibly
  to the ledger.
- Update the ledger **before** awaiting the async set — a burst of
  identical sets can otherwise pass the skip check in the milliseconds
  before the first one lands.

## Situation matrix

Windows in play: **A** = anchor main window (primary monitor M2),
**B** = second main window, **R** = reader window (monitor M3).

| # | Situation | Expected behavior |
|---|-----------|-------------------|
| S1 | Focus switch between two windows on the same monitor (B ↔ R on M3) | M3 badge follows the focused window; M2 untouched; no flash |
| S2 | Focus switch across monitors (A ↔ R) | Each monitor keeps its own last-focused badge; no cross-monitor change |
| S3 | Repeated focus of the same window | Zero overlay sets (skip path); nothing changes |
| S4 | Window moves M3 → M2 and stays | M2 shows the moved window's badge; M3 shows its remaining top window |
| S5 | Window moves back M2 → M3 (departure from a button it badged — the poison case) | M3 shows the moved window; M2 **reverts** to its own top (the chase corrects the sticky repaint) |
| S6 | Drag across and back **without dropping** | No badge changes anywhere (drag-clear; nothing to repair) — needs a real mouse |
| S7 | New window opens | Gets its badge on first focus; other monitors untouched |
| S8 | Window closes | Its monitor's button falls back to the remaining top window's badge |
| S9 | All windows on one monitor | Classic single-button behavior: badge = focused member |
| S10 | Plugin reload | Badges re-asserted once; no bursts, no duplicates |
| S11 | Explorer restart | All shell state purged (including the ledger's *target*); badges may stay blank until the next per-monitor top change — rare, self-heals on focus change |
| S12 | Mutual poisoning (no clean setter left on a monitor) | Adaptive degrade (see algorithm): coherent follow-the-focus on the affected buttons, no flicker, recovers at next reboot |
| S13 | Cold start / session restore | No badge until the settle gate passes; first-set guard re-asserts the primary |
| S14 | Shell misplaces a group button entirely (no button on a monitor that has windows) | Not badge-related; recovers when a window on that monitor is activated — known Windows 11 flakiness, outside plugin control |

Situations S6, S7, S11 are inherently manual (real mouse, real Explorer
restart); the rest can be driven programmatically (focus switches,
`moveTo`, plugin reload) with log assertions.

## Testing rules

- Verify with **screen captures**, not logs alone — F1/F4 failures are
  visible states the ledger can believe it prevented.
- Test after a **fresh reboot** at least once: session-restore timing
  (S13) exposes races that a warm session never hits.
- Baseline comparison: a naive "one set per focus event" implementation
  fails S5 (two windows showing the same badge) and S2-after-poison.
