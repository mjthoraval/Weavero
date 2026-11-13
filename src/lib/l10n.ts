// Weavero's own strings in the UI it builds (localisation slice 2, menus,
// 2026-11-11; zotero/zotero CLAUDE.md: "all new strings in Fluent .ftl").
// Every message lives in src/locale/en-US/weavero.ftl, which Zotero registers
// with the plugin's locale/ directory at startup (xpcom/plugins.js
// registerLocales) -- the en-US file under EVERY UI locale until a
// translation exists, so a count reads under that locale's plural rules: a
// label that differs for exactly one item selects on `[1]`, not `[one]`
// (French's "one" also takes 0, Japanese has none).
//
// Two ways a string reaches the screen:
//  - `wvL10n(el, id, args)`: an element Weavero builds or relabels gets
//    data-l10n-id / data-l10n-args, after weavero.ftl is linked into its
//    document, and Fluent owns its label from then on, as for Zotero's own
//    menus (zoteroPane.js buildCollectionContextMenu). The label is also
//    written at once from the same message: measured on 11.0-beta.4
//    (2026-11-11), Fluent has translated an item labelled in `popupshowing`
//    by `popupshown` anyway (test/menus-l10n.spec.js checks it on every
//    Zotero the suite runs on), but code that reads a label right after
//    building it, and a document whose Fluent is not ready, then see the
//    text, not nothing.
//  - `wvStr(id, args, attr)`: the text itself, synchronously, where Zotero
//    takes a plain string and renders it itself (the reader's context menus:
//    `append({ label })`, xpcom/reader.js _openContextMenu).
// A label never FINDS an element: Weavero keys its own entries on an id, a
// class or a data-wv-* attribute set where they are built, and Zotero's on
// Zotero's own string (Zotero.getString / its Fluent id), which is what
// Zotero itself wrote (test/menus-l10n.spec.js, "in another language").

export const WV_FTL = "weavero.ftl";
const FTL_LINK = `link[rel="localization"][href="${WV_FTL}"]`;
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

let syncL10n: any = null;
/** The suite's stand-in texts (`wvL10nStub`), ahead of the file. */
let stub: ((id: string, args?: any) => any) | null = null;

function localization(): any {
    if (!syncL10n) {
        // `Localization` is a global of the plugin's sandbox (plugins.js
        // _loadScope, Zotero 9 and later); synchronous, as Zotero.ftl is
        // (xpcom/intl.js).
        const L: any = (globalThis as any).Localization;
        syncL10n = new L([WV_FTL], true);
    }
    return syncL10n;
}

function stubbed(id: string, args?: any): string | null {
    if (!stub || !id.startsWith("weavero-")) return null;
    try {
        const v = stub(id, args);
        return v == null ? null : String(v);
    }
    catch (e) { return null; }
}

/** The formatted message (weavero.ftl, or Zotero's for another id), or null. */
function message(id: string, args?: any): any {
    try {
        const L = id.startsWith("weavero-") ? localization() : (Zotero as any).ftl;
        const [m] = L.formatMessagesSync([{ id, args: args || null }]);
        return m || null;
    }
    catch (e) {
        Zotero.debug("[Weavero] l10n " + id + ": " + e);
        return null;
    }
}

/** A message's text: its `attr` attribute when it has one (`label` by
 *  default), else its value; `attr = null` asks for the value. A missing
 *  message answers its id, so the gap shows instead of an empty entry. */
export function wvStr(id: string, args?: any, attr: string | null = "label"): string {
    const s = stubbed(id, args);
    if (s != null) return s;
    const m = message(id, args);
    if (!m) return id;
    if (attr) {
        for (const a of m.attributes || []) if (a.name === attr) return a.value;
    }
    return m.value != null ? m.value : id;
}

/** One attribute of a message, or null when it has none: a menu entry's
 *  `.acceltext` when it is words ("Middle-click"), which Weavero writes
 *  itself -- Fluent localizes only the attributes Gecko lists for the
 *  element (label, accesskey, tooltiptext...), and leaves acceltext alone. */
export function wvAttr(id: string, attr: string, args?: any): string | null {
    const m = message(id, args);
    if (!m) return null;
    for (const a of m.attributes || []) if (a.name === attr) return a.value;
    return null;
}

