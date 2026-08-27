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
import { Plugin, PluginKey } from "prosemirror-state";

(function () {
    const KEY = new PluginKey("wvNoteLinkify");
    // Bumped when this script gains behaviour chrome depends on; chrome
    // re-evals the bundle into an already-injected page when the page's
    // __wvNoteInjectV is older (re-eval is safe: install() dedups via the
    // __wvLinkify spec marker and REPLACES a plugin from an older bundle).
    // Chrome reads this number out of the bundle text -- keep the
    // `INJECT_V = <n>` literal greppable.
    const INJECT_V = 5;

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
    const FALLBACK = "(https?:\\/\\/|zotero:\\/\\/|\\bwww\\.)[^\\s<>\"')\\]]*";
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
            && Number(p.spec.__wvLinkifyV || 0) >= INJECT_V);
        if (has()) return "already";
        // A plugin from an OLDER bundle (missing/lower __wvLinkifyV) is
        // dropped in the same reconfigure that adds the fresh one -- its
        // decorations() closure is the code being fixed (issue #37: the
        // v4 closure returned cross-bundle empties and unstamped sets).
        try {
            view.updateState(view.state.reconfigure({
                plugins: view.state.plugins
                    .filter((p: any) => !(p.spec && p.spec.__wvLinkify))
                    .concat(makePlugin()),
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
