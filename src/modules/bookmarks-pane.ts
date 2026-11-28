// Module: bookmarks-pane -- the bookmarks in the collections column, above the tree.
//
// MJT 2026-11-27 ("All ok. You can go."; work/collections-organization-2026-11-27.md,
// recommendation 2): the bookmarks (bookmarks.ts, ONE tree in <data dir>/weavero/bookmarks.json)
// shown where they are used, in a pane of their own ABOVE the collections tree, a splitter
// between them, foldable to its header -- as Zotero's Tag Selector sits under the tree
// (libraryView.js / zoteroPane.xhtml: #zotero-tags-splitter between
// #zotero-collections-tree-container and #zotero-tag-selector-container). The dropdown stays.
//
// - Header: a fold twisty, the title, and a "Bookmarks only" switch that hides the tree so the
//   pane takes the column (display C of the note); folding turns it off, turning it on unfolds.
// - Rows: the store's tree in its own order (the dropdown's display sort is the dropdown's),
//   folders opening in place; each row the dropdown's icon, label and tooltip (bookmarks.ts
//   _bmRowParts / _bmFolderParts). A click goes where the dropdown's goes (_bmActivateBookmark),
//   in the pane's own window; a right-click opens the dropdown's menus.
// - Drag and drop: a bookmark moves before / after / into a folder (_bmMove); items dropped on a
//   collection's bookmark go into that collection through Zotero's own drop
//   (collectionTree.jsx dropOnTreeRow, Zotero 11; on Zotero 10, which has no such entry point,
//   the same-library add its onDrop makes); collections, saved searches and libraries dropped
//   anywhere in the pane, and items dropped on its empty part, are bookmarked, as on the
//   toolbar button (_bmDropAdd).
// - Per WINDOW, every library view of a window showing the window's state: folded, the height,
//   Bookmarks only, the folders open. `win._wvBmp`, a JSON string (a later instance reads it
//   after a reload; a string cannot turn into a dead object under zotero#6080), saved with the
//   window's session record and window state (`bmPane`, beside `hiddenColl` / `sfOpen`).
// - Off (Settings, Extras > Collections, devOnly; or Library bookmarks off): nothing in the
//   DOM. Teardown: the panes, splitters, the column's mode attribute, the sheet, the watches.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.
// Guard: test/bookmarks-pane.spec.js.

import { wvLivePlugin } from "../lib/live";
import { wvMainWins, wvViewEls } from "../lib/windows";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvHtmlEl, winOf } from "../lib/dom";
import { wvSvgEl } from "../lib/svg";
import { wvStr } from "../lib/l10n";
import { wvTimeout } from "../lib/timers";
import { wvLinkClassRules } from "../lib/links";
import { wvOutsideClick } from "../lib/dismiss";
import { BM_STYLE_ID, WvBmSurface } from "./bookmarks";

declare const Zotero: any;

const BMP_PREF = "collectionsBookmarksPane";
const BMP_STYLE_ID = "wv-bmpane-style";
/** A bookmark row's drag: its id. */
const BMP_DRAG = "weavero/bookmark";
const BMP_COLL_PANE = "zotero-collections-pane";
const BMP_DEFAULT_H = 180;
const BMP_MIN_H = 48;
const BMP_TREE_BOX = ":scope > [id^='zotero-collections-tree-container']";

/** One window's state; absent = the defaults (open, the default height, the tree shown,
 *  every folder closed). */
interface WvBmpState { folded: boolean; only: boolean; h: number | null; open: string[] }

/** The bookmark being dragged inside a pane, per window (a drag's own types cannot be read
 *  during dragover from content; chrome can, but a drag from the pane says it here too). */
const WV_BMP_DRAG: WeakMap<any, string> = new WeakMap();
/** What a list last drew (the store, the open folders, the theme): a redraw that would draw
 *  the same is skipped. */
const WV_BMP_SIG: WeakMap<any, string> = new WeakMap();
/** The theme watch per window (the rows' collection icons are themed files). */
const WV_BMP_MQ: WeakMap<any, { mq: any; fn: any }> = new WeakMap();
/** The tools' filter state per window: the search text, the search row open, the chip bag.
 *  Transient, as the dropdown's (not saved with the window). */
const WV_BMP_FS: WeakMap<any, { text: string; searchOpen: boolean; chips: any }> = new WeakMap();
/** What a tools row last drew (sort, search open, chips on, side popup open). */
const WV_BMP_TSIG: WeakMap<any, string> = new WeakMap();
/** The select listener on each collections tree (what the centre shows: the rows marked). */
const WV_BMP_SEL: WeakMap<any, any> = new WeakMap();

