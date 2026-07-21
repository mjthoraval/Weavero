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
        return DecorationSet.create(doc, decos);
    }

    function makePlugin(): any {
        const spec: any = {
            key: KEY,
            // Display-only: `decorations` is recomputed by ProseMirror on every
            // state, so it always tracks the current text -- and it never edits
            // the doc, so nothing is saved/synced.
            props: {
                decorations(state: any) {
                    return buildDecos(state.doc);
                },
            },
        };
        // Marker for the duplicate-install check: survives even when
        // updateState throws a transient error AFTER the plugin landed
        // (observed live), and works across separate eval()s of this script
        // (each has a fresh PluginKey, so key identity can't be used).
        spec.__wvLinkify = true;
        return new Plugin(spec);
    }

    function install(): string {
        const ci: any = (window as any)._currentEditorInstance;
        const view: any = ci && ci._editorCore && ci._editorCore.view;
        if (!view) return "no-view";
        const has = () => view.state.plugins.some((p: any) => p.spec && p.spec.__wvLinkify);
        if (has()) return "already";
        try {
            view.updateState(view.state.reconfigure({
                plugins: view.state.plugins.concat(makePlugin()),
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
