// Edit ITEM_ID to your heavy test document (see README).
const ITEM_ID = 276;
(async () => { try {
  const R = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
  const idoc = R._iframeWindow.document;
  let pdfWin = null, pdfScroller = null;
  for (const f of idoc.querySelectorAll("iframe")) {
    try { const cw = f.contentWindow; const vc = cw && cw.document && cw.document.getElementById("viewerContainer");
      if (vc) { pdfWin = cw; pdfScroller = vc; break; } } catch (e) {}
  }
  if (!pdfScroller) return "NO PDF VIEWER";
  const t1 = Date.now();
  pdfScroller.scrollTop = pdfScroller.scrollHeight * 0.5;
  await Zotero.Promise.delay(2500);
  const jumpSettleMs = Date.now() - t1;
  const deltas = [];
  await new Promise((res) => { let last = pdfWin.performance.now(), n = 0;
    const tick = (ts) => { deltas.push(Math.round(ts - last)); last = ts; pdfScroller.scrollTop += 60;
      if (++n < 90) pdfWin.requestAnimationFrame(tick); else res(); };
    pdfWin.requestAnimationFrame(tick); });
  deltas.sort((a, b) => a - b);
  return JSON.stringify({ jumpSettleMs, frames: { median: deltas[45], p95: deltas[85], worst: deltas[89] } });
} catch (e) { return "ERR: " + e.message; } })()
