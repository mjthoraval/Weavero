// Expanding a row near the bottom of the items list shows its child rows (MJT
// 2026-11-25, approved as proposed: "after a twisty click or keyboard expand,
// scroll the minimum that shows the new rows, never pushing the parent off the
// top; Expand All (+) unchanged").
//
// Zotero 11 keeps the viewport ON PURPOSE when a container toggles
// (itemTree.jsx rowProvider.toggleOpenState: `restoreScroll: true`, "Preserve
// viewport when toggling a container instead of jumping to the current
// selection"), so a row opened at the bottom edge opens out of sight. This
// adds the scroll a file manager does after the restore, and only after the
// user's own gesture: a mouseup on a twisty or the expand key, seen by capture
// listeners on the tree just before Zotero toggles the row. Expand All, a
// selection that opens its parent, a drag that springs a row open and every
// caller in code (Weavero's included) keep Zotero's viewport.
//
// Only the rows the toggle ADDED count, as the windowed list's row count
// before and after: with the filter on, the rows on screen are the filter's,
// and the count is what the list positions (AGENTS.md: iv.rowCount and getRow
// bypass the filter). Several rows opened at once (the expand key on a
// multi-row selection) scroll nothing: no single parent to keep in view.
//
// Entry points: Zotero 11's twisty and keys call the TREE's toggleOpenState
// (VirtualizedTree -> props.onToggleOpenState -> rowProvider); Zotero 10's
// twisty calls the items view's (LibraryTree.handleTwistyMouseUp), and its
// keys the tree's, which calls the view's. Both are wrapped; the inner call of
// a nested pair does nothing.
//
// Private Zotero members: tree._jsWindow (scrollOffset, getWindowHeight,
// getItemCount, _getItemPosition, scrollTo), tree.selection, tree.props
// (stickySectionHeaders), tree._getSectionHeaderIndices, tree._rowHeight.
// Tripwire: test/expand-scroll.spec.js.

import { wvUnwrap, wvWrap } from "../lib/wrap";
import { wvLibraryViews } from "../lib/windows";
import { wvAccelAny } from "../lib/keys";

declare const Zotero: any;

const LAYER = "expandScroll";
/** A toggle this soon after the gesture is the gesture's. */
const GESTURE_MS = 400;
/** A second look once the rows have their heights (title lines push them). */
const SETTLE_MS = 150;

interface XsState {
    win: any;
    iv: any;
    tree: any;
    el: any;
    onMouse: (e: any) => void;
    onKey: (e: any) => void;
    /** When the last gesture came, and whether it was a multi-row one. */
    at: number;
    multi: boolean;
    depth: number;
    /** Scrolls done, for the spec and live checks. */
    reveals: number;
}

const STATES = new WeakMap<any, XsState>();

function livePlugin(): any {
    const p: any = Zotero.Weavero && Zotero.Weavero.plugin;
    return p && !p._wvDestroyed ? p : null;
}

function rowCount(tree: any): number {
    try {
        const jsw = tree._jsWindow;
        const n = Number(jsw && typeof jsw.getItemCount === "function" ? jsw.getItemCount() : NaN);
        return Number.isFinite(n) ? n : NaN;
    }
    catch (e) { return NaN; }
}

/** Space a pinned section header takes at the top, as VirtualizedTable.scrollToRow reserves it. */
function headerReserve(tree: any, index: number): number {
    try {
        if (tree.props && tree.props.stickySectionHeaders && typeof tree._getSectionHeaderIndices === "function"
                && tree._getSectionHeaderIndices().some((i: number) => i < index)) {
            return Number(tree._rowHeight) || 0;
        }
    }
    catch (e) {}
    return 0;
}

/** Scroll down the least that shows rows parent+1 .. last, never past the parent's top.
 *  Returns the offset set, or null when nothing moved. */
function reveal(tree: any, parent: number, last: number): number | null {
    const jsw = tree._jsWindow;
    if (!jsw || typeof jsw._getItemPosition !== "function" || typeof jsw.scrollTo !== "function") return null;
    const top = Number(jsw.scrollOffset) || 0;
    const h = Number(jsw.getWindowHeight()) || 0;
    if (h <= 0) return null;
    const end = jsw._getItemPosition(last + 1);
    if (end <= top + h + 1) return null;
    // Whole pixels up, for the last row: Zotero 10 rounds a fractional scroll
    // offset down and left it 0.7 px short (2026-11-25). The parent's own top as is.
    const cap = jsw._getItemPosition(parent) - headerReserve(tree, parent);
    const want = Math.min(Math.ceil(end - h), cap);
    if (want <= top + 0.5) return null;
    jsw.scrollTo(want);
    return Number(jsw.scrollOffset);
}

class _ExpandScrollMixin {
    [k: string]: any;

    _wvExpandScrollOn(): boolean {
        try { return !!this._getEnableVisualExtras(); }
        catch (e) { return false; }
    }

    /** Wire every items view of `win` (one per library tab with Zotero's own
     *  windows, zotero#6035). Idempotent; the wiring table calls it. */
    _wvApplyExpandScroll(win: any, tries = 0) {
        try {
            const views = wvLibraryViews(win);
            const ivs = (views.length ? views.map((v: any) => v && v.itemsView) : [win && win.ZoteroPane && win.ZoteroPane.itemsView]).filter(Boolean);
            let pending = !ivs.length;
            for (const iv of ivs) {
                if (!iv.tree || !iv.tree._jsWindow) { pending = true; continue; }
                this._wvXsWire(win, iv);
            }
            if (pending && win && !win.closed && tries < 100) {
                win.setTimeout(() => {
                    const p = livePlugin();
                    if (p) p._wvApplyExpandScroll(win, tries + 1);
                }, 100);
            }
        }
        catch (e) { Zotero.debug("[Weavero] expand scroll apply err: " + e); }
    }

