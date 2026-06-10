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
            if (doc.getElementById("wv-tab-group-styles")) return;
            const st = doc.createElementNS(HTML_NS, "style");
            st.id = "wv-tab-group-styles";
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
                // Collapsed members disappear (kept in Zotero_Tabs; chip shows count).
                "#tab-bar-container .tab.wv-group-hidden { display: none !important; }",
                // READER-window strip twins (Weavero-owned .wv-window-tab strip).
                ".wv-window-tabs .wv-window-tab.wv-grouped-tab { position: relative; }",
                ".wv-window-tabs .wv-window-tab.wv-grouped-tab::after {",
                "  content: \"\"; position: absolute; bottom: 0; height: 2px;",
                "  left: -4px; right: 0; border-radius: 1px;",
                "  background: var(--wv-group-color, #4f7ce0);",
                "  pointer-events: none;",
                "}",
                ".wv-window-tabs .wv-window-tab.wv-group-first::after { left: -7px; }",
                ".wv-window-tabs .wv-window-tab.wv-group-hidden { display: none !important; }",
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
                // Picker / editor panel internals.
                ".wv-tg-panel-body {",
                "  display: flex; flex-direction: column; gap: 6px;",
                "  padding: 10px; min-width: 230px; font-size: 13px;",
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
            if (win._wvTabGroupDragTabID != null) return;
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
            // Remove chips of deleted groups.
            for (const chip of doc.querySelectorAll(".wv-tab-group-chip")) {
                const gid = chip.getAttribute("data-wv-group");
                if (!gid || !liveGroupIDs.has(gid)) chip.remove();
            }
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
                const p: any = live();
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
            const title = (g.name || "Tab group") + " — "
                + (g.collapsed ? "click to expand" : "click to collapse") + ", right-click to edit";
            if (chip.getAttribute("title") !== title) chip.setAttribute("title", title);
        } catch (e) {}
    }

    _wvTabGroupToggleCollapse(win: any, groupID: any) {
        try {
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

    /** Add the tab to a group AND move it adjacent to the group's last open
     *  member (one-time positioning, like _pinTabByCommand). */
    _wvTabGroupAddTab(win: any, tabID: any, groupID: any) {
        try {
            const Z_Tabs: any = win.Zotero_Tabs;
            const tab = Z_Tabs && Z_Tabs._tabs.find((t: any) => t.id === tabID);
            const key = tab && (this as any)._tabPinKey(tab);
            if (!key) return;
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
            this._wvTGDbg("dragstart tabID=" + win._wvTabGroupDragTabID + " target=" + (e.target && e.target.tagName) + "." + (e.target && e.target.className && String(e.target.className).split(" ")[0]));
        } catch (er) { this._wvTGDbg("dragstart ERR=" + er); }
    }

    _wvTabGroupDnDDragOver(win: any, e: any) {
        try {
            win._wvTabDragLastX = e.clientX;
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

    /** Pointer left the tab bar mid-drag → drop the preview ghost. */
    _wvTabGroupDnDDragLeave(win: any, e: any) {
        try {
            const container = win.document.getElementById("tab-bar-container");
            if (e.relatedTarget && container && container.contains(e.relatedTarget)) return;
            this._wvTabGroupHideDropGhost(win);
        } catch (er) {}
    }

    _wvTabGroupDnDDrop(win: any, e: any) {
        try {
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
            win._wvTabGroupDragTabID = null;
            win._wvGroupDragSlot = null;
            this._wvTGDbg("dragend tabID=" + tabID + " clientX=" + (e && e.clientX) + " lastX=" + win._wvTabDragLastX);
            if (!tabID || tabID === "zotero-pane") return;
            win.setTimeout(() => {
                try { this._wvTabGroupHandleNativeDragEnd(win, { tabID }); } catch (e2) {}
            }, 80);
        } catch (er) { this._wvTGDbg("dragend ERR=" + er); }
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
            const idx = Z_Tabs._tabs.indexOf(tab);
            this._wvTGDbg("membership: tab=" + drag.tabID + " idx=" + idx + " lastX=" + win._wvTabDragLastX);
            const apply = () => { this._wvTabGroupApplyEverywhere(); };
            // Span of a group's OPEN members, excluding the dragged tab itself.
            const spanOf = (g: any) => {
                const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
                let min = Infinity, max = -Infinity;
                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                    const t = Z_Tabs._tabs[i];
                    if (!t || t.id === tab.id) continue;
                    const k = (this as any)._tabPinKey(t);
                    if (k && ks.has(k.libraryID + ":" + k.itemKey)) {
                        if (i < min) min = i;
                        if (i > max) max = i;
                    }
                }
                return (max < 0) ? null : { min, max };
            };
            // Was the pointer left of the group chip's midpoint at drop time?
            const leftOfChip = (g: any) => {
                try {
                    const chip = win.document.getElementById("wv-tgchip-" + g.id);
                    const lastX = win._wvTabDragLastX;
                    if (!chip || typeof lastX !== "number") return false;
                    const r = chip.getBoundingClientRect();
                    return lastX < r.left + r.width / 2;
                } catch (e) { return false; }
            };
            const curGroup = this._tabGroupOfKey(key.libraryID, key.itemKey);
            // JOIN: dropped within another group's span.
            for (const g of groups) {
                if (curGroup && g.id === curGroup.id) continue;
                const s = spanOf(g);
                this._wvTGDbg("membership: group '" + (g.name || g.id) + "' span=" + JSON.stringify(s));
                if (!s || idx < s.min || idx > s.max) continue;
                if (idx === s.min && leftOfChip(g)) { this._wvTGDbg("membership: at min but left of chip → no join"); continue; }
                this._wvTGDbg("membership: JOIN '" + (g.name || g.id) + "'");
                this._tabGroupAddKey(g.id, key);
                apply();
                return;
            }
            // LEAVE: a member dragged outside its own group's span.
            if (curGroup) {
                const s = spanOf(curGroup);
                if (!s) { apply(); return; }                     // sole member: group travels with it
                const out = (idx > s.max + 1)
                    || (idx < s.min)
                    || (idx === s.min && leftOfChip(curGroup));
                this._wvTGDbg("membership: own-group span=" + JSON.stringify(s) + " out=" + out);
                if (out) this._tabGroupRemoveKey(key.libraryID, key.itemKey);
                apply();
            } else {
                this._wvTGDbg("membership: no join (outside every span), not a member");
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
            // Never before the library tab, never before a pinned tab.
            slot = Math.max(this._wvTabGroupMinSlot(win, nonMembers), slot);
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
            const idx = st.tabs.indexOf(tab);
            const spanOf = (g: any) => {
                const ks = new Set((g.members || []).map((m: any) => m.libraryID + ":" + m.itemKey));
                let min = Infinity, max = -Infinity;
                for (let i = 0; i < st.tabs.length; i++) {
                    const t = st.tabs[i];
                    if (!t || t.id === tabId) continue;
                    const k = this._wvTabGroupDeckKey(t);
                    if (k && ks.has(k.libraryID + ":" + k.itemKey)) {
                        if (i < min) min = i;
                        if (i > max) max = i;
                    }
                }
                return (max < 0) ? null : { min, max };
            };
            const leftOfChip = (g: any) => {
                try {
                    const chip = win.document.getElementById("wv-tgchip-" + g.id);
                    if (!chip || typeof clientX !== "number") return false;
                    const r = chip.getBoundingClientRect();
                    return clientX < r.left + r.width / 2;
                } catch (e) { return false; }
            };
            const curGroup = this._tabGroupOfKey(key.libraryID, key.itemKey);
            this._wvTGDbg("reader membership: tab=" + tabId + " idx=" + idx);
            for (const g of groups) {
                if (curGroup && g.id === curGroup.id) continue;
                const s = spanOf(g);
                if (!s || idx < s.min || idx > s.max) continue;
                if (idx === s.min && leftOfChip(g)) continue;
                this._wvTGDbg("reader membership: JOIN '" + (g.name || g.id) + "'");
                this._tabGroupAddKey(g.id, key);
                this._wvTabGroupApplyEverywhere();
                return;
            }
            if (curGroup) {
                const s = spanOf(curGroup);
                if (!s) { this._wvTabGroupApplyEverywhere(); return; }
                const out = (idx > s.max + 1) || (idx < s.min)
                    || (idx === s.min && leftOfChip(curGroup));
                this._wvTGDbg("reader membership: own span=" + JSON.stringify(s) + " out=" + out);
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
            const strip = win.document.querySelector(".wv-window-tabstrip");
            if (e.relatedTarget && strip && strip.contains(e.relatedTarget)) return;
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
            // Insertion node: first tab whose midpoint is right of the pointer.
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
                const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
                ghost = doc.createElementNS(HTML_NS, "div");
                ghost.id = "wv-tg-drop-ghost";
                ghost.className = "wv-tab-group-chip";
                ghost.style.opacity = "0.55";
                ghost.style.pointerEvents = "none";
                ghost.style.setProperty("--wv-group-color", this._tabGroupColorHex(g && g.color));
                const label = doc.createElementNS(HTML_NS, "span");
                label.className = "wv-tgchip-label";
                label.textContent = (g && g.name) || "Group";
                ghost.appendChild(label);
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
                        for (const en2 of entries) {
                            try { await this._wvWTMountTab(tgtWin, en2.itemID, { allowDuplicate: false, select: false, await: true }); } catch (e) {}
                        }
                        try { this._wvWTRenderStrip(tgtWin); } catch (e) {}
                    } else {
                        try { tgtWin.focus(); } catch (e) {}      // Reader.open targets the focused main window
                        for (const en2 of entries) {
                            try {
                                if (en2.isNote) tgtWin.ZoteroPane.openNote(en2.itemID, { openInWindow: false });
                                else (Zotero.Reader as any).open(en2.itemID, null, { openInWindow: false, allowDuplicate: false });
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

    // ---- Panels (picker + editor) --------------------------------------------

    /** A reusable XUL panel with an HTML body div. One per window per id. */
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
            const doc = win.document;
            const g = this._tabGroupsGet().find((x: any) => x.id === groupID);
            if (!g) return;
            const panel = this._wvTabGroupEnsurePanel(win, "wv-tab-group-editor");
            const body = panel.querySelector(".wv-tg-panel-body");
            while (body.firstChild) body.removeChild(body.firstChild);

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

            const sep = doc.createElementNS(HTML_NS, "div");
            sep.className = "wv-tg-sep";
            body.appendChild(sep);

            const btnRow = doc.createElementNS(HTML_NS, "div");
            btnRow.className = "wv-tg-btnrow";
            const ungroup = doc.createElementNS(HTML_NS, "button");
            ungroup.className = "wv-tg-btn";
            ungroup.textContent = "Ungroup";
            ungroup.setAttribute("title", "Dissolve the group; its tabs stay open");
            ungroup.addEventListener("click", () => {
                try { panel.hidePopup(); } catch (e) {}
                this._tabGroupDelete(groupID);
                this._wvTabGroupApplyEverywhere();
            });
            btnRow.appendChild(ungroup);
            const closeAll = doc.createElementNS(HTML_NS, "button");
            closeAll.className = "wv-tg-btn";
            closeAll.textContent = "Close Group";
            closeAll.setAttribute("title", "Close the group's tabs and remove the group");
            closeAll.addEventListener("click", () => {
                try { panel.hidePopup(); } catch (e) {}
                this._wvTabGroupCloseTabs(win, groupID);
            });
            btnRow.appendChild(closeAll);
            body.appendChild(btnRow);

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

    /** Firefox's "New Group" flow: create instantly (auto-cycled color, no
     *  name), add the tab, then open the editor on the fresh chip so the
     *  user can name/recolor it. */
    _wvTabGroupNewFromTab(win: any, tabID: any) {
        try {
            const groups = this._tabGroupsGet();
            const color = WV_GROUP_COLORS[groups.length % WV_GROUP_COLORS.length].id;
            const g = this._tabGroupCreate("", color);
            this._wvTabGroupAddTab(win, tabID, g.id);
            try {
                win.setTimeout(() => {
                    try {
                        const chip = win.document.getElementById("wv-tgchip-" + g.id);
                        if (chip) this._wvShowTabGroupEditor(win, g.id, chip);
                    } catch (e) {}
                }, 120);
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupNewFromTab err: " + e); }
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
                                ctx.menuElem.setAttribute("label", "Add Tab to Group");
                                try { self._wvTabGroupRepositionBeforeMove(ctx.menuElem); } catch (e) {}
                                // Rebuild the submenu popup from the live groups.
                                const doc = ctx.menuElem.ownerDocument;
                                const win = doc.defaultView;
                                const popup = ctx.menuElem.querySelector("menupopup");
                                if (!popup) return;
                                while (popup.firstChild) popup.removeChild(popup.firstChild);
                                const tabID = ctx.tabID;
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
                                mkItem("New Group", null, () => self._wvTabGroupNewFromTab(win, tabID));
                                const groups = self._tabGroupsGet();
                                // Don't offer the group the tab is already in.
                                const cur = self._tabGroupOfKey(item.libraryID, item.key);
                                const others = groups.filter((x: any) => !cur || x.id !== cur.id);
                                if (others.length) {
                                    popup.appendChild(doc.createXULElement("menuseparator"));
                                    for (const g of others) {
                                        mkItem(g.name || "Unnamed group",
                                            self._wvTabGroupDotImage(self._tabGroupColorHex(g.color)),
                                            () => self._wvTabGroupAddTab(win, tabID, g.id));
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
                                ctx.menuElem.setAttribute("label", "Remove from Tab Group");
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
                                self._tabGroupRemoveKey(item.libraryID, item.key);
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
