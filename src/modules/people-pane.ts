// The Researchers tab's right pane (MJT 2026-11-26, on peoplenet.14's page of
// Lohse: "Try making a right pane, similar to the right pane of the library, but
// in a compact way, to get a bit more details on researcher than what can be seen
// from the items list"), Zotero's library model:
//   - the left pane | the table | a splitter | the details pane; the splitter
//     resizes it (pointer drag) and collapses or opens it (its button, a
//     double-click), as Zotero's item pane; its width and state kept in
//     `weavero.people.pane` (JSON {w, c});
//   - one click (or the arrow keys) selects a row and shows it here, the table
//     stays; a double-click, Enter or the pane's Open opens the full page;
//   - several rows checked: "N researchers selected" and the bulk actions (as
//     Zotero's "N items selected"); nothing selected: a short hint;
//   - the pane's content is the page's VIEW mode at a narrow width -- the same
//     field renderer (people.ts _wvPeopleRenderFact in its view mode) and the
//     same header icons --: avatar, name, position · institution, the star, the
//     pencil, ⋮ and Open; the identifiers on one line of small links; ALL the
//     facts the page's Facts section shows, in the record's order (MJT
//     2026-11-27, 21:52; lib/people-record.ts WV_PP_FACTS_SHOWN: position,
//     institution, country, the PhD's institution, country, year and thesis, the
//     year of birth, the web pages), each only when it has a value, the labels'
//     column at most 40 % of the pane; the links (three names, then "N more");
//     what your libraries hold of them (how many items, the latest titles) and
//     the item they were added from. No source chip, no Add..., no family tree:
//     those stay on the page and in its edit mode.
// Per window: the view (people.ts) and the table (people-table.ts) are kept off
// the window; the DOM is the tab's own.
//
// Mixed onto WeaveroPlugin.prototype after people.ts (index.ts).

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl } from "../lib/dom";
import { WvPpRecord, WV_PP_FACTS_SHOWN, WV_PP_ID_KEYS, WV_PP_LINKS, WV_PP_SOURCES, WvPpSource, wvPpNameAs, wvPpShown } from "../lib/people-record";
import { wvPpInitials, wvPpLibStatOf } from "../lib/people-list";

declare const Zotero: any;

const live = (): any => wvLivePlugin();
const PREF_PANE = "weavero.people.pane";
const PANE_W = 320;
const PANE_MIN = 200;
/** A drag below this width collapses the pane (Zotero's item pane does the same). */
const PANE_COLLAPSE = 120;
const LINKS_SHOWN = 3;
const ITEMS_SHOWN = 3;

/** The pane's width (px, null: the default) and whether it is collapsed. */
export function wvPpPaneParse(json: any): { w: number | null; c: boolean } {
    let o: any = null;
    try { o = typeof json === "string" ? JSON.parse(json || "{}") : json; } catch (e) { o = null; }
    const w = o && typeof o.w === "number" && isFinite(o.w) && o.w >= PANE_MIN ? Math.round(o.w) : null;
    return { w, c: !!(o && o.c === true) };
}

export const WV_PP_PANE_CSS = `
.wv-pp-splitter { flex: none; position: relative; width: 6px; cursor: col-resize; touch-action: none;
  border-inline-start: 1px solid var(--color-panedivider, rgba(127,127,127,.3)); }
.wv-pp-splitter:hover, .wv-pp-splitter[data-wv-pp-drag] { background: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-splitter > button { position: absolute; top: 8px; inset-inline-start: -9px; z-index: 2; appearance: none; width: 18px; height: 22px; margin: 0; padding: 0;
  border-radius: 5px; border: 1px solid var(--color-panedivider, rgba(127,127,127,.4)); background: var(--material-background, Canvas);
  color: var(--fill-secondary, GrayText); font: message-box; font-size: 11px; line-height: 1; cursor: default; }
.wv-pp-splitter > button:hover { color: var(--fill-primary, CanvasText); }
.wv-pp-pane { flex: 0 0 ${PANE_W}px; min-width: ${PANE_MIN}px; max-width: 60%; min-height: 0; overflow: auto; box-sizing: border-box; padding: 10px 12px 16px;
  background: var(--material-sidepane, var(--material-background, Canvas)); container-type: inline-size; }
.wv-pp-root[data-wv-pp-pane-collapsed="true"] > .wv-pp-pane { display: none; }
.wv-pp-pane .wv-pp-head { flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.wv-pp-pane .wv-pp-name { font-size: 1.15em; }
.wv-pp-pane .wv-pp-actions { margin-inline-start: 0; flex: 1 1 100%; }
.wv-pp-pane .wv-pp-sec { margin-top: 10px; }
.wv-pp-pane .wv-pp-sectitle { font-size: 0.92em; margin-bottom: 3px; padding-bottom: 0; color: var(--fill-secondary, GrayText); border-bottom: none; }
/* The labels' column at most 40 % of the pane, a long label wrapping ("PhD institution"), so the values keep the
   rest at the pane's 200-px floor too (all the facts since 2026-11-27); the values wrap anywhere already. */
.wv-pp-pane .wv-pp-facts { row-gap: 1px; column-gap: 10px; grid-template-columns: fit-content(40%) minmax(0, 1fr); }
.wv-pp-pane .wv-pp-flabel { padding-top: 0; overflow-wrap: anywhere; }
.wv-pp-pane .wv-pp-fvals { gap: 0; }
.wv-pp-pane .wv-pp-val { padding: 0; background: transparent; border: none; border-radius: 0; }
.wv-pp-paneids { display: flex; flex-wrap: wrap; gap: 2px 6px; margin-top: 8px; font-size: 0.92em; }
.wv-pp-paneids > .wv-pp-evlink { margin-inline-start: 0; }
.wv-pp-more { font-size: 0.92em; color: var(--fill-secondary, GrayText); }
.wv-pp-pane-item { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wv-pp-pane-hint, .wv-pp-pane-count { color: var(--fill-secondary, GrayText); padding: 24px 4px 8px; text-align: center; }
.wv-pp-pane-count { color: var(--fill-primary, CanvasText); font-weight: 600; }
.wv-pp-pane-bulk { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
`;

