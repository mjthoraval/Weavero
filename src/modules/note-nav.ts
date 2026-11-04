// Module: navigation inside notes -- heading folding, the note outline, and
// links to a heading (2026-11-03; the "worth taking into Weavero" ideas of
// the Better Notes comparison, built display-only).
//
// The editor is a ProseMirror view in an iframe; the folding itself and the
// heading API live in the injected bundle (note-editor-inject.ts, INJECT_V 6).
// This is the chrome half, wired into every <note-editor> note-editor.ts
// wires (item pane, note tabs, note windows, the reader's notes pane):
//  - fold arrows: a press on `.wv-fold-toggle` -> the page's toggle; the
//    folds are remembered per note in <data dir>/weavero/note-view.json,
//    this computer only -- nothing is written into the note;
//  - the outline: a panel left of the editor, below its toolbar (whose
//    start holds the Toggle Outline button), the reader outline's look and
//    its current-section rule (the last heading the reading line, a quarter
//    of the way down the view, has passed);
//  - heading links: "Copy Link to Heading" gives the heading an `id` once
//    (a real, synced edit) and copies
//    zotero://select/<lib>/items/<noteKey>?wvheading=<id>. Without Weavero,
//    Zotero selects the note; with it the note also scrolls to the heading
//    -- the second Weavero-only link exception (MJT, 2026-11-03).

import { wvListen, wvUnlisten } from "../lib/listen";
import { wvHtmlEl, winOf, wvPopupHost, wvIsTextEntry } from "../lib/dom";
import { wvLivePlugin } from "../lib/live";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvMenuItem, wvMenuSeparator } from "../lib/menu";
import { wvStorePath, wvStoreRead, wvStoreWrite } from "../lib/store";
import { wvAccel, wvAccelAny } from "../lib/keys";
import { wvMainWins, wvWinType } from "../lib/windows";
import { wvSvgEl } from "../lib/svg";

const NV_FILE = "note-view.json";
const HEADINGS = "h1, h2, h3, h4, h5, h6";
// The outline starts open where the editor is wide, folded away where it is
// narrow (MJT 2026-11-03); the user's choice per kind wins from then on.
const OUTLINE_OPEN_DEFAULT: Record<string, boolean> = { tab: true, window: true, pane: false, context: false };
const OUTLINE_W_DEF = 200, OUTLINE_W_MIN = 120, OUTLINE_W_MAX = 480;
const NN_KEYS = ["noteNav:down", "noteNav:change", "noteNav:scroll", "noteNav:ctx"];

// Per-editor state, keyed by the <note-editor> element: never an expando on
// Zotero's element, and gone with it.
const nnState: WeakMap<any, any> = new WeakMap();

const OUTLINE_CSS = [
    // Below the note's toolbar, as the reader's sidebar sits below its
    // toolbar (MJT 2026-11-04): the toolbar lives INSIDE the editor iframe,
    // so the iframe keeps the full width and the panel lies over its left
    // edge, from the toolbar's bottom (--wv-nn-top, measured) down to the
    // links box; the page shifts everything under its toolbar right by the
    // panel's width (note-editor.ts, body.wv-nn-outline-open). A grid
    // stacks the two in one cell -- #note-editor's own flex column cannot,
    // and the iframe must never move (a moved iframe reloads). Switching
    // #note-editor to grid keeps the page alive (probed live 2026-11-04).
    "#note-editor:has(> .wv-note-outline){display:grid !important;grid-template-columns:auto minmax(0,1fr);"
        + "grid-template-rows:minmax(0,1fr) auto;}",
    "#note-editor:has(> .wv-note-outline) > *{grid-column:1 / -1;grid-row:1;}",
    // A grid does not stretch a replaced element (the iframe stayed 150px
    // tall) unless told to.
    "#note-editor:has(> .wv-note-outline) > #editor-view{align-self:stretch;min-height:0;}",
    "#note-editor:has(> .wv-note-outline) > #links-container{grid-row:2;}",
    "#note-editor:has(> .wv-note-outline) > .wv-note-outline{grid-column:1;z-index:1;margin-top:var(--wv-nn-top,41px);}",
    ".wv-note-outline{display:flex;flex-direction:column;position:relative;box-sizing:border-box;min-width:0;"
        + "width:var(--wv-nn-width,200px);border-inline-end:1px solid var(--fill-quinary,rgba(127,127,127,.25));"
        + "background:var(--material-sidepane,var(--material-background,#fff));overflow:hidden;font-size:12px;}",
    // Folded away = gone, as a collapsed sidebar is; the note toolbar's
    // Toggle Outline button brings it back.
    ".wv-note-outline[data-wv-closed]{display:none;}",
    ".wv-note-outline-bar{display:flex;align-items:center;gap:4px;flex:0 0 auto;height:30px;box-sizing:border-box;padding:0 4px 0 10px;}",
    ".wv-note-outline-title{flex:1 1 auto;min-width:0;font-weight:600;color:var(--fill-secondary,#666);"
        + "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-note-outline-list{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 4px 8px 4px;}",
    ".wv-note-outline-row{display:flex;align-items:center;min-height:22px;box-sizing:border-box;padding-inline-end:4px;"
        + "border-radius:4px;cursor:default;}",
    ".wv-note-outline-row[hidden]{display:none;}",
    ".wv-note-outline-row:hover{background:var(--fill-quinary,rgba(127,127,127,.1));}",
    // The reader outline's current-section mark (reader-panels.ts .wv-outline-current).
    ".wv-note-outline-row.wv-note-outline-current{box-shadow:inset 2px 0 0 0 var(--fill-secondary,#888);"
        + "background:rgba(127,127,127,.13);}",
    ".wv-note-outline-row.wv-note-outline-in-fold .wv-note-outline-label{opacity:.55;}",
    // The reader outline's marks (reader-panels.ts OUTLINE css): the blue
    // ring on the label is the keyboard cursor, the blue tint the selection,
    // a focus ring only for keyboard focus, dimmed = shown only because a
    // descendant matches the search.
    ".wv-note-outline-list:focus{outline:none;}",
    ".wv-note-outline-row:focus:not(:focus-visible){outline:none;}",
    ".wv-note-outline-row:focus-visible{outline:2px solid var(--color-accent,#5e6ad2);outline-offset:-2px;}",
    ".wv-note-outline-row.wv-note-outline-selected{background:var(--accent-blue10,rgba(94,106,210,.15));}",
    ".wv-note-outline-row.wv-note-outline-selected.wv-note-outline-current{background:var(--accent-blue10,rgba(94,106,210,.15));}",
    ".wv-note-outline-row.wv-note-outline-active .wv-note-outline-label{outline:3px solid var(--accent-blue50,var(--color-accent,#5e6ad2));"
        + "border-radius:5px;}",
    ".wv-note-outline-row.wv-note-outline-dimmed{opacity:.55;}",
    // The search behind a magnifier in the bar, Zotero's collections-pane
    // button (magnifier.svg): the row costs nothing until it is opened, and
    // opens BELOW the bar, the title staying in view (MJT 2026-11-04).
    ".wv-note-outline-search-btn{flex:0 0 auto;appearance:none;width:24px;height:24px;min-width:0;margin:0;padding:0;border:0;border-radius:4px;"
        + "background:url('chrome://zotero/skin/16/universal/magnifier.svg') center no-repeat;"
        + "-moz-context-properties:fill,fill-opacity;fill:var(--fill-secondary);}",
    ".wv-note-outline-search-btn:hover,.wv-note-outline[data-wv-searching] .wv-note-outline-search-btn"
        + "{background-color:var(--fill-quinary,rgba(127,127,127,.1));}",
    ".wv-note-outline-search-btn:focus-visible{outline:2px solid var(--color-accent,#5e6ad2);outline-offset:-2px;}",
    ".wv-note-outline-search{display:none;flex:0 0 auto;padding:0 6px 6px 8px;}",
    ".wv-note-outline[data-wv-searching] .wv-note-outline-search{display:block;}",
    ".wv-note-outline-search-input{width:100%;box-sizing:border-box;margin:0;font:inherit;font-size:12px;}",
    ".wv-note-outline-empty{padding:6px 8px;opacity:.6;}",
    // Zotero's tree twisty, its own recipe (_virtualized-table.scss
    // .twisty.icon-css): chevron-8 pointing down, turned -90deg when shut.
    ".wv-note-outline-twisty{flex:0 0 16px;width:16px;height:16px;box-sizing:border-box;}",
    ".wv-note-outline-twisty.wv-nn-kids{padding:4px;background:url('chrome://zotero/skin/8/universal/chevron-8.svg') content-box no-repeat;"
        + "-moz-context-properties:fill,fill-opacity;fill:var(--fill-secondary);transition:transform .125s ease;}",
    ".wv-note-outline-twisty.wv-nn-kids.wv-nn-shut{transform:rotate(-90deg);}",
    ".wv-note-outline-twisty.wv-nn-kids.wv-nn-shut:-moz-locale-dir(rtl){transform:rotate(90deg);}",
    ".wv-note-outline-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-note-outline-grip{position:absolute;top:0;bottom:0;inset-inline-end:-3px;width:6px;cursor:ew-resize;z-index:2;}",
].join("\n");

