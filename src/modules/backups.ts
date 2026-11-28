// Module: backups of Weavero's own data -- <data dir>/weavero/ and the user-set
// extensions.zotero.weavero.* prefs (branch backups, MJT 2026-11-22). The
// inventory, the folder layout and the pure rules are in lib/backup.ts.
//
// WHEN
//   - daily: once per local calendar day, checked a minute after startup and
//     every hour after (weavero.backup.auto, default on); the last
//     weavero.backup.keepDaily (7) are kept;
//   - update: at a startup whose Weavero version differs from the last one
//     seen (backups/state.json), BEFORE any store of the new version reads,
//     migrates or writes a file: _wvBkBoot runs first in onStartup, snapshots
//     the prefs synchronously (before init's pref migrations) and holds every
//     store operation of the instance behind lib/store.ts's startup gate until
//     the copy is written;
//   - manual (Settings -> Back Up Now), pre-restore / pre-import (the state a
//     restore or an import replaces: its undo point), import (an imported
//     file, as a backup), and any "pre-<x>" a caller names (_wvBackupNow).
//   Every reason but daily keeps its last 5 (WV_BK_KEEP_OTHER). A failed
//   backup removes only its own partial folder, never an older one, and says
//   why (disk full, a file another program holds) in a notice and in Settings.
//
// RESTORE AND IMPORT are staged, then applied at the NEXT START of Weavero
// (a Zotero restart, which Settings offers; or an enable): the running
// instance holds every store in memory and writes them at its own pace -- a
// copy written under it would be written over again. At that start, before any
// store reads its file: the settings are applied synchronously (init reads
// prefs synchronously), then behind the gate the current files are backed up
// (pre-restore / pre-import, with the prefs as they were), the chosen backup is
// verified, and its data files written back -- the session-state files
// (windows.json, colstore.json) and the caches stay as they are; a store the
// backup lacks is removed. Any failure before the files are written puts the
// prefs back and leaves the files alone.
//
// INTERNAL API (for later callers -- the sync branch, before it applies a mass
// change):
//   _wvBackupNow(reason = "manual", opts?): Promise<{ ok, dir, name, error?, kind?, empty? }>
//     reason   a lib/backup.ts wvBkValidReason slug ("pre-sync");
//     opts     { quiet?: boolean } -- no notice on failure.
//   Resolves when the backup is written and verified, or failed (never
//   rejects); `dir` is the backup's folder. Serialised with every other backup
//   operation of the instance.

import { wvStoreDir, wvStoreSetGate, wvStoreRetry } from "../lib/store";
import { wvLivePlugin } from "../lib/live";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvStr } from "../lib/l10n";
import {
    WvBkClass, WV_BK_SCHEMA, WV_BK_FORMAT, WV_BK_EXPORT_FORMAT, WV_BK_SETTINGS_FORMAT, WV_BK_FILE_CAP, WV_BK_TOTAL_CAP,
    WV_BK_MAX_FILES, wvBkClassify, wvBkSkipDir, wvBkValidRel, wvBkValidReason, wvBkFolderName, wvBkParseName,
    wvBkLocalDay, wvBkKeepDaily, wvBkRetention, wvBkPrefExcluded, wvBkRecords, wvBkDiffRecords, wvBkSettingsRecords,
    wvBkSha256, wvBkSha256Sync, wvBkUtf8, wvBkFromUtf8, wvBkToBase64, wvBkFromBase64, wvBkErrorKind,
} from "../lib/backup";

declare const Zotero: any;
declare const Services: any;
declare const IOUtils: any;
declare const PathUtils: any;
declare const ChromeUtils: any;

const PREF_BRANCH = "extensions.zotero.weavero.";
const BK_DIR = "backups";
const STATE_FILE = "state.json";
const PENDING_FILE = "restore-pending.json";
const MANIFEST = "manifest.json";
const MARKER = "complete.sha256";
const SETTINGS = "settings.json";
const PARTIAL = ".partial-";
/** The first daily check this long after startup (Zotero's own start first). */
const DAILY_FIRST_MS = 60 * 1000;
const DAILY_EVERY_MS = 60 * 60 * 1000;
/** The startup gate opens after this whatever the copy is doing: Weavero
 *  without its stores is worse than an update backup cut short. */
const GATE_TIMEOUT_MS = 20000;
/** A `.partial-` folder this old is a backup that died (a crash, a quit). */
const PARTIAL_STALE_MS = 60 * 60 * 1000;
/** Room kept free beside a backup. */
const DISK_MARGIN = 16 * 1024 * 1024;

/** The label of a known store in a preview; another file shows its path. */
const STORE_L10N: Record<string, string> = {
    "bookmarks.json": "weavero-backups-store-bookmarks",
    "outlines.json": "weavero-backups-store-outlines",
    "ann-order.json": "weavero-backups-store-ann-order",
    "note-view.json": "weavero-backups-store-note-view",
    "tab-sessions.json": "weavero-backups-store-sessions",
    "saved-windows.json": "weavero-backups-store-saved-windows",
    "tab-groups.json": "weavero-backups-store-tab-groups-file",
    "tab-groups.json.bak": "weavero-backups-store-tab-groups-bak",
    "outline-eval.json": "weavero-backups-store-outline-eval",
    "feeds/settings.json": "weavero-backups-store-feeds",
    "feeds/alerts.json": "weavero-backups-store-feeds-export",
};

/** Caches made from a data file: removed when a restore changes it. */
const DERIVED: Record<string, string[]> = {
    "feeds/settings.json": ["feeds/scores.json"],
};

interface WvBkFile { rel: string; bytes: Uint8Array; size: number; sha256: string; kind: WvBkClass }
interface WvBkSnap { files: WvBkFile[]; skipped: Array<{ path: string; size: number; why: string }>; prefs: Record<string, any>; total: number }
interface WvBkResult { ok: boolean; dir: string | null; name: string | null; error?: string; kind?: string; empty?: boolean; files?: number; size?: number }

const bkDir = () => PathUtils.join(wvStoreDir(), BK_DIR);
const relPath = (root: string, rel: string) => PathUtils.join(root, ...rel.split("/"));
const isNotFound = (e: any) => !!e && (e.name === "NotFoundError" || /not found|NotFound|does not exist|NS_ERROR_FILE_NOT_FOUND/i.test(String(e.message || e)));

/** The user-set prefs under extensions.zotero.weavero., the excluded ones
 *  left out (lib/backup.ts wvBkPrefExcluded). */
export function wvBkPrefsSnapshot(): Record<string, any> {
    const b = Services.prefs.getBranch(PREF_BRANCH);
    const out: Record<string, any> = {};
    for (const k of b.getChildList("").sort()) {
        if (wvBkPrefExcluded(k)) continue;
        try {
            if (!b.prefHasUserValue(k)) continue;
            const t = b.getPrefType(k);
            if (t === b.PREF_BOOL) out[k] = b.getBoolPref(k);
            else if (t === b.PREF_INT) out[k] = b.getIntPref(k);
            else if (t === b.PREF_STRING) out[k] = b.getStringPref(k);
        } catch (e) {}
    }
    return out;
}

/** Make the user-set prefs `target` (excluded keys untouched): a key set now
 *  that `target` lacks goes back to its default. EXCEPT a key with no default
 *  that was set at startup (`bootUser`, the startup snapshot): Gecko cannot
 *  create again, for the rest of the session, a name it loaded from prefs.js
 *  and saw cleared (setXPref throws NS_ERROR_UNEXPECTED; measured 2026-08-24,
 *  memory reference_gecko_cleared_pref_uncreatable) -- a restore that cleared
 *  weavero.tabGroups would leave no tab group savable until a restart. Such a
 *  key keeps its value (`kept`). Returns what it did. */