class _PeoplePaneMixin {
    [k: string]: any;

    _wvPeoplePanePrefs(): { w: number | null; c: boolean } {
        try { return wvPpPaneParse(String(Zotero.Prefs.get(PREF_PANE) || "{}")); } catch (e) { return { w: null, c: false }; }
    }

    _wvPeoplePaneSave(o: { w: number | null; c: boolean }) {
        const out: any = {};
        if (o.w) out.w = Math.round(o.w);
        if (o.c) out.c = true;
        try { Zotero.Prefs.set(PREF_PANE, JSON.stringify(out)); } catch (e) {}
    }

    /** The splitter and the pane, at the end of the tab's root (people.ts
     *  _wvPeopleTabRender, the table's views only). */
    _wvPeopleRenderPaneBox(win: any, root: any, v: any) {
        const doc = win.document;
        const pr = this._wvPeoplePanePrefs();
        if (pr.c) root.setAttribute("data-wv-pp-pane-collapsed", "true");
        else root.removeAttribute("data-wv-pp-pane-collapsed");
        const sp = wvHtmlEl(doc, "div", "wv-pp-splitter", undefined, root);
        sp.setAttribute("role", "separator");
        sp.setAttribute("aria-orientation", "vertical");
        const tb = wvHtmlEl(doc, "button", undefined, pr.c ? "‹" : "›", sp);
        tb.setAttribute("type", "button");
        tb.setAttribute("data-wv-pp-act", "pane-toggle");
        const tip = wvStr("weavero-people-pane-toggle", { state: pr.c ? "closed" : "open" }, null);
        tb.setAttribute("title", tip);
        tb.setAttribute("aria-label", tip);
        tb.setAttribute("aria-expanded", pr.c ? "false" : "true");
        tb.addEventListener("click", (e: any) => { try { e.stopPropagation(); } catch (er) {} const lp: any = live(); if (lp) lp._wvPeoplePaneToggle(win); });
        tb.addEventListener("pointerdown", (e: any) => { try { e.stopPropagation(); } catch (er) {} });
        const pane = wvHtmlEl(doc, "div", "wv-pp-pane", undefined, root);
        if (pr.w) pane.style.flex = "0 0 " + pr.w + "px";
        this._wvPeoplePaneWire(win, root, sp, pane);
        this._wvPeoplePaneFill(win);
    }

