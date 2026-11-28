// Module: search-folders -- folders for saved searches, in place, kept by Weavero.
//
// MJT 2026-11-27: "I would like to make a similar thing in Weavero [as the Saved
// Search Folders plugin], but without touching the data itself. As a test to see
// if I will keep this solution later." His picks: one structure for every window
// and session, which folders are open kept per session; the plugin's "A/B/C" names
// read too; drag onto a folder, Move to Folder, a folder menu; alphabetical; the
// folders in place, where Zotero lists a library's saved searches.
//
// - The folders and where each search was filed: <data dir>/weavero/search-folders.json,
//   by library ("u", "g<groupID>") and by saved-search KEY. Nothing is written to any
//   library: without Weavero, Zotero's flat list.
// - Drawing: after Zotero adds a library's rows (`_expandRow`, a layer on the window's
//   CollectionTree class, as group-fold.ts lays its own), the library's saved-search
//   rows are regrouped under folder rows: Zotero 'header' rows (as its "Group
//   Libraries" heading: not selectable, never written to `sourceList.persist`, which
//   keeps containers only), their ref's libraryID -1 so Zotero's collection filter
//   takes them for a heading, Weavero's own data under `ref.wvSf`. The tree's own
//   search rows are reused; a search placed by its name shows its last segment
//   (`getName`, which Zotero's renderItem, tab title and type-to-find read).
// - A folder opens on its twisty (`toggleOpenState`, a layer on each tree, beside
//   the Group Libraries fold's) or a click on its line; which are closed is kept
//   per WINDOW (`win._wvSfClosed`) and saved with the window in a session
//   (sessions.ts `sfOpen`, as `hiddenColl`). Everything open by default.
// - Filing: drag saved searches onto a folder (onto the library's row: out of any
//   folder); right-click a search: Move to Folder; right-click a folder: New
//   Subfolder, Rename, Move Folder To, Delete (its searches go back unfiled).
// - The Saved Search Folders plugin enabled: Weavero's folders stand down (both
//   regroup the same rows).
// - Teardown: the layers and listeners off, each tree rebuilt flat.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.
// Guard: test/search-folders.spec.js.

import { wvLivePlugin } from "../lib/live";
import { wvWrap, wvUnwrap, wvWrapLayers } from "../lib/wrap";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvMainWins, wvLibraryViews } from "../lib/windows";
import { wvStorePath, wvStoreRead, wvStoreWrite } from "../lib/store";
import { wvStr, wvL10n } from "../lib/l10n";
import { wvMenuItem, wvMenuSeparator } from "../lib/menu";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { winOf } from "../lib/dom";
import { wvTimeout } from "../lib/timers";
import { wvSfBuildTree, wvSfFlatFolders, wvSfChainOf, wvSfIsUnder, WvSfLibStore, WvSfNode, WvSfSearchIn } from "../lib/search-folders";

declare const Zotero: any;
declare const Services: any;
declare const ChromeUtils: any;

const SF_LAYER = "srchfold";
const SF_FILE = "search-folders.json";
const SF_PREF = "collectionsSearchFolders";
const SF_PREF_NAMES = "collectionsSearchFoldersNames";
const SF_STYLE_ID = "wv-sf-styles";
const SF_MENU_ID = "wv-sf-folder-menu";
const SF_ROW = "WVSF";
/** A search filed at the library's top level on purpose (it overrides a name path). */
export const WV_SF_ROOT = "@root";
const SF_FOREIGN_ID = "saved-search-folders@nickynoname.github.io";
const SF_CLASS_MEMBERS = ["_expandRow", "_refreshRowMap", "getIconName", "selectByID", "expandLibrary", "notify", "onDragOver", "onDrop"];
const SF_TREE_MEMBERS = ["toggleOpenState"];

// Zotero's collection glyph in the saved-search colour, as the Saved Search Folders
// plugin draws its folders (collection-tree/16/{light,dark}/search.svg fill #59ADC4).
const SF_CSS = `
#zotero-collections-pane .icon-css.icon-wv-search-folder {
    background: #59ADC4 !important;
    mask: url("chrome://zotero/skin/collection-tree/16/light/collection.svg") center / 16px 16px no-repeat;
}
@media (prefers-color-scheme: dark) {
    #zotero-collections-pane .icon-css.icon-wv-search-folder { background: #59adc4e5 !important; }
}
`;

interface WvSfTreeState {
    /** libraryID -> the tree the last regroup drew (its folder rows hold their nodes). */
    trees: Map<number, WvSfNode>;
    /** A primary press on a folder line (ms), for the click on release. */
    press: number;
    /** The reload under way, and whether another was asked for meanwhile. */
    reloading: Promise<void> | null;
    again: boolean;
    /** The reload the next pass runs instead of _wvGfReloadKeep (the collections funnel's,
     *  coll-funnel.ts, which keeps a selection that left on its library). */
    run: ((cv: any) => Promise<void>) | null;
    /** The tree's own layer and listeners on (_wvSfWireTree). */
    wired: boolean;
    /** Rows built before the class layers were redrawn once (_wvSfAdopt). */
    adopted: boolean;
}

const WV_SF: WeakMap<any, WvSfTreeState> = new WeakMap();

function sfState(cv: any): WvSfTreeState {
    let st = WV_SF.get(cv);
    if (!st) { st = { trees: new Map(), press: 0, reloading: null, again: false, run: null, wired: false, adopted: false }; WV_SF.set(cv, st); }
    return st;
}

/** A library's key in the store: stable across machines for a group. */
export function wvSfLibKey(libraryID: number): string {
    try {
        const lib = Zotero.Libraries.get(libraryID);
        if (lib && lib.libraryType === "user") return "u";
        if (lib && lib.libraryType === "group") return "g" + Zotero.Groups.getGroupIDFromLibraryID(libraryID);
    } catch (e) {}
    return "l" + libraryID;
}

function rowAt(cv: any, target: any): number {
    try {
        const row = target && target.closest ? target.closest(".row") : null;
        const pre = String(cv.id) + "-row-";
        const id = row ? String(row.id || "") : "";
        if (!id.startsWith(pre)) return -1;
        const i = parseInt(id.slice(pre.length), 10);
        return isNaN(i) ? -1 : i;
    } catch (e) { return -1; }
}

class _SearchFoldersMixin {
    [k: string]: any;

    // ---- on / off ----

    /** On under Extras, its own setting, and not while the Saved Search Folders plugin runs. */
    _wvSfOn(): boolean {
        try { return !!this._wvPref(SF_PREF) && !this._wvSfForeign; } catch (e) { return false; }
    }

    _wvSfNamesOn(): boolean {
        try { return !!this._wvPref(SF_PREF_NAMES); } catch (e) { return false; }
    }

    // ---- the store ----

