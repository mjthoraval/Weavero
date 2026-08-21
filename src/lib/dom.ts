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

/** True if a XUL element is hidden or collapsed, on every Zotero we support.
 *
 *  Firefox 153 made `hidden`/`collapsed` (and `selected`/`disabled`/`checked`)
 *  **boolean XUL attributes matched on presence alone**, so `getAttribute()`
 *  returns `""` and the once-idiomatic `=== "true"` test is FALSE while the
 *  element is genuinely hidden. The reverse trap also exists: measured on
 *  2026-08-21, `toggleAttribute("collapsed", true)` sets `.collapsed === true`
 *  on Zotero 11 but leaves it **false** on Zotero 10, which only honours the
 *  literal `"true"`. So neither the property alone nor the string test alone is
 *  correct on both.
 *
 *  Presence with any value other than "false" means hidden -- that covers the
 *  Zotero 11 empty-string form, the legacy `"true"` form, and still respects an
 *  explicit `"false"` written by older code. */
export function wvIsHiddenOrCollapsed(el: any): boolean {
    try {
        if (!el) return false;
        if (el.hidden === true || el.collapsed === true) return true;
        for (const name of ["hidden", "collapsed"]) {
            if (el.hasAttribute && el.hasAttribute(name)
                && el.getAttribute(name) !== "false") return true;
        }
        return false;
    }
    catch (e) {
        return false;
    }
}
