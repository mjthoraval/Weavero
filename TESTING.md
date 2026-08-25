# Weavero testing strategy

How Weavero is tested, at every level — from a one-second typecheck to a
full performance protocol — including **when each level should run**, the
tools each level relies on, and which other plugins Weavero is tested
against. Levels are ordered from fastest/most-frequent to deepest/rarest.

> Maintainer note: the development assistant tracks the **trigger table**
> (§ When to run what) and proactively flags whenever a level is due —
> e.g. "this change touches popup code → run the popup specs and the
> manual popup checklist before building." The assistant's workflow files
> are published in [.claude/](.claude/) — the `verify` and `bugfix` skills
> encode these triggers, and every `fix:` commit names the regression
> guard this contract requires.

---

## Level 0 — Static integrity (seconds, after every edit)

| Check | Command | Gate |
|---|---|---|
| TypeScript | `npm run typecheck` (`tsc --noEmit`) | **0 errors, non-negotiable** — also runs automatically before every build via `prebuild` |
| `bootstrap.js` (plain-JS shim) | `node -c src/bootstrap.js` | parses |
| `prefs.html` (XUL fragment) | Python `xml.etree` well-formedness with XUL/HTML namespaces | parses; numeric character refs only (`&#160;`, never `&nbsp;`) |
| `manifest.json` / `package.json` | `python -c "import json; json.load(...)"` | parse **and versions match** |
| Size-delta sanity | diff stat | a one-line change must not shrink a file by hundreds of bytes |

**When:** after every edit to a tracked file; the full battery before any
rebuild.

## Level 1 — Automated suite (two tiers)

**Tier 1a — Node unit tests (`npm run test:unit`, seconds).** Pure logic
extracted into `src/lib/*` (no Zotero imports, dependencies injected)
runs under plain Node via mocha + tsx: text normalization, URL/markdown
regex assembly and classification (`test/unit/*.unit.ts` — the `.unit.ts`
suffix keeps them out of the scaffold's in-Zotero glob). Run these after
every edit; more of the pure core migrates here over time (see Roadmap).

**Tier 1b — in-Zotero suite (`npm test`, ~2–3 min).**
`zotero-plugin-scaffold` builds the plugin, launches a **real Zotero in a
throwaway temp profile** (`.scaffold/test/profile`), installs the build,
and runs Mocha + Chai inside Zotero's privileged context — the same
run-inside-the-app approach as upstream `zotero/zotero`'s own suite.

Current in-Zotero coverage (199 tests, 13 spec files):

- **Logic + adapter specs**: `filter.spec.js` (row-kind classification,
  path-aware matching, Zotero 9 fallbacks, dimming CSS, selection
  reconcile), `links.spec.js` and `normalize.spec.js` (verify the plugin
  methods correctly delegate to `src/lib/*` in the real runtime),
  `popups.spec.js` (the four popup-panel contracts),
  `default-attachment.spec.js` (the default-child feature: the marker
  tag's three anti-search-leak naming rules, mark/move/clear with
  Date Modified left untouched but `synced` still cleared, notes and
  linked URLs falling through `getBestAttachment`, the versioned
  re-assert that keeps Weavero outermost over a competing wrapper, and
  the one-shot legacy import, which never overwrites an existing Weavero
  choice and never touches PikaPei's own data; plus the five edge cases
  an adversarial audit turned up on 2026-08-04 — the PLURAL
  `getBestAttachments` hoisting the pick without dropping the rest, the
  sibling sweep reaching a TRASHED marker, a standalone attachment being
  refused, the toggle reporting live state rather than intent, and the
  parent's cached best-attachment state being invalidated; plus the four
  REPARENT-GUARD scenarios adopted from upstream zotero#3333's semantics
  on 2026-08-05 — plain reparent clears the pick, a merge strips the
  adopted pick while the master's survives, moving a pick to standalone
  clears it without silent resurrection on return, and moving a pick
  onto a parent that has its own leaves exactly one marked child; plus
  the DERIVED-FIELDS layer (2026-08-06) — the resident {pickID, autoID}
  pair stays FRESH across mark/clear (value-freshness assertions, not
  cache-emptiness: repaints legitimately re-prime evicted entries), the
  hot paths (hoist, getBestAttachment wraps, marker paint) consume it
  by source contract, and the per-id notifier observer is registered
  while wired and torn down with the rest; plus
  the TEARDOWN contract, verified live on the real profile 2026-08-05
  before being locked — unwire restores all five patch surfaces by
  function identity with every expando deleted and the reparent
  observer unregistered, a hoisted attachment order reverts to native,
  and rewiring brings the whole feature back; plus the HOIST PREF GATES
  (also live-verified 2026-08-05, including a full AddonManager
  disable/re-enable round trip on the real profile) — the sort prefs
  stop the hoist without disabling the open override, the automatic
  winner hoists only while `defattSortFirstAuto` allows it, and the
  master switch gates the hoist per call without unwiring; the
  DOM-rendered ▷ marker pref stays a live/manual check).
- **Native-search oracle parity** (in `filter.spec.js`, 2026-08-06):
  for every dimension Zotero's own search engine can express (item
  type, has-URL via the isNotEmpty operator upstream added 2026-07-13,
  attachment file type, annotation color), `Zotero.Search` and the
  Weavero predicate must agree over shared fixtures — first verified
  exactly on the real library (e.g. 15317=15317 item-type,
  16043=16043 has-URL). A fifth spec pins the CROSS-LEVEL semantics:
  plain AND is same-item (0 hits), while `resultLevel=item` — what the
  advanced-search window sets, caught by the user 2026-08-06 — rolls
  child conditions up to the top-level item and AGREES with Weavero
  (318=318 journal-articles-with-yellow-annotations on the real
  library). The one dimension native search genuinely cannot express
  remains cross-library membership.