export function wvBkPrefsApply(target: Record<string, any>, bootUser?: Record<string, any>): { set: number; cleared: number; kept: string[]; failed: string[] } {
    const b = Services.prefs.getBranch(PREF_BRANCH);
    const d = Services.prefs.getDefaultBranch(PREF_BRANCH);
    const now = wvBkPrefsSnapshot();
    const res = { set: 0, cleared: 0, kept: [] as string[], failed: [] as string[] };
    const want = target && typeof target === "object" ? target : {};
    const boot = bootUser || now;
    // getPrefType answers a user-only pref's type on the default branch too
    // (one entry per name): only reading the default tells (backups.spec.js).
    const hasDefault = (k: string) => {
        try {
            const t = b.getPrefType(k);
            if (t === b.PREF_BOOL) d.getBoolPref(k);
            else if (t === b.PREF_INT) d.getIntPref(k);
            else d.getStringPref(k);
            return true;
        } catch (e) { return false; }
    };
    for (const k of Object.keys(now)) {
        if (Object.prototype.hasOwnProperty.call(want, k)) continue;
        if (!hasDefault(k) && Object.prototype.hasOwnProperty.call(boot, k)) { res.kept.push(k); continue; }
        try { b.clearUserPref(k); res.cleared++; } catch (e) { res.failed.push(k); }
    }
    for (const k of Object.keys(want)) {
        if (wvBkPrefExcluded(k)) continue;
        const v = want[k];
        if (Object.prototype.hasOwnProperty.call(now, k) && now[k] === v) continue;
        try {
            if (typeof v === "boolean") b.setBoolPref(k, v);
            else if (typeof v === "number" && Number.isInteger(v)) b.setIntPref(k, v);
            else if (typeof v === "string") b.setStringPref(k, v);
            else { res.failed.push(k); continue; }
            res.set++;
        }
        catch (e) {
            // A default of another type (the pref changed type in a later
            // version): its default stays.
            try { if (b.prefHasUserValue(k)) b.clearUserPref(k); } catch (e2) {}
            res.failed.push(k);
        }
    }
    return res;
}

class _BackupsMixin {
    [k: string]: any;

    // ---- paths, state -----------------------------------------------------------

    _wvBkDir(): string { return bkDir(); }

    _wvBkAuto(): boolean {
        try { const v = Zotero.Prefs.get("weavero.backup.auto"); return v === undefined ? true : !!v; } catch (e) { return true; }
    }

    _wvBkKeepDaily(): number {
        try { return wvBkKeepDaily(Zotero.Prefs.get("weavero.backup.keepDaily")); } catch (e) { return wvBkKeepDaily(null); }
    }

    async _wvBkStateRead(): Promise<any> {
        try {
            const d = JSON.parse(await IOUtils.readUTF8(PathUtils.join(bkDir(), STATE_FILE)));
            if (d && typeof d === "object") return d;
        } catch (e) {}
        return { v: 1 };
    }

    async _wvBkStateWrite(state: any): Promise<void> {
        const p = PathUtils.join(bkDir(), STATE_FILE);
        try {
            await IOUtils.makeDirectory(bkDir(), { ignoreExisting: true, createAncestors: true });
            await IOUtils.writeUTF8(p, JSON.stringify(Object.assign({ v: 1 }, state), null, 1), { tmpPath: p + ".tmp" });
        } catch (e) { Zotero.debug("[Weavero] backups: state write failed: " + e); }
    }

    /** At startup, SYNCHRONOUSLY: when this version differs from the one
     *  state.json records, record it at once and answer `{ from }` (the copy
     *  to take, _wvBkBootAsync); null when there is nothing to take, and
     *  undefined when the state could not be read or written (the async
     *  part then decides, as before). Synchronous on purpose (citations.43
     *  in MJT's profile, 2026-11-22: an install, then a reload one second
     *  later, took two update backups of one version, the reload's start
     *  having read state.json before the install's start wrote it): a second
     *  start of the same version runs after this, so it finds the version
     *  claimed. A few hundred bytes, read as the staged restore is read. */
    _wvBkClaimUpdateSync(version: string): { from: string | null } | null | undefined {
        if (!version) return undefined;
        try {
            const f = Zotero.File.pathToFile(PathUtils.join(bkDir(), STATE_FILE));
            let state: any = { v: 1 };
            if (f.exists()) {
                const d = JSON.parse(String(Zotero.File.getContents(f)));
                if (d && typeof d === "object") state = d;
            }
            if (state.lastVersion === version) return null;
            const from = state.lastVersion || null;
            state.lastVersion = version;
            state.updateClaim = { from, to: version, at: Date.now() };
            const dir = Zotero.File.pathToFile(bkDir());
            if (!dir.exists()) dir.create(1 /* nsIFile.DIRECTORY_TYPE; any missing parent is made too */, 0o755);
            Zotero.File.putContents(f, JSON.stringify(Object.assign({ v: 1 }, state), null, 1));
            return { from };
        }
        catch (e) {
            Zotero.debug("[Weavero] backups: the startup claim failed, deciding later: " + e);
            return undefined;
        }
    }

    async _wvBkStatePatch(patch: any): Promise<void> {
        const s = await this._wvBkStateRead();
        await this._wvBkStateWrite(Object.assign(s, patch));
    }

    /** Every backup operation of this instance, one after the other. */
    _wvBkSerial<T>(fn: () => Promise<T>): Promise<T> {
        const P: any = this;
        const run = (P._wvBkChain || Promise.resolve()).catch(() => {}).then(fn);
        P._wvBkChain = run.catch(() => {});
        return run;
    }

    _wvBkFreeSpace(path: string): number | null {
        try { const n = Number(Zotero.File.pathToFile(path).diskSpaceAvailable); return Number.isFinite(n) ? n : null; } catch (e) { return null; }
    }

    // ---- collecting the current data ---------------------------------------------

    /** The files of weavero/ of the given classes, read and hashed, and the
     *  prefs (`prefs`, or a snapshot now). Throws { kind, error } when a file
     *  cannot be read after two tries, or when the whole is over the cap. */
    async _wvBkCollect(classes: WvBkClass[], prefs?: Record<string, any>): Promise<WvBkSnap> {
        const want = new Set(classes);
        const snap: WvBkSnap = { files: [], skipped: [], prefs: prefs || wvBkPrefsSnapshot(), total: 0 };
        const root = wvStoreDir();
        const walk = async (dir: string, prefix: string, depth: number) => {
            let kids: string[] = [];
            try { kids = await IOUtils.getChildren(dir); } catch (e) { return; }
            kids.sort();
            for (const child of kids) {
                const name = PathUtils.filename(child);
                const rel = prefix + name;
                let st: any = null;
                try { st = await IOUtils.stat(child); } catch (e) { continue; }
                if (st.type === "directory") {
                    if (depth === 0 && wvBkSkipDir(name)) continue;
                    if (depth < 5) await walk(child, rel + "/", depth + 1);
                    continue;
                }
                if (st.type !== "regular") continue;
                const kind = wvBkClassify(rel);
                if (!want.has(kind)) continue;
                if (!wvBkValidRel(rel)) { snap.skipped.push({ path: rel, size: st.size, why: "name" }); continue; }
                if (st.size > WV_BK_FILE_CAP) { snap.skipped.push({ path: rel, size: st.size, why: "too-large" }); continue; }
                if (snap.files.length >= WV_BK_MAX_FILES) { snap.skipped.push({ path: rel, size: st.size, why: "too-many" }); continue; }
                let bytes: Uint8Array | null = null, err: any = null;
                for (let i = 0; i < 3 && !bytes; i++) {
                    try { bytes = await IOUtils.read(child); }
                    catch (e) {
                        err = e;
                        if (isNotFound(e)) break;   // gone meanwhile: not part of this backup
                        await new Promise((r) => setTimeout(r, 300));
                    }
                }
                if (!bytes) {
                    if (isNotFound(err)) continue;
                    throw { kind: wvBkErrorKind(err) === "disk-full" ? "error" : "locked", error: rel + ": " + err };
                }
                snap.total += bytes.length;
                if (snap.total > WV_BK_TOTAL_CAP) throw { kind: "too-large", error: String(snap.total) };
                snap.files.push({ rel, bytes, size: bytes.length, sha256: await wvBkSha256(bytes), kind });
            }
        };
        await walk(root, "", 0);
        return snap;
    }

    // ---- writing a backup --------------------------------------------------------

    _wvBkPlatform(): string {
        return Zotero.isWin ? "win" : Zotero.isMac ? "mac" : "linux";
    }

