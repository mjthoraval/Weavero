// Reader-tab load time — ONE cold run per invocation (keeps each bridge
// eval short; loop the invocation for statistics, editing ITEM_ID for
// each document under test):
//   tReady    - Zotero.Reader.open() -> _waitForReader() resolves
//   tSidebar  - ...until the annotations sidebar holds >= WANT_ANNS cards
//   tPreviews - ...until the preview count stops growing (Weavero eager
//               pass / AM lazy pass for VISIBLE cards; 0 = no plugin)
(async () => {
  try {
    const ITEM_ID = 276;     // heavy: 276 (200 LaTeX/MD anns) | light: 187
    const WANT_ANNS = ITEM_ID === 276 ? 200 : 1;
    const w = Zotero.getMainWindow(), ZT = w.Zotero_Tabs;
    const old = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
    if (old && old.tabID) { ZT.close(old.tabID); await Zotero.Promise.delay(1200); }
    const t0 = Date.now();
    await Zotero.Reader.open(ITEM_ID);
    const R = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
    await R._waitForReader();
    const tReady = Date.now() - t0;
    const idoc = R._iframeWindow.document;
    let tSidebar = -1;
    for (let p = 0; p < 100; p++) {
      if (idoc.querySelectorAll(".annotation").length >= WANT_ANNS) { tSidebar = Date.now() - t0; break; }
      await Zotero.Promise.delay(100);
    }
    let prev = -1, stable = 0, tPreviews = -1;
    for (let p = 0; p < 40; p++) {
      const n = idoc.querySelectorAll(".annotation-markdown-rendered").length
        + idoc.querySelectorAll(".wv-md-preview").length;
      if (n === prev) { stable++; if (stable >= 4) { tPreviews = Date.now() - t0; break; } }
      else { stable = 0; prev = n; }
      await Zotero.Promise.delay(120);
    }
    return JSON.stringify({ item: ITEM_ID, tReady, tSidebar, tPreviews, previews: prev });
  } catch (e) { return "ERR: " + e.message + " | " + (e.stack || "").split("\n")[0]; }
})()