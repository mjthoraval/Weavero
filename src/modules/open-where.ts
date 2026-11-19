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
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvOpenWhere, wvAccel, WvOpenWhere } from "../lib/keys";
import { winOf, wvIsTextEntry } from "../lib/dom";
import { wvLivePlugin } from "../lib/live";
import { wvListen } from "../lib/listen";
import { wvIsLibraryTabID, wvItemsTreeEls } from "../lib/windows";

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

    /** The items list's "beside": its first selected item, else Zotero's Enter. */
    async _wvOpenItemsBeside(win: any, items: any[], from?: any) {
        try {
            if (!items || !items.length) return;
            if (await this._wvOpenTarget(win, { item: items[0] }, "beside", from)) return;
            const zp = win && win.ZoteroPane;
            if (zp && typeof zp.viewItems === "function") await zp.viewItems(items);
        } catch (e) { Zotero.debug("[Weavero] _wvOpenItemsBeside err: " + e); }
    }
}

const _openWhereDescriptors = Object.getOwnPropertyDescriptors(_OpenWhereMixin.prototype);
delete (_openWhereDescriptors as any).constructor;
export const openWhereMethods = _openWhereDescriptors;
