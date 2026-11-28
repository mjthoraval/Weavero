// The document layer's worker (doc layer Phase 1, 2026-11-24): a ChromeWorker
// of Weavero's own that opens a PDF's structure-data pack and computes the
// layer's components (lib/doc-layer.ts wvDlComputeParts) OFF the main thread.
// Weavero's outline builder is one synchronous call (lib/outline-build.ts
// wvOutlineBuild): on the main thread a long book froze Zotero for seconds
// (the design study: 4.1 s for one 159-page book in Node), and MJT's limit is
// a pause of ~50 ms.
//
// The pack is opened with ZOTERO's own pack module and pako, loaded here from
// Zotero's resources (the files the main window's `require` gives lib/sdt.ts:
// `structured-document-text.js` is a CommonJS bundle, pako a UMD one), so the
// pack is read exactly as Zotero reads it.
//
// Protocol: {id, bytes: ArrayBuffer (transferred), input: WvDlComputeInput}
// -> {id, ok: true, out: WvDlComputed} | {id, ok: false, error}. A message
// {op: "ping"} answers {op: "pong"} once the modules load.

import { wvDlComputeParts, wvDlOpenPack } from "./lib/doc-layer";

declare const self: any;
declare function importScripts(...urls: string[]): void;

const PAKO_URL = "resource://zotero/pako.js";
const MOD_URL = "resource://zotero/document-worker/structured-document-text.js";

let mods: { mod: any; pako: any } | null = null;

function load(): { mod: any; pako: any } {
    if (mods) return mods;
    // pako first, with no `module` in sight: its UMD header then sets self.pako.
    importScripts(PAKO_URL);
    const pako = self.pako;
    // The pack module assigns `module.exports`.
    self.module = { exports: {} };
    self.exports = self.module.exports;
    try { importScripts(MOD_URL); }
    finally {
        const m = self.module;
        delete self.module; delete self.exports;
        mods = { mod: m && m.exports, pako };
    }
    if (!mods.mod || typeof mods.mod.openStructuredDocumentTextPack !== "function" || !mods.pako || typeof mods.pako.inflateRaw !== "function") {
        mods = null;
        throw new Error("Zotero's pack module did not load");
    }
    return mods;
}

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

self.onmessage = async (ev: any) => {
    const m = (ev && ev.data) || {};
    if (m.op === "ping") {
        try { load(); self.postMessage({ op: "pong", ok: true }); }
        catch (e: any) { self.postMessage({ op: "pong", ok: false, error: String(e) }); }
        return;
    }
    try {
        const { mod, pako } = load();
        const t0 = now();
        const rd = await wvDlOpenPack(mod, pako, m.bytes);
        const out = await wvDlComputeParts(rd, m.input, now);
        self.postMessage({ id: m.id, ok: true, out, msAll: now() - t0 });
    }
    catch (e: any) {
        self.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) });
    }
};
