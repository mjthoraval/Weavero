// Module: the plugin-side half of Weavero's public API for other plugins.
// `Zotero.Weavero.api` itself (frozen, versioned per call, never throws) is
// lib/public-api.ts; docs/plugin-api.md is the contract; test/public-api.spec.js
// locks it. Part 2 (MJT 2026-11-11, work/plugin-api-part2-study-2026-11-11.md):
// the link grammar here first, its other calls after it.
//
// The same rules as part 1, so every call can be offered later through
// Zotero's plugin-to-plugin channel (zotero#6080, unmerged): plain data in and
// out, an item named `{groupID|null, key}` (a libraryID differs per profile),
// an error answered as data (`{ok: false, error: "<code>"}`) -- a caller's
// own fallback then runs.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvBlParseLink, WV_BL_PLUGIN_ID } from "./backlinks";
import { RP_BM_TAB_ON, RP_OUTLINE_TAB_ON, RP_BM_SIDEBAR_VIEW } from "./reader-panels";
import { wvLivePlugin } from "../lib/live";
import { wvMainWins } from "../lib/windows";

declare const Zotero: any;
declare const ChromeUtils: any;

/** The surfaces where Weavero draws an annotation comment's preview, and so
 *  where another plugin can take the drawing over: the reader sidebar's
 *  cards, the in-PDF annotation popup, the item pane's annotation rows. */
export const WV_API_COMMENT_SURFACES = ["sidebar", "popup", "itemPane"];

/** getBacklinks / getLinksFrom: rows per answer by default, and at most. A
 *  row is a few hundred bytes (its excerpt is cut to ~40 characters before
 *  the reference and ~110 after, backlinks.ts BL_BEFORE / BL_AFTER), so the
 *  cap keeps one answer under about half a megabyte. */
export const WV_API_LIST_DEFAULT = 200;
export const WV_API_LIST_MAX = 1000;

/** An item as other plugins name it: its group's id (null for My Library)
 *  and its key. */
export interface WvApiRef { groupID: number | null; key: string }

/** What `parseLink` answers: every field present, null where absent. */
export interface WvApiParsed {
    /** select | open | open-pdf | note, and collection | search | heading. */
    kind: string;
    /** The zotero:// action the link names: select | open | open-pdf | note. */
    action: string;
    groupID: number | null;
    keys: string[];
    annotationKey: string | null;
    page: string | null;
    collectionKey: string | null;
    searchKey: string | null;
    heading: string | null;
}

/** A `{groupID|null, key}` read off a caller's object, or null. */
function apiRef(v: any): WvApiRef | null {
    if (!v || typeof v !== "object") return null;
    const key = v.key, gid = v.groupID;
    if (typeof key !== "string" || !key) return null;
    if (gid != null && !(typeof gid === "number" && Number.isInteger(gid) && gid > 0)) return null;
    return { groupID: gid == null ? null : gid, key };
}

/** A query string's values (`&amp;` already undone by the caller). */
function apiQuery(q: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const kv of String(q || "").split("&")) {
        const i = kv.indexOf("=");
        if (i <= 0) continue;
        try { out.set(decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))); } catch (e) {}
    }
    return out;
}

