# Live verification tools

Scripts here are **not** part of `npm test`. They run inside a real
Zotero against the real library, because they need real data volume,
real search results, and the real items tree. The scaffold suite covers
what fixtures can cover; these cover what only a live library can.

| Script | What it verifies | Result global |
|---|---|---|
| `filter-matrix.js` | The whole filter case list: cascade vs build mode AND the native Advanced-Search comparison, comparing visible rows, open containers, grey (dimmed) state, and selection. Also the per-case SPEED table (`speedSummary()`), written with the analysis to `<data dir>/weavero/filter-matrix-report.json` | `Zotero._wvMatrix` |
| `search-modes.js` | Quick-search MODE (titleCreatorYear / fields / everything) × a Weavero chip × both apply orders, against DB-computed ground truth; advanced search included | `Zotero._wvModes` |
| `interactions.js` | Filter × native-UI sequences (searches, collection switches, multi-collection and multi-library selections) applied in realistic orders | `Zotero._wvInteract` |
| `multi-window.js` | Per-main-window filter isolation — state, patches and watermarks never leak between windows | `Zotero._wvMultiWin` |

## Shared harness (`lib/harness.js`)

The earned-rules machinery — stability gating, `faSettle`, command-event
search, `syncControl` certification, the row walk, the reporter — lives
ONCE in `lib/harness.js` (`Zotero._wvLH`). **Load it before any suite**;
suites fail fast with a clear message when it is missing. The suites keep
their own oracles: that is what each one proves.

## Running

**The runner (preferred):** load `run-all.js` — it loads the harness,
runs the suites sequentially, and writes ONE combined report to
`<data dir>/weavero/live-report.json` (+ `.md` digest). Profiles:
`core` (search-modes, interactions, multi-window; ~5–8 min) or
`Zotero._wvLiveProfile = "full"` for + filter-matrix (~10–20 min). Edit
`ROOT` in the file (or predefine `Zotero._wvLiveRoot`) for a different
checkout path.

**A single suite by hand:** Tools → Developer → Run JavaScript — paste
`lib/harness.js` first, then the suite. Then read, e.g.:

```js
JSON.stringify(Zotero._wvMatrix.summary())
```

It restores your filter state, the build-mode pref, and the quick
search when it finishes (including on error).

Expect ~4 minutes for the full matrix. The items list will churn
visibly throughout — that is the test doing its job.

## Interpreting a failure

Before believing one, check these in order — every false alarm during
the 2026-08-05..07 campaign was one of them:

1. **Did both modes report `engaged: false`?** Then build mode never
   ran and the two runs took the *same* code path — a difference there
   cannot be a mode difference. Look at test conditions, not the plugin.
   (`summary()` reports this as `bothEngagedFalse`.)
2. **Is the delta ±1 row?** Live library churn while you work. Re-run.
3. **Is it self-consistent?** Run the same mode twice. If *that*
   disagrees, the harness or the environment is at fault, not the mode
   comparison.

## The rules the harness encodes

They are commented in `lib/harness.js` too, but they are the point of
the file, so they are repeated here:

1. **Space applies ≥900 ms.** An apply inside the 300 ms post-apply
   observer-suppression window gets bounced to a retry, so an immediate
   snapshot reads the *previous* state.
2. **Gate on stability only**, never on a minimum row count — small
   result sets are legitimate results.
3. **Drive quick search with a `command` event, never `input`.** Zotero
   searches via `ZoteroPane.search()` on `command`; `input` sets the
   value without ever running a native search, so only the plugin
   reacts — an ordering no real user can produce.
4. **Compare both hashes** — visible rows *and* open containers. Row
   counts alone hide expansion differences, and the expansion rules are
   a key part of the feature.
5. **Expect live churn** if you are using the library while it runs.


## Reading the timings

Four different clocks, reported separately because conflating them once
produced a misleading engine comparison:

| Field | Measures | Trust it for |
|---|---|---|
| `ring.setup/pass1/pass2/gatePatch/invalidate` | phases inside the inner apply | **diagnosing where time goes** — always available |
| `syncMs` | wall-clock across the apply call | **the blocking cost** — always available |
| `firstPaintMs` / `lastPaintMs` | Gecko `MozAfterPaint` — pixels on screen | **user-perceived completion**, but only when the window is visible |
| `stableMs` | polling until the row count stops moving | settling behaviour only — carries ~600 ms of polling padding, **never quote it as user time** |

`Zotero._wvMatrix.timings("build")` sorts cases by user-perceived time
and shows the full split; `summary()` gives pass/fail.

**Paint timing is opportunistic.** Gecko suppresses painting for an
occluded window, so a clean unattended run (Zotero behind other windows)
reports `paints: 0` on every case — that is correct behaviour, not a
failure. A run with the window visible gets real paint numbers but risks
your interaction polluting them. `windowVisible` is recorded per case and
`summary().paintTiming` says which situation applied.

**Comparing engines** (Weavero vs native): use `lastPaintMs` on both
sides, with the window visible and matched cache warmth. Comparing
`ring.total` against a wall-clock figure is what produced the bogus
"~7x faster than native" claim on 2026-08-07.


## What the native comparison is (and is not) evidence about

`vsNative()` compares the two engines on **results and execution time**.
It deliberately says nothing about the filter's actual value, which is
**access cost**: one click on a chip versus building the equivalent
advanced search by hand, every time you want it.

Concretely, from building the equivalents in this file: `annotationType`
takes an INTEGER, not the type name; `fileType PDF` needs a second
condition, `attachmentStorageType isNot webLink`, whose accepted values
are only discoverable from an exception message. Each took several
attempts with full API access and the source open. A chip is one click.

So a native equivalent being fast or exact is **not** an argument for
delegating to it. Use this harness to keep the engine honest, not to
decide whether the feature earns its place.

## When to run it

Per the standing rule: after **any** change touching filter apply,
cascade, row building, or keep logic. Also after a Zotero beta update —
the tree internals it patches are upstream's, and they do move (beta.23
changed selection handling under it).
