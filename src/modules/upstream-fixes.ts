// Module: stand-ins for Zotero bugs MJT reported on the forums, kept until Zotero fixes
// them (MJT 2026-11-18: "fix in Weavero the recent bugs that I have reported, in a way
// that is compatible with the native fix if already in the commits or PRs, or ready for
// compatibility when Zotero native fixes them. Keep track of the native Zotero bugs
// that are fixed in Weavero, so that the fixes can be retired when Zotero fixes them").
//
// Every fix here:
//   - is marked WV-TEMP-<forum thread> and listed in the private upstream-bugs register
//     (its entry says "PATCHED in Weavero by WV-TEMP-..." and keeps its "Retire when");
//   - checks Zotero's own code first and installs nothing once Zotero's fix is in (a
//     stale stand-in would fight the native fix);
//   - has a tripwire in its spec: torn down, the spec shows Zotero's bug, and fails the
//     day Zotero fixes it -- then retire the fix (upstream-check skill, step 3);
//   - is torn down by destroy() (test/zzz-disable-leftovers.spec.js).
// None of them was in Zotero's commits or pull requests on 2026-11-18 (zotero/zotero
// since 11-09; zotero/reader since 11-09).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvLibraryViews, wvMainWins, wvNativeWindows } from "../lib/windows";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvTimeout } from "../lib/timers";
import { wvSetBoolAttr, winOf } from "../lib/dom";

declare const Zotero: any;
declare const Services: any;
declare const ChromeUtils: any;
declare const Components: any;

const live = () => wvLivePlugin();

/** WV-TEMP-132551: the row provider's members every expand / collapse gesture lands
 *  in (10.0.8 and 11.0-beta.4 itemTree.js; on Zotero 9 the items view's own). */
const WV_ROW_TOGGLES = ["toggleOpenState", "expandRows", "collapseRows", "expandAllRows", "collapseAllRows"];
/** WV-TEMP-132551: the redraw armed per items view (its window's timer), so a burst
 *  of toggles redraws once. A WeakMap: nothing on Zotero's objects. */
const wvRowCountTimers = new WeakMap<any, { win: any; t: any }>();
/** WV-TEMP-114534: Zotero's no-item sections a feed item never has -- each hides itself
 *  for a feed item (11.0-beta.5 and 10.0.8: attachmentsBox.js 70, notesBox.js 64,
 *  librariesCollectionsBox.js 54, tagsBox.js 88, relatedBox.js 59). */
const WV_SNF_LIBRARY_ONLY = ["attachments", "notes", "libraries-collections", "tags", "related"];
/** WV-TEMP-114534: the side navigations whose buttons the fix hid, so a library view
 *  shown next in the same no-item state gets Zotero's list back. Off the elements
 *  (window-wiring.spec.js records expandos). */
const wvSnfHid = new WeakSet<any>();
/** WV-TEMP-FEEDHEAD: the item pane's feed-button label calls and the button each
 *  labels (itemPane.js setTranslateButton 581-585, setReadLabel 511-514). */
const WV_FEED_HEAD_LABELS: Array<[string, string]> = [
    ["setTranslateButton", ".feed-item-addTo-button"],
    ["setReadLabel", ".feed-item-toggleRead-button"],
];

// ---- WV-TEMP-134893b: the feed-abstract browser's first load, settled when the browser leaves the page ----
//
// Weavero's copy of Zotero's AbstractBox#_ensureFeedAbstractBrowserExists
// (chrome/content/zotero/elements/abstractBox.js, 11.0-beta.5 and main 2026-11-23:
// 259-292, https://github.com/zotero/zotero/blob/main/chrome/content/zotero/elements/abstractBox.js),
// Copyright (c) 2020 Corporation for Digital Scholarship, part of Zotero, free software
// under the GNU Affero General Public License v3 or later (as Weavero). The lines that
// make the browser are Zotero's, unchanged; what is Weavero's: the wait also ends when the
// browser leaves the page before its first load stopped, and a section moved meanwhile
// gets a new browser.

/** The sandbox flags Zotero sets on its feed-abstract browser (abstractBox.js
 *  `SANDBOX_ALL_FLAGS`, a constant outside the class -- the gate checks that the class
 *  still applies that constant). */
const WV_FAB_SANDBOX_ALL_FLAGS = 0xFFFFF;
/** The wvWrap layer: on the window's abstract-box `_renderFeedItem` (hands each section
 *  the copy) and on each section's own `_ensureFeedAbstractBrowserExists`. */
const WV_FAB_LAYER = "feedAbstractLoad";
/** The load in progress per section (one at a time: the serial): a web progress holds its
 *  listener weakly, so the copy keeps it here, and the teardown ends it. Keyed by the
 *  section, so a window closed mid-load takes its entry with it. */
const wvFabPending: WeakMap<any, { stop: () => void }> = new WeakMap();
/** The gate's verdict per abstract-box class (one per window). */
const wvFabShapes: WeakMap<any, string | null> = new WeakMap();

/** The `remote` value the window's abstract-box class gives its feed-abstract browser
 *  when its `_ensureFeedAbstractBrowserExists` is the code Weavero copies -- a serial()
 *  that makes the browser with these four attributes and then waits for nothing but a
 *  STATE_STOP of its load -- else null (Zotero changed it: its own code runs). */
