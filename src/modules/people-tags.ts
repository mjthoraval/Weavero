// Tags on researchers (MJT 2026-11-26: "I should also be able to tag authors,
// same as for the Zotero items"; his choices, asked the same day): Zotero's
// model, read in the mirror of zotero/zotero and reused as follows --
//   - the TAG SELECTOR at the bottom of the left pane, as under the
//     collections (containers/tagSelectorContainer.jsx, components/
//     tagSelector*.jsx, scss/components/_tagSelector.scss): the coloured tags
//     first, by position, then the tags of the researchers in view, by name; a
//     click selects or deselects a tag (Zotero's selector has no Ctrl or Alt
//     click: none here either); the selected tags combine with AND; the filter
//     box under the list (Zotero's "tagselector-search" string, case- and
//     accent-insensitive), its actions button (Zotero's filter icon) with
//     Deselect all; the tags of the selected researchers marked (MJT's wish:
//     not a Zotero feature);
//   - COLOURED tags (xpcom/data/tags.js): nine at most, an ordered list whose
//     index is the position; Zotero's palette and labels (elements/
//     colorPicker.js, its general.* strings); a dot per coloured tag on each
//     row, as the items list's swatches; the number keys 1-9 toggle that tag
//     on the selected researchers -- every one has it: off for all, else on
//     for all (toggleItemsListTags);
//   - tag NAMES: the researchers' own list; typing suggests the items' tags
//     too (Zotero.Tags.getAll, read only), one spelling across both;
//   - the page's tags (a chip each; in the edit mode a remove button and a
//     field with suggestions, as elements/tagsBox.js adds tags), the bar's Tag
//     menu for the checked researchers, the table's search finding tags, an
//     optional Tags column (lib/people-list.ts, people-table.ts).
// Stored in people.json (the record's `tags`, the store's `tagColors`), never
// in a library; nothing is synced. Per window: the selection and the filter
// text are the view's (people.ts), not saved.
//
// Mixed onto WeaveroPlugin.prototype after people-table.ts (index.ts).

import { wvLivePlugin } from "../lib/live";
import { wvStr, wvL10n } from "../lib/l10n";
import { wvHtmlEl, wvSetBoolAttr } from "../lib/dom";
import { wvMenuItem } from "../lib/menu";
import { WvPpRecord } from "../lib/people-record";
import {
    WV_PP_TAG_PALETTE, WvPpTagColor,
    wvPpTagClean, wvPpTagColorRename, wvPpTagColorSet, wvPpTagCounts, wvPpTagList, wvPpTagPaint, wvPpTagSet, wvPpTagSpelling,
    wvPpTagSuggest, wvPpTagToggle, wvPpTagsOf,
} from "../lib/people-tags";

declare const Zotero: any;
declare const Services: any;

const live = (): any => wvLivePlugin();
const MENU_TAG = "wv-pp-tagmenu";
const MENU_TAGSEL = "wv-pp-tagsel-menu";
const MENU_BULKTAG = "wv-pp-bulktag-menu";
/** The items' tag names are read again after this long (a suggestion's source). */
const ITEM_TAGS_TTL = 60000;
const FILTER_ICON = "chrome://zotero/skin/16/universal/filter.svg";

/** A filled circle of `color` for a menu entry's icon. */
const swatch = (color: string) => "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="' + color + '"/></svg>');

