// Module: the Advanced Search in a feed view (branch advfeed; MJT 2026-11-22: "Actually, I
// feel that most of the advanced search options are useless in Feeds" -- offered to turn the
// Advanced Search off there, or to keep it with only the conditions a feed item can match,
// he picked "keep it with only the conditions a feed item can match").
//
// In a FEED VIEW -- the Feeds row, or feeds, every row selected in the collections pane
// (CollectionTreeRow.isFeedsOrFeed) -- the field menu of each condition row of the in-pane
// Advanced Search offers only the conditions below; every other view keeps Zotero's menu.
// The view is read from the library view's selected rows, never from the search: on the
// Feeds row the search holds the pane's previous library or My Library
// (WV-TEMP-advsrchcollapse, upstream-fixes.ts; advancedSearchPane.js refresh 236-239).
//
// Where Zotero builds the menu: each `zoterosearchcondition` row builds its own field menu
// from Zotero.SearchConditions.getStandardConditions() in init() (elements/zoteroSearch.js,
// 11.0-beta.5 and 10.0.8 alike: the top-level entries, the Attachment and Annotation
// submenus, More), then initWithParentAndCondition() selects the row's condition through
// onConditionSelected(). The pane rebuilds EVERY row on each refresh() -- its search
// setter, renderConditions() -- and refresh() runs at each collection selection
// (libraryView.js onCollectionSelected -> _refreshAdvancedSearchPane, 11.0-beta.5 810 /
// 946-949; zoteroPane.js 1851 / 1897-1900 on 10.0.8), when the pane opens or closes, and
// with the quick-search seed. So one layer on the window's own row class (each window has
// its own customElements registry), on onConditionSelected -- a row's first selection,
// and every later one -- trims the menu of every row as it is built: switching between a
// feed and a library with the Advanced Search open, the menus follow AT ONCE (Zotero
// rebuilt them). The layer only HIDES (`hidden`, marked `data-wv-feed-hidden`): Zotero
// hides nothing in that menu, so the teardown gives back exactly Zotero's menu.
//
// A row whose field is not a feed condition (a search built in My Library, then the view
// switched; the "Everything" quick-search seed's Attachment Content) stays as it is: its
// own field stays in its menu, so the row is still edited like any other, and the search
// still runs it (an Attachment Content row matches nothing in a feed). Picked away from,
// that field goes from the menu at once. Zotero 10's find-as-you-type on the CLOSED menu
// walks its own list of every condition (zoteroSearch.js findConditionByPrefix, 10.0.8
// only): a second layer hands it the kept ones. Zotero 11's walks the menu's items and
// skips hidden ones (utilities_internal.js addMenuFindAsYouType: `menuitem:not([disabled],
// [hidden])`).
//
// THE CONDITIONS A FEED ITEM CAN MATCH, determined in the runner on 11.0-beta.5 and 10.0.8
// (test/advsearch-feed-conditions.spec.js "evidence", 2026-11-22; the same 27 of 91 standard
// conditions kept on both): three feed files (RSS 1.0
// with PRISM and Dublin Core, RSS 2.0, Atom; every field FeedReader reads, feedReader.js
// _getFeedItem) read by Zotero's own Feed.updateFeed(), then, for each standard condition, a
// temporary search in each feed's library with a POSITIVE test -- "has a value"
// (isNotEmpty) where offered, each value of a fixed-value condition, a count above 0, a
// date after 1900, a word of the fixture's texts. Negative operators do not count: "is not"
// / "does not contain" on a field no feed item holds matches every feed item.
//
//   kept (a feed item, or the PDF its enclosure links, matched):
//     anyField, titleCreatorYear (a title word); title, abstractNote, date, url, rights
//     (License), language, DOI, publicationTitle, volume, issue, pages, ISSN, ISBN,
//     publisher, section (isNotEmpty: each set by FeedReader); extra (Zotero moves a field
//     the item type lacks there, fromJSON: "ISBN: ..." on a journal article, "Section:
//     ..." on a book section); creator, author (FeedReader's authors and contributors);
//     itemType (journalArticle, bookSection, attachment; _guessItemType also has
//     conferencePaper); dateAdded, dateModified (every item); numAttachments, fileTypeID
//     (PDF), attachmentStorageType (Linked URL), accessDate: the PDF an enclosure links
//     (feed.js _updateFeed -> Attachments.linkFromURL, a linked URL with an access date).
//   hidden (nothing matched; and no feed code writes it):
//     tag, numTags, note, numNotes -- FeedReader writes none (feed categories are not read,
//       feedReader.js 74), the feed library is read-only in Zotero's UI (editable false:
//       no New Note, the Tags and Notes sections hide for a feed item), and a feed item
//       is translated only INTO a library (FeedItem.translate's in-place branch has no
//       caller; itemPane.js 251 commented out). Code can still save one: a plugin's
//       `addTag()` + `saveTx()` on a feed item went through in the runner.
//     collection, savedSearch -- Zotero refuses both in a feed library ("Cannot add
//       collection / search to a feed library", measured; Zotero's own feedTest.js).
//     fulltextContent, lastRead, numAnnotations, annotationText, annotationComment,
//       annotationType, annotationColor, annotationAuthor -- a feed's only attachment is a
//       linked URL: no file to index, open in the reader or annotate.
//     editor, bookAuthor -- FeedReader writes authors and contributors only.
//     every other item field (archive, callNumber, edition, place, series, shortTitle,
//       journalAbbreviation, numPages, ...: 48 on both) -- FeedReader never sets it.
//
// The kept conditions' operators and value menus are Zotero's: the Item Type, File Type and
// Storage Type menus list every value, as Zotero's do in every library (only some can match
// in a feed, none is wrong to offer). Saved searches: Zotero already disables Save Search in
// a feed view (advancedSearchPane.js _canSaveInSelection). The Advanced Search in a new
// window or tab of Zotero 11 (libraryView.js openAdvancedSearchInNewWindow / InNewTab:
// Shift+click on the funnel, and Weavero's routes, pane.ts _wvAdvSearchOpenNewWindow) shows
// the view's selection -- a feed view stays one there, and its rows are trimmed the same
// way (the new window's class, wired by the window-wiring table). Weavero's new window on
// Zotero 9/10 lands on My Library by design (_wvAdvSearchOpenNewWindow): no feed there.
// Zotero 9 has no in-pane Advanced Search (no advanced-search-pane): nothing is trimmed there.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvSetBoolAttr, winOf } from "../lib/dom";
import { wvMainWins } from "../lib/windows";
import { wvLivePlugin } from "../lib/live";

