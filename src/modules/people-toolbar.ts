// The Researchers button in the collections pane's toolbar (MJT 2026-11-27: "I
// find that accessing the Researchers tab feature is difficult. I propose adding
// an icon here" -- the collections pane's toolbar -- then "Ok" to the proposal).
// Until then File -> Researchers (pane.ts) was the only general way in.
//
// Where: right after Weavero's Bookmarks button (bookmarks.ts), after New
// Collection when Bookmarks is off -- Toggle Collections Pane, New Collection,
// Bookmarks, Researchers, then Zotero's spacer and search. Bookmarks puts itself
// right after New Collection whenever it is built, so the order holds whichever
// comes first. In EVERY library view's collections toolbar: on a Zotero with its
// own windows each library tab has its own (libraryView.js, ids suffixed past the
// window's first view), as the collections-pane toggle does (pane.ts
// `_wvApplyCollectionsPaneToggle`); hence the wiring entry's `views` + `perView`.
//
// Look: the Researchers tab's own person, filled (people.ts WV_PP_ICON_SOLID20) in Zotero's
// --accent-blue, the colour of the tab's icon and of the Info section's mark
// (people-cmark.ts); the tab's name as tooltip and accessible name.
//
// A click: this window's Researchers tab, opened or selected (_wvPeopleTabOpen).
// The opening modifiers (lib/keys.ts wvOpenWhere, open-where.ts): Ctrl/Cmd+click
// beside the tab it came from (a split with the library, when the split view is
// on), a middle click in the background. Shift+click ("a new window") is the
// plain open: the tab is one per main window and cannot move to another in v1
// (people.ts), so there is no window of its own to open it in.
//
// A right-click: Hide Researchers Button (MJT's rule: the show/hide control sits
// on its target) sets `weavero.peopleToolbarButton` off; Settings brings it back.
// The pref is watched with the Researchers switch (people.ts
// `_wvPeopleWirePrefWatch`); both act in every main window, live.
//
// Undo: the wiring entry's own `unwire` (`_wvPpTbRemove`, ADR-0001), run by the
// table at a window's close and at a disable or reload. The button's listeners
// are on the button itself, so removing it removes them.
//
// Guard: test/people-toolbar-button.spec.js.

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvPopupHost } from "../lib/dom";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvMenuItem } from "../lib/menu";
import { wvMainWins, wvViewEls } from "../lib/windows";
import { WvOpenWhere } from "../lib/keys";
import { WV_PP_ICON_SOLID20 } from "./people";

declare const Zotero: any;

const BTN_ID = "wv-pp-tb-button";
const MENU_ID = "wv-pp-tb-menu";
const STYLE_ID = "wv-pp-tb-style";
/** A collapsed collections pane still lays its toolbar out (Zotero 11, measured
 *  2026-11-27: the button 28 px wide, `visibility: visible`, over the items
 *  toolbar's start): Zotero hides New Collection there, as it "may show on top of
 *  'New Item'" (_toolbar.scss); the button after it goes the same way. The pane's
 *  id reaches every library tab's (lib/style.ts wvViewIdsCss). */
const CSS = `#zotero-collections-pane[collapsed] #${BTN_ID} { visibility: hidden; }`;
const PREF = "weavero.peopleToolbarButton";
/** Weavero's Bookmarks button (bookmarks.ts BM_BTN_ID), the one this follows. */
const BM_BTN_ID = "wv-bookmarks-toolbar-button";

const live = (): any => wvLivePlugin();

class _PeopleToolbarMixin {
    [k: string]: any;

    /** Shown: the Researchers feature on and the button's own pref on. */
    _wvPpTbOn(): boolean {
        try { return this._wvPeopleOn() && this._wvPref("peopleToolbarButton"); } catch (e) { return false; }
    }

