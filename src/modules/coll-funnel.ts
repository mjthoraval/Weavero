// Module: coll-funnel -- a funnel above the collections pane.
//
// MJT 2026-11-27: "Also add a filter funnel above the collections pane, to be able to filter
// faster the normal collections, saved searches, Feeds, ..." and "Include the ability to use the
// filter as default in the collections pane, same as for the annotations pane of the reader"
// (plan: work/collfunnel-plan-2026-11-27.md, approved "Build it").
//
// - A funnel button in the collections toolbar of every library view, after the spacer and before
//   Zotero's search toggle (libraryView.js / zoteroPane.xhtml `#zotero-collections-toolbar`), lit
//   while anything is filtered, its tooltip naming what. Its panel (a child of the button,
//   type="menu": Zotero's own toggle and dismissal, as the items filter's) holds three chip rows:
//   kinds (collections, saved searches, feeds, the special rows), libraries (My Library and each
//   group), Weavero's sections (the Bookmarks pane, the saved-search folders). Every chip shown by
//   default; a click shows only, Alt+click hides, switching direction clears the other set (the
//   items filter's `_toggleIncludeExclude`, filter.ts). Rows AND together, and AND with Zotero's
//   own search box.
// - Rows leave the tree for real (row count, keyboard, row heights), through the hidden
//   collections' own `wv-hid` layers of each pane tree (pane.ts _wvHidApply, lib/wrap.ts) and no
//   layer of the funnel's own: one more check in the `_includedInTree` layer (one AND rule, one
//   teardown, and another plugin's patch over those members kept, as theirs), the special rows
//   through its per-window rule (`_wvHidOverlayLib`'s visible()), the Trash -- no virtual
//   collection with a setting to lay over -- taken out in the `_expandRow` layer
//   (_wvCfDropTrash). The marks follow the rows through the Group Libraries fold's
//   `_refreshRowMap` class layer (group-fold.ts). A library stays while it holds a row the
//   funnel shows; under a search text, while such a row MATCHES (Zotero answers "has a matching
//   child" from the database, collectionTree.jsx _matchesFilter).
// - A funnel that leaves nothing shows "Nothing matches the funnel" with a Clear link in the tree's
//   place; a selected row filtered out moves to its library, else the first library shown (the
//   hidden collections' order, _wvHidRefreshWin).
// - The Bookmarks pane chip: "show only" IS the pane's own Bookmarks only (bookmarks-pane.ts
//   `win._wvBmp`), never stored here; "hide" hides the pane in this window (a column attribute this
//   module's sheet reads). The folders chip: "hide" lists the saved searches flat in this window
//   (search-folders.ts asks `_wvCfFoldersOff`).
// - State PER WINDOW (`win._wvCf`, a JSON string: a later instance reads it after a reload, a
//   string never turns into a dead object), every library view of the window showing it, as the
//   hidden collections and the Bookmarks pane; absent = the window follows the default. Saved with
//   the window's session record and window state (`collFunnel`, beside `hiddenColl` / `bmPane`).
// - The default: `weavero.collFunnelDefault` (JSON, verbatim, as the annotations pane's
//   `annPaneDefault`), the Settings "Shown by default" boxes kept in step both ways under a
//   re-entrancy guard; Use as Default / Reset to Default in the panel's footer; a window that
//   follows the default takes every change of it.
// - The funnel is view state, never data: nothing is written to any library (decision recorded
//   with the work; Revisit when Zotero ships its own collections-pane filter).
// - Off (Settings, Extras > Collections, devOnly; or Extras off): nothing of it in any window, every
//   row back. Teardown: buttons, panels, messages, the sheet, the watches (the layers it runs in
//   are the hidden collections' and the fold's, which their own teardowns take off).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.
// Guard: test/coll-funnel.spec.js.

import { wvLivePlugin } from "../lib/live";
import { wvMainWins, wvViewEls } from "../lib/windows";
import { wvInjectStyle, wvRemoveStyle, wvFilterTileRules } from "../lib/style";
import { wvHtmlEl, winOf, wvDismissTooltip } from "../lib/dom";
import { wvStr } from "../lib/l10n";
import { wvTimeout } from "../lib/timers";
import { wvWrapLayers } from "../lib/wrap";

declare const Zotero: any;
declare const Services: any;
declare const Components: any;

const CF_PREF = "collectionsFunnel";
const CF_DEF_PREF = "weavero.collFunnelDefault";
const CF_STYLE_ID = "wv-cf-style";
const CF_BTN = "wv-cf-tb-button";
const CF_POPUP = "wv-cf-popup";
const CF_EMPTY = "wv-cf-empty";
const CF_TOOLBAR = "zotero-collections-toolbar";
const CF_COLL_PANE = "zotero-collections-pane";
const CF_TREE_BOX = ":scope > [id^='zotero-collections-tree-container']";
const CF_KINDS = ["collections", "searches", "feeds", "special"];
const CF_SECS = ["bookmarks", "folders"];
// Zotero's special rows (collectionTree.jsx VIRTUAL_ROW_TYPES); the Trash is one of them.
const CF_VIRTUAL = ["recentlyRead", "publications", "duplicates", "unfiled", "retracted", "trash"];
/** The Settings boxes of the default, per kind and section. */
const CF_SHOW_PREFS: Record<string, string> = {
    collections: "collFunnelShowCollections", searches: "collFunnelShowSearches", feeds: "collFunnelShowFeeds",
    special: "collFunnelShowSpecial", bookmarks: "collFunnelShowBookmarks", folders: "collFunnelShowFolders",
};

interface WvCfSet { inc: string[]; exc: string[] }
interface WvCfState { kinds: WvCfSet; libs: WvCfSet; secs: WvCfSet }

/** The windows whose funnel is wired: the tree wrapper asks (a module set, not an expando:
 *  the window-wiring recording lists none, and a closed window goes with its key). */
const WV_CF_WIRED: WeakSet<any> = new WeakSet();
/** Per window: the state last parsed, by the strings it came from. */
const WV_CF_CACHE: WeakMap<any, { key: string; st: WvCfState; inc: string[]; sig: string }> = new WeakMap();
/** Per window: a redraw of the marks is on its way. */
const WV_CF_DECO: WeakSet<any> = new WeakSet();
/** Per window: a rebuild of the trees after notifications is on its way (_wvCfRefreshSoon). */
const WV_CF_SOON: WeakSet<any> = new WeakSet();
/** Per window: a library is being shown for Zotero's selectLibrary (_wvCfRevealLibrary). */
const WV_CF_REVEALING: WeakSet<any> = new WeakSet();
/** Per tree: the libraries each navigation running in it is taking it to (_wvCfNavEnter). */
const WV_CF_NAV: WeakMap<any, Set<number>[]> = new WeakMap();

// The button's width: Zotero gives a menu button of the collections toolbar 40 px (_toolbar.scss
// `toolbarbutton[type="menu"]`, room for a ▾ this one hides). At the pane's narrowest width
// (Zotero's min-width, 200 px: a fresh profile's) the row -- Toggle Collections Pane, New
// Collection, Bookmarks, Researchers, the funnel, Zotero's magnifier -- has 184 px, and those
// 40 px pushed the magnifier 20 px past the toolbar's end, and onto a line of its own while the
// search box is open (1.3.0-beta.1 gates, 2026-11-28). So the funnel starts at 20 px (its 16-px
// glyph) and grows to Zotero's 40 beside the spacer: 40 px from a 240-px pane on, as before.
// Guard: test/collections-pane-toggle.spec.js (the search box test, at the pane's min-width).
const CF_CSS = `
.wv-cf-tb-button { position: relative; -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity; fill: currentColor;
    flex: 1 0 20px; max-width: 40px; }
.wv-cf-tb-button > .toolbarbutton-menu-dropmarker { display: none; }
.wv-cf-tb-button > .wv-cf-dot { display: none; position: absolute; top: 3px; inset-inline-end: 3px; width: 6px; height: 6px;
    border-radius: 50%; background: var(--color-accent, #4072e5); pointer-events: none; }
.wv-cf-tb-button.wv-cf-active > .wv-cf-dot { display: block; }
.wv-cf-inner { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; max-width: 360px; font-size: 12px; }
.wv-cf-row { display: flex; flex-direction: column; gap: 4px; }
.wv-cf-row-label { font-size: 11px; opacity: .65; }
.wv-cf-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.wv-cf-chip .wv-cf-icon { width: 16px; height: 16px; flex: none; }
.wv-cf-chip .wv-cf-chip-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.wv-cf-hint { font-size: 11px; opacity: .6; }
.wv-cf-foot { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-end;
    border-top: 1px solid rgba(127,127,127,0.25); padding-top: 8px; }
.wv-cf-scope { flex: 1 1 auto; font-size: 11px; opacity: .7; }
.wv-cf-foot button { font: inherit; font-size: 12px; }
.wv-cf-empty { display: block; padding: 10px 12px; color: var(--fill-secondary); }
.wv-cf-empty[hidden] { display: none; }
.wv-cf-empty-clear { color: var(--color-accent, #4072e5); cursor: pointer; text-decoration: underline; background: none; border: none;
    padding: 0; margin-inline-start: 4px; font: inherit; }
[data-wv-cf-nobmp] > .wv-bmpane, [data-wv-cf-nobmp] > .wv-bmpane-splitter { display: none !important; }
${wvFilterTileRules(".wv-cf-inner", "media").join("\n")}
`;

function cfPick(a: any, ok: (v: string) => boolean): string[] {
    if (!Array.isArray(a)) return [];
    const out: string[] = [];
    for (const v of a) if (typeof v === "string" && ok(v) && !out.includes(v)) out.push(v);
    return out;
}

/** One row's sets: never both directions at once (the row rule; the include set wins). */
function cfSet(x: any, ok: (v: string) => boolean): WvCfSet {
    const inc = cfPick(x && x.inc, ok), exc = cfPick(x && x.exc, ok);
    return inc.length ? { inc, exc: [] } : { inc: [], exc };
}

function cfBlank(): WvCfState { return { kinds: { inc: [], exc: [] }, libs: { inc: [], exc: [] }, secs: { inc: [], exc: [] } }; }

function cfNorm(d: any): WvCfState {
    if (!d || typeof d !== "object") return cfBlank();
    return {
        kinds: cfSet(d.kinds, (v) => CF_KINDS.includes(v)),
        libs: cfSet(d.libs, (v) => /^(u|g\d+)$/.test(v)),
        secs: cfSet(d.secs, (v) => CF_SECS.includes(v)),
    };
}

