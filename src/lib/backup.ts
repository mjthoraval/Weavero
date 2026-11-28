// Backups of Weavero's own data: the pure part (names, the inventory, the
// retention rule, record diffs, hashing). The plugin side is
// modules/backups.ts. Branch backups, MJT 2026-11-22 ("Weavero backups next").
//
// WHY: Zotero's own backup copies zotero.sqlite, Zotero sync carries the
// database and the files; nothing copies `<data dir>/weavero/`, and a sync of
// Weavero's own data is coming (branch sync), which makes a backup its safety
// net.
//
// THE INVENTORY (every file and folder Weavero writes under weavero/, found by
// grepping src/ for wvStorePath / wvStoreDir / DataDirectory.dir on
// 2026-11-22). A deny-list, not an allow-list: a store added later (the refs
// branch's ref-corrections.json, the sync branch's own) is DATA until it is
// listed here as something else -- a backup that copies a cache costs disk, one
// that skips a store loses it.
//
//   data -- copied into every backup, written back by a restore or an import
//     bookmarks.json          library and reader bookmarks (bookmarks.ts)
//     outlines.json           curated reader outlines + per-document outline
//                             settings (bookmarks.ts)
//     ann-order.json          the manual annotation order (reader-panels.ts)
//     note-view.json          the note outline / folds view state (note-nav.ts)
//     tab-sessions.json       named tab sessions (sessions.ts)
//     saved-windows.json      saved windows (tabs.ts)
//     tab-groups.json(.bak)   the file copy of the weavero.tabGroups pref and
//                             its previous generation (tab-groups.ts; the .bak
//                             is the only copy of a group a write lost, so it
//                             is kept)
//     outline-eval.json       developer outline verdicts (outline-eval.ts)
//     feeds/settings.json     names, followed authors, alerts, watched papers,
//                             citation alerts (feeds.ts)
//     feeds/alerts.json       the alerts file export, which keeps what
//                             the file's tool resolved (feeds.ts)
//     people.json             the People records: every source's value and
//                             the user's choices, links, notes (people.ts)
//     anything not below      a store this table does not know yet
//   session -- copied (a hand recovery can use it), never written back: it
//   describes the windows open at that time, and Zotero restores its own
//     windows.json, session.json   Weavero's window store and its pre-0.14.7
//                             name (tabs.ts); on Zotero 11 a new windows.json
//                             would be transferred into native windows again
//     colstore.json           items-list columns per window id (tabs.ts)
//     hidden-collections.json the window-keyed legacy hidden collections
//                             (pane.ts, migrated once)
//     people-tabs.json        the People tab of each window (people.ts)
//   cache -- never copied: Weavero builds it again
//     cited-by/               the Cited by index, tens of MB (cited-by.ts)
//     people-cache/           People's raw source records and publication
//                             lists, fetched again by a Refresh (people.ts)
//     feeds/scores.json       feed relevance scores (feeds.ts)
//     sdt-build.json          structure-data build failures (sdt-build.ts)
//     aft-subset.json         the Academic Family Tree extract (people-lineage.ts)
//     doc-layer/             the document layer: what Weavero corrected in
//                             each PDF's structure data (doc-layer.ts)
//     win-icons/              icons builds before 2026-11-27 extracted for
//                             the taskbar (tabs.ts now decodes them in memory)
//   transient -- never copied
//     backups/                the backups themselves, state.json,
//                             restore-pending.json
//     disable-closed.json, reader-migration.json  disable -> enable hand-offs
//     drag-ring.json, trace-*.json, *-trace.json, *-trace.prev.json
//                             diagnostics (filter-trace, boot-groups-trace)
//     restart-test/, pre-test/, live-report.json, filter-matrix-report.json,
//     bench-profile.json      test and bench tooling output
//     reader-tab-windows.json the pre-0.14 reader-window store, unread
//     *.tmp, *.corrupt-*, *.migrated   an atomic write in flight, a corrupt
//                             file set aside (lib/store.ts), a migrated file
//
// A BACKUP is a folder `backups/<YYYY-MM-DD>_<HHMMSS>[-n]_<reason>` (local
// time): `data/<path>` for each file, `settings.json` (the user-set
// extensions.zotero.weavero.* prefs), `manifest.json` (versions, date, reason,
// each file's size and SHA-256) and, written LAST, `complete.sha256` holding
// the manifest's SHA-256. It is written as `.partial-<name>` and renamed when
// complete: a folder under its final name without a matching marker, or whose
// files do not match the manifest, is damaged -- never offered, removed.

