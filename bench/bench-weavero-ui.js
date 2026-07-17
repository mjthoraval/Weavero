// Weavero UI machinery timings (requires Weavero enabled):
//   filterApplyMs / filterClearMs - items-list filter apply/clear on the
//        full library (measured via rowProvider count change + settle).
//   tabsMenuOpenMs - Weavero tabs-menu panel open -> populated with rows.
(async () => {
  try {
    const w = Zotero.getMainWindow(), ZT = w.Zotero_Tabs, p = Zotero.Weavero.plugin;
    const zp = w.ZoteroPane;
    ZT.select("zotero-pane");
    zp.collectionsView.selection.select(0);
    await Zotero.Promise.delay(1200);
    const iv = zp.itemsView;
    const rp0 = iv.rowProvider ? iv.rowProvider.getRowCount() : iv.rowCount;

    // --- filter apply ---
    const g = p._emptyFilterGroup(); g.itemType = ["journalArticle"];
    const tA = Date.now();
    p._filterState = { groups: [g], activeGroupIndex: 0 };
    p._renderFilterBar();
    await p._applyItemsListFilter({});
    let filterApplyMs = -1;
    for (let i = 0; i < 100; i++) {
      const n = iv.rowProvider ? iv.rowProvider.getRowCount() : iv.rowCount;
      if (n !== rp0) { filterApplyMs = Date.now() - tA; break; }
      await Zotero.Promise.delay(50);
    }
    const filtered = iv.rowProvider ? iv.rowProvider.getRowCount() : iv.rowCount;
    await Zotero.Promise.delay(500);

    // --- filter clear ---
    const tC = Date.now();
    p._clearAllFilters();
    let filterClearMs = -1;
    for (let i = 0; i < 100; i++) {
      const n = iv.rowProvider ? iv.rowProvider.getRowCount() : iv.rowCount;
      if (n === rp0) { filterClearMs = Date.now() - tC; break; }
      await Zotero.Promise.delay(50);
    }

    // --- tabs menu open ---
    let tabsMenuOpenMs = -1, tabsMenuRows = -1;
    const panel = w.document.querySelector("panel.wv-tabs-menu-wide, .wv-tabs-menu-wide");
    const anchor = w.document.getElementById("zotero-tb-tabs-menu")
      || w.document.querySelector("#tab-bar-container");
    if (panel && anchor) {
      const tM = Date.now();
      panel.openPopup(anchor, "after_start", 0, 0, false, false);
      for (let i = 0; i < 100; i++) {
        await Zotero.Promise.delay(30);
        const rows = panel.querySelectorAll(".wv-tabs-menu-row, [class*=tabs-menu] .row, richlistitem, .wv-tm-row").length;
        if (panel.state === "open" && rows > 0) { tabsMenuOpenMs = Date.now() - tM; tabsMenuRows = rows; break; }
      }
      try { panel.hidePopup(); } catch (e) {}
    }
    return JSON.stringify({ library: { rows: rp0, filtered }, filterApplyMs, filterClearMs, tabsMenuOpenMs, tabsMenuRows });
  } catch (e) { return "ERR: " + e.message + " | " + (e.stack || "").split("\n")[0]; }
})()