// Zotero API shapes that are changing upstream, read one way (feature tests,
// never version tests). Each names the PR that changes it and the canary run
// that measured it (work/canary-2026-11-21.md).

declare const Zotero: any;

/** The reader (or note editor) a `Zotero.Reader.open` / `Zotero.Notes.open` /
 *  `ZoteroPane.openNote` call resolved with. zotero#6080 (sandboxed plugins)
 *  makes them resolve with `{ instance, tabID, win }` (xpcom/reader.js open(),
 *  data/notes.js open(); canary 40b5f3a1), where Zotero 10 and 11 beta.5 resolve
 *  with the instance itself. A reader has `navigate`, the wrapper has not. */
export function wvOpenedInstance(r: any): any {
    try {
        if (r && typeof r === "object" && "instance" in r && "win" in r && typeof r.navigate !== "function") return r.instance;
    }
    catch (e) {}
    return r;
}

/** Whether this Zotero NUKES a plugin's scope after its shutdown: zotero#6080
 *  runs every plugin, legacy ones included, in a sandbox of its own and nukes
 *  it 10 s after unload (xpcom/plugins/sandbox.mjs), so every object the
 *  instance made and left on Zotero, a window or a document dies with it. The
 *  PR's plugin model is told by its `Zotero.Plugins.getBaseURI` (plugins.js;
 *  canary 40b5f3a1); Zotero 10 and 11 beta.5 have no such call. */
export function wvScopeNukedAtUnload(): boolean {
    try {
        const P = Zotero.Plugins;
        return !!P && typeof P.getBaseURI === "function";
    }
    catch (e) { return false; }
}

/** Plain data only -- arrays, plain objects, strings, numbers, booleans,
 *  null -- that a JSON round trip keeps as it is (bounded depth). */
export function wvIsPlainData(v: any, depth = 0): boolean {
    if (v === null) return true;
    const t = typeof v;
    if (t === "string" || t === "boolean") return true;
    if (t === "number") return Number.isFinite(v);
    if (t !== "object" || depth > 8) return false;
    try {
        if (Array.isArray(v)) return v.every((x: any) => x !== undefined && wvIsPlainData(x, depth + 1));
        const proto = Object.getPrototypeOf(v);
        if (proto !== null && Object.getPrototypeOf(proto) !== null) return false;   // a class instance, a Map, a Set, a node
        if (proto !== null && typeof proto.hasOwnProperty !== "function") return false;
        if (Object.prototype.toString.call(v) !== "[object Object]") return false;
        for (const k of Object.keys(v)) { if (v[k] !== undefined && !wvIsPlainData(v[k], depth + 1)) return false; }
        return true;
    }
    catch (e) { return false; }
}

/** The command of Zotero's own configurable Ctrl/Cmd+Shift+`ch` shortcut
 *  ("newNote"), or null. `Zotero.Keys.getCommand(ch)` where it exists (Zotero
 *  7 to 11 beta.5); zotero#6080 removes Zotero.Keys for `Zotero.Shortcuts`
 *  (xpcom/shortcuts.js: registrations `zotero-<prefKey>` on the mainWindow
 *  target, combos from `normalizeCombo`; canary 40b5f3a1). */
export function wvZoteroAccelShiftCommand(ch: string): string | null {
    if (!ch) return null;
    try {
        const K = Zotero.Keys;
        if (K && typeof K.getCommand === "function") return K.getCommand(ch) || null;
    }
    catch (e) {}
    try {
        const S = Zotero.Shortcuts;
        if (!S || typeof S.normalizeCombo !== "function") return null;
        const combo = S.normalizeCombo(ch, ["accel", "shift"]);
        if (!combo) return null;
        const regs = S._registrations;
        if (regs && typeof regs.values === "function") {
            for (const r of regs.values()) {
                const id = r && String(r.id || "");
                if (r && r.combo === combo && /^zotero-/.test(id) && (!r.targets || typeof r.targets.has !== "function" || r.targets.has("mainWindow"))) {
                    return id.replace(/^zotero-/, "").replace(/-alt$/, "");
                }
            }
        }
        if (typeof S.isRegistered === "function" && S.isRegistered(combo, ["mainWindow"])) return "shortcut";
    }
    catch (e) {}
    return null;
}
