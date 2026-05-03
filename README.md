# Weavero

A Zotero 7+ plugin that turns URLs in annotation comments into clickable links — with rich rendering across the items tree, the right-hand item pane, the reader sidebar, and the in-PDF popup.

Out of the box, `https://`, `http://`, and `zotero://` links are recognised everywhere a comment is shown. Sixteen additional schemes (`mailto:`, `obsidian://`, `vscode://`, `slack://`, `notion://`, …) can be enabled individually from the preferences pane.

## Features

- **Two display modes** (set in preferences):
  - **Inline** — URLs, markdown, and app links render directly inside each comment. When the comment is clipped, an icon opens a popup with the full formatted view.
  - **Icon & Popup** — Comments stay plain text. An icon next to each annotation opens a popup with the formatted view.
- **Renders across the UI** — items list, annotations panel (right pane), reader sidebar, in-document popups, link badges over annotation icons in the reader, and notes (standalone and child). Each surface is independently toggleable.
- **Built-in URL schemes**: `https://`, `http://`, `zotero://`. Sixteen more are toggleable per-scheme:
  - Tier 1 (`name:`): `magnet`, `mailto`, `skype`, `sms`, `spotify`, `tel`.
  - Tier 2 (`name://`): `discord`, `evernote`, `figma`, `file`, `ftp`, `msteams`, `notion`, `obsidian`, `slack`, `vscode`, `zoommtg`.
- **Three colour buckets** so each kind of link reads differently at a glance: blue for `http(s)`, orange for `zotero://`, purple for app-scheme links.
- **Inline markdown** rendering — `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[label](url)` — on by default in Inline mode; toggleable from preferences.
- **Open app links without the confirmation dialog** — optional opt-in that bypasses Firefox's *"Allow this site to open the … link?"* prompt for the schemes you've enabled.
- **Right-click "Copy Link"** on any rendered URL.

## Install

1. Download the latest `weavero-v<version>.xpi` from the [Releases page](https://github.com/mjthoraval/Weavero/releases/latest).
2. In Zotero: `Tools → Plugins → ⚙ → Install Plugin From File…` → pick the XPI.
3. Restart Zotero if prompted.

## Configure

Open `Tools → Plugins → Weavero → Preferences` to enable/disable individual URL schemes and the optional markdown rendering.

## Build

Plugin source is in `src/`. A Zotero plugin is just a zip file with a `.xpi` extension — to build, zip the contents of `src/` (files at the archive root, no `src/` prefix) and name the result `weavero-v<version>.xpi`.

## Compatibility

- Zotero 7.0+ (declared `strict_min_version: 7.0`, `strict_max_version: 10.*`).
- Tested on Zotero 10.0-beta.

## License

[GNU Affero General Public License v3.0](LICENSE) — same license as Zotero itself.
