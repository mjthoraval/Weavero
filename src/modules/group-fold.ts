// Module: the "Group Libraries" line of the collections pane folds (MJT
// 2026-11-22: "Also add an icon in front of the Group Libraries lines to make
// it collapsible").
//
// His picks, and how each is met:
//   - Zotero's own twisty in front of the line: the line's row is a header
//     (collectionTree.jsx refresh, ref id "group-libraries-header", row id
//     "HG"), for which Zotero answers isContainerEmpty = true, so renderItem
//     drew a spacer. While the line folds, the hidden-collections wrapper of
//     isContainerEmpty (pane.ts `_wvHidWrapContainerEmpty`) answers false
//     there, and Zotero's renderItem draws its own twisty -- `getCSSIcon
//     ("twisty")`, `open` while shown, its animation (`_lastToggleOpenState
//     Index`), LTR and RTL by Zotero's CSS, `aria-expanded`. Zotero's twisties
//     carry no label or tooltip: neither does this one (no new string).
//   - A click on the twisty (its mouseup calls toggleOpenState, wrapped here)
//     or anywhere on the line (a press then a release on the line: the
//     tree's own listeners, keyed `grpfold:down` / `grpfold:up`) toggles.
//     The line stays unselectable and unfocusable; Left / Right on the rows
//     are Zotero's, unchanged.
//   - Folded, the group rows and everything under them leave `_rows`, as
//     Zotero's _closeContainer does for a container; the heading stays, with
//     the hidden-groups dot and its menu.
//   - A selection inside the groups when the line folds goes to My Library;
//     with My Library hidden (pane.ts hidden collections) the nearest
//     selectable row above the line, else the first one below it (Feeds). With
//     no selectable row outside the groups the line does not fold (no
//     twisty): the tree must keep a selection (requireSelection). Rows of a
//     multi-selection outside the groups stay selected.
//   - Remembered: `weavero.groupLibrariesCollapsed` (prefs-table.ts), a local
//     pref, as Zotero keeps its own open rows in ONE pref for every window
//     (`sourceList.persist`: read when a tree is built, written by any tree on
//     each toggle, the last writer's state for the next tree;
//     collectionTree.jsx constructor and _saveOpenStates). So each tree --
//     each main window, each library tab on Zotero 11 -- keeps its own fold
//     while it lives (a toggle in one window folds nothing elsewhere), and a
//     tree built later (a new window, a new library tab, a restart) takes the
//     last toggle. Only a toggle writes it (the twisty, the line, a drag
//     hovering the line); showing a selection (below) does not.
//   - The collections search: while it filters, Zotero shows every matching
//     group whatever the fold, and draws no twisty on the line (renderItem's
//     `hasChildMatchingFilter`, false for a header); the line folds back when
//     the search clears, unless the user selected a group meanwhile.
//   - A drag hovering the folded line for a second unfolds it, and folds it
//     back when the drag leaves the tree or drops: Zotero's own hover logic
//     (onDragOver -> toggleOpenState, closeContainersExpandedOnDrag), which
//     the line takes now that it is a container.
//   - A group added or removed by sync while folded: the tree's reload keeps
//     it folded (the heading comes or goes with the groups). Zotero's notify
//     reads the row of a deleted group, or of the library a collection or
//     search is added to or restored in, and THROWS when that row is not in
//     the tree (collectionTree.jsx notify / _addSortedRow; getLevel of an
//     undefined index), leaving the tree's select events suppressed: a group
//     deleted while its row is out is a reload here, an add / modify for a
//     library whose row is out is dropped (nothing of it is drawn). Also
//     Weavero's hidden groups and a hidden My Library (pane.ts).
//   - A group or one of its rows selected by other means (Go to Library, a
//     zotero://select link, selectByID / restoreSelection, Weavero's tabs and
//     sessions) unfolds the line first: selectLibrary, expandToCollection and
//     expandLibrary are where Zotero 10 and 11 resolve such a row
//     (selectByID, _expandToID, selectItems).
//   - Every pane tree of a window: a layer on the WINDOW's CollectionTree
//     class (`win.require("zotero/collectionTree")`, each main window its
//     own loader) lays the fold over every rebuild of a tree's rows -- its
//     `_refreshRowMap`, which every refresh calls, one that started before
//     the layer went on too -- from the first: no flash of the groups when a
//     window or a library tab opens after the plugin; it wires the tree there.
//     The table entry also adopts the trees already built. Zotero's other
//     trees (Select Items, Weavero's Collections and Libraries Manager) live
//     in other windows.
//   - Teardown (disable, reload, update): the class and tree layers come off,
//     the listeners go, the folded rows are put back synchronously (the rows
//     taken out, unless something changed meanwhile: then a reload, selection
//     kept by id) and the line gets Zotero's own state back (no twisty, no
//     aria-expanded, isOpen false), Zotero's members back in the virtualized
//     tree's props too (_wvGfSyncProps). Before the hidden collections' teardown
//     (index.ts destroy): its plain refresh would read the selection at the
//     folded indices otherwise.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.
// Guards: test/group-libraries-fold.spec.js, test/zz-group-fold-reload.spec.js
// (the hot install: the props, a refresh landing after the new instance wired).

import { wvLivePlugin } from "../lib/live";
import { wvWrap, wvUnwrap, wvWrapSettle } from "../lib/wrap";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvMainWins, wvLibraryViews } from "../lib/windows";

declare const Zotero: any;

