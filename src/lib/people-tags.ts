// Tags on researchers (MJT 2026-11-26: "I should also be able to tag authors,
// same as for the Zotero items"), the rules without the DOM -- modelled on
// Zotero's own (mirror of zotero/zotero):
//   - colours: xpcom/data/tags.js -- at most MAX_COLORED_TAGS (9) coloured
//     tags, an ordered list of {name, color} whose index is the position (the
//     number key minus one); setColor's insert / move / unset;
//     toggleItemsListTags: every one has it -> off for all, else on for all;
//   - the selector's order: containers/tagSelectorContainer.jsx render() -- the
//     coloured tags first by position (shown even when nobody in view has
//     them, then disabled), then the others; its filter case- and accent-
//     insensitive; the selected tags combine with AND;
//   - the palette: elements/colorPicker.js and scss/abstracts/_variables.scss
//     $tagColorsLookup (each colour's theme token).
// The researchers' tags live in people.json (the record's `tags`, the store's
// `tagColors`), never in a library.

import { WvPpRecord, wvPpFold } from "./people-record";

/** Zotero's tag colour palette, in its picker's order, each with the theme
 *  token Zotero paints it with (light and dark). */
export const WV_PP_TAG_PALETTE: ReadonlyArray<{ color: string; token: string; label: string }> = [
    { color: "#ff6666", token: "--tag-red-opaque", label: "general.red" },
    { color: "#ff8c19", token: "--tag-orange-opaque", label: "general.orange" },
    { color: "#999999", token: "--tag-gray-opaque", label: "general.gray" },
    { color: "#5fb236", token: "--tag-green-opaque", label: "general.green" },
    { color: "#009980", token: "--tag-teal-opaque", label: "general.teal" },
    { color: "#2ea8e5", token: "--tag-blue-opaque", label: "general.blue" },
    { color: "#576dd9", token: "--tag-indigo-opaque", label: "general.purple" },
    { color: "#a28ae5", token: "--tag-purple-opaque", label: "general.violet" },
    { color: "#a6507b", token: "--tag-plum-opaque", label: "general.maroon" },
];
/** Zotero.Tags.MAX_COLORED_TAGS. */
export const WV_PP_TAG_COLORS_MAX = 9;

export interface WvPpTagColor { name: string; color: string }

/** A tag as typed: trimmed, NFC (Zotero's cleanData / setColor), "" if empty. */
export function wvPpTagClean(name: any): string {
    return String(name == null ? "" : name).replace(/\s+/g, " ").trim().normalize();
}

/** A record's tags (a copy). */
export function wvPpTagsOf(rec: WvPpRecord | null | undefined): string[] {
    return rec && Array.isArray(rec.tags) ? rec.tags.slice() : [];
}

/** The tags of a stored record, made whole: strings, cleaned, each once. */
export function wvPpTagsNorm(list: any): string[] {
    const out: string[] = [];
    for (const t of Array.isArray(list) ? list : []) {
        const c = wvPpTagClean(t);
        if (c && !out.includes(c)) out.push(c);
    }
    return out;
}

/** The stored colours made whole: a known colour (#rrggbb), a name, each name
 *  once, at most nine. */