// The rows take Zotero's collection-tree geometry: the text height plus 5 px (compact) or
// 11 px (comfortable), as virtualized-table.jsx _getRowHeight; 16-px twisty, icon and level
// indent, 4 px before the text (_collection-tree.scss); the twisty is Zotero's chevron.
const BMP_CSS = `
.wv-bmpane { flex: 0 1 auto; min-height: ${BMP_MIN_H}px; overflow: clip; }
.wv-bmp-head { display: flex; align-items: center; gap: 4px; flex: none; box-sizing: border-box;
    min-height: 28px; padding: 2px 8px 2px 8px; cursor: default; user-select: none; -moz-user-select: none; }
.wv-bmp-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-weight: 600; color: var(--fill-primary); }
.wv-bmp-twisty { flex: none; width: 16px; height: 16px; padding: 4px; box-sizing: border-box;
    background: url("chrome://zotero/skin/8/universal/chevron-8.svg") content-box no-repeat;
    -moz-context-properties: fill, fill-opacity; fill: var(--fill-secondary);
    transform: rotate(-90deg); transition: transform 0.125s ease; }
.wv-bmp-twisty.open { transform: rotate(0deg); }
.wv-bmp-twisty:not(.open):-moz-locale-dir(rtl) { transform: rotate(90deg); }
.wv-bmp-spacer { flex: none; width: 16px; }
.wv-bmp-only { flex: none; display: flex; align-items: center; justify-content: center; width: 24px; height: 22px;
    padding: 0; margin: 0; border: none; border-radius: 5px; background: transparent; color: var(--fill-secondary); }
.wv-bmp-only:hover { background: var(--fill-quinary); color: var(--fill-primary); }
.wv-bmp-only[aria-pressed="true"] { background: var(--fill-quinary); color: var(--color-accent); }
.wv-bmp-only svg { width: 16px; height: 16px; }
.wv-bmp-list { flex: 1 1 0; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 0 8px 4px;
    scrollbar-color: var(--color-scrollbar) var(--color-scrollbar-background); }
.wv-bmp-row { display: flex; align-items: center; gap: 4px; box-sizing: border-box; border-radius: 5px;
    line-height: 1.3333333333333333; padding-block: 2.5px; padding-inline: calc(4px + var(--wv-bmp-level, 0) * 16px) 4px;
    cursor: default; }
[zoteroUIDensity="comfortable"] .wv-bmp-row { padding-block: 5.5px; }
.wv-bmp-row:hover { background: var(--fill-quinary); }
.wv-bmp-row .wv-bmp-icon { flex: none; width: 16px; height: 16px; }
.wv-bmp-row .wv-bm-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wv-bmp-row .wv-bm-sublabel { opacity: .55; font-style: italic; }
${wvLinkClassRules(".wv-bmp-row .wv-bm-label").join("\n")}
.wv-bmp-row.wv-bmp-dragging { opacity: .4; }
.wv-bmp-row.wv-bmp-drop-before { box-shadow: inset 0 2px 0 0 var(--color-accent); }
.wv-bmp-row.wv-bmp-drop-after { box-shadow: inset 0 -2px 0 0 var(--color-accent); }
.wv-bmp-row.wv-bmp-drop-on { color: var(--material-background); background: var(--fill-secondary); }
.wv-bmp-list.wv-bmp-drop-on { box-shadow: inset 0 0 0 2px var(--color-accent); border-radius: 5px; }
.wv-bmp-row.wv-bmp-missing { opacity: .55; }
.wv-bmp-row.wv-bmp-missing .wv-bm-label { text-decoration: line-through; text-decoration-color: rgba(224,72,59,.55); }
.wv-bmp-row .wv-bm-missing-badge { flex: none; margin-inline-start: 4px; color: #e0483b; font-size: 11px; line-height: 1; }
@keyframes wv-bmp-pulse { 0%, 100% { background: transparent; } 30% { background: rgba(224,72,59,.30); } }
.wv-bmp-row.wv-bmp-flash { animation: wv-bmp-pulse .6s ease; }
.wv-bmp-empty { padding: 4px 4px 6px; color: var(--fill-secondary); font-size: .92em; }
.wv-bmp-empty.wv-bmp-none { font-style: italic; }
/* The tools: the dropdown's buttons (its sheet, bookmarks.ts BM_POPUP_CSS), laid out in a row
   under the title as in the dropdown. */
.wv-bmp-tools { flex: none; }
.wv-bmpane .wv-bm-actions { display: flex; align-items: center; gap: 2px; padding: 0 4px 2px; }
.wv-bmpane .wv-bm-funnel-spacer { margin-inline-start: auto; }
.wv-bmpane .wv-bm-search { display: flex; padding: 0 6px 4px; position: relative; }
/* What the centre shows: Zotero's own selected-row look, unfocused (the rows take no focus;
   _virtualized-table.scss .row.selected under .virtualized-table:not(:focus-within)). */
.wv-bmp-row.wv-bmp-current { background-color: var(--color-quarternary-on-sidepane, var(--fill-quinary)); color: var(--fill-primary); }
.wv-bmp-row.wv-bmp-current:hover { background-color: var(--color-quarternary-on-sidepane, var(--fill-quinary)); }
.wv-bmp-row .wv-bmp-holds { flex: none; width: 6px; height: 6px; border-radius: 50%; margin-inline: 2px 4px; background: var(--color-accent); }
/* "Now showing", in Bookmarks only: what the centre shows, the tree being hidden. */
.wv-bmp-now { display: none; flex: none; align-items: center; gap: 4px; box-sizing: border-box; min-width: 0;
    margin: 0 8px 4px; padding: 2px 4px 2px 8px; border-radius: 5px; line-height: 1.3333333333333333;
    background-color: var(--color-quarternary-on-sidepane, var(--fill-quinary)); cursor: default; }
[data-wv-bmp-mode="only"] > .wv-bmpane > .wv-bmp-now[data-wv-shown="true"] { display: flex; }
.wv-bmp-now .wv-bmp-icon { flex: none; width: 16px; height: 16px; }
.wv-bmp-now .wv-bmp-now-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wv-bmp-now .wv-bm-sublabel { opacity: .55; font-style: italic; }
.wv-bmp-now .wv-bmp-now-add { flex: none; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;
    padding: 0; margin: 0; border: none; border-radius: 4px; background: transparent; color: var(--fill-secondary); }
.wv-bmp-now .wv-bmp-now-add:hover { background: var(--fill-quinary); color: var(--fill-primary); }
.wv-bmp-now .wv-bmp-now-add[hidden] { display: none; }
.wv-bmp-now .wv-bmp-now-add img { width: 16px; height: 16px; -moz-context-properties: fill; fill: currentColor; }
.wv-bmpane-splitter[orient="vertical"] { border-top: 0; border-bottom: var(--material-border-quarternary);
    margin-top: calc(1px - var(--draggable-size)); margin-bottom: -1px; }
[data-wv-bmp-mode="only"] > [id^="zotero-collections-tree-container"] { display: none !important; }
[data-wv-bmp-mode="only"] > .wv-bmpane-splitter, [data-wv-bmp-mode="folded"] > .wv-bmpane-splitter { display: none !important; }
[data-wv-bmp-mode="only"] > .wv-bmpane { flex: 1 1 auto !important; height: auto !important; }
[data-wv-bmp-mode="folded"] > .wv-bmpane { flex: none !important; height: auto !important; min-height: 0; }
[data-wv-bmp-mode="folded"] > .wv-bmpane > :is(.wv-bmp-list, .wv-bmp-tools, .wv-bmp-now) { display: none !important; }
`;

class _BookmarksPaneMixin {
    [k: string]: any;

    // ---- on / off ----

    /** On under Extras, its own setting, and while the library bookmarks are. */
    _wvBmpOn(): boolean {
        try { return !!this._wvPref(BMP_PREF) && !!this._getEnableLibraryBookmarks(); } catch (e) { return false; }
    }

    // ---- the window's state ----

    _wvBmpState(win: any): WvBmpState {
        const st: WvBmpState = { folded: false, only: false, h: null, open: [] };
        try {
            const raw = win && win._wvBmp;
            const d = typeof raw === "string" && raw ? JSON.parse(raw) : null;
            if (d && typeof d === "object") {
                st.folded = d.folded === true;
                st.only = d.only === true;
                st.h = typeof d.h === "number" && Number.isFinite(d.h) && d.h >= BMP_MIN_H ? Math.round(d.h) : null;
                st.open = Array.isArray(d.open) ? d.open.filter((x: any) => typeof x === "string") : [];
            }
        } catch (e) {}
        return st;
    }

    /** The state as saved: only what differs from the defaults; undefined for none. */
    _wvBmpCompact(st: WvBmpState): any {
        const out: any = {};
        if (st.folded) out.folded = true;
        if (st.only) out.only = true;
        if (st.h) out.h = st.h;
        if (st.open.length) out.open = Array.from(new Set(st.open));
        return Object.keys(out).length ? out : undefined;
    }

    _wvBmpSetState(win: any, st: WvBmpState, opts?: { save?: boolean }) {
        if (!win || win.closed) return;
        const c = this._wvBmpCompact(st);
        try {
            if (c) win._wvBmp = JSON.stringify(c);
            else if (win._wvBmp !== undefined) delete win._wvBmp;
        } catch (e) {}
        this._wvBmpApplyWin(win);
        // The collections funnel reads Bookmarks only in as its "show only the Bookmarks pane"
        // (coll-funnel.ts): its button's dot and tooltip follow the pane's own switch and its
        // "Now showing" line too (review 2026-11-28, A: they stayed lit).
        try { if (typeof (this as any)._wvCfDecorate === "function") (this as any)._wvCfDecorate(win); } catch (e) {}
        // Saved with the window (the store's debounced save: windows.json, or the window's
        // own settings on a Zotero with its own windows).
        if (!opts || opts.save !== false) { try { this._wvWindowStoreSaveDebounced(); } catch (e) {} }
    }

    /** For the window's saved state and session record: undefined at the defaults. */
    _wvBmpCapture(win: any): any {
        try { return this._wvBmpCompact(this._wvBmpState(win)); } catch (e) { return undefined; }
    }

    /** A saved state back on window `win` (null: the defaults). No save: the restore is what
     *  is saved. */
    _wvBmpRestore(win: any, data: any) {
        try {
            if (!win || win.closed) return;
            let raw = "";
            try { raw = data && typeof data === "object" ? JSON.stringify(data) : ""; } catch (e) {}
            try {
                if (raw) win._wvBmp = raw;
                else if (win._wvBmp !== undefined) delete win._wvBmp;
            } catch (e) {}
            // Normalized through the reader, so a bad value goes.
            this._wvBmpSetState(win, this._wvBmpState(win), { save: false });
        } catch (e) { Zotero.debug("[Weavero] bookmarks pane: restore err: " + e); }
    }

    _wvBmpSetFolded(win: any, folded: boolean) {
        const st = this._wvBmpState(win);
        st.folded = !!folded;
        // Folding hides the list: the tree comes back with it.
        if (st.folded) st.only = false;
        this._wvBmpSetState(win, st);
    }

    _wvBmpSetOnly(win: any, only: boolean) {
        const st = this._wvBmpState(win);
        st.only = !!only;
        if (st.only) st.folded = false;
        this._wvBmpSetState(win, st);
    }

    _wvBmpSetFolderOpen(win: any, id: string, open?: boolean) {
        const st = this._wvBmpState(win);
        const has = st.open.includes(id);
        const want = open === undefined ? !has : !!open;
        if (want === has) return;
        st.open = want ? st.open.concat([id]) : st.open.filter((x) => x !== id);
        this._wvBmpSetState(win, st);
    }

    // ---- where ----

    /** The tree container of a collections pane (its id carries a library tab's suffix). */
    _wvBmpTreeBox(colPane: any): any {
        try { return colPane.querySelector(BMP_TREE_BOX); } catch (e) { return null; }
    }