    /** Write `snap` as a backup of `reason`: a `.partial-` folder, renamed once
     *  its manifest and marker are written. Never touches another backup. */
    async _wvBkWrite(snap: WvBkSnap, reason: string, extra?: any, at?: number): Promise<WvBkResult> {
        const P: any = this;
        const root = bkDir();
        const when = new Date(at || Date.now());
        const fail = (kind: string, error: any): WvBkResult => ({ ok: false, dir: null, name: null, kind, error: String(error) });
        let partial = "";
        try {
            await IOUtils.makeDirectory(root, { ignoreExisting: true, createAncestors: true });
            const settingsText = JSON.stringify({ format: WV_BK_SETTINGS_FORMAT, schema: WV_BK_SCHEMA, branch: PREF_BRANCH, prefs: snap.prefs }, null, 1);
            const settingsBytes = wvBkUtf8(settingsText);
            const need = snap.total + settingsBytes.length + 64 * 1024;
            const free = this._wvBkFreeSpace(root);
            if (free != null && free < need + DISK_MARGIN) return fail("disk-full", "free " + free + " < " + need);
            let name = "";
            for (let n = 0; n < 100; n++) {
                const cand = wvBkFolderName(when, reason, n);
                if (!(await IOUtils.exists(PathUtils.join(root, cand))) && !(await IOUtils.exists(PathUtils.join(root, PARTIAL + cand)))) { name = cand; break; }
            }
            if (!name) return fail("error", "no free name");
            partial = PathUtils.join(root, PARTIAL + name);
            await IOUtils.makeDirectory(partial, { ignoreExisting: false, createAncestors: true });
            for (const f of snap.files) {
                const dest = relPath(PathUtils.join(partial, "data"), f.rel);
                await IOUtils.makeDirectory(PathUtils.parent(dest), { ignoreExisting: true, createAncestors: true });
                await IOUtils.write(dest, f.bytes);
            }
            await IOUtils.write(PathUtils.join(partial, SETTINGS), settingsBytes);
            const manifest: any = {
                format: WV_BK_FORMAT, schema: WV_BK_SCHEMA,
                created: when.toISOString(), createdMs: when.getTime(), reason,
                weaveroVersion: String(P._version || ""), zoteroVersion: String(Zotero.version || ""), platform: this._wvBkPlatform(),
                files: snap.files.map((f) => ({ path: f.rel, size: f.size, sha256: f.sha256, kind: f.kind })),
                settings: { path: SETTINGS, size: settingsBytes.length, sha256: await wvBkSha256(settingsBytes), count: Object.keys(snap.prefs || {}).length },
                skipped: snap.skipped,
            };
            for (const k of ["fromVersion", "toVersion", "note", "origin"]) if (extra && extra[k] != null) manifest[k] = extra[k];
            const manifestBytes = wvBkUtf8(JSON.stringify(manifest, null, 1));
            await IOUtils.write(PathUtils.join(partial, MANIFEST), manifestBytes);
            await IOUtils.writeUTF8(PathUtils.join(partial, MARKER), await wvBkSha256(manifestBytes));
            const dir = PathUtils.join(root, name);
            // Refused on Windows while another process holds a file just written
            // in the folder: retried (a staged restore's undo point, written right
            // before the restore, 2026-11-28).
            // But never onto what a refused move left (Firefox main's IOUtils.cpp
            // CopyOrMoveSync and nsLocalFileWin.cpp CopyMove, read 2026-11-28):
            // when the plain rename is refused Gecko makes `dir` and moves the
            // children one by one -- a move "following links", IOUtils's, stops
            // at the first child, so `dir` is left EMPTY -- and a move onto an
            // existing folder moves the source INTO it, nesting the copy there.
            // An empty `dir` goes before the retry; every child moved is the move
            // done; a part moved stops the backup (incomplete: pruned as damaged).
            await wvStoreRetry("backups: folder rename", dir, () => IOUtils.move(partial, dir), async (e) => {
                const left = (await IOUtils.exists(partial)) ? (await IOUtils.getChildren(partial)).length : 0;
                if (!left && (await IOUtils.exists(PathUtils.join(dir, MARKER)))) {
                    try { await IOUtils.remove(partial, { ignoreAbsent: true }); } catch (e2) {}
                    return "done";
                }
                if (await IOUtils.exists(dir)) {
                    if ((await IOUtils.getChildren(dir)).length) throw e;
                    await IOUtils.remove(dir);
                }
                return "retry";
            });
            partial = "";
            return { ok: true, dir, name, files: snap.files.length, size: snap.total + settingsBytes.length };
        }
        catch (e) {
            if (partial) { try { await IOUtils.remove(partial, { recursive: true, ignoreAbsent: true }); } catch (e2) {} }
            return fail(wvBkErrorKind(e), e);
        }
    }

    /** Collect and write, NOT serialised (the startup gate's own calls, and
     *  callers already on the chain). `skipEmpty`: no backup of nothing. */
    async _wvBkCreateNow(reason: string, opts?: any): Promise<WvBkResult> {
        const o = opts || {};
        if (!wvBkValidReason(reason)) return { ok: false, dir: null, name: null, kind: "error", error: "reason " + reason };
        let snap: WvBkSnap;
        try { snap = await this._wvBkCollect(o.classes || ["data", "session"], o.prefs); }
        catch (e) { return { ok: false, dir: null, name: null, kind: (e && e.kind) || "error", error: String((e && e.error) || e) }; }
        if (o.skipEmpty && !snap.files.length && !Object.keys(snap.prefs).length) return { ok: true, dir: null, name: null, empty: true };
        return this._wvBkWrite(snap, reason, o, o.at);
    }

    /** The internal API (module comment): a backup now, verified; prune after. */
    _wvBackupNow(reason?: string, opts?: any): Promise<WvBkResult> {
        return this._wvBkSerial(() => this._wvBkBackupNow(reason || "manual", opts || {}));
    }

    /** _wvBackupNow's body, for callers already on the chain. */
    async _wvBkBackupNow(why: string, o: any): Promise<WvBkResult> {
        const P: any = this;
        const r = await this._wvBkCreateNow(why, { skipEmpty: why === "daily", at: o.at });
        if (r.ok && r.dir) {
            const v = await this._wvBkValidate(r.dir, true);
            if (!v.ok) {
                try { await IOUtils.remove(r.dir, { recursive: true, ignoreAbsent: true }); } catch (e) {}
                Object.assign(r, { ok: false, dir: null, name: null, kind: "error", error: "verify: " + v.problem });
            }
        }
        if (r.ok && r.name) {
            await this._wvBkPruneNow(r.name);
            await this._wvBkStatePatch({ lastBackup: { at: Date.now(), name: r.name, reason: why }, lastError: null });
        }
        else if (!r.ok) {
            Zotero.debug("[Weavero] backups: " + why + " backup failed (" + r.kind + "): " + r.error);
            await this._wvBkStatePatch({ lastError: { at: Date.now(), reason: why, kind: r.kind, error: r.error } });
            if (!o.quiet && !P._wvDestroyed) this._wvBkNotifyFailure(why, r.kind);
        }
        return r;
    }

    // ---- reading backups ---------------------------------------------------------

