// Weavero's public API for other plugins: `Zotero.Weavero.api`
// (docs/plugin-api.md is the contract; test/public-api.spec.js locks it).
//
// Two plugins called Weavero before there was an API (Annotation Markdown
// from v0.6.1, Rich Annotation): a `zotero://` link click goes to
// `Zotero.Weavero.plugin.handleZoteroURI`, and their previews read
// `weavero.recolorAmLinks` and the `--wv-link-*` colours. Nothing documented
// or tested that, so a rename would have broken both without an error (plugin
// survey 2026-11-11). This surface is what other plugins may count on; the
// plugin object itself stays internal (the old route is kept and locked).
//
// Rules for every entry, so it can also be offered through Zotero's coming
// plugin-to-plugin channel (zotero#6080, unmerged: it carries only
// primitives, plain objects and arrays, request and response):
// - plain data in and out, no DOM nodes, no Zotero objects, no callbacks;
// - never throws: a bad argument or a Weavero being shut down answers
//   false / null, so a caller's own fallback runs; a part-2 call that can
//   fail for several reasons answers `{ok: false, error: "<code>"}`
//   (docs/plugin-api.md lists the codes);
// - resolves the live plugin at call time (a caller may hold the api object
//   across a Weavero update or disable); the work itself is the plugin's
//   (modules/plugin-api.ts), so this file only checks, delegates and catches.
// An entry's own version in WV_API_ENTRIES rises whenever what it does
// changes (openLink 2: web and app links too); WV_API_VERSION rises only for
// a change that breaks a caller. A new entry raises neither. Per-entry
// versions because the #6080 channel versions each command
// (`commandVersion`, and a caller's `minVersion` / `maxVersion`): each entry
// here registers there as it is.

import { urlLinkClass, WV_LINK_PALETTE } from "./links";
import { wvLivePlugin } from "./live";

export const WV_API_VERSION = 1;

/** Each callable entry and its own version. */
export const WV_API_ENTRIES: { [name: string]: number } = {
    isReady: 1,
    canOpenLink: 1,
    // 2: web and app links too, through Weavero's rules (1.0.5, part 2).
    openLink: 2,
    linkKind: 1,
    linkColors: 1,
    parseLink: 1,
    buildLink: 1,
    getReaderSidebarView: 1,
    declareCommentRenderer: 1,
    withdrawCommentRenderer: 1,
    getBacklinks: 1,
    getLinksFrom: 1,
};

/** The live plugin's answer to a call; `idle` when Weavero is not running,
 *  `failed` when the call threw: never a throw into the caller. */
function delegate<T>(name: string, idle: T, failed: T, run: (p: any) => T): T {
    const p = wvLivePlugin();
    if (!p) return idle;
    try { return run(p); }
    catch (e) {
        try { Zotero.debug("[Weavero] api." + name + " error: " + e); } catch (_) {}
        return failed;
    }
}

/** A part-2 error as data. */
function apiErr(error: string, extra?: object): object {
    return Object.assign({ ok: false }, extra || {}, { error });
}

/** The links Weavero opens itself: select, open, open-pdf, note. */
const WV_API_OPENABLE = /^zotero:\/\/(?:select|open(?:-pdf)?|note)\//i;

export type WvApiLinkKind = "http" | "zotero" | "app";
export interface WvApiPalette { http: string; zotero: string; app: string }
export interface WvApiLinkColors { enabled: boolean; light: WvApiPalette; dark: WvApiPalette }

function palette(scheme: "light" | "dark"): WvApiPalette {
    return {
        http: WV_LINK_PALETTE.http[scheme],
        zotero: WV_LINK_PALETTE.zotero[scheme],
        app: WV_LINK_PALETTE.app[scheme],
    };
}

