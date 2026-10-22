// Weavero — bundled main module.
//
// `bootstrap.js` (a thin plain-JS shim) loads this file via
// `Services.scriptloader.loadSubScript` on plugin startup, then
// calls `Zotero.Weavero.hooks.onStartup({...})` to hand off the
// lifecycle. Everything that used to live at top-level in
// bootstrap.js — the constants, the `WeaveroPlugin` class, the
// startup/shutdown/onMainWindowLoad/onMainWindowUnload bodies —
// is bundled here. Module-by-module split is layered on top in
// later commits.
//
import {
    STYLE_ID, PANEL_ID,
    BTN_CLASS, BTN_TREE_CLASS, BTN_PANE_CLASS,
    BTN_POPUP_CLASS, BTN_SIDEBAR_CLASS,
    SCHEME_SVG_TEMPLATE, MENU_LABEL_PREFIXES, PLUGIN_CSS,
} from "./modules/constants";
import { makeInvisibleRe, TRAILING_RE as TRAILING_RE_LIB } from "./lib/text";
import { wvLivePlugin } from "./lib/live";
import { wvTimeout, wvClearTimeout, wvSleep } from "./lib/timers";
import { wvInjectStyle, wvRemoveStyle, wvFilterTileRules } from "./lib/style";
import { wvWrap, wvUnwrap, wvWrapLayers } from "./lib/wrap";
import { wvWhenWindowLoaded, wvBoolAttrOn, wvReaderMenuEvent, wvWithin, wvIsTextEntry, wvHtmlEl, WV_XHTML_NS } from "./lib/dom";
import { wvListen, wvUnlisten, wvUnlistenAll, wvListenKeys, wvUnlistenAllOn, wvSweepTagOnChrome } from "./lib/listen";
import { wvStoreDir, wvStorePath, wvStoreChain, wvStoreWrite, wvStoreRead, wvStoreRemove } from "./lib/store";
import { wvMainWins, wvWinType } from "./lib/windows";
import { wvAccel, wvAccelAny } from "./lib/keys";
import { wvCloneFor } from "./lib/xray";
import { wvMenuItem, wvMenuSeparator } from "./lib/menu";
import { wvSvgEl, WV_SVG_NS } from "./lib/svg";
import { wvOutsideClick, wvReachableDocs, wvDismissOff } from "./lib/dismiss";
import { wvAltReveal } from "./lib/menubar";

/** The shared helpers, published as `Zotero.Weavero.lib` so the suite can
 *  exercise them directly (they are bundled, not otherwise reachable). */
const WV_LIB = { wvLivePlugin, wvMainWins, wvWinType, wvIsTextEntry, wvAccel, wvAccelAny, wvCloneFor, wvMenuItem, wvMenuSeparator, wvSvgEl, WV_SVG_NS, wvHtmlEl, WV_XHTML_NS, WV_LINK_PALETTE, wvLinkVars, wvLinkColor, wvLinkClassRules, wvOutsideClick, wvReachableDocs, wvDismissOff, wvAltReveal, wvTimeout, wvClearTimeout, wvSleep, wvInjectStyle, wvRemoveStyle, wvFilterTileRules, wvWrap, wvUnwrap, wvWrapLayers,
    wvWhenWindowLoaded, wvBoolAttrOn, wvReaderMenuEvent, wvWithin,
    wvListen, wvUnlisten, wvUnlistenAll, wvListenKeys,
    wvStoreDir, wvStorePath, wvStoreChain, wvStoreWrite, wvStoreRead, wvStoreRemove };
import { URL_SCHEMES, urlMethods } from "./modules/url";
import { annotationMethods } from "./modules/annotation";
import { tabsMethods } from "./modules/tabs";
import { noteEditorMethods } from "./modules/note-editor";
import { readerMethods } from "./modules/reader";
import { paneMethods } from "./modules/pane";
import { filterMethods } from "./modules/filter";
import { bookmarksMethods } from "./modules/bookmarks";
import { readerPanelsMethods } from "./modules/reader-panels";
import { tabGroupsMethods } from "./modules/tab-groups";
import { sessionsMethods } from "./modules/sessions";
import { undoMethods } from "./modules/undo";
import { outlineEvalMethods } from "./modules/outline-eval";
import { attachmentsMethods } from "./modules/attachments";
import { windowWiringMethods } from "./modules/window-wiring";
import { prefsTableMethods } from "./modules/prefs-table";
import { WV_PREF_OBSERVERS } from "./modules/prefs-observers";
import { WV_LINK_PALETTE, wvLinkVars, wvLinkColor, wvLinkClassRules } from "./lib/links";

// Captured by the IIFE bundle's closure; the class methods read
// `_rootURI` to build absolute URIs for resources inside the XPI
// (icons, prefs.html, fetched assets). Set in onStartup.
let _rootURI = "";


// ===========================================================================

class WeaveroPlugin {
    // The mixin pattern (Object.defineProperties + getOwnPropertyDescriptors
    // applied below the class definition) means TS doesn't see any of the
    // ~240 methods that get glued onto the prototype at module load. Same
    // for instance fields set in the constructor \u2014 they're not declared
    // here. The index signature lets cross-mixin `this.foo()` and
    // `this._fieldName` access resolve to `any`, matching the runtime
    // shape of the assembled plugin.
    [k: string]: any;

    // Canonical definitions live in src/lib/text.ts (pure, Node-testable);
    // these instance fields are thin adapters so every existing
    // `this.INVISIBLE_RE` / `this.TRAILING_RE` site keeps working.
    // INVISIBLE_RE stays per-instance because it carries the `g` flag
    // (lastIndex state under `.test()`).
    INVISIBLE_RE = makeInvisibleRe();
    TRAILING_RE  = TRAILING_RE_LIB;


    constructor() {
        this._readerObservers = new WeakMap();
        this._notifierIDs     = [];
        this._pollInterval    = null;
        this._treeObserver    = null;
        this._treeScanTimer   = null;
        this._paneObserver    = null;
        // Window-watcher for standalone note windows (see
        // `_setupNoteWindowWatcher`). Single observer per plugin instance.
        this._wvNoteWindowObserver = null;
        // Window-watcher for the Settings window (see `_setupPrefsWindowWatcher`).
        this._wvPrefsWindowObserver = null;
        // Keys we just removed via the delete notifier. The debounced
        // _processNoteAnnotationOverlays scan that fires ~100 ms later
        // calls attachment.getAnnotations(); if Zotero's in-memory cache
        // hasn't settled yet, that call still returns the deleted
        // annotation and the badge gets recreated. We exclude these keys
        // from wantList for ~2 s, by which time the cache has caught up.
        // Map<key, timestamp>.
        this._recentlyDeletedKeys = new Map();

        // Bound shims for the reader plugin event system. Originally
        // arrow-function class fields on _ReaderMixin (see
        // _sidebarHandlerImpl / _contextHandlerImpl in modules/reader.ts);
        // arrow-field initializers don't survive the prototype-mixin
        // lift, so we instantiate the bound copies here. Same callable
        // identity across the lifetime of one plugin instance — the
        // unhook in destroy() finds them by reference equality.
        this._sidebarHandler = (event) => this._sidebarHandlerImpl(event);
        // Menu events: every appended item gets an explicit `disabled`, or
        // Zotero 11 greys it out (wvReaderMenuEvent; issue #57).
        this._contextHandler = (event) => this._contextHandlerImpl(wvReaderMenuEvent(event));
        this._viewContextHandler = (event) => this._viewContextHandlerImpl(wvReaderMenuEvent(event));
        this._toolbarHandler = (event) => this._toolbarHandlerImpl(event);
    }

    // ---- Utilities --------------------------------------------------------


    // ---- CSS injection -----------------------------------------------------

    injectStyles() {
        this.injectStylesInto(Zotero.getMainWindow().document);
    }

    /** Inject (or refresh) the Weavero stylesheet into the given
     *  document. Used by injectStyles() for the main window AND lazily
     *  by popup callers when the target document is a standalone
     *  reader window — those don't get a main-window-load hook so the
     *  styles aren't there until something pulls them in. */
    injectStylesInto(doc) {
        if (!doc) return;
        // Always remove any existing weavero-styles element first.
        // Zotero's in-place plugin upgrade flow doesn't reliably tear
        // down the previous plugin's DOM additions before the new init
        // runs — if we just `return` on existing-style, the new init
        // sees the OLD plugin's style element (with potentially stale
        // PLUGIN_CSS content from before the update) and skips. Result:
        // popup CSS rules don't match the new plugin's expectations,
        // padding/line-breaks/etc disappear until the user manually
        // disables and re-enables the plugin (which fully runs init
        // again from a clean state).
        const existing = doc.getElementById(STYLE_ID);
        if (existing) existing.remove();
        const s = doc.createElement("style");
        s.id = STYLE_ID;
        s.textContent = PLUGIN_CSS;
        (doc.head || doc.documentElement).appendChild(s);
    }

    /** Idempotent variant: only inject if the stylesheet isn't already
     *  in the document. For lazy injection at popup-open time where we
     *  don't want to thrash the existing main-window stylesheet. */
    ensureStylesIn(doc) {
        if (!doc) return;
        if (doc.getElementById(STYLE_ID)) return;
        const s = doc.createElement("style");
        s.id = STYLE_ID;
        s.textContent = PLUGIN_CSS;
        (doc.head || doc.documentElement).appendChild(s);
    }

