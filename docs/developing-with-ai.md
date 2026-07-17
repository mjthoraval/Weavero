---
layout: default
title: "Developing Zotero plugins with AI — from scratch to a live-Zotero workflow"
description: "How to build Zotero plugins with an AI coding agent: a from-scratch path (template, documentation, ecosystem rules, resources) plus the concrete workflow used to develop Weavero — driving a live Zotero through the MCP bridge, scripted benchmarks, and the gotchas that cost real debugging time."
---

# Developing Zotero plugins with AI

You use Zotero daily, you are missing a feature, and modern AI coding
agents can write most of the code — but a Zotero plugin is a peculiar
thing (it runs inside a Firefox-based app, with its own APIs, lifecycle,
and community rules), and an agent left alone will guess wrong about all
of it. This page serves two purposes:

- **[Part 1 — Starting from scratch](#part-1-starting-from-scratch)**:
  the path from nothing to a working, publishable plugin, with the
  ecosystem's tooling, rules, and a
  [resource directory](#resource-directory). No deep programming
  experience required — the agent is the hands; you are the judgment.
- **[Part 2 — The Weavero workflow in depth](#part-2-the-weavero-workflow-in-depth)**:
  the concrete day-to-day setup used to develop
  [Weavero](index) — giving the agent **direct access to a live,
  running Zotero**, scripted in-app benchmarks, and a
  [gotchas index](#gotchas-index) where every entry cost real time
  once. Nothing in it is theoretical.

> **The shortcut: give this page to your AI.** This page is written to
> be read by AI agents as much as by humans. Paste its URL (or its
> content) into your AI coding agent together with your plugin idea,
> and the agent will **guide you through the steps below** to build the
> plugin — explaining each one, doing the coding and in-app
> verification it can do itself, and walking you through the parts that
> need your hands (installing Zotero, creating the sandbox profile,
> installing the bridge, testing real gestures). You stay the judgment:
> read what it writes, test what it ships.

The experience behind this page is with
[Claude Code](https://claude.com/claude-code) in VS Code; the pieces are
[MCP](https://modelcontextprotocol.io)-standard, so any MCP-capable
agent should work.

## Part 1: Starting from scratch

### What you need

- **Zotero** — ideally the [beta](https://www.zotero.org/support/beta_builds)
  for development (recent APIs, and betas don't enforce plugin
  compatibility ceilings while you iterate).
- **An AI coding agent** (Claude Code or any MCP-capable equivalent).
- **Node.js** (≥ 20), **git**, and an editor (VS Code works well with
  agent integrations).
- The willingness to *read* what the agent writes and to test
  everything yourself.

### Step 1 — Isolate: a dedicated profile and data directory

Before anything else — and this applies to **any** Zotero development,
with or without an AI agent — separate your development environment
from your real library. Create a dedicated Zotero profile with its own
data directory, following the official guide:
**[Multiple Zotero profiles](https://www.zotero.org/support/kb/multiple_profiles)**
(`zotero.exe -P` opens the profile manager; give the dev profile its
own data directory in Settings → Advanced → Files and Folders). Sync it
to a throwaway account or not at all.

Everything development does — installing work-in-progress builds,
executing scripts, generating test data, letting newer builds upgrade
the database schema (a **one-way** operation) — happens in *that*
profile. An agent that can execute code in Zotero can also corrupt a
database; the sandbox makes that a non-event. The agent gets access to
the dev profile only, never the one holding your real library.

**Isolation, level two — a source-built Zotero.** Once you are past
the basics, a **source-built Zotero** (see the
[official build docs](https://www.zotero.org/support/dev/client_coding/building_the_desktop_app))
on a *third* profile lets you test your plugin against upstream HEAD —
weeks before changes reach a beta. It is a different binary, so it runs
alongside your daily Zotero; give each instance its own bridge port
([Part 2](#the-bridge-let-the-agent-drive-a-live-zotero) shows how).
Weavero catches upstream collisions (row-model changes, search reworks,
docShell behavior changes) this way, on the day they land — and the
one-way schema rule above is exactly why this sandbox, too, gets its
own data directory.

**Two low-friction on-ramps before you build anything.** You can learn
most of what matters about Zotero's API without a plugin skeleton:

- **Tools → Developer → Run JavaScript** — a built-in console with full
  privileged access to the running Zotero (tick *Run as async function*
  for `await`). Probe what the API really returns
  (`Zotero.Items.get(…)`, `Zotero.getMainWindow()`…), paste snippets the
  agent proposes and read the result, and run maintenance or test
  scripts — Weavero's manual test protocols are plain scripts pasted
  here. The official
  [JavaScript API guide](https://www.zotero.org/support/dev/client_coding/javascript_api)
  documents this console and the core API patterns.
- **[Actions & Tags](https://github.com/windingwind/zotero-actions-tags)**
  — a plugin that runs small user scripts on events (item added, tab
  opened…) or from menus/shortcuts. It is the gentlest way to automate
  basic operations and grow real API experience with zero build
  tooling — and a legitimate destination in itself if all you need is
  an automation. Weavero itself **began life as an Actions & Tags
  action script** and only later became a standalone plugin; when a
  script outgrows the harness, Step 2 is waiting.

### Step 2 — Start from the template, not from a blank folder

The community maintains a modern plugin stack; starting there saves the
agent from reinventing (badly) what already exists:

- **[zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)**
  — a complete starter plugin: TypeScript, build config, CI, hot reload.
  Click "Use this template" and you have a building, installable plugin
  before writing a line.
- **[zotero-plugin-scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold)**
  — the build/test/release tool the template uses (and Weavero uses
  standalone): bundles the XPI, launches a test Zotero, publishes
  releases.
- **[zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)**
  — helper APIs for common plugin needs (UI, prefs, shortcuts).
- **[zotero-types](https://github.com/windingwind/zotero-types)** —
  TypeScript definitions for Zotero's APIs. These matter *more* with an
  AI agent: a strict type check (`tsc --noEmit`) is a mechanical gate
  that catches a whole class of agent mistakes before runtime.
- **[make-it-red](https://github.com/zotero/make-it-red)** — Zotero's
  own minimal sample plugin, useful as a reference for the bare
  lifecycle.

### Step 3 — Give the agent ground truth

AI agents confidently misremember Zotero internals. The two
highest-value things you can do:

1. **Clone the [Zotero source](https://github.com/zotero/zotero)**
   (plus [reader](https://github.com/zotero/reader) and
   [note-editor](https://github.com/zotero/note-editor) if you touch
   those areas) somewhere the agent can search, and make verification
   against it a standing rule — Part 2 describes
   [how that rule is enforced](#teach-the-project-to-the-agent-instruction-files)
   in practice.
2. **Write instruction files** (Claude Code reads `CLAUDE.md` from the
   repo root; other agents have equivalents): how to build, how to
   test, and every invariant you learn the hard way, so no lesson has
   to be learned twice.

Documentation to point the agent (and yourself) at:

- **[Zotero Plugin Development docs](https://windingwind.github.io/doc-for-zotero-plugin-dev/)**
  — the community handbook (windingwind): environment setup, plugin
  anatomy, lifecycle, data model, privileged vs. unprivileged
  operations, real-world how-tos, and an API reference.
- **The official per-version developer notes** —
  [Zotero 7 for developers](https://www.zotero.org/support/dev/zotero_7_for_developers)
  (plugin architecture, main-window hooks, bootstrap lifecycle) and
  [Zotero 8 for developers](https://www.zotero.org/support/dev/zotero_8_for_developers)
  (JSM → ESM modules, Bluebird removed in favor of standard promises,
  preference panes in isolated scopes, the `MenuManager` API). Read the
  page for **every major version you target**: the breaking-changes
  lists are precisely what AI agents misremember — an agent's training
  data predates these changes, so left unguided it will write
  Zotero-7-era code (`.jsm` imports, Bluebird promise methods) that no
  longer exists.
- **[Zotero 8 Plugin Development Guide](https://gist.github.com/EwoutH/04c8df5a97963b5b46cec9f392ceb103)**
  (community, EwoutH) — a deep single-page reference: lifecycle-hook
  tables, the 7 → 8 migration (including the `migrate-fx140` scripts),
  Fluent localization, custom menus/columns/item-pane APIs, reader
  event handlers, packaging.
- **[The Zotero developer hub](https://www.zotero.org/support/dev/)**
  — the umbrella index: client coding, the web API, translators (a
  beginner-friendly side entry into the ecosystem), citation styles.
- **[Zotero source-code search](https://github.com/search?q=repo%3Azotero%2Fzotero&type=code)**
  — when the docs run out, the source is the documentation.

**Ask for prior art.** The best way to solve a problem is very often to
look at what others have done in similar situations — and an AI agent
is exceptionally good at that research *if you ask for it explicitly*:

- **Other Zotero plugins** — someone has probably faced your problem;
  open-source plugins are searchable answers. Have the agent study how
  they solved it before inventing an approach.
- **Zotero itself** — the cleanest pattern for almost anything is how
  Zotero's own code does it (that is what the source mirror is for).
- **The software that pioneered the behavior you want** — when Weavero
  needed tab tear-off, drag-and-drop, and window-focus semantics, the
  answers came from reading **Firefox's own tabbrowser source**, not
  from guessing; its test methodology borrows from Better BibTeX and
  Zotero's suite. Whatever UX you are copying, its origin has already
  solved the edge cases.
- **The sources on this page** — tell the agent to search the docs,
  source mirrors, and guides listed here when it is stuck. Agents don't
  reliably reach for references unprompted; "check how X does it" and
  "look through the linked docs first" are among the highest-value
  instructions you can give.

When code patterns are adapted from what you find, remember the
licensing rule below: license compatibly and credit the origin.

### Step 4 — Give the agent eyes and hands

The single biggest upgrade to AI-assisted plugin work is letting the
agent interact with a **live Zotero**: execute JavaScript, install and
reload builds, read the error console, query the database, take
screenshots. That is what the
**[MCP bridge for Zotero](https://github.com/introfini/mcp-server-zotero-dev)**
provides; the full setup (including running two Zotero instances) is in
[Part 2](#the-bridge-let-the-agent-drive-a-live-zotero). Install the
bridge in the **dev profile from Step 1 only** — the whole point of the
sandbox is that the agent's hands never reach your real library. And
capable hands deserve configured limits: see
[parametrise the agent](#parametrise-the-agent-permissions-and-guardrails)
in Part 2.

### Step 5 — Iterate in small, verified steps

The loop that works: describe one small behavior → the agent implements
it → typecheck gate → build → install into the sandbox → **verify in
the running app** (the agent can do much of this through the bridge;
you test the parts that need real gestures) → commit. Resist big-bang
features: agents are excellent at small verified increments and
unreliable at thousand-line leaps. Zotero's install/reload machinery
has sharp edges (caching, stale handlers, version rules) — they are
catalogued precisely in the
[edit–install–verify loop](#the-editinstallverify-loop) and the
[gotchas index](#gotchas-index) below.

### The ecosystem's rules — read before publishing

- **Never write to `zotero.sqlite` directly.** The Zotero developers'
  position is unambiguous: plugins must go through the data APIs;
  plugins that modify the database "won't be allowed into a future
  official plugin directory and could conceivably be banned from
  running altogether"
  ([forum statement](https://forums.zotero.org/discussion/132078/what-is-the-official-zotero-view-on-plugins-that-make-changes-to-the-zotero-databases-structure)).
  If you need persistent storage, attach your own database or use your
  own data files.
- **Do not claim compatibility with an unreleased Zotero major
  version.** Test on the beta (compatibility is unenforced there), but
  only bump `strict_max_version` after the feature-freeze announcement
  for that release — Zotero reserves the right to block plugins that
  declare far-future compatibility
  ([zotero-dev policy](https://groups.google.com/g/zotero-dev/c/21hDW54U6Lw)).
- **License compatibly and credit upstream.** Zotero is AGPL-3.0; if
  your plugin adapts Zotero source (agents do this a lot — make them
  tell you when), license compatibly and credit the origin.
- **Ask on [zotero-dev](https://groups.google.com/g/zotero-dev)** —
  the developer mailing list is active and the Zotero team answers; the
  [forums](https://forums.zotero.org) are the place for user-facing
  questions and feature discussions.

### Publishing

Release through the scaffold (it builds the XPI, creates the GitHub
release, and maintains the `update.json` that gives your users
auto-updates). To be discoverable, get listed in the
**[zotero-addons-scraper](https://github.com/syt2/zotero-addons-scraper)**
registry, which feeds the in-Zotero
**[Add-on Market plugin](https://github.com/syt2/zotero-addons)** most
users browse. (An **official Zotero plugin directory** is
[planned](https://www.zotero.org/support/plugins) and expected to
replace the third-party lists — that official plugins page is the
likely place it will appear, so it is the one to watch. Meanwhile the
[NGI0-funded plugin-ecosystem project](https://nlnet.nl/project/Zotero-plugin-ecosystem/)
— a **community effort, not affiliated with Zotero** — is consolidating
the community tooling above at
[zotero-plugin.dev](https://zotero-plugin.dev/), including a
work-in-progress community
[plugin registry](https://github.com/zotero-plugin-dev/zotero-plugin-registry).)

## Part 2: The Weavero workflow in depth

What makes AI-assisted development work well on Weavero is not only the
code generation — it is that the agent acts on what it **observed in the
running app** instead of what it guessed. Everything below was learned
building Weavero against Zotero 7–10.

### The bridge: let the agent drive a live Zotero

Two components connect the agent to Zotero:

1. **MCP Bridge for Zotero** — a small Zotero plugin that opens a
   Firefox Remote Debugging Protocol (RDP) server inside Zotero
   (localhost only). Zotero is Firefox under the hood, so the whole
   DevTools server ships with it; the plugin just opens the socket.
   Download `zotero-mcp-bridge.xpi` from the
   [mcp-server-zotero-dev releases](https://github.com/introfini/mcp-server-zotero-dev/releases/latest)
   and install it via Tools → Plugins → ⚙️ → Install Plugin From File
   (in the *dev* profile — see Step 1 of Part 1).
2. **[`@introfini/mcp-server-zotero-dev`](https://github.com/introfini/mcp-server-zotero-dev)**
   — an MCP server (run via `npx` from the
   [npm package](https://www.npmjs.com/package/@introfini/mcp-server-zotero-dev))
   that translates agent tool calls into RDP requests:
   `zotero_execute_js`, `zotero_plugin_install`, `zotero_plugin_reload`,
   `zotero_db_query`, `zotero_screenshot`, `zotero_read_errors`, DOM
   inspection, prefs, and more. Both halves live in the same repository.

Register it with the agent (one-time):

```
claude mcp add -s user zotero-dev -- npx -y @introfini/mcp-server-zotero-dev
```

On Windows, run that in **cmd, not PowerShell** — PowerShell strips the
bare `--` separator. And when passing environment variables, the server
*name must come before* the variadic `-e` flags:

```
claude mcp add -s user zotero-dev-source -e ZOTERO_RDP_PORT=6101 -- npx -y @introfini/mcp-server-zotero-dev
```

That second form matters as soon as you run **two Zotero instances**
(say, your installed beta and a built-from-source HEAD): give each its
own bridge port and register one MCP server per instance. The port pref
the bridge plugin reads is `extensions.zotero.extensions.mcp-rdp.port`
(per **profile**, not per binary). A brand-new MCP server needs a full
agent restart to appear — a mid-session reconnect is not enough.

### Teach the project to the agent: instruction files

Three habits carried the most weight in Weavero's instruction files:

- **"Verify, don't guess."** The agent must not assert how Zotero or
  Firefox behaves from memory — it greps the local source mirror or
  probes the live runtime through the bridge, *then* states the
  behavior. One wrong from-memory claim about saved-tab behavior cost a
  full debugging round-trip; this rule exists because that happened.
- **Write down the invariants that were paid for with regressions**,
  next to the code and in the instructions ("open note tabs only via
  `ZoteroPane.openNote`", "CSS `data-item-type` values are camelCase
  and kebab-case fails silently", ...). The agent reads them every
  session; the regression never repeats.
- **Post-edit integrity checks**: TypeScript gate (`tsc --noEmit`, zero
  errors, wired as a `prebuild` step), XML well-formedness for prefs
  panes (named HTML entities like `&nbsp;` are not defined in XHTML and
  blank the pane — use `&#160;`), JSON parse + version match for
  manifests. Cheap, mechanical, and they catch the classic
  agent-editing failure modes.

Weavero's instruction files themselves are private working notes, but
their operative content is distilled in this page and in the public
testing contract: **[TESTING.md](https://github.com/mjthoraval/Weavero/blob/main/TESTING.md)**
(which test suite to run on which kind of change), the
[`bench/`](https://github.com/mjthoraval/Weavero/tree/main/bench)
performance protocol, and the manual test protocols for what automation
can't reach ([restart/session](restart-testing),
[gestures](gesture-testing), [plugin-disable](disable-testing),
[taskbar overlays](taskbar-overlay-testing)).

### Parametrise the agent: permissions and guardrails

Instruction files teach the agent *what is true*; the agent's own
configuration decides *what it may do* — and tuning it is as important
as the prompts. Every serious agent has a permission system (in Claude
Code: `settings.json` with allow/deny rules per tool and command
pattern). Three settings carry most of the value:

- **Deny the destructive commands outright.** Weavero's deny list
  blocks force-pushes, `git reset --hard`, `git clean -f`, forced
  branch deletion, process kills (`Stop-Process` — see the
  never-force-kill rule below), and the release command. A guardrail
  like this is not distrust of the agent — it converts "the agent made
  a destructive slip" into "the agent had to stop and ask", which is
  exactly the failure mode you want. These rules have blocked real
  mistakes on this project, and a deliberate, human-confirmed exception
  remains possible.
- **Allowlist the routine loop.** The build/typecheck/test commands and
  the bridge's read-mostly tools should run without prompting — an
  iteration loop that asks permission forty times a session trains the
  human to click yes blindly, which is worse than either extreme.
- **Scope the reachable directories.** The agent gets the plugin repo,
  its working folders, and the sandbox — not your home directory.

Revisit the lists as habits form: promote commands that always get
approved, demote anything that ever surprised you.

### The edit–install–verify loop

1. Edit TypeScript → `npm run build` (the scaffold bundles the XPI).
2. `zotero_plugin_install` with the built XPI path (bump the version
   every build — Zotero will not reinstall the same version id).
3. **Force-reload with cache bypass** — the bytecode cache happily
   serves last build's code after an install. `zotero_plugin_reload`, or
   `loadSubScriptWithOptions(rootURI + "bootstrap.js", {ignoreCache: true})`.
4. Verify through the bridge: is the new behavior live? any new errors
   in `zotero_read_errors`?

Two lifecycle rules the loop depends on:

- **Hot-reload leaves stale DOM handlers.** After a reload, re-open the
  affected tab — or restart Zotero — before trusting a test result. For
  anything serious we cold-restart: `Zotero.Utilities.Internal.quit(true)`.
- **Never force-kill Zotero** (`Stop-Process`, task manager) as part of
  automation: unflushed state bites later. A force-kill once resurrected
  an add-on `userDisabled` flag that had been toggled back, which then
  "mysteriously" disabled the plugin two restarts later.

### Scripted in-app testing and benchmarks

The bridge turns tests and benchmarks into plain JavaScript executed
inside Zotero: generate fixtures (hundreds of annotations in one DB
transaction), drive the UI, sample `requestAnimationFrame` deltas for
frame-time statistics, read back structured JSON. Weavero's benchmark
suite lives in
[`bench/`](https://github.com/mjthoraval/Weavero/tree/main/bench) —
reader-load timings, sidebar/PDF scroll jank, window-machinery timings —
and it caught real regressions in our own "optimizations" the day they
were written. The patterns that matter:

- **Keep each evaluated script under ~20 seconds.** Long evals die with
  the bridge's request timeout, especially when the main thread is busy
  with layout/rendering work. Structure benchmarks as
  one-run-per-invocation and loop invocations from outside.
- **Cross the Xray membrane explicitly.** Chrome-side arrays and objects
  passed into reader-internal APIs throw
  `Permission denied to access property "length"` — wrap them with
  `Components.utils.cloneInto(value, targetWindow)`.
- **Synthetic events have limits.** `dispatchEvent` fires
  `addEventListener` handlers (fine for HTML UI), but XUL command
  handlers ignore untrusted events, and some flows (opening the in-PDF
  annotation popup) only respond to real user input. Test those
  manually and script everything else.
- **Anchor measurements on stable landmarks** (a specific card index via
  `scrollIntoView`), not on `scrollHeight` fractions — layout height
  changes with what you are testing, so fractional anchors quietly
  measure different content across configurations.
- **Beware shells eating backslashes.** Generating LaTeX test fixtures
  through a shell command corrupted every `\r`, `\n`, `\t` macro into
  control characters. Write scripts to a file and have the bridge read
  the file.

### Gotchas index

The compressed list — each of these cost real time once:

| Gotcha | Rule |
|---|---|
| PowerShell strips `--` | register MCP servers from cmd |
| Bytecode cache after install | force-reload with `ignoreCache` |
| Same-version reinstall is a no-op | bump the version every build |
| Hot-reload keeps stale DOM handlers | re-open tabs / restart before testing |
| Force-kill loses add-on state | always quit gracefully |
| Xray membrane | `cloneInto` everything passed into reader internals |
| Untrusted events | XUL command handlers ignore synthetic clicks |
| XHTML prefs panes | numeric character references only (`&#160;`, not `&nbsp;`) |
| `data-item-type` CSS | camelCase (`attachmentPDF`); kebab-case fails silently |
| Bridge eval timeout | keep scripts < ~20 s, loop from outside |
| Closures go stale across plugin reloads | resolve the live plugin object at event time |
| `localStorage`/`sessionStorage` | unreliable in Zotero — use `Zotero.Prefs` or your own files |
| Agents write Zotero-7-era code | ground them in the [per-version developer notes](https://www.zotero.org/support/dev/zotero_8_for_developers) (ESM, standard promises) |

### What this buys you — honestly

With this setup the agent routinely: diagnoses a startup crash by
reading the live error console and bisecting with add-on disable/enable
cycles; verifies a fix by driving the exact UI flow; measures a
performance claim instead of asserting it; and checks compatibility
against an upstream commit the day it lands. What it does *not*
replace: real user gestures (drag-and-drop feel, popup interactions),
taste, and the final judgment on what ships. The division of labor that
works: the agent proposes and verifies against the live runtime; the
human reviews diffs, tests the gestures, and decides.

## Resource directory

| Category | Resource |
|---|---|
| Interactive console | Tools → Developer → Run JavaScript · [JavaScript API guide](https://www.zotero.org/support/dev/client_coding/javascript_api) |
| Script harness / automation | [Actions & Tags](https://github.com/windingwind/zotero-actions-tags) |
| Template | [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) |
| Build/release tool | [zotero-plugin-scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold) |
| Helper APIs | [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) |
| TypeScript types | [zotero-types](https://github.com/windingwind/zotero-types) |
| Minimal sample | [make-it-red](https://github.com/zotero/make-it-red) |
| Community handbook | [doc-for-zotero-plugin-dev](https://windingwind.github.io/doc-for-zotero-plugin-dev/) · [Zotero 8 Plugin Development Guide](https://gist.github.com/EwoutH/04c8df5a97963b5b46cec9f392ceb103) |
| Official dev notes | [dev hub](https://www.zotero.org/support/dev/) · [Zotero 7](https://www.zotero.org/support/dev/zotero_7_for_developers) · [Zotero 8](https://www.zotero.org/support/dev/zotero_8_for_developers) for developers |
| Ground truth | [zotero/zotero](https://github.com/zotero/zotero) · [reader](https://github.com/zotero/reader) · [note-editor](https://github.com/zotero/note-editor) |
| AI ↔ live Zotero | [MCP bridge + server](https://github.com/introfini/mcp-server-zotero-dev) |
| Community | [zotero-dev list](https://groups.google.com/g/zotero-dev) · [forums](https://forums.zotero.org) |
| Distribution | [addons-scraper registry](https://github.com/syt2/zotero-addons-scraper) · [Add-on Market](https://github.com/syt2/zotero-addons) |
| Community ecosystem project | [zotero-plugin.dev](https://zotero-plugin.dev/) · [NGI0 grant](https://nlnet.nl/project/Zotero-plugin-ecosystem/) · [plugin registry (WIP)](https://github.com/zotero-plugin-dev/zotero-plugin-registry) |
| Worked example | [Weavero source](https://github.com/mjthoraval/Weavero) |

*This page reflects the Weavero workflow as of July 2026 (Zotero 10
beta). Corrections and additions welcome —
[open an issue](https://github.com/mjthoraval/Weavero/issues).*
