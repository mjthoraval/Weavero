# The `wvpos` link format

Weavero's "Copy Link to Selected Text" and "Copy Link to This Position" produce
standard `zotero://open` URLs carrying one extra query parameter:

```
zotero://open/library/items/4ACNJDVM?page=16&wvpos=eyJwIjoxNSwiciI6W1s3Mi4x...
```

## Design goals

- **Self-contained.** Everything needed to navigate and highlight travels
  inside the link. Nothing is resolved by ID, so the link keeps working after
  whatever created it (a bookmark, an outline entry, nothing at all) is
  renamed, moved, or deleted.
- **Safe without Weavero.** `page=` always rides alongside, and Zotero ignores
  query parameters it doesn't know — so on a plain Zotero install the link
  opens the document on the right page. Precision degrades; the link never
  breaks.
- **Aligned with Zotero's own model.** The position payload is Zotero's
  annotation position format (`{pageIndex, rects}`), field names shortened.
  The text-context fields follow the semantics of the W3C Web Annotation
  `TextQuoteSelector`.

## Payload encoding

`wvpos` is URL-safe base64 (`+`→`-`, `/`→`_`, padding stripped) of UTF-8 JSON:

| key | type | meaning |
|-----|------|---------|
| `v` | number | format version (currently `1`; absent in the earliest links) |
| `p` | number | `pageIndex`, 0-based |
| `r` | number[][] | `rects`, Zotero annotation position format, rounded to 2 decimals |
| `k` | string? | `"pin"` for a point marker (also implied by an all-zero-area `r`) |
| `t` | string? | the selected text, whitespace-normalised; full when ≤ 400 chars, else the **first 200** |
| `tt` | string? | the **last 200** chars — present only when `t` is truncated |
| `tp` | string? | up to 16 chars immediately **before** the selection (short selections only) |
| `ts` | string? | up to 16 chars immediately **after** the selection (short selections only) |

### Text-fallback fields, by selection length

The rectangles are the primary locator. The text fields exist so a future
resolver can recover the selection in a *different copy* of the document
(re-OCR'd, re-downloaded), where coordinates no longer apply:

| selection | fields | recovery strategy |
|-----------|--------|-------------------|
| short (< 60 chars) | `t` + `tp`/`ts` | `t` may occur many times ("Figure 3"); the context picks the right occurrence — the `TextQuoteSelector` idea |
| medium (60–400) | `t` | a quote this long is unique; the span is `start + t.length` |
| long (> 400) | `t` (head 200) + `tt` (tail 200) | find the head → start; find the tail at/after it → **exact** end = tail match + 200 |

Both context fields are advisory: a resolver should treat them as
tie-breakers, never as requirements.

## Consuming these links

With Weavero installed, `ZoteroPane.loadURI` is wrapped so links arriving from
outside Zotero (the OS protocol handler) are intercepted before Zotero's own
parser drops the unknown parameter. The document is opened via the native
`page=`, then Weavero waits for the target page to render, scrolls the target
to one quarter from the top (the same landing rule as outline and bookmark
navigation), and either flashes the rect highlight (text) or shows the 📌
marker for ~2.2 s (pin).

Diagnostics for a misbehaving link are recorded automatically in a capped ring:
`Zotero._wvLinkLog.join("\n")` in the Run JavaScript window.

## Versioning policy

- The decoder stays tolerant of every shape it has ever accepted (including
  pre-`v` pin links detected by rect degeneracy) and ignores unknown keys.
- If Zotero ever defines a native position parameter for `zotero://open`,
  Weavero will switch to emitting it (keeping `wvpos` alongside during a
  transition) and keep reading `wvpos` indefinitely.
