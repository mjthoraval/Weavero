// The researchers strip (branch peoplenet, plan approved by MJT 2026-11-25:
// "I also want to get the researchers to appear at the top of a search results
// in the items list, when searching on an author name"; design work/people-
// genealogy-ui-survey-2026-11-25.md, part B, P1): a slim band between the items
// toolbar and the items list, before Weavero's filter bar in the same container,
// while the quick search names a researcher -- one of Researchers' followed or
// To check people, or a library author the Academic Family Tree extract
// confirms (tiers A and B) --, up to 3 of them. Each: initials, name,
// institution, PhD year, "N items here · M in these results", Only Theirs
// (Weavero's Authors filter on their usual spelling). A close button hides it
// for this search; Down from the search box reaches it, Esc closes it.
//
// Per main window (hard invariant): the search, the matches and the dismissed
// search are that window's (a WeakMap keyed by the window, nothing on it); the
// update runs for an explicit window, after that window's own search has
// settled (filter.ts's setFilter and collection-switch wraps call _wvPsSoon
// with it). Not in a feed or the trash. Reads only: nothing is written to any
// library (Only Theirs is view state).
// Matching: lib/people-strip.ts.

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl } from "../lib/dom";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvListen } from "../lib/listen";
import { wvAccelAny } from "../lib/keys";
import { wvMainWins, wvViewEl } from "../lib/windows";
import { WvPpRecord, wvPpFold, wvPpNameAs, wvPpNameForms, wvPpShown, wvPpSplitName } from "../lib/people-record";
import { WvPpLibIndex, wvPpLibCreatorsOf, wvPpLibStatOf } from "../lib/people-list";
import { WvPsPerson, wvPsMatch, wvPsQueryWords, WV_PS_MIN } from "../lib/people-strip";
import { WvAftSource } from "../lib/people-aft";

declare const Zotero: any;

const STRIP_ID = "wv-pp-strip";
const STYLE_ID = "wv-pp-strip-style";
const KEY_DOWN = "lazy:people-strip-key";
const SOON_MS = 150;
const MAX_SHOWN = 3;

const CSS = `
#${STRIP_ID} { display: flex; align-items: flex-start; gap: 6px; padding: 4px 6px 4px 8px; min-width: 0; box-sizing: border-box;
  border-bottom: 1px solid var(--material-panedivider, rgba(127,127,127,.3)); background: var(--material-sidepane, var(--material-background, Canvas));
  color: var(--fill-primary, CanvasText); font: message-box; font-size: 12px; }
#${STRIP_ID}[hidden] { display: none; }
#${STRIP_ID} .wv-ps-rows { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
#${STRIP_ID} .wv-ps-row { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; row-gap: 0; }
#${STRIP_ID} .wv-ps-av { flex: none; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 9.5px; font-weight: 600; background: var(--fill-quinary, rgba(127,127,127,.2)); }
#${STRIP_ID} .wv-ps-name { font-weight: 600; white-space: nowrap; }
#${STRIP_ID} .wv-ps-name[role="link"] { cursor: pointer; }
#${STRIP_ID} .wv-ps-name[role="link"]:hover { text-decoration: underline; }
#${STRIP_ID} .wv-ps-meta, #${STRIP_ID} .wv-ps-counts { color: var(--fill-secondary, GrayText); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${STRIP_ID} .wv-ps-meta[data-tree="true"] { font-style: italic; }
#${STRIP_ID} .wv-ps-aft { font-size: 10.5px; color: var(--wv-link-http, LinkText); cursor: pointer; white-space: nowrap; }
#${STRIP_ID} .wv-ps-aft:hover { text-decoration: underline; }
#${STRIP_ID} .wv-ps-only { margin: 0 0 0 auto; padding: 0 8px; font: inherit; font-size: 11px; }
#${STRIP_ID} .wv-ps-close { flex: none; appearance: none; margin: 0; padding: 0; width: 20px; height: 20px; border: none; border-radius: 4px;
  background: transparent; color: var(--fill-secondary, GrayText); font: inherit; font-size: 14px; line-height: 20px; cursor: pointer; }
#${STRIP_ID} .wv-ps-close:hover { background: var(--fill-quinary, rgba(127,127,127,.2)); }
#${STRIP_ID} :focus-visible { outline: 2px solid var(--color-focus-outline, var(--accent-blue, #4072e5)); outline-offset: 1px; }
`;

/** One window's strip: the search it was drawn for, the search the user
 *  closed it on, what it shows, its pending update. */
