// Module: named TAB SESSIONS — capture the set of open tabs across all main
// windows into a NAMED session, and switch between sessions (close the current
// reader/note tabs, reopen the saved set).
//
// Distinct from the internal `_wvWindowStore*` plumbing in modules/tabs.ts
// (file `weavero/windows.json`), which persists Weavero's OWN auxiliary windows
// (dev main windows + reader windows) so they reopen across a restart. That one
// is plumbing; THIS is the user-facing feature the "switch between sets of tabs"
// request asked for. The methods here use the `_wvTabSession*` prefix and a
// separate store file (`weavero/tab-sessions.json`).
//
// Storage doc captures the full window TOPOLOGY:
//   { version: 1, sessions: [ { id, name, created, modified,
//       windows: [ { kind: "main"|"reader",
//           tabs: [ { type:"reader"|"note", title, libraryID, itemKey,
//                     location, selected, pinned? } ],
//           collection?, columnPrefs? } ] } ] }   // main windows only
// Every main window and every reader window is one `windows` entry, in order.
// A main window also carries `collection` (the selected library/collection
// tree-row id, e.g. "L1"/"C123") and `columnPrefs` (the items-tree column
// layout + sort — Zotero's per-dataKey `_columnPrefs`).
// `location` is { pageIndex } for PDFs — informational + lets a restored session
// win over the live last-page if the doc was moved elsewhere meanwhile.
// EPUB/snapshot/note records carry no location; reopening returns them to
// Zotero's own remembered position automatically. Legacy flat-`tabs` sessions
// are migrated to one main window on load. Mirrors the bookmarks file-store:
// atomic serialized writes, corrupt-file backup, cached in-memory doc so the
// menu can read the list synchronously.
//
// Restore semantics (user-chosen): SWITCH = snapshot the current workspace to a
// reserved "Last workspace (auto)" safety-net session, tear down the current
// workspace (close every reader/note tab in every main window + close every
// reader window), then RECONSTRUCT the saved topology — the primary main window
// in place, extra main windows via the dev-window spawn queue, and reader
// windows via Zotero.Reader.open(openInWindow) + the `_wvWTRestoreMap` augment
// path (the same machinery startup restore uses).
//
// UI: a "Sessions" section in the "List all tabs" dropdown panel (mirrors the
// Tab Groups section) — a "Save current tabs" row + one row per saved session
// (left-click switches, right-click manages). Rendered by
// `_wvTabSessionsMenuSection`, hooked into the panel-refresh path in tabs.ts.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

declare const Zotero: any;
declare const Services: any;
declare const PathUtils: any;
declare const IOUtils: any;

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** Reserved id for the "snapshot before a switch" safety-net slot. */
const WV_TABSESSION_AUTOSAVE_ID = "__wv_autosave__";

class _TabSessionsMixin {
    [k: string]: any;

    // ---- Enable gate -------------------------------------------------------

    /** On unless explicitly disabled; cascades from the Tabs-and-Windows
     *  master toggle so it disappears with the rest of that section. */
    _wvGetEnableTabSessions() {
        try {
            if (!(this as any)._getTabsAndWindowsMaster()) return false;
            const v = Zotero.Prefs.get("weavero.enableTabSessions");
            return v === undefined ? true : !!v;
        } catch (e) { return true; }
    }

    // ---- File-backed store -------------------------------------------------

    _wvTabSessionDir() {
        return PathUtils.join(Zotero.DataDirectory.dir, "weavero");
    }

    _wvTabSessionPath() {
        return PathUtils.join(this._wvTabSessionDir(), "tab-sessions.json");
    }

    _wvTabSessionNormalize(doc: any) {
        if (!doc || typeof doc !== "object" || !Array.isArray(doc.sessions)) {
            return { version: 1, sessions: [] };
        }
        doc.version = 1;
        doc.sessions = doc.sessions
            .filter((s: any) => s && typeof s === "object" && typeof s.id === "string")
            .map((s: any) => {
                // Canonicalize to the window-topology shape. Legacy sessions
                // carried a flat `tabs` array → one main window.
                if (!Array.isArray(s.windows)) {
                    s.windows = [{ kind: "main", tabs: Array.isArray(s.tabs) ? s.tabs : [] }];
                }
                delete s.tabs;
                return s;
            });
        return doc;
    }

    /** Load tab-sessions.json into `_wvTabSessionDoc` once (cached promise).
     *  Missing → fresh; unreadable → backed up to `*.corrupt-<ts>` + start clean. */
    _wvTabSessionInit() {
        if (this._wvTabSessionInitPromise) return this._wvTabSessionInitPromise;
        this._wvTabSessionInitPromise = (async () => {
            const path = this._wvTabSessionPath();
            try {
                const text: any = await Zotero.File.getContentsAsync(path);
                this._wvTabSessionDoc = this._wvTabSessionNormalize(JSON.parse(text));
            } catch (e) {
                let exists = false;
                try { exists = await IOUtils.exists(path); } catch (_) {}
                if (exists) {
                    const bak = path + ".corrupt-" + Date.now();
                    try { await IOUtils.move(path, bak); } catch (_) {}
                    Zotero.debug("[Weavero] tab-sessions.json unreadable, backed up to "
                        + bak + ": " + e);
                }
                this._wvTabSessionDoc = { version: 1, sessions: [] };
            }
            return this._wvTabSessionDoc;
        })();
        return this._wvTabSessionInitPromise;
    }

    /** Synchronous read of the in-memory list (empty until init resolves). */
    _wvTabSessionList() {
        return (this._wvTabSessionDoc && this._wvTabSessionDoc.sessions) || [];
    }