const GF_LAYER = "grpfold";
const GF_HEADER = "HG";
const GF_PREF = "weavero.groupLibrariesCollapsed";
// "refresh": 1.2.1-grpfold.1 / .2's layer, taken off too. "selectItems", "selectCollection",
// "selectSearch", "selectTrash": the collections funnel's navigation layers, laid with these
// (coll-funnel.ts _wvCfNavEnter, _wvCfRevealFor; second review 2026-11-28).
const GF_CLASS_MEMBERS = ["_refreshRowMap", "refresh", "selectLibrary", "expandToCollection", "expandLibrary", "notify",
    "selectItems", "selectCollection", "selectSearch", "selectTrash"];
// toggleOpenState is a class field: each tree's own property.
const GF_TREE_MEMBERS = ["toggleOpenState"];

interface WvGfState {
    /** This tree's fold, as the user left it. */
    collapsed: boolean;
    /** The rows the last fold took out, for a synchronous teardown. */
    stash: any[] | null;
    /** A notification arrived while folded: the stash may be stale. */
    dirty: boolean;
    /** An unfold in flight. */
    busy: Promise<boolean> | null;
    /** A primary press on the line (ms), for the click on release. */
    press: number;
    /** How the tree was first folded: at its first refresh (the class layer,
     *  never drawn open) or adopted once built. */
    born: string;
    /** Adopted before its first refresh had finished (Zotero 11 tells
     *  plugins of a window when its view has mounted, while the tree's first
     *  refresh still runs): that refresh is still the class layer's. */
    adopting: boolean;
    /** The `_rows` array the fold was last laid on: another one is a rebuild. */
    rows: any[] | null;
}

// Per tree, keyed by the tree (window-wiring.spec.js records expandos).
const WV_GF: WeakMap<any, WvGfState> = new WeakMap();

class _GroupFoldMixin {
    // ---- what folds ----

    /** The fold runs under Extras, as the rest of the collections pane's
     *  aids and the hidden collections. */
    _wvGfOn(): boolean {
        try { return !!(this as any)._wvHidOn(); } catch (e) { return false; }
    }

    _wvGfPrefCollapsed(): boolean {
        try { return Zotero.Prefs.get(GF_PREF) === true; } catch (e) { return false; }
    }

    /** A library view's collections tree: a CollectionTree of a main window
     *  whose host sits in a collections pane (the ids carry a library tab's
     *  suffix on a Zotero with its own windows). */
    _wvGfIsPaneTree(cv: any): boolean {
        try {
            if (!cv || typeof cv.getRow !== "function" || !cv.domEl || !Array.isArray(cv._rows)) return false;
            if (!String(cv.id || "").startsWith("collection-tree")) return false;
            return !!(cv.domEl.closest && cv.domEl.closest("[id^='zotero-collections-pane']"));
        } catch (e) { return false; }
    }

    _wvGfStateOf(cv: any, create = false, born = ""): WvGfState | null {
        let st = WV_GF.get(cv) || null;
        if (!st && create) {
            st = { collapsed: this._wvGfPrefCollapsed(), stash: null, dirty: false, busy: null, press: 0, born, adopting: false, rows: null };
            WV_GF.set(cv, st);
        }
        return st;
    }

    _wvGfFilterEmpty(cv: any): boolean {
        try { return typeof cv._isFilterEmpty === "function" ? !!cv._isFilterEmpty() : true; } catch (e) { return true; }
    }

    /** The line's index, -1 when the tree has none (no group shown). */
    _wvGfHeaderIndex(cv: any): number {
        try {
            const i = cv && cv._rowMap ? cv._rowMap[GF_HEADER] : undefined;
            return typeof i === "number" && cv._rows[i] ? i : -1;
        } catch (e) { return -1; }
    }

    /** The first row after the line's groups (= h + 1 when folded). */
    _wvGfBlockEnd(cv: any, h: number): number {
        const rows = cv._rows;
        const lvl = rows[h].level;
        let e = h + 1;
        while (e < rows.length && rows[e] && rows[e].level > lvl) e++;
        return e;
    }

    /** Some row outside the groups can take the selection. */
    _wvGfCanCollapseAt(cv: any, h: number): boolean {
        try {
            const e = this._wvGfBlockEnd(cv, h);
            for (let i = 0; i < cv._rows.length; i++) {
                if (i > h && i < e) continue;
                if (cv.isSelectable(i)) return true;
            }
        } catch (e) {}
        return false;
    }

    /** Row `index` is the line and folds here: a pane tree, Extras on, no
     *  collections search, and folded -- or open with a row outside the
     *  groups for the selection. Read by renderItem (through
     *  isContainerEmpty), the tree's toggle, the line's click and the pinned
     *  parents (pane.ts). */
    _wvGfIsFoldHeader(cv: any, index: any): boolean {
        try {
            // The row first: isContainerEmpty asks for every row it finds empty.
            if (!WV_GF.get(cv)) return false;
            const r = cv.getRow(index);
            if (!r || r.id !== GF_HEADER) return false;
            if (!this._wvGfOn() || !this._wvGfFilterEmpty(cv)) return false;
            // Nothing under it: folded -- or the header Zotero leaves behind
            // when the last group's row is deleted (notify removes the group's
            // rows, not the header, until the next refresh): no twisty there.
            if (this._wvGfBlockEnd(cv, index) === index + 1) return this._wvGfHasShownGroups(cv);
            return this._wvGfCanCollapseAt(cv, index);
        } catch (e) { return false; }
    }

    /** Some group library would show in this tree. */
    _wvGfHasShownGroups(cv: any): boolean {
        try { return Zotero.Groups.getAll().some((g: any) => !!cv._includedInTree(g)); } catch (e) { return false; }
    }

    /** A selected or focused row is among the line's groups. */
    _wvGfSelectionInBlock(cv: any): boolean {
        try {
            const h = this._wvGfHeaderIndex(cv);
            if (h < 0) return false;
            const e = this._wvGfBlockEnd(cv, h);
            const sel = cv.selection;
            if (!sel || !sel.selected || typeof sel.selected[Symbol.iterator] !== "function") return false;
            for (const i of sel.selected) if (i > h && i < e) return true;
            return sel.focused > h && sel.focused < e;
        } catch (e) { return false; }
    }