    /** The collections tree of the library view that holds `node` (each library tab its own
     *  on a Zotero with its own windows), else the window's. */
    _wvBmpTreeOf(win: any, node: any): any {
        try {
            const view = node && node.closest ? node.closest("library-view") : null;
            if (view && view.collectionsView) return view.collectionsView;
        } catch (e) {}
        return (win && win.ZoteroPane && win.ZoteroPane.collectionsView) || null;
    }

    // ---- building ----

    /** Wiring-table entry "bookmarks-pane" (perView): the sheet, a pane above the tree of each
     *  library view of `win`, the store, the watches. Off: everything of it out of `win`. */
    _wvBmpWire(win: any) {
        try {
            if (!win || win.closed || !win.document) return;
            if (!this._wvBmpOn()) { this._wvBmpRemoveWin(win); this._wvBmpWatch(); return; }
            this._wvBmpWatch();
            wvInjectStyle(win.document, BMP_STYLE_ID, BMP_CSS);
            this._wvBmpWatchTheme(win);
            this._wvBmpApplyWin(win);
            if (!this._bmDoc) {
                Promise.resolve(this._bmInit()).then(() => {
                    const p: any = wvLivePlugin();
                    if (p && !win.closed) p._wvBmpRender(win, true);
                }).catch(() => {});
            }
            if (!this._wvBmpPreloaded) {
                this._wvBmpPreloaded = true;
                Promise.resolve(this._bmInit()).then(() => this._bmPreloadTargets()).then(() => {
                    const p: any = wvLivePlugin();
                    if (p) p._wvBmpRefreshAll(true);
                }).catch(() => {});
            }
        } catch (e) { Zotero.debug("[Weavero] _wvBmpWire err: " + e); }
    }

    /** Every library view of `win`: its pane built where missing (or left by another
     *  instance), its mode, height and switches, its rows. */
    _wvBmpApplyWin(win: any) {
        if (!win || win.closed || !this._wvBmpOn()) return;
        const doc = win.document;
        const st = this._wvBmpState(win);
        this._wvBmpWatchTrees(win);
        for (const colPane of wvViewEls(doc, BMP_COLL_PANE)) {
            try {
                const pane = this._wvBmpEnsure(win, colPane);
                if (!pane) continue;
                const mode = st.only ? "only" : st.folded ? "folded" : "open";
                if (colPane.getAttribute("data-wv-bmp-mode") !== mode) {
                    const wasOnly = colPane.getAttribute("data-wv-bmp-mode") === "only";
                    colPane.setAttribute("data-wv-bmp-mode", mode);
                    // The tree back from display:none: its virtualized list measures again.
                    if (wasOnly && mode !== "only") {
                        const cv = this._wvBmpTreeOf(win, colPane);
                        try { win.requestAnimationFrame(() => { try { if (cv && cv.tree) cv.tree.invalidate(); } catch (e) {} }); } catch (e) {}
                    }
                }
                const h = (st.h || BMP_DEFAULT_H) + "px";
                if (pane.style.height !== h) pane.style.height = h;
                const fold = pane.querySelector(".wv-bmp-head .wv-bmp-fold");
                if (fold) {
                    fold.classList.toggle("open", !st.folded);
                    fold.setAttribute("aria-expanded", st.folded ? "false" : "true");
                    fold.setAttribute("title", wvStr("weavero-bmpane-fold-tip", { folded: st.folded ? "yes" : "no" }));
                }
                const only = pane.querySelector(".wv-bmp-head .wv-bmp-only");
                if (only) {
                    only.setAttribute("aria-pressed", st.only ? "true" : "false");
                    only.setAttribute("title", wvStr("weavero-bmpane-only-tip", { on: st.only ? "yes" : "no" }));
                    this._wvBmpOnlyGlyph(doc, only, st.only);
                }
            } catch (e) { Zotero.debug("[Weavero] bookmarks pane: apply err: " + e); }
        }
        this._wvBmpRender(win);
    }

    /** `colPane`'s pane and splitter, right above its tree; a pane another instance built is
     *  replaced. Returns the pane, null when the column has no tree. */
    _wvBmpEnsure(win: any, colPane: any): any {
        const doc = win.document;
        const tb = this._wvBmpTreeBox(colPane);
        if (!tb) return null;
        const tag = this._wvWireTag();
        let pane: any = colPane.querySelector(":scope > .wv-bmpane");
        let sp: any = colPane.querySelector(":scope > .wv-bmpane-splitter");
        if (pane && pane.getAttribute("data-wv-tag") !== tag) {
            try { pane.remove(); } catch (e) {}
            try { if (sp) sp.remove(); } catch (e) {}
            pane = null; sp = null;
        }
        const sfx = String(colPane.id || "").slice(BMP_COLL_PANE.length);
        if (!pane) {
            pane = this._wvBmpBuild(win, sfx);
            pane.setAttribute("data-wv-tag", tag);
            if (sp) { try { sp.remove(); } catch (e) {} sp = null; }
        }
        if (!sp) {
            const host = pane;
            sp = doc.createXULElement("splitter");
            sp.id = "wv-bmpane-splitter" + sfx;
            sp.className = "wv-bmpane-splitter";
            sp.setAttribute("orient", "vertical");
            sp.setAttribute("resizebefore", "closest");
            sp.setAttribute("resizeafter", "closest");
            // The splitter captures the mouse: the release of a drag lands on it.
            sp.addEventListener("mouseup", () => {
                try { const p: any = wvLivePlugin(); if (p) p._wvBmpDragged(win, host); } catch (e) {}
            });
        }
        if (tb.previousElementSibling !== sp) colPane.insertBefore(sp, tb);
        if (sp.previousElementSibling !== pane) colPane.insertBefore(pane, sp);
        return pane;
    }

