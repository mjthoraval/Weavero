// The PAGE-LABEL component of the document layer (doc layer Phase 1,
// 2026-11-24; design work/doc-layer-design-2026-11-24.md sections 2-3).
// Zotero's page labels (`catalog.pages[].label` of the structure data) with
// the repairs Weavero's rules make, each with its rule id (`pv`) and Zotero's
// value (`was`).
//
// EVIDENCE ONLY (MJT 2026-11-24, "Evidence only"): the repairs are stored in
// the layer for statistics and a report to Zotero. Nothing Weavero shows reads
// them -- the Outline (rule 18 included), bookmarks and every other display
// keep ZOTERO's labels, which stay readable in the pack. Annotations and the
// reader's page box show Zotero's labels, and a repaired one beside them would
// be a second truth.
//
// Rule pl1 (the design study's prototype, scored on the test base's answer
// key: 85 PDFs whose Pages field spans the PDF, 19 pages changed, 19 right, no
// document made worse): Zotero's longest-run inference (document-worker
// page-label.js) takes a year, a volume or a page count printed on the first
// or last page for its label ("2024", "55", "8"). When the numeric labels of a
// document follow ONE offset to the page index (at least 3 of them, 80 % on
// it), a numeric label off that offset on the first two or the last two pages
// goes back on it. A non-numeric label ("-" on a cover, Roman front matter) is
// never touched, nor a page whose repaired number would be below 1.
//
// Pure: no Zotero, no window. It runs in the layer's worker (doc-layer-worker.ts).

/** One repaired label: page index `i`, Zotero's label `was`, the layer's `to`. */
export interface WvDlLabelChange { i: number; to: string; was: string; pv: string }

/** The component as stored: Zotero's labels all kept, or the changed pages only. */
export type WvDlPageLabels = { same: true } | { changes: WvDlLabelChange[] };

/** Zotero's label of each page ("" without one). */
export function wvDlLabelsOf(pages: any[]): string[] {
    return (Array.isArray(pages) ? pages : []).map((p: any) => (p && p.label != null ? String(p.label) : ""));
}

/** Rule pl1 over Zotero's labels (`wvDlLabelsOf`). */
export function wvDlLabelRepairs(labels: string[]): WvDlLabelChange[] {
    const n = labels.length;
    const offs = new Map<number, number>();
    let numeric = 0;
    labels.forEach((l, i) => { if (/^\d+$/.test(l)) { numeric++; const o = Number(l) - i; offs.set(o, (offs.get(o) || 0) + 1); } });
    if (numeric < 3) return [];
    let best = 0, bestN = 0;
    for (const [o, c] of offs) if (c > bestN) { best = o; bestN = c; }
    if (bestN < 0.8 * numeric) return [];
    const out: WvDlLabelChange[] = [];
    labels.forEach((l, i) => {
        if (!/^\d+$/.test(l) || Number(l) - i === best) return;
        if (i > 1 && i < n - 2) return;
        if (best + i < 1) return;
        out.push({ i, to: String(best + i), was: l, pv: "pl1" });
    });
    return out;
}

/** The component for a pack's `catalog.pages`. */
export function wvDlPageLabels(pages: any[]): WvDlPageLabels {
    const ch = wvDlLabelRepairs(wvDlLabelsOf(pages));
    return ch.length ? { changes: ch } : { same: true };
}
