# Resilience testing — persisted-state survival matrix

Weavero persists a lot of workspace state (tabs, tab groups, windows, sessions,
per-window library view). Each piece must survive every **teardown / lifecycle
path** and every **adversarial sequence** — not just a clean restart of a stable
workspace. This protocol is the explicit invariant matrix; it complements the
happy-path [restart-testing.md](restart-testing.md) and
[disable-testing.md](disable-testing.md).

## Why this exists (the incident)

2026-07-23: **two *live* (unsaved) tab groups were permanently lost** across a
Zotero restart. Root cause: `_applyTabGroups` deletes a non-saved group and prunes
its members when it observes "no open member tabs" — guarded only against *startup
restore*, **not** against **quit/teardown** (when Zotero closes every tab). So on
quit the open groups looked empty → were deleted from the `weavero.tabGroups` pref
→ nothing left to restore. The saved group (RT-A) survived because saved groups are
exempt. Fix: a `tearingDown` guard (`Services.startup.shuttingDown` / `_wvQuitting`)
added at both sites (tab-groups.ts). The store held group state *only* in the pref
(the session snapshot does **not** carry group membership), so there was no backup.

**Core invariant this establishes:** a group is deleted **only** by explicit user
intent (ungroup, or closing its last member tab during *normal* use). No teardown,
restart, reload, disable, session switch, or programmatic tab churn may delete it.

## State dimensions & invariants

| # | State | Store | Invariant |
|---|---|---|---|
| S1 | Open tabs (per window) | Zotero session + `windows.json` | All restored in order, matched by `libraryID:itemKey`; only selected loads, rest `*-unloaded`. |
| S2 | **Live** tab group (open, unsaved) | `weavero.tabGroups` pref | Survives every teardown; re-stamps its restored member tabs. Deleted only by explicit ungroup / last-member-close in normal use. |
| S3 | **Saved** (parked) tab group | `weavero.tabGroups` pref (`saved:true`) | Never auto-deleted; keeps its item-key snapshot + name/color/collapsed; reopenable. |
| S4 | Group visual state | pref | name, color, **collapsed/expanded**, member order preserved. |
| S5 | **Live** extra main / reader windows | `windows.json` | Restored with tabs, geometry, sidebar, pins, group stamps. |
| S6 | **Saved** windows | `saved-windows.json` | Preserved across restart; reopenable; not clobbered by a live-window capture. |
| S7 | Named sessions | `tab-sessions.json` | Byte-stable; the **active** session must not absorb a half-restored or churned workspace. |
| S8 | Per-window library view | `windows.json` / `colstore.json` | Selected collection, column layout/sort, item-pane width/collapsed restored per window. |

## Teardown / lifecycle events (E)

- **E1 Clean restart** — `Zotero.Utilities.Internal.quit(true)`.
- **E2 Hard crash** — kill the process (no clean quit).
- **E3 Plugin reload / reinstall** — install a new XPI / `zotero_plugin_reload` (tabs stay open).
- **E4 Plugin disable → enable** — Add-ons Manager (tabs stay open; all Weavero surfaces must vanish then return).
- **E5 Option toggle** — flip each `weavero.*` feature pref off then on (esp. tab-groups, outline takeover, sessions, window identity).
- **E6 Session switch** — switch to another named session (replaces current tabs with an auto-snapshot of the outgoing).
- **E7 Window close** — close a secondary main / reader window (its groups un-park / fold back, per the closed-in-series model).
- **E8 Programmatic / mass tab churn** — open+close many tabs rapidly (e.g. a batch reader sweep) while a live group's members are among them.

## The matrix (state × event) — expected result

Legend: ✔ survives · ✘ must NOT be destroyed · n/a.

| | E1 restart | E2 crash | E3 reload | E4 disable→enable | E5 toggle | E6 session switch | E7 window close | E8 mass churn |
|---|---|---|---|---|---|---|---|---|
| S1 tabs | ✔ | ✔ (≤~1 s loss) | ✔ | ✔ | ✔ | ✔ (into snapshot) | ✔ (fold back) | ✔ |
| **S2 live group** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ ← regression |
| S3 saved group | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| S4 group visuals | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| S5 live windows | ✔ | ✔ (≤~1 s) | ✔ | ✔ | ✔ | ✔ | n/a | ✔ |
| S6 saved windows | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| S7 sessions | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (active updates, others stable) | ✔ | ✔ (active must NOT churn) |
| S8 library view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | n/a | ✔ |

The two cells that the incident proved were unguarded: **S2 × E1** and **S2 × E8**.

## Reference workspace

Use `test/restart/fixture-notes.md` (2 main windows + 2 reader windows + 3 groups
+ notes + duplicates + a pinned tab + a collapsed group + a named session), then
**add for this protocol**:
- at least **one LIVE group** (open, never "Save and close") AND one **saved** group,
- one live group whose members will be deliberately churned (E8),
- a second named session containing its own live group.

## Running a cycle (snapshot-diff)

1. **Backup** `<profile>/prefs.js`, `<profile>/session.json`, `<data dir>/weavero/*.json`.
2. Build the reference workspace above.
3. Run [test/restart/snapshot.js](../test/restart/snapshot.js) → `before.json`
   (captures `mains`/`readers` with per-tab `grp` stamps, `groups` with
   `saved`/`collapsed`, and `sessions`).
4. Trigger the event under test (E1–E8).
5. Run `snapshot.js` again → `after.json`.
6. **Diff.** Assert, per the matrix: every group in `before.groups` is present in
   `after.groups` with identical `saved`, `collapsed`, name, color, and member set;
   every live group's member tabs are re-stamped (`grp` matches); no group id
   vanished; `tab-sessions.json` non-active sessions are byte-identical.
7. For E1/E2 also read `<data dir>/weavero/trace-quit.json` + `[Weavero][trace]`
   log lines for the restore phases.

## Adversarial sequences (the part happy-path testing misses)

- **A1 Churn-then-quit:** open ~30 reader tabs incl. a live group's members, close
  them all, THEN quit + restart → the live group must still exist (this is the
  fixed bug; the `tearingDown` guard covers the quit leg, and normal churn must not
  reach an "all members closed at once" delete for a group that's about to restore).
- **A2 Close last member (normal use):** in a *normal* session (not quitting),
  close a live group's last member tab one at a time → group *is* removed (empty
  groups must not persist — intended). Distinguishes user intent from teardown.
- **A3 Session switch with a live group:** switch away from a session that has a
  live group, switch back → the group returns intact (its membership rode the
  session snapshot OR the pref, whichever the design uses — verify which).
- **A4 Disable mid-group:** with a live group open, disable the plugin → member
  tabs stay, chip disappears; re-enable → chip + membership return (pref intact).
- **A5 Toggle tab-groups off/on:** flip the tab-groups feature pref → group
  definitions must survive the feature being off and reappear when back on.

## Known coverage gaps to close (follow-ups)

1. **Session snapshot should carry group membership** (defence in depth): today
   `tab-sessions.json` tabs store no `grp`, so a session restore relies entirely on
   the pref + claim-pass. Adding `grp` per tab (and a per-window `groups` array)
   would make sessions self-describing and give a second recovery source.
2. **A prefs-independent backup** of `weavero.tabGroups` (e.g. mirror into
   `<data dir>/weavero/tab-groups.json`) so a lost pref is recoverable.
3. **Automated specs** for A1–A5 (Mocha, in-Zotero) so these run on every PR rather
   than by hand — the infrastructure (`snapshot.js`, `_tabGroupsGet`) already exists.
