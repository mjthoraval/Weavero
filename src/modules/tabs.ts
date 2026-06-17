// Module: tabs-menu (the "List all tabs" dropdown chevron at the
// right of the tab strip) plus the tab-bar decoration overlays.
//
// - Library grouping: re-orders rows by library, adds dim section
//   headers above each group, hides rows whose library is filtered
//   out (per-library tickbox).
// - File-type filter popup: funnel button + per-attachment-kind
//   tristate toggles, mirrored on the items-tree filter pane.
// - Settings popup: gear button with "Sort by Library" + "Show
//   Annotations Count" toggles.
// - Tab-bar decoration: group-library glyph + tinted background +
//   custom tooltip on tabs whose item lives in a non-User library.
// - Annotation-count badge: matches the item-pane attachment-row
//   layout (12×12 themed icon + count).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via
// defineProperties (see modules/annotation.ts for the pattern).

// Zotero_Tabs is the per-window globals — it's declared as `any`
// rather than imported from zotero-types because zotero-types
// doesn't ship a typing for the runtime per-window global yet.
declare const Zotero_Tabs: any;

class _TabsMixin {
    [k: string]: any;
    /** Patch the "List all tabs" panel (the dropdown reachable from
     *  the chevron at the right of the tab bar) so its rows are
     *  grouped by library when more than one library has tabs open.
     *  Each group gets a small dimmed header above its first row;
     *  group order is User Library → group libraries alphabetically.
     *  Single-library cases are left alone.
     *
     *  Implementation: monkey-patch the panel instance's `refreshList`
     *  method. After the upstream method finishes laying out rows,
     *  we read each row's `data-tab-id`, look up its library, and
     *  reorder the DOM in-place. */
    _setupTabsMenuLibrarySort(win) {
        if (!win) return;
        // Tab-bar decoration (group-library tints + tooltip suffix)
        // is independent of the popup patch — set it up first so it
        // works even before the user opens the popup once.
        // Pref gate (Visual extras → Group-library glyph).
        if (this._getEnableGroupLibraryGlyph()) {
            try { this._setupTabBarLibraryDecoration(win); }
            catch (e) { Zotero.debug("[Weavero] tab-bar deco err: " + e); }
        } else {
            try { this._teardownTabBarLibraryDecoration(win); } catch (e) {}
        }
        // File-type filter button on the tabs-menu search row.
        // Set up here so the button is in place the first time the
        // panel opens.
        // Pref gate (Filters group → Tabs file-type filter).
        if (this._getEnableTabsFileTypeFilter()) {
            try { this._setupTabsMenuFileTypeFilter(win); }
            catch (e) { Zotero.debug("[Weavero] file-type filter err: " + e); }
        }
        // Pref gate (Filters group → Tabs library filter). When off,
        // skip patching refreshList entirely so the upstream popup
        // renders without per-library tickboxes.
        if (!this._getEnableTabsLibraryFilter()) return;
        const doc = win.document;
        const panel = doc && doc.getElementById("zotero-tabs-menu-panel");
        if (!panel) {
            // tabs-menu-panel is a custom element that may not be
            // upgraded yet on first window load — retry once.
            win.setTimeout(() => this._setupTabsMenuLibrarySort(win), 1000);
            return;
        }
        // If a previous Weavero load left a patched refreshList on
        // this panel, restore the upstream version before re-binding
        // — otherwise we'd build the new wrapper on top of the old
        // one (and on plugin upgrade the old wrapper's closure runs
        // forever, leaking stale code paths).
        if (panel._wvLibrarySortInstalled) {
            try {
                if (panel._wvOrigRefreshList) {
                    panel.refreshList = panel._wvOrigRefreshList;
                    delete panel._wvOrigRefreshList;
                }
            } catch (e) {}
            delete panel._wvLibrarySortInstalled;
        }
        panel._wvLibrarySortInstalled = true;
        // Always apply the wider-panel class once Weavero is active
        // on the panel, regardless of grouping / filter state — the
        // gear and funnel buttons flanking the search input need the
        // extra horizontal room either way, and a constant width
        // avoids a UI jump when the user toggles "Sort by Library".
        panel.classList.add("wv-tabs-menu-wide");
        const orig = panel.refreshList && panel.refreshList.bind(panel);
        if (!orig) return;
        panel._wvOrigRefreshList = orig;
        const self = this;
        panel.refreshList = function (opts) {
            orig(opts);
            try { self._groupTabsMenuByLibrary(panel); }
            catch (e) {
                Zotero.debug("[Weavero] tabs-menu library sort err: " + e);
            }
            // "Tab Groups" footer (focus / reopen saved groups) — resolve the
            // LIVE plugin so reloads pick up new code without re-patching.
            try {
                const lp = Zotero.Weavero && Zotero.Weavero.plugin;
                if (lp && lp._wvTabsMenuGroupsSection) lp._wvTabsMenuGroupsSection(panel);
            } catch (e) {}
        };
        // The panel may already have content from an earlier open
        // before the patch landed — refresh it now so the header
        // structure is in place even without a popupshowing event.
        try {
            if (panel.visible) panel.refreshList();
        } catch (e) {}
    }

    _teardownTabsMenuLibrarySort(win) {
        if (!win) return;
        const doc = win.document;
        // Always strip the tab-bar filter stylesheet first, regardless
        // of panel state — the rule is global to the window and would
        // outlive plugin disable if we only cleaned it up alongside
        // the panel patch.
        try {
            const tabBarStyle = doc
                && doc.getElementById("wv-tab-bar-filter-style");
            if (tabBarStyle) tabBarStyle.remove();
        } catch (e) {}
        // Tear down group-library tints and tooltip suffixes — also
        // global to the window, also needs cleaning regardless of
        // popup state.
        try { this._teardownTabBarLibraryDecoration(win); } catch (e) {}
        // Drop the file-type filter button + popup from the panel
        // and clear any open-popup outside-click listener.
        try {
            const p = doc && doc.getElementById("zotero-tabs-menu-panel");
            if (p) {
                const ftBtn = p.querySelector("#wv-tabs-menu-filetype-btn");
                if (ftBtn) ftBtn.remove();
                const ftPopup = p.querySelector(
                    "#wv-tabs-menu-filetype-popup");
                if (ftPopup) ftPopup.remove();
                const gearBtn = p.querySelector(
                    "#wv-tabs-menu-settings-btn");
                if (gearBtn) gearBtn.remove();
                const gearPopup = p.querySelector(
                    "#wv-tabs-menu-settings-popup");
                if (gearPopup) gearPopup.remove();
                delete p._wvFileTypeFilterInstalled;
            }
            if (this._wvFileTypeOutsideClose && doc) {
                doc.removeEventListener("mousedown",
                    this._wvFileTypeOutsideClose, true);
                delete this._wvFileTypeOutsideClose;
            }
            if (this._wvSettingsOutsideClose && doc) {
                doc.removeEventListener("mousedown",
                    this._wvSettingsOutsideClose, true);
                delete this._wvSettingsOutsideClose;
            }
        } catch (e) {}
        // Drop the filter-active marker class on the tabs-menu
        // button so its CSS reverts to the default appearance.
        try {
            const menuBtn = doc
                && doc.getElementById("zotero-tb-tabs-menu");
            if (menuBtn) {
                menuBtn.classList.remove("wv-tabs-menu-filter-active");
            }
        } catch (e) {}
        const panel = doc && doc.getElementById("zotero-tabs-menu-panel");
        if (!panel || !panel._wvLibrarySortInstalled) return;
        try {
            if (panel._wvOrigRefreshList) {
                panel.refreshList = panel._wvOrigRefreshList;
                delete panel._wvOrigRefreshList;
            }
        } catch (e) {}
        delete panel._wvLibrarySortInstalled;
        // Strip any existing headers and re-run the upstream refresh
        // so the panel returns to its native flat layout immediately
        // — otherwise our injected headers and reordered rows linger
        // until the user opens, closes, and reopens the panel.
        try {
            const list = panel._tabsList
                || panel.querySelector("#zotero-tabs-menu-list");
            if (list) {
                for (const h of list.querySelectorAll(
                    ".wv-tabs-menu-library-header, .wv-tgmenu-header, .wv-tgmenu-row")) h.remove();
            }
            panel.classList.remove("wv-tabs-menu-grouped");
            panel.classList.remove("wv-tabs-menu-wide");
            if (panel.visible && typeof panel.refreshList === "function") {
                panel.refreshList();
            }
        } catch (e) {}
    }

    /** Reorder the rendered rows under #zotero-tabs-menu-list into
     *  per-library groups, inserting a header before each group.
     *  The Library tab (`zotero-pane`) stays at the top, ungrouped
     *  — it can navigate between libraries on its own, so binding
     *  it to one section would be misleading. Headers carry the
     *  same colour-themed library icon used by Zotero's collection
     *  tree (`icon-library` / `icon-library-group` / `icon-feed`). */
    _groupTabsMenuByLibrary(panel) {
        if (!panel) return;
        const tabsList = panel._tabsList
            || panel.querySelector("#zotero-tabs-menu-list");
        if (!tabsList) return;
        const win = panel.ownerGlobal;
        const doc = panel.ownerDocument;
        const Zotero_Tabs = win && win.Zotero_Tabs;
        if (!Zotero_Tabs || !Array.isArray(Zotero_Tabs._tabs)) return;

        // Drop any prior headers from a previous invocation. The
        // upstream `refreshList` calls `replaceChildren()` first so
        // they're already gone — but defensively handle the case
        // where another tool injected its own headers.
        for (const h of tabsList.querySelectorAll(
            ".wv-tabs-menu-library-header")) h.remove();

        const allRows = [...tabsList.querySelectorAll(".row[data-tab-id]")];
        if (!allRows.length) return;

        // Decorate every row with the optional annotation count
        // before any grouping/visibility logic runs. The decoration
        // is idempotent — calling it on a row that already has a
        // count badge will replace the badge.
        if (this._tabsMenuShowAnnotationCount) {
            for (const row of allRows) {
                this._addAnnotationCountToRow(row);
            }
        }
        // Pin glyph on rows whose tab is pinned (independent of group/
        // ungrouped layout, so apply unconditionally up-front).
        try {
            for (const row of allRows) {
                this._decoratePinIconOnTabsMenuRow(row);
            }
        } catch (e) {}

        // If "Sort by Library" is off, the user wants the upstream
        // flat list. Apply only the file-type filter (per-row) and
        // leave sorting / headers alone. Tab-bar mirror still runs.
        if (this._tabsMenuGroupByLibrary === false) {
            panel.classList.remove("wv-tabs-menu-grouped");
            for (const row of allRows) {
                const passes = this._tabPassesFileTypeFilter(
                    win, row.dataset.tabId);
                if (passes) row.classList.remove("wv-tabs-menu-row-hidden");
                else row.classList.add("wv-tabs-menu-row-hidden");
            }
            // Mirror file-type filter on the main window's tab bar
            // (no library filter applies in this mode).
            this._applyTabBarFilter(win,
                () => null,
                () => true);
            try { this._refreshFileTypeFilterButtonState(panel); }
            catch (e) {}
            const ft = this._tabsMenuFileTypeFilter;
            const ftActive = ft
                && (ft.include.size > 0 || ft.exclude.size > 0);
            const menuBtn = doc.getElementById("zotero-tb-tabs-menu");
            if (menuBtn) {
                menuBtn.classList.toggle("wv-tabs-menu-filter-active",
                    !!ftActive);
            }
            return;
        }

        // Library tab is special — it doesn't have a single library
        // (it's the meta-tab that switches between them). Pull it
        // aside; the rest get grouped by their item's libraryID.
        let libraryPaneRow = null;
        const dataRows = [];
        for (const row of allRows) {
            if (row.dataset.tabId === "zotero-pane") libraryPaneRow = row;
            else dataRows.push(row);
        }

        const libraryForTab = (tabId) => {
            const tab = Zotero_Tabs._tabs.find(t => t.id === tabId);
            const itemID = tab && tab.data && tab.data.itemID;
            if (itemID == null) return null;
            try {
                const item = Zotero.Items.get(itemID);
                return item ? item.libraryID : null;
            } catch (e) { return null; }
        };

        const groupByLib = new Map();
        const orderedLibs = [];
        for (const row of dataRows) {
            let libID: number | string = libraryForTab(row.dataset.tabId);
            if (libID == null) libID = "__unknown__";
            if (!groupByLib.has(libID)) {
                groupByLib.set(libID, []);
                orderedLibs.push(libID);
            }
            groupByLib.get(libID).push(row);
        }

        // Skip rendering of headers when there's nothing to group:
        // - no data rows at all
        // - exactly one library AND no Library tab (single-section,
        //   header would be redundant)
        if (orderedLibs.length === 0) return;

        // Sort: user library first, then group / feed libraries
        // alphabetically. Unknown bucket lands at the end.
        const userLibID = (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        const libInfo = (id) => {
            if (id === "__unknown__") {
                return {
                    name: "Other",
                    iconClass: "icon-library",
                    sortKey: "z9_other",
                };
            }
            try {
                const lib = Zotero.Libraries.get(id);
                const name = (lib && lib.name) || ("Library " + id);
                let iconClass = "icon-library";
                if (lib && lib.libraryType === "group") {
                    iconClass = "icon-library-group";
                }
                else if (lib && lib.libraryType === "feed") {
                    iconClass = "icon-feed";
                }
                if (id === userLibID) {
                    return { name, iconClass, sortKey: "0_" + name };
                }
                return {
                    name, iconClass,
                    sortKey: "5_" + name.toLocaleLowerCase(),
                };
            } catch (e) {
                return {
                    name: "Library " + id,
                    iconClass: "icon-library",
                    sortKey: "9_" + id,
                };
            }
        };
        const ordered = orderedLibs
            .map(id => ({ id, ...libInfo(id) }))
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        // Skip headers entirely if there's only one library group
        // AND no Library tab — the existing render is already
        // correct, no value in adding a single redundant header.
        if (ordered.length === 1 && !libraryPaneRow) {
            panel.classList.remove("wv-tabs-menu-grouped");
            return;
        }

        // Marker class on the panel drives the row-indent + wider
        // panel rules. Kept in sync here so removing groupings
        // (e.g. closing a group's last tab) drops the indent and
        // restores the default width on the next refresh.
        panel.classList.add("wv-tabs-menu-grouped");

        // Per-library filter state — keyed by libraryID, value is
        // "include" | "exclude" | undefined. `include` narrows the
        // visible rows to libraries flagged include; `exclude`
        // hides that library's rows. Lives on the Weavero instance
        // so it survives panel close/reopen but resets across
        // plugin reloads (good enough for an MVP).
        if (!this._tabsMenuLibraryFilter) {
            this._tabsMenuLibraryFilter = new Map();
        }
        const filterState = this._tabsMenuLibraryFilter;
        const anyIncluded = [...filterState.values()].includes("include");
        const isLibVisible = (libID) => {
            const v = filterState.get(libID);
            if (v === "exclude") return false;
            if (anyIncluded) return v === "include";
            return true;
        };

        // Wipe and re-attach in the desired order.
        tabsList.replaceChildren();
        if (libraryPaneRow) tabsList.appendChild(libraryPaneRow);
        for (const grp of ordered) {
            const header = doc.createElement("div");
            header.className = "wv-tabs-menu-library-header";
            header.setAttribute("role", "presentation");

            // Themed library icon (same CSS class chain Zotero uses
            // in the collection tree — `.icon.icon-css.icon-library`
            // etc.) so the icon picks up the correct colour for each
            // library type without us having to ship a sprite.
            const icon = doc.createElement("span");
            icon.className = "icon icon-css " + grp.iconClass;
            header.appendChild(icon);

            const label = doc.createElement("span");
            label.className = "wv-tabs-menu-library-name";
            label.textContent = grp.name;
            header.appendChild(label);

            // Count badge — number of tabs in this library group.
            // Sits between the label and the tickbox so the eye lands
            // on the count immediately after the library name.
            const count = doc.createElement("span");
            count.className = "wv-tabs-menu-library-count";
            count.textContent = String(groupByLib.get(grp.id).length);
            header.appendChild(count);

            // Tickbox at the right end of the header — tri-state
            // include / exclude / off, same gesture as the items-
            // tree filter chips: click toggles include, Alt+click
            // toggles exclude. Pointer-events on the tickbox alone
            // (header itself stays click-through) so the surrounding
            // header doesn't capture stray clicks.
            const tick = doc.createElement("button");
            tick.type = "button";
            tick.className = "wv-tabs-menu-library-tick";
            const cur = filterState.get(grp.id);
            if (cur === "include") tick.dataset.selected = "true";
            else if (cur === "exclude") tick.dataset.excluded = "true";
            tick.title = "Click to filter to this library, "
                + "Alt+click to exclude. Click again to clear.";
            tick.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                const prev = filterState.get(grp.id);
                if (e.altKey) {
                    if (prev === "exclude") filterState.delete(grp.id);
                    else filterState.set(grp.id, "exclude");
                }
                else {
                    if (prev === "include") filterState.delete(grp.id);
                    else filterState.set(grp.id, "include");
                }
                // Re-run grouping so the visibility update lands
                // immediately. Re-using `panel.refreshList` would
                // also work but rebuilds rows from scratch — going
                // directly through this preserves the selection /
                // focus state of existing row nodes. Must regroup
                // BOTH library + tab-group sections (see helper).
                this._wvRegroupTabsMenu(panel);
            });
            header.appendChild(tick);

            tabsList.appendChild(header);

            // Honour the library filter AND the per-tab file-type
            // filter — hide rows whose library is excluded (or not
            // in the include set when any include exists), AND any
            // row whose tab fails the active file-type filter.
            // Headers always stay so the user can flip their tickbox
            // state at will.
            const libShows = isLibVisible(grp.id);
            for (const row of groupByLib.get(grp.id)) {
                const fileTypeOk = this._tabPassesFileTypeFilter(
                    win, row.dataset.tabId);
                const visible = libShows && fileTypeOk;
                if (visible) row.classList.remove("wv-tabs-menu-row-hidden");
                else row.classList.add("wv-tabs-menu-row-hidden");
                tabsList.appendChild(row);
            }
        }

        // Mirror the filter on the main window's tab bar: tabs in
        // hidden libraries should disappear from the top strip too,
        // not just the popup. The strip is React-rendered, so we
        // can't toggle classes on the tab nodes (next render would
        // wipe them); instead inject a stylesheet keyed by the
        // hidden tabs' data-id and update its content when the
        // filter changes.
        this._applyTabBarFilter(win, libraryForTab, isLibVisible);

        // Refresh the file-type filter button's "active" state so
        // its accent / clear-control reflect the latest selections.
        try { this._refreshFileTypeFilterButtonState(panel); } catch (e) {}