interface WvPsState {
    q: string;
    dismissed: string | null;
    hits: Array<{ key: string; form: string }>;
    t: any;
    seq: number;
}
const states = new WeakMap<any, WvPsState>();
const stateOf = (win: any): WvPsState => {
    let s = states.get(win);
    if (!s) { s = { q: "", dismissed: null, hits: [], t: null, seq: 0 }; states.set(win, s); }
    return s;
};
const live = () => wvLivePlugin();
const initialsOf = (last: string, first: string): string => {
    const f = wvPpFold(first).split(" ").filter(Boolean)[0] || "";
    const l = wvPpFold(last).split(" ").filter(Boolean).pop() || "";
    return ((f ? f[0] : "") + (l ? l[0] : "")).toUpperCase() || "?";
};
const yearOf = (v: any): string => { const m = /\d{4}/.exec(String(v || "")); return m ? m[0] : ""; };

class _PeopleStripMixin {
    [k: string]: any;

    /** `win`'s search settled (filter.ts): its strip a moment later, once. */
    _wvPsSoon(win: any) {
        try {
            if (!win || win.closed) return;
            const st = stateOf(win);
            wvClearTimeout(st.t);
            st.t = wvTimeout(() => {
                st.t = null;
                const lp: any = live();
                if (lp && !win.closed) lp._wvPsUpdate(win).catch((e: any) => Zotero.debug("[Weavero] people strip err: " + e));
            }, SOON_MS);
        } catch (e) {}
    }

    /** The view of `win` may show a strip: not a feed, nor the trash. */
    _wvPsViewAllowed(win: any): boolean {
        try {
            const ZP = win && win.ZoteroPane;
            if (!ZP) return false;
            const rows: any[] = typeof ZP.getCollectionTreeRows === "function" ? ZP.getCollectionTreeRows() : [ZP.getCollectionTreeRow()];
            if (!rows.length || !rows[0]) return false;
            const is = (r: any, m: string) => typeof r[m] === "function" && !!r[m]();
            return !rows.some((r: any) => r && (is(r, "isFeedsOrFeed") || is(r, "isFeed") || is(r, "isFeeds") || is(r, "isTrash")));
        } catch (e) { return false; }
    }

    /** The search of `win`'s library view on screen, as typed. */
    _wvPsQuery(win: any): string {
        try { const sb: any = wvViewEl(win.document, "zotero-tb-search"); return sb && sb.value ? String(sb.value) : ""; } catch (e) { return ""; }
    }

    /** Who can be named: Researchers' followed and To check people (with their
     *  other forms of the name), and the confirmed library authors of the
     *  extract that are no record's. */
    _wvPsPeople(src: WvAftSource | null): { people: WvPsPerson[]; recs: Map<string, WvPpRecord>; pidOf: Map<string, string> } {
        const recs = new Map<string, WvPpRecord>();
        const pidOf = new Map<string, string>();
        const people: WvPsPerson[] = [];
        const all = this._wvPeopleAllSync() as WvPpRecord[];
        const pidRec = new Map<string, WvPpRecord>();
        if (src) {
            for (const r of all) {
                const pid = this._wvLtPidOfRec(r, src);
                if (pid && !pidRec.has(pid)) { pidRec.set(pid, r); pidOf.set(r.id, pid); }
            }
        }
        const addRec = (r: WvPpRecord) => {
            const key = "r:" + r.id;
            if (recs.has(key)) return;
            recs.set(key, r);
            people.push({ key, last: r.last, first: r.first, forms: wvPpNameForms(r).map(wvPpSplitName) });
        };
        for (const r of all) if (r.followed || r.check) addRec(r);
        if (src) {
            const seen = new Set<string>();
            for (const u of src.units()) {
                if (seen.has(u.pid)) continue;
                seen.add(u.pid);
                const r = pidRec.get(u.pid);
                if (r) { addRec(r); continue; }
                const p = src.person(u.pid);
                if (p) people.push({ key: "a:" + u.pid, last: p.last, first: p.first });
            }
        }
        return { people, recs, pidOf };
    }

    /** The items `win`'s list shows now (through Weavero's filter, as a chip counts). */
    _wvPsShownIDs(win: any): Set<number> {
        const out = new Set<number>();
        try {
            const iv = win.ZoteroPane && win.ZoteroPane.itemsView;
            const rp = iv && iv.rowProvider && typeof iv.rowProvider.getRowCount === "function" ? iv.rowProvider : iv;
            if (!rp) return out;
            const n = typeof rp.getRowCount === "function" ? rp.getRowCount() : Number(iv.rowCount) || 0;
            for (let i = 0; i < n && i < 100000; i++) {
                const row = rp.getRow(i);
                const id = row && row.ref && row.ref.id;
                if (id) out.add(Number(id));
            }
        } catch (e) {}
        return out;
    }