export type WvBkClass = "data" | "session" | "cache" | "transient";

/** The backup format this Weavero writes and reads; an import of a higher
 *  one is refused (a newer Weavero's layout). */
export const WV_BK_SCHEMA = 1;
export const WV_BK_FORMAT = "weavero-backup";
export const WV_BK_EXPORT_FORMAT = "weavero-export";
export const WV_BK_SETTINGS_FORMAT = "weavero-settings";
/** A file larger than this is left out of a backup (named in its manifest). */
export const WV_BK_FILE_CAP = 64 * 1024 * 1024;
/** A backup (or an export, or an import) larger than this is refused. */
export const WV_BK_TOTAL_CAP = 256 * 1024 * 1024;
/** At most this many files in a backup or an import. */
export const WV_BK_MAX_FILES = 5000;
/** The default and the bounds of the daily copies kept (weavero.backup.keepDaily). */
export const WV_BK_KEEP_DAILY = 7;
export const WV_BK_KEEP_DAILY_MIN = 1;
export const WV_BK_KEEP_DAILY_MAX = 60;
/** The copies kept of every other reason: update, manual, pre-restore,
 *  pre-import, import and any "pre-<x>" a caller names (the sync branch). */
export const WV_BK_KEEP_OTHER = 5;

const DIRS: Record<string, WvBkClass> = {
    "backups": "transient",
    "cited-by": "cache",
    "doc-layer": "cache",
    "win-icons": "cache",
    "people-cache": "cache",
    "restart-test": "transient",
    // A bench harness's copy of weavero/ before a run (2026-10-13 in MJT's
    // data dir): tooling output, never restored over live data.
    "pre-test": "transient",
};

const FILES: Record<string, WvBkClass> = {
    "windows.json": "session",
    "session.json": "session",
    "colstore.json": "session",
    "hidden-collections.json": "session",
    "people-tabs.json": "session",
    "feeds/scores.json": "cache",
    "sdt-build.json": "cache",
    // An extract of the Academic Family Tree, put in place by hand as a
    // stand-in for its API (people-lineage.ts): another source's data, a MB or
    // more, never Weavero's to back up.
    "aft-subset.json": "cache",
    "disable-closed.json": "transient",
    "reader-migration.json": "transient",
    "drag-ring.json": "transient",
    "boot-groups-trace.json": "transient",
    "live-report.json": "transient",
    "filter-matrix-report.json": "transient",
    "bench-profile.json": "transient",
    // The pre-0.14 reader-window store, no longer read (reader.ts): a restore
    // must neither bring it back nor count it as a change.
    "reader-tab-windows.json": "transient",
};

/** A folder under weavero/ that is never walked (its whole content is one class). */
export function wvBkSkipDir(rel: string): boolean {
    return !rel.includes("/") && Object.prototype.hasOwnProperty.call(DIRS, rel);
}

