# The default-attachment problem — history, prior art, and an audit

**The problem.** When a Zotero item has several children — the paper and
its supplement, a preprint and the published version, a PDF and an EPUB —
Zotero decides *by itself* which one a double-click opens, with a fixed rule
and no way to choose otherwise. The rule's preferences (oldest PDF first)
are frequently wrong for exactly the libraries researchers actually have,
and this has been a requested feature for over a decade.
Weavero's [Default attachment](https://github.com/mjthoraval/Weavero#default-attachment)
feature addresses it: you choose which child an item opens — any attachment,
a linked URL, or a note. This page records where the problem comes from,
every public attempt to solve it, and a critical audit of the Actions & Tags
script I shared myself before building the plugin feature. It exists for review:
Weavero is developed with an AI coding agent (Claude), working against a
live Zotero with human judgment on every change — the full methodology is
public at [Developing with AI](developing-with-ai) — and vetting works best
when the reasoning is public too.

## The one rule everything revolves around

This is **Zotero's default behaviour, without any plugin**: what a
double-click opens is decided by a single SQL ordering (`item.js`,
`getBestAttachments` — the singular `getBestAttachment` uses the same
ordering):

```sql
ORDER BY contentType='application/pdf' DESC, value=? DESC, dateAdded ASC
-- value = the attachment's url field, compared to the PARENT item's url
```

Three keys, nothing else: **PDFs first**, then **URL matching the parent**,
then **oldest**. Linked-URL attachments and trashed items are excluded.
Every solution below either manipulates the data those keys read, or wraps
the function that applies them.

## Common questions

**Does it change my items' data — the date, the URL, anything?** No.
Weavero's feature changes **nothing** — not the date, not the URL, not any
field of any item. The pick is an ordinary tag (`▶️ wv-defatt` — its design has its
own question below) on the chosen child, and the plugin redirects Zotero's
best-attachment resolution at open time. Everything is reversible, down to removing the tag itself — see the
stopping-the-feature question below. This
is the deliberate opposite of the script lineage audited below, which achieves
permanence precisely *by* editing the URL and date — the trade-off is
the subject of the rest of this page.

**Does it sync across computers?** Yes. The pick is a tag, and tags travel
through ordinary Zotero sync — no extra service, no plugin-specific sync
channel. Set a default on one computer
and every synced computer running Weavero opens the same child; a computer
without Weavero simply falls back to Zotero's normal rule until the plugin
is installed there. The choice also survives whatever else preserves tags:
group libraries, backup and restore, and exports that carry tags.

**Does it work in the mobile apps?** The tag syncs to every device, but
plugins cannot run in the mobile apps, so the pick is not *acted on* there —
Zotero's normal rule applies on mobile. The only approach that changes
mobile behaviour is the data-editing script route, because it changes what
Zotero's own rule sees. If mobile is your priority, that is the honest
recommendation — with the costs listed in the audit below.

