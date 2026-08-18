---
name: feature
description: Develop a new Weavero feature end-to-end. Use when the user requests a new feature or capability. Asks structured intake questions, produces a plan for approval, then implements, verifies, and reports autonomously.
---

# Feature development workflow

The user interacts exactly twice: the intake questions and the plan approval.
Everything after plan approval runs without asking.

## Step 1: Intake — ask before reading code

Ask structured questions with AskUserQuestion (1–4 questions, batched). Always
cover whichever of these the request leaves open:

- **Scope** — which surface does this live on (filter pane, reader, tabs, item
  pane, notes)? Main window only or every window?
- **Interaction design** — where does the control sit, what does a click do,
  what does Alt+click do? Offer 2–3 concrete alternatives with previews when
  the answer isn't obvious from the request.
- **Persistence** — does state survive restart? Synced (Extra field) or local
  (weavero/*.json)? Remember: no plugin-only features — links and data must
  degrade gracefully without Weavero (flag any exception explicitly BEFORE
  implementing).
- **Compatibility** — Zotero 9 fallback needed? (plural-first APIs, guarded
  v10-only calls). Check docs/compatibility.md for the current matrix.
- **Done-when** — what observable behaviour defines success? This becomes the
  verification checklist.

Do NOT ask about things the codebase already answers (conventions, file
placement, version numbering) or that have a standing decision in memory.

## Step 2: Ground truth

Before planning: grep the relevant `modules/*.ts` bundle(s), the upstream
mirrors for any native behaviour being mirrored, and the maintainer's
tracking notes (private `work/` registers when present; otherwise open
issues and `docs/`) for prior decisions touching the same surface.
Never assert how Zotero/Firefox behaves from memory — verify in the mirror or
live via `zotero_execute_js`, or label it a guess.

## Step 3: Plan checkpoint

Present a short plan: files touched, approach, invariants at risk (check the
"Subsystem invariants" list in project.md), test plan, and anything that
deviates from a standing convention. Wait for approval. This is the second and
LAST interaction.

## Step 4: Implement

- New methods go in the right `modules/*.ts` bundle as
  `function(this: WeaveroPlugin, …)`; wire via `Object.assign` in index.ts.
- Follow the path rules (auto-loaded from `.claude/rules/` when editing).
- Comments state constraints and hard-won invariants, not narration.

## Step 5: Verify (use the /verify skill's cycle)

Bump `-dev.N`, build, install into the RUNNING Zotero (check which profile is
live first: `PathUtils.profileDir`), force-reload, then verify each "done-when"
item live via the bridge — DOM checks, row counts, screenshots as evidence.
Simulate manual gestures where the feature involves them; note that scripted
events are `isTrusted: false` and XUL handlers may ignore them — if a check
can only be done by hand, SAY so in the report rather than faking it.

## Step 6: Lock in what the work taught

If implementation surprised you anywhere — an API behaved differently than
assumed, a convention was missing, a verification step was invented on the
spot — route the lesson to its one home (rules file / skill step /
project.md invariant / upstream register / memory) before reporting. New
behaviour with a contract worth keeping gets a guard: a spec, a live-suite
check, or a manual-protocol entry (same rules as /bugfix Step 6).

## Step 7: Report

Lead with what shipped and the verified evidence. Include:
- the rebuilt-XPI link with version in the text,
- any checks that need the user's hands (list them explicitly at the end),
- commits made (logical units, conventional prefixes, bump separate),
- guards added and lessons routed (or "none needed").

Do not push, release, or comment on public issues — those wait for the user.
