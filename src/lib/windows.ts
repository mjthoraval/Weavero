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
 *  as the window icons (modules/tabs.ts _wvSetWindowIconFromFile). */
export function wvWin32Style(win: any, next?: (style: number) => number): number | null {
    let lib: any = null;
    try {
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs") as any;
        const bw = win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
        const handle = bw.nativeHandle;
        if (!handle) return null;
        lib = ctypes.open("user32.dll");
        const HWND = ctypes.voidptr_t;
        const GWL_STYLE = -16;
        const GetWindowLongPtrW = lib.declare("GetWindowLongPtrW", ctypes.winapi_abi, ctypes.intptr_t, HWND, ctypes.int);
        const hwnd = HWND(ctypes.UInt64(handle));
        // The style is 32 bits, sign-extended into LONG_PTR: `| 0` keeps it
        // an int32 so the bit operations and the write-back agree.
        const style = Number(GetWindowLongPtrW(hwnd, GWL_STYLE).toString()) | 0;
        if (!next) return style;
        const want = next(style) | 0;
        if (want === style) return style;
        const SetWindowLongPtrW = lib.declare("SetWindowLongPtrW", ctypes.winapi_abi, ctypes.intptr_t, HWND, ctypes.int, ctypes.intptr_t);
        const SetWindowPos = lib.declare("SetWindowPos", ctypes.winapi_abi, ctypes.bool, HWND, HWND,
            ctypes.int, ctypes.int, ctypes.int, ctypes.int, ctypes.unsigned_int);
        SetWindowLongPtrW(hwnd, GWL_STYLE, ctypes.Int64(want));
        // NOSIZE | NOMOVE | NOZORDER | NOACTIVATE | FRAMECHANGED
        SetWindowPos(hwnd, HWND(0), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020);
        return Number(GetWindowLongPtrW(hwnd, GWL_STYLE).toString()) | 0;
    }
    catch (e) {
        try { Zotero.debug("[Weavero] wvWin32Style err: " + e); } catch (e2) {}
        return null;
    }
    finally {
        try { if (lib) lib.close(); } catch (e) {}
    }
}
