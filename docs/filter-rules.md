# How the Weavero filter decides what to show

The complete rule set, in plain English. Read top to bottom — each section builds on the previous one.

---

## Vocabulary

Three concepts the rest of the document leans on.

### Levels

Every row in the items tree belongs to one of three **levels**:

- **Parent level** — regular items (papers, books, web pages) and standalone notes. The top-level rows you see when you collapse everything.
- **Attachment level** — file attachments (PDFs, EPUBs, images), web-link attachments, AND child notes attached to a regular item (called "item notes"). Anything that sits at depth 1 under a regular item.
- **Annotation level** — annotations sitting under a file attachment.

### Real match vs ancestor-keep

- A row is a **real match** (shown in white) when the filter actively picks it.
- A row is an **ancestor-keep** (shown dimmed) when it isn't itself a match but it has at least one descendant that is — Weavero keeps it visible so the tree path stays intact.

Anything that isn't either of these is hidden.

### Spine

When a chip needs to look "around" a row, it only walks the row's **spine**:

- The row itself.
- Every ancestor of the row (parent, grandparent, …, up to the root of the tree).
- Every descendant of the row (children, grandchildren, …).

Siblings — rows that share an ancestor but sit on a different branch — are **not** in the spine. The chip never sees them.

---

## Rule 1 — Same-level same-category chips OR together

> When you pick several values within one chip (e.g. yellow + red annotation colours), or when two explicitly paired chips at the same level both fire, the row only has to satisfy **one** of them.

Two explicit OR pairs:

- **Parent level**: `Item Type` ↔ `Standalone Note`. A row passes if its item type matches OR it's a standalone note.
- **Attachment level**: `Attachment File Type` ↔ `Item Note`. A row passes if its file type matches OR it's an item note.

> **Example.** Filter set to `Attachment File Type = PDF` + `Item Note = is`.
>
> A PDF attachment is a real match (file type matches). A child note is a real match (it's an item note). Both can coexist in the same parent's tree, and both show in white.

## Rule 2 — Different-level chips AND across the tree

> When chips target different levels in the same group, the tree must contain a row at each targeted level that satisfies its own chip — and those rows must sit on the queried row's **spine**.

Concretely: a yellow annotation row passes `Annotation Colour = yellow` + `Attachment File Type = PDF` only if it sits under a PDF (its parent is a PDF). A yellow annotation under an EPUB doesn't count, even if a sibling attachment is a PDF.

> **Example.** Parent *P* has a PDF (with a yellow annotation) and a Web Link. Filter: `Annotation Colour = yellow` + `File Type = PDF`.
>
> The yellow annotation under the PDF is a real match (PDF parent satisfies file type). The PDF is a real match (its descendant annotation satisfies colour). The Web Link is dropped — it doesn't match file type, and its spine has no yellow annotation.

## Rule 3 — Cross-level chips have a per-kind scope

> Some chips don't pin a kind on their own — `Has Tag`, `Has Related`, `Has Link`, the `Tag`-with-value picker, `Has Annotations`, and `Item Note` (as the structural "tree has an item note" requirement). Each has a small **"Apply to" dropdown** with the three level toggles. The chip can only touch rows whose kind is ticked in its scope.

For each cross-level chip and each row:

- **Out of scope** — the chip relaxes for the row. It neither helps nor hurts.
- **In scope** — the chip is satisfied if the row itself or anything on its spine matches the chip's predicate. Otherwise the chip fails for that row.

> **Example.** Filter: `Has Related = is` with scope all-on.
>
> An annotation passes only when its own spine — itself, its parent attachment, the root regular item — contains a row with related items. A sibling annotation with related items doesn't help.

**Interaction with Rule 1 OR pairs.** When `Item Note` is set together with `Attachment File Type` (the explicit OR pair from Rule 1), the cross-level "tree must have an item note" requirement is dropped — the OR semantics already lets either side satisfy the attachment level. With only `Item Note` set (no OR pair active), the tree-spine requirement applies normally.

## Rule 4 — One row, one filter group

> Within a single filter group, all the chips are AND'd (modulo Rule 1's OR pairs). Filter groups are OR'd at the top level: a row matches the filter if it matches *some* group fully.