    /** Inject the SAME tabs-menu stylesheet into a reader window, with the
     *  native panel/list ids rewritten to the reader clone's ids
     *  (#wv-window-tablist-panel / #wv-wtl-list). This is how the reader-window
     *  tabs menu is styled IDENTICALLY to the main window's from one CSS source:
     *  the menu renders via the same shared code, and this makes the same rules
     *  apply to it. Injected AFTER the reader's own styles so it wins on the few
     *  shared selectors. Idempotent. */
    ensureSharedMenuStylesIn(doc) {
        if (!doc) return;
        const ID = STYLE_ID + "-wtl";
        if (doc.getElementById(ID)) return;
        const css = PLUGIN_CSS
            .replace(/#zotero-tabs-menu-panel/g, "#wv-window-tablist-panel")
            .replace(/#zotero-tabs-menu-list/g, "#wv-wtl-list");
        const s = doc.createElement("style");
        s.id = ID;
        s.textContent = css;
        (doc.head || doc.documentElement).appendChild(s);
    }

    removeStyles() {
        try {
            const el = Zotero.getMainWindow().document.getElementById(STYLE_ID);
            if (el) el.remove();
        } catch {}
    }

    // ---- zotero:// URI dispatch --------------------------------------------

    /** Notify the user when a clicked `zotero://` link can't fully
     *  resolve — a missing item / collection / saved search, an item or
     *  collection that's in the Trash (still recoverable, distinct from
     *  permanently deleted), or a group library they aren't a member of.
     *  Always logged to the debug console; also shown as a transient
     *  in-window toast.
     *
     *  Deliberately loud/verbose for now — it fires on EVERY stale
     *  reference, including partial multi-selects (4 of 5 items found).
     *  This is the "test it broadly first" stage; once we know how
     *  often it actually fires in practice, a later version can quiet
     *  it down (a non-blocking toast, a pref, only-when-nothing-
     *  resolved, …). Only fires for links clicked inside Weavero-
     *  decorated surfaces — links clicked elsewhere go through Zotero's
     *  native handler, which stays silent. */
    _showLinkWarning(messages) {
        const arr = (Array.isArray(messages) ? messages : [messages])
            .map((m) => (m == null ? "" : String(m).trim())).filter(Boolean);
        if (!arr.length) return;
        Zotero.debug("[Weavero] link warning — " + arr.join(" | "));
        this._wvToast("Weavero — broken link", arr, {
            id: "wv-link-toast",
            accent: "amber",
            autoCloseMs: 11000,
        });
    }

    /** Self-contained DOM toast in a main window.
     *
     *  Exists because the obvious alternatives do not work here:
     *  `Zotero.ProgressWindow` renders BLANK, and `Services.prompt.alert` is
     *  suppressed whenever DevTools is attached — which includes the dev MCP
     *  bridge, so an alert-based notice would be invisible during testing and
     *  look "fixed" when it was never shown.
     *
     *  opts: { id, accent: "amber"|"info", autoCloseMs, win, onDismiss,
     *  actions }.
     *
     *  Omitting `autoCloseMs` makes the toast STICKY — it stays until clicked.
     *  That is the right default for a one-shot notice: an auto-closing toast
     *  fired during startup is trivially missed, which defeats the point.
     *
     *  `onDismiss` runs only on a real dismissal (click), never on the
     *  auto-close path, so a caller can use it to record acknowledgement.
     *
     *  `actions` — [{label, onClick}] — turns the toast into a DECISION. When
     *  present, clicking the body no longer dismisses: a toast that asks a
     *  question must not be answerable by a stray click, and the caller can
     *  leave its state pending so the question returns next start. Each action
     *  removes the toast, then runs its handler. */
    _wvToast(title, messages, opts) {
        const o = opts || {};
        const arr = (Array.isArray(messages) ? messages : [messages])
            .map((m) => (m == null ? "" : String(m).trim())).filter(Boolean);
        try {
            const win = o.win || Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return null;
            const id = o.id || "wv-toast";
            const old = doc.getElementById(id);
            if (old) { try { old.remove(); } catch (e) {} }
            // Force the HTML namespace — the main window's root element
            // is a XUL `<window>`, so a bare `createElement("div")` can
            // come out as a non-rendering XUL element on some builds.
            const box: any = wvHtmlEl(doc, "div");
            box.id = id;
            // Both palettes read on the light AND dark Zotero themes.
            const palette = o.accent === "info"
                ? ["#12385c", "#d6ecff", "#1d5c94"]
                : ["#5a3d00", "#ffe9b3", "#8a6500"];
            box.style.cssText = [
                "position:fixed", "bottom:14px", "right:14px", "z-index:2147483647",
                "max-width:420px", "padding:11px 13px", "border-radius:7px",
                "background:" + palette[0], "color:" + palette[1],
                "border:1px solid " + palette[2],
                "box-shadow:0 4px 18px rgba(0,0,0,.45)",
                "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
                "cursor:pointer", "user-select:text",
            ].join(";");
            const head: any = wvHtmlEl(doc, "div");
            head.style.cssText = "font-weight:600;margin-bottom:3px";
            head.textContent = title;
            box.appendChild(head);
            for (const m of arr) {
                const line: any = wvHtmlEl(doc, "div");
                line.style.cssText = "margin-top:2px";
                line.textContent = m;
                box.appendChild(line);
            }
            const actions = Array.isArray(o.actions) ? o.actions.filter(Boolean) : [];
            if (actions.length) {
                // A decision, not a notice: the body is inert so a stray click
                // cannot answer the question.
                const row: any = wvHtmlEl(doc, "div");
                row.style.cssText = "margin-top:9px;display:flex;gap:6px;flex-wrap:wrap";
                for (const act of actions) {
                    const b: any = wvHtmlEl(doc, "button", undefined, act.label);
                    b.style.cssText = [
                        "padding:4px 9px", "border-radius:4px", "cursor:pointer",
                        "border:1px solid " + palette[2],
                        "background:rgba(255,255,255,.10)", "color:" + palette[1],
                        "font:12px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
                    ].join(";");
                    b.addEventListener("click", (ev: any) => {
                        try { ev.stopPropagation(); } catch (e) {}
                        try { box.remove(); } catch (e) {}
                        try { if (typeof act.onClick === "function") act.onClick(); }
                        catch (e) { Zotero.debug("[Weavero] toast action err: " + e); }
                    });
                    row.appendChild(b);
                }
                box.appendChild(row);
                box.style.cursor = "default";
            }
            else {
                box.title = "Click to dismiss";
                box.addEventListener("click", () => {
                    try { box.remove(); } catch (e) {}
                    try { if (typeof o.onDismiss === "function") o.onDismiss(); }
                    catch (e) { Zotero.debug("[Weavero] toast onDismiss err: " + e); }
                });
            }
            (doc.documentElement || doc).appendChild(box);
            if (o.autoCloseMs) {
                try { win.setTimeout(() => { try { box.remove(); } catch (e) {} }, o.autoCloseMs); }
                catch (e) {}
            }
            return box;
        } catch (e) {
            Zotero.debug("[Weavero] _wvToast err: " + e);
            return null;
        }
    }

    /** Resolve an object from a link's library + key, accepting BOTH the
     *  modern bare key ("UE4GSKJF") AND the classic underscore-hash form
     *  "<libraryID>_<key>" ("1_UE4GSKJF") that legacy Better Notes and old
     *  Zotero links (stored in existing notes) still carry. Zotero's own
     *  handler resolves the prefixed form (via `parseLibraryKeyHash`);
     *  Weavero passed the whole string as the key, so every "1_KEY" link
     *  showed "broken link" (issue #14). Tries the link's own library
     *  first, then the numeric prefix as the library id. `accessor` is
     *  the `getByLibraryAndKey` of the object type (Items / Collections /
     *  Searches), so items, collections AND saved searches are all
     *  covered — not every legacy link is an item. */
    _wvResolveByKey(accessor: (l: number, k: string) => any, lib: number, rawKey: string): any {
        try {
            let o = accessor(lib, rawKey);
            if (o) return o;
            const us = rawKey.indexOf("_");
            if (us > 0) {
                const prefix = rawKey.slice(0, us);
                const bareKey = rawKey.slice(us + 1);
                if (bareKey) {
                    o = accessor(lib, bareKey);
                    if (o) return o;
                    if (/^\d+$/.test(prefix)) {
                        o = accessor(parseInt(prefix, 10), bareKey);
                        if (o) return o;
                    }
                }
            }
        } catch (e) {}
        return null;
    }
    _wvResolveItemByKey(lib: number, rawKey: string): any {
        const o = this._wvResolveByKey(
            (l, k) => Zotero.Items.getByLibraryAndKey(l, k), lib, rawKey);
        if (o) return o;
        // Oldest-style form (Zotero's SelectExtension `items/:id` route): a
        // PURE-NUMERIC id is a local database itemID, not a key. Deprecated
        // and "not consistent across synced machines", but handled for full
        // native parity.
        if (/^\d+$/.test(rawKey)) {
            try { const byId = Zotero.Items.get(parseInt(rawKey, 10)); if (byId) return byId; } catch (e) {}
        }
        return null;
    }
    _wvResolveCollectionByKey(lib: number, rawKey: string): any {
        return this._wvResolveByKey(
            (l, k) => Zotero.Collections.getByLibraryAndKey(l, k), lib, rawKey);
    }
    _wvResolveSearchByKey(lib: number, rawKey: string): any {
        return this._wvResolveByKey(
            (l, k) => Zotero.Searches.getByLibraryAndKey(l, k), lib, rawKey);
    }

    async handleZoteroURI(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const getLib = (): number => {
                if (parts[0] === "groups" || parts[0] === "g")
                    return Zotero.Groups.getLibraryIDFromGroupID(Number(parts[1])) as number;
                return Zotero.Libraries.userLibraryID;
            };
            const lastKey = parts[parts.length - 1];

            // Group-library access guard — for any select/open/note link
            // that names a `groups/<gid>` (or `g/<gid>`) library, bail
            // early with a notification if the user isn't a member of
            // that group (or the group ID is bogus). Without this the
            // key lookups below would just silently fail.
            if ((parts[0] === "groups" || parts[0] === "g")
                && /^zotero:\/\/(select|open|open-pdf|note)\b/.test(url)) {
                const gid = Number(parts[1]);
                const groupLib = Zotero.Groups.getLibraryIDFromGroupID(gid);
                if (!groupLib) {
                    this._showLinkWarning(Number.isFinite(gid)
                        ? "This link points to a group library you don't have access to (group #" + gid + ")."
                        : "This link points to a group library that couldn't be resolved.");
                    return;
                }
            }

            if (url.startsWith("zotero://select/")) {
                // Path shapes (after an optional leading `library` or
                // `groups/<gid>`):
                //   items/<itemKey>
                //   items?itemKey=<k1>,<k2>,…              ← multi-select
                //   collections/<collKey>
                //   searches/<searchKey>
                //   collections/<collKey>/items/<itemKey>            ← scoped:
                //   collections/<collKey>/items?itemKey=<k1>,<k2>      navigate
                //   searches/<searchKey>/items/<itemKey>               to the
                //   searches/<searchKey>/items?itemKey=<k1>,<k2>       coll /
                //                                                      search,
                //                                                      then
                //                                                      select
                //                                                      item(s)
                //   items/<libID>_<key>  (legacy bare form — best effort)
                const lib = getLib();
                const win  = Zotero.getMainWindow();
                const pane = Zotero.getActiveZoteroPane();
                // When the link is clicked from a note tab (or any
                // non-library tab), `selectItem` / `selectCollection`
                // affect the library tab in the background but the
                // user keeps seeing the note. Switch to the library
                // tab first so the result is visible.
                const switchToLibrary = () => {
                    try {
                        if (win.Zotero_Tabs
                            && typeof win.Zotero_Tabs.select === "function") {
                            win.Zotero_Tabs.select("zotero-pane");
                        }
                    } catch (e) {}
                };
                // ?itemKey=K1,K2,… — comma-separated keys (mirrors the
                // Zotero Web API form; this is how Zotero's own select
                // handler accepts multiple items).
                const itemKeyParam = u.searchParams.get("itemKey");
                const queryItemKeys = itemKeyParam
                    ? itemKeyParam.split(",").map(s => s.trim()).filter(Boolean)
                    : [];
                // Strip the library segment to get the object-spec part.
                let rest = parts.slice();
                if (rest[0] === "groups") rest = rest.slice(2);
                else if (rest[0] === "library") rest = rest.slice(1);
                const kind = rest[0];   // items | collections | searches
                let scopeKind: string | null = null;
                let scopeKey:  string | null = null;
                let pathItemKey: string | null = null;
                if ((kind === "collections" || kind === "searches") && rest[2] === "items") {
                    // scoped form (item key optional — may be in ?itemKey=)
                    scopeKind = kind; scopeKey = rest[1] || null; pathItemKey = rest[3] || null;
                } else if (kind === "items") {
                    pathItemKey = rest[1] || null;
                } else if (kind === "collections" && rest[1]) {
                    const col = this._wvResolveCollectionByKey(lib, rest[1]);
                    if (!col) {
                        this._showLinkWarning("The linked collection no longer exists (key " + rest[1] + ").");
                    } else {
                        let trashed = false;
                        try { trashed = !!(col as any).deleted; } catch (e) {}
                        switchToLibrary();
                        try {
                            if (pane.collectionsView
                                && typeof pane.collectionsView.selectCollection === "function") {
                                await pane.collectionsView.selectCollection(col.id);
                            }
                        } catch (e) { Zotero.debug("[Weavero] select collection err: " + e); }
                        win.focus();
                        if (trashed) {
                            this._showLinkWarning("The linked collection is in the Trash (key " + rest[1] + ").");
                        }
                    }
                    return;
                } else if (kind === "searches" && rest[1]) {
                    const search = this._wvResolveSearchByKey(lib, rest[1]);
                    if (search && pane.collectionsView
                        && typeof pane.collectionsView.selectSearch === "function") {
                        switchToLibrary();
                        await pane.collectionsView.selectSearch(search.id);
                        win.focus();
                    } else if (!search) {
                        this._showLinkWarning("The linked saved search no longer exists (key " + rest[1] + ").");
                    }
                    return;
                } else {
                    // legacy bare form — the item key is the last segment
                    pathItemKey = lastKey;
                }
                const warnings: string[] = [];
                // Resolve the target item key(s): a ?itemKey= list takes
                // precedence (multi-select), else the single path key.
                const itemKeys = queryItemKeys.length
                    ? queryItemKeys
                    : (pathItemKey ? [pathItemKey] : []);
                // Navigate to the collection / search scope first if one
                // was given AND it still exists. A DELETED collection
                // doesn't break the link — we just skip the navigate
                // step and select the item(s) from wherever they land.
                switchToLibrary();
                if (scopeKind === "collections" && scopeKey) {
                    try {
                        const col = this._wvResolveCollectionByKey(lib, scopeKey);
                        let colTrashed = false;
                        try { colTrashed = !!(col && (col as any).deleted); } catch (e) {}
                        if (col && !colTrashed && pane.collectionsView
                            && typeof pane.collectionsView.selectCollection === "function") {
                            await pane.collectionsView.selectCollection(col.id);
                        } else if (!col) {
                            warnings.push("The collection in this link no longer exists (key "
                                + scopeKey + ") — selecting the item(s) without it.");
                        } else if (colTrashed) {
                            warnings.push("The collection in this link is in the Trash (key "
                                + scopeKey + ") — selecting the item(s) without it.");
                        }
                    } catch (e) { Zotero.debug("[Weavero] select scope-collection err: " + e); }
                } else if (scopeKind === "searches" && scopeKey) {
                    try {
                        const search = this._wvResolveSearchByKey(lib, scopeKey);
                        if (search && pane.collectionsView
                            && typeof pane.collectionsView.selectSearch === "function") {
                            await pane.collectionsView.selectSearch(search.id);
                        } else if (!search) {
                            warnings.push("The saved search in this link no longer exists (key "
                                + scopeKey + ") — selecting the item(s) without it.");
                        }
                    } catch (e) { Zotero.debug("[Weavero] select scope-search err: " + e); }
                }
                const ids: number[] = [];
                const missingKeys: string[] = [];
                const trashedKeys: string[] = [];
                for (const k of itemKeys) {
                    const it = this._wvResolveItemByKey(lib, k);
                    if (!it) { missingKeys.push(k); continue; }
                    let trashed = false;
                    try { trashed = !!(it as any).deleted; } catch (e) {}
                    if (trashed) trashedKeys.push(k);
                    ids.push(it.id);
                }
                if (missingKeys.length) {
                    const list = missingKeys.join(", ");
                    if (!ids.length) {
                        warnings.push(missingKeys.length > 1
                            ? "None of the " + missingKeys.length + " linked items exist anymore (" + list + ")."
                            : "The linked item no longer exists (key " + list + ").");
                    } else {
                        warnings.push(missingKeys.length + " of " + itemKeys.length
                            + " linked items no longer exist (" + list + ") — selected the rest.");
                    }
                }
                if (trashedKeys.length) {
                    const list = trashedKeys.join(", ");
                    warnings.push(trashedKeys.length > 1
                        ? trashedKeys.length + " of the linked items are in the Trash (" + list + ")."
                        : "The linked item is in the Trash (key " + list + ").");
                }
                // If a scope was navigated to, leave the view there; the
                // (possibly trashed) item still gets selected within it
                // if Zotero can. Otherwise: if EVERY resolved item is
                // trashed, switch to the Trash view so the selection
                // below actually highlights them (the library/collection
                // views hide trashed items).
                if (!scopeKind && trashedKeys.length && trashedKeys.length === ids.length
                    && pane.collectionsView) {
                    try {
                        if (typeof pane.collectionsView.selectTrash === "function") {
                            await pane.collectionsView.selectTrash(lib);
                        } else if (typeof pane.collectionsView.selectByID === "function") {
                            await pane.collectionsView.selectByID("T" + lib);
                        }
                    } catch (e) { Zotero.debug("[Weavero] select-trash err: " + e); }
                }
                if (ids.length > 1 && typeof pane.selectItems === "function") {
                    await pane.selectItems(ids);
                    win.focus();
                } else if (ids.length >= 1 && typeof pane.selectItem === "function") {
                    await pane.selectItem(ids[0]);
                    win.focus();
                }
                if (warnings.length) this._showLinkWarning(warnings);
                return;
            }
            if (url.startsWith("zotero://open")) {
                // Legacy ZotFile form (per Zotero's OpenExtension):
                //   zotero://open-pdf/[libraryID]_[key]/[page]
                // The page is a PATH segment, not ?page=, and the key sits in
                // parts[0] as the underscore-hash form — so the normal lastKey
                // grab returns the PAGE, not the key. Detect it: two path
                // segments, the first an underscore key, the second numeric,
                // with no library/groups/items structure.
                let openItem: any = null;
                let zotfilePage: string | null = null;
                if (parts.length === 2 && /_/.test(parts[0]) && /^\d+$/.test(parts[1])
                    && parts[0] !== "library" && parts[0] !== "groups") {
                    openItem = this._wvResolveItemByKey(getLib(), parts[0]);
                    if (openItem) zotfilePage = parts[1];
                }
                const item = openItem || this._wvResolveItemByKey(getLib(), lastKey);
                if (!item) {
                    this._showLinkWarning("The file this link points to no longer exists (key "
                        + (openItem === null && zotfilePage === null ? lastKey : parts[0]) + ").");
                    return;
                }
                let openTrashed = false;
                try { openTrashed = !!(item as any).deleted; } catch (e) {}
                const loc: any = {};
                const page = zotfilePage !== null ? zotfilePage : u.searchParams.get("page");
                const ann  = u.searchParams.get("annotation");
                // `cfi` (EPUB) / `sel` (snapshot) → a `position` of the
                // same shape Zotero's `OpenExtension` builds. `searchParams`
                // already URL-decodes the value, so don't decodeURIComponent
                // it again (OpenExtension does because it parses the query
                // string by hand). When both `page` and a position are
                // present we keep both (the reader prefers the position).
                const cfi = u.searchParams.get("cfi");
                const sel = u.searchParams.get("sel");
                if (page !== null) loc.pageIndex = Number(page) - 1;
                if (ann) loc.annotationID = ann;
                if (cfi) {
                    loc.position = {
                        type: "FragmentSelector",
                        conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html",
                        value: cfi,
                    };
                } else if (sel) {
                    loc.position = { type: "CssSelector", value: sel };
                }
                // `wvpos` — a PDF position (pageIndex + rects) that Zotero's
                // own OpenExtension has no vocabulary for. Handing it through
                // as `location.position` makes the reader's native navigate()
                // scroll to it AND flash it via `_highlightPosition()`, exactly
                // as an annotation link would. Wins over a bare `page` (which
                // is emitted alongside so a plain Zotero still lands close).
                const wvpos = u.searchParams.get("wvpos");
                this._wvLinkRing("handleZoteroURI: open branch, wvpos="
                    + (wvpos ? "yes(" + wvpos.length + ")" : "NO")
                    + " page=" + String(page));
                let wvHighlight: any = null;
                let wvHighlightKind: string | null = null;
                if (wvpos) {
                    const dec = this._wvDecodeSelectionPos(wvpos);
                    if (dec && dec.position) {
                        // DELIBERATELY not `loc.position`. Handing the position
                        // to the reader makes it centre the target AND run its
                        // own _highlightPosition() with our chrome-built object
                        // -- which paints nothing and, running after ours,
                        // wipes the good highlight. Let it open on `page` only;
                        // Weavero then does the scroll (quarter rule) and the
                        // highlight itself, from the view's own compartment.
                        wvHighlight = dec.position;
                        wvHighlightKind = dec.kind || null;
                    }
                }
                const location = Object.keys(loc).length ? loc : null;
                // Mirror Zotero's own zotero://open / zotero://open-pdf
                // handler (ZoteroProtocolHandler `OpenExtension` →
                // `Zotero.FileHandlers.open`): PDF / EPUB / HTML-snapshot
                // attachments open in Zotero's reader (or the user's
                // configured external reader), and every other file type
                // (images, .docx, .zip, …) opens with the OS default
                // app — exactly like double-clicking the attachment.
                // Before v0.8.5 this branch always called Reader.open,
                // which silently no-op'd for non-reader files. Fall back
                // to Reader.open on builds without `FileHandlers`.
                try {
                    if ((Zotero as any).FileHandlers
                        && typeof (Zotero as any).FileHandlers.open === "function") {
                        await (Zotero as any).FileHandlers.open(item, { location });
                    } else {
                        await Zotero.Reader.open(item.id, location as any);
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] zotero://open dispatch err: " + e);
                    try { await Zotero.Reader.open(item.id, location as any); } catch (e2) {}
                }
                // Repaint the highlight from the VIEW's own compartment: the
                // reader's native _highlightPosition() stores whatever it is
                // given, and a chrome-built position reads as empty there, so
                // the link landed on the words with no highlight.
                if (wvHighlight) {
                    this._wvLinkRing("handleZoteroURI: scheduling highlight item=" + item.id);
                    try { this._wvHighlightAfterOpen(item.id, wvHighlight, 0, wvHighlightKind || undefined); } catch (e) {
                        this._wvLinkRing("handleZoteroURI: schedule threw " + e);
                    }
                }
                if (openTrashed) {
                    this._showLinkWarning("The linked file's attachment is in the Trash (key "
                        + lastKey + ") — opened anyway.");
                }
                return;
            }
            if (url.startsWith("zotero://note/")) {
                // Defer to the registered `zotero://note` extension (Better Notes) —
                // but via the protocol handler's INTERNAL doAction, NOT
                // Zotero.launchURL. launchURL routes zotero:// through the OS
                // external-protocol handler, which pops the "Allow this site to open
                // the zotero link with Zotero?" dialog AND drops BN's full feature set
                // (`?line=N`, `?section=NAME`, `#selectionText`). doAction runs the
                // extension in-process — no dialog, full features. This mirrors how
                // ZoteroPane.loadURI dispatches no-content zotero: URLs. (Before notes
                // defaulted ON in v0.14.2, Weavero never intercepted these links, so BN
                // handled them itself; the launchURL path was what broke them.)
                try {
                    const handler: any = Services.io.getProtocolHandler("zotero").wrappedJSObject;
                    const nsIURI = Services.io.newURI(url, null, null);
                    const ext = (handler && typeof handler.getExtension === "function")
                        ? handler.getExtension(nsIURI) : null;
                    if (ext && ext.noContent && typeof ext.doAction === "function") {
                        ext.doAction(nsIURI);
                        return;
                    }
                } catch (e) {}
                // No external `zotero://note` extension registered — handle
                // the basic note-open ourselves. URL format (matches the
                // shape Better Notes emits, so legacy links keep working):
                //   zotero://note/<u | groupID | "g" | "groups"/<id>>/<key>/
                // Parse with the same `pop noteKey, pop libToken` pattern
                // Better Notes uses.
                const noteKey = parts[parts.length - 1];
                const libToken = parts.length >= 2 ? parts[parts.length - 2] : "";
                let key: string | undefined;
                let lib: number | undefined;
                if (libToken === "u") {
                    lib = Zotero.Libraries.userLibraryID;
                    key = noteKey;
                }
                else if (libToken === "g" || libToken === "groups") {
                    lib = Zotero.Groups.getLibraryIDFromGroupID(Number(parts[parts.length - 1]))
                        || Zotero.Libraries.userLibraryID;
                    key = lastKey;
                }
                else if (/^\d+$/.test(libToken)) {
                    lib = Zotero.Groups.getLibraryIDFromGroupID(Number(libToken))
                        || Zotero.Libraries.userLibraryID;
                    key = noteKey;
                }
                else {
                    lib = Zotero.Libraries.userLibraryID;
                    key = lastKey;
                }
                if (!key) return;
                const note = this._wvResolveItemByKey(lib, key);
                if (!note) {
                    this._showLinkWarning("The note this link points to no longer exists (key " + key + ").");
                    return;
                }
                let noteTrashed = false;
                try { noteTrashed = !!(note as any).deleted; } catch (e) {}
                const win  = Zotero.getMainWindow();
                const pane = win.ZoteroPane;
                try {
                    if (typeof pane.openNote === "function") await pane.openNote(note.id);
                    else if (typeof pane.openNoteWindow === "function") await pane.openNoteWindow(note.id);
                    else await pane.selectItem(note.id);
                    win.focus();
                } catch { await pane.selectItem(note.id); win.focus(); }
                if (noteTrashed) {
                    this._showLinkWarning("The linked note is in the Trash (key " + key + ") — opened anyway.");
                }
                return;
            }
            Zotero.launchURL(url);
        } catch (err) {
            Zotero.debug("[Weavero] handleZoteroURI error: " + err.message);
        }
    }





    // ---- Settings ---------------------------------------------------------

    _getInlineLinks() {
        return this._wvPref("inlineLinks");
    }

    // ---- Per-surface enable/disable prefs ---------------------------------
    // The user can independently enable each of the four surfaces where we
    // decorate annotation comments. All default to true.
    _getEnableItemsList() {
        return this._wvPref("enableItemsList");
    }
    _getEnableRightPane() {
        return this._wvPref("enableRightPane");
    }
    /** Show the per-annotation Added By badge in the items tree.
     *  Effective only in group libraries (the underlying field is
     *  empty in My Library). Default ON.
     *  Tab 3 (Visual extras) — gated by enableVisualExtras. */
    _getEnableAnnotationAddedBy() {
        return this._wvPref("enableAnnotationAddedBy");
    }
    /** Tint the Added By column text and annotation badge with a
     *  per-user color (hashed from the user name into a small palette
     *  via `_colorForUser`). Default ON.
     *  Tab 3 (Visual extras) — gated by enableVisualExtras. */
    _getEnableAddedByColors() {
        return this._wvPref("enableAddedByColors");
    }
    /** Notes — standalone + child note items across every surface
     *  (items-tree note rows, right-pane Notes box, the note editor
     *  in both the right pane and the pop-out note window). Default ON
     *  (cascades from the Links and Relations section master). */
    _getEnableNotes() {
        return this._wvPref("enableNotes");
    }
    /** Notes — context notes pane (the "All Notes" list: note-row titles /
     *  bodies + right-pane notes-box labels). Default ON. */
    _getEnableNotesPane() {
        return this._wvPref("enableNotesPane");
    }
    /** Notes — note-item title cells in the items list. Default ON. */
    _getEnableNotesList() {
        return this._wvPref("enableNotesList");
    }
    /** Ctrl/Cmd+click split orientation when no split is open yet:
     *  "horizontal" (default) or "vertical". */
    _getCtrlClickSplit() {
        try {
            const v = Zotero.Prefs.get("weavero.ctrlClickSplit");
            return v === "vertical" ? "vertical" : "horizontal";
        } catch (e) { return "horizontal"; }
    }
    /** Reader sidebar — the annotation list on the left side of the
     *  reader. Format-agnostic (PDF / EPUB / snapshot). */
    _getEnableReaderSidebar() {
        return this._wvPref("enableReaderSidebar");
    }

    /** Reader document view — the page area where the document renders.
     *  Covers in-document annotation popups and the link badges drawn
     *  over annotation icons. Format-agnostic. */
    _getEnableReaderView() {
        return this._wvPref("enableReaderView");
    }

    /** Sub-toggle of enableReaderView. When false, badges (.wv-marker-badge)
     *  and floating text-annotation buttons (.wv-text-annotation-btn) are NOT
     *  drawn over the document. In-document annotation popups (the small
     *  popup that shows when the user clicks an annotation) still receive
     *  URL / markdown rendering. Default true. */
    _getEnableReaderViewIcons() {
        return this._wvPref("enableReaderViewIcons");
    }
    /** Standalone (NOT gated by any master): when on, clicking a
     *  PDF outline entry flashes the target HEADING TEXT — recovered from the
     *  page for embedded outlines (which only store a point), or used directly
     *  for extracted ones — with a consistent reset-on-each-click timer that
     *  also works around Zotero's native rapid-click highlight bug. Read at
     *  click time by the reader navigate hook. Default ON (no longer
     *  experimental). */
    _getEnableOutlineTextHighlight() {
        return this._wvPref("enableOutlineTextHighlight");
    }
    /** The annotations-pane funnel itself (issue #43). Default ON; gated by
     *  the Filters master like the reader funnel. */
    _getEnableAnnPaneFilter() {
        return this._wvPref("enableAnnPaneFilter");
    }
    /** The folded state of Zotero's own selector (colours / tags / authors)
     *  at the foot of the annotations pane: the handle's state, global and
     *  kept across restarts, moved by the handle alone -- no Settings box
     *  since 0.22.2 (MJT 2026-10-14: "the settings should enable the
     *  feature, not work as a toggle"; `annSelectorHandle` below is the
     *  box). Default OFF since 0.22.2: shown, with the pill, and remembered
     *  as the user leaves it (MJT 2026-10-14) -- up to 0.22.1 the default
     *  HID the selector outright (the "Hide Zotero's selector" box, on).
     *  (Was `showNativeAnnSelector`, default OFF, until v0.20.1 -- a "Keep"
     *  box that starts unticked read as a broken setting; MJT 2026-09-21.
     *  Carried over once at startup.) */
    _getHideNativeAnnSelector() {
        return this._wvPref("hideNativeAnnSelector");
    }
    /** View -> Layout -> Colour and Tag Selector in a reader tab (MJT
     *  2026-10-14: "disable the Colour and Tag Selector completely, not just
     *  collapse it. Same as in the My Library tab"): the selector gone
     *  entirely, handle included -- the menu's own state, global and kept
     *  across restarts, no Settings box (the library's Tag Selector state is
     *  Zotero's zotero-persist). Default OFF (shown). Applied only while the
     *  Layout feature is on. */
    _getAnnSelectorHidden() {
        return this._wvPref("annSelectorHidden");
    }
    /** Issue #58: the handle on Zotero's selector at the foot of the
     *  annotations pane (Settings -> Reader annotations pane, default ON).
     *  Off: Zotero's selector as Zotero draws it, always shown. Callers
     *  cascade from the Filters master. */
    _getAnnSelectorHandle() {
        return this._wvPref("annSelectorHandle");
    }
    /** Global default for the annotations-list funnel (issue #43): whether
     *  an annotation TYPE shows in the reader's sidebar list. Default ON. A
     *  per-document departure (`listHide` in ann-order.json) wins;
     *  `_wvAnnListHidden` resolves the two. */
    _getAnnListShow(type: string) {
        return this._wvPref("annListShow" + type.charAt(0).toUpperCase() + type.slice(1));
    }
    /** Global default for the "p. N" labels in the Outline tab (issue #42).
     *  Default ON. A per-document override (`_wvOutlineFileSettings`) wins;
     *  `_wvOutlinePagesShown` resolves the two. */
    _getOutlinePageNumbers() {
        return this._wvPref("outlinePageNumbers");
    }
    /** Global default for the "p. N" labels in the reader's Bookmarks tab.
     *  Default ON. A per-document override (outlines.json settings ->
     *  `bmPageNumbers`) wins; `_wvBmPagesShown` resolves the two. */
    _getBookmarkPageNumbers() {
        return this._wvPref("bookmarkPageNumbers");
    }

    /** Render markdown directly inside annotation comments. Sub-toggle of
     *  Inline mode (only effective when _getInlineLinks() is also true).
     *  Default true. */
    _getEnableCommentMarkdown() {
        return this._wvPref("enableCommentMarkdown");
    }

    /** Render URLs as coloured/clickable spans directly inside annotation
     *  comments. Sub-toggle of Inline mode (only effective when
     *  _getInlineLinks() is also true). Default true. */
    _getEnableInlineUrls() {
        return this._wvPref("enableInlineUrls");
    }

    /* Icon & Popup mode's content toggles. Settings shows ONE checkbox per
     * content type (URLs / App links / Markdown) for both display modes, so
     * the icon mode reads that same pref. It used to read a hidden copy
     * (enableIconUrls / enableIconMarkdown / enableIconAppLinks) that the
     * Settings pane dual-wrote and "healed" whenever it opened: a copy that
     * drifted (an older build) silently decided the icon mode until Settings
     * was opened, which then rewrote it (MJT 2026-10-13: one pref, survey
     * §3.5). The copies are no longer read or written. */

    /** Chain icon on URL-bearing comments (Icon & Popup mode). */
    _getEnableIconUrls() {
        return this._getEnableInlineUrls();
    }

    /** Chain icon on markdown-bearing comments (Icon & Popup mode): the popup
     *  is the only access to formatted markdown there. */
    _getEnableIconMarkdown() {
        return this._getEnableCommentMarkdown();
    }

    /** Chain icon on app-link-bearing comments (mailto:, obsidian://, ...):
     *  the App links switch itself (it also keeps app schemes out of
     *  URL_REGEX when off). */
    _getEnableIconAppLinks() {
        return this._wvPref("enableAppLinks");
    }

    /** True when markdown rendering is on for AT LEAST ONE surface.
     *  Used by _commentHasIconableContent to decide whether markdown markers
     *  count as "iconable" — if neither popup nor inline rendering will
     *  format them, the marks are just text. */
    _anyMarkdownEnabled() {
        // The popup always renders markdown (the `enableMarkdown` toggle went
        // away in v0.0.161), so markdown is always rendered somewhere.
        return true;
    }

    /** Compact title bar — hide the menubar row in the main window and move
     *  the window controls into the tab strip (Firefox-style "tabs in
     *  titlebar"). Default OFF: existing users keep the standard menubar
     *  unless they explicitly opt in. Mac-excluded by the apply method.
     *
     *  Reads tolerate the pref being stored as either a bool (Prefs.set
     *  with a boolean — the normal path) OR a string (some external tools
     *  write `"true"` / `"false"`). Without the string check, `!!"false"`
     *  evaluates to `true` and the feature silently stays on. */
    /** Section master for the "Tabs and Windows" settings group. Default ON.
     *  Functionally gates every feature in that section (Hide Title Bar,
     *  Multiple main windows, reader item pane) — turning it off disables
     *  them all, mirroring how the other section masters behave. */
    _getTabsAndWindowsMaster() {
        return this._wvPref("enableTabsAndWindows");
    }

    /** Master toggle for "Hide title bar (Firefox-style)". Default ON.
     *  Scoped to a window type by the two child getters below.
     *  Cascades from the Tabs and Windows section master. */
    _getCompactTitleBar() {
        return this._wvPref("compactTitleBar");
    }

    /** "Open notes in a tab-hosting window" (child of Hide Title Bar). Default
     *  ON. Read at the note-open redirect + session restore. */
    _getNoteOpenInDeckWindow() {
        return this._wvPref("noteOpenInDeckWindow");
    }

    /** THE switch for a second main window: the Tabs and Windows master AND
     *  Multiple main windows. Every route goes through it -- Ctrl+N, the
     *  hamburger, File -> New Main Window, the tab and item menus' New
     *  Window, Advanced Search in a new window (gesture, Edit entry,
     *  shortcut), the restart restore. Until v0.20.2 the switch hid two menu
     *  entries and nothing else; Ctrl+N and the hamburger had been added
     *  after the flag and never wired to it (MJT, 2026-09-22: a switch that
     *  means what it says, with its dependants nested under it again). */
    _wvMultiMainOn() {
        try { return !!(this._getTabsAndWindowsMaster() && this._getNewMainWindow()); }
        catch (e) { return false; }
    }

    /** Zotero's own Advanced Search shortcut (Ctrl+Shift+F / ⇧⌘F) opens the
     *  search in a NEW main window instead of this one. Default ON (MJT,
     *  2026-09-22 -- it began opt-in as a remap of a Zotero-wide key); a
     *  child of Multiple main windows (see `_wvMultiMainOn`). Forum 518424
     *  (dclunie): "the separate Advanced Search window that is critical to
     *  my workflow" -- with this on the old reflex works again (a remap, not
     *  a fourth chord; MJT, 2026-09-22). */
    _getAdvSearchShortcutNewWindow() {
        return this._wvPref("advSearchShortcutNewWindow");
    }

    /** The Advanced Search window opens with its side panes hidden -- no
     *  collections pane, no item pane -- so it reads as the old separate
     *  search window: conditions and results (MJT, 2026-09-22). Default ON
     *  (MJT, same day: "This should be the default"); a child of Multiple
     *  main windows, applied only when that window opens (View -> Layout
     *  shows a pane again for that window). */
    _getAdvSearchWindowHidePanes() {
        return this._wvPref("advSearchWindowHidePanes");
    }

    /** Collapse / expand button for the collections pane (Extras, default
     *  ON): the library's left pane had no toggle where the item pane and
     *  both reader panes have one (MJT, 2026-09-22). Cascades from the
     *  Extras master. */
    /** The collections-tree reading aids (pinned parents, full-path
     *  tooltip, indent guides): each default ON, cascading from Extras. */
    _getCollectionsTreeAid(key: string) {
        return this._wvPref(key);
    }

    _getCollectionsPaneToggle() {
        return this._wvPref("collectionsPaneToggle");
    }

    /** View -> Layout follows the tab (zotero#2814, MJT 2026-10-14): in a
     *  reader or note tab the submenu shows the READER's panes, and a
     *  separate reader window gets a Layout submenu of its own. Extras,
     *  default ON; off = Zotero's menu untouched. Cascades from Extras. */
    _getReaderLayoutMenu() {
        return this._wvPref("readerLayoutMenu");
    }

    /** Issue #58: the pill on the Tag Selector's splitter that collapses or
     *  expands it (Extras -> Collections pane, default ON). Cascades from
     *  Extras. */
    _getTagSelectorHandle() {
        return this._wvPref("tagSelectorHandle");
    }

    /** Dragging a side pane's splitter stops at the pane's minimum width
     *  instead of snapping it shut, like the reader window's panes (Extras,
     *  default ON; MJT 2026-09-23). Both library panes: collapsing stays one
     *  click away -- the collections pane has Weavero's button, the item
     *  pane Zotero's own sidenav toggle -- and View -> Layout. Deliberately
     *  NOT tied to the collections-pane button. Cascades from Extras. */
    _getPaneDragNoCollapse() {
        return this._wvPref("paneDragNoCollapse");
    }

    /** Whether the "Multiple main windows" feature is on (default ON). Callers
     *  still cascade from the Tabs and Windows section master. The pref dropped
     *  its historical "dev" prefix when the feature graduated from experimental
     *  (2026-07-24, weavero.devNewMainWindow -> weavero.newMainWindow); a startup
     *  migration in _wvRegisterDefaultPrefs carries a user's old value over. */
    _getNewMainWindow() {
        return this._wvPref("newMainWindow");
    }

    /** Child pref read: master must be on AND the named child not explicitly
     *  unticked. Children default ON, so enabling the master applies to both
     *  the main window and reader windows unless one is unchecked. */
    _getCompactTitleBarChild(name: string) {
        return this._wvPref(name);
    }

    /** Hide the title bar in the MAIN window (Firefox-style). */
    _getCompactTitleBarMain() { return this._getCompactTitleBarChild("compactTitleBarMain"); }

    /** Apply the Firefox-style to standalone READER windows: the title bar
     *  becomes a tab strip (with the window buttons) and the menu bar is
     *  hidden. */
    _getCompactTitleBarReader() { return this._getCompactTitleBarChild("compactTitleBarReader"); }

    /** Apply the Firefox-style to standalone NOTE windows: same treatment as
     *  the reader-window child. */
    _getCompactTitleBarNote() { return this._getCompactTitleBarChild("compactTitleBarNote"); }

    /** Draw the Plugins Manager's title bar the same way (issue #50, MJT
     *  2026-10-05: "behave together with the option to Hide Title Bar").
     *  Off: the manager keeps its native title bar and menu bar. */
    _getCompactTitleBarPluginsManager() { return this._getCompactTitleBarChild("compactTitleBarPluginsManager"); }

    /** Register a window-watcher that detects new standalone note windows
     *  (windowtype "zotero:note") and applies the Firefox-style strip if
     *  `compactTitleBarNote` is on. Also scans any already-open note
     *  windows so a plugin reload picks them up immediately. The teardown
     *  hook is `_teardownNoteWindowWatcher`. */
    _setupNoteWindowWatcher() {
        try {
            if (this._wvNoteWindowObserver) return;
            const tryApply = (win: any) => {
                try {
                    const doc = win && win.document;
                    if (!doc || !doc.documentElement) return;
                    if (wvWinType(doc) !== "zotero:note") return;
                    this._ensureNoteWindowTabStrip(win);
                } catch (e) {}
            };
            const obs = {
                observe: (subject: any, topic: string) => {
                    if (topic !== "domwindowopened") return;
                    try {
                        const win: any = subject;
                        // Wait until the window is loaded — windowtype + menubar
                        // aren't reliable mid-init.
                        win.addEventListener("load", () => {
                            // Give Zotero one tick to finish its own init bits.
                            try { win.setTimeout(() => tryApply(win), 0); } catch (e) { tryApply(win); }
                        }, { once: true });
                    } catch (e) {}
                },
            };
            (Services as any).ww.registerNotification(obs);
            this._wvNoteWindowObserver = obs;
            // Also scan existing windows.
            try {
                const en = (Services as any).wm.getEnumerator(null);
                while (en.hasMoreElements()) tryApply(en.getNext());
            } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _setupNoteWindowWatcher err: " + e);
        }
    }

    /** Unregister the note-window watcher and revert the strip on any
     *  currently open note windows. */
    _teardownNoteWindowWatcher() {
        try {
            if (this._wvNoteWindowObserver) {
                try { (Services as any).ww.unregisterNotification(this._wvNoteWindowObserver); } catch (e) {}
                this._wvNoteWindowObserver = null;
            }
            const en = (Services as any).wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try {
                    if (!w || !w.document) continue;
                    if (wvWinType(w) !== "zotero:note") continue;
                    this._removeNoteWindowTabStrip(w);
                } catch (e) {}
            }
        } catch (e) {
            Zotero.debug("[Weavero] _teardownNoteWindowWatcher err: " + e);
        }
    }

    /** Zotero's Settings search box sits at the far right of its full-width
     *  row (`#prefs-search { margin-inline-start: auto }`, preferences.scss)
     *  while every pane caps its width (`#prefs-content > * { max-width:
     *  800px; margin: 5px 15px }`), so on a wide window the box floats far
     *  from the content it searches (MJT 2026-10-20). Cap the row to the
     *  content column: max-width + the column's start margin + the row's own
     *  end padding + the box's own end margin, read from the live rules
     *  through a probe child so an upstream change to the constants carries
     *  over (827 px today). A
     *  window-level style, not the pane script's: that script runs only once
     *  the Weavero pane is shown. Visual Extras master only.
     *  Guard: test/prefs-search-align.spec.js. */
    _wvPrefsAlignSearch(win: any) {
        try {
            const doc = win && win.document;
            if (!doc || !doc.documentElement || wvWinType(doc) !== "zotero:pref") return;
            if (doc.getElementById("wv-prefs-search-align")) return;
            const row = doc.getElementById("prefs-search-container");
            const box = doc.getElementById("prefs-search");
            const content = doc.getElementById("prefs-content");
            if (!row || !box || !content) return;
            let width = NaN;
            const probe = wvHtmlEl(doc, "div", undefined, undefined, content);
            try {
                const cs = win.getComputedStyle(probe), rs = win.getComputedStyle(row), bs = win.getComputedStyle(box);
                // 800 + 15 + 8 + the box's own 4 px end margin (Zotero 11) = 827.
                width = parseFloat(cs.maxWidth) + parseFloat(cs.marginInlineStart)
                    + parseFloat(rs.paddingInlineEnd) + parseFloat(bs.marginInlineEnd);
            } finally { probe.remove(); }
            if (!(width > 0)) width = 827;
            const st = wvHtmlEl(doc, "style");
            st.id = "wv-prefs-search-align";
            // border-box: the cap is the row's outer width, padding included
            // (content-box put the box 8 px past the column, runner 2026-10-20).
            st.textContent = "#prefs-search-container { max-width: " + width + "px; box-sizing: border-box; }";
            doc.documentElement.appendChild(st);
        } catch (e) { Zotero.debug("[Weavero] _wvPrefsAlignSearch err: " + e); }
    }