        // Tag the tabs-menu toolbar button when any filter is set
        // (library OR file-type) so the user gets a visible cue that
        // the popup list is narrowed. The class flows through CSS to
        // a coloured tint / dot. The button is a standard XUL
        // toolbarbutton so classList.add survives across React
        // re-renders (it's not React-managed).
        const ft = this._tabsMenuFileTypeFilter;
        const ftActive = ft
            && (ft.include.size > 0 || ft.exclude.size > 0);
        const anyFiltered = filterState.size > 0 || ftActive;
        const menuBtn = doc.getElementById("zotero-tb-tabs-menu");
        if (menuBtn) {
            menuBtn.classList.toggle("wv-tabs-menu-filter-active",
                anyFiltered);
        }
    }

    /** Re-apply BOTH passes the open tabs-menu needs: the per-library grouping
     *  AND the tab-group sections. `_groupTabsMenuByLibrary` replaceChildren()s
     *  the list, so any interactive caller (filter ticks, file-type popup) MUST
     *  re-run the group sections afterwards too — otherwise the group headers /
     *  footer vanish on the first filter toggle and never come back (even on
     *  unfilter). Mirrors the refreshList wrapper's post-orig() sequence. */
    _wvRegroupTabsMenu(panel) {
        try { this._groupTabsMenuByLibrary(panel); }
        catch (e) { Zotero.debug("[Weavero] tabs-menu library sort err: " + e); }
        try {
            const lp = Zotero.Weavero && Zotero.Weavero.plugin;
            if (lp && lp._wvTabsMenuGroupsSection) lp._wvTabsMenuGroupsSection(panel);
        } catch (e) {}
    }

    /** Build (or update) a stylesheet that hides tabs in the main
     *  window's tab bar for libraries that the popup filter has
     *  excluded. Persists across React re-renders since it's CSS,
     *  not a DOM attribute. The "zotero-pane" Library tab is never
     *  hidden — it's the meta-tab that switches between libraries
     *  in the first place. */
    _applyTabBarFilter(win, libraryForTab, isLibVisible) {
        if (!win) return;
        const doc = win.document;
        if (!doc) return;
        const Zotero_Tabs = win.Zotero_Tabs;
        if (!Zotero_Tabs || !Array.isArray(Zotero_Tabs._tabs)) return;

        const hiddenIds = [];
        for (const tab of Zotero_Tabs._tabs) {
            if (!tab || tab.id === "zotero-pane") continue;
            let libID = libraryForTab(tab.id);
            if (libID == null) libID = "__unknown__";
            const passesLib = isLibVisible(libID);
            const passesFt = this._tabPassesFileTypeFilter(win, tab.id);
            if (!passesLib || !passesFt) hiddenIds.push(tab.id);
        }

        let style = doc.getElementById("wv-tab-bar-filter-style");
        if (!hiddenIds.length) {
            if (style) style.remove();
            return;
        }
        if (!style) {
            style = doc.createElementNS(
                "http://www.w3.org/1999/xhtml", "style");
            style.id = "wv-tab-bar-filter-style";
            (doc.head || doc.documentElement).appendChild(style);
        }
        // CSS.escape ensures arbitrary tab ids embed safely in the
        // selector. `display: none` removes the slot too so the
        // remaining tabs reflow flush — no gap left behind.
        const sel = hiddenIds
            .map(id => `#tab-bar-container .tab[data-id="${
                win.CSS && win.CSS.escape ? win.CSS.escape(id) : id}"]`)
            .join(",\n");
        style.textContent = sel + " { display: none !important; }";
    }

    /** Apply a light tint to tabs whose item lives in a group library
     *  (matching the colour of Zotero's `library-group` icon, #59ADC4)
     *  and bind a custom tooltip to those tabs that renders the
     *  library icon + name (Zotero's plain `title` tooltip can't show
     *  an icon). Sets up a MutationObserver so the decoration
     *  survives React re-renders and tab open/close. Background
     *  colour is delivered via a per-window stylesheet keyed by
     *  `data-id` (React would wipe any class we added on the tab
     *  node itself).
     *
     *  IMPORTANT — Mozilla's `tooltip="..."` attribute resolves only
     *  on XUL ancestors; setting it on an HTML `<div>` is silently
     *  ignored, so the window-level `tooltip="html-tooltip"` wins.
     *  We therefore install the attribute on the closest XUL parent
     *  of the tab strip (`#zotero-title-bar`) and let the
     *  popupshowing handler decide per-trigger whether to render
     *  the rich library card or fall back to plain-title behavior. */
    _setupTabBarLibraryDecoration(win) {
        if (!win) return;
        const doc = win.document;
        if (!doc) return;
        const container = doc.getElementById("tab-bar-container");
        if (!container) {
            // Tab bar mounts asynchronously — retry shortly.
            win.setTimeout(
                () => this._setupTabBarLibraryDecoration(win), 1000);
            return;
        }

        // Custom XUL tooltip — populated dynamically each time it
        // shows from the trigger tab. Lives in the popupset so it
        // doesn't get reflowed with the rest of the document.
        if (!doc.getElementById("wv-tab-library-tooltip")) {
            const tooltip = doc.createXULElement("tooltip");
            tooltip.id = "wv-tab-library-tooltip";
            tooltip.addEventListener("popupshowing", (e) => {
                try {
                    const ok = this._populateTabTooltip(win, tooltip);
                    if (!ok) e.preventDefault();
                }
                catch (err) {
                    Zotero.debug("[Weavero] tooltip err: " + err);
                    e.preventDefault();
                }
            });
            let popupset = doc.querySelector("popupset");
            if (!popupset) {
                popupset = doc.createXULElement("popupset");
                doc.documentElement.appendChild(popupset);
            }
            popupset.appendChild(tooltip);
        }
        // Re-route tooltip resolution for the entire tab strip to our
        // custom tooltip. The handler dispatches on the trigger (group
        // library → rich card; everything else → plain title via the
        // `label` attribute, mirroring Zotero's html-tooltip behavior).
        const titleBar = doc.getElementById("zotero-title-bar");
        if (titleBar) {
            titleBar.setAttribute("tooltip", "wv-tab-library-tooltip");
        }

        // Inject the static stylesheet for pinned tabs (icon-only width,
        // hidden title + close). Lives in the chrome window's head so it
        // applies to React-rendered .tab nodes the moment our observer
        // adds the wv-pinned-tab class.
        try { this._ensurePinnedTabStyles(doc); } catch (e) {}
        try { this._ensureTabGroupStyles(doc); } catch (e) {}
        // Wire drag listeners on the tab-bar container so dragging a
        // regular tab into the pinned region pins it (and vice-versa).
        try { this._wireTabBarDrag(win); } catch (e) {}
        // Tab-group DnD: pointer tracking + group-chip drops.
        try { this._wvWireTabGroupDnD(win); } catch (e) {}
        // Ctrl/Shift+click multi-selection (for group commands on several tabs).
        try { (this as any)._wvWireTabMultiSel(win); } catch (e) {}

        // Initial pass before we attach the observer so the user
        // sees decoration + pin state immediately on plugin install / Zotero open.
        try { this._decorateTabBar(win); } catch (e) {}
        try { this._applyPinnedTabs(win); } catch (e) {}
        try { this._applyTabGroups(win); } catch (e) {}

        if (win._wvTabBarDecoMo) {
            try { win._wvTabBarDecoMo.disconnect(); } catch (e) {}
        }
        const mo = new win.MutationObserver(() => {
            try { this._decorateTabBar(win); } catch (e) {}
            try { this._applyPinnedTabs(win); } catch (e) {}
            try { this._applyTabGroups(win); } catch (e) {}
        });
        mo.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            // `data-id` changes when tabs are reordered or replaced.
            // `class` is needed because React rewrites className=cx('tab',
            // {selected, dragging}) on every selection change — that overwrites
            // our `wv-pinned-tab` class, expanding the pinned tab to full
            // width until we re-apply.
            attributeFilter: ["data-id", "class"],
        });
        win._wvTabBarDecoMo = mo;
    }

    // ---- Pinned tabs (Firefox-style icon-only pins, just right of library) -

    /** Read the persisted pin array. Each entry: { libraryID, itemKey }. */
    _pinnedTabsGet() {
        try {
            const raw = Zotero.Prefs.get("weavero.pinnedTabs");
            if (!raw) return [];
            const arr = JSON.parse(String(raw));
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    _pinnedTabsSet(arr) {
        try { Zotero.Prefs.set("weavero.pinnedTabs", JSON.stringify(arr || [])); } catch (e) {}
    }

    _pinnedTabsHas(libraryID, itemKey) {
        return this._pinnedTabsGet().some(e => e.libraryID === libraryID && e.itemKey === itemKey);
    }

    _pinnedTabsAdd(libraryID, itemKey) {
        const arr = this._pinnedTabsGet();
        if (arr.some(e => e.libraryID === libraryID && e.itemKey === itemKey)) return;
        arr.push({ libraryID, itemKey });
        this._pinnedTabsSet(arr);
    }

    _pinnedTabsRemove(libraryID, itemKey) {
        const arr = this._pinnedTabsGet().filter(
            e => !(e.libraryID === libraryID && e.itemKey === itemKey));
        this._pinnedTabsSet(arr);
    }

    /** Derive a pin key from a Zotero tab record. Returns `{libraryID,
     *  itemKey}` for tabs bound to a Zotero item (the case we care about —
     *  readers, item info tabs), or null for the library tab / other
     *  non-item-bound tabs. */
    _tabPinKey(tab) {
        if (!tab || !tab.data || !tab.data.itemID) return null;
        try {
            const it = Zotero.Items.get(tab.data.itemID);
            if (!it) return null;
            return { libraryID: it.libraryID, itemKey: it.key };
        } catch (e) { return null; }
    }

    /** Reconcile the tab strip with the persisted pin list. THIS RUNS ON
     *  EVERY TAB-BAR MUTATION (the observer above), so it MUST NOT force
     *  positions — Zotero's tab order is the source of truth for ordering
     *  (otherwise a user drag would be reverted on the next render).
     *
     *  Behaviour:
     *    1. Drop pin entries whose underlying item is gone (auto-unpin).
     *    2. Re-sync the pref's order to Zotero's current order of pinned
     *       open tabs, so drag-reorder persists across sessions.
     *    3. Mark each open pinned tab's DOM node with `wv-pinned-tab`;
     *       strip it from anything no longer pinned.
     *  Idempotent: only writes pref / mutates DOM when something actually
     *  changed. Initial PIN POSITIONING (placing a newly-pinned tab last
     *  among pins) is done in the menu's onCommand handler instead — see
     *  `_pinTabByCommand`. */
    _applyPinnedTabs(win) {
        try {
            if (!win || !win.document) return;
            const doc = win.document;
            const Z_Tabs: any = (win as any).Zotero_Tabs;
            if (!Z_Tabs || !Z_Tabs._tabs) return;
            const pinPref = this._pinnedTabsGet();
            if (!pinPref.length) {
                // Strip any stale class without scanning the rest.
                for (const node of doc.querySelectorAll("#tab-bar-container .tab.wv-pinned-tab")) {
                    node.classList.remove("wv-pinned-tab");
                }
                return;
            }
            const pinKeySet = new Set<string>();
            for (const p of pinPref) pinKeySet.add(p.libraryID + ":" + p.itemKey);

            // Walk Zotero's tabs in order; for each pinned-by-pref tab,
            // record its identity AND its tab.id. The resulting list IS the
            // display order — what we want the pref to reflect.
            const pinnedOpenInOrder: Array<{ libraryID: number, itemKey: string, tabID: string }> = [];
            const pinnedTabIDs = new Set<string>();
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const tab = Z_Tabs._tabs[i];
                if (!tab) continue;
                const k = this._tabPinKey(tab);
                if (!k) {
                    // `_tabPinKey` returns null when the underlying item
                    // isn't in the cache yet. On restart, Zotero re-creates
                    // tab DOM nodes from session before warming items —
                    // reader tabs self-load when the reader bootstraps,
                    // but a note tab can sit with its item un-cached
                    // indefinitely (until the user clicks it), leaving
                    // the pin pref unable to match → the tab renders
                    // expanded among the icon-only pins. Kick off an
                    // async load so we can re-fire once the item lands.
                    const iid = tab.data && tab.data.itemID;
                    if (iid) {
                        if (!(this as any)._wvPinPendingIIDs) {
                            (this as any)._wvPinPendingIIDs = new Set<number>();
                        }
                        const pending: Set<number> = (this as any)._wvPinPendingIIDs;
                        if (!pending.has(iid)) {
                            pending.add(iid);
                            Zotero.Items.getAsync(iid).then(() => {
                                pending.delete(iid);
                                try { this._applyPinnedTabs(win); } catch (_) {}
                            }).catch(() => { pending.delete(iid); });
                        }
                    }
                    continue;
                }
                if (!pinKeySet.has(k.libraryID + ":" + k.itemKey)) continue;
                pinnedOpenInOrder.push({ libraryID: k.libraryID, itemKey: k.itemKey, tabID: tab.id });
                pinnedTabIDs.add(tab.id);
            }

            // Rebuild the pref array: pinned tabs that are OPEN go first
            // (in Zotero's current order — captures drag-reorder), then
            // pinned items with no open tab keep their relative order from
            // the previous pref (won't visibly affect anything until the
            // user re-opens them). Stale pins (item gone) are dropped.
            const openSet = new Set<string>();
            for (const p of pinnedOpenInOrder) openSet.add(p.libraryID + ":" + p.itemKey);
            const newPref: Array<{ libraryID: number, itemKey: string }> = pinnedOpenInOrder
                .map(p => ({ libraryID: p.libraryID, itemKey: p.itemKey }));
            for (const p of pinPref) {
                if (openSet.has(p.libraryID + ":" + p.itemKey)) continue;
                // Pin with no open tab: keep IF the item still exists.
                try {
                    const id = Zotero.Items.getIDFromLibraryAndKey(p.libraryID, p.itemKey);
                    if (id) newPref.push(p);
                } catch (e) {}
            }
            // Persist only if the array changed (order or content).
            if (JSON.stringify(newPref) !== JSON.stringify(pinPref)) {
                this._pinnedTabsSet(newPref);
            }

            // Apply / strip the wv-pinned-tab class on DOM nodes. React rewrites
            // className on every selection change (cx('tab', {selected,
            // dragging})), so the MutationObserver fires `class` mutations
            // and this re-adds the class immediately after each clobber.
            const nodes = doc.querySelectorAll("#tab-bar-container .tab[data-id]");
            for (const node of nodes) {
                const id = node.getAttribute("data-id");
                if (pinnedTabIDs.has(id)) {
                    if (!node.classList.contains("wv-pinned-tab")) {
                        node.classList.add("wv-pinned-tab");
                    }
                }
                else if (node.classList.contains("wv-pinned-tab")) {
                    node.classList.remove("wv-pinned-tab");
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _applyPinnedTabs err: " + e); }
    }

    /** Dispatcher for moving a reader/note tab between main windows. A PDF
     *  reader is moved WITHOUT reloading — its live docshell is swapped into the
     *  target window (Firefox-style; see `_wvSwapMoveToMain`). Notes or any
     *  pre-commit failure fall back to the classic close+reopen. */
    _wvMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned) {
        const isNote = payload && (payload.readerType === "note" || payload.tabType === "note");
        if (!isNote && payload && typeof payload.itemID === "number") {
            const classic = () => {
                try { this._wvClassicMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned); }
                catch (e) { Zotero.debug("[Weavero] classic move fallback err: " + e); }
            };
            Promise.resolve()
                .then(() => this._wvSwapMoveToMain(srcWin, targetWin, payload, targetIndex, maxOtherPinned))
                .then((ok) => { if (!ok) classic(); })
                .catch((e) => { Zotero.debug("[Weavero] swap-move err, classic fallback: " + e); classic(); });
            return;
        }
        this._wvClassicMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned);
    }

    /** Before closing a source tab during a cross-window move: if it's the source
     *  window's SELECTED tab, move selection to the always-loaded library tab
     *  first. Otherwise Zotero auto-selects a neighbour on close, and if that
     *  neighbour is an UNLOADED reader it loads — but with the TARGET window
     *  focused, the new ReaderInstance reads getMostRecentWindow() = target and
     *  binds _tabContainer against the wrong window (reader.js:1808/1815), so it
     *  hangs at "Loading…". Selecting a loaded tab first means the close never
     *  triggers that stray load. */
    _wvSafeguardSourceSelectionBeforeClose(srcWin, sourceTabId) {
        try {
            const SZT: any = srcWin && srcWin.Zotero_Tabs;
            if (SZT && SZT.selectedID === sourceTabId && typeof SZT.select === "function") {
                SZT.select("zotero-pane");
            }
        } catch (e) {}
    }

    /** Rename a MAIN-window tab's id (Zotero_Tabs) in place, so a moved tab can
     *  keep its ORIGINAL id across a no-reload swap (the swap re-homes onto a
     *  donor with a fresh id; this renames it back once the source id is free).
     *  A tab id lives in: the model `_tabs[].id`, the deck panel element
     *  `<tab-content id=…>` (tabs.js add:652-654), `_selectedID`, the reader
     *  instance's `.tabID`, and Weavero's multi-select set. Update all, then
     *  `_update()` to re-render. No-op on a missing tab or an id collision. */
    _wvRenameTab(win, oldId, newId) {
        try {
            if (!win || !newId || oldId === newId) return false;
            const ZT: any = win.Zotero_Tabs;
            if (!ZT || !ZT._tabs) return false;
            const tab = ZT._tabs.find((t: any) => t && t.id === oldId);
            if (!tab) return false;
            if (ZT._tabs.some((t: any) => t && t.id === newId)) return false;   // collision
            try { const c = win.document.getElementById(oldId); if (c) c.id = newId; } catch (e) {}
            tab.id = newId;
            if (ZT._selectedID === oldId) ZT._selectedID = newId;
            try {
                const R: any = Zotero.Reader;
                const r = (R._readers || []).find((x: any) => x && x.tabID === oldId);
                if (r) r.tabID = newId;
            } catch (e) {}
            try { if (typeof ZT._update === "function") ZT._update(); } catch (e) {}
            try {
                const sel: any = win._wvSelTabIDs;
                if (sel && sel.has && sel.has(oldId)) { sel.delete(oldId); sel.add(newId); }
            } catch (e) {}
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvRenameTab err: " + e); return false; }
    }

    /** Multi-tab drag ghost: when the grabbed tab is part of a multi-selection,
     *  build a small semi-transparent STACK of every selected tab so the cursor
     *  ghost shows all the tabs being dragged, not just the one grabbed. (Firefox's
     *  literal cursor image is a single page thumbnail; this gives clearer "N tabs
     *  moving" feedback in its spirit.) The stack is appended INSIDE
     *  #tab-bar-container (so the clones inherit the real tab styling) and
     *  positioned `fixed` right under the cursor where the OS ghost renders —
     *  on-screen so Gecko actually snapshots it (it ignores off-screen elements),
     *  yet coincident with the ghost so there's no flash. Returns
     *  { el, offsetX, offsetY } — the offset puts the cursor at the grab point on
     *  the top (dragged) tab — or null when it isn't a multi-selection. The caller
     *  removes `el` after the drag snapshot is taken. */
    _wvBuildMultiTabDragImage(win, draggedTabId, grabX, grabY) {
        try {
            const sel = win && win._wvSelTabIDs;
            if (!sel || sel.size < 2 || !sel.has(draggedTabId)) return null;
            const doc = win.document;
            const container = doc.querySelector("#tab-bar-container");
            if (!container) return null;
            const all: any[] = Array.from(container.querySelectorAll(".tab[data-id]"));
            const selected = all.filter((el) => sel.has(el.getAttribute("data-id")));
            if (selected.length < 2) return null;
            // Strip order, with the grabbed tab moved last so it paints on top.
            const ordered = selected.filter((el) => el.getAttribute("data-id") !== draggedTabId);
            const draggedEl = selected.find((el) => el.getAttribute("data-id") === draggedTabId);
            if (draggedEl) ordered.push(draggedEl);

            const STEP = 8;   // px each stacked tab is offset down-right
            const baseRect = (draggedEl || ordered[0]).getBoundingClientRect();
            const w = baseRect.width, h = baseRect.height;

            const stack = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            stack.style.position = "fixed";
            stack.style.margin = "0";
            stack.style.padding = "0";
            stack.style.pointerEvents = "none";
            stack.style.opacity = "0.85";
            stack.style.zIndex = "2147483647";
            stack.style.width = (w + (ordered.length - 1) * STEP) + "px";
            stack.style.height = (h + (ordered.length - 1) * STEP) + "px";

            ordered.forEach((el, i) => {
                const r = el.getBoundingClientRect();
                const clone = el.cloneNode(true) as any;
                clone.classList.remove("wv-multisel");
                clone.style.position = "absolute";
                clone.style.left = (i * STEP) + "px";
                clone.style.top = (i * STEP) + "px";
                clone.style.width = r.width + "px";
                clone.style.height = r.height + "px";
                clone.style.margin = "0";
                clone.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
                stack.appendChild(clone);
            });

            // Cursor offset = grab point on the top (dragged) tab, which sits at
            // ((n-1)*STEP, (n-1)*STEP) within the stack.
            const topOff = (ordered.length - 1) * STEP;
            let withinX = 20, withinY = 12;
            if (draggedEl) {
                const dr = draggedEl.getBoundingClientRect();
                withinX = Math.max(0, Math.min(dr.width, grabX - dr.left));
                withinY = Math.max(0, Math.min(dr.height, grabY - dr.top));
            }
            const offsetX = topOff + withinX, offsetY = topOff + withinY;
            // Position the stack (fixed = viewport coords) exactly where the OS
            // drag image will render — under the cursor at this same offset. That
            // keeps it ON-screen so Gecko reliably snapshots it (off-screen
            // elements are NOT captured by setDragImage), while coinciding with
            // the ghost so there's no visible flash. It stays a DOM descendant of
            // #tab-bar-container, so the clones inherit the real tab styling.
            stack.style.left = (grabX - offsetX) + "px";
            stack.style.top = (grabY - offsetY) + "px";
            container.appendChild(stack);
            return { el: stack, offsetX, offsetY };
        } catch (e) { return null; }
    }

    /** Pre-commit half of the no-reload swap: open a donor reader in the target
     *  window and resolve once its `<browser>` shell is ready. Returns the donor
     *  ReaderInstance, or null (safe to fall back to classic — we only opened a
     *  throwaway donor, which we close). `background` opens it unselected so it
     *  doesn't steal the target's active tab (Firefox adopts non-active tabs
     *  "without switching"). */
    async _wvSwapOpenDonor(targetWin, itemID, background) {
        const Reader: any = Zotero.Reader;
        let donor: any = null;
        try {
            try { if (targetWin.focus) targetWin.focus(); } catch (e) {}
            donor = await Reader.open(itemID, null, { openInWindow: false, allowDuplicate: true, openInBackground: background });
            if (await this._wvSwapWaitShell(donor, targetWin)) return donor;
            try { if (donor && donor.tabID) targetWin.Zotero_Tabs.close(donor.tabID); } catch (er) {}
            return null;
        } catch (e) {
            Zotero.debug("[Weavero] _wvSwapOpenDonor err: " + e);
            try { if (donor && donor.tabID) targetWin.Zotero_Tabs.close(donor.tabID); } catch (er) {}
            return null;
        }
    }

    /** Poll a freshly-opened donor until its shell (iframe + content window +
     *  tab container) is ready for a docshell swap. Returns false on timeout. */
    async _wvSwapWaitShell(donor, targetWin) {
        const sleep = (ms: number) => new Promise<void>((res) => {
            try { if (targetWin.setTimeout) targetWin.setTimeout(res, ms); else setTimeout(res, ms); }
            catch (e) { setTimeout(res, ms); }
        });
        for (let i = 0; i < 90; i++) {
            if (donor && donor._iframe && donor._iframe.contentWindow && donor.tabID && donor._tabContainer) return true;
            await sleep(120);
        }
        return false;
    }

    /** Committed half of the no-reload swap: trade the live source reader's
     *  docshell into the donor's `<browser>` via `swapDocShells` (the same
     *  primitive Firefox's adoptTab uses), RE-HOME the source ReaderInstance
     *  onto the donor's shell (its callbacks read `this._window` /
     *  `this._iframeWindow` dynamically, so updating those fields re-targets
     *  everything — no per-callback surgery), discard the donor instance
     *  (keeping its shell), close the source tab, and position/pin at the drop
     *  slot. Never falls back from here (that would double-move); best-effort on
     *  any post-swap error. Returns true.
     *
     *  Built on the docshell-swap mechanism Firefox uses for cross-window tab
     *  moves (browser/components/tabbrowser/content/tabbrowser.js, AGPL-3.0). */
    async _wvSwapCommitDonor(srcWin, targetWin, S, donor, payload, targetIndex, maxOtherPinned, opts?: any) {
        const Reader: any = Zotero.Reader;
        const itemID = payload && payload.itemID;
        const liveInner = S && S._internalReader;
        const sleep = (ms: number) => new Promise<void>((res) => {
            try { if (targetWin.setTimeout) targetWin.setTimeout(res, ms); else setTimeout(res, ms); }
            catch (e) { setTimeout(res, ms); }
        });
        const donorTabId = donor.tabID;
        try {
            const oldSIframe = S._iframe;
            S._iframe.swapDocShells(donor._iframe);
            await sleep(120);

            // Re-home S onto the donor's shell (target window). Callbacks read
            // this._window / this._iframeWindow dynamically, so updating the
            // fields re-targets them. Content-window listeners (error /
            // customEvent) ride along with the swapped docshell; the window
            // listeners and the element-level contextmenu listener are re-bound
            // explicitly below.
            try { srcWin.removeEventListener("pointerdown", S._handlePointerDown); } catch (e) {}
            try { srcWin.removeEventListener("pointerup", S._handlePointerUp); } catch (e) {}
            try { srcWin.removeEventListener("DOMContentLoaded", S._handleLoad); } catch (e) {}
            S._iframe = donor._iframe;
            S._iframeWindow = donor._iframe.contentWindow;
            S._tabContainer = donor._tabContainer;
            S._popupset = donor._popupset;
            S._window = targetWin;
            S.tabID = donorTabId;
            S._internalReader = liveInner;
            try { targetWin.addEventListener("pointerdown", S._handlePointerDown); } catch (e) {}
            try { targetWin.addEventListener("pointerup", S._handlePointerUp); } catch (e) {}
            try { targetWin.addEventListener("DOMContentLoaded", S._handleLoad); } catch (e) {}
            // If S arrives grafted (a torn-off standalone window moving back to a
            // tab), restore its tab-aware prototype methods.
            try { this._wvUngraftWindowGlue(S); } catch (e) {}

            // FULLY dispose the donor INSTANCE while keeping its shell (now S's).
            // The critical part is unregistering the donor's pref observers +
            // listeners so they never fire again on the shell S now owns —
            // leaving them registered is what corrupted readers in earlier
            // testing. We deliberately do NOT call donor.close()/uninit()
            // (those close the tab and flush now-stale state).
            try { donor._isUninitialized = true; } catch (e) {}
            try { if (donor._prefObserverIDs) donor._prefObserverIDs.forEach((id: any) => Zotero.Prefs.unregisterObserver(id)); } catch (e) {}
            try { if (donor._customEventHandler && donor._iframeWindow) donor._iframeWindow.removeEventListener("customEvent", donor._customEventHandler); } catch (e) {}
            try { if (donor._iframe && donor._handleReaderTextboxContextMenuOpen) donor._iframe.removeEventListener("contextmenu", donor._handleReaderTextboxContextMenuOpen); } catch (e) {}
            try { targetWin.removeEventListener("pointerdown", donor._handlePointerDown); } catch (e) {}
            try { targetWin.removeEventListener("pointerup", donor._handlePointerUp); } catch (e) {}
            try { targetWin.removeEventListener("DOMContentLoaded", donor._handleLoad); } catch (e) {}
            try { const i = Reader._readers.indexOf(donor); if (i >= 0) Reader._readers.splice(i, 1); } catch (e) {}
            // Ensure the surviving (re-homed) reader is registered. For main→main
            // S was already in _readers, but a re-homed reader-window instance
            // (e.g. a restored ReaderWindow moved to main) may not be — without
            // this it works visually but getByTabID can't find it, so closing it
            // leaks and a later move reloads instead of swapping.
            try { if (!Reader._readers.includes(S)) Reader._readers.push(S); } catch (e) {}

            // Re-bind S's element-level contextmenu listener onto the new shell.
            // It lives on the <browser> element, so it did NOT ride the docshell
            // swap; the new shell currently carries the donor's (removed above).
            try { if (oldSIframe && S._handleReaderTextboxContextMenuOpen) oldSIframe.removeEventListener("contextmenu", S._handleReaderTextboxContextMenuOpen); } catch (e) {}
            try { if (S._iframe && S._handleReaderTextboxContextMenuOpen) S._iframe.addEventListener("contextmenu", S._handleReaderTextboxContextMenuOpen); } catch (e) {}

            // Detach the source (now holding the donor's throwaway content). A
            // custom `opts.detachSource` handles non-main sources (e.g. a reader
            // window's _wvWT tab, which has no Zotero_Tabs); default = close the
            // source main tab (safeguarding its selection first).
            if (opts && typeof opts.detachSource === "function") {
                try { opts.detachSource(); } catch (e) {}
            } else {
                this._wvSafeguardSourceSelectionBeforeClose(srcWin, payload.sourceTabId);
                try { srcWin.Zotero_Tabs.close(payload.sourceTabId); } catch (e) {}
            }
            try { this._wvForgetTabGroupForItem(itemID); } catch (e) {}

            // Position + pin at the drop slot (mirror the classic place()).
            await sleep(150);
            const Z: any = targetWin.Zotero_Tabs;
            if (Z && Z._tabs && typeof Z.move === "function") {
                const tab = Z._tabs.find((t: any) => t && t.id === donorTabId);
                if (tab) {
                    const clamped = Math.max(1, Math.min(targetIndex, Z._tabs.length - 1));
                    Z.move(donorTabId, clamped);
                    const curIdx = Z._tabs.indexOf(tab);
                    if (curIdx <= maxOtherPinned && curIdx > 0) {
                        const item: any = Zotero.Items.get(itemID);
                        if (item) { this._pinnedTabsAdd(item.libraryID, item.key); this._applyPinnedTabs(targetWin); }
                    }
                }
            }

            // Preserve the ORIGINAL tab id across the move: the swap re-homed S
            // onto the donor (donorTabId); the source tab is now closed (its id is
            // free), so rename the donor back to the source's id — the tab keeps
            // its identity through the move. Only carry over a REAL Zotero tab id
            // (`tab-…`); a reader window's synthetic id (`wvwt-native`/`wvwt-N`)
            // isn't a meaningful main-window id (and `wvwt-native` isn't unique),
            // so leave the fresh donor id in that case.
            try {
                if (payload && payload.sourceTabId && payload.sourceTabId !== donorTabId
                        && /^tab-/.test(String(payload.sourceTabId))) {
                    this._wvRenameTab(targetWin, donorTabId, payload.sourceTabId);
                }
            } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _wvSwapCommitDonor post-commit err: " + e);
        }
        return true;
    }

    /** Undo the window-glue graft applied by `_wvSwapTearOffToWindow`: a torn-off
     *  reader is a `ReaderTab` wearing `ReaderWindow` clothing (instance props
     *  shadowing its prototype). When it later moves back into a tab (main bar or
     *  a reader-window strip), delete those props so the prototype's tab-aware
     *  `_setTitleValue` / `close` take over again. No-op if not grafted. */
    _wvUngraftWindowGlue(S: any) {
        try {
            if (!S || !S._wvGrafted) return;
            try { delete S._setTitleValue; } catch (e) {}
            try { delete S._switchReaderSubtype; } catch (e) {}
            try { delete S.close; } catch (e) {}
            try { delete S._onClose; } catch (e) {}
            S._wvGrafted = false;
            S._wvGraftWin = null;
        } catch (e) { Zotero.debug("[Weavero] _wvUngraftWindowGlue err: " + e); }
    }

    /** No-reload TEAR-OFF: move ONE live reader into a BRAND-NEW standalone
     *  reader window without reloading. Opens a donor `ReaderWindow`, trades the
     *  live source docshell into its `<browser>` via `swapDocShells`, re-homes
     *  the source instance onto the donor window, then GRAFTS the ReaderWindow
     *  window-glue (menus, title, close) onto it.
     *
     *  Why graft: every in-window swap keeps the SAME instance alive and re-homes
     *  it, which works because both ends use the same class. A standalone window
     *  expects a `ReaderWindow`, but the live instance is a `ReaderTab` whose
     *  pdf.js callbacks are bound to it and can't be transplanted — so it must
     *  become the window's reader, with `ReaderWindow`'s window-only glue grafted
     *  on (the same identity-carrying idea as `_wvRenameTab`, across the class
     *  boundary). `opts.detachSource(sourceTabId)` removes the now-empty source
     *  tab (default: close it on the main window). Returns the new standalone
     *  window on success (truthy), or false BEFORE any mutation so the caller can
     *  fall back to the classic (reload) tear-off.
     *
     *  Built on the docshell-swap mechanism Firefox uses for cross-window tab
     *  moves (browser/components/tabbrowser/content/tabbrowser.js, AGPL-3.0). */
    async _wvSwapTearOffToWindow(srcWin: any, S: any, itemID: any, opts?: any) {
        const Reader: any = Zotero.Reader;
        if (!S || !S._iframe || typeof S._iframe.swapDocShells !== "function" || !S._internalReader) return false;
        if (itemID == null) return false;
        const sleep = (ms: number) => new Promise<void>((res) => {
            try { if (srcWin && srcWin.setTimeout) srcWin.setTimeout(res, ms); else setTimeout(res, ms); }
            catch (e) { setTimeout(res, ms); }
        });
        let donor: any = null;
        try {
            donor = await Reader.open(itemID, null, { openInWindow: true, allowDuplicate: true });
        } catch (e) { Zotero.debug("[Weavero] tear-off donor open err: " + e); return false; }
        if (!donor) return false;
        // Wait for the donor WINDOW shell (its DOMContentLoaded sets these async).
        let ready = false;
        for (let i = 0; i < 90; i++) {
            if (donor._window && donor._iframe && donor._iframe.contentWindow && donor._popupset) { ready = true; break; }
            await sleep(120);
        }
        if (!ready) { try { if (donor.close) donor.close(); } catch (e) {} return false; }

        const liveInner = S._internalReader;
        const oldSIframe = S._iframe;
        const oldSWin = S._window;
        const donorWin = donor._window;
        const sourceTabId = S.tabID;
        try {
            S._iframe.swapDocShells(donor._iframe);
            await sleep(120);

            // S was a tab: drop its main-window listeners. A reader window has no
            // Zotero_Tabs, so its pointer handlers would throw — don't re-add.
            try { oldSWin.removeEventListener("pointerdown", S._handlePointerDown); } catch (e) {}
            try { oldSWin.removeEventListener("pointerup", S._handlePointerUp); } catch (e) {}
            try { oldSWin.removeEventListener("DOMContentLoaded", S._handleLoad); } catch (e) {}

            // Re-home S onto the donor window's shell.
            S._iframe = donor._iframe;
            S._iframeWindow = donor._iframe.contentWindow;
            S._popupset = donor._popupset;
            S._window = donorWin;
            S._internalReader = liveInner;

            // GRAFT ReaderWindow window-glue. The window's menu/close globals were
            // bound to the donor (a ReaderWindow); rebind them to its prototype
            // methods bound to S, which carries the base fields they read
            // (_item / _type / _internalReader / _window). `close` is a custom,
            // failure-tolerant version of ReaderWindow.close so a throwing uninit
            // can't strand the window open.
            const RW = Object.getPrototypeOf(donor);   // ReaderWindow.prototype
            try { donorWin.reader = S; } catch (e) {}
            try { donorWin.onFileMenuOpen = RW._onFileMenuOpen.bind(S); } catch (e) {}
            try { donorWin.onEditMenuOpen = RW._onEditMenuOpen.bind(S); } catch (e) {}
            try { donorWin.onGoMenuOpen = RW._onGoMenuOpen.bind(S); } catch (e) {}
            try { donorWin.onViewMenuOpen = RW._onViewMenuOpen.bind(S); } catch (e) {}
            try { donorWin.onWindowMenuOpen = RW._onWindowMenuOpen.bind(S); } catch (e) {}
            S._wvGrafted = true;
            S._wvGraftWin = donorWin;
            try { S._setTitleValue = RW._setTitleValue.bind(S); } catch (e) {}
            try { S._switchReaderSubtype = RW._switchReaderSubtype.bind(S); } catch (e) {}
            S._onClose = () => {
                try { const i = Reader._readers.indexOf(S); if (i >= 0) Reader._readers.splice(i, 1); } catch (e) {}
                try { Zotero.Session.debounceSave(); } catch (e) {}
            };
            S.close = () => {
                try { S.uninit(); } catch (e) { Zotero.debug("[Weavero] tear-off S.uninit err: " + e); }
                try { if (S._window && S._window.close) S._window.close(); } catch (e) {}
                try { S._onClose(); } catch (e) {}
            };
            try { S._setTitleValue(S._title); } catch (e) {}
            try { S._switchReaderSubtype(S._type); } catch (e) {}

            // The element-level contextmenu listener lives on the <browser> and so
            // did NOT ride the docshell swap — re-bind it onto the new shell.
            try { if (oldSIframe && S._handleReaderTextboxContextMenuOpen) oldSIframe.removeEventListener("contextmenu", S._handleReaderTextboxContextMenuOpen); } catch (e) {}
            try { if (S._iframe && S._handleReaderTextboxContextMenuOpen) S._iframe.addEventListener("contextmenu", S._handleReaderTextboxContextMenuOpen); } catch (e) {}

            // Dispose the donor INSTANCE while keeping its window + shell (now S's):
            // unregister its observers/listeners and drop it from _readers, but do
            // NOT call donor.close()/uninit() (those close the window / touch the
            // shared iframe). Its throwaway content was swapped into the source tab
            // and dies with it.
            try { donor._isUninitialized = true; } catch (e) {}
            try { if (donor._prefObserverIDs) donor._prefObserverIDs.forEach((id: any) => Zotero.Prefs.unregisterObserver(id)); } catch (e) {}
            try { const i = Reader._readers.indexOf(donor); if (i >= 0) Reader._readers.splice(i, 1); } catch (e) {}
            try { if (!Reader._readers.includes(S)) Reader._readers.push(S); } catch (e) {}

            // If Weavero already wired the donor window's multi-tab strip, point
            // its native-tab entry at S (it was captured as the donor). If not yet
            // wired, _wvWTEnsureNativeTab will later find S via _wvWTFindNativeReader.
            try {
                const st = donorWin._wvWT;
                if (st && st.tabs) {
                    const nat = st.tabs.find((t: any) => t && t.native);
                    if (nat) { nat.reader = S; nat.itemID = itemID; nat.type = S._type || nat.type; }
                }
            } catch (e) {}

            // Wire the reader-window chrome (Firefox-style tab strip + window
            // controls + item pane + the _wvWT model). Weavero normally does this
            // from the reader's `renderToolbar` event, which fires when content
            // LOADS — but our swap moves ALREADY-rendered content in, so that event
            // never fires for this window. Wire it explicitly so the torn-off
            // window matches a normally-opened reader window. Re-run on a short
            // delay so any late DOM settling is picked up.
            const wireChrome = () => {
                try { (this as any)._ensureReaderWindowTabStrip(S); } catch (e) {}
                try { (this as any)._ensureReaderWindowItemPane(S); } catch (e) {}
                try { (this as any)._wvWTRenderStrip(donorWin); } catch (e) {}
            };
            try { wireChrome(); } catch (e) {}
            try { (donorWin.setTimeout || setTimeout)(wireChrome, 150); } catch (e) {}

            // S is no longer the SOURCE tab: clear its tabID so getByTabID / a
            // stray async tab-close notify can't match (and uninit) it while the
            // source tab closes.
            try { S.tabID = null; } catch (e) {}

            // Remove the now-empty source tab WITHOUT disposing S, then carry the
            // source tab's REAL id onto the new window's native tab so the tab
            // keeps its identity through the tear-off (Firefox-style). Do the
            // rename only AFTER the source close notify is delivered — otherwise
            // getByTabID(sourceTabId) would match the re-homed reader and uninit
            // it (the same async-notify race as the mount path). A synthetic
            // reader-window id (`wvwt-native`) carries nothing, so skip it.
            const realId = /^tab-/.test(String(sourceTabId));
            if (opts && typeof opts.detachSource === "function") {
                try { opts.detachSource(sourceTabId); } catch (e) {}
                // A _wvWT detach doesn't go through Zotero_Tabs/notify → no race.
                if (realId) { try { (this as any)._wvWTRenameTab(donorWin, "wvwt-native", sourceTabId); } catch (e) {} }
            } else {
                try { await (this as any)._wvCloseMainTabAndAwait(srcWin, sourceTabId); } catch (e) {}
                if (realId) { try { (this as any)._wvWTRenameTab(donorWin, "wvwt-native", sourceTabId); } catch (e) {} }
            }
            try { this._wvForgetTabGroupForItem(itemID); } catch (e) {}
            try { donorWin.focus(); } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _wvSwapTearOffToWindow commit err: " + e);
        }
        // Return the new standalone window (truthy = success; callers that only
        // need a boolean still work). Multi-tab tear-off mounts the rest into it.
        return donorWin;
    }

    /** Move ONE live PDF reader to another main window WITHOUT reloading, à la
     *  Firefox. Resolves the live source reader, opens a donor in the target
     *  window, then commits the docshell swap. Returns true on success, false
     *  (only before any mutation) to fall back to the classic move.
     *  `opts.background` opens the donor unselected. (Multi-select uses
     *  _wvMoveSelectionBetweenMains, which opens every donor up front so the tabs
     *  appear together, then commits.) */
    async _wvSwapMoveToMain(srcWin, targetWin, payload, targetIndex, maxOtherPinned, opts?: any) {
        const itemID = payload && typeof payload.itemID === "number" ? payload.itemID : null;
        if (itemID == null || !srcWin || !targetWin) return false;
        const background = !!(opts && opts.background);
        const Reader: any = Zotero.Reader;
        // Resolve the live, swappable source reader.
        let S: any = null;
        try { if (typeof Reader.getByTabID === "function") S = Reader.getByTabID(payload.sourceTabId); } catch (e) {}
        if (!S) S = (Reader._readers || []).find((r: any) => r && r.tabID === payload.sourceTabId);
        if (!S || !S._iframe || typeof S._iframe.swapDocShells !== "function" || !S._internalReader) return false;
        const donor = await this._wvSwapOpenDonor(targetWin, itemID, background);
        if (!donor) return false;
        return this._wvSwapCommitDonor(srcWin, targetWin, S, donor, payload, targetIndex, maxOtherPinned);
    }

    /** Move a reader/note tab from one MAIN window's strip to another:
     *  close it in the source window (flushing its state), then reopen it in
     *  the target window at the drop slot, auto-pinning if it landed in the
     *  pinned region. `Zotero.Reader.open` has no window param — it opens in
     *  the most-recently-active main window (reader.js:2731) — so we focus the
     *  target first; notes go through that window's own `ZoteroPane.openNote`.
     *  Mirrors the reader-merge drop's place-and-pin poll. */
    _wvClassicMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned) {
        try {
            const itemID = payload && typeof payload.itemID === "number" ? payload.itemID : null;
            if (itemID == null || !targetWin) return;
            const isNote = payload.readerType === "note" || payload.tabType === "note";
            // Leaving the window leaves the group (don't carry it to the target).
            try { (this as any)._wvForgetTabGroupForItem(itemID); } catch (e) {}
            // 1) Close the source tab in its own window (flushes its state).
            this._wvSafeguardSourceSelectionBeforeClose(srcWin, payload.sourceTabId);
            try {
                const srcTabs: any = srcWin && (srcWin as any).Zotero_Tabs;
                if (srcTabs && payload.sourceTabId && typeof srcTabs.close === "function") {
                    srcTabs.close(payload.sourceTabId);
                }
            } catch (e) {}
            // 2) Focus the target so getMainWindow() resolves to it, then open.
            try { if (targetWin.focus) targetWin.focus(); } catch (e) {}
            const Z_Tabs: any = (targetWin as any).Zotero_Tabs;
            const place = () => {
                const startTs = Date.now();
                const poll = () => {
                    try {
                        if (!Z_Tabs || !Z_Tabs._tabs) return;
                        const tab = Z_Tabs._tabs.find((t: any) => t && t.data && t.data.itemID === itemID);
                        if (!tab) {
                            if (Date.now() - startTs < 2000) targetWin.setTimeout(poll, 80);
                            return;
                        }
                        // Position the new tab at the drop slot.
                        try {
                            if (typeof Z_Tabs.move === "function") {
                                const clamped = Math.max(1, Math.min(targetIndex, Z_Tabs._tabs.length - 1));
                                Z_Tabs.move(tab.id, clamped);
                            }
                        } catch (e) {}
                        // Auto-pin if dropped inside the pinned region.
                        const curIdx = Z_Tabs._tabs.indexOf(tab);
                        if (curIdx <= maxOtherPinned && curIdx > 0) {
                            try {
                                const item: any = Zotero.Items.get(itemID);
                                if (item) {
                                    this._pinnedTabsAdd(item.libraryID, item.key);
                                    this._applyPinnedTabs(targetWin);
                                }
                            } catch (e) {}
                        }
                    } catch (e) {}
                };
                targetWin.setTimeout(poll, 200);
            };
            const open = () => {
                try {
                    if (isNote) {
                        const ZP: any = (targetWin as any).ZoteroPane;
                        if (ZP && typeof ZP.openNote === "function") ZP.openNote(itemID, { openInWindow: false });
                        else if (ZP && typeof ZP.viewNote === "function") ZP.viewNote(itemID);
                    } else {
                        try { if (targetWin.focus) targetWin.focus(); } catch (e) {}
                        (Zotero.Reader as any).open(itemID, null, { openInWindow: false, allowDuplicate: true });
                    }
                } catch (e) { Zotero.debug("[Weavero] _wvMoveTabBetweenMains open err: " + e); }
                place();
            };
            // Defer the open a tick so the source tab's final state write lands
            // before the new tab reads it back (mirrors _moveReaderToTab's 120ms).
            const st = (targetWin && targetWin.setTimeout) ? targetWin.setTimeout.bind(targetWin) : setTimeout;
            st(open, 140);
        } catch (e) {
            Zotero.debug("[Weavero] _wvMoveTabBetweenMains err: " + e);
        }
    }

    /** Multi-select main→main: move EVERY selected source tab to the target main
     *  window, landing them contiguously from the drop slot (Firefox-style).
     *  With the no-reload swap on it runs in three phases, all hidden so nothing
     *  half-loaded ever flashes: PHASE 1 opens every donor in the BACKGROUND (the
     *  target's current active tab keeps showing); PHASE 2 commits the docshell
     *  swaps sequentially behind the scenes and closes the sources; PHASE 3
     *  reveals — selects the DRAGGED tab (now holding live content) and restores
     *  the multi-selection on the moved tabs. Mirrors Firefox's <tabs> drop
     *  handler, which selects the dragged tab and re-ranges the selection
     *  (addRangeToMultiSelectedTabs). */
    async _wvMoveSelectionBetweenMains(srcWin, targetWin, ids, targetIndex, maxOtherPinned, draggedId?: any) {
        try {
            const ZT: any = srcWin && (srcWin as any).Zotero_Tabs;
            if (!ZT || !ZT._tabs || !targetWin || !ids || !ids.length) return;
            const payloads: any[] = [];
            for (const id of ids) {
                const t = ZT._tabs.find((x: any) => x && x.id === id);
                const iid = t && t.data && t.data.itemID;
                if (iid != null) payloads.push({ itemID: iid, sourceTabId: id, tabType: t.type || "", readerType: t.type === "note" ? "note" : "" });
            }
            if (!payloads.length) return;
            // On a DRAG-DROP, Firefox makes the *dragged* tab the destination's
            // active tab — `adoptTab(tab, {selectTab: tab == draggedTab})` in the
            // <tabs> drop handler (tabs.js). (That's distinct from the context-menu
            // "Move to New Window" command, replaceTabsWithWindow, which keeps the
            // source's active tab.) So swap the dragged tab foreground and adopt
            // the rest in the background "without switching". Fall back to the
            // source-active tab, then the first, if no dragged id was passed.
            let activeId: any = draggedId;
            if (!payloads.some((p) => p.sourceTabId === activeId)) {
                try { activeId = ZT.selectedID; } catch (e) { activeId = null; }
            }
            if (!payloads.some((p) => p.sourceTabId === activeId)) activeId = payloads[0].sourceTabId;
            try { if (srcWin._wvSelTabIDs && srcWin._wvSelTabIDs.clear) srcWin._wvSelTabIDs.clear(); this._wvTabMultiSelSync(srcWin); } catch (e) {}

            // Assign each tab its drop-slot index in source order.
            const baseIdx = (typeof targetIndex === "number") ? targetIndex : 1;
            payloads.forEach((p: any, i: number) => { p._idx = baseIdx + i; });

            const Reader: any = Zotero.Reader;
            const resolveSrc = (tabId: any) => {
                let S: any = null;
                try { if (typeof Reader.getByTabID === "function") S = Reader.getByTabID(tabId); } catch (e) {}
                if (!S) S = (Reader._readers || []).find((r: any) => r && r.tabID === tabId);
                return (S && S._iframe && typeof S._iframe.swapDocShells === "function" && S._internalReader) ? S : null;
            };

            // Partition into no-reload-swappable jobs vs. classic (notes or no
            // live source) which go through close+reopen.
            const swapJobs: any[] = [];
            const classicPls: any[] = [];
            for (const pl of payloads) {
                const isNote = pl.readerType === "note" || pl.tabType === "note";
                const S = !isNote ? resolveSrc(pl.sourceTabId) : null;
                if (S) swapJobs.push({ pl, S }); else classicPls.push(pl);
            }

            const newSelIds: any[] = [];   // new tab ids to re-multi-select in the target
            let activeNewId: any = null;   // new id of the dragged tab → becomes active

            // PHASE 1 — open every donor in the BACKGROUND so the target's current
            // active tab keeps showing: no half-loaded reader ever flashes (that
            // was the flicker). Each Reader.open creates its tab element this task
            // turn and only then loads async (reader.js: `await waitForDataLoad`
            // then `new ReaderTab`), so firing them all without awaiting between
            // makes them appear in one paint. Then wait for each shell.
            if (swapJobs.length) {
                for (const job of swapJobs) {
                    try { if (targetWin.focus) targetWin.focus(); } catch (e) {}
                    try { job.donorPromise = Reader.open(job.pl.itemID, null, { openInWindow: false, allowDuplicate: true, openInBackground: true }); }
                    catch (e) { job.donorPromise = Promise.resolve(null); }
                }
                for (const job of swapJobs) {
                    try { job.donor = await job.donorPromise; } catch (e) { job.donor = null; }
                    job.ready = job.donor ? await this._wvSwapWaitShell(job.donor, targetWin) : false;
                    if (job.donor && !job.ready) { try { targetWin.Zotero_Tabs.close(job.donor.tabID); } catch (e) {} }
                }
                // PHASE 2 — commit the swaps SEQUENTIALLY (concurrent docshell
                // surgery corrupts readers) while every tab stays HIDDEN: swap the
                // live content in, close each source, slide to the drop slot. The
                // target's pre-existing active tab is still what's on screen, so
                // none of this is visible — no flicker. Commit in source order.
                for (const job of swapJobs) {
                    if (job.ready && job.donor) {
                        try {
                            await this._wvSwapCommitDonor(srcWin, targetWin, job.S, job.donor, job.pl, job.pl._idx, maxOtherPinned);
                            newSelIds.push(job.donor.tabID);
                            if (job.pl.sourceTabId === activeId) activeNewId = job.donor.tabID;
                        } catch (e) {}
                    } else {
                        try { this._wvClassicMoveTabBetweenMains(srcWin, targetWin, job.pl, job.pl._idx, maxOtherPinned); } catch (e) {}
                    }
                }
            }

            // Classic moves (notes / swap-off / no live source).
            for (const pl of classicPls) {
                try { this._wvClassicMoveTabBetweenMains(srcWin, targetWin, pl, pl._idx, maxOtherPinned); } catch (e) {}
            }

            // PHASE 3 — reveal. Select the dragged tab (now holding its live
            // content → one clean switch, no flash) and RESTORE the multi-selection
            // on the moved tabs, mirroring Firefox's drop handler, which both
            // selects the dragged tab and re-ranges the selection
            // (addRangeToMultiSelectedTabs).
            try {
                const ZTt: any = targetWin.Zotero_Tabs;
                if (activeNewId && ZTt && typeof ZTt.select === "function") ZTt.select(activeNewId);
                if (newSelIds.length > 1) {
                    if (!targetWin._wvSelTabIDs) targetWin._wvSelTabIDs = new Set();
                    targetWin._wvSelTabIDs.clear();
                    for (const nid of newSelIds) targetWin._wvSelTabIDs.add(nid);
                    this._wvTabMultiSelSync(targetWin);
                }
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvMoveSelectionBetweenMains err: " + e); }
    }

    /** Wire dragstart / dragend on the tab-bar container so dragging a
     *  regular tab INTO the pinned region pins it, and dragging a pinned
     *  tab OUT of the pinned region unpins it.
     *
     *  "Pinned region" = slots [1, maxOtherPinned] where maxOtherPinned
     *  is the highest index among currently-pinned tabs OTHER than the
     *  dragged one. Equivalent rule: a regular tab is being pinned if its
     *  final index ≤ maxOtherPinned; a pinned tab is being unpinned if
     *  its final index > maxOtherPinned. Drag-reorders that stay within
     *  the same region take no action (the existing _applyPinnedTabs
     *  sync to Zotero's order handles that).
     *
     *  We use dragend (not dragover/Z_Tabs.move) so the decision runs
     *  once on the final position — Zotero fires many move() calls during
     *  a drag for live preview. */
    /** Wrap a main window's `moveToNewWindow` reader hook so the tab context
     *  menu's "Move to New Window" goes through the no-reload tear-off (single
     *  tab) or multi-tab tear-off (when the target is part of a multi-selection),
     *  falling back to the original (reload) hook for notes / non-swappable /
     *  failure. The wrapper delegates to the LIVE plugin, so it stays correct
     *  across hot-reloads; idempotent per window's hook table. */
    _wvWrapMoveToNewWindowHook(win: any) {
        try {
            const ZT: any = win && (win as any).Zotero_Tabs;
            const hooks: any = ZT && ZT.tabHooks && ZT.tabHooks.moveToNewWindow;
            if (!hooks || hooks._wvWrapped) return;
            const origReader = hooks.reader;
            if (typeof origReader !== "function") return;
            hooks._wvOrigReader = origReader;
            hooks.reader = async (tab: any, tabIndex: any) => {
                try {
                    const lp: any = (Zotero as any).Weavero?.plugin;
                    if (lp && tab && tab.id) {
                        // Multi-select aware: if the target is one of several
                        // selected tabs, tear them ALL out together (like the drag).
                        const targets = lp._wvTabMultiSelTargets ? lp._wvTabMultiSelTargets(win, tab.id) : [tab.id];
                        if (targets && targets.length > 1 && lp._wvMainTearOffTabs) {
                            lp._wvMainTearOffTabs(win, targets);
                            return;
                        }
                        const Reader: any = Zotero.Reader;
                        let S: any = null;
                        try { if (Reader.getByTabID) S = Reader.getByTabID(tab.id); } catch (e) {}
                        const iid = tab.data && tab.data.itemID;
                        if (lp._wvSwapTearOffToWindow && S && S._iframe
                                && typeof S._iframe.swapDocShells === "function" && S._internalReader && iid != null) {
                            const newWin = await lp._wvSwapTearOffToWindow(win, S, iid);
                            if (newWin) return;       // no-reload succeeded
                        }
                    }
                } catch (e) { Zotero.debug("[Weavero] moveToNewWindow wrap err: " + e); }
                return origReader(tab, tabIndex);     // classic fallback
            };
            hooks._wvWrapped = true;
        } catch (e) { Zotero.debug("[Weavero] _wvWrapMoveToNewWindowHook err: " + e); }
    }

    _wireTabBarDrag(win) {
        try {
            if (!win || !win.document) return;
            // Make the tab context menu's "Move to New Window" no-reload too (it
            // calls the moveToNewWindow hook directly, bypassing the dragend path).
            try { this._wvWrapMoveToNewWindowHook(win); } catch (e) {}
            const doc = win.document;
            const container = doc.getElementById("tab-bar-container");
            if (!container || (container as any)._wvPinDragWired) return;
            const self = this;
            container.addEventListener("dragstart", (e: any) => {
                try {
                    const tabNode = e.target && e.target.closest && e.target.closest(".tab[data-id]");
                    if (!tabNode) return;
                    const tabID = tabNode.getAttribute("data-id");
                    if (!tabID || tabID === "zotero-pane") return;
                    const Z_Tabs: any = (win as any).Zotero_Tabs;
                    if (!Z_Tabs) return;
                    const zotTab = Z_Tabs._tabs.find((t: any) => t && t.id === tabID);
                    if (!zotTab) return;
                    const k = self._tabPinKey(zotTab);
                    if (!k) return;
                    self._wvTabDrag = {
                        tabID,
                        libraryID: k.libraryID,
                        itemKey: k.itemKey,
                        // Captured so a standalone reader window can mount this
                        // tab when it's dropped on its strip (increment 3a), and
                        // render a faithful drop-preview ghost (title + icon).
                        itemID: (zotTab.data && zotTab.data.itemID) || null,
                        tabType: zotTab.type || null,
                        title: zotTab.title || "",
                        readerType: (() => {
                            try {
                                const iid = zotTab.data && zotTab.data.itemID;
                                const it: any = iid && Zotero.Items.get(iid);
                                return (it && it.attachmentReaderType) || "";
                            } catch (e) { return ""; }
                        })(),
                        wasPinned: self._pinnedTabsHas(k.libraryID, k.itemKey),
                        initialIndex: Z_Tabs._tabs.indexOf(zotTab),
                    };
                    // Cross-main-window move: stamp the drag so ANOTHER main
                    // window's strip can absorb it. The merge ghost reads
                    // `_wvMergeDragInfo`; the drop reads the MIME payload +
                    // `_wvMainTabDragSourceWin` (to close the source tab).
                    // Same-window drags carry it too, but dragover/drop ignore
                    // it when source === target, so native reorder/pin is
                    // untouched.
                    try {
                        const isNote = (zotTab.type === "note");
                        const mergeRt = isNote ? "note" : (self._wvTabDrag.readerType || "");
                        if (e.dataTransfer) {
                            e.dataTransfer.setData("application/x-weavero-tab-move", JSON.stringify({
                                itemID: self._wvTabDrag.itemID,
                                readerType: mergeRt,
                                tabType: zotTab.type || "",
                                sourceTabId: tabID,
                            }));
                        }
                        // Set on the LIVE plugin (not the closure `self`):
                        // after a reload the old listeners keep firing with a
                        // stale `self`, but every window reads the single live
                        // Zotero.Weavero.plugin — so the source-window ref and
                        // ghost info must live there to be seen cross-window.
                        const lp: any = (Zotero as any).Weavero?.plugin || self;
                        lp._wvMainTabDragSourceWin = win;
                        // Mirror _wvTabDrag onto the LIVE plugin too: a reader
                        // window's drop reads `Zotero.Weavero.plugin._wvTabDrag`
                        // (mainTabDrag()), but after a hot-reload this dragstart's
                        // `self` is the OLD instance, so a self-only write left the
                        // live plugin's _wvTabDrag null → main→reader drops were
                        // misrouted to the reader↔reader path (Base mount, source
                        // not closed → tear-off into a new window).
                        lp._wvTabDrag = self._wvTabDrag;
                        lp._wvMergeDragInfo = {
                            itemID: self._wvTabDrag.itemID,
                            title: self._wvTabDrag.title || "",
                            readerType: mergeRt,
                        };
                    } catch (er3) {}
                    // Multi-select: show ALL selected tabs as the drag ghost (a
                    // small stack), so dragging N tabs shows N ghosts — not just
                    // the one grabbed (the browser's default single-element image).
                    try {
                        const di: any = self._wvBuildMultiTabDragImage(win, tabID, e.clientX, e.clientY);
                        if (di && di.el && e.dataTransfer && typeof e.dataTransfer.setDragImage === "function") {
                            e.dataTransfer.setDragImage(di.el, di.offsetX, di.offsetY);
                            const rm = () => { try { di.el.remove(); } catch (er) {} };
                            if (win.setTimeout) win.setTimeout(rm, 0); else setTimeout(rm, 0);
                        }
                    } catch (er4) {}
                    // Mount the overlay on every standalone reader window
                    // for the duration of this drag — keeps the dragged tab
                    // from scrolling/jumping any reader-window content.
                    try { (self as any)._wvShowReaderDragOverlays(); } catch (er2) {}
                } catch (er) {}
            }, true);
            // Shared helper: compute the pin/unpin verdict for the dragged
            // tab at its current Zotero index. Returns "pin" | "unpin" | "".
            const computePreview = (drag: any) => {
                try {
                    const Z_Tabs: any = (win as any).Zotero_Tabs;
                    if (!Z_Tabs || !drag) return "";
                    const tab = Z_Tabs._tabs.find((t: any) => t && t.id === drag.tabID);
                    if (!tab) return "";
                    const newIndex = Z_Tabs._tabs.indexOf(tab);
                    let maxOtherPinned = 0;
                    for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                        const t = Z_Tabs._tabs[i];
                        if (!t || t.id === drag.tabID) continue;
                        const k = self._tabPinKey(t);
                        if (!k) continue;
                        if (self._pinnedTabsHas(k.libraryID, k.itemKey)) maxOtherPinned = i;
                    }
                    if (!drag.wasPinned && newIndex <= maxOtherPinned) return "pin";
                    if (drag.wasPinned && newIndex > maxOtherPinned) return "unpin";
                    return "";
                } catch (er) { return ""; }
            };
            // Drop-position helpers (shared by the cross-main branch): the
            // Z_Tabs index a drop at clientX targets, and the rightmost OTHER
            // currently-pinned slot (≤ it → land in the pinned region → pin).
            const dropTargetIndex = (clientX: number) => {
                const Z_Tabs: any = (win as any).Zotero_Tabs;
                let targetIndex = (Z_Tabs && Z_Tabs._tabs) ? Z_Tabs._tabs.length : 1;
                try {
                    const tabNodes = Array.from(doc.querySelectorAll(
                        "#tab-bar-container .tab[data-id]")) as any[];
                    for (let i = 0; i < tabNodes.length; i++) {
                        const r = tabNodes[i].getBoundingClientRect();
                        const mid = r.left + r.width / 2;
                        if (clientX < mid) {
                            const did = tabNodes[i].getAttribute("data-id");
                            const z = Z_Tabs && Z_Tabs._tabs
                                ? Z_Tabs._tabs.findIndex((t: any) => t && t.id === did) : i;
                            targetIndex = z >= 0 ? z : i;
                            break;
                        }
                    }
                } catch (er) {}
                return targetIndex;
            };
            const rightmostOtherPinned = () => {
                const Z_Tabs: any = (win as any).Zotero_Tabs;
                let maxOtherPinned = 0;
                try {
                    for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                        const t = Z_Tabs._tabs[i];
                        const k = self._tabPinKey(t);
                        if (!k) continue;
                        if (self._pinnedTabsHas(k.libraryID, k.itemKey)) maxOtherPinned = i;
                    }
                } catch (er) {}
                return maxOtherPinned;
            };
            // Live preview during drag: as the dragged tab crosses into /
            // out of the pinned region (each Z_Tabs.move reflows the DOM),
            // toggle the data-wv-pin-preview attribute on its tab node.
            // CSS does the rest (icon-only collapse with accent outline /
            // full-width with dashed outline).
            container.addEventListener("dragover", (e: any) => {
                try {
                    // Cross-window merge: a drag carrying our reader-merge
                    // MIME (set on the .wv-window-tab in a standalone reader)
                    // must preventDefault so the drop event fires here. The
                    // types check is needed in BOTH dragover AND drop —
                    // browsers won't let us getData() in dragover, only test
                    // membership via .types.
                    try {
                        const types = e.dataTransfer && e.dataTransfer.types;
                        const arr = types ? (Array.from(types) as string[]) : [];
                        const liveP: any = (Zotero as any).Weavero?.plugin;
                        const isReaderMerge = arr.indexOf("application/x-weavero-reader-merge") >= 0;
                        // Cross-main move: a tab dragged from ANOTHER main
                        // window's strip (source !== this window). Same-window
                        // drags carry the MIME too, but are left to the native
                        // reorder/pin path below.
                        const isCrossMain = arr.indexOf("application/x-weavero-tab-move") >= 0
                            && liveP && liveP._wvMainTabDragSourceWin
                            && liveP._wvMainTabDragSourceWin !== win;
                        if (isReaderMerge || isCrossMain) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            // Render a ghost tab at the drop position — same
                            // blue outline + sizing as the pin/unpin preview
                            // (icon-only inside the pinned region, full width
                            // otherwise). Lives inside the regular .tabs
                            // container; pushed aside as the cursor moves.
                            const regulars: any = doc.querySelector(
                                "#tab-bar-container .tabs-wrapper .tabs");
                            if (!regulars) return;
                            // Figure out the drop position by comparing the
                            // cursor's clientX against tab midpoints. The
                            // result is "insert before tab N" (an element
                            // ref) or null = drop at the end.
                            const tabNodes = Array.from(regulars.querySelectorAll(
                                ".tab[data-id]:not(.wv-merge-ghost)")) as any[];
                            let insertBefore: any = null;
                            for (let i = 0; i < tabNodes.length; i++) {
                                const r = tabNodes[i].getBoundingClientRect();
                                const mid = r.left + r.width / 2;
                                if (e.clientX < mid) { insertBefore = tabNodes[i]; break; }
                            }
                            // Find ghost (create if first time). Populate
                            // its contents to mirror what a real merged tab
                            // would look like: the item's type icon on the
                            // left and the tab's title text. Payload sits on
                            // `_wvMergeDragInfo` (set by reader dragstart;
                            // dragover can't getData() the MIME).
                            let ghost: any = regulars.querySelector(".wv-merge-ghost");
                            // Read mergeInfo from the LIVE plugin instance via
                            // Zotero.Weavero.plugin — not via the captured `self`
                            // closure. Plugin reload swaps the WeaveroPlugin
                            // instance, but the dragover handler stays wired to
                            // the container (idempotent guard `_wvPinDragWired`)
                            // and so `self` would otherwise point at the OLD,
                            // destroyed instance whose `_wvMergeDragInfo` is
                            // null. Symptom: every cross-window drag falls into
                            // the default `attachmentPDF` icon branch.
                            const livePlugin: any = (Zotero as any).Weavero?.plugin;
                            const info: any = (livePlugin && livePlugin._wvMergeDragInfo) || {};
                            if (!ghost) {
                                ghost = doc.createElementNS(
                                    "http://www.w3.org/1999/xhtml", "div");
                                ghost.className = "tab wv-merge-ghost";
                                const iconEl = doc.createElementNS(
                                    "http://www.w3.org/1999/xhtml", "span");
                                iconEl.className = "icon icon-css tab-icon icon-item-type";
                                ghost.appendChild(iconEl);
                                const nameEl = doc.createElementNS(
                                    "http://www.w3.org/1999/xhtml", "div");
                                nameEl.className = "tab-name";
                                ghost.appendChild(nameEl);
                            }
                            // Refresh icon + title each pass — info is set
                            // once at dragstart, but we keep it cheap and
                            // idempotent in case of edge cases.
                            const iconNode = ghost.querySelector(".tab-icon");
                            const nameNode = ghost.querySelector(".tab-name");
                            if (iconNode) {
                                // Map readerType ("pdf" / "epub" / "snapshot" /
                                // "note") to the data-item-type Zotero uses
                                // for tab icons. The real attribute values
                                // are camelCase (attachmentPDF / attachmentEPUB
                                // / attachmentSnapshot / note) — kebab-case
                                // won't match Zotero's CSS rule.
                                const rt = String(info.readerType || "").toLowerCase();
                                const itemType = rt === "note" ? "note"
                                    : rt === "epub" ? "attachmentEPUB"
                                    : rt === "snapshot" ? "attachmentSnapshot"
                                    : "attachmentPDF";
                                iconNode.setAttribute("data-item-type", itemType);
                            }
                            if (nameNode) nameNode.textContent = info.title || "";
                            // Decide pin vs regular style: pinned if dropped
                            // BEFORE OR AT the last currently-pinned tab.
                            const Z_Tabs: any = (win as any).Zotero_Tabs;
                            let maxPinnedIdx = 0;
                            try {
                                for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                                    const t = Z_Tabs._tabs[i];
                                    const k = self._tabPinKey(t);
                                    if (k && self._pinnedTabsHas(k.libraryID, k.itemKey)) maxPinnedIdx = i;
                                }
                            } catch (er3) {}
                            // Translate the insertBefore DOM node to a Z_Tabs index.
                            let targetIdx = Z_Tabs && Z_Tabs._tabs ? Z_Tabs._tabs.length : 1;
                            if (insertBefore) {
                                const did = insertBefore.getAttribute("data-id");
                                const z = Z_Tabs._tabs.findIndex((t: any) => t && t.id === did);
                                if (z >= 0) targetIdx = z;
                            }
                            const wouldPin = targetIdx <= maxPinnedIdx;
                            ghost.classList.toggle("wv-merge-ghost-pin", wouldPin);
                            ghost.classList.toggle("wv-merge-ghost-regular", !wouldPin);
                            // Position the ghost.
                            if (insertBefore && insertBefore.parentNode === regulars) {
                                if (ghost.nextSibling !== insertBefore || ghost.parentNode !== regulars) {
                                    regulars.insertBefore(ghost, insertBefore);
                                }
                            }
                            else if (ghost.parentNode !== regulars || ghost.nextSibling) {
                                regulars.appendChild(ghost);
                            }
                            return;   // skip pin-preview logic for cross-window drag
                        }
                    } catch (er2) {}
                    const drag = self._wvTabDrag;
                    if (!drag) return;
                    const tabNode: any = doc.querySelector('#tab-bar-container .tab[data-id="' + drag.tabID + '"]');
                    if (!tabNode) return;
                    const verdict = computePreview(drag);
                    const cur = tabNode.getAttribute("data-wv-pin-preview") || "";
                    if (verdict === cur) return;
                    if (verdict) tabNode.setAttribute("data-wv-pin-preview", verdict);
                    else tabNode.removeAttribute("data-wv-pin-preview");
                } catch (er) {}
            }, true);
            const clearMergeMarkers = () => {
                try {
                    container.removeAttribute("data-wv-merge-target");   // legacy
                    for (const n of doc.querySelectorAll(".tab[data-wv-merge-drop]")) {
                        n.removeAttribute("data-wv-merge-drop");
                    }
                    for (const g of doc.querySelectorAll(".wv-merge-ghost")) g.remove();
                } catch (er) {}
            };
            container.addEventListener("drop", (e: any) => {
                try {
                    clearMergeMarkers();
                    const types = e.dataTransfer && e.dataTransfer.types;
                    const arr = types ? (Array.from(types) as string[]) : [];
                    // Cross-main-window move: a reader/note tab dragged from
                    // ANOTHER main window's strip. Close it in its own window
                    // and reopen it here at the drop slot. Same-window drags
                    // (source === this window) fall through to native reorder.
                    if (arr.indexOf("application/x-weavero-tab-move") >= 0) {
                        const live: any = (Zotero as any).Weavero?.plugin;
                        const srcWin = live && live._wvMainTabDragSourceWin;
                        if (live && srcWin && srcWin !== win) {
                            e.preventDefault();
                            e.stopPropagation();
                            // Mark so the source window's dragend skips its
                            // tear-off path (drop fires before dragend).
                            live._wvSuppressNextTearOff = true;
                            let payload: any = null;
                            try { payload = JSON.parse(e.dataTransfer.getData("application/x-weavero-tab-move")); }
                            catch (er) {}
                            if (payload && payload.itemID != null
                                    && typeof live._wvMoveTabBetweenMains === "function") {
                                const targetIndex = dropTargetIndex(e.clientX);
                                const maxOtherPinned = rightmostOtherPinned();
                                // Multi-select: move the whole selection together.
                                const ids = (live._wvTabMultiSelTargets && payload.sourceTabId != null)
                                    ? live._wvTabMultiSelTargets(srcWin, payload.sourceTabId) : null;
                                if (ids && ids.length > 1 && typeof live._wvMoveSelectionBetweenMains === "function") {
                                    try { live._wvMoveSelectionBetweenMains(srcWin, win, ids, targetIndex, maxOtherPinned, payload.sourceTabId); }
                                    catch (er) {}
                                } else {
                                    try { live._wvMoveTabBetweenMains(srcWin, win, payload, targetIndex, maxOtherPinned); }
                                    catch (er) {}
                                }
                            }
                            return;
                        }
                    }
                    if (arr.indexOf("application/x-weavero-reader-merge") < 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const raw = e.dataTransfer.getData("application/x-weavero-reader-merge");
                    const data = raw ? JSON.parse(raw) : null;
                    const itemID = data && typeof data.itemID === "number" ? data.itemID : null;
                    if (itemID == null) return;

                    // Compute the drop position → tab index by finding which
                    // existing-tab gap the cursor's clientX falls into (the same
                    // midpoint algorithm Zotero's handleTabBarDragOver uses), plus
                    // the rightmost OTHER pinned slot (drop ≤ it → auto-pin).
                    // Computed BEFORE any mover so BOTH the multi-tab and native
                    // paths can reposition (previously the multi-tab path returned
                    // early and the tab always landed at the end).
                    const Z_Tabs: any = (win as any).Zotero_Tabs;
                    let targetIndex = (Z_Tabs && Z_Tabs._tabs) ? Z_Tabs._tabs.length : 1;
                    try {
                        const tabNodes = Array.from(doc.querySelectorAll(
                            "#tab-bar-container .tab[data-id]")) as any[];
                        for (let i = 0; i < tabNodes.length; i++) {
                            const r = tabNodes[i].getBoundingClientRect();
                            const mid = r.left + r.width / 2;
                            if (e.clientX < mid) {
                                const did = tabNodes[i].getAttribute("data-id");
                                const z = Z_Tabs && Z_Tabs._tabs
                                    ? Z_Tabs._tabs.findIndex((t: any) => t && t.id === did)
                                    : i;
                                targetIndex = z >= 0 ? z : i;
                                break;
                            }
                        }
                    } catch (er) {}
                    let maxOtherPinned = 0;
                    try {
                        for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                            const t = Z_Tabs._tabs[i];
                            const k = self._tabPinKey(t);
                            if (!k) continue;
                            if (self._pinnedTabsHas(k.libraryID, k.itemKey)) maxOtherPinned = i;
                        }
                    } catch (er) {}

                    // The movers create the new tab behind a deferred setTimeout
                    // (they let the closing reader flush state first), so poll for
                    // it, move it to the target slot, and auto-pin if dropped in
                    // the pinned region.
                    const startTs = Date.now();
                    const positionNewTab = () => {
                        try {
                            const item = Zotero.Items.get(itemID);
                            if (!item) return;
                            const tab = Z_Tabs._tabs.find((t: any) =>
                                t && t.data && t.data.itemID === itemID);
                            if (!tab) {
                                if (Date.now() - startTs < 2000) win.setTimeout(positionNewTab, 80);
                                return;
                            }
                            try {
                                if (typeof Z_Tabs.move === "function") {
                                    const clamped = Math.max(1, Math.min(targetIndex, Z_Tabs._tabs.length - 1));
                                    Z_Tabs.move(tab.id, clamped);
                                }
                            } catch (er) {}
                            const curIdx = Z_Tabs._tabs.indexOf(tab);
                            if (curIdx <= maxOtherPinned && curIdx > 0) {
                                try {
                                    self._pinnedTabsAdd(item.libraryID, item.key);
                                    self._applyPinnedTabs(win);
                                } catch (er) {}
                            }
                        } catch (er) {}
                    };

                    // Mounted (multi-tab) reader-window tab → route through
                    // _wvWTMoveTabToMain so only THAT tab is closed (not the whole
                    // window), THEN position it like the native path.
                    if (data && data.multiTab && data.sourceTabId != null) {
                        const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        const srcWin = live && live._wvMergeDragSourceWin;
                        if (live && srcWin && typeof live._wvWTMoveTabToMain === "function") {
                            // Multi-select: move every selected reader tab into this
                            // main window together (Firefox-style); else just the one.
                            const ids = (live._wvWTMultiSelTargets)
                                ? live._wvWTMultiSelTargets(srcWin, data.sourceTabId) : [data.sourceTabId];
                            if (ids && ids.length > 1 && typeof live._wvWTMoveSelectionToMain === "function") {
                                try { live._wvWTMoveSelectionToMain(srcWin, ids, win); } catch (er) {}
                                return;
                            }
                            // Pass THIS window: the movers default to the anchor
                            // main window, so a drop on a secondary main window
                            // used to land the tab in the wrong window.
                            try { live._wvWTMoveTabToMain(srcWin, data.sourceTabId, win); } catch (er) {}
                            win.setTimeout(positionNewTab, 200);
                            return;
                        }
                    }
                    // Native single-tab reader / note → its dedicated mover, then
                    // the same reposition. readerType "note" → _moveNoteToTab.
                    const kind = data && data.readerType === "note" ? "note" : "reader";
                    const mover = kind === "note"
                        ? (self as any)._moveNoteToTab?.bind(self)
                        : (self as any)._moveReaderToTab?.bind(self);
                    if (typeof mover !== "function") return;
                    try { mover(itemID, win); } catch (er) {}
                    win.setTimeout(positionNewTab, 200);
                } catch (er) {}
            }, true);
            // Clear merge-drop markers whenever the drag leaves the container
            // or ends entirely (drop / cancel). dragleave fires on EVERY
            // child crossing, so guard with relatedTarget.
            container.addEventListener("dragleave", (e: any) => {
                try {
                    if (e.relatedTarget && container.contains(e.relatedTarget)) return;
                    clearMergeMarkers();
                } catch (er) {}
            }, true);
            container.addEventListener("dragend", () => {
                clearMergeMarkers();
                try { (self as any)._wvHideReaderDragOverlays(); } catch (er) {}
                // Also clear any reader-window drop ghost a main→reader drag left.
                try { (self as any)._wvWTHideAllDropIndicators(); } catch (er) {}
            }, true);
            container.addEventListener("dragend", (e: any) => {
                try {
                    // Strip any preview attrs from every tab (defensive — only
                    // the dragged tab should have one, but in case of a stray).
                    for (const n of doc.querySelectorAll(".tab[data-wv-pin-preview]")) {
                        n.removeAttribute("data-wv-pin-preview");
                    }
                    // Cross-main cleanup (runs on the SOURCE window's dragend).
                    // Clear the shared drag state; if a cross-main drop already
                    // handled this tab (it set the suppress flag and closed the
                    // source tab), skip the tear-off/pin path below.
                    const liveEnd: any = (Zotero as any).Weavero?.plugin;
                    const suppress = !!(liveEnd && liveEnd._wvSuppressNextTearOff);
                    // Read the drag BEFORE clearing the mirrors. On a fresh restart
                    // `self` IS the live plugin, so nulling `liveEnd._wvTabDrag`
                    // below would ALSO null `self._wvTabDrag`, and the tear-off/pin
                    // path would then see no drag — every dragend bailed and tabs
                    // never tore out. (On a hot-reload `self` is the old instance,
                    // so it survived; that's why this only bit after a restart.)
                    const drag = self._wvTabDrag || (liveEnd && liveEnd._wvTabDrag);
                    if (liveEnd) {
                        liveEnd._wvSuppressNextTearOff = false;
                        liveEnd._wvMainTabDragSourceWin = null;
                        liveEnd._wvMergeDragInfo = null;
                        liveEnd._wvTabDrag = null;   // mirror cleared (see dragstart)
                    }
                    self._wvTabDrag = null;
                    if (!drag || suppress) return;
                    const verdict = computePreview(drag);
                    const Z_Tabs: any = (win as any).Zotero_Tabs;
                    if (!Z_Tabs) return;
                    const tab = Z_Tabs._tabs.find((t: any) => t && t.id === drag.tabID);
                    if (!tab) return;

                    // TEAR-OFF: if the drop coordinates land OUTSIDE the tab
                    // strip's bounding rect (the user dragged the tab into the
                    // content area or off-screen entirely), use Zotero's
                    // moveToNewWindow hook for the tab's content type. That
                    // hook (defined in tabs.js for `reader` and `note`)
                    // closes the tab and reopens it as a standalone window —
                    // the canonical Zotero tear-off path. Drop position is
                    // detected via the dragend event's clientX/Y compared
                    // against the title-bar container's rect; clientX === 0
                    // && clientY === 0 means "dropped off-window", which we
                    // also treat as tear-off.
                    try {
                        const strip = doc.getElementById("zotero-title-bar");
                        const rect = strip && strip.getBoundingClientRect();
                        // dragend reports (0,0) BOTH for off-window drops AND
                        // for in-window drops nothing accepted (e.g. the empty
                        // title-bar area right of the last tab) — so on (0,0),
                        // fall back to the pointer position tracked during
                        // dragover. Only a genuinely unknown position (no
                        // tracked point either) still reads as off-window.
                        let cx = e.clientX, cy = e.clientY;
                        if (cx === 0 && cy === 0
                                && typeof (win as any)._wvTabDragLastX === "number"
                                && typeof (win as any)._wvTabDragLastY === "number") {
                            cx = (win as any)._wvTabDragLastX;
                            cy = (win as any)._wvTabDragLastY;
                        }
                        const offWindow = (cx === 0 && cy === 0);
                        const outsideStrip = rect && (cx < rect.left || cx > rect.right
                            || cy < rect.top || cy > rect.bottom);
                        // Dropped INSIDE the strip but right of the last tab →
                        // "move to the end", not a tear-off.
                        if (!offWindow && !outsideStrip) {
                            try {
                                const tabEls = doc.querySelectorAll("#tab-bar-container .tab[data-id]");
                                const lastEl: any = tabEls[tabEls.length - 1];
                                const lr = lastEl && lastEl.getBoundingClientRect();
                                if (lr && cx > lr.right && typeof Z_Tabs.move === "function") {
                                    Z_Tabs.move(tab.id, Z_Tabs._tabs.length - 1);
                                }
                            } catch (er) {}
                        }
                        if (offWindow || outsideStrip) {
                            // Multi-select tear-out: if several tabs are selected
                            // (and the dragged one is part of the set), tear them ALL
                            // out into one new reader window (Firefox-style). Else
                            // fall through to Zotero's native single-tab
                            // moveToNewWindow hook (preserves the tab's reader state).
                            try {
                                const lp: any = (Zotero as any).Weavero?.plugin || self;
                                const targets = lp._wvTabMultiSelTargets
                                    ? lp._wvTabMultiSelTargets(win, tab.id) : [tab.id];
                                if (targets && targets.length > 1) {
                                    lp._wvMainTearOffTabs(win, targets);
                                    return;
                                }
                            } catch (er) {}
                            // No-reload tear-off: if the tab has a live, swappable
                            // reader, move it into a NEW standalone reader window via
                            // a docshell swap (preserves scroll/zoom/selection). Fall
                            // back to the classic moveToNewWindow hook (reload) for
                            // notes / unloaded tabs / on failure (returns false only
                            // before any mutation, so the tab is intact to fall back).
                            try {
                                const lp: any = (Zotero as any).Weavero?.plugin || self;
                                const Rdr: any = Zotero.Reader;
                                let liveS: any = null;
                                try { if (Rdr && Rdr.getByTabID) liveS = Rdr.getByTabID(tab.id); } catch (er) {}
                                const iid = tab.data && tab.data.itemID;
                                if (liveS && liveS._iframe && typeof liveS._iframe.swapDocShells === "function"
                                        && liveS._internalReader && iid != null && lp._wvSwapTearOffToWindow) {
                                    lp._wvSwapTearOffToWindow(win, liveS, iid).then((ok: any) => {
                                        if (ok) return;
                                        try {
                                            const ct = Z_Tabs.parseTabType ? Z_Tabs.parseTabType(tab.type).tabContentType : null;
                                            if (ct && Z_Tabs._hasHook && Z_Tabs._hasHook(ct, "moveToNewWindow")) {
                                                const h = Z_Tabs._getHook(ct, "moveToNewWindow");
                                                if (h) Promise.resolve(h(tab, Z_Tabs._tabs.indexOf(tab))).catch((e2: any) => Zotero.debug("[Weavero] tear-off err: " + e2));
                                            }
                                        } catch (e2) {}
                                    }).catch((er: any) => Zotero.debug("[Weavero] no-reload tear-off err: " + er));
                                    return;
                                }
                            } catch (er) {}
                            const tabContentType = Z_Tabs.parseTabType
                                ? Z_Tabs.parseTabType(tab.type).tabContentType
                                : null;
                            if (tabContentType
                                && typeof Z_Tabs._hasHook === "function"
                                && Z_Tabs._hasHook(tabContentType, "moveToNewWindow")) {
                                const hook = Z_Tabs._getHook(tabContentType, "moveToNewWindow");
                                if (hook) {
                                    Promise.resolve(hook(tab, Z_Tabs._tabs.indexOf(tab)))
                                        .catch(er => Zotero.debug("[Weavero] tear-off err: " + er));
                                    return;
                                }
                            }
                        }
                    } catch (er) {}

                    const newIndex = Z_Tabs._tabs.indexOf(tab);
                    if (newIndex === drag.initialIndex && !verdict) return;
                    if (verdict === "pin") {
                        self._pinnedTabsAdd(drag.libraryID, drag.itemKey);
                        try { self._applyPinnedTabs(win); } catch (er) {}
                    }
                    else if (verdict === "unpin") {
                        self._pinnedTabsRemove(drag.libraryID, drag.itemKey);
                        try { self._applyPinnedTabs(win); } catch (er) {}
                    }
                    // (Tab-group membership is handled by tab-groups.ts's own
                    // container dragend — wired reload-proof there.)
                } catch (er) {}
            }, true);
            (container as any)._wvPinDragWired = true;
        } catch (e) { Zotero.debug("[Weavero] _wireTabBarDrag err: " + e); }
    }

    /** Append a tab to the pinned list AND move its DOM node to the slot
     *  just after the last currently-pinned tab — i.e. Firefox behaviour:
     *  newly-pinned tabs sit at the right end of the pinned group. The
     *  next observer-driven `_applyPinnedTabs` will sync the pref order
     *  to match this new position. */
    _pinTabByCommand(win, item) {
        try {
            const Z_Tabs: any = (win as any).Zotero_Tabs;
            if (!Z_Tabs || !Z_Tabs._tabs) return;
            this._pinnedTabsAdd(item.libraryID, item.key);
            // Find the tab matching this item.
            const tab = Z_Tabs._tabs.find((t: any) => {
                if (!t || !t.data || !t.data.itemID) return false;
                try {
                    const it = Zotero.Items.get(t.data.itemID);
                    return it && it.libraryID === item.libraryID && it.key === item.key;
                } catch (e) { return false; }
            });
            if (!tab || typeof Z_Tabs.move !== "function") return;
            // Find the highest index occupied by a currently-pinned tab
            // OTHER than the one we just added — that's where we want to
            // land just after.
            let lastOtherPinnedIdx = 0;   // library
            for (let i = 1; i < Z_Tabs._tabs.length; i++) {
                const t = Z_Tabs._tabs[i];
                if (!t || t.id === tab.id) continue;
                const k = this._tabPinKey(t);
                if (!k) continue;
                if (this._pinnedTabsHas(k.libraryID, k.itemKey)) lastOtherPinnedIdx = i;
            }
            const targetSlot = lastOtherPinnedIdx + 1;
            const curIdx = Z_Tabs._tabs.indexOf(tab);
            if (curIdx !== targetSlot) { try { Z_Tabs.move(tab.id, targetSlot); } catch (e) {} }
        } catch (e) { Zotero.debug("[Weavero] _pinTabByCommand err: " + e); }
    }

    /** Detect when a tab's underlying item is being deleted, and auto-unpin
     *  it. Called from the notifier's `delete` event for items. */
    _onItemDeletedForPin(libraryID, itemKey) {
        try {
            if (!this._pinnedTabsHas(libraryID, itemKey)) return;
            this._pinnedTabsRemove(libraryID, itemKey);
        } catch (e) {}
    }

    /** One-time CSS for pinned tabs. Icon-only width matches Firefox's
     *  pinned-tab convention (~36 px); tab name + close button hide. */
    _ensurePinnedTabStyles(doc) {
        try {
            if (!doc || doc.getElementById("wv-pinned-tab-style")) return;
            const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
            style.id = "wv-pinned-tab-style";
            // Bump specificity above .tab.selected (which Zotero uses to
            // size the active tab) by chaining the pinned class with .tab
            // AND #tab-bar-container — the selected rule then loses on
            // specificity, and our width holds whether selected or not.
            //
            // Drag-preview attribute `data-wv-pin-preview="pin"|"unpin"`
            // is set on the dragged tab during dragover when its position
            // crosses into / out of the pinned region. Pin-preview applies
            // the same icon-only collapse + an accent border so the user
            // sees "will be pinned"; unpin-preview forces full width back
            // + a dashed border so the user sees "will be unpinned".
            // Attributes (not classes) so React doesn't manage them on its
            // re-renders.
            style.textContent = [
                "#tab-bar-container .tab.wv-pinned-tab,",
                "#tab-bar-container .tab.wv-pinned-tab.selected,",
                "#tab-bar-container .tab[data-wv-pin-preview='pin'],",
                "#tab-bar-container .tab[data-wv-pin-preview='pin'].selected {",
                "  max-width: 36px !important;",
                "  min-width: 36px !important;",
                "  width: 36px !important;",
                "  padding-inline-start: 8px !important;",
                "  padding-inline-end: 8px !important;",
                "  flex: 0 0 36px !important;",
                "}",
                "#tab-bar-container .tab.wv-pinned-tab .tab-name,",
                "#tab-bar-container .tab.wv-pinned-tab.selected .tab-name,",
                "#tab-bar-container .tab[data-wv-pin-preview='pin'] .tab-name,",
                "#tab-bar-container .tab[data-wv-pin-preview='pin'].selected .tab-name {",
                "  display: none !important;",
                "}",
                "#tab-bar-container .tab.wv-pinned-tab .tab-close,",
                "#tab-bar-container .tab.wv-pinned-tab.selected .tab-close,",
                "#tab-bar-container .tab[data-wv-pin-preview='pin'] .tab-close,",
                "#tab-bar-container .tab[data-wv-pin-preview='pin'].selected .tab-close {",
                "  display: none !important;",
                "}",
                // "will be pinned" — accent outline + faint accent tint.
                "#tab-bar-container .tab[data-wv-pin-preview='pin'] {",
                "  outline: 2px solid var(--color-accent, #4072e5) !important;",
                "  outline-offset: -2px !important;",
                "  background: rgba(64, 114, 229, 0.12) !important;",
                "}",
                // "will be unpinned" — force full width back AND a dashed
                // border so the user can tell apart "merely being moved
                // within pinned region" from "leaving the pinned region".
                // The selectors are chained with .wv-pinned-tab AND .selected
                // so their specificity beats the pin-icon-only rule above
                // (which uses .tab.wv-pinned-tab.selected = 1,3,0 — we
                // need 1,4,0 here to win).
                "#tab-bar-container .tab[data-wv-pin-preview='unpin'],",
                "#tab-bar-container .tab.wv-pinned-tab[data-wv-pin-preview='unpin'],",
                "#tab-bar-container .tab.wv-pinned-tab[data-wv-pin-preview='unpin'].selected {",
                "  max-width: 200px !important;",
                "  min-width: 100px !important;",
                "  width: auto !important;",
                "  flex: 1 1 auto !important;",
                "  padding-inline-start: 12px !important;",
                "  padding-inline-end: 12px !important;",
                "  outline: 2px solid var(--color-accent, #4072e5) !important;",
                "  outline-offset: -2px !important;",
                "  background: rgba(64, 114, 229, 0.12) !important;",
                "}",
                "#tab-bar-container .tab[data-wv-pin-preview='unpin'] .tab-name,",
                "#tab-bar-container .tab.wv-pinned-tab[data-wv-pin-preview='unpin'] .tab-name,",
                "#tab-bar-container .tab.wv-pinned-tab[data-wv-pin-preview='unpin'].selected .tab-name {",
                "  display: block !important;",
                "}",
                "#tab-bar-container .tab[data-wv-pin-preview='unpin'] .tab-close,",
                "#tab-bar-container .tab.wv-pinned-tab[data-wv-pin-preview='unpin'] .tab-close,",
                "#tab-bar-container .tab.wv-pinned-tab[data-wv-pin-preview='unpin'].selected .tab-close {",
                "  display: flex !important;",
                "}",
                // Cross-window merge ghost — a placeholder tab at the drop
                // position, styled exactly like the pin/unpin preview
                // (solid blue accent outline). Width matches what the
                // merged tab WILL be: 36 px icon-only when landing inside
                // the pinned region, normal flex-grow tab width otherwise.
                "#tab-bar-container .wv-merge-ghost {",
                "  outline: 2px solid var(--color-accent, #4072e5) !important;",
                "  outline-offset: -2px !important;",
                "  border-radius: 4px !important;",
                "  pointer-events: none !important;",
                "  align-self: stretch !important;",   /* flex parent stretches us vertically */
                "  background: rgba(64, 114, 229, 0.12) !important;",
                "  box-sizing: border-box !important;",
                "}",
                "#tab-bar-container .wv-merge-ghost.wv-merge-ghost-pin {",
                "  max-width: 36px !important;",
                "  min-width: 36px !important;",
                "  width: 36px !important;",
                "  flex: 0 0 36px !important;",
                "}",
                "#tab-bar-container .wv-merge-ghost.wv-merge-ghost-regular {",
                "  min-width: 100px !important;",
                "  max-width: 200px !important;",
                "  flex: 1 1 auto !important;",
                "}",
            ].join("\n");
            (doc.head || doc.documentElement).appendChild(style);
        } catch (e) { Zotero.debug("[Weavero] _ensurePinnedTabStyles err: " + e); }
    }

    /** Register the Pin/Unpin entry via Zotero's MenuManager plugin API
     *  (`target: "main/tab"`) — same mechanism the Copy Select/Open Link
     *  entries use. Appending to the popup AFTER Zotero's _openMenu opens
     *  it doesn't show the new items (the popup is already shown by
     *  popup.openPopupAtScreen), so MenuManager — which is invoked by
     *  `Zotero.MenuManager.updateMenuPopup(popup, "main/tab", ...)` BEFORE
     *  the popup opens — is the only path that actually works. */
    _registerPinTabMenu() {
        try {
            if (!((Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.registerMenu === "function")) return;
            this._unregisterPinTabMenu();
            const self = this;
            const id = (Zotero as any).MenuManager.registerMenu({
                menuID: "weavero-tab-pin",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [{
                    menuType: "menuitem",
                    onShowing: (_ev, ctx) => {
                        try {
                            // Library tab can't be pinned/unpinned.
                            if (ctx.tabID === "zotero-pane") { ctx.setVisible(false); return; }
                            const item = ctx.items && ctx.items[0];
                            if (!item || !item.libraryID || !item.key) { ctx.setVisible(false); return; }
                            ctx.setVisible(true);
                            const pinned = self._pinnedTabsHas(item.libraryID, item.key);
                            ctx.menuElem.setAttribute("label", pinned ? "Unpin Tab" : "Pin Tab");
                            // MenuManager appends custom items AFTER all built-ins
                            // (Show in Library / Move Tab / Duplicate Tab / Close /
                            // Close Other Tabs / Reopen Closed Tab). The user wants
                            // Pin Tab right after Duplicate Tab — locate it by label
                            // and reposition our menuitem there. (Falls through
                            // gracefully if Duplicate Tab isn't in this popup, e.g.
                            // for tab types that don't expose a `duplicate` hook.)
                            try {
                                const popup = ctx.menuElem.parentNode;
                                if (!popup) return;
                                const dupLabel = Zotero.getString("tabs.duplicate");
                                let dup = null;
                                for (const ch of popup.querySelectorAll("menuitem")) {
                                    if (ch.getAttribute && ch.getAttribute("label") === dupLabel) { dup = ch; break; }
                                }
                                if (dup && dup.nextSibling !== ctx.menuElem) {
                                    popup.insertBefore(ctx.menuElem, dup.nextSibling);
                                }
                                // Multi-select: relabel the native "Move Tab" submenu
                                // to "Move Tabs" and make Move to Start/End act on the
                                // whole selection. Folded into this (proven-firing)
                                // onShowing — the standalone hidden-item registration
                                // never relabeled reliably.
                                try {
                                    const win2: any = ctx.menuElem.ownerDocument && ctx.menuElem.ownerDocument.defaultView;
                                    const tabID2 = ctx.tabID;
                                    if (win2 && tabID2 && tabID2 !== "zotero-pane" && self._wvTabMultiSelTargets) {
                                        const tg = self._wvTabMultiSelTargets(win2, tabID2);
                                        if (tg && tg.length > 1) self._wvMakeMoveTabMenuMulti(win2, popup, tg);
                                    }
                                } catch (e) {}
                            } catch (e) {}
                        } catch (e) {
                            try { ctx.setVisible(false); } catch (e2) {}
                        }
                    },
                    onCommand: (_ev, ctx) => {
                        try {
                            const item = ctx.items && ctx.items[0];
                            if (!item) return;
                            if (self._pinnedTabsHas(item.libraryID, item.key)) {
                                self._pinnedTabsRemove(item.libraryID, item.key);
                            }
                            else {
                                // _pinTabByCommand both adds the pref entry AND
                                // moves the tab to "last pinned + 1" so a fresh
                                // pin lands at the right end of the pinned group
                                // (Firefox behaviour).
                                try {
                                    for (const w of Zotero.getMainWindows()) self._pinTabByCommand(w, item);
                                } catch (e) {}
                            }
                            // Re-apply on all known windows so the class shows up
                            // immediately (the MutationObserver will also pick
                            // this up, but a direct call avoids a brief flash).
                            try {
                                for (const w of Zotero.getMainWindows()) self._applyPinnedTabs(w);
                            } catch (e) {}
                        } catch (e) {
                            Zotero.debug("[Weavero] pin-tab onCommand err: " + e);
                        }
                    },
                }],
            });
            if (id) this._pinTabMenuID = id;
        } catch (e) { Zotero.debug("[Weavero] _registerPinTabMenu err: " + e); }
    }

    _unregisterPinTabMenu() {
        try {
            if (this._pinTabMenuID && (Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.unregisterMenu === "function") {
                (Zotero as any).MenuManager.unregisterMenu(this._pinTabMenuID);
            }
        } catch (e) {}
        this._pinTabMenuID = null;
    }

    /** Make the native tab context menu's "Move Tab" submenu multi-select aware.
     *  When several tabs are selected and the right-clicked tab is one of them,
     *  relabel it "Move Tabs" and make Move to Start / Move to End operate on the
     *  WHOLE selection (Move to New Window is already multi-aware via the wrapped
     *  moveToNewWindow hook). Implemented as a hidden MenuManager item whose
     *  onShowing tweaks the popup the native code just built — fires during
     *  popupshowing, before paint. */
    _registerMoveTabsMenu() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if (!MM || typeof MM.registerMenu !== "function") return;
            const self = this;
            const id = MM.registerMenu({
                menuID: "weavero-move-tabs",
                target: "main/tab",
                menus: [{
                    menuType: "menuitem",
                    onShowing: (_ev: any, ctx: any) => {
                        try {
                            ctx.setVisible(false);   // side-effect only — never shown
                            const popup = ctx.menuElem && ctx.menuElem.parentNode;
                            const win: any = ctx.menuElem && ctx.menuElem.ownerDocument && ctx.menuElem.ownerDocument.defaultView;
                            const tabID = ctx.tabID;
                            if (!popup || !win || !tabID || tabID === "zotero-pane") return;
                            const targets = self._wvTabMultiSelTargets ? self._wvTabMultiSelTargets(win, tabID) : [tabID];
                            if (!targets || targets.length <= 1) return;   // single → leave native
                            self._wvMakeMoveTabMenuMulti(win, popup, targets);
                        } catch (e) {}
                    },
                }],
            });
            if (id) this._moveTabsMenuID = id;
        } catch (e) { Zotero.debug("[Weavero] _registerMoveTabsMenu err: " + e); }
    }

    _unregisterMoveTabsMenu() {
        try {
            if (this._moveTabsMenuID && (Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.unregisterMenu === "function") {
                (Zotero as any).MenuManager.unregisterMenu(this._moveTabsMenuID);
            }
        } catch (e) {}
        this._moveTabsMenuID = null;
    }

    /** Relabel the native "Move Tab" submenu to "Move Tabs" and rebind its
     *  Move to Start / Move to End items to move the whole `targets` selection.
     *  The native items carry single-tab `command` listeners (added via
     *  addEventListener, so not cloneable-away by attribute) — clone each item to
     *  drop them, then attach a multi-select handler. */
    _wvMakeMoveTabMenuMulti(win: any, popup: any, targets: any[]) {
        try {
            const self = this;
            const moveLabel = Zotero.getString("tabs.move");
            let moveMenu: any = null;
            for (const m of popup.querySelectorAll("menu")) {
                if (m.getAttribute && m.getAttribute("label") === moveLabel) { moveMenu = m; break; }
            }
            if (!moveMenu) return;
            moveMenu.setAttribute("label", "Move Tabs");
            const submenu = moveMenu.querySelector("menupopup");
            if (!submenu) return;
            const startLabel = Zotero.getString("tabs.moveToStart");
            const endLabel = Zotero.getString("tabs.moveToEnd");
            for (const mi of Array.from(submenu.querySelectorAll("menuitem")) as any[]) {
                const lbl = mi.getAttribute && mi.getAttribute("label");
                if (lbl !== startLabel && lbl !== endLabel) continue;   // leave Move to New Window
                const toEnd = (lbl === endLabel);
                const clone = mi.cloneNode(true);      // drops the native command listener
                clone.removeAttribute("disabled");
                mi.replaceWith(clone);
                clone.addEventListener("command", () => {
                    try { self._wvMoveSelectedTabsToEdge(win, targets, toEnd); } catch (e) {}
                });
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMakeMoveTabMenuMulti err: " + e); }
    }

    /** Move every tab in `ids` to the start (just after the library tab) or the
     *  end of the bar, preserving their relative order. Forward order → end and
     *  reverse order → position 1 each keep the group's internal order intact
     *  given Zotero_Tabs.move's splice-and-reinsert semantics. */
    _wvMoveSelectedTabsToEdge(win: any, ids: any[], toEnd: boolean) {
        try {
            const ZT: any = win && (win as any).Zotero_Tabs;
            if (!ZT || !ZT._tabs || typeof ZT.move !== "function") return;
            const ordered = (ids || [])
                .map((id: any) => ({ id, idx: ZT._tabs.findIndex((t: any) => t && t.id === id) }))
                .filter((o: any) => o.idx > 0)             // skip not-found + the library tab
                .sort((a: any, b: any) => a.idx - b.idx)
                .map((o: any) => o.id);
            if (!ordered.length) return;
            if (toEnd) {
                for (const id of ordered) { try { ZT.move(id, ZT._tabs.length); } catch (e) {} }
            } else {
                for (let i = ordered.length - 1; i >= 0; i--) { try { ZT.move(ordered[i], 1); } catch (e) {} }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMoveSelectedTabsToEdge err: " + e); }
    }

    /** Add a "New Main Window" entry to the tab context menu, gated on the
     *  pref `weavero.devNewMainWindow` (default OFF — exposed in prefs.html
     *  under "Multiple main windows", flagged experimental). Lets the user
     *  spin up a second *native* main window
     *  via `Zotero.openMainWindow()` to experiment with the multi-main-
     *  window approach (a full library window owns its own Zotero_Tabs /
     *  ZoteroContextPane / ZoteroPane). Zotero itself considers >1 main
     *  window unsupported-but-possible, hence the hidden gate. Registered
     *  the same way as the Pin/Unpin entry (`target: "main/tab"`); the
     *  pref is re-read on every `onShowing`, so toggling it takes effect
     *  with no reload. */
    _registerDevNewWindowMenu() {
        try {
            if (!((Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.registerMenu === "function")) return;
            this._unregisterDevNewWindowMenu();
            const id = (Zotero as any).MenuManager.registerMenu({
                menuID: "weavero-dev-new-window",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [{
                    menuType: "menuitem",
                    onShowing: (_ev, ctx) => {
                        try {
                            let on = false;
                            try { on = (this as any)._getDevNewMainWindow(); } catch (e) {}
                            // Cascades from the Tabs and Windows section master.
                            try { if (on && !(this as any)._getTabsAndWindowsMaster()) on = false; } catch (e) {}
                            // This is a WINDOW-level action — it does nothing to the
                            // item in a reader/note tab — so only offer it on the
                            // library tab. Offered from EVERY main window (primary
                            // or Weavero-spawned secondary alike).
                            if (!on || ctx.tabID !== "zotero-pane") {
                                ctx.setVisible(false); return;
                            }
                            ctx.setVisible(true);
                            ctx.menuElem.setAttribute("label", "New Main Window");
                        } catch (e) {
                            try { ctx.setVisible(false); } catch (e2) {}
                        }
                    },
                    onCommand: () => {
                        try {
                            // Flag the next main window to load as a Weavero-dev
                            // window so onMainWindowLoad gives it a clean, independent
                            // start (library tab only) instead of mirroring the
                            // shared session.
                            const plugin = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (plugin) {
                                plugin._wvPendingDevWindow = true;
                                plugin._wvClearSessionPaneState();   // open clean — no tab flash
                            }
                            (Zotero as any).openMainWindow();
                        }
                        catch (e) { Zotero.debug("[Weavero] dev openMainWindow err: " + e); }
                    },
                }],
            });
            if (id) this._devNewWindowMenuID = id;
        } catch (e) { Zotero.debug("[Weavero] _registerDevNewWindowMenu err: " + e); }
    }

    _unregisterDevNewWindowMenu() {
        try {
            if (this._devNewWindowMenuID && (Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.unregisterMenu === "function") {
                (Zotero as any).MenuManager.unregisterMenu(this._devNewWindowMenuID);
            }
        } catch (e) {}
        this._devNewWindowMenuID = null;
    }

    /** Keep the invariant "the OLDEST navigator:browser window is the untagged
     *  anchor; younger ones are tagged/managed." Zotero's session restore
     *  always reopens the oldest pane (its window enumerator is creation-order,
     *  oldest-first — verified in Gecko's nsWindowMediator), so the anchor must
     *  stay the oldest. The only event that can break this is the anchor
     *  closing, after which the new oldest is a managed window; promote it by
     *  untagging. Idempotent: a no-op when the oldest is already the anchor
     *  (e.g. a managed window closed). Run deferred, after the closing window
     *  has left the mediator. No relabel/wrap needed — an untagged window is
     *  simply left to Zotero's native restore. */
    _wvNormalizeAnchor() {
        try {
            const en = Services.wm.getEnumerator("navigator:browser");
            const oldest: any = en.hasMoreElements() ? en.getNext() : null;   // first = oldest
            if (oldest && oldest._wvManagedWindow) {
                delete oldest._wvManagedWindow;
                Zotero.debug("[Weavero] promoted new oldest window to anchor");
            }
            // Re-evaluate the main-window dot on all windows: the count just
            // changed, so dropping to a single window hides the dot, and the
            // promoted window (if any) gets re-evaluated as the new anchor.
            try { this._wvUpdateAllMainWindowIndicators(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvNormalizeAnchor err: " + e); }
    }

    /** Initialise a Weavero-dev-spawned main window. A new main window first
     *  mirrors the shared session (`Zotero_Tabs.restoreState` at zoteroPane.js
     *  init, async), so we wait for that to settle (tab count stable), then:
     *   • restore case (group given) → closeAll + restoreState(group.tabs),
     *   • clean case (no group)      → closeAll + focus My Library.
     *  Waiting for the count to stabilise avoids both racing the async native
     *  restore and double-applying our own restore. NOTE: only the TABS are
     *  isolated; Weavero's per-feature state (filters, tabs-menu sort, …) is a
     *  plugin-instance singleton still shared across windows. */
    _wvInitDevMainWindow(win, group) {
        if (!win) return;
        let lastCount = -1, stableTicks = 0, ticks = 0, done = false;
        const finish = () => {
            if (done) return; done = true;
            try {
                const tabs = win.Zotero_Tabs;
                if (tabs && typeof tabs.closeAll === "function") {
                    try { tabs.closeAll(); } catch (e) {}     // clears native-restored tabs (keeps library)
                }
                if (group && group.tabs && group.tabs.length > 1) {
                    try { tabs.restoreState(group.tabs); }    // re-add this dev window's own tabs
                    catch (e) { Zotero.debug("[Weavero] dev restore err: " + e); }
                } else {
                    try {
                        const cv = win.ZoteroPane && win.ZoteroPane.collectionsView;
                        if (cv && typeof cv.selectLibrary === "function") {
                            cv.selectLibrary(Zotero.Libraries.userLibraryID);
                        }
                    } catch (e) {}
                }
            } catch (e) { Zotero.debug("[Weavero] _wvInitDevMainWindow err: " + e); }
        };
        const settle = () => {
            if (done) return;
            ticks++;
            let n = -1;
            try { n = win.Zotero_Tabs ? win.Zotero_Tabs.getState().length : -1; } catch (e) {}
            if (n === lastCount) stableTicks++; else { stableTicks = 0; lastCount = n; }
            // Stable for ~2 ticks → native restore done; cap at ~3s as a backstop.
            if (stableTicks >= 2 || ticks >= 15) { finish(); return; }
            try { win.setTimeout(settle, 200); } catch (e) { finish(); }
        };
        try { win.setTimeout(settle, 150); } catch (e) { finish(); }
    }

    // ---- Unified Weavero session store (Phase 1: dev main windows) --------
    // One Weavero-owned store + recreation path for non-primary managed
    // windows. Phase 1 covers dev main windows (spawned via the hidden
    // devNewMainWindow feature); separate reader windows keep their own
    // persistence (reader-tab-windows.json) until Phase 2 folds them in here.
    // Store: <data dir>/weavero/session.json, v3 = { windows: [ {kind, tabs} ] }.

    _wvSessionStorePath() {
        return PathUtils.join(PathUtils.join(Zotero.DataDirectory.dir, "weavero"), "session.json");
    }

    /** Sync snapshot of every currently-open dev main window. Stores each
     *  window's full `Zotero_Tabs.getState()` (same shape Zotero's own pane
     *  session uses), so restore round-trips via `Zotero_Tabs.restoreState`.
     *  Cheap + synchronous → safe to call from the quit observer. */
    _wvSessionCaptureDevWindows() {
        const groups: any[] = [];
        try {
            const en = Services.wm.getEnumerator("navigator:browser");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (!w || !w._wvManagedWindow) continue;
                let tabs = null;
                try { tabs = w.Zotero_Tabs && w.Zotero_Tabs.getState(); } catch (e) {}
                if (!tabs || tabs.length < 2) continue;   // library tab only → nothing to restore
                groups.push({ kind: "main-dev", tabs });
            }
        } catch (e) { Zotero.debug("[Weavero] _wvSessionCaptureDevWindows err: " + e); }
        return groups;
    }

    /** Issue an atomic write of the store doc (chained so writes serialise). */
    _wvSessionWrite(doc) {
        try {
            const dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero");
            const path = this._wvSessionStorePath();
            this._wvSessionWriteChain = (this._wvSessionWriteChain || Promise.resolve())
                .then(async () => {
                    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                    await IOUtils.writeUTF8(path, JSON.stringify(doc, null, 2), { tmpPath: path + ".tmp" });
                })
                .catch((e: any) => Zotero.debug("[Weavero] _wvSessionWrite err: " + e));
            return this._wvSessionWriteChain;
        } catch (e) { Zotero.debug("[Weavero] _wvSessionWrite err: " + e); }
    }

    /** Synchronous capture + issue write. Safe from `quit-application-granted`:
     *  capture is sync; the IOUtils write is flushed by Gecko's profile-before-
     *  change I/O barrier as long as it's *issued* here (no awaits before it). */
    _wvSessionSaveSync() {
        // Unified doc: dev main windows + reader windows in one file, captured
        // together on every save so neither path clobbers the other's entries.
        this._wvSessionWrite({ version: 4, windows: [
            ...this._wvSessionCaptureDevWindows(),
            ...this._wvSessionCaptureReaderWindows(),
        ] });
    }

    /** Debounced save — coalesces churn (e.g. closing a dev window). */
    _wvSessionSaveDebounced() {
        try {
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            const clearT = (win && win.clearTimeout) ? win.clearTimeout.bind(win) : clearTimeout;
            if (this._wvSessionSaveTimer) { try { clearT(this._wvSessionSaveTimer); } catch (e) {} }
            this._wvSessionSaveTimer = setT(() => {
                this._wvSessionSaveTimer = null;
                try { this._wvSessionSaveSync(); } catch (e) {}
            }, 400);
        } catch (e) { try { this._wvSessionSaveSync(); } catch (e2) {} }
    }

    /** Read + parse the store; returns the windows array (empty on missing). */
    async _wvSessionLoad() {
        try {
            const text: any = await Zotero.File.getContentsAsync(this._wvSessionStorePath());
            const doc = JSON.parse(text);
            if (doc && Array.isArray(doc.windows)) return doc.windows;
        } catch (e) { /* missing/unreadable → none */ }
        return [];
    }

    /** Recreate previously-open dev main windows from the store, gated by the
     *  prefs (`devNewMainWindow` on — see prefs.html — AND the still-hidden
     *  `devSessionAutoReopen` ≠ false).
     *  Queues the saved groups and spawns windows one at a time, chained off
     *  each window's load (no timing races); Weavero owning the recreation is
     *  what resolves window↔group identity, Firefox-style. */
    async _wvSessionRestoreDevWindows() {
        try {
            if (this._wvSessionDevRestored) return;
            this._wvSessionDevRestored = true;
            // Reload-safe guard: if any managed window is ALREADY open, this is
            // a plugin hot-reload (windows persist), not a cold start — the
            // instance flag above was reset by the reload, so we check the live
            // windows instead. Don't re-spawn windows that are already there.
            try {
                const en = Services.wm.getEnumerator("navigator:browser");
                while (en.hasMoreElements()) { if ((en.getNext() as any)._wvManagedWindow) return; }
            } catch (e) {}
            let featureOn = false;
            try { featureOn = (this as any)._getDevNewMainWindow(); } catch (e) {}
            // Cascades from the Tabs and Windows section master.
            try { if (featureOn && !(this as any)._getTabsAndWindowsMaster()) featureOn = false; } catch (e) {}
            if (!featureOn) return;
            let auto = true;
            try { const v = Zotero.Prefs.get("weavero.devSessionAutoReopen"); auto = (v === undefined) ? true : !!v; } catch (e) {}
            if (!auto) return;
            const groups = (await this._wvSessionLoad())
                .filter((g: any) => g && g.kind === "main-dev" && g.tabs && g.tabs.length > 1);
            if (!groups.length) return;
            this._wvDevSpawnQueue = groups.slice();
            this._wvSpawnNextDevWindow();
        } catch (e) { Zotero.debug("[Weavero] _wvSessionRestoreDevWindows err: " + e); }
    }

    /** Spawn the next queued dev window. Its `onMainWindowLoad` consumes one
     *  queued group and (if more remain) chains the next spawn. */
    _wvSpawnNextDevWindow() {
        try {
            if (!this._wvDevSpawnQueue || !this._wvDevSpawnQueue.length) return;
            this._wvPendingDevWindow = true;
            this._wvClearSessionPaneState();        // open clean — no flash of the original's tabs
            (Zotero as any).openMainWindow();
        } catch (e) { Zotero.debug("[Weavero] _wvSpawnNextDevWindow err: " + e); }
    }

    /** Temporarily drop the saved 'pane' (main-window) entries from
     *  `Zotero.Session.state` so a window we're about to open doesn't restore —
     *  and briefly flash — the original window's tabs before Weavero clears them.
     *  Restored once the spawn run finishes (`_wvRestoreSessionPaneState`, from
     *  onMainWindowLoad), with a safety timeout in case that never fires. The
     *  global state self-heals on the next `Session.save` regardless. Idempotent;
     *  'reader' entries are left intact. */
    _wvClearSessionPaneState() {
        try {
            const full: any = Zotero.Session.state.windows;
            if (!Array.isArray(full)) return;
            const filtered = full.filter((w: any) => w && w.type !== "pane");
            if (filtered.length !== full.length) {
                Zotero.Session.state.windows = filtered;
                Zotero.debug("[Weavero] cleared " + (full.length - filtered.length)
                    + " session pane entr(ies) for clean window open");
            }
        } catch (e) { Zotero.debug("[Weavero] _wvClearSessionPaneState err: " + e); }
    }

    /** Retained as a no-op: we no longer restore the cleared pane state (doing
     *  so re-populated it before the new window read it → the tab flash). The
     *  in-memory state self-heals on the next `Session.save`. */
    _wvRestoreSessionPaneState() {}

    /** Register a `quit-application-granted` observer that synchronously
     *  captures the open dev windows and issues the store write — the
     *  authoritative final save (the debounced ones may not flush at quit).
     *  Same hook + timing Zotero's own `Session.save` relies on. */
    _wvSessionRegisterQuitFlush() {
        try {
            if (this._wvSessionQuitObserver) return;
            const self = this;
            const obs = { observe() { try { self._wvSessionSaveSync(); } catch (e) {} } };
            this._wvSessionQuitObserver = obs;
            Services.obs.addObserver(obs, "quit-application-granted", false);
        } catch (e) { Zotero.debug("[Weavero] _wvSessionRegisterQuitFlush err: " + e); }
    }

    _wvSessionUnregisterQuitFlush() {
        try {
            if (this._wvSessionQuitObserver) {
                Services.obs.removeObserver(this._wvSessionQuitObserver, "quit-application-granted");
                this._wvSessionQuitObserver = null;
            }
        } catch (e) {}
    }

    // ---- Per-window items-tree column isolation (interim) ------------------
    // PROBLEM: Zotero persists items-tree column layout to ONE file
    // (treePrefs.json) keyed by the tree's id ("item-tree-main"), shared by
    // every main window — and the tree RE-READS it on every view/tab switch
    // (`_loadColumnPrefsFromFile` in `setId`). So two windows clobber each
    // other's columns, live.
    //
    // FIX (interim): for MANAGED (non-anchor) windows only, re-point the tree's
    // column file I/O to a per-window key so each window keeps its own layout.
    // The anchor keeps "item-tree-main" (native, works without Weavero). We
    // never touch `this.id` (used elsewhere) — only the two file methods — and
    // writes only set a NEW key (atomic, all other keys preserved), so the
    // primary window's columns can't be affected.
    //
    // ⚠ THE SEAM: when library tabs become first-class tabs (multiple per
    // window), this moves to a per-TAB key in Weavero's own store — change it
    // here. Session-scoped today (runtime seq); not persisted per-window across
    // restarts yet.
    _wvScheduleApplyPerWindowColumns(win) {
        let tries = 0;
        const tick = () => {
            try {
                if (!win || win.closed) return;
                const iv = win.ZoteroPane && win.ZoteroPane.itemsView;
                if (iv) { this._wvApplyPerWindowColumns(win); return; }
                if (++tries >= 20) return;          // give up after ~6s
                win.setTimeout(tick, 300);
            } catch (e) {}
        };
        try { win.setTimeout(tick, 300); } catch (e) {}
    }

    async _wvApplyPerWindowColumns(win) {
        try {
            if (!win || !win._wvManagedWindow) return;
            const iv: any = win.ZoteroPane && win.ZoteroPane.itemsView;
            if (!iv || iv._wvColIsolated) return;
            if (!iv.props || !iv.props.columnPicker) return;   // no column persistence to isolate
            iv._wvColIsolated = true;                          // guard re-entry across awaits
            // Let the tree finish its initial (shared-key) load so _columnPrefs
            // holds the columns it's currently showing, before we seed our key.
            try { if (iv._sortContextReadyPromise) await iv._sortContextReadyPromise; } catch (e) {}
            const origId = iv.id;
            const seq = (this._wvColSeq = (this._wvColSeq || 0) + 1);
            const key = origId + "::wv" + seq;
            const path = PathUtils.join((Zotero as any).Profile.dir, "treePrefs.json");
            iv._wvColKey = key;
            iv._loadColumnPrefsFromFile = async function () {
                try {
                    const text: any = await Zotero.File.getContentsAsync(path);
                    const persist = JSON.parse(text);
                    let prefs = persist[key];
                    // Seed from the shared layout the first time (before our key exists).
                    if (!prefs || !Object.keys(prefs).length) prefs = persist[origId] || persist[origId + "-default"];
                    this._columnPrefs = prefs || {};
                } catch (e) { this._columnPrefs = {}; }
            };
            iv._writeColumnPrefsToFile = async function (force) {
                const self = this;
                const writeToFile = async () => {
                    let persist: any;
                    try { const t: any = await Zotero.File.getContentsAsync(path); persist = JSON.parse(t); } catch (e) { persist = {}; }
                    persist[key] = self._columnPrefs;            // only our key; everything else preserved
                    return Zotero.File.putContentsAsync(path, JSON.stringify(persist));   // atomic (tmpPath) internally
                };
                if (this._wvColWriteTimer) { try { clearTimeout(this._wvColWriteTimer); } catch (e) {} }
                if (force) return writeToFile();
                this._wvColWriteTimer = setTimeout(writeToFile, 60000);
            };
            // Seed our key with the columns the window currently shows, so future
            // re-reads use the isolated key instead of the shared fallback.
            try { await iv._writeColumnPrefsToFile(true); } catch (e) {}
            Zotero.debug("[Weavero] per-window items-tree columns isolated under " + key);
        } catch (e) { Zotero.debug("[Weavero] _wvApplyPerWindowColumns err: " + e); }
    }

    // ---- Per-window reader/note sidebar state (consistency plan) ----------
    // Zotero stores the reader/note sidebar (annotation panel) open+width per
    // TAB TYPE in ONE global pref `sidebarState` (tabs.js _loadSidebarState /
    // _saveSidebarState), shared by every window → resizing the sidebar in one
    // window follows in the others. Fix (managed windows only): re-point those
    // two methods to a per-window pref key, seeded once from the global. The
    // anchor keeps the global `sidebarState` (works without Weavero). Lazy-
    // loaded, so wrapping at onMainWindowLoad lands before first use.
    _wvApplyPerWindowSidebar(win) {
        try {
            if (!win || !win._wvManagedWindow) return;
            const tabs: any = win.Zotero_Tabs;
            if (!tabs || tabs._wvSidebarIsolated) return;
            if (typeof tabs._loadSidebarState !== "function" || typeof tabs._saveSidebarState !== "function") return;
            tabs._wvSidebarIsolated = true;
            const key = "sidebarState.wv" + (this._wvSidebarSeq = (this._wvSidebarSeq || 0) + 1);
            tabs._wvSidebarKey = key;
            const self = tabs;
            tabs._loadSidebarState = function () {
                let raw: any = Zotero.Prefs.get(key);
                if (raw == null || raw === "" || raw === "{}") raw = Zotero.Prefs.get("sidebarState") || "{}";  // seed from global once
                let st: any = {};
                try {
                    st = JSON.parse(raw) || {};
                    for (const t in st) { if (typeof st[t].width !== "number" || st[t].width < 100) st[t].width = 300; }
                } catch (e) { st = {}; }
                self._sidebarState = st;
            };
            tabs._saveSidebarState = function () {
                let s: any;
                try { s = JSON.stringify(self._sidebarState); }
                catch (e) { s = JSON.stringify({ reader: { width: 300, open: false }, note: { width: 300, open: false } }); }
                Zotero.Prefs.set(key, s);
            };
            // If the sidebar state was already loaded from the global before we
            // wrapped, persist it under our key so future reads use it.
            if (self._sidebarState) { try { tabs._saveSidebarState(); } catch (e) {} }
        } catch (e) { Zotero.debug("[Weavero] _wvApplyPerWindowSidebar err: " + e); }
    }

    // ---- Per-window pane widths (pane.persist) -----------------------------
    // ZoteroPane.unserializePersist reads the GLOBAL `pane.persist` pref once at
    // pane init; serializePersist OVERWRITES that same global pref with THIS
    // window's DOM widths at window destroy (zoteroPane.js). So closing a
    // managed window clobbers the global with its pane widths and the anchor
    // restores the wrong widths next session — cross-session contamination, not
    // live. Fix (managed windows only): re-point serializePersist to write a
    // per-window key, never the global. The READ stays global by design —
    // managed windows inherit the anchor's widths when they open
    // (unserializePersist runs at pane init, before onMainWindowLoad can wrap
    // it, and the per-window key is fresh each session anyway). The anchor keeps
    // writing the global (works without Weavero). Installed at open, long before
    // the window's eventual destroy.
    _wvApplyPerWindowPanePersist(win) {
        try {
            if (!win || !win._wvManagedWindow) return;
            const zp: any = win.ZoteroPane;
            if (!zp || zp._wvPanePersistIsolated) return;
            if (typeof zp.serializePersist !== "function") return;
            zp._wvPanePersistIsolated = true;
            const key = "pane.persist.wv" + (this._wvPanePersistSeq = (this._wvPanePersistSeq || 0) + 1);
            zp._wvPanePersistKey = key;
            const doc = win.document;
            zp.serializePersist = function () {
                try {
                    const serializedValues: any = {};
                    const persisted = new Set();
                    for (const el of doc.querySelectorAll("[zotero-persist]")) {
                        if (!el.getAttribute) continue;
                        const id = el.getAttribute("id");
                        if (!id) continue;
                        const elValues: any = {};
                        for (const attr of (el.getAttribute("zotero-persist") || "").split(/[\s,]+/)) {
                            if (el.hasAttribute(attr)) { elValues[attr] = el.getAttribute(attr); persisted.add(id); }
                        }
                        serializedValues[id] = elValues;
                    }
                    for (const i in serializedValues) { if (!persisted.has(i)) delete serializedValues[i]; }
                    Zotero.Prefs.set(key, JSON.stringify(serializedValues));   // per-window key, NEVER the global
                } catch (e) { Zotero.debug("[Weavero] serializePersist(wv) err: " + e); }
            };
        } catch (e) { Zotero.debug("[Weavero] _wvApplyPerWindowPanePersist err: " + e); }
    }

    // ---- Context-pane cross-window leak guard ------------------------------
    // Zotero's context-pane element reacts to the GLOBAL 'tab' Notifier and
    // reads the tab TYPE from the event (`extraData[tabID].type`), never
    // checking whether the tab belongs to THIS window. So selecting a reader
    // tab in one window shows the context pane in EVERY window — including ones
    // sitting on their library tab (→ library item pane + reader context pane
    // both visible = "duplicated sidebar"). Fix: wrap `_handleTabSelect` per
    // window to bail when the tab isn't one of this window's own tabs. No-op in
    // single-window (every tab is local), so the anchor is unaffected with
    // Weavero off. Applied to ALL main windows (the anchor leaks too).
    _wvGuardContextPaneCrossWindow(win) {
        try {
            if (!win || !win.document) return;
            const cp: any = win.document.getElementById("zotero-context-pane-inner");
            // Install the guard ONCE per window: ignore tab events for tabs that
            // aren't this window's own (the cross-window leak source).
            if (cp && !cp._wvCrossWindowGuarded && typeof cp._handleTabSelect === "function") {
                const orig = cp._handleTabSelect.bind(cp);
                cp._handleTabSelect = async function (action, type, ids, extraData) {
                    try {
                        const tabID = ids && ids[0];
                        // Only react to events about THIS window's CURRENTLY-selected
                        // tab. The old check used _getTab(tabID) ("is the tab local?"),
                        // but the library tab shares the id "zotero-pane" across ALL
                        // windows — so a library-tab select in ANOTHER window passed the
                        // check here and collapsed this window's reader pane. selectedID
                        // is per-window, so this correctly ignores other windows'
                        // selections (e.g. a cross-window reader move closing the source
                        // tab selects that window's library tab → must not collapse the
                        // destination window's pane).
                        if (tabID && win.Zotero_Tabs && win.Zotero_Tabs.selectedID !== tabID) return;
                    } catch (e) {}
                    return orig(action, type, ids, extraData);
                };
                cp._wvCrossWindowGuarded = true;
            }
            // Re-assert (every call): if this window is on its library tab, make
            // sure the context pane is collapsed — clears a stale pane left
            // visible by a leak that happened before the guard was installed
            // (e.g. during startup/restore). Mirrors Zotero's own library
            // handling (collapsed + splitter hidden); deliberately does NOT touch
            // the splitter STATE, so the reader-tab collapse preference is kept.
            try {
                if (win.Zotero_Tabs && win.Zotero_Tabs.selectedType === "library") {
                    const ctxEl = win.document.getElementById("zotero-context-pane");
                    const splitter = win.document.getElementById("zotero-context-splitter");
                    if (ctxEl) ctxEl.setAttribute("collapsed", "true");
                    if (splitter) splitter.setAttribute("hidden", "true");
                }
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvGuardContextPaneCrossWindow err: " + e); }
    }

    /** Guard + re-assert the context pane on EVERY open main window. Needed
     *  because the PRIMARY window's `onMainWindowLoad` doesn't fire at startup
     *  (it loads before the plugin), so it would otherwise never get guarded.
     *  Idempotent. */
    _wvGuardAllContextPanes() {
        try {
            const wins = (Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()]).filter(Boolean);
            for (const w of wins) {
                try { this._wvGuardContextPaneCrossWindow(w); } catch (e) {}
                try { this._wvUpdateMainWindowIndicator(w); } catch (e) {}
                try { this._wvApplyPerWindowSidebar(w); } catch (e) {}       // managed windows only (gated inside)
                try { this._wvApplyPerWindowPanePersist(w); } catch (e) {}   // managed windows only (gated inside)
            }
        } catch (e) {}
    }

    /** Mark the My Library tab of the ANCHOR window (the untagged primary) with
     *  a small accent dot, so the user can tell at a glance which window is the
     *  "main" one. Managed windows get no mark. Done with a window-root class +
     *  a CSS rule targeting the stable `data-id` selector — NOT a class on the
     *  tab element itself, which React re-renders would wipe. */
    _wvUpdateMainWindowIndicator(win) {
        try {
            const d = win && win.document;
            if (!d) return;
            // Class/attribute-only selector (NO `html` element name): the main
            // window's root is XUL <window>, so a type selector like `html` is in
            // the wrong namespace and wouldn't match.
            // ANCHOR icon at the RIGHT end of the library tab (an actual ⚓ —
            // this window is the "anchor" window). `::after` on the flex `.tab`
            // is its last flex item; the name grows (flex:1) and the close
            // button is display:none on the library tab, so this lands at the
            // far right. Drawn as an SVG mask so it tints with the accent color.
            const anchorSvg = encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"'
                + ' stroke="black" stroke-width="1.6" stroke-linecap="round">'
                + '<circle cx="8" cy="3.2" r="1.7"/>'
                + '<path d="M8 4.9 V 13.8"/>'
                + '<path d="M4.8 7.2 h6.4"/>'
                + '<path d="M2.3 9.5 a5.7 5.7 0 0 0 11.4 0"/>'
                + "</svg>");
            const css = `.wv-anchor-window #tab-bar-container .tab[data-id="zotero-pane"]::after{`
                + `content:"";display:inline-block;width:13px;height:13px;margin-inline-start:6px;`
                + `background-color:#3d6fe0;`
                + `mask:url("data:image/svg+xml,${anchorSvg}") center/contain no-repeat;`
                + `align-self:center;flex:0 0 auto;}`
                // Dark UI: the accent blue is too dim against the dark tab bar —
                // use a bright sky blue instead.
                + `.wv-ui-dark.wv-anchor-window #tab-bar-container .tab[data-id="zotero-pane"]::after{`
                + `background-color:#9dbcff;}`;
            let st: any = d.getElementById("wv-anchor-indicator-style");
            if (!st) {
                st = d.createElementNS("http://www.w3.org/1999/xhtml", "style");
                st.id = "wv-anchor-indicator-style";
                (d.head || d.documentElement).appendChild(st);
            }
            if (st.textContent !== css) st.textContent = css;   // refresh if rule changed
            // Show the dot only when there's MORE THAN ONE main window — with a
            // single window there's no "which is the main one?" ambiguity. Anchor
            // = the untagged window; managed windows are tagged.
            let multi = false;
            try { multi = (Zotero.getMainWindows ? Zotero.getMainWindows().length : 1) > 1; } catch (e) {}
            d.documentElement.classList.toggle("wv-anchor-window", multi && !win._wvManagedWindow);
        } catch (e) { Zotero.debug("[Weavero] _wvUpdateMainWindowIndicator err: " + e); }
    }

    /** Re-evaluate the main-window dot on EVERY window. Call whenever the window
     *  count changes (open/close), since going 1→2 windows should reveal the dot
     *  on the anchor and 2→1 should hide it. */
    _wvUpdateAllMainWindowIndicators() {
        try {
            const wins = (Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()]).filter(Boolean);
            for (const w of wins) { try { this._wvUpdateMainWindowIndicator(w); } catch (e) {} }
        } catch (e) {}
    }

    _teardownTabBarLibraryDecoration(win) {
        if (!win) return;
        const doc = win.document;
        try {
            if (win._wvTabBarDecoMo) {
                win._wvTabBarDecoMo.disconnect();
                delete win._wvTabBarDecoMo;
            }
        } catch (e) {}
        try {
            const tintStyle = doc
                && doc.getElementById("wv-tab-bar-tint-style");
            if (tintStyle) tintStyle.remove();
        } catch (e) {}
        // Strip the title-bar tooltip override and the tooltip
        // element itself. Per-tab attributes are no longer used.
        try {
            if (!doc) return;
            const titleBar = doc.getElementById("zotero-title-bar");
            if (titleBar
                && titleBar.getAttribute("tooltip")
                    === "wv-tab-library-tooltip") {
                titleBar.removeAttribute("tooltip");
            }
            // Defensively strip the legacy per-tab attribute in case
            // an older build set it on individual tabs.
            const container = doc.getElementById("tab-bar-container");
            if (container) {
                for (const tab of container.querySelectorAll(
                    ".tab[tooltip=\"wv-tab-library-tooltip\"]")) {
                    tab.removeAttribute("tooltip");
                }
            }
            const tooltip = doc.getElementById("wv-tab-library-tooltip");
            if (tooltip) tooltip.remove();
        } catch (e) {}
    }

    /** Single-pass decoration update: rebuild the tint stylesheet
     *  from the current set of group-library tabs and re-apply the
     *  library-name suffix to each matching tab's tooltip. Idempotent
     *  — safe to call repeatedly. */
    _decorateTabBar(win) {
        if (!win) return;
        const doc = win.document;
        if (!doc) return;
        const Zotero_Tabs = win.Zotero_Tabs;
        if (!Zotero_Tabs || !Array.isArray(Zotero_Tabs._tabs)) return;
        const container = doc.getElementById("tab-bar-container");
        if (!container) return;

        const userLibID = (Zotero.Libraries
            && Zotero.Libraries.userLibraryID);
        const groupTabs = [];
        for (const tab of Zotero_Tabs._tabs) {
            if (!tab || tab.id === "zotero-pane") continue;
            let libID = null;
            try {
                const item = Zotero.Items.get(
                    tab.data && tab.data.itemID);
                libID = item ? item.libraryID : null;
            } catch (e) {}
            if (libID == null || libID === userLibID) continue;
            try {
                const lib = Zotero.Libraries.get(libID);
                if (!lib || lib.libraryType !== "group") continue;
                groupTabs.push({ id: tab.id, libName: lib.name });
            } catch (e) {}
        }

        // Tint stylesheet — selector list keyed by data-id so it
        // survives React re-renders. #59ADC4 is the same hex used
        // by chrome/skin/.../collection-tree/16/light/library-group.svg.
        let style = doc.getElementById("wv-tab-bar-tint-style");
        if (!groupTabs.length) {
            if (style) style.remove();
        }
        else {
            if (!style) {
                style = doc.createElementNS(
                    "http://www.w3.org/1999/xhtml", "style");
                style.id = "wv-tab-bar-tint-style";
                (doc.head || doc.documentElement).appendChild(style);
            }
            const escape = (s) => (win.CSS && win.CSS.escape)
                ? win.CSS.escape(s) : s;
            // Overlay the "Group Libraries" cluster icon as a small
            // badge in the TOP-LEFT corner of the tab's
            // attachment-file-type icon (PDF/EPUB/snapshot/note/etc.).
            // Uses `groups.svg` (two-figures glyph — same icon Zotero
            // shows next to the "Group Libraries" header in the
            // collection-tree pane) rather than `library-group.svg`,
            // so the badge reads as "this came from group libraries"
            // generically rather than mimicking a specific group's
            // icon. Implemented as an `::after` pseudo-element on
            // `.tab-icon` so the badge overlays without disturbing
            // any layout or React-managed styling. The SVG ships with
            // a hard-coded #59ADC4 fill — same teal Zotero uses for
            // group libraries throughout the UI.
            const selIcon = groupTabs
                .map(t => `#tab-bar-container .tab[data-id="${
                    escape(t.id)}"] .tab-icon`)
                .join(",\n");
            const selBadge = groupTabs
                .map(t => `#tab-bar-container .tab[data-id="${
                    escape(t.id)}"] .tab-icon::after`)
                .join(",\n");
            style.textContent =
                selIcon + " {\n"
                + "  position: relative;\n"
                + "  overflow: visible;\n"
                + "}\n"
                + selBadge + " {\n"
                + "  content: \"\";\n"
                + "  position: absolute;\n"
                + "  left: -5px;\n"
                + "  top: -4px;\n"
                + "  width: 13px;\n"
                + "  height: 13px;\n"
                // Disc behind the badge so the (#59ADC4) glyph
                // separates from the file-type icon underneath. The
                // disc colour matches the tab-bar background tint.
                + "  background-color: var(--material-toolbar, #fff);\n"
                + "  border-radius: 50%;\n"
                + "  background-image: url(\"chrome://zotero/skin/collection-tree/16/light/groups.svg\");\n"
                + "  background-size: 11px 11px;\n"
                + "  background-repeat: no-repeat;\n"
                + "  background-position: center;\n"
                + "  pointer-events: none;\n"
                + "}\n";
        }

        // Tooltip resolution is now handled at the title-bar level
        // (set up once in `_setupTabBarLibraryDecoration`) — no
        // per-tab `tooltip="..."` wiring is needed. Mozilla ignores
        // that attribute on HTML elements anyway. The popupshowing
        // handler decides what to render based on the trigger tab.

        // Override the tab-icon `data-item-type` for linked attachments
        // so the tab shows the link-decorated glyph (PDFLink, EPUBLink,
        // etc.) instead of the plain attachment icon Zotero picks via
        // its link-mode-stripped lookup.
        try { this._decorateTabIconsForLinkMode(win); } catch (e) {}
    }

    /** Stamp link-mode-aware `data-item-type` values onto tab-icon
     *  spans for linked attachments (`LINK_MODE_LINKED_FILE`). Zotero
     *  builds tab icons from `getItemTypeIconName(true)` (the
     *  link-mode-stripped form), so a linked PDF tab gets the plain
     *  PDF glyph. Zotero's own SCSS DOES ship link-decorated variants
     *  for `attachmentPDFLink` / `attachmentEPUBLink` etc. — we just
     *  point the existing icon span at them. Idempotent; re-runs every
     *  MutationObserver tick from `_decorateTabBar`. */
    _decorateTabIconsForLinkMode(win: any) {
        if (!win) return;
        const doc = win.document;
        if (!doc) return;
        const Zotero_Tabs: any = win.Zotero_Tabs;
        if (!Zotero_Tabs || !Array.isArray(Zotero_Tabs._tabs)) return;

        const LINKED_FILE = (Zotero as any).Attachments
            && (Zotero as any).Attachments.LINK_MODE_LINKED_FILE;
        if (LINKED_FILE == null) return;

        const escape = (s: string) =>
            (win.CSS && win.CSS.escape) ? win.CSS.escape(s) : s;

        for (const tab of Zotero_Tabs._tabs) {
            if (!tab || tab.id === "zotero-pane") continue;
            const tabEl = doc.querySelector(
                `.tab[data-id="${escape(tab.id)}"]`);
            if (!tabEl) continue;
            const iconEl = tabEl.querySelector(".tab-icon");
            if (!iconEl) continue;

            let kind: string | null = null;
            try {
                const item = Zotero.Items.get(tab.data && tab.data.itemID);
                if (item && (item as any).isAttachment
                    && (item as any).isAttachment()
                    && (item as any).attachmentLinkMode === LINKED_FILE
                    && typeof (item as any).getItemTypeIconName === "function") {
                    // Pass `false` to keep the LinkMode suffix (PDFLink,
                    // EPUBLink, ImageLink, VideoLink, generic Link).
                    kind = (item as any).getItemTypeIconName(false);
                }
            } catch (_) {}

            if (!kind) {
                // Non-linked tab — only revert if WE were the last to
                // touch it (don't trample Zotero's value).
                if (iconEl.getAttribute("data-wv-linkmode") === "1") {
                    iconEl.removeAttribute("data-wv-linkmode");
                }
                continue;
            }
            if (iconEl.getAttribute("data-item-type") !== kind) {
                iconEl.setAttribute("data-item-type", kind);
            }
            iconEl.setAttribute("data-wv-linkmode", "1");
        }
    }

    /** popupshowing handler for the custom tab tooltip. Mounted on
     *  `#zotero-title-bar` (which intercepts every hover in the tab
     *  strip), so we dispatch on the trigger:
     *    - Group-library tab → rich card (title + library header).
     *    - Anything else → plain-title behavior, mirroring Zotero's
     *      stock html-tooltip (set the `label` attribute and let
     *      the platform render its auto-generated tooltip-label).
     *  Returns true to allow the tooltip; false to suppress entirely. */
    _populateTabTooltip(win, tooltip) {
        const triggerNode = tooltip.triggerNode;
        if (!triggerNode) return false;
        const doc = win.document;

        // Always start from a clean slate — strip prior children AND
        // any previously-set label attribute so the two render modes
        // don't bleed into each other.
        while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
        tooltip.removeAttribute("label");

        const findTitle = () => {
            const tn = triggerNode.closest && triggerNode.closest(
                "div *[title], iframe *[title], browser *[title]");
            return tn ? tn.getAttribute("title") : null;
        };
        // Build the platform's standard `<description class="tooltip-label">`
        // child explicitly. Mozilla's auto-rendering from the `label`
        // attribute does NOT fire when the attribute is set inside
        // popupshowing (the popup paints a 0-px frame instead). Setting
        // both attribute and an explicit child covers every code path.
        const renderPlainLabel = (text) => {
            tooltip.setAttribute("label", text);
            const desc = doc.createXULElement("description");
            desc.setAttribute("class", "tooltip-label");
            desc.textContent = text;
            tooltip.appendChild(desc);
        };

        // "Show in Library" tab-context menuitem trigger: a menuitem
        // we stamped with `data-wv-show-in-library-libid="N"` from the
        // popupshowing repositioner. Resolve the library by id directly
        // (no tab lookup) and render JUST the library header — no
        // separator, no title row — since the menu entry already labels
        // itself "Show in Library". Has to come BEFORE the tab lookup
        // because menuitems don't sit inside `.tab[data-id]`.
        let menuLibIDStr: string | null = null;
        try {
            let n: any = triggerNode;
            while (n) {
                if (n.getAttribute
                        && n.getAttribute("data-wv-show-in-library-libid")) {
                    menuLibIDStr = n.getAttribute("data-wv-show-in-library-libid");
                    break;
                }
                n = n.parentNode;
            }
        } catch (_) {}
        if (menuLibIDStr != null) {
            let mLib: any = null;
            try { mLib = Zotero.Libraries.get(parseInt(menuLibIDStr, 10)); } catch (_) {}
            if (mLib && mLib.libraryType && mLib.libraryType !== "user" && mLib.name) {
                const wrap = doc.createXULElement("vbox");
                wrap.setAttribute("class", "wv-tab-tooltip-wrap");
                const headerRow = doc.createXULElement("hbox");
                headerRow.setAttribute("class", "wv-tab-tooltip-header");
                headerRow.setAttribute("align", "center");
                const iconEl = doc.createXULElement("image");
                iconEl.setAttribute("class", "wv-tab-tooltip-icon");
                const iconName = mLib.libraryType === "feed"
                    ? "feed-library.svg"
                    : "library-group.svg";
                iconEl.setAttribute("src",
                    "chrome://zotero/skin/collection-tree/16/light/" + iconName);
                headerRow.appendChild(iconEl);
                const nameEl = doc.createXULElement("description");
                nameEl.setAttribute("class", "wv-tab-tooltip-libname");
                nameEl.textContent = mLib.name;
                headerRow.appendChild(nameEl);
                wrap.appendChild(headerRow);
                tooltip.appendChild(wrap);
                return true;
            }
        }

        const tab = (triggerNode.closest && triggerNode.closest(
            ".tab[data-id]")) || null;

        // Non-tab hover or Library tab: fall back to plain-title
        // behavior so we don't suppress the standard tooltips for
        // window-control / non-tab descendants of #zotero-title-bar.
        if (!tab || tab.dataset.id === "zotero-pane") {
            const t = findTitle();
            if (t) {
                renderPlainLabel(t);
                return true;
            }
            return false;
        }

        const tabId = tab.dataset.id;
        const Zotero_Tabs = win.Zotero_Tabs;
        const tabData = Zotero_Tabs && Zotero_Tabs._tabs.find(
            t => t.id === tabId);

        let libID = null;
        try {
            const item = Zotero.Items.get(
                tabData && tabData.data && tabData.data.itemID);
            libID = item ? item.libraryID : null;
        }
        catch (e) {}
        let lib = null;
        if (libID != null) {
            try { lib = Zotero.Libraries.get(libID); }
            catch (e) {}
        }

        // Non-group-library tab: keep upstream's plain-text tooltip
        // instead of an empty Weavero card.
        if (!lib || lib.libraryType !== "group") {
            const t = findTitle()
                || (tabData && tabData.title)
                || null;
            if (t) {
                renderPlainLabel(t);
                return true;
            }
            return false;
        }

        // Group library tab — build the rich card. (children are
        // already cleared from the early reset above.)

        const wrap = doc.createXULElement("vbox");
        wrap.setAttribute("class", "wv-tab-tooltip-wrap");

        // Library header first: themed library-group icon + library name,
        // same visual as the popup's section header. The XUL <image>
        // element renders the SVG via `chrome://` URL with
        // -moz-context-properties so it picks up the right fill.
        const headerRow = doc.createXULElement("hbox");
        headerRow.setAttribute("class", "wv-tab-tooltip-header");
        headerRow.setAttribute("align", "center");
        const iconEl = doc.createXULElement("image");
        iconEl.setAttribute("class", "wv-tab-tooltip-icon");
        iconEl.setAttribute("src",
            "chrome://zotero/skin/collection-tree/16/light/library-group.svg");
        headerRow.appendChild(iconEl);
        const nameEl = doc.createXULElement("description");
        nameEl.setAttribute("class", "wv-tab-tooltip-libname");
        nameEl.textContent = lib.name;
        headerRow.appendChild(nameEl);
        wrap.appendChild(headerRow);

        // Thin separator between library header and tab title.
        const sep = doc.createXULElement("box");
        sep.setAttribute("class", "wv-tab-tooltip-sep");
        wrap.appendChild(sep);

        // Tab title row (below the library label).
        const titleEl = doc.createXULElement("description");
        titleEl.setAttribute("class", "wv-tab-tooltip-title");
        titleEl.textContent = tabData.title || "";
        wrap.appendChild(titleEl);

        tooltip.appendChild(wrap);
        return true;
    }

    /** Funnel button at the right end of the tabs-menu search row.
     *  Click opens an icon-grid popup of attachment file kinds (PDF,
     *  EPUB, Snapshot, Image, Video, Web Link, Other File). Same
     *  tristate gesture as the items-tree filter — click to include,
     *  Alt+click to exclude. The first call inserts the button and
     *  initialises the per-instance filter state (Set-of-include
     *  + Set-of-exclude). Re-runs are idempotent. */
    _setupTabsMenuFileTypeFilter(win) {
        if (!win) return;
        const doc = win.document;
        if (!doc) return;
        const panel = doc.getElementById("zotero-tabs-menu-panel");
        if (!panel) {
            // tabs-menu-panel is a custom element; if it's not yet
            // upgraded, the wrapper / input children won't exist.
            // Retry shortly.
            win.setTimeout(
                () => this._setupTabsMenuFileTypeFilter(win), 1000);
            return;
        }
        const input = panel.querySelector("#zotero-tabs-menu-filter");
        if (!input) {
            win.setTimeout(
                () => this._setupTabsMenuFileTypeFilter(win), 1000);
            return;
        }
        // Lazily init filter state — survives panel close/reopen
        // but resets on plugin reload (Map / Set are fresh on each
        // class instantiation).
        if (!this._tabsMenuFileTypeFilter) {
            this._tabsMenuFileTypeFilter = {
                include: new Set(),
                exclude: new Set(),
            };
        }
        // Initialise display-settings state on first install. These
        // ride the Weavero instance so they survive panel close/
        // reopen but reset on plugin reload.
        if (this._tabsMenuGroupByLibrary === undefined) {
            this._tabsMenuGroupByLibrary = true;
        }
        if (this._tabsMenuShowAnnotationCount === undefined) {
            this._tabsMenuShowAnnotationCount = false;
        }
        // Replace any prior install — picks up code changes after
        // hot-reload without requiring a full window restart.
        let prev = panel.querySelector("#wv-tabs-menu-filetype-btn");
        if (prev) prev.remove();
        let prevPopup = panel.querySelector("#wv-tabs-menu-filetype-popup");
        if (prevPopup) prevPopup.remove();
        let prevGear = panel.querySelector("#wv-tabs-menu-settings-btn");
        if (prevGear) prevGear.remove();
        let prevGearPopup = panel.querySelector("#wv-tabs-menu-settings-popup");
        if (prevGearPopup) prevGearPopup.remove();

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.id = "wv-tabs-menu-filetype-btn";
        btn.type = "button";
        btn.title = "Filter tabs by attachment file type. "
            + "Click in the popup to filter, Alt+click to exclude.";
        // Use the same `filter.svg` Zotero ships for the items-list
        // filter button (themed via -moz-context-properties), plus a
        // small dropmarker chevron so the visual matches the items
        // toolbar button shape (icon + ▾).
        btn.style.setProperty("-moz-context-properties",
            "fill, fill-opacity, stroke, stroke-opacity");
        btn.style.fill = "currentColor";
        const ic = doc.createElementNS(NS_HTML, "img");
        ic.className = "wv-tabs-menu-filetype-icon";
        ic.src = "chrome://zotero/skin/16/universal/filter.svg";
        btn.appendChild(ic);
        // Blue active-filter dot on the funnel — same convention as the library
        // and reader filter buttons (shown via .wv-active, set by
        // _refreshFileTypeFilterButtonState when a file-type filter is set).
        const dot = doc.createElementNS(NS_HTML, "span");
        dot.className = "wv-tabs-menu-filetype-dot";
        btn.appendChild(dot);
        // Tiny chevron — matches the look of a XUL toolbarbutton
        // dropmarker (8×8 ▾). Inline SVG so it inherits the same
        // currentColor treatment as the icon.
        const chev = doc.createElementNS(NS_HTML, "span");
        chev.className = "wv-tabs-menu-filetype-chev";
        chev.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" "
            + "width=\"8\" height=\"8\" viewBox=\"0 0 8 8\" "
            + "fill=\"currentColor\">"
            + "<path d=\"M1 2.5h6L4 6z\"/>"
            + "</svg>";
        btn.appendChild(chev);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            this._toggleTabsMenuFileTypePopup(win, panel, btn);
        });
        // Insert AFTER the input so the visual order is
        // [gear] [search field] [funnel].
        input.insertAdjacentElement("afterend", btn);

        // Settings (gear) button on the LEFT of the search input —
        // hosts display-only toggles like "Sort by Library" and
        // "Show Annotations Count" (no filter semantics, hence
        // separate from the funnel).
        const gear = doc.createElementNS(NS_HTML, "button");
        gear.id = "wv-tabs-menu-settings-btn";
        gear.type = "button";
        gear.title = "Tabs menu settings";
        gear.style.setProperty("-moz-context-properties",
            "fill, fill-opacity, stroke, stroke-opacity");
        gear.style.fill = "currentColor";
        const gearIcon = doc.createElementNS(NS_HTML, "img");
        gearIcon.className = "wv-tabs-menu-settings-icon";
        // Zotero's `cog.svg` is the actual gear/settings icon
        // (universal 20). `options.svg` is three dots ("more
        // actions") — different convention. Scaled to 16 in CSS.
        gearIcon.src = "chrome://zotero/skin/20/universal/cog.svg";
        gear.appendChild(gearIcon);
        gear.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            this._toggleTabsMenuSettingsPopup(win, panel, gear);
        });
        // Insert BEFORE the input so the visual order is
        // [gear] [search field] [funnel].
        input.insertAdjacentElement("beforebegin", gear);

        this._refreshFileTypeFilterButtonState(panel);
    }

    /** Open or close the file-type icon-grid popup, anchored under
     *  the funnel button. The popup is an HTML <div> mounted inside
     *  the tabs-menu panel so clicks inside it don't dismiss the
     *  parent <panel>. */
    _toggleTabsMenuFileTypePopup(win, panel, anchor) {
        const doc = win.document;
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const existing = panel.querySelector(
            "#wv-tabs-menu-filetype-popup");
        if (existing) {
            existing.remove();
            if (this._wvFileTypeOutsideClose) {
                doc.removeEventListener("mousedown",
                    this._wvFileTypeOutsideClose, true);
                delete this._wvFileTypeOutsideClose;
            }
            return;
        }

        const popup = doc.createElementNS(NS_HTML, "div");
        popup.id = "wv-tabs-menu-filetype-popup";

        // Clear all currently-active tab filters in one shot. Used
        // by both the "Clear" text button and the red × button.
        // Covers BOTH dimensions the tab filter applies — the
        // file-type include/exclude sets and the per-library
        // tickbox states — so the user gets a true reset, matching
        // the items-tree filter's "Clear" semantics.
        const clearAll = () => {
            if (this._tabsMenuFileTypeFilter) {
                this._tabsMenuFileTypeFilter.include.clear();
                this._tabsMenuFileTypeFilter.exclude.clear();
            }
            if (this._tabsMenuLibraryFilter) {
                this._tabsMenuLibraryFilter.clear();
            }
            renderButtons();
            this._refreshFileTypeFilterButtonState(panel);
            this._wvRegroupTabsMenu(panel);
        };

        const renderButtons = () => {
            while (popup.firstChild) popup.removeChild(popup.firstChild);

            // Top bar — same layout as the items-tree filter popup:
            // [hint on the left] [Clear text button] [red × Clear-and-Close].
            // Reuses the existing CSS classes wholesale.
            const topBar = doc.createElementNS(NS_HTML, "div");
            topBar.className = "wv-filter-top-bar wv-tabs-menu-filetype-topbar";
            const hint = doc.createElementNS(NS_HTML, "span");
            hint.className = "wv-filter-top-hint";
            hint.textContent = "Alt+click to exclude";
            topBar.appendChild(hint);
            const clearTextBtn = doc.createElementNS(NS_HTML, "button");
            clearTextBtn.type = "button";
            clearTextBtn.className = "wv-filter-clear-btn";
            clearTextBtn.textContent = "Clear";
            clearTextBtn.title
                = "Clear all tab filters (keep this window open)";
            clearTextBtn.setAttribute("aria-label",
                "Clear all tab filters");
            clearTextBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                clearAll();
            });
            topBar.appendChild(clearTextBtn);
            const clearBtn = doc.createElementNS(NS_HTML, "button");
            clearBtn.type = "button";
            clearBtn.className = "wv-filter-clear-icon";
            clearBtn.setAttribute("aria-label", "Clear and Close");
            clearBtn.title = "Clear and Close";
            clearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                clearAll();
                // Dismiss the file-type popup once everything is
                // cleared — there's nothing to interact with.
                if (this._wvFileTypeOutsideClose) {
                    doc.removeEventListener("mousedown",
                        this._wvFileTypeOutsideClose, true);
                    delete this._wvFileTypeOutsideClose;
                }
                popup.remove();
            });
            topBar.appendChild(clearBtn);
            // Hide both controls when nothing is filtering anything
            // — same UX as the items-tree popup.
            const ft = this._tabsMenuFileTypeFilter;
            const lf = this._tabsMenuLibraryFilter;
            const anyActive
                = !!(ft && (ft.include.size > 0 || ft.exclude.size > 0))
                || !!(lf && lf.size > 0);
            if (!anyActive) {
                clearTextBtn.style.visibility = "hidden";
                clearBtn.style.visibility = "hidden";
            }
            popup.appendChild(topBar);

            const inc = this._tabsMenuFileTypeFilter.include;
            const exc = this._tabsMenuFileTypeFilter.exclude;
            // Reusable toggle for any tristate value — used for
            // both attachment file kinds and the Note button.
            const toggle = (val, alt) => {
                if (alt) {
                    if (exc.has(val)) exc.delete(val);
                    else { inc.delete(val); exc.add(val); }
                }
                else {
                    if (inc.has(val)) inc.delete(val);
                    else { exc.delete(val); inc.add(val); }
                }
                renderButtons();
                this._refreshFileTypeFilterButtonState(panel);
                this._wvRegroupTabsMenu(panel);
            };
            const makeOpt = (val, label, opts) => {
                const b = doc.createElementNS(NS_HTML, "button");
                b.type = "button";
                b.className = "wv-filter-opt wv-filter-opt-icon";
                b.title = label
                    + " — click to include, Alt+click to exclude.";
                if (inc.has(val)) b.dataset.selected = "true";
                if (exc.has(val)) b.dataset.excluded = "true";
                let ic;
                if (opts && opts.itemType) {
                    // Use Zotero's `.icon-item-type[data-item-type=…]`
                    // CSS — the item-tree stylesheet ships theme-aware
                    // background-image rules (separate light/dark
                    // SVG paths), so this picks the right icon for
                    // the active theme automatically.
                    ic = doc.createElementNS(NS_HTML, "span");
                    ic.className = "icon icon-css icon-item-type";
                    ic.setAttribute("data-item-type", opts.itemType);
                }
                else if (opts && opts.accentColor) {
                    // Themed via `var(--accent-*)`: the
                    // `wv-filter-svg` class enables
                    // -moz-context-properties + `fill: currentColor`,
                    // so a `style.color = var(--accent-*)` flows
                    // through to the SVG fill and follows the active
                    // light/dark theme.
                    ic = doc.createElementNS(NS_HTML, "img");
                    ic.className = "wv-filter-svg";
                    ic.style.color = opts.accentColor;
                    ic.src = opts.iconSrc;
                }
                else {
                    ic = doc.createElementNS(NS_HTML, "img");
                    ic.className = "wv-attach-icon";
                    ic.src = opts.iconSrc;
                }
                b.appendChild(ic);
                b.addEventListener("click", (e) => {
                    e.stopPropagation();
                    toggle(val, e.altKey);
                });
                return b;
            };
            // The file-type tiles + Note live in their own row so the
            // popup can stack the top bar above them in column flow.
            const ftRow = doc.createElementNS(NS_HTML, "div");
            ftRow.className = "wv-tabs-menu-filetype-row";
            popup.appendChild(ftRow);

            for (const def of this._ATTACHMENT_FILE_TYPES) {
                // `def.value` already matches Zotero's camelCase
                // `data-item-type` (attachmentPDF, attachmentEPUB,…).
                ftRow.appendChild(makeOpt(def.value, def.label,
                    { itemType: def.value }));
            }
            // Vertical separator + Note tile at the right end —
            // notes are a different kind of attachment-level row
            // (not files), so visually grouped apart from the
            // file-type icons. The filter value `"note"` matches
            // `Zotero.Item.getItemTypeIconName(true)` for note items.
            // Tinted with `--accent-yellow` — same theme-aware var
            // Zotero uses for the notes section in the item pane.
            const sep = doc.createElementNS(NS_HTML, "div");
            sep.className = "wv-tabs-menu-filetype-sep";
            ftRow.appendChild(sep);
            ftRow.appendChild(makeOpt(
                "note",
                "Note",
                {
                    iconSrc: "chrome://zotero/skin/16/universal/note.svg",
                    accentColor: "var(--accent-yellow)",
                }));
        };
        renderButtons();
        panel.appendChild(popup);

        // Outside-click closer — anchor and popup stay open;
        // anything else dismisses. Listen on capture so chained
        // handlers can't swallow the event before us.
        const onOutside = (e) => {
            if (popup.contains(e.target)) return;
            if (anchor.contains(e.target)) return;
            popup.remove();
            doc.removeEventListener("mousedown", onOutside, true);
            delete this._wvFileTypeOutsideClose;
        };
        this._wvFileTypeOutsideClose = onOutside;
        doc.addEventListener("mousedown", onOutside, true);
    }

    /** Open or close the settings popup (gear button), hosting
     *  display-only toggles. Mirrors the file-type popup pattern:
     *  HTML <div> mounted inside the tabs-menu panel so clicks
     *  inside don't dismiss the parent. */
    _toggleTabsMenuSettingsPopup(win, panel, anchor) {
        const doc = win.document;
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const existing = panel.querySelector(
            "#wv-tabs-menu-settings-popup");
        if (existing) {
            existing.remove();
            if (this._wvSettingsOutsideClose) {
                doc.removeEventListener("mousedown",
                    this._wvSettingsOutsideClose, true);
                delete this._wvSettingsOutsideClose;
            }
            return;
        }

        const popup = doc.createElementNS(NS_HTML, "div");
        popup.id = "wv-tabs-menu-settings-popup";

        const makeRow = (key, labelText, onChange) => {
            const row = doc.createElementNS(NS_HTML, "label");
            row.className = "wv-tabs-menu-settings-row";
            const cb = doc.createElementNS(NS_HTML, "input");
            cb.type = "checkbox";
            cb.className = "wv-tabs-menu-settings-cb";
            cb.checked = !!this[key];
            cb.addEventListener("change", () => {
                this[key] = cb.checked;
                if (typeof onChange === "function") onChange();
            });
            const lbl = doc.createElementNS(NS_HTML, "span");
            lbl.className = "wv-tabs-menu-settings-label";
            lbl.textContent = labelText;
            row.appendChild(cb);
            row.appendChild(lbl);
            return row;
        };

        // Re-run upstream `refreshList` so our wrapper rebuilds the
        // panel from a clean state — that picks up the new toggle
        // values without us having to reach into individual rows.
        const refresh = () => {
            try { panel.refreshList(); }
            catch (e) {
                Zotero.debug("[Weavero] settings refresh err: " + e);
            }
        };

        popup.appendChild(makeRow(
            "_tabsMenuGroupByLibrary",
            "Sort by Library",
            refresh));
        popup.appendChild(makeRow(
            "_tabsMenuShowAnnotationCount",
            "Show Annotations Count",
            refresh));

        panel.appendChild(popup);

        const onOutside = (e) => {
            if (popup.contains(e.target)) return;
            if (anchor.contains(e.target)) return;
            popup.remove();
            doc.removeEventListener("mousedown", onOutside, true);
            delete this._wvSettingsOutsideClose;
        };
        this._wvSettingsOutsideClose = onOutside;
        doc.addEventListener("mousedown", onOutside, true);
    }

    _refreshFileTypeFilterButtonState(panel) {
        if (!panel) return;
        const btn = panel.querySelector("#wv-tabs-menu-filetype-btn");
        if (!btn) return;
        const f = this._tabsMenuFileTypeFilter;
        const active = !!(f
            && (f.include.size > 0 || f.exclude.size > 0));
        btn.classList.toggle("wv-active", active);
    }

    /** Predicate: does the tab pass the current file-type filter?
     *  Always returns true when no filter is set, or when the tab
     *  is the meta "Library" tab (`zotero-pane` has no item). For
     *  other tabs, looks up the item's `getItemTypeIconName(true)`
     *  (camelCase, link-mode-stripped) and compares against the
     *  include / exclude sets. */
    _tabPassesFileTypeFilter(win, tabId) {
        const f = this._tabsMenuFileTypeFilter;
        if (!f || (!f.include.size && !f.exclude.size)) return true;
        if (!tabId || tabId === "zotero-pane") return true;
        const Zotero_Tabs = win && win.Zotero_Tabs;
        if (!Zotero_Tabs) return true;
        const tab = Zotero_Tabs._tabs.find(t => t.id === tabId);
        if (!tab) return true;
        let kind = null;
        try {
            const item = Zotero.Items.get(tab.data && tab.data.itemID);
            if (item && typeof item.getItemTypeIconName === "function") {
                // zotero-types declares `getItemTypeIconName()` with 0 args
                // but Zotero 7+ accepts a `noLinkMode` boolean (camelCase
                // form, used to skip the LinkMode lookup for attachments).
                kind = (item as any).getItemTypeIconName(true);
            }
        }
        catch (e) {}
        if (!kind) return false;
        if (f.exclude.has(kind)) return false;
        if (f.include.size && !f.include.has(kind)) return false;
        return true;
    }

    /** Append an annotation-count badge to a tabs-menu row, using
     *  the same `annotation-12.svg + count` layout the item-pane
     *  attachment row uses (`elements/attachmentRow.js` +
     *  `scss/elements/_attachmentRow.scss`): a 12×12 universal icon
     *  themed via `-moz-context-properties: fill` and a label, both
     *  coloured with `--fill-secondary`. Only renders a non-zero
     *  count — same hide-when-zero rule as the item pane. */
    /** Append / clear a pin glyph at the END of a tabs-menu row based on
     *  the current pinned-tabs pref. Idempotent: always strips the prior
     *  glyph first so the row matches the latest state. */
    _decoratePinIconOnTabsMenuRow(row) {
        try {
            // Strip any prior icon so toggling pin state doesn't stack.
            const prior = row.querySelector(".wv-tabs-menu-pin-icon");
            if (prior) prior.remove();

            const tabId = row.dataset && row.dataset.tabId;
            if (!tabId || tabId === "zotero-pane") return;
            const win = row.ownerGlobal;
            const doc = row.ownerDocument;
            const Z_Tabs: any = win && (win as any).Zotero_Tabs;
            if (!Z_Tabs || !Array.isArray(Z_Tabs._tabs)) return;
            const tab = Z_Tabs._tabs.find((t: any) => t && t.id === tabId);
            if (!tab) return;
            const key = this._tabPinKey(tab);
            if (!key) return;
            if (!this._pinnedTabsHas(key.libraryID, key.itemKey)) return;

            // Inline SVG pushpin — themed via currentColor so it adapts
            // to light / dark mode. Built via createElementNS (SVG namespace)
            // because innerHTML on an HTML span doesn't reliably create
            // SVG-namespaced children in Gecko's chrome context.
            const HTML_NS = "http://www.w3.org/1999/xhtml";
            const SVG_NS = "http://www.w3.org/2000/svg";
            const span = doc.createElementNS(HTML_NS, "span");
            span.className = "wv-tabs-menu-pin-icon";
            const svg = doc.createElementNS(SVG_NS, "svg");
            svg.setAttribute("viewBox", "0 0 16 16");
            svg.setAttribute("width", "12");
            svg.setAttribute("height", "12");
            svg.setAttribute("fill", "currentColor");
            const path = doc.createElementNS(SVG_NS, "path");
            path.setAttribute("d", "M9.5 0v4l2 2v2H8.7L8 14.5 7.3 8H4.5V6l2-2V0h3z");
            svg.appendChild(path);
            span.appendChild(svg);
            // Insert just BEFORE the row's close (×) button so the close
            // stays at the row's right edge on hover — Firefox-style:
            // [icon] [title] ........ [pin] [×]. If the row has no close
            // (e.g. the meta library row), fall back to appending.
            const closeBtn = row.querySelector(".zotero-tabs-menu-entry.close");
            if (closeBtn) row.insertBefore(span, closeBtn);
            else row.appendChild(span);
        } catch (e) { Zotero.debug("[Weavero] _decoratePinIconOnTabsMenuRow err: " + e); }
    }

    _addAnnotationCountToRow(row) {
        try {
            // Strip any prior badge so toggling the setting doesn't
            // stack badges on the same row.
            const prior = row.querySelector(".wv-tabs-menu-anncount");
            if (prior) prior.remove();

            const tabId = row.dataset.tabId;
            if (!tabId || tabId === "zotero-pane") return;
            const win = row.ownerGlobal;
            const doc = row.ownerDocument;
            const Zotero_Tabs = win && win.Zotero_Tabs;
            const tabData = Zotero_Tabs && Zotero_Tabs._tabs.find(
                t => t.id === tabId);
            if (!tabData) return;
            const item = Zotero.Items.get(
                tabData.data && tabData.data.itemID);
            if (!item || typeof item.getAnnotations !== "function") return;
            const annots = item.getAnnotations() || [];
            const n = annots.length;
            if (!n) return;

            const NS_HTML = "http://www.w3.org/1999/xhtml";
            const badge = doc.createElementNS(NS_HTML, "span");
            badge.className = "wv-tabs-menu-anncount";
            badge.title = n + " annotation" + (n === 1 ? "" : "s");
            // Icon: same `annotation-12.svg` the item-pane uses,
            // tinted via context-fill / currentColor.
            const ic = doc.createElementNS(NS_HTML, "span");
            ic.className = "wv-tabs-menu-anncount-icon";
            badge.appendChild(ic);
            const lbl = doc.createElementNS(NS_HTML, "span");
            lbl.className = "wv-tabs-menu-anncount-label";
            lbl.textContent = String(n);
            badge.appendChild(lbl);

            // Insert just before the row's close button so it sits
            // at the right end of the row, not interrupting the title.
            const closeBtn = row.querySelector(
                ".zotero-tabs-menu-entry.close");
            if (closeBtn) row.insertBefore(badge, closeBtn);
            else row.appendChild(badge);
        }
        catch (e) {
            // Annotation lookup can fail mid-import / mid-delete;
            // swallow and skip the badge.
        }
    }
}

const _tabsDescriptors = Object.getOwnPropertyDescriptors(_TabsMixin.prototype);
delete (_tabsDescriptors as any).constructor;
export const tabsMethods = _tabsDescriptors;