    /** Main window `win` (WV_MAIN_WIRES "people-toolbar-button", and every pref
     *  change): a button in each library view's collections toolbar, in its place
     *  -- or none, when off. Idempotent: a button of this instance in its place is
     *  left alone; one of another instance (its `data-wv-tag`) is built again. */
    _wvPpTbWire(win: any) {
        try {
            if (!win || win.closed || !win.document || this._wvDestroyed) return;
            if (!this._wvPpTbOn() || !win.Zotero_Tabs) { this._wvPpTbRemove(win); return; }
            const doc = win.document;
            const tag = this._wvWireTag();
            wvInjectStyle(doc, STYLE_ID, CSS);
            for (const bar of wvViewEls(doc, "zotero-collections-toolbar")) {
                if (!bar) continue;
                let btn: any = bar.querySelector(":scope > #" + BTN_ID);
                if (btn && btn.getAttribute("data-wv-tag") !== tag) { btn.remove(); btn = null; }
                if (!btn) btn = this._wvPpTbMake(win, tag);
                const anchor = bar.querySelector(":scope > #" + BM_BTN_ID)
                    || bar.querySelector(":scope > #zotero-tb-collection-add, :scope > .zotero-tb-collection-add");
                if (anchor) {
                    if (btn.parentNode !== bar || btn.previousElementSibling !== anchor) anchor.after(btn);
                }
                else if (btn.parentNode !== bar) {
                    const spacer = bar.querySelector(":scope > spacer");
                    if (spacer) bar.insertBefore(btn, spacer);
                    else bar.appendChild(btn);
                }
            }
        }
        catch (e) { Zotero.debug("[Weavero] researchers button err: " + e); }
    }

    /** The button, not yet placed. Its listeners resolve the live plugin when they
     *  fire; the element goes with the teardown (`_wvPpTbRemove`). */
    _wvPpTbMake(win: any, tag: string): any {
        const doc = win.document;
        const btn: any = doc.createXULElement("toolbarbutton");
        btn.id = BTN_ID;
        btn.setAttribute("class", "zotero-tb-button");
        btn.setAttribute("tabindex", "-1");
        btn.setAttribute("data-wv-tag", tag);
        const name = wvStr("weavero-people-tab-title", null, null);
        btn.setAttribute("tooltiptext", name);
        btn.setAttribute("aria-label", name);
        // The tab's person, filled, at the 20 px of Zotero's toolbar icons
        // (people.ts WV_PP_ICON_SOLID20), `context-fill` in the accent blue (the
        // tab icon's rule); the icon child inherits both.
        btn.style.setProperty("list-style-image", 'url("' + WV_PP_ICON_SOLID20 + '")');
        btn.style.setProperty("-moz-context-properties", "fill");
        btn.style.setProperty("fill", "var(--accent-blue, #1a73e8)");
        // The toolbar's 8-px rhythm (bookmarks.ts: Zotero's collections-toolbar
        // buttons carry no margin of their own).
        btn.style.setProperty("margin-inline-start", "8px");
        btn.addEventListener("command", (ev: any) => {
            try {
                const lp = live();
                if (!lp) return;
                const r = lp._wvPpTbCommand(win, btn, ev);
                if (r && typeof r.catch === "function") r.catch((e: any) => Zotero.debug("[Weavero] researchers button open err: " + e));
            }
            catch (e) { Zotero.debug("[Weavero] researchers button command err: " + e); }
        });
        // A middle click: no `command` on a toolbarbutton.
        btn.addEventListener("auxclick", (ev: any) => {
            try {
                if (ev.button !== 1) return;
                ev.preventDefault(); ev.stopPropagation();
                const lp = live();
                if (lp) lp._wvPpTbOpen(win, btn, "background");
            }
            catch (e) { Zotero.debug("[Weavero] researchers button middle click err: " + e); }
        });
        btn.addEventListener("contextmenu", (ev: any) => {
            try {
                ev.preventDefault(); ev.stopPropagation();
                const lp = live();
                if (lp) lp._wvPpTbMenu(win, ev);
            }
            catch (e) { Zotero.debug("[Weavero] researchers button menu err: " + e); }
        });
        return btn;
    }