    _wvPrefsUnalignSearch(win: any) {
        try {
            const st = win && win.document && win.document.getElementById("wv-prefs-search-align");
            if (st) st.remove();
        } catch (e) {}
    }

    /** Every open Settings window (windowtype "zotero:pref"). */
    _wvPrefsWindows(fn: (w: any) => void) {
        try {
            const en = (Services as any).wm.getEnumerator("zotero:pref");
            while (en.hasMoreElements()) { try { fn(en.getNext()); } catch (e) {} }
        } catch (e) {}
    }

    /** Watcher for the Settings window: `_wvPrefsAlignSearch` on each of its
     *  DOCUMENTS as it loads, and on any already open (plugin reload).
     *  Per document, not per window (the note-window watcher's
     *  domwindowopened): Zotero.PreferencePanes reloads every open Settings
     *  window whenever a pane is registered or unregistered
     *  (_refreshPreferences -> win.location.reload()), so a plugin reload,
     *  update or disable replaces the document under the style and the
     *  window watcher hears nothing -- the cap vanished on every reload with
     *  Settings open (2026-10-20). "chrome-document-global-created" fires for
     *  each new chrome document's window; the windowtype check is in the
     *  apply. Teardown: `_teardownPrefsWindowWatcher`. */
    _setupPrefsWindowWatcher() {
        try {
            if (this._wvPrefsWindowObserver) return;
            const tryApply = (win: any) => {
                try { if (this._getEnableVisualExtras()) this._wvPrefsAlignSearch(win); } catch (e) {}
            };
            const obs = {
                observe: (subject: any, topic: string) => {
                    if (topic !== "chrome-document-global-created") return;
                    try {
                        const win: any = subject;
                        if (!win || typeof win.addEventListener !== "function") return;
                        win.addEventListener("load", () => {
                            try { win.setTimeout(() => tryApply(win), 0); } catch (e) { tryApply(win); }
                        }, { once: true });
                    } catch (e) {}
                },
            };
            Services.obs.addObserver(obs as any, "chrome-document-global-created");
            this._wvPrefsWindowObserver = obs;
            this._wvPrefsWindows(tryApply);
        } catch (e) {
            Zotero.debug("[Weavero] _setupPrefsWindowWatcher err: " + e);
        }
    }

    _teardownPrefsWindowWatcher() {
        try {
            if (this._wvPrefsWindowObserver) {
                try { Services.obs.removeObserver(this._wvPrefsWindowObserver, "chrome-document-global-created"); } catch (e) {}
                this._wvPrefsWindowObserver = null;
            }
            this._wvPrefsWindows((w: any) => this._wvPrefsUnalignSearch(w));
        } catch (e) {
            Zotero.debug("[Weavero] _teardownPrefsWindowWatcher err: " + e);
        }
    }

    // ====================================================================
    // Per-feature toggles introduced in v0.8.1.
    // Pattern: each group has a master pref + per-feature children.
    // The child getters short-circuit to FALSE when the master is off,
    // so any one call site that asks `_getEnableX()` gets a single
    // truthful answer regardless of whether the master or the child
    // alone is unticked. All defaults are TRUE so v0.8.0 -> v0.8.1
    // upgrade is invisible to existing users (preserves prior behaviour).
    //
    // Three-tier hierarchy: tab master -> sub-master -> child.
    // - Tab masters (enableLinksAndRelations, enableFilters, enableVisualExtras)
    //   gate the entire tab. Live as a checkbox in the tab header.
    // - Sub-masters (enableUriUtilities, enableRelations) gate a
    //   coherent feature subgroup; live inline at the top of their
    //   panel section.
    // - Children gate one feature each.
    // ====================================================================

    // ---- Tier 1: tab masters ----
    _getEnableLinksAndRelations() {
        return this._wvPref("enableLinksAndRelations");
    }
    _getEnableVisualExtras() {
        return this._wvPref("enableVisualExtras");
    }
    /** Tab master for the Bookmarks tab. Default ON.
     *  Gates both library-side (collections-toolbar dropdown +
     *  collections-tree menu) and reader-side (sidebar Bookmarks tab)
     *  affordances via the two sub-prefs below. */
    _getEnableBookmarks() {
        return this._wvPref("enableBookmarks");
    }
    /** Library bookmarks — collections-toolbar Bookmarks button + dropdown,
     *  plus the "Bookmark collection" right-click entry. Default ON. */
    _getEnableLibraryBookmarks() {
        return this._wvPref("enableLibraryBookmarks");
    }
    /** Document/reader bookmarks — Bookmarks tab in the reader sidebar
     *  for in-document location bookmarks. Default ON. */
    _getEnableReaderBookmarks() {
        return this._wvPref("enableReaderBookmarks");
    }
    /** When ON, hide the Reader Bookmarks tab while the current
     *  attachment has zero bookmarks (combined across the local
     *  "In this document" and global "Elsewhere in Zotero" sections).
     *  Default OFF — the reader Bookmarks tab stays as a permanent drop
     *  target even when empty; flip ON to hide it until the current
     *  document has a bookmark. */
    _getAutoHideEmptyReaderBookmarks() {
        return this._wvPref("autoHideEmptyReaderBookmarks");
    }

    /** When ON, hide the collections-pane toolbar Bookmarks button
     *  while the library has zero bookmarks. Default OFF — the
     *  button is one of the main entry points for library bookmarks,
     *  so users typically want it visible even when empty. Flip ON
     *  to declutter the toolbar until the first bookmark lands. */
    _getAutoHideEmptyLibraryBookmarks() {
        return this._wvPref("autoHideEmptyLibraryBookmarks");
    }

    /** When ON, the Library scope tab appears in the reader sidebar's
     *  Bookmarks panel so library bookmarks can be browsed alongside
     *  in-document ones (Ctrl-click to merge views). Default ON —
     *  matches existing behaviour; flip OFF to keep the reader panel
     *  document-only. */
    _getShowLibraryBookmarksInReader() {
        return this._wvPref("showLibraryBookmarksInReader");
    }

    // ---- Group 1: URI utilities ----
    _getEnableUriUtilities() {
        return this._wvPref("enableUriUtilities");
    }
    _getEnableCopyItemLink() {
        return this._wvPref("enableCopyItemLink");
    }
    _getEnableCopyCollectionLink() {
        return this._wvPref("enableCopyCollectionLink");
    }

    // ---- Group 1: Relations and linked items ----
    _getEnableRelations() {
        return this._wvPref("enableRelations");
    }
    _getEnableAddRelatedMenu() {
        return this._wvPref("enableAddRelatedMenu");
    }
    _getEnableChainBadge() {
        return this._wvPref("enableChainBadge");
    }
    _getEnableOpenRelatedSubmenu() {
        return this._wvPref("enableOpenRelatedSubmenu");
    }
    /** Items-tree "Related" column. Lives in the Visual extras tab now
     *  (grouped with the Annotations and Tags columns), so it's gated by
     *  the enableVisualExtras tab master — NOT the Relations sub-master.
     *  (Like External viewer above, the getter stays here but the gate
     *  moved.) */
    _getEnableRelatedColumn() {
        return this._wvPref("enableRelatedColumn");
    }
    _getEnableLibrariesHighlight() {
        return this._wvPref("enableLibrariesHighlight");
    }

    // ---- Group 3: External viewer (was Group 1; moved to Visual extras) ----
    /** "Open in External Viewer" right-click menu entry that launches
     *  the item's best attachment with the OS default application
     *  (replaces the standalone Open PDF for Zotero plugin). Default ON
     *  since 2026-08-18 (MJT: discoverability — anyone annoyed can
     *  disable it; was opt-in before). Tab 3 (Visual extras) — gated by
     *  enableVisualExtras. */
    _getEnableOpenExternalViewer() {
        return this._wvPref("enableOpenExternalViewer");
    }
    _getEnablePluginsSearch() {
        return this._wvPref("enablePluginsSearch");
    }

    // ---- Group 2: Filters ----
    _getEnableFilters() {
        return this._wvPref("enableFilters");
    }
    _getEnableItemsTreeFilter() {
        return this._wvPref("enableItemsTreeFilter");
    }
    /** True while THIS object is the live plugin instance. Async wiring must
     *  re-check after every await, and retry/timer continuations before
     *  acting -- a hot reload mid-flight otherwise lets a DEAD instance wire
     *  observers or mount UI bound to stale state (the issue #27 orphan
     *  duel; see feedback_weavero_reload_proof_wiring trap #0). */
    _wvLive() {
        try { return !!((Zotero as any).Weavero && (Zotero as any).Weavero.plugin === this); }
        catch (e) { return false; }
    }

    _getEnableAnnSort() {
        return this._wvPref("enableAnnSort");
    }
    _getEnableReadStatusFilter() {
        return this._wvPref("enableReadStatusFilter");
    }
    _getEnableSelectionTarget() {
        return this._wvPref("enableSelectionTarget");
    }
    _getEnableTabsLibraryFilter() {
        return this._wvPref("enableTabsLibraryFilter");
    }
    _getEnableTabsFileTypeFilter() {
        return this._wvPref("enableTabsFileTypeFilter");
    }

    // ---- Group 3: Visual extras (gated by enableVisualExtras tab master) ----
    _getEnableAnnotationsCountColumn() {
        return this._wvPref("enableAnnotationsCountColumn");
    }
    /** Firefox 157 "nova" tabs: pill shape + gradient outline on the
     *  selected tab (MJT 2026-09-25). Default ON since 2026-09-28; off =
     *  Zotero's raised, square-cornered tabs. */
    _getSelectedTabRing() {
        return this._wvPref("selectedTabRing");
    }
    _getEnableGroupLibraryGlyph() {
        return this._wvPref("enableGroupLibraryGlyph");
    }
    /** Whether the Tags column shows the automatic-tag count as a
     *  second number. Default true. Not gated by the Visual extras
     *  master — the Tags column itself isn't gated either, and the
     *  renderCell reads this same pref directly (it can't see `this`).
     *  When false, the column renders a single number and should be
     *  as narrow as the other single-number columns (see the width
     *  picked in `_registerItemTreeColumns`). */
    _getEnableTagsCountAuto() {
        return this._wvPref("enableTagsCountAuto");
    }
    /** Tags column width in px — wide enough for "manual|auto" when the
     *  auto count is on, otherwise the same 30px the Annotations column
     *  uses for a single number. */
    _tagsColumnWidth() {
        return this._getEnableTagsCountAuto() ? 44 : 30;
    }

    /** Hidden debug pref. When true, every routine sidebar/render pass
     *  emits verbose [Weavero] traces. Default false (silent).
     *  Toggle via Tools → Developer → Run JavaScript:
     *    Zotero.Prefs.set("weavero.debug", true);
     *  Errors and significant one-time events still log unconditionally. */
    _getDebug() {
        return this._wvPref("debug");
    }

    /** Routine debug log — only fires when the debug pref is on. Use this
     *  for per-render-pass spam (sidebar scans, span cache hits, etc.).
     *  Errors and rare events should keep using Zotero.debug() directly. */
    _dbg(msg) {
        if (this._getDebug()) Zotero.debug(msg);
    }

    /** Strip every decoration we add to the items-tree annotation rows. */
    _stripItemsList(docArg?: any) {
        // Re-entry guard: with the items-list mutation observer running
        // synchronously (v0.0.132), every DOM change we make here instantly
        // re-fires _markCellLinks, which would call us again. Without this
        // guard we recurse / livelock when there are many annotation cells
        // visible. The idempotent shortcuts below also help.
        if (this._stripItemsListBusy) return;
        this._stripItemsListBusy = true;
        try {
            const doc = docArg || Zotero.getMainWindow().document;
            // 1. Restore tight annotation-comment cells (highlight / underline /
            //    image / ink / note rows) to plain text. SKIP cells that are
            //    already clean — touching them triggers redundant childList
            //    mutations that fire the tree observer in a tight loop and
            //    freeze Zotero.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment") as any) {
                const isDirty =
                    cell.querySelector(".wv-text-wrap, .wv-tree-icon, .wv-tree-rel-icon, .wv-url-span")
                    || cell.hasAttribute("data-comment-text")
                    || cell.hasAttribute("data-has-rich")
                    || cell.hasAttribute("data-has-relations")
                    || cell.hasAttribute("data-truncated");
                if (!isDirty) continue;

                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                }
                // Only assign textContent when it actually changes —
                // assigning the same value still emits a childList mutation.
                if (cell.textContent !== text) cell.textContent = text;
                if (cell.hasAttribute("data-has-rich"))     cell.removeAttribute("data-has-rich");
                if (cell.hasAttribute("data-icon-wanted"))   cell.removeAttribute("data-icon-wanted");
                if (cell.hasAttribute("data-has-relations")) cell.removeAttribute("data-has-relations");
                if (cell.hasAttribute("data-comment-text"))  cell.removeAttribute("data-comment-text");
                if (cell.hasAttribute("data-truncated"))     cell.removeAttribute("data-truncated");
                if (cell.hasAttribute("data-has-url"))       cell.removeAttribute("data-has-url");
            }
            // 2. Unwrap any URL spans we injected into other annotation-row
            //    types (text annotations and area / image annotations show
            //    their text in `.cell-text` and get coloured spans there).
            //    `.annotation-row` is the items-tree class — the right-pane
            //    uses the `<annotation-row>` custom *element*, which is a
            //    different selector and won't match.
            for (const span of doc.querySelectorAll(".annotation-row .wv-url-span") as any) {
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // 2b. Same for note-ITEM title cells (the note-item sweep in
            //     _markCellLinks marks `.cell.title .cell-text` on note rows;
            //     we only ever add spans to note titles, so this is safe).
            for (const span of doc.querySelectorAll(".cell.title .wv-url-span") as any) {
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // 3. Remove any leftover tree icons that escaped the cell flatten.
            for (const ic of doc.querySelectorAll(".annotation-row .wv-tree-icon") as any) {
                ic.remove();
            }
            // 3b. Same for the relations icon.
            for (const ic of doc.querySelectorAll(".annotation-row .wv-tree-rel-icon") as any) {
                ic.remove();
            }
        } catch(e) {
            Zotero.debug("[Weavero] _stripItemsList: " + e);
        } finally {
            this._stripItemsListBusy = false;
        }
    }

    /** Strip URL spans + popup buttons from right-pane <annotation-row>s. */
    _stripRightPane() {
        try {
            const doc = Zotero.getMainWindow().document;
            for (const span of doc.querySelectorAll("annotation-row .wv-url-span") as any) {
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // Revert inline-md rendering: restore the comment text from the
            // cached raw source so disabling the feature gives the user back
            // the original (markered) text instead of a stripped view.
            for (const cmt of doc.querySelectorAll("annotation-row .comment[data-wv-raw]") as any) {
                const raw = cmt.getAttribute("data-wv-raw") || "";
                while (cmt.firstChild) cmt.removeChild(cmt.firstChild);
                cmt.appendChild(doc.createTextNode(raw));
                cmt.removeAttribute("data-wv-raw");
                cmt.removeAttribute("data-wv-source");
            }
            for (const btn of doc.querySelectorAll("annotation-row .wv-btn-pane") as any) {
                btn.remove();
            }
            // Related-box label rendering: replace decorated labels
            // with a flat textNode of the same text.
            for (const label of doc.querySelectorAll("related-box .body .row .label[data-wv-related-rendered]") as any) {
                const t = label.dataset.wvRelatedRendered || label.textContent || "";
                while (label.firstChild) label.removeChild(label.firstChild);
                label.appendChild(doc.createTextNode(t));
                delete label.dataset.wvRelatedRendered;
            }
        } catch(e) { Zotero.debug("[Weavero] _stripRightPane: " + e); }
    }

    /** Re-inject sidebar 🔗 buttons on existing annotation rows whose
     *  comments contain URLs. Mirrors what _sidebarHandler does on render,
     *  but we walk the DOM ourselves because the Reader event has already
     *  fired for every visible row by the time the user toggles the pref. */
    _reinjectSidebarButtons(outerDoc, reader) {
        if (!outerDoc || !reader || !reader._item) return;
        try { this._ensureReaderOuterStyles(outerDoc); } catch(e) {}
        // Resolve the outer-iframe slot to inject into. Tried in priority
        // order; first match wins. The slot is typically a `.head`/
        // `<header>` end-area, sibling to the React `.custom-sections`
        // div where event-driven appends land.
        const findSlot = (row) =>
               row.querySelector(".head .end")
            || row.querySelector("header .end")
            || row.querySelector(".head .menu")
            || row.querySelector("header .menu")
            || row.querySelector(".head")
            || row.querySelector("header")
            || row;
        let addedComment = 0, addedRel = 0;
        const rows = outerDoc.querySelectorAll(".annotation-row, .annotation");
        for (const row of rows) {
            const key = this._findAnnotationKey(row, reader);
            const lib = this.libraryIDFromReader(reader);

            // Capture both icons up-front. The event-driven path
            // (`_sidebarHandler`) places them inside
            // `.custom-sections > .section > .wv-icon-group`; the
            // re-inject path (this function) historically placed them
            // directly in `.end`. To keep the visual order
            // [comment, relations, kebab] regardless of which level
            // each icon happens to live at, we use the OTHER icon as
            // the insertion reference rather than the slot's
            // lastElementChild. That way new buttons land as siblings
            // of any pre-existing icon.
            let existingBtn = row.querySelector(
                "." + BTN_SIDEBAR_CLASS + ":not(.wv-btn-relations)");
            let existingRel = row.querySelector(".wv-btn-relations");
            const comment = key ? this.getModelComment(lib, key) : "";
            const wantsComment = !!key
                && this._iconWantedFor(comment)
                && this._iconAddsValueBeyondInline(comment);
            const ann = this._getAnnotationItem(lib, key);
            const wantsRel = !!ann
                && this._getAnnotationRelatedItems(ann).length > 0;

            // ---- Comment icon -------------------------------------------
            if (!wantsComment) {
                existingBtn?.remove();
                existingBtn = null;
            } else if (!existingBtn) {
                const target = findSlot(row);
                const btn = wvHtmlEl(outerDoc, "button", BTN_CLASS + " " + BTN_SIDEBAR_CLASS);
                this._applyIconState(btn, comment);
                const cmt = comment;
                btn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(btn);
                    this.openCommentPopup(cmt, {
                        anchorNode: btn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                // If a relations button is already present, insert
                // BEFORE it (within its parent) so the order stays
                // [comment, relations]. Otherwise fall back to
                // insert-before-kebab in the slot.
                if (existingRel && existingRel.parentNode) {
                    existingRel.parentNode.insertBefore(btn, existingRel);
                } else {
                    const last = target.lastElementChild;
                    if (last) target.insertBefore(btn, last);
                    else      target.appendChild(btn);
                }
                existingBtn = btn;
                addedComment++;
            }

            // ---- Relations icon -----------------------------------------
            // Independent of comment content. Decision: present iff the
            // annotation has any related items right now. Also
            // self-heals when the last relation is removed (icon goes
            // away) or the first is added (icon appears).
            if (!wantsRel) {
                existingRel?.remove();
                existingRel = null;
            } else if (!existingRel) {
                const target = findSlot(row);
                const relBtn = wvHtmlEl(outerDoc, "button");
                relBtn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS
                    + " wv-btn-relations";
                const count = this._getAnnotationRelatedItems(ann).length;
                relBtn.title = count + " Related";
                relBtn.appendChild(this._makeRelationsSvg(outerDoc));
                relBtn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(relBtn);
                    this.openRelationsPopup(ann, {
                        anchorNode: relBtn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                // If a comment button is present (or was just added
                // above), place relations immediately AFTER it in the
                // same parent — guarantees [comment, relations]. The
                // `existingBtn` variable was updated when the comment
                // block inserted a fresh one, so this branch sees the
                // up-to-date state. Otherwise insert-before-kebab.
                if (existingBtn && existingBtn.parentNode) {
                    existingBtn.parentNode.insertBefore(
                        relBtn, existingBtn.nextSibling);
                } else {
                    const last = target.lastElementChild;
                    if (last) target.insertBefore(relBtn, last);
                    else      target.appendChild(relBtn);
                }
                addedRel++;
            }
        }
        if (addedComment || addedRel) {
            this._dbg("[Weavero] sidebar reinject: comment=" + addedComment
                + " relations=" + addedRel);
        }
    }

    /** Convenience wrapper: re-decorate every open reader's sidebar.
     *  Called from the item-modify notifier (relations changes don't
     *  flow through the reader's React annotation prop, so the
     *  renderSidebarAnnotationHeader event won't re-fire — we have to
     *  drive the refresh ourselves) and from `onMainWindowLoad` /
     *  `init` to cover already-rendered rows after a plugin restart. */
    _reinjectAllSidebars() {
        if (!this._getEnableReaderSidebar()) return;
        try {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (idoc) this._reinjectSidebarButtons(idoc, reader);
                } catch(e) {}
            }
        } catch(e) {
            Zotero.debug("[Weavero] _reinjectAllSidebars err: " + e.message);
        }
    }

    /** Strip URL spans from sidebar comments + remove sidebar 🔗 buttons.
     *  If `idoc` is omitted, strips across every open reader. */
    _stripReaderSidebar(idoc) {
        if (!idoc) {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document) this._stripReaderSidebar(iwin.document);
                } catch(e) {}
            }
            return;
        }
        try {
            // Sidebar URL spans live inside .annotation-row / .annotation
            // wrappers; we exclude .annotation-popup so the in-PDF popup's
            // own spans aren't yanked away from underneath that surface.
            const sels = [
                ".annotation-row .comment .wv-url-span",
                ".annotation-row .body .wv-url-span",
                ".annotation .comment .wv-url-span",
            ];
            for (const sel of sels) {
                for (const span of idoc.querySelectorAll(sel) as any) {
                    if (span.closest(".annotation-popup")) continue;
                    span.replaceWith(idoc.createTextNode(span.textContent || ""));
                }
            }
            // Tear down preview-panel DOM completely: remove the .wv-md-preview
            // overlays, drop the wv-comment-preview/wv-editing classes from
            // each .comment, so the raw .content becomes visible again. Also
            // unwrap any .wv-md-* spans so the rendered formatting reverts.
            for (const cmt of idoc.querySelectorAll(
                    ".annotation-row .comment, .annotation .comment")) {
                if (cmt.closest(".annotation-popup")) continue;
                for (const p of cmt.querySelectorAll(".wv-md-preview") as any) p.remove();
                cmt.classList.remove("wv-comment-preview");
                cmt.classList.remove("wv-editing");
                // Clear the rebuild rate-limit timestamp so the next
                // _renderPreviewPanel call after a pref toggle can run
                // immediately (the rate limit is only a loop-breaker —
                // a deliberate user-driven rebuild shouldn't have to
                // wait it out).
                cmt.removeAttribute("data-wv-last-rebuild");
            }
            for (const span of idoc.querySelectorAll(
                    ".wv-md-bold, .wv-md-italic, .wv-md-strike, .wv-md-code")) {
                if (span.closest(".annotation-popup")) continue;
                span.replaceWith(idoc.createTextNode(span.textContent || ""));
            }
            for (const btn of idoc.querySelectorAll("." + BTN_SIDEBAR_CLASS) as any) {
                btn.remove();
            }
        } catch(e) { Zotero.debug("[Weavero] _stripReaderSidebar: " + e); }
    }

