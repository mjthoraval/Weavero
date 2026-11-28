// Zotero's structured document text (`Zotero.SDT`, xpcom/sdt.js), read ONE way
// everywhere Weavero reads it: the reader's reference list (refs.ts), the
// library pane's cache reader (refs.ts) and Cited by (cited-by.ts).
//
// zotero#6012 (semantic search, branch semantic-search) REMOVES
// `Zotero.SDT.getReader`; Weavero was its only caller (canary run 2026-11-22,
// work/canary-2026-11-21.md section 3: every reader-side References list came
// out empty). `getPack` stays on every Zotero that has SDT (10.0.8, 11 beta.5,
// main, #6012): it returns the pack's bytes, and getReader was nothing more than
// those bytes opened with the bundled module (main's sdt.js getReader ->
// _openPack(new Uint8Array(bytes))). So the bytes come from getPack and are
// opened here with the module Zotero opens them with; getReader is the path
// only where getPack is missing. Feature-tested, never version-tested.

declare const Zotero: any;

const MOD_URL = "resource://zotero/document-worker/structured-document-text.js";
const META_URL = "resource://zotero/document-worker/metadata.json";

/** The bundled pack module and pako, as a main window's loader gives them. */
export interface WvSdtModule { mod: any; pako: any; }

/** Per window: a closed window's loader is never kept (no window held). */
const mods: WeakMap<object, WvSdtModule | null> = new WeakMap();
let meta: any = null;

/** The pack module of this Zotero, or null when it has none (Zotero 10 before
 *  10.0.8). */
export function wvSdtModule(): WvSdtModule | null {
    try {
        if (!Zotero.SDT) return null;
        const w: any = Zotero.getMainWindow();
        if (!w || typeof w.require !== "function") return null;
        if (mods.has(w)) return mods.get(w) || null;
        let got: WvSdtModule | null = null;
        try {
            const mod = w.require(MOD_URL);
            const pako = w.require("pako");
            if (mod && typeof mod.openStructuredDocumentTextPack === "function" && pako) got = { mod, pako };
        }
        catch (e) { got = null; }
        mods.set(w, got);
        return got;
    }
    catch (e) { return null; }
}

/** The document worker's versions (SDT_PACK_VERSION, SDT_SCHEMA_VERSION, ...). */
export async function wvSdtMeta(): Promise<any> {
    if (!meta) meta = JSON.parse(await Zotero.File.getContentsFromURLAsync(META_URL));
    return meta;
}

/** A pack reader over `bytes` (a Uint8Array, or an ArrayBuffer as getPack
 *  returns it), opened as sdt.js _openPack opens one; null without the module. */
export async function wvSdtOpen(bytes: any): Promise<any> {
    const S = wvSdtModule();
    if (!S || !bytes) return null;
    const u8: any = typeof bytes.byteOffset === "number" ? bytes : new Uint8Array(bytes);
    const source = { byteLength: u8.byteLength, read: async (o: number, l: number) => u8.buffer.slice(u8.byteOffset + o, u8.byteOffset + o + l) };
    return S.mod.openStructuredDocumentTextPack(source, { inflate: (b: any) => S.pako.inflateRaw(b) });
}

/** Whether a pack's format is the one this Zotero reads: the pack version and
 *  the schema's major version (sdt.js _validateBytes). */
export async function wvSdtVersionOk(rd: any): Promise<boolean> {
    const m = await wvSdtMeta();
    const major = (v: any) => Number(String(v).split(".")[0]);
    return !!rd && !!rd.header && rd.header.packVersion === m.SDT_PACK_VERSION && major(rd.header.schemaVersion) === major(m.SDT_SCHEMA_VERSION);
}

/** The pack reader of attachment `id` through Zotero (it builds a missing
 *  pack, sharing one build per item with the reader): `getPack` + the module,
 *  else `getReader` where this Zotero has no getPack; null when there is none. */
export async function wvSdtReader(id: number, opts?: any): Promise<any> {
    const SDT = Zotero.SDT;
    if (!SDT) return null;
    if (typeof SDT.getPack === "function" && wvSdtModule()) {
        const r = await SDT.getPack(id, opts || {});
        if (!r || !r.ok || !r.bytes) return null;
        return wvSdtOpen(r.bytes);
    }
    if (typeof SDT.getReader === "function") return SDT.getReader(id, opts || {});
    return null;
}
