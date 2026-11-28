// The lineage tree of a researcher in the Researchers tab, and the Academic
// Family Tree as its second source (branch peoplenet, plan approved by MJT
// 2026-11-25; design work/people-genealogy-ui-survey-2026-11-25.md A1). It
// replaces people.ts's family tree (advisors up through Researchers' records):
//   - the person of the page in the centre, mentors ABOVE as generations --
//     PhD advisors and postdoc hosts alike (MJT: "A generation like PhD") --,
//     trainees BELOW; 3 up and 2 down; edges typed and dated; co-advisors side
//     by side; "+N" on a card that has more, a click shows them;
//   - a click on a card centres the tree on that person, Back / Forward /
//     Home; drag to pan, Ctrl+wheel or the buttons to zoom; export as SVG, PNG,
//     CSV through Zotero's file picker;
//   - a person not in Researchers is a dashed card with Follow (a record made
//     as Researchers makes one, followed, tied to the tree person);
//   - the Academic Family Tree (lib/people-aft.ts): an extract of its export in
//     <data dir>/weavero/aft-subset.json, read at the first tree that needs it
//     and kept in memory; every card that uses it carries "Academic Family Tree
//     (CC BY 4.0)" with a link to the person's page there.
// Layout: lib/people-tree.ts (pure). Initials, no photos; Zotero's colours, light
// and dark.

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl } from "../lib/dom";
import { wvSvgEl } from "../lib/svg";
import { wvMenuItem } from "../lib/menu";
import { wvStoreDir, wvStoreRead } from "../lib/store";
import { WvPpRecord, WvPpRef, wvPpFold, wvPpNameAs, wvPpNameMatch, wvPpNameTextAs, wvPpShown, wvPpSplitName } from "../lib/people-record";
import { WvLtEdge, WvLtGraph, WvLtHistory, WvLtLayout, WvLtType, wvLtCsv, wvLtHistGo, wvLtHistMove, wvLtHistNew, wvLtLayout, wvLtBranches, wvLtSiblings, wvLtWhen, wvLtPlaceLabels } from "../lib/people-tree";

/** The branch colours, in the mentors' row order (hue; saturation and lightness in the CSS). */
const BRANCH_HUES = [210, 28, 140, 290];
import { WvAftSource, wvAftSource } from "../lib/people-aft";

declare const Zotero: any;
declare const ChromeUtils: any;

const AFT_FILE = "aft-subset.json";
/** A missing or unreadable extract is looked for again at most this often (the
 *  file is put in place by hand, maybe while a tab is open). */
const AFT_RETRY_MS = 10000;
const CARD_W = 220, CARD_H = 96, GAP_X = 18, GAP_Y = 64;
/** The canvas's margin around the cards (room for "+N" and the labels). */
const PAD = 28;
const DEPTH_UP = 3, DEPTH_DOWN = 2;
/** Cards a person shows at most, mentors above, trainees below: the rest is in its "+N". */
const CAP_UP = 6, CAP_DOWN = 8;
const ZOOM_MIN = 0.15, ZOOM_MAX = 2.5, ZOOM_STEP = 1.2;
const MENU_EXPORT = "wv-pp-lt-export-menu";
const XHTML = "http://www.w3.org/1999/xhtml";
/** The links of a record the tree reads, each an edge kind. */
const UP_LINKS: Array<[string, WvLtType, boolean]> = [["link.advisor", "phd", false], ["link.coadvisor", "phd", true], ["link.postdoc", "postdoc", false]];

/** The tree's look: Zotero's colours (light and dark follow the theme). */
export const WV_LT_CSS = `
.wv-pp-lt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0 0 6px; }
.wv-pp-lt-bar .wv-pp-btn { min-width: 26px; }
.wv-pp-lt-bar .wv-pp-lt-sep { width: 8px; }
.wv-pp-lt-view { position: relative; height: 460px; min-height: 160px; overflow: hidden; resize: vertical; border-radius: 6px;
  border: 1px solid var(--color-panedivider, rgba(127,127,127,.3)); background: var(--material-sidepane, var(--material-background, Canvas));
  cursor: grab; touch-action: none; user-select: none; }
.wv-pp-lt-view[data-wv-lt-drag] { cursor: grabbing; }
.wv-pp-lt-canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.wv-pp-lt-edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.wv-pp-lt-edge { fill: none; stroke: var(--fill-secondary, GrayText); stroke-width: 1.25; }
.wv-pp-lt-edge[data-wv-lt-branch] { stroke: hsl(var(--wv-lt-hue, 210), 55%, 50%); stroke-width: 1.75; }
.wv-pp-lt-card[data-wv-lt-branch] { box-shadow: inset 4px 0 0 hsl(var(--wv-lt-hue, 210), 55%, 50%); }
.wv-pp-lt-sibs { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; font-size: 0.92em; }
.wv-pp-lt-sibrow { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; padding-inline-start: 6px; }
.wv-pp-lt-sibrow[data-wv-lt-branch] { border-inline-start: 4px solid hsl(var(--wv-lt-hue, 210), 55%, 50%); }
.wv-pp-lt-siblab { color: var(--fill-secondary, GrayText); }
.wv-pp-lt-sib { color: var(--wv-link-http, LinkText); cursor: pointer; }
.wv-pp-lt-sib:hover { text-decoration: underline; }
.wv-pp-lt-edge[data-type="postdoc"] { stroke-dasharray: 6 4; }
.wv-pp-lt-edge[data-type="research"] { stroke-dasharray: 2 3; }
.wv-pp-lt-edge[data-type="ra"], .wv-pp-lt-edge[data-type="other"] { stroke-dasharray: 1 4; }
.wv-pp-lt-edge[data-co="true"] { opacity: 0.65; }
.wv-pp-lt-elabel { fill: var(--fill-secondary, GrayText); font: message-box; font-size: 10.5px; }
.wv-pp-lt-card { position: absolute; box-sizing: border-box; display: flex; gap: 8px; padding: 7px 8px; border-radius: 8px; cursor: pointer;
  background: var(--material-background, Canvas); color: var(--fill-primary, CanvasText); border: 1px dashed var(--fill-tertiary, rgba(127,127,127,.6));
  font: message-box; font-size: 12px; line-height: 1.25; text-align: start; }
.wv-pp-lt-card[data-people="true"] { border: 1px solid var(--accent-blue, #4072e5); }
.wv-pp-lt-card[data-focus="true"] { box-shadow: 0 0 0 2px var(--color-accent, var(--accent-blue, #4072e5)); }
.wv-pp-lt-card[data-wv-pp-node="self"] { background: var(--color-accent, var(--accent-blue, #4072e5)); color: #fff; border-color: transparent; }
.wv-pp-lt-card:hover { border-width: 2px; padding: 6px 7px; }
.wv-pp-lt-card:focus-visible { outline: 2px solid var(--color-focus-outline, var(--accent-blue, #4072e5)); outline-offset: 2px; }
.wv-pp-lt-av { flex: none; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; background: var(--fill-quinary, rgba(127,127,127,.2)); color: inherit; }
.wv-pp-lt-card[data-wv-pp-node="self"] .wv-pp-lt-av { background: rgba(255,255,255,.25); }
.wv-pp-lt-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.wv-pp-lt-name { font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.wv-pp-lt-inst, .wv-pp-lt-year { font-size: 0.92em; color: var(--fill-secondary, GrayText); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.wv-pp-lt-inst[data-tree="true"] { font-style: italic; }
.wv-pp-lt-card[data-wv-pp-node="self"] :is(.wv-pp-lt-inst, .wv-pp-lt-year, .wv-pp-lt-aft) { color: inherit; opacity: 0.88; }
.wv-pp-lt-foot { margin-top: auto; display: flex; align-items: center; gap: 4px; min-width: 0; }
.wv-pp-lt-aft { flex: 1 1 auto; min-width: 0; font-size: 10px; color: var(--wv-link-http, LinkText); cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.wv-pp-lt-aft:hover { text-decoration: underline; }
.wv-pp-lt-foot .wv-pp-vbtn { flex: none; margin-inline-start: auto; }
/* "+N" sits OUTSIDE the card, at its end corner (MJT 2026-11-26: the "+2" of a card sat over its name, the
   badge was half over the card's top edge): above the card for the mentors, below it for the trainees; off the
   centre, where the edges come in. 18 px in the 64-px gap between generations and the 28-px padding. */
.wv-pp-lt-more { position: absolute; inset-inline-end: 6px; z-index: 1; appearance: none; box-sizing: border-box; height: 18px; min-height: 0; min-width: 0;
  margin: 0; padding: 0 7px; border-radius: 9px;
  font: message-box; font-size: 10.5px; line-height: 16px; cursor: pointer; color: var(--fill-primary, CanvasText);
  background: var(--material-background, Canvas); border: 1px solid var(--fill-tertiary, rgba(127,127,127,.6)); }
.wv-pp-lt-more[data-dir="up"] { bottom: calc(100% + 3px); }
.wv-pp-lt-more[data-dir="down"] { top: calc(100% + 3px); }
.wv-pp-lt-more:hover { background: var(--fill-quinary, rgba(127,127,127,.2)); }
.wv-pp-lt-info, .wv-pp-lt-credit { margin-top: 4px; font-size: 0.92em; color: var(--fill-secondary, GrayText); overflow-wrap: anywhere; }
.wv-pp-lt-credit [role="link"] { color: var(--wv-link-http, LinkText); cursor: pointer; }
.wv-pp-lt-credit [role="link"]:hover { text-decoration: underline; }
`;

