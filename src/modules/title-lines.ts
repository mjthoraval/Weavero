// Multi-line titles in the items list (MJT 2026-11-05, forum 97645): "first the
// 2 lines fixed height, like in the old Mendeley Desktop. Then also fixed heights
// with a configurable number of rows. Then adaptative number of rows with a
// maximum." Settings -> Extras -> Items list & tabs; Zotero's one-line list stays
// the default.
//
// FIXED keeps Zotero's list exactly as it is, only taller: every row the same
// height, from VirtualizedTable._getRowHeight wrapped on this window's tree
// (linesPerRow's own formula, which the items tree leaves at 1), and the title
// clamped by CSS.
//
// EVERY TEXT COLUMN wraps inside the row, and the row reads from its top (MJT
// 2026-11-06: "The wrapping was nicely implemented in Mendeley Desktop [...] There,
// all the columns wrap. There was top alignement."). Icon and count cells keep their
// layout: .wv-count-cell holds Weavero's chips, and .numNotes is 26 px wide, where a
// wrap breaks 12 into two digits. .fixed-width is the row's whole height with its icon
// centred inside, so the row's alignment does not reach the icon. One line tall (1lh),
// the same centring puts it on the first line of text, whatever its size. An icon
// pushed to the top sits high instead: 14 px on a 17 px line, 1.67 px off, seen by MJT.
// Fixed clamps every column to the same number. In adaptive the
// title alone sets the height, measuring every column would multiply the cost, so
// the others take the lines their row has, through --wv-tl-lines on the row.
//
// CHILD ROWS stay on Zotero's one line in both modes (MJT 2026-11-06, on a "Full
// Text" row two lines tall: "Child rows do not need multi-row"). The sheet wraps
// aria-level 1 only. Adaptive gives them no height. Fixed's base row is tall, so
// there the child rows are the ones with a height of their own: a few pairs, none
// in a flat list, which stays at Zotero's speed. The same updateCustomRowHeights,
// and WindowedList's own row lookups are right for a row SHORTER than the base.
//
// ADAPTIVE gives each row its own height through updateCustomRowHeights, Zotero's
// mechanism for the collection tree's separators, which keeps WindowedList's
// positions exact. The whole list needs a height for the scrollbar and the rows
// below, so: rows on screen are measured at once, the rest start from an estimate
// by title length and are measured in short slices. Lines are cached by text and
// width, never by row number, so a sort or a filter only remaps them (Expand Item
// Tree keys its cache by row index, and its heights land on the wrong rows).
// That hidden measure assumes the width of the row's level. A row on screen then
// says what it really took, from its own title box, which keeps its height whatever
// the row's: a tag swatch or a plugin's glyph narrows a title, an italic word changes
// it (a swatch took 22 of 192 px, seen live 2026-11-06).
//
// Either way the rows stay absolutely positioned by WindowedList. Do NOT take the
// shortcut other plugins take, `position: relative; top: unset` on .row: rows then
// show in DOM order, the list appends on a scroll (windowed-list.js render), and the
// order scrambles (Better Viewer, 48 of 49 rows out of place, measured 2026-11-05).
//
// The traps of updateCustomRowHeights, read in the mirror and locked by the spec:
// WindowedList.update sets the list's height from the OLD offsets, then rebuilds
// them, so it takes a second update; it does not repaint, so invalidate; and
// updateFontSize hands the list the items tree's empty prop, so the heights are
// redone after it.
//
// Private Zotero members: _getRowHeight, updateFontSize, invalidateRow,
// updateCustomRowHeights, _onJumpSelect, _renderedTextHeight, _customRowHeightMap,
// and on _jsWindow getFirstVisibleRow, getLastVisibleRow, getWindowHeight,
// _getItemPosition, _binarySearchOffsets, _rowOffsets, itemHeight, _renderedRows,
// innerElem, update, invalidate, scrollTo. Tripwire: test/title-lines.spec.js.

import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvUnwrap, wvWrap } from "../lib/wrap";
import { wvLibraryViews } from "../lib/windows";

declare const Zotero: any;

const STYLE_ID = "wv-title-lines-style";
const LAYER = "titleLines";
const ROW = "#zotero-items-tree .virtualized-table .row[aria-level='1']:not(.library-header-row):not(.spacer-row)";
const TEXT_CELL = ROW + " .cell:not(.title):not(.fixed-width):not(.wv-count-cell):not(.numNotes)";
const HEADER_TITLE = "#zotero-items-tree .virtualized-table-header .cell.title";

