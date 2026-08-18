# Weavero performance protocol (`bench/`)

A reusable benchmark suite for Zotero plugin developers: reader sidebar
rendering, reader-tab load time, and Weavero's window/tab machinery. It
was built to measure Weavero against (and alongside) the
[Zotero Annotation Markdown](https://github.com/qrkks/zotero-annotation-markdown)
plugin, but the harness and the methodology are general — use it to
measure any plugin that touches the reader sidebar or the tab system.

## Prerequisites

- A running Zotero (9 or 10) with the
  [MCP-RDP dev bridge](https://github.com/introfini/mcp-server-zotero-dev)
  plugin installed, so scripts can be evaluated in the live app. Any
  other way of running privileged JavaScript works too — every bench is
  a self-contained snippet you can paste into
  *Tools → Developer → Run JavaScript* (check "run as async function").
- Python 3 and Node/npx if you use the bundled `rdp-probe.py` runner.
- Test documents **in your own library** — a **heavy** one (a long PDF,
  ~1000 pages, that will carry 200 generated annotations) and a **light**
  one. Edit the `ITEM_ID` constants at the top of the scripts to your
  item IDs before running. Use a scratch profile/library, not your real
  one: the fixture generator writes 200 annotations.

## Running a script

```bash
PYTHONIOENCODING=utf-8 python rdp-probe.py file <script.js>
```

`rdp-probe.py` speaks MCP over stdio to `npx -y @introfini/mcp-server-zotero-dev`.
The bridge port comes from the `ZOTERO_RDP_PORT` environment variable
(default 6100). Keep every evaluation **under ~20 s** — the bridge times
out on longer evaluations (KaTeX churn can push a naive full-suite eval
past 30 s); that is why the benches are one-run-per-invocation. Loop
invocations for statistics.

## Test data

- `am-heavy-annotations.js` — creates **200 heavy LaTeX/Markdown
  annotations** on the heavy document (display equations with nested
  fractions, 4×4 matrices, tables, nested lists, code blocks, all four
  TeX delimiter styles) spread across the document. All tagged
  `wv-am-perf-test`.
  ⚠ Run it via `rdp-probe.py file` or paste it — passing the code
  through a shell argument eats one backslash level and silently
  corrupts every `\r`/`\n`/`\t` TeX macro (`\rho` arrives as a literal
  carriage-return + "ho"). The script self-checks (`backslashIntact`).
- `cleanup-test-annotations.js` — deletes everything with that tag.

## The benches

| Script | Measures | Notes |
|---|---|---|
| `m-prep.js` | fresh reader open; reports plugin wiring, card count | run before `m-sidebar` / `m-pdf` |
| `m-sidebar.js` | sidebar: fresh-region render dwell + scripted-scroll frame times (median/p95/worst) | the contention surface for preview-rendering plugins |
| `m-pdf.js` | PDF view: mid-document jump settle + scroll frame times | control surface — should stay smooth in every configuration |
| `bench-reader-load.js` | cold reader-tab open: `tReady` (reader alive), `tSidebar` (all cards present), `tPreviews` (preview count settles) | one run per invocation; edit `ITEM_ID` |
| `bench-window-machinery.js` | tab → reader-window tear-off duration (`swapUsed` = Weavero's no-reload docshell swap), window-close behavior | edit `ITEM_ID`; pick a light document so machinery cost isn't swamped by PDF load |
| `bench-weavero-ui.js` | items-list filter apply/clear latency; tabs-menu open | requires Weavero; treat the tabs-menu number as indicative only |

## Methodology / comparability rules

Hard-won rules — numbers are only comparable if you follow them:

1. **Measure a matrix of configurations** (no plugin / plugin A / plugin
   B / A+B). Toggle via `AddonManager` plus a graceful restart
   (`Zotero.Utilities.Internal.quit(true)`) — never force-kill the
   process between configurations: unflushed addon state can resurrect a
   disable you already reverted.
2. **Anchor sidebar scrolling on fixed card indexes** (`m-sidebar.js`
   scrolls card #30/#80 into view), never on `scrollHeight` fractions:
   total scroll height varies per configuration (each plugin's clamped
   previews change it), so fraction anchors cover *different annotation
   ranges* in different configs.
3. **Discard the first-ever open** of a document after a restart — cache
   warm-up can add seconds to `tSidebar`. Use ≥ 3 runs per data point.
4. With **lazy rendering**, dwell/settle metrics include background idle
   work — read them as *time to full coverage*, not user-perceived
   delay; the **frame-time stats are the user-perceived metric**.
5. Some plugins only wire readers they saw open — after a restart,
   close and reopen the test tab before measuring (the prep script does
   this) and verify the plugin's stylesheet/DOM markers are present.

## Reference results

Recorded on the maintainer's machine — treat all numbers as *shapes*, not
absolute targets; re-run on the same library and compare deltas.

### Items-list filter apply/clear (2026-08-18, Weavero 0.18.6-dev.1, real library)

**The simple answer** — on an 18,000-item library, applying a Weavero
filter takes about the same time as, or less than, Zotero's own quick
search on the same library:

| Operation (same library, same session) | apply | clear |
|---|---|---|
| **Weavero chip**: Item Type = Journal Article | **1.5 s** | **0.7 s** |
| **Native Advanced Search**, same criterion, same 15,333 results | 3.7 s | 3.5 s |
| **Weavero filter** — typical across all 39 configurations (median) | 1.6 s | — |
| **Weavero filter** — fastest to slowest configuration | 1.5 – 2.4 s | — |
| Native quick search, text narrowing (context only) | 2.5 – 3.4 s | 3.2 – 4.3 s |

The first two rows are a like-for-like comparison: the same criterion
(*Item Type is Journal Article*) producing the identical result set,
applied via Weavero's chip vs Zotero's Advanced Search
(`itemsView.setFilter("advanced-search", …)`), timed to row-count
stability. The quick-search row is *analogous* rather than identical
(text search does full-text/database work) and is kept for context.
Details below.

Filter speed is measured by two tools that share one list of filter
configurations (defined once, in the matrix, so speed and correctness
coverage cannot drift apart):

- **Quick headline** (`bench-weavero-ui.js`, seconds to run): times a
  single representative case — a journalArticle chip on the full
  library — apply **1474 ms**, clear **696 ms**.
- **Full run** (`test/live/filter-matrix.js`, ~6 min — run it, then read
  `Zotero._wvMatrix.speedSummary()`): times all 39 filter configurations
  in both modes while verifying their correctness in the same pass.
  `paintMs` (last paint) is the user-perceived apply time; `ringMs` is
  the plugin's own work.

Baseline — 2026-08-18, Weavero 0.18.6-dev.1, Zotero 10.0-beta.26,
maintainer's library (17,932 top-level rows), 39/39 correctness pass:

| Statistic (cascade mode) | paintMs | ringMs |
|---|---|---|
| median across 39 configs | 1570 | 1136 |
| worst (`hasAnnotations FALSE`) | 2382 | 1819 |

Slowest five: hasAnnotations FALSE (2382), hasRelated (1914),
itemTypeEXCL + color (1647), fileType linkedFile (1612), hasTag (1597).

**Native comparator** (same library, same session, `fields` mode, driven
by `command` events): Zotero's own quick-search narrowing — the closest
native operation to a chip apply — measured with Weavero disabled:
search "drop" first row change **2480 ms**, stable **3356 ms** (8,294
rows); clearing the search 3223 / 4286 ms. With Weavero installed but
idle the same run reads 2405 / 4405 ms — within noise of native. Caveat:
these are *analogous* operations, not identical ones (quick search does
full-text/DB work; a chip filters already-loaded rows), so the native
numbers bound the comparison rather than equal it. On this library,
Weavero's filter applies (1474 ms headline, 1570 ms median, 2382 ms
worst) sit at or below the native search's own narrowing time.

### Reader sidebar / PDF scrolling (2026-07, Zotero 10 beta, 200-annotation fixture)

Recorded on the maintainer's machine — treat as *shapes*, not absolute
numbers. Sidebar vs PDF, identical methodology per configuration:

| Config | Sidebar dwell | Sidebar frames med/p95/worst (ms) | PDF frames med/p95/worst |
|---|---|---|---|
| no plugin | 527 ms | 17/17/17 | 17/20/33 |
| Weavero (eager previews) | 878 ms | 17/67/333 | 17/33/117 |
| Weavero (lazy previews, current) | ~540 ms | **17/17/17** | — |
| Annotation Markdown alone | 1208 ms | 33/50/133 | 17/33/33 |
| AM + Weavero | 1468 ms | 33/167/300 | 17/33/67 |

Findings that generalize beyond these two plugins:

- **All contention concentrates in the annotations sidebar; the PDF view
  stays smooth in every configuration** — measure both, but optimize the
  sidebar.
- Eager preview rendering is a one-time cost that shows up as a
  worst-frame hitch; per-viewport lazy rendering is cheap to open but
  pays on *first visit* of each region. Anchored probes showed
  re-scrolling already-rendered ground is baseline-smooth — a
  fraction-anchored probe misreads this as "pays per screenful forever".
- Weavero's lazy pass (visible-first render, `requestIdleCallback`
  drain, IntersectionObserver promotion, `content-visibility: auto`)
  restored the no-plugin frame profile at 200 previews.
- Weavero's no-reload tear-off is content-independent (~1 s regardless
  of document weight) because it swaps docshells instead of reloading.
- Closing a single-document reader window closes the document by design
  (matching Firefox and native Zotero); recovery is Weavero's *Reopen
  Closed Window* (Ctrl+Shift+T), not an automatic tab restore.
