---
paths:
  - "src/**/*.ts"
---

# TypeScript source rules (GitHub/src)

## After every Edit/Write

`npm run typecheck` — 0 errors before anything else happens.
(A Stop-hook safety net also runs it, but don't rely on the net.)

## Naming is namespacing

Everything Weavero adds to shared surfaces is prefixed: `_wv*` methods and
window/DOM expandos, `wv-` DOM ids/classes, `weavero.` prefs (full branch
`extensions.zotero.weavero.*`), `Weavero.*` AUMIDs. Never add an unprefixed
name to a Zotero object, window, or document.

## Structure

- New methods go in the right `modules/*.ts` bundle as
  `function(this: WeaveroPlugin, …)`; they land on the prototype via
  `Object.assign` in index.ts. Accessor pairs need `defineProperties` mixing
  (see the `filterMethods` comment in index.ts).
- Reusable multi-instance widgets follow upstream's `XULElementBase` pattern
  (init()/destroy()/content getter, customElements.define) — not build-by-hand.

## Survival rules (each paid for with a regression)

- Defensive boundaries: `try {} catch (e) {}` at every event/lifecycle
  boundary — a Weavero bug must never break core Zotero. Log via
  `Zotero.debug("[Weavero] …")`, never `console`.
- Persistent listeners resolve the live plugin AT EVENT TIME
  (`Zotero.Weavero && Zotero.Weavero.plugin`) — closures over `this`/`self`
  go stale across reloads. Async-setup continuations: liveness-check after
  every await; callbacks self-neutralize; long-lived per-window wiring uses a
  numeric `_wv*Wired` version stamp + stored handler refs.
- `winOf(node)` from `src/lib/dom.ts`, never `node.ownerGlobal` (renamed in
  FF153/Zotero 11; works on the dev platform, breaks silently later —
  `test/compat.spec.js` enforces this on the bundle).
- Zotero 9 compatibility: plural-first selection APIs with singular fallback
  guarded on the plural's ABSENCE (the singular getters THROW on v10 — an
  `existence-check && call()` passes the check then throws inside).
- CSS `data-item-type` values are camelCase (`attachmentPDF`); kebab-case
  selectors fail silently.
- Chrome XML docs sanitize innerHTML SVG — build via `createElementNS`.
  Icons: viewBox must equal rendered size (1-px strokes blur otherwise);
  copy Zotero artwork verbatim where possible.

## fix: commits name their guard

Every `fix:` commit message states which regression guard now covers the
behaviour ("Guard: test/popups.spec.js", "Guard: live suite greyPairs
census", "Guard: manual-only — docs/taskbar-overlay-testing.md") or the
written exemption. /release audits this; /bugfix Step 6 is where the guard
gets created.

## Style

Match upstream Zotero for upstream-destined code: tabs; `let` over `const`
(const only for true scalar constants); no cuddled braces (`else`/`catch` on
their own line); `--` in comments, not em-dashes; new user-visible strings in
Fluent `.ftl` only. Comments state constraints and hard-won invariants (with
date/incident when non-obvious), never narration of the next line.

## Editing mechanics

Use the native Edit/Write tools. Quote-heavy or backslash-heavy scripted
patches: write the patch script with the Write tool and run `python file.py` —
bash heredocs eat one backslash level and have corrupted source before.
Size-delta sanity after writes: a one-line change never shrinks a file by
hundreds of bytes.

## Inline SVG inherits the container's fill/stroke

`.wv-filter-svg` (and friends) set `fill: currentColor; stroke: currentColor`
so that `<img src="chrome://…">` icons theme correctly. An **inline** SVG
built with `createElementNS` is a different animal: its children INHERIT that
stroke, so a shape declaring only a fill still gets a 1-px outline — 1-px bars
render 2 px and the glyph reads thick. Opt out on the root with
`svg.style.stroke = "none"` (a `stroke` *attribute* loses to the class rule);
children that want a stroke set their own, which still wins.

This is invisible to standalone rasterisation: serialising the same markup to
a data URI and drawing it to a canvas shows it crisp, because the class rule
never applies there. **Verify icons in situ** — `getComputedStyle` on a child
of the rendered node — not on a copy (2026-08-20, three rounds lost to it).