    /** The user-visible sessions (the auto-save slot is rendered separately). */
    _wvTabSessionNamedList() {
        return this._wvTabSessionList().filter((s: any) => s.id !== WV_TABSESSION_AUTOSAVE_ID);
    }

    /** Atomic, serialized write of the current doc to disk. */
    _wvTabSessionPersist() {
        if (!this._wvTabSessionDoc) return Promise.resolve();
        const snapshot = JSON.stringify(this._wvTabSessionDoc, null, 2);
        const dir = this._wvTabSessionDir();
        const path = this._wvTabSessionPath();
        this._wvTabSessionWriteChain = (this._wvTabSessionWriteChain || Promise.resolve())
            .then(async () => {
                await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                await IOUtils.writeUTF8(path, snapshot, { tmpPath: path + ".tmp" });
            })
            .catch((e: any) => Zotero.debug("[Weavero] tab-sessions persist failed: " + e));
        return this._wvTabSessionWriteChain;
    }

    _wvTabSessionNewId() {
        return "wvts-" + Date.now().toString(36) + "-"
            + Math.floor(Math.random() * 1e6).toString(36);
    }

    /** Default "Session YYYY-MM-DD HH:MM". */
    _wvTabSessionDefaultName() {
        try {
            const d = new Date();
            const p = (n: number) => String(n).padStart(2, "0");
            return "Session " + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-"
                + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
        } catch (e) { return "Session"; }
    }

    // ---- Capture -----------------------------------------------------------
    // A session captures the full window TOPOLOGY: an ordered `windows` array,
    // each `{ kind: "main"|"reader", tabs: [...] }`. Every main window and every
    // reader window contributes one entry, so reconstruction can recreate the
    // layout. Tab record: { type:"reader"|"note", title, libraryID, itemKey,
    // location, selected, pinned? }.

    /** Build one session tab record from a resolved item. */
    _wvTabSessionMakeRecord(base: string, title: any, item: any, selected: boolean, pinned: boolean) {
        let location: any = null;
        if (base === "reader") {
            try {
                const pi = item.getAttachmentLastPageIndex && item.getAttachmentLastPageIndex();
                if (Number.isInteger(pi)) location = { pageIndex: pi };
            } catch (_) {}
        }
        const rec: any = {
            type: base,
            title: typeof title === "string" ? title : "",
            libraryID: item.libraryID,
            itemKey: item.key,
            location,
            selected: !!selected,
        };
        if (pinned) rec.pinned = true;
        return rec;
    }

    /** A main-window Zotero tab → record (reader/note only), else null. */
    _wvTabSessionRecordFromMainTab(t: any, selID: any) {
        try {
            if (!t || typeof t.type !== "string") return null;
            const base = t.type.replace(/-(unloaded|reloaded|loading)$/, "");
            if (base !== "reader" && base !== "note") return null;
            const itemID = t.data && t.data.itemID;
            if (!itemID) return null;
            const item = Zotero.Items.get(itemID);
            if (!item || !item.key) return null;
            return this._wvTabSessionMakeRecord(base, t.title, item,
                selID != null && t.id === selID, false);
        } catch (e) { return null; }
    }