/** The api object for `Zotero.Weavero.api`, frozen. `version` is Weavero's. */
export function wvMakePublicApi(version: string) {
    const api = {
        /** Raised only by a change that breaks a caller. */
        apiVersion: WV_API_VERSION,
        /** Weavero's own version, e.g. "1.0.5". */
        version: String(version || ""),
        /** Each callable entry and its version: { openLink: 1, ... }. */
        entries: Object.freeze(Object.assign({}, WV_API_ENTRIES)),

        /** Weavero is running (started and not shut down). */
        isReady(): boolean {
            return !!wvLivePlugin();
        },

        /** Weavero opens this link itself (a `zotero://select`, `open`,
         *  `open-pdf` or `note` link). Anything else: open it your own way. */
        canOpenLink(uri: unknown): boolean {
            return typeof uri === "string" && WV_API_OPENABLE.test(uri);
        },

        /** Open a link the way a click on it in Weavero does: a Zotero link
         *  at the item, the page, the annotation or the note, in the window
         *  that already shows it; since version 2 a web or app link through
         *  the user's Weavero settings (the schemes turned on, "open without
         *  confirmation"). Resolves true when Weavero took the link (it
         *  reports a missing target itself), false when the caller should
         *  open it (not a link Weavero opens, or Weavero not running). */
        async openLink(uri: unknown): Promise<boolean> {
            const p = wvLivePlugin();
            if (!p) return false;
            if (!api.canOpenLink(uri)) {
                // Version 2: web and app links. A zotero:// action Weavero does
                // not open stays false, as in version 1.
                try { return !!p._wvApiOpenExternal(uri); }
                catch (e) {
                    try { Zotero.debug("[Weavero] api.openLink error: " + e); } catch (_) {}
                    return false;
                }
            }
            if (typeof p.handleZoteroURI !== "function") return false;
            try {
                await p.handleZoteroURI(uri as string);
                return true;
            }
            catch (e) {
                try { Zotero.debug("[Weavero] api.openLink error: " + e); } catch (_) {}
                return false;
            }
        },

        /** Which of Weavero's three link colours a link takes: "zotero"
         *  (zotero://), "http" (web, a schemeless www. included), "app"
         *  (any other scheme). */
        linkKind(uri: unknown): WvApiLinkKind {
            const c = urlLinkClass(typeof uri === "string" ? uri : "");
            return c === "wv-link-zotero" ? "zotero" : c === "wv-link-app" ? "app" : "http";
        },

        /** Weavero's link colours, both themes, and whether the user wants
         *  other plugins' links drawn in them (`enabled`, the setting
         *  `extensions.zotero.weavero.recolorAmLinks`, default on). The same
         *  colours are the CSS variables `--wv-link-http`, `--wv-link-zotero`
         *  and `--wv-link-app` on the root of every document Weavero styles
         *  links in. */
        linkColors(): WvApiLinkColors {
            let enabled = true;
            try { enabled = Zotero.Prefs.get("weavero.recolorAmLinks") !== false; } catch (e) {}
            return { enabled: !!wvLivePlugin() && enabled, light: palette("light"), dark: palette("dark") };
        },

        // ---- part 2 (docs/plugin-api.md, "Version 1, part 2") ----------

        /** A Zotero link read into plain data: `{kind, action, groupID,
         *  keys, annotationKey, page, collectionKey, searchKey, heading}`,
         *  every field present (null where absent), or null when it is not
         *  a link Weavero writes or opens. */
        parseLink(url: unknown): object | null {
            return delegate("parseLink", null, null, (p) => p._wvApiParseLink(url));
        },

        /** One of Weavero's links to an item: `{ok: true, url}`, or
         *  `{ok: false, url: null, error}`. `args`: `{item: {groupID, key},
         *  form: "select" | "open" | "note" | "heading", annotationKey?,
         *  collectionKey?, heading?}`. */
        buildLink(args: unknown): object {
            return delegate("buildLink", apiErr("not-running", { url: null }), apiErr("failed", { url: null }), (p) => p._wvApiBuildLink(args));
        },

        /** The view a reader tab's sidebar has selected: "annotations",
         *  "outline", "thumbnails" (Zotero's), "weavero-outline",
         *  "weavero-bookmarks" (Weavero's), or null (not a reader tab).
         *  `args`: `{readerTabId}`. Read-only. */
        getReaderSidebarView(args: unknown): string | null {
            return delegate("getReaderSidebarView", null, null, (p) => p._wvApiReaderSidebarView(args));
        },

        /** Your plugin draws annotation comments itself on these surfaces
         *  ("sidebar", "popup", "itemPane"): Weavero draws no preview of its
         *  own there while the declaration stands. `args`: `{pluginId,
         *  surfaces}`, `pluginId` an installed, active plugin. Resolves
         *  `{ok: true, surfaces}` or `{ok: false, error}`. In memory only;
         *  dropped when that plugin is disabled, uninstalled or updated. */
        async declareCommentRenderer(args: unknown): Promise<object> {
            const p = wvLivePlugin();
            if (!p) return apiErr("not-running");
            try { return await p._wvApiDeclareCommentRenderer(args); }
            catch (e) {
                try { Zotero.debug("[Weavero] api.declareCommentRenderer error: " + e); } catch (_) {}
                return apiErr("failed");
            }
        },

        /** Give the surfaces back to Weavero. `args`: `{pluginId}`. `{ok: true}`
         *  (also when nothing was declared) or `{ok: false, error}`. */
        withdrawCommentRenderer(args: unknown): object {
            return delegate("withdrawCommentRenderer", apiErr("not-running"), apiErr("failed"), (p) => p._wvApiWithdrawCommentRenderer(args));
        },

        /** What links an item: `args` `{item: {groupID, key}, scope?: "own" |
         *  "subtree", limit?}`. Resolves `{ok, total, truncated, backlinks}`
         *  or `{ok: false, error, backlinks: []}`. Asynchronous: Weavero's
         *  links index is built on first use. */
        async getBacklinks(args: unknown): Promise<object> {
            const p = wvLivePlugin();
            if (!p) return apiErr("not-running", { backlinks: [] });
            try { return await p._wvApiBacklinks(args); }
            catch (e) {
                try { Zotero.debug("[Weavero] api.getBacklinks error: " + e); } catch (_) {}
                return apiErr("failed", { backlinks: [] });
            }
        },

        /** What an item's notes and annotations link: `args` as getBacklinks.
         *  Resolves `{ok, total, truncated, links}` or `{ok: false, error,
         *  links: []}`. */
        async getLinksFrom(args: unknown): Promise<object> {
            const p = wvLivePlugin();
            if (!p) return apiErr("not-running", { links: [] });
            try { return await p._wvApiLinksFrom(args); }
            catch (e) {
                try { Zotero.debug("[Weavero] api.getLinksFrom error: " + e); } catch (_) {}
                return apiErr("failed", { links: [] });
            }
        },
    };
    return Object.freeze(api);
}
