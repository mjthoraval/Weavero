// The monitors, and the side-by-side spans a window can fill: "maximize to 2
// of my 3 monitors" (MJT 2026-11-11, option 1 -- the maximize button's
// right-click menu, modules/max-span.ts).
//
// Units: DESKTOP pixels throughout, the ones nsIScreenManager.screenForRect
// takes and nsIScreen.Get*RectDisplayPix gives. On Windows they are device
// pixels (measured 2026-11-11 on a 100% / 100% / 125% desktop: every screen's
// contentsScaleFactor 1, GetRectDisplayPix === GetRect), so one coordinate
// space covers monitors of different scales -- window.screenX / moveTo do NOT:
// they are CSS pixels of the window's CURRENT monitor (a window at device
// x 3840 on the 125% monitor reads screenX 3072).
//
// The screen manager lists no screens to script (screenForRect, primaryScreen
// and totalScreenPixels only, Zotero 11.0-beta.4 and 10.0.8): the monitors are
// found by probing just outside each known monitor's edges. A probe that hits
// no monitor answers the nearest one (ScreenManager.cpp ScreenForRect), which
// is already known, so the walk ends; monitors that touch no other one are
// never found, and could not be in a span anyway.
//
// A span is a RUN of monitors side by side -- left to right, or top to bottom
// -- and fills the area every one of them has free: horizontally from the first
// one's available left edge to the last one's available right edge, vertically
// the band all of them have available (a 1080 and a 1200 monitor share the
// 1080 one's band, never a box that runs off the shorter one). A run whose
// shared band is under half the shortest monitor's, or that would cover a
// taskbar standing between two of its monitors, is not offered.

declare const Components: any;

/** x, y, width, height. */
export type WvRect = [number, number, number, number];

export interface WvScreen {
    /** The whole monitor, desktop pixels. */
    rect: WvRect;
    /** Its free area (taskbar, dock and panels excluded), desktop pixels. */
    avail: WvRect;
    /** Device pixels per CSS pixel (Windows' display scale, 1.25 = 125%). */
    scale: number;
}

/** How a monitor is named in the menu: by position, or by number. */
export interface WvScreenName { position: "left" | "middle" | "right" | "top" | "bottom" | "number"; number: number }

export interface WvSpan {
    /** "h:0,1": the axis and the members' indexes in the ordered list. */
    key: string;
    axis: "h" | "v";
    members: number[];
    /** The area the window fills, desktop pixels. */
    rect: WvRect;
    /** The members differ in display scale: the window is drawn at one. */
    mixed: boolean;
    /** Which label: two monitors, every monitor (three or more), or a longer
     *  run that is not all of them. */
    kind: "pair" | "all" | "range";
    /** The menu label: a weavero.ftl id (the caller's, for `kind`) and its
     *  arguments. */
    l10n: { id: string; args: any };
}

/** The weavero.ftl message for each kind of span label. */
export type WvSpanLabelIds = { pair: string; all: string; range: string };

/** Edges this close (desktop px) count as touching. */
const TOUCH = 2;
/** A probe every this many desktop px along each edge. */
const PROBE_STEP = 32;
const MAX_SCREENS = 16;

const right = (r: WvRect) => r[0] + r[2];
const bottom = (r: WvRect) => r[1] + r[3];
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** `b` sits right of `a`, touching it. */
function besideRight(a: WvScreen, b: WvScreen): boolean {
    return Math.abs(right(a.rect) - b.rect[0]) <= TOUCH && overlap(a.rect[1], bottom(a.rect), b.rect[1], bottom(b.rect)) > 0;
}

/** `b` sits below `a`, touching it. */
function besideBelow(a: WvScreen, b: WvScreen): boolean {
    return Math.abs(bottom(a.rect) - b.rect[1]) <= TOUCH && overlap(a.rect[0], right(a.rect), b.rect[0], right(b.rect)) > 0;
}

/** The monitors in naming order, and how the layout reads: one row, one
 *  column, or anything else. */
export function wvScreenLayout(screens: WvScreen[]): { screens: WvScreen[]; layout: "row" | "column" | "other" } {
    const byX = screens.slice().sort((a, b) => a.rect[0] - b.rect[0] || a.rect[1] - b.rect[1]);
    if (byX.length > 1 && byX.every((s, i) => i === 0 || besideRight(byX[i - 1], s))) return { screens: byX, layout: "row" };
    const byY = screens.slice().sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
    if (byY.length > 1 && byY.every((s, i) => i === 0 || besideBelow(byY[i - 1], s))) return { screens: byY, layout: "column" };
    return { screens: byX, layout: "other" };
}

/** Each monitor's name: Left / Middle / Right in a row of two or three, Top /
 *  Middle / Bottom in a column of two or three, else Monitor 1..N in order
 *  (left to right, or top to bottom in a column). */
export function wvScreenNames(n: number, layout: "row" | "column" | "other"): WvScreenName[] {
    const out: WvScreenName[] = [];
    for (let i = 0; i < n; i++) {
        let position: WvScreenName["position"] = "number";
        if (layout === "row" && n <= 3) position = i === 0 ? "left" : (i === n - 1 ? "right" : "middle");
        else if (layout === "column" && n <= 3) position = i === 0 ? "top" : (i === n - 1 ? "bottom" : "middle");
        out.push({ position, number: i + 1 });
    }
    return out;
}

/** Every run of two or more monitors following `next` (a monitor's
 *  neighbour to the right, or below). */
function runs(screens: WvScreen[], next: (a: WvScreen, b: WvScreen) => boolean): number[][] {
    const out: number[][] = [];
    const walk = (path: number[]) => {
        const last = screens[path[path.length - 1]];
        for (let j = 0; j < screens.length; j++) {
            if (path.includes(j) || !next(last, screens[j])) continue;
            const p = path.concat(j);
            out.push(p);
            walk(p);
        }
    };
    for (let i = 0; i < screens.length; i++) walk([i]);
    return out;
}