    /** Group `libraryID`'s row is out of `cv` because the line is folded: the heading there with
     *  nothing under it. Its unfold builds the groups again from the tree's rules when a
     *  notification came meanwhile (`dirty`). The collections funnel asks (coll-funnel.ts
     *  _wvCfLeftOut: nothing of its own to rebuild then; second review 2026-11-28, 2). */
    _wvGfFoldedAway(cv: any, libraryID: any): boolean {
        try {
            if (!WV_GF.get(cv)) return false;
            const lib: any = Zotero.Libraries.get(libraryID);
            if (!lib || lib.libraryType !== "group") return false;
            const h = this._wvGfHeaderIndex(cv);
            return h >= 0 && this._wvGfBlockEnd(cv, h) === h + 1;
        } catch (e) { return false; }
    }

    /** A group library this tree shows (Weavero's hidden groups are not). */
    _wvGfIsShownGroupLibrary(cv: any, libraryID: any): boolean {
        try {
            const lib: any = Zotero.Libraries.get(libraryID);
            if (!lib || lib.libraryType !== "group") return false;
            const g: any = Zotero.Groups.getByLibraryID(libraryID);
            return !!g && !!cv._includedInTree(g);
        } catch (e) { return false; }
    }

    // ---- the rows ----

    _wvGfPaint(cv: any, h: number, animate: boolean) {
        try {
            if (animate) cv._lastToggleOpenStateIndex = h;
            if (cv.tree) cv.tree.invalidate();
        } catch (e) {}
        finally { if (animate) { try { cv._lastToggleOpenStateIndex = null; } catch (e) {} } }
    }

    /** Zotero sets `aria-expanded` on a row it finds not empty and never
     *  removes it: the line's element keeps it once the fold is off. */
    _wvGfClearAria(cv: any) {
        try {
            const h = this._wvGfHeaderIndex(cv);
            if (h < 0 || !cv.domEl) return;
            const el = cv.domEl.ownerDocument.getElementById(cv.id + "-row-" + h);
            if (el && el.hasAttribute("aria-expanded")) el.removeAttribute("aria-expanded");
        } catch (e) {}
    }

    /** Where a selection inside the groups goes: My Library, else the nearest
     *  selectable row above the line, else the first one below the groups;
     *  -1 when none. Indices before the fold. */
    _wvGfFallbackRow(cv: any, h: number, e: number): number {
        try {
            const my = cv._rowMap ? cv._rowMap["L" + Zotero.Libraries.userLibraryID] : undefined;
            if (typeof my === "number" && !(my > h && my < e) && cv.isSelectable(my)) return my;
            for (let i = h - 1; i >= 0; i--) if (cv.isSelectable(i)) return i;
            for (let i = e; i < cv._rows.length; i++) if (cv.isSelectable(i)) return i;
        } catch (err) {}
        return -1;
    }

    /** Take the groups out of the tree, as Zotero's _closeContainer does for
     *  a container. `withSelection`: the tree's selection is live (a toggle),
     *  not one a refresh's caller is about to restore by id. Returns false
     *  when it did not fold (no row outside the groups to select). */
    _wvGfFold(cv: any, withSelection: boolean, paint: boolean, animate: boolean): boolean {
        const st = this._wvGfStateOf(cv, true) as WvGfState;
        const h = this._wvGfHeaderIndex(cv);
        if (h < 0) return false;
        const rows = cv._rows;
        const e = this._wvGfBlockEnd(cv, h);
        const n = e - h - 1;
        if (n <= 0) {
            rows[h].isOpen = false;
            if (paint) this._wvGfPaint(cv, h, animate);
            return true;
        }
        const inB = (i: number) => i > h && i < e;
        const remap = (i: number) => (i >= e ? i - n : i);
        const sel = withSelection ? cv.selection : null;
        const live = !!(sel && sel.selected && typeof sel.selected.clear === "function");
        let selected: number[] = [];
        let lost = false;
        let target = -1;
        if (live) {
            selected = Array.from(sel.selected as Iterable<number>);
            lost = selected.some(inB) || inB(sel.focused);
            if (lost && !selected.some((i) => !inB(i))) {
                target = this._wvGfFallbackRow(cv, h, e);
                if (target < 0) return false;
            }
        }
        const stash = rows.splice(h + 1, n);
        rows[h].isOpen = false;
        st.stash = stash;
        st.dirty = false;
        try { cv._refreshRowMap(); } catch (err) {}
        if (!live) {
            if (paint) this._wvGfPaint(cv, h, animate);
            return true;
        }
        const keep = selected.filter((i) => !inB(i)).map(remap);
        if (!lost) {
            // Nothing selected among the groups: the indices below them move
            // up, silently (no select event, the items list stays).
            sel.selected.clear();
            for (const i of keep) sel.selected.add(i);
            sel.focused = remap(sel.focused);
            sel.pivot = inB(sel.pivot) ? sel.focused : remap(sel.pivot);
            if (paint) this._wvGfPaint(cv, h, animate);
            return true;
        }
        const list = keep.length ? keep : [remap(target)];
        const owner = !sel.selectEventsSuppressed;
        if (owner) sel.selectEventsSuppressed = true;
        sel.selected.clear();
        for (const i of list) sel.selected.add(i);
        sel.focused = list[0];
        sel.pivot = list[0];
        if (paint) this._wvGfPaint(cv, h, animate);
        try { cv.ensureRowIsVisible(list[0]); } catch (err) {}
        // One select event: the items list follows the new row.
        if (owner) sel.selectEventsSuppressed = false;
        return true;
    }