/** The note outline as the reader's shared list-key handler sees it
 *  (reader-panels.ts WvListKeys; WV_KEYS_OUTLINE is the reader's own). The
 *  "reader" slot carries the editor's nnState; rows are keyed by data-key
 *  (level|text|occurrence). Only plain keys reach it (_wvNoteOutlineKey),
 *  so the selection is always the one row the cursor is on. */
const NOTE_OUTLINE_KEYS: any = {
    kind: "note-outline",
    viewClass: "wv-note-outline",
    rowClass: "wv-note-outline-row",
    active: "wv-note-outline-active",
    selected: "wv-note-outline-selected",
    key: (p: any, row: any) => row.getAttribute("data-key"),
    sel: (st: any) => st.sel,
    anchor: (st: any) => st.anchor,
    setAnchor: (st: any, key: any) => { st.anchor = key; },
    setCursor: (st: any, key: any) => { st.cursor = key || ""; },
    cursor: (p: any, st: any, rows: any[]) => {
        let i = rows.findIndex((r: any) => r.getAttribute("data-key") === st.cursor);
        if (i < 0) i = rows.findIndex((r: any) => r.classList.contains("wv-note-outline-active"));
        return i;
    },
    navigate: (p: any, st: any, doc: any, row: any) => {
        p._wvNoteOutlineGo(st.ne, st.iframe, Number(row.getAttribute("data-ord")), { flash: p._wvNnOutlineFlashOn() });
    },
    edit: (p: any, st: any, doc: any, row: any) => { p._wvNnCaretTo(st.ne, st.iframe, row); },
    container: (p: any, st: any, row: any) => {
        const has = !!row.querySelector(".wv-note-outline-twisty.wv-nn-kids");
        return { has, open: has && !st.shut.has(row.getAttribute("data-key")) };
    },
    depth: (p: any, row: any) => Number(row.getAttribute("data-depth")) || 0,
    setOpen: (p: any, st: any, doc: any, row: any, open: boolean) => {
        const k = row.getAttribute("data-key");
        if (open) st.shut.delete(k);
        else st.shut.add(k);
        p._wvNoteOutlineRender(st.ne, st.iframe);
    },
    setSelectionOpen: (p: any, st: any, doc: any, open: boolean) => {
        for (const k of st.sel) {
            if (open) st.shut.delete(k);
            else st.shut.add(k);
        }
        p._wvNoteOutlineRender(st.ne, st.iframe);
    },
};

class _NoteNavMixin {
    [k: string]: any;

    // ---- switches

    _wvNoteFoldOn(): boolean {
        try { return !!this._getEnableNotes() && !!this._wvPref("noteFolding"); }
        catch (e) { return false; }
    }

    _wvNoteOutlineOn(): boolean {
        try { return !!this._getEnableNotes() && !!this._wvPref("noteOutline"); }
        catch (e) { return false; }
    }

    // ---- the editor and its page

    _wvNnState(ne: any): any {
        let st = nnState.get(ne);
        if (!st) {
            st = { ctxOrd: -1, ctxAt: 0, pending: "", timer: null, foldTag: "", foldTagPending: "",
                spyHoldUntil: 0, spyRaf: 0, current: -1, shut: new Set<string>(), cursor: "",
                sel: new Set<string>(), anchor: null, query: "", ne: null, iframe: null };
            nnState.set(ne, st);
        }
        return st;
    }

    _wvNnIframe(ne: any): any {
        try { return ne && (ne.querySelector("iframe#editor-view") || ne.querySelector("iframe")); }
        catch (e) { return null; }
    }

    _wvNnPage(iframe: any): any {
        try { const w = iframe && iframe.contentWindow; return w ? (w as any).wrappedJSObject : null; }
        catch (e) { return null; }
    }

    /** The page's heading list (note-editor-inject.ts headingsJSON). */
    _wvNnHeadings(iframe: any): any[] {
        const wj = this._wvNnPage(iframe);
        if (!wj || typeof wj.__wvNoteHeadings !== "function") return [];
        try { return JSON.parse(String(wj.__wvNoteHeadings())) || []; }
        catch (e) { return []; }
    }

    /** The heading elements, in the order the page numbers them. */
    _wvNnHeadingEls(idoc: any): any[] {
        try {
            const pm = idoc && idoc.querySelector(".ProseMirror");
            return pm ? Array.from(pm.querySelectorAll(HEADINGS)) : [];
        }
        catch (e) { return []; }
    }

    _wvNnOrdOf(idoc: any, target: any): number {
        try {
            let t = target;
            if (t && t.nodeType === 3) t = t.parentNode;
            const h = t && t.closest ? t.closest(HEADINGS) : null;
            if (!h || !h.closest(".ProseMirror")) return -1;
            return this._wvNnHeadingEls(idoc).indexOf(h);
        }
        catch (e) { return -1; }
    }

    _wvNnNoteKey(ne: any): string {
        try { const it = ne && ne.item; return it && it.key ? it.libraryID + ":" + it.key : ""; }
        catch (e) { return ""; }
    }

    /** "tab" | "window" | "pane" | "context" -- where the editor sits. */
    _wvNnKind(ne: any): string {
        try {
            if (ne.classList.contains("note-tab") || ne.viewMode === "tab") return "tab";
            const wt = wvWinType(ne.ownerDocument);
            if (wt === "zotero:note") return "window";
            // A note tab in a reader window (reader.ts _wvWTMountTab): a full
            // editor, so the outline opens there as in a main-window tab.
            if (wt === "zotero:reader" && ne.classList.contains("wv-wt-note")) return "tab";
            if (ne.closest("#zotero-context-pane")) return "context";
        }
        catch (e) {}
        return "pane";
    }

    /** The editor's scroll box. */
    _wvNnScroller(idoc: any): any {
        try { return idoc.querySelector(".editor-core") || idoc.scrollingElement; }
        catch (e) { return null; }
    }

    // ---- the local store: folds per note, the outline's width and open state

    async _wvNvLoad(): Promise<any> {
        if (this._wvNv) return this._wvNv;
        if (!this._wvNvLoading) {
            this._wvNvLoading = (async () => {
                const r = await wvStoreRead(wvStorePath(NV_FILE));
                const doc: any = (r.status === "ok" && r.doc && typeof r.doc === "object") ? r.doc : {};
                // An unreadable file (a lock, antivirus) is kept and never
                // overwritten this session (lib/store.ts).
                this._wvNvReadOnly = r.status === "io-error";
                if (!doc.folds || typeof doc.folds !== "object") doc.folds = {};
                if (!doc.outline || typeof doc.outline !== "object") doc.outline = {};
                doc.producer = "weavero";
                doc.schemaVersion = 1;
                this._wvNv = doc;
                return doc;
            })();
        }
        return this._wvNvLoading;
    }