    /** The splitter's drag: the pane's width follows the pointer (between its
     *  floor and 60 % of the tab); dropped under PANE_COLLAPSE it collapses; a
     *  drag on a collapsed pane opens it. Kept at the release. A double-click
     *  collapses or opens it. */
    _wvPeoplePaneWire(win: any, root: any, sp: any, pane: any) {
        let drag: { id: number; w: number } | null = null;
        const widthAt = (x: number) => {
            const r = root.getBoundingClientRect();
            return Math.round(r.right - x);
        };
        sp.addEventListener("pointerdown", (e: any) => {
            if (e.button !== 0) return;
            try { sp.setPointerCapture(e.pointerId); } catch (er) {}
            drag = { id: e.pointerId, w: widthAt(e.clientX) };
            sp.setAttribute("data-wv-pp-drag", "true");
            e.preventDefault();
        });
        sp.addEventListener("pointermove", (e: any) => {
            if (!drag || e.pointerId !== drag.id) return;
            const max = Math.max(PANE_MIN, root.getBoundingClientRect().width * 0.6);
            const w = widthAt(e.clientX);
            drag.w = w;
            if (w < PANE_COLLAPSE) return;
            if (root.getAttribute("data-wv-pp-pane-collapsed") === "true") root.removeAttribute("data-wv-pp-pane-collapsed");
            pane.style.flex = "0 0 " + Math.min(max, Math.max(PANE_MIN, w)) + "px";
        });
        const end = (e: any) => {
            if (!drag || e.pointerId !== drag.id) return;
            const w = drag.w;
            drag = null;
            sp.removeAttribute("data-wv-pp-drag");
            try { sp.releasePointerCapture(e.pointerId); } catch (er) {}
            const lp: any = live();
            if (!lp) return;
            const max = Math.max(PANE_MIN, root.getBoundingClientRect().width * 0.6);
            if (w < PANE_COLLAPSE) { lp._wvPeoplePaneToggle(win, true); return; }
            lp._wvPeoplePaneSave({ w: Math.min(max, Math.max(PANE_MIN, w)), c: false });
        };
        sp.addEventListener("pointerup", end);
        sp.addEventListener("pointercancel", end);
        sp.addEventListener("dblclick", () => { const lp: any = live(); if (lp) lp._wvPeoplePaneToggle(win); });
    }

    /** The pane collapsed (`collapsed` true), opened (false) or the other way
     *  (omitted); kept; the tab drawn again. */
    _wvPeoplePaneToggle(win: any, collapsed?: boolean) {
        const pr = this._wvPeoplePanePrefs();
        pr.c = typeof collapsed === "boolean" ? collapsed : !pr.c;
        this._wvPeoplePaneSave(pr);
        this._wvPeopleTabRender(win);
    }

    /** The pane's content, as the view and the table say: several checked, one
     *  researcher, or none. */
    _wvPeoplePaneFill(win: any) {
        try {
            const r = this._wvPeopleRootOf(win);
            const pane = r && r.querySelector(".wv-pp-pane");
            const v = this._wvPeopleViewOf(win);
            if (!pane || !v) return;
            const doc = win.document;
            pane.textContent = "";
            pane.removeAttribute("data-wv-pp-person");
            const checked: Set<string> = v.checked || new Set();
            if (checked.size > 1) {
                pane.setAttribute("data-wv-pp-pane", "many");
                wvHtmlEl(doc, "div", "wv-pp-pane-count", wvStr("weavero-people-pane-count", { count: checked.size }, null), pane);
                const bulk = wvHtmlEl(doc, "div", "wv-pp-pane-bulk", undefined, pane);
                this._wvPeopleBulkButtons(win, bulk, v);
                return;
            }
            const id = checked.size === 1 ? Array.from(checked)[0] : v.paneSel;
            const rec: WvPpRecord | null = id ? this._wvPeopleGetRec(id) : null;
            if (!rec) {
                pane.setAttribute("data-wv-pp-pane", "none");
                wvHtmlEl(doc, "div", "wv-pp-pane-hint", wvStr("weavero-people-pane-none", null, null), pane);
                return;
            }
            pane.setAttribute("data-wv-pp-pane", "person");
            pane.setAttribute("data-wv-pp-person", rec.id);
            this._wvPeoplePaneRecord(win, pane, rec, v);
        }
        catch (e) { Zotero.debug("[Weavero] people pane err: " + e); }
    }

