// Module: Firefox-style TAB GROUPS for the MAIN window tab bar.
//
// A group is { id, name, color, collapsed, members:[{libraryID, itemKey}] },
// persisted in the `weavero.tabGroups` pref (same item-keyed pattern as
// pinned tabs, so groups survive restarts and re-attach to session-restored
// tabs). Rendering decorates Zotero's React-owned tab strip:
//   - member tabs get `wv-grouped-tab` + a colored underline
//     (inset box-shadow driven by the --wv-group-color CSS var);
//   - a colored, named CHIP (`.wv-tab-group-chip`) is inserted as a
//     sibling before the group's first open tab. React tolerates foreign
//     siblings; the tab-bar MutationObserver (the pinned-tabs one) re-runs
//     `_applyTabGroups` after every React rewrite, and every mutation here
//     is check-before-write so the observer settles instead of looping;
//   - clicking the chip collapses/expands (members display:none);
//     right-clicking it opens the editor panel (rename / recolor /
//     ungroup / close group).
// Group membership is managed from the tab context menu — a Firefox-style
// "Add Tab to Group ▸" submenu (New Group + colored-dot entries per group;
// rebuilt from the live list on every popupshowing) and "Remove from Tab
// Group". v1 is menu-driven — no drag-into-group gestures yet.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

declare const Zotero: any;
declare const Services: any;

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** Firefox-like group palette. `id` is what the pref stores. */
const WV_GROUP_COLORS: Array<{ id: string; hex: string }> = [
    { id: "blue", hex: "#4f7ce0" },
    { id: "red", hex: "#d9534f" },
    { id: "yellow", hex: "#c99613" },
    { id: "green", hex: "#2e9e5b" },
    { id: "pink", hex: "#d65db1" },
    { id: "purple", hex: "#8a63d2" },
    { id: "cyan", hex: "#2aa1b3" },
    { id: "gray", hex: "#7a7f87" },
];

class _TabGroupsMixin {
    [k: string]: any;

    // ---- Pref model --------------------------------------------------------

    _getEnableTabGroups() {
        try {
            if (!(this as any)._getTabsAndWindowsMaster()) return false;
            const v = Zotero.Prefs.get("weavero.enableTabGroups");
            return v === undefined ? true : !!v;
        } catch (e) { return true; }
    }

    /** Read the persisted groups. Each: { id, name, color, collapsed,
     *  members: [{libraryID, itemKey}] }. */
    _tabGroupsGet(): any[] {
        try {
            const raw = Zotero.Prefs.get("weavero.tabGroups");
            if (!raw) return [];
            const arr = JSON.parse(String(raw));
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    _tabGroupsSet(arr: any[]) {
        try { Zotero.Prefs.set("weavero.tabGroups", JSON.stringify(arr || [])); } catch (e) {}
    }

    _tabGroupColorHex(colorID: any) {
        const c = WV_GROUP_COLORS.find(x => x.id === colorID);
        return (c || WV_GROUP_COLORS[0]).hex;
    }

    /** The group containing (libraryID, itemKey), or null. */
    _tabGroupOfKey(libraryID: any, itemKey: any) {
        const groups = this._tabGroupsGet();
        return groups.find((g: any) => (g.members || []).some(
            (m: any) => m.libraryID === libraryID && m.itemKey === itemKey)) || null;
    }

    /** Create a group and return it. `firstKey` optional {libraryID,itemKey}. */
    _tabGroupCreate(name: string, color: string, firstKey?: any) {
        const groups = this._tabGroupsGet();
        const g = {
            id: "wvg-" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
            name: String(name || ""),
            color: WV_GROUP_COLORS.some(c => c.id === color) ? color : "blue",
            collapsed: false,
            members: [] as any[],
        };
        groups.push(g);
        this._tabGroupsSet(groups);
        if (firstKey) this._tabGroupAddKey(g.id, firstKey);
        return g;
    }

    /** Add a key to a group (removing it from any other group first). */
    _tabGroupAddKey(groupID: any, key: any) {
        if (!key || key.libraryID == null || !key.itemKey) return;
        let groups = this._tabGroupsGet();
        for (const g of groups) {
            g.members = (g.members || []).filter(
                (m: any) => !(m.libraryID === key.libraryID && m.itemKey === key.itemKey));
        }
        const g = groups.find((x: any) => x.id === groupID);
        if (g) g.members.push({ libraryID: key.libraryID, itemKey: key.itemKey });
        // A removal above may have emptied another group — drop empties.
        groups = groups.filter((x: any) => (x.members || []).length);
        this._tabGroupsSet(groups);
    }

    /** Remove a key from whatever group holds it; empty groups are dropped. */
    _tabGroupRemoveKey(libraryID: any, itemKey: any) {
        let groups = this._tabGroupsGet();
        for (const g of groups) {
            g.members = (g.members || []).filter(
                (m: any) => !(m.libraryID === libraryID && m.itemKey === itemKey));
        }
        groups = groups.filter((x: any) => (x.members || []).length);
        this._tabGroupsSet(groups);
    }

    /** Delete a group (tabs stay open — "Ungroup"). */
    _tabGroupDelete(groupID: any) {
        this._tabGroupsSet(this._tabGroupsGet().filter((g: any) => g.id !== groupID));
    }

    _tabGroupUpdate(groupID: any, patch: any) {
        const groups = this._tabGroupsGet();
        const g = groups.find((x: any) => x.id === groupID);
        if (!g) return;
        Object.assign(g, patch || {});
        this._tabGroupsSet(groups);
    }

    /** Re-render groups EVERYWHERE: every main window's tab bar and every
     *  reader window's strip (the reader strip re-render includes its own
     *  group pass). */
    _wvTabGroupApplyEverywhere() {
        try { for (const w of Zotero.getMainWindows()) this._applyTabGroups(w); } catch (e) {}
        try {
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (w._wvWT) { try { (this as any)._wvWTRenderStrip(w); } catch (e) {} }
            }
        } catch (e) {}
    }

    // ---- Styles -------------------------------------------------------------

    _ensureTabGroupStyles(doc: any) {
        try {
            const STYLE_VERSION = "18";
            const old = doc.getElementById("wv-tab-group-styles");
            if (old) {
                if (old.getAttribute("data-wv-ver") === STYLE_VERSION) return;
                old.remove();                       // stale rules from a previous build
            }
            const st = doc.createElementNS(HTML_NS, "style");
            st.id = "wv-tab-group-styles";
            st.setAttribute("data-wv-ver", STYLE_VERSION);
            st.textContent = [
                // Member underline — a ::after bar that extends LEFT across the
                // 4px flex gap to the previous member (7px for the first member,
                // reaching the chip), so the group reads as ONE continuous line,
                // like Firefox. (.tab is position:relative + overflow:visible.)
                "#tab-bar-container .tab.wv-grouped-tab::after {",
                "  content: \"\"; position: absolute; bottom: 0; height: 2px;",
                "  left: -4px; right: 0; border-radius: 1px;",
                "  background: var(--wv-group-color, #4f7ce0);",
                "  pointer-events: none;",
                "}",
                "#tab-bar-container .tab.wv-group-first::after { left: -7px; }",
                // Collapsed members: ZERO-WIDTH collapse, NOT display:none.
                // A display:none tab has a 0x0 rect at the window origin, so
                // Zotero's drag-midpoint math sees phantom tabs at the LEFT
                // EDGE (the pinned region) and splices dragged tabs among the
                // hidden members — the \"group jumps around during pin drags\"
                // bug. Zero-width keeps them in flex flow at the collapse
                // point, so drag math stays sane. The negative margin cancels
                // the container's 4px flex gap per hidden tab.",
                "#tab-bar-container .tab.wv-group-hidden,",
                // Multi-tab drag: the non-dragged selected tabs stow the same
                // way for the duration of the drag (they travel as one batch).
                "#tab-bar-container .tab.wv-drag-stowed {",
                "  flex: 0 0 0px !important; width: 0 !important; min-width: 0 !important;",
                "  padding: 0 !important; border: none !important; overflow: hidden !important;",
                // -4px cancels the MAIN bar's 4px flex gap per hidden tab.
                "  margin: 0 0 0 -4px !important; opacity: 0 !important;",
                "  pointer-events: none !important;",
                "}",
                // Reader strips have NO flex gap — the -4px would pull the
                // following tab UNDER the chip (13px overlap with 4 hidden
                // members, measured). Plain margin 0 there.
                ".wv-window-tabs .wv-window-tab.wv-group-hidden {",
                "  flex: 0 0 0px !important; width: 0 !important; min-width: 0 !important;",
                "  padding: 0 !important; border: none !important; overflow: hidden !important;",
                "  margin: 0 !important; opacity: 0 !important;",
                "  pointer-events: none !important;",
                "}",
                "#tab-bar-container .tab.wv-group-hidden::after,",
                "#tab-bar-container .tab.wv-drag-stowed::after,",
                ".wv-window-tabs .wv-window-tab.wv-group-hidden::after { display: none !important; }",
                // READER-window strip twins (Weavero-owned .wv-window-tab strip).
                ".wv-window-tabs .wv-window-tab.wv-grouped-tab { position: relative; }",
                ".wv-window-tabs .wv-window-tab.wv-grouped-tab::after {",
                "  content: \"\"; position: absolute; bottom: 0; height: 2px;",
                "  left: -4px; right: 0; border-radius: 1px;",
                "  background: var(--wv-group-color, #4f7ce0);",
                "  pointer-events: none;",
                "}",
                ".wv-window-tabs .wv-window-tab.wv-group-first::after { left: -7px; }",
                // Multi-selected tabs (Ctrl/Shift+click) — Firefox-style
                // translucent accent tint so the set about to be grouped reads
                // at a glance.
                "#tab-bar-container .tab.wv-multisel,",
                ".wv-window-tabs .wv-window-tab.wv-multisel {",
                "  box-shadow: inset 0 0 0 1px var(--accent-blue, #4072e5);",
                "  background: color-mix(in srgb, var(--accent-blue, #4072e5) 22%, transparent);",
                "}",
                // Drag-onto-tab group creation: the armed target tab.
                "#tab-bar-container .tab.wv-group-create-target {",
                "  box-shadow: inset 0 0 0 2px var(--accent-blue, #4072e5) !important;",
                "  background: color-mix(in srgb, var(--accent-blue, #4072e5) 18%, transparent) !important;",
                "  border-radius: 6px;",
                "}",
                // Editor panel, Firefox "Manage tab group" layout.
                ".wv-tg-title { text-align: center; font-weight: 600; font-size: inherit; padding: 2px 0 4px; }",
                ".wv-tg-label { font-size: 11px; opacity: 0.7; margin: 2px 2px -2px; }",
                ".wv-tg-menuitem {",
                "  padding: 4px 8px; border-radius: 5px; font-size: inherit;",
                "}",
                ".wv-tg-menuitem:hover { background: rgba(127,127,127,0.18); }",
                ".wv-tg-menuitem.wv-danger { color: #e2484d; }",
                // "Tab Groups" section in the tabs-menu panel.
                ".wv-tgmenu-header {",
                "  margin: 8px 4px 2px; padding: 4px 6px 2px;",
                "  border-top: 1px solid rgba(127,127,127,0.3);",
                "  font-size: 11px; font-weight: 600; opacity: 0.7;",
                "}",
                ".wv-tgmenu-row {",
                "  display: flex; align-items: center; gap: 7px;",
                "  padding: 4px 8px; margin: 0 4px; border-radius: 5px;",
                "}",
                ".wv-tgmenu-row:hover { background: rgba(127,127,127,0.18); }",
                // Firefox-style group chip: rounded SQUARE, filled when the
                // group is open, outline-only when saved.
                ".wv-tgmenu-dot {",
                "  width: 12px; height: 12px; border-radius: 3px;",
                "  flex: 0 0 auto; box-sizing: border-box;",
                "}",
                ".wv-tgmenu-name {",
                "  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis;",
                "  white-space: nowrap; font-size: 12px;",
                "}",
                ".wv-tgmenu-count { flex: 0 0 auto; font-size: 11px; opacity: 0.6; }",
                // Inline group headers nesting the tab rows (Firefox layout).
                // The chip's CENTER sits on the tab-icon column's center.
                // Icon position depends on the panel mode (measured): flat
                // list icons center at x=14 → chip padding-left 4; sort-by-
                // library indents rows (18px) → icons center at x=26 → 16.
                ".wv-tgrow-header {",
                "  display: flex; align-items: center; gap: 7px;",
                "  padding: 4px 8px 4px 4px; margin: 2px 4px 0; border-radius: 5px;",
                "  font-size: 12px; font-weight: 600;",
                "}",
                "#zotero-tabs-menu-panel.wv-tabs-menu-grouped .wv-tgrow-header {",
                "  padding-left: 16px;",
                "}",
                ".wv-tgrow-header:hover { background: rgba(127,127,127,0.18); }",
                ".wv-tgrow-chip { width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto; }",
                ".wv-tgrow-count { margin-left: 2px; font-size: 11px; font-weight: 400; opacity: 0.6; flex: 0 0 auto; }",
                ".wv-tgrow-twisty {",
                "  margin-left: auto; flex: 0 0 auto;",
                "  font-size: 9px; opacity: 0.6; width: 12px; text-align: center;",
                "}",
                "#zotero-tabs-menu-list .row.wv-tgrow-member { margin-left: 18px; }",
                "#zotero-tabs-menu-list .row.wv-tgrow-hidden { display: none !important; }",
                // Reader-window tabs-menu twins (Weavero-built panel).
                "#wv-wtl-list .row.wv-tgrow-member { margin-left: 18px; }",
                "#wv-wtl-list .row.wv-tgrow-hidden { display: none !important; }",
                "#wv-wtl-list.wv-grouped .wv-tgrow-header { padding-left: 16px; }",
                // Dragged tab/chip turns translucent so the drop slot shows
                // through (Firefox behavior). Zotero's React tab bar applies
                // .dragging to the tab being dragged.
                "#tab-bar-container .tab.dragging { opacity: 0.45 !important; }",
                ".wv-tab-group-chip.wv-tg-dragging { opacity: 0.45 !important; }",
                ".wv-window-tabs .wv-window-tab.wv-tg-dragging { opacity: 0.45 !important; }",
                // Hover preview of a collapsed group: one row per tab.
                // The hover preview is a tight list (Firefox-style): slim
                // panel padding, adjacent rows — overrides the roomier
                // defaults the editor panel keeps.
                "#wv-tab-group-preview .wv-tg-panel-body { padding: 4px; gap: 0; min-width: 240px; }",
                ".wv-tg-preview-row {",
                "  display: flex; align-items: center; gap: 7px;",
                "  padding: 3px 8px; border-radius: 4px; max-width: 320px;",
                "}",
                ".wv-tg-preview-row:hover { background: rgba(127,127,127,0.18); }",
                ".wv-tg-preview-dot { width: 8px; height: 8px; border-radius: 4px; flex: 0 0 auto; }",
                ".wv-tg-preview-icon { width: 16px; height: 16px; flex: 0 0 auto; }",
                // Group-library badge on preview icons — same overlay the
                // strip puts on tab icons (groups.svg disc, top-left).
                ".wv-tg-preview-iconwrap {",
                "  position: relative; overflow: visible; flex: 0 0 auto;",
                "  width: 16px; height: 16px;",
                "}",
                ".wv-tg-preview-iconwrap::after {",
                "  content: \"\"; position: absolute; left: -5px; top: -4px;",
                "  width: 13px; height: 13px; border-radius: 50%;",
                "  background-color: var(--material-toolbar, #fff);",
                "  background-image: url(\"chrome://zotero/skin/collection-tree/16/light/groups.svg\");",
                "  background-size: 11px 11px; background-repeat: no-repeat;",
                "  background-position: center; pointer-events: none;",
                "}",
                ".wv-tg-preview-title {",
                "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;",
                "}",
                // The chip.
                ".wv-tab-group-chip {",
                // CRITICAL: the tab bar doubles as the window-drag region
                // (-moz-window-dragging: drag); native tabs opt out, and
                // without this the OS swallows every press on the chip as a
                // window-drag grab — NO DOM mouse events ever fire (the
                // "single click does nothing" bug).
                "  -moz-window-dragging: no-drag;",
                "  display: inline-flex; align-items: center; gap: 4px;",
                "  flex: 0 0 auto; align-self: center;",
                "  margin: 0 3px; padding: 1px 8px 2px 8px;",
                "  border-radius: 8px; max-width: 150px; overflow: hidden;",
                "  background: var(--wv-group-color, #4f7ce0); color: #fff;",
                "  font-size: 11px; font-weight: 700; line-height: 16px;",
                "  cursor: pointer; user-select: none; white-space: nowrap;",
                "}",
                ".wv-tab-group-chip .wv-tgchip-label {",
                "  overflow: hidden; text-overflow: ellipsis;",
                "}",
                // Nameless groups still show a grabbable dot-sized chip.
                ".wv-tab-group-chip .wv-tgchip-label:empty { min-width: 6px; min-height: 10px; }",
                ".wv-tab-group-chip .wv-tgchip-count {",
                "  font-weight: 600; opacity: 0.85;",
                "}",
                ".wv-tab-group-chip:hover { filter: brightness(1.12); }",
                // Cross-window drop preview: skeleton tabs (one per migrating
                // member) following the ghost chip — the strip shifts to show
                // the final state before release.
                ".wv-tg-ghost-tab {",
                "  flex: 0 0 auto; align-self: stretch; max-width: 130px;",
                "  margin: 2px 0; padding: 0 10px; border-radius: 4px;",
                "  display: flex; align-items: center; overflow: hidden;",
                "  white-space: nowrap; text-overflow: ellipsis;",
                "  font-size: 12px; opacity: 0.55; pointer-events: none;",
                "  background: rgba(127,127,127,0.25);",
                "  box-shadow: inset 0 -2px 0 0 var(--wv-group-color, #4f7ce0);",
                "}",
                // Picker / editor panel internals.
                ".wv-tg-panel-body {",
                "  display: flex; flex-direction: column; gap: 4px;",
                "  padding: 6px; min-width: 230px;",
                // Zotero chrome uses the system UI font (12px Segoe UI on
                // Windows) — `font: message-box` is exactly that, so the
                // panel's typography matches native menus and panes.
                "  font: message-box;",
                "}",
                ".wv-tg-row { display: flex; align-items: center; gap: 7px; }",
                ".wv-tg-grouprow {",
                "  display: flex; align-items: center; gap: 7px;",
                "  padding: 4px 6px; border-radius: 5px; cursor: pointer;",
                "}",
                ".wv-tg-grouprow:hover { background: rgba(127,127,127,0.15); }",
                ".wv-tg-dot {",
                "  width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto;",
                "}",
                ".wv-tg-name-input {",
                "  flex: 1 1 auto; min-width: 90px; padding: 3px 6px;",
                "  border: 1px solid rgba(127,127,127,0.45); border-radius: 4px;",
                "  background: transparent; color: inherit; font: inherit;",
                "}",
                ".wv-tg-swatches { display: flex; gap: 6px; flex-wrap: wrap; }",
                ".wv-tg-swatch {",
                "  width: 16px; height: 16px; border-radius: 50%; cursor: pointer;",
                "  border: 2px solid transparent; box-sizing: border-box;",
                "}",
                ".wv-tg-swatch.wv-selected { border-color: currentColor; }",
                ".wv-tg-btnrow { display: flex; gap: 6px; justify-content: flex-end; }",
                ".wv-tg-btn {",
                "  padding: 3px 10px; border-radius: 5px; cursor: pointer;",
                "  border: 1px solid rgba(127,127,127,0.45); background: transparent;",
                "  color: inherit; font: inherit; font-size: 12px;",
                "}",
                ".wv-tg-btn:hover { background: rgba(127,127,127,0.15); }",
                ".wv-tg-sep { border-top: 1px solid rgba(127,127,127,0.3); margin: 2px 0; }",
                ".wv-tg-title { font-weight: 600; opacity: 0.75; font-size: 11px; }",
            ].join("\n");
            doc.documentElement.appendChild(st);
        } catch (e) { Zotero.debug("[Weavero] _ensureTabGroupStyles err: " + e); }
    }

    // ---- Apply (called from the tab-bar MutationObserver + directly) --------

    /** Reconcile the strip with the persisted groups. Runs on every tab-bar
     *  mutation, so every write is guarded by a did-it-change check. Does NOT
     *  force tab positions (ordering is enforced once, at add time). */
    _applyTabGroups(win: any) {
        try {
            if (!win || !win.document) return;
            // A native tab drag is in flight: HANDS OFF. Re-syncing member
            // order / repositioning the chip here fights Zotero's live
            // reorder — the layout shift moves the tab midpoints, Zotero
            // recomputes, and the dragged tab flickers between positions
            // (worst around the pinned region). Everything re-applies from
            // the dragend membership pass.
            if (win._wvTabGroupDragTabID != null) {
                // …but keep multi-drag stow classes alive: React rewrites
                // className on its re-renders, which strips them mid-drag.
                try {
                    for (const oid of win._wvMultiDragIDs || []) {
                        const el = win.document.querySelector('#tab-bar-container .tab[data-id="' + oid + '"]');
                        if (el && !el.classList.contains("wv-drag-stowed")) el.classList.add("wv-drag-stowed");
                    }
                } catch (e) {}
                // Same for the group-create target highlight.
                try {
                    const tid = win._wvGroupCreateTarget;
                    if (tid) {
                        const el = win.document.querySelector('#tab-bar-container .tab[data-id="' + tid + '"]');
                        if (el && !el.classList.contains("wv-group-create-target")) el.classList.add("wv-group-create-target");
                    }
                } catch (e) {}
                return;
            }
            const doc = win.document;
            if (!this._getEnableTabGroups()) { this._stripTabGroups(win); return; }
            const Z_Tabs: any = win.Zotero_Tabs;
            const tabsBox = doc.querySelector("#tab-bar-container .tabs-wrapper .tabs");
            if (!Z_Tabs || !Z_Tabs._tabs || !tabsBox) return;
            const groups = this._tabGroupsGet();
            if (!groups.length) { this._stripTabGroups(win); return; }

            // Open tabs by key, in Zotero's display order.
            const keyOf = (tab: any) => {
                const k = (this as any)._tabPinKey(tab);
                return k ? (k.libraryID + ":" + k.itemKey) : null;
            };
            const openByKey = new Map<string, any>();
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                const k = t && keyOf(t);
                if (k && !openByKey.has(k)) openByKey.set(k, t);
            }

            const wantClass = new Map<string, { group: any; hidden: boolean; first?: boolean }>();   // tabID →
            let prefDirty = false;
            for (const g of groups) {
                // Split members into open (re-synced to display order) + closed.
                const memberKeys = new Set((g.members || []).map(
                    (m: any) => m.libraryID + ":" + m.itemKey));
                const openMembers: any[] = [];
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    const k = t && keyOf(t);
                    if (k && memberKeys.has(k)) openMembers.push({ tab: t, key: k });
                }
                // Re-sync member order: open members first in display order,
                // then closed members (kept; they re-join when reopened).
                const openSet = new Set(openMembers.map(m => m.key));
                const newMembers = openMembers.map((m) => {
                    const pk = (this as any)._tabPinKey(m.tab);
                    return { libraryID: pk.libraryID, itemKey: pk.itemKey };
                });
                for (const m of (g.members || [])) {
                    if (!openSet.has(m.libraryID + ":" + m.itemKey)) {
                        // Keep closed members only while the item still exists.
                        try {
                            if (Zotero.Items.getIDFromLibraryAndKey(m.libraryID, m.itemKey)) {
                                newMembers.push(m);
                            } else prefDirty = true;
                        } catch (e) { newMembers.push(m); }
                    }
                }
                if (JSON.stringify(newMembers) !== JSON.stringify(g.members)) {
                    g.members = newMembers;
                    prefDirty = true;
                }

                // Chip + member classes.
                const chipID = "wv-tgchip-" + g.id;
                let chip = doc.getElementById(chipID);
                if (!openMembers.length) {
                    if (chip) chip.remove();
                    continue;
                }
                // A chip surviving from a previous plugin instance has stale
                // handlers — recreate it under this instance.
                if (chip && (chip as any)._wvOwner !== this) { chip.remove(); chip = null; }
                if (!chip) chip = this._wvTabGroupChipCreate(win, g.id);
                this._wvTabGroupChipSync(win, chip, g, openMembers.length);
                const firstNode = tabsBox.querySelector(
                    '.tab[data-id="' + openMembers[0].tab.id + '"]');
                if (firstNode && (chip.parentNode !== tabsBox || chip.nextSibling !== firstNode)) {
                    try { tabsBox.insertBefore(chip, firstNode); } catch (e) {}
                }
                // A collapsed group hides its members EXCEPT the selected tab —
                // Firefox keeps the active tab visible beside the chip. When the
                // selection later moves elsewhere, the observer re-runs this and
                // the tab folds away.
                for (let i = 0; i < openMembers.length; i++) {
                    const t = openMembers[i].tab;
                    wantClass.set(t.id, {
                        group: g,
                        hidden: !!g.collapsed && t.id !== Z_Tabs.selectedID,
                        first: i === 0,
                    });
                }
            }
            if (prefDirty) this._tabGroupsSet(groups);

            // Apply / strip member classes (check-before-write).
            const liveGroupIDs = new Set(groups.map((g: any) => g.id));
            for (const node of doc.querySelectorAll("#tab-bar-container .tab[data-id]")) {
                const id = node.getAttribute("data-id");
                const want = wantClass.get(id);
                if (want) {
                    const hex = this._tabGroupColorHex(want.group.color);
                    if (node.style.getPropertyValue("--wv-group-color") !== hex) {
                        node.style.setProperty("--wv-group-color", hex);
                    }
                    if (!node.classList.contains("wv-grouped-tab")) node.classList.add("wv-grouped-tab");
                    if (node.getAttribute("data-wv-group") !== want.group.id) {
                        node.setAttribute("data-wv-group", want.group.id);
                    }
                    if (want.hidden !== node.classList.contains("wv-group-hidden")) {
                        node.classList.toggle("wv-group-hidden", want.hidden);
                    }
                    if (!!(want as any).first !== node.classList.contains("wv-group-first")) {
                        node.classList.toggle("wv-group-first", !!(want as any).first);
                    }
                } else if (node.classList.contains("wv-grouped-tab")) {
                    node.classList.remove("wv-grouped-tab", "wv-group-hidden", "wv-group-first");
                    node.removeAttribute("data-wv-group");
                    node.style.removeProperty("--wv-group-color");
                }
            }
            // Remove chips of deleted groups. The drop-ghost's chip clone has
            // no data-wv-group — don't eat it (the ghost's own insertion fires
            // this observer pass, which used to delete the chip instantly and
            // leave an invisible empty wrapper).
            for (const chip of doc.querySelectorAll(".wv-tab-group-chip")) {
                if (chip.closest("#wv-tg-drop-ghost")) continue;
                const gid = chip.getAttribute("data-wv-group");
                if (!gid || !liveGroupIDs.has(gid)) chip.remove();
            }
            // Re-sync multi-select highlights (React re-renders drop classes).
            try { this._wvTabMultiSelSync(win); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _applyTabGroups err: " + e); }
    }

    _stripTabGroups(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            for (const chip of doc.querySelectorAll(".wv-tab-group-chip")) chip.remove();
            for (const node of doc.querySelectorAll("#tab-bar-container .tab.wv-grouped-tab")) {
                node.classList.remove("wv-grouped-tab", "wv-group-hidden", "wv-group-first");
                node.removeAttribute("data-wv-group");
                node.style.removeProperty("--wv-group-color");
            }
        } catch (e) {}
    }