    /** A command on the button: where it asks the tab to open (lib/keys.ts). */
    _wvPpTbCommand(win: any, btn: any, ev: any): Promise<any> | null {
        const where = this._wvOpenWhere(ev);
        if (!where) return null;
        return this._wvPpTbOpen(win, btn, where);
    }

    /** The window's Researchers tab, `where` says: "background" opened, not
     *  selected; "beside" next to the tab the button sits in, through the split
     *  view's own layout (open-where.ts `_wvOpenArrange`), when the split view is
     *  on; else -- "here", and "window": the tab has no window of its own -- opened
     *  or selected. */
    async _wvPpTbOpen(win: any, btn: any, where: WvOpenWhere): Promise<any> {
        try {
            if (!win || win.closed || !this._wvPeopleOn()) return null;
            if (where === "background") return this._wvPeopleTabOpen(win, { select: false });
            const Z = win.Zotero_Tabs;
            if (where === "beside" && Z && typeof this._wvTabSplitOn === "function" && this._wvTabSplitOn()) {
                const src = this._wvOpenSourceTab(win, btn) || Z.selectedID;
                const t = this._wvPeopleTabOpen(win, { select: false });
                if (t && src && src !== t.id) {
                    await this._wvOpenArrange(win, src, t.id, null, false);
                    return t;
                }
            }
            return this._wvPeopleTabOpen(win);
        }
        catch (e) { Zotero.debug("[Weavero] researchers button open err: " + e); return null; }
    }

    /** The right-click menu at the pointer: Hide Researchers Button. Rebuilt at
     *  each open; a menu of another instance (`data-wv-tag`) is replaced. */
    _wvPpTbMenu(win: any, ev: any): any {
        try {
            const doc = win && win.document;
            if (!doc) return null;
            const tag = this._wvWireTag();
            let pop: any = doc.getElementById(MENU_ID);
            if (pop && pop.getAttribute("data-wv-tag") !== tag) { pop.remove(); pop = null; }
            if (!pop) {
                pop = doc.createXULElement("menupopup");
                pop.id = MENU_ID;
                pop.setAttribute("data-wv-tag", tag);
                wvPopupHost(doc).appendChild(pop);
            }
            while (pop.firstChild) pop.firstChild.remove();
            wvMenuItem(doc, {
                l10n: { id: "weavero-people-tb-hide" },
                cls: "wv-pp-tb-hide",
                onCommand: () => { const lp = live(); if (lp) lp._wvPpTbHide(); },
            }, pop);
            pop.openPopupAtScreen(ev.screenX, ev.screenY, true);
            return pop;
        }
        catch (e) { Zotero.debug("[Weavero] researchers button menu err: " + e); return null; }
    }

    /** Hide Researchers Button: the pref off; its observer takes the button out of
     *  every main window. */
    _wvPpTbHide() {
        try { Zotero.Prefs.set(PREF, false); } catch (e) { Zotero.debug("[Weavero] researchers button hide err: " + e); }
    }

    /** Every main window again (the pref, the Researchers switch). */
    _wvPpTbApplyAll() {
        for (const w of wvMainWins()) this._wvPpTbWire(w);
    }

    /** `win` without the button (every library view's), its sheet and its menu:
     *  the wiring entry's undo, and the pref or the Researchers switch off. */
    _wvPpTbRemove(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            for (const b of Array.from(doc.querySelectorAll("#" + BTN_ID)) as any[]) b.remove();
            wvRemoveStyle(doc, STYLE_ID);
            const pop: any = doc.getElementById(MENU_ID);
            if (pop) {
                try { if (pop.state && pop.state !== "closed") pop.hidePopup(); } catch (e) {}
                pop.remove();
            }
        }
        catch (e) { Zotero.debug("[Weavero] researchers button remove err: " + e); }
    }
}

const _ptDescriptors = Object.getOwnPropertyDescriptors(_PeopleToolbarMixin.prototype);
delete (_ptDescriptors as any).constructor;
export const peopleToolbarMethods = _ptDescriptors;
