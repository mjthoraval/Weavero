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

import { WV_FUNNEL_DATA_URI } from "./constants";

// Zotero_Tabs is the per-window globals — it's declared as `any`
// rather than imported from zotero-types because zotero-types
// doesn't ship a typing for the runtime per-window global yet.
declare const Zotero_Tabs: any;

// Single source of truth for the anchor-window marker (solid Material anchor,
// 24-unit grid). Used BOTH as an inline <svg> in the List-all-tabs Window header
// and as a CSS mask on the anchor window's library tab — edit here only.
const WV_ANCHOR_VIEWBOX = "0 0 24 24";
const WV_ANCHOR_PATH = "M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z";

// Window-type glyphs for the OS window title. Taskbar hover previews,
// Task View (Win+Tab) and Alt-Tab all render `document.title` as the
// caption, so a 2-char prefix is the one per-window mark that's legible
// there (an in-window pill scales down to invisible in a ~250px live
// thumbnail — tested 2026-07-11). Shape FAMILY = window kind (anchor
// mark / square = main, circle = reader); the fill variant tells
// same-kind windows apart. MONOCHROME BMP Geometric Shapes only: the
// taskbar preview caption is drawn by the legacy GDI text renderer,
// which has no colour-emoji support — coloured squares (U+1F7E6…) have
// no monochrome fallback and render as tofu boxes there (tested
// 2026-07-11). The informative selected-tab part of the title is kept.
const WV_TITLE_GLYPH_ANCHOR = "⚓";
const WV_TITLE_GLYPHS_MAIN = [
    "■", "□", "▣", "▤", "▥", "▦",       // U+25A0/25A1/25A3/25A4/25A5/25A6
];
const WV_TITLE_GLYPHS_READER = [
    "●", "○", "◉", "◐", "◑", "◒",       // U+25CF/25CB/25C9/25D0/25D1/25D2
];
const WV_TITLE_GLYPH_STRIP_RE = new RegExp("^(?:"
    + [WV_TITLE_GLYPH_ANCHOR, ...WV_TITLE_GLYPHS_MAIN, ...WV_TITLE_GLYPHS_READER].join("|")
    + ")\\s+");