    _wvSfPath(): string { return wvStorePath(SF_FILE); }

    /** Load once (every window waits on the same promise), then redraw the trees. */
    _wvSfLoad(): Promise<void> {
        if (this._wvSfLoading) return this._wvSfLoading;
        this._wvSfLoading = (async () => {
            let doc: any = null;
            try {
                const r = await wvStoreRead(this._wvSfPath());
                if (r.status === "ok") doc = r.doc;
            } catch (e) { Zotero.debug("[Weavero] search folders: load err: " + e); }
            if (this._wvDestroyed) return;
            if (!doc || typeof doc !== "object" || !doc.libs || typeof doc.libs !== "object") doc = { version: 1, libs: {} };
            this._wvSfDoc = doc;
            if (Object.keys(doc.libs).length) this._wvSfRefreshAll();
        })();
        return this._wvSfLoading;
    }

    /** One library's part of the store (`create`: made when absent). */
    _wvSfLib(libraryID: number, create: boolean): WvSfLibStore | null {
        const doc = this._wvSfDoc;
        if (!doc) return null;
        const k = wvSfLibKey(libraryID);
        let s = doc.libs[k];
        if (!s && create) s = doc.libs[k] = { folders: {}, assign: {} };
        if (s) {
            if (!s.folders || typeof s.folders !== "object") s.folders = {};
            if (!s.assign || typeof s.assign !== "object") s.assign = {};
        }
        return s || null;
    }

    _wvSfPersist(): Promise<void> {
        try {
            const doc = this._wvSfDoc;
            if (!doc) return Promise.resolve();
            for (const k of Object.keys(doc.libs)) {
                const s = doc.libs[k];
                if (s && !Object.keys(s.folders || {}).length && !Object.keys(s.assign || {}).length) delete doc.libs[k];
            }
            return wvStoreWrite(this._wvSfPath(), doc).catch((e: any) => Zotero.debug("[Weavero] search folders: write err: " + e));
        } catch (e) { return Promise.resolve(); }
    }

    // ---- edits (each persists, then redraws every tree) ----

    _wvSfNewFolder(libraryID: number, name: string, parent: string | null): string | null {
        const s = this._wvSfLib(libraryID, true);
        const n = String(name || "").trim();
        if (!s || !n) return null;
        let fid = "";
        do { fid = "f" + Math.random().toString(36).slice(2, 10); } while (s.folders[fid]);
        s.folders[fid] = { name: n, parent: parent && s.folders[parent] ? parent : null };
        this._wvSfChanged();
        return fid;
    }

    _wvSfRenameFolder(libraryID: number, fid: string, name: string): boolean {
        const s = this._wvSfLib(libraryID, false);
        const n = String(name || "").trim();
        if (!s || !s.folders[fid] || !n) return false;
        s.folders[fid].name = n;
        this._wvSfChanged();
        return true;
    }

    /** Move folder `fid` under `parent` (null: the top). Refused into its own subtree. */
    _wvSfMoveFolder(libraryID: number, fid: string, parent: string | null): boolean {
        const s = this._wvSfLib(libraryID, false);
        if (!s || !s.folders[fid]) return false;
        if (parent && (!s.folders[parent] || wvSfIsUnder(s, parent, fid))) return false;
        s.folders[fid].parent = parent;
        this._wvSfChanged();
        return true;
    }

    /** Delete folder `fid` and its subfolders; their searches go back unfiled. */
    _wvSfDeleteFolder(libraryID: number, fid: string): boolean {
        const s = this._wvSfLib(libraryID, false);
        if (!s || !s.folders[fid]) return false;
        const gone = new Set(Object.keys(s.folders).filter((f) => wvSfIsUnder(s, f, fid)));
        for (const f of gone) delete s.folders[f];
        for (const k of Object.keys(s.assign)) if (gone.has(s.assign[k])) delete s.assign[k];
        this._wvSfChanged();
        return true;
    }

    /** File searches into folder `fid` -- WV_SF_ROOT: the top on purpose; null: wherever
     *  their names put them (the filing forgotten). */
    _wvSfAssign(searches: any[], fid: string | null): boolean {
        let changed = false;
        for (const search of searches) {
            if (!search || !search.key) continue;
            const s = this._wvSfLib(search.libraryID, true);
            if (!s) continue;
            if (fid && fid !== WV_SF_ROOT && !s.folders[fid]) continue;
            if (fid) { if (s.assign[search.key] !== fid) { s.assign[search.key] = fid; changed = true; } }
            else if (s.assign[search.key] != null) { delete s.assign[search.key]; changed = true; }
        }
        if (changed) this._wvSfChanged();
        return changed;
    }

    /** A folder of Weavero's at `path` (display names from the top), made where missing:
     *  filing into a folder read from names makes it Weavero's own, same name, same place. */
    _wvSfEnsurePath(libraryID: number, path: string[]): string | null {
        const s = this._wvSfLib(libraryID, true);
        if (!s) return null;
        let parent: string | null = null;
        let made = false;
        for (const name of path) {
            let fid: string | null = Object.keys(s.folders).find((f) => s.folders[f].parent === parent && s.folders[f].name === name) || null;
            if (!fid) {
                do { fid = "f" + Math.random().toString(36).slice(2, 10); } while (s.folders[fid]);
                s.folders[fid] = { name, parent };
                made = true;
            }
            parent = fid;
        }
        if (made) this._wvSfChanged();
        return parent;
    }

    /** After every edit: written, and every pane tree redrawn. The generation counts
     *  the edits: rows drawn from an older store (a refresh started before the edit and
     *  finished after Weavero's redraw) carry an older one and are drawn again
     *  (_refreshRowMap's layer). */
    _wvSfChanged() {
        this._wvSfGen = (this._wvSfGen || 0) + 1;
        this._wvSfPersist();
        this._wvSfRefreshAll();
    }

    // ---- open / closed, per window ----

    _wvSfOpenKey(libraryID: number, nodeKey: string): string { return wvSfLibKey(libraryID) + "|" + nodeKey; }

    _wvSfIsOpen(win: any, libraryID: number, nodeKey: string): boolean {
        try { return !(win && win._wvSfClosed && win._wvSfClosed.has(this._wvSfOpenKey(libraryID, nodeKey))); } catch (e) { return true; }
    }

    _wvSfSetOpen(win: any, libraryID: number, nodeKey: string, open: boolean) {
        if (!win) return;
        if (!win._wvSfClosed) win._wvSfClosed = new Set<string>();
        const k = this._wvSfOpenKey(libraryID, nodeKey);
        if (open) win._wvSfClosed.delete(k);
        else win._wvSfClosed.add(k);
    }

    /** A window's closed folders for its session record; undefined when all are open. */
    _wvSfCapture(win: any): string[] | undefined {
        try {
            const s: Set<string> | undefined = win && win._wvSfClosed;
            return s && s.size ? Array.from(s) : undefined;
        } catch (e) { return undefined; }
    }