    // ---- Chip ---------------------------------------------------------------

    _wvTabGroupChipCreate(win: any, groupID: any) {
        const doc = win.document;
        const chip = doc.createElementNS(HTML_NS, "div");
        chip.id = "wv-tgchip-" + groupID;
        chip.className = "wv-tab-group-chip";
        chip.setAttribute("data-wv-group", groupID);
        // Owner stamp: a chip created by a PREVIOUS plugin instance (hot
        // reload) carries dead-closure handlers — _applyTabGroups checks this
        // and recreates. (This was why the chip needed two clicks after a
        // reload: the surviving chip still had the old instance's listeners.)
        (chip as any)._wvOwner = this;
        const label = doc.createElementNS(HTML_NS, "span");
        label.className = "wv-tgchip-label";
        chip.appendChild(label);
        const count = doc.createElementNS(HTML_NS, "span");
        count.className = "wv-tgchip-count";
        chip.appendChild(count);
        // Resolve the LIVE plugin at event time (never the creating closure —
        // it goes stale across reloads).
        const live = () => {
            try { return (Zotero as any).Weavero && (Zotero as any).Weavero.plugin; } catch (e) { return null; }
        };
        // Interaction model: PRESS + RELEASE (without a drag) toggles
        // collapse; press + move drags the whole group (the chip is an HTML5
        // drag source, so mousedown must NOT preventDefault). Toggling on
        // mouseup keeps the gesture unambiguous — nothing mutates between
        // press and release, so the release always lands on this same chip.
        chip.setAttribute("draggable", "true");
        let pressed = false, dragged = false;
        chip.addEventListener("mousedown", (e: any) => {
            try {
                if (e.button !== 0) return;
                e.stopPropagation();          // keep Zotero's strip handlers out
                pressed = true; dragged = false;
            } catch (er) {}
        });
        chip.addEventListener("mouseup", (e: any) => {
            try {
                if (e.button !== 0 || !pressed) return;
                pressed = false;
                if (dragged) return;          // a drag, not a click
                e.stopPropagation(); e.preventDefault();
                const p: any = live();
                if (p) p._wvTabGroupToggleCollapse(win, groupID);
            } catch (er) {}
        });
        // Swallow the residual click so nothing beneath reacts.
        chip.addEventListener("click", (e: any) => {
            try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
        });
        chip.addEventListener("dragstart", (e: any) => {
            try {
                dragged = true;
                chip.classList.add("wv-tg-dragging");
                const p: any = live();
                if (p) { try { p._wvTabGroupHoverCancel(win); p._wvTabGroupHideHoverPreview(win); } catch (er2) {} }
                if (!e.dataTransfer || !p) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("application/x-weavero-tabgroup", groupID);
                p._wvGroupDrag = { groupID, sourceWin: win };
                // Drag image: the chip itself (it's small and recognizable).
                try { e.dataTransfer.setDragImage(chip, 10, 10); } catch (er2) {}
            } catch (er) {}
        });
        chip.addEventListener("dragend", () => {
            try {
                pressed = false; dragged = false;
                chip.classList.remove("wv-tg-dragging");
                win._wvGroupDragSlot = null;
                const p: any = live();
                if (p) { p._wvGroupDrag = null; p._wvTabGroupHideAllDropGhosts(); }
            } catch (er) {}
        });
        chip.addEventListener("contextmenu", (e: any) => {
            try {
                e.stopPropagation(); e.preventDefault();
                const p: any = live();
                if (p) p._wvShowTabGroupEditor(win, groupID, chip);
            } catch (er) {}
        });
        // Firefox-style hover preview of a collapsed group's tabs.
        chip.addEventListener("mouseenter", () => {
            try { const p: any = live(); if (p) p._wvTabGroupHoverEnter(win, groupID, chip); } catch (er) {}
        });
        chip.addEventListener("mouseleave", () => {
            try { const p: any = live(); if (p) p._wvTabGroupHoverLeave(win); } catch (er) {}
        });
        return chip;
    }

    _wvTabGroupChipSync(win: any, chip: any, g: any, openCount: number) {
        try {
            const hex = this._tabGroupColorHex(g.color);
            if (chip.style.getPropertyValue("--wv-group-color") !== hex) {
                chip.style.setProperty("--wv-group-color", hex);
            }
            const label = chip.querySelector(".wv-tgchip-label");
            if (label && label.textContent !== (g.name || "")) label.textContent = g.name || "";
            const count = chip.querySelector(".wv-tgchip-count");
            const countText = g.collapsed ? String(openCount) : "";
            if (count && count.textContent !== countText) count.textContent = countText;
            // No native tooltip on chips — the hover preview IS the hover UI
            // (it follows the native tooltip's interaction protocol: opening
            // the editor dismisses it, re-hover shows it above, leave hides).
            if (chip.hasAttribute("title")) chip.removeAttribute("title");
        } catch (e) {}
    }

    _wvTabGroupToggleCollapse(win: any, groupID: any) {
        try {
            try { this._wvTabGroupHoverCancel(win); this._wvTabGroupHideHoverPreview(win); } catch (e) {}
            const groups = this._tabGroupsGet();
            const g = groups.find((x: any) => x.id === groupID);
            if (!g) return;
            g.collapsed = !g.collapsed;
            this._tabGroupsSet(groups);
            // No selection rescue: a collapsed group keeps its SELECTED tab
            // visible (the apply pass exempts it), matching Firefox.
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupToggleCollapse err: " + e); }
    }

    // ---- Group membership commands ------------------------------------------

    /** The window where a group currently "lives" — the main or reader window
     *  with the most open member tabs (null if none are open anywhere). */
    _wvTabGroupHomeWin(groupID: any) {
        try {
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return null;
            const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            if (!ks.size) return null;
            let best: any = null, bestCount = 0;
            try {
                for (const w of Zotero.getMainWindows()) {
                    let n = 0;
                    const Z: any = (w as any).Zotero_Tabs;
                    for (const t of (Z && Z._tabs) || []) {
                        const k = (this as any)._tabPinKey(t);
                        if (k && ks.has(k.libraryID + ":" + k.itemKey)) n++;
                    }
                    if (n > bestCount) { best = w; bestCount = n; }
                }
            } catch (e) {}
            try {
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) {
                    const w: any = en.getNext();
                    if (!w || !w._wvWT) continue;
                    let n = 0;
                    for (const t of w._wvWT.tabs || []) {
                        const k = this._wvTabGroupDeckKey(t);
                        if (k && ks.has(k.libraryID + ":" + k.itemKey)) n++;
                    }
                    if (n > bestCount) { best = w; bestCount = n; }
                }
            } catch (e) {}
            return best;
        } catch (e) { return null; }
    }