declare const Zotero: any;

/** The conditions a feed item can match (the table above). */
export const WV_ADVFEED_KEEP: ReadonlySet<string> = new Set([
    "anyField", "titleCreatorYear",
    "title", "abstractNote", "date", "url", "rights", "language", "DOI", "publicationTitle",
    "volume", "issue", "pages", "ISSN", "ISBN", "publisher", "section", "extra",
    "creator", "author",
    "itemType", "dateAdded", "dateModified",
    "numAttachments", "fileTypeID", "attachmentStorageType", "accessDate",
]);

const ROW = "zoterosearchcondition";
const LAYER = "advFeed";
/** On each menu entry the layer hid: Zotero hides none there, the teardown shows these. */
const MARK = "data-wv-feed-hidden";

/** Hide `el` (marked), or show it again if this layer hid it. Never touches an entry
 *  something else hid. */
function hideMarked(el: any, hide: boolean) {
    if (hide) {
        if (el.hasAttribute(MARK) || el.hasAttribute("hidden")) return;
        el.setAttribute(MARK, "true");
        wvSetBoolAttr(el, "hidden", true);
    }
    else if (el.hasAttribute(MARK)) {
        el.removeAttribute(MARK);
        wvSetBoolAttr(el, "hidden", false);
    }
}

class _AdvsearchFeedMixin {
    [k: string]: any;

    /** The kept conditions, sorted (the suite's evidence compares against them). */
    _wvAdvFeedKept(): string[] {
        return Array.from(WV_ADVFEED_KEEP).sort();
    }