/** The stored form: only the sets that hold something, each sorted. */
function cfCanon(st: WvCfState): any {
    const out: any = {};
    for (const row of ["kinds", "libs", "secs"]) {
        const s: WvCfSet = (st as any)[row];
        const o: any = {};
        if (s.inc.length) o.inc = s.inc.slice().sort();
        if (s.exc.length) o.exc = s.exc.slice().sort();
        if (Object.keys(o).length) out[row] = o;
    }
    return out;
}

function cfShown(s: WvCfSet, v: string): boolean { return s.inc.length ? s.inc.includes(v) : !s.exc.includes(v); }

/** Whether a state takes rows out of the tree (the sections act on their own). */
function cfRowsOn(st: WvCfState): boolean {
    return !!(st.kinds.inc.length || st.kinds.exc.length || st.libs.inc.length || st.libs.exc.length);
}

function cfAny(st: WvCfState): boolean {
    return cfRowsOn(st) || !!(st.secs.inc.length || st.secs.exc.length);
}

function cfRowsKey(st: WvCfState): string { return JSON.stringify({ k: cfCanon(st).kinds || null, l: cfCanon(st).libs || null }); }

/** A sections row without the Bookmarks pane's Bookmarks only (read in by _wvCfStateRO, never
 *  stored): the window's own sections, or the default's. Review 2026-11-28 (A): read in as "show
 *  only the Bookmarks pane", it hid the saved-search folders -- the tree behind the pane was
 *  rebuilt flat and nothing regrouped it when Bookmarks only went off (Reset to Default, the
 *  pane's own switch, its "Now showing" line) -- and it cleared a stored "hide folders". */
function cfOwnSecs(s: WvCfSet): WvCfSet {
    return cfSet({ inc: s.inc.filter((v) => v !== "bookmarks"), exc: s.exc }, (v) => CF_SECS.includes(v));
}

/** The saved-search folders shown by a sections row (Bookmarks only is not a verdict on them). */
function cfFoldersShown(s: WvCfSet): boolean { return cfShown(cfOwnSecs(s), "folders"); }

class _CollFunnelMixin {
    [k: string]: any;

    // ---- on / off ----

    /** On under Extras and its own setting (a trial: on in pre-release builds). */
    _wvCfOn(): boolean {
        try { return !!this._wvPref(CF_PREF); } catch (e) { return false; }
    }

    _wvCfWired(win: any): boolean { return !!win && WV_CF_WIRED.has(win); }

    _wvCfBmpOn(): boolean {
        try { return typeof this._wvBmpOn === "function" && !!this._wvBmpOn(); } catch (e) { return false; }
    }

    _wvCfSfOn(): boolean {
        try { return typeof this._wvSfOn === "function" && !!this._wvSfOn(); } catch (e) { return false; }
    }

    // ---- the state ----

    /** The default as stored (`weavero.collFunnelDefault`), else the Settings boxes. Kept for
     *  as long as the watches' generation (`_wvCfGen`) says nothing changed: the tree asks for
     *  every collection of every refresh. */
    _wvCfDefault(): WvCfState {
        const c = this._wvCfDefCache;
        if (c && this._wvCfWatching && c.gen === (this._wvCfGen || 0)) return cfNorm(c.st);
        let raw = "";
        try { raw = String(Zotero.Prefs.get(CF_DEF_PREF) || ""); } catch (e) {}
        let st: WvCfState | null = null;
        if (raw) { try { st = cfNorm(JSON.parse(raw)); } catch (e) { st = null; } }
        if (!st) {
            st = cfBlank();
            for (const k of CF_KINDS) if (!this._wvCfShowPref(k)) st.kinds.exc.push(k);
            for (const k of CF_SECS) if (!this._wvCfShowPref(k)) st.secs.exc.push(k);
        }
        this._wvCfDefCache = { gen: this._wvCfGen || 0, st: cfNorm(st) };
        return st;
    }

    _wvCfShowPref(k: string): boolean {
        try { const v = Zotero.Prefs.get("weavero." + CF_SHOW_PREFS[k]); return v === undefined ? true : !!v; } catch (e) { return true; }
    }

    /** The default may have changed (a watch, a write): what was read of it is read again. */
    _wvCfBump() {
        this._wvCfGen = (this._wvCfGen || 0) + 1;
        this._wvCfDefCache = null;
    }

    /** The window's funnel as it acts, read-only (the cached object): its own (`win._wvCf`),
     *  else the default; the Bookmarks pane's Bookmarks only read in as "show only the Bookmarks
     *  pane". Keyed by the strings it comes from, so the tree's many asks parse nothing. */
    _wvCfStateRO(win: any): WvCfState {
        let own = "";
        try { own = win && typeof win._wvCf === "string" ? win._wvCf : ""; } catch (e) {}
        let bmp = "";
        try { bmp = win && typeof win._wvBmp === "string" ? win._wvBmp : ""; } catch (e) {}
        let only = false;
        // Only a state that says so is parsed (bookmarks-pane.ts `win._wvBmp`, a JSON string).
        if (bmp.includes("\"only\"")) { try { only = this._wvCfBmpOn() && !!this._wvBmpState(win).only; } catch (e) {} }
        const key = own + "\u0001" + (own || !this._wvCfWatching ? "" : String(this._wvCfGen || 0)) + "\u0001" + (only ? 1 : 0);
        const hit = win ? WV_CF_CACHE.get(win) : null;
        if (hit && hit.key === key && (own || this._wvCfWatching) && (!hit.inc.length || this._wvCfLibsSig(hit.inc) === hit.sig)) return hit.st;
        let st: WvCfState | null = null;
        if (own) { try { st = cfNorm(JSON.parse(own)); } catch (e) { st = null; } }
        if (!st) st = this._wvCfDefault();
        // A "show only" key naming no library of this profile (a group left or deleted, a state
        // from another machine) acts as if absent -- kept where it is stored, so a group joined
        // again is shown only again. Review 2026-11-28 (E): it hid every library, with no chip
        // to undo it. Asked again at each read while the set holds group keys (cheap lookups).
        const inc = st.libs.inc.slice();
        const sig = this._wvCfLibsSig(inc);
        if (sig.includes("0")) st.libs = cfSet({ inc: inc.filter((k, i) => sig[i] === "1"), exc: st.libs.exc }, (v) => /^(u|g\d+)$/.test(v));
        // Bookmarks only is the pane's own state: never stored here, read in -- beside the
        // window's own sections, whose hide set it keeps (cfOwnSecs reads them back; review
        // 2026-11-28, A).
        st.secs.inc = st.secs.inc.filter((v) => v !== "bookmarks");
        if (only) st.secs.inc = ["bookmarks"].concat(st.secs.inc);
        if (win) { try { WV_CF_CACHE.set(win, { key, st, inc, sig }); } catch (e) {} }
        return st;
    }

    /** Of library keys, which name a library of this profile: "1" or "0" each. */
    _wvCfLibsSig(keys: string[]): string {
        return keys.map((k) => (this._wvCfLibAlive(k) ? "1" : "0")).join("");
    }

    _wvCfLibAlive(key: string): boolean {
        try {
            if (key === "u") return true;
            const m = /^g(\d+)$/.exec(key);
            return !!(m && Zotero.Groups.get(parseInt(m[1], 10)));
        } catch (e) { return true; }
    }

    /** The same, a copy the caller may change. */
    _wvCfState(win: any): WvCfState {
        const ro = this._wvCfStateRO(win);
        const st = cfNorm(ro);
        // The sections as read in: the read-in Bookmarks only beside the window's own hide set
        // (cfNorm's row rule would drop that set; review 2026-11-28, A).
        st.secs = { inc: ro.secs.inc.slice(), exc: ro.secs.exc.slice() };
        return st;
    }

    /** The funnel takes rows out of `win`'s trees. */
    _wvCfRowsActive(win: any): boolean {
        try { return this._wvCfWired(win) && this._wvCfOn() && cfRowsOn(this._wvCfStateRO(win)); } catch (e) { return false; }
    }

    /** The window's own funnel for its session record and saved state; undefined while it
     *  follows the default. */
    _wvCfCapture(win: any): any {
        try {
            const own = win && typeof win._wvCf === "string" ? win._wvCf : "";
            if (!own) return undefined;
            const st = cfNorm(JSON.parse(own));
            st.secs.inc = st.secs.inc.filter((v) => v !== "bookmarks");
            return cfCanon(st);
        } catch (e) { return undefined; }
    }

    /** Set the window's funnel (`st` null: it follows the default). The state is written at
     *  once (the panel redraws from it); the promise is the trees' refresh. A state equal to
     *  the default is the default (no departure kept), as the annotations pane does. */
    _wvCfSetState(win: any, st: any, opts?: { save?: boolean; bmp?: boolean }): Promise<void> {
        try {
            if (!win || win.closed) return Promise.resolve();
            const before = this._wvCfState(win);
            let next: WvCfState | null = st ? cfNorm(st) : null;
            if (next) {
                // "Show only the Bookmarks pane" goes to the pane itself -- except from a saved
                // state, which never holds it: the pane restores its own (`bmPane`). The rest of
                // the sections row from what was given, its hide set kept beside the read-in
                // Bookmarks only (cfNorm's row rule would drop it: review 2026-11-28, A).
                const raw: any = (st && st.secs) || {};
                const wantOnly = cfPick(raw.inc, (v) => v === "bookmarks").length > 0;
                next.secs = cfOwnSecs({ inc: cfPick(raw.inc, (v) => CF_SECS.includes(v)), exc: cfPick(raw.exc, (v) => CF_SECS.includes(v)) });
                if (this._wvCfBmpOn() && !(opts && opts.bmp === false)) {
                    try { if (!!this._wvBmpState(win).only !== wantOnly) this._wvBmpSetOnly(win, wantOnly); } catch (e) {}
                }
                if (JSON.stringify(cfCanon(next)) === JSON.stringify(cfCanon(this._wvCfDefault()))) next = null;
            }
            try {
                if (next) win._wvCf = JSON.stringify(cfCanon(next));
                else if (win._wvCf !== undefined) delete win._wvCf;
            } catch (e) {}
            WV_CF_CACHE.delete(win);
            if (!opts || opts.save !== false) { try { this._wvWindowStoreSaveDebounced(); } catch (e) {} }
            return this._wvCfApply(win, before);
        } catch (e) {
            Zotero.debug("[Weavero] funnel: set err: " + e);
            return Promise.resolve();
        }
    }

