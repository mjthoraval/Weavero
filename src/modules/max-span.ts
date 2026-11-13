// Module: maximize across monitors -- a window fills a run of side-by-side
// monitors (MJT 2026-11-11: "I would like to be able to maximize only on 2 out
// of 3 monitors"; option 1 chosen).
//
// The design MJT picked:
//   - RIGHT-CLICK the window's maximize (or restore) button: a short menu of
//     the monitors side by side -- "Maximize to Left + Middle", "Maximize to
//     Middle + Right", "Maximize to All Three" (lib/screens.ts wvSpanCombos).
//     None with one monitor, so no menu there.
//   - A choice fills those monitors' FREE areas (taskbars excluded). It is not
//     an OS maximize: the window stays "normal" to the OS, Win+Up and Snap keep
//     their one-monitor behaviour, and the size is kept like any window size.
//   - While spanned the button shows the restore glyph; it, or a double-click
//     on the title bar, puts the window back where and as it was (maximized
//     included).
//
// Where the buttons are: Zotero's own caption buttons (`.titlebar-max` /
// `.titlebar-restore` in `.titlebar-buttonbox`) in every main window -- Zotero
// draws its title bar itself (titlebar.js sets `customtitlebar`), in its
// menu row or, with Weavero's Hide Title Bar, in the tab strip; the Plugins
// Manager's drawn bar (pane.ts _wvPMSetupChrome, the same classes); Weavero's
// own reader-window buttons on Zotero 9/10 (`.wv-window-max`, reader.ts
// _ensureReaderWindowControls). A window with the OS's title bar has no button
// to right-click.
//
// Measured on MJT's desktop (2026-11-11, 11.0-beta.4, monitors 1920x1080 at
// 100%, 1920x1080 at 100%, 1920x1200 at 125%, taskbar at the bottom):
//   - the tree owner's nsIBaseWindow.setPositionAndSize takes DEVICE pixels
//     and lands exactly, across monitors of different scales, the window
//     taking the scale of the monitor Windows gives it; window.moveTo /
//     resizeTo work in CSS pixels of the CURRENT monitor and cannot place a
//     window across a scale boundary in one call (screenX 3072 = device 3840
//     on the 125% monitor). Desktop pixels are device pixels on Windows.
//   - a normal window's frame on Windows 11 is invisible: the outer rect is
//     8 device px (10 at 125%) wider than what is drawn on the left, right and
//     bottom (inner 8,0,1000,600 in an outer 0,0,1016,608). The window is
//     placed so that what is DRAWN fills the area -- as Snap places windows --
//     re-measuring the frame once it has taken the destination's scale.
//   - XUL persistence keeps the spanned size (xulstore width 3840) but every
//     restore clamps it to one monitor: AppWindow::SetSpecifiedSize to the
//     window's screen, zoteroPane.js constrainToScreen. So the span itself is
//     part of the window's state Weavero keeps (window-state.ts) and comes back
//     after Zotero has placed the window.
//
// macOS is left out: its maximize control is the system's (no button in the
// DOM), and with "Displays have separate Spaces" (the default) a window cannot
// span displays. Wayland is left out: a window cannot place itself there. A
// span the platform refuses all the same (a window manager that clamps) puts
// the window back and hides the entries for the session -- never a broken one.

import { wvLivePlugin } from "../lib/live";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvPopupHost } from "../lib/dom";
import { wvMenuItem } from "../lib/menu";
import { wvStr } from "../lib/l10n";
import { wvTimeout, wvSleep } from "../lib/timers";
import { wvScreensFromGecko, wvSpanCombos, wvSpanByRect, WvRect, WvScreen, WvScreenName, WvSpan } from "../lib/screens";

declare const Zotero: any;
declare const Components: any;

const POPUP_ID = "wv-maxspan-popup";
const STYLE_ID = "wv-maxspan-style";
/** Root attribute while a window is spanned (its value: the span's key). */
const ATTR = "wv-maxspan";
/** The maximize / restore buttons this menu belongs to. */
const BTN_SEL = ".titlebar-buttonbox .titlebar-max, .titlebar-buttonbox .titlebar-restore, .wv-window-max";
/** Keys of the listeners a window carries while spanned (wvListen). */
const SPAN_KEYS = ["maxSpan:resize", "maxSpan:sizemode", "maxSpan:command", "maxSpan:dragdown", "maxSpan:down", "maxSpan:up"];
/** A spanned window still fills its span when its rect is this close (device px). */
const SAME = 3;