## Rule 5 — Real-match kind requirement

> A row only becomes a real match if at least one chip in the group **actively targets** its kind. A row that passes only by the relaxing-for-other-kinds rule isn't a real match — without an active target, the filter has no opinion about it.

This is what keeps the tree from flooding when you set an annotation-only chip: parents pass it (it relaxes for them) but no annotation-level chip targets parents, so parents stay dimmed (ancestor-keep), not white.

**The quick search is the exception.** A row the quick search matched **directly** at its own level — and whose kind is in the search's scope — is a real match (white, Ctrl+A-selectable) even when no chip targets its kind. So with `Item Type = journalArticle` only, plus a quick search, a *standalone note* whose text matched the search is white on its own merit (the search is the only thing targeting the parent level, and it matched). See *The quick search box* below.

---

## The quick search box

The toolbar's quick-search input is just Zotero's normal search. Weavero doesn't re-run it — it sees the items Zotero has already filtered to and combines them with the chip-based filter.

The quick search has its own scope dropdown ("Restrict Quick Search to:") with the same three level toggles. When the search has text:

- A row whose kind is **unchecked** in scope can't become a real match via the search — it's still kept as a dimmed ancestor when one of its descendants matches, so tree shape stays intact. With `parent = false`, parents stop appearing "in white" purely because their title matched the search, but they still serve as containers above matching descendants.
- A row whose kind is **checked** in scope passes the search if the row itself, an ancestor, or a descendant — with kind also in scope — actually matches the search. This is the same vertical-spine rule as Rule 3. Siblings don't count. So:
  - A web link under a parent that matched the search by title passes, as long as parent scope is on (the parent is in the link's spine, in scope, and matched).
  - The same web link fails if parent scope is off (parent in spine but out of scope → doesn't count, and the web link itself didn't match).
  - A web-link sibling of a matched PDF still fails — siblings aren't on each other's spine, regardless of scope.

The "Show Non-Matching Annotations" and "Show Non-Matching Attachments" toggles at the bottom of the popup are independent of the chip logic. They affect what Zotero itself shows under a search-matched container: hide non-matching attachments / annotations under a matched parent (default), or show all of them as context.

## Selection Target — what Ctrl+A picks

Selection Target chooses which row kinds Ctrl+A picks. Rows that aren't in the target are dimmed (greyed out, unselectable). Set it explicitly with the three buttons at the bottom of the popup, or leave it on the smart default:

- No filter on → every kind is in the target.
- Filter on → the target is the union of the kinds each active chip actually targets. Annotation-only chips contribute "annotation". Attachment File Type contributes "attachment". A cross-level chip contributes the kinds inside its scope.

Two extra rules on top of the kind check:

- **Ancestors always dim.** A row kept only because a descendant is a real match is greyed out, even if its kind is in the target. Ctrl+A picks what the filter *describes*, not the tree shape kept for readability.
- **Alt+click** a Selection Target button flips it from include to exclude. With excludes only, the target is "everything except the excluded kinds".

---

## State-level filters and small rules

- **Collections and saved searches** set at the state level apply across every group. A row that fails them is hidden regardless of any per-group logic.
- **Just-created items** stay visible for 10 seconds even if they don't yet match the filter — prevents a brand-new item from disappearing under the cursor as you finish entering it.
- **Containers auto-expand** when a deep descendant is a real match, so the match is always reachable.
- **Item-tree shape is preserved** — ancestors of any real match stay visible (dimmed), so the tree path down to the match is intact.
- **Filtering deselects what no longer matches.** When you change the filter, a selected row that's no longer a **real match** is deselected; if nothing in the new result is a real match, the selection clears entirely — the same way the quick search drops the selection when its target disappears. A dimmed ancestor-keep counts as "not a real match" here, so selecting one and then filtering deselects it.
