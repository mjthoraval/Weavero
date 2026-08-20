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

/** Container for dynamically created XUL popups (panels, menupopups).
 *  Zotero 10's main window has NO #mainPopupSet -- the real container is
 *  the anonymous top-level <popupset> under <window> (verified live
 *  2026-08-19). A menupopup parked on documentElement renders INLINE
 *  (the bottom-left text-list incident); always prefer a popupset. The
 *  documentElement fallback remains for docs without one (reader
 *  iframe), where panels behave. */
export function wvPopupHost(doc: any): any {
    return doc.getElementById("mainPopupSet")
        || doc.querySelector("window > popupset")
        || doc.documentElement;
}

/** Hide any currently-showing native tooltip in `doc`. Overlays opened
 *  by CLICK (scope popups, mode menus, hovercards) otherwise render
 *  under the still-visible hover tooltip of the very control that was
 *  clicked -- the engine only retires it on mousemove, not on click
 *  (MJT 2026-08-20; recurring tooltip-engine family, see the mistakes
 *  ledger 2026-08-19/20 entries). Sweeps every <tooltip> element
 *  (html-tooltip plus Zotero's and Weavero's own) so it works in any
 *  chrome document. */
export function wvDismissTooltip(doc: any): void {
    try {
        for (const t of doc.querySelectorAll("tooltip")) {
            try {
                if (t.state === "open" || t.state === "showing") t.hidePopup();
            } catch (e) {}
        }
    } catch (e) {}
}
