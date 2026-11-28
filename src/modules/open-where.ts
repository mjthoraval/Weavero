// Module: where an open lands -- ONE meaning for the opening modifiers on every
// surface where Weavero opens something (MJT 2026-11-17, from the survey of that
// day, work/split-open-shortcuts-survey-2026-11-17.md: Ctrl+click had six
// meanings, Shift+click four, the middle button two, and a link in side A of a
// split never reached side B):
//   plain               "here"        the surface's own plain open
//   Ctrl+click (Cmd on  "beside"      next to the tab it came from:
//   macOS), Ctrl/Cmd+Enter              - that tab is a side of a two-tab split:
//                                         the pair's OTHER side becomes the target
//                                         (the tab that was there stays open);
//                                       - a lock is on in the window: the target's
//                                         tab is selected, which the lock shows
//                                         beside the locked tab (never replaced);
//                                       - the target is the same document: its
//                                         second view in Zotero's own same-file
//                                         split (reader.ts _wvCtrlNavigate);
//                                       - else a new split: that tab and the
//                                         target's, the target selected.
//   Shift+click,        "window"      a new window (Zotero's Shift rule,
//   Shift+Enter                         annotation.ts _wvOpenItemInNewWindow)
//   middle click        "background"  a new tab, not selected (Firefox's
//                                       middle click: nothing on screen moves);
//                                       a note opens in front (ZoteroPane.openNote,
//                                       the note-tab invariant: no background mode)
// The decision is lib/keys.ts wvOpenWhere (macOS: Control+click is the context
// click, never an open); `_wvOpenTarget` carries it out for a link or an item.
// A surface keeps its own plain open: "here" for an item returns false.
// Zotero's items list keeps ZOTERO's Shift rule -- the other way from the setting
// (Settings > General, open PDFs / notes in new windows) -- and Weavero makes it
// hold for notes too (WV-TEMP-128815, `_wvViewItemsShiftNotes` below).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvOpenWhere, wvAccel, WvOpenWhere } from "../lib/keys";
import { winOf, wvIsTextEntry } from "../lib/dom";
import { wvLivePlugin } from "../lib/live";
import { wvListen } from "../lib/listen";
import { wvIsLibraryTabID, wvItemsTreeEls, wvMainWins, wvNativeWindows } from "../lib/windows";
import { wvL10n } from "../lib/l10n";
import { wvSleep } from "../lib/timers";

declare const Zotero: any;

/** What an open is aimed at: a link, or an item with an optional place in it. */
export type WvOpenTargetSpec = { url?: string; item?: any; location?: any };
/** An item resolved to what opens: a reader on an attachment (at a place), a
 *  note, or an item that can only be shown in the library. */
type WvOpenSpec = { kind: "reader"; item: any; location?: any } | { kind: "note"; item: any } | { kind: "select"; item: any };

function tabIn(win: any, id: any): any {
    try { return win && win.Zotero_Tabs && id ? win.Zotero_Tabs._tabs.find((t: any) => t && t.id === id) || null : null; } catch (e) { return null; }
}
function isLibTab(t: any): boolean {
    return !!t && (wvIsLibraryTabID(t.id) || /^library(-|$)/.test(String(t.type || "")));
}
/** An attachment the reader opens (not a linked URL). */
function readerAtt(a: any): boolean {
    try {
        return !!(a && a.isAttachment && a.isAttachment() && a.attachmentReaderType
            && a.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL);
    } catch (e) { return false; }
}
/** The reader's type has an external viewer set (Settings > General > Open
 *  PDFs using): no tab can show it. */
function external(a: any): boolean {
    try { return !!Zotero.Prefs.get("fileHandler." + a.attachmentReaderType); } catch (e) { return false; }
}
/** The items list's Open entries for several items (weavero.ftl). */
const OPEN_SEVERAL_L10N = "weavero-menu-items-open-several";
const OPEN_SEVERAL_ID = "wv-itemmenu-open-one-window";
/** The kinds with a word of their own in that message; else attachment / item. */
const OPEN_SEVERAL_KINDS = ["pdf", "epub", "snapshot", "note"];

class _OpenWhereMixin {
    /** The open event `e` asks for (lib/keys.ts wvOpenWhere): "here", "beside",
     *  "window", "background", or null -- not an open (leave the event alone). */
    _wvOpenWhere(e: any): WvOpenWhere | null {
        return wvOpenWhere(e);
    }

    /** The main window (with tabs) that holds `from` -- a node, through the
     *  reader's and note editor's frames, or a window; null when it is not in one
     *  (a reader window of an older Zotero). */
    _wvOpenHostWin(from?: any): any {
        try {
            if (from && from.document && from.Zotero_Tabs) return from;
            let w: any = from && from.nodeType ? winOf(from) : null;
            if (w) {
                try { const top = w.browsingContext && w.browsingContext.topChromeWindow; if (top) w = top; } catch (e) {}
            }
            if (w && w.Zotero_Tabs) return w;
        } catch (e) {}
        return null;
    }