/** The Title column's header of THIS state's tree. The tree element has ItemTree's
 *  own id ("item-tree-main-default" up to 11.0-beta.3, "item-tree-main" plus the
 *  library tab's suffix with zotero#6035); a document-wide lookup found the
 *  window's first tab's header. */
function headerTitle(st: { win: any; iv: any }): any {
    try {
        const doc = st.win.document;
        const el = st.iv && st.iv.id && doc.getElementById(st.iv.id);
        if (el) return el.querySelector(".virtualized-table-header .cell.title");
        return doc.querySelector(HEADER_TITLE);
    }
    catch (e) { return null; }
}
const HTML_NS = "http://www.w3.org/1999/xhtml";
/** The lines a row has, for the columns beside its title in adaptive. */
const LINES_VAR = "--wv-tl-lines";
/** Px per tree level, for a level with no row on screen to measure. */
const LEVEL_INDENT = 16;
/** Rows either side of the view measured at once rather than in the slices. */
const NEAR_ROWS = 12;
/** One background slice: this many titles, then a yield. */
const SLICE = 120;
/** The list takes the slices' heights at most this often. */
const PUSH_MS = 400;
/** A row on screen that needs another height gets it this soon. */
const PUSH_SOON_MS = 30;

export const WV_TITLE_LINES_MIN = 2;
export const WV_TITLE_LINES_MAX = 10;

function rowPad(): number {
    return Zotero.Prefs.get("uiDensity") === "comfortable" ? 11 : 5;
}

function clamp(lines: number | string): string {
    return "white-space: normal !important; display: -webkit-box !important;"
        + " -webkit-box-orient: vertical !important; -webkit-line-clamp: " + lines + " !important;"
        + " overflow: hidden !important; overflow-wrap: anywhere;";
}

/** Half of Zotero's padding on top: a one-line row reads as it does centred. The
 *  arrow and the item's icon keep Zotero's order, level with each other at the row's
 *  centre, while the text reads from the top (MJT 2026-11-06: "vertically centered,
 *  same as the arrow"; the icon before the arrow, tried in dev.12: "You have exchanged
 *  the 2"). The title cell is stretched for them to centre in; it starts below the
 *  row's padding, and the same margin under them brings them to the row's own centre. */
function titleLinesCss(lines: number, perRow: boolean): string {
    const top = rowPad() / 2;
    return ROW + " { align-items: flex-start !important; padding-block-start: " + top + "px !important; }\n"
        + ROW + " .cell.title { white-space: normal !important; align-self: stretch !important; align-items: flex-start !important; }\n"
        + ROW + " .cell.title .twisty, " + ROW + " .cell.title .spacer-twisty, " + ROW + " .cell.title .item-icon { align-self: center !important; margin-block-end: " + top + "px; }\n"
        + ROW + " .cell.title .retracted { margin-block-start: calc((1lh - 16px) / 2); }\n"
        + ROW + " .cell.title .colored-tag-swatches, " + ROW + " .cell.title > .tag-swatch.colored { height: 1lh; align-items: center; }\n"
        + ROW + " .cell.fixed-width { height: 1lh !important; }\n"
        + ROW + " .cell.title .cell-text { " + clamp(lines) + " }\n"
        + TEXT_CELL + " { " + clamp(perRow ? "var(" + LINES_VAR + ", 1)" : lines) + " }";
}

function linesHeight(lines: number, tree: any): number {
    return Math.round(lines * tree._renderedTextHeight * Number(Zotero.Prefs.get("fontSize")) + rowPad());
}

/** The row at height `y` of the list. WindowedList's getFirstVisibleRow and
 *  getLastVisibleRow count on from the last custom row in base rows, fine for the
 *  collection tree's odd separator. Inside a row 8 times as tall they land up to 7
 *  rows too far, past the 2 rows of overscan, and the top of the view is left blank. */
function rowAtOffset(jsw: any, y: number): number {
    const offsets = jsw._rowOffsets;
    const k = Math.max(0, jsw._binarySearchOffsets(offsets, y, true));
    const [index, top] = offsets[k];
    const plain = index + Math.floor((y - top) / jsw.itemHeight);
    const next = offsets[k + 1];
    return next ? Math.min(plain, next[0] - 1) : plain;
}

/** Heights to the list, with the row at the top of the view staying there. Two
 *  updates and an invalidate: the header says why. */
function pushHeights(tree: any, pairs: number[][]) {
    const jsw = tree._jsWindow;
    const firstRow = jsw.getFirstVisibleRow();
    const into = jsw.scrollOffset - jsw._getItemPosition(firstRow);
    tree.updateCustomRowHeights(pairs);
    jsw.update({});
    const want = jsw._getItemPosition(firstRow) + into;
    if (Math.abs(want - jsw.scrollOffset) > 0.5) jsw.scrollTo(want);
    jsw.invalidate();
}