/** One window's tree: the page's person it is for, its history, the cards
 *  opened by their "+N", the pan and zoom. Off the window (a WeakMap): nothing
 *  in the wiring snapshot, nothing kept after it closes. */
interface WvLtView {
    rec: string;
    hist: WvLtHistory;
    open: Set<string>;
    scale: number;
    tx: number;
    ty: number;
    /** The focus the pan was last set for: a new focus is centred. */
    placed: string | null;
    /** A key the next draw gives the keyboard focus to. */
    focusNext?: string | null;
    /** What the last draw knew of its cards (Follow reads a name card's link from it). */
    infos?: Map<string, WvLtInfo>;
}
const views = new WeakMap<any, WvLtView>();

/** What a draw knows of a card. */
interface WvLtInfo {
    key: string;
    kind: "rec" | "aft" | "name";
    rec: WvPpRecord | null;
    pid: string | null;
    name: string;
    initials: string;
    inst: string;
    /** The institution comes from the Academic Family Tree (maybe an earlier one). */
    instTree: boolean;
    year: string;
    /** A name card: the link's own value and ids, for Follow. */
    value?: string;
    ref?: WvPpRef;
}

/** One draw's graph over Researchers' records and the extract. */
interface WvLtCtx {
    src: WvAftSource | null;
    graph: WvLtGraph;
    info(key: string): WvLtInfo;
    canon(key: string): string;
}

const live = () => wvLivePlugin();
const yearOf = (v: any): string => { const m = /\d{4}/.exec(String(v || "")); return m ? m[0] : ""; };
const initialsOf = (last: string, first: string): string => {
    const f = wvPpFold(first).split(" ").filter(Boolean)[0] || "";
    const l = wvPpFold(last).split(" ").filter(Boolean).pop() || "";
    return ((f ? f[0] : "") + (l ? l[0] : "")).toUpperCase() || "?";
};
const xmlEsc = (s: any) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

class _PeopleLineageMixin {
    [k: string]: any;

    // ---- the Academic Family Tree extract -------------------------------------------

    _wvAftPath(): string { return PathUtils.join(wvStoreDir(), AFT_FILE); }

    /** The extract in memory, or null (never read yet, missing, unreadable). */
    _wvAftNow(): WvAftSource | null { return (this as any)._wvAftMem || null; }

    /** Read the extract once (concurrent callers share the read); a missing or
     *  unreadable file is null, looked for again after AFT_RETRY_MS. */
    async _wvAftLoad(): Promise<WvAftSource | null> {
        const P: any = this;
        if (P._wvAftMem) return P._wvAftMem;
        if (P._wvAftLoading) return P._wvAftLoading;
        P._wvAftLoading = (async () => {
            const r = await wvStoreRead(this._wvAftPath(), { retries: 0, onParseError: "keep" });
            if (P._wvDestroyed) return null;
            const src = r.status === "ok" ? wvAftSource(r.doc) : null;
            P._wvAftMem = src;
            P._wvAftTried = Date.now();
            if (!src && r.status !== "missing") Zotero.debug("[Weavero] people: the Academic Family Tree extract could not be read (" + r.status + ")");
            return src;
        })().catch((e: any) => { Zotero.debug("[Weavero] people aft load err: " + e); return null; })
            .finally(() => { P._wvAftLoading = null; });
        return P._wvAftLoading;
    }

    /** Forget the extract: the next tree reads it again (the specs; a new file). */
    _wvAftReset() {
        const P: any = this;
        P._wvAftMem = null;
        P._wvAftTried = 0;
    }

    /** A tree needs the extract: read it now unless a read is under way or
     *  failed a moment ago; the trees are drawn again once it is in. */
    _wvAftNeed() {
        const P: any = this;
        if (P._wvAftMem || P._wvAftLoading || P._wvDestroyed) return;
        if (P._wvAftTried && Date.now() - P._wvAftTried < AFT_RETRY_MS) return;
        this._wvAftLoad().then((src: any) => {
            const lp: any = live();
            if (src && lp) lp._wvPeopleRenderAll();
        }).catch(() => {});
    }

    // ---- the graph of one draw ---------------------------------------------------------

    /** The tree person a record is: the one it was followed from, its ORCID iD,
     *  its name as a library author (shared DOIs), else the one tree person of
     *  exactly its name. */
    _wvLtPidOfRec(rec: WvPpRecord, src: WvAftSource): string | null {
        if (rec.aft && src.person(rec.aft)) return rec.aft;
        const o = wvPpShown(rec, "orcid")[0];
        const byOrcid = o ? src.pidOfOrcid(o.value) : null;
        if (byOrcid) return byOrcid;
        const byUnit = src.pidOfUnit(rec.last, rec.first);
        if (byUnit) return byUnit;
        const exact = src.pidsOfName(rec.last, rec.first).filter((pid) => {
            const p = src.person(pid);
            return !!p && wvPpNameMatch(p.last, p.first, rec.last, rec.first) === "exact";
        });
        return exact.length === 1 ? exact[0] : null;
    }

