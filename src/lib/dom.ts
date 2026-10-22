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

/** Write a boolean XUL attribute (hidden / collapsed / disabled / checked /
 *  selected) so that it takes effect on every Zotero we support.
 *
 *  Measured on Zotero 10 (Firefox 140, 2026-09-23): `toggleAttribute(name,
 *  true)` writes `""`, which that platform does NOT honour -- the IDL getter
 *  stays false, a vbox stays visible, a menuitem stays enabled. It honours
 *  only the literal `"true"`. Zotero 11 (Firefox 153) matches presence, so
 *  the literal works there too. A computed string (`String(cond)`, "false")
 *  is wrong on Zotero 11 (presence = true). Hence: the literal "true", or
 *  the attribute removed. */
export function wvSetBoolAttr(el: any, name: string, on: boolean): void {
    try {
        if (!el) return;
        if (on) { if (el.getAttribute(name) !== "true") el.setAttribute(name, "true"); }
        else if (el.hasAttribute(name)) el.removeAttribute(name);
    }
    catch (e) {}
}

/** Read a boolean XUL attribute (disabled / checked / selected ...) the way
 *  the RUNNING platform applies it -- the read side of wvSetBoolAttr.
 *  Firefox 153 (Zotero 11) matches presence alone: `disabled=""` (what
 *  `.disabled = true` and toggleAttribute write) is disabled, and so is
 *  `disabled="false"`. Firefox 140 (Zotero 10) honours only the literal
 *  "true". An `=== "true"` read is therefore wrong on 11 and a presence
 *  read wrong on 10; a copy or save/restore of menu state must reproduce
 *  what the platform shows (audit against "Zotero 11 for Developers",
 *  2026-10-13: the reader-window menu mirror dropped Zotero 11's
 *  `disabled=""`/`checked=""`). */
export function wvBoolAttrOn(el: any, name: string): boolean {
    try {
        if (!el || !el.hasAttribute || !el.hasAttribute(name)) return false;
        if (((Zotero as any).platformMajorVersion || 0) >= 153) return true;
        return el.getAttribute(name) === "true";
    }
    catch (e) {
        return false;
    }
}

/** A reader plugin-menu event (createViewContextMenu,
 *  createAnnotationContextMenu, createThumbnailContextMenu) whose `append`
 *  gives every item an EXPLICIT boolean `disabled`. Zotero 11's reader
 *  builds each appended item with `menuitem.toggleAttribute('disabled',
 *  item.disabled)` (xpcom/reader.js `_openContextMenu`): an item WITHOUT the
 *  key passes `undefined`, which counts as no `force` -- the call TOGGLES
 *  the absent attribute on, and every plugin entry came out greyed (issue
 *  #57, 11.0-beta.1, verified live 2026-10-13). Zotero 10 is unaffected
 *  either way. Submenu items (`groups`) are fixed too. */
export function wvReaderMenuEvent(event: any): any {
    try {
        if (!event || typeof event.append !== "function") return event;
        const fix = (it: any): any => {
            if (!it || typeof it !== "object") return it;
            if (Array.isArray(it.groups)) {
                return Object.assign({}, it, { groups: it.groups.map((g: any) => (Array.isArray(g) ? g.map(fix) : g)) });
            }
            return Object.assign({}, it, { disabled: !!it.disabled });
        };
        const append0 = event.append;
        return Object.assign({}, event, { append: (...items: any[]) => append0.apply(event, items.map(fix)) });
    }
    catch (e) {
        return event;
    }
}

/** True if `node` is `container` or lies inside it, INCLUDING native
 *  anonymous content such as the element's own scrollbar. `contains()` stops
 *  at that boundary: a real press on a popup's scrollbar arrives with the XUL
 *  `thumb`/`slider`/`scrollbar` as `e.target` (not retargeted -- for a popup
 *  in the reader's iframe it was seen only in the main window's document),
 *  and neither `contains()` nor `composedPath()` includes the popup, so the
 *  click-outside dismisser closed the comment popup on every scrollbar press
 *  (issue #55, real presses on 11.0-beta.1, 2026-10-13; scripted events are
 *  retargeted and never showed it). The anonymous nodes' `parentNode` chain
 *  does reach the host (thumb -> slider -> scrollbar -> scroller). A shadow
 *  root continues to its host. */
export function wvWithin(container: any, node: any): boolean {
    try {
        if (!container || !node) return false;
        for (let n = node; n; n = n.parentNode || (n.nodeType === 11 ? n.host : null)) {
            if (n === container) return true;
        }
    }
    catch (e) {}
    return false;
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

/** Run `fn(w)` once window `w` holds its REAL document, loaded. A window-
 *  mediator listener (onOpenWindow) gets a new window while it still holds
 *  its initial about:blank, which on Firefox 153 already reads "complete"
 *  (measured 2026-10-12): a `readyState === "complete"` check there looked
 *  at the blank page, found no windowtype, and never waited for the real
 *  one -- the Software Update version line and the pop-out note-window
 *  wiring went dead on Zotero 11. A load listener added at that moment
 *  still fires for the real document; a load that arrives while the window
 *  is still blank re-arms. Guard: test/window-load-timing.spec.js. */
export const WV_XHTML_NS = "http://www.w3.org/1999/xhtml";

/** An HTML element in `doc` -- a chrome (XUL) document, a reader or note
 *  frame, a content page -- with its class and text when given, appended to
 *  `parent` when given. Seventy-nine local namespace constants in a dozen
 *  spellings preceded some 660 such calls (survey 2026-10-06 §4 #10). */
export function wvHtmlEl(doc: any, tag: string, cls?: string, text?: string, parent?: any): any {
    const el: any = doc.createElementNS(WV_XHTML_NS, tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
}

/** True when `el` takes typed text -- an editable region, an input, a
 *  textarea or a select (keys there belong to the control). Five key
 *  handlers spelled the check out, one of them with `select`, four
 *  without; all take it now. The reader panels' Undo/Redo focus test keeps
 *  its own, finer rule (read-only controls, input types). */
export function wvIsTextEntry(el: any): boolean {
    try {
        if (!el) return false;
        if (el.isContentEditable) return true;
        const ln = String(el.localName || "").toLowerCase();
        return ln === "input" || ln === "textarea" || ln === "select";
    }
    catch (e) {
        return false;
    }
}

export function wvWhenWindowLoaded(w: any, fn: (w: any) => void): void {
    const isBlank = () => {
        try { return !w.document || String(w.location && w.location.href) === "about:blank"; }
        catch (e) { return true; }
    };
    const arm = () => {
        try {
            w.addEventListener("load", () => {
                if (isBlank()) { arm(); return; }
                try { fn(w); } catch (e) {}
            }, { once: true });
        } catch (e) {}
    };
    try {
        if (!w) return;
        if (!isBlank() && w.document.readyState === "complete") { fn(w); return; }
        arm();
    } catch (e) {}
}
