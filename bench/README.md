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

## Reference results (2026-07, Zotero 10 beta, 200-annotation fixture)

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