export const WV_PP_TAGS_CSS = `
/* The tag selector (scss/components/_tagSelector.scss's values): small tags, 1 x 4 px padding, 4-px corners;
   selected: the background's colour on fill-secondary; coloured: bold, a dot before the name. */
.wv-pp-tagsel { flex: 0 0 auto; max-height: 40%; min-height: 64px; display: flex; flex-direction: column; border-top: 1px solid var(--color-panedivider, rgba(127,127,127,.3)); }
.wv-pp-taglist { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 2px; padding: 9px 8px 8px; scrollbar-width: thin; }
.wv-pp-tagsep { flex: 0 0 100%; height: 4px; }
.wv-pp-tag { border-radius: 4px; cursor: pointer; font-size: 0.85em; line-height: 1.272727273; padding: 1px 4px; white-space: pre; overflow: hidden; text-overflow: ellipsis; max-width: 100%; box-sizing: border-box; color: var(--fill-primary, CanvasText); }
.wv-pp-tag:hover { background-color: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-tag:focus-visible { outline: 2px solid var(--color-focus-outline, var(--accent-blue, #4072e5)); outline-offset: -1px; }
.wv-pp-tag.selected { color: var(--material-background, Canvas); background-color: var(--fill-secondary, GrayText); }
.wv-pp-tag.selected:hover { opacity: .75; }
.wv-pp-tag.colored { font-weight: 600; }
.wv-pp-tag.colored::before { content: " "; display: inline-block; width: 0.636363636em; height: 0.636363636em; margin-inline-end: .272727273em; border-radius: 50%;
  background-color: var(--wv-pp-tagc, currentColor); vertical-align: -0.0909em; border: 1px solid transparent; }
.wv-pp-tag.colored.selected { background-color: var(--wv-pp-tagc, currentColor); }
.wv-pp-tag.colored.selected::before { border-color: var(--material-background, Canvas); }
.wv-pp-tag.disabled { opacity: .6; cursor: default; }
/* The tags of the selected researchers (MJT's wish). */
.wv-pp-tag.wv-pp-tag-hl:not(.selected) { box-shadow: inset 0 0 0 1px var(--fill-secondary, GrayText); }
.wv-pp-tagsel-none { color: var(--fill-secondary, GrayText); font-size: 0.85em; padding: 4px; }
.wv-pp-tagsel-filter { flex: none; display: flex; align-items: center; gap: 4px; margin: 0 8px; padding: 4px 0; border-top: 1px solid var(--color-panedivider, rgba(127,127,127,.3)); }
.wv-pp-tagsel-filter > .wv-pp-tagsel-search { flex: 1 1 auto; min-width: 0; margin: 0; }
.wv-pp-tagsel-actions { flex: none; appearance: none; margin: 0; padding: 3px 4px; border: 0; border-radius: 5px; background: transparent; display: inline-flex; align-items: center;
  -moz-context-properties: fill; fill: var(--fill-secondary, GrayText); cursor: default; }
.wv-pp-tagsel-actions:hover { background-color: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-tagsel-actions > img { width: 16px; height: 16px; }
/* A coloured tag's dot on a row (the items list's swatches). */
.wv-pp-tdots { display: inline-flex; gap: 2px; margin-inline-start: 6px; flex: none; }
.wv-pp-tdot { width: 0.92307692em; height: 0.92307692em; border-radius: 50%; background: var(--wv-pp-tagc, currentColor); }
/* The page's tags. */
.wv-pp-tagchips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.wv-pp-tagchip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 6px; border-radius: 10px; font-size: 0.92em;
  background: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-tagchip.colored { font-weight: 600; }
.wv-pp-tagchip.colored::before { content: ""; width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--wv-pp-tagc, currentColor); margin-inline-end: 2px; }
.wv-pp-tagchip > button { appearance: none; font: inherit; line-height: 1; border: none; background: transparent; color: inherit; padding: 0 2px; margin: 0; border-radius: 6px; cursor: default; }
.wv-pp-tagchip > button:hover { background: var(--fill-quinary, rgba(127,127,127,.25)); }
.wv-pp-tagadd { margin-top: 6px; max-width: 22em; }
.wv-pp-tagadd input { width: 100%; box-sizing: border-box; }
`;

class _PeopleTagsMixin {
    [k: string]: any;

    // ---- the store ------------------------------------------------------------------------

    /** The coloured tags, in position order (people.json's `tagColors`). */
    _wvPeopleTagColors(): WvPpTagColor[] {
        const db = (this as any)._wvPeopleDB;
        return db && Array.isArray(db.tagColors) ? db.tagColors : [];
    }

    /** Every tag a researcher has, by name. */
    _wvPeopleTagNames(): string[] {
        return Array.from(wvPpTagCounts(this._wvPeopleAllSync()).keys());
    }

    /** A tag's colour set (`color` null: unset), at `position` or kept / last
     *  (Zotero.Tags.setColor); saved. False when a tenth would be coloured. */
    async _wvPeopleTagColorSet(win: any, name: string, color: string | null, position?: number): Promise<boolean> {
        await this._wvPeopleLoad();
        const db = (this as any)._wvPeopleDB;
        if (!db) return false;
        const next = wvPpTagColorSet(this._wvPeopleTagColors(), name, color, position);
        if (!next) {
            try { Services.prompt.alert(win, wvStr("weavero-people-tags", null, null), wvStr("weavero-people-tag-colors-full", null, null)); } catch (e) {}
            return false;
        }
        db.tagColors = next;
        await this._wvPeopleSave();
        return true;
    }