    /** Put the groups back after the line: the rows the fold took out when
     *  nothing changed since, else built as refresh builds them (each group,
     *  then Zotero's _expandRow for its rows, the group's own open state
     *  kept). `open`: the line's state after (false: Zotero's own, the fold
     *  off). Selected rows below the groups move down silently. */
    _wvGfUnfold(cv: any, animate: boolean, open: boolean): Promise<boolean> {
        const st = this._wvGfStateOf(cv);
        if (st && st.busy) return st.busy;
        const P: any = this;
        const job = (async (): Promise<boolean> => {
            try {
                const h0 = P._wvGfHeaderIndex(cv);
                if (h0 < 0) return false;
                if (P._wvGfBlockEnd(cv, h0) > h0 + 1) {
                    cv._rows[h0].isOpen = open;
                    P._wvGfPaint(cv, h0, false);
                    return true;
                }
                let built: any[] = [];
                if (st && st.stash && st.stash.length && !st.dirty) built = st.stash;
                else {
                    const Row: any = (Zotero as any).CollectionTreeRow;
                    for (const g of Zotero.Groups.getAll()) {
                        let inc = false;
                        try { inc = !!cv._includedInTree(g); } catch (e) {}
                        if (!inc) continue;
                        built.push(new Row(cv, "group", g, 1));
                        try { await cv._expandRow(built, built.length - 1); } catch (e) {}
                    }
                }
                // A refresh may have rebuilt the tree meanwhile: its own rule
                // then applied; only the line's state is left.
                const h = P._wvGfHeaderIndex(cv);
                if (h < 0) return false;
                if (P._wvGfBlockEnd(cv, h) > h + 1) {
                    cv._rows[h].isOpen = open;
                    P._wvGfPaint(cv, h, false);
                    return true;
                }
                const k = built.length;
                cv._rows.splice(h + 1, 0, ...built);
                cv._rows[h].isOpen = open;
                if (st) { st.stash = null; st.dirty = false; }
                const sel = cv.selection;
                if (k && sel && sel.selected && typeof sel.selected.clear === "function") {
                    const moved = Array.from(sel.selected as Iterable<number>).map((i) => (i > h ? i + k : i));
                    sel.selected.clear();
                    for (const i of moved) sel.selected.add(i);
                    if (sel.focused > h) sel.focused += k;
                    if (sel.pivot > h) sel.pivot += k;
                }
                try { cv._refreshRowMap(); } catch (e) {}
                P._wvGfPaint(cv, h, animate);
                return true;
            }
            catch (e) {
                Zotero.debug("[Weavero] group fold: unfold err: " + e);
                return false;
            }
        })();
        if (st) {
            st.busy = job;
            job.then(() => { if (st.busy === job) st.busy = null; }, () => { if (st.busy === job) st.busy = null; });
        }
        return job;
    }

    /** The user's toggle: the twisty, the line, a drag hovering it (Zotero's
     *  toggleOpenState). Writes the remembered state. */
    async _wvGfToggle(cv: any, persist: boolean): Promise<void> {
        try {
            const st = this._wvGfStateOf(cv);
            if (!st) return;
            if (st.busy) { try { await st.busy; } catch (e) {} }
            const h = this._wvGfHeaderIndex(cv);
            if (h < 0 || !this._wvGfIsFoldHeader(cv, h)) return;
            if (this._wvGfBlockEnd(cv, h) > h + 1) {
                if (!this._wvGfFold(cv, true, true, true)) return;
                st.collapsed = true;
            }
            else {
                if (!(await this._wvGfUnfold(cv, true, true))) return;
                st.collapsed = false;
            }
            if (persist) { try { Zotero.Prefs.set(GF_PREF, st.collapsed); } catch (e) {} }
        } catch (e) { Zotero.debug("[Weavero] group fold: toggle err: " + e); }
    }

    /** A group (or a row of one) is about to be selected: unfold so the
     *  selection shows. Not remembered: the user did not fold or unfold. */
    async _wvGfRevealFor(cv: any, kind: string, arg: any): Promise<void> {
        try {
            const st = WV_GF.get(cv);
            if (!st || !this._wvGfFilterEmpty(cv)) return;
            const h = this._wvGfHeaderIndex(cv);
            if (h < 0 || this._wvGfBlockEnd(cv, h) > h + 1) return;
            let libs: any[] = [];
            if (kind === "library") libs = [arg === undefined ? Zotero.Libraries.userLibraryID : arg];
            else if (kind === "collection") {
                const c: any = Zotero.Collections.get(arg);
                if (c && cv._includedInTree(c)) libs = [c.libraryID];
            }
            else if (kind === "libraries") libs = ([] as any[]).concat(arg);
            if (!libs.some((id) => this._wvGfIsShownGroupLibrary(cv, id))) return;
            if (await this._wvGfUnfold(cv, false, true)) st.collapsed = false;
        } catch (e) { Zotero.debug("[Weavero] group fold: reveal err: " + e); }
    }