    /** Strip in-PDF popup decoration + marker badges + text-annotation
     *  buttons. If `idoc` is omitted, strips across every open reader. */
    _stripPdfView(idoc) {
        if (!idoc) {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document) this._stripPdfView(iwin.document);
                } catch(e) {}
            }
            return;
        }
        try {
            for (const b of idoc.querySelectorAll(".wv-marker-badge") as any) b.remove();
            for (const b of idoc.querySelectorAll(".wv-text-annotation-btn") as any) b.remove();
            for (const popup of idoc.querySelectorAll(".annotation-popup") as any) {
                for (const span of popup.querySelectorAll(".wv-url-span") as any) {
                    span.replaceWith(idoc.createTextNode(span.textContent || ""));
                }
                for (const btn of popup.querySelectorAll("." + BTN_POPUP_CLASS) as any) {
                    btn.remove();
                }
            }
        } catch(e) { Zotero.debug("[Weavero] _stripPdfView: " + e); }
    }

    /** Apply a per-surface pref change at runtime — re-runs the surface's
     *  entry point, which now strips or rebuilds based on the new pref. */
    _applySurfacePref(surface) {
        Zotero.debug("[Weavero] _applySurfacePref: " + surface);
        try {
            if (surface === "itemsList") {
                this._markCellLinks();
                return;
            }
            if (surface === "rightPane") {
                this._scanPaneRows();
                return;
            }
            if (surface === "notes") {
                // Three sub-surfaces share one toggle:
                //   1. <note-row>       — items-tree note rows
                //   2. <notes-box>      — right-pane Notes section on a
                //                         parent item
                //   3. <note-editor>    — the contenteditable iframe
                //                         in both the right pane and
                //                         the pop-out note window
                try { this._processNoteRows(); }
                catch(e) { Zotero.debug("[Weavero] _processNoteRows err: " + e); }
                try { this._processNotesBoxes(); }
                catch(e) { Zotero.debug("[Weavero] _processNotesBoxes err: " + e); }
                try { this._processNoteEditors(); }
                catch(e) { Zotero.debug("[Weavero] _processNoteEditors err: " + e); }
                return;
            }
            if (surface !== "readerSidebar" && surface !== "readerView") return;
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                // Outer reader iframe — sidebar list + the in-document popup
                // (`.annotation-popup`) live here.
                const iwin = reader._iframeWindow
                    || (reader._iframe && reader._iframe.contentWindow);
                const outerDoc = iwin && iwin.document;
                if (outerDoc) {
                    if (surface === "readerSidebar") {
                        this._processReaderSidebar(outerDoc);
                        // renderSidebarAnnotationHeader only fires on row
                        // re-render, so a pref-flip alone won't restore the
                        // sidebar 🔗 buttons. Re-inject manually.
                        if (this._getEnableReaderSidebar()) {
                            try { this._reinjectSidebarButtons(outerDoc, reader); }
                            catch(e) { Zotero.debug("[Weavero] sidebar reinject err: " + e); }
                        }
                    }
                    if (surface === "readerView") {
                        for (const popup of outerDoc.querySelectorAll(".annotation-popup") as any) {
                            this._injectIconIntoPopup(popup, reader);
                        }
                    }
                }
                if (surface === "readerView") {
                    // Inner viewer iframe — marker badges and text-annotation
                    // buttons live here. We cache the doc when our inner
                    // observer wires up; if that hasn't run yet, fall back
                    // to walking the outer doc's iframes for viewer.html.
                    let innerDoc = null;
                    try {
                        const cached = this._readerObservers
                            && this._readerObservers.get(reader);
                        innerDoc = cached && cached.innerDoc;
                    } catch(e) {}
                    if (!innerDoc && outerDoc) {
                        for (const f of outerDoc.querySelectorAll("iframe") as any) {
                            try {
                                const cd = f.contentDocument;
                                if (cd && (cd.URL || "").includes("viewer.html")) {
                                    innerDoc = cd;
                                    break;
                                }
                            } catch(e) {}
                        }
                    }
                    if (innerDoc) {
                        this._processTextAnnotations(innerDoc);
                        this._processNoteAnnotationOverlays(innerDoc, reader);
                    }
                }
                // Each entry point above gates on its own getter and strips
                // on disabled, so this rescan handles both directions.
            }
        } catch(e) { Zotero.debug("[Weavero] _applySurfacePref err: " + e); }
    }

    /** Apply the inline-vs-icons-only mode change at runtime.
     *  - Toggles :root.wv-icons-only so the tree icon is always visible in
     *    Mode 2 (the only access path to URLs there).
     *  - Wipes existing per-cell state in the items tree so the next mark
     *    pass rebuilds in the new mode (with or without coloured spans).
     *  - Strips any leftover .wv-url-span elements elsewhere so the switch
     *    feels live; right-pane / sidebar will re-mark on the next scan
     *    according to the new mode. */
    _applyInlineLinksPref(inline) {
        Zotero.debug("[Weavero] _applyInlineLinksPref: inline=" + inline);
        try {
            const win = Zotero.getMainWindow();
            const doc = win.document;
            const root = doc.documentElement;
            root.classList.toggle("wv-icons-only", !inline);

            // Items tree: restore each cell to its raw text so the next
            // _markCellLinks pass rebuilds it in the new mode. Removing the
            // .wv-text-wrap directly would wipe the cell content (the wrap
            // holds the text), leaving _markCellLinks nothing to rebuild.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment") as any) {
                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                }
                // Flatten back to plain text — also drops the .wv-tree-icon
                // and any leftover .wv-url-span children.
                cell.textContent = text;
                cell.removeAttribute("data-has-rich");
                cell.removeAttribute("data-icon-wanted");
                cell.removeAttribute("data-comment-text");
                cell.removeAttribute("data-truncated");
                cell.removeAttribute("data-has-url");
                // Reset the rate-limit timestamp so the upcoming rebuild
                // can run regardless of how recent the previous one was.
                cell.removeAttribute("data-wv-last-rebuild");
            }
            this._markCellLinks();
            // Zotero's items-tree React reconciliation can strip our spans
            // after our rebuild. Schedule retries that clear the per-cell
            // rate-limit attribute and re-run _markCellLinks. The first
            // retry runs at the next animation frame (~16 ms) — early
            // enough that the user never sees plain text — and a backup
            // retry at 150 ms catches reconciliations that happen later
            // than that. The rate-limit on _markCellLinks (which we just
            // cleared per-cell) means these retries can't induce a loop:
            // each retry rebuilds at most once, then is blocked again
            // until the next retry's clear.
            const tryRecover = () => {
                for (const cell of doc.querySelectorAll(".annotation-row.tight .cell.annotation-comment") as any) {
                    cell.removeAttribute("data-wv-last-rebuild");
                }
                try { this._markCellLinks(); } catch(e) {}
            };
            if (win.requestAnimationFrame) {
                win.requestAnimationFrame(tryRecover);
            }
            win.setTimeout(tryRecover, 150);

            // Right pane / items-tree-note rows: unwrap any leftover URL spans
            // back into plain text. Marking will re-add them only if Mode 1.
            //
            // CRITICAL: stripping the span invalidates the cache validation
            // markers (data-wv-source / data-wv-rendered / data-wv-last-rebuild,
            // _processRelatedBoxes' data-wv-related-rendered) — without
            // clearing them, the next pass thinks "already rendered" and
            // skips the rebuild that's needed to recreate the span we
            // just removed.
            //
            // BUT — `data-wv-raw` is not a cache marker; it's the SOURCE
            // text (the raw markdown). For text-annotation rows the only
            // copy of the original source is `data-wv-raw` on the
            // .cell-text — `el.textContent` is the stripped form
            // ("bold ..." not "**bold** ..."). Clearing data-wv-raw here
            // would force the next rebuild to read textContent and
            // permanently lose the markdown markers, leaving bold
            // unrendered after a disable/re-enable cycle.
            for (const span of doc.querySelectorAll(".wv-url-span") as any) {
                let p = span.parentNode;
                while (p && p.nodeType === 1) {
                    if (p.hasAttribute("data-wv-source")
                        || p.hasAttribute("data-wv-rendered")
                        || p.hasAttribute("data-wv-last-rebuild")
                        || (p.dataset && p.dataset.wvRelatedRendered)) {
                        p.removeAttribute("data-wv-source");
                        p.removeAttribute("data-wv-rendered");
                        p.removeAttribute("data-wv-last-rebuild");
                        if (p.dataset) delete p.dataset.wvRelatedRendered;
                        // NOTE: data-wv-raw deliberately NOT cleared.
                        break;
                    }
                    p = p.parentNode;
                }
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // Trigger a fresh pane scan so right-pane rows re-mark per the
            // new mode (no-op in Mode 2 since _markTextLinks skips early).
            try { this._scanPaneRows(); } catch(e) {}

            // Reader iframe(s): unwrap leftover spans, then explicitly re-run
            // the sidebar marker + popup icon pass for the new mode. Relying
            // on the iframe mutation observer alone fails when Mode 2 → Mode 1
            // because there's nothing to mutate (no spans to strip), so no
            // observer callback fires and the sidebar stays plain text.
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (!idoc) continue;
                    // Unwrap any leftover URL spans from when we used to mark
                    // .content directly. SKIP spans inside .wv-md-preview —
                    // those are part of our preview-panel DOM, owned by
                    // _renderPreviewPanel; tearing them down here without
                    // also invalidating the preview's data-source cache
                    // would leave them un-restored on the next pass (the
                    // cache hit makes _renderPreviewPanel skip the rebuild).
                    for (const span of idoc.querySelectorAll(".wv-url-span") as any) {
                        if (span.closest(".wv-md-preview")) continue;
                        span.replaceWith(idoc.createTextNode(span.textContent || ""));
                    }
                    // Re-mark per the new mode (idempotent in Mode 1, no-op
                    // in Mode 2 since _markTextLinks returns early).
                    this._processReaderSidebar(idoc);
                    // Mode 1 ↔ Mode 2 also flips _iconAddsValueBeyondInline
                    // for every comment, so the 🔗 sidebar buttons must be
                    // re-evaluated. The sidebar handler only fires on row
                    // render (not on pref change), so without this the
                    // buttons stay in whatever state Mode 1 left them.
                    if (this._getEnableReaderSidebar()) {
                        try { this._reinjectSidebarButtons(idoc, reader); }
                        catch(e) { Zotero.debug(
                            "[Weavero] sidebar reinject (inline-links) err: " + e); }
                    }
                    // Re-evaluate any open in-PDF popups too.
                    for (const popup of idoc.querySelectorAll(".annotation-popup") as any) {
                        this._injectIconIntoPopup(popup, reader);
                    }
                } catch(e) {}
            }
        } catch(e) {
            Zotero.debug("[Weavero] _applyInlineLinksPref error: " + e);
        }
    }

    async _registerPrefPane() {
        try {
            // De-dupe: dev iterations and hot-reloads can call
            // init() repeatedly without a clean shutdown; without
            // this guard, each call adds another "Weavero" entry
            // to the prefs sidebar.
            try {
                const existing = (Zotero.PreferencePanes as any).pluginPanes
                    .filter((p) => p.pluginID === "weavero@mjthoraval");
                for (const p of existing) {
                    Zotero.PreferencePanes.unregister(p.id);
                }
            } catch (e) {}
            // Theme-aware icon: pick the dark variant if Zotero's
            // UI is currently dark. Theme is detected once at
            // registration; switching theme mid-session won't swap
            // the pref-pane icon (Zotero's PreferencePanes API has
            // no live-update path), but startup is the dominant
            // case anyway.
            const theme = this._detectUIDark() ? "dark" : "light";
            // Zotero.PreferencePanes.register is async — without
            // await, callers that immediately rely on the pane
            // existing (e.g. the post-init "navigate to Weavero"
            // path) race against the pane actually appearing.
            await Zotero.PreferencePanes.register({
                pluginID : "weavero@mjthoraval",
                src      : _rootURI + "prefs.html",
                scripts  : [_rootURI + "prefs.js"],
                label    : "Weavero",
                // Plugin icon bundled under icons/ at the XPI root.
                // The pref-pane sidebar renders this around 16–20 px,
                // so pick the smallest bundled size; bigger would
                // just downscale and look softer.
                image    : _rootURI + "icons/icon-" + theme + "-32.png",
            });
        } catch(e) {
            Zotero.debug("[Weavero] _registerPrefPane error: " + e);
        }
    }

    // ---- Init / Destroy ---------------------------------------------------

    /** Register Weavero's preference DEFAULTS on Zotero's default branch.
     *  The settings pane uses native `<checkbox preference=…>` binding, which
     *  renders a pref as UNCHECKED when it has no registered default — but
     *  Weavero defaults most features ON (historically computed in JS via the
     *  `_get*` getters). Registering the defaults here makes the native pane
     *  reflect the real effective state. Idempotent (re-runs each startup);
     *  the DEFAULT branch never overrides a user value, so existing user
     *  toggles are untouched. The values come from the prefs table, the
     *  same rows the getters answer from (src/modules/prefs-table.ts). */
    _wvRegisterDefaultPrefs() {
        try {
            const P = "extensions.zotero.weavero.";
            // Every default from ONE place, src/modules/prefs-table.ts (survey
            // §3.5, slice 1b): the boolean rows (whose `def` is also what the
            // getter answers while the pref is unset), the string and number
            // defaults, and the optional URL schemes (rows too, all off). Hand lists here
            // and in init drifted before -- windowIcons (2026-07-16) and
            // enableReadStatusFilter (2026-08-24) ran ON with their Settings
            // checkbox unticked, their default missing from a list.
            this._wvRegisterTableDefaults();
            // Pref-rename migration (2026-07-24): "Multiple main windows"
            // graduated from experimental, so its prefs dropped the historical
            // "dev" prefix. Carry a user's EXPLICIT old value to the new key once
            // (the old key then becomes inert). Guarded by prefHasUserValue so a
            // real new-key choice is never masked, and the mere default (just
            // registered above) is never mistaken for a user value. Mirrors the
            // enablePdfReader rename below.
            try {
                const PB: any = (Services as any).prefs;
                const renames: [string, string][] = [
                    ["devNewMainWindow", "newMainWindow"],
                    ["devSessionAutoReopen", "sessionAutoReopen"],
                ];
                // ONCE: the old key is retired after the carry-over. Setting a
                // pref to its default clears its user value, so a user who
                // ticked the new box back to the default looked "never set"
                // to a migration that ran at every startup -- and an install
                // is a startup: the Hide box went off again on each new build
                // (MJT, 2026-09-22). Retiring the old key ends that.
                const retire = (short: string) => { try { PB.clearUserPref(P + short); } catch (e) {} };
                for (const [oldShort, newShort] of renames) {
                    if (!PB.prefHasUserValue(P + oldShort)) continue;
                    if (!PB.prefHasUserValue(P + newShort)) {
                        Zotero.Prefs.set("weavero." + newShort, !!Zotero.Prefs.get("weavero." + oldShort));
                    }
                    retire(oldShort);
                }
                // Inverted rename (v0.20.1): showNativeAnnSelector (default
                // OFF) -> hideNativeAnnSelector (default ON until 0.22.1,
                // OFF since: the handle's fold state). A user who had asked
                // to keep the selector keeps it.
                if (PB.prefHasUserValue(P + "showNativeAnnSelector")) {
                    if (!PB.prefHasUserValue(P + "hideNativeAnnSelector")) {
                        Zotero.Prefs.set("weavero.hideNativeAnnSelector", !Zotero.Prefs.get("weavero.showNativeAnnSelector"));
                    }
                    retire("showNativeAnnSelector");
                }
            } catch (e) { Zotero.debug("[Weavero] dev-pref rename migration err: " + e); }
        } catch (e) {
            Zotero.debug("[Weavero] _wvRegisterDefaultPrefs err: " + e);
        }
    }

    async init() {
        // The phases in order, each a method below (survey 2026-10-06 §4,
        // the large-method splits, 2026-10-21): bodies moved verbatim, the
        // only await the Settings pane's registration, as before.
        // A reload can land during any await (an install then an immediate
        // reload): the phases that await check `_wvDestroyed` after each of
        // their awaits and return, and init stops there instead of wiring
        // windows and menus for a destroyed instance (live audit 2026-10-13).
        const gone = () => !!(this as any)._wvDestroyed;
        this._wvInitEarly();
        this._wvInitPrefMigration();
        this._wvInitStyles();
        this._wvInitReaderEvents();
        this._wvInitReaderNotifier();
        this._wvInitReaderPolling();
        await this._wvInitOpenReaders();
        if (gone()) return;
        await this._wvInitMainWindows();
        if (gone()) return;
        await this._wvInitPrefPane();
        if (gone()) return;
        this._wvInitPrefObserver();
    }

    /** init phase early: Before anything awaits: the hooks that must be in before Zotero's own startup chain runs (early restore tracing, the quit-time patches, the stores' warm-up, the Settings-window and Reader.open patches). */
    _wvInitEarly() {
        // Guard tab-group deletion through the startup restore window: separate
        // reader windows restore (and re-stamp their tabs) AFTER the main window's
        // first _applyTabGroups, so a group living only in a reader window would
        // otherwise be deleted as "empty" before it restores. Cleared once reader
        // restore settles (see the uiReadyPromise chain below).
        (this as any)._wvTabGroupRestoreGuard = true;
        // EARLY (before any await): hook the ANCHOR window's Zotero_Tabs the
        // moment the window's DOM exists. The anchor's session restore runs at
        // the end of ZoteroPane.makeVisible(), while `onMainWindowLoad` and the
        // late all-windows loop can both miss the boot window (plugin startup is
        // still in flight when it loads) — leaving its restoreState UNHARDENED:
        // Zotero's native loop silently drops any tab whose item isn't in the
        // memory cache yet (Zotero.Items.exists === false during early load;
        // cost a note tab in restart-protocol runs 1/2/5).
        try { (this as any)._wvWireEarlyRestoreTracing(); } catch (e) {}
        // The anchor / colour marks follow the window count when a window
        // CLOSES too, on every platform (Linux kept a stale ⚓, 2026-10-14).
        try { (this as any)._wvWireWindowCloseIndicators(); } catch (e) {}
        // Stash last quit's session file NOW, before anything overwrites it —
        // feeds the anchor-window verify-and-repair pass in the uiReady chain.
        try { (this as any)._wvStashBootSession(); } catch (e) {}
        // Note tabs in secondary main windows: route Zotero.Notes.open to the
        // tab's OWNING window (upstream hardcodes getMainWindow — wedges the
        // tab at "note-loading" when another main window has focus).
        try { (this as any)._wvPatchNotesOpenForMultiWindow(); } catch (e) {}
        // Focused-tab-first: queue reader-WINDOW opens (each renders a PDF on
        // open) until the focused window's tab has painted. Must be installed
        // before Zotero.Reader.init's uiReady reopen loop fires.
        try { (this as any)._wvHoldReaderWindowOpens(); } catch (e) {}
        // Restore takeover, save side: at quit Zotero's session records a
        // library-only anchor and no reader windows (Weavero's store carries
        // the real workspace and restores it itself next boot).
        try { (this as any)._wvPatchReaderGetWindowStates(); } catch (e) {}
        // Register pref defaults FIRST so native settings-pane binding (and our
        // own getters) see the right initial values.
        try { this._wvRegisterDefaultPrefs(); } catch (e) {}
        // Warm the bookmarks store (file read) early so the dropdown is
        // populated by the time the user opens it. Fire-and-forget; the
        // cached promise dedupes with later callers.
        try { this._bmInit(); } catch (e) { Zotero.debug("[Weavero] _bmInit err: " + e); }
        // Warm the named-tab-sessions store too, so the "Sessions" tab menu is
        // populated by the time it's opened. Fire-and-forget; cached promise.
        try { this._wvTabSessionInit(); } catch (e) { Zotero.debug("[Weavero] _wvTabSessionInit err: " + e); }
        // Saved-windows store: load EAGERLY so the first List-all-tabs
        // open after a restart/reload already has the entries (lazy-only
        // loading made the Saved Windows section miss its first render —
        // user report 2026-07-15).
        try { (this as any)._wvSavedWindowsInit(); } catch (e) {}
        // 0a. Patch Zotero.Utilities.Internal.openPreferences so EVERY
        //     Settings-window open (Edit -> Settings, Ctrl+,, plugin-
        //     triggered) uses a features string that gives the user
        //     the standard three-button title bar (minimize, maximize /
        //     full-screen, close). Zotero's stock features
        //     ('chrome,titlebar,centerscreen,resizable=yes') omits
        //     minimizable=yes and dialog=no, which on Windows greys
        //     out the maximize button and hides the minimize button.
        //     We save the original and restore it in destroy().
        try {
            const Internal: any = Zotero.Utilities.Internal;
            if (typeof Internal.openPreferences === "function"
                    && !Internal._wvOrigOpenPreferences) {
                Internal._wvOrigOpenPreferences = Internal.openPreferences;
                Internal.openPreferences = function (paneID, options: any = {}) {
                    if (typeof options == "string") {
                        throw new Error(
                            "openPreferences() now takes an 'options' object");
                    }
                    // Reuse existing window (focus + navigate).
                    const wm = Components.classes[
                        "@mozilla.org/appshell/window-mediator;1"]
                        .getService(Components.interfaces.nsIWindowMediator);
                    const en = wm.getEnumerator("zotero:pref");
                    if (en.hasMoreElements()) {
                        const win: any = en.getNext();
                        win.focus();
                        if (paneID && win.Zotero_Preferences
                                && typeof win.Zotero_Preferences.navigateToPane
                                    === "function") {
                            win.Zotero_Preferences.navigateToPane(paneID, {
                                scrollTo: options.scrollTo,
                                action: options.action,
                            });
                        }
                        return win;
                    }
                    const io: any = {
                        pane: paneID,
                        scrollTo: options.scrollTo,
                        action: options.action,
                    };
                    const args: any[] = [
                        "chrome://zotero/content/preferences/preferences.xhtml",
                        "zotero-prefs",
                        // Same as Zotero's stock features PLUS:
                        //   minimizable=yes  -> minimize button
                        //   dialog=no        -> maximize / full-screen button
                        //                       (openDialog defaults to dialog=yes
                        //                       which suppresses it on Windows)
                        //   scrollbars=yes   -> safe default for content longer
                        //                       than the viewport
                        "chrome,titlebar,toolbar,centerscreen,resizable=yes,"
                            + "scrollbars=yes,minimizable=yes,dialog=no",
                        io,
                    ];
                    const mainWindow = Services.wm
                        .getMostRecentWindow("navigator:browser");
                    if (mainWindow) {
                        return (mainWindow as any).openDialog(...args);
                    } else {
                        args[args.length - 1].wrappedJSObject = args[args.length - 1];
                        return (Services.ww as any).openWindow(null, ...args);
                    }
                };
            }
        } catch (e) {
            Zotero.debug("[Weavero] openPreferences patch err: " + e);
        }

        // Optional: open a note "in a new window" as a tab-hosting reader-style
        // window so it can accept dragged-in tabs. Zotero.Notes.open is the single
        // chokepoint (ZoteroPane.openNote delegates here); patch it to redirect
        // only the openInWindow:true case when the `noteOpenInDeckWindow` pref is
        // on. Falls back to the original whenever no anchor is available.
        // Restored in destroy().
        // Tag-stamped like the multi-window layer below it (src-ts.md). A saved
        // original under a foreign stamp is a dead instance's chain -- normally
        // peeled already by _wvPatchNotesOpenForMultiWindow, which runs first;
        // never wrap on top of it.
        try {
            const Notes: any = (Zotero as any).Notes;
            const tag = (this as any)._wvWireTag();
            if (Notes && typeof Notes.open === "function" && Notes._wvOpenWired !== tag) {
                if (Notes._wvOrigOpen) (this as any)._wvOpenPatchPeel(Notes);
                Notes._wvOrigOpen = Notes.open;
                Notes._wvOpenWired = tag;
                const self = this;
                Notes.open = function (itemID: any, location: any, opts: any = {}) {
                    try {
                        // The deck window IS a reader window with the Firefox-style
                        // tab strip, so it only works when the reader window's title
                        // bar is replaced (compactTitleBarReader). Without that the
                        // window would have no visible tab strip — so fall through
                        // to the stock note window.
                        if (opts && opts.openInWindow
                                && (self as any)._getNoteOpenInDeckWindow()
                                && (self as any)._getCompactTitleBarReader()) {
                            return (self as any)._wvOpenNoteInDeckWindow(
                                itemID, Notes._wvOrigOpen.bind(Notes));
                        }
                    } catch (e) { Zotero.debug("[Weavero] note-open redirect err: " + e); }
                    return Notes._wvOrigOpen.call(Notes, itemID, location, opts);
                };
            }
        } catch (e) {
            Zotero.debug("[Weavero] Notes.open patch err: " + e);
        }

        // Route "open item" to an existing reader-WINDOW tab. Zotero's own
        // "focus the already-open tab" (getTabIDByItemID) only checks MAIN-window
        // tabs, so an item open ONLY in a separate reader window would open a
        // duplicate in the main bar. If it's hosted in a _wvWT reader window (and
        // not in a main tab), raise that window + switch to the tab instead.
        // Restored in destroy().
        try {
            const Reader: any = (Zotero as any).Reader;
            // A reader window closed without its `_readers` entry being spliced
            // leaves a dead cross-compartment Proxy. Touching ANY property on it
            // throws "can't access dead object", which breaks two hot paths that
            // iterate every reader:
            //   • Reader.open → `_readers.find(r => r.itemID === …)` → NO item can
            //     be opened (double-click does nothing).
            //   • Reader.getWindowStates → `r instanceof ReaderWindow` → session
            //     save throws + is swallowed → Zotero's own session.json freezes with stale
            //     reader windows that Reader.init re-opens every restart (so the
            //     breakage "survives" restarts until the dead entry is gone).
            // Purging dead entries before both paths makes a stray Proxy harmless.
            const purgeDeadReaders = () => {
                try {
                    const arr: any[] = Reader && Reader._readers;
                    if (!Array.isArray(arr)) return;
                    for (let i = arr.length - 1; i >= 0; i--) {
                        let drop = false;
                        try { void arr[i].itemID; } catch (e) { drop = true; }
                        // A reader whose window is already CLOSED is as dead as
                        // a Proxy for both paths: it cannot be restored, and the
                        // native getWindowStates derefs its torn-down iframe
                        // (getSecondViewState -> "can't access dead object"),
                        // which would sink Zotero's quit-time session save. Seen
                        // 2026-10-07 after a suite plain-closed a just-reopened
                        // reader window before its unload cleanup ran.
                        if (!drop) {
                            try { const w = arr[i]._window; if (w && w.closed) drop = true; }
                            catch (e) { drop = true; }
                        }
                        if (drop) arr.splice(i, 1);
                    }
                } catch (e) {}
            };
            // ─────────────────────────────────────────────────────────────────────────
            // TEMPORARY WORKAROUND — REMOVE WHEN FIXED UPSTREAM  (grep tag: WV-TEMP-132342)
            // Tracking the bug report: https://forums.zotero.org/discussion/132342
            //
            // FIX STATUS (checked 2026-07-20): fixed upstream in zotero/zotero commit
            // c233fcf5f "Fix reopening reader tabs during queued close notifications"
            // (Martynas Bagdonas, 2026-07-17; fixes forums comment #515471, the same
            // reopen-fails-after-close failure). Native Reader.open now skips entries
            // flagged `_isTabClosed`, i.e. does what dropGhostTabsForItem does by hand.
            // UPDATE 2026-10-07: c233fcf5f is an ancestor of the 10.0.0 tag (and of
            // every 10.0.x since), so the guard is dead weight on Zotero 10 and is
            // now called only when `Zotero.version < 10.0.0` (Zotero 9, which
            // Weavero still supports: strict_min_version 7.0). It coexists
            // harmlessly with the fix (it only drops entries whose tab is truly
            // gone, which the fixed Reader.open already ignores).
            //
            // RETIRE WHEN Zotero 9 support ends: delete this whole guard -- the
            // `tabAliveForReader` + `dropGhostTabsForItem` helpers below AND the
            // gated `dropGhostTabsForItem(itemID)` call in the Reader.open wrapper.
            // Nothing else depends on them.
            // ─────────────────────────────────────────────────────────────────────────
            // Defensive guard for an upstream Zotero bug (forums.zotero.org/discussion/132342):
            // a reader whose tab is closed during a PDF page-edit RELOAD can be left behind in
            // Reader._readers as an orphan — its `tabID` points at a tab that no longer exists.
            // Native Reader.open then finds that entry (`_readers.find(r => r.itemID === id)`),
            // treats the item as already-open, and calls `Zotero_Tabs.select(<ghost tabID>)`,
            // which throws "can't access property 'type', tab is undefined" — so double-click /
            // zotero://open on that item silently fails until a restart. Confirmed upstream
            // (reproduces with all plugins disabled); this only shields the user until it's fixed.
            // Before delegating to native open we drop any orphaned ReaderTab entry FOR THE ITEM
            // BEING OPENED so the open proceeds cleanly.
            //
            // Surgical by construction: scoped to `itemID`; only ReaderTab entries can match (a
            // ReaderWindow never sets `tabID`, so it can't be touched); and only when the tab is
            // gone from the reader's OWN window AND every main window — so a live tab, including
            // one in a separate reader window, is never removed. (The reader-window redirect
            // below already returns for items hosted in a Weavero reader window, so by the call
            // site the only entries left for `itemID` are a real tab or a genuine ghost.)
            const tabAliveForReader = (r: any): boolean => {
                let tabID: any;
                try { tabID = r.tabID; } catch (e) { return true; }
                if (!tabID) return true;   // no tabID (e.g. a ReaderWindow) → never a ghost-tab
                try {
                    const w: any = r._window;
                    if (w && w.Zotero_Tabs && Array.isArray(w.Zotero_Tabs._tabs)
                        && w.Zotero_Tabs._tabs.some((t: any) => t && t.id === tabID)) return true;
                } catch (e) {}
                try {
                    const wins = wvMainWins();
                    for (const w of wins) {
                        try {
                            const ZT: any = w && (w as any).Zotero_Tabs;
                            if (ZT && Array.isArray(ZT._tabs) && ZT._tabs.some((t: any) => t && t.id === tabID)) return true;
                        } catch (e) {}
                    }
                } catch (e) {}
                return false;
            };
            const dropGhostTabsForItem = (itemID: any) => {
                try {
                    const arr: any[] = Reader && Reader._readers;
                    if (!Array.isArray(arr)) return;
                    for (let i = arr.length - 1; i >= 0; i--) {
                        const r: any = arr[i];
                        let rItem: any;
                        try { rItem = r.itemID; } catch (e) { continue; }   // dead Proxies handled by purgeDeadReaders
                        if (rItem !== itemID) continue;
                        let isTab = false;
                        try { isTab = !!(r.constructor && r.constructor.name === "ReaderTab"); } catch (e) {}
                        if (isTab && !tabAliveForReader(r)) {
                            arr.splice(i, 1);
                            Zotero.debug("[Weavero] dropped orphaned reader entry for item " + itemID
                                + " (guards upstream Zotero forums #132342)");
                        }
                    }
                } catch (e) { Zotero.debug("[Weavero] dropGhostTabsForItem err: " + e); }
            };
            // Tag-stamped; a foreign saved original is a dead chain (normally
            // peeled by _wvPatchReaderGetWindowStates, which runs first).
            const tagG = (this as any)._wvWireTag();
            if (Reader && typeof Reader.getWindowStates === "function" && Reader._wvGWSWired !== tagG) {
                if (Reader._wvOrigGetWindowStates) (this as any)._wvReaderGWSPeel(Reader);
                Reader._wvOrigGetWindowStates = Reader.getWindowStates;
                Reader._wvGWSWired = tagG;
                Reader.getWindowStates = function (...a: any[]) {
                    purgeDeadReaders();
                    return Reader._wvOrigGetWindowStates.apply(Reader, a);
                };
            }
            // Tag-stamped; a foreign saved original is a dead chain (see the
            // Notes.open patch above).
            const tagR = (this as any)._wvWireTag();
            if (Reader && typeof Reader.open === "function" && Reader._wvOpenWired !== tagR) {
                if (Reader._wvOrigOpen) (this as any)._wvOpenPatchPeel(Reader);
                Reader._wvOrigOpen = Reader.open;
                Reader._wvOpenWired = tagR;
                const self = this;
                Reader.open = function (itemID: any, location: any, opts: any = {}) {
                    purgeDeadReaders();
                    try {
                        if (opts && !opts.allowDuplicate && !opts.openInWindow && (self as any)._wvWTFindTabForItem) {
                            let inMain = false;
                            for (const mw of wvMainWins()) {
                                const ZT: any = mw && (mw as any).Zotero_Tabs;
                                if (ZT && typeof ZT.getTabIDByItemID === "function" && ZT.getTabIDByItemID(itemID)) { inMain = true; break; }
                            }
                            if (!inMain) {
                                const hosted = (self as any)._wvWTFindTabForItem(itemID);
                                if (hosted && hosted.win && hosted.tab) {
                                    try { hosted.win.focus(); } catch (e) {}
                                    try { (self as any)._wvWTSwitch(hosted.win, hosted.tab.id); } catch (e) {}
                                    if (location) {
                                        const navTab = hosted.tab, w2: any = hosted.win;
                                        const st2 = (w2 && w2.setTimeout) ? w2.setTimeout.bind(w2) : setTimeout;
                                        const doNav = () => { try { if (navTab.reader && typeof navTab.reader.navigate === "function") navTab.reader.navigate(location); } catch (e) {} };
                                        if (navTab.reader && navTab.reader._internalReader) doNav(); else st2(doNav, 200);
                                    }
                                    return Promise.resolve(undefined);   // handled — don't open a duplicate
                                }
                            }
                        }
                    } catch (e) { Zotero.debug("[Weavero] reader-open redirect err: " + e); }
                    // WV-TEMP-132342: Zotero 9 only -- the upstream fix (c233fcf5f) is in
                    // every 10.0.x release (checked 2026-10-07 against the 10.0.0 tag).
                    // Delete the guard with Zotero 9 support (see note above).
                    if (Services.vc.compare(Zotero.version, "10.0.0") < 0) dropGhostTabsForItem(itemID);
                    return Reader._wvOrigOpen.call(Reader, itemID, location, opts);
                };
            }
        } catch (e) {
            Zotero.debug("[Weavero] Reader.open patch err: " + e);
        }
    }

    /** init phase 0: The enablePdfReader migration (defaults come from the prefs table). */
    _wvInitPrefMigration() {
        // 0. Defaults are registered by _wvRegisterDefaultPrefs (above, from
        // the prefs table). One migration still runs here:
        // Migration: if the old enablePdfReader pref was explicitly set
        // (rare — user disabled the reader integration), mirror its value
        // into the new sidebar+view keys the first time we run with them
        // missing. The old pref then becomes inert (nothing reads it).
        try {
            const oldVal = Zotero.Prefs.get("weavero.enablePdfReader");
            if (oldVal !== undefined) {
                const sb = Zotero.Prefs.get("weavero.enableReaderSidebar");
                const vw = Zotero.Prefs.get("weavero.enableReaderView");
                if (sb === undefined) {
                    Zotero.Prefs.set("weavero.enableReaderSidebar", !!oldVal);
                }
                if (vw === undefined) {
                    Zotero.Prefs.set("weavero.enableReaderView", !!oldVal);
                }
            }
        } catch(e) {
            Zotero.debug("[Weavero] enablePdfReader migration err: " + e);
        }
    }

    /** init phase 1: CSS, and the DOM a previous plugin instance may have left (panel, markers). */
    _wvInitStyles() {
        // 1. CSS — and clear any leftover popup panel from a previous
        // plugin instance. Same rationale as injectStyles' defensive
        // remove-then-add: Zotero's in-place plugin upgrade flow doesn't
        // reliably tear down DOM artifacts the previous version added,
        // so init must be defensive about cleaning before adding fresh.
        try {
            const oldPanel = Zotero.getMainWindow().document.getElementById(PANEL_ID);
            if (oldPanel) oldPanel.remove();
        } catch(e) {}
        this.injectStyles();
        // Plugin-upgrade recovery: clear DOM markers left behind by
        // a previous plugin instance. Without this, the new code
        // sees `data-wv-related-rendered` / `data-wv-ctx-wired` etc.
        // on related-box rows and skips reprocessing — leaving the
        // rendered DOM (and its event handlers) tied to the dead
        // old closures. Runs from init() (covers plugin enable /
        // upgrade cases where onMainWindowLoad doesn't refire) and
        // also from onMainWindowLoad below (covers new windows).
        try {
            const win = Zotero.getMainWindow();
            this._resetStaleMarkers(win && win.document);
        } catch(e) {}
    }

    /** init phase 2: Zotero.Reader event listeners (sidebar, view, popups), under the full addon id. */
    _wvInitReaderEvents() {
        // 2. Reader event listeners.
        // The pluginID MUST be the full addon ID ("weavero@mjthoraval"),
        // not a short slug. Zotero's `Plugins.addObserver({shutdown})`
        // hook calls `_unregisterEventListenerByPluginID(id)` with the
        // addon ID, filtering listeners by `pluginID !== id`. A short
        // slug never matches, so prior-version listeners survive plugin
        // upgrades and a second registration in the new init() leaves
        // TWO live listeners — visible to the user as duplicate toolbar
        // buttons in standalone reader windows.
        Zotero.Reader.registerEventListener(
            "renderSidebarAnnotationHeader", this._sidebarHandler, "weavero@mjthoraval");
        Zotero.Reader.registerEventListener(
            "createAnnotationContextMenu", this._contextHandler, "weavero@mjthoraval");
        Zotero.Reader.registerEventListener(
            "createViewContextMenu", this._viewContextHandler, "weavero@mjthoraval");
        Zotero.Reader.registerEventListener(
            "renderToolbar", this._toolbarHandler, "weavero@mjthoraval");

        // 2b. Watch for standalone note windows opening and apply the
        // Firefox-style strip if the compactTitleBarNote pref is on.
        // Also scan any already-open ones (so a plugin reload picks
        // them up immediately).
        try { this._setupNoteWindowWatcher(); } catch (e) {
            Zotero.debug("[Weavero] _setupNoteWindowWatcher init err: " + e);
        }
        // Settings window: keep its search box on the content column.
        try { this._setupPrefsWindowWatcher(); } catch (e) {
            Zotero.debug("[Weavero] _setupPrefsWindowWatcher init err: " + e);
        }

        // 2c. ReaderTab prototype safety for torn-off readers (see
        // _wvEnsureReaderTabWindowSafety). Try now (covers a plugin reload
        // while readers -- possibly a torn-off one -- are open); if no
        // ReaderTab exists yet, the tab-add notifier below retries and the
        // tear-off path itself ensures it before any hazard.
        try { this._wvEnsureReaderTabWindowSafety(); } catch (e) {}
    }

    /** init phase 3: The notifier for new reader tabs and items. */
    _wvInitReaderNotifier() {
        // 3. Notifier: new reader tabs
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: async (event, type, ids) => {
                if (type !== "tab") return;
                // Dispose re-homed NON-ReaderTab readers whose main tab closed.
                // Zotero's own tab-close handler resolves readers via getByTabID,
                // which matches `instanceof ReaderTab` only — a ReaderWindow
                // instance Weavero re-homed into a main tab (window→main merge of
                // a RESTORED torn-off window) is invisible to it, so its tab
                // closing left a zombie in Zotero.Reader._readers: dead-object
                // getters, repeated "Waiting for reader failed" from session
                // saves, and Reader.open reusing the corpse so the item could
                // never be reopened (2026-07-16 incident, item 146).
                if (event === "close") {
                    try {
                        const rs: any[] = (Zotero.Reader as any)._readers || [];
                        for (const id of (ids as any[]) || []) {
                            const r = rs.find((x: any) => {
                                try {
                                    return Object.getOwnPropertyDescriptor(x, "tabID") && x.tabID === id
                                        && x.constructor && x.constructor.name !== "ReaderTab";
                                } catch (e) { return false; }
                            });
                            if (!r) continue;
                            try { if (typeof r.uninit === "function") r.uninit(); } catch (e) {}
                            try { const i = rs.indexOf(r); if (i >= 0) rs.splice(i, 1); } catch (e) {}
                            Zotero.debug("[Weavero] disposed re-homed non-ReaderTab reader for closed tab " + id);
                        }
                        // Sweep aborted disposals: if a reader's uninit() threw
                        // mid-way (e.g. a Proxy-forwarded read hitting a dead
                        // _internalReader), Reader.notify set _isUninitialized
                        // but never reached its splice — the corpse then poisons
                        // getByTabID and Reader.open reuse. An uninitialized
                        // reader must never stay registered. Deferred so the
                        // sweep runs AFTER Zotero's own close handler.
                        (Zotero.getMainWindow() || { setTimeout }).setTimeout(() => {
                            try {
                                for (let i = rs.length - 1; i >= 0; i--) {
                                    let dead = false;
                                    try { dead = rs[i]._isUninitialized === true; } catch (e) { dead = true; }
                                    if (dead) {
                                        rs.splice(i, 1);
                                        Zotero.debug("[Weavero] swept uninitialized reader corpse from _readers");
                                    }
                                }
                            } catch (e) {}
                        }, 500);
                    } catch (e) { Zotero.debug("[Weavero] re-homed reader close cleanup err: " + e); }
                }
                // "load" too: after a cold start with a restored session, the
                // first reader loads into an EXISTING unloaded tab — that path
                // fires no "add", only "load" (markAsLoaded), so with only the
                // add trigger the prototype safety wraps stayed uninstalled
                // until the first genuinely new tab (observed live on the
                // beta.11 update restart, 2026-07-17).
                // ("load" is real — tabs.js markAsLoaded triggers it — but
                // zotero-types' tab-event union doesn't list it yet, hence
                // the cast.)
                if (event !== "add" && (event as string) !== "load") return;
                try { const lp = wvLivePlugin(); if (lp) lp._wvEnsureReaderTabWindowSafety(); } catch (e) {}
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 250));
                    for (const reader of Zotero.Reader._readers || [])
                        if (!this._readerObservers.has(reader)) this._setupReaderObserver(reader);
                }
            }
        }, ["tab"], "weavero-tab"));

        // 3a-pre. Notifier: close tabs whose item was DELETED in another
        // window. Zotero only closes such tabs in the window handling
        // the delete (single-window assumption) — a dead tab left in a
        // SECONDARY main/reader window makes the native tabsMenuPanel
        // refreshList throw (`item.getItemTypeIconName` on a false
        // item), which aborts the whole List-all-tabs render before
        // Weavero's decoration runs (seen live 2026-07-16: the anchor's
        // panel degraded to a bare list over one dead tab).
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: (event: any, type: any, ids: any) => {
                if (type !== "item" || event !== "delete") return;
                try {
                    const gone = new Set((ids || []).map((x: any) => parseInt(x, 10)));
                    for (const w of (Zotero.getMainWindows() || [])) {
                        const Z: any = (w as any).Zotero_Tabs;
                        for (const t of ((Z && Z._tabs) || []).slice()) {
                            const iid = t && t.data && t.data.itemID;
                            if (iid != null && (gone.has(iid) || !Zotero.Items.get(iid))) {
                                // Blind automation (A&T): tagging a just-deleted
                                // item's tab close as "read" is never right.
                                try {
                                    const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                                    if (lp) lp._wvBlindAutomationTabClose(t.id);
                                } catch (e) {}
                                try { Z.close(t.id); } catch (e) {}
                            }
                        }
                    }
                    const en = (Services as any).wm.getEnumerator("zotero:reader");
                    while (en.hasMoreElements()) {
                        const w: any = en.getNext();
                        const st = w._wvWT;
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        for (const t of ((st && st.tabs) || []).slice()) {
                            if (t.itemID != null && (gone.has(t.itemID) || !Zotero.Items.get(t.itemID))) {
                                try { if (lp && lp._wvWTCloseTab) lp._wvWTCloseTab(w, t.id); } catch (e) {}
                            }
                        }
                    }
                } catch (e) {}
            }
        }, ["item"], "weavero-dead-tab-close"));

        // 3a. Notifier: keep the ACTIVE (tracked) tab-session in sync as
        //     main-window tabs open/close/change. (Reader-window tabs flow
        //     through _wvWTPersistSaveDebounced; window close through unload.)
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: (event, type, ids) => {
                if (type === "tab" && (event === "add" || event === "close" || event === "select")) {
                    // Ring (diagnostic, 2026-10-16: a cross-window multi-move left
                    // one tab unmarked on MJT's instance, not in the runner --
                    // which tabs were added / selected / closed, by id).
                    try { (this as any)._wvTGDbg("tab " + event + " " + (ids || []).join(",")); } catch (e) {}
                    try { this._wvTabSessionTrackingUpdate(); } catch (e) {}
                }
            }
        }, ["tab"], "weavero-tabsession-track"));

        // 3b. Notifier: annotation lifecycle (delete/trash/modify).
        // Backstop for the proactive Delete/Backspace handler — the
        // notifier fires only after Zotero's DB transaction + queue
        // commit (often ~100–300 ms after the keystroke), so this
        // path runs second. We still use it because it's the only
        // signal that catches non-keyboard deletions (right-click →
        // Delete, undo, sync). Keys are stamped into
        // _recentlyDeletedKeys so the inner observer's debounced
        // overlay scan can't recreate badges while Zotero's in-memory
        // cache is still settling.
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: (event, type, ids, extraData) => {
                if (type !== "item") return;
                if (event !== "delete" && event !== "trash"
                    && event !== "modify" && event !== "add") return;

                // Pull annotation keys from extraData (the items are
                // already gone from the DB so id-based lookup fails).
                const deletedKeys = new Set();
                if (event === "delete" || event === "trash") {
                    if (extraData && typeof extraData === "object") {
                        for (const id of ids || []) {
                            const meta = extraData[id];
                            if (meta && meta.key) deletedKeys.add(meta.key);
                        }
                    }
                }

                // Track the most-recently-touched annotation per
                // reader. The proactive Delete-key handler uses this
                // when `selectedAnnotationIDs` returns a stale key
                // (the bug we're working around: after a delete,
                // creating a fresh annotation, then pressing Delete,
                // the reader's selectedAnnotationIDs still pointed at
                // the previous, deleted key — so the proactive path
                // tried to remove a badge that was already gone, and
                // the slow notifier path was the only thing that
                // could clean up the new annotation's badge).
                if (event === "add" || event === "modify") {
                    try {
                        for (const id of ids || []) {
                            let item;
                            try { item = Zotero.Items.get(id); } catch (e2) { continue; }
                            if (!item || !item.isAnnotation || !item.isAnnotation()) continue;
                            const parentID = item.parentItemID;
                            const key = item.key;
                            if (!parentID || !key) continue;
                            for (const reader of Zotero.Reader._readers || []) {
                                if (reader._item && reader._item.id === parentID) {
                                    const data = this._readerObservers.get(reader);
                                    if (data) {
                                        data.lastTouchedAnnotationKey = key;
                                        this._dbg("[Weavero] lastTouched: key="
                                            + key + " event=" + event);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        Zotero.debug("[Weavero] lastTouched track error: " + e);
                    }
                }

                // ── Filter-side reapply hooks. Must run BEFORE the
                // 'add' early-return below, otherwise the items-list
                // filter never recomputes after item creation.
                if (event === "add" && ids && ids.length) {
                    // Switched from `Set<id>` to `Map<id, timestamp>`
                    // so the apply loop can expire entries. The
                    // original `Set` was session-lifetime — items
                    // created during a session stayed force-included
                    // forever, defeating the filter for the user's
                    // own test items. With a timestamp the force-
                    // include window only covers the brief moment
                    // after creation where Zotero's auto-select +
                    // itemBox lookup would otherwise fail.
                    if (!this._wvRecentlyAddedItemIDs
                        || typeof (this._wvRecentlyAddedItemIDs as any).set !== "function") {
                        // Migrate any pre-fix Set instance.
                        this._wvRecentlyAddedItemIDs = new Map();
                    }
                    const now = Date.now();
                    for (const id of ids) (this._wvRecentlyAddedItemIDs as any).set(id, now);
                }
                if (event === "add" || event === "modify"
                    || event === "delete" || event === "trash") {
                    try {
                        const fa = this._isFilterActive(this._filterState);
                        Zotero.debug("[Weavero][add-debug] notifier"
                            + " event=" + event
                            + " ids=" + JSON.stringify(ids)
                            + " filterActive=" + fa);
                        if (fa) {
                            const win = Zotero.getMainWindow();
                            const itemsView = win && win.ZoteroPane
                                && win.ZoteroPane.itemsView;
                            const rp = itemsView && itemsView.rowProvider;
                            const info = {
                                rowsLen: rp && rp._rows ? rp._rows.length : "?",
                                wrappedRowCount: itemsView && itemsView.rowCount,
                                origRowCount: rp && rp._wvOrigGetRowCount
                                    ? rp._wvOrigGetRowCount() : "n/a",
                            };
                            for (const id of ids || []) {
                                info["rowMap[" + id + "]"] = itemsView
                                    && itemsView._rowMap
                                    ? itemsView._rowMap[id] : "n/a";
                            }
                            Zotero.debug(
                                "[Weavero][add-debug] state at notifier: "
                                + JSON.stringify(info));
                        }
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero][add-debug] state probe err: " + e);
                    }
                }
                if (event === "add" && ids && ids.length
                    && this._isFilterActive(this._filterState)) {
                    Zotero.debug(
                        "[Weavero][add-debug] pausing filter patches"
                        + " for add of " + JSON.stringify(ids));
                    try {
                        this._pauseFilterPatches();
                        Zotero.debug(
                            "[Weavero][add-debug] paused OK");
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero][add-debug] pause err: " + e);
                    }
                }
                if ((event === "add" || event === "modify"
                    || event === "delete" || event === "trash")
                    && this._isFilterActive(this._filterState)) {
                    try {
                        const win = Zotero.getMainWindow();
                        if (this._filterReapplyTimer) {
                            win.clearTimeout(this._filterReapplyTimer);
                        }
                        const scheduledIDs = ids ? [...ids] : [];
                        const evt = event;
                        this._filterReapplyTimer = win.setTimeout(() => {
                            this._filterReapplyTimer = null;
                            Zotero.debug(
                                "[Weavero][add-debug] deferred reapply firing"
                                + " (event=" + evt
                                + " scheduledIDs=" + JSON.stringify(scheduledIDs)
                                + " recentlyAddedSize="
                                + (this._wvRecentlyAddedItemIDs
                                    ? this._wvRecentlyAddedItemIDs.size : 0)
                                + ")");
                            try {
                                this._applyItemsListFilter({ cascade: false });
                                const itemsView2 = Zotero.getMainWindow()
                                    && Zotero.getMainWindow().ZoteroPane
                                    && Zotero.getMainWindow().ZoteroPane.itemsView;
                                const rp2 = itemsView2 && itemsView2.rowProvider;
                                const post = {
                                    wrappedCount: itemsView2 && itemsView2.rowCount,
                                    origCount: rp2 && rp2._wvOrigGetRowCount
                                        ? rp2._wvOrigGetRowCount() : "n/a",
                                };
                                for (const id of scheduledIDs) {
                                    post["rowMap[" + id + "]"] = itemsView2
                                        && itemsView2._rowMap
                                        ? itemsView2._rowMap[id] : "n/a";
                                }
                                Zotero.debug(
                                    "[Weavero][add-debug] post-reapply: "
                                    + JSON.stringify(post));
                            } catch (e) {
                                Zotero.debug(
                                    "[Weavero][add-debug] reapply err: " + e);
                            }
                        }, 100);
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero][filter] notifier reapply schedule err: " + e);
                    }
                }

                // Only the delete/trash/modify branches do reader-
                // doc work below; 'add' alone just primes the
                // lastTouched tracker and exits.
                if (event === "add") return;

                for (const reader of Zotero.Reader._readers || []) {
                    const data = this._readerObservers.get(reader);
                    const innerDoc = data && data.innerDoc;
                    if (!innerDoc) continue;

                    // Stamp deleted keys so the debounced overlay scan
                    // skips recreating their badges. Cleared again by
                    // _processNoteAnnotationOverlays once getAnnotations()
                    // stops returning the key (cache caught up), or
                    // after 60 s as a safety net.
                    if (deletedKeys.size) {
                        const now = Date.now();
                        for (const k of deletedKeys) {
                            this._recentlyDeletedKeys.set(k, now);
                        }
                    }

                    // Direct DOM removal by key — both inner PDF.js
                    // and outer reader iframe (badges may live in
                    // either depending on Zotero's layout).
                    let removed = 0;
                    if (deletedKeys.size) {
                        let outerDoc = null;
                        try {
                            const iwin = reader._iframeWindow
                                || (reader._iframe && reader._iframe.contentWindow);
                            if (iwin && iwin.document) outerDoc = iwin.document;
                        } catch (e) {}
                        for (const doc of [innerDoc, outerDoc]) {
                            if (!doc) continue;
                            for (const k of deletedKeys) {
                                for (const badge of doc.querySelectorAll(
                                    ".wv-marker-badge[data-wv-for=\"" + k + "\"]")) {
                                    badge.remove();
                                    removed++;
                                }
                            }
                        }
                        if (removed) {
                            this._dbg("[Weavero] notifier "
                                + event + " removed " + removed
                                + " badge(s) keys="
                                + JSON.stringify([...deletedKeys]));
                        }
                    }

                    // Refresh text-annotation buttons. For delete/
                    // trash skip the full overlay scan — getAnnotations()
                    // may still return the just-deleted annotation
                    // (cache stale), and the inner observer will run
                    // the scan ~100 ms later anyway, by which time the
                    // _recentlyDeletedKeys gate is in place.
                    try { this._processTextAnnotations(innerDoc); }
                    catch (e) { Zotero.debug("[Weavero] notifier text-ann scan: " + e); }
                    if (event !== "delete" && event !== "trash") {
                        try { this._processNoteAnnotationOverlays(innerDoc, reader); }
                        catch (e) { Zotero.debug("[Weavero] notifier overlay scan: " + e); }
                    }
                }

                // Refresh relations icons across both surfaces (reader
                // sidebar + right pane). Relations are stored as
                // `dc:relation` triples on items and don't flow into
                // the reader's React annotation prop or trigger a
                // right-pane row re-render — so neither
                // renderSidebarAnnotationHeader nor the right-pane
                // mutation observer catches a relation add/remove.
                // We drive the refresh from the notifier instead:
                // `addRelatedItem` / `removeRelatedItem` both `save()`
                // the involved items, which fires "modify".
                //
                // Bounded by visible rows (typically <50 per surface)
                // and gated on each surface pref, so this is cheap to
                // run on every item modification.
                if (event === "modify" || (event as string) === "add"
                    || (event as string) === "delete" || (event as string) === "trash") {
                    try { this._reinjectAllSidebars(); }
                    catch (e) { Zotero.debug(
                        "[Weavero] notifier sidebar reinject: " + e); }
                    try { this._scanPaneRows(); }
                    catch (e) { Zotero.debug(
                        "[Weavero] notifier pane reinject: " + e); }
                }

                // Items-list filter: when active, the row-keep array
                // is computed against the current `_rows` snapshot. A
                // new item lands in `_rows` via Zotero's own notifier
                // handler — but our `keep` doesn't know about it, so
                // the new row is invisible (and the items pane goes
                // inconsistent: itemBox tries to render `this.item`
                // and gets `undefined`). Defer a re-apply so Zotero's
                // tree handler runs first; debounced so a burst of
                // modifies (e.g. during sync) doesn't thrash.
                //
                // Newly-created items are tracked in a session Set so
                // the filter pass can force-include them — otherwise
                // a brand-new item that doesn't yet match the active
                // filter (e.g. a fresh Journal Article with no yellow
                // annotations under an annotation-color=yellow filter)
                // would be created, selected by Zotero, then promptly
                // hidden, leaving the item box without a current
                // item.
            }
        }, ["item"], "weavero-item"));

        // 3c. Notifier: live-refresh reader bookmark names when a bookmarked
        // annotation / item / collection changes while the Bookmarks pane is
        // open. Cheap by design (see _wvReaderBmOnNotify): it no-ops unless a
        // reader currently shows the pane AND a changed id is actually
        // bookmarked there, and the re-render is debounced.
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: (event, type, ids) => {
                try { this._wvReaderBmOnNotify(event, type, ids); } catch (e) {}
                // Reader-filter resurrection guard: re-hide a filtered-out
                // annotation that core's notifier just re-pushed (see
                // _wvReaderFilterOnNotify).
                try { (this as any)._wvReaderFilterOnNotify(event, type, ids); } catch (e) {}
            }
        }, ["item", "collection"], "weavero-reader-bm"));
    }

    /** init phase 4: The polling fallback for readers the notifier misses. */
    _wvInitReaderPolling() {
        // 4. Polling fallback for readers
        this._pollInterval = setInterval(() => {
            for (const reader of Zotero.Reader._readers || [])
                if (!this._readerObservers.has(reader)) this._setupReaderObserver(reader);
        }, 2000);
    }

    /** init phase 5: Readers already open at load time. */
    async _wvInitOpenReaders() {
        // 5. Readers already open at load time
        for (const reader of Zotero.Reader._readers || [])
            await this._setupReaderObserver(reader);
        // A reload can land during any await of init (an install then an
        // immediate reload): stop instead of wiring windows and menus for a
        // destroyed instance -- its plain listeners (items / collections
        // context menus, Copy Link menu) stayed for the session (live audit,
        // 2026-10-13). Same check after each await below.
        if ((this as any)._wvDestroyed) return;
    }

    /** init phase 6: Every main window's wiring (the wiring table), the anchor's restore chain. */
    async _wvInitMainWindows() {
        // 6. Per-main-window wiring (tree click delegate, filter bar,
        // tabs-menu library sort, libraries highlight, pane observer, ...):
        // the wiring table, run for every open main window near the end of
        // init (modules/window-wiring.ts).

        // 6b. Resolve the icon URLs used by `decorateContextMenu`. The
        // reader iframe is content (loaded from `resource://zotero/`),
        // which Mozilla's CheckLoadURI policy forbids from linking to
        // `jar:file:///…/weavero.xpi!/icon-16.png` — `<img src>` set
        // to the raw `_rootURI + …` path triggers a "may not load or
        // link to" Security Error and renders the broken-image glyph.
        // Workaround: fetch the icon once at startup and embed it as
        // a `data:image/png;base64,…` URL, which is allowed inside
        // content. Cache BOTH light and dark variants on the instance
        // so we can swap them based on theme without re-encoding.
        // `decorateContextMenu` reads `_menuItemIconURL` (a getter
        // below) to pick the right variant at use time.
        const encodeIcon = async (path) => {
            try {
                const resp = await fetch(_rootURI + path);
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let bin = "";
                for (let i = 0; i < bytes.length; i++) {
                    bin += String.fromCharCode(bytes[i]);
                }
                return "data:image/png;base64," + btoa(bin);
            } catch(e) {
                Zotero.debug("[Weavero] menu icon encode err ("
                    + path + "): " + e);
                return "";
            }
        };
        this._menuItemIconURLLight = await encodeIcon("icons/icon-light-16.png");
        this._menuItemIconURLDark  = await encodeIcon("icons/icon-dark-16.png");
        if ((this as any)._wvDestroyed) return;
        // Back-compat alias: callers that read `_menuItemIconURL`
        // directly (rather than the getter below) get the
        // theme-appropriate URL via the getter property.
        Object.defineProperty(this, "_menuItemIconURL", {
            get: () => this._detectUIDark()
                ? this._menuItemIconURLDark
                : this._menuItemIconURLLight,
            configurable: true,
        });
        // (Chain icon for the iframe React menu is rendered as inline
        // <svg> by `decorateContextMenu` via `_makeRelationsSvg`, which
        // uses a baked amber fill via prefers-color-scheme — see
        // `_injectReaderStyles`.)
        // For the chrome XUL items-tree menu, bake amber-fill data URLs
        // (one per theme) so the chain icon matches the sidebar's
        // `.wv-btn-relations` color regardless of theme. The system
        // chrome://...related.svg uses `context-fill` which resolves
        // to the menu's neutral icon color, not amber.
        try {
            this._relationsIconURLLight = "data:image/svg+xml;base64,"
                + btoa(SCHEME_SVG_TEMPLATE.replace("__FILL__", "#7a4a00"));
            this._relationsIconURLDark = "data:image/svg+xml;base64,"
                + btoa(SCHEME_SVG_TEMPLATE.replace("__FILL__", "#ffb84d"));
        } catch (e) {
            Zotero.debug("[Weavero] relations icon encode err: " + e);
            this._relationsIconURLLight = "";
            this._relationsIconURLDark  = "";
        }

        // 7b. Items-tree right-click menu — adds "Add related item…"
        // when the right-clicked selection contains annotation(s).
        this._setupItemsListContextMenu();
        // 7b-bis. Collections-tree right-click menu — adds
        // "Copy Collection Link" on collection rows.
        this._setupCollectionsContextMenu();
        // 7b-ter. Reader-tab right-click menu — adds Copy Select Link /
        // Copy Open Link for the tab's attachment (via Zotero.MenuManager;
        // no-op on builds without that API).
        this._registerTabContextMenu();
        // 7b-quater. File / Edit menubar entries for the window commands (the
        // hamburger's New Tab / New Reader Window / New Main Window, and
        // Advanced Search in New Window) -- the only menu home of these on
        // macOS, where the hamburger is never built.
        try { (this as any)._wvRegisterMenubarWindowEntries(); } catch (e) {}
        try { (this as any)._wvRegisterCollectionMenuEntries(); } catch (e) {}
        // Keep reader-window tab titles in sync with the "Show tabs as" setting.
        try { (this as any)._wvRegisterTabTitlePrefObserver(); } catch (e) {}
        // Boot tracer for the group-restore investigation (2026-07-27): records
        // every stamp write/clear + per-apply membership for ~90s, flushed to
        // weavero/boot-groups-trace.json so it survives the restart it traces.
        try { (this as any)._wvBootTraceArm(); } catch (e) {}
        // Clean tear-off for the dev outline-eval pref: toggling it re-renders
        // the dev surfaces and strips any active dev filter (see _wvOeOnPrefToggle).
        try { (this as any)._wvOeRegisterPrefObserver(); } catch (e) {}
        // Same mechanism for the Pin/Unpin Tab entry (Firefox-style pinning).
        this._registerPinTabMenu();
        // (The "Move Tab"→"Move Tabs" multi-select relabel is folded into the
        // pin menu's onShowing — see _registerPinTabMenu — since a standalone
        // hidden MenuManager item never relabeled reliably.)
        // Firefox-style tab groups (chip + colored underline in the tab bar).
        this._registerTabGroupMenus();
        // (Named tab sessions live in the "List all tabs" dropdown panel — see
        // _wvTabSessionsMenuSection, hooked into the tabs-menu refresh in
        // modules/tabs.ts — so there's no context-menu registration here.)
        // ("New Main Window" no longer registers on the library-tab context
        // menu — superseded by Ctrl+N and the hamburger entry, user request
        // 2026-07-15. _registerDevNewWindowMenu is kept for reference but
        // unused.)
        // "Reopen Closed Window / Group" tab-menu entry (Weavero's closed stack).
        try { (this as any)._registerReopenClosedMenu(); } catch (e) {}
        // Plugins Manager search box (Ctrl+F filter over installed plugins).
        try { (this as any)._registerPluginsSearch(); } catch (e) {}
        // Windows that miss a desktop button-side change get nudged.
        try { (this as any)._wvWireCsdRefresh(); } catch (e) {}
        // Unified Weavero window store (Phase 1): flush dev-window state on
        // quit, and once the UI is ready re-open the dev windows that were
        // open last time (gated by newMainWindow + sessionAutoReopen).
        try { this._wvWindowStoreRegisterQuitFlush(); } catch (e) {}
        try {
            (Zotero as any).uiReadyPromise
                .then(() => { try { this._wvGuardAllContextPanes(); } catch (e) {} })
                // Edit › Undo hook + the reader's Ctrl+Y on EVERY main window
                // once the UI is ready: the boot window loads before the plugin
                // (no onMainWindowLoad) and the init loop can miss it -- Ctrl+Y
                // was absent after a real start (0.21.7). Idempotent.
                .then(() => {
                    try {
                        for (const w of wvMainWins()) {
                            try { (this as any)._wvWireEditUndoMenu(w); } catch (e) {}
                        }
                    } catch (e) {}
                })
                // Restore takeover, boot side: Zotero only restored the library
                // tab — rebuild the anchor's real tab set first (it's the window
                // the user is looking at). Needs the boot store doc, which the
                // restore-map loader stashes.
                .then(() => (async () => {
                    try {
                        await (this as any)._wvWTLoadRestoreMap();
                        (this as any)._wvTrace("restore: anchor tabs");
                        await (this as any)._wvRestoreAnchorTabs();
                    } catch (e) {}
                })())
                // BACKGROUND RESTORE: from here on, windows opening during the
                // restore are pushed to the BOTTOM of the z-order without
                // activation and focus snaps straight back to the quit-time
                // window (Windows-only; the shepherd below stays as backstop).
                .then(() => { try { (this as any)._wvBgRestoreStart(); } catch (e) {} })
                .then(() => { try { (this as any)._wvTrace("restore: dev main windows"); this._wvWindowStoreRestoreDevWindows(); } catch (e) {} })
                // Firefox-style: open EVERY window up-front (all held behind the
                // focused tab). Post-takeover the store is the source of truth;
                // Zotero-session entries merge in for pre-takeover stores.
                .then(() => { try { (this as any)._wvPreemptReaderWindowReopen(); } catch (e) {} })
                // Keep the user's quit-time window on top while background
                // windows open (each steals focus as it appears).
                .then(() => { try { (this as any)._wvFocusShepherdStart(); } catch (e) {} })
                .then(() => { try { (this as any)._wvTrace("restore: orphan reader windows"); this._wvWindowStoreRestoreOrphanReaderWindows(); } catch (e) {} })
                // FOCUSED-FIRST: if the quit-time focus was a reader window,
                // don't leave it behind the adaptive grace — give Zotero a
                // short beat to reopen it natively, then jump the queue.
                .then(() => (async () => {
                    try {
                        await (this as any)._wvWTLoadRestoreMap();
                        const f = (this as any)._wvBootFocusedEntry;
                        if (!f || f.kind !== "reader" || f.itemID == null) return;
                        const wait = (ms: number) => wvSleep(ms);
                        for (let i = 0; i < 4; i++) {
                            if ((this as any)._wvReaderWindowHostingItem(f.itemID)) return;
                            // A window for the item is already OPENING (the
                            // preemptive reopen fires before this prioritizer)
                            // — reopening here created a DUPLICATE that won the
                            // adopt while the original was culled seconds later:
                            // user-visible window churn + a late final window.
                            if ((this as any)._wvReaderWindowInFlight && (this as any)._wvReaderWindowInFlight(f.itemID)) return;
                            await wait(400);
                        }
                        if ((this as any)._wvReaderWindowHostingItem(f.itemID)) return;
                        if ((this as any)._wvReaderWindowInFlight && (this as any)._wvReaderWindowInFlight(f.itemID)) return;
                        if (!Zotero.Items.exists(f.itemID)) return;
                        (this as any)._wvTrace("restore: focused reader window prioritized — reopening now");
                        await (Zotero as any).Reader.open(f.itemID, null, { openInWindow: true });
                    } catch (e) {}
                })())
                // Grace for Zotero's native reader-window reopen, then recreate
                // any saved reader window it did NOT bring back (extras would
                // otherwise sit unclaimed in the restore map and be lost).
                // ADAPTIVE: proceed once the open reader-window count is stable
                // for 2 ticks (≥1.5 s) — or the restore map is already fully
                // consumed — instead of a flat 6 s; 6 s stays as the cap.
                .then(() => new Promise((res) => {
                    try {
                        const setT = wvTimeout;
                        let last = -1, stable = 0, waited = 0;
                        const tick = () => {
                            waited += 500;
                            let n = 0;
                            try { const en = Services.wm.getEnumerator("zotero:reader"); while (en.hasMoreElements()) { en.getNext(); n++; } } catch (e) {}
                            if (n === last) stable++; else { stable = 0; last = n; }
                            const mapDone = !(this as any)._wvWTRestoreActive;
                            if (mapDone || (stable >= 2 && waited >= 1500) || waited >= 6000) { res(null); return; }
                            setT(tick, 500);
                        };
                        setT(tick, 500);
                    } catch (e) { res(null); }
                }))
                .then(() => { try { (this as any)._wvTrace("restore: unclaimed reader windows check"); return (this as any)._wvWindowStoreRestoreUnclaimedReaderWindows(); } catch (e) { return null; } })
                // Verify-and-repair the anchor window against last quit's saved
                // session (native restore drops tabs whose items weren't cached
                // yet); items are loaded by this point in the chain.
                .then(() => {
                    // BOOT-ONLY: the verify-and-repair compares live tabs to the
                    // BOOT session snapshot. On a hot-reload/enable mid-session
                    // that snapshot is stale — the repair re-added tabs the user
                    // (or a group migrate) had deliberately closed, resurrecting
                    // them with group stamps (2026-07-03). APP_STARTUP=1;
                    // undefined = old bootstrap shim → behave as before.
                    const rsn = (this as any)._wvStartupReason;
                    if (rsn !== undefined && rsn !== 1) return null;
                    try { return (this as any)._wvReconcileAnchorSessionTabs(); } catch (e) { return null; }
                })
                // Pull reader tabs that a previous DISABLE migrated into the main
                // window back into their reader windows (consumes the hand-off
                // file; no-op if absent). After the orphan restore so any windows
                // it recreated are present to receive their tabs.
                .then(() => this._wvEnablePullBackReaderTabs())
                .then(() => { try { this._wvGuardAllContextPanes(); } catch (e) {} })
                // Lift the startup group-deletion guard once reader-window restore
                // has settled, then re-apply so any genuinely-empty group is
                // cleaned. `_wvWTRestoreActive` is now consumption-based (flips
                // off when the last store entry is applied), so the floor only
                // needs to cover the managed-window restore's retry pass (~4 s)
                // — was 8 s against a 30 s expiry timer. 35 s backstop unchanged.
                .then(() => {
                    try {
                        const setT = wvTimeout;
                        let waited = 0;
                        let structLogged = false;
                        const tick = () => {
                            waited += 1000;
                            const active = !!(this as any)._wvWTRestoreActive;
                            // Managed dev windows must be spawned + initialized too
                            // (their restoreState carries group stamps).
                            let devBusy = !!(this._wvPendingDevWindow
                                || (this._wvDevSpawnQueue && this._wvDevSpawnQueue.length));
                            // A spawned managed window is STILL BUSY until its
                            // restoreState has filled its tabs (that's what
                            // carries the group stamps back). Lifting between
                            // spawn and restoreState-out left a ~200ms window
                            // where a group's home was unresolvable and the
                            // claim pass grabbed a duplicate member copy in the
                            // ANCHOR window → group split across two windows.
                            // (Restored managed windows always have >1 tab —
                            // the store only saves them that way.)
                            try {
                                if (!devBusy) {
                                    for (const w of (Zotero.getMainWindows() || [])) {
                                        if ((w as any)._wvManagedWindow && w.Zotero_Tabs
                                                && w.Zotero_Tabs._tabs.length <= 1) { devBusy = true; break; }
                                    }
                                }
                            } catch (e) {}
                            // The user-visible milestone: every window and group
                            // exists (tabs may still be loading their content).
                            if (!active && !devBusy && !structLogged) {
                                structLogged = true;
                                try {
                                    const nw = (Zotero.getMainWindows() || []).length;
                                    let nr = 0; const en2 = Services.wm.getEnumerator("zotero:reader");
                                    while (en2.hasMoreElements()) { en2.getNext(); nr++; }
                                    (this as any)._wvTrace("restore: STRUCTURE READY — " + nw + " main + " + nr + " reader window(s), all groups placed; tab content continues loading");
                                } catch (e) {}
                            }
                            if ((!active && !devBusy && waited >= 3000) || waited >= 35000) {
                                (this as any)._wvTabGroupRestoreGuard = false;
                                try { (this as any)._wvTrace("restore: group guard lifted after " + waited + "ms (readerRestoreActive=" + active + ")"); } catch (e) {}
                                try {
                                    const wins = wvMainWins();
                                    for (const w of wins) {
                                        // Re-cluster any group whose members were
                                        // restored non-contiguously (session order can
                                        // wedge a loose tab into a group's run) BEFORE
                                        // chipping — otherwise a stamped member renders
                                        // orphaned from its group.
                                        try { (this as any)._wvTabGroupStabilize(w); } catch (e) {}
                                        this._applyTabGroups(w);
                                    }
                                } catch (e) {}
                                // Safety: any still-held reader-window opens go now.
                                try { (this as any)._wvReleaseReaderOpens("guard lift"); } catch (e) {}
                                // Late verify-and-repair for managed windows (other
                                // plugins mutate tabs during window load — see the
                                // method comment; runs after they're done).
                                try {
                                    const rsn2 = (this as any)._wvStartupReason;
                                    if (rsn2 === undefined || rsn2 === 1) (this as any)._wvReconcileManagedWindows();
                                } catch (e) {}
                                // Land the user where they left off (window focus).
                                try { (this as any)._wvRestoreFocusedWindow(); } catch (e) {}
                                // The reader-window opens released above finish
                                // AFTER this focus restore and raise as they
                                // appear — while the background-restore observer
                                // dies within a tick of the guard lifting. Extend
                                // its hold through the late opens, and re-assert
                                // the focused window once they've settled
                                // ("landing on the wrong window at the end",
                                // 2026-07-04).
                                try { (this as any)._wvBgRestoreStart({ holdMs: 30000 }); } catch (e) {}
                                try { setT(() => { try { (this as any)._wvRestoreFocusedWindow(); } catch (e) {} }, 10000); } catch (e) {}
                                // Warm deferred background tabs once the dust has
                                // settled (one at a time, so nothing competes with
                                // whatever the user is doing).
                                try { setT(() => { try { (this as any)._wvIdleLoadDeferred(); } catch (e) {} }, 6000); } catch (e) {}
                                return;
                            }
                            setT(tick, 1000);
                        };
                        setT(tick, 1000);
                    } catch (e) { try { (this as any)._wvTabGroupRestoreGuard = false; } catch (e2) {} }
                })
                .catch(() => { try { (this as any)._wvTabGroupRestoreGuard = false; } catch (e) {} });
        } catch (e) {}
        // PDF Thumbnails right-click menu — "Add Bookmark to This Page"
        // and "Copy Link to This Page" via the Zotero.Reader plugin API.
        // One global registration covers every open reader (the hook is
        // not per-window).
        try { this._setupThumbnailContextMenu(); }
        catch (e) { Zotero.debug("[Weavero] init thumbnail menu err: " + e); }
        // Stolen-focus fix for external links: wrap CommandLineIngester so a
        // link whose target is already open focuses THAT window instead of
        // flashing the last-active main window (2026-08-05).
        try { (this as any)._wvWireCmdLineIngester(); } catch (e) {}
        // Filter perf caches (verdict cache + no-op-skip signature) must
        // drop on any data change — see _wvWireFilterCacheInvalidator.
        try { (this as any)._wvWireFilterCacheInvalidator(); } catch (e) {}

        // 7c. Pop-out note windows — main-window pane observer doesn't
        // see them, so wire a Window Mediator listener that catches
        // note.xhtml windows as they open.
        this._setupNoteWindowListener();
        // Software Update wizard — appends the running Zotero version
        // to the dialog (the built-in dialog never displays it).
        this._setupUpdateWindowListener();
        // Initial pass over any note surface that's already mounted
        // when the plugin starts (e.g. user enabled the toggle, then
        // restarted Zotero with a note already selected).
        if (this._getEnableNotes()) {
            try { this._processNoteRows(); }
            catch(e) { Zotero.debug("[Weavero] init note-rows err: " + e); }
            try { this._processNotesBoxes(); }
            catch(e) { Zotero.debug("[Weavero] init notes-box err: " + e); }
            try { this._processNoteEditors(); }
            catch(e) { Zotero.debug("[Weavero] init note-editors err: " + e); }
        }
    }

    /** init phase 8: The Settings pane, the saved icon pref. */
    async _wvInitPrefPane() {
        // 8. Preferences pane + apply saved icon pref
        await this._registerPrefPane();
        if ((this as any)._wvDestroyed) return;

        // 8b. If Settings was on the Weavero pane before this re-init
        //     (set in destroy()), navigate it back now that our pane is
        //     re-registered. Poll briefly for our pane to appear in the
        //     window's Zotero_Preferences.panes Map — register() triggers
        //     the addition asynchronously, so the entry may not be there
        //     on first try.
        try {
            const reopen = Zotero.Prefs.get("weavero._reopenOnInit");
            if (reopen) {
                try { Zotero.Prefs.set("weavero._reopenOnInit", false); }
                catch (e) {}
                const tryRestore = (retries: number) => {
                    try {
                        const wm = Components.classes[
                            "@mozilla.org/appshell/window-mediator;1"]
                            .getService(Components.interfaces.nsIWindowMediator);
                        const en = wm.getEnumerator("zotero:pref");
                        while (en.hasMoreElements()) {
                            const win: any = en.getNext();
                            const Zp = win.Zotero_Preferences;
                            if (!Zp || !Zp.panes
                                    || typeof Zp.navigateToPane !== "function") {
                                continue;
                            }
                            for (const entry of Zp.panes.entries()) {
                                const pane: any = entry[1];
                                if (pane
                                        && pane.pluginID === "weavero@mjthoraval") {
                                    Zp.navigateToPane(pane.id);
                                    Zotero.debug("[Weavero] reopenOnInit -> "
                                        + pane.id);
                                    return;
                                }
                            }
                        }
                    } catch (e) {
                        Zotero.debug("[Weavero] reopenOnInit nav err: " + e);
                        return;
                    }
                    if (retries > 0) setTimeout(() => tryRestore(retries - 1), 200);
                    else Zotero.debug("[Weavero] reopenOnInit gave up — pane not found");
                };
                setTimeout(() => tryRestore(15), 200);
            }
        } catch (e) {}
        // Items-list "Related" column.
        this._registerItemTreeColumns();
        this._applyInlineLinksPref(this._getInlineLinks());
        // Defensive: prune dead entries from `Zotero.Reader._readers`.
        // Earlier dev builds occasionally left a ReaderWindow in the list
        // after its chrome window was destroyed; the dead entry then
        // broke the next `Zotero.Reader.open` call ("can't access dead
        // object" at reader.js:73). Even with the unload-cleanup we
        // added in `_applyReaderCompactMenubar`, this self-heal at every
        // init keeps the user unblocked if a leak slips through.
        try {
            const readers = (Zotero as any).Reader?._readers;
            if (Array.isArray(readers)) {
                let pruned = 0;
                for (let i = readers.length - 1; i >= 0; i--) {
                    try {
                        const _ = readers[i].tabID;   // throws if dead
                    } catch (e) {
                        readers.splice(i, 1);
                        pruned++;
                    }
                }
                if (pruned) Zotero.debug("[Weavero] init: pruned " + pruned + " dead reader(s) from Zotero.Reader._readers");
            }
        } catch (e) {}

        // Compact title bar on already-open windows. Main windows: the
        // wiring table's compact-title-bar entry.
        try {
            // Standalone reader windows already open (enable, reload, update):
            // the reader-window wiring table's init path (window-wiring.ts) --
            // strip, Edit > Undo, item pane (rebuilt when another build left
            // it), Move to Tab. Newly opened readers take its render path.
            // Every reader window, including those with no native reader (a
            // deck window holding notes): _wvReaderWindowTargets.
            for (const t of (this as any)._wvReaderWindowTargets()) (this as any)._wvWireReaderWindow(t.win, t.r, "init");
        } catch (e) { Zotero.debug("[Weavero] init reader windows err: " + e); }
        this._applyUIThemeClass();
        // Sync per-scheme `network.protocol-handler.warn-external.<x>`
        // prefs with the user's "Open without confirmation" choice.
        // Idempotent — covers a Zotero restart with the toggle still on.
        try { this._applyAppLinkConfirmPref(); }
        catch(e) { Zotero.debug("[Weavero] init confirm sync err: " + e); }
        // React to OS-driven theme changes by listening on the main
        // window's prefers-color-scheme media query. Zotero's
        // theme-detection isn't fully exposed, but UI bg luma is
        // what _detectUIDark samples — and a media-query change is
        // a strong signal that bg may have flipped, so a re-detect
        // is appropriate.
        try {
            const win = Zotero.getMainWindow();
            if (win && win.matchMedia) {
                this._uiThemeMq = win.matchMedia("(prefers-color-scheme: dark)");
                this._uiThemeMqHandler = () => this._applyUIThemeClass();
                if (typeof this._uiThemeMq.addEventListener === "function") {
                    this._uiThemeMq.addEventListener("change", this._uiThemeMqHandler);
                }
            }
            // Also watch the Zotero main window's documentElement for
            // attribute/class flips. Zotero's three theme settings
            // (System / Light / Dark in General → Appearance) toggle
            // an attribute on this node; the matchMedia listener
            // above only catches the System-mode case where a flip
            // is OS-driven. Without this observer, a direct setting
            // change between Light and Dark wouldn't fire any of our
            // hooks until the next reader open / window load.
            const win2 = Zotero.getMainWindow();
            const doc2 = win2 && win2.document;
            if (doc2 && doc2.documentElement && win2.MutationObserver) {
                this._uiThemeObserver = new win2.MutationObserver(() => {
                    try { this._applyUIThemeClass(); } catch (e) {}
                });
                this._uiThemeObserver.observe(doc2.documentElement, {
                    attributes: true,
                    attributeFilter: [
                        "class", "lwtheme", "lwthemetextcolor",
                        "theme", "data-theme",
                    ],
                });
            }
        } catch (e) {}
    }

    /** init phase 9: The pref observer (the prefs-observers table). */
    _wvInitPrefObserver() {
        // 9. Watch pref changes from Settings pane
        // Use root branch + broad match to diagnose what path Zotero actually writes
        try {
            this._prefBranch = Services.prefs.getBranch("");
            this._prefObserver = {
                observe: (_s, _t, data) => {
                    // Only Weavero's own prefs: no entry reacts to any other
                    // (the root branch hears every Firefox pref write).
                    if (typeof data !== "string" || !data.startsWith("extensions.zotero.weavero.")) return;
                    for (const e of WV_PREF_OBSERVERS) {
                        if (!e.keys || e.keys.includes(data)) e.run(this, data);
                    }
                }
            };
            this._prefBranch.addObserver("", this._prefObserver, false);
            // Seed the reader-strip state so the FIRST Hide-Title-Bar toggle is
            // seen as a transition (extras migrate out / pull back — see the
            // compactTitleBar observer branch).
            try { (this as any)._wvPrevReaderStripOn = this._getCompactTitleBarReader(); } catch (e) {}
            Zotero.debug("[Weavero] pref observer registered on root branch");
        } catch(e) { Zotero.debug("[Weavero] pref observer error: " + e); }

        // Per-main-window wiring for windows ALREADY OPEN at init (plugin
        // enable / reload / upgrade; at app startup there are none yet and
        // onMainWindowLoad covers the boot window). Zotero dispatches
        // `onMainWindowLoad` only for NEWLY-OPENED windows (plugins.js wires a
        // window-mediator onOpenWindow listener, nothing for already-open
        // ones). The focused window runs the table's `both` entries -- init
        // performed the load-only steps for it itself; every OTHER open main
        // window takes the full load path, so enabling with several windows
        // doesn't leave them half-wired (observed: no styles / no decoration
        // observer / pins not collapsed in the background window).
        try {
            const focused = Zotero.getMainWindow();
            const all = wvMainWins();
            for (const w of all) {
                if (w === focused) continue;
                try { this.onMainWindowLoad(w); } catch (e) { Zotero.debug("[Weavero] init extra-window wiring err: " + e); }
            }
            if (focused && all.includes(focused)) (this as any)._wvWireMainWindow(focused, "init");
        } catch (e) { Zotero.debug("[Weavero] init window wiring err: " + e); }
        // Window-type title glyphs (opt-in) + per-window taskbar icons on
        // every open window (mains + readers), plus the in-window badge
        // dots for already-open reader windows (mains get theirs via
        // _wvUpdateMainWindowIndicator).
        try { (this as any)._wvRefreshTitleGlyphs(); } catch (e) {}
        try { (this as any)._wvRefreshWindowIcons(); } catch (e) {}
        try { (this as any)._wvRefreshWindowTaskbarIdentities(); } catch (e) {}
        // Permanent taskbar overlay badges on every window.
        try { (this as any)._wvRefreshTaskbarOverlays(); } catch (e) {}
        // Live pref toggle → regroup/split immediately.
        try {
            (this as any)._wvTaskbarPrefObs = Zotero.Prefs.registerObserver(
                "weavero.separateTaskbarButtons",
                () => { try { (this as any)._wvRefreshWindowTaskbarIdentities(); } catch (e) {} });
        } catch (e) {}
        try {
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try {
                    (this as any)._wvUpdateWindowBadgeDot(w,
                        !!(this as any)._getTabsAndWindowsMaster(), true);
                } catch (e) {}
            }
        } catch (e) {}

        // Reader-window active-tab self-heal: re-run the switch for each
        // deck's active tab shortly after (re)init — the switch chokepoint
        // detects zombie readers (dead iframe window) and re-realizes them,
        // so a tab left blank by a reload or context loss heals without the
        // user having to click away and back.
        try {
            const setT0 = wvTimeout;
            setT0(() => {
                try {
                    const ren = Services.wm.getEnumerator("zotero:reader");
                    while (ren.hasMoreElements()) {
                        const rw: any = ren.getNext();
                        const st = rw && rw._wvWT;
                        if (st && st.activeId) { try { (this as any)._wvWTSwitch(rw, st.activeId); } catch (e) {} }
                    }
                } catch (e) {}
            }, 2000);
        } catch (e) {}

        // DISABLE→ENABLE window round-trip: if the previous disable saved and
        // closed extra windows, restore them from the frozen store now.
        // (Once-guards in the restore entry points make racing the normal
        // startup restore a harmless no-op.)
        try { (this as any)._wvEnableRestoreClosedWindows(); } catch (e) {}

        Zotero.debug("[Weavero] initialized");
    }

    /** Called by the bootstrap shim when a fresh main window opens. The
     *  previous window's observers/handlers (if any) hold stale doc
     *  references — tear them down and re-attach to the live window.
     *  Called BEFORE init() too if Zotero opens the window before the
     *  plugin's init resolves; the teardown calls are no-op safe so this
     *  is idempotent. */
    onMainWindowLoad(_window) {
        // Every per-window step lives in the wiring table, in order
        // (modules/window-wiring.ts); init runs its `both` entries for the
        // window that was already open.
        try { (this as any)._wvWireMainWindow(_window, "load"); }
        catch (e) { Zotero.debug("[Weavero] onMainWindowLoad err: " + e); }
    }

    /** Called by the bootstrap shim when the main window closes. Disconnect
     *  observers eagerly so the next mutation in the dying doc doesn't go
     *  through dead refs. Lighter than destroy() — preferences observer,
     *  reader event listeners etc. survive across windows. */
    onMainWindowUnload(_window) {
        // Issue #35: arm the window-teardown latch BEFORE any teardown work.
        // The tab-close storm this unload triggers must never prune group
        // members or empty-delete groups (see tearingDown in tab-groups.ts).
        try { (this as any)._wvMainWindowClosingAt = Date.now(); } catch (e) {}
        // The other windows' open managers drop the window name once
        // one window is left -- after the closing one has left the mediator.
        try {
            const other: any = (Zotero.getMainWindows() || []).find((w: any) => w !== _window && !w.closed);
            if (other) other.setTimeout(() => { try { const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin; if (p && !p._wvDestroyed) p._wvHidMgrRefreshTitles(); } catch (e) {} }, 300);
        } catch (e) {}
        try { (this as any)._wvUnwireLoadURIHook(_window); } catch (e) {}
        try { (this as any)._wvUnwireItemCountBreakdown(_window); } catch (e) {}
        try { (this as any)._wvUnwireLastViewCloseGuard(_window); } catch (e) {}
        try { (this as any)._wvUnpatchTabsGetState(_window); } catch (e) {}
        try { (this as any)._wvUnwireQuickCopyMultiTab(_window); } catch (e) {}
        // The shared Zotero.TagSelector must not stay this window's class.
        try { (this as any)._wvTagSelectorClassRelease(_window); } catch (e) {}
        try {
            // Window-close upkeep, only when managed windows are in play:
            //  • re-anchor — if the closing window was the anchor, the new
            //    oldest window must be promoted (untagged) so Zotero keeps
            //    restoring the anchor (`_wvNormalizeAnchor`);
            //  • re-save — drop the closed window from the store.
            // Deferred so the closing window has left the window mediator first.
            try {
                let managedInPlay = !!(_window && _window._wvManagedWindow);
                if (!managedInPlay) {
                    const en = Services.wm.getEnumerator("navigator:browser");
                    while (en.hasMoreElements()) {
                        const w: any = en.getNext();
                        if (w !== _window && w._wvManagedWindow) { managedInPlay = true; break; }
                    }
                }
                if (managedInPlay) {
                    setTimeout(() => {
                        try { this._wvNormalizeAnchor(); } catch (e) {}
                        try { this._wvWindowStoreSaveDebounced(); } catch (e) {}
                    }, 50);
                }
            } catch (e) {}
            // A closed main window changes the workspace → update the active session.
            try { this._wvTabSessionTrackingUpdate(); } catch (e) {}
            this._teardownTreeClickDelegate(_window);
            // Per-window: drop only THIS window's items-menu handler. The global
            // _teardownItemsListContextMenu() unbinds AND clears the handler list
            // for every window, so closing one main window would strip the
            // "Open … in" / "Copy As" / "Add Related…" menu from all the others
            // (regression seen after closing duplicate windows).
            try {
                const closingMenu = _window && _window.document
                    && _window.document.getElementById("zotero-itemmenu");
                if (closingMenu) this._removeItemMenuHandlerFor(closingMenu);
            } catch (e) {}
            this._teardownCollectionsContextMenu(_window);
            this._teardownBookmarksToolbarButton(_window);
            this._teardownTabExternalRepositioner(_window);
            // Revert pinned-tab visuals (and the tab-bar decoration) so a
            // pinned tab returns to normal when the plugin is disabled; the
            // `weavero.pinnedTabs` pref is kept so re-enabling re-pins.
            this._teardownTabBarWiring(_window);
            this._teardownTabBarLibraryDecoration(_window);
            this._teardownPaneObserver(_window);
        } catch(e) {
            Zotero.debug("[Weavero] onMainWindowUnload err: " + e);
        }
    }

    /** Remove every Weavero DOM artifact from one main window: injected
     *  <style> elements, toolbar buttons, group chips, tooltips, per-tab
     *  attributes/classes and root classes. Used by destroy() for EVERY
     *  open main window (the detailed unwrap pass in destroy() only covers
     *  the first window; this generic sweep covers the rest and anything
     *  the detailed pass missed). Idempotent. */
    /** Put decorated TEXT back to its source: unwrap `.wv-md` / `.wv-url-span`
     *  (re-emitting the markdown markers / link brackets that tree mode
     *  stripped) and `.wv-text-wrap`. Runs for EVERY window from
     *  `_wvStripWindowChrome`, BEFORE its generic class sweep: that sweep
     *  removed any all-`wv-` element whose children were plain text --
     *  these spans -- together with the user's comment / label text, and
     *  the focused-window restore pass in destroy() then found nothing to
     *  restore (survey 2026-10-06). Idempotent. */
    _wvRestoreDecoratedText(doc: any) {
        try {
            for (const span of doc.querySelectorAll(".wv-md") as any) {
                const cls = span.className || "";
                let marker = "";
                if (cls.includes("wv-md-bold"))         marker = "**";
                else if (cls.includes("wv-md-italic"))  marker = "*";
                else if (cls.includes("wv-md-strike"))  marker = "~~";
                else if (cls.includes("wv-md-code"))    marker = "`";
                const prev = span.previousSibling;
                const haveMarker = !!(prev && prev.nodeType === 3
                    && (prev.nodeValue || "").endsWith(marker));
                const inner = span.textContent || "";
                const text = haveMarker ? inner : (marker + inner + marker);
                span.replaceWith(doc.createTextNode(text));
            }
            for (const span of doc.querySelectorAll(".wv-url-span") as any) {
                const inner = span.textContent || "";
                const href = span.getAttribute("data-href") || "";
                let text;
                if (!href || inner === href) {
                    // Bare URL — same in both modes.
                    text = inner;
                } else {
                    // Markdown link [label](url). Tree mode strips the brackets
                    // so the label is the only text; restore as `[label](url)`.
                    // Non-tree mode keeps `[` before and `](url)` after as
                    // adjacent text nodes; just unwrap the label.
                    const prev = span.previousSibling;
                    const prevHasBracket = !!(prev && prev.nodeType === 3
                        && (prev.nodeValue || "").endsWith("["));
                    text = prevHasBracket ? inner
                        : ("[" + inner + "](" + href + ")");
                }
                span.replaceWith(doc.createTextNode(text));
            }
            // `.wv-text-wrap` holds the host element's text content, so it is
            // unwrapped, never removed.
            for (const wrap of doc.querySelectorAll(".wv-text-wrap") as any) {
                const parent = wrap.parentNode;
                if (!parent) continue;
                while (wrap.firstChild) {
                    parent.insertBefore(wrap.firstChild, wrap);
                }
                parent.removeChild(wrap);
            }
        } catch (e) {}
    }

    _wvStripWindowChrome(w) {
        const doc = w && w.document;
        if (!doc) return;
        // All our injected UI/style elements carry a wv- id prefix -- or,
        // where the element must keep Zotero's classes and no id (the
        // collection menu's Hide item: menuitem-iconic + Zotero's icon
        // class, its id stamped by Zotero), the ownership marker
        // data-wv-owned. The class sweep below would keep such a node and
        // only take its wv- classes; the stripped node then sat among
        // Zotero's and shifted every id of its positional menu build
        // (2026-10-20). Guard: test/strip-chrome-text.spec.js.
        try {
            for (const el of [...doc.querySelectorAll("[id^='wv-'], [data-wv-owned]")]) {
                try { el.remove(); } catch (e) {}
            }
        } catch (e) {}
        try { doc.getElementById(STYLE_ID)?.remove(); } catch (e) {}
        // Decorated TEXT first (markdown / link spans, text wraps): their
        // source is put back before the generic sweep below can touch them.
        try { this._wvRestoreDecoratedText(doc); } catch (e) {}
        // Class-only Weavero elements (no wv- id — e.g. the quick-search
        // scope button): if EVERY class is wv-* and there's no id, the
        // element is ours. If it WRAPS NATIVE content (any descendant with
        // an id or a non-wv class) UNWRAP it: removing the shell outright
        // once deleted the native tabs-menu list inside a `.wv-winscope`
        // wrapper, leaving the List All Tabs popup permanently EMPTY (rows
        // rebuilt into the detached node). Otherwise REMOVE it whole, text
        // and all: by now the user's text is already back in place (the
        // decorated-text pass above), so what remains inside an all-wv
        // element is Weavero's own UI -- glyphs, labels, chips. Unwrapping
        // THAT leaked a "▾" from the scope button into the native search box
        // and twisties into the tabs-menu list on every reload (thirteen
        // chevrons in the search field, MJT 2026-10-07). Native elements we
        // merely decorated keep the element and lose just the wv- classes.
        // Guard: test/strip-chrome-text.spec.js.
        try {
            const wrapsNative = (el: any) => {
                try {
                    for (const d of el.querySelectorAll("*")) {
                        if (d.id) return true;
                        for (const c of d.classList) if (!String(c).startsWith("wv-")) return true;
                    }
                } catch (e) {}
                return false;
            };
            for (const el of [...doc.querySelectorAll("[class*='wv-']")]) {
                try {
                    if (!el.isConnected) continue;   // already handled via an ancestor
                    const classes = [...el.classList];
                    const wv = classes.filter((c) => c.startsWith("wv-"));
                    if (!wv.length) continue;
                    if (wv.length === classes.length && !el.id) {
                        if (wrapsNative(el)) {
                            const p = el.parentNode;
                            if (p) { while (el.firstChild) p.insertBefore(el.firstChild, el); }
                        }
                        el.remove();
                        continue;
                    }
                    for (const c of wv) el.classList.remove(c);
                } catch (e) {}
            }
        } catch (e) {}
        // Belt-and-braces: if the native tabs-menu list somehow ended up
        // DETACHED (a wrapper removal took it along), re-attach it — an
        // orphaned `_tabsList` makes every future refresh render into a
        // dead node and the popup shows empty forever.
        try {
            const panel: any = doc.getElementById("zotero-tabs-menu-panel");
            const list = panel && panel._tabsList;
            if (panel && list && !list.isConnected) {
                const home = panel.querySelector("#zotero-tabs-menu-wrapper") || panel;
                home.appendChild(list);
            }
        } catch (e) {}
        // Per-tab decorations (React re-creates tabs, but live nodes keep
        // whatever we stamped on them).
        try {
            for (const t of doc.querySelectorAll("#tab-bar-container .tab")) {
                try {
                    t.classList.remove("wv-pinned-tab");
                    t.removeAttribute("data-wv-pin-sticky");
                    t.removeAttribute("data-wv-pin-mirrored");
                    t.removeAttribute("data-wv-pin-preview");
                    t.removeAttribute("data-wv-drag-join");
                    t.style.removeProperty("--wv-group-color");
                } catch (e) {}
            }
        } catch (e) {}
        // Render/wiring marker attributes, doc-wide. The detailed cleanup in
        // destroy() only covers the FOCUSED window — the anchor kept its
        // `data-wv-ctx-wired` markers when a managed window was focused at
        // disable-time.
        try {
            for (const attr of ["data-wv-source", "data-wv-rendered", "data-wv-raw",
                "data-wv-related-rendered", "data-wv-ctx-wired", "data-wv-last-rebuild",
                "data-has-rich", "data-icon-wanted", "data-truncated", "data-has-url"]) {
                for (const el of doc.querySelectorAll("[" + attr + "]")) {
                    try { el.removeAttribute(attr); } catch (e) {}
                }
            }
        } catch (e) {}
        // Root mode classes.
        try {
            doc.documentElement.classList.remove(
                "wv-icons-only", "wv-ui-dark", "wv-anchor-window");
        } catch (e) {}
        // Simple unwraps for SECONDARY windows only — the primary window
        // gets the detailed source-restoring pass later in destroy()
        // (which re-emits markdown markers); a naive unwrap before it
        // would lose them.
        try { if (w === Zotero.getMainWindow()) return; } catch (e) {}
        try {
            for (const span of doc.querySelectorAll(".wv-md, .wv-url-span")) {
                try { span.replaceWith(doc.createTextNode(span.textContent || "")); } catch (e) {}
            }
            for (const wrap of doc.querySelectorAll(".wv-text-wrap")) {
                try {
                    const p = wrap.parentNode;
                    if (!p) continue;
                    while (wrap.firstChild) p.insertBefore(wrap.firstChild, wrap);
                    p.removeChild(wrap);
                } catch (e) {}
            }
            for (const el of doc.querySelectorAll(".wv-btn, .wv-tree-icon")) {
                try { el.remove(); } catch (e) {}
            }
        } catch (e) {}
    }

    destroy(reason) {
        // HARD STOP for every re-apply path (tab-bar decoration observer,
        // note-editor load listeners, style ensurers). These fire from
        // observers/listeners that outlive parts of this teardown — without
        // the flag, destroy's own DOM strips TRIGGER them and the chips /
        // pinned styles / note wiring resurrect right after removal
        // (observed on plugin disable, 2026-07-03).
        (this as any)._wvDestroyed = true;
        // Every listener this instance added through wvListen (lib/listen.ts),
        // on every window and frame: the next instance -- or none, on a
        // disable -- finds clean targets.
        try { wvUnlistenAll((this as any)._wvWireTag()); } catch (e) {}
        // Then by TABLE on every chrome window: what the registry missed
        // (see wvSweepTagOnChrome). Kept on the Zotero global for the
        // reload spec, so a miss names itself instead of passing silently.
        try {
            const missed = wvSweepTagOnChrome((this as any)._wvWireTag());
            if (missed.length) {
                Zotero.debug("[Weavero] destroy: the listener registry missed " + missed.length + ": " + missed.join(", "));
                const Z: any = Zotero;
                Z._wvListenSweepMisses = (Z._wvListenSweepMisses || []).concat(missed.map((m) => (this as any)._wvWireTag() + " " + m)).slice(-50);
            }
        } catch (e) {}
        // Popup click-outside dismissers still armed (reader.ts).
        for (const off of Array.from(((this as any)._wvDismissOffs || []) as any[])) { try { off(); } catch (e) {} }
        // Command-line ingester wrap lives on the Zotero global — restore it
        // (a reload re-wires the fresh instance's version).
        try { (this as any)._wvUnwireCmdLineIngester(); } catch (e) {}
        // Stop the background-restore observer NOW: its per-window hooks and
        // tick loop otherwise keep acting for this dead instance after a
        // reload mid-hold (user activations got hijacked).
        try {
            (this as any)._wvBgRestoreOn = false;
            (this as any)._wvBgRestoreHoldUntil = 0;
            (this as any)._wvBgRestoreTargetWin = null;
            (this as any)._wvBgUserChosenWin = null;
        } catch (e) {}
        // Default-child teardown. All three surfaces live on objects that
        // OUTLIVE the plugin — the Zotero global, Zotero.Item.prototype and
        // each window's zotero-itemmenu — so none of them go away on their
        // own. Order matters: drop the observer FIRST, or unwiring the
        // prototype could be undone by an observer callback firing mid-
        // teardown. See modules/attachments.ts.
        try { (this as any)._wvUnwirePluginObserver(); } catch (e) {}
        try { (this as any)._wvUnwireReparentGuard(); } catch (e) {}
        try { (this as any)._wvUnwireFilterCacheInvalidator(); } catch (e) {}
        try { (this as any)._wvUnwireDefaultChildPrefWatch(); } catch (e) {}
        try { (this as any)._wvUnwireDefaultAttachment(); } catch (e) {}
        try {
            for (const w of Zotero.getMainWindows()) {
                (this as any)._wvUnwireDefaultChildMenu(w);
            }
        } catch (e) {}
        // The item-pane message wrap also lives on a window-owned element
        // that outlives the plugin — disabling Weavero must give Zotero's
        // own count string back.
        try {
            for (const w of Zotero.getMainWindows()) {
                // Each unwire guarded on its own: one throwing must not leave
                // the next one's wrap (e.g. the macOS openPopupAtScreen
                // prototype wrap) in place (pre-release review 2026-10-05).
                try { (this as any)._wvUnwireItemCountBreakdown(w); } catch (e) {}
                try { (this as any)._wvUnwireLastViewCloseGuard(w); } catch (e) {}
                try { (this as any)._wvUnpatchTabsGetState(w); } catch (e) {}
                try { (this as any)._wvUnwireQuickCopyMultiTab(w); } catch (e) {}
                try { (this as any)._wvUnwireColumnPickerNativeFix(w); } catch (e) {}
                try { (this as any)._wvUnwireEditUndoMenu(w); } catch (e) {}
                try { (this as any)._wvUnwireMainNewTabShortcut(w); } catch (e) {}
            }
        } catch (e) {}
        // 0. FINAL store capture, then freeze — teardown below dismantles
        //    reader-window state (`_wvWT`), and any save it triggers after
        //    that would capture an emptied world and clobber windows.json
        //    (observed: a plugin reload dropped the reader entries). One
        //    last full capture now; no further writes from this instance.
        try {
            if (!(this as any)._wvQuitting) (this as any)._wvWindowStoreSaveSync();
            (this as any)._wvWindowStoreFrozen = true;
        } catch (e) {}
        try { (this as any)._wvUnwireEarlyRestoreTracing(); } catch (e) {}
        try { (this as any)._wvUnwireWindowCloseIndicators(); } catch (e) {}
        // Restore the per-window <item-details> tab-select filter.
        try {
            for (const w of (Zotero.getMainWindows() || [])) {
                try { (this as any)._wvUnpatchItemDetailsTabSelect(w); } catch (e) {}
            }
        } catch (e) {}
        // Strip the window-type title glyphs (removes the setter shadows)
        // and restore the native window icons.
        try { (this as any)._wvRefreshTitleGlyphs(true); } catch (e) {}
        try { (this as any)._wvRefreshWindowIcons(true); } catch (e) {}
        // Clear the taskbar overlay badges.
        try { (this as any)._wvRefreshTaskbarOverlays(true); } catch (e) {}
        // Fold all windows back into the shared taskbar group.
        try {
            for (const w of (Zotero.getMainWindows() || [])) {
                try { if ((w as any)._wvAumid) (this as any)._wvSetWindowAUMID(w, null); } catch (e) {}
            }
            const enR = Services.wm.getEnumerator("zotero:reader");
            while (enR.hasMoreElements()) {
                const w: any = enR.getNext();
                try { if (w._wvAumid) (this as any)._wvSetWindowAUMID(w, null); } catch (e) {}
            }
        } catch (e) {}
        try { if ((this as any)._wvTaskbarPrefObs) Zotero.Prefs.unregisterObserver((this as any)._wvTaskbarPrefObs); } catch (e) {}
        try { (this as any)._wvOeUnregisterPrefObserver(); } catch (e) {}
        // 0a. If Settings is currently open on the Weavero pane, mark a
        //     pref so init() can navigate back once the plugin re-
        //     registers its pane. Without this, plugin reinstall during
        //     dev iteration drops the user on Zotero's General pane
        //     because Settings auto-switches when our pane disappears.
        //     Note: Zotero assigns each plugin pane a generated id like
        //     "plugin-pane-XXXXXXXX-weavero@mjthoraval" — match by
        //     pluginID via Zotero_Preferences.panes Map, not by literal id.
        try {
            const wm = Components.classes[
                "@mozilla.org/appshell/window-mediator;1"]
                .getService(Components.interfaces.nsIWindowMediator);
            const en = wm.getEnumerator("zotero:pref");
            outer: while (en.hasMoreElements()) {
                const win: any = en.getNext();
                const Zp = win.Zotero_Preferences;
                if (!Zp || !Zp.panes || !Zp.navigation) continue;
                const curId = Zp.navigation.value;
                for (const entry of Zp.panes.entries()) {
                    const pane: any = entry[1];
                    if (pane && pane.pluginID === "weavero@mjthoraval"
                            && pane.id === curId) {
                        try { Zotero.Prefs.set("weavero._reopenOnInit", true); }
                        catch (e) {}
                        break outer;
                    }
                }
            }
        } catch (e) {}

        // 0. Restore Zotero.Utilities.Internal.openPreferences if we
        //    monkey-patched it in init(). Skips silently if the original
        //    was never saved (e.g., init() failed before the patch).
        try {
            const Internal: any = Zotero.Utilities.Internal;
            if (Internal._wvOrigOpenPreferences) {
                Internal.openPreferences = Internal._wvOrigOpenPreferences;
                delete Internal._wvOrigOpenPreferences;
            }
        } catch (e) {
            Zotero.debug("[Weavero] openPreferences un-patch err: " + e);
        }

        // 0b. Restore the Zotero.Notes / Zotero.Reader singleton members to
        //     the native: every Weavero layer on `open` (multi-window wrapper,
        //     startup hold, deck-window / hosted-tab wrapper), on
        //     `getWindowStates` (quit takeover, dead-reader purge) and on
        //     `getByTabID` comes off together, and every stamp with it. The
        //     stamps MUST be cleared -- the old boolean survived destroy and
        //     blocked every re-patch after a plugin reload, so wrapper changes
        //     silently never activated (2026-07-28); restoring only the outer
        //     getWindowStates layer left a dead inner wrapper live (survey
        //     2026-10-06). Guard: test/wire-stamps.spec.js, test/disable/leftovers.js.
        try {
            (this as any)._wvOpenPatchPeel((Zotero as any).Notes);
        } catch (e) {
            Zotero.debug("[Weavero] Notes.open un-patch err: " + e);
        }
        try {
            const Reader: any = (Zotero as any).Reader;
            (this as any)._wvOpenPatchPeel(Reader);
            (this as any)._wvReaderGWSPeel(Reader);
            (this as any)._wvReaderLookupPeel(Reader);
        } catch (e) {
            Zotero.debug("[Weavero] Reader un-patch err: " + e);
        }

        // 0c. Unregister Weavero pref pane(s). Without this, a
        //     plugin reload (or any flow that calls destroy then
        //     init) leaves the pane registered, and init's
        //     register call adds a SECOND pane — Settings then
        //     shows duplicate "Weavero" entries in the sidebar.
        try {
            const pp: any = Zotero.PreferencePanes;
            const ours = pp.pluginPanes
                .filter((p) => p.pluginID === "weavero@mjthoraval");
            for (const p of ours) pp.unregister(p.id);
        } catch (e) {
            Zotero.debug("[Weavero] pref pane unregister err: " + e);
        }

        // 1. Tear down listeners / observers / timers.
        // Note-window watcher + revert the strip on any open note windows.
        try { this._teardownNoteWindowWatcher(); } catch (e) {}
        try { this._teardownPrefsWindowWatcher(); } catch (e) {}
        if (this._prefObserver && this._prefBranch) {
            try { this._prefBranch.removeObserver("", this._prefObserver); } catch(e) {}
            this._prefObserver = null;
            this._prefBranch = null;
        }
        if (this._uiThemeMq && this._uiThemeMqHandler) {
            try {
                if (typeof this._uiThemeMq.removeEventListener === "function") {
                    this._uiThemeMq.removeEventListener("change", this._uiThemeMqHandler);
                }
            } catch (e) {}
            this._uiThemeMq = null;
            this._uiThemeMqHandler = null;
        }
        if (this._uiThemeObserver) {
            try { this._uiThemeObserver.disconnect(); } catch (e) {}
            this._uiThemeObserver = null;
        }

        // Reader event listeners are cleaned up by Zotero's plugin-
        // shutdown observer (`_unregisterEventListenerByPluginID`,
        // wired in xpcom/reader.js), which fires on plugin disable /
        // upgrade and filters listeners by pluginID. We DON'T call
        // `unregisterEventListener(type, handler)` manually because
        // Zotero's implementation is inverted — it does
        // `filter(x => x.type === type && x.handler === handler)`,
        // which KEEPS the matching listener and discards all others,
        // i.e. it would wipe other plugins' listeners on any actual
        // match (and our prior code passed a string where a handler
        // was expected, so the predicate never matched and it merely
        // wiped everything). Registering with the correct full plugin
        // ID is enough — the shutdown observer handles teardown.
        // Revert compact-title-bar across every main window AND every
        // standalone reader window so unloading the plugin doesn't leave
        // the DOM mutilated (buttonbox moved, icon hidden, menubar
        // collapsed). SKIPPED during app shutdown — the windows are
        // about to be destroyed anyway, and reverting here was found
        // to interfere with Zotero's session save (Session.save reads
        // `Zotero.getZoteroPanes()` from `quit-application-granted`;
        // if our long synchronous DOM revert delays things, the panes
        // are gone by save time and the old tab state gets restored,
        // making closed tabs reappear on next startup).
        try {
            if (!Services.startup.shuttingDown) {
                // On a genuine plugin DISABLE/UNINSTALL (reason 4/6 — NOT a
                // hot-reload/upgrade), SAVE + CLOSE every extra window (reader
                // windows + managed main windows; the anchor stays). The store
                // was captured + frozen above, so the snapshot is immutable
                // while the plugin is off — it survives restarts-while-disabled
                // and can't lose its anchor; the next enable restores it all.
                // (Replaces the old migrate-extras-to-main-tabs hand-off.)
                try {
                    if (reason === 4 /* ADDON_DISABLE */ || reason === 6 /* ADDON_UNINSTALL */) {
                        (this as any)._wvDisableCloseExtraWindows();
                    }
                } catch (e) { Zotero.debug("[Weavero] disable-close err: " + e); }
                const wins = wvMainWins();
                for (const w of wins) {
                    try { this._revertCompactTitleBar(w); } catch(e) {}
                    // Per-window chrome teardown for EVERY main window — these
                    // were only run from onMainWindowUnload (window close), so
                    // plugin DISABLE left every open window with live re-apply
                    // observers (which resurrected chips/pins right after the
                    // strip below) plus our buttons/styles/attributes.
                    try { this._teardownTabBarLibraryDecoration(w); } catch (e) {}
                    try { this._teardownBookmarksToolbarButton(w); } catch (e) {}
                    try { this._teardownTabExternalRepositioner(w); } catch (e) {}
                    // Restore native restoreState/close/markAsLoaded/select —
                    // the wrapped versions carry the note re-process + watchdog
                    // side effects that re-wired editors after disable.
                    try { this._wvUnwireRestoreTracing(w); } catch (e) {}
                    // Unpatch THIS window's tabs-menu refreshList (the single
                    // later call covers only the focused window — the anchor's
                    // wrapped refreshList kept decorating rows from dead code
                    // whenever the popup re-rendered post-disable).
                    try { this._teardownTabsMenuLibrarySort(w); } catch (e) {}
                    // Libraries-box highlight observer — per-window; the single
                    // later call covers only the focused window.
                    try { this._teardownLibrariesBoxHighlight(w); } catch (e) {}
                    try { this._wvStripWindowChrome(w); } catch (e) {}
                }
                // Every reader window, deck windows included
                // (_wvReaderWindowTargets): a strip left in place kept the old
                // instance's handlers, and the next instance's builders skip
                // what exists -- after a reload a deck window had no Ctrl+T
                // and dead window controls (wiring slice 3, 2026-10-13).
                for (const t of (this as any)._wvReaderWindowTargets()) {
                    try { this._revertReaderCompactMenubar(t.r); } catch(e) {}
                    try { this._removeReaderWindowTabStrip(t.r); } catch(e) {}
                }
                // Reader WINDOWS also carry Weavero-only chrome beyond the tab
                // strip (right pane + splitter, tooltips, context menus,
                // injected styles) — sweep them like the main windows, else a
                // disable leaves a dead right-pane skeleton in each one.
                // DEFERRED with a liveness check (same pattern as the window
                // close): the sweep's wv-id removal rips the deck's realized
                // reader browsers out of the DOM, and running it on every HOT
                // RELOAD left the reader window full of blank zombie tabs. On
                // a reload the plugin is back within milliseconds → skip; on a
                // real disable it runs 1.5s later (the deferred window-close
                // usually removes the windows first anyway).
                try {
                    const setT = wvTimeout;
                    setT(() => {
                        try {
                            if ((Zotero as any).Weavero && (Zotero as any).Weavero.plugin) return;   // reload — keep the decks
                            const ren = Services.wm.getEnumerator("zotero:reader");
                            while (ren.hasMoreElements()) {
                                const rw: any = ren.getNext();
                                try { this._wvStripWindowChrome(rw); } catch (e) {}
                            }
                        } catch (e) {}
                    }, 1500);
                } catch (e) {}
            } else {
                Zotero.debug("[Weavero] destroy: app shutting down, skipping compact-title-bar revert");
            }
        } catch (e) {}
        this._unregisterItemTreeColumns();
        try { this._unpatchAnnotationRow(); } catch (e) {}
        try { (this as any)._unpatchHideContextAttachments(); } catch (e) {}

        for (const id of this._notifierIDs || []) {
            try { Zotero.Notifier.unregisterObserver(id); } catch(e) {}
        }
        this._notifierIDs = [];

        clearInterval(this._pollInterval); this._pollInterval = null;
        this._teardownTreeClickDelegate();
        this._teardownItemsListContextMenu();
        this._teardownCollectionsContextMenu();
        try { (this as any)._wvHidTeardown(); } catch (e) {}
        this._teardownTabContextMenu();
        try { (this as any)._wvTeardownMenubarWindowEntries(); } catch (e) {}
        try { (this as any)._wvTeardownCollectionsPaneToggle(); } catch (e) {}
        try { (this as any)._wvTeardownTagSelectorHandle(); } catch (e) {}
        try { (this as any)._wvTeardownStuckDropRowFix(); } catch (e) {}   // WV-TEMP-133039
        try { (this as any)._wvTeardownTagScopeRowsFix(); } catch (e) {}   // WV-TEMP-134330
        try { (this as any)._wvTeardownNewNoteMenuFix(); } catch (e) {}   // WV-TEMP-134357
        try { (this as any)._wvTeardownCollectionDropFix(); } catch (e) {}   // WV-TEMP-134361
        try { (this as any)._wvTeardownLayoutMenus(); } catch (e) {}
        try { (this as any)._wvTeardownPaneDragNoCollapse(); } catch (e) {}
        try { (this as any)._wvTeardownCollectionsTreeAids(); } catch (e) {}
        try { (this as any)._wvUnwireCollectionsSearchToggle(); } catch (e) {}
        try { (this as any)._wvUnwireCollectionTreeGestures(); } catch (e) {}
        try { (this as any)._wvUnwireMenuGhostWorkaround(); } catch (e) {}
        try { (this as any)._wvUnwireReaderFindKey(); } catch (e) {}
        try { (this as any)._wvTeardownCollectionMenuEntries(); } catch (e) {}
        this._unregisterPinTabMenu();
        try { this._teardownTabGroups(); } catch (e) {}
        try { (this as any)._teardownPluginsSearch(); } catch (e) {}
        try { (this as any)._wvUnwireCsdRefresh(); } catch (e) {}
        this._unregisterDevNewWindowMenu();
        try { (this as any)._unregisterReopenClosedMenu(); } catch (e) {}
        try { this._wvWindowStoreUnregisterQuitFlush(); } catch (e) {}
        try { this._teardownThumbnailContextMenu(); } catch (e) {}
        this._teardownNoteWindowListener();
        try { this._teardownUpdateWindowListener(); } catch (e) {}
        this._teardownItemsListFilter();
        // The collapse-to-quick-search wrapper outlives the filter pane's
        // teardown (prefs.4): given back to Zotero here, in every window.
        for (const w of wvMainWins()) {
            try { (this as any)._wvUninstallCollapseToQuickSearch(w); } catch (e) {}
        }
        try {
            this._teardownTabsMenuLibrarySort(Zotero.getMainWindow());
        } catch (e) {}
        try {
            this._teardownLibrariesBoxHighlight(Zotero.getMainWindow());
        } catch (e) {}
        this._teardownPaneObserver();

        // Clear any `network.protocol-handler.warn-external.<x>`
        // overrides we set so the user's profile doesn't carry our
        // pref churn after the plugin is removed. Only clears values
        // we recognise as ours (FALSE) — leaves any TRUE overrides
        // the user might have set themselves intact.
        try {
            for (const def of URL_SCHEMES) {
                const prefName = "network.protocol-handler.warn-external." + def.name;
                try {
                    if (Services.prefs.prefHasUserValue(prefName)
                            && Services.prefs.getBoolPref(prefName, true) === false) {
                        Services.prefs.clearUserPref(prefName);
                    }
                } catch(e) {}
            }
        } catch(e) {}

        // 2. Clean up everything we put into the main window's DOM.
        try {
            const doc = Zotero.getMainWindow().document;
            const root = doc.documentElement;

            // Drop the mode classes we add to <html>
            root.classList.remove("wv-icons-only", "wv-ui-dark");


            // Strip notes surfaces (items-tree note rows, right-pane
            // notes-box labels, note-editor iframes — both right-pane
            // and pop-out windows). _stripNotes does the cell-by-cell
            // unwrap + removes the injected note-editor stylesheet +
            // detaches the per-iframe listeners, mirroring what
            // happens when the user unticks the Notes surface pref.
            // Without this call, plugin-disable leaves stale rendered
            // links / formatted text in note content until the user
            // re-enables the plugin or restarts Zotero.
            try { this._stripNotes(); } catch(e) {}

            // Restore items-tree annotation comment cells to their raw text.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment") as any) {
                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s ]*🔗\s*$/, "")
                              .trim();
                }
                cell.textContent = text;
                cell.removeAttribute("data-has-rich");
                cell.removeAttribute("data-icon-wanted");
                cell.removeAttribute("data-comment-text");
                cell.removeAttribute("data-truncated");
                cell.removeAttribute("data-has-url");
            }

            // Unwrap leftover .wv-md / .wv-url-span elements (right pane,
            // related-box labels, note rows). These need source-text restoration
            // so a re-enable can re-parse the original markdown / URLs.
            //
            // Two render modes produce these spans:
            //   - "tree" mode (related-box, items-list note .cell-text):
            //     markdown markers / link brackets are STRIPPED so the row
            //     reads cleanly. Restore them here so re-render works.
            //   - "non-tree" mode (right pane / popup): the markers / brackets
            //     are emitted as adjacent text nodes around the span. Just
            //     unwrap; the surrounding text already has them.
            //
            // Detect mode by looking at the previous sibling text node — if
            // it ends with the expected marker / bracket, we're in non-tree
            // mode (markers already preserved). Otherwise we're in tree mode
            // and need to re-emit them.
            // (Done per window by _wvStripWindowChrome already; this call is
            // the focused window's belt-and-braces.)
            this._wvRestoreDecoratedText(doc);
            for (const el of doc.querySelectorAll(".wv-btn, .wv-tree-icon") as any) {
                el.remove();
            }


            // Drop our cache markers from any element that wasn't already
            // wiped above (related-box labels, right-pane comments, note
            // .cell-text spans). Without this the next plugin instance
            // sees `data-wv-source` from the old run and skips the rebuild.
            for (const el of doc.querySelectorAll(
                    "[data-wv-source], [data-wv-rendered], [data-wv-raw],"
                    + " [data-wv-related-rendered], [data-wv-ctx-wired],"
                    + " [data-wv-last-rebuild]") as any) {
                el.removeAttribute("data-wv-source");
                el.removeAttribute("data-wv-rendered");
                el.removeAttribute("data-wv-raw");
                el.removeAttribute("data-wv-related-rendered");
                el.removeAttribute("data-wv-ctx-wired");
                el.removeAttribute("data-wv-last-rebuild");
            }

            // Remove the popup panel + main-window stylesheet.
            doc.getElementById(PANEL_ID)?.remove();
            this.removeStyles();

            // Clean up the right-click Copy Link menu.
            if (this._urlMenuState) {
                try {
                    const ms = this._urlMenuState;
                    if (ms.root && ms.handlers) {
                        try { ms.root.removeEventListener("contextmenu", ms.handlers.onCtx, true); } catch(e) {}
                        try { ms.root.removeEventListener("click", ms.handlers.onAnyClick, true); } catch(e) {}
                        try { ms.root.removeEventListener("keydown", ms.handlers.onKey, true); } catch(e) {}
                        try { ms.root.removeEventListener("wheel", ms.handlers.onWheel, { capture: true, passive: true }); } catch(e) {}
                    }
                    if (ms.pointerTargets && ms.handlers && ms.handlers.onPointerDown) {
                        for (const t of ms.pointerTargets) {
                            try { t.removeEventListener("pointerdown", ms.handlers.onPointerDown, { capture: true }); } catch(e) {}
                        }
                    }
                    if (ms.firstMoveHandler) {
                        try { doc.removeEventListener("mousemove", ms.firstMoveHandler, true); } catch(e) {}
                    }
                    if (ms.win && ms.handlers && ms.handlers.onWinBlur) {
                        try { ms.win.removeEventListener("blur", ms.handlers.onWinBlur); } catch(e) {}
                    }
                    if (ms.el && ms.el.parentNode) ms.el.parentNode.removeChild(ms.el);
                } catch(e) {}
                this._urlMenuState = null;
            }
            // Make sure the suppress class doesn't outlive the menu —
            // would otherwise leave links stuck with default cursor
            // after a teardown that didn't go through hideMenu.
            try { root.classList.remove("wv-context-menu-open"); } catch(e) {}
        } catch(e) {
            Zotero.debug("[Weavero] destroy main-doc cleanup error: " + e);
        }

        // 3. Clean up open reader iframes (_wvReaderPageTeardown).
        try {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try { (this as any)._wvReaderPageTeardown(reader); } catch (e) {}
            }
        } catch(e) {}

        Zotero.debug("[Weavero] destroyed");
    }

    /** Remove everything Weavero wired into one reader's page: panels,
     *  observers, the listeners recorded in `_readerObservers`, sidebar
     *  decorations and styles. destroy() runs it for every registered
     *  reader; _wvWTCloseTab runs it for a reader window's NATIVE reader
     *  when the window stays open without it (a deck window drops its
     *  anchor that way) -- that reader leaves Zotero.Reader._readers, so
     *  destroy() never reached its still-loaded, hidden page, and a reload
     *  left the old instance's listeners there (wiring slice 3,
     *  2026-10-13). */
    _wvReaderPageTeardown(reader: any) {
        try {
            const iwin = reader._iframeWindow
                || (reader._iframe && reader._iframe.contentWindow);
            const idoc = iwin && iwin.document;
            if (!idoc) return;

            // Keyed listeners (lib/listen.ts) on the page and on its views'
            // frames, through the wrappers they were wired through: the
            // reader's own `_iframeWindow`, and the views' (waived, via
            // `_internalReader`).
            try {
                const ir = reader._internalReader;
                const frames = [iwin, ir && ir._primaryView && ir._primaryView._iframeWindow,
                    ir && ir._secondaryView && ir._secondaryView._iframeWindow];
                for (const f of frames) {
                    if (!f) continue;
                    try { wvUnlistenAllOn(f); } catch (e) {}
                    try { wvUnlistenAllOn(f.document); } catch (e) {}
                }
            } catch (e) {}

            // Remove the injected panel surfaces (bookmark tab/view,
            // outline takeover, filter button, panels stylesheet,
            // window-level handlers) and restore the native sidebar.
            // Without this, DISABLING the plugin left the outline
            // takeover in place (2026-07-22). On a hot reload the new
            // instance's ensure pass simply rebuilds them.
            //
            // The CLASS-targeted strips go first: _wvReaderTeardownPanels
            // ends with a generic pass that removes every `wv-` class from
            // the page, and these select by those classes -- run after it
            // (as they were) they found nothing, so every reload left the
            // old instance's sidebar "N Related" buttons in the annotation
            // cards, hidden, classless and still wired to the dead
            // instance (dev profile 2026-10-13: three more per install).
            // _stripReaderSidebar also unwraps URL spans and removes the
            // comment previews; the rest catches .wv-btn / URL spans
            // outside its selectors (rows that are not .annotation-row /
            // .annotation, popup spans).
            try { this._stripReaderSidebar(idoc); } catch(e) {}
            try {
                for (const span of idoc.querySelectorAll(".wv-url-span") as any) {
                    span.replaceWith(idoc.createTextNode(span.textContent || ""));
                }
                for (const el of idoc.querySelectorAll(".wv-btn") as any) el.remove();
            } catch (e) {}
            try { this._wvReaderTeardownPanels(reader, idoc); } catch (e) {}

            // Disconnect observer + drop the iframe-doc listeners.
            const data = this._readerObservers.get(reader);
            if (data) {
                try { data.observer && data.observer.disconnect(); } catch(e) {}
                try { data.innerObserver && data.innerObserver.disconnect(); } catch(e) {}
                if (data.sidebarMouseDown) {
                    try { idoc.removeEventListener("mousedown",
                        data.sidebarMouseDown, true); } catch(e) {}
                }
                if (data.sidebarFocusIn) {
                    try { idoc.removeEventListener("focusin",
                        data.sidebarFocusIn, true); } catch(e) {}
                }
                if (data.sidebarFocusOut) {
                    try { idoc.removeEventListener("focusout",
                        data.sidebarFocusOut, true); } catch(e) {}
                }
                if (data.sidebarPreviewClick) {
                    try { idoc.removeEventListener("mousedown",
                        data.sidebarPreviewClick, true); } catch(e) {}
                }
                // Proactive Delete/Backspace listeners (both
                // window and document on each iframe frame).
                if (data.proactiveOuterDoc) {
                    try { idoc.removeEventListener("keydown",
                        data.proactiveOuterDoc, true); } catch(e) {}
                }
                if (data.proactiveOuterWin && data.proactiveOuterWindow) {
                    try { data.proactiveOuterWindow.removeEventListener("keydown",
                        data.proactiveOuterWin, true); } catch(e) {}
                }
                if (data.selectionTrackerOuter) {
                    try { idoc.removeEventListener("mousedown",
                        data.selectionTrackerOuter, true); } catch(e) {}
                }
                // Inner-iframe cleanup: text-annotation buttons,
                // marker icon badges, our stylesheet, the inner
                // proactive keydown + selection tracker listeners,
                // and (for DOM-view readers) the shadow-root
                // MutationObserver and scroll/resize handlers.
                const innerDoc = data.innerDoc;
                const innerWindow = data.innerWindow;
                if (innerDoc) {
                    try {
                        if (data.proactiveInnerDoc) {
                            try { innerDoc.removeEventListener("keydown",
                                data.proactiveInnerDoc, true); } catch(e) {}
                        }
                        if (data.proactiveInnerWin && innerWindow) {
                            try { innerWindow.removeEventListener("keydown",
                                data.proactiveInnerWin, true); } catch(e) {}
                        }
                        if (data.selectionTrackerInner) {
                            try { innerDoc.removeEventListener("mousedown",
                                data.selectionTrackerInner, true); } catch(e) {}
                        }
                        if (data.dragEndPointerUp
                                && data.dragEndPointerUpWindow) {
                            try { data.dragEndPointerUpWindow
                                .removeEventListener("pointerup",
                                    data.dragEndPointerUp, true);
                            } catch(e) {}
                        }
                        if (data.domViewObserver) {
                            try { data.domViewObserver.disconnect(); } catch(e) {}
                        }
                        if (data.domViewResizeObserver) {
                            try { data.domViewResizeObserver.disconnect(); } catch(e) {}
                        }
                        if (data.domViewScrollHandler && innerWindow) {
                            try { innerWindow.removeEventListener("scroll",
                                data.domViewScrollHandler, true); } catch(e) {}
                            try { innerWindow.removeEventListener("resize",
                                data.domViewScrollHandler); } catch(e) {}
                        }
                        for (const btn of innerDoc.querySelectorAll(
                                ".wv-text-annotation-btn")) {
                            btn.remove();
                        }
                        for (const b of innerDoc.querySelectorAll(
                                ".wv-marker-badge")) {
                            b.remove();
                        }
                        innerDoc.getElementById(
                            "weavero-inner-styles")?.remove();
                    } catch(e) {}
                }
            }

            // Full sidebar teardown: unwrap URL spans, remove
            // .wv-md-preview panels and the wv-comment-preview
            // class, drop any markdown-style spans, and remove
            // sidebar buttons. This is what _stripReaderSidebar
            // does — calling it directly keeps the cleanup logic
            // in one place.
            //
            // Without removing .wv-md-preview here, the stale
            // preview node survives plugin disable. On re-enable,
            // _renderPreviewPanel's data-source cache hits on
            // that stale node and returns early — leaving the
            // OLD instance's render (with its URL spans already
            // unwrapped by this very pass) in place. URL-bearing
            // comments then look broken while markdown-only ones
            // look fine, matching the disable/enable regression.
            //
            // (Run BEFORE _wvReaderTeardownPanels, above: see there.)
            idoc.getElementById("weavero-reader-styles")?.remove();
            // _ensureReaderOuterStyles also injects into idoc
            // (preview-panel CSS for the reader sidebar). Without
            // this cleanup, a stale element from this instance
            // leaks across disable/enable and the next instance's
            // remove-then-add still does the right thing — but
            // we strip it here for symmetry and to keep the doc
            // clean during the time the plugin is off.
            idoc.getElementById("weavero-reader-outer-styles")?.remove();
        } catch(e) {}
    }
}