- **Filter perf-cache specs** (in `filter.spec.js`, 2026-08-05): the
  full-state signature rotates on any dimension or quick-search change
  (multi-filter safety), the parent-only cascade detector stays false
  whenever a child-level dimension is in the mix, and the notifier
  invalidator nulls the cross-apply verdict cache and no-op signature
  on item writes.
- **Also-in-library filter specs** (in `filter.spec.js`, local-group
  fixture, 2026-08-05): the owl:sameAs URI parser (group / user /
  local-user forms, unknown group → null), the collector merging BOTH
  relation-storage directions with mirror-view agreement, trashed far
  items not counting (native Libraries-and-Collections parity), and the
  cache-backed include/miss predicate.
- **UI-state invariant specs**: `ui-state-recovery.spec.js` (who-wins
  contracts for stuck shared UI state, 2026-08-05: the drag-overlay
  watchdog restores pointer-events with no dragend at all, the restore
  sweep clears an orphaned suppression with no stash, and the boot
  selection guard yields permanently to one user gesture).
- **Integration specs** (drive the live app): `smoke.spec.js` (toolchain
  wiring), `reader-filter.spec.js` (the reader annotation filter's
  hide/restore channel), `note-linkify.spec.js` (bare-URL decoration in
  the note editor), `tab-groups.spec.js` (group-chip resilience and
  drag-state rules), `tearoff.spec.js` (reader tear-off ↔ merge-back lifecycle:
  no-reload swap with tab-identity carry, Firefox focusing rules,
  docShell activity under Zotero 10's deactivation machinery, ReaderTab
  class adoption, zombie-free disposal with forensic failure messages,
  Reopen Closed Window). Fixtures are tiny PDFs generated at runtime —
  no binary test assets.

**When:** before every commit that touches `src/`; always before a
version bump that will be installed for real use; three consecutive runs
when chasing a timing-dependent failure (the disposal-race bug was 3/3
reproducible at suite speed but invisible to hand testing).

**Gotcha:** `npm test` must pass `--exit-on-finish` (wired into the npm
script). The scaffold CLI otherwise forces watch mode regardless of the
config file, and editing a test mid-run re-runs the suite inside the same
dirty Zotero — cross-run state then poisons reader-lifecycle tests.

## Level 2 — GitHub CI (every PR, push, and release)

Two workflows, both on Ubuntu runners where the scaffold auto-installs
**Xvfb + a real Zotero beta** (`prepareHeadless`) so the same integration
suite runs headlessly:

- **`test.yml`** — on every pull request, every push to `main`, every
  `v*` tag, and manually via *workflow_dispatch*. Steps: `npm ci` →
  `npm run typecheck` → `npm test`. 10-minute timeout.
