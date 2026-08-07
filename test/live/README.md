# Live verification tools

Scripts here are **not** part of `npm test`. They run inside a real
Zotero against the real library, because they need real data volume,
real search results, and the real items tree. The scaffold suite covers
what fixtures can cover; these cover what only a live library can.

| Script | What it verifies |
|---|---|
| `filter-matrix.js` | The whole filter case list, cascade vs build mode, comparing visible-row ids AND open-container ids |

## Running

Tools → Developer → Run JavaScript, paste the file, run. Then read:

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

## The rules this harness encodes

They are commented in the source too, but they are the point of the
file, so they are repeated here:

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

## When to run it

Per the standing rule: after **any** change touching filter apply,
cascade, row building, or keep logic. Also after a Zotero beta update —
the tree internals it patches are upstream's, and they do move (beta.23
changed selection handling under it).
