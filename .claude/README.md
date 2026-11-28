# Weavero's AI development process — published

This directory is Weavero's actual, live AI-agent workflow — published so
others can learn from it, contribute to Weavero with an agent, or copy the
structure for their own plugin. The methodology narrative (from-scratch path,
live-Zotero bridge, gotchas) is at
[docs/developing-with-ai.md](../docs/developing-with-ai.md); this README
explains the *structure*.

## The pieces

- **[AGENTS.md](../AGENTS.md)** (root) — durable facts an agent needs every
  session: commands, layout, hard invariants. Kept short; the ONE
  instruction file, agent-agnostic. [CLAUDE.md](../CLAUDE.md) imports it
  (`@AGENTS.md`, as Claude Code's docs recommend) and adds only what is
  specific to Claude Code: skill invocation, rule auto-loading, the active
  hooks. Modeled on
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
  gotchas, test etiquette. Every rule traces to a real regression. A
  rules file stays small enough to load whole (Claude Code loads about
  40,000 characters of one file): the TypeScript rules are split by topic
  into `src-ts-*.md` files with the same `paths:`, indexed in `src-ts.md`.
- **[hooks/](hooks/)** + **[settings.json](settings.json)** — mechanical
  gates (Claude Code only; AGENTS.md tells other agents to run the same
  check by hand). A Stop hook runs `npm run typecheck` in every tree
  (clone or worktree) where the turn changed a `.ts` file, and refuses to
  end the turn while errors remain; if they survive the retry, the turn
  ends with a message naming the failing tree, never in an endless loop.

## The learning loop

The part that keeps the system improving: every bug fix must end by
**locking the lesson in** (see `skills/bugfix`, Step 6):

1. a regression guard — a spec, a live-suite check, or a manual-protocol
   entry — that would have failed on the pre-fix code;
2. the lesson routed to its ONE home (a rules file, a skill step, a root
   AGENTS.md invariant, or the upstream-bugs register);
3. the `fix:` commit names its guard, and the release skill audits that
   every fix since the last tag names one.

So bugs converge: each one leaves the process stronger, and nothing depends
on anyone remembering.

## How the skills connect

The skills hand work to each other through FILES -- a plan, a register row, a
spec, a report -- never through one conversation's memory, so any session, any
agent or a later and more capable model can pick up where another stopped.

| Moment | Skill | Starts from | Hands on |
|---|---|---|---|
| A new idea | `feature` | the interactions with the existing features and the standing decisions (Step 2), the hard invariants | an approved plan; the build to `verify`; parallel work to `branch` |
| Something broke | `bugfix` | the tracking registers, the guards that exist | a fix with its guard to `verify`; the lesson to its one home |
| Any build | `verify` | the version rules, the specs the change touches | an installed build; the picked specs on both Zotero versions |
| Work beside other sessions | `branch` | the shared clone's state | a suffixed branch; at merge, the full suite once |
| A new Zotero version | `upstream-check` | the upstream mirrors, the collision notes | collisions to `bugfix` or `feature`; workarounds Zotero made obsolete, retired |
| A release | `release` | every gate, the fixes since the last tag and their guards | the published build |
| Periodically (maintainer-only skills) | the review skills | a coverage table of features x review dimensions, the registers | findings to `bugfix` / `feature`; decisions to the maintainer |

What keeps them durable as AI tools, Zotero and the plugin ecosystem change:

- A skill states the INTENT, the invariants and the evidence it requires;
  the mechanics live in scripts and specs that can be replaced without
  rewriting it.
- Every step leaves a named artifact, so the next step does not depend on
  who ran this one.
- Steps that are the maintainer's (a decision, anything outward, a push or a
  release) are marked as such; the rest may go to agents as far as their
  capabilities allow, within a stated budget.
- No Zotero version or tool name is hard-coded where a register can hold it
  (the compatibility matrix, the mirrors' refresh dates).
- A decision is recorded with its context and the change that would reopen
  it ("Revisit when"); a skill is revisited the same way.

## Changing this structure — migration rules

Every rule has a **loading class**, and restructures must respect it —
a rule is only as strong as the guarantee that it is loaded at the moment
it applies:

- **Mechanical** (hooks, permission gates) — cannot be skipped. For rules
  where a hard stop is affordable.
- **Ambient** (root AGENTS.md, which CLAUDE.md imports: always-loaded
  context) — for rules guarding
  actions that occur in MANY flows: versioning, committing, where to work.
  One line each; details may live deeper.
- **On-demand** (skills, path-scoped rules) — procedure detail. Allowed
  only when every flow needing it is funneled through a *binding* trigger:
  path-scope auto-load, or ambient text that says INVOKE the skill — a
  "see also" mention is not a trigger.

Moving a rule down this ladder (ambient → on-demand) requires adding its
binding trigger in the same change. Any pruning of a rule source requires:
a name→destination ledger written BEFORE deleting, a dangling-reference
scan after, and a snapshot of whatever is deleted.

## Using this for your own plugin

Copy the shape, not the content: a short root file with commands +
invariants, skills for your repeatable processes, rules scoped to paths,
one mechanical gate you never argue with, and the lock-it-in habit. Grow
every file incident-by-incident — none of this was written up front.
