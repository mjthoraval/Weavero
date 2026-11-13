# Weavero for plugin developers

Weavero offers a small API to other Zotero plugins: `Zotero.Weavero.api`.
Use it to open links the way Weavero does (a Zotero link at the right item,
page, annotation or note, in the window that already shows it; a web or app
link under the user's Weavero settings), to draw links in Weavero's colours,
and to read and write Weavero's links. Your plugin keeps working without
Weavero: every call has a plain fallback, shown below.

This page is the contract. Anything not listed here (`Zotero.Weavero.plugin`
and its methods, Weavero's CSS classes) is internal and may change in any
release.

## Finding the API

Look it up when you need it, never once at startup: plugins start in any
order, and Weavero can be updated, disabled or enabled while yours runs.

```js
function weavero() {
    let api = Zotero.Weavero && Zotero.Weavero.api;
    return api && api.apiVersion >= 1 && api.isReady() ? api : null;
}
```

## Version 1

| Entry | Returns | What it does |
|---|---|---|
| `apiVersion` | number | `1`. Raised only by a change that breaks a caller; new entries do not raise it. |
| `version` | string | Weavero's own version, e.g. `"1.0.5"`. |
| `entries` | object | Each call below and its own version, e.g. `{ openLink: 2, ... }`. A call's version rises whenever what it does changes; a change that breaks its callers also raises `apiVersion`. Check `entries.openLink >= 2` before counting on what version 2 added. |
| `isReady()` | boolean | Weavero is running. |
| `canOpenLink(uri)` | boolean | Weavero opens this link itself: a `zotero://select`, `zotero://open`, `zotero://open-pdf` or `zotero://note` link. |
| `openLink(uri)` | Promise of a boolean | Opens the link as a click in Weavero does. `true`: Weavero took it (and reports a missing target itself). `false`: open it your own way. Version 2: web and app links too, see [Opening a link](#opening-a-link). |
| `linkKind(uri)` | `"zotero"`, `"http"` or `"app"` | Which of Weavero's three link colours the link takes: Zotero links, web links (a schemeless `www.` link included), any other scheme. |
| `linkColors()` | `{ enabled, light, dark }` | Weavero's colours as `#rrggbb`, `light` and `dark` each `{ http, zotero, app }`. `enabled` is false when the user turned off Weavero's colours for other plugins' links, or Weavero is not running. |
| `parseLink(url)` | object or `null` | Reads a Zotero link into plain data. See [Reading and writing Zotero links](#reading-and-writing-zotero-links). |
| `buildLink(args)` | `{ ok, url }` | Writes one of Weavero's links to an item. See [Reading and writing Zotero links](#reading-and-writing-zotero-links). |
| `getReaderSidebarView({ readerTabId })` | string or `null` | Which view a reader tab's sidebar shows, Weavero's included. See [The reader sidebar's view](#the-reader-sidebars-view). |
| `declareCommentRenderer({ pluginId, surfaces })` | Promise of `{ ok, surfaces }` | Your plugin draws annotation comments itself on these surfaces: Weavero stops drawing its own there. See [Drawing annotation comments yourself](#drawing-annotation-comments-yourself). |
| `withdrawCommentRenderer({ pluginId })` | `{ ok }` | Gives those surfaces back to Weavero. |
| `getBacklinks({ item, scope, limit })` | Promise of `{ ok, total, truncated, backlinks }` | What links an item: Zotero links, note citations and quoted annotations. See [Links and backlinks](#links-and-backlinks). |
| `getLinksFrom({ item, scope, limit })` | Promise of `{ ok, total, truncated, links }` | What an item's notes and annotations link, broken links included. See [Links and backlinks](#links-and-backlinks). |

Every entry takes and returns plain data (strings, numbers, booleans, plain
objects), never throws, and answers `false` / the fallback when Weavero is
shutting down. The object is frozen.

### Items and errors

An item is named `{ groupID, key }`: the id of its group library (`null` for
My Library) and its item key. That is the same on every computer, where a
`libraryID` is not.

A call that can fail for more than one reason answers `{ ok: true, ... }`, or
`{ ok: false, error }` with one of these codes:

| `error` | Meaning |
|---|---|
| `"bad-arguments"` | An argument is missing or of the wrong kind. |
| `"not-running"` | Weavero is not running (shutting down, disabled). |
| `"no-such-group"` | No group library with that `groupID` in this profile. |
| `"no-such-item"` | No item with that key in that library. |
| `"not-loaded"` | That group library's items are not loaded yet (shortly after Zotero starts): try again later. |
| `"no-such-annotation"`, `"no-such-collection"`, `"no-such-heading"` | The annotation, collection or note heading the call names is not there. |
| `"not-a-note"` | The call needs a note. |
| `"no-link"` | Weavero writes no such link for this item (an open link for an item with nothing to open). |
| `"unknown-plugin"`, `"inactive-plugin"` | No plugin with that id is installed, or it is disabled. |
| `"failed"` | Something went wrong inside Weavero (it is in Zotero's debug output). |

### Opening a link

```js
async function openLink(url) {
    let api = weavero();
    if (api && await api.openLink(url)) return;
    Zotero.launchURL(url);
}
```

That one call covers every link your plugin shows:

- A `zotero://select`, `open`, `open-pdf` or `note` link: Weavero opens it at
  the item, page, annotation or note (`canOpenLink(url)` answers which; the
  same in versions 1 and 2). Any other `zotero://` link: `false`.
- Since version 2, a web link (`https://`, `http://`, a schemeless `www.`)
  or an app link (`mailto:`, `obsidian://`, ...): Weavero opens it when it
  would draw it as a link itself, that is when the user has Links &
  Relations on and that kind of link turned on in Weavero's settings (web
  links on by default; app links off by default, then each scheme by its
  own switch). An app link then opens without Firefox's confirmation if the
  user asked for that in Weavero. Otherwise `false`, and `Zotero.launchURL`
  does what Zotero does. `javascript:`, `data:`, `chrome:` and `resource:`
  are never opened.

Where `entries.openLink` is 1 (Weavero's development builds before version
2), a web or app link answers `false`: the same code works with both.

### Link colours

Weavero sets three CSS variables on the root of every document it styles
links in (the main window, the reader's documents, note editors), switched
with the theme:

```css
.my-preview a[href^="zotero://"] { color: var(--wv-link-zotero, LinkText); }
.my-preview a[href^="http"]      { color: var(--wv-link-http, LinkText); }
.my-preview a:not([href^="zotero://"]):not([href^="http"]) { color: var(--wv-link-app, LinkText); }
```

Apply them only while `linkColors().enabled` is true, and fall back to
`LinkText`. To follow the user's setting live, observe the preference
`extensions.zotero.weavero.recolorAmLinks`
(`Zotero.Prefs.registerObserver("weavero.recolorAmLinks", fn)`), then ask
`linkColors()` again.

### Reading and writing Zotero links

`parseLink` reads a link the way Weavero's own Links and Backlinks do, and
`buildLink` writes a link exactly as Weavero's "Copy ... Link" menu entries
do. Use them instead of your own pattern, and your plugin reads Weavero's
links (an annotation link, a link scoped to a collection, a link to a note
heading) and writes links Weavero opens.

```js
let link = api.parseLink("zotero://open/library/items/ABCD2345?page=3&annotation=EFGH6789");
// { kind: "open", action: "open", groupID: null, keys: ["ABCD2345"],
//   annotationKey: "EFGH6789", page: "3",
//   collectionKey: null, searchKey: null, heading: null }

let r = api.buildLink({ item: { groupID: null, key: "ABCD2345" }, form: "select" });
// { ok: true, url: "zotero://select/library/items/ABCD2345" }
```

**`parseLink(url)`** (version 1) answers an object, or `null` when `url` is
not one of the links below. Every field is present, `null` where the link
has none:

| Field | What it holds |
|---|---|
| `kind` | `"select"`, `"open"`, `"open-pdf"`, `"note"`; `"collection"` or `"search"` for a link to a collection or saved search; `"heading"` for a link to a heading in a note. |
| `action` | The `zotero://` action itself: `"select"`, `"open"`, `"open-pdf"` or `"note"` (a heading link is a select or a note link). |
| `groupID` | The group library's id; `null` for My Library. |
| `keys` | The item keys: one, several for `?itemKey=K1,K2`, none for a collection or search link. |
| `annotationKey` | An open link's `?annotation=`. |
| `page` | `?page=` as written (Zotero reads it as a page number, 1 for the first page). |
| `collectionKey` | A collection link's collection, or the collection a select link is scoped to (`.../collections/C/items/K`). |
| `searchKey` | The same for a saved search. |
| `heading` | The note heading's id (`?wvheading=`). |

The links it reads: `zotero://select/library/items/K`,
`zotero://select/groups/G/items/K`, `.../items?itemKey=K1,K2`,
`.../collections/C/items/K`, `.../collections/C`, `.../searches/S`,
`zotero://open/.../items/K[?page=N][&annotation=A]`, the same with
`open-pdf`, Better Notes' `zotero://note/u/K/` and `zotero://note/G/K/`
(also `note/g/G/K`, `note/groups/G/K`; its `?line=` is ignored), and a
heading link (`?wvheading=` on a select or a note link). The scheme and
action may be in any case; keys are Zotero's 8-character keys. The legacy
forms `<libraryID>_<key>` (ZotFile's `zotero://open-pdf/1_K/5`) and a
numeric item id (`zotero://select/items/123`) are resolved in this profile.

**`buildLink({ item, form, annotationKey, collectionKey, heading })`**
(version 1) answers `{ ok: true, url }`, or `{ ok: false, url: null, error }`.

| `form` | The link | Options |
|---|---|---|
| `"select"` | `zotero://select/library/items/K`: selects the item, with or without any plugin. | `collectionKey`: scope it to that collection (Zotero opens the collection first). |
| `"open"` | `zotero://open/...`: a file attachment opens; an annotation opens its file at the annotation (or pass the attachment and `annotationKey`); a regular item's own key (Weavero opens what a double-click opens; Zotero alone ignores this form); a note gets the `"note"` form. `"no-link"` when there is nothing to open. | `annotationKey`: an annotation of `item`, an attachment. |
| `"note"` | `zotero://note/u/K/` (`zotero://note/G/K/` in a group): opens the note in a tab, with Weavero or Better Notes. | `heading`: open at that heading. |
| `"heading"` | `zotero://select/.../items/K?wvheading=ID`: selects the note (Zotero alone), and scrolls to the heading with Weavero. | `heading` (required): the heading's `id` in the note's HTML (Weavero gives a heading one when the user copies a link to it). |

An option that does not belong to the form is a `"bad-arguments"`.

### The reader sidebar's view

Zotero has no API for the reader sidebar's tabs, and Weavero adds to them: a
Bookmarks tab, and its own outline in place of Zotero's Outline tab (the
user can turn that off). A plugin that draws into the sidebar can ask which
view is showing before it draws, rather than stacking its panel on
Weavero's or drawing into an outline Weavero has hidden.

```js
// In a reader event handler, or for the selected tab:
let view = api.getReaderSidebarView({ readerTabId: reader.tabID });
if (view === "outline") {
    // Zotero's own outline is showing: draw beside it.
}
```

**`getReaderSidebarView({ readerTabId })`** (version 1) answers the view
the reader's sidebar has selected, whether the sidebar is open or folded
(Zotero keeps that apart):

| Answer | The view |
|---|---|
| `"annotations"`, `"outline"`, `"thumbnails"` | Zotero's own (a view a later Zotero adds comes by its own name). |
| `"weavero-outline"` | The Outline tab, showing Weavero's outline instead of Zotero's. |
| `"weavero-bookmarks"` | Weavero's Bookmarks tab. |
| `null` | No reader with that tab id, or bad arguments. |

It takes the reader's tab id, `reader.tabID` in every reader event and
`Zotero_Tabs.selectedID` for the selected tab: an item can be open in several
readers at once. A reader in a window of its own (no tab) has none. It only
reads: it never switches the view.

### Drawing annotation comments yourself

Weavero draws an annotation comment's Markdown and links in three places:
the reader sidebar's annotation cards, the annotation popup in the PDF, and
the annotation rows of the item pane. If your plugin draws comments there
too, the user sees every comment twice. Tell Weavero which surfaces are
yours, and it stops drawing its own there:

```js
async function startup({ id }) {
    // ...
    let api = Zotero.Weavero && Zotero.Weavero.api;
    if (api && api.entries.declareCommentRenderer) {
        await api.declareCommentRenderer({ pluginId: id, surfaces: ["sidebar", "popup", "itemPane"] });
    }
}
```

**`declareCommentRenderer({ pluginId, surfaces })`** (version 1) resolves
`{ ok: true, surfaces }` (the surfaces, sorted), or `{ ok: false, error }`.
`pluginId` is your plugin's id (`startup({ id })` gives it to you); it must
be installed and active (`"unknown-plugin"`, `"inactive-plugin"`).
`surfaces` holds one or more of:

| Surface | Where |
|---|---|
| `"sidebar"` | The reader sidebar's annotation cards. |
| `"popup"` | The annotation popup in the PDF (the sidebar closed). |
| `"itemPane"` | The annotation rows of the item pane (an attachment's annotations, in the library and beside the reader). |

While the declaration stands, on each declared surface:

- Weavero draws no preview: Zotero's own comment element is left as Zotero
  has it, for your plugin to draw. A comment Weavero had already drawn gets
  Zotero's text back at once.
- Weavero never touches your plugin's elements. Its link colours and
  `openLink` are yours to use there ([Link colours](#link-colours),
  [Opening a link](#opening-a-link)).
- Weavero's own buttons on an annotation (the comment's link list, Related,
  Links, Backlinks) stay, and so does everything Weavero draws elsewhere (the
  items list, notes).

A second call replaces the first: declare `["popup"]` alone and the other
two surfaces are Weavero's again.

**`withdrawCommentRenderer({ pluginId })`** (version 1) gives the surfaces
back; Weavero draws its previews again at once. It answers `{ ok: true }`,
also when there was nothing to withdraw.

A declaration is held in memory only, never saved, and never outlives your
plugin: Weavero drops it when your plugin is disabled, uninstalled or
updated (the updated version's `startup` declares again). It is also gone
when Weavero itself restarts (an update, a disable and enable): declare from
your `startup`, and again when `Zotero.Weavero.api` is not the object you
declared through, or simply each time your renderer starts on a reader;
a repeated declaration costs next to nothing.

Annotation Markdown is the exception that needs no declaration: Weavero
already recognises it, stays off the cards it draws, and adds the links and
colours its preview lacks. If Annotation Markdown declares, it takes over
those surfaces completely, like any other plugin.

### Links and backlinks

Weavero keeps an index of the references between items: every `zotero://`
link written in a note or an annotation comment, every citation in a note,
every annotation quoted in a note. Its Links and Backlinks sections and
columns show it. Read it instead of scanning the database yourself:

```js
let r = await api.getBacklinks({ item: { groupID: null, key: "ABCD2345" } });
if (r.ok) {
    for (let b of r.backlinks) {
        // b.source: the note or annotation the reference is written in
        // b.ref: "link", "citation" or "quote"; b.excerpt: the words around it
    }
}
```

**`getBacklinks({ item, scope, limit })`** (version 1) resolves
`{ ok: true, total, truncated, backlinks }`, or
`{ ok: false, error, backlinks: [] }`. Each row:

| Field | What it holds |
|---|---|
| `source` | `{ groupID, key }` of the note or annotation the reference is written in. |
| `sourceKind` | `"standaloneNote"`, `"itemNote"` or `"annotation"`. |
| `target` | `{ groupID, key }` of what it points at: `item` itself, or with `scope: "subtree"` one of its attachments, notes or annotations. |
| `ref` | `"link"` (a `zotero://` link), `"citation"` (a Zotero citation in a note), `"quote"` (an annotation added to a note). |
| `url` | A link as written; a citation's cited-item URI (`http://zotero.org/...`); `null` for a quote. |
| `page` | A link's `?page=`, or `null`. |
| `locator` | A citation's locator (its page), or `null`. |
| `excerpt` | `{ before, match, after }`: the words around the reference as the source reads, `match` the reference itself (a link's label, a citation's text). |
| `internal` | `true` when both ends are in the same item (a child note linking its own paper's PDF). |

`scope`: `"subtree"` (the default) also lists what points at the item's
attachments, notes and annotations, as Weavero's Backlinks column counts;
`"own"` only what points at the item itself.

**`getLinksFrom({ item, scope, limit })`** (version 1) resolves
`{ ok: true, total, truncated, links }`, or `{ ok: false, error, links: [] }`:
the references written in a note or an annotation, in the order of its
text; for a regular item or an attachment (`scope: "subtree"`, the default),
those written in its notes and its annotations, each with its `source`.
`scope: "own"` lists only what the item itself holds (nothing for a paper or
an attachment). Each row has `source`, `sourceKind`, `ref`, `url`, `page`,
`locator` and `internal` as above, and:

| Field | What it holds |
|---|---|
| `target` | `{ groupID, key }` of what it points at, or `null` when it is broken. |
| `broken` | `true` when nothing in this profile answers it. |
| `why` | `"missing"` (no item has that key: deleted, or never synced here) or `"library"` (its group library is not in this profile); `null` when not broken. |

Both answer at most `limit` rows (default 200, at most 1000) in the index's
order; `total` counts them all and `truncated` says whether rows were left
out. Both are asynchronous: the index is built the first time anything
asks (two database scans; a moment on a large library), and it follows
edits through Zotero's notifier, so a note saved a moment ago may not be in
it yet. They work whether or not the user shows Weavero's Links and
Backlinks sections.

## Plugins already using it

- [Annotation Markdown](https://github.com/qrkks/zotero-annotation-markdown)
  and [Rich Annotation](https://github.com/lxx006/zotero-rich-annotation)
  hand `zotero://` clicks in their previews to Weavero and draw their links
  in its colours. They call `Zotero.Weavero.plugin.handleZoteroURI(url)`,
  the route that existed before this API. That call stays supported (a test
  locks it), but new code should use `api.openLink`.

## What comes next

Zotero is preparing a channel for plugins to call each other
([zotero#6080](https://github.com/zotero/zotero/pull/6080), not merged),
which a sandboxed plugin will need: it cannot see `Zotero.Weavero`. Every
call here already takes and returns plain data and has its own version, as
that channel requires, so Weavero will offer the same calls there, with the
same versions, once it lands. Through the channel every call answers
asynchronously. Under it Zotero clears a plugin's code soon after the
plugin stops, so an `api` object kept across a Weavero update stops
working: look it up on each call, as [Finding the API](#finding-the-api)
does.

Missing something your plugin needs from Weavero? Open an issue at
[github.com/mjthoraval/Weavero](https://github.com/mjthoraval/Weavero/issues).