    /** After a change from `before`: the trees refreshed when their rows change, the folders
     *  regrouped when theirs does, the marks redrawn. */
    _wvCfApply(win: any, before: WvCfState): Promise<void> {
        const after = this._wvCfState(win);
        const jobs: Promise<any>[] = [];
        // The button and the Bookmarks pane follow the state at once; the message follows the
        // rows, after the refresh (_wvCfRefreshWin decorates again).
        this._wvCfDecorate(win);
        if (this._wvCfWired(win) && cfRowsKey(before) !== cfRowsKey(after)) jobs.push(this._wvCfRefreshWin(win));
        if (cfFoldersShown(before.secs) !== cfFoldersShown(after.secs) && this._wvCfSfOn()) {
            try { this._wvSfRefreshWin(win); } catch (e) {}
        }
        return Promise.all(jobs).then(() => {});
    }

    /** A saved state back on window `win` (null: the default). No save: the restore is what is
     *  saved. */
    _wvCfRestore(win: any, data: any): Promise<void> {
        try {
            if (!win || win.closed) return Promise.resolve();
            return this._wvCfSetState(win, data && typeof data === "object" ? data : null, { save: false, bmp: false });
        } catch (e) { return Promise.resolve(); }
    }

    /** A chip: a click shows only, Alt+click hides (the items filter's rule). */
    _wvCfChip(win: any, row: string, value: string, alt: boolean): Promise<void> {
        const st = this._wvCfState(win);
        const s: WvCfSet = (st as any)[row];
        if (!s) return Promise.resolve();
        const next = this._toggleIncludeExclude(value, s.inc, s.exc, alt);
        (st as any)[row] = { inc: next.include, exc: next.exclude };
        return this._wvCfSetState(win, st);
    }

    /** The message's Clear: everything shown in this window, Bookmarks only off. */
    _wvCfClear(win: any): Promise<void> {
        return this._wvCfSetState(win, cfBlank());
    }

    /** "Reset to Default": the window follows the default again (Bookmarks only is not part
     *  of a default: off). */
    _wvCfResetToDefault(win: any): Promise<void> {
        try { if (this._wvCfBmpOn() && this._wvBmpState(win).only) this._wvBmpSetOnly(win, false); } catch (e) {}
        return this._wvCfSetState(win, null);
    }

    /** "Use as Default": the window's funnel, as it stands, becomes the default; the window
     *  then follows it. */
    _wvCfUseAsDefault(win: any): Promise<void> {
        const st = this._wvCfState(win);
        this._wvCfSetDefault(st);
        // (Its cache entry stays: _wvCfDefaultChanged compares with what it showed.)
        try { if (win._wvCf !== undefined) delete win._wvCf; } catch (e) {}
        try { this._wvWindowStoreSaveDebounced(); } catch (e) {}
        return this._wvCfDefaultChanged();
    }

    // ---- the default ----

    /** Write the default: the JSON exactly as the chips stand (Bookmarks only left out: it is
     *  the pane's own), the Settings boxes saying which kinds and sections it shows. Guarded:
     *  the boxes' writes fire the watcher of the other direction. */
    _wvCfSetDefault(st: WvCfState) {
        try {
            this._wvCfWriting = true;
            const n = cfNorm(st);
            n.secs = cfOwnSecs(st.secs);
            const canon = cfCanon(n);
            // The cached read goes BEFORE the write: Zotero's pref observers run inside it
            // (xpcom/prefs.js observe), and Settings' libraries line reads the default there
            // (prefs/index.ts bindCollFunnelLibs). Review 2026-11-28 (F): bumped only after, the
            // line drew the previous default and nothing redrew it.
            this._wvCfBump();
            if (Object.keys(canon).length) Zotero.Prefs.set(CF_DEF_PREF, JSON.stringify(canon));
            else { try { Zotero.Prefs.clear(CF_DEF_PREF); } catch (e) { Zotero.Prefs.set(CF_DEF_PREF, ""); } }
            for (const k of CF_KINDS) Zotero.Prefs.set("weavero." + CF_SHOW_PREFS[k], cfShown(n.kinds, k));
            for (const k of CF_SECS) Zotero.Prefs.set("weavero." + CF_SHOW_PREFS[k], cfShown(n.secs, k));
        } catch (e) { Zotero.debug("[Weavero] funnel: default err: " + e); }
        finally { this._wvCfWriting = false; }
        this._wvCfBump();
    }

    /** A Settings box moved: the kinds and sections of the default from the boxes (an exclude
     *  set), its libraries kept. */
    _wvCfSyncDefaultFromPrefs() {
        if (this._wvCfWriting) return;
        try {
            this._wvCfBump();
            const st = this._wvCfDefault();
            st.kinds = { inc: [], exc: CF_KINDS.filter((k) => !this._wvCfShowPref(k)) };
            st.secs = { inc: [], exc: CF_SECS.filter((k) => !this._wvCfShowPref(k)) };
            this._wvCfWriting = true;
            const canon = cfCanon(st);
            // Before the write, as _wvCfSetDefault (its observers read the default inside it).
            this._wvCfBump();
            if (Object.keys(canon).length) Zotero.Prefs.set(CF_DEF_PREF, JSON.stringify(canon));
            else { try { Zotero.Prefs.clear(CF_DEF_PREF); } catch (e) { Zotero.Prefs.set(CF_DEF_PREF, ""); } }
        } catch (e) { Zotero.debug("[Weavero] funnel: default sync err: " + e); }
        finally { this._wvCfWriting = false; }
        this._wvCfDefaultChanged();
    }

    /** The default changed: every window that follows it takes it. */
    _wvCfDefaultChanged(): Promise<void> {
        this._wvCfBump();
        const jobs: Promise<any>[] = [];
        for (const w of wvMainWins()) {
            try {
                // What the window showed before (its last read, kept whatever its key): a
                // tree is rebuilt only when its rows change.
                const old = WV_CF_CACHE.get(w);
                const now = this._wvCfStateRO(w);
                this._wvCfDecorate(w);
                if (this._wvCfWired(w) && (!old || cfRowsKey(old.st) !== cfRowsKey(now))) jobs.push(this._wvCfRefreshWin(w));
                if (this._wvCfSfOn() && (!old || cfFoldersShown(old.st.secs) !== cfFoldersShown(now.secs))) { try { this._wvSfRefreshWin(w); } catch (e) {} }
            } catch (e) {}
        }
        return Promise.all(jobs).then(() => {});
    }

    /** The Settings line's Reset: no library left out of the default. */
    _wvCfDefaultResetLibs() {
        const st = this._wvCfDefault();
        st.libs = { inc: [], exc: [] };
        this._wvCfSetDefault(st);
        this._wvCfDefaultChanged();
    }

    /** The Settings line's data (prefs/index.ts words it): which libraries the default
     *  leaves out -- mode "hidden" (an exclude set), "only" (an include set) or "none". */
    _wvCfDefaultLibs(): { mode: string; names: string } {
        const st = this._wvCfDefault();
        const names = (keys: string[]) => keys.map((k) => this._wvCfLibName(k)).filter(Boolean).join(", ");
        // Keys naming no library of this profile act as absent (_wvCfStateRO; review
        // 2026-11-28, E: the line read "only" with no name).
        const live = (keys: string[]) => keys.filter((k) => this._wvCfLibAlive(k));
        if (live(st.libs.inc).length) return { mode: "only", names: names(live(st.libs.inc)) };
        if (live(st.libs.exc).length) return { mode: "hidden", names: names(live(st.libs.exc)) };
        return { mode: "none", names: "" };
    }

    /** The same line, worded (the spec reads it). */
    _wvCfDefaultLibsText(): string {
        const d = this._wvCfDefaultLibs();
        return wvStr("weavero-pref-collfunnel-libs", { mode: d.mode, names: d.names }, null);
    }

    // ---- libraries ----

    /** A library's key: "u" for My Library, "g<groupID>" for a group (stable across machines
     *  and a group joined again); null for anything else (a feed). */
    _wvCfLibKey(libraryID: any): string | null {
        try {
            if (libraryID == null) return null;
            if (libraryID === Zotero.Libraries.userLibraryID) return "u";
            const lib: any = Zotero.Libraries.get(libraryID);
            if (lib && lib.libraryType === "group") return "g" + Zotero.Groups.getGroupIDFromLibraryID(libraryID);
        } catch (e) {}
        return null;
    }

    _wvCfLibName(key: string): string {
        try {
            if (key === "u") {
                const u: any = Zotero.Libraries.get(Zotero.Libraries.userLibraryID);
                return String((u && u.name) || Zotero.getString("pane.collections.library"));
            }
            const m = /^g(\d+)$/.exec(key);
            const g: any = m ? Zotero.Groups.get(parseInt(m[1], 10)) : null;
            return g ? String(g.name) : "";
        } catch (e) { return ""; }
    }

    /** My Library, then the groups by name: {key, libraryID, name, group}. */
    _wvCfLibraries(): any[] {
        const out: any[] = [];
        try {
            const u = Zotero.Libraries.userLibraryID;
            out.push({ key: "u", libraryID: u, name: this._wvCfLibName("u"), group: false });
            const gs = (Zotero.Groups.getAll() || []).slice().sort((a: any, b: any) => Zotero.localeCompare(String(a.name), String(b.name)));
            for (const g of gs) { if (g && g.libraryID > 0) out.push({ key: "g" + g.groupID, libraryID: g.libraryID, name: String(g.name), group: true }); }
        } catch (e) {}
        return out;
    }

    _wvCfLibShown(st: WvCfState, libraryID: any): boolean {
        const k = this._wvCfLibKey(libraryID);
        return !k || cfShown(st.libs, k);
    }

    // ---- what the tree keeps ----