    /** A session's closed folders back on window `win`, its trees redrawn. */
    _wvSfRestore(win: any, closed: any) {
        try {
            if (!win || win.closed) return;
            win._wvSfClosed = new Set<string>(Array.isArray(closed) ? closed.filter((x: any) => typeof x === "string") : []);
            this._wvSfRefreshWin(win);
        } catch (e) { Zotero.debug("[Weavero] search folders: restore err: " + e); }
    }

    // ---- rows ----

    _wvSfIsFolderRow(row: any): boolean {
        return !!(row && row.type === "header" && row.ref && row.ref.wvSf);
    }

    _wvSfIsFolderAt(cv: any, index: number): boolean {
        try { return this._wvSfIsFolderRow(cv.getRow(index)); } catch (e) { return false; }
    }

    /** The pane's isContainerEmpty answer for a folder row (pane.ts _wvHidWrapContainerEmpty asks); null for any other row. */
    _wvSfContainerEmpty(cv: any, index: number): boolean | null {
        try {
            const row = cv.getRow(index);
            if (!this._wvSfIsFolderRow(row)) return null;
            const n: WvSfNode = row.ref.wvSf.node;
            return !(n.folders.length || n.searches.length);
        } catch (e) { return null; }
    }

    _wvSfFolderRow(cv: any, libraryID: number, node: WvSfNode, level: number, filtering: boolean): any {
        const id = SF_ROW + libraryID + ":" + node.key;
        const ref: any = { id, libraryID: -1, label: node.name, name: node.name, wvSf: { libraryID, node } };
        const row: any = new Zotero.CollectionTreeRow(cv, "header", ref, level);
        Object.defineProperty(row, "id", { value: id, configurable: true });
        row.isOpen = filtering || this._wvSfIsOpen(winOf(cv.domEl), libraryID, node.key);
        return row;
    }

    /** The rows of `node`'s content at `level`: each folder (and, open, what it holds),
     *  then its searches -- the tree's own rows when it has them (`byId`). */
    _wvSfRows(cv: any, libraryID: number, node: WvSfNode, level: number, filtering: boolean, byId: Map<number, any> | null): any[] {
        const out: any[] = [];
        for (const f of node.folders) {
            const r = this._wvSfFolderRow(cv, libraryID, f, level, filtering);
            out.push(r);
            if (r.isOpen) out.push(...this._wvSfRows(cv, libraryID, f, level + 1, filtering, byId));
        }
        for (const e of node.searches) {
            let r = byId ? byId.get(e.search.id) : null;
            if (!r) r = new Zotero.CollectionTreeRow(cv, "search", e.search.obj, level);
            r.level = level;
            if (e.label !== String(e.search.name)) {
                const label = e.label;
                r.getName = () => label;
            }
            out.push(r);
        }
        return out;
    }

    /** After Zotero's `_expandRow(rows, row)` added `count` rows under a library: its
     *  saved searches regrouped under their folders. Returns the new count. */
    _wvSfRegroup(cv: any, rows: any[], row: number, count: number): number {
        try {
            if (!count || !this._wvSfOn() || !this._wvGfIsPaneTree(cv)) return count;
            const lr = rows[row];
            if (!lr || typeof lr.isLibrary !== "function" || !lr.isLibrary(true) || (typeof lr.isFeed === "function" && lr.isFeed())) return count;
            const libraryID = lr.ref.libraryID;
            // The store generation these rows are drawn from (see _wvSfChanged).
            try { (rows as any)._wvSfGen = this._wvSfGen || 0; } catch (e) {}
            // Hidden in this window by the collections funnel: the flat list (coll-funnel.ts).
            if (this._wvSfOffHere(cv)) { sfState(cv).trees.delete(libraryID); return count; }
            const level = lr.level + 1;
            const end = Math.min(rows.length - 1, row + count);
            let first = -1, last = -1;
            for (let i = row + 1; i <= end; i++) {
                const r = rows[i];
                if (r && r.level === level && r.isSearch()) { if (first < 0) first = i; last = i; }
            }
            const store = this._wvSfLib(libraryID, false);
            const hasLocal = !!(store && Object.keys(store.folders).length);
            if (first < 0 && !hasLocal) return count;
            const filtering = typeof cv._isFilterEmpty === "function" ? !cv._isFilterEmpty() : false;
            const found = first < 0 ? [] : rows.slice(first, last + 1).filter((r: any) => r.isSearch());
            const searches: WvSfSearchIn[] = found.map((r: any) => ({ id: r.ref.id, key: r.ref.key, name: String(r.ref.name || ""), obj: r.ref }));
            const cmp = (a: string, b: string) => { try { return Zotero.localeCompare(a, b); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; } };
            const tree = wvSfBuildTree(searches, store, this._wvSfNamesOn(), !filtering, cmp);
            sfState(cv).trees.set(libraryID, tree);
            if (!tree.folders.length) return count;
            // Where: the searches' block; none shown, before the library's first row at
            // this level that is not a collection (My Publications, Duplicate Items, ...).
            let at = first, n = first < 0 ? 0 : last - first + 1;
            if (first < 0) {
                at = end + 1;
                for (let i = row + 1; i <= end; i++) {
                    const r = rows[i];
                    if (r && r.level === level && !r.isCollection()) { at = i; break; }
                }
            }
            const byId = new Map<number, any>(found.map((r: any) => [r.ref.id, r]));
            const out = this._wvSfRows(cv, libraryID, tree, level, filtering, byId);
            rows.splice(at, n, ...out);
            return count - n + out.length;
        } catch (e) {
            Zotero.debug("[Weavero] search folders: regroup err: " + e);
            return count;
        }
    }

