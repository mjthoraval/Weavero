// Weavero's DOCUMENT LAYER: the pure part (doc layer Phase 1, 2026-11-24;
// design work/doc-layer-design-2026-11-24.md, approved by MJT 2026-11-24). The
// plugin side -- where the files live, when they are computed, the worker --
// is modules/doc-layer.ts.
//
// One file per PDF with Zotero's structure data (`.zotero-sdt-cache`): what
// Weavero corrected in it, computed once and read by every feature. Phase 1
// holds two components:
//  - `ol`, the outline: Weavero's extracted outline (lib/outline-build.ts,
//    called as it is, through lib/outline-sdt.ts wvOutlineFromSdt), and
//    Zotero's own two outlines beside it -- the PDF's own (`embedded`) and
//    Zotero's generated one (`zotero`) -- so the panel's source chip, the Eval
//    marks and a Zotero-vs-Weavero diff work from the layer alone (the builder
//    records no rule id per entry yet: Zotero's tree IS the outline's "was");
//  - `pl`, the page labels: Zotero's labels with Weavero's repairs, EVIDENCE
//    ONLY (lib/doc-layer-pl.ts; nothing on screen reads them).
// `q` (quality) and `tx` (text spacing) have no rules yet: their fingerprints
// exist so that the outline's chains through them already (section 3).
//
// Three versions (design 2.1): `v`, the file format; `src`, the stamp of what
// was read (the pack's and the PDF's size and time, the pack's versions, the
// PDF's hash, the parent item's title and creators, the UI word rule 16
// writes); `fp`, one fingerprint per component, CHAINED: a component's
// fingerprint includes its inputs' (ol <- pl, tx; tx <- q), so a page-label or
// spacing rule change recomputes the outline too, and an outline rule change
// leaves the page labels' bytes as they were.
//
// Pure: no Zotero, no window, no file. The worker (doc-layer-worker.ts) runs
// `wvDlComputeParts`; the main thread decides what is stale and assembles the
// file.

import { WvOlNode, WvOlMeta } from "./outline-build";
import { wvOutlineFromSdt } from "./outline-sdt";
import { WvDlPageLabels, wvDlPageLabels } from "./doc-layer-pl";

export const WV_DL_FORMAT = "weavero-doc-layer";
/** The file format this Weavero writes. A file of a HIGHER one (a newer
 *  Weavero wrote it) is stale here and computed again ("downgrades recompute
 *  too", MJT); so is a lower one. */
export const WV_DL_V = 1;

/** The components and their inputs (design section 3). */
export type WvDlComp = "q" | "tx" | "pl" | "ol";
export const WV_DL_DEPS: Record<WvDlComp, WvDlComp[]> = { q: [], tx: ["q"], pl: [], ol: ["pl", "tx"] };
/** The components Phase 1 stores (q and tx: fingerprints only). */
export const WV_DL_STORED: WvDlComp[] = ["pl", "ol"];

/** Every rule id, stable for ever and never reused (statistics from different
 *  builds stay comparable): `o1`-`o18` are the numbered rules in the header of
 *  lib/outline-build.ts, `o-rh` its running-header filter, `pl1` the
 *  page-label repair. Phase 1 records `pl1` per element; the outline's rules
 *  are named here for the evidence tools to come (Phase 2). */
export const WV_DL_RULES: Record<string, { c: WvDlComp; name: string; since: string }> = {
    o1: { c: "ol", name: "bylines out", since: "1.3.0" },
    o2: { c: "ol", name: "title lines out", since: "1.3.0" },
    o3: { c: "ol", name: "Part / Chapter / Section headings back", since: "1.3.0" },
    o4: { c: "ol", name: "one-character headings out", since: "1.3.0" },
    o5: { c: "ol", name: "Fart -> Part", since: "1.3.0" },
    o6: { c: "ol", name: "section words at the top", since: "1.3.0" },
    o7: { c: "ol", name: "unnumbered siblings up", since: "1.3.0" },
    o8: { c: "ol", name: "web links out", since: "1.3.0" },
    o9: { c: "ol", name: "numbering sequences", since: "1.3.0" },
    o10: { c: "ol", name: "out-of-sequence entries", since: "1.3.0" },
    o11: { c: "ol", name: "number-word chapters", since: "1.3.0" },
    o12: { c: "ol", name: "body sentences out", since: "1.3.0" },
    o13: { c: "ol", name: "reference entries out", since: "1.3.0" },
    o14: { c: "ol", name: "run-in headings", since: "1.3.0" },
    o15: { c: "ol", name: "cleaned bookmarks", since: "1.3.0" },
    o16: { c: "ol", name: "References entry", since: "1.3.0" },
    o17: { c: "ol", name: "lost spaces back", since: "1.3.0" },
    o18: { c: "ol", name: "Contents page", since: "1.3.0" },
    "o-rh": { c: "ol", name: "running headers out", since: "1.3.0" },
    pl1: { c: "pl", name: "label off the document's offset (first / last two pages)", since: "1.3.0" },
};

