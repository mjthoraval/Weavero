// Accelerator modifiers, Zotero's own split (survey 2026-10-06 §4 #9).
//
// Zotero's trees (virtualized-table.jsx) read a KEYBOARD accelerator
// platform-correctly -- Cmd on macOS, Ctrl elsewhere (`Zotero.isMac ?
// metaKey : ctrlKey`: Select All, the focus moves) -- and a mouse CLICK
// modifier loosely -- either key extends a selection (`ctrlKey ||
// metaKey`: its row clicks). Weavero had 26 loose and 14 platform-correct
// sites in five spellings, and eleven keyboard accelerators among the loose
// ones (Ctrl+Enter, Ctrl+A, Ctrl+F in the reader panels and the bookmark
// dialog took Ctrl on a Mac and the Windows key on Windows).

/** The platform's keyboard accelerator: Cmd on macOS, Ctrl elsewhere. */
export function wvAccel(e: any): boolean {
    try { return !!(e && ((Zotero as any).isMac ? e.metaKey : e.ctrlKey)); }
    catch (_) { return !!(e && e.ctrlKey); }
}

/** Either accelerator key -- for mouse clicks (a Ctrl- or Cmd-click
 *  toggles a selection on every platform, as in Zotero's trees) and for
 *  "any modifier held: not this gesture" checks. */
export function wvAccelAny(e: any): boolean {
    return !!(e && (e.ctrlKey || e.metaKey));
}