    /** The tab an open comes from: `from` itself when it is a tab id of `win`,
     *  else the tab whose content holds the node `from` (climbing out of frames),
     *  else the selected tab -- a press inside a side selects it first, and the
     *  context pane and the popups belong to the selected tab. */
    _wvOpenSourceTab(win: any, from?: any): string | null {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z) return null;
            if (typeof from === "string") return tabIn(win, from) ? from : Z.selectedID;
            const deck = win.document.getElementById("tabs-deck");
            let n: any = from && from.nodeType ? from : null;
            for (let i = 0; n && deck && i < 400; i++) {
                if (n.parentNode === deck) return n.id || Z.selectedID;
                if (n.parentNode) { n = n.parentNode; continue; }
                if (n.host) { n = n.host; continue; }
                const dv = n.defaultView;
                let fe: any = null;
                try { fe = dv && dv.browsingContext && dv.browsingContext.embedderElement; } catch (e) {}
                if (!fe) { try { fe = dv && dv.frameElement; } catch (e) {} }
                n = fe || null;
            }
            return Z.selectedID;
        } catch (e) { return null; }
    }

    /** What `item` opens: a note; an annotation's file at itself; a file the
     *  reader shows; a regular item's best attachment (Zotero's Enter,
     *  zoteroPane.js viewItems); else the item in the library. Null for a file
     *  only the system opens. */
    async _wvOpenSpecOf(item: any, location?: any): Promise<WvOpenSpec | null> {
        try {
            if (!item) return null;
            if (item.isNote && item.isNote()) return { kind: "note", item };
            if (item.isAnnotation && item.isAnnotation()) {
                const parent = item.parentItemID ? Zotero.Items.get(item.parentItemID) : null;
                if (readerAtt(parent)) return { kind: "reader", item: parent, location: location || { annotationID: item.key } };
                return { kind: "select", item };
            }
            if (item.isAttachment && item.isAttachment()) return readerAtt(item) ? { kind: "reader", item, location } : null;
            if (item.isRegularItem && item.isRegularItem()) {
                let best: any = null;
                try { best = await item.getBestAttachment(); } catch (e) {}
                if (readerAtt(best)) return { kind: "reader", item: best, location };
            }
            return { kind: "select", item };
        } catch (e) { return null; }
    }

    /** Open `target` -- a link (`url`) or an item (`item`, `location`) -- `where`
     *  says (`_wvOpenWhere`), from `from`: a node or a tab id (the tab the open
     *  comes from), in `win` or the main window holding `from`. A link always
     *  opens (a web or app link in its browser or app, whatever the modifier: no
     *  tab of Zotero's shows it); an item answers false for "here" and whenever
     *  the gesture cannot apply, and the caller then does its own plain open. */
    async _wvOpenTarget(win: any, target: WvOpenTargetSpec, where: WvOpenWhere | null, from?: any): Promise<boolean> {
        const P: any = this;
        try {
            if (!target || !where) return false;
            // "Beside" from a window without tabs (a reader or note window of an
            // older Zotero): there is no tab to be beside, the plain open.
            if (where === "beside" && from && from.nodeType && !this._wvOpenHostWin(from)) where = "here";
            const host = (win && win.Zotero_Tabs) ? win : (this._wvOpenHostWin(from) || win || null);
            if (target.url) {
                const url = String(target.url);
                if (!/^zotero:\/\//i.test(url)) { P._launchURL(url); return true; }
                await P.handleZoteroURI(url, { where, win: host, from });
                return true;
            }
            const item = target.item;
            if (!item || where === "here") return false;
            if (where === "window" && !target.location) {
                if (item.isNote && item.isNote()) {
                    const zp = (host && host.ZoteroPane) || (Zotero.getMainWindow() && Zotero.getMainWindow().ZoteroPane);
                    if (!zp) return false;
                    await zp.openNote(item.id, { openInWindow: true });
                    return true;
                }
                return !!(await P._wvOpenItemInNewWindow(item));
            }
            const spec = await this._wvOpenSpecOf(item, target.location);
            return await this._wvOpenSpecWhere(host, spec, where, from);
        } catch (e) { Zotero.debug("[Weavero] _wvOpenTarget err: " + e); return false; }
    }

    /** `spec` opened `where`, from `from`. False: not done (the caller's plain open). */
    async _wvOpenSpecWhere(win: any, spec: WvOpenSpec | null, where: WvOpenWhere, from?: any): Promise<boolean> {
        const P: any = this;
        try {
            if (!spec || where === "here") return false;
            if (where === "window") {
                if (spec.kind === "note") {
                    const zp = (win && win.ZoteroPane) || (Zotero.getMainWindow() && Zotero.getMainWindow().ZoteroPane);
                    if (!zp) return false;
                    await zp.openNote(spec.item.id, { openInWindow: true });
                    return true;
                }
                if (spec.kind === "reader") {
                    // Zotero's own way, an external viewer included (fileHandlers.js).
                    const FH = Zotero.FileHandlers;
                    if (FH && typeof FH.open === "function") await FH.open(spec.item, { location: spec.location || null, openInWindow: true });
                    else await Zotero.Reader.open(spec.item.id, spec.location || null, { openInWindow: true });
                    return true;
                }
                return false;
            }
            if (spec.kind === "select") {
                const link = P._buildSelectLink && P._buildSelectLink(spec.item);
                if (!link) return false;
                return await this._wvOpenSelectWhere(win, link, where, from);
            }
            if (where === "background") return await this._wvOpenInBackground(win, spec, from);
            if (where === "beside") return await this._wvOpenBeside(win, spec, from);
        } catch (e) { Zotero.debug("[Weavero] _wvOpenSpecWhere err: " + e); }
        return false;
    }

    /** A tab of `win` showing `spec`: a reader opened in the background when there
     *  is none (Zotero.Reader.open `openInBackground`: the tab is added, not
     *  selected), a note through ZoteroPane.openNote (selected: no background
     *  mode). `{ id, fresh }`, `fresh` when it was just made, at the place asked. A
     *  tab of the same document as `notTab` does not count: that view never moves
     *  (a duplicate reader is made). Null when no tab can show it. */
    async _wvOpenTabFor(win: any, spec: WvOpenSpec, notTab?: string | null): Promise<{ id: string; fresh: boolean } | null> {
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z || !spec || spec.kind === "select") return null;
            const it = spec.item;
            const kind = spec.kind === "note" ? "note" : "reader";
            if (kind === "reader" && (!readerAtt(it) || external(it))) return null;
            const find = () => Z._tabs.find((t: any) => t && t.data && t.data.itemID === it.id
                && t.id !== notTab && String(t.type || "").startsWith(kind)) || null;
            const ex = find();
            if (ex) return { id: ex.id, fresh: false };
            if (kind === "reader") {
                const r: any = await Zotero.Reader.open(it.id, (spec as any).location || null,
                    { openInBackground: true, openInWindow: false, allowDuplicate: true, window: win } as any);
                const id = r && r.tabID;
                if (id && tabIn(win, id)) return { id, fresh: true };
            }
            else {
                // A note tab opens through ZoteroPane.openNote with openInWindow
                // false ONLY (CLAUDE.md, hard invariant): it opens in front --
                // Zotero's note opener has no background mode.
                const zp = win.ZoteroPane;
                if (zp && typeof zp.openNote === "function") await zp.openNote(it.id, { openInWindow: false });
            }
            const made = find();
            return made ? { id: made.id, fresh: true } : null;
        } catch (e) { Zotero.debug("[Weavero] _wvOpenTabFor err: " + e); return null; }
    }

    /** A new tab in the background (Firefox's middle click): the target's tab is
     *  added, not selected; one already open off screen is reused (and taken to the
     *  place asked when it is loaded). Nothing on screen changes: a target already
     *  on screen -- the tab clicked in, or the other side of its split -- gets a
     *  tab of its own, so the view shown never moves. */
    async _wvOpenInBackground(win: any, spec: WvOpenSpec, from?: any): Promise<boolean> {
        const P: any = this;
        try {
            if (!win || !win.Zotero_Tabs) win = Zotero.getMainWindow();
            const Z = win && win.Zotero_Tabs;
            if (!Z) return false;
            // A note opens the plain way, in front: Zotero's note opener has no
            // background mode, and a note tab opens through ZoteroPane.openNote
            // with openInWindow false ONLY (CLAUDE.md, hard invariant).
            if (spec.kind === "note") {
                const zp = win.ZoteroPane;
                if (!zp || typeof zp.openNote !== "function") return false;
                await zp.openNote(spec.item.id, { openInWindow: false });
                return true;
            }
            const sel = Z.selectedID;
            const src = this._wvOpenSourceTab(win, from) || sel;
            // On screen: the source, the selected tab and the side drawn beside it.
            const onScreen = (id: string) => id === src || id === sel || !!(P._wvTabSplitVisible && P._wvTabSplitVisible(win, id));
            let skip: string | null = src;
            const it = spec.item;
            const ex = Z._tabs.find((t: any) => t && t.data && t.data.itemID === it.id && String(t.type || "").startsWith("reader") && onScreen(t.id));
            if (ex) skip = ex.id;
            const r = await this._wvOpenTabFor(win, spec, skip);
            if (!r) return false;
            if (!r.fresh && spec.kind === "reader" && spec.location && !onScreen(r.id)) {
                try { const rd: any = Zotero.Reader.getByTabID(r.id); if (rd) rd.navigate(spec.location); } catch (e) {}
            }
            if (Z.selectedID !== sel && tabIn(win, sel)) Z.select(sel);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvOpenInBackground err: " + e); return false; }
    }

    /** A middle click on an internal link of `reader`'s document: the same
     *  document at `location` in a new tab, in the background (reader.ts, the
     *  link handlers). The view clicked in never moves. */
    async _wvOpenReaderBackground(reader: any, location: any): Promise<boolean> {
        try {
            const item = reader && reader.itemID ? Zotero.Items.get(reader.itemID) : null;
            if (!item) return false;
            const win = reader._window && reader._window.Zotero_Tabs ? reader._window : Zotero.getMainWindow();
            return await this._wvOpenInBackground(win, { kind: "reader", item, location }, reader.tabID || null);
        } catch (e) { Zotero.debug("[Weavero] _wvOpenReaderBackground err: " + e); return false; }
    }

    /** "Beside" (the header): the target next to the tab it came from. False when
     *  it cannot apply -- no tabs in the window (a reader window of an older
     *  Zotero), the split view off, an external viewer -- and the caller opens it
     *  plainly. */
    async _wvOpenBeside(win: any, spec: WvOpenSpec, from?: any): Promise<boolean> {
        const P: any = this;
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z || !P._wvTabSplitOn() || !spec) return false;
            const src = this._wvOpenSourceTab(win, from) || Z.selectedID;
            const st = tabIn(win, src);
            // The same document: its second view, Zotero's split of one file
            // (reader.ts, Weavero's Ctrl+click on an internal link).
            if (st && st.data && st.data.itemID === spec.item.id) {
                if (spec.kind === "reader" && spec.location) {
                    const rd: any = Zotero.Reader.getByTabID(src);
                    if (rd && typeof P._wvCtrlNavigate === "function") { await P._wvCtrlNavigate(rd, true, spec.location); return true; }
                }
                return spec.kind === "note";
            }
            const r = await this._wvOpenTabFor(win, spec, src);
            if (!r) return false;
            await this._wvOpenArrange(win, src, r.id, spec.kind === "reader" ? spec.location : null, !r.fresh);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvOpenBeside err: " + e); return false; }
    }

    /** A `zotero://select` link (or an item only the library shows) "beside" or
     *  "background". Beside: the library shows the item next to the tab it came
     *  from, through Zotero's own select (which shows a library tab), then the
     *  layout; from a library tab itself it is the plain select (false).
     *  Background: the item selected in the library, the tab on screen kept. */
    async _wvOpenSelectWhere(win: any, url: string, where: WvOpenWhere, from?: any): Promise<boolean> {
        const P: any = this;
        try {
            const Z = win && win.Zotero_Tabs;
            if (!Z) return false;
            const src = this._wvOpenSourceTab(win, from) || Z.selectedID;
            if (where === "background") {
                const sel = Z.selectedID;
                await P.handleZoteroURI(url, { win, noSwitch: true });
                if (Z.selectedID !== sel && tabIn(win, sel)) Z.select(sel);
                return true;
            }
            if (where !== "beside" || !P._wvTabSplitOn() || isLibTab(tabIn(win, src))) return false;
            await P.handleZoteroURI(url, { win });
            // Zotero's select ends with the library tab's select (zoteroPane.js
            // selectItems), which Weavero's Open Link in Split View waited for too.
            await new Promise((res) => win.setTimeout(res, 150));
            const to = Z.selectedID;
            if (to && to !== src) await this._wvOpenArrange(win, src, to, null, false);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvOpenSelectWhere err: " + e); return false; }
    }

    /** Lay out `to` beside `src` (the header's three cases) and select it, at
     *  `location` -- a tab that was there already and is loaded is taken there
     *  (`navigate`), an unloaded one loads there (Zotero_Tabs.select's location). */
    async _wvOpenArrange(win: any, src: string, to: string, location: any, navigate: boolean) {
        const P: any = this;
        const Z = win.Zotero_Tabs;
        try {
            const d = typeof P._wvTabDockOf === "function" ? P._wvTabDockOf(win) : null;
            // What is drawn for `src`: the split the split view would draw for it. The
            // lock comes before a pair (tab-split-dock.ts, Lock Tab): when the lock's
            // split is what is on screen for `src`, it is the lock case below, even if
            // `src` has a pair of its own (_wvTabSplitOf returns that pair first).
            const shown = typeof P._wvTabSplitShownOf === "function" ? P._wvTabSplitShownOf(win, src) : null;
            const s = shown && shown.dock ? null : P._wvTabSplitOf(win, src);
            const pair = s && !s.dock && !s.picker && s.right ? s : null;
            if (pair) {
                const side: "left" | "right" = pair.left === src ? "left" : "right";
                const other = side === "left" ? pair.right : pair.left;
                // The locked tab is never put in a pair (that would end the lock):
                // selected, the lock shows it.
                if (to !== other && !(d && to === d.lib)) {
                    const share = side === "left" ? pair.ratio : 1 - pair.ratio;
                    const o = P._wvTabSplitOf(win, to);
                    if (o && !o.dock && o !== pair) P._wvTabSplitRemove(win, o.id);
                    // A new pair of the source and the target, the source on its
                    // side: the pair's own machinery gives back the old side's pin
                    // and takes the new one's (tab-split.ts _wvTabSplitCreate).
                    P._wvTabSplitRemove(win, pair.id);
                    const ns = P._wvTabSplitCreate(win, src, to, { select: "none", ratio: share });
                    if (ns && (ns.left === src ? "left" : "right") !== side) P._wvTabSplitReverse(win, ns.id);
                }
            }
            else if (!d) {
                // No split, no lock: a new split of the two, the target selected.
                const o = P._wvTabSplitOf(win, to);
                if (o && !o.dock) P._wvTabSplitRemove(win, o.id);
                P._wvTabSplitCreate(win, src, to, { select: "none" });
            }
            // A lock: the selected tab is what it shows beside the locked one.
            const t = tabIn(win, to);
            const unloaded = !!t && /-unloaded$/.test(String(t.type || ""));
            if (Z.selectedID !== to) Z.select(to, false, (location && unloaded) ? { location } : {});
            if (location && navigate && !unloaded) {
                try { const rd: any = Zotero.Reader.getByTabID(to); if (rd) rd.navigate(location); } catch (e) {}
            }
            try { P._wvTabSplitSync(win); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvOpenArrange err: " + e); }
    }

    /** Ctrl/Cmd+Enter in the items list: the selected item beside (Zotero's
     *  virtualized-table opens on Enter whatever the modifiers, and its shortcut
     *  API cannot take an Enter combination -- survey 2026-11-17 §3 -- so this is
     *  Weavero's own listener, in the capture phase ahead of the tree). Never in a
     *  text field, nor in a note editor (Ctrl+Enter is a line break there: its
     *  keys never reach an items tree). On macOS Cmd+Return (Zotero blocks
     *  Control+Return). An item "beside" cannot show (a file only the system
     *  opens) opens as Enter did. */
    _wvWireOpenBesideKey(win: any) {
        try {
            if (!win || !win.document) return;
            wvListen(win, "openBesideKey", "keydown", (e: any) => {
                try {
                    if (e.key !== "Enter" || e.altKey || e.shiftKey || !wvAccel(e)) return;
                    const lp: any = wvLivePlugin();
                    if (!lp || lp._wvDestroyed) return;
                    const t = e.target;
                    if (!t || wvIsTextEntry(t)) return;
                    const tree = wvItemsTreeEls(win.document).find((el: any) => el && typeof el.contains === "function" && el.contains(t));
                    if (!tree) return;
                    const zp = win.ZoteroPane;
                    const items = (zp && typeof zp.getSelectedItems === "function") ? zp.getSelectedItems() : [];
                    if (!items || !items.length) return;
                    e.preventDefault(); e.stopPropagation();
                    if (e.repeat) return;
                    Promise.resolve(lp._wvOpenItemsBeside(win, items, tree)).catch(() => {});
                } catch (er) {}
            }, true, (this as any)._wvWireTag());
        } catch (e) { Zotero.debug("[Weavero] _wvWireOpenBesideKey err: " + e); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-128815 (forums.zotero.org/discussion/128815, upstream register #69).
    // Shift+Enter / Shift+double-click on a NOTE in the items list should open it the
    // OTHER way from Settings > General > "Open notes in new windows", as Shift does for
    // a PDF (zoteroPane.js viewAttachment inverts openReaderInNewWindow). Zotero's
    // viewItems sets the note's openInWindow from Shift alone (`event?.shiftKey ||
    // options.forceAlternateWindowBehavior`, 11.0-beta.4 and 10.0.8), so with the
    // setting on, Shift opens a window too. Here, called from Weavero's viewItems wrapper
    // (reader.ts _wvSetupMultiOpenConsolidation) with Zotero's own viewItems as `orig`:
    // the items tree's Shift (the event's shiftKey) opens each note through
    // ZoteroPane.openNote with the setting inverted (CLAUDE.md: notes open through
    // ZoteroPane.openNote only); the other items go to Zotero's viewItems in their order.
    // Left to Zotero: the Locate menu's alternate entry (forceAlternateWindowBehavior --
    // its label follows the READER's setting, locateMenu.js ViewItem; zotero PR #5866
    // changes both together), and a view Zotero would not open a note from (not editable).
    //
    // RETIRE WHEN Zotero's viewItems reads openNoteInNewWindow or inverts the note's
    // openInWindow (PR zotero#5866 does both); the gate below reads its source and
    // stands down. Tripwire in test/open-where.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    /** Zotero's own `viewItems` (`orig`) still ignores the note setting on Shift. */
    _wvShiftNoteBugIn(orig: any): boolean {
        try {
            const m = /\.isNote\(\)\)\s*\{([\s\S]{0,400}?)openNote\(/.exec(String(orig || ""));
            if (!m) return false;
            const branch = m[1];
            return /shiftKey/.test(branch) && !/openNoteInNewWindow|=\s*!\s*openInWindow/.test(branch);
        } catch (e) { return false; }
    }

    /** The items tree's Shift on notes, Zotero's PDF rule (WV-TEMP-128815): true when
     *  done here, false to leave the whole call to Zotero's `orig`. */
    async _wvViewItemsShiftNotes(zp: any, orig: any, items: any[], event: any, options: any): Promise<boolean> {
        // Once an open is issued this call owns the outcome: false after that would
        // make the wrapper run Zotero's viewItems on top -- every item opened twice.
        let issued = false;
        try {
            if (!zp || typeof orig !== "function" || !Array.isArray(items) || !items.length) return false;
            if (!event || !event.shiftKey || (options && options.forceAlternateWindowBehavior)) return false;
            const isNote = (it: any) => { try { return !!(it && it.isNote && it.isNote()); } catch (e) { return false; } };
            if (!items.some(isNote) || !this._wvShiftNoteBugIn(orig)) return false;
            let inWindow = false;
            try { inWindow = !!Zotero.Prefs.get("openNoteInNewWindow"); } catch (e) {}
            Zotero.debug("[Weavero] WV-TEMP-128815: Shift on a note in the items list -> " + (inWindow ? "a tab" : "a window"));
            issued = true;
            let rest: any[] = [];
            const flush = async () => {
                if (!rest.length) return;
                const batch = rest;
                rest = [];
                await orig.call(zp, batch, event, options);
            };
            for (const it of items) {
                if (!isNote(it)) { rest.push(it); continue; }
                await flush();
                // Zotero's own rule: no note opens from a view that is not editable.
                const cv = zp.collectionsView;
                if (cv && cv.editable === false) continue;
                // Not awaited, as Zotero's viewItems does not await it.
                Promise.resolve(zp.openNote(it.id, { openInWindow: !inWindow })).catch((e: any) => Zotero.logError(e));
            }
            await flush();
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvViewItemsShiftNotes err: " + e); return issued; }
    }

    /** The items list's "beside": its first selected item, else Zotero's Enter. */
    async _wvOpenItemsBeside(win: any, items: any[], from?: any) {
        try {
            if (!items || !items.length) return;
            if (await this._wvOpenTarget(win, { item: items[0] }, "beside", from)) return;
            const zp = win && win.ZoteroPane;
            if (zp && typeof zp.viewItems === "function") await zp.viewItems(items);
        } catch (e) { Zotero.debug("[Weavero] _wvOpenItemsBeside err: " + e); }
    }

    // ---- Several items at once: One New Window (MJT 2026-11-24) --------------
    // "When I select multiple items, I have the option to open in tabs, or in a
    // new window. But they all open in separate windows. I think that there
    // should be an option to open them all in a single new window."
    // Guard: test/open-several.spec.js.

    /** What one selected item opens, as Zotero's "Open … in New Tab / New
     *  Window" open it (locateMenu.js ViewItem `_getFirstUsableItem`): a note
     *  itself; an attachment the reader shows (not a linked URL); for a regular
     *  item the first such attachment of `getBestAttachments()` -- Weavero's
     *  default attachment first (attachments.ts hoists it there), then Zotero's
     *  order (item.js: PDFs, the parent's URL, the oldest). Synchronous, as the
     *  menu labels itself while it opens; the items list's rows have their
     *  children loaded. Null for anything else: an annotation, an item with no
     *  such file. */
    _wvOpenSeveralUsable(item: any): any {
        const P: any = this;
        try {
            if (!item) return null;
            if (item.isNote && item.isNote()) return item;
            if (item.isAttachment && item.isAttachment()) return readerAtt(item) ? item : null;
            if (!(item.isRegularItem && item.isRegularItem())) return null;
            const cands: any[] = [];
            try {
                const best = P._wvGetBestAttachmentSync && P._wvGetBestAttachmentSync(item);
                if (best) cands.push(best);
            } catch (e) {}
            const url = String((item.getField && item.getField("url")) || "");
            const atts: any[] = [];
            for (const id of (item.getAttachments() || [])) {
                const a: any = Zotero.Items.get(id);
                if (a && !a.deleted && a.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL) atts.push(a);
            }
            const key = (a: any) => ({
                pdf: a.attachmentContentType === "application/pdf" ? 0 : 1,
                url: (url && a.getField("url") === url) ? 0 : 1,
                added: String(a.dateAdded || ""),
            });
            atts.sort((x: any, y: any) => {
                const a = key(x), b = key(y);
                if (a.pdf !== b.pdf) return a.pdf - b.pdf;
                if (a.url !== b.url) return a.url - b.url;
                return a.added < b.added ? -1 : (a.added > b.added ? 1 : 0);
            });
            for (const a of cands.concat(atts)) if (readerAtt(a)) return a;
            return null;
        } catch (e) { return null; }
    }

    /** What `items` open together: in selection order, each document or note
     *  once (`_wvOpenSeveralUsable`), a note only where the library can be
     *  edited (zoteroPane.js viewItems skips notes otherwise). `kind` names
     *  them as Zotero's own label does (item-menu-viewAttachment): pdf, epub,
     *  snapshot or note when all are of one kind, attachment for documents of
     *  several kinds, item when notes and documents mix. `external`: one of
     *  them opens in another application (Settings > General, "Open PDFs
     *  using"), where no tab can show it. */
    _wvOpenSeveralPlan(win: any, items: any[]): { entries: Array<{ item: any; type: string }>; kind: string; external: boolean } {
        const entries: Array<{ item: any; type: string }> = [];
        let ext = false;
        let notesOK = true;
        try {
            const cv = win && win.ZoteroPane && win.ZoteroPane.collectionsView;
            if (cv && cv.editable === false) notesOK = false;
        } catch (e) {}
        const seen = new Set<number>();
        for (const it of (items || [])) {
            const u = this._wvOpenSeveralUsable(it);
            if (!u || seen.has(u.id)) continue;
            const isNote = !!(u.isNote && u.isNote());
            if (isNote && !notesOK) continue;
            seen.add(u.id);
            if (!isNote && external(u)) ext = true;
            entries.push({ item: u, type: isNote ? "note" : String(u.attachmentReaderType || "") });
        }
        const types = new Set(entries.map((e) => e.type));
        let kind = "item";
        if (types.size === 1) kind = OPEN_SEVERAL_KINDS.includes(entries[0].type) ? entries[0].type : "attachment";
        else if (types.size > 1) kind = types.has("note") ? "item" : "attachment";
        return { entries, kind, external: ext };
    }

    /** One New Window can open: in Zotero's own windows (zotero#6035) with
     *  Tabs and Windows on, else in Weavero's (Multiple main windows). */
    _wvOpenSeveralWindowOK(): boolean {
        const P: any = this;
        try { return wvNativeWindows() ? !!P._getTabsAndWindowsMaster() : !!P._wvMultiMainOn(); }
        catch (e) { return false; }
    }

    /** The items list's Open entries for SEVERAL items. Zotero builds "Open
     *  PDFs in New Tab" and "Open PDFs in New Window" (locateMenu.js ViewItem:
     *  `item-menu-viewAttachment`, args openIn "tab" / "window", marked
     *  `zotero-locate`) afresh at the top of the menu at every opening. Where
     *  two or more things open, Weavero relabels both for that opening, "Open 3
     *  PDFs in New Tabs" and "Open 3 PDFs in Separate Windows" (marked
     *  `data-wv-open-several`; their commands stay Zotero's), and puts its own
     *  "Open 3 PDFs in One New Window" just before the window one. Nothing for
     *  one item, for a selection of which one thing opens, when another
     *  application opens some of it, or when no new window can open
     *  (`_wvOpenSeveralWindowOK`): Zotero's entries stay as Zotero wrote them,
     *  as they are again at the next opening without Weavero.
     *  Built by hand, not through MenuManager: MenuManager puts a plugin's
     *  entries at the END of this menu after its group separator, and one moved
     *  up here would leave that separator dangling at the bottom of every items
     *  menu. Ours carries `zotero-locate` too, so Zotero's own clean-up
     *  (buildItemContextMenu removes the top `zotero-locate` entries before it
     *  addresses the rest BY INDEX) takes it if popuphidden never came;
     *  popuphidden removes it (pane.ts _setupItemsMenuForWindow). */
    _wvOpenSeveralItemsMenu(doc: any, menu: any, selected: any[], win: any) {
        try {
            const old = doc.getElementById(OPEN_SEVERAL_ID);
            if (old) old.remove();
            if (!menu || !selected || selected.length < 2 || !this._wvOpenSeveralWindowOK()) return;
            const plan = this._wvOpenSeveralPlan(win, selected);
            if (plan.external || plan.entries.length < 2) return;
            const count = plan.entries.length, kind = plan.kind;
            const ids = selected.map((it: any) => it && it.id).filter((x: any) => x != null);
            let mi: any = null;
            const place = () => {
                try {
                    let tabs: any = null, wins: any = null;
                    for (const x of Array.from(menu.children) as any[]) {
                        if (x.localName !== "menuitem") continue;
                        let where = x.getAttribute("data-wv-open-several");
                        if (!where && x.getAttribute("data-l10n-id") === "item-menu-viewAttachment") {
                            try {
                                const a = JSON.parse(x.getAttribute("data-l10n-args") || "{}");
                                where = a.openIn === "tab" ? "tabs" : (a.openIn === "window" ? "windows" : null);
                            } catch (e) {}
                        }
                        if (where === "tabs" && !tabs) tabs = x;
                        else if (where === "windows" && !wins) wins = x;
                    }
                    if (!tabs || !wins || tabs.hidden || wins.hidden) return;
                    for (const [el, where] of [[tabs, "tabs"], [wins, "windows"]] as any[]) {
                        const args = { count, kind, where };
                        el.setAttribute("data-wv-open-several", where);
                        if (el.getAttribute("data-l10n-id") !== OPEN_SEVERAL_L10N
                                || el.getAttribute("data-l10n-args") !== JSON.stringify(args)) {
                            wvL10n(el, OPEN_SEVERAL_L10N, args);
                        }
                    }
                    if (!mi) {
                        mi = doc.createXULElement("menuitem");
                        mi.id = OPEN_SEVERAL_ID;
                        mi.setAttribute("zotero-locate", "true");
                        wvL10n(mi, OPEN_SEVERAL_L10N, { count, kind, where: "window" });
                        mi.addEventListener("command", () => {
                            try {
                                const lp: any = wvLivePlugin();
                                if (!lp) return;
                                const items = ids.map((id: any) => Zotero.Items.get(id)).filter(Boolean);
                                lp._wvOpenSeveralInOneWindow(win, items)
                                    .catch((e: any) => Zotero.debug("[Weavero] One New Window err: " + e));
                            } catch (e) { Zotero.debug("[Weavero] One New Window err: " + e); }
                        });
                    }
                    if (mi.parentNode !== menu || mi.nextSibling !== wins) menu.insertBefore(mi, wins);
                    // Its neighbour's classes: Zotero's icon for the kind
                    // (locateMenu.js ViewItem.className), where the menu shows icons.
                    const cls = wins.getAttribute("class");
                    if (cls) { if (mi.getAttribute("class") !== cls) mi.setAttribute("class", cls); }
                    else if (mi.hasAttribute("class")) mi.removeAttribute("class");
                } catch (e) { Zotero.debug("[Weavero] open several menu err: " + e); }
            };
            place();
            // Again once Zotero is surely done with its entries, as the Split
            // View entry does (tab-split.ts _wvTabSplitItemsMenu); never into a
            // menu that has closed (popuphidden took the entry away).
            const again = () => { try { if (menu.state === "showing" || menu.state === "open") place(); } catch (e) {} };
            try { win.setTimeout(again, 0); win.setTimeout(again, 60); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvOpenSeveralItemsMenu err: " + e); }
    }

    /** "Open … in One New Window": ONE new main window holding what `items`
     *  open as tabs in selection order, the first one selected (as Firefox's
     *  replaceTabsWithWindow keeps the active tab active, Tabbrowser.sys.mjs).
     *  Zotero 11: no library tab, as Zotero's own "Open in New Window" makes
     *  none (`_wvOpenSeveralNative`). Zotero 9/10: a main window of Weavero's,
     *  with the one fixed library tab every Zotero 9/10 main window has
     *  (tabs.js 10.0.8, 'zotero-pane'). A document goes in as an unloaded
     *  reader tab, as Zotero's session restore adds one (tabs.js
     *  restoreState), so only the tab shown loads; a note opens through
     *  ZoteroPane.openNote in that window (`_wvOpenSeveralNote`); an item with
     *  nothing to open is skipped. The window, or null. */
    async _wvOpenSeveralInOneWindow(srcWin: any, items: any[]): Promise<any> {
        const P: any = this;
        try {
            const plan = this._wvOpenSeveralPlan(srcWin, items);
            if (!plan.entries.length || !this._wvOpenSeveralWindowOK()) return null;
            if (wvNativeWindows()) return await this._wvOpenSeveralNative(srcWin, plan.entries);
            const w = await this._wvOpenSeveralNewWindow(srcWin);
            if (!w || w.closed || P._wvDestroyed) return null;
            const Z = w.Zotero_Tabs;
            let first: { id: string; itemID: number; note: boolean } | null = null;
            for (const e of plan.entries) {
                let id: string | null = null;
                try {
                    if (e.type === "note") id = await this._wvOpenSeveralNote(w, e.item);
                    else {
                        const r = Z.add({ type: "reader-unloaded", data: { itemID: e.item.id }, select: false });
                        id = (r && r.id) || null;
                    }
                }
                catch (er) { Zotero.debug("[Weavero] One New Window: " + e.item.id + ": " + er); }
                if (id && !first) first = { id, itemID: e.item.id, note: e.type === "note" };
                if (P._wvDestroyed || w.closed) return w;
            }
            if (first) await this._wvOpenSeveralSelect(w, first);
            return w;
        } catch (e) { Zotero.debug("[Weavero] _wvOpenSeveralInOneWindow err: " + e); return null; }
    }

    /** One New Window on Zotero 11, opened as Zotero opens one. Zotero's "Open
     *  in New Window" opens a main window whose only tab is the reader tab
     *  (xpcom/reader.js _openInNewWindow: Zotero.openMainWindow with a
     *  readerTabState; zoteroPane.js adds that tab alone, and a library tab
     *  only in a window opened with nothing else to show -- openInitialLibraryTab
     *  in the last `else`). So the first document seeds the window that way
     *  and the others join it. Notes alone: Zotero seeds a note's window from a
     *  noteTabState (xpcom/data/notes.js _openInNewWindow), but Weavero opens
     *  note tabs through ZoteroPane.openNote only (AGENTS.md, hard invariant):
     *  the window starts as Ctrl+N's, the notes open in it, then its library
     *  tab closes (Zotero 11's library tabs are closable, tabs.js
     *  createLibraryTab). The tabs end in selection order, the first selected.
     *  MJT 2026-11-25: "If I open several PDF in a new window, they also get a
     *  library tab. Why?" -- 1.3.0-peoplenet.7 opened every such window as
     *  Ctrl+N's. The window, or null. */
    async _wvOpenSeveralNative(srcWin: any, entries: Array<{ item: any; type: string }>): Promise<any> {
        const P: any = this;
        const seed = entries.find((e) => e.type !== "note") || null;
        let w: any = null;
        if (seed) {
            w = Zotero.openMainWindow({ readerTabState: { itemID: seed.item.id } });
            if (!(await this._wvOpenSeveralLoaded(w))) return null;
        }
        else w = await this._wvOpenSeveralNewWindow(srcWin);
        if (!w || w.closed || P._wvDestroyed) return null;
        const Z = w.Zotero_Tabs;
        const tabs: Array<{ id: string; itemID: number; note: boolean }> = [];
        for (const e of entries) {
            let id: string | null = null;
            try {
                if (e === seed) {
                    const t = (Z._tabs || []).find((x: any) => x && x.data && x.data.itemID === e.item.id && /^reader/.test(String(x.type || "")));
                    id = t ? t.id : null;
                }
                else if (e.type === "note") id = await this._wvOpenSeveralNote(w, e.item);
                else {
                    const r = Z.add({ type: "reader-unloaded", data: { itemID: e.item.id }, select: false });
                    id = (r && r.id) || null;
                }
            }
            catch (er) { Zotero.debug("[Weavero] One New Window: " + e.item.id + ": " + er); }
            if (id && !tabs.some((t) => t.id === id)) tabs.push({ id, itemID: e.item.id, note: e.type === "note" });
            if (P._wvDestroyed || w.closed) return w;
        }
        if (!seed && tabs.length) {
            const libs = (Z._tabs || []).filter((t: any) => t && Z._isLibraryTab(t) && !tabs.some((x) => x.id === t.id)).map((t: any) => t.id);
            try { if (libs.length) Z.close(libs, { skipHistory: true }); }
            catch (er) { Zotero.debug("[Weavero] One New Window: library tab: " + er); }
        }
        // Selection order: each tab moved to its place, left to right (tabs.js move).
        tabs.forEach((t, i) => { try { Z.move(t.id, i); } catch (er) {} });
        if (tabs.length) await this._wvOpenSeveralSelect(w, tabs[0]);
        return w;
    }

    /** A window from Zotero.openMainWindow, waited for as Zotero waits for one
     *  (xpcom/reader.js _openInNewWindow: its load, then ZoteroPane.loadedPromise,
     *  which zoteroPane.js resolves once the window's first tabs are added).
     *  Bounded; false when the window never got there. */
    async _wvOpenSeveralLoaded(w: any, timeoutMs = 20000): Promise<boolean> {
        const P: any = this;
        const t0 = Date.now();
        let pane: any = null;
        while (Date.now() - t0 < timeoutMs && !P._wvDestroyed) {
            if (!w || w.closed) return false;
            try { if (w.ZoteroPane && w.ZoteroPane.loadedPromise && w.Zotero_Tabs) { pane = w.ZoteroPane; break; } } catch (e) {}
            await wvSleep(100);
        }
        if (!pane) return false;
        let done = false;
        Promise.resolve(pane.loadedPromise).then(() => { done = true; }, () => {});
        while (!done && Date.now() - t0 < timeoutMs && !P._wvDestroyed && !w.closed) await wvSleep(100);
        return done && !w.closed;
    }

    /** A new main window with its library tab alone, once its pane is ready:
     *  on Zotero 11 Ctrl+N's (ZoteroPane.newWindow: a window opened with a
     *  library tab state, zotero#6035), used for a window of notes alone
     *  (`_wvOpenSeveralNative`); on Zotero 9/10 Weavero's, through the one
     *  spawn sequence (tabs.ts _wvSpawnMainWindowStart: a clean window on My
     *  Library, raised as Ctrl+N's is). Null when none came. */
    async _wvOpenSeveralNewWindow(srcWin: any): Promise<any> {
        const P: any = this;
        const ready = (w: any) => {
            try { return !!(w && !w.closed && w.Zotero_Tabs && w.ZoteroPane && w.ZoteroPane.itemsView && w.ZoteroPane.collectionsView); }
            catch (e) { return false; }
        };
        try {
            if (wvNativeWindows()) {
                const zp = srcWin && srcWin.ZoteroPane;
                if (!zp || typeof zp.newWindow !== "function") return null;
                const before = new Set(wvMainWins());
                let w: any = zp.newWindow();
                const t0 = Date.now();
                while (Date.now() - t0 < 20000 && !P._wvDestroyed) {
                    if (!w || w.closed) w = wvMainWins().find((x: any) => !before.has(x)) || null;
                    if (ready(w)) return w;
                    await wvSleep(100);
                }
                return null;
            }
            if (!P._wvMultiMainOn()) return null;
            P._wvPrimeNewWindowLanding();
            const s = P._wvSpawnMainWindowStart();
            if (!s) return null;
            P._wvRaiseNewMainWindow(s.before);
            const w = await P._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 20000, timerWin: srcWin });
            const t0 = Date.now();
            while (w && !ready(w) && Date.now() - t0 < 10000 && !P._wvDestroyed) await wvSleep(100);
            return ready(w) ? w : null;
        } catch (e) { Zotero.debug("[Weavero] _wvOpenSeveralNewWindow err: " + e); return null; }
    }

    /** A note as a tab of `w`, through ZoteroPane.openNote with openInWindow
     *  false ONLY (CLAUDE.md, hard invariant), asked of that window's own pane:
     *  Zotero 11 passes the pane's window on (zoteroPane.js openNote); Zotero
     *  9/10's Notes.open takes the focused main window, pointed at `w` for the
     *  call (tabs.ts _wvWithMainWindow). The tab's id, or null when Zotero put
     *  none there: Zotero 10 never duplicates a note open in a tab, and only
     *  shows that tab. */
    async _wvOpenSeveralNote(w: any, note: any): Promise<string | null> {
        const P: any = this;
        const zp = w && w.ZoteroPane;
        if (!zp || typeof zp.openNote !== "function") return null;
        const run = () => zp.openNote(note.id, { openInWindow: false });
        if (wvNativeWindows()) await run();
        else await P._wvWithMainWindow(w, run);
        const t = (w.Zotero_Tabs._tabs || []).find((x: any) => x && x.data && x.data.itemID === note.id && /^note/.test(String(x.type || "")));
        return t ? t.id : null;
    }

    /** The new window's first tab selected. A note tab is loaded already; a
     *  document loads as it is selected, and on Zotero 9/10 only in the main
     *  window most recently activated (ReaderTab's constructor reads
     *  Services.wm.getMostRecentWindow, xpcom/reader.js 10.0.8): wait for `w`
     *  to come to the front, bounded, else select it when the window is first
     *  activated (tabs.ts _wvDeferSelect, the restore's own way). */
    async _wvOpenSeveralSelect(w: any, first: { id: string; itemID: number; note: boolean }) {
        const P: any = this;
        try {
            const Z = w.Zotero_Tabs;
            if (!tabIn(w, first.id)) return;
            if (!first.note && !wvNativeWindows() && !(await P._wvAwaitFrontMain(w, 2000))) {
                if (!w.closed) P._wvDeferSelect(w, first.itemID, Z._tabs.findIndex((t: any) => t && t.id === first.id));
                return;
            }
            if (w.closed || P._wvDestroyed) return;
            Z.select(first.id);
            try { w.focus(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvOpenSeveralSelect err: " + e); }
    }
}

const _openWhereDescriptors = Object.getOwnPropertyDescriptors(_OpenWhereMixin.prototype);
delete (_openWhereDescriptors as any).constructor;
export const openWhereMethods = _openWhereDescriptors;