    /** What `_includedInTree` was asked about: {kind, libraryID}. Kinds: library (My Library, a
     *  group), collection, search, feeds (the Feeds row), feed, special (Zotero's special rows,
     *  the Trash included); null for a heading or a separator. Duck-typed: the plugin sandbox's
     *  `instanceof Zotero.Collection` fails across realms. */
    _wvCfClassify(o: any): { kind: string; libraryID?: number } | null {
        try {
            if (!o) return null;
            if (typeof o.type === "string" && o.ref !== undefined && typeof o.isCollection === "function") {
                const t = o.type, ref = o.ref || {};
                if (t === "library" || t === "group") return { kind: "library", libraryID: ref.libraryID };
                if (t === "collection") return { kind: "collection", libraryID: ref.libraryID };
                if (t === "search") return { kind: "search", libraryID: ref.libraryID };
                if (t === "feeds") return { kind: "feeds" };
                if (t === "feed") return { kind: "feed" };
                if (CF_VIRTUAL.includes(t)) return { kind: "special", libraryID: ref.libraryID };
                return null;
            }
            // A special collection's descriptor (the hidden collections' {type, libraryID}).
            if (typeof o.type === "string" && CF_VIRTUAL.includes(o.type) && o.libraryID != null) return { kind: "special", libraryID: o.libraryID };
            // The plain object Zotero builds the Feeds row on.
            if (typeof o.updateFeed === "function" && o.libraryID == null) return { kind: "feeds" };
            const T = String(o._ObjectType || ""), ot = String(o.objectType || "");
            if (T === "Collection" || ot === "collection") return { kind: "collection", libraryID: o.libraryID };
            // An unsaved search is a special row's (Unfiled, Retracted).
            if (T === "Search" || ot === "search") return o.id ? { kind: "search", libraryID: o.libraryID } : { kind: "special", libraryID: o.libraryID };
            if (T === "Feed" || o.libraryType === "feed") return { kind: "feed" };
            if (T === "Group" || o.libraryType === "group" || o.libraryType === "user") return { kind: "library", libraryID: o.libraryID };
            if (typeof o.libraryID === "number" && o.libraryID > 0 && o.key == null) return { kind: "library", libraryID: o.libraryID };
        } catch (e) {}
        return null;
    }

    /** Whether window `win`'s funnel leaves `object` out of tree `cv` (the hidden collections'
     *  `_includedInTree` wrapper asks, pane.ts _wvHidApply). */
    _wvCfExcludes(object: any, cv: any, win: any): boolean {
        try {
            // Asked for every collection of every refresh: the cheap answers first (the state
            // is cached by its strings; the switch reads prefs).
            if (!this._wvCfWired(win)) return false;
            const st = this._wvCfStateRO(win);
            if (!cfRowsOn(st) || !this._wvCfOn()) return false;
            const c = this._wvCfClassify(object);
            if (!c) return false;
            switch (c.kind) {
                case "collection": return !cfShown(st.kinds, "collections") || !this._wvCfLibShown(st, c.libraryID);
                case "search": return !cfShown(st.kinds, "searches") || !this._wvCfLibShown(st, c.libraryID);
                case "feeds":
                case "feed": return !cfShown(st.kinds, "feeds");
                case "special": return !cfShown(st.kinds, "special") || !this._wvCfLibShown(st, c.libraryID);
                case "library": {
                    if (this._wvCfLibShown(st, c.libraryID) && this._wvCfLibKeeps(cv, win, st, c.libraryID, object)) return false;
                    // A funnel that would leave nothing keeps one library row: Zotero's tree
                    // needs a row to stand on (with none, its `editable` getter reads an
                    // undefined row and Zotero stops at "Please restart Zotero", measured on
                    // 11.0-beta, 1.3.0-collfunnel.1). The message says why it is alone.
                    return !this._wvCfIsAnchor(cv, win, st, c.libraryID);
                }
            }
        } catch (e) {}
        return false;
    }

    /** The libraries of the tree, in its order: My Library, then the groups as Zotero lists
     *  them (collectionTree.jsx refresh). */
    _wvCfTreeLibs(): number[] {
        const out: number[] = [];
        try {
            out.push(Zotero.Libraries.userLibraryID);
            for (const g of Zotero.Groups.getAll() || []) if (g && g.libraryID > 0) out.push(g.libraryID);
        } catch (e) {}
        return out;
    }

    /** Nothing of the tree would show under `st` (no search text: Zotero keeps a hidden row
     *  of its own then): no library holds a row the funnel shows, and no Feeds row. */
    _wvCfNothingShows(cv: any, win: any, st: WvCfState): boolean {
        try {
            if (!cfRowsOn(st)) return false;
            if (cv && typeof cv._isFilterEmpty === "function" && !cv._isFilterEmpty()) return false;
            const hid = (o: any) => { try { return typeof this._wvHidIsHidden === "function" && this._wvHidIsHidden(o, win); } catch (e) { return false; } };
            if (cfShown(st.kinds, "feeds") && Zotero.Feeds.haveFeeds()
                && !(typeof this._wvHidSectionHidden === "function" && this._wvHidSectionHidden(win, "feeds"))) return false;
            for (const id of this._wvCfTreeLibs()) {
                const o: any = id === Zotero.Libraries.userLibraryID ? { libraryID: id } : Zotero.Groups.getByLibraryID(id);
                if (!o || hid(o)) continue;
                if (this._wvCfLibShown(st, id) && this._wvCfLibKeeps(cv, win, st, id, o)) return false;
            }
            return true;
        } catch (e) { return false; }
    }

    /** The tree's search text alone (Zotero's own test, collectionTree.jsx _matchesFilter)
     *  would keep a row: a library shown here, or the Feeds row, matches it or holds a match. */
    _wvCfTextMatchesAny(cv: any, win: any): boolean {
        try {
            const hid = (o: any) => { try { return typeof this._wvHidIsHidden === "function" && this._wvHidIsHidden(o, win); } catch (e) { return false; } };
            for (const id of this._wvCfTreeLibs()) {
                const o: any = id === Zotero.Libraries.userLibraryID ? { libraryID: id } : Zotero.Groups.getByLibraryID(id);
                if (o && !hid(o) && this._wvCfMatches(cv, o)) return true;
            }
            // Zotero's Feeds row is built on a plain object with updateFeed (collectionTree.jsx refresh).
            if (Zotero.Feeds.haveFeeds() && this._wvCfMatches(cv, { updateFeed() {} })) return true;
            return false;
        } catch (e) { return true; }
    }

    /** `libraryID` is the row kept when nothing would show: the first library the window
     *  shows (the hidden collections keep one). */
    _wvCfIsAnchor(cv: any, win: any, st: WvCfState, libraryID: number): boolean {
        try {
            if (!this._wvCfNothingShows(cv, win, st)) return false;
            for (const id of this._wvCfTreeLibs()) {
                const o: any = id === Zotero.Libraries.userLibraryID ? { libraryID: id } : Zotero.Groups.getByLibraryID(id);
                if (!o) continue;
                if (typeof this._wvHidIsHidden === "function" && this._wvHidIsHidden(o, win)) continue;
                return id === libraryID;
            }
        } catch (e) {}
        return false;
    }

    /** A library stays while it holds a row the funnel shows -- under a search text, a row
     *  that matches it, or the library itself matching it with such a row. */
    _wvCfLibKeeps(cv: any, win: any, st: WvCfState, libraryID: number, object: any): boolean {
        if (CF_KINDS.every((k) => cfShown(st.kinds, k))) return true;
        let filtering = false;
        try { filtering = !!cv && typeof cv._isFilterEmpty === "function" && !cv._isFilterEmpty(); } catch (e) {}
        if (filtering && this._wvCfLibHolds(cv, win, st, libraryID, true)) return true;
        if (filtering) {
            let self = false;
            try { self = !!cv._matchesFilter(object).matchesFilter; } catch (e) {}
            return self && this._wvCfLibHolds(cv, win, st, libraryID, false);
        }
        return this._wvCfLibHolds(cv, win, st, libraryID, false);
    }

    /** Library `libraryID` holds a row the funnel shows (`text`: one that matches the search
     *  text), through the tree's own rule for each (the hidden collections, Zotero's filter). */
    _wvCfLibHolds(cv: any, win: any, st: WvCfState, libraryID: number, text: boolean): boolean {
        try {
            if (cfShown(st.kinds, "collections")) {
                for (const c of Zotero.Collections.getByLibrary(libraryID) || []) {
                    if (c && !c.deleted && (!text || this._wvCfMatches(cv, c)) && cv._includedInTree(c)) return true;
                }
            }
            if (cfShown(st.kinds, "searches")) {
                for (const s of Zotero.Searches.getByLibrary(libraryID) || []) {
                    if (s && !s.deleted && (!text || this._wvCfMatches(cv, s)) && cv._includedInTree(s)) return true;
                }
            }
            if (cfShown(st.kinds, "special") && this._wvCfLibHasSpecial(cv, win, libraryID, text)) return true;
        } catch (e) {}
        return false;
    }

    /** The object or one of its children matches the tree's search text (Zotero's own test). */
    _wvCfMatches(cv: any, o: any): boolean {
        try { const m = cv._matchesFilter(o); return !!(m && (m.matchesFilter || m.hasChildMatchingFilter)); } catch (e) { return true; }
    }

    /** Some special row of the library would show in `win` (Zotero's setting, the hidden
     *  collections; the Trash unless it is empty and Zotero hides an empty one); `text`: whose
     *  name matches the search text -- Zotero 10 lists none while the search filters. */
    _wvCfLibHasSpecial(cv: any, win: any, libraryID: number, text: boolean): boolean {
        const types: string[] = [];
        for (const t of ["recentlyRead", "publications", "duplicates", "unfiled", "retracted"]) {
            try {
                if (t === "publications" && libraryID !== Zotero.Libraries.userLibraryID) continue;
                if (t === "retracted" && !Zotero.Retractions.libraryHasRetractedItems(libraryID)) continue;
                if (!(Zotero.Prefs as any).getVirtualCollectionStateForLibrary(libraryID, t)) continue;
                if (typeof this._wvHidIsHidden === "function" && this._wvHidIsHidden({ type: t, libraryID }, win)) continue;
                types.push(t);
            } catch (e) {}
        }
        try {
            const empty = cv && cv._trashNotEmpty && cv._trashNotEmpty[libraryID] === false;
            if (!(empty && !Zotero.Prefs.get("showTrashWhenEmpty"))) types.push("trash");
        } catch (e) { types.push("trash"); }
        if (!text) return types.length > 0;
        if (!cv || typeof cv._virtualRowMatchesFilter !== "function") return false;
        return types.some((t) => { try { return !!cv._virtualRowMatchesFilter(t); } catch (e) { return false; } });
    }