// ---- the file ------------------------------------------------------------------------

/** One outline entry, flat, in document order (design 2.1): its title, level
 *  (1 = top), page index and boxes, link. `x` keeps any other field a node
 *  carries, so the tree comes back exactly as the builder made it. */
export interface WvDlEntry { t: string; l: number; p?: number; r?: number[][]; pos?: any; u?: string; h?: string; x?: any }

export interface WvDlOutline {
    /** Weavero's extracted outline. */
    entries: WvDlEntry[];
    /** Zotero's generated outline as stored (empty when the PDF has its own). */
    zotero: WvDlEntry[];
    /** The PDF's own outline, as Zotero snapped it. */
    embedded: WvDlEntry[];
    /** What a rule kept on one signal alone (outline-build's notes). */
    notes?: string[];
    /** Every other field of lib/outline-sdt.ts's result (outline2.13's
     *  `embeddedFirst`...), kept as the builder gave it. */
    x?: any;
}

export interface WvDlSrc {
    pack: { size: number; mtime: number; packVersion: number; schema: string; processor: any };
    pdf: { hash: string; size: number; mtime: number };
    /** The parent item's title and creators (wvDlMetaSig). */
    meta: string;
    /** The word rule 16 writes, in the UI's language. */
    lang: string;
}

export interface WvDlDoc {
    format: string;
    v: number;
    doc: { lib: string; key: string; att: number };
    src: WvDlSrc;
    fp: Partial<Record<WvDlComp, string>>;
    built: { at: number; by: string; trigger: string; ms?: number };
    pageLabels?: WvDlPageLabels;
    outline?: WvDlOutline;
    [k: string]: any;
}

// ---- fingerprints ----------------------------------------------------------------------

function fnv(s: string): string {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36) + ":" + s.length.toString(36);
}

/** Each component's fingerprint from its own code's (`code[c]`, a build-time
 *  source hash; "" for a component without rules), chained through its inputs
 *  (WV_DL_DEPS): fp(c) = c + H(code(c), fp(inputs)). */
export function wvDlChainFps(code: Partial<Record<WvDlComp, string>>): Record<WvDlComp, string> {
    const out: Partial<Record<WvDlComp, string>> = {};
    const fp = (c: WvDlComp): string => {
        const had = out[c];
        if (had) return had;
        const s = c + "|" + (code[c] || "-") + "|" + WV_DL_DEPS[c].map((d) => d + "=" + fp(d)).join(",");
        return (out[c] = c + ":" + fnv(s));
    };
    for (const c of Object.keys(WV_DL_DEPS) as WvDlComp[]) fp(c);
    return out as Record<WvDlComp, string>;
}

/** The signature of the parent item's title and creators (the outline rules
 *  read them: bylines, title lines). The UI word of rule 16 is `src.lang`. */
export function wvDlMetaSig(meta: WvOlMeta | null | undefined): string {
    const m = meta || {};
    return fnv(JSON.stringify({ t: String(m.title || ""), c: (m.creators || []).map((c: any) => [String(c.lastName || ""), String(c.firstName || ""), String(c.name || "")]) }));
}

// ---- staleness -------------------------------------------------------------------------

/** What the main thread knows NOW, from stats alone: the pack's and the PDF's
 *  size and time, this Zotero's pack format, the metadata, the fingerprints. */
export interface WvDlNow {
    pack: { size: number; mtime: number };
    pdf: { size: number; mtime: number };
    /** This Zotero's SDT_PACK_VERSION and SDT_SCHEMA_VERSION. */
    format: { pack: number; schema: string };
    meta: string;
    lang: string;
    fp: Record<WvDlComp, string>;
}

const major = (v: any) => Number(String(v).split(".")[0]);