    /** One researcher in the pane: the page's view mode, narrow. */
    _wvPeoplePaneRecord(win: any, pane: any, rec: WvPpRecord, v: any) {
        const doc = win.document;
        const P: any = this;
        const head = wvHtmlEl(doc, "div", "wv-pp-head", undefined, pane);
        const av = wvHtmlEl(doc, "span", "wv-pp-avatar wv-pp-havatar", wvPpInitials(rec.last, rec.first), head);
        av.setAttribute("aria-hidden", "true");
        av.style.setProperty("--wv-pp-hue", String(this._wvPeopleHue(rec.last + " " + rec.first)));
        wvHtmlEl(doc, "span", "wv-pp-name", wvPpNameAs(rec, this._wvPeopleNameOrder("title")) || rec.last, head);
        const sub = [wvPpShown(rec, "position")[0], wvPpShown(rec, "institution")[0]].filter(Boolean).map((s: any) => String(s.value || "")).filter(Boolean);
        if (sub.length) wvHtmlEl(doc, "div", "wv-pp-hsub", sub.join(" · "), pane);
        // The page's header icons, and Open.
        const acts = wvHtmlEl(doc, "div", "wv-pp-actions", undefined, pane);
        const busy = !!(P._wvPeopleBusy && P._wvPeopleBusy.has(rec.id));
        this._wvPeopleHeadIcons(win, acts, rec, busy, () => { const lp: any = live(); if (lp) lp._wvPeopleTableOpen(win, rec.id, true); });
        const open = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-pane-open", null, null), acts);
        open.setAttribute("type", "button");
        open.setAttribute("data-wv-pp-act", "pane-open");
        open.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleTableOpen(win, rec.id, false); });
        // The identifiers, one line of small links.
        const ids = wvHtmlEl(doc, "div", "wv-pp-paneids", undefined, pane);
        ids.setAttribute("data-wv-pp-ids", "true");
        for (const k of WV_PP_ID_KEYS) {
            const s = wvPpShown(rec, k)[0];
            if (!s) continue;
            const url = this._wvPeopleIdWeb(k, String(s.value));
            const a = wvHtmlEl(doc, "span", "wv-pp-evlink", WV_PP_SOURCES[k as WvPpSource] ? WV_PP_SOURCES[k as WvPpSource].name : k, ids);
            a.setAttribute("data-wv-pp-id", k);
            a.setAttribute("title", url ? url : String(s.value));
            if (url) {
                a.setAttribute("role", "link");
                a.setAttribute("tabindex", "0");
                a.setAttribute("data-wv-url", url);
                a.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(url); });
            }
        }
        if (!ids.firstChild) ids.remove();
        // The facts and the links: the page's view-mode renderer (people.ts).
        const view = Object.assign({}, v, { pageEdit: false, editing: null, evForm: null });
        const facts = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, pane);
        facts.setAttribute("data-wv-pp-sec", "facts");
        const fg = wvHtmlEl(doc, "div", "wv-pp-facts", undefined, facts);
        // Every fact of the page's Facts section, as its view mode: none without a value.
        for (const f of WV_PP_FACTS_SHOWN) this._wvPeopleRenderFact(win, fg, rec, view, f);
        if (!fg.firstChild) facts.remove();
        // The tags, as the page's view mode shows them (people-tags.ts).
        this._wvPeopleTagPaneChips(win, pane, rec);
        const links = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, pane);
        links.setAttribute("data-wv-pp-sec", "links");
        wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr("weavero-people-sec-links", null, null), links);
        const lg = wvHtmlEl(doc, "div", "wv-pp-facts", undefined, links);
        for (const f of WV_PP_LINKS) this._wvPeopleRenderFact(win, lg, rec, view, f, { limit: LINKS_SHOWN });
        if (!lg.firstChild) links.remove();
        // What your libraries hold of them.
        const lib = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, pane);
        lib.setAttribute("data-wv-pp-libitems", "true");
        const stats = this._wvPeopleLibStats();
        const st = stats && stats.get(rec.id);
        wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr("weavero-people-dupe-items", { count: st ? st.n : 0 }, null), lib);
        const ix = P._wvPpLibIx && P._wvPpLibIx.ix;
        if (ix && st && st.n) {
            let items: any[] = [];
            try { items = (wvPpLibStatOf(rec, ix).items || []).map((i: number) => Zotero.Items.get(i)).filter(Boolean); } catch (e) {}
            const dateOf = (it: any) => { try { return String(Zotero.Date.multipartToSQL(it.getField("date", true, true)) || ""); } catch (e) { return ""; } };
            items.sort((a, b) => (dateOf(b) < dateOf(a) ? -1 : dateOf(b) > dateOf(a) ? 1 : 0));
            for (const it of items.slice(0, ITEMS_SHOWN)) {
                const t = wvHtmlEl(doc, "span", "wv-pp-evlink wv-pp-pane-item", String(it.getDisplayTitle() || ""), lib);
                const libPath = it.libraryID === Zotero.Libraries.userLibraryID ? "library" : "groups/" + Zotero.Groups.getGroupIDFromLibraryID(it.libraryID);
                const url = "zotero://select/" + libPath + "/items/" + it.key;
                t.setAttribute("role", "link");
                t.setAttribute("tabindex", "0");
                t.setAttribute("data-wv-url", url);
                t.setAttribute("title", url);
                t.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(url); });
            }
        }
        if (rec.from) {
            const f = wvHtmlEl(doc, "div", "wv-pp-sub", wvStr("weavero-people-added-from", { title: rec.from.title || rec.from.key }, null), pane);
            f.setAttribute("data-wv-pp-from", rec.from.key);
        }
    }
}

const _paneDescriptors = Object.getOwnPropertyDescriptors(_PeoplePaneMixin.prototype);
delete (_paneDescriptors as any).constructor;
export const peoplePaneMethods = _paneDescriptors;