export function wvPpTagColorsNorm(list: any): WvPpTagColor[] {
    const out: WvPpTagColor[] = [];
    for (const x of Array.isArray(list) ? list : []) {
        const name = wvPpTagClean(x && x.name);
        const color = String((x && x.color) || "").toLowerCase();
        if (!name || !/^#[0-9a-f]{6}$/.test(color) || out.some((o) => o.name === name)) continue;
        out.push({ name, color });
        if (out.length >= WV_PP_TAG_COLORS_MAX) break;
    }
    return out;
}

/** One spelling across the researchers' tags and the items' (MJT's choice):
 *  a tag typed as one already known, whatever its case or accents, takes the
 *  known spelling -- the researchers' first, then the items'. */
export function wvPpTagSpelling(typed: string, known: string[], itemTags?: string[]): string {
    const c = wvPpTagClean(typed);
    if (!c) return "";
    const lc = c.toLowerCase();
    for (const list of [known, itemTags || []]) {
        const same = list.find((t) => t === c);
        if (same) return same;
        const ci = list.find((t) => t.toLowerCase() === lc);
        if (ci) return ci;
    }
    return c;
}

/** Every tag the researchers have, with how many have it. */
export function wvPpTagCounts(records: WvPpRecord[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of records) for (const t of wvPpTagsOf(r)) m.set(t, (m.get(t) || 0) + 1);
    return m;
}

const byName = (a: string, b: string) => {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
};

export interface WvPpTagEntry { name: string; color: string | null; position: number | null; selected: boolean; disabled: boolean; count: number }

/** The selector's tags (tagSelectorContainer's render): the coloured ones
 *  first, by position, shown even when no researcher in `scope` has them
 *  (then disabled); then the tags of the researchers in `scope`, by name; the
 *  filter case- and accent-insensitive. A selected tag stays listed. */
export function wvPpTagList(scope: WvPpRecord[], colors: WvPpTagColor[], selected: string[], search?: string): WvPpTagEntry[] {
    const inScope = wvPpTagCounts(scope);
    const sel = new Set(selected || []);
    const colored = new Map(colors.map((c, i) => [c.name, { color: c.color, position: i }]));
    const out: WvPpTagEntry[] = [];
    colors.forEach((c, i) => out.push({ name: c.name, color: c.color, position: i, selected: sel.has(c.name), disabled: !inScope.has(c.name), count: inScope.get(c.name) || 0 }));
    const rest = Array.from(new Set([...inScope.keys(), ...sel])).filter((n) => !colored.has(n)).sort(byName);
    for (const n of rest) out.push({ name: n, color: null, position: null, selected: sel.has(n), disabled: !inScope.has(n), count: inScope.get(n) || 0 });
    const f = wvPpFold(search || "");
    return f ? out.filter((t) => wvPpFold(t.name).includes(f)) : out;
}

/** The researchers with every selected tag (the selector's AND). */
export function wvPpTagFilter(records: WvPpRecord[], selected: string[]): WvPpRecord[] {
    const want = (selected || []).filter(Boolean);
    if (!want.length) return records;
    return records.filter((r) => { const t = wvPpTagsOf(r); return want.every((w) => t.includes(w)); });
}

/** Zotero.Tags.toggleItemsListTags on researchers: when every one has the
 *  tag, it goes from all; else every one gets it. The records changed. */
export function wvPpTagToggle(records: WvPpRecord[], name: string): { on: boolean; changed: WvPpRecord[] } {
    const t = wvPpTagClean(name);
    if (!t || !records.length) return { on: false, changed: [] };
    const all = records.every((r) => wvPpTagsOf(r).includes(t));
    return all ? { on: false, changed: wvPpTagSet(records, t, false) } : { on: true, changed: wvPpTagSet(records, t, true) };
}

/** The tag added to (on) or removed from (off) each record; the records changed. */
export function wvPpTagSet(records: WvPpRecord[], name: string, on: boolean): WvPpRecord[] {
    const t = wvPpTagClean(name);
    const changed: WvPpRecord[] = [];
    if (!t) return changed;
    for (const r of records) {
        const tags = wvPpTagsOf(r);
        const has = tags.includes(t);
        if (on && !has) { tags.push(t); r.tags = tags; changed.push(r); }
        else if (!on && has) { const left = tags.filter((x) => x !== t); if (left.length) r.tags = left; else delete r.tags; changed.push(r); }
    }
    return changed;
}

/** Zotero.Tags.setColor on the researchers' list (a copy): `color` null
 *  unsets; a tag already coloured keeps its place unless `position` moves it;
 *  a new one goes at `position` or the end. Null when a tenth would be added. */
export function wvPpTagColorSet(colors: WvPpTagColor[], name: string, color: string | null, position?: number): WvPpTagColor[] | null {
    const n = wvPpTagClean(name);
    const list = colors.slice();
    const at = list.findIndex((c) => c.name === n);
    if (!n) return list;
    if (!color) { if (at >= 0) list.splice(at, 1); return list; }
    const c = String(color).toLowerCase();
    let pos = typeof position === "number" && position >= 0 ? Math.floor(position) : at >= 0 ? at : list.length;
    if (at >= 0) list.splice(at, 1);
    else if (list.length >= WV_PP_TAG_COLORS_MAX) return null;
    if (pos > list.length) pos = list.length;
    list.splice(pos, 0, { name: n, color: c });
    return list;
}

/** A tag renamed in the colours (its place kept), or merged into a coloured
 *  one already there. */
export function wvPpTagColorRename(colors: WvPpTagColor[], from: string, to: string): WvPpTagColor[] {
    const t = wvPpTagClean(to);
    if (!t) return colors.slice();
    if (colors.some((c) => c.name === t)) return colors.filter((c) => c.name !== from);
    return colors.map((c) => (c.name === from ? { name: t, color: c.color } : c));
}

/** What typing `typed` offers (MJT's choice: the researchers' tags, and the
 *  items' too, one spelling): the names that start with it, or have a word
 *  that does, the researchers' first; none already in `exclude`. */
export function wvPpTagSuggest(typed: string, peopleTags: string[], itemTags: string[], exclude?: string[], limit = 12): Array<{ name: string; from: "people" | "items" }> {
    const f = wvPpFold(typed);
    const ex = new Set((exclude || []).map((x) => x.toLowerCase()));
    const seen = new Set<string>();
    const out: Array<{ name: string; from: "people" | "items" }> = [];
    const fits = (n: string) => { if (!f) return true; const g = wvPpFold(n); return g.startsWith(f) || g.split(" ").some((w) => w.startsWith(f)); };
    for (const [list, from] of [[peopleTags.slice().sort(byName), "people"], [itemTags.slice().sort(byName), "items"]] as Array<[string[], "people" | "items"]>) {
        for (const n of list) {
            const k = n.toLowerCase();
            if (seen.has(k) || ex.has(k) || !fits(n)) continue;
            seen.add(k);
            out.push({ name: n, from });
            if (out.length >= limit) return out;
        }
    }
    return out;
}

/** The theme token and colour a tag's dot is painted with. */
export function wvPpTagPaint(color: string): string {
    const p = WV_PP_TAG_PALETTE.find((x) => x.color === String(color || "").toLowerCase());
    return p ? "var(" + p.token + ", " + p.color + ")" : String(color || "currentColor");
}
