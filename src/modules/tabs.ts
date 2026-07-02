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

// Single source of truth for the anchor-window marker (solid Material anchor,
// 24-unit grid). Used BOTH as an inline <svg> in the List-all-tabs Window header
// and as a CSS mask on the anchor window's library tab — edit here only.
const WV_ANCHOR_VIEWBOX = "0 0 24 24";
const WV_ANCHOR_PATH = "M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z";

// Group-library badge glyph — a symmetric, bold 3-column temple centred on x8.
// Zotero's stock library-group icon has 1px columns that blur when scaled down to
// badge size, so we draw a chunkier version that stays sharp. #59ADC4 is the same
// teal Zotero uses for group libraries throughout the UI. Shared by the
// List-all-tabs dropdown badge (`_wvGroupLibBadgeSvg`) AND the tab-strip overlay
// (`_decorateTabBar`), so the two stay identical — edit here only.
const WV_GROUPLIB_BADGE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='#59adc4'>"
    + "<path d='M8 1.5L13.5 6.5H2.5Z'/>"
    + "<rect x='3.5' y='7' width='2' height='6'/>"
    + "<rect x='7' y='7' width='2' height='6'/>"
    + "<rect x='10.5' y='7' width='2' height='6'/>"
    + "<rect x='2' y='13' width='12' height='2'/></svg>";

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
                if (lp && lp._wvTabSessionCurrentHeader) lp._wvTabSessionCurrentHeader(panel);
                if (lp && lp._wvTabsMenuWrapCurrentWindow) lp._wvTabsMenuWrapCurrentWindow(panel);
                if (lp && lp._wvTabsMenuOtherWindows) lp._wvTabsMenuOtherWindows(panel);
                if (lp && lp._wvTabsMenuGroupsSection) lp._wvTabsMenuGroupsSection(panel);
                if (lp && lp._wvTabsMenuWrapCurrentSession) lp._wvTabsMenuWrapCurrentSession(panel);
                if (lp && lp._wvTabSessionsMenuSection) lp._wvTabSessionsMenuSection(panel);
                // Filter EVERY window's rows now that all sections exist (the
                // per-branch filter only saw the current window's native rows).
                if (lp && lp._wvApplyTabsMenuRowFilters) lp._wvApplyTabsMenuRowFilters(panel);
                if (lp && lp._wvWireTabsMenuRowDnD) lp._wvWireTabsMenuRowDnD(panel);
                if (lp && lp._wvEnsureTabsMenuTooltip) lp._wvEnsureTabsMenuTooltip(panel);
                // Defer the height-fit until after the popup is positioned.
                const w = panel.ownerGlobal;
                if (w) w.setTimeout(() => { try { const l2 = Zotero.Weavero && Zotero.Weavero.plugin; if (l2 && l2._wvTabsMenuFitListHeight) l2._wvTabsMenuFitListHeight(panel); } catch (e) {} }, 0);
            } catch (e) {}
        };
        // Once the panel is positioned on screen, cap the list to the space that
        // actually remains below it so a long list scrolls instead of running off
        // the bottom of the screen (the static CSS cap can't know the anchor).
        if (!panel._wvOverflowWired) {
            panel._wvOverflowWired = true;
            panel.addEventListener("popupshown", () => {
                try {
                    const lp = Zotero.Weavero && Zotero.Weavero.plugin;
                    if (lp && lp._wvTabsMenuFitListHeight) lp._wvTabsMenuFitListHeight(panel);
                } catch (e) {}
            });
        }
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
                // Group-library badge on the item icon — only meaningful when the
                // library headers are gone (Sort-by-Library off); self-clears otherwise.
                this._wvDecorateGroupLibBadge(row, win);
            }
        } catch (e) {}

        // If "Sort by Library" is off, the user wants the upstream
        // flat list. Apply only the file-type filter (per-row) and
        // leave sorting / headers alone. Tab-bar mirror still runs.
        if (this._tabsMenuGroupByLibrary === false) {
            panel.classList.remove("wv-tabs-menu-grouped");
            // Per-row: file-type filter AND the funnel's library filter (each row is
            // stamped with `data-wv-library`), so the user can filter My Library vs
            // group libraries without switching to the library-sorted view.
            const lf = this._tabsMenuLibraryFilter;
            const lfAnyInc = !!(lf && [...lf.values()].includes("include"));
            const libVisible = (libID: any) => {
                if (!lf || lf.size === 0) return true;
                const v = lf.get(libID);
                if (v === "exclude") return false;
                if (lfAnyInc) return v === "include";
                return true;
            };
            // Filter EVERY tab row in the popup — the current window's native rows
            // (have `data-tab-id`) AND the other-window / session rows built by
            // _wvTabsMenuTabRow (have `data-wv-library`/`data-wv-itemtype` but no
            // Zotero_Tabs id). So the filter spans all windows, not just this one.
            const filterRows = [...tabsList.querySelectorAll(".row[data-tab-id], .row[data-wv-library]")] as any[];
            for (const row of filterRows) {
                // Stamp native current-window rows (built by Zotero, not us) so the
                // per-row checks below work uniformly.
                if (!(row.getAttribute && row.getAttribute("data-wv-itemtype"))) {
                    try {
                        const tab = Zotero_Tabs._tabs.find((t: any) => t.id === row.dataset.tabId);
                        const iid = tab && tab.data && tab.data.itemID;
                        const it: any = iid && Zotero.Items.get(iid);
                        if (it) {
                            if (it.libraryID != null && !row.getAttribute("data-wv-library")) row.setAttribute("data-wv-library", String(it.libraryID));
                            if (it.getItemTypeIconName) row.setAttribute("data-wv-itemtype", it.getItemTypeIconName(true));
                        }
                    } catch (e) {}
                }
                const passesFt = this._rowPassesFileTypeFilter(row.getAttribute("data-wv-itemtype"));
                const libRaw = row.getAttribute && row.getAttribute("data-wv-library");
                const passesLib = (libRaw == null) ? true : libVisible(Number(libRaw));
                if (passesFt && passesLib) row.classList.remove("wv-tabs-menu-row-hidden");
                else row.classList.add("wv-tabs-menu-row-hidden");
            }
            // Tab-bar mirror keeps file-type only (a library filter on the popup
            // list shouldn't hide tabs from the live bar).
            this._applyTabBarFilter(win, () => null, () => true);
            try { this._refreshFileTypeFilterButtonState(panel); }
            catch (e) {}
            const ft = this._tabsMenuFileTypeFilter;
            const anyActive = !!(ft && (ft.include.size > 0 || ft.exclude.size > 0))
                || !!(lf && lf.size > 0);
            const menuBtn = doc.getElementById("zotero-tb-tabs-menu");
            if (menuBtn) {
                menuBtn.classList.toggle("wv-tabs-menu-filter-active", anyActive);
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
            if (lp && lp._wvTabSessionCurrentHeader) lp._wvTabSessionCurrentHeader(panel);
            if (lp && lp._wvTabsMenuWrapCurrentWindow) lp._wvTabsMenuWrapCurrentWindow(panel);
            if (lp && lp._wvTabsMenuOtherWindows) lp._wvTabsMenuOtherWindows(panel);
            if (lp && lp._wvTabsMenuGroupsSection) lp._wvTabsMenuGroupsSection(panel);
            if (lp && lp._wvTabsMenuWrapCurrentSession) lp._wvTabsMenuWrapCurrentSession(panel);
            if (lp && lp._wvTabSessionsMenuSection) lp._wvTabSessionsMenuSection(panel);
            if (lp && lp._wvApplyTabsMenuRowFilters) lp._wvApplyTabsMenuRowFilters(panel);
            if (lp && lp._wvWireTabsMenuRowDnD) lp._wvWireTabsMenuRowDnD(panel);
                if (lp && lp._wvEnsureTabsMenuTooltip) lp._wvEnsureTabsMenuTooltip(panel);
            const w = panel.ownerGlobal;
            if (w) w.setTimeout(() => { try { const l2 = Zotero.Weavero && Zotero.Weavero.plugin; if (l2 && l2._wvTabsMenuFitListHeight) l2._wvTabsMenuFitListHeight(panel); } catch (e) {} }, 0);
        } catch (e) {}
    }

    /** Apply the funnel's file-type + library filters to EVERY tab row in the
     *  popup — current window, other windows, sessions — and hide any window
     *  scope that ends up fully filtered out. Must run AFTER all sections are
     *  built: the per-branch filter in _groupTabsMenuByLibrary only sees the
     *  current window's native rows, because the other-window / session rows
     *  are appended later by _wvTabsMenuOtherWindows / the session sections.
     *  Without this pass the filter would silently skip every other window. */
    _wvApplyTabsMenuRowFilters(panel: any) {
        try {
            // Main panel → #zotero-tabs-menu-list; reader-window clone → #wv-wtl-list.
            const tabsList = panel._tabsList
                || panel.querySelector("#zotero-tabs-menu-list")
                || panel.querySelector("#wv-wtl-list");
            if (!tabsList) return;
            const lf = this._tabsMenuLibraryFilter;
            const lfAnyInc = !!(lf && [...lf.values()].includes("include"));
            const libVisible = (libID: any) => {
                if (!lf || lf.size === 0) return true;
                const v = lf.get(libID);
                if (v === "exclude") return false;
                if (lfAnyInc) return v === "include";
                return true;
            };
            // Native current-window rows have `data-tab-id`; the other-window /
            // session rows built by _wvTabsMenuTabRow carry `data-wv-library` +
            // `data-wv-itemtype` but no current-window tab id.
            const rows = [...tabsList.querySelectorAll(".row[data-tab-id], .row[data-wv-library]")] as any[];
            for (const row of rows) {
                // Stamp native current-window rows so the per-row checks work
                // uniformly (other-window rows are already stamped at build time).
                if (!(row.getAttribute && row.getAttribute("data-wv-itemtype"))) {
                    try {
                        const tab = Zotero_Tabs._tabs.find((t: any) => t.id === row.dataset.tabId);
                        const iid = tab && tab.data && tab.data.itemID;
                        const it: any = iid && Zotero.Items.get(iid);
                        if (it) {
                            if (it.libraryID != null && !row.getAttribute("data-wv-library")) row.setAttribute("data-wv-library", String(it.libraryID));
                            if (it.getItemTypeIconName) row.setAttribute("data-wv-itemtype", it.getItemTypeIconName(true));
                        }
                    } catch (e) {}
                }
                const passesFt = this._rowPassesFileTypeFilter(row.getAttribute("data-wv-itemtype"));
                const libRaw = row.getAttribute && row.getAttribute("data-wv-library");
                const passesLib = (libRaw == null) ? true : libVisible(Number(libRaw));
                if (passesFt && passesLib) row.classList.remove("wv-tabs-menu-row-hidden");
                else row.classList.add("wv-tabs-menu-row-hidden");
            }
            // NB: window scopes and the Tab Groups section are deliberately left
            // visible even when all their rows are filtered out — the headers let
            // the user see the full window/group structure and toggle the filter
            // back off without exiting the panel (same rule as the per-row hide).
        } catch (e) { Zotero.debug("[Weavero] _wvApplyTabsMenuRowFilters err: " + e); }
    }

    // ---- Popup row drag-and-drop (move a tab to a group / another window) ----
    // Dragging a row in the "List all Tabs" popup onto a window scope moves that
    // tab to the window; onto a group (a grouped tab row or the bottom Tab Groups
    // row) joins the tab to the group. The actual move reuses the menu-based
    // universal mover `_wvMoveTabToTarget`, so every source/target combo (main↔
    // main, main↔reader, reader↔reader, +group) is handled in one place.

    /** Live tab object for (win, tabId) — main window via Zotero_Tabs, reader
     *  window via its `_wvWT.tabs`. */
    _wvTabObjInWin(win: any, tabId: any, isReader: boolean) {
        try {
            if (!win || tabId == null) return null;
            if (isReader) return (((win as any)._wvWT && (win as any)._wvWT.tabs) || []).find((t: any) => t.id === tabId) || null;
            const Z = (win as any).Zotero_Tabs;
            return (Z && Z._tabs) ? (Z._tabs.find((t: any) => t.id === tabId) || null) : null;
        } catch (e) { return null; }
    }

    /** Resolve what a popup drop at `el` means: a group join, or a loose move to a
     *  window. Returns `{ container, target }` (container = element to highlight,
     *  target = the `_wvMoveTabToTarget` descriptor) or null when not droppable. */
    _wvResolvePopupDropTarget(panel: any, el: any, _drag: any) {
        try {
            if (!el || !el.closest) return null;
            const panelWin = panel.ownerGlobal;
            // 1) Bottom "Tab Groups" saved-group row → join that group.
            const grpRow = el.closest(".wv-tgmenu-row");
            if (grpRow && (grpRow as any)._wvGroupId) {
                return { container: grpRow, target: { groupId: (grpRow as any)._wvGroupId } };
            }
            // 2) A tab row → its window; if the row's tab is itself grouped, joining
            //    that group reads more naturally than a loose move next to it.
            const tabRow = el.closest(".row");
            if (tabRow && tabRow.getAttribute && tabRow.getAttribute("draggable") === "true") {
                const win = (tabRow as any)._wvSrcWin || panelWin;
                const isReader = !!(tabRow as any)._wvSrcIsReader;
                const tid = (tabRow as any)._wvSrcTabId || (tabRow.dataset && tabRow.dataset.tabId);
                let gid: any = null;
                try { const t = this._wvTabObjInWin(win, tid, isReader); if (t) gid = (this as any)._wvTabGroupStamp(t); } catch (e) {}
                return gid
                    ? { container: tabRow, target: { win, isReader, groupId: gid } }
                    : { container: tabRow, target: { win, isReader } };
            }
            // 3) A window scope (header / library row / empty area) → move to it.
            const scope = el.closest(".wv-winscope");
            if (scope) {
                const win = (scope as any)._wvWin || panelWin;
                const isReader = !!(scope as any)._wvIsReader;
                return { container: scope, target: { win, isReader } };
            }
            return null;
        } catch (e) { return null; }
    }

    /** Compute the precise drop insertion within a window scope for cursor Y.
     *  Returns `{ beforeRow, anchorTabId }` — `anchorTabId` is the target window's
     *  tab to insert AFTER (null = at the very front). `opts.excludeTabId` skips
     *  the dragged tab's own row; `opts.excludeGroupId` skips the dragged group's
     *  own member rows (can't position relative to itself). */
    _wvPopupDropPosition(scope: any, clientY: number, opts?: any) {
        try {
            const win = (scope as any)._wvWin;
            const isReader = !!(scope as any)._wvIsReader;
            const exclTab = opts && opts.excludeTabId;
            const exclGrp = opts && opts.excludeGroupId;
            const tidOf = (r: any) => (r as any)._wvSrcTabId || (r.dataset && r.dataset.tabId);
            const rows = ([...scope.querySelectorAll(".row")] as any[]).filter((r: any) => {
                if (r.classList.contains("wv-tabsmenu-ghost")) return false;
                if (r.classList.contains("wv-tabs-menu-row-hidden")) return false;
                const tid = tidOf(r);
                if (!tid || tid === "zotero-pane") return false;
                if (exclTab != null && tid === exclTab) return false;
                if (exclGrp && win) {
                    try { const t = this._wvTabObjInWin(win, tid, isReader); if (t && (this as any)._wvTabGroupStamp(t) === exclGrp) return false; } catch (e) {}
                }
                return true;
            });
            let beforeRow: any = null;
            for (const r of rows) {
                const rect = r.getBoundingClientRect();
                if (rect.height && clientY < rect.top + rect.height / 2) { beforeRow = r; break; }
            }
            let anchorTabId: any = null;
            if (beforeRow) {
                const idx = rows.indexOf(beforeRow);
                anchorTabId = idx > 0 ? tidOf(rows[idx - 1]) : null;
            } else {
                anchorTabId = rows.length ? tidOf(rows[rows.length - 1]) : null;
            }
            return { beforeRow, anchorTabId };
        } catch (e) { return { beforeRow: null, anchorTabId: null }; }
    }

    /** A tab-bar X coordinate (in `win`'s viewport) that lands a drop right AFTER
     *  `anchorTabId` — fed to the clientX-based group movers. null anchor → a
     *  coordinate before the first tab (front). Returns null if it can't resolve
     *  (caller then appends). */
    _wvBarClientXForAnchor(win: any, anchorTabId: any, isReader: boolean): number | null {
        try {
            const doc = win && win.document;
            if (!doc) return null;
            const sel = isReader ? ".wv-window-tabstrip .wv-window-tab[data-wv-tab-id]" : "#tab-bar-container .tab[data-id]";
            if (anchorTabId == null) {
                const first = doc.querySelector(sel);
                if (first) { const r = first.getBoundingClientRect(); return r.left - 6; }
                return null;
            }
            const one = isReader
                ? doc.querySelector('.wv-window-tabstrip .wv-window-tab[data-wv-tab-id="' + anchorTabId + '"]')
                : doc.querySelector('#tab-bar-container .tab[data-id="' + anchorTabId + '"]');
            if (one) { const r = one.getBoundingClientRect(); return r.left + r.width * 0.75; }   // past midpoint → after anchor
            return null;
        } catch (e) { return null; }
    }

    /** Wire row drag-and-drop on the tabs-menu list once (event-delegated, so it
     *  survives the list being rebuilt each refresh). */
    _wvWireTabsMenuRowDnD(panel: any) {
        try {
            if (!panel || panel._wvRowDnDWired) return;
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list");
            if (!list) return;
            panel._wvRowDnDWired = true;
            const self = this;
            const doc = list.ownerDocument;
            const panelWin = panel.ownerGlobal;
            const livePlugin = () => ((Zotero as any).Weavero && (Zotero as any).Weavero.plugin) || self;
            const clearHighlight = () => {
                try { for (const e of list.querySelectorAll(".wv-tabsmenu-drop-into")) e.classList.remove("wv-tabsmenu-drop-into"); } catch (er) {}
                try { for (const g of list.querySelectorAll(".wv-tabsmenu-ghost")) g.remove(); } catch (er) {}
            };
            // A preview of what's being dragged, appended at the END of the target
            // window's scope (where the move lands). For a tab: its icon + title.
            // For a group: its colour chip + name. Clearer than outlining an
            // unrelated existing row.
            const showGhostAt = (scope: any, beforeRow: any, info: any) => {
                try {
                    let ghost: any = list.querySelector(".wv-tabsmenu-ghost");
                    if (!ghost) {
                        if (info.isGroup) {
                            // Mirror the inline group header so the preview chip/name
                            // line up with the tab icons (a bare .row chip sat too far
                            // left). The header's padding is tuned to the icon offset.
                            ghost = doc.createElement("div");
                            ghost.className = "wv-tgrow-header wv-tabsmenu-ghost";
                            const chip = doc.createElement("span");
                            chip.className = "wv-tgrow-chip";
                            if (info.color) chip.style.background = info.color;
                            ghost.appendChild(chip);
                            const name = doc.createElement("span");
                            name.textContent = info.title || "";
                            ghost.appendChild(name);
                        } else {
                            ghost = doc.createElement("div");
                            ghost.className = "row wv-tabsmenu-ghost";
                            const title = doc.createElement("div");
                            title.className = "zotero-tabs-menu-entry title";
                            title.setAttribute("flex", "1");
                            const icon = doc.createElement("span");
                            icon.className = "icon icon-css tab-icon icon-item-type";
                            if (info.itemType) icon.setAttribute("data-item-type", info.itemType);
                            title.appendChild(icon);
                            const label = doc.createElement("label");
                            label.textContent = info.title || "";
                            title.appendChild(label);
                            ghost.appendChild(title);
                        }
                    }
                    // Insert at the precise drop slot (before `beforeRow`), else end.
                    if (beforeRow && beforeRow.parentNode) {
                        if (ghost.nextSibling !== beforeRow || ghost.parentNode !== beforeRow.parentNode) beforeRow.parentNode.insertBefore(ghost, beforeRow);
                    } else if (ghost.parentNode !== scope || ghost.nextSibling) {
                        scope.appendChild(ghost);
                    }
                } catch (er) {}
            };
            const clearDragging = () => {
                try { for (const r of list.querySelectorAll(".wv-tabsmenu-row-dragging")) r.classList.remove("wv-tabsmenu-row-dragging"); } catch (er) {}
            };

            list.addEventListener("dragstart", (e: any) => {
                try {
                    // Group source first — the bottom "Tab Groups" row or an inline
                    // group header. Dragging it moves the WHOLE group to a window.
                    const grpSrc = e.target && e.target.closest && e.target.closest(".wv-tgmenu-row[draggable='true'], .wv-tgrow-header[draggable='true']");
                    if (grpSrc && (grpSrc as any)._wvGroupId) {
                        const lp = livePlugin();
                        const gid = (grpSrc as any)._wvGroupId;
                        let name = "", color = "", homeWin = null;
                        try {
                            const g = lp._tabGroupsGet().find((x: any) => x.id === gid);
                            if (g) { name = g.name || ""; color = lp._tabGroupColorHex(g.color); }
                            homeWin = lp._wvTabGroupHomeWin(gid);
                        } catch (er) {}
                        lp._wvPopupGroupDrag = { groupId: gid, name, color, homeWin };
                        try { e.dataTransfer.setData("application/x-weavero-popup-group-move", "1"); e.dataTransfer.effectAllowed = "move"; } catch (er) {}
                        grpSrc.classList.add("wv-tabsmenu-row-dragging");
                        return;
                    }
                    const row = e.target && e.target.closest && e.target.closest(".row[draggable='true']");
                    if (!row) return;
                    // Weavero rows carry _wvSrcWin; native current-window rows carry
                    // only data-tab-id (their source is the panel's own window).
                    let srcWin = (row as any)._wvSrcWin, tabId = (row as any)._wvSrcTabId, isReader = !!(row as any)._wvSrcIsReader;
                    if (!srcWin) {
                        const tid = row.dataset && row.dataset.tabId;
                        if (!tid || tid === "zotero-pane") return;
                        srcWin = panelWin; tabId = tid; isReader = false;
                    }
                    if (!srcWin || tabId == null) return;
                    // Capture the moving tab's title + icon for the drag preview ghost.
                    let title = "", itemType = "";
                    try {
                        const t = self._wvTabObjInWin(srcWin, tabId, isReader);
                        if (t) {
                            title = t.title || "";
                            const iid = isReader ? t.itemID : (t.data && t.data.itemID);
                            const it: any = iid && Zotero.Items.get(iid);
                            if (it && it.getItemTypeIconName) itemType = it.getItemTypeIconName(true);
                        }
                    } catch (er) {}
                    if (!title) { try { const lbl = row.querySelector("label"); if (lbl) title = lbl.textContent || ""; } catch (er) {} }
                    if (!itemType) { try { const ic = row.querySelector(".icon-item-type"); if (ic) itemType = ic.getAttribute("data-item-type") || ""; } catch (er) {} }
                    livePlugin()._wvPopupRowDrag = { srcWin, tabId, isReader, title, itemType };
                    try { e.dataTransfer.setData("application/x-weavero-popup-tab-move", "1"); e.dataTransfer.effectAllowed = "move"; } catch (er) {}
                    row.classList.add("wv-tabsmenu-row-dragging");
                } catch (er) {}
            }, true);

            // Take over ONLY for cross-window moves and group joins. A same-window
            // plain reorder is left to Zotero's native row drag (Zotero_Tabs.move),
            // which the native popup already wires per row.
            const shouldIntercept = (res: any, drag: any) =>
                !!(res && res.target && (res.target.groupId || res.target.win !== drag.srcWin));

            list.addEventListener("dragover", (e: any) => {
                try {
                    // Group drag → drop onto ANY window's scope to move/reorder the
                    // group there, at the precise slot under the cursor.
                    const gdrag = livePlugin()._wvPopupGroupDrag;
                    if (gdrag) {
                        clearHighlight();
                        const scope = e.target && e.target.closest && e.target.closest(".wv-winscope");
                        if (scope && (scope as any)._wvWin) {
                            e.preventDefault();
                            try { e.dataTransfer.dropEffect = "move"; } catch (er) {}
                            const pos = self._wvPopupDropPosition(scope, e.clientY, { excludeGroupId: gdrag.groupId });
                            showGhostAt(scope, pos.beforeRow, { isGroup: true, color: gdrag.color, title: gdrag.name });
                            scope.classList.add("wv-tabsmenu-drop-into");
                        }
                        return;
                    }
                    const drag = livePlugin()._wvPopupRowDrag;
                    if (!drag) return;
                    const res = self._wvResolvePopupDropTarget(panel, e.target, drag);
                    clearHighlight();
                    if (!shouldIntercept(res, drag) || !res.container) return;
                    e.preventDefault();
                    try { e.dataTransfer.dropEffect = "move"; } catch (er) {}
                    if (res.target.win) {
                        // Cross-window move: preview the moving tab at the precise
                        // slot under the cursor (main targets); reader targets append.
                        const scope = (res.container.closest && res.container.closest(".wv-winscope")) || res.container;
                        const beforeRow = self._wvPopupDropPosition(scope, e.clientY, { excludeTabId: drag.tabId }).beforeRow;
                        showGhostAt(scope, beforeRow, { itemType: drag.itemType, title: drag.title });
                        scope.classList.add("wv-tabsmenu-drop-into");
                    } else {
                        // Pure group join (a Tab Groups row, including a closed group)
                        // — highlight the group it will join.
                        res.container.classList.add("wv-tabsmenu-drop-into");
                    }
                } catch (er) {}
            }, true);

            list.addEventListener("drop", (e: any) => {
                try {
                    const lp = livePlugin();
                    // Group drag → move/reorder the whole group at the dropped slot.
                    const gdrag = lp._wvPopupGroupDrag;
                    if (gdrag) {
                        clearHighlight(); clearDragging();
                        lp._wvPopupGroupDrag = null;
                        const scope = e.target && e.target.closest && e.target.closest(".wv-winscope");
                        if (!scope || !(scope as any)._wvWin) return;
                        e.preventDefault(); e.stopPropagation();
                        const tgtWin = (scope as any)._wvWin;
                        const isReaderTgt = !!(scope as any)._wvIsReader;
                        const pos = self._wvPopupDropPosition(scope, e.clientY, { excludeGroupId: gdrag.groupId });
                        const clientX = self._wvBarClientXForAnchor(tgtWin, pos.anchorTabId, isReaderTgt);
                        Promise.resolve(lp._wvMoveGroupToWindowAt(gdrag.groupId, tgtWin, isReaderTgt, clientX)).then(() => {
                            try { if (typeof panel.refreshList === "function") panel.refreshList(); else lp._wvRegroupTabsMenu(panel); } catch (er) {}
                        }).catch(() => {});
                        return;
                    }
                    const drag = lp._wvPopupRowDrag;
                    clearHighlight(); clearDragging();
                    if (!drag) return;
                    const res = self._wvResolvePopupDropTarget(panel, e.target, drag);
                    if (!shouldIntercept(res, drag)) return;   // native handles same-window reorder
                    e.preventDefault(); e.stopPropagation();
                    lp._wvPopupRowDrag = null;
                    const target: any = res.target;
                    // Precise insertion index for a loose move to another window
                    // (a group join lands after the group, so skip those).
                    if (target.win && !target.groupId) {
                        try {
                            const scope = e.target && e.target.closest && e.target.closest(".wv-winscope");
                            if (scope) {
                                const pos = self._wvPopupDropPosition(scope, e.clientY, { excludeTabId: drag.tabId });
                                if (target.isReader) {
                                    const st: any = target.win._wvWT;
                                    if (st && st.tabs) {
                                        if (pos.anchorTabId == null) target.index = 0;
                                        else { const ai = st.tabs.findIndex((t: any) => String(t.id) === String(pos.anchorTabId)); if (ai >= 0) target.index = ai + 1; }
                                    }
                                } else {
                                    const Z: any = target.win.Zotero_Tabs;
                                    if (Z && Z._tabs) {
                                        if (pos.anchorTabId == null) target.index = 1;   // front (after library)
                                        else { const ai = Z._tabs.findIndex((t: any) => t && t.id === pos.anchorTabId); if (ai >= 0) target.index = ai + 1; }
                                    }
                                }
                            }
                        } catch (er) {}
                    }
                    Promise.resolve(lp._wvMoveTabToTarget(drag.srcWin, drag.tabId, target)).then(() => {
                        // A loose drop can land between a group's members and split
                        // its run — re-cluster so the group stays contiguous.
                        try { if (target.win && !target.groupId && !target.isReader && lp._wvTabGroupStabilize) lp._wvTabGroupStabilize(target.win); } catch (er) {}
                        try { if (typeof panel.refreshList === "function") panel.refreshList(); else lp._wvRegroupTabsMenu(panel); } catch (er) {}
                    }).catch(() => {});
                } catch (er) {}
            }, true);

            list.addEventListener("dragend", () => {
                try { const lp = livePlugin(); lp._wvPopupRowDrag = null; lp._wvPopupGroupDrag = null; clearHighlight(); clearDragging(); } catch (er) {}
            }, true);
            list.addEventListener("dragleave", (e: any) => {
                try { if (!list.contains(e.relatedTarget)) clearHighlight(); } catch (er) {}
            }, true);
        } catch (e) { Zotero.debug("[Weavero] _wvWireTabsMenuRowDnD err: " + e); }
    }

    // ---- All-windows tab list ----------------------------------------------
    // The native "List all tabs" panel shows ONLY the current window's tabs.
    // Below them we append a section per OTHER window (other main windows + all
    // reader windows), so every window's tabs are visible, current window on top.
    // Clicking a row focuses that window and selects the tab.

    /** Display title for a tab's item — parent paper title reads better than an
     *  attachment's "Full Text PDF" name. */
    _wvTabsMenuItemTitle(item: any) {
        try {
            if (item.parentItem && item.parentItem.getDisplayTitle) return item.parentItem.getDisplayTitle();
            if (item.getDisplayTitle) return item.getDisplayTitle();
        } catch (e) {}
        return "";
    }

    /** Build the list of OTHER windows and their tab rows. */
    _wvTabsMenuOtherWindowSections(curWin: any) {
        const sections: any[] = [];
        try {
            const liveStamp = (it: any, title: any) => ({
                item: it, title: (title || this._wvTabsMenuItemTitle(it)) || "",
            });
            // Other main windows (current window stays at the top, native).
            for (const w of Zotero.getMainWindows()) {
                if (w === curWin) continue;
                const Z: any = (w as any).Zotero_Tabs;
                if (!Z || !Array.isArray(Z._tabs)) continue;
                const tabs: any[] = [];
                for (const t of Z._tabs) {
                    if (!t || t.id === "zotero-pane" || t.type === "library") continue;
                    const base = t.type.replace(/-(unloaded|reloaded|loading)$/, "");
                    if (base !== "reader" && base !== "note") continue;
                    const item = t.data && Zotero.Items.get(t.data.itemID);
                    if (!item) continue;
                    const tabId = t.id, tw = w, tZ = Z;
                    const r = liveStamp(item, t.title) as any;
                    // Drag-source identity (popup row → move/group). Window objects
                    // can't be data attrs, so they ride on the section/row object.
                    r.win = w; r.tabId = t.id; r.itemID = t.data && t.data.itemID; r.isReader = false;
                    r.onClick = () => { try { tw.focus(); tZ.select(tabId); } catch (e) {} };
                    tabs.push(r);
                }
                // The window's Library (home) tab — shown first, like the current
                // window's native list (was previously skipped for other windows).
                let libraryTab: any = null;
                try {
                    const lt = Z._tabs.find((t: any) => t && (t.id === "zotero-pane" || t.type === "library"));
                    if (lt) {
                        const tw = w, tZ = Z;
                        libraryTab = {
                            title: lt.title || "My Library",
                            iconFullClass: ((this._wvAnchorLibIconClass(w) || "icon icon-css icon-library") + " tab-icon").replace(/\s+/g, " ").trim(),
                            onClick: () => { try { tw.focus(); tZ.select("zotero-pane"); } catch (e) {} },
                        };
                    }
                } catch (e) {}
                // Show the anchor mark only when it's ALSO shown in the window's
                // Library tab — i.e. only with >1 main window (matches the
                // `.wv-anchor-window` library-tab gate).
                const wIsAnchor = this._wvIsAnchorWindow(w) && Zotero.getMainWindows().length > 1;
                if (tabs.length) sections.push({ label: this._wvWindowName(w), win: w, libraryTab, tabs, kind: "main", iconType: wIsAnchor ? "anchor" : "main", anchorIconClass: wIsAnchor ? this._wvAnchorLibIconClass(w) : "" });
            }
            // Reader windows.
            const en = Services.wm.getEnumerator("zotero:reader");
            let rn = 0;
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                rn++;
                const st = w._wvWT;
                // The window's currently-open tab, so we can highlight it in the
                // list — but only for the window you're viewing from (curWin), the
                // same as the main window, which marks ONLY the current window's tab.
                const activeId = st && st.activeId;
                const tabs: any[] = [];
                if (st && Array.isArray(st.tabs)) {
                    for (const t of st.tabs) {
                        const item = t.itemID != null && Zotero.Items.get(t.itemID);
                        if (!item) continue;
                        const tabId = t.id, rw = w;
                        // Use the reader tab's OWN header title (citation-style, e.g.
                        // "Azam et al. - 2026 - …") so the popup matches the tab header
                        // and the main-window rows — not the parent doc title.
                        const r = liveStamp(item, t.title) as any;
                        r.win = w; r.tabId = t.id; r.itemID = t.itemID; r.isReader = true;
                        r.selected = (w === curWin && t.id === activeId);
                        r.onClick = () => {
                            try {
                                rw.focus();
                                const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                                if (lp && lp._wvWTSwitch) lp._wvWTSwitch(rw, tabId);
                            } catch (e) {}
                        };
                        tabs.push(r);
                    }
                } else {
                    const readers = (Zotero.Reader && Zotero.Reader._readers) || [];
                    for (const rd of readers) {
                        if (!rd || rd._window !== w) continue;
                        const iid = rd.itemID || (rd._item && rd._item.id);
                        const item = iid && Zotero.Items.get(iid);
                        if (!item) continue;
                        const rw = w;
                        const r = liveStamp(item, null) as any;
                        r.onClick = () => { try { rw.focus(); } catch (e) {} };
                        tabs.push(r);
                    }
                }
                if (tabs.length) { const base = rn > 1 ? "Reader window " + rn : "Reader window"; sections.push({ label: this._wvWindowCustomTitle(w) || base, win: w, tabs, kind: "reader" }); }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTabsMenuOtherWindowSections err: " + e); }
        // The window you're viewing from leads the list. For a MAIN window the
        // current window is already pinned to the top natively (its tabs are the
        // panel's own list); it's skipped above, so this is a no-op there. For a
        // READER window there's no native list, so its section would otherwise sit
        // after every main window — pull it to the front.
        try {
            const ci = sections.findIndex((s: any) => s.win && s.win === curWin);
            if (ci > 0) { const [cur] = sections.splice(ci, 1); sections.unshift(cur); }
        } catch (e) {}
        return sections;
    }

    /** Render the other-windows sections into the tabs-menu list. */
    _wvTabsMenuOtherWindows(panel: any) {
        try {
            const doc = panel.ownerDocument;
            const win = doc.defaultView;
            // Main panel → #zotero-tabs-menu-list; reader-window clone → #wv-wtl-list.
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list") || panel.querySelector("#wv-wtl-list");
            if (!list) return;
            for (const el of list.querySelectorAll(".wv-otherwin-scope")) el.remove();
            const sections = this._wvTabsMenuOtherWindowSections(win);
            if (!sections.length) return;
            this._wvTabsMenuRenderSections(doc, list, panel, sections,
                { header: "wv-otherwin-header", row: "wv-otherwin-row", lib: "wv-otherwin-libhdr", scope: "wv-otherwin-scope" }, "live");
        } catch (e) { Zotero.debug("[Weavero] _wvTabsMenuOtherWindows err: " + e); }
    }

    /** Cap the tabs-menu list to the space remaining below it on screen, so a long
     *  list scrolls (overflow-y:auto) instead of pushing the panel off the bottom.
     *  Computed from the list's live top after the panel is positioned. */
    _wvTabsMenuFitListHeight(panel: any, attempt?: number) {
        try {
            const win = panel.ownerGlobal;
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list") || panel.querySelector("#wv-wtl-list");
            if (!win || !list) return;
            const top = list.getBoundingClientRect().top;
            // The popup may not be positioned yet (top still at its pre-anchor spot);
            // retry next frame until it lands below the toolbar.
            if (top < 20 && (attempt || 0) < 12) {
                win.requestAnimationFrame(() => this._wvTabsMenuFitListHeight(panel, (attempt || 0) + 1));
                return;
            }
            const avail = Math.max(200, Math.floor(win.innerHeight - top - 18));
            // Reset the height first so scrollHeight reflects the ACTUAL content.
            // A previously-set (larger) height makes scrollHeight report that height
            // when the content no longer overflows, so the list would never shrink
            // when content shrinks (e.g. after disabling sessions) — leaving empty
            // space at the bottom. Measure + re-set happen in the same frame, so
            // there's no visible flicker.
            list.style.removeProperty("height");
            const content = list.scrollHeight;
            const h = Math.min(content, avail);
            // The list is a XUL vbox — CSS max-height is ignored, but an explicit
            // height is honoured. Set it so the list caps to the on-screen space and
            // its (non-shrinking) children overflow → it scrolls. Use min(content,…)
            // so a short list doesn't leave empty space below.
            list.style.setProperty("height", h + "px", "important");
            list.style.setProperty("overflow-y", "auto", "important");
        } catch (e) { Zotero.debug("[Weavero] _wvTabsMenuFitListHeight err: " + e); }
    }

    /** Overlay a small group-library badge on a tab row's item icon when the tab's
     *  item lives in a group library AND Sort-by-Library is off (so the lost library
     *  grouping is still hinted). Idempotent; removes the badge when not applicable. */
    _wvDecorateGroupLibBadge(row: any, win: any) {
        try {
            const prev = row.querySelector(".wv-grouplib-badge");
            if (prev) prev.remove();
            if (this._tabsMenuGroupByLibrary !== false) return;   // only when sort is OFF
            const tabId = row.dataset && row.dataset.tabId;
            if (!tabId || tabId === "zotero-pane") return;
            const Zotero_Tabs = win && win.Zotero_Tabs;
            const tab = Zotero_Tabs && Zotero_Tabs._tabs.find((t: any) => t.id === tabId);
            const itemID = tab && tab.data && tab.data.itemID;
            if (itemID == null) return;
            const item = Zotero.Items.get(itemID);
            if (!item) return;
            let isGroup = false;
            try { const lib = Zotero.Libraries.get(item.libraryID); isGroup = !!(lib && lib.libraryType === "group"); } catch (e) {}
            if (!isGroup) return;
            const icon = row.querySelector(".icon-item-type") || row.querySelector(".tab-icon");
            if (!icon) return;
            icon.style.position = "relative";
            icon.appendChild(this._wvGroupLibBadgeSvg(row.ownerDocument));
        } catch (e) {}
    }

    /** A small, symmetric, bold temple glyph for the group-library badge — Zotero's
     *  stock icon has 1px columns that blur when scaled down to badge size, so we
     *  draw a 3-column version centred on x8. Rendered as a background-image on a
     *  span (an absolutely-positioned <svg> collapses against the 0×0 icon span). */
    _wvGroupLibBadgeSvg(doc: any) {
        const span = doc.createElement("span");
        span.className = "wv-grouplib-badge";
        span.style.backgroundImage = "url(\"data:image/svg+xml," + encodeURIComponent(WV_GROUPLIB_BADGE_SVG) + "\")";
        return span;
    }

    _wvTabsMenuIsWindowCollapsed(key: string) {
        return !!(this._wvTabsMenuCollapsedWindows && this._wvTabsMenuCollapsedWindows.has(key));
    }

    _wvTabsMenuToggleWindowCollapse(key: string) {
        if (!this._wvTabsMenuCollapsedWindows) this._wvTabsMenuCollapsedWindows = new Set();
        const s = this._wvTabsMenuCollapsedWindows;
        if (s.has(key)) s.delete(key); else s.add(key);
    }

    // ---- Window names (stable default + configurable per-window title) ----------
    // Default name is "Window N" by the window's STABLE index in
    // Zotero.getMainWindows() (creation order, oldest-first) — so a window keeps the
    // same number no matter which window you view the tabs list from. A custom title
    // overrides it; titles persist across restarts keyed by that stable index.

    _wvWindowTitlesGet() {
        try { return JSON.parse(String(Zotero.Prefs.get("weavero.windowTitles", true) || "{}")) || {}; }
        catch (e) { return {}; }
    }
    _wvWindowTitlesSet(map: any) {
        try { Zotero.Prefs.set("weavero.windowTitles", JSON.stringify(map || {}), true); } catch (e) {}
    }
    _wvWindowIndex(win: any) {
        try { return Zotero.getMainWindows().indexOf(win); } catch (e) { return -1; }
    }
    /** A window's custom title (session cache → persisted-by-index), or null. */
    _wvWindowCustomTitle(win: any) {
        if (!win) return null;
        if (win._wvWindowTitle != null) return win._wvWindowTitle || null;   // "" = cleared
        const idx = this._wvWindowIndex(win);
        if (idx < 0) return null;
        const t = this._wvWindowTitlesGet()[String(idx)];
        if (t) { win._wvWindowTitle = t; return t; }
        return null;
    }
    _wvWindowSetCustomTitle(win: any, title: any) {
        if (!win) return;
        win._wvWindowTitle = title || "";
        const idx = this._wvWindowIndex(win);
        if (idx < 0) return;
        const map = this._wvWindowTitlesGet();
        if (title) map[String(idx)] = title; else delete map[String(idx)];
        this._wvWindowTitlesSet(map);
    }
    /** Display name for a main window: custom title, else stable "Window N". */
    _wvWindowName(win: any) {
        const custom = this._wvWindowCustomTitle(win);
        if (custom) return custom;
        const idx = this._wvWindowIndex(win);
        return "Window " + (idx >= 0 ? idx + 1 : "?");
    }
    /** The anchor is the single OLDEST main window (creation order — index 0 of
     *  `Zotero.getMainWindows()`). Defining it by position rather than by the
     *  `_wvManagedWindow` flag guarantees EXACTLY ONE anchor: a second main window
     *  opened natively (or programmatically, e.g. during session recovery) doesn't
     *  carry the managed flag, so the old `!_wvManagedWindow` test wrongly marked
     *  every such window an anchor. */
    _wvIsAnchorWindow(win: any) {
        try {
            const mains = Zotero.getMainWindows();
            return !!(win && mains.length && mains[0] === win);
        } catch (e) { return false; }
    }
    /** Prompt to rename a window; blank restores the default. */
    _wvWindowRenamePrompt(targetWin: any, panel: any) {
        try {
            const parentWin = (panel && panel.ownerGlobal) || targetWin;
            const obj = { value: this._wvWindowCustomTitle(targetWin) || "" };
            const ok = Services.prompt.prompt(parentWin, "Rename Window",
                "Window title (leave blank for the default):", obj, null, { value: false });
            if (!ok) return;
            this._wvWindowSetCustomTitle(targetWin, (obj.value || "").trim() || null);
            try { if (panel && typeof panel.refreshList === "function") panel.refreshList(); else this._wvRegroupTabsMenu(panel); }
            catch (e) { try { this._wvRegroupTabsMenu(panel); } catch (e2) {} }
        } catch (e) { Zotero.debug("[Weavero] _wvWindowRenamePrompt err: " + e); }
    }

    /** Right-click context menu for a window header in the tabs dropdown:
     *  a "Rename Window…" item (and "Reset to Default Name" when a custom title
     *  is set), so the rename isn't a surprise direct prompt. Mirrors the
     *  tab-group context menu (`_wvTabsMenuGroupContext`) so the two feel the same. */
    _wvWindowHeaderContext(targetWin: any, panel: any, e: any) {
        try {
            const menuWin = (panel && panel.ownerGlobal) || targetWin;
            const doc = menuWin.document;
            let pop: any = doc.getElementById("wv-winhdr-context");
            if (pop) pop.remove();                       // rebuild fresh each time
            pop = doc.createXULElement("menupopup");
            pop.id = "wv-winhdr-context";
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const mk = (label: string, fn: (p: any) => void) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                mi.addEventListener("command", (ev: any) => {
                    try {
                        ev.stopPropagation();
                        const p: any = live();
                        if (p) fn(p);
                    } catch (er) {}
                });
                pop.appendChild(mi);
            };
            mk("Rename Window…", (p: any) => p._wvWindowRenamePrompt(targetWin, panel));
            if (this._wvWindowCustomTitle(targetWin)) {
                mk("Reset to Default Name", (p: any) => {
                    try {
                        p._wvWindowSetCustomTitle(targetWin, null);
                        if (panel && typeof panel.refreshList === "function") panel.refreshList();
                        else p._wvRegroupTabsMenu(panel);
                    } catch (er) {}
                });
            }
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(e.screenX, e.screenY, true);
        } catch (er) { Zotero.debug("[Weavero] _wvWindowHeaderContext err: " + er); }
    }

    /** A window-section header (label + count), styled like the library headers.
     *  Shared by the all-windows list AND the expanded-session view. */
    _wvTabsMenuWindowHeader(doc: any, label: string, count: number, marker: string, iconType?: string, anchorIconClass?: string, collapseKey?: string, panel?: any, winRef?: any) {
        const header = doc.createElement("div");
        header.className = "wv-tabs-menu-library-header " + (marker || "");
        header.setAttribute("role", "presentation");
        // Left glyph: a plain window frame for any window (main, reader, anchor —
        // the first tab makes the kind obvious); a Zotero icon class for library
        // sub-headers.
        if (iconType === "anchor" || iconType === "main" || iconType === "reader" || iconType === "window") {
            const ic = doc.createElement("span");
            // Main / anchor windows get the blue-tab variant; reader windows keep the
            // plain frame (a main window has tabs — same cue as the menu icons).
            ic.className = "wv-winicon" + (iconType === "reader" ? "" : " wv-winicon-main");
            header.appendChild(ic);
        } else if (iconType) {
            const ic = doc.createElement("span");
            ic.className = "icon icon-css " + iconType;   // Zotero library/group/feed icon
            header.appendChild(ic);
        }
        const lbl = doc.createElement("span");
        lbl.className = "wv-tabs-menu-library-name";
        lbl.textContent = label;
        header.appendChild(lbl);
        // Anchor (primary) window: mark it on the RIGHT of the name with an anchor
        // glyph.
        if (iconType === "anchor") {
            const SVG = "http://www.w3.org/2000/svg";
            const svg = doc.createElementNS(SVG, "svg");
            svg.setAttribute("viewBox", WV_ANCHOR_VIEWBOX);
            svg.setAttribute("class", "wv-anchor-mark");
            // Shared solid Material anchor (see WV_ANCHOR_PATH); colour from CSS.
            const path = doc.createElementNS(SVG, "path");
            path.setAttribute("fill", "currentColor");
            path.setAttribute("d", WV_ANCHOR_PATH);
            svg.appendChild(path);
            header.appendChild(svg);
        }
        const cnt = doc.createElement("span");
        cnt.className = "wv-tabs-menu-library-count";
        cnt.textContent = String(count);
        header.appendChild(cnt);
        // Collapsible window: a twisty at the far RIGHT (same as tab-group headers);
        // clicking anywhere on the header toggles the window's tabs.
        if (collapseKey != null) {
            const collapsed = this._wvTabsMenuIsWindowCollapsed(collapseKey);
            const tw = doc.createElement("span");
            tw.className = "wv-win-twisty";
            tw.textContent = collapsed ? "▸" : "▾";   // ▸ / ▾
            header.appendChild(tw);
            header.style.cursor = "pointer";
            // The native .wv-tabs-menu-library-header is pointer-events:none, so real
            // clicks fall through (synthetic dispatch ignores it — that's why tests
            // lied). Re-enable hit-testing so the header actually toggles.
            header.style.setProperty("pointer-events", "auto", "important");
            header.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                if (!p) return;
                p._wvTabsMenuToggleWindowCollapse(collapseKey);
                const collapsed = p._wvTabsMenuIsWindowCollapsed(collapseKey);
                // Toggle the collapse class on the window wrapper IN PLACE (the CSS
                // `.wv-winscope.wv-win-collapsed > :not(:first-child)` hides the rows)
                // rather than a full panel.refreshList() rebuild — a rebuild recreates
                // every scroll container and so loses the session box's internal scroll
                // position, jumping it to the top. In-place toggle keeps all scrolls.
                const winWrap = header.closest(".wv-winscope");
                if (winWrap) {
                    // Keep the CLICKED header visually fixed so collapsing doesn't
                    // shift the scroll: find the nearest scrollable ancestor (the
                    // session box `.wv-sess-body` or the list itself) and adjust its
                    // scrollTop by the header's on-screen movement after the rows
                    // hide/show.
                    let sc: any = winWrap.parentElement;
                    try {
                        const view = doc.defaultView;
                        while (sc) {
                            const cs = view.getComputedStyle(sc);
                            if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight) break;
                            sc = sc.parentElement;
                        }
                    } catch (er) { sc = null; }
                    const beforeTop = header.getBoundingClientRect().top;
                    winWrap.classList.toggle("wv-win-collapsed", collapsed);
                    try { tw.textContent = collapsed ? "▸" : "▾"; } catch (er) {}
                    // Re-anchor the header to its pre-collapse screen position. Apply
                    // now AND on the next frame — the height-fit/reflow pass runs async
                    // and would otherwise drift the header after this handler returns.
                    if (sc) {
                        const reanchor = () => { try { sc.scrollTop += header.getBoundingClientRect().top - beforeTop; } catch (er) {} };
                        reanchor();
                        try { const v = doc.defaultView; if (v && v.requestAnimationFrame) v.requestAnimationFrame(reanchor); } catch (er) {}
                    }
                } else {
                    // No wrapper found (unexpected) → fall back to the full rebuild.
                    try { if (typeof panel.refreshList === "function") panel.refreshList(); else p._wvRegroupTabsMenu(panel); }
                    catch (er) { try { p._wvRegroupTabsMenu(panel); } catch (e2) {} }
                }
            });
        }
        // Right-click a window header → context menu with a Rename option. Reader
        // windows are included too (session-level title via the per-window cache;
        // they aren't index-keyed so it doesn't persist across restart, which
        // matches reader windows being session-ephemeral).
        if (winRef && (iconType === "anchor" || iconType === "main" || iconType === "reader")) {
            header.style.setProperty("pointer-events", "auto", "important");
            header.addEventListener("contextmenu", (e: any) => {
                e.preventDefault(); e.stopPropagation();
                const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                if (p) p._wvWindowHeaderContext(winRef, panel, e);
            });
        }
        return header;
    }

    /** The icon class of a main window's library tab (reflects its selected
     *  library — icon-library / icon-library-group / icon-feed / a collection).
     *  Stripped of tab-only classes so it can be reused as a plain icon. */
    _wvAnchorLibIconClass(win: any) {
        try {
            const d = win && win.document;
            const lt = d && d.querySelector('.tab[data-id="zotero-pane"] .tab-icon');
            if (lt) return String(lt.className).replace(/\b(tab-icon|selected)\b/g, "").replace(/\s+/g, " ").trim();
        } catch (e) {}
        return "";
    }

    /** One native-styled tab row. `tb` = { item, title, onClick }; `marker` is a
     *  cleanup class. Shared by the all-windows list AND the expanded-session
     *  view so both share the same design. */
    _wvTabsMenuTabRow(doc: any, tb: any, panel: any, marker: string) {
        const row = doc.createElement("div");
        row.className = "row " + (marker || "") + (tb.selected ? " selected" : "");
        row.style.cursor = "pointer";
        // Stamp the row's library + item type so the funnel filters can hide/show it
        // across ALL windows (these Weavero rows have no Zotero_Tabs id to look up).
        try { if (tb.item && tb.item.libraryID != null) row.setAttribute("data-wv-library", String(tb.item.libraryID)); } catch (e) {}
        try { if (tb.item && tb.item.getItemTypeIconName) row.setAttribute("data-wv-itemtype", tb.item.getItemTypeIconName(true)); } catch (e) {}
        // Full title as a tooltip so an ellipsised row reveals its full name on
        // hover — same as the tab header.
        try { if (tb.title) row.setAttribute("title", tb.title); } catch (e) {}
        // Drag-source identity: a row that maps to a real tab (not a library home
        // row) becomes draggable so it can be moved to a group / another window.
        try {
            if (tb.win && tb.tabId != null) {
                (row as any)._wvSrcWin = tb.win;
                (row as any)._wvSrcTabId = tb.tabId;
                (row as any)._wvSrcIsReader = !!tb.isReader;
                if (tb.itemID != null) (row as any)._wvSrcItemID = tb.itemID;
                row.setAttribute("draggable", "true");
            }
        } catch (e) {}
        const title = doc.createElement("div");
        title.setAttribute("flex", "1");
        title.className = "zotero-tabs-menu-entry title";
        const span = doc.createElement("span");
        if (tb.iconFullClass) {
            span.className = tb.iconFullClass;   // a library-tab row (no item) — its own icon
        } else {
            span.className = "icon icon-css tab-icon icon-item-type";
            try { span.setAttribute("data-item-type", tb.item.getItemTypeIconName(true)); } catch (e) {}
        }
        title.appendChild(span);
        // Group-library badge when Sort-by-Library is off (no library headers to
        // group these rows) — matches the native current-window rows.
        try {
            if (this._tabsMenuGroupByLibrary === false && tb.item) {
                const lib = Zotero.Libraries.get(tb.item.libraryID);
                if (lib && lib.libraryType === "group") {
                    span.style.position = "relative";
                    span.appendChild(this._wvGroupLibBadgeSvg(doc));
                }
            }
        } catch (e) {}
        const label = doc.createElement("label");
        label.textContent = tb.title || "";
        title.appendChild(label);
        row.appendChild(title);
        row.addEventListener("click", (e: any) => {
            try {
                e.stopPropagation();
                try { panel.hidePopup(); } catch (er) {}
                if (typeof tb.onClick === "function") tb.onClick();
            } catch (er) {}
        });
        return row;
    }

    /** Annotation-count badge for an item (null when 0), same look as the
     *  native rows' badge. */
    _wvTabsMenuAnnotationBadge(doc: any, item: any) {
        try {
            if (!item || typeof item.getAnnotations !== "function") return null;
            const n = (item.getAnnotations() || []).length;
            if (!n) return null;
            const NS = "http://www.w3.org/1999/xhtml";
            const badge = doc.createElementNS(NS, "span");
            badge.className = "wv-tabs-menu-anncount";
            badge.title = n + " annotation" + (n === 1 ? "" : "s");
            const ic = doc.createElementNS(NS, "span");
            ic.className = "wv-tabs-menu-anncount-icon";
            badge.appendChild(ic);
            const lbl = doc.createElementNS(NS, "span");
            lbl.className = "wv-tabs-menu-anncount-label";
            lbl.textContent = String(n);
            badge.appendChild(lbl);
            return badge;
        } catch (e) { return null; }
    }

    /** Render window sections (label + tabs[{item,title,onClick}]) into the list,
     *  honouring the tabs-menu settings: "Sort by Library" → library sub-headers
     *  nested inside each window; "Show annotation count" → per-row badge.
     *  Shared by the all-windows list AND the expanded-session view, so both look
     *  identical. `marker` = { header, row, lib } cleanup classes. */
    _wvTabsMenuRenderSections(doc: any, container: any, panel: any, sections: any[], marker: any, keyPrefix?: string) {
        try { (this as any)._wvEnsureTabSessionStyles(doc); } catch (e) {}   // rail + indent CSS
        const sortByLib = this._tabsMenuGroupByLibrary !== false;
        const showAnn = !!this._tabsMenuShowAnnotationCount;
        const addRow = (parent: any, tb: any) => {
            const row = this._wvTabsMenuTabRow(doc, tb, panel, marker.row);
            if (showAnn) {
                try {
                    const badge = this._wvTabsMenuAnnotationBadge(doc, tb.item);
                    if (badge) row.appendChild(badge);
                } catch (e) {}
            }
            parent.appendChild(row);
        };
        for (const sec of sections) {
            // Each window's content goes in a `.wv-winscope` wrapper → its left
            // rail spans the whole window. No window icon (the rail + label say it).
            const winWrap = doc.createElement("div");
            winWrap.className = "wv-winscope " + (marker.scope || "");
            // Drop-target identity: the window this scope represents.
            (winWrap as any)._wvWin = sec.win;
            (winWrap as any)._wvIsReader = (sec.kind === "reader");
            const collapseKey = keyPrefix ? (keyPrefix + "|" + sec.label) : undefined;
            if (collapseKey && this._wvTabsMenuIsWindowCollapsed(collapseKey)) winWrap.classList.add("wv-win-collapsed");
            winWrap.appendChild(this._wvTabsMenuWindowHeader(doc, sec.label, sec.tabs.length, marker.header, sec.iconType || (sec.kind === "reader" ? "reader" : "main"), sec.anchorIconClass, collapseKey, panel, sec.win));
            // The window's Library (home) tab, shown first — matches the current
            // window's native list, which always leads with "My Library".
            if (sec.libraryTab) { try { addRow(winWrap, sec.libraryTab); } catch (e) {} }
            if (sortByLib) {
                const byLib = new Map<any, any[]>();
                for (const tb of sec.tabs) {
                    const lid = (tb.item && tb.item.libraryID != null) ? tb.item.libraryID : 0;
                    if (!byLib.has(lid)) byLib.set(lid, []);
                    byLib.get(lid)!.push(tb);
                }
                for (const [lid, tabs] of byLib) {
                    let libName = "Library", iconClass = "icon-library";
                    try {
                        const lib = Zotero.Libraries.get(lid);
                        if (lib && lib.name) libName = lib.name;
                        if (lib && lib.libraryType === "group") iconClass = "icon-library-group";
                        else if (lib && lib.libraryType === "feed") iconClass = "icon-feed";
                    } catch (e) {}
                    const libHdr = this._wvTabsMenuWindowHeader(doc, libName, tabs.length, marker.lib, iconClass);
                    libHdr.classList.add("wv-tabsmenu-sublib");
                    winWrap.appendChild(libHdr);
                    for (const tb of tabs) addRow(winWrap, tb);
                }
            } else {
                for (const tb of sec.tabs) addRow(winWrap, tb);
            }
            container.appendChild(winWrap);
        }
    }

    /** Wrap the current window's native content (library headers + tab rows) in a
     *  window scope rail, so the current window reads as one scoped window like
     *  the others. Run after groupByLibrary + the current-session banner. */
    _wvTabsMenuWrapCurrentWindow(panel: any) {
        try {
            const doc = panel.ownerDocument;
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list");
            if (!list) return;
            let wrap: any = list.querySelector(".wv-winscope-current");
            if (wrap) {
                // Already wrapped this pass — but _groupTabsMenuByLibrary strips
                // every `.wv-tabs-menu-library-header`, and the current-window header
                // shares that class, so a regroup (e.g. applying a filter, which
                // doesn't clear the list) leaves the scope WITHOUT its header.
                // Rebuild just the header in that case; if it's still there, done.
                if (wrap.querySelector(".wv-curwin-header")) return;
            } else {
                // Everything that isn't the banner or an existing scope wrapper is
                // the native current-window content.
                const nodes = [...list.children].filter((n: any) =>
                    !n.classList.contains("wv-cursess-header")
                    && !n.classList.contains("wv-winscope")
                    && !n.classList.contains("wv-sessscope"));
                if (!nodes.length) return;
                wrap = doc.createElement("div");
                wrap.className = "wv-winscope wv-winscope-current";
                list.insertBefore(wrap, nodes[0]);
                for (const n of nodes) wrap.appendChild(n);
                // Drop-target identity.
                (wrap as any)._wvWin = doc.defaultView;
                (wrap as any)._wvIsReader = false;
            }
            // Make the native current-window rows draggable (the library home row is
            // structural — leave it out). Idempotent, so safe on an existing scope.
            try {
                for (const r of wrap.querySelectorAll(".row[data-tab-id]")) {
                    if ((r as any).dataset && (r as any).dataset.tabId === "zotero-pane") continue;
                    (r as any).setAttribute("draggable", "true");
                }
            } catch (e) {}
            // (Re)build the header at the top of the scope. Label the current window
            // by its STABLE name (custom title, else "Window N" by creation order) —
            // consistent no matter which window the tabs list is opened from.
            const count = wrap.querySelectorAll(".row[data-tab-id]").length;
            const w: any = doc.defaultView;
            // Anchor mark only with >1 main window (matches the library-tab gate).
            const isAnchor = this._wvIsAnchorWindow(w) && Zotero.getMainWindows().length > 1;
            const collapseKey = "live|current";
            if (this._wvTabsMenuIsWindowCollapsed(collapseKey)) wrap.classList.add("wv-win-collapsed");
            const hdr = this._wvTabsMenuWindowHeader(doc, this._wvWindowName(w), count, "wv-curwin-header", isAnchor ? "anchor" : "main", "", collapseKey, panel, w);
            wrap.insertBefore(hdr, wrap.firstChild);
        } catch (e) { Zotero.debug("[Weavero] _wvTabsMenuWrapCurrentWindow err: " + e); }
    }

    /** Wrap the WHOLE current-session region — the banner, the current window,
     *  the other windows, and the tab-groups section — in one session scope, so
     *  the current session reads as a single tinted block (like an expanded saved
     *  session). All of that belongs to the current session. Runs AFTER the
     *  tab-groups section and BEFORE the saved-sessions list, which stays outside
     *  the scope. Idempotent within a pass; the list is rebuilt each refresh. */
    _wvTabsMenuWrapCurrentSession(panel: any) {
        try {
            const doc = panel.ownerDocument;
            // Main panel → #zotero-tabs-menu-list; reader-window clone → #wv-wtl-list.
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list") || panel.querySelector("#wv-wtl-list");
            if (!list) return;
            // Sessions off → no session box at all, so the window boxes fill the
            // popup's full height (matches the gated banner/list above & below).
            if (!this._wvGetEnableTabSessions()) return;
            if (list.querySelector(".wv-cursess-scope")) return;   // already wrapped this pass
            const nodes = [...list.children];
            if (!nodes.length) return;
            const wrap = doc.createElement("div");
            wrap.className = "wv-sessscope wv-cursess-scope";
            list.insertBefore(wrap, nodes[0]);
            // The "Current session" banner is the box's title bar (direct child,
            // top); the windows + tab-groups go in the body below — same structure
            // as a saved-session box, so the two read consistently.
            const body = doc.createElement("div");
            body.className = "wv-sess-body";
            for (const n of nodes) {
                if (n.classList && n.classList.contains("wv-cursess-header")) wrap.appendChild(n);
                else body.appendChild(n);
            }
            wrap.appendChild(body);
        } catch (e) { Zotero.debug("[Weavero] _wvTabsMenuWrapCurrentSession err: " + e); }
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
        // Drop a library item onto the tab bar → open its best attachment.
        try { this._wvWireItemDropOnTabBar(win); } catch (e) {}
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
            // Self-heal the Ctrl/Shift+click multi-select wiring: a session
            // switch / window rebuild can drop it (the listeners live on the
            // tab-bar container). The WIRE_VERSION guard makes this a no-op once
            // wired, so re-calling it on every tab-bar mutation is cheap.
            try { (Zotero as any).Weavero.plugin._wvWireTabMultiSel(win); } catch (e) {}
            // Keep the active (tracked) session in sync on tab open/close/reorder/
            // select. Reliable + prompt (the 'tab' Notifier queues add/select, so
            // it's not); debounced in _wvTabSessionTrackingUpdate, and suppressed
            // mid-switch by the _wvTabSessionSwitching guard.
            try { (Zotero as any).Weavero.plugin._wvTabSessionTrackingUpdate(); } catch (e) {}
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
            // itemIDs of ALL open tabs in EVERY main window (the pin store is
            // global, this apply is per-window — pruning against only THIS
            // window's tabs silently forgot pins living in the others). Also
            // catches tabs whose item isn't cached yet on restart.
            const openTabItemIDs = new Set<number>();
            try {
                const allWins = Zotero.getMainWindows ? Zotero.getMainWindows() : [win];
                for (const w2 of allWins) {
                    const tabs2 = (w2 as any).Zotero_Tabs && (w2 as any).Zotero_Tabs._tabs;
                    if (!tabs2) continue;
                    for (let i = 1; i < tabs2.length; i++) {
                        const iid = tabs2[i] && tabs2[i].data && tabs2[i].data.itemID;
                        if (iid != null) openTabItemIDs.add(iid);
                    }
                }
            } catch (e) {}
            const quitting = !!(this as any)._wvQuitting;
            // While the startup restore is still in flight, item lookups can
            // miss (group libraries load late) and tabs aren't all back yet —
            // pruning then silently forgets pins (a group-library pin was lost
            // on every restart). Keep everything until the guard lifts.
            const restoring = !!(this as any)._wvTabGroupRestoreGuard;
            const newPref: Array<{ libraryID: number, itemKey: string }> = pinnedOpenInOrder
                .map(p => ({ libraryID: p.libraryID, itemKey: p.itemKey }));
            for (const p of pinPref) {
                if (openSet.has(p.libraryID + ":" + p.itemKey)) continue;
                // A pin with no MATCHED open tab. DROP it (Zotero-like: a closed
                // pinned tab is forgotten, no ghost entries) UNLESS a tab for the
                // item is still open but its item isn't cached yet (restart), or
                // we're quitting (keep so it restores pinned next launch).
                try {
                    const id = Zotero.Items.getIDFromLibraryAndKey(p.libraryID, p.itemKey);
                    if (!id) { if (restoring) newPref.push(p); continue; }   // unresolvable mid-restore ≠ gone
                    if (quitting || restoring || openTabItemIDs.has(id)) newPref.push(p);
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
                        // Preserve the source tab's id across the (reload) move — only a
                        // real `tab-…` id (the source's synthetic ids aren't meaningful).
                        try {
                            const sid = payload && payload.sourceTabId;
                            if (sid && sid !== tab.id && /^tab-/.test(String(sid))) this._wvRenameTab(targetWin, tab.id, sid);
                        } catch (e) {}
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
                                let itemType = rt === "note" ? "note"
                                    : rt === "epub" ? "attachmentEPUB"
                                    : rt === "snapshot" ? "attachmentSnapshot"
                                    : "attachmentPDF";
                                // Derive from the ITEM when possible — a payload
                                // with a blank/odd readerType otherwise defaults
                                // every ghost to a PDF icon (a dragged NOTE tab
                                // showed a PDF ghost).
                                try {
                                    if (info.itemID != null) {
                                        const it: any = Zotero.Items.get(info.itemID);
                                        const n = it && it.getItemTypeIconName && it.getItemTypeIconName(true);
                                        if (n) itemType = n;
                                    }
                                } catch (er4) {}
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

    /** Viewport X where the drop indicator / new tab will land for a drop at
     *  `clientX` — the LEFT edge of the tab the item inserts before, or the RIGHT
     *  edge of the last tab when appending. Null if there are no tabs. */
    _wvTabDropIndicatorX(win: any, clientX: number): number | null {
        try {
            const tabEls = this._wvVisibleTabEls(win);
            if (!tabEls.length) return null;
            const idx = this._wvTabIndexFromX(win, clientX);
            if (idx == null) return null;
            if (idx >= tabEls.length) return tabEls[tabEls.length - 1].getBoundingClientRect().right;
            return tabEls[idx].getBoundingClientRect().left;
        } catch (e) { return null; }
    }

    /** Get-or-create the Firefox-style drop indicator (a thin vertical blue bar
     *  with a round cap on top) for `win`. position:fixed so it's placed by
     *  viewport coords; pointer-events:none so it never eats the drop. Appended
     *  inside the HTML `#tab-bar-container` (the XUL window root gives an HTML div
     *  layout but never paints it); the container is static + untransformed +
     *  overflow:visible, so the fixed bar paints at the right viewport spot and
     *  the round cap isn't clipped. */
    _wvTabDropIndicator(win: any): any {
        try {
            const ind = (win as any)._wvTabDropInd;
            if (ind && ind.isConnected) return ind;
            const doc = win.document;
            const host = doc.getElementById("tab-bar-container");
            if (!host) return null;
            const blue = (this._detectUIDark && this._detectUIDark()) ? "#5b9bf8" : "#4072e5";
            const bar = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            bar.style.cssText = "position:fixed;width:3px;background:" + blue
                + ";pointer-events:none;z-index:2147483647;border-radius:1.5px;margin:0;padding:0;display:none;";
            const dot = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            dot.style.cssText = "position:absolute;left:50%;top:-3px;transform:translateX(-50%);"
                + "width:9px;height:9px;border-radius:50%;background:" + blue + ";";
            bar.appendChild(dot);
            host.appendChild(bar);
            (win as any)._wvTabDropInd = bar;
            return bar;
        } catch (e) { return null; }
    }

    _wvShowTabDropIndicator(win: any, clientX: number) {
        try {
            const barEl = win.document.getElementById("tab-bar-container");
            const x = this._wvTabDropIndicatorX(win, clientX);
            if (!barEl || x == null) { this._wvHideTabDropIndicator(win); return; }
            const ind = this._wvTabDropIndicator(win);
            if (!ind) return;
            const r = barEl.getBoundingClientRect();
            // Inset the bar from the top of the tab strip so the round cap (which
            // sits just above the bar) is FULLY visible — the strip touches the
            // window's top edge, so a full-height bar would clip the cap. Firefox
            // does the same (its toolbar has room above the tabs for the cap).
            const TOP = 7, BOT = 5;
            ind.style.left = (x - 1.5) + "px";
            ind.style.top = (r.top + TOP) + "px";
            ind.style.height = Math.max(8, r.height - TOP - BOT) + "px";
            ind.style.display = "block";
        } catch (e) {}
    }

    _wvHideTabDropIndicator(win: any) {
        try { const ind = (win as any)._wvTabDropInd; if (ind) ind.style.display = "none"; } catch (e) {}
    }

    /** Drop a library item (or a multi-selection) onto the main-window tab bar
     *  → open each item's best attachment in a new reader tab at the drop
     *  position. Mirrors double-click / the items-menu "Open … in". Items with
     *  no openable attachment (incl. notes) are skipped. Zotero's tab bar has no
     *  drop handler of its own — its `handleTabBarDragOver` always preventDefaults
     *  (for tab-reorder), so a `drop` does fire here; we only act on `zotero/item`
     *  drags and leave `zotero/tab` (reorder) drags to Zotero. Wired once/window. */
    _wvWireItemDropOnTabBar(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            const bar = doc.getElementById("tab-bar-container") || doc.getElementById("zotero-title-bar");
            if (!bar || (bar as any)._wvItemDropWired) return;
            const isItemDrag = (e: any) => {
                try {
                    const t = e.dataTransfer && e.dataTransfer.types;
                    if (!t) return false;
                    const has = (k: string) => (t.includes ? t.includes(k) : Array.prototype.indexOf.call(t, k) >= 0);
                    return has("zotero/item") && !has("zotero/tab");
                } catch (er) { return false; }
            };
            const onDragOver = (e: any) => {
                if (!isItemDrag(e)) return;
                e.preventDefault();
                try { e.dataTransfer.dropEffect = "copy"; } catch (er) {}
                e.stopPropagation();
                // Firefox-style: show a vertical blue bar where the tab will land.
                try { this._wvShowTabDropIndicator(win, e.clientX); } catch (er) {}
            };
            const onDragLeave = (e: any) => {
                // Hide only when the cursor actually leaves the bar (dragleave also
                // fires crossing child boundaries; dragover re-shows it otherwise).
                try {
                    const r = bar.getBoundingClientRect();
                    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
                        this._wvHideTabDropIndicator(win);
                    }
                } catch (er) {}
            };
            const onDrop = (e: any) => {
                try { this._wvHideTabDropIndicator(win); } catch (er) {}
                if (!isItemDrag(e)) return;
                e.preventDefault();
                e.stopPropagation();
                let ids: any[] = [];
                try {
                    const dd = (Zotero as any).DragDrop.getDataFromDataTransfer(e.dataTransfer);
                    if (dd && dd.dataType === "zotero/item") ids = dd.data || [];
                } catch (er) {}
                if (ids.length) this._wvOpenItemsFromTabBarDrop(win, ids, e.clientX);
            };
            bar.addEventListener("dragover", onDragOver, true);
            bar.addEventListener("dragleave", onDragLeave, true);
            bar.addEventListener("drop", onDrop, true);
            (bar as any)._wvItemDropWired = true;
            (win as any)._wvItemDropOff = () => {
                try {
                    bar.removeEventListener("dragover", onDragOver, true);
                    bar.removeEventListener("dragleave", onDragLeave, true);
                    bar.removeEventListener("drop", onDrop, true);
                    (bar as any)._wvItemDropWired = false;
                    const ind = (win as any)._wvTabDropInd;
                    if (ind && ind.remove) { try { ind.remove(); } catch (e2) {} }
                    (win as any)._wvTabDropInd = null;
                } catch (er) {}
            };
        } catch (e) { Zotero.debug("[Weavero] _wvWireItemDropOnTabBar err: " + e); }
    }

    /** Open each dropped item at the drop position. Notes / attachment-less items
     *  are skipped. Each tab is added as `reader-unloaded`/`note-unloaded` — the
     *  same INSTANT, synchronous path Zotero's own session restore uses (~3ms vs.
     *  the reader-render delay of Reader.open) — straight at the target slot, then
     *  the last one is selected so it loads lazily. */
    async _wvOpenItemsFromTabBarDrop(win: any, itemIDs: any[], clientX: number) {
        try {
            try { if (win.focus) win.focus(); } catch (e) {}
            const ZT: any = win.Zotero_Tabs;
            if (!ZT || typeof ZT.add !== "function") return;
            const baseIndex = this._wvTabIndexFromX(win, clientX);
            if (baseIndex == null) return;
            // Dropping INTO a tab group → the new tab(s) join that group. Detected
            // from the drop position (cursor over a grouped tab); the tab is added at
            // the drop slot, INSIDE the group's contiguous run, then stamped.
            const dropGroupId = (this._wvGroupIdAtTabBarX ? this._wvGroupIdAtTabBarX(win, clientX) : null);
            let placed = 0, lastId: any = null, didGroup = false;
            for (const id of itemIDs) {
                const it = Zotero.Items.get(id);
                if (!it) continue;
                // Resolve the openable: the note itself, or the item's best reader-able
                // attachment. Dedup within THIS window (select the existing tab).
                let openItemID: any = null, type: any = null;
                if (it.isNote && it.isNote()) { openItemID = it.id; type = "note-unloaded"; }
                else {
                    const att = this._wvGetBestAttachmentSync(it);
                    if (!att) continue;
                    openItemID = att.id; type = "reader-unloaded";
                }
                const ex = (ZT._tabs || []).find((t: any) => t && t.data && t.data.itemID === openItemID);
                if (ex) { try { ZT.select(ex.id); } catch (e) {} continue; }
                // Correct citation-style title up front so the tab shows the RIGHT
                // title immediately (no placeholder flicker). getTabTitle() is ~1ms
                // for an item that's loaded — which a dragged item is.
                let title = "";
                try { const x: any = Zotero.Items.get(openItemID); title = (await x.getTabTitle()) || ""; } catch (e) {}
                if (!title) { try { const x: any = Zotero.Items.get(openItemID); title = (x.getNoteTitle && x.getNoteTitle()) || (x.getDisplayTitle && x.getDisplayTitle()) || ""; } catch (e) {} }
                try {
                    const res = ZT.add({ type, title, index: baseIndex + placed, data: { itemID: openItemID }, select: false });
                    placed++;
                    if (res && res.id) {
                        lastId = res.id;
                        // Stamp into the dropped-on group (no reposition → keep the
                        // drop slot; the tab is already contiguous with the group).
                        if (dropGroupId) {
                            try {
                                const tab = (ZT._tabs || []).find((t: any) => t.id === res.id);
                                if (tab) {
                                    this._wvTabGroupSetStamp(tab, dropGroupId);
                                    const key = this._tabPinKey(tab);
                                    if (key) this._tabGroupAddKey(dropGroupId, key);
                                    didGroup = true;
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) { Zotero.debug("[Weavero] tab-bar drop add err: " + e); }
            }
            if (didGroup) { try { this._wvTabGroupApplyEverywhere(); } catch (e) {} }
            // All tabs are added instantly (unloaded). DEFER selecting the last one
            // to the next tick so the tabs PAINT first (instant), then it loads —
            // like pressing Enter on the item: very fast tab + load after. The other
            // dropped tabs stay unloaded (no render cost) until clicked.
            if (lastId) {
                const id = lastId;
                try { (win.setTimeout || setTimeout)(() => { try { ZT.select(id); } catch (e) {} }, 0); } catch (e) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvOpenItemsFromTabBarDrop err: " + e); }
    }

    /** Tab index at drop X — never before the pinned library tab (index 0);
     *  end of the strip if dropped past the last tab. */
    _wvTabIndexFromX(win: any, clientX: number) {
        try {
            const tabEls = this._wvVisibleTabEls(win);
            let idx = tabEls.length;
            for (let i = 0; i < tabEls.length; i++) {
                const r = tabEls[i].getBoundingClientRect();
                if (clientX < r.left + r.width / 2) { idx = i; break; }
            }
            return Math.max(1, idx);
        } catch (e) { return null; }
    }

    /** The visible tab elements in DOM order, EXCLUDING zero-width placeholders
     *  (the tab bar can hold a hidden duplicate `zotero-pane` element, which would
     *  otherwise offset the DOM index from the logical Zotero_Tabs index by one). */
    _wvVisibleTabEls(win: any): any[] {
        try {
            return Array.prototype.slice.call(
                win.document.querySelectorAll("#tab-bar-container .tab[data-id]"))
                .filter((el: any) => { try { return el.getBoundingClientRect().width > 0; } catch (e) { return false; } });
        } catch (e) { return []; }
    }

    /** The tab-group id at a drop X on the main-window tab bar, or null. A grouped
     *  tab carries `data-wv-group`; we use the group of the tab the cursor is over,
     *  or — when between tabs — the group shared by both sides. */
    _wvGroupIdAtTabBarX(win: any, clientX: number): string | null {
        try {
            const els = this._wvVisibleTabEls(win);
            for (const el of els) {
                const r = el.getBoundingClientRect();
                if (clientX >= r.left && clientX <= r.right) return el.getAttribute("data-wv-group") || null;
            }
            const idx = this._wvTabIndexFromX(win, clientX);
            const a = (idx != null) ? els[idx - 1] : null, b = (idx != null) ? els[idx] : null;
            const ga = a && a.getAttribute && a.getAttribute("data-wv-group");
            const gb = b && b.getAttribute && b.getAttribute("data-wv-group");
            if (ga && ga === gb) return ga;
            return null;
        } catch (e) { return null; }
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
                                        if (tg && tg.length > 1) {
                                            self._wvMakeMoveTabMenuMulti(win2, popup, tg);
                                            self._wvMakeCloseTabsMenuMulti(win2, popup, tg);
                                            self._wvMakeDuplicateTabMenuMulti(win2, popup, tg);
                                        }
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

    /** CANONICAL tab context-menu order — the single source of truth for the
     *  rich tab menu, shared by EVERY window's tab context menu:
     *    - the reader-window strip menu builds its items in this order;
     *    - the main-window native menu is reordered to match (its top cluster);
     *    - the note-window menu (a small subset) follows it too.
     *  Edit the order HERE and it changes everywhere — no per-window edits.
     *  Keys map to: native Zotero items (by label) AND Weavero-added items
     *  (by their `data-wv-*` markers / known labels); `_wvTabMenuItemKey`
     *  resolves a popup child to one of these keys. */
    _wvTabMenuOrder(): string[] {
        return [
            "showInLibrary",
            "removeFromGroup",
            "moveTab",
            "viewOnline",
            "showFile",
            "externalViewer",
            "openNotes",
            "duplicate",
            "pin",
            "sep1",
            "close",
            "closeOther",
            "reopen",
            "copySelect",
            "copyOpen",
            "copyAs",
        ];
    }

    /** Resolve a tab context-menu child element to a canonical key from
     *  `_wvTabMenuOrder()`, or null if it isn't one of the ordered items.
     *  Checks Weavero markers first (data-wv-*), then falls back to the native
     *  Zotero labels so the SAME mapping works for the native main-window menu
     *  and Weavero's custom reader/note menus. */
    _wvTabMenuItemKey(el: any): string | null {
        try {
            if (!el || !el.getAttribute) return null;
            const tagged = el.getAttribute("data-wv-key");
            if (tagged) return tagged;                                          // tagged by our builders
            if (el.getAttribute("data-wv-tab-viewonline") === "1") return "viewOnline";
            if (el.getAttribute("data-wv-tab-showfile") === "1") return "showFile";
            if (el.getAttribute("data-wv-tab-external") === "1") return "externalViewer";
            const label = el.getAttribute("label") || "";
            const S = (k: string, fb: string) => { try { return Zotero.getString(k); } catch (e) { return fb; } };
            if (label === S("general.showInLibrary", "Show in Library")) return "showInLibrary";
            if (label === S("tabs.move", "Move Tab") || label === "Move Tabs") return "moveTab";
            if (label === S("tabs.duplicate", "Duplicate Tab") || /^Duplicate \d+ Tabs$/.test(label)) return "duplicate";
            if (label === "Pin Tab" || label === "Unpin Tab") return "pin";
            if (label === S("general.close", "Close") || /^Close \d+ Tabs$/.test(label)) return "close";
            if (label === S("tabs.closeOther", "Close Other Tabs")) return "closeOther";
            return null;
        } catch (e) { return null; }
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
            // Re-register cleanly so a reload picks up the latest onShowing (else a
            // stale registration — from before the move-targets injection existed —
            // keeps winning and the targets never appear).
            this._unregisterMoveTabsMenu();
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

    /** Inject the nested per-window / per-group move targets into the native
     *  "Move Tab" submenu (main-window tab context menu) — the same shared builder
     *  the reader-window menu uses. Cleared + rebuilt each popupshowing (windows /
     *  groups change). Inserted before the native "Move to New Window" (the
     *  submenu's last direct menuitem). `targets` is the right-clicked selection;
     *  a multi-selection moves all together, sequenced so each move settles. */
    _wvInjectMoveTargetsIntoNativeMoveMenu(win: any, popup: any, targets: any[]) {
        try {
            const doc = popup.ownerDocument;
            const moveLabel = Zotero.getString("tabs.move");
            let moveMenu: any = null;
            for (const m of popup.querySelectorAll("menu")) {
                const l = m.getAttribute && m.getAttribute("label");
                if (l === moveLabel || l === "Move Tabs") { moveMenu = m; break; }
            }
            if (!moveMenu) return;
            const submenu = moveMenu.querySelector("menupopup");
            if (!submenu) return;
            for (const el of Array.from(submenu.querySelectorAll(".wv-mv-target, .wv-mv-extra")) as any[]) el.remove();
            // Insert before "Move to New Window" — the submenu's last direct menuitem.
            const items = Array.from(submenu.children).filter((c: any) => c.tagName === "menuitem");
            const before: any = items.length ? items[items.length - 1] : null;
            const sep = doc.createXULElement("menuseparator");
            sep.classList.add("wv-mv-extra");
            if (before && before.parentNode === submenu) submenu.insertBefore(sep, before);
            else submenu.appendChild(sep);
            const tids = (targets && targets.length) ? targets.slice() : [];
            const onPick = (target: any) => {
                try {
                    // "New Reader/Main Window" move ALL the tabs into one new window.
                    if (target && target.newMainWindow) {
                        try { this._wvMoveTabsToNewMainWindow(win, tids.slice(), !!target.newGroup); } catch (e) {}
                        return;
                    }
                    if (target && target.newReaderWindow) {
                        try { this._wvMoveTabsToNewReaderWindow(win, tids.slice(), !!target.newGroup); } catch (e) {}
                        return;
                    }
                    let i = 0;
                    const step = () => {
                        if (i >= tids.length) return;
                        try { this._wvMoveTabToTarget(win, tids[i++], target); } catch (e) {}
                        if (i < tids.length) (win.setTimeout || setTimeout)(step, 500);
                    };
                    step();
                } catch (e) {}
            };
            this._wvBuildMoveTargetsInto(doc, submenu, win, onPick, before);
            // Our "Move to New Reader Window" replaces the native "Move to New
            // Window" (the `before` item) — hide the native one to avoid duplication.
            // Hide only (no wv-mv-extra tag: that class is removed by the cleanup
            // pass above, which would delete the native item permanently).
            try { if (before && before.parentNode === submenu && before.tagName === "menuitem") before.hidden = true; } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvInjectMoveTargetsIntoNativeMoveMenu err: " + e); }
    }

    /** Relabel the native "Close" menuitem to "Close N Tabs" and rebind it to
     *  close the whole `targets` selection (Firefox's "Close N Tabs"). Only the
     *  plain Close item — "Close Other Tabs" has a distinct label. */
    _wvMakeCloseTabsMenuMulti(win: any, popup: any, targets: any[]) {
        try {
            const closeLabel = Zotero.getString("general.close");
            for (const mi of Array.from(popup.querySelectorAll("menuitem")) as any[]) {
                if (!mi.getAttribute || mi.getAttribute("label") !== closeLabel) continue;
                const clone = mi.cloneNode(true);   // drops the native single-tab command listener
                clone.setAttribute("label", "Close " + targets.length + " Tabs");
                mi.replaceWith(clone);
                clone.addEventListener("command", () => {
                    try { const ZT: any = win && (win as any).Zotero_Tabs; if (ZT && typeof ZT.close === "function") ZT.close(targets.slice()); } catch (e) {}
                });
                break;   // only the first plain "Close" (not "Close Other Tabs")
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMakeCloseTabsMenuMulti err: " + e); }
    }

    /** True if a tab can be duplicated — i.e. its content type registers a
     *  `duplicate` hook (reader / note tabs do; the library tab does not). */
    _wvTabIsDuplicatable(ZT: any, id: any): boolean {
        try {
            if (!ZT || !id || id === "zotero-pane") return false;
            const got = ZT._getTab(id);
            const tab = got && got.tab;
            if (!tab) return false;
            const { tabContentType } = ZT.parseTabType(tab.type);
            return typeof ZT._hasHook === "function" && ZT._hasHook(tabContentType, "duplicate");
        } catch (e) { return false; }
    }

    /** Relabel the native "Duplicate tab" menuitem to "Duplicate N Tabs" and
     *  rebind it to duplicate the whole `targets` selection (each via its own
     *  tab-type duplicate hook). Mirrors _wvMakeCloseTabsMenuMulti. No-op when the
     *  selection has ≤1 duplicatable tab (leaves native single-tab behavior). */
    _wvMakeDuplicateTabMenuMulti(win: any, popup: any, targets: any[]) {
        try {
            const ZT: any = win && (win as any).Zotero_Tabs;
            const dupable = (targets || []).filter((id: any) => this._wvTabIsDuplicatable(ZT, id));
            if (dupable.length <= 1) return;
            const dupLabel = Zotero.getString("tabs.duplicate");
            for (const mi of Array.from(popup.querySelectorAll("menuitem")) as any[]) {
                if (!mi.getAttribute || mi.getAttribute("label") !== dupLabel) continue;
                const clone = mi.cloneNode(true);   // drops the native single-tab command listener
                clone.setAttribute("label", "Duplicate " + dupable.length + " Tabs");
                mi.replaceWith(clone);
                clone.addEventListener("command", () => {
                    try { this._wvDuplicateTabs(win, dupable); } catch (e) {}
                });
                break;   // only the one "Duplicate tab" item
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMakeDuplicateTabMenuMulti err: " + e); }
    }

    /** Duplicate each tab in `ids` via its content type's own `duplicate` hook
     *  (the same path the native single-tab item uses). Left-to-right by current
     *  bar position, sequentially, re-reading each tab's index so every duplicate
     *  lands right after its original. */
    async _wvDuplicateTabs(win: any, ids: any[]) {
        try {
            const ZT: any = win && (win as any).Zotero_Tabs;
            if (!ZT) return;
            const ordered = (ids || [])
                .map((id: any) => { const g = ZT._getTab(id); return { id, idx: g ? g.tabIndex : -1 }; })
                .filter((o: any) => o.idx > 0)
                .sort((a: any, b: any) => a.idx - b.idx)
                .map((o: any) => o.id);
            for (const id of ordered) {
                try {
                    const got = ZT._getTab(id);
                    const tab = got && got.tab;
                    const tabIndex = got && got.tabIndex;
                    if (!tab || tab.id === "zotero-pane") continue;
                    const { tabContentType } = ZT.parseTabType(tab.type);
                    if (typeof ZT._hasHook !== "function" || !ZT._hasHook(tabContentType, "duplicate")) continue;
                    const hook = ZT._getHook(tabContentType, "duplicate");
                    if (typeof hook === "function") await hook(tab, tabIndex);
                } catch (e) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvDuplicateTabs err: " + e); }
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

    /** Main-window tab context-menu item: "Reopen Closed Window / Group". Shown
     *  only when Weavero's closed-stack has a (live) reader-window/group entry —
     *  Zotero's own "Reopen Closed Tab" still covers closed tabs. Same
     *  `target: "main/tab"` mechanism as the Pin and New-Main-Window entries. */
    _registerReopenClosedMenu() {
        try {
            if (!((Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.registerMenu === "function")) return;
            this._unregisterReopenClosedMenu();
            const id = (Zotero as any).MenuManager.registerMenu({
                menuID: "weavero-reopen-closed",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [{
                    menuType: "menuitem",
                    onShowing: (_ev: any, ctx: any) => {
                        try {
                            const label = this._wvClosedTopLabel();
                            if (!label) { ctx.setVisible(false); return; }
                            ctx.setVisible(true);
                            ctx.menuElem.setAttribute("label", label);
                        } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                    },
                    onCommand: (_ev: any, ctx: any) => {
                        try {
                            const win = ctx && ctx.menuElem && ctx.menuElem.ownerDocument
                                ? ctx.menuElem.ownerDocument.defaultView : Zotero.getMainWindow();
                            this._wvClosedReopenLast(win);
                        } catch (e) { Zotero.debug("[Weavero] reopen-closed cmd err: " + e); }
                    },
                }],
            });
            if (id) this._reopenClosedMenuID = id;
        } catch (e) { Zotero.debug("[Weavero] _registerReopenClosedMenu err: " + e); }
    }

    _unregisterReopenClosedMenu() {
        try {
            if (this._reopenClosedMenuID && (Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.unregisterMenu === "function") {
                (Zotero as any).MenuManager.unregisterMenu(this._reopenClosedMenuID);
            }
        } catch (e) {}
        this._reopenClosedMenuID = null;
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
                    // BACKGROUND window: restore the STRUCTURE only — selecting
                    // the saved tab would start rendering its content right now,
                    // and N restoring windows = N simultaneous loads. Defer the
                    // selection to the window's first activate / the idle loader.
                    // The quit-time FOCUSED window keeps its immediate selection.
                    let restoreTabs = group.tabs;
                    try {
                        const f = (this as any)._wvBootFocusedEntry;
                        const isFocusTarget = !!(f && f.kind === "main-dev"
                            && (f.wvWinId == null || f.wvWinId === win._wvWindowId));
                        const selRec = group.tabs.find((t) => t && t.selected && t.data && t.data.itemID != null);
                        if (!isFocusTarget && selRec) {
                            restoreTabs = group.tabs.map((t) => (t && t.selected) ? { ...t, selected: false } : t);
                            (this as any)._wvDeferSelect(win, selRec.data.itemID);
                            (this as any)._wvTrace("restore: deferred selected-tab load in background window "
                                + ((this as any)._wvWindowName ? (this as any)._wvWindowName(win) : ""));
                        }
                    } catch (e) {}
                    try { tabs.restoreState(restoreTabs); }    // re-add this dev window's own tabs
                    catch (e) { Zotero.debug("[Weavero] dev restore err: " + e); }
                    // Session reconstruct carries this window's library-view state
                    // (collection + items-tree columns/sort); the dev "New Window"
                    // path leaves wvMainState unset, so this is a no-op there.
                    if (group.wvMainState) {
                        try {
                            const plugin = Zotero.Weavero && Zotero.Weavero.plugin;
                            if (plugin && plugin._wvTabSessionApplyMainState) {
                                plugin._wvTabSessionApplyMainState(win, group.wvMainState);
                            }
                        } catch (e) { Zotero.debug("[Weavero] dev wvMainState err: " + e); }
                    }
                } else {
                    try {
                        const cv = win.ZoteroPane && win.ZoteroPane.collectionsView;
                        if (cv && typeof cv.selectLibrary === "function") {
                            cv.selectLibrary(Zotero.Libraries.userLibraryID);
                        }
                    } catch (e) {}
                }
            } catch (e) { Zotero.debug("[Weavero] _wvInitDevMainWindow err: " + e); }
            // Signal that the clean start (closeAll + restore/selectLibrary) is done,
            // so a caller opening a tab into this window can wait it out.
            try { win._wvDevInitDone = true; } catch (e) {}
        };
        const settle = () => {
            if (done) return;
            ticks++;
            // The React tab bar must be MOUNTED before we touch the tab set:
            // `Zotero_Tabs.add` (inside restoreState) dereferences
            // `_tabBarRef.current` and a too-early call THROWS, aborting the
            // restore mid-list (caught live by the restore tracer: 3 of 5 tabs
            // lost). Poll until it exists — same backstop cap below applies.
            let barReady = false;
            try { barReady = !!(win.Zotero_Tabs && win.Zotero_Tabs._tabBarRef && win.Zotero_Tabs._tabBarRef.current); } catch (e) {}
            let n = -1;
            try { n = win.Zotero_Tabs ? win.Zotero_Tabs.getState().length : -1; } catch (e) {}
            if (barReady) {
                // Dev windows open with a CLEARED session, so there's no native restore
                // to wait for — once only the library tab is present, finish immediately
                // (and restoreState the queued tabs) instead of polling ~550ms.
                if (n === 1) { finish(); return; }
                if (n === lastCount) stableTicks++; else { stableTicks = 0; lastCount = n; }
                // Stable for ~2 ticks → native restore done; cap as a backstop.
                if (stableTicks >= 2) { finish(); return; }
            }
            if (ticks >= 60) { finish(); return; }   // ~5s hard backstop
            try { win.setTimeout(settle, 80); } catch (e) { finish(); }
        };
        try { win.setTimeout(settle, 50); } catch (e) { finish(); }
    }

    // ---- Unified Weavero WINDOW store (Phase 1: dev main windows) ---------
    // One Weavero-owned store + recreation path for non-primary managed
    // *windows* — Weavero reopens them on the next launch. NOT the user-facing
    // "tab sessions" feature (that's modules/sessions.ts, `_wvTabSession*`,
    // file `tab-sessions.json`); this is internal window-restore plumbing.
    // Phase 1 covers dev main windows (spawned via the hidden devNewMainWindow
    // feature); separate reader windows keep their own persistence
    // (reader-tab-windows.json) until Phase 2 folds them in here.
    // Store: <data dir>/weavero/windows.json, v4 = { windows: [ {kind, tabs} ] }.
    // (Renamed from the legacy `session.json` in v0.14.7 — `_wvWindowStoreReadText`
    // still reads the old name so an in-flight restore survives the upgrade.)

    _wvWindowStoreDir() {
        return PathUtils.join(Zotero.DataDirectory.dir, "weavero");
    }

    _wvWindowStorePath() {
        return PathUtils.join(this._wvWindowStoreDir(), "windows.json");
    }

    /** Read the window-store file as text, falling back to the legacy
     *  `session.json` name (renamed to `windows.json` in v0.14.7). Returns
     *  null when neither exists / is readable. */
    async _wvWindowStoreReadText() {
        try { return await Zotero.File.getContentsAsync(this._wvWindowStorePath()); }
        catch (e) { /* try legacy name */ }
        try {
            return await Zotero.File.getContentsAsync(
                PathUtils.join(this._wvWindowStoreDir(), "session.json"));
        } catch (e) { /* neither present */ }
        return null;
    }

    /** Wrap this window's `Zotero_Tabs.getState` so transient `-loading` tab
     *  types serialize as their BASE type. Zotero flips a lazy tab to
     *  `note-loading` / `reader-loading` while its load hook runs and only
     *  renames it on completion — if the session is captured mid-load (or the
     *  load hook stalls, as a background window's note tab can), the transient
     *  type lands in session.json verbatim, and `restoreState` (which
     *  dispatches on exact type names: library/reader/note) silently DROPS the
     *  tab on the next startup. Observed as a lost selected note tab in the
     *  restart-reliability protocol (work/restart-test/, run 1). Fixes BOTH
     *  Zotero's native session capture (anchor window) and Weavero's own
     *  managed-window capture below, which share getState. Idempotent. */
    _wvPatchTabsGetState(win: any) {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z) return;
            // Version-based re-wrap: a plugin reload must replace an older
            // wrap (the flag-guard once left a pre-takeover wrap in place and
            // the quit save recorded a full session). Always wrap from the
            // stored ORIGINAL, never over a previous wrap.
            if (Z._wvGetStatePatchVer === 2) return;
            if (!Z._wvGetStateOrig) Z._wvGetStateOrig = Z.getState.bind(Z);
            const orig = Z._wvGetStateOrig;
            // Full, normalized capture — what Weavero's OWN store records.
            Z._wvGetStateFull = function () {
                const state = orig();
                try {
                    for (const t of (state || [])) {
                        if (t && typeof t.type === "string" && t.type.endsWith("-loading")) {
                            t.type = t.type.replace(/-loading$/, "");
                        }
                    }
                } catch (e) {}
                return state;
            };
            // The public getState stays FULL (normalized): the anchor's tabs
            // remain in Zotero's session so a Troubleshooting-Mode start (or a
            // Weavero-disabled boot) still restores the main workspace
            // natively. Only the READER-WINDOW half of the restore is taken
            // over (see _wvPatchReaderGetWindowStates) — those are
            // Weavero-only content already.
            Z.getState = Z._wvGetStateFull;
            Z._wvGetStatePatchVer = 2;
        } catch (e) { Zotero.debug("[Weavero] _wvPatchTabsGetState err: " + e); }
    }

    /** RESTORE TAKEOVER, reader-window half: at quit, Zotero's session save
     *  records NO reader windows — Weavero reopens them all itself at boot
     *  (in parallel, held behind the focused tab, Firefox-style), so no
     *  window can start rendering before the plugin is even loaded. Their
     *  multi-tab content is Weavero-only anyway, so a Troubleshooting-Mode
     *  boot loses nothing it could have used; the windows return on the next
     *  normal start. Keyed on the quitting flag alone (internal captures use
     *  the direct reader-window enumeration, never this). */
    _wvPatchReaderGetWindowStates() {
        try {
            const R: any = (Zotero as any).Reader;
            if (!R || typeof R.getWindowStates !== "function") return;
            // Version-based re-wrap from the stored ORIGINAL (a plain guard
            // once left a stale pre-reload wrap installed).
            if (R._wvGWSPatchVer === 3) return;
            if (!R._wvGWSOrig) R._wvGWSOrig = R.getWindowStates;
            const orig = R._wvGWSOrig;
            R.getWindowStates = function () {
                try {
                    // Gecko's own shutdown flag — no dependence on observer
                    // ordering (Zotero's quit save can run before ANY of our
                    // quit observers; `quit-application-requested` doesn't even
                    // fire on the restart path).
                    const shuttingDown = (() => { try { return Services.startup.shuttingDown; } catch (e) { return false; } })();
                    const ns: any = (Zotero as any).Weavero;
                    const lp: any = (ns && ns.plugin) || null;
                    const quitting = shuttingDown || (lp && lp._wvQuitting) || (ns && ns._quitting);
                    if (quitting) return [];
                } catch (e) {}
                return orig.apply(this, arguments);
            };
            R._wvGWSPatchVer = 3;
        } catch (e) { Zotero.debug("[Weavero] _wvPatchReaderGetWindowStates err: " + e); }
    }

    /** Sync snapshot of every currently-open dev main window. Stores each
     *  window's full `Zotero_Tabs.getState()` (same shape Zotero's own pane
     *  session uses), so restore round-trips via `Zotero_Tabs.restoreState`.
     *  Cheap + synchronous → safe to call from the quit observer. */
    _wvWindowStoreCaptureDevWindows() {
        const groups: any[] = [];
        try {
            const en = Services.wm.getEnumerator("navigator:browser");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (!w || !w._wvManagedWindow) continue;
                let tabs = null;
                try {
                    const Z = w.Zotero_Tabs;
                    tabs = Z && (Z._wvGetStateFull ? Z._wvGetStateFull() : Z.getState());
                } catch (e) {}
                if (!tabs || tabs.length < 2) continue;   // library tab only → nothing to restore
                // Persist the window's stable id so its items-tree column layout
                // can be re-bound to the same window on the next restart. Also
                // the library-view state (selected collection + column/sort) —
                // `_wvInitDevMainWindow` already applies `wvMainState`, the
                // capture just never provided it outside session-switches.
                let wvMainState: any;
                try {
                    const ms = (this as any)._wvTabSessionCaptureMainState
                        ? (this as any)._wvTabSessionCaptureMainState(w) : null;
                    if (ms && (ms.collection || ms.columnPrefs)) wvMainState = ms;
                } catch (e) {}
                groups.push({ kind: "main-dev", tabs, wvWinId: (w._wvWindowId != null ? w._wvWindowId : null),
                    geom: (this as any)._wvWindowGeom(w), wvMainState });
            }
        } catch (e) { Zotero.debug("[Weavero] _wvWindowStoreCaptureDevWindows err: " + e); }
        return groups;
    }

    /** Issue an atomic write of the store doc (chained so writes serialise). */
    _wvWindowStoreWrite(doc) {
        try {
            const dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero");
            const path = this._wvWindowStorePath();
            this._wvWindowStoreWriteChain = (this._wvWindowStoreWriteChain || Promise.resolve())
                .then(async () => {
                    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                    await IOUtils.writeUTF8(path, JSON.stringify(doc, null, 2), { tmpPath: path + ".tmp" });
                })
                .catch((e: any) => Zotero.debug("[Weavero] _wvWindowStoreWrite err: " + e));
            return this._wvWindowStoreWriteChain;
        } catch (e) { Zotero.debug("[Weavero] _wvWindowStoreWrite err: " + e); }
    }

    /** Synchronous capture + issue write. Safe from `quit-application-granted`:
     *  capture is sync; the IOUtils write is flushed by Gecko's profile-before-
     *  change I/O barrier as long as it's *issued* here (no awaits before it). */
    /** Which window has focus — restored at the end of the startup chain so
     *  the user lands where they left off (anchor / managed main / reader). */
    _wvWindowStoreFocusDescriptor() {
        try {
            const fw: any = Services.wm.getMostRecentWindow(null);
            if (!fw) return null;
            const type = fw.document && fw.document.documentElement
                && fw.document.documentElement.getAttribute("windowtype");
            if (type === "zotero:reader") {
                const st = fw._wvWT;
                const nat = st && st.tabs && st.tabs.find((t: any) => t.native && t.itemID != null);
                const first = st && st.tabs && st.tabs.find((t: any) => t.itemID != null);
                const iid = (nat && nat.itemID) != null ? nat.itemID : (first && first.itemID);
                return (iid != null) ? { kind: "reader", itemID: iid } : null;
            }
            if (type === "navigator:browser") {
                return fw._wvManagedWindow
                    ? { kind: "main-dev", wvWinId: (fw._wvWindowId != null ? fw._wvWindowId : null) }
                    : { kind: "anchor" };
            }
            return null;
        } catch (e) { return null; }
    }

    /** The ANCHOR window's full tab set — the RESTORE TAKEOVER's other half:
     *  Zotero's own session keeps only the library tab, so Weavero must carry
     *  the real list (captured on every save, crash-fresh like the rest). */
    _wvWindowStoreCaptureAnchor() {
        try {
            const w: any = (Zotero.getMainWindows() || []).find((x: any) => !x._wvManagedWindow);
            if (!w || !w.Zotero_Tabs) return null;
            const Z = w.Zotero_Tabs;
            const tabs = Z._wvGetStateFull ? Z._wvGetStateFull() : Z.getState();
            if (!tabs || tabs.length < 2) return null;
            let wvMainState: any;
            try {
                const ms = (this as any)._wvTabSessionCaptureMainState
                    ? (this as any)._wvTabSessionCaptureMainState(w) : null;
                if (ms && (ms.collection || ms.columnPrefs)) wvMainState = ms;
            } catch (e) {}
            return { kind: "main-anchor", tabs, geom: (this as any)._wvWindowGeom(w), wvMainState };
        } catch (e) { return null; }
    }

    _wvWindowStoreSaveSync() {
        // Once quitting, ONLY the quit flush writes (teardown-triggered saves
        // would capture a half-closed world and clobber the final state —
        // Firefox: SessionSaver ignores saves while RunState.isQuitting).
        if (this._wvWindowStoreFrozen || (this as any)._wvQuitting) return;
        // Unified doc: anchor + dev main windows + reader windows in one file,
        // captured together on every save so nothing clobbers anything.
        const anchor = this._wvWindowStoreCaptureAnchor();
        this._wvWindowStoreWrite({ version: 4, windows: [
            ...(anchor ? [anchor] : []),
            ...this._wvWindowStoreCaptureDevWindows(),
            ...this._wvWindowStoreCaptureReaderWindows(),
        ], focused: this._wvWindowStoreFocusDescriptor() });
    }

    /** Debounced save — coalesces churn (e.g. closing a dev window). */
    _wvWindowStoreSaveDebounced() {
        if (this._wvWindowStoreFrozen || (this as any)._wvQuitting) return;
        try {
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            const clearT = (win && win.clearTimeout) ? win.clearTimeout.bind(win) : clearTimeout;
            if (this._wvWindowStoreSaveTimer) { try { clearT(this._wvWindowStoreSaveTimer); } catch (e) {} }
            this._wvWindowStoreSaveTimer = setT(() => {
                this._wvWindowStoreSaveTimer = null;
                try { this._wvWindowStoreSaveSync(); } catch (e) {}
            }, 400);
        } catch (e) { try { this._wvWindowStoreSaveSync(); } catch (e2) {} }
    }

    /** Read + parse the store; returns the windows array (empty on missing). */
    async _wvWindowStoreLoad() {
        try {
            const text: any = await this._wvWindowStoreReadText();
            const doc = text ? JSON.parse(text) : null;
            if (doc && Array.isArray(doc.windows)) {
                // Stash the focused descriptor here too — this loader can run
                // before the reader restore-map loader that also stashes it,
                // and the dev-window spawn queue sorts by it.
                try { if (doc.focused && !(this as any)._wvBootFocusedEntry) (this as any)._wvBootFocusedEntry = doc.focused; } catch (e) {}
                return doc.windows;
            }
        } catch (e) { /* missing/unreadable → none */ }
        return [];
    }

    /** Recreate previously-open dev main windows from the store, gated by the
     *  prefs (`devNewMainWindow` on — see prefs.html — AND the still-hidden
     *  `devSessionAutoReopen` ≠ false).
     *  Queues the saved groups and spawns windows one at a time, chained off
     *  each window's load (no timing races); Weavero owning the recreation is
     *  what resolves window↔group identity, Firefox-style. */
    async _wvWindowStoreRestoreDevWindows() {
        try {
            if (this._wvWindowStoreDevRestored) return;
            this._wvWindowStoreDevRestored = true;
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
            const groups = (await this._wvWindowStoreLoad())
                .filter((g: any) => g && g.kind === "main-dev" && g.tabs && g.tabs.length > 1);
            if (!groups.length) return;
            // FOCUSED-FIRST: when the quit-time focus was a managed window,
            // spawn that one before its siblings so the user's window is
            // usable while the rest assemble in the background.
            try {
                const f = (this as any)._wvBootFocusedEntry;
                if (f && f.kind === "main-dev" && f.wvWinId != null && groups.length > 1) {
                    groups.sort((a: any, b: any) => ((b.wvWinId === f.wvWinId) ? 1 : 0) - ((a.wvWinId === f.wvWinId) ? 1 : 0));
                }
            } catch (e) {}
            this._wvDevSpawnQueue = groups.slice();
            this._wvSpawnNextDevWindow();
        } catch (e) { Zotero.debug("[Weavero] _wvWindowStoreRestoreDevWindows err: " + e); }
    }

    /** Spawn the next queued dev window. Its `onMainWindowLoad` consumes one
     *  queued group and (if more remain) chains the next spawn. */
    _wvSpawnNextDevWindow() {
        try {
            if (!this._wvDevSpawnQueue || !this._wvDevSpawnQueue.length) return;
            try { (this as any)._wvTrace && (this as any)._wvTrace("restore: spawning dev main window (" + this._wvDevSpawnQueue.length + " queued)"); } catch (e) {}
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

    /** Restore/quit breadcrumbs. Every entry goes to Zotero.debug (visible in
     *  Debug Output) AND an in-memory ring buffer; `_wvTraceFlush` persists the
     *  buffer to `<data>/weavero/trace-<tag>.json` (quit-side events would
     *  otherwise be unreadable after the process dies). Timestamps are
     *  relative to the first entry, so startup phases read as offsets. */
    _wvTrace(msg: string) {
        try {
            if (!this._wvTraceLog) { this._wvTraceLog = []; this._wvTraceT0 = Date.now(); }
            const rel = Date.now() - this._wvTraceT0;
            this._wvTraceLog.push({ t: rel, m: msg });
            if (this._wvTraceLog.length > 1500) this._wvTraceLog.splice(0, 500);
            Zotero.debug("[Weavero][trace] +" + rel + "ms " + msg);
        } catch (e) {}
    }

    /** Persist the trace buffer (fire-and-forget; same write mechanism as the
     *  window store, so a quit-time flush rides the shutdown I/O barrier). */
    _wvTraceFlush(tag: string) {
        try {
            if (!this._wvTraceLog || !this._wvTraceLog.length) return;
            const dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero");
            const path = PathUtils.join(dir, "trace-" + tag + ".json");
            const body = JSON.stringify({ t0: this._wvTraceT0, entries: this._wvTraceLog }, null, 1);
            (async () => {
                try {
                    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                    await IOUtils.writeUTF8(path, body, { tmpPath: path + ".tmp" });
                } catch (e) {}
            })();
        } catch (e) {}
    }

    /** Stash the PROFILE session.json (what Zotero saved at last quit) before
     *  anything can overwrite it — the raw source for the anchor-window
     *  reconciliation below. Fire-and-forget from init(). */
    _wvStashBootSession() {
        if (this._wvBootSessionPromise) return this._wvBootSessionPromise;
        this._wvBootSessionPromise = (async () => {
            try {
                const path = PathUtils.join((Zotero as any).Profile.dir, "session.json");
                const text: any = await Zotero.File.getContentsAsync(path);
                const doc = JSON.parse(String(text));
                // ALL pane windows' tab lists — the reconcile matches the anchor
                // by content overlap. "First pane entry" is not trustworthy: after
                // a CRASH the file is stale and the pane order can differ from
                // what Zotero restored (observed: the anchor got another window's
                // note tab spliced in at that window's index).
                return (doc.windows || [])
                    .filter((w: any) => w && w.type === "pane" && Array.isArray(w.tabs))
                    .map((w: any) => w.tabs);
            } catch (e) { return null; }
        })();
        return this._wvBootSessionPromise;
    }

    /** VERIFY-AND-REPAIR the anchor window's native session restore. Zotero's
     *  `restoreState` (zoteroPane.js, end of makeVisible) runs on the same
     *  `initializationPromise` turn plugin startup awaits — structurally
     *  BEFORE Weavero can harden it — and its loop silently skips any tab
     *  whose item isn't in the memory cache yet (`Zotero.Items.exists` false
     *  during early load; repeatedly dropped a note tab in the restart
     *  protocol). Once startup settles and items are loaded, compare the
     *  anchor's live tabs against the stashed quit-time session and re-add
     *  anything that was dropped, at its saved position, as an unloaded tab. */
    async _wvReconcileAnchorSessionTabs() {
        try {
            if (this._wvAnchorReconciled) return;
            this._wvAnchorReconciled = true;
            const paneLists: any[] = await this._wvStashBootSession();
            if (!paneLists || !paneLists.length) return;
            const anchor: any = (Zotero.getMainWindows() || []).find((w: any) => !w._wvManagedWindow);
            if (!anchor || !anchor.Zotero_Tabs) return;
            const Z = anchor.Zotero_Tabs;
            const live = new Set(Z._tabs.map((t: any) => t.data && t.data.itemID).filter((x: any) => x != null));
            // Pick the saved pane list that best OVERLAPS the anchor's live tabs
            // (majority of its items already present). No majority → the file is
            // stale/ambiguous (e.g. after a crash) — repairing would splice
            // another window's tabs in; skip and say so.
            let saved: any[] | null = null, bestFrac = 0;
            for (const list of paneLists) {
                const ids = (list || []).map((st: any) => st && st.data && st.data.itemID).filter((x: any) => x != null);
                if (!ids.length) continue;
                const frac = ids.filter((id: any) => live.has(id)).length / ids.length;
                if (frac > bestFrac) { bestFrac = frac; saved = list; }
            }
            if (!saved || saved.length < 2 || bestFrac < 0.5) {
                (this as any)._wvTrace("reconcile: no saved pane list matches the anchor (best overlap "
                    + Math.round(bestFrac * 100) + "%) — skipping repair");
                return;
            }
            let added = 0;
            for (let i = 0; i < saved.length; i++) {
                const st = saved[i];
                const iid = st && st.data && st.data.itemID;
                if (iid == null || live.has(iid)) continue;   // (a same-window dup pair is matched once — acceptable)
                const base = String(st.type || "").replace(/-(unloaded|loading)$/, "");
                if (base !== "reader" && base !== "note") continue;
                try {
                    await Zotero.Items.getAsync(iid);          // force the item into the cache
                    if (!Zotero.Items.exists(iid)) continue;   // genuinely gone → stay dropped
                    // Keep the saved selection: the dropped tab is usually the one
                    // the user was ON at quit (a selected note is the chronic native
                    // drop) — re-adding it unselected left focus on a neighbor.
                    Z.add({ type: base + "-unloaded", title: st.title || "", index: Math.min(i, Z._tabs.length), data: st.data, select: !!st.selected });
                    live.add(iid);
                    added++;
                    (this as any)._wvTrace("reconcile: re-added dropped " + base + " tab (item " + iid + ") at index " + i);
                } catch (e) {}
            }
            (this as any)._wvTrace(added
                ? ("reconcile: restored " + added + " tab(s) the native anchor restore dropped")
                : "reconcile: anchor matches the saved session");
        } catch (e) { Zotero.debug("[Weavero] _wvReconcileAnchorSessionTabs err: " + e); }
    }

    /** Hide the title-bar row BEFORE first paint when the compact-title-bar
     *  feature is on — otherwise every restored window flashes the full title
     *  bar/menubar until the (late) compact setup collapses it. Injects only
     *  the hiding CSS + attribute; the full setup (button-box moves, Alt
     *  wiring) still runs later and is idempotent about these. */
    _wvEarlyHideTitleBar(w: any) {
        try {
            const doc = w && w.document;
            if (!doc || !doc.documentElement) return;
            const type = doc.documentElement.getAttribute("windowtype");
            const HTML_NS = "http://www.w3.org/1999/xhtml";
            if (type === "navigator:browser" && (this as any)._getCompactTitleBarMain && (this as any)._getCompactTitleBarMain()) {
                if (!doc.getElementById("wv-early-compact-css")) {
                    const st = doc.createElementNS(HTML_NS, "style");
                    st.id = "wv-early-compact-css";
                    st.textContent = "#toolbar-menubar[wv-compact-hidden='true']{height:0!important;min-height:0!important;overflow:hidden!important}"
                        + "#titlebar:has(#toolbar-menubar[wv-compact-hidden='true']){height:0!important;min-height:0!important;overflow:hidden!important;border-width:0!important}";
                    doc.documentElement.appendChild(st);
                }
                const mb = doc.getElementById("toolbar-menubar");
                if (mb) mb.setAttribute("wv-compact-hidden", "true");
                this._wvTrace && this._wvTrace("early: main-window title bar hidden at DOMContentLoaded");
            }
            else if (type === "zotero:reader" && (this as any)._getCompactTitleBarReader && (this as any)._getCompactTitleBarReader()) {
                try { (this as any)._ensureReaderCompactMenubarStyles(doc); } catch (e) {}
                const mb = doc.querySelector("menubar");
                if (mb) mb.setAttribute("wv-compact-hidden", "true");
                this._wvTrace && this._wvTrace("early: reader-window menubar hidden at DOMContentLoaded");
            }
        } catch (e) {}
    }

    /** VERIFY-AND-REPAIR for MANAGED main windows, against the boot-time copy
     *  of windows.json. Runs at guard-lift (late) because other plugins mutate
     *  tabs during window load — observed live: Better Notes'
     *  `updateExistingNoteTabs` closes every note tab to re-open it through
     *  `Zotero.Notes.open`, which targets `Zotero.getMainWindow()` and can
     *  throw for a secondary window → BN swallows the error and the note tab
     *  is simply GONE (run 13 lost a grouped note this way). Group stamps ride
     *  along in tab.data.wvGroupId, so re-adding restores membership too. */
    async _wvReconcileManagedWindows() {
        try {
            if (this._wvManagedReconciled) return;
            this._wvManagedReconciled = true;
            const doc = (this as any)._wvBootWindowStoreDoc;
            const entries = ((doc && doc.windows) || []).filter((g: any) =>
                g && (g.kind === "main-dev" || g.kind === "main-anchor") && Array.isArray(g.tabs));
            for (const entry of entries) {
                const win: any = (Zotero.getMainWindows() || []).find((w: any) => (entry.kind === "main-anchor")
                    ? !w._wvManagedWindow
                    : (w._wvManagedWindow && (entry.wvWinId == null || w._wvWindowId === entry.wvWinId)));
                if (!win || !win.Zotero_Tabs) continue;
                const Z = win.Zotero_Tabs;
                const live = new Set(Z._tabs.map((t: any) => t.data && t.data.itemID).filter((x: any) => x != null));
                let added = 0;
                for (let i = 0; i < entry.tabs.length; i++) {
                    const st = entry.tabs[i];
                    const iid = st && st.data && st.data.itemID;
                    if (iid == null || live.has(iid)) continue;
                    const base = String(st.type || "").replace(/-(unloaded|loading)$/, "");
                    if (base !== "reader" && base !== "note") continue;
                    try {
                        await Zotero.Items.getAsync(iid);
                        if (!Zotero.Items.exists(iid)) continue;
                        Z.add({ type: base + "-unloaded", title: st.title || "", index: Math.min(i, Z._tabs.length), data: st.data, select: !!st.selected });
                        live.add(iid);
                        added++;
                        (this as any)._wvTrace("reconcile: re-added dropped " + base + " tab (item " + iid + ") in managed window");
                    } catch (e) {}
                }
                if (added) {
                    try { (this as any)._wvTabGroupStabilize(win); (this as any)._applyTabGroups(win); } catch (e) {}
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReconcileManagedWindows err: " + e); }
    }

    /** RESTORE TAKEOVER, boot half: Zotero natively restored only the library
     *  tab (see the getState wrap) — rebuild the anchor's real tab set from
     *  the store's `main-anchor` entry. Merge-style (skip itemIDs already
     *  live), so a CRASH boot — where Zotero restored its own full session
     *  from the last periodic save — just fills gaps. The saved selection
     *  loads immediately when the anchor is the quit-time focused window,
     *  else it defers to first activate like any background window. */
    async _wvRestoreAnchorTabs() {
        try {
            if (this._wvAnchorTabsRestored) return;
            this._wvAnchorTabsRestored = true;
            const doc = (this as any)._wvBootWindowStoreDoc;
            const entry = ((doc && doc.windows) || []).find((g: any) => g && g.kind === "main-anchor" && Array.isArray(g.tabs));
            if (!entry) return;   // pre-takeover store → Zotero restored natively
            const win: any = (Zotero.getMainWindows() || []).find((w: any) => !w._wvManagedWindow);
            if (!win || !win.Zotero_Tabs) return;
            const Z = win.Zotero_Tabs;
            const f = (this as any)._wvBootFocusedEntry;
            const anchorFocused = !f || f.kind === "anchor";   // default to anchor
            const live = new Set(Z._tabs.map((t: any) => t.data && t.data.itemID).filter((x: any) => x != null));
            let added = 0, deferItem = null, selectNow = null;
            for (let i = 0; i < entry.tabs.length; i++) {
                const st = entry.tabs[i];
                const iid = st && st.data && st.data.itemID;
                if (iid == null || live.has(iid)) continue;
                const base = String(st.type || "").replace(/-(unloaded|loading)$/, "");
                if (base !== "reader" && base !== "note") continue;
                try {
                    await Zotero.Items.getAsync(iid);
                    if (!Zotero.Items.exists(iid)) continue;
                    Z.add({ type: base + "-unloaded", title: st.title || "", index: Math.min(i, Z._tabs.length), data: st.data, select: false });
                    live.add(iid);
                    added++;
                    if (st.selected) { if (anchorFocused) selectNow = iid; else deferItem = iid; }
                } catch (e) {}
            }
            if (selectNow != null) {
                try { const t = Z._tabs.find((x: any) => x.data && x.data.itemID === selectNow); if (t) Z.select(t.id); } catch (e) {}
            } else if (deferItem != null) {
                try { (this as any)._wvDeferSelect(win, deferItem); } catch (e) {}
            }
            (this as any)._wvTrace("restore: anchor tabs rebuilt from store — " + added + " tab(s)"
                + (selectNow != null ? ", selected loading" : (deferItem != null ? ", selection deferred" : "")));
            try { (this as any)._wvTabGroupStabilize(win); (this as any)._applyTabGroups(win); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvRestoreAnchorTabs err: " + e); }
    }

    /** Wire the restore hardening/tracing on main windows as EARLY as their
     *  DOM exists — including the boot-time anchor window, which loads while
     *  plugin startup is still in flight (both `onMainWindowLoad` and the
     *  late init loop can miss it, leaving its native session restore
     *  unhardened). Registered synchronously from init(); the wm listener
     *  covers windows opened later, the immediate sweep covers ones already
     *  open in any load state. Also hides the title bar pre-paint (see above). */
    _wvWireEarlyRestoreTracing() {
        try {
            if (this._wvEarlyRestoreListener) return;
            const self = this;
            const tryWire = (w: any) => {
                try { if (w && w.Zotero_Tabs) self._wvWireRestoreTracing(w); return !!(w && w.Zotero_Tabs); } catch (e) { return false; }
            };
            const wireWhenReady = (w: any) => {
                try { self._wvEarlyHideTitleBar(w); } catch (e) {}
                if (tryWire(w)) return;
                const onDCL = () => {
                    try { w.removeEventListener("DOMContentLoaded", onDCL); } catch (e) {}
                    try { self._wvEarlyHideTitleBar(w); } catch (e) {}
                    try {
                        if (String(w.location && w.location.href).indexOf("zoteroPane.xhtml") !== -1) tryWire(w);
                    } catch (e) {}
                };
                try { w.addEventListener("DOMContentLoaded", onDCL); } catch (e) {}
            };
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) wireWhenReady(en.getNext());
            const listener: any = {
                onOpenWindow(xul: any) {
                    try { wireWhenReady(xul.docShell.domWindow); } catch (e) {}
                },
                onCloseWindow() {},
            };
            Services.wm.addListener(listener);
            this._wvEarlyRestoreListener = listener;
        } catch (e) { Zotero.debug("[Weavero] _wvWireEarlyRestoreTracing err: " + e); }
    }

    _wvUnwireEarlyRestoreTracing() {
        try {
            if (this._wvEarlyRestoreListener) {
                Services.wm.removeListener(this._wvEarlyRestoreListener);
                this._wvEarlyRestoreListener = null;
            }
        } catch (e) {}
    }

    /** Log-only wraps around this window's `Zotero_Tabs.restoreState` / `close`
     *  — the direct witnesses for restore-time tab loss (what types went IN to
     *  restoreState, which handler dropped what, and who closes tabs during the
     *  first minute). Idempotent per window; negligible steady-state cost. */
    _wvWireRestoreTracing(win: any) {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z || Z._wvRestoreTraceWired) return;
            Z._wvRestoreTraceWired = true;
            const self = this;
            const name = () => { try { return self._wvWindowName(win); } catch (e) { return "?"; } };
            const origRestore = Z.restoreState.bind(Z);
            Z.restoreState = async function (tabs: any) {
                try { self._wvTrace("restoreState[" + name() + "] IN: " + (tabs || []).map((t: any) => t.type + (t.selected ? "*" : "")).join(",")); } catch (e) {}
                // HARDENED per-tab restore. Upstream's loop awaits each type
                // hook in sequence and a single throw aborts the WHOLE list —
                // every later tab is silently dropped (caught live: a managed
                // window lost 3 of 5 tabs to one early `_tabBarRef` error; a
                // selected note tab, last in the saved order, vanished the same
                // way). Replicate the same loop with per-tab isolation + ONE
                // deferred retry for failures; fall back to the original when
                // the hook API isn't there (older Zotero).
                if (Z.tabHooks && Z.parseTabType && Z._getHook) {
                    const itemIDs: any[] = [];
                    const failed: any[] = [];
                    const runOne = async (tab: any, i: number) => {
                        const { tabContentType } = Z.parseTabType(tab.type);
                        const hook = Z._getHook(tabContentType, "restoreState");
                        const r = await hook(tab, i);
                        if (r && r.itemID) itemIDs.push(r.itemID);
                        // A tab that CARRIES an item but produced none was silently
                        // skipped by the hook — during early startup that's usually
                        // `Zotero.Items.exists()` returning false because the item
                        // cache hasn't loaded yet (dropped a note tab in runs 1/2/5).
                        // Surface it as a failure so the retry pass force-loads it.
                        const wanted = tab && tab.data && tab.data.itemID;
                        if (wanted && !(r && r.itemID)) throw new Error("item " + wanted + " not available (cache not loaded yet?)");
                    };
                    for (let i = 0; i < (tabs || []).length; i++) {
                        try { await runOne(tabs[i], i); }
                        catch (e) { failed.push(tabs[i]); self._wvTrace("restoreState[" + name() + "] tab " + i + " (" + (tabs[i] && tabs[i].type) + ") failed: " + e); }
                    }
                    if (failed.length) {
                        await new Promise((res) => { try { win.setTimeout(res, 1500); } catch (e) { res(null); } });
                        for (const tab of failed) {
                            try {
                                // Force-load the item into the cache first — the usual
                                // failure is a too-early Zotero.Items.exists() miss.
                                try { if (tab.data && tab.data.itemID) await Zotero.Items.getAsync(tab.data.itemID); } catch (e2) {}
                                await runOne(tab, Z._tabs.length);
                                self._wvTrace("restoreState[" + name() + "] retry OK: " + tab.type);
                            }
                            catch (e) { self._wvTrace("restoreState[" + name() + "] retry FAILED (" + tab.type + "): " + e); }
                        }
                    }
                    Z._prevSelectedID = null;
                    try {
                        const items = await Zotero.Items.getAsync(itemIDs.filter((x: any) => x));
                        await Zotero.Items.loadDataTypes(items);
                    } catch (e) {}
                    try { self._wvTrace("restoreState[" + name() + "] OUT: " + Z._tabs.map((t: any) => t.type).join(",")); } catch (e) {}
                    return;
                }
                let r;
                try { r = await origRestore(tabs); }
                catch (e) { self._wvTrace("restoreState[" + name() + "] THREW: " + e); throw e; }
                try { self._wvTrace("restoreState[" + name() + "] OUT: " + Z._tabs.map((t: any) => t.type).join(",")); } catch (e) {}
                return r;
            };
            const wiredAt = Date.now();
            const origClose = Z.close.bind(Z);
            Z.close = function (ids: any) {
                try {
                    if (Date.now() - wiredAt < 90000) {
                        const stack = String(new Error().stack || "").split("\n").slice(1, 4).join(" <- ");
                        self._wvTrace("close[" + name() + "]: " + JSON.stringify(ids) + " via " + stack);
                    }
                } catch (e) {}
                return origClose(ids);
            };
            // Tab CONTENT loads (the slow phase, distinct from structure
            // restore): markAsLoaded fires when a lazy tab's load hook
            // resolves — trace each so the timeline separates "windows +
            // groups present" from "tab content loaded".
            if (typeof Z.markAsLoaded === "function") {
                const origMark = Z.markAsLoaded.bind(Z);
                Z.markAsLoaded = function (id: any) {
                    const r = origMark(id);
                    try {
                        const t = Z._tabs.find((x: any) => x.id === id);
                        self._wvTrace("tab-loaded[" + name() + "]: " + (t ? t.type : id));
                        // Self-heal stale tab titles on load. A tab created with a
                        // wrong explicit title (e.g. an attachment's own "Full Text
                        // PDF") keeps it FOREVER — Zotero's updateTitle only fires
                        // on item-metadata changes, and reader.updateTitle() alone
                        // doesn't repaint the strip label; Zotero_Tabs.rename does.
                        // A NOTE tab finishing its load is exactly when its
                        // editor document exists — sweep the note-link wiring
                        // now (the boot sweep runs before restored editors
                        // exist, and BN's editor rebuild can swap the iframe
                        // at times no MutationObserver batch flags).
                        if (t && String(t.type).indexOf("note") === 0) {
                            win.setTimeout(() => { try { self._processNoteEditors(win.document); } catch (e) {} }, 400);
                            win.setTimeout(() => { try { self._processNoteEditors(win.document); } catch (e) {} }, 2500);
                        }
                        const iid = t && t.data && t.data.itemID;
                        const it: any = iid && Zotero.Items.get(iid);
                        if (it && typeof it.getTabTitle === "function") {
                            it.getTabTitle().then((title: string) => {
                                try {
                                    const t2 = Z._tabs.find((x: any) => x.id === id);
                                    if (title && t2 && t2.title !== title) {
                                        Z.rename(id, title);
                                        self._wvTrace("title self-heal[" + name() + "]: " + String(title).slice(0, 50));
                                    }
                                } catch (e) {}
                            }).catch(() => {});
                        }
                    } catch (e) {}
                    return r;
                };
            }
            // Stuck-loading WATCHDOG: if a selected tab still shows `-loading`
            // 6 s after its select, the load hook died silently (e.g. the
            // Notes.open wrong-window bug, patched separately, or any future
            // wedge) — reset to `-unloaded` and re-drive the select once.
            const origSelect = Z.select.bind(Z);
            Z.select = function (id: any, reopening?: any, opts?: any) {
                const r = origSelect(id, reopening, opts);
                try {
                    win.setTimeout(() => {
                        try {
                            const t = Z._tabs.find((x: any) => x.id === id);
                            if (!t || Z.selectedID !== id) return;
                            if (!String(t.type).endsWith("-loading")) return;
                            if (t._wvWatchdogRetried) return;   // one retry only
                            t._wvWatchdogRetried = true;
                            t.type = String(t.type).replace(/-loading$/, "-unloaded");
                            // A retry can only succeed when THIS window is the most
                            // recent one (ReaderTab resolves its container there);
                            // otherwise show the library tab and re-defer the load
                            // to the window's next activate.
                            const front = (() => { try { return Services.wm.getMostRecentWindow("navigator:browser") === win; } catch (e) { return true; } })();
                            if (front) {
                                self._wvTrace("watchdog[" + name() + "]: tab " + id + " stuck — retrying load");
                                origSelect("zotero-pane");
                                win.setTimeout(() => { try { origSelect(id); } catch (e) {} }, 80);
                            } else {
                                self._wvTrace("watchdog[" + name() + "]: tab " + id + " stuck in a background window — re-deferring to activate");
                                origSelect("zotero-pane");
                                try { self._wvDeferSelect(win, t.data && t.data.itemID); } catch (e) {}
                            }
                        } catch (e) {}
                    }, 6000);
                } catch (e) {}
                return r;
            };
        } catch (e) {}
    }

    /** Zotero.Notes.open hardcodes `Zotero.getMainWindow()` (the most recently
     *  focused main window) — with MULTIPLE main windows, loading a note tab
     *  that lives in another window makes `document.getElementById(tabID)`
     *  return null there, the load hook rejects silently, and the tab sticks
     *  at "note-loading" forever (upstream zotero/xpcom/data/notes.js:49; hit
     *  repeatedly in the restart protocol). Wrap: resolve the tab's OWNING
     *  window and point getMainWindow at it for the duration of the call. */
    _wvPatchNotesOpenForMultiWindow() {
        try {
            const N: any = (Zotero as any).Notes;
            if (!N || typeof N.open !== "function" || N._wvOpenPatched) return;
            const orig = N.open;
            N.open = async function (_itemID: any, _location: any, opts: any) {
                let owner: any = null;
                try {
                    const tabID = opts && opts.tabID;
                    if (tabID) {
                        for (const w of Zotero.getMainWindows()) {
                            const Zt = (w as any).Zotero_Tabs;
                            if (Zt && Zt._tabs && Zt._tabs.some((t: any) => t.id === tabID)) { owner = w; break; }
                        }
                    }
                } catch (e) {}
                const zAny: any = Zotero;
                if (!owner || owner === zAny.getMainWindow()) return orig.apply(this, arguments);
                // Temporary, restored in finally; other getMainWindow callers in
                // this narrow window get the owning window — harmless for the
                // rare mid-load overlap, and strictly better than a wedged tab.
                const origGMW = zAny.getMainWindow;
                zAny.getMainWindow = () => owner;
                try { return await orig.apply(this, arguments); }
                finally { zAny.getMainWindow = origGMW; }
            };
            N._wvOpenPatched = true;
        } catch (e) { Zotero.debug("[Weavero] _wvPatchNotesOpenForMultiWindow err: " + e); }
        // Zotero.Reader.open has the IDENTICAL hardcoded-getMainWindow flaw
        // (xpcom/reader.js): loading a reader tab that lives in a background
        // main window resolves the tab container in the focused window → the
        // load hook dies silently and the tab wedges at "reader-loading"
        // (validated live via the deferred-load idle warmer). Same fix.
        try {
            const R: any = (Zotero as any).Reader;
            if (!R || typeof R.open !== "function" || R._wvOpenPatched) return;
            const origR = R.open;
            R.open = async function (_itemID: any, _location: any, opts: any) {
                let owner: any = null;
                try {
                    const tabID = opts && opts.tabID;
                    if (tabID) {
                        for (const w of Zotero.getMainWindows()) {
                            const Zt = (w as any).Zotero_Tabs;
                            if (Zt && Zt._tabs && Zt._tabs.some((t: any) => t.id === tabID)) { owner = w; break; }
                        }
                    }
                } catch (e) {}
                const zAny: any = Zotero;
                if (!owner || owner === zAny.getMainWindow()) return origR.apply(this, arguments);
                const origGMW = zAny.getMainWindow;
                zAny.getMainWindow = () => owner;
                try { return await origR.apply(this, arguments); }
                finally { zAny.getMainWindow = origGMW; }
            };
            R._wvOpenPatched = true;
        } catch (e) { Zotero.debug("[Weavero] Reader.open multi-window patch err: " + e); }
    }

    /** FOCUSED-TAB-FIRST content loading: a reader WINDOW cannot open without
     *  rendering its native PDF, so every reopening reader window competes
     *  with the focused window's own tab for CPU. Wrap `Zotero.Reader.open`
     *  during startup: `openInWindow` calls (Zotero's own reopen loop AND
     *  Weavero's preemptive one) queue until the focused window's tab has
     *  loaded — except a window the USER was focused in, which opens
     *  immediately. Released by the shepherd (focused tab loaded / nothing to
     *  load), the guard lift, or an 8 s backstop. */
    _wvHoldReaderWindowOpens() {
        try {
            const R: any = (Zotero as any).Reader;
            if (!R || typeof R.open !== "function" || R._wvHoldWrapped) return;
            this._wvReaderOpenQueue = [];
            this._wvReaderOpenHold = true;
            const self = this;
            const orig = R.open;
            R.open = function (itemID: any, _location: any, opts: any) {
                try {
                    const lp: any = ((Zotero as any).Weavero && (Zotero as any).Weavero.plugin) || self;
                    if (lp._wvReaderOpenHold && opts && opts.openInWindow) {
                        const f = lp._wvBootFocusedEntry;
                        const isFocusedReader = !!(f && f.kind === "reader" && f.itemID === itemID);
                        if (!isFocusedReader) {
                            lp._wvTrace("hold: queued reader-window open for item " + itemID);
                            const args = arguments;
                            const ctx = this;
                            // Cap the hold at 1.5 s FROM THE FIRST QUEUED OPEN:
                            // a short head start for the focused tab, then the
                            // windows come up regardless (the full-load wait
                            // bought ~0.5-1 s but delayed windows by ~2 s).
                            if (!lp._wvReaderOpenCapArmed) {
                                lp._wvReaderOpenCapArmed = true;
                                try {
                                    const w1: any = Zotero.getMainWindow();
                                    ((w1 && w1.setTimeout) ? w1.setTimeout.bind(w1) : setTimeout)(
                                        () => { try { lp._wvReleaseReaderOpens("1.5s cap"); } catch (e) {} }, 1500);
                                } catch (e) {}
                            }
                            return new Promise((resolve) => lp._wvReaderOpenQueue.push(() => resolve(orig.apply(ctx, args))));
                        }
                    }
                } catch (e) {}
                return orig.apply(this, arguments);
            };
            R._wvHoldWrapped = true;
            // Hard backstop from install — the hold must never outlive startup
            // (the 1.5 s cap arms on the first queued open; see the wrap).
            const w0: any = Zotero.getMainWindow();
            ((w0 && w0.setTimeout) ? w0.setTimeout.bind(w0) : setTimeout)(
                () => { try { this._wvReleaseReaderOpens("timeout backstop"); } catch (e) {} }, 10000);
        } catch (e) { Zotero.debug("[Weavero] _wvHoldReaderWindowOpens err: " + e); }
    }

    _wvReleaseReaderOpens(reason: string) {
        try {
            if (!this._wvReaderOpenHold) return;
            this._wvReaderOpenHold = false;
            const q = this._wvReaderOpenQueue || [];
            this._wvReaderOpenQueue = [];
            if (q.length) this._wvTrace("hold released (" + reason + "): opening " + q.length + " reader window(s)");
            for (const run of q) { try { run(); } catch (e) {} }
        } catch (e) {}
    }

    /** DEFERRED tab activation for BACKGROUND windows: restoring a window's
     *  saved selection immediately starts loading its content (PDF render),
     *  so N windows restore = N simultaneous loads competing with the one the
     *  user is actually looking at. Instead the background window keeps its
     *  library tab; the saved selection fires on the window's first `activate`
     *  (the user looks at it) — or from the post-settle idle loader. */
    _wvDeferSelect(win: any, itemID: any) {
        try {
            if (!win || itemID == null) return;
            win._wvDeferredSelectItemID = itemID;
            // Re-arm cleanly: the previous listener was {once} and may have fired.
            if (win._wvDeferredSelectFire) { try { win.removeEventListener("activate", win._wvDeferredSelectFire); } catch (e) {} }
            const self = this;
            const fire = () => {
                try {
                    const iid = win._wvDeferredSelectItemID;
                    if (iid == null) return;
                    win._wvDeferredSelectItemID = null;
                    const Z = win.Zotero_Tabs;
                    const t = Z && Z._tabs.find((x: any) => x.data && x.data.itemID === iid);
                    if (t && Z.selectedID !== t.id) {
                        Z.select(t.id);
                        self._wvTrace("deferred select: loading " + t.type + " in " + self._wvWindowName(win));
                    }
                } catch (e) {}
            };
            win._wvDeferredSelectFire = fire;
            win.addEventListener("activate", fire, { once: true });
        } catch (e) {}
    }

    /** Post-settle idle loader — READER windows only. Main-window deferred
     *  selections CANNOT be warmed in the background: Zotero's ReaderTab
     *  constructor resolves its tab container via
     *  `Services.wm.getMostRecentWindow('navigator:browser')` (not even
     *  getMainWindow), so loading a tab in a non-focused main window throws
     *  `_tabContainer is null` and wedges at `reader-loading` (validated
     *  live; upstream-reportable). Those load on the window's first activate
     *  — which is both correct-by-construction and exactly "when the user
     *  looks at it". Reader-window deferred tabs use Weavero's own mount
     *  machinery (window-correct), so warming them here is safe. */
    _wvIdleLoadDeferred() {
        try {
            const targets: any[] = [];
            try {
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) {
                    const w: any = en.getNext();
                    if (w._wvWTDeferredFire && w._wvWTDeferredActiveId != null) targets.push(w._wvWTDeferredFire);
                }
            } catch (e) {}
            if (!targets.length) return;
            this._wvTrace("idle loader: warming " + targets.length + " deferred reader-window tab(s) in the background");
            const w0: any = Zotero.getMainWindow();
            const setT = (w0 && w0.setTimeout) ? w0.setTimeout.bind(w0) : setTimeout;
            let i = 0;
            const next = () => {
                if (i >= targets.length) return;
                try { targets[i++](); } catch (e) {}
                setT(next, 2500);
            };
            next();
        } catch (e) {}
    }

    /** FOCUSED-FIRST restore: keep the user's quit-time window on top while
     *  the rest of the workspace assembles in the background. Every window
     *  opened during restore steals OS focus (`openMainWindow`, `Reader.open`
     *  with openInWindow); this shepherd re-asserts the target whenever focus
     *  lands on a DIFFERENT Zotero window — and never pulls focus back from
     *  another application. Polls until the group guard lifts. */
    _wvFocusShepherdStart() {
        try {
            if (this._wvFocusShepherdOn) return;
            this._wvFocusShepherdOn = true;
            const self = this;
            const findTarget = () => {
                const f = (self as any)._wvBootFocusedEntry;
                if (!f || !f.kind) return null;
                try {
                    if (f.kind === "anchor") return (Zotero.getMainWindows() || []).find((w: any) => !w._wvManagedWindow) || null;
                    if (f.kind === "main-dev") return (Zotero.getMainWindows() || []).find((w: any) => w._wvManagedWindow && (f.wvWinId == null || w._wvWindowId === f.wvWinId)) || null;
                    if (f.kind === "reader") {
                        const en = Services.wm.getEnumerator("zotero:reader");
                        while (en.hasMoreElements()) {
                            const w: any = en.getNext();
                            const st = w._wvWT;
                            if (st && st.tabs && st.tabs.some((t: any) => t.itemID === f.itemID)) return w;
                        }
                    }
                } catch (e) {}
                return null;
            };
            let ticks = 0;
            const w0: any = Zotero.getMainWindow();
            const setT = (w0 && w0.setTimeout) ? w0.setTimeout.bind(w0) : setTimeout;
            const tick = () => {
                ticks++;
                const done = !(this as any)._wvTabGroupRestoreGuard || ticks > 45;
                try {
                    const target = findTarget();
                    if (target) {
                        // Release the queued reader-window opens as soon as the
                        // focused window's selected tab is LOADED (no `-loading`/
                        // `-unloaded` suffix) or has nothing to load (library tab
                        // or a reader window, whose native is its content).
                        try {
                            if ((this as any)._wvReaderOpenHold) {
                                const Zt = (target as any).Zotero_Tabs;
                                if (!Zt) {
                                    (this as any)._wvReleaseReaderOpens("focused reader window open");
                                } else {
                                    const sel = Zt._tabs.find((t: any) => t.id === Zt.selectedID);
                                    const ty = String((sel && sel.type) || "");
                                    if (ty === "library" || !(ty.endsWith("-loading") || ty.endsWith("-unloaded"))) {
                                        (this as any)._wvReleaseReaderOpens("focused tab " + (ty === "library" ? "is library" : "loaded"));
                                    }
                                }
                            }
                        } catch (e) {}
                        const fw: any = Services.focus.activeWindow;
                        let oursElsewhere = false;
                        try {
                            const t = fw && fw.document && fw.document.documentElement
                                && fw.document.documentElement.getAttribute("windowtype");
                            oursElsewhere = (t === "navigator:browser" || t === "zotero:reader") && fw !== target;
                        } catch (e) {}
                        if (oursElsewhere) {
                            target.focus();
                            (this as any)._wvTrace("focus-shepherd: re-asserted the "
                                + (((self as any)._wvBootFocusedEntry || {}).kind) + " window");
                        }
                    }
                } catch (e) {}
                if (!done) setT(tick, 700);
                else this._wvFocusShepherdOn = false;
            };
            setT(tick, 700);
        } catch (e) {}
    }

    /** Re-focus the window the user was in at quit (recorded in the store's
     *  `focused` descriptor, stashed by _wvWTLoadRestoreMap). Runs once the
     *  restore chain settles so a late-restoring window can't steal it back. */
    _wvRestoreFocusedWindow() {
        try {
            const f = (this as any)._wvBootFocusedEntry;
            if (!f || !f.kind) return;
            let target: any = null;
            if (f.kind === "anchor") {
                target = (Zotero.getMainWindows() || []).find((w: any) => !w._wvManagedWindow);
            } else if (f.kind === "main-dev") {
                target = (Zotero.getMainWindows() || []).find((w: any) => w._wvManagedWindow
                    && (f.wvWinId == null || w._wvWindowId === f.wvWinId));
            } else if (f.kind === "reader") {
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) {
                    const w: any = en.getNext();
                    const st = w._wvWT;
                    if (st && st.tabs && st.tabs.some((t: any) => t.itemID === f.itemID)) { target = w; break; }
                }
            }
            if (target) { target.focus(); (this as any)._wvTrace("restore: focused " + f.kind + " window"); }
        } catch (e) {}
    }

    /** Closed-in-series buffer (Firefox SessionStore's `_shouldRestore` idea):
     *  a window closing may be part of a quit already in progress — unloads can
     *  fire BEFORE `quit-application-granted`, so the `_wvQuitting` flag alone
     *  can't classify the close. Every closing window's store entry is parked
     *  here (with any group ids its close PARKED); the quit flush folds recent
     *  entries back into the OPEN set and un-parks their groups. Mid-session
     *  closes just age out. */
    _wvWindowStoreNoteClosingWindow(entry: any, parkedGroupIds?: any[]) {
        try {
            if (!entry) return;
            if (!this._wvClosedInSeries) this._wvClosedInSeries = [];
            const now = Date.now();
            this._wvClosedInSeries = this._wvClosedInSeries
                .filter((e: any) => now - e.t < 60000)
                .slice(-7);
            this._wvClosedInSeries.push({ t: now, entry, parkedGroupIds: parkedGroupIds || [] });
            this._wvTrace && this._wvTrace("closed-in-series: noted " + entry.kind
                + (parkedGroupIds && parkedGroupIds.length ? " (parked " + parkedGroupIds.join(",") + ")" : ""));
        } catch (e) {}
    }

    /** The authoritative FINAL capture at quit: cancel pending debounced saves,
     *  capture every still-open window, fold in windows closed in the final
     *  series (last 20 s) that the live capture no longer sees, un-park the
     *  groups those closes parked, write once — then FREEZE the store so no
     *  teardown-triggered save can clobber the result. */
    _wvWindowStoreQuitFlush() {
        try {
            (this as any)._wvQuitting = true;
            // Namespace flag too: unload closures wired before a plugin reload
            // hold the OLD instance, whose field this observer can't reach.
            // `Zotero.Weavero` is rebuilt on every plugin startup, so the flag
            // can't leak into the next session.
            try { if ((Zotero as any).Weavero) (Zotero as any).Weavero._quitting = true; } catch (e) {}
            try { if (this._wvWindowStoreSaveTimer) { const w = Zotero.getMainWindow(); (w ? w.clearTimeout.bind(w) : clearTimeout)(this._wvWindowStoreSaveTimer); this._wvWindowStoreSaveTimer = null; } } catch (e) {}
            const anchorEntry = this._wvWindowStoreCaptureAnchor();
            const live = [
                ...(anchorEntry ? [anchorEntry] : []),
                ...this._wvWindowStoreCaptureDevWindows(),
                ...(this as any)._wvWindowStoreCaptureReaderWindows(),
            ];
            // Item-id fingerprint per entry, to detect a closed-series window
            // that's genuinely absent from the live capture.
            const ids = (en: any) => {
                try {
                    if (en.kind === "main-dev" || en.kind === "main-anchor") return (en.tabs || []).map((t: any) => t.data && t.data.itemID).filter((x: any) => x != null);
                    if (en.kind === "reader") return [en.nativeItemID, ...(en.extras || []).map((x: any) => x.itemID)];
                    return (en.tabs || []).map((x: any) => x.itemID);
                } catch (e) { return []; }
            };
            const liveSets = live.map((en: any) => new Set(ids(en)));
            const now = Date.now();
            const unparkIds: string[] = [];
            for (const rec of (this._wvClosedInSeries || [])) {
                if (now - rec.t > 20000) continue;             // not part of this quit
                const recIds = ids(rec.entry);
                const represented = liveSets.some((s: any) => recIds.some((i: any) => s.has(i)));
                if (represented) continue;
                live.push(rec.entry);
                for (const gid of (rec.parkedGroupIds || [])) unparkIds.push(gid);
                this._wvTrace && this._wvTrace("quit-flush: merged closed-in-series " + rec.entry.kind);
            }
            if (unparkIds.length) {
                // The park was a misclassified quit-teardown close — the window is
                // in the store and restores next launch, so its groups stay LIVE.
                try {
                    const groups = (this as any)._tabGroupsGet();
                    let dirty = false;
                    for (const g of groups) if (unparkIds.includes(g.id) && (g as any).saved) { (g as any).saved = false; dirty = true; }
                    if (dirty) (this as any)._tabGroupsSet(groups);
                    this._wvTrace && this._wvTrace("quit-flush: un-parked " + unparkIds.join(","));
                } catch (e) {}
            }
            this._wvWindowStoreWrite({ version: 4, windows: live, focused: this._wvWindowStoreFocusDescriptor() });
            this._wvWindowStoreFrozen = true;
            // Namespace copy (stale-closure-proof): with the capture frozen,
            // the getState / getWindowStates wraps now hand Zotero's own
            // session save a library-only anchor and no reader windows —
            // the restore takeover.
            try { if ((Zotero as any).Weavero) (Zotero as any).Weavero._storeFrozen = true; } catch (e) {}
            this._wvTrace && this._wvTrace("quit-flush: wrote " + live.length + " window entr(ies), store FROZEN");
            try { this._wvTraceFlush && this._wvTraceFlush("quit"); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvWindowStoreQuitFlush err: " + e); }
    }

    /** Quit detection, Firefox `RunState` model: `_wvQuitting` flips on the
     *  EARLIEST signal (`quit-application-requested`, before any window closes)
     *  and the final capture runs at `quit-application-granted`. A vetoed quit
     *  (requested but never granted) resets the flag after a grace period. */
    _wvWindowStoreRegisterQuitFlush() {
        try {
            if (this._wvWindowStoreQuitObserver) return;
            const self = this;
            const obs = { observe(_s: any, topic: string) {
                if (topic === "quit-application-requested") {
                    try {
                        (self as any)._wvQuitting = true;
                        try { if ((Zotero as any).Weavero) (Zotero as any).Weavero._quitting = true; } catch (e) {}
                        self._wvTrace && self._wvTrace("quit-application-requested");
                        const w = Zotero.getMainWindow();
                        const setT = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
                        if (self._wvQuitResetTimer) { try { ((w && w.clearTimeout) ? w.clearTimeout.bind(w) : clearTimeout)(self._wvQuitResetTimer); } catch (e) {} }
                        self._wvQuitResetTimer = setT(() => {
                            // No grant arrived → the quit was vetoed; resume normal life.
                            if (!self._wvWindowStoreFrozen) {
                                (self as any)._wvQuitting = false;
                                try { if ((Zotero as any).Weavero) (Zotero as any).Weavero._quitting = false; } catch (e) {}
                                self._wvTrace && self._wvTrace("quit vetoed — _wvQuitting reset");
                            }
                        }, 15000);
                    } catch (e) {}
                    return;
                }
                // quit-application-granted
                try { self._wvWindowStoreQuitFlush(); } catch (e) {}
            } };
            this._wvWindowStoreQuitObserver = obs;
            Services.obs.addObserver(obs, "quit-application-requested", false);
            Services.obs.addObserver(obs, "quit-application-granted", false);
        } catch (e) { Zotero.debug("[Weavero] _wvWindowStoreRegisterQuitFlush err: " + e); }
    }

    _wvWindowStoreUnregisterQuitFlush() {
        try {
            if (this._wvWindowStoreQuitObserver) {
                try { Services.obs.removeObserver(this._wvWindowStoreQuitObserver, "quit-application-requested"); } catch (e) {}
                try { Services.obs.removeObserver(this._wvWindowStoreQuitObserver, "quit-application-granted"); } catch (e) {}
                this._wvWindowStoreQuitObserver = null;
            }
        } catch (e) {}
    }

    // ---- Recently-closed reader windows / groups (Reopen, Ctrl+Shift+T) ------
    // Zotero natively tracks closed MAIN-WINDOW TABS (Zotero_Tabs.undoClose,
    // Ctrl+Shift+T via zoteroPane.js captureKeyDown, "Reopen Closed Tab" menu).
    // Weavero adds the things Zotero misses: closed separate READER WINDOWS and
    // closed GROUPS. A small LIFO stack; Ctrl+Shift+T reopens Weavero's newest
    // entry first, FALLING THROUGH to Zotero's tab-undo when our stack is empty.

    _wvClosedPush(entry: any) {
        try {
            if (!entry) return;
            const stack: any[] = ((this as any)._wvClosedStack = (this as any)._wvClosedStack || []);
            entry.seq = ((this as any)._wvClosedSeq = ((this as any)._wvClosedSeq || 0) + 1);
            stack.push(entry);
            while (stack.length > 25) { const ev = stack.shift(); this._wvClosedEvict(ev); }
        } catch (e) {}
    }

    /** When a closed-window entry leaves the stack WITHOUT being reopened (capped
     *  off, or pruned as stale), delete the groups its close had PARKED if they're
     *  still parked + unopened — so window-close groups don't pile up in the
     *  saved-groups list forever (Firefox bounds closed windows + cleans up).
     *  Explicitly-saved groups ("Save and close group") are NOT touched. */
    _wvClosedEvict(entry: any) {
        try {
            if (!entry || entry.kind !== "readerWindow" || !entry.groupIds || !entry.groupIds.length) return;
            const groups = (this as any)._tabGroupsGet();
            const keep: any[] = [];
            let dirty = false;
            for (const g of groups) {
                if (entry.groupIds.indexOf(g.id) >= 0 && (g as any).saved
                        && (this as any)._wvTabGroupOpenCount(g.id) === 0) { dirty = true; continue; }
                keep.push(g);
            }
            if (dirty) (this as any)._tabGroupsSet(keep);
        } catch (e) {}
    }

    /** A group was reopened DIRECTLY from the saved-groups list — Firefox then
     *  removes it (and its tabs) from any closed-window entry, so reopening that
     *  window later doesn't DUPLICATE the now-open group. Strip the group's tabs
     *  from each closed-window entry; drop an entry that held only this group. */
    _wvClosedForgetGroup(groupID: any) {
        try {
            const stack: any[] = (this as any)._wvClosedStack;
            if (!Array.isArray(stack) || !groupID) return;
            for (let i = stack.length - 1; i >= 0; i--) {
                const e = stack[i];
                if (!e || e.kind !== "readerWindow" || !e.groupIds || e.groupIds.indexOf(groupID) < 0) continue;
                e.groupIds = e.groupIds.filter((g: any) => g !== groupID);
                e.tabs = (e.tabs || []).filter((t: any) => t.grp !== groupID);
                if (!e.tabs.length) stack.splice(i, 1);   // window held only this group → drop it
            }
        } catch (e) {}
    }

    /** Is a stack entry still reopenable? readerWindow: any item still exists;
     *  group: members still resolve AND it isn't already open. */
    _wvClosedEntryLive(entry: any): boolean {
        try {
            if (!entry) return false;
            if (entry.kind === "readerWindow") {
                return (entry.tabs || []).some((t: any) => { try { return Zotero.Items.exists(t.itemID); } catch (e) { return false; } });
            }
            if (entry.kind === "group") {
                const g = (this as any)._tabGroupsGet().find((x: any) => x.id === entry.groupID);
                if (g && (this as any)._wvTabGroupOpenCount(entry.groupID) > 0) return false;   // already open
                return (entry.members || []).some((m: any) => { try { return !!Zotero.Items.getByLibraryAndKey(m.libraryID, m.itemKey); } catch (e) { return false; } });
            }
            return false;
        } catch (e) { return false; }
    }

    /** Top non-stale entry (pruning stale ones in place), without removing it. */
    _wvClosedPeek(): any {
        const stack: any[] = (this as any)._wvClosedStack || [];
        while (stack.length) {
            const top = stack[stack.length - 1];
            if (this._wvClosedEntryLive(top)) return top;
            this._wvClosedEvict(stack.pop());   // prune stale + clean its parked groups
        }
        return null;
    }

    /** Menu label for the top entry, or null if nothing of ours to reopen. */
    _wvClosedTopLabel(): string | null {
        const top = this._wvClosedPeek();
        if (!top) return null;
        if (top.kind === "group") return "Reopen Closed Group";
        if (top.kind === "readerWindow") {
            const n = (top.tabs || []).filter((t: any) => { try { return Zotero.Items.exists(t.itemID); } catch (e) { return false; } }).length;
            return n > 1 ? "Reopen Closed Window (" + n + " Tabs)" : "Reopen Closed Window";
        }
        return null;
    }

    /** Reopen Weavero's most-recently-closed entry (reader window / group).
     *  Returns true if it handled something (caller then suppresses the native
     *  tab-undo). `win` = where the action was triggered (group reopens there if
     *  it's a reader window, else in the main window). */
    _wvClosedReopenLast(win: any): boolean {
        try {
            const stack: any[] = (this as any)._wvClosedStack || [];
            let top: any = null;
            while (stack.length) { const t = stack[stack.length - 1]; if (this._wvClosedEntryLive(t)) { top = t; break; } this._wvClosedEvict(stack.pop()); }
            if (!top) return false;
            stack.pop();
            if (top.kind === "readerWindow") {
                const entries = (top.tabs || []).filter((t: any) => { try { return Zotero.Items.exists(t.itemID); } catch (e) { return false; } });
                if (!entries.length) return false;
                // Un-park the groups this window's close had saved — reopening the
                // window RESTORES them into it and removes them from the saved list
                // (Firefox consumes the saved group on reopen). The grouping itself
                // is restored from each entry's `grp` by _wvOpenItemsInNewReaderWindow.
                try {
                    const groups = (this as any)._tabGroupsGet();
                    let dirty = false;
                    for (const gid of (top.groupIds || [])) { const g = groups.find((x: any) => x.id === gid); if (g && (g as any).saved) { delete (g as any).saved; dirty = true; } }
                    if (dirty) (this as any)._tabGroupsSet(groups);
                } catch (e) {}
                try { (this as any)._wvOpenItemsInNewReaderWindow(entries); } catch (e) {}
                return true;
            }
            if (top.kind === "group") {
                let gid = top.groupID;
                // If the group was DELETED (not just parked), recreate its def from
                // the captured snapshot so it can be reopened.
                let g = (this as any)._tabGroupsGet().find((x: any) => x.id === gid);
                if (!g) {
                    try {
                        const ng = (this as any)._tabGroupCreate(top.name || "", top.color || "blue");
                        gid = ng.id;
                        for (const m of (top.members || [])) (this as any)._tabGroupAddKey(gid, { libraryID: m.libraryID, itemKey: m.itemKey });
                    } catch (e) { return false; }
                }
                const target = (this._wvTabGroupIsReaderWin && this._wvTabGroupIsReaderWin(win)) ? win : Zotero.getMainWindow();
                try { (this as any)._wvTabGroupOpenInWindow(target, gid); } catch (e) {}
                return true;
            }
            return false;
        } catch (e) { Zotero.debug("[Weavero] _wvClosedReopenLast err: " + e); return false; }
    }

    /** Ctrl/Cmd+Shift+T → reopen last closed. Weavero entries take priority; an
     *  empty stack lets the event fall through to Zotero's native tab-undo (main
     *  window). WINDOW-level CAPTURE runs before Zotero's document-level
     *  captureKeyDown (zoteroPane.js), so suppressing it stops the double-handle.
     *  Idempotent per window. */
    _wvWireReopenClosedShortcut(win: any) {
        try {
            if (!win || win._wvReopenShortcutWired) return;
            win._wvReopenShortcutWired = true;
            const suppress = (e: any) => { e.preventDefault(); try { e.stopImmediatePropagation(); } catch (er) { try { e.stopPropagation(); } catch (er2) {} } };
            const handler = (e: any) => {
                try {
                    const accel = (Zotero as any).isMac ? e.metaKey : e.ctrlKey;
                    if (!accel || !e.shiftKey || e.altKey) return;
                    if (String(e.key || "").toLowerCase() !== "t") return;
                    // 1) Weavero's closed reader-window / group stack (priority).
                    if (this._wvClosedPeek()) { suppress(e); this._wvClosedReopenLast(win); return; }
                    // 2) Reader window: its own closed-TAB stack (no native undo here).
                    try {
                        if (this._wvTabGroupIsReaderWin && this._wvTabGroupIsReaderWin(win) && win._wvWTClosed && win._wvWTClosed.length) {
                            suppress(e);
                            const last = win._wvWTClosed.pop();
                            if (last && last.itemID != null) (this as any)._wvWTMountTab(win, last.itemID, { allowDuplicate: true, select: true });
                            return;
                        }
                    } catch (er) {}
                    // 3) Main window, empty Weavero stack → fall through to Zotero's
                    //    native captureKeyDown (reopen closed tab). Do nothing here.
                } catch (er) {}
            };
            win.addEventListener("keydown", handler, true);
            win._wvReopenShortcutHandler = handler;
        } catch (e) { Zotero.debug("[Weavero] _wvWireReopenClosedShortcut err: " + e); }
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
                // Wait until the tree id AND the stable window id are both ready —
                // applying before iv.id exists is what produced the old `null::wvN`
                // garbage keys.
                if (iv && iv.id && win._wvWindowId != null) { this._wvApplyPerWindowColumns(win); return; }
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
            // A STABLE per-window id (persisted in windows.json) is required so the
            // column key survives restarts. The scheduler waits for both id and
            // _wvWindowId, so bailing here is defensive — and bailing BEFORE setting
            // the guard lets a retry pick it up (this also kills the old `null::wvN`
            // garbage-key bug, where origId was null at apply time).
            if (!iv.id || win._wvWindowId == null) return;
            iv._wvColIsolated = true;                          // guard re-entry across awaits
            // One-time: purge orphaned keys left by the old runtime-seq scheme
            // (::wvN) and the null-id bug, preserving the primary's real key.
            try { await this._wvCleanupTreePrefsGarbage(); } catch (e) {}
            // Let the tree finish its initial (shared-key) load so _columnPrefs
            // holds the columns it's currently showing, before we seed our key.
            try { if (iv._sortContextReadyPromise) await iv._sortContextReadyPromise; } catch (e) {}
            // Per-window column layout lives in Weavero's OWN store keyed by the
            // stable window id — NOT in Zotero's treePrefs.json. Zotero's setId /
            // viewType machinery keeps mangling treePrefs keys (it renames
            // "…::win-1" → "…::win-1-default" early in a restart, then the next
            // load can't find it), which defeated every wrapper that stored there.
            // A separate file is immune. (All views of a window share one entry —
            // per-view columns within a managed window are not preserved; the
            // default library view is what matters here.)
            const colDir = PathUtils.join((Zotero as any).DataDirectory.dir, "weavero");
            const colPath = PathUtils.join(colDir, "colstore.json");
            const colKey = "win-" + win._wvWindowId;
            iv._wvColKey = colKey;
            iv._loadColumnPrefsFromFile = async function () {
                try {
                    const store = JSON.parse((await Zotero.File.getContentsAsync(colPath)) as string);
                    const prefs = store[colKey];
                    if (prefs && Object.keys(prefs).length) { this._columnPrefs = prefs; return; }
                } catch (e) {}
                // No saved layout yet → keep what native just loaded (the shared
                // layout); the first-time seed persists it under our key.
            };
            iv._writeColumnPrefsToFile = async function (force) {
                const self = this;
                const writeToFile = async () => {
                    let store: any;
                    try { store = JSON.parse((await Zotero.File.getContentsAsync(colPath)) as string); } catch (e) { store = {}; }
                    store[colKey] = self._columnPrefs;            // only our window's entry
                    try { await IOUtils.makeDirectory(colDir, { ignoreExisting: true }); } catch (e) {}
                    return Zotero.File.putContentsAsync(colPath, JSON.stringify(store, null, 2));
                };
                if (this._wvColWriteTimer) { try { clearTimeout(this._wvColWriteTimer); } catch (e) {} }
                if (force) return writeToFile();
                this._wvColWriteTimer = setTimeout(writeToFile, 60000);
            };
            // SEED vs RESTORE. The native load already filled _columnPrefs from the
            // shared treePrefs key (that's what the tree shows now). If our store
            // has a saved layout, RESTORE it — load + rebuild + repaint. Else SEED
            // (persist the current shared layout under our key) the first time only.
            let hadSaved = false;
            try {
                const store = JSON.parse((await Zotero.File.getContentsAsync(colPath)) as string);
                hadSaved = !!(store[colKey] && Object.keys(store[colKey]).length);
            } catch (e) {}
            if (hadSaved) {
                try { await iv._loadColumnPrefsFromFile(); } catch (e) {}   // _columnPrefs ← our store
                try {
                    iv._columnsId = null;
                    iv._sortedColumn = null;
                    iv._getColumns();
                    if (typeof iv.forceUpdate === "function") {
                        await new Promise<void>((r) => { try { iv.forceUpdate(() => r()); } catch (e) { r(); } });
                    }
                } catch (e) {}
            } else {
                try { await iv._writeColumnPrefsToFile(true); } catch (e) {}
            }
            Zotero.debug("[Weavero] per-window items-tree columns isolated under " + colKey);
        } catch (e) { Zotero.debug("[Weavero] _wvApplyPerWindowColumns err: " + e); }
    }

    /** Stable, monotonic per-window id (persisted in the `weavero.nextWindowId`
     *  pref). Keys a managed window's items-tree column layout so it survives
     *  restarts. Never reused, so a stale orphaned key can never collide with a
     *  live window. */
    _wvNextWindowId() {
        let n = 1;
        try {
            const v: any = Zotero.Prefs.get("weavero.nextWindowId");
            if (typeof v === "number" && v >= 1) n = v;
            else if (v != null) n = parseInt(String(v), 10) || 1;
        } catch (e) {}
        try { Zotero.Prefs.set("weavero.nextWindowId", n + 1); } catch (e) {}
        return n;
    }

    /** One-time cleanup of orphaned items-tree column keys in treePrefs.json: the
     *  old runtime-seq per-window keys (`…::wvN…`) and the null-id bug keys
     *  (`null::…`). Backs the file up to treePrefs.json.bak first, and never
     *  touches the primary's real key (`item-tree-main-default`), the native
     *  per-view keys, or the new stable `::win-<id>` keys (which can't match the
     *  `::wv\d` pattern). Runs at most once per session. */
    async _wvCleanupTreePrefsGarbage() {
        if (this._wvTreePrefsCleaned) return;
        this._wvTreePrefsCleaned = true;
        try {
            const path = PathUtils.join((Zotero as any).Profile.dir, "treePrefs.json");
            let persist: any;
            try { const t: any = await Zotero.File.getContentsAsync(path); persist = JSON.parse(t); }
            catch (e) { return; }   // missing/unreadable → nothing to clean
            // Sweep: old runtime-seq keys (::wvN), the null-id bug keys (null::),
            // and the transitional ::win-N-<suffix> orphans (a live key is exactly
            // ::win-N with no trailing dash, so it can't match ::win-\d+-).
            const garbage = Object.keys(persist).filter((k) =>
                /::wv\d/.test(k) || /::win-\d+-/.test(k) || k.startsWith("null::"));
            if (!garbage.length) return;
            try { await Zotero.File.putContentsAsync(path + ".bak", JSON.stringify(persist)); } catch (e) {}
            for (const k of garbage) delete persist[k];
            await Zotero.File.putContentsAsync(path, JSON.stringify(persist));
            Zotero.debug("[Weavero] cleaned " + garbage.length + " orphaned treePrefs key(s): " + garbage.join(", "));
        } catch (e) { Zotero.debug("[Weavero] _wvCleanupTreePrefsGarbage err: " + e); }
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
            // Same shared solid Material anchor (WV_ANCHOR_PATH) as the dropdown,
            // used as a mask so it tints with the accent colour.
            const anchorSvg = encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + WV_ANCHOR_VIEWBOX + '">'
                + '<path fill="black" d="' + WV_ANCHOR_PATH + '"/>'
                + "</svg>");
            const css = `.wv-anchor-window #tab-bar-container .tab[data-id="zotero-pane"]::after{`
                + `content:"";display:inline-block;width:15px;height:15px;margin-inline-start:6px;`
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
            d.documentElement.classList.toggle("wv-anchor-window", multi && this._wvIsAnchorWindow(win));
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
        // Revert pinned-tab visuals so disabling the plugin (or turning the
        // feature off) returns the tabs to normal width/position. The
        // `weavero.pinnedTabs` pref is left untouched, so re-enabling re-pins.
        // (Without this the pin stuck visible after the plugin was disabled.)
        try {
            if (doc) {
                for (const node of doc.querySelectorAll(
                    "#tab-bar-container .tab.wv-pinned-tab")) {
                    node.classList.remove("wv-pinned-tab");
                    try { node.removeAttribute("data-wv-pin-preview"); } catch (e) {}
                }
                const pinStyle = doc.getElementById("wv-pinned-tab-style");
                if (pinStyle) pinStyle.remove();
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
            // Overlay the group-library temple badge in the BOTTOM-RIGHT
            // corner of the tab's attachment-file-type icon
            // (PDF/EPUB/snapshot/note/etc.) — the same glyph and corner as
            // the List-all-tabs dropdown badge (`_wvGroupLibBadgeSvg`), so
            // the two UIs read identically. Implemented as an `::after`
            // pseudo-element on `.tab-icon` so the badge overlays without
            // disturbing any layout or React-managed styling. The shared
            // `WV_GROUPLIB_BADGE_SVG` carries a hard-coded #59ADC4 fill —
            // the teal Zotero uses for group libraries throughout the UI —
            // and a thin dark drop-shadow halo lifts it off the icon beneath.
            const badgeUri = "data:image/svg+xml," + encodeURIComponent(WV_GROUPLIB_BADGE_SVG);
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
                + "  right: -4px;\n"
                + "  bottom: -4px;\n"
                + "  width: 12px;\n"
                + "  height: 12px;\n"
                + "  background-image: url(\"" + badgeUri + "\");\n"
                + "  background-size: contain;\n"
                + "  background-repeat: no-repeat;\n"
                + "  background-position: center;\n"
                // Thin dark halo so the teal temple reads against the
                // file-type icon underneath (matches the dropdown badge).
                + "  filter: drop-shadow(0 0 0.7px #1c1c1e) drop-shadow(0 0 0.7px #1c1c1e);\n"
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

        // List-all-tabs popup rows: current-window native rows carry data-tab-id;
        // other-window / session rows carry data-wv-library + a `title` attr. Show
        // the SAME rich card (group-library name + tab title) the tab header uses,
        // else fall back to the plain overflow title.
        const popRow = (triggerNode.closest && triggerNode.closest(".row")) || null;
        if (popRow && !popRow.closest(".tab") && (popRow.getAttribute("data-wv-library") != null || popRow.getAttribute("data-tab-id"))) {
            let pLib: any = null, pTitle: any = null;
            const wvLib = popRow.getAttribute("data-wv-library");
            if (wvLib != null) {
                try { pLib = Zotero.Libraries.get(Number(wvLib)); } catch (e) {}
            } else {
                const tid = popRow.getAttribute("data-tab-id");
                if (tid && tid !== "zotero-pane") {
                    try {
                        const zt: any = win.Zotero_Tabs;
                        const t = zt && zt._tabs.find((x: any) => x.id === tid);
                        const it: any = Zotero.Items.get(t && t.data && t.data.itemID);
                        if (it) pLib = Zotero.Libraries.get(it.libraryID);
                        if (t) pTitle = t.title;
                    } catch (e) {}
                }
            }
            if (!pTitle) pTitle = popRow.getAttribute("title")
                || (popRow.querySelector("label") && popRow.querySelector("label").textContent)
                || (popRow.querySelector("[title]") && popRow.querySelector("[title]").getAttribute("title"))
                || null;
            if (pLib && pLib.libraryType === "group") {
                (this as any)._wvTabTooltipRichCard(doc, tooltip, pLib, pTitle);
                return true;
            }
            if (pTitle) { renderPlainLabel(pTitle); return true; }
            return false;
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

    /** Build the rich library-card tooltip body (themed group-library icon + name,
     *  and — when given — a separator + the tab title below). Shared by the tab
     *  header and the List-all-tabs popup rows. */
    _wvTabTooltipRichCard(doc: any, tooltip: any, lib: any, title: any) {
        try {
            const wrap = doc.createXULElement("vbox");
            wrap.setAttribute("class", "wv-tab-tooltip-wrap");
            const headerRow = doc.createXULElement("hbox");
            headerRow.setAttribute("class", "wv-tab-tooltip-header");
            headerRow.setAttribute("align", "center");
            const iconEl = doc.createXULElement("image");
            iconEl.setAttribute("class", "wv-tab-tooltip-icon");
            const iconName = lib.libraryType === "feed" ? "feed-library.svg" : "library-group.svg";
            iconEl.setAttribute("src", "chrome://zotero/skin/collection-tree/16/light/" + iconName);
            headerRow.appendChild(iconEl);
            const nameEl = doc.createXULElement("description");
            nameEl.setAttribute("class", "wv-tab-tooltip-libname");
            nameEl.textContent = lib.name;
            headerRow.appendChild(nameEl);
            wrap.appendChild(headerRow);
            if (title) {
                const sep = doc.createXULElement("box");
                sep.setAttribute("class", "wv-tab-tooltip-sep");
                wrap.appendChild(sep);
                const titleEl = doc.createXULElement("description");
                titleEl.setAttribute("class", "wv-tab-tooltip-title");
                titleEl.textContent = title;
                wrap.appendChild(titleEl);
            }
            tooltip.appendChild(wrap);
        } catch (e) { Zotero.debug("[Weavero] _wvTabTooltipRichCard err: " + e); }
    }

    /** Route the List-all-tabs popup's tooltips through the rich `wv-tab-library-
     *  tooltip` (the panel is a XUL element, so the attribute applies to the HTML
     *  rows). Creates the tooltip element if the tab-bar setup hasn't. Idempotent. */
    _wvEnsureTabsMenuTooltip(panel: any) {
        try {
            if (!panel) return;
            const win = panel.ownerGlobal;
            const doc = panel.ownerDocument;
            if (!win || !doc) return;
            if (!doc.getElementById("wv-tab-library-tooltip")) {
                const tooltip = doc.createXULElement("tooltip");
                tooltip.id = "wv-tab-library-tooltip";
                tooltip.addEventListener("popupshowing", (e: any) => {
                    try {
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        const ok = lp && lp._populateTabTooltip(win, tooltip);
                        if (!ok) e.preventDefault();
                    } catch (err) { Zotero.debug("[Weavero] tooltip err: " + err); e.preventDefault(); }
                });
                let popupset = doc.querySelector("popupset");
                if (!popupset) { popupset = doc.createXULElement("popupset"); doc.documentElement.appendChild(popupset); }
                popupset.appendChild(tooltip);
            }
            // The row container (#zotero-tabs-menu-list) natively carries
            // tooltip="html-tooltip" — closer to the rows than the panel, so it wins
            // resolution and Zotero's plain tooltip fires. Re-point the LIST (and the
            // panel) at our rich tooltip. Done every refresh, since the native list
            // keeps re-asserting html-tooltip.
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list");
            if (list) list.setAttribute("tooltip", "wv-tab-library-tooltip");
            panel.setAttribute("tooltip", "wv-tab-library-tooltip");
        } catch (e) { Zotero.debug("[Weavero] _wvEnsureTabsMenuTooltip err: " + e); }
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
        // Initialise display-settings state on first use of a fresh plugin
        // instance. Pref-backed so the last choice survives restart/reload; both
        // default OFF (plain tab order, no annotation counts) until the user opts
        // in. `weavero.tabsMenuGroupByLibrary` / `weavero.tabsMenuShowAnnotationCount`.
        if (this._tabsMenuGroupByLibrary === undefined) {
            const v = Zotero.Prefs.get("weavero.tabsMenuGroupByLibrary");
            this._tabsMenuGroupByLibrary = (typeof v === "boolean") ? v : false;
        }
        if (this._tabsMenuShowAnnotationCount === undefined) {
            const v = Zotero.Prefs.get("weavero.tabsMenuShowAnnotationCount");
            this._tabsMenuShowAnnotationCount = (typeof v === "boolean") ? v : false;
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

            // Library filter — a chip per library the open tabs span (My Library +
            // group libraries), shown only when there are ≥2. Same tri-state gesture
            // as the file-type tiles (click = include, Alt+click = exclude), backed
            // by `_tabsMenuLibraryFilter`.
            try {
                const libIds = new Set<number>();
                for (const r of Array.from(panel.querySelectorAll("[data-wv-library]")) as any[]) {
                    const v = r.getAttribute("data-wv-library");
                    if (v != null) libIds.add(Number(v));
                }
                if (libIds.size >= 2) {
                    const lf = this._tabsMenuLibraryFilter || (this._tabsMenuLibraryFilter = new Map());
                    const libToggle = (libID: number, alt: boolean) => {
                        const cur = lf.get(libID);
                        if (alt) { if (cur === "exclude") lf.delete(libID); else lf.set(libID, "exclude"); }
                        else { if (cur === "include") lf.delete(libID); else lf.set(libID, "include"); }
                        renderButtons();
                        this._refreshFileTypeFilterButtonState(panel);
                        this._wvRegroupTabsMenu(panel);
                    };
                    const libRow = doc.createElementNS(NS_HTML, "div");
                    libRow.className = "wv-tabs-menu-lib-row";
                    libRow.style.cssText = "display:flex;flex-direction:column;gap:2px;margin-top:6px;padding-top:6px;border-top:1px solid var(--fill-quinary);";
                    const libs = ([...libIds].map((id) => { try { return Zotero.Libraries.get(id); } catch (e) { return null; } }).filter(Boolean)) as any[];
                    libs.sort((a, b) => (a.libraryType === "user" ? -1 : b.libraryType === "user" ? 1 : String(a.name || "").localeCompare(String(b.name || ""))));
                    for (const lib of libs) {
                        const chip = doc.createElementNS(NS_HTML, "button") as any;
                        chip.type = "button";
                        chip.className = "wv-filter-opt";
                        chip.style.cssText = "display:flex;align-items:center;gap:6px;justify-content:flex-start;width:100%;padding:3px 6px;";
                        chip.title = lib.name + " — click to show only this library, Alt+click to exclude.";
                        const cur = lf.get(lib.libraryID);
                        if (cur === "include") chip.dataset.selected = "true";
                        if (cur === "exclude") chip.dataset.excluded = "true";
                        const icon = doc.createElementNS(NS_HTML, "span") as any;
                        icon.className = "icon icon-css " + (lib.libraryType === "group" ? "icon-library-group" : lib.libraryType === "feed" ? "icon-feed" : "icon-library");
                        icon.style.cssText = "width:16px;height:16px;flex:0 0 16px;";
                        chip.appendChild(icon);
                        const nm = doc.createElementNS(NS_HTML, "span") as any;
                        nm.textContent = lib.name;
                        nm.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;";
                        chip.appendChild(nm);
                        chip.addEventListener("click", (e: any) => { e.stopPropagation(); libToggle(lib.libraryID, e.altKey); });
                        libRow.appendChild(chip);
                    }
                    popup.appendChild(libRow);
                }
            } catch (e) { Zotero.debug("[Weavero] tabs-menu library chips err: " + e); }
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
                // Persist so the choice survives restart/reload (the in-memory
                // field resets on a fresh plugin instance). Pref name derives from
                // the field: `_tabsMenuGroupByLibrary` → `weavero.tabsMenuGroupByLibrary`.
                try { Zotero.Prefs.set("weavero." + key.replace(/^_/, ""), cb.checked); } catch (e) {}
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

    /** Row-based file-type filter (works for ANY window's row): checks an
     *  item-type string (`attachmentPDF` / `note` / …) against the include/
     *  exclude sets. Unclassifiable rows (library/meta rows with no type) pass,
     *  so they're never hidden by a file-type filter. */
    _rowPassesFileTypeFilter(kind: any): boolean {
        const f = this._tabsMenuFileTypeFilter;
        if (!f || (!f.include.size && !f.exclude.size)) return true;
        if (!kind) return true;
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
