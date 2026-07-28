# Better Notes compatibility — test protocol

Weavero and Better Notes (`Knowledge4Zotero`) share three surfaces: the
note editor, note tabs, and links between notes. This protocol makes the
coexistence checks explicit — it was written 2026-07-26, the day a **BN
update restart deleted a live Weavero tab group** whose members were BN
note tabs (see §4; root cause was Weavero's boot-time empty-group
reconciler, hardened the same day). Companion docs:
[disable-testing.md](disable-testing.md), [restart-testing.md](restart-testing.md),
[resilience-testing.md](resilience-testing.md); the honest state of
plugin-compat automation lives in [TESTING.md](../TESTING.md) (roadmap #6).

Run this when: a new BN version installs (beta or release), a Weavero
release touches note-editor / note-tab / link code, or a new Zotero beta
lands (BN and Weavero both patch fast around betas).

## Fixtures

- A BN-authored note containing: a `zotero://note/u/<key>/` note link,
  a `zotero://select/...` link, a plain URL, and markdown formatting.
  (The "WV+BN coexistence test" note serves this role.)
- A **live** Weavero tab group whose members are BN note tabs, plus one
  saved group as a control.
- BN's workspace tab open.

## 1. Link interop (Weavero's built-in BN code)

- Open the BN-authored note: note links resolve (click navigates),
  Weavero's link decorations render inside the BN note without breaking
  BN's own rendering; no duplicate decoration.
  - Note-link routing contract: Weavero's click swallow →
    `handleZoteroURI` → BN's registered `zotero://note` protocol
    extension (in-process `doAction`) → BN opens/previews the note.
    With a note tab active, BN 3.3 shows the target in its PREVIEW
    split, not a new tab — that's BN's intended behaviour, not a miss.
  - There is NO legacy `<libraryID>_<key>` NOTE-link form to test:
    BN has emitted and parsed `zotero://note/<u|groupID>/<key>/`
    unchanged since its first release (verified across tags 0.1.0,
    0.2.0, 0.5.0, 0.7.9, 1.0.0a, 3.0.7, 3.2.2 and the installed
    3.3.0-beta.4, 2026-07-28) — old note links in user libraries are
    the same form BN parses today. The `<libID>_<key>` shape is the
    `zotero://select/library/items/...` legacy, covered by Weavero's
    own `handleZoteroURI` best-effort branch.
- Weavero comment/note popups on annotations whose comments carry
  `zotero://note/...` links to BN notes: links open the right note.

## 2. Note-editor lifecycle

- BN rebuilds note editors on its own schedule: edit a note in a tab,
  switch tabs, come back — Weavero's editor decorations must re-attach
  (no bare links) and must not stack (no doubled spans).
- Weavero disable with BN active: BN note editors keep working, native
  link colours return (the disable protocol's late-load leg, run with a
  BN note still loading).

## 3. Note tabs and tab groups

- BN note tabs join Weavero groups normally (stamp survives select /
  unload / reload of the tab).
- BN's workspace tab: OBSOLETE for BN ≥3.x — the workspace is a
  WINDOW (`body.workspace-window`), not a tab; BN creates no custom tab
  types at all (no `Zotero_Tabs.add` in BN 3.2.2+). BN note tabs are
  plain native `note` tabs, covered by the leg above.
- Restart with a live group of BN note tabs: group + membership +
  collapsed state survive (BN recreates note tabs on window load — the
  group's claim pass must re-stamp them).

## 4. BN update / reload churn  ← the 2026-07-26 incident

With a live group of BN note tabs open:

1. Update (or disable→enable) Better Notes from the Add-ons pane.
2. If Zotero prompts to restart, restart.
3. **Assert: every Weavero live group still exists** with full
   membership and its chip rendered; `weavero.tabGroups` pref and the
   `weavero/tab-groups.json` mirror agree; the mirror's `.bak`
   generation exists.
4. Repeat with the group **collapsed** (member tabs hidden) — the
   riskier shape: hidden members must not read as "closed".

Incident record: BN 3.3.0-beta.4 update restart, 2026-07-26 — the boot
guard lifted on a 3 s timer before the note tabs were re-stamped, the
reconciler saw an empty live group and deleted it. Hardening: a group
never seen open in the current session is exempt from empty-deletion,
and the mirror rotates a `.bak`. If step 3 ever fails again, recover
from `tab-groups.json.bak` and file it against the seen-open gate.

Run record 2026-07-28 (v0.17.5-dev.31→34, scripted AddonManager
disable→enable, no restart) — TWO more churn bugs found and fixed:

1. **Members pruned 3→1**: BN's `updateExistingNoteTabs` closes and
   reopens every note tab with a new id; the shadow-sync prune saw the
   close half and dropped members before the claim pass could re-stamp
   the reopened tabs. Fix: 20 s close-grace in `_applyTabGroups`
   (stamped-tab snapshot diff → `Zotero._wvGroupPendingClose`).
2. **LOADED note tabs vanished entirely**: a loaded tab's
   EditorInstance is still registered when BN's reopen calls
   `Zotero.Notes.open`; upstream takes the `editorInstance` branch and
   `select(<dead tabID>)` throws → the open aborts, the tab is lost.
   Fix: stale-instance guard in the `Notes.open` wrapper
   (unregister-not-uninit — uninit touches the dead iframe and throws
   before its own unregister). Finding this also exposed that the
   `_wvOpenPatched` boolean survived destroy() and blocked re-patching
   after every plugin reload — both open-wrappers are now
   version-stamped and unpeeled+cleared at destroy.

Both scripted legs (expanded AND collapsed) now pass with members,
stamps, chip, pref and mirror all intact. The §4 procedure is proven
scriptable end-to-end via the dev bridge.

## 5. Shared-editor gotchas (watch list)

- BN's markdown paste/conversion vs Weavero's note-editor decorations
  (`work/TODO.md` has an open investigation on BN converting pasted
  markdown).
- Both plugins observe the same editor DOM — after either plugin
  hot-reloads, reopen the note tab before judging breakage (stale
  handlers mimic conflicts).

## Automation status

Manual protocol today. The roadmap's plugin-compatibility CI tier
(TESTING.md #6) would install a pinned BN XPI in a separate job and
encode §1 and §3 as specs; §4 needs a scripted AddonManager
disable/enable cycle, which the disable protocol already exercises for
Weavero itself.
