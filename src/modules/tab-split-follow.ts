// Module: split view -- the side beside the library follows the item selected in it
// (MJT 2026-11-14: "make another separate branch for a preview option to follow the
// articles when switching items in the library"; forum 132980, asoler1562: "I would
// quite like to have my library open and scrollable while I open PDFs on a viewer
// pane ... Currently, I split my windows with the 'Open in New Tab' command, but this
// gets tiresome when I have a range of PDFs which I am continuously opening"). A
// Weavero split joins two fixed tabs: the PDF side kept its PDF while the user browsed
// the library.
//
// The side is a PREVIEW, not a reader (MJT 2026-11-15: "The Follow Selected Item
// [side] should not use the full reader, as it is too heavy. Please make something
// similar to the now deprecated Preview plugin by windingwind"). That plugin drew a
// scrollable column of a PDF's pages in a pane beside the library, read-only, and a
// double-click opened the PDF at that page; Zotero 7 replaced it with the item pane's
// attachment preview (its README: "archived ... since from Zotero 7.0.0-beta.55,
// attachment preview is supported natively"), written by the same author: Zotero's
// preview reader (xpcom/reader.js ReaderPreview, `Zotero.Reader.openPreview`) -- the
// reader page in its preview mode (zotero/reader: no interface, no text layer, no
// thumbnails, no page labels, read-only, nothing saved), not in Zotero.Reader._readers.
// The follow side hosts that preview reader, made a pane: a PDF at the side's width,
// scrolled through the whole document (Zotero's shows one page at its height, the
// viewer `overflow: hidden`); an EPUB in scrolled flow (Zotero's: paginated, turned by
// buttons); a snapshot as Zotero draws it (it scrolls). Study: the private notes,
// preview-study-2026-11-14.
//
// The split stays a split of two TABS (its records, sessions, strip pair, tab group
// and layout are all keyed on the two tab ids): the side's tab is a tab Zotero itself
// knows as cheap, an UNLOADED reader tab (`reader-unloaded`: an entry in the strip,
// an empty panel, no reader) carrying the previewed attachment and its title, its
// title in italics while it follows; the preview is drawn in its panel. One preview
// page at a time: a selection drops the shown one (its reader uninit, its <browser>
// removed, as attachmentPreview.js _processDiscard does) and builds the next in a new
// <browser> -- a reader page can be given a document once only (zotero/reader
// index: "Reader is already initialized").
//
// Opening it for real: the side's tab selected -- the Open button, a double-click in
// the preview, a click on its tab, Zotero's own open of that item (Enter, a
// double-click in the items list: Zotero.Reader.open selects the tab already holding
// it) -- loads Zotero's reader in place, at the page shown (tabs.js select of an
// unloaded tab). It is then a reader beside the library until the library selects
// another item: the side goes back to a preview of that one (Zotero's own unload of
// the tab, the reader closed).
//
// Off unless a split is told to follow (`follow` on the split, in its record): its
// tab menu and the split's own menu carry "Follow Selected Item". While no split
// follows, nothing of this module is in a window: the items view's listener, the
// strip's sheet and the previews go in with the first following split and out with
// the last. The selection is heard through the items view's own event (libraryTree.js
// `onSelect`, an event binding with addListener / removeListener), not a wrap.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.
//
// ARCHIVED 2026-11-18 (MJT on 1.1.1-dev.8: "You can archive the follow selected item
// feature for now. The preview is too slow to be usable. You can note to try using
// muPDF in a future version, as a recently developed plugin has implemented. For now,
// it should not go to the release."). WV_SPLIT_FOLLOW_ENABLED is false: no split can
// follow (_wvSplitFollowOK), no menu entry is registered, the Settings row and the
// README paragraph are gone, and its spec waits as test/archived/split-follow.archived.js
// (named so that no runner picks it up: a full run scans all of test/). A split record
// that says `follow` keeps it (nothing reads it). To revive: set the constant, put
// the Settings row and its two strings back (removed from weavero.ftl in a77037ef), move
// the spec back to test/split-follow.spec.js, restore the README paragraph (git history,
// 2026-11-18). Register: the
// private TODO, "Follow Selected Item -- archived".
export const WV_SPLIT_FOLLOW_ENABLED = false;

import { wvHtmlEl, wvSetBoolAttr } from "../lib/dom";
import { wvL10n, wvStr, wvAttr } from "../lib/l10n";
import { wvMMRegister } from "../lib/menu";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvLivePlugin } from "../lib/live";
import { wvCloneFor } from "../lib/xray";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvIsLibraryTabID, wvMainWins, wvZoteroPinsTabs } from "../lib/windows";
import type { WvTabSplit } from "./tab-split";

declare const Zotero: any;

const STYLE_ID = "wv-tsplit-follow-style";
// After the selection settles. Zotero tells a click or a single arrow press at once,
// and holds a HELD arrow key's moves 100 ms (virtualized-table.jsx: `e.repeat` ->
// libraryTree.js _onSelectionChangeDebounced); with this, a document is asked for
// 150 ms after a click, ~250 ms after a held key is let go, and quick presses or
// held keys ask for none on the way.
const FOLLOW_DELAY_MS = 150;
const READER_URL = "resource://zotero/reader/reader.html";

// The followed tab's title in italics, as an editor's preview tab: this tab shows
// another document at the next selection. Never by padding (src-ts.md).
// The preview fills its side's card (the panel is positioned while it is a side,
// tab-split.ts; positioned here too for the moment it is not). Its background is the
// one Zotero's preview gives the PDF viewer (xpcom/reader.js ReaderPreview.CSS.pdf),
// so a page lands on the colour that is already there; the page is hidden while it
// loads, as Zotero hides a loading preview (_attachmentPreview.scss).
const CSS = `
#tab-bar-container .tabs > .tab[data-wv-follow] .tab-name { font-style: italic; }
#tabs-deck > tab-content:has(> .wv-follow-preview) { position: relative; }
.wv-follow-preview {
  position: absolute; inset: 0; display: flex; flex-direction: column; overflow: clip;
  background-color: #f2f2f2;
}
@media (prefers-color-scheme: dark) { .wv-follow-preview { background-color: #303030; } }
.wv-follow-preview > browser { flex: 1 1 0; min-width: 0; min-height: 0; }
.wv-follow-preview:not([data-status="ready"]) > browser { opacity: 0; }
.wv-follow-preview > .wv-follow-open {
  position: absolute; top: 8px; inset-inline-end: 20px; z-index: 1;
  appearance: none; font: message-box; font-size: 12px; line-height: 16px; padding: 2px 10px;
  border: 1px solid var(--color-panedivider, #ccc); border-radius: 5px;
  background: var(--material-toolbar, #f2f2f2); color: var(--fill-primary, #222);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); cursor: default;
}
.wv-follow-preview > .wv-follow-open:hover { background: var(--fill-quinary, #ddd); }
.wv-follow-preview:not([data-status="ready"]) > .wv-follow-open { display: none; }
.wv-follow-preview > .wv-follow-msg {
  position: absolute; inset: 40% 16px auto; text-align: center;
  font: message-box; font-size: 13px; color: var(--fill-secondary, #666);
}
.wv-follow-preview:not([data-status="failed"]) > .wv-follow-msg { display: none; }
`;
// What the preview reader page is given on top of Zotero's own preview sheet, in its
// view's document: the PDF viewer scrolls (ReaderPreview.CSS.pdf: `overflow: hidden`).
const VIEW_CSS: Record<string, string> = {
    pdf: "#viewerContainer { overflow: auto !important; }",
};