    /** The tree's rows were rebuilt -- Zotero's refresh assigns a new `_rows`
     *  and calls `_refreshRowMap` (the class layer sees it there). ANY refresh,
     *  one this instance's layers never saw included: the previous
     *  instance's teardown leaves the hidden collections' plain refresh
     *  running, and it landed after this instance had adopted the tree and
     *  drawn the line open -- fresh rows, the header's isOpen false, a closed
     *  twisty over open groups (citations.36 on MJT's 11.0-beta.5, 23 groups,
     *  2026-11-22). So here: wire the tree, lay the fold over the fresh rows,
     *  put the selection back on the rows it was on in the previous rows
     *  (a caller that restores it by id does that again), and redraw.
     *  A selected row among the groups keeps the line open (this tree's
     *  state with it). `prev`: the rows before, null for a tree seen first. */
    _wvGfRowsReplaced(cv: any, prev: any[] | null) {
        try {
            if (!this._wvGfIsPaneTree(cv)) return;
            const st = this._wvGfStateOf(cv, true, "refresh") as WvGfState;
            st.rows = cv._rows;
            if (st.adopting) st.born = "refresh";
            this._wvGfWireTree(cv);
            const h = this._wvGfHeaderIndex(cv);
            if (h < 0) { st.stash = null; return; }
            // The selection, as rows of the previous layout.
            const sel = cv.selection;
            const live = !!(sel && sel.selected && typeof sel.selected.clear === "function");
            const idOf = (i: any) => { try { const r = prev && prev[i]; return r ? r.id : null; } catch (e) { return null; } };
            const ids: string[] = live ? (Array.from(sel.selected as Iterable<number>).map(idOf).filter(Boolean) as string[]) : [];
            const focusedID = live ? idOf(sel.focused) : null;
            const pivotID = live ? idOf(sel.pivot) : null;
            const e0 = this._wvGfBlockEnd(cv, h);
            const inGroups = (id: any) => { const i = cv._rowMap[id]; return typeof i === "number" && i > h && i < e0; };
            const on = this._wvGfOn() && this._wvGfFilterEmpty(cv);
            if (on && st.collapsed && (ids.some(inGroups) || (focusedID && inGroups(focusedID)))) st.collapsed = false;
            if (on && st.collapsed && this._wvGfCanCollapseAt(cv, h)) this._wvGfFold(cv, false, false, false);
            else {
                if (on && st.collapsed) st.collapsed = false;   // nothing else to select: open
                cv._rows[h].isOpen = on && e0 > h + 1;
                st.stash = null;
            }
            if (ids.length) {
                const at = ids.map((id) => cv._rowMap[id]).filter((i: any) => typeof i === "number");
                if (at.length) {
                    sel.selected.clear();
                    for (const i of at) sel.selected.add(i);
                    const f = focusedID != null ? cv._rowMap[focusedID] : undefined;
                    sel.focused = typeof f === "number" ? f : at[0];
                    const pv = pivotID != null ? cv._rowMap[pivotID] : undefined;
                    sel.pivot = typeof pv === "number" ? pv : sel.focused;
                }
            }
            if (cv.tree) cv.tree.invalidate();
        } catch (e) { Zotero.debug("[Weavero] group fold: rows err: " + e); }
    }

    /** The rows to the tree's state now (adoption, Extras switched): folded
     *  while the fold is on and the tree's state says so -- unless a group
     *  row is selected, which keeps the line open -- else every group shown. */
    _wvGfSync(cv: any, animate: boolean): Promise<any> | void {
        try {
            const st = WV_GF.get(cv);
            if (!st) return;
            // The rows this lays the fold on (a later rebuild: _wvGfRowsReplaced).
            st.rows = cv._rows;
            const h = this._wvGfHeaderIndex(cv);
            if (h < 0) { st.stash = null; return; }
            const on = this._wvGfOn() && this._wvGfFilterEmpty(cv);
            const shown = this._wvGfBlockEnd(cv, h) > h + 1;
            if (shown) {
                if (on && st.collapsed) {
                    if (!this._wvGfSelectionInBlock(cv) && this._wvGfFold(cv, true, true, animate)) return;
                    st.collapsed = false;
                }
                const want = on;
                if (!!cv._rows[h].isOpen !== want) { cv._rows[h].isOpen = want; this._wvGfPaint(cv, h, false); }
                if (!this._wvGfOn()) this._wvGfClearAria(cv);
                return;
            }
            if (on && st.collapsed) return;
            return this._wvGfUnfold(cv, animate, on).then(() => { if (!this._wvGfOn()) this._wvGfClearAria(cv); });
        } catch (e) { Zotero.debug("[Weavero] group fold: sync err: " + e); }
    }

    async _wvGfSyncAll() {
        for (const w of wvMainWins()) {
            for (const cv of this._wvGfTreesOf(w)) {
                try { await this._wvGfSync(cv, false); } catch (e) {}
            }
        }
    }

    /** A group deleted while its row is out of the tree: a reload, the
     *  selection kept by id (Zotero's notify would throw, see the header). */
    async _wvGfReloadKeep(cv: any): Promise<void> {
        const sel = cv.selection;
        let ids: string[] = [];
        let focusedID: string | null = null;
        try {
            ids = Array.from((sel.selected || []) as Iterable<number>).map((i) => { const r = cv.getRow(i); return r && r.id; }).filter(Boolean);
            const fr = cv.getRow(sel.focused);
            focusedID = fr ? fr.id : null;
        } catch (e) {}
        const owner = !sel.selectEventsSuppressed;
        if (owner) sel.selectEventsSuppressed = true;
        try {
            await cv.refresh();
            let ok: any = false;
            if (typeof cv.restoreSelection === "function" && ids.length) {
                try { ok = await cv.restoreSelection(ids, { focusedID }); } catch (e) {}
            }
            else if (focusedID && cv.getRowIndexByID(focusedID) !== false) {
                try { ok = await cv.selectByID(focusedID, false); } catch (e) {}
            }
            if (!ok) { try { ok = await cv.selectLibrary(Zotero.Libraries.userLibraryID); } catch (e) {} }
            if (!ok) {
                for (let i = 0; i < cv._rows.length; i++) { if (cv.isSelectable(i)) { cv.selection.select(i); break; } }
            }
            if (cv.tree) cv.tree.invalidate();
            try { if (typeof cv.forceUpdate === "function") cv.forceUpdate(); } catch (e) {}
        }
        catch (e) { Zotero.debug("[Weavero] group fold: reload err: " + e); }
        finally { if (owner) sel.selectEventsSuppressed = false; }
    }

