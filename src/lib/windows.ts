// The open main windows, one way (survey 2026-10-06 §4 #9).
//
// Fifty sites spelled `Zotero.getMainWindows ? Zotero.getMainWindows() :
// [...]` out by hand, with five different fallbacks ([], [getMainWindow()],
// `.filter(Boolean)` inside or outside the ternary, [win]). The fallback
// only ever ran on a Zotero without getMainWindows -- none Weavero supports
// (9, 10, 11 all have it) -- so the spellings differed for nothing.

/** Every open main window (`Zotero.getMainWindows()`), nulls dropped; the
 *  focused one alone on a Zotero without the plural getter. */
export function wvMainWins(): any[] {
    try {
        const Z: any = Zotero;
        const wins: any[] = typeof Z.getMainWindows === "function" ? Z.getMainWindows() : [Z.getMainWindow()];
        return (wins || []).filter(Boolean);
    }
    catch (e) {
        return [];
    }
}

/** The `windowtype` of a window or of a document -- "navigator:browser" a
 *  main window, "zotero:reader" a reader window, "zotero:note", "zotero:pref",
 *  "Update:Wizard"... -- and "" when there is none yet (a window still on
 *  its about:blank, a closed one) or the argument is not a window. Thirty-
 *  nine sites spelled the guarded read out (`win && win.document &&
 *  win.document.documentElement && ...getAttribute("windowtype")`), in two
 *  and three-line chains. */
export function wvWinType(winOrDoc: any): string {
    try {
        if (!winOrDoc) return "";
        const doc = winOrDoc.documentElement ? winOrDoc : winOrDoc.document;
        return (doc && doc.documentElement && doc.documentElement.getAttribute("windowtype")) || "";
    }
    catch (e) {
        return "";
    }
}

/** Windows only: a window's native style (GWL_STYLE) through user32, read,
 *  or with `next` rewritten and the frame refreshed (SWP_FRAMECHANGED --
 *  without it the title bar keeps its old buttons until the next resize).
 *  Returns the style now in force, null when it cannot be read (not
 *  Windows, no native handle, ctypes unavailable). The same js-ctypes path
 *  as the window icons (modules/tabs.ts _wvSetWindowIconFromFile).
 *  `open` replaces the user32 handle (the specs' stand-in for a 32-bit one). */
export function wvWin32Style(win: any, next?: (style: number) => number, open?: (ctypes: any) => any): number | null {
    let lib: any = null;
    try {
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs") as any;
        const bw = win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
        const handle = bw.nativeHandle;
        if (!handle) return null;
        lib = open ? open(ctypes) : ctypes.open("user32.dll");
        const HWND = ctypes.voidptr_t;
        const GWL_STYLE = -16;
        // A 32-bit user32.dll exports no *WindowLongPtrW (macros for the plain
        // names there) and declaring a missing symbol throws, which left a
        // 32-bit Zotero with no style at all (2026-11-05). intptr_t is the
        // right width either way.
        const declareLong = (verb: "Get" | "Set", ...args: any[]) => {
            try { return lib.declare(verb + "WindowLongPtrW", ctypes.winapi_abi, ctypes.intptr_t, ...args); }
            catch (e) { return lib.declare(verb + "WindowLongW", ctypes.winapi_abi, ctypes.intptr_t, ...args); }
        };
        const GetWindowLong = declareLong("Get", HWND, ctypes.int);
        const hwnd = HWND(ctypes.UInt64(handle));
        // The style is 32 bits, sign-extended into LONG_PTR: `| 0` keeps it
        // an int32 so the bit operations and the write-back agree.
        const style = Number(GetWindowLong(hwnd, GWL_STYLE).toString()) | 0;
        if (!next) return style;
        const want = next(style) | 0;
        if (want === style) return style;
        const SetWindowLong = declareLong("Set", HWND, ctypes.int, ctypes.intptr_t);
        const SetWindowPos = lib.declare("SetWindowPos", ctypes.winapi_abi, ctypes.bool, HWND, HWND,
            ctypes.int, ctypes.int, ctypes.int, ctypes.int, ctypes.unsigned_int);
        SetWindowLong(hwnd, GWL_STYLE, ctypes.Int64(want));
        // NOSIZE | NOMOVE | NOZORDER | NOACTIVATE | FRAMECHANGED
        SetWindowPos(hwnd, HWND(0), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020);
        return Number(GetWindowLong(hwnd, GWL_STYLE).toString()) | 0;
    }
    catch (e) {
        try { Zotero.debug("[Weavero] wvWin32Style err: " + e); } catch (e2) {}
        return null;
    }
    finally {
        try { if (lib) lib.close(); } catch (e) {}
    }
}