/** One following split of a window: the items view heard, the listener put on it,
 *  the timer of a selection waiting to settle, the selection's count (a load checks
 *  it has not moved on) and the load in flight. */
interface WvFollowState { iv: any; fn: any; timer: any; seq: number; busy: boolean }
/** A side's preview: its box in the side's panel, the <browser> and Zotero's preview
 *  reader in it, the attachment it shows, a count that makes an older load give up,
 *  the load in flight, and whether the last one drew. */
interface WvPreview { host: any; browser: any; reader: any; view: any; loc: any; itemID: number; gen: number; busy: Promise<boolean> | null; ok: boolean; done: boolean }

// Per window: following splits by split id, previews by tab id, the tabs being put
// back unloaded (Zotero's close + add: until the new panel is the only one, no
// preview goes in). Module-level WeakMaps: nothing of it on the window (the wiring
// snapshots stay as they are), and a closed window is not kept.
const STATE: WeakMap<any, Map<string, WvFollowState>> = new WeakMap();
const PREVIEWS: WeakMap<any, Map<string, WvPreview>> = new WeakMap();
const PARKING: WeakMap<any, Set<string>> = new WeakMap();
// The windows whose strip carries a mark and the sheet.
const MARKED: WeakSet<any> = new WeakSet();

const live = () => wvLivePlugin();

function tabIn(win: any, id: any): any {
    try { return win && win.Zotero_Tabs && id ? win.Zotero_Tabs._tabs.find((t: any) => t && t.id === id) || null : null; } catch (e) { return null; }
}
function baseType(t: any): string { return String((t && t.type) || "").replace(/-(unloaded|loading|reloaded)$/, ""); }
function isLibrary(t: any): boolean { return !!t && (wvIsLibraryTabID(t.id) || baseType(t) === "library"); }
function isUnloaded(t: any): boolean { return !!t && /-unloaded$/.test(String(t.type)); }
function parking(win: any, id: string): boolean { const s = PARKING.get(win); return !!(s && s.has(id)); }

/** The items view of library tab `tabID`: the tab's own on a Zotero with its own
 *  windows (ZoteroPane.getLibraryView), else the pane's one. Null until it exists. */
function itemsViewOf(win: any, tabID: string): any {
    try {
        const ZP: any = win && win.ZoteroPane;
        if (!ZP) return null;
        if (typeof ZP.getLibraryView === "function") {
            const v = ZP.getLibraryView(tabID);
            return (v && v.itemsView) || null;
        }
        return ZP.itemsView || null;
    }
    catch (e) { return null; }
}

/** Resolve once `fn()` is true, or after `ms` (false). On the window's own clock. */
function until(win: any, fn: () => boolean, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const tick = () => {
            let ok = false;
            try { ok = !!fn(); } catch (e) {}
            if (ok) { resolve(true); return; }
            if (Date.now() - t0 > ms || !win || win.closed) { resolve(false); return; }
            win.setTimeout(tick, 10);
        };
        tick();
    });
}

/** The preview reader's PDF viewer (pdf.js), or null. */
function pdfViewerOf(r: any): any {
    try { return r._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer || null; } catch (e) { return null; }
}

class _TabSplitFollowMixin {
    /** The sides of a split that can follow: a library tab and a reader tab (a PDF,
     *  an EPUB, a snapshot; loaded or not), either way round; null for any other
     *  split, and while split view is off. */
    _wvSplitFollowOK(win: any, s: WvTabSplit | null): { lib: string; doc: string } | null {
        try {
            // Archived (header): no split can follow.
            if (!WV_SPLIT_FOLLOW_ENABLED) return null;
            if (!s || s.picker || !s.right) return null;
            if (!(this as any)._wvTabSplitOn()) return null;
            const L = tabIn(win, s.left), R = tabIn(win, s.right);
            if (!L || !R) return null;
            if (isLibrary(L) && baseType(R) === "reader") return { lib: s.left, doc: s.right };
            if (isLibrary(R) && baseType(L) === "reader") return { lib: s.right, doc: s.left };
        }
        catch (e) {}
        return null;
    }

    /** Split `s` follows its library side's selection now. */
    _wvSplitFollowOn(win: any, s: WvTabSplit | null): boolean {
        return !!(s && s.follow && this._wvSplitFollowOK(win, s));
    }

    /** Tab `tabID` is the document side of a following split, shown as a preview:
     *  an unloaded reader tab. The split neither loads it as its side nor puts an
     *  item pane over it, and a press in it does not select it (tab-split.ts): the
     *  library stays the selected side, and selecting this tab is opening it. */
    _wvSplitFollowHolds(win: any, tabID: any): boolean {
        try {
            if (!win || !tabID) return false;
            const s: WvTabSplit | null = (this as any)._wvTabSplitOf(win, tabID);
            if (!s || !s.follow) return false;
            const sides = this._wvSplitFollowOK(win, s);
            return !!(sides && sides.doc === tabID && isUnloaded(tabIn(win, tabID)));
        }
        catch (e) { return false; }
    }