function livePlugin(): any {
    const p: any = Zotero.Weavero && Zotero.Weavero.plugin;
    return p && !p._wvDestroyed ? p : null;
}

interface TlNeed { key: string; text: string; width: number; }

/** One tree's adaptive state. In a WeakMap, not on the tree: nothing to strip. */
interface TlState {
    win: any;
    /** The tree's own items view: on a Zotero with its own windows a window has one
     *  per library tab, and ZoteroPane.itemsView is the tab on screen's (zotero#6035). */
    iv: any;
    tree: any;
    /** True line counts from the hidden block, by key (width and text). */
    cache: Map<string, number>;
    /** A guess by title length, until the key is in the cache. */
    est: Map<string, number>;
    /** What a row on screen took, when it differs: by row id, for that key. */
    real: Map<any, { key: string; lines: number }>;
    keys: string[];
    ids: any[];
    sig: string;
    geo: string;
    gen: number;
    timer: any;
    pushTimer: any;
    pump: any;
    pushedAt: number;
    pushing: boolean;
    ro: any;
    roEl: any;
    mo: any;
    cellW: number;
    padR: number;
    prefix: Map<number, number>;
    font: string;
    lineH: number;
    charW: number;
}

const STATES = new WeakMap<any, TlState>();

/** One tree's fixed mode: what its child rows need. */
interface TlFixed {
    win: any;
    iv: any;
    tree: any;
    /** Zotero's own one-line row, from the wrapped _getRowHeight. */
    one: number;
    sig: string;
    pushing: boolean;
}

const FIXED = new WeakMap<any, TlFixed>();

function rowText(row: any): string | null {
    const ref = row && row.ref;
    if (!ref || typeof ref.getDisplayTitle !== "function") return null;
    try { return String(ref.getDisplayTitle() || "").replace(/<[^>]+>/g, ""); }
    catch (e) { return null; }
}

class _TitleLinesMixin {
    [k: string]: any;

    /** "off", "fixed" or "adaptive": off too while Visual Extras is off. */
    _wvTitleLinesMode(): string {
        try {
            if (!this._getEnableVisualExtras()) return "off";
            const m = Zotero.Prefs.get("weavero.titleLinesMode");
            return m === "fixed" || m === "adaptive" ? m : "off";
        }
        catch (e) { return "off"; }
    }

    _wvTitleLinesCount(): number {
        let n = NaN;
        try { n = parseInt(String(Zotero.Prefs.get("weavero.titleLinesCount")), 10); } catch (e) {}
        if (!(n >= WV_TITLE_LINES_MIN)) return WV_TITLE_LINES_MIN;
        return Math.min(n, WV_TITLE_LINES_MAX);
    }

    /** Bring this window's items tree to the setting. Per window: each has
     *  its own tree. Idempotent; the wiring table and the pref observer call it.
     *  `itemsView` can exist before `itemsView.tree`: a window opened with the
     *  setting on landed in that gap and stayed on one line (traced 2026-11-05,
     *  `iv=true tree=false`, 2 runs in 3), so the tree is waited for here. */
    /** Every items view of `win`: one per library tab on a Zotero with its own
     *  windows (zotero#6035), where a setting changed or switched off reached only
     *  the tab on screen; else the window's one. */
    _wvTlItemsViews(win: any): any[] {
        const views = wvLibraryViews(win);
        const ivs = views.length ? views.map((v: any) => v && v.itemsView) : [win && win.ZoteroPane && win.ZoteroPane.itemsView];
        return ivs.filter(Boolean);
    }

    _wvApplyTitleLines(win: any, tries = 0) {
        try {
            const mode = this._wvTitleLinesMode();
            if (mode === "off") {
                this._wvRemoveTitleLines(win);
                return;
            }
            const ivs = this._wvTlItemsViews(win);
            let pending = !ivs.length, sheet = false;
            for (const iv of ivs) {
                const tree = iv.tree;
                if (!tree || !tree._jsWindow) { pending = true; continue; }
                if (!sheet) { this._wvTlSheet(win); sheet = true; }
                this._wvTlApplyTree(win, iv, tree, mode);
            }
            if (pending && win && !win.closed && tries < 100) {
                win.setTimeout(() => {
                    const p = livePlugin();
                    if (p) p._wvApplyTitleLines(win, tries + 1);
                }, 100);
            }
        }
        catch (e) { Zotero.debug("[Weavero] title lines apply err: " + e); }
    }