**Why choose a different solution from the one Zotero is building?** Not
by preference — by necessity. The native design ([zotero#3333](https://github.com/zotero/zotero/pull/3333)) stores the pick as
a relation with a new predicate, and Zotero's sync server only accepts
predicates on its allow-list; that server-side change is precisely what the
native feature has been stalled on since 2023. A plugin using the same
relation today would have its picks silently rejected at sync. Of the
stores a plugin *can* use, each alternative fails worse: the Extra field
pollutes visible metadata, hidden notes leak on the web library and iOS,
and local prefs don't sync at all (the weakness of the earlier plugin
approach). An ordinary tag is the one library-native store that syncs
today, needs no server change, stays visible and deletable by hand, and
survives without the plugin.

**Why an emoji tag, and why the cryptic name?** Both halves are doing a
job. The `▶️` emoji is rendered by Zotero directly in the items list next
to the child's title, so a marked child is visible at a glance without
spending one of the nine coloured-tag slots — and the glyph reads as "this
is what opens". The slug `wv-defatt` is deliberately not an English word:
Zotero's quick search matches substrings and splits on spaces, so any
readable name leaks — early candidates made every marked child surface in
ordinary searches for "default" or for notes about the plugin itself.
"defatt" shares no substring with "default", and the single hyphenated
token stays one search condition, so searching it finds exactly the marked
children and nothing else. The cost — a cryptic name in the Tag Selector —
is softened by registering it as an *automatic* tag (hideable there), with
the meaning discoverable where you act: the context menu and the settings.

**What happens when Zotero ships its native Primary Attachment feature?**
Your picks convert; nothing is lost. The native feature will not read
Weavero's tag (it reads its own relation), so the day it ships, Weavero
will honor the native relation, offer a one-pass migration turning every
`▶️ wv-defatt` tag into it — both identify the chosen child by its sync
key, so the mapping is exact, group libraries included — and then step out
of the way. The migration cannot be written sooner because the native
feature's final storage encoding is one of the things still unresolved
upstream; once it ships, the conversion is mechanical.

**What if I stop using the feature — what is left, and how do I clean it
completely?** Turning the feature off in the settings (or removing Weavero)
stops the override immediately; nothing else changes. The only thing ever
left in your library is the `▶️ wv-defatt` tag on the children you chose —
no fields, no relations, no hidden data. To remove even that: in the Tag
Selector, enable *Display Automatic* so the tag shows, right-click it →
*Delete Tag…* — one action removes it from every item in that library, and
sync propagates the deletion to your other computers (repeat per group
library, since tags are per-library). After that, your library is
indistinguishable from one where the feature was never used.

**To what extent is it safe to use?** A fair question for any plugin, and
doubly so for AI-written code, so here is the honest layering:

- *What it can touch.* For this feature: one tag. The plugin never edits
  your items' fields, dates, or files; Weavero's other features keep their
  state in their own JSON files inside the Zotero data directory, out of
  your library data.
- *What happens if it breaks.* Every hook is wrapped in defensive error
  handling, so a Weavero bug degrades to Zotero's normal behaviour rather
  than breaking Zotero.
- *How it is checked.* The upstream behaviour is read from Zotero's
  source, not assumed (the SQL above); features are audited edge case by
  edge case — this page is such an audit, published — and the resulting
  contracts (trash, merge, reparent, read-only libraries,
  plural-vs-singular resolution, cache invalidation, …) are locked into an
  automated test suite (177 tests at the time of writing) that runs before
  every release: see
  [TESTING.md](https://github.com/mjthoraval/Weavero/blob/main/TESTING.md).
- *What remains true anyway.* It is one researcher's plugin in active
  development: bugs exist, get reported on the
  [issue tracker](https://github.com/mjthoraval/Weavero/issues), and get
  fixed. Zotero's own backup practices apply, as with any plugin.

The code is open source (AGPL-3.0); the development methodology is
documented in detail at [Developing with AI](developing-with-ai).

**Where is the code for this feature?** One module:
[`src/modules/attachments.ts`](https://github.com/mjthoraval/Weavero/blob/main/src/modules/attachments.ts)
— the marker tag, the resolution wraps, the reparent guard, the hoist and
the ▷ marker, with the design invariants documented in its header comment.
Its regression tests are
[`test/default-attachment.spec.js`](https://github.com/mjthoraval/Weavero/blob/main/test/default-attachment.spec.js).

## Chronology of the problem and its solutions

| When | What | Mechanism |
|---|---|---|
| ~2011 | Zotero forum asks ("how to set default PDF…") | — |
| 2013‑07 | [zotero/zotero#355](https://github.com/zotero/zotero/issues/355) "Allow setting default item attachment", opened by aurimasv (then a Zotero developer, "getting burned by this myself") | — |
| 2019‑07 | [zotero/zotero#1715](https://github.com/zotero/zotero/issues/1715) "Add ability to set primary attachment for an item" — opened by the lead developer himself | — |
| 2020–2023 | #355 accumulates the canonical use case: an arXiv preprint saved first keeps opening after the published PDF is attached, because the heuristic prefers the oldest PDF. Also floated there (2022, never built): drag-to-reorder attachments with "top one opens". | — |
| 2023‑03 | [sharpevo/zotero-pdfkit](https://github.com/sharpevo/zotero-pdfkit) — earliest plugin workaround, cited in #355 as "a temporary solution" | plugin |
| 2023‑08 | [zotero/zotero#3333](https://github.com/zotero/zotero/pull/3333) "option to set primary attachment" (fixes #355 and #1715): a relation on the parent item (`zotero:primaryAttachment` → attachment key). Approved in 2024 but stalled: the sync server must allow-list the new predicate, and the key-vs-URI encoding is unresolved. | relation on parent |
| 2025‑01 | [crnkv's Action Scripts Collection](https://github.com/crnkv/Zotero-Action-Scripts-Collection) — first-generation Actions & Tags script ("Set This as Default PDF") | data-level |
| 2026‑03‑24 | My own bug report, ["Newly added attachment PDF is set as Primary attachment"](https://forums.zotero.org/discussion/comment/510305): a connector-imported PDF steals primacy because its URL matches the parent's. The instability that motivated the script below — the same mechanism, encountered as a bug before being used as a tool. | — |
| 2026‑04‑01 | [ErraticPattern's improved script](https://forums.zotero.org/discussion/comment/510211/#Comment_510211) (forum): refines crnkv's; also clears the URL from sibling PDFs (demotion) plus backdating | data-level |
| 2026‑04‑02 | My Actions & Tags script ["Set Primary PDF Attachment"](https://github.com/windingwind/zotero-actions-tags/discussions/602) v1.0→v1.1, derived from the three above; handles locally-added PDFs without URLs. Audited below. | data-level |
| 2026‑04‑28 | [PikaPei's Default Attachment plugin](https://github.com/PikaPei/zotero-default-attachment) v1.0.0 | plugin; local pref keyed by numeric itemIDs |
| 2026‑07→08 | Weavero's feature: a synced automatic tag (`▶️ wv-defatt`) on the chosen child plus an open-time wrap of `getBestAttachment(s)`; edge-case audits 2026‑08‑04; reparent guard, first-row hoist and the ▷ automatic-choice marker 2026‑08‑05/06, several semantics adopted from #3333's review | synced tag + resolution wrap |

Completeness: a GitHub sweep found no default/primary-attachment plugins
beyond zotero-pdfkit and PikaPei's; the script lineage
(crnkv → ErraticPattern → mine) and the two upstream issues are, to my
knowledge, the complete set of public attempts. Corrections welcome.

## Audit of my own Actions & Tags script (2026‑08‑06)

The script ([discussion #602](https://github.com/windingwind/zotero-actions-tags/discussions/602))
works by *exploiting* the SQL above rather than overriding it: it rewrites
the chosen attachment's URL to match the parent's (the second sort key) and,
when needed, backdates its Date Added past its siblings' (the third). This
audit re-checks v1.1 against the upstream SQL and the live runtime; the
fixable findings are corrected in **v1.2** (in the same discussion) —
date changes now record the original Date Added as a tag, the URL model
matches the SQL exactly, empty parent URLs are handled explicitly, read-only
libraries are detected up front, and sibling demotion is available as an
option. The structural limitations remain — inherent to the mechanism, and
the reason the plugin feature exists (see below).

### Strengths

- **Correct core model.** The PDF / URL-match / oldest tiering matches the
  real SQL's three sort keys (one over-refinement — see limitations).
- **Total coverage, zero runtime.** Because it edits the data the heuristic
  reads, every surface on every device honors the result forever — plugin or
  no plugin, including the mobile apps. No wrapper-based approach (including
  Weavero's) matches that.
- **Minimal-change discipline** (the v1.1 rework): URL and date changes are
  computed separately and only applied when needed; exact no-op when the
  target is already primary.
- **URL provenance preserved:** a replaced URL is kept as a Web Link child
  (correctly invisible to the heuristic) plus audit tags and title suffixes.
- **Date Modified discipline:** every save passes `skipDateModifiedUpdate`.
- **Sync-consistent:** url and dateAdded sync, so the outcome is identical
  on every device.
- **Honest self-documentation** of the mechanism's main debuggability trap
  (an added URL is invisible on imported-file attachments).

### Limitations

- **The contentType ceiling (structural).** The top sort key is unforgeable
  without changing `contentType`: no URL or date manipulation can ever make
  an EPUB, snapshot, or note open while any PDF exists. The script's
  PDF-only gate honestly reflects a hard limit of the whole approach.
- **Date changes have no provenance (the sharpest finding).** URL edits are
  carefully preserved; `dateAdded` edits are recorded nowhere — no tag, no
  stored original. The date-only path mutates silently and irreversibly; the
  true acquisition date is destroyed.
- **The date ratchet.** Each set writes (earliest sibling − 1 s); toggling
  primacy between two PDFs walks dates unboundedly into the past, and any
  Date Added sort is progressively falsified.
- **No recorded intent, so no stickiness.** A later-added PDF whose URL
  happens to match the parent (a connector re-save — exactly my own March
  bug report) silently steals primacy, and nothing can detect or restore
  the user's earlier choice.
- **Rivals are never demoted.** A sibling already carrying the parent's URL
  keeps it; two matching attachments then differ only by date, and an
  innocent later date edit flips the winner. (ErraticPattern's variant took
  the opposite stance and clears sibling URLs — more mutation, less
  ambiguity; the two scripts bracket that trade-off.)
- **Web Link accumulation:** repeated re-picking creates one preserved-URL
  child per replacement; nothing dedups.
- **No unset:** there is no way back to "no preference" — the mutation *is*
  the state.
- **No editability guard:** in a read-only group library the save throws
  with no catch.
- **Multi-select:** run over several siblings of one parent, each "wins" in
  turn; the last sticks and the date ratchet fires repeatedly.
- **Phantom URL tier (real model defect, benign outcome).** The script
  distinguishes "has a non-matching URL" from "no URL"; the SQL knows only
  match vs non-match. A URL-less target competing against a URL-bearing
  non-matching sibling therefore triggers an unnecessary URL rewrite where
  only the date decides natively.
- Verified non-issues: the unusual `new Date("YYYY-MM-DD HH:MM:SSZ")`
  parsing works correctly on Zotero's runtime (checked live); empty parent
  URLs land on the right outcome, though by accident of the model rather
  than by design.

### The audit's lesson, and the design it led to

The script's mitigations all target the URL half (preserved Web Links,
audit tags, minimal-change); the date half received none. That asymmetry is
the audit's core lesson, and the reason Weavero's feature chose the
opposite trade: a marker instead of a mutation. Exactly one child per item
is ever marked; reparenting or merging clears a pick that no longer
applies. What each side gives up is symmetrical — the script's edits are
honored everywhere forever but falsify data; the tag touches nothing but
needs the plugin present to act. The pending native feature (#3333) would
eventually make every approach on this page unnecessary.
