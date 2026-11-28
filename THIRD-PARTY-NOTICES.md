# Third-party notices

Weavero is AGPL-3.0 (see `LICENSE`). It additionally includes the
third-party material listed below, reproduced here with the notices
those licences require.

---

## Reference Checker — the reference matcher

The matching of a reference to the items of your libraries ("References in
your library") follows the method of
[Reference Checker](https://github.com/najibprog/zotero-reference-checker)
1.3.3 (`content/refcheck.js`: `_buildIndex`, `compact`, `cleanDOI`,
`matchText`): an exact DOI from the item's DOI field, Extra `DOI:` line or URL;
then the longest library title contained in the reference's compacted text, a
short title only with the first author's surname. The code is Weavero's own,
with additions of its own (an index of title heads, a volume / first-page key,
an approximate title, a self-match guard).

Source in Weavero: `src/lib/ref-match.ts`.

> MIT License
>
> Copyright (c) 2026 najibprog
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

---

## Zotero Feed Sort — sorting in feeds

Sorting Zotero's feeds by a column follows the override of
[Zotero Feed Sort](https://github.com/OssifiedSardine/zotero-feed-sort)
(`bootstrap.js`): `CollectionTreeRow.prototype.isSortable` true for feeds, the
items view's `getSortField` / `getSortDirection` answering the sorted column in
a feed view, and a column-settings entry made before a header click so that
Zotero keeps the chosen sort. The code is Weavero's own (layered wraps given
back on disable, Relevance as the default sort).

Source in Weavero: `src/modules/feeds.ts`.

> MIT License
>
> Copyright (c) 2026 Sebastian Sherrah
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

---

## ProseMirror — the note editor's link decorations

The script Weavero runs in Zotero's note editor (`addon/note-editor-inject.js`,
built from `src/note-editor-inject.ts`) bundles
[ProseMirror](https://prosemirror.net/)'s `prosemirror-view`,
`prosemirror-state` and `prosemirror-model`, pinned to the versions Zotero's
note editor uses, with `prosemirror-transform` and `orderedmap` that they
depend on. Each package carries the licence below (`orderedmap`: Copyright (C)
2016 by Marijn Haverbeke and others).

> Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.

---

## Bootstrap Icons — `pin-angle-fill`

The in-document position-bookmark marker uses the `pin-angle-fill` glyph
from [Bootstrap Icons](https://github.com/twbs/icons). The path data is
copied verbatim; only the viewBox is re-framed, so that the needle tip
lands on the anchor point.

Source in Weavero: `src/modules/reader-panels.ts`.

Not covered by this notice: Weavero's bookmark *ribbon* glyph
(`BOOKMARK_PATH` in `src/modules/constants.ts`) is an original drawing,
not derived from Bootstrap Icons.

> The MIT License (MIT)
>
> Copyright (c) 2019-2024 The Bootstrap Authors
>
> Permission is hereby granted, free of charge, to any person obtaining a
> copy of this software and associated documentation files (the
> "Software"), to deal in the Software without restriction, including
> without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to
> the following conditions:
>
> The above copyright notice and this permission notice shall be included
> in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
> OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
> MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
> IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
> CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
> TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
> SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