    _wvNvSave() {
        if (!this._wvNv || this._wvNvReadOnly || this._wvDestroyed) return;
        if (this._wvNvSaveT) wvClearTimeout(this._wvNvSaveT);
        this._wvNvSaveT = wvTimeout(() => {
            this._wvNvSaveT = null;
            if (this._wvNv && !this._wvNvReadOnly) wvStoreWrite(wvStorePath(NV_FILE), this._wvNv);
        }, 400);
    }

    // ---- wiring (from note-editor.ts wireUp, once per editor document)

    _wvNoteNavWire(ne: any, iframe: any, idoc: any) {
        try {
            const tag = this._wvWireTag();
            this._wvNnSetFlags(iframe);
            wvListen(idoc, "noteNav:down", "mousedown", (e: any) => {
                const p = wvLivePlugin();
                if (p) p._wvNnOnMouseDown(e, ne, iframe);
            }, true, tag);
            wvListen(idoc, "noteNav:change", "wvnotechange", (e: any) => {
                const p = wvLivePlugin();
                if (p) p._wvNnOnChange(e, ne, iframe);
            }, false, tag);
            // Element scrolls do not bubble; a capture listener on the
            // document still sees the editor box's.
            wvListen(idoc, "noteNav:scroll", "scroll", () => {
                const p = wvLivePlugin();
                if (p) p._wvNnOnScroll(ne, iframe);
            }, true, tag);
            wvListen(idoc, "noteNav:ctx", "contextmenu", (e: any) => {
                const p = wvLivePlugin();
                if (p) p._wvNnOnContext(e, ne, iframe);
            }, true, tag);
            // Zotero rebuilds #editor-menu on every right-click
            // (editorInstance.js _openPopup) and opens it once built.
            const menu = ne.querySelector("#editor-menu");
            if (menu) {
                wvListen(menu, "noteNav:menu", "popupshowing", (e: any) => {
                    const p = wvLivePlugin();
                    if (p) p._wvNnOnMenuShowing(e, ne, iframe, menu);
                }, false, tag);
                wvListen(menu, "noteNav:menuHide", "popuphidden", (e: any) => {
                    if (e.target !== menu) return;   // a submenu closing bubbles here
                    try { for (const el of menu.querySelectorAll(":scope > [id^='wv-note-heading-link']")) el.remove(); }
                    catch (er) {}
                }, false, tag);
            }
            this._wvNvLoad().then(() => {
                const p = wvLivePlugin();
                if (p) p._wvNnSync(ne, iframe, "init");
            }).catch(() => {});
        }
        catch (e) { Zotero.debug("[Weavero] note nav wire err: " + e); }
    }

    /** Push the fold switch into the page and its stylesheet hook. */
    _wvNnSetFlags(iframe: any) {
        try {
            const on = this._wvNoteFoldOn();
            const wj = this._wvNnPage(iframe);
            if (wj) wj.__wvFoldEnabled = on;
            const body = iframe.contentDocument && iframe.contentDocument.body;
            if (body) {
                body.classList.toggle("wv-fold-on", on);
                // Better Notes' left-pane toggle goes with its pane (below).
                body.classList.toggle("wv-nn-outline-on", this._wvNoteOutlineOn());
            }
        }
        catch (e) {}
    }

    /** The note outline takes the place of Better Notes' left pane: while
     *  the setting is on, the window's root carries the mark constants.ts
     *  hides that pane and its splitter by (MJT 2026-11-04, "Replace the left
     *  pane of BN completely when the Weavero note outline is active"). On
     *  the root, not on each editor, so the pane never flashes while a note
     *  tab opens. Hidden, never removed: Better Notes keeps its state (its
     *  splitter handler ignores a splitter measuring 0 x 0), and unticking
     *  "Outline beside notes" brings it back, mind maps included. */
    _wvNnMarkDoc(doc: any) {
        try {
            const root = doc && doc.documentElement;
            if (!root) return;
            if (this._wvNoteOutlineOn()) root.setAttribute("data-wv-note-outline", "true");
            else root.removeAttribute("data-wv-note-outline");
        }
        catch (e) {}
    }

    /** After a fold or outline switch flips: every wired editor re-reads
     *  it, repaints, and redraws its outline. */
    _wvNoteNavRefreshAll() {
        if (this._wvDestroyed) return;
        try { for (const w of wvMainWins()) this._wvNnMarkDoc(w && w.document); } catch (e) {}
        for (const ne of this._wvNnAllEditors()) {
            try {
                const iframe = this._wvNnIframe(ne);
                if (!iframe || !iframe.contentDocument) continue;
                this._wvNnSetFlags(iframe);
                const wj = this._wvNnPage(iframe);
                if (wj && typeof wj.__wvRedecorateNotes === "function") wj.__wvRedecorateNotes();
                this._wvNnSync(ne, iframe, "pref");
            }
            catch (e) {}
        }
    }

    _wvNnAllEditors(): any[] {
        const out: any[] = [];
        const docs: any[] = [];
        try { for (const w of wvMainWins()) if (w && w.document) docs.push(w.document); } catch (e) {}
        for (const wt of ["zotero:note", "zotero:reader"]) {
            try {
                const en = Services.wm.getEnumerator(wt);
                while (en.hasMoreElements()) { const w: any = en.getNext(); if (w && w.document) docs.push(w.document); }
            }
            catch (e) {}
        }
        for (const d of docs) {
            try { for (const ne of d.querySelectorAll("note-editor")) out.push(ne); } catch (e) {}
        }
        return out;
    }

    // ---- events

    _wvNnOnMouseDown(e: any, ne: any, iframe: any) {
        try {
            if (e.button !== 0) return;
            let t = e.target;
            if (t && t.nodeType === 3) t = t.parentNode;
            const tog = t && t.closest ? t.closest(".wv-fold-toggle") : null;
            if (!tog) return;
            // The arrow is ours: no caret move, no drag, no focus change.
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            const ord = this._wvNnOrdOf(iframe.contentDocument, tog);
            const wj = this._wvNnPage(iframe);
            if (ord >= 0 && wj && typeof wj.__wvFoldToggle === "function") wj.__wvFoldToggle(ord);
        }
        catch (er) { Zotero.debug("[Weavero] fold toggle err: " + er); }
    }

    _wvNnOnChange(e: any, ne: any, iframe: any) {
        try {
            const st = this._wvNnState(ne);
            st.pending += " " + String((e && e.detail) || "");
            if (st.timer) return;
            const w = winOf(ne);
            if (!w) return;
            st.timer = w.setTimeout(() => {
                st.timer = null;
                const flags = st.pending;
                st.pending = "";
                const p = wvLivePlugin();
                if (p) p._wvNnSync(ne, iframe, flags);
            }, 150);
        }
        catch (er) {}
    }

    _wvNnOnScroll(ne: any, iframe: any) {
        try {
            const st = this._wvNnState(ne);
            if (st.spyRaf) return;
            const w = winOf(ne);
            if (!w) return;
            st.spyRaf = w.requestAnimationFrame(() => {
                st.spyRaf = 0;
                const p = wvLivePlugin();
                if (p) p._wvNnSpy(ne, iframe);
            });
        }
        catch (er) {}
    }

    _wvNnOnContext(e: any, ne: any, iframe: any) {
        try {
            const st = this._wvNnState(ne);
            st.ctxOrd = this._wvNnOrdOf(iframe.contentDocument, e.target);
            st.ctxAt = Date.now();
        }
        catch (er) {}
    }