// Per-window badge colours — Zotero's tag-swatch palette, matching the
// composited taskbar icons in icons/win/ (regenerate those with
// work/make-win-icons.py when changing this). Indexed by the SHARED
// colour pool (_wvTitleGlyphIdx), so a window's taskbar badge and its
// in-window title-bar dot always agree.
const WV_WIN_BADGE_COLORS = [
    "#2EA8E5", "#5FB236", "#A28AE5", "#F19837", "#E56EEE", "#FF6666",
];

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
        // SELF-HEAL: if a previous teardown left the native list DETACHED
        // (a wrapper removal once took `_tabsList` with it), re-attach it —
        // otherwise every refresh renders into a dead node and the popup
        // shows empty forever, plugin on or off.
        try {
            const lst: any = (panel as any)._tabsList;
            if (lst && !lst.isConnected) {
                const home = panel.querySelector("#zotero-tabs-menu-wrapper") || panel;
                home.appendChild(lst);
            }
        } catch (e) {}
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
                if (lp && lp._wvSavedWindowsMenuSection) lp._wvSavedWindowsMenuSection(panel);
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
        if ((this as any)._wvDestroyed) return;   // stale wrapper from a dead instance — never decorate
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
            // 1b) An inline group HEADER in a window section (the only visible
            // handle of a COLLAPSED group) → join that group, appended after
            // its last member (Firefox: dropping on a group label adds to the
            // group). Without this, headers fell through to the window-scope
            // case and the drop was a silent loose move.
            const tgHdr = el.closest(".wv-tgrow-header");
            if (tgHdr && (tgHdr as any)._wvGroupId) {
                return { container: tgHdr, target: { groupId: (tgHdr as any)._wvGroupId } };
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
            // GROUP DRAG: a group can't nest inside another group, so snap the
            // drop position OUT of any group the cursor is over — to that
            // group's start (upper half) or past its end (lower half).
            let anchorRowOverride: any;   // set by the snap (null = very front)
            if ((opts && opts.snapOutOfGroups) && win) {
                try {
                    const groupOf = (r: any) => { const t = r && this._wvTabObjInWin(win, tidOf(r), isReader); return (t && (this as any)._wvTabGroupStamp(t)) || null; };
                    const overRow = beforeRow || (rows.length ? rows[rows.length - 1] : null);
                    const og = overRow && groupOf(overRow);
                    if (og && og !== exclGrp) {
                        const members = rows.filter((r: any) => groupOf(r) === og);
                        const firstM = members[0], lastM = members[members.length - 1];
                        const fr = firstM.getBoundingClientRect(), lr = lastM.getBoundingClientRect();
                        const groupMid = (fr.top + lr.bottom) / 2;
                        if (clientY < groupMid) {
                            // Before the whole group. The GHOST must render above
                            // the group's HEADER — anchoring it to the first
                            // member draws it BELOW the header, i.e. visually
                            // INSIDE the group (a group can't nest there).
                            const fi = rows.indexOf(firstM);
                            anchorRowOverride = fi > 0 ? rows[fi - 1] : null;
                            let hdr: any = firstM.previousElementSibling;
                            while (hdr && hdr.classList && (hdr.classList.contains("wv-tabsmenu-ghost") || hdr.classList.contains("wv-tgrow-hidden"))) hdr = hdr.previousElementSibling;
                            beforeRow = (hdr && hdr.classList && hdr.classList.contains("wv-tgrow-header")) ? hdr : firstM;
                        }
                        else { const li = rows.indexOf(lastM); beforeRow = (li + 1 < rows.length) ? rows[li + 1] : null; }   // after it
                    }
                } catch (e) {}
            }
            let anchorTabId: any = null;
            let prevRow: any = null;
            if (anchorRowOverride !== undefined) {
                // Snap placed the ghost on a HEADER (not in `rows`) — the
                // generic index math below can't anchor it.
                prevRow = anchorRowOverride;
                anchorTabId = anchorRowOverride ? tidOf(anchorRowOverride) : null;
            } else if (beforeRow) {
                const idx = rows.indexOf(beforeRow);
                prevRow = idx > 0 ? rows[idx - 1] : null;
                anchorTabId = prevRow ? tidOf(prevRow) : null;
            } else {
                prevRow = rows.length ? rows[rows.length - 1] : null;
                anchorTabId = prevRow ? tidOf(prevRow) : null;
            }
            // slotGroupId: the group the INSERTION SLOT itself sits in. The
            // dragover's hit-test resolver can't see this (over the gap/ghost
            // the cursor hits the winscope background, not a member row), which
            // made an in-group slot read as a LOOSE drop: wrong ghost indent
            // AND a wrong drop (loose move instead of a group join). WYSIWYG
            // rule: the ghost is inserted before `beforeRow`, so it renders
            // inside a group's block exactly when `beforeRow` is one of its
            // members. Drop membership must match what the preview shows.
            //
            // BOUNDARY disambiguation: "loose right before the group" and "into
            // the group at slot 0" are the SAME index among tab rows — the
            // group HEADER between them is the visual boundary. Cursor above
            // the header's midline → loose (ghost renders ABOVE the header);
            // below → first in-group slot (ghost below the header, indented).
            let slotGroupId: any = null;
            if (win && beforeRow) {
                try {
                    const stampOf = (r: any) => { const t2 = r && this._wvTabObjInWin(win, tidOf(r), isReader); return (t2 && (this as any)._wvTabGroupStamp(t2)) || null; };
                    const g1 = stampOf(beforeRow);
                    if (g1 && g1 !== exclGrp) {
                        slotGroupId = g1;
                        if (stampOf(prevRow) !== g1) {
                            // beforeRow is the group's FIRST member → the header
                            // sits directly above it (skip ghost/hidden rows).
                            let hdr: any = beforeRow.previousElementSibling;
                            while (hdr && (hdr.classList.contains("wv-tabsmenu-ghost") || hdr.classList.contains("wv-tgrow-hidden"))) hdr = hdr.previousElementSibling;
                            if (hdr && hdr.classList && hdr.classList.contains("wv-tgrow-header")) {
                                const hr = hdr.getBoundingClientRect();
                                if (hr.height && clientY < hr.top + hr.height / 2) {
                                    slotGroupId = null;
                                    beforeRow = hdr;   // ghost above the header = loose
                                }
                            }
                        }
                    }
                } catch (e) {}
            }
            // COLLAPSED-GROUP boundary. A collapsed group's member rows are
            // hidden, so "before the group" and "after the group" collapse to
            // ONE slot among visible rows — the ghost always landed below the
            // header and the drop anchor always pointed above the group:
            // there was NO way to drop just before a collapsed group.
            // Disambiguate by cursor Y against each collapsed header in the
            // gap: above its midline → slot BEFORE that group (ghost above
            // the header, anchor unchanged); below every midline → slot
            // AFTER the last collapsed group (anchor = its last member, so
            // the drop index lands past the hidden members). Skipped for
            // in-group slots (slotGroupId set) and for group drags.
            try {
                if (win && !slotGroupId && !(opts && opts.snapOutOfGroups)) {
                    // Collect the header chain sitting directly above the slot.
                    // NOTE: hidden (collapsed) member rows are still IN the
                    // `rows` array (only their zero height skips them in the Y
                    // loop), so `prevRow` here is typically the group's LAST
                    // HIDDEN MEMBER — terminate on the first VISIBLE non-header
                    // row instead of on prevRow.
                    const hdrs: any[] = [];
                    let n: any = beforeRow ? beforeRow.previousElementSibling
                        : (scope.lastElementChild || null);
                    while (n) {
                        const cl = n.classList;
                        if (cl && cl.contains("wv-tgrow-header") && (n as any)._wvGroupId) hdrs.unshift(n);
                        else if (cl && (cl.contains("wv-tabsmenu-ghost") || cl.contains("wv-tgrow-hidden"))) { /* skip */ }
                        else break;
                        n = n.previousElementSibling;
                    }
                    const groupsAll = hdrs.length ? this._tabGroupsGet() : [];
                    const collapsedHdrs = hdrs.filter((h: any) => {
                        const g = groupsAll.find((x: any) => x.id === (h as any)._wvGroupId);
                        return g && g.collapsed;
                    });
                    if (collapsedHdrs.length) {
                        const lastMemberTid = (h: any) => {
                            const gid = (h as any)._wvGroupId;
                            let tid: any = null;
                            try {
                                if (isReader) { for (const t of ((win._wvWT && win._wvWT.tabs) || [])) { if (t.wvGroupId === gid) tid = t.id; } }
                                else { for (const t of win.Zotero_Tabs._tabs) { if ((this as any)._wvTabGroupStamp(t) === gid) tid = t.id; } }
                            } catch (e) {}
                            return tid;
                        };
                        let placedBefore: any = null, idx = -1;
                        for (let i = 0; i < collapsedHdrs.length; i++) {
                            const r = collapsedHdrs[i].getBoundingClientRect();
                            if (r.height && clientY < r.top + r.height / 2) { placedBefore = collapsedHdrs[i]; idx = i; break; }
                        }
                        if (placedBefore) {
                            beforeRow = placedBefore;   // ghost ABOVE this collapsed header
                            if (idx > 0) { const t = lastMemberTid(collapsedHdrs[idx - 1]); if (t != null) anchorTabId = t; }
                            else {
                                // BEFORE the first collapsed group: the native
                                // anchor is the group's last HIDDEN member (see
                                // the rows note above) — re-anchor to the first
                                // VISIBLE row above the header chain, so the
                                // drop index lands BEFORE the group's members.
                                let v: any = placedBefore.previousElementSibling;
                                while (v && v.classList && (v.classList.contains("wv-tgrow-hidden") || v.classList.contains("wv-tabsmenu-ghost") || v.classList.contains("wv-tgrow-header"))) v = v.previousElementSibling;
                                anchorTabId = (v && ((v as any)._wvSrcTabId || (v.dataset && v.dataset.tabId))) || null;
                                if (anchorTabId === "zotero-pane") anchorTabId = null;
                            }
                        } else {
                            // Below every collapsed header → after the LAST group.
                            const t = lastMemberTid(collapsedHdrs[collapsedHdrs.length - 1]);
                            if (t != null) anchorTabId = t;
                        }
                    }
                }
            } catch (e) {}
            return { beforeRow, anchorTabId, slotGroupId };
        } catch (e) { return { beforeRow: null, anchorTabId: null, slotGroupId: null }; }
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
            if (!panel) return;
            // Instance-token guard, NOT a boolean: the main window's tabs-menu
            // panel is a PERSISTENT XUL element, so a boolean flag survived a
            // plugin reload and blocked re-wiring — leaving the panel with the
            // OLD instance's listeners (stale logic; every popup-DnD fix was
            // inert after a hot reload). Re-wire when a new instance takes over;
            // the old listeners self-disable via the `self !== livePlugin()`
            // check at the top of each handler below.
            if (panel._wvRowDnDWiredBy === this) return;
            panel._wvRowDnDWiredBy = this;
            // Main panel → #zotero-tabs-menu-list; reader-window clone → #wv-wtl-list.
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list")
                || panel.querySelector("#wv-wtl-list");
            if (!list) return;
            const self = this;
            const isStale = () => panel._wvRowDnDWiredBy !== self;   // a newer instance re-wired
            const doc = list.ownerDocument;
            const panelWin = panel.ownerGlobal;
            const livePlugin = () => ((Zotero as any).Weavero && (Zotero as any).Weavero.plugin) || self;
            // Clear ONLY the drop-into outline classes — keep the ghost so
            // dragover can REUSE + reposition it (removing + recreating it every
            // dragover event was the flicker source).
            const clearDropInto = () => {
                try { for (const e of list.querySelectorAll(".wv-tabsmenu-drop-into")) e.classList.remove("wv-tabsmenu-drop-into"); } catch (er) {}
            };
            const clearGhost = () => {
                try { for (const g of list.querySelectorAll(".wv-tabsmenu-ghost")) g.remove(); } catch (er) {}
                // Ghost gone → the original row is the only copy again; unhide it.
                try { for (const r of list.querySelectorAll(".wv-tabsmenu-row-drag-hidden")) r.classList.remove("wv-tabsmenu-row-drag-hidden"); } catch (er) {}
            };
            // Full clear (outline + ghost) — for drop / dragend / dragleave.
            const clearHighlight = () => { clearDropInto(); clearGhost(); };
            // A preview of what's being dragged, appended at the END of the target
            // window's scope (where the move lands). For a tab: its icon + title.
            // For a group: its colour chip + name. Clearer than outlining an
            // unrelated existing row.
            const showGhostAt = (scope: any, beforeRow: any, info: any) => {
                try {
                    let ghost: any = list.querySelector(".wv-tabsmenu-ghost");
                    const reused = !!ghost;
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
                            name.textContent = (info.title || "") + (info.count ? ("  (" + info.count + ")") : "");
                            ghost.appendChild(name);
                        } else {
                            ghost = doc.createElement("div");
                            // `wv-tgrow-member` gives the group-member indent so the
                            // preview lines up inside the group it will join.
                            ghost.className = "row wv-tabsmenu-ghost" + (info.inGroup ? " wv-tgrow-member" : "");
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
                    // Keep the group-member indent in sync as the cursor moves
                    // in/out of a group (the ghost is reused across dragovers).
                    if (!info.isGroup) { try { ghost.classList.toggle("wv-tgrow-member", !!info.inGroup); } catch (er) {} }
                    // Insert at the precise drop slot (before `beforeRow`), else end.
                    if (beforeRow && beforeRow.parentNode) {
                        if (ghost.nextSibling !== beforeRow || ghost.parentNode !== beforeRow.parentNode) beforeRow.parentNode.insertBefore(ghost, beforeRow);
                    } else if (ghost.parentNode !== scope || ghost.nextSibling) {
                        scope.appendChild(ghost);
                    }
                    // While the ghost preview is showing, hide the original
                    // dragged row so the tab appears exactly once (it MOVES to
                    // the ghost's slot rather than showing dimmed + previewed).
                    // TAB drags only — a GROUP drag keeps its block EXPANDED
                    // and dimmed (hiding it re-flowed the list under the
                    // pointer and downward group moves kept missing).
                    try {
                        if (!livePlugin()._wvPopupGroupDrag) {
                            for (const r of list.querySelectorAll(".wv-tabsmenu-row-dragging:not(.wv-tabsmenu-row-drag-hidden)")) r.classList.add("wv-tabsmenu-row-drag-hidden");
                        }
                    } catch (er) {}
                } catch (er) {}
            };
            const clearDragging = () => {
                try { for (const r of list.querySelectorAll(".wv-tabsmenu-row-dragging")) r.classList.remove("wv-tabsmenu-row-dragging"); } catch (er) {}
            };

            list.addEventListener("dragstart", (e: any) => {
                try {
                    if (isStale()) return;
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
                        let count = 0;
                        try { count = lp._wvTabGroupOpenCount(gid) || 0; } catch (er2) {}
                        lp._wvPopupGroupDrag = { groupId: gid, name, color, homeWin, count };
                        try { e.dataTransfer.setData("application/x-weavero-popup-group-move", "1"); e.dataTransfer.effectAllowed = "move"; } catch (er) {}
                        grpSrc.classList.add("wv-tabsmenu-row-dragging");
                        return;
                    }
                    const row = e.target && e.target.closest && e.target.closest(".row[draggable='true']");
                    if (!row) return;
                    // Weavero rows carry _wvSrcWin; native current-window rows carry
                    // only data-tab-id (their source is the panel's own window).
                    let srcWin = (row as any)._wvSrcWin, tabId = (row as any)._wvSrcTabId, isReader = !!(row as any)._wvSrcIsReader;
                    // A "native row" = the main popup's OWN current-window tab
                    // (only data-tab-id, no _wvSrcWin). Zotero's per-row drag
                    // handles its same-window reorder; every OTHER row (reader
                    // clone, other-window) is Weavero-built with no native
                    // handler, so Weavero must handle its same-window reorder too.
                    let nativeRow = false;
                    if (!srcWin) {
                        const tid = row.dataset && row.dataset.tabId;
                        if (!tid || tid === "zotero-pane") return;
                        srcWin = panelWin; tabId = tid; isReader = false;
                        nativeRow = true;
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
                    livePlugin()._wvPopupRowDrag = { srcWin, tabId, isReader, title, itemType, nativeRow };
                    livePlugin()._wvPopupOverRes = null; livePlugin()._wvPopupOverY = null;
                    livePlugin()._wvDnDLastSwitchY = null; livePlugin()._wvDnDLastOverSig = null;
                    try { e.dataTransfer.setData("application/x-weavero-popup-tab-move", "1"); e.dataTransfer.effectAllowed = "move"; } catch (er) {}
                    row.classList.add("wv-tabsmenu-row-dragging");
                    // Weavero now handles ALL popup row drags (ghost preview +
                    // Zotero_Tabs.move on drop). Suppress Zotero's per-row native
                    // drag machinery — this capture-phase listener runs before
                    // the row's own listeners, so stopPropagation keeps native's
                    // dragstart from initialising (no live-row placeholder).
                    e.stopPropagation();
                } catch (er) {}
            }, true);

            // Intercept ALL popup tab-row drags: group joins, cross-window
            // moves, and same-window reorders — including native rows. Zotero's
            // per-row native drag (tabsMenuPanel.js) has no separate indicator
            // (it drags the live row itself as the placeholder), so leaving it
            // in charge shows no ghost preview; Weavero suppresses it entirely
            // (capture-phase stopPropagation) and reorders via Zotero_Tabs.move
            // on drop, so the dashed ghost + hidden original are consistent
            // across every drag.
            const shouldIntercept = (res: any, _drag: any) =>
                !!(res && res.target);

            list.addEventListener("dragover", (e: any) => {
                try {
                    if (isStale()) return;
                    // Group drag → drop onto ANY window's scope to move/reorder the
                    // group there, at the precise slot under the cursor.
                    const gdrag = livePlugin()._wvPopupGroupDrag;
                    if (gdrag) {
                        clearHighlight();
                        const scope = e.target && e.target.closest && e.target.closest(".wv-winscope");
                        if (scope && (scope as any)._wvWin) {
                            e.preventDefault();
                            try { e.dataTransfer.dropEffect = "move"; } catch (er) {}
                            const pos = self._wvPopupDropPosition(scope, e.clientY, { excludeGroupId: gdrag.groupId, snapOutOfGroups: true });
                            showGhostAt(scope, pos.beforeRow, { isGroup: true, color: gdrag.color, title: gdrag.name, count: gdrag.count });
                            // The group stays EXPANDED and visibly dimmed at the
                            // source while the counted ghost marks the target.
                            // (Hiding the block was tried first — Firefox-style —
                            // but the list re-flowed under the pointer on every
                            // hide/unhide and downward aims kept resolving into
                            // the group's own vacated span: "can't move down".
                            // Stable geometry keeps aim == result.)
                            // clearDragging() removes the dim on drop/dragend.
                            try {
                                for (const hdr of list.querySelectorAll(".wv-tgrow-header")) {
                                    if ((hdr as any)._wvGroupId !== gdrag.groupId) continue;
                                    if (!hdr.classList.contains("wv-tabsmenu-row-dragging")) hdr.classList.add("wv-tabsmenu-row-dragging");
                                    let n = hdr.nextElementSibling;
                                    while (n && n.classList && (n.classList.contains("wv-tgrow-member") || n.classList.contains("wv-tabsmenu-ghost"))) {
                                        if (n.classList.contains("wv-tgrow-member") && !n.classList.contains("wv-tabsmenu-row-dragging")) n.classList.add("wv-tabsmenu-row-dragging");
                                        n = n.nextElementSibling;
                                    }
                                }
                            } catch (er) {}
                            // No scope outline (same- or cross-window) — the
                            // group ghost alone marks the drop.
                        }
                        return;
                    }
                    const drag = livePlugin()._wvPopupRowDrag;
                    if (!drag) return;
                    // Our drag → native's per-row dragover must never run (its
                    // placeholder was never initialised, and its live-row
                    // reordering would fight the ghost preview).
                    e.stopPropagation();
                    // IGNORE dragovers over the DRAGGED ROW itself. Inserting the
                    // ghost pushes rows down so the dragged row (which follows the
                    // cursor) slides under it; that reads as "uninterceptable",
                    // clears the ghost, layout shifts back, the member re-appears,
                    // the ghost is recreated — a flicker oscillation. Keeping the
                    // ghost + state unchanged over our own row breaks the loop.
                    try {
                        const overRow = e.target && e.target.closest && e.target.closest(".row");
                        if (overRow) {
                            const overTid = (overRow as any)._wvSrcTabId || (overRow.dataset && overRow.dataset.tabId);
                            if (overTid && overTid === drag.tabId) { e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch (er) {} return; }
                            if (overRow.classList && overRow.classList.contains("wv-tabsmenu-row-dragging")) { e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch (er) {} return; }
                        }
                    } catch (er) {}
                    const res = self._wvResolvePopupDropTarget(panel, e.target, drag);
                    // TARGET-SWITCH HYSTERESIS: honor a CHANGE of resolved target
                    // only when the pointer actually moved. At the boundary
                    // between tab rows and the Tab Groups section the ghost's
                    // gap pushes a group row under the STATIONARY cursor, the
                    // group branch clears the ghost, the layout snaps back, the
                    // tab row returns, the ghost re-opens — an oscillation the
                    // other guards can't see because BOTH targets intercept.
                    try {
                        const sig = res && res.target
                            ? (res.target.groupId || "") + "|" + (res.target.win === drag.srcWin ? "same" : "other") + "|" + (res.target.isReader ? "R" : "M") + "|" + (res.target.win ? "w" : "g")
                            : "null";
                        if (sig !== self._wvDnDLastOverSig) {
                            if (self._wvDnDLastSwitchY != null && self._wvPopupOverRes
                                    && Math.abs(e.clientY - self._wvDnDLastSwitchY) < 18) {
                                // Layout-induced flap, not user movement — keep the
                                // current visual state + remembered drop target.
                                e.preventDefault();
                                try { e.dataTransfer.dropEffect = "move"; } catch (er) {}
                                return;
                            }
                            self._wvDnDLastSwitchY = e.clientY;
                            self._wvDnDLastOverSig = sig;
                        }
                    } catch (er) {}
                    clearDropInto();   // outline classes only — keep ghost (anti-flicker)
                    if (!shouldIntercept(res, drag) || !res.container) {
                        // GAP OSCILLATION guard: showing the ghost opens a gap the
                        // cursor falls into (resolving to the empty scope, not a
                        // row) — but the cursor didn't actually MOVE, the layout
                        // shifted under it. If the pointer Y is ~unchanged from the
                        // last interceptable hover, keep the ghost (a stationary
                        // pointer must not flicker it away). Only a real vertical
                        // move to a non-droppable area clears it.
                        if (self._wvPopupOverY != null && Math.abs(e.clientY - self._wvPopupOverY) < 18) {
                            e.preventDefault();
                            try { e.dataTransfer.dropEffect = "move"; } catch (er) {}
                            return;   // keep ghost + remembered target
                        }
                        clearGhost();
                        self._wvPopupOverRes = null; self._wvPopupOverY = null;
                        return;
                    }
                    // Remember the last INTERCEPTABLE hover — the drop's own
                    // e.target is unreliable (the dragged row follows the cursor
                    // and is what's under the pointer at release), so the drop
                    // handler falls back to this.
                    self._wvPopupOverRes = res; self._wvPopupOverY = e.clientY;
                    e.preventDefault();
                    try { e.dataTransfer.dropEffect = "move"; } catch (er) {}
                    if (res.target.win) {
                        // Cross-window move: preview the moving tab at the precise
                        // slot under the cursor (main targets); reader targets append.
                        const scope = (res.container.closest && res.container.closest(".wv-winscope")) || res.container;
                        const posInfo = self._wvPopupDropPosition(scope, e.clientY, { excludeTabId: drag.tabId });
                        // The hit-test resolver misses a slot INSIDE a group when
                        // the cursor is over the gap/ghost (it hits the winscope
                        // background) — the slot's own neighbours are the truth.
                        // Upgrading res.target (the remembered drop target) makes
                        // the drop a group join at that slot, not a loose move.
                        if (!res.target.groupId && posInfo.slotGroupId) res.target.groupId = posInfo.slotGroupId;
                        showGhostAt(scope, posInfo.beforeRow, { itemType: drag.itemType, title: drag.title, inGroup: !!res.target.groupId });
                        // No scope outline for window targets (same- OR cross-
                        // window) — framing a whole window is loud noise; the
                        // ghost alone marks the drop. The drop-into highlight
                        // remains only on group rows/headers (join targets).
                    } else {
                        clearGhost();
                        // Pure group join (a Tab Groups row, including a closed group)
                        // — highlight the group it will join.
                        res.container.classList.add("wv-tabsmenu-drop-into");
                    }
                } catch (er) {}
            }, true);

            list.addEventListener("drop", (e: any) => {
                try {
                    if (isStale()) return;
                    const lp = livePlugin();
                    // Group drag → move/reorder the whole group at the dropped slot.
                    const gdrag = lp._wvPopupGroupDrag;
                    if (gdrag) {
                        lp._wvPopupGroupDrag = null;
                        const scope = e.target && e.target.closest && e.target.closest(".wv-winscope");
                        if (!scope || !(scope as any)._wvWin) { clearHighlight(); clearDragging(); return; }
                        e.preventDefault(); e.stopPropagation();
                        const tgtWin = (scope as any)._wvWin;
                        const isReaderTgt = !!(scope as any)._wvIsReader;
                        // Compute the slot BEFORE clearing the ghost: clearGhost
                        // also UNHIDES the travelling group's source block, which
                        // re-expands the list — the drop Y (aimed at the collapsed
                        // layout the user saw) then lands back inside the group's
                        // old span and the move resolves to a no-op ("the group
                        // can't be moved down").
                        const pos = self._wvPopupDropPosition(scope, e.clientY, { excludeGroupId: gdrag.groupId, snapOutOfGroups: true });
                        const clientX = self._wvBarClientXForAnchor(tgtWin, pos.anchorTabId, isReaderTgt);
                        clearHighlight(); clearDragging();
                        // noFocus: a popup move rearranges windows in the
                        // BACKGROUND — stay on the current window's selected
                        // tab, don't surface the moved group.
                        Promise.resolve(lp._wvMoveGroupToWindowAt(gdrag.groupId, tgtWin, isReaderTgt, clientX, { noFocus: true })).then(() => {
                            try { if (typeof panel.refreshList === "function") panel.refreshList(); else lp._wvRegroupTabsMenu(panel); } catch (er) {}
                        }).catch(() => {});
                        return;
                    }
                    const drag = lp._wvPopupRowDrag;
                    clearHighlight(); clearDragging();
                    if (!drag) return;
                    // Ours → never let native's per-row drop run (its
                    // Zotero_Tabs.move would double-apply or fight ours).
                    e.stopPropagation();
                    let res = self._wvResolvePopupDropTarget(panel, e.target, drag);
                    // The drop's e.target is the element under the pointer at
                    // RELEASE — the dragged row itself follows the cursor and is
                    // usually what's there, giving a groupless, uninterceptable
                    // result. Fall back to the last INTERCEPTABLE dragover
                    // target (what the user hovered + saw highlighted), when the
                    // release was within ~1 row of it.
                    if (!shouldIntercept(res, drag) && self._wvPopupOverRes
                            && self._wvPopupOverY != null
                            && Math.abs(e.clientY - self._wvPopupOverY) < 30) {
                        res = self._wvPopupOverRes;
                    }
                    self._wvPopupOverRes = null; self._wvPopupOverY = null;
                    self._wvDnDLastSwitchY = null; self._wvDnDLastOverSig = null;
                    if (!shouldIntercept(res, drag)) return;   // no resolvable target — drop is a no-op
                    e.preventDefault(); e.stopPropagation();
                    lp._wvPopupRowDrag = null;
                    const target: any = res.target;
                    // Popup moves happen in the BACKGROUND: keep the current
                    // window's selection/focus, don't surface the moved tab.
                    target.noFocus = true;
                    // Precise insertion index — for a loose move AND a group
                    // join (the group branch clamps it into the group's run, so
                    // the tab lands at the exact slot the user aimed at).
                    if (target.win) {
                        try {
                            // Scope from the RESOLVED container (which may be the
                            // remembered hover target — the release often lands on
                            // the dragged row, whose closest scope would be wrong).
                            let scope = (res && res.container && res.container.closest && res.container.closest(".wv-winscope"))
                                || (e.target && e.target.closest && e.target.closest(".wv-winscope"));
                            if (scope) {
                                const pos = self._wvPopupDropPosition(scope, e.clientY, { excludeTabId: drag.tabId });
                                // Slot strictly inside a group → the drop is a group
                                // join at that slot (see the dragover twin of this).
                                if (!target.groupId && pos.slotGroupId) target.groupId = pos.slotGroupId;
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
                try { if (isStale()) return; const lp = livePlugin(); lp._wvPopupRowDrag = null; lp._wvPopupGroupDrag = null; clearHighlight(); clearDragging(); } catch (er) {}
            }, true);
            list.addEventListener("dragleave", (e: any) => {
                try { if (isStale()) return; if (!list.contains(e.relatedTarget)) clearHighlight(); } catch (er) {}
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
                // Show the anchor mark only when it's ALSO shown in the window
                // itself — >1 window of any kind (matches _wvAnchorDecorVisible).
                const wIsAnchor = this._wvIsAnchorWindow(w) && this._wvAnchorDecorVisible();
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
            // The current-session box scrolls its windows inside `.wv-sess-body`,
            // whose stylesheet cap is a blind `max-height: 55vh` — the popup
            // stopped well short of the screen bottom while the session content
            // scrolled internally. Give the body the exact space the list has
            // left after the non-session content (headers, Sessions footer), so
            // the popup grows to the available height before any inner scroll.
            try {
                const body = list.querySelector(".wv-sess-body");
                if (body) {
                    const otherH = list.scrollHeight - (body as any).clientHeight;
                    const bodyAvail = Math.max(120, avail - otherH);
                    (body as any).style.setProperty("max-height", bodyAvail + "px", "important");
                }
            } catch (e) {}
            const content = list.scrollHeight;
            const h = Math.min(content, avail);
            // The list is a XUL vbox — CSS max-height is ignored, but an explicit
            // height is honoured. Set it so the list caps to the on-screen space and
            // its (non-shrinking) children overflow → it scrolls. Use min(content,…)
            // so a short list doesn't leave empty space below.
            list.style.setProperty("height", h + "px", "important");
            list.style.setProperty("overflow-y", "auto", "important");
            // Sections are appended ASYNCHRONOUSLY after the first fit (other
            // windows, groups nesting, sessions), growing the content past the
            // measured snapshot — the list then scrolled inside a stale short
            // height, wasting the space below the popup. Re-fit on any child
            // change (debounced to one per frame). Skipped mid-drag: the ghost
            // preview inserts/removes rows every dragover and a refit there
            // would re-introduce the height-jump flicker.
            if ((list as any)._wvFitObsBy !== this) {
                (list as any)._wvFitObsBy = this;
                try { if ((list as any)._wvFitObs) (list as any)._wvFitObs.disconnect(); } catch (e) {}
                const obs = new win.MutationObserver(() => {
                    try {
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (!lp || lp._wvPopupRowDrag || lp._wvPopupGroupDrag) return;
                        if ((list as any)._wvFitPending) return;
                        (list as any)._wvFitPending = true;
                        win.requestAnimationFrame(() => {
                            (list as any)._wvFitPending = false;
                            try { lp._wvTabsMenuFitListHeight && lp._wvTabsMenuFitListHeight(panel); } catch (e) {}
                        });
                    } catch (e) {}
                });
                obs.observe(list, { childList: true, subtree: true });
                (list as any)._wvFitObs = obs;
            }
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
        // Window-name-in-title modes: re-compose the OS title with the
        // new name immediately (wires the shadow if the mode just made
        // it necessary; re-applies via doc.title = doc.title otherwise).
        try {
            if (this._getWindowTitleNameMode() !== "off"
                || this._getEnableWindowTitleGlyphs()) {
                this._wvWireTitleGlyph(win);
            }
        } catch (e) {}
        // Reader windows persist nothing (no window index) but their mark
        // tooltip must refresh with the new session-scoped name.
        try {
            if ((win as any)._wvWT) {
                this._wvUpdateWindowBadgeDot(win, !!(this as any)._getTabsAndWindowsMaster(), true);
            }
        } catch (e) {}
        const idx = this._wvWindowIndex(win);
        if (idx < 0) return;
        const map = this._wvWindowTitlesGet();
        if (title) map[String(idx)] = title; else delete map[String(idx)];
        this._wvWindowTitlesSet(map);
        // Keep the title-bar mark's hover tooltip in sync with the new name.
        try { this._wvUpdateMainWindowIndicator(win); } catch (e) {}
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
    /** Anchor decorations (⚓ icon/overlay/title glyph/mark) show only
     *  when MORE THAN ONE window exists — mains AND reader windows
     *  counted (user rule 2026-07-15): a lone window has no "which one
     *  is the main one?" ambiguity to resolve. */
    _wvAnchorDecorVisible(): boolean {
        try {
            let n = (Zotero.getMainWindows() || []).length;
            if (n > 1) return true;
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) { en.getNext(); if (++n > 1) return true; }
            return false;
        } catch (e) { return true; }
    }
    /** Right-side window-identity glyph for a XUL menuitem window row
     *  (the Move Tab / Move Group / Open-in target lists — user request
     *  2026-07-15): the same colour dot the List-all-tabs window
     *  headers carry (square = main, circle = reader, shared colour
     *  pool), and the ⚓ for the anchor window. Menuitems can't host
     *  child elements, so the glyph is a ::after driven by classes +
     *  a per-item CSS variable (same technique as the column-picker
     *  logo mark). */
    _wvDecorateWindowTargetMenuitem(doc: any, mi: any, targetWin: any, isReader: boolean) {
        try {
            this._wvEnsureMvWinGlyphStyles(doc);
            const anchor = !isReader && this._wvIsAnchorWindow(targetWin)
                && this._wvAnchorDecorVisible();
            if (anchor) { mi.classList.add("wv-mvwin-anchor"); return; }
            const color = WV_WIN_BADGE_COLORS[
                this._wvTitleGlyphIdx(targetWin, isReader) % WV_WIN_BADGE_COLORS.length];
            mi.classList.add(isReader ? "wv-mvwin-reader" : "wv-mvwin-main");
            mi.style.setProperty("--wv-win-color", color);
        } catch (e) {}
    }

    _wvEnsureMvWinGlyphStyles(doc: any) {
        try {
            if (doc.getElementById("wv-mvwin-glyph-styles")) return;
            const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
            style.id = "wv-mvwin-glyph-styles";
            const anchorSvg = encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + WV_ANCHOR_VIEWBOX + '">'
                + '<path fill="black" d="' + WV_ANCHOR_PATH + '"/></svg>');
            // The ::after rides the LABEL element, not the menuitem box —
            // on the menuitem it landed after the flexible spacer, flushed
            // to the popup's right edge; on the label it hugs the name,
            // matching the List-all-tabs headers (user report 2026-07-16).
            // Both label classes covered (menu-iconic-text on iconic rows,
            // menu-text otherwise). The colour var inherits from the item.
            const LBL = "menuitem.wv-mvwin-main > .menu-iconic-text, menuitem.wv-mvwin-main > .menu-text";
            const LBLR = "menuitem.wv-mvwin-reader > .menu-iconic-text, menuitem.wv-mvwin-reader > .menu-text";
            const LBLA = "menuitem.wv-mvwin-anchor > .menu-iconic-text, menuitem.wv-mvwin-anchor > .menu-text";
            const withAfter = (sel: string) => sel.split(", ").map(s => s + "::after").join(", ");
            style.textContent = [
                // Same 9px dot as .wv-winhdr-color-dot in the tabs menu.
                LBL.split(", ").concat(LBLR.split(", ")).map(s => s + "::after").join(", ") + " {",
                "  content: ''; display: inline-block;",
                "  width: 9px; height: 9px; margin-inline-start: 7px;",
                // vertical-align is INERT here — Zotero's menu labels lay
                // their children out by flex, so the earlier -1px tweak never
                // moved anything and the dot rode 3.5px high (probe-measured,
                // user report 2026-07-17). position/top does apply: 4.5px
                // puts the dot centre exactly +1px below the label centre,
                // the same offset the List-all-tabs .wv-winhdr-color-dot
                // reference sits at (probed side by side).
                "  position: relative; top: 4.5px;",
                "  background-color: var(--wv-win-color);",
                "}",
                withAfter(LBL) + " { border-radius: 2px; }",
                withAfter(LBLR) + " { border-radius: 50%; }",
                withAfter(LBLA) + " {",
                "  content: ''; display: inline-block;",
                "  width: 11px; height: 11px; margin-inline-start: 7px;",
                "  position: relative; top: 4.5px;",   // same flex-label geometry as the dots above
                "  background-color: currentColor;",
                "  mask: url(\"data:image/svg+xml," + anchorSvg + "\") center/contain no-repeat;",
                "}",
            ].join("\n");
            (doc.head || doc.documentElement).appendChild(style);
        } catch (e) {}
    }

    /** The window's DEFAULT (un-renamed) display name — "Window N" for
     *  mains, "Reader window" / "Reader window N" for readers (the same
     *  numbering the tabs-menu window sections use). */
    _wvWindowDefaultName(win: any): string {
        try {
            const t = win && win.document && win.document.documentElement
                && win.document.documentElement.getAttribute("windowtype");
            if (t === "zotero:reader") {
                let rn = 0, i = 0;
                const en = Services.wm.getEnumerator("zotero:reader");
                while (en.hasMoreElements()) { i++; if (en.getNext() === win) rn = i; }
                return rn > 1 ? "Reader window " + rn : "Reader window";
            }
            const idx = this._wvWindowIndex(win);
            return "Window " + (idx >= 0 ? idx + 1 : "?");
        } catch (e) { return "Window ?"; }
    }

    // (_wvWindowRenamePrompt was removed 2026-07-16: the "Manage
    //  Window" editor panel (_wvShowWindowEditor) replaced it as the
    //  single rename surface — name field + one-click default reset.)

    /** The shared window actions — Convert, Save and Close, and the
     *  colour swatch row — appended to both the title-bar mark menu
     *  and the tabs-menu window-header menu (user request 2026-07-15:
     *  same options in both places). `panel` non-null refreshes the
     *  tabs menu after a recolour. */
    /** Window right-click editor — the window twin of the tab-group
     *  chip editor's "Manage Tab Group" panel (user request
     *  2026-07-15): title, labelled name field pre-filled with the
     *  CURRENT effective name (Enter/change applies; the ↺ button
     *  resets to the default in one click), the colour swatches, then
     *  menu-style action rows (Convert / Save and Close / Move Window
     *  to ▸). Serves BOTH entry points: the title-bar identity mark
     *  and the tabs-menu window header. Gates: the last main window
     *  offers neither Convert nor Save and Close nor Move (Zotero
     *  must keep one main window); the anchor gets no swatches (its
     *  mark is the ⚓). */
    _wvShowWindowEditor(targetWin: any, isReader: boolean, menuWin: any, panel: any, e: any) {
        try {
            const doc = menuWin.document;
            const HTML = "http://www.w3.org/1999/xhtml";
            const edPanel = (this as any)._wvTabGroupEnsurePanel(menuWin, "wv-window-editor");
            // Draggable by its title/info lines — the WINDOW card only
            // (user decision 2026-07-16; the strip-opened group editor
            // stays put). Idempotent across opens.
            try { (this as any)._wvMakePanelDraggable(menuWin, edPanel); } catch (er) {}
            const body = edPanel.querySelector(".wv-tg-panel-body");
            while (body.firstChild) body.removeChild(body.firstChild);
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const isAnchor = !isReader && this._wvIsAnchorWindow(targetWin);
            const lastMain = !isReader && (Zotero.getMainWindows() || []).length < 2;
            const refreshPanel = () => {
                try {
                    const p: any = live();
                    if (!p) return;
                    if (panel && typeof panel.refreshList === "function") panel.refreshList();
                    else if (panel) p._wvRegroupTabsMenu(panel);
                    p._wvTabsMenuRefreshOpenPanel();
                } catch (er) {}
            };

            const title = doc.createElementNS(HTML, "div");
            title.className = "wv-tg-title";
            title.textContent = "Manage Window";
            body.appendChild(title);

            // Context line: kind, status, tab count, owning session (user
            // request 2026-07-16). The card only opens on LIVE windows —
            // saved ones are managed from their box's context menu — so
            // the status always reads Active; live windows belong to the
            // active session.
            try {
                let count = 0;
                if (isReader) {
                    const st: any = (targetWin as any)._wvWT;
                    count = ((st && st.tabs) || []).filter((t: any) => t && t.itemID != null).length;
                } else {
                    const Z: any = targetWin.Zotero_Tabs;
                    count = ((Z && Z._tabs) || []).filter((t: any) => t && t.type !== "library").length;
                }
                const activeId = (this as any)._wvTabSessionGetActiveId
                    ? (this as any)._wvTabSessionGetActiveId() : null;
                const sess = activeId
                    ? ((this as any)._wvTabSessionNamedList() || []).find((s: any) => s.id === activeId)
                    : null;
                const info = doc.createElementNS(HTML, "div");
                info.className = "wv-tg-info";
                info.textContent = (isReader ? "Reader window" : (isAnchor ? "Main window (anchor)" : "Main window"))
                    + " · Active · " + count + " tab" + (count === 1 ? "" : "s")
                    + (sess ? " · " + (sess.name || "Session") : "");
                body.appendChild(info);
            } catch (er) {}

            // Name — current effective name, never empty; ↺ = default.
            const defName = this._wvWindowDefaultName(targetWin);
            const nameLabel = doc.createElementNS(HTML, "div");
            nameLabel.className = "wv-tg-label";
            nameLabel.textContent = "Name";
            body.appendChild(nameLabel);
            const nameRow = doc.createElementNS(HTML, "div");
            nameRow.className = "wv-tg-row";
            const input: any = doc.createElementNS(HTML, "input");
            input.className = "wv-tg-name-input";
            input.value = this._wvWindowCustomTitle(targetWin) || defName;
            input.setAttribute("placeholder", defName);
            const applyName = () => {
                try {
                    const p: any = live();
                    if (!p) return;
                    const v = String(input.value || "").trim();
                    p._wvWindowSetCustomTitle(targetWin, (!v || v === defName) ? null : v);
                    refreshPanel();
                } catch (er) {}
            };
            input.addEventListener("change", applyName);
            input.addEventListener("keydown", (ev: any) => {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    applyName();
                    try { edPanel.hidePopup(); } catch (er) {}
                }
            });
            nameRow.appendChild(input);
            const reset: any = doc.createElementNS(HTML, "button");
            reset.className = "wv-tg-btn";
            reset.textContent = "↺";
            reset.setAttribute("title", "Use the default name (" + defName + ")");
            reset.addEventListener("click", () => {
                try {
                    const p: any = live();
                    if (p) p._wvWindowSetCustomTitle(targetWin, null);
                    input.value = defName;
                    refreshPanel();
                } catch (er) {}
            });
            nameRow.appendChild(reset);
            body.appendChild(nameRow);

            // Colour swatches — swatch shape mirrors the window's mark
            // (circle = reader, square = main). Not for the anchor.
            if (!isAnchor) {
                const wrap = doc.createElementNS(HTML, "div");
                wrap.className = "wv-tg-swatches";
                const curIdx = (targetWin as any)._wvTitleGlyphIdx != null
                    ? ((targetWin as any)._wvTitleGlyphIdx % WV_WIN_BADGE_COLORS.length) : -1;
                for (let i = 0; i < WV_WIN_BADGE_COLORS.length; i++) {
                    const sw: any = doc.createElementNS(HTML, "div");
                    sw.className = "wv-tg-swatch" + (i === curIdx ? " wv-selected" : "");
                    sw.style.background = WV_WIN_BADGE_COLORS[i];
                    sw.style.borderRadius = isReader ? "50%" : "3px";
                    const idx = i;
                    sw.addEventListener("click", (ev: any) => {
                        try {
                            ev.stopPropagation();
                            const p: any = live();
                            if (!p) return;
                            // Manual pick — verbatim on purpose (duplicating
                            // a colour deliberately is the user's call).
                            (targetWin as any)._wvTitleGlyphIdx = idx;
                            delete (targetWin as any)._wvWinIconName;
                            delete (targetWin as any)._wvOverlayName;
                            try { p._wvApplyWindowIcon(targetWin); } catch (e2) {}
                            try {
                                const mt: any = p._wvOvMonTop;
                                if (mt) delete mt[p._wvOvScreenKeyOf(targetWin)];
                                p._wvOvSetBadge(targetWin, "recolor");
                            } catch (e2) {}
                            try {
                                if (isReader) p._wvUpdateWindowBadgeDot(targetWin, !!p._getTabsAndWindowsMaster(), true);
                                else p._wvUpdateMainWindowIndicator(targetWin);
                            } catch (e2) {}
                            for (const x of wrap.querySelectorAll(".wv-tg-swatch")) x.classList.remove("wv-selected");
                            sw.classList.add("wv-selected");
                            refreshPanel();
                        } catch (e2) {}
                    });
                    wrap.appendChild(sw);
                }
                body.appendChild(wrap);
            }

            const mkSep = () => {
                const s = doc.createElementNS(HTML, "div");
                s.className = "wv-tg-sep";
                body.appendChild(s);
            };
            const mkItem = (label: string, fn: (p: any) => void) => {
                const row = doc.createElementNS(HTML, "div");
                row.className = "wv-tg-menuitem";
                row.textContent = label;
                row.addEventListener("click", () => {
                    try { edPanel.hidePopup(); } catch (er) {}
                    try { const p: any = live(); if (p) fn(p); } catch (er) {}
                });
                body.appendChild(row);
            };

            if (!lastMain) {
                mkSep();
                mkItem(isReader ? "Convert to Main Window" : "Convert to Reader Window", (p: any) => {
                    if (isReader) p._wvConvertReaderWindowToMain(targetWin);
                    else p._wvConvertMainWindowToReader(targetWin);
                });
                mkItem("Save and Close Window", (p: any) => p._wvSaveAndCloseWindow(targetWin, isReader));
                // Move Window to ▸ — flyout with the OTHER sessions, the
                // same pattern (and native hover timing) as the group
                // editor's "Move group to ▸".
                try {
                    const activeId = (this as any)._wvTabSessionGetActiveId
                        ? (this as any)._wvTabSessionGetActiveId() : null;
                    const others = ((this as any)._wvTabSessionNamedList
                        ? (this as any)._wvTabSessionNamedList() : [])
                        .filter((s: any) => s && s.id !== activeId);
                    if (others.length) {
                        const mvRow = doc.createElementNS(HTML, "div");
                        mvRow.className = "wv-tg-menuitem";
                        (mvRow as any).style.display = "flex";
                        (mvRow as any).style.justifyContent = "space-between";
                        (mvRow as any).style.alignItems = "center";
                        const mvLabel = doc.createElementNS(HTML, "span");
                        mvLabel.textContent = "Move Window to";
                        const mvArrow = doc.createElementNS(HTML, "span");
                        mvArrow.textContent = "▸";
                        (mvArrow as any).style.opacity = "0.6";
                        mvRow.appendChild(mvLabel);
                        mvRow.appendChild(mvArrow);
                        let mvPop: any = doc.getElementById("wv-winedit-move-targets");
                        if (mvPop) mvPop.remove();
                        mvPop = doc.createXULElement("menupopup");
                        mvPop.id = "wv-winedit-move-targets";
                        for (const s of others) {
                            const mi: any = doc.createXULElement("menuitem");
                            mi.setAttribute("label", s.name || "Session");
                            const sid = s.id;
                            mi.addEventListener("command", () => {
                                try { edPanel.hidePopup(); } catch (er) {}
                                try { const p: any = live(); if (p) p._wvMoveWindowToSession(targetWin, isReader, sid); } catch (er) {}
                            });
                            mvPop.appendChild(mi);
                        }
                        (doc.querySelector("popupset") || doc.documentElement).appendChild(mvPop);
                        const openFlyout = () => { try { mvPop.openPopup(mvRow, "end_before", 0, 0, false, false); } catch (er) {} };
                        mvRow.addEventListener("click", openFlyout);
                        mvRow.addEventListener("mouseenter", openFlyout);
                        let flyTimer: any = null;
                        const cancelFly = () => { if (flyTimer) { try { menuWin.clearTimeout(flyTimer); } catch (er) {} flyTimer = null; } };
                        body.addEventListener("mouseover", (ev: any) => {
                            try {
                                const row = ev.target && ev.target.closest && ev.target.closest(".wv-tg-menuitem");
                                if (!row) return;
                                if (row === mvRow) { cancelFly(); return; }
                                if ((mvPop.state === "open" || mvPop.state === "showing") && !flyTimer) {
                                    const p: any = live();
                                    const delayMs = (p && p._wvSubmenuDelay) ? p._wvSubmenuDelay() : 300;
                                    flyTimer = menuWin.setTimeout(() => {
                                        flyTimer = null;
                                        try { if (mvPop.state === "open" || mvPop.state === "showing") mvPop.hidePopup(); } catch (er) {}
                                    }, delayMs);
                                }
                            } catch (er) {}
                        });
                        mvPop.addEventListener("mouseover", () => { try { cancelFly(); } catch (er) {} }, true);
                        edPanel.addEventListener("popuphidden", () => { try { cancelFly(); mvPop.hidePopup(); } catch (er) {} }, { once: true });
                        body.appendChild(mvRow);
                    }
                } catch (er) {}
            }

            // isContextMenu=TRUE: the editor is opened from a REAL
            // right-click, and without the flag the pending mouseup
            // dismissed the panel the instant it opened (user report
            // 2026-07-16 — synthetic test events carry no mouseup, so
            // the regression was invisible to the automated checks;
            // the old context menupopups passed true here too).
            // SAME vertical landing as the Manage Tab Group card (user
            // report 2026-07-16, second round): that card anchors to a
            // chip INSIDE the tab strip, so "after_start" clears the
            // strip — but the window mark lives in the TITLE BAR, so a
            // plain below-the-anchor drop still covered the strip's
            // buttons. Compute the extra offset down to the strip's
            // bottom edge so both cards open at the same height.
            const anchorEl = (e && e.target && e.target.ownerDocument === doc) ? e.target : null;
            if (anchorEl) {
                let dy = 6;
                try {
                    const strip = doc.getElementById("tab-bar-container");
                    if (strip) {
                        const ar = anchorEl.getBoundingClientRect();
                        const sr = strip.getBoundingClientRect();
                        if (sr.bottom > ar.bottom) dy = Math.round(sr.bottom - ar.bottom) + 4;
                    }
                } catch (er) {}
                edPanel.openPopup(anchorEl, "after_start", 0, dy, true, false);
            }
            else edPanel.openPopupAtScreen(e.screenX, e.screenY + 24, true);
            edPanel.addEventListener("popupshown", () => {
                try { input.focus(); input.select(); } catch (er) {}
            }, { once: true });
        } catch (e2) { Zotero.debug("[Weavero] _wvShowWindowEditor err: " + e2); }
    }

    /** Right-click context menu for a window header in the tabs dropdown:
     *  a "Rename Window…" item (and "Reset to Default Name" when a custom title
     *  is set), so the rename isn't a surprise direct prompt. Mirrors the
     *  tab-group context menu (`_wvTabsMenuGroupContext`) so the two feel the same. */
    /** Prompt-style rename dialog WITH colour swatches (user request
     *  2026-07-16) — the List-all-tabs rename surface for groups and
     *  windows. Services.prompt can't host swatches, so this is a
     *  small CENTERED panel styled like the native prompt: title, name
     *  field, swatch row, OK/Cancel. Callers must close the tabs-menu
     *  panel first (panel-over-panel rollup kills XUL panels under
     *  real clicks). Colour is applied only on OK.
     *  opts: { title, name, placeholder?, swatches: [{hex, selected,
     *  radius}], onAccept({ name, swatchIndex|null }) }. */
    _wvShowRenameDialog(win: any, opts: any) {
        try {
            const doc = win.document;
            const HTML = "http://www.w3.org/1999/xhtml";
            const panel = (this as any)._wvTabGroupEnsurePanel(win, "wv-rename-dialog");
            const body = panel.querySelector(".wv-tg-panel-body");
            while (body.firstChild) body.removeChild(body.firstChild);
            const title = doc.createElementNS(HTML, "div");
            title.className = "wv-tg-title";
            title.textContent = opts.title || "Rename";
            body.appendChild(title);
            const input: any = doc.createElementNS(HTML, "input");
            input.className = "wv-tg-name-input";
            input.value = opts.name || "";
            if (opts.placeholder) input.setAttribute("placeholder", opts.placeholder);
            (input as any).style.margin = "6px 0";
            body.appendChild(input);
            let chosen: any = null;
            if (opts.swatches && opts.swatches.length) {
                const row = doc.createElementNS(HTML, "div");
                row.className = "wv-tg-swatches";
                (row as any).style.margin = "2px 0 6px";
                opts.swatches.forEach((s: any, i: number) => {
                    const sw: any = doc.createElementNS(HTML, "div");
                    sw.className = "wv-tg-swatch" + (s.selected ? " wv-selected" : "");
                    sw.style.background = s.hex;
                    if (s.radius) sw.style.borderRadius = s.radius;
                    sw.addEventListener("click", () => {
                        try {
                            for (const x of row.querySelectorAll(".wv-tg-swatch")) x.classList.remove("wv-selected");
                            sw.classList.add("wv-selected");
                            chosen = i;
                        } catch (e) {}
                    });
                    row.appendChild(sw);
                });
                body.appendChild(row);
            }
            const btnRow = doc.createElementNS(HTML, "div");
            btnRow.className = "wv-tg-btnrow";
            const mkBtn = (label: string, fn: () => void) => {
                const b: any = doc.createElementNS(HTML, "button");
                b.className = "wv-tg-btn";
                b.textContent = label;
                b.addEventListener("click", fn);
                btnRow.appendChild(b);
            };
            const submit = () => {
                try { panel.hidePopup(); } catch (e) {}
                try { opts.onAccept && opts.onAccept({ name: String(input.value || "").trim(), swatchIndex: chosen }); } catch (e) {}
            };
            mkBtn("OK", submit);
            mkBtn("Cancel", () => { try { panel.hidePopup(); } catch (e) {} });
            body.appendChild(btnRow);
            input.addEventListener("keydown", (ev: any) => {
                if (ev.key === "Enter") { ev.preventDefault(); submit(); }
                else if (ev.key === "Escape") { ev.preventDefault(); try { panel.hidePopup(); } catch (e) {} }
            });
            panel.addEventListener("popupshown", () => {
                try { input.focus(); input.select(); } catch (e) {}
            }, { once: true });
            // Centered like a prompt window.
            const px = win.screenX + Math.max(60, (win.outerWidth - 340) / 2);
            const py = win.screenY + Math.max(80, win.outerHeight / 4);
            panel.openPopupAtScreen(px, py, false);
        } catch (e) { Zotero.debug("[Weavero] _wvShowRenameDialog err: " + e); }
    }

    /** Simple rename for a window from the List-all-tabs context menu —
     *  prompt-style with colour swatches (user requests 2026-07-16).
     *  The Manage Window card stays exclusive to the title-bar glyph
     *  right-click. Submitting the default name (or blank) clears the
     *  custom title so the default numbering keeps tracking. */
    _wvWindowPromptRename(parentWin: any, targetWin: any, panel: any) {
        try {
            try { if (panel && panel.hidePopup) panel.hidePopup(); } catch (e) {}
            const defName = this._wvWindowDefaultName(targetWin);
            const wt = targetWin.document && targetWin.document.documentElement
                && targetWin.document.documentElement.getAttribute("windowtype");
            const isReader = wt === "zotero:reader";
            const isAnchor = !isReader && this._wvIsAnchorWindow(targetWin);
            const curIdx = (targetWin as any)._wvTitleGlyphIdx != null
                ? ((targetWin as any)._wvTitleGlyphIdx % WV_WIN_BADGE_COLORS.length) : -1;
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            this._wvShowRenameDialog(parentWin, {
                title: "Rename Window",
                name: this._wvWindowCustomTitle(targetWin) || defName,
                placeholder: defName,
                // No swatches for the anchor — its mark is the ⚓.
                swatches: isAnchor ? [] : WV_WIN_BADGE_COLORS.map((hex: string, i: number) => ({
                    hex, selected: i === curIdx, radius: isReader ? "50%" : "3px",
                })),
                onAccept: ({ name, swatchIndex }: any) => {
                    try {
                        const p: any = live();
                        if (!p) return;
                        p._wvWindowSetCustomTitle(targetWin, (!name || name === defName) ? null : name);
                        if (swatchIndex != null && swatchIndex !== curIdx) {
                            (targetWin as any)._wvTitleGlyphIdx = swatchIndex;   // manual pick — verbatim
                            delete (targetWin as any)._wvWinIconName;
                            delete (targetWin as any)._wvOverlayName;
                            try { p._wvApplyWindowIcon(targetWin); } catch (e) {}
                            try {
                                const mt: any = p._wvOvMonTop;
                                if (mt) delete mt[p._wvOvScreenKeyOf(targetWin)];
                                p._wvOvSetBadge(targetWin, "recolor");
                            } catch (e) {}
                            try {
                                if (isReader) p._wvUpdateWindowBadgeDot(targetWin, !!p._getTabsAndWindowsMaster(), true);
                                else p._wvUpdateMainWindowIndicator(targetWin);
                            } catch (e) {}
                        }
                        p._wvTabsMenuRefreshOpenPanel();
                    } catch (e) {}
                },
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWindowPromptRename err: " + e); }
    }

    /** Window right-click INSIDE List all tabs — a plain MENUPOPUP, the
     *  tab-group convention (user decision 2026-07-16): menupopups are
     *  native context menus with rollup exemptions, so they open fine
     *  over the tabs panel, where the Manage Window CARD (a XUL panel)
     *  could not — real right-clicks killed it via mouseup dismissal
     *  and then chain rollup, both invisible to synthetic tests.
     *  "Rename Window…" opens the same simple modal prompt as the
     *  tab-group / session renames here; the Manage Window card stays
     *  on the title-bar glyph right-click. */
    _wvWindowHeaderContext(targetWin: any, panel: any, e: any) {
        try {
            const menuWin = (panel && panel.ownerGlobal) || targetWin;
            const doc = menuWin.document;
            const wt = targetWin.document && targetWin.document.documentElement
                && targetWin.document.documentElement.getAttribute("windowtype");
            const isReader = wt === "zotero:reader";
            const isAnchor = !isReader && this._wvIsAnchorWindow(targetWin);
            const lastMain = !isReader && (Zotero.getMainWindows() || []).length < 2;
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const sx = e.screenX, sy = e.screenY;
            let pop: any = doc.getElementById("wv-winhdr-context");
            if (pop) pop.remove();                       // rebuild fresh each time
            pop = doc.createXULElement("menupopup");
            pop.id = "wv-winhdr-context";
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
            // Simple modal prompt, NOT the Manage Window card — matching
            // the tab-group and session rename prompts in this menu (user
            // decision 2026-07-16; the card stays on the title-bar glyph
            // right-click only).
            mk("Rename Window…", (p: any) => p._wvWindowPromptRename(menuWin, targetWin, panel));
            if (!lastMain) {
                pop.appendChild(doc.createXULElement("menuseparator"));
                mk(isReader ? "Convert to Main Window" : "Convert to Reader Window", (p: any) => {
                    if (isReader) p._wvConvertReaderWindowToMain(targetWin);
                    else p._wvConvertMainWindowToReader(targetWin);
                });
                mk("Save and Close Window", (p: any) => p._wvSaveAndCloseWindow(targetWin, isReader));
                try {
                    const activeId = (this as any)._wvTabSessionGetActiveId
                        ? (this as any)._wvTabSessionGetActiveId() : null;
                    const others = ((this as any)._wvTabSessionNamedList
                        ? (this as any)._wvTabSessionNamedList() : [])
                        .filter((s: any) => s && s.id !== activeId);
                    if (others.length) {
                        const mv: any = doc.createXULElement("menu");
                        mv.setAttribute("label", "Move Window to");
                        const mvPop: any = doc.createXULElement("menupopup");
                        for (const s of others) {
                            const mi: any = doc.createXULElement("menuitem");
                            mi.setAttribute("label", s.name || "Session");
                            const sid = s.id;
                            mi.addEventListener("command", () => {
                                try { const p: any = live(); if (p) p._wvMoveWindowToSession(targetWin, isReader, sid); } catch (er) {}
                            });
                            mvPop.appendChild(mi);
                        }
                        mv.appendChild(mvPop);
                        pop.appendChild(mv);
                    }
                } catch (er) {}
            }
            // Colour swatches inline (menupopups host the HTML row fine —
            // the pre-card menu did). Not for the anchor (its mark is ⚓).
            if (!isAnchor) {
                pop.appendChild(doc.createXULElement("menuseparator"));
                try { this._ensureTabGroupStyles(doc); } catch (er) {}
                const wrap = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                wrap.className = "wv-tg-swatches";
                (wrap as any).style.cssText = "padding: 6px 10px;";
                const curIdx = (targetWin as any)._wvTitleGlyphIdx != null
                    ? ((targetWin as any)._wvTitleGlyphIdx % WV_WIN_BADGE_COLORS.length) : -1;
                for (let i = 0; i < WV_WIN_BADGE_COLORS.length; i++) {
                    const sw: any = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                    sw.className = "wv-tg-swatch" + (i === curIdx ? " wv-selected" : "");
                    sw.style.background = WV_WIN_BADGE_COLORS[i];
                    sw.style.borderRadius = isReader ? "50%" : "3px";
                    const idx = i;
                    sw.addEventListener("click", (ev: any) => {
                        try {
                            ev.stopPropagation();
                            const p: any = live();
                            if (!p) return;
                            (targetWin as any)._wvTitleGlyphIdx = idx;   // manual pick — verbatim
                            delete (targetWin as any)._wvWinIconName;
                            delete (targetWin as any)._wvOverlayName;
                            try { p._wvApplyWindowIcon(targetWin); } catch (e2) {}
                            try {
                                const mt: any = p._wvOvMonTop;
                                if (mt) delete mt[p._wvOvScreenKeyOf(targetWin)];
                                p._wvOvSetBadge(targetWin, "recolor");
                            } catch (e2) {}
                            try {
                                if (isReader) p._wvUpdateWindowBadgeDot(targetWin, !!p._getTabsAndWindowsMaster(), true);
                                else p._wvUpdateMainWindowIndicator(targetWin);
                            } catch (e2) {}
                            try {
                                if (panel && typeof panel.refreshList === "function") panel.refreshList();
                                else if (panel) p._wvRegroupTabsMenu(panel);
                            } catch (e2) {}
                            try { pop.hidePopup(); } catch (e2) {}
                        } catch (e2) {}
                    });
                    wrap.appendChild(sw);
                }
                pop.appendChild(wrap);
            }
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(sx, sy, true);
        } catch (er) { Zotero.debug("[Weavero] _wvWindowHeaderContext err: " + er); }
    }

    /** Toggle for the window-type title glyphs (default OFF — the user
     *  found the prefix stole space from the already-short preview
     *  captions; per-window taskbar ICONS are the default cue instead.
     *  The glyphs remain as an opt-in, e.g. for non-Windows platforms
     *  where the icon route doesn't exist). */
    _getEnableWindowTitleGlyphs() {
        try {
            if (!(this as any)._getTabsAndWindowsMaster()) return false;
            const v = Zotero.Prefs.get("weavero.windowTitleGlyphs");
            return v === undefined ? false : !!v;
        } catch (e) { return false; }
    }

    /** The window-type glyph for a window ("" when the feature is off or
     *  the window kind is unknown). Anchor main → anchor mark; other
     *  mains → coloured square; reader windows → coloured book. Kind is
     *  re-derived on every call, so a window that changes role (e.g. the
     *  anchor closing promotes another main) self-corrects on its next
     *  title write. */
    _wvWindowTitleGlyph(win: any): string {
        try {
            if (!this._getEnableWindowTitleGlyphs()) return "";
            const wt = win && win.document && win.document.documentElement
                && win.document.documentElement.getAttribute("windowtype");
            if (wt === "zotero:reader") {
                return WV_TITLE_GLYPHS_READER[
                    this._wvTitleGlyphIdx(win, true) % WV_TITLE_GLYPHS_READER.length];
            }
            const mains = Zotero.getMainWindows() || [];
            if (win && mains.includes(win)) {
                if (this._wvIsAnchorWindow(win)) {
                    return this._wvAnchorDecorVisible() ? WV_TITLE_GLYPH_ANCHOR : "";
                }
                return WV_TITLE_GLYPHS_MAIN[
                    this._wvTitleGlyphIdx(win, false) % WV_TITLE_GLYPHS_MAIN.length];
            }
        } catch (e) {}
        return "";
    }

    /** Session-stable colour index from a pool SHARED by all badged
     *  windows (non-anchor mains AND reader windows): the badge shape
     *  already encodes the kind, so sharing the pool means no two
     *  windows carry the same colour — main №2 is blue, reader №1
     *  green, the next window purple, … (user request 2026-07-13). */
    /** Stamp a STORED window-colour index onto a (re)opened window —
     *  UNLESS another open window already uses it. Restoring a saved
     *  glyph verbatim created duplicate colours (two blue windows,
     *  user report 2026-07-15); on collision the stamp is skipped and
     *  the lazy allocator (_wvTitleGlyphIdx) hands the window the
     *  first FREE colour instead. `ignoreWin` = a window about to
     *  close (conversion source) whose colour is legitimately being
     *  carried over. Manual swatch picks stay verbatim — duplicating
     *  a colour on purpose is the user's call. */
    _wvStampGlyphIdx(win: any, idx: any, ignoreWin?: any) {
        try {
            if (win == null || idx == null) return;
            const used = new Set();
            for (const w of (Zotero.getMainWindows() || [])) {
                if (w !== win && w !== ignoreWin && (w as any)._wvTitleGlyphIdx != null) {
                    used.add((w as any)._wvTitleGlyphIdx);
                }
            }
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (w !== win && w !== ignoreWin && w && w._wvTitleGlyphIdx != null) {
                    used.add(w._wvTitleGlyphIdx);
                }
            }
            if (!used.has(idx)) (win as any)._wvTitleGlyphIdx = idx;
            // else: leave unstamped — the allocator assigns a free colour.
        } catch (e) {}
    }

    _wvTitleGlyphIdx(win: any, _isReader?: boolean): number {
        if (win._wvTitleGlyphIdx != null) return win._wvTitleGlyphIdx;
        const used = new Set();
        try {
            for (const w of (Zotero.getMainWindows() || [])) {
                if (w !== win && (w as any)._wvTitleGlyphIdx != null) used.add((w as any)._wvTitleGlyphIdx);
            }
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (w !== win && w && w._wvTitleGlyphIdx != null) used.add(w._wvTitleGlyphIdx);
            }
        } catch (e) {}
        let i = 0;
        while (used.has(i)) i++;
        win._wvTitleGlyphIdx = i;
        return i;
    }

    _wvStripTitleGlyph(s: any): string {
        let out = String(s == null ? "" : s);
        while (WV_TITLE_GLYPH_STRIP_RE.test(out)) out = out.replace(WV_TITLE_GLYPH_STRIP_RE, "");
        return out;
    }

    /** A display label with the window's glyph prepended — reused by the
     *  tabs-menu window headers and the move-target menus so the
     *  colour ↔ window association matches the OS captions. */
    _wvGlyphLabel(win: any, name: string): string {
        try {
            const g = this._wvWindowTitleGlyph(win);
            return g ? g + " " + name : name;
        } catch (e) { return name; }
    }

    /** Window-name-in-title mode (user request 2026-07-16, Chrome's
     *  "Name window…" parallel): "off" (default — current design),
     *  "prefix" ("Name — <native title>", Firefox-extension style),
     *  "replace" ("Name" only, Chrome style). Only windows with a
     *  CUSTOM name are affected in any mode. */
    _getWindowTitleNameMode(): string {
        try {
            if (!(this as any)._getTabsAndWindowsMaster()) return "off";
            const v = String(Zotero.Prefs.get("weavero.windowTitleNameMode") || "off");
            return (v === "prefix" || v === "replace") ? v : "off";
        } catch (e) { return "off"; }
    }

    _wvGlyphizeTitle(win: any, v: any): string {
        let base = this._wvStripTitleGlyph(v);
        try {
            // Undo a previous NAME decoration: our own re-apply
            // (`doc.title = doc.title`) feeds the composed title back in.
            // The composed string is remembered per window, and the
            // native base alongside it — so "replace" mode can recover a
            // base the visible title no longer contains, and "prefix"
            // never stacks.
            if ((win as any)._wvComposedTitle != null && base === (win as any)._wvComposedTitle
                && (win as any)._wvNativeTitleBase != null) {
                base = (win as any)._wvNativeTitleBase;
            }
            (win as any)._wvNativeTitleBase = base;
            let out = base;
            const mode = this._getWindowTitleNameMode();
            if (mode !== "off") {
                const name = this._wvWindowCustomTitle(win);
                if (name) out = mode === "replace" ? name : (name + " — " + base);
            }
            const g = this._wvWindowTitleGlyph(win);
            const composed = g ? g + " " + out : out;
            // Remember WITHOUT the glyph — the feed-back value has the
            // glyph stripped by _wvStripTitleGlyph before we compare.
            (win as any)._wvComposedTitle = out;
            return composed;
        } catch (e) { return base; }
    }

    /** Shadow this document's `title` prototype accessor with an own
     *  property so EVERY title write (tab switch, reader navigation)
     *  re-applies the glyph — there is no <title> node to observe in
     *  these windows (verified live 2026-07-11). Reload-safe: the setter
     *  resolves the live plugin at write time. Teardown deletes the
     *  shadow so the prototype accessor shows through. */
    _wvWireTitleGlyph(win: any) {
        try {
            if (!win || !win.document || win.closed) return;
            const doc: any = win.document;
            if (!doc._wvTitleGlyphWired) {
                const desc = Object.getOwnPropertyDescriptor(win.Document.prototype, "title");
                if (!desc || !desc.get || !desc.set) return;
                Object.defineProperty(doc, "title", {
                    configurable: true,
                    get() { return desc.get.call(this); },
                    set(v: any) {
                        let out = String(v == null ? "" : v);
                        try {
                            const live: any = (Zotero as any).Weavero
                                && (Zotero as any).Weavero.plugin;
                            if (live && !live._wvDestroyed) out = live._wvGlyphizeTitle(win, out);
                        } catch (e) {}
                        desc.set.call(this, out);
                    },
                });
                doc._wvTitleGlyphWired = true;
            }
            // Re-apply on the current title (covers wire-after-open and
            // kind changes).
            try { doc.title = doc.title; } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvWireTitleGlyph err: " + e); }
    }

    _wvUnwireTitleGlyph(win: any) {
        try {
            const doc: any = win && win.document;
            if (!doc || !doc._wvTitleGlyphWired) return;
            const cur = doc.title;
            delete doc.title;
            delete doc._wvTitleGlyphWired;
            // Restore the NATIVE title: strip the glyph, and if the rest
            // is our name decoration, fall back to the cached base (in
            // "replace" mode the visible title has no base left at all).
            let restored = this._wvStripTitleGlyph(cur);
            try {
                if ((win as any)._wvComposedTitle != null
                    && restored === (win as any)._wvComposedTitle
                    && (win as any)._wvNativeTitleBase != null) {
                    restored = (win as any)._wvNativeTitleBase;
                }
                delete (win as any)._wvComposedTitle;
            } catch (e) {}
            try { doc.title = restored; } catch (e) {}
        } catch (e) {}
    }

    /** Apply or strip the glyph on every open window — init, pref
     *  toggle, and teardown all funnel through here. The title shadow
     *  also serves the window-NAME-in-title modes, so it stays wired
     *  when either feature is active. */
    _wvRefreshTitleGlyphs(forceOff?: boolean) {
        try {
            const on = !forceOff && (this._getEnableWindowTitleGlyphs()
                || this._getWindowTitleNameMode() !== "off");
            const apply = (w: any) => {
                try { if (on) this._wvWireTitleGlyph(w); else this._wvUnwireTitleGlyph(w); } catch (e) {}
            };
            for (const w of (Zotero.getMainWindows() || [])) apply(w);
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) apply(en.getNext());
        } catch (e) {}
    }

    /** Toggle for the per-window taskbar icons (Windows only; default on). */
    _getEnableWindowIcons() {
        try {
            if (!Zotero.isWin) return false;
            if (!(this as any)._getTabsAndWindowsMaster()) return false;
            const v = Zotero.Prefs.get("weavero.windowIcons");
            return v === undefined ? true : !!v;
        } catch (e) { return false; }
    }

    /** Extract one of the bundled per-window .ico files (icons/win/ in
     *  the XPI) to <data dir>/weavero/win-icons/ — LoadImageW needs a
     *  real file path. Re-extracted per plugin version. */
    async _wvWinIconFile(name: string): Promise<string | null> {
        try {
            const dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "win-icons");
            const path = PathUtils.join(dir, name + ".ico");
            const stampPath = PathUtils.join(dir, "VERSION");
            const ver = String((this as any)._version || "");
            let fresh = false;
            try {
                fresh = (await IOUtils.exists(path))
                    && (await IOUtils.readUTF8(stampPath)) === ver;
            } catch (e) {}
            if (!fresh) {
                await IOUtils.makeDirectory(dir, { ignoreExisting: true, createAncestors: true });
                const resp = await fetch((this as any)._rootURI + "icons/win/" + name + ".ico");
                const buf = new Uint8Array(await resp.arrayBuffer());
                await IOUtils.write(path, buf);
                try { await IOUtils.writeUTF8(stampPath, ver); } catch (e) {}
            }
            return path;
        } catch (e) {
            Zotero.debug("[Weavero] _wvWinIconFile err: " + e);
            return null;
        }
    }

    /** Chrome-profile-style per-window taskbar icon: composite badges on
     *  Zotero's real icon artwork (square badge = main window, round
     *  badge = reader window, colour = which window; the anchor main
     *  keeps the native unbadged icon). Set via Win32 WM_SETICON — the
     *  same mechanism Chrome uses for profile windows — so the taskbar
     *  preview captions, Task View and Alt-Tab distinguish windows
     *  without touching the title text. Runtime-only state: re-applied
     *  on every startup / window open by the callers. */
    async _wvApplyWindowIcon(win: any) {
        try {
            if (!win || win.closed || !this._getEnableWindowIcons()) return;
            const wt = win.document && win.document.documentElement
                && win.document.documentElement.getAttribute("windowtype");
            const isReader = wt === "zotero:reader";
            const mains = Zotero.getMainWindows() || [];
            if (!isReader && !mains.includes(win)) return;
            // Anchor main gets the anchor-marked icon (title-bar anchor
            // glyph + colour, on the native artwork); other mains a
            // square badge, readers a round badge. A LONE window shows
            // no anchor decoration at all (native icon restored).
            const isAnchor = !isReader && this._wvIsAnchorWindow(win);
            if (isAnchor && !this._wvAnchorDecorVisible()) {
                if (win._wvWinIconName) {
                    try { this._wvRestoreWindowIcon(win); } catch (e) {}
                    win._wvWinIconName = null;
                }
                return;
            }
            const name = isAnchor
                ? "anchor"
                : (isReader ? "reader-" : "main-")
                    + ((this._wvTitleGlyphIdx(win, isReader) % 6) + 1);
            if (win._wvWinIconName === name) return;   // already applied
            const path = await this._wvWinIconFile(name);
            if (!path || win.closed) return;
            const set = this._wvSetWindowIconFromFile(win, path);
            if (set) win._wvWinIconName = name;
        } catch (e) { Zotero.debug("[Weavero] _wvApplyWindowIcon err: " + e); }
    }

    /** Low-level Win32: load 16px + 32px frames from the .ico and set
     *  them as the window's small/big icons. Keeps the previous HICONs
     *  on the window for restore, and our loaded HICONs for cleanup. */
    _wvSetWindowIconFromFile(win: any, path: string): boolean {
        try {
            const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
            const bw = win.docShell.treeOwner
                .QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIBaseWindow);
            const hwndStr = bw.nativeHandle;
            if (!hwndStr) return false;
            const user32 = ctypes.open("user32.dll");
            try {
                const HWND = ctypes.voidptr_t, HICON = ctypes.voidptr_t;
                const SendMessageW = user32.declare("SendMessageW", ctypes.winapi_abi,
                    ctypes.intptr_t, HWND, ctypes.uint32_t, ctypes.uintptr_t, ctypes.intptr_t);
                const LoadImageW = user32.declare("LoadImageW", ctypes.winapi_abi,
                    HICON, ctypes.voidptr_t, ctypes.char16_t.ptr, ctypes.unsigned_int,
                    ctypes.int, ctypes.int, ctypes.unsigned_int);
                const IMAGE_ICON = 1, LR_LOADFROMFILE = 0x10;
                const small = LoadImageW(null, path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
                const big = LoadImageW(null, path, IMAGE_ICON, 32, 32, LR_LOADFROMFILE);
                if (small.isNull() && big.isNull()) return false;
                const hwnd = HWND(ctypes.UInt64(hwndStr));
                const WM_SETICON = 0x0080;
                const prevSmall = SendMessageW(hwnd, WM_SETICON, 0,
                    ctypes.cast(small, ctypes.intptr_t));
                const prevBig = SendMessageW(hwnd, WM_SETICON, 1,
                    ctypes.cast(big, ctypes.intptr_t));
                // First replacement: remember the ORIGINAL icons for restore.
                if (!win._wvPrevWinIcons) {
                    win._wvPrevWinIcons = { small: String(prevSmall), big: String(prevBig) };
                }
                return true;
            } finally { user32.close(); }
        } catch (e) {
            Zotero.debug("[Weavero] _wvSetWindowIconFromFile err: " + e);
            return false;
        }
    }

    /** Put the window's original icons back (teardown / anchor promotion). */
    _wvRestoreWindowIcon(win: any) {
        try {
            const prev = win && win._wvPrevWinIcons;
            if (!prev || win.closed) return;
            const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
            const bw = win.docShell.treeOwner
                .QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIBaseWindow);
            const user32 = ctypes.open("user32.dll");
            try {
                const HWND = ctypes.voidptr_t;
                const SendMessageW = user32.declare("SendMessageW", ctypes.winapi_abi,
                    ctypes.intptr_t, HWND, ctypes.uint32_t, ctypes.uintptr_t, ctypes.intptr_t);
                const hwnd = HWND(ctypes.UInt64(bw.nativeHandle));
                SendMessageW(hwnd, 0x0080, 0, ctypes.intptr_t(ctypes.UInt64(prev.small)));
                SendMessageW(hwnd, 0x0080, 1, ctypes.intptr_t(ctypes.UInt64(prev.big)));
            } finally { user32.close(); }
            delete win._wvPrevWinIcons;
            delete win._wvWinIconName;
        } catch (e) {}
    }

    /** Toggle: one taskbar button PER WINDOW (its badge icon, on the
     *  monitor where the window lives) instead of one grouped button.
     *  Default OFF — grouping preserved (user request 2026-07-13).
     *  Split windows leave the group's preview flyout by design. */
    _getEnableSeparateTaskbarButtons() {
        try {
            if (!Zotero.isWin) return false;
            if (!(this as any)._getTabsAndWindowsMaster()) return false;
            return !!Zotero.Prefs.get("weavero.separateTaskbarButtons");
        } catch (e) { return false; }
    }

    /** Set (aumid string) or clear (null) a window's AppUserModelID via
     *  the shell property store — COM through js-ctypes (vtable calls;
     *  IPropertyStore: QI/AddRef/Release/GetCount/GetAt/GetValue/
     *  SetValue/Commit). Windows regroups/splits taskbar buttons by
     *  this id. Verified live 2026-07-13 (spike on window 2). */
    _wvSetWindowAUMID(win: any, aumid: string | null): boolean {
        try {
            if (!Zotero.isWin || !win || win.closed) return false;
            const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
            const bw = win.docShell.treeOwner
                .QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
            const shell32 = ctypes.open("shell32.dll");
            try {
                const HWND = ctypes.voidptr_t;
                const GUID = new ctypes.StructType("WVGUID", [
                    { a: ctypes.uint32_t }, { b: ctypes.uint16_t }, { c: ctypes.uint16_t },
                    { d: ctypes.uint8_t.array(8) }]);
                const PROPERTYKEY = new ctypes.StructType("WVPROPERTYKEY", [{ fmtid: GUID }, { pid: ctypes.uint32_t }]);
                const PROPVARIANT = new ctypes.StructType("WVPROPVARIANT", [
                    { vt: ctypes.uint16_t }, { r1: ctypes.uint16_t }, { r2: ctypes.uint16_t }, { r3: ctypes.uint16_t },
                    { pwszVal: ctypes.char16_t.ptr }]);
                const SHGetPropertyStoreForWindow = shell32.declare("SHGetPropertyStoreForWindow",
                    ctypes.winapi_abi, ctypes.long, HWND, GUID.ptr, ctypes.voidptr_t.ptr);
                const iid = new GUID();   // IID_IPropertyStore
                iid.a = 0x886d8eeb; iid.b = 0x8cf2; iid.c = 0x4446;
                const dd = [0x8d, 0x02, 0xcd, 0xba, 0x1d, 0xbd, 0xcf, 0x99];
                for (let i = 0; i < 8; i++) iid.d[i] = dd[i];
                const key = new PROPERTYKEY();   // PKEY_AppUserModel_ID
                key.fmtid.a = 0x9F4C2855; key.fmtid.b = 0x9F79; key.fmtid.c = 0x4B39;
                const kd = [0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3];
                for (let i = 0; i < 8; i++) key.fmtid.d[i] = kd[i];
                key.pid = 5;
                const hwnd = HWND(ctypes.UInt64(bw.nativeHandle));
                const storePtr = new ctypes.voidptr_t();
                if (Number(SHGetPropertyStoreForWindow(hwnd, iid.address(), storePtr.address())) !== 0) return false;
                const vt = ctypes.cast(storePtr, ctypes.voidptr_t.array(9).ptr.ptr).contents.contents;
                const SetValueT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.long,
                    [ctypes.voidptr_t, PROPERTYKEY.ptr, PROPVARIANT.ptr]).ptr;
                const CommitT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.long, [ctypes.voidptr_t]).ptr;
                const ReleaseT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.uint32_t, [ctypes.voidptr_t]).ptr;
                const pv = new PROPVARIANT();
                let buf: any = null;
                if (aumid) {
                    buf = ctypes.char16_t.array()(aumid + "\0");
                    pv.vt = 31;   // VT_LPWSTR
                    pv.pwszVal = ctypes.cast(buf.address(), ctypes.char16_t.ptr);
                } else {
                    pv.vt = 0;    // VT_EMPTY → back to the app's shared identity
                }
                const hr1 = Number(ctypes.cast(vt[6], SetValueT)(storePtr, key.address(), pv.address()));
                const hr2 = Number(ctypes.cast(vt[7], CommitT)(storePtr));
                ctypes.cast(vt[2], ReleaseT)(storePtr);
                return hr1 === 0 && hr2 === 0;
            } finally { shell32.close(); }
        } catch (e) {
            Zotero.debug("[Weavero] _wvSetWindowAUMID err: " + e);
            return false;
        }
    }

    /** Taskbar identity: NATIVE for everyone (windows always merge and
     *  their buttons migrate between monitors natively/instantly) unless
     *  the separate-buttons pref puts each non-anchor window on its own
     *  AUMID. The per-monitor AUMID experiment is RETIRED (2026-07-13):
     *  identical window-level AUMIDs applied at different times are not
     *  reliably merged by the shell (two buttons persisted even after
     *  re-registering both members), and the churn broke more than the
     *  per-monitor badge isolation bought. */
    _wvApplyWindowTaskbarIdentity(win: any) {
        try {
            if (!Zotero.isWin || !win || win.closed) return;
            const wt = win.document && win.document.documentElement
                && win.document.documentElement.getAttribute("windowtype");
            const isReader = wt === "zotero:reader";
            const isMain = !isReader && (Zotero.getMainWindows() || []).includes(win);
            if (!isReader && !isMain) return;
            const isAnchor = isMain && this._wvIsAnchorWindow(win);
            let aumid: string | null = null;
            if (this._getEnableSeparateTaskbarButtons() && !isAnchor) {
                aumid = "Weavero." + (isReader ? "Reader." : "Main.") + this._wvTitleGlyphIdx(win, isReader);
            }
            let changed = false;
            if (aumid) {
                if ((win as any)._wvAumid !== aumid && this._wvSetWindowAUMID(win, aumid)) {
                    (win as any)._wvAumid = aumid;
                    changed = true;
                }
            } else if ((win as any)._wvAumid) {
                if (this._wvSetWindowAUMID(win, null)) { delete (win as any)._wvAumid; changed = true; }
            }
            if (changed) {
                try { this._wvRefreshTaskbarButton(win); } catch (e) {}
                try {
                    // Fresh (re-registered) button — no overlay, and the
                    // ledger's image for this monitor is void.
                    delete (win as any)._wvOverlayName;
                    const mt: any = (this as any)._wvOvMonTop;
                    if (mt) delete mt[this._wvOvScreenKeyOf(win)];
                    this._wvOvSetBadge(win, "identity-change");
                } catch (e) {}
            }
        } catch (e) {}
    }

    /** Re-register a window's taskbar BUTTON (ITaskbarList::DeleteTab +
     *  AddTab): the shell only re-evaluates a live window's group
     *  (AUMID) when its button is re-added — setting the property alone
     *  left the old button in the old group ("still switches the
     *  taskbar icon on monitor 2", 2026-07-13). Doesn't touch window
     *  visibility. The button comes back fresh, so re-assert the
     *  overlay afterwards. */
    _wvRefreshTaskbarButton(win: any): boolean {
        try {
            if (!Zotero.isWin || !win || win.closed) return false;
            const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
            const bw = win.docShell.treeOwner
                .QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
            const ole32 = ctypes.open("ole32.dll");
            try {
                const HWND = ctypes.voidptr_t;
                const GUID = new ctypes.StructType("WVG6", [
                    { a: ctypes.uint32_t }, { b: ctypes.uint16_t }, { c: ctypes.uint16_t },
                    { d: ctypes.uint8_t.array(8) }]);
                const mk = (a: number, b: number, c: number, d: number[]) => {
                    const g = new GUID(); g.a = a; g.b = b; g.c = c;
                    for (let i = 0; i < 8; i++) g.d[i] = d[i];
                    return g;
                };
                const CLSID = mk(0x56FDF344, 0xFD6D, 0x11d0, [0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90]);
                const IID = mk(0xEA1AFB91, 0x9E28, 0x4B86, [0x90, 0xE9, 0x9E, 0x9F, 0x8A, 0x5E, 0xEF, 0xAF]);
                const CoCreateInstance = ole32.declare("CoCreateInstance", ctypes.winapi_abi, ctypes.long,
                    GUID.ptr, ctypes.voidptr_t, ctypes.uint32_t, GUID.ptr, ctypes.voidptr_t.ptr);
                const obj = new ctypes.voidptr_t();
                if (Number(CoCreateInstance(CLSID.address(), null, 1, IID.address(), obj.address())) !== 0) return false;
                const vt = ctypes.cast(obj, ctypes.voidptr_t.array(21).ptr.ptr).contents.contents;
                const HrInitT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.long, [ctypes.voidptr_t]).ptr;
                const TabT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.long, [ctypes.voidptr_t, HWND]).ptr;
                const RelT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.uint32_t, [ctypes.voidptr_t]).ptr;
                ctypes.cast(vt[3], HrInitT)(obj);
                const hwnd = HWND(ctypes.UInt64(bw.nativeHandle));
                const hr1 = Number(ctypes.cast(vt[5], TabT)(obj, hwnd));   // DeleteTab
                const hr2 = Number(ctypes.cast(vt[4], TabT)(obj, hwnd));   // AddTab
                ctypes.cast(vt[2], RelT)(obj);
                return hr1 === 0 && hr2 === 0;
            } finally { ole32.close(); }
        } catch (e) { return false; }
    }

    /** Give this window its badge overlay (colour square / circle; the
     *  ⚓ disc for the anchor). `force` re-sets even when unchanged: the
     *  group button displays the overlay of the last window TO SET one
     *  (not the last active — corrected 2026-07-13), so focus-following
     *  works by re-asserting on every activation. */
    /** Set (icoPath) or clear (null) a window's TASKBAR OVERLAY badge —
     *  ITaskbarList3::SetOverlayIcon via COM-through-ctypes. Immediate,
     *  shell-managed; the group button shows the overlay of the last
     *  window to SET one. */
    /** Re-apply taskbar identity to every open main + reader window. */
    _wvRefreshWindowTaskbarIdentities() {
        try {
            if (!Zotero.isWin) return;
            for (const w of (Zotero.getMainWindows() || [])) this._wvApplyWindowTaskbarIdentity(w);
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) this._wvApplyWindowTaskbarIdentity(en.getNext());
        } catch (e) {}
    }

    /** Badge icon base name for a window: "anchor", "main-N", or "reader-N". */
    _wvBadgeIconNameFor(win: any): string | null {
        try {
            const wt = win && win.document && win.document.documentElement
                && win.document.documentElement.getAttribute("windowtype");
            const isReader = wt === "zotero:reader";
            const isMain = !isReader && (Zotero.getMainWindows() || []).includes(win);
            if (!isReader && !isMain) return null;
            if (isMain && this._wvIsAnchorWindow(win)) {
                // Lone window → no anchor badge (matches the icon/mark rule).
                return this._wvAnchorDecorVisible() ? "anchor" : null;
            }
            const idx = this._wvTitleGlyphIdx(win, isReader);
            return (isReader ? "reader-" : "main-") + ((idx % 6) + 1);
        } catch (e) { return null; }
    }

    _wvSetTaskbarOverlay(win: any, icoPath: string | null, desc?: string): boolean {
        try {
            if (!Zotero.isWin || !win || win.closed) return false;
            const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
            const bw = win.docShell.treeOwner
                .QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
            const user32 = ctypes.open("user32.dll");
            const ole32 = ctypes.open("ole32.dll");
            try {
                const HWND = ctypes.voidptr_t, HICON = ctypes.voidptr_t;
                const GUID = new ctypes.StructType("WVG7", [
                    { a: ctypes.uint32_t }, { b: ctypes.uint16_t }, { c: ctypes.uint16_t },
                    { d: ctypes.uint8_t.array(8) }]);
                const mk = (a: number, b: number, c: number, d: number[]) => {
                    const g = new GUID(); g.a = a; g.b = b; g.c = c;
                    for (let i = 0; i < 8; i++) g.d[i] = d[i];
                    return g;
                };
                const CLSID = mk(0x56FDF344, 0xFD6D, 0x11d0, [0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90]);
                const IID = mk(0xEA1AFB91, 0x9E28, 0x4B86, [0x90, 0xE9, 0x9E, 0x9F, 0x8A, 0x5E, 0xEF, 0xAF]);
                const CoCreateInstance = ole32.declare("CoCreateInstance", ctypes.winapi_abi, ctypes.long,
                    GUID.ptr, ctypes.voidptr_t, ctypes.uint32_t, GUID.ptr, ctypes.voidptr_t.ptr);
                const obj = new ctypes.voidptr_t();
                if (Number(CoCreateInstance(CLSID.address(), null, 1, IID.address(), obj.address())) !== 0) return false;
                const vt = ctypes.cast(obj, ctypes.voidptr_t.array(21).ptr.ptr).contents.contents;
                const HrInitT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.long, [ctypes.voidptr_t]).ptr;
                const SetOvT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.long,
                    [ctypes.voidptr_t, HWND, HICON, ctypes.char16_t.ptr]).ptr;
                const RelT = ctypes.FunctionType(ctypes.winapi_abi, ctypes.uint32_t, [ctypes.voidptr_t]).ptr;
                ctypes.cast(vt[3], HrInitT)(obj);
                const hwnd = HWND(ctypes.UInt64(bw.nativeHandle));
                let icon: any = HICON(0);
                if (icoPath) {
                    const LoadImageW = user32.declare("LoadImageW", ctypes.winapi_abi, HICON,
                        ctypes.voidptr_t, ctypes.char16_t.ptr, ctypes.unsigned_int,
                        ctypes.int, ctypes.int, ctypes.unsigned_int);
                    icon = LoadImageW(null, icoPath, 1, 16, 16, 0x10);
                    if (icon.isNull()) return false;
                }
                let descBuf: any = null, descPtr: any = ctypes.char16_t.ptr(0);
                if (desc) {
                    descBuf = ctypes.char16_t.array()(desc + "\0");
                    descPtr = ctypes.cast(descBuf.address(), ctypes.char16_t.ptr);
                }
                const hr = Number(ctypes.cast(vt[18], SetOvT)(obj, hwnd, icon, descPtr));
                ctypes.cast(vt[2], RelT)(obj);
                if (icoPath && !icon.isNull()) {
                    const DestroyIcon = user32.declare("DestroyIcon", ctypes.winapi_abi, ctypes.int, HICON);
                    DestroyIcon(icon);
                }
                return hr === 0;
            } finally { user32.close(); ole32.close(); }
        } catch (e) {
            Zotero.debug("[Weavero] _wvSetTaskbarOverlay err: " + e);
            return false;
        }
    }

    // (_wvApplyTaskbarOverlay was removed 2026-07-15: zero callers left, and
    //  keeping a badge writer that bypasses the _wvOvSetBadge poison-ledger
    //  gate invites regressions — see "Subsystem invariants" in
    //  ../.claude/project.md. ALL badge writes go through _wvOvSetBadge.)

    /** Is the primary mouse button currently held down? Used to defer
     *  taskbar-badge repairs until a window drag has actually ended. */
    _wvMouseButtonDown(): boolean {
        try {
            if (!Zotero.isWin) return false;
            const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
            const u = ctypes.open("user32.dll");
            try {
                const GetAsyncKeyState = u.declare("GetAsyncKeyState",
                    ctypes.winapi_abi, ctypes.short, ctypes.int);
                return (GetAsyncKeyState(0x01) & 0x8000) !== 0; // VK_LBUTTON
            } finally { u.close(); }
        } catch (e) { return false; }
    }

    // NOTE (v0.15.8-dev.57 post-mortem): do NOT detect drag-end with a
    // native WinEventHook (SetWinEventHook EVENT_SYSTEM_MOVESIZEEND +
    // js-ctypes callback). It CRASHED the process on the first real
    // drag: WINEVENT_OUTOFCONTEXT delivers whenever THIS thread pumps
    // messages, and this file's badge machinery pumps inside ctypes
    // FFI calls (COM SetOverlayIcon → SendMessage), so the closure can
    // re-enter SpiderMonkey mid-FFI. The drag-aware fast poll in
    // _wvWireOverlayFocusFollow's moveHandler replaces it.

    /** Always-on ring buffer tracing the badge machinery (activations,
     *  move detection, repair passes, every SetOverlayIcon). Read it
     *  with `Zotero.Weavero.plugin._wvOvLogBuf`. Bounded at 400. */
    _wvOvLog(ev: string, data?: any) {
        try {
            const buf: any[] = (this as any)._wvOvLogBuf || ((this as any)._wvOvLogBuf = []);
            buf.push({ t: new Date().toISOString().slice(11, 23), ev, ...(data || {}) });
            if (buf.length > 400) buf.splice(0, buf.length - 400);
        } catch (e) {}
    }

    /** Bump `win` to the top of the focus order and route through the
     *  poison-ledger badge setter. Focus re-asserts FORCE (doctrine:
     *  re-assert on every activation): the shell can silently repaint a
     *  button after a cross-monitor button migration, leaving the ledger
     *  stale — the skip then blocked self-healing forever (left button
     *  showed the right monitor's square, 2026-07-14). Debounced per
     *  monitor so boot-burst activations stay cheap. */
    _wvOvFocusBump(win: any) {
        try {
            if (!Zotero.isWin || !win || win.closed) return;
            (win as any)._wvOvFocusSeq = this._wvOvMaxSeq() + 1;
            const mon = this._wvOvScreenKeyOf(win) || "";
            const lf: any = (this as any)._wvOvLastFocusForce
                || ((this as any)._wvOvLastFocusForce = {});
            const now = Date.now();
            const force = !lf[mon] || (now - lf[mon]) > 750;
            if (force) lf[mon] = now;
            this._wvOvSetBadge(win, "focus", 0, force);
        } catch (e) {}
    }

    /** FIRST-badge settle gate. During session restore a window is
     *  often CREATED on one monitor (inheriting the opener's) and then
     *  MOVED to its saved position — badging it before that move is
     *  residency-with-badge poisoning, self-inflicted at every boot
     *  (observed 2026-07-14: fresh reboot, two green circles). A
     *  window's first badge of the session waits until its geometry
     *  has been stable for two consecutive 1s samples with the mouse
     *  button up; after that the flag sticks and moves are the move-
     *  repair path's business. Returns true when settled. */
    _wvOvEnsureSettled(win: any, reason: string): boolean {
        try {
            if ((win as any)._wvOvSettled) return true;
            if ((win as any)._wvOvSettleTimer) return false; // checker already running
            const posOf = () => {
                try {
                    return win.screenX + "," + win.screenY + ","
                        + win.outerWidth + "x" + win.outerHeight
                        + "@" + this._wvOvScreenKeyOf(win);
                } catch (e) { return ""; }
            };
            let last = posOf();
            let tries = 0;
            let stable = 0;
            this._wvOvLog("settle-wait", { win: this._wvBadgeIconNameFor(win), reason });
            const stop = () => {
                try { win.clearInterval((win as any)._wvOvSettleTimer); } catch (e) {}
                delete (win as any)._wvOvSettleTimer;
            };
            (win as any)._wvOvSettleTimer = win.setInterval(() => {
                try {
                    tries++;
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!lp || lp._wvDestroyed || win.closed) { stop(); return; }
                    let cur = "";
                    try {
                        cur = win.screenX + "," + win.screenY + ","
                            + win.outerWidth + "x" + win.outerHeight
                            + "@" + lp._wvOvScreenKeyOf(win);
                    } catch (e) {}
                    // Two consecutive stable samples (>=3s after the
                    // first badge attempt): outlasts both session-
                    // restore repositioning AND the shell's initial
                    // homing of a fresh button onto its taskbar (an
                    // early set can register against the wrong
                    // taskbar's transient button — boot log
                    // 2026-07-14 13:49).
                    stable = (cur === last && !lp._wvMouseButtonDown()) ? stable + 1 : 0;
                    if (stable >= 2 || tries > 20) {
                        stop();
                        (win as any)._wvOvSettled = true;
                        lp._wvOvLog("settled", { win: lp._wvBadgeIconNameFor(win), tries });
                        lp._wvOvSetBadge(win, reason + ":settled");
                    } else {
                        last = cur;
                    }
                } catch (e) {}
            }, 1000);
            return false;
        } catch (e) { return true; }
    }

    /** Most-recently-focused live window on monitor `monKey`. */
    _wvOvTopWindowOn(monKey: string): any {
        const cands = this._wvOvLiveWindows()
            .filter((w: any) => this._wvOvScreenKeyOf(w) === monKey);
        if (!cands.length) return null;
        return cands.reduce((a: any, b: any) =>
            ((b._wvOvFocusSeq || 0) > (a._wvOvFocusSeq || 0) ? b : a));
    }

    /** Low-level: paint badge image `name` through window `setter`'s
     *  overlay request. The IMAGE and the SETTER are decoupled —
     *  SetOverlayIcon takes any icon, so a monitor's badge can be
     *  issued through whichever resident window won't leak. */
    async _wvOvApplyImageAs(setter: any, name: string, desc: string): Promise<boolean> {
        try {
            if (!Zotero.isWin || !this._getEnableWindowIcons() || !setter || setter.closed) return false;
            const path = await this._wvWinIconFile(name);
            if (!path || setter.closed) return false;
            const ok = this._wvSetTaskbarOverlay(setter, path, desc);
            if (ok) (setter as any)._wvOverlayName = name;
            this._wvOvLog("set", {
                via: this._wvBadgeIconNameFor(setter), img: name,
                mon: this._wvOvScreenKeyOf(setter), ok,
            });
            return ok;
        } catch (e) { return false; }
    }

    /** THE badge setter — every overlay change goes through here.
     *  `win` names the target MONITOR (usually its top window or the
     *  one that just moved there). The badge IMAGE is always the
     *  monitor's top window's; the SETTER is the resident window with
     *  the fewest foreign poisons (a set from window w repaints every
     *  button in w's poison list — the Win11 sticky-association bug,
     *  crbug 40816037-alike, measured live 2026-07-14). Decoupling
     *  image from setter makes even MUTUALLY-poisoned layouts
     *  convergent whenever any resident of a monitor is clean.
     *  Ledger: `this._wvOvMonTop` = the image each button shows; a
     *  matching image SKIPS the set (no set → no leak, no flash).
     *  Poison list and residency live on the windows (survive plugin
     *  reloads); real sets predict their leaks and CHASE each leaked
     *  monitor, depth-capped. */
    /** Record that `w`'s overlay requests will also repaint monitor
     *  `btn`'s button. Sources: residency-with-badge departures AND
     *  BIRTH monitor — a window created on one monitor and moved to
     *  another (session restore creates windows on the OPENER's
     *  monitor) keeps a shell association with its birth button even
     *  if it never held a badge there (boot log 2026-07-14 14:42:
     *  reader born on M3, badge-less move to M2, its later set still
     *  painted M3). */
    _wvOvNotePoison(w: any, btn: string, why: string) {
        try {
            if (!w || !btn) return;
            const po: string[] = (w as any)._wvOvPoison || ((w as any)._wvOvPoison = []);
            if (!po.includes(btn)) {
                po.push(btn);
                this._wvOvLog("poison", { win: this._wvBadgeIconNameFor(w), btn, why });
            }
        } catch (e) {}
    }

    async _wvOvSetBadge(win: any, reason: string, depth?: number, force?: boolean) {
        try {
            if (!Zotero.isWin || !win || win.closed) return;
            if (!this._wvOvEnsureSettled(win, reason)) return; // first badge waits for a stable position
            const d = depth || 0;
            const mon = this._wvOvScreenKeyOf(win);
            if (!mon) return;
            const tops: any = (this as any)._wvOvMonTop || ((this as any)._wvOvMonTop = {});
            // Birth-monitor poison for the argument window.
            const birth = (win as any)._wvOvBirthMon;
            if (birth && birth !== mon) this._wvOvNotePoison(win, birth, "birth");
            // Monitor-change bookkeeping for the ARGUMENT window (the
            // mover): record poison, void both ledger entries, chase
            // the vacated button (it keeps showing the mover's image).
            const resid = (win as any)._wvOvResidMon;
            if (resid && resid !== mon) {
                this._wvOvNotePoison(win, resid, "residency");
                delete tops[mon];
                delete tops[resid];
                (win as any)._wvOvResidMon = mon;
                const vt = this._wvOvTopWindowOn(resid);
                if (vt && vt !== win && d < 3) {
                    this._wvOvLog("chase-vacated", { mon: resid, win: this._wvBadgeIconNameFor(vt) });
                    vt.setTimeout(() => {
                        try {
                            const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (!lp || lp._wvDestroyed || vt.closed) return;
                            lp._wvOvSetBadge(vt, "chase-vacated", d + 1);
                        } catch (e) {}
                    }, 120);
                }
                // ARRIVAL GUARD: the mover's button migrates to the new
                // taskbar asynchronously and the fresh button can repaint
                // with the group's latest overlay AFTER our arrival set
                // (left button showed the right monitor's square,
                // 2026-07-14). One delayed forced re-assert of the new
                // monitor cleans it, mirroring first-set-guard.
                if (d < 3) {
                    win.setTimeout(() => {
                        try {
                            const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (!lp || lp._wvDestroyed || win.closed) return;
                            const t = lp._wvOvTopWindowOn(mon) || win;
                            lp._wvOvLog("arrival-guard", { mon, win: lp._wvBadgeIconNameFor(t) });
                            lp._wvOvSetBadge(t, "arrival-guard", d + 1, true);
                        } catch (e) {}
                    }, 1500);
                }
            }
            // IMAGE = the monitor's top window's badge.
            const top = this._wvOvTopWindowOn(mon) || win;
            const base = this._wvBadgeIconNameFor(top);
            if (!base) {
                // The monitor's top window names NO badge — e.g. the anchor
                // once it's the LONE window (anchor decor hidden with ≤1
                // window). Clear its stale overlay and re-derive the icon
                // and in-window mark; without this the ⚓ lingered on the
                // taskbar after the last other window closed (user report
                // 2026-07-15). Runs on the survivor's close-repair pass
                // and on its next focus bump.
                try {
                    if ((top as any)._wvOverlayName) {
                        this._wvSetTaskbarOverlay(top, null);
                        delete (top as any)._wvOverlayName;
                        delete tops[mon];
                        this._wvOvLog("clear-no-badge", { reason });
                    }
                } catch (e) {}
                try { this._wvApplyWindowIcon(top); } catch (e) {}
                try { this._wvUpdateMainWindowIndicator(top); } catch (e) {}
                return;
            }
            const name = "ov-" + base;
            if (tops[mon] === name && !force) {
                this._wvOvLog("skip", { img: name, mon, reason });
                return;
            }
            // SETTER = settled resident with the fewest FOREIGN poisons
            // (entries for monitors other than this one); prefer the
            // top window on ties.
            const residents = this._wvOvLiveWindows()
                .filter((w: any) => this._wvOvScreenKeyOf(w) === mon && (w._wvOvSettled || w === win));
            // Birth-monitor poison must be on the books BEFORE setter
            // selection ranks candidates by foreign poison.
            for (const w of residents) {
                const b = (w as any)._wvOvBirthMon;
                if (b && b !== mon) this._wvOvNotePoison(w, b, "birth");
            }
            const foreign = (w: any) =>
                ((w._wvOvPoison || []) as string[]).filter(M => M !== mon).length;
            const setter = residents.sort((a: any, b: any) =>
                (foreign(a) - foreign(b)) || ((a === top ? 0 : 1) - (b === top ? 0 : 1)))[0] || top;
            // Ledger BEFORE the async set: queued events entering here
            // during the await must see the claim and skip (boot burst,
            // 2026-07-14: 4 sets in 6ms slipped through).
            tops[mon] = name;
            (setter as any)._wvOvResidMon = mon;
            const desc = base === "anchor" ? this._wvWindowName(top) + " (anchor)"
                : (base.startsWith("reader") ? "Reader window" : this._wvWindowName(top));
            await this._wvOvApplyImageAs(setter, name, desc);
            // First set of the session from a NON-primary monitor: the
            // shell may have registered the request against the primary
            // taskbar's transient button while the fresh button was
            // still homing (boot artifact, invisible to the ledger).
            // One forced re-assert of the primary monitor cleans it.
            if (!(setter as any)._wvOvFirstSetDone) {
                (setter as any)._wvOvFirstSetDone = true;
                if (mon !== "0,0" && d < 2) {
                    const pt = this._wvOvTopWindowOn("0,0");
                    if (pt && pt !== setter) {
                        this._wvOvLog("first-set-guard", { via: this._wvBadgeIconNameFor(setter) });
                        pt.setTimeout(() => {
                            try {
                                const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                                if (!lp || lp._wvDestroyed || pt.closed) return;
                                lp._wvOvSetBadge(pt, "first-set-guard", d + 1, true);
                            } catch (e) {}
                        }, 1500);
                    }
                }
            }
            // Predicted leaks: the SETTER's poisons got repainted.
            const po: string[] = (setter as any)._wvOvPoison || [];
            for (const M of po) {
                if (M === mon) continue;
                tops[M] = name;
                if (d >= 3) { this._wvOvLog("chase-capped", { mon: M }); continue; }
                const t = this._wvOvTopWindowOn(M);
                if (!t) continue;
                // MUTUAL-POISON degradation: if every settled resident
                // of the leaked monitor is itself poisoned toward other
                // monitors, its corrective set would leak right back —
                // the cascade cannot converge and whoever sets last
                // wins ALL buttons. Don't chase: accept that both
                // buttons follow the focused window (coherent global
                // badge) until a clean setter exists again (typically
                // after the next reboot, with formation now gated).
                const mResidents = this._wvOvLiveWindows()
                    .filter((w: any) => this._wvOvScreenKeyOf(w) === M);
                const mBestForeign = mResidents.length
                    ? Math.min(...mResidents.map((w: any) =>
                        ((w._wvOvPoison || []) as string[]).filter(x => x !== M).length))
                    : 0;
                if (mBestForeign > 0) {
                    this._wvOvLog("mutual-degrade", { mon: M, img: name });
                    continue;
                }
                this._wvOvLog("chase", { mon: M, depth: d + 1 });
                t.setTimeout(() => {
                    try {
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (!lp || lp._wvDestroyed || t.closed) return;
                        lp._wvOvSetBadge(t, "chase", d + 1);
                    } catch (e) {}
                }, 120);
            }
        } catch (e) {}
    }

    _wvOvLiveWindows(): any[] {
        const wins: any[] = [...(Zotero.getMainWindows() || [])];
        const en = Services.wm.getEnumerator("zotero:reader");
        while (en.hasMoreElements()) wins.push(en.getNext());
        return wins.filter(w => w && !w.closed);
    }

    _wvOvMaxSeq(): number {
        // Counter lives on the windows, not the plugin instance, so
        // the ordering survives plugin reloads.
        return this._wvOvLiveWindows().reduce(
            (m: number, w: any) => Math.max(m, w._wvOvFocusSeq || 0), 0);
    }

    _wvOvScreenKeyOf(win: any): string {
        try { return win.screen ? (win.screen.left + "," + win.screen.top) : ""; }
        catch (e) { return ""; }
    }

    /** Repair pass: re-assert the badge of the GLOBALLY most-recently-
     *  focused window — one single set. The badge model is deliberately
     *  GLOBAL (every Zotero button shows the focused window's badge):
     *  per-monitor badges are unachievable on the Win11 XAML taskbar,
     *  whose per-button overlay bookkeeping develops STICKY cross-
     *  button associations after windows migrate between monitors — a
     *  sticky window's set repaints a foreign monitor's button, and
     *  neither overlay clearing, ITaskbarList re-registration, nor a
     *  minimize/restore cycle purges it (all measured live 2026-07-14
     *  via scripted taskbar screen captures; same disease as the
     *  Chromium "two profile badges" bug, crbug 40816037). Which
     *  window is sticky changes over time and is unqueryable, so any
     *  per-monitor correction scheme ping-pongs. One set per event =
     *  no bursts, no chase, no flashing, no split-brain. */
    async _wvOvMaintainBadges(reason: string) {
        try {
            if (!Zotero.isWin || (this as any)._wvOvMaintainBusy) return;
            (this as any)._wvOvMaintainBusy = true;
            try {
                const live = this._wvOvLiveWindows();
                if (!live.length) return;
                const top = live.reduce((a: any, b: any) =>
                    ((b._wvOvFocusSeq || 0) > (a._wvOvFocusSeq || 0) ? b : a));
                if (top.closed) return;
                this._wvOvLog("maintain", { reason, top: this._wvBadgeIconNameFor(top) });
                await this._wvOvSetBadge(top, "maintain:" + reason);
            } finally { (this as any)._wvOvMaintainBusy = false; }
        } catch (e) {
            try { (this as any)._wvOvMaintainBusy = false; } catch (e2) {}
            this._wvOvLog("maintain-err", { err: String(e) });
        }
    }

    /** Focus-following: on activation, re-home this window's taskbar
     *  identity and focus-bump its badge (single set — see
     *  _wvOvFocusBump). Moves: a drag-drop never fires activate (the
     *  window is already focused, and re-clicking it won't fire one
     *  either), and Gecko has NO window-move event — resize/
     *  sizemodechange fire only on size/state changes, so a drag
     *  between SAME-RESOLUTION monitors emits nothing. A 1s position
     *  poll is the detector (pure JS compare per tick); any position
     *  change marks the window dirty and the per-monitor repair pass
     *  (_wvOvMaintainBadges) runs once the mouse button is up. */
    _wvWireOverlayFocusFollow(win: any) {
        try {
            // v14: poison-ledger badge management (_wvOvSetBadge). Move
            // detector samples FULL geometry; on first detection during
            // a DRAG the window's overlay request is cleared (carrying
            // a request across monitors is how sticky associations
            // form); the ledger-driven repair runs on the first tick
            // with the mouse button up; window close repairs its
            // monitor. Everything logs to _wvOvLogBuf.
            const VER = 15;
            // Poll presence is part of the wired-ness check: a clear
            // pass kills the interval, so version alone would wrongly
            // early-return and leave the window without its move poll.
            if (!Zotero.isWin || !win) return;
            if (((win as any)._wvOvFollowWired || 0) >= VER && (win as any)._wvOvPollId) return;
            (win as any)._wvOvFollowWired = VER;
            // Birth monitor: where the window first appeared. Session
            // restore creates windows on the OPENER's monitor before
            // moving them home — the shell keeps a button association
            // with the birth monitor (see _wvOvNotePoison).
            if (!(win as any)._wvOvBirthMon) {
                (win as any)._wvOvBirthMon = this._wvOvScreenKeyOf(win);
            }
            try {
                const prev = (win as any)._wvOvMoveHandler;
                if (prev) {
                    win.removeEventListener("sizemodechange", prev);
                    win.removeEventListener("resize", prev);
                    delete (win as any)._wvOvMoveHandler;
                }
            } catch (e) {}
            try {
                const prevAct = (win as any)._wvOvActivateHandler;
                if (prevAct) {
                    win.removeEventListener("activate", prevAct);
                    delete (win as any)._wvOvActivateHandler;
                }
            } catch (e) {}
            const handler = () => {
                try {
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!lp || lp._wvDestroyed) return;
                    lp._wvOvLog("activate", { win: lp._wvBadgeIconNameFor(win), mon: lp._wvOvScreenKeyOf(win) });
                    try { lp._wvApplyWindowTaskbarIdentity(win); } catch (e) {}
                    lp._wvOvFocusBump(win);
                } catch (e) {}
            };
            win.addEventListener("activate", handler);
            (win as any)._wvOvActivateHandler = handler;
            // FULL position key — origin, size, and monitor. Any change
            // between samples means the window went somewhere, even if
            // it came back (round-trip drags end key-identical only
            // when NO sample landed mid-drag AND the drop restored the
            // exact geometry; the unmaximize/remaximize sizemodechange
            // events sample mid-drag, closing that hole for snapped/
            // maximized windows).
            const posKey = () => {
                try {
                    return win.screenX + "," + win.screenY + ","
                        + win.outerWidth + "x" + win.outerHeight
                        + "@" + (win.screen ? win.screen.left + "," + win.screen.top : "");
                } catch (e) { return ""; }
            };
            (win as any)._wvOvPosKey = posKey();
            const moveHandler = () => {
                try {
                    if (!win || win.closed) return;
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!lp || lp._wvDestroyed) return;
                    const key = posKey();
                    if (key !== (win as any)._wvOvPosKey) {
                        (win as any)._wvOvPosKey = key;
                        if (!(win as any)._wvOvMoveDirty) {
                            (win as any)._wvOvMoveDirty = true;
                            lp._wvOvLog("move-detected", { win: lp._wvBadgeIconNameFor(win), pos: key });
                            // A window DRAGGED across monitors while
                            // holding an overlay request is how the
                            // shell's sticky cross-button associations
                            // form (the migrating button stamps foreign
                            // taskbars). Drop the request for the
                            // duration of the drag; the mouse-up repair
                            // re-asserts it. The clear pops that button
                            // to an unknown previous image — invalidate
                            // the ledger entry so the repair isn't
                            // skipped.
                            if (lp._wvMouseButtonDown() && (win as any)._wvOverlayName) {
                                try {
                                    lp._wvSetTaskbarOverlay(win, null);
                                    delete (win as any)._wvOverlayName;
                                    const mt = lp._wvOvMonTop;
                                    if (mt) delete mt[lp._wvOvScreenKeyOf(win)];
                                    lp._wvOvLog("clear-for-drag", { win: lp._wvBadgeIconNameFor(win) });
                                } catch (e) {}
                            }
                        }
                    }
                    if (!(win as any)._wvOvMoveDirty) return;
                    if (lp._wvMouseButtonDown()) {
                        if (!(win as any)._wvOvDeferLogged) {
                            (win as any)._wvOvDeferLogged = true;
                            lp._wvOvLog("repair-deferred", { win: lp._wvBadgeIconNameFor(win), why: "mouse-down" });
                        }
                        // Drag-aware fast poll: while the drag is live,
                        // re-check every 120ms so the repair lands right
                        // after the drop instead of up to a full 1s poll
                        // tick later. Pure JS on purpose — see the
                        // WinEventHook post-mortem note above.
                        if (!(win as any)._wvOvFastTick) {
                            (win as any)._wvOvFastTick = true;
                            win.setTimeout(() => {
                                try {
                                    delete (win as any)._wvOvFastTick;
                                    moveHandler();
                                } catch (e) {}
                            }, 120);
                        }
                        return; // still dragging — repair on release
                    }
                    (win as any)._wvOvMoveDirty = false;
                    delete (win as any)._wvOvDeferLogged;
                    lp._wvOvLog("repair-trigger", { win: lp._wvBadgeIconNameFor(win), pos: key });
                    lp._wvOvSetBadge(win, "move-repair");
                } catch (e) {}
            };
            win.addEventListener("sizemodechange", moveHandler);
            win.addEventListener("resize", moveHandler);
            (win as any)._wvOvMoveHandler = moveHandler;
            try {
                if ((win as any)._wvOvPollId) win.clearInterval((win as any)._wvOvPollId);
            } catch (e) {}
            (win as any)._wvOvPollId = win.setInterval(moveHandler, 1000);
            // Closing a window whose badge tops its monitor's button
            // must hand the badge to the next window there.
            if (!(win as any)._wvOvUnloadWired) {
                (win as any)._wvOvUnloadWired = true;
                win.addEventListener("unload", () => {
                    try {
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (!lp || lp._wvDestroyed) return;
                        let mon = "";
                        try { mon = lp._wvOvScreenKeyOf(win); } catch (e) {}
                        const mt = lp._wvOvMonTop;
                        if (mt && mon) delete mt[mon];
                        lp._wvOvLog("window-closed", { win: lp._wvBadgeIconNameFor(win), mon });
                        const other = lp._wvOvLiveWindows().find((x: any) => x !== win);
                        if (other && mon) other.setTimeout(() => {
                            try {
                                const lp2: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                                if (!lp2 || lp2._wvDestroyed) return;
                                const t = lp2._wvOvTopWindowOn(mon);
                                if (t) lp2._wvOvSetBadge(t, "close-repair");
                            } catch (e) {}
                        }, 700);
                    } catch (e) {}
                });
            }
        } catch (e) {}
    }

    _wvRefreshTaskbarOverlays(clear?: boolean) {
        try {
            if (!Zotero.isWin) return;
            const each = (w: any) => {
                try {
                    if (clear) {
                        try {
                            if ((w as any)._wvOvPollId) { w.clearInterval((w as any)._wvOvPollId); delete (w as any)._wvOvPollId; }
                        } catch (e) {}
                        delete (w as any)._wvOvFollowWired;
                        this._wvSetTaskbarOverlay(w, null); delete (w as any)._wvOverlayName;
                    }
                    else { this._wvWireOverlayFocusFollow(w); }
                } catch (e) {}
            };
            for (const w of (Zotero.getMainWindows() || [])) each(w);
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) each(en.getNext());
            if (clear) (this as any)._wvOvMonTop = {};
            // One repair instead of a per-window burst — bursts of
            // SetOverlayIcon land in random shell order.
            else this._wvOvMaintainBadges("refresh");
        } catch (e) {}
    }

    /** Apply or restore per-window icons on every open window. */
    _wvRefreshWindowIcons(forceOff?: boolean) {
        try {
            if (!Zotero.isWin) return;
            const on = !forceOff && this._getEnableWindowIcons();
            const each = (w: any) => {
                try { if (on) this._wvApplyWindowIcon(w); else this._wvRestoreWindowIcon(w); } catch (e) {}
            };
            for (const w of (Zotero.getMainWindows() || [])) each(w);
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) each(en.getNext());
        } catch (e) {}
    }

    /** A window-section header (label + count), styled like the library headers.
     *  Shared by the all-windows list AND the expanded-session view. */
    _wvTabsMenuWindowHeader(doc: any, label: string, count: number, marker: string, iconType?: string, anchorIconClass?: string, collapseKey?: string, panel?: any, winRef?: any) {
        const header = doc.createElement("div");
        header.className = "wv-tabs-menu-library-header " + (marker || "");
        header.setAttribute("role", "presentation");
        // Left glyph: a plain window frame for any window (main, reader, anchor —
        // the first tab makes the kind obvious); a Zotero icon class for library
        // sub-headers; "none" for sections that aren't windows at all
        // (saved tab groups — their colour dot is the whole identity).
        if (iconType === "none") {
            // no glyph
        } else if (iconType === "anchor" || iconType === "main" || iconType === "reader" || iconType === "window") {
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
        // Window headers carry the same glyph as the OS caption so the
        // colour ↔ window association holds across surfaces.
        lbl.textContent = winRef ? this._wvGlyphLabel(winRef, label) : label;
        header.appendChild(lbl);
        // The window's badge COLOUR dot on the RIGHT of the name — the same
        // position as the anchor's ⚓ mark below (user request 2026-07-13):
        // square = main, circle = reader, colour from the shared pool that
        // also drives the taskbar icon and title-bar dot.
        if (winRef && iconType !== "anchor"
            && (iconType === "main" || iconType === "reader" || iconType === "window")) {
            try {
                const isReader = iconType === "reader";
                const color = WV_WIN_BADGE_COLORS[
                    this._wvTitleGlyphIdx(winRef, isReader) % WV_WIN_BADGE_COLORS.length];
                const dot = doc.createElement("span");
                dot.className = "wv-winhdr-color-dot";
                dot.style.cssText = "display:inline-block;width:9px;height:9px;"
                    + "flex:0 0 auto;margin-inline-start:4px;align-self:center;"
                    + "background-color:" + color + ";"
                    + "border-radius:" + (isReader ? "50%" : "2px") + ";";
                header.appendChild(dot);
            } catch (e) {}
        }
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
        // Optional ✕ — rows that can be REMOVED (saved-window tabs) get
        // the same hover close affordance as live rows (user request
        // 2026-07-16). The handler does the removal; the row's own click
        // (open) is suppressed.
        if (typeof tb.onClose === "function") {
            const x = doc.createElement("div");
            x.className = "wv-row-close";
            x.textContent = "✕";
            x.setAttribute("title", "Remove this tab from the saved window");
            x.addEventListener("click", (ev: any) => {
                try { ev.stopPropagation(); ev.preventDefault(); tb.onClose(); } catch (er) {}
            });
            row.appendChild(x);
        }
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
        // Whole-window group-drop acceptance (a chip released over the window
        // BODY still means "move the group here" — see tab-groups.ts).
        try { (this as any)._wvWireTabGroupWindowDnD(win, false); } catch (e) {}
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
        const mo = new win.MutationObserver((records) => {
            // Ignore batches caused entirely by OUR pinned-mirror container —
            // reacting to our own writes is how the mirror sync once looped
            // the whole observer→apply→mutate cycle forever.
            try {
                if (records && records.length) {
                    let allOurs = true;
                    for (const r of records) {
                        const t: any = r.target;
                        if (!t || !(t.closest ? t.closest("#wv-pinned-mirrors") : null)) { allOurs = false; break; }
                    }
                    if (allOurs) return;
                }
            } catch (e) {}
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
        if ((this as any)._wvDestroyed) return;   // plugin torn down — never re-apply
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
                for (const node of doc.querySelectorAll("#tab-bar-container .tab[data-wv-pin-mirrored]")) {
                    node.removeAttribute("data-wv-pin-mirrored");
                }
                try { const mc = doc.getElementById("wv-pinned-mirrors"); if (mc) mc.remove(); } catch (e) {}
                return;
            }
            const pinKeySet = new Set<string>();
            for (const p of pinPref) pinKeySet.add(p.libraryID + ":" + p.itemKey);

            // Walk Zotero's tabs in order; for each pinned-by-pref tab,
            // record its identity AND its tab.id. The resulting list IS the
            // display order — what we want the pref to reflect.
            const pinnedOpenInOrder: Array<{ libraryID: number, itemKey: string, tabID: string }> = [];
            const pinnedTabIDs = new Set<string>();
            const stickyByTabID = new Map<string, number>();
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
                const kk = k.libraryID + ":" + k.itemKey;
                if (!pinKeySet.has(kk)) continue;
                // ONE visual pin per pinned ITEM: pins are item-keyed, so with
                // duplicate tabs of the same item open every copy matched —
                // one pin became N pref entries + N icon mirrors that wrapped
                // into a second icon row under the bar (2026-07-04). Only the
                // FIRST (leftmost) copy renders as the pinned icon tab; the
                // other duplicates stay normal tabs.
                if (pinnedOpenInOrder.some(p => p.libraryID + ":" + p.itemKey === kk)) continue;
                pinnedOpenInOrder.push({ libraryID: k.libraryID, itemKey: k.itemKey, tabID: tab.id });
                pinnedTabIDs.add(tab.id);
                // LOOSE pinned (no group stamp) → mirrored into the native
                // .pinned-tabs container (left of the scroll arrows, Firefox
                // layout) so it never scrolls out; grouped pinned tabs scroll
                // with their group. Order = tab order.
                if (!(this as any)._wvTabGroupStamp(tab)) {
                    stickyByTabID.set(tab.id, stickyByTabID.size);
                }
            }
            // Publish the DESIGNATED pin tabs (one per pinned item) so other
            // surfaces (tabs-menu pin glyphs) can mark only these — the pin
            // store is item-keyed, and key-matching marked every duplicate
            // copy of a pinned item as pinned ("why do I see so many pinned
            // tabs when there are only 2?", 2026-07-04).
            (win as any)._wvPinnedTabIDs = pinnedTabIDs;

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
            const carried = new Set<string>();   // belt: a stored dupe never survives a rebuild
            for (const p of pinPref) {
                if (openSet.has(p.libraryID + ":" + p.itemKey)) continue;
                if (carried.has(p.libraryID + ":" + p.itemKey)) continue;
                carried.add(p.libraryID + ":" + p.itemKey);
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
                // Mirror stamp for loose pinned tabs: hides the real tab in
                // the scroller (the mirror in .pinned-tabs represents it).
                const si = stickyByTabID.get(id as any);
                if (si != null) {
                    if (!node.hasAttribute("data-wv-pin-mirrored")) node.setAttribute("data-wv-pin-mirrored", "1");
                }
                else if (node.hasAttribute("data-wv-pin-mirrored")) {
                    node.removeAttribute("data-wv-pin-mirrored");
                }
            }
            // Render/refresh the mirror buttons in the native .pinned-tabs
            // container (one per loose pinned tab, in tab order).
            try { (this as any)._wvSyncPinnedMirrors(win, [...stickyByTabID.keys()]); } catch (e) {}
            // Enforce the canonical order (loose-pinned tabs cluster at the far
            // left; group/pin-first handled together). _applyTabGroups also does
            // this, but it returns early when there are no groups — so a pin with
            // no groups present would otherwise never re-cluster. Cheap no-op
            // when already ordered; skipped during restore + native drag + a
            // re-entrant stabilize.
            try {
                if (!(this as any)._wvTabGroupRestoreGuard && !(this as any)._wvStabilizing
                        && win._wvTabGroupDragTabID == null) {
                    (this as any)._wvStabilizing = true;
                    try { (this as any)._wvTabGroupStabilize(win); } catch (e) {}
                    (this as any)._wvStabilizing = false;
                }
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _applyPinnedTabs err: " + e); }
    }

    /** Render one mirror button per LOOSE pinned tab inside Zotero's native
     *  `.pinned-tabs` container (left of the scroll arrows — Firefox layout),
     *  while `_applyPinnedTabs` hides the real React tab in the scroller.
     *  Mirrors forward click (select), middle-click (close) and contextmenu
     *  (native tab menu) to the real tab. Rebuilt cheaply on every apply (a
     *  handful of nodes); dragging mirrors is not supported (v1). */
    _wvSyncPinnedMirrors(win, tabIDs) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            const pinnedC = doc.querySelector("#tab-bar-container .pinned-tabs");
            if (!pinnedC) return;
            // The current beta nests the actual flex ROW as `.pinned-tabs >
            // .tabs` (the library tab lives there); `.pinned-tabs` itself is
            // display:block, so a sibling div WRAPS under the bar (the "PDF
            // icons below the tab bar" bug, 2026-07-04). Mount the mirrors
            // INSIDE the row when it exists; fall back to the container on
            // older layouts where `.pinned-tabs` was the row itself.
            const rowC = pinnedC.querySelector(":scope > .tabs") || pinnedC;
            let cont = doc.getElementById("wv-pinned-mirrors");
            if (!tabIDs || !tabIDs.length) { if (cont) cont.remove(); return; }
            if (!cont) {
                cont = doc.createElement("div");
                cont.id = "wv-pinned-mirrors";
                rowC.appendChild(cont);
            } else if (cont.parentElement !== rowC) {
                rowC.appendChild(cont);   // re-home after a layout change
            }
            const Z = win.Zotero_Tabs;
            const want = new Set(tabIDs.map(String));
            // Drop mirrors whose tab is gone / no longer loose-pinned.
            for (const m of [...cont.querySelectorAll(".wv-pinned-mirror")]) {
                if (!want.has(m.getAttribute("data-tab-id"))) m.remove();
            }
            for (const tid of tabIDs) {
                const tab = Z._tabs.find((t) => t.id === tid);
                if (!tab) continue;
                let m = cont.querySelector('.wv-pinned-mirror[data-tab-id="' + tid + '"]');
                if (!m) {
                    m = doc.createElement("div");
                    m.className = "wv-pinned-mirror";
                    m.setAttribute("data-tab-id", tid);
                    const icon = doc.createElement("span");
                    icon.className = "icon icon-css tab-icon icon-item-type";
                    m.appendChild(icon);
                    m.addEventListener("click", (e) => {
                        try {
                            if (e.button !== 0) return;
                            const lp = Zotero.Weavero && Zotero.Weavero.plugin;
                            if (!lp) return;
                            win.Zotero_Tabs.select(m.getAttribute("data-tab-id"));
                        } catch (er) {}
                    });
                    m.addEventListener("auxclick", (e) => {
                        try {
                            if (e.button !== 1) return;
                            const lp = Zotero.Weavero && Zotero.Weavero.plugin;
                            if (!lp) return;
                            win.Zotero_Tabs.close(m.getAttribute("data-tab-id"));
                        } catch (er) {}
                    });
                    m.addEventListener("contextmenu", (e) => {
                        try {
                            e.preventDefault(); e.stopPropagation();
                            const lp = Zotero.Weavero && Zotero.Weavero.plugin;
                            if (!lp) return;
                            const ZT = win.Zotero_Tabs;
                            if (typeof ZT._openMenu === "function") ZT._openMenu(e.screenX, e.screenY, m.getAttribute("data-tab-id"));
                        } catch (er) {}
                    });
                    // Attach ONCE at creation (the order pass below only
                    // REPOSITIONS attached nodes — losing this append left
                    // zero mirrors in the DOM). A create-time mutation can't
                    // loop: steady-state passes create nothing.
                    cont.appendChild(m);
                }
                // Keep icon / tooltip / selection in sync on every pass.
                try {
                    const iid = tab.data && tab.data.itemID;
                    const it: any = iid && Zotero.Items.get(iid);
                    const icon = m.querySelector(".icon-item-type");
                    if (icon && it && it.getItemTypeIconName) {
                        const t = it.getItemTypeIconName(true);
                        if (icon.getAttribute("data-item-type") !== t) icon.setAttribute("data-item-type", t);
                    }
                } catch (e) {}
                if (m.getAttribute("title") !== (tab.title || "")) m.setAttribute("title", tab.title || "");
                m.classList.toggle("selected", Z.selectedID === tid);
            }
            // Order pass — REPOSITION ONLY WHEN WRONG. An unconditional
            // appendChild here mutated childList on every call, and the
            // tab-bar MutationObserver re-runs this method on every childList
            // mutation → INFINITE LOOP (fresh Zotero unresponsive at 3.8 GB
            // within a minute, 2026-07-03). Steady state must be zero-mutation.
            let prev = null;
            for (const tid of tabIDs) {
                const m = cont.querySelector('.wv-pinned-mirror[data-tab-id="' + tid + '"]');
                if (!m) continue;
                const expectedPrev = prev;
                const actualPrev = (() => { let p = m.previousElementSibling; return p; })();
                if (m.parentNode !== cont || actualPrev !== expectedPrev) {
                    if (expectedPrev) { if (expectedPrev.nextSibling !== m) cont.insertBefore(m, expectedPrev.nextSibling); }
                    else if (cont.firstChild !== m) cont.insertBefore(m, cont.firstChild);
                }
                prev = m;
            }
        } catch (e) { Zotero.debug("[Weavero] _wvSyncPinnedMirrors err: " + e); }
    }

    /** Dispatcher for moving a reader/note tab between main windows. A PDF
     *  reader is moved WITHOUT reloading — its live docshell is swapped into the
     *  target window (Firefox-style; see `_wvSwapMoveToMain`). Notes or any
     *  pre-commit failure fall back to the classic close+reopen. */
    _wvMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned, opts?: any) {
        const isNote = payload && (payload.readerType === "note" || String(payload.tabType || "").indexOf("note") === 0);
        // noFocus (popup-initiated move): skip the no-reload swap — its donor
        // Reader.open routes by the FOCUSED main window, so the swap can't run
        // without surfacing the target. The classic path's noFocus branch adds
        // the tab unloaded/window-explicit instead.
        if (!isNote && payload && typeof payload.itemID === "number" && !(opts && opts.noFocus)) {
            const classic = () => {
                try { this._wvClassicMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned, opts); }
                catch (e) { Zotero.debug("[Weavero] classic move fallback err: " + e); }
            };
            Promise.resolve()
                .then(() => this._wvSwapMoveToMain(srcWin, targetWin, payload, targetIndex, maxOtherPinned))
                .then((ok) => { if (!ok) classic(); })
                .catch((e) => { Zotero.debug("[Weavero] swap-move err, classic fallback: " + e); classic(); });
            return;
        }
        this._wvClassicMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned, opts);
    }

    /** Before closing a source tab during a cross-window move: if it's the source
     *  window's SELECTED tab, move selection off it first. Otherwise Zotero
     *  auto-selects a neighbour on close, and if that neighbour is an UNLOADED
     *  reader it loads — but with the TARGET window focused, the new
     *  ReaderInstance reads getMostRecentWindow() = target and binds
     *  _tabContainer against the wrong window (reader.js:1808/1815), so it
     *  hangs at "Loading…". Firefox's rule is to reveal an ADJACENT tab when
     *  the dragged tab leaves (tabbrowser on_drop/adoptTab), so pick the
     *  nearest LOADED neighbour (next, then previous — loaded tabs can't
     *  trigger the stray cross-window load); the always-loaded library tab is
     *  the fallback, not the default. */
    _wvSafeguardSourceSelectionBeforeClose(srcWin, sourceTabId) {
        try {
            const SZT: any = srcWin && srcWin.Zotero_Tabs;
            if (!SZT || SZT.selectedID !== sourceTabId || typeof SZT.select !== "function") return;
            let pick = "zotero-pane";
            try {
                const tabs: any[] = SZT._tabs || [];
                const idx = tabs.findIndex((t: any) => t && t.id === sourceTabId);
                const loaded = (t: any) => t && t.id !== sourceTabId && typeof t.type === "string"
                    && t.type.indexOf("-unloaded") < 0 && t.type.indexOf("-loading") < 0;
                let cand: any = null;
                for (let i = idx + 1; i < tabs.length && !cand; i++) if (loaded(tabs[i])) cand = tabs[i];
                for (let i = idx - 1; i >= 1 && !cand; i--) if (loaded(tabs[i])) cand = tabs[i];
                if (cand) pick = cand.id;
            } catch (e) {}
            SZT.select(pick);
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
            // A Read Aloud guidance panel is a XUL element in the SOURCE
            // window's popupset — it can't survive the re-home, and a stale
            // reference is fatal: uninit() -> _hideReadAloudGuidance() ->
            // guidancePanel.hide() throws ("this.panel is null") AFTER the
            // _isUninitialized flag but BEFORE Reader.notify's splice, leaking
            // the reader (caught by tearoff.spec.js, 2026-07-17).
            try {
                if (S._readAloudGuidancePanel) {
                    try { S._readAloudGuidancePanel.hide(); } catch (e2) {}
                    S._readAloudGuidancePanel = null;
                }
            } catch (e) {}
            try { targetWin.addEventListener("pointerdown", S._handlePointerDown); } catch (e) {}
            try { targetWin.addEventListener("pointerup", S._handlePointerUp); } catch (e) {}
            try { targetWin.addEventListener("DOMContentLoaded", S._handleLoad); } catch (e) {}
            // If S arrives grafted (a torn-off standalone window moving back to a
            // tab), restore its tab-aware prototype methods.
            try { this._wvUngraftWindowGlue(S); } catch (e) {}

            // CLASS ADOPTION (2026-07-17): a re-homed ReaderWindow living in a
            // main tab is invisible to every `instanceof ReaderTab` filter in
            // reader.js — getByTabID, the beta.10 select-notify activity loop,
            // and Reader.open's UNCONDITIONAL openInWindow reuse branch. That
            // mismatch closed a merged-back tab on drag-out: the tear-off
            // wrapper couldn't resolve S, fell back to the native hook's
            // close-then-Reader.open(openInWindow), and open() reused the
            // just-orphaned instance instead of opening a window (item 146
            // incident). The donor IS a real ReaderTab, so adopt its prototype:
            // instance fields carry all live state; content-side callbacks hold
            // function values bound at init, so they keep working. ReaderTab
            // constructor props S never got (_handlePointerDown etc.) stay
            // absent — their addEventListener sites no-op on undefined.
            try {
                if (S.constructor && S.constructor.name !== "ReaderTab"
                        && targetWin.Zotero_Tabs && donor.constructor && donor.constructor.name === "ReaderTab") {
                    Object.setPrototypeOf(S, Object.getPrototypeOf(donor));
                    // Backfill the ReaderTab-only INSTANCE fields the adopted
                    // (ReaderWindow-born) target never got. ReaderInstance wraps
                    // itself in a Proxy whose get/set traps forward MISSING
                    // properties to `_internalReader` — and once the tab's
                    // browser is destroyed that's a dead wrapper, so any such
                    // read/write throws "can't access dead object". Concretely:
                    // ReaderTab.uninit reads `_handleLoad` and writes
                    // `_pointerDownWindow` — the throw aborted uninit AFTER the
                    // _isUninitialized flag, before Reader.notify's splice, and
                    // the reader leaked (caught by tearoff.spec.js, 2026-07-17).
                    // defineProperty bypasses both traps and writes the target.
                    for (const k of ["_handleLoad", "_handlePointerDown", "_handlePointerUp"]) {
                        if (!Object.getOwnPropertyDescriptor(S, k)) {
                            Object.defineProperty(S, k, { value: null, writable: true, configurable: true });
                        }
                    }
                    const defaults: Array<[string, any]> = [["_readAloudPlaying", false], ["_pointerDownWindow", null]];
                    for (const [k, v] of defaults) {
                        if (!Object.getOwnPropertyDescriptor(S, k)) {
                            Object.defineProperty(S, k, { value: v, writable: true, configurable: true });
                        }
                    }
                }
            } catch (e) { Zotero.debug("[Weavero] class adoption err: " + e); }

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
            try { if (!(S as any)._isUninitialized && !Reader._readers.includes(S)) Reader._readers.push(S); } catch (e) {}   // corpse guard: never re-add a disposed reader
            // beta.10 deactivates the docShells of unselected reader tabs, and
            // its select-notify loop only recomputes `instanceof ReaderTab`
            // readers. The donor was opened in the BACKGROUND, so its shell
            // starts INACTIVE — and a re-homed ReaderWindow instance is
            // invisible to the loop, so nothing would ever activate it: the
            // merged tab rendered frozen/blank (2026-07-16 incident, item 146).
            // Assert active now; a ReaderTab S is re-computed natively on the
            // next select, a ReaderWindow S stays always-active (pre-beta.10
            // semantics for every tab, so no regression). For a non-ReaderTab S
            // nothing native ever re-computes activity, and a one-shot late
            // writer was observed flipping it back off ~1.5-2s after the move —
            // re-assert on a deferred schedule too.
            try { if (S._iframe) S._iframe.docShellIsActive = true; } catch (e) {}
            try {
                if (S.constructor && S.constructor.name !== "ReaderTab") {
                    const keepActive = () => { try { if (S._iframe) S._iframe.docShellIsActive = true; } catch (e) {} };
                    (targetWin.setTimeout || setTimeout)(keepActive, 800);
                    (targetWin.setTimeout || setTimeout)(keepActive, 2500);
                }
            } catch (e) {}

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
        // The re-homed ReaderTab is about to live in a Zotero_Tabs-less window;
        // make sure the prototype safety wrappers are in place first.
        try { (this as any)._wvEnsureReaderTabWindowSafety(); } catch (e) {}
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
            try { if (!(S as any)._isUninitialized && !Reader._readers.includes(S)) Reader._readers.push(S); } catch (e) {}   // corpse guard: never re-add a disposed reader

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
            // A tab-select notify that fired mid-move already recomputed S's
            // docShell activity against the new (non-main) window and turned it
            // OFF (beta.10 throttles inactive shells -- frozen reader). Re-assert;
            // the _wvEnsureReaderTabWindowSafety wrapper keeps it on from here.
            // The deferred re-assert covers late notifies still in flight from
            // the source-tab close (observed live: active flipped back to false
            // within 800ms of the sync assert).
            try { if (S._iframe) S._iframe.docShellIsActive = true; } catch (e) {}
            try {
                (donorWin.setTimeout || setTimeout)(() => {
                    try { if (S._iframe) S._iframe.docShellIsActive = true; } catch (e) {}
                }, 700);
            } catch (e) {}
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
    _wvClassicMoveTabBetweenMains(srcWin, targetWin, payload, targetIndex, maxOtherPinned, opts?: any) {
        try {
            const itemID = payload && typeof payload.itemID === "number" ? payload.itemID : null;
            if (itemID == null || !targetWin) return;
            const noFocus = !!(opts && opts.noFocus);
            const isNote = payload.readerType === "note" || String(payload.tabType || "").indexOf("note") === 0;
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
            // (noFocus skips this — its open route below is window-explicit.)
            try { if (!noFocus && targetWin.focus) targetWin.focus(); } catch (e) {}
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
                    if (noFocus) {
                        // Background arrival (popup move): a window-explicit
                        // UNLOADED add — no Reader.open (routes by focus +
                        // selects the new tab). Loads lazily when the user
                        // selects it; the current window keeps focus and
                        // selection. The add is synchronous, so rename/position/
                        // pin the EXACT returned tab here — the generic place()
                        // poll matches by itemID and can grab a pre-existing
                        // duplicate of the same item instead.
                        const r = Z_Tabs.add({
                            type: isNote ? "note-unloaded" : "reader-unloaded",
                            data: { itemID },
                            select: false,
                            preventJumpback: true,
                        });
                        if (r && r.id) {
                            let nid = r.id;
                            try {
                                const sid = payload && payload.sourceTabId;
                                if (sid && sid !== nid && /^tab-/.test(String(sid)) && this._wvRenameTab(targetWin, nid, sid)) nid = sid;
                            } catch (e) {}
                            try {
                                if (typeof Z_Tabs.move === "function") {
                                    const clamped = Math.max(1, Math.min(targetIndex, Z_Tabs._tabs.length - 1));
                                    Z_Tabs.move(nid, clamped);
                                }
                            } catch (e) {}
                            try {
                                const tab = Z_Tabs._tabs.find((t: any) => t && t.id === nid);
                                const curIdx = tab ? Z_Tabs._tabs.indexOf(tab) : -1;
                                if (curIdx <= maxOtherPinned && curIdx > 0) {
                                    const item: any = Zotero.Items.get(itemID);
                                    if (item) { this._pinnedTabsAdd(item.libraryID, item.key); this._applyPinnedTabs(targetWin); }
                                }
                            } catch (e) {}
                        }
                        return;
                    } else if (isNote) {
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
                // Prefix match: main-window note tabs can be note-unloaded /
                // note-loading — strict === "note" routed unloaded notes down
                // the READER path (wedged at "Loading…"; same family as the
                // group-migrate note-type bug).
                if (iid != null) payloads.push({ itemID: iid, sourceTabId: id, tabType: t.type || "", readerType: String(t.type || "").indexOf("note") === 0 ? "note" : "" });
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
                const isNote = pl.readerType === "note" || String(pl.tabType || "").indexOf("note") === 0;
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
                        const isNote = String(zotTab.type || "").indexOf("note") === 0;
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
                        if ((win as any)._wvPinnedTabIDs instanceof Set ? (win as any)._wvPinnedTabIDs.has(t.id) : self._pinnedTabsHas(k.libraryID, k.itemKey)) maxOtherPinned = i;
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
                        if ((win as any)._wvPinnedTabIDs instanceof Set ? (win as any)._wvPinnedTabIDs.has(t.id) : self._pinnedTabsHas(k.libraryID, k.itemKey)) maxOtherPinned = i;
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
                                    if (k && ((win as any)._wvPinnedTabIDs instanceof Set ? (win as any)._wvPinnedTabIDs.has(t.id) : self._pinnedTabsHas(k.libraryID, k.itemKey))) maxPinnedIdx = i;
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
                            if ((win as any)._wvPinnedTabIDs instanceof Set ? (win as any)._wvPinnedTabIDs.has(t.id) : self._pinnedTabsHas(k.libraryID, k.itemKey)) maxOtherPinned = i;
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
                                try { live._wvWTMoveSelectionToMain(srcWin, ids, win, data.sourceTabId); } catch (er) {}
                                return;
                            }
                            // Pass THIS window: the movers default to the anchor
                            // main window, so a drop on a secondary main window
                            // used to land the tab in the wrong window. And pass
                            // the DROP SLOT: the mover's swap-commit runs its own
                            // deferred positioning (~150ms after detach) with
                            // whatever index it holds -- defaulting to END, it
                            // overwrote positionNewTab's earlier correct move and
                            // the tab always landed at the end (2026-07-21).
                            try { live._wvWTMoveTabToMain(srcWin, data.sourceTabId, win, { targetIndex, maxOtherPinned }); } catch (er) {}
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
                if ((win as any)._wvPinnedTabIDs instanceof Set ? (win as any)._wvPinnedTabIDs.has(t.id) : this._pinnedTabsHas(k.libraryID, k.itemKey)) lastOtherPinnedIdx = i;
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
            if (!doc) return;
            const PIN_STYLE_VERSION = "3";
            const prev = doc.getElementById("wv-pinned-tab-style");
            if (prev) {
                if (prev.getAttribute("data-wv-ver") === PIN_STYLE_VERSION) return;
                prev.remove();
            }
            const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
            style.id = "wv-pinned-tab-style";
            style.setAttribute("data-wv-ver", PIN_STYLE_VERSION);
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
                // LOOSE pinned tabs (not in a group) render as MIRROR buttons
                // inside Zotero's native `.pinned-tabs` container — LEFT of the
                // scroll arrows, exactly like Firefox — while the real React
                // tab stays hidden in the scroller (reparenting a React-managed
                // node is not survivable; a lightweight mirror is). The mirror
                // forwards click / middle-click / contextmenu to the real tab.
                "#tab-bar-container .tabs .tab[data-wv-pin-mirrored] {",
                "  display: none !important;",
                "}",
                "#wv-pinned-mirrors {",
                "  display: flex;",
                "  align-items: stretch;",
                "}",
                "#tab-bar-container .wv-pinned-mirror {",
                "  width: 36px;",
                "  display: flex;",
                "  align-items: center;",
                "  justify-content: center;",
                "  border-radius: 6px;",
                "  cursor: default;",
                // The tab bar doubles as the window-drag region — without
                // no-drag the OS eats real clicks on the mirror.
                "  -moz-window-dragging: no-drag;",
                "}",
                "#tab-bar-container .wv-pinned-mirror:hover {",
                "  background-color: var(--fill-quinary);",
                "}",
                "#tab-bar-container .wv-pinned-mirror.selected {",
                "  background: var(--material-button);",
                "  box-shadow: 0px 0px 0px 0.5px rgba(0, 0, 0, 0.05), 0px 0.5px 2.5px 0px rgba(0, 0, 0, 0.30);",
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
                                            self._wvMakeShowInLibraryMenuMulti(win2, popup, tg);
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
    /** Rebind the native "Show in Library" menuitem to select ALL selected
     *  tabs' items in the items list (parents for child attachments, deduped)
     *  — the native handler only selects the context tab's item. Mirrors
     *  _wvMakeCloseTabsMenuMulti (user request 2026-07-13). */
    _wvMakeShowInLibraryMenuMulti(win: any, popup: any, targets: any[]) {
        try {
            const label = Zotero.getString("general.showInLibrary");
            for (const mi of Array.from(popup.querySelectorAll("menuitem")) as any[]) {
                if (!mi.getAttribute || mi.getAttribute("label") !== label) continue;
                const clone = mi.cloneNode(true);   // drops the native single-tab command listener
                mi.replaceWith(clone);
                clone.addEventListener("command", () => {
                    try {
                        const ZT: any = win && (win as any).Zotero_Tabs;
                        const ids: any[] = [];
                        for (const tid of targets) {
                            try {
                                const got = ZT && ZT._getTab ? ZT._getTab(tid) : null;
                                const tab = got && got.tab;
                                let itemID = tab && tab.data && tab.data.itemID;
                                if (itemID == null) continue;
                                const it: any = Zotero.Items.get(itemID);
                                if (it && it.parentItemID) itemID = it.parentItemID;
                                if (!ids.includes(itemID)) ids.push(itemID);
                            } catch (e2) {}
                        }
                        if (ids.length && win.ZoteroPane
                            && typeof win.ZoteroPane.selectItems === "function") {
                            win.ZoteroPane.selectItems(ids);
                        }
                    } catch (e) {}
                });
                break;
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMakeShowInLibraryMenuMulti err: " + e); }
    }

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
    /** PREVENT the native session mirror in a window Weavero spawns —
     *  the root fix (user question 2026-07-16, after the clear-state
     *  race fused two windows' tabs): every new main window's
     *  ZoteroPane.init unconditionally runs
     *  `Zotero_Tabs.restoreState(state.tabs)` (zoteroPane.js
     *  "Restore pane state"), and `Zotero.openMainWindow()` has no
     *  clean-window option. So the spawned window's `restoreState`
     *  is wrapped to SWALLOW calls until `_wvInitDevMainWindow`'s
     *  finish() unwraps it for Weavero's own restore. Call this the
     *  moment the spawned window is claimed (onMainWindowLoad) —
     *  init's mirror runs later, after Zotero's init promise. The
     *  session-state clear, the settle-wipe and the 1.6s purge stay
     *  as backstops. */
    _wvSuppressNativePaneRestore(win: any) {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z || (win as any)._wvOrigRestoreState) return;
            const orig = Z.restoreState;
            if (typeof orig !== "function") return;
            (win as any)._wvOrigRestoreState = orig;
            Z.restoreState = function () {
                try {
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (lp && lp._wvTrace) lp._wvTrace("spawn: swallowed native pane mirror");
                } catch (e) {}
                return undefined;
            };
        } catch (e) {}
    }

    _wvUnsuppressNativePaneRestore(win: any) {
        try {
            if (win && (win as any)._wvOrigRestoreState && win.Zotero_Tabs) {
                win.Zotero_Tabs.restoreState = (win as any)._wvOrigRestoreState;
                delete (win as any)._wvOrigRestoreState;
            }
        } catch (e) {}
    }

    _wvInitDevMainWindow(win, group) {
        if (!win) return;
        let lastCount = -1, stableTicks = 0, ticks = 0, done = false;
        const finish = () => {
            if (done) return; done = true;
            try {
                // Hand the real restoreState back before using it — the
                // spawn wrapper (see _wvSuppressNativePaneRestore) has
                // been swallowing the native mirror until now.
                try { (this as any)._wvUnsuppressNativePaneRestore(win); } catch (e) {}
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
                    // CLEAN window (Ctrl+N / hamburger): land on My Library.
                    // One selectLibrary call is not enough — Zotero's
                    // collections-view init asynchronously restores the
                    // GLOBAL lastViewedFolder pref (the collection some
                    // other window last viewed) and can override us after
                    // the fact (user report 2026-07-16). Re-assert until
                    // the selection verifiably IS the user library.
                    const wanted = "L" + Zotero.Libraries.userLibraryID;
                    const enforceLib = (tries: number) => {
                        try {
                            const zp = win.ZoteroPane;
                            const cv = zp && zp.collectionsView;
                            if (cv && typeof cv.selectLibrary === "function") {
                                const row = zp.getCollectionTreeRow && zp.getCollectionTreeRow();
                                if (row && row.id === wanted) return;   // settled
                                cv.selectLibrary(Zotero.Libraries.userLibraryID);
                            }
                        } catch (e) {}
                        if (tries < 10) { try { win.setTimeout(() => enforceLib(tries + 1), 250); } catch (e) {} }
                    };
                    enforceLib(0);
                }
            } catch (e) { Zotero.debug("[Weavero] _wvInitDevMainWindow err: " + e); }
            // VERIFY-AND-PURGE (2026-07-16): the settle heuristic (count
            // stable for 2 ticks) can declare the native session mirror
            // finished while a late batch is still coming — those tabs
            // land AFTER closeAll and fuse the anchor's tab set with this
            // window's own. Seen live: a spawned window with 15 mirrored
            // + 8 own + library = 24 tabs, and the next session
            // auto-snapshot froze the fusion into the store. One pass
            // ~1.6s later closes every UNSELECTED tab whose itemID isn't
            // in this window's own list (per-ID counted, so intentional
            // duplicates survive; the selected tab is never touched so a
            // user's quick manual open can't be eaten).
            try {
                const expected = new Map();
                for (const t of ((group && group.tabs) || [])) {
                    const iid = t && t.data && t.data.itemID;
                    if (iid != null) expected.set(iid, (expected.get(iid) || 0) + 1);
                }
                if (expected.size) {
                    const lp: any = this;
                    win.setTimeout(() => {
                        try {
                            const Z = win.Zotero_Tabs;
                            if (!Z || !Z._tabs) return;
                            const seen = new Map();
                            const toClose: any[] = [];
                            for (const t of Z._tabs.slice()) {
                                if (!t || t.type === "library" || t.selected) continue;
                                const iid = t.data && t.data.itemID;
                                if (iid == null) continue;
                                const c = (seen.get(iid) || 0) + 1;
                                seen.set(iid, c);
                                if (c > (expected.get(iid) || 0)) toClose.push(t.id);
                            }
                            if (toClose.length) {
                                try { lp._wvTrace && lp._wvTrace("dev-init purge: closing " + toClose.length + " late-mirrored tab(s)"); } catch (e) {}
                                for (const id of toClose) { try { Z.close(id); } catch (e) {} }
                            }
                        } catch (e) {}
                    }, 1600);
                }
            } catch (e) {}
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

    /** Multi-main-window fix: `<item-details>` subscribes to the GLOBAL
     *  `tab`/`select` notifier, and `_handleTabSelect` sets
     *  `skipRender = !ids.includes(this.tabID)` — so a tab switch in
     *  ANOTHER main window (whose tab id this window doesn't have)
     *  freezes this window's visible item pane: `skipRender` sticks
     *  true and item clicks stop repainting (observed 2026-07-11:
     *  selecting a reader tab in window 2 froze window 1's library
     *  pane on its last item). Upstream never sees this — core Zotero
     *  has exactly one main window; multiple mains are Weavero's
     *  feature, so the guard is ours to add. Patch the per-window
     *  custom-element prototype (covers the library pane AND every
     *  context-pane instance) to ignore select events that involve
     *  none of THIS window's tabs. Also heals an already-poisoned
     *  visible pane at wire time. Idempotent per window. */
    _wvPatchItemDetailsTabSelect(win: any) {
        try {
            const cls = win && win.customElements && win.customElements.get("item-details");
            const proto = cls && cls.prototype;
            if (proto && typeof proto._handleTabSelect === "function"
                && !proto._wvOrigHandleTabSelect) {
                const orig = proto._handleTabSelect;
                proto._wvOrigHandleTabSelect = orig;
                proto._handleTabSelect = function (tabIDs: any) {
                    try {
                        const Z = win.Zotero_Tabs;
                        if (Z && Array.isArray(tabIDs)
                            && !tabIDs.some((id: any) =>
                                Z._tabs.some((t: any) => t.id === id))) {
                            return;   // another window's tab switch — not ours
                        }
                    } catch (e) {}
                    return orig.apply(this, arguments);
                };
            }
            // Heal: if this window's pane was already poisoned by a
            // foreign select (visible tab selected but skipRender true),
            // re-enable and repaint now.
            try {
                const det = win.ZoteroPane && win.ZoteroPane.itemPane
                    && win.ZoteroPane.itemPane._itemDetails;
                if (det && det.skipRender
                    && win.Zotero_Tabs && win.Zotero_Tabs.selectedID === det.tabID) {
                    det.skipRender = false;
                    det.render();
                }
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvPatchItemDetailsTabSelect err: " + e); }
    }

    _wvUnpatchItemDetailsTabSelect(win: any) {
        try {
            const cls = win && win.customElements && win.customElements.get("item-details");
            const proto = cls && cls.prototype;
            if (proto && proto._wvOrigHandleTabSelect) {
                proto._handleTabSelect = proto._wvOrigHandleTabSelect;
                delete proto._wvOrigHandleTabSelect;
            }
        } catch (e) {}
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
            // The positional anchor is captured by _wvWindowStoreCaptureAnchor
            // even when it carries _wvManagedWindow (a promoted eldest main)
            // — skip it here so it isn't double-captured as main-dev.
            const anchor: any = (Zotero.getMainWindows() || [])[0] || null;
            const en = Services.wm.getEnumerator("navigator:browser");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (!w || !w._wvManagedWindow || w === anchor) continue;
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
                // Positional anchor definition (see _wvWindowStoreCaptureAnchor).
                return (this as any)._wvIsAnchorWindow(fw)
                    ? { kind: "anchor" }
                    : (fw._wvManagedWindow
                        ? { kind: "main-dev", wvWinId: (fw._wvWindowId != null ? fw._wvWindowId : null) }
                        : { kind: "anchor" });
            }
            return null;
        } catch (e) { return null; }
    }

    /** The ANCHOR window's full tab set — the RESTORE TAKEOVER's other half:
     *  Zotero's own session keeps only the library tab, so Weavero must carry
     *  the real list (captured on every save, crash-fresh like the rest). */
    _wvWindowStoreCaptureAnchor() {
        try {
            // POSITIONAL, matching _wvIsAnchorWindow: the anchor is
            // getMainWindows()[0], NOT "the untagged window" — after the
            // original startup window converts/closes, the promoted
            // eldest main still carries _wvManagedWindow, and the old
            // untagged-based capture would write NO anchor entry at all
            // (aligned 2026-07-15).
            const w: any = (Zotero.getMainWindows() || [])[0];
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

    // ---- Saved windows -----------------------------------------------------
    // "Save and Close Window" — the whole-window analog of the tab groups'
    // Save and Close (user request 2026-07-15). A saved window parks its
    // tab set (+ geometry, colour, name) in weavero/saved-windows.json and
    // closes; the Saved Windows section of the tabs menu reopens it.

    _wvSavedWindowsPath() {
        return PathUtils.join(Zotero.DataDirectory.dir, "weavero", "saved-windows.json");
    }

    /** Load saved-windows.json once (cached promise); unreadable → backed
     *  up and started clean — same contract as tab-sessions.json. */
    _wvSavedWindowsInit() {
        const p: any = this as any;
        if (p._wvSavedWinInitPromise) return p._wvSavedWinInitPromise;
        p._wvSavedWinInitPromise = (async () => {
            const path = this._wvSavedWindowsPath();
            try {
                const text: any = await Zotero.File.getContentsAsync(path);
                const doc = JSON.parse(text);
                p._wvSavedWinDoc = (doc && Array.isArray(doc.windows))
                    ? { version: 1, windows: doc.windows } : { version: 1, windows: [] };
            } catch (e) {
                let exists = false;
                try { exists = await IOUtils.exists(path); } catch (_) {}
                if (exists) {
                    try { await IOUtils.move(path, path + ".corrupt-" + Date.now()); } catch (_) {}
                }
                p._wvSavedWinDoc = { version: 1, windows: [] };
            }
            return p._wvSavedWinDoc;
        })();
        return p._wvSavedWinInitPromise;
    }

    _wvSavedWindowsList() {
        const p: any = this as any;
        return (p._wvSavedWinDoc && p._wvSavedWinDoc.windows) || [];
    }

    _wvSavedWindowsPersist() {
        const p: any = this as any;
        if (!p._wvSavedWinDoc) return Promise.resolve();
        const snapshot = JSON.stringify(p._wvSavedWinDoc, null, 2);
        const path = this._wvSavedWindowsPath();
        p._wvSavedWinWriteChain = (p._wvSavedWinWriteChain || Promise.resolve())
            .then(async () => {
                await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
                await IOUtils.writeUTF8(path, snapshot, { tmpPath: path + ".tmp" });
            })
            .catch((e: any) => Zotero.debug("[Weavero] saved-windows persist failed: " + e));
        return p._wvSavedWinWriteChain;
    }

    /** Capture + park + close. Guards: the last main window can't close
     *  (Zotero needs one), and a window with nothing but the library tab
     *  has nothing to save. (Moving a window to ANOTHER session is a
     *  different verb: _wvMoveWindowToSession keeps a live window live
     *  in the target; _wvSavedWindowMoveToSession re-files a parked
     *  one — user semantics 2026-07-15.) */
    async _wvSaveAndCloseWindow(win: any, isReader: boolean) {
        try {
            await this._wvSavedWindowsInit();
            let tabs: any[]; let count = 0;
            if (isReader) {
                const st: any = (this as any)._wvWTState(win);
                tabs = ((st && st.tabs) || [])
                    .filter((t: any) => t && t.itemID != null)
                    .map((t: any) => ({ itemID: t.itemID, isNote: t.type === "note", title: t.title || "" }));
                count = tabs.length;
                if (!count) { Services.prompt.alert(win, "Weavero", "This window has no tabs to save."); return; }
            } else {
                if ((Zotero.getMainWindows() || []).length < 2) {
                    Services.prompt.alert(win, "Weavero",
                        "This is the last main window — open another main window first, then save this one.");
                    return;
                }
                const Z: any = win.Zotero_Tabs;
                tabs = (Z && (Z._wvGetStateFull ? Z._wvGetStateFull() : Z.getState())) || [];
                count = tabs.filter((t: any) => t && t.type !== "library").length;
                if (!count) { Services.prompt.alert(win, "Weavero", "This window has no document tabs to save."); return; }
            }
            // No name prompt (user request 2026-07-15) — the window's
            // existing name carries over; rename beforehand if needed.
            const defName = isReader
                ? ((win as any)._wvWindowTitle || "Reader Window")
                : this._wvWindowName(win);
            let wvMainState: any;
            if (!isReader) {
                try {
                    const ms = (this as any)._wvTabSessionCaptureMainState
                        ? (this as any)._wvTabSessionCaptureMainState(win) : null;
                    if (ms && (ms.collection || ms.columnPrefs)) wvMainState = ms;
                } catch (e) {}
            }
            const entry = {
                id: "swin-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36),
                name: defName,
                kind: isReader ? "reader" : "main",
                tabs, count,
                geom: (this as any)._wvWindowGeom(win),
                glyph: (win as any)._wvTitleGlyphIdx != null ? (win as any)._wvTitleGlyphIdx : null,
                wvMainState,
                // A saved window belongs to the session it was saved from
                // (null = the unnamed/current scope) and renders inside
                // that session's block in the tabs menu.
                sessionId: (this as any)._wvTabSessionGetActiveId
                    ? (this as any)._wvTabSessionGetActiveId() : null,
                savedAt: Date.now(),
            };
            const p: any = this as any;
            p._wvSavedWinDoc.windows.push(entry);
            this._wvSavedWindowsPersist();
            try { win.close(); } catch (e) {}
            // Show the result immediately — an open List-all-tabs panel
            // otherwise sits stale and the save looks like a no-op (user
            // report 2026-07-16). Deferred a beat so the closed window
            // has left the enumerators first.
            try {
                const mw: any = Zotero.getMainWindows()[0];
                if (mw) mw.setTimeout(() => {
                    try {
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (lp) lp._wvTabsMenuRefreshOpenPanel();
                    } catch (e2) {}
                }, 300);
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvSaveAndCloseWindow err: " + e); }
    }

    /** Reopen a saved window (and unpark it). Mains ride the managed
     *  spawn queue — the same path that restores dev windows at startup;
     *  readers seed from the first reader tab and lazy-add the rest,
     *  like the fast window conversion. */
    async _wvSavedWindowReopen(id: any) {
        try {
            await this._wvSavedWindowsInit();
            const p: any = this as any;
            const entry = this._wvSavedWindowsList().find((x: any) => x && x.id === id);
            if (!entry) return;
            p._wvSavedWinDoc.windows = this._wvSavedWindowsList().filter((x: any) => x.id !== id);
            this._wvSavedWindowsPersist();
            const sleep = (ms: number) => (Zotero as any).Promise.delay(ms);
            if (entry.kind === "main") {
                const before = new Set(Zotero.getMainWindows() || []);
                p._wvDevSpawnQueue = p._wvDevSpawnQueue || [];
                p._wvDevSpawnQueue.push({ kind: "main-dev", tabs: entry.tabs,
                    geom: entry.geom, wvMainState: entry.wvMainState, wvWinId: null });
                p._wvPendingDevWindow = true;
                try { (Zotero as any).openMainWindow(); }
                catch (e) { p._wvPendingDevWindow = false; return; }
                if (entry.glyph == null && !entry.named) return;
                const t0 = Date.now();
                let newMain: any = null;
                while (Date.now() - t0 < 12000) {
                    newMain = (Zotero.getMainWindows() || []).find((w: any) => !before.has(w));
                    if (newMain && (newMain as any)._wvManagedWindow) break;
                    newMain = null;
                    await sleep(150);
                }
                if (newMain && entry.glyph != null && !this._wvIsAnchorWindow(newMain)) {
                    this._wvStampGlyphIdx(newMain, entry.glyph);   // skip on colour collision
                    await sleep(600);
                    try { (this as any)._wvCarryGlyphRefresh(newMain, false); } catch (e) {}
                }
                // A user-chosen name (Rename Saved Window…) carries onto the
                // reopened window as its custom title.
                if (newMain && entry.named && entry.name) {
                    try { (this as any)._wvWindowSetCustomTitle(newMain, entry.name); } catch (e) {}
                }
                return;
            }
            // Reader window: seed with the first reader tab.
            const seed = (entry.tabs || []).find((t: any) => !t.isNote && t.itemID != null);
            if (!seed) {
                const mw: any = Zotero.getMainWindow();
                Services.prompt.alert(mw as any, "Weavero",
                    "This saved window holds only notes — a reader window needs at least one document tab.");
                return;
            }
            const rd: any = await (Zotero.Reader as any).open(seed.itemID, null,
                { openInWindow: true, allowDuplicate: true });
            const t1 = Date.now();
            while (rd && Date.now() - t1 < 8000
                && !(rd._window && rd._iframe && rd._iframe.contentWindow)) { await sleep(120); }
            const newWin: any = rd && rd._window;
            if (!newWin) return;
            if (entry.glyph != null) { try { this._wvStampGlyphIdx(newWin, entry.glyph); } catch (e) {} }   // skip on colour collision
            const t2 = Date.now();
            while (!(newWin as any)._wvWT && Date.now() - t2 < 4000) { await sleep(80); }
            for (const m of (entry.tabs || [])) {
                if (m === seed || m.itemID == null) continue;
                try {
                    if (m.isNote) { (this as any)._wvWTMountTab(newWin, m.itemID, { allowDuplicate: true, select: false }); }
                    else { (this as any)._wvWTAddLazyReaderTab(newWin, m.itemID, m.title); }
                } catch (e) {}
            }
            try {
                const g = entry.geom;
                if (g && g.st === 1) { newWin.moveTo(g.x + 40, g.y + 40); await sleep(150); newWin.maximize(); }
                else if (g) {
                    if (newWin.windowState === 1 && newWin.restore) { newWin.restore(); await sleep(200); }
                    newWin.moveTo(g.x, g.y);
                    newWin.resizeTo(g.w, g.h);
                }
            } catch (e) {}
            if (entry.glyph != null) { try { (this as any)._wvCarryGlyphRefresh(newWin, true); } catch (e) {} }
            // Carry a user-chosen name (Rename Saved Window…) onto the window.
            if (entry.named && entry.name) {
                try { (this as any)._wvWindowSetCustomTitle(newWin, entry.name); } catch (e) {}
            }
            try { newWin.focus(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvSavedWindowReopen err: " + e); }
    }

    async _wvSavedWindowDelete(id: any) {
        try {
            await this._wvSavedWindowsInit();
            const p: any = this as any;
            p._wvSavedWinDoc.windows = this._wvSavedWindowsList().filter((x: any) => x.id !== id);
            this._wvSavedWindowsPersist();
        } catch (e) {}
    }

    /** Rename a PARKED saved window (List-all-tabs right-click). Same
     *  prompt-style dialog as live windows, colour swatches included (they
     *  edit the stored glyph). `named: true` marks a user-chosen name so
     *  reopen knows to carry it onto the new window as a custom title —
     *  a name merely inherited at save time stays subject to renumbering. */
    async _wvSavedWindowPromptRename(parentWin: any, id: any) {
        try {
            await this._wvSavedWindowsInit();
            const entry: any = this._wvSavedWindowsList().find((x: any) => x && x.id === id);
            if (!entry || !parentWin) return;
            const isReader = entry.kind === "reader";
            const curIdx = entry.glyph != null ? entry.glyph % WV_WIN_BADGE_COLORS.length : -1;
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            this._wvShowRenameDialog(parentWin, {
                title: "Rename Saved Window",
                name: entry.name || "",
                placeholder: isReader ? "Reader Window" : "Window",
                swatches: WV_WIN_BADGE_COLORS.map((hex: string, i: number) => ({
                    hex, selected: i === curIdx, radius: isReader ? "50%" : "3px",
                })),
                onAccept: ({ name, swatchIndex }: any) => {
                    try {
                        const p: any = live();
                        if (!p) return;
                        if (name && name !== entry.name) { entry.name = name; entry.named = true; }
                        if (swatchIndex != null && swatchIndex !== curIdx) entry.glyph = swatchIndex;   // manual pick — verbatim
                        p._wvSavedWindowsPersist();
                        p._wvTabsMenuRefreshOpenPanel();
                    } catch (e) {}
                },
            });
        } catch (e) { Zotero.debug("[Weavero] _wvSavedWindowPromptRename err: " + e); }
    }

    /** Move a LIVE window into another session AS A LIVE WINDOW (user
     *  semantics 2026-07-15: a moved window keeps its state — an active
     *  window stays active in the target, so it opens with the session
     *  on the next switch). Captures the window in session-topology
     *  shape (sessions.ts doc comment), appends it to the target
     *  session's `windows`, then closes the window. Parked windows
     *  move via _wvSavedWindowMoveToSession instead. */
    async _wvMoveWindowToSession(win: any, isReader: boolean, sessionId: any) {
        try {
            await (this as any)._wvTabSessionInit();
            const sess = ((this as any)._wvTabSessionList() || [])
                .find((s: any) => s && s.id === sessionId);
            if (!sess) return;
            let entry: any = null;
            if (isReader) {
                entry = (this as any)._wvTabSessionCaptureReaderWindow(win);
                if (!entry || !entry.tabs.length) {
                    Services.prompt.alert(win, "Weavero", "This window has no tabs to move.");
                    return;
                }
            } else {
                if ((Zotero.getMainWindows() || []).length < 2) {
                    Services.prompt.alert(win, "Weavero",
                        "This is the last main window — it can't be moved to another session.");
                    return;
                }
                const Z: any = win.Zotero_Tabs;
                let selID: any = null;
                try { selID = Z.selectedID; } catch (e) {}
                const tabs: any[] = [];
                for (const t of ((Z && Z._tabs) || [])) {
                    const rec = (this as any)._wvTabSessionRecordFromMainTab(t, selID);
                    if (rec) tabs.push(rec);
                }
                if (!tabs.length) {
                    Services.prompt.alert(win, "Weavero", "This window has no document tabs to move.");
                    return;
                }
                let geom: any = null;
                try { geom = (this as any)._wvWindowGeom(win); } catch (e) {}
                entry = { kind: "main", tabs, geom, ...((this as any)._wvTabSessionCaptureMainState(win) || {}) };
            }
            sess.windows = Array.isArray(sess.windows) ? sess.windows : [];
            sess.windows.push(entry);
            sess.modified = Date.now();
            await (this as any)._wvTabSessionPersist();
            try { win.close(); } catch (e) {}
            this._wvTabsMenuRefreshOpenPanel();
        } catch (e) { Zotero.debug("[Weavero] _wvMoveWindowToSession err: " + e); }
    }

    /** Re-file a PARKED (saved) window under another session — it stays
     *  parked there (state-preserving move, user semantics 2026-07-15).
     *  Works in any direction, including into the active session. */
    async _wvSavedWindowMoveToSession(savedId: any, sessionId: any) {
        try {
            await this._wvSavedWindowsInit();
            const e = this._wvSavedWindowsList().find((x: any) => x && x.id === savedId);
            if (!e) return;
            e.sessionId = sessionId;
            this._wvSavedWindowsPersist();
            this._wvTabsMenuRefreshOpenPanel();
        } catch (e2) {}
    }

    /** Re-render the List-all-tabs panel wherever it's open — actions
     *  that change the session/saved-window stores (moves between
     *  sessions, etc.) would otherwise leave an open panel stale (user
     *  report 2026-07-15: a moved window seemed to vanish). */
    _wvTabsMenuRefreshOpenPanel() {
        try {
            for (const w of (Zotero.getMainWindows() || [])) {
                try {
                    const panel: any = w.document && w.document.getElementById("zotero-tabs-menu-panel");
                    if (!panel || (panel.state !== "open" && panel.state !== "showing")) continue;
                    if (typeof panel.refreshList === "function") panel.refreshList();
                    else this._wvRegroupTabsMenu(panel);
                } catch (e) {}
            }
        } catch (e) {}
    }

    /** Section descriptors for the saved windows belonging to `sessionId`
     *  (null = the unnamed/current scope; pre-tagging entries count as
     *  current). Same tab shape the saved-session renderer synthesizes,
     *  so the shared window-box renderer draws saved windows exactly
     *  like the active ones. */
    _wvSavedWindowsSections(sessionId: any) {
        const sections: any[] = [];
        try {
            const entries = this._wvSavedWindowsList()
                .filter((e: any) => (e.sessionId || null) === (sessionId || null));
            for (const e of entries) {
                const tabs: any[] = [];
                for (const r of (e.tabs || [])) {
                    const isMainRec = e.kind === "main";
                    if (isMainRec && r.type === "library") continue;
                    const iid = isMainRec ? (r && r.data && r.data.itemID) : r.itemID;
                    if (iid == null) continue;
                    const item = Zotero.Items.get(iid);
                    if (!item) continue;
                    const isNote = isMainRec ? String(r.type || "").indexOf("note") === 0 : !!r.isNote;
                    const rec = r;
                    const entryId = e.id;
                    tabs.push({
                        item,
                        title: r.title || (item as any).getDisplayTitle(),
                        // Additive single-document open, like the session tab
                        // rows — the saved window itself stays parked.
                        onClick: () => {
                            try {
                                if (isNote) {
                                    const mw: any = Zotero.getMainWindow();
                                    if (mw && mw.ZoteroPane) mw.ZoteroPane.openNote(iid, { openInWindow: false });
                                } else {
                                    (Zotero.Reader as any).open(iid, null, { openInWindow: false, allowDuplicate: true });
                                }
                            } catch (er) {}
                        },
                        // ✕ removes the tab from the SAVED entry (user request
                        // 2026-07-16) — same affordance as closing a live tab.
                        // Removing the last document tab deletes the whole
                        // saved window (nothing left to reopen).
                        onClose: () => {
                            try {
                                const p0: any = this as any;
                                const entry2 = this._wvSavedWindowsList().find((x: any) => x && x.id === entryId);
                                if (!entry2) return;
                                entry2.tabs = (entry2.tabs || []).filter((r2: any) => r2 !== rec);
                                entry2.count = (entry2.tabs || []).filter((r2: any) =>
                                    entry2.kind === "main" ? (r2 && r2.type !== "library") : true).length;
                                if (!entry2.count) {
                                    p0._wvSavedWinDoc.windows =
                                        this._wvSavedWindowsList().filter((x: any) => x.id !== entryId);
                                }
                                this._wvSavedWindowsPersist();
                                this._wvTabsMenuRefreshOpenPanel();
                            } catch (er) {}
                        },
                    });
                }
                if (!tabs.length) continue;
                let libraryTab: any = null;
                if (e.kind === "main") {
                    libraryTab = {
                        title: "My Library",
                        iconFullClass: "icon icon-css icon-library tab-icon",
                        onClick: () => {
                            try {
                                const mw: any = Zotero.getMainWindows()[0];
                                if (mw) { mw.focus(); mw.Zotero_Tabs.select("zotero-pane"); }
                            } catch (er) {}
                        },
                    };
                }
                sections.push({
                    label: e.name, libraryTab, tabs,
                    kind: e.kind === "reader" ? "reader" : "main",
                    savedId: e.id,
                });
            }
        } catch (er) {}
        return sections;
    }

    _wvEnsureSavedWindowStyles(doc: any) {
        try {
            if (doc.getElementById("wv-savedwin-styles")) return;
            const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
            style.id = "wv-savedwin-styles";
            style.textContent = [
                /* Parked look — present but visibly not live. */
                ".wv-savedwin-scope { opacity: 0.72; }",
                ".wv-savedwin-scope:hover { opacity: 1; }",
                /* Section header separating parked windows from the live
                   ones — IDENTICAL to the Tab Groups header
                   (.wv-tgmenu-header in tab-groups.ts). Change BOTH
                   together. */
                ".wv-savedwin-sechdr {",
                "  margin: 6px 4px 2px; padding: 4px 0 0;",
                "  border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);",
                "  font-size: 0.85em; font-weight: 600; opacity: 0.65;",
                "  text-align: start;",
                "}",
                /* The header's reopen affordance. */
                ".wv-savedwin-reopen {",
                "  margin-inline-start: 6px; cursor: pointer; opacity: 0.7;",
                "  padding: 0 4px; user-select: none;",
                "}",
                ".wv-savedwin-reopen:hover { opacity: 1; }",
                /* Row ✕ (remove a tab from a saved window) — hover-revealed,
                   like the live rows' close button. */
                ".wv-row-close {",
                "  flex: 0 0 auto; margin-inline-start: 4px; padding: 0 5px;",
                "  opacity: 0; cursor: pointer; user-select: none; font-size: 11px;",
                "}",
                ".row:hover > .wv-row-close { opacity: 0.6; }",
                ".wv-row-close:hover { opacity: 1 !important; }",
            ].join("\n");
            (doc.head || doc.documentElement).appendChild(style);
        } catch (e) {}
    }

    /** Render the saved-window boxes for `sessionId` into `container` —
     *  the shared renderer the live windows use, plus the parked look,
     *  a ↗ reopen button and a Reopen / Delete context menu. */
    _wvSavedWindowsRenderInto(doc: any, container: any, panel: any, sessionId: any, keyPrefix: string) {
        try {
            const sections = this._wvSavedWindowsSections(sessionId);
            if (!sections.length) return;
            this._wvEnsureSavedWindowStyles(doc);
            // A separate, labelled section — parked windows must not read
            // as part of the active-windows list (user request 2026-07-15).
            const sechdr = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            sechdr.className = "wv-savedwin-sechdr";
            sechdr.textContent = "Saved Windows";
            container.appendChild(sechdr);
            const already = container.querySelectorAll(".wv-savedwin-scope").length;
            // Collapsed by default (user request 2026-07-15): seed each
            // box's collapse key ONCE per session, so the twisty still
            // expands it and that choice sticks across panel opens.
            const kp = "savedwin|" + keyPrefix + "|" + (sessionId || "cur");
            {
                const p: any = this as any;
                p._wvSavedWinSeeded = p._wvSavedWinSeeded || new Set();
                p._wvTabsMenuCollapsedWindows = p._wvTabsMenuCollapsedWindows || new Set();
                for (const sec of sections) {
                    const key = kp + "|" + sec.label;
                    if (!p._wvSavedWinSeeded.has(key)) {
                        p._wvSavedWinSeeded.add(key);
                        p._wvTabsMenuCollapsedWindows.add(key);
                    }
                }
            }
            this._wvTabsMenuRenderSections(doc, container, panel, sections,
                { header: "wv-savedwin-winhdr", row: "wv-savedwin-tabrow", lib: "wv-savedwin-liblbl", scope: "wv-savedwin-scope" },
                kp);
            const scopes = [...container.querySelectorAll(".wv-savedwin-scope")].slice(already);
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const refresh = () => {
                try {
                    if (typeof (panel as any).refreshList === "function") (panel as any).refreshList();
                    else { const lp: any = live(); if (lp) lp._wvRegroupTabsMenu(panel); }
                } catch (er) {}
            };
            scopes.forEach((scope: any, i: number) => {
                const sec: any = sections[i];
                if (!sec) return;
                const hdr = scope.querySelector(".wv-savedwin-winhdr");
                if (!hdr) return;
                const btn = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
                btn.className = "wv-savedwin-reopen";
                btn.textContent = "↗";
                btn.setAttribute("title", "Reopen this saved window");
                btn.addEventListener("click", (ev: any) => {
                    try {
                        ev.stopPropagation(); ev.preventDefault();
                        const lp: any = live();
                        if (!lp) return;
                        try { (panel as any).hidePopup && (panel as any).hidePopup(); } catch (er) {}
                        lp._wvSavedWindowReopen(sec.savedId);
                    } catch (er) {}
                });
                hdr.appendChild(btn);
                hdr.addEventListener("contextmenu", (ev: any) => {
                    try {
                        ev.preventDefault(); ev.stopPropagation();
                        const lp: any = live();
                        if (!lp) return;
                        let pop: any = doc.getElementById("wv-savedwin-context");
                        if (pop) pop.remove();
                        pop = doc.createXULElement("menupopup");
                        pop.id = "wv-savedwin-context";
                        const mk = (lbl: string, fn: any) => {
                            const mi = doc.createXULElement("menuitem");
                            mi.setAttribute("label", lbl);
                            mi.addEventListener("command", () => { try { fn(); } catch (er2) {} });
                            pop.appendChild(mi);
                        };
                        mk("Rename Window…", () => {
                            try { lp._wvSavedWindowPromptRename(doc.defaultView, sec.savedId); } catch (er2) {}
                        });
                        mk("Reopen Window", () => {
                            try { (panel as any).hidePopup && (panel as any).hidePopup(); } catch (er2) {}
                            lp._wvSavedWindowReopen(sec.savedId);
                        });
                        // Move Window to ▸ — re-file this PARKED window
                        // under another session; it stays parked there
                        // (state-preserving move, user semantics
                        // 2026-07-15). Any direction: other sessions AND
                        // the active one.
                        try {
                            const ownerId = sessionId || null;
                            const named = (lp._wvTabSessionNamedList ? lp._wvTabSessionNamedList() : [])
                                .filter((s: any) => s && (s.id || null) !== ownerId);
                            if (named.length) {
                                const mv = doc.createXULElement("menu");
                                mv.setAttribute("label", "Move Window to");
                                const mvPop = doc.createXULElement("menupopup");
                                for (const s of named) {
                                    const mi = doc.createXULElement("menuitem");
                                    mi.setAttribute("label", s.name || "Session");
                                    const sid = s.id;
                                    mi.addEventListener("command", () => {
                                        try { lp._wvSavedWindowMoveToSession(sec.savedId, sid); } catch (er2) {}
                                    });
                                    mvPop.appendChild(mi);
                                }
                                mv.appendChild(mvPop);
                                pop.appendChild(mv);
                            }
                        } catch (er2) {}
                        mk("Delete Saved Window", async () => {
                            await lp._wvSavedWindowDelete(sec.savedId);
                            refresh();
                        });
                        (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
                        pop.openPopupAtScreen(ev.screenX, ev.screenY, true);
                    } catch (er) {}
                });
            });
        } catch (e) { Zotero.debug("[Weavero] _wvSavedWindowsRenderInto err: " + e); }
    }

    /** Current-session saved windows — rendered INSIDE the current-session
     *  scope, right after the live window boxes, so parked windows read as
     *  part of the session they belong to. Saved windows of OTHER sessions
     *  render inside their session's box (hook in
     *  _wvTabSessionRenderTabRows). */
    _wvSavedWindowsMenuSection(panel: any) {
        try {
            // Normally loaded eagerly at startup; when the FIRST open
            // still catches the store mid-load, re-render this section
            // once the entries land (the panel refresh path is
            // idempotent, and the user sees the section pop in).
            const p0: any = this as any;
            if (!p0._wvSavedWinDoc) {
                this._wvSavedWindowsInit().then(() => {
                    try {
                        if (this._wvSavedWindowsList().length) this._wvSavedWindowsMenuSection(panel);
                    } catch (e) {}
                });
            }
            const doc = panel.ownerDocument;
            const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list") || panel.querySelector("#wv-wtl-list");
            if (!list) return;
            for (const el of list.querySelectorAll(".wv-savedwin-holder, .wv-savedwin-header, .wv-savedwin-row")) el.remove();
            const activeId = (this as any)._wvTabSessionGetActiveId
                ? (this as any)._wvTabSessionGetActiveId() : null;
            // One-time adoption: entries saved before session tagging (no
            // sessionId KEY, as opposed to an explicit null) join the
            // session that's active when they're first rendered — else a
            // pre-tagging save would silently vanish while a session is on.
            try {
                let migrated = false;
                for (const e of this._wvSavedWindowsList()) {
                    if (!("sessionId" in e)) { (e as any).sessionId = activeId; migrated = true; }
                }
                if (migrated) this._wvSavedWindowsPersist();
            } catch (e) {}
            const body = list.querySelector(".wv-cursess-scope > .wv-sess-body");
            const container = body || list;
            const holder = doc.createElement("div");
            holder.className = "wv-savedwin-holder";
            // A separate section at the END of the session block — after the
            // active windows and the tab-groups section, never among them.
            container.appendChild(holder);
            this._wvSavedWindowsRenderInto(doc, holder, panel, activeId, "cur");
            if (!holder.children.length) holder.remove();
        } catch (e) { Zotero.debug("[Weavero] _wvSavedWindowsMenuSection err: " + e); }
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

    // ---- Disable→enable WINDOW round-trip -----------------------------------
    // On plugin DISABLE/UNINSTALL, extra windows can't be left open safely:
    // secondary main windows don't survive a restart-while-disabled (verified
    // upstream: Session.save captures every pane but the startup restore reads
    // only the FIRST), and reader windows' content is Weavero-only. So disable
    // SAVES everything into the frozen window store, CLOSES every window
    // except the anchor, and writes a marker; the next enable restores them
    // all from the store through the same machinery the startup restore uses.

    _wvDisableCloseMarkerPath() {
        return PathUtils.join(PathUtils.join(Zotero.DataDirectory.dir, "weavero"), "disable-closed.json");
    }

    /** DISABLE path: close every reader window and every managed main window
     *  (the untagged anchor stays). Runs AFTER destroy's final store capture +
     *  freeze, so the closes cannot clobber the snapshot. Reader-window closes
     *  park the groups homed there — recorded in the marker so enable un-parks
     *  exactly those (they'll be live again once their windows restore). */
    _wvDisableCloseExtraWindows() {
        try {
            // Which groups are LIVE right now (pre-close)?
            const liveGroups: any[] = [];
            try { for (const g of this._tabGroupsGet()) { if (!(g as any).saved) liveGroups.push(g.id); } } catch (e) {}
            // DEFERRED close: `AddonManager.reload()` (every dev install) fires
            // shutdown with ADDON_DISABLE — indistinguishable from a real user
            // disable at this point. Closing immediately made every reload
            // close + slowly re-restore all extra windows (user-visible churn,
            // windows "appearing very late"). So wait a beat and only close if
            // the plugin did NOT come back — a reload re-attaches
            // Zotero.Weavero.plugin within milliseconds.
            const mainWin: any = Zotero.getMainWindow();
            const setT = (mainWin && mainWin.setTimeout) ? mainWin.setTimeout.bind(mainWin) : setTimeout;
            const markerPath = this._wvDisableCloseMarkerPath();
            setT(() => {
                try {
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (live) return;   // reload, not a disable — keep the windows
                    let closedReaders = 0, closedMains = 0;
                    try {
                        const rws: any[] = [];
                        const en = Services.wm.getEnumerator("zotero:reader");
                        while (en.hasMoreElements()) rws.push(en.getNext());
                        for (const w of rws) { try { w.close(); closedReaders++; } catch (e) {} }
                    } catch (e) {}
                    try {
                        const mains = Zotero.getMainWindows ? Zotero.getMainWindows() : [];
                        for (const w of mains) {
                            if (w && (w as any)._wvManagedWindow) { try { w.close(); closedMains++; } catch (e) {} }
                        }
                    } catch (e) {}
                    try {
                        IOUtils.writeUTF8(markerPath, JSON.stringify({ version: 1, closedReaders, closedMains, unpark: liveGroups }), { tmpPath: markerPath + ".tmp" });
                    } catch (e) {}
                    Zotero.debug("[Weavero] disable-close: " + closedReaders + " reader + " + closedMains + " managed main window(s) saved+closed");
                } catch (e) { Zotero.debug("[Weavero] disable-close deferred err: " + e); }
            }, 1500);
        } catch (e) { Zotero.debug("[Weavero] _wvDisableCloseExtraWindows err: " + e); }
    }

    /** ENABLE path: consume the disable-close marker and restore the closed
     *  windows from the (still-frozen-at-disable) store. The restore entry
     *  points carry once-guards, so racing the normal startup restore is a
     *  no-op; a mid-session enable is where this actually fires. */
    async _wvEnableRestoreClosedWindows() {
        try {
            const path = this._wvDisableCloseMarkerPath();
            let marker: any = null;
            try { marker = JSON.parse(await IOUtils.readUTF8(path)); } catch (e) { return; }   // no marker → nothing to do
            try { await IOUtils.remove(path); } catch (e) {}
            if (!marker) return;
            // Un-park the groups that the reader-window closes parked at
            // disable-time — their windows are about to come back.
            try {
                const unpark = new Set(marker.unpark || []);
                if (unpark.size) {
                    const groups = this._tabGroupsGet();
                    let dirty = false;
                    for (const g of groups) { if (unpark.has(g.id) && (g as any).saved) { delete (g as any).saved; dirty = true; } }
                    if (dirty) this._tabGroupsSet(groups);
                }
            } catch (e) {}
            const self = this;
            // BACKGROUND assembly, same as the startup restore: re-opened
            // windows go to the z-order bottom and focus snaps back to the
            // window the user is in right now (no restore guard mid-session
            // -> time-based hold). Also: the old fixed 1.5 s pre-restore
            // dead-wait is down to 400 ms - the once-guards on the restore
            // entry points are the real safety, not the delay.
            try {
                let cur: any = null;
                try {
                    const fw: any = Services.focus.activeWindow;
                    const t = fw && fw.document && fw.document.documentElement
                        && fw.document.documentElement.getAttribute("windowtype");
                    if (t === "navigator:browser" || t === "zotero:reader") cur = fw;
                } catch (e) {}
                this._wvBgRestoreStart({ targetWin: cur || Zotero.getMainWindow(), holdMs: 25000 });
            } catch (e) {}
            setTimeout(() => {
                try { (self as any)._wvWindowStoreRestoreDevWindows(); } catch (e) {}
                try { (self as any)._wvWindowStoreRestoreOrphanReaderWindows(); } catch (e) {}
            }, 400);
            Zotero.debug("[Weavero] enable-restore: marker consumed (" + (marker.closedReaders || 0) + " reader / " + (marker.closedMains || 0) + " main to restore)");
        } catch (e) { Zotero.debug("[Weavero] _wvEnableRestoreClosedWindows err: " + e); }
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

    /** Enforce the anchor's selection from the store's quit capture (the
     *  truth frozen at quit-REQUEST, before teardown churn poisons
     *  session.json's per-tab flags). Called EARLY — right after the boot
     *  store loads — to kill the visible flash of the wrong tab Zotero's
     *  native restore selects, and again from the reconcile as a backstop
     *  (the captured tab may only exist after the repair re-adds it). */
    _wvEnforceAnchorSelectionFromStore(tag: string) {
        try {
            const doc0: any = (this as any)._wvBootWindowStoreDoc;
            const entry = doc0 && (doc0.windows || []).find((x: any) => x && x.kind === "main-anchor");
            const selSt = entry && (entry.tabs || []).find((t: any) => t && t.selected);
            if (!selSt) return;
            const anchor: any = (Zotero.getMainWindows() || []).find((w: any) => !w._wvManagedWindow);
            const Z = anchor && anchor.Zotero_Tabs;
            if (!Z) return;
            let wantID: any = null;
            const sBase = String(selSt.type || "").replace(/-(unloaded|loading)$/, "");
            if (sBase === "library" || selSt.id === "zotero-pane") wantID = "zotero-pane";
            else {
                const iid = selSt.data && selSt.data.itemID;
                const t = iid != null && Z._tabs.find((x: any) => x.data && x.data.itemID === iid);
                if (t) wantID = t.id;
            }
            if (wantID && Z.selectedID !== wantID) {
                Z.select(wantID);
                (this as any)._wvTrace("anchor selection enforced from the quit capture ("
                    + tag + ", " + (wantID === "zotero-pane" ? "library" : wantID) + ")");
            }
        } catch (e) {}
    }

    /** Short boot-time selection GUARD: between the store load and the
     *  reconcile, other plugins churn the anchor's tabs — Better Notes
     *  closes every note tab and reopens it through Zotero.Notes.open,
     *  whose reopen SELECTS, flashing a note tab for 1-2 s before the
     *  reconcile corrected it (2026-07-04). Re-assert the captured
     *  selection every 250 ms until the reconcile has run (15 s cap).
     *  User clicks in this window are overridden — but the window is the
     *  first ~3 s of boot, where clicks are vanishingly unlikely. */
    _wvBootSelectionGuardStart() {
        try {
            if ((this as any)._wvBootSelGuardOn) return;
            (this as any)._wvBootSelGuardOn = true;
            const w0: any = Zotero.getMainWindow();
            const setT = (w0 && w0.setTimeout) ? w0.setTimeout.bind(w0) : setTimeout;
            let ticks = 0;
            const tick = () => {
                ticks++;
                if ((this as any)._wvAnchorReconciled || ticks > 60 || (this as any)._wvDestroyed) {
                    (this as any)._wvBootSelGuardOn = false;
                    return;
                }
                try { this._wvEnforceAnchorSelectionFromStore("guard"); } catch (e) {}
                setT(tick, 250);
            };
            setT(tick, 250);
        } catch (e) {}
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
                    // NEVER select on re-add: session.json's per-tab `selected`
                    // flag is written by Zotero's quit save, which can run AFTER
                    // the teardown's tab closes re-selected a neighbor — honoring
                    // it kept booting the anchor onto a note tab the user wasn't
                    // on ("restart from the library tab ends on a note tab",
                    // 2026-07-04). Selection is enforced below from Weavero's
                    // OWN store, captured atomically at quit-request.
                    Z.add({ type: base + "-unloaded", title: st.title || "", index: Math.min(i, Z._tabs.length), data: st.data, select: false });
                    live.add(iid);
                    added++;
                    (this as any)._wvTrace("reconcile: re-added dropped " + base + " tab (item " + iid + ") at index " + i);
                } catch (e) {}
            }
            (this as any)._wvTrace(added
                ? ("reconcile: restored " + added + " tab(s) the native anchor restore dropped")
                : "reconcile: anchor matches the saved session");
            // SELECTION truth: the store's quit capture — enforced again here
            // as backstop (the captured tab may be one this repair just
            // re-added; the EARLY call at store-load already killed the
            // visible flash for tabs native restore kept).
            try { this._wvEnforceAnchorSelectionFromStore("reconcile"); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvReconcileAnchorSessionTabs err: " + e); }
    }

    /** Hide the title-bar row BEFORE first paint when the compact-title-bar
     *  feature is on — otherwise every restored window flashes the full title
     *  bar/menubar until the (late) compact setup collapses it. Injects only
     *  the hiding CSS + attribute; the full setup (button-box moves, Alt
     *  wiring) still runs later and is idempotent about these. */
    _wvEarlyHideTitleBar(w: any) {
        try {
            // macOS uses the native global menu bar / traffic-light controls,
            // so the compact-title-bar feature is Windows/Linux only —
            // `_applyCompactTitleBar` bails on `isMac`. This early-paint hider
            // must match, or it injects the title-bar-collapse CSS on macOS
            // that the (skipped) full setup never reconciles.
            if ((Zotero as any).isMac) return;
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
                    ? (this as any)._wvIsAnchorWindow(w)
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
                        Z.add({ type: base + "-unloaded", title: st.title || "", index: Math.min(i, Z._tabs.length), data: st.data, select: false });
                        live.add(iid);
                        added++;
                        (this as any)._wvTrace("reconcile: re-added dropped " + base + " tab (item " + iid + ") in managed window");
                    } catch (e) {}
                }
                if (added) {
                    try { (this as any)._wvTabGroupStabilize(win); (this as any)._applyTabGroups(win); } catch (e) {}
                }
                // SELECTION: enforce the store's captured flag AFTER other
                // plugins' window-load churn — Better Notes reopens note tabs
                // through Zotero.Notes.open, and the reopen SELECTS, leaving a
                // background window sitting on a random note tab (2026-07-04).
                // Background semantics preserved: an item selection re-arms
                // the deferred activate-time select behind the library
                // placeholder instead of loading content now.
                try {
                    const selSt = (entry.tabs || []).find((t: any) => t && t.selected);
                    if (selSt) {
                        const sBase = String(selSt.type || "").replace(/-(unloaded|loading)$/, "");
                        const wantIID = (sBase === "library") ? null : (selSt.data && selSt.data.itemID);
                        const curSel = Z._tabs.find((x: any) => x.id === Z.selectedID);
                        const curIID = curSel && curSel.data && curSel.data.itemID;
                        if (wantIID == null) {
                            if (Z.selectedID !== "zotero-pane") {
                                Z.select("zotero-pane");
                                (this as any)._wvTrace("reconcile: " + entry.kind + " selection enforced (library)");
                            }
                        } else if (curIID !== wantIID) {
                            // The FOCUSED window selects now (its activate event
                            // may never re-fire); background windows defer.
                            let focusedHere = false;
                            try { focusedHere = Services.focus.activeWindow === win; } catch (e) {}
                            const t2 = Z._tabs.find((x: any) => x.data && x.data.itemID === wantIID);
                            if (focusedHere && t2) {
                                Z.select(t2.id);
                                (this as any)._wvTrace("reconcile: " + entry.kind + " selection enforced (item " + wantIID + ")");
                            } else {
                                if (Z.selectedID !== "zotero-pane") Z.select("zotero-pane");
                                (this as any)._wvDeferSelect(win, wantIID);
                                (this as any)._wvTrace("reconcile: " + entry.kind + " selection re-deferred to item " + wantIID);
                            }
                        }
                    }
                } catch (e) {}
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
            if (!Z) return;
            // REWIRE on every call: a plugin reload must REPLACE the previous
            // wrappers, not skip ("already wired") — a skipped rewire leaves
            // wrappers whose closures capture a DEAD instance, and their side
            // effects (note re-process, watchdog, title heal) kept firing
            // after plugin disable (observed: note editors re-wired from dead
            // code when a note tab loaded post-disable, 2026-07-03). Peel the
            // previous wrappers via their stored originals first. Legacy
            // wrappers (no stored originals) can't be peeled — we wrap over
            // them; a restart flushes them.
            try {
                if (Z._wvOrigRestoreState) { Z.restoreState = Z._wvOrigRestoreState; }
                if (Z._wvOrigClose) { Z.close = Z._wvOrigClose; }
                if (Z._wvOrigMarkAsLoaded) { Z.markAsLoaded = Z._wvOrigMarkAsLoaded; }
                if (Z._wvOrigSelect) { Z.select = Z._wvOrigSelect; }
            } catch (e) {}
            Z._wvRestoreTraceWired = true;
            // Resolve the LIVE plugin at CALL time — never the wiring-time
            // `this` (stale after every reload; still runs after disable).
            const LP = (): any => { try { const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin; return (p && !p._wvDestroyed) ? p : null; } catch (e) { return null; } };
            const name = () => { try { const p = LP(); return p ? p._wvWindowName(win) : "?"; } catch (e) { return "?"; } };
            const trace = (m: string) => { try { const p = LP(); if (p) p._wvTrace(m); } catch (e) {} };
            Z._wvOrigRestoreState = Z.restoreState;
            const origRestore = Z.restoreState.bind(Z);
            Z.restoreState = async function (tabs: any) {
                if (!LP()) return origRestore(tabs);   // plugin gone — pure native
                try { trace("restoreState[" + name() + "] IN: " + (tabs || []).map((t: any) => t.type + (t.selected ? "*" : "")).join(",")); } catch (e) {}
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
                        catch (e) { failed.push(tabs[i]); trace("restoreState[" + name() + "] tab " + i + " (" + (tabs[i] && tabs[i].type) + ") failed: " + e); }
                    }
                    if (failed.length) {
                        await new Promise((res) => { try { win.setTimeout(res, 1500); } catch (e) { res(null); } });
                        for (const tab of failed) {
                            try {
                                // Force-load the item into the cache first — the usual
                                // failure is a too-early Zotero.Items.exists() miss.
                                try { if (tab.data && tab.data.itemID) await Zotero.Items.getAsync(tab.data.itemID); } catch (e2) {}
                                await runOne(tab, Z._tabs.length);
                                trace("restoreState[" + name() + "] retry OK: " + tab.type);
                            }
                            catch (e) { trace("restoreState[" + name() + "] retry FAILED (" + tab.type + "): " + e); }
                        }
                    }
                    Z._prevSelectedID = null;
                    try {
                        const items = await Zotero.Items.getAsync(itemIDs.filter((x: any) => x));
                        await Zotero.Items.loadDataTypes(items);
                    } catch (e) {}
                    try { trace("restoreState[" + name() + "] OUT: " + Z._tabs.map((t: any) => t.type).join(",")); } catch (e) {}
                    return;
                }
                let r;
                try { r = await origRestore(tabs); }
                catch (e) { trace("restoreState[" + name() + "] THREW: " + e); throw e; }
                try { trace("restoreState[" + name() + "] OUT: " + Z._tabs.map((t: any) => t.type).join(",")); } catch (e) {}
                return r;
            };
            const wiredAt = Date.now();
            Z._wvOrigClose = Z.close;
            const origClose = Z.close.bind(Z);
            Z.close = function (ids: any) {
                try {
                    if (LP() && Date.now() - wiredAt < 90000) {
                        const stack = String(new Error().stack || "").split("\n").slice(1, 4).join(" <- ");
                        trace("close[" + name() + "]: " + JSON.stringify(ids) + " via " + stack);
                    }
                } catch (e) {}
                return origClose(ids);
            };
            // Tab CONTENT loads (the slow phase, distinct from structure
            // restore): markAsLoaded fires when a lazy tab's load hook
            // resolves — trace each so the timeline separates "windows +
            // groups present" from "tab content loaded".
            if (typeof Z.markAsLoaded === "function") {
                Z._wvOrigMarkAsLoaded = Z.markAsLoaded;
                const origMark = Z.markAsLoaded.bind(Z);
                Z.markAsLoaded = function (id: any) {
                    const r = origMark(id);
                    if (!LP()) return r;   // plugin gone — no side effects
                    try {
                        const t = Z._tabs.find((x: any) => x.id === id);
                        trace("tab-loaded[" + name() + "]: " + (t ? t.type : id));
                        // Self-heal stale tab titles on load. A tab created with a
                        // wrong explicit title (e.g. an attachment's own "Full Text
                        // PDF") keeps it FOREVER — Zotero's updateTitle only fires
                        // on item-metadata changes, and reader.updateTitle() alone
                        // doesn't repaint the strip label; Zotero_Tabs.rename does.
                        // A NOTE tab finishing its load is exactly when its
                        // editor document exists — sweep the note-link wiring
                        // now (the boot sweep runs before restored editors
                        // exist, and BN's editor rebuild can swap the iframe
                        // at times no MutationObserver batch flags). LP() is
                        // re-resolved INSIDE the timers — the plugin can be
                        // disabled between the load and the sweep.
                        if (t && String(t.type).indexOf("note") === 0) {
                            win.setTimeout(() => { try { const p = LP(); if (p) p._processNoteEditors(win.document); } catch (e) {} }, 400);
                            win.setTimeout(() => { try { const p = LP(); if (p) p._processNoteEditors(win.document); } catch (e) {} }, 2500);
                        }
                        const iid = t && t.data && t.data.itemID;
                        const it: any = iid && Zotero.Items.get(iid);
                        if (it && typeof it.getTabTitle === "function") {
                            it.getTabTitle().then((title: string) => {
                                try {
                                    if (!LP()) return;
                                    const t2 = Z._tabs.find((x: any) => x.id === id);
                                    if (title && t2 && t2.title !== title) {
                                        Z.rename(id, title);
                                        trace("title self-heal[" + name() + "]: " + String(title).slice(0, 50));
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
            Z._wvOrigSelect = Z.select;
            const origSelect = Z.select.bind(Z);
            Z.select = function (id: any, reopening?: any, opts?: any) {
                const r = origSelect(id, reopening, opts);
                if (!LP()) return r;   // plugin gone — pass through only
                try {
                    win.setTimeout(() => {
                        try {
                            const p = LP();
                            if (!p) return;   // disabled since the select
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
                                trace("watchdog[" + name() + "]: tab " + id + " stuck — retrying load");
                                origSelect("zotero-pane");
                                win.setTimeout(() => { try { origSelect(id); } catch (e) {} }, 80);
                            } else {
                                trace("watchdog[" + name() + "]: tab " + id + " stuck in a background window — re-deferring to activate");
                                origSelect("zotero-pane");
                                try { p._wvDeferSelect(win, t.data && t.data.itemID); } catch (e) {}
                            }
                        } catch (e) {}
                    }, 6000);
                } catch (e) {}
                return r;
            };
        } catch (e) {}
    }

    /** Restore the native Zotero_Tabs methods this window's tracing wrappers
     *  replaced. Called from destroy() for every main window so a plugin
     *  disable leaves NO Weavero code on the tab-lifecycle hot paths. */
    _wvUnwireRestoreTracing(win: any) {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z) return;
            if (Z._wvOrigRestoreState) { Z.restoreState = Z._wvOrigRestoreState; delete Z._wvOrigRestoreState; }
            if (Z._wvOrigClose) { Z.close = Z._wvOrigClose; delete Z._wvOrigClose; }
            if (Z._wvOrigMarkAsLoaded) { Z.markAsLoaded = Z._wvOrigMarkAsLoaded; delete Z._wvOrigMarkAsLoaded; }
            if (Z._wvOrigSelect) { Z.select = Z._wvOrigSelect; delete Z._wvOrigSelect; }
            delete Z._wvRestoreTraceWired;
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
                    if (w._wvWTDeferredFire && w._wvWTDeferredActiveId != null) targets.push({ fire: w._wvWTDeferredFire, win: w });
                }
            } catch (e) {}
            if (!targets.length) return;
            this._wvTrace("idle loader: warming " + targets.length + " deferred reader-window tab(s) in the background");
            const w0: any = Zotero.getMainWindow();
            const setT = (w0 && w0.setTimeout) ? w0.setTimeout.bind(w0) : setTimeout;
            let i = 0;
            const next = () => {
                // Each background load can make its reader window steal focus
                // (its init calls _iframeWindow.focus()) — and the warmer can
                // outlive the bg-restore hold, so a late raise STUCK ("a
                // window coming to the front after a long time", 2026-07-04).
                // Extend the hold per load; the per-window activate hooks
                // persist and revive with the flag. Assert the focused window
                // once all warming is done.
                try { (this as any)._wvBgRestoreStart({ holdMs: 20000 }); } catch (e) {}
                if (i >= targets.length) {
                    try { setT(() => { try { (this as any)._wvRestoreFocusedWindow(); } catch (e) {} }, 3000); } catch (e) {}
                    return;
                }
                const t = targets[i++];
                // PER-WINDOW self-raise mark: this load may raise ITS window
                // (reader init calls _iframeWindow.focus()). A global mark
                // covered nearly the whole startup (loads are sequential),
                // so every unevidenced user switch got fought ("I cannot
                // switch window anymore during startup", 2026-07-13).
                try { t.win._wvBgExpectStealUntil = Date.now() + 6000; } catch (e) {}
                try { t.fire(); } catch (e) {}
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
    /** The window the user was in at quit (from the store's `focused`
     *  descriptor) — resolved against the CURRENT window set, so it only
     *  returns once that window has actually been restored. Shared by the
     *  focus shepherd (poll backstop) and the background-restore observer. */
    /** Milliseconds since the OS last saw real user input (mouse/keyboard,
     *  anywhere) — Gecko's user-idle service, cross-platform. Infinity on
     *  failure. */
    _wvUserIdleMs(): number {
        try {
            const svc = Cc["@mozilla.org/widget/useridleservice;1"]
                .getService(Ci.nsIUserIdleService);
            return svc.idleTime;
        } catch (e) { return Infinity; }
    }

    /** True when the OS saw real user input within the last `ms`. */
    _wvUserRecentlyActive(ms: number): boolean {
        return this._wvUserIdleMs() < ms;
    }

    _wvRestoreFindTargetWin() {
        // A window the USER claimed during the restore (click / Alt-Tab /
        // taskbar switch) trumps the quit-time descriptor everywhere —
        // every re-assert funnels through here or checks it explicitly
        // ("that window should become the one always in focus",
        // 2026-07-13).
        try {
            const chosen = (this as any)._wvBgUserChosenWin;
            if (chosen && !chosen.closed) return chosen;
        } catch (e) {}
        const f = (this as any)._wvBootFocusedEntry;
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
    }

    /** BACKGROUND RESTORE (Windows-only): while the startup restore is in
     *  flight, every Zotero window that OPENS is pushed to the BOTTOM of the
     *  z-order without activation (user32 SetWindowPos, SWP_NOACTIVATE), and
     *  any focus it stole is handed straight back to the quit-time target
     *  window from its own `activate` event — event-driven, so the target
     *  never visibly leaves the front (the 700ms shepherd poll stays only as
     *  a backstop). The rest of the workspace assembles entirely BEHIND the
     *  window the user is reading ("windows coming back on top several times
     *  during restart", 2026-07-04). No-op off Windows: SetWindowPos is the
     *  mechanism, and the instant-refocus half still comes from the shepherd. */
    _wvBgRestoreStart(opts?: any) {
        try {
            // Enable-path reuse: a mid-session plugin enable restores the
            // disable-closed windows with NO startup restore guard held, so
            // the lifetime falls back to a fixed hold; the refocus target is
            // the window the user is in NOW, not the quit-time descriptor.
            // State lives on the INSTANCE so a second call while the observer
            // is already running EXTENDS it (the startup chain's no-opts call
            // races the enable path's opts call — a no-op return left the
            // enable restore unprotected after the first 700ms tick).
            if (opts && opts.holdMs) {
                const until = Date.now() + opts.holdMs;
                if (!((this as any)._wvBgRestoreHoldUntil > until)) (this as any)._wvBgRestoreHoldUntil = until;
            }
            if (opts && opts.targetWin) (this as any)._wvBgRestoreTargetWin = opts.targetWin;
            if ((this as any)._wvBgRestoreOn) return;
            if (Services.appinfo.OS !== "WINNT") return;
            // No startup restore guard (mid-session enable/reload) and no
            // explicit hold → default one. Without it the loop's first 700ms
            // tick tore the observer down before the enable path's window
            // spawns (~1-2s in), whatever the init ordering happened to be.
            if (!(this as any)._wvTabGroupRestoreGuard && !((this as any)._wvBgRestoreHoldUntil > Date.now())) {
                (this as any)._wvBgRestoreHoldUntil = Date.now() + 20000;
            }
            (this as any)._wvBgRestoreOn = true;
            const self = this;
            // Fresh restore cycle → no user claim yet.
            (this as any)._wvBgUserChosenWin = null;
            const resolveTarget = () => {
                try {
                    const chosen = (self as any)._wvBgUserChosenWin;
                    if (chosen && !chosen.closed) return chosen;
                } catch (e) {}
                try {
                    const tw = (self as any)._wvBgRestoreTargetWin;
                    if (tw && !tw.closed) return tw;
                } catch (e) {}
                return self._wvRestoreFindTargetWin();
            };
            let ctypesRef: any = null, user32: any = null, SetWindowPos: any = null,
                GetWindowLongPtr: any = null, SetWindowLongPtr: any = null,
                dwmapi: any = null, DwmSetWindowAttribute: any = null, ShowWindowFn: any = null,
                GetAsyncKeyState: any = null, GetCursorPos: any = null,
                GetSystemMetrics: any = null, POINTStruct: any = null;
            try {
                const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
                ctypesRef = ctypes;
                user32 = ctypes.open("user32.dll");
                SetWindowPos = user32.declare("SetWindowPos", ctypes.winapi_abi, ctypes.bool,
                    ctypes.voidptr_t, ctypes.voidptr_t, ctypes.int, ctypes.int, ctypes.int, ctypes.int, ctypes.uint32_t);
                GetWindowLongPtr = user32.declare("GetWindowLongPtrW", ctypes.winapi_abi, ctypes.intptr_t,
                    ctypes.voidptr_t, ctypes.int);
                SetWindowLongPtr = user32.declare("SetWindowLongPtrW", ctypes.winapi_abi, ctypes.intptr_t,
                    ctypes.voidptr_t, ctypes.int, ctypes.intptr_t);
                ShowWindowFn = user32.declare("ShowWindow", ctypes.winapi_abi, ctypes.bool,
                    ctypes.voidptr_t, ctypes.int);
                GetAsyncKeyState = user32.declare("GetAsyncKeyState", ctypes.winapi_abi, ctypes.short, ctypes.int);
                POINTStruct = new ctypes.StructType("WVPOINT", [{ x: ctypes.int32_t }, { y: ctypes.int32_t }]);
                GetCursorPos = user32.declare("GetCursorPos", ctypes.winapi_abi, ctypes.bool, POINTStruct.ptr);
                GetSystemMetrics = user32.declare("GetSystemMetrics", ctypes.winapi_abi, ctypes.int, ctypes.int);
                dwmapi = ctypes.open("dwmapi.dll");
                DwmSetWindowAttribute = dwmapi.declare("DwmSetWindowAttribute", ctypes.winapi_abi, ctypes.long,
                    ctypes.voidptr_t, ctypes.uint32_t, ctypes.voidptr_t, ctypes.uint32_t);
            } catch (e) {}
            const hwndOf = (w: any) => {
                const base = w.docShell.treeOwner
                    .QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
                return ctypesRef.voidptr_t(ctypesRef.UInt64(base.nativeHandle));
            };
            const pushToBottom = (w: any) => {
                try {
                    if (!SetWindowPos || !w || w.closed) return;
                    // Place just BENEATH the refocus target, so the Zotero
                    // window stack stays together ABOVE unrelated apps —
                    // HWND_BOTTOM buried restored windows under every other
                    // application ("only one window is back", 2026-07-04).
                    let after = ctypesRef.voidptr_t(1);   // HWND_BOTTOM fallback
                    try {
                        const t = resolveTarget();
                        if (t && t !== w && !t.closed) after = hwndOf(t);
                    } catch (e2) {}
                    // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
                    SetWindowPos(hwndOf(w), after, 0, 0, 0, 0, 0x1 | 0x2 | 0x10);
                } catch (e) {}
            };
            // WS_EX_NOACTIVATE: a JS-side refocus reacts AFTER the OS already
            // raised + painted the new window for a frame (the residual short
            // jump survived even open-time activate hooks). This style bit
            // bars the window from ACTIVATING at all at the OS level: it
            // shows, loads and paints, but never comes to the front. Cleared
            // at teardown, when a window becomes the refocus target, and
            // instantly on a user mousedown (their click = their intent).
            // WS_EX_APPWINDOW rides along: a window whose FIRST show happens
            // cloaked + non-activatable never gets a taskbar button, and
            // clearing the bits later does not re-register it with the shell
            // ("still only one window", 2026-07-04). APPWINDOW forces the
            // button; refreshTaskbar() (invisible hide/show while cloaked)
            // re-registers before every reveal as the belt.
            const WS_EX_NOACTIVATE = 0x08000000, WS_EX_APPWINDOW = 0x40000, GWL_EXSTYLE = -20;
            const noActivated = new Set();
            const setNoActivate = (w: any) => {
                try {
                    if (!SetWindowLongPtr || !w || w.closed || noActivated.has(w)) return;
                    const h = hwndOf(w);
                    const cur = Number(GetWindowLongPtr(h, GWL_EXSTYLE));
                    SetWindowLongPtr(h, GWL_EXSTYLE, ctypesRef.intptr_t(cur | WS_EX_NOACTIVATE | WS_EX_APPWINDOW));
                    noActivated.add(w);
                } catch (e) {}
            };
            const clearNoActivate = (w: any) => {
                try {
                    if (!SetWindowLongPtr || !w || !noActivated.has(w)) return;
                    noActivated.delete(w);
                    if (w.closed) return;
                    const h = hwndOf(w);
                    const cur = Number(GetWindowLongPtr(h, GWL_EXSTYLE));
                    SetWindowLongPtr(h, GWL_EXSTYLE, ctypesRef.intptr_t(cur & ~WS_EX_NOACTIVATE));
                } catch (e) {}
            };
            // DWM CLOAKING - the definitive fix for the blink. Style bits
            // and refocus handlers cannot beat explicit programmatic focus
            // (the reader calls _iframeWindow.focus() during init, which
            // activates the top-level window regardless of WS_EX_NOACTIVATE).
            // A cloaked window (DWMWA_CLOAK, what Windows uses for suspended
            // UWP apps) shows, loads, lays out and MEASURES normally - it
            // just composites to nothing, so even a stolen activation has
            // nothing to paint. Uncloaked at teardown (the workspace appears
            // at once, at the BACK), on becoming the refocus target, and on
            // a user mousedown.
            const DWMWA_CLOAK = 13;
            const cloaked = new Set();
            const setCloak = (w: any, on: boolean) => {
                try {
                    if (!DwmSetWindowAttribute || !w || w.closed) { cloaked.delete(w); return; }
                    if (on && cloaked.has(w)) return;
                    if (!on && !cloaked.has(w)) return;
                    const val = ctypesRef.int32_t(on ? 1 : 0);
                    DwmSetWindowAttribute(hwndOf(w), DWMWA_CLOAK, val.address(), 4);
                    if (on) cloaked.add(w); else cloaked.delete(w);
                } catch (e) {}
            };
            const refreshTaskbar = (w: any) => {
                try {
                    if (!ShowWindowFn || !w || w.closed) return;
                    const h = hwndOf(w);
                    ShowWindowFn(h, 0);   // SW_HIDE
                    ShowWindowFn(h, 4);   // SW_SHOWNOACTIVATE
                } catch (e) {}
            };
            const reveal = (w: any) => {
                clearNoActivate(w);
                setCloak(w, false);   // no-op unless a legacy cloak is present
            };
            (this as any)._wvBgClearNoActivate = reveal;
            // "Is this one of ours?" — with a pre-parse grace: at
            // `domwindowopened` (and often at the FIRST activate) the XUL
            // document hasn't parsed yet, so windowtype is empty. During the
            // restore hold, an unidentified window is treated as ours — the
            // only windows opening then ARE the restore's.
            const isZoteroWin = (w: any, allowUnknown?: boolean) => {
                try {
                    const t = w.document && w.document.documentElement
                        && w.document.documentElement.getAttribute("windowtype");
                    if (!t) return !!allowUnknown;
                    return t === "navigator:browser" || t === "zotero:reader";
                } catch (e) { return false; }
            };
            // Hook a window the moment it EXISTS: the first activation fires
            // BEFORE `load` completes, so a load-time hook let every new
            // window flash to the front once (the residual "very short jump",
            // caught by the activation trace at +1969ms/+3521ms, 2026-07-04).
            const hook = (w: any) => {
                try {
                    if (w._wvBgHooked) return;
                    w._wvBgHooked = true;
                    // Self-raise mark: a window OPENING during the restore
                    // activates programmatically — its activations within
                    // this grace are ours to fight, without needing the
                    // whole-startup guard that blocked user switches.
                    (w as any)._wvBgOpenGrace = Date.now() + 4000;
                    // OS-level: never activatable AND cloaked (invisible) while
                    // the restore holds. The native handle is often NOT ready
                    // at domwindowopened, and a single silent retry left the
                    // window uncloaked -> the blink survived (2026-07-04).
                    // Arm relentlessly (open / timer x10 / DOMContentLoaded /
                    // load) until the cloak verifiably sticks, and TRACE the
                    // stage so the next run tells us where it landed.
                    // CLOAKING RETIRED (kept dormant): Gecko pauses the
                    // compositor for cloaked windows, so reveals could show a
                    // blank white surface; combined with the taskbar-button
                    // and z-order fallout it cost more than the blink it hid —
                    // which the user traced to in-window tab-group churn
                    // anyway (2026-07-04). NOACTIVATE + APPWINDOW + instant
                    // refocus + beneath-target stacking remain.
                    // NOACTIVATE RETIRED: it also blocked USER clicks — and a
                    // click on the reader's PDF lands inside its iframe, which
                    // the chrome mousedown claim never sees, so the reader
                    // window was unfocusable during startup (2026-07-04).
                    // Windows now activate natively; the activate hook below
                    // tells user input from programmatic raises via the live
                    // input state and reverts only the latter.
                    const arm = (stage: string) => {
                        try {
                            pushToBottom(w);
                            (w as any)._wvBgArmed = true;
                            (self as any)._wvTrace("bg-restore: window armed at " + stage);
                            return true;
                        } catch (e2) {}
                        return false;
                    };
                    if (!arm("open")) {
                        let tries = 0;
                        const again = (stage: string) => {
                            if ((w as any)._wvBgArmed || w.closed || !(self as any)._wvBgRestoreOn) return;
                            if (!arm(stage) && stage === "timer" && ++tries < 10) setT(() => again("timer"), 30);
                        };
                        setT(() => again("timer"), 15);
                        try { w.addEventListener("DOMContentLoaded", () => again("DOMContentLoaded"), { once: true, capture: true }); } catch (e2) {}
                        try { w.addEventListener("load", () => again("load"), { once: true }); } catch (e2) {}
                    }
                    wireClaim(w);
                } catch (e) {}
            };
            // Positive EVIDENCE that an activation was the user switching
            // windows — "any recent input" (the old detector) is useless at
            // boot: the user JUST launched/clicked something, so every
            // programmatic raise coincides with recent input and got falsely
            // claimed (trace 2026-07-13: claims at +1223ms and +2483ms, the
            // second on a still-loading reader window with an empty title;
            // the re-asserts then dutifully focused the wrong window).
            // Returns a reason string (for the trace) or null.
            const userSwitchEvidence = (): string | null => {
                try {
                    if (GetAsyncKeyState) {
                        const down = (k: number) => (Number(GetAsyncKeyState(k)) & 0x8000) !== 0;
                        if (down(0x01) || down(0x02) || down(0x04)) return "mouse-button-held";
                        if (down(0x12)) return "alt-held";              // Alt+Tab mid-hold
                        if (down(0x5B) || down(0x5C)) return "win-held"; // Win+number
                    }
                    // Taskbar click: button already released by the time the
                    // activation lands, but the CURSOR is on the taskbar and
                    // the input is fresh. Heuristic: cursor within 80px of the
                    // virtual-screen bottom (the user's taskbar is bottom-
                    // docked; side-docked taskbars fall back to the held-key
                    // detectors above).
                    if (GetCursorPos && GetSystemMetrics && self._wvUserRecentlyActive(700)) {
                        const pt = new POINTStruct();
                        if (GetCursorPos(pt.address())) {
                            const top = Number(GetSystemMetrics(77));    // SM_YVIRTUALSCREEN
                            const h = Number(GetSystemMetrics(79));      // SM_CYVIRTUALSCREEN
                            if (Number(pt.y) >= top + h - 80) return "taskbar-cursor";
                        }
                    }
                } catch (e) {}
                return null;
            };
            const claim = (w: any, how: string) => {
                (w as any)._wvBgUserClaimed = true;
                (self as any)._wvBgUserChosenWin = w;
                try {
                    (self as any)._wvTrace("bg-restore: user claimed '"
                        + String(w.document.title || "").slice(0, 30) + "' (" + how + ") — redirect target");
                } catch (e) {}
            };
            // Claim listeners — wired on windows opened DURING the restore
            // (via hook) AND on every pre-existing window (below): the anchor
            // was never hooked, so switching TO it registered no claim and
            // the final asserts snapped focus away again (2026-07-13).
            const wireClaim = (w: any) => {
                try {
                    if ((w as any)._wvBgClaimWired) return;
                    (w as any)._wvBgClaimWired = true;
                    // The user clicking the window overrides everything —
                    // PERMANENTLY for this window (the claim flag disarms the
                    // activate hook below; the old {once} listener revealed the
                    // window but the hook then fought the very focus it granted,
                    // so windows were unclickable during the restore, 2026-07-04).
                    w.addEventListener("mousedown", () => {
                        try {
                            // Set on the LIVE instance — closures survive reloads.
                            const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (lp && lp._wvBgRestoreOn) {
                                (w as any)._wvBgUserClaimed = true;
                                lp._wvBgUserChosenWin = w;
                                try { lp._wvTrace("bg-restore: user claimed '" + String(w.document.title || "").slice(0, 30) + "' (mousedown) — redirect target"); } catch (e3) {}
                            }
                            reveal(w); w.focus();
                        } catch (e2) {}
                    }, { capture: true });
                    w.addEventListener("activate", () => {
                        try {
                            // Stale-closure guard: hooks survive plugin reloads
                            // (they're anonymous listeners), and a stuck flag on
                            // a dead instance turned every USER click on these
                            // windows into a "steal" that got pushed back down
                            // ("I cannot access the other windows", 2026-07-04).
                            const liveP = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (liveP !== self) return;
                            if (!(self as any)._wvBgRestoreOn) return;
                            if ((w as any)._wvBgUserClaimed) return;   // the user chose this window
                            const title = String(w.document.title || "").slice(0, 30);
                            // The intended target activating is neither a claim
                            // nor a steal — it's the restore working.
                            if (w === resolveTarget()) {
                                try { (self as any)._wvTrace("bg-restore: target '" + title + "' activated (ok)"); } catch (e3) {}
                                return;
                            }
                            const evidence = userSwitchEvidence();
                            const idle = Math.round(self._wvUserIdleMs());
                            if (evidence) { claim(w, evidence + " idle=" + idle + "ms"); return; }
                            // Fight ONLY activations we can attribute to our
                            // own raises — each marked on the specific window:
                            // open grace (a restoring window's first
                            // activations) and the warm-load mark. Everything
                            // else is the user: Alt+Tab commits on RELEASING
                            // Alt and a taskbar click's button is long up by
                            // activation time, so requiring positive user
                            // evidence blocked real switches ("I cannot switch
                            // window anymore during startup", 2026-07-13).
                            const now = Date.now();
                            const openGrace = now < ((w as any)._wvBgOpenGrace || 0);
                            const loadMark = now < ((w as any)._wvBgExpectStealUntil || 0);
                            if (!openGrace && !loadMark) {
                                claim(w, "unmarked activation, idle=" + idle + "ms");
                                return;
                            }
                            if (!isZoteroWin(w, true)) return;
                            const t2 = resolveTarget();
                            if (t2 && t2 !== w) {
                                pushToBottom(w);
                                reveal(t2);
                                t2.focus();
                                try {
                                    (self as any)._wvTrace("bg-restore: "
                                        + (w.document.documentElement.getAttribute("windowtype") || "pre-parse")
                                        + " '" + title + "' stole activation (idle=" + idle
                                        + "ms openGrace=" + openGrace + " loadMark=" + loadMark
                                        + ") — refocused the target");
                                } catch (e2) {}
                            }
                        } catch (e) {}
                    });
                } catch (e) {}
            };
            const settle = (w: any) => {
                try {
                    if (!(self as any)._wvBgRestoreOn || !isZoteroWin(w)) return;
                    // Post-load init can still raise the window — refresh its
                    // self-raise grace briefly.
                    try { (w as any)._wvBgOpenGrace = Math.max((w as any)._wvBgOpenGrace || 0, Date.now() + 2500); } catch (e2) {}
                    const target = resolveTarget();
                    if (target === w) { reveal(w); return; }   // the target itself may restore late
                    pushToBottom(w);
                    if (target && Services.focus.activeWindow === w) { try { reveal(target); target.focus(); } catch (e) {} }
                    hook(w);   // no-op if the open-time hook already landed
                } catch (e) {}
            };
            const obs: any = {
                observe(subject: any, topic: string) {
                    try {
                        if (topic !== "domwindowopened") return;
                        const w: any = subject;
                        hook(w);                                   // BEFORE first show/activate
                        w.addEventListener("load", () => settle(w), { once: true });
                    } catch (e) {}
                },
            };
            try { Services.ww.registerNotification(obs); } catch (e) {}
            // Claim coverage for PRE-EXISTING windows (the anchor and anything
            // already restored before this start): listeners only — no arm/
            // pushToBottom, they may legitimately be in front.
            try {
                for (const w of (Zotero.getMainWindows() || [])) wireClaim(w);
                const en0 = Services.wm.getEnumerator("zotero:reader");
                while (en0.hasMoreElements()) wireClaim(en0.getNext());
            } catch (e) {}
            // Lifetime mirrors the shepherd: poll the guard, then tear down.
            let ticks = 0;
            const w0: any = Zotero.getMainWindow();
            const setT = (w0 && w0.setTimeout) ? w0.setTimeout.bind(w0) : setTimeout;
            const tick = () => {
                ticks++;
                const hu = (this as any)._wvBgRestoreHoldUntil || 0;
                const held = (this as any)._wvTabGroupRestoreGuard || (hu && Date.now() < hu);
                if (held && ticks <= 60) { setT(tick, 700); return; }
                (this as any)._wvBgRestoreOn = false;
                (this as any)._wvBgRestoreHoldUntil = 0;
                (this as any)._wvBgRestoreTargetWin = null;
                try { for (const w of [...cloaked]) { pushToBottom(w); reveal(w); } } catch (e) {}
                try { for (const w of [...noActivated]) clearNoActivate(w); } catch (e) {}
                (this as any)._wvBgClearNoActivate = null;
                try { Services.ww.unregisterNotification(obs); } catch (e) {}
                try { if (dwmapi) dwmapi.close(); } catch (e) {}
                try { if (user32) user32.close(); } catch (e) {}
            };
            setT(tick, 700);
        } catch (e) {}
    }

    _wvFocusShepherdStart() {
        try {
            if (this._wvFocusShepherdOn) return;
            this._wvFocusShepherdOn = true;
            const self = this;
            const findTarget = () => self._wvRestoreFindTargetWin();
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
                            // Recent user input → this is the USER switching
                            // windows, not a load stealing focus: adopt their
                            // pick instead of fighting it. This is also the
                            // macOS path (the Win32 activate hooks never run
                            // there; the shepherd's re-asserts were what made
                            // manual switching impossible during loading).
                            if (self._wvUserRecentlyActive(1500)) {
                                (self as any)._wvBgUserChosenWin = fw;
                                (this as any)._wvTrace("focus-shepherd: user switched to '"
                                    + String(fw.document.title || "").slice(0, 30)
                                    + "' — adopted as target");
                            } else {
                                target.focus();
                                (this as any)._wvTrace("focus-shepherd: re-asserted the "
                                    + (((self as any)._wvBootFocusedEntry || {}).kind) + " window");
                            }
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
            // A user claim during the restore beats the quit-time descriptor:
            // the final asserts must land on THEIR window, not snap back.
            try {
                const chosen = (this as any)._wvBgUserChosenWin;
                if (chosen && !chosen.closed) {
                    try { if ((this as any)._wvBgClearNoActivate) (this as any)._wvBgClearNoActivate(chosen); } catch (e) {}
                    chosen.focus();
                    (this as any)._wvTrace("restore: focused the user-chosen window '"
                        + String(chosen.document && chosen.document.title || "").slice(0, 30) + "'");
                    return;
                }
            } catch (e) {}
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
            if (target) {
                try { if ((this as any)._wvBgClearNoActivate) (this as any)._wvBgClearNoActivate(target); } catch (e) {}
                target.focus();
                (this as any)._wvTrace("restore: focused " + f.kind + " window");
            }
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
                    // Resolve the LIVE plugin at keydown time — this listener is
                    // wired once per window and survives plugin reloads; a
                    // captured `this` would run the DEAD instance's (empty)
                    // closed stack forever after a reload.
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!lp || lp._wvDestroyed) return;   // plugin off → native behavior
                    const accel = (Zotero as any).isMac ? e.metaKey : e.ctrlKey;
                    if (!accel || !e.shiftKey || e.altKey) return;
                    if (String(e.key || "").toLowerCase() !== "t") return;
                    // 1) Weavero's closed reader-window / group stack (priority).
                    if (lp._wvClosedPeek()) { suppress(e); lp._wvClosedReopenLast(win); return; }
                    // 2) Reader window: its own closed-TAB stack (no native undo here).
                    try {
                        if (lp._wvTabGroupIsReaderWin && lp._wvTabGroupIsReaderWin(win) && win._wvWTClosed && win._wvWTClosed.length) {
                            suppress(e);
                            const last = win._wvWTClosed.pop();
                            if (last && last.itemID != null) lp._wvWTMountTab(win, last.itemID, { allowDuplicate: true, select: true });
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

    /** Stop a new collection from stealing the SELECTION in every window
     *  (user report 2026-07-16). Zotero's collectionTree.notify runs in
     *  EVERY window and, on a single-collection `add`, each one calls
     *  `selectByID("C"+id)` (collectionTree.jsx) — native Zotero only
     *  ever had one window, so this was always correct. With Weavero's
     *  multiple main windows, creating a collection in one jumped the
     *  ANCHOR (and every other) window to it too. Wrap each window's
     *  collectionsView.notify: for a collection `add`, snapshot the
     *  focused row first, and in the window that DIDN'T initiate the
     *  add (i.e. lacks OS focus) restore that row afterwards, so only
     *  the acting window follows the new collection. Idempotent per
     *  window; installs when the view exists. */
    _wvGuardCollectionSelectCrossWindow(win: any) {
        try {
            if (!win || !win.ZoteroPane) return;
            const cv: any = win.ZoteroPane.collectionsView;
            if (!cv || typeof cv.notify !== "function") return;
            // Peel-before-reinstall (the reload-proof wiring rule — the
            // collectionsView outlives plugin reloads, so a boolean
            // guard would pin a stale wrap).
            if (cv._wvOrigNotifyForSelectGuard) {
                cv.notify = cv._wvOrigNotifyForSelectGuard;
                delete cv._wvOrigNotifyForSelectGuard;
            }
            cv._wvOrigNotifyForSelectGuard = cv.notify;
            const orig = cv.notify.bind(cv);
            cv.notify = async function (action: any, type: any, ids: any, extraData: any) {
                try {
                    if (action === "add" && type === "collection"
                        && Array.isArray(ids) && ids.length === 1
                        // Only guard when THIS window isn't the one that
                        // triggered the add — the initiating window has OS
                        // focus (its New Collection dialog just closed onto
                        // it). document.hasFocus() is per-window and true
                        // only there.
                        && !win.document.hasFocus()) {
                        // Suppress the auto-select via the notifier's OWN
                        // mechanism (skipSelect — what native code passes
                        // when it doesn't want the jump) instead of
                        // selecting and restoring: the round-trip reloaded
                        // the items list and flickered (user report
                        // 2026-07-16). CLONE extraData — the object is
                        // shared by every window's observer, so mutating
                        // it would leak the suppression into the acting
                        // window too.
                        const ed: any = Object.assign({}, extraData);
                        ed[ids[0]] = Object.assign({}, ed[ids[0]], { skipSelect: true });
                        return await orig(action, type, ids, ed);
                    }
                } catch (e) {}
                return orig(action, type, ids, extraData);
            };
        } catch (e) { Zotero.debug("[Weavero] _wvGuardCollectionSelectCrossWindow err: " + e); }
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
                try { this._wvGuardCollectionSelectCrossWindow(w); } catch (e) {}
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
            // Preferred spot: the compact title bar's draggable SPACER between
            // the hamburger and the window controls — on the library tab the
            // icon squeezed the tab's own title ("hiding some useful text in
            // the header of the library tab", 2026-07-03). Fallback to the old
            // library-tab position when the compact title bar (and thus the
            // spacer) isn't present.
            const hasSpacer = !!d.querySelector("#zotero-title-bar > .wv-titlebar-spacer");
            const css = hasSpacer
                ? (`.wv-anchor-window #zotero-title-bar > .wv-titlebar-spacer{`
                    + `display:flex;align-items:center;justify-content:center;}`
                    + `.wv-anchor-window #zotero-title-bar > .wv-titlebar-spacer::before{`
                    + `content:"";display:block;width:15px;height:15px;`
                    + `background-color:#3d6fe0;`
                    + `mask:url("data:image/svg+xml,${anchorSvg}") center/contain no-repeat;}`
                    + `.wv-ui-dark.wv-anchor-window #zotero-title-bar > .wv-titlebar-spacer::before{`
                    + `background-color:#9dbcff;}`)
                : (`.wv-anchor-window #tab-bar-container .tab[data-id="zotero-pane"]::after{`
                    + `content:"";display:inline-block;width:15px;height:15px;margin-inline-start:6px;`
                    + `background-color:#3d6fe0;`
                    + `mask:url("data:image/svg+xml,${anchorSvg}") center/contain no-repeat;`
                    + `align-self:center;flex:0 0 auto;}`
                    // Dark UI: the accent blue is too dim against the dark tab bar —
                    // use a bright sky blue instead.
                    + `.wv-ui-dark.wv-anchor-window #tab-bar-container .tab[data-id="zotero-pane"]::after{`
                    + `background-color:#9dbcff;}`);
            let st: any = d.getElementById("wv-anchor-indicator-style");
            if (!st) {
                st = d.createElementNS("http://www.w3.org/1999/xhtml", "style");
                st.id = "wv-anchor-indicator-style";
                (d.head || d.documentElement).appendChild(st);
            }
            if (st.textContent !== css) st.textContent = css;   // refresh if rule changed
            // Show the mark only when MORE THAN ONE window exists (mains and
            // reader windows both counted — user rule 2026-07-15): a lone
            // window has no "which is the main one?" ambiguity.
            let multi = false;
            try { multi = this._wvAnchorDecorVisible(); } catch (e) {}
            const isAnchor = this._wvIsAnchorWindow(win);
            d.documentElement.classList.toggle("wv-anchor-window", multi && isAnchor);
            // NON-anchor mains: the same spacer spot shows the window's badge
            // COLOUR as a small square — the in-window twin of the taskbar
            // icon badge (user request 2026-07-13). Must run BEFORE the anchor
            // tooltip below: its show=false cleanup clears the spacer title.
            try { this._wvUpdateWindowBadgeDot(win, multi && !isAnchor, false); } catch (e) {}
            // Hovering the mark position names the window (the mark itself
            // is a ::before, so the tooltip lives on its host spacer).
            // BOTH the tooltip and the Manage Window right-click stay
            // available EVEN when no glyph is shown (user requests
            // 2026-07-16) — a lone window hides the ⚓/dot, but the spot
            // keeps working; only the "(anchor)" suffix is tied to the
            // visible mark. (Runs after _wvUpdateWindowBadgeDot above,
            // whose cleanup clears the spacer title.)
            try {
                const sp = d.querySelector("#zotero-title-bar > .wv-titlebar-spacer");
                if (sp) {
                    const nm = this._wvWindowName(win)
                        + ((multi && isAnchor) ? " (anchor)" : "");
                    sp.setAttribute("title", nm);
                    sp.setAttribute("tooltiptext", nm);
                    this._wvWireWindowNameTooltip(win, sp);
                    this._wvWireWindowMarkContext(win, sp, false);
                }
            } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvUpdateMainWindowIndicator err: " + e); }
    }

    /** Native tooltips never fire for the title-bar marks: the XUL
     *  tooltip engine only auto-fires on XUL elements, and the spacers
     *  are HTML divs (verified 2026-07-13 — hover events arrive, the
     *  engine's popupshowing never does). Same situation and same fix
     *  as the reader-strip tab tooltips (_ensureReaderWindowTabTooltip):
     *  a per-document XUL <tooltip> opened manually on a ~500ms hover
     *  timer. The label reads the element's `title` attribute AT HOVER
     *  TIME, so window renames stay fresh with no re-wiring. */
    _wvWireWindowNameTooltip(win: any, el: any) {
        try {
            if (!win || !win.document || !el || (el as any)._wvNameTipWired) return;
            (el as any)._wvNameTipWired = true;
            const doc = win.document;
            const TIP_ID = "wv-win-name-tooltip";
            let tip: any = doc.getElementById(TIP_ID);
            if (!tip) {
                tip = doc.createXULElement("tooltip");
                tip.id = TIP_ID;
                (doc.querySelector("popupset") || doc.documentElement).appendChild(tip);
            }
            let timer: any = null, isOpen = false, sx = 0, sy = 0;
            const hide = () => {
                try {
                    if (timer) { win.clearTimeout(timer); timer = null; }
                    const t = doc.getElementById(TIP_ID);
                    if (t && typeof t.hidePopup === "function") t.hidePopup();
                    isOpen = false;
                } catch (e) {}
            };
            el.addEventListener("mouseenter", (e: any) => {
                try {
                    sx = e.screenX; sy = e.screenY;
                    if (timer) win.clearTimeout(timer);
                    timer = win.setTimeout(() => {
                        try {
                            const label = el.getAttribute("title") || "";
                            if (!label) return;
                            const t = doc.getElementById(TIP_ID);
                            if (t && typeof t.openPopup === "function") {
                                t.setAttribute("label", label);
                                isOpen = true;
                                // Anchor to the mark element (like native tab
                                // tooltips anchor to the tab) — the cursor-
                                // offset variant landed too far down.
                                t.openPopup(el, "after_start", 0, 2, false, false);
                            }
                        } catch (e2) {}
                    }, 500);
                } catch (e2) {}
            });
            el.addEventListener("mousemove", (e: any) => {
                if (!isOpen) { sx = e.screenX; sy = e.screenY; }
            });
            el.addEventListener("mouseleave", hide);
            el.addEventListener("mousedown", hide);
        } catch (e) {}
    }

    /** Right-click on a title-bar window mark (anchor ⚓ or colour dot):
     *  context menu with Rename Window… (main windows — reader names are
     *  positional) and a colour picker that overrides the shared-pool
     *  index for THIS window (session-scoped, like the automatic
     *  assignment; user request 2026-07-13). */
    _wvWireWindowMarkContext(win: any, el: any, isReader: boolean) {
        try {
            if (!el || (el as any)._wvMarkCtxWired) return;
            (el as any)._wvMarkCtxWired = true;
            el.addEventListener("contextmenu", (e: any) => {
                try {
                    e.preventDefault(); e.stopPropagation();
                    const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (p && !p._wvDestroyed) p._wvWindowMarkContext(win, isReader, e);
                } catch (e2) {}
            });
        } catch (e) {}
    }

    _wvWindowMarkContext(win: any, isReader: boolean, e: any) {
        try {
            // "Manage Window" editor panel — the window twin of the group
            // chip editor (user request 2026-07-15). Name persistence:
            // main-window names persist (window-titles map); reader names
            // are session-scoped (`win._wvWindowTitle`).
            this._wvShowWindowEditor(win, isReader, win, null, e);
        } catch (e2) { Zotero.debug("[Weavero] _wvWindowMarkContext err: " + e2); }
    }

    /** In-window badge dot: a square (main) or circle (reader) in the
     *  window's shared-pool colour, top-right — the spacer of the
     *  compact title bar for main windows (same spot as the anchor
     *  mark), the right end of the tab strip for reader windows.
     *  Mirrors the taskbar icon badge so the association reads the
     *  same on every surface. Pseudo-element via a per-window <style>,
     *  so strip/tab re-renders can't wipe it. */
    _wvUpdateWindowBadgeDot(win: any, show: boolean, isReader: boolean) {
        try {
            const d = win && win.document;
            if (!d) return;
            let st: any = d.getElementById("wv-window-badge-dot-style");
            const spacer = d.querySelector(isReader
                ? ".wv-window-drag-spacer"
                : "#zotero-title-bar > .wv-titlebar-spacer");
            if (!show) {
                if (st) st.textContent = "";
                try { if (spacer) spacer.removeAttribute("title"); } catch (e) {}
                return;
            }
            const color = WV_WIN_BADGE_COLORS[
                this._wvTitleGlyphIdx(win, isReader) % WV_WIN_BADGE_COLORS.length];
            // Hover names the window — same names as the move-target menus.
            try {
                if (spacer) {
                    let name = "";
                    if (isReader) {
                        let n = 0;
                        const en = Services.wm.getEnumerator("zotero:reader");
                        while (en.hasMoreElements()) {
                            const w: any = en.getNext();
                            if (!w || !w._wvWT) continue;
                            n++;
                            if (w === win) break;
                        }
                        name = this._wvWindowCustomTitle(win)
                            || (n > 1 ? "Reader window " + n : "Reader window");
                    } else {
                        name = this._wvWindowName(win);
                    }
                    if (name) {
                        spacer.setAttribute("title", name);
                        spacer.setAttribute("tooltiptext", name);
                        this._wvWireWindowNameTooltip(win, spacer);
                        this._wvWireWindowMarkContext(win, spacer, isReader);
                    }
                }
            } catch (e) {}
            let css = "";
            if (isReader) {
                // The reader window's `.wv-window-drag-spacer` sits between
                // the hamburger and the window controls — the exact analog
                // of the main windows' `.wv-titlebar-spacer` that hosts the
                // anchor mark. Same spot, same treatment.
                // NOTE: no `-moz-window-dragging:no-drag` here — the spacers
                // are the windows' drag handles ("It breaks the drag area to
                // move the window", 2026-07-13). The name tooltip doesn't need
                // it: drag regions eat CLICKS, but hover events still flow, and
                // the tooltip is opened by our own hover listener (the native
                // engine ignores HTML divs regardless).
                css = `.wv-window-tabstrip .wv-window-drag-spacer{`
                    + `display:flex;align-items:center;justify-content:center;}`
                    + `.wv-window-tabstrip .wv-window-drag-spacer::before{`
                    + `content:"";display:block;width:11px;height:11px;`
                    + `border-radius:50%;background-color:${color};}`;
            } else {
                const hasSpacer = !!d.querySelector("#zotero-title-bar > .wv-titlebar-spacer");
                css = hasSpacer
                    ? (`#zotero-title-bar > .wv-titlebar-spacer{`
                        + `display:flex;align-items:center;justify-content:center;}`
                        + `#zotero-title-bar > .wv-titlebar-spacer::before{`
                        + `content:"";display:block;width:11px;height:11px;`
                        + `border-radius:2px;background-color:${color};}`)
                    : (`#tab-bar-container .tab[data-id="zotero-pane"]::after{`
                        + `content:"";display:inline-block;width:11px;height:11px;`
                        + `border-radius:2px;margin-inline-start:6px;`
                        + `background-color:${color};align-self:center;flex:0 0 auto;}`);
            }
            if (!st) {
                st = d.createElementNS("http://www.w3.org/1999/xhtml", "style");
                st.id = "wv-window-badge-dot-style";
                (d.head || d.documentElement).appendChild(st);
            }
            if (st.textContent !== css) st.textContent = css;
        } catch (e) { Zotero.debug("[Weavero] _wvUpdateWindowBadgeDot err: " + e); }
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
                    try { node.removeAttribute("data-wv-pin-mirrored"); } catch (e) {}
                }
                // Unhide any mirrored tab that wasn't caught above and drop
                // the mirror container itself.
                for (const node of doc.querySelectorAll("#tab-bar-container .tab[data-wv-pin-mirrored]")) {
                    try { node.removeAttribute("data-wv-pin-mirrored"); } catch (e) {}
                }
                try { const mc = doc.getElementById("wv-pinned-mirrors"); if (mc) mc.remove(); } catch (e) {}
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
        if ((this as any)._wvDestroyed) return;   // plugin torn down — never re-apply
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
        // Weavero-identity funnel (Zotero's filter.svg artwork + amber
        // stem, themed via -moz-context-properties — see constants.ts),
        // plus a small dropmarker chevron so the visual matches the
        // items toolbar button shape (icon + ▾).
        btn.style.setProperty("-moz-context-properties",
            "fill, fill-opacity, stroke, stroke-opacity");
        btn.style.fill = "currentColor";
        const ic = doc.createElementNS(NS_HTML, "img");
        ic.className = "wv-tabs-menu-filetype-icon";
        ic.src = WV_FUNNEL_DATA_URI;
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
            // Only the DESIGNATED pin tab (one per pinned item) gets the
            // glyph; duplicate copies of a pinned item are normal tabs.
            const des = (win as any)._wvPinnedTabIDs;
            if (des instanceof Set) { if (!des.has(tabId)) return; }
            else if (!this._pinnedTabsHas(key.libraryID, key.itemKey)) return;

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
