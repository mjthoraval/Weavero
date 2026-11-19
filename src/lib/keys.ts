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

/** Where an open lands (MJT 2026-11-17, the opening modifiers, one meaning on
 *  every surface where Weavero opens something; modules/open-where.ts acts on it):
 *  "here" the surface's own plain open, "beside" next to the tab it came from,
 *  "window" a new window, "background" a new tab that is not selected. */
export type WvOpenWhere = "here" | "beside" | "window" | "background";

/** The open a click or a key asks for: a middle click "background"; the
 *  platform's accelerator alone (Cmd on macOS, Ctrl elsewhere) "beside"; Shift
 *  alone "window"; anything else "here" -- Alt keeps its own meanings (the
 *  filters' exclude, text under annotations) and two modifiers are no gesture of
 *  ours. null: not an open at all -- a right click, and a Control-click on macOS,
 *  which is the system's context click (the menu opens on it; survey
 *  2026-11-17 §3). A key event (no `button`) reads the modifiers only, so
 *  Ctrl/Cmd+Enter is "beside" and Shift+Enter "window". `isMac` overrides the
 *  platform (the suite). */
export function wvOpenWhere(e: any, isMac?: boolean): WvOpenWhere | null {
    if (!e) return "here";
    let mac = !!isMac;
    if (isMac === undefined) { try { mac = !!(Zotero as any).isMac; } catch (_) { mac = false; } }
    if (typeof e.button === "number") {
        if (e.button === 1) return "background";
        if (e.button !== 0) return null;
        if (mac && e.ctrlKey && !e.metaKey) return null;
    }
    if (e.altKey) return "here";
    const accel = mac ? !!e.metaKey : !!e.ctrlKey;
    const shift = !!e.shiftKey;
    if (accel && !shift) return "beside";
    if (shift && !accel && !e.ctrlKey && !e.metaKey) return "window";
    return "here";
}