/** Link weavero.ftl into `doc` through its window's `MozXULElement`, as the
 *  wiring table's `backlinks-ftl` step does for every main window. True when
 *  the document can translate Weavero's ids. destroy() unlinks the file from
 *  every window (`_wvBlRemoveFtl`), before Zotero unregisters it. */
export function wvFtlEnsure(doc: any): boolean {
    try {
        if (!doc) return false;
        if (doc.l10n && doc.querySelector(FTL_LINK)) return true;
        const win = doc.defaultView;
        const M = win && win.document === doc && win.MozXULElement;
        if (M && typeof M.insertFTLIfNeeded === "function") M.insertFTLIfNeeded(WV_FTL);
        return !!(doc.l10n && doc.querySelector(FTL_LINK));
    }
    catch (e) { return false; }
}

/** Point `el` at a Fluent message -- weavero.ftl's (`weavero-…`), or one of
 *  Zotero's (zotero.ftl is linked in Zotero's windows) -- and write its text
 *  at once. Without Fluent in the document, only the text. */
export function wvL10n(el: any, id: string, args?: any): any {
    if (!el) return el;
    const doc = el.ownerDocument;
    const s = stubbed(id, args);
    if (s != null) {
        try { el.removeAttribute("data-l10n-id"); el.removeAttribute("data-l10n-args"); } catch (e) {}
        el.setAttribute("label", s);
        return el;
    }
    // A message this Localization lacks (one of Zotero's that its sync
    // bundle does not hold, e.g. menubar.ftl's) leaves the label as it is:
    // the document's Fluent writes it, or a fallback set before stays.
    const m = message(id, args);
    if (m) {
        const attrs = m.attributes || [];
        for (const a of attrs) el.setAttribute(a.name, a.value);
        if (!attrs.length && m.value != null) {
            if (el.namespaceURI === XUL_NS) el.setAttribute("label", m.value);
            else el.textContent = m.value;
        }
    }
    const fluent = doc && doc.l10n && (!id.startsWith("weavero-") || wvFtlEnsure(doc));
    if (fluent) doc.l10n.setAttributes(el, id, args || undefined);
    else {
        try { el.removeAttribute("data-l10n-id"); el.removeAttribute("data-l10n-args"); } catch (e) {}
    }
    return el;
}

/** A label that is DATA -- a window's, group's, library's or session's
 *  name, an item's title -- with no word of Weavero's: written as it is and
 *  marked so (`data-wv-data-label`, which test/menus-l10n.spec.js reads). */
export function wvDataLabel(el: any, text: string): any {
    if (!el) return el;
    try { el.removeAttribute("data-l10n-id"); el.removeAttribute("data-l10n-args"); } catch (e) {}
    el.setAttribute("label", text);
    el.setAttribute("data-wv-data-label", "true");
    return el;
}

/** A value of Zotero's own Fluent (Zotero.ftl: zotero.ftl, reader.ftl...),
 *  for a reused id that is a value, not a .label (general-show-in-library):
 *  such an id cannot go on a menuitem as data-l10n-id. "" when missing. */
export function wvZoteroText(id: string, args?: any): string {
    // No args: undefined, never null ("Argument 2 is not an object").
    try { return String((Zotero as any).ftl.formatValueSync(id, args || undefined) || ""); }
    catch (e) { return ""; }
}

/** A label that is ZOTERO's own word for the same thing, read through
 *  Zotero (Zotero.getString / Zotero.ftl): it follows Zotero's language
 *  already. Marked `data-wv-zotero-label` for test/menus-l10n.spec.js. */
export function wvZoteroLabel(el: any, text: string): any {
    if (!el) return el;
    try { el.removeAttribute("data-l10n-id"); el.removeAttribute("data-l10n-args"); } catch (e) {}
    el.setAttribute("label", text);
    el.setAttribute("data-wv-zotero-label", "true");
    return el;
}

/** The suite's stand-ins: a function (id, args) -> text, or a map; null
 *  clears. Only weavero.ftl ids are stubbed. */
export function wvL10nStub(fn: any) {
    if (typeof fn === "function") stub = fn;
    else if (fn) stub = (id: string) => (Object.prototype.hasOwnProperty.call(fn, id) ? fn[id] : null);
    else stub = null;
}

/** Drop the cached Localization (destroy(): Zotero unregisters the file
 *  after shutdown, plugins.js unregisterLocales). */
export function wvL10nRelease() {
    syncL10n = null;
    stub = null;
}