const live = () => wvLivePlugin();

/** When each window last opened the menu (a right-click delivers a mouseup
 *  AND a contextmenu: one menu). */
const menuAt = new WeakMap<any, number>();

/** The window's span, `_wvMaxSpan`: what fills it now, and where it was. */
interface WvSpanState {
    key: string;
    /** The area filled, desktop px. */
    rect: WvRect;
    /** The window before the span: its outer rect (device px), maximized or not. */
    pre: { dev: WvRect; max: boolean };
    /** The outer rect the span ended on (device px), null while it is placed. */
    outer: WvRect | null;
    /** A title-bar press (Windows' draggableregionleftmousedown), a second
     *  press of a double-click on the title bar, a double-click anywhere. */
    dragAt?: number;
    dblAt?: number;
    anyDblAt?: number;
}

function baseWin(win: any): any {
    return win.docShell.treeOwner.QueryInterface(Components.interfaces.nsIBaseWindow);
}

class _MaxSpanMixin {
    /** Spans can work here: Windows, and Linux under X11 (untested). Not
     *  macOS (separate Spaces per display, no button in the DOM) nor Wayland
     *  (a window cannot place itself), nor after a span the platform refused
     *  this session. */
    _wvMaxSpanSupported(this: any): boolean {
        try {
            if (this._wvMaxSpanRefused) return false;
            const Z: any = Zotero;
            if (Z.isMac) return false;
            if (Z.isLinux) {
                let proto = "";
                try { proto = String(Components.classes["@mozilla.org/gfx/info;1"].getService(Components.interfaces.nsIGfxInfo).windowProtocol || ""); } catch (e) {}
                if (/wayland/i.test(proto)) return false;
                if (!proto) {
                    const env: any = (Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment));
                    if (/wayland/i.test(env.get("XDG_SESSION_TYPE")) && !/x11/i.test(env.get("GDK_BACKEND"))) return false;
                }
            }
            return true;
        }
        catch (e) { return false; }
    }

    /** The monitors (lib/screens.ts), [] when they cannot be read. */
    _wvMaxSpanScreens(): WvScreen[] {
        try { return wvScreensFromGecko(); }
        catch (e) { Zotero.debug("[Weavero] max span: screens err: " + e); return []; }
    }

    /** The spans the monitors offer (`screens`, else the desktop's),
     *  labelled in the UI language. */
    _wvMaxSpanCombos(this: any, screens?: WvScreen[]): WvSpan[] {
        try {
            const name = (n: WvScreenName) => wvStr("weavero-maxspan-monitor", { position: n.position, number: n.number }, null);
            return wvSpanCombos(screens || this._wvMaxSpanScreens(), name, {
                pair: "weavero-menu-maxspan-pair",
                all: "weavero-menu-maxspan-all",
                range: "weavero-menu-maxspan-range",
            });
        }
        catch (e) { Zotero.debug("[Weavero] max span: combos err: " + e); return []; }
    }

    /** The window's outer rect, device px. */
    _wvMaxSpanDevRect(win: any): WvRect {
        const a: any = {}, b: any = {}, c: any = {}, d: any = {};
        baseWin(win).getPositionAndSize(a, b, c, d);
        return [a.value, b.value, c.value, d.value];
    }

    /** What the window draws, device px (its inner rect: the frame around it
     *  is invisible on Windows 11 and a shadow under GTK). */
    _wvMaxSpanInnerDev(win: any): WvRect {
        const s = win.devicePixelRatio || 1;
        return [win.mozInnerScreenX * s, win.mozInnerScreenY * s, win.innerWidth * s, win.innerHeight * s];
    }

    _wvMaxSpanSetDev(win: any, r: WvRect) {
        baseWin(win).setPositionAndSize(Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), 0);
    }

    /** The window fills its span now (normal state, where the span put it). */
    _wvMaxSpanIsSpanned(this: any, win: any): boolean {
        try {
            const s: WvSpanState = win && win._wvMaxSpan;
            if (!s || !s.outer || win.windowState !== win.STATE_NORMAL) return false;
            const r = this._wvMaxSpanDevRect(win);
            return r.every((v: number, i: number) => Math.abs(v - s.outer![i]) <= SAME);
        }
        catch (e) { return false; }
    }

    /** Right-click on the maximize button, on every window that has one:
     *  `contextmenu`, and the right button's `mouseup` in case a platform
     *  sends no contextmenu there (Windows answers a right-click on the
     *  caption buttons as a non-client one, WM_NCRBUTTONUP). Capture phase on
     *  the window, so the button's place (Zotero's title row, Weavero's tab
     *  strip) does not matter. */
    _wvMaxSpanWire(this: any, win: any) {
        try {
            if (!win || win.closed) return;
            if (!this._wvMaxSpanSupported()) { this._wvMaxSpanUnwire(win); return; }
            const tag = this._wvWireTag();
            wvListen(win, "maxSpan:contextmenu", "contextmenu", (e: any) => {
                try { const lp = live(); if (lp) lp._wvMaxSpanOnPress(win, e, false); } catch (er) {}
            }, true, tag);
            wvListen(win, "maxSpan:rbup", "mouseup", (e: any) => {
                try { if (e.button === 2) { const lp = live(); if (lp) lp._wvMaxSpanOnPress(win, e, true); } } catch (er) {}
            }, true, tag);
        }
        catch (e) { Zotero.debug("[Weavero] _wvMaxSpanWire err: " + e); }
    }

    _wvMaxSpanUnwire(win: any) {
        try { wvUnlisten(win, "maxSpan:contextmenu"); } catch (e) {}
        try { wvUnlisten(win, "maxSpan:rbup"); } catch (e) {}
    }

    /** A right-click: on the maximize / restore button, with spans to offer,
     *  the menu opens (and nothing else does). `late`: the mouseup, which
     *  waits for the contextmenu that may follow it. */
    _wvMaxSpanOnPress(this: any, win: any, e: any, late: boolean) {
        const t = e && e.target;
        const btn = t && typeof t.closest === "function" ? t.closest(BTN_SEL) : null;
        if (!btn) return;
        if (!this._wvMaxSpanSupported()) return;
        if (win.windowState === win.STATE_MINIMIZED || win.fullScreen) return;
        const combos = this._wvMaxSpanCombos();
        if (!combos.length) return;
        const x = e.screenX, y = e.screenY;
        if (late) {
            // Not prevented: a prevented mouseup would stop the contextmenu.
            wvTimeout(() => {
                try {
                    if (Date.now() - (menuAt.get(win) || 0) < 600) return;
                    const lp = live();
                    if (lp && !win.closed) lp._wvMaxSpanOpenMenu(win, x, y);
                }
                catch (er) {}
            }, 60);
            return;
        }
        try { e.preventDefault(); e.stopPropagation(); } catch (er) {}
        // Open already (the mouseup's fallback came first): that one stays.
        const pop = win.document.getElementById(POPUP_ID);
        if (pop && (pop.state === "open" || pop.state === "showing")) return;
        this._wvMaxSpanOpenMenu(win, x, y, combos);
    }

    /** The menu at screen point (x, y): one entry per span, the span the
     *  window fills now checked (choosing it again puts the window back). */
    _wvMaxSpanOpenMenu(this: any, win: any, x: number, y: number, combos?: WvSpan[]) {
        try {
            const list = combos || this._wvMaxSpanCombos();
            if (!list.length) return null;
            const doc = win.document;
            const tag = this._wvWireTag();
            let pop: any = doc.getElementById(POPUP_ID);
            if (pop && pop.getAttribute("data-wv-tag") !== tag) { pop.remove(); pop = null; }
            if (!pop) {
                pop = doc.createXULElement("menupopup");
                pop.id = POPUP_ID;
                pop.setAttribute("data-wv-tag", tag);
                wvPopupHost(doc).appendChild(pop);
            }
            while (pop.firstChild) pop.firstChild.remove();
            const cur = this._wvMaxSpanIsSpanned(win) ? win._wvMaxSpan.key : null;
            for (const c of list) {
                wvMenuItem(doc, {
                    l10n: c.l10n,
                    cls: "wv-maxspan-item",
                    attrs: { "data-wv-maxspan": c.key },
                    checked: c.key === cur,
                    onCommand: () => {
                        const lp = live();
                        if (lp) return lp._wvMaxSpanChoose(win, c);
                    },
                }, pop);
            }
            menuAt.set(win, Date.now());
            pop.openPopupAtScreen(x, y, true);
            return pop;
        }
        catch (e) { Zotero.debug("[Weavero] _wvMaxSpanOpenMenu err: " + e); return null; }
    }

    /** A menu choice: the span, or -- the one the window fills now -- back. */
    async _wvMaxSpanChoose(this: any, win: any, span: WvSpan) {
        if (this._wvMaxSpanIsSpanned(win) && win._wvMaxSpan.key === span.key) return this._wvMaxSpanRestore(win);
        return this._wvMaxSpanApply(win, span);
    }

    /** Fill `span`. The window's place before the first span is kept
     *  (`_wvMaxSpan.pre`) through a switch to another span. Resolves true
     *  when the window fills it. */
    async _wvMaxSpanApply(this: any, win: any, span: WvSpan, preIn?: { dev: WvRect; max: boolean }): Promise<boolean> {
        try {
            if (!win || win.closed || !span) return false;
            const prev: WvSpanState | undefined = win._wvMaxSpan;
            let pre = preIn || (prev && prev.pre) || null;
            if (!pre) {
                if (win.windowState === win.STATE_MAXIMIZED) {
                    // Its place as a normal window, which a later maximize keeps.
                    win.restore();
                    for (let i = 0; i < 40 && win.windowState !== win.STATE_NORMAL; i++) await wvSleep(50);
                    await wvSleep(80);
                    pre = { dev: this._wvMaxSpanDevRect(win), max: true };
                }
                else if (win.windowState === win.STATE_NORMAL) pre = { dev: this._wvMaxSpanDevRect(win), max: false };
                else return false;
            }
            const s: WvSpanState = { key: span.key, rect: span.rect.slice() as WvRect, pre, outer: null };
            win._wvMaxSpan = s;
            this._wvMaxSpanMark(win, true);
            const ok = await this._wvMaxSpanFill(win, span.rect);
            if (win._wvMaxSpan !== s) return false;   // put back or replaced meanwhile
            if (!ok) {
                Zotero.debug("[Weavero] max span: the platform did not place the window, entries off for this session");
                this._wvMaxSpanRefused = true;
                this._wvMaxSpanRestore(win);
                return false;
            }
            s.outer = this._wvMaxSpanDevRect(win);
            this._wvMaxSpanSyncButtons(win);
            this._wvMaxSpanSaveState(win);
            return true;
        }
        catch (e) {
            Zotero.debug("[Weavero] _wvMaxSpanApply err: " + e);
            return false;
        }
    }

    /** Place the window so that what it draws covers `rect` (desktop px).
     *  Its invisible frame is measured, not assumed, and measured again once
     *  the window has the destination's scale (8 px at 100%, 10 at 125%).
     *  False when the platform left the window elsewhere. */
    async _wvMaxSpanFill(this: any, win: any, rect: WvRect): Promise<boolean> {
        let dpd = 1;
        try { dpd = Number(baseWin(win).devicePixelsPerDesktopPixel) || 1; } catch (e) {}
        const V: WvRect = [rect[0] * dpd, rect[1] * dpd, rect[2] * dpd, rect[3] * dpd];
        let asked: WvRect = V;
        for (let round = 0; round < 4; round++) {
            const o = this._wvMaxSpanDevRect(win), n = this._wvMaxSpanInnerDev(win);
            // A frame inset: the inner rect's distance to the outer one. Kept
            // only when it is a plausible invisible frame (a native title bar
            // is not invisible, and the windows here draw their own).
            const fit = (v: number) => (v >= 0 && v <= 48 * (win.devicePixelRatio || 1) ? v : 0);
            const L = fit(n[0] - o[0]), T = fit(n[1] - o[1]);
            const R = fit(o[0] + o[2] - (n[0] + n[2])), B = fit(o[1] + o[3] - (n[1] + n[3]));
            asked = [V[0] - L, V[1] - T, V[2] + L + R, V[3] + T + B];
            this._wvMaxSpanSetDev(win, asked);
            await wvSleep(120);
            if (win.closed) return false;
            const m = this._wvMaxSpanInnerDev(win);
            if (m.every((v: number, i: number) => Math.abs(v - V[i]) <= 2)) return true;
        }
        // Close enough (a pixel of rounding at a fractional scale), or refused.
        const got = this._wvMaxSpanDevRect(win);
        return got.every((v: number, i: number) => Math.abs(v - Math.round(asked[i])) <= 32);
    }

    /** Put a spanned window back where and as it was. False when it is not
     *  spanned. The span is dropped first: its listeners must not read the
     *  move as a user's. */
    _wvMaxSpanRestore(this: any, win: any): boolean {
        try {
            const s: WvSpanState = win && win._wvMaxSpan;
            if (!s) return false;
            this._wvMaxSpanForget(win);
            this._wvMaxSpanSetDev(win, s.pre.dev);
            // Once more after the scale change a move between monitors brings.
            wvTimeout(() => {
                try {
                    if (win.closed || win._wvMaxSpan) return;
                    const r = this._wvMaxSpanDevRect(win);
                    if (!r.every((v: number, i: number) => Math.abs(v - s.pre.dev[i]) <= 1)) this._wvMaxSpanSetDev(win, s.pre.dev);
                    if (s.pre.max) win.maximize();
                    this._wvMaxSpanSyncButtons(win);
                }
                catch (e) {}
            }, 150);
            this._wvMaxSpanSaveState(win);
            return true;
        }
        catch (e) {
            Zotero.debug("[Weavero] _wvMaxSpanRestore err: " + e);
            return false;
        }
    }

    /** Drop the window's span where it stands (it was moved or resized by
     *  hand, or Weavero goes): the geometry is left alone. */
    _wvMaxSpanForget(this: any, win: any) {
        try {
            if (!win) return;
            const had = !!win._wvMaxSpan;
            try { delete win._wvMaxSpan; } catch (e) {}
            this._wvMaxSpanMark(win, false);
            if (had) {
                this._wvMaxSpanSyncButtons(win);
                this._wvMaxSpanSaveState(win);
            }
        }
        catch (e) {}
    }

    /** destroy(): every window keeps its size and place; nothing of the span
     *  stays (root attribute, style, listeners, the window's `_wvMaxSpan`). */
    _wvMaxSpanForgetAll(this: any) {
        try {
            // At a quit the span stays in the window's saved state, to come
            // back with it; on a disable it goes (the window is left as it is).
            let quitting = true;
            try { quitting = !!Services.startup.shuttingDown; } catch (e) {}
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try {
                    if (w.closed) continue;
                    const had = !!w._wvMaxSpan;
                    try { delete w._wvMaxSpan; } catch (e) {}
                    if (had && !quitting) this._wvMaxSpanSaveState(w);
                    this._wvMaxSpanMark(w, false);
                    this._wvMaxSpanUnwire(w);
                    const pop = w.document && w.document.getElementById(POPUP_ID);
                    if (pop) pop.remove();
                }
                catch (e) {}
            }
        }
        catch (e) {}
    }

    /** The marks of a spanned window: the root attribute and the style that
     *  show the restore glyph, and the listeners that follow it. */
    _wvMaxSpanMark(this: any, win: any, on: boolean) {
        const doc = win && win.document;
        if (!doc) return;
        const root = doc.documentElement;
        if (!on) {
            try { root.removeAttribute(ATTR); } catch (e) {}
            try { wvRemoveStyle(doc, STYLE_ID); } catch (e) {}
            for (const k of SPAN_KEYS) { try { wvUnlisten(win, k); } catch (e) {} }
            return;
        }
        const s: WvSpanState = win._wvMaxSpan;
        // Zotero hides .titlebar-restore unless the root says maximized
        // (_titleBar.scss); show it in .titlebar-max's place, with the display
        // the max button has on this platform (flex on Windows), read before
        // this style hides it.
        try { root.removeAttribute(ATTR); wvRemoveStyle(doc, STYLE_ID); } catch (e) {}
        let disp = "flex";
        try {
            const mb = doc.querySelector(".titlebar-buttonbox .titlebar-max");
            const d = mb ? win.getComputedStyle(mb).display : "";
            if (d && d !== "none") disp = d;
        }
        catch (e) {}
        root.setAttribute(ATTR, s ? s.key : "on");
        const notMax = ":root[" + ATTR + "]:not([sizemode=\"maximized\"], [sizemode=\"fullscreen\"])";
        wvInjectStyle(doc, STYLE_ID, [
            notMax + " .titlebar-buttonbox .titlebar-max { display: none !important; }",
            notMax + " .titlebar-buttonbox .titlebar-restore { display: " + disp + " !important; }",
        ].join("\n"));
        const tag = this._wvWireTag();
        const lp = () => live();
        // Moved or resized by hand: no longer spanned. A move by the title
        // bar ends with a mouseup on Windows (WM_EXITSIZEMOVE); a resize fires
        // `resize`. The check waits for the size to settle.
        let checkT: any = null;
        const checkSoon = () => {
            try {
                if (checkT) return;
                checkT = wvTimeout(() => {
                    checkT = null;
                    try { const p = lp(); if (p) p._wvMaxSpanCheck(win); } catch (e) {}
                }, 250);
            }
            catch (e) {}
        };
        wvListen(win, "maxSpan:resize", "resize", checkSoon, false, tag);
        wvListen(win, "maxSpan:sizemode", "sizemodechange", () => {
            try { const p = lp(); if (p) p._wvMaxSpanOnSizeMode(win); } catch (e) {}
        }, false, tag);
        // The restore button: back to before the span, not the OS's restore
        // (the window is "normal" to the OS already).
        wvListen(win, "maxSpan:command", "command", (e: any) => {
            try {
                const t = e.target;
                if (!t || typeof t.closest !== "function" || !t.closest(".titlebar-buttonbox .titlebar-restore, .titlebar-buttonbox .titlebar-max")) return;
                if (!win._wvMaxSpan || win.windowState !== win.STATE_NORMAL) return;
                const p = lp();
                if (!p) return;
                e.stopPropagation();
                e.preventDefault();
                p._wvMaxSpanRestore(win);
            }
            catch (er) {}
        }, true, tag);
        // A double-click on the title bar: back to before the span. On
        // Windows the first press of a double-click on the title bar reaches
        // the page only as `draggableregionleftmousedown`, and the second as a
        // mousedown with detail 2 (nsWindow.cpp WM_NCLBUTTONDBLCLK); the OS's
        // own maximize follows unless that press's mouseup is prevented. GTK
        // takes the title-bar action on that mouseup too (OnButtonReleaseEvent,
        // unless defaultPrevented). Linux: by the title bar's elements; untested.
        wvListen(win, "maxSpan:dragdown", "draggableregionleftmousedown", () => {
            try { if (win._wvMaxSpan) win._wvMaxSpan.dragAt = Date.now(); } catch (e) {}
        }, false, tag);
        wvListen(win, "maxSpan:down", "mousedown", (e: any) => {
            try {
                const st: WvSpanState = win._wvMaxSpan;
                if (!st || e.button !== 0 || e.detail !== 2) return;
                const now = Date.now();
                st.anyDblAt = now;
                const p = lp();
                const onTitle = (Zotero as any).isWin ? now - (st.dragAt || 0) < 800 : !!(p && p._wvMaxSpanTitleArea(e.target));
                if (onTitle) st.dblAt = now;
            }
            catch (er) {}
        }, true, tag);
        wvListen(win, "maxSpan:up", "mouseup", (e: any) => {
            try {
                const st: WvSpanState = win._wvMaxSpan;
                if (!st || e.button !== 0) return;
                if (st.dblAt && Date.now() - st.dblAt < 800 && win.windowState === win.STATE_NORMAL) {
                    st.dblAt = 0;
                    e.preventDefault();
                    e.stopPropagation();
                    wvTimeout(() => { try { const p = lp(); if (p) p._wvMaxSpanRestore(win); } catch (er) {} }, 0);
                    return;
                }
                checkSoon();
            }
            catch (er) {}
        }, true, tag);
        this._wvMaxSpanSyncButtons(win);
    }

    /** A title-bar element a double-click maximizes from (non-Windows): the
     *  title rows themselves, not a control in them. */
    _wvMaxSpanTitleArea(el: any): boolean {
        try {
            if (!el || typeof el.closest !== "function") return false;
            if (el.closest("toolbarbutton, button, menu, menuitem, input, textbox, .tab, [role='tab'], .titlebar-buttonbox, .wv-hamburger-btn")) return false;
            return !!el.closest("#titlebar, #zotero-title-bar, .wv-window-tabstrip, .wv-pm-drag-flex, .wv-pm-drag-spacer");
        }
        catch (e) { return false; }
    }

    /** After a resize or a move: a window no longer where its span put it is
     *  not spanned any more (kept while the OS maximizes or minimizes it: its
     *  restore comes back to the span). */
    _wvMaxSpanCheck(this: any, win: any) {
        try {
            const s: WvSpanState = win && !win.closed && win._wvMaxSpan;
            if (!s || !s.outer || win.windowState !== win.STATE_NORMAL) return;
            if (!this._wvMaxSpanIsSpanned(win)) this._wvMaxSpanForget(win);
            else this._wvMaxSpanSyncButtons(win);
        }
        catch (e) {}
    }

    /** sizemodechange of a spanned window. A maximize right after a
     *  double-click that the title-bar check missed: the double-click meant
     *  "restore", so restore. */
    _wvMaxSpanOnSizeMode(this: any, win: any) {
        try {
            const s: WvSpanState = win._wvMaxSpan;
            if (!s) return;
            if (win.windowState === win.STATE_MAXIMIZED && s.anyDblAt && Date.now() - s.anyDblAt < 1000) {
                s.anyDblAt = 0;
                win.restore();
                wvTimeout(() => { try { const p = live(); if (p) p._wvMaxSpanRestore(win); } catch (e) {} }, 200);
                return;
            }
            this._wvMaxSpanSyncButtons(win);
            if (win.windowState === win.STATE_NORMAL) wvTimeout(() => { try { const p = live(); if (p) p._wvMaxSpanCheck(win); } catch (e) {} }, 300);
        }
        catch (e) {}
    }

    /** Weavero's own reader-window button follows the span (Zotero's follow
     *  the root attribute through the style). */
    _wvMaxSpanSyncButtons(win: any) {
        // The controls' stash: the tab strip's (a reader window), or the
        // compact menubar's (reader.ts _ensureReaderWindowControls callers).
        for (const k of ["_wvTabStrip", "_wvCompactMenubar"]) {
            try {
                const st = win && win[k];
                if (st && typeof st.syncMaxIcon === "function") st.syncMaxIcon();
            }
            catch (e) {}
        }
    }

    /** The span to keep with the window's state, or null: its area and the
     *  place it came from (window-state.ts, Zotero with its own windows). */
    _wvMaxSpanCapture(this: any, win: any): any {
        try {
            const s: WvSpanState = win && win._wvMaxSpan;
            if (!s || !s.outer) return null;
            return { rect: s.rect.slice(), pre: { dev: s.pre.dev.slice(), max: !!s.pre.max } };
        }
        catch (e) { return null; }
    }

    _wvMaxSpanSaveState(this: any, win: any) {
        try { if (typeof this._wvWinStateSave === "function") this._wvWinStateSave(win); } catch (e) {}
    }

    /** A window back from a restart with a span in its state: Zotero has
     *  placed it on one monitor (both of its restores clamp to a screen), so
     *  span it again -- when the monitors still offer that area. */
    async _wvMaxSpanReapply(this: any, win: any, saved: any): Promise<boolean> {
        try {
            if (!saved || !Array.isArray(saved.rect) || !this._wvMaxSpanSupported()) return false;
            if (win.windowState !== win.STATE_NORMAL && win.windowState !== win.STATE_MAXIMIZED) return false;
            const span = wvSpanByRect(this._wvMaxSpanCombos(), saved.rect);
            if (!span) return false;
            const pre = saved.pre && Array.isArray(saved.pre.dev) ? { dev: saved.pre.dev.slice(), max: !!saved.pre.max } : undefined;
            return await this._wvMaxSpanApply(win, span, pre);
        }
        catch (e) {
            Zotero.debug("[Weavero] _wvMaxSpanReapply err: " + e);
            return false;
        }
    }
}

declare const Services: any;

const _maxSpanDescriptors = Object.getOwnPropertyDescriptors(_MaxSpanMixin.prototype);
delete (_maxSpanDescriptors as any).constructor;
export const maxSpanMethods = _maxSpanDescriptors;