    /** Verify a backup folder: the marker is the manifest's hash, every file is
     *  there at its size, and with `full` every file's hash matches. `damaged`
     *  only for what was READ and is wrong (a file that cannot be read now is
     *  not damage: a prune must never remove a good backup over a lock). */
    async _wvBkValidate(dir: string, full: boolean): Promise<{ ok: boolean; manifest?: any; problem?: string; damaged?: boolean; newer?: boolean }> {
        const bad = (problem: string, damaged = true) => ({ ok: false, problem, damaged });
        let mBytes: Uint8Array, marker: string;
        try { mBytes = await IOUtils.read(PathUtils.join(dir, MANIFEST)); }
        catch (e) { return bad("manifest", isNotFound(e)); }
        try { marker = String(await IOUtils.readUTF8(PathUtils.join(dir, MARKER))).trim(); }
        catch (e) { return bad("marker", isNotFound(e)); }
        if ((await wvBkSha256(mBytes)) !== marker) return bad("marker");
        let m: any = null;
        try { m = JSON.parse(wvBkFromUtf8(mBytes) || ""); } catch (e) {}
        if (!m || m.format !== WV_BK_FORMAT || !Array.isArray(m.files)) return bad("manifest");
        if (!(Number.isInteger(m.schema) && m.schema >= 1)) return bad("manifest");
        if (m.schema > WV_BK_SCHEMA) return { ok: false, problem: "newer", damaged: false, newer: true };
        if (m.files.length > WV_BK_MAX_FILES) return bad("manifest");
        const entries: any[] = m.files.map((f: any) => ({ path: f && f.path, size: f && f.size, sha256: f && f.sha256, data: true }));
        if (m.settings) entries.push({ path: SETTINGS, size: m.settings.size, sha256: m.settings.sha256, data: false });
        for (const f of entries) {
            // The path is checked BEFORE it becomes one on disk ("../x").
            if (f.data && !wvBkValidRel(f.path)) return bad("path");
            if (!Number.isInteger(f.size) || typeof f.sha256 !== "string") return bad("manifest");
            f.at = f.data ? relPath(PathUtils.join(dir, "data"), f.path) : PathUtils.join(dir, SETTINGS);
            let st: any;
            try { st = await IOUtils.stat(f.at); } catch (e) { return bad("missing " + f.path, isNotFound(e)); }
            if (st.size !== f.size) return bad("size " + f.path);
            if (full) {
                let b: Uint8Array;
                try { b = await IOUtils.read(f.at); } catch (e) { return bad("read " + f.path, false); }
                if ((await wvBkSha256(b)) !== f.sha256) return bad("hash " + f.path);
            }
        }
        return { ok: true, manifest: m };
    }

    /** The backups, newest first: { name, dir, reason, created, size, ... }
     *  with `valid` from the quick check (no content hashes). */
    async _wvBkList(): Promise<any[]> {
        const root = bkDir();
        let kids: string[] = [];
        try { kids = await IOUtils.getChildren(root); } catch (e) { return []; }
        const out: any[] = [];
        for (const dir of kids) {
            const name = PathUtils.filename(dir);
            const parsed = wvBkParseName(name);
            if (!parsed) continue;
            let st: any = null;
            try { st = await IOUtils.stat(dir); } catch (e) { continue; }
            if (st.type !== "directory") continue;
            const v = await this._wvBkValidate(dir, false);
            const m = v.manifest || {};
            const size = (m.files || []).reduce((a: number, f: any) => a + (f.size || 0), 0) + ((m.settings && m.settings.size) || 0);
            out.push({
                name, dir, valid: v.ok, problem: v.problem || null, damaged: !!v.damaged, newer: !!v.newer,
                reason: m.reason || parsed.reason, created: Number(m.createdMs) || parsed.at,
                size, files: (m.files || []).length, settings: m.settings ? m.settings.count || 0 : 0,
                weaveroVersion: m.weaveroVersion || "", zoteroVersion: m.zoteroVersion || "",
                fromVersion: m.fromVersion || null, toVersion: m.toVersion || null, note: m.note || null, origin: m.origin || null,
            });
        }
        out.sort((a, b) => (b.created - a.created) || (a.name < b.name ? 1 : -1));
        return out;
    }

    /** Remove what is damaged or past retention, and partial folders a dead
     *  backup left. `keep`: the backup just written stays. */
    async _wvBkPruneNow(keep?: string): Promise<string[]> {
        const root = bkDir();
        const removed: string[] = [];
        let kids: string[] = [];
        try { kids = await IOUtils.getChildren(root); } catch (e) { return removed; }
        for (const dir of kids) {
            const name = PathUtils.filename(dir);
            if (!name.startsWith(PARTIAL)) continue;
            try {
                const st: any = await IOUtils.stat(dir);
                if (Date.now() - Number(st.lastModified || 0) > PARTIAL_STALE_MS) {
                    await IOUtils.remove(dir, { recursive: true, ignoreAbsent: true });
                    removed.push(name);
                }
            } catch (e) {}
        }
        const list = await this._wvBkList();
        for (const e of list) {
            if (e.name === keep || e.valid || !e.damaged) continue;
            try { await IOUtils.remove(e.dir, { recursive: true, ignoreAbsent: true }); removed.push(e.name); } catch (x) {}
        }
        const valid = list.filter((e) => e.valid);
        for (const name of wvBkRetention(valid, this._wvBkKeepDaily(), keep)) {
            try { await IOUtils.remove(PathUtils.join(root, name), { recursive: true, ignoreAbsent: true }); removed.push(name); } catch (x) {}
        }
        if (removed.length) Zotero.debug("[Weavero] backups: removed " + removed.join(", "));
        return removed;
    }

    _wvBkPrune(keep?: string): Promise<string[]> {
        return this._wvBkSerial(() => this._wvBkPruneNow(keep));
    }

    // ---- the daily backup --------------------------------------------------------

    /** A daily backup unless one of this local day exists (or automatic
     *  backups are off). `now` for the specs. */
    _wvBkDailyCheck(now?: number): Promise<{ took: boolean; result?: WvBkResult }> {
        const t = now || Date.now();
        // The check and the backup in ONE task of the chain: two checks queued
        // together must not both find no daily backup.
        return this._wvBkSerial(async () => {
            if (!this._wvBkAuto()) return { took: false };
            const day = wvBkLocalDay(t);
            let kids: string[] = [];
            try { kids = await IOUtils.getChildren(bkDir()); } catch (e) {}
            for (const dir of kids) {
                const p = wvBkParseName(PathUtils.filename(dir));
                if (p && p.reason === "daily" && p.day === day && await IOUtils.exists(PathUtils.join(dir, MARKER))) return { took: false };
            }
            const result = await this._wvBkBackupNow("daily", { at: now });
            return { took: !!(result.ok && result.name), result };
        });
    }

    _wvBkScheduleDaily(ms: number) {
        const P: any = this;
        wvClearTimeout(P._wvBkDailyT);
        P._wvBkDailyT = wvTimeout(() => {
            P._wvBkDailyT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            P._wvBkDailyCheck().catch(() => {}).then(() => {
                if (wvLivePlugin() === P && !P._wvDestroyed) P._wvBkScheduleDaily(DAILY_EVERY_MS);
            });
        }, ms);
    }

    // ---- startup: the update backup and a staged restore ----------------------------

    /** FIRST thing at startup (index.ts onStartup, before init): the prefs as
     *  they are, a staged restore's settings applied, and the startup gate
     *  set for the rest (_wvBkBootAsync). Synchronous on purpose: init reads
     *  prefs synchronously right after. */
    _wvBkBoot(version: string, reason: number) {
        const P: any = this;
        let prefsNow: Record<string, any> = {};
        try { prefsNow = wvBkPrefsSnapshot(); } catch (e) {}
        // A previous instance's writes still queued (a reload, an upgrade): the
        // backup copies what they write. Taken NOW, before this instance queues
        // any write that would wait for the gate (waiting for those would
        // never end).
        const chains: Promise<any>[] = [];
        try {
            const c = (Zotero as any)._wvStoreChains;
            if (c && !(Components as any).utils.isDeadWrapper(c)) for (const k of Object.keys(c)) chains.push(c[k]);
        } catch (e) {}
        let pending: any = null;
        try { pending = this._wvBkPendingReadSync(); } catch (e) { Zotero.debug("[Weavero] backups: pending restore unreadable: " + e); }
        if (pending && pending.settings) {
            const s = this._wvBkSettingsReadSync(pending.name);
            if (s.ok) {
                try { pending.applied = wvBkPrefsApply(s.prefs, prefsNow); } catch (e) { pending.settingsProblem = "apply"; }
            }
            else pending.settingsProblem = s.problem;
        }
        // The update copy claimed now, before any other start can read the
        // state (_wvBkClaimUpdateSync). Not with a staged restore: that path
        // records the version itself. Only when automatic backups are on: off,
        // the version is recorded after the async part as before.
        let claim: { from: string | null } | null | undefined = undefined;
        if (!pending && this._wvBkAuto()) claim = this._wvBkClaimUpdateSync(String(version || ""));
        // The same instance started twice (the specs' boot()): the second
        // waits for the first.
        try { if (P._wvBkBootPromise) chains.push(P._wvBkBootPromise); } catch (e) {}
        let gateT: any = null;
        const work = this._wvBkBootAsync({ version: String(version || ""), reason, prefsNow, chains, pending, claim });
        P._wvBkBootPromise = work;
        const timeout = new Promise<void>((r) => {
            gateT = wvTimeout(() => {
                P._wvBkBootTimedOut = true;
                Zotero.debug("[Weavero] backups: the startup copy took over " + GATE_TIMEOUT_MS + " ms; the stores go on");
                r();
            }, GATE_TIMEOUT_MS);
        });
        work.then(() => wvClearTimeout(gateT), () => wvClearTimeout(gateT));
        wvStoreSetGate(Promise.race([work, timeout]));
    }