    /** The library row an added / modified collection or search goes under is
     *  in the tree (else Zotero's _addSortedRow throws). Unknown: yes. */
    _wvGfLibraryRowShown(cv: any, type: string, id: any): boolean {
        try {
            const o: any = type === "collection" ? Zotero.Collections.get(id) : Zotero.Searches.get(id);
            if (!o || o.libraryID == null) return true;
            return cv._rowMap["L" + o.libraryID] !== undefined;
        } catch (e) { return true; }
    }

    _wvGfGroupRowMissing(cv: any, ids: any[], extraData: any): boolean {
        try {
            return ids.some((id) => {
                const lib = extraData && extraData[id] && extraData[id].libraryID;
                return lib != null && cv._rowMap["L" + lib] === undefined;
            });
        } catch (e) { return false; }
    }

    // ---- wiring ----

    /** The window's CollectionTree class: every tree of the window refreshes
     *  through it, the first refresh of a new one included. */
    _wvGfWrapClass(proto: any, tag: string) {
        // 1.2.1-grpfold.1 and .2 laid the fold after `refresh`: a refresh
        // already running when the layer went on (the previous instance's)
        // passed it by (see _wvGfRowsReplaced). That layer goes.
        wvUnwrap(proto, "refresh", GF_LAYER);
        // Every rebuild of the rows: refresh assigns `_rows`, then calls this
        // through the instance (a lookup at call time, so a refresh that
        // started before the layer lands through it too).
        wvWrap(proto, "_refreshRowMap", GF_LAYER, tag, (orig: any) => function (this: any) {
            const r = orig.apply(this, arguments);
            try {
                const p: any = wvLivePlugin();
                if (p) {
                    const st = WV_GF.get(this);
                    const prev = st ? st.rows : null;
                    if (!st || prev !== this._rows) {
                        if (st) st.rows = this._rows;
                        p._wvGfRowsReplaced(this, prev);
                    }
                }
            } catch (e) {}
            // The collections funnel's marks (coll-funnel.ts: its "Nothing matches" message
            // follows the row count) at every change of the rows, in place ones included:
            // through this layer, never a second one of its own on the class.
            try { const p: any = wvLivePlugin(); if (p && typeof p._wvCfRowsChanged === "function") p._wvCfRowsChanged(this); } catch (e) {}
            return r;
        });
        const reveal = (member: string, kind: string) => wvWrap(proto, member, GF_LAYER, tag, (orig: any) => async function (this: any) {
            try { const p: any = wvLivePlugin(); if (p) await p._wvGfRevealFor(this, kind, arguments[0]); } catch (e) {}
            const r = await orig.apply(this, arguments);
            // A library the collections funnel left out of this tree, asked for by a navigation
            // (zotero://select links and Show Item in Library come through selectItems, below):
            // shown while it is selected (coll-funnel.ts _wvCfRevealLibrary; review 2026-11-28,
            // C). Never for a bare selectLibrary: the fallbacks probe with it (second review, 1).
            if (r === false && kind === "library") {
                try { const p: any = wvLivePlugin(); if (p && typeof p._wvCfRevealLibrary === "function") return await p._wvCfRevealLibrary(this, arguments[0]); } catch (e) {}
            }
            return r;
        });
        reveal("selectLibrary", "library");
        reveal("expandToCollection", "collection");
        reveal("expandLibrary", "libraries");
        // Zotero's selectItems -- a zotero://select link to an item, Show Item in Library, a new
        // item shown: the navigation during which the funnel shows a library it left out
        // (coll-funnel.ts _wvCfNavEnter; second review 2026-11-28, 1).
        wvWrap(proto, "selectItems", GF_LAYER, tag, (orig: any) => async function (this: any, itemIDs: any) {
            let leave: any = null;
            try {
                const p: any = wvLivePlugin();
                if (p && typeof p._wvCfNavEnter === "function") leave = p._wvCfNavEnter(this, p._wvCfItemLibs(itemIDs));
            } catch (e) {}
            try { return await orig.apply(this, arguments); }
            finally { if (leave) { try { leave(); } catch (e) {} } }
        });
        // A collection, saved search or Trash asked for by a navigation -- Zotero calls the first
        // two only for a zotero://select link (ZoteroProtocolHandler.mjs) and a sync conflict's
        // object, selectTrash from selectItems for a trashed item; Weavero for its links and
        // bookmark clicks -- that the collections funnel left out: shown while it is selected
        // (coll-funnel.ts _wvCfRevealFor; second review 2026-11-28, 3, 4, 6, 7).
        const navTo = (member: string, kind: string) => wvWrap(proto, member, GF_LAYER, tag, (orig: any) => async function (this: any) {
            const r = await orig.apply(this, arguments);
            if (r === false) {
                try { const p: any = wvLivePlugin(); if (p && typeof p._wvCfRevealFor === "function") return await p._wvCfRevealFor(this, kind, arguments[0]); } catch (e) {}
            }
            return r;
        });
        navTo("selectCollection", "collection");
        navTo("selectSearch", "search");
        navTo("selectTrash", "trash");
        // The notifications a row out of the tree would break (see the header).
        // On the class, under the collection select guard's layer of each
        // pane's tree (tabs.ts, which puts this one first): two layers of one
        // tree's own notify came in either order, by timing.
        wvWrap(proto, "notify", GF_LAYER, tag, (orig: any) => async function (this: any, action: any, type: any, ids: any, extraData: any) {
            const rest = Array.prototype.slice.call(arguments, 3);
            let list = ids;
            try {
                const p: any = wvLivePlugin();
                const st = WV_GF.get(this);
                // The collections funnel first (coll-funnel.ts _wvCfNotifyIds; review 2026-11-28,
                // B and H): an added row it hides never reaches Zotero, whose notify would move the
                // selection over the row it did not add; a library it left out is asked again.
                if (p && Array.isArray(list) && list.length && (type === "collection" || type === "search") && typeof p._wvCfNotifyIds === "function") {
                    list = p._wvCfNotifyIds(this, action, type, list, extraData);
                    if (!list.length) return;
                }
                if (p && st && Array.isArray(list) && list.length) {
                    if (st.collapsed) st.dirty = true;
                    if (type === "group" && action === "delete" && p._wvGfGroupRowMissing(this, list, extraData)) {
                        return await p._wvGfReloadKeep(this);
                    }
                    if ((type === "collection" || type === "search") && (action === "add" || action === "modify") && p._wvGfFilterEmpty(this)) {
                        const shown = list.filter((id: any) => p._wvGfLibraryRowShown(this, type, id));
                        if (shown.length !== list.length) {
                            if (!shown.length) return;
                            list = shown;
                        }
                    }
                }
            } catch (e) {}
            return list === ids ? orig.apply(this, arguments) : orig.call(this, action, type, list, ...rest);
        });
    }