    /** The items' tag names, every library (Zotero.Tags.getAll: read only),
     *  kept a minute. */
    async _wvPeopleItemTags(): Promise<string[]> {
        const P: any = this;
        if (P._wvPpItemTags && Date.now() - P._wvPpItemTags.at < ITEM_TAGS_TTL) return P._wvPpItemTags.names;
        if (P._wvPpItemTagsLoading) return P._wvPpItemTagsLoading;
        P._wvPpItemTagsLoading = (async () => {
            const names = new Set<string>();
            for (const lib of Zotero.Libraries.getAll()) {
                if (lib.libraryType === "feed") continue;
                try { for (const t of await Zotero.Tags.getAll(lib.libraryID)) if (t && t.tag) names.add(String(t.tag)); } catch (e) {}
            }
            P._wvPpItemTags = { names: Array.from(names), at: Date.now() };
            return P._wvPpItemTags.names;
        })().finally(() => { P._wvPpItemTagsLoading = null; });
        return P._wvPpItemTagsLoading;
    }

    /** The items' tag names read so far ([] before the first read, which starts). */
    _wvPeopleItemTagsSync(): string[] {
        const P: any = this;
        if (!P._wvPpItemTags || Date.now() - P._wvPpItemTags.at >= ITEM_TAGS_TTL) this._wvPeopleItemTags().catch(() => {});
        return P._wvPpItemTags ? P._wvPpItemTags.names : [];
    }

    /** `name` on (true), off (false) or toggled (null: Zotero's number keys)
     *  for the researchers `ids`; saved. */
    async _wvPeopleTagApply(win: any, ids: string[], name: string, on: boolean | null): Promise<WvPpRecord[]> {
        await this._wvPeopleLoad();
        const recs = ids.map((id) => this._wvPeopleGetRec(id)).filter(Boolean) as WvPpRecord[];
        const t = wvPpTagClean(name);
        if (!t || !recs.length) return [];
        const changed = on === null ? wvPpTagToggle(recs, t).changed : wvPpTagSet(recs, t, on);
        if (changed.length) await this._wvPeopleSave(changed);
        return changed;
    }

    /** One spelling (MJT's choice): as a researcher's tag first, else as an item's. */
    _wvPeopleTagSpell(name: string): string {
        return wvPpTagSpelling(name, this._wvPeopleTagNames(), this._wvPeopleItemTagsSync());
    }

    // ---- the selector ---------------------------------------------------------------------

    /** A tag selected or deselected in the selector (a page open goes back to
     *  the table it filters). */
    _wvPeopleTagSel(win: any, name: string) {
        const v = this._wvPeopleViewOf(win);
        if (!v) return;
        const sel = new Set<string>(v.tagSel || []);
        if (sel.has(name)) sel.delete(name); else sel.add(name);
        v.tagSel = Array.from(sel);
        if (v.sel || (v.view && v.view !== "table")) { v.sel = null; v.view = "table"; v.editing = null; v.nameEdit = null; v.evEdit = null; v.evForm = null; v.pageEdit = false; v.pageEditFor = null; }
        this._wvPeopleTabRender(win);
    }

    /** Deselect all. */
    _wvPeopleTagSelClear(win: any) {
        const v = this._wvPeopleViewOf(win);
        if (!v) return;
        v.tagSel = [];
        this._wvPeopleTabRender(win);
    }

    /** The researchers the selection acts on: the checked rows, else the row
     *  selected (the right pane's), else none. */
    _wvPeopleTagTargets(win: any): string[] {
        const v = this._wvPeopleViewOf(win);
        if (!v) return [];
        if (v.checked && v.checked.size) return Array.from(v.checked as Set<string>);
        try {
            const tree = this._wvPeopleTableOf(win);
            const ids = this._wvPeopleTableIds(win);
            if (tree && tree.selection && tree.selection.count && tree.selection.focused >= 0 && ids[tree.selection.focused]) return [ids[tree.selection.focused]];
        } catch (e) {}
        return v.paneSel ? [v.paneSel] : [];
    }

