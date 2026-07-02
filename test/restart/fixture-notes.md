# Reference fixture for restart testing

Build this workspace (or an equivalent) before running a cycle — it covers
the historically lossy combinations:

- **2 main windows**: the anchor plus one Weavero-managed window
  (`weavero.devNewMainWindow` → tab context menu → New Main Window).
- **Groups**: one group in each main window (put a NOTE tab in one of them),
  one group living in a reader window, one saved (parked) group, and one
  COLLAPSED group.
- **2 reader windows**: one with 4 tabs (2 grouped PDFs + an ungrouped
  snapshot + a note tab), one with a same-window DUPLICATE (same item twice).
- **Duplicates across windows**: open one member of each group again,
  ungrouped, in the other main window (this is what the startup claim pass
  used to grab).
- **A selected note tab** in the anchor window (the chronic native-restore
  drop) and a background note tab in the managed window.
- **A pinned tab** in a reader window.
- Distinctive **window geometry** (move a reader window; second monitor if
  available) and a reader **sidebar** opened at a custom width.
- One **named tab-session** active.
