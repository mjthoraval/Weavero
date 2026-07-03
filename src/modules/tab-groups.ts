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

    /** The LIVE group containing (libraryID, itemKey), or null. SAVED (parked)
     *  groups are deliberately EXCLUDED: a saved group's membership is a stored
     *  snapshot, fully decoupled from open tabs — an open tab whose item is a
     *  saved member is NOT "in" the group (no chip, not nested in the tabs menu).
     *  Persistence/reopen still read `g.members` directly. */
    _tabGroupOfKey(libraryID: any, itemKey: any) {
        const groups = this._tabGroupsGet();
        return groups.find((g: any) => !(g as any).saved && (g.members || []).some(
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

    /** The next group colour, by rotation through the palette (matches the
     *  `_wvTabGroupNewFromTabs` convention so new groups cycle colours). */
    _wvTabGroupNextColor(): string {
        try {
            const groups = this._tabGroupsGet();
            return WV_GROUP_COLORS[groups.length % WV_GROUP_COLORS.length].id;
        } catch (e) { return "blue"; }
    }

    /** Add a key to a group's item-key SHADOW (removing it from any other
     *  group's shadow first). The shadow is a saved/restart fallback only —
     *  live membership is the per-tab stamp — so groups are NO LONGER deleted
     *  here when their shadow empties (a live group can have an empty shadow);
     *  `_applyTabGroups` deletes a group only when no tab is stamped anywhere.
     *  SAVED (parked) groups' snapshots are FROZEN: live-tab churn must never
     *  bleed a parked group's members away (that emptied two saved groups to
     *  0 members — nothing left to reopen). Only the target group itself may
     *  be saved here (filing a tab into a closed group). */
    _tabGroupAddKey(groupID: any, key: any) {
        if (!key || key.libraryID == null || !key.itemKey) return;
        const groups = this._tabGroupsGet();
        for (const g of groups) {
            if ((g as any).saved && g.id !== groupID) continue;   // parked snapshots are frozen
            g.members = (g.members || []).filter(
                (m: any) => !(m.libraryID === key.libraryID && m.itemKey === key.itemKey));
        }
        const g = groups.find((x: any) => x.id === groupID);
        if (g) g.members.push({ libraryID: key.libraryID, itemKey: key.itemKey });
        this._tabGroupsSet(groups);
    }

    /** Remove an item from its group: clear the per-tab STAMP on every open tab
     *  showing it (the live membership) AND drop it from every group's item-key
     *  shadow. Does NOT delete now-shadowless groups (apply handles deletion via
     *  the stamp). */
    _tabGroupRemoveKey(libraryID: any, itemKey: any) {
        // Clear the live stamp on every open tab for this item, in any window.
        try {
            this._wvTabGroupForEachOpenTab((t) => {
                const k = this._wvTabGroupDeckKey(t);
                if (k && k.libraryID === libraryID && k.itemKey === itemKey) this._wvTabGroupSetStamp(t, null);
            });
        } catch (e) {}
        const groups = this._tabGroupsGet();
        for (const g of groups) {
            if ((g as any).saved) continue;   // parked snapshots are frozen (live-tab lifecycle only)
            g.members = (g.members || []).filter(
                (m: any) => !(m.libraryID === libraryID && m.itemKey === itemKey));
        }
        this._tabGroupsSet(groups);
    }

    /** Cross-window move / tear-out: a tab leaving its window leaves its group
     *  (Firefox model — the group doesn't follow the tab to the new window).
     *  Call this BEFORE closing the source tab so the close doesn't park it as
     *  recently-closed (and the reopen in the other window doesn't rejoin it).
     *  Also clears any stale recently-closed record. */
    _wvForgetTabGroupForItem(itemID: any) {
        try {
            const it: any = (itemID != null) && Zotero.Items.get(itemID);
            if (!it) return;
            this._tabGroupRemoveKey(it.libraryID, it.key);
            this._wvForgetClosed(it.libraryID, it.key);
        } catch (e) {}
    }

    /** Delete a group (tabs stay open — "Ungroup"). */
    _tabGroupDelete(groupID: any) {
        // Clear the per-tab stamp on every member so its tabs become ungrouped
        // (Ungroup keeps the tabs open).
        try { this._wvTabGroupForEachOpenTab((t) => { if (this._wvTabGroupStamp(t) === groupID) this._wvTabGroupSetStamp(t, null); }); } catch (e) {}
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
            const STYLE_VERSION = "25";
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
                // DRAG PREVIEW: while dragging a tab over a group (release = join),
                // the lifted tab carries that group's underline so it reads as a
                // member-to-be. Keyed on a DATA ATTRIBUTE (not a class): React
                // rewrites className on every re-render and would strip a class
                // mid-drag; it leaves data-* + inline style untouched.
                "#tab-bar-container .tab[data-wv-drag-join]::after {",
                "  content: \"\"; position: absolute; bottom: 0; height: 2px;",
                "  left: -4px; right: 0; border-radius: 1px;",
                "  background: var(--wv-group-color, #4f7ce0);",
                "  pointer-events: none;",
                "}",
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
                // Drag a tab onto a COLLAPSED group's chip (middle third) →
                // releasing joins it; the chip lights up in the group colour.
                "#tab-bar-container .wv-tab-group-chip.wv-tg-join-target {",
                "  outline: 2px solid var(--wv-group-color, #4072e5);",
                "  outline-offset: 1px;",
                "  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wv-group-color, #4072e5) 35%, transparent);",
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
                // Tab rows now always live in a `.wv-winscope` wrapper that indents
                // them `padding-inline-start: 18px` (window → tab hierarchy), in BOTH
                // sort states. So the chip's left edge is pinned to that same 18px
                // regardless of Sort-by-Library — header margin-left(4)+padding-left(14)
                // = 18, lining the chip up with every ungrouped tab icon. (The old
                // grouped-only 16px override was stale: it pre-dated the wrapper indent
                // and left the chip ~10px adrift whenever Sort-by-Library was off.)
                ".wv-tgrow-header {",
                "  display: flex; align-items: center; gap: 7px;",
                "  padding: 4px 8px 4px 14px; margin: 2px 4px 0; border-radius: 5px;",
                "  font-size: 12px; font-weight: 600;",
                "}",
                ".wv-tgrow-header:hover { background: rgba(127,127,127,0.18); }",
                ".wv-tgrow-chip { width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto; }",
                ".wv-tgrow-count { margin-left: 2px; font-size: 11px; font-weight: 400; opacity: 0.6; flex: 0 0 auto; }",
                ".wv-tgrow-twisty {",
                "  margin-left: auto; flex: 0 0 auto;",
                "  font-size: 9px; opacity: 0.6; width: 12px; text-align: center;",
                "}",
                "#zotero-tabs-menu-list .row.wv-tgrow-member { margin-left: 18px; }",
                // Group-chip drag: the whole group travels - member tabs
                // hide while their chip is dragged (the drop ghost is the
                // single visible copy).
                "#tab-bar-container .tabs .tab[data-wv-grpdrag-hidden] { display: none !important; }",
                "#zotero-tabs-menu-list .row.wv-tgrow-hidden { display: none !important; }",
                // The DROP GHOST is a hand-built div lacking the `data-tab-id`
                // that makes REAL tab rows (loose AND grouped) match the
                // winscope 18px padding rule, so it fell back to the native
                // `.row` 6px and sat 12px left of its neighbours everywhere.
                // Give it the 18px base padding unconditionally; the member
                // variant adds the group indent via the margin rule above.
                // `!important` because the competing native rule carries two
                // IDs of specificity (both are non-important).
                "#zotero-tabs-menu-list .row.wv-tabsmenu-ghost { padding-inline-start: 18px !important; }",
                // Reader-window tabs-menu twins (Weavero-built panel).
                "#wv-wtl-list .row.wv-tgrow-member { margin-left: 18px; }",
                "#wv-wtl-list .row.wv-tgrow-hidden { display: none !important; }",
                "#wv-wtl-list .row.wv-tabsmenu-ghost { padding-inline-start: 18px !important; }",
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
                // Context-fill tinting for chrome SVG icons in Weavero's
                // reader-window tab menu (globe / folder-open adapt to theme).
                "#wv-window-tab-context-menu .menu-iconic-icon {",
                "  -moz-context-properties: fill, fill-opacity;",
                "  fill: currentColor;",
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
        if ((this as any)._wvDestroyed) return;   // plugin torn down — never re-apply
        try {
            if (!win || !win.document) return;
            // Self-heal the chip stylesheet: plugin teardown removes it, and the
            // per-window setup's idempotency guards can skip an already-wired
            // window after a reload — leaving unstyled (squeezed, text-wrapped)
            // chips. Version-checked + idempotent, so this is a cheap no-op in
            // the steady state.
            try { this._ensureTabGroupStyles(win.document); } catch (e) {}
            // Batched mutation in flight (e.g. a group migrate adding many
            // unloaded tabs): skip the per-event re-chip churn — the orchestrator
            // does ONE settling apply when the batch ends. Without this, each
            // Z.add fires the tab notifier → _applyTabGroups, re-chipping the bar
            // 8+ times in a burst (visible flicker).
            if ((this as any)._wvSuppressGroupApply) return;
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
            let groups = this._tabGroupsGet();
            if (!groups.length) { this._stripTabGroups(win); return; }

            const emptyGroupIds = new Set<string>();
            const wantClass = new Map<string, { group: any; hidden: boolean; first?: boolean }>();   // tabID →
            let prefDirty = false;
            // Rejoin: an open, UNSTAMPED tab whose item was recently closed from a
            // group (undo-close / reopened soon after) rejoins it by re-stamping.
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                if (this._wvTabGroupStamp(t)) continue;            // already grouped
                const pk = t && (this as any)._tabPinKey(t);
                if (!pk) continue;
                const gid = this._wvRecentClosedGroup(pk.libraryID, pk.itemKey);
                if (!gid) continue;
                const tg = groups.find((x: any) => x.id === gid && !(x as any).saved);
                if (tg) { this._wvTabGroupSetStamp(t, gid); this._wvForgetClosed(pk.libraryID, pk.itemKey); }
            }
            // Claim pass: stamp any UNSTAMPED open tab whose item is in a live
            // group's item-key shadow (covers add paths that only wrote the
            // shadow — drag-create, drop-into-group, cross-window send arrival).
            // First-come per item-key, so a DUPLICATE copy of an already-claimed
            // item stays OUT. Single-window: only claim into a group whose home is
            // THIS window (or one with no stamped tab anywhere yet, i.e. freshly
            // created here).
            // SKIPPED during startup restore: stamps round-trip via the session,
            // so restored tabs arrive already stamped — but window restore order
            // is arbitrary, and until a group's home window has its stamps back,
            // `_wvTabGroupHomeWin` is null and the home guard below can't hold.
            // Claiming in that gap grabbed a DUPLICATE copy of a member item
            // open ungrouped in another window (restart-protocol run 1: main1's
            // copy of an RT-B member got stamped into main2's group). The
            // post-restore re-apply (index.ts, after the guard lifts) runs the
            // claim with every window's stamps in place.
            if (!(this as any)._wvTabGroupRestoreGuard) {
                const claimedByGroup = new Map<string, Set<string>>();
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    const s = this._wvTabGroupStamp(t);
                    if (!s) continue;
                    const k = this._wvTabGroupDeckKey(t);
                    if (!k) continue;
                    let set = claimedByGroup.get(s); if (!set) { set = new Set(); claimedByGroup.set(s, set); }
                    set.add(k.libraryID + ":" + k.itemKey);
                }
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    if (this._wvTabGroupStamp(t) || (t as any)._wvGroupExcluded) continue;
                    const k = this._wvTabGroupDeckKey(t);
                    if (!k) continue;
                    const kk = k.libraryID + ":" + k.itemKey;
                    const g = groups.find((x: any) => !(x as any).saved
                        && (x.members || []).some((m: any) => m.libraryID === k.libraryID && m.itemKey === k.itemKey));
                    if (!g) continue;
                    const home = this._wvTabGroupHomeWin(g.id);
                    if (home && home !== win) continue;                 // group lives elsewhere (single-window)
                    // A HOME-LESS group is only claimable when nothing that could
                    // still deliver its real home is in flight — during window
                    // restore, "no home" usually means "home not restored YET",
                    // and claiming then splits the group (duplicate member copy
                    // in this window gets stamped; the real home arrives later).
                    if (!home && ((this as any)._wvWTRestoreActive
                            || (this as any)._wvPendingDevWindow
                            || ((this as any)._wvDevSpawnQueue && (this as any)._wvDevSpawnQueue.length))) continue;
                    // Same trap MID-MIGRATE: between the source closes and the
                    // target mounts the group is briefly homeless, and the async
                    // close notifications land _applyTabGroups in OTHER windows
                    // right inside that gap — claiming then stamps a loose
                    // duplicate copy of a member ("moved the group to a reader
                    // window, it left behind tabs with a duplicate of the
                    // group", 2026-07-03). The migrate keeps the group in the
                    // reopening set for exactly this window of time.
                    if (!home && this._wvReopeningGroups().has(g.id)) continue;
                    let set = claimedByGroup.get(g.id); if (!set) { set = new Set(); claimedByGroup.set(g.id, set); }
                    if (set.has(kk)) continue;                          // duplicate copy stays out
                    this._wvTabGroupSetStamp(t, g.id); set.add(kk);
                }
            }
            // SELF-HEAL a split group: any path that ended with a loose tab
            // wedged between a group's members (a native reorder, a cross-window
            // arrival, a drag that didn't run stabilize) is re-clustered here —
            // NOW, after the claim pass, so every member is stamped. Runs on the
            // common _applyTabGroups path so a split can never persist. Cheap:
            // stabilize walks once and returns unless a group is truly
            // non-contiguous; its Z.move re-enters _applyTabGroups async, which
            // then finds it contiguous → no loop. Skipped during restore (that
            // chain stabilizes explicitly once at the end) and drags (guarded
            // above). Re-entry flag stops redundant nested passes.
            if (!(this as any)._wvTabGroupRestoreGuard && !(this as any)._wvStabilizing) {
                (this as any)._wvStabilizing = true;
                try { this._wvTabGroupStabilize(win); } catch (e) {}
                (this as any)._wvStabilizing = false;
            }
            for (const g of groups) {
                // SAVED (parked) group ("Save and close group"): keeps its item-key
                // snapshot to reopen, shows no chip, never auto-deleted here.
                if ((g as any).saved) {
                    const sc = doc.getElementById("wv-tgchip-" + g.id);
                    if (sc) sc.remove();
                    continue;
                }
                // Members = OPEN tabs in THIS window STAMPED with this group, in
                // display order. Per-tab: a duplicate copy of a member's item that
                // wasn't itself added is NOT a member (the point of the rewrite).
                const openMembers: any[] = [];
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    if ((t as any)._wvGroupExcluded) continue;
                    if (this._wvTabGroupStamp(t) === g.id) openMembers.push({ tab: t });
                }
                const reopening = this._wvReopeningGroups().has(g.id);
                if (!openMembers.length) {
                    const sc = doc.getElementById("wv-tgchip-" + g.id);
                    if (sc) sc.remove();
                    // Globally empty (no tab stamped this group in ANY window) and
                    // not mid-reopen → delete it (Firefox: last tab closed → no
                    // group). Single-window model: a live group has tabs in exactly
                    // one window, so other windows just skip it.
                    // _wvTabGroupRestoreGuard: during startup, separate reader
                    // windows restore (and re-stamp their tabs) AFTER the main
                    // window's first apply. Without this guard a group living only
                    // in a reader window looks empty here and gets deleted from
                    // prefs before the reader window restores → the group is lost.
                    if (!reopening && !(this as any)._wvTabGroupRestoreGuard && !this._wvTabGroupOpenAnywhere(g.id)) emptyGroupIds.add(g.id);
                    continue;
                }
                // SHADOW SYNC (fixes "broken groups"): for a LIVE group settled in
                // its HOME window, prune `g.members` down to the OPEN members. The
                // shadow used to be kept forever, so the claim pass would silently
                // re-absorb any CLOSED member the next time its item was reopened
                // (an item unexpectedly joining an old group; a wrong count). It's
                // guarded so restore isn't disturbed: SAVED groups are skipped above
                // (they keep their snapshot), and `reopening` / `_wvTabGroupRestoreGuard`
                // prevent pruning while tabs are still coming back (a member not yet
                // restored isn't dropped before the claim pass re-stamps it).
                if (!reopening && !(this as any)._wvTabGroupRestoreGuard
                        && this._wvTabGroupHomeWin(g.id) === win) {
                    const openKeys: any[] = [];
                    for (const om of openMembers) {
                        const k = (this as any)._tabPinKey(om.tab);
                        if (k) openKeys.push({ libraryID: k.libraryID, itemKey: k.itemKey });
                    }
                    const cur = g.members || [];
                    const same = cur.length === openKeys.length
                        && openKeys.every((ok: any) => cur.some((m: any) => m.libraryID === ok.libraryID && m.itemKey === ok.itemKey));
                    if (!same) { g.members = openKeys; prefDirty = true; }
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
            // Drop groups that emptied out everywhere (Firefox: no last tab → no group).
            if (emptyGroupIds.size) {
                groups = groups.filter((g: any) => !emptyGroupIds.has(g.id));
                prefDirty = true;
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

    // ---- Recently-closed → group memory -------------------------------------
    // Firefox model: closing a grouped tab removes it from the group. To let a
    // RESTORED tab (undo-close, or reopened soon after) rejoin its original
    // group, the {item → group} association is parked here for a short window.
    // Stored on the Zotero global so it survives plugin reloads.

    _wvRecentClosedMap(): any {
        const z: any = Zotero;
        return (z._wvRecentClosedGroups = z._wvRecentClosedGroups || {});
    }
    _wvRecordClosedFromGroup(libraryID: any, itemKey: any, groupID: any) {
        try {
            const m = this._wvRecentClosedMap();
            m[libraryID + ":" + itemKey] = { groupID, ts: Date.now() };
            const keys = Object.keys(m);
            if (keys.length > 80) {            // keep only the 80 most recent
                keys.map((k) => [k, m[k].ts] as [string, number])
                    .sort((a, b) => a[1] - b[1])
                    .slice(0, keys.length - 80)
                    .forEach(([k]) => { delete m[k]; });
            }
        } catch (e) {}
    }
    _wvRecentClosedGroup(libraryID: any, itemKey: any): any {
        try {
            const m = this._wvRecentClosedMap();
            const rec = m[libraryID + ":" + itemKey];
            if (!rec) return null;
            if (Date.now() - rec.ts > 30 * 60 * 1000) { delete m[libraryID + ":" + itemKey]; return null; }  // 30-min window
            if (!this._tabGroupsGet().some((g: any) => g.id === rec.groupID)) { delete m[libraryID + ":" + itemKey]; return null; }
            return rec.groupID;
        } catch (e) { return null; }
    }
    _wvForgetClosed(libraryID: any, itemKey: any) {
        try { delete this._wvRecentClosedMap()[libraryID + ":" + itemKey]; } catch (e) {}
    }

    /** Keys ("lib:key") of every item open as a tab in ANY window — main tab
     *  bars and Weavero reader-window strips. Used so a per-window group re-sync
     *  never drops a member that's merely open in a different window. */
    _wvGlobalOpenKeys(): Set<string> {
        const s = new Set<string>();
        try {
            for (const w of Zotero.getMainWindows()) {
                const Z: any = (w as any).Zotero_Tabs;
                for (const t of (Z && Z._tabs) || []) {
                    const k = (this as any)._tabPinKey(t);
                    if (k) s.add(k.libraryID + ":" + k.itemKey);
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
                    if (k) s.add(k.libraryID + ":" + k.itemKey);
                }
            }
        } catch (e) {}
        return s;
    }

    /** Group ids currently being reopened from a saved state — _applyTabGroups
     *  keeps their members and won't delete them while their tabs come back. */
    _wvReopeningGroups(): Set<string> {
        const z: any = Zotero;
        return (z._wvReopeningGroups = z._wvReopeningGroups || new Set<string>());
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
                // AFTER the drag image is captured: hide the member tabs so
                // the whole group visibly travels with the chip.
                try { win.setTimeout(() => { try { const p2: any = live(); if (p2 && p2._wvGroupDrag && p2._wvGroupDrag.groupID === groupID) p2._wvGrpDragSetMembersHidden(win, groupID, true); } catch (er3) {} }, 0); } catch (er2) {}
            } catch (er) {}
        });
        chip.addEventListener("dragend", (e: any) => {
            try {
                pressed = false; dragged = false;
                chip.classList.remove("wv-tg-dragging");
                win._wvGroupDragSlot = null;
                const p: any = live();
                try { if (p) p._wvGrpDragSetMembersHidden(win, groupID, false); } catch (er2) {}
                // Tear-out: every strip drop handler (main + reader, same- and
                // cross-window) consumes _wvGroupDrag before this dragend fires,
                // so its survival means the chip was released off ALL strips —
                // empty space. Mirror Firefox's drag-group-label-out gesture and
                // pop the whole group into its own new window. Skip on ESC/cancel.
                const gd = p && (p as any)._wvGroupDrag;
                const cancelled = !!(e && e.dataTransfer && e.dataTransfer.mozUserCancelled);
                // Released INSIDE any Zotero window → the drop just wasn't
                // accepted there (a dialog, an unwired area) — treat as
                // cancel, never as tear-out. A release over the reader
                // window's content used to fall through here and pop a
                // surprise new window (whose spawn hiccup + close-parking
                // once left the group "closed and saved", 2026-07-03). Only
                // a release over EMPTY DESKTOP tears out (Firefox parity).
                let overZoteroWin = false;
                if (gd && !cancelled && e && typeof e.screenX === "number") {
                    try {
                        const en2 = Services.wm.getEnumerator(null);
                        while (en2.hasMoreElements()) {
                            const w2: any = en2.getNext();
                            if (!w2 || w2.closed) continue;
                            if (e.screenX >= w2.screenX && e.screenX <= w2.screenX + w2.outerWidth
                                    && e.screenY >= w2.screenY && e.screenY <= w2.screenY + w2.outerHeight) {
                                overZoteroWin = true; break;
                            }
                        }
                    } catch (er2) {}
                }
                if (gd && gd.groupID === groupID && !cancelled && !overZoteroWin) {
                    try { p._wvTabGroupMoveToNewWindow(win, groupID); } catch (er2) {}
                }
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

    /** The window where a group currently "lives" — the window with the most
     *  open tabs STAMPED with this group (null if none are open anywhere).
     *  Per-tab / single-window model: a live group's tabs are all in one window. */
    _wvTabGroupHomeWin(groupID: any) {
        try {
            let best: any = null, bestCount = 0;
            const counts = new Map<any, number>();
            this._wvTabGroupForEachOpenTab((t, w) => {
                if (this._wvTabGroupStamp(t) === groupID) counts.set(w, (counts.get(w) || 0) + 1);
            });
            for (const [w, n] of counts) { if (n > bestCount) { best = w; bestCount = n; } }
            return best;
        } catch (e) { return null; }
    }

    /** Send ONE tab to the group's home window: add the key (so it renders
     *  grouped on arrival), close it here, reopen it there. Main targets ride
     *  _wvMoveTabBetweenMains (focus-then-open + slot poll); reader targets
     *  mount into the deck next to the group's last member. */
    _wvTabGroupSendTabToWin(srcWin: any, tabID: any, tgtWin: any, groupID: any, opts?: any) {
        try {
            const Z: any = srcWin.Zotero_Tabs;
            const tab = Z && Z._tabs.find((t: any) => t.id === tabID);
            const key = tab && (this as any)._tabPinKey(tab);
            if (!key) return;
            this._tabGroupAddKey(groupID, key);
            const itemID = tab.data && tab.data.itemID;
            if (itemID == null) return;
            // Prefix match: a main-window note tab can be note-unloaded /
            // note-loading — the strict === "note" typed an unloaded note as a
            // READER on arrival, which wedges at "Loading..." forever (the
            // reader hook can't load a note).
            const isNote = String(tab.type || "").indexOf("note") === 0;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (this._wvTabGroupIsReaderWin(tgtWin)) {
                // MOUNT FIRST; close the source only after the stamped arrival
                // exists (Firefox rule: never destroy the original before the
                // replacement is alive). The old order (close → async mount →
                // stamp-by-id) could lose the tab on a mount failure, and a
                // missed id lookup once left a duplicated, UNSTAMPED copy in
                // the reader window with the source still open (2026-07-03).
                tgtWin.setTimeout(async () => {
                    let mounted = false;
                    try {
                        // allowDuplicate: MOVE of an explicit tab; STAMP the arrival
                        // directly so a duplicate of a member's item joins as its own
                        // member (no reliance on the first-come claim pass).
                        const newId = await (this as any)._wvWTMountTab(tgtWin, itemID, { allowDuplicate: true, select: false, await: true });
                        const st = tgtWin._wvWT;
                        if (st && st.tabs) {
                            // Stamp by id, falling back to the newest tab of this
                            // item (mount/render can reshuffle ids) — the arrival
                            // must never sit ungrouped in the target window.
                            let nt = st.tabs.find((t: any) => t.id === newId);
                            if (!nt) { for (let i = st.tabs.length - 1; i >= 0; i--) { if (st.tabs[i].itemID === itemID) { nt = st.tabs[i]; break; } } }
                            if (nt) {
                                this._wvTabGroupSetStamp(nt, groupID);
                                mounted = true;
                            }
                            // Reposition the arrival right after the group's last member.
                            const idx = nt ? st.tabs.indexOf(nt) : -1;
                            let lastMember = -1;
                            for (let i = 0; i < st.tabs.length; i++) {
                                if (i === idx) continue;
                                if (this._wvTabGroupStamp(st.tabs[i]) === groupID) lastMember = i;
                            }
                            if (idx >= 0 && lastMember >= 0 && idx !== lastMember + 1) {
                                const [moved] = st.tabs.splice(idx, 1);
                                st.tabs.splice(idx < lastMember ? lastMember : lastMember + 1, 0, moved);
                            }
                            try { (this as any)._wvWTRenderStrip(tgtWin); } catch (e) {}
                            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
                        }
                    } catch (e) { Zotero.debug("[Weavero] sendTabToWin(reader) mount err: " + e); }
                    // Close the source ONLY on success; otherwise the user keeps
                    // the original (no silent loss, no duplicate).
                    if (mounted) { try { Z.close(tabID); } catch (e) {} }
                    try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
                }, 180);
            } else {
                // Slot: right after the group's last open member in the target.
                let targetIndex = 1;
                try {
                    const TZ: any = tgtWin.Zotero_Tabs;
                    for (let i = 1; i < ((TZ && TZ._tabs) || []).length; i++) {
                        if (this._wvTabGroupStamp(TZ._tabs[i]) === groupID) targetIndex = i + 1;
                    }
                } catch (e) {}
                const payload = { itemID, sourceTabId: tabID, readerType: isNote ? "note" : undefined };
                (this as any)._wvClassicMoveTabBetweenMains(srcWin, tgtWin, payload, targetIndex, 0, opts);
                // STAMP THE ARRIVAL DIRECTLY (retrying until the moved tab
                // lands). The old flow relied on the CLAIM PASS finding the
                // item-key in the members shadow — but the shadow SYNC in
                // _applyTabGroups prunes members to currently-stamped tabs, so
                // any apply pass firing during the async move stripped the key
                // first and the arrival landed UNGROUPED in the target window
                // (how RT-B ended up split across two windows, 2026-07-03).
                const stampArrival = (attempt: number) => {
                    try {
                        const TZ: any = tgtWin.Zotero_Tabs;
                        let nt: any = null;
                        for (let i = ((TZ && TZ._tabs) || []).length - 1; i >= 1; i--) {
                            const t = TZ._tabs[i];
                            if (t && t.data && t.data.itemID === itemID && !this._wvTabGroupStamp(t)) { nt = t; break; }
                        }
                        if (nt) {
                            this._wvTabGroupSetStamp(nt, groupID);
                            this._tabGroupAddKey(groupID, (this as any)._tabPinKey(nt));
                            try { this._wvTabGroupStabilize(tgtWin); } catch (e) {}
                            try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
                        } else if (attempt < 10) {
                            tgtWin.setTimeout(() => stampArrival(attempt + 1), 300);
                        } else {
                            Zotero.debug("[Weavero] sendTabToWin(main): arrival never landed for item " + itemID);
                        }
                    } catch (e) {}
                };
                tgtWin.setTimeout(() => stampArrival(0), 300);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupSendTabToWin err: " + e); }
    }

    /** Add the tab to a group AND move it adjacent to the group's last open
     *  member (one-time positioning, like _pinTabByCommand). When the group
     *  lives in ANOTHER window, the tab moves there instead — a group never
     *  spans windows. */
    _wvTabGroupAddTab(win: any, tabID: any, groupID: any, desiredIndex?: number) {
        try {
            const Z_Tabs: any = win.Zotero_Tabs;
            const tab = Z_Tabs && Z_Tabs._tabs.find((t: any) => t.id === tabID);
            const key = tab && (this as any)._tabPinKey(tab);
            if (!key) return;
            // Firefox model for a SAVED (parked) group (tabbrowser.js
            // `addTabsToSavedGroup`): file the tab into the group's stored members
            // and CLOSE it — the group stays parked. The tab returns only when the
            // whole group is reopened; we never reopen the group on add.
            const savedGrp = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (savedGrp && (savedGrp as any).saved) {
                this._tabGroupAddKey(groupID, key);
                try { Z_Tabs.close(tabID); } catch (e) {}
                try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
                return;
            }
            const home = this._wvTabGroupHomeWin(groupID);
            if (home && home !== win) {
                this._wvTabGroupSendTabToWin(win, tabID, home, groupID);
                return;
            }
            this._wvTabGroupSetStamp(tab, groupID);   // per-tab membership (authoritative)
            this._tabGroupAddKey(groupID, key);       // item-key shadow (saved/restart fallback)
            // Position. `desiredIndex` (from a precise popup drop) → clamp into
            // the group's contiguous run so the tab lands where the user aimed
            // WITHOUT splitting the group; else directly after the last member.
            try {
                let firstIdx = -1, lastIdx = -1, curIdx = -1, lastPinnedInGroup = -1;
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    if (t.id === tabID) { curIdx = i; continue; }   // exclude self
                    if (this._wvTabGroupStamp(t) === groupID) {
                        if (firstIdx < 0) firstIdx = i;
                        lastIdx = i;
                        const k2 = (this as any)._tabPinKey(t);
                        if (k2 && this._pinnedTabsHas(k2.libraryID, k2.itemKey)) lastPinnedInGroup = i;
                    }
                }
                if (lastIdx >= 0 && typeof Z_Tabs.move === "function") {
                    let target: number;
                    if (typeof desiredIndex === "number" && firstIdx >= 0) {
                        // Keep the drop within [firstMember, lastMember+1] so the
                        // group stays one run.
                        target = Math.max(firstIdx, Math.min(desiredIndex, lastIdx + 1));
                    } else {
                        target = lastIdx + 1;
                    }
                    // Pinned-first invariant: an UNPINNED tab can't land before a
                    // pinned member of the same group (Zotero forbids an unpinned
                    // tab left of a pinned one).
                    const dragPinned = this._pinnedTabsHas(key.libraryID, key.itemKey);
                    if (!dragPinned && lastPinnedInGroup >= 0) target = Math.max(target, lastPinnedInGroup + 1);
                    if (curIdx >= 0 && curIdx < target) target--;   // removal shift
                    this._wvTGDbg("addTab: gid=" + String(groupID).slice(-4) + " desired=" + desiredIndex
                        + " run=[" + firstIdx + "," + lastIdx + "] pinnedInGrp=" + lastPinnedInGroup
                        + " dragPinned=" + dragPinned + " → move to " + target);
                    Z_Tabs.move(tabID, target);
                }
            } catch (e) {}
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupAddTab err: " + e); }
    }

    /** Move a tab to a chosen destination. `srcWin` hosts the tab; `tabId` is its
     *  id (a main-window Zotero_Tabs id OR a reader-window `_wvWT` id). `target` is
     *  `{ win, isReader, groupId? }` (as produced by `_wvOpenInTargetWindows()` plus
     *  the group entries). With a `groupId` the tab lands in that group (groups live
     *  in a MAIN window — the group's home); otherwise it's a loose move to the
     *  window. Covers every source/target combination. */
    async _wvMoveTabToTarget(srcWin: any, tabId: any, target: any) {
        try {
            if (!srcWin || tabId == null || !target) return;
            const tgtWin = target.win;
            const tgtIsReader = !!target.isReader;
            const srcIsReader = !!(srcWin && srcWin._wvWT);
            // Popup-initiated move: land the tab in the BACKGROUND — don't
            // select it in the target, don't focus the target window; the
            // user stays on their current tab.
            const noFocus = !!target.noFocus;

            // "New Group in this window" → create one (empty name, next colour),
            // then move into it as a normal group target. Groups live in main
            // windows only.
            if (target.newGroup && !tgtIsReader) {
                // Memoise on the shared target object so a sequenced multi-select all
                // joins the SAME new group (one click → one group, N tabs).
                if (!target._wvMainGroupId) {
                    const g = this._tabGroupCreate("", this._wvTabGroupNextColor());
                    target._wvMainGroupId = g.id;
                }
                return await this._wvMoveTabToTarget(srcWin, tabId, { win: tgtWin, isReader: false, groupId: target._wvMainGroupId });
            }
            const groupId = target.groupId || null;

            // Resolve the item + note-ness from the source tab.
            let itemID: any = null, isNote = false;
            if (srcIsReader) {
                const t = (srcWin._wvWT.tabs || []).find((x: any) => x.id === tabId);
                if (!t) return;
                itemID = t.itemID; isNote = (t.type === "note");
            } else {
                const Z = srcWin.Zotero_Tabs;
                const t = Z && Z._tabs.find((x: any) => x.id === tabId);
                if (!t || t.id === "zotero-pane" || t.type === "library") return;
                itemID = t.data && t.data.itemID; isNote = !!(t.type && String(t.type).indexOf("note") !== -1);
            }
            if (itemID == null) return;

            // ---- GROUP target — groups live in a MAIN window (the home) ----
            if (groupId) {
                const grp = this._tabGroupsGet().find((x: any) => x.id === groupId);
                const isSaved = !!(grp && (grp as any).saved);
                const homeWin = this._wvTabGroupHomeWin(groupId) || (isSaved ? null : tgtWin);
                // CLOSED (saved/parked) group → file the tab's item into the group's
                // stored members and close it (Firefox addTabsToSavedGroup model); the
                // group stays parked. No live home window to move into.
                if (isSaved && !homeWin) {
                    if (srcIsReader) {
                        try {
                            const item: any = Zotero.Items.get(itemID);
                            if (item) this._tabGroupAddKey(groupId, { libraryID: item.libraryID, itemKey: item.key });
                        } catch (e) {}
                        try { (this as any)._wvWTCloseTab(srcWin, tabId); } catch (e) {}
                        try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
                    } else {
                        this._wvTabGroupAddTab(srcWin, tabId, groupId);   // handles saved → file + close
                    }
                    return;
                }
                if (!homeWin) return;
                if (srcIsReader) {
                    this._wvMoveReaderTabToMainGroup(srcWin, tabId, itemID, homeWin, groupId, { noFocus });
                } else if (srcWin === homeWin) {
                    this._wvTabGroupAddTab(srcWin, tabId, groupId, target.index);    // already home → group it at the precise slot
                } else {
                    this._wvTabGroupSendTabToWin(srcWin, tabId, homeWin, groupId, { noFocus });   // other main → home + stamp
                }
                return;
            }

            // ---- LOOSE move to a window ----
            if (tgtIsReader) {
                // "New Group" in a reader window: reader windows DO host groups
                // (wvGroupId stamps). Create one group, memoised on the shared
                // target object so a sequenced multi-select all lands in the SAME
                // group; mount the tab here if it isn't already, then stamp it.
                if (target.newGroup) {
                    if (!target._wvReaderGroupId) {
                        try { const g = this._tabGroupCreate("", this._wvTabGroupNextColor()); target._wvReaderGroupId = g.id; } catch (e) {}
                    }
                    const gid = target._wvReaderGroupId;
                    let newId: any = tabId;
                    if (srcWin !== tgtWin) {
                        newId = null;
                        try { newId = await this._wvWTMountTab(tgtWin, itemID, { allowDuplicate: true, select: !noFocus, await: true }); } catch (e) {}
                        try { if (srcIsReader) this._wvWTCloseTab(srcWin, tabId); else srcWin.Zotero_Tabs.close(tabId); } catch (e) {}
                    }
                    if (gid != null && newId != null) { try { this._wvReaderStampTabGroup(tgtWin, newId, gid); } catch (e) {} }
                    return;
                }
                if (srcWin === tgtWin) {
                    // SAME reader window → reorder to the precise slot (the popup
                    // has no native reader-row drag, so Weavero does it here).
                    if (target.index != null) {
                        try {
                            const st = tgtWin._wvWT;
                            if (st && st.tabs) {
                                const from = st.tabs.findIndex((t: any) => String(t.id) === String(tabId));
                                if (from >= 0) {
                                    const [m] = st.tabs.splice(from, 1);
                                    // Adjust for the removal when inserting later in the array.
                                    let to = Math.min(target.index, st.tabs.length);
                                    if (from < target.index) to = Math.max(0, to - 1);
                                    st.tabs.splice(to, 0, m);
                                    try { (this as any)._wvWTStabilizePinned(st); } catch (e) {}
                                    try { (this as any)._wvWTRenderStrip(tgtWin); } catch (e) {}
                                    try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
                                }
                            }
                        } catch (e) {}
                    }
                    return;
                }
                let newRId: any = null;
                try { newRId = await this._wvWTMountTab(tgtWin, itemID, { allowDuplicate: true, select: !noFocus, await: true }); } catch (e) {}
                // Precise slot from the popup: move the just-mounted tab there.
                if (target.index != null) {
                    try {
                        const st = tgtWin._wvWT;
                        if (st && st.tabs) {
                            let from = (newRId != null) ? st.tabs.findIndex((t: any) => String(t.id) === String(newRId)) : -1;
                            if (from < 0) { for (let i = st.tabs.length - 1; i >= 0; i--) { if (st.tabs[i].itemID === itemID) { from = i; break; } } }
                            if (from >= 0) {
                                const [m] = st.tabs.splice(from, 1);
                                st.tabs.splice(Math.min(target.index, st.tabs.length), 0, m);
                                try { (this as any)._wvWTRenderStrip(tgtWin); } catch (e) {}
                                try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
                            }
                        }
                    } catch (e) {}
                }
                try { if (srcIsReader) this._wvWTCloseTab(srcWin, tabId); else srcWin.Zotero_Tabs.close(tabId); } catch (e) {}
            } else if (srcIsReader) {
                this._wvWTMoveTabToMain(srcWin, tabId, tgtWin, { noFocus });         // reader → main window
            } else {
                if (srcWin === tgtWin) {
                    // SAME main window → reorder via native move (for an
                    // other-window row dragged within the main popup; the
                    // panel's OWN current-window tab uses native per-row drag).
                    if (target.index != null) {
                        try {
                            const Z2 = tgtWin.Zotero_Tabs;
                            if (Z2 && typeof Z2.move === "function") Z2.move(tabId, target.index);
                        } catch (e) {}
                    }
                    return;
                }
                const Z = tgtWin.Zotero_Tabs;
                // Precise drop index from the popup (after the anchor tab); else end.
                const targetIndex = (target.index != null)
                    ? target.index
                    : ((Z && Z._tabs) ? Z._tabs.length : 1);
                // maxOtherPinned = 0 so the moved tab is never auto-pinned.
                this._wvMoveTabBetweenMains(srcWin, tgtWin,
                    { itemID, sourceTabId: tabId, readerType: isNote ? "note" : undefined }, targetIndex, 0, { noFocus });
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMoveTabToTarget err: " + e); }
    }

    /** reader-window tab → a tab GROUP: move it to the group's home main window,
     *  then file the freshly-landed tab into the group (found by diffing the home
     *  window's tab ids against a pre-move snapshot). */
    _wvMoveReaderTabToMainGroup(srcReaderWin: any, tabId: any, itemID: any, homeWin: any, groupId: any, opts?: any) {
        try {
            const Z = homeWin.Zotero_Tabs;
            const before = new Set((Z && Z._tabs ? Z._tabs : []).map((t: any) => t.id));
            this._wvWTMoveTabToMain(srcReaderWin, tabId, homeWin, opts);
            let tries = 0;
            const land = () => {
                try {
                    const z = homeWin.Zotero_Tabs;
                    const nw = z && z._tabs.find((t: any) => !before.has(t.id) && t.data && t.data.itemID === itemID);
                    if (nw) { this._wvTabGroupAddTab(homeWin, nw.id, groupId); return; }
                } catch (e) {}
                if (tries++ < 30) (homeWin.setTimeout || setTimeout)(land, 80);
            };
            land();
        } catch (e) { Zotero.debug("[Weavero] _wvMoveReaderTabToMainGroup err: " + e); }
    }

    /** Append the FLAT "move to a window / group" targets into `popup` (a XUL
     *  <menupopup>) — same look as the "Open … in" menu: each window is a ROW with
     *  its window icon (main = blue-tab, reader = plain frame), and its tab groups +
     *  "New Group" sit indented beneath it. Clicking a window row moves the tab there
     *  (loose); the SOURCE window is a disabled header (you can't loose-move where it
     *  already is) but its groups stay valid. Every injected node is tagged
     *  `.wv-mv-target` so callers can clear+rebuild on popupshowing; pass `beforeNode`
     *  to insert before it. `onPick({win,isReader,groupId,newGroup})` runs on
     *  selection. Returns the number of rows added. Shared by both tab menus. */
    _wvBuildMoveTargetsInto(doc: any, popup: any, srcWin: any, onPick: (t: any) => void, beforeNode?: any): number {
        let added = 0;
        try {
            const groupsEnabled = this._getEnableTabGroups ? !!this._getEnableTabGroups() : true;
            const targets = this._wvOpenInTargetWindows();
            // Put the SOURCE window at the TOP — its "(here)" entry should head
            // the list (esp. in a reader window, where it otherwise sank below
            // the main windows).
            try {
                const si = targets.findIndex((t: any) => t.win === srcWin);
                if (si > 0) { const [s] = targets.splice(si, 1); targets.unshift(s); }
            } catch (e) {}
            const groups = (this._tabGroupsGet ? this._tabGroupsGet() : [])
                .filter((g: any) => g && !g.saved && this._wvTabGroupHomeWin(g.id));
            const dark = !!(this._detectUIDark && this._detectUIDark());
            const mainIcon = this._wvMainWindowIconURI ? this._wvMainWindowIconURI(dark) : "";
            const readerIcon = this._wvWindowIconURI ? this._wvWindowIconURI(dark) : "";
            const plusIcon = this._wvPlusIconURI ? this._wvPlusIconURI(dark) : "";
            const newWinIcon = this._wvNewWindowIconURI ? this._wvNewWindowIconURI(dark) : "";
            const newReaderWinIcon = this._wvNewReaderWindowIconURI ? this._wvNewReaderWindowIconURI(dark) : readerIcon;
            const INDENT = "padding-inline-start: 1.7em;";
            const place = (el: any) => {
                el.classList.add("wv-mv-target");
                if (beforeNode && beforeNode.parentNode === popup) popup.insertBefore(el, beforeNode);
                else popup.appendChild(el);
            };
            for (const t of targets) {
                const w = t.win;
                const isSrc = (w === srcWin);
                // The source window is shown as a disabled "(here)" header (main AND
                // reader), so the current window is always visible in the list.
                // Window row (icon + name). Source = disabled header; others move here.
                const wi = doc.createXULElement("menuitem");
                wi.classList.add("menuitem-iconic");
                wi.setAttribute("label", t.name + (isSrc ? "  (here)" : ""));
                try { if (t.isReader ? readerIcon : mainIcon) wi.setAttribute("image", t.isReader ? readerIcon : mainIcon); } catch (e) {}
                if (isSrc) wi.setAttribute("disabled", "true");
                else wi.addEventListener("command", () => { try { onPick({ win: w, isReader: t.isReader, groupId: null }); } catch (e) {} });
                place(wi);
                added++;
                // Groups + "New Group", indented under the window. Main windows list
                // their existing groups too; reader windows host groups (wvGroupId
                // stamps) but only offer "New Group" there — moving into an existing
                // reader-homed group would go through the main-home group path, out
                // of scope here.
                if (groupsEnabled) {
                    if (!t.isReader) {
                        const winGroups = groups.filter((g: any) => this._wvTabGroupHomeWin(g.id) === w);
                        for (const g of winGroups) {
                            const gi = doc.createXULElement("menuitem");
                            gi.classList.add("menuitem-iconic");
                            gi.setAttribute("label", g.name || "Group");
                            gi.setAttribute("style", INDENT);
                            try { gi.setAttribute("image", this._wvGroupColorDotURI(this._tabGroupColorHex(g.color))); } catch (e) {}
                            const gid = g.id;
                            gi.addEventListener("command", () => { try { onPick({ win: w, isReader: false, groupId: gid }); } catch (e) {} });
                            place(gi);
                        }
                    }
                    const isRdr = t.isReader;
                    const ng = doc.createXULElement("menuitem");
                    ng.classList.add("menuitem-iconic");
                    ng.setAttribute("label", "New Group");
                    ng.setAttribute("style", INDENT);
                    try { if (plusIcon) ng.setAttribute("image", plusIcon); } catch (e) {}
                    ng.addEventListener("command", () => { try { onPick({ win: w, isReader: isRdr, newGroup: true }); } catch (e) {} });
                    place(ng);
                }
            }
            // Bottom — move the tab(s) into a BRAND-NEW window, reader or main, each
            // with an indented "+ New Group" variant. Identical in every window's
            // Move Tab menu (replaces the old per-menu "Move to New Window"). The
            // reader-window icon for the reader option, the main "+window" icon for
            // the main option (same icons as the items "Open in" menu).
            const nwSep = doc.createXULElement("menuseparator");
            place(nwSep);
            const mkBottom = (label: string, icon: string, pick: () => void) => {
                const mi = doc.createXULElement("menuitem");
                mi.classList.add("menuitem-iconic");
                mi.setAttribute("label", label);
                try { if (icon) mi.setAttribute("image", icon); } catch (e) {}
                mi.addEventListener("command", () => { try { pick(); } catch (e) {} });
                place(mi); added++;
            };
            const mkBottomGroup = (pick: () => void) => {
                if (!groupsEnabled) return;
                const ng = doc.createXULElement("menuitem");
                ng.classList.add("menuitem-iconic");
                ng.setAttribute("label", "New Group");
                ng.setAttribute("style", INDENT);
                try { if (plusIcon) ng.setAttribute("image", plusIcon); } catch (e) {}
                ng.addEventListener("command", () => { try { pick(); } catch (e) {} });
                place(ng);
            };
            mkBottom("Move to New Reader Window", newReaderWinIcon, () => onPick({ newReaderWindow: true }));
            mkBottomGroup(() => onPick({ newReaderWindow: true, newGroup: true }));
            mkBottom("Move to New Main Window", newWinIcon, () => onPick({ newMainWindow: true }));
            mkBottomGroup(() => onPick({ newMainWindow: true, newGroup: true }));
        } catch (e) { Zotero.debug("[Weavero] _wvBuildMoveTargetsInto err: " + e); }
        return added;
    }

    _wvTabGroupCloseTabs(win: any, groupID: any) {
        try {
            const groups = this._tabGroupsGet();
            const g = groups.find((x: any) => x.id === groupID);
            if (!g) return;
            // Record for "Reopen Closed Group" (Ctrl+Shift+T): the group def is
            // about to be deleted, so snapshot name/color/members to recreate it.
            try { (this as any)._wvClosedPush({ kind: "group", groupID, name: g.name, color: g.color, members: (g.members || []).map((m: any) => ({ libraryID: m.libraryID, itemKey: m.itemKey })) }); } catch (e) {}
            // Close the group's tabs by per-tab STAMP (exact tabs — a duplicate
            // copy that isn't a member is left open). Single-window: a live
            // group's tabs are in one window; act on the home window.
            const homeWin = this._wvTabGroupHomeWin(groupID) || win;
            if (this._wvTabGroupIsReaderWin(homeWin) && homeWin._wvWT) {
                const ids = homeWin._wvWT.tabs
                    .filter((t: any) => this._wvTabGroupStamp(t) === groupID)
                    .map((t: any) => t.id);
                for (const id of ids) { try { (this as any)._wvWTCloseTab(homeWin, id); } catch (e) {} }
            } else {
                const Z_Tabs: any = homeWin.Zotero_Tabs;
                const ids: string[] = [];
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    if (this._wvTabGroupStamp(Z_Tabs._tabs[i]) === groupID) ids.push(Z_Tabs._tabs[i].id);
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
            // Firefox-style sliding gap. We never reorder during the drag (that
            // races the chip system and corrupts groups); instead dragover
            // slides the other tabs aside (transforms only) to open a gap at the
            // cursor, and the real move commits on drop. Capture the grab offset
            // + width for the cursor→slot math (deferred to after the multi-drag
            // stow below, so stowed followers are excluded from the geometry).
            win._wvDragGrab = null;
            win._wvDragWidth = null;
            if (tabNode && win._wvTabGroupDragTabID && win._wvTabGroupDragTabID !== "zotero-pane") {
                try {
                    const r = tabNode.getBoundingClientRect();
                    win._wvDragGrab = e.clientX - r.left;
                    win._wvDragWidth = r.width;
                } catch (erG) {}
            }
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
            // Give the drag a proper ghost (a tab image that follows the
            // cursor), then collapse the dragged slot and snapshot the bar so
            // dragover can slide a gap open. Done after the multi-drag stow so
            // followers (now zero-width) are excluded from the geometry.
            if (tabNode && win._wvTabGroupDragTabID && win._wvTabGroupDragTabID !== "zotero-pane") {
                try { this._wvSuppressOSGhost(win, e); } catch (erI) {}
                try { this._wvDragCacheGeom(win, win._wvTabGroupDragTabID, win._wvDragGrab, win._wvDragWidth); } catch (erC) {}
            }
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
                || this._wvTabGroupStamp(t)) {   // per-tab: a duplicate whose twin is grouped is itself groupable
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
            const groups = this._tabGroupsGet();
            const color = WV_GROUP_COLORS[groups.length % WV_GROUP_COLORS.length].id;
            const g = this._tabGroupCreate("", color);
            // Per-tab: STAMP both specific tabs into the new group. Dragging a tab
            // onto its OWN DUPLICATE (same item) must group BOTH copies — the old
            // item-key + claim-pass route stamped only one (first-come per item).
            // StampJoin also moves the dragged tab out of any prior group.
            this._wvTabGroupStampJoin(tt, g.id);
            this._wvTabGroupStampJoin(dt, g.id);
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
                try { this._wvTabGroupDwellTrack(win, e); } catch (er) {}
                // Slide a gap open at the cursor (transforms only — NO reorder,
                // so groups can't corrupt; the move commits on drop). Then BLOCK
                // Zotero's own dragover handler — its index math mis-fires with
                // collapsed groups (moves the model index nowhere near the
                // cursor, only transforms the tab visually → the gap opens in
                // the wrong place and groups appear split). Our listener is
                // capture-phase on #tab-bar-container (an ancestor of React's
                // root), so stopPropagation keeps the event from reaching
                // Zotero's bubble-phase handler.
                try { this._wvOpenGap(win, e.clientX); } catch (er) {}
                try {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    e.stopPropagation();
                } catch (er) {}
                return;
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
            // A tab-move drop that reaches THIS capture-phase handler landed
            // inside #tab-bar-container (it's the only element it's wired on), so
            // the tab landed on a strip — never a tear-off. Suppress the source
            // window's dragend tear-off unconditionally here. This is what fixes
            // "drag out over another window and back, then drop on the original
            // strip → splits into a reader window": the per-window cross-main drop
            // handler only sets the flag when src !== win, and the dragend
            // coordinate fallback is unreliable once the cursor has left and
            // re-entered the bar (dragleave nulled _wvTabDragLastX/Y).
            try {
                const t0 = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
                if (t0.indexOf("application/x-weavero-tab-move") >= 0) {
                    (this as any)._wvSuppressNextTearOff = true;
                }
            } catch (er0) {}
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
                                    readerType: String(t.type || "").indexOf("note") === 0 ? "note" : "",
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
                                            (this as any)._wvClassicMoveTabBetweenMains(srcWin, win, m, idx, 0);
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
                // Compute the slot BEFORE unhiding: the drop x was aimed at the
                // compressed strip (members hidden while the group travels);
                // unhiding first re-expands the layout and the same x lands in
                // the wrong slot (observed: drop-to-end became a no-op). The
                // mover skips member rects, so hidden members don't distort it.
                this._wvTabGroupMoveGroupTo(win, gd.groupID, e.clientX);
                try { this._wvGrpDragSetMembersHidden(gd.sourceWin, gd.groupID, false); } catch (er) {}
            } else {
                try { this._wvGrpDragSetMembersHidden(gd.sourceWin, gd.groupID, false); } catch (er) {}
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
            // Close the visual gap (un-collapse the dragged slot, drop the
            // transforms) before committing the real move. Keeps _wvGapResult.
            try { this._wvClearGap(win); } catch (eG) {}
            // Reliable drop X: the dragleave handler nulls _wvTabDragLastX
            // whenever the pointer grazes outside the bar, which happens even on
            // an in-bar drop — so trust the dragend release point when it's
            // inside the bar, falling back to the last tracked dragover x. Stays
            // null only for a genuine tear-off (released off the bar).
            let dropX: number | null = null;
            try {
                const cont = win.document.getElementById("tab-bar-container");
                const cr = cont && cont.getBoundingClientRect();
                if (e && typeof e.clientX === "number" && cr
                        && e.clientX >= cr.left && e.clientX <= cr.right
                        && e.clientY >= cr.top && e.clientY <= cr.bottom) {
                    dropX = e.clientX;
                } else if (typeof win._wvTabDragLastX === "number") {
                    dropX = win._wvTabDragLastX;
                }
            } catch (ex) {}
            win._wvTabDropX = dropX;
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
                    // Commit the previewed gap slot + membership (in-bar drop
                    // only — a tear-off leaves _wvTabDropX null).
                    try { if (typeof win._wvTabDropX === "number") this._wvCommitGapDrop(win, tabID); } catch (e3) {}
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

    /** Hide the OS drag ghost (an empty dashed box in the title-bar strip —
     *  Gecko won't render a useful one there). The dragged tab itself follows
     *  the cursor via our own transform in _wvOpenGap, so we want the OS ghost
     *  gone: a 1×1 transparent canvas does it. */
    _wvSuppressOSGhost(win: any, e: any) {
        try {
            if (!e || !e.dataTransfer || typeof e.dataTransfer.setDragImage !== "function") return;
            const c = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            c.width = 1; c.height = 1;
            e.dataTransfer.setDragImage(c, 0, 0);
        } catch (er) {}
    }

    /** Snapshot the bar for the sliding-gap drag. We do NOT collapse or reorder
     *  anything (that races the chip system): the dragged tab stays in place and
     *  is lifted (z-index, transform→cursor) so it floats like Firefox's tab;
     *  the OTHER tabs shift to close its origin slot and open the landing gap.
     *  Record the dragged tab's origin edges, every other tab/chip's NATURAL
     *  left, and group-aware "units" (a collapsed group = one block). Cached
     *  once — only transforms change during the drag, so positions stay valid. */
    _wvDragCacheGeom(win: any, tabID: any, grab: any, width: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            const doc = win.document;
            const tabsBox = doc.querySelector("#tab-bar-container .tabs-wrapper .tabs")
                || doc.querySelector("#tab-bar-container .tabs");
            if (!Z || !Z._tabs || !tabsBox) { win._wvDragGeom = null; return; }
            const draggedEl = tabsBox.querySelector('.tab[data-id="' + tabID + '"]');
            if (!draggedEl) { win._wvDragGeom = null; return; }
            const dr = draggedEl.getBoundingClientRect();
            const gapWidth = (typeof width === "number" && width) || dr.width;
            // Lift the dragged tab: floats above, follows the cursor instantly
            // (no transition), and doesn't intercept dragover hit-testing.
            draggedEl.style.transition = "none";
            draggedEl.style.zIndex = "10";
            draggedEl.style.position = "relative";
            draggedEl.style.pointerEvents = "none";
            const groups = this._tabGroupsGet();
            const groupOf = (t: any) => { const gid = this._wvTabGroupStamp(t); return gid ? (groups.find((g: any) => g.id === gid && !(g as any).saved) || null) : null; };
            const groupById: any = {};
            for (const g of groups) groupById[g.id] = g;
            // First open-member Z._tabs index per group (where its chip sits).
            const firstZIdxOf: any = {};
            for (let i = 1; i < Z._tabs.length; i++) {
                const t = Z._tabs[i]; if (!t || t.id === tabID) continue;
                const g = groupOf(t); if (g && firstZIdxOf[g.id] === undefined) firstZIdxOf[g.id] = i;
            }
            // First non-pinned slot (a normal tab can't land before the pinned region).
            let firstNonPinnedZIdx = 1;
            while (firstNonPinnedZIdx < Z._tabs.length) {
                const t = Z._tabs[firstNonPinnedZIdx];
                const el = t && tabsBox.querySelector('.tab[data-id="' + t.id + '"]');
                if (el && el.classList.contains("wv-pinned-tab")) firstNonPinnedZIdx++; else break;
            }
            // Sliding elements (transforms) + Firefox-style drop elements (cursor
            // hit-test), in DOM order, excluding the dragged tab + hidden members.
            // Chips are first-class drop targets — a group "label" (Firefox's
            // dragAndDropElements). "After a chip" = first position INSIDE its group.
            const elems: Array<{ el: any; left: number }> = [];
            const dropEls: any[] = [];
            for (const el of Array.prototype.slice.call(tabsBox.children)) {
                if (el === draggedEl) continue;
                const isTabEl = !!(el.classList && el.classList.contains("tab"));
                const isChipEl = !!(el.classList && el.classList.contains("wv-tab-group-chip"));
                if (!isTabEl && !isChipEl) continue;
                const r = el.getBoundingClientRect();
                if (isTabEl && r.width < 1) continue;       // hidden collapsed member
                elems.push({ el, left: r.left });
                if (isTabEl) {
                    const id = el.getAttribute("data-id");
                    const zi = Z._tabs.findIndex((t: any) => t && t.id === id);
                    const t = zi >= 0 ? Z._tabs[zi] : null;
                    const g = t && groupOf(t);
                    dropEls.push({ left: r.left, right: r.right, mid: (r.left + r.right) / 2, kind: "tab", zIdx: zi, groupId: g ? g.id : null, pinned: el.classList.contains("wv-pinned-tab") });
                } else {
                    const gid = el.getAttribute("data-wv-group");
                    const g = groupById[gid];
                    dropEls.push({ left: r.left, right: r.right, mid: (r.left + r.right) / 2, kind: "chip", groupId: gid, collapsed: !!(g && g.collapsed), firstZIdx: firstZIdxOf[gid] });
                }
            }
            for (const e of elems) e.el.style.transition = "transform 0.12s ease";
            win._wvDragGeom = {
                gapWidth, grab: (typeof grab === "number" ? grab : gapWidth / 2), width: gapWidth,
                originLeft: dr.left, originRight: dr.right, elems, dropEls, draggedEl,
                endSlot: Z._tabs.length, draggedPinned: draggedEl.classList.contains("wv-pinned-tab"), firstNonPinnedZIdx,
            };
            win._wvGapResult = null;
        } catch (e) { win._wvDragGeom = null; }
    }

    /** Firefox-faithful drop resolution (mirrors Firefox's `_getDropIndex` in
     *  drag-and-drop.js): use the CURSOR over the element it is hovering — before
     *  or after that element's MIDDLE — NOT the dragged tab's center (which
     *  drifts for a wide tab over a narrow chip). Chips (group labels) are
     *  first-class drop elements, so "after a group's chip" lands the tab at the
     *  group's FIRST position, inside it. Positions are read in the origin-closed
     *  (effective) layout the user actually sees. Returns
     *  { slot, joinGroupId, collapsedJoin, insertionX }. */
    _wvComputeDrop(win: any, clientX: number) {
        const g = win._wvDragGeom;
        if (!g) return null;
        const eff = (d: any) => { const sh = (d.left >= g.originRight - 1) ? g.gapWidth : 0; return { left: d.left - sh, right: d.right - sh, mid: d.mid - sh }; };
        // A collapsed group's chip stands for the whole group: cursor over its
        // left half drops before it (outside), over its right half joins it.
        for (const d of g.dropEls) {
            if (d.kind !== "chip" || !d.collapsed) continue;
            const e = eff(d);
            if (clientX >= e.left && clientX <= e.right) {
                const slot = (d.firstZIdx != null ? d.firstZIdx : g.endSlot);
                if (clientX < e.mid) return { slot, joinGroupId: null, collapsedJoin: false, insertionX: d.left };
                return { slot, joinGroupId: d.groupId, collapsedJoin: true, insertionX: d.left };
            }
        }
        // Insertion index = number of element-middles left of the cursor.
        let insIdx = 0;
        for (const d of g.dropEls) { if (eff(d).mid < clientX) insIdx++; else break; }
        const prevEl = insIdx > 0 ? g.dropEls[insIdx - 1] : null;
        const nextEl = insIdx < g.dropEls.length ? g.dropEls[insIdx] : null;
        let slot;
        if (!nextEl) slot = g.endSlot;
        else if (nextEl.kind === "tab") slot = nextEl.zIdx;
        else slot = (nextEl.firstZIdx != null ? nextEl.firstZIdx : g.endSlot);   // before a chip → before its group
        if (!g.draggedPinned && slot < g.firstNonPinnedZIdx) slot = g.firstNonPinnedZIdx;
        // Membership: inside group G iff the insertion sits between G's
        // chip-or-member and one of G's members ("after the chip, before
        // member 1" = first position in the group).
        let joinGroupId: any = null;
        if (nextEl && nextEl.kind === "tab" && nextEl.groupId) {
            if (prevEl && prevEl.groupId === nextEl.groupId) joinGroupId = nextEl.groupId;
        }
        const insertionX = nextEl ? nextEl.left : (g.dropEls.length ? g.dropEls[g.dropEls.length - 1].right : -1);
        return { slot, joinGroupId, collapsedJoin: false, insertionX };
    }

    /** dragover: lift the dragged tab to the cursor and slide the others to open
     *  the gap at the cursor (transforms only — NO reorder). Uses _wvComputeDrop
     *  for the Firefox-style slot/membership, stores it in _wvGapResult, and
     *  tints the target group's chip. */
    _wvOpenGap(win: any, clientX: number) {
        try {
            const geom = win._wvDragGeom;
            if (!geom) return;
            const doc = win.document;
            const res = this._wvComputeDrop(win, clientX);
            if (!res) return;
            win._wvGapResult = res;
            // Lift the dragged tab under the cursor (grab-anchored).
            if (geom.draggedEl) {
                const tx = Math.round((clientX - geom.grab) - geom.originLeft);
                const tf = "translateX(" + tx + "px)";
                if (geom.draggedEl.style.transform !== tf) geom.draggedEl.style.transform = tf;
                // Carry the target group's underline while a join is pending.
                try {
                    if (res.joinGroupId) {
                        const g = this._tabGroupsGet().find((x: any) => x.id === res.joinGroupId);
                        const hex = g ? this._tabGroupColorHex(g.color) : "";
                        geom.draggedEl.setAttribute("data-wv-drag-join", "1");
                        if (hex) geom.draggedEl.style.setProperty("--wv-group-color", hex);
                    } else {
                        geom.draggedEl.removeAttribute("data-wv-drag-join");
                        geom.draggedEl.style.removeProperty("--wv-group-color");
                    }
                } catch (er) {}
            }
            // Tint the target group's chip when releasing would join it.
            const wantChip = res.joinGroupId ? ("wv-tgchip-" + res.joinGroupId) : null;
            if (win._wvJoinTargetChip && win._wvJoinTargetChip !== wantChip) {
                const pc = doc.getElementById(win._wvJoinTargetChip);
                if (pc) pc.classList.remove("wv-tg-join-target");
                win._wvJoinTargetChip = null;
            }
            if (wantChip) {
                const chip = doc.getElementById(wantChip);
                if (chip) { chip.classList.add("wv-tg-join-target"); win._wvJoinTargetChip = wantChip; }
            }
            // Slide the others: close the origin slot; open the landing gap
            // unless we're merging into a COLLAPSED group (no in-line gap then).
            const openLanding = !res.collapsedJoin && res.insertionX >= 0;
            for (const e of geom.elems) {
                // The Library tab is pinned at index 0 — never slide it (the drop
                // slot is already clamped past it in _wvComputeDrop, but the gap
                // preview would otherwise shove it right when the cursor goes far left).
                try { if (e.el && e.el.getAttribute && e.el.getAttribute("data-id") === "zotero-pane") continue; } catch (er) {}
                let dx = 0;
                if (e.left >= geom.originRight - 1) dx -= geom.gapWidth;                 // fill the origin slot
                if (openLanding && e.left >= res.insertionX - 1) dx += geom.gapWidth;    // open the landing gap
                const tf = dx ? ("translateX(" + dx + "px)") : "";
                if (e.el.style.transform !== tf) e.el.style.transform = tf;
            }
        } catch (e) {}
    }

    /** Drop/cancel: remove all gap transforms and un-lift the dragged tab.
     *  Leaves _wvGapResult in place for the commit. */
    _wvClearGap(win: any) {
        try {
            const geom = win._wvDragGeom;
            if (geom) {
                for (const e of geom.elems) { try { e.el.style.transform = ""; e.el.style.transition = ""; } catch (er) {} }
                if (geom.draggedEl) {
                    try {
                        const s = geom.draggedEl.style;
                        s.transform = ""; s.transition = ""; s.zIndex = ""; s.position = ""; s.pointerEvents = "";
                        geom.draggedEl.removeAttribute("data-wv-drag-join");
                        s.removeProperty("--wv-group-color");
                    } catch (er) {}
                }
            }
            win._wvDragGeom = null;
            if (win._wvJoinTargetChip) {
                const c = win.document.getElementById(win._wvJoinTargetChip);
                if (c) c.classList.remove("wv-tg-join-target");
                win._wvJoinTargetChip = null;
            }
        } catch (e) {}
    }

    /** Commit the previewed gap: move the dragged tab to the slot the gap showed
     *  and apply the previewed membership (join res.joinGroupId, or leave any
     *  group when dropped outside). Now that the drag is over nothing races the
     *  reorder. Zotero_Tabs.move() compensates for the removal internally
     *  (`if (newIndex > tabIndex) newIndex--`), so the insertion index is passed
     *  straight through (may be _tabs.length to append). */
    _wvCommitGapDrop(win: any, tabID: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            const res = win._wvGapResult; win._wvGapResult = null;
            if (!Z || !Z._tabs || typeof Z.move !== "function" || !res) return;
            const di = Z._tabs.findIndex((t: any) => t && t.id === tabID);
            if (di < 0) return;
            const target = Math.max(1, Math.min(res.slot, Z._tabs.length));
            if (target !== di) Z.move(tabID, target);
            // Membership straight from the previewed result (the gap already
            // showed it): join res.joinGroupId, else leave any current group.
            const t = Z._tabs.find((x: any) => x && x.id === tabID);
            if (t) {
                // STAMP-based current group (per-tab) so a DUPLICATE tab can join a
                // group that already contains its item via a twin.
                const gid = this._wvTabGroupStamp(t);
                const cur = gid ? this._tabGroupsGet().find((g: any) => g.id === gid && !(g as any).saved) : null;
                if (res.joinGroupId) {
                    if (!cur || cur.id !== res.joinGroupId) this._wvTabGroupStampJoin(t, res.joinGroupId);
                } else if (cur) {
                    this._wvTabGroupStampLeave(t, cur.id);
                }
            }
            this._wvTabGroupStabilize(win);
            this._wvTabGroupApplyEverywhere();
            this._wvTGDbg("gapDrop: → idx " + target + " (from " + di + ") join=" + (res.joinGroupId || "-"));
        } catch (e) { this._wvTGDbg("gapDrop ERR=" + e); }
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
            // The dragged tab's outcome (STAMP-based, per-tab) → followers inherit:
            // joined a group → all join (each stamped); left → all leave.
            const groups = this._tabGroupsGet();
            const draggedGid = this._wvTabGroupStamp(dragged);
            const g = draggedGid ? groups.find((x: any) => x.id === draggedGid && !(x as any).saved) : null;
            for (const oid of others) {
                const t = Z._tabs.find((x: any) => x && x.id === oid);
                if (!t) continue;
                if (g) this._wvTabGroupStampJoin(t, g.id);
                else { const fg = this._wvTabGroupStamp(t); if (fg) this._wvTabGroupStampLeave(t, fg); }
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
            const lastX = win._wvTabDropX;
            win._wvTabGroupRegions = null;            // clear the drag-time snapshot
            // Tear-off (dragged out of the window) leaves no in-bar position;
            // don't reconcile on a stale point — the target window owns it.
            if (typeof lastX !== "number") return;
            this._wvTGDbg("membership: tab=" + drag.tabID + " lastX=" + lastX);
            // MODEL rule (robust). The old geometric chip-region test compared
            // the release x against a layout that the mid-drag re-clustering had
            // already shifted, so the join silently missed and the group split.
            // Instead: the dragged tab JOINS a group iff it came to rest BETWEEN
            // two members of the SAME group — both its immediate neighbours in
            // the tab model belong to one group. Dropping at a group's edge (one
            // neighbour in it) or in open water leaves it ungrouped.
            // _wvTabGroupStabilize then heals any group the drag split by
            // passing the tab through it, preserving the dropped position
            // (membersOf() clusters in current model order).
            const di = Z_Tabs._tabs.findIndex((t: any) => t && t.id === drag.tabID);
            const groups2 = this._tabGroupsGet();
            // STAMP-based (per-tab): a neighbour / the dragged tab is "in" a group
            // by its own stamp, NOT its item key — so a DUPLICATE tab whose twin is
            // in a group is itself ungrouped until dropped in, and can be dropped in.
            const groupOfTab = (t: any) => {
                if (!t || t.id === "zotero-pane") return null;
                const gid = this._wvTabGroupStamp(t);
                return gid ? groups2.find((x: any) => x.id === gid && !(x as any).saved) : null;
            };
            const prevG = di > 0 ? groupOfTab(Z_Tabs._tabs[di - 1]) : null;
            const nextG = (di >= 0 && di + 1 < Z_Tabs._tabs.length) ? groupOfTab(Z_Tabs._tabs[di + 1]) : null;
            const curGroup = groupOfTab(tab);
            const targetG = (prevG && nextG && prevG.id === nextG.id) ? prevG : null;
            this._wvTGDbg("membership(model): prev=" + (prevG && prevG.id) + " next=" + (nextG && nextG.id)
                + " cur=" + (curGroup && curGroup.id) + " → target=" + (targetG && targetG.id));
            if (targetG) {
                if (!curGroup || curGroup.id !== targetG.id) {
                    this._wvTabGroupStampJoin(tab, targetG.id);   // stamps THIS tab (duplicate-safe)
                    this._wvTGDbg("membership: JOIN '" + (targetG.name || targetG.id) + "' (between its members)");
                }
            } else if (curGroup) {
                // Left its group's interior. A sole-member group travels with its
                // only tab (don't dissolve it); otherwise the tab leaves.
                const openCount = this._wvTabGroupOpenCount(curGroup.id);
                if (openCount > 1) {
                    this._wvTabGroupStampLeave(tab, curGroup.id);
                    this._wvTGDbg("membership: LEAVE '" + (curGroup.name || curGroup.id) + "' (dropped outside its members)");
                }
            }
            this._wvTabGroupStabilize(win);
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupHandleNativeDragEnd err: " + e); }
    }

    /** Firefox-style "the whole group travels": while a group CHIP drag is
     *  active, hide the group's member tabs in the source strip so the drop
     *  ghost is the single visible copy (previously only the chip's drag
     *  image moved and the tabs sat frozen until the drop). Attribute-based
     *  (survives React re-renders); cleared on drop/dragend. */
    _wvGrpDragSetMembersHidden(win: any, groupID: any, on: boolean) {
        try {
            const doc = win && win.document;
            const Z = win && win.Zotero_Tabs;
            if (!doc || !Z) return;
            for (const t of Z._tabs) {
                if (this._wvTabGroupStamp(t) !== groupID) continue;
                const node = doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"]');
                if (!node) continue;
                if (on) node.setAttribute("data-wv-grpdrag-hidden", "1");
                else node.removeAttribute("data-wv-grpdrag-hidden");
            }
        } catch (e) {}
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
            const memberIDs: string[] = [];
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                if (this._wvTabGroupStamp(t) === g.id) memberIDs.push(t.id);   // per-tab (duplicate-safe)
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

    /** Reader-window twin of _wvTabGroupMoveGroupTo: reorder a group's member
     *  tabs to a contiguous block at the slot under `clientX` (a coordinate in
     *  the reader strip), then re-render + persist. */
    _wvTabGroupReaderMoveGroupTo(win: any, groupID: any, clientX: number) {
        try {
            const st = win && win._wvWT;
            if (!st || !Array.isArray(st.tabs)) return -1;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return -1;
            const memberIDs: string[] = [];
            for (const t of st.tabs) { if (this._wvTabGroupStamp(t) === g.id) memberIDs.push(String(t.id)); }
            if (!memberIDs.length) return -1;
            const memberSet = new Set(memberIDs);
            const nonMembers: string[] = st.tabs.map((t: any) => String(t.id)).filter((id: string) => !memberSet.has(id));
            let slot = nonMembers.length;   // default: end
            try {
                const els = win.document.querySelectorAll(".wv-window-tabstrip .wv-window-tabs > .wv-window-tab[data-wv-tab-id]");
                for (const el of els) {
                    const id = el.getAttribute("data-wv-tab-id");
                    if (memberSet.has(id)) continue;
                    const r = el.getBoundingClientRect();
                    if (!r.width) continue;
                    if (clientX < r.left + r.width / 2) { const j = nonMembers.indexOf(id); if (j >= 0) { slot = j; break; } }
                }
            } catch (e) {}
            const desired = [...nonMembers.slice(0, slot), ...memberIDs, ...nonMembers.slice(slot)];
            const byId = new Map(st.tabs.map((t: any) => [String(t.id), t]));
            st.tabs = desired.map((id: string) => byId.get(id)).filter(Boolean);
            try { (this as any)._wvWTRenderStrip(win); } catch (e) {}
            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
            this._wvTabGroupApplyEverywhere();
            return slot;
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupReaderMoveGroupTo err: " + e); return -1; }
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
                const pinned = !!(k && (this as any)._pinnedTabsHas(k.libraryID, k.itemKey));
                // Only LOOSE pinned tabs form the leftmost boundary a moving group
                // can't cross. A GROUPED pinned tab (pinned-in-group is allowed)
                // travels with its own group, so it must NOT clamp another group's
                // move — that was blocking a group from being reordered before a
                // group containing a pinned member.
                if (pinned && !this._wvTabGroupStamp(t)) min = j + 1;
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
                return t ? (this._wvTabGroupStamp(t) || null) : null;
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
            const groupAt = (t: any) => this._wvTabGroupStamp(t) || null;   // per-tab
            const isPinned = (t: any) => { try { const k = (this as any)._tabPinKey(t); return !!(k && this._pinnedTabsHas(k.libraryID, k.itemKey)); } catch (e) { return false; } };
            const isLoosePinned = (t: any) => isPinned(t) && !groupAt(t);
            // CANONICAL tab order (this function is the single source of truth,
            // called on the common _applyTabGroups path so no operation can leave
            // a violating order):
            //   0. library (index 0, untouched)
            //   1. LOOSE pinned tabs (pinned + ungrouped) — the leftmost pinned
            //      cluster (a pin done anywhere else drifts here)
            //   2. the rest in place: each group as ONE contiguous run with its
            //      PINNED members first; loose unpinned tabs where they are
            const emitted = new Set<string>();
            const desired: string[] = [];
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                if (isLoosePinned(t)) { desired.push(t.id); emitted.add(t.id); }
            }
            const membersOf = (gid: string) => {
                const pinned: string[] = [], unpinned: string[] = [];
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    if (groupAt(t) === gid) (isPinned(t) ? pinned : unpinned).push(t.id);
                }
                return pinned.concat(unpinned);
            };
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                if (!t || emitted.has(t.id)) continue;
                const gid = groupAt(t);
                if (gid) { for (const id of membersOf(gid)) { if (!emitted.has(id)) { desired.push(id); emitted.add(id); } } }
                else { desired.push(t.id); emitted.add(t.id); }
            }
            // Only reorder if the current order already differs — keeps this a
            // cheap O(n) no-op on the frequent _applyTabGroups path.
            let differs = false;
            for (let i = 0; i < desired.length; i++) {
                if (!Z_Tabs._tabs[i + 1] || Z_Tabs._tabs[i + 1].id !== desired[i]) { differs = true; break; }
            }
            if (!differs) return;
            this._wvTGDbg("stabilize: reordering (loose-pin left / group contiguity / pin-first)");
            for (let i = 0; i < desired.length; i++) {
                const cur = Z_Tabs._tabs.findIndex((t: any) => t && t.id === desired[i]);
                if (cur >= 0 && cur !== i + 1) { try { Z_Tabs.move(desired[i], i + 1); } catch (e) {} }
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
            const memberSet = new Set<string>();
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                if (this._wvTabGroupStamp(t) === g.id) memberSet.add(t.id);   // per-tab
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
            if (!tab) return null;
            // A reader-window `_wvWT` tab carries `.itemID`; a MAIN Zotero tab
            // carries `.data.itemID`. Handle both — using only `.itemID` made
            // every key lookup return null for main tabs, so the claim pass never
            // stamped them (migrated/drag-created groups silently vanished).
            const itemID = (tab.itemID != null) ? tab.itemID : (tab.data && tab.data.itemID);
            if (itemID == null) return null;
            const it: any = Zotero.Items.get(itemID);
            return it ? { libraryID: it.libraryID, itemKey: it.key } : null;
        } catch (e) { return null; }
    }

    /** Collect the {libraryID,itemKey} of every currently-open tab (across all
     *  main + reader windows) stamped with `groupID`, de-duplicated. Used to
     *  refresh a group's persistent member snapshot at save/park time so a
     *  parked group remembers how many tabs it holds — the count shown in the
     *  tabs-menu Sessions/Groups list. `g.members` alone can be stale. */
    _wvTabGroupLiveMemberKeys(groupID: any) {
        const seen = new Set<string>();
        const keys: any[] = [];
        try {
            this._wvTabGroupForEachOpenTab((t: any) => {
                if (this._wvTabGroupStamp(t) !== groupID) return;
                const k = this._wvTabGroupDeckKey(t);
                if (!k || k.libraryID == null || !k.itemKey) return;
                const dk = k.libraryID + ":" + k.itemKey;
                if (seen.has(dk)) return;
                seen.add(dk);
                keys.push({ libraryID: k.libraryID, itemKey: k.itemKey });
            });
        } catch (e) {}
        return keys;
    }

    // ---- Per-tab membership (Firefox-style) --------------------------------
    // A tab's group is stamped ON THE TAB, not derived from its item key, so
    // duplicate tabs of the same item are independent members (fixes the
    // group spanning windows / partial-move mess). Main-window tabs carry the
    // stamp in `data.wvGroupId` (Zotero's session round-trips `tab.data`, so it
    // survives restart — the analogue of Firefox's per-tab `tabGroupId`);
    // reader-window (`_wvWT`) tabs carry it as `wvGroupId` (Weavero restores
    // those itself). Legacy item-key membership (`g.members`) is kept as the
    // fallback + the saved-group snapshot during migration.

    /** Read a tab's group-id stamp (main: `data.wvGroupId`; reader: `wvGroupId`). */
    _wvTabGroupStamp(tab: any): any {
        if (!tab) return null;
        return tab.data ? (tab.data.wvGroupId || null) : (tab.wvGroupId || null);
    }

    /** Set/clear a tab's group-id stamp. Pass null/"" to clear. */
    _wvTabGroupSetStamp(tab: any, groupID: any) {
        if (!tab) return;
        if (tab.data) {
            if (groupID) tab.data.wvGroupId = groupID; else { try { delete tab.data.wvGroupId; } catch (e) { tab.data.wvGroupId = undefined; } }
        } else {
            if (groupID) tab.wvGroupId = groupID; else { try { delete tab.wvGroupId; } catch (e) { tab.wvGroupId = undefined; } }
        }
    }

    /** The LIVE group a TAB belongs to (per-tab). Its own stamp wins (precise
     *  for duplicates); falls back to legacy item-key membership for tabs that
     *  predate the stamp (migration / not-yet-stamped). Saved groups excluded. */
    _wvTabGroupOfTab(tab: any) {
        try {
            const gid = this._wvTabGroupStamp(tab);
            if (gid) {
                const g = this._tabGroupsGet().find((x: any) => !(x as any).saved && x.id === gid);
                if (g) return g;
            }
            const k = this._wvTabGroupDeckKey(tab);
            return k ? this._tabGroupOfKey(k.libraryID, k.itemKey) : null;
        } catch (e) { return null; }
    }

    /** Per-tab JOIN for the DRAG paths: stamp THIS specific tab into the group
     *  (+ keep the item-key shadow as the restart fallback). Unlike a bare
     *  `_tabGroupAddKey`, this stamps the actual tab — so a DUPLICATE tab of an
     *  item already in the group joins as its own member (the menu path's
     *  `_wvTabGroupAddTab` does the same). Clears any stale "kept-out" flag. */
    _wvTabGroupStampJoin(tab: any, groupID: any) {
        if (!tab || !groupID) return;
        try { delete (tab as any)._wvGroupExcluded; } catch (e) { (tab as any)._wvGroupExcluded = false; }
        this._wvTabGroupSetStamp(tab, groupID);
        const k = this._wvTabGroupDeckKey(tab);
        if (k) this._tabGroupAddKey(groupID, k);
    }

    /** Per-tab LEAVE for the DRAG paths: clear THIS tab's stamp only. Drop the
     *  item-key from the shadow ONLY when no OTHER open tab is still stamped
     *  with this group for the same item — a twin must keep the shadow (and the
     *  claim pass's first-come-per-item then keeps this now-unstamped tab out).
     *  Without the twin guard, `_tabGroupRemoveKey` would wipe the twin too. */
    _wvTabGroupStampLeave(tab: any, groupID: any) {
        if (!tab) return;
        this._wvTabGroupSetStamp(tab, null);
        const k = this._wvTabGroupDeckKey(tab);
        if (!k) return;
        let twin = false;
        this._wvTabGroupForEachOpenTab((t2) => {
            if (twin || t2 === tab) return;
            if (this._wvTabGroupStamp(t2) !== groupID) return;
            const kk = this._wvTabGroupDeckKey(t2);
            if (kk && kk.libraryID === k.libraryID && kk.itemKey === k.itemKey) twin = true;
        });
        if (twin) return;
        const groups = this._tabGroupsGet();
        for (const g of groups) {
            if ((g as any).saved) continue;   // parked snapshots are frozen (live-tab lifecycle only)
            g.members = (g.members || []).filter((m: any) => !(m.libraryID === k.libraryID && m.itemKey === k.itemKey));
        }
        this._tabGroupsSet(groups);
    }

    /** Called from a reader window's `unload`: PARK (mark `saved`) every group
     *  whose only stamped members live in THIS closing window — so a mid-session
     *  reader-window close persists the group (it shows in the saved-groups list,
     *  reopenable) instead of being deleted by the next main-window apply. No-op
     *  at quit (`_wvQuitting`), where the window is restored next launch and the
     *  group must stay live (auto-restored with its tabs). A group with a stamped
     *  tab in any OTHER window is left untouched (it still lives there). */
    _wvTabGroupParkClosingWindowGroups(win: any): string[] {
        const parked: string[] = [];
        try {
            // Check the instance flag AND the reload-surviving namespace flag —
            // an unload closure wired before a plugin reload calls into the OLD
            // instance, whose `_wvQuitting` never flips (run 4 parked a group
            // during quit teardown this way).
            if ((this as any)._wvQuitting) return parked;
            if ((Zotero as any).Weavero && (Zotero as any).Weavero._quitting) return parked;
            if (!this._getEnableTabGroups || !this._getEnableTabGroups()) return parked;
            const st = win && win._wvWT;
            if (!st || !st.tabs || !st.tabs.length) return parked;
            // Distinct live (non-saved) group ids stamped on this window's tabs.
            const ids = new Set<string>();
            for (const t of st.tabs) {
                const gid = this._wvTabGroupStamp(t);
                if (gid) ids.add(gid);
            }
            if (!ids.size) return parked;
            // Which of those groups still have a stamped tab in ANOTHER window?
            const elsewhere = new Set<string>();
            this._wvTabGroupForEachOpenTab((t, w) => {
                if (w === win) return;
                const gid = this._wvTabGroupStamp(t);
                if (gid && ids.has(gid)) elsewhere.add(gid);
            });
            const groups = this._tabGroupsGet();
            let dirty = false;
            for (const g of groups) {
                // Mid-move (reopening set) → the move's own recovery handles a
                // transient window closing; parking here would mark the group
                // saved while its reopen is still in flight.
                if (this._wvReopeningGroups().has(g.id)) continue;
                if (ids.has(g.id) && !elsewhere.has(g.id) && !(g as any).saved) {
                    // Snapshot members from THIS closing window's stamped tabs so
                    // the parked group keeps its tab count for the menu list.
                    try {
                        const seen = new Set<string>();
                        const keys: any[] = [];
                        for (const t of st.tabs) {
                            if (this._wvTabGroupStamp(t) !== g.id) continue;
                            const k = this._wvTabGroupDeckKey(t);
                            if (!k || k.libraryID == null || !k.itemKey) continue;
                            const dk = k.libraryID + ":" + k.itemKey;
                            if (seen.has(dk)) continue;
                            seen.add(dk);
                            keys.push({ libraryID: k.libraryID, itemKey: k.itemKey });
                        }
                        if (keys.length) g.members = keys;
                    } catch (e) {}
                    (g as any).saved = true;   // park → persists + skipped by the delete gate
                    dirty = true;
                    parked.push(g.id);
                }
            }
            if (dirty) this._tabGroupsSet(groups);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupParkClosingWindowGroups err: " + e); }
        return parked;
    }

    /** Iterate every open tab in every window (main bars + reader strips),
     *  calling fn(tab, win). The single place that knows both tab universes, so
     *  stamp scans don't have to special-case them everywhere. */
    _wvTabGroupForEachOpenTab(fn: (tab: any, win: any) => void) {
        try {
            for (const w of Zotero.getMainWindows()) {
                const Z: any = (w as any).Zotero_Tabs;
                const tabs = (Z && Z._tabs) || [];
                for (let i = 1; i < tabs.length; i++) { try { fn(tabs[i], w); } catch (e) {} }
            }
        } catch (e) {}
        try {
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                const st = w && w._wvWT;
                for (const t of (st && st.tabs) || []) { try { fn(t, w); } catch (e) {} }
            }
        } catch (e) {}
    }

    /** True if ANY open tab (any window) is stamped with this group — the
     *  stamp-based "is this group still alive" test (replaces the item-key
     *  globalOpen check). */
    _wvTabGroupOpenAnywhere(groupID: any): boolean {
        let found = false;
        this._wvTabGroupForEachOpenTab((t) => { if (!found && this._wvTabGroupStamp(t) === groupID) found = true; });
        return found;
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
            try { this._wvWireTabGroupWindowDnD(win, true); } catch (e) {}
            const groups = this._tabGroupsGet();
            stripClasses();
            if (!groups.length) return;
            const elById = new Map<string, any>();
            for (const el of tabsBox.querySelectorAll(":scope > .wv-window-tab")) {
                elById.set(el.getAttribute("data-wv-tab-id"), el);
            }
            // Claim pass (see _applyTabGroups): stamp unstamped strip tabs from a
            // live group's item-key shadow, first-come per item, single-window-
            // guarded. Covers reader add paths that only wrote the shadow + restamps
            // tabs re-mounted on restart.
            {
                const claimedByGroup = new Map<string, Set<string>>();
                for (const tab of st.tabs) {
                    const s = this._wvTabGroupStamp(tab); if (!s) continue;
                    const k = this._wvTabGroupDeckKey(tab); if (!k) continue;
                    let set = claimedByGroup.get(s); if (!set) { set = new Set(); claimedByGroup.set(s, set); }
                    set.add(k.libraryID + ":" + k.itemKey);
                }
                for (const tab of st.tabs) {
                    if (this._wvTabGroupStamp(tab) || (tab as any)._wvGroupExcluded) continue;
                    const k = this._wvTabGroupDeckKey(tab); if (!k) continue;
                    const kk = k.libraryID + ":" + k.itemKey;
                    const g = groups.find((x: any) => !(x as any).saved
                        && (x.members || []).some((m: any) => m.libraryID === k.libraryID && m.itemKey === k.itemKey));
                    if (!g) continue;
                    const home = this._wvTabGroupHomeWin(g.id);
                    if (home && home !== win) continue;
                    // Homeless + mid-migrate → not claimable (see the main-bar
                    // claim pass twin: the close→mount gap must not grab loose
                    // duplicate copies in other windows).
                    if (!home && this._wvReopeningGroups().has(g.id)) continue;
                    let set = claimedByGroup.get(g.id); if (!set) { set = new Set(); claimedByGroup.set(g.id, set); }
                    if (set.has(kk)) continue;
                    this._wvTabGroupSetStamp(tab, g.id); set.add(kk);
                }
            }
            const readerGroups = this._tabGroupsGet();
            for (const g of readerGroups) {
                if ((g as any).saved) continue;   // parked group: no chip in the reader strip (decoupled from open tabs)
                const members: any[] = [];
                for (const tab of st.tabs) {
                    if ((tab as any)._wvGroupExcluded) continue;   // a separate copy kept OUT of the group
                    if (this._wvTabGroupStamp(tab) === g.id) members.push(tab);
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
            const curGid = this._wvTabGroupStamp(tab);
            const curGroup = curGid ? groups.find((x: any) => x.id === curGid && !(x as any).saved) : null;
            this._wvTGDbg("reader membership: tab=" + tabId + " x=" + clientX);
            for (const g of groups) {
                if (curGroup && g.id === curGroup.id) continue;
                const reg = regionOf(g);
                if (!reg || clientX < reg.left || clientX > reg.right) continue;
                this._wvTGDbg("reader membership: JOIN '" + (g.name || g.id) + "'");
                this._wvTabGroupStampJoin(tab, g.id);   // per-tab (duplicate-safe)
                this._wvTabGroupApplyEverywhere();
                return;
            }
            if (curGroup) {
                const reg = regionOf(curGroup);
                if (!reg) { this._wvTabGroupApplyEverywhere(); return; }
                const out = clientX < reg.left || clientX > reg.right;
                this._wvTGDbg("reader membership: own region=" + JSON.stringify(reg) + " out=" + out);
                if (out) this._wvTabGroupStampLeave(tab, curGroup.id);
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

    /** Whole-WINDOW group-drop acceptance (main + reader): a chip released
     *  anywhere over a target window's body still means "move the group to
     *  this window" — before this, only the tab strip (38px) accepted the
     *  drop, and a release over the content fell through to the dragend
     *  TEAR-OUT, popping a surprise new window (and, via a spawn hiccup +
     *  close-parking, once left the group "closed and saved", 2026-07-03).
     *  Strip-area events are left to the strip/container handlers (precise
     *  slot + ghost); everything else lands the group at the pointer's x.
     *  Gated on a live `_wvGroupDrag`, so normal item/text drags are
     *  untouched. Delegate pattern (live-resolved), versioned, reload-proof. */
    _wvWireTabGroupWindowDnD(win: any, isReader: boolean) {
        try {
            const WIRE_VERSION = 1;
            if ((win as any)._wvTabGroupWinDnDVer === WIRE_VERSION) return;
            try { (win as any)._wvTabGroupWinDnDOff?.(); } catch (e) {}
            const live = () => {
                try { return (Zotero as any).Weavero && (Zotero as any).Weavero.plugin; } catch (e) { return null; }
            };
            const inStrip = (e: any) => {
                try {
                    const t = e.target;
                    return !!(t && t.closest && t.closest(isReader ? ".wv-window-tabstrip" : "#tab-bar-container"));
                } catch (er) { return false; }
            };
            const onOver = (e: any) => {
                try {
                    const p: any = live(); if (!p) return;
                    const gd = p._wvGroupDrag; if (!gd) return;
                    if (inStrip(e)) return;              // strip handlers own the precise path
                    e.preventDefault(); e.stopPropagation();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    // Ghost lives in the strip either way — feedback for where
                    // the group will land.
                    if (gd.sourceWin !== win) { try { p._wvTabGroupShowDropGhost(win, gd.groupID, e.clientX, isReader); } catch (er) {} }
                } catch (er) {}
            };
            const onDrop = (e: any) => {
                try {
                    const p: any = live(); if (!p) return;
                    const gd = p._wvGroupDrag; if (!gd) return;
                    if (inStrip(e)) return;
                    e.preventDefault(); e.stopPropagation();
                    p._wvGroupDrag = null;
                    try { p._wvGrpDragSetMembersHidden(gd.sourceWin, gd.groupID, false); } catch (er) {}
                    try { p._wvTabGroupHideAllDropGhosts(); } catch (er) {}
                    if (gd.sourceWin === win) return;    // own window body → cancel, not a reorder
                    p._wvTabGroupMigrateGroup(gd.sourceWin, win, gd.groupID, e.clientX);
                } catch (er) {}
            };
            win.addEventListener("dragover", onOver, true);
            win.addEventListener("drop", onDrop, true);
            (win as any)._wvTabGroupWinDnDVer = WIRE_VERSION;
            (win as any)._wvTabGroupWinDnDOff = () => {
                try { win.removeEventListener("dragover", onOver, true); win.removeEventListener("drop", onDrop, true); } catch (e) {}
                (win as any)._wvTabGroupWinDnDVer = 0;
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
                        for (const t of src._wvWT.tabs) {
                            if (g && this._wvTabGroupStamp(t) === g.id) {
                                titles.push((this as any)._wvWTTabTitle(t) || "");
                            }
                        }
                    } else if (src && src.Zotero_Tabs) {
                        for (const t of src.Zotero_Tabs._tabs) {
                            if (g && this._wvTabGroupStamp(t) === g.id) titles.push(t.title || "");
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
    async _wvTabGroupMigrateGroup(srcWin: any, tgtWin: any, groupID: any, clientX: any, opts?: any) {
        try {
            const noFocus = !!(opts && opts.noFocus);   // popup move: don't surface the target
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g || !srcWin || !tgtWin || srcWin === tgtWin) return;
            const srcIsReader = this._wvTabGroupIsReaderWin(srcWin);
            const tgtIsReader = this._wvTabGroupIsReaderWin(tgtWin);
            // Collect open members (STAMPED with this group, per-tab) in SOURCE
            // display order — a duplicate of a member's item that isn't itself in
            // the group is correctly left behind.
            const entries: Array<{ itemID: number; isNote: boolean; srcTabID: any; fromWin: any; fromReader: boolean; skipReopen?: boolean }> = [];
            const collectFrom = (w: any) => {
                if (this._wvTabGroupIsReaderWin(w)) {
                    const st = w._wvWT;
                    for (const t of (st && st.tabs) || []) {
                        if (this._wvTabGroupStamp(t) === g.id) {
                            entries.push({ itemID: t.itemID, isNote: t.type === "note", srcTabID: t.id, fromWin: w, fromReader: true });
                        }
                    }
                } else {
                    const Z: any = w.Zotero_Tabs;
                    for (let i = 1; i < ((Z && Z._tabs) || []).length; i++) {
                        const t = Z._tabs[i];
                        if (this._wvTabGroupStamp(t) === g.id) {
                            entries.push({ itemID: t.data && t.data.itemID, isNote: String(t.type || "").indexOf("note") === 0, srcTabID: t.id, fromWin: w, fromReader: false });
                        }
                    }
                }
            };
            collectFrom(srcWin);
            // A SPLIT group (stamped members in more than one window — fallout
            // of an earlier partial move or claim) must travel as a WHOLE:
            // sweep every other window's stamped members too, so the move
            // RE-UNIFIES the group instead of leaving the minority window
            // holding a duplicate chip + leftover tabs (2026-07-03).
            try {
                const extraWins = new Set<any>();
                this._wvTabGroupForEachOpenTab((t: any, w: any) => {
                    if (w === srcWin || w === tgtWin) return;
                    if (this._wvTabGroupStamp(t) === g.id) extraWins.add(w);
                });
                for (const w of extraWins) collectFrom(w);
            } catch (e) {}
            // The same ITEM can be stamped in two windows (the split-dupe
            // case): close every copy, but reopen it in the target only once.
            try {
                const seenItems = new Set<any>();
                for (const en0 of entries) {
                    if (seenItems.has(en0.itemID)) en0.skipReopen = true;
                    else seenItems.add(en0.itemID);
                }
            } catch (e) {}
            if (!entries.length) return;
            this._wvTGDbg("migrate " + entries.length + " tab(s) " + (srcIsReader ? "reader" : "main")
                + "→" + (tgtIsReader ? "reader" : "main"));
            // Keep the group alive across the close→reopen gap. Closing ALL its
            // members empties it, and the Firefox close-model in _applyTabGroups
            // would DELETE the group (and park members as recently-closed) before
            // the deferred reopen re-establishes it — the tabs then arrive
            // UNGROUPED in the target ("the group disappeared"). The reopening
            // guard makes _applyTabGroups keep the members + the group until we
            // clear it after the reopen lands.
            const reopenSet = this._wvReopeningGroups();
            reopenSet.add(groupID);
            // Close all in the source first (saves reader/note state; the
            // existing single-tab flows do the same close-then-open dance).
            // Suppress the per-close main-bar re-chip during the batch (each
            // close otherwise fires the tab notifier → _applyTabGroups).
            (this as any)._wvSuppressGroupApply = true;
            try {
                for (const en2 of entries) {
                    try {
                        if (en2.fromReader) this._wvWTCloseTab(en2.fromWin, en2.srcTabID);
                        else en2.fromWin.Zotero_Tabs.close(en2.srcTabID);
                    } catch (e) {}
                }
            } finally {
                (this as any)._wvSuppressGroupApply = false;
            }
            // Deferred reopen in the target, in order.
            const setT = (tgtWin.setTimeout ? tgtWin.setTimeout.bind(tgtWin) : setTimeout);
            setT(async () => {
                try {
                    if (tgtIsReader) {
                        // Surface the arriving group — without this the reader
                        // window stays behind the main window and the migrated
                        // group looks like it vanished. (Skipped for popup
                        // moves: the popup lists the target, nothing "vanishes".)
                        if (!noFocus) { try { tgtWin.focus(); } catch (e) {} }
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
                        // Place each tab at its slot AS IT MOUNTS (mounts
                        // append at the end; without this the group visibly
                        // stacks at the end for seconds before snapping to
                        // the drop position).
                        let placed = 0;
                        for (const en2 of entries) {
                            if (en2.skipReopen) continue;
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
                                    // Stamp the arrival DIRECTLY (newest unstamped
                                    // copy of the item) — same rationale as the
                                    // main-window branch below.
                                    try {
                                        for (let i = st2.tabs.length - 1; i >= 0; i--) {
                                            const t = st2.tabs[i];
                                            if (t.itemID === en2.itemID && !t.wvGroupId) { t.wvGroupId = groupID; break; }
                                        }
                                    } catch (e) {}
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
                        try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
                        // STRAGGLER SWEEP (reader target too — it was main-only,
                        // so a failed source close left a duplicate chip behind).
                        try { this._wvTabGroupSweepMigrateStragglers(entries, groupID); } catch (e) {}
                    } else {
                        // Re-open each member as an UNLOADED main-window tab —
                        // synchronous, no document load, appended contiguously,
                        // mirroring _wvTabGroupReopen. This is what kills the
                        // flicker: the old staggered background Reader.open + 120ms
                        // loop loaded each member's document and popped it into the
                        // bar one at a time (re-rendering repeatedly); unloaded adds
                        // appear at once and load lazily only when selected. We never
                        // select a member, so a COLLAPSED group stays collapsed.
                        if (!noFocus) { try { tgtWin.focus(); } catch (e) {} }
                        const Z: any = tgtWin.Zotero_Tabs;
                        // Suppress per-event re-chips while the whole group's
                        // unloaded tabs are added + positioned. Each Z.add fires
                        // the tab notifier → _applyTabGroups, and the cascade re-
                        // chips the bar 8× over a few hundred ms — that was the
                        // flicker. Keep them suppressed, then do ONE settling apply
                        // once the burst lands (React has rendered the new nodes).
                        (this as any)._wvSuppressGroupApply = true;
                        const arrivedIDs: string[] = [];
                        if (Z && typeof Z.add === "function") {
                            for (const en2 of entries) {
                                if (en2.skipReopen) continue;
                                try {
                                    if (!Zotero.Items.exists(en2.itemID)) continue;
                                    const r = Z.add({
                                        type: en2.isNote ? "note-unloaded" : "reader-unloaded",
                                        data: { itemID: en2.itemID },
                                        select: false,
                                        preventJumpback: true,
                                    });
                                    if (r && r.id) arrivedIDs.push(r.id);
                                } catch (e) {}
                            }
                        }
                        // STAMP the arrivals DIRECTLY (per-tab membership is
                        // authoritative). The old flow relied on the CLAIM pass
                        // matching the member shadow — but if even ONE source
                        // close silently failed, the straggler kept the group
                        // HOMED IN THE SOURCE and the claim refused every
                        // arrival: "most tabs moved, but not the group"
                        // (2026-07-03).
                        try {
                            for (const id of arrivedIDs) {
                                const t = Z._tabs.find((x: any) => x.id === id);
                                if (t) this._wvTabGroupSetStamp(t, groupID);
                            }
                        } catch (e) {}
                        // Position the arrived (contiguous) block at the drop slot.
                        if (typeof clientX === "number") {
                            try { this._wvTabGroupMoveGroupTo(tgtWin, groupID, clientX); } catch (e) {}
                        }
                        // Settle the instant the arrived tabs paint (the bar
                        // renders ~2 frames after Z.add) instead of after a fixed
                        // 260ms — that quarter-second was the "tabs first, group
                        // second" flicker. Still a SINGLE apply once ALL arrived
                        // nodes exist, so there's no per-tab re-chip churn. The
                        // reopen guard stays on until the apply so the group isn't
                        // emptied mid-burst.
                        this._wvTabGroupSettleMainArrival(tgtWin, groupID, arrivedIDs, () => {
                            (this as any)._wvSuppressGroupApply = false;
                            reopenSet.delete(groupID);
                            // STRAGGLER SWEEP: any member whose source close
                            // failed would keep the group spanning two windows —
                            // retry the close; if it still won't close, unstamp
                            // it (the tab survives as a loose duplicate, the
                            // group stays single-window).
                            try { this._wvTabGroupSweepMigrateStragglers(entries, groupID); } catch (e) {}
                        });
                        return;   // main-target settles itself via the poll above
                    }
                    // Reader-target landed → drop the guard and re-sync: the members
                    // are now open in the target, so _applyTabGroups keeps them and
                    // re-chips the group there.
                    reopenSet.delete(groupID);
                    this._wvTabGroupApplyEverywhere();
                } catch (e) {
                    (this as any)._wvSuppressGroupApply = false;
                    reopenSet.delete(groupID);
                    try { this._wvTabGroupApplyEverywhere(); } catch (e2) {}
                    Zotero.debug("[Weavero] migrate reopen err: " + e);
                }
            }, 180);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupMigrateGroup err: " + e); }
    }

    /** STRAGGLER SWEEP for a group migrate: any member whose source close
     *  silently failed would keep the group spanning two windows (a duplicate
     *  chip + leftover tabs in the source) — retry the close; if it STILL
     *  won't close, unstamp it so the tab survives only as a loose duplicate
     *  and the group stays single-window. Entries carry their own source
     *  window (`fromWin`/`fromReader`) — a split group migrates from several
     *  windows at once. */
    _wvTabGroupSweepMigrateStragglers(entries: Array<{ srcTabID: any; fromWin: any; fromReader: boolean }>, groupID: any) {
        for (const en3 of entries) {
            try {
                if (en3.fromReader) {
                    const st3 = en3.fromWin._wvWT;
                    if (st3 && st3.tabs.some((x: any) => x.id === en3.srcTabID)) {
                        try { (this as any)._wvWTCloseTab(en3.fromWin, en3.srcTabID); } catch (e) {}
                        const t3 = st3.tabs.find((x: any) => x.id === en3.srcTabID);
                        if (t3 && this._wvTabGroupStamp(t3) === groupID) this._wvTabGroupSetStamp(t3, null);
                    }
                } else {
                    const SZ: any = en3.fromWin.Zotero_Tabs;
                    if (SZ && SZ._tabs.some((x: any) => x.id === en3.srcTabID)) {
                        try { SZ.close(en3.srcTabID); } catch (e) {}
                        const t3 = SZ._tabs.find((x: any) => x.id === en3.srcTabID);
                        if (t3 && this._wvTabGroupStamp(t3) === groupID) this._wvTabGroupSetStamp(t3, null);
                    }
                }
            } catch (e) {}
        }
    }

    /** Drop the migrate guards and chip the group ONCE, the moment every
     *  just-arrived member tab (`arrivedIDs` = the tab ids Z.add returned) has
     *  rendered in the main bar. Zotero renders the bar asynchronously (~2
     *  frames / ~10ms after Z.add), so a fixed settle delay either flickered
     *  (too short → re-chip churn as tabs trickle in) or showed the group
     *  ungrouped for a beat (260ms). Polling on animation frames applies a
     *  SINGLE time as the tabs paint — grouped on arrival, no churn. A 600ms
     *  cap guarantees the guards always drop even if a node never resolves. */
    _wvTabGroupSettleMainArrival(tgtWin: any, groupID: any, arrivedIDs: string[], dropGuards: () => void) {
        try {
            const doc = tgtWin.document;
            const tabsBox = doc.querySelector("#tab-bar-container .tabs-wrapper .tabs");
            const raf = tgtWin.requestAnimationFrame ? tgtWin.requestAnimationFrame.bind(tgtWin) : null;
            const setT = tgtWin.setTimeout ? tgtWin.setTimeout.bind(tgtWin) : setTimeout;
            const clock = () => (tgtWin.performance && tgtWin.performance.now) ? tgtWin.performance.now() : Date.now();
            const start = clock();
            const ready = () => {
                if (!tabsBox) return false;
                for (const id of arrivedIDs) {
                    if (!tabsBox.querySelector('.tab[data-id="' + id + '"]')) return false;
                }
                return true;
            };
            const done = () => {
                try { dropGuards(); } catch (e) {}
                try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
            };
            const tick = () => {
                try {
                    if (ready() || (clock() - start) > 600) { done(); return; }
                    if (raf) raf(tick); else setT(tick, 16);
                } catch (e) { done(); }
            };
            tick();
        } catch (e) {
            try { dropGuards(); } catch (e2) {}
            try { this._wvTabGroupApplyEverywhere(); } catch (e2) {}
        }
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
            // A SAVED (parked) group has NO live open members by definition — its
            // membership is decoupled from open tabs. Report 0 so the tabs-menu
            // footer reads "saved" and clicking the row REOPENS (not focuses).
            if ((g as any).saved) return 0;
            // Count by per-tab STAMP (exact members; a duplicate copy of a
            // member's item is NOT counted).
            let n = 0;
            this._wvTabGroupForEachOpenTab((t) => {
                if ((t as any)._wvGroupExcluded) return;
                if (this._wvTabGroupStamp(t) === groupID) n++;
            });
            return n;
        } catch (e) { return 0; }
    }

    /** Close the group's tabs EVERYWHERE but keep the group for reopening. */
    _wvTabGroupSaveAndClose(win: any, groupID: any) {
        try {
            const groups = this._tabGroupsGet();
            const g = groups.find((x: any) => x.id === groupID);
            if (!g) return;
            // Refresh the persistent member snapshot from the LIVE stamps before
            // closing, so the parked group remembers its tab count (the count
            // shown in the tabs-menu list). g.members can be stale/empty if
            // membership changed without a tracked add/remove.
            try { const lk = this._wvTabGroupLiveMemberKeys(g.id); if (lk.length) g.members = lk; } catch (e) {}
            // Record for "Reopen Closed Group" (Ctrl+Shift+T). The group is parked
            // (stays in prefs), so reopen finds it by id; snapshot members anyway.
            try { (this as any)._wvClosedPush({ kind: "group", groupID, name: g.name, color: g.color, members: (g.members || []).map((m: any) => ({ libraryID: m.libraryID, itemKey: m.itemKey })) }); } catch (e) {}
            // Mark saved + persist BEFORE closing the tabs, so the
            // close-triggered _applyTabGroups pass already sees the flag and
            // preserves the group (otherwise it would drop every member and then
            // delete the now-empty group). Members closed by STAMP (per-tab) so a
            // duplicate of a member's item that ISN'T in the group is left open.
            (g as any).saved = true;
            this._tabGroupsSet(groups);
            for (const w of Zotero.getMainWindows()) {
                try {
                    const Z: any = (w as any).Zotero_Tabs;
                    const ids: string[] = [];
                    for (let i = 1; i < ((Z && Z._tabs) || []).length; i++) {
                        const t = Z._tabs[i];
                        if (this._wvTabGroupStamp(t) === g.id) ids.push(t.id);
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
                        .filter((t: any) => this._wvTabGroupStamp(t) === g.id)
                        .map((t: any) => t.id);
                    for (const id of ids) { try { (this as any)._wvWTCloseTab(w, id); } catch (e) {} }
                }
            } catch (e) {}
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupSaveAndClose err: " + e); }
    }

    /** Reopen a saved/dormant group's tabs in `targetWin` (background-opened,
     *  staggered, then clustered). Mirrors the migrate flow's reopen branch. */
    async _wvTabGroupReopen(targetWin: any, groupID: any, opts?: any) {
        const reopenSet = this._wvReopeningGroups();
        const noFocus = !!(opts && opts.noFocus);   // popup move: background reopen, no selection change
        try {
            const g0 = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const members = (g0 && g0.members) || [];
            if (!members.length) return;
            // Reopening the saved group consumes it: drop it from any closed-window
            // entry so reopening that window won't duplicate it (Firefox parity).
            try { (this as any)._wvClosedForgetGroup(groupID); } catch (e) {}
            if (!noFocus) { try { targetWin.focus(); } catch (e) {} }   // Reader.open targets the focused main window
            const setT = (targetWin.setTimeout ? targetWin.setTimeout.bind(targetWin) : setTimeout);
            const Z: any = targetWin.Zotero_Tabs;
            // Clear the saved flag + mark the group reopening BEFORE opening, so
            // each tab gets grouped the moment it appears (no ungrouped flash, no
            // all-at-once regroup at the end) and the group isn't deleted while
            // it transiently has no open tabs.
            reopenSet.add(groupID);
            {
                const groups = this._tabGroupsGet();
                const g1 = groups.find((x: any) => x.id === groupID);
                if (g1 && (g1 as any).saved) { delete (g1 as any).saved; this._tabGroupsSet(groups); }
            }
            // Restore each closed member as an UNLOADED tab entry: created
            // synchronously, appended contiguously, with NO document loaded into
            // memory. Zotero derives the title and loads the document lazily only
            // when the tab is SELECTED — exactly how its own session restore
            // works (the reader-unloaded / note-unloaded types). So the whole
            // group reappears near-instantly and stays light; only the first tab
            // (selected below for feedback + scroll-into-view) loads its document.
            let firstId: any = null;
            if (Z && typeof Z.add === "function") {
                for (const m of members) {
                    try {
                        const it: any = Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey);
                        if (!it) continue;             // item deleted since saving
                        const isNote = (typeof it.isNote === "function" && it.isNote());
                        if (!isNote && !it.attachmentReaderType) continue;   // not openable as a tab
                        // Complete decoupling (per-tab membership): any tab ALREADY
                        // open for this item stays a SEPARATE, ungrouped tab — flag
                        // it excluded so the grouping (which keys off the item) won't
                        // pull it in — then open a FRESH copy as the group's own tab.
                        for (const t of Z._tabs) {
                            const k = (this as any)._tabPinKey(t);
                            if (k && k.libraryID === m.libraryID && k.itemKey === m.itemKey) {
                                try { (t as any)._wvGroupExcluded = true; } catch (e) {}
                            }
                        }
                        const res = Z.add({
                            type: isNote ? "note-unloaded" : "reader-unloaded",
                            data: { itemID: it.id },
                            select: false,
                            preventJumpback: true,
                        });
                        // Stamp the fresh tab DIRECTLY (claim-pass fallback
                        // stays as the restart safety net, not the mechanism).
                        try { const nt = Z._tabs.find((x: any) => x.id === (res && res.id)); if (nt) this._wvTabGroupSetStamp(nt, groupID); } catch (e) {}
                        if (res && res.id && !firstId) firstId = res.id;
                    } catch (e) {}
                }
            }
            // They were appended consecutively, so the group is already
            // contiguous — cluster (no-op) + chip, then select the first tab so
            // the strip scrolls to it (feedback) and only that one loads.
            try { this._wvTabGroupStabilize(targetWin); } catch (e) {}
            try { this._applyTabGroups(targetWin); } catch (e) {}
            if (firstId && !noFocus) { try { Z.select(firstId); } catch (e) {} }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupReopen err: " + e); }
        finally {
            reopenSet.delete(groupID);
            try { this._wvTabGroupStabilize(targetWin); } catch (e) {}
            this._wvTabGroupApplyEverywhere();
            if (!noFocus) { try { this._wvTabGroupFocusFirst(targetWin, groupID); } catch (e) {} }
            // The synchronous passes above may run before React has rendered the
            // new tab nodes — re-apply once they exist so the group chips/classes
            // settle and the first tab is scrolled into view.
            try { targetWin.setTimeout(() => { try { this._wvTabGroupStabilize(targetWin); this._wvTabGroupApplyEverywhere(); if (!noFocus) this._wvTabGroupFocusFirst(targetWin, groupID); } catch (e) {} }, 60); } catch (e) {}
        }
    }

    /** Select a group's first member tab (Zotero then scrolls it into view). */
    _wvTabGroupFocusFirst(win: any, groupID: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            if (!Z || !Z._tabs) return;
            const t = Z._tabs.find((x: any) => this._wvTabGroupStamp(x) === groupID);   // per-tab
            if (t) { try { Z.select(t.id); } catch (e) {} }
        } catch (e) {}
    }

    /** Reopen a saved/dormant group's tabs into a READER window's deck
     *  (the reader twin of _wvTabGroupReopen — mounts sequentially, then
     *  re-renders the strip). */
    async _wvTabGroupReopenInReader(win: any, groupID: any, opts?: any) {
        try {
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const members = (g && g.members) || [];
            if (!members.length || !win._wvWT) return;
            // Reopening the saved group consumes it: drop it from any closed-window
            // entry so reopening that window won't duplicate it (Firefox parity).
            try { (this as any)._wvClosedForgetGroup(groupID); } catch (e) {}
            for (const m of members) {
                try {
                    const it: any = Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey);
                    if (!it) continue;
                    // Complete decoupling: any reader tab ALREADY open for this item
                    // stays a SEPARATE, ungrouped tab — flag it excluded — then mount
                    // a FRESH copy as the group's tab.
                    for (const t of (win._wvWT.tabs || [])) {
                        const k = this._wvTabGroupDeckKey(t);
                        if (k && k.libraryID === m.libraryID && k.itemKey === m.itemKey) {
                            try { (t as any)._wvGroupExcluded = true; } catch (e) {}
                        }
                    }
                    const nid = await (this as any)._wvWTMountTab(win, it.id, { allowDuplicate: true, select: false, await: true });
                    // Stamp the fresh deck tab DIRECTLY.
                    try {
                        const st = win._wvWT;
                        let nt = st && st.tabs && st.tabs.find((x: any) => String(x.id) === String(nid));
                        if (!nt && st && st.tabs) { for (let i = st.tabs.length - 1; i >= 0; i--) { if (st.tabs[i].itemID === it.id && !st.tabs[i].wvGroupId) { nt = st.tabs[i]; break; } } }
                        if (nt) nt.wvGroupId = groupID;
                    } catch (e) {}
                } catch (e) {}
            }
            const groups = this._tabGroupsGet();
            const g2 = groups.find((x: any) => x.id === groupID);
            if (g2 && (g2 as any).saved) { delete (g2 as any).saved; this._tabGroupsSet(groups); }
            try { (this as any)._wvWTRenderStrip(win); } catch (e) {}
            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
            this._wvTabGroupApplyEverywhere();
            if (!(opts && opts.noFocus)) { try { win.focus(); } catch (e) {} }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupReopenInReader err: " + e); }
    }

    /** Bring the group's home window to front and select its first open tab. */
    _wvTabGroupFocus(groupID: any) {
        try {
            const home = this._wvTabGroupHomeWin(groupID);
            if (!home) return false;
            if (this._wvTabGroupIsReaderWin(home)) {
                const t = (home._wvWT.tabs || []).find((x: any) => this._wvTabGroupStamp(x) === groupID);
                if (t) { try { (this as any)._wvWTSwitch(home, t.id); } catch (e) {} }
            } else {
                const Z: any = home.Zotero_Tabs;
                const t = (Z && Z._tabs || []).find((x: any) => this._wvTabGroupStamp(x) === groupID);
                if (t) { try { Z.select(t.id); } catch (e) {} }
            }
            try { home.focus(); } catch (e) {}
            return true;
        } catch (e) { return false; }
    }

    /** "Move group to new window": move the whole group into ONE new READER
     *  window (a multi-tab reader window), keeping it grouped. (The old version
     *  spawned a new MAIN window via openMainWindow(), which restored the entire
     *  session — every tab — into it; only the group should move.) Closes the
     *  group's open tabs in their home window and reopens the items together in
     *  the fresh reader window; the group's membership is preserved (NOT
     *  forgotten, unlike a tear-out), so the new window chips them as one group. */
    async _wvTabGroupMoveToNewWindow(win: any, groupID: any) {
        const reopenSet = this._wvReopeningGroups();
        try {
            const home = this._wvTabGroupHomeWin(groupID) || win;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return;
            const homeIsReader = this._wvTabGroupIsReaderWin(home);
            // Collect the group's OPEN members (in display order) from the home
            // window by per-tab STAMP — exactly the group's tabs, so a duplicate
            // copy of a member's item is NOT swept in (the move-mess bug).
            const open: Array<{ itemID: any; isNote: boolean; srcTabID: any; tabType?: any }> = [];
            // note-aware of BOTH loaded ("note") and unloaded ("note-unloaded")
            // tab types — t.type === "note" alone misses unloaded note tabs.
            const tabIsNote = (t: any) => String(t && t.type || "").startsWith("note");
            if (homeIsReader) {
                for (const t of (home._wvWT && home._wvWT.tabs) || []) {
                    if (this._wvTabGroupStamp(t) === groupID) open.push({ itemID: t.itemID, isNote: tabIsNote(t), srcTabID: t.id, tabType: t.type });
                }
            } else {
                const Z: any = home.Zotero_Tabs;
                for (let i = 1; i < ((Z && Z._tabs) || []).length; i++) {
                    const t = Z._tabs[i];
                    if (this._wvTabGroupStamp(t) === groupID) open.push({ itemID: t.data && t.data.itemID, isNote: tabIsNote(t), srcTabID: t.id, tabType: t.type });
                }
            }
            // Entries to open in the new reader window. For an OPEN group, those
            // are the open members; for a SAVED group (none open) reopen all its
            // stored members and clear the saved flag.
            let entries: Array<{ itemID: any; isNote: boolean; grp?: any }> = [];
            if (open.length) {
                // Carry the group id so the new reader window STAMPS each
                // arrival directly (the grp branches in
                // _wvOpenItemsInNewReaderWindow) instead of relying on the
                // claim pass over the shadow.
                entries = open.map((o) => ({ itemID: o.itemID, isNote: o.isNote, grp: groupID }));
            } else {
                const groups = this._tabGroupsGet();
                const g1 = groups.find((x: any) => x.id === groupID);
                if (g1 && (g1 as any).saved) { delete (g1 as any).saved; this._tabGroupsSet(groups); }
                for (const m of (g.members || [])) {
                    try { const it: any = Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey); if (it && (it.attachmentReaderType || (it.isNote && it.isNote()))) entries.push({ itemID: it.id, isNote: !!(it.isNote && it.isNote()), grp: groupID }); } catch (e) {}
                }
            }
            entries = entries.filter((e) => e.itemID != null);
            // ── move-group diagnostics (debugging a vanishing group) ─────────
            try {
                const dbg = open.map((o: any) => {
                    let rt = "?", isN = "?", itype = "?";
                    try { const it: any = Zotero.Items.get(o.itemID); if (it) { rt = String(it.attachmentReaderType || "(none)"); isN = String(!!(it.isNote && it.isNote())); itype = it.itemType; } } catch (e) {}
                    return { itemID: o.itemID, tabType: o.tabType, flaggedNote: !!o.isNote, attachmentReaderType: rt, realIsNote: isN, itemType: itype };
                });
                Zotero.debug("[Weavero][move-group] START groupID=" + groupID + " name=\"" + (g.name || "") + "\" homeIsReader=" + homeIsReader + " openCount=" + open.length + " members=" + JSON.stringify(dbg));
            } catch (eLog) {}
            if (!entries.length) { Zotero.debug("[Weavero][move-group] ABORT — no openable entries (group left intact)"); return; }
            // Keep the group alive across the close→reopen gap (closing the last
            // member would otherwise delete it before the new window opens).
            reopenSet.add(groupID);
            // MOVE: close the open members in their home window first.
            Zotero.debug("[Weavero][move-group] closing " + open.length + " source tab(s) in " + (homeIsReader ? "reader" : "main") + " window");
            for (const o of open) {
                try { if (homeIsReader) this._wvWTCloseTab(home, o.srcTabID); else home.Zotero_Tabs.close(o.srcTabID); }
                catch (e) { Zotero.debug("[Weavero][move-group] close err tab=" + o.srcTabID + ": " + e); }
            }
            // Open them together in ONE new reader window (membership preserved →
            // they regroup there). _wvOpenItemsInNewReaderWindow focuses it.
            Zotero.debug("[Weavero][move-group] opening " + entries.length + " entr(ies) in a new reader window: " + JSON.stringify(entries));
            try { await (this as any)._wvOpenItemsInNewReaderWindow(entries); }
            catch (e) { Zotero.debug("[Weavero][move-group] _wvOpenItemsInNewReaderWindow THREW: " + e); }
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupMoveToNewWindow err: " + e); }
        finally {
            reopenSet.delete(groupID);
            try {
                const grp = this._tabGroupsGet().find((x: any) => x.id === groupID);
                const cnt = grp ? this._wvTabGroupOpenCount(groupID) : -1;
                Zotero.debug("[Weavero][move-group] FINALLY — group " + (grp ? "EXISTS" : "GONE") + " openCount=" + cnt);
                // Safety net: the move closed the source tabs but the new window
                // never materialised (some member couldn't be opened), so the
                // group has 0 open tabs and the empty-group sweep below would
                // delete it. Reopen its members (unloaded) in the main window so
                // the group is NEVER silently lost — better a recovered group in
                // the original window than a vanished one.
                if (grp && cnt === 0) {
                    const mw: any = Zotero.getMainWindow();
                    const Z: any = mw && mw.Zotero_Tabs;
                    if (Z && typeof Z.add === "function") {
                        for (const m of (grp.members || [])) {
                            try {
                                const it: any = Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey);
                                if (!it) continue;
                                const isN = !!(it.isNote && it.isNote());
                                if (!isN && !it.attachmentReaderType) continue;
                                Z.add({ type: isN ? "note-unloaded" : "reader-unloaded", data: { itemID: it.id }, select: false, preventJumpback: true });
                            } catch (e) {}
                        }
                        Zotero.debug("[Weavero][move-group] RECOVERED — reopened members in the main window");
                    }
                }
            } catch (eLog) {}
            try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
            // Re-apply once the new window's React strip has rendered the tabs.
            try { const mw: any = Zotero.getMainWindow(); const st = (mw && mw.setTimeout) ? mw.setTimeout.bind(mw) : setTimeout; st(() => { try { this._wvTabGroupApplyEverywhere(); } catch (e) {} }, 220); } catch (e) {}
        }
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

    /** Move a whole group to `tgtWin` at a precise position (`clientX` in the
     *  target window's tab-bar/strip coordinate space; null/undefined → append).
     *  Handles same-window reorder, cross-window migrate, and reopening a closed
     *  (saved) group at the target slot. Used by the popup group drag. */
    async _wvMoveGroupToWindowAt(groupID: any, tgtWin: any, isReaderTgt: boolean, clientX: number | null, opts?: any) {
        try {
            if (!tgtWin) return;
            const home = this._wvTabGroupHomeWin(groupID);
            const hasX = (typeof clientX === "number");
            if (!home) {
                // Closed / saved group → reopen in the target, then position it.
                if (isReaderTgt) {
                    await this._wvTabGroupReopenInReader(tgtWin, groupID, opts);
                    if (hasX) { try { this._wvTabGroupReaderMoveGroupTo(tgtWin, groupID, clientX as number); } catch (e) {} }
                } else {
                    await this._wvTabGroupReopen(tgtWin, groupID, opts);
                    if (hasX) { try { this._wvTabGroupMoveGroupTo(tgtWin, groupID, clientX as number); } catch (e) {} }
                }
                return;
            }
            if (home === tgtWin) {
                // Same window → reorder the group's block to the slot.
                if (isReaderTgt) { try { this._wvTabGroupReaderMoveGroupTo(tgtWin, groupID, hasX ? (clientX as number) : 1e6); } catch (e) {} }
                else { try { this._wvTabGroupMoveGroupTo(tgtWin, groupID, hasX ? (clientX as number) : 1e6); } catch (e) {} }
                return;
            }
            // Cross-window migrate, landing at the slot (clientX honoured by both
            // the main-bar and reader-strip branches of migrate).
            await this._wvTabGroupMigrateGroup(home, tgtWin, groupID, hasX ? (clientX as number) : 1e6, opts);
        } catch (e) { Zotero.debug("[Weavero] _wvMoveGroupToWindowAt err: " + e); }
    }

    /** Move/open targets for a whole GROUP — every open window (main + reader,
     *  same enumeration as the tabs' Move Tab menu), flagged with whether it's
     *  the group's current home. Saved groups have no home (all enabled). */
    _wvGroupMoveTargets(groupID: any): any[] {
        try {
            const home = this._wvTabGroupHomeWin(groupID);
            return (this._wvOpenInTargetWindows() || []).map((t: any) => ({
                win: t.win, name: t.name, isReader: !!t.isReader, isHome: t.win === home,
            }));
        } catch (e) { return []; }
    }

    /** Right-click menu on a tabs-menu group row. Verb matches the group's
     *  state — an OPEN group is *moved* ("Move Group to ▸"), a SAVED group is
     *  *opened* ("Open Group in ▸") — and the submenu lists every open window
     *  (icons, the group's home disabled "(here)") plus "New Window", the
     *  group-level twin of the tabs' Move Tab targets. */
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
            mk("Rename Group…", (p: any) => p._wvTabGroupPromptRename(win, groupID));
            pop.appendChild(doc.createXULElement("menuseparator"));
            // Verb by state: SAVED → "Open Group in ▸" (it reopens); OPEN →
            // "Move Group to ▸" (it relocates). The submenu mirrors the tabs'
            // Move Tab target list: every open window with its icon (the
            // group's home disabled "(here)"), then "New Window".
            const gRec: any = this._tabGroupsGet().find((x: any) => x.id === groupID);
            const isSaved = !!(gRec && gRec.saved) || this._wvTabGroupOpenCount(groupID) === 0;
            const sub = doc.createXULElement("menu");
            sub.setAttribute("label", isSaved ? "Open Group in" : "Move Group to");
            const subPop = doc.createXULElement("menupopup");
            sub.appendChild(subPop);
            const dark = !!(this._detectUIDark && this._detectUIDark());
            const mainIcon = this._wvMainWindowIconURI ? this._wvMainWindowIconURI(dark) : "";
            const readerIcon = this._wvWindowIconURI ? this._wvWindowIconURI(dark) : "";
            const newReaderWinIcon = this._wvNewReaderWindowIconURI ? this._wvNewReaderWindowIconURI(dark) : readerIcon;
            const mkTarget = (label: string, icon: string, disabled: boolean, fn: (p: any) => void) => {
                const mi = doc.createXULElement("menuitem");
                mi.classList.add("menuitem-iconic");
                mi.setAttribute("label", label);
                try { if (icon) mi.setAttribute("image", icon); } catch (er) {}
                if (disabled) mi.setAttribute("disabled", "true");
                else mi.addEventListener("command", (ev: any) => {
                    try {
                        ev.stopPropagation();
                        try { panel.hidePopup(); } catch (er) {}
                        const p: any = live();
                        if (p) fn(p);
                    } catch (er) {}
                });
                subPop.appendChild(mi);
            };
            for (const t of this._wvGroupMoveTargets(groupID)) {
                mkTarget(t.name + (t.isHome ? "  (here)" : ""), t.isReader ? readerIcon : mainIcon, t.isHome,
                    (p: any) => p._wvMoveGroupToWindowAt(groupID, t.win, t.isReader, null));
            }
            subPop.appendChild(doc.createXULElement("menuseparator"));
            mkTarget("New Window", newReaderWinIcon, false,
                (p: any) => p._wvTabGroupMoveToNewWindow(win, groupID));
            pop.appendChild(sub);
            pop.appendChild(doc.createXULElement("menuseparator"));
            mk("Delete Group", (p: any) => p._wvTabGroupCloseTabs(win, groupID));
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(e.screenX, e.screenY, true);
        } catch (er) { Zotero.debug("[Weavero] _wvTabsMenuGroupContext err: " + er); }
    }

    /** Prompt for a new name and rename a tab group. Used by the list-all-tabs
     *  popup group context menu — a modal prompt works for open, saved, and
     *  other-window groups alike (no live anchor node needed, unlike the chip
     *  editor _wvShowTabGroupEditor). */
    _wvTabGroupPromptRename(win: any, groupID: any) {
        try {
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return;
            const out = { value: g.name || "" };
            const ok = Services.prompt.prompt(
                win, "Rename Tab Group", "Group name:", out, null, { value: false });
            if (!ok) return;
            this._tabGroupUpdate(groupID, { name: (out.value || "").trim() });
            this._wvTabGroupApplyEverywhere();
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupPromptRename err: " + e); }
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
                let t: any = null;
                const id = row.getAttribute(idAttr);
                if (id) {
                    if (isReader) { const st = win._wvWT; t = st && st.tabs.find((x: any) => String(x.id) === String(id)); }
                    else { t = Z._tabs.find((x: any) => x && x.id === id); }
                } else if ((row as any)._wvSrcTabId != null && (row as any)._wvSrcWin) {
                    // Other-window / reader-window row (no native id) — resolve its
                    // tab in its OWN window so groups nest for EVERY window, not just
                    // the one the popup is open in.
                    t = (this as any)._wvTabObjInWin((row as any)._wvSrcWin, (row as any)._wvSrcTabId, (row as any)._wvSrcIsReader);
                }
                if (!t || (t as any)._wvGroupExcluded) return null;   // separate copy kept out
                const gid = this._wvTabGroupStamp(t);                  // per-tab membership
                return gid ? (groups.find((g: any) => g.id === gid && !(g as any).saved) || null) : null;
            };
            // Tab rows now live inside per-window wrappers (.wv-winscope) in the main
            // panel — and directly in the list for the reader clone. Scan EACH
            // container that holds rows, splitting into contiguous runs (library
            // sub-headers etc. break them) so a group nests within its library section.
            // A tab row is either a native row (data-tab-id) or a Weavero-built
            // other-window row (_wvSrcTabId) — group runs cover both.
            const isTabRow = (ch: any) => !!(ch && ch.classList && ch.classList.contains("row")
                && ((ch.getAttribute && ch.getAttribute(idAttr)) || (ch as any)._wvSrcTabId != null));
            const containers = new Set<any>();
            for (const r of list.querySelectorAll(".row")) { if (isTabRow(r) && r.parentElement) containers.add(r.parentElement); }
            if (!containers.size) containers.add(list);
            const sections: any[][] = [];
            for (const cont of containers) {
                let cur: any[] = [];
                for (const ch of [...cont.children]) {
                    if (isTabRow(ch)) cur.push(ch);
                    else if (cur.length) { sections.push(cur); cur = []; }
                }
                if (cur.length) sections.push(cur);
            }
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
                    // Drag source: drag this inline group header onto another window
                    // (in the popup) to move the whole group there.
                    (header as any)._wvGroupId = gid;
                    header.setAttribute("draggable", "true");
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
                    const cont = members[0].parentElement;
                    cont.insertBefore(header, members[0]);
                    let anchor: any = header;
                    for (const m of members) {
                        m.classList.add("wv-tgrow-member");
                        if (listCollapsed) m.classList.add("wv-tgrow-hidden");
                        cont.insertBefore(m, anchor.nextSibling);
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
                const row = doc.createElementNS(HTML_NS, "div");
                row.className = "wv-tgmenu-row";
                // open===0 now only happens for an explicitly SAVED group.
                row.setAttribute("title", open ? "Go to this group" : "Reopen this saved group");
                const hex = this._tabGroupColorHex(g.color);
                const dot = doc.createElementNS(HTML_NS, "span");
                dot.className = "wv-tgmenu-dot";
                if (open) {
                    dot.style.background = hex;             // live: filled square
                } else {
                    dot.style.background = "transparent";   // saved: outline only
                    dot.style.border = "2px solid " + hex;
                }
                row.appendChild(dot);
                const name = doc.createElementNS(HTML_NS, "span");
                name.className = "wv-tgmenu-name";
                name.textContent = g.name || "Unnamed group";
                row.appendChild(name);
                const count = doc.createElementNS(HTML_NS, "span");
                count.className = "wv-tgmenu-count";
                if (open) {
                    count.textContent = open + (open === 1 ? " tab" : " tabs");
                } else {
                    // SAVED group: show its parked tab count (members snapshot) too,
                    // not just "saved".
                    const n = (g.members || []).length;
                    count.textContent = n ? (n + (n === 1 ? " tab" : " tabs") + " · saved") : "saved";
                }
                row.appendChild(count);
                const gid = g.id;
                // Drop-target identity: dragging a popup tab row onto this group row
                // joins the tab to the group (see _wvResolvePopupDropTarget). Also a
                // DRAG SOURCE: drag the group row onto another window to move it there.
                (row as any)._wvGroupId = gid;
                row.setAttribute("draggable", "true");
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
            // The group's open tabs in THIS window (STAMPED, per-tab), display order.
            const entries: Array<{ id: any; title: string; itemID?: any }> = [];
            if (isReader && win._wvWT) {
                for (const t of win._wvWT.tabs) {
                    if (this._wvTabGroupStamp(t) === g.id) {
                        entries.push({ id: t.id, title: (this as any)._wvWTTabTitle(t) || "", itemID: t.itemID });
                    }
                }
            } else if (win.Zotero_Tabs) {
                for (const t of win.Zotero_Tabs._tabs) {
                    if (this._wvTabGroupStamp(t) === g.id) {
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
            // One "Move group to …" row per OTHER open window (main + reader) —
            // the group-level twin of the tabs' Move Tab targets — then "new
            // window". (Replaces the old fixed reader-only "main window" row.)
            try {
                for (const t of this._wvGroupMoveTargets(groupID)) {
                    if (t.isHome || t.win === win) continue;
                    const tw = t.win, tr = t.isReader;
                    mkItem("Move group to " + t.name,
                        () => { try { this._wvMoveGroupToWindowAt(groupID, tw, tr, null); } catch (e) {} });
                }
            } catch (e) {}
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
    /** A 12px group-colour dot for menus. `outline` draws the SAVED-group
     *  variant — a hollow ring (transparent centre + coloured stroke), matching
     *  the tabs-menu list's saved-group dot; otherwise a filled circle. */
    _wvTabGroupDotImage(hex: string, outline?: boolean) {
        const circle = outline
            ? '<circle cx="6" cy="6" r="4" fill="none" stroke="' + hex + '" stroke-width="2"/>'
            : '<circle cx="6" cy="6" r="5" fill="' + hex + '"/>';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">'
            + circle + '</svg>';
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
            const strip = win.document.querySelector(".wv-window-tabstrip");
            if (!strip) return;
            // Version flag lives ON THE STRIP ELEMENT (like the DnD wiring):
            // a window-level flag survives strip rebuilds and left the new
            // strip without listeners ("can't multi-select in reader").
            if ((strip as any)._wvWTMultiSelVer === WIRE_VERSION) return;
            if (win._wvWTMultiSelOff) { try { win._wvWTMultiSelOff(); } catch (e) {} }
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const onMouseDown = (e: any) => { const p: any = live(); if (p) p._wvWTMultiSelMouseDown(win, e); };
            const onClick = (e: any) => { const p: any = live(); if (p) p._wvWTMultiSelClick(win, e); };
            strip.addEventListener("mousedown", onMouseDown, true);
            strip.addEventListener("click", onClick, true);
            win._wvWTMultiSelOff = () => {
                try { strip.removeEventListener("mousedown", onMouseDown, true); } catch (e) {}
                try { strip.removeEventListener("click", onClick, true); } catch (e) {}
                try { (strip as any)._wvWTMultiSelVer = null; } catch (e) {}
            };
            (strip as any)._wvWTMultiSelVer = WIRE_VERSION;
            win._wvWTMultiSelVer = WIRE_VERSION;   // kept for diagnostics only
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
            // Firefox model for a SAVED (parked) group: file the tab into the
            // group's stored members and CLOSE it; the group stays parked (no
            // reopen). It returns only when the whole group is reopened.
            const savedGrp = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (savedGrp && (savedGrp as any).saved) {
                this._tabGroupAddKey(groupID, key);
                try { this._wvWTCloseTab(win, tabId); } catch (e) {}
                try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
                return;
            }
            const home = this._wvTabGroupHomeWin(groupID);
            if (home && home !== win) { this._wvTabGroupSendDeckTabToWin(win, tab, home, groupID); return; }
            // Stamp DIRECTLY (per-tab membership is authoritative) — the old
            // claim-pass reliance left the tab ungrouped whenever a duplicate
            // copy of the item existed or the home guard misfired (same family
            // as the fixed main-window paths).
            this._wvTabGroupSetStamp(tab, groupID);
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
            const idx = st.tabs.findIndex((t: any) => t.itemID === itemID);
            let last = -1;
            for (let i = 0; i < st.tabs.length; i++) {
                if (i === idx) continue;
                if (this._wvTabGroupStamp(st.tabs[i]) === groupID) last = i;   // per-tab
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
                // Stamp the arrival DIRECTLY (newest unstamped copy).
                try {
                    const st2 = tgtWin._wvWT;
                    if (st2 && st2.tabs) {
                        for (let i = st2.tabs.length - 1; i >= 0; i--) {
                            const t = st2.tabs[i];
                            if (t.itemID === itemID && !t.wvGroupId) { t.wvGroupId = groupID; break; }
                        }
                    }
                } catch (e) {}
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
                        // Stamp the arrival DIRECTLY before clustering.
                        try {
                            for (const t of TZ._tabs) {
                                if (t && t.data && t.data.itemID === itemID && !this._wvTabGroupStamp(t)) {
                                    this._wvTabGroupSetStamp(t, groupID);
                                    break;
                                }
                            }
                        } catch (e) {}
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
                if (k) { this._wvTabGroupSetStamp(t, g.id); this._tabGroupAddKey(g.id, k); members.push(t); }
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

    /** Stamp ONE reader-window deck tab into an existing group (no group
     *  creation, no editor) — the silent building block behind "Open into / Move
     *  into New Group" for a reader window. Re-renders the strip, persists, and
     *  re-applies the group chips. */
    _wvReaderStampTabGroup(win: any, tabId: any, groupId: any) {
        try {
            const st = win && win._wvWT;
            if (!st || !st.tabs) return;
            const t = st.tabs.find((x: any) => String(x.id) === String(tabId));
            if (!t) return;
            const k = this._wvTabGroupDeckKey(t);
            if (!k) return;
            this._wvTabGroupSetStamp(t, groupId);
            this._tabGroupAddKey(groupId, k);
            try { (this as any)._wvWTRenderStrip(win); } catch (e) {}
            try { (this as any)._wvWTPersistSaveDebounced(); } catch (e) {}
            try { this._wvTabGroupApplyEverywhere(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvReaderStampTabGroup err: " + e); }
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
                            // The standalone "Add Tab to Group" submenu is merged into
                            // the native "Move Tab" submenu. THIS onShowing reliably has
                            // popup access (it's a real submenu, unlike the hidden
                            // move-tabs hook), so we inject the window/group move targets
                            // into Move Tab from here, then hide this entry.
                            try {
                                const winI = ctx.menuElem.ownerDocument.defaultView;
                                const popupI = ctx.menuElem.parentNode;
                                const tabIDI = ctx.tabID;
                                if (popupI && winI && tabIDI && tabIDI !== "zotero-pane"
                                        && typeof (self as any)._wvInjectMoveTargetsIntoNativeMoveMenu === "function") {
                                    const tgts = self._wvTabMultiSelTargets ? self._wvTabMultiSelTargets(winI, tabIDI) : [tabIDI];
                                    (self as any)._wvInjectMoveTargetsIntoNativeMoveMenu(winI, popupI, tgts);
                                }
                            } catch (e) {}
                            try { ctx.setVisible(false); } catch (e) {}
                            return;
                            // eslint-disable-next-line no-unreachable
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
                                // Don't offer the group the tab is already STAMPED into
                                // (single-tab case only — a multi-selection may mix
                                // members of several groups). Per-tab, NOT by item key:
                                // a DUPLICATE tab of a member's item is its own tab and
                                // CAN be added to the same group, so key it off the
                                // tab's stamp — else the group is wrongly filtered out.
                                let cur: any = null;
                                if (targets.length === 1) {
                                    try {
                                        const ZT: any = win.Zotero_Tabs;
                                        const tab = ZT && ZT._tabs.find((t: any) => t.id === tabID);
                                        const sid = tab && self._wvTabGroupStamp(tab);
                                        if (sid) cur = groups.find((x: any) => x.id === sid) || null;
                                    } catch (e) {}
                                }
                                const others = groups.filter((x: any) => !cur || x.id !== cur.id);
                                if (others.length) {
                                    popup.appendChild(doc.createXULElement("menuseparator"));
                                    for (const g of others) {
                                        // Saved (parked) group → match the tabs-menu
                                        // list's design: a hollow group-colour dot and
                                        // a right-aligned "saved" label.
                                        const parked = self._wvTabGroupOpenCount(g.id) === 0;
                                        const gmi = mkItem(g.name || "Unnamed group",
                                            self._wvTabGroupDotImage(self._tabGroupColorHex(g.color), parked),
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
                                        if (parked) { try { const n = (g.members || []).length; gmi.setAttribute("acceltext", n ? (n + (n === 1 ? " tab" : " tabs") + " · saved") : "saved"); } catch (e) {} }
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
                                const win = ctx.menuElem.ownerDocument.defaultView;
                                // Per-tab: show "Remove from Group" only when THIS tab
                                // is stamped (a duplicate whose twin is grouped isn't).
                                const ctxTab = win && win.Zotero_Tabs && win.Zotero_Tabs._tabs.find((x: any) => x && x.id === ctx.tabID);
                                const grouped = ctxTab && self._wvTabGroupStamp(ctxTab);
                                if (!grouped) { ctx.setVisible(false); return; }
                                ctx.setVisible(true);
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
                                const win = ctx.menuElem.ownerDocument.defaultView;
                                const Z_Tabs: any = win && win.Zotero_Tabs;
                                // Per-tab: clear only the SELECTED tabs' stamps (leave a
                                // duplicate twin in the group), not every tab of the item.
                                for (const id of self._wvTabMultiSelTargets(win, ctx.tabID)) {
                                    const t = Z_Tabs && Z_Tabs._tabs.find((x: any) => x && x.id === id);
                                    const gid = t && self._wvTabGroupStamp(t);
                                    if (t && gid) self._wvTabGroupStampLeave(t, gid);
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
