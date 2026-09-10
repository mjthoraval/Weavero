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
- XUL `popupshowing`/`popuphidden` BUBBLE: every handler on a menu that can
  contain a submenu (native Move To / Copy To, Weavero's own Copy As / Add
  Bookmark) early-returns unless `ev.target === menu`, and a cleanup
  listener is never `{once: true}` on such a menu (a bubbled submenu close
  consumes it). Otherwise a submenu closing on cursor-move strips the
  injected entries — or removes the whole open menu — mid-hover (issue #8,
  fixed v0.11.4 in pane.ts only; every entry added since without the guard
  regressed it, swept 2026-09-03). Guard: test/menu-bubble-guard.spec.js.
- TIMER HOSTS are closures over windows too: a `win.setTimeout` chain dies
  silently when `win` closes, and a lifecycle flag it was due to clear
  sticks forever (bg-restore teardown, 2026-09-01 — every later window
  open got fought). Long-lived tick loops re-resolve a live window per
  schedule (global setTimeout fallback), never bind the host once.
- Wraps installed on LONG-LIVED Zotero objects (itemsView, rowProvider,
  windows) stamp themselves with `this._wvWireTag()` — build version PLUS a
  per-instance nonce — never a boolean and never a hand-bumped constant. A
  foreign stamp means "wired by another INSTANCE": peel the own-prop wrapper
  with `delete` (wrapped members must have a live prototype fallback) and
  wire fresh. Booleans shipped the hot-upgrade filter death (2026-08-25:
  stamps survived the upgrade, the new instance skipped wiring, the filter
  went silently dead until restart); build-only stamps shipped the SAME
  death on a same-build reload (2026-09-10: install + plugin_reload, the
  new instance found its own build tag and skipped, `setFilter`'s re-apply
  kept running on the dead instance — clearing a quick search dropped the
  chip; every bridge verification after a reload had run on a half-dead
  filter). Guard: `test/wire-stamps.spec.js`.
- Inside a wrapper installed ON a host object (`rp._refresh = async
  function (...) {…}`, `iv.setFilter = …`), `this` is the HOST, not the
  plugin: never call `this._wv…` there — resolve the live plugin
  (`Zotero.Weavero && Zotero.Weavero.plugin`) at call time. A refactor
  that replaced an inline test with `this._wvIsStructuralRow(row)` inside
  the row provider's refresh threw "not a function" on every search
  refresh for six weeks, swallowed by a catch (found 2026-09-10 only
  because a debug-storage run happened to show "cleanup err").
- ONE-SHOT ARMED LISTENERS on content documents (the select-region and
  pin-placement arms) are the same failure family: the listener closures
  survive plugin reloads on the content doc, and a stale arm CONSUMES the
  user's next gesture (2026-08-26: a zombie select-region arm collapsed
  every EPUB selection 13ms after mouseup — "Edit Region does nothing" was
  undiagnosable at the call sites). Every arm stamps a per-reader
  generation (`reader._wv*ArmGen` — `reader` survives reloads) and checks
  generation + live plugin instance on its FIRST event, self-detaching when
  stale. Never arm without both checks.
- INJECTED DOM outlives the build that injected it: on a hot reload the
  OLD build's teardown runs (whatever it knew to remove), then the NEW
  build injects into what is left. An "if it exists, skip" guard on an
  injected `<style>`/box therefore keeps the previous build's rules alive
  (2026-09-09: the Plugins Manager clear-× min-size fix was invisible in
  the open window because dev.20's stylesheet was still there). Injection
  REPLACES what it owns; teardown removes everything it injects; a guard
  spec re-injects after a simulated teardown. Guard:
  `test/plugins-search.spec.js`.
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