    /** The hidden collections' rule for the special rows of `libraryID` asks this (pane.ts
     *  _wvHidApply's visible()). */
    _wvCfHidesSpecial(win: any, libraryID: number): boolean {
        try {
            if (!this._wvCfWired(win) || !this._wvCfOn()) return false;
            const st = this._wvCfStateRO(win);
            return !cfShown(st.kinds, "special") || !this._wvCfLibShown(st, libraryID);
        } catch (e) { return false; }
    }

    /** The saved-search folders stand down in this window (search-folders.ts asks). */
    _wvCfFoldersOff(win: any): boolean {
        try {
            if (!this._wvCfWired(win) || !this._wvCfOn()) return false;
            return !cfFoldersShown(this._wvCfStateRO(win).secs);
        } catch (e) { return false; }
    }

    /** The funnel hides the saved searches in this window: the saved-search folders stand down
     *  too (search-folders.ts _wvSfOffHere; review 2026-11-28, I). */
    _wvCfSearchesOff(win: any): boolean {
        try {
            if (!this._wvCfWired(win) || !this._wvCfOn()) return false;
            return !cfShown(this._wvCfStateRO(win).kinds, "searches");
        } catch (e) { return false; }
    }

    /** The hidden collections' `_expandRow` layer asks (pane.ts _wvHidWrapExpandRow): the
     *  Trash rows a library just added leave when the funnel hides the special rows (Zotero 10
     *  has no `_getVirtualRowVisibility`). `n`: the rows Zotero added; the count left. */
    _wvCfDropTrash(cv: any, rows: any[], row: number, n: any): any {
        try {
            if (typeof n !== "number" || n <= 0 || !this._wvGfIsPaneTree(cv)) return n;
            const lr = rows[row];
            if (!lr || typeof lr.isLibrary !== "function" || !lr.isLibrary(true)) return n;
            const win = winOf(cv.domEl);
            if (!this._wvCfHidesSpecial(win, lr.ref.libraryID)) return n;
            // The Trash a navigation shows while it is selected (pane.ts _wvHidReveal; second
            // review 2026-11-28, 4: a trashed item's Show in Library, a link, a bookmark of it).
            if (typeof this._wvHidRevealedSpecial === "function" && this._wvHidRevealedSpecial(win, "trash", lr.ref.libraryID)) return n;
            const level = lr.level + 1;
            let m = n;
            for (let i = row + n; i > row; i--) {
                const r = rows[i];
                if (r && r.level === level && r.type === "trash") { rows.splice(i, 1); m--; }
            }
            return m;
        } catch (e) { return n; }
    }

    // ---- refresh ----

    /** The pane trees of `win` the hidden collections' wrapper filters (each library view's):
     *  the ones carrying its `wv-hid` layer (any instance's: an older one's chain still asks the
     *  live plugin), whose member is not a dead wrapper. Review 2026-11-28 (G): picked by an own
     *  `_includedInTree` property, a previous instance's dead stub (zotero#6080 scope nuke, a
     *  library view behind the one on screen) was refreshed and threw into Zotero's error
     *  message. */
    _wvCfTreesOf(win: any): any[] {
        const out: any[] = [];
        try {
            for (const cv of this._wvGfTreesOf(win)) {
                if (!this._wvGfIsPaneTree(cv) || !wvWrapLayers(cv, "_includedInTree").some((l) => l.layer === "wv-hid")) continue;
                let dead = false;
                try { dead = (Components as any).utils.isDeadWrapper(cv._includedInTree); } catch (e) { dead = false; }
                if (!dead) out.push(cv);
            }
        } catch (e) {}
        return out;
    }

    /** Every pane tree of `win` rebuilt -- one reload at a time per tree, through the saved-
     *  search folders' queue (two overlapping refreshes of one tree left neither's rows,
     *  search-folders.ts _wvSfReload) --, then the marks. */
    _wvCfRefreshWin(win: any): Promise<void> {
        const P: any = this;
        const jobs: Promise<any>[] = [];
        for (const cv of this._wvCfTreesOf(win)) {
            try {
                const run = (t: any) => { const p: any = wvLivePlugin() || P; return p._wvCfReloadKeep(t); };
                jobs.push(typeof this._wvSfReload === "function" ? this._wvSfReload(cv, run) : this._wvCfReloadKeep(cv));
            } catch (e) {}
        }
        return Promise.all(jobs).then(() => {
            const p: any = wvLivePlugin();
            if (!p) return;
            try { p._wvCfDecorate(win); } catch (e) {}
            try { p._wvHidDecorate(win); } catch (e) {}
        }).catch(() => {});
    }

    /** One tree rebuilt, its selection kept by id; a row that left: its library, else the
     *  first library shown, else any selectable row (the hidden collections' order). */
    async _wvCfReloadKeep(cv: any): Promise<void> {
        const sel = cv.selection;
        let ids: string[] = [];
        let focusedID: string | null = null;
        let lib: number | null = null;
        try {
            ids = Array.from((sel.selected || []) as Iterable<number>).map((i) => { const r = cv.getRow(i); return r && r.id; }).filter(Boolean);
            const fr = cv.getRow(sel.focused);
            focusedID = fr ? fr.id : null;
            lib = fr && fr.ref && fr.ref.libraryID > 0 ? fr.ref.libraryID : null;
        } catch (e) {}
        const owner = !sel.selectEventsSuppressed;
        if (owner) sel.selectEventsSuppressed = true;
        try {
            await cv.refresh();
            let ok: any = false;
            if (focusedID && cv._rowMap && cv._rowMap[focusedID] !== undefined) {
                if (typeof cv.restoreSelection === "function" && ids.length) { try { ok = await cv.restoreSelection(ids, { focusedID }); } catch (e) {} }
                if (!ok) { try { ok = await cv.selectByID(focusedID, false); } catch (e) {} }
            }
            if (!ok && lib && cv._rowMap && cv._rowMap["L" + lib] !== undefined) { try { ok = await cv.selectLibrary(lib); } catch (e) {} }
            if (!ok) ok = await this._wvCfSelectFirstLib(cv);
            if (!ok) {
                for (let i = 0; i < cv.rowCount; i++) {
                    const r = cv.getRow(i);
                    if (r && typeof r.isLibrary === "function" && r.isLibrary(true) && r !== cv._hiddenFocusedRow) { cv.selection.select(i); ok = true; break; }
                }
            }
            if (!ok) {
                for (let i = 0; i < cv.rowCount; i++) { if (cv.isSelectable(i) && cv.getRow(i) !== cv._hiddenFocusedRow) { cv.selection.select(i); break; } }
            }
            if (cv.tree) cv.tree.invalidate();
        }
        catch (e) { Zotero.debug("[Weavero] funnel: reload err: " + e); }
        finally { if (owner) sel.selectEventsSuppressed = false; }
    }

    /** The first library the funnel keeps in `cv`, in the tree's order, selected through
     *  Zotero's selectLibrary -- whose Group Libraries fold layer unfolds a folded group
     *  (group-fold.ts). Review 2026-11-28 (J): the rows' first isLibrary(true) row was a feed
     *  under a folded line. A library the funnel left out is never asked (no reveal here). */
    async _wvCfSelectFirstLib(cv: any): Promise<boolean> {
        const win = cv && cv.domEl ? winOf(cv.domEl) : null;
        if (!win || !this._wvCfRowsActive(win) || WV_CF_REVEALING.has(win)) return false;
        WV_CF_REVEALING.add(win);
        try {
            for (const id of this._wvCfTreeLibs()) {
                const o: any = id === Zotero.Libraries.userLibraryID ? { libraryID: id } : Zotero.Groups.getByLibraryID(id);
                if (!o || (typeof this._wvHidIsHidden === "function" && this._wvHidIsHidden(o, win))) continue;
                if (this._wvCfExcludes(o, cv, win)) continue;
                if (await cv.selectLibrary(id)) return true;
            }
        } catch (e) {}
        finally { WV_CF_REVEALING.delete(win); }
        return false;
    }

    // ---- the marks: the button, the message, the Bookmarks pane ----

    /** The tooltip's words: what each row shows only or hides. */
    _wvCfDescribe(win: any, st: WvCfState): string {
        const parts: string[] = [];
        const label = (row: string, v: string) => {
            if (row === "libs") return this._wvCfLibName(v) || v;
            return wvStr((row === "kinds" ? "weavero-cf-kind-" : "weavero-cf-sec-") + v, null, null);
        };
        for (const row of ["kinds", "libs", "secs"]) {
            const s: WvCfSet = (st as any)[row];
            if (s.inc.length) parts.push(wvStr("weavero-cf-part", { mode: "only", names: s.inc.map((v) => label(row, v)).join(", ") }, null));
            else if (s.exc.length) parts.push(wvStr("weavero-cf-part", { mode: "hide", names: s.exc.map((v) => label(row, v)).join(", ") }, null));
        }
        void win;
        return parts.join(" · ");
    }

