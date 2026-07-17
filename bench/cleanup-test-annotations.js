// Remove every benchmark annotation (they all carry the tag below).
(async () => {
  const TAG = "wv-am-perf-test";
  const ITEM_ID = 276;
  const att = await Zotero.Items.getAsync(ITEM_ID);
  await att.loadAllData();
  const anns = att.getAnnotations().filter(a => a.hasTag(TAG));
  let n = 0;
  await Zotero.DB.executeTransaction(async () => {
    for (const a of anns) { await a.erase(); n++; }
  });
  return "deleted " + n + " annotations tagged " + TAG;
})()