/** The rect a run fills, or null when it cannot: under half the shortest
 *  member's free height (width, for a column) in common, or a taskbar between
 *  two members. */
function runRect(members: WvScreen[], axis: "h" | "v"): WvRect | null {
    const across = axis === "h" ? 1 : 0;   // the shared band's axis
    const along = axis === "h" ? 0 : 1;
    const lo = Math.max(...members.map((s) => s.avail[across]));
    const hi = Math.min(...members.map((s) => s.avail[across] + s.avail[across + 2]));
    const shortest = Math.min(...members.map((s) => s.avail[across + 2]));
    if (hi - lo < Math.max(200, shortest / 2)) return null;
    // Every boundary inside the run is free on both sides: a taskbar standing
    // there would end up under the window.
    for (let i = 0; i + 1 < members.length; i++) {
        const a = members[i], b = members[i + 1];
        const aEnd = a.rect[along] + a.rect[along + 2], aFreeEnd = a.avail[along] + a.avail[along + 2];
        if (Math.abs(aEnd - aFreeEnd) > TOUCH || Math.abs(b.rect[along] - b.avail[along]) > TOUCH) return null;
    }
    const first = members[0], last = members[members.length - 1];
    const start = first.avail[along], end = last.avail[along] + last.avail[along + 2];
    return axis === "h" ? [start, lo, end - start, hi - lo] : [lo, start, hi - lo, end - start];
}

/** The spans `screens` offer, in menu order: the ones within one display
 *  scale first, then side by side before stacked, shorter before longer,
 *  leftmost (topmost) first. `nameText` gives a monitor's name in the UI
 *  language (weavero.ftl `weavero-maxspan-monitor`), `ids` the label
 *  messages. None with one monitor. */
export function wvSpanCombos(screensIn: WvScreen[], nameText: (n: WvScreenName) => string, ids: WvSpanLabelIds): WvSpan[] {
    const { screens, layout } = wvScreenLayout(screensIn || []);
    if (screens.length < 2) return [];
    const names = wvScreenNames(screens.length, layout);
    const out: WvSpan[] = [];
    for (const [axis, next] of [["h", besideRight], ["v", besideBelow]] as const) {
        for (const members of runs(screens, next)) {
            const rect = runRect(members.map((i) => screens[i]), axis);
            if (!rect) continue;
            const scales = new Set(members.map((i) => Math.round(screens[i].scale * 100)));
            const mixed = scales.size > 1 ? "yes" : "no";
            const first = nameText(names[members[0]]), last = nameText(names[members[members.length - 1]]);
            let kind: WvSpan["kind"], args: any;
            if (members.length === screens.length && members.length >= 3) { kind = "all"; args = { count: members.length, mixed }; }
            else if (members.length === 2) { kind = "pair"; args = { first, second: last, mixed }; }
            else { kind = "range"; args = { first, last, count: members.length, mixed }; }
            out.push({ key: axis + ":" + members.join(","), axis, members, rect, mixed: mixed === "yes", kind, l10n: { id: ids[kind], args } });
        }
    }
    out.sort((a, b) => Number(a.mixed) - Number(b.mixed)
        || (a.axis === b.axis ? 0 : (a.axis === "h" ? -1 : 1))
        || a.members.length - b.members.length
        || a.members[0] - b.members[0]);
    return out;
}

/** The span whose area is `rect` (within a couple of pixels), or null. */
export function wvSpanByRect(spans: WvSpan[], rect: WvRect | null | undefined): WvSpan | null {
    if (!rect) return null;
    return spans.find((s) => s.rect.every((v, i) => Math.abs(v - rect[i]) <= TOUCH)) || null;
}

/** Every monitor, from Gecko's screen manager (see the top of this file).
 *  Empty when there is none to read. */
export function wvScreensFromGecko(): WvScreen[] {
    const Cc = Components.classes, Ci = Components.interfaces;
    const sm: any = Cc["@mozilla.org/gfx/screenmanager;1"].getService(Ci.nsIScreenManager);
    const read = (s: any, m: string): WvRect => {
        const a: any = {}, b: any = {}, c: any = {}, d: any = {};
        s[m](a, b, c, d);
        return [a.value, b.value, c.value, d.value];
    };
    const found: Array<{ s: any; rect: WvRect }> = [];
    const add = (s: any) => {
        if (!s || found.length >= MAX_SCREENS) return;
        const rect = read(s, "GetRectDisplayPix");
        if (!(rect[2] > 0 && rect[3] > 0)) return;
        if (found.some((f) => f.s === s || f.rect.every((v, i) => v === rect[i]))) return;
        found.push({ s, rect });
    };
    add(sm.primaryScreen);
    for (let i = 0; i < found.length; i++) {
        const [x, y, w, h] = found[i].rect;
        const at = (fx: number, fy: number) => { try { add(sm.screenForRect(fx, fy, 1, 1)); } catch (e) {} };
        for (let t = 0; t <= h; t += PROBE_STEP) { at(x - 2, y + t); at(x + w + 1, y + t); }
        at(x - 2, y + h - 1); at(x + w + 1, y + h - 1);
        for (let t = 0; t <= w; t += PROBE_STEP) { at(x + t, y - 2); at(x + t, y + h + 1); }
        at(x + w - 1, y - 2); at(x + w - 1, y + h + 1);
    }
    return found.map((f) => ({
        rect: f.rect,
        avail: read(f.s, "GetAvailRectDisplayPix"),
        scale: Number(f.s.defaultCSSScaleFactor) || 1,
    }));
}