    /** Draw (or take away) `win`'s strip for the search in its box. */
    async _wvPsUpdate(win: any): Promise<void> {
        const P: any = this;
        if (!win || win.closed || !win.document) return;
        const st = stateOf(win);
        const seq = ++st.seq;
        const q = this._wvPsQuery(win);
        const words = wvPsQueryWords(q);
        const fq = words.join(" ");
        const off = !this._wvPeopleOn() || !words.some((w) => w.length >= WV_PS_MIN) || !this._wvPsViewAllowed(win);
        if (st.dismissed != null && st.dismissed !== fq) st.dismissed = null;
        if (off || st.dismissed === fq) { this._wvPsRemove(win); st.q = fq; st.hits = []; return; }
        await this._wvPeopleLoad();
        const src: WvAftSource | null = await this._wvAftLoad();
        // The library index read again when items changed since (people.ts
        // rebuilds it on its own only while a People tab is open).
        const ix: WvPpLibIndex | null = P._wvPpLibIx && !P._wvPpLibStale ? P._wvPpLibIx.ix : await this._wvPeopleLibIndexBuild();
        if (P._wvDestroyed || win.closed || seq !== st.seq) return;
        // Another search arrived meanwhile: its own update draws it.
        if (wvPsQueryWords(this._wvPsQuery(win)).join(" ") !== fq) return;
        const { people, recs, pidOf } = this._wvPsPeople(src);
        const hits = wvPsMatch(words, people, MAX_SHOWN);
        if (!hits.length) { this._wvPsRemove(win); st.q = fq; st.hits = []; return; }
        let libID: number | null = null;
        try { libID = win.ZoteroPane.getSelectedLibraryID(); } catch (e) {}
        const shown = this._wvPsShownIDs(win);
        const order = this._wvPeopleNameOrder("list");
        const rows = hits.map((h, i) => {
            const rec = recs.get(h.key) || null;
            const pid = rec ? pidOf.get(rec.id) || null : h.key.slice(2);
            const ap = pid && src ? src.person(pid) : null;
            const who: any = rec || { last: h.person.last, first: h.person.first };
            const stat = ix ? wvPpLibStatOf(who, ix) : { n: 0, thesis: 0, items: [] as number[] };
            const items = (stat.items || []).filter((id) => {
                if (libID == null) return true;
                try { const it = Zotero.Items.get(id); return !!it && it.libraryID === libID; } catch (e) { return false; }
            });
            const inShown = items.filter((id) => shown.has(id)).length;
            const recInst = rec ? ((wvPpShown(rec, "institution")[0] || {} as any).value || "") : "";
            const inst = recInst || (ap ? ap.inst : "");
            let year = rec ? yearOf((wvPpShown(rec, "phd.year")[0] || {} as any).value) : "";
            if (!year && pid && src) {
                const l = src.mentors(pid).filter((x) => x.type === "phd" && x.year).sort((a, b) => (a.year as number) - (b.year as number))[0];
                if (l) year = String(l.year);
            }
            return { i, key: h.key, level: h.level, rec, pid, ap, name: wvPpNameAs(who, order) || who.last, initials: initialsOf(who.last, who.first),
                inst, instTree: !recInst && !!(ap && ap.inst), year, here: items.length, shown: inShown, form: ix ? this._wvPsUsualForm(who, ix, items) : "" };
        });
        // Exact before likely (the matcher's order), then by items in these results, then here.
        rows.sort((a, b) => ((a.level === "exact" ? 0 : 1) - (b.level === "exact" ? 0 : 1)) || (b.shown - a.shown) || (b.here - a.here) || (a.i - b.i));
        const top = rows.slice(0, MAX_SHOWN);
        st.q = fq;
        st.hits = top.map((r) => ({ key: r.key, form: r.form }));
        this._wvPsRender(win, fq, top, src);
    }

