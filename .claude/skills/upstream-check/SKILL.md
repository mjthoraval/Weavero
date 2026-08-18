---
name: upstream-check
description: Review a new Zotero beta or upstream change for Weavero impact. Use when the user installs a new Zotero version or asks what changed upstream.
---

# Upstream change review

## 1. Establish the delta

- Installed version + commit: `Zotero.version` / the beta's `+<sha>` suffix.
- Refresh the shared mirrors if stale (`bash your local upstream mirror refresh script`;
  check its last-refresh stamp first — don't refresh reflexively).
- `git log` the mirror (or `gh api repos/zotero/zotero/compare/...`) between
  the previous and new commit. Reader changes: also diff the reader submodule
  pointer and list its commits.

## 2. Triage each commit for Weavero collisions

Walk the high-risk surfaces (each has bitten before):

- itemTree / collectionTree APIs (plural-vs-singular getters THROW on v10),
- row provider / filter interaction (#5658 advanced-search-in-main, #5954),
- reader internals (annotation manager, view setAnnotations, sidebar),
- tabs/session machinery, item pane rendering.

## 3. Check the registers

- The upstream-bugs register — for each entry, evaluate its "Retire when"
  line against the new version; retire workarounds upstream has fixed (a
  stale workaround FIGHTS the native fix).
- The itemTree column-sort patch is a SOURCE patch — re-apply after every
  source pull; check whether upstream finally fixed it.
- Watched threads (zotero-dev posts, unanswered reports) — check for replies.

## 4. Upstream's own test suite (source build only)

Zotero ships 114 Mocha test files (`test/tests/`, runner `test/runtests.sh`
targeting the `app/staging` binary — needs the source build at
a local zotero/zotero clone you have built). Use it, always with `-f`:

- after each source pull + column-sort patch re-apply:
  `test/runtests.sh -f itemTreeTest collectionViewItemTreeTest itemTreeRowTest`
- to disambiguate "upstream regression vs Weavero interaction" when a beta
  changes filter/search/tabs behaviour: run the matching upstream tests on
  the bare build.
- when escalating a bug upstream: a failing upstream test beats prose.

It cannot load Weavero — the plugin's own suites stay the Weavero gates.


## 5. Verify, don't guess

For anything that looks like a collision, verify against the live beta via
the bridge before claiming impact. Report: relevant commits, verified
collisions, retired/kept workarounds, and any action items — with the
distinction between "verified" and "needs live testing" explicit.