    async _wvBkBootAsync(o: any): Promise<void> {
        const P: any = this;
        try {
            for (const c of o.chains || []) { try { await c; } catch (e) {} }
            const state = await this._wvBkStateRead();
            // o.claim: { from } = this start claimed the version (take the
            // copy); null = already recorded (nothing to take); undefined = no
            // claim made (decide from the state, as before the claim existed).
            const claimed = o.claim !== undefined;
            const changed = claimed ? !!o.claim : state.lastVersion !== o.version;
            const from = claimed ? (o.claim ? o.claim.from : null) : (state.lastVersion || null);
            if (o.pending) {
                const res = await this._wvBkApplyPending(o.pending, o.prefsNow, changed ? from : null, o.version);
                state.lastRestore = res;
                if (!P._wvDestroyed) this._wvBkNotifyRestore(res);
            }
            else if (changed && this._wvBkAuto()) {
                // The NEWEST backup already the copy before the update to this
                // version (a start that decided without the claim, after one
                // that took it): reuse it. Only the newest: X -> Y -> X again
                // has "update to Y" newest, and takes a fresh copy.
                let newest: any = null;
                try { newest = (await this._wvBkList()).find((e: any) => e.valid) || null; } catch (e) {}
                const r: WvBkResult = newest && newest.reason === "update" && newest.toVersion === o.version
                    ? { ok: true, dir: newest.dir, name: newest.name }
                    : await this._wvBkCreateNow("update", { prefs: o.prefsNow, fromVersion: from, toVersion: o.version, skipEmpty: true });
                if (r.ok && r.name) state.lastBackup = { at: Date.now(), name: r.name, reason: "update" };
                else if (!r.ok) {
                    state.lastError = { at: Date.now(), reason: "update", kind: r.kind, error: r.error };
                    Zotero.debug("[Weavero] backups: the update backup failed (" + r.kind + "): " + r.error);
                    if (!P._wvDestroyed) this._wvBkNotifyFailure("update", r.kind);
                }
                // A failed copy gives the claim back: the next start tries again.
                if (!r.ok && claimed) {
                    state.lastVersion = from;
                    delete state.updateClaim;
                    await this._wvBkStateWrite(state);
                    return;
                }
            }
            delete state.updateClaim;
            state.lastVersion = o.version;
            await this._wvBkStateWrite(state);
        }
        catch (e) { Zotero.debug("[Weavero] backups: startup err: " + e); }
        finally {
            if (!P._wvDestroyed) {
                // Retention and dead partial folders, off the gate.
                this._wvBkPrune().catch(() => {});
                this._wvBkScheduleDaily(DAILY_FIRST_MS);
            }
        }
    }

    _wvBkPendingPath(): string { return PathUtils.join(bkDir(), PENDING_FILE); }

    /** The staged restore, read synchronously at startup (a few hundred bytes). */
    _wvBkPendingReadSync(): any {
        const f = Zotero.File.pathToFile(this._wvBkPendingPath());
        if (!f.exists()) return null;
        const d = JSON.parse(String(Zotero.File.getContents(f)));
        if (!d || d.v !== 1 || !wvBkParseName(d.name) || !(d.kind === "restore" || d.kind === "import")) {
            try { f.remove(false); } catch (e) {}
            return null;
        }
        return { v: 1, name: d.name, kind: d.kind, data: d.data !== false, settings: d.settings !== false, stagedAt: d.stagedAt || 0 };
    }

    async _wvBkPendingRead(): Promise<any> {
        try {
            const d = JSON.parse(await IOUtils.readUTF8(this._wvBkPendingPath()));
            if (d && d.v === 1 && wvBkParseName(d.name)) return d;
        } catch (e) {}
        return null;
    }

    /** A backup's settings, verified (marker -> manifest -> settings hash),
     *  synchronously: they are applied before init. */
    _wvBkSettingsReadSync(name: string): { ok: boolean; prefs?: Record<string, any>; problem?: string } {
        try {
            if (!wvBkParseName(name)) return { ok: false, problem: "name" };
            const dir = PathUtils.join(bkDir(), name);
            const read = (p: string) => String(Zotero.File.getContents(Zotero.File.pathToFile(p)));
            const mText = read(PathUtils.join(dir, MANIFEST));
            if (wvBkSha256Sync(wvBkUtf8(mText)) !== read(PathUtils.join(dir, MARKER)).trim()) return { ok: false, problem: "marker" };
            const m = JSON.parse(mText);
            if (!m || m.format !== WV_BK_FORMAT || !(m.schema <= WV_BK_SCHEMA) || !m.settings) return { ok: false, problem: "manifest" };
            const sText = read(PathUtils.join(dir, SETTINGS));
            if (wvBkSha256Sync(wvBkUtf8(sText)) !== m.settings.sha256) return { ok: false, problem: "hash " + SETTINGS };
            const s = JSON.parse(sText);
            if (!s || s.format !== WV_BK_SETTINGS_FORMAT || !s.prefs || typeof s.prefs !== "object") return { ok: false, problem: "settings" };
            return { ok: true, prefs: s.prefs };
        }
        catch (e) { return { ok: false, problem: "read: " + e }; }
    }

    /** Write `bytes` to weavero/<rel> atomically. The replace (the tmp file
     *  renamed over the store) is refused on Windows while another process
     *  holds the store, so it is retried as the stores' own writes are: a
     *  staged restore with no retry here was undone and used up by one refused
     *  operation (backups.spec.js, Zotero 11 full run, 2026-11-28). */
    async _wvBkWriteStore(rel: string, bytes: Uint8Array): Promise<void> {
        const dest = relPath(wvStoreDir(), rel);
        await IOUtils.makeDirectory(PathUtils.parent(dest), { ignoreExisting: true, createAncestors: true });
        await wvStoreRetry("backups: store write", dest, () => IOUtils.write(dest, bytes, { tmpPath: dest + ".tmp" }));
    }

    /** Make weavero/'s data files those of backup `dir` (verified): each of
     *  its data files written, each current data file it lacks removed, the
     *  caches made from a changed one removed. Session state and caches stay. */
    async _wvBkPutData(dir: string, manifest: any): Promise<{ written: number; removed: number }> {
        const want = new Map<string, any>();
        for (const f of manifest.files || []) if (wvBkClassify(f.path) === "data") want.set(f.path, f);
        const cur = await this._wvBkCollect(["data"], {});
        const curHash = new Map(cur.files.map((f) => [f.rel, f.sha256] as [string, string]));
        let written = 0, removed = 0;
        const changed = new Set<string>();
        for (const [rel, f] of want) {
            if (curHash.get(rel) === f.sha256) continue;
            const b: Uint8Array = await IOUtils.read(relPath(PathUtils.join(dir, "data"), rel));
            if ((await wvBkSha256(b)) !== f.sha256) throw { kind: "error", error: "hash " + rel };
            await this._wvBkWriteStore(rel, b);
            changed.add(rel);
            written++;
        }
        for (const rel of curHash.keys()) {
            if (want.has(rel)) continue;
            // A removal needs delete access too: refused like the replace while
            // another process holds the store, so retried the same way (review,
            // 2026-11-28; a refused try is a no-op, and a removal that landed
            // is a no-op to retry).
            const p = relPath(wvStoreDir(), rel);
            await wvStoreRetry("backups: store remove", p, () => IOUtils.remove(p, { ignoreAbsent: true }));
            changed.add(rel);
            removed++;
        }
        for (const rel of changed) for (const d of DERIVED[rel] || []) {
            try { await IOUtils.remove(relPath(wvStoreDir(), d), { ignoreAbsent: true }); } catch (e) {}
        }
        return { written, removed };
    }

