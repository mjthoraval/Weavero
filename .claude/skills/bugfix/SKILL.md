---
name: bugfix
description: Diagnose and fix a Weavero bug. Use when the user reports broken or unexpected behaviour. Repro-first discipline, instrumentation rules, and verification standards that this project's bug history has made mandatory.
---

# Bug diagnosis and fix workflow

When the user is *describing* a problem or asking what's happening, the
deliverable is the DIAGNOSIS — report findings and stop. Apply the fix only
when they ask (or when the report clearly requests one).

## Step 1: Reproduce before theorizing

- Get the exact repro steps. If the user reproduced something scripts can't,
  suspect MANUAL-GESTURE state (focus, reveals, twisty clicks, drags) — the
  grey-pair bug took five days because scripts never populate gesture-driven
  state.
- For named UI elements: grep the source AND dump the live DOM before matching
  on anything. Two wrong guesses = stop and go to ground truth.
- Check the tracking registers first (the maintainer's private `work/`
  notes when present; otherwise open issues and `docs/` test protocols) —
  the answer may be known.

## Step 2: Instrument correctly

- **Instrumentation masks races.** For timing-family bugs, wrapping the code
  path or fast polling can drop a ~50% failure rate to 0. Verify with plain
  repetition loops only; anything under ~1/8 needs many more runs to call
  fixed.
- **Intermittent + user-reported = bake a persistent ring buffer into the
  build at FIRST report.** Instance tracers die on reload; the user should
  never hit a bug three times before anything records it.
- Log via `Zotero.debug("[Weavero] …")`; read with `zotero_read_logs`.
- Filter bugs: suspect GENERATION MISMATCH first (state from one apply read
  during another). Verify across TWO consecutive applies, never one. Measure
  through `rowProvider` (`iv.rowCount`/`getRow` bypass the filter patch).
  After any filter change, verify open-container hashes, not just row counts.

## Step 3: Locate the true cause

- "What removed it?" and "what should have put it back?" are different
  questions — when teardown looks clean, check the restore path.
- A signal that pattern-matches a known failure may have a different cause —
  check the evidence supports the specific action before acting on it.
- If it reproduces with Weavero disabled, it's upstream: add an entry to
  the upstream-bugs register with a "Retire when" line instead of patching
  what Weavero didn't cause (fix in Weavero only what Weavero caused).

## Step 4: Fix minimally, comment the invariant

The comment states the constraint and the incident date, so the next reader
knows why the code refuses to be simplified.

## Step 5: Verify like it's release day

- INVOKE the /verify skill for the cycle (version bump, build, install,
  force-reload) — it owns the version rules; never bump from memory.
- Prove the fix against the ORIGINAL repro, plus the neighbouring cases the
  fix could plausibly break (e.g. same-state vs cross-state, both apply
  orders, with and without an active filter).
- Popup code touched → run `test/popups.spec.js`. Suite-covered machinery
  touched → run the affected specs. Full `npm test` only pre-release or on
  request.
- After a hot reload, open reader tabs hold STALE DOM handlers — reopen the
  tab before judging reader-side behaviour, and say so in the report.

## Step 6: Lock it in (mandatory — a fix without this step is not done)

1. **Regression guard.** One of, in order of preference:
   - a spec in `test/` (temp-profile harness) that exercises the
     fixed behaviour,
   - a check in the matching live suite (`test/live/*.js`) when it needs the
     real Zotero,
   - an entry in the matching manual-protocol page (docs/gesture-testing,
     docs/restart-testing, …) when only human gestures can reproduce it.
   The guard must be one that WOULD have failed on the pre-fix code — not
   merely one that passes now. If genuinely no guard is possible, write the
   exemption down (in the fix commit and the report), never silently.
2. **Route the lesson to its ONE home:** code convention → the matching
   `.claude/rules/` file; process mistake → the skill step that should have
   prevented it; hard behavioural constraint → the root CLAUDE.md
   Hard invariants;
   upstream defect → the upstream-bugs register with a "Retire when"
   line; personal preference/state → agent memory. Prune anything the new
   text supersedes.
3. **The `fix:` commit names its guard** — "Guard: test/popups.spec.js" or
   "Guard: manual-only, docs/taskbar-overlay-testing.md" — so /release can
   audit coverage without archaeology.

## Step 7: Report

Cause first, in one sentence a teammate can repeat. Then the fix, the
verification evidence, the guard added in Step 6, and anything still only
testable by hand.