    /** The graph a draw lays out: Researchers' records ("r:<id>") with their
     *  advisor, co-advisor, postdoc and student links -- the other side's links
     *  too --, the extract's people ("a:<pid>"), a link's name with no record
     *  nor tree person ("n:<folded name>"). A record and the tree person it is
     *  are one card. */
    _wvLtContext(): WvLtCtx {
        const P: any = this;
        const src: WvAftSource | null = this._wvAftNow();
        const recs = this._wvPeopleAllSync() as WvPpRecord[];
        const byId = new Map(recs.map((r) => [r.id, r]));
        const recPid = new Map<string, string>(), pidRec = new Map<string, string>();
        if (src) {
            for (const r of recs) {
                const pid = this._wvLtPidOfRec(r, src);
                if (pid && !pidRec.has(pid)) { recPid.set(r.id, pid); pidRec.set(pid, r.id); }
            }
        }
        const keyOfPid = (pid: string) => (pidRec.has(pid) ? "r:" + pidRec.get(pid) : "a:" + pid);
        const names = new Map<string, { value: string; ref?: WvPpRef }>();
        // A link's person: their record, else the tree person of that name among
        // the record's own tree people on that side, else the name alone.
        const keyOfLink = (s: { value: string; ref?: WvPpRef }, pid: string | null, side: "up" | "down"): string => {
            const t = P._wvPeopleFindByRef(s.value, s.ref);
            if (t) return "r:" + t.id;
            if (src && pid) {
                const n = wvPpSplitName(s.value);
                const hit = (side === "up" ? src.mentors(pid) : src.trainees(pid)).find((l) => {
                    const p = src.person(l.pid);
                    return !!p && !!wvPpNameMatch(p.last, p.first, n.last, n.first);
                });
                if (hit) return keyOfPid(hit.pid);
            }
            const k = "n:" + wvPpFold(s.value);
            if (!names.has(k)) names.set(k, { value: s.value, ref: s.ref });
            return k;
        };
        // Students seen from the other side: every record's advisor links, once.
        const reverse = new Map<string, WvLtEdge[]>();
        for (const r of recs) {
            for (const [fact, type, co] of UP_LINKS) {
                for (const s of wvPpShown(r, fact)) {
                    const t = P._wvPeopleFindByRef(s.value, s.ref);
                    if (!t || t.id === r.id) continue;
                    const py = type === "phd" ? yearOf((wvPpShown(r, "phd.year")[0] || {} as any).value) : "";
                    const e: WvLtEdge = { mentor: "r:" + t.id, trainee: "r:" + r.id, type, co, years: s.years || py, src: "people" };
                    if (!reverse.has(t.id)) reverse.set(t.id, []);
                    reverse.get(t.id)!.push(e);
                }
            }
        }
        const pidOfKey = (key: string): string | null => (key.startsWith("a:") ? key.slice(2) : key.startsWith("r:") ? recPid.get(key.slice(2)) || null : null);
        const aftEdges = (pid: string, key: string, side: "up" | "down"): WvLtEdge[] => {
            if (!src) return [];
            return (side === "up" ? src.mentors(pid) : src.trainees(pid)).map((l) => {
                const other = keyOfPid(l.pid);
                // The Academic Family Tree's date is the link's end (its `stopdate`).
                return { mentor: side === "up" ? other : key, trainee: side === "up" ? key : other, type: l.type, years: l.date || (l.year ? String(l.year) : ""), end: true,
                    inst: l.inst, thesis: l.thesis, src: "aft" as const };
            });
        };
        const graph: WvLtGraph = {
            mentorsOf: (key: string) => {
                const out: WvLtEdge[] = [];
                const pid = pidOfKey(key);
                const rec = key.startsWith("r:") ? byId.get(key.slice(2)) : null;
                if (rec) {
                    for (const [fact, type, co] of UP_LINKS) {
                        for (const s of wvPpShown(rec, fact)) {
                            const m = keyOfLink(s, pid, "up");
                            if (m !== key) out.push({ mentor: m, trainee: key, type, co, years: s.years || "", src: "people" });
                        }
                    }
                }
                if (pid) out.push(...aftEdges(pid, key, "up"));
                return out;
            },
            traineesOf: (key: string) => {
                const out: WvLtEdge[] = [];
                const pid = pidOfKey(key);
                const rec = key.startsWith("r:") ? byId.get(key.slice(2)) : null;
                if (rec) {
                    for (const s of wvPpShown(rec, "link.student")) {
                        const t = keyOfLink(s, pid, "down");
                        if (t !== key) out.push({ mentor: key, trainee: t, type: "phd", years: s.years || "", src: "people" });
                    }
                    out.push(...(reverse.get(rec.id) || []));
                }
                if (pid) out.push(...aftEdges(pid, key, "down"));
                return out;
            },
            // The extract counts mentors and trainees it does not list (its outer ring).
            moreMentors: (key: string) => {
                const pid = pidOfKey(key), p = pid && src ? src.person(pid) : null;
                return p ? Math.max(0, p.mentors - new Set(src!.mentors(pid!).map((l) => l.pid)).size) : 0;
            },
            moreTrainees: (key: string) => {
                const pid = pidOfKey(key), p = pid && src ? src.person(pid) : null;
                return p ? Math.max(0, p.trainees - new Set(src!.trainees(pid!).map((l) => l.pid)).size) : 0;
            },
        };
        const order = this._wvPeopleNameOrder("tree");
        const memo = new Map<string, WvLtInfo>();
        const phdYearAft = (pid: string): string => {
            if (!src) return "";
            const l = src.mentors(pid).filter((x) => x.type === "phd" && x.year).sort((a, b) => (a.year as number) - (b.year as number))[0];
            return l ? String(l.year) : "";
        };
        const info = (key: string): WvLtInfo => {
            const hit = memo.get(key);
            if (hit) return hit;
            let out: WvLtInfo;
            const pid = pidOfKey(key);
            const ap = pid && src ? src.person(pid) : null;
            const rec = key.startsWith("r:") ? byId.get(key.slice(2)) || null : null;
            if (rec) {
                const inst = (wvPpShown(rec, "institution")[0] || {} as any).value || "";
                out = { key, kind: "rec", rec, pid, name: wvPpNameAs(rec, order) || rec.last, initials: initialsOf(rec.last, rec.first),
                    inst: inst || (ap ? ap.inst : ""), instTree: !inst && !!(ap && ap.inst),
                    year: yearOf((wvPpShown(rec, "phd.year")[0] || {} as any).value) || (pid ? phdYearAft(pid) : "") };
            }
            else if (ap) {
                out = { key, kind: "aft", rec: null, pid, name: wvPpNameAs({ last: ap.last, first: ap.first }, order) || ap.last,
                    initials: initialsOf(ap.last, ap.first), inst: ap.inst, instTree: !!ap.inst, year: phdYearAft(ap.pid) };
            }
            else {
                const n = names.get(key) || { value: key.slice(2) };
                const sp = wvPpSplitName(n.value);
                out = { key, kind: "name", rec: null, pid: null, name: wvPpNameTextAs(n.value, order) || n.value, initials: initialsOf(sp.last, sp.first),
                    inst: "", instTree: false, year: "", value: n.value, ref: n.ref };
            }
            memo.set(key, out);
            return out;
        };
        // A key the history holds may name a tree person who has become a
        // record (Follow) since: the record's key now.
        const canon = (key: string) => (key.startsWith("a:") ? keyOfPid(key.slice(2)) : key);
        return { src, graph, info, canon };
    }

    // ---- the view -----------------------------------------------------------------------

    /** The window's tree state for the page's record `recId` (a new record: a new tree). */
    _wvLtState(win: any, recId?: string): WvLtView | null {
        let st = views.get(win) || null;
        if (recId && (!st || st.rec !== recId)) {
            st = { rec: recId, hist: wvLtHistNew("r:" + recId), open: new Set(), scale: 1, tx: 0, ty: 0, placed: null };
            views.set(win, st);
        }
        return st;
    }