    /** The staged restore, behind the startup gate (module comment). */
    async _wvBkApplyPending(pending: any, prefsNow: Record<string, any>, fromVersion: string | null, version: string): Promise<any> {
        const P: any = this;
        const res: any = { ok: false, at: Date.now(), name: pending.name, kind: pending.kind, data: !!pending.data, settings: !!pending.settings };
        const putPrefsBack = () => { if (pending.applied) { try { wvBkPrefsApply(prefsNow, prefsNow); } catch (e) {} } };
        const done = async () => { try { await IOUtils.remove(this._wvBkPendingPath(), { ignoreAbsent: true }); } catch (e) {} return res; };
        const dir = PathUtils.join(bkDir(), pending.name);
        if (pending.settings && pending.settingsProblem) { res.problem = "settings: " + pending.settingsProblem; return done(); }
        const v = await this._wvBkValidate(dir, true);
        if (!v.ok) { putPrefsBack(); res.problem = v.problem; return done(); }
        // The undo point: what is here now, with the prefs as they were.
        const pre = await this._wvBkCreateNow(pending.kind === "import" ? "pre-import" : "pre-restore",
            { prefs: prefsNow, note: pending.name, fromVersion, toVersion: fromVersion ? version : null, skipEmpty: true });
        if (!pre.ok) { putPrefsBack(); res.problem = "backup first: " + pre.kind; res.error = pre.error; return done(); }
        res.pre = pre.name;
        if (P._wvBkBootTimedOut) { putPrefsBack(); res.problem = "timeout"; return done(); }
        if (pending.data) {
            try { Object.assign(res, await this._wvBkPutData(dir, v.manifest)); }
            catch (e) {
                // Half written: put the files back as they were.
                res.problem = "write: " + ((e && e.error) || e);
                if (pre.dir) {
                    try {
                        const pv = await this._wvBkValidate(pre.dir, true);
                        if (pv.ok) await this._wvBkPutData(pre.dir, pv.manifest);
                    } catch (e2) { res.problem += "; put back: " + e2; }
                }
                putPrefsBack();
                return done();
            }
        }
        res.ok = true;
        if (pending.applied) res.prefs = { set: pending.applied.set, cleared: pending.applied.cleared, kept: pending.applied.kept.length, failed: pending.applied.failed.length };
        Zotero.debug("[Weavero] backups: restored " + pending.name + " (" + JSON.stringify(res) + ")");
        return done();
    }

    // ---- staging a restore ---------------------------------------------------------

    async _wvBkStage(name: string, kind: "restore" | "import", opts: any): Promise<{ ok: boolean; problem?: string }> {
        const data = !opts || opts.data !== false, settings = !opts || opts.settings !== false;
        if (!data && !settings) return { ok: false, problem: "nothing" };
        if (!wvBkParseName(name)) return { ok: false, problem: "name" };
        const dir = PathUtils.join(bkDir(), name);
        const v = await this._wvBkValidate(dir, true);
        if (!v.ok) {
            if (v.damaged) { try { await IOUtils.remove(dir, { recursive: true, ignoreAbsent: true }); } catch (e) {} }
            return { ok: false, problem: v.newer ? "newer" : "damaged" };
        }
        const p = this._wvBkPendingPath();
        await IOUtils.writeUTF8(p, JSON.stringify({ v: 1, name, kind, data, settings, stagedAt: Date.now() }), { tmpPath: p + ".tmp" });
        return { ok: true };
    }

    /** Stage backup `name` for the next start. `opts`: { data, settings }. */
    _wvBkStageRestore(name: string, opts?: any): Promise<{ ok: boolean; problem?: string }> {
        return this._wvBkSerial(() => this._wvBkStage(name, "restore", opts));
    }

    _wvBkCancelPending(): Promise<void> {
        return this._wvBkSerial(async () => { try { await IOUtils.remove(this._wvBkPendingPath(), { ignoreAbsent: true }); } catch (e) {} });
    }

    // ---- preview -------------------------------------------------------------------

    /** A source to preview or restore from a backup folder: its data files and
     *  settings, verified. */
    async _wvBkSourceOf(name: string): Promise<any> {
        const dir = PathUtils.join(bkDir(), name);
        const v = await this._wvBkValidate(dir, true);
        if (!v.ok) {
            if (v.damaged) { try { await IOUtils.remove(dir, { recursive: true, ignoreAbsent: true }); } catch (e) {} }
            return { ok: false, problem: v.newer ? "newer" : "damaged" };
        }
        const files = new Map<string, Uint8Array>();
        for (const f of v.manifest.files) {
            if (wvBkClassify(f.path) !== "data") continue;
            files.set(f.path, await IOUtils.read(relPath(PathUtils.join(dir, "data"), f.path)));
        }
        let prefs: any = null;
        try { prefs = JSON.parse(await IOUtils.readUTF8(PathUtils.join(dir, SETTINGS))).prefs || {}; } catch (e) {}
        return { ok: true, name, manifest: v.manifest, files, prefs };
    }

    /** What restoring `src` would change, per store: { stores: [{ rel, label,
     *  added, removed, changed, whole }], settings, tabGroups, lines, changes }.
     *  `opts.current` / `opts.currentPrefs` stand for what is here now (the
     *  specs); otherwise weavero/'s data files and the prefs are read. */
    async _wvBkPreview(src: any, opts?: any): Promise<any> {
        const data = !opts || opts.data !== false, settings = !opts || opts.settings !== false;
        const given: Map<string, Uint8Array> | null = opts && opts.current ? opts.current : null;
        const out: any = { stores: [], settings: null, tabGroups: null, lines: [], changes: 0 };
        const parse = (b: Uint8Array | undefined) => {
            if (!b) return undefined;
            const t = wvBkFromUtf8(b);
            if (t == null) return undefined;
            try { return JSON.parse(t); } catch (e) { return undefined; }
        };
        if (data) {
            const curFiles = new Map<string, WvBkFile>();
            if (given) {
                for (const [rel, b] of given) curFiles.set(rel, { rel, bytes: b, size: b.length, sha256: await wvBkSha256(b), kind: "data" });
            }
            else {
                const cur = await this._wvBkCollect(["data"], {});
                for (const f of cur.files) curFiles.set(f.rel, f);
            }
            const rels = [...new Set([...curFiles.keys(), ...(src.files as Map<string, Uint8Array>).keys()])].sort();
            for (const rel of rels) {
                const a = curFiles.get(rel), b: Uint8Array | undefined = src.files.get(rel);
                if (a && b && a.size === b.length && a.sha256 === await wvBkSha256(b)) continue;
                const row: any = { rel, label: STORE_L10N[rel] ? wvStr(STORE_L10N[rel], null, null) : rel, added: 0, removed: 0, changed: 0, whole: null };
                const da = a ? parse(a.bytes) : undefined, db = b ? parse(b) : undefined;
                if (a && b && da !== undefined && db !== undefined) {
                    Object.assign(row, wvBkDiffRecords(wvBkRecords(rel, da), wvBkRecords(rel, db)));
                    if (!row.added && !row.removed && !row.changed) row.whole = "changed";
                }
                else row.whole = !a ? "added" : !b ? "removed" : "changed";
                out.stores.push(row);
            }
        }
        if (settings && src.prefs) {
            const cur = wvBkSettingsRecords(opts && opts.currentPrefs ? opts.currentPrefs : wvBkPrefsSnapshot()), next = wvBkSettingsRecords(src.prefs);
            const s = wvBkDiffRecords(cur.settings, next.settings), g = wvBkDiffRecords(cur.tabGroups, next.tabGroups);
            if (g.added || g.removed || g.changed) out.tabGroups = Object.assign({ label: wvStr("weavero-backups-store-tab-groups", null, null) }, g);
            if (s.added || s.removed || s.changed) out.settings = Object.assign({ label: wvStr("weavero-backups-store-settings", null, null) }, s);
        }
        const rows = [...out.stores, ...(out.tabGroups ? [out.tabGroups] : []), ...(out.settings ? [out.settings] : [])];
        for (const r of rows) {
            out.changes++;
            out.lines.push(wvStr("weavero-backups-diff-line", { store: r.label, changes: this._wvBkChangesText(r) }, null));
        }
        if (!rows.length) out.lines.push(wvStr("weavero-backups-diff-none", null, null));
        return out;
    }