- **`release.yml`** — the **release gate**, manual `workflow_dispatch`
  with a chosen tag only. It re-runs the full battery against the exact
  tagged tree — `npm ci` → `npm run typecheck` → `npm test` →
  `npm run build` — and only then `npm run release` publishes the GitHub
  Release with the XPI and refreshes the rolling `release` tag's
  `update.json`. **Nothing ships without typecheck + the full suite +
  a clean build passing on CI.**

**When:** automatic. A release must never be published by hand around a
red `release.yml`.

## Level 3 — Live-instance verification (after every dev build)

Every `-dev.N` build is installed into a real, running Zotero beta and
force-reloaded (the bytecode cache otherwise serves stale code), then the
changed feature is exercised in place. Two instances exist:

- **Daily-driver beta** (real library) — where features must ultimately
  behave; used for verification probes and structured smoke checks.
- **Sandbox profiles** (`weavero-dev`, and `weavero-dev-source` for the
  source-built Zotero) — isolated libraries for anything risky:
  destructive flows, schema-upgrading builds, upstream-HEAD testing.

Verification is scripted through the **MCP dev bridge** (see Tools):
state inspection, structured probes (e.g. "tear off, sample
`docShellIsActive` every second, merge back, assert selection"),
screenshots for visual confirmation.

**When:** after every build that will be installed; any change to
tabs/windows/reader lifecycle gets a live round-trip probe on top of the
automated suite, because suite timing ≠ human timing (both have caught
bugs the other missed).

**The live suites** (`test/live/`, shared harness in `lib/harness.js`)
are the structured tier of this level: filter-matrix, search-modes,
interactions, reader-filter, multi-window — each with its own oracle,
`test/live/README.md` has the map. `run-all.js` runs them sequentially
and writes one combined report (`core` ≈ 5–8 min; `full` adds the
matrix). Touched filter/search machinery ⇒ run `core`; pre-release ⇒
`full`.

## Level 4 — Manual protocols (scripted checklists, in-repo)

Some surfaces cannot be exercised synthetically — programmatic events are
untrusted (`isTrusted: false`) and XUL handlers ignore them, OS focus is
meaningless under Xvfb. These run by hand, guided by in-repo scripts:

- **Disable / re-enable / reinstall** — [docs/disable-testing.md](docs/disable-testing.md)
  with `test/disable/leftovers.js` (post-disable: every Weavero surface
  gone, no orphan DOM/wrappers) and `test/disable/presence.js`
  (post-re-enable: every surface back **exactly once** — duplicates are
  the classic reinstall bug).
- **Restart / session reliability** — [docs/restart-testing.md](docs/restart-testing.md)
  with `test/restart/snapshot.js`: snapshot the full per-tab workspace
  before quit and after restart, diff the JSON (tabs keyed by
  `libraryID:itemKey`). In the sessions UI, expand saved sessions via the
  twisty only — clicking the row *switches* sessions.
- **Hand-only gesture matrix** — [docs/gesture-testing.md](docs/gesture-testing.md):
  real drags (tab tear-off, slot-precise drops, group chips, cross-window
  item drag-and-drop), OS focus rules after moves, and — on Windows —
  the [taskbar overlay matrix](docs/taskbar-overlay-testing.md), which
  also documents the measured Windows 11 shell behavior
  (`SetOverlayIcon` sticky associations et al.) for other developers.
- **Popup contracts** — after touching `openCommentPopup` /
  `openRelationsPopup`: run `popups.spec.js`, then one hand pass (open,
  toggle, outside-click dismiss, in-reader variant).

**When:** before every release; after touching the specific subsystem
(install/lifecycle code → disable protocol; session/tab persistence →
restart protocol; any drag/drop or focusing change → gesture matrix).

## Level 5 — Performance protocol (deep, occasional)

A reusable benchmark suite — published in [`bench/`](bench/) — that
drives a live Zotero over the dev bridge:
one-run-per-invocation benches for reader-tab load, sidebar scroll
frame-times, and Weavero's window/tab machinery, plus a generator for a
200-heavy-LaTeX-annotation fixture. Reference results and the
comparability rules (fixed-card scroll anchors, first-open discard,
configuration matrix) live in [bench/README.md](bench/README.md) —
regressions are measured, not felt (e.g. lazy sidebar previews:
steady-state scroll 17 ms vs 333 ms eager at 200 previews).

**When:** before merging any change that touches per-annotation
rendering, items-tree row patches, or other O(n)-per-row work; when a
user-visible sluggishness report arrives; after adopting a new upstream
beta if reader internals changed.

## Level 6 — Upstream attribution (when a beta breaks something)

To decide whether a breakage is Weavero's bug or Zotero's: run
**upstream's own test suite** against the same source build
(`test/runtests.sh -f tabs`, `-f reader`, …, from the `zotero-client`
checkout), and grep the upstream mirror for the changed machinery. Zotero
betas are audited on arrival against a known list of collision surfaces
(row-model patches, reader lifecycle, search-deck coexistence).

**When:** every new Zotero beta (audit); any failure that implicates
native machinery.

---

## When to run what — trigger table

| Trigger | Required | Recommended |
|---|---|---|
| Any `src/` edit | Level 0 | — |
| Before any commit / build | Level 0 + Level 1 | — |
| After installing a dev build | Level 3 probe of the changed feature | — |
| Touched tabs/windows/reader lifecycle | Levels 1 + 3 | tear-off/merge hand pass |
| Touched popups | `popups.spec.js` | popup hand pass |
| Touched the default-child feature or its marker tag | `default-attachment.spec.js` | context-menu hand pass (label + glyph) |
| Touched install/startup/shutdown wiring | — | Level 4 disable/re-enable protocol |
| Touched sessions/persistence | — | Level 4 restart protocol |
| Touched drag/drop or focus behavior | — | Level 4 gesture matrix |
| Touched filter apply / search / row building / keep logic | Level 3 `run-all.js core` | `full` (adds the matrix) |
| Touched per-row / per-annotation rendering | — | Level 5 perf benches |
| New Zotero beta installed | Level 6 audit | Level 1 + targeted Level 3 |
| Before a release | Levels 0, 1, 4 (all three protocols) | Level 5 if perf-relevant changes shipped |
| Release publication | Level 2 `release.yml` gate (automatic) | — |
| Flaky/timing suspicion | Level 1 × 3 consecutive runs | forensic assertion messages |

## Tools the tests rely on

| Tool | Role |
|---|---|
| **TypeScript (`tsc --noEmit`)** | the Level-0 gate; `allowJs`/`checkJs` extends it over the JS test specs |
| **zotero-plugin-scaffold** | builds (esbuild), packs the XPI, and runs the test suite inside a temp-profile Zotero; on CI it also provisions Xvfb + the Zotero binary |
| **esbuild** | bundles `src/index.ts` → `index.js` and `src/prefs/index.ts` → `prefs.js` |
| **Mocha + Chai** | test runner and assertions, executed inside Zotero's privileged context (upstream Zotero uses the same pair, assert-style, plus Sinon) |
| **GitHub Actions** | `test.yml` (PR/push/tag CI) and `release.yml` (manual release gate) |
| **MCP dev bridge** (`@introfini/mcp-server-zotero-dev` + the in-Zotero MCP-RDP plugin) | scripted access to a *running* Zotero for Level 3/5: evaluate JS, inspect state, install/reload plugins, screenshots; port 6100 = installed beta, 6101 = source build |
| **`Tools → Developer → Run JavaScript`** | zero-setup runner for the Level-4 protocol scripts (`test/disable/*.js`, `test/restart/snapshot.js`) in any Zotero |
| **Node / Python one-liners** | `node -c` syntax check for the bootstrap shim; Python for JSON/XML well-formedness |
| **Upstream `test/runtests.sh`** | Zotero's own suite, for Level-6 attribution against a source build |

---

## Prior art — how others test, and what Weavero took from it

Surveyed 2026-07 (sources listed below). The ecosystem reality: most
Zotero plugins ship **no automated tests at all** — the practices worth
learning come from Zotero itself, its submodules, and Better BibTeX.

| Source | Method | Weavero's takeaway |
|---|---|---|
| `zotero/zotero` main suite | 110 Mocha+Chai+Sinon files run inside a built Zotero; a rich `support.js` helper library (`createDataObject`, `waitForNotifierEvent`, dialog/window waiters); CI in 4 shards; fail-fast culture | **Adopted** — the integration tier runs the same way; helper patterns ported into the specs |
| **Better BibTeX** | Behave/Gherkin BDD; each scenario tagged with the GitHub issue it encodes (`./test/behave --tags @438`); every scenario boots a live Zotero with an isolated test profile | **Adopted in spirit**: every incident becomes a named regression test (the tear-off suite encodes the 2026-07 incidents); per-scenario Zotero boots and Gherkin overhead deliberately not adopted. **To adopt**: systematic issue-id tags in test names once GitHub issues exist |
| `zotero/translators` | machine-generated `testCases` embedded per translator; headless-connector CI; a **dedicated ESLint plugin** enforcing repo conventions | Points at a gap: conventions like the `_wv`/`wv-`/`weavero.` namespacing are enforced by review only — a custom lint rule could automate them |
| `zotero/pdf.js` | unit + Puppeteer integration + **reference tests** (rendering compared against golden snapshots via `test_manifest.json`) | The model for pixel-critical surfaces (icons, window glyphs, badges) — see roadmap |
| `utilities` / `document-worker` submodules | small standalone harnesses with fixtures (epub/pdf/snapshot), runnable outside the full app | External validation for the planned **Node-speed unit tier** (extract pure logic, test without booting Zotero) |
| `reader` / `note-editor` submodules | (almost) no tests of their own — upstream tests those features **from the parent app** | Validates Weavero testing reader features through the live app rather than in isolation |
| Better Notes, Zutilo, Tree Style Tabs, Tab Enhance (sources on hand) | no automated tests | The baseline Weavero is deliberately above |

## Roadmap — methods to add

In rough priority order:

1. **Node-speed unit tier** — STARTED: `src/lib/text.ts` + `links.ts`
   extracted and tested under plain Node (`npm run test:unit`, both CI
   gates run it). Next extractions: the filter keep-loop / row-kind
   logic and the idle-queue scheduler. (Pattern:
   `utilities`/`document-worker`.)
2. **Persistence round-trip tests** — save → restore → save must be
   idempotent for every Weavero store (`windows.json`, tab sessions,
   bookmarks, pinned tabs); diff the JSON. (Pattern: Better BibTeX's
   export-comparison approach, applied to state instead of exports.)
3. **Issue-tagged regression names** — once issues are tracked on
   GitHub, encode the issue id in the test name (BBT's `@NNN` pattern)
   so coverage of known bugs is grep-able.
4. **Convention lint** — a small custom ESLint rule set enforcing the
   namespacing rules (`_wv*` methods, `wv-` DOM ids/classes, `weavero.`
   prefs; no bare `console`), replacing review-time vigilance.
   (Pattern: `eslint-plugin-zotero-translator`.)
5. **Golden-image checks for pixel-critical UI** — screenshot the icon /
   glyph / badge surfaces at fixed DPI and compare against committed
   references with a tolerance. (Pattern: pdf.js reftests.) Manual-eye
   verification remains the fallback where rendering is
   platform-dependent.
6. **Automated plugin-compatibility tier** — the suite currently runs
   with Weavero alone in the temp profile, so CI never exercises
   coexistence. Plan: a separate spec (own CI job, so the core suite
   stays hermetic) whose `before()` installs pinned companion XPIs via
   `AddonManager`. **Default Attachment** (PikaPei) is the best first
   candidate: a 41 KB XPI, no network or UI dependencies, and it patches
   a method Weavero also patches — exactly the class of conflict CI
   cannot currently see. Testing it by hand already caught a real bug
   (a rival loading later took the outermost slot). Then Annotation
   Markdown — Weavero has interop code for it — then Better Notes.
   Asserts the interop invariants:
   preview rendering yielded to AM, Weavero links injected inside AM
   previews, no duplicate rendering, no errors on the shared surfaces.
   (Pattern: the perf protocol's configuration matrix, automated.)

Sources still worth a deeper read before building the above: Better
BibTeX's `test/` + `minitests/` internals (fixture library and export
snapshot mechanics — the model for #2), pdf.js's reftest `driver.js`
(the diffing harness — the model for #5), and the
`zotero-plugin-template` / `zotero-plugin-toolkit` ecosystem for any
newer scaffold test capabilities.

## Plugin compatibility

Two tiers: plugins Weavero has **explicit interop code for** (mentioned
in the source), and plugins **verified to coexist** by regular use or
dedicated testing alongside Weavero.

**How compatibility is currently tested — honestly:** the automated
suite runs with Weavero alone (hermetic temp profile), so plugin
coexistence is NOT covered by CI today. It is covered by (a) the
performance protocol's configuration matrix (none / Weavero / companion
/ both — the deliberate method, used for Annotation Markdown), (b)
hand verification of each interop feature with both plugins enabled,
and (c) continuous daily use alongside the "verified to coexist" list
below. Automating a compatibility tier is on the roadmap above (#6).

The Default Attachment interop was verified by **installing the real
plugin and driving its own UI** — creating a pick through its "Set
Default" menu item, then asserting Weavero's import and precedence
against the data it actually wrote. That is the method to prefer
whenever a companion writes state Weavero reads: it caught both an
assumption that held (their pref name and JSON shape) and two claims that
did not — wrapper order after a later install, and migration silently
overwriting an existing Weavero choice. A purge feature built on top of
this was later removed as disproportionate: a permanent setting for a
one-off chore. Weavero now only ever ADDS its own tags, and the README
documents removing the other plugin's data by hand.

**A companion's state can change under you.** That plugin prunes its own
stale mappings whenever its wrapper evaluates an affected item, so its
pref shrinks as the user browses (verified live 2026-08-03: a dangling
mapping became `{}` after one `getBestAttachment` call). A probe that
counts a companion's records before and after an unrelated step can
therefore see different totals with nothing wrong — chase such a gap to
ground truth before treating it as a Weavero bug, and never assert a
companion's data is stable across steps without re-reading it.

### Built-in interop (referenced in Weavero's code)

| Plugin | Interop |
|---|---|
| **Better Notes** (`Knowledge4Zotero`) | Weavero resolves the legacy `<libraryID>_<key>` link form that old Better Notes links carry, and its note-editor link handling is tested against BN-authored notes |
| **Zotero Annotation Markdown** (0.4.0) | when AM is active in a reader document, Weavero yields comment-preview rendering to it, injects its clickable-link spans inside AM's rendered previews, and restores the "Add comment" affordance AM hides on empty comments |
| **Better BibTeX** | Weavero's link machinery recognizes BBT's registered export-translator IDs (citekey-based flows) |
| **PMCID Fetcher** | Weavero deliberately ships **no** DOI/PMID/PMCID columns (PMCID Fetcher provides them); Weavero's *Has PMID / Has PMCID* filters read the same Extra-field convention |
| **Actions & Tags** | Weavero began life as an Actions & Tags action script and remains compatible with it |
| **Default Attachment** (`PikaPei`, v1.0.0) | Both patch `Zotero.Item.prototype.getBestAttachment`. Weavero imports that plugin's stored picks on first start (its pref is left intact so the user can go back), and re-asserts its own wrapper over theirs — via a `Zotero.Plugins` observer, so a rival installed or enabled *after* Weavero still ends up underneath. Weavero's pick wins; with no Weavero pick theirs is still honoured. Its opt-in Weavero NEVER deletes their data — removing it is a manual step documented in the README. **Usability trap (hit live 2026-08-03):** with both enabled the items menu shows *two* near-identical entries — their **“Set Default”** and Weavero's **“▶️ Set as Default”**. Using theirs writes only their pref, so no `▶️ wv-defatt` tag appears and the choice does not sync. The leading glyph is what tells them apart; when testing this feature, check which entry was clicked before treating a non-effect as a bug |

### Verified to coexist

Run continuously or repeatedly alongside Weavero during development on
Zotero 10 beta: **Better Notes**, **Better BibTeX**, **Actions & Tags**,
**PMCID Fetcher**, **Zotero Focused Mode**, and the **MCP Bridge**
development plugin. **Default Attachment** (PikaPei v1.0.0) is kept
installed and enabled in the source-build sandbox as a standing
coexistence fixture — it is the only companion that patches a method
Weavero also patches, so it is the one that catches wrapper-order
regressions. **Tab Enhance** has been evaluated side-by-side and
is safe alongside Weavero (overlapping tab features simply coexist).
Tab-management plugins that restyle the same tab bar (e.g. **GroupTag**,
**Tree Style Tabs**) work but duplicate Weavero's tab-group features —
prefer enabling one system at a time.

Compatibility reports (good or bad) are welcome as GitHub issues.

---

*Weavero targets Zotero 9 and 10; the automated suite runs on the Zotero
version the scaffold provisions (currently the 10 beta). The
feature-by-version status lives in
[docs/compatibility.md](docs/compatibility.md).*
