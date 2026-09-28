---
paths:
  - "src/prefs.html"
---

# prefs.html rules

It's a native XUL **fragment** (bare `<groupbox>`/`<checkbox>`, `html:`-prefixed
HTML, multiple top-level nodes, ends `</vbox>`) — Zotero parses plugin panes
with `defaultXUL=true`. Not a full document; `ET.parse` won't work.

**Named entities break the pane** (v0.1.87 shipped `&nbsp;` and rendered a
blank prefs pane). Only the five XML predefined entities exist; everything
else is numeric: `&#160;` (nbsp), `&#8212;` (em-dash), etc.

**One search block per setting.** Zotero's Settings search hides each direct
child of `.main-section` that has no match, so a new setting goes in its own
`<vbox class="wv-block">` — never appended to a neighbour's block — with
`data-gated-by` listing every master pref it depends on (space-separated) and
`data-wv-in` listing every enclosing header key (`data-wv-head`), so its
section header stays visible when it matches (MJT 2026-09-28: a "firefox"
search showed three whole sections).

## After every edit

```bash
python -c 'from xml.etree import ElementTree as ET; c=open("src/prefs.html",encoding="utf-8").read(); ET.fromstring("<box xmlns=\"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul\" xmlns:html=\"http://www.w3.org/1999/xhtml\">"+c+"</box>")'
```

Well-formed or it doesn't ship.