    _wvBkChangesText(r: any): string {
        if (r.whole === "added") return wvStr("weavero-backups-diff-file-added", null, null);
        if (r.whole === "removed") return wvStr("weavero-backups-diff-file-removed", null, null);
        if (r.whole === "changed") return wvStr("weavero-backups-diff-file-changed", null, null);
        const parts: string[] = [];
        if (r.added) parts.push(wvStr("weavero-backups-diff-added", { count: r.added }, null));
        if (r.removed) parts.push(wvStr("weavero-backups-diff-removed", { count: r.removed }, null));
        if (r.changed) parts.push(wvStr("weavero-backups-diff-changed", { count: r.changed }, null));
        try { return new Intl.ListFormat(Zotero.locale || undefined, { type: "unit", style: "short" }).format(parts); }
        catch (e) { return parts.join(", "); }
    }

    // ---- export and import -----------------------------------------------------------

    /** All Weavero data and settings as one JSON file at `path`: a backup's
     *  layout (manifest, marker, settings, data files) in one document, data
     *  files only (the session state means nothing on another computer). */
    async _wvBkExport(path: string): Promise<WvBkResult> {
        return this._wvBkSerial(async () => {
            let snap: WvBkSnap;
            try { snap = await this._wvBkCollect(["data"]); }
            catch (e) { return { ok: false, dir: null, name: null, kind: (e && e.kind) || "error", error: String((e && e.error) || e) }; }
            const P: any = this;
            const when = new Date();
            const settingsText = JSON.stringify({ format: WV_BK_SETTINGS_FORMAT, schema: WV_BK_SCHEMA, branch: PREF_BRANCH, prefs: snap.prefs }, null, 1);
            const files: Record<string, any> = {};
            for (const f of snap.files) {
                const t = wvBkFromUtf8(f.bytes);
                files[f.rel] = t != null ? { utf8: t } : { base64: wvBkToBase64(f.bytes) };
            }
            const manifest = {
                format: WV_BK_FORMAT, schema: WV_BK_SCHEMA, created: when.toISOString(), createdMs: when.getTime(), reason: "export",
                weaveroVersion: String(P._version || ""), zoteroVersion: String(Zotero.version || ""), platform: this._wvBkPlatform(),
                files: snap.files.map((f) => ({ path: f.rel, size: f.size, sha256: f.sha256, kind: f.kind })),
                settings: { path: SETTINGS, size: wvBkUtf8(settingsText).length, sha256: await wvBkSha256(wvBkUtf8(settingsText)), count: Object.keys(snap.prefs).length },
                skipped: snap.skipped,
            };
            const manifestText = JSON.stringify(manifest, null, 1);
            const doc = { format: WV_BK_EXPORT_FORMAT, schema: WV_BK_SCHEMA, manifest: manifestText, complete: await wvBkSha256(wvBkUtf8(manifestText)), settings: settingsText, files };
            try {
                await IOUtils.writeUTF8(path, JSON.stringify(doc), { tmpPath: path + ".tmp" });
                return { ok: true, dir: path, name: PathUtils.filename(path), files: snap.files.length, size: snap.total };
            }
            catch (e) { return { ok: false, dir: null, name: null, kind: wvBkErrorKind(e), error: String(e) }; }
        });
    }

    /** Read and verify an export file: { ok, source } or { ok: false, problem }
     *  -- "too-large" (checked before anything is decoded), "not-weavero",
     *  "newer" (a schema this Weavero cannot read), "damaged" (a hash, a size,
     *  a path that does not match). */
    async _wvBkImportRead(path: string): Promise<any> {
        const no = (problem: string, detail?: any) => ({ ok: false, problem, detail: detail == null ? undefined : String(detail) });
        let st: any;
        try { st = await IOUtils.stat(path); } catch (e) { return no("read", e); }
        // Base64 grows a binary file by a third; text stays about its size.
        if (!(st.size > 0) || st.size > Math.ceil(WV_BK_TOTAL_CAP * 1.4) + 1024 * 1024) return no("too-large", st.size);
        let doc: any = null;
        try { doc = JSON.parse(String(await IOUtils.readUTF8(path))); } catch (e) { return no("not-weavero", e); }
        if (!doc || typeof doc !== "object" || doc.format !== WV_BK_EXPORT_FORMAT) return no("not-weavero");
        if (!Number.isInteger(doc.schema) || doc.schema < 1) return no("not-weavero");
        if (doc.schema > WV_BK_SCHEMA) return no("newer", doc.schema);
        if (typeof doc.manifest !== "string" || typeof doc.complete !== "string" || typeof doc.settings !== "string") return no("damaged", "parts");
        if ((await wvBkSha256(wvBkUtf8(doc.manifest))) !== doc.complete) return no("damaged", "marker");
        let m: any = null;
        try { m = JSON.parse(doc.manifest); } catch (e) { return no("damaged", "manifest"); }
        if (!m || m.format !== WV_BK_FORMAT || !Array.isArray(m.files)) return no("damaged", "manifest");
        if (!Number.isInteger(m.schema) || m.schema > WV_BK_SCHEMA) return no("newer", m.schema);
        if (m.files.length > WV_BK_MAX_FILES) return no("too-large", "files");
        const declared = m.files.reduce((a: number, f: any) => a + (Number(f && f.size) || 0), 0);
        if (declared > WV_BK_TOTAL_CAP) return no("too-large", declared);
        const files = new Map<string, Uint8Array>();
        const entries = doc.files && typeof doc.files === "object" ? doc.files : {};
        for (const f of m.files) {
            if (!f || !wvBkValidRel(f.path) || !Number.isInteger(f.size) || f.size < 0 || f.size > WV_BK_FILE_CAP || typeof f.sha256 !== "string") return no("damaged", "entry");
            if (wvBkClassify(f.path) !== "data") continue;
            const e = entries[f.path];
            if (!e || typeof e !== "object") return no("damaged", "missing " + f.path);
            let b: Uint8Array | null = null;
            if (typeof e.utf8 === "string") {
                // A UTF-8 text is never longer, in UTF-16 units, than its bytes.
                if (e.utf8.length > f.size) return no("damaged", "size " + f.path);
                b = wvBkUtf8(e.utf8);
            }
            else if (typeof e.base64 === "string") {
                if (e.base64.length > Math.ceil(f.size / 3) * 4 + 4) return no("damaged", "size " + f.path);
                b = wvBkFromBase64(e.base64);
            }
            if (!b || b.length !== f.size || (await wvBkSha256(b)) !== f.sha256) return no("damaged", "hash " + f.path);
            files.set(f.path, b);
        }
        const sBytes = wvBkUtf8(doc.settings);
        if (!m.settings || sBytes.length !== m.settings.size || (await wvBkSha256(sBytes)) !== m.settings.sha256) return no("damaged", "settings");
        let s: any = null;
        try { s = JSON.parse(doc.settings); } catch (e) {}
        if (!s || s.format !== WV_BK_SETTINGS_FORMAT || !s.prefs || typeof s.prefs !== "object" || Array.isArray(s.prefs)) return no("damaged", "settings");
        const prefs: Record<string, any> = {};
        for (const k of Object.keys(s.prefs)) {
            const v = s.prefs[k];
            if (k.length > 200 || !/^[A-Za-z0-9_.-]+$/.test(k)) return no("damaged", "pref " + k.slice(0, 40));
            if (!(typeof v === "boolean" || typeof v === "string" || (typeof v === "number" && Number.isInteger(v)))) return no("damaged", "pref " + k);
            if (!wvBkPrefExcluded(k)) prefs[k] = v;
        }
        return {
            ok: true,
            source: { kind: "import", file: PathUtils.filename(path), manifest: m, files, prefs,
                created: Number(m.createdMs) || Date.parse(m.created) || 0, weaveroVersion: String(m.weaveroVersion || "") },
        };
    }