    _wvXsWire(win: any, iv: any) {
        const tree = iv.tree;
        const el = iv.domEl || (iv.id && win.document.getElementById(iv.id));
        if (!el) return;
        let st = STATES.get(tree);
        if (st && st.el === el && st.iv === iv) {
            this._wvXsWrap(st);
            return;
        }
        if (st) this._wvXsUnwireState(st);
        const mark = (multi: boolean) => {
            const s = STATES.get(tree);
            if (!s) return;
            s.at = win.performance.now();
            s.multi = multi;
        };
        st = {
            win, iv, tree, el, at: -Infinity, multi: false, depth: 0, reveals: 0,
            onMouse: (e: any) => {
                try {
                    const t = e.target;
                    if (e.button === 0 && t && typeof t.closest === "function" && t.closest(".twisty")) mark(false);
                }
                catch (err) {}
            },
            onKey: (e: any) => {
                try {
                    if (e.altKey || wvAccelAny(e) || e.shiftKey) return;
                    if (e.key !== Zotero.arrowNextKey) return;
                    const sel = tree.selection;
                    mark(!!sel && sel.count > 1);
                }
                catch (err) {}
            },
        };
        STATES.set(tree, st);
        el.addEventListener("mouseup", st.onMouse, true);
        el.addEventListener("keydown", st.onKey, true);
        this._wvXsWrap(st);
    }

    _wvXsWrap(st: XsState) {
        const tag = this._wvWireTag();
        const make = (orig: any) => function (this: any, index: any, ...rest: any[]) {
            const p = livePlugin();
            const s = STATES.get(st.tree);
            if (!p || !s || s.depth > 0) return orig.call(this, index, ...rest);
            const fresh = s.win.performance.now() - s.at < GESTURE_MS;
            if (!fresh || s.multi || !p._wvExpandScrollOn()) return orig.call(this, index, ...rest);
            s.at = -Infinity;
            const before = rowCount(s.tree);
            s.depth++;
            let out: any;
            try { out = orig.call(this, index, ...rest); }
            finally { s.depth--; }
            const after = () => {
                const q = livePlugin();
                if (q) q._wvXsAfterToggle(s, Number(index), before);
            };
            if (out && typeof out.then === "function") out.then(after, () => {});
            else after();
            return out;
        };
        wvWrap(st.tree, "toggleOpenState", LAYER, tag, make);
        if (typeof st.iv.toggleOpenState === "function") wvWrap(st.iv, "toggleOpenState", LAYER, tag, make);
    }

    /** After Zotero's toggle and its viewport restore (same task on Zotero 11). */
    _wvXsAfterToggle(st: XsState, parent: number, before: number) {
        if (!Number.isFinite(parent) || !Number.isFinite(before)) return;
        st.win.setTimeout(() => {
            const p = livePlugin();
            if (!p) return;
            const count = rowCount(st.tree);
            const added = count - before;
            if (!(added > 0)) return;
            const set = reveal(st.tree, parent, parent + added);
            if (set === null) return;
            st.reveals++;
            // Title lines give rows their heights a moment later: look once more,
            // unless the list or the user moved meanwhile.
            st.win.setTimeout(() => {
                try {
                    const jsw = st.tree._jsWindow;
                    if (!livePlugin() || rowCount(st.tree) !== count || !jsw || Math.abs(Number(jsw.scrollOffset) - set) > 0.5) return;
                    reveal(st.tree, parent, parent + added);
                }
                catch (e) {}
            }, SETTLE_MS);
        }, 0);
    }

    _wvXsUnwireState(st: XsState) {
        try { st.el.removeEventListener("mouseup", st.onMouse, true); } catch (e) {}
        try { st.el.removeEventListener("keydown", st.onKey, true); } catch (e) {}
        try { wvUnwrap(st.tree, "toggleOpenState", LAYER); } catch (e) {}
        try { wvUnwrap(st.iv, "toggleOpenState", LAYER); } catch (e) {}
        STATES.delete(st.tree);
    }

    _wvRemoveExpandScroll(win: any) {
        try {
            const views = wvLibraryViews(win);
            const ivs = (views.length ? views.map((v: any) => v && v.itemsView) : [win && win.ZoteroPane && win.ZoteroPane.itemsView]).filter(Boolean);
            for (const iv of ivs) {
                const st = iv.tree && STATES.get(iv.tree);
                if (st) this._wvXsUnwireState(st);
            }
        }
        catch (e) { Zotero.debug("[Weavero] expand scroll remove err: " + e); }
    }

    /** Read-only, for the spec and live checks. */
    _wvXsInspect(win: any): any {
        try {
            const tree = win.ZoteroPane.itemsView.tree;
            const st = STATES.get(tree);
            return { wired: !!st, reveals: st ? st.reveals : 0, on: this._wvExpandScrollOn() };
        }
        catch (e) { return { wired: false, reveals: 0, on: false }; }
    }
}

const _expandScrollDescriptors = Object.getOwnPropertyDescriptors(_ExpandScrollMixin.prototype);
delete (_expandScrollDescriptors as any).constructor;
export const expandScrollMethods = _expandScrollDescriptors;