function wvFabShape(cls: any): string | null {
    try {
        if (!cls) return null;
        if (wvFabShapes.has(cls)) return wvFabShapes.get(cls) as string | null;
        let out: string | null = null;
        const src = Function.prototype.toString.call(cls);
        const at = src.search(/_ensureFeedAbstractBrowserExists\s*=\s*Zotero\.Utilities\.Internal\.serial\(/);
        if (at >= 0) {
            const end = src.indexOf("_discardFeedAbstractBrowser", at);
            const body = src.slice(at, end > at ? end : at + 4000);
            const need = [
                /if\s*\(\s*!this\._feedAbstractBrowser\s*\)/,
                /createXULElement\(\s*["']browser["']\s*\)/,
                /setAttribute\(\s*["']type["']\s*,\s*["']content["']\s*\)/,
                /setAttribute\(\s*["']maychangeremoteness["']\s*,\s*["']true["']\s*\)/,
                /setAttribute\(\s*["']messagemanagergroup["']\s*,\s*["']feedAbstract["']\s*\)/,
                /querySelector\(\s*["']\.body["']\s*\)\s*\.appendChild\(\s*this\._feedAbstractBrowser\s*\)/,
                /browsingContext\.sandboxFlags\s*\|=\s*SANDBOX_ALL_FLAGS/,
                /stateFlags\s*&\s*Ci\.nsIWebProgressListener\.STATE_STOP/,
                /addProgressListener\(/,
            ];
            const attrs = (body.match(/setAttribute\(/g) || []).length;
            // Anything else that could end the wait is Zotero's own fix.
            const settles = /isConnected|MutationObserver|[Dd]iscard|reject|setTimeout|Promise\.race|STATE_IS_|onLocationChange|addEventListener|browsingContext\s*\)/.test(body.replace(/_discardFeedAbstractBrowser/g, ""));
            // Only an out-of-process browser: Zotero 10.0.8 makes it in process (remote="false",
            // "fx128: about:blank no longer displays content when loaded remotely"), and taking
            // that one out of the page mid-load DOES end its load -- its call resolves, nothing
            // waits (measured 2026-11-24 on Zotero 10.0.8 with no add-on).
            const remote = /setAttribute\(\s*["']remote["']\s*,\s*["'](true|false)["']\s*\)/.exec(body);
            if (remote && remote[1] === "true" && attrs === 4 && !settles && need.every((re) => re.test(body))) out = remote[1];
        }
        wvFabShapes.set(cls, out);
        return out;
    }
    catch (e) { return null; }
}

/** Weavero's serial() for one section: one call at a time, each waiting for the one
 *  before it to RELEASE -- which a call does once its browser has loaded, or once its
 *  browser left the page (Zotero's ConcurrentCaller waits for its call to resolve). The
 *  first call runs at once, as Zotero's does. */
function wvFabSerial(box: any, remote: string): () => Promise<void> {
    let busy = false;
    const queue: Array<() => void> = [];
    const next = () => {
        const run = queue.shift();
        if (run) run();
        else busy = false;
    };
    return function () {
        return new Promise<void>((resolve, reject) => {
            const run = () => {
                busy = true;
                let released = false;
                const release = () => {
                    if (released) return;
                    released = true;
                    Promise.resolve().then(next);
                };
                try { wvFabEnsure(box, remote, resolve, release); }
                catch (e) {
                    // As Zotero's serial() (ConcurrentCaller, onError: Zotero.logError).
                    try { Zotero.logError(e); } catch (e2) {}
                    reject(e);
                    release();
                }
            };
            if (busy) queue.push(run);
            else run();
        });
    };
}

/** One call: `settle` lets Zotero's _renderFeedItem draw (a browser is there and has
 *  loaded), `release` lets the next call run. */
function wvFabEnsure(box: any, remote: string, settle: () => void, release: () => void): void {
    let b: any = box._feedAbstractBrowser;
    // As Zotero: a browser there, loaded, is taken as it is. One left behind by a move AFTER
    // its load is WV-TEMP-134893's case, dropped by that stand-in before the render --
    // kept apart, so each tripwire sees Zotero's own code for its own case.
    if (b) {
        settle();
        release();
        return;
    }
    // Zotero's lines (abstractBox.js 11.0-beta.5:261-269), `this` = the section:
    // dynamically create a browser element to avoid spawning a process for every tab (#4530)
    b = box._feedAbstractBrowser = box.ownerDocument.createXULElement("browser");
    b.setAttribute("type", "content");
    b.setAttribute("remote", remote);
    b.setAttribute("maychangeremoteness", "true");
    b.setAttribute("messagemanagergroup", "feedAbstract");
    box.querySelector(".body").appendChild(b);
    b.browsingContext.sandboxFlags |= WV_FAB_SANDBOX_ALL_FLAGS;
    const webProgress = b.browsingContext.webProgress;
    // Zotero waits for a STATE_STOP alone (271-289). A browser taken out of the page
    // before its load stopped never sends one; here its leaving ends the wait too.
    const Ci = Components.interfaces;
    let done = false;
    let mo: any = null;
    const rec = { stop: () => finish(null) };
    const progressListener: any = {
        onStateChange(_progressData: any, _requestData: any, stateFlags: number) {
            // A stop that comes for a browser already out of the page is its leaving.
            if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) finish(!!(b.isConnected && b.browsingContext));
        },
        QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
    };
    function finish(loaded: boolean | null) {
        if (done) return;
        done = true;
        if (wvFabPending.get(box) === rec) wvFabPending.delete(box);
        try { webProgress.removeProgressListener(progressListener); } catch (e) {}
        try { if (mo) mo.disconnect(); } catch (e) {}
        if (loaded) {
            settle();
            release();
            return;
        }
        if (loaded === null) {
            // Weavero goes away mid-load: the half-loaded browser goes with it, and the next
            // render (Zotero's own code, or the next Weavero) makes a new one.
            try {
                if (box._feedAbstractBrowser === b) box._feedAbstractBrowser = null;
                b.remove();
            } catch (e) {}
            release();
            return;
        }
        // The browser left the page before its first load stopped. Zotero did not drop it
        // (the section moved -- a plugin's section registered or removed, a drag in the side
        // navigation): the section, back in the page, gets a new browser for the call. A
        // browser Zotero dropped itself (_discardFeedAbstractBrowser: a library item shown)
        // or a section gone from the page leaves the call where it is -- going on would draw
        // a feed abstract over what the section shows now -- and the next call runs.
        if (box._feedAbstractBrowser === b) {
            box._feedAbstractBrowser = null;
            try {
                const item = box.item;
                if (box.isConnected && item && item.isFeedItem && box.querySelector(".body")) {
                    wvFabEnsure(box, remote, settle, release);
                    return;
                }
            }
            catch (e) { Zotero.debug("[Weavero] WV-TEMP-134893b: no new feed-abstract browser: " + e); }
        }
        release();
    }
    wvFabPending.set(box, rec);
    try {
        const win = winOf(box);
        mo = new win.MutationObserver(() => {
            try { if (!b.isConnected || !b.browsingContext) finish(false); } catch (e) {}
        });
        mo.observe(box, { childList: true, subtree: true });
    }
    catch (e) { Zotero.debug("[Weavero] WV-TEMP-134893b: observer err: " + e); }
    webProgress.addProgressListener(progressListener, Ci.nsIWebProgress.NOTIFY_STATE_ALL);
}

class _UpstreamFixesMixin {
    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134825 (forums.zotero.org/discussion/134825, upstream register #50).
    // Zotero 11, several windows, one showing a PDF: after a restart the PDF window is
    // in front with the focus, not the window you were in. Zotero restores the window
    // you were in LAST (it moves to the end of the window list); a reader loading in
    // another window then takes the focus. Reproduced with no add-on, 5 of 5 (2026-11-17);
    // without a PDF window the focus held 2 of 3. Weavero's own restore shepherd for its
    // windows on older Zotero (tabs.ts _wvFocusShepherdStart) is off on Zotero's own
    // windows. Here, at application start only: once the windows and their readers have
    // settled, if the focus is not on the window Zotero restored last and the user has
    // not pressed a key or a button in any Zotero window meanwhile, that window gets the
    // focus back. Once. Behaviour gate: nothing to do when Zotero keeps it.
    //
    // RETIRE WHEN a plain beta keeps the window you were in after a restart with a PDF
    // window open (z6035-focus-probe.py --no-addon, register #50). No spec can restart
    // the runner; manual protocol: work/zotero-upstream-bugs.md #50 steps (needs an idle
    // machine: Windows' foreground lock). Zotero's fix is in 11.0-beta.5 (zotero
    // d52817fef7: ReaderInstance.focus / EditorInstance.focus go through
    // Utilities.Internal.focusIframeWindow, which focuses a frame of a window behind
    // another main window only within it) -- not yet seen to hold across a restart.
    // Zotero 10 never runs this (wvNativeWindows): once the probe keeps the window on
    // beta.5, remove it whole.
    // ─────────────────────────────────────────────────────────────────────────
    _wvStartRestoreFocusFix() {
        try {
            const P: any = this;
            if (!wvNativeWindows() || P._wvRestoreFocusWatch) return;
            const st: any = { input: false, done: false, t0: Date.now() };
            P._wvRestoreFocusWatch = st;
            const onInput = (e: any) => { if (e && e.isTrusted !== false) st.input = true; };
            const heard = new Set<any>();
            const listen = () => {
                for (const w of wvMainWins() as any[]) {
                    if (heard.has(w)) continue;
                    heard.add(w);
                    try { w.addEventListener("mousedown", onInput, true); w.addEventListener("keydown", onInput, true); } catch (e) {}
                }
            };
            const finish = () => {
                st.done = true;
                for (const w of heard) { try { w.removeEventListener("mousedown", onInput, true); w.removeEventListener("keydown", onInput, true); } catch (e) {} }
                heard.clear();
            };
            st.finish = finish;
            let count = -1;
            let stableSince = Date.now();
            const busy = (w: any) => {
                try {
                    const Z = w.Zotero_Tabs;
                    if (!Z || !Array.isArray(Z._tabs) || !w.ZoteroPane) return true;
                    if (Z._tabs.some((t: any) => t && /-loading$/.test(String(t.type)))) return true;
                    const sel = Z._tabs.find((t: any) => t && t.id === Z.selectedID);
                    if (sel && String(sel.type) === "reader") {
                        const r: any = (Zotero as any).Reader.getByTabID(sel.id);
                        if (!r || !r._internalReader) return true;
                    }
                    return false;
                } catch (e) { return true; }
            };
            const tick = () => {
                try {
                    if (st.done) return;
                    if (P._wvDestroyed || st.input || Date.now() - st.t0 > 45000) { finish(); return; }
                    listen();
                    const wins: any[] = wvMainWins();
                    if (wins.length !== count) { count = wins.length; stableSince = Date.now(); }
                    if (Date.now() - stableSince < 3000 || wins.some(busy)) { wvTimeout(tick, 500); return; }
                    const target = wins[wins.length - 1];
                    const active = (Services as any).focus.activeWindow;
                    if (wins.length > 1 && target && !target.closed && active && active !== target && wins.includes(active)) {
                        Zotero.debug("[Weavero] WV-TEMP-134825: after the restart the focus was on another window; the window restored last gets it back");
                        try { target.focus(); } catch (e) {}
                    }
                    finish();
                } catch (e) { finish(); }
            };
            wvTimeout(tick, 1500);
        } catch (e) { Zotero.debug("[Weavero] _wvStartRestoreFocusFix err: " + e); }
    }

    _wvTeardownRestoreFocusFix() {
        try { const st = (this as any)._wvRestoreFocusWatch; if (st && !st.done && st.finish) st.finish(); } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-133075 (forums.zotero.org/discussion/133075, MJT's thread; also 133002,
    // 129464, 133790 by others; acknowledged by the developers).
    // The item pane jumps when, after a change to an Info field, the focus moves to a
    // field near the pane's bottom edge (Tab or a click): the pane scrolls ~550 px and
    // the field ends above the view. 11.0-beta.4 and 10.0.8 alike, no add-on (check pass
    // 2026-11-19, work/forum-audit-2026-11-19.md #5). Cause (elements/itemBox.js): the
    // save re-renders the Info box, and render() lays its table out as a BLOCK while
    // _renderInternal() rebuilds it; _renderInternal() ends with _restoreFieldFocus(),
    // whose focus() scrolls the field into view in that temporary layout -- back in the
    // grid layout the field is far above. Here: the pane's scroll position is kept
    // across a render that moved it while a field of that box holds the focus, then
    // the field is brought into view only if needed (block "nearest").
    //
    // RETIRE WHEN render() no longer lays the table out as a block around
    // _renderInternal(), or _renderInternal() no longer restores the focus (the gate
    // reads both and installs nothing then). Tripwire in test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWirePaneJumpFix(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE) return;
            const cls: any = CE.get("info-box");
            if (!cls) {
                // Zotero defines its elements lazily: wire once it is.
                try {
                    CE.whenDefined("info-box").then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvWirePaneJumpFix(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = cls.prototype;
            if (!proto || typeof proto.render !== "function" || typeof proto._renderInternal !== "function") return;
            const wraps = Object.prototype.hasOwnProperty.call(proto, "_wvWraps") && proto._wvWraps && proto._wvWraps.render;
            const native = wraps ? wraps.native : proto.render;
            if (!/display\s*=\s*['"]block['"][\s\S]{0,200}_renderInternal\(\)/.test(String(native))) return;   // Zotero's layout trick is gone
            if (!/_restoreFieldFocus\(\)/.test(String(proto._renderInternal))) return;   // the focus is restored elsewhere now
            wvWrap(proto, "render", "paneJump", (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                let sc: any = null;
                let top = 0;
                try {
                    // Only a focus restore moves the pane, and Zotero restores one only
                    // when a field of this table had the focus (_saveFieldFocus) or one
                    // is queued (_selectField). Otherwise no scrollTop read: each lays
                    // the pane out in the middle of its build, and every reader open
                    // renders the Info box (2026-11-21 profile: ~17 ms of style and
                    // layout before page 1).
                    const doc = this.ownerDocument;
                    const ae = doc && doc.activeElement;
                    const host = this._infoTable || this;
                    if (this._selectField || (ae && host.contains && host.contains(ae))) {
                        const det = this.closest && this.closest("item-details");
                        sc = det && (det._paneParent || det.querySelector(".zotero-view-item"));
                        if (sc) top = sc.scrollTop;
                    }
                } catch (e) { sc = null; }
                const r = orig.apply(this, args);
                const settle = () => {
                    try {
                        if (!sc || sc.scrollTop === top) return;
                        const ae = this.ownerDocument && this.ownerDocument.activeElement;
                        const ed = ae && ae.closest && ae.closest("editable-text");
                        if (!ed || !this.contains(ed)) return;   // only the focus restore moves it
                        sc.scrollTop = top;
                        ed.scrollIntoView({ block: "nearest" });
                    } catch (e) {}
                };
                if (r && typeof r.then === "function") r.then(settle, () => {});
                else settle();
                return r;
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWirePaneJumpFix err: " + e); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-124063 (forums.zotero.org/discussion/124063, MJT's thread; zotero#5262;
    // also forum 131094). An annotation the reader shows READ-ONLY -- one stored in the
    // PDF file (external), or any annotation of an attachment the user may not edit
    // (a group without file editing) -- is erased from the items list with the Delete
    // key: ZoteroPane.canDeleteSelectedItems has no such check, and the external one
    // even comes back as a new item at the next import of the file. 11.0-beta.4 and
    // 10.0.8 alike, no add-on (check pass 2026-11-19, work/forum-audit-2026-11-19.md #1,
    // #2). Here: outside the trash, a selection holding such an annotation cannot be
    // deleted -- the reader's own rule (xpcom/annotations.js toJSON readOnly = external;
    // xpcom/reader.js _isReadOnly = the attachment not editable). The trash keeps
    // Zotero's rules. Not added: Zotero's "not the author" read-only rule for group
    // annotations (out of the reported cases).
    //
    // RETIRE WHEN canDeleteSelectedItems checks annotationIsExternal or the
    // attachment's isEditable() (the gate reads its source and installs nothing then).
    // Tripwire in test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireExtAnnDeleteFix(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            if (!ZP || typeof ZP.canDeleteSelectedItems !== "function") return;
            const wraps = ZP._wvWraps && ZP._wvWraps.canDeleteSelectedItems;
            const native = wraps ? wraps.native : ZP.canDeleteSelectedItems;
            if (/annotationIsExternal|isEditable\s*\(/.test(String(native))) return;   // Zotero's own check is in
            wvWrap(ZP, "canDeleteSelectedItems", "extAnnDelete", (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                if (!r) return r;
                try {
                    const rows = typeof this.getCollectionTreeRows === "function" ? this.getCollectionTreeRows() : null;
                    if (rows && rows[0] && typeof rows[0].isTrash === "function" && rows[0].isTrash()) return r;
                    const sel: any[] = this.itemsView && typeof this.itemsView.getSelectedItems === "function" ? this.itemsView.getSelectedItems() : [];
                    for (const it of sel) {
                        if (!it || typeof it.isAnnotation !== "function" || !it.isAnnotation()) continue;
                        if (it.annotationIsExternal) return false;
                        const att = it.parentItem;
                        if (att && typeof att.isEditable === "function" && !att.isEditable()) return false;
                    }
                } catch (e) {}
                return r;
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireExtAnnDeleteFix err: " + e); }
    }

    _wvTeardownExtAnnDeleteFix() {
        for (const w of wvMainWins() as any[]) {
            try { if (w && w.ZoteroPane) wvUnwrap(w.ZoteroPane, "canDeleteSelectedItems", "extAnnDelete"); } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-99239 (forums.zotero.org/discussion/99239, MJT's thread, 2022; zotero#2780
    // "Update `totalPages` in `fulltextItems` if PDF page is deleted", open). After
    // Delete Page in the reader, the PDF's Pages row in the item pane keeps the old
    // count for good, and a search still finds the words of the deleted pages: the
    // delete (xpcom/pdfWorker/manager.js deletePages, run by xpcom/reader.js
    // onDeletePages) rewrites the file and moves the annotations, but leaves the
    // attachment's full-text record -- the stored page count and the indexed words --
    // as it was, and saves the attachment with skipAll (no notifier: nothing redraws).
    // 11.0-beta.4 and 10.0.8 alike, Weavero disabled (2026-11-20: a 3-page PDF, page 2
    // deleted: 2 pages in the file, 3 stored, the deleted page's word still matched).
    // Here: once the delete is done, an attachment that had a full-text record is
    // indexed again -- Zotero's own Reindex Item, as fully as it was indexed before
    // (all pages if it held them all, else the pdfMaxPages default) -- and every item
    // pane showing it redraws its attachment box.
    //
    // RETIRE WHEN Zotero updates the record after a delete itself (the gate reads
    // deletePages and installs nothing once it touches the full-text index; a fix in
    // reader.js instead trips the spec). Tripwire in test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWirePageCountFix() {
        try {
            const PW: any = (Zotero as any).PDFWorker;
            if (!PW || typeof PW.deletePages !== "function") return;
            const wraps = Object.prototype.hasOwnProperty.call(PW, "_wvWraps") && PW._wvWraps && PW._wvWraps.deletePages;
            const native = wraps ? wraps.native : PW.deletePages;
            if (/Full[Tt]ext|totalPages|indexItems/.test(String(native))) return;   // Zotero's own update is in
            wvWrap(PW, "deletePages", "pageCount", (this as any)._wvWireTag(), (orig: any) => function (this: any, itemID: any, ...rest: any[]) {
                const r = orig.call(this, itemID, ...rest);
                if (r && typeof r.then === "function") {
                    r.then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvPageCountRefresh(itemID); } catch (e) {}
                    }, () => {});
                }
                return r;
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWirePageCountFix err: " + e); }
    }

    /** Index attachment `itemID` again after a page delete and redraw the attachment
     *  boxes showing it (WV-TEMP-99239). The record is still the one from before the
     *  delete, which leaves it alone: its indexed / total pages say how fully it was
     *  indexed. No record (never indexed, indexing off): nothing shown, nothing done. */
    async _wvPageCountRefresh(itemID: number) {
        try {
            const FT: any = (Zotero as any).FullText || (Zotero as any).Fulltext;
            if (!FT || typeof FT.getPages !== "function" || typeof FT.indexItems !== "function") return;
            const was: any = await FT.getPages(itemID);
            if (!was || !was.total) return;
            const complete = !!was.indexedPages && was.indexedPages >= was.total;
            await FT.indexItems([itemID], { complete, ignoreErrors: true });
            const now: any = await FT.getPages(itemID);
            Zotero.debug("[Weavero] WV-TEMP-99239: item " + itemID + " indexed again after a page delete, pages "
                + was.total + " -> " + (now ? now.total : "?") + (complete ? " (all pages)" : ""));
            const lp = live();
            if (!lp || lp._wvDestroyed) return;
            for (const w of wvMainWins() as any[]) {
                try {
                    for (const box of Array.from(w.document.querySelectorAll("attachment-box")) as any[]) {
                        if (box && box.item && box.item.id === itemID && typeof box.updateInfo === "function") box.updateInfo();
                    }
                } catch (e) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvPageCountRefresh err: " + e); }
    }

    _wvTeardownPageCountFix() {
        try { wvUnwrap((Zotero as any).PDFWorker, "deletePages", "pageCount"); } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-132551 (forums.zotero.org/discussion/132551, MJT's thread; upstream
    // register #1). Expanding or collapsing rows in the items list -- a twisty click,
    // the arrow keys, `+` / `-`, Expand / Collapse All -- leaves "N items in this view"
    // at the old number, and Weavero's detailed count under it. The message reads
    // `objectRowCount` (the VISIBLE rows) when the item pane renders, and Zotero renders
    // it on a refresh (itemsView.onRefresh) and, on Zotero 11 only, on a NOTIFIER change
    // of the row count (`rowCountChange`, collectionViewItemTree notify(); zotero
    // fe35127f5) -- never on an expand. Every gesture lands in one of the row
    // provider's WV_ROW_TOGGLES (itemTree onToggleOpenState for the twisty and the arrow
    // keys, handleKeyDown for `+` / `-`, expandSelectedRows / collapseSelectedRows), and
    // none redraws. Stock 11.0-beta.4 in Troubleshooting Mode (MJT 2026-11-19) and
    // 10.0.8's source alike. Until 1.2.1 Weavero redrew it by accident only: the
    // items-list filter's tree observer re-applied on every row change and its clear
    // path re-rendered the pane -- not at all with the filter feature off.
    // Here: after one of those calls, once per burst, with nothing selected (the only
    // state that shows the count), Zotero's own redraw: on Zotero 11 the items view's
    // `rowCountChange` (its debounced, empty-selection-gated itemPane.render(),
    // libraryView.js initItemsTree); on 10.0.8 and older, which have no such event,
    // `ZoteroPane.itemSelected()` (what their onRefresh listener calls; with nothing
    // selected it renders the pane). With a filter applied, the filter's own layer
    // sends a twisty toggle straight to Zotero's native (filter.ts runQueued) and its
    // apply redraws the count itself.
    //
    // RETIRE WHEN the toggles redraw it themselves (the gate reads the row provider's
    // toggle code for rowCountChange / an item pane render and installs nothing then),
    // or an expand on a plain beta moves the count. Tripwire in
    // test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireRowCountFix(win: any) {
        try {
            const P: any = this;
            const ZP = win && win.ZoteroPane;
            if (!ZP) return;
            const views = wvLibraryViews(win);
            const ivs: any[] = views.length ? views.map((v: any) => v && v.itemsView) : [ZP.itemsView];
            const tag = P._wvWireTag();
            for (const iv of ivs) {
                const rp: any = iv && (iv.rowProvider || iv);
                if (!rp || typeof rp.toggleOpenState !== "function") continue;
                const T = Object.prototype.hasOwnProperty.call(rp, "_wvWraps") ? rp._wvWraps : null;
                const src = WV_ROW_TOGGLES.concat(["_toggleOpenState", "_batchRowChanges"])
                    .map((m) => String((T && T[m] ? T[m].native : rp[m]) || "")).join("\n");
                if (/rowCountChange|itemPane|itemSelected/.test(src)) continue;   // Zotero's own redraw is in
                for (const m of WV_ROW_TOGGLES) {
                    if (typeof rp[m] !== "function") continue;
                    wvWrap(rp, m, "countRedraw", tag, (orig: any) => function (this: any, ...args: any[]) {
                        const r = orig.apply(this, args);
                        try {
                            const arm = () => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvRowCountRedrawSoon(win, iv); };
                            if (r && typeof r.then === "function") r.then(arm, () => {});   // Zotero 9: async
                            else arm();
                        } catch (e) {}
                        return r;
                    });
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvWireRowCountFix err: " + e); }
    }

    /** Arm one redraw of items view `iv`'s count in `win` (WV-TEMP-132551): every call
     *  of a burst moves it on; it runs on the window's own clock, so it dies with it. */
    _wvRowCountRedrawSoon(win: any, iv: any) {
        try {
            if (!win || win.closed || !iv) return;
            const prev = wvRowCountTimers.get(iv);
            if (prev) { try { prev.win.clearTimeout(prev.t); } catch (e) {} }
            const t = win.setTimeout(() => {
                wvRowCountTimers.delete(iv);
                try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvRowCountRedraw(win, iv); } catch (e) {}
            }, 50);
            wvRowCountTimers.set(iv, { win, t });
        } catch (e) {}
    }

    /** Zotero's own redraw of items view `iv`'s "N items in this view" (WV-TEMP-132551). */
    _wvRowCountRedraw(win: any, iv: any) {
        try {
            const sel = iv && iv.selection;
            if (!sel || sel.count) return;   // an item or a selection is shown, not the count
            if (iv.onRowCountChange && typeof iv.runListeners === "function") {
                Promise.resolve(iv.runListeners("rowCountChange")).catch(() => {});
                return;
            }
            const ZP = win && win.ZoteroPane;
            if (ZP && ZP.itemsView === iv && typeof ZP.itemSelected === "function") {
                Promise.resolve(ZP.itemSelected()).catch(() => {});
            }
        } catch (e) { Zotero.debug("[Weavero] _wvRowCountRedraw err: " + e); }
    }

    _wvTeardownRowCountFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const ZP = w && w.ZoteroPane;
                if (!ZP) continue;
                const views = wvLibraryViews(w);
                const ivs: any[] = views.length ? views.map((v: any) => v && v.itemsView) : [ZP.itemsView];
                for (const iv of ivs) {
                    const rp: any = iv && (iv.rowProvider || iv);
                    if (!rp) continue;
                    for (const m of WV_ROW_TOGGLES) { try { wvUnwrap(rp, m, "countRedraw"); } catch (e) {} }
                    const pend = wvRowCountTimers.get(iv);
                    if (pend) { try { pend.win.clearTimeout(pend.t); } catch (e) {} wvRowCountTimers.delete(iv); }
                }
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134317 (forums.zotero.org/discussion/134317, MJT's thread; upstream
    // register #30). View > Layout > Tag Selector hides the Tag Selector by taking it
    // down (toggleTagSelector, "If hiding, clear selection": uninit() and tagSelector =
    // null) but clears nothing: the items list stays filtered by the selected tags, which
    // the collection row keeps (collectionTreeRow.setTags through itemsView.setFilter
    // ('tags')). Shown again, Zotero builds a NEW selector with nothing selected over the
    // filtered list -- no tag highlighted, nothing to click to turn the filter off short
    // of another collection. 11.0-beta.4 (elements/libraryView.js, ZoteroPane forwards to
    // it) and 10.0.8 (zoteroPane.js) alike, stock 11.0-beta.4 with no add-on (register
    // #30, 2026-11-10). Weavero's own Tag Selector handle already put the tags back on
    // ITS re-show (pane.ts _wvTagSelectorHandleToggle); here the same after Zotero's:
    // once ZoteroPane.toggleTagSelector (what the View menu runs) has shown the selector,
    // the tags the list is filtered by are selected in it again (pane.ts
    // _wvTagSelectorReselect, shared with the handle). The hide stays Zotero's.
    //
    // RETIRE WHEN toggleTagSelector clears the tag filter on hide, or keeps or re-selects
    // the tags on show (the gate reads its source and installs nothing then). Tripwire
    // in test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireTagReshowFix(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            if (!ZP || typeof ZP.toggleTagSelector !== "function") return;
            if (!this._wvTagReshowBugIn(win)) return;   // Zotero's own fix is in
            wvWrap(ZP, "toggleTagSelector", "tagReshow", (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                // The view it acts on, taken before it awaits (zoteroPane.js: async code
                // stays in the view it started in).
                const view = this.libraryView || null;
                const r = orig.apply(this, args);
                const after = () => {
                    try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvTagSelectorReselect(win, view); } catch (e) {}
                };
                if (r && typeof r.then === "function") return r.then((v: any) => { after(); return v; });
                after();
                return r;
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireTagReshowFix err: " + e); }
    }

    /** Zotero's toggleTagSelector still takes the selector down without clearing the
     *  tag filter, and builds it again without its tags (WV-TEMP-134317). With library
     *  views (zotero#6035) ZoteroPane's own is a forwarder: the body read is the view's. */
    _wvTagReshowBugIn(win: any): boolean {
        try {
            const ZP = win.ZoteroPane;
            const wraps = ZP._wvWraps && ZP._wvWraps.toggleTagSelector;
            let src = String(wraps ? wraps.native : ZP.toggleTagSelector);
            if (!/\.uninit\(\)/.test(src)) {
                const lv = ZP.libraryView;
                let f: any = lv && lv.toggleTagSelector;
                if (typeof f !== "function") {
                    const cls: any = win.customElements && win.customElements.get("library-view");
                    f = cls && cls.prototype && cls.prototype.toggleTagSelector;
                }
                src = String(f || "");
            }
            if (!/\.uninit\(\)/.test(src) || !/tagSelector\s*=\s*null/.test(src)) return false;
            return !/setFilter|clearTagSelection|selectedTags|getTagSelection|setTags|\.tags\b/.test(src);
        } catch (e) { return false; }
    }

    _wvTeardownTagReshowFix() {
        for (const w of wvMainWins() as any[]) {
            try { if (w && w.ZoteroPane) wvUnwrap(w.ZoteroPane, "toggleTagSelector", "tagReshow"); } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134893 (forums.zotero.org/discussion/134893, MJT's thread, 2026-11-22;
    // upstream register #71). A feed item's abstract is drawn in a sandboxed
    // <browser> the Abstract section makes once (elements/abstractBox.js
    // _ensureFeedAbstractBrowserExists, 11.0-beta.5:259-292). When the section is moved
    // -- Zotero re-orders every section to the saved side-navigation order whenever a
    // plugin adds or removes one (itemDetails.js renderCustomSections -> initPaneOrder,
    // 375-376, 456-464), or the user drags a side-navigation icon (changePaneOrder,
    // 474-486) -- its disconnect empties it (base.js disconnectedCallback replaceChildren)
    // and destroy() keeps `_feedAbstractBrowser` (118-121): the reference points at a dead
    // browser, no new one is made, and every feed abstract stays blank (the next render
    // throws on its null browsingContext, 184). Seen on MJT's Zotero 2026-11-22 after each
    // Weavero reload. Here: a reference to a browser no longer in the page is dropped
    // before the render, so Zotero makes a new one.
    //
    // RETIRE WHEN Zotero drops or re-checks the browser itself (the gate reads destroy()
    // and _renderFeedItem() and installs nothing once either mentions it). Tripwire in
    // test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireFeedAbstractFix(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE) return;
            const cls: any = CE.get("abstract-box");
            if (!cls) {
                try {
                    CE.whenDefined("abstract-box").then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvWireFeedAbstractFix(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = cls.prototype;
            if (!proto || typeof proto._renderFeedItem !== "function") return;
            const wraps = Object.prototype.hasOwnProperty.call(proto, "_wvWraps") && proto._wvWraps && proto._wvWraps._renderFeedItem;
            const native = wraps ? wraps.native : proto._renderFeedItem;
            if (/isConnected|_discardFeedAbstractBrowser|_feedAbstractBrowser\s*=\s*null/.test(String(proto.destroy))) return;   // Zotero lets go of it now
            if (/isConnected|browsingContext\s*\)|!this\._feedAbstractBrowser\.browsingContext/.test(String(native))) return;   // Zotero re-checks it now
            wvWrap(proto, "_renderFeedItem", "feedAbstract", (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                try {
                    const b = this._feedAbstractBrowser;
                    if (b && (!b.isConnected || !b.browsingContext)) this._feedAbstractBrowser = null;
                } catch (e) {}
                return orig.apply(this, args);
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireFeedAbstractFix err: " + e); }
    }

    _wvTeardownFeedAbstractFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const cls: any = w && w.customElements && w.customElements.get("abstract-box");
                if (cls && cls.prototype) wvUnwrap(cls.prototype, "_renderFeedItem", "feedAbstract");
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134893b (forum 134893's second facet; Ubuntu W16, 2026-11-24; upstream
    // register #71). The Abstract section draws a feed abstract in a <browser> it makes,
    // then waits for that browser's first load to stop -- one call at a time
    // (_ensureFeedAbstractBrowserExists, a serial() class field, abstractBox.js
    // 11.0-beta.5:259-292). When the sections are re-ordered while that load runs (~100 ms
    // after a feed item is shown: a plugin registering or removing a section at its start,
    // install or reload; a drag in the side navigation at that moment), the move takes the
    // browser out of the page, its load never stops, the call never ends, every later call
    // waits behind it, and the window's Abstract section stays blank until a restart.
    // WV-TEMP-134893 cannot reach that: nothing is left to make a new browser. Here (MJT
    // 2026-11-24, option a) each section gets Weavero's copy of that method (wvFabSerial /
    // wvFabEnsure above, Zotero's code for the browser): its wait also ends when the browser
    // leaves the page, and a section moved meanwhile gets a new browser. A section that
    // was jammed before Weavero started is freed by the copy too (with WV-TEMP-134893, which
    // drops the browser the jam left behind).
    //
    // Gate (wvFabShape): only where the window's abstract-box class has exactly the code
    // copied -- a serial() making an out-of-process browser with these attributes and
    // waiting for a STATE_STOP alone: Zotero 11 (11.0-beta.5 and main 2026-11-23). Zotero
    // 10.0.8 has the same code with remote="false": its in-process browser's load does end
    // when the browser is taken out mid-load, nothing waits (measured with no add-on,
    // 2026-11-24), and the dead reference left is WV-TEMP-134893's case -- nothing is
    // installed there.
    //
    // RETIRE WHEN Zotero's own call ends on a browser taken out of the page (the gate reads
    // the method in the class source and installs nothing once it checks anything else);
    // the tripwire in test/upstream-fixes.spec.js ("torn down, B stays blank") then fails.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireFeedLoadFix(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE) return;
            const cls: any = CE.get("abstract-box");
            if (!cls) {
                try {
                    CE.whenDefined("abstract-box").then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvWireFeedLoadFix(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = cls.prototype;
            if (!proto || typeof proto._renderFeedItem !== "function" || !this._wvFeedLoadBugIn(win)) return;
            // The method is a class field (each section's own): every section that draws a
            // feed abstract takes the copy on its way in, the ones already there now.
            wvWrap(proto, "_renderFeedItem", WV_FAB_LAYER, (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                try { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvFeedLoadTake(this); } catch (e) {}
                return orig.apply(this, args);
            });
            for (const box of Array.from(win.document.querySelectorAll("abstract-box")) as any[]) this._wvFeedLoadTake(box);
        } catch (e) { Zotero.debug("[Weavero] _wvWireFeedLoadFix err: " + e); }
    }

    /** Whether the window's Abstract section has the code WV-TEMP-134893b replaces. */
    _wvFeedLoadBugIn(win: any): boolean {
        try {
            const cls: any = win && win.customElements && win.customElements.get("abstract-box");
            return !!wvFabShape(cls);
        } catch (e) { return false; }
    }

    /** Section `el` (or the graphical-abstract stand-in of one, feeds-graphical.ts: a
     *  native DOM method runs on the element itself) takes Weavero's copy. */
    _wvFeedLoadTake(el: any) {
        try {
            const box = el && typeof el.closest === "function" ? el.closest("abstract-box") : null;
            if (!box || typeof box._ensureFeedAbstractBrowserExists !== "function") return;
            const w = winOf(box);
            const remote = wvFabShape(w && w.customElements && w.customElements.get("abstract-box"));
            if (!remote) return;
            wvWrap(box, "_ensureFeedAbstractBrowserExists", WV_FAB_LAYER, (this as any)._wvWireTag(), () => wvFabSerial(box, remote));
        } catch (e) { Zotero.debug("[Weavero] _wvFeedLoadTake err: " + e); }
    }

    _wvTeardownFeedLoadFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const cls: any = w && w.customElements && w.customElements.get("abstract-box");
                if (cls && cls.prototype) wvUnwrap(cls.prototype, "_renderFeedItem", WV_FAB_LAYER);
                for (const box of Array.from(w.document.querySelectorAll("abstract-box")) as any[]) {
                    try { const rec = wvFabPending.get(box); if (rec) rec.stop(); } catch (e) {}
                    try { wvUnwrap(box, "_ensureFeedAbstractBrowserExists", WV_FAB_LAYER); } catch (e) {}
                }
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-FEEDHEAD (no forum thread yet; fdcrash, 2026-11-22). Zotero.crash() --
    // "An error has occurred. Please restart Zotero.", the items view locked until a
    // restart -- after "can't access property "label", elem is null" in itemPane.js.
    // itemSelected (11.0-beta.5 libraryView.js 862-907, 10.0.8 zoteroPane.js 2223-2268)
    // hands the item pane the COLLECTIONS pane's rows and the ITEMS view's selection;
    // updateItemPaneButtons draws the feed buttons only for a feed row (itemPane.js
    // 383-387), while renderItemPane labels them for a feed ITEM (235-249 ->
    // setTranslateButton 581-585) and the item observer for a feed row (180-185 ->
    // setReadLabel 511-514), neither checking the button is there. The two disagree
    // when an items-view refresh lands across a collection switch: each item-tree column
    // (un)registration -- every plugin's start and shutdown, Weavero's ~8 columns at a
    // reload -- runs refreshAndMaintainSelection (itemTree.jsx 1561-1580), which captures
    // the selection, awaits a serial refresh, then restores it: a feed item restored after
    // the user picked My Library is rendered under My Library's rows with no feed head.
    // Reproduced with Weavero disabled, plain Zotero.ItemTreeManager calls then a switch:
    // 9/24 trials on 11.0-beta.5, 4/24 on 10.0.8 (2026-11-22). Here: a
    // label call with no button to label in the pane shown does nothing -- the head is
    // drawn again by the next itemSelected, once the switch has landed.
    //
    // RETIRE WHEN Zotero checks the buttons (the gate reads both methods and installs
    // nothing once either tests `elem`), or the tripwire in test/feeds-crash.spec.js
    // ("torn down") no longer throws.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireFeedHeadFix(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE) return;
            const cls: any = CE.get("item-pane");
            if (!cls) {
                try {
                    CE.whenDefined("item-pane").then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvWireFeedHeadFix(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = cls.prototype;
            if (!proto || typeof proto.getCurrentPane !== "function") return;
            const tag = (this as any)._wvWireTag();
            for (const [m, sel] of WV_FEED_HEAD_LABELS) {
                if (typeof proto[m] !== "function") continue;
                const wraps = Object.prototype.hasOwnProperty.call(proto, "_wvWraps") && proto._wvWraps && proto._wvWraps[m];
                const native = wraps ? wraps.native : proto[m];
                if (/!\s*elem\b|elem\s*\?\.|elem\s*(?:===?|!==?)\s*null/.test(String(native))) continue;   // Zotero checks it now
                wvWrap(proto, m, "feedHead", tag, (orig: any) => function (this: any, ...args: any[]) {
                    try {
                        const pane = this.getCurrentPane();
                        if (pane && typeof pane.querySelector === "function" && !pane.querySelector(sel)) return undefined;
                    } catch (e) {}
                    return orig.apply(this, args);
                });
            }
        } catch (e) { Zotero.debug("[Weavero] _wvWireFeedHeadFix err: " + e); }
    }

    _wvTeardownFeedHeadFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const cls: any = w && w.customElements && w.customElements.get("item-pane");
                if (!cls || !cls.prototype) continue;
                for (const [m] of WV_FEED_HEAD_LABELS) wvUnwrap(cls.prototype, m, "feedHead");
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-advsrchcollapse (MJT 2026-11-22, not yet posted; upstream register #72).
    // On the Feeds row (all feeds), a quick search and then the Advanced Search button
    // in the search field opens the Advanced Search with no Collapse or Close button: the
    // search field stays, with its text. The button seeds the pane from the quick search
    // (openAdvancedSearchFromQuickSearch: 11.0-beta.5 elements/libraryView.js 1388-1418,
    // 10.0.8 zoteroPane.js 2038-2097); the seed takes the first selected row's library
    // (libraryView.js 1341-1344) and the Feeds row has none (its `ref` is the list of
    // feeds). The pane is shown first (deck.state = 'open', 1400), then takes the seed
    // through its `search` setter, whose clone() of a search with no library throws
    // "libraryID not provided" (advancedSearchPane.js 155 -> search.js clone 277 ->
    // dataObjectUtilities.js 55). The rest is skipped: the search field never becomes the
    // Advanced Search indicator that holds Collapse and Close (quickSearchTextbox.js
    // updateMode 216-223), the field is not cleared, the seed never runs. Zotero knows
    // such a search cannot be cloned and copies it where the items list takes it
    // (collectionTreeRow.js 510-517, 644-648); the pane's setter does not. Stock
    // 11.0-beta.5 and 10.0.8 with no add-on (probed 2026-11-22); zotero main of
    // 2026-11-21 unchanged.
    // Here: a search with no library handed to a temporary pane is given the library the
    // pane's own search holds -- what its refresh() keeps on the Feeds row ("Keep the
    // previous library when the selected row doesn't have one (e.g., Feeds)",
    // advancedSearchPane.js 236-239) -- else My Library, so Zotero's setter takes it and
    // the rest of Zotero's open runs. The list still searches every feed: the Feeds row
    // copies the search without its library (collectionTreeRow.js 644-648).
    //
    // ZOTERO 10 ONLY since 2026-11-26: 11.0-beta.6 (+c672babc8) carries Zotero's fix,
    // 45b9d049b (advancedSearchPane.js 155-159 copies a search with no library), and the
    // gate installs nothing there (checked live on beta.6). 10.0.8 still has the bug.
    // RETIRE WHEN a 10.0.x release fixes it too (the setter takes a search with no
    // library, or the quick-search seed gets one on the Feeds row: the gate runs both on
    // stand-in objects and installs nothing then), or when Zotero 10 support ends.
    // Tripwire for Zotero 10 in test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireAdvSearchSeedFix(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE) return;
            const cls: any = CE.get("advanced-search-pane");
            if (!cls) {
                // Registered lazily (customElements.js); Zotero 9 has no such pane at all.
                try {
                    CE.whenDefined("advanced-search-pane").then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvWireAdvSearchSeedFix(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = cls.prototype;
            const cur = proto && Object.getOwnPropertyDescriptor(proto, "search");
            if (!cur || typeof cur.set !== "function") return;
            const tag = (this as any)._wvWireTag();
            const was: any = cur.set;
            if (was._wvAdvSeedNative && was._wvAdvSeedTag === tag) return;   // this instance's
            // Zotero's own accessor: kept on the setter put in its place, so another
            // instance (a reload) and the teardown find it.
            const native: PropertyDescriptor = was._wvAdvSeedNative || cur;
            if (!this._wvAdvSearchSeedBugIn(win, native.set)) {   // Zotero's own fix is in
                if (was._wvAdvSeedNative) Object.defineProperty(proto, "search", native);
                return;
            }
            const nativeSet: any = native.set;
            const set: any = function (this: any, search: any) {
                let s = search;
                try {
                    if (s && (s.libraryID === null || s.libraryID === undefined) && this.type === "temporary") {
                        const held = this.search;
                        s = s.clone((held && held.libraryID) || Zotero.Libraries.userLibraryID);
                    }
                }
                catch (e) { s = search; }
                return nativeSet.call(this, s);
            };
            set._wvAdvSeedNative = native;
            set._wvAdvSeedTag = tag;
            Object.defineProperty(proto, "search", { configurable: true, enumerable: !!native.enumerable, get: native.get, set });
        } catch (e) { Zotero.debug("[Weavero] _wvWireAdvSearchSeedFix err: " + e); }
    }

    /** The Advanced Search pane's `search` setter still refuses a search with no library,
     *  and the quick-search seed still has none when no selected row has a library
     *  (WV-TEMP-advsrchcollapse). Read by running Zotero's own code on stand-in objects:
     *  nothing of Zotero's is touched. 10.0.8 builds the seed inside
     *  openAdvancedSearchFromQuickSearch: there only the setter is read. */
    _wvAdvSearchSeedBugIn(win: any, nativeSet: any): boolean {
        try {
            if (typeof nativeSet !== "function") return false;
            const probe = new Zotero.Search();
            probe.addCondition("title", "contains", "wv");
            try {
                nativeSet.call({ type: "temporary", _searchElem: {} }, probe);
                return false;   // taken: Zotero's setter copes now
            }
            catch (e: any) {
                if (!/libraryID/.test(String((e && e.message) || e))) return false;   // another refusal: not this bug
            }
            const LV: any = win && win.customElements && win.customElements.get("library-view");
            const build = LV && LV.prototype && LV.prototype._buildSearchFromQuickSearch;
            if (typeof build === "function") {
                try {
                    const seed = build.call({ collectionsView: { getSelectedLibraryIDs: () => [] } }, "wv", "fields");
                    if (seed && seed.libraryID) return false;   // the seed gets a library now
                }
                catch (e) {}
            }
            return true;
        } catch (e) { return false; }
    }

    _wvTeardownAdvSearchSeedFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const cls: any = w && w.customElements && w.customElements.get("advanced-search-pane");
                const proto = cls && cls.prototype;
                const cur = proto && Object.getOwnPropertyDescriptor(proto, "search");
                const native = cur && cur.set && (cur.set as any)._wvAdvSeedNative;
                if (native) Object.defineProperty(proto, "search", native);
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-114534 (forums.zotero.org/discussion/114534, MJT's thread, 2024, Zotero 7
    // beta.79, no reply). With no item selected, the item pane's side navigation lists
    // one fixed set whatever the view: the item pane turns the side navigation's no-item
    // state on for every mode but item and duplicates (itemPane.js _handleViewTypeChange,
    // 11.0-beta.5:750, 10.0.8:749), and that state shows exactly `_defaultPanes` -- Info,
    // Abstract, Attachments, Notes, Libraries and Collections, Tags, Related, disabled
    // (itemPaneSidenav.js renderDefaultStatus 659-664 and _defaultPanes 100-102; 10.0.8
    // 656-661 and 100-102) -- never asking what the pane shows. A feed item has Info and
    // Abstract only (the WV_SNF_LIBRARY_ONLY sections hide themselves for it), so a feed,
    // or the Feeds row, with nothing selected lists five sections the view never has.
    // Stock 11.0-beta.5 and 10.0.8 with no add-on, probed 2026-11-22. Here, layers on the
    // window's item-pane-sidenav class: in that no-item
    // state, inside an item pane showing feeds, renderDefaultStatus and updatePaneStatus
    // (through which Zotero shows a button again in that state: its render(), a section a
    // plugin adds) leave only Zotero's no-item sections a feed item has. And one on the
    // item-pane class's renderMessage: My Library <-> a feed with nothing selected keeps
    // the pane's mode, so Zotero never re-runs its list; the layer applies the one of the
    // view now shown. Plugin sections (Weavero's too) stay hidden there, as Zotero
    // hides them in every view's no-item state; a padlock mark (pane-lock.ts) sits on its
    // button's wrapper and goes out of sight with it. Reader tabs' context panes never
    // enter that state (contextPane.js 85, toggleDefaultStatus(false)).
    //
    // RETIRE WHEN Zotero's no-item list follows the view (the gate reads
    // renderDefaultStatus, _defaultPanes, toggleDefaultStatus and the item pane's
    // _handleViewTypeChange, and installs nothing once one of them mentions feeds or
    // renderDefaultStatus no longer lists `_defaultPanes`). Tripwire in
    // test/upstream-fixes.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireSidenavFeedFix(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE) return;
            const SN: any = CE.get("item-pane-sidenav");
            const IP: any = CE.get("item-pane");
            if (!SN || !IP) {
                try {
                    Promise.all([CE.whenDefined("item-pane-sidenav"), CE.whenDefined("item-pane")]).then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvWireSidenavFeedFix(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            if (!this._wvSidenavFeedBugIn(win)) return;   // Zotero's own fix is in
            const tag = (this as any)._wvWireTag();
            wvWrap(SN.prototype, "renderDefaultStatus", "feedSidenav", tag, (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                try { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvSidenavFeedApply(this); } catch (e) {}
                return r;
            });
            wvWrap(SN.prototype, "updatePaneStatus", "feedSidenav", tag, (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                try { const lp = live(); if (lp && !lp._wvDestroyed && args[0]) lp._wvSidenavFeedApply(this, String(args[0])); } catch (e) {}
                return r;
            });
            // renderMessage, not setItemPaneMessage: the item count's breakdown wraps the
            // pane's own setItemPaneMessage and keeps the function it found (filter.ts
            // _wvWireItemCountBreakdown), so a layer there stayed called after this one's
            // teardown (found by the tripwire, 2026-11-22).
            wvWrap(IP.prototype, "renderMessage", "feedSidenav", tag, (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                try { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvSidenavFeedRefresh(this._sidenav); } catch (e) {}
                return r;
            });
            // A window already showing a feed with nothing selected (a reload there).
            for (const ip of Array.from(win.document.querySelectorAll("item-pane")) as any[]) this._wvSidenavFeedRefresh(ip && ip._sidenav);
        } catch (e) { Zotero.debug("[Weavero] _wvWireSidenavFeedFix err: " + e); }
    }

    /** Zotero's no-item side navigation still lists its fixed set whatever the view
     *  (WV-TEMP-114534). The sources read are the natives under any layer. */
    _wvSidenavFeedBugIn(win: any): boolean {
        try {
            const CE = win.customElements;
            const SN: any = CE.get("item-pane-sidenav"), IP: any = CE.get("item-pane");
            const sp: any = SN && SN.prototype, ip: any = IP && IP.prototype;
            if (!sp || !ip || typeof sp.renderDefaultStatus !== "function" || typeof sp.updatePaneStatus !== "function"
                || typeof ip.renderMessage !== "function") return false;
            const nat = (host: any, m: string): string => {
                const t = Object.prototype.hasOwnProperty.call(host, "_wvWraps") && host._wvWraps && host._wvWraps[m];
                return String(t ? t.native : host[m]);
            };
            const render = nat(sp, "renderDefaultStatus");
            if (!/_defaultPanes/.test(render)) return false;
            const d = Object.getOwnPropertyDescriptor(sp, "_defaultPanes");
            const src = [render, String(d ? (d.get || d.value) : ""), nat(sp, "toggleDefaultStatus"), nat(ip, "_handleViewTypeChange")].join("\n");
            return !/feed/i.test(src);
        } catch (e) { return false; }
    }

    /** Side navigation `sn` sits in an item pane showing feeds: a feed or the Feeds row
     *  (every selected collection row; the pane's own feed checks read the first,
     *  itemPane.js 182 and 383). */
    _wvSidenavFeedView(sn: any): boolean {
        try {
            const ip = sn && sn.closest && sn.closest("item-pane");
            const rows = ip && ip.collectionTreeRows;
            if (!rows || !rows.length) return false;
            for (const r of rows) if (!r || typeof r.isFeedsOrFeed !== "function" || !r.isFeedsOrFeed()) return false;
            return true;
        } catch (e) { return false; }
    }

    /** In its no-item state in a feed view, `sn` lists Zotero's no-item sections a
     *  feed item has, and Weavero's own Feeds sections -- Why relevant, the
     *  Graphical Abstract (feeds.ts, feeds-graphical.ts) -- disabled as Zotero's
     *  no-item buttons are (MJT 2026-11-22: "Yes" to "With no item selected in
     *  Feeds, should Weavero's Feeds sections show in the side navigation?");
     *  other plugins' sections stay hidden there, as Zotero hides them in every
     *  view's no-item state. `paneID`: that section's button alone, after Zotero's
     *  updatePaneStatus. */
    _wvSidenavFeedApply(sn: any, paneID?: string) {
        try {
            if (!sn) return;
            if (!sn._defaultStatus || !this._wvSidenavFeedView(sn)) {
                // Zotero's whole list just drawn again (renderDefaultStatus): nothing of ours left.
                if (!paneID) wvSnfHid.delete(sn);
                return;
            }
            const defs: string[] = Array.isArray(sn._defaultPanes) ? sn._defaultPanes : [];
            const own = [(this as any)._wvFdSecKey, (this as any)._wvGaSecKey].filter((k: any) => typeof k === "string" && !!k);
            for (const b of Array.from(sn.querySelectorAll(".btn[data-pane]")) as any[]) {
                const id = String(b.dataset.pane || "");
                if (paneID && id !== paneID) continue;
                const w = b.parentElement;
                if (!w) continue;
                if (own.includes(id)) {
                    wvSetBoolAttr(b, "disabled", true);   // as Zotero's no-item buttons
                    if (w.hidden) { w.hidden = false; wvSnfHid.add(sn); }
                    continue;
                }
                if (w.hidden) continue;
                if (defs.includes(id) && !WV_SNF_LIBRARY_ONLY.includes(id)) continue;
                w.hidden = true;
                wvSnfHid.add(sn);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvSidenavFeedApply err: " + e); }
    }

    /** The item pane showed its message (WV-TEMP-114534): `sn`'s no-item list for the
     *  view now shown -- the feed one, or Zotero's own again where the fix hid buttons. */
    _wvSidenavFeedRefresh(sn: any) {
        try {
            if (!sn || !sn._defaultStatus || typeof sn.renderDefaultStatus !== "function") return;
            if (this._wvSidenavFeedView(sn)) this._wvSidenavFeedApply(sn);
            else if (wvSnfHid.has(sn)) sn.renderDefaultStatus();
        } catch (e) { Zotero.debug("[Weavero] _wvSidenavFeedRefresh err: " + e); }
    }

    _wvTeardownSidenavFeedFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const CE = w && w.customElements;
                const SN: any = CE && CE.get("item-pane-sidenav");
                const IP: any = CE && CE.get("item-pane");
                if (SN && SN.prototype) {
                    wvUnwrap(SN.prototype, "renderDefaultStatus", "feedSidenav");
                    wvUnwrap(SN.prototype, "updatePaneStatus", "feedSidenav");
                }
                if (IP && IP.prototype) wvUnwrap(IP.prototype, "renderMessage", "feedSidenav");
                // Zotero's own list back where the fix hid buttons.
                for (const ip of Array.from(w.document.querySelectorAll("item-pane")) as any[]) {
                    const sn = ip && ip._sidenav;
                    if (!sn || !wvSnfHid.has(sn)) continue;
                    wvSnfHid.delete(sn);
                    if (sn._defaultStatus && typeof sn.renderDefaultStatus === "function") sn.renderDefaultStatus();
                }
            } catch (e) {}
        }
    }

    _wvTeardownPaneJumpFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const cls: any = w && w.customElements && w.customElements.get("info-box");
                if (cls && cls.prototype) wvUnwrap(cls.prototype, "render", "paneJump");
            } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-INTROCRASH (no forum thread: found by Weavero's suite on 2026-11-24 -- the
    // Zotero 10 runs that died in bg-restore-guard; upstream register entry). Zotero 10
    // CRASHES (WER APPCRASH, xul.dll+0x19f329d, a null read in nsNodeInfoManager::Allocate,
    // its minidump has "<b>Welcome to Zotero!</b>" on the stack) when a
    // main window closes while its items list is still loading over an EMPTY My Library
    // with no groups: collectionViewItemTree.js _updateIntroText() takes the window's
    // document, awaits `collectionTreeRows[0].ref.hasItems()`, then builds the intro with
    // createElement + innerHTML in that document -- by then a closed window's. (My
    // Publications never reaches the await: its row is not a library row.) Weavero is
    // what gives Zotero 10 several main windows, so this stand-in is Weavero's to carry
    // (MJT 2026-11-24, "Ok"). Here: for that one branch, the method's synchronous start
    // sees a stand-in for `_ownerDocument` whose createElement refuses a closed window;
    // Zotero's own code runs otherwise, and the refusal ends it quietly. Zotero 10 and
    // older only (11's windows are Zotero's own, #6035).
    //
    // RETIRE WHEN Weavero drops Zotero 10, or the method checks its window after the
    // await (the gate reads its source and installs nothing then). Guard:
    // test/upstream-fixes.spec.js ("WV-TEMP-INTROCRASH").
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireIntroCrashFix(win: any) {
        try {
            if (!(parseInt(String(Zotero.version), 10) <= 10)) return;
            const proto: any = wvIntroTreeProto(win);
            if (!proto || typeof proto._updateIntroText !== "function") return;
            const wraps = Object.prototype.hasOwnProperty.call(proto, "_wvWraps") && proto._wvWraps && proto._wvWraps._updateIntroText;
            const src = String(wraps ? wraps.native : proto._updateIntroText);
            // The bug's shape: the document taken, an await on hasItems(), then nodes made in it.
            if (!/this\._ownerDocument[\s\S]{0,600}await\s+this\.collectionTreeRows\[0\]\.ref\.hasItems\(\)[\s\S]{0,400}createElement/.test(src)) return;
            if (/\.closed\b/.test(src)) return;   // Zotero checks the window itself now
            wvWrap(proto, "_updateIntroText", "introCrash", (this as any)._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                const real = this._ownerDocument;
                let swapped = false;
                try {
                    // Only the branch that awaits: rows all libraries, no groups, an empty list.
                    const rows = this.collectionTreeRows;
                    if (real && rows && rows.length && !this.rowCount
                            && rows.every((r: any) => r && typeof r.isLibrary === "function" && r.isLibrary())
                            && !Zotero.Groups.getAll().length) {
                        const guard = new Proxy(real, {
                            get(t: any, k: any) {
                                if (k === "createElement" || k === "createElementNS") {
                                    return (...a: any[]) => {
                                        const w = t.defaultView;
                                        if (!w || w.closed) throw WV_INTRO_CLOSED;
                                        return t[k](...a);
                                    };
                                }
                                const v = t[k];
                                return typeof v === "function" ? v.bind(t) : v;
                            },
                        });
                        this._ownerDocument = guard;
                        swapped = this._ownerDocument === guard;
                    }
                } catch (e) { swapped = false; }
                let r: any;
                // The method reads `_ownerDocument` once, before its first await: the real
                // document is back before anything else can see the stand-in.
                try { r = orig.apply(this, args); }
                finally { if (swapped) { try { this._ownerDocument = real; } catch (e) {} } }
                return Promise.resolve(r).catch((e: any) => {
                    if (e === WV_INTRO_CLOSED) { Zotero.debug("[Weavero] WV-TEMP-INTROCRASH: no intro text written into a closed window"); return undefined; }
                    throw e;
                });
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireIntroCrashFix err: " + e); }
    }

    _wvTeardownIntroCrashFix() {
        for (const w of wvMainWins() as any[]) {
            try {
                const proto: any = wvIntroTreeProto(w);
                if (proto) wvUnwrap(proto, "_updateIntroText", "introCrash");
            } catch (e) {}
        }
    }
}

/** WV-TEMP-INTROCRASH: what the stand-in document throws in a closed window. */
const WV_INTRO_CLOSED = { wvIntroClosed: true };

/** The items-list class of main window `win` (each window loads its own copy:
 *  require.js makes one loader per window); its items view's prototype when the
 *  window has no `require`. */
function wvIntroTreeProto(win: any): any {
    if (!win || win.closed) return null;
    try {
        const C = typeof win.require === "function" ? win.require("zotero/collectionViewItemTree") : null;
        if (C && C.prototype) return C.prototype;
    } catch (e) {}
    try {
        const iv = win.ZoteroPane && win.ZoteroPane.itemsView;
        return iv ? Object.getPrototypeOf(iv) : null;
    } catch (e) { return null; }
}

const _upstreamFixesDescriptors = Object.getOwnPropertyDescriptors(_UpstreamFixesMixin.prototype);
delete (_upstreamFixesDescriptors as any).constructor;
export const upstreamFixesMethods = _upstreamFixesDescriptors;