/** The class of `rel` (a path under weavero/, "/"-separated). */
export function wvBkClassify(rel: string): WvBkClass {
    const r = String(rel || "");
    const top = r.split("/")[0];
    if (r.includes("/") && Object.prototype.hasOwnProperty.call(DIRS, top)) return DIRS[top];
    if (Object.prototype.hasOwnProperty.call(FILES, r)) return FILES[r];
    const base = r.slice(r.lastIndexOf("/") + 1);
    if (/\.tmp$/i.test(base) || /\.corrupt-/i.test(base) || /\.migrated$/i.test(base)) return "transient";
    if (/^trace-.*\.json$/i.test(base)) return "transient";
    // lib/trace-file.ts's persistent traces, `<name>.json` + `<name>.prev.json`
    // (the filter's `filter-trace`, citations 2026-11-22; boot-groups-trace
    // too): diagnostics, rewritten every session.
    if (/-trace(\.prev)?\.json$/i.test(base)) return "transient";
    return "data";
}

/** Copied into a backup: data and session state. */
export function wvBkBackedUp(rel: string): boolean {
    const c = wvBkClassify(rel);
    return c === "data" || c === "session";
}

/** A path a backup or an import may name: relative, "/"-separated, plain
 *  segments (no "..", no drive, no empty segment), at most 6 deep. */
export function wvBkValidRel(rel: any): boolean {
    if (typeof rel !== "string" || !rel || rel.length > 240) return false;
    const segs = rel.split("/");
    if (segs.length > 6) return false;
    return segs.every((s) => /^[A-Za-z0-9_.][A-Za-z0-9._ -]{0,100}$/.test(s) && s !== "." && s !== ".." && !/[. ]$/.test(s));
}

/** A reason a backup may carry: daily, update, manual, pre-restore,
 *  pre-import, import, or a caller's own ("pre-sync"). */
export function wvBkValidReason(reason: any): boolean {
    return typeof reason === "string" && /^[a-z][a-z0-9-]{0,23}$/.test(reason);
}

const pad = (x: number, w = 2) => String(x).padStart(w, "0");

/** `<YYYY-MM-DD>_<HHMMSS>[-n]_<reason>`, local time. */
export function wvBkFolderName(d: Date, reason: string, n?: number): string {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
        + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
        + (n ? "-" + n : "") + "_" + reason;
}

const NAME_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(?:-(\d{1,3}))?_([a-z][a-z0-9-]{0,23})$/;

/** The parts of a backup folder's name, or null for any other name. */
export function wvBkParseName(name: string): { day: string; n: number; reason: string; at: number } | null {
    const m = NAME_RE.exec(String(name || ""));
    if (!m) return null;
    const at = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    return { day: m[1] + "-" + m[2] + "-" + m[3], n: m[7] ? +m[7] : 0, reason: m[8], at };
}