    /** A number key (1-9) on the table: the coloured tag at that position
     *  toggled on the selected researchers. False when no tag has that position. */
    _wvPeopleTagKey(win: any, n: number): boolean {
        const c = this._wvPeopleTagColors()[n - 1];
        if (!c) return false;
        const ids = this._wvPeopleTagTargets(win);
        if (ids.length) this._wvPeopleTagApply(win, ids, c.name, null).catch((e: any) => Zotero.debug("[Weavero] people tag key err: " + e));
        return true;
    }

    /** The selector, at the bottom of the left pane: the tags, then the filter
     *  box and the actions button. Its scope: the researchers the table shows. */
    _wvPeopleRenderTagSel(win: any, side: any, v: any) {
        const doc = win.document;
        const scope: WvPpRecord[] = this._wvPeopleTableRows(win);
        const colors = this._wvPeopleTagColors();
        const entries = wvPpTagList(scope, colors, v.tagSel || [], v.tagQ || "");
        // The tags of the selected researchers, marked.
        const hl = new Set<string>();
        for (const id of this._wvPeopleTagTargets(win)) for (const t of wvPpTagsOf(this._wvPeopleGetRec(id))) hl.add(t);
        const box = wvHtmlEl(doc, "div", "wv-pp-tagsel", undefined, side);
        const list = wvHtmlEl(doc, "div", "wv-pp-taglist", undefined, box);
        list.setAttribute("role", "group");
        list.setAttribute("aria-label", wvStr("weavero-people-tags", null, null));
        if (!entries.length) wvHtmlEl(doc, "div", "wv-pp-tagsel-none", wvStr("weavero-people-tagsel-none", null, null), list);
        let sep = false;
        for (const t of entries) {
            if (!sep && t.color == null && entries[0].color != null) { wvHtmlEl(doc, "div", "wv-pp-tagsep", undefined, list); sep = true; }
            const el = wvHtmlEl(doc, "div", "wv-pp-tag", undefined, list);
            el.setAttribute("data-wv-pp-tag", t.name);
            el.setAttribute("role", "checkbox");
            el.setAttribute("tabindex", "0");
            el.setAttribute("aria-checked", t.selected ? "true" : "false");
            if (t.disabled) { el.classList.add("disabled"); el.setAttribute("aria-disabled", "true"); }
            if (t.selected) el.classList.add("selected");
            if (hl.has(t.name)) el.classList.add("wv-pp-tag-hl");
            if (t.color) {
                el.classList.add("colored");
                el.setAttribute("data-color", t.color);
                el.style.setProperty("--wv-pp-tagc", wvPpTagPaint(t.color));
            }
            wvHtmlEl(doc, "span", undefined, t.name, el);
            el.setAttribute("title", t.name);
            const name = t.name;
            const pick = () => { if (el.classList.contains("disabled")) return; const lp: any = live(); if (lp) lp._wvPeopleTagSel(win, name); };
            el.addEventListener("click", pick);
            el.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
            el.addEventListener("contextmenu", (e: any) => { e.preventDefault(); const lp: any = live(); if (lp) lp._wvPeopleTagMenu(win, name, e.screenX, e.screenY); });
        }
        const pane = wvHtmlEl(doc, "div", "wv-pp-tagsel-filter", undefined, box);
        const s = doc.createXULElement("search-textbox");
        s.className = "wv-pp-tagsel-search";
        s.setAttribute("data-wv-pp-focus", "tagsearch");
        // Zotero's own string (zotero.ftl tagselector-search: "Filter Tags").
        s.setAttribute("data-l10n-id", "tagselector-search");
        s.setAttribute("data-l10n-attrs", "placeholder");
        if (v.tagQ) s.setAttribute("value", v.tagQ);
        pane.appendChild(s);
        try { if (v.tagQ && s.value !== v.tagQ) s.value = v.tagQ; } catch (e) {}
        // As the table's search: a field the redraw replaced is ignored.
        const onFilter = () => { if (!s.isConnected) return; const lp: any = live(); const vv = lp && lp._wvPeopleViewOf(win); if (!lp || !vv) return; const val = String(s.value || ""); if (val === (vv.tagQ || "")) return; vv.tagQ = val; lp._wvPeopleTabRender(win); };
        s.addEventListener("input", onFilter);
        s.addEventListener("command", onFilter);
        const act = wvHtmlEl(doc, "button", "wv-pp-tagsel-actions", undefined, pane);
        act.setAttribute("type", "button");
        act.setAttribute("data-wv-pp-act", "tagsel-actions");
        const tip = wvStr("weavero-people-tagsel-actions", null, "title");
        act.setAttribute("title", tip);
        act.setAttribute("aria-label", tip);
        act.setAttribute("aria-haspopup", "menu");
        const img = wvHtmlEl(doc, "img", undefined, undefined, act);
        img.setAttribute("src", FILTER_ICON);
        img.setAttribute("alt", "");
        act.addEventListener("click", () => {
            const lp: any = live();
            if (!lp) return;
            lp._wvPeopleMenuAt(win, MENU_TAGSEL, act, 0, 0, (pop: any) => {
                wvMenuItem(doc, { l10n: { id: "weavero-people-tagsel-deselect" }, attrs: { "data-wv-pp-tagsel": "deselect" }, disabled: !(v.tagSel && v.tagSel.length),
                    onCommand: () => { const lp2: any = live(); if (lp2) lp2._wvPeopleTagSelClear(win); } }, pop);
            });
        });
    }