    /** An import, confirmed: written as a backup ("import"), then staged. */
    _wvBkStageImport(src: any, opts?: any): Promise<{ ok: boolean; problem?: string; name?: string }> {
        return this._wvBkSerial(async () => {
            const files: WvBkFile[] = [];
            let total = 0;
            for (const [rel, b] of src.files as Map<string, Uint8Array>) {
                files.push({ rel, bytes: b, size: b.length, sha256: await wvBkSha256(b), kind: "data" });
                total += b.length;
            }
            const r = await this._wvBkWrite({ files, skipped: [], prefs: src.prefs || {}, total }, "import",
                { note: src.file, origin: { created: src.manifest.created, weaveroVersion: src.manifest.weaveroVersion, zoteroVersion: src.manifest.zoteroVersion } });
            if (!r.ok) return { ok: false, problem: r.kind || "error" };
            const st = await this._wvBkStage(r.name as string, "import", opts);
            if (st.ok) await this._wvBkPruneNow(r.name as string);
            return Object.assign(st, { name: r.name });
        });
    }

    // ---- what Settings shows -------------------------------------------------------

    async _wvBkStatus(): Promise<any> {
        const [list, state, pending] = await Promise.all([this._wvBkList(), this._wvBkStateRead(), this._wvBkPendingRead()]);
        const valid = list.filter((e) => e.valid);
        return {
            dir: bkDir(), last: valid[0] || null, count: valid.length,
            size: valid.reduce((a, e) => a + (e.size || 0), 0),
            lastError: state.lastError || null, lastRestore: state.lastRestore || null,
            pending: pending ? Object.assign({ entry: list.find((e) => e.name === pending.name) || null }, pending) : null,
            list: valid,
        };
    }

    _wvBkDateText(ms: number): string {
        try { return new Date(ms).toLocaleString(Zotero.locale || undefined, { dateStyle: "medium", timeStyle: "short" } as any); }
        catch (e) { return new Date(ms).toLocaleString(); }
    }

    _wvBkSizeText(bytes: number): string {
        const mb = (bytes || 0) / (1024 * 1024);
        const gb = mb >= 1024;
        const n = gb ? mb / 1024 : mb;
        let s = String(Math.round(n * 10) / 10);
        try { s = (Math.round(n * 10) / 10).toLocaleString(Zotero.locale || undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); } catch (e) {}
        return wvStr("weavero-sdt-build-size-one", { n: s, unit: gb ? "GB" : "MB" }, null);
    }

    _wvBkReasonText(e: any): string {
        switch (e && e.reason) {
            case "daily": return wvStr("weavero-backups-reason-daily", null, null);
            case "manual": return wvStr("weavero-backups-reason-manual", null, null);
            case "pre-restore": return wvStr("weavero-backups-reason-pre-restore", null, null);
            case "pre-import": return wvStr("weavero-backups-reason-pre-import", null, null);
            case "import": return wvStr("weavero-backups-reason-import", { file: String(e.note || "") }, null);
            case "update":
                return e.fromVersion ? wvStr("weavero-backups-reason-update-from", { from: e.fromVersion, to: e.toVersion || e.weaveroVersion || "" }, null)
                    : wvStr("weavero-backups-reason-update", { to: e.toVersion || e.weaveroVersion || "" }, null);
            default: return wvStr("weavero-backups-reason-other", { reason: String(e && e.reason || "") }, null);
        }
    }

    /** One line of the Restore list. */
    _wvBkRowText(e: any): string {
        return wvStr("weavero-backups-row", { date: this._wvBkDateText(e.created), reason: this._wvBkReasonText(e), size: this._wvBkSizeText(e.size) }, null);
    }

    _wvBkProblemText(problem: string): string {
        const p = String(problem || "");
        if (p === "disk-full") return wvStr("weavero-backups-failed-disk-full", null, null);
        if (p === "locked") return wvStr("weavero-backups-failed-locked", null, null);
        if (p === "too-large") return wvStr("weavero-backups-failed-too-large", null, null);
        if (p === "newer") return wvStr("weavero-backups-import-newer", null, null);
        if (p === "not-weavero") return wvStr("weavero-backups-import-not-weavero", null, null);
        if (p === "damaged") return wvStr("weavero-backups-damaged", null, null);
        return wvStr("weavero-backups-failed-other", { error: p }, null);
    }

    // ---- notices, prompts, files -------------------------------------------------------

    _wvBkNotifyFailure(reason: string, kind?: string) {
        const P: any = this;
        P._wvBkNotified = P._wvBkNotified || {};
        const key = reason + ":" + kind;
        if (P._wvBkNotified[key]) return;
        P._wvBkNotified[key] = true;
        const show = () => {
            try {
                if (wvLivePlugin() !== P || P._wvDestroyed) return;
                this._wvToast(wvStr("weavero-backups-failed-title", null, null),
                    [this._wvBkProblemText(kind || "error"), wvStr("weavero-backups-failed-kept", null, null)], { id: "wv-bk-toast" });
            } catch (e) {}
        };
        try { Zotero.uiReadyPromise.then(() => wvTimeout(show, 2000)); } catch (e) {}
    }

    _wvBkNotifyRestore(res: any) {
        const P: any = this;
        const show = () => {
            try {
                if (wvLivePlugin() !== P || P._wvDestroyed) return;
                const at = wvBkParseName(res.name);
                const date = at ? this._wvBkDateText(at.at) : res.name;
                if (res.ok) this._wvToast(wvStr("weavero-backups-restored-title", null, null), [wvStr("weavero-backups-restored", { date }, null)], { id: "wv-bk-toast", accent: "info", autoCloseMs: 15000 });
                else this._wvToast(wvStr("weavero-backups-restore-failed-title", null, null), [wvStr("weavero-backups-restore-failed", { date }, null), String(res.problem || "")], { id: "wv-bk-toast" });
            } catch (e) {}
        };
        try { Zotero.uiReadyPromise.then(() => wvTimeout(show, 2500)); } catch (e) {}
    }

    /** Settings' one question before a restore or an import: 0 restart now,
     *  1 at the next start, 2 cancel. */
    _wvBkAsk(win: any, text: { title: string; body: string }): number {
        const ps = Services.prompt;
        const flags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING + ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING
            + ps.BUTTON_POS_2 * ps.BUTTON_TITLE_CANCEL + ps.BUTTON_POS_2_DEFAULT;
        return ps.confirmEx(win || null, text.title, text.body, flags,
            wvStr("weavero-backups-ask-restart", null, null), wvStr("weavero-backups-ask-later", null, null), null, null, {});
    }

    _wvBkRestartNow() {
        // `quit` in Zotero 11 (utilities_internal.js; `quitZotero` deprecated there).
        try {
            const I: any = Zotero.Utilities.Internal;
            if (typeof I.quit === "function") I.quit(true);
            else I.quitZotero(true);
        }
        catch (e) { Zotero.debug("[Weavero] backups: restart err: " + e); }
    }

    async _wvBkPick(win: any, mode: "save" | "open"): Promise<string | null> {
        const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
        const fp = new FilePicker();
        fp.init(win, wvStr(mode === "save" ? "weavero-backups-export-title" : "weavero-backups-import-title", null, null), mode === "save" ? fp.modeSave : fp.modeOpen);
        fp.appendFilter("JSON", "*.json");
        if (mode === "save") fp.defaultString = "weavero-data-" + wvBkLocalDay(Date.now()) + ".json";
        const rv = await fp.show();
        if (rv !== fp.returnOK && rv !== fp.returnReplace) return null;
        return String(fp.file);
    }

    async _wvBkOpenFolder(): Promise<void> {
        try { await IOUtils.makeDirectory(bkDir(), { ignoreExisting: true, createAncestors: true }); } catch (e) {}
        try { Zotero.launchFile(bkDir()); } catch (e) { Zotero.debug("[Weavero] backups: open folder err: " + e); }
    }

    _wvBkDestroy() {
        const P: any = this;
        wvClearTimeout(P._wvBkDailyT);
        P._wvBkDailyT = null;
        P._wvBkNotified = null;
    }
}

const _backupsDescriptors = Object.getOwnPropertyDescriptors(_BackupsMixin.prototype);
delete (_backupsDescriptors as any).constructor;
export const backupsMethods = _backupsDescriptors;