/** The stored components that must be computed again for `doc` to describe the
 *  file now: every one when the file is not this format's (`v`), when the pack
 *  or the PDF changed, or when the pack's format is not the one this Zotero
 *  reads; else the ones whose fingerprint moved, plus the outline when the
 *  title, creators or UI word did. Empty: the file is fresh. */
export function wvDlStale(doc: any, now: WvDlNow): WvDlComp[] {
    const all = WV_DL_STORED.slice();
    if (!doc || typeof doc !== "object" || doc.format !== WV_DL_FORMAT || doc.v !== WV_DL_V) return all;
    const s = doc.src;
    if (!s || !s.pack || !s.pdf) return all;
    if (s.pack.size !== now.pack.size || s.pack.mtime !== now.pack.mtime) return all;
    if (s.pdf.size !== now.pdf.size || s.pdf.mtime !== now.pdf.mtime) return all;
    if (s.pack.packVersion !== now.format.pack || major(s.pack.schema) !== major(now.format.schema)) return all;
    const out: WvDlComp[] = [];
    const fp = doc.fp || {};
    for (const c of WV_DL_STORED) {
        const part = c === "pl" ? doc.pageLabels : doc.outline;
        if (!part || fp[c] !== now.fp[c]) out.push(c);
    }
    if (!out.includes("ol") && (s.meta !== now.meta || s.lang !== now.lang)) out.push("ol");
    return out;
}

// ---- the outline, flat and back --------------------------------------------------------

const NODE_KEYS = new Set(["title", "url", "position", "href", "items"]);

/** A tree (WvOlNode[]) as flat entries in document order. */
export function wvDlFlatten(tree: WvOlNode[]): WvDlEntry[] {
    const out: WvDlEntry[] = [];
    const walk = (list: WvOlNode[], level: number) => {
        for (const n of list || []) {
            const e: WvDlEntry = { t: String(n.title == null ? "" : n.title), l: level };
            const pos: any = n.position;
            if (pos) {
                const keys = Object.keys(pos);
                if (keys.length === 2 && Number.isInteger(pos.pageIndex) && Array.isArray(pos.rects)) { e.p = pos.pageIndex; e.r = pos.rects; }
                else e.pos = pos;
            }
            if (n.url != null) e.u = n.url;
            if (n.href != null) e.h = n.href;
            const extra: any = {};
            let has = false;
            for (const k of Object.keys(n)) if (!NODE_KEYS.has(k)) { extra[k] = (n as any)[k]; has = true; }
            if (has) e.x = extra;
            out.push(e);
            walk(n.items, level + 1);
        }
    };
    walk(tree, 1);
    return out;
}

/** Flat entries back as the tree the builder made. */
export function wvDlUnflatten(entries: WvDlEntry[]): WvOlNode[] {
    const root: WvOlNode[] = [];
    const parents: WvOlNode[][] = [root];
    for (const e of entries || []) {
        const position = e.pos ? e.pos : (Number.isInteger(e.p) && Array.isArray(e.r) ? { pageIndex: e.p as number, rects: e.r } : null);
        const node: WvOlNode = Object.assign({ title: e.t, url: e.u != null ? e.u : null, position, href: e.h != null ? e.h : null, items: [] as WvOlNode[] }, e.x || {});
        const lv = Math.max(1, Math.min(e.l | 0, parents.length));
        parents.length = lv;
        parents[lv - 1].push(node);
        parents[lv] = node.items;
    }
    return root;
}

/** The outlines the panel reads (lib/outline-sdt.ts WvOlSdt) from a layer:
 *  the three trees, the notes and whatever else the builder's result held. */
export function wvDlOutlineSdt(o: WvDlOutline): { embedded: WvOlNode[]; zotero: WvOlNode[]; extracted: WvOlNode[]; notes: string[]; [k: string]: any } {
    return Object.assign({}, o.x || {}, { embedded: wvDlUnflatten(o.embedded), zotero: wvDlUnflatten(o.zotero), extracted: wvDlUnflatten(o.entries), notes: Array.isArray(o.notes) ? o.notes.slice() : [] });
}

/** The outline component of lib/outline-sdt.ts's result (WvOlSdt). */
export function wvDlOutlineOf(o: any): WvDlOutline {
    const out: WvDlOutline = { entries: wvDlFlatten(o.extracted || []), zotero: wvDlFlatten(o.zotero || []), embedded: wvDlFlatten(o.embedded || []), notes: Array.isArray(o.notes) ? o.notes.slice() : [] };
    const x: any = {};
    let has = false;
    for (const k of Object.keys(o || {})) if (!["extracted", "zotero", "embedded", "notes"].includes(k) && o[k] !== undefined) { x[k] = o[k]; has = true; }
    if (has) out.x = x;
    return out;
}