    /** A tag's menu (a right-click in the selector): its colour (Zotero's
     *  palette) and position, Remove color, Rename, Delete. */
    _wvPeopleTagMenu(win: any, name: string, x: number, y: number): any {
        const doc = win.document;
        const colors = this._wvPeopleTagColors();
        const at = colors.findIndex((c) => c.name === name);
        const sub = (act: string, attrs: Record<string, string>, fill: (p: any) => void, parent: any) => {
            const m = doc.createXULElement("menu");
            wvL10n(m, "weavero-people-tag-menu", { act });
            for (const k of Object.keys(attrs)) m.setAttribute(k, attrs[k]);
            const p = doc.createXULElement("menupopup");
            fill(p);
            m.appendChild(p);
            parent.appendChild(m);
            return m;
        };
        return this._wvPeopleMenuAt(win, MENU_TAG, null, x, y, (pop: any) => {
            sub("color", { "data-wv-pp-tagmenu": "color" }, (p: any) => {
                for (const c of WV_PP_TAG_PALETTE) {
                    let label = c.color;
                    try { label = Zotero.getString(c.label) || c.color; } catch (e) {}
                    const mi = wvMenuItem(doc, { label, image: swatch(c.color), attrs: { "data-wv-pp-tagcolor": c.color },
                        onCommand: () => { const lp: any = live(); if (lp) return lp._wvPeopleTagColorSet(win, name, c.color); } }, p);
                    if (at >= 0 && colors[at].color === c.color) { mi.setAttribute("type", "radio"); wvSetBoolAttr(mi, "checked", true); }
                }
            }, pop);
            if (at >= 0) {
                sub("position", { "data-wv-pp-tagmenu": "position" }, (p: any) => {
                    for (let i = 0; i < colors.length; i++) {
                        const mi = wvMenuItem(doc, { label: String(i + 1), attrs: { "data-wv-pp-tagpos": String(i + 1), type: "radio" },
                            onCommand: () => { const lp: any = live(); if (lp) return lp._wvPeopleTagColorSet(win, name, colors[at].color, i); } }, p);
                        if (i === at) wvSetBoolAttr(mi, "checked", true);
                    }
                }, pop);
                wvMenuItem(doc, { l10n: { id: "weavero-people-tag-menu", args: { act: "nocolor" } }, attrs: { "data-wv-pp-tagmenu": "nocolor" },
                    onCommand: () => { const lp: any = live(); if (lp) return lp._wvPeopleTagColorSet(win, name, null); } }, pop);
            }
            pop.appendChild(doc.createXULElement("menuseparator"));
            wvMenuItem(doc, { l10n: { id: "weavero-people-tag-menu", args: { act: "rename" } }, attrs: { "data-wv-pp-tagmenu": "rename" },
                onCommand: () => { const lp: any = live(); if (lp) return lp._wvPeopleTagRename(win, name); } }, pop);
            wvMenuItem(doc, { l10n: { id: "weavero-people-tag-menu", args: { act: "delete" } }, attrs: { "data-wv-pp-tagmenu": "delete" },
                onCommand: () => { const lp: any = live(); if (lp) return lp._wvPeopleTagDelete(win, name); } }, pop);
        });
    }