    /** Open or close the folder at `index` (`open` undefined: the other way), the
     *  selection kept by id -- on a row now inside a closed folder, the library. */
    _wvSfToggle(cv: any, index: number, open?: boolean) {
        try {
            const row = cv.getRow(index);
            if (!this._wvSfIsFolderRow(row)) return;
            if (open === undefined) open = !row.isOpen;
            if (open === !!row.isOpen) return;
            const sel = cv.selection;
            let focusedID: any = null;
            let selectedIDs: any[] = [];
            try {
                const fr = cv.getRow(sel.focused);
                focusedID = fr ? fr.id : null;
                selectedIDs = Array.from((sel.selected || []) as Iterable<number>).map((i) => { const r = cv.getRow(i); return r && r.id; }).filter(Boolean);
            } catch (e) {}
            const was = sel.selectEventsSuppressed;
            sel.selectEventsSuppressed = true;
            const { libraryID, node } = row.ref.wvSf;
            if (row.isOpen) {
                let e = index + 1;
                while (e < cv._rows.length && cv._rows[e].level > row.level) e++;
                cv._rows.splice(index + 1, e - index - 1);
                row.isOpen = false;
            }
            else {
                cv._rows.splice(index + 1, 0, ...this._wvSfRows(cv, libraryID, node, row.level + 1, false, null));
                row.isOpen = true;
            }
            if (typeof cv._isFilterEmpty !== "function" || cv._isFilterEmpty()) this._wvSfSetOpen(winOf(cv.domEl), libraryID, node.key, row.isOpen);
            cv._refreshRowMap();
            let selected = selectedIDs.map((id) => cv._rowMap[id]).filter((i) => i !== undefined);
            let changed = false;
            if (!selected.length && selectedIDs.length) {
                const li = cv._rowMap["L" + libraryID];
                selected = [li !== undefined ? li : 0];
                changed = true;
            }
            let focused = focusedID != null ? cv._rowMap[focusedID] : undefined;
            if (focused === undefined) focused = selected[selected.length - 1];
            if (selected.length) {
                sel.selected = new Set(selected);
                sel.focused = focused;
                sel.pivot = focused;
            }
            sel.selectEventsSuppressed = was;
            if (cv.tree) cv.tree.invalidate();
            // The selected search went into the closed folder: the library is selected, and
            // the items list follows it.
            if (changed && !was) { try { sel.select(selected[0]); } catch (e) {} }
        } catch (e) { Zotero.debug("[Weavero] search folders: toggle err: " + e); }
    }

    /** Open the folders holding saved search `search` in tree `cv`. */
    async _wvSfReveal(cv: any, search: any) {
        try {
            const tree = sfState(cv).trees.get(search.libraryID);
            if (!tree) return;
            const chain = wvSfChainOf(tree, search.key);
            if (!chain) return;
            for (const f of chain) {
                const i = cv._rowMap[SF_ROW + search.libraryID + ":" + f.key];
                if (i === undefined) return;
                if (!cv.getRow(i).isOpen) this._wvSfToggle(cv, i, true);
            }
        } catch (e) { Zotero.debug("[Weavero] search folders: reveal err: " + e); }
    }

    /** Every folder of library `libraryID` open in tree `cv` (Zotero's "+" key). */
    _wvSfOpenAll(cv: any, libraryID: number) {
        try {
            for (let i = 0; i < cv._rows.length; i++) {
                const r = cv.getRow(i);
                if (this._wvSfIsFolderRow(r) && r.ref.wvSf.libraryID === libraryID && !r.isOpen) this._wvSfToggle(cv, i, true);
            }
        } catch (e) {}
    }

    // ---- redraw ----

    /** The pane trees of window `win`. */
    _wvSfTreesOf(win: any): any[] {
        const out: any[] = [];
        try {
            for (const cv of this._wvGfTreesOf(win)) if (this._wvGfIsPaneTree(cv)) out.push(cv);
        } catch (e) {}
        return out;
    }

    /** Tree `cv` rebuilt, its selection kept -- one reload at a time: one asked for while
     *  another runs comes once more after it (two overlapping refreshes of one tree left
     *  neither's rows, paneorg.1 live 2026-11-27). Every caller that refreshes a pane tree
     *  goes through this queue; `run`, the reload to run instead of _wvGfReloadKeep (the
     *  collections funnel's, coll-funnel.ts). */
    _wvSfReload(cv: any, run?: (cv: any) => Promise<void>): Promise<void> {
        const st = sfState(cv);
        if (run) st.run = run;
        if (st.reloading) { st.again = true; return st.reloading; }
        const P: any = this;
        st.reloading = (async () => {
            try {
                do {
                    st.again = false;
                    const r = st.run;
                    st.run = null;
                    try { await (r ? r(cv) : P._wvGfReloadKeep(cv)); } catch (e) {}
                } while (st.again && !P._wvDestroyed);
            }
            finally { st.reloading = null; }
        })();
        return st.reloading;
    }

    /** The collections funnel's folders chip hides the folders in this tree's window -- or it
     *  hides the saved searches themselves: no folder to draw them in (review 2026-11-28, I:
     *  the local folders were drawn empty, keepEmpty being on without a search text). */
    _wvSfOffHere(cv: any): boolean {
        try {
            const win = winOf(cv.domEl);
            if (typeof this._wvCfFoldersOff === "function" && this._wvCfFoldersOff(win)) return true;
            return typeof this._wvCfSearchesOff === "function" && !!this._wvCfSearchesOff(win);
        } catch (e) { return false; }
    }

    _wvSfRefreshWin(win: any) {
        for (const cv of this._wvSfTreesOf(win)) {
            try { this._wvSfReload(cv); } catch (e) {}
        }
    }

    /** Every pane tree redrawn once for a burst of edits (New Folder then the filing). */
    _wvSfRefreshAll() {
        if (this._wvSfRefreshPending) return;
        this._wvSfRefreshPending = true;
        wvTimeout(() => {
            const p: any = wvLivePlugin();
            if (!p) return;
            p._wvSfRefreshPending = false;
            for (const w of wvMainWins()) p._wvSfRefreshWin(w);
        }, 30);
    }

    // ---- drag and drop ----