    /** A pane: its header (fold twisty, title, Bookmarks only) and its list. Listeners on its
     *  own elements only, which go with it. */
    _wvBmpBuild(win: any, sfx: string): any {
        const doc = win.document;
        const pane = doc.createXULElement("vbox");
        pane.id = "wv-bmpane" + sfx;
        pane.className = "wv-bmpane";
        const head = wvHtmlEl(doc, "div", "wv-bmp-head", undefined, pane);
        const fold = wvHtmlEl(doc, "span", "wv-bmp-twisty wv-bmp-fold open", undefined, head);
        fold.setAttribute("role", "button");
        wvHtmlEl(doc, "span", "wv-bmp-title", wvStr("weavero-bm-title"), head);
        const only = wvHtmlEl(doc, "button", "wv-bmp-only", undefined, head);
        only.setAttribute("type", "button");
        only.setAttribute("aria-pressed", "false");
        only.addEventListener("click", (e: any) => {
            try {
                e.stopPropagation();
                const p: any = wvLivePlugin();
                if (p) p._wvBmpSetOnly(win, !p._wvBmpState(win).only);
            } catch (err) {}
        });
        head.addEventListener("click", (e: any) => {
            try {
                if (e.button !== 0) return;
                const p: any = wvLivePlugin();
                if (p) p._wvBmpSetFolded(win, !p._wvBmpState(win).folded);
            } catch (err) {}
        });
        head.addEventListener("contextmenu", (e: any) => {
            try {
                e.preventDefault(); e.stopPropagation();
                const p: any = wvLivePlugin();
                if (p) p._bmEmptyContextMenu(win, e.screenX, e.screenY);
            } catch (err) {}
        });
        // "Now showing" (Bookmarks only): what the centre shows, the tree being hidden. A click
        // gives the column its tree back with that row in view; its + bookmarks it.
        const now = wvHtmlEl(doc, "div", "wv-bmp-now", undefined, pane);
        now.addEventListener("click", (e: any) => {
            try {
                if (e.button !== 0) return;
                const p: any = wvLivePlugin();
                if (p) p._wvBmpNowClick(win, now);
            } catch (err) {}
        });
        wvHtmlEl(doc, "div", "wv-bmp-tools", undefined, pane);
        const list = wvHtmlEl(doc, "div", "wv-bmp-list", undefined, pane);
        // One listener per kind on the list; the row from the event's target.
        const rowOf = (e: any) => { try { return e.target && e.target.closest ? e.target.closest(".wv-bmp-row") : null; } catch (err) { return null; } };
        list.addEventListener("click", (e: any) => {
            try { const p: any = wvLivePlugin(); if (p && e.button === 0) p._wvBmpRowClick(win, rowOf(e), e); } catch (err) {}
        });
        // The middle button: a tab in the background (open-where.ts), as in the dropdown; its
        // press starts no autoscroll.
        list.addEventListener("mousedown", (e: any) => { if (e.button === 1) e.preventDefault(); });
        list.addEventListener("auxclick", (e: any) => {
            try {
                if (e.button !== 1) return;
                const row = rowOf(e);
                if (!row || row.classList.contains("wv-bmp-folder")) return;
                e.preventDefault(); e.stopPropagation();
                const p: any = wvLivePlugin();
                if (p) p._wvBmpRowClick(win, row, e);
            } catch (err) {}
        });
        list.addEventListener("contextmenu", (e: any) => {
            try {
                e.preventDefault(); e.stopPropagation();
                const p: any = wvLivePlugin();
                if (!p) return;
                try { p._wvReaderHideBmHoverCard(doc); } catch (err) {}
                const row = rowOf(e);
                const bm = row ? p._wvBmpEntryOf(row) : null;
                if (!bm) p._bmEmptyContextMenu(win, e.screenX, e.screenY);
                else if (bm.type === "folder") p._bmFolderContextMenu(win, bm, e.screenX, e.screenY);
                else p._bmRowContextMenu(win, bm, e.screenX, e.screenY);
            } catch (err) {}
        });
        list.addEventListener("dragstart", (e: any) => {
            try {
                const row = rowOf(e);
                const id = row && row.getAttribute("data-wv-bm-id");
                if (!id) return;
                e.dataTransfer.setData(BMP_DRAG, id);
                e.dataTransfer.setData("text/plain", id);
                e.dataTransfer.effectAllowed = "move";
                WV_BMP_DRAG.set(win, id);
                row.classList.add("wv-bmp-dragging");
                const p: any = wvLivePlugin();
                if (p) { try { p._wvReaderHideBmHoverCard(doc); } catch (err) {} }
            } catch (err) {}
        });
        list.addEventListener("dragend", () => {
            WV_BMP_DRAG.delete(win);
            try { for (const r of list.querySelectorAll(".wv-bmp-dragging")) r.classList.remove("wv-bmp-dragging"); } catch (err) {}
            try { const p: any = wvLivePlugin(); if (p) p._wvBmpClearDrop(list); } catch (err) {}
        });
        list.addEventListener("dragover", (e: any) => {
            try { const p: any = wvLivePlugin(); if (p) p._wvBmpDragOver(rowOf(e), e, list); } catch (err) {}
        });
        list.addEventListener("dragleave", (e: any) => {
            try {
                if (e.relatedTarget && list.contains(e.relatedTarget)) return;
                const p: any = wvLivePlugin();
                if (p) p._wvBmpClearDrop(list);
            } catch (err) {}
        });
        list.addEventListener("drop", (e: any) => {
            try { const p: any = wvLivePlugin(); if (p) p._wvBmpDrop(rowOf(e), e, list); } catch (err) {}
        });
        return pane;
    }

