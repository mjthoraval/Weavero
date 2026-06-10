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
                // The chip.
                ".wv-tab-group-chip {",
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
        // Single click = collapse/expand; right-click = editor. Toggle on
        // MOUSEDOWN, not click: React's tab-bar rewrites fire our observer
        // between mousedown and click, and the re-apply can re-insert the
        // chip — which cancels the synthesized click.
        chip.addEventListener("mousedown", (e: any) => {
            try {
                if (e.button !== 0) return;
                e.stopPropagation(); e.preventDefault();
                const p: any = live();
                if (p) p._wvTabGroupToggleCollapse(win, groupID);
            } catch (er) {}
        });
        // Swallow the residual click so nothing beneath reacts.
        chip.addEventListener("click", (e: any) => {
            try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
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
            for (const w of Zotero.getMainWindows()) this._applyTabGroups(w);
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
            for (const w of Zotero.getMainWindows()) this._applyTabGroups(w);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupAddTab err: " + e); }
    }

    _wvTabGroupCloseTabs(win: any, groupID: any) {
        try {
            const groups = this._tabGroupsGet();
            const g = groups.find((x: any) => x.id === groupID);
            if (!g) return;
            const memberKeys = new Set((g.members || []).map(
                (m: any) => m.libraryID + ":" + m.itemKey));
            const Z_Tabs: any = win.Zotero_Tabs;
            const ids: string[] = [];
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                const k = (this as any)._tabPinKey(t);
                if (k && memberKeys.has(k.libraryID + ":" + k.itemKey)) ids.push(t.id);
            }
            for (const id of ids) { try { Z_Tabs.close(id); } catch (e) {} }
            this._tabGroupDelete(groupID);
            for (const w of Zotero.getMainWindows()) this._applyTabGroups(w);
        } catch (e) { Zotero.debug("[Weavero] _wvTabGroupCloseTabs err: " + e); }
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
                for (const w of Zotero.getMainWindows()) this._applyTabGroups(w);
            });
            input.addEventListener("keydown", (e: any) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this._tabGroupUpdate(groupID, { name: input.value });
                    try { panel.hidePopup(); } catch (er) {}
                    for (const w of Zotero.getMainWindows()) this._applyTabGroups(w);
                }
            });
            nameRow.appendChild(input);
            body.appendChild(nameRow);

            body.appendChild(this._wvTabGroupSwatchRow(win, g.color, (c: string) => {
                this._tabGroupUpdate(groupID, { color: c });
                for (const w of Zotero.getMainWindows()) this._applyTabGroups(w);
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
                for (const w of Zotero.getMainWindows()) this._applyTabGroups(w);
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