    /** A tag renamed for every researcher (`to`: else asked), its colour and
     *  selection following; merged into a tag of that name already there. */
    async _wvPeopleTagRename(win: any, from: string, to?: string): Promise<boolean> {
        let next = to;
        if (next == null) {
            const val: any = { value: from };
            let ok = false;
            try { ok = Services.prompt.prompt(win, wvStr("weavero-people-tags", null, null), wvStr("weavero-people-tag-rename-prompt", { name: from }, null), val, null, {}); } catch (e) {}
            if (!ok) return false;
            next = String(val.value || "");
        }
        const t = wvPpTagSpelling(next, this._wvPeopleTagNames().filter((n) => n !== from), this._wvPeopleItemTagsSync());
        if (!t || t === from) return false;
        await this._wvPeopleLoad();
        const changed: WvPpRecord[] = [];
        for (const r of this._wvPeopleAllSync()) {
            const tags = wvPpTagsOf(r);
            if (!tags.includes(from)) continue;
            const out: string[] = [];
            for (const x of tags) { const y = x === from ? t : x; if (!out.includes(y)) out.push(y); }
            r.tags = out;
            changed.push(r);
        }
        const db = (this as any)._wvPeopleDB;
        if (db) db.tagColors = wvPpTagColorRename(this._wvPeopleTagColors(), from, t);
        const v = this._wvPeopleViewOf(win);
        if (v && v.tagSel) v.tagSel = Array.from(new Set((v.tagSel as string[]).map((x) => (x === from ? t : x))));
        await this._wvPeopleSave(changed);
        return true;
    }

    /** A tag taken from every researcher (asked first unless `ask` false), its
     *  colour too. */
    async _wvPeopleTagDelete(win: any, name: string, ask = true): Promise<boolean> {
        await this._wvPeopleLoad();
        const recs = this._wvPeopleAllSync().filter((r: WvPpRecord) => wvPpTagsOf(r).includes(name));
        if (ask) {
            let ok = false;
            try { ok = Services.prompt.confirm(win, wvStr("weavero-people-tags", null, null), wvStr("weavero-people-tag-delete-ask", { name, count: recs.length }, null)); } catch (e) {}
            if (!ok) return false;
        }
        const changed = wvPpTagSet(recs, name, false);
        const db = (this as any)._wvPeopleDB;
        if (db) db.tagColors = this._wvPeopleTagColors().filter((c) => c.name !== name);
        const v = this._wvPeopleViewOf(win);
        if (v && v.tagSel) v.tagSel = (v.tagSel as string[]).filter((x) => x !== name);
        await this._wvPeopleSave(changed);
        return true;
    }

    // ---- the rows, the bar ------------------------------------------------------------------

    /** A row's dots: its coloured tags, by position (the items list's swatches). */
    _wvPeopleTagDots(doc: any, parent: any, rec: WvPpRecord) {
        const tags = wvPpTagsOf(rec);
        if (!tags.length) return;
        const colored = this._wvPeopleTagColors().filter((c) => tags.includes(c.name));
        if (!colored.length) return;
        const box = wvHtmlEl(doc, "span", "wv-pp-tdots", undefined, parent);
        box.setAttribute("aria-hidden", "true");
        for (const c of colored) {
            const d = wvHtmlEl(doc, "span", "wv-pp-tdot", undefined, box);
            d.setAttribute("data-color", c.color);
            d.setAttribute("title", c.name);
            d.style.setProperty("--wv-pp-tagc", wvPpTagPaint(c.color));
        }
    }