/** The local calendar day of `ms` ("YYYY-MM-DD"): a daily backup is one per day. */
export function wvBkLocalDay(ms: number): string {
    const d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function wvBkKeepDaily(v: any): number {
    const n = parseInt(String(v), 10);
    if (!Number.isFinite(n)) return WV_BK_KEEP_DAILY;
    return Math.max(WV_BK_KEEP_DAILY_MIN, Math.min(WV_BK_KEEP_DAILY_MAX, n));
}

/** The backups to remove: per reason, all but the newest `keepDaily` daily
 *  ones and the newest WV_BK_KEEP_OTHER of every other reason. `keep` names
 *  one that stays whatever its rank (the backup just written). */
export function wvBkRetention(entries: Array<{ name: string; reason: string; created: number }>, keepDaily: number, keep?: string): string[] {
    const by: Record<string, Array<{ name: string; created: number }>> = {};
    for (const e of entries || []) (by[e.reason] = by[e.reason] || []).push(e);
    const out: string[] = [];
    for (const reason of Object.keys(by)) {
        const k = reason === "daily" ? wvBkKeepDaily(keepDaily) : WV_BK_KEEP_OTHER;
        const list = by[reason].slice().sort((a, b) => (b.created - a.created) || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
        let kept = 0;
        for (const e of list) {
            if (e.name === keep || kept < k) { kept++; continue; }
            out.push(e.name);
        }
    }
    return out.sort();
}

// ---- settings -----------------------------------------------------------

/** Prefs that are this installation's state, not a choice: never in a
 *  backup, never restored -- a migration's done-marker (restored unset, the
 *  migration would run again), the window-id counter (only grows; windows.json
 *  is not restored), the Zotero 11 window-transfer stamp (keyed to
 *  windows.json's time), and the "_" ones (the Settings pane's folds, a
 *  reopen request). */
export function wvBkPrefExcluded(key: string): boolean {
    const k = String(key || "");
    if (!k || k.startsWith("_")) return true;
    if (/Migrated$/.test(k)) return true;
    return k === "nextWindowId" || k === "windowsTransferred" || k === "defaultChildLegacyPending";
}

// ---- records and diffs ------------------------------------------------------

/** JSON with sorted keys: a key order change is no change. */
export function wvBkStable(v: any): string {
    const seen = new WeakSet();
    const norm = (x: any): any => {
        if (!x || typeof x !== "object") return x;
        if (seen.has(x)) return null;
        seen.add(x);
        if (Array.isArray(x)) return x.map(norm);
        const o: any = {};
        for (const k of Object.keys(x).sort()) o[k] = norm(x[k]);
        return o;
    };
    try { return JSON.stringify(norm(v)); } catch (e) { return String(v); }
}

const META = new Set(["v", "version", "schemaVersion", "producer", "savedAt", "format", "schema", "updated", "modified"]);

const idOf = (e: any, i: number): string => {
    if (e && typeof e === "object") {
        for (const k of ["id", "key", "name"]) {
            if (e[k] != null && (typeof e[k] === "string" || typeof e[k] === "number")) return String(e[k]);
        }
        return "#" + i;
    }
    if (typeof e === "string") return "=" + e;
    return "#" + i;
};

/** The records of one store's document, for a preview ("Bookmarks: 3
 *  removed, 1 changed"): bookmarks and folders by id (folders without their
 *  children, a child's change is the child's); any other document's top-level
 *  lists by element id and maps by key, one level down. */
export function wvBkRecords(rel: string, doc: any): Map<string, string> {
    const out = new Map<string, string>();
    const put = (k: string, v: any) => out.set(k, wvBkStable(v));
    if (rel === "bookmarks.json" && doc && typeof doc === "object") {
        const walk = (nodes: any, prefix: string, depth: number) => {
            if (!Array.isArray(nodes) || depth > 40) return;
            nodes.forEach((n: any, i: number) => {
                if (!n || typeof n !== "object") return;
                const id = prefix + idOf(n, i);
                if (n.type === "folder") {
                    const own = Object.assign({}, n);
                    delete own.children;
                    put(id, own);
                    walk(n.children, prefix, depth + 1);
                }
                else put(id, n);
            });
        };
        walk(doc.bookmarks, "lib/", 0);
        const rb = doc.readerBookmarks && typeof doc.readerBookmarks === "object" ? doc.readerBookmarks : {};
        for (const k of Object.keys(rb)) {
            const e = rb[k];
            if (Array.isArray(e)) walk(e, "doc/" + k + "/", 0);
            else if (e && typeof e === "object") { walk(e.local, "doc/" + k + "/", 0); walk(e.global, "doc/" + k + "/", 0); }
        }
        return out;
    }
    if (Array.isArray(doc)) {
        doc.forEach((e, i) => put(idOf(e, i), e));
        return out;
    }
    if (doc && typeof doc === "object") {
        for (const k of Object.keys(doc)) {
            if (META.has(k)) continue;
            const v = doc[k];
            if (Array.isArray(v)) v.forEach((e, i) => put(k + "/" + idOf(e, i), e));
            else if (v && typeof v === "object") for (const k2 of Object.keys(v)) put(k + "/" + k2, v[k2]);
            else put(k, v);
        }
        return out;
    }
    put("", doc);
    return out;
}

/** What turning `cur` into `next` adds, removes and changes. */
export function wvBkDiffRecords(cur: Map<string, string>, next: Map<string, string>): { added: number; removed: number; changed: number } {
    let added = 0, removed = 0, changed = 0;
    for (const [k, v] of next) {
        if (!cur.has(k)) added++;
        else if (cur.get(k) !== v) changed++;
    }
    for (const k of cur.keys()) if (!next.has(k)) removed++;
    return { added, removed, changed };
}

/** The records of a settings snapshot: every pref by key, the tab groups
 *  (the weavero.tabGroups pref's JSON) on their own. */
export function wvBkSettingsRecords(prefs: Record<string, any> | null): { settings: Map<string, string>; tabGroups: Map<string, string> } {
    const settings = new Map<string, string>(), tabGroups = new Map<string, string>();
    for (const k of Object.keys(prefs || {}).sort()) {
        if (wvBkPrefExcluded(k)) continue;
        const v = (prefs as any)[k];
        if (k === "tabGroups") {
            let arr: any = null;
            try { arr = JSON.parse(String(v)); } catch (e) {}
            if (Array.isArray(arr)) { arr.forEach((g, i) => tabGroups.set(idOf(g, i), wvBkStable(g))); continue; }
        }
        settings.set(k, wvBkStable(v));
    }
    return { settings, tabGroups };
}

// ---- bytes ------------------------------------------------------------------

export function wvBkHex(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return s;
}

/** SHA-256 on the calling thread (nsICryptoHash): the startup's synchronous
 *  settings check, and the fallback. */
export function wvBkSha256Sync(bytes: Uint8Array): string {
    const C: any = Components;
    const ch = C.classes["@mozilla.org/security/hash;1"].createInstance(C.interfaces.nsICryptoHash);
    ch.init(ch.SHA256);
    const SLICE = 1 << 20;
    for (let i = 0; i < bytes.length; i += SLICE) {
        const part = bytes.subarray(i, Math.min(bytes.length, i + SLICE));
        ch.update(part, part.length);
    }
    const bin: string = ch.finish(false);
    let s = "";
    for (let i = 0; i < bin.length; i++) s += ("0" + bin.charCodeAt(i).toString(16)).slice(-2);
    return s;
}

/** SHA-256 off the main thread where WebCrypto is there (the plugin scope
 *  has `crypto`, xpcom/plugins.js), else nsICryptoHash. */
export async function wvBkSha256(bytes: Uint8Array): Promise<string> {
    try {
        const c: any = typeof crypto !== "undefined" ? crypto : null;
        if (c && c.subtle && typeof c.subtle.digest === "function") {
            return wvBkHex(new Uint8Array(await c.subtle.digest("SHA-256", bytes)));
        }
    } catch (e) {}
    return wvBkSha256Sync(bytes);
}

export function wvBkUtf8(s: string): Uint8Array {
    return new TextEncoder().encode(String(s));
}

export function wvBkFromUtf8(b: Uint8Array): string | null {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch (e) { return null; }
}

export function wvBkToBase64(b: Uint8Array): string {
    let s = "";
    const SLICE = 0x8000;
    for (let i = 0; i < b.length; i += SLICE) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + SLICE)) as any);
    return btoa(s);
}

export function wvBkFromBase64(s: string): Uint8Array | null {
    try {
        const bin = atob(String(s));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch (e) { return null; }
}

/** What an IOUtils failure was, for the message: the disk full, a file
 *  another program holds, or anything else. */
export function wvBkErrorKind(e: any): "disk-full" | "locked" | "error" {
    const t = String((e && (e.name + " " + e.message)) || e || "");
    if (/space|disk.?full|ENOSPC|NO_DEVICE_SPACE|quota/i.test(t)) return "disk-full";
    if (/lock|in use|sharing|access.?denied|NotAllowedError|EBUSY|EACCES|EPERM|permission/i.test(t)) return "locked";
    return "error";
}