    /** The "Bookmarks only" glyph: arrows apart (take the column), together once on (give the
     *  tree its room back). */
    _wvBmpOnlyGlyph(doc: any, btn: any, on: boolean) {
        const want = on ? "in" : "out";
        if (btn.getAttribute("data-wv-glyph") === want) return;
        btn.setAttribute("data-wv-glyph", want);
        while (btn.firstChild) btn.firstChild.remove();
        const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none" }, btn);
        const d = on ? "M4.5 2.5L8 6l3.5-3.5M4.5 13.5L8 10l3.5 3.5M2.5 8h11" : "M4.5 6L8 2.5 11.5 6M4.5 10L8 13.5 11.5 10M2.5 8h11";
        wvSvgEl(doc, "path", { d, stroke: "currentColor", "stroke-width": "1.25", "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    }

    // ---- rows ----

    /** Redraw every pane of `win` (`force`: even when the store and the open folders are the
     *  same -- a target deleted, a library loaded). */
    _wvBmpRender(win: any, force?: boolean, forceTools?: boolean) {
        try {
            if (!win || win.closed || !this._wvBmpOn()) return;
            const doc = win.document;
            // The tools' and the side popup's sheet is the dropdown's (bookmarks.ts
            // BM_POPUP_CSS); its toolbar button takes it away when it goes (auto-hide).
            if (!doc.getElementById(BM_STYLE_ID)) this._bmEnsurePopupStyles(doc);
            const st = this._wvBmpState(win);
            const fs = this._wvBmpFs(win);
            let dark = false;
            try { dark = !!this._bmIsDark(win); } catch (e) {}
            const sortMode = this._wvReaderBmSortMode("library");
            const sortDir = this._wvReaderBmSortDir("library");
            const chips = (() => {
                try { return fs.chips ? JSON.stringify(Object.keys(fs.chips).sort().map((k) => [k, Array.from(fs.chips[k] || []).sort()])) : ""; }
                catch (e) { return String(Math.random()); }
            })();
            const nodes = this._bmRootArray();
            const sig = JSON.stringify(nodes) + "|" + st.open.slice().sort().join(",") + "|" + (dark ? "d" : "l")
                + "|" + sortMode + sortDir + "|" + fs.text + "|" + chips;
            for (const colPane of wvViewEls(doc, BMP_COLL_PANE)) {
                const pane = colPane.querySelector(":scope > .wv-bmpane");
                if (!pane) continue;
                // The tools (bookmarks.ts _bmRenderTools, the dropdown's), redrawn when what
                // they show changes -- not while typing in the search, which keeps its caret.
                const tools = pane.querySelector(":scope > .wv-bmp-tools");
                if (tools) {
                    const sf = this._wvBmpSurface(win, pane);
                    const tsig = sortMode + sortDir + "|" + (fs.searchOpen ? 1 : 0) + "|" + (this._bmChipsOnOf(fs) ? 1 : 0)
                        + "|" + (this._bmChipOpen(sf) ? 1 : 0) + "|" + (dark ? "d" : "l");
                    if (forceTools || WV_BMP_TSIG.get(tools) !== tsig) {
                        WV_BMP_TSIG.set(tools, tsig);
                        while (tools.firstChild) tools.firstChild.remove();
                        this._bmRenderTools(doc, win, sf, tools);
                    }
                }
                const list = pane.querySelector(":scope > .wv-bmp-list");
                if (!list) continue;
                if (!force && WV_BMP_SIG.get(list) === sig) continue;
                WV_BMP_SIG.set(list, sig);
                const scroll = list.scrollTop;
                try { this._wvReaderHideBmHoverCard(doc); } catch (e) {}
                while (list.firstChild) list.firstChild.remove();
                // What the list shows: the dropdown's view (bookmarks.ts _bmListView) --
                // the tree in the display sort, or the bookmarks a search or chips match.
                const v = this._bmListView(fs);
                if (v.kind === "empty") {
                    wvHtmlEl(doc, "div", "wv-bmp-empty", wvStr("weavero-bm-empty-library"), list);
                    continue;
                }
                if (v.kind === "none") {
                    wvHtmlEl(doc, "div", "wv-bmp-empty wv-bmp-none", v.message, list);
                    continue;
                }
                if (v.kind === "flat") {
                    for (const bm of v.nodes) this._wvBmpRow(doc, win, list, bm, 0, false);
                }
                else {
                    // The tree: folders open in place (a sorted view has none left).
                    const open = new Set(st.open);
                    const walk = (arr: any[], level: number) => {
                        for (const bm of arr || []) {
                            if (!bm) continue;
                            const isOpen = bm.type === "folder" && open.has(bm.id);
                            this._wvBmpRow(doc, win, list, bm, level, isOpen);
                            if (isOpen) walk(bm.children || [], level + 1);
                        }
                    };
                    walk(v.nodes, 0);
                }
                list.scrollTop = scroll;
            }
            this._wvBmpMark(win);
        } catch (e) { Zotero.debug("[Weavero] _wvBmpRender err: " + e); }
    }

    /** The window's tools filter state (one object per window, mutated in place). */
    _wvBmpFs(win: any): { text: string; searchOpen: boolean; chips: any } {
        let fs = WV_BMP_FS.get(win);
        if (!fs) { fs = { text: "", searchOpen: false, chips: null }; WV_BMP_FS.set(win, fs); }
        return fs;
    }

    /** A pane as a surface of the dropdown's tools (bookmarks.ts WvBmSurface): its window's
     *  filter state, its window's panes redrawn, the side popup beside the column and
     *  dismissed by a click outside (the dropdown's goes with the dropdown). */
    _wvBmpSurface(win: any, pane: any): WvBmSurface {
        const fs = this._wvBmpFs(win);
        return {
            kind: "pane",
            win,
            fs,
            render: () => { const p: any = wvLivePlugin(); if (p) p._wvBmpRender(win, false, true); },
            refresh: () => { const p: any = wvLivePlugin(); if (p) p._wvBmpRender(win); },
            side: () => pane,
            funnel: () => pane.querySelector(":scope > .wv-bmp-tools .wv-bm-iconbtn:has(.wv-bm-funnel-chev)"),
            onChipOpen: (panel: any, btn: any) => {
                wvOutsideClick({
                    panel, owner: this,
                    isOpen: () => { try { return panel.isConnected && (panel.state === "open" || panel.state === "showing"); } catch (e) { return false; } },
                    // The funnel as drawn NOW: a chip toggled redraws the tools.
                    keep: () => [btn, pane.querySelector(":scope > .wv-bmp-tools .wv-bm-iconbtn:has(.wv-bm-funnel-chev)")],
                    onOutside: () => {
                        const p: any = wvLivePlugin();
                        if (!p) return;
                        p._bmCloseLibChipPopup(win, "pane");
                        p._wvBmpRender(win, false, true);
                    },
                });
            },
        };
    }

    /** One row: a folder (twisty, the dropdown's folder icon and name) or a bookmark (the
     *  dropdown's icon, label, tooltip and missing mark: bookmarks.ts _bmRowParts). */
    _wvBmpRow(doc: any, win: any, list: any, bm: any, level: number, isOpen: boolean) {
        const isFolder = bm.type === "folder";
        const row = wvHtmlEl(doc, "div", "wv-bmp-row" + (isFolder ? " wv-bmp-folder" : ""));
        row.setAttribute("data-wv-bm-id", String(bm.id));
        row.setAttribute("data-wv-level", String(level));
        row.setAttribute("draggable", "true");
        row.style.setProperty("--wv-bmp-level", String(level));
        if (isFolder) {
            wvHtmlEl(doc, "span", "wv-bmp-twisty" + (isOpen ? " open" : ""), undefined, row);
            row.setAttribute("aria-expanded", isOpen ? "true" : "false");
            const parts = this._bmFolderParts(doc, bm);
            parts.icon.classList.add("wv-bmp-icon");
            row.appendChild(parts.icon);
            row.appendChild(parts.label);
        }
        else {
            wvHtmlEl(doc, "span", "wv-bmp-spacer", undefined, row);
            const parts = this._bmRowParts(doc, win, bm);
            parts.icon.classList.add("wv-bmp-icon");
            row.appendChild(parts.icon);
            row.appendChild(parts.label);
            if (parts.badge) row.appendChild(parts.badge);
            if (parts.missing) row.classList.add("wv-bmp-missing");
            // The rich hover card, as in the dropdown (it floats beside the row in a panel
            // of its own: reader-panels.ts _wvReaderShowBmHoverCard).
            row.addEventListener("mouseenter", () => {
                try { if (this._wvBmHoverHideTimer) { win.clearTimeout(this._wvBmHoverHideTimer); this._wvBmHoverHideTimer = null; } } catch (e) {}
                try { if (this._wvBmHoverTimer) win.clearTimeout(this._wvBmHoverTimer); } catch (e) {}
                this._wvBmHoverTimer = win.setTimeout(() => {
                    this._wvBmHoverTimer = null;
                    try { const p: any = wvLivePlugin(); if (p && row.isConnected && !WV_BMP_DRAG.has(win)) p._wvReaderShowBmHoverCard(null, doc, row, bm); } catch (e) {}
                }, 450);
            });
            row.addEventListener("mouseleave", () => {
                try { if (this._wvBmHoverTimer) { win.clearTimeout(this._wvBmHoverTimer); this._wvBmHoverTimer = null; } } catch (e) {}
                try { const p: any = wvLivePlugin(); if (p) p._wvReaderScheduleHideBmHoverCard(doc); } catch (e) {}
            });
        }
        list.appendChild(row);
        return row;
    }

    /** The store's entry a row stands for (the live one: a row can outlive a move). */
    _wvBmpEntryOf(row: any): any {
        try {
            const id = row && row.getAttribute("data-wv-bm-id");
            const loc = id ? this._bmLocate(id) : null;
            return loc ? loc.entry : null;
        } catch (e) { return null; }
    }

    /** A click on a row: a folder opens or closes in place; a bookmark goes where the
     *  dropdown's click goes, in this window; an orphan flashes. */
    _wvBmpRowClick(win: any, row: any, e: any) {
        try {
            if (!row) return;
            const bm = this._wvBmpEntryOf(row);
            if (!bm) return;
            if (bm.type === "folder") { this._wvBmpSetFolderOpen(win, bm.id); return; }
            if (row.classList.contains("wv-bmp-missing")) { this._bmFlashMissingRow(row, "wv-bmp-flash"); return; }
            try { this._wvReaderHideBmHoverCard(win.document); } catch (err) {}
            this._bmActivateBookmark(bm, e, win);
        } catch (err) { Zotero.debug("[Weavero] bookmarks pane: click err: " + err); }
    }

    /** The end of a splitter drag: the pane's height is the window's. */
    _wvBmpDragged(win: any, pane: any) {
        try {
            const st = this._wvBmpState(win);
            if (st.only || st.folded || !pane || !pane.isConnected) return;
            const h = Math.round(pane.getBoundingClientRect().height);
            if (!(h >= BMP_MIN_H) || h === (st.h || BMP_DEFAULT_H)) return;
            st.h = h;
            this._wvBmpSetState(win, st);
        } catch (e) {}
    }

    // ---- what the centre shows (MJT 2026-11-27, "Highlight + top line") ----

    /** The collections-tree row the items list of `colPane`'s library view shows:
     *  getCollectionTreeRows()[0] (the singular getter throws on Zotero 11 betas), the view's
     *  own on a Zotero with library tabs; else the tree's focused row. */
    _wvBmpShownRow(win: any, colPane: any): any {
        try {
            const view = colPane && colPane.closest ? colPane.closest("library-view") : null;
            const host = (view && typeof view.getCollectionTreeRows === "function") ? view : (win && win.ZoteroPane);
            const rows = host && typeof host.getCollectionTreeRows === "function" ? host.getCollectionTreeRows() : null;
            if (rows && rows[0]) return rows[0];
        } catch (e) {}
        try { const cv = this._wvBmpTreeOf(win, colPane); return cv ? cv.getRow(cv.selection.focused) || null : null; }
        catch (e) { return null; }
    }

    /** Bookmark `bm` points at tree row `row` (a collection, a library / group / feed, a row of
     *  its own: a saved search, Unfiled, Duplicates, the Feeds row...). */
    _wvBmpPointsAt(bm: any, row: any): boolean {
        try {
            if (!bm || !row) return false;
            if (bm.type === "collection") return row.isCollection() && row.ref.libraryID === bm.libraryID && row.ref.key === bm.collectionKey;
            if (bm.type === "library") return !!this._bmTreeRowIsLibrary(row) && !!row.ref && row.ref.libraryID === bm.libraryID;
            if (bm.type === "treerow") return String(row.id) === String(bm.rowID);
        } catch (e) {}
        return false;
    }

    /** Every pane of `win`: the rows pointing at what its view shows take Zotero's selected-row
     *  look (each of them, a target bookmarked twice too), a CLOSED folder holding one a dot;
     *  and, in Bookmarks only, the "Now showing" line. Classes only, no redraw: it runs on
     *  every selection change of the trees (_wvBmpWatchTrees). */
    _wvBmpMark(win: any) {
        try {
            if (!win || win.closed || !this._wvBmpOn()) return;
            const doc = win.document;
            for (const colPane of wvViewEls(doc, BMP_COLL_PANE)) {
                const pane = colPane.querySelector(":scope > .wv-bmpane");
                if (!pane) continue;
                const shown = this._wvBmpShownRow(win, colPane);
                for (const r of Array.from(pane.querySelectorAll(":scope > .wv-bmp-list > .wv-bmp-row")) as any[]) {
                    const bm = this._wvBmpEntryOf(r);
                    let cur = false, holds = false;
                    if (bm && shown) {
                        if (bm.type === "folder") holds = r.getAttribute("aria-expanded") !== "true" && this._bmFlatten(bm.children || []).some((c: any) => this._wvBmpPointsAt(c, shown));
                        else cur = this._wvBmpPointsAt(bm, shown);
                    }
                    if (r.classList.contains("wv-bmp-current") !== cur) r.classList.toggle("wv-bmp-current", cur);
                    let dot = r.querySelector(":scope > .wv-bmp-holds");
                    if (holds && !dot) {
                        dot = wvHtmlEl(doc, "span", "wv-bmp-holds", undefined, r);
                        dot.setAttribute("title", wvStr("weavero-bmpane-folder-current"));
                    }
                    else if (!holds && dot) dot.remove();
                }
                this._wvBmpNowLine(win, pane, shown);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvBmpMark err: " + e); }
    }

    /** What the "Now showing" line says of tree row `row`: its icon (the one its bookmark would
     *  have), its name (a sub-collection's path, Parent › Child), its library, and whether a
     *  bookmark points at it. Null for a row no bookmark can point at. */
    _wvBmpDescribe(win: any, row: any): { key: string; name: string; lib: string; icon: string; bookmarked: boolean } | null {
        try {
            const bm = this._wvBmpRecordFor(row);
            if (!bm) return null;
            let name = String(typeof row.getName === "function" ? row.getName() : "");
            if (row.isCollection()) {
                const names = [String(row.ref.name)];
                let p: any = row.ref.parentID ? Zotero.Collections.get(row.ref.parentID) : null, g = 0;
                while (p && g++ < 64) { names.unshift(String(p.name)); p = p.parentID ? Zotero.Collections.get(p.parentID) : null; }
                name = names.join(" › ");
            }
            let lib = "";
            if (bm.type !== "library" && row.ref && row.ref.libraryID > 0) {
                try { lib = String(Zotero.Libraries.get(row.ref.libraryID).name || ""); } catch (e) {}
            }
            const icon = this._bmIconInfo(bm, win).image;
            const bookmarked = this._bmFlatten().some((b: any) => this._wvBmpPointsAt(b, row));
            return { key: String(row.id), name, lib, icon, bookmarked };
        } catch (e) { return null; }
    }

    /** The record a bookmark of tree row `row` holds (bookmarks.ts _bmBookmarkTreeRow makes it). */
    _wvBmpRecordFor(row: any): any {
        try {
            if (!row || !row.id) return null;
            if (row.isCollection()) return { type: "collection", libraryID: row.ref.libraryID, collectionKey: row.ref.key };
            if (this._bmTreeRowIsLibrary(row)) return { type: "library", libraryID: row.ref.libraryID };
            if (this._bmTreeRowIsSpecial(row) || (typeof row.isFeeds === "function" && row.isFeeds())) {
                return { type: "treerow", rowID: String(row.id), libraryID: row.ref ? row.ref.libraryID : null };
            }
        } catch (e) {}
        return null;
    }

    /** `pane`'s "Now showing" line (shown in Bookmarks only, by the sheet): `shown`'s icon,
     *  name and library ("— in My Library", the rows' suffix), its + while no bookmark points
     *  at it. Rebuilt only when what it says changes. */
    _wvBmpNowLine(win: any, pane: any, shown: any) {
        const line = pane.querySelector(":scope > .wv-bmp-now");
        if (!line) return;
        const doc = win.document;
        const d = shown ? this._wvBmpDescribe(win, shown) : null;
        let dark = false;
        try { dark = !!this._bmIsDark(win); } catch (e) {}
        const key = d ? [d.key, d.name, d.lib, d.bookmarked ? 1 : 0, dark ? "d" : "l"].join("|") : "";
        if (line.getAttribute("data-wv-key") === key && line.hasAttribute("data-wv-shown")) return;
        line.setAttribute("data-wv-key", key);
        line.setAttribute("data-wv-shown", d ? "true" : "false");
        while (line.firstChild) line.firstChild.remove();
        if (!d) { line.removeAttribute("title"); line.removeAttribute("data-wv-row"); return; }
        line.setAttribute("data-wv-row", d.key);
        line.setAttribute("title", wvStr("weavero-bmpane-now-tip", { name: d.name }));
        const icon = wvHtmlEl(doc, "img", "wv-bmp-icon", undefined, line);
        icon.setAttribute("src", d.icon);
        icon.setAttribute("width", "16");
        icon.setAttribute("height", "16");
        const name = wvHtmlEl(doc, "span", "wv-bmp-now-name", d.name, line);
        if (d.lib) wvHtmlEl(doc, "span", "wv-bm-sublabel", wvStr("weavero-bm-sublabel-in", { title: d.lib }), name);
        const add = wvHtmlEl(doc, "button", "wv-bmp-now-add", undefined, line);
        add.setAttribute("type", "button");
        add.setAttribute("title", wvStr("weavero-bmpane-now-add"));
        add.setAttribute("aria-label", wvStr("weavero-bmpane-now-add"));
        add.hidden = d.bookmarked;
        // The dropdown's "+" (bookmarks.ts BM_MENU_ADD_ICON's drawing).
        const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 16, height: 16 }, add);
        wvSvgEl(doc, "path", { d: "M7 7V2h2v5h5v2H9v5H7V9H2V7z", fill: "currentColor" }, svg);
        add.addEventListener("click", (e: any) => {
            try {
                e.stopPropagation();
                const p: any = wvLivePlugin();
                if (p) p._wvBmpNowAdd(win, line);
            } catch (err) {}
        });
    }

    /** A click on the "Now showing" line: Bookmarks only off, the tree back with that row in
     *  view (placed as a bookmark's click places it, _bmPlaceCollectionRow). */
    _wvBmpNowClick(win: any, line: any) {
        try {
            const id = line.getAttribute("data-wv-row");
            this._wvBmpSetOnly(win, false);
            if (!id) return;
            const zp = win.ZoteroPane;
            win.requestAnimationFrame(() => {
                try { const p: any = wvLivePlugin(); if (p) p._bmPlaceCollectionRow(zp, id); } catch (e) {}
            });
        } catch (e) { Zotero.debug("[Weavero] bookmarks pane: now-line click err: " + e); }
    }

    /** The "Now showing" line's +: what the line names bookmarked (bookmarks.ts
     *  _bmBookmarkTreeRow, the collections menu's Bookmark Collection path). */
    async _wvBmpNowAdd(win: any, line: any) {
        try {
            const pane = line.closest ? line.closest(".wv-bmpane") : null;
            const row = pane ? this._wvBmpShownRow(win, pane.parentNode) : null;
            if (!row || String(row.id) !== line.getAttribute("data-wv-row")) return false;
            return await this._bmBookmarkTreeRow(row);
        } catch (e) { Zotero.debug("[Weavero] bookmarks pane: now-line add err: " + e); return false; }
    }

    /** Each collections tree of `win` tells the panes when its selection changes (Zotero's own
     *  select binding, libraryTree.js createEventBinding): the marks follow. Given back by
     *  _wvBmpUnwatchTrees. */
    _wvBmpWatchTrees(win: any) {
        try {
            for (const colPane of wvViewEls(win.document, BMP_COLL_PANE)) {
                const cv = this._wvBmpTreeOf(win, colPane);
                if (!cv || WV_BMP_SEL.has(cv) || !cv.onSelect || typeof cv.onSelect.addListener !== "function") continue;
                const fn = () => { try { const p: any = wvLivePlugin(); if (p) p._wvBmpMark(win); } catch (e) {} };
                cv.onSelect.addListener(fn);
                WV_BMP_SEL.set(cv, fn);
            }
        } catch (e) {}
    }

    _wvBmpUnwatchTrees(win: any) {
        try {
            const trees: any[] = [];
            try { if (win.ZoteroPane && win.ZoteroPane.collectionsView) trees.push(win.ZoteroPane.collectionsView); } catch (e) {}
            try { for (const v of (win.ZoteroPane && win.ZoteroPane.libraryViews) || []) if (v && v.collectionsView) trees.push(v.collectionsView); } catch (e) {}
            for (const cv of trees) {
                const fn = WV_BMP_SEL.get(cv);
                if (!fn) continue;
                try { cv.onSelect.removeListener(fn); } catch (e) {}
                WV_BMP_SEL.delete(cv);
            }
        } catch (e) {}
    }

    // ---- drag and drop ----

    _wvBmpClearDrop(list: any) {
        try {
            if (!list) return;
            list.classList.remove("wv-bmp-drop-on");
            for (const r of list.querySelectorAll(".wv-bmp-drop-before, .wv-bmp-drop-after, .wv-bmp-drop-on")) {
                r.classList.remove("wv-bmp-drop-before", "wv-bmp-drop-after", "wv-bmp-drop-on");
            }
        } catch (e) {}
    }

    _wvBmpTypes(dt: any): string[] {
        try { return Array.from((dt && dt.types) || []).map(String); } catch (e) { return []; }
    }

    /** Where on `row` a bookmark drag lands: before / after it, or into a folder (its
     *  middle half), as the dropdown's rows (bookmarks.ts _bmAttachDragHandlers). */
    _wvBmpDropMode(row: any, e: any): string {
        try {
            const r = row.getBoundingClientRect();
            const y = e.clientY - r.top;
            if (row.classList.contains("wv-bmp-folder")) {
                if (y < r.height * 0.25) return "before";
                if (y > r.height * 0.75) return "after";
                return "into";
            }
            return y > r.height / 2 ? "after" : "before";
        } catch (e2) { return "after"; }
    }

    /** The collection a row's bookmark points to, when it is one that exists. */
    _wvBmpCollectionOf(row: any): any {
        try {
            const bm = row ? this._wvBmpEntryOf(row) : null;
            if (!bm || bm.type !== "collection") return null;
            return Zotero.Collections.getByLibraryAndKey(bm.libraryID, bm.collectionKey) || null;
        } catch (e) { return null; }
    }

    /** Zotero's drop effect for items onto a collection row (collectionTree.jsx onDragOver):
     *  none into the collection they come from, a copy from anything but a collection or from
     *  another library, a move with Shift (Cmd on macOS), never a move of a selection spanning
     *  libraries. */
    _wvBmpItemEffect(e: any, treeRow: any): string {
        try {
            const dt = e.dataTransfer;
            const DD: any = Zotero.DragDrop;
            const src = DD && typeof DD.getDragSource === "function" ? DD.getDragSource(dt) : null;
            if (src) {
                if (src.id === treeRow.id) return "none";
                if (!src.isCollection()) return "copy";
                if (src.ref.libraryID !== treeRow.ref.libraryID) return "copy";
            }
            const move = Zotero.isMac ? !!e.metaKey : !!e.shiftKey;
            const data = DD.getDataFromDataTransfer(dt);
            const items = Zotero.Items.get((data && data.data) || []);
            if (new Set(items.map((i: any) => i.libraryID)).size > 1) return move ? "none" : "copy";
            return move ? "move" : "copy";
        } catch (err) { return "copy"; }
    }

    /** Whether the dragged items can go into `col`: Zotero's own check where it has one that
     *  takes a row outside the tree (canDropOnTreeRow, Zotero 11); on Zotero 10, top-level items
     *  of the collection's own library, the library editable (what the fallback drop adds).
     *  Zotero's check reads `Zotero.DragDrop.currentDragSource.isTrash()` unguarded: items
     *  dragged from the items list carry their row (itemTree onDragStart); a drag without
     *  one throws there and is refused (the catch). */
    _wvBmpCanDropItems(cv: any, treeRow: any, dt: any): boolean {
        try {
            if (cv && typeof cv.canDropOnTreeRow === "function" && typeof cv.dropOnTreeRow === "function") return !!cv.canDropOnTreeRow(treeRow, 0, dt);
            const lib = Zotero.Libraries.get(treeRow.ref.libraryID);
            if (!lib || !lib.editable) return false;
            const data = Zotero.DragDrop.getDataFromDataTransfer(dt);
            const items = Zotero.Items.get((data && data.data) || []);
            return items.length > 0 && items.some((i: any) => i.libraryID === treeRow.ref.libraryID && i.isTopLevelItem() && !treeRow.ref.hasItem(i.id));
        } catch (e) { return false; }
    }

    /** dragover on the list (`row`: the row under the pointer, null on the empty part). True
     *  when the pane takes the drag. */
    _wvBmpDragOver(row: any, e: any, list?: any): boolean {
        try {
            const dt = e.dataTransfer;
            const types = this._wvBmpTypes(dt);
            list = list || (row && row.closest ? row.closest(".wv-bmp-list") : null);
            const win = winOf(row || list) || Zotero.getMainWindow();
            this._wvBmpClearDrop(list);
            // A bookmark of this pane: before / after / into -- in the manual order only, as
            // in the dropdown (a sorted view's places would be a lie).
            if (types.includes(BMP_DRAG)) {
                if (this._wvReaderBmSortMode("library") !== "manual") return false;
                const id = WV_BMP_DRAG.get(win) || "";
                let mode = "end";
                if (row) {
                    if (row.getAttribute("data-wv-bm-id") === id) return false;
                    mode = this._wvBmpDropMode(row, e);
                    const dragged = id ? this._bmLocate(id) : null;
                    const target = this._wvBmpEntryOf(row);
                    if (dragged && target && dragged.entry.type === "folder" && this._bmIsDescendant(target.id, dragged.entry)) return false;
                    row.classList.add(mode === "before" ? "wv-bmp-drop-before" : mode === "after" ? "wv-bmp-drop-after" : "wv-bmp-drop-on");
                }
                else if (list) list.classList.add("wv-bmp-drop-on");
                e.preventDefault();
                try { dt.dropEffect = "move"; } catch (err) {}
                return true;
            }
            // Items over a collection's bookmark: into that collection.
            const col = row ? this._wvBmpCollectionOf(row) : null;
            if (types.includes("zotero/item") && col) {
                const cv = this._wvBmpTreeOf(win, row);
                const treeRow = new Zotero.CollectionTreeRow(cv, "collection", col, 0);
                let effect = this._wvBmpCanDropItems(cv, treeRow, dt) ? this._wvBmpItemEffect(e, treeRow) : "none";
                if (cv && typeof cv.setDropEffect === "function") cv.setDropEffect(e, effect);
                else { try { dt.dropEffect = effect; } catch (err) {} }
                if (effect === "none") return false;
                e.preventDefault();
                row.classList.add("wv-bmp-drop-on");
                return true;
            }
            // Zotero objects: bookmarked, as on the toolbar button -- items only on the empty
            // part (on another bookmark they would look filed into it).
            const bookmarkable = types.includes("zotero/collection") || types.includes("zotero/search") || types.includes("weavero/library")
                || (types.includes("zotero/item") && !row);
            if (bookmarkable) {
                e.preventDefault();
                try { dt.dropEffect = "copy"; } catch (err) {}
                if (list) list.classList.add("wv-bmp-drop-on");
                return true;
            }
            return false;
        } catch (err) { return false; }
    }

    /** drop on the list. Resolves true when the pane took it. */
    async _wvBmpDrop(row: any, e: any, list?: any): Promise<boolean> {
        try {
            const dt = e.dataTransfer;
            const types = this._wvBmpTypes(dt);
            list = list || (row && row.closest ? row.closest(".wv-bmp-list") : null);
            const win = winOf(row || list) || Zotero.getMainWindow();
            this._wvBmpClearDrop(list);
            if (types.includes(BMP_DRAG)) {
                if (this._wvReaderBmSortMode("library") !== "manual") return false;
                e.preventDefault();
                let id = "";
                try { id = dt.getData(BMP_DRAG) || dt.getData("text/plain") || ""; } catch (err) {}
                id = id || WV_BMP_DRAG.get(win) || "";
                WV_BMP_DRAG.delete(win);
                if (!id) return false;
                const targetId = row ? row.getAttribute("data-wv-bm-id") : null;
                if (targetId === id) return false;
                const mode = row ? this._wvBmpDropMode(row, e) : "after";
                await this._bmMove(id, targetId, mode);
                if (mode === "into" && targetId) this._wvBmpSetFolderOpen(win, targetId, true);
                this._wvBmpRender(win);
                return true;
            }
            const col = row ? this._wvBmpCollectionOf(row) : null;
            if (types.includes("zotero/item") && col) {
                const cv = this._wvBmpTreeOf(win, row);
                const treeRow = new Zotero.CollectionTreeRow(cv, "collection", col, 0);
                const effect = this._wvBmpItemEffect(e, treeRow);
                try { Zotero.DragDrop.currentDropEffect = null; } catch (err) {}
                if (effect === "none" || !this._wvBmpCanDropItems(cv, treeRow, dt)) return false;
                e.preventDefault();
                if (cv && typeof cv.dropOnTreeRow === "function") {
                    if (typeof cv.canDropOnTreeRowAsync === "function" && !(await cv.canDropOnTreeRowAsync(treeRow, 0, dt))) return false;
                    await cv.dropOnTreeRow(e, treeRow, effect);
                    return true;
                }
                return await this._wvBmpAddItemsZ10(col, dt, effect);
            }
            const bookmarkable = types.includes("zotero/collection") || types.includes("zotero/search") || types.includes("weavero/library")
                || (types.includes("zotero/item") && !row);
            if (bookmarkable) {
                e.preventDefault();
                // Read now: a drop's data is gone after an await.
                const get = (t: string) => { try { return types.includes(t) ? (dt.getData(t) || "") : ""; } catch (err) { return ""; } };
                await this._bmDropAdd(get("zotero/item"), get("zotero/collection"), get("zotero/search"), get("weavero/library"));
                return true;
            }
            return false;
        } catch (err) { Zotero.debug("[Weavero] bookmarks pane: drop err: " + err); return false; }
    }

    /** Zotero 10 has no drop onto a row outside the tree: the same-library top-level items go
     *  into the collection as its onDrop adds them (a move takes them out of the collection they
     *  were dragged from, in the same transaction). */
    async _wvBmpAddItemsZ10(col: any, dt: any, effect: string): Promise<boolean> {
        const data = Zotero.DragDrop.getDataFromDataTransfer(dt);
        const src: any = Zotero.DragDrop.getDragSource ? Zotero.DragDrop.getDragSource(dt) : null;
        const items = Zotero.Items.get((data && data.data) || []).filter((i: any) => i.libraryID === col.libraryID && i.isTopLevelItem());
        if (!items.length) return false;
        const ids = items.map((i: any) => i.id);
        await Zotero.DB.executeTransaction(async () => {
            const c = await Zotero.Collections.getAsync(col.id);
            await c.addItems(ids);
            if (effect === "move" && src && typeof src.isCollection === "function" && src.isCollection() && src.ref.id !== col.id) await src.ref.removeItems(ids);
        });
        return true;
    }

    // ---- redraws, watches ----

    /** Every window's panes redrawn once for a burst (a store write, a target deleted). */
    _wvBmpRefreshAll(force?: boolean) {
        if (force) this._wvBmpRefreshForce = true;
        if (this._wvBmpRefreshPending) return;
        this._wvBmpRefreshPending = true;
        wvTimeout(() => {
            const p: any = wvLivePlugin();
            if (!p) return;
            p._wvBmpRefreshPending = false;
            const f = !!p._wvBmpRefreshForce;
            p._wvBmpRefreshForce = false;
            for (const w of wvMainWins()) { try { p._wvBmpRender(w, f); } catch (e) {} }
        }, 30);
    }

    /** bookmarks.ts _bmPersist: the store changed. */
    _wvBmpStoreChanged() {
        try { if (this._wvBmpOn()) this._wvBmpRefreshAll(); } catch (e) {}
    }

    /** The settings and Zotero's deletions, watched once per instance (given back in
     *  _wvBmpTeardown). */
    _wvBmpWatch() {
        if (this._wvBmpWatching) return;
        this._wvBmpWatching = true;
        try {
            this._wvBmpPrefObs = [BMP_PREF, "enableVisualExtras", "enableLibraryBookmarks", "enableBookmarks"].map((n) =>
                Zotero.Prefs.registerObserver("weavero." + n, () => {
                    const p: any = wvLivePlugin();
                    if (!p) return;
                    for (const w of wvMainWins()) { try { p._wvBmpWire(w); } catch (e) {} }
                }));
        } catch (e) { this._wvBmpPrefObs = []; }
        try {
            // A target deleted, trashed or restored: its row's missing mark.
            this._wvBmpNotifierID = Zotero.Notifier.registerObserver({
                notify: (event: string, type: string) => {
                    try {
                        const p: any = wvLivePlugin();
                        if (!p || !p._wvBmpOn()) return;
                        if (type === "item" && event === "modify") return;
                        p._wvBmpRefreshAll(true);
                    } catch (e) {}
                },
            }, ["collection", "search", "item", "group", "feed"], "wvBookmarksPane");
        } catch (e) { this._wvBmpNotifierID = null; }
    }

    _wvBmpWatchTheme(win: any) {
        try {
            if (WV_BMP_MQ.has(win) || !win.matchMedia) return;
            const mq = win.matchMedia("(prefers-color-scheme: dark)");
            const fn = () => { try { const p: any = wvLivePlugin(); if (p) p._wvBmpRender(win); } catch (e) {} };
            mq.addEventListener("change", fn);
            WV_BMP_MQ.set(win, { mq, fn });
        } catch (e) {}
    }

    // ---- teardown ----

    /** Everything of the pane out of `win`: panes, splitters, the column's mode, the sheet,
     *  the theme watch. The window's state stays (a string on the window). */
    _wvBmpRemoveWin(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            try { this._wvReaderHideBmHoverCard(doc); } catch (e) {}
            for (const el of Array.from(doc.querySelectorAll(".wv-bmpane, .wv-bmpane-splitter")) as any[]) { try { el.remove(); } catch (e) {} }
            for (const colPane of wvViewEls(doc, BMP_COLL_PANE)) {
                try {
                    if (colPane.getAttribute("data-wv-bmp-mode") === "only") {
                        const cv = this._wvBmpTreeOf(win, colPane);
                        try { win.requestAnimationFrame(() => { try { if (cv && cv.tree) cv.tree.invalidate(); } catch (e) {} }); } catch (e) {}
                    }
                    colPane.removeAttribute("data-wv-bmp-mode");
                } catch (e) {}
            }
            // A column the view list no longer reaches (a closed library tab's, an older build's).
            for (const el of Array.from(doc.querySelectorAll("[data-wv-bmp-mode]")) as any[]) { try { el.removeAttribute("data-wv-bmp-mode"); } catch (e) {} }
            wvRemoveStyle(doc, BMP_STYLE_ID);
            // The funnel's side popup, if the pane's; the dropdown's sheet, unless the
            // dropdown is open (it puts it back at every opening).
            try { this._bmCloseLibChipPopup(win, "pane"); } catch (e) {}
            if (!doc.getElementById("wv-bookmarks-popup")) wvRemoveStyle(doc, BM_STYLE_ID);
            this._wvBmpUnwatchTrees(win);
            const h = WV_BMP_MQ.get(win);
            if (h) { try { h.mq.removeEventListener("change", h.fn); } catch (e) {} WV_BMP_MQ.delete(win); }
            WV_BMP_DRAG.delete(win);
            WV_BMP_FS.delete(win);
        } catch (e) { Zotero.debug("[Weavero] _wvBmpRemoveWin err: " + e); }
    }

    /** destroy(): every window's panes out, the watches given back. */
    _wvBmpTeardown() {
        try {
            for (const id of (this._wvBmpPrefObs || [])) { try { Zotero.Prefs.unregisterObserver(id); } catch (e) {} }
            this._wvBmpPrefObs = [];
            if (this._wvBmpNotifierID) { try { Zotero.Notifier.unregisterObserver(this._wvBmpNotifierID); } catch (e) {} }
            this._wvBmpNotifierID = null;
            this._wvBmpWatching = false;
            this._wvBmpPreloaded = false;
            for (const w of wvMainWins()) this._wvBmpRemoveWin(w);
        } catch (e) { Zotero.debug("[Weavero] _wvBmpTeardown err: " + e); }
    }
}

const _bmpDescriptors = Object.getOwnPropertyDescriptors(_BookmarksPaneMixin.prototype);
delete (_bmpDescriptors as any).constructor;
export const bookmarksPaneMethods = _bmpDescriptors;