    /** "Copy Link to Heading" at the top of the note's own menu when the
     *  right-click was in a heading. */
    _wvNnOnMenuShowing(e: any, ne: any, iframe: any, menu: any) {
        try {
            if (e.target !== menu) return;   // a submenu opening bubbles here
            for (const el of menu.querySelectorAll(":scope > [id^='wv-note-heading-link']")) el.remove();
            const st = this._wvNnState(ne);
            if (st.ctxOrd < 0 || Date.now() - st.ctxAt > 3000) return;
            if (!this._wvNoteHeadingLinksOn()) return;
            const ord = st.ctxOrd;
            const heads = this._wvNnHeadings(iframe);
            const h = heads[ord];
            if (!h) return;
            const doc = menu.ownerDocument;
            const sep = wvMenuSeparator(doc);
            sep.id = "wv-note-heading-link-sep";
            menu.insertBefore(sep, menu.firstChild);
            menu.insertBefore(this._wvNnLinkMenuItem(doc, ne, heads, h), sep);
        }
        catch (er) { Zotero.debug("[Weavero] heading-link menu err: " + er); }
    }

    /** The reader outline's "Highlight the heading text when clicking an
     *  outline entry" (enableOutlineTextHighlight) governs the note outline's
     *  flash too: one setting for both outlines (MJT 2026-11-04). */
    _wvNnOutlineFlashOn(): boolean {
        try { return !!this._getEnableOutlineTextHighlight(); }
        catch (e) { return true; }
    }

    _wvNoteHeadingLinksOn(): boolean {
        try { return !!this._getEnableCopyItemLink(); }
        catch (e) { return false; }
    }

    _wvNnLinkMenuItem(doc: any, ne: any, heads: any[], h: any): any {
        // A read-only note cannot take an id; a heading that already has a
        // unique one still links.
        const unique = !!h.id && heads.filter((x: any) => x.id === h.id).length === 1;
        const ro = ne.mode !== "edit";
        const mi = wvMenuItem(doc, {
            label: "Copy Link to Heading",
            attrs: { id: "wv-note-heading-link" },
            disabled: ro && !unique,
            onCommand: () => {
                const p = wvLivePlugin();
                if (p) p._wvNoteCopyHeadingLink(ne, h.ord);
            },
        });
        if (ro && !unique) mi.setAttribute("tooltiptext", "This note is read-only, and the heading has no link anchor yet.");
        return mi;
    }

    // ---- sync: folds restored / remembered, outline redrawn, spy

    _wvNnSync(ne: any, iframe: any, flags: string) {
        try {
            if (this._wvDestroyed || !ne || !ne.isConnected) return;
            const idoc = iframe && iframe.contentDocument;
            if (!idoc) return;
            this._wvNnFoldRestore(ne, iframe);
            if (/fold|doc/.test(flags)) this._wvNnFoldPersist(ne, iframe);
            this._wvNoteOutlineRender(ne, iframe);
            this._wvNnSpy(ne, iframe);
        }
        catch (e) { Zotero.debug("[Weavero] note nav sync err: " + e); }
    }

    /** Re-apply the note's remembered folds, once per editor view (a note
     *  loaded into the same iframe gets a new view and a new tag). */
    async _wvNnFoldRestore(ne: any, iframe: any) {
        try {
            const wj = this._wvNnPage(iframe);
            if (!wj || typeof wj.__wvFoldViewTag !== "function") return;
            const tag = String(wj.__wvFoldViewTag() || "");
            if (!tag) return;
            const st = this._wvNnState(ne);
            if (st.foldTag === tag || st.foldTagPending === tag) return;
            st.foldTagPending = tag;
            const nv = await this._wvNvLoad();
            if (this._wvDestroyed) return;
            const wj2 = this._wvNnPage(iframe);
            if (!wj2 || String(wj2.__wvFoldViewTag() || "") !== tag) { st.foldTagPending = ""; return; }
            const key = this._wvNnNoteKey(ne);
            const saved = key ? nv.folds[key] : null;
            if (Array.isArray(saved) && saved.length) {
                const ords = this._wvNnMatchFolds(this._wvNnHeadings(iframe), saved);
                if (ords.length) wj2.__wvFoldSet(JSON.stringify(ords));
            }
            st.foldTag = tag;
            st.foldTagPending = "";
        }
        catch (e) { Zotero.debug("[Weavero] fold restore err: " + e); }
    }

    /** Saved folds -> heading ordinals: by `id` when the heading has one,
     *  else the n-th top-level heading with that text and level. */
    _wvNnMatchFolds(heads: any[], saved: any[]): number[] {
        const tops = heads.filter((h: any) => h.top);
        const out: number[] = [];
        for (const e of saved) {
            if (!e) continue;
            let m: any = e.id ? tops.find((h: any) => h.id === e.id) : null;
            if (!m) m = tops.filter((h: any) => h.text === e.t && h.level === e.l)[e.n || 0];
            if (m && out.indexOf(m.ord) < 0) out.push(m.ord);
        }
        return out;
    }

    _wvNnFoldPersist(ne: any, iframe: any) {
        try {
            const nv = this._wvNv;
            if (!nv) return;
            const wj = this._wvNnPage(iframe);
            const st = this._wvNnState(ne);
            // Never before this view's restore ran: an empty fresh view
            // would erase the note's remembered folds.
            if (!wj || typeof wj.__wvFoldViewTag !== "function" || st.foldTag !== String(wj.__wvFoldViewTag() || "")) return;
            const key = this._wvNnNoteKey(ne);
            if (!key) return;
            const tops = this._wvNnHeadings(iframe).filter((h: any) => h.top);
            const entries: any[] = [];
            tops.forEach((h: any, i: number) => {
                if (!h.folded) return;
                const n = tops.slice(0, i).filter((o: any) => o.text === h.text && o.level === h.level).length;
                const e: any = { t: h.text, l: h.level, n };
                if (h.id) e.id = h.id;
                entries.push(e);
            });
            const before = JSON.stringify(nv.folds[key] || null);
            if (entries.length) nv.folds[key] = entries;
            else delete nv.folds[key];
            if (JSON.stringify(nv.folds[key] || null) !== before) this._wvNvSave();
        }
        catch (e) { Zotero.debug("[Weavero] fold persist err: " + e); }
    }

    // ---- the outline panel

