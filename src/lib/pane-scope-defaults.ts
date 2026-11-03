// The item pane sections' Settings grid, read in two bundles: the plugin
// (modules/pane-scope.ts, the headers' toggles) and the Settings pane's
// own script (prefs/index.ts, the grid's boxes). One derivation of what a
// row's boxes mean, so the pane's forced pin boxes and the headers' pinned
// toggles never disagree (MJT 2026-11-02, "the settings could decide which
// toggle is pinned, as well as what is the default. The idea is that I
// should always be able to go back to the default").
//
// A row (a section kind) has a cell per toggle, each with a default pref
// `paneScope.<kind>.<cell>` and a pin pref `paneScope.<kind>.pin.<cell>`.
// No imports: the prefs bundle must stay small.

export type WvScopeKindName = "tags" | "related" | "links" | "backlinks";

export const WV_SCOPE_KINDS: WvScopeKindName[] = ["tags", "related", "links", "backlinks"];

/** The levels a row names: the item itself, its attachments, notes,
 *  annotations. Item Links' are where a link is written, a note or an
 *  annotation (a paper writes none itself, a file none). */
export const WV_SCOPE_LEVELS: Record<WvScopeKindName, string[]> = {
    tags: ["own", "att", "note", "ann"],
    related: ["own", "att", "note", "ann"],
    links: ["note", "ann"],
    backlinks: ["own", "att", "note", "ann"],
};

/** Every cell of a row: its levels, then (Item Links, Backlinks) the two
 *  kinds of reference and the internal links, and (Item Links) the broken
 *  links. */
export const WV_SCOPE_CELLS: Record<WvScopeKindName, string[]> = {
    tags: ["own", "att", "note", "ann"],
    related: ["own", "att", "note", "ann"],
    links: ["note", "ann", "zlinks", "citations", "loop", "broken"],
    backlinks: ["own", "att", "note", "ann", "zlinks", "citations", "loop"],
};

/** The pin pref keys, under `paneScope.`: `<kind>.pin.<cell>`. */
export function wvScopePinPrefKeys(): string[] {
    const out: string[] = [];
    for (const kind of WV_SCOPE_KINDS) for (const cell of WV_SCOPE_CELLS[kind]) out.push(kind + ".pin." + cell);
    return out;
}

/** Every default and pin pref key, under `paneScope.` (the pref observer). */
export function wvScopePrefKeys(): string[] {
    const out: string[] = [];
    for (const kind of WV_SCOPE_KINDS) for (const cell of WV_SCOPE_CELLS[kind]) out.push(kind + "." + cell);
    return out.concat(wvScopePinPrefKeys());
}

/** The filter a window starts from, the items list's funnel's shape
 *  (pane-scope.ts WvScopeFilter): the levels shown alone (`inc`), the
 *  internal links (`loop`: -1 hidden, 0 either), the broken links
 *  (`broken`, the same), the kind of reference (`ref`: 1 the Zotero links
 *  only, -1 the note citations only, 0 both). */
export interface WvScopeDefaults { inc: string[]; loop: number; broken: number; ref: number }

/** What a row's boxes say, `get(cell)` each: the levels checked are shown
 *  alone (all or none checked: no level filter); the internal links are
 *  hidden when unchecked, the broken links too; the two kinds of
 *  reference both checked or none mean no filter, one alone only those
 *  (MJT 2026-10-30; 2026-11-02 for the kinds). */
export function wvScopeDefaults(kind: WvScopeKindName, get: (cell: string) => boolean): WvScopeDefaults {
    const levels = WV_SCOPE_LEVELS[kind];
    const cells = WV_SCOPE_CELLS[kind];
    const on = levels.filter((l) => !!get(l));
    const d: WvScopeDefaults = { inc: on.length && on.length < levels.length ? on : [], loop: 0, broken: 0, ref: 0 };
    if (cells.indexOf("loop") >= 0 && !get("loop")) d.loop = -1;
    if (cells.indexOf("broken") >= 0 && !get("broken")) d.broken = -1;
    if (cells.indexOf("zlinks") >= 0) {
        const z = !!get("zlinks"), c = !!get("citations");
        d.ref = z === c ? 0 : z ? 1 : -1;
    }
    return d;
}

/** The cells the defaults put in a non-neutral state: a level shown alone,
 *  the internal or the broken links hidden, one kind of reference alone
 *  (both cells of the pair: two counts, one state). Pinned by necessity --
 *  a window cannot be brought back to a default whose toggle is not drawn
 *  on an item where that toggle's count is 0 (pane-scope.ts
 *  _wvScopePinned; the pane's forced boxes, prefs/index.ts). */
export function wvScopeDefaultNamedCells(kind: WvScopeKindName, get: (cell: string) => boolean): string[] {
    const d = wvScopeDefaults(kind, get);
    const out = d.inc.slice();
    if (d.loop !== 0) out.push("loop");
    if (d.broken !== 0) out.push("broken");
    if (d.ref !== 0) out.push("zlinks", "citations");
    return out;
}
