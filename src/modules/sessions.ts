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
//           geom?,                                // _wvWindowGeom shape (2026-07-15)
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

    /** Build one session tab record from a resolved item. `groupId` is the
     *  tab's Weavero tab-group stamp (so groups are session-specific). */
    _wvTabSessionMakeRecord(base: string, title: any, item: any, selected: boolean, pinned: boolean, groupId?: any) {
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
        if (groupId) rec.groupId = groupId;
        return rec;
    }

    /** This tab's tab-group stamp, or null. */
    _wvTabSessionTabGroupId(t: any) {
        try {
            return (typeof (this as any)._wvTabGroupStamp === "function")
                ? ((this as any)._wvTabGroupStamp(t) || null) : null;
        } catch (e) { return null; }
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
                selID != null && t.id === selID, false, this._wvTabSessionTabGroupId(t));
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
                        st.activeId === t.id, !!t.pinned, this._wvTabSessionTabGroupId(t)));
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
        // Geometry rides along (2026-07-15): without it every window
        // reconstructed on a session switch opened at the tiny default size.
        let geom: any = null;
        try { geom = this._wvWindowGeom(w); } catch (e) {}
        return { kind: "reader", tabs, geom };
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
                    let geom: any = null;
                    try { geom = this._wvWindowGeom(w); } catch (e) {}
                    windows.push({ kind: "main", tabs, geom, ...this._wvTabSessionCaptureMainState(w) });
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

    /** Deep snapshot of the current tab-group definitions, so each session OWNS
     *  its tab groups (active + saved) instead of them carrying across. */
    _wvTabSessionCaptureGroups() {
        try {
            if (typeof (this as any)._tabGroupsGet === "function") {
                return JSON.parse(JSON.stringify((this as any)._tabGroupsGet() || []));
            }
        } catch (e) {}
        return [];
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
                const data: any = { itemID: id };
                // Carry the tab-group stamp in `data` so restoreState round-trips
                // it onto the rebuilt main tab (`data.wvGroupId`).
                if (rec.groupId) data.wvGroupId = rec.groupId;
                out.push({
                    type: rec.type,
                    title: rec.title || "",
                    data,
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
            tabGroups: this._wvTabSessionCaptureGroups(),
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
        sess.tabGroups = this._wvTabSessionCaptureGroups();
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
        const tabGroups = this._wvTabSessionCaptureGroups();
        const now = Date.now();
        let slot = this._wvTabSessionList().find((s: any) => s.id === WV_TABSESSION_AUTOSAVE_ID);
        if (!slot) {
            slot = {
                id: WV_TABSESSION_AUTOSAVE_ID, name: this._wvTabSessionDefaultName(),
                created: now, modified: now, windows, tabGroups,
            };
            this._wvTabSessionDoc.sessions.unshift(slot);
        } else {
            slot.windows = windows;
            slot.tabGroups = tabGroups;
            delete slot.tabs;
            slot.modified = now;
        }
        await this._wvTabSessionPersist();
    }

    // ---- Active session (always live) --------------------------------------
    // Exactly one session is "active" — the one you switched to or just saved —
    // and it ALWAYS mirrors the live workspace, re-captured (debounced) whenever
    // a tab or window opens/closes/changes. Every OTHER session stays a frozen
    // snapshot until you switch to it. There is no tracking on/off toggle: the
    // session you're in is live; the rest are snapshots.

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
            // Sessions disabled → go DORMANT: stop tracking so saved sessions are
            // frozen (never overwritten) and can be recovered when re-enabled.
            if (!this._wvGetEnableTabSessions()) return;
            if (this._wvTabSessionSwitching) return;
            if (!this._wvTabSessionGetActiveId()) return;
            // Half-restored startup or quit-teardown must NOT be captured into
            // the active session — a lossy restore would overwrite the saved
            // session with the degraded workspace (restart-protocol run 2: a
            // lost reader window silently shrank "Main session" 17 → 13 tabs).
            // The workspace settles before the group restore-guard lifts; any
            // churn after that re-triggers tracking normally.
            if ((this as any)._wvTabGroupRestoreGuard) return;
            if ((this as any)._wvQuitting) return;
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
            sess.tabGroups = this._wvTabSessionCaptureGroups();
            delete sess.tabs;
            sess.modified = Date.now();
            await this._wvTabSessionPersist();
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionTrackingFlush err: " + e); }
    }

    // ---- Restore (switch = reconstruct the saved window topology) ----------

    /** Tear down the current workspace: close session-spawned (managed) extra
     *  main windows, close every reader/note tab in the remaining main window(s),
     *  and close every reader window. The anchor (non-managed) window stays and
     *  is reused as the primary, so a switch never leaves an empty window behind. */
    _wvTabSessionTearDown() {
        try {
            for (const w of Zotero.getMainWindows()) {
                if (w && (w as any)._wvManagedWindow) { try { w.close(); } catch (_) {} }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionTearDown (managed win) err: " + e); }
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
                    ({ itemID: x.id, pinned: !!x.rec.pinned, grp: x.rec.groupId || null }));
                let activeIndex = items.findIndex((x: any) => x.rec.selected);
                if (activeIndex < 0) activeIndex = 0;
                this._wvWTRestoreMap = this._wvWTRestoreMap || {};
                this._wvWTRestoreMap[first.id] = {
                    extras, activeIndex,
                    nativePinned: !!first.rec.pinned, nativeGrp: first.rec.groupId || null,
                    order: items.map((x: any) => x.id),
                };
                this._wvWTRestoreActive = true;
            }
            const loc = (first.rec.location && Number.isInteger(first.rec.location.pageIndex))
                ? { pageIndex: first.rec.location.pageIndex } : null;
            const before = new Set();
            try {
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) before.add(en.getNext());
            } catch (e) {}
            await Zotero.Reader.open(first.id, loc, { openInWindow: true });
            // Placement (2026-07-15): find the window this open created and
            // restore its saved geometry — without this every reader window
            // reconstructed on a session switch opened at the default size.
            // No saved geometry (legacy session) → maximize instead.
            try {
                let newWin: any = null;
                for (let tries = 0; tries < 20 && !newWin; tries++) {
                    const en = Services.wm.getEnumerator("zotero:reader");
                    while (en.hasMoreElements()) { const w = en.getNext(); if (!before.has(w)) newWin = w; }
                    if (!newWin) await (Zotero as any).Promise.delay(150);
                }
                if (newWin) {
                    if (rw.geom && rw.geom.x != null) (this as any)._wvApplyWindowGeom(newWin, rw.geom);
                    else { try { newWin.maximize(); } catch (e) {} }
                }
            } catch (e) {}
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
     *  extras via the dev-window spawn queue) and reader windows. `tabGroups`
     *  (when present) becomes the global tab-group set for this session — swapped
     *  in BEFORE the tabs are rebuilt (which carry their `wvGroupId` stamps), so
     *  groups are session-specific instead of carrying across. */
    async _wvTabSessionReconstruct(windows: any[], tabGroups?: any[]) {
        const mains = (windows || []).filter((w: any) => w.kind === "main");
        const readers = (windows || []).filter((w: any) => w.kind === "reader");
        try {
            Zotero.debug("[Weavero] session reconstruct: open main windows="
                + Zotero.getMainWindows().length + " (managed="
                + Zotero.getMainWindows().filter((w: any) => w._wvManagedWindow).length
                + "), session main entries=" + mains.length + ", reader entries=" + readers.length);
        } catch (e) {}
        // Swap in the session's tab groups under a restore guard so the apply
        // pass doesn't delete groups whose tabs haven't been re-stamped yet.
        // Legacy sessions (no tabGroups field) leave the current groups alone.
        const swapGroups = Array.isArray(tabGroups);
        if (swapGroups) {
            try {
                (this as any)._wvTabGroupRestoreGuard = true;
                (this as any)._tabGroupsSet(JSON.parse(JSON.stringify(tabGroups)));
            } catch (e) { Zotero.debug("[Weavero] reconstruct group-swap err: " + e); }
        }
        this._wvTabSessionTearDown();
        if (mains.length) {
            // Primary main window = the anchor (non-managed) window, reused.
            // Teardown left it at the library tab; restoreState re-adds the rest
            // (it honors each record's `selected`), then we restore the library
            // view (collection + columns + sort).
            const primary = Zotero.getMainWindows().find((w: any) => !w._wvManagedWindow)
                || Zotero.getMainWindow();
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
                .map((m: any) => ({
                    tabs: this._wvTabSessionToGetStateTabs(m.tabs),
                    // Carried into the spawned window so it restores its OWN
                    // collection + items-tree columns/sort, not the anchor's.
                    wvMainState: { collection: m.collection, columnPrefs: m.columnPrefs },
                    // Placement (2026-07-15) — the spawn path applies it;
                    // entries without one (legacy sessions) get maximized
                    // there instead of the tiny default window.
                    geom: m.geom || null,
                }));
            if (extraGroups.length) {
                try {
                    Zotero.debug("[Weavero] session reconstruct: spawning " + extraGroups.length
                        + " extra main window(s)");
                    this._wvDevSpawnQueue = (this._wvDevSpawnQueue || []).concat(extraGroups);
                    this._wvSpawnNextDevWindow();
                } catch (e) { Zotero.debug("[Weavero] reconstruct extra-main err: " + e); }
            }
        }
        for (const rw of readers) {
            try { await this._wvTabSessionReconstructReaderWindow(rw); } catch (_) {}
        }
        try {
            const w = Zotero.getMainWindow();
            const st = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
            st(() => {
                try {
                    const wins = Zotero.getMainWindows();
                    const empty = wins.filter((x: any) => {
                        const Z = x.Zotero_Tabs;
                        return Z && Z._tabs.filter((t: any) => t.type !== "library").length === 0;
                    }).length;
                    Zotero.debug("[Weavero] session reconstruct done: main windows="
                        + wins.length + ", empty=" + empty);
                } catch (e) {}
            }, 1800);
        } catch (e) {}
        if (swapGroups) {
            try { (this as any)._wvTabGroupApplyEverywhere(); } catch (e) {}
            // Lift the guard once windows (esp. async reader windows) have settled,
            // then re-apply so the new groups render and any stale empties clear.
            try {
                const w = Zotero.getMainWindow();
                const st = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
                st(() => {
                    try { (this as any)._wvTabGroupRestoreGuard = false; } catch (e) {}
                    try { (this as any)._wvTabGroupApplyEverywhere(); } catch (e) {}
                }, 2500);
            } catch (e) { try { (this as any)._wvTabGroupRestoreGuard = false; } catch (e2) {} }
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
        // Snapshot the target's groups too (before any flush rewrites them).
        const targetGroups = Array.isArray(sess.tabGroups)
            ? JSON.parse(JSON.stringify(sess.tabGroups)) : undefined;
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
            await this._wvTabSessionReconstruct(targetWindows, targetGroups);
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

    /** "N windows · M tabs" (windows part omitted when unknown/1-and-
     *  legacy) — sessions show their window count alongside the tab count
     *  (user request 2026-07-13). */
    _wvTabSessionCountsLabel(nWins: number, nTabs: number) {
        const tabs = this._wvTabSessionTabCountLabel(nTabs);
        if (!nWins || nWins < 1) return tabs;
        return nWins + (nWins === 1 ? " window" : " windows") + " · " + tabs;
    }

    _wvTabSessionCountWindows(s: any) {
        try { return Array.isArray(s && s.windows) ? s.windows.length : 0; } catch (e) { return 0; }
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

    /** "New session": preserve the CURRENT workspace in the current session, then
     *  open a FRESH empty workspace (one main window, library tab only) as a new
     *  current session. The session you were in stays saved in the list — nothing
     *  is lost. Destructive (it tears the current windows/tabs down), so the
     *  outgoing session is flushed + persisted BEFORE any teardown, and tracking is
     *  suppressed during the rebuild. */
    async _wvTabSessionNewEmpty(win: any) {
        await this._wvTabSessionInit();
        const activeId = this._wvTabSessionGetActiveId();
        this._wvTabSessionSwitching = true;   // suppress tracking during teardown/rebuild
        try {
            // Keep the outgoing workspace: flush the live tabs into the active
            // session (or snapshot to the auto slot if somehow none is active).
            if (activeId) { try { await this._wvTabSessionTrackingFlush(); } catch (_) {} }
            else { try { await this._wvTabSessionAutosaveCurrent(); } catch (_) {} }
            // Create the fresh, empty session and make it the current one.
            const now = Date.now();
            const sess = {
                id: this._wvTabSessionNewId(),
                name: this._wvTabSessionDefaultName(),
                created: now, modified: now,
                windows: [{ kind: "main", tabs: [] }],
                tabGroups: [],
            };
            this._wvTabSessionDoc.sessions.push(sess);
            this._wvTabSessionDoc.activeSessionId = sess.id;
            await this._wvTabSessionPersist();
            // Tear the current windows/tabs down to one empty main window.
            await this._wvTabSessionReconstruct(sess.windows, sess.tabGroups);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionNewEmpty err: " + e); }
        finally { this._wvTabSessionSwitching = false; }
        // Refresh any open tabs-menu so it shows the new current session + list.
        try {
            for (const w of Zotero.getMainWindows()) {
                const panel: any = w.document && w.document.querySelector("#zotero-tabs-menu-panel");
                if (panel && panel.state !== "closed" && typeof panel.refreshList === "function") panel.refreshList();
            }
        } catch (_) {}
    }

    /** Switch to a session — IMMEDIATELY, no confirm dialog. Switching is safe and
     *  automatic now: the session you're leaving is the live current session and
     *  keeps its tabs, so nothing is ever lost. (Name kept for its callers.) */
    _wvTabSessionConfirmSwitch(_win: any, id: string) {
        try {
            const sess = this._wvTabSessionList().find((s: any) => s.id === id);
            if (!sess) return;
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
            const HTML = "http://www.w3.org/1999/xhtml";
            const css = [
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
                // Session marker = a stylish \"S\" badge (amber rounded square,
                // italic serif S) — ties to the amber session boxes.
                ".wv-sessmenu-dot {",
                "  width: 15px; height: 15px; flex: 0 0 auto; box-sizing: border-box;",
                "  display: inline-flex; align-items: center; justify-content: center;",
                "  border-radius: 4px; background: rgb(214,158,46); color: #fff;",
                "  font-family: Georgia, 'Times New Roman', serif; font-weight: 700;",
                "  font-style: italic; font-size: 11px; line-height: 1;",
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
                // Active session: bold name.
                ".wv-sessmenu-active .wv-sessmenu-name { font-weight: 700; }",
                ".wv-sessmenu-active .wv-sessmenu-count { opacity: 0.85; }",
                // Disclosure twisty + expanded per-tab rows.
                ".wv-sessmenu-twisty {",
                "  width: 18px; flex: 0 0 auto; display: flex; align-items: center;",
                "  justify-content: center; font-size: 14px; opacity: 0.7; cursor: pointer;",
                "}",
                ".wv-sessmenu-twisty:hover { opacity: 1; }",
                // The expanded session renders IDENTICALLY to the all-windows list
                // (same window/library headers + rows, same alignment) — the
                // session row above + its twisty provide the context, so no extra
                // nesting indent. Library sub-headers align with the native
                // top-level library headers (no indent, just the dim); rows get the
                // shared 18px indent from constants.ts.
                ".wv-tabsmenu-sublib { opacity: 0.75; }",
                // Window-header glyph: a simple window frame (rounded rect + title
                // bar). Same for main and reader windows.
                ".wv-winicon {",
                "  width: 16px; height: 13px; flex: 0 0 auto; box-sizing: border-box;",
                "  border: 1.3px solid currentColor; border-radius: 2px;",
                "  opacity: 0.8; position: relative;",
                "}",
                ".wv-winicon::before {",
                "  content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2.5px;",
                "  background: currentColor; opacity: 0.5;",
                "}",
                // Main windows: replace the full-width title bar with a short blue
                // tab at the top-left (matches the blue-tab data-URI window icon used
                // in the Open-in / Move-Tabs menus). Reader windows keep the plain bar.
                ".wv-winicon-main::before {",
                "  left: 1.5px; right: auto; top: 1px; width: 6px; height: 2.5px;",
                "  border-radius: 1px; background: #4072e5; opacity: 1;",
                "}",
                "@media (prefers-color-scheme: dark) {",
                "  .wv-winicon-main::before { background: #5b9bf8; }",
                "}",
                // Window collapse: a twisty before the window glyph; collapsing hides
                // everything in the window wrapper except its header (the first child).
                ".wv-win-twisty {",
                "  margin-inline-start: auto; width: 12px; flex: 0 0 auto;",
                "  display: inline-flex; align-items: center; justify-content: center;",
                "  font-size: 9px; opacity: 0.55;",
                "}",
                ".wv-winscope.wv-win-collapsed > :not(:first-child) { display: none !important; }",
                // Anchor-window marker: solid Material anchor in the library-tab
                // anchor shade (#3d6fe0 light, lighter #9dbcff dark).
                ".wv-anchor-mark {",
                "  width: 15px; height: 15px; flex: 0 0 auto; margin-inline-start: 5px;",
                "  color: #3d6fe0;",
                "}",
                ".wv-ui-dark .wv-anchor-mark { color: #9dbcff; }",
                // No per-window vertical lines — windows are grouped purely by their
                // header + the indentation below it (the library sub-headers and the
                // 18px row indent from constants.ts). Same for the current window and
                // saved-session windows, so both read with one consistent hierarchy.
                ".wv-winscope { margin: 0 0 6px; }",
                ".wv-winscope:last-child { margin-bottom: 0; }",
                // A session = a full BOX (border on all four sides, rounded). Its
                // title bar (the banner / session row) is the FIRST child and bleeds
                // to the box edges with an amber fill matching the border line, so
                // header + box read as one connected unit (Tab-Stash style). The
                // windows inside the body are grouped by header + indentation (no line).
                ".wv-sessscope {",
                "  border: 1.5px solid rgba(214,158,46,0.7);",
                "  border-radius: 6px; overflow: hidden;",
                "  margin: 4px 6px 6px 2px;",
                "}",
                ".wv-sessscope > .wv-cursess-header,",
                ".wv-sessscope > .wv-sessmenu-row {",
                "  margin: 0; border-radius: 0; padding: 5px 8px;",
                "  background: rgba(214,158,46,0.20);",
                "}",
                ".wv-sessscope > .wv-sessmenu-row:hover { background: rgba(214,158,46,0.32); }",
                // The session body scrolls inside the box when tall, so the title bar
                // stays put and the Sessions list below the box stays reachable.
                ".wv-sess-body { padding: 5px 7px; max-height: 55vh; overflow-y: auto; }",
                // Inside a session, the per-window rails stay neutral (no current).
                ".wv-sessscope .wv-winscope { margin-bottom: 4px; }",
                ".wv-sess-body .wv-winscope:last-child { margin-bottom: 0; }",
                // "Current session" banner at the very top of the panel.
                ".wv-cursess-header {",
                "  display: flex; align-items: center; gap: 7px;",
                "  padding: 5px 8px; margin: 2px 4px 5px; border-radius: 5px;",
                "  background: rgba(127,127,127,0.13); font-size: 12px;",
                "}",
                ".wv-cursess-eyebrow { flex: 0 0 auto; font-size: 10px; font-weight: 600;",
                "  opacity: 0.5; text-transform: uppercase; letter-spacing: 0.3px; }",
                ".wv-cursess-label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis;",
                "  white-space: nowrap; font-weight: 700; }",
                ".wv-cursess-unsaved .wv-cursess-label { font-weight: 600; font-style: italic; opacity: 0.8; }",
            ].join("\n");
            // Find-or-create + refresh when changed, so CSS edits take effect on a
            // plugin reload (the old stylesheet survives the reload otherwise).
            let st = doc.getElementById("wv-tab-session-styles");
            if (!st) {
                st = doc.createElementNS(HTML, "style");
                st.id = "wv-tab-session-styles";
                (doc.documentElement || doc).appendChild(st);
            }
            if (st.textContent !== css) st.textContent = css;
        } catch (e) { Zotero.debug("[Weavero] _wvEnsureTabSessionStyles err: " + e); }
    }

    /** Banner at the very TOP of the tabs-menu panel naming the CURRENT session
     *  (the active one), so the live tabs/windows below it are clearly "this
     *  session" — and it isn't also listed in the Sessions section. */
    _wvTabSessionCurrentHeader(panel: any) {
        try {
            const doc = panel.ownerDocument;
            // Main panel → #zotero-tabs-menu-list; reader-window clone → #wv-wtl-list.
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list") || panel.querySelector("#wv-wtl-list");
            if (!list) return;
            for (const el of list.querySelectorAll(".wv-cursess-header")) el.remove();
            if (!this._wvGetEnableTabSessions()) return;
            this._wvEnsureTabSessionStyles(doc);
            const activeId = this._wvTabSessionGetActiveId();
            const sess = activeId ? this._wvTabSessionList().find((s: any) => s.id === activeId) : null;
            const hdr = doc.createElementNS(HTML_NS, "div");
            hdr.className = "wv-cursess-header" + (sess ? " wv-sessmenu-active" : " wv-cursess-unsaved");
            const dot = doc.createElementNS(HTML_NS, "span");
            dot.className = "wv-sessmenu-dot";
            dot.textContent = "S";
            hdr.appendChild(dot);
            // Name first, then the "Current session" tag (right-aligned) — mirrors
            // the saved-session rows' name-left / meta-right layout.
            const label = doc.createElementNS(HTML_NS, "span");
            label.className = "wv-cursess-label";
            label.textContent = sess ? (sess.name || this._wvTabSessionDefaultName()) : "Current session";
            hdr.appendChild(label);
            // Tab count — like the saved-session rows, but a LIVE count of the
            // current workspace (main-window content tabs + reader-window tabs) so
            // it matches the tabs shown in the body below.
            try {
                let n = 0;
                for (const w of Zotero.getMainWindows()) {
                    const Z: any = (w as any).Zotero_Tabs;
                    if (Z && Array.isArray(Z._tabs)) n += Z._tabs.filter((t: any) => t && t.id !== "zotero-pane" && t.type !== "library").length;
                }
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) { const w: any = en.getNext(); const st = w._wvWT; if (st && Array.isArray(st.tabs)) n += st.tabs.length; }
                let nw = Zotero.getMainWindows().length;
                const enw = Services.wm.getEnumerator("zotero:reader");
                while (enw.hasMoreElements()) { const w: any = enw.getNext(); if (w._wvWT) nw++; }
                const cnt = doc.createElementNS(HTML_NS, "span");
                cnt.className = "wv-sessmenu-count";
                cnt.textContent = this._wvTabSessionCountsLabel(nw, n);
                hdr.appendChild(cnt);
            } catch (er) {}
            // No "Current session" eyebrow tag — the top position already
            // says it (user request 2026-07-13).
            // Right-click → rename the current session (or save the live tabs as a
            // new one) — same affordance the saved-session rows already have.
            hdr.setAttribute("title", "Right-click to rename or save this session");
            hdr.style.cursor = "context-menu";
            hdr.addEventListener("contextmenu", (e: any) => {
                try {
                    e.preventDefault(); e.stopPropagation();
                    const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (p) p._wvTabSessionCurrentHeaderContext(doc.defaultView, panel, e);
                } catch (er) {}
            });
            list.insertBefore(hdr, list.firstChild);
        } catch (e) { Zotero.debug("[Weavero] _wvTabSessionCurrentHeader err: " + e); }
    }

    /** Render the "Sessions" section into the tabs-menu panel's list. Called
     *  from the same refresh hooks as the Tab Groups section (tabs.ts). */
    _wvTabSessionsMenuSection(panel: any) {
        try {
            const doc = panel.ownerDocument;
            const win = doc.defaultView;
            // Main panel → #zotero-tabs-menu-list; reader-window clone → #wv-wtl-list.
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list") || panel.querySelector("#wv-wtl-list");
            if (!list) return;
            for (const el of list.querySelectorAll(
                ".wv-sessmenu-header, .wv-sessmenu-row, .wv-sessmenu-scope")) el.remove();
            if (!this._wvGetEnableTabSessions()) return;
            this._wvEnsureTabSessionStyles(doc);

            const header = doc.createElementNS(HTML_NS, "div");
            header.className = "wv-sessmenu-header";
            header.textContent = "Sessions";
            list.appendChild(header);

            // "New session" action row. The current tabs are always saved in the
            // current session, so this doesn't "save" — it opens a FRESH empty
            // workspace as a new current session; the session you were in stays
            // saved in the list behind you.
            const save = doc.createElementNS(HTML_NS, "div");
            save.className = "wv-sessmenu-row";
            save.setAttribute("title", "Open a fresh, empty workspace as a new session (the current session stays saved below)");
            const plus = doc.createElementNS(HTML_NS, "span");
            plus.className = "wv-sessmenu-glyph";
            plus.textContent = "+";
            save.appendChild(plus);
            const saveName = doc.createElementNS(HTML_NS, "span");
            saveName.className = "wv-sessmenu-name";
            saveName.textContent = "New session";
            save.appendChild(saveName);
            save.addEventListener("click", (e: any) => {
                try {
                    e.stopPropagation();
                    try { panel.hidePopup(); } catch (er) {}
                    const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (p) p._wvTabSessionNewEmpty(win);
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
                    ? "Current session — updates automatically as you open & close tabs"
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
                dot.textContent = "S";
                row.appendChild(dot);
                const name = doc.createElementNS(HTML_NS, "span");
                name.className = "wv-sessmenu-name";
                name.textContent = s.name || "Untitled session";
                row.appendChild(name);
                const count = doc.createElementNS(HTML_NS, "span");
                count.className = "wv-sessmenu-count";
                const suffix = autoSlot ? " · auto" : "";
                count.textContent = this._wvTabSessionCountsLabel(this._wvTabSessionCountWindows(s), n) + suffix;
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
                // Tab-Stash–style: each session is a BOX whose title bar is the row
                // (inside the box, top), with the expanded tabs in the body below —
                // so the header and its content read as one connected unit.
                const box = doc.createElementNS(HTML_NS, "div");
                box.className = "wv-sessscope wv-sessmenu-scope";
                box.appendChild(row);
                if (n > 0 && expanded) {
                    const body = doc.createElementNS(HTML_NS, "div");
                    body.className = "wv-sess-body";
                    this._wvTabSessionRenderTabRows(doc, body, s, panel);
                    box.appendChild(body);
                }
                list.appendChild(box);
            };

            // The active session is shown as the live workspace at the TOP of the
            // panel (the "Current session" header), so it's omitted here to avoid
            // listing it twice.
            for (const s of this._wvTabSessionNamedList()) {
                if (s.id === activeId) continue;
                mkRow(s, false);
            }
            // The auto-save slot is now just a NORMAL session (autoSlot=false): a
            // default name, no "· auto" suffix, full Rename/Overwrite/Delete menu.
            // Shown so you can switch BACK to it after visiting another session — but
            // NOT when it's already the active session (then it's the current-session
            // header at the top, and a list row would be a dead, unclickable
            // duplicate that reads as "switching doesn't work").
            const auto = this._wvTabSessionList().find((s: any) => s.id === WV_TABSESSION_AUTOSAVE_ID);
            if (auto && auto.id !== activeId) mkRow(auto, false);
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

    /** Render a session's tabs under its row, grouped by window — using the SAME
     *  shared renderer as the all-windows list (so the design + the Sort-by-Library
     *  / annotation-count settings apply identically). Clicking a tab opens it. */
    _wvTabSessionRenderTabRows(doc: any, container: any, sess: any, panel: any) {
        try {
            const windows = sess.windows || [];
            let mainN = 0, readerN = 0;
            const sections: any[] = [];
            for (const w of windows) {
                const recs = w.tabs || [];
                if (!recs.length) continue;
                let label: string;
                if (w.kind === "reader") { readerN++; label = readerN > 1 ? "Reader window " + readerN : "Reader window"; }
                else { mainN++; label = "Window " + mainN; }
                const tabs: any[] = [];
                for (const rec of recs) {
                    const id = Zotero.Items.getIDFromLibraryAndKey(rec.libraryID, rec.itemKey);
                    const item = id && Zotero.Items.get(id);
                    if (!item) continue;
                    const r = rec;
                    tabs.push({
                        item,
                        title: this._wvTabSessionTabTitle(rec),
                        onClick: () => {
                            const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (p) p._wvTabSessionOpenTabRecord(r);
                        },
                    });
                }
                // Every main window has an implicit "My Library" home tab that the
                // session snapshot doesn't store — synthesize it so the saved view
                // leads with it, matching the live all-windows list. (Reader windows
                // have no home tab.) Clicking it focuses the library in the current
                // main window.
                let libraryTab: any = null;
                if (w.kind !== "reader") {
                    const live = Zotero.getMainWindows()[0];
                    libraryTab = {
                        title: "My Library",
                        iconFullClass: (((this as any)._wvAnchorLibIconClass(live) || "icon icon-css icon-library") + " tab-icon").replace(/\s+/g, " ").trim(),
                        onClick: () => {
                            try {
                                const mw = Zotero.getMainWindows()[0];
                                if (mw) { mw.focus(); mw.Zotero_Tabs.select("zotero-pane"); }
                            } catch (e) {}
                        },
                    };
                }
                if (tabs.length) sections.push({ label, libraryTab, tabs, kind: w.kind === "reader" ? "reader" : "main" });
            }
            // Render the windows (each a left-line scope) straight into `container`
            // — the caller's session box body. The box itself is the session scope.
            if (sections.length) {
                (this as any)._wvTabsMenuRenderSections(doc, container, panel, sections,
                    { header: "wv-sessmenu-winhdr", row: "wv-sessmenu-tabrow", lib: "wv-sessmenu-liblbl", scope: "wv-sessmenu-winscope" },
                    "sess|" + (sess.id || ""));
            }
            // Saved windows belonging to this session render as parked window
            // boxes below the session's own windows.
            try { (this as any)._wvSavedWindowsRenderInto(doc, container, panel, sess.id, "sess"); } catch (e) {}
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
            if (!isActive) {
                mk("Switch to This Session", (p: any) => p._wvTabSessionConfirmSwitch(win, id));
            }
            if (!autoSlot) {
                mk("Rename…", (p: any) => p._wvTabSessionPromptRename(win, id));
            }
            pop.appendChild(doc.createXULElement("menuseparator"));
            mk("Delete", (p: any) => p._wvTabSessionConfirmDelete(win, id));
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(e.screenX, e.screenY, true);
        } catch (er) { Zotero.debug("[Weavero] _wvTabSessionsMenuContext err: " + er); }
    }

    /** Right-click popup on the CURRENT-session header. The current session is a
     *  normal session (it always holds the live tabs, with a default name until you
     *  rename it), so the only action is "Rename Session…". Mirrors
     *  _wvTabSessionsMenuContext. */
    _wvTabSessionCurrentHeaderContext(win: any, panel: any, e: any) {
        try {
            const doc = win.document;
            const activeId = this._wvTabSessionGetActiveId();
            let pop: any = doc.getElementById("wv-cursess-context");
            if (pop) pop.remove();
            pop = doc.createXULElement("menupopup");
            pop.id = "wv-cursess-context";
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
            if (activeId) {
                mk("Rename Session…", (p: any) => p._wvTabSessionPromptRename(win, activeId));
            }
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(e.screenX, e.screenY, true);
        } catch (er) { Zotero.debug("[Weavero] _wvTabSessionCurrentHeaderContext err: " + er); }
    }
}

const _tabSessionsDescriptors = Object.getOwnPropertyDescriptors(_TabSessionsMixin.prototype);
delete (_tabSessionsDescriptors as any).constructor;
export const sessionsMethods = _tabSessionsDescriptors;