    /** How the library writes the person most often, "First Last" as the
     *  Authors filter matches it (filter.ts _getItemAuthors): the spelling on
     *  most of `items`. */
    _wvPsUsualForm(who: any, ix: WvPpLibIndex, items: number[]): string {
        const want = new Set(items);
        const cids = wvPpLibCreatorsOf(who, ix);
        let best = "", bestN = -1;
        const byCid = new Map<number, { last: string; first: string }>();
        for (const list of ix.byLast.values()) for (const c of list) if (cids.includes(c.cid)) byCid.set(c.cid, c);
        for (const cid of cids) {
            const n = (ix.items.get(cid) || []).filter((p) => p[1] && want.has(p[0])).length;
            const c = byCid.get(cid);
            if (!c) continue;
            const form = (String(c.first || "") + " " + String(c.last || "")).trim();
            if (form && n > bestN) { best = form; bestN = n; }
        }
        return best || (String(who.first || "") + " " + String(who.last || "")).trim();
    }

    /** The strip of `win` with `rows`, in the library view on screen, before
     *  Weavero's filter bar. */
    _wvPsRender(win: any, fq: string, rows: any[], src: WvAftSource | null) {
        const doc = win.document;
        const container = wvViewEl(doc, "zotero-items-pane-container");
        const itemsPane = wvViewEl(doc, "zotero-items-pane");
        if (!container || !itemsPane) return;
        wvInjectStyle(doc, STYLE_ID, CSS);
        let strip = doc.getElementById(STRIP_ID);
        const hadFocus = !!(strip && strip.contains(doc.activeElement));
        if (strip) strip.remove();
        strip = wvHtmlEl(doc, "div", "wv-ps-strip");
        strip.id = STRIP_ID;
        strip.setAttribute("role", "region");
        strip.setAttribute("aria-live", "polite");
        strip.setAttribute("aria-label", wvStr("weavero-people-strip-label", null, null));
        strip.setAttribute("data-wv-ps-query", fq);
        strip.setAttribute("data-wv-tag", (this as any)._wvWireTag());
        const bar = doc.getElementById("wv-filter-bar");
        container.insertBefore(strip, bar && bar.parentNode === container ? bar : itemsPane);
        const list = wvHtmlEl(doc, "div", "wv-ps-rows", undefined, strip);
        for (const r of rows) {
            const row = wvHtmlEl(doc, "div", "wv-ps-row", undefined, list);
            row.setAttribute("data-wv-ps-key", r.key);
            row.setAttribute("data-wv-ps-level", r.level);
            if (r.pid) row.setAttribute("data-aft-pid", r.pid);
            wvHtmlEl(doc, "span", "wv-ps-av", r.initials, row).setAttribute("aria-hidden", "true");
            const nm = wvHtmlEl(doc, "span", "wv-ps-name", r.name, row);
            if (r.rec) {
                const id = r.rec.id;
                nm.setAttribute("role", "link");
                nm.setAttribute("tabindex", "0");
                nm.setAttribute("title", wvStr("weavero-people-strip-open-tip", null, null));
                const open = () => { const lp: any = live(); if (lp) lp._wvPeopleTabOpen(win, { personID: id }); };
                nm.addEventListener("click", open);
                nm.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
            }
            const meta = [r.inst, r.year ? wvStr("weavero-people-lt-phd", { year: r.year }, null) : ""].filter(Boolean).join(" · ");
            if (meta) {
                const m = wvHtmlEl(doc, "span", "wv-ps-meta", meta, row);
                if (r.instTree && src) {
                    m.setAttribute("data-tree", "true");
                    m.setAttribute("title", r.inst + " — " + wvStr("weavero-people-lt-tree-inst", { source: src.info.name }, null));
                }
                else m.setAttribute("title", meta);
            }
            wvHtmlEl(doc, "span", "wv-ps-counts", wvStr("weavero-people-strip-counts", { here: r.here, shown: r.shown }, null), row)
                .setAttribute("data-wv-ps-counts", r.here + "/" + r.shown);
            if (r.pid && src && (!r.rec || r.instTree)) {
                const url = src.pageUrl(r.pid);
                const a = wvHtmlEl(doc, "span", "wv-ps-aft", src.info.name + " (" + src.info.licence + ")", row);
                a.setAttribute("role", "link");
                a.setAttribute("tabindex", "0");
                a.setAttribute("data-url", url);
                a.setAttribute("title", wvStr("weavero-people-lt-aft-tip", { source: src.info.name, licence: src.info.licence }, null));
                const go = () => { const lp: any = live(); if (lp) lp._launchURL(url); };
                a.addEventListener("click", go);
                a.addEventListener("keydown", (e: any) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
            }
            const only = wvHtmlEl(doc, "button", "wv-ps-only", wvStr("weavero-people-strip-only", null, null), row);
            only.setAttribute("type", "button");
            only.setAttribute("title", wvStr("weavero-people-strip-only-tip", { form: r.form }, null));
            only.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPsOnlyTheirs(win, r.key); });
        }
        const close = wvHtmlEl(doc, "button", "wv-ps-close", "×", strip);
        close.setAttribute("type", "button");
        const tip = wvStr("weavero-people-strip-close", null, null);
        close.setAttribute("title", tip);
        close.setAttribute("aria-label", tip);
        close.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPsDismiss(win, true); });
        strip.addEventListener("keydown", (e: any) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            const lp: any = live();
            if (lp) lp._wvPsDismiss(win, true);
        });
        if (hadFocus) { try { (strip.querySelector("[tabindex='0'], button") as any).focus(); } catch (e) {} }
        this._wvPsWireKeys(win);
    }

    /** Down in the search box (Zotero 11's completion list closed: it takes
     *  the arrows while open, queryTextbox.js) moves into the strip: Zotero's
     *  Tab map skips anything between the toolbar and the list (libraryView.js
     *  1709-1719). Keyed on the view's text box, wired at the first strip. */
    _wvPsWireKeys(win: any) {
        try {
            const tb = wvViewEl(win.document, "zotero-tb-search-textbox");
            if (!tb) return;
            wvListen(tb, KEY_DOWN, "keydown", (e: any) => {
                try {
                    if (e.key !== "ArrowDown" || e.defaultPrevented || e.altKey || wvAccelAny(e) || e.shiftKey) return;
                    const strip = win.document.getElementById(STRIP_ID);
                    if (!strip || strip.hidden) return;
                    const first = strip.querySelector(".wv-ps-name[tabindex='0'], .wv-ps-only");
                    if (!first) return;
                    // Handled here, and nowhere else: Zotero's items-toolbar key map
                    // (zoteroPane.js moveFocusForActionsMap, verticalArrowIsTab)
                    // reads a Down whose original target is not an <input> as Tab
                    // and took the focus on to the Advanced Search button (probe
                    // 2026-11-25, Zotero 10 and 11).
                    e.preventDefault();
                    e.stopPropagation();
                    first.focus();
                } catch (er) {}
            }, false, (this as any)._wvWireTag());
        } catch (e) {}
    }

    /** Close `win`'s strip for the search it shows; the next search brings it back. */
    _wvPsDismiss(win: any, focusSearch?: boolean) {
        const st = stateOf(win);
        st.dismissed = st.q;
        const strip = win.document.getElementById(STRIP_ID);
        const had = !!(strip && strip.contains(win.document.activeElement));
        this._wvPsRemove(win);
        if (focusSearch || had) {
            try { const sb: any = wvViewEl(win.document, "zotero-tb-search"); if (sb) sb.focus(); } catch (e) {}
        }
    }

    _wvPsRemove(win: any) {
        try { const s = win.document.getElementById(STRIP_ID); if (s) s.remove(); } catch (e) {}
    }

    /** Only Theirs: Weavero's Authors filter, in `win`, on the spelling the
     *  library uses most for that person (the filter matches an author's "First
     *  Last" exactly; several picks are ALL of them, so one spelling). The
     *  search stays as typed. */
    _wvPsOnlyTheirs(win: any, key: string): boolean {
        const st = stateOf(win);
        const h = st.hits.find((x) => x.key === key);
        if (!h || !h.form) return false;
        const P: any = this;
        let done = false;
        P._wvWithFilterWin(win, () => {
            const g = P._activeGroup();
            if (!g) return;
            const sel = new Set<string>(g.annotationAuthor || []);
            sel.add(h.form);
            g.annotationAuthor = [...sel];
            g.annotationAuthorExclude = (g.annotationAuthorExclude || []).filter((x: string) => x !== h.form);
            P._renderFilterBar();
            P._applyItemsListFilter({ cascade: true });
            done = true;
        });
        return done;
    }

    /** People off, or a disable: every strip and its sheet gone, the timers cancelled. */
    _wvPsDestroy() {
        for (const w of wvMainWins()) {
            try {
                const st = states.get(w);
                if (st) { wvClearTimeout(st.t); st.t = null; }
                this._wvPsRemove(w);
                wvRemoveStyle(w.document, STYLE_ID);
            } catch (e) {}
        }
    }

    /** Spec hook: `win`'s state. */
    _wvPsState(win: any): WvPsState | null { return states.get(win) || null; }
}

const _psDescriptors = Object.getOwnPropertyDescriptors(_PeopleStripMixin.prototype);
delete (_psDescriptors as any).constructor;
export const peopleStripMethods = _psDescriptors;