    /** Turn following on or off for a split. On: it shows the item selected now. Off:
     *  a preview shown becomes the document itself (the split loads its side). */
    _wvSplitFollowSet(win: any, splitID: string, on: boolean): boolean {
        try {
            const P: any = this;
            const s: WvTabSplit | undefined = P._wvTabSplits(win).find((x: WvTabSplit) => x.id === splitID);
            if (!s) return false;
            if (on && !this._wvSplitFollowOK(win, s)) return false;
            if (on) s.follow = true;
            else delete s.follow;
            P._wvTabSplitRing("follow " + (on ? "on" : "off") + " for split " + s.id);
            P._wvTabSplitPersist();
            this._wvSplitFollowSync(win);
            if (on) this._wvSplitFollowSelected(win, s.id);
            else P._wvTabSplitSync(win);
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowSet err: " + e); return false; }
    }

    /** The Settings default: a split just made by "Open PDF in Split View" follows
     *  from the start when the user asked for that (weavero.splitViewFollow). */
    _wvSplitFollowAdopt(win: any, s: WvTabSplit | null) {
        try {
            if (!s || s.follow || !(this as any)._wvPref("splitViewFollow")) return;
            if (!this._wvSplitFollowOK(win, s)) return;
            s.follow = true;
            (this as any)._wvTabSplitRing("follow on for split " + s.id + " (the setting)");
            (this as any)._wvTabSplitPersist();
            this._wvSplitFollowSync(win);
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowAdopt err: " + e); }
    }

    /** `win` as its splits stand: each following split's items view heard (one
     *  listener per split, moved when a library tab gets another view), nothing
     *  heard for a split that no longer follows, the followed tab marked in the
     *  strip, a preview in each side held as one (and none elsewhere). Idempotent;
     *  called from the split's own sync (tab-split.ts _wvTabSplitMarkStrip: every
     *  tab event and every redraw of the strip). */
    _wvSplitFollowSync(win: any) {
        try {
            if (!win || win.closed || !win.document) return;
            const P: any = this;
            let map = STATE.get(win);
            const splits: WvTabSplit[] = P._wvDestroyed ? [] : (Array.isArray(win._wvTSplits) ? win._wvTSplits : []);
            const want = new Map<string, any>();
            const marks = new Set<string>();
            const held = new Set<string>();
            const shown = new Set<string>();
            const sel = win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null;
            for (const s of splits) {
                if (!s || !s.follow) continue;
                const sides = this._wvSplitFollowOK(win, s);
                if (!sides) continue;
                marks.add(sides.doc);
                if (isUnloaded(tabIn(win, sides.doc))) {
                    held.add(sides.doc);
                    if (sel === s.left || sel === s.right) shown.add(sides.doc);
                }
                const iv = itemsViewOf(win, sides.lib);
                if (iv && iv.onSelect && typeof iv.onSelect.addListener === "function") want.set(s.id, iv);
            }
            if (map) {
                for (const [id, st] of Array.from(map.entries())) {
                    if (want.get(id) === st.iv) continue;
                    this._wvSplitFollowDrop(win, st);
                    map.delete(id);
                }
            }
            for (const [id, iv] of want) {
                if (map && map.has(id)) continue;
                if (!map) { map = new Map(); STATE.set(win, map); }
                // The live instance at fire time, never this one (src-ts.md).
                const fn = () => { try { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvSplitFollowSelected(win, id); } catch (e) {} };
                iv.onSelect.addListener(fn);
                map.set(id, { iv, fn, timer: null, seq: 0, busy: false });
            }
            if (map && !map.size) STATE.delete(win);
            // The previews: gone where no side is held any more (the follow off, the
            // split gone, the side opened -- Zotero is loading its reader in that
            // panel), drawn where one is held, on screen, and shows another item (a
            // restart, the follow turned on over an unloaded side). Never drawn for a
            // split in a tab not shown -- after a restart that would load a reader
            // page nobody sees (Zotero's own preview draws only once in view,
            // itemDetails.js); one drawn stays while its split is off screen. A side
            // being put back unloaded waits for its new panel.
            const pm = PREVIEWS.get(win);
            if (pm) {
                for (const [id, pv] of Array.from(pm.entries())) {
                    const panel = win.document.getElementById(id);
                    if (!held.has(id) || (pv.host && pv.host.parentNode !== panel && !parking(win, id))) this._wvSplitFollowPreviewDrop(win, id);
                }
            }
            for (const id of shown) {
                if (parking(win, id)) continue;
                const t = tabIn(win, id);
                const pv = PREVIEWS.get(win) && PREVIEWS.get(win)!.get(id);
                if (t && t.data && (!pv || pv.itemID !== t.data.itemID)) this._wvSplitFollowRender(win, id, null);
            }
            // The strip is touched only while a split follows, and once more when
            // the last one stops: this runs on every redraw of the strip.
            if (marks.size) {
                wvInjectStyle(win.document, STYLE_ID, CSS);
                MARKED.add(win);
                this._wvSplitFollowMark(win, marks);
            }
            else if (MARKED.has(win)) {
                MARKED.delete(win);
                wvRemoveStyle(win.document, STYLE_ID);
                this._wvSplitFollowMark(win, marks);
            }
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowSync err: " + e); }
    }

    /** A split's listener off its items view, its waiting selection dropped. */
    _wvSplitFollowDrop(win: any, st: WvFollowState) {
        try { if (st.iv && st.iv.onSelect && typeof st.iv.onSelect.removeListener === "function") st.iv.onSelect.removeListener(st.fn); } catch (e) {}
        try { if (st.timer) win.clearTimeout(st.timer); } catch (e) {}
        st.timer = null;
        st.seq++;
    }

    /** The followed tabs marked in the strip (React keeps an attribute it does not
     *  render). Written only where it differs: this runs on the strip's mutations. */
    _wvSplitFollowMark(win: any, ids: Set<string>) {
        try {
            for (const el of win.document.querySelectorAll("#tab-bar-container .tab[data-id]")) {
                const on = ids.has(el.getAttribute("data-id"));
                if (on) { if (!el.hasAttribute("data-wv-follow")) el.setAttribute("data-wv-follow", ""); }
                else if (el.hasAttribute("data-wv-follow")) el.removeAttribute("data-wv-follow");
            }
        }
        catch (e) {}
    }

    /** The library side's selection changed (its items view's `select` event): the
     *  document is asked for once the selection has settled. */
    _wvSplitFollowSelected(win: any, splitID: string) {
        try {
            const map = STATE.get(win);
            const st = map && map.get(splitID);
            if (!st) return;
            st.seq++;
            if (st.timer) win.clearTimeout(st.timer);
            st.timer = win.setTimeout(() => {
                st.timer = null;
                const lp = live();
                if (lp && !lp._wvDestroyed) lp._wvSplitFollowNow(win, splitID);
            }, FOLLOW_DELAY_MS);
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowSelected err: " + e); }
    }

    /** Show the selected item's document in the split's document side. One at a
     *  time: a selection made while a document is put in waits for it, and only the
     *  last one is then shown. Nothing moves unless ONE row is selected and it has a
     *  document, and while the library side is not the selected tab (the document
     *  side in use is not taken from under the reader). */
    async _wvSplitFollowNow(win: any, splitID: string) {
        const P: any = this;
        const map = STATE.get(win);
        const st = map && map.get(splitID);
        if (!st || st.busy) return;
        st.busy = true;
        try {
            for (let pass = 0; pass < 25; pass++) {
                const seq = st.seq;
                if (P._wvDestroyed || win.closed) return;
                const cur = STATE.get(win);
                if (!cur || cur.get(splitID) !== st) return;
                const s: WvTabSplit | undefined = P._wvTabSplits(win).find((x: WvTabSplit) => x.id === splitID);
                const sides = s && s.follow ? this._wvSplitFollowOK(win, s) : null;
                if (!s || !sides) return;
                const Z: any = win.Zotero_Tabs;
                if (!Z || Z.selectedID !== sides.lib) return;
                let items: any[] = [];
                try { items = st.iv.getSelectedItems() || []; } catch (e) {}
                if (items.length !== 1) return;
                const target = await this._wvSplitFollowTarget(items[0]);
                // The selection moved on meanwhile: its own wait, when one is
                // running, asks again; else (it ended while this was busy) now.
                if (st.seq !== seq) { if (st.timer) return; continue; }
                if (!target) return;
                const t = tabIn(win, sides.doc);
                if (!t || !t.data) return;
                // A document opened here and read aloud: left alone, as Zotero never
                // unloads such a tab (tabs.js canUnload).
                if (t.audioStatus && t.audioStatus.active && !t.audioStatus.paused) return;
                if (t.data.itemID === target.att.id) {
                    // Already this document: an annotation's row goes to its place.
                    if (target.location) {
                        try {
                            const r: any = isUnloaded(t) ? (PREVIEWS.get(win) && PREVIEWS.get(win)!.get(sides.doc) || ({} as any)).reader : Zotero.Reader.getByTabID(sides.doc);
                            if (r && typeof r.navigate === "function") r.navigate(isUnloaded(t) ? wvCloneFor(target.location, r._iframeWindow) : target.location);
                        }
                        catch (e) {}
                    }
                    return;
                }
                if (this._wvSplitFollowPinned(target.att)) return;
                await this._wvSplitFollowShow(win, s, sides, target.att, target.location);
                if (st.seq === seq || st.timer) return;
            }
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowNow err: " + e); }
        finally { st.busy = false; }
    }

    /** The document a selected row stands for, as a double-click would open it: an
     *  attachment row its own file, an annotation's row its attachment at the
     *  annotation (zoteroPane.js viewItems), a regular item the first of its best
     *  attachments the reader can show (locateMenu.js _getFirstUsableItem;
     *  Weavero's default attachment comes first there, attachments.ts). Null for
     *  anything else -- a note, an item without a file, a file not on this
     *  computer (nothing is downloaded for a selection), a type the user opens in
     *  another program (Zotero's fileHandler prefs). */
    async _wvSplitFollowTarget(item: any): Promise<{ att: any; location: any } | null> {
        try {
            if (!item) return null;
            const usable = async (a: any): Promise<boolean> => {
                try {
                    if (!a || !a.isAttachment || !a.isAttachment()) return false;
                    const type = a.attachmentReaderType;
                    if (type !== "pdf" && type !== "epub" && type !== "snapshot") return false;
                    if (a.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) return false;
                    if (Zotero.Prefs.get("fileHandler." + type)) return false;
                    return !!(await a.fileExists());
                }
                catch (e) { return false; }
            };
            if (typeof item.isAnnotation === "function" && item.isAnnotation()) {
                const att = item.parentItem;
                return (await usable(att)) ? { att, location: { annotationID: item.key } } : null;
            }
            if (item.isAttachment && item.isAttachment()) return (await usable(item)) ? { att: item, location: null } : null;
            if (item.isRegularItem && item.isRegularItem()) {
                const list: any[] = (await item.getBestAttachments()) || [];
                for (const a of list) if (await usable(a)) return { att: a, location: null };
            }
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowTarget err: " + e); }
        return null;
    }

    /** Where Weavero's pins are kept per ITEM (Zotero 10 and 11.0-beta.4: before
     *  Zotero pins tabs itself), a tab showing a pinned item can become that
     *  item's pin (tabs.ts _applyPinnedTabs: the first tab of the item), and a
     *  split's side is never a pin. Such an item is not followed: its own tab is at
     *  hand in the pins. */
    _wvSplitFollowPinned(att: any): boolean {
        try {
            if (wvZoteroPinsTabs()) return false;
            const P: any = this;
            return typeof P._pinnedTabsHas === "function" && !!P._pinnedTabsHas(att.libraryID, att.key);
        }
        catch (e) { return false; }
    }

    /** Attachment `att` in the document side, as a preview. The side's tab takes
     *  the new item: its data (Zotero_Tabs.setTabData, which also saves the session)
     *  and its title. A side opened as a reader is first put back unloaded: what
     *  Zotero's own unload does (tabs.js `unload`: close the tab, add it again under
     *  the same id and at the same index, unloaded) with the new item in its data --
     *  the close is not reopenable (Zotero 11: skipHistory; Zotero 10 has no such
     *  option, its entry is taken back out) -- once the reader has loaded (a reader
     *  closed mid-load fails inside Zotero 10 s later, reader.js _waitForReader).
     *  Zotero removes the old panel in a timer of its close and the old reader on the
     *  close notification: the preview goes into the new panel once both are gone. */
    async _wvSplitFollowShow(win: any, s: WvTabSplit, sides: { lib: string; doc: string }, att: any, location: any): Promise<boolean> {
        const P: any = this;
        const Z: any = win.Zotero_Tabs;
        const doc = win.document;
        const id = sides.doc;
        const t0 = Date.now();
        try {
            let t = tabIn(win, id);
            if (!t || !t.data) return false;
            // A reader opened here and still loading: it ends first.
            if (/-loading$/.test(String(t.type))) {
                const loaded = await until(win, () => { const x = tabIn(win, id); return !!x && !/-loading$/.test(String(x.type)); }, 20000);
                t = tabIn(win, id);
                if (!loaded || !t || !t.data) return false;
            }
            let title = "";
            try { if (typeof att.getTabTitle === "function") title = String((await att.getTabTitle()) || ""); } catch (e) {}
            // Still the same tab, split and selection after the waits.
            if (P._wvDestroyed || win.closed || tabIn(win, id) !== t || !this._wvSplitFollowOn(win, s) || Z.selectedID !== sides.lib) return false;
            const was = t.data.itemID;
            P._wvTabSplitRing("follow: show " + att.id + " in " + id + " (was " + was + (isUnloaded(t) ? "" : ", a reader") + ")");
            if (!isUnloaded(t)) {
                const idx = Z._tabs.indexOf(t);
                const data = Object.assign({}, t.data, { itemID: att.id });
                // The outgoing document's own view states and icon.
                delete data.primaryViewState;
                delete data.secondViewState;
                delete data.icon;
                const oldEl = doc.getElementById(id);
                try { if (oldEl) P._wvTabSplitUnwirePanel(oldEl); } catch (e) {}
                const hist = Array.isArray(Z._history) ? Z._history.length : -1;
                let set = PARKING.get(win);
                if (!set) { set = new Set(); PARKING.set(win, set); }
                set.add(id);
                try {
                    Z.close(id, { skipHistory: true, skipWindowClose: true, skipFocus: true });
                    if (hist >= 0 && Z._history.length > hist) Z._history.length = hist;
                    const added = Z.add({ id, type: "reader-unloaded", title: title || t.title, index: idx, data, pinned: !!t.pinned });
                    // The card stays where it is: the new panel takes the old one's
                    // place in this same task, before any frame.
                    try { P._wvTabSplitMovePanel(oldEl, added.container); } catch (e) {}
                    await until(win, () => doc.getElementById(id) === added.container && !Zotero.Reader.getByTabID(id), 3000);
                }
                finally { set.delete(id); }
                if (win.closed || !tabIn(win, id)) return false;
            }
            else {
                delete t.data.primaryViewState;
                delete t.data.secondViewState;
                delete t.data.icon;
                if (typeof Z.setTabData === "function") Z.setTabData(id, { itemID: att.id });
                else { t.data.itemID = att.id; try { Zotero.Session.debounceSave(); } catch (e) {} }
                // The title (rename redraws the strip, the icon fetched again for the
                // new item: tabs.js _update).
                if (title) { try { await Z.rename(id, title); } catch (e) {} }
                else { try { Z._update(); } catch (e) {} }
            }
            P._wvTabSplitPersist();
            // The draw first (with its location), then the side's footer and layer
            // with the new title and icon: the split's sync would start a draw of its
            // own, without the location.
            const drawn = this._wvSplitFollowRender(win, id, location);
            try { P._wvTabSplitSync(win); } catch (e) {}
            const ok = await drawn;
            const lp = live();
            if (lp && !lp._wvDestroyed) lp._wvTabSplitRing("follow: shown " + att.id + " in " + (Date.now() - t0) + " ms" + (ok ? "" : " (no preview)"));
            return ok;
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowShow err: " + e); return false; }
    }

    /** Draw the preview of the side `tabID` holds (its tab's item). One per side,
     *  one page at a time; a call for the item already drawn or being drawn answers
     *  that draw. Resolves true once the document is shown (its first page, for a
     *  PDF: ReaderPreview._open awaits pdf.js firstPagePromise). */
    _wvSplitFollowRender(win: any, tabID: string, location: any): Promise<boolean> {
        try {
            const t = tabIn(win, tabID);
            if (!t || !t.data || !this._wvSplitFollowHolds(win, tabID) || parking(win, tabID)) return Promise.resolve(false);
            let pm = PREVIEWS.get(win);
            if (!pm) { pm = new Map(); PREVIEWS.set(win, pm); }
            let pv = pm.get(tabID);
            const itemID = t.data.itemID;
            if (pv && pv.itemID === itemID && (pv.busy || pv.done)) {
                // A place asked for meanwhile: the draw in flight goes there once drawn.
                if (pv.busy) { if (location) pv.loc = location; return pv.busy; }
                if (location && pv.reader && typeof pv.reader.navigate === "function") { try { pv.reader.navigate(wvCloneFor(location, pv.reader._iframeWindow)); } catch (e) {} }
                return Promise.resolve(pv.ok);
            }
            if (!pv) { pv = { host: null, browser: null, reader: null, view: null, loc: null, itemID: 0, gen: 0, busy: null, ok: false, done: false }; pm.set(tabID, pv); }
            pv.itemID = itemID;
            pv.loc = location || null;
            pv.gen++;
            pv.ok = false;
            pv.done = false;
            const gen = pv.gen;
            const rec = pv;
            const p = this._wvSplitFollowLoad(win, tabID, rec, gen).catch((e: any) => { Zotero.debug("[Weavero] split follow preview err: " + e); return false; });
            rec.busy = p;
            p.then(() => { if (rec.gen === gen) rec.busy = null; });
            return p;
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowRender err: " + e); return Promise.resolve(false); }
    }

    /** One draw: the shown document dropped, a new <browser> on the reader page,
     *  Zotero's preview reader made in it for the attachment, shaped for a pane. A
     *  newer draw of the same side (`gen`), a teardown or the side no longer held
     *  makes it give up and take its own page with it. */
    async _wvSplitFollowLoad(win: any, tabID: string, pv: WvPreview, gen: number): Promise<boolean> {
        const P: any = this;
        const doc = win.document;
        const stale = () => P._wvDestroyed || win.closed || pv.gen !== gen || !PREVIEWS.get(win) || PREVIEWS.get(win)!.get(tabID) !== pv;
        // The previous document goes first: one preview page at a time.
        this._wvSplitFollowFree(pv);
        const panel = doc.getElementById(tabID);
        if (!panel || typeof Zotero.Reader.openPreview !== "function") return false;
        let host = pv.host;
        if (!host || host.parentNode !== panel) {
            try { if (host) host.remove(); } catch (e) {}
            host = this._wvSplitFollowHost(win, panel, tabID);
            pv.host = host;
        }
        host.setAttribute("data-status", "loading");
        const b = doc.createXULElement("browser");
        // As attachmentPreview.js's own <browser>s.
        b.setAttribute("type", "content");
        b.setAttribute("transparent", "transparent");
        b.setAttribute("tooltip", "iframeTooltip");
        b.setAttribute("flex", "1");
        b.setAttribute("src", READER_URL);
        host.insertBefore(b, host.firstChild);
        pv.browser = b;
        const drop = (r?: any) => {
            try { if (r) r.uninit(); } catch (e) {}
            try { b.remove(); } catch (e) {}
            if (pv.browser === b) pv.browser = null;
            if (r && pv.reader === r) pv.reader = null;
        };
        // The reader page loaded (never its initial about:blank, already "complete"
        // on Firefox 153: src-ts.md, wvWhenWindowLoaded).
        const ready = await until(win, () => {
            const d = b.contentDocument;
            return !!d && String(d.documentURI).startsWith(READER_URL) && d.readyState === "complete"
                && typeof (b.contentWindow as any).wrappedJSObject.createReader === "function";
        }, 10000);
        if (stale()) { drop(); return false; }
        if (!ready) { drop(); return this._wvSplitFollowFailed(pv, gen); }
        let r: any = null;
        try { r = await Zotero.Reader.openPreview(pv.itemID, b); }
        catch (e) { Zotero.debug("[Weavero] split follow openPreview err: " + e); }
        if (stale()) { drop(r); return false; }
        if (!r) { drop(); return this._wvSplitFollowFailed(pv, gen); }
        pv.reader = r;
        this._wvSplitFollowShape(r);
        let ok = false;
        const loc0 = pv.loc;
        try { ok = !!(await r._open(loc0 ? { location: loc0 } : {})); }
        catch (e) { Zotero.debug("[Weavero] split follow preview open err: " + e); }
        if (stale()) { drop(r); return false; }
        if (!ok) { drop(r); return this._wvSplitFollowFailed(pv, gen); }
        const type = String(r._type || r.type || "");
        let vw: any = null;
        try { vw = r._internalReader._primaryView._iframeWindow; } catch (e) {}
        try {
            const css = VIEW_CSS[type];
            const vdoc = vw && vw.document;
            if (css && vdoc && vdoc.head) {
                const sheet = vdoc.createElement("style");
                sheet.className = "wv-follow-view-style";
                sheet.textContent = css;
                vdoc.head.appendChild(sheet);
            }
        }
        catch (e) {}
        // What the reader's preview mode never applies: the PDF view takes its view
        // state and its location in its `documentinit` handler, registered by the
        // init that preview mode skips (zotero/reader pdf-view.js; measured: the
        // scale stayed pdf.js's "auto", a location stayed on page 1).
        if (type === "pdf") { const v = pdfViewerOf(r); if (v) { try { v.currentScaleValue = "page-width"; } catch (e) {} } }
        const loc = pv.loc;
        pv.loc = null;
        if (loc && (type === "pdf" || loc !== loc0)) { try { r.navigate(wvCloneFor(loc, r._iframeWindow)); } catch (e) {} }
        // A double-click opens the document at the page pressed. Heard in the view's
        // own window: a press inside the reader page never reaches the chrome box
        // (measured with the item pane's way of listening, on the host).
        if (vw) {
            wvListen(vw, "follow:dblclick", "dblclick", (e: any) => {
                try {
                    const lp = live();
                    if (lp && !lp._wvDestroyed) lp._wvSplitFollowOpen(win, tabID, lp._wvSplitFollowPageOf(e));
                }
                catch (er) {}
            }, true, P._wvWireTag());
            pv.view = vw;
        }
        host.setAttribute("data-status", "ready");
        pv.ok = true;
        pv.done = true;
        return true;
    }

    /** No preview of this document (its file unreadable, the reader page refused
     *  it): a line saying so in its place; the tab keeps the item, so the Open
     *  button's way -- a click on the tab -- still opens it in Zotero's reader. */
    _wvSplitFollowFailed(pv: WvPreview, gen: number): boolean {
        try { if (pv.gen === gen && pv.host) pv.host.setAttribute("data-status", "failed"); } catch (e) {}
        if (pv.gen === gen) { pv.ok = false; pv.done = true; }
        return false;
    }

    /** Zotero's preview reader, as a pane rather than a glance: a PDF at the
     *  side's width, scrolled through every page (ReaderPreview shows page 1 at its
     *  height, one page at a time: `_getState` page-height and `updatePDFAttr`
     *  scrollMode 3, its own resize listener; both replaced on THIS instance, before
     *  `_open` reads them -- the replacement is what `_open` then registers and
     *  `uninit` removes); an EPUB in scrolled flow (ReaderPreview: paginated, turned
     *  by the item pane's buttons; a wheel moved nothing there, measured). A
     *  snapshot is left as Zotero draws it: it scrolls. */
    _wvSplitFollowShape(r: any) {
        try {
            const type = String(r._type || r.type || "");
            if (type === "pdf") {
                r._getState = async function () { return { pageIndex: 0, scale: "page-width", scrollMode: 0, spreadMode: 0 }; };
                r.updatePDFAttr = () => { const v = pdfViewerOf(r); if (v) { try { v.currentScaleValue = "page-width"; } catch (e) {} } };
            }
            else if (type === "epub") {
                const proto: any = Object.getPrototypeOf(r);
                const orig = proto && proto._getState;
                if (typeof orig === "function") {
                    r._getState = async function (this: any) {
                        const st: any = await orig.call(this);
                        if (st && typeof st === "object") st.flowMode = "scrolled";
                        return st;
                    };
                }
            }
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowShape err: " + e); }
    }

    /** The preview's box in the side's panel: the <browser> goes in first, the Open
     *  button and the "no preview" line over it. A wv- id: the shutdown sweep removes
     *  it whole (src-ts.md). A double-click opens the document at the page under the
     *  pointer, as the item pane's preview and the old plugin did; the press itself
     *  opens nothing (the split's own press handler leaves this side alone). */
    _wvSplitFollowHost(win: any, panel: any, tabID: string): any {
        const doc = win.document;
        const host = wvHtmlEl(doc, "div", "wv-follow-preview");
        host.id = "wv-follow-preview-" + tabID;
        host.setAttribute("data-tab-id", tabID);
        host.setAttribute("data-status", "loading");
        const open = wvHtmlEl(doc, "button", "wv-follow-open", undefined, host);
        open.textContent = wvStr("weavero-split-follow-open", null, null);
        const tip = wvAttr("weavero-split-follow-open", "title");
        if (tip) open.setAttribute("title", tip);
        open.addEventListener("click", (e: any) => {
            try { e.stopPropagation(); const lp = live(); if (lp && !lp._wvDestroyed) lp._wvSplitFollowOpen(win, tabID, null); } catch (er) {}
        });
        open.addEventListener("dblclick", (e: any) => { try { e.stopPropagation(); } catch (er) {} });
        const msg = wvHtmlEl(doc, "div", "wv-follow-msg", undefined, host);
        wvL10n(msg, "weavero-split-follow-failed");
        if (!msg.textContent) msg.textContent = wvStr("weavero-split-follow-failed", null, null);
        host.addEventListener("dblclick", (e: any) => {
            try {
                const lp = live();
                if (!lp || lp._wvDestroyed) return;
                lp._wvSplitFollowOpen(win, tabID, lp._wvSplitFollowPageOf(e));
            }
            catch (er) {}
        });
        panel.appendChild(host);
        return host;
    }

    /** The PDF page a press inside the preview landed on, as a location (pdf.js
     *  marks each page box `data-page-number`); null elsewhere. */
    _wvSplitFollowPageOf(e: any): any {
        try {
            const t: any = e && (e.originalTarget || e.target);
            const el: any = t && (t.nodeType === 1 ? t : t.parentElement);
            const page: any = el && typeof el.closest === "function" ? el.closest(".page[data-page-number]") : null;
            const n = page ? parseInt(page.getAttribute("data-page-number"), 10) : NaN;
            return n > 0 ? { pageIndex: n - 1 } : null;
        }
        catch (e2) { return null; }
    }

    /** Open the previewed document for real, in the side itself: its tab selected,
     *  which Zotero loads in place (tabs.js select of an unloaded tab -> its load
     *  hook -> Zotero.Reader.open into the tab), at `location` or at the PDF page the
     *  preview shows. The preview goes first, so the reader is built in an empty
     *  panel. */
    _wvSplitFollowOpen(win: any, tabID: string, location: any) {
        try {
            const Z: any = win.Zotero_Tabs;
            const t = tabIn(win, tabID);
            if (!Z || !t || !isUnloaded(t)) return false;
            let loc = location;
            const pv = PREVIEWS.get(win) && PREVIEWS.get(win)!.get(tabID);
            if (!loc && pv && pv.reader && String(pv.reader._type) === "pdf") {
                const v = pdfViewerOf(pv.reader);
                const n = v ? Number(v.currentPageNumber) : 0;
                if (n > 0) loc = { pageIndex: n - 1 };
            }
            this._wvSplitFollowPreviewDrop(win, tabID);
            (this as any)._wvTabSplitRing("follow: open " + t.data.itemID + " in " + tabID + (loc ? " at " + JSON.stringify(loc) : ""));
            Z.select(tabID, false, loc ? { location: loc } : {});
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowOpen err: " + e); return false; }
    }

    /** The shown document's page and reader let go: Zotero's own teardown of a
     *  preview reader (its pref observers, its blocking observer, its resize
     *  listener: ReaderInstance.uninit), its <browser> removed. */
    _wvSplitFollowFree(pv: WvPreview) {
        try { if (pv.view) wvUnlisten(pv.view, "follow:dblclick"); } catch (e) {}
        pv.view = null;
        try { if (pv.reader) pv.reader.uninit(); } catch (e) {}
        pv.reader = null;
        try { if (pv.browser) pv.browser.remove(); } catch (e) {}
        pv.browser = null;
        pv.ok = false;
    }

    /** A side's preview gone whole: the reader, the page, the box. A draw still in
     *  flight gives up at its next step. */
    _wvSplitFollowPreviewDrop(win: any, tabID: string) {
        try {
            const pm = PREVIEWS.get(win);
            const pv = pm && pm.get(tabID);
            if (!pv) return;
            pv.gen++;
            this._wvSplitFollowFree(pv);
            try { if (pv.host) pv.host.remove(); } catch (e) {}
            pv.host = null;
            pm!.delete(tabID);
            if (!pm!.size) PREVIEWS.delete(win);
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowPreviewDrop err: " + e); }
    }

    /** What a side's preview shows now (specs, the ring): the attachment, whether it
     *  is drawn or still loading, the reader page's type. Null without a preview. */
    _wvSplitFollowPreviewInfo(win: any, tabID: string): any {
        const pm = PREVIEWS.get(win);
        const pv = pm && pm.get(tabID);
        if (!pv) return null;
        let type = "";
        try { type = pv.reader ? String(pv.reader._type || "") : ""; } catch (e) {}
        return { itemID: pv.itemID, ok: pv.ok, done: pv.done, loading: !!pv.busy, type, reader: pv.reader, browser: pv.browser, host: pv.host,
            status: pv.host ? pv.host.getAttribute("data-status") : null };
    }

    /** Keep Document in New Tab: the followed document gets a tab of its own,
     *  right after the pair and in its tab group, while the split goes on
     *  following. Added unloaded, as Zotero restores a tab: it loads when it is
     *  first selected, so keeping a document opens no reader. */
    async _wvSplitFollowKeep(win: any, splitID: string): Promise<string | null> {
        try {
            const P: any = this;
            const Z: any = win.Zotero_Tabs;
            const s: WvTabSplit | undefined = P._wvTabSplits(win).find((x: WvTabSplit) => x.id === splitID);
            const sides = s ? this._wvSplitFollowOK(win, s) : null;
            const t = sides ? tabIn(win, sides.doc) : null;
            if (!s || !sides || !t || !t.data || !t.data.itemID) return null;
            const data: any = { itemID: t.data.itemID };
            if (t.data.wvGroupId) data.wvGroupId = t.data.wvGroupId;
            const index = Math.max(Z._tabs.findIndex((x: any) => x && x.id === s.left), Z._tabs.findIndex((x: any) => x && x.id === s.right)) + 1;
            const added = Z.add({ type: "reader-unloaded", title: t.title || "", index, data, select: false });
            P._wvTabSplitRing("follow: kept " + t.data.itemID + " as " + (added && added.id));
            return (added && added.id) || null;
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowKeep err: " + e); return null; }
    }

    /** The tab menu's entries, with the split's own (tab-split.ts
     *  _wvTabSplitRegisterMenus; keys in tabs.ts _wvTabMenuOrder): "Follow
     *  Selected Item", a check mark, on either tab of a split that can follow;
     *  "Keep Document in New Tab" while it follows. One tab only, as Reverse Tabs. */
    _wvSplitFollowRegisterMenus() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if (!(MM && typeof MM.registerMenu === "function")) return;
            this._wvSplitFollowUnregisterMenus();
            // Archived (header): no entries at all.
            if (!WV_SPLIT_FOLLOW_ENABLED) return;
            const self: any = this;
            const winOf = (ctx: any) => ctx.menuElem && ctx.menuElem.ownerDocument && ctx.menuElem.ownerDocument.defaultView;
            const splitFor = (win: any, tabID: any): WvTabSplit | null => {
                try {
                    const tg = self._wvTabMultiSelTargets ? self._wvTabMultiSelTargets(win, tabID) : null;
                    if (tg && tg.length > 1) return null;
                    const s = self._wvTabSplitOf(win, tabID);
                    return s && self._wvSplitFollowOK(win, s) ? s : null;
                }
                catch (e) { return null; }
            };
            const entry = (key: string, l10nID: string, show: (win: any, s: WvTabSplit) => boolean, dress: (el: any, s: WvTabSplit) => void, run: (lp: any, win: any, s: WvTabSplit) => void) => ({
                menuType: "menuitem",
                l10nID,
                onShowing: (_ev: any, ctx: any) => {
                    try {
                        const win = winOf(ctx);
                        const s = win && win.Zotero_Tabs ? splitFor(win, ctx.tabID) : null;
                        const ok = !!(s && show(win, s));
                        ctx.setVisible(ok);
                        ctx.menuElem.setAttribute("data-wv-key", key);
                        // The words at once (tab-split.ts: an entry left to the
                        // document's Fluent was seen blank).
                        if (ok && s) { wvL10n(ctx.menuElem, l10nID); dress(ctx.menuElem, s); }
                    }
                    catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                },
                onCommand: (_ev: any, ctx: any) => {
                    try {
                        const win = winOf(ctx); const lp = live();
                        const s = win && lp ? lp._wvTabSplitOf(win, ctx.tabID) : null;
                        if (win && lp && s) run(lp, win, s);
                    }
                    catch (e) { Zotero.debug("[Weavero] split follow menu " + l10nID + " err: " + e); }
                },
            });
            const id = wvMMRegister(MM, {
                menuID: "weavero-tab-split-follow",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [
                    entry("splitFollow", "weavero-menu-split-follow", () => true,
                        (el, s) => {
                            // A check mark the entry sets itself at each showing.
                            el.setAttribute("type", "checkbox");
                            el.setAttribute("autocheck", "false");
                            wvSetBoolAttr(el, "checked", !!s.follow);
                        },
                        (lp, win, s) => { lp._wvSplitFollowSet(win, s.id, !s.follow); }),
                    entry("splitKeep", "weavero-menu-split-keep", (_win, s) => !!s.follow, () => {},
                        (lp, win, s) => { lp._wvSplitFollowKeep(win, s.id); }),
                ],
            });
            if (id) self._wvSplitFollowMenuID = id;
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowRegisterMenus err: " + e); }
    }

    _wvSplitFollowUnregisterMenus() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if ((this as any)._wvSplitFollowMenuID && MM && typeof MM.unregisterMenu === "function") MM.unregisterMenu((this as any)._wvSplitFollowMenuID);
        }
        catch (e) {}
        (this as any)._wvSplitFollowMenuID = null;
    }

    /** The same two entries in the split's own menu (the label's "..." in a side's
     *  corner, tab-split.ts _wvTabSplitFooterMenu), after a separator. */
    _wvSplitFollowFooterItems(win: any, s: WvTabSplit, pop: any) {
        try {
            if (!this._wvSplitFollowOK(win, s)) return;
            const doc = win.document;
            pop.appendChild(doc.createXULElement("menuseparator"));
            const mi = doc.createXULElement("menuitem");
            mi.id = "wv-tsplit-menu-follow";
            mi.setAttribute("type", "checkbox");
            mi.setAttribute("autocheck", "false");
            wvSetBoolAttr(mi, "checked", !!s.follow);
            wvL10n(mi, "weavero-menu-split-follow");
            mi.addEventListener("command", () => { const lp = live(); if (lp) lp._wvSplitFollowSet(win, s.id, !s.follow); });
            pop.appendChild(mi);
            if (!s.follow) return;
            const keep = doc.createXULElement("menuitem");
            keep.id = "wv-tsplit-menu-keep";
            wvL10n(keep, "weavero-menu-split-keep");
            keep.addEventListener("command", () => { const lp = live(); if (lp) lp._wvSplitFollowKeep(win, s.id); });
            pop.appendChild(keep);
        }
        catch (e) { Zotero.debug("[Weavero] _wvSplitFollowFooterItems err: " + e); }
    }

    /** A main window closing: its previews' readers let go (their pref observers
     *  are Zotero's, global: kept, they would keep the closed window), its
     *  listeners off its items views. */
    _wvSplitFollowReleaseWindow(win: any) {
        try {
            const pm = PREVIEWS.get(win);
            if (pm) for (const id of Array.from(pm.keys())) this._wvSplitFollowPreviewDrop(win, id);
            PREVIEWS.delete(win);
            const map = STATE.get(win);
            if (map) { for (const st of map.values()) this._wvSplitFollowDrop(win, st); }
            STATE.delete(win);
            PARKING.delete(win);
        }
        catch (e) {}
    }

    /** Destroy: every preview let go, every listener off the items views, the marks
     *  and the sheet out of the strips, the menu entries gone. The splits keep
     *  `follow`, and a side shown as a preview stays an unloaded tab of its document
     *  (Zotero loads it when it is selected): a reload or a re-enable draws the
     *  previews again (_wvSplitFollowSync). */
    _wvSplitFollowUnwireAll() {
        try {
            this._wvSplitFollowUnregisterMenus();
            for (const w of wvMainWins()) {
                try {
                    this._wvSplitFollowReleaseWindow(w);
                    MARKED.delete(w);
                    wvRemoveStyle((w as any).document, STYLE_ID);
                    this._wvSplitFollowMark(w, new Set<string>());
                }
                catch (e) {}
            }
        }
        catch (e) {}
    }
}

const _tabSplitFollowDescriptors = Object.getOwnPropertyDescriptors(_TabSplitFollowMixin.prototype);
delete (_tabSplitFollowDescriptors as any).constructor;
export const tabSplitFollowMethods = _tabSplitFollowDescriptors;