    /** The window's own condition-row class: the field menu trimmed as each row is built,
     *  and as its condition changes. Registered lazily (customElements.js); Zotero 9 has no
     *  such row in a library view. Rows already built (a reload with the Advanced Search
     *  open) are trimmed here. */
    _wvAdvFeedWire(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE) return;
            const C: any = CE.get(ROW);
            if (!C) {
                try {
                    CE.whenDefined(ROW).then(() => {
                        try { const lp = wvLivePlugin(); if (lp && !win.closed) lp._wvAdvFeedWire(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = C.prototype;
            if (!proto || typeof proto.onConditionSelected !== "function") return;
            const tag = this._wvWireTag();
            // Zotero's own selection runs first (its synchronous part sets
            // `selectedCondition`, the row's own field, before any await).
            wvWrap(proto, "onConditionSelected", LAYER, tag, (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                try { const lp = wvLivePlugin(); if (lp) lp._wvAdvFeedApply(this); } catch (e) {}
                return r;
            });
            // Zotero 10's find-as-you-type on the closed menu reads `this._conditions`, every
            // standard condition: it sees the kept ones (and the row's own) while it runs.
            if (typeof proto.findConditionByPrefix === "function") {
                wvWrap(proto, "findConditionByPrefix", LAYER, tag, (orig: any) => function (this: any, ...args: any[]) {
                    let keep: ReadonlySet<string> | null = null;
                    try { const lp = wvLivePlugin(); keep = lp ? lp._wvAdvFeedKeepFor(this) : null; } catch (e) {}
                    const all = this._conditions;
                    if (!keep || !Array.isArray(all)) return orig.apply(this, args);
                    const own = this.selectedCondition;
                    const had = Object.prototype.hasOwnProperty.call(this, "_conditions");
                    this._conditions = all.filter((c: any) => c && (keep!.has(c.name) || c.name === own));
                    try { return orig.apply(this, args); }
                    finally {
                        if (had) this._conditions = all;
                        else delete this._conditions;
                    }
                });
            }
            for (const row of Array.from(win.document.querySelectorAll(ROW)) as any[]) this._wvAdvFeedApply(row);
        } catch (e) { Zotero.debug("[Weavero] _wvAdvFeedWire err: " + e); }
    }

    /** The conditions to offer in `row`'s field menu: the kept set when the row belongs to
     *  an in-pane Advanced Search whose library view shows feeds (every selected row the
     *  Feeds row or a feed), else null (Zotero's menu). Zotero 11 reads the row's own library
     *  view (one per library tab); 10.0.8 has none, the pane reads ZoteroPane's rows
     *  (advancedSearchPane.js _canSaveInSelection, both versions). */
    _wvAdvFeedKeepFor(row: any): ReadonlySet<string> | null {
        try {
            if (!row || typeof row.closest !== "function" || !row.closest("advanced-search-pane")) return null;
            const lv = row.closest("library-view");
            let rows: any = null;
            if (lv && typeof lv.getCollectionTreeRows === "function") rows = lv.getCollectionTreeRows();
            else {
                const w = winOf(row);
                const zp = w && w.ZoteroPane;
                if (zp && typeof zp.getCollectionTreeRows === "function") rows = zp.getCollectionTreeRows();
            }
            if (!rows || !rows.length) return null;
            for (const r of rows) if (!r || typeof r.isFeedsOrFeed !== "function" || !r.isFeedsOrFeed()) return null;
            return WV_ADVFEED_KEEP;
        } catch (e) { return null; }
    }

    /** `row`'s field menu for its view: in a feed view what a feed item cannot match is
     *  hidden -- never the row's own field -- and a submenu left empty (Annotation) with it;
     *  elsewhere what this layer hid is shown again. */
    _wvAdvFeedApply(row: any) {
        try {
            const menu = row && row.querySelector && row.querySelector("#conditionsmenu");
            if (!menu) return;
            const keep = this._wvAdvFeedKeepFor(row);
            const own = String(row.selectedCondition || "");
            for (const it of Array.from(menu.querySelectorAll("menuitem[value]")) as any[]) {
                const v = String(it.getAttribute("value") || "");
                hideMarked(it, !!keep && v !== own && !keep.has(v));
            }
            for (const sub of Array.from(menu.querySelectorAll("menu")) as any[]) {
                const left = (Array.from(sub.querySelectorAll("menuitem")) as any[]).some((i) => !i.hasAttribute("hidden"));
                hideMarked(sub, !!keep && !left);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvAdvFeedApply err: " + e); }
    }

    /** destroy(): every window's row class given back, every hidden entry shown. */
    _wvAdvFeedTeardown() {
        for (const w of wvMainWins() as any[]) {
            try {
                const C: any = w && w.customElements && w.customElements.get(ROW);
                if (C && C.prototype) {
                    wvUnwrap(C.prototype, "onConditionSelected", LAYER);
                    wvUnwrap(C.prototype, "findConditionByPrefix", LAYER);
                }
                for (const el of Array.from(w.document.querySelectorAll("[" + MARK + "]")) as any[]) hideMarked(el, false);
            } catch (e) {}
        }
    }
}

const _advFeedDescriptors = Object.getOwnPropertyDescriptors(_AdvsearchFeedMixin.prototype);
delete (_advFeedDescriptors as any).constructor;
export const advsearchFeedMethods = _advFeedDescriptors;
