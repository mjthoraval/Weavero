// Small DOM helpers that must survive a Gecko version jump.

/** The window a DOM node belongs to, on every Zotero we support.
 *
 *  Firefox 153 — the platform behind Zotero 11 — **renamed `ownerGlobal` to
 *  `documentGlobal`** and moved it from EventTarget to Node (Bug 2033243),
 *  ported in zotero/zotero as `fx153: ownerGlobal -> documentGlobal`. On that
 *  platform `node.ownerGlobal` is simply `undefined`, so every bare use throws
 *  at the first property access off it — and Weavero had sixteen.
 *
 *  Order matters: the NEW name first, so this keeps working once the rename is
 *  the only spelling; then the old name for Zotero 9/10 (Firefox 115/140);
 *  then `defaultView`, which covers a Document passed in directly and has been
 *  correct on every version. Returns null rather than throwing, because every
 *  caller here sits in Zotero's UI paths, where a Weavero failure must never
 *  break the app.
 *
 *  Landing this BEFORE the platform moves is deliberate: it behaves
 *  identically on Zotero 9 and 10, so it can be verified against the runtime
 *  we actually have instead of against a tree in mid-migration. */
export function winOf(node: any): any {
    try {
        if (!node) return null;
        return node.documentGlobal
            || node.ownerGlobal
            || node.defaultView                                    // a Document
            || (node.ownerDocument && node.ownerDocument.defaultView)
            || null;
    }
    catch (e) {
        return null;
    }
}
