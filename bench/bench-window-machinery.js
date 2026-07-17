// Weavero window/tab machinery timings (requires Weavero enabled):
//   tearOffMs      - main-window tab -> standalone reader window, via the
//                    moveToNewWindow hook (Weavero's no-reload docshell
//                    swap when eligible; classic reopen otherwise), timed
//                    until the reader is alive in the new window.
//   swapUsed       - whether the no-reload path ran (tab-id preserved).
//   backToTabMs    - closing the reader window -> tab restored in the main
//                    window (Weavero's window->tab conversion), timed until
//                    the tab exists AND its reader is alive again.
// Uses ITEM_ID below; pick a LIGHT document so machinery cost isn't
// swamped by PDF load time. Run twice: once as-is, once with ITEM_ID set
// to the heavy document to see content-dependence.
(async () => {
  try {
    const ITEM_ID = 187;
    const w = Zotero.getMainWindow(), ZT = w.Zotero_Tabs;
    // Ensure the item is open as a LOADED main-window tab.
    let R = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
    if (!R || !R.tabID || !ZT._tabs.find(t => t.id === R.tabID)) {
      if (R && R._window && !R.tabID) { try { R._window.close(); } catch (e) {} await Zotero.Promise.delay(1000); }
      await Zotero.Reader.open(ITEM_ID);
      R = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
    }
    await R._waitForReader();
    const tab = ZT._tabs.find(t => t.id === R.tabID);
    if (!tab) return "NO TAB for item " + ITEM_ID;
    const oldTabID = tab.id;
    const countReaderWins = () => {
      let n = 0; const en = Services.wm.getEnumerator(null);
      while (en.hasMoreElements()) {
        const x = en.getNext();
        try { if (x.document.documentElement.getAttribute("windowtype") === "zotero:reader") n++; } catch (e) {}
      }
      return n;
    };
    const winsBefore = countReaderWins();

    // --- tear-off ---
    const t0 = Date.now();
    await ZT.tabHooks.moveToNewWindow.reader(tab, ZT._tabs.indexOf(tab));
    let tearOffMs = -1, R2 = null;
    for (let p = 0; p < 200; p++) {
      await Zotero.Promise.delay(50);
      R2 = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
      if (R2 && countReaderWins() > winsBefore) {
        try { await R2._waitForReader(); tearOffMs = Date.now() - t0; break; } catch (e) {}
      }
    }
    const swapUsed = !!(R2 && R2.tabID === oldTabID);

    // --- back to tab (close the reader window) ---
    await Zotero.Promise.delay(800);
    let backToTabMs = -1;
    const t1 = Date.now();
    let rw = null; const en2 = Services.wm.getEnumerator(null);
    while (en2.hasMoreElements()) {
      const x = en2.getNext();
      try { if (x.document.documentElement.getAttribute("windowtype") === "zotero:reader") rw = x; } catch (e) {}
    }
    if (rw) {
      rw.close();
      for (let p = 0; p < 200; p++) {
        await Zotero.Promise.delay(50);
        const R3 = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
        if (R3 && R3.tabID && ZT._tabs.find(t => t.id === R3.tabID)) {
          try { await R3._waitForReader(); backToTabMs = Date.now() - t1; break; } catch (e) {}
        }
      }
    }
    return JSON.stringify({ item: ITEM_ID, tearOffMs, swapUsed, backToTabMs,
      readerWins: countReaderWins(), tabRestored: backToTabMs > 0 });
  } catch (e) { return "ERR: " + e.message + " | " + (e.stack || "").split("\n")[0]; }
})()