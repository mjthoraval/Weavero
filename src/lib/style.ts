// Weavero stylesheets in Zotero documents.
//
// A skip-if-exists guard (`if (doc.getElementById(id)) return;`) keeps the
// PREVIOUS build's rules alive after a hot upgrade, and a version constant
// only works while someone remembers to bump it (src-ts.md "sheet replace";
// survey 2026-10-06 §3.2, ~15 injection sites in four spellings). One
// helper: find or create the element, write the text when it differs.

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** Inject (or refresh) the stylesheet `id` in `doc`. Idempotent and cheap:
 *  the text is written only when it changed, so an "ensure" pass that runs
 *  on every apply costs a string compare. `parent` overrides the default
 *  host (`doc.head`, else the document element -- XUL documents have no
 *  head). Returns the element, or null without a document. */
export function wvInjectStyle(doc: any, id: string, css: string, parent?: any): any {
    if (!doc) return null;
    let st: any = doc.getElementById(id);
    if (st && st.localName !== "style") { try { st.remove(); } catch (e) {} st = null; }
    if (!st) {
        st = doc.createElementNS(HTML_NS, "style");
        st.id = id;
        (parent || doc.head || doc.documentElement).appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
    return st;
}

/** Remove the stylesheet `id` from `doc` if present. */
export function wvRemoveStyle(doc: any, id: string): void {
    try {
        const st = doc && doc.getElementById(id);
        if (st) st.remove();
    }
    catch (e) {}
}