const API_LINK = /^zotero:\/\/(select|open|open-pdf|note)\/([^?#]*)(?:\?([^#]*))?/i;

/** A Zotero object key (Zotero.Utilities.isValidObjectKey: eight of
 *  23456789ABCDEFGHIJKLMNPQRSTUVWXYZ). The backlinks parser takes any path
 *  segment, so `zotero://open/library/items/` read "items" as a key. */
function apiKeyOk(k: any): boolean {
    if (typeof k !== "string") return false;
    try {
        const U: any = Zotero.Utilities;
        if (U && typeof U.isValidObjectKey === "function") return !!U.isValidObjectKey(k);
    }
    catch (e) {}
    return /^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$/.test(k);
}

class _PluginApiMixin {
    // ---- items as other plugins name them --------------------------------

    /** The library of a `groupID` (null: My Library), or null when no such
     *  group is in this profile. */
    _wvApiLib(groupID: number | null): number | null {
        if (groupID == null) return Zotero.Libraries.userLibraryID;
        try { return Zotero.Groups.getLibraryIDFromGroupID(groupID) || null; } catch (e) { return null; }
    }

    /** An item's `{groupID, key}`, or null (a feed's item has none). */
    _wvApiRefOf(item: any): WvApiRef | null {
        try {
            if (!item || !item.key) return null;
            if (item.libraryID === Zotero.Libraries.userLibraryID) return { groupID: null, key: item.key };
            const gid = Zotero.Groups.getGroupIDFromLibraryID(item.libraryID);
            return gid ? { groupID: gid, key: item.key } : null;
        }
        catch (e) { return null; }
    }

    /** A caller's item: `{item}` or `{error}`. A group library's items are
     *  not loaded at Zotero startup and `getByLibraryAndKey` THROWS for them
     *  until then (src-ts.md): "not-loaded", not "no-such-item". */
    _wvApiItem(v: any): { item?: any; error?: string } {
        const r = apiRef(v);
        if (!r) return { error: "bad-arguments" };
        const lib = this._wvApiLib(r.groupID);
        if (lib == null) return { error: "no-such-group" };
        let item: any = null;
        try { item = Zotero.Items.getByLibraryAndKey(lib, r.key); }
        catch (e) { return { error: "not-loaded" }; }
        return item ? { item } : { error: "no-such-item" };
    }

    /** The same for an async call: the item loaded if it was not. */
    async _wvApiItemAsync(v: any): Promise<{ item?: any; error?: string }> {
        const r = apiRef(v);
        if (!r) return { error: "bad-arguments" };
        const lib = this._wvApiLib(r.groupID);
        if (lib == null) return { error: "no-such-group" };
        let item: any = null;
        try { item = await Zotero.Items.getByLibraryAndKeyAsync(lib, r.key); }
        catch (e) { return { error: "not-loaded" }; }
        return item ? { item } : { error: "no-such-item" };
    }

    // ---- the link grammar (item 2) ---------------------------------------

    /** A Zotero link read into plain data, or null when it is not one of the
     *  forms Weavero writes or opens. The item links go through the
     *  backlinks index's own parser (`wvBlParseLink`), so this reads a link
     *  exactly as Backlinks and Links do; the collection and search links,
     *  the scope of an item link and a heading id are read here. The
     *  legacy forms (`<libraryID>_<key>`, a numeric item id) name an item
     *  in THIS profile and are resolved here. */
    _wvApiParseLink(raw: any): WvApiParsed | null {
        if (typeof raw !== "string") return null;
        let url = raw.trim();
        const m0 = API_LINK.exec(url);
        if (!m0) return null;
        // Lower-case the scheme and action only, as Zotero's handler matches
        // them (part 1's canOpenLink accepts `ZOTERO://select/...` too).
        url = "zotero://" + m0[1].toLowerCase() + url.slice(("zotero://" + m0[1]).length);
        const m = API_LINK.exec(url);
        if (!m) return null;
        const action = m[1].toLowerCase();
        const parts = m[2].split("/").filter(Boolean);
        const q = apiQuery(String(m[3] || "").replace(/&amp;/g, "&"));
        const out: WvApiParsed = { kind: action, action, groupID: null, keys: [], annotationKey: null, page: null, collectionKey: null, searchKey: null, heading: null };
        if (action === "select") {
            // The library, then a collection or search: alone it is a link to
            // that collection or search (Zotero's SelectExtension routes), with
            // `/items/<key>` it scopes the item.
            let rest = parts, gid: number | null = null;
            if (rest[0] === "groups" || rest[0] === "g") {
                if (!/^\d+$/.test(rest[1] || "")) return null;
                gid = Number(rest[1]);
                rest = rest.slice(2);
            }
            else if (rest[0] === "library") rest = rest.slice(1);
            if ((rest[0] === "collections" || rest[0] === "searches") && rest[1]) {
                if (!apiKeyOk(rest[1])) return null;
                if (rest[0] === "collections") out.collectionKey = rest[1]; else out.searchKey = rest[1];
                if (rest.length === 2 && !q.get("itemKey")) {
                    out.kind = rest[0] === "collections" ? "collection" : "search";
                    out.groupID = gid;
                    return out;
                }
            }
        }
        const p = wvBlParseLink(url);
        if (!p || !p.keys.length) return null;
        out.groupID = p.lib === "user" ? null : p.lib;
        out.annotationKey = apiKeyOk(p.annotationKey) ? p.annotationKey : null;
        out.page = p.page || null;
        for (const k of p.keys) {
            // A plain key as written; a legacy one resolved in this profile.
            if (apiKeyOk(k)) { out.keys.push(k); continue; }
            if (!/_/.test(k) && !/^\d+$/.test(k)) continue;
            const lib = this._wvApiLib(out.groupID);
            let it: any = null;
            try { it = lib != null ? (this as any)._wvResolveItemByKey(lib, k) : null; } catch (e) { it = null; }
            const r = it ? this._wvApiRefOf(it) : null;
            if (r) {
                if (out.keys.length === 0) out.groupID = r.groupID;
                out.keys.push(r.key);
            }
            else if (/_/.test(k) && apiKeyOk(k.slice(k.indexOf("_") + 1))) out.keys.push(k.slice(k.indexOf("_") + 1));
        }
        if (!out.keys.length) return null;
        const heading = q.get("wvheading");
        if (heading && out.keys.length === 1 && (action === "select" || action === "note")) {
            out.kind = "heading";
            out.heading = heading;
        }
        return out;
    }

    /** One of Weavero's links to an item, written by the builders its own
     *  "Copy ... Link" entries use (url.ts `_buildSelectLink`,
     *  `_buildOpenLink`, `_buildNoteLink`; note-nav.ts `_wvNoteHeadingLink`):
     *  never a second spelling of a link. */
    _wvApiBuildLink(args: any): { ok: boolean; url: string | null; error?: string } {
        const self: any = this;
        const fail = (error: string) => ({ ok: false, url: null, error });
        let a: any;
        try {
            if (!args || typeof args !== "object") return fail("bad-arguments");
            a = { item: args.item, form: args.form, annotationKey: args.annotationKey, collectionKey: args.collectionKey, heading: args.heading };
        }
        catch (e) { return fail("bad-arguments"); }
        const form = a.form;
        if (!["select", "open", "note", "heading"].includes(form)) return fail("bad-arguments");
        for (const k of ["annotationKey", "collectionKey", "heading"]) {
            if (a[k] != null && (typeof a[k] !== "string" || !a[k])) return fail("bad-arguments");
        }
        // Each option belongs to one form: an annotation to an open link, a
        // collection to a select link, a heading to a heading or note link.
        if (a.annotationKey != null && form !== "open") return fail("bad-arguments");
        if (a.collectionKey != null && form !== "select") return fail("bad-arguments");
        if (a.heading != null && form !== "heading" && form !== "note") return fail("bad-arguments");
        if (form === "heading" && a.heading == null) return fail("bad-arguments");
        if (!apiRef(a.item)) return fail("bad-arguments");
        const got = this._wvApiItem(a.item);
        if (!got.item) return fail(got.error || "no-such-item");
        const item = got.item;
        let url: string | null = null;
        if (form === "select") {
            let scope: any = null;
            if (a.collectionKey != null) {
                let col: any = null;
                try { col = Zotero.Collections.getByLibraryAndKey(item.libraryID, a.collectionKey); } catch (e) { col = null; }
                if (!col) return fail("no-such-collection");
                scope = { scope: self._zoteroLibPrefix(item.libraryID) + "/collections/" + col.key, libraryID: item.libraryID };
            }
            url = self._buildSelectLink(item, scope);
        }
        else if (form === "open") {
            let target = item;
            if (a.annotationKey != null) {
                let ann: any = null;
                try { ann = Zotero.Items.getByLibraryAndKey(item.libraryID, a.annotationKey); } catch (e) { ann = null; }
                if (!ann || !ann.isAnnotation() || ann.parentItemID !== item.id) return fail("no-such-annotation");
                target = ann;
            }
            url = self._buildOpenLink(target);
        }
        else {
            if (!(item.isNote && item.isNote())) return fail("not-a-note");
            if (a.heading != null) {
                // The heading's `id` in the note (Weavero gives a heading one
                // when the user copies a link to it, note-nav.ts).
                let html = "";
                try { html = String(item.getNote() || ""); } catch (e) {}
                const esc = a.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/"/g, "&quot;");
                if (!new RegExp("<h[1-6]\\b[^>]*\\bid=\"" + esc + "\"").test(html)) return fail("no-such-heading");
                url = self._wvNoteHeadingLink(item, a.heading, form === "note" ? "open" : "select");
            }
            else url = self._buildNoteLink(item);
        }
        return url ? { ok: true, url } : fail("no-link");
    }

    // ---- openLink for every scheme (item 4) -------------------------------

    /** openLink's web and app half: a link Weavero itself would draw as a
     *  link -- Links & Relations on, its scheme on in Settings (URLs, App
     *  links and each scheme: `URL_REGEX`, the ONE URL rule every surface
     *  linkifies with) -- goes through Weavero's launcher (url.ts
     *  `_launchURL`: an enabled app scheme opens without confirmation when
     *  the user asked for that, everything else through Zotero.launchURL and
     *  its prompt). True when Weavero took it; false: not a link Weavero
     *  opens, the caller opens it its own way. zotero:// is never here:
     *  version 1's path (handleZoteroURI) keeps it. */
    _wvApiOpenExternal(raw: any): boolean {
        const self: any = this;
        if (typeof raw !== "string") return false;
        const url = raw.trim();
        if (!url || /^zotero:/i.test(url)) return false;
        const m = /^([a-z][a-z0-9+.-]*):/i.exec(url);
        // What Zotero.launchURL refuses, and the browser's own schemes: never
        // a link, whatever a regex says.
        if (m && /^(?:javascript|data|chrome|resource|about|blob|jar|moz-extension|view-source)$/i.test(m[1])) return false;
        try { if (!self._getEnableLinksAndRelations()) return false; } catch (e) { return false; }
        let hit: RegExpExecArray | null = null;
        try { hit = self.URL_REGEX.exec(url); } catch (e) { hit = null; }
        if (!hit || hit.index !== 0) return false;
        self._launchURL(url);
        return true;
    }

    // ---- the reader sidebar's view (item 5) --------------------------------

    /** The view the reader tab's sidebar has selected, open or folded:
     *  Zotero's own by its name ("annotations", "outline", "thumbnails", and
     *  any view a later Zotero adds), or Weavero's -- "weavero-outline" when
     *  Weavero's outline stands in Zotero's Outline tab (the takeover,
     *  reader-panels.ts `_wvReaderActivateOutlineTakeover`), "weavero-
     *  bookmarks" for its Bookmarks tab (its sentinel `sidebarView` and the
     *  container class). Null: not a reader tab, or bad arguments. Read-only.
     *  By tab id: what a plugin holds (every reader event's `reader.tabID`,
     *  `Zotero_Tabs.selectedID`), and one per reader -- an item can be open
     *  in several. */
    _wvApiReaderSidebarView(args: any): string | null {
        let id: any;
        try { id = args && typeof args === "object" ? args.readerTabId : undefined; } catch (e) { return null; }
        if (typeof id !== "string" || !id) return null;
        let r: any = null;
        for (const x of (Zotero.Reader && Zotero.Reader._readers) || []) {
            try { if (x && x.tabID === id) { r = x; break; } } catch (e) {}
        }
        if (!r) return null;
        let sv: any = null, sc: any = null;
        try { sv = r._internalReader && r._internalReader._state && r._internalReader._state.sidebarView; } catch (e) { sv = null; }
        try { sc = r._iframeWindow && r._iframeWindow.document.getElementById("sidebarContainer"); } catch (e) { sc = null; }
        if ((sc && sc.classList.contains(RP_BM_TAB_ON)) || sv === RP_BM_SIDEBAR_VIEW) return "weavero-bookmarks";
        if (sv === "outline" && sc && sc.classList.contains(RP_OUTLINE_TAB_ON)) return "weavero-outline";
        return typeof sv === "string" && sv ? sv : null;
    }

    // ---- comment renderers (item 1) ----------------------------------------
    // A plugin that draws annotation comments itself declares the surfaces it
    // draws on, and Weavero draws no preview of its own there while the
    // declaration stands. In memory only, on this instance: never persisted,
    // gone with a Weavero restart (the caller declares again -- the api object
    // it holds is a new one), and never past the declaring plugin -- an
    // AddonManager listener drops it when that plugin is disabled, uninstalled
    // or replaced by an update (whose new startup declares again).

    /** pluginId -> the surfaces it draws, or undefined before any. */
    _wvApiCr(): Map<string, Set<string>> {
        const self: any = this;
        return self._wvApiCrMap || (self._wvApiCrMap = new Map());
    }

    /** Every surface some plugin has declared. */
    _wvApiCrTaken(): Set<string> {
        const out = new Set<string>();
        const m: Map<string, Set<string>> | undefined = (this as any)._wvApiCrMap;
        if (m) for (const s of m.values()) for (const sf of s) out.add(sf);
        return out;
    }

    /** Weavero stands down on `surface` (a declaration covers it). */
    _wvApiCommentStandsDown(surface: string): boolean {
        const m: Map<string, Set<string>> | undefined = (this as any)._wvApiCrMap;
        if (!m || !m.size) return false;
        for (const s of m.values()) if (s.has(surface)) return true;
        return false;
    }

    /** The same for a comment element Weavero is about to draw a preview
     *  in (`_renderPreviewPanel`): its surface read off the DOM, only when a
     *  declaration exists (the common case costs one size check). */
    _wvApiCommentYields(commentEl: any): boolean {
        const m: Map<string, Set<string>> | undefined = (this as any)._wvApiCrMap;
        if (!m || !m.size) return false;
        let surface = "sidebar";
        try {
            if (commentEl.closest(".annotation-popup")) surface = "popup";
            else if (commentEl.closest("annotation-row")) surface = "itemPane";
            else {
                const root = commentEl.getRootNode && commentEl.getRootNode();
                if (root && root.host && root.host.localName === "annotation-row") surface = "itemPane";
            }
        }
        catch (e) {}
        return this._wvApiCommentStandsDown(surface);
    }

    /** An item-pane comment while a plugin draws them: Zotero's text back
     *  where Weavero had drawn its own (the raw source it kept, or its link
     *  spans unwrapped), nothing else touched -- the declaring plugin's DOM
     *  is its own. Answers false (no fresh render), as the pane expects. */
    _wvApiPaneCommentRestore(commentEl: any): boolean {
        try {
            const doc = commentEl.ownerDocument;
            const raw = commentEl.getAttribute("data-wv-raw");
            if (raw !== null) {
                while (commentEl.firstChild) commentEl.removeChild(commentEl.firstChild);
                commentEl.appendChild(doc.createTextNode(raw));
            }
            else {
                for (const span of commentEl.querySelectorAll(".wv-url-span, .wv-md")) span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            for (const a of ["data-wv-raw", "data-wv-source", "data-wv-rendered"]) commentEl.removeAttribute(a);
        }
        catch (e) {}
        return false;
    }

    /** Re-run the surfaces whose stand-down changed: each pass now draws or
     *  stands down by itself (the same passes a Settings change re-runs). */
    _wvApiCommentRefresh(before: Set<string>) {
        const self: any = this;
        const after = this._wvApiCrTaken();
        const changed = (sf: string) => before.has(sf) !== after.has(sf);
        if (changed("sidebar")) { try { self._applySurfacePref("readerSidebar"); } catch (e) {} }
        if (changed("popup")) {
            for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const d = r._iframeWindow && r._iframeWindow.document;
                    if (d) for (const pop of d.querySelectorAll(".annotation-popup")) self._injectIconIntoPopup(pop, r);
                }
                catch (e) {}
            }
        }
        if (changed("itemPane")) {
            for (const w of wvMainWins()) { try { self._scanPaneRows(w.document); } catch (e) {} }
        }
    }

    /** Wire the AddonManager listener once per instance (lazily, at the
     *  first declaration); `_wvApiDestroy` gives it back. It resolves the
     *  live plugin at event time (src-ts.md). onInstalling covers an update:
     *  the old version stops, the new one declares from its own startup. */
    _wvApiWireAddons(): boolean {
        const self: any = this;
        if (self._wvApiAddonL) return true;
        let AM: any = null;
        try { AM = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager; }
        catch (e) { return false; }
        const drop = (addon: any) => {
            try {
                const lp: any = wvLivePlugin();
                if (lp && addon && addon.id) lp._wvApiCommentDrop(String(addon.id));
            }
            catch (e) {}
        };
        const l = { onDisabled: drop, onUninstalling: drop, onUninstalled: drop, onInstalling: drop };
        try { AM.addAddonListener(l); }
        catch (e) { return false; }
        self._wvApiAddonL = l;
        self._wvApiAddonM = AM;
        return true;
    }

    /** Forget `pluginId`'s declaration; true when there was one. */
    _wvApiCommentDrop(pluginId: string): boolean {
        const m: Map<string, Set<string>> | undefined = (this as any)._wvApiCrMap;
        if (!m || !m.has(pluginId)) return false;
        const before = this._wvApiCrTaken();
        m.delete(pluginId);
        this._wvApiCommentRefresh(before);
        return true;
    }

    /** declareCommentRenderer({pluginId, surfaces}): `{ok: true, surfaces}`
     *  (sorted) or `{ok: false, error}`. A second call replaces the first.
     *  The plugin must be installed and active: AddonManager answers that,
     *  asynchronously. */
    async _wvApiDeclareCommentRenderer(args: any): Promise<{ ok: boolean; surfaces?: string[]; error?: string }> {
        const self: any = this;
        const fail = (error: string) => ({ ok: false, error });
        let pluginId: any, list: any[];
        try {
            if (!args || typeof args !== "object") return fail("bad-arguments");
            pluginId = args.pluginId;
            const s = args.surfaces;
            if (!Array.isArray(s)) return fail("bad-arguments");
            list = Array.from(s);
        }
        catch (e) { return fail("bad-arguments"); }
        if (typeof pluginId !== "string" || !pluginId || pluginId === WV_BL_PLUGIN_ID) return fail("bad-arguments");
        if (!list.length || list.some((x) => typeof x !== "string" || !WV_API_COMMENT_SURFACES.includes(x))) return fail("bad-arguments");
        let addon: any = null;
        try {
            const AM = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager;
            addon = await AM.getAddonByID(pluginId);
        }
        catch (e) { addon = null; }
        if (self._wvDestroyed) return fail("not-running");
        if (!addon) return fail("unknown-plugin");
        if (!addon.isActive) return fail("inactive-plugin");
        if (!this._wvApiWireAddons()) return fail("failed");
        const set = new Set<string>(list);
        const before = this._wvApiCrTaken();
        this._wvApiCr().set(pluginId, set);
        this._wvApiCommentRefresh(before);
        return { ok: true, surfaces: Array.from(set).sort() };
    }

    /** withdrawCommentRenderer({pluginId}): `{ok: true}` (also when nothing
     *  was declared) or `{ok: false, error: "bad-arguments"}`. */
    _wvApiWithdrawCommentRenderer(args: any): { ok: boolean; error?: string } {
        let pluginId: any;
        try { pluginId = args && typeof args === "object" ? args.pluginId : undefined; }
        catch (e) { return { ok: false, error: "bad-arguments" }; }
        if (typeof pluginId !== "string" || !pluginId) return { ok: false, error: "bad-arguments" };
        this._wvApiCommentDrop(pluginId);
        return { ok: true };
    }

    // ---- the links index (item 3) --------------------------------------------
    // Backlinks and Links read from Weavero's index (backlinks.ts): built on
    // first use by two SQL scans, then kept current by Zotero's item notifier
    // -- a moment after an edit is saved, not in the same tick.

    /** `{item, scope?, limit?}` read off a caller's object: scope "own" or
     *  "subtree" (default), limit an integer 1..WV_API_LIST_MAX (default
     *  WV_API_LIST_DEFAULT). Null for bad arguments. */
    _wvApiListArgs(args: any): { item: any; scope: "own" | "subtree"; limit: number } | null {
        try {
            if (!args || typeof args !== "object") return null;
            const item = args.item, scope = args.scope, limit = args.limit;
            if (!apiRef(item)) return null;
            if (scope != null && scope !== "own" && scope !== "subtree") return null;
            if (limit != null && !(typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= WV_API_LIST_MAX)) return null;
            return { item: { groupID: item.groupID, key: item.key }, scope: scope || "subtree", limit: limit || WV_API_LIST_DEFAULT };
        }
        catch (e) { return null; }
    }

    /** A reference's address as other plugins use it: a link as written (a
     *  note's `&amp;` undone), a citation's cited-item URI; a quote has none
     *  (Weavero keys it "annotation:<key>"; its target is the annotation). */
    _wvApiRefUrl(entry: any): string | null {
        if (!entry || entry.ref === "quote") return null;
        return String(entry.url || "").replace(/&amp;/g, "&") || null;
    }

    /** getBacklinks({item, scope?, limit?}): what links the item ("subtree":
     *  its attachments, notes and annotations too, each row naming its
     *  target; "own": the item alone) -> `{ok, total, truncated,
     *  backlinks: [{source, sourceKind, target, ref, url, page, locator,
     *  excerpt: {before, match, after}, internal}]}`, in the index's order. */
    async _wvApiBacklinks(args: any): Promise<any> {
        const self: any = this;
        const fail = (error: string) => ({ ok: false, error, backlinks: [] });
        const a = this._wvApiListArgs(args);
        if (!a) return fail("bad-arguments");
        const got = await this._wvApiItemAsync(a.item);
        if (!got.item) return fail(got.error || "no-such-item");
        await self._wvBlEnsure();
        if (self._wvDestroyed) return fail("not-running");
        const rows: any[] = [];
        for (const { target, src } of self._wvBlEntries(got.item, a.scope)) {
            let s: any = null;
            try { s = Zotero.Items.get(src.srcID); } catch (e) { s = null; }
            const source = s ? this._wvApiRefOf(s) : null;
            const tref = this._wvApiRefOf(target);
            if (!source || !tref) continue;
            const ex = src.excerpt || { before: "", after: "", segs: [] };
            rows.push({
                source, sourceKind: src.kind, target: tref, ref: src.ref, url: this._wvApiRefUrl(src),
                page: src.page != null ? String(src.page) : null, locator: src.locator != null ? String(src.locator) : null,
                excerpt: { before: String(ex.before || ""), match: (ex.segs || []).filter((x: any) => x.hit).map((x: any) => x.t).join("").trim(), after: String(ex.after || "") },
                internal: !!src.internal,
            });
        }
        return { ok: true, total: rows.length, truncated: rows.length > a.limit, backlinks: rows.slice(0, a.limit) };
    }

    /** getLinksFrom({item, scope?, limit?}): the references written in the
     *  item (a note, an annotation), or in its notes and annotations
     *  ("subtree", the default, for a paper or an attachment; "own": the
     *  item alone) -> `{ok, total, truncated, links: [{source, sourceKind,
     *  ref, url, target, broken, why, page, locator, internal}]}`, each
     *  source's in text order; a broken one (its item gone, or its group not
     *  in this profile) with `target: null`. */
    async _wvApiLinksFrom(args: any): Promise<any> {
        const self: any = this;
        const fail = (error: string) => ({ ok: false, error, links: [] });
        const a = this._wvApiListArgs(args);
        if (!a) return fail("bad-arguments");
        const got = await this._wvApiItemAsync(a.item);
        if (!got.item) return fail(got.error || "no-such-item");
        await self._wvBlEnsure();
        if (self._wvDestroyed) return fail("not-running");
        const rows: any[] = [];
        for (const r of self._wvLkEntries(got.item, a.scope)) {
            const source = this._wvApiRefOf(r.src);
            if (!source) continue;
            const e = r.entry;
            rows.push({
                source, sourceKind: e.kind, ref: e.ref, url: this._wvApiRefUrl(e),
                target: r.target ? this._wvApiRefOf(r.target) : null, broken: !!r.broken, why: r.broken || null,
                page: e.page != null ? String(e.page) : null, locator: e.locator != null ? String(e.locator) : null,
                internal: !!e.internal,
            });
        }
        return { ok: true, total: rows.length, truncated: rows.length > a.limit, links: rows.slice(0, a.limit) };
    }

    /** destroy(): the AddonManager listener given back, every declaration
     *  forgotten (the surfaces are stripped by destroy's own passes). */
    _wvApiDestroy() {
        const self: any = this;
        try { if (self._wvApiAddonL && self._wvApiAddonM) self._wvApiAddonM.removeAddonListener(self._wvApiAddonL); } catch (e) {}
        self._wvApiAddonL = null;
        self._wvApiAddonM = null;
        try { if (self._wvApiCrMap) self._wvApiCrMap.clear(); } catch (e) {}
    }
}

const _pluginApiDescriptors = Object.getOwnPropertyDescriptors(_PluginApiMixin.prototype);
delete (_pluginApiDescriptors as any).constructor;
export const pluginApiMethods = _pluginApiDescriptors;