    /** One pane tree: the line's toggle (Zotero's twisty and drag hover call
     *  toggleOpenState, a class field of each tree), the click on the line,
     *  the heading's isContainerEmpty answer. Idempotent (stamped layers and
     *  keys); run at every refresh. */
    _wvGfWireTree(cv: any) {
        const P: any = this;
        const tag = P._wvWireTag();
        // The hidden collections' layer (pane.ts), idempotent under this tag. Until
        // 2026-11-27 it was written again from Zotero's own whenever the slot was not
        // this instance's wrapper -- at every refresh: another plugin's isContainerEmpty
        // over it (Saved Search Folders 1.1) was dropped, its folders drew no twisty (F1).
        try { P._wvHidWrapContainerEmpty(cv, tag); } catch (e) {}
        // An own property of each tree (a class field): restored at teardown.
        wvWrap(cv, "toggleOpenState", GF_LAYER, tag, (orig: any) => function (this: any, index: any) {
            try { const p: any = wvLivePlugin(); if (p && p._wvGfIsFoldHeader(cv, index)) return p._wvGfToggle(cv, true); } catch (e) {}
            return orig.apply(this, arguments);
        });
        // Every layer of Weavero's on this tree: this instance's stub back where
        // another plugin's shutdown put an older one back -- after a Weavero reload, the
        // previous instance's (lib/wrap.ts wvWrapSettle, 2026-11-27, F3). Its rebuild
        // refreshes the tree, which lands here.
        try { wvWrapSettle(cv); } catch (e) {}
        this._wvGfSyncProps(cv);
        const el = cv.domEl;
        if (!el) return;
        const rowAt = (target: any): number => {
            try {
                const row = target && target.closest ? target.closest(".row") : null;
                const pre = String(cv.id) + "-row-";
                const id = row ? String(row.id || "") : "";
                if (!id.startsWith(pre)) return -1;
                const i = parseInt(id.slice(pre.length), 10);
                return isNaN(i) ? -1 : i;
            } catch (e) { return -1; }
        };
        // The line is not selectable: Zotero's row handlers do nothing there.
        // A press then a release on the line is a click on it. The twisty's own
        // mousedown and mouseup stop there (renderItem), so a click on the
        // twisty toggles once, through toggleOpenState.
        wvListen(el, "grpfold:down", "mousedown", (e: any) => {
            try {
                const p: any = wvLivePlugin();
                const st = WV_GF.get(cv);
                if (!p || !st) return;
                st.press = 0;
                if (e.button !== 0 || (Zotero.isMac && e.ctrlKey)) return;
                const i = rowAt(e.target);
                if (i >= 0 && p._wvGfIsFoldHeader(cv, i)) st.press = Date.now();
            } catch (err) {}
        }, false, tag);
        wvListen(el, "grpfold:up", "mouseup", (e: any) => {
            try {
                const p: any = wvLivePlugin();
                const st = WV_GF.get(cv);
                if (!p || !st || !st.press) return;
                const t = st.press;
                st.press = 0;
                if (e.button !== 0 || Date.now() - t > 3000) return;
                const i = rowAt(e.target);
                if (i >= 0 && p._wvGfIsFoldHeader(cv, i)) p._wvGfToggle(cv, true);
            } catch (err) {}
        }, false, tag);
    }

    /** The virtualized tree draws each row's twisty, aria-expanded and the
     *  twisty's own click from its PROPS -- `isContainerEmpty`,
     *  `isContainerOpen`, `onToggleOpenState` -- which CollectionTree.render
     *  passes as they were at its last render (virtualized-table.jsx
     *  VirtualizedTree _addIndentAndTwisty / _setRowAria / toggleOpenState;
     *  Zotero 10 and 11). A wrap of the tree's own member reaches them only at
     *  its next render: after a hot install over a built tree no render came,
     *  the props kept the previous build's isContainerEmpty and the line drew
     *  a spacer (citations.35 on MJT's 11.0-beta.5, 2026-11-22; the runner's
     *  tree had re-rendered on a group notification). Re-render when they
     *  differ, then redraw the rows; teardown does the same, so no Weavero
     *  function stays in the props. */
    _wvGfSyncProps(cv: any) {
        try {
            const props = cv && cv.tree && cv.tree.props;
            if (!props || typeof cv.forceUpdate !== "function") return;
            if (props.isContainerEmpty === cv.isContainerEmpty && props.onToggleOpenState === cv.toggleOpenState) return;
            cv.forceUpdate(() => { try { if (cv.tree) cv.tree.invalidate(); } catch (e) {} });
        } catch (e) { Zotero.debug("[Weavero] group fold: props err: " + e); }
    }