// ---- computing the components (the worker runs this) ----------------------------------

export interface WvDlComputeInput {
    /** The components to compute. */
    want: WvDlComp[];
    meta: WvOlMeta;
    /** The PDF's hash now (attachmentHash): a pack of another file is not read. */
    hash: string;
    /** This Zotero's pack format (lib/sdt.ts wvSdtMeta). */
    format: { pack: number; schema: string };
}

export interface WvDlComputed {
    unusable?: string;
    pack?: { packVersion: number; schema: string; processor: any; hash: string };
    pageLabels?: WvDlPageLabels;
    outline?: WvDlOutline;
    ms?: number;
}

/** The components `input.want` of an opened pack (`rd`), validated as Zotero
 *  validates a pack (sdt.js _validateBytes): pack and schema versions, a PDF
 *  processor, the PDF's own hash. `{unusable}` when it is not usable. */
export async function wvDlComputeParts(rd: any, input: WvDlComputeInput, now: () => number = Date.now): Promise<WvDlComputed> {
    const t0 = now();
    if (!rd || !rd.header) return { unusable: "no pack" };
    if (rd.header.packVersion !== input.format.pack || major(rd.header.schemaVersion) !== major(input.format.schema)) return { unusable: "pack format " + rd.header.packVersion + "/" + rd.header.schemaVersion };
    const md = await rd.getMetadata();
    if (!md || !md.processor || md.processor.type !== "pdf") return { unusable: "not a PDF's pack" };
    if (!input.hash || !md.source || md.source.hash !== input.hash) return { unusable: "another file's pack" };
    const out: WvDlComputed = { pack: { packVersion: rd.header.packVersion, schema: String(rd.header.schemaVersion), processor: md.processor.version != null ? md.processor.version : null, hash: String(md.source.hash) } };
    if (input.want.includes("pl")) {
        const cat = await rd.getCatalog();
        out.pageLabels = wvDlPageLabels((cat && cat.pages) || []);
    }
    if (input.want.includes("ol")) out.outline = wvDlOutlineOf(await wvOutlineFromSdt(rd, input.meta || {}));
    out.ms = now() - t0;
    return out;
}

/** Open a pack's bytes with Zotero's own pack module and pako (the bundled
 *  `structured-document-text.js`), as sdt.js _openPack opens one. */
export async function wvDlOpenPack(mod: any, pako: any, bytes: any): Promise<any> {
    const u8: Uint8Array = typeof bytes.byteOffset === "number" ? bytes : new Uint8Array(bytes);
    const source = { byteLength: u8.byteLength, read: async (o: number, l: number) => u8.buffer.slice(u8.byteOffset + o, u8.byteOffset + o + l) };
    return mod.openStructuredDocumentTextPack(source, { inflate: (b: any) => pako.inflateRaw(b) });
}

/** The file for `parts` computed now over `prev` (its components not in
 *  `parts` kept as they were, byte for byte). */
export function wvDlAssemble(prev: WvDlDoc | null, parts: WvDlComputed, ctx: { doc: WvDlDoc["doc"]; src: WvDlSrc; fp: Record<WvDlComp, string>; by: string; trigger: string }): WvDlDoc {
    const keep = prev && prev.format === WV_DL_FORMAT && prev.v === WV_DL_V ? prev : null;
    const fp: Partial<Record<WvDlComp, string>> = {};
    const d: WvDlDoc = { format: WV_DL_FORMAT, v: WV_DL_V, doc: ctx.doc, src: ctx.src, fp, built: { at: Date.now(), by: ctx.by, trigger: ctx.trigger } };
    if (typeof parts.ms === "number" && Number.isFinite(parts.ms)) d.built.ms = Math.round(parts.ms);
    if (parts.pageLabels) { d.pageLabels = parts.pageLabels; fp.pl = ctx.fp.pl; }
    else if (keep && keep.pageLabels) { d.pageLabels = keep.pageLabels; fp.pl = keep.fp && keep.fp.pl; }
    if (parts.outline) { d.outline = parts.outline; fp.ol = ctx.fp.ol; }
    else if (keep && keep.outline) { d.outline = keep.outline; fp.ol = keep.fp && keep.fp.ol; }
    fp.q = ctx.fp.q; fp.tx = ctx.fp.tx;
    return d;
}