    /** Where a drop of saved searches on row `index` files them: { libraryID, fid }
     *  (WV_SF_ROOT on the library's row, for searches now in a folder), or null. */
    _wvSfDropTarget(cv: any, index: number, dt: any): { libraryID: number; fid: string | null; path: string[] | null; ids: number[] } | null {
        try {
            if (!dt || !Array.from(dt.types || []).includes("zotero/search")) return null;
            const row = cv.getRow(index);
            if (!row) return null;
            const ids = String(dt.getData("zotero/search") || "").split(",").map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));
            const searches = ids.map((id) => { try { return Zotero.Searches.get(id); } catch (e) { return null; } }).filter(Boolean);
            if (!searches.length) return null;
            if (this._wvSfIsFolderRow(row)) {
                const { libraryID, node } = row.ref.wvSf;
                if (searches.some((s: any) => s.libraryID !== libraryID)) return null;
                return { libraryID, fid: node.fid, path: node.local ? null : node.path, ids };
            }
            if (typeof row.isLibrary === "function" && row.isLibrary(true) && !(typeof row.isFeed === "function" && row.isFeed())) {
                const libraryID = row.ref.libraryID;
                if (searches.some((s: any) => s.libraryID !== libraryID)) return null;
                const tree = sfState(cv).trees.get(libraryID);
                if (!tree || !searches.some((s: any) => wvSfChainOf(tree, s.key))) return null;
                return { libraryID, fid: WV_SF_ROOT, path: null, ids };
            }
        } catch (e) {}
        return null;
    }

    /** Zotero's onDragOver, first: true when the drag is Weavero's (saved searches over
     *  a folder, or out of folders over their library). */
    _wvSfDragOver(cv: any, event: any, index: number): boolean {
        try {
            if (!this._wvSfOn() || !this._wvGfIsPaneTree(cv) || this._wvSfOffHere(cv)) return false;
            if (!event.currentTarget || !event.currentTarget.classList || !event.currentTarget.classList.contains("row")) return false;
            const dt = event.dataTransfer;
            if (!dt || !Array.from(dt.types || []).includes("zotero/search")) return false;
            const target = this._wvSfDropTarget(cv, index, dt);
            const prev = cv._dropRow;
            if (!target) {
                if (!this._wvSfIsFolderRow(cv.getRow(index))) return false;
                event.preventDefault();
                dt.dropEffect = "none";
                return true;
            }
            event.preventDefault();
            dt.dropEffect = "move";
            cv._dropRow = index;
            try { if (prev != null && prev !== index) cv.tree.invalidateRow(prev); cv.tree.invalidateRow(index); } catch (e) {}
            return true;
        } catch (e) { return false; }
    }

    /** Zotero's onDrop, first: files the dragged searches. True when it was Weavero's. */
    _wvSfDrop(cv: any, event: any, index: number): boolean {
        try {
            if (!this._wvSfOn() || !this._wvGfIsPaneTree(cv) || this._wvSfOffHere(cv)) return false;
            const target = this._wvSfDropTarget(cv, index, event.dataTransfer);
            if (!target) return false;
            try { event.preventDefault(); } catch (e) {}
            const prev = cv._dropRow;
            cv._dropRow = null;
            try { if (prev != null) cv.tree.invalidateRow(prev); } catch (e) {}
            const fid = target.fid || (target.path ? this._wvSfEnsurePath(target.libraryID, target.path) : null);
            if (!fid) return true;
            const searches = target.ids.map((id) => Zotero.Searches.get(id)).filter(Boolean);
            this._wvSfAssign(searches, fid);
            return true;
        } catch (e) { Zotero.debug("[Weavero] search folders: drop err: " + e); return false; }
    }

    // ---- menus ----

    /** The folders a menu offers, as rows of [label depth, node] (Weavero's and the ones read from names). */
    _wvSfMenuFolders(libraryID: number): Array<{ node: WvSfNode; depth: number }> {
        try {
            const store = this._wvSfLib(libraryID, false);
            const searches = (Zotero.Searches.getByLibrary(libraryID) || []).filter((s: any) => !s.deleted)
                .map((s: any) => ({ id: s.id, key: s.key, name: String(s.name || ""), obj: s }));
            const cmp = (a: string, b: string) => { try { return Zotero.localeCompare(a, b); } catch (e) { return a < b ? -1 : 1; } };
            return wvSfFlatFolders(wvSfBuildTree(searches, store, this._wvSfNamesOn(), true, cmp));
        } catch (e) { return []; }
    }

    /** "Move to Folder" for saved search `search`, into `popup`. */
    _wvSfFillMoveMenu(doc: any, win: any, popup: any, search: any) {
        while (popup.firstChild) popup.firstChild.remove();
        const libraryID = search.libraryID;
        const store = this._wvSfLib(libraryID, false);
        const cur = store ? store.assign[search.key] : null;
        const folders = this._wvSfMenuFolders(libraryID);
        const tree = (() => {
            try {
                const searches = (Zotero.Searches.getByLibrary(libraryID) || []).filter((s: any) => !s.deleted).map((s: any) => ({ id: s.id, key: s.key, name: String(s.name || ""), obj: s }));
                return wvSfBuildTree(searches, store, this._wvSfNamesOn(), true, (a: string, b: string) => Zotero.localeCompare(a, b));
            } catch (e) { return null; }
        })();
        const chain = tree ? wvSfChainOf(tree, search.key) : null;
        const here = chain ? chain[chain.length - 1] : null;
        wvMenuItem(doc, {
            l10n: { id: "weavero-sf-unfiled" },
            disabled: !here,
            attrs: { "data-wv-sf-target": WV_SF_ROOT },
            onCommand: () => { const p: any = wvLivePlugin(); if (p) p._wvSfAssign([search], WV_SF_ROOT); },
        }, popup);
        if (folders.length) wvMenuSeparator(doc, popup);
        for (const { node, depth } of folders) {
            const mi = wvMenuItem(doc, {
                label: node.name,
                disabled: !!(here && here.key === node.key),
                attrs: { "data-wv-sf-target": node.key },
                onCommand: () => {
                    const p: any = wvLivePlugin();
                    if (!p) return;
                    const fid = node.fid || p._wvSfEnsurePath(libraryID, node.path);
                    if (fid) p._wvSfAssign([search], fid);
                },
            }, popup);
            if (depth) mi.style.paddingInlineStart = (depth * 16) + "px";
        }
        wvMenuSeparator(doc, popup);
        wvMenuItem(doc, {
            l10n: { id: "weavero-sf-new-folder" },
            attrs: { "data-wv-sf-target": "new" },
            onCommand: () => {
                const p: any = wvLivePlugin();
                if (!p) return;
                const name = p._wvSfPromptName(win, "");
                if (!name) return;
                const fid = p._wvSfNewFolder(libraryID, name, null);
                if (fid) p._wvSfAssign([search], fid);
            },
        }, popup);
        void cur;
    }

    _wvSfPromptName(win: any, initial: string): string | null {
        try {
            const input = { value: initial || "" };
            const ok = Services.prompt.prompt(win, wvStr("weavero-sf-folder-name-title", null, null), wvStr("weavero-sf-folder-name-prompt", null, null), input, null, { value: false });
            if (!ok) return null;
            const v = String(input.value || "").trim();
            return v || null;
        } catch (e) { return null; }
    }

    /** Zotero's collection menu, as it opens: Move to Folder on a saved search, New
     *  Search Folder on a library. After Zotero's own entries (it addresses them by
     *  position), every entry Weavero's (`wv-` ids), rebuilt at each opening. */
    _wvSfColMenuShowing(win: any, menu: any) {
        const doc = win.document;
        for (const id of ["wv-sf-colmenu-sep", "wv-sf-colmenu-move", "wv-sf-colmenu-new"]) { const el = doc.getElementById(id); if (el) el.remove(); }
        if (!this._wvSfOn()) return;
        const t = win._wvSfMenuTarget;
        let row: any = null;
        try {
            if (t && t.cv && Date.now() - t.at < 3000) row = t.cv.getRow(t.index);
            if (!row) { const cv = win.ZoteroPane && win.ZoteroPane.collectionsView; row = cv ? cv.getRow(cv.selection.focused) : null; }
        } catch (e) {}
        if (!row || !this._wvGfIsPaneTree(row.view || (t && t.cv))) {
            // Zotero 10's rows hold no view: the recorded tree stands in.
            if (!row) return;
        }
        const sep = wvMenuSeparator(doc, menu);
        sep.id = "wv-sf-colmenu-sep";
        if (typeof row.isSearch === "function" && row.isSearch() && row.ref) {
            const search = row.ref;
            const m = doc.createXULElement("menu");
            m.id = "wv-sf-colmenu-move";
            wvL10n(m, "weavero-sf-move-to");
            const pop = doc.createXULElement("menupopup");
            m.appendChild(pop);
            // popupshowing bubbles: this submenu's own only (src-ts.md).
            pop.addEventListener("popupshowing", (ev: any) => {
                if (ev.target !== pop) return;
                const p: any = wvLivePlugin();
                if (p) p._wvSfFillMoveMenu(doc, win, pop, search);
            });
            menu.appendChild(m);
        }
        else if (typeof row.isLibrary === "function" && row.isLibrary(true) && !(typeof row.isFeed === "function" && row.isFeed())) {
            const libraryID = row.ref.libraryID;
            wvMenuItem(doc, {
                l10n: { id: "weavero-sf-new-search-folder" },
                attrs: { id: "wv-sf-colmenu-new" },
                onCommand: () => {
                    const p: any = wvLivePlugin();
                    if (!p) return;
                    const name = p._wvSfPromptName(win, "");
                    if (name) p._wvSfNewFolder(libraryID, name, null);
                },
            }, menu);
        }
        else sep.remove();
    }

    /** A folder line's own menu (Zotero opens none on a heading). */
    _wvSfFolderMenu(cv: any, index: number, x: number, y: number) {
        try {
            const row = cv.getRow(index);
            if (!this._wvSfIsFolderRow(row)) return;
            const win = winOf(cv.domEl);
            const doc = win.document;
            const { libraryID, node } = row.ref.wvSf as { libraryID: number; node: WvSfNode };
            let pop = doc.getElementById(SF_MENU_ID);
            if (pop) pop.remove();
            pop = doc.createXULElement("menupopup");
            pop.id = SF_MENU_ID;
            const P: any = this;
            const live = () => wvLivePlugin();
            if (!node.local) {
                // A folder read from the searches' names: it changes with their names.
                const cap = wvMenuItem(doc, { label: wvStr("weavero-sf-name-folder", { path: node.path.join(" / ") }, null), disabled: true }, pop);
                cap.setAttribute("data-wv-sf-act", "name-info");
                wvMenuSeparator(doc, pop);
            }
            wvMenuItem(doc, {
                l10n: { id: "weavero-sf-new-subfolder" },
                attrs: { "data-wv-sf-act": "new-sub" },
                onCommand: () => {
                    const p: any = live();
                    if (!p) return;
                    const name = p._wvSfPromptName(win, "");
                    if (!name) return;
                    const parent = node.fid || p._wvSfEnsurePath(libraryID, node.path);
                    if (parent) p._wvSfNewFolder(libraryID, name, parent);
                },
            }, pop);
            if (node.local && node.fid) {
                const fid = node.fid;
                wvMenuItem(doc, {
                    l10n: { id: "weavero-sf-rename-folder" },
                    attrs: { "data-wv-sf-act": "rename" },
                    onCommand: () => {
                        const p: any = live();
                        if (!p) return;
                        const name = p._wvSfPromptName(win, node.name);
                        if (name) p._wvSfRenameFolder(libraryID, fid, name);
                    },
                }, pop);
                const mv = doc.createXULElement("menu");
                wvL10n(mv, "weavero-sf-move-folder");
                mv.setAttribute("data-wv-sf-act", "move");
                const mp = doc.createXULElement("menupopup");
                mv.appendChild(mp);
                mp.addEventListener("popupshowing", (ev: any) => {
                    if (ev.target !== mp) return;
                    while (mp.firstChild) mp.firstChild.remove();
                    const p: any = live();
                    if (!p) return;
                    const s = p._wvSfLib(libraryID, false);
                    wvMenuItem(doc, {
                        l10n: { id: "weavero-sf-top-level" },
                        disabled: !(s && s.folders[fid] && s.folders[fid].parent),
                        onCommand: () => { const q: any = live(); if (q) q._wvSfMoveFolder(libraryID, fid, null); },
                    }, mp);
                    const list = p._wvSfMenuFolders(libraryID).filter((x: any) => x.node.local && x.node.fid && !(s && wvSfIsUnder(s, x.node.fid, fid)));
                    if (list.length) wvMenuSeparator(doc, mp);
                    for (const { node: f, depth } of list) {
                        const mi = wvMenuItem(doc, {
                            label: f.name,
                            disabled: !!(s && s.folders[fid] && s.folders[fid].parent === f.fid),
                            onCommand: () => { const q: any = live(); if (q) q._wvSfMoveFolder(libraryID, fid, f.fid); },
                        }, mp);
                        if (depth) mi.style.paddingInlineStart = (depth * 16) + "px";
                    }
                });
                pop.appendChild(mv);
                wvMenuSeparator(doc, pop);
                wvMenuItem(doc, {
                    l10n: { id: "weavero-sf-delete-folder" },
                    attrs: { "data-wv-sf-act": "delete" },
                    onCommand: () => {
                        const p: any = live();
                        if (!p) return;
                        const s = p._wvSfLib(libraryID, false);
                        const subs = s ? Object.keys(s.folders).filter((f) => f !== fid && wvSfIsUnder(s, f, fid)).length : 0;
                        if (subs) {
                            const ok = Services.prompt.confirm(win, wvStr("weavero-sf-folder-name-title", null, null), wvStr("weavero-sf-delete-confirm", { name: node.name, count: subs }, null));
                            if (!ok) return;
                        }
                        p._wvSfDeleteFolder(libraryID, fid);
                    },
                }, pop);
            }
            (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(pop);
            pop.addEventListener("popuphidden", (ev: any) => { if (ev.target === pop) { try { pop.remove(); } catch (e) {} } });
            pop.openPopupAtScreen(x, y, true);
            void P;
        } catch (e) { Zotero.debug("[Weavero] search folders: folder menu err: " + e); }
    }

    // ---- wiring ----

    /** The layers on window `win`'s CollectionTree class. */
    _wvSfWrapClass(win: any) {
        try {
            if (!win || win.closed || typeof win.require !== "function") return;
            const CT: any = win.require("zotero/collectionTree");
            const proto = CT && CT.prototype;
            if (!proto || typeof proto._expandRow !== "function") return;
            const tag = this._wvWireTag();
            wvWrap(proto, "_expandRow", SF_LAYER, tag, (orig: any) => async function (this: any, rows: any, row: any) {
                const count = await orig.apply(this, arguments);
                try { const p: any = wvLivePlugin(); if (p) return p._wvSfRegroup(this, rows, row, count); } catch (e) {}
                return count;
            });
            // Every rebuild of a tree's rows ends here: rows drawn from an older store are drawn again.
            wvWrap(proto, "_refreshRowMap", SF_LAYER, tag, (orig: any) => function (this: any) {
                const r = orig.apply(this, arguments);
                try {
                    const p: any = wvLivePlugin();
                    const g = this._rows && (this._rows as any)._wvSfGen;
                    if (p && g !== undefined && g !== (p._wvSfGen || 0) && p._wvSfOn()) {
                        const cv = this;
                        wvTimeout(() => { const q: any = wvLivePlugin(); if (q) q._wvSfReload(cv); }, 0);
                    }
                    if (p) p._wvSfAdopt(this);
                } catch (e) {}
                return r;
            });
            wvWrap(proto, "getIconName", SF_LAYER, tag, (orig: any) => function (this: any, index: any) {
                try { const p: any = wvLivePlugin(); if (p && p._wvSfIsFolderAt(this, index)) return "wv-search-folder"; } catch (e) {}
                return orig.apply(this, arguments);
            });
            wvWrap(proto, "selectByID", SF_LAYER, tag, (orig: any) => async function (this: any, id: any) {
                try {
                    const p: any = wvLivePlugin();
                    if (p && p._wvSfOn() && typeof id === "string" && id[0] === "S" && p._wvGfIsPaneTree(this)) {
                        const s = Zotero.Searches.get(parseInt(id.slice(1), 10));
                        if (s && !s.deleted) {
                            try { await this.expandLibrary(s.libraryID); } catch (e) {}
                            await p._wvSfReveal(this, s);
                        }
                    }
                } catch (e) {}
                return orig.apply(this, arguments);
            });
            wvWrap(proto, "expandLibrary", SF_LAYER, tag, (orig: any) => async function (this: any, libraryID: any, recursive: any) {
                const r = await orig.apply(this, arguments);
                try { const p: any = wvLivePlugin(); if (p && recursive && r && p._wvSfOn()) p._wvSfOpenAll(this, libraryID); } catch (e) {}
                return r;
            });
            // Zotero puts an added or renamed search at its library's level: the
            // library redrawn instead, its selection kept.
            wvWrap(proto, "notify", SF_LAYER, tag, (orig: any) => async function (this: any, action: any, type: any, ids: any) {
                const r = await orig.apply(this, arguments);
                try {
                    const p: any = wvLivePlugin();
                    if (p && type === "search" && (action === "add" || action === "modify" || action === "delete" || action === "trash" || action === "refresh")
                        && Array.isArray(ids) && ids.length && p._wvSfOn() && p._wvGfIsPaneTree(this)) await p._wvSfReload(this);
                } catch (e) {}
                return r;
            });
            wvWrap(proto, "onDragOver", SF_LAYER, tag, (orig: any) => function (this: any, event: any, index: any) {
                try { const p: any = wvLivePlugin(); if (p && p._wvSfDragOver(this, event, index)) return; } catch (e) {}
                return orig.apply(this, arguments);
            });
            wvWrap(proto, "onDrop", SF_LAYER, tag, (orig: any) => function (this: any, event: any, index: any) {
                try { const p: any = wvLivePlugin(); if (p && p._wvSfDrop(this, event, index)) return; } catch (e) {}
                return orig.apply(this, arguments);
            });
        } catch (e) { Zotero.debug("[Weavero] search folders: class layer err: " + e); }
    }

    /** One pane tree: the folder toggle (a class field: each tree's own), a click on a
     *  folder line, the right-click on a folder and the row the collection menu is for. */
    _wvSfWireTree(cv: any) {
        try {
            if (!this._wvGfIsPaneTree(cv)) return;
            sfState(cv).wired = true;
            const tag = this._wvWireTag();
            wvWrap(cv, "toggleOpenState", SF_LAYER, tag, (orig: any) => function (this: any, index: any) {
                try { const p: any = wvLivePlugin(); if (p && p._wvSfIsFolderAt(cv, index)) return p._wvSfToggle(cv, index); } catch (e) {}
                return orig.apply(this, arguments);
            });
            this._wvGfSyncProps(cv);
            const el = cv.domEl;
            if (!el) return;
            // A folder line is not selectable (a heading): a press then a release on it
            // opens or closes it. The twisty's own press stops there (renderItem).
            wvListen(el, "srchfold:down", "mousedown", (e: any) => {
                try {
                    const p: any = wvLivePlugin();
                    const st = sfState(cv);
                    st.press = 0;
                    if (!p || e.button !== 0 || (Zotero.isMac && e.ctrlKey)) return;
                    const i = rowAt(cv, e.target);
                    if (i >= 0 && p._wvSfIsFolderAt(cv, i)) st.press = Date.now();
                } catch (err) {}
            }, false, tag);
            wvListen(el, "srchfold:up", "mouseup", (e: any) => {
                try {
                    const p: any = wvLivePlugin();
                    const st = sfState(cv);
                    const t = st.press;
                    st.press = 0;
                    if (!p || !t || e.button !== 0 || Date.now() - t > 3000) return;
                    const i = rowAt(cv, e.target);
                    if (i >= 0 && p._wvSfIsFolderAt(cv, i)) p._wvSfToggle(cv, i);
                } catch (err) {}
            }, false, tag);
            // The row the collection menu is about to open for (on Zotero 11 a right-click
            // on an unselected row applies to that row alone); a folder: its own menu.
            wvListen(el, "srchfold:ctx", "contextmenu", (e: any) => {
                try {
                    const p: any = wvLivePlugin();
                    if (!p) return;
                    const i = rowAt(cv, e.target);
                    const w = winOf(el);
                    if (w) w._wvSfMenuTarget = { cv, index: i, at: Date.now() };
                    if (i >= 0 && p._wvSfIsFolderAt(cv, i) && p._wvSfOn()) {
                        e.preventDefault();
                        e.stopPropagation();
                        p._wvSfFolderMenu(cv, i, e.screenX, e.screenY);
                    }
                } catch (err) {}
            }, true, tag);
        } catch (e) { Zotero.debug("[Weavero] search folders: tree wire err: " + e); }
    }

    /** Tree `cv` taken in: its own layer and listeners, and -- rows built before the
     *  class layers (no generation stamp: the window's tree loaded before the wiring,
     *  as on Zotero 11 where onMainWindowLoad comes after the first library view; a
     *  new main window; a reload) -- one redraw. From the wiring and from every
     *  rebuild of the rows (_refreshRowMap's class layer), as group-fold's
     *  _wvGfRowsReplaced: a tree made after the wiring is taken in at its first
     *  rows (2026-11-27: a second main window had no folder toggle and no folder
     *  menu; at startup the folders showed only after an edit). */
    _wvSfAdopt(cv: any) {
        try {
            if (!this._wvGfIsPaneTree(cv)) return;
            const st = sfState(cv);
            // Wired = this instance's toggle layer IS on the tree, not a flag: a
            // wvWrap of the same member under another tag drops every layer of
            // this one (lib/wrap.ts keeps one tag's layers). A spec that changed
            // `_version` -- part of the tag -- for a moment let group-fold
            // re-wrap toggleOpenState under that tag at a refresh; `wired`
            // stayed true, and a twisty then closed a folder through Zotero's
            // own toggle, never recorded (dev.99 triage, 2026-11-27). Checked
            // at every rebuild of the rows, as group-fold does. Guard:
            // test/search-folders.spec.js "a twisty ... after its layer was lost".
            const tag = this._wvWireTag();
            const has = wvWrapLayers(cv, "toggleOpenState").some((l) => l.layer === SF_LAYER && l.tag === tag);
            if (!st.wired || !has) this._wvSfWireTree(cv);
            if (st.adopted || !this._wvSfOn()) return;
            const rows = cv._rows;
            if (!rows || !rows.length || (rows as any)._wvSfGen !== undefined) return;
            st.adopted = true;
            wvTimeout(() => { const p: any = wvLivePlugin(); if (p) p._wvSfReload(cv); }, 0);
        } catch (e) { Zotero.debug("[Weavero] search folders: adopt err: " + e); }
    }

    /** Wiring-table entry "search-folders": the store, the class layers, the trees
     *  there now, the collection menu's entries, the icon's sheet. */
    _wvSfWire(win: any) {
        try {
            if (!win || win.closed) return;
            this._wvSfWatch();
            this._wvSfLoad();
            this._wvSfWrapClass(win);
            for (const cv of this._wvSfTreesOf(win)) this._wvSfAdopt(cv);
            const doc = win.document;
            wvInjectStyle(doc, SF_STYLE_ID, SF_CSS);
            const menu = doc.getElementById("zotero-collectionmenu");
            if (menu) {
                wvListen(menu, "srchfold:colmenu", "popupshowing", (ev: any) => {
                    if (!ev || ev.target !== menu) return;
                    try { const p: any = wvLivePlugin(); if (p) p._wvSfColMenuShowing(win, menu); } catch (e) {}
                }, false, this._wvWireTag());
            }
        } catch (e) { Zotero.debug("[Weavero] _wvSfWire err: " + e); }
    }

    /** The settings and the Saved Search Folders plugin, watched once per instance. */
    _wvSfWatch() {
        if (this._wvSfWatching) return;
        this._wvSfWatching = true;
        try {
            this._wvSfPrefObs = [SF_PREF, SF_PREF_NAMES, "enableVisualExtras"].map((n) =>
                Zotero.Prefs.registerObserver("weavero." + n, () => { const p: any = wvLivePlugin(); if (p) p._wvSfRefreshAll(); }));
        } catch (e) { this._wvSfPrefObs = []; }
        try {
            let AM: any = null;
            try { AM = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager; } catch (e) {}
            if (!AM) return;
            const check = () => {
                AM.getAddonByID(SF_FOREIGN_ID).then((a: any) => {
                    const p: any = wvLivePlugin();
                    if (!p) return;
                    const foreign = !!(a && a.isActive);
                    if (foreign !== !!p._wvSfForeign) { p._wvSfForeign = foreign; p._wvSfRefreshAll(); }
                }, () => {});
            };
            const on = (addon: any) => { if (addon && addon.id === SF_FOREIGN_ID) check(); };
            this._wvSfAddonListener = { onEnabled: on, onDisabled: on, onInstalled: on, onUninstalled: on };
            AM.addAddonListener(this._wvSfAddonListener);
            this._wvSfAM = AM;
            check();
        } catch (e) {}
    }

    /** destroy(): every layer, listener and entry off, the trees drawn flat again. */
    _wvSfTeardown() {
        try {
            for (const id of (this._wvSfPrefObs || [])) { try { Zotero.Prefs.unregisterObserver(id); } catch (e) {} }
            this._wvSfPrefObs = [];
            if (this._wvSfAM && this._wvSfAddonListener) { try { this._wvSfAM.removeAddonListener(this._wvSfAddonListener); } catch (e) {} }
            this._wvSfAddonListener = null;
            this._wvSfWatching = false;
            // The class layers off in EVERY window first: a tree redrawn below while
            // they were still on was regrouped by them, and the folders stayed
            // (2026-11-27, search-folders.spec.js "teardown draws the tree flat").
            for (const w of wvMainWins()) {
                try {
                    const CT: any = typeof w.require === "function" ? w.require("zotero/collectionTree") : null;
                    if (CT && CT.prototype) for (const m of SF_CLASS_MEMBERS) { try { wvUnwrap(CT.prototype, m, SF_LAYER); } catch (e) {} }
                } catch (e) {}
            }
            for (const w of wvMainWins()) {
                try {
                    const doc = w.document;
                    const trees = this._wvSfTreesOf(w);
                    for (const v of wvLibraryViews(w)) { try { if (v && v.collectionsView && !trees.includes(v.collectionsView)) trees.push(v.collectionsView); } catch (e) {} }
                    for (const cv of trees) {
                        let drawn = false;
                        for (const m of SF_TREE_MEMBERS) { try { wvUnwrap(cv, m, SF_LAYER); } catch (e) {} }
                        try {
                            const el = cv.domEl;
                            if (el) for (const k of ["srchfold:down", "srchfold:up", "srchfold:ctx"]) wvUnlisten(el, k);
                        } catch (e) {}
                        try {
                            for (const r of (cv._rows || [])) {
                                if (r && Object.prototype.hasOwnProperty.call(r, "getName")) delete r.getName;
                                if (this._wvSfIsFolderRow(r)) drawn = true;
                            }
                        } catch (e) {}
                        try { this._wvGfSyncProps(cv); } catch (e) {}
                        WV_SF.delete(cv);
                        if (drawn) { try { this._wvGfReloadKeep(cv); } catch (e) {} }
                    }
                    const menu = doc.getElementById("zotero-collectionmenu");
                    if (menu) wvUnlisten(menu, "srchfold:colmenu");
                    for (const id of ["wv-sf-colmenu-sep", "wv-sf-colmenu-move", "wv-sf-colmenu-new", SF_MENU_ID]) { const el = doc.getElementById(id); if (el) el.remove(); }
                    wvRemoveStyle(doc, SF_STYLE_ID);
                    try { delete w._wvSfMenuTarget; } catch (e) {}
                } catch (e) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvSfTeardown err: " + e); }
    }
}

const _sfDescriptors = Object.getOwnPropertyDescriptors(_SearchFoldersMixin.prototype);
delete (_sfDescriptors as any).constructor;
export const searchFoldersMethods = _sfDescriptors;
