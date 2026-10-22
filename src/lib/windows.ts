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