    /** Capture one reader window's tabs. Weavero multi-tab windows expose
     *  `_wvWT.tabs` (covers UNLOADED tabs too); a plain native reader window
     *  falls back to its live `Zotero.Reader._readers` instance. */
    _wvTabSessionCaptureReaderWindow(w: any) {
        const tabs: any[] = [];
        try {
            const st = w && w._wvWT;
            if (st && Array.isArray(st.tabs) && st.tabs.length) {
                for (const t of st.tabs) {
                    const iid = t.itemID;
                    if (iid == null) continue;
                    const item = Zotero.Items.get(iid);
                    if (!item || !item.key) continue;
                    const base = (item.isNote && item.isNote()) ? "note" : "reader";
                    tabs.push(this._wvTabSessionMakeRecord(base, "", item,
                        st.activeId === t.id, !!t.pinned));
                }
            } else {
                const readers = (Zotero.Reader && Zotero.Reader._readers) || [];
                for (const r of readers) {
                    if (!r || r._window !== w) continue;
                    const iid = r.itemID || (r._item && r._item.id);
                    const item = iid && Zotero.Items.get(iid);
                    if (item && item.key) {
                        tabs.push(this._wvTabSessionMakeRecord("reader", "", item, true, false));
                    }
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionCaptureReaderWindow err: " + e); }
        return { kind: "reader", tabs };
    }

    /** Capture a main window's library-view state: the selected collection/
     *  library tree row, and the items-tree column layout + sort (both live in
     *  the itemsView `_columnPrefs` — per-dataKey hidden/ordinal/width and the
     *  active column's sortDirection). */
    _wvTabSessionCaptureMainState(w: any) {
        const state: any = {};
        try {
            const zp = w && w.ZoteroPane;
            if (!zp) return state;
            const row = zp.getCollectionTreeRow && zp.getCollectionTreeRow();
            if (row && row.id) state.collection = row.id;   // "L1" / "C123" / "S45"
            const iv = zp.itemsView;
            if (iv && iv._getColumnPrefs) {
                const cp = iv._getColumnPrefs();
                if (cp && Object.keys(cp).length) {
                    state.columnPrefs = JSON.parse(JSON.stringify(cp));
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionCaptureMainState err: " + e); }
        return state;
    }

    /** Snapshot the full workspace topology: every main window (with its
     *  collection + column/sort state) + every reader window, in order, each
     *  with its ordered tab records. */
    _wvTabSessionCaptureWindows() {
        const windows: any[] = [];
        try {
            const mainWins = Zotero.getMainWindows();
            for (let wi = 0; wi < mainWins.length; wi++) {
                const w = mainWins[wi];
                const Z: any = (w as any).Zotero_Tabs;
                if (!Z || !Array.isArray(Z._tabs)) continue;
                let selID: any = null;
                try { selID = Z.selectedID; } catch (_) {}
                const tabs: any[] = [];
                for (const t of Z._tabs) {
                    const rec = this._wvTabSessionRecordFromMainTab(t, selID);
                    if (rec) tabs.push(rec);
                }
                // Always keep the first main window (for its collection + column
                // state even with no reader tabs); extra windows only if they
                // hold tabs (don't recreate empty windows).
                if (tabs.length || wi === 0) {
                    windows.push({ kind: "main", tabs, ...this._wvTabSessionCaptureMainState(w) });
                }
            }
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) {
                const rw = this._wvTabSessionCaptureReaderWindow(en.getNext());
                if (rw && rw.tabs.length) windows.push(rw);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionCaptureWindows err: " + e); }
        return windows;
    }

    /** Total tab count across a session's windows (handles legacy flat shape). */
    _wvTabSessionCountTabs(s: any) {
        try {
            if (s && Array.isArray(s.windows)) {
                return s.windows.reduce((n: number, w: any) => n + ((w.tabs || []).length), 0);
            }
            return (s && s.tabs ? s.tabs.length : 0);
        } catch (e) { return 0; }
    }

    /** Convert session tab records → Zotero_Tabs.getState() shape (resolving
     *  itemKey→itemID), for `Zotero_Tabs.restoreState` / the dev-window queue.
     *  CRITICAL: `restoreState` uses the array index as each tab's index and
     *  expects the LIBRARY tab at index 0 (its hook just renames the existing
     *  one). Without it the first reader tab is added at index 0 → throws
     *  "'index' should be an integer > 0" and the entire rebuild aborts (teardown
     *  already happened → an emptied window). So we always prepend it. */
    _wvTabSessionToGetStateTabs(recs: any[], libraryTitle?: string) {
        let lt = libraryTitle;
        if (lt == null) {
            try {
                const Z: any = Zotero.getMainWindow().Zotero_Tabs;
                lt = (Z && Z._tabs[0] && Z._tabs[0].title) || "";
            } catch (e) { lt = ""; }
        }
        const out: any[] = [{ type: "library", title: lt || "" }];
        for (const rec of (recs || [])) {
            try {
                const id = Zotero.Items.getIDFromLibraryAndKey(rec.libraryID, rec.itemKey);
                if (!id) continue;
                out.push({
                    type: rec.type,
                    title: rec.title || "",
                    data: { itemID: id },
                    selected: !!rec.selected,
                });
            } catch (e) {}
        }
        return out;
    }

    /** Capture the current workspace into a NEW named session and persist. */
    async _wvTabSessionSaveAs(name: string) {
        await this._wvTabSessionInit();
        const now = Date.now();
        const sess = {
            id: this._wvTabSessionNewId(),
            name: name,
            created: now,
            modified: now,
            windows: this._wvTabSessionCaptureWindows(),
        };
        this._wvTabSessionDoc.sessions.push(sess);
        // A freshly-saved session becomes the active (tracked) one.
        this._wvTabSessionDoc.activeSessionId = sess.id;
        await this._wvTabSessionPersist();
        return sess;
    }

    /** Replace an existing session's tabs with the current workspace. */
    async _wvTabSessionOverwrite(id: string) {
        await this._wvTabSessionInit();
        const sess = this._wvTabSessionList().find((s: any) => s.id === id);
        if (!sess) return null;
        sess.windows = this._wvTabSessionCaptureWindows();
        delete sess.tabs;
        sess.modified = Date.now();
        await this._wvTabSessionPersist();
        return sess;
    }

    async _wvTabSessionRename(id: string, name: string) {
        await this._wvTabSessionInit();
        const sess = this._wvTabSessionList().find((s: any) => s.id === id);
        if (!sess) return;
        sess.name = name;
        sess.modified = Date.now();
        await this._wvTabSessionPersist();
    }

    async _wvTabSessionDelete(id: string) {
        await this._wvTabSessionInit();
        const arr = this._wvTabSessionList();
        const i = arr.findIndex((s: any) => s.id === id);
        if (i >= 0) {
            arr.splice(i, 1);
            if (this._wvTabSessionGetActiveId() === id) {
                this._wvTabSessionDoc.activeSessionId = null;   // stop tracking a deleted session
            }
            await this._wvTabSessionPersist();
        }
    }

    /** Snapshot the current workspace into the reserved auto-save slot so a
     *  switch is one click to undo. No-op when there's nothing to lose. */
    async _wvTabSessionAutosaveCurrent() {
        await this._wvTabSessionInit();
        const windows = this._wvTabSessionCaptureWindows();
        if (!windows.some((w: any) => (w.tabs || []).length)) return;   // nothing to lose
        const now = Date.now();
        let slot = this._wvTabSessionList().find((s: any) => s.id === WV_TABSESSION_AUTOSAVE_ID);
        if (!slot) {
            slot = {
                id: WV_TABSESSION_AUTOSAVE_ID, name: "Last workspace (auto)",
                created: now, modified: now, windows,
            };
            this._wvTabSessionDoc.sessions.unshift(slot);
        } else {
            slot.windows = windows;
            delete slot.tabs;
            slot.modified = now;
        }
        await this._wvTabSessionPersist();
    }

    // ---- Active (tracking) session -----------------------------------------
    // At most one session is "active": it tracks the live workspace, re-captured
    // (debounced) whenever a tab or window opens/closes/changes. Switching to a
    // session — or saving a new one — makes it active.

    _wvTabSessionGetActiveId() {
        return (this._wvTabSessionDoc && this._wvTabSessionDoc.activeSessionId) || null;
    }

    async _wvTabSessionSetActiveId(id: string | null) {
        await this._wvTabSessionInit();
        this._wvTabSessionDoc.activeSessionId = id || null;
        await this._wvTabSessionPersist();
    }

    /** Re-capture the workspace into the active session (debounced). No-op when
     *  nothing is active or a switch is mid-flight. Hooked to the tab Notifier,
     *  reader-window changes, and main-window open/close. */
    _wvTabSessionTrackingUpdate() {
        try {
            if (this._wvTabSessionSwitching) return;
            if (!this._wvTabSessionGetActiveId()) return;
            if (this._wvTabSessionTrackTimer) {
                try { clearTimeout(this._wvTabSessionTrackTimer); } catch (e) {}
            }
            this._wvTabSessionTrackTimer = setTimeout(() => {
                this._wvTabSessionTrackTimer = null;
                this._wvTabSessionTrackingFlush();
            }, 700);
        } catch (e) {}
    }

    /** Immediately capture the workspace into the active session + persist. */
    async _wvTabSessionTrackingFlush() {
        try {
            await this._wvTabSessionInit();
            const id = this._wvTabSessionGetActiveId();
            if (!id) return;
            const sess = this._wvTabSessionList().find((s: any) => s.id === id);
            if (!sess) { this._wvTabSessionDoc.activeSessionId = null; await this._wvTabSessionPersist(); return; }
            sess.windows = this._wvTabSessionCaptureWindows();
            delete sess.tabs;
            sess.modified = Date.now();
            await this._wvTabSessionPersist();
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionTrackingFlush err: " + e); }
    }

    _wvTabSessionStopTracking() {
        try {
            if (this._wvTabSessionTrackTimer) {
                try { clearTimeout(this._wvTabSessionTrackTimer); } catch (e) {}
                this._wvTabSessionTrackTimer = null;
            }
            this._wvTabSessionSetActiveId(null);
            this._wvTabSessionToast("Stopped tracking");
        } catch (e) {}
    }

    // ---- Restore (switch = reconstruct the saved window topology) ----------

    /** Tear down the current workspace: close every reader/note tab in every
     *  main window (library tab stays) and close every reader window. */
    _wvTabSessionTearDown() {
        try {
            for (const w of Zotero.getMainWindows()) {
                const Z: any = (w as any).Zotero_Tabs;
                if (!Z || !Array.isArray(Z._tabs)) continue;
                const ids = Z._tabs
                    .filter((t: any) => t && t.id !== "zotero-pane" && t.type !== "library")
                    .map((t: any) => t.id);
                for (const id of ids) { try { Z.close(id); } catch (_) {} }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionTearDown (main) err: " + e); }
        try {
            const wins: any[] = [];
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) wins.push(en.getNext());
            for (const w of wins) { try { w.close(); } catch (_) {} }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionTearDown (reader) err: " + e); }
    }

    /** Recreate one reader window from a session window entry. Multi-tab windows
     *  reuse Weavero's reader-window augment-restore map (`_wvWTRestoreMap` +
     *  `_wvWTMaybeRestore`, the same path startup restore uses). */
    async _wvTabSessionReconstructReaderWindow(rw: any) {
        try {
            const items = (rw.tabs || [])
                .map((r: any) => ({ id: Zotero.Items.getIDFromLibraryAndKey(r.libraryID, r.itemKey), rec: r }))
                .filter((x: any) => x.id);
            if (!items.length) return;
            const first = items[0];
            if (items.length > 1) {
                const extras = items.slice(1).map((x: any) =>
                    ({ itemID: x.id, pinned: !!x.rec.pinned, grp: null }));
                let activeIndex = items.findIndex((x: any) => x.rec.selected);
                if (activeIndex < 0) activeIndex = 0;
                this._wvWTRestoreMap = this._wvWTRestoreMap || {};
                this._wvWTRestoreMap[first.id] = {
                    extras, activeIndex,
                    nativePinned: !!first.rec.pinned, nativeGrp: null,
                    order: items.map((x: any) => x.id),
                };
                this._wvWTRestoreActive = true;
            }
            const loc = (first.rec.location && Number.isInteger(first.rec.location.pageIndex))
                ? { pageIndex: first.rec.location.pageIndex } : null;
            await Zotero.Reader.open(first.id, loc, { openInWindow: true });
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionReconstructReaderWindow err: " + e); }
    }

    /** Restore a main window's library view: select the saved collection, then
     *  apply the saved items-tree column layout + sort. Verified incantation:
     *  `_storeColumnPrefs` → `_resetColumns` → `sort` (the same path Zotero's own
     *  column picker / sort handlers use; columns + sort both live in the
     *  per-dataKey `_columnPrefs`). */
    async _wvTabSessionApplyMainState(w: any, entry: any) {
        try {
            const zp = w && w.ZoteroPane;
            if (!zp || !entry) return;
            // Collection first — selecting it reloads the items view.
            if (entry.collection && zp.collectionsView
                    && typeof zp.collectionsView.selectByID === "function") {
                try { await zp.collectionsView.selectByID(entry.collection); } catch (_) {}
            }
            if (entry.columnPrefs) {
                const iv: any = zp.itemsView;
                if (iv && typeof iv._storeColumnPrefs === "function"
                        && typeof iv._resetColumns === "function") {
                    try {
                        iv._storeColumnPrefs(JSON.parse(JSON.stringify(entry.columnPrefs)));
                        await iv._resetColumns();
                        try { await iv.sort(); } catch (_) {}
                    } catch (e) { Zotero.debug("[Weavero] apply columnPrefs err: " + e); }
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionApplyMainState err: " + e); }
    }

    /** Rebuild a session's window topology: main windows (primary in place +
     *  extras via the dev-window spawn queue) and reader windows. */
    async _wvTabSessionReconstruct(windows: any[]) {
        const mains = (windows || []).filter((w: any) => w.kind === "main");
        const readers = (windows || []).filter((w: any) => w.kind === "reader");
        this._wvTabSessionTearDown();
        if (mains.length) {
            // Primary (active) main window gets the first main entry. Teardown
            // already left it at the library tab; restoreState re-adds the rest
            // (it honors each record's `selected`), then we restore the library
            // view (collection + columns + sort).
            const primary = Zotero.getMainWindow();
            try {
                const Z: any = primary && (primary as any).Zotero_Tabs;
                if (Z && (mains[0].tabs || []).length && typeof Z.restoreState === "function") {
                    await Z.restoreState(this._wvTabSessionToGetStateTabs(mains[0].tabs));
                }
            } catch (e) { Zotero.debug("[Weavero] reconstruct primary err: " + e); }
            try { await this._wvTabSessionApplyMainState(primary, mains[0]); } catch (_) {}
            // Extra main windows: queue the rest and spawn them one at a time
            // (the dev-window machinery consumes the queue in onMainWindowLoad).
            const extraGroups = mains.slice(1)
                .filter((m: any) => (m.tabs || []).length)   // skip windows with only a library tab
                .map((m: any) => ({ tabs: this._wvTabSessionToGetStateTabs(m.tabs) }));
            if (extraGroups.length) {
                try {
                    this._wvDevSpawnQueue = (this._wvDevSpawnQueue || []).concat(extraGroups);
                    this._wvSpawnNextDevWindow();
                } catch (e) { Zotero.debug("[Weavero] reconstruct extra-main err: " + e); }
            }
        }
        for (const rw of readers) {
            try { await this._wvTabSessionReconstructReaderWindow(rw); } catch (_) {}
        }
    }

    /** SWITCH to a saved session: preserve the outgoing workspace → reconstruct
     *  the target → make the target the active (tracked) session. */
    async _wvTabSessionSwitch(id: string) {
        await this._wvTabSessionInit();
        const sess = this._wvTabSessionList().find((s: any) => s.id === id);
        if (!sess) return;
        // Copy the target topology BEFORE any flush/autosave rewrites window
        // objects (e.g. switching to the auto slot rewrites its own `windows`).
        const targetWindows = Array.isArray(sess.windows) ? sess.windows.slice()
            : [{ kind: "main", tabs: (sess.tabs || []) }];   // legacy fallback
        const activeId = this._wvTabSessionGetActiveId();
        this._wvTabSessionSwitching = true;   // suppress tracking during teardown/rebuild
        try {
            // Preserve the OUTGOING workspace: a tracked session is kept current
            // by flushing it; an untracked one snapshots to the auto slot.
            if (activeId && activeId !== id) {
                try { await this._wvTabSessionTrackingFlush(); } catch (_) {}
            } else if (!activeId && id !== WV_TABSESSION_AUTOSAVE_ID) {
                try { await this._wvTabSessionAutosaveCurrent(); } catch (_) {}
            }
            await this._wvTabSessionReconstruct(targetWindows);
        } finally {
            this._wvTabSessionSwitching = false;
        }
        // The target — whatever it is, including the auto slot — becomes the
        // active (tracked) session, so the dropdown always marks where you are.
        await this._wvTabSessionSetActiveId(id);
    }

    // ---- Small UI helpers --------------------------------------------------

    _wvTabSessionToast(msg: string) {
        try {
            const pw = new (Zotero as any).ProgressWindow();
            pw.changeHeadline("Weavero");
            pw.addDescription(msg);
            pw.show();
            pw.startCloseTimer(2500);
        } catch (e) { Zotero.debug("[Weavero] tab-session: " + msg); }
    }

    _wvTabSessionTabCountLabel(n: number) {
        return n + (n === 1 ? " tab" : " tabs");
    }

    _wvTabSessionPromptSaveAs(win: any) {
        try {
            const valObj = { value: this._wvTabSessionDefaultName() };
            const ok = Services.prompt.prompt(win, "Save Session",
                "Name this session:", valObj, null, {});
            if (!ok) return;
            const name = (valObj.value || "").trim() || this._wvTabSessionDefaultName();
            this._wvTabSessionSaveAs(name).then((s: any) => {
                this._wvTabSessionToast("Saved “" + s.name + "” ("
                    + this._wvTabSessionTabCountLabel(this._wvTabSessionCountTabs(s)) + ")");
            });
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionPromptSaveAs err: " + e); }
    }

    _wvTabSessionConfirmSwitch(win: any, id: string) {
        try {
            const sess = this._wvTabSessionList().find((s: any) => s.id === id);
            if (!sess) return;
            const n = this._wvTabSessionCountTabs(sess);
            const ok = Services.prompt.confirm(win, "Switch Session",
                "Close the current tabs and open “" + sess.name + "” ("
                + this._wvTabSessionTabCountLabel(n) + ")?\n\n"
                + "Your current tabs are saved to “Last workspace (auto)” first.");
            if (!ok) return;
            this._wvTabSessionSwitch(id);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionConfirmSwitch err: " + e); }
    }

    _wvTabSessionConfirmOverwrite(win: any, id: string) {
        try {
            const sess = this._wvTabSessionList().find((s: any) => s.id === id);
            if (!sess) return;
            const ok = Services.prompt.confirm(win, "Overwrite Session",
                "Replace the tabs saved in “" + sess.name
                + "” with the current tabs?");
            if (!ok) return;
            this._wvTabSessionOverwrite(id).then((s: any) => {
                if (s) this._wvTabSessionToast("Updated “" + s.name + "” ("
                    + this._wvTabSessionTabCountLabel(this._wvTabSessionCountTabs(s)) + ")");
            });
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionConfirmOverwrite err: " + e); }
    }

    _wvTabSessionPromptRename(win: any, id: string) {
        try {
            const sess = this._wvTabSessionList().find((s: any) => s.id === id);
            if (!sess) return;
            const valObj = { value: sess.name || "" };
            const ok = Services.prompt.prompt(win, "Rename Session",
                "Session name:", valObj, null, {});
            if (!ok) return;
            const name = (valObj.value || "").trim();
            if (name) this._wvTabSessionRename(id, name);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionPromptRename err: " + e); }
    }

    _wvTabSessionConfirmDelete(win: any, id: string) {
        try {
            const sess = this._wvTabSessionList().find((s: any) => s.id === id);
            if (!sess) return;
            const ok = Services.prompt.confirm(win, "Delete Session",
                "Delete the saved session “" + sess.name + "”?");
            if (!ok) return;
            this._wvTabSessionDelete(id);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionConfirmDelete err: " + e); }
    }

    // ---- Tabs-list ("List all tabs" dropdown) integration ------------------
    // The feature lives in the tabs-menu panel, mirroring the "Tab Groups"
    // section (tab-groups.ts `_wvTabsMenuGroupsSection`): a "Sessions" header,
    // a "Save current tabs" row, then one row per saved session. Left-click a
    // session row = switch; right-click = manage popup. Own `wv-sessmenu-*`
    // classes (NOT the group ones) so the styling intent stays clear.

    _wvEnsureTabSessionStyles(doc: any) {
        try {
            if (doc.getElementById("wv-tab-session-styles")) return;
            const HTML = "http://www.w3.org/1999/xhtml";
            const st = doc.createElementNS(HTML, "style");
            st.id = "wv-tab-session-styles";
            st.textContent = [
                ".wv-sessmenu-header {",
                "  margin: 8px 4px 2px; padding: 4px 6px 2px;",
                "  border-top: 1px solid rgba(127,127,127,0.3);",
                "  font-size: 11px; font-weight: 600; opacity: 0.7;",
                "}",
                ".wv-sessmenu-row {",
                "  display: flex; align-items: center; gap: 7px;",
                "  padding: 4px 8px; margin: 0 4px; border-radius: 5px; cursor: pointer;",
                "}",
                ".wv-sessmenu-row:hover { background: rgba(127,127,127,0.18); }",
                ".wv-sessmenu-dot {",
                "  width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto;",
                "  box-sizing: border-box; border: 1.5px solid currentColor; opacity: 0.55;",
                "}",
                ".wv-sessmenu-glyph {",
                "  width: 12px; height: 12px; flex: 0 0 auto; display: flex;",
                "  align-items: center; justify-content: center;",
                "  font-size: 14px; line-height: 1; opacity: 0.7;",
                "}",
                ".wv-sessmenu-name {",
                "  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis;",
                "  white-space: nowrap; font-size: 12px;",
                "}",
                ".wv-sessmenu-count { flex: 0 0 auto; font-size: 11px; opacity: 0.6; }",
                ".wv-sessmenu-auto .wv-sessmenu-name { font-style: italic; opacity: 0.8; }",
                // Active (tracked) session: filled dot, bold name, accent count.
                ".wv-sessmenu-active .wv-sessmenu-dot {",
                "  background: currentColor; border-color: currentColor; opacity: 0.9;",
                "}",
                ".wv-sessmenu-active .wv-sessmenu-name { font-weight: 700; }",
                ".wv-sessmenu-active .wv-sessmenu-count { opacity: 0.85; }",
                // Disclosure twisty + expanded per-tab rows.
                ".wv-sessmenu-twisty {",
                "  width: 12px; flex: 0 0 auto; display: flex; align-items: center;",
                "  justify-content: center; font-size: 9px; opacity: 0.6; cursor: pointer;",
                "}",
                ".wv-sessmenu-twisty:hover { opacity: 1; }",
                ".wv-sessmenu-winlabel {",
                "  padding: 3px 8px 1px 32px; margin: 0 4px; font-size: 10px;",
                "  font-weight: 600; opacity: 0.45; text-transform: uppercase; letter-spacing: 0.3px;",
                "}",
                ".wv-sessmenu-tab {",
                "  display: flex; align-items: center; gap: 6px; cursor: pointer;",
                "  padding: 2px 8px 2px 34px; margin: 0 4px; border-radius: 5px;",
                "  font-size: 12px; opacity: 0.85;",
                "}",
                ".wv-sessmenu-tab:hover { background: rgba(127,127,127,0.15); opacity: 1; }",
                ".wv-sessmenu-tabicon {",
                "  width: 13px; height: 13px; flex: 0 0 auto; opacity: 0.8;",
                "  background-size: contain; background-repeat: no-repeat; background-position: center;",
                "}",
                ".wv-sessmenu-tabname {",
                "  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
                "}",
            ].join("\n");
            (doc.documentElement || doc).appendChild(st);
        } catch (e) { Zotero.debug("[Weavero] _wvEnsureTabSessionStyles err: " + e); }
    }

    /** Render the "Sessions" section into the tabs-menu panel's list. Called
     *  from the same refresh hooks as the Tab Groups section (tabs.ts). */
    _wvTabSessionsMenuSection(panel: any) {
        try {
            const doc = panel.ownerDocument;
            const win = doc.defaultView;
            // Main-window tabs menu only (reader-window clone uses #wv-wtl-list).
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list");
            if (!list) return;
            for (const el of list.querySelectorAll(
                ".wv-sessmenu-header, .wv-sessmenu-row, .wv-sessmenu-winlabel, .wv-sessmenu-tab")) el.remove();
            if (!this._wvGetEnableTabSessions()) return;
            this._wvEnsureTabSessionStyles(doc);

            const header = doc.createElementNS(HTML_NS, "div");
            header.className = "wv-sessmenu-header";
            header.textContent = "Sessions";
            list.appendChild(header);

            // "Save current tabs" action row.
            const save = doc.createElementNS(HTML_NS, "div");
            save.className = "wv-sessmenu-row";
            save.setAttribute("title", "Save the current tabs as a new session");
            const plus = doc.createElementNS(HTML_NS, "span");
            plus.className = "wv-sessmenu-glyph";
            plus.textContent = "+";
            save.appendChild(plus);
            const saveName = doc.createElementNS(HTML_NS, "span");
            saveName.className = "wv-sessmenu-name";
            saveName.textContent = "Save current tabs…";
            save.appendChild(saveName);
            save.addEventListener("click", (e: any) => {
                try {
                    e.stopPropagation();
                    try { panel.hidePopup(); } catch (er) {}
                    const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (p) p._wvTabSessionPromptSaveAs(win);
                } catch (er) {}
            });
            list.appendChild(save);

            const activeId = this._wvTabSessionGetActiveId();
            const expandedSet = this._wvTabSessionExpanded || (this._wvTabSessionExpanded = new Set());
            const mkRow = (s: any, autoSlot: boolean) => {
                const isActive = s.id === activeId;
                const n = this._wvTabSessionCountTabs(s);
                const expanded = expandedSet.has(s.id);
                const row = doc.createElementNS(HTML_NS, "div");
                row.className = "wv-sessmenu-row"
                    + (autoSlot ? " wv-sessmenu-auto" : "")
                    + (isActive ? " wv-sessmenu-active" : "");
                row.setAttribute("title", isActive
                    ? "Active session — tracking open tabs & windows"
                    : "Switch to this session");
                const sid = s.id;
                // Disclosure twisty (expand to see the tabs). Empty spacer when 0 tabs.
                const tw = doc.createElementNS(HTML_NS, "span");
                tw.className = "wv-sessmenu-twisty";
                if (n > 0) {
                    tw.textContent = expanded ? "▾" : "▸";   // ▾ / ▸
                    tw.setAttribute("title", expanded ? "Collapse" : "Show tabs");
                    tw.addEventListener("click", (e: any) => {
                        try {
                            e.stopPropagation();   // toggle only — don't switch the session
                            const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (p) { p._wvTabSessionToggleExpanded(sid); p._wvTabSessionsMenuSection(panel); }
                        } catch (er) {}
                    });
                }
                row.appendChild(tw);
                const dot = doc.createElementNS(HTML_NS, "span");
                dot.className = "wv-sessmenu-dot";
                row.appendChild(dot);
                const name = doc.createElementNS(HTML_NS, "span");
                name.className = "wv-sessmenu-name";
                name.textContent = s.name || "Untitled session";
                row.appendChild(name);
                const count = doc.createElementNS(HTML_NS, "span");
                count.className = "wv-sessmenu-count";
                const suffix = isActive ? " · tracking" : (autoSlot ? " · auto" : "");
                count.textContent = this._wvTabSessionTabCountLabel(n) + suffix;
                row.appendChild(count);
                row.addEventListener("click", (e: any) => {
                    try {
                        e.stopPropagation();
                        try { panel.hidePopup(); } catch (er) {}
                        if (isActive) return;   // already the active/current session
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (p) p._wvTabSessionConfirmSwitch(win, sid);
                    } catch (er) {}
                });
                row.addEventListener("contextmenu", (e: any) => {
                    try {
                        e.preventDefault(); e.stopPropagation();
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (p) p._wvTabSessionsMenuContext(win, panel, sid, autoSlot, isActive, e);
                    } catch (er) {}
                });
                list.appendChild(row);
                if (n > 0 && expanded) this._wvTabSessionRenderTabRows(doc, list, s, panel);
            };

            for (const s of this._wvTabSessionNamedList()) mkRow(s, false);
            const auto = this._wvTabSessionList().find((s: any) => s.id === WV_TABSESSION_AUTOSAVE_ID);
            if (auto) mkRow(auto, true);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionsMenuSection err: " + e); }
    }

    _wvTabSessionToggleExpanded(id: string) {
        if (!this._wvTabSessionExpanded) this._wvTabSessionExpanded = new Set();
        if (this._wvTabSessionExpanded.has(id)) this._wvTabSessionExpanded.delete(id);
        else this._wvTabSessionExpanded.add(id);
    }

    /** Display title for a tab record — resolve live from the item (parent
     *  title reads better than an attachment filename), fall back to the
     *  captured title / key. */
    _wvTabSessionTabTitle(rec: any) {
        try {
            const iid = Zotero.Items.getIDFromLibraryAndKey(rec.libraryID, rec.itemKey);
            const item = iid && Zotero.Items.get(iid);
            if (item) {
                try {
                    if (item.parentItem && item.parentItem.getDisplayTitle) {
                        return item.parentItem.getDisplayTitle();
                    }
                } catch (e) {}
                if (item.getDisplayTitle) return item.getDisplayTitle();
            }
        } catch (e) {}
        return rec.title || rec.itemKey || "Untitled";
    }

    /** Render a session's tab rows (indented, grouped by window) under its row.
     *  Clicking a tab opens that single document in the current window. */
    _wvTabSessionRenderTabRows(doc: any, list: any, sess: any, panel: any) {
        try {
            const windows = sess.windows || [];
            const multiWin = windows.filter((w: any) => (w.tabs || []).length).length > 1;
            for (let wi = 0; wi < windows.length; wi++) {
                const w = windows[wi];
                const tabs = w.tabs || [];
                if (!tabs.length) continue;
                if (multiWin) {
                    const wl = doc.createElementNS(HTML_NS, "div");
                    wl.className = "wv-sessmenu-winlabel";
                    wl.textContent = (w.kind === "reader") ? "Reader window" : "Main window";
                    list.appendChild(wl);
                }
                for (const rec of tabs) {
                    const tr = doc.createElementNS(HTML_NS, "div");
                    tr.className = "wv-sessmenu-tab";
                    tr.setAttribute("title", "Open this document");
                    const ic = doc.createElementNS(HTML_NS, "span");
                    ic.className = "wv-sessmenu-tabicon";
                    try {
                        const iid = Zotero.Items.getIDFromLibraryAndKey(rec.libraryID, rec.itemKey);
                        const item = iid && Zotero.Items.get(iid);
                        if (item && typeof item.getImageSrc === "function") {
                            ic.style.backgroundImage = "url('" + item.getImageSrc() + "')";
                        }
                    } catch (e) {}
                    tr.appendChild(ic);
                    const nm = doc.createElementNS(HTML_NS, "span");
                    nm.className = "wv-sessmenu-tabname";
                    nm.textContent = this._wvTabSessionTabTitle(rec);
                    tr.appendChild(nm);
                    const r = rec;
                    tr.addEventListener("click", (e: any) => {
                        try {
                            e.stopPropagation();
                            try { panel.hidePopup(); } catch (er) {}
                            const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (p) p._wvTabSessionOpenTabRecord(r);
                        } catch (er) {}
                    });
                    list.appendChild(tr);
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionRenderTabRows err: " + e); }
    }

    /** Open one tab record's document in the current main window (additive —
     *  does NOT switch the session). */
    async _wvTabSessionOpenTabRecord(rec: any) {
        try {
            const id = Zotero.Items.getIDFromLibraryAndKey(rec.libraryID, rec.itemKey);
            if (!id) return;
            if (rec.type === "note") {
                const win = Zotero.getMainWindow();
                if (win && win.ZoteroPane && win.ZoteroPane.openNote) {
                    win.ZoteroPane.openNote(id, { openInWindow: false });
                }
                return;
            }
            const loc = (rec.location && Number.isInteger(rec.location.pageIndex))
                ? { pageIndex: rec.location.pageIndex } : null;
            await Zotero.Reader.open(id, loc, {});
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionOpenTabRecord err: " + e); }
    }

    /** Right-click popup on a session row: Switch / Overwrite / Rename / Delete
     *  (the auto-save slot only offers Switch / Delete). */
    _wvTabSessionsMenuContext(win: any, panel: any, id: string, autoSlot: boolean, isActive: boolean, e: any) {
        try {
            const doc = win.document;
            let pop: any = doc.getElementById("wv-sessmenu-context");
            if (pop) pop.remove();
            pop = doc.createXULElement("menupopup");
            pop.id = "wv-sessmenu-context";
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const mk = (label: string, fn: (p: any) => void) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                mi.addEventListener("command", (ev: any) => {
                    try {
                        ev.stopPropagation();
                        try { panel.hidePopup(); } catch (er) {}
                        const p: any = live();
                        if (p) fn(p);
                    } catch (er) {}
                });
                pop.appendChild(mi);
            };
            if (isActive) {
                mk("Stop Tracking", (p: any) => p._wvTabSessionStopTracking());
            } else {
                mk("Switch to This Session", (p: any) => p._wvTabSessionConfirmSwitch(win, id));
            }
            if (!autoSlot) {
                mk("Overwrite with Current Tabs", (p: any) => p._wvTabSessionConfirmOverwrite(win, id));
                mk("Rename…", (p: any) => p._wvTabSessionPromptRename(win, id));
            }
            pop.appendChild(doc.createXULElement("menuseparator"));
            mk("Delete", (p: any) => p._wvTabSessionConfirmDelete(win, id));
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(e.screenX, e.screenY, true);
        } catch (er) { Zotero.debug("[Weavero] _wvTabSessionsMenuContext err: " + er); }
    }
}

const _tabSessionsDescriptors = Object.getOwnPropertyDescriptors(_TabSessionsMixin.prototype);
delete (_tabSessionsDescriptors as any).constructor;
export const sessionsMethods = _tabSessionsDescriptors;
