// Module: Zotero's progress window -- Find Full Text, Retrieve Metadata -- with real
// minimize and maximize buttons (MJT 2026-11-26: "Weavero should add buttons to minimize
// or maximize that Find Full Text window"; intake: both windows, the window's own
// title-bar buttons, on by default with a switch; plan approved with "Minimize to
// taskbar" for Zotero's own Minimize button).
//
// Zotero opens that window from the main window most recently focused:
// `Services.wm.getMostRecentWindow("navigator:browser").openDialog(
// "chrome://zotero/content/progressQueueDialog.xhtml", "",
// "chrome,close=yes,resizable=yes,dependent,dialog,centerscreen", io)`
// (xpcom/progressQueueDialog.js open(), identical in 10.0.6 and 11.0-beta.6; the
// features are a literal inside a closure, so the call is the only place to change them).
// Measured in the runner on 11.0-beta.6, Windows (title-bar style and owner through user32,
// 2026-11-26): Zotero's `dependent,dialog` -> no minimize / maximize box, an OWNED window;
// `dependent,dialog=no` -> both boxes, still owned -- an owned window has no taskbar button
// of its own and minimizes to a stub above the taskbar; `dialog=no` without `dependent` ->
// both boxes, no owner. `minimizable` changes nothing there (the flag only; it is what
// macOS / GTK read). And `focus()` alone restores a minimized one, whatever the features.
// Its own "Minimize" button closes the window while the work goes on (open() reopens it).
//
// With the setting on, one layer on each main window's `openDialog` opens THAT window as a
// normal one (`dialog=no`, no `dependent`, `minimizable=yes` -- the Settings window's own
// features in index.ts openPreferences say the same); every other call passes through
// untouched. Zotero's Minimize button then minimizes the window (a capture listener on the
// window, ahead of Zotero's own on the button); Zotero's reuse path (`_progressWindow.focus()`
// when Find Full Text runs again) brings a minimized window back by itself. Setting off:
// Zotero's call, flags and button exactly; a window opened before stays as it was opened.
// The no-main-window fallback (`Services.ww.openWindow(null, ...)`) keeps Zotero's dialog.
// Guard: test/progress-window.spec.js.

import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvLivePlugin } from "../lib/live";
import { wvMainWins } from "../lib/windows";

declare const Zotero: any;
declare const Services: any;

export const WV_PROGRESS_WINDOW_URL = "chrome://zotero/content/progressQueueDialog.xhtml";
const LAYER = "progressWindow";
const PREF = "progressWindowButtons";

/** Zotero's window features for the progress window, as a normal window: `dialog`,
 *  `dependent` and any `minimizable` taken out, `dialog=no,minimizable=yes` said
 *  explicitly (openDialog defaults to a dialog); everything else kept in order. */
export function wvProgressWindowFeatures(features: any): string {
    const parts = String(features == null ? "" : features).split(",")
        .map((s) => s.trim())
        .filter((s) => {
            if (!s) return false;
            const k = s.split("=")[0].trim().toLowerCase();
            return k !== "dialog" && k !== "dependent" && k !== "minimizable";
        });
    parts.push("dialog=no", "minimizable=yes");
    return parts.join(",");
}

/** The open progress windows (any queue), for the teardown. */
function progressWindows(): any[] {
    const out: any[] = [];
    try {
        const en = Services.wm.getEnumerator(null);
        while (en.hasMoreElements()) {
            const w = en.getNext();
            try { if (w && !w.closed && String(w.location.href) === WV_PROGRESS_WINDOW_URL) out.push(w); } catch (e) {}
        }
    } catch (e) {}
    return out;
}

class _ProgressWindowMixin {
    [k: string]: any;

    /** The layer on `win.openDialog` (window-wiring.ts "progress-window"). */
    _wvWireProgressWindow(win: any) {
        try {
            if (!win || win.closed || typeof win.openDialog !== "function") return;
            wvWrap(win, "openDialog", LAYER, this._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                // A bare `openDialog(...)` in the window's own scripts calls the own property
                // with no `this`: the native method then needs its window.
                const self = this == null ? win : this;
                let lp: any = null;
                try {
                    lp = wvLivePlugin();
                    if (!lp || String(args[0]) !== WV_PROGRESS_WINDOW_URL || !lp._wvPref(PREF)) lp = null;
                } catch (e) { lp = null; }
                if (!lp) return orig.apply(self, args);
                args[2] = wvProgressWindowFeatures(args[2]);
                const pw = orig.apply(self, args);
                try { lp._wvProgressWindowAdopt(pw); } catch (e) {}
                return pw;
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireProgressWindow err: " + e); }
    }

    /** A progress window this layer opened: Zotero's Minimize button minimizes it while the
     *  setting is on. The listener goes on the window object right away, as Zotero's own
     *  `pageshow` one does: the chrome document takes over the initial about:blank's inner
     *  window. */
    _wvProgressWindowAdopt(pw: any) {
        if (!pw || pw._wvPwUnwire) return;
        const onCommand = (e: any) => {
            try {
                const t = e && e.target;
                if (!t || t.id !== "minimize-button") return;
                const lp = wvLivePlugin();
                if (!lp || !lp._wvPref(PREF)) return;
                // Ahead of Zotero's listener on the button (target phase): it closes the window.
                e.stopPropagation();
                pw.minimize();
            } catch (err) {}
        };
        pw.addEventListener("command", onCommand, true);
        pw._wvPwUnwire = () => {
            try { pw.removeEventListener("command", onCommand, true); } catch (e) {}
            try { delete pw._wvPwUnwire; } catch (e) {}
        };
    }

    /** destroy(): every main window's openDialog given back; open progress windows get
     *  Zotero's Minimize button back (their window type stays as opened). */
    _wvProgressWindowTeardown() {
        for (const w of wvMainWins() as any[]) {
            try { wvUnwrap(w, "openDialog", LAYER); } catch (e) {}
        }
        for (const pw of progressWindows()) {
            try { if (typeof pw._wvPwUnwire === "function") pw._wvPwUnwire(); } catch (e) {}
        }
    }
}

const _progressWindowDescriptors = Object.getOwnPropertyDescriptors(_ProgressWindowMixin.prototype);
delete (_progressWindowDescriptors as any).constructor;
export const progressWindowMethods = _progressWindowDescriptors;