// === Module mixins ==========================================================
// Each module file (`modules/<name>.ts`) exports an object whose
// values are methods (and getters/setters) declared with
// `function (this: WeaveroPlugin, …)`. Mixing them in via
// `defineProperties` + `getOwnPropertyDescriptors` preserves
// getters as getters — `Object.assign` would invoke them once
// at module-load time and assign the resulting value, which is
// not what we want for stateful instance getters like URL_REGEX.

Object.defineProperties(
    WeaveroPlugin.prototype,
    Object.getOwnPropertyDescriptors(urlMethods),
);
// annotationMethods is already a PropertyDescriptorMap (built
// from a class prototype with `constructor` filtered out — see
// modules/annotation.ts), so it goes in directly.
Object.defineProperties(
    WeaveroPlugin.prototype,
    annotationMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    tabsMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    noteEditorMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    readerMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    paneMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    filterMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    bookmarksMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    readerPanelsMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    tabGroupsMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    sessionsMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    undoMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    outlineEvalMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    attachmentsMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    windowWiringMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    prefsTableMethods,
);

// === Lifecycle hooks (called by bootstrap.js shim) ==========================
// The shim awaits `Zotero.initializationPromise` before calling
// onStartup, so we don't re-await it here.

let _Weavero = null;

Zotero.Weavero = {
    plugin: null,
    hooks: {
        onStartup({ id, version, rootURI, reason }) {
            _rootURI = rootURI;
            try {
                _Weavero = new WeaveroPlugin();
                // Mirror onto the instance so extracted modules
                // (e.g. modules/reader.ts's _refreshPrefPaneIcon)
                // can read the absolute rootURI without needing to
                // import the index.ts closure.
                _Weavero._rootURI = rootURI;
                // Plugin version — used to version extracted assets
                // (e.g. the per-window .ico cache).
                _Weavero._version = version;
                // Boot-only machinery (session verify-and-repair) keys off this.
                _Weavero._wvStartupReason = reason;
                Zotero.Weavero.plugin = _Weavero;
                (Zotero.Weavero as any).lib = WV_LIB;
                // Default-child overrides. Wired HERE as well as in
                // onMainWindowLoad because a plugin RELOAD does not re-fire
                // onMainWindowLoad for an already-open window, which would
                // leave the overrides uninstalled. Version-stamped, so both
                // paths running is free. The per-window viewItems hook must
                // be applied to windows that are ALREADY open at reload time.
                // See modules/attachments.ts.
                try { _Weavero._wvWireDefaultAttachment(); } catch (e) {}
                // Keep that wrapper outermost when a COMPETING plugin is
                // installed/enabled later: startup wiring only sees plugins
                // already loaded. See modules/attachments.ts.
                try { _Weavero._wvWirePluginObserver(); } catch (e) {}
                // Re-offer the legacy import if the user turns the feature
                // back on after choosing to stay with the other plugin.
                try { _Weavero._wvWireDefaultChildPrefWatch(); } catch (e) {}
                // Outline-takeover pref flips reach every OPEN reader
                // immediately (2026-08-26: waiting on mutation ticks left
                // idle readers with a class-only half-strip and a dead
                // Outline tab).
                try { _Weavero._wvWireOutlineTakeoverPrefWatch(); } catch (e) {}
                try { _Weavero._wvWireOutlinePagesPrefWatch(); } catch (e) {}
                try { _Weavero._wvWireOutlineTextSizePrefWatch(); } catch (e) {}
                try { _Weavero._wvWireUndoButtonsPrefWatch(); } catch (e) {}
                try { _Weavero._wvWireBmPagesPrefWatch(); } catch (e) {}
                try { _Weavero._wvWireAnnDatesPrefWatch(); } catch (e) {}
                // One-shot import of picks from PikaPei/zotero-default-attachment
                // (guarded by weavero.defaultChildMigrated). Fire-and-forget:
                // startup must not block on it.
                // Raise the resulting notice once the import settles, for a
                // window that is ALREADY open (a reload, or a plugin enabled
                // mid-session). A cold start has no window yet — that case is
                // covered from onMainWindowLoad.
                try {
                    _Weavero._wvMigrateDefaultAttachmentPlugin().then(() => {
                        const w = Zotero.getMainWindow();
                        if (w) _Weavero._wvShowLegacyPrompt(w);
                    }).catch(() => {});
                } catch (e) {}
                // Per-window UI must ALSO be wired for windows already open at
                // reload time: onMainWindowLoad does not re-fire for them.
                try {
                    for (const w of Zotero.getMainWindows()) {
                        _Weavero._wvWireDefaultChildMenu(w);
                    }
                } catch (e) {}
                // Readiness flag for the test runner (zotero-plugin.config.ts
                // `waitForPlugin`): the suite starts once init has SETTLED,
                // not after a fixed delay. A failed init still raises the
                // flag (the runner would otherwise time out) and records
                // the error for the readiness spec to report.
                (Zotero as any)._weaveroReady = false;
                (Zotero as any)._weaveroInitError = null;
                // Only the instance still alive raises the flag: a destroyed
                // one's init (stopped early, or settling late) must not
                // announce readiness over the next instance's.
                const inst: any = _Weavero;
                inst.init().then(
                    () => { if (!inst._wvDestroyed) (Zotero as any)._weaveroReady = true; },
                    (e) => {
                        if (inst._wvDestroyed) return;
                        Zotero.debug("[Weavero] init error: " + e);
                        (Zotero as any)._weaveroInitError = String(e);
                        (Zotero as any)._weaveroReady = true;
                    },
                );
            } catch (e) {
                Zotero.debug("[Weavero] startup error: " + e);
            }
        },
        onShutdown(reason) {
            if (_Weavero) { _Weavero.destroy(reason); _Weavero = null; }
            Zotero.Weavero.plugin = null;
            (Zotero as any)._weaveroReady = false;
        },
        onMainWindowLoad(window) {
            if (!_Weavero) return;
            try { _Weavero.onMainWindowLoad(window); }
            catch (e) { Zotero.debug("[Weavero] onMainWindowLoad error: " + e); }
        },
        onMainWindowUnload(window) {
            if (!_Weavero) return;
            try { _Weavero.onMainWindowUnload(window); }
            catch (e) { Zotero.debug("[Weavero] onMainWindowUnload error: " + e); }
        },
    },
};
