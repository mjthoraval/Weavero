// The Alt-reveal of a compact (hidden) menubar -- one machine for the main
// window (pane.ts), the reader window and the note window (reader.ts) since
// 2026-10-21; before, three hand-wired copies (survey 2026-10-06 §4, the
// main-window / reader-window twins).
//
// Firefox's MenuBarListener model (dom/xul/MenuBarListener.cpp): the menubar
// toggles on the RELEASE of a bare Alt press -- Alt went down with no other
// modifier ("No other modifiers can be down. Especially CTRL. CTRL+ALT ==
// AltGR"), and any other key or a mouse press in between voids the pending
// toggle (mAccessKeyDown / mAccessKeyDownCanceled). A second bare Alt while
// the menubar shows collapses it at once, on keydown: nothing to activate, so
// no reason to wait for the release. The reveal happens at keyup in a capture
// listener on the window: the collapse CSS is height:0 (not display:none /
// visibility:collapse), so the XUL menubar stays laid in and focusable while
// hidden, and this default-group listener runs before Mozilla's system-group
// Alt-up handler -- by the time Mozilla activates the menubar (focuses the
// first menu, underlines the access keys) it is visible and laid out.
// Hidden = the `wv-compact-hidden="true"` attribute on the menubar element.
//
// No collapse on popuphidden, on purpose: Firefox keeps the menubar active
// after Esc closes a menu (F / E / V again, arrows to a sibling), and an
// auto-collapse there desynced Mozilla's menubar-active state so the next Alt
// flicker-toggled instead of activating fresh. Every handler bails on a closed
// window: an Alt+F -> Close flow once touched a dead menubar from a deferred
// timer ("can't access dead object", a crash).

declare const Zotero: any;

/** Whether a window's `<menubar>` may hold anything but menus. NOT on macOS
 *  (2026-11-09): there Gecko never draws the menubar in the window -- it
 *  mirrors it into the system menu bar (widget/cocoa/nsMenuBarX.mm), and a
 *  child that is not a menu throws its native list out of step (see
 *  wvMenubarSafeBefore). The note window's Zotero icon, the reader window's
 *  and the window controls following an Alt-revealed menu row stay out:
 *  never visible on macOS, where the menubar is the system's. */
export function wvMenubarTakesNonMenus(): boolean {
    try { return !Zotero.isMac; } catch (e) { return true; }
}

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/** The node a menu must go before in a window's `<menubar>` on macOS, given
 *  the node it should go before (`want`; null = the end). Gecko's
 *  nsMenuBarX builds its native menu list from the MENUS among the
 *  menubar's children, but maps every later insertion and removal by the
 *  node's index among ALL its child nodes (ObserveContentInserted /
 *  ObserveContentRemoved -> ComputeIndexOf). Past a child that is not a
 *  menu -- note.xhtml has macCommandSet and macKeyset before its Window
 *  menu -- the two disagree: a removal takes the wrong native menu, and an
 *  insertion past the list's end is InvalidArrayIndex_CRASH. Weavero's Tools
 *  / Help mirrors went in around the note window's Window menu, so a plugin
 *  reload or update with a note window open (title bar hidden) took Help
 *  out instead of Tools and then inserted Help past the end: Zotero crashed
 *  (macOS CI, every run since 2026-11-03; the crash reports and probes of
 *  2026-11-09). Only where every node before is a menu do the indexes agree:
 *  `want` when that holds, else the first node that is not a menu (macOS
 *  then lists the menu before Window rather than after it). Elsewhere the
 *  menubar is drawn in the window and `want` is returned as given. */
export function wvMenubarSafeBefore(menubar: any, want: any, mac: boolean = !wvMenubarTakesNonMenus()): any {
    if (!mac) return want;
    for (let n = menubar.firstChild; n; n = n.nextSibling) {
        if (n === want) return want;
        if (!(n.nodeType === 1 && n.localName === "menu" && n.namespaceURI === XUL_NS)) return n;
    }
    return want;
}

export interface WvAltRevealSpec {
    /** The window whose key and mouse events drive the machine (capture listeners). */
    win: any;
    /** The element carrying `wv-compact-hidden`. */
    menubar: any;
    /** Log tag: "[Weavero][<tag>] ...". */
    tag: string;
    /** True while Alt belongs to something else -- the main window's filter popup, where Alt-click
     *  excludes and an Alt tap would hide the popup as a Mozilla side effect. Alt is then a
     *  non-event for the menubar. */
    suppress?: () => boolean;
    /** Escape collapses when no menu is open (Mozilla closes an open menu itself and keeps the
     *  menubar active, as Firefox does). Default true. */
    escape?: boolean;
    /** A mousedown outside the menubar and outside any menupopup collapses -- mousedown, so the
     *  bar is gone before the click target's own handler runs. Default true. */
    outside?: boolean;
    /** A menu item's command collapses (bubble phase: the item's own handler ran first). Default true. */
    command?: boolean;
    /** A blur anywhere in the window collapses and resets the machine. Default false. */
    blur?: boolean;
}

