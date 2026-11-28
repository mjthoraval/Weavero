// Feeds: the card of a feed item's library copy (MJT 2026-11-22: "a badge
// somewhere in the item pane showing that it is already in my library, with a
// hover card showing the details of that item to make sure it is correct, and
// different ways to open it"; plan "Ok").
//
// ONE format with the references (MJT 2026-11-22, citations.19: "Why use a
// different item card format in Feeds? Consolidate with the one in Refs to make
// the best of each in a consistent format"): a click on the In Library column's
// icon (feeds.ts) or on Why relevant's "Already in your library" line opens the
// reference menu itself -- refs.ts _wvRefsMenu, what a reference row's ⋯ and Why
// relevant's own rows open: the card (the item type's icon, the bibliography
// entry as the item pane's header draws it, the libraries holding a copy, the
// abstract), then Open PDF in New Tab / Split View / New Window, Show in
// Library, Copy As. A click, not a hover, as Weavero's other columns (MJT
// 2026-11-22: "I would like to unify" -- click, "Ok"); hovering shows a tooltip.
// citations.17's badge after Zotero's feed buttons and citations.18's own panel
// card are gone. Nothing is written anywhere.

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvUnwrap } from "../lib/wrap";
import { wvMainWins } from "../lib/windows";

declare const Zotero: any;

/** refs.ts MENU_ID: the reference menu, one per document. */
const MENU_ID = "wv-refs-menu";
const MAX_COPIES = 5;

/** The library copies a feed item has, best first (My Library's, then the
 *  others), from its score's record; [] when it has none. */
function copiesOf(P: any, feedItem: any): any[] {
    const r = P._wvFdRecOf(feedItem.id);
    if (!r || !r.inLib || !r.libIDs || !r.libIDs.length) return [];
    const u = Zotero.Libraries.userLibraryID;
    const out: any[] = [];
    for (const id of r.libIDs) {
        let it: any = null;
        try { it = Zotero.Items.get(id); } catch (e) { it = null; }
        if (it && !it.deleted && it.isRegularItem && it.isRegularItem()) out.push(it);
    }
    out.sort((a, b) => (a.libraryID === u ? 0 : 1) - (b.libraryID === u ? 0 : 1));
    return out.slice(0, MAX_COPIES);
}

/** The open reference menu of `win`, when it is one this module opened. */
function ourMenu(win: any): any {
    try {
        const pop: any = win.document.getElementById(MENU_ID);
        return pop && pop._wvFdFeed && (pop.state === "open" || pop.state === "showing") ? pop : null;
    } catch (e) { return null; }
}

class _FeedsBadgeMixin {
    [k: string]: any;

    /** A click (or Enter, Space) on `el` opens feed item `feedID`'s reference menu, as
     *  Weavero's other columns open theirs; hovering it shows a tooltip only (MJT
     *  2026-11-22: "In the library, the other columns get a popup only on a click. I
     *  would like to unify" -- click, "Ok"). Escape closes it, as any menu. */
    _wvFdCardHover(win: any, el: any, feedID: number) {
        const live = () => wvLivePlugin() as any;
        try { const lp = live(); const name = lp ? lp._wvFdCopyLibName(feedID) : ""; if (name) el.setAttribute("title", wvStr("weavero-feeds-card-tip", { library: name }, null)); } catch (e) {}
        el.addEventListener("click", (e: any) => {
            try { if (e.button !== 0) return; e.stopPropagation(); const lp = live(); if (lp) lp._wvFdCardShow(win, el, feedID); } catch (er) {}
        });
        el.addEventListener("keydown", (e: any) => {
            try {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); const lp = live(); if (lp) lp._wvFdCardShow(win, el, feedID); }
            } catch (er) {}
        });
    }

    /** The name of the library holding feed item `feedID`'s best copy ("" when none). */
    _wvFdCopyLibName(feedID: number): string {
        try {
            const it = Zotero.Items.get(feedID);
            const c = it ? copiesOf(this, it)[0] : null;
            return c ? String(Zotero.Libraries.getName(c.libraryID) || "") : "";
        } catch (e) { return ""; }
    }

    _wvFdCardHide(win: any) {
        try { const pop = ourMenu(win); if (pop) pop.hidePopup(); } catch (e) {}
    }

    /** Feed item `feedID`'s reference menu under `anchor` (refs.ts _wvRefsMenu, with
     *  the library pane's stand-in context: the copies are opened in this window, Split
     *  beside its library tab). */
    _wvFdCardShow(win: any, anchor: any, feedID: number) {
        try {
            const feedItem = Zotero.Items.get(feedID);
            const copies = feedItem ? copiesOf(this, feedItem) : [];
            if (!copies.length) return;
            // No citing paper: the card says "In <library>", as in My Library's own panes.
            const ctx = { wvLib: true, itemID: 0, _window: win, tabID: null, type: "pdf" };
            this._wvRefsMenu(ctx, copies.map((c) => c.id), "none", anchor);
            const pop: any = win.document.getElementById(MENU_ID);
            if (pop) pop._wvFdFeed = feedID;
        } catch (e) { Zotero.debug("[Weavero] feeds card err: " + e); }
    }

    /** Every window: an open feed menu closed (and citations.17's head wrap, if a
     *  window still carries it). */
    _wvFdBadgeUnwireAll() {
        for (const w of wvMainWins()) {
            try {
                const C = w.customElements && w.customElements.get("item-pane");
                if (C && C.prototype) wvUnwrap(C.prototype, "renderFeedHead", "feeds-badge");
                this._wvFdCardHide(w);
            } catch (e) {}
        }
    }
}

const _fbDescriptors = Object.getOwnPropertyDescriptors(_FeedsBadgeMixin.prototype);
delete (_fbDescriptors as any).constructor;
export const feedsBadgeMethods = _fbDescriptors;
