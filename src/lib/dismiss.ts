// One outside-click dismisser (survey 2026-10-06 §4 #10). Ten popups each
// hand-rolled a document mousedown closer -- the same skips (the popup
// itself, its anchor, a press on the popup's own scrollbar: issue #55),
// the same removal, each a little differently, and the removal sites
// re-spelled `removeEventListener` for the stashed handler. The reader's
// comment / relations popups had the fuller version (every reachable
// document, deferred attach, self-removal, destroy() running the live
// ones); it is the model here.

import { winOf, wvWithin } from "./dom";
import { wvInjectStyle } from "./style";

export interface WvOutsideClickSpec {
    /** The popup. A press inside it -- its anonymous scrollbar parts included -- never dismisses. */
    panel: any;
    /** Documents to listen on; default the panel's own. `wvReachableDocs()` for every document there is. */
    docs?: any[];
    /** Nodes a press inside which does not dismiss (the opener anchor, the search box the popup hangs from...). */
    keep?: any[] | (() => any[]);
    /** A press this returns true for does not dismiss (a press inside any native menupopup, say). */
    allow?: (e: any) => boolean;
    /** Whether the popup is still open. Default: connected and not display:none. A press while closed removes the listeners. */
    isOpen?: () => boolean;
    /** Attach a tick later, so the press that opened the popup does not match (needs `hostWin` or a panel with a window). */
    defer?: boolean;
    hostWin?: any;
    /** Elements marked `data-wv-nodrag` while the popup is open: a window drag
     *  area (title bar, tab bar, reader toolbar) gives the DOM no event at all,
     *  so a press there could never dismiss (MJT 2026-10-01). A rule keyed on
     *  the attribute, never an inline style: Firefox 153 keeps
     *  -moz-window-dragging out of CSSOM. */
    noDrag?: any[];
    /** The plugin instance: the teardown joins `owner._wvDismissOffs`, which destroy() runs. */
    owner?: any;
    onOutside: (e: any) => void;
}

/** Every document reachable from the chrome windows: each top-level window's
 *  document (nsIWindowMediator -- in Zotero 10's reader the iframe's window
 *  has parent === self, so there is no walking UP from a host) and, below
 *  each, every iframe / browser document; `hostDoc`'s subtree too in case
 *  the mediator missed it (a pref-pane subdocument). `visited` is separate
 *  from the result so a document added by one walk still gets its iframes. */
export function wvReachableDocs(hostDoc?: any): any[] {
    const docs: Set<any> = new Set();
    const visited: Set<any> = new Set();
    const collectDown = (doc: any) => {
        if (!doc || visited.has(doc)) return;
        visited.add(doc);
        docs.add(doc);
        try {
            for (const f of doc.querySelectorAll("iframe, browser")) {
                let cd: any = null;
                try { cd = f.contentDocument; } catch (e) {}
                if (cd) collectDown(cd);
            }
        } catch (e) {}
    };
    try {
        const wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
        const en = wm.getEnumerator(null);
        while (en.hasMoreElements()) {
            const w: any = en.getNext();
            try { if (w.document) collectDown(w.document); } catch (e) {}
        }
    } catch (e) {}
    if (hostDoc) collectDown(hostDoc);
    return Array.from(docs);
}

/** Dismiss `spec.panel` on a mousedown outside it. Returns the teardown,
 *  also kept on `panel._wvDismissOff` (a new dismisser on the same panel
 *  runs the old one first). The listener removes itself when it finds the
 *  popup closed, however it closed -- its anchor, a link, Escape, a reopen:
 *  before that only the outside-click path called the teardown, and a popup
 *  closed any other way left its listeners on every document for the
 *  session. A torn-down dismisser never attaches (the deferred attach once
 *  landed after a same-tick close; reload-listener audit, wiring slice 3). */
export function wvOutsideClick(spec: WvOutsideClickSpec): () => void {
    const panel = spec.panel;
    try { if (typeof panel._wvDismissOff === "function") panel._wvDismissOff(); } catch (e) {}
    const docs: any[] = (spec.docs && spec.docs.length) ? spec.docs : [panel.ownerDocument];
    const isOpen = spec.isOpen || (() => { try { return !!panel.isConnected && panel.style.display !== "none"; } catch (e) { return false; } });
    const keep = (): any[] => { try { return (typeof spec.keep === "function" ? spec.keep() : spec.keep) || []; } catch (e) { return []; } };
    const noDrag: any[] = spec.noDrag || [];
    const handler = (e: any) => {
        if (!isOpen()) { teardown(); return; }
        try {
            const t = e.target;
            // wvWithin, not contains(): a press on the popup's own scrollbar
            // targets its anonymous thumb (issue #55).
            if (wvWithin(panel, t)) return;
            for (const k of keep()) if (k && wvWithin(k, t)) return;
            // The anchor that opened the popup: its own click handler runs
            // next and toggles the popup closed; a dismiss here would have
            // the click re-open it (net effect: nothing).
            const opener = panel._wvOpenedFor;
            if (opener && wvWithin(opener, t)) return;
            if (spec.allow && spec.allow(e)) return;
        } catch (er) {}
        spec.onOutside(e);
    };
    let torn = false;
    const live: Set<any> | null = spec.owner ? (spec.owner._wvDismissOffs || (spec.owner._wvDismissOffs = new Set())) : null;
    for (const el of noDrag) {
        try {
            wvInjectStyle(el.ownerDocument, "wv-nodrag", "[data-wv-nodrag] { -moz-window-dragging: no-drag !important; }");
            el.setAttribute("data-wv-nodrag", "1");
        } catch (e) {}
    }
    const teardown = () => {
        torn = true;
        for (const d of docs) { try { d.removeEventListener("mousedown", handler, true); } catch (e) {} }
        for (const el of noDrag) { try { el.removeAttribute("data-wv-nodrag"); } catch (e) {} }
        if (live) live.delete(teardown);
        try { if (panel._wvDismissOff === teardown) panel._wvDismissOff = null; } catch (e) {}
    };
    if (live) live.add(teardown);
    try { panel._wvDismissOff = teardown; } catch (e) {}
    const attach = () => {
        if (torn) return;
        for (const d of docs) { try { d.addEventListener("mousedown", handler, true); } catch (e) {} }
    };
    if (spec.defer) {
        const w = spec.hostWin || winOf(panel);
        if (w && w.setTimeout) w.setTimeout(attach, 0);
        else attach();
    }
    else attach();
    return teardown;
}

/** Run and drop the dismisser stashed under `holder[key]` (a teardown from
 *  wvOutsideClick, or nothing). The toggle-closed and clear-and-close paths
 *  of a popup, and its surface's teardown, all end here. */
export function wvDismissOff(holder: any, key: string): void {
    try { const f = holder && holder[key]; if (typeof f === "function") f(); } catch (e) {}
    try { if (holder) delete holder[key]; } catch (e) {}
}