export interface WvAltRevealHandle {
    /** Remove every listener. */
    off(): void;
    /** The key handlers, for a host that forwards keys from a document whose events never reach
     *  the window's listeners (the reader iframe). */
    keyDown(e: any): void;
    keyUp(e: any): void;
    escapeKey(e: any): void;
    /** Hide the menubar (a no-op on a closed window). */
    collapse(): void;
}

export function wvAltReveal(spec: WvAltRevealSpec): WvAltRevealHandle {
    const { win, menubar, tag } = spec;
    const escape = spec.escape !== false;
    const outside = spec.outside !== false;
    const command = spec.command !== false;
    let altDown = false;      // ~ mAccessKeyDown
    let canceled = false;     // ~ mAccessKeyDownCanceled
    const log = (m: string) => { try { Zotero.debug("[Weavero][" + tag + "] " + m); } catch (_) {} };
    const hasOtherMod = (e: any) => !!(e.ctrlKey || e.shiftKey || e.metaKey);
    const isDead = () => { try { return !win || win.closed; } catch (_) { return true; } };
    const isCollapsed = () => menubar.getAttribute("wv-compact-hidden") === "true";
    const collapse = () => { try { if (!isDead()) menubar.setAttribute("wv-compact-hidden", "true"); } catch (_) {} };
    const reset = () => { altDown = false; canceled = false; };
    const suppressed = () => { try { return !!(spec.suppress && spec.suppress()); } catch (_) { return false; } };
    const keyDown = (e: any) => {
        try {
            if (isDead()) return;
            if (suppressed()) { if (e.key === "Alt") log("keydown Alt ignored (suppressed)"); reset(); return; }
            if (!altDown) {
                // Tracking begins on a bare, non-repeat Alt press only.
                if (e.key === "Alt" && !e.repeat && !hasOtherMod(e)) {
                    if (!isCollapsed()) { log("keydown Alt: COLLAPSE (already visible)"); collapse(); return; }
                    altDown = true; canceled = false; log("keydown Alt: tracking (bare)");
                }
                else if (e.key === "Alt" && !e.repeat) log("keydown Alt: ignored, other modifier down (ctrl=" + e.ctrlKey + " shift=" + e.shiftKey + " meta=" + e.metaKey + ")");
                return;
            }
            // Alt held. Once canceled, canceled until the keyup. Anything but a
            // bare Alt auto-repeat makes Alt part of a combo (Alt held, then
            // Ctrl or a letter -- the case a one-flag version once missed).
            if (canceled) return;
            if (!(e.key === "Alt" && !hasOtherMod(e))) { canceled = true; log("keydown '" + e.key + "' cancels pending Alt toggle"); }
        } catch (_) {}
    };
    const keyUp = (e: any) => {
        try {
            if (isDead() || e.key !== "Alt") return;   // only the access key toggles
            if (suppressed()) { log("keyup Alt ignored (suppressed)"); reset(); return; }
            const act = altDown && !canceled && !hasOtherMod(e);
            if (!act) log("keyup Alt: no toggle (altDown=" + altDown + " canceled=" + canceled + ")");
            reset();
            if (!act) return;
            if (!isCollapsed()) { log("keyup Alt: COLLAPSE (toggle off)"); collapse(); return; }
            log("keyup Alt: REVEAL");
            menubar.removeAttribute("wv-compact-hidden");
            // A synchronous reflow: laid out before Mozilla's own Alt-up handler
            // (system group, after us) activates the menubar.
            try { menubar.getBoundingClientRect(); } catch (_) {}
        } catch (_) {}
    };
    const escapeKey = (e: any) => {
        try {
            if (isDead() || e.key !== "Escape" || isCollapsed()) return;
            if (menubar.querySelector("menu[open='true'], menupopup[state='open']")) return;   // Mozilla closes it; the menubar stays active
            collapse();
        } catch (_) {}
    };
    const mouseDown = (e: any) => {
        try {
            if (isDead()) return;
            if (altDown) canceled = true;   // Firefox's MouseDown handler sets mAccessKeyDownCanceled
            if (!outside || isCollapsed()) return;
            const t = e.target;
            if (!t || typeof t.closest !== "function") return;
            if (menubar.contains(t) || t.closest("menupopup")) return;
            collapse();
        } catch (_) {}
    };
    const menuCommand = (e: any) => {
        try { if (!isDead() && !isCollapsed() && menubar.contains(e.target)) collapse(); } catch (_) {}
    };
    const onBlur = () => { try { reset(); if (!isCollapsed()) collapse(); } catch (_) {} };
    win.addEventListener("keydown", keyDown, true);
    win.addEventListener("keyup", keyUp, true);
    if (escape) win.addEventListener("keydown", escapeKey, true);
    win.addEventListener("mousedown", mouseDown, true);   // always on: a press voids a pending toggle
    if (command) menubar.addEventListener("command", menuCommand);
    if (spec.blur) win.addEventListener("blur", onBlur, true);
    const off = () => {
        try {
            win.removeEventListener("keydown", keyDown, true);
            win.removeEventListener("keyup", keyUp, true);
            win.removeEventListener("keydown", escapeKey, true);
            win.removeEventListener("mousedown", mouseDown, true);
            menubar.removeEventListener("command", menuCommand);
            win.removeEventListener("blur", onBlur, true);
        } catch (_) {}
    };
    return { off, keyDown, keyUp, escapeKey, collapse };
}