    /** The section of the page (people.ts _wvPeopleRenderMain calls it in the
     *  place of the old family tree). */
    _wvPeopleRenderTree(win: any, main: any, rec: WvPpRecord) {
        const doc = win.document;
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        sec.setAttribute("data-wv-pp-sec", "tree");
        wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr("weavero-people-sec-tree", null, null), sec);
        // A tree that fails to draw leaves the rest of the page standing.
        try {
            this._wvAftNeed();
            this._wvLtState(win, rec.id);
            this._wvLtDraw(win, sec);
        }
        catch (e) { Zotero.debug("[Weavero] people tree err: " + e); }
    }

    /** The tree section of `win`'s page, or null. */
    _wvLtSec(win: any): any {
        try {
            const root = this._wvPeopleRootOf(win);
            return root ? root.querySelector("[data-wv-pp-sec='tree']") : null;
        } catch (e) { return null; }
    }

    /** Draw (again) the tree in its section: the toolbar, the cards, the edges,
     *  the focus's grants, the credit. */
    _wvLtDraw(win: any, secArg?: any) {
        const sec = secArg || this._wvLtSec(win);
        const st = views.get(win);
        if (!sec || !st) return;
        const doc = win.document;
        const P: any = this;
        while (sec.childNodes.length > 1) sec.lastChild.remove();
        const ctx = this._wvLtContext();
        // The history in today's keys (a card followed since is its record now).
        st.hist = { list: st.hist.list.map(ctx.canon), at: st.hist.at };
        const home = ctx.canon("r:" + st.rec);
        const focus = st.hist.list[st.hist.at];
        const lay: WvLtLayout = wvLtLayout(ctx.graph, focus, { up: DEPTH_UP, down: DEPTH_DOWN, open: st.open, capUp: CAP_UP, capDown: CAP_DOWN, w: CARD_W, h: CARD_H, gx: GAP_X, gy: GAP_Y });
        (P as any)._wvLtLastLayout = lay;
        if (lay.nodes.length === 1 && st.hist.list.length === 1) {
            wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-tree-empty", null, null), sec);
            return;
        }
        // ---- the toolbar
        const bar = wvHtmlEl(doc, "div", "wv-pp-lt-bar", undefined, sec);
        const homeName = ctx.info(home).name;
        const btn = (act: string, text: string, tipID: string, args: any, fn: (b: any) => void, disabled?: boolean) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-btn", text, bar);
            b.setAttribute("type", "button");
            b.setAttribute("data-wv-lt-act", act);
            const tip = wvStr(tipID, args, null);
            b.setAttribute("title", tip);
            b.setAttribute("aria-label", tip);
            b.disabled = !!disabled;
            b.addEventListener("click", () => { try { fn(b); } catch (e) { Zotero.debug("[Weavero] people tree err: " + e); } });
            return b;
        };
        btn("back", "←", "weavero-people-lt-back", null, () => { const lp: any = live(); if (lp) lp._wvLtMove(win, -1); }, st.hist.at === 0);
        btn("forward", "→", "weavero-people-lt-forward", null, () => { const lp: any = live(); if (lp) lp._wvLtMove(win, 1); }, st.hist.at >= st.hist.list.length - 1);
        btn("home", "⌂", "weavero-people-lt-home", { name: homeName }, () => { const lp: any = live(); if (lp) lp._wvLtHome(win); }, focus === home);
        wvHtmlEl(doc, "span", "wv-pp-lt-sep", undefined, bar);
        btn("zoomout", "−", "weavero-people-lt-zoom-out", null, () => { const lp: any = live(); if (lp) lp._wvLtZoom(win, 1 / ZOOM_STEP); });
        btn("zoomin", "+", "weavero-people-lt-zoom-in", null, () => { const lp: any = live(); if (lp) lp._wvLtZoom(win, ZOOM_STEP); });
        btn("fit", "⤢", "weavero-people-lt-fit", null, () => { const lp: any = live(); if (lp) lp._wvLtFit(win); });
        wvHtmlEl(doc, "span", "wv-pp-lt-sep", undefined, bar);
        const ex = btn("export", wvStr("weavero-people-lt-export", null, null) + " ▾", "weavero-people-lt-export", null, (b) => {
            const lp: any = live(); if (lp) lp._wvLtExportMenu(win, b);
        });
        ex.setAttribute("aria-haspopup", "menu");
        // ---- the view and its canvas
        const view = wvHtmlEl(doc, "div", "wv-pp-lt-view", undefined, sec);
        view.setAttribute("role", "group");
        view.setAttribute("aria-label", wvStr("weavero-people-tree-label", { name: ctx.info(focus).name }, null));
        view.setAttribute("data-wv-lt-focus", focus);
        const canvas = wvHtmlEl(doc, "div", "wv-pp-lt-canvas", undefined, view);
        const ox = PAD - lay.minX, oy = PAD - lay.minY;
        const cw = lay.maxX - lay.minX + 2 * PAD, ch = lay.maxY - lay.minY + 2 * PAD;
        canvas.style.width = cw + "px";
        canvas.style.height = ch + "px";
        const svg = wvSvgEl(doc, "svg", { class: "wv-pp-lt-edges", width: cw, height: ch, viewBox: "0 0 " + cw + " " + ch }, canvas);
        svg.setAttribute("aria-hidden", "true");
        // Each advisor's line in its own colour when the focus has two or more
        // (the Nodus study's idea 8, MJT 2026-11-26): edges and cards above it.
        const branches = wvLtBranches(lay, focus);
        for (const e of lay.edges) {
            const x1 = e.x1 + ox, y1 = e.y1 + oy, x2 = e.x2 + ox, y2 = e.y2 + oy, ym = e.ym + oy;
            const d = y2 > y1 ? "M" + x1 + " " + y1 + " V" + ym + " H" + x2 + " V" + y2
                : "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 + GAP_Y) + " " + x2 + " " + (y2 - GAP_Y) + " " + x2 + " " + y2;
            const path = wvSvgEl(doc, "path", { class: "wv-pp-lt-edge", d }, svg);
            path.setAttribute("data-type", e.type);
            if (e.co) path.setAttribute("data-co", "true");
            const br = branches.get(e.trainee === focus ? e.mentor : e.trainee);
            if (br != null) {
                path.setAttribute("data-wv-lt-branch", String(br));
                path.style.setProperty("--wv-lt-hue", String(BRANCH_HUES[br % BRANCH_HUES.length]));
            }
        }
        // The labels, none over another (wvLtPlaceLabels).
        for (const s of this._wvLtLabelSpots(lay, ox, oy)) {
            const t = wvSvgEl(doc, "text", { class: "wv-pp-lt-elabel", x: s.x, y: s.y }, svg);
            t.setAttribute("data-wv-lt-when", s.kind);
            t.textContent = s.text;
            // A date whose end no source tells: said in the tooltip.
            if (s.tip) wvSvgEl(doc, "title", {}, t).textContent = s.tip;
        }
        const byGen = new Map<number, any[]>();
        st.infos = new Map();
        for (const n of lay.nodes) {
            const inf = ctx.info(n.key);
            st.infos.set(n.key, inf);
            const card = this._wvLtCard(win, canvas, n, inf, ctx, focus);
            card.style.left = (n.x + ox) + "px";
            card.style.top = (n.y + oy) + "px";
            const br = branches.get(n.key);
            if (br != null) {
                card.setAttribute("data-wv-lt-branch", String(br));
                card.style.setProperty("--wv-lt-hue", String(BRANCH_HUES[br % BRANCH_HUES.length]));
            }
            if (!byGen.has(n.gen)) byGen.set(n.gen, []);
            byGen.get(n.gen)!.push({ n, card });
        }
        for (const row of byGen.values()) row.sort((a, b) => a.n.x - b.n.x);
        this._wvLtWireView(win, view, canvas, lay, byGen);
        // ---- the focus's academic siblings (idea 8): each PhD advisor's other PhD
        // students, in that advisor's colour when there are several; a name centres
        // the tree on that person.
        const sibs = wvLtSiblings(ctx.graph, focus);
        if (sibs.length) {
            const box = wvHtmlEl(doc, "div", "wv-pp-lt-sibs", undefined, sec);
            box.setAttribute("data-wv-lt-sibs", String(sibs.reduce((s, x) => s + x.siblings.length + x.more, 0)));
            box.setAttribute("title", wvStr("weavero-people-lt-sibs-tip", null, null));
            for (const g of sibs) {
                const row = wvHtmlEl(doc, "div", "wv-pp-lt-sibrow", undefined, box);
                const br = branches.get(g.mentor);
                if (br != null) {
                    row.setAttribute("data-wv-lt-branch", String(br));
                    row.style.setProperty("--wv-lt-hue", String(BRANCH_HUES[br % BRANCH_HUES.length]));
                }
                wvHtmlEl(doc, "span", "wv-pp-lt-siblab", wvStr("weavero-people-lt-sibs-of", { name: ctx.info(g.mentor).name }, null), row);
                for (const k of g.siblings) {
                    const chip = wvHtmlEl(doc, "span", "wv-pp-lt-sib", ctx.info(k).name, row);
                    chip.setAttribute("role", "link");
                    chip.setAttribute("tabindex", "0");
                    chip.setAttribute("data-wv-lt-key", k);
                    const go = () => { const lp: any = live(); if (lp) lp._wvLtGo(win, k); };
                    chip.addEventListener("click", go);
                    chip.addEventListener("keydown", (e: any) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
                }
                if (g.more) wvHtmlEl(doc, "span", "wv-pp-muted", wvStr("weavero-people-works-more", { count: g.more }, null), row);
            }
        }
        // ---- the focus's grants, the credit
        const fi = ctx.info(focus);
        const grants = fi.pid && ctx.src ? ctx.src.grants(fi.pid) : [];
        if (grants.length) {
            const list = grants.slice(0, 6).map((g) => g.core + (g.from ? " (" + g.from + (g.to && g.to !== g.from ? "–" + g.to : "") + ")" : "")).join(", ")
                + (grants.length > 6 ? ", …" : "");
            wvHtmlEl(doc, "div", "wv-pp-lt-info", wvStr("weavero-people-lt-grants", { list }, null), sec).setAttribute("data-wv-lt-grants", String(grants.length));
        }
        if (ctx.src && lay.nodes.some((n) => !!ctx.info(n.key).pid)) {
            const c = wvHtmlEl(doc, "div", "wv-pp-lt-credit", undefined, sec);
            const i = ctx.src.info;
            const text = wvStr("weavero-people-lt-credit", { source: "\u0001", licence: i.licence, version: i.version }, null);
            const parts = text.split("\u0001");
            c.appendChild(doc.createTextNode(parts[0] || ""));
            const a = wvHtmlEl(doc, "span", undefined, i.name, c);
            a.setAttribute("role", "link");
            a.setAttribute("data-url", i.site);
            // The link's address in its tooltip (MJT 2026-11-25: "Hovering on the
            // links in the Researchers cards must show the link in the tooltip").
            a.setAttribute("title", i.site);
            a.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(i.site); });
            c.appendChild(doc.createTextNode(parts.slice(1).join("") || ""));
        }
        // Centre a new focus; keep the pan and zoom while it stays.
        if (st.placed !== focus) this._wvLtCentre(win, view, lay, focus, ox, oy);
        else this._wvLtApply(win, canvas);
        if (st.focusNext) {
            const k = st.focusNext;
            st.focusNext = null;
            const el = canvas.querySelector(".wv-pp-lt-card[data-wv-lt-key='" + k.replace(/'/g, "\\'") + "']");
            if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
        }
    }

    /** An edge's kind and dates (lib/people-tree.ts wvLtWhen): "PhD 1960",
     *  "Postdoc 1993–1995", "Postdoc from 1993", "Postdoc until 1995", "Postdoc
     *  1995?" (a year whose end no source tells), "Co-advisor 1990"; a month or a
     *  day when the source has it, in the interface's language. */
    _wvLtEdgeLabel(e: WvLtEdge): string {
        const type = wvStr("weavero-people-lt-edge", { type: e.co ? "coadvisor" : e.type }, null);
        const w = wvLtWhen(e);
        if (w.kind === "none") return type;
        return wvStr("weavero-people-lt-when", { kind: w.kind, type, from: this._wvLtDateText(w.from), to: this._wvLtDateText(w.to) }, null);
    }

    /** A date as the label writes it: a year as it is; a month or a day in the
     *  interface's language; anything else as it came. */
    _wvLtDateText(d: string): string {
        const s = String(d || "");
        const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
        if (!m) return s;
        let loc = "en-US";
        try { loc = String(Zotero.locale || "en-US"); } catch (e) {}
        try {
            const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1));
            return new Intl.DateTimeFormat(loc, m[3] ? { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" } : { year: "numeric", month: "short", timeZone: "UTC" }).format(dt);
        }
        catch (e) { return s; }
    }

    /** Every edge's label and where it goes: under its mentor (edges above the
     *  focus) or above its trainee, moved a line along until it covers no other
     *  (MJT 2026-11-26: "PhD 1955" was drawn over "1948"). */
    _wvLtLabelSpots(lay: WvLtLayout, ox: number, oy: number): Array<{ x: number; y: number; text: string; kind: string; tip: string }> {
        const items: Array<{ x: number; y: number; text: string; dir: 1 | -1; kind: string; tip: string }> = [];
        for (const e of lay.edges) {
            // Every link between the two people: one label ("PhD 1992 · Postdoc 1993–1995").
            const all: WvLtEdge[] = [e, ...(e.also || [])];
            const text = all.map((x) => this._wvLtEdgeLabel(x)).filter(Boolean).join(" · ");
            if (!text) continue;
            const kinds = all.map((x) => wvLtWhen(x));
            const unk = kinds.find((w) => w.kind === "unknown");
            const tip = unk ? wvStr("weavero-people-lt-when-tip", { date: this._wvLtDateText(unk.from) }, null) : "";
            const atMentor = e.labelAt === "mentor";
            items.push({ x: (atMentor ? e.x1 : e.x2) + ox + 5, y: atMentor ? e.y1 + oy + 13 : e.y2 + oy - 6, text, dir: atMentor ? 1 : -1, kind: unk ? "unknown" : kinds[0].kind, tip });
        }
        const at = wvLtPlaceLabels(items);
        return items.map((it, i) => ({ x: at[i].x, y: at[i].y, text: it.text, kind: it.kind, tip: it.tip }));
    }

    /** One person's card. */
    _wvLtCard(win: any, canvas: any, n: any, inf: WvLtInfo, ctx: WvLtCtx, focus: string): any {
        const doc = win.document;
        const st = views.get(win) as WvLtView;
        const card = wvHtmlEl(doc, "div", "wv-pp-lt-card", undefined, canvas);
        card.style.width = CARD_W + "px";
        card.style.height = CARD_H + "px";
        const isHome = n.key === ctx.canon("r:" + st.rec);
        card.setAttribute("data-wv-pp-node", isHome ? "self" : (n.gen < 0 ? "advisor" : n.gen > 0 ? "student" : "focus"));
        card.setAttribute("data-level", String(n.gen));
        card.setAttribute("data-people", inf.kind === "rec" ? "true" : "false");
        card.setAttribute("data-wv-lt-key", n.key);
        if (inf.rec) card.setAttribute("data-wv-pp-person", inf.rec.id);
        if (inf.pid) card.setAttribute("data-aft-pid", inf.pid);
        if (n.key === focus) card.setAttribute("data-focus", "true");
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", inf.name);
        card.setAttribute("title", wvStr("weavero-people-lt-card-tip", null, null));
        const av = wvHtmlEl(doc, "div", "wv-pp-lt-av", inf.initials, card);
        av.setAttribute("aria-hidden", "true");
        const body = wvHtmlEl(doc, "div", "wv-pp-lt-body", undefined, card);
        wvHtmlEl(doc, "div", "wv-pp-lt-name", inf.name, body);
        if (inf.inst) {
            const i = wvHtmlEl(doc, "div", "wv-pp-lt-inst", inf.inst, body);
            if (inf.instTree && ctx.src) {
                i.setAttribute("data-tree", "true");
                i.setAttribute("title", inf.inst + " — " + wvStr("weavero-people-lt-tree-inst", { source: ctx.src.info.name }, null));
            }
            else i.setAttribute("title", inf.inst);
        }
        if (inf.year) wvHtmlEl(doc, "div", "wv-pp-lt-year", wvStr("weavero-people-lt-phd", { year: inf.year }, null), body);
        const foot = wvHtmlEl(doc, "div", "wv-pp-lt-foot", undefined, body);
        if (inf.pid && ctx.src) {
            const i = ctx.src.info;
            const url = ctx.src.pageUrl(inf.pid);
            const a = wvHtmlEl(doc, "span", "wv-pp-lt-aft", i.name + " (" + i.licence + ")", foot);
            a.setAttribute("role", "link");
            a.setAttribute("data-url", url);
            // The address first (MJT 2026-11-25: "must show the link in the
            // tooltip"), then what it is.
            a.setAttribute("title", url + "\n" + wvStr("weavero-people-lt-aft-tip", { source: i.name, licence: i.licence }, null));
            a.addEventListener("click", (e: any) => { e.stopPropagation(); const lp: any = live(); if (lp) lp._launchURL(url); });
        }
        if (inf.kind === "rec" && inf.rec && !isHome) {
            const id = inf.rec.id;
            const b = wvHtmlEl(doc, "button", "wv-pp-vbtn wv-pp-lt-open", wvStr("weavero-people-lt-open", null, null), foot);
            b.setAttribute("type", "button");
            b.setAttribute("title", wvStr("weavero-people-lt-open-tip", null, null));
            b.addEventListener("click", (e: any) => { e.stopPropagation(); const lp: any = live(); if (lp) lp._wvPeopleTabOpen(win, { personID: id }); });
        }
        else if (inf.kind !== "rec") {
            const b = wvHtmlEl(doc, "button", "wv-pp-vbtn wv-pp-lt-follow", wvStr("weavero-people-follow", null, null), foot);
            b.setAttribute("type", "button");
            b.setAttribute("title", wvStr("weavero-people-lt-follow-tip", null, null));
            b.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const lp: any = live();
                if (lp) lp._wvLtFollow(win, n.key).catch((er: any) => Zotero.debug("[Weavero] people tree follow err: " + er));
            });
        }
        for (const [dir, count] of [["up", n.gen <= 0 ? n.hidUp : 0], ["down", n.gen >= 0 ? n.hidDown : 0]] as Array<["up" | "down", number]>) {
            if (!count) continue;
            const m = wvHtmlEl(doc, "button", "wv-pp-lt-more", "+" + count, card);
            m.setAttribute("type", "button");
            m.setAttribute("data-dir", dir);
            m.setAttribute("title", wvStr(dir === "up" ? "weavero-people-lt-more-up" : "weavero-people-lt-more-down", { count }, null));
            m.addEventListener("click", (e: any) => { e.stopPropagation(); const lp: any = live(); if (lp) lp._wvLtOpenMore(win, n.key); });
        }
        // A card its "+N" opened: "Show fewer" where that badge was, back to the
        // first ones (MJT 2026-11-25: "Can I go back to the state before
        // clicking +44?").
        if (st && st.open.has(n.key)) {
            const dir = n.gen < 0 ? "up" : "down";
            const f = wvHtmlEl(doc, "button", "wv-pp-lt-more wv-pp-lt-fewer", wvStr("weavero-people-lt-fewer", null, null), card);
            f.setAttribute("type", "button");
            f.setAttribute("data-dir", dir);
            f.setAttribute("data-wv-lt-fewer", "true");
            f.addEventListener("click", (e: any) => { e.stopPropagation(); const lp: any = live(); if (lp) lp._wvLtCloseMore(win, n.key); });
        }
        card.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvLtGo(win, n.key); });
        return card;
    }

    /** The view's gestures: drag to pan, Ctrl+wheel to zoom at the pointer, the
     *  keyboard on the cards (Enter centres; the arrows move to a mentor, a
     *  trainee, a neighbour). */
    _wvLtWireView(win: any, view: any, canvas: any, lay: WvLtLayout, byGen: Map<number, any[]>) {
        let drag: { id: number; x: number; y: number; tx: number; ty: number } | null = null;
        view.addEventListener("pointerdown", (e: any) => {
            if (e.button !== 0 || (e.target && e.target.closest && e.target.closest(".wv-pp-lt-card, button"))) return;
            const st = views.get(win);
            if (!st) return;
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty };
            try { view.setPointerCapture(e.pointerId); } catch (er) {}
            view.setAttribute("data-wv-lt-drag", "true");
        });
        view.addEventListener("pointermove", (e: any) => {
            const st = views.get(win);
            if (!drag || !st || e.pointerId !== drag.id) return;
            st.tx = drag.tx + e.clientX - drag.x;
            st.ty = drag.ty + e.clientY - drag.y;
            const lp: any = live();
            if (lp) lp._wvLtApply(win, canvas);
        });
        const end = (e: any) => {
            if (!drag || e.pointerId !== drag.id) return;
            drag = null;
            view.removeAttribute("data-wv-lt-drag");
            try { view.releasePointerCapture(e.pointerId); } catch (er) {}
        };
        view.addEventListener("pointerup", end);
        view.addEventListener("pointercancel", end);
        view.addEventListener("wheel", (e: any) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const r = view.getBoundingClientRect();
            const lp: any = live();
            if (lp) lp._wvLtZoom(win, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX - r.left, e.clientY - r.top);
        }, { passive: false });
        canvas.addEventListener("keydown", (e: any) => {
            const card = e.target && e.target.closest ? e.target.closest(".wv-pp-lt-card") : null;
            if (!card || e.target !== card) return;
            const key = card.getAttribute("data-wv-lt-key");
            const lp: any = live();
            if (!lp) return;
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const st = views.get(win);
                if (st) st.focusNext = key;
                lp._wvLtGo(win, key);
                return;
            }
            const n = lay.nodes.find((x) => x.key === key);
            if (!n) return;
            let to: string | null = null;
            if (e.key === "ArrowUp") { const ed = lay.edges.find((x) => x.trainee === key && lay.nodes.some((y) => y.key === x.mentor && y.gen < n.gen)); to = ed ? ed.mentor : null; }
            else if (e.key === "ArrowDown") { const ed = lay.edges.find((x) => x.mentor === key && lay.nodes.some((y) => y.key === x.trainee && y.gen > n.gen)); to = ed ? ed.trainee : null; }
            else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const row = byGen.get(n.gen) || [];
                const i = row.findIndex((x) => x.n.key === key);
                const j = row[i + (e.key === "ArrowLeft" ? -1 : 1)];
                to = j ? j.n.key : null;
            }
            else return;
            e.preventDefault();
            if (!to) return;
            const el = canvas.querySelector(".wv-pp-lt-card[data-wv-lt-key='" + to.replace(/'/g, "\\'") + "']");
            if (el) { try { el.focus({ preventScroll: true }); lp._wvLtReveal(win, el); } catch (er) {} }
        });
    }

    /** The canvas at the window's pan and zoom. */
    _wvLtApply(win: any, canvas?: any) {
        const st = views.get(win);
        const sec = canvas ? null : this._wvLtSec(win);
        const c = canvas || (sec && sec.querySelector(".wv-pp-lt-canvas"));
        if (!st || !c) return;
        c.style.transform = "translate(" + Math.round(st.tx) + "px, " + Math.round(st.ty) + "px) scale(" + st.scale + ")";
    }

    /** A new focus in the middle of the view at the zoom it has (the whole
     *  tree centred instead when it fits). The view not laid out yet (a tab in
     *  the background): once it is. */
    _wvLtCentre(win: any, view: any, lay: WvLtLayout, focus: string, ox: number, oy: number) {
        const st = views.get(win);
        if (!st) return;
        const place = () => {
            const vw = view.clientWidth, vh = view.clientHeight;
            if (!vw || !vh) return false;
            const s = st.scale;
            const n = lay.nodes.find((x) => x.key === focus);
            const cw = lay.maxX - lay.minX + 2 * PAD, ch = lay.maxY - lay.minY + 2 * PAD;
            const fx = n ? n.x + ox + CARD_W / 2 : cw / 2, fy = n ? n.y + oy + CARD_H / 2 : ch / 2;
            st.tx = cw * s <= vw ? (vw - cw * s) / 2 : vw / 2 - fx * s;
            st.ty = ch * s <= vh ? (vh - ch * s) / 2 : vh / 2 - fy * s;
            st.placed = focus;
            this._wvLtApply(win, view.querySelector(".wv-pp-lt-canvas"));
            return true;
        };
        if (place()) return;
        this._wvLtApply(win, view.querySelector(".wv-pp-lt-canvas"));
        win.requestAnimationFrame(() => { try { if (view.isConnected) place(); } catch (e) {} });
    }

    /** A card moved to by the keyboard, brought into the view. */
    _wvLtReveal(win: any, el: any) {
        const st = views.get(win);
        const view = el && el.closest(".wv-pp-lt-view");
        if (!st || !view) return;
        const vr = view.getBoundingClientRect(), r = el.getBoundingClientRect();
        let dx = 0, dy = 0;
        if (r.left < vr.left) dx = vr.left - r.left + 12; else if (r.right > vr.right) dx = vr.right - r.right - 12;
        if (r.top < vr.top) dy = vr.top - r.top + 12; else if (r.bottom > vr.bottom) dy = vr.bottom - r.bottom - 12;
        if (!dx && !dy) return;
        st.tx += dx; st.ty += dy;
        this._wvLtApply(win);
    }

    // ---- navigation --------------------------------------------------------------------

    /** Centre the tree on `key` (a new step of the history). */
    _wvLtGo(win: any, key: string) {
        const st = views.get(win);
        if (!st || !key) return;
        const h = wvLtHistGo(st.hist, key);
        if (h === st.hist) return;
        st.hist = h;
        this._wvLtDraw(win);
    }

    _wvLtMove(win: any, step: -1 | 1) {
        const st = views.get(win);
        if (!st) return;
        st.hist = wvLtHistMove(st.hist, step);
        this._wvLtDraw(win);
    }

    /** Back to the page's person, as a new step (a browser's Home). */
    _wvLtHome(win: any) {
        const st = views.get(win);
        if (!st) return;
        this._wvLtGo(win, this._wvLtContext().canon("r:" + st.rec));
    }

    /** A card's "Show fewer": back to what the tree showed before its "+N". */
    _wvLtCloseMore(win: any, key: string) {
        const st = views.get(win);
        if (!st || !st.open.delete(key)) return;
        this._wvLtDraw(win);
    }

    /** A card's "+N": its mentors or trainees all shown, one generation past the depth. */
    _wvLtOpenMore(win: any, key: string) {
        const st = views.get(win);
        if (!st) return;
        st.open.add(key);
        this._wvLtDraw(win);
    }

    /** Zoom by `factor` about (`cx`, `cy`) of the view (its middle by default). */
    _wvLtZoom(win: any, factor: number, cx?: number, cy?: number) {
        const st = views.get(win);
        const sec = this._wvLtSec(win);
        const view = sec && sec.querySelector(".wv-pp-lt-view");
        if (!st) return;
        const s = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, st.scale * factor));
        const px = cx != null ? cx : (view ? view.clientWidth / 2 : 0);
        const py = cy != null ? cy : (view ? view.clientHeight / 2 : 0);
        st.tx = px - (px - st.tx) * (s / st.scale);
        st.ty = py - (py - st.ty) * (s / st.scale);
        st.scale = s;
        this._wvLtApply(win);
    }

    /** The whole tree in the view (never larger than 1:1). */
    _wvLtFit(win: any) {
        const st = views.get(win);
        const sec = this._wvLtSec(win);
        const view = sec && sec.querySelector(".wv-pp-lt-view");
        const canvas = sec && sec.querySelector(".wv-pp-lt-canvas");
        if (!st || !view || !canvas) return;
        const vw = view.clientWidth, vh = view.clientHeight;
        const cw = parseFloat(canvas.style.width) || 1, ch = parseFloat(canvas.style.height) || 1;
        if (!vw || !vh) return;
        st.scale = Math.max(ZOOM_MIN, Math.min(1, vw / cw, vh / ch));
        st.tx = (vw - cw * st.scale) / 2;
        st.ty = (vh - ch * st.scale) / 2;
        this._wvLtApply(win, canvas);
    }

    /** Follow a card not in Researchers: a record as Researchers makes one (To
     *  check), followed; a tree person's record remembers which one it is, a
     *  link's name keeps the link's ids. Nothing is fetched until Refresh. */
    async _wvLtFollow(win: any, key: string): Promise<WvPpRecord | null> {
        await this._wvPeopleLoad();
        const st = views.get(win);
        const inf = (st && st.infos && st.infos.get(key)) || this._wvLtContext().info(key);
        if (inf.kind === "rec") return inf.rec;
        if (inf.kind === "aft" && inf.pid) {
            const p = (this._wvAftNow() as WvAftSource).person(inf.pid);
            if (!p) return null;
            return await this._wvPeopleCreate(p.last, p.first, { followed: true, aft: p.pid });
        }
        const n = wvPpSplitName(inf.value || "");
        if (!n.last) return null;
        return await this._wvPeopleCreate(n.last, n.first, { ref: inf.ref, source: "me", followed: true });
    }

    // ---- export ------------------------------------------------------------------------

    _wvLtExportMenu(win: any, anchor: any) {
        return this._wvPeopleOpenMenu(win, anchor, MENU_EXPORT, (pop: any) => {
            const doc = win.document;
            // Each id written whole: test/l10n-code.spec.js finds the ids the code hands Fluent.
            const ids: Record<string, string> = { svg: "weavero-people-lt-export-svg", png: "weavero-people-lt-export-png", csv: "weavero-people-lt-export-csv" };
            for (const kind of ["svg", "png", "csv"]) {
                wvMenuItem(doc, {
                    l10n: { id: ids[kind] },
                    attrs: { "data-wv-lt-export": kind },
                    onCommand: () => { const lp: any = live(); if (lp) lp._wvLtExport(win, kind).catch((e: any) => Zotero.debug("[Weavero] people tree export err: " + e)); },
                }, pop);
            }
        });
    }

    /** Export the tree on screen through Zotero's file picker. */
    async _wvLtExport(win: any, kind: string): Promise<boolean> {
        const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
        const fp = new FilePicker();
        fp.init(win, wvStr("weavero-people-lt-export-title", null, null), fp.modeSave);
        fp.appendFilter(kind.toUpperCase(), "*." + kind);
        const st = views.get(win);
        const focus = st ? st.hist.list[st.hist.at] : "";
        const name = focus ? this._wvLtContext().info(focus).name : "";
        fp.defaultString = (wvPpFold(name).replace(/ /g, "-") || "lineage") + "." + kind;
        const rv = await fp.show();
        if (rv !== fp.returnOK && rv !== fp.returnReplace) return false;
        return this._wvLtExportTo(win, kind, String(fp.file));
    }

    /** Write the tree on screen to `path`: "svg" (light colours, whatever the
     *  theme, with the sources' credit), "png" (that SVG drawn twice the size),
     *  "csv" (one row per edge). */
    async _wvLtExportTo(win: any, kind: string, path: string): Promise<boolean> {
        const st = views.get(win);
        if (!st) return false;
        const ctx = this._wvLtContext();
        const focus = st.hist.list[st.hist.at];
        const lay = wvLtLayout(ctx.graph, focus, { up: DEPTH_UP, down: DEPTH_DOWN, open: st.open, capUp: CAP_UP, capDown: CAP_DOWN, w: CARD_W, h: CARD_H, gx: GAP_X, gy: GAP_Y });
        const credit = ctx.src ? ctx.src.info.name + " (" + ctx.src.info.licence + ")" : "";
        if (kind === "csv") {
            const csv = wvLtCsv(lay, (k) => { const i = ctx.info(k); return { name: i.name, inst: i.inst, aft: i.pid || "" }; }, credit);
            await IOUtils.writeUTF8(path, "﻿" + csv);
            return true;
        }
        const svg = this._wvLtSvgText(lay, ctx, focus);
        if (kind === "svg") { await IOUtils.writeUTF8(path, svg.text); return true; }
        if (kind !== "png") return false;
        const doc = win.document;
        const img = new win.Image();
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.text);
        await img.decode();
        // Twice the size, within what a canvas holds (16 million pixels).
        const k = Math.max(0.1, Math.min(2, Math.sqrt(16e6 / (svg.w * svg.h))));
        const canvas = doc.createElementNS(XHTML, "canvas");
        canvas.width = Math.round(svg.w * k);
        canvas.height = Math.round(svg.h * k);
        const g = canvas.getContext("2d");
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob: any = await new Promise((res) => canvas.toBlob(res, "image/png"));
        if (!blob) return false;
        await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
        return true;
    }

    /** The tree as a standalone SVG document, in light colours. */
    _wvLtSvgText(lay: WvLtLayout, ctx: WvLtCtx, focus: string): { text: string; w: number; h: number } {
        const ox = PAD - lay.minX, oy = PAD - lay.minY;
        const foot = 40;
        const w = Math.round(lay.maxX - lay.minX + 2 * PAD), h = Math.round(lay.maxY - lay.minY + 2 * PAD + foot);
        const out: string[] = [];
        out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="12">');
        out.push('<rect width="100%" height="100%" fill="#ffffff"/>');
        const dash: Record<string, string> = { postdoc: "6 4", research: "2 3", ra: "1 4", other: "1 4" };
        for (const e of lay.edges) {
            const x1 = e.x1 + ox, y1 = e.y1 + oy, x2 = e.x2 + ox, y2 = e.y2 + oy, ym = e.ym + oy;
            const d = y2 > y1 ? "M" + x1 + " " + y1 + " V" + ym + " H" + x2 + " V" + y2
                : "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 + GAP_Y) + " " + x2 + " " + (y2 - GAP_Y) + " " + x2 + " " + y2;
            out.push('<path d="' + d + '" fill="none" stroke="#8a8a8a" stroke-width="1.25"' + (dash[e.type] ? ' stroke-dasharray="' + dash[e.type] + '"' : "") + (e.co ? ' opacity="0.65"' : "") + "/>");
        }
        // The labels as on screen: none over another.
        for (const s of this._wvLtLabelSpots(lay, ox, oy)) {
            out.push('<text x="' + s.x + '" y="' + s.y + '" font-size="10.5" fill="#6b6b6b">' + xmlEsc(s.text) + (s.tip ? "<title>" + xmlEsc(s.tip) + "</title>" : "") + "</text>");
        }
        for (const n of lay.nodes) {
            const i = ctx.info(n.key);
            const x = n.x + ox, y = n.y + oy;
            const self = n.key === focus;
            const fill = self ? "#4072e5" : "#f6f6f6", ink = self ? "#ffffff" : "#1a1a1a", sub = self ? "#e8eefc" : "#6b6b6b";
            const stroke = i.kind === "rec" ? "#4072e5" : "#9a9a9a";
            out.push('<rect x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="' + (CARD_W - 1) + '" height="' + (CARD_H - 1) + '" rx="8" fill="' + fill + '" stroke="' + stroke + '"' + (i.kind === "rec" ? "" : ' stroke-dasharray="4 3"') + "/>");
            out.push('<circle cx="' + (x + 22) + '" cy="' + (y + 22) + '" r="14" fill="' + (self ? "#6d93eb" : "#e2e2e2") + '"/>');
            out.push('<text x="' + (x + 22) + '" y="' + (y + 26) + '" text-anchor="middle" font-size="11" font-weight="600" fill="' + ink + '">' + xmlEsc(i.initials) + "</text>");
            out.push('<text x="' + (x + 44) + '" y="' + (y + 20) + '" font-weight="600" fill="' + ink + '">' + xmlEsc(cut(i.name, 26)) + "</text>");
            let ty = y + 36;
            if (i.inst) { out.push('<text x="' + (x + 44) + '" y="' + ty + '" font-size="11" fill="' + sub + '"' + (i.instTree ? ' font-style="italic"' : "") + ">" + xmlEsc(cut(i.inst, 30)) + "</text>"); ty += 15; }
            if (i.year) { out.push('<text x="' + (x + 44) + '" y="' + ty + '" font-size="11" fill="' + sub + '">' + xmlEsc(wvStr("weavero-people-lt-phd", { year: i.year }, null)) + "</text>"); }
            if (i.pid && ctx.src) out.push('<text x="' + (x + 44) + '" y="' + (y + CARD_H - 9) + '" font-size="9.5" fill="' + sub + '">' + xmlEsc(ctx.src.info.name + " (" + ctx.src.info.licence + ")") + "</text>");
            if (n.hidUp) out.push('<text x="' + (x + CARD_W / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10.5" fill="#6b6b6b">+' + n.hidUp + "</text>");
            if (n.hidDown) out.push('<text x="' + (x + CARD_W / 2) + '" y="' + (y + CARD_H + 13) + '" text-anchor="middle" font-size="10.5" fill="#6b6b6b">+' + n.hidDown + "</text>");
        }
        if (ctx.src && lay.nodes.some((n) => !!ctx.info(n.key).pid)) {
            const i = ctx.src.info;
            const text = wvStr("weavero-people-lt-credit", { source: i.name, licence: i.licence, version: i.version }, null) + " " + i.site + (i.doi ? " · doi:" + i.doi : "");
            out.push('<text x="' + PAD + '" y="' + (h - 16) + '" font-size="10.5" fill="#6b6b6b">' + xmlEsc(text) + "</text>");
        }
        out.push("</svg>");
        return { text: out.join("\n"), w, h };
    }
}

const _ltDescriptors = Object.getOwnPropertyDescriptors(_PeopleLineageMixin.prototype);
delete (_ltDescriptors as any).constructor;
export const peopleLineageMethods = _ltDescriptors;
