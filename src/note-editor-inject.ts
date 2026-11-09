// Injected into the note-editor iframe (PAGE compartment) by note-editor.ts.
//
// Adds a ProseMirror DECORATION plugin that renders bare URLs in the note
// editor as clickable/coloured spans WITHOUT modifying the document (display-
// only -- the stored note text is untouched, unlike a link-mark transaction).
//
// Why a separate injected bundle: `Decoration` lives in prosemirror-view, which
// is webpack-bundled inside Zotero's editor and NOT reachable from Weavero's
// chrome compartment (no global, no webpack registry, no live decoration to
// harvest). So -- exactly like Better Notes' editorScript.js -- we bundle a
// version-matched prosemirror-view/-state here and run in the editor's own
// compartment, where `Decoration` is a normal import. Versions are pinned to
// Zotero's (view 1.40.1 / state 1.4.3) so our decorations match its view.
//
// Click + colour are handled Weavero-side: the decoration renders a
// `<span class="wv-note-linkified wv-link-*" data-wv-href="…">`; note-editor.ts
// colours `.wv-note-linkified` via CSS and launches `[data-wv-href]` on click.
import { Decoration, DecorationSet } from "prosemirror-view";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { buildUrlRegex, joinSchemeAlt } from "./lib/links";

(function () {
    const KEY = new PluginKey("wvNoteLinkify");
    // Bumped when this script gains behaviour chrome depends on; chrome
    // re-evals the bundle into an already-injected page when the page's
    // __wvNoteInjectV is older (re-eval is safe: install() dedups via the
    // __wvLinkify / __wvFold spec markers and REPLACES plugins from an older
    // bundle). Chrome reads this number out of the bundle text -- keep the
    // `INJECT_V = <n>` literal greppable.
    // 6: heading folding + the heading API the note outline and heading
    // links use (2026-11-03). 7: caret-to-heading / editor focus for the
    // outline's Enter and Escape keys (2026-11-04). 8: briefly the note's
    // undo / redo for the outline; dropped the same day (the outline does
    // not edit), the number kept so no page runs an older bundle as newer.
    // 9: the heading flash (outline click, heading link) as a decoration.
    // 10: the fold arrow is Zotero's chevron-8 twisty.
    // 11: list items fold too; Fold All / Unfold All (2026-11-09).
    const INJECT_V = 11;

    /** CROSS-BUNDLE DecorationSet interop (issue #37 -- "Search in notes
     *  does not find anything", root-caused 2026-08-27).
     *
     *  Our DecorationSet comes from THIS bundle's prosemirror-view copy, so
     *  it fails the page bundle's `instanceof DecorationSet`. That is fine
     *  while ours is the ONLY decoration source (`DecorationGroup.from`
     *  returns `members[0]` untouched, and the view duck-types it) -- but
     *  the moment a second source appears (the findbar's search-highlight
     *  plugin), `from()` takes its mixing branch:
     *      members.reduce((r, m) => r.concat(
     *          m instanceof DecorationSet ? m : m.members), [])
     *  and reads `.members` off our set. Plain DecorationSets have no
     *  `members`, so `concat(undefined)` plants `undefined` in the group,
     *  and every later `members[i].eq(...)` / `.localsInner(...)` throws
     *  ("this.members[t] is undefined") -- the whole updateState dies and
     *  the search paints NOTHING, in every note, whenever linkify is
     *  installed. Giving OUR prototype a `members` getter returning [this]
     *  makes the reduce flatten our sets exactly like the page's own
     *  DecorationGroups (which carry a real `members` array and already
     *  pass through that branch). Verified against prosemirror-view 1.40.1
     *  dist -- if the pinned version ever moves, re-check `from()`. */
    try {
        const dsp: any = (DecorationSet as any).prototype;
        if (!Object.getOwnPropertyDescriptor(dsp, "members")) {
            Object.defineProperty(dsp, "members", {
                get() { return [this]; },
                configurable: true,
            });
        }
    } catch (e) { /* interop shim failed -- solo rendering still works */ }

    /** Zotero's bundled note-editor has a latent bug (present in 10.0-beta):
     *  REPORTED UPSTREAM and FIXED (2026-08-03): zotero-dev thread
     *  https://groups.google.com/g/zotero-dev/c/Gaq4fS93M8U ->
     *  zotero/note-editor 67a760d7 ("Fix plugin view teardown", + regression
     *  tests in e43f3583). These shims stay until a Zotero beta ships the
     *  submodule bump, then become inert: the fixed classes have working
     *  destroys, so the has-update-but-no-destroy and broken-drag-shape
     *  detections below simply stop matching. Safe to remove once the
     *  minimum supported Zotero bundles the fix.
     *  The bug: the colour plugins' view wrappers do
     *  `destroy(){ pluginState.destroy() }`
     *  but the HighlightColor pluginState class defines NO destroy method.
     *  Vanilla never notices -- plugin views are only destroyed when the
     *  plugin SET changes, which never happens without injectors. But with
     *  TWO injectors (Weavero + Better Notes), the second updateState()
     *  destroys the live plugin views, the loop throws `t.destroy is not a
     *  function` mid-way, recreation never runs, and every popup plugin view
     *  (citation / link / highlight) is left dead -- no more "Show Item /
     *  Edit Citation / Go to Page" popups (diagnosed live 2026-07-28).
     *  Shim a no-op destroy onto any pluginState that has update() but no
     *  destroy(); instances survive reconfigure, so once shimmed ALL later
     *  recreates (ours or BN's) are safe. */
    function shimPluginStateDestroys(view: any): number {
        let shimmed = 0;
        try {
            for (const p of view.state.plugins) {
                try {
                    if (!p || !p.spec || !p.spec.view) continue;
                    const ps = p.key ? view.state[p.key]
                        : (typeof p.getState === "function" ? p.getState(view.state) : null);
                    if (ps && typeof ps === "object"
                            && typeof ps.update === "function"
                            && typeof ps.destroy !== "function") {
                        ps.destroy = function () {};
                        shimmed++;
                    }
                } catch (e) { /* next plugin */ }
            }
        } catch (e) { /* state shape unexpected */ }
        return shimmed;
    }

    /** Harden every LIVE plugin view's destroy() so no single broken one can
     *  abort ProseMirror's teardown loop (which also aborts recreation and
     *  strands the editor).
     *
     *  The state-level shim above cannot reach these: drag.js's plugin has no
     *  state field at all -- its plugin VIEW (the Drag instance) carries the
     *  broken destroy directly. Verified on a clean 10.0-beta.22 profile
     *  (2026-08-02): destroy() reads `this.editorView`, which the class never
     *  assigns (the constructor stores `this.view`), so the FIRST reconfigure
     *  throws there and Weavero+BN only survived because that aborted pass
     *  happened to consume drag's view, letting the second pass through --
     *  ordering luck, not design.
     *
     *  Drag-shaped views (a `handlers` array of {name, handler} plus a `view`
     *  with a dom) get a CORRECT destroy -- upstream's, even de-borked, would
     *  not remove the listeners (its forEach destructures (element, index)) --
     *  so repeated reconfigures stop leaking mousemove handlers on the editor
     *  dom. Everything else keeps its own destroy inside a try/catch. */
    function hardenPluginViewDestroys(view: any): number {
        let hardened = 0;
        try {
            for (const pv of (view.pluginViews || [])) {
                try {
                    if (!pv || typeof pv.destroy !== "function" || pv.__wvDestroyHardened) continue;
                    const dragShaped = Array.isArray(pv.handlers)
                        && pv.handlers.length && pv.handlers[0]
                        && typeof pv.handlers[0].handler === "function"
                        && pv.view && pv.view.dom;
                    if (dragShaped) {
                        pv.destroy = function () {
                            try {
                                this.handlers.forEach((h: any) => {
                                    try { this.view.dom.removeEventListener(h.name, h.handler); } catch (e) {}
                                });
                            } catch (e) {}
                        };
                    } else {
                        const orig = pv.destroy;
                        pv.destroy = function () {
                            try { orig.call(this); } catch (e) {}
                        };
                    }
                    pv.__wvDestroyHardened = true;
                    hardened++;
                } catch (e) { /* next view */ }
            }
        } catch (e) { /* view shape unexpected */ }
        return hardened;
    }

    /** One-shot hardening DECAYS: every reconfigure destroys and RECREATES
     *  the plugin views, so freshly-made ones (including a fresh broken Drag)
     *  are unprotected again -- measured live: hardenedViews 0 right after an
     *  install had hardened 15 (2026-08-02). The only airtight point is
     *  `view.updateState` itself: a PUBLIC API name (safe against the
     *  bundle's minification) that every injector -- ours, Better Notes',
     *  anyone's -- must call to reconfigure. Wrap it once per view and harden
     *  BEFORE each pass (so teardown of the current views cannot abort) and
     *  AFTER it (so the recreated views are protected for the next caller). */
    function wrapUpdateStateForHardening(view: any): boolean {
        try {
            if (!view || view.__wvUpdateStateWrapped) return false;
            const orig = view.updateState;
            if (typeof orig !== "function") return false;
            view.updateState = function (state: any) {
                try { hardenPluginViewDestroys(this); } catch (e) {}
                const r = orig.call(this, state);
                try { hardenPluginViewDestroys(this); } catch (e) {}
                return r;
            };
            view.__wvUpdateStateWrapped = true;
            return true;
        } catch (e) { return false; }
    }

    function expectedPluginViewCount(view: any): number {
        let n = 0;
        try { for (const p of (view.directPlugins || [])) { if (p && p.spec && p.spec.view) n++; } } catch (e) {}
        try { for (const p of view.state.plugins) { if (p && p.spec && p.spec.view) n++; } } catch (e) {}
        return n;
    }

    /** Detect the aborted-destroy state (fewer live plugin views than
     *  view-spec plugins) and repair it: shim the missing destroys, then
     *  force a full plugin-view recreate via a same-plugins reconfigure
     *  (array identity change is what triggers destroy+recreate). Called
     *  from chrome after every install/sweep, so an editor that Better
     *  Notes breaks LATER heals on the next sweep. */
    function healPluginViews(): string {
        try {
            const ci: any = (window as any)._currentEditorInstance;
            const view: any = ci && ci._editorCore && ci._editorCore.view;
            if (!view) return "no-view";
            shimPluginStateDestroys(view);
            hardenPluginViewDestroys(view);
            wrapUpdateStateForHardening(view);
            const have = view.pluginViews ? view.pluginViews.length : -1;
            const want = expectedPluginViewCount(view);
            if (have < 0 || have >= want) return "healthy:" + have + "/" + want;
            const shimmed = 0, hardened = 0;   // already applied above
            view.updateState(view.state.reconfigure({
                plugins: view.state.plugins.slice(),
            }));
            const now = view.pluginViews ? view.pluginViews.length : -1;
            return "healed:" + have + "->" + now + "/" + want
                + " (shimmed " + shimmed + ", hardened " + hardened + ")";
        } catch (e: any) {
            return "heal-err: " + (e && e.message);
        }
    }
    // The matcher is Weavero's pref-gated URL_REGEX.source, passed in on
    // `window.__wvLinkifyRegexSrc` by note-editor.ts so the editor honours the
    // exact same "Show: URLs / Zotero links / App links" toggles as every
    // other surface (when a scheme's toggle is off it drops out of the
    // source; all-off yields the never-matching \b\B sentinel). Fallback below
    // only if chrome never set it. `decorations` reads it fresh each call, so a
    // toggle change + a re-decorate (empty tx from chrome) re-scopes live.
    const FALLBACK = buildUrlRegex(joinSchemeAlt(["https?:\\/\\/", "zotero:\\/\\/", "\\bwww\\."])).source;
    function currentRe(): RegExp {
        const src = (window as any).__wvLinkifyRegexSrc || FALLBACK;
        return new RegExp(src, "gi");
    }

    function schemeClass(url: string): string {
        // Schemeless `www.` counts as a web link (launched as https).
        if (/^(?:https?|ftp):/i.test(url) || /^www\./i.test(url)) return "wv-link-http";
        if (/^zotero:/i.test(url)) return "wv-link-zotero";
        return "wv-link-app";
    }

    function buildDecos(doc: any): any {
        const decos: any[] = [];
        const re = currentRe();
        doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            const text: string = node.text || "";
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(text))) {
                // Trim trailing punctuation that's rarely part of the URL.
                let url = m[0].replace(/[.,;:)\]}>'"]+$/, "");
                if (!url) continue;
                const from = pos + m.index;
                const to = from + url.length;
                decos.push(Decoration.inline(from, to, {
                    class: "wv-note-linkified " + schemeClass(url),
                    "data-wv-href": url,
                }));
            }
        });
        // No matches -> null, NEVER our bundle's `DecorationSet.empty`: the
        // page's viewDecorations drops falsy results, but it can only
        // recognise its OWN empty singleton -- ours would join the group and
        // hit the same `.members` mixing as any other set (issue #37).
        return decos.length ? DecorationSet.create(doc, decos) : null;
    }

    function makePlugin(): any {
        const spec: any = {
            key: KEY,
            // Display-only: `decorations` is recomputed by ProseMirror on every
            // state, so it always tracks the current text -- and it never edits
            // the doc, so nothing is saved/synced.
            props: {
                decorations(state: any) {
                    // Master "Editor" toggle (enableNotes) off → no decorations,
                    // WITHOUT uninstalling (uninstall = reconfigure = the
                    // t.destroy risk). Chrome flips the flag + re-decorates.
                    // null, not our empty -- see buildDecos (issue #37).
                    if ((window as any).__wvLinkifyEnabled === false) {
                        return null;
                    }
                    return buildDecos(state.doc);
                },
            },
        };
        // Marker for the duplicate-install check: survives even when
        // updateState throws a transient error AFTER the plugin landed
        // (observed live), and works across separate eval()s of this script
        // (each has a fresh PluginKey, so key identity can't be used).
        // __wvLinkifyV lets a NEWER bundle recognise and replace a plugin
        // whose decorations() closure still runs the older code -- re-eval
        // alone never touches the installed plugin instance.
        spec.__wvLinkify = true;
        spec.__wvLinkifyV = INJECT_V;
        return new Plugin(spec);
    }

    // ---- Heading folding (display only, 2026-11-03).
    //
    // A folded heading hides every top-level block after it, down to the
    // next heading of the same or a higher level. The fold set lives in
    // THIS plugin's state, as the positions of the folded headings, mapped
    // through every edit -- nothing is written into the note: a fold
    // transaction carries no steps, and Zotero saves only on `docChanged`
    // (note-editor editor-core.js dispatchTransaction). Hiding is a
    // `wv-fold-hidden` class that only Weavero's injected stylesheet styles,
    // so when Weavero is disabled (the sheet removed) every folded block is
    // back on screen even though this plugin stays in the page.
    const FKEY = new PluginKey("wvNoteFold");

    function viewOf(): any {
        const ci: any = (window as any)._currentEditorInstance;
        return ci && ci._editorCore && ci._editorCore.view;
    }

    function foldOn(): boolean {
        return (window as any).__wvFoldEnabled === true;
    }

    /** Top-level blocks; which headings can fold (something under them
     *  before the next heading of the same or a higher level); which blocks
     *  the given folds hide; and, per hidden block, the folds hiding it. */
    function foldLayout(doc: any, folded: number[]) {
        const tops: any[] = [];
        doc.forEach((node: any, offset: number) => { tops.push({ node, pos: offset }); });
        const isHeading = (i: number) => tops[i] && tops[i].node.type.name === "heading";
        const level = (i: number) => tops[i].node.attrs.level;
        const foldable = new Set<number>();
        for (let i = 0; i < tops.length; i++) {
            if (!isHeading(i)) continue;
            if (i + 1 < tops.length && !(isHeading(i + 1) && level(i + 1) <= level(i))) foldable.add(i);
        }
        const fset = new Set(folded);
        const owners = new Map<number, number[]>();
        for (let i = 0; i < tops.length; i++) {
            if (!foldable.has(i) || !fset.has(tops[i].pos)) continue;
            for (let j = i + 1; j < tops.length; j++) {
                if (isHeading(j) && level(j) <= level(i)) break;
                const o = owners.get(j);
                if (o) o.push(tops[i].pos);
                else owners.set(j, [tops[i].pos]);
            }
        }
        return { tops, foldable, owners };
    }

    /** Keep only folds that still sit on a foldable top-level heading. */
    function validFolds(doc: any, folded: number[]): number[] {
        if (!folded.length) return folded;
        const { tops, foldable } = foldLayout(doc, []);
        const ok = new Set<number>();
        for (const i of foldable) ok.add(tops[i].pos);
        return folded.filter((p) => ok.has(p));
    }

    // ---- List folding (display only, MJT 2026-11-09: "the Obsidian way").
    //
    // A list item -- bulleted or numbered, at any depth -- folds when it
    // holds anything after its first line (its first child, a textblock):
    // sub-lists, further paragraphs. A fold hides those children; the first
    // line stays, and so do the items after it (a numbered list keeps its
    // numbers). Same rules as the heading folds: positions in this plugin's
    // state (`lists`), mapped through every edit, nothing written into the
    // note.

    /** Every list item in document order -- the order of the editor DOM's
     *  `li` elements, which is how chrome addresses them -- with whether it
     *  can fold and where its first line ends (`headEnd`, the start of what
     *  a fold hides). */
    function listItemsOf(doc: any): any[] {
        const out: any[] = [];
        doc.descendants((node: any, pos: number) => {
            if (node.type.name !== "listItem") return true;
            const first = node.firstChild;
            out.push({
                ord: out.length, pos, node,
                foldable: node.childCount > 1 && !!first && first.isTextblock,
                headEnd: pos + 1 + (first ? first.nodeSize : 0),
                end: pos + node.nodeSize,
            });
            return true;
        });
        return out;
    }

    /** Keep only list folds that still sit on a foldable item. */
    function validLists(doc: any, lists: number[]): number[] {
        if (!lists.length) return lists;
        const ok = new Set<number>();
        for (const li of listItemsOf(doc)) if (li.foldable) ok.add(li.pos);
        return lists.filter((p) => ok.has(p));
    }

    /** The folded items whose hidden part holds `pos`, outermost first. */
    function listOwners(items: any[], lists: number[], pos: number): number[] {
        if (!lists.length) return [];
        const fset = new Set(lists);
        return items.filter((li: any) => li.foldable && fset.has(li.pos) && pos >= li.headEnd && pos < li.end - 1)
            .map((li: any) => li.pos);
    }

    /** Every heading in document order (headings nested in a list or a
     *  quote included); `ord` is the index in this list, the same order
     *  as the editor DOM's `h1..h6`, which is how chrome addresses them. */
    function headingsOf(doc: any): any[] {
        const out: any[] = [];
        doc.descendants((node: any, pos: number, parent: any) => {
            if (node.type.name !== "heading") return true;
            out.push({ ord: out.length, pos, node, top: parent === doc });
            return false;
        });
        return out;
    }

    function arrowDOM(): any {
        const s = document.createElement("span");
        s.className = "wv-fold-toggle";
        s.setAttribute("contenteditable", "false");
        s.setAttribute("aria-hidden", "true");
        // Zotero's chevron-8.svg, the twisty of its trees and of the reader
        // outline; the note CSS turns it for a folded heading.
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 8 8");
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", "M0 2.70711L4 6.70711L8 2.70711L7.29289 2L4 5.29289L0.707107 2L0 2.70711Z");
        svg.appendChild(path);
        s.appendChild(svg);
        return s;
    }

    /** A list item's arrow: chrome tells it from a heading's by the mark. */
    function listArrowDOM(): any {
        const s = arrowDOM();
        s.setAttribute("data-wv-fold", "li");
        return s;
    }

    function foldDecos(state: any): any {
        const st: any = FKEY.getState(state);
        const decos: any[] = [];
        // The heading flash (outline click, heading link): the reader
        // outline's text highlight, over the heading's TEXT only -- an inline
        // decoration, so it scrolls with the note and edits nothing.
        if (st && st.flash != null) {
            const node = state.doc.nodeAt(st.flash);
            if (node && node.type.name === "heading" && node.content.size) {
                decos.push(Decoration.inline(st.flash + 1, st.flash + node.nodeSize - 1, { class: "wv-nn-flash" }));
            }
        }
        if (!foldOn()) return decos.length ? DecorationSet.create(state.doc, decos) : null;
        const { tops, foldable, owners } = foldLayout(state.doc, st ? st.folded : []);
        const fset = new Set(st ? st.folded : []);
        for (let i = 0; i < tops.length; i++) {
            const t = tops[i];
            const end = t.pos + t.node.nodeSize;
            if (owners.has(i)) {
                decos.push(Decoration.node(t.pos, end, { class: "wv-fold-hidden" }));
                continue;
            }
            if (!foldable.has(i)) continue;
            const folded = fset.has(t.pos);
            decos.push(Decoration.node(t.pos, end, { class: folded ? "wv-fold-h wv-fold-folded" : "wv-fold-h" }));
            decos.push(Decoration.widget(t.pos + 1, arrowDOM, {
                side: -1, key: "wv-fold", ignoreSelection: true, stopEvent: () => true,
            }));
        }
        // List items: the class and the arrow on the first line, the rest
        // of a folded item hidden child by child.
        const lset = new Set(st ? st.lists : []);
        for (const li of listItemsOf(state.doc)) {
            if (!li.foldable) continue;
            const isFolded = lset.has(li.pos);
            decos.push(Decoration.node(li.pos + 1, li.headEnd, { class: isFolded ? "wv-fold-li wv-fold-folded" : "wv-fold-li" }));
            decos.push(Decoration.widget(li.pos + 2, listArrowDOM, {
                side: -1, key: "wv-fold-li", ignoreSelection: true, stopEvent: () => true,
            }));
            if (!isFolded) continue;
            li.node.forEach((child: any, offset: number, index: number) => {
                if (index === 0) return;
                const from = li.pos + 1 + offset;
                decos.push(Decoration.node(from, from + child.nodeSize, { class: "wv-fold-hidden" }));
            });
        }
        // null, never our bundle's empty set (issue #37, see buildDecos).
        return decos.length ? DecorationSet.create(state.doc, decos) : null;
    }

    function makeFoldPlugin(): any {
        const spec: any = {
            key: FKEY,
            state: {
                init: () => ({ folded: [], lists: [], flash: null }),
                apply(tr: any, prev: any, _old: any, next: any) {
                    const remap = (ps: number[]) => ps.map((p) => {
                        const r = tr.mapping.mapResult(p, 1);
                        return r.deleted ? -1 : r.pos;
                    }).filter((p) => p >= 0);
                    let folded: number[] = prev.folded;
                    let lists: number[] = prev.lists;
                    if (tr.docChanged && folded.length) folded = remap(folded);
                    if (tr.docChanged && lists.length) lists = remap(lists);
                    const m = tr.getMeta(FKEY);
                    if (m) {
                        if (Array.isArray(m.set)) folded = m.set.slice();
                        if (typeof m.toggle === "number") {
                            folded = folded.indexOf(m.toggle) >= 0
                                ? folded.filter((p) => p !== m.toggle)
                                : folded.concat([m.toggle]);
                        }
                        if (Array.isArray(m.unfold)) folded = folded.filter((p) => m.unfold.indexOf(p) < 0);
                        if (Array.isArray(m.listSet)) lists = m.listSet.slice();
                        if (typeof m.listToggle === "number") {
                            lists = lists.indexOf(m.listToggle) >= 0
                                ? lists.filter((p) => p !== m.listToggle)
                                : lists.concat([m.listToggle]);
                        }
                        if (Array.isArray(m.listUnfold)) lists = lists.filter((p) => m.listUnfold.indexOf(p) < 0);
                    }
                    let flash: any = prev.flash;
                    if (flash != null && tr.docChanged) {
                        const r = tr.mapping.mapResult(flash, 1);
                        flash = r.deleted ? null : r.pos;
                    }
                    if (m && Object.prototype.hasOwnProperty.call(m, "flash")) flash = m.flash;
                    if (folded === prev.folded && lists === prev.lists && flash === prev.flash) return prev;
                    return {
                        folded: folded === prev.folded ? prev.folded : validFolds(next.doc, folded),
                        lists: lists === prev.lists ? prev.lists : validLists(next.doc, lists),
                        flash,
                    };
                },
            },
            props: {
                decorations: foldDecos,
            },
            // The caret (an arrow key, a search hit, a click in a link
            // target) landing inside a folded section opens it: text the
            // user is typing into is never hidden.
            appendTransaction(trs: any[], _old: any, next: any) {
                try {
                    if (!foldOn()) return null;
                    const st: any = FKEY.getState(next);
                    if (!st || (!st.folded.length && !st.lists.length)) return null;
                    if (trs.some((t) => t.getMeta(FKEY))) return null;
                    if (!trs.some((t) => t.selectionSet || t.docChanged)) return null;
                    const head = next.selection.head;
                    const own = st.folded.length
                        ? foldLayout(next.doc, st.folded).owners.get(next.doc.resolve(head).index(0)) : null;
                    const lown = listOwners(st.lists.length ? listItemsOf(next.doc) : [], st.lists, head);
                    if (!own && !lown.length) return null;
                    return next.tr.setMeta(FKEY, { unfold: own || [], listUnfold: lown }).setMeta("addToHistory", false);
                } catch (e) { return null; }
            },
            // Tells chrome that the text or the folds changed (the outline
            // and the fold store follow): a DOM event on the editor's
            // document, which chrome hears through a keyed listener.
            view() {
                return {
                    update(view: any, prev: any) {
                        try {
                            const doc = view.state.doc !== prev.doc;
                            const a: any = FKEY.getState(view.state), b: any = FKEY.getState(prev);
                            const fold = !!a && !!b && (a.folded !== b.folded || a.lists !== b.lists);
                            if (!doc && !fold) return;
                            const d: any = view.dom.ownerDocument;
                            d.dispatchEvent(new (d.defaultView as any).CustomEvent("wvnotechange", {
                                detail: (doc ? "doc" : "") + (fold ? " fold" : ""),
                            }));
                        } catch (e) {}
                    },
                    destroy() {},
                };
            },
        };
        spec.__wvFold = true;
        spec.__wvFoldV = INJECT_V;
        return new Plugin(spec);
    }

    /** Headings for chrome, as JSON: level, text, id, whether a fold can
     *  start there, whether it is folded, whether a fold hides it. */
    function headingsJSON(): string {
        const view = viewOf();
        if (!view) return "[]";
        const st: any = FKEY.getState(view.state);
        const folded: number[] = st ? st.folded : [];
        const { tops, foldable, owners } = foldLayout(view.state.doc, folded);
        const topIdx = new Map<number, number>();
        tops.forEach((t: any, i: number) => topIdx.set(t.pos, i));
        const lists: number[] = st ? st.lists : [];
        const items = lists.length ? listItemsOf(view.state.doc) : [];
        return JSON.stringify(headingsOf(view.state.doc).map((h: any) => {
            const ti = h.top ? topIdx.get(h.pos) : view.state.doc.resolve(h.pos).index(0);
            return {
                ord: h.ord,
                level: h.node.attrs.level,
                text: h.node.textContent,
                id: h.node.attrs.id || "",
                top: h.top,
                foldable: h.top && foldable.has(ti as number),
                folded: h.top && folded.indexOf(h.pos) >= 0,
                // A heading inside a folded list item is out of sight too.
                hidden: owners.has(ti as number) || listOwners(items, lists, h.pos).length > 0,
            };
        }));
    }

    function foldToggle(ord: number): string {
        const view = viewOf();
        if (!view) return "no-view";
        const h = headingsOf(view.state.doc)[ord];
        if (!h || !h.top) return "no-heading";
        const st: any = FKEY.getState(view.state);
        const was = !!st && st.folded.indexOf(h.pos) >= 0;
        let tr = view.state.tr.setMeta(FKEY, { toggle: h.pos }).setMeta("addToHistory", false);
        if (!was) {
            // A caret inside the section being hidden moves to the end of
            // its heading, so the next keystroke never lands out of sight.
            const lay = foldLayout(view.state.doc, (st ? st.folded : []).concat([h.pos]));
            const idx = view.state.doc.resolve(view.state.selection.head).index(0);
            const own = lay.owners.get(idx);
            if (own && own.indexOf(h.pos) >= 0) {
                tr = tr.setSelection(TextSelection.create(tr.doc, h.pos + h.node.nodeSize - 1));
            }
        }
        view.dispatch(tr);
        return was ? "unfolded" : "folded";
    }

    /** Fold exactly the headings at these ordinals (chrome's restore). */
    function foldSet(ordsJSON: string): number {
        const view = viewOf();
        if (!view) return -1;
        let ords: number[] = [];
        try { ords = JSON.parse(String(ordsJSON)) || []; } catch (e) {}
        const hs = headingsOf(view.state.doc);
        const set = ords.map((o) => hs[o]).filter((h) => h && h.top).map((h) => h.pos);
        view.dispatch(view.state.tr.setMeta(FKEY, { set }).setMeta("addToHistory", false));
        const st: any = FKEY.getState(view.state);
        return st ? st.folded.length : 0;
    }

    /** Open whatever folds hide the heading at `ord` -- heading folds and
     *  the folds of list items it sits in; the number opened. */
    function foldReveal(ord: number): number {
        const view = viewOf();
        if (!view) return 0;
        const h = headingsOf(view.state.doc)[ord];
        const st: any = FKEY.getState(view.state);
        if (!h || !st || (!st.folded.length && !st.lists.length)) return 0;
        const idx = view.state.doc.resolve(h.pos).index(0);
        const own = st.folded.length ? foldLayout(view.state.doc, st.folded).owners.get(idx) || [] : [];
        const lown = listOwners(st.lists.length ? listItemsOf(view.state.doc) : [], st.lists, h.pos);
        if (!own.length && !lown.length) return 0;
        view.dispatch(view.state.tr.setMeta(FKEY, { unfold: own, listUnfold: lown }).setMeta("addToHistory", false));
        return own.length + lown.length;
    }

    /** List items for chrome, as JSON: the first line's text, whether the
     *  item can fold, whether it is folded. */
    function listItemsJSON(): string {
        const view = viewOf();
        if (!view) return "[]";
        const st: any = FKEY.getState(view.state);
        const lset = new Set(st ? st.lists : []);
        return JSON.stringify(listItemsOf(view.state.doc).map((li: any) => ({
            ord: li.ord,
            t: li.node.firstChild ? li.node.firstChild.textContent : "",
            foldable: li.foldable,
            folded: lset.has(li.pos),
        })));
    }

    function listFoldToggle(ord: number): string {
        const view = viewOf();
        if (!view) return "no-view";
        const li = listItemsOf(view.state.doc)[ord];
        if (!li || !li.foldable) return "no-item";
        const st: any = FKEY.getState(view.state);
        const was = !!st && st.lists.indexOf(li.pos) >= 0;
        let tr = view.state.tr.setMeta(FKEY, { listToggle: li.pos }).setMeta("addToHistory", false);
        // A caret inside the part being hidden moves to the end of the
        // first line, so the next keystroke never lands out of sight.
        const head = view.state.selection.head;
        if (!was && head >= li.headEnd && head < li.end - 1) {
            tr = tr.setSelection(TextSelection.create(tr.doc, li.headEnd - 1));
        }
        view.dispatch(tr);
        return was ? "unfolded" : "folded";
    }

    /** Fold exactly the list items at these ordinals (chrome's restore). */
    function listFoldSet(ordsJSON: string): number {
        const view = viewOf();
        if (!view) return -1;
        let ords: number[] = [];
        try { ords = JSON.parse(String(ordsJSON)) || []; } catch (e) {}
        const items = listItemsOf(view.state.doc);
        const listSet = ords.map((o) => items[o]).filter((li) => li && li.foldable).map((li) => li.pos);
        view.dispatch(view.state.tr.setMeta(FKEY, { listSet }).setMeta("addToHistory", false));
        const st: any = FKEY.getState(view.state);
        return st ? st.lists.length : 0;
    }

    /** Fold every heading and every list item, at every level (the note
     *  menu's Fold All). A caret now out of sight goes to the end of the
     *  outermost line still showing above it. */
    function foldAll(): number {
        const view = viewOf();
        if (!view) return -1;
        const doc = view.state.doc;
        const { tops, foldable } = foldLayout(doc, []);
        const set = Array.from(foldable).map((i) => tops[i].pos);
        const items = listItemsOf(doc);
        const listSet = items.filter((li: any) => li.foldable).map((li: any) => li.pos);
        let tr = view.state.tr.setMeta(FKEY, { set, listSet }).setMeta("addToHistory", false);
        const head = view.state.selection.head;
        const own = foldLayout(doc, set).owners.get(doc.resolve(head).index(0));
        let to = -1;
        if (own && own.length) {
            const hn = doc.nodeAt(own[0]);
            if (hn) to = own[0] + hn.nodeSize - 1;
        }
        else {
            const lown = listOwners(items, listSet, head);
            const li = lown.length ? items.find((x: any) => x.pos === lown[0]) : null;
            if (li) to = li.headEnd - 1;
        }
        if (to >= 0) tr = tr.setSelection(TextSelection.create(tr.doc, to));
        view.dispatch(tr);
        return set.length + listSet.length;
    }

    /** Open every fold, headings and lists (the note menu's Unfold All). */
    function unfoldAll(): number {
        const view = viewOf();
        if (!view) return -1;
        const st: any = FKEY.getState(view.state);
        const n = st ? st.folded.length + st.lists.length : 0;
        view.dispatch(view.state.tr.setMeta(FKEY, { set: [], listSet: [] }).setMeta("addToHistory", false));
        return n;
    }

    /** What could fold and what is folded, headings and lists together, as
     *  JSON (the note menu greys Fold All / Unfold All by these). */
    function foldCounts(): string {
        const view = viewOf();
        if (!view) return JSON.stringify({ foldable: 0, folded: 0 });
        const st: any = FKEY.getState(view.state);
        const foldable = foldLayout(view.state.doc, []).foldable.size
            + listItemsOf(view.state.doc).filter((li: any) => li.foldable).length;
        return JSON.stringify({ foldable, folded: st ? st.folded.length + st.lists.length : 0 });
    }

    /** One tag per editor view: chrome restores a note's folds once per
     *  view, and a note loaded into the same iframe gets a new view. */
    function viewTag(): string {
        const view: any = viewOf();
        if (!view) return "";
        if (!view.__wvFoldTag) view.__wvFoldTag = Math.random().toString(36).slice(2, 10);
        return view.__wvFoldTag;
    }

    /** The heading's `id`, written once when it has none or shares it with
     *  another heading (splitting a heading copies its attrs). This IS an
     *  edit to the note -- the anchor a heading link needs -- so a read-only
     *  editor refuses it (editor-core throws on a doc change there). */
    function headingEnsureId(ord: number): string {
        const view: any = viewOf();
        if (!view) return JSON.stringify({ error: "no-view" });
        const hs = headingsOf(view.state.doc);
        const h = hs[ord];
        if (!h) return JSON.stringify({ error: "no-heading" });
        const cur = h.node.attrs.id || "";
        if (cur && !hs.some((o: any) => o !== h && o.node.attrs.id === cur)) {
            return JSON.stringify({ id: cur, written: false });
        }
        const ci: any = (window as any)._currentEditorInstance;
        const ro = !view.editable || !!(ci && ci._editorCore && ci._editorCore.readOnly);
        if (ro) return JSON.stringify({ error: "read-only" });
        let id = "";
        do { id = "wv-" + Math.random().toString(36).slice(2, 10); }
        while (hs.some((o: any) => o.node.attrs.id === id));
        view.dispatch(view.state.tr.setNodeMarkup(h.pos, null,
            Object.assign({}, h.node.attrs, { id })).setMeta("addToHistory", false));
        return JSON.stringify({ id, written: true });
    }

    /** The outline's Enter: open the folds over the heading, put the caret
     *  at its end, focus the editor. No doc change (nothing saved). */
    function headingFocus(ord: number): boolean {
        const view: any = viewOf();
        if (!view) return false;
        foldReveal(ord);
        const h = headingsOf(view.state.doc)[ord];
        if (!h) return false;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, h.pos + h.node.nodeSize - 1)));
        view.focus();
        return true;
    }

    /** Flash the heading at `ord` (-1: take the flash down). No doc change. */
    function headingFlash(ord: number): boolean {
        const view: any = viewOf();
        if (!view) return false;
        let pos: any = null;
        if (ord >= 0) {
            const h = headingsOf(view.state.doc)[ord];
            if (!h) return false;
            pos = h.pos;
        }
        view.dispatch(view.state.tr.setMeta(FKEY, { flash: pos }).setMeta("addToHistory", false));
        return true;
    }

    /** The outline's Escape: back to the editor, caret where it was. */
    function editorFocus(): boolean {
        const view: any = viewOf();
        if (!view) return false;
        view.focus();
        return true;
    }

    function install(): string {
        const ci: any = (window as any)._currentEditorInstance;
        const view: any = ci && ci._editorCore && ci._editorCore.view;
        if (!view) return "no-view";
        // Idempotent protections run on EVERY sweep call -- even when the
        // linkify plugin is already installed -- because recreated plugin
        // views lose their hardening and a re-opened editor needs the
        // updateState wrap again.
        shimPluginStateDestroys(view);
        hardenPluginViewDestroys(view);
        wrapUpdateStateForHardening(view);
        const has = () => view.state.plugins.some((p: any) => p.spec && p.spec.__wvLinkify
            && Number(p.spec.__wvLinkifyV || 0) >= INJECT_V)
            && view.state.plugins.some((p: any) => p.spec && p.spec.__wvFold
            && Number(p.spec.__wvFoldV || 0) >= INJECT_V);
        if (has()) return "already";
        // Plugins from an OLDER bundle (missing/lower version) are dropped
        // in the same reconfigure that adds the fresh ones -- their
        // closures are the code being replaced (issue #37: the v4 closure
        // returned cross-bundle empties and unstamped sets). Linkify and
        // folding go in TOGETHER: every reconfigure tears down and rebuilds
        // every plugin view, the step that broke editors when two plugins
        // inject (see shimPluginStateDestroys), so never one per feature.
        try {
            view.updateState(view.state.reconfigure({
                plugins: view.state.plugins
                    .filter((p: any) => !(p.spec && (p.spec.__wvLinkify || p.spec.__wvFold)))
                    .concat([makePlugin(), makeFoldPlugin()]),
            }));
            return "installed";
        } catch (e: any) {
            // reconfigure re-initialises EVERY plugin's view; with other plugins
            // present (e.g. Better Notes) one can throw during re-init (`t.destroy`
            // / `editorView is undefined`) AFTER our plugin is already in the new
            // state. If ours landed, that's a success -- don't report an error
            // (which would keep the chrome retry loop spinning).
            if (has()) return "installed";
            return "err: " + (e && e.message);
        }
    }

    (window as any).__wvInstallNoteLinkify = install;
    (window as any).__wvHealNotePluginViews = healPluginViews;
    (window as any).__wvNoteInjectV = INJECT_V;
    // Heading API (folding, the note outline, heading links). Chrome calls
    // these through the iframe's wrappedJSObject and passes only strings
    // and numbers; answers are strings (JSON) for the same reason.
    (window as any).__wvNoteHeadings = headingsJSON;
    (window as any).__wvFoldToggle = foldToggle;
    (window as any).__wvFoldSet = foldSet;
    (window as any).__wvFoldReveal = foldReveal;
    (window as any).__wvFoldViewTag = viewTag;
    (window as any).__wvHeadingEnsureId = headingEnsureId;
    (window as any).__wvHeadingFocus = headingFocus;
    (window as any).__wvEditorFocus = editorFocus;
    (window as any).__wvHeadingFlash = headingFlash;
    (window as any).__wvListItems = listItemsJSON;
    (window as any).__wvListFoldToggle = listFoldToggle;
    (window as any).__wvListFoldSet = listFoldSet;
    (window as any).__wvFoldAll = foldAll;
    (window as any).__wvUnfoldAll = unfoldAll;
    (window as any).__wvFoldCounts = foldCounts;
    // Force a re-scan: `decorations` reads __wvLinkifyRegexSrc fresh each call,
    // so dispatching an empty transaction re-runs it under the current toggle
    // state (chrome calls this after a "Show:" toggle changes, and once after
    // install to guarantee the first paint). Empty tx = no doc change.
    (window as any).__wvRedecorateNotes = function () {
        try {
            const ci: any = (window as any)._currentEditorInstance;
            const view: any = ci && ci._editorCore && ci._editorCore.view;
            if (view) view.dispatch(view.state.tr);
        } catch (e) { /* view gone */ }
    };
    // NO in-page retry loop: timers scheduled by eval'd code in this
    // compartment never fire (verified live -- setTimeout schedules but the
    // callback doesn't run), so retrying is driven from the CHROME side
    // (_wvInstallNoteLinkify polls this function until installed/already).
    // The immediate attempt below covers the already-loaded case.
    return install();
})();