    /** Every library view of `win`: the button lit and its tooltip, the message where the
     *  funnel left nothing, the Bookmarks pane hidden or not. */
    _wvCfDecorate(win: any) {
        try {
            if (!win || win.closed || !win.document) return;
            const doc = win.document;
            const on = this._wvCfWired(win) && this._wvCfOn();
            const st0 = on ? this._wvCfStateRO(win) : cfBlank();
            // A section whose trial is off filters nothing: out of the lit dot, the tooltip and
            // the Bookmarks pane's mark (review 2026-11-28, K: it stayed lit with no chip to
            // clear it -- the panel offers a section only while its trial is on).
            const liveSec = (v: string) => (v === "bookmarks" ? this._wvCfBmpOn() : this._wvCfSfOn());
            const st: WvCfState = { kinds: st0.kinds, libs: st0.libs, secs: { inc: st0.secs.inc.filter(liveSec), exc: st0.secs.exc.filter(liveSec) } };
            const active = on && cfAny(st);
            const tip = active
                ? wvStr("weavero-cf-tb-tip", { active: "yes", parts: this._wvCfDescribe(win, st) }, null)
                : wvStr("weavero-cf-tb-tip", { active: "no", parts: "" }, null);
            for (const bar of wvViewEls(doc, CF_TOOLBAR)) {
                const btn = bar.querySelector(":scope > .wv-cf-tb-button");
                if (!btn) continue;
                btn.classList.toggle("wv-cf-active", active);
                if (btn.getAttribute("tooltiptext") !== tip) btn.setAttribute("tooltiptext", tip);
            }
            const noBmp = on && this._wvCfBmpOn() && !cfShown(st.secs, "bookmarks");
            for (const colPane of wvViewEls(doc, CF_COLL_PANE)) {
                if (noBmp) { if (!colPane.hasAttribute("data-wv-cf-nobmp")) colPane.setAttribute("data-wv-cf-nobmp", "true"); }
                else if (colPane.hasAttribute("data-wv-cf-nobmp")) colPane.removeAttribute("data-wv-cf-nobmp");
                const box = colPane.querySelector(CF_TREE_BOX);
                if (!box) continue;
                let msg = box.querySelector(":scope > .wv-cf-empty");
                const cv = this._wvCfTreeOfPane(win, colPane);
                // Nothing the funnel shows: the tree holds only the library row it keeps to
                // stand on (_wvCfIsAnchor), or nothing at all.
                let n = 1;
                try { n = cv ? cv.rowCount - (cv._hiddenFocusedRow ? 1 : 0) : 1; } catch (e) {}
                // Under a search text, an empty tree is the funnel's only when the text alone
                // would leave a row (review 2026-11-28, D: a text matching nothing showed this
                // message, and its Clear threw the funnel away for no row back).
                let filtering = false;
                try { filtering = !!cv && typeof cv._isFilterEmpty === "function" && !cv._isFilterEmpty(); } catch (e) {}
                const empty = n <= 0 && (!filtering || this._wvCfTextMatchesAny(cv, win));
                const show = on && cfRowsOn(st) && (empty || (!!cv && this._wvCfNothingShows(cv, win, st)));
                if (!show) { if (msg) msg.hidden = true; continue; }
                if (msg && msg.getAttribute("data-wv-tag") !== this._wvWireTag()) { msg.remove(); msg = null; }
                if (!msg) {
                    msg = this._wvCfBuildEmpty(win, String(colPane.id || "").slice(CF_COLL_PANE.length));
                    box.insertBefore(msg, box.firstChild);
                }
                msg.hidden = false;
            }
        } catch (e) { Zotero.debug("[Weavero] funnel: decorate err: " + e); }
    }

    /** A redraw of `win`'s marks, once for a burst (every rebuild of a tree's rows asks). */
    _wvCfDecorateSoon(win: any) {
        if (!win || WV_CF_DECO.has(win)) return;
        WV_CF_DECO.add(win);
        wvTimeout(() => {
            WV_CF_DECO.delete(win);
            const p: any = wvLivePlugin();
            if (p && !win.closed) p._wvCfDecorate(win);
        }, 0);
    }

    /** The Group Libraries fold's `_refreshRowMap` class layer asks (group-fold.ts): a pane
     *  tree's rows changed. */
    _wvCfRowsChanged(cv: any) {
        try {
            if (!this._wvGfIsPaneTree(cv)) return;
            const win = winOf(cv.domEl);
            if (this._wvCfWired(win)) this._wvCfDecorateSoon(win);
        } catch (e) {}
    }

    /** The Group Libraries fold's notify layer asks (group-fold.ts), for collections and saved
     *  searches: of `ids`, the ones Zotero is told about. Review 2026-11-28:
     *  - H: an ADDED row the funnel hides is left out. Zotero's `_addSortedRow` returns the
     *    insertion index of a row `_includedInTree` kept out, and its notify then moves the
     *    selection one row down (`addedIndex <= focused`): one row per collection a sync, an
     *    undo or another window added.
     *  - B: a row the funnel shows whose library row it left out (the library held no row it
     *    showed), or a row erased (its library may hold no shown row now): the window's trees
     *    are rebuilt, a moment later -- the library rule is asked only while the rows are built.
     *    Only when the FUNNEL is what the row changes (second review 2026-11-28, 2): a library
     *    row the Group Libraries line folded away or the hidden collections hide whole is out
     *    too, and every add or rename there (a sync's batch, a collaborator's rename) rebuilt
     *    every tree of the window and scrolled it back to the selected row, for nothing -- the
     *    fold rebuilds its groups at its unfold (group-fold.ts `dirty`).
     *  The ids unchanged (the same array) when the funnel takes nothing out here. `extraData`:
     *  Zotero's notifier data (an erased object's libraryID, dataObject.js _initErase). */
    _wvCfNotifyIds(cv: any, action: string, type: string, ids: any[], extraData?: any): any[] {
        try {
            if (!this._wvGfIsPaneTree(cv)) return ids;
            const win = winOf(cv.domEl);
            if (!this._wvCfRowsActive(win)) return ids;
            const st = this._wvCfStateRO(win);
            // Every kind shown: the funnel leaves a library out only by its chip, and every row of
            // it with it -- no notification changes what it keeps.
            const kindsAll = CF_KINDS.every((k) => cfShown(st.kinds, k));
            if (action === "delete") {
                // Only a library whose row is in the tree has a row to lose; nothing says where
                // (no notifier data): rebuilt, as before.
                const rowIn = (lib: any) => !!cv._rowMap && cv._rowMap["L" + lib] !== undefined;
                if (!kindsAll && ids.some((id: any) => { const d = extraData && extraData[id]; return !d || d.libraryID == null || rowIn(d.libraryID); })) this._wvCfRefreshSoon(win);
                return ids;
            }
            if (action !== "add" && action !== "modify") return ids;
            // Per library of the batch (a sync's hundreds of ids): out of the tree by the funnel's
            // doing, and keeping a row now.
            const verdict = new Map<number, boolean>();
            const back = (lib: number): boolean => {
                let v = verdict.get(lib);
                if (v === undefined) {
                    v = false;
                    try {
                        if (this._wvCfLeftOut(cv, win, lib)) {
                            const lo: any = lib === Zotero.Libraries.userLibraryID ? { libraryID: lib } : Zotero.Groups.getByLibraryID(lib);
                            v = !!lo && this._wvCfLibKeeps(cv, win, st, lib, lo);
                        }
                    } catch (e) { v = false; }
                    verdict.set(lib, v);
                }
                return v;
            };
            let again = false;
            const out = ids.filter((id: any) => {
                const o: any = type === "collection" ? Zotero.Collections.get(id) : Zotero.Searches.get(id);
                if (!o || o.deleted) return true;
                const hides = this._wvCfExcludes(o, cv, win);
                if (!hides && !kindsAll && !again && back(o.libraryID)) again = true;
                return !(hides && action === "add");
            });
            if (again) this._wvCfRefreshSoon(win);
            return out.length === ids.length ? ids : out;
        } catch (e) { return ids; }
    }

    /** Library `libraryID`'s row is out of `cv` and the funnel is what can have taken it out:
     *  not the hidden collections (the library hidden whole, or its section), not the Group
     *  Libraries line (a group folded away with the others, group-fold.ts _wvGfFoldedAway). */
    _wvCfLeftOut(cv: any, win: any, libraryID: number): boolean {
        try {
            if (!cv._rowMap || cv._rowMap["L" + libraryID] !== undefined) return false;
            const o: any = libraryID === Zotero.Libraries.userLibraryID ? { libraryID } : Zotero.Groups.getByLibraryID(libraryID);
            if (!o) return false;
            if (typeof this._wvHidIsHidden === "function" && this._wvHidIsHidden(o, win)) return false;
            if (typeof this._wvGfFoldedAway === "function" && this._wvGfFoldedAway(cv, libraryID)) return false;
            return true;
        } catch (e) { return false; }
    }

    /** A navigation to `libraryIDs` begins in tree `cv` -- the Group Libraries fold's
     *  `selectItems` class layer (group-fold.ts): Zotero's selectItems is how a zotero://select
     *  link to an item and Show Item in Library reach an item, selecting its library first. Until
     *  the returned function runs, a library among them that the funnel left out is shown when
     *  Zotero's selectLibrary finds no row for it (_wvCfRevealLibrary). Second review 2026-11-28
     *  (1): the reveal ran on EVERY selectLibrary that found none, and the fallbacks ask
     *  selectLibrary(My Library) as a probe, going on to the next row on false -- the hidden
     *  collections' refresh (pane.ts _wvHidRefreshWin), the fold's reload (_wvGfReloadKeep),
     *  Zotero 11's library tab restore (libraryView.js _restoreLibraryTabState): a My Library the
     *  funnel hides was shown and selected instead of the next library. */
    _wvCfNavEnter(cv: any, libraryIDs: number[]): () => void {
        const set = new Set<number>();
        for (const id of libraryIDs || []) if (typeof id === "number") set.add(id);
        let list = WV_CF_NAV.get(cv);
        if (!list) { list = []; WV_CF_NAV.set(cv, list); }
        list.push(set);
        return () => {
            const l = WV_CF_NAV.get(cv);
            if (!l) return;
            const i = l.indexOf(set);
            if (i >= 0) l.splice(i, 1);
            if (!l.length) WV_CF_NAV.delete(cv);
        };
    }

    /** The libraries of items `itemIDs` (selectItems' argument), from Zotero's id map: a group
     *  library's items are not loaded at startup, and `Zotero.Items.get` throws for them until
     *  then (src-ts-windows.md); `getLibraryAndKeyFromID` reads the ids and keys loaded for all. */
    _wvCfItemLibs(itemIDs: any): number[] {
        const out: number[] = [];
        try {
            for (const id of Array.isArray(itemIDs) ? itemIDs : [itemIDs]) {
                const lk: any = Zotero.Items.getLibraryAndKeyFromID(id);
                if (lk && typeof lk.libraryID === "number" && !out.includes(lk.libraryID)) out.push(lk.libraryID);
            }
        } catch (e) {}
        return out;
    }

    /** A navigation to library `libraryID` runs in tree `cv` (_wvCfNavEnter). */
    _wvCfNavigating(cv: any, libraryID: number): boolean {
        const l = WV_CF_NAV.get(cv);
        return !!l && l.some((s) => s.has(libraryID));
    }