    /** Send ONE tab to the group's home window: add the key (so it renders
     *  grouped on arrival), close it here, reopen it there. Main targets ride
     *  _wvMoveTabBetweenMains (focus-then-open + slot poll); reader targets
     *  mount into the deck next to the group's last member. */
    _wvTabGroupSendTabToWin(srcWin: any, tabID: any, tgtWin: any, groupID: any) {
        try {
            const Z: any = srcWin.Zotero_Tabs;
            const tab = Z && Z._tabs.find((t: any) => t.id === tabID);
            const key = tab && (this as any)._tabPinKey(tab);
            if (!key) return;
            this._tabGroupAddKey(groupID, key);
            const itemID = tab.data && tab.data.itemID;
            if (itemID == null) return;
            const isNote = (tab.type === "note");
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const ks = new Set(((g && g.members) || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            if (this._wvTabGroupIsReaderWin(tgtWin)) {
                try { Z.close(tabID); } catch (e) {}
                tgtWin.setTimeout(async () => {
                    try {
                        await (this as any)._wvWTMountTab(tgtWin, itemID, { allowDuplicate: false, select: false, await: true });
                        // Reposition the arrival (appended at the end) right
                        // after the group's last member in the deck order.
                        const st = tgtWin._wvWT;
                        if (st && st.tabs) {
                            const idx = st.tabs.findIndex((t: any) => t.itemID === itemID);
                            let lastMember = -1;
                            for (let i = 0; i < st.tabs.length; i++) {
                                if (i === idx) continue;
                                const k = this._wvTabGroupDeckKey(st.tabs[i]);
                                if (k && ks.has(k.libraryID + ":" + k.itemKey)) lastMember = i;
                            }
                            if (idx >= 0 && lastMember >= 0 && idx !== lastMember + 1) {
                                const [moved] = st.tabs.splice(idx, 1);
                                st.tabs.splice(idx < lastMember ? lastMember : lastMember + 1, 0, moved);
                            }
                            try { (this as any)._wvWTRenderStrip(tgtWin); } catch (e) {}
                            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
                        }
                        this._wvTabGroupApplyEverywhere();
                    } catch (e) {}
                }, 180);
            } else {
                // Slot: right after the group's last open member in the target.
                let targetIndex = 1;
                try {
                    const TZ: any = tgtWin.Zotero_Tabs;
                    for (let i = 1; i < ((TZ && TZ._tabs) || []).length; i++) {
                        const k = (this as any)._tabPinKey(TZ._tabs[i]);
                        if (k && ks.has(k.libraryID + ":" + k.itemKey)) targetIndex = i + 1;
                    }
                } catch (e) {}
                const payload = { itemID, sourceTabId: tabID, readerType: isNote ? "note" : undefined };
                (this as any)._wvMoveTabBetweenMains(srcWin, tgtWin, payload, targetIndex, 0);
                tgtWin.setTimeout(() => {
                    try { this._wvTabGroupStabilize(tgtWin); } catch (e) {}
                    try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
                }, 900);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupSendTabToWin err: " + e); }
    }

    /** Add the tab to a group AND move it adjacent to the group's last open
     *  member (one-time positioning, like _pinTabByCommand). When the group
     *  lives in ANOTHER window, the tab moves there instead — a group never
     *  spans windows. */
    _wvTabGroupAddTab(win: any, tabID: any, groupID: any) {
        try {
            const Z_Tabs: any = win.Zotero_Tabs;
            const tab = Z_Tabs && Z_Tabs._tabs.find((t: any) => t.id === tabID);
            const key = tab && (this as any)._tabPinKey(tab);
            if (!key) return;
            const home = this._wvTabGroupHomeWin(groupID);
            if (home && home !== win) {
                this._wvTabGroupSendTabToWin(win, tabID, home, groupID);
                return;
            }
            this._tabGroupAddKey(groupID, key);
            // Position: directly after the group's last open member.
            try {
                const groups = this._tabGroupsGet();
                const g = groups.find((x: any) => x.id === groupID);
                const memberKeys = new Set((g.members || []).map(
                    (m: any) => m.libraryID + ":" + m.itemKey));
                let lastIdx = -1, curIdx = -1;
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    if (t.id === tabID) { curIdx = i; continue; }   // exclude self
                    const k = (this as any)._tabPinKey(t);
                    if (k && memberKeys.has(k.libraryID + ":" + k.itemKey)) lastIdx = i;
                }
                if (lastIdx >= 0 && typeof Z_Tabs.move === "function") {
                    let target = lastIdx + 1;
                    if (curIdx >= 0 && curIdx < target) target--;   // removal shift
                    Z_Tabs.move(tabID, target);
                }
            } catch (e) {}
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupAddTab err: " + e); }
    }

    _wvTabGroupCloseTabs(win: any, groupID: any) {
        try {
            const groups = this._tabGroupsGet();
            const g = groups.find((x: any) => x.id === groupID);
            if (!g) return;
            const memberKeys = new Set((g.members || []).map(
                (m: any) => m.libraryID + ":" + m.itemKey));
            if (this._wvTabGroupIsReaderWin(win) && win._wvWT) {
                // Reader window: close the member DECK tabs.
                const ids = win._wvWT.tabs
                    .filter((t: any) => { const k = this._wvTabGroupDeckKey(t); return k && memberKeys.has(k.libraryID + ":" + k.itemKey); })
                    .map((t: any) => t.id);
                for (const id of ids) { try { (this as any)._wvWTCloseTab(win, id); } catch (e) {} }
            } else {
                const Z_Tabs: any = win.Zotero_Tabs;
                const ids: string[] = [];
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    const k = (this as any)._tabPinKey(t);
                    if (k && memberKeys.has(k.libraryID + ":" + k.itemKey)) ids.push(t.id);
                }
                for (const id of ids) { try { Z_Tabs.close(id); } catch (e) {} }
            }
            this._tabGroupDelete(groupID);
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupCloseTabs err: " + e); }
    }

    // ---- Drag & drop ----------------------------------------------------------

    /** Container-level DnD wiring (called from the tab-bar decoration setup).
     *  The listeners are THIN DELEGATES to methods on the LIVE plugin —
     *  reloads update behavior without rewiring — and the wiring itself is
     *  VERSIONED + removable, so a reload that does change the listener set
     *  replaces it instead of being skipped by a boolean guard (the stale
     *  guard previously left dev.4 listeners running forever, which is why
     *  drag-into-group and the live preview "shipped" but never fired). */
    _wvWireTabGroupDnD(win: any) {
        try {
            const WIRE_VERSION = 3;
            const doc = win.document;
            const container = doc.getElementById("tab-bar-container");
            if (!container) return;
            if ((container as any)._wvTabGroupDnDVer === WIRE_VERSION) return;
            try { (container as any)._wvTabGroupDnDOff?.(); } catch (e) {}
            const live = () => {
                try { return (Zotero as any).Weavero && (Zotero as any).Weavero.plugin; } catch (e) { return null; }
            };
            const mk = (method: string) => (e: any) => {
                try { const p: any = live(); if (p && p[method]) p[method](win, e); } catch (er) {}
            };
            const hs: Array<[string, any]> = [
                ["dragstart", mk("_wvTabGroupDnDDragStart")],
                ["dragover", mk("_wvTabGroupDnDDragOver")],
                ["dragleave", mk("_wvTabGroupDnDDragLeave")],
                ["drop", mk("_wvTabGroupDnDDrop")],
                ["dragend", mk("_wvTabGroupDnDDragEnd")],
            ];
            for (const [t, h] of hs) container.addEventListener(t, h, true);
            (container as any)._wvTabGroupDnDVer = WIRE_VERSION;
            (container as any)._wvTabGroupDnDOff = () => {
                try { for (const [t, h] of hs) container.removeEventListener(t, h, true); } catch (e) {}
                (container as any)._wvTabGroupDnDVer = 0;
            };
        } catch (e) { Zotero.debug("[Weavero] _wvWireTabGroupDnD err: " + e); }
    }

    /** Debug logging for the group-DnD investigation: Zotero.debug + a capped
     *  in-memory ring (Zotero._wvGroupDnDLog). */
    _wvTGDbg(msg: string) {
        try {
            const line = "[Weavero][groupDnD] " + msg;
            Zotero.debug(line);
            const arr = ((Zotero as any)._wvGroupDnDLog = (Zotero as any)._wvGroupDnDLog || []);
            arr.push(Date.now() % 1000000 + " " + msg);
            if (arr.length > 120) arr.shift();
        } catch (e) {}
    }

    /** Remember which native tab a drag started from (independently of
     *  tabs.ts's `_wvTabDrag`, which its own dragend nulls before we run). */
    _wvTabGroupDnDDragStart(win: any, e: any) {
        try {
            const tabNode = e.target && e.target.closest && e.target.closest(".tab[data-id]");
            win._wvTabGroupDragTabID = tabNode ? tabNode.getAttribute("data-id") : null;
            // Multi-tab drag (Firefox): dragging a tab that's part of the
            // multi-selection takes the WHOLE selection along. The others are
            // stowed (zero-width) for the drag and re-clustered after the
            // dragged tab on drop (same window) or migrated (cross-window).
            win._wvMultiDragIDs = null;
            try {
                const id = win._wvTabGroupDragTabID;
                const sel = win._wvSelTabIDs;
                if (id && id !== "zotero-pane" && sel && sel.size > 1 && sel.has(id)) {
                    const Z: any = win.Zotero_Tabs;
                    const others = (((Z && Z._tabs) || []).map((t: any) => t && t.id))
                        .filter((x: any) => x && x !== id && sel.has(x));
                    if (others.length) {
                        win._wvMultiDragIDs = others;
                        for (const oid of others) {
                            const el = win.document.querySelector('#tab-bar-container .tab[data-id="' + oid + '"]');
                            if (el) el.classList.add("wv-drag-stowed");
                        }
                    }
                }
            } catch (er2) {}
            this._wvTGDbg("dragstart tabID=" + win._wvTabGroupDragTabID
                + " multi=" + (win._wvMultiDragIDs ? win._wvMultiDragIDs.length : 0)
                + " target=" + (e.target && e.target.tagName) + "." + (e.target && e.target.className && String(e.target.className).split(" ")[0]));
        } catch (er) { this._wvTGDbg("dragstart ERR=" + er); }
    }

    // ---- Drag-onto-tab group creation (Firefox) -------------------------------
    // While a native tab drag hovers the CENTER band of another (ungrouped,
    // unpinned) tab for ~350ms, that tab is "armed" and highlighted; dropping
    // then creates a new group from the two tabs. Pausing BEFORE the midpoint
    // crossing means Zotero's live reorder hasn't fired yet, so the gesture is
    // exactly Firefox's "drag onto the tab and wait for the highlight".

    _wvTabGroupDwellClear(win: any) {
        try {
            if (win._wvGCTimer) { win.clearTimeout(win._wvGCTimer); win._wvGCTimer = null; }
            win._wvGCCandidate = null;
            if (win._wvGroupCreateTarget) {
                win._wvGroupCreateTarget = null;
                for (const el of win.document.querySelectorAll("#tab-bar-container .tab.wv-group-create-target")) {
                    el.classList.remove("wv-group-create-target");
                }
            }
        } catch (e) {}
    }

    _wvTabGroupDwellTrack(win: any, e: any) {
        const dragID = win._wvTabGroupDragTabID;
        const node = e.target && e.target.closest && e.target.closest("#tab-bar-container .tab[data-id]");
        if (!node) { this._wvTabGroupDwellClear(win); return; }
        const id = node.getAttribute("data-id");
        if (!id || id === dragID || id === "zotero-pane") { this._wvTabGroupDwellClear(win); return; }
        // Center band only — the edges stay reorder territory.
        const r = node.getBoundingClientRect();
        if (!r.width || e.clientX < r.left + r.width * 0.15 || e.clientX > r.left + r.width * 0.85) {
            this._wvTabGroupDwellClear(win); return;
        }
        const Z: any = win.Zotero_Tabs;
        const t = Z && Z._tabs.find((x: any) => x && x.id === id);
        const k = t && (this as any)._tabPinKey(t);
        // Pinned tabs can't be grouped; grouped targets are handled by the
        // geometric JOIN rule already.
        if (!k || (this as any)._pinnedTabsHas(k.libraryID, k.itemKey)
                || this._tabGroupOfKey(k.libraryID, k.itemKey)) {
            this._wvTabGroupDwellClear(win); return;
        }
        if (win._wvGroupCreateTarget === id) return;     // armed — keep it
        if (win._wvGCCandidate === id) return;           // dwell timer running
        this._wvTabGroupDwellClear(win);
        win._wvGCCandidate = id;
        win._wvGCTimer = win.setTimeout(() => {
            try {
                win._wvGCTimer = null;
                if (win._wvTabGroupDragTabID !== dragID) return;   // drag ended meanwhile
                win._wvGroupCreateTarget = id;
                const el = win.document.querySelector('#tab-bar-container .tab[data-id="' + id + '"]');
                if (el) el.classList.add("wv-group-create-target");
                this._wvTGDbg("group-create armed on " + id);
            } catch (er) {}
        }, 350);
    }

    /** Drop landed on an armed target → new group from target + dragged tab.
     *  (A dragged multi-selection follows via the multi-drag settle pass,
     *  which copies the dragged tab's group outcome to the whole batch.) */
    _wvTabGroupCreateFromDrop(win: any, targetID: any, draggedID: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            const tt = Z && Z._tabs.find((x: any) => x && x.id === targetID);
            const dt = Z && Z._tabs.find((x: any) => x && x.id === draggedID);
            const tk = tt && (this as any)._tabPinKey(tt);
            const dk = dt && (this as any)._tabPinKey(dt);
            if (!tk || !dk) return;
            // The dragged tab leaves any group it was in.
            this._tabGroupRemoveKey(dk.libraryID, dk.itemKey);
            const groups = this._tabGroupsGet();
            const color = WV_GROUP_COLORS[groups.length % WV_GROUP_COLORS.length].id;
            const g = this._tabGroupCreate("", color);
            this._tabGroupAddKey(g.id, tk);
            this._tabGroupAddKey(g.id, dk);
            // Dragged tab sits right after the target.
            try {
                const ti = Z._tabs.indexOf(tt);
                const di = Z._tabs.indexOf(dt);
                let pos = ti + 1;
                if (di >= 0 && di < pos) pos--;
                if (typeof Z.move === "function") Z.move(draggedID, pos);
            } catch (e) {}
            this._wvTabGroupApplyEverywhere();
            this._wvTGDbg("group-create from drop: " + targetID + " + " + draggedID);
            // Name it right away, like Firefox.
            win.setTimeout(() => {
                try {
                    const chip = win.document.getElementById("wv-tgchip-" + g.id);
                    if (chip) this._wvShowTabGroupEditor(win, g.id, chip);
                } catch (e) {}
            }, 150);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupCreateFromDrop err: " + e); }
    }

    /** Measure every group's pixel region (chip + visible members) RIGHT NOW.
     *  Snapshotted on each dragover — the membership pass runs ~80ms after
     *  the drop, when the layout has already shifted, so post-hoc measuring
     *  compared a stale x against fresh rects and joins never matched. */
    _wvTabGroupMeasureRegions(win: any, isReader: boolean, excludeTabID: any) {
        const out: any = {};
        try {
            const doc = win.document;
            for (const g of this._tabGroupsGet()) {
                let left = Infinity, right = -Infinity;
                const chip = doc.getElementById("wv-tgchip-" + g.id);
                if (chip) {
                    const r = chip.getBoundingClientRect();
                    if (r.width) { left = Math.min(left, r.left); right = Math.max(right, r.right); }
                }
                const sel = isReader
                    ? '.wv-window-tabs .wv-window-tab[data-wv-group="' + g.id + '"]'
                    : '#tab-bar-container .tab[data-wv-group="' + g.id + '"]';
                const idAttr = isReader ? "data-wv-tab-id" : "data-id";
                for (const node of doc.querySelectorAll(sel)) {
                    if (excludeTabID && node.getAttribute(idAttr) === String(excludeTabID)) continue;
                    const r = node.getBoundingClientRect();
                    if (!r.width) continue;
                    left = Math.min(left, r.left);
                    right = Math.max(right, r.right);
                }
                if (right > -Infinity) out[g.id] = { left, right };
            }
        } catch (e) {}
        return out;
    }

    _wvTabGroupDnDDragOver(win: any, e: any) {
        try {
            win._wvTabDragLastX = e.clientX;
            win._wvTabDragLastY = e.clientY;
            // Native tab drag in flight → keep a live region snapshot for the
            // dragend membership decision, and track the drag-onto-tab
            // group-creation dwell (Firefox: hover another tab's center,
            // it highlights, drop to group the two).
            if (win._wvTabGroupDragTabID != null) {
                win._wvTabGroupRegions = this._wvTabGroupMeasureRegions(win, false, win._wvTabGroupDragTabID);
                try { this._wvTabGroupDwellTrack(win, e); } catch (er) {}
            }
            const gd = (this as any)._wvGroupDrag;
            if (!gd) return;
            // A group-chip drag: accept the drop and keep Zotero's strip logic
            // out. Same-window drags also move the group under the pointer
            // LIVE (slot-gated); cross-window drags just show the move cursor.
            e.preventDefault(); e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            if (gd.sourceWin === win) {
                this._wvTabGroupLiveMoveGroup(win, gd.groupID, e.clientX);
            } else {
                // Cross-window: preview the landing slot with a ghost chip.
                this._wvTabGroupShowDropGhost(win, gd.groupID, e.clientX, false);
            }
        } catch (er) {}
    }

    /** Pointer left the tab bar mid-drag → drop the preview ghost. Judged by
     *  COORDINATES, not relatedTarget: real drags fire dragleave with a null
     *  relatedTarget at every child boundary (worse cross-window), and the
     *  old check deleted the ghost between every two dragovers — present in
     *  the DOM on every probe, never visible on screen. */
    _wvTabGroupDnDDragLeave(win: any, e: any) {
        try {
            const container = win.document.getElementById("tab-bar-container");
            if (container) {
                const r = container.getBoundingClientRect();
                if (e.clientX > r.left && e.clientX < r.right
                        && e.clientY > r.top && e.clientY < r.bottom) return;   // still inside
            }
            // Pointer genuinely left the bar → invalidate the tracked position
            // so a (0,0) dragend reads as off-window (tear-off), not as the
            // stale last in-bar point. Also disarm any group-create dwell.
            win._wvTabDragLastX = null;
            win._wvTabDragLastY = null;
            this._wvTabGroupDwellClear(win);
            this._wvTabGroupHideDropGhost(win);
        } catch (er) {}
    }

    _wvTabGroupDnDDrop(win: any, e: any) {
        try {
            // Multi-tab drag arriving from ANOTHER main window: the legacy
            // per-window drop handler moves the DRAGGED tab; bring the rest
            // of the source window's selection along, each placed after it.
            try {
                const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
                if (types.indexOf("application/x-weavero-tab-move") >= 0) {
                    const srcWin: any = (this as any)._wvMainTabDragSourceWin;
                    const sel = srcWin && srcWin._wvSelTabIDs;
                    if (srcWin && srcWin !== win && sel && sel.size > 1) {
                        let payload: any = null;
                        try { payload = JSON.parse(e.dataTransfer.getData("application/x-weavero-tab-move")); } catch (er2) {}
                        const dragID = payload && payload.sourceTabId;
                        if (dragID && sel.has(dragID)) {
                            const SZ: any = srcWin.Zotero_Tabs;
                            const others: any[] = [];
                            for (const t of (SZ && SZ._tabs) || []) {
                                if (!t || t.id === dragID || !sel.has(t.id)) continue;
                                others.push({
                                    itemID: t.data && t.data.itemID,
                                    sourceTabId: t.id,
                                    readerType: t.type === "note" ? "note" : "",
                                    tabType: t.type || "",
                                });
                            }
                            sel.clear();
                            try { this._wvTabMultiSelSync(srcWin); } catch (er2) {}
                            if (others.length) {
                                this._wvTGDbg("multi-drag cross-main: +" + others.length + " follower(s)");
                                const primaryItemID = payload.itemID;
                                others.forEach((m: any, i: number) => {
                                    win.setTimeout(() => {
                                        try {
                                            const TZ: any = win.Zotero_Tabs;
                                            let idx = TZ && TZ._tabs ? TZ._tabs.length : 1;
                                            const prim = TZ ? TZ._tabs.findIndex((t: any) =>
                                                t && t.data && t.data.itemID === primaryItemID) : -1;
                                            if (prim >= 0) idx = prim + 1 + i;
                                            (this as any)._wvMoveTabBetweenMains(srcWin, win, m, idx, 0);
                                        } catch (er3) {}
                                    }, 220 * (i + 1));
                                });
                            }
                        }
                    }
                }
            } catch (er) {}
            const gd = (this as any)._wvGroupDrag;
            if (!gd) return;
            e.preventDefault(); e.stopPropagation();
            (this as any)._wvGroupDrag = null;
            win._wvGroupDragSlot = null;
            this._wvTabGroupHideAllDropGhosts();
            if (gd.sourceWin === win) {
                this._wvTabGroupMoveGroupTo(win, gd.groupID, e.clientX);
            } else {
                // Cross-window: migrate the whole group here (from another
                // main window or from a reader window).
                this._wvTGDbg("group drop on MAIN window from " + (this._wvTabGroupIsReaderWin(gd.sourceWin) ? "reader" : "main"));
                this._wvTabGroupMigrateGroup(gd.sourceWin, win, gd.groupID, e.clientX);
            }
        } catch (er) {}
    }

    /** Native tab drag finished → update group membership from the final
     *  position (join when dropped inside a group's span, leave when dragged
     *  out). Deferred a tick so Zotero's own dragend (reorder, tear-off,
     *  cross-window move) settles first — a closed/moved tab simply isn't
     *  found anymore and the pass is a no-op. */
    _wvTabGroupDnDDragEnd(win: any, e: any) {
        try {
            const tabID = win._wvTabGroupDragTabID;
            const multi = win._wvMultiDragIDs || null;
            const createTarget = win._wvGroupCreateTarget || null;
            win._wvTabGroupDragTabID = null;
            win._wvMultiDragIDs = null;
            win._wvGroupDragSlot = null;
            this._wvTabGroupDwellClear(win);
            this._wvTGDbg("dragend tabID=" + tabID + " clientX=" + (e && e.clientX)
                + " lastX=" + win._wvTabDragLastX + " multi=" + (multi ? multi.length : 0)
                + " createTarget=" + createTarget);
            if (!tabID || tabID === "zotero-pane") {
                if (multi) this._wvMultiDragUnstow(win);
                return;
            }
            if (createTarget) {
                // Armed drag-onto-tab drop → create the group; it IS the
                // membership outcome, so skip the geometric pass.
                win.setTimeout(() => {
                    try { this._wvTabGroupCreateFromDrop(win, createTarget, tabID); } catch (e2) {}
                }, 60);
            } else {
                win.setTimeout(() => {
                    try { this._wvTabGroupHandleNativeDragEnd(win, { tabID }); } catch (e2) {}
                }, 80);
            }
            if (multi && multi.length) {
                // After the membership pass (80ms): cluster the rest of the
                // selection behind the dragged tab and copy its group outcome.
                win.setTimeout(() => {
                    try { this._wvMultiDragSettle(win, tabID, multi); } catch (e2) {}
                }, 150);
            }
        } catch (er) { this._wvTGDbg("dragend ERR=" + er); }
    }

    _wvMultiDragUnstow(win: any) {
        try {
            for (const el of win.document.querySelectorAll("#tab-bar-container .tab.wv-drag-stowed")) {
                el.classList.remove("wv-drag-stowed");
            }
        } catch (e) {}
    }

    /** Finish a multi-tab drag in the SOURCE window: re-cluster the other
     *  selected tabs right after the dragged tab (original order) and give
     *  them the dragged tab's group outcome (joined → all join; out → all
     *  leave). If the dragged tab left this window (cross-window drop), the
     *  target's drop handler owns the followers instead. */
    _wvMultiDragSettle(win: any, tabID: any, others: any[]) {
        try {
            this._wvMultiDragUnstow(win);
            const Z: any = win.Zotero_Tabs;
            if (!Z || !Z._tabs) return;
            const dragged = Z._tabs.find((t: any) => t && t.id === tabID);
            if (!dragged) return;                      // moved to another window
            let anchorID = tabID;
            for (const oid of others) {
                const t = Z._tabs.find((x: any) => x && x.id === oid);
                if (!t) continue;
                const anchorIdx = Z._tabs.findIndex((x: any) => x && x.id === anchorID);
                const curIdx = Z._tabs.indexOf(t);
                let target = anchorIdx + 1;
                if (curIdx >= 0 && curIdx < target) target--;
                try { if (typeof Z.move === "function") Z.move(oid, target); } catch (e) {}
                anchorID = oid;
            }
            const dk = (this as any)._tabPinKey(dragged);
            const g = dk && this._tabGroupOfKey(dk.libraryID, dk.itemKey);
            for (const oid of others) {
                const t = Z._tabs.find((x: any) => x && x.id === oid);
                const k = t && (this as any)._tabPinKey(t);
                if (!k) continue;
                if (g) this._tabGroupAddKey(g.id, k);
                else this._tabGroupRemoveKey(k.libraryID, k.itemKey);
            }
            this._wvTabGroupStabilize(win);
            this._wvTabGroupApplyEverywhere();
            this._wvTGDbg("multiDragSettle: " + others.length + " follower(s)"
                + (g ? " joined '" + (g.name || g.id) + "'" : " ungrouped"));
        } catch (e) { this._wvTGDbg("multiDragSettle ERR=" + e); }
    }

    /** After a NATIVE tab drag settles (called from _wireTabBarDrag's dragend):
     *  join the group whose span the tab now sits inside, or leave its own
     *  group when dragged out of the span. Index-based, with the chip's
     *  midpoint disambiguating the "just before the first member" slot
     *  (left of the chip = outside, right = inside). */
    _wvTabGroupHandleNativeDragEnd(win: any, drag: any) {
        try {
            if (!this._getEnableTabGroups()) { this._wvTGDbg("membership: groups disabled"); return; }
            const Z_Tabs: any = win.Zotero_Tabs;
            if (!Z_Tabs || !Z_Tabs._tabs) return;
            const tab = Z_Tabs._tabs.find((t: any) => t && t.id === drag.tabID);
            if (!tab) { this._wvTGDbg("membership: tab gone (" + drag.tabID + ")"); return; }
            const key = (this as any)._tabPinKey(tab);
            if (!key) { this._wvTGDbg("membership: no item key"); return; }
            const groups = this._tabGroupsGet();
            if (!groups.length) { this._wvTGDbg("membership: no groups"); return; }
            const lastX = win._wvTabDragLastX;
            this._wvTGDbg("membership: tab=" + drag.tabID + " lastX=" + lastX);
            const apply = () => { this._wvTabGroupApplyEverywhere(); };
            // GEOMETRIC rule (the Firefox feel): a group's region runs from its
            // chip's LEFT edge to its last visible member's RIGHT edge — the
            // tab joins the group whose region the pointer was over at release.
            // Regions come from the DRAG-TIME snapshot (taken on dragover):
            // measuring here, ~80ms post-drop, compares the release x against
            // already-shifted layout and never matches.
            const snapshot = win._wvTabGroupRegions || null;
            win._wvTabGroupRegions = null;
            const regionOf = (g: any) => {
                if (snapshot && snapshot[g.id]) return snapshot[g.id];
                const live = this._wvTabGroupMeasureRegions(win, false, tab.id);
                return live[g.id] || null;
            };
            if (typeof lastX !== "number") return;
            const curGroup = this._tabGroupOfKey(key.libraryID, key.itemKey);
            // JOIN: pointer released over another group's region.
            for (const g of groups) {
                if (curGroup && g.id === curGroup.id) continue;
                const reg = regionOf(g);
                this._wvTGDbg("membership: group '" + (g.name || g.id) + "' region=" + JSON.stringify(reg));
                if (!reg || lastX < reg.left || lastX > reg.right) continue;
                this._wvTGDbg("membership: JOIN '" + (g.name || g.id) + "'");
                this._tabGroupAddKey(g.id, key);
                this._wvTabGroupStabilize(win);
                apply();
                return;
            }
            // LEAVE: a member released outside its own group's region.
            if (curGroup) {
                const reg = regionOf(curGroup);
                if (!reg) { apply(); return; }                   // sole member: group travels with it
                const out = lastX < reg.left || lastX > reg.right;
                this._wvTGDbg("membership: own-group region=" + JSON.stringify(reg) + " out=" + out);
                if (out) this._tabGroupRemoveKey(key.libraryID, key.itemKey);
                this._wvTabGroupStabilize(win);
                apply();
            } else {
                this._wvTGDbg("membership: no join (outside every region), not a member");
                this._wvTabGroupStabilize(win);
                apply();
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupHandleNativeDragEnd err: " + e); }
    }

    /** Move a whole group (all its open member tabs, keeping their order) to
     *  the position pointed at by `clientX`. The target slot is the first
     *  NON-member tab whose midpoint lies right of x (members are excluded so
     *  the group's own tabs don't distort the target). Returns the slot used,
     *  or -1 when nothing applies. */
    _wvTabGroupMoveGroupTo(win: any, groupID: any, clientX: number) {
        try {
            const Z_Tabs: any = win.Zotero_Tabs;
            const doc = win.document;
            if (!Z_Tabs || !Z_Tabs._tabs || typeof Z_Tabs.move !== "function") return -1;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return -1;
            const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            const memberIDs: string[] = [];
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                const k = (this as any)._tabPinKey(t);
                if (k && ks.has(k.libraryID + ":" + k.itemKey)) memberIDs.push(t.id);
            }
            if (!memberIDs.length) return -1;
            const memberSet = new Set(memberIDs);
            // Build the DESIRED final order outright (incremental anchor moves
            // are fragile against Z_Tabs.move's splice semantics — they
            // reversed the members): non-members keep their relative order,
            // the member block inserts at the slot the pointer x points into.
            const nonMembers: string[] = Z_Tabs._tabs
                .map((t: any) => t && t.id)
                .filter((id: any) => id && !memberSet.has(id));
            let slot = nonMembers.length;                         // default: end
            for (const node of doc.querySelectorAll("#tab-bar-container .tab[data-id]")) {
                const id = node.getAttribute("data-id");
                if (memberSet.has(id)) continue;
                const r = node.getBoundingClientRect();
                if (clientX < r.left + r.width / 2) {
                    const j = nonMembers.indexOf(id);
                    if (j >= 0) { slot = j; break; }
                }
            }
            // Never before the library tab, never before a pinned tab, never
            // inside another group's run.
            slot = Math.max(this._wvTabGroupMinSlot(win, nonMembers), slot);
            slot = this._wvTabGroupSlotSnap(win, nonMembers, slot);
            const desired = [
                ...nonMembers.slice(0, slot), ...memberIDs, ...nonMembers.slice(slot),
            ];
            // Settle each id at its exact index, left to right.
            for (let i = 0; i < desired.length; i++) {
                const cur = Z_Tabs._tabs.findIndex((t: any) => t && t.id === desired[i]);
                if (cur >= 0 && cur !== i) {
                    try { Z_Tabs.move(desired[i], i); } catch (e) {}
                }
            }
            this._wvTabGroupApplyEverywhere();
            return slot;
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupMoveGroupTo err: " + e); return -1; }
    }

    /** The minimum allowed insertion slot for a group within `nonMembers`:
     *  after the library tab AND after every pinned tab — groups can't sit
     *  before pinned tabs (Firefox rule; pins cluster at the left edge). */
    _wvTabGroupMinSlot(win: any, nonMembers: string[]) {
        let min = 1;
        try {
            const Z_Tabs: any = win.Zotero_Tabs;
            for (let j = 1; j < nonMembers.length; j++) {
                const t = Z_Tabs._tabs.find((x: any) => x && x.id === nonMembers[j]);
                const k = t && (this as any)._tabPinKey(t);
                if (k && (this as any)._pinnedTabsHas(k.libraryID, k.itemKey)) min = j + 1;
            }
        } catch (e) {}
        return min;
    }

    /** Snap an insertion slot OUT of any other group's interior — a group
     *  (or its drop ghost) must never land between another group's members.
     *  `nonMembers` are tab ids; a slot strictly inside another group's run
     *  is pushed forward to the end of that run. */
    _wvTabGroupSlotSnap(win: any, nonMembers: string[], slot: number) {
        try {
            const Z_Tabs: any = win.Zotero_Tabs;
            const groupOf = (id: string) => {
                const t = Z_Tabs._tabs.find((x: any) => x && x.id === id);
                const k = t && (this as any)._tabPinKey(t);
                const g = k && this._tabGroupOfKey(k.libraryID, k.itemKey);
                return g ? g.id : null;
            };
            if (slot <= 0 || slot >= nonMembers.length) return slot;
            const before = groupOf(nonMembers[slot - 1]);
            const after = groupOf(nonMembers[slot]);
            if (before && before === after) {
                // Inside another group's run → push to the end of that run.
                let s = slot;
                while (s < nonMembers.length && groupOf(nonMembers[s]) === before) s++;
                return s;
            }
            return slot;
        } catch (e) { return slot; }
    }

    /** Re-cluster any group whose open members are no longer contiguous (tab
     *  drags can split a group around a collapsed block). One-shot, called
     *  after membership-changing operations — NOT from the observer (forced
     *  positions there would fight user drags). */
    _wvTabGroupStabilize(win: any) {
        try {
            const Z_Tabs: any = win.Zotero_Tabs;
            if (!Z_Tabs || !Z_Tabs._tabs || typeof Z_Tabs.move !== "function") return;
            const groups = this._tabGroupsGet();
            if (!groups.length) return;
            const keyOf = (t: any) => {
                const k = (this as any)._tabPinKey(t);
                return k ? (k.libraryID + ":" + k.itemKey) : null;
            };
            const groupAt = (t: any) => {
                const k = (this as any)._tabPinKey(t);
                const g = k && this._tabGroupOfKey(k.libraryID, k.itemKey);
                return g ? g.id : null;
            };
            // Detect non-contiguity: a group id that re-appears after a
            // different id interrupted its run.
            const seenClosed = new Set<string>();
            let lastGid: string | null = null, broken = false;
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const gid = groupAt(Z_Tabs._tabs[i]);
                if (gid !== lastGid) {
                    if (lastGid) seenClosed.add(lastGid);
                    if (gid && seenClosed.has(gid)) { broken = true; break; }
                    lastGid = gid;
                }
            }
            if (!broken) return;
            this._wvTGDbg("stabilize: regrouping non-contiguous members");
            // Rebuild the full order: walk tabs; when a group's FIRST member is
            // hit, emit ALL its members in display order; skip later strays.
            const emitted = new Set<string>();
            const desired: string[] = [];
            const membersOf = (gid: string) => {
                const g = groups.find((x: any) => x.id === gid);
                const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
                const out: string[] = [];
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    const k = keyOf(t);
                    if (k && ks.has(k)) out.push(t.id);
                }
                return out;
            };
            for (const t of Z_Tabs._tabs) {
                if (!t || emitted.has(t.id)) continue;
                const gid = groupAt(t);
                if (gid) { for (const id of membersOf(gid)) { if (!emitted.has(id)) { desired.push(id); emitted.add(id); } } }
                else { desired.push(t.id); emitted.add(t.id); }
            }
            for (let i = 0; i < desired.length; i++) {
                const cur = Z_Tabs._tabs.findIndex((t: any) => t && t.id === desired[i]);
                if (cur >= 0 && cur !== i) { try { Z_Tabs.move(desired[i], i); } catch (e) {} }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupStabilize err: " + e); }
    }

    /** Live preview during a chip drag: physically move the group under the
     *  pointer, like native tab dragging — but only when the computed slot
     *  actually changes, so dragover's event rate doesn't thrash React. */
    _wvTabGroupLiveMoveGroup(win: any, groupID: any, clientX: number) {
        try {
            const last = win._wvGroupDragSlot;
            // Cheap probe: recompute the slot the pointer is over without
            // moving anything, then bail when unchanged.
            const Z_Tabs: any = win.Zotero_Tabs;
            const doc = win.document;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!Z_Tabs || !g) return;
            const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            const memberSet = new Set<string>();
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                const k = (this as any)._tabPinKey(t);
                if (k && ks.has(k.libraryID + ":" + k.itemKey)) memberSet.add(t.id);
            }
            const nonMembers: string[] = Z_Tabs._tabs
                .map((t: any) => t && t.id)
                .filter((id: any) => id && !memberSet.has(id));
            let slot = nonMembers.length;
            for (const node of doc.querySelectorAll("#tab-bar-container .tab[data-id]")) {
                const id = node.getAttribute("data-id");
                if (memberSet.has(id)) continue;
                const r = node.getBoundingClientRect();
                if (clientX < r.left + r.width / 2) {
                    const j = nonMembers.indexOf(id);
                    if (j >= 0) { slot = j; break; }
                }
            }
            slot = Math.max(this._wvTabGroupMinSlot(win, nonMembers), slot);
            slot = this._wvTabGroupSlotSnap(win, nonMembers, slot);
            if (slot === last) return;
            win._wvGroupDragSlot = slot;
            this._wvTabGroupMoveGroupTo(win, groupID, clientX);
        } catch (e) {}
    }

    // ---- Reader-window groups -------------------------------------------------

    /** Item key for a reader-window deck tab. */
    _wvTabGroupDeckKey(tab: any) {
        try {
            if (!tab || tab.itemID == null) return null;
            const it: any = Zotero.Items.get(tab.itemID);
            return it ? { libraryID: it.libraryID, itemKey: it.key } : null;
        } catch (e) { return null; }
    }

    _wvTabGroupIsReaderWin(win: any) {
        try { return win.document.documentElement.getAttribute("windowtype") === "zotero:reader"; } catch (e) { return false; }
    }

    /** Group pass for a READER window's strip — called at the end of
     *  _wvWTRenderStrip (Weavero owns that renderer, so chips are rebuilt on
     *  every render; no observer needed). Same visuals as the main window:
     *  chip before the first member, colored underline, collapse hides
     *  members except the active tab. */
    _applyTabGroupsReader(win: any) {
        try {
            const doc = win.document;
            const tabsBox = doc.querySelector(".wv-window-tabstrip .wv-window-tabs");
            const st = win._wvWT;
            if (!tabsBox || !st) return;
            for (const c of tabsBox.querySelectorAll(":scope > .wv-tab-group-chip")) c.remove();
            const stripClasses = () => {
                for (const el of tabsBox.querySelectorAll(".wv-window-tab.wv-grouped-tab")) {
                    el.classList.remove("wv-grouped-tab", "wv-group-hidden", "wv-group-first");
                    el.removeAttribute("data-wv-group");
                    el.style.removeProperty("--wv-group-color");
                }
            };
            if (!this._getEnableTabGroups()) { stripClasses(); return; }
            this._ensureTabGroupStyles(doc);
            // Multi-select: wire (container persists across renders) + re-sync
            // the highlight classes (tab elements are rebuilt every render).
            // BEFORE the zero-groups return — selection must work to CREATE
            // the first group.
            try { this._wvWireTabMultiSelReader(win); } catch (e) {}
            try { this._wvWTMultiSelSync(win); } catch (e) {}
            this._wvWireTabGroupReaderDnD(win);
            const groups = this._tabGroupsGet();
            stripClasses();
            if (!groups.length) return;
            const elById = new Map<string, any>();
            for (const el of tabsBox.querySelectorAll(":scope > .wv-window-tab")) {
                elById.set(el.getAttribute("data-wv-tab-id"), el);
            }
            for (const g of groups) {
                const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
                const members: any[] = [];
                for (const tab of st.tabs) {
                    const k = this._wvTabGroupDeckKey(tab);
                    if (k && ks.has(k.libraryID + ":" + k.itemKey)) members.push(tab);
                }
                if (!members.length) continue;
                const hex = this._tabGroupColorHex(g.color);
                for (let i = 0; i < members.length; i++) {
                    const el = elById.get(String(members[i].id));
                    if (!el) continue;
                    el.classList.add("wv-grouped-tab");
                    if (i === 0) el.classList.add("wv-group-first");
                    el.style.setProperty("--wv-group-color", hex);
                    el.setAttribute("data-wv-group", g.id);
                    if (g.collapsed && members[i].id !== st.activeId) el.classList.add("wv-group-hidden");
                }
                const firstEl = elById.get(String(members[0].id));
                if (firstEl) {
                    // Chips are rebuilt each render, so always create fresh
                    // (handlers come from the live instance via live()).
                    const chip = this._wvTabGroupChipCreate(win, g.id);
                    this._wvTabGroupChipSync(win, chip, g, members.length);
                    tabsBox.insertBefore(chip, firstEl);
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _applyTabGroupsReader err: " + e); }
    }

    /** Reader-strip membership pass after a same-strip reorder drop: join the
     *  group whose deck-span the tab landed in, or leave its own. Mirrors
     *  _wvTabGroupHandleNativeDragEnd over `st.tabs`. */
    _wvTabGroupHandleReaderReorder(win: any, tabId: any, clientX: any) {
        try {
            if (!this._getEnableTabGroups()) return;
            const st = win._wvWT;
            if (!st || !st.tabs) return;
            const tab = st.tabs.find((t: any) => t.id === tabId);
            if (!tab) return;
            const key = this._wvTabGroupDeckKey(tab);
            if (!key) return;
            const groups = this._tabGroupsGet();
            if (!groups.length) return;
            // Same GEOMETRIC rule as the main window: join the group whose
            // pixel region (chip left → last member right) the drop x is over,
            // using the drag-time snapshot when available.
            const snapshot = win._wvTabGroupRegionsReader || null;
            win._wvTabGroupRegionsReader = null;
            const regionOf = (g: any) => {
                if (snapshot && snapshot[g.id]) return snapshot[g.id];
                const live = this._wvTabGroupMeasureRegions(win, true, tabId);
                return live[g.id] || null;
            };
            if (typeof clientX !== "number") return;
            const curGroup = this._tabGroupOfKey(key.libraryID, key.itemKey);
            this._wvTGDbg("reader membership: tab=" + tabId + " x=" + clientX);
            for (const g of groups) {
                if (curGroup && g.id === curGroup.id) continue;
                const reg = regionOf(g);
                if (!reg || clientX < reg.left || clientX > reg.right) continue;
                this._wvTGDbg("reader membership: JOIN '" + (g.name || g.id) + "'");
                this._tabGroupAddKey(g.id, key);
                this._wvTabGroupApplyEverywhere();
                return;
            }
            if (curGroup) {
                const reg = regionOf(curGroup);
                if (!reg) { this._wvTabGroupApplyEverywhere(); return; }
                const out = clientX < reg.left || clientX > reg.right;
                this._wvTGDbg("reader membership: own region=" + JSON.stringify(reg) + " out=" + out);
                if (out) this._tabGroupRemoveKey(key.libraryID, key.itemKey);
                this._wvTabGroupApplyEverywhere();
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupHandleReaderReorder err: " + e); }
    }

    /** Reader-window strip accepts group-chip drops (versioned, reload-proof —
     *  same delegate pattern as the main wiring). */
    _wvWireTabGroupReaderDnD(win: any) {
        try {
            const WIRE_VERSION = 2;
            const strip = win.document.querySelector(".wv-window-tabstrip");
            if (!strip) return;
            if ((strip as any)._wvTabGroupDnDVer === WIRE_VERSION) return;
            try { (strip as any)._wvTabGroupDnDOff?.(); } catch (e) {}
            const live = () => {
                try { return (Zotero as any).Weavero && (Zotero as any).Weavero.plugin; } catch (e) { return null; }
            };
            const mk = (method: string) => (e: any) => {
                try { const p: any = live(); if (p && p[method]) p[method](win, e); } catch (er) {}
            };
            const hs: Array<[string, any]> = [
                ["dragover", mk("_wvTabGroupReaderDnDDragOver")],
                ["dragleave", mk("_wvTabGroupReaderDnDDragLeave")],
                ["drop", mk("_wvTabGroupReaderDnDDrop")],
            ];
            for (const [t, h] of hs) strip.addEventListener(t, h, true);
            (strip as any)._wvTabGroupDnDVer = WIRE_VERSION;
            (strip as any)._wvTabGroupDnDOff = () => {
                try { for (const [t, h] of hs) strip.removeEventListener(t, h, true); } catch (e) {}
                (strip as any)._wvTabGroupDnDVer = 0;
            };
        } catch (e) {}
    }

    _wvTabGroupReaderDnDDragOver(win: any, e: any) {
        try {
            win._wvTabDragLastX = e.clientX;
            // Keep a drag-time region snapshot for the reorder membership pass.
            win._wvTabGroupRegionsReader = this._wvTabGroupMeasureRegions(win, true, null);
            const gd = (this as any)._wvGroupDrag;
            if (!gd) return;
            e.preventDefault(); e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            if (gd.sourceWin !== win) {
                // Cross-window: preview the landing slot with a ghost chip.
                this._wvTabGroupShowDropGhost(win, gd.groupID, e.clientX, true);
            }
        } catch (er) {}
    }

    _wvTabGroupReaderDnDDragLeave(win: any, e: any) {
        try {
            // Coordinate-based (see _wvTabGroupDnDDragLeave): child-boundary
            // dragleaves carry null relatedTarget and would churn the ghost.
            const strip = win.document.querySelector(".wv-window-tabstrip");
            if (strip) {
                const r = strip.getBoundingClientRect();
                if (e.clientX > r.left && e.clientX < r.right
                        && e.clientY > r.top && e.clientY < r.bottom) return;
            }
            this._wvTabGroupHideDropGhost(win);
        } catch (er) {}
    }

    _wvTabGroupReaderDnDDrop(win: any, e: any) {
        try {
            const gd = (this as any)._wvGroupDrag;
            if (!gd) return;
            e.preventDefault(); e.stopPropagation();
            (this as any)._wvGroupDrag = null;
            this._wvTabGroupHideAllDropGhosts();
            if (gd.sourceWin === win) return;                     // own strip → no-op
            this._wvTGDbg("group drop on READER window from " + (this._wvTabGroupIsReaderWin(gd.sourceWin) ? "reader" : "main"));
            this._wvTabGroupMigrateGroup(gd.sourceWin, win, gd.groupID, e.clientX);
        } catch (er) {}
    }

    // ---- Cross-window drop ghost --------------------------------------------------

    /** Show a ghost chip (the group's name/color at half opacity) at the slot
     *  a cross-window group drop would land in — tabs shift aside, so the
     *  target is visible BEFORE release. Inserted inline like a real chip;
     *  slot-gated to avoid churn. `isReader` picks the container/tab selector. */
    _wvTabGroupShowDropGhost(win: any, groupID: any, clientX: number, isReader: boolean) {
        try {
            const doc = win.document;
            const box = isReader
                ? doc.querySelector(".wv-window-tabstrip .wv-window-tabs")
                : doc.querySelector("#tab-bar-container .tabs-wrapper .tabs");
            if (!box) return;
            const tabSel = isReader ? ".wv-window-tab" : ".tab[data-id]";
            // Insertion node: first REAL tab whose midpoint is right of the pointer.
            let anchor: any = null, slot = -1, i = 0;
            for (const node of box.querySelectorAll(":scope > " + tabSel)) {
                const r = node.getBoundingClientRect();
                i++;
                if (clientX < r.left + r.width / 2) { anchor = node; slot = i; break; }
            }
            if (win._wvTGGhostSlot === slot && doc.getElementById("wv-tg-drop-ghost")) return;
            win._wvTGGhostSlot = slot;
            let ghost = doc.getElementById("wv-tg-drop-ghost");
            if (!ghost) {
                // Full final-state preview: the chip PLUS one skeleton tab per
                // migrating member (open members of the SOURCE window), so the
                // target strip shifts exactly as it will after the drop. The
                // wrapper is display:contents — its children flow as flex items.
                const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
                const hex = this._tabGroupColorHex(g && g.color);
                ghost = doc.createElementNS(HTML_NS, "div");
                ghost.id = "wv-tg-drop-ghost";
                ghost.style.display = "contents";
                const chip = doc.createElementNS(HTML_NS, "div");
                chip.className = "wv-tab-group-chip";
                chip.style.opacity = "0.8";
                chip.style.pointerEvents = "none";
                chip.style.setProperty("--wv-group-color", hex);
                const label = doc.createElementNS(HTML_NS, "span");
                label.className = "wv-tgchip-label";
                label.textContent = (g && g.name) || "Group";
                chip.appendChild(label);
                ghost.appendChild(chip);
                // Member titles (the tabs that would migrate, in source order).
                try {
                    const gd = (this as any)._wvGroupDrag;
                    const src = gd && gd.sourceWin;
                    const titles: string[] = [];
                    if (src && this._wvTabGroupIsReaderWin(src) && src._wvWT) {
                        const ks = new Set(((g && g.members) || []).map((m: any) => m.libraryID + ":" + m.itemKey));
                        for (const t of src._wvWT.tabs) {
                            const k = this._wvTabGroupDeckKey(t);
                            if (k && ks.has(k.libraryID + ":" + k.itemKey)) {
                                titles.push((this as any)._wvWTTabTitle(t) || "");
                            }
                        }
                    } else if (src && src.Zotero_Tabs) {
                        const ks = new Set(((g && g.members) || []).map((m: any) => m.libraryID + ":" + m.itemKey));
                        for (const t of src.Zotero_Tabs._tabs) {
                            const k = (this as any)._tabPinKey(t);
                            if (k && ks.has(k.libraryID + ":" + k.itemKey)) titles.push(t.title || "");
                        }
                    }
                    if (g && g.collapsed) {
                        // A COLLAPSED group arrives collapsed — preview just the
                        // chip with its tab count, no skeleton tabs.
                        const count = doc.createElementNS(HTML_NS, "span");
                        count.className = "wv-tgchip-count";
                        count.textContent = String(titles.length);
                        chip.appendChild(count);
                    } else {
                        for (const title of titles) {
                            const gt = doc.createElementNS(HTML_NS, "div");
                            gt.className = "wv-tg-ghost-tab";
                            gt.style.setProperty("--wv-group-color", hex);
                            gt.textContent = title;
                            ghost.appendChild(gt);
                        }
                    }
                } catch (e) {}
            }
            if (anchor) box.insertBefore(ghost, anchor);
            else box.appendChild(ghost);
        } catch (e) {}
    }

    _wvTabGroupHideDropGhost(win: any) {
        try {
            win._wvTGGhostSlot = null;
            const g = win.document.getElementById("wv-tg-drop-ghost");
            if (g) g.remove();
        } catch (e) {}
    }

    _wvTabGroupHideAllDropGhosts() {
        try { for (const w of Zotero.getMainWindows()) this._wvTabGroupHideDropGhost(w); } catch (e) {}
        try {
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) this._wvTabGroupHideDropGhost(en.getNext());
        } catch (e) {}
    }

    // ---- Cross-window group migration -------------------------------------------

    /** Move ALL of a group's open tabs from one window to another (any combo
     *  of main/reader windows). Membership is item-keyed, so the group simply
     *  re-renders in the target once its tabs live there. Close-then-reopen
     *  per tab — the same semantics as the existing single-tab cross-window
     *  drags (reader state saved on close, restored on open). */
    async _wvTabGroupMigrateGroup(srcWin: any, tgtWin: any, groupID: any, clientX: any) {
        try {
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g || !srcWin || !tgtWin || srcWin === tgtWin) return;
            const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            const srcIsReader = this._wvTabGroupIsReaderWin(srcWin);
            const tgtIsReader = this._wvTabGroupIsReaderWin(tgtWin);
            // Collect open members in SOURCE display order.
            const entries: Array<{ itemID: number; isNote: boolean; srcTabID: any }> = [];
            if (srcIsReader) {
                const st = srcWin._wvWT;
                for (const t of (st && st.tabs) || []) {
                    const k = this._wvTabGroupDeckKey(t);
                    if (k && ks.has(k.libraryID + ":" + k.itemKey)) {
                        entries.push({ itemID: t.itemID, isNote: t.type === "note", srcTabID: t.id });
                    }
                }
            } else {
                const Z: any = srcWin.Zotero_Tabs;
                for (let i = 1; i < ((Z && Z._tabs) || []).length; i++) {
                    const t = Z._tabs[i];
                    const k = (this as any)._tabPinKey(t);
                    if (k && ks.has(k.libraryID + ":" + k.itemKey)) {
                        entries.push({ itemID: t.data && t.data.itemID, isNote: t.type === "note", srcTabID: t.id });
                    }
                }
            }
            if (!entries.length) return;
            this._wvTGDbg("migrate " + entries.length + " tab(s) " + (srcIsReader ? "reader" : "main")
                + "→" + (tgtIsReader ? "reader" : "main"));
            // Close all in the source first (saves reader/note state; the
            // existing single-tab flows do the same close-then-open dance).
            for (const en2 of entries) {
                try {
                    if (srcIsReader) this._wvWTCloseTab(srcWin, en2.srcTabID);
                    else srcWin.Zotero_Tabs.close(en2.srcTabID);
                } catch (e) {}
            }
            // Deferred reopen in the target, in order.
            const setT = (tgtWin.setTimeout ? tgtWin.setTimeout.bind(tgtWin) : setTimeout);
            setT(async () => {
                try {
                    if (tgtIsReader) {
                        // Drop slot from the pointer, computed against the
                        // PRE-mount deck (mounts append at the end, so the
                        // pre-existing indices stay valid).
                        let insertIdx = (tgtWin._wvWT && tgtWin._wvWT.tabs.length) || 0;
                        try {
                            if (typeof clientX === "number" && tgtWin._wvWT) {
                                const els = tgtWin.document.querySelectorAll(
                                    ".wv-window-tabstrip .wv-window-tabs .wv-window-tab");
                                for (const el of els) {
                                    const r = el.getBoundingClientRect();
                                    if (!r.width) continue;
                                    if (clientX < r.left + r.width / 2) {
                                        const tid = el.getAttribute("data-wv-tab-id");
                                        const idx = tgtWin._wvWT.tabs.findIndex(
                                            (t: any) => String(t.id) === String(tid));
                                        if (idx >= 0) insertIdx = idx;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {}
                        this._wvTGDbg("reader-migrate slot: clientX=" + clientX + " insertIdx=" + insertIdx
                            + " deck=" + ((tgtWin._wvWT && tgtWin._wvWT.tabs.length) || 0));
                        // Place each tab at its slot AS IT MOUNTS (mounts
                        // append at the end; without this the group visibly
                        // stacks at the end for seconds before snapping to
                        // the drop position).
                        let placed = 0;
                        for (const en2 of entries) {
                            try {
                                // NOT awaited: the mount's SYNCHRONOUS prefix
                                // already registers the tab in st.tabs (the
                                // cross-window single-tab drop relies on the
                                // same fact) — awaiting the full document
                                // load left the tab rendered at the END for
                                // seconds. Reposition immediately; content
                                // loads in place.
                                this._wvWTMountTab(tgtWin, en2.itemID, { allowDuplicate: false, select: false });
                                const st2 = tgtWin._wvWT;
                                if (st2 && st2.tabs) {
                                    for (let i = st2.tabs.length - 1; i >= 0; i--) {
                                        const t = st2.tabs[i];
                                        if (t.itemID === en2.itemID && i > insertIdx + placed) {
                                            const [m] = st2.tabs.splice(i, 1);
                                            st2.tabs.splice(Math.min(insertIdx + placed, st2.tabs.length), 0, m);
                                            break;
                                        }
                                    }
                                    placed++;
                                    try { this._wvWTRenderStrip(tgtWin); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                        this._wvTGDbg("reader-migrate placed " + placed + " at " + insertIdx + " (incremental)");
                        try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
                    } else {
                        try { tgtWin.focus(); } catch (e) {}      // Reader.open targets the focused main window
                        for (const en2 of entries) {
                            try {
                                // openInBackground: arriving tabs must NOT grab the
                                // selection — otherwise the last member becomes the
                                // selected tab and a COLLAPSED group arrives looking
                                // expanded (the selected member stays visible).
                                // (ZoteroPane.openNote drops openInBackground — go
                                // through Zotero.Notes.open directly.)
                                if (en2.isNote) (Zotero as any).Notes.open(en2.itemID, undefined, { openInWindow: false, openInBackground: true });
                                else (Zotero.Reader as any).open(en2.itemID, null, { openInWindow: false, allowDuplicate: false, openInBackground: true });
                            } catch (e) {}
                            await new Promise(r => setT(r, 120));
                        }
                        // Position the arrived block at the drop slot once all
                        // tabs exist (poll briefly), then let apply re-chip.
                        const Z: any = tgtWin.Zotero_Tabs;
                        const t0 = Date.now();
                        const allPresent = () => entries.every(en3 =>
                            Z._tabs.some((t: any) => t && t.data && t.data.itemID === en3.itemID));
                        while (!allPresent() && Date.now() - t0 < 4000) {
                            await new Promise(r => setT(r, 120));
                        }
                        if (typeof clientX === "number") {
                            try { this._wvTabGroupMoveGroupTo(tgtWin, groupID, clientX); } catch (e) {}
                        }
                    }
                    this._wvTabGroupApplyEverywhere();
                } catch (e) { Zotero.debug("[Weavero] migrate reopen err: " + e); }
            }, 180);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupMigrateGroup err: " + e); }
    }

    // ---- Save & Close / Reopen / Move to New Window ---------------------------
    // Firefox's "Save and close group": close the group's tabs but KEEP the
    // group (item-keyed members persist in the pref store); reopen later from
    // the tabs menu. "Delete group" (the old Close Group) closes AND forgets.

    /** Open member-tab count across all main + reader windows. */
    _wvTabGroupOpenCount(groupID: any) {
        try {
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return 0;
            const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            let n = 0;
            try {
                for (const w of Zotero.getMainWindows()) {
                    const Z: any = (w as any).Zotero_Tabs;
                    for (const t of (Z && Z._tabs) || []) {
                        const k = (this as any)._tabPinKey(t);
                        if (k && ks.has(k.libraryID + ":" + k.itemKey)) n++;
                    }
                }
            } catch (e) {}
            try {
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) {
                    const w: any = en.getNext();
                    if (!w || !w._wvWT) continue;
                    for (const t of w._wvWT.tabs || []) {
                        const k = this._wvTabGroupDeckKey(t);
                        if (k && ks.has(k.libraryID + ":" + k.itemKey)) n++;
                    }
                }
            } catch (e) {}
            return n;
        } catch (e) { return 0; }
    }

    /** Close the group's tabs EVERYWHERE but keep the group for reopening. */
    _wvTabGroupSaveAndClose(win: any, groupID: any) {
        try {
            const groups = this._tabGroupsGet();
            const g = groups.find((x: any) => x.id === groupID);
            if (!g) return;
            const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            for (const w of Zotero.getMainWindows()) {
                try {
                    const Z: any = (w as any).Zotero_Tabs;
                    const ids: string[] = [];
                    for (let i = 1; i < ((Z && Z._tabs) || []).length; i++) {
                        const t = Z._tabs[i];
                        const k = (this as any)._tabPinKey(t);
                        if (k && ks.has(k.libraryID + ":" + k.itemKey)) ids.push(t.id);
                    }
                    for (const id of ids) { try { Z.close(id); } catch (e) {} }
                } catch (e) {}
            }
            try {
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) {
                    const w: any = en.getNext();
                    if (!w || !w._wvWT) continue;
                    const ids = (w._wvWT.tabs || [])
                        .filter((t: any) => { const k = this._wvTabGroupDeckKey(t); return k && ks.has(k.libraryID + ":" + k.itemKey); })
                        .map((t: any) => t.id);
                    for (const id of ids) { try { (this as any)._wvWTCloseTab(w, id); } catch (e) {} }
                }
            } catch (e) {}
            (g as any).saved = true;
            this._tabGroupsSet(groups);
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupSaveAndClose err: " + e); }
    }

    /** Reopen a saved/dormant group's tabs in `targetWin` (background-opened,
     *  staggered, then clustered). Mirrors the migrate flow's reopen branch. */
    async _wvTabGroupReopen(targetWin: any, groupID: any) {
        try {
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const members = (g && g.members) || [];
            if (!members.length) return;
            try { targetWin.focus(); } catch (e) {}   // Reader.open targets the focused main window
            const setT = (targetWin.setTimeout ? targetWin.setTimeout.bind(targetWin) : setTimeout);
            const Z: any = targetWin.Zotero_Tabs;
            const wanted: number[] = [];
            for (const m of members) {
                try {
                    const it: any = Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey);
                    if (!it) continue;                 // item deleted since saving
                    const already = Z && Z._tabs.some((t: any) => {
                        const k = (this as any)._tabPinKey(t);
                        return k && k.libraryID === m.libraryID && k.itemKey === m.itemKey;
                    });
                    if (already) continue;
                    if (typeof it.isNote === "function" && it.isNote()) {
                        (Zotero as any).Notes.open(it.id, undefined, { openInWindow: false, openInBackground: true });
                    } else if (it.attachmentReaderType) {
                        (Zotero.Reader as any).open(it.id, null, { openInWindow: false, allowDuplicate: false, openInBackground: true });
                    } else {
                        continue;
                    }
                    wanted.push(it.id);
                } catch (e) {}
                await new Promise(r => setT(r, 120));
            }
            // Wait for the tabs to exist, then cluster + re-chip.
            const t0 = Date.now();
            const allPresent = () => wanted.every(id =>
                Z && Z._tabs.some((t: any) => t && t.data && t.data.itemID === id));
            while (!allPresent() && Date.now() - t0 < 5000) {
                await new Promise(r => setT(r, 150));
            }
            const groups = this._tabGroupsGet();
            const g2 = groups.find((x: any) => x.id === groupID);
            if (g2 && (g2 as any).saved) { delete (g2 as any).saved; this._tabGroupsSet(groups); }
            try { this._wvTabGroupStabilize(targetWin); } catch (e) {}
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupReopen err: " + e); }
    }

    /** Reopen a saved/dormant group's tabs into a READER window's deck
     *  (the reader twin of _wvTabGroupReopen — mounts sequentially, then
     *  re-renders the strip). */
    async _wvTabGroupReopenInReader(win: any, groupID: any) {
        try {
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const members = (g && g.members) || [];
            if (!members.length || !win._wvWT) return;
            for (const m of members) {
                try {
                    const it: any = Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey);
                    if (!it) continue;
                    const already = (win._wvWT.tabs || []).some((t: any) => {
                        const k = this._wvTabGroupDeckKey(t);
                        return k && k.libraryID === m.libraryID && k.itemKey === m.itemKey;
                    });
                    if (already) continue;
                    await (this as any)._wvWTMountTab(win, it.id, { allowDuplicate: false, select: false, await: true });
                } catch (e) {}
            }
            const groups = this._tabGroupsGet();
            const g2 = groups.find((x: any) => x.id === groupID);
            if (g2 && (g2 as any).saved) { delete (g2 as any).saved; this._tabGroupsSet(groups); }
            try { (this as any)._wvWTRenderStrip(win); } catch (e) {}
            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
            this._wvTabGroupApplyEverywhere();
            try { win.focus(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupReopenInReader err: " + e); }
    }

    /** Bring the group's home window to front and select its first open tab. */
    _wvTabGroupFocus(groupID: any) {
        try {
            const home = this._wvTabGroupHomeWin(groupID);
            if (!home) return false;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const ks = new Set(((g && g.members) || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            if (this._wvTabGroupIsReaderWin(home)) {
                const t = (home._wvWT.tabs || []).find((x: any) => {
                    const k = this._wvTabGroupDeckKey(x);
                    return k && ks.has(k.libraryID + ":" + k.itemKey);
                });
                if (t) { try { (this as any)._wvWTSwitch(home, t.id); } catch (e) {} }
            } else {
                const Z: any = home.Zotero_Tabs;
                const t = (Z && Z._tabs || []).find((x: any) => {
                    const k = (this as any)._tabPinKey(x);
                    return k && ks.has(k.libraryID + ":" + k.itemKey);
                });
                if (t) { try { Z.select(t.id); } catch (e) {} }
            }
            try { home.focus(); } catch (e) {}
            return true;
        } catch (e) { return false; }
    }

    /** Firefox's "Move group to new window": open a fresh main window and
     *  migrate the whole group there once its tab bar is ready. */
    _wvTabGroupMoveToNewWindow(win: any, groupID: any) {
        try {
            const home = this._wvTabGroupHomeWin(groupID) || win;
            const before = new Set(Zotero.getMainWindows());
            (Zotero as any).openMainWindow();
            const t0 = Date.now();
            const poll = () => {
                try {
                    const fresh: any = Zotero.getMainWindows().find(
                        (w: any) => !before.has(w) && w.Zotero_Tabs && w.document
                            && w.document.readyState === "complete");
                    if (fresh) {
                        // Small grace so the React tab bar finishes mounting.
                        // Saved groups (no open tabs) REOPEN into the new
                        // window; open groups MIGRATE there.
                        fresh.setTimeout(() => {
                            try {
                                if (this._wvTabGroupOpenCount(groupID) > 0) {
                                    this._wvTabGroupMigrateGroup(home, fresh, groupID, 1e6);
                                } else {
                                    this._wvTabGroupReopen(fresh, groupID);
                                }
                            } catch (e) {}
                        }, 600);
                        return;
                    }
                    if (Date.now() - t0 < 10000) win.setTimeout(poll, 250);
                } catch (e) {}
            };
            win.setTimeout(poll, 400);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupMoveToNewWindow err: " + e); }
    }

    /** Open the group in `win`: reopen if saved, focus if already here,
     *  migrate here if it lives in another window. */
    _wvTabGroupOpenInWindow(win: any, groupID: any) {
        try {
            if (this._wvTabGroupOpenCount(groupID) === 0) {
                if (this._wvTabGroupIsReaderWin(win)) this._wvTabGroupReopenInReader(win, groupID);
                else this._wvTabGroupReopen(win, groupID);
                return;
            }
            const home = this._wvTabGroupHomeWin(groupID);
            if (home === win) { this._wvTabGroupFocus(groupID); return; }
            this._wvTabGroupMigrateGroup(home, win, groupID, 1e6);
            try { win.focus(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupOpenInWindow err: " + e); }
    }

    /** Right-click menu on a tabs-menu group row (Firefox: Open Group in
     *  This Window / Open Group in New Window / Delete Group). */
    _wvTabsMenuGroupContext(win: any, panel: any, groupID: any, e: any) {
        try {
            const doc = win.document;
            let pop: any = doc.getElementById("wv-tgmenu-context");
            if (pop) pop.remove();                      // rebuild fresh each time
            pop = doc.createXULElement("menupopup");
            pop.id = "wv-tgmenu-context";
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
            mk("Open Group in This Window", (p: any) => p._wvTabGroupOpenInWindow(win, groupID));
            mk("Open Group in New Window", (p: any) => p._wvTabGroupMoveToNewWindow(win, groupID));
            pop.appendChild(doc.createXULElement("menuseparator"));
            mk("Delete Group", (p: any) => p._wvTabGroupCloseTabs(win, groupID));
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(e.screenX, e.screenY, true);
        } catch (er) { Zotero.debug("[Weavero] _wvTabsMenuGroupContext err: " + er); }
    }

    /** Firefox-style nesting of the tabs-menu TAB ROWS: member tabs are
     *  clustered under an inline group header (color chip + name) and
     *  indented. Runs per library section so the library grouping is
     *  preserved. Re-built on every refreshList. */
    _wvTabsMenuNestGroupRows(panel: any) {
        try {
            const doc = panel.ownerDocument;
            const win = doc.defaultView;
            // Works on BOTH tabs menus: the main window's native panel and
            // the reader windows' Weavero-built clone (different list ids,
            // row attrs and tab models).
            const isReader = this._wvTabGroupIsReaderWin(win);
            const list = isReader
                ? panel.querySelector("#wv-wtl-list")
                : (panel._tabsList || panel.querySelector("#zotero-tabs-menu-list"));
            if (!list) return;
            const idAttr = isReader ? "data-wv-tab-id" : "data-tab-id";
            for (const h of list.querySelectorAll(".wv-tgrow-header")) h.remove();
            for (const r of list.querySelectorAll(".row.wv-tgrow-member")) r.classList.remove("wv-tgrow-member", "wv-tgrow-hidden");
            if (!this._getEnableTabGroups()) return;
            const groups = this._tabGroupsGet();
            if (!groups.length) return;
            const Z: any = win.Zotero_Tabs;
            if (!isReader && (!Z || !Z._tabs)) return;
            const groupOfRow = (row: any) => {
                const id = row.getAttribute(idAttr);
                if (isReader) {
                    const st = win._wvWT;
                    const t = st && st.tabs.find((x: any) => String(x.id) === String(id));
                    const k = t && this._wvTabGroupDeckKey(t);
                    return k ? this._tabGroupOfKey(k.libraryID, k.itemKey) : null;
                }
                const tab = Z._tabs.find((t: any) => t && t.id === id);
                const k = tab && (this as any)._tabPinKey(tab);
                return k ? this._tabGroupOfKey(k.libraryID, k.itemKey) : null;
            };
            // Contiguous runs of tab rows (library headers etc. break them).
            const sections: any[][] = [];
            let cur: any[] = [];
            for (const ch of [...list.children]) {
                if (ch.classList && ch.classList.contains("row") && ch.getAttribute && ch.getAttribute(idAttr)) {
                    cur.push(ch);
                } else if (cur.length) { sections.push(cur); cur = []; }
            }
            if (cur.length) sections.push(cur);
            // The LIST has its own expand/collapse state, independent of the
            // strip; a group starts out matching its strip state, then the
            // header's twisty toggles it list-only (per window).
            const collMap: Map<string, boolean> =
                (win._wvTGListCollapsed = win._wvTGListCollapsed || new Map());
            for (const rows of sections) {
                const byGroup = new Map<string, { g: any; members: any[] }>();
                for (const r of rows) {
                    const g = groupOfRow(r);
                    if (!g) continue;
                    if (!byGroup.has(g.id)) byGroup.set(g.id, { g, members: [] });
                    byGroup.get(g.id)!.members.push(r);
                }
                for (const { g, members } of byGroup.values()) {
                    if (!members.length) continue;
                    const gid = g.id;
                    const listCollapsed = collMap.has(gid) ? !!collMap.get(gid) : !!g.collapsed;
                    const header = doc.createElementNS(HTML_NS, "div");
                    header.className = "wv-tgrow-header";
                    // Chip first, left-aligned with the tab icons of
                    // ungrouped rows (header padding tuned to the measured
                    // icon offset); twisty sits at the far right.
                    const chip = doc.createElementNS(HTML_NS, "span");
                    chip.className = "wv-tgrow-chip";
                    chip.style.background = this._tabGroupColorHex(g.color);
                    header.appendChild(chip);
                    const name = doc.createElementNS(HTML_NS, "span");
                    name.textContent = g.name || "Unnamed group";
                    header.appendChild(name);
                    // Open-member count, like the library headers' counts.
                    const count = doc.createElementNS(HTML_NS, "span");
                    count.className = "wv-tgrow-count";
                    count.textContent = String(members.length);
                    header.appendChild(count);
                    const twisty = doc.createElementNS(HTML_NS, "span");
                    twisty.className = "wv-tgrow-twisty";
                    twisty.textContent = listCollapsed ? "▸" : "▾";
                    header.appendChild(twisty);
                    // Click toggles the LIST-side collapse only (the strip
                    // keeps its own state); the right-click menu carries the
                    // open/focus actions.
                    header.addEventListener("click", (e: any) => {
                        try {
                            e.stopPropagation();
                            const cur = collMap.has(gid) ? !!collMap.get(gid) : !!g.collapsed;
                            const next = !cur;
                            collMap.set(gid, next);
                            twisty.textContent = next ? "▸" : "▾";
                            for (const m of members) m.classList.toggle("wv-tgrow-hidden", next);
                        } catch (er) {}
                    });
                    header.addEventListener("contextmenu", (e: any) => {
                        try {
                            e.preventDefault(); e.stopPropagation();
                            const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (p) p._wvTabsMenuGroupContext(win, panel, gid, e);
                        } catch (er) {}
                    });
                    list.insertBefore(header, members[0]);
                    let anchor: any = header;
                    for (const m of members) {
                        m.classList.add("wv-tgrow-member");
                        if (listCollapsed) m.classList.add("wv-tgrow-hidden");
                        list.insertBefore(m, anchor.nextSibling);
                        anchor = m;
                    }
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabsMenuNestGroupRows err: " + e); }
    }

    /** "Tab Groups" section appended to Zotero's tabs-menu panel (the
     *  List-All-Tabs equivalent): one row per group with its color, name and
     *  open count. Click: focus the group if any tab is open, else reopen
     *  its saved tabs in this window. Re-built on every refreshList. */
    _wvTabsMenuGroupsSection(panel: any) {
        try {
            // Nest the tab rows themselves first (Firefox layout), then
            // append the groups summary section at the bottom.
            try { this._wvTabsMenuNestGroupRows(panel); } catch (e) {}
            const doc = panel.ownerDocument;
            const win = doc.defaultView;
            const isReaderPanel = this._wvTabGroupIsReaderWin(win);
            const list = isReaderPanel
                ? panel.querySelector("#wv-wtl-list")
                : (panel._tabsList || panel.querySelector("#zotero-tabs-menu-list"));
            if (!list) return;
            for (const el of list.querySelectorAll(".wv-tgmenu-header, .wv-tgmenu-row")) el.remove();
            if (!this._getEnableTabGroups()) return;
            const groups = this._tabGroupsGet();
            if (!groups.length) return;
            this._ensureTabGroupStyles(doc);
            const header = doc.createElementNS(HTML_NS, "div");
            header.className = "wv-tgmenu-header";
            header.textContent = "Tab Groups";
            list.appendChild(header);
            for (const g of groups) {
                const open = this._wvTabGroupOpenCount(g.id);
                const total = (g.members || []).length;
                const row = doc.createElementNS(HTML_NS, "div");
                row.className = "wv-tgmenu-row";
                row.setAttribute("title", open
                    ? "Go to this group"
                    : "Reopen this group's " + total + " tab" + (total === 1 ? "" : "s"));
                const hex = this._tabGroupColorHex(g.color);
                const dot = doc.createElementNS(HTML_NS, "span");
                dot.className = "wv-tgmenu-dot";
                if (open) {
                    dot.style.background = hex;          // open: filled square
                } else {
                    dot.style.background = "transparent"; // saved: outline only
                    dot.style.border = "2px solid " + hex;
                }
                row.appendChild(dot);
                const name = doc.createElementNS(HTML_NS, "span");
                name.className = "wv-tgmenu-name";
                name.textContent = g.name || "Unnamed group";
                row.appendChild(name);
                const count = doc.createElementNS(HTML_NS, "span");
                count.className = "wv-tgmenu-count";
                count.textContent = open ? (open + "/" + total + " open") : "saved";
                row.appendChild(count);
                const gid = g.id;
                row.addEventListener("click", (e: any) => {
                    try {
                        e.stopPropagation();
                        try { panel.hidePopup(); } catch (er) {}
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (!p) return;
                        if (p._wvTabGroupOpenCount(gid) > 0) p._wvTabGroupFocus(gid);
                        else if (p._wvTabGroupIsReaderWin(win)) p._wvTabGroupReopenInReader(win, gid);
                        else p._wvTabGroupReopen(win, gid);
                    } catch (er) {}
                });
                // Firefox-style right-click on a group row.
                row.addEventListener("contextmenu", (e: any) => {
                    try {
                        e.preventDefault(); e.stopPropagation();
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (p) p._wvTabsMenuGroupContext(win, panel, gid, e);
                    } catch (er) {}
                });
                list.appendChild(row);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabsMenuGroupsSection err: " + e); }
    }

    // ---- Panels (picker + editor) --------------------------------------------

    /** A reusable XUL panel with an HTML body div. One per window per id. */
    // ---- Hover preview (Firefox-style) ---------------------------------------
    // Hovering a COLLAPSED group's chip pops a list of its tabs after a short
    // delay; clicking an entry selects that tab. Expanded groups already show
    // their tabs in the strip, so no preview there.

    _wvTabGroupHoverEnter(win: any, groupID: any, chip: any) {
        try {
            if (!this._getEnableTabGroups()) return;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g || !g.collapsed) return;
            if ((this as any)._wvGroupDrag || win._wvTabGroupDragTabID != null) return;   // not mid-drag
            this._wvTabGroupHoverCancel(win);
            if (win._wvTGHoverHideTimer) { win.clearTimeout(win._wvTGHoverHideTimer); win._wvTGHoverHideTimer = null; }
            win._wvTGHoverTimer = win.setTimeout(() => {
                try { this._wvTabGroupShowHoverPreview(win, groupID, chip); } catch (e) {}
            }, 300);
        } catch (e) {}
    }

    _wvTabGroupHoverLeave(win: any) {
        try {
            this._wvTabGroupHoverCancel(win);
            // Grace period — moving onto the panel keeps it open.
            win._wvTGHoverHideTimer = win.setTimeout(() => {
                try { if (!win._wvTGHoverInPanel) this._wvTabGroupHideHoverPreview(win); } catch (e) {}
            }, 250);
        } catch (e) {}
    }

    _wvTabGroupHoverCancel(win: any) {
        try { if (win._wvTGHoverTimer) { win.clearTimeout(win._wvTGHoverTimer); win._wvTGHoverTimer = null; } } catch (e) {}
    }

    _wvTabGroupShowHoverPreview(win: any, groupID: any, chip: any) {
        try {
            const doc = win.document;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g || !g.collapsed) return;
            if (!chip || !chip.isConnected) return;
            const isReader = this._wvTabGroupIsReaderWin(win);
            const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            // The group's open tabs in THIS window, display order.
            const entries: Array<{ id: any; title: string; itemID?: any }> = [];
            if (isReader && win._wvWT) {
                for (const t of win._wvWT.tabs) {
                    const k = this._wvTabGroupDeckKey(t);
                    if (k && ks.has(k.libraryID + ":" + k.itemKey)) {
                        entries.push({ id: t.id, title: (this as any)._wvWTTabTitle(t) || "", itemID: t.itemID });
                    }
                }
            } else if (win.Zotero_Tabs) {
                for (const t of win.Zotero_Tabs._tabs) {
                    const k = (this as any)._tabPinKey(t);
                    if (k && ks.has(k.libraryID + ":" + k.itemKey)) {
                        entries.push({ id: t.id, title: t.title || "", itemID: t.data && t.data.itemID });
                    }
                }
            }
            if (!entries.length) return;
            const panel = this._wvTabGroupEnsurePanel(win, "wv-tab-group-preview");
            panel.setAttribute("noautofocus", "true");          // hover UI — never steal focus
            // noautohide: the preview's lifetime is governed entirely by our
            // hover enter/leave logic, and it must be able to appear ABOVE an
            // open editor panel without rolling it up (native-tab behavior:
            // the tooltip still shows over an open context menu).
            panel.setAttribute("noautohide", "true");
            // noautohide panels default to level="parent", which stacks them
            // BELOW regular popups — the re-hovered preview must appear ON
            // TOP of the open editor panel (native tooltip-over-menu order).
            panel.setAttribute("level", "top");
            if (!(panel as any)._wvHoverWired) {
                (panel as any)._wvHoverWired = true;
                panel.addEventListener("mouseenter", () => { win._wvTGHoverInPanel = true; });
                panel.addEventListener("mouseleave", () => {
                    win._wvTGHoverInPanel = false;
                    try {
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (p) p._wvTabGroupHideHoverPreview(win);
                    } catch (e) {}
                });
            }
            const body = panel.querySelector(".wv-tg-panel-body");
            while (body.firstChild) body.removeChild(body.firstChild);
            const hex = this._tabGroupColorHex(g.color);
            for (const en of entries) {
                const row = doc.createElementNS(HTML_NS, "div");
                row.className = "wv-tg-preview-row";
                // The tab's own file-type icon (same direct-img builder as
                // the relations popup, so it renders in reader windows too);
                // colored dot only as fallback.
                let iconEl: any = null;
                try {
                    const it: any = en.itemID != null ? Zotero.Items.get(en.itemID) : null;
                    if (it) {
                        // Link-mode-AWARE icon name (no skipLinkMode arg), so
                        // a linked attachment shows the same link-decorated
                        // glyph as its tab in the strip.
                        const iname = (typeof it.getItemTypeIconName === "function")
                            ? it.getItemTypeIconName() : "document";
                        iconEl = (this as any)._makeItemTypeIcon(doc, win, iname);
                        iconEl.classList.add("wv-tg-preview-icon");
                        // Group-library badge, mirroring the strip's tab-icon
                        // overlay (an <img> can't host ::after — wrap it).
                        try {
                            const lib: any = Zotero.Libraries.get(it.libraryID);
                            if (lib && lib.libraryType === "group"
                                    && (this as any)._getEnableGroupLibraryGlyph
                                    && (this as any)._getEnableGroupLibraryGlyph()) {
                                const wrap = doc.createElementNS(HTML_NS, "span");
                                wrap.className = "wv-tg-preview-iconwrap";
                                wrap.appendChild(iconEl);
                                iconEl = wrap;
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
                if (!iconEl) {
                    iconEl = doc.createElementNS(HTML_NS, "span");
                    iconEl.className = "wv-tg-preview-dot";
                    iconEl.style.background = hex;
                }
                row.appendChild(iconEl);
                const t = doc.createElementNS(HTML_NS, "span");
                t.className = "wv-tg-preview-title";
                t.textContent = en.title;
                row.appendChild(t);
                row.addEventListener("click", (ev: any) => {
                    try {
                        ev.stopPropagation();
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (!p) return;
                        if (isReader) p._wvWTSwitch(win, en.id);
                        else if (win.Zotero_Tabs) win.Zotero_Tabs.select(en.id);
                        p._wvTabGroupHideHoverPreview(win);
                    } catch (er) {}
                });
                body.appendChild(row);
            }
            panel.openPopup(chip, "after_start", 0, 4, false, false);
        } catch (e) {}
    }

    _wvTabGroupHideHoverPreview(win: any) {
        try {
            if (win._wvTGHoverHideTimer) { win.clearTimeout(win._wvTGHoverHideTimer); win._wvTGHoverHideTimer = null; }
            win._wvTGHoverInPanel = false;
            const panel = win.document.getElementById("wv-tab-group-preview");
            if (panel && typeof (panel as any).hidePopup === "function") (panel as any).hidePopup();
        } catch (e) {}
    }

    _wvTabGroupEnsurePanel(win: any, id: string) {
        const doc = win.document;
        let panel = doc.getElementById(id);
        if (panel) return panel;
        panel = doc.createXULElement("panel");
        panel.id = id;
        panel.setAttribute("type", "arrow");
        const body = doc.createElementNS(HTML_NS, "div");
        body.className = "wv-tg-panel-body";
        panel.appendChild(body);
        let popupset = doc.querySelector("popupset");
        if (!popupset) {
            popupset = doc.createXULElement("popupset");
            doc.documentElement.appendChild(popupset);
        }
        popupset.appendChild(panel);
        return panel;
    }

    _wvTabGroupSwatchRow(win: any, selected: string, onPick: (c: string) => void) {
        const doc = win.document;
        const row = doc.createElementNS(HTML_NS, "div");
        row.className = "wv-tg-swatches";
        for (const c of WV_GROUP_COLORS) {
            const sw = doc.createElementNS(HTML_NS, "div");
            sw.className = "wv-tg-swatch" + (c.id === selected ? " wv-selected" : "");
            sw.style.background = c.hex;
            sw.setAttribute("title", c.id);
            sw.addEventListener("click", () => {
                try {
                    for (const x of row.querySelectorAll(".wv-tg-swatch")) x.classList.remove("wv-selected");
                    sw.classList.add("wv-selected");
                    onPick(c.id);
                } catch (e) {}
            });
            row.appendChild(sw);
        }
        return row;
    }

    /** Chip right-click editor: rename / recolor / ungroup / close group. */
    _wvShowTabGroupEditor(win: any, groupID: any, anchorNode: any) {
        try {
            // Native-tab interaction protocol: opening the right-click window
            // DISMISSES the hover window (a fresh hover may re-show it on top
            // later; it hides again on mouse-out — see _wvTabGroupHoverLeave).
            try { this._wvTabGroupHoverCancel(win); this._wvTabGroupHideHoverPreview(win); } catch (e) {}
            const doc = win.document;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return;
            const panel = this._wvTabGroupEnsurePanel(win, "wv-tab-group-editor");
            const body = panel.querySelector(".wv-tg-panel-body");
            while (body.firstChild) body.removeChild(body.firstChild);

            // Firefox's "Manage tab group" panel layout: title, labeled name
            // field, color swatches, then menu-style action rows with the
            // destructive action set apart at the bottom.
            const title = doc.createElementNS(HTML_NS, "div");
            title.className = "wv-tg-title";
            title.textContent = "Manage Tab Group";
            body.appendChild(title);

            const nameLabel = doc.createElementNS(HTML_NS, "div");
            nameLabel.className = "wv-tg-label";
            nameLabel.textContent = "Name";
            body.appendChild(nameLabel);
            const nameRow = doc.createElementNS(HTML_NS, "div");
            nameRow.className = "wv-tg-row";
            const input = doc.createElementNS(HTML_NS, "input");
            input.className = "wv-tg-name-input";
            input.value = g.name || "";
            input.setAttribute("placeholder", "Group name");
            input.addEventListener("change", () => {
                this._tabGroupUpdate(groupID, { name: input.value });
                this._wvTabGroupApplyEverywhere();
            });
            input.addEventListener("keydown", (e: any) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this._tabGroupUpdate(groupID, { name: input.value });
                    try { panel.hidePopup(); } catch (er) {}
                    this._wvTabGroupApplyEverywhere();
                }
            });
            nameRow.appendChild(input);
            body.appendChild(nameRow);

            body.appendChild(this._wvTabGroupSwatchRow(win, g.color, (c: string) => {
                this._tabGroupUpdate(groupID, { color: c });
                this._wvTabGroupApplyEverywhere();
            }));

            const mkSep = () => {
                const s = doc.createElementNS(HTML_NS, "div");
                s.className = "wv-tg-sep";
                body.appendChild(s);
            };
            const mkItem = (label: string, fn: () => void, danger?: boolean) => {
                const row = doc.createElementNS(HTML_NS, "div");
                row.className = "wv-tg-menuitem" + (danger ? " wv-danger" : "");
                row.textContent = label;
                row.addEventListener("click", () => {
                    try { panel.hidePopup(); } catch (e) {}
                    try { fn(); } catch (e) {}
                });
                body.appendChild(row);
            };

            mkSep();
            mkItem("Move group to new window",
                () => this._wvTabGroupMoveToNewWindow(win, groupID));
            // "Copy N links in group" — zotero://open links for every member
            // (Weavero's copy-link feature), like Firefox's copy-links entry.
            if ((this as any)._getEnableCopyItemLink && (this as any)._getEnableCopyItemLink()) {
                const memberItems: any[] = [];
                for (const m of (g.members || [])) {
                    try {
                        const it: any = Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey);
                        if (it) memberItems.push(it);
                    } catch (e) {}
                }
                if (memberItems.length) {
                    mkItem("Copy " + memberItems.length + " link" + (memberItems.length === 1 ? "" : "s") + " in group",
                        () => { try { (this as any)._copyItemLinks(memberItems, "open"); } catch (e) {} });
                }
            }
            mkItem("Save and close group",
                () => this._wvTabGroupSaveAndClose(win, groupID));
            mkItem("Ungroup tabs",
                () => { this._tabGroupDelete(groupID); this._wvTabGroupApplyEverywhere(); });
            mkSep();
            mkItem("Delete group",
                () => this._wvTabGroupCloseTabs(win, groupID), true);

            // Focus the name box as soon as the panel is up so the user can
            // type the group name immediately (esp. right after New Group).
            panel.addEventListener("popupshown", () => {
                try { input.focus(); input.select(); } catch (e) {}
            }, { once: true });
            panel.openPopup(anchorNode, "after_start", 0, 2, false, false);
        } catch (e) { Zotero.debug("[Weavero] _wvShowTabGroupEditor err: " + e); }
    }

    // ---- Tab context menu entries ---------------------------------------------

    /** A colored-circle icon (data URI) for group menu entries. */
    _wvTabGroupDotImage(hex: string) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">'
            + '<circle cx="6" cy="6" r="5" fill="' + hex + '"/></svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
    }

    /** Firefox's "New Group" flow for a single tab. */
    _wvTabGroupNewFromTab(win: any, tabID: any) {
        this._wvTabGroupNewFromTabs(win, [tabID]);
    }

    // ---- Multi-select (Ctrl / Shift + click) ---------------------------------
    // Firefox-style: accel+click toggles a tab in/out of the selection,
    // shift+click selects the range from the ACTIVE tab, a plain click clears.
    // The selection only feeds the group commands ("Add N Tabs to Group"),
    // so it lives here rather than in tabs.ts.

    /** Wire the multi-select listeners on a main window's tab bar. Versioned +
     *  delegate-based (same pattern as _wvWireTabGroupDnD) so plugin reloads
     *  re-wire cleanly and handlers always resolve the LIVE plugin. */
    _wvWireTabMultiSel(win: any) {
        try {
            const WIRE_VERSION = 1;
            if (win._wvTabMultiSelVer === WIRE_VERSION) return;
            const container = win.document.getElementById("tab-bar-container");
            if (!container) return;
            if (win._wvTabMultiSelOff) { try { win._wvTabMultiSelOff(); } catch (e) {} }
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const onMouseDown = (e: any) => { const p: any = live(); if (p) p._wvTabMultiSelMouseDown(win, e); };
            const onClick = (e: any) => { const p: any = live(); if (p) p._wvTabMultiSelClick(win, e); };
            container.addEventListener("mousedown", onMouseDown, true);
            container.addEventListener("click", onClick, true);
            win._wvTabMultiSelOff = () => {
                try { container.removeEventListener("mousedown", onMouseDown, true); } catch (e) {}
                try { container.removeEventListener("click", onClick, true); } catch (e) {}
                win._wvTabMultiSelVer = null;
            };
            win._wvTabMultiSelVer = WIRE_VERSION;
        } catch (e) {}
    }

    /** Capture-phase mousedown: modifier presses build the selection and are
     *  swallowed so Zotero doesn't also switch tabs; a plain press clears. */
    _wvTabMultiSelMouseDown(win: any, e: any) {
        try {
            if (e.button !== 0) return;             // left only — right-click keeps the selection for the menu
            const tabEl = e.target && e.target.closest && e.target.closest(".tab[data-id]");
            if (!tabEl) return;
            const accel = e.ctrlKey || e.metaKey;
            if (!accel && !e.shiftKey) {
                const sel = win._wvSelTabIDs;
                if (sel && sel.size) {
                    // Pressing a SELECTED tab may be the start of a multi-tab
                    // drag — keep the selection; a true click (drags suppress
                    // the click event) clears it in the click handler instead.
                    const pid = tabEl.getAttribute("data-id");
                    if (!sel.has(pid)) { sel.clear(); this._wvTabMultiSelSync(win); }
                }
                return;                              // let Zotero handle the plain click
            }
            e.preventDefault(); e.stopPropagation();
            const id = tabEl.getAttribute("data-id");
            if (id === "zotero-pane") return;        // the library tab can't be grouped
            const Z_Tabs: any = win.Zotero_Tabs;
            if (!win._wvSelTabIDs) win._wvSelTabIDs = new Set();
            const sel = win._wvSelTabIDs;
            if (accel) {
                // The ACTIVE tab is implicitly part of a fresh selection
                // (Firefox behavior), and ctrl+clicking it keeps it selected.
                const active = Z_Tabs && Z_Tabs.selectedID;
                if (!sel.size && active && active !== "zotero-pane") sel.add(active);
                if (id !== active) {
                    if (sel.has(id)) sel.delete(id); else sel.add(id);
                }
            } else {
                // Shift: range between the active tab and the clicked one.
                const ids = ((Z_Tabs && Z_Tabs._tabs) || []).map((t: any) => t.id);
                let a = ids.indexOf(Z_Tabs && Z_Tabs.selectedID);
                let b = ids.indexOf(id);
                if (b < 0) return;
                if (a < 0) a = b;
                if (a > b) { const t = a; a = b; b = t; }
                for (let i = a; i <= b; i++) if (ids[i] !== "zotero-pane") sel.add(ids[i]);
            }
            this._wvTabMultiSelSync(win);
        } catch (er) {}
    }

    /** Swallow the click paired with a modifier press (selection already
     *  happened on mousedown); a PLAIN click on a tab clears the selection —
     *  this never fires after a drag (drags suppress click), which is what
     *  lets a press-and-drag on a selected tab keep the selection. */
    _wvTabMultiSelClick(win: any, e: any) {
        try {
            const tabEl = e.target && e.target.closest && e.target.closest(".tab[data-id]");
            if (!tabEl) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault(); e.stopPropagation();
                return;
            }
            const sel = win._wvSelTabIDs;
            if (sel && sel.size) { sel.clear(); this._wvTabMultiSelSync(win); }
        } catch (er) {}
    }

    /** Mirror the selection set onto .wv-multisel classes (idempotent). */
    _wvTabMultiSelSync(win: any) {
        try {
            const sel = win._wvSelTabIDs;
            for (const el of win.document.querySelectorAll("#tab-bar-container .tab[data-id]")) {
                const want = !!(sel && sel.has(el.getAttribute("data-id")));
                if (el.classList.contains("wv-multisel") !== want) el.classList.toggle("wv-multisel", want);
            }
        } catch (e) {}
    }

    _wvTabMultiSelClear(win: any) {
        try {
            if (win._wvSelTabIDs) win._wvSelTabIDs.clear();
            this._wvTabMultiSelSync(win);
        } catch (e) {}
    }

    /** The tab IDs a group command should operate on: the whole selection when
     *  the context-menu tab is part of it, else just that tab. Tab-bar order,
     *  stale IDs dropped. */
    _wvTabMultiSelTargets(win: any, tabID: any) {
        try {
            const sel = win._wvSelTabIDs;
            if (sel && sel.size > 1 && sel.has(tabID)) {
                const Z_Tabs: any = win.Zotero_Tabs;
                const ids = ((Z_Tabs && Z_Tabs._tabs) || [])
                    .map((t: any) => t.id).filter((id: any) => sel.has(id));
                if (ids.length) return ids;
            }
        } catch (e) {}
        return [tabID];
    }

    // ---- Multi-select + group commands for READER-window strips ---------------
    // Same UX as the main window, over the deck (`win._wvWT.tabs`, elements
    // `.wv-window-tab[data-wv-tab-id]`). Wired from _applyTabGroupsReader
    // (the strip rebuilds on every render, but the strip CONTAINER persists).

    _wvWireTabMultiSelReader(win: any) {
        try {
            const WIRE_VERSION = 1;
            if (win._wvWTMultiSelVer === WIRE_VERSION) return;
            const strip = win.document.querySelector(".wv-window-tabstrip");
            if (!strip) return;
            if (win._wvWTMultiSelOff) { try { win._wvWTMultiSelOff(); } catch (e) {} }
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const onMouseDown = (e: any) => { const p: any = live(); if (p) p._wvWTMultiSelMouseDown(win, e); };
            const onClick = (e: any) => { const p: any = live(); if (p) p._wvWTMultiSelClick(win, e); };
            strip.addEventListener("mousedown", onMouseDown, true);
            strip.addEventListener("click", onClick, true);
            win._wvWTMultiSelOff = () => {
                try { strip.removeEventListener("mousedown", onMouseDown, true); } catch (e) {}
                try { strip.removeEventListener("click", onClick, true); } catch (e) {}
                win._wvWTMultiSelVer = null;
            };
            win._wvWTMultiSelVer = WIRE_VERSION;
        } catch (e) {}
    }

    _wvWTMultiSelMouseDown(win: any, e: any) {
        try {
            if (e.button !== 0) return;
            const tabEl = e.target && e.target.closest && e.target.closest(".wv-window-tab");
            if (!tabEl) return;
            const accel = e.ctrlKey || e.metaKey;
            if (!accel && !e.shiftKey) {
                const sel = win._wvSelWTabIDs;
                if (sel && sel.size) {
                    // Keep the selection when pressing a selected tab (it may
                    // begin a drag); a true click clears it in the click handler.
                    const pid = tabEl.getAttribute("data-wv-tab-id");
                    if (!sel.has(pid)) { sel.clear(); this._wvWTMultiSelSync(win); }
                }
                return;
            }
            e.preventDefault(); e.stopPropagation();
            const id = tabEl.getAttribute("data-wv-tab-id");
            if (!id) return;
            const st = win._wvWT;
            if (!win._wvSelWTabIDs) win._wvSelWTabIDs = new Set();
            const sel = win._wvSelWTabIDs;
            const active = st && st.activeId != null ? String(st.activeId) : null;
            if (accel) {
                if (!sel.size && active) sel.add(active);
                if (id !== active) {
                    if (sel.has(id)) sel.delete(id); else sel.add(id);
                }
            } else {
                const ids = ((st && st.tabs) || []).map((t: any) => String(t.id));
                let a = active ? ids.indexOf(active) : -1;
                let b = ids.indexOf(id);
                if (b < 0) return;
                if (a < 0) a = b;
                if (a > b) { const t = a; a = b; b = t; }
                for (let i = a; i <= b; i++) sel.add(ids[i]);
            }
            this._wvWTMultiSelSync(win);
        } catch (er) {}
    }

    _wvWTMultiSelClick(win: any, e: any) {
        try {
            const tabEl = e.target && e.target.closest && e.target.closest(".wv-window-tab");
            if (!tabEl) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault(); e.stopPropagation();
                return;
            }
            // Plain click (never fires after a drag) → clear the selection.
            const sel = win._wvSelWTabIDs;
            if (sel && sel.size) { sel.clear(); this._wvWTMultiSelSync(win); }
        } catch (er) {}
    }

    _wvWTMultiSelSync(win: any) {
        try {
            const sel = win._wvSelWTabIDs;
            for (const el of win.document.querySelectorAll(".wv-window-tabs .wv-window-tab")) {
                const want = !!(sel && sel.has(el.getAttribute("data-wv-tab-id")));
                if (el.classList.contains("wv-multisel") !== want) el.classList.toggle("wv-multisel", want);
            }
        } catch (e) {}
    }

    _wvWTMultiSelClear(win: any) {
        try {
            if (win._wvSelWTabIDs) win._wvSelWTabIDs.clear();
            this._wvWTMultiSelSync(win);
        } catch (e) {}
    }

    _wvWTMultiSelTargets(win: any, tabId: any) {
        try {
            const sel = win._wvSelWTabIDs;
            const sid = String(tabId);
            if (sel && sel.size > 1 && sel.has(sid)) {
                const st = win._wvWT;
                const ids = ((st && st.tabs) || [])
                    .map((t: any) => String(t.id)).filter((id: string) => sel.has(id));
                if (ids.length) return ids;
            }
        } catch (e) {}
        return [String(tabId)];
    }

    /** Add a reader DECK tab to a group; when the group lives in another
     *  window, the tab migrates there instead (a group never spans windows). */
    _wvTabGroupAddDeckTab(win: any, tabId: any, groupID: any) {
        try {
            const st = win._wvWT;
            const tab = st && st.tabs.find((t: any) => String(t.id) === String(tabId));
            const key = tab && this._wvTabGroupDeckKey(tab);
            if (!key) return;
            const home = this._wvTabGroupHomeWin(groupID);
            if (home && home !== win) { this._wvTabGroupSendDeckTabToWin(win, tab, home, groupID); return; }
            this._tabGroupAddKey(groupID, key);
            this._wvTabGroupDeckPlaceNearGroup(win, tab.itemID, groupID);
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupAddDeckTab err: " + e); }
    }

    /** Reposition a deck tab right after its group's last OTHER member. */
    _wvTabGroupDeckPlaceNearGroup(win: any, itemID: any, groupID: any) {
        try {
            const st = win._wvWT;
            if (!st || !st.tabs) return;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const ks = new Set(((g && g.members) || []).map((m: any) => m.libraryID + ":" + m.itemKey));
            const idx = st.tabs.findIndex((t: any) => t.itemID === itemID);
            let last = -1;
            for (let i = 0; i < st.tabs.length; i++) {
                if (i === idx) continue;
                const k = this._wvTabGroupDeckKey(st.tabs[i]);
                if (k && ks.has(k.libraryID + ":" + k.itemKey)) last = i;
            }
            if (idx >= 0 && last >= 0) {
                const target = idx < last ? last : last + 1;
                if (idx !== target) {
                    const [moved] = st.tabs.splice(idx, 1);
                    st.tabs.splice(target, 0, moved);
                }
            }
            try { (this as any)._wvWTRenderStrip(win); } catch (e) {}
            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
        } catch (e) {}
    }

    /** Migrate one deck tab to the group's home window (reader or main). */
    _wvTabGroupSendDeckTabToWin(srcWin: any, tab: any, tgtWin: any, groupID: any) {
        try {
            const key = this._wvTabGroupDeckKey(tab);
            if (!key) return;
            this._tabGroupAddKey(groupID, key);
            const itemID = tab.itemID;
            if (this._wvTabGroupIsReaderWin(tgtWin)) {
                // Mount in the target FIRST, close here only once it landed
                // (same never-lose-the-tab order as _wvWTHandleCrossWindowDrop).
                (this as any)._wvWTMountTab(tgtWin, itemID, { allowDuplicate: false, select: false });
                const landed = !!(tgtWin._wvWT && tgtWin._wvWT.tabs
                    && tgtWin._wvWT.tabs.some((t: any) => t.itemID === itemID));
                if (landed) { try { (this as any)._wvWTCloseTab(srcWin, tab.id); } catch (e) {} }
                tgtWin.setTimeout(() => {
                    try { this._wvTabGroupDeckPlaceNearGroup(tgtWin, itemID, groupID); } catch (e) {}
                    try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
                }, 250);
            } else {
                // Main-window target: state-preserving close + reopen there,
                // then cluster the arrival into the group once it lands.
                (this as any)._wvWTMoveTabToMain(srcWin, tab.id, tgtWin);
                const startTs = Date.now();
                const poll = () => {
                    try {
                        const TZ: any = tgtWin.Zotero_Tabs;
                        const there = TZ && TZ._tabs.some((t: any) => t && t.data && t.data.itemID === itemID);
                        if (!there) {
                            if (Date.now() - startTs < 4000) tgtWin.setTimeout(poll, 150);
                            return;
                        }
                        this._wvTabGroupStabilize(tgtWin);
                        this._wvTabGroupApplyEverywhere();
                    } catch (e) {}
                };
                tgtWin.setTimeout(poll, 300);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupSendDeckTabToWin err: " + e); }
    }

    /** "New Group" from deck tabs in a reader window: create, add them all,
     *  cluster them contiguously, then open the editor on the fresh chip. */
    _wvTabGroupNewFromDeckTabs(win: any, tabIds: any[]) {
        try {
            const groups = this._tabGroupsGet();
            const color = WV_GROUP_COLORS[groups.length % WV_GROUP_COLORS.length].id;
            const g = this._tabGroupCreate("", color);
            const st = win._wvWT;
            const members: any[] = [];
            for (const id of tabIds) {
                const t = st && st.tabs.find((x: any) => String(x.id) === String(id));
                const k = t && this._wvTabGroupDeckKey(t);
                if (k) { this._tabGroupAddKey(g.id, k); members.push(t); }
            }
            // Cluster the members contiguously at the first member's slot.
            if (st && members.length > 1) {
                const firstIdx = st.tabs.findIndex((t: any) => t === members[0]);
                const rest = st.tabs.filter((t: any) => members.indexOf(t) < 0);
                rest.splice(Math.min(firstIdx, rest.length), 0, ...members);
                st.tabs = rest;
            }
            this._wvWTMultiSelClear(win);
            try { (this as any)._wvWTRenderStrip(win); } catch (e) {}
            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
            this._wvTabGroupApplyEverywhere();
            win.setTimeout(() => {
                try {
                    const chip = win.document.getElementById("wv-tgchip-" + g.id);
                    if (chip) this._wvShowTabGroupEditor(win, g.id, chip);
                } catch (e) {}
            }, 150);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupNewFromDeckTabs err: " + e); }
    }

    /** "New Group" from one or several tabs: create (auto-cycled color, no
     *  name), add them all, then open the editor on the fresh chip. */
    _wvTabGroupNewFromTabs(win: any, tabIDs: any[]) {
        try {
            const groups = this._tabGroupsGet();
            const color = WV_GROUP_COLORS[groups.length % WV_GROUP_COLORS.length].id;
            const g = this._tabGroupCreate("", color);
            for (const id of tabIDs) this._wvTabGroupAddTab(win, id, g.id);
            this._wvTabMultiSelClear(win);
            try {
                win.setTimeout(() => {
                    try {
                        const chip = win.document.getElementById("wv-tgchip-" + g.id);
                        if (chip) this._wvShowTabGroupEditor(win, g.id, chip);
                    } catch (e) {}
                }, 120);
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupNewFromTabs err: " + e); }
    }

    /** Move our menuitem just above the native "Move Tab" submenu (found by
     *  its localized label). No-op when Move Tab isn't in this popup. */
    _wvTabGroupRepositionBeforeMove(menuElem: any) {
        try {
            const popup = menuElem && menuElem.parentNode;
            if (!popup) return;
            let moveLabel = "Move Tab";
            try { moveLabel = Zotero.getString("tabs.move"); } catch (e) {}
            let moveEl: any = null;
            for (const ch of popup.querySelectorAll("menu, menuitem")) {
                if (ch.getAttribute && ch.getAttribute("label") === moveLabel) { moveEl = ch; break; }
            }
            if (moveEl && menuElem.nextSibling !== moveEl) {
                popup.insertBefore(menuElem, moveEl);
            }
        } catch (e) {}
    }

    _registerTabGroupMenus() {
        try {
            if (!(Zotero.MenuManager && typeof Zotero.MenuManager.registerMenu === "function")) return;
            this._unregisterTabGroupMenus();
            const self: any = this;
            const id = Zotero.MenuManager.registerMenu({
                menuID: "weavero-tab-groups",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [
                    {
                        // Firefox-style "Add Tab to Group ▸" SUBMENU: New Group +
                        // the existing groups as colored-dot entries. The children
                        // here are a placeholder — onShowing rebuilds the popup
                        // from the live group list each time.
                        menuType: "submenu",
                        menus: [{ menuType: "menuitem", l10nID: "zotero-general-cancel" }],
                        onShowing: (_ev: any, ctx: any) => {
                            try {
                                if (!self._getEnableTabGroups() || ctx.tabID === "zotero-pane") {
                                    ctx.setVisible(false); return;
                                }
                                const item = ctx.items && ctx.items[0];
                                if (!item || !item.libraryID || !item.key) { ctx.setVisible(false); return; }
                                ctx.setVisible(true);
                                const doc = ctx.menuElem.ownerDocument;
                                const win = doc.defaultView;
                                const tabID = ctx.tabID;
                                // Operate on the multi-selection when the
                                // context tab is part of it.
                                const targets = self._wvTabMultiSelTargets(win, tabID);
                                ctx.menuElem.setAttribute("label", targets.length > 1
                                    ? "Add " + targets.length + " Tabs to Group"
                                    : "Add Tab to Group");
                                try { self._wvTabGroupRepositionBeforeMove(ctx.menuElem); } catch (e) {}
                                // Rebuild the submenu popup from the live groups.
                                const popup = ctx.menuElem.querySelector("menupopup");
                                if (!popup) return;
                                while (popup.firstChild) popup.removeChild(popup.firstChild);
                                const mkItem = (label: string, icon: string | null, fn: () => void) => {
                                    const mi = doc.createXULElement("menuitem");
                                    mi.setAttribute("label", label);
                                    if (icon) {
                                        mi.setAttribute("class", "menuitem-iconic");
                                        mi.setAttribute("image", icon);
                                    }
                                    mi.addEventListener("command", (e: any) => {
                                        try { e.stopPropagation(); fn(); } catch (er) {}
                                    });
                                    popup.appendChild(mi);
                                    return mi;
                                };
                                mkItem("New Group", null, () => self._wvTabGroupNewFromTabs(win, targets));
                                const groups = self._tabGroupsGet();
                                // Don't offer the group the tab is already in
                                // (single-tab case only — a multi-selection may
                                // mix members of several groups).
                                const cur = targets.length === 1
                                    && self._tabGroupOfKey(item.libraryID, item.key);
                                const others = groups.filter((x: any) => !cur || x.id !== cur.id);
                                if (others.length) {
                                    popup.appendChild(doc.createXULElement("menuseparator"));
                                    for (const g of others) {
                                        mkItem(g.name || "Unnamed group",
                                            self._wvTabGroupDotImage(self._tabGroupColorHex(g.color)),
                                            () => {
                                                // Staggered: cross-window adds migrate
                                                // tabs (close + deferred reopen), and
                                                // simultaneous opens collide.
                                                targets.forEach((id: any, i: number) => {
                                                    win.setTimeout(() => {
                                                        try { self._wvTabGroupAddTab(win, id, g.id); } catch (e) {}
                                                    }, i * 170);
                                                });
                                                self._wvTabMultiSelClear(win);
                                            });
                                    }
                                }
                            } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                        },
                    },
                    {
                        menuType: "menuitem",
                        onShowing: (_ev: any, ctx: any) => {
                            try {
                                if (!self._getEnableTabGroups() || ctx.tabID === "zotero-pane") {
                                    ctx.setVisible(false); return;
                                }
                                const item = ctx.items && ctx.items[0];
                                const grouped = item && item.libraryID && item.key
                                    && self._tabGroupOfKey(item.libraryID, item.key);
                                if (!grouped) { ctx.setVisible(false); return; }
                                ctx.setVisible(true);
                                const win = ctx.menuElem.ownerDocument.defaultView;
                                const n = self._wvTabMultiSelTargets(win, ctx.tabID).length;
                                ctx.menuElem.setAttribute("label", n > 1
                                    ? "Remove " + n + " Tabs from Group"
                                    : "Remove from Tab Group");
                                // Sits directly under "Add to Tab Group…" (that
                                // item repositions first, so inserting before
                                // Move Tab lands this one right after it).
                                try { self._wvTabGroupRepositionBeforeMove(ctx.menuElem); } catch (e) {}
                            } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                        },
                        onCommand: (_ev: any, ctx: any) => {
                            try {
                                const item = ctx.items && ctx.items[0];
                                if (!item) return;
                                const win = ctx.menuElem.ownerDocument.defaultView;
                                const Z_Tabs: any = win && win.Zotero_Tabs;
                                for (const id of self._wvTabMultiSelTargets(win, ctx.tabID)) {
                                    const t = Z_Tabs && Z_Tabs._tabs.find((x: any) => x && x.id === id);
                                    const k = t && self._tabPinKey(t);
                                    if (k) self._tabGroupRemoveKey(k.libraryID, k.itemKey);
                                }
                                self._wvTabMultiSelClear(win);
                                for (const w of Zotero.getMainWindows()) self._applyTabGroups(w);
                            } catch (e) {}
                        },
                    },
                ],
            });
            if (id) this._tabGroupMenuID = id;
        } catch (e) { Zotero.debug("[Weavero] _registerTabGroupMenus err: " + e); }
    }

    _unregisterTabGroupMenus() {
        try {
            if (this._tabGroupMenuID && Zotero.MenuManager
                && typeof Zotero.MenuManager.unregisterMenu === "function") {
                Zotero.MenuManager.unregisterMenu(this._tabGroupMenuID);
            }
        } catch (e) {}
        this._tabGroupMenuID = null;
    }

    // ---- Teardown ---------------------------------------------------------------

    _teardownTabGroups() {
        try { this._unregisterTabGroupMenus(); } catch (e) {}
        try {
            const wins = Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()].filter(Boolean);
            for (const w of wins) {
                try { this._stripTabGroups(w); } catch (e) {}
                try { if ((w as any)._wvTabMultiSelOff) (w as any)._wvTabMultiSelOff(); } catch (e) {}
                try { this._wvTabMultiSelClear(w); } catch (e) {}
                try {
                    const doc = w.document;
                    for (const id of ["wv-tab-group-editor", "wv-tab-group-styles"]) {
                        const el = doc.getElementById(id); if (el) el.remove();
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }
}

const _tabGroupsDescriptors = Object.getOwnPropertyDescriptors(_TabGroupsMixin.prototype);
delete (_tabGroupsDescriptors as any).constructor;
export const tabGroupsMethods = _tabGroupsDescriptors;