    _wvNoteOutlineRender(ne: any, iframe: any) {
        const doc = ne.ownerDocument;
        let panel: any = ne.querySelector(".wv-note-outline");
        // A panel built by a previous instance carries its listeners: rebuild.
        if (panel && panel.getAttribute("data-wv-tag") !== this._wvWireTag()) { panel.remove(); panel = null; }
        const heads = this._wvNoteOutlineOn() ? this._wvNnHeadings(iframe) : [];
        if (!heads.length) {
            if (panel) panel.remove();
            this._wvNnEnsureToggle(ne, iframe, false);
            this._wvNnPageInset(iframe, 0);
            return;
        }
        const host = ne.querySelector("#note-editor");
        if (!host || iframe.parentElement !== host) return;
        if (!panel) panel = this._wvNoteOutlineBuild(ne, iframe);
        if (panel.parentElement !== host || panel.nextElementSibling !== iframe) host.insertBefore(panel, iframe);
        this._wvNnEnsureToggle(ne, iframe, true);
        this._wvNoteOutlineApplyUi(ne, panel);
        const els = this._wvNnHeadingEls(iframe.contentDocument);
        const rows = heads.map((h: any) => ({
            ord: h.ord, level: h.level, hidden: !!h.hidden,
            text: String((els[h.ord] && els[h.ord].textContent) || h.text || "").replace(/\s+/g, " ").trim(),
        }));
        const st = this._wvNnState(ne);
        st.ne = ne;
        st.iframe = iframe;
        const q = String(st.query || "").trim().toLowerCase();
        const sig = JSON.stringify(rows) + "|" + [...st.shut].join(",") + "|" + q;
        if (st.sig === sig && panel.querySelector(".wv-note-outline-row, .wv-note-outline-empty")) return;
        st.sig = sig;
        const list = panel.querySelector(".wv-note-outline-list");
        // A rebuild (an edit, a twisty) must not throw the keyboard out of
        // the list: note whether a row had focus, give it back after.
        const hadFocus = !!(doc.activeElement && list.contains(doc.activeElement));
        list.replaceChildren();
        // Depth from the heading levels: a heading's parent is the nearest
        // earlier heading of a lower level (h1 > h3 is one step, not two).
        const stack: any[] = [];
        const seen = new Map<string, number>();
        const keyed = rows.map((r: any) => {
            while (stack.length && stack[stack.length - 1].level >= r.level) stack.pop();
            const depth = stack.length;
            const base = r.level + "|" + r.text;
            const n = seen.get(base) || 0;
            seen.set(base, n + 1);
            const key = base + "|" + n;
            const shutAbove = stack.some((a: any) => st.shut.has(a.key));
            const out = Object.assign({}, r, { depth, key, shutAbove, parents: stack.slice() });
            stack.push(out);
            return out;
        });
        // The search (the reader outline's model): a heading whose text holds
        // the query, plus every heading above it (dimmed when it does not
        // match itself); a search shows matches under closed rows too.
        let shown: Set<any> | null = null, direct: Set<any> | null = null;
        if (q) {
            shown = new Set(); direct = new Set();
            for (const r of keyed) {
                if (String(r.text).toLowerCase().indexOf(q) < 0) continue;
                direct.add(r);
                shown.add(r);
                for (const a of r.parents) shown.add(a);
            }
            if (!shown.size) {
                wvHtmlEl(doc, "div", "wv-note-outline-empty", "No headings match the search.", list);
                st.current = -2;
                return;
            }
        }
        keyed.forEach((r: any, i: number) => {
            const kids = i + 1 < keyed.length && keyed[i + 1].depth > r.depth;
            const row = wvHtmlEl(doc, "div", "wv-note-outline-row", undefined, list);
            row.setAttribute("role", "treeitem");
            row.setAttribute("data-ord", String(r.ord));
            row.setAttribute("data-key", r.key);
            row.setAttribute("tabindex", "-1");
            row.setAttribute("data-depth", String(r.depth));
            // Cursor and selection are state: a rebuild keeps them.
            if (st.cursor === r.key) row.classList.add("wv-note-outline-active");
            if (st.sel.has(r.key)) row.classList.add("wv-note-outline-selected");
            row.style.paddingInlineStart = (2 + r.depth * 14) + "px";
            if (r.hidden) row.classList.add("wv-note-outline-in-fold");
            if (shown) {
                if (!shown.has(r)) row.hidden = true;
                else if (direct && !direct.has(r)) row.classList.add("wv-note-outline-dimmed");
            }
            else if (r.shutAbove) row.hidden = true;
            const tw = wvHtmlEl(doc, "span", "wv-note-outline-twisty", undefined, row);
            if (kids) {
                tw.classList.add("wv-nn-kids");
                if (st.shut.has(r.key)) tw.classList.add("wv-nn-shut");
            }
            const lab = wvHtmlEl(doc, "span", "wv-note-outline-label", r.text || "(untitled)", row);
            lab.setAttribute("title", r.text || "");
        });
        st.current = -2;   // re-mark on the next spy pass
        if (hadFocus) {
            const cur = list.querySelector(".wv-note-outline-row.wv-note-outline-active:not([hidden])");
            try { (cur || list).focus(); } catch (e) {}
        }
    }

    _wvNoteOutlineBuild(ne: any, iframe: any): any {
        const doc = ne.ownerDocument;
        const panel = wvHtmlEl(doc, "div", "wv-note-outline");
        panel.setAttribute("data-wv-tag", this._wvWireTag());
        panel.setAttribute("role", "navigation");
        // Its own sheet, inside it: no document-level element on the main
        // window (window-wiring.spec.js records every wv- id there), and it
        // goes with the panel.
        wvHtmlEl(doc, "style", undefined, OUTLINE_CSS, panel);
        const bar = wvHtmlEl(doc, "div", "wv-note-outline-bar", undefined, panel);
        wvHtmlEl(doc, "span", "wv-note-outline-title", "Outline", bar);
        const mag = wvHtmlEl(doc, "button", "wv-note-outline-search-btn", undefined, bar);
        mag.setAttribute("type", "button");
        mag.setAttribute("title", "Filter headings");
        mag.setAttribute("aria-label", "Filter headings");
        const sbox = wvHtmlEl(doc, "div", "wv-note-outline-search", undefined, panel);
        const sin = wvHtmlEl(doc, "input", "wv-note-outline-search-input", undefined, sbox);
        // type=search: Zotero 11 draws its own clear button (src-ts.md).
        sin.setAttribute("type", "search");
        sin.setAttribute("placeholder", "Filter headings");
        sin.setAttribute("aria-label", "Filter headings");
        // A rebuild keeps a running search on screen.
        const query = String(this._wvNnState(ne).query || "");
        if (query) { sin.value = query; panel.setAttribute("data-wv-searching", "true"); }
        const list = wvHtmlEl(doc, "div", "wv-note-outline-list", undefined, panel);
        list.setAttribute("role", "tree");
        list.setAttribute("tabindex", "0");
        const grip = wvHtmlEl(doc, "div", "wv-note-outline-grip", undefined, panel);
        // Listeners on our own elements: the panel is rebuilt whenever
        // another instance finds it (data-wv-tag), and removed on teardown.
        list.addEventListener("click", (e: any) => {
            const p = wvLivePlugin();
            if (p) p._wvNoteOutlineClick(e, ne, iframe);
        });
        list.addEventListener("keydown", (e: any) => {
            const p = wvLivePlugin();
            if (p) p._wvNoteOutlineKey(e, ne, iframe);
        });
        sin.addEventListener("input", () => {
            const p = wvLivePlugin();
            if (!p) return;
            p._wvNnState(ne).query = String(sin.value || "");
            p._wvNoteOutlineRender(ne, iframe);
        });
        sin.addEventListener("keydown", (e: any) => {
            const p = wvLivePlugin();
            if (p) p._wvNoteOutlineSearchKey(e, ne, iframe);
        });
        // Focus stays in the field: its blur would close it and this click
        // open it again.
        mag.addEventListener("mousedown", (e: any) => e.preventDefault());
        mag.addEventListener("click", () => {
            const p = wvLivePlugin();
            if (!p) return;
            if (panel.hasAttribute("data-wv-searching")) p._wvNoteOutlineSearchClose(ne, iframe);
            else p._wvNoteOutlineSearchShow(panel, true);
        });
        sin.addEventListener("blur", () => {
            const p = wvLivePlugin();
            if (p && !sin.value) p._wvNoteOutlineSearchShow(panel, false);
        });
        list.addEventListener("contextmenu", (e: any) => {
            const p = wvLivePlugin();
            if (p) p._wvNoteOutlineContext(e, ne, iframe);
        });
        grip.addEventListener("pointerdown", (e: any) => {
            const p = wvLivePlugin();
            if (p) p._wvNoteOutlineResize(e, ne, panel, grip);
        });
        return panel;
    }

    _wvNnOutlineOpen(ne: any): boolean {
        const kind = this._wvNnKind(ne);
        const o = this._wvNv && this._wvNv.outline && this._wvNv.outline.open;
        if (o && typeof o[kind] === "boolean") return o[kind];
        return !!OUTLINE_OPEN_DEFAULT[kind];
    }

