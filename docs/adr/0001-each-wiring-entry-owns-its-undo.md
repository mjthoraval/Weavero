# Each wiring entry owns its undo

Status: Accepted, 2026-11-26

## Context

Weavero wires each main window through one ordered table (`WV_MAIN_WIRES`, `src/modules/window-wiring.ts`), but the table only wires. The undo of each entry was written by hand elsewhere: in `destroy()` (disable, reload, update), in the window-close teardown, or in a plugin-wide teardown looping over every window. Nothing tied an entry to its undo, and the lists drifted. The source comments record the cost: the `loadURI` and multi-open wraps were taken off only at a window's close and stayed after a disable until 1.0.5-dev.7; the Advanced Search listeners came off only on a rewire and stayed after a disable until 2026-11-22 (under zotero#6080, a dead function called on every key press); the per-window chrome teardowns ran only at a window's close, so a disable left live re-apply observers that brought the chips back. Each was found after the fact; nothing in the code's structure prevented it.

## Decision

Each **wiring entry** declares its **unwire** beside its wire, for one window. A runner unwires a window's entries in reverse table order, each on its own, both when the window closes and when Weavero is disabled or reloaded. The listeners and **layers** an entry adds while it wires are recorded against that entry and window, so its default unwire removes exactly those; a hand-written unwire is only for what that record cannot see. An entry that leaves nothing to undo says so, with the reason (**dies with its window**). An undo that must not run while Zotero quits is marked on its entry.

A table check fails any entry that declares none of these, and a round-trip spec unwires and rewires each migrated entry on a live window.

## Consequences

- Entries move one at a time; until the last one moves, `destroy()` keeps the hand-written undo of the others, with a shrinking allow-list in the table check.
- Order constraints between undos become table order (unwire runs in reverse), checked by the table spec.
- **Plugin-wide** undo (observers, menus, singletons) stays in `destroy()` for now; the standalone reader-window table follows the same pattern after the main-window one.