    _wvTlApplyTree(win: any, iv: any, tree: any, mode: string) {
        try {
            if (typeof tree._getRowHeight !== "function") return;
            if (mode === "adaptive") {
                this._wvTlFixedStop(tree);
                if (wvUnwrap(tree, "_getRowHeight", LAYER)) tree.updateFontSize();
                this._wvTlStart(win, tree, iv);
                return;
            }
            this._wvTlStop(tree);
            wvWrap(tree, "_getRowHeight", LAYER, this._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                const base = orig.apply(this, args);
                try {
                    const fixed = FIXED.get(this);
                    if (fixed) fixed.one = base;
                    const p = livePlugin();
                    return p ? Math.max(base, linesHeight(p._wvTitleLinesCount(), this)) : base;
                }
                catch (e) { return base; }
            });
            this._wvTlFixedStart(win, tree, iv);
            tree.updateFontSize();
        }
        catch (e) { Zotero.debug("[Weavero] title lines apply err: " + e); }
    }

    /** Read-only, for live checks: the state of the tree on screen. */
    _wvTlInspect(win: any): any {
        try {
            const iv = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            const tree = iv && iv.tree;
            const st = tree && STATES.get(tree);
            const fx = tree && FIXED.get(tree);
            if (!st) return { adaptive: false, fixed: !!fx, mode: this._wvTitleLinesMode() };
            return {
                adaptive: true, mode: this._wvTitleLinesMode(), sameIv: st.iv === iv, keys: st.keys.length,
                nonEmpty: st.keys.filter(Boolean).length, cache: st.cache.size, real: st.real.size,
                header: !!headerTitle(st), cellW: st.cellW, lineH: st.lineH, timer: !!st.timer, pushing: st.pushing,
                custom: tree._jsWindow ? tree._jsWindow.customRowHeights.length : null,
            };
        }
        catch (e) { return { err: String(e) }; }
    }

    /** A library tab came on screen (window-wiring _wvLibraryViewActivated): its
     *  tree was not redone while another tab was in front, so it is now. */
    _wvTlViewShown(win: any) {
        try {
            const iv = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            const tree = iv && iv.tree;
            if (!tree) return;
            const st = STATES.get(tree);
            if (st) {
                // Its invalidates were skipped while it was in the back, and an unforced
                // redo pushes only a changed list: forced, and again once it is laid out.
                // (The 28-px rows of 2026-11-07 in a second tab were the stylesheet's
                // plain ids, lib/style.ts wvViewIdsCss, not this.)
                const redo = () => { const p = livePlugin(); if (p && win.ZoteroPane.itemsView === iv) p._wvTlRedo(win, true); };
                redo();
                win.setTimeout(redo, 250);
                return;
            }
            const fx = FIXED.get(tree);
            if (fx) this._wvTlFixedRows(fx, true);
        }
        catch (e) {}
    }

    /** Holds the row padding, so a density change comes through here as well. */
    _wvTlSheet(win: any) {
        wvInjectStyle(win.document, STYLE_ID, titleLinesCss(this._wvTitleLinesCount(), this._wvTitleLinesMode() === "adaptive"));
    }

    /** Zotero's rows back: wraps, heights, sheet, row height. */
    _wvRemoveTitleLines(win: any) {
        try {
            if (!win || !win.document) return;
            wvRemoveStyle(win.document, STYLE_ID);
            for (const iv of this._wvTlItemsViews(win)) {
                const tree = iv.tree;
                if (!tree) continue;
                this._wvTlStop(tree);
                this._wvTlFixedStop(tree);
                if (wvUnwrap(tree, "_getRowHeight", LAYER)) tree.updateFontSize();
            }
        }
        catch (e) { Zotero.debug("[Weavero] title lines remove err: " + e); }
    }

    // ---- fixed: the child rows

    _wvTlFixedStart(win: any, tree: any, iv: any) {
        let st = FIXED.get(tree);
        if (!st) {
            st = { win, iv, tree, one: 0, sig: "", pushing: false };
            FIXED.set(tree, st);
        }
        const state = st;
        const tag = this._wvWireTag();
        // Zotero hands the list the items tree's empty customRowHeights prop here.
        wvWrap(tree, "updateFontSize", LAYER, tag, (orig: any) => function (this: any, ...args: any[]) {
            const r = orig.apply(this, args);
            try {
                const p = livePlugin();
                if (p) {
                    p._wvTlSheet(win);
                    p._wvTlFixedRows(state, true);
                }
            }
            catch (e) {}
            return r;
        });
        // Whatever changes the rows ends here. At once, not after a delay as in
        // adaptive: an expanded row would show tall for a frame, and this is a plain
        // walk of the rows, with no text to read or measure.
        wvWrap(tree._jsWindow, "invalidate", LAYER, tag, (orig: any) => function (this: any, ...args: any[]) {
            const r = orig.apply(this, args);
            try { if (!state.pushing) { const p = livePlugin(); if (p) p._wvTlFixedRows(state); } } catch (e) {}
            return r;
        });
    }

    _wvTlFixedStop(tree: any) {
        if (!FIXED.delete(tree)) return;
        wvUnwrap(tree, "updateFontSize", LAYER);
        const jsw = tree._jsWindow;
        if (!jsw) return;
        wvUnwrap(jsw, "invalidate", LAYER);
        if (jsw.customRowHeights.length) pushHeights(tree, []);
    }

    /** Every child row at Zotero's one line. A flat list has nothing to do. */
    _wvTlFixedRows(st: TlFixed, force = false) {
        const { win, tree, iv } = st;
        const jsw = tree._jsWindow;
        // Its own rows, and only on screen: a tab in the back is done when it shows.
        if (!st.one || !jsw || !iv || iv.tree !== tree || (win.ZoteroPane && win.ZoteroPane.itemsView) !== iv) return;
        const rp = iv.rowProvider || iv;
        const n = rp.getRowCount ? rp.getRowCount() : rp._rows.length;
        const pairs: number[][] = [];
        let h = n;
        for (let i = 0; i < n; i++) {
            const row = rp.getRow(i);
            if (!row || !row.level) continue;
            pairs.push([i, st.one]);
            h = (Math.imul(h, 31) + i) | 0;
        }
        const sig = st.one + "|" + h;
        const same = sig === st.sig;
        st.sig = sig;
        if (!force && same) return;
        if (!pairs.length && !jsw.customRowHeights.length && !Object.keys(tree._customRowHeightMap).length) return;
        st.pushing = true;
        try { pushHeights(tree, pairs); }
        finally { st.pushing = false; }
    }

    // ---- adaptive

    _wvTlStart(win: any, tree: any, iv: any) {
        let st = STATES.get(tree);
        if (!st) {
            st = {
                win, iv, tree, cache: new Map(), est: new Map(), real: new Map(), keys: [], ids: [], sig: "", geo: "",
                gen: 0, timer: null, pushTimer: null, pump: null, pushedAt: 0, pushing: false,
                ro: null, roEl: null, mo: null, cellW: 0, padR: 0, prefix: new Map(), font: "", lineH: 0, charW: 0,
            };
            STATES.set(tree, st);
        }
        const tag = this._wvWireTag();
        const state = st;
        // Zotero hands the list the items tree's empty customRowHeights prop here.
        wvWrap(tree, "updateFontSize", LAYER, tag, (orig: any) => function (this: any, ...args: any[]) {
            const r = orig.apply(this, args);
            try {
                const p = livePlugin();
                if (p) {
                    p._wvTlSheet(win);
                    p._wvTlRedo(win, true);
                }
            }
            catch (e) {}
            return r;
        });
        // A title edited in place redraws its row and nothing else.
        wvWrap(tree, "invalidateRow", LAYER, tag, (orig: any) => function (this: any, index: any, ...args: any[]) {
            const r = orig.call(this, index, ...args);
            try { const p = livePlugin(); if (p) p._wvTlRowTouched(state, index); } catch (e) {}
            return r;
        });
        // Zotero counts a page as window height / _rowHeight, which is the one-line
        // row here, so a second Page Down jumped past rows never shown (21 rows
        // for a screen of 8). Its first press, to the edge of the view, is right.
        wvWrap(tree, "_onJumpSelect", LAYER, tag, (orig: any) => function (this: any, direction: number, selectTo: any, toggleSelection: any, ...rest: any[]) {
            const jsw = this._jsWindow;
            const first = jsw.getFirstVisibleRow(), last = jsw.getLastVisibleRow();
            const edge = direction == 1 ? last : first;
            if (this.selection.focused != edge) return orig.call(this, direction, selectTo, toggleSelection, ...rest);
            const dest = edge + direction * Math.max(1, last - first);
            return this.onSelection(Math.max(0, Math.min(dest, this.props.getRowCount() - 1)), selectTo, toggleSelection);
        });
        wvWrap(tree._jsWindow, "getFirstVisibleRow", LAYER, tag, () => function (this: any) {
            return rowAtOffset(this, this.scrollOffset);
        });
        wvWrap(tree._jsWindow, "getLastVisibleRow", LAYER, tag, () => function (this: any) {
            return rowAtOffset(this, this.scrollOffset + this.getWindowHeight());
        });
        // Whatever changes the rows ends here: a sort, a filter, a refresh, an expand.
        wvWrap(tree._jsWindow, "invalidate", LAYER, tag, (orig: any) => function (this: any, ...args: any[]) {
            const r = orig.apply(this, args);
            try {
                const p = livePlugin();
                // A library tab in the back is redone when it comes on screen (_wvTlViewShown).
                if (p && !state.pushing && state.win.ZoteroPane.itemsView === state.iv) {
                    const moved = p._wvTlStale(state);
                    if (moved) p._wvTlRedo(state.win);
                    // Still out of step: nothing laid out yet, the timer tries again.
                    if (!moved || p._wvTlStale(state)) p._wvTlSchedule(state);
                }
            }
            catch (e) {}
            return r;
        });
        if (!st.mo) {
            // Before the paint: a row drawn by a scroll has its lines at once.
            st.mo = new win.MutationObserver(() => {
                const p = livePlugin();
                if (!p) return;
                p._wvTlMark(state);
                p._wvTlLearn(state);
            });
            st.mo.observe(tree._jsWindow.innerElem, { childList: true });
        }
        this._wvTlRedo(win, true);
    }

    _wvTlStop(tree: any) {
        const st = STATES.get(tree);
        if (!st) return;
        STATES.delete(tree);
        st.gen++;
        try { if (st.timer) st.win.clearTimeout(st.timer); } catch (e) {}
        try { if (st.pushTimer) st.win.clearTimeout(st.pushTimer); } catch (e) {}
        try { if (st.pump) st.win.clearTimeout(st.pump); } catch (e) {}
        try { if (st.ro) st.ro.disconnect(); } catch (e) {}
        try { if (st.mo) st.mo.disconnect(); } catch (e) {}
        wvUnwrap(tree, "updateFontSize", LAYER);
        wvUnwrap(tree, "invalidateRow", LAYER);
        wvUnwrap(tree, "_onJumpSelect", LAYER);
        const jsw = tree._jsWindow;
        if (!jsw) return;
        wvUnwrap(jsw, "invalidate", LAYER);
        wvUnwrap(jsw, "getFirstVisibleRow", LAYER);
        wvUnwrap(jsw, "getLastVisibleRow", LAYER);
        for (const el of jsw._renderedRows.values()) el.style.removeProperty(LINES_VAR);
        tree.updateCustomRowHeights([]);
        jsw.update({});
        jsw.invalidate();
    }

    _wvTlSchedule(st: TlState, ms = 60) {
        if (st.timer) return;
        st.timer = st.win.setTimeout(() => {
            st.timer = null;
            const p = livePlugin();
            if (p) p._wvTlRedo(st.win);
        }, ms);
    }

    /** A row on screen that is not the row its height was set for. Heights go by
     *  row number, so rows that move are drawn at their neighbours' heights until
     *  the new ones land. On the timer alone the whole list jumped on every filter,
     *  sort, quick search and expand (44 to 67 ms, MJT 2026-11-06). Redone in the
     *  task that moved them, no frame shows it. Only the screen counts: an invalidate
     *  that moved nothing in view stays on the timer, which is what coalesces them. */
    _wvTlStale(st: TlState): boolean {
        const iv = st.iv;
        const rp = iv.rowProvider || iv;
        for (const i of st.tree._jsWindow._renderedRows.keys()) {
            const row = rp.getRow(i);
            if ((row && row.id) !== st.ids[i]) return true;
        }
        return false;
    }

    /** A row redrawn: only a changed title costs anything. */
    _wvTlRowTouched(st: TlState, index: any) {
        if (typeof index !== "number" || !st.keys[index]) return;
        const iv = st.iv;
        const row = (iv.rowProvider || iv).getRow(index);
        const text = rowText(row);
        if (text !== null && !st.keys[index].endsWith("|" + text)) this._wvTlSchedule(st);
    }

    /** The column's geometry, read off rows on screen. False when none is
     *  laid out: another tab in front, the view still empty. */
    _wvTlGeometry(st: TlState, rp: any): boolean {
        const { win, tree } = st;
        let seen = false;
        const rendered: Map<number, any> = tree._jsWindow._renderedRows;
        for (const [i, el] of rendered) {
            const cell = el.querySelector(".cell.title");
            const text = cell && cell.querySelector(".cell-text");
            if (!text) continue;
            const c = cell.getBoundingClientRect(), t = text.getBoundingClientRect();
            if (!c.width) continue;
            if (!seen) {
                seen = true;
                const cs = win.getComputedStyle(cell), ts = win.getComputedStyle(text);
                st.cellW = c.width;
                st.padR = parseFloat(cs.paddingRight) || 0;
                st.lineH = parseFloat(ts.lineHeight) || tree._renderedTextHeight * Number(Zotero.Prefs.get("fontSize"));
                if (ts.font !== st.font) {
                    st.font = ts.font;
                    st.charW = 0;
                    st.prefix.clear();
                }
            }
            const row = rp.getRow(i);
            const level = (row && row.level) || 0;
            // The least seen: a swatch or a glyph only ever takes room.
            const pre = t.left - c.left, had = st.prefix.get(level);
            if (had === undefined || pre < had) st.prefix.set(level, pre);
        }
        if (!seen) return false;
        if (!st.charW) {
            const ctx = win.document.createElementNS(HTML_NS, "canvas").getContext("2d");
            ctx.font = st.font;
            const s = "the quick brown fox jumps over the lazy dog, 0123456789";
            st.charW = ctx.measureText(s).width / s.length;
        }
        this._wvTlWatchWidth(st);
        return true;
    }

    /** A column or window resize: the header cell is what keeps its size in
     *  step, and it is rebuilt with the columns, so it is looked up again. */
    _wvTlWatchWidth(st: TlState) {
        const { win } = st;
        const el = headerTitle(st) || win.document.getElementById(st.iv && st.iv.id) || win.document.getElementById("zotero-items-tree");
        if (!el || el === st.roEl) return;
        if (st.ro) st.ro.disconnect();
        st.roEl = el;
        st.ro = new win.ResizeObserver(() => {
            const p = livePlugin();
            if (p) p._wvTlSchedule(st, 120);
        });
        st.ro.observe(el);
    }

    _wvTlWidth(st: TlState, level: number): number {
        let pre = st.prefix.get(level);
        if (pre === undefined) {
            const known = st.prefix.keys().next().value;
            pre = known === undefined ? 0 : (st.prefix.get(known) as number) + (level - known) * LEVEL_INDENT;
        }
        return Math.max(40, Math.round(st.cellW - pre - st.padR));
    }

    /** The real line counts of `list`, in one hidden block: every write
     *  first, every read after, so it lays out once. About 0.1 ms a title. */
    _wvTlMeasure(st: TlState, list: TlNeed[]) {
        if (!list.length) return;
        const doc = st.win.document;
        const box = doc.createElementNS(HTML_NS, "div");
        box.id = "wv-title-lines-measure";
        box.style.cssText = "position:fixed;left:-20000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;contain:strict;";
        const line = "white-space:normal;overflow-wrap:anywhere;font:" + st.font + ";line-height:" + st.lineH + "px;width:";
        const els = list.map((n) => {
            const e = doc.createElementNS(HTML_NS, "div");
            e.style.cssText = line + n.width + "px;";
            e.textContent = n.text;
            box.appendChild(e);
            return e;
        });
        doc.documentElement.appendChild(box);
        const hs = els.map((e: any) => e.getBoundingClientRect().height);
        box.remove();
        list.forEach((n, i) => { st.cache.set(n.key, Math.max(1, Math.round(hs[i] / st.lineH))); });
    }

    _wvTlLines(st: TlState, i: number): number {
        const key = st.keys[i];
        const r = st.real.get(st.ids[i]);
        if (r && r.key === key) return r.lines;
        return st.cache.get(key) ?? st.est.get(key) ?? 1;
    }

    /** The rows' heights from the cache, what is missing measured or estimated;
     *  to the list if anything changed. */
    _wvTlRedo(win: any, force = false) {
        const iv = win && win.ZoteroPane && win.ZoteroPane.itemsView;
        const tree = iv && iv.tree;
        const st = tree && STATES.get(tree);
        if (!st || this._wvTitleLinesMode() !== "adaptive") return;
        const jsw = tree._jsWindow;
        const rp = iv.rowProvider || iv;
        if (!jsw) return;
        // The Title column hidden: nothing wraps, nothing to be tall for.
        if (!headerTitle(st)) {
            st.gen++;
            if (st.keys.length) {
                st.keys = [];
                st.ids = [];
                st.sig = "";
                this._wvTlPush(st);
            }
            return;
        }
        if (!this._wvTlGeometry(st, rp)) return;
        const gen = ++st.gen;
        if (st.pump) { win.clearTimeout(st.pump); st.pump = null; }
        const max = this._wvTitleLinesCount();
        // Keyed by width, these would grow with every step of a column drag.
        const geo = st.cellW + "|" + st.font + "|" + Zotero.Prefs.get("uiDensity") + "|" + max;
        if (geo !== st.geo) {
            st.geo = geo;
            st.cache.clear();
            st.est.clear();
            st.real.clear();
        }
        const n = rp.getRowCount ? rp.getRowCount() : rp._rows.length;
        const first = n ? jsw.getFirstVisibleRow() : 0, last = n ? jsw.getLastVisibleRow() : 0;
        const keys: string[] = new Array(n), ids: any[] = new Array(n);
        const need: TlNeed[] = [];
        const near: TlNeed[] = [];
        let h = 0;
        for (let i = 0; i < n; i++) {
            const row = rp.getRow(i);
            const text = rowText(row);
            const id = row && row.id;
            ids[i] = id;
            h = (Math.imul(h, 31) + (id || 0)) | 0;
            // An empty key takes no height and is never learned from: one line.
            if (text === null || (row && row.level)) { keys[i] = ""; continue; }
            const width = this._wvTlWidth(st, 0);
            const key = width + "|" + text;
            keys[i] = key;
            if (st.cache.has(key)) continue;
            if (i >= first - NEAR_ROWS && i <= last + NEAR_ROWS) near.push({ key, text, width });
            else {
                need.push({ key, text, width });
                st.est.set(key, Math.ceil((text.length * st.charW) / width));
            }
        }
        const sig = geo + "|" + n + "|" + h;
        if (!force && !near.length && !need.length && sig === st.sig) {
            this._wvTlLearn(st);
            return;
        }
        st.sig = sig;
        st.keys = keys;
        st.ids = ids;
        this._wvTlMeasure(st, near);
        this._wvTlPush(st);
        if (need.length) this._wvTlPumpNext(st, need, gen, 0);
    }

    /** One background slice, then a yield; the list takes the news now and then. */
    _wvTlPumpNext(st: TlState, need: TlNeed[], gen: number, from: number) {
        st.pump = st.win.setTimeout(() => {
            st.pump = null;
            const p = livePlugin();
            if (!p || st.gen !== gen) return;
            p._wvTlMeasure(st, need.slice(from, from + SLICE));
            const next = from + SLICE;
            const done = next >= need.length;
            if (done || Date.now() - st.pushedAt > PUSH_MS) p._wvTlPush(st);
            if (!done) p._wvTlPumpNext(st, need, gen, next);
        }, 0);
    }

    /** Tell the rows on screen their lines, for the columns beside the title. */
    _wvTlMark(st: TlState) {
        const max = this._wvTitleLinesCount();
        for (const [i, el] of st.tree._jsWindow._renderedRows as Map<number, any>) {
            const v = String(st.keys[i] ? Math.min(max, this._wvTlLines(st, i)) : 1);
            if (el.style.getPropertyValue(LINES_VAR) !== v) el.style.setProperty(LINES_VAR, v);
        }
    }

    /** The rows on screen against what they were given. Their title boxes keep
     *  their height whatever the row's (checked live), so this cannot feed itself. */
    _wvTlLearn(st: TlState) {
        if (st.timer || st.pushing || !st.lineH) return;
        const max = this._wvTitleLinesCount();
        let wrong = false;
        for (const [i, el] of st.tree._jsWindow._renderedRows as Map<number, any>) {
            const key = st.keys[i];
            const text = key && el.querySelector(".cell.title .cell-text");
            const h = text ? text.getBoundingClientRect().height : 0;
            if (!h) continue;
            const lines = Math.max(1, Math.round(h / st.lineH));
            if (lines === Math.min(max, this._wvTlLines(st, i))) continue;
            st.real.set(st.ids[i], { key, lines });
            wrong = true;
        }
        if (!wrong || st.pushTimer) return;
        st.pushTimer = st.win.setTimeout(() => {
            st.pushTimer = null;
            const p = livePlugin();
            if (p && !st.timer) p._wvTlPush(st);
        }, PUSH_SOON_MS);
    }

    /** The rows' lines to the list. */
    _wvTlPush(st: TlState) {
        const { tree } = st;
        const max = this._wvTitleLinesCount();
        const base = tree._rowHeight;
        const pairs: number[][] = [];
        for (let i = 0; i < st.keys.length; i++) {
            if (!st.keys[i]) continue;
            const lines = Math.min(max, this._wvTlLines(st, i));
            if (lines < 2) continue;
            const height = Math.max(base, linesHeight(lines, tree));
            if (height !== base) pairs.push([i, height]);
        }
        st.pushing = true;
        try { pushHeights(tree, pairs); }
        finally { st.pushing = false; }
        st.pushedAt = Date.now();
        this._wvTlMark(st);
        this._wvTlLearn(st);
    }
}

const _titleLinesDescriptors = Object.getOwnPropertyDescriptors(_TitleLinesMixin.prototype);
delete (_titleLinesDescriptors as any).constructor;
export const titleLinesMethods = _titleLinesDescriptors;