    /** The bar's Tag menu for the checked researchers: each tag (checked when
     *  every one has it; a click toggles it as the number keys do), then New tag. */
    _wvPeopleBulkTagMenu(win: any, anchor: any): any {
        const v = this._wvPeopleViewOf(win);
        const ids: string[] = v && v.checked ? Array.from(v.checked as Set<string>) : [];
        const doc = win.document;
        const colors = this._wvPeopleTagColors();
        const names = this._wvPeopleTagNames();
        const order = [...colors.map((c) => c.name).filter((n) => names.includes(n)), ...names.filter((n) => !colors.some((c) => c.name === n)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))];
        const recs = ids.map((id) => this._wvPeopleGetRec(id)).filter(Boolean) as WvPpRecord[];
        return this._wvPeopleMenuAt(win, MENU_BULKTAG, anchor, 0, 0, (pop: any) => {
            for (const n of order) {
                const all = recs.length > 0 && recs.every((r) => wvPpTagsOf(r).includes(n));
                const c = colors.find((x) => x.name === n);
                const mi = wvMenuItem(doc, { label: n, attrs: { "data-wv-pp-bulktag": n, type: "checkbox", autocheck: "false" },
                    onCommand: () => { const lp: any = live(); if (lp) return lp._wvPeopleTagApply(win, ids, n, null); } }, pop);
                if (c) mi.setAttribute("style", "font-weight: 600");
                wvSetBoolAttr(mi, "checked", all);
            }
            if (order.length) pop.appendChild(doc.createXULElement("menuseparator"));
            wvMenuItem(doc, { l10n: { id: "weavero-people-bulk-tag-new" }, attrs: { "data-wv-pp-bulktag-new": "true" },
                onCommand: () => { const lp: any = live(); if (lp) return lp._wvPeopleBulkTagAdd(win); } }, pop);
        });
    }

    /** New tag for the checked researchers (`name`: else asked), in the one
     *  spelling. */
    async _wvPeopleBulkTagAdd(win: any, name?: string): Promise<WvPpRecord[]> {
        const v = this._wvPeopleViewOf(win);
        const ids: string[] = v && v.checked ? Array.from(v.checked as Set<string>) : [];
        if (!ids.length) return [];
        let typed = name;
        if (typed == null) {
            await this._wvPeopleItemTags().catch(() => []);
            const val: any = { value: "" };
            let ok = false;
            try { ok = Services.prompt.prompt(win, wvStr("weavero-people-tags", null, null), wvStr("weavero-people-tag-new-prompt", null, null), val, null, {}); } catch (e) {}
            if (!ok) return [];
            typed = String(val.value || "");
        }
        const t = this._wvPeopleTagSpell(typed);
        if (!t) return [];
        return this._wvPeopleTagApply(win, ids, t, true);
    }

    // ---- the page -------------------------------------------------------------------------

    /** The page's Tags: a chip each (coloured first, by position); in the edit
     *  mode a remove button on each and a field adding one, with suggestions
     *  -- the researchers' tags, then the items'. Nothing in the view mode
     *  when there is no tag. */
    _wvPeopleRenderTagsSec(win: any, col: any, rec: WvPpRecord, v: any) {
        const doc = win.document;
        const edit = !!(v && v.pageEdit);
        const tags = wvPpTagsOf(rec);
        if (!edit && !tags.length) return;
        const colors = this._wvPeopleTagColors();
        const pos = (n: string) => { const i = colors.findIndex((c) => c.name === n); return i < 0 ? 99 : i; };
        tags.sort((a, b) => pos(a) - pos(b) || a.toLowerCase().localeCompare(b.toLowerCase()));
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, col);
        sec.setAttribute("data-wv-pp-sec", "tags");
        wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr("weavero-people-tags", null, null), sec);
        const chips = wvHtmlEl(doc, "div", "wv-pp-tagchips", undefined, sec);
        for (const t of tags) {
            const chip = wvHtmlEl(doc, "span", "wv-pp-tagchip", undefined, chips);
            chip.setAttribute("data-wv-pp-tag", t);
            const c = colors.find((x) => x.name === t);
            if (c) { chip.classList.add("colored"); chip.setAttribute("data-color", c.color); chip.style.setProperty("--wv-pp-tagc", wvPpTagPaint(c.color)); }
            wvHtmlEl(doc, "span", undefined, t, chip);
            if (!edit) continue;
            const x = wvHtmlEl(doc, "button", undefined, "×", chip);
            x.setAttribute("type", "button");
            x.setAttribute("data-wv-pp-tagdel", "true");
            const tip = wvStr("weavero-people-tag-remove", { name: t }, null);
            x.setAttribute("title", tip);
            x.setAttribute("aria-label", tip);
            x.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleTagApply(win, [rec.id], t, false).catch(() => {}); });
        }
        if (!edit) return;
        const box = wvHtmlEl(doc, "div", "wv-pp-pickbox wv-pp-tagadd", undefined, sec);
        const inp = wvHtmlEl(doc, "input", undefined, undefined, box);
        inp.setAttribute("type", "text");
        inp.setAttribute("data-wv-pp-focus", "tagadd");
        inp.setAttribute("placeholder", wvStr("weavero-people-tag-add", null, "placeholder"));
        inp.setAttribute("aria-label", wvStr("weavero-people-tag-add", null, "placeholder"));
        inp.setAttribute("role", "combobox");
        inp.setAttribute("aria-autocomplete", "list");
        inp.setAttribute("aria-expanded", "false");
        // Not a <datalist>: Zotero's main window never shows one (the Links' add row).
        const pick = wvHtmlEl(doc, "div", "wv-pp-pick", undefined, box);
        pick.setAttribute("role", "listbox");
        pick.hidden = true;
        let opts: Array<{ el: any; name: string }> = [];
        let active = -1;
        const close = () => { pick.hidden = true; active = -1; inp.setAttribute("aria-expanded", "false"); };
        const setActive = (i: number) => { active = i; opts.forEach((o, j) => o.el.setAttribute("aria-selected", j === i ? "true" : "false")); };
        const choose = (name: string) => {
            close();
            const lp: any = live();
            if (!lp) return;
            const t = lp._wvPeopleTagSpell(name);
            if (!t) return;
            inp.value = "";
            lp._wvPeopleTagApply(win, [rec.id], t, true).catch(() => {});
        };
        const fill = () => {
            const lp: any = live();
            if (!lp) return;
            pick.textContent = "";
            opts = [];
            active = -1;
            if (!inp.value.trim()) { close(); return; }
            const list = wvPpTagSuggest(inp.value, lp._wvPeopleTagNames(), lp._wvPeopleItemTagsSync(), wvPpTagsOf(lp._wvPeopleGetRec(rec.id)));
            for (const s of list) {
                const o = wvHtmlEl(doc, "div", "wv-pp-pickopt", undefined, pick);
                o.setAttribute("role", "option");
                o.setAttribute("aria-selected", "false");
                o.setAttribute("data-wv-pp-tagsugg", s.name);
                o.setAttribute("data-from", s.from);
                wvHtmlEl(doc, "div", "wv-pp-rowname", s.name, o);
                o.addEventListener("mousedown", (e: any) => { e.preventDefault(); });
                o.addEventListener("click", () => { try { choose(s.name); } catch (e) {} });
                opts.push({ el: o, name: s.name });
            }
            pick.hidden = !opts.length;
            inp.setAttribute("aria-expanded", opts.length ? "true" : "false");
        };
        inp.addEventListener("focus", () => {
            const lp: any = live();
            if (lp) lp._wvPeopleItemTags().then(() => { if (inp.isConnected && inp.value.trim()) fill(); }).catch(() => {});
        });
        inp.addEventListener("blur", () => { try { close(); } catch (e) {} });
        inp.addEventListener("input", () => { try { fill(); } catch (e) {} });
        inp.addEventListener("keydown", (e: any) => {
            try {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (pick.hidden) { fill(); if (opts.length) setActive(e.key === "ArrowDown" ? 0 : opts.length - 1); return; }
                    if (!opts.length) return;
                    setActive(e.key === "ArrowDown" ? Math.min(active + 1, opts.length - 1) : Math.max(active - 1, 0));
                }
                else if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!pick.hidden && opts[active]) choose(opts[active].name);
                    else if (inp.value.trim()) choose(inp.value);
                }
                else if (e.key === "Escape" && !pick.hidden) {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
            }
            catch (err) {}
        });
    }

    /** The right pane's tags: the chips, as the page's view mode. */
    _wvPeopleTagPaneChips(win: any, pane: any, rec: WvPpRecord) {
        if (!wvPpTagsOf(rec).length) return;
        this._wvPeopleRenderTagsSec(win, pane, rec, { pageEdit: false });
    }
}

const _tagsDescriptors = Object.getOwnPropertyDescriptors(_PeopleTagsMixin.prototype);
delete (_tagsDescriptors as any).constructor;
export const peopleTagsMethods = _tagsDescriptors;