    /** Every pane tree of `win`: each library view's on a Zotero with its own
     *  windows, else the pane's. */
    _wvGfTreesOf(win: any): any[] {
        const out: any[] = [];
        const add = (cv: any) => { if (cv && typeof cv.getRow === "function" && !out.includes(cv)) out.push(cv); };
        for (const v of wvLibraryViews(win)) { try { add(v.collectionsView); } catch (e) {} }
        try { add(win && win.ZoteroPane && win.ZoteroPane.collectionsView); } catch (e) {}
        return out;
    }

    /** A tree built before the class layer (an enable, a reload, the window
     *  open at startup): wired, then folded per its state once loaded. */
    _wvGfAdopt(cv: any) {
        try {
            if (!this._wvGfIsPaneTree(cv)) return;
            const st = this._wvGfStateOf(cv, true, "adopt") as WvGfState;
            this._wvGfWireTree(cv);
            st.adopting = true;
            const after = () => {
                st.adopting = false;
                const p: any = wvLivePlugin();
                if (p) p._wvGfSync(cv, false);
            };
            let w: any = null;
            try { w = typeof cv.waitForLoad === "function" ? cv.waitForLoad() : null; } catch (e) {}
            if (w && typeof w.then === "function") w.then(after, () => {});
            else after();
        } catch (e) { Zotero.debug("[Weavero] group fold: adopt err: " + e); }
    }

    /** The class layer on main window `win` (its own loader's CollectionTree).
     *  Also from the early window listener (tabs.ts _wvWireEarlyRestoreTracing,
     *  a main window's DOMContentLoaded): before its pane builds a tree, so
     *  the first refresh folds -- on Zotero 11 onMainWindowLoad comes only
     *  once the window's first library view has loaded. */
    _wvGfWrapWindowClass(win: any) {
        try {
            if (!win || win.closed || typeof win.require !== "function") return;
            const CT: any = win.require("zotero/collectionTree");
            if (CT && CT.prototype && typeof CT.prototype.refresh === "function") this._wvGfWrapClass(CT.prototype, (this as any)._wvWireTag());
        } catch (e) { Zotero.debug("[Weavero] group fold: class layer err: " + e); }
    }

    /** Wiring-table entry "group-fold": the window's class layer, then the
     *  trees already there (each library tab's on its activation, perView). */
    _wvGfWire(win: any) {
        try {
            if (!win || win.closed) return;
            this._wvGfWrapWindowClass(win);
            for (const cv of this._wvGfTreesOf(win)) this._wvGfAdopt(cv);
        } catch (e) { Zotero.debug("[Weavero] _wvGfWire err: " + e); }
    }

    /** destroy(): every layer and listener off, the folded rows back, the
     *  line as Zotero draws it. Synchronous but for a tree whose rows changed
     *  while folded (a reload, the selection kept by id): the promise. */
    _wvGfTeardown(): Promise<any> {
        const jobs: Promise<any>[] = [];
        for (const w of wvMainWins()) {
            try {
                const CT: any = typeof w.require === "function" ? w.require("zotero/collectionTree") : null;
                if (CT && CT.prototype) for (const m of GF_CLASS_MEMBERS) wvUnwrap(CT.prototype, m, GF_LAYER);
            } catch (e) {}
            for (const cv of this._wvGfTreesOf(w)) {
                try {
                    for (const m of GF_TREE_MEMBERS) wvUnwrap(cv, m, GF_LAYER);
                    if (cv.domEl) { wvUnlisten(cv.domEl, "grpfold:down"); wvUnlisten(cv.domEl, "grpfold:up"); }
                    // The heading's isContainerEmpty answer rides the hidden
                    // collections' wrapper, which this wiring puts on every
                    // library tab's tree; the hidden collections' own teardown
                    // reaches the tab on screen only.
                    try { (this as any)._wvHidUnwrapContainerEmpty(cv); } catch (e) {}
                    // Zotero's own members back in the virtualized tree's props.
                    this._wvGfSyncProps(cv);
                    const st = WV_GF.get(cv);
                    WV_GF.delete(cv);
                    const h = this._wvGfHeaderIndex(cv);
                    if (h < 0) continue;
                    let whole = this._wvGfBlockEnd(cv, h) > h + 1;
                    if (!whole && st && st.stash && st.stash.length) {
                        const k = st.stash.length;
                        cv._rows.splice(h + 1, 0, ...st.stash);
                        const sel = cv.selection;
                        if (sel && sel.selected && typeof sel.selected.clear === "function") {
                            const moved = Array.from(sel.selected as Iterable<number>).map((i) => (i > h ? i + k : i));
                            sel.selected.clear();
                            for (const i of moved) sel.selected.add(i);
                            if (sel.focused > h) sel.focused += k;
                            if (sel.pivot > h) sel.pivot += k;
                        }
                        try { cv._refreshRowMap(); } catch (e) {}
                        whole = true;
                    }
                    cv._rows[h].isOpen = false;
                    if (cv.tree) cv.tree.invalidate();
                    this._wvGfClearAria(cv);
                    if (!whole || (st && st.dirty)) jobs.push(this._wvGfReloadKeep(cv).then(() => this._wvGfClearAria(cv)));
                } catch (e) { Zotero.debug("[Weavero] group fold: teardown err: " + e); }
            }
        }
        return Promise.all(jobs).catch(() => {});
    }
}

const _gfDescriptors = Object.getOwnPropertyDescriptors(_GroupFoldMixin.prototype);
delete (_gfDescriptors as any).constructor;
export const groupFoldMethods = _gfDescriptors;
