# Weavero's AI development process — published

This directory is Weavero's actual, live AI-agent workflow — published so
others can learn from it, contribute to Weavero with an agent, or copy the
structure for their own plugin. The methodology narrative (from-scratch path,
live-Zotero bridge, gotchas) is at
[docs/developing-with-ai.md](../docs/developing-with-ai.md); this README
explains the *structure*.

## The pieces

- **[CLAUDE.md](../CLAUDE.md)** (root) — durable facts an agent needs every
  session: commands, layout, hard invariants. Kept short; agent-agnostic
  ([AGENTS.md](../AGENTS.md) points here). Modeled on
  [zotero/zotero's CLAUDE.md](https://github.com/zotero/zotero/blob/main/CLAUDE.md)
  and the [zotero/translators skills suite](https://github.com/zotero/translators)
  — the Zotero core team's own practice.
- **[skills/](skills/)** — step-by-step workflows, one per repeatable
  process. `feature` interviews the human with structured questions, plans
  (one approval checkpoint), then implements and verifies autonomously.
  `bugfix` encodes repro-first discipline. `verify` is the
  build→install→force-reload→live-check cycle. `release` is maintainer-only.
  `upstream-check` triages new Zotero versions for collisions.
- **[rules/](rules/)** — path-scoped conventions that load only when the
  matching files are edited: TypeScript survival rules, prefs.html XML
  gotchas, test etiquette. Every rule traces to a real regression.
- **[hooks/](hooks/)** + **[settings.json](settings.json)** — mechanical
  gates. A Stop hook refuses to end any agent turn that changed
  `src/*.ts` until `npm run typecheck` passes.

## The learning loop

The part that keeps the system improving: every bug fix must end by
**locking the lesson in** (see `skills/bugfix`, Step 6):

1. a regression guard — a spec, a live-suite check, or a manual-protocol
   entry — that would have failed on the pre-fix code;
2. the lesson routed to its ONE home (a rules file, a skill step, a root
   CLAUDE.md invariant, or the upstream-bugs register);
3. the `fix:` commit names its guard, and the release skill audits that
   every fix since the last tag names one.

So bugs converge: each one leaves the process stronger, and nothing depends
on anyone remembering.

## Using this for your own plugin

Copy the shape, not the content: a short root file with commands +
invariants, skills for your repeatable processes, rules scoped to paths,
one mechanical gate you never argue with, and the lock-it-in habit. Grow
every file incident-by-incident — none of this was written up front.