    _wvNoteOutlineApplyUi(ne: any, panel: any) {
        const open = this._wvNnOutlineOpen(ne);
        if (open) panel.removeAttribute("data-wv-closed");
        else panel.setAttribute("data-wv-closed", "true");
        let w = Number(this._wvNv && this._wvNv.outline && this._wvNv.outline.width) || OUTLINE_W_DEF;
        w = Math.max(OUTLINE_W_MIN, Math.min(OUTLINE_W_MAX, w));
        panel.style.setProperty("--wv-nn-width", w + "px");
        try {
            const iframe = this._wvNnIframe(ne);
            const idoc = iframe && iframe.contentDocument;
            if (!idoc) return;
            const btn = idoc.querySelector(".wv-nn-outline-toggle");
            if (btn) btn.setAttribute("aria-pressed", open ? "true" : "false");
            // The panel starts at the bottom of the page's toolbar (41px
            // plus its border in Zotero's sheet; none when the editor has
            // no toolbar).
            const tb = idoc.querySelector(".toolbar");
            if (tb) panel.style.setProperty("--wv-nn-top", Math.round(tb.getBoundingClientRect().bottom) + "px");
            else if (idoc.querySelector(".editor")) panel.style.setProperty("--wv-nn-top", "0px");
            this._wvNnPageInset(iframe, open ? w : 0);
        }
        catch (e) {}
    }

    /** Make room in the page for the panel lying over it: everything under
     *  the toolbar moves right by `w` px (0 = none; note-editor.ts sheet). */
    _wvNnPageInset(iframe: any, w: number) {
        try {
            const body = iframe && iframe.contentDocument && iframe.contentDocument.body;
            if (!body) return;
            body.classList.toggle("wv-nn-outline-open", w > 0);
            if (w > 0) body.style.setProperty("--wv-nn-outline-w", w + "px");
            else body.style.removeProperty("--wv-nn-outline-w");
        }
        catch (e) {}
    }

