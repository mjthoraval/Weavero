// Edit ITEM_ID to your heavy test document (see README).
const ITEM_ID = 276;
// Sidebar probe — anchored on FIXED CARD INDEXES (not scrollHeight
// fractions) so every configuration scrolls the same annotations:
// scrollHeight varies per config (which plugin's clamped previews are
// rendered), so fraction anchors drift across configs.
//   dwell  - jump to card #DWELL_CARD, time until preview count settles
//            (NOTE: with amc.4's idle drain this includes background
//            drain activity — treat as coverage-latency, not user delay)
//   frames - scroll from card #FRAME_CARD, +40px per rAF frame x90
// Comparability rules: same annotation fixture, discard the first-ever
// open of the document (cache warmup), >= 3 runs per config.
(async () => {
  try {
    const DWELL_CARD = 80, FRAME_CARD = 30;
    const R = Zotero.Reader._readers.find(r => r.itemID === ITEM_ID);
    const iw = R._iframeWindow, idoc = iw.document;
    const sc = idoc.querySelector("#annotations, .annotations");
    if (!sc) return "NO SIDEBAR";
    const cards = idoc.querySelectorAll(".annotation");
    if (cards.length <= DWELL_CARD) return "ONLY " + cards.length + " CARDS";
    cards[DWELL_CARD].scrollIntoView({ block: "start" });
    const td = Date.now();
    let prev = -1, stable = 0;
    for (let p = 0; p < 20; p++) {
      await Zotero.Promise.delay(120);
      const n = idoc.querySelectorAll(".annotation-markdown-rendered").length
        + idoc.querySelectorAll(".wv-md-preview").length;
      if (n === prev) { stable++; if (stable >= 3) break; } else { stable = 0; prev = n; }
    }
    const dwellMs = Date.now() - td;
    cards[FRAME_CARD].scrollIntoView({ block: "start" });
    await Zotero.Promise.delay(300);
    const deltas = [];
    await new Promise((res) => {
      let last = iw.performance.now(), n = 0;
      const tick = (ts) => {
        deltas.push(Math.round(ts - last)); last = ts; sc.scrollTop += 40;
        if (++n < 90) iw.requestAnimationFrame(tick); else res();
      };
      iw.requestAnimationFrame(tick);
    });
    deltas.sort((a, b) => a - b);
    return JSON.stringify({
      dwellMs,
      frames: { median: deltas[45], p95: deltas[85], worst: deltas[89] },
      counts: {
        am: idoc.querySelectorAll(".annotation-markdown-rendered").length,
        wv: idoc.querySelectorAll(".wv-md-preview").length,
        katex: idoc.querySelectorAll(".katex").length,
      },
    });
  } catch (e) { return "ERR: " + e.message; }
})()