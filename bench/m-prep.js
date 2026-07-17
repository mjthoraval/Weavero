// Edit ITEM_ID to your heavy test document (see README).
const ITEM_ID = 276;
(async () => { try {
  const w = Zotero.getMainWindow(), ZT = w.Zotero_Tabs;
  const old = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
  if (old && old.tabID) { ZT.close(old.tabID); await Zotero.Promise.delay(1200); }
  await Zotero.Reader.open(276);
  await Zotero.Promise.delay(800);
  const R = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
  await R._waitForReader();
  await Zotero.Promise.delay(2500);
  const idoc = R._iframeWindow.document;
  let amStyle = false;
  for (const s of idoc.querySelectorAll("style")) { if ((s.textContent || "").includes(".annotation-markdown-rendered")) { amStyle = true; break; } }
  return JSON.stringify({ weavero: !!(Zotero.Weavero && Zotero.Weavero.plugin), amWired: amStyle, ann: idoc.querySelectorAll(".annotation").length });
} catch (e) { return "ERR: " + e.message; } })()
