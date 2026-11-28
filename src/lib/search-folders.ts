// Folders for saved searches -- the pure part (search-folders.ts draws them).
//
// MJT 2026-11-27: folders for saved searches, as the Saved Search Folders plugin
// makes them, "but without touching the data itself": the folders Weavero keeps
// live in a local file, keyed by library and by each search's KEY (stable across
// a rename and across sync). A search named with "/" is ALSO read as a path, the
// plugin's convention, read only ("People/Students/Marie Curie" -> folder People >
// Students, shown "Marie Curie"; a leading "2_" on a segment of such a name orders
// it and is not shown) -- so both ways can be compared on one library. A search
// Weavero filed goes where it was filed, whatever its name says.
//
// Order: folders first, then searches, each by the "N_" order of a name path
// when there is one, else alphabetically (Zotero's collation), as Zotero lists
// saved searches.

export interface WvSfFolderDef { name: string; parent: string | null }

/** One library's part of the store: its folders and where its searches were filed. */
export interface WvSfLibStore {
    folders: Record<string, WvSfFolderDef>;
    /** saved-search key -> folder id */
    assign: Record<string, string>;
}

export interface WvSfSearchIn { id: number; key: string; name: string; obj?: any }

export interface WvSfEntry { search: WvSfSearchIn; label: string; order: number }

export interface WvSfNode {
    /** "" for the library's root; "l:<id>" for a folder of Weavero's; "n:<path>" for one read from names. */
    key: string;
    name: string;
    local: boolean;
    /** The folder's id in the store (local folders only). */
    fid: string | null;
    /** The display path of a folder read from names (for its menu's explanation). */
    path: string[];
    order: number;
    folders: WvSfNode[];
    searches: WvSfEntry[];
}

export const WV_SF_SEP = "/";
const ORDER_RX = /^(\d+)_\s*/;

/** A name's display path, its leaf and their orders, when the name is a path
 *  ("A/B/C"); null for a plain name (no separator, or nothing on one side). */
export function wvSfParsePath(name: string, sep: string = WV_SF_SEP): { path: string[]; orders: number[]; leaf: string; leafOrder: number } | null {
    const raw = String(name || "").split(sep).map((s) => s.trim());
    if (raw.length < 2 || raw.some((s) => !s)) return null;
    const segs = raw.map((s) => {
        const m = s.match(ORDER_RX);
        const shown = m ? s.slice(m[0].length) : s;
        return shown ? { name: shown, order: m ? parseInt(m[1], 10) : Infinity } : { name: s, order: Infinity };
    });
    const leaf = segs.pop()!;
    return { path: segs.map((s) => s.name), orders: segs.map((s) => s.order), leaf: leaf.name, leafOrder: leaf.order };
}

function newNode(key: string, name: string, local: boolean, fid: string | null, path: string[], order: number): WvSfNode {
    return { key, name, local, fid, path, order, folders: [], searches: [] };
}

/** The folder tree of one library's searches. `searches`: the ones to place
 *  (already the tree's -- hidden ones and filtered-out ones left out by the
 *  caller). `store`: the library's part of the file, or null. `readNames`: also
 *  place by name paths. `keepEmpty`: Weavero's folders with nothing in them stay
 *  (a new folder is empty until something is filed in it). */
export function wvSfBuildTree(searches: WvSfSearchIn[], store: WvSfLibStore | null, readNames: boolean, keepEmpty: boolean,
    compare: (a: string, b: string) => number): WvSfNode {
    const root = newNode("", "", false, null, [], 0);
    const folders = (store && store.folders) || {};
    const assign = (store && store.assign) || {};
    const byFid = new Map<string, WvSfNode>();
    for (const fid of Object.keys(folders)) {
        const d = folders[fid];
        if (!d || !d.name) continue;
        byFid.set(fid, newNode("l:" + fid, String(d.name), true, fid, [], Infinity));
    }
    // Parents: a missing parent, or a cycle, puts the folder at the top.
    const parentOf = (fid: string): string | null => {
        const d = folders[fid];
        const p = d && d.parent;
        return p && byFid.has(p) && p !== fid ? p : null;
    };
    const cyclic = (fid: string): boolean => {
        const seen = new Set<string>([fid]);
        let p = parentOf(fid);
        while (p) {
            if (seen.has(p)) return true;
            seen.add(p);
            p = parentOf(p);
        }
        return false;
    };
    for (const [fid, node] of byFid) {
        const p = cyclic(fid) ? null : parentOf(fid);
        (p ? byFid.get(p)! : root).folders.push(node);
    }
    // A name's folder at `parent`: a folder of that name already there (one of
    // Weavero's, or one an earlier name made), else a new one read from names.
    const nameFolder = (parent: WvSfNode, name: string, order: number, path: string[]): WvSfNode => {
        let f = parent.folders.find((x) => x.name === name);
        if (!f) {
            f = newNode("n:" + path.join("\u001f"), name, false, null, path.slice(), order);
            parent.folders.push(f);
        }
        else if (!f.local && order < f.order) f.order = order;
        return f;
    };
    for (const s of searches) {
        const fid = assign[s.key];
        if (fid && byFid.has(fid)) {
            byFid.get(fid)!.searches.push({ search: s, label: s.name, order: Infinity });
            continue;
        }
        const p = readNames ? wvSfParsePath(s.name) : null;
        if (!p) {
            root.searches.push({ search: s, label: s.name, order: Infinity });
            continue;
        }
        let at = root;
        for (let i = 0; i < p.path.length; i++) at = nameFolder(at, p.path[i], p.orders[i], p.path.slice(0, i + 1));
        at.searches.push({ search: s, label: p.leaf, order: p.leafOrder });
    }
    const prune = (n: WvSfNode): boolean => {
        n.folders = n.folders.filter((f) => prune(f) || (f.local && keepEmpty));
        return n.folders.length > 0 || n.searches.length > 0;
    };
    prune(root);
    const sortAll = (n: WvSfNode) => {
        n.folders.sort((a, b) => (a.order - b.order) || compare(a.name, b.name));
        n.searches.sort((a, b) => (a.order - b.order) || compare(a.label, b.label));
        for (const f of n.folders) sortAll(f);
    };
    sortAll(root);
    return root;
}

/** Every folder of a tree, depth first, with its depth (0 = under the library). */
export function wvSfFlatFolders(root: WvSfNode): Array<{ node: WvSfNode; depth: number }> {
    const out: Array<{ node: WvSfNode; depth: number }> = [];
    const walk = (n: WvSfNode, d: number) => { for (const f of n.folders) { out.push({ node: f, depth: d }); walk(f, d + 1); } };
    walk(root, 0);
    return out;
}

/** The chain of folders holding search `key`, outermost first; null when it is not in a folder. */
export function wvSfChainOf(root: WvSfNode, key: string): WvSfNode[] | null {
    const walk = (n: WvSfNode, chain: WvSfNode[]): WvSfNode[] | null => {
        if (n.searches.some((e) => e.search.key === key)) return chain;
        for (const f of n.folders) {
            const r = walk(f, chain.concat([f]));
            if (r) return r;
        }
        return null;
    };
    const r = walk(root, []);
    return r && r.length ? r : null;
}

/** True when folder `fid` is `anc` or lies under it (a folder dropped into its own subtree). */
export function wvSfIsUnder(store: WvSfLibStore, fid: string, anc: string): boolean {
    let p: string | null = fid;
    let n = 0;
    while (p && n++ < 256) {
        if (p === anc) return true;
        const d: WvSfFolderDef | undefined = store.folders[p];
        p = d ? d.parent : null;
    }
    return false;
}