    /** The Group Libraries fold's `selectLibrary` layer asks when Zotero found no row for the
     *  library (group-fold.ts): one the funnel left out of the tree on screen is shown while it
     *  is selected, through the hidden collections' bookmark reveal (pane.ts _wvHidReveal) --
     *  review 2026-11-28, C: zotero://select links and Show Item in Library (Zotero's
     *  selectItems selects the library first) did nothing. Only while a navigation to it runs
     *  (_wvCfNavEnter): a bare selectLibrary is a fallback's probe too (second review, 1).
     *  True when it is selected. */
    async _wvCfRevealLibrary(cv: any, libraryID: any): Promise<boolean> {
        const win = cv && cv.domEl ? winOf(cv.domEl) : null;
        if (!win || WV_CF_REVEALING.has(win)) return false;
        try {
            const id = libraryID == null ? Zotero.Libraries.userLibraryID : libraryID;
            if (!this._wvCfNavigating(cv, id)) return false;
            if (!win.ZoteroPane || win.ZoteroPane.collectionsView !== cv || !this._wvCfRowsActive(win)) return false;
            if (!this._wvCfLibKey(id) || (cv._rowMap && cv._rowMap["L" + id] !== undefined)) return false;
            const lib: any = Zotero.Libraries.get(id);
            if (!lib || typeof this._wvHidReveal !== "function") return false;
            // _wvHidReveal's refresh selects again (selectLibrary): never back in here.
            WV_CF_REVEALING.add(win);
            return !!(await this._wvHidReveal(win, lib));
        } catch (e) { return false; }
        finally { WV_CF_REVEALING.delete(win); }
    }

    /** The Group Libraries fold's `selectCollection` / `selectSearch` / `selectTrash` class
     *  layers ask when Zotero found no row (group-fold.ts). Navigation members only: Zotero calls
     *  the first two for a zotero://select link (ZoteroProtocolHandler.mjs) and a sync conflict's
     *  object (syncRunner.js), selectTrash from selectItems for a trashed item; Weavero for its
     *  links (index.ts) and bookmark clicks -- never as a probe (the fallbacks use selectByID /
     *  restoreSelection). A row the funnel left out -- of a kind or a library it hides -- is shown
     *  while it is selected, with its library row if the funnel left that out too (pane.ts
     *  _wvHidReveal). One the hidden collections hide stays theirs: a link to it does nothing, as
     *  before the funnel. Second review 2026-11-28 (3, 4, 6, 7): the C fix reached libraries
     *  only. True when it is selected. */
    async _wvCfRevealFor(cv: any, kind: string, arg: any): Promise<boolean> {
        const win = cv && cv.domEl ? winOf(cv.domEl) : null;
        if (!win || WV_CF_REVEALING.has(win)) return false;
        try {
            if (!win.ZoteroPane || win.ZoteroPane.collectionsView !== cv || !this._wvCfRowsActive(win)) return false;
            if (typeof this._wvHidReveal !== "function") return false;
            let obj: any = null;
            if (kind === "collection") obj = Zotero.Collections.get(arg);
            else if (kind === "search") obj = Zotero.Searches.get(arg);
            // selectTrash(libraryID): the special row's descriptor (_wvCfClassify, _wvHidReveal).
            else if (kind === "trash" && arg != null) obj = { type: "trash", libraryID: arg };
            if (!obj || obj.deleted) return false;
            const hidden = kind === "collection"
                ? typeof this._wvHidCollHiddenDeep === "function" && this._wvHidCollHiddenDeep(obj, win)
                : typeof this._wvHidIsHidden === "function" && this._wvHidIsHidden(obj, win);
            if (hidden || !this._wvCfExcludes(obj, cv, win)) return false;
            // _wvHidReveal's refresh selects again: never back in here.
            WV_CF_REVEALING.add(win);
            return !!(await this._wvHidReveal(win, obj));
        } catch (e) { return false; }
        finally { WV_CF_REVEALING.delete(win); }
    }

    /** `win`'s trees rebuilt once for a burst of notifications (a sync's batch). */
    _wvCfRefreshSoon(win: any) {
        if (!win || WV_CF_SOON.has(win)) return;
        WV_CF_SOON.add(win);
        wvTimeout(() => {
            WV_CF_SOON.delete(win);
            const p: any = wvLivePlugin();
            if (p && !win.closed && p._wvCfRowsActive(win)) p._wvCfRefreshWin(win);
        }, 50);
    }

    _wvCfTreeOfPane(win: any, colPane: any): any {
        try {
            const view = colPane.closest ? colPane.closest("library-view") : null;
            if (view && view.collectionsView) return view.collectionsView;
        } catch (e) {}
        return (win && win.ZoteroPane && win.ZoteroPane.collectionsView) || null;
    }

    _wvCfBuildEmpty(win: any, sfx: string): any {
        const doc = win.document;
        const msg = wvHtmlEl(doc, "div", "wv-cf-empty");
        msg.id = CF_EMPTY + sfx;
        msg.setAttribute("data-wv-tag", this._wvWireTag());
        wvHtmlEl(doc, "span", "wv-cf-empty-text", wvStr("weavero-cf-empty", null, null), msg);
        const clear = wvHtmlEl(doc, "button", "wv-cf-empty-clear", wvStr("weavero-cf-empty-clear", null, null), msg);
        clear.setAttribute("type", "button");
        clear.addEventListener("click", (e: any) => {
            try {
                e.preventDefault(); e.stopPropagation();
                const p: any = wvLivePlugin();
                if (p) p._wvCfClear(win);
            } catch (err) {}
        });
        return msg;
    }

    // ---- the button and its panel ----

    /** A funnel button in the collections toolbar of every library view of `win`, between the
     *  spacer and Zotero's search toggle; one another instance built is replaced. */
    _wvCfEnsureButtons(win: any) {
        const doc = win.document;
        const tag = this._wvWireTag();
        for (const bar of wvViewEls(doc, CF_TOOLBAR)) {
            try {
                let btn = bar.querySelector(":scope > .wv-cf-tb-button");
                if (btn && btn.getAttribute("data-wv-tag") !== tag) { try { btn.remove(); } catch (e) {} btn = null; }
                if (!btn) {
                    btn = this._wvCfBuildButton(win, String(bar.id || "").slice(CF_TOOLBAR.length));
                    btn.setAttribute("data-wv-tag", tag);
                }
                const sbtn = bar.querySelector("[id^='zotero-tb-collections-search']");
                const box = sbtn ? (sbtn.parentNode === bar ? sbtn : sbtn.parentNode) : null;
                if (box && box.parentNode === bar) { if (btn.nextElementSibling !== box) bar.insertBefore(btn, box); }
                else if (btn.parentNode !== bar) bar.appendChild(btn);
            } catch (e) { Zotero.debug("[Weavero] funnel: button err: " + e); }
        }
    }

    /** The button: Zotero's funnel glyph, the lit dot, and its panel as its child
     *  (type="menu": a click opens it, the next closes it, a click outside or Escape too). */
    _wvCfBuildButton(win: any, sfx: string): any {
        const doc = win.document;
        const btn = doc.createXULElement("toolbarbutton");
        btn.id = CF_BTN + sfx;
        btn.className = "zotero-tb-button wv-cf-tb-button";
        btn.setAttribute("type", "menu");
        btn.setAttribute("tabindex", "-1");
        btn.setAttribute("tooltiptext", wvStr("weavero-cf-tb-tip", { active: "no", parts: "" }, null));
        const icon = doc.createXULElement("image");
        icon.className = "toolbarbutton-icon";
        icon.setAttribute("src", "chrome://zotero/skin/16/universal/filter.svg");
        btn.appendChild(icon);
        wvHtmlEl(doc, "span", "wv-cf-dot", undefined, btn);
        const panel = doc.createXULElement("panel");
        panel.id = CF_POPUP + sfx;
        panel.className = "wv-cf-panel";
        panel.setAttribute("animate", "false");
        panel.setAttribute("position", "after_end");
        wvHtmlEl(doc, "div", "wv-cf-inner", undefined, panel);
        // popupshowing bubbles: the panel's own only (src-ts.md).
        panel.addEventListener("popupshowing", (ev: any) => {
            if (ev.target !== panel) return;
            try { wvDismissTooltip(doc); } catch (e) {}
            try { const p: any = wvLivePlugin(); if (p) p._wvCfRenderPanel(win, panel); } catch (e) {}
        });
        btn.appendChild(panel);
        return btn;
    }