    /** The outline's show/hide control: a button at the START of the note
     *  editor's own toolbar, drawn as Zotero's toolbar buttons are
     *  (`toolbar-button`, the note editor's sheet) with Zotero's sidebar.svg
     *  -- where the reader keeps its Toggle Sidebar (the left end of its
     *  toolbar), and the mirror of the END slot where the note editor puts
     *  its own Toggle Context Pane when it draws one (note-editor
     *  toolbar.js; Zotero 11's note tabs leave that to the item pane's side
     *  bar). MJT 2026-11-04: "should follow the design of other panes".
     *  There only while the note has an outline. A foreign node in React's
     *  `.start` container survives its reconciliation; it is re-ensured on
     *  every sync, and rebuilt when another instance made it (its listener
     *  belongs to that instance). */
    _wvNnEnsureToggle(ne: any, iframe: any, show: boolean) {
        try {
            const idoc = iframe && iframe.contentDocument;
            if (!idoc) return;
            let btn: any = idoc.querySelector(".wv-nn-outline-toggle");
            if (btn && (!show || btn.getAttribute("data-wv-tag") !== this._wvWireTag())) { btn.remove(); btn = null; }
            if (!show) return;
            const start = idoc.querySelector(".toolbar .start");
            if (!start) return;
            if (!btn) {
                btn = idoc.createElement("button");
                btn.className = "toolbar-button wv-nn-outline-toggle";
                btn.setAttribute("type", "button");
                btn.setAttribute("title", "Toggle Outline");
                btn.setAttribute("aria-label", "Toggle Outline");
                btn.setAttribute("data-wv-tag", this._wvWireTag());
                // Zotero's res/icons/20/sidebar.svg (note editor + reader),
                // unflipped: the panel it shows is on the LEFT.
                const svg = wvSvgEl(idoc, "svg", { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none" });
                for (const [d, rule] of [
                    ["M7 7.25H4V6H7V7.25Z", ""],
                    ["M7 10.25H4V9H7V10.25Z", ""],
                    ["M7 13.25H4V12H7V13.25Z", ""],
                    ["M2.25 3C1.55964 3 1 3.55964 1 4.25V15.75C1 16.4404 1.55964 17 2.25 17H17.75C18.4404 17 19 16.4404 19 15.75V4.25C19 3.55964 18.4404 3 17.75 3H2.25ZM17.75 4.25H10V15.75H17.75V4.25ZM2.25 4.25H8.75V15.75H2.25V4.25Z", "evenodd"],
                ]) {
                    const path = wvSvgEl(idoc, "path", { d, fill: "currentColor" }, svg);
                    if (rule) { path.setAttribute("fill-rule", rule); path.setAttribute("clip-rule", rule); }
                }
                btn.appendChild(svg);
                btn.addEventListener("click", () => {
                    const p = wvLivePlugin();
                    if (p) p._wvNoteOutlineToggleOpen(ne);
                });
            }
            if (btn.parentNode !== start || start.firstChild !== btn) start.insertBefore(btn, start.firstChild);
            btn.setAttribute("aria-pressed", this._wvNnOutlineOpen(ne) ? "true" : "false");
        }
        catch (e) { Zotero.debug("[Weavero] outline toggle err: " + e); }
    }

    /** Open / fold away the outline -- remembered per kind of editor. */
    _wvNoteOutlineToggleOpen(ne: any) {
        try {
            const nv = this._wvNv;
            if (!nv) return;
            const kind = this._wvNnKind(ne);
            const open = !this._wvNnOutlineOpen(ne);
            nv.outline.open = Object.assign({}, nv.outline.open || {}, { [kind]: open });
            this._wvNvSave();
            for (const other of this._wvNnAllEditors()) {
                const pn = other.querySelector(".wv-note-outline");
                if (pn && this._wvNnKind(other) === kind) this._wvNoteOutlineApplyUi(other, pn);
            }
            const iframe = this._wvNnIframe(ne);
            if (open && iframe) { this._wvNnState(ne).current = -2; this._wvNnSpy(ne, iframe); }
        }
        catch (e) {}
    }

    _wvNoteOutlineClick(e: any, ne: any, iframe: any) {
        try {
            const row = e.target && e.target.closest ? e.target.closest(".wv-note-outline-row") : null;
            if (!row) return;
            const st = this._wvNnState(ne);
            if (e.target.closest(".wv-note-outline-twisty.wv-nn-kids")) {
                const key = row.getAttribute("data-key");
                if (st.shut.has(key)) st.shut.delete(key);
                else st.shut.add(key);
                this._wvNoteOutlineRender(ne, iframe);
                return;
            }
            st.ne = ne;
            st.iframe = iframe;
            const list = row.parentElement;
            const key = row.getAttribute("data-key");
            const mark = () => {
                for (const r of list.querySelectorAll(".wv-note-outline-row")) {
                    r.classList.toggle("wv-note-outline-selected", st.sel.has(r.getAttribute("data-key")));
                    r.classList.toggle("wv-note-outline-active", r === row);
                }
                st.cursor = key;
            };
            // One row at a time: the reader's Ctrl / Shift+click selection
            // serves its editing (MJT 2026-11-04: no editing in this pane).
            st.sel.clear();
            st.sel.add(key);
            st.anchor = key;
            mark();
            this._wvNoteOutlineGo(ne, iframe, Number(row.getAttribute("data-ord")), { flash: this._wvNnOutlineFlashOn() });
        }
        catch (er) {}
    }

    /** Keys in the note outline: the READER outline's NAVIGATION keys,
     *  through its own implementation (reader-panels.ts _wvListKeyNav with
     *  NOTE_OUTLINE_KEYS) -- Up/Down/Home/End move to a row and go to its
     *  heading, Right/Left open / close it or step in / up -- plus, as in the
     *  reader, +/- (open / close every row) and Ctrl/Cmd+F (the search box).
     *  Navigation only (MJT 2026-11-04, "I do not want to do outline edition
     *  directly in the outline pane"): the reader's multi-selection keys
     *  (Shift / Ctrl+arrows, Space, Ctrl+A) and its undo / redo, which exist
     *  for editing there, do nothing here; Enter puts the caret at the
     *  heading in the note (the reader renames), Delete does nothing.
     *  Escape goes back to the note. */
    _wvNoteOutlineKey(e: any, ne: any, iframe: any) {
        try {
            if (wvIsTextEntry(e.target)) return;   // the search box has its own keys
            const panel = ne.querySelector(".wv-note-outline");
            const list = panel && panel.querySelector(".wv-note-outline-list");
            if (!list) return;
            const st = this._wvNnState(ne);
            st.ne = ne;
            st.iframe = iframe;
            const k = e.key;
            const wj = this._wvNnPage(iframe);
            if (wvAccel(e) && !e.altKey) {
                const lk = String(k).toLowerCase();
                if (lk === "f" && !e.shiftKey) {
                    e.preventDefault(); e.stopPropagation();
                    this._wvNoteOutlineSearchShow(panel, true);
                    return;
                }
            }
            if (!e.altKey && !wvAccelAny(e)) {
                if (k === "+" || (k === "-" && !e.shiftKey)) {
                    e.preventDefault(); e.stopPropagation();
                    st.shut.clear();
                    if (k === "-") {
                        for (const r of list.querySelectorAll(".wv-note-outline-row")) {
                            if (r.querySelector(".wv-note-outline-twisty.wv-nn-kids")) st.shut.add(r.getAttribute("data-key"));
                        }
                    }
                    this._wvNoteOutlineRender(ne, iframe);
                    return;
                }
                if (k === "Escape") {
                    e.preventDefault(); e.stopPropagation();
                    if (wj && typeof wj.__wvEditorFocus === "function") wj.__wvEditorFocus();
                    return;
                }
            }
            // The selection keys are the reader's editing tools: left out.
            if (e.shiftKey || wvAccelAny(e) || e.altKey || k === " ") return;
            const rows: any[] = [...list.querySelectorAll(".wv-note-outline-row")].filter((r: any) => !r.hidden);
            if (!rows.length) return;
            this._wvListKeyNav(NOTE_OUTLINE_KEYS, st, ne.ownerDocument, list, rows, e);
        }
        catch (er) { Zotero.debug("[Weavero] outline key err: " + er); }
    }

    /** Open the search row under the bar (focused), or close it. */
    _wvNoteOutlineSearchShow(panel: any, on: boolean) {
        const sin = panel.querySelector(".wv-note-outline-search-input");
        if (!sin) return;
        if (!on) { panel.removeAttribute("data-wv-searching"); return; }
        panel.setAttribute("data-wv-searching", "true");
        sin.focus();
        try { sin.select(); } catch (e) {}
    }

    /** Empty the search, close its row, back to the list. */
    _wvNoteOutlineSearchClose(ne: any, iframe: any) {
        const panel = ne.querySelector(".wv-note-outline");
        const sin = panel && panel.querySelector(".wv-note-outline-search-input");
        const list = panel && panel.querySelector(".wv-note-outline-list");
        if (!sin || !list) return;
        if (sin.value) {
            sin.value = "";
            this._wvNnState(ne).query = "";
            this._wvNoteOutlineRender(ne, iframe);
        }
        list.focus();
        this._wvNoteOutlineSearchShow(panel, false);
    }

    /** The search box: Down / Enter go into the list (the first row shown),
     *  Escape empties the search and closes it, back to the list. */
    _wvNoteOutlineSearchKey(e: any, ne: any, iframe: any) {
        try {
            const panel = ne.querySelector(".wv-note-outline");
            const list = panel && panel.querySelector(".wv-note-outline-list");
            if (!list) return;
            if (e.key === "ArrowDown" || e.key === "Enter") {
                e.preventDefault();
                list.focus();
                const t = list.ownerDocument.defaultView;
                list.dispatchEvent(new t.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this._wvNoteOutlineSearchClose(ne, iframe);
            }
        }
        catch (er) {}
    }

    /** The outline's Enter: the caret at the heading in the note. */
    _wvNnCaretTo(ne: any, iframe: any, row: any) {
        const wj = this._wvNnPage(iframe);
        if (!wj || typeof wj.__wvHeadingFocus !== "function") return;
        const ord = Number(row.getAttribute("data-ord"));
        this._wvNoteOutlineGo(ne, iframe, ord, { flash: this._wvNnOutlineFlashOn() });
        wj.__wvHeadingFocus(ord);
    }

    _wvNoteOutlineContext(e: any, ne: any, iframe: any) {
        try {
            const row = e.target && e.target.closest ? e.target.closest(".wv-note-outline-row") : null;
            if (!row) return;
            e.preventDefault();
            const ord = Number(row.getAttribute("data-ord"));
            const heads = this._wvNnHeadings(iframe);
            const h = heads[ord];
            if (!h) return;
            const doc = ne.ownerDocument;
            const old = doc.getElementById("wv-note-outline-menu");
            if (old) old.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = "wv-note-outline-menu";
            if (this._wvNoteHeadingLinksOn()) menu.appendChild(this._wvNnLinkMenuItem(doc, ne, heads, h));
            if (h.foldable && this._wvNoteFoldOn()) {
                if (menu.firstChild) wvMenuSeparator(doc, menu);
                wvMenuItem(doc, {
                    label: h.folded ? "Unfold Section" : "Fold Section",
                    onCommand: () => {
                        const wj = this._wvNnPage(iframe);
                        if (wj && typeof wj.__wvFoldToggle === "function") wj.__wvFoldToggle(ord);
                    },
                }, menu);
            }
            if (!menu.firstChild) return;
            wvPopupHost(doc).appendChild(menu);
            menu.addEventListener("popuphidden", (ev: any) => { if (ev.target === menu) menu.remove(); });
            menu.openPopupAtScreen(e.screenX, e.screenY, true);
        }
        catch (er) { Zotero.debug("[Weavero] outline menu err: " + er); }
    }

    _wvNoteOutlineResize(e: any, ne: any, panel: any, grip: any) {
        try {
            if (e.button !== 0) return;
            e.preventDefault();
            const x0 = e.screenX;
            const w0 = panel.getBoundingClientRect().width;
            const rtl = winOf(panel).getComputedStyle(panel).direction === "rtl";
            grip.setPointerCapture(e.pointerId);
            let w = w0;
            const move = (ev: any) => {
                const dx = (ev.screenX - x0) * (rtl ? -1 : 1);
                w = Math.max(OUTLINE_W_MIN, Math.min(OUTLINE_W_MAX, Math.round(w0 + dx)));
                panel.style.setProperty("--wv-nn-width", w + "px");
                const p = wvLivePlugin();
                if (p) p._wvNnPageInset(p._wvNnIframe(ne), w);
            };
            const up = () => {
                grip.removeEventListener("pointermove", move);
                grip.removeEventListener("pointerup", up);
                grip.removeEventListener("lostpointercapture", up);
                const p = wvLivePlugin();
                if (!p || !p._wvNv) return;
                p._wvNv.outline.width = w;
                p._wvNvSave();
                for (const other of p._wvNnAllEditors()) {
                    const pn = other.querySelector(".wv-note-outline");
                    if (pn) p._wvNoteOutlineApplyUi(other, pn);
                }
            };
            grip.addEventListener("pointermove", move);
            grip.addEventListener("pointerup", up);
            grip.addEventListener("lostpointercapture", up);
        }
        catch (er) {}
    }

    /** Scroll the editor so the heading sits on the reading line, a quarter
     *  of the way down (where the reader outline lands too); opens the folds
     *  hiding it first. True when it landed. */
    _wvNoteOutlineGo(ne: any, iframe: any, ord: number, opts?: any): boolean {
        try {
            const wj = this._wvNnPage(iframe);
            if (wj && typeof wj.__wvFoldReveal === "function") wj.__wvFoldReveal(ord);
            const idoc = iframe.contentDocument;
            const el = this._wvNnHeadingEls(idoc)[ord];
            const sc = this._wvNnScroller(idoc);
            if (!el || !sc || !el.getClientRects().length) return false;
            const r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
            sc.scrollTop += (r.top - sr.top) - sc.clientHeight * 0.25;
            const st = this._wvNnState(ne);
            st.spyHoldUntil = Date.now() + 1500;
            this._wvNnMark(ne, ord);
            if (opts && opts.flash && wj && typeof wj.__wvHeadingFlash === "function") {
                // The reader outline's text flash (2 s, then a .3 s fade --
                // the CSS animation); one at a time, the newest wins.
                wj.__wvHeadingFlash(ord);
                const seq = st.flashSeq = (st.flashSeq || 0) + 1;
                wvTimeout(() => {
                    const p = wvLivePlugin();
                    if (!p || st.flashSeq !== seq) return;
                    const w = p._wvNnPage(iframe);
                    if (w && typeof w.__wvHeadingFlash === "function") w.__wvHeadingFlash(-1);
                }, 2400);
            }
            return true;
        }
        catch (e) { return false; }
    }

    /** Current section: the last heading the reading line has passed. */
    _wvNnSpy(ne: any, iframe: any) {
        try {
            const st = this._wvNnState(ne);
            if (Date.now() < st.spyHoldUntil) return;
            const panel = ne.querySelector(".wv-note-outline");
            if (!panel || panel.hasAttribute("data-wv-closed")) return;
            const idoc = iframe.contentDocument;
            const sc = this._wvNnScroller(idoc);
            if (!sc) return;
            const line = sc.getBoundingClientRect().top + sc.clientHeight * 0.25 + 1;
            let best = -1;
            this._wvNnHeadingEls(idoc).forEach((el: any, i: number) => {
                const rs = el.getClientRects();
                if (rs.length && rs[0].top <= line) best = i;
            });
            this._wvNnMark(ne, best);
        }
        catch (e) {}
    }

    _wvNnMark(ne: any, ord: number) {
        const st = this._wvNnState(ne);
        if (st.current === ord) return;
        st.current = ord;
        const panel = ne.querySelector(".wv-note-outline");
        if (!panel) return;
        let cur: any = null;
        for (const row of panel.querySelectorAll(".wv-note-outline-row")) {
            const on = Number(row.getAttribute("data-ord")) === ord;
            row.classList.toggle("wv-note-outline-current", on);
            if (on) cur = row;
        }
        // Keep it in view, as the reader outline does -- but never pull
        // the list while the pointer or focus is working in it.
        try {
            const ae = ne.ownerDocument.activeElement;
            if (cur && !cur.hidden && !(ae && panel.contains(ae)) && !panel.matches(":hover")) {
                cur.scrollIntoView({ block: "nearest" });
            }
        }
        catch (e) {}
    }

    // ---- heading links

    /** Give the heading an id when it needs one, copy its link; the link
     *  or null. */
    _wvNoteCopyHeadingLink(ne: any, ord: number): string | null {
        try {
            const iframe = this._wvNnIframe(ne);
            const wj = this._wvNnPage(iframe);
            if (!wj || typeof wj.__wvHeadingEnsureId !== "function") return null;
            // The page's current editor instance must be the chrome side's:
            // two notes selected in quick succession leave the page on an
            // ORPHANED instance for a while (the item pane on 11.0-beta.3,
            // 2026-11-04 -- the page showed the other note, nothing saved
            // the edit). An id written there would never reach the note.
            try {
                const pageInst = wj._currentEditorInstance && wj._currentEditorInstance.instanceID;
                const chromeInst = ne._editorInstance && ne._editorInstance.instanceID;
                if (pageInst && chromeInst && pageInst !== chromeInst) {
                    Zotero.debug("[Weavero] heading link: editor instances disagree (" + pageInst + " / " + chromeInst + "), not writing");
                    return null;
                }
            }
            catch (e) {}
            let res: any = {};
            try { res = JSON.parse(String(wj.__wvHeadingEnsureId(ord))); } catch (e) {}
            if (!res || !res.id) {
                if (res && res.error === "read-only") {
                    this._showLinkWarning("This note is read-only, so its heading cannot get a link anchor.");
                }
                return null;
            }
            const link = this._wvNoteHeadingLink(ne.item, res.id);
            if (!link) return null;
            Zotero.Utilities.Internal.copyTextToClipboard(link);
            return link;
        }
        catch (e) { Zotero.debug("[Weavero] copy heading link err: " + e); return null; }
    }

    _wvNoteHeadingLink(item: any, id: string): string | null {
        const base = this._buildSelectLink(item);
        return base ? base + "?wvheading=" + encodeURIComponent(id) : null;
    }

    /** After a heading link selected its note: wait for that note's editor
     *  in the window, open the folds over the heading, bring it to the
     *  reading line and flash it. */
    async _wvNoteRevealHeading(win: any, itemID: number, headingId: string): Promise<boolean> {
        const t0 = Date.now();
        let sawEditor = false;
        while (Date.now() - t0 < 8000) {
            if (this._wvDestroyed) return false;
            for (const ne of win.document.querySelectorAll("note-editor")) {
                try {
                    if (!ne.item || ne.item.id !== itemID || !ne.getClientRects().length) continue;
                    const iframe = this._wvNnIframe(ne);
                    const heads = this._wvNnHeadings(iframe);
                    if (!heads.length) continue;
                    sawEditor = true;
                    const h = heads.find((x: any) => x.id === headingId);
                    if (h && this._wvNoteOutlineGo(ne, iframe, h.ord, { flash: true })) return true;
                }
                catch (e) {}
            }
            await new Promise((r) => win.setTimeout(r, 200));
        }
        if (sawEditor) this._showLinkWarning("The heading this link points to is no longer in the note.");
        return false;
    }

    // ---- teardown (from _stripNotes)

    _wvNoteNavStrip(ne: any) {
        try {
            const panel = ne.querySelector(".wv-note-outline");
            if (panel) panel.remove();
            const iframe = this._wvNnIframe(ne);
            const idoc = iframe && iframe.contentDocument;
            if (idoc) {
                try { const b = idoc.querySelector(".wv-nn-outline-toggle"); if (b) b.remove(); } catch (e) {}
                for (const k of NN_KEYS) wvUnlisten(idoc, k);
                try { if (idoc.body) idoc.body.classList.remove("wv-fold-on", "wv-nn-outline-on"); } catch (e) {}
                this._wvNnPageInset(iframe, 0);
            }
            const menu = ne.querySelector("#editor-menu");
            if (menu) { wvUnlisten(menu, "noteNav:menu"); wvUnlisten(menu, "noteNav:menuHide"); }
            // Folds off in the page (the arrows go; hidden blocks are back
            // already, with the stylesheet that hid them).
            const wj = this._wvNnPage(iframe);
            if (wj) {
                wj.__wvFoldEnabled = false;
                if (typeof wj.__wvRedecorateNotes === "function") wj.__wvRedecorateNotes();
            }
            nnState.delete(ne);
        }
        catch (e) {}
    }

    _wvNoteNavStripDoc(doc: any) {
        try { const m = doc.getElementById("wv-note-outline-menu"); if (m) m.remove(); } catch (e) {}
        try { doc.documentElement.removeAttribute("data-wv-note-outline"); } catch (e) {}
    }
}

const _noteNavDescriptors = Object.getOwnPropertyDescriptors(_NoteNavMixin.prototype);
delete (_noteNavDescriptors as any).constructor;
export const noteNavMethods = _noteNavDescriptors;