    /** The panel's content, from the window's state: the three chip rows, the hint, the
     *  footer. Drawn again after every chip (the panel stays open). */
    _wvCfRenderPanel(win: any, panel: any) {
        try {
            const doc = win.document;
            let inner = panel.querySelector(".wv-cf-inner");
            if (!inner) inner = wvHtmlEl(doc, "div", "wv-cf-inner", undefined, panel);
            while (inner.firstChild) inner.firstChild.remove();
            const st = this._wvCfState(win);
            let dark = false;
            try { dark = !!(win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches); } catch (e) {}
            const icon = (file: string) => "chrome://zotero/skin/collection-tree/16/" + (dark ? "dark" : "light") + "/" + file + ".svg";
            const row = (key: string, label: string, chips: any[]) => {
                if (!chips.length) return;
                const r = wvHtmlEl(doc, "div", "wv-cf-row", undefined, inner);
                r.setAttribute("data-cf-row", key);
                wvHtmlEl(doc, "div", "wv-cf-row-label", label, r);
                const box = wvHtmlEl(doc, "div", "wv-cf-chips", undefined, r);
                const set: WvCfSet = (st as any)[key];
                for (const c of chips) {
                    const b = wvHtmlEl(doc, "button", "wv-filter-opt wv-cf-chip", undefined, box);
                    b.setAttribute("type", "button");
                    b.setAttribute("data-cf-row", key);
                    b.setAttribute("data-cf-value", c.v);
                    if (set.inc.includes(c.v)) { b.setAttribute("data-selected", "true"); b.setAttribute("aria-pressed", "true"); }
                    else b.setAttribute("aria-pressed", "false");
                    if (set.exc.includes(c.v)) b.setAttribute("data-excluded", "true");
                    if (c.icon) {
                        const img = wvHtmlEl(doc, "img", "wv-cf-icon", undefined, b);
                        img.setAttribute("src", c.icon);
                        img.setAttribute("alt", "");
                    }
                    wvHtmlEl(doc, "span", "wv-cf-chip-text", c.label, b);
                    b.setAttribute("title", c.tip || c.label);
                    b.addEventListener("click", (e: any) => {
                        try {
                            e.preventDefault(); e.stopPropagation();
                            const p: any = wvLivePlugin();
                            if (!p) return;
                            const done = p._wvCfChip(win, key, c.v, !!e.altKey);
                            p._wvCfRenderPanel(win, panel);
                            Promise.resolve(done).catch(() => {});
                        } catch (err) {}
                    });
                }
            };
            row("kinds", wvStr("weavero-cf-row-kinds", null, null), [
                { v: "collections", label: wvStr("weavero-cf-kind-collections", null, null), icon: icon("collection") },
                { v: "searches", label: wvStr("weavero-cf-kind-searches", null, null), icon: icon("search") },
                { v: "feeds", label: wvStr("weavero-cf-kind-feeds", null, null), icon: icon("feed-library") },
                { v: "special", label: wvStr("weavero-cf-kind-special", null, null), icon: icon("unfiled"), tip: wvStr("weavero-cf-kind-special-tip", null, null) },
            ]);
            row("libs", wvStr("weavero-cf-row-libs", null, null),
                this._wvCfLibraries().map((l: any) => ({ v: l.key, label: l.name, icon: icon(l.group ? "library-group" : "library") })));
            const secs: any[] = [];
            if (this._wvCfBmpOn()) secs.push({ v: "bookmarks", label: wvStr("weavero-cf-sec-bookmarks", null, null) });
            if (this._wvCfSfOn()) secs.push({ v: "folders", label: wvStr("weavero-cf-sec-folders", null, null) });
            row("secs", wvStr("weavero-cf-row-secs", null, null), secs);
            wvHtmlEl(doc, "div", "wv-cf-hint", wvStr("weavero-cf-hint", null, null), inner);
            const foot = wvHtmlEl(doc, "div", "wv-cf-foot", undefined, inner);
            const own = typeof win._wvCf === "string" && !!win._wvCf;
            const scope = wvHtmlEl(doc, "span", "wv-cf-scope", wvStr("weavero-cf-scope", { scope: own ? "window" : "default" }, null), foot);
            scope.setAttribute("title", wvStr("weavero-cf-scope", { scope: own ? "window" : "default" }, "title") || "");
            const use = wvHtmlEl(doc, "button", "wv-cf-use-default", wvStr("weavero-cf-use-default", null, null), foot);
            use.setAttribute("type", "button");
            use.setAttribute("title", wvStr("weavero-cf-use-default", null, "title") || "");
            use.addEventListener("click", (e: any) => {
                try {
                    e.preventDefault(); e.stopPropagation();
                    const p: any = wvLivePlugin();
                    if (!p) return;
                    const done = p._wvCfUseAsDefault(win);
                    p._wvCfRenderPanel(win, panel);
                    Promise.resolve(done).catch(() => {});
                } catch (err) {}
            });
            const back = wvHtmlEl(doc, "button", "wv-cf-reset-default", wvStr("weavero-cf-reset-default", null, null), foot);
            back.setAttribute("type", "button");
            back.setAttribute("title", wvStr("weavero-cf-reset-default", null, "title") || "");
            if (!own && !(this._wvCfBmpOn() && this._wvBmpState(win).only)) back.setAttribute("disabled", "true");
            back.addEventListener("click", (e: any) => {
                try {
                    e.preventDefault(); e.stopPropagation();
                    const p: any = wvLivePlugin();
                    if (!p) return;
                    const done = p._wvCfResetToDefault(win);
                    p._wvCfRenderPanel(win, panel);
                    Promise.resolve(done).catch(() => {});
                } catch (err) {}
            });
        } catch (e) { Zotero.debug("[Weavero] funnel: panel err: " + e); }
    }

    // ---- wiring ----

    /** Wiring-table entry "coll-funnel" (perView): the sheet, a button in every library view's
     *  collections toolbar, the marks. A window whose funnel already acts (restored before it
     *  was wired) gets its trees filtered. Off: everything of it out. The rows go through the
     *  hidden collections' layers (pane.ts), wired by their own entry. */
    _wvCfWire(win: any, opts?: { quiet?: boolean }) {
        try {
            if (!win || win.closed || !win.document) return;
            this._wvCfWatch();
            if (!this._wvCfOn()) { this._wvCfUnwireWin(win, opts); return; }
            const was = this._wvCfWired(win);
            WV_CF_WIRED.add(win);
            WV_CF_CACHE.delete(win);
            wvInjectStyle(win.document, CF_STYLE_ID, CF_CSS);
            this._wvCfEnsureButtons(win);
            this._wvCfDecorate(win);
            const quiet = !!(opts && opts.quiet);
            // The refresh a microtask later, out of the wiring entry's own record
            // (lib/wire-owner.ts): what a refresh wires on the trees (the fold's layers,
            // group-fold.ts _wvGfWireTree) belongs to their entries.
            Promise.resolve().then(() => {
                const p: any = wvLivePlugin();
                if (!p || win.closed || !p._wvCfWired(win)) return;
                if (quiet || was) return;
                if (cfRowsOn(p._wvCfStateRO(win))) p._wvCfRefreshWin(win);
                if (!cfFoldersShown(p._wvCfStateRO(win).secs) && p._wvCfSfOn()) { try { p._wvSfRefreshWin(win); } catch (e) {} }
            }).catch(() => {});
        } catch (e) { Zotero.debug("[Weavero] _wvCfWire err: " + e); }
    }

    /** The entry's undo on one window (ADR-0001): its buttons, panels, messages and marks,
     *  the sheet. The window's state stays (a string on the window). Its
     *  trees get every row back -- not at the window's own close, nor while Zotero quits
     *  (`skipOnShutdown`); on a disable the hidden collections' teardown refreshes the view on
     *  screen, this one the library tabs behind it. */
    _wvCfUnwireWin(win: any, opts?: { quiet?: boolean }): Promise<void> {
        try {
            if (!win) return Promise.resolve();
            const had = this._wvCfWired(win);
            let rows = false;
            try { rows = had && cfRowsOn(this._wvCfStateRO(win)); } catch (e) {}
            let folders = false;
            try { folders = had && !cfFoldersShown(this._wvCfStateRO(win).secs); } catch (e) {}
            WV_CF_WIRED.delete(win);
            WV_CF_CACHE.delete(win);
            const doc = win.document;
            if (doc) {
                for (const el of Array.from(doc.querySelectorAll(".wv-cf-tb-button, .wv-cf-empty")) as any[]) {
                    try { const pop = el.querySelector && el.querySelector(":scope > panel"); if (pop && pop.hidePopup) pop.hidePopup(); } catch (e) {}
                    try { el.remove(); } catch (e) {}
                }
                for (const el of Array.from(doc.querySelectorAll("[data-wv-cf-nobmp]")) as any[]) { try { el.removeAttribute("data-wv-cf-nobmp"); } catch (e) {} }
                wvRemoveStyle(doc, CF_STYLE_ID);
            }
            // `quiet`: Extras switched, whose own observer refreshes the trees (prefs-observers.ts
            // _wvHidRefreshAll, search-folders.ts): a third refresh would race them.
            if (!(rows || folders) || win.closed || (opts && opts.quiet)) return Promise.resolve();
            // Zotero quitting (destroy() calls this too, past the table's skipOnShutdown).
            try { if (Services.startup.shuttingDown) return Promise.resolve(); } catch (e) {}
            if (this._wvDestroyed) {
                // A disable: the hidden collections' teardown refreshes the view on screen
                // (pane.ts _wvHidTeardown); the library tabs behind it here, at once.
                const active = win.ZoteroPane && win.ZoteroPane.collectionsView;
                const jobs: Promise<any>[] = [];
                for (const cv of this._wvCfTreesOf(win)) {
                    if (cv === active) continue;
                    try { jobs.push(this._wvCfReloadKeep(cv)); } catch (e) {}
                }
                return Promise.all(jobs).then(() => {}).catch(() => {});
            }
            // A task later: a window that is closing (the main-window teardown runs this table)
            // is closed by then, and gets nothing back.
            const P: any = this;
            return new Promise<void>((resolve) => {
                wvTimeout(() => {
                    try {
                        if (win.closed) { resolve(); return; }
                        const jobs: Promise<any>[] = [];
                        for (const cv of P._wvCfTreesOf(win)) {
                            try { jobs.push(P._wvSfReload(cv, (t: any) => P._wvCfReloadKeep(t))); } catch (e) {}
                        }
                        Promise.all(jobs).then(() => resolve(), () => resolve());
                    } catch (e) { resolve(); }
                }, 0);
            });
        } catch (e) {
            Zotero.debug("[Weavero] _wvCfUnwireWin err: " + e);
            return Promise.resolve();
        }
    }

    /** The settings, watched once per instance (given back in _wvCfTeardown). */
    _wvCfWatch() {
        if (this._wvCfWatching) return;
        this._wvCfWatching = true;
        const obs: any[] = [];
        const rewire = (quiet: boolean) => {
            const p: any = wvLivePlugin();
            if (!p) return;
            for (const w of wvMainWins()) { try { p._wvCfWire(w, { quiet }); } catch (e) {} }
        };
        try {
            for (const n of [CF_PREF, "enableVisualExtras", "collectionsBookmarksPane", "collectionsSearchFolders", "enableLibraryBookmarks", "enableBookmarks"]) {
                obs.push(Zotero.Prefs.registerObserver("weavero." + n, () => {
                    rewire(n === "enableVisualExtras");
                    const p: any = wvLivePlugin();
                    if (p) for (const w of wvMainWins()) { try { WV_CF_CACHE.delete(w); p._wvCfDecorate(w); } catch (e) {} }
                }));
            }
            obs.push(Zotero.Prefs.registerObserver(CF_DEF_PREF, () => {
                const p: any = wvLivePlugin();
                if (p && !p._wvCfWriting) p._wvCfDefaultChanged();
            }));
            for (const k of Object.keys(CF_SHOW_PREFS)) {
                obs.push(Zotero.Prefs.registerObserver("weavero." + CF_SHOW_PREFS[k], () => {
                    const p: any = wvLivePlugin();
                    if (p) p._wvCfSyncDefaultFromPrefs();
                }));
            }
        } catch (e) {}
        this._wvCfPrefObs = obs;
    }

    /** destroy(): every window unwired, the watches given back. */
    _wvCfTeardown(): Promise<void> {
        try {
            for (const id of (this._wvCfPrefObs || [])) { try { Zotero.Prefs.unregisterObserver(id); } catch (e) {} }
            this._wvCfPrefObs = [];
            this._wvCfWatching = false;
            this._wvCfDefCache = null;
            const jobs: Promise<any>[] = [];
            for (const w of wvMainWins()) jobs.push(this._wvCfUnwireWin(w));
            return Promise.all(jobs).then(() => {});
        } catch (e) {
            Zotero.debug("[Weavero] _wvCfTeardown err: " + e);
            return Promise.resolve();
        }
    }
}

const _cfDescriptors = Object.getOwnPropertyDescriptors(_CollFunnelMixin.prototype);
delete (_cfDescriptors as any).constructor;
export const collFunnelMethods = _cfDescriptors;
