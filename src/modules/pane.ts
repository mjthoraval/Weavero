// Module: right-pane processing + items-tree click + items-tree
// columns + libraries box highlight + reader's annotation context
// menu (decorateContextMenu).
//
// What "pane" covers in this codebase:
// - Items list + collections tree right-click menus (Add Related,
//   Copy Item Link, Copy Collection Link).
// - Items-tree cell click handling (link detection in cell text,
//   icon click vs cell click, _markCellLinks).
// - Items-tree column registration (Annotations count, Related
//   count) and per-row decoration.
// - Right-pane row processing (link rendering inside the right
//   item pane's `<related-box>` / `<libraries-collections-box>`
//   sections).
// - The libraries-box-highlight overlay that tints the row of the
//   currently-displayed item's library.
// - decorateContextMenu — the reader annotation context menu
//   that runs in the iframe.
//
// Note: the 30 methods here originally interleaved with filter.ts
// methods in index.ts. The interleaving is preserved as comment
// markers in this file so the reader can locate where the filter
// methods used to sit.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via
// defineProperties.

import {
    BTN_CLASS, BTN_PANE_CLASS, BTN_TREE_CLASS, BTN_POPUP_CLASS,
    BTN_SIDEBAR_CLASS, MENU_LABEL_PREFIXES, SCHEME_SVG_TEMPLATE,
} from "./constants";
import { BBT_BIBTEX_TRANSLATOR_ID, BBT_BIBLATEX_TRANSLATOR_ID } from "./url";
import { winOf, wvSetBoolAttr, wvWhenWindowLoaded, wvWithin, wvHtmlEl } from "../lib/dom";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvTimeout } from "../lib/timers";
import { wvMenuItem } from "../lib/menu";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvLivePlugin } from "../lib/live";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvMainWins, wvWinType } from "../lib/windows";
import { wvAccel, wvAccelAny } from "../lib/keys";
import { wvLinkVars } from "../lib/links";
import { wvAltReveal } from "../lib/menubar";


/** about:addons page rules for the Zotero 11 sidebar (see _wvPMEnsureSidebar).
 *  Zotero's build appends `.main-search, #sidebar { display: none; }`,
 *  `#full { grid-template-columns: 1fr; }` and a centred, shrink-to-fit
 *  `#content`; the `html` prefix outranks them. Firefox's own #sidebar rules
 *  (sticky, column flex) apply again once it is displayed. */
const WV_PM_SIDEBAR_CSS = [
    "html #sidebar { display: flex; }",
    "html #full { grid-template-columns: var(--sidebar-width) 1fr; }",
    "html #content { max-width: none; margin-inline: 0; }",
    "categories-box moz-page-nav-button[view]:not([view=\"extension\"], [view=\"recent-updates\"], [view=\"available-updates\"]) { display: none !important; }",
].join("\n");

/** Inside <moz-page-nav>'s shadow root: no "Add-ons" heading (it repeats
 *  "Manage Your Plugins"), no separator, no footer links (Firefox Settings,
 *  Add-ons Support) -- Zotero 10's sidebar had none of them. Without the
 *  heading the first entry sat at the very top (MJT 2026-10-12: "needs
 *  padding at the top"): the nav moves down 28 px, which centres "Plugins"
 *  on the "Manage Your Plugins" heading (measured: both at 46 px). On the
 *  nav, not #sidebar: the <moz-page-nav> host is 100% tall, so padding the
 *  sidebar overflowed it by the same 28 px and drew a scrollbar. */
const WV_PM_SIDEBAR_SHADOW_CSS = [
    ".page-nav-heading-wrapper, hr, #secondary-nav-group { display: none !important; }",
    "nav { margin-top: 28px; }",
].join("\n");

/** Each main window's own Tag Selector class (_wvTagSelectorClassKeep).
 *  Weak: a closed window is never held. */
const WV_TS_CLASS: WeakMap<any, any> = new WeakMap();

/** WV-TEMP-133039: per window, cancel its pending drag-session watchdog
 *  (a teardown or a re-wire must not leave a timer behind). */
const WV_DROP_WATCH: WeakMap<any, () => void> = new WeakMap();
// A collection tree's rule for the special collections (hidden-collections
// feature): keyed by the tree, so it is no mark on the window (the wiring
// characterization records `_wv*` expandos on the views).
const WV_HID_VISIBLE: WeakMap<any, (type: string, libraryID: number, zoteroShown: boolean) => boolean> = new WeakMap();

/** Weavero's nodes in Zotero's collection menu carry this marker besides
 *  their classes: a reload's window strip takes the wv- classes off a node
 *  that also has Zotero's (menuitem-iconic, the Hide icon class) and keeps
 *  the node, and Zotero's next positional pass then counted it as its own
 *  (MJT's My Library menu, 2026-10-20). The attribute survives the strip. */
const WV_HID_OWNED = "[data-wv-owned='hid']";
const WV_HID_OWNED_ATTR = { "data-wv-owned": "hid" };

/** The pinned parents' overlay (the collections pane's sticky scroll, and
 *  the manager's two trees since 2026-10-21): the host must be positioned. */
const WV_COLL_STICKY_CSS = [
    ".wv-coll-sticky { position: absolute; top: 0; left: 0; right: 0; z-index: 3;",
    "  background: var(--material-sidepane, Canvas);",
    "  border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent);",
    "  box-shadow: 0 2px 4px -2px rgba(0,0,0,.35); }",
    ".wv-coll-sticky .row { position: relative; cursor: default; }",
    ".wv-coll-sticky .row:hover { background: color-mix(in srgb, currentColor 10%, transparent); }",
];

/** Every node of ours out of the collection menu: by class, by marker, and
 *  any `menu` that still holds a marked node (a stripped Show submenu). */
function wvHidMenuClear(menu: any): number {
    let n = 0;
    try {
        // The submenus first: a stripped one is known only by the marked
        // items inside it, which the flat pass below would take out first.
        for (const el of Array.from(menu.querySelectorAll(":scope > menu")) as any[]) { if (el.querySelector(WV_HID_OWNED)) { el.remove(); n++; } }
        for (const el of Array.from(menu.querySelectorAll(".wv-hid-entry, " + WV_HID_OWNED)) as any[]) { if (el.isConnected) { el.remove(); n++; } }
    } catch (_) {}
    return n;
}

class _PaneMixin {
    [k: string]: any;

    /** Synchronous replica of `Zotero.Item.prototype.getBestAttachments` —
     *  used in popupshowing handlers (which can't await).
     *
     *  Upstream SQL (xpcom/data/item.js:4050-4055):
     *
     *      WHERE parentItemID=? AND linkMode NOT IN (LINK_MODE_LINKED_URL)
     *        AND IA.itemID NOT IN (SELECT itemID FROM deletedItems)
     *      ORDER BY contentType='application/pdf' DESC,
     *               value=<parentURL> DESC,
     *               dateAdded ASC
     *
     *  Translation:
     *    1. PDF attachments first (single binary split — EPUB / snapshot /
     *       image / video are all "non-PDF" together, not their own tiers).
     *    2. Within each tier, attachments whose `url` field matches the
     *       parent item's `url` field come first (so a snapshot of the
     *       parent's URL beats an unrelated PDF only when no PDF exists,
     *       but among non-PDFs the URL-match wins).
     *    3. Finally oldest-first by `dateAdded`.
     *
     *  Standalone attachment rows (in the items list) are returned
     *  directly when they're file attachments. */
    /* ---- ZoteroPane selection, across the beta.21 removal -----------------
     *
     *  Zotero 10.0-beta.21 (upstream `5d1a2cba3`, "Remove the singular
     *  collection tree selection getters") removed the singular
     *  `getSelectedLibraryID` / `getSelectedCollection` / `getSelectedSavedSearch`
     *  / `getSelectedGroup` in favour of plural forms, because multi-collection
     *  selection made "the selected one" meaningless.
     *
     *  The removed names still EXIST and THROW a migration message, so
     *  Weavero's `typeof fn === "function"` guards sailed straight past them
     *  and the throw propagated. That is what emptied the filter pulldown
     *  (GitHub #25): `_renderFilterPanelContents` threw before rendering a
     *  single row, leaving an open-but-blank popup.
     *
     *  Prefer the plural form, fall back to the singular for Zotero 9, and
     *  never let either throw into a caller. */

    _wvSelectedLibraryID(win?: any): number | null {
        try {
            const zp = (win || Zotero.getMainWindow())?.ZoteroPane;
            if (!zp) return null;
            if (typeof zp.getSelectedLibraryIDs === "function") {
                const ids = zp.getSelectedLibraryIDs();
                return (ids && ids.length) ? ids[0] : null;
            }
            if (typeof zp.getSelectedLibraryID === "function") {
                return zp.getSelectedLibraryID();
            }
        } catch (e) {}
        return null;
    }

    _wvSelectedCollection(win?: any): any {
        try {
            const zp = (win || Zotero.getMainWindow())?.ZoteroPane;
            if (!zp) return null;
            if (typeof zp.getSelectedCollections === "function") {
                const cols = zp.getSelectedCollections();
                return (cols && cols.length) ? cols[0] : null;
            }
            if (typeof zp.getSelectedCollection === "function") {
                return zp.getSelectedCollection();
            }
        } catch (e) {}
        return null;
    }

    _wvSelectedSavedSearch(win?: any): any {
        try {
            const zp = (win || Zotero.getMainWindow())?.ZoteroPane;
            if (!zp) return null;
            if (typeof zp.getSelectedSavedSearches === "function") {
                const ss = zp.getSelectedSavedSearches();
                return (ss && ss.length) ? ss[0] : null;
            }
            if (typeof zp.getSelectedSavedSearch === "function") {
                return zp.getSelectedSavedSearch();
            }
        } catch (e) {}
        return null;
    }

    _wvGetBestAttachmentSync(item: any, opts?: any): any {
        try {
            if (!item) return null;
            if (item.isAttachment && item.isAttachment()) {
                if (!item.isFileAttachment || !item.isFileAttachment()) return null;
                return item;
            }
            if (!item.isRegularItem || !item.isRegularItem()) return null;
            // opts.ignorePick: compute the AUTOMATIC winner — Zotero's own
            // heuristic with the user's default-child override skipped. Used
            // by the ▷ items-list marker and the hoist, both of which need
            // "what would open without the plugin" (2026-08-05).
            if (opts && opts.ignorePick) {
                return this._wvBestAttachmentHeuristicSync(item);
            }
            // Honour the user's chosen default child, exactly as the patched
            // async `getBestAttachment` does. This is a SYNC replica of
            // Zotero's heuristic used by ~13 call sites, several of which
            // OPEN something ("Open in New Window", "Open in External
            // Viewer", the reader strip, tab restore). Without this the
            // feature was honoured on double-click but silently ignored by
            // those paths, so a user with a default set got a different file
            // depending on how they opened it (found by live testing
            // 2026-08-04). Same contract as the async wrapper: only a real
            // FILE attachment may be returned, so a chosen note or linked URL
            // falls through to the heuristic below.
            try {
                const chosen = (this as any)._wvGetDefaultChild
                    && (this as any)._wvGetDefaultChild(item);
                if (chosen && !chosen.deleted
                    && chosen.isFileAttachment && chosen.isFileAttachment()) {
                    return chosen;
                }
            } catch (e) {}
            return this._wvBestAttachmentHeuristicSync(item);
        } catch (e) {
            Zotero.debug("[Weavero] _wvGetBestAttachmentSync err: " + e);
            return null;
        }
    }

    /** The heuristic HALF of _wvGetBestAttachmentSync (PDF-first / URL-match /
     *  oldest), with no default-child override — split out so the ▷ marker and
     *  the hoist can ask for the pure automatic winner. */
    _wvBestAttachmentHeuristicSync(item: any): any {
        try {
            const ids = (item.getAttachments && item.getAttachments()) || [];
            if (!ids.length) return null;
            const parentURL = (item.getField && item.getField("url")) || "";
            const cands: any[] = [];
            for (const aid of ids) {
                const a = Zotero.Items.get(aid);
                if (!a) continue;
                if (!a.isFileAttachment || !a.isFileAttachment()) continue;
                cands.push({
                    a,
                    isPDF: a.attachmentContentType === "application/pdf" ? 1 : 0,
                    urlMatch: (parentURL && a.getField && a.getField("url") === parentURL) ? 1 : 0,
                    dateAdded: a.dateAdded || "",
                });
            }
            if (!cands.length) return null;
            cands.sort((x, y) => {
                if (x.isPDF !== y.isPDF) return y.isPDF - x.isPDF;             // PDFs first
                if (x.urlMatch !== y.urlMatch) return y.urlMatch - x.urlMatch; // URL match first
                if (x.dateAdded < y.dateAdded) return -1;                      // oldest first
                if (x.dateAdded > y.dateAdded) return 1;
                return 0;
            });
            return cands[0].a;
        } catch (e) {
            Zotero.debug("[Weavero] _wvBestAttachmentHeuristicSync err: " + e);
            return null;
        }
    }

    /** Wrapper around `att.getImageSrc()` that patches an upstream bug.
     *  Zotero's kebab regex doesn't insert a dash between adjacent
     *  uppercase runs, so `attachmentPDFLink` / `attachmentEPUBLink`
     *  collapse to `attachment-pdflink.svg` / `attachment-epublink.svg`
     *  — but the actual skin files are `attachment-pdf-link.svg` and
     *  `attachment-epub-link.svg`. Without this fix linked-PDF /
     *  linked-EPUB attachments get a broken (blank) menu icon. */
    _wvAttachmentIconURL(att: any): string | null {
        try {
            if (!att || typeof att.getImageSrc !== "function") return null;
            const raw = att.getImageSrc();
            if (!raw) return null;
            return String(raw).replace(
                /attachment-(pdf|epub)link(@\dx)?\.svg$/i,
                "attachment-$1-link$2.svg");
        } catch (_) { return null; }
    }

    /** Internal helper to create a XUL menuitem with consistent styling. */
    _createXULMenuItem(doc: Document, options: {
        id: string,
        label: string,
        image?: string,
        classList?: string[]
    }): any {
        const mi = doc.createXULElement("menuitem");
        mi.id = options.id;
        mi.setAttribute("label", options.label);
        if (options.image) {
            mi.classList.add("menuitem-iconic");
            mi.setAttribute("image", options.image);
        }
        if (options.classList) options.classList.forEach(c => mi.classList.add(c));
        return mi;
    }

    /** Hook the items-tree right-click menu (`#zotero-itemmenu`) and
     *  insert "Add related item…" when the right-clicked selection
     *  contains at least one annotation. Mirrors the entry the plugin
     *  contributes to the reader's annotation context menu (see
     *  `_contextHandler`) so the same affordance is available from the
     *  items list, which is otherwise the only surface where you can
     *  reach annotations without opening the reader.
     *
     *  Pattern: bind `popupshowing` once, rebuild the entry on each
     *  open (selection changes between opens), strip it on
     *  `popuphidden` so we never leave a stale entry in the DOM. The
     *  command resolves a fresh annotation array at click time so a
     *  selection-mutation between popupshowing and command can't
     *  capture stale items. */
    /** Accelerator label (e.g. "Ctrl+Shift+A") for a window `<key>` element,
     *  read LIVE from its `modifiers`/`key` attributes so it reflects whatever
     *  the user has set in Settings → Advanced → Shortcuts (those prefs drive
     *  the `<key>` element at startup; changes take effect after restart).
     *  Returns "" when the key element or its char isn't available. */
    _acceltextForKey(doc: any, keyId: string): string {
        try {
            const k = doc && doc.getElementById(keyId);
            if (!k) return "";
            const ch = (k.getAttribute("key") || "").trim();
            if (!ch) return "";
            const mods = (k.getAttribute("modifiers") || "").toLowerCase();
            const mac = !!(Zotero as any).isMac;
            const parts: string[] = [];
            if (/accel/.test(mods)) parts.push(mac ? "⌘" : "Ctrl");
            else if (/control|ctrl/.test(mods)) parts.push("Ctrl");
            if (/shift/.test(mods)) parts.push(mac ? "⇧" : "Shift");
            if (/alt|option/.test(mods)) parts.push(mac ? "⌥" : "Alt");
            if (/meta|win/.test(mods)) parts.push(mac ? "⌘" : "Win");
            parts.push(ch.toUpperCase());
            return parts.join(mac ? "" : "+");
        } catch (e) { return ""; }
    }

    /** Bind the items-menu popupshowing handler to EVERY main window's
     *  #zotero-itemmenu — not just getMainWindow() — so Weavero's additions appear
     *  in all windows (previously only the most-recently-active window had them).
     *  Idempotent per window. */
    _setupItemsListContextMenu() {
        try {
            for (const w of (Zotero.getMainWindows() || [])) {
                try { this._setupItemsMenuForWindow(w); } catch (e) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _setupItemsListContextMenu err: " + e); }
    }

    _setupItemsMenuForWindow(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-itemmenu");
            if (!menu) return;
            this._removeItemMenuHandlerFor(menu);   // dedup THIS window only
            const ADD_REL_ID = "wv-itemmenu-add-related";
            const COPY_AS_ID = "wv-itemmenu-copy-as";                  // the "Copy As" submenu parent
            const COPY_CITATION_ID = "wv-itemmenu-copy-citation";
            const COPY_BIB_ID = "wv-itemmenu-copy-bibliography";
            const COPY_CITEKEY_ID = "wv-itemmenu-copy-citekey";
            const COPY_SELECT_ID = "wv-itemmenu-copy-select";          // single combined Select link
            const COPY_SELECT_SEP_ID = "wv-itemmenu-copy-select-sep";  // multi: separate Select links
            const COPY_OPEN_ID = "wv-itemmenu-copy-open";              // Open link(s)
            const COPY_WEB_ID = "wv-itemmenu-copy-weblink";            // Online Library Link
            const COPY_BIBTEX_ID = "wv-itemmenu-copy-bibtex";         // BBT BibTeX
            const COPY_BIBLATEX_ID = "wv-itemmenu-copy-biblatex";     // BBT BibLaTeX
            const SEP_ID = "wv-itemmenu-separator";
            const EXTV_ID = "wv-itemmenu-open-external";               // "Open in External Viewer"
            const OPEN_IN_ID = "wv-itemmenu-open-in";                  // "Open <type> in ▸" (windows / groups)
            const ALL_IDS = [ADD_REL_ID, COPY_AS_ID, COPY_CITATION_ID, COPY_BIB_ID,
                COPY_CITEKEY_ID, COPY_SELECT_ID, COPY_SELECT_SEP_ID, COPY_OPEN_ID,
                COPY_WEB_ID, COPY_BIBTEX_ID, COPY_BIBLATEX_ID, SEP_ID, EXTV_ID, OPEN_IN_ID];
            // Include any item type that has an `addRelatedItem`
            // method — annotations, attachments, regular items, and
            // notes all support the dc:relation predicate. Excludes
            // pure collections / search rows. Same capability check
            // is reused for Copy Item Link since `zotero://select`
            // works for any item type.
            const isRelatable = (it) => !!it && (
                (it.isAnnotation && it.isAnnotation())
                || (it.isAttachment && it.isAttachment())
                || (it.isRegularItem && it.isRegularItem())
                || (it.isNote && it.isNote())
            );
            const onShowing = () => {
                try {
                    // Remove any prior entries before re-adding.
                    this._clearStaleMenuIds(doc, ALL_IDS);

                    const zp = win.ZoteroPane;
                    const selected = (zp && typeof zp.getSelectedItems === "function")
                        ? zp.getSelectedItems() : [];

                    this._appendExternalViewerToItemsMenu(doc, menu, selected, win);
                    this._appendOpenInToItemsMenu(doc, menu, selected, win);

                    const targets = selected.filter(isRelatable);
                    if (!targets.length) return;
                    const isDark = doc.documentElement
                        && doc.documentElement.classList.contains("wv-ui-dark");

                    // Weavero's two items-menu features now live in different
                    // spots: the "Copy As" submenu is inserted up beside the
                    // native "Export Item…" entry (see below), while
                    // "Add Related…" stays in a small block at the very bottom
                    // with its own separator. Each is gated by its own pref
                    // (URI utilities / Relations groups).
                    const wantCopy = this._getEnableCopyItemLink();
                    const wantAdd = this._getEnableAddRelatedMenu();
                    if (!wantCopy && !wantAdd) return;

                    // --- Copy Select / Open Link entries ---------
                    // Zotero exposes none of these in the items-tree
                    // menu by default. Single selection: "Copy Select
                    // Link" (+ "Copy Open Link" when the item has an
                    // openable file). Multi selection:
                    //   • Copy Select Link — ONE link selecting all of
                    //     them (`…/items?itemKey=K1,K2,…`)
                    //   • Copy Select Links (Separate Links per Item) —
                    //     one `…/items/<key>` link per line
                    //   • Copy Open Links (Separate Links per Item) —
                    //     one `…/items/<key>` open link per line, for
                    //     the selected items that have one (others
                    //     skipped). `zotero://open` can't take a list,
                    //     so there's no combined Open link.
                    // Select links are scoped to the collection shown
                    // in the left tree (if any) so they navigate there.
                    if (wantCopy) {
                    const menuIcon = this._menuItemIconURL;
                    // All copy actions live under one "Copy As" submenu (mirrors
                    // zotero/zotero#2893). The parent carries Weavero's needle
                    // icon; children are text-only for a clean list.
                    const copyAs = doc.createXULElement("menu");
                    copyAs.id = COPY_AS_ID;
                    copyAs.setAttribute("label", "Copy As");
                    if (menuIcon) {
                        copyAs.classList.add("menu-iconic");
                        copyAs.setAttribute("image", menuIcon);
                    }
                    const sub = doc.createXULElement("menupopup");
                    copyAs.appendChild(sub);
                    // Place "Copy As" directly ABOVE the native "Export Item…"
                    // entry (`.zotero-menuitem-export`), falling back to the menu
                    // end if it's somehow absent. Safe to insert mid-menu because
                    // `onHidden` strips all Weavero entries on `popuphidden`, so
                    // the menu is pristine before the next position-indexed
                    // `buildItemContextMenu` runs.
                    const exportAnchor = menu.querySelector(".zotero-menuitem-export");
                    if (exportAnchor && exportAnchor.parentNode === menu) {
                        menu.insertBefore(copyAs, exportAnchor);
                    } else {
                        menu.appendChild(copyAs);
                    }
                    const addEntry = (id, label, action, keyId?) => {
                        const cl = doc.createXULElement("menuitem");
                        cl.id = id;
                        cl.setAttribute("label", label);
                        // Show the matching Zotero shortcut (read live so it
                        // tracks the user's Settings → Shortcuts binding).
                        if (keyId) {
                            const at = this._acceltextForKey(doc, keyId);
                            if (at) cl.setAttribute("acceltext", at);
                        }
                        cl.addEventListener("command", () => {
                            try {
                                const zp2 = win.ZoteroPane;
                                const sel2 = (zp2 && typeof zp2.getSelectedItems === "function")
                                    ? zp2.getSelectedItems() : [];
                                const fresh = sel2.filter(isRelatable);
                                if (!fresh.length) return;
                                action(fresh);
                            } catch (cmdErr) {
                                Zotero.debug("[Weavero] itemmenu copy-as cmd err: " + cmdErr);
                            }
                        });
                        sub.appendChild(cl);
                    };
                    const addSubSep = () => sub.appendChild(doc.createXULElement("menuseparator"));
                    const collScopeNow = () => ({ collScope: this._currentCollectionScope(win) });
                    // When the left tree has a real collection selected,
                    // the Select link(s) are scoped to it — flag that in
                    // the label so the user knows the collection rides
                    // along. (Resolved at popupshowing time; right-
                    // clicking an item doesn't change the collection
                    // selection.) Open links never carry a collection.
                    const collSuffix = this._currentCollectionScope(win)
                        ? " (include Collection)" : "";
                    const multi = targets.length > 1;
                    const openTargets = targets.filter((it) => !!this._buildOpenLink(it));
                    const openExtSuffix = openTargets.length === 1
                        && this._isExternalOpenTarget(openTargets[0]) ? " (external app)" : "";

                    // --- Citation / Bibliography (user's QuickCopy cite style) ---
                    // Accel hints mirror Zotero's own shortcuts:
                    //   Citation     → key_copyCitation     (default Ctrl+Shift+A)
                    //   Bibliography → key_copyBibliography (default Ctrl+Shift+C)
                    addEntry(COPY_CITATION_ID, "Citation",
                        (fresh) => this._copyCitationOrBibliography(fresh, true), "key_copyCitation");
                    addEntry(COPY_BIB_ID, "Bibliography",
                        (fresh) => this._copyCitationOrBibliography(fresh, false), "key_copyBibliography");
                    // Citation Key — native Zotero field 9 (Better BibTeX fills
                    // it when active). Shown only when the selection actually
                    // has one, since Zotero doesn't auto-generate keys.
                    if (this._anyHasCitationKey(targets)) {
                        addEntry(COPY_CITEKEY_ID, "Citation Key",
                            (fresh) => this._copyCitationKeys(fresh));
                    }
                    addSubSep();

                    // --- Select / Open links (moved in from the flat menu) ---
                    addEntry(COPY_SELECT_ID, "Select Link" + collSuffix,
                        (fresh) => this._copyCombinedSelectLink(fresh, collScopeNow()));
                    if (multi) {
                        addEntry(COPY_SELECT_SEP_ID,
                            "Select Links (Separate Links per Item)" + collSuffix,
                            (fresh) => this._copyItemLinks(fresh, "select", collScopeNow()));
                        if (openTargets.length) {
                            addEntry(COPY_OPEN_ID, "Open Links (Separate Links per Item)",
                                (fresh) => this._copyItemLinks(fresh, "open"));
                        }
                    } else if (openTargets.length) {
                        addEntry(COPY_OPEN_ID, "Open Link" + openExtSuffix,
                            (fresh) => this._copyItemLinks(fresh, "open"));
                    }

                    // --- Online (web) library link (zotero/zotero#2917) ---
                    if (this._anyHasWebURL(targets)) {
                        addEntry(COPY_WEB_ID, "Online Library Link",
                            (fresh) => this._copyOnlineLibraryLinks(fresh));
                    }

                    // --- Better BibTeX export formats (only when BBT active) ---
                    // Prefixed "[BBT]" so it's clear these come from the
                    // Better BibTeX plugin, not native Zotero.
                    if (this._isBetterBibTeXActive()) {
                        addSubSep();
                        addEntry(COPY_BIBTEX_ID, "[BBT] BibTeX",
                            (fresh) => this._copyExportToClipboard(fresh, BBT_BIBTEX_TRANSLATOR_ID));
                        addEntry(COPY_BIBLATEX_ID, "[BBT] BibLaTeX",
                            (fresh) => this._copyExportToClipboard(fresh, BBT_BIBLATEX_TRANSLATOR_ID));
                    }
                    }   // /wantCopy

                    // --- Add Related… ---------------------------- bottom block,
                    // with its own separator above it (skip if the menu already
                    // ends with one).
                    if (wantAdd) {
                    this._appendSeparatorIfMissing(doc, menu, SEP_ID);
                    const mi = doc.createXULElement("menuitem");
                    mi.id = ADD_REL_ID;
                    mi.setAttribute("label", targets.length > 1
                        ? "Add Related…  (" + targets.length + " items)"
                        : "Add Related…");
                    // Chain icon — semantic match for "Add Related…".
                    // Pick the theme-baked amber data URL so the icon
                    // matches the sidebar's `.wv-btn-relations` color
                    // (#7a4a00 light / #ffb84d dark) for visual
                    // consistency. The plugin's own _applyUIThemeClass
                    // toggles `wv-ui-dark` on the main window's
                    // documentElement, which we use as the theme signal.
                    const relIconURL = isDark
                        ? this._relationsIconURLDark
                        : this._relationsIconURLLight;
                    if (relIconURL) {
                        mi.classList.add("menuitem-iconic");
                        mi.setAttribute("image", relIconURL);
                    }
                    mi.addEventListener("command", async () => {
                        try {
                            const zp2 = win.ZoteroPane;
                            const sel2 = (zp2 && typeof zp2.getSelectedItems === "function")
                                ? zp2.getSelectedItems() : [];
                            const fresh = sel2.filter(isRelatable);
                            if (!fresh.length) return;
                            this._addRelatedItemDialog(fresh);
                        } catch (cmdErr) {
                            Zotero.debug(
                                "[Weavero] itemmenu add-related cmd err: " + cmdErr);
                        }
                    });
                    menu.appendChild(mi);
                    }   // /wantAdd
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] itemmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = (ev: any) => {
                // Ignore popuphidden events that bubbled up from descendant
                // submenu popups (e.g. a third-party plugin's submenu
                // closing on cursor-move). Without this guard our items
                // get stripped whenever any submenu closes — they appear
                // to "disappear" until the parent menu shows again. See
                // issue #8.
                if (!ev || ev.target !== menu) return;
                try {
                    this._clearStaleMenuIds(doc, ALL_IDS);
                } catch (e) {}
            };
            const onShowingGuarded = (ev: any) => {
                // Same bubble-up guard: don't re-run the full rebuild on
                // every descendant submenu open (cosmetic flicker + waste).
                if (!ev || ev.target !== menu) return;
                onShowing();
            };
            menu.addEventListener("popupshowing", onShowingGuarded);
            menu.addEventListener("popuphidden", onHidden);
            if (!this._itemMenuHandlersList) this._itemMenuHandlersList = [];
            this._itemMenuHandlersList.push({ menu, onShowing: onShowingGuarded, onHidden });
        } catch (e) {
            Zotero.debug("[Weavero] _setupItemsMenuForWindow err: " + e);
        }
    }

    /** Remove (and unbind) any previously-bound handler for a specific menu. */
    _removeItemMenuHandlerFor(menu: any) {
        if (!this._itemMenuHandlersList) { this._itemMenuHandlersList = []; return; }
        this._itemMenuHandlersList = this._itemMenuHandlersList.filter((h: any) => {
            if (h.menu === menu) {
                try { menu.removeEventListener("popupshowing", h.onShowing); } catch (e) {}
                try { menu.removeEventListener("popuphidden", h.onHidden); } catch (e) {}
                return false;
            }
            return true;
        });
    }

    _teardownItemsListContextMenu() {
        if (!this._itemMenuHandlersList) return;
        for (const h of this._itemMenuHandlersList) {
            try { h.menu.removeEventListener("popupshowing", h.onShowing); } catch (e) {}
            try { h.menu.removeEventListener("popuphidden", h.onHidden); } catch (e) {}
            try {
                this._clearStaleMenuIds(h.menu.ownerDocument, [
                    "wv-itemmenu-add-related", "wv-itemmenu-copy-as", "wv-itemmenu-open-in",
                    "wv-itemmenu-open-external", "wv-itemmenu-separator"
                ]);
            } catch (e) {}
        }
        this._itemMenuHandlersList = [];
    }

    _clearStaleMenuIds(doc: Document, ids: string[]) {
        for (const id of ids) {
            const stale = doc.getElementById(id);
            if (stale) stale.remove();
        }
    }

    _appendSeparatorIfMissing(doc: Document, menu: Element, id: string) {
        const last = menu.lastElementChild as any;
        if (!last || last.localName !== "menuseparator") {
            const sep = doc.createXULElement("menuseparator");
            sep.id = id;
            menu.appendChild(sep);
        }
    }

    /** Logic for "Open in External Viewer" inside the items context menu. */
    _appendExternalViewerToItemsMenu(doc: Document, menu: Element, selected: any[], win: any) {
        if (!this._getEnableOpenExternalViewer()) return;
        try {
            const showFile = menu.querySelector(".zotero-menuitem-show-file");
            if (!showFile) return;

            // Pick a representative attachment for the icon using Zotero's ordering.
            let repAtt: any = null;
            for (const it of selected) {
                const att = this._wvGetBestAttachmentSync(it);
                if (!att) continue;
                if (!repAtt) repAtt = att;
            }

            if (repAtt) {
                const EXTV_ID = "wv-itemmenu-open-external";
                const mi = this._createXULMenuItem(doc, {
                    id: EXTV_ID,
                    label: "Open in External Viewer",
                    image: this._wvAttachmentIconURL(repAtt) || undefined
                });

                mi.addEventListener("command", async () => {
                    try {
                        const zp2 = win.ZoteroPane;
                        const sel2 = (zp2 && typeof zp2.getSelectedItems === "function")
                            ? zp2.getSelectedItems() : [];
                        for (const it of sel2) {
                            const best = this._wvGetBestAttachmentSync(it);
                            if (!best) continue;
                            const path = await best.getFilePathAsync().catch(() => null);
                            if (path) {
                                try { Zotero.launchFile(path); }
                                catch (e) { Zotero.debug("[Weavero] launchFile err: " + e); }
                            }
                        }
                    } catch (cmdErr) {
                        Zotero.debug("[Weavero] open-external cmd err: " + cmdErr);
                    }
                });
                showFile.after(mi);
            }
        } catch (extErr) {
            Zotero.debug("[Weavero] open-external inject err: " + extErr);
        }
    }

    /** File-type word for the "Open <X> in" label, from an attachment's content
     *  type (PDF / EPUB / Snapshot / Image / …). */
    _wvAttachmentTypeLabel(att: any): string {
        try {
            const ct = (att && att.attachmentContentType) || "";
            if (ct === "application/pdf") return "PDF";
            if (ct === "application/epub+zip") return "EPUB";
            if (ct === "text/html") return "Snapshot";
            if (ct.indexOf("image/") === 0) return "Image";
            if (ct.indexOf("video/") === 0) return "Video";
            if (ct.indexOf("audio/") === 0) return "Audio";
            if (ct === "text/plain") return "Text";
            return "File";
        } catch (e) { return "File"; }
    }

    /** A group's palette-colour chip for menu rows — a filled ROUNDED
     *  SQUARE matching the tabs-menu `.wv-tgmenu-dot` exactly (12px,
     *  radius 3, Firefox-style; user request 2026-07-15 — was a circle,
     *  which didn't match the List-all-tabs group chip). Drawn centered
     *  on a 16×16 canvas at whole-pixel coords, so it renders at the
     *  same 12px visual size as the chip whether the menu shows the
     *  image at its natural size or stretches it to the 16px icon slot. */
    _wvGroupColorDotURI(hex: string): string {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
            + '<rect x="2" y="2" width="12" height="12" rx="3" ry="3" fill="' + hex + '"/></svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
    }

    /** A window-frame icon (data URI) for the "Open … in" window rows — mirrors the
     *  tabs-menu `.wv-winicon` glyph (rounded rect + title bar). Colour follows the
     *  menu theme (light / dark). */
    /** The tabs-menu `.wv-winicon` CSS box itself, wrapped in an SVG
     *  <foreignObject> so it can serve as a menuitem `image` URL. The
     *  List-all-tabs glyphs are CSS-drawn divs, NOT artwork files —
     *  every SVG re-draw of them rasterized differently (Gecko snaps
     *  CSS border-widths to device pixels; SVG strokes anti-alias), so
     *  after two mismatched approximations (user feedback 2026-07-15)
     *  the menu icon now embeds the very same CSS: same renderer,
     *  same pixels. `variant`: extra inline style for the bar div. */
    _wvWinIconFOUri(dark: boolean, tabStyle: string | null): string {
        const text = dark ? "#fbfbfe" : "#0f1420";   // menu text colours (light/dark theme)
        const bar = tabStyle
            || "position:absolute;left:0;right:0;top:0;height:2px;background:currentColor;opacity:0.5;";
        // EFFECTIVE values, not the stylesheet's literals (user report
        // 2026-07-15, measured live): the panel glyph's `1.3px` border
        // COMPUTES to 1px in the document, and its fractional layout
        // position softens the 2.5px bar to a ~2px band — inside this
        // image the same literals rasterized at full width and read
        // thicker. So: 1px border, 2px bar, whole-pixel placement
        // (padding-top 2, not flex centering — y=1.5 blurred the border
        // and bar into one band).
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">'
            + '<foreignObject width="16" height="16">'
            + '<div xmlns="http://www.w3.org/1999/xhtml" style="width:16px;height:16px;padding-top:2px;box-sizing:border-box;color:' + text + '">'
            + '<div style="position:relative;width:16px;height:13px;box-sizing:border-box;'
            + 'border:1px solid currentColor;border-radius:2px;opacity:0.8">'
            + '<div style="' + bar + '"></div>'
            + '</div></div>'
            + '</foreignObject></svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
    }

    _wvWindowIconURI(dark: boolean): string {
        return this._wvWinIconFOUri(dark, null);
    }

    /** A small plus icon (data URI) for the "New Group" rows. Drawn as whole-pixel
     *  rects at 16×16 (1:1 with the menu icon) so it stays crisp — no scaling, no
     *  soft round caps. */
    _wvPlusIconURI(dark: boolean): string {
        const c = dark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.62)";
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
            + '<rect x="7" y="3" width="2" height="10" fill="' + c + '"/>'
            + '<rect x="3" y="7" width="10" height="2" fill="' + c + '"/>'
            + '</svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
    }

    /** A MAIN-window icon (data URI): the window frame with a blue tab at its top
     *  left (a main window has tabs) — distinguishes it from reader windows, which
     *  keep the plain frame. */
    _wvMainWindowIconURI(dark: boolean): string {
        // `.wv-winicon-main`'s blue tab at its effective weight (see
        // _wvWinIconFOUri — 2px, whole-pixel inset).
        const blue = dark ? "#5b9bf8" : "#4072e5";
        return this._wvWinIconFOUri(dark,
            "position:absolute;left:2px;top:1px;width:6px;height:2px;border-radius:1px;background:" + blue + ";");
    }

    // (The old `_wvNewWindowIconURI` / `_wvNewReaderWindowIconURI`
    // shrunken-frame data URIs are gone — every "into a brand-new
    // window" option now renders through the shared icon-only row,
    // `_wvNewWindowIconRow` in tab-groups.ts.)

    /** Ordered list of windows that can host a new tab — every main window, then
     *  every Weavero multi-tab reader window — as `{win, name, isReader}`. Reader
     *  windows are labelled "Reader window"(/ N) like the tabs-menu sections. */
    _wvOpenInTargetWindows(): any[] {
        const out: any[] = [];
        // Names carry the same window-type glyph as the OS caption
        // (see _wvGlyphLabel) so move-target menus read the same way
        // as the taskbar previews.
        try {
            for (const w of (Zotero.getMainWindows() || [])) {
                out.push({ win: w, name: (this as any)._wvGlyphLabel(w, this._wvWindowName(w)), isReader: false });
            }
        } catch (e) {}
        try {
            const en = Services.wm.getEnumerator("zotero:reader");
            let n = 0;
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (!w || !w._wvWT) continue;
                n++;
                const base = (this as any)._wvWindowCustomTitle(w)
                    || (n > 1 ? "Reader window " + n : "Reader window");
                out.push({ win: w, name: (this as any)._wvGlyphLabel(w, base), isReader: true });
            }
        } catch (e) {}
        return out;
    }

    /** "Open <type> in ▸" — a submenu, NESTED BY WINDOW: each open main window is
     *  a submenu offering a loose "New tab" plus that window's tab groups. Picking
     *  a target focuses the window, opens the selected items' best attachments
     *  there, and (for a group) files the new tab into the group. Shown only when
     *  there's a real choice (>1 window, or at least one group). File attachments
     *  only — notes/links have no best attachment. */
    _appendOpenInToItemsMenu(doc: any, menu: any, selected: any[], win: any) {
        try {
            // Representative openable → icon + type word. Attachments use their best
            // attachment; a note is openable on its own (as a note tab).
            let repAtt: any = null;
            let repNote: any = null;
            let typeWord: string | null = null;
            let mixedType = false;
            let openableCount = 0;
            for (const it of selected) {
                let t: string | null = null;
                if (it && typeof it.isNote === "function" && it.isNote()) {
                    t = "Note";
                    if (!repNote) repNote = it;
                } else {
                    const att = this._wvGetBestAttachmentSync(it);
                    if (att) { if (!repAtt) repAtt = att; t = this._wvAttachmentTypeLabel(att); }
                }
                if (t) {
                    openableCount++;
                    if (typeWord == null) typeWord = t;
                    else if (typeWord !== t) mixedType = true;
                }
            }
            if (!repAtt && !repNote) return;   // nothing openable in the selection

            const targets = this._wvOpenInTargetWindows();
            // Group rows and "New Group" only while tab groups are ON: with
            // the option off they still created groups and stamped tabs --
            // invisible state that resurfaced when the option came back
            // (survey 2026-10-06).
            const groupsOn = !!(this._getEnableTabGroups && this._getEnableTabGroups());
            const groups = (groupsOn && this._tabGroupsGet ? this._tabGroupsGet() : [])
                .filter((g: any) => g && !g.saved && this._wvTabGroupHomeWin(g.id));
            // Always shown — "New Window" is always a valid destination.

            // Pluralize the type word for multi-item selections, matching the
            // native menu ("Open Notes in New Tab"): Note→Notes, PDF→PDFs, …
            // "Audio"/"Text" work as mass nouns and stay singular.
            const plural = openableCount > 1 && typeWord !== "Audio" && typeWord !== "Text";
            const label = (typeWord && !mixedType)
                ? ("Open " + typeWord + (plural ? "s" : "") + " in")
                : "Open in";
            const parent = doc.createXULElement("menu");
            parent.id = "wv-itemmenu-open-in";
            parent.setAttribute("label", label);
            const icon = repAtt ? this._wvAttachmentIconURL(repAtt)
                : "chrome://zotero/skin/16/universal/note.svg";
            if (icon) { parent.classList.add("menu-iconic"); parent.setAttribute("image", icon); }
            const pop = doc.createXULElement("menupopup");
            parent.appendChild(pop);

            // FLAT, grouped by window: every window is a row with the window icon
            // (open a New Tab there); its tab groups + "New Group" sit directly under
            // it, indented. Everything visible at once — no submenus to hover.
            const dark = !!(this._detectUIDark && this._detectUIDark());
            const mainIcon = this._wvMainWindowIconURI(dark);   // blue-tab frame (main windows)
            const readerIcon = this._wvWindowIconURI(dark);     // plain frame (reader windows)
            const plusIcon = this._wvPlusIconURI(dark);
            const INDENT = "padding-inline-start: 1.7em;";
            for (const t of targets) {
                const w = t.win;
                const wi = doc.createXULElement("menuitem");
                wi.setAttribute("label", t.name);
                wi.classList.add("menuitem-iconic");
                wi.setAttribute("image", t.isReader ? readerIcon : mainIcon);
                // Window-identity colour glyph on the RIGHT, like the
                // list-all-tabs headers (user request 2026-07-15).
                try { (this as any)._wvDecorateWindowTargetMenuitem(doc, wi, w, !!t.isReader); } catch (e) {}
                wi.addEventListener("command", () => { this._wvOpenInTarget(win, w, null); });
                pop.appendChild(wi);
                // This window's groups + "New Group", indented under it. Main windows
                // list their existing groups too; reader windows host groups (wvGroupId
                // stamps) but only offer "New Group" there (consistent with the Move
                // Tabs menu).
                if (!t.isReader) {
                    const winGroups = groups.filter((g: any) => this._wvTabGroupHomeWin(g.id) === w);
                    for (const g of winGroups) {
                        const gItem = doc.createXULElement("menuitem");
                        gItem.setAttribute("label", g.name || "Group");
                        gItem.classList.add("menuitem-iconic");
                        gItem.setAttribute("style", INDENT);
                        try { gItem.setAttribute("image", this._wvGroupColorDotURI(this._tabGroupColorHex(g.color))); } catch (e) {}
                        const gid = g.id;
                        gItem.addEventListener("command", () => { this._wvOpenInTarget(win, w, gid); });
                        pop.appendChild(gItem);
                    }
                }
                if (groupsOn) {
                    const ng = doc.createXULElement("menuitem");
                    ng.setAttribute("label", "New Group");
                    ng.classList.add("menuitem-iconic");
                    ng.setAttribute("style", INDENT);
                    ng.setAttribute("image", plusIcon);
                    ng.addEventListener("command", () => { this._wvOpenInTarget(win, w, null, true); });
                    pop.appendChild(ng);
                }
            }

            // "New Window" — open in a brand-new main window, plus its
            // "into a fresh group there" variant, as the shared icon-only
            // row (same compact treatment as the Move Tab / Move Group
            // menus — user request 2026-07-15); full text in the tooltips.
            if ((this as any)._wvMultiMainOn()) {
                pop.appendChild(doc.createXULElement("menuseparator"));
                pop.appendChild((this as any)._wvNewWindowIconRow(doc, dark, [
                    { main: true, grp: false, tip: "New Main Window",
                        fn: () => this._wvOpenInNewMainWindow(win, false) },
                    ...(groupsOn ? [{ main: true, grp: true, tip: "A New Group in a New Main Window",
                        fn: () => this._wvOpenInNewMainWindow(win, true) }] : []),
                ]));
            }

            // Placement: an all-notes selection sits right BELOW the native "Open
            // Note in New Tab / New Window" entries; otherwise directly above the
            // native "View Online" entry, falling back to the other open-actions.
            // Only VISIBLE note-open items — the menu also carries hidden
            // `.zotero-menuitem-attach-note` entries sitting past the separator,
            // which would otherwise pull the submenu into the next group.
            const noteOpens = (repNote && !repAtt)
                ? ([...menu.querySelectorAll(".zotero-menuitem-attach-note")] as any[]).filter((n: any) => n.parentNode === menu && !n.hidden)
                : [];
            if (noteOpens.length) {
                noteOpens[noteOpens.length - 1].after(parent);
            } else {
                const viewOnline = menu.querySelector(".zotero-menuitem-view-online");
                if (viewOnline && viewOnline.parentNode === menu) {
                    menu.insertBefore(parent, viewOnline);
                } else {
                    const anchor = menu.querySelector("#wv-itemmenu-open-external")
                        || menu.querySelector(".zotero-menuitem-show-file");
                    if (anchor && anchor.parentNode === menu) anchor.after(parent);
                    else menu.appendChild(parent);
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] open-in inject err: " + e);
        }
    }

    /** Open each selected item's best attachment in a target window (optionally a
     *  group). Focus the window so Zotero.Reader.open lands there; for a group,
     *  file the freshly-opened tab in via _wvTabGroupAddTab (retried briefly until
     *  the new tab lands in the window's tab list). */
    /** A clean, empty new main window (library tab only) — the hamburger's
     *  "New Main Window" (user request 2026-07-13). Same spawn path as the
     *  tab-context dev command: the pending flag routes onMainWindowLoad
     *  into managed-window init with an empty spawn queue = clean start. */
    _wvOpenEmptyMainWindow() {
        try {
            if (!(this as any)._wvMultiMainOn()) return;   // Multiple main windows off
            this._wvPrimeNewWindowLanding();
            const s = (this as any)._wvSpawnMainWindowStart();
            if (!s) return;
            // Zotero.openMainWindow is a bare ww.openWindow(null, ...) -- no
            // parent, no focus() -- and on Windows the new window can come
            // up BEHIND the one that opened it (MJT, 2026-09-22, Ctrl+N; the
            // Advanced Search window had the same on 2026-09-01). Raise it.
            this._wvRaiseNewMainWindow(s.before);
        } catch (e) {}
    }

    /** Zotero's collection tree selects the global `lastViewedFolder` pref
     *  when a new window initialises (collectionTree.jsx init) -- the row
     *  some window last viewed -- and the clean start in tabs.ts only
     *  corrected it afterwards, so a new window first showed that row's
     *  name and items before switching (MJT, 2026-09-23). Point the pref at
     *  the row the window is meant for before opening it: Zotero rewrites
     *  the pref on every selection, so the end state is what it was. The
     *  tabs.ts loop stays as the safety net (it returns at once when the
     *  landing already matches). */
    _wvPrimeNewWindowLanding(rowID?: string | null) {
        try {
            const want = (this as any)._wvPendingDevWindowSelect;
            const id = rowID || ((want && want.id) ? String(want.id) : ("L" + Zotero.Libraries.userLibraryID));
            Zotero.Prefs.set("lastViewedFolder", id);
        } catch (_) {}
    }

    /** Open a collection-tree row -- a library, collection, saved search,
     *  Trash, Unfiled... anything with a tree id -- in a NEW main window
     *  (MJT, 2026-09-22): the window lands on that row (the clean start in
     *  tabs.ts honours `_wvPendingDevWindowSelect`), raised like Ctrl+N's. */
    _wvOpenRowInNewMainWindow(rowID: string, libraryID?: number | null) {
        try {
            if (!rowID || !(this as any)._wvMultiMainOn()) return;
            (this as any)._wvPendingDevWindowSelect = { id: String(rowID), libraryID: (libraryID == null) ? null : libraryID };
            this._wvOpenEmptyMainWindow();
            // The opener refused (nothing will consume the request): drop it.
            if (!(this as any)._wvPendingDevWindow) (this as any)._wvPendingDevWindowSelect = null;
        } catch (e) { (this as any)._wvPendingDevWindowSelect = null; }
    }

    /** Two gestures on the collections tree (MJT, 2026-09-22).
     *
     *  MIDDLE-CLICK on a row opens it in a new main window and the current
     *  selection stays -- the browsers' and file managers' "open in a new
     *  tab/window" gesture. Shift+click, Ctrl+click and Ctrl+Shift+click
     *  are Zotero 10's own range / toggle / extend selection in this tree
     *  (Shift+click was Weavero's until MJT found the collision,
     *  2026-09-23; no modifier fallback for now, Alt+click being neither
     *  standard nor discoverable). Zotero's tree ignores the middle button
     *  on mouseup but its mousedown would select the row, so that mousedown
     *  is swallowed in capture at the pane, above the React root; the open
     *  happens on the mouseup released on the same row -- only with
     *  Multiple main windows on; otherwise the click is Zotero's.
     *
     *  A right-click no longer leaves the current collection. Zotero's tree
     *  selects the right-clicked row on MOUSEDOWN (_handleMouseDown does
     *  not check the button), which reloads the items list, and its
     *  context-menu items act on the selection. So the row is selected
     *  SILENTLY instead: Zotero's mousedown handler is pre-empted at the
     *  pane (capture, above the row's own listener) and the selection
     *  state is set by hand -- selected/focused/pivot, WITHOUT the row
     *  repaint, so the visible selection does not move either (MJT after
     *  dev.41: the moving highlight still read as "focuses that
     *  collection"); the target row only gets a dashed outline while its
     *  menu is up -- and without the select event, so the items list
     *  stays where it was (measured 2026-09-22: the real gesture had
     *  switched the list for the whole time the menu was up;
     *  `selectEventsSuppressed` is not usable, its setter fires the event
     *  when cleared and a Zotero action selecting meanwhile would hang in
     *  selectWait). The menu then builds for the context row. When it
     *  closes: dismissed or Weavero's "Open in New Window" -> the previous
     *  selection comes back, silently again, after a short grace. One of
     *  Zotero's own actions -> the context is KEPT for it (MJT: no
     *  focusing while the dialog is up, none at all if cancelled): the
     *  action reads the context row, and the context ends either when the
     *  selection becomes real -- Zotero selects the collection it just
     *  created, the parent after a delete -- or at the user's next click
     *  or key, which restores. Never a timer under an action: Delete
     *  re-reads the selection after its confirm. A right press that never
     *  opens the menu is undone after the mouseup grace. Only the menu's
     *  OWN popupshowing/popuphidden count (submenus bubble theirs). */
    _wvWireCollectionTreeGestures(win: any) {
        try {
            const doc = win && win.document;
            const pane = doc && doc.getElementById("zotero-collections-pane");
            const menu = doc && doc.getElementById("zotero-collectionmenu");
            if (!pane || !menu || doc._wvCollTreeWired) return;
            doc._wvCollTreeWired = true;
            const live = (): any => {
                const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                return p && !p._wvDestroyed ? p : null;
            };
            const rowOf = (target: any, e?: any) => {
                try {
                    let el = target && target.closest && target.closest(".row[id^='collection-tree-row-']");
                    if (!el && e && typeof e.clientX === "number" && doc.elementFromPoint) {
                        // The target can be DETACHED (a row re-rendered during the
                        // dispatch): fall back to what is under the pointer now.
                        const hit = doc.elementFromPoint(e.clientX, e.clientY);
                        el = hit && hit.closest && hit.closest(".row[id^='collection-tree-row-']");
                    }
                    if (!el) return null;
                    const idx = parseInt(el.id.slice("collection-tree-row-".length), 10);
                    const cv = win.ZoteroPane && win.ZoteroPane.collectionsView;
                    return (cv && !isNaN(idx)) ? cv.getRow(idx) : null;
                } catch (_) { return null; }
            };
            const selectedID = () => {
                try { const cv = win.ZoteroPane.collectionsView; const r = cv.getRow(cv.selection.focused); return r ? r.id : null; }
                catch (_) { return null; }
            };
            const snapshot = () => {
                const cv = win.ZoteroPane.collectionsView, s = cv.selection;
                const ids = [...s.selected].map((i: number) => { const r = cv.getRow(i); return r && r.id; }).filter(Boolean);
                const f = cv.getRow(s.focused);
                return { ids, focusedId: (f && f.id) || null };
            };
            /** Selection state without the select event (what TreeSelection.select
             *  does under suppression); `repaint` adds the row repaint it skips. */
            const applySilently = (snap: any, repaint: boolean) => {
                const cv = win.ZoteroPane.collectionsView, s = cv.selection;
                const idx = snap.ids.map((id: string) => cv.getRowIndexByID(id)).filter((i: any) => i !== false && i >= 0);
                if (!idx.length) return false;
                let f: any = snap.focusedId != null ? cv.getRowIndexByID(snap.focusedId) : false;
                if (f === false || f < 0) f = idx[0];
                const touched = new Set<number>([...s.selected, s.focused, ...idx, f]);
                s.selected = new Set(idx); s.focused = f; s.pivot = f;
                if (repaint) repaintRows(touched);
                return true;
            };
            /** Bring the rows' selection classes in line with the state, IN
             *  PLACE -- what Zotero's renderItem would set (selected,
             *  first-/last-selected, focused, aria-selected), without its
             *  rebuild: renderItem empties the row and resets its class, which
             *  detaches the element under the pointer when this runs inside
             *  a mousedown, and the browser's default focus handling then
             *  blurs the tree for a tick -- the selected row flashed grey
             *  (traced 2026-09-22). Neighbours are synced too for the
             *  selection-block corners. */
            const repaintRows = (rows: Iterable<number>) => {
                try {
                    const cv = win.ZoteroPane.collectionsView, s = cv.selection, n = cv.rowCount;
                    const all = new Set<number>();
                    for (const i of rows) { all.add(i); all.add(i - 1); all.add(i + 1); }
                    for (const i of all) {
                        if (i < 0 || i >= n) continue;
                        const el = doc.getElementById("collection-tree-row-" + i);
                        if (!el) continue;
                        const on = !!s.isSelected(i);
                        el.classList.toggle("selected", on);
                        el.classList.toggle("first-selected", on && (typeof s.isFirstRowOfSelectionBlock === "function" ? !!s.isFirstRowOfSelectionBlock(i) : !s.isSelected(i - 1)));
                        el.classList.toggle("last-selected", on && (typeof s.isLastRowOfSelectionBlock === "function" ? !!s.isLastRowOfSelectionBlock(i) : !s.isSelected(i + 1)));
                        el.classList.toggle("focused", s.focused === i);
                        if (on) el.setAttribute("aria-selected", "true"); else el.removeAttribute("aria-selected");
                    }
                } catch (_) {}
            };
            /** Paint guard. While a context selection is in place, every
             *  re-render of the rows (the tree focuses and blurs around the
             *  menu, scroll) would paint the highlight from the moved state
             *  (seen live 2026-09-22: three rows painted selected). Fixed back
             *  before paint -- a MutationObserver runs as a microtask -- the
             *  rows selected before keep `.selected`/`.focused`, the context
             *  row shows only the dashed cue. */
            /** Rows are tracked by ID, not index: a rename re-inserts the row
             *  at its new sorted position (index 12 -> 2 measured 2026-09-23),
             *  and an index-keyed guard then left Zotero's `selected` paint on
             *  the moved row -- a blue flash until the restore (MJT). */
            const guard: any = { obs: null, prevIds: new Set<string>(), prevFocusedId: null as string | null, ctxId: null as string | null };
            const rowIdAt = (i: number): string | null => { try { const r = win.ZoteroPane.collectionsView.getRow(i); return (r && r.id) || null; } catch (_) { return null; } };
            const fixRow = (el: any) => {
                try {
                    const m = /^collection-tree-row-(\d+)$/.exec(el.id || "");
                    if (!m) return;
                    const i = +m[1], cl = el.classList, id = rowIdAt(i);
                    const want = (name: string, on: boolean) => { if (cl.contains(name) !== on) cl.toggle(name, on); };
                    if (id && id === guard.ctxId) {
                        want("selected", false); want("first-selected", false); want("last-selected", false); want("focused", false);
                        want("wv-ctx-row", true);
                        if (el.hasAttribute("aria-selected")) el.removeAttribute("aria-selected");
                    } else if (id && guard.prevIds.has(id)) {
                        const above = rowIdAt(i - 1), below = rowIdAt(i + 1);
                        want("selected", true);
                        want("first-selected", !(above && guard.prevIds.has(above)));
                        want("last-selected", !(below && guard.prevIds.has(below)));
                        want("focused", id === guard.prevFocusedId);
                        want("wv-ctx-row", false);
                        if (el.getAttribute("aria-selected") !== "true") el.setAttribute("aria-selected", "true");
                    } else {
                        // neither: nothing else is selected while the context is up
                        want("selected", false); want("first-selected", false); want("last-selected", false); want("focused", false);
                        want("wv-ctx-row", false);
                        if (el.hasAttribute("aria-selected")) el.removeAttribute("aria-selected");
                    }
                } catch (_) {}
            };
            const guardRoot = () => doc.getElementById("collection-tree") || pane;
            const stopGuard = () => {
                try { if (guard.obs) guard.obs.disconnect(); } catch (_) {}
                guard.obs = null; guard.ctxId = null; guard.prevIds = new Set(); guard.prevFocusedId = null;
                try { for (const k of Array.from(doc.querySelectorAll(".row.wv-ctx-row")) as any[]) k.classList.remove("wv-ctx-row"); } catch (_) {}
            };
            const startGuard = (prevIds: string[], prevFocusedId: string | null, ctxId: string) => {
                stopGuard();
                guard.prevIds = new Set(prevIds); guard.prevFocusedId = prevFocusedId; guard.ctxId = ctxId;
                const root = guardRoot();
                for (const el of Array.from(root.querySelectorAll(".row")) as any[]) fixRow(el);
                const MO = win.MutationObserver;
                if (!MO) return;
                guard.obs = new MO((muts: any[]) => {
                    for (const m of muts) {
                        if (m.type === "attributes") fixRow(m.target);
                        else for (const n of Array.from(m.addedNodes) as any[]) {
                            if (!n || n.nodeType !== 1) continue;
                            if (n.classList && n.classList.contains("row")) fixRow(n);
                            else if (n.querySelectorAll) for (const el of Array.from(n.querySelectorAll(".row")) as any[]) fixRow(el);
                        }
                    }
                });
                guard.obs.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true, childList: true });
            };
            const idxOf = (id: string) => { const i = win.ZoteroPane.collectionsView.getRowIndexByID(id); return (i === false || i < 0) ? -1 : i; };
            /** Zotero enables its creation commands (cmd_zotero_newCollection
             *  -- the menu's New Collection… --, New Item, Import…) from the
             *  SELECTED rows, in _updateEnabledActionsForCollectionTreeRows,
             *  which only its select event runs. The silent context skips it:
             *  a read-only group right-clicked from My Library offered New
             *  Collection… (MJT 2026-09-25). Run Zotero's own logic for the
             *  rows the state now says are selected. */
            const syncCommandStates = (rows?: any[]) => {
                try {
                    const zp = win.ZoteroPane;
                    const r = rows || zp.getCollectionTreeRows();
                    if (r && r.length && typeof zp._updateEnabledActionsForCollectionTreeRows === "function") {
                        zp._updateEnabledActionsForCollectionTreeRows(r);
                    }
                } catch (_) {}
            };
            const restore = (c: any) => {
                try {
                    disarmDetector();
                    stopGuard();
                    const cur = snapshot();
                    if (cur.ids.length !== 1 || cur.focusedId !== c.ctxId) return;   // Zotero moved it meanwhile: leave it
                    applySilently(c.prev, true);
                    syncCommandStates();
                    const i = idxOf(c.ctxId); if (i >= 0) repaintRows([i]);
                    fixTabTitle();   // an action may have renamed the library tab to the context row
                } catch (_) {}
            };
            /** The context row is GONE (Delete Collection, Remove Library, a
             *  trashed search): Zotero selected a neighbour because the deleted
             *  row was "selected" -- but the user never left the previous
             *  row, so that is where they stay (the survey of 2026-09-23). */
            const restoreAfterRemoval = (c: any) => {
                try {
                    disarmDetector();
                    stopGuard();
                    const pnd = doc._wvCollPending;
                    if (pnd && pnd.c === c) { try { if (pnd.timer) win.clearTimeout(pnd.timer); } catch (_) {} doc._wvCollPending = null; }
                    if (doc._wvCollMenuCtx === c) doc._wvCollMenuCtx = null;
                    applySilently(c.prev, true);
                    syncCommandStates();
                    fixTabTitle();
                    try { win.setTimeout(fixTabTitle, 60); } catch (_) {}
                } catch (_) {}
            };
            const isHeader = (row: any) => { try { return !!((row.isHeader && row.isHeader()) || (row.isSeparator && row.isSeparator())); } catch (_) { return false; } };
            /** The dashed outline on a row that an action just created or
             *  renamed, while the user stays where they were (MJT, 2026-09-23:
             *  "showing an empty collection does not have any value"). Cleared
             *  at the next click or key, like the context outline. */
            const afterglow = (id: string) => {
                try {
                    clearAfterglow();
                    doc._wvCollAfterglow = id;
                    // The row of a just-created collection is rendered a moment later,
                    // and a refresh may re-render it (renderItem resets the class):
                    // re-apply for a while, until the next input clears it.
                    const apply = (tries: number) => {
                        try {
                            if (doc._wvCollAfterglow !== id) return;
                            const i = idxOf(id);
                            const el = i >= 0 ? doc.getElementById("collection-tree-row-" + i) : null;
                            if (el && !el.classList.contains("wv-ctx-row")) el.classList.add("wv-ctx-row");
                            if (tries < 20) win.setTimeout(() => apply(tries + 1), 100);
                        } catch (_) {}
                    };
                    apply(0);
                } catch (_) {}
            };
            const clearAfterglow = () => {
                try {
                    const id = doc._wvCollAfterglow; doc._wvCollAfterglow = null;
                    if (!id) return;
                    const i = idxOf(id);
                    const el = i >= 0 ? doc.getElementById("collection-tree-row-" + i) : null;
                    if (el && guard.ctxId !== id) el.classList.remove("wv-ctx-row");
                } catch (_) {}
            };
            /** Ids of the collections and searches that exist in a library --
             *  taken at command time, so a row selected afterwards that is not
             *  among them was CREATED by the action. */
            const knownRowIds = (libraryID: any) => {
                const known = new Set<string>();
                try { for (const c of (Zotero as any).Collections.getByLibrary(libraryID, true) || []) known.add("C" + c.id); } catch (_) {}
                try { for (const s of (Zotero as any).Searches.getByLibrary(libraryID) || []) known.add("S" + s.id); } catch (_) {}
                return known;
            };
            /** The first collection/search row in the tree that did not exist at
             *  command time -- the row an action created when Zotero did NOT
             *  select it (the cross-window guard in tabs.ts adds skipSelect in
             *  a window without OS focus; the runner's window is one). ONLY rows
             *  of the context row's library: `known` is that library's set, and
             *  the tree also lists group libraries (dev.62 outlined the first
             *  group collection after a rename, MJT 2026-09-23). */
            const createdRowId = (c: any): string | null => {
                try {
                    if (!c.known || c.knownLib == null) return null;
                    const cv = win.ZoteroPane.collectionsView;
                    for (let i = 0; i < cv.rowCount; i++) {
                        const r = cv.getRow(i); const id = r && r.id;
                        if (!id || !/^[CS]/.test(id) || !r.ref || r.ref.libraryID !== c.knownLib) continue;
                        if (!c.known.has(id)) return id;
                    }
                } catch (_) {}
                return null;
            };
            /** A real selection change while a context is kept for an action
             *  -- Zotero selecting the collection it just created, the parent
             *  after a delete -- ends the context: the highlight and the list
             *  follow it, nothing is restored. Detected on the selection's
             *  own event path (TreeSelection._updateTree, instance override
             *  over the prototype method). */
            const detector: any = { sel: null, timer: null };
            const disarmDetector = () => {
                try { const s = detector.sel; if (s && Object.prototype.hasOwnProperty.call(s, "_updateTree")) delete s._updateTree; } catch (_) {}
                try { if (detector.timer) win.clearTimeout(detector.timer); } catch (_) {}
                detector.timer = null;
                detector.sel = null;
            };
            const endContext = (c: any) => {
                disarmDetector();
                stopGuard();
                const pnd = doc._wvCollPending;
                if (pnd && pnd.c === c) { try { if (pnd.timer) win.clearTimeout(pnd.timer); } catch (_) {} doc._wvCollPending = null; }
                if (doc._wvCollMenuCtx === c) doc._wvCollMenuCtx = null;
                const rows = new Set<number>();
                for (const id of (c.prev.ids || [])) { const i = idxOf(id); if (i >= 0) rows.add(i); }
                const i = idxOf(c.ctxId); if (i >= 0) rows.add(i);
                repaintRows(rows);
            };
            const armDetector = (c: any) => {
                disarmDetector();
                try {
                    const s = win.ZoteroPane.collectionsView.selection;
                    const proto = Object.getPrototypeOf(s);
                    if (!proto || typeof proto._updateTree !== "function") return;
                    detector.sel = s;
                    /** The verdict on a real selection event under a kept context. */
                    const decide = (cur: any) => {
                        if (cur.ids.length === 1 && cur.focusedId === c.ctxId) {
                            // Zotero re-selecting the context row ITSELF: the tree
                            // refreshes a renamed (or synced) collection by removing
                            // and re-adding its row, then selectByID(current row).
                            // Not a move (MJT 2026-09-23: after renaming, no need to
                            // focus it): back to the previous selection, silently --
                            // the select event that follows is for that one, so the
                            // list does not reload. Zotero renamed the library tab to
                            // the collection meanwhile: put the tab title back too,
                            // and outline the row so the rename shows where it is.
                            restore(c);
                            const pnd = doc._wvCollPending;
                            if (pnd && pnd.c === c) { try { if (pnd.timer) win.clearTimeout(pnd.timer); } catch (_) {} doc._wvCollPending = null; }
                            fixTabTitle();
                            try { win.setTimeout(fixTabTitle, 60); } catch (_) {}
                            // A row the action created but Zotero did not select
                            // (skipSelect) gets the outline instead of the context row.
                            if (c.acted) afterglow(createdRowId(c) || c.ctxId);
                        }
                        else if (idxOf(c.ctxId) < 0 && (c.prev.ids || []).length && c.prev.ids.every((id: string) => idxOf(id) >= 0)) {
                            restoreAfterRemoval(c);   // the context row was deleted; the previous rows still exist
                        }
                        else if (c.known && cur.focusedId && !c.known.has(cur.focusedId) && /^[CS]/.test(cur.focusedId)
                                && (c.prev.ids || []).length && c.prev.ids.every((id: string) => idxOf(id) >= 0)) {
                            // A row the action CREATED (New Subcollection…, New
                            // Collection…, Duplicate, Copy): Zotero selects it, but an
                            // empty collection is nothing to look at -- stay where you
                            // were and outline the new row where it appeared.
                            const created = cur.focusedId;
                            restoreAfterRemoval(c);
                            afterglow(created);
                        }
                        else endContext(c);
                    };
                    s._updateTree = function (...args: any[]) {
                        try {
                            const cur = snapshot();
                            if (!cur.ids.length) {
                                // transient: a row removed under the selection during a refresh
                            }
                            else if (cur.ids.length === 1 && cur.focusedId === c.ctxId) {
                                // An inline rename is being typed: Zotero's own handler
                                // returns early while the focused row is the one edited
                                // (_handleSelectionChange) -- any other model here would
                                // COMMIT the edit. Pass the event through as is.
                                if (editing()) return proto._updateTree.apply(this, args);
                                if (!c.acted) {
                                    // No command yet (the menu is open, or the verdict of a
                                    // dismissed menu is pending): not a selection change --
                                    // a notification ending (collectionTree.notify sets
                                    // selectEventsSuppressed = false, whose setter fires
                                    // this) or a re-select of the silently selected row.
                                    // Zotero's handler would load the context row's list
                                    // (traced 2026-09-23: one 3.7 s after a rename, while
                                    // the next menu was open -- "the list follows the
                                    // target, My Library stays blue"). Not passed on at
                                    // all: ZoteroPane.onCollectionSelected is serialised
                                    // (Zotero.serial), so a model flipped for the call is
                                    // read LATER when a list load is still running (the
                                    // full suite caught exactly that, 2026-09-23). Only the
                                    // tree's 'select' listeners run -- what notify's
                                    // waitForSelect() awaits -- with nothing selected anew.
                                    try { const cv = win.ZoteroPane.collectionsView; if (typeof cv.runListeners === "function") cv.runListeners("select"); } catch (_) {}
                                    return;
                                }
                                // The context row "re-selected" -- the end of a rename, OR
                                // only a step on the way to selecting a CREATED row: Zotero
                                // expands the parent (a select event with the selection
                                // unchanged) before selectByID(new). Decide after a short
                                // grace unless a real change arrives first (measured
                                // 2026-09-23: acting at once ended the context and the new
                                // subcollection got selected after all).
                                // The event itself waits with the verdict: fired at once it
                                // would load the context row's list before a restore.
                                if (!detector.timer) {
                                    detector.timer = win.setTimeout(() => {
                                        detector.timer = null;
                                        try { if (detector.sel === s) decide(snapshot()); } catch (_) {}
                                        try { proto._updateTree.call(s); } catch (_) {}
                                    }, 250);
                                }
                                return;
                            }
                            else {
                                if (detector.timer) { try { win.clearTimeout(detector.timer); } catch (_) {} detector.timer = null; }
                                decide(cur);
                            }
                        } catch (_) {}
                        return proto._updateTree.apply(this, args);
                    };
                } catch (_) {}
            };
            const fixTabTitle = () => {
                try {
                    const zp = win.ZoteroPane, rows = zp.getCollectionTreeRows();
                    const name = rows.length === 1 ? rows[0].getName() : Zotero.getString("tab-title-multiple-collections");
                    if (name && win.Zotero_Tabs && typeof win.Zotero_Tabs.rename === "function") win.Zotero_Tabs.rename("zotero-pane", name);
                } catch (_) {}
            };
            /** The verdict on a closed menu. Measured live (2026-09-22): the
             *  popup hides FIRST and the chosen item's command arrives as a
             *  separate task a few ms later -- a 0-ms timer at popuphidden ran
             *  in between, restored the selection and "New Subcollection…"
             *  then read no collection at all. So a command COMMITS the
             *  context at once (document capture: items wired through a
             *  `<command>` element -- New Collection…, New Saved Search… --
             *  have their event redirected to that element and never pass
             *  through the popup), the restore waits a grace after
             *  popuphidden, and any mousedown settles a pending verdict
             *  first: the click that dismisses a menu by right-clicking
             *  another row lands before the grace and the next context would
             *  snapshot the unrestored state as its "previous" selection. */
            const editing = () => { try { return !!win.ZoteroPane.collectionsView._editing; } catch (_) { return false; } };
            const settle = () => {
                clearAfterglow();   // any click or key ends a created/renamed row's outline
                const pnd = doc._wvCollPending; if (!pnd) return;
                if (editing()) return;   // the inline rename of the context row is under way: keep its state
                doc._wvCollPending = null;
                try { if (pnd.timer) win.clearTimeout(pnd.timer); } catch (_) {}
                restore(pnd.c);
            };
            const onRightDown = (e: any) => {   // every mousedown on the pane: resolve, then settle
                try {
                    // The row is read BEFORE settling: a pending restore repaints
                    // the rows synchronously, which rebuilds the row under the
                    // pointer and detaches the event's target -- closest() then
                    // finds nothing and Zotero's own row listener, still on the
                    // dispatch path, selects for real (traced 2026-09-22: the
                    // second right-click after a cancelled New Subcollection…).
                    const row = (e.button === 2 || e.button === 1) ? rowOf(e.target, e) : null;
                    settle();
                    if (e.button === 1) { onMiddleDown(e, row); return; }
                    if (e.button !== 2) return;
                    if (!row || !row.id) return;
                    const stale = doc._wvCollCtx;   // a press whose menu never came
                    if (stale) { doc._wvCollCtx = null; restore(stale); }
                    const cv = win.ZoteroPane.collectionsView;
                    const idx = idxOf(row.id);
                    if (idx < 0 || cv.selection.isSelected(idx)) return;   // Zotero's own path changes nothing
                    if (typeof cv.isSelectable === "function" && !cv.isSelectable(idx)) return;
                    const prev = snapshot();
                    if (!applySilently({ ids: [row.id], focusedId: row.id }, false)) return;
                    e.stopPropagation();   // Zotero's mousedown handler would select for real
                    // ...and would focus the tree; do that part ourselves, or the
                    // selected row only turns its focused colour ~100 ms later when
                    // the contextmenu handler focuses (a visible flicker after a
                    // dialog had taken the focus away, MJT 2026-09-22).
                    try { if (cv.tree && typeof cv.tree.focus === "function") cv.tree.focus(); } catch (_) {}
                    startGuard(prev.ids, prev.focusedId != null ? prev.focusedId : null, row.id);
                    doc._wvCollCtx = { prev, ctxId: row.id, t: Date.now(), shown: false };
                    // From the press on, not only after a command: a notification
                    // ending while the menu is open fires a select event with the
                    // silent state (2026-09-23).
                    armDetector(doc._wvCollCtx);
                } catch (_) {}
            };
            const onRightUp = (e: any) => {   // no menu after the press (right-drag, suppressed contextmenu): undo
                try {
                    if (e.button !== 2) return;
                    const c = doc._wvCollCtx;
                    if (!c) return;
                    win.setTimeout(() => { try { if (doc._wvCollCtx === c && !c.shown) { doc._wvCollCtx = null; restore(c); } } catch (_) {} }, 1200);
                } catch (_) {}
            };
            /** Zotero greys Export / Create Bibliography / Generate Report (and
             *  Empty Trash) from the ITEMS LIST's row count, which with the
             *  silent context is still the previous row's list. Re-derive from
             *  the target row: collections synchronously from their child items
             *  (descendants too when items from subcollections are shown), saved
             *  searches and the trash from the row's own query, a moment after
             *  the menu opens; libraries are left to Zotero (counting a whole
             *  library per right-click is not worth it). MJT 2026-09-23. */
            const fixMenuEnabledFromRow = (c: any) => {
                try {
                    const cv = win.ZoteroPane.collectionsView, idx = idxOf(c.ctxId);
                    if (idx < 0) return;
                    const row = cv.getRow(idx);
                    if (!row) return;
                    syncCommandStates([row]);   // New Collection… follows its command
                    const setDisabled = (ids: string[], disabled: boolean) => {
                        if (menu.state === "closed" || doc._wvCollMenuCtx !== c) return;
                        for (const id of ids) { const el = menu.querySelector("#" + id); if (el && !el.hidden) el.disabled = !!disabled; }
                    };
                    if (row.isCollection && row.isCollection()) {
                        let own = 0, below = 0;
                        try { own = row.ref.getChildItems(true, false).length; } catch (_) {}
                        try { const d0 = row.ref.getDescendents(false, "item", false); below = Array.isArray(d0) ? d0.length : 0; } catch (_) {}
                        const shown = own || (Zotero.Prefs.get("recursiveCollections") ? below : 0);
                        setDisabled(["createBibCollection", "loadReport"], !shown);
                        setDisabled(["exportCollection"], !shown && !below);
                    }
                    else if ((row.isSearch && row.isSearch()) || (row.isTrash && row.isTrash())) {
                        const trash = !!(row.isTrash && row.isTrash());
                        if (trash && row.isWithinGroup && row.isWithinGroup() && row.isWithinEditableGroup && !row.isWithinEditableGroup()) return;   // Zotero's reason stands
                        Promise.resolve(row.getItems()).then((items: any[]) => {
                            const empty = !(items && items.length);
                            if (trash) setDisabled(["emptyTrash"], empty);
                            else setDisabled(["exportCollection", "createBibCollection", "loadReport"], empty);
                        }).catch(() => {});
                    }
                } catch (_) {}
            };
            const onShowing = (e: any) => {
                if (e.target !== menu) return;
                doc._wvCollMenuActed = false;
                const c = doc._wvCollCtx; doc._wvCollCtx = null;
                if (c) c.shown = true;
                doc._wvCollMenuCtx = (c && Date.now() - c.t < 3000) ? c : null;
                if (doc._wvCollMenuCtx) fixMenuEnabledFromRow(doc._wvCollMenuCtx);
            };
            /** Actions that work on the ITEMS LIST of the row, not just on the
             *  row: they need the selection real before they run. Edit Saved
             *  Search opens the editor in the items pane for the selected
             *  search (setSavedSearchEditorState reads the first selected row,
             *  the pane shows that search's results) -- MJT 2026-09-23: "the
             *  saved search collection should be selected". Zotero's builder
             *  gives the items their option id. */
            const needsRealSelection = (target: any, c: any) => {
                try {
                    const id = target && target.id;
                    return id === "editSelectedCollection" && typeof c.ctxId === "string" && c.ctxId[0] === "S";
                } catch (_) { return false; }
            };
            const commitNow = (c: any) => {
                try {
                    disarmDetector();
                    stopGuard();
                    const pnd = doc._wvCollPending;
                    if (pnd && pnd.c === c) { try { if (pnd.timer) win.clearTimeout(pnd.timer); } catch (_) {} doc._wvCollPending = null; }
                    if (doc._wvCollMenuCtx === c) doc._wvCollMenuCtx = null;
                    const cv = win.ZoteroPane.collectionsView, s = cv.selection;
                    if (typeof s._updateTree === "function") s._updateTree();   // the select event: list follows
                    else win.ZoteroPane.onCollectionSelected();
                    const rows = new Set<number>([...s.selected, s.focused]);
                    for (const id of (c.prev.ids || [])) { const i = idxOf(id); if (i >= 0) rows.add(i); }
                    repaintRows(rows);
                } catch (_) {}
            };
            /** Actions that take their items from the ITEMS LIST, on a saved
             *  search row: Export… and Generate Report… fall back to
             *  getSortedItems() (the list) for searches, while for collections
             *  they read the collection objects. With the silent context the
             *  list is still the previous row's, so these run only once the
             *  selection is committed AND the list shows the search (the
             *  survey of 2026-09-23). The item's own handler is pre-empted and
             *  the underlying function called instead. */
            const listDependentRunner = (target: any, c: any): (() => void) | null => {
                try {
                    if (!(typeof c.ctxId === "string" && c.ctxId[0] === "S")) return null;
                    const id = target && target.id;
                    if (id === "exportCollection") return () => win.Zotero_File_Interface.exportCollection();
                    if (id === "loadReport") return () => win.Zotero_Report_Interface.loadCollectionReport();
                    return null;
                } catch (_) { return null; }
            };
            const runWhenListShows = (rowID: string, fn: () => void, tries = 0) => {
                try {
                    const iv = win.ZoteroPane.itemsView, rows = iv && iv.collectionTreeRows;
                    // The rows switch at the START of the list's load and the load
                    // deferred is reset at the same moment, so once they match,
                    // waitForLoad() is the new load's promise (itemTree.jsx).
                    if (rows && rows[0] && rows[0].id === rowID) {
                        const p = (typeof iv.waitForLoad === "function") ? iv.waitForLoad() : null;
                        Promise.resolve(p).then(() => {
                            const r2 = iv.collectionTreeRows;
                            if (r2 && r2[0] && r2[0].id === rowID) fn();
                            else runWhenListShows(rowID, fn, tries + 1);
                        }).catch((e: any) => Zotero.debug("[Weavero] deferred menu action err: " + e));
                        return;
                    }
                    if (tries < 300) win.setTimeout(() => runWhenListShows(rowID, fn, tries + 1), 50);
                    else Zotero.debug("[Weavero] deferred menu action: the list never showed " + rowID);
                } catch (e) { Zotero.debug("[Weavero] runWhenListShows err: " + e); }
            };
            const onCommand = (e: any) => {   // document capture, see above
                try {
                    const pnd = doc._wvCollPending;
                    const c = doc._wvCollMenuCtx || (pnd && pnd.c);
                    if (!c) return;
                    // Weavero's own entry needs no selection: restore afterwards.
                    if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-wv-collection-open")) return;
                    doc._wvCollMenuActed = true;
                    c.acted = true;
                    try {
                        const r = win.ZoteroPane.collectionsView.getRow(idxOf(c.ctxId));
                        c.knownLib = r && r.ref && r.ref.libraryID != null ? r.ref.libraryID : Zotero.Libraries.userLibraryID;
                        c.known = knownRowIds(c.knownLib);
                    } catch (_) {}
                    const deferred = listDependentRunner(e.target, c);
                    if (deferred) {
                        e.stopPropagation(); e.preventDefault();   // the item's own handler would read the previous list
                        const id = c.ctxId;
                        commitNow(c);
                        runWhenListShows(id, deferred);
                        return;
                    }
                    if (needsRealSelection(e.target, c)) { commitNow(c); return; }   // before the item's handler
                    if (pnd) { try { if (pnd.timer) win.clearTimeout(pnd.timer); } catch (_) {} pnd.timer = null; }   // no timer under an action
                    armDetector(c);   // the item's handler runs next, on the context row
                } catch (_) {}
            };
            const onHidden = (e: any) => {
                try {
                    if (e.target !== menu) return;
                    const c = doc._wvCollMenuCtx; doc._wvCollMenuCtx = null;
                    if (!c) return;
                    settle();   // an older verdict still pending (defensive)
                    doc._wvCollPending = { c, timer: c.acted ? null : win.setTimeout(settle, 250) };   // the command, if any, lands within a few ms
                } catch (_) {}
            };
            const onMiddleDown = (e: any, row: any) => {   // from onRightDown, button 1
                try {
                    doc._wvCollMiddle = null;
                    if (!row || !row.id) return;
                    if (isHeader(row)) { e.preventDefault(); e.stopPropagation(); return; }   // the "Group Libraries" header, separators: nothing to open (the Feeds row is a real row)
                    const p = live();
                    if (!p || !p._wvMultiMainOn()) return;   // Zotero's click
                    e.preventDefault(); e.stopPropagation();   // Zotero's mousedown would select the row (and no autoscroll)
                    doc._wvCollMiddle = { id: row.id, libraryID: (row.ref && row.ref.libraryID != null) ? row.ref.libraryID : null, t: Date.now() };
                } catch (_) {}
            };
            const onMiddleUp = (e: any) => {   // mouseup AND auxclick, button 1
                try {
                    if (e.button !== 1) return;
                    const m = doc._wvCollMiddle;
                    if (e.type !== "mouseup") {   // the auxclick that follows an open: swallowed
                        if (doc._wvCollMiddleOpenedAt && Date.now() - doc._wvCollMiddleOpenedAt < 800) { e.preventDefault(); e.stopPropagation(); }
                        return;
                    }
                    doc._wvCollMiddle = null;
                    if (!m || Date.now() - m.t > 3000) return;
                    const row = rowOf(e.target, e);
                    if (!row || row.id !== m.id) return;   // released elsewhere: nothing
                    const p = live();
                    if (!p || !p._wvMultiMainOn()) return;
                    e.preventDefault(); e.stopPropagation();
                    doc._wvCollMiddleOpenedAt = Date.now();
                    p._wvOpenRowInNewMainWindow(m.id, m.libraryID);
                } catch (_) {}
            };
            /** A right-click on the "Group Libraries" header (a separator too)
             *  shows Zotero's menu for whatever IS selected -- confusing, no
             *  target (MJT, 2026-09-23): no menu there at all. The Feeds row is
             *  not a header: it is selectable, has its own menu, and is left
             *  alone. ONE exception: the Group Libraries header has Weavero's
             *  own menu (the hidden-collections wiring, 2026-10-05, listens on
             *  the tree): Hide the section, Show Hidden Group Libraries, or at
             *  least Manage Hidden… (always, MJT 2026-10-20) -- this capture
             *  listener on the PANE runs first and used to swallow that click
             *  too: the dot showed, the right-click did nothing (MJT
             *  2026-10-16). Open it from here. */
            const onContext = (e: any) => {
                try {
                    const row = rowOf(e.target, e);
                    if (!row || !isHeader(row)) return;
                    e.preventDefault(); e.stopPropagation();
                    const p = live();
                    if (p && row.ref && row.ref.id === "group-libraries-header"
                            && typeof p._wvHidOn === "function" && p._wvHidOn()
                            && typeof p._wvHidOpenGroupsMenu === "function") {
                        p._wvHidOpenGroupsMenu(win, e.screenX, e.screenY);
                    }
                } catch (_) {}
            };
            // Outside the pane a mousedown just settles; inside, onRightDown
            // settles itself after resolving the row (see there).
            const settleOutside = (e: any) => { try { if (pane.contains(e.target)) return; } catch (_) {} settle(); };
            pane.addEventListener("mousedown", onRightDown, true);
            pane.addEventListener("mouseup", onRightUp, true);
            pane.addEventListener("mouseup", onMiddleUp, true);
            pane.addEventListener("auxclick", onMiddleUp, true);
            pane.addEventListener("contextmenu", onContext, true);
            menu.addEventListener("popupshowing", onShowing, true);
            doc.addEventListener("command", onCommand, true);
            doc.addEventListener("mousedown", settleOutside, true);   // a pending verdict settles before the input is handled
            doc.addEventListener("keydown", settle, true);
            menu.addEventListener("popuphidden", onHidden);
            doc._wvCollTreeGestures = { onRightDown, onRightUp, onMiddleUp, onContext, onHidden, onShowing, onCommand, settle };   // for the guard
            doc._wvCollTreeUnwire = () => {
                try {
                    pane.removeEventListener("mousedown", onRightDown, true);
                    pane.removeEventListener("mouseup", onRightUp, true);
                    pane.removeEventListener("mouseup", onMiddleUp, true);
                    pane.removeEventListener("contextmenu", onContext, true);
                    pane.removeEventListener("auxclick", onMiddleUp, true);
                    menu.removeEventListener("popupshowing", onShowing, true);
                    doc.removeEventListener("command", onCommand, true);
                    doc.removeEventListener("mousedown", settleOutside, true);
                    doc.removeEventListener("keydown", settle, true);
                    menu.removeEventListener("popuphidden", onHidden);
                } catch (_) {}
                try { settle(); disarmDetector(); stopGuard(); } catch (_) {}
                delete doc._wvCollTreeWired; delete doc._wvCollTreeGestures; delete doc._wvCollTreeUnwire; delete doc._wvCollPending;
            };
        } catch (e) { Zotero.debug("[Weavero] _wvWireCollectionTreeGestures err: " + e); }
    }

    _wvUnwireCollectionTreeGestures() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) { try { const d = w.document; if (d && d._wvCollTreeUnwire) d._wvCollTreeUnwire(); } catch (e) {} }
        } catch (e) {}
    }

    /** "Open in New Window" on the collections context menu (MenuManager,
     *  `main/library/collection`), for one library, collection, saved
     *  search, Trash, Unfiled... row -- not a feed; Multiple main windows on.
     *  FIRST OF THE PLUGIN SECTION at the bottom, right after MenuManager's
     *  group separator -- NOT at the top where "Open in..." usually lives:
     *  ZoteroPane.buildCollectionContextMenu addresses `menu.childNodes[i]`
     *  BY INDEX and rewrites id/label/command on each, so anything inserted
     *  before Zotero's own children shifts the whole menu (dev.37: the entry
     *  became "Sync", Zotero's separators took our attributes; measured
     *  2026-09-22). MenuManager also refuses a registration carrying a
     *  top-level separator for context-menu targets (dev.36 lost the entry).
     *  MenuManager re-appends custom entries at the bottom in registration
     *  order on every popupshowing, so the entry moves itself up to the
     *  group separator -- BEFORE labelling: a fresh acceltext does not
     *  survive insertBefore. A separator of Weavero's OWN follows the entry
     *  (MJT, 2026-09-22): safe there, after Zotero's positional block, and
     *  MenuManager's cleanup only touches `.zotero-custom-menu-item`. It
     *  shows only when a visible entry follows it (other plugins decide
     *  their visibility in their own hooks, hence the popupshown re-check). */
    _wvRegisterCollectionMenuEntries() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if (!(MM && typeof MM.registerMenu === "function")) return;
            this._wvTeardownCollectionMenuEntries();
            const live = (): any => {
                const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                return p && !p._wvDestroyed ? p : null;
            };
            const rowFor = (ctx: any) => {
                try {
                    const rows = ctx && ctx.collectionTreeRows;
                    if (!rows || rows.length !== 1) return null;
                    const r = rows[0];
                    if (!r || !r.id) return null;
                    if ((r.isFeed && r.isFeed()) || (r.isFeeds && r.isFeeds())) return null;
                    return r;
                } catch (_) { return null; }
            };
            const shown = (ctx: any) => { const p = live(); return !!(p && p._wvMultiMainOn() && rowFor(ctx)); };
            const placeFirstOfPlugins = (el: any, visible: boolean) => {
                const popup = el && el.parentNode;
                if (!popup) return;
                const grp = popup.querySelector(":scope > .zotero-custom-menu-group-separator");
                if (grp && grp.nextSibling !== el) popup.insertBefore(el, grp.nextSibling);
                let sep = popup.querySelector(":scope > [data-wv-collection-open-sep]");
                if (!sep) {
                    sep = el.ownerDocument.createXULElement("menuseparator");
                    sep.setAttribute("data-wv-collection-open-sep", "true");
                }
                if (el.nextSibling !== sep) popup.insertBefore(sep, el.nextSibling);
                const decide = () => {
                    try {
                        let n = sep.nextElementSibling;
                        while (n && n.hidden) n = n.nextElementSibling;
                        sep.hidden = !visible || !n || n.localName === "menuseparator";
                    } catch (_) { sep.hidden = true; }
                };
                decide();
                (sep as any)._wvDecide = decide;   // for the guard (untrusted popupshown never reaches us)
                // Keyed, replaced on every build: a `{ once }` listener per
                // build piled up whenever the menu was built without showing,
                // and outlived a reload (wiring slice 3, full suite 2026-10-13).
                // "lazy:": wired on the first menu build after a (re)load, not
                // by the wiring table (zz-reload-listeners' convention; a run
                // with the hidden-collections suite before the audit reported
                // it lost, 2026-10-21).
                const lp: any = live();
                wvUnlisten(popup, "lazy:collOpenSep:shown");
                if (lp) wvListen(popup, "lazy:collOpenSep:shown", "popupshown", decide, false, lp._wvWireTag());
            };
            // Zotero's own "new window" glyph, the one Weavero's other
            // open-in-new-window rows already carry (annotation menus).
            const ICON_NEW_WINDOW = "chrome://zotero/skin/16/universal/new-window.svg";
            const menus = [{
                menuType: "menuitem",
                icon: ICON_NEW_WINDOW,
                darkIcon: ICON_NEW_WINDOW,
                onShowing: (_ev: any, ctx: any) => {
                    try {
                        const el = ctx.menuElem, visible = shown(ctx);
                        placeFirstOfPlugins(el, visible);
                        el.setAttribute("label", "Open in New Window");
                        el.setAttribute("acceltext", "Middle-click");
                        el.setAttribute("data-wv-collection-open", "true");
                        ctx.setVisible(visible);
                    } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                },
                onCommand: (_ev: any, ctx: any) => {
                    try {
                        const p = live(), r = rowFor(ctx);
                        if (p && r) p._wvOpenRowInNewMainWindow(r.id, (r.ref && r.ref.libraryID != null) ? r.ref.libraryID : null);
                    }
                    catch (e) { Zotero.debug("[Weavero] collection Open in New Window err: " + e); }
                },
            }];
            const id = MM.registerMenu({ menuID: "weavero-collection-open-window", pluginID: "weavero@mjthoraval", target: "main/library/collection", menus });
            (this as any)._wvCollectionMenuID = id || null;
            (this as any)._wvCollectionMenus = menus;
            this._wvPurgeCollectionMenuStrays();
        } catch (e) { Zotero.debug("[Weavero] _wvRegisterCollectionMenuEntries err: " + e); }
    }

    _wvTeardownCollectionMenuEntries() {
        try {
            const MM: any = (Zotero as any).MenuManager, id = (this as any)._wvCollectionMenuID;
            if (id && MM && typeof MM.unregisterMenu === "function") MM.unregisterMenu(id);
        } catch (e) {}
        this._wvPurgeCollectionMenuStrays();
        (this as any)._wvCollectionMenuID = null;
        (this as any)._wvCollectionMenus = null;
    }

    /** Windows ghost menus (Zotero forum 128935, 130191; intermittent,
     *  unfixed): a context-menu item that opens a MODAL dialog -- New
     *  Collection…, Delete Collection…, Change Parent Item… -- leaves an
     *  empty afterimage of the menu on screen until the dialog closes.
     *  Measured 2026-09-22 (dev profile, Zotero 10, Gecko 140): with the
     *  dialog up the popup's DOM state is "closed" and its native window is
     *  hidden (EnumWindows), and Zotero's own render of the main window
     *  shows no menu -- the pixels are stale composition, cleared only by
     *  the main window's next presented frame, which the modal's nested
     *  loop postpones (a popup opened from the bridge meanwhile stuck in
     *  "showing"). The popup hides BEFORE the item's command is dispatched
     *  (Mozilla PopupGuide; the trace), so a refresh tick forced from a
     *  document-level capture `command` listener lands between the two and
     *  presents that frame before the dialog opens. Windows only; no-op
     *  elsewhere. WV-TEMP: retire when Zotero/Gecko fix it. */
    _wvWireMenuGhostWorkaround(win: any) {
        try {
            const doc = win && win.document;
            if (!doc || doc._wvMenuGhostFix) return;
            const isWin = !!(Zotero as any).isWin;
            const fix = (e: any) => {
                try {
                    if (!isWin) return false;
                    const t = e && e.target;
                    if (!t) return false;
                    const fromPopup = !!(t.closest && t.closest("menupopup"));
                    if (!fromPopup && t.localName !== "command") return false;
                    const u = win.windowUtils;
                    if (!u || typeof u.advanceTimeAndRefresh !== "function") return false;
                    u.advanceTimeAndRefresh(0);
                    u.restoreNormalRefresh();
                    return true;
                } catch (_) { try { win.windowUtils.restoreNormalRefresh(); } catch (_2) {} return false; }
            };
            doc.addEventListener("command", fix, true);
            doc._wvMenuGhostFix = fix;
            doc._wvMenuGhostUnwire = () => {
                try { doc.removeEventListener("command", fix, true); } catch (_) {}
                delete doc._wvMenuGhostFix; delete doc._wvMenuGhostUnwire;
            };
        } catch (e) { Zotero.debug("[Weavero] _wvWireMenuGhostWorkaround err: " + e); }
    }

    _wvUnwireMenuGhostWorkaround() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) { try { const d = w.document; if (d && d._wvMenuGhostUnwire) d._wvMenuGhostUnwire(); } catch (e) {} }
        } catch (e) {}
    }

    /** Remove the separator Weavero itself inserts into the collections
     *  menu (and dev.37's strays, which Zotero's positional pass renamed):
     *  not MenuManager's, so it never cleans them up. Recreated on the next
     *  popupshowing while the entry is registered. */
    _wvPurgeCollectionMenuStrays() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                try {
                    const menu = w.document.getElementById("zotero-collectionmenu");
                    if (!menu) continue;
                    for (const k of Array.from(menu.querySelectorAll("[data-wv-collection-open-sep]"))) (k as any).remove();
                } catch (e) {}
            }
        } catch (e) {}
    }

    /** Bring the main window that is not in `before` to the front: best
     *  effort, bounded -- window.focus() until the document has OS focus,
     *  at most ten times over four seconds (a retry loop that never ends
     *  would fight the user's next focus change). */
    _wvRaiseNewMainWindow(before: Set<any>) {
        try {
            const setT = wvTimeout;
            const t0 = Date.now();
            let nw: any = null, tries = 0;
            const tick = () => {
                try {
                    if (!nw) nw = ((Zotero as any).getMainWindows() || []).find((w: any) => !before.has(w)) || null;
                    if (nw && !nw.closed) {
                        if (nw.document.hasFocus()) return;   // in front: done
                        nw.focus();
                        if (++tries >= 10) return;
                    }
                    if (Date.now() - t0 < 4000) setT(tick, 100);
                } catch (_) {}
            };
            setT(tick, 100);
        } catch (_) {}
    }

    /** Picker → open the chosen items in a NEW reader window: the first
     *  reader-able attachment anchors the window, the rest mount as tabs
     *  (notes included). Notes-only selections no-op (a reader window
     *  needs a reader native). The hamburger's "New Reader Window". */
    async _wvNewReaderWindowPicker(win: any) {
        try {
            const io: any = {
                dataIn: null, dataOut: null,
                deferred: Zotero.Promise.defer(),
                itemTreeID: "weavero-newreaderwin-select",
            };
            win.openDialog("chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            await io.deferred.promise;
            if (!io.dataOut || !io.dataOut.length) return;
            const items: any = await Zotero.Items.getAsync(io.dataOut);
            const readerables: any[] = [];
            const notes: any[] = [];
            for (const it of items) {
                try {
                    if (it.isNote && it.isNote()) { notes.push(it.id); continue; }
                    let att: any = null;
                    if (it.attachmentReaderType) att = it;
                    else if (it.isRegularItem && it.isRegularItem()) att = await it.getBestAttachment();
                    if (att && att.attachmentReaderType) readerables.push(att.id);
                } catch (e2) {}
            }
            if (!readerables.length) {
                Zotero.debug("[Weavero] new-reader-window: no reader-able item picked");
                return;
            }
            const reader: any = await (Zotero.Reader as any).open(readerables[0], null,
                { openInWindow: true, allowDuplicate: true });
            let rw: any = reader && reader._window;
            const setT = (win.setTimeout || setTimeout).bind(win);
            for (let i = 0; i < 40 && !(rw && rw._wvWT); i++) {
                await new Promise(r => setT(r, 100));
                rw = reader && reader._window;
            }
            if (!rw || !rw._wvWT) return;
            for (const id of readerables.slice(1)) {
                try { this._wvWTAddLazyReaderTab(rw, id); } catch (e2) {}
            }
            for (const id of notes) {
                try { await this._wvWTMountTab(rw, id, { allowDuplicate: true, select: false, await: true }); } catch (e2) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvNewReaderWindowPicker err: " + e); }
    }

    /** Ctrl+T / Cmd+T in a MAIN window opens the same "open a library
     *  item" picker as the reader windows' + button, opening the picked
     *  items as tabs in THIS window (user request 2026-07-13). Zotero
     *  binds nothing to accel+T natively (verified live — no <key>).
     *  Idempotent per window; capture phase so it fires with focus
     *  anywhere in the window. */
    /** Ctrl+N (⌘N on macOS) → open a new main window, Firefox-style
     *  (user request 2026-07-15). Wired on mains AND reader/note
     *  windows; Zotero binds nothing to accel+N natively (verified
     *  live — no <key> carries it). */
    _wvWireNewWindowShortcut(win: any) {
        try {
            if (!win) return;
            // Keyed, instance-tagged (lib/listen.ts; wiring slice 3).
            wvListen(win, "newWindowKey", "keydown", (ke: any) => {
                try {
                    const accel = wvAccel(ke);
                    if (!accel || ke.shiftKey || ke.altKey
                        || String(ke.key).toLowerCase() !== "n") return;
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!live || live._wvDestroyed || !live._wvMultiMainOn()) return;
                    ke.preventDefault(); ke.stopPropagation();
                    live._wvOpenEmptyMainWindow();
                } catch (e2) {}
            }, true, (this as any)._wvWireTag());
        } catch (e) {}
    }

    /** Native menubar entries for Weavero's window commands -- File: New Tab...
     *  / New Reader Window... / New Main Window (the hamburger's three top
     *  entries, same order, same handlers); Edit: Advanced Search in New
     *  Window, right under Zotero's own Advanced Search (the Shift+click /
     *  right-click gesture, named). Forum comment 518424 (dclunie, macOS,
     *  2026-09-19): "couldn't figure out how to get it to show me a new main
     *  window or an advanced search popup" -- the hamburger, the only menu
     *  home of these commands until v0.20.2, sits in the compact title bar's
     *  tab strip, which is never built on macOS, so a Mac user had the
     *  shortcuts and nothing else.
     *
     *  Zotero.MenuManager (no-op without it). Two facts of that API shape the
     *  code: it has no `label` option (l10nID only), and it RE-APPENDS every
     *  custom entry at the BOTTOM of the popup on each popupshowing, then runs
     *  onShowing -- so each entry labels itself, moves itself into place and
     *  re-reads its prefs there (a Settings change shows on the next open,
     *  no reload). Gating: the Tabs and Windows master for all four; the two
     *  that open a MAIN window (New Main Window, Advanced Search in New
     *  Window) also follow Multiple main windows (`_wvMultiMainOn`, the one
     *  switch for a second main window); the Edit entry is Z10-only like the
     *  gesture (skipped when `cmd_zotero_advancedSearch` is absent).
     *  Reader windows get the File three as well (`reader/menubar/file`;
     *  MJT, 2026-09-22): New Tab only when that window has Weavero's tab
     *  strip (`win._wvWT` -- a single-document window has no tab to add),
     *  the other two always. No Edit entry there: a reader's Edit menu has
     *  no Advanced Search to sit under.
     *
     *  The hamburger (Windows/Linux) mirrors the LIVE File popup, and keeps
     *  its own Firefox-style New Tab / New Reader Window / New Main Window at
     *  the top -- so inside the hamburger the three File entries would show
     *  twice (MJT, 2026-09-22: "Stick only to the Firefox like menu", which is
     *  also what Firefox does: its app menu never repeats its File menu). The
     *  File popup opened from the hamburger anchors on a menu INSIDE
     *  #wv-hamburger-popup (from the menubar it anchors on #fileMenu), and the
     *  three entries and their separator hide in that case. The Edit entry has
     *  no hamburger twin and shows in both. Guard:
     *  test/menubar-window-entries.spec.js. */
    _wvRegisterMenubarWindowEntries() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if (!(MM && typeof MM.registerMenu === "function")) {
                this._dbg("[Weavero] MenuManager unavailable; skip menubar window entries");
                return;
            }
            this._wvTeardownMenubarWindowEntries();
            const liveP = (): any => {
                const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                return p && !p._wvDestroyed ? p : null;
            };
            const winOfCtx = (ctx: any): any => {
                try { return ctx.menuElem.ownerDocument.defaultView; } catch (e) { return null; }
            };
            const ACCEL = Zotero.isMac ? "\u2318" : "Ctrl+";
            const SHORTCUT_F = Zotero.isMac ? "\u21E7\u2318F" : "Ctrl+Shift+F";
            const master = (): boolean => {
                try { const p = liveP(); return !!(p && p._getTabsAndWindowsMaster()); }
                catch (e) { return false; }
            };
            const newMain = (): boolean => {
                try { const p = liveP(); return master() && !!(p && p._getNewMainWindow()); }
                catch (e) { return false; }
            };
            // The popup this entry sits in was opened from the hamburger (its
            // mirrored File submenu), where the same three already lead.
            const inHamburger = (el: any): boolean => {
                try {
                    const a = el.parentNode && el.parentNode.anchorNode;
                    return !!(a && a.closest && a.closest("#wv-hamburger-popup"));
                } catch (e) { return false; }
            };
            // MenuManager appended `el` last; put it at `index` among the
            // popup's other children, or right after `after`. ALWAYS before
            // the attributes go on: a freshly set `acceltext` does not survive
            // the move (Gecko drops it when the menuitem's frame is rebuilt;
            // `label` survives -- measured 2026-09-22, closed and open popup),
            // set after the move it stays.
            const place = (el: any, index: number, after?: any) => {
                try {
                    const popup = el.parentNode;
                    if (!popup) return;
                    let ref: any = null;
                    if (after) ref = after.nextSibling;
                    else {
                        const kids = Array.from(popup.children).filter((k: any) => k !== el);
                        ref = kids[index] || null;
                    }
                    if (ref !== el) popup.insertBefore(el, ref);
                } catch (e) {}
            };
            const entry = (key: string, label: string, accel: string | null, index: number,
                           shown: (win: any) => boolean, run: (win: any, p: any) => void) => ({
                menuType: "menuitem",
                onShowing: (_ev: any, ctx: any) => {
                    try {
                        const el = ctx.menuElem;
                        place(el, index);
                        el.dataset.wvMenubar = key;
                        el.setAttribute("label", label);
                        if (accel) el.setAttribute("acceltext", accel);
                        ctx.setVisible(shown(el.ownerDocument.defaultView) && !inHamburger(el));
                    } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                },
                onCommand: (_ev: any, ctx: any) => {
                    try { const p = liveP(); if (p) run(winOfCtx(ctx), p); }
                    catch (e) { Zotero.debug("[Weavero] menubar entry " + key + " err: " + e); }
                },
            });
            // MenuManager stamps its keys onto the menu data, so each
            // registration gets its own objects.
            const sep = () => ({
                menuType: "separator",
                onShowing: (_ev: any, ctx: any) => {
                    try {
                        const el = ctx.menuElem;
                        el.dataset.wvMenubar = "sep";
                        place(el, 3);
                        ctx.setVisible(master() && !inHamburger(el));
                    } catch (e) {}
                },
            });
            const newReaderWin = () => entry("newreaderwin", "New Reader Window\u2026", null, 1, master,
                (win, p) => p._wvNewReaderWindowPicker(win));
            const newMainWin = () => entry("newmainwin", "New Main Window", ACCEL + "N", 2, newMain,
                (_win, p) => p._wvOpenEmptyMainWindow());
            const fileMenus = [
                entry("newtab", "New Tab\u2026", ACCEL + "T", 0, master,
                    (win, p) => p._wvMainNewTabPicker(win)),
                newReaderWin(),
                newMainWin(),
                sep(),
            ];
            // Reader window: New Tab is the strip's + button (the hamburger's
            // own route), present only with the strip.
            const readerFileMenus = [
                entry("newtab", "New Tab\u2026", ACCEL + "T", 0,
                    (win) => master() && !!(win && win._wvWT),
                    (win, _p) => {
                        const b = win && win.document && win.document.querySelector(".wv-window-newtab-btn");
                        if (b) b.click();
                    }),
                newReaderWin(),
                newMainWin(),
                sep(),
            ];
            const editMenus = [{
                menuType: "menuitem",
                onShowing: (_ev: any, ctx: any) => {
                    try {
                        const el = ctx.menuElem;
                        const doc = el.ownerDocument;
                        const anchor = doc.getElementById("menu_advancedSearch");
                        if (anchor) place(el, -1, anchor);
                        el.dataset.wvMenubar = "advsearchwin";
                        el.setAttribute("label", "Advanced Search in New Window");
                        // With the shortcut remapped (Settings), it is ours to
                        // show and Zotero's line loses it. Its acceltext is
                        // rebuilt from the `key` attribute and cannot be
                        // blanked directly (measured 2026-09-22), so the
                        // attribute itself moves; teardown puts it back.
                        const lp = liveP();
                        const remap = !!(lp && lp._getAdvSearchShortcutNewWindow && lp._getAdvSearchShortcutNewWindow());
                        el.setAttribute("acceltext", remap ? SHORTCUT_F : "Shift+Click");
                        if (anchor) {
                            if (remap) { anchor.removeAttribute("key"); anchor.removeAttribute("acceltext"); }
                            else if (!anchor.hasAttribute("key")) anchor.setAttribute("key", "key_advancedSearch");
                        }
                        ctx.setVisible(newMain() && !!anchor
                            && !!doc.getElementById("cmd_zotero_advancedSearch"));
                    } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                },
                onCommand: (_ev: any, _ctx: any) => {
                    try { const p = liveP(); if (p) p._wvAdvSearchOpenNewWindow(); }
                    catch (e) { Zotero.debug("[Weavero] menubar entry advsearchwin err: " + e); }
                },
            }];
            const ids: any[] = [];
            for (const [menuID, target, menus] of [
                ["weavero-menubar-file-windows", "main/menubar/file", fileMenus],
                ["weavero-menubar-edit-advsearch", "main/menubar/edit", editMenus],
                ["weavero-menubar-reader-file-windows", "reader/menubar/file", readerFileMenus],
            ] as any[]) {
                const id = MM.registerMenu({ menuID, pluginID: "weavero@mjthoraval", target, menus });
                if (id) ids.push(id);
            }
            (this as any)._wvMenubarMenuIDs = ids;
            // The unwrapped menu data, for the spec: a synthetic `command`
            // never reaches MenuManager's listener (chrome listeners ignore
            // untrusted events, and `doCommand()` reaches no JS listener at
            // all -- measured 2026-09-22), so the guard calls onCommand here.
            (this as any)._wvMenubarMenus = { file: fileMenus, edit: editMenus, readerFile: readerFileMenus };
            this._dbg("[Weavero] menubar window entries registered: " + ids.join(", "));
        } catch (e) { Zotero.debug("[Weavero] _wvRegisterMenubarWindowEntries err: " + e); }
    }

    _wvTeardownMenubarWindowEntries() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            const ids: any[] = (this as any)._wvMenubarMenuIDs || [];
            if (MM && typeof MM.unregisterMenu === "function") {
                for (const id of ids) { try { MM.unregisterMenu(id); } catch (e) {} }
            }
        } catch (e) {}
        (this as any)._wvMenubarMenuIDs = [];
        (this as any)._wvMenubarMenus = null;
        // Zotero's Advanced Search line gets its shortcut back (the remap
        // moved the `key` attribute onto our entry's acceltext).
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                const a = w.document && w.document.getElementById("menu_advancedSearch");
                if (a && !a.hasAttribute("key")) a.setAttribute("key", "key_advancedSearch");
            }
        } catch (e) {}
    }

    /** Shift+click on Advanced Search (the funnel toolbar button or the menu
     *  item) opens it in a NEW main window (user request 2026-09-01). Plain
     *  click and Ctrl+Shift+F stay native. Z10-only by construction: the
     *  standalone advancedSearch.xhtml window was removed upstream, and on
     *  Z9 the native control already opens a separate window, so the wiring
     *  is skipped when the in-main command is absent.
     *
     *  DOCUMENT-level capture, deliberately: the menuitem forwards its
     *  command to `cmd_zotero_advancedSearch` in its own default handling,
     *  and the funnel button's listener lives inside the quick-search custom
     *  element — neither can be pre-empted from the element itself (a
     *  same-element listener added later runs after the attribute handler). */
    _wvWireAdvSearchNewWindow(win: any) {
        try {
            if (!win || !win.document) return;
            const doc: any = win.document;
            const TAG = (this as any)._wvWireTag();
            if (doc._wvAdvSearchWinWire === TAG) return;
            const old = doc._wvAdvSearchWinHandler;
            if (old) {
                try { doc.removeEventListener("command", old, true); } catch (_) {}
                try { doc.removeEventListener("click", old, true); } catch (_) {}
            }
            const oldCtx = doc._wvAdvSearchCtxHandler;
            if (oldCtx) {
                try { doc.removeEventListener("contextmenu", oldCtx, true); } catch (_) {}
            }
            const oldKey = doc._wvAdvSearchKeyHandler;
            if (oldKey) {
                try { doc.removeEventListener("keydown", oldKey, true); } catch (_) {}
            }
            const oldMid = doc._wvAdvSearchMidHandler;
            if (oldMid) {
                try { doc.removeEventListener("mousedown", oldMid, true); } catch (_) {}
                try { doc.removeEventListener("auxclick", oldMid, true); } catch (_) {}
            }
            // Rebuild the popup on rewire — its command listeners close over
            // the OLD build's labels otherwise (entries resolve the live
            // plugin at command time, but a stale DOM node is still stale).
            try { const p0 = doc.getElementById("wv-advsearch-context"); if (p0) p0.remove(); } catch (_) {}
            doc._wvAdvSearchWinWire = TAG;
            if (!doc.getElementById("cmd_zotero_advancedSearch")) return;
            const isTarget = (t: any) => {
                try {
                    if (!t) return false;
                    if (t.id === "menu_advancedSearch") return true;
                    // The menuitem FORWARDS its command to the <command>
                    // element in its default handling, and preventDefault on
                    // the menuitem event does not stop that -- intercepting
                    // only the menuitem opened BOTH the in-main pane and the
                    // new window (MJT 2026-09-01). Catch the forwarded event
                    // too; the reentry guard collapses the pair. The
                    // Ctrl+Shift+F key stays native (accel is pressed, and
                    // the interceptor requires shift ALONE).
                    if (t.id === "cmd_zotero_advancedSearch") return true;
                    // ONLY Zotero's funnel — never Weavero's own filter funnel.
                    return !!(t.closest && t.closest("#zotero-tb-search-advanced-button"));
                } catch (_) { return false; }
            };
            const handler = (e: any) => {
                try {
                    if (!e.shiftKey || e.altKey || wvAccelAny(e)) return;
                    if (e.type === "click" && e.button !== 0) return;
                    if (!isTarget(e.target)) return;
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!live || live._wvDestroyed || !live._wvMultiMainOn()) return;   // native
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    try {
                        const p = e.target.closest && e.target.closest("menupopup");
                        if (p && p.hidePopup) p.hidePopup();
                    } catch (_) {}
                    live._wvAdvSearchOpenNewWindow();
                } catch (_) {}
            };
            doc._wvAdvSearchWinHandler = handler;
            doc.addEventListener("command", handler, true);
            doc.addEventListener("click", handler, true);
            // Right-click on the funnel → discoverability menu for the same
            // two actions (user request 2026-09-03). The button has NO native
            // context menu (verified live: no context attr, no popup child),
            // so this shadows nothing.
            const ctx = (e: any) => {
                try {
                    const t = e.target;
                    if (!(t && t.closest && t.closest("#zotero-tb-search-advanced-button"))) return;
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!live || live._wvDestroyed || !live._wvMultiMainOn()) return;
                    e.preventDefault();
                    e.stopPropagation();
                    live._wvAdvSearchContextMenu(win, e);
                } catch (_) {}
            };
            doc._wvAdvSearchCtxHandler = ctx;
            doc.addEventListener("contextmenu", ctx, true);
            // Middle-click on the funnel → the same new window (MJT, 2026-09-23;
            // the browsers' "open in a new tab/window" button, as for the
            // collections). The press is swallowed (autoscroll), the open is
            // the auxclick that follows the release.
            const mid = (e: any) => {
                try {
                    if (e.button !== 1) return;
                    const t = e.target;
                    if (!(t && t.closest && t.closest("#zotero-tb-search-advanced-button"))) return;
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!live || live._wvDestroyed || !live._wvMultiMainOn()) return;   // native
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.type === "auxclick") live._wvAdvSearchOpenNewWindow();
                } catch (_) {}
            };
            doc._wvAdvSearchMidHandler = mid;
            doc.addEventListener("mousedown", mid, true);
            doc.addEventListener("auxclick", mid, true);
            // Ctrl+Shift+F / ⇧⌘F itself, when Settings says so. A capture
            // keydown in the DEFAULT event group runs before Zotero's <key>:
            // GlobalKeyListener sits in the system group and returns as soon
            // as the event is default-prevented (Gecko GlobalKeyListener.cpp,
            // read 2026-09-22). The pref is read per press -- no rewire.
            const key = (ke: any) => {
                try {
                    const accel = wvAccel(ke);
                    if (!accel || !ke.shiftKey || ke.altKey || String(ke.key).toLowerCase() !== "f") return;
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!live || live._wvDestroyed || !live._getAdvSearchShortcutNewWindow()) return;
                    ke.preventDefault();
                    ke.stopPropagation();
                    live._wvAdvSearchOpenNewWindow();
                } catch (_) {}
            };
            doc._wvAdvSearchKeyHandler = key;
            doc.addEventListener("keydown", key, true);
        } catch (e) {}
    }

    /** The funnel's right-click menu: the plain open and the new-window open
     *  (the Shift+click action, made discoverable). Built lazily once per
     *  window; entries resolve the live plugin at command time. */
    _wvAdvSearchContextMenu(win: any, event: any) {
        try {
            const doc = win.document;
            let popup: any = doc.getElementById("wv-advsearch-context");
            if (!popup) {
                popup = doc.createXULElement("menupopup");
                popup.id = "wv-advsearch-context";
                const mk = (label: string, hint: string | null, onCmd: () => void) => wvMenuItem(doc, { label, acceltext: hint || undefined, onCommand: () => onCmd() }, popup);
                mk("Open Advanced Search", null, () => {
                    try { win.ZoteroPane.toggleAdvancedSearchState("open"); } catch (_) {}
                });
                mk("Open in New Window", "Shift+Click / Middle-click", () => {
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (live && !live._wvDestroyed) live._wvAdvSearchOpenNewWindow();
                });
                (doc.querySelector("popupset") || doc.documentElement).appendChild(popup);
            }
            popup.openPopupAtScreen(event.screenX, event.screenY, true);
        } catch (e) { Zotero.debug("[Weavero] _wvAdvSearchContextMenu err: " + e); }
    }

    /** Open a fresh main window and, once its pane is ready, open the
     *  advanced-search pane there. Bounded polls only; on a miss the new
     *  window stays open (still useful) and the failure is logged. */
    /** Window features for the Advanced Search window. Without explicit
     *  width/height a new main window takes the primary's persisted size AND
     *  `sizemode=maximized` -- full screen (MJT, 2026-09-22: "should get a
     *  similar size as the old advanced search window had"). The old dialog
     *  sized to its content and persisted what the user gave it; this one
     *  opens at a modest default, centred, and remembers its last size
     *  (`weavero.advSearchWindowSize`, "WxH"). Explicit features win over the
     *  persisted maximized state (measured: 760x560 requested -> a normal
     *  943x592 window next to a maximized primary; 943 is the main layout's
     *  minimum width). */
    _wvAdvSearchWindowFeatures(): string {
        let w = 1100, h = 720;
        try {
            const m = String(Zotero.Prefs.get("weavero.advSearchWindowSize") || "").match(/^(\d{3,5})x(\d{3,5})$/);
            if (m) { w = parseInt(m[1], 10); h = parseInt(m[2], 10); }
        } catch (_) {}
        return "chrome,all,dialog=no,resizable=yes,centerscreen,width=" + w + ",height=" + h;
    }

    /** Collapse / expand button for the collections pane. The library's
     *  left pane had no toggle where the item pane (sidenav) and both reader
     *  panes have one (MJT, 2026-09-22). A `.zotero-tb-button` with Zotero's
     *  own sidebar glyph (20/universal/sidebar.svg, the panel on the left --
     *  the item pane's button shows it mirrored); the icon rides
     *  `list-style-image` on the button as Zotero's toolbar buttons do.
     *
     *  It lives at the window's TOP-LEFT and does not move when pressed
     *  (MJT, same day). No one toolbar spans that spot in both states -- the
     *  collections toolbar collapses with its pane, the items toolbar only
     *  reaches the left edge once the pane is gone -- so the button re-homes:
     *  first in the collections toolbar while the pane is open, first in the
     *  items toolbar while it is collapsed, and a margin measured on each
     *  re-home matches the left offset (the collapsed splitter is 8 or 10 px
     *  by density, the collections toolbar's inset 8). A MutationObserver on
     *  the pane's `collapsed` attribute re-homes it whichever way the pane
     *  was toggled (button, View -> Layout, the splitter).
     *  Settings: Extras -> "Collapse / expand button for the collections
     *  pane", on by default; applied per window, re-applied on pref change. */
    /** Top of row `i` in a Zotero windowed list. zotero/zotero PR #6049
     *  (fix for #6023) renames `_getItemPosition` to `getRowPosition` and
     *  makes the old name `Zotero.warn` on EVERY call -- the sticky parents
     *  call it on each scroll frame, so the console would flood. Prefer the
     *  new name, fall back to the old one (upstream register #24). */
    _wvRowPos(this: any, jw: any, i: number): number {
        if (jw && typeof jw.getRowPosition === "function") return jw.getRowPosition(i);
        if (jw && typeof jw._getItemPosition === "function") return jw._getItemPosition(i);
        return 0;
    }

    /** Side-pane splitters stop at the pane's minimum width instead of
     *  collapsing it on a drag (setting "Resizing a side pane stops at its
     *  minimum width", MJT 2026-09-23 -- the reader window's behaviour).
     *  Zotero declares the snap statically (zoteroPane.xhtml: `collapse=
     *  "before"` on the collections splitter, `"after"` on the items
     *  splitter) and never rewrites it, so the attribute is stashed and
     *  removed while on, put back when off. Collapsing stays a click away:
     *  Weavero's collections-pane button, Zotero's item-pane sidenav toggle,
     *  View -> Layout -- all of them set the pane's `collapsed` directly. */
    _wvApplyPaneDragNoCollapse(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            const on = !!(this as any)._getPaneDragNoCollapse();
            // The reader tabs' context pane too: it has its own sidenav toggle.
            for (const id of ["zotero-collections-splitter", "zotero-items-splitter", "zotero-context-splitter"]) {
                const sp: any = doc.getElementById(id);
                if (!sp) continue;
                if (on) {
                    if (sp.hasAttribute("collapse")) {
                        sp.setAttribute("data-wv-collapse", sp.getAttribute("collapse"));
                        sp.removeAttribute("collapse");
                    }
                } else if (sp.hasAttribute("data-wv-collapse")) {
                    sp.setAttribute("collapse", sp.getAttribute("data-wv-collapse"));
                    sp.removeAttribute("data-wv-collapse");
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvApplyPaneDragNoCollapse err: " + e); }
    }

    /** Full path of a collections-tree row, outermost first ("My Library ›
     *  WV scroll test A › A10 test collection"), or null for a top-level row
     *  (its name alone says it all). */
    _wvCollRowPath(cv: any, idx: number): string | null {
        try {
            const names: string[] = [];
            let p = idx, guard = 0;
            while (p != null && p >= 0 && guard++ < 64) {
                const row = cv.getRow(p);
                if (!row) break;
                names.unshift(String(row.getName()));
                p = cv.getParentIndex(p);
            }
            return names.length > 1 ? names.join(" › ") : null;
        } catch (_) { return null; }
    }

    // ---- Hidden collections, saved searches and group libraries ----------
    // (MJT 2026-10-05.) PER WINDOW: each main window has its own set, so two
    // windows can show different parts of the library. The set is part of
    // the WINDOW'S OWN STATE: live on the window (`win._wvHid`), saved with
    // its library view in `wvMainState` / the session window record (field
    // `hiddenColl`, next to `collection` and `columnPrefs`) -- so it travels
    // wherever the window does: the restart store (anchor + managed
    // windows), Save & Close / Reopen, tab sessions (each session its own
    // sets, the anchor's included), disable -> enable. Nothing is keyed by
    // position or id, and nothing is orphaned: the set goes with its window.
    // Objects are keyed by library + key (renames and moves keep them
    // hidden). Display-only: Zotero's data is untouched, so without Weavero
    // everything shows. Zotero's own pattern for its virtual views
    // (zoteroPane.js buildCollectionContextMenu): "Hide" on the row,
    // "Show ..." on the library row in the sep2 group, only when something
    // is hidden. The tree asks `_includedInTree()` before adding each group
    // library, collection and saved search (collectionTree.jsx refresh /
    // _expandRow): answering "no" leaves the object out, and a hidden
    // collection's sub-collections with it. Extras master.

    _wvHidOn(): boolean {
        try { return !!(this as any)._getEnableVisualExtras(); } catch (_) { return false; }
    }

    _wvHidBlank(): any { return { groups: [], libs: [], feeds: [], hidden: {}, sections: [] }; }

    _wvHidNormalize(data: any): any {
        if (!data || typeof data !== "object") return this._wvHidBlank();
        return {
            groups: Array.isArray(data.groups) ? data.groups.map(Number).filter((n: number) => n > 0) : [],
            libs: Array.isArray(data.libs) ? data.libs.map(Number).filter((n: number) => n > 0) : [],
            feeds: Array.isArray(data.feeds) ? data.feeds.map(Number).filter((n: number) => n > 0) : [],
            hidden: (data.hidden && typeof data.hidden === "object") ? JSON.parse(JSON.stringify(data.hidden)) : {},
            sections: Array.isArray(data.sections) ? data.sections.filter((s: any) => this._wvHidSectionNames().includes(s)) : [],
        };
    }

    /** One window's set: {groups: libraryID[] (hidden group libraries), libs:
     *  libraryID[] (My Library, when hidden; 2026-10-20), feeds: libraryID[]
     *  (feeds hidden one by one; 2026-10-21), hidden: {libraryID: ["C<key>" |
     *  "S<key>" | "V<type>"]}, sections: ["groups" | "feeds"] (whole sections,
     *  2026-10-20)}. */
    _wvHidState(win: any): any {
        if (!win) return this._wvHidBlank();
        if (!win._wvHid) win._wvHid = this._wvHidBlank();
        return win._wvHid;
    }

    /** The hidden non-group libraries of a set (older sets have no `libs`). */
    _wvHidLibs(st: any): number[] { return st.libs || (st.libs = []); }

    /** The feeds hidden one by one in a set (older sets have no `feeds`). */
    _wvHidFeeds(st: any): number[] { return st.feeds || (st.feeds = []); }

    /** The hidden whole sections of a set (older sets have no `sections`). */
    _wvHidSections(st: any): string[] { return st.sections || (st.sections = []); }

    _wvHidHasAny(st: any): boolean {
        return !!st && (st.groups.length > 0 || (st.libs || []).length > 0 || (st.feeds || []).length > 0 || (st.sections || []).length > 0
            || Object.keys(st.hidden).some(k => (st.hidden[k] || []).length > 0));
    }

    /** For the window's saved state: a copy, or undefined when nothing is hidden. */
    _wvHidCapture(win: any): any {
        try {
            const st = win && win._wvHid;
            return this._wvHidHasAny(st) ? JSON.parse(JSON.stringify(st)) : undefined;
        } catch (_) { return undefined; }
    }

    /** From the window's saved state (null = nothing hidden). Rebuilds the
     *  tree only when the set really changes. */
    async _wvHidRestore(win: any, data: any) {
        try {
            if (!win) return;
            const next = this._wvHidNormalize(data);
            if (JSON.stringify(next) === JSON.stringify(this._wvHidNormalize(this._wvHidState(win)))) return;
            win._wvHid = next;
            await this._wvHidRefreshWin(win);
        } catch (e) { Zotero.debug("[Weavero] _wvHidRestore err: " + e); }
    }

    /** A change: refresh the window store soon, so it survives a crash too
     *  (the store also saves periodically and at quit). */
    _wvHidSave(_win: any) {
        try { (this as any)._wvWindowStoreSaveDebounced(); } catch (_) {}
    }

    /** One-time migration from the 0.21.7-dev.2..4 file
     *  (weavero/hidden-collections.json, windows keyed "anchor" / "win-<id>"
     *  / "0"): applied to the matching open window, then the file is renamed
     *  to *.migrated. */
    async _wvHidLoad() {
        const P: any = this;
        if (P._wvHidMigrated) return;
        P._wvHidMigrated = true;
        const path = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "hidden-collections.json");
        let doc: any = null;
        try { doc = JSON.parse(await IOUtils.readUTF8(path)); } catch (_) { return; }
        try {
            const wins: any[] = wvMainWins();
            for (const [k, v] of Object.entries((doc && doc.windows) || {})) {
                const w = (k === "anchor" || k === "0") ? (this as any)._wvAnchorWindow()
                    : /^win-(\d+)$/.test(k) ? wins.find((x: any) => x._wvManagedWindow && ("win-" + x._wvWindowId) === k) : null;
                if (w && !this._wvHidHasAny(w._wvHid)) await this._wvHidRestore(w, v);
            }
            try { await IOUtils.move(path, path + ".migrated"); } catch (_) {}
            this._wvHidSave(null);
        } catch (e) { Zotero.debug("[Weavero] hidden-collections migration err: " + e); }
    }

    /** "C<key>" / "S<key>" for a collection / saved search (duck-typed: the
     *  plugin sandbox's `instanceof Zotero.Collection` fails across realms). */
    _wvHidKey(ref: any): string | null {
        try {
            const v = this._wvHidVirtualOf(ref);
            if (v) return "V" + v.type;
            if (!ref || !ref.key) return null;
            const t = ref.objectType || ref._objectType;
            if (t === "collection") return "C" + ref.key;
            if (t === "search") return "S" + ref.key;
        } catch (_) {}
        return null;
    }

    // ---- The special collections (MJT 2026-10-19) ---------------------------
    // Zotero hides Unfiled / Duplicates / My Publications / Retracted /
    // Recently Read through a per-library SETTING (Zotero.Prefs
    // setVirtualCollectionStateForLibrary: every window, kept across
    // restarts; zoteroPane.js setVirtual behind the row's own Hide and the
    // library row's "Show ... Items"). Weavero hides them per WINDOW like the
    // rest -- "V<type>" keys in the window's set, laid over the tree's copy
    // of the setting as its rows are built -- and never writes Zotero's
    // setting. What that setting hides is listed as well, marked "(all
    // windows)", and shown back through Zotero's own switch. The Bin is never
    // hidden.

    _wvHidVirtualTypes(): string[] { return ["unfiled", "duplicates", "publications", "retracted", "recentlyRead"]; }

    /** {type, libraryID} for a special collection's tree row, or for a plain
     *  descriptor of one ({type, libraryID}); null for anything else. */
    _wvHidVirtualOf(x: any): { type: string; libraryID: number } | null {
        try {
            if (!x || typeof x.type !== "string" || !this._wvHidVirtualTypes().includes(x.type)) return null;
            const lib = (x.ref && x.ref.libraryID != null) ? x.ref.libraryID : x.libraryID;
            return lib != null ? { type: x.type, libraryID: Number(lib) } : null;
        } catch (_) { return null; }
    }

    /** Zotero's own name for the row. */
    _wvHidVirtualName(type: string): string {
        const keys: any = { unfiled: "pane.collections.unfiled", duplicates: "pane.collections.duplicate", publications: "pane.collections.publications", retracted: "pane.collections.retracted", recentlyRead: "recently-read" };
        try { return Zotero.getString(keys[type]); } catch (_) { return type; }
    }

    /** The special collections Zotero's OWN setting hides for the library
     *  (every window), as {type, libraryID, label} -- the rows Zotero's own
     *  "Show ..." items offer, whether or not the row would have content. */
    _wvHidZoteroHidden(libraryID: number): any[] {
        const out: any[] = [];
        for (const type of this._wvHidVirtualTypes()) {
            try {
                if (type === "publications" && libraryID !== Zotero.Libraries.userLibraryID) continue;
                if (!(Zotero.Prefs as any).getVirtualCollectionStateForLibrary(libraryID, type)) out.push({ type, libraryID, label: this._wvHidVirtualName(type) });
            } catch (_) {}
        }
        return out;
    }

    /** Show a special collection Zotero's own setting hides: Zotero's switch
     *  (every window), as its "Show Unfiled Items" item does. */
    async _wvHidShowZotero(win: any, libraryID: number, type: string) {
        try {
            const zp = win && win.ZoteroPane;
            // Zotero's setVirtual (collectionTree.jsx toggleVirtualCollection)
            // reads the focused row's id BEFORE its refresh
            // (`this.getRow(selectedRow).id`, l. 1308): with no row focused --
            // the selected row was just erased, a feed in dev.97's guard -- it
            // throws after flipping the pref and the tree stays stale. Give it
            // a row first.
            try {
                const cv = zp && zp.collectionsView;
                if (cv && !(cv.selection.focused >= 0 && cv.getRow(cv.selection.focused))) await cv.selectLibrary(libraryID);
            } catch (_) {}
            if (zp && typeof zp.setVirtual === "function") await zp.setVirtual(libraryID, type, true, false);
            else (Zotero.Prefs as any).setVirtualCollectionStateForLibrary(libraryID, type, true);
        } catch (e) { Zotero.debug("[Weavero] _wvHidShowZotero err: " + e); }
        try { this._wvHidDecorate(win); } catch (_) {}
        try { const mw = win && win._wvHidMgrWin; if (mw && !mw.closed && typeof mw._wvHidMgrRender === "function") mw._wvHidMgrRender(); } catch (_) {}
    }

    /** Lay the tree's rule for the special collections of `libraryID` over
     *  its copy of Zotero's setting (`_virtualCollectionLibraries`, re-read
     *  from the prefs at every refresh and read per library as the rows are
     *  built -- the same map on Zotero 10 and 11). Copies, never Zotero's
     *  objects; the rule gets Zotero's own state from the prefs. */
    _wvHidOverlayLib(cv: any, libraryID: number) {
        try {
            const visible = WV_HID_VISIBLE.get(cv);
            if (typeof visible !== "function") return;
            const m = cv._virtualCollectionLibraries || (cv._virtualCollectionLibraries = {});
            for (const type of this._wvHidVirtualTypes()) {
                let zoteroShown = true;
                try { zoteroShown = !!(Zotero.Prefs as any).getVirtualCollectionStateForLibrary(libraryID, type); } catch (_) {}
                const next = Object.assign({}, m[type] || {});
                next[libraryID] = !!visible(type, libraryID, zoteroShown);
                m[type] = next;
            }
        } catch (_) {}
    }

    /** Install `visible(type, libraryID, zoteroShown)` on a collection tree:
     *  an own-property `_expandRow` over the prototype's that lays the rule
     *  over the library row about to be expanded (teardown deletes it). */
    _wvHidWrapExpandRow(cv: any, visible: (type: string, libraryID: number, zoteroShown: boolean) => boolean, tag: string) {
        try {
            const proto = Object.getPrototypeOf(cv)._expandRow;
            if (typeof proto !== "function") return;
            const P: any = this;
            WV_HID_VISIBLE.set(cv, visible);
            cv._expandRow = function (this: any, rows: any[], row: number, ...rest: any[]) {
                try {
                    const tr = rows && rows[row];
                    if (tr && typeof tr.isLibrary === "function" && tr.isLibrary(true) && tr.ref && tr.ref.libraryID != null) P._wvHidOverlayLib(this, tr.ref.libraryID);
                } catch (_) {}
                return proto.call(this, rows, row, ...rest);
            };
            cv._expandRow._wvTag = tag;
        } catch (e) { Zotero.debug("[Weavero] _wvHidWrapExpandRow err: " + e); }
    }

    /** Zotero's `isContainerEmpty` answers from the DATABASE -- a collection
     *  with child collections is never empty (collectionTree.jsx 2685,
     *  `hasChildCollections`) -- so a collection whose every child is hidden
     *  in this window kept its arrow over nothing (MJT 2026-10-21, "Test
     *  collection1 still has an expand arrow, even though it does not have a
     *  child collection anymore"). Over the tree's own include rule instead:
     *  a collection row is empty when no child collection would make it into
     *  THIS tree (`_includedInTree`, the pane's and the manager's hiding and
     *  Zotero's filter alike). `isContainerEmpty` is a class field -- an own
     *  arrow function on the instance -- so the property is replaced, the
     *  original kept for the teardown; a re-apply always wraps the ORIGINAL
     *  (never the previous build's wrap). Group rows are left to Zotero. */
    _wvHidWrapContainerEmpty(cv: any, tag: string) {
        try {
            const orig = cv._wvHidOrigContainerEmpty || cv.isContainerEmpty;
            if (typeof orig !== "function") return;
            cv._wvHidOrigContainerEmpty = orig;
            const wrapped = (index: number) => {
                let r = true;
                try { r = orig(index); } catch (_) { return true; }
                if (r) return r;
                try {
                    const tr = cv.getRow(index);
                    if (!tr || typeof tr.isCollection !== "function" || !tr.isCollection()) return r;
                    const kids = typeof tr.ref.getChildCollections === "function" ? tr.ref.getChildCollections() : [];
                    for (const c of kids) { if (cv._includedInTree(c)) return false; }
                    return true;
                } catch (_) { return r; }
            };
            (wrapped as any)._wvTag = tag;
            cv.isContainerEmpty = wrapped;
        } catch (e) { Zotero.debug("[Weavero] _wvHidWrapContainerEmpty err: " + e); }
    }

    _wvHidUnwrapContainerEmpty(cv: any) {
        try {
            if (cv && cv._wvHidOrigContainerEmpty) { cv.isContainerEmpty = cv._wvHidOrigContainerEmpty; delete cv._wvHidOrigContainerEmpty; }
        } catch (_) {}
    }

    /** Zotero's own menu items Weavero stands in for -- its Hide on a special
     *  collection, its Show items on a library row -- hidden for this showing
     *  and put back as Zotero left them. */
    _wvHidNativeHide(menu: any, el: any) {
        try {
            const list: any[] = menu._wvHidNative || (menu._wvHidNative = []);
            if (!list.some((x: any) => x.el === el)) list.push({ el, hidden: !!el.hidden });
            el.hidden = true;
        } catch (_) {}
    }

    _wvHidNativeRestore(menu: any) {
        try {
            for (const x of (menu && menu._wvHidNative) || []) { try { x.el.hidden = x.hidden; } catch (_) {} }
            if (menu) menu._wvHidNative = [];
        } catch (_) {}
    }

    /** Whether a pass of Zotero's buildCollectionContextMenu is in flight on
     *  `menu` (the wrap's count). A count older than 15 s is a pass that
     *  never came back (the items list's load promise hung): ignored, the
     *  menu keeps working. */
    _wvHidMenuBuilding(menu: any): boolean {
        try { return !!menu && (menu._wvHidBuilding || 0) > 0 && Date.now() - (menu._wvHidBuildingAt || 0) < 15000; }
        catch (_) { return false; }
    }

    /** After Zotero's positional pass, with nothing of ours in the menu,
     *  every direct child it stamped carries its own id. A duplicate means
     *  a stranger sits among Zotero's nodes and every later id is shifted
     *  (2026-10-20): logged once per shape, so the next report names it. */
    _wvHidMenuCheck(menu: any) {
        try {
            const ids: string[] = [], dups: string[] = [];
            for (const k of Array.from(menu.children) as any[]) { if (!k.id) continue; if (ids.includes(k.id)) dups.push(k.id); else ids.push(k.id); }
            if (!dups.length) { menu._wvHidMenuWarned = ""; return; }
            const sig = dups.join(",") + "/" + menu.children.length;
            if (menu._wvHidMenuWarned === sig) return;
            menu._wvHidMenuWarned = sig;
            Zotero.debug("[Weavero] collection menu out of step: " + menu.children.length + " nodes, duplicate ids " + dups.join(", ") + " -- a restart rebuilds it");
        } catch (_) {}
    }

    _wvHidIsGroup(ref: any): boolean {
        return !!ref && ref.libraryType === "group" && ref.groupID != null && ref.libraryID > 0;
    }

    /** My Library, as the tree asks about it: Zotero's own {libraryID} (the
     *  pane's refresh), its Zotero.Library, a library row's ref -- anything of
     *  the user library's id without a key (collections, searches and items
     *  have one) that is not a group. */
    _wvHidIsUserLibraryRef(ref: any): boolean {
        try { return !!ref && ref.libraryID === Zotero.Libraries.userLibraryID && ref.key == null && !this._wvHidIsGroup(ref); }
        catch (_) { return false; }
    }

    /** The libraries whose row this window's pane shows: My Library unless
     *  hidden here, and every group library not hidden here. */
    _wvHidVisibleLibraries(win: any): number[] {
        const st = this._wvHidState(win);
        const out: number[] = [];
        try {
            const u = Zotero.Libraries.userLibraryID;
            if (!this._wvHidLibs(st).includes(u)) out.push(u);
            // With the whole Group Libraries section hidden, no group is shown.
            if (!this._wvHidSections(st).includes("groups")) {
                for (const g of Zotero.Groups.getAll()) { if (g && g.libraryID > 0 && !st.groups.includes(g.libraryID)) out.push(g.libraryID); }
            }
        } catch (_) {}
        return out;
    }

    /** Whether a library (My Library or a group) may be hidden in `win`:
     *  shown there, and not the last one shown -- the pane keeps a row to
     *  come back from (MJT 2026-10-20: "My Library can be selected and
     *  hidden"; a hidden My Library is listed on the Group Libraries line). */
    _wvHidCanHideLibrary(win: any, libraryID: number): boolean {
        const vis = this._wvHidVisibleLibraries(win);
        return vis.includes(libraryID) && vis.length > 1;
    }

    /** `win`'s hidden libraries other than groups (My Library), as
     *  {libraryID, label}. */
    _wvHidListLibraries(win: any): any[] {
        const out: any[] = [];
        for (const id of this._wvHidLibs(this._wvHidState(win))) {
            try { const lib: any = Zotero.Libraries.get(id); if (lib) out.push({ libraryID: id, label: String(lib.name) }); } catch (_) {}
        }
        return out;
    }

    // ---- Whole sections (MJT 2026-10-20: "hide Group Libraries (all group
    // libraries at once), and also the Feeds for someone who never uses
    // them") -----------------------------------------------------------------
    // One entry per section in the window's set. "groups" leaves every group
    // library out -- the tree then drops its heading (collectionTree.jsx
    // refresh adds it only when a group is included), and a group joined
    // later stays out too; "feeds" answers "no" for the Feeds row itself (the
    // plain {unreadCount, updateFeed} the tree asks about) and for every
    // feed. Hide on the heading's own menu and on the Feeds row's; back from
    // My Library's Show submenu and the manager (a hidden heading has no row
    // to right-click), so the Group Libraries section can go only while My
    // Library is shown.

    _wvHidSectionNames(): string[] { return ["groups", "feeds"]; }

    /** Zotero's own label for the section's row. */
    _wvHidSectionLabel(which: string): string {
        try { return Zotero.getString(which === "feeds" ? "pane.collections.feedLibraries" : "pane.collections.groupLibraries"); }
        catch (_) { return which === "feeds" ? "Feeds" : "Group Libraries"; }
    }

    /** The section a row or ref STANDS FOR: "groups" for the Group Libraries
     *  heading (its CollectionTreeRow or its {id: "group-libraries-header"}
     *  ref), "feeds" for the Feeds row or the plain object the tree builds it
     *  on; null for anything else (a group or a feed BELONGS to a section:
     *  `_wvHidSectionOfLib`). */
    _wvHidSectionOfRow(x: any): string | null {
        try {
            if (!x) return null;
            if (typeof x.isHeader === "function") {
                if (x.isHeader() && x.ref && x.ref.id === "group-libraries-header") return "groups";
                return (typeof x.isFeeds === "function" && x.isFeeds()) ? "feeds" : null;
            }
            if (x.id === "group-libraries-header" && x.libraryID === -1) return "groups";
            if (typeof x.updateFeed === "function" && x.libraryID == null) return "feeds";
        } catch (_) {}
        return null;
    }

    /** The section a library belongs to: "groups" for a group library,
     *  "feeds" for a feed; null for My Library and everything else. */
    _wvHidSectionOfLib(ref: any): string | null {
        try {
            if (!ref) return null;
            if (this._wvHidIsGroup(ref)) return "groups";
            if (ref.libraryType === "feed" && ref.libraryID > 0 && ref.key == null) return "feeds";
        } catch (_) {}
        return null;
    }

    _wvHidSectionHidden(win: any, which: string): boolean {
        return this._wvHidSections(this._wvHidState(win)).includes(which);
    }

    /** Whether the section may be hidden in `win`: not hidden there yet, and
     *  the Group Libraries section only while My Library is shown (the pane
     *  keeps a row to come back from). */
    _wvHidCanHideSection(win: any, which: string): boolean {
        try {
            if (!this._wvHidSectionNames().includes(which) || this._wvHidSectionHidden(win, which)) return false;
            if (which === "groups") return !this._wvHidLibs(this._wvHidState(win)).includes(Zotero.Libraries.userLibraryID);
            return true;
        } catch (_) { return false; }
    }

    /** `win`'s hidden sections as {which, label}, in the tree's order. */
    _wvHidListSections(win: any): any[] {
        const st = this._wvHidState(win);
        return this._wvHidSectionNames().filter(w => this._wvHidSections(st).includes(w)).map(which => ({ which, label: this._wvHidSectionLabel(which) }));
    }

    /** Whether `win`'s tree leaves this object out. `object` is what
     *  `_includedInTree` receives: a Zotero.Group, Collection, Search, Feed,
     *  a CollectionTreeRow, a plain {libraryID} for My Library, or the plain
     *  {unreadCount, updateFeed} the Feeds row is built on. */
    _wvHidIsHidden(object: any, win: any): boolean {
        try {
            if (!win || !this._wvHidOn()) return false;
            const v = this._wvHidVirtualOf(object);
            if (v) { const vl = this._wvHidState(win).hidden[String(v.libraryID)]; return !!vl && vl.includes("V" + v.type); }
            // A whole section's row: the Group Libraries heading, the Feeds row.
            const sec = this._wvHidSectionOfRow(object);
            if (sec) return this._wvHidSectionHidden(win, sec);
            const ref = (object && object.ref !== undefined && typeof object.isCollection === "function") ? object.ref : object;
            if (!ref) return false;
            const st = this._wvHidState(win);
            if (this._wvHidIsUserLibraryRef(ref)) return this._wvHidLibs(st).includes(ref.libraryID);
            // A group or a feed goes with its whole section; a group on its own
            // too, and a feed on its own (MJT 2026-10-21).
            const lib = this._wvHidSectionOfLib(ref);
            if (lib && this._wvHidSections(st).includes(lib)) return true;
            if (lib === "feeds") return this._wvHidFeeds(st).includes(ref.libraryID);
            if (this._wvHidIsGroup(ref)) return st.groups.includes(ref.libraryID);
            const k = this._wvHidKey(ref);
            if (!k) return false;
            const list = st.hidden[String(ref.libraryID)];
            return !!list && list.includes(k);
        } catch (_) { return false; }
    }

    /** The collections pane's order under a library (collectionTree.jsx
     *  _expandRow): Recently Read, the collections, the saved searches, My
     *  Publications, Duplicate Items, Unfiled Items, Retracted Items. */
    _wvHidPaneRank(type: string): number {
        const order = ["recentlyRead", "collection", "search", "publications", "duplicates", "unfiled", "retracted"];
        const i = order.indexOf(type);
        return i < 0 ? order.length : i;
    }

    /** The pane's order for two entries {rank, names}: the section first,
     *  then name by name down the path (a parent before its children; each
     *  level by name, as the tree sorts it). */
    _wvHidPaneCompare(a: any, b: any): number {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const n = Math.min(a.names.length, b.names.length);
        for (let i = 0; i < n; i++) {
            const c = Zotero.localeCompare(a.names[i], b.names[i]);
            if (c) return c;
        }
        return a.names.length - b.names.length;
    }

    /** `win`'s hidden objects of one library that still exist, as
     *  {key, obj, label, rank, names}, in the collections pane's order (MJT
     *  2026-10-20: "the same as in the collections pane", not alphabetical);
     *  deleted ones are dropped from its set. */
    _wvHidListLibrary(libraryID: number, win: any): any[] {
        const st = this._wvHidState(win);
        const keys: string[] = st.hidden[String(libraryID)] || [];
        const out: any[] = [];
        const keep: string[] = [];
        for (const k of keys) {
            try {
                if (k[0] === "V") {
                    const type = k.slice(1);
                    if (!this._wvHidVirtualTypes().includes(type)) continue;
                    keep.push(k);
                    const label = this._wvHidVirtualName(type);
                    out.push({ key: k, obj: { type, libraryID }, label, rank: this._wvHidPaneRank(type), names: [label] });
                    continue;
                }
                const obj: any = k[0] === "C"
                    ? (Zotero.Collections as any).getByLibraryAndKey(libraryID, k.slice(1))
                    : (Zotero.Searches as any).getByLibraryAndKey(libraryID, k.slice(1));
                if (!obj || obj.deleted) continue;
                keep.push(k);
                let label = String(obj.name);
                const names: string[] = [label];
                if (k[0] === "C") {
                    let p: any = obj.parentID ? Zotero.Collections.get(obj.parentID) : null, g = 0;
                    while (p && g++ < 64) { names.unshift(String(p.name)); p = p.parentID ? Zotero.Collections.get(p.parentID) : null; }
                    label = names.join(" › ");
                }
                out.push({ key: k, obj, label, rank: this._wvHidPaneRank(k[0] === "C" ? "collection" : "search"), names });
            } catch (_) {}
        }
        if (keep.length !== keys.length) {
            if (keep.length) st.hidden[String(libraryID)] = keep; else delete st.hidden[String(libraryID)];
            this._wvHidSave(win);
        }
        return out.sort((a, b) => this._wvHidPaneCompare(a, b));
    }

    /** `win`'s hidden group libraries that still exist. */
    _wvHidListGroups(win: any): any[] {
        const st = this._wvHidState(win);
        const out: any[] = [];
        const keep: number[] = [];
        for (const id of st.groups) {
            try {
                const g: any = Zotero.Groups.getByLibraryID(id);
                if (!g) continue;
                keep.push(id);
                out.push({ libraryID: id, label: String(g.name) });
            } catch (_) {}
        }
        if (keep.length !== st.groups.length) { st.groups = keep; this._wvHidSave(win); }
        return out.sort((a, b) => Zotero.localeCompare(a.label, b.label));
    }

    /** `win`'s feeds hidden one by one that still exist, in the Feeds row's
     *  order (by name, collectionTreeRow.js getChildren); MJT 2026-10-21. */
    _wvHidListFeeds(win: any): any[] {
        const st = this._wvHidState(win);
        const ids = this._wvHidFeeds(st);
        const out: any[] = [];
        const keep: number[] = [];
        for (const id of ids) {
            try {
                const f: any = Zotero.Libraries.get(id);
                if (!f || f.libraryType !== "feed") continue;
                keep.push(id);
                out.push({ libraryID: id, label: String(f.name) });
            } catch (_) {}
        }
        if (keep.length !== ids.length) { st.feeds = keep; this._wvHidSave(win); }
        return out.sort((a, b) => Zotero.localeCompare(a.label, b.label));
    }

    /** A collection hidden in `win` itself or through a hidden ancestor
     *  (Weavero's own pickers; the tree gets this from _expandRow). */
    _wvHidCollHiddenDeep(col: any, win: any): boolean {
        try {
            let c: any = col, g = 0;
            while (c && g++ < 64) {
                if (this._wvHidIsHidden(c, win)) return true;
                c = c.parentID ? Zotero.Collections.get(c.parentID) : null;
            }
        } catch (_) {}
        return false;
    }

    async _wvHidHide(objs: any[], win: any) {
        const st = this._wvHidState(win);
        let changed = false;
        for (const o0 of objs) {
            // A whole section: the Group Libraries heading (its row or its
            // ref), the Feeds row (its row or the object it is built on).
            const sec = this._wvHidSectionOfRow(o0);
            if (sec) {
                if (this._wvHidCanHideSection(win, sec)) { this._wvHidSections(st).push(sec); changed = true; }
                continue;
            }
            // A special collection's row (or {type, libraryID}): "V<type>";
            // any other tree row stands for its object.
            const v = this._wvHidVirtualOf(o0);
            const o = v ? { libraryID: v.libraryID } : (o0 && o0.ref !== undefined && typeof o0.isCollection === "function") ? o0.ref : o0;
            if (!o) continue;
            // A library, My Library included: never the last one shown (the
            // rule reads the set as this batch changes it).
            if (!v && this._wvHidIsUserLibraryRef(o)) {
                const libs = this._wvHidLibs(st);
                if (!libs.includes(o.libraryID) && this._wvHidCanHideLibrary(win, o.libraryID)) { libs.push(o.libraryID); changed = true; }
                continue;
            }
            if (this._wvHidIsGroup(o)) {
                if (!st.groups.includes(o.libraryID) && this._wvHidCanHideLibrary(win, o.libraryID)) { st.groups.push(o.libraryID); changed = true; }
                continue;
            }
            // A feed on its own (MJT 2026-10-21: "hide individual feeds"): the
            // Feeds row stays, the row to come back from, so no last-one rule.
            if (this._wvHidSectionOfLib(o) === "feeds") {
                const feeds = this._wvHidFeeds(st);
                if (!feeds.includes(o.libraryID)) { feeds.push(o.libraryID); changed = true; }
                continue;
            }
            const k = v ? "V" + v.type : this._wvHidKey(o);
            if (!k) continue;
            const lk = String(o.libraryID);
            const list = st.hidden[lk] || (st.hidden[lk] = []);
            if (!list.includes(k)) { list.push(k); changed = true; }
        }
        if (!changed) return;
        await this._wvHidSave(win);
        await this._wvHidRefreshWin(win);
    }

    /** Show again in `win`: `keys` of one library (null = all of them),
     *  and/or `groups` (libraryIDs), and/or `libs` (My Library), and/or
     *  whole `sections` ("groups" / "feeds"), and/or `feeds` (libraryIDs of
     *  feeds hidden one by one). */
    async _wvHidShow(win: any, libraryID: number | null, keys: string[] | null, groups?: number[] | null, libs?: number[] | null, sections?: string[] | null, feeds?: number[] | null) {
        const st = this._wvHidState(win);
        if (libraryID != null) {
            const lk = String(libraryID);
            if (keys == null) delete st.hidden[lk];
            else st.hidden[lk] = (st.hidden[lk] || []).filter((k: string) => !keys.includes(k));
            if (st.hidden[lk] && !st.hidden[lk].length) delete st.hidden[lk];
        }
        if (groups) st.groups = st.groups.filter((id: number) => !groups.includes(id));
        if (libs) st.libs = this._wvHidLibs(st).filter((id: number) => !libs.includes(id));
        if (feeds) st.feeds = this._wvHidFeeds(st).filter((id: number) => !feeds.includes(id));
        if (sections) st.sections = this._wvHidSections(st).filter((s: string) => !sections.includes(s));
        await this._wvHidSave(win);
        await this._wvHidRefreshWin(win);
    }

    /** Everything hidden in `win` shown again at once -- the window's whole
     *  set, and (as the submenu's Show All does) the special collections
     *  Zotero's own setting hides, through its switch. The manager's "← Show
     *  All" button (MJT 2026-10-20: "a way to recover all hidden at the same
     *  time"). */
    async _wvHidShowAll(win: any) {
        try {
            const st = this._wvHidState(win);
            const had = this._wvHidHasAny(st);
            win._wvHid = this._wvHidBlank();
            if (had) { await this._wvHidSave(win); await this._wvHidRefreshWin(win); }
            const libs: number[] = [];
            try { for (const lib of Zotero.Libraries.getAll()) if (lib && lib.libraryType !== "feed") libs.push(lib.libraryID); } catch (_) {}
            for (const lib of libs) {
                for (const z of this._wvHidZoteroHidden(lib)) await this._wvHidShowZotero(win, lib, z.type);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvHidShowAll err: " + e); }
    }

    /** Rebuild one window's collections tree; a selection that just
     *  disappeared moves to its library row (or My Library) -- the pattern of
     *  Zotero's toggleVirtualCollection (refresh, then select by ID). */
    async _wvHidRefreshWin(win: any) {
        try {
            const cv = win && win.ZoteroPane && win.ZoteroPane.collectionsView;
            if (!cv || !cv.tree) return;
            // The manager window for this main window, if open, follows FIRST
            // and on its own: it reads the window's set, not the pane's rows,
            // and it is where the user is looking -- rendered after the pane's
            // reload and re-select it lagged a beat behind the drop (MJT
            // 2026-10-21: "there was a time delay before Outline got
            // expanded"). Its render promise is the manager's own to await.
            try { const mw = win._wvHidMgrWin; if (mw && !mw.closed && typeof mw._wvHidMgrRender === "function") mw._wvHidMgrRender(); } catch (_) {}
            const cur = cv.getRow(cv.selection.focused);
            const curID = cur ? cur.id : null;
            const curLib = cur && cur.ref ? cur.ref.libraryID : null;
            await cv.refresh();
            cv.tree.invalidate();
            let ok: any = false;
            if (curID && cv.getRowIndexByID(curID) !== false) ok = await cv.selectByID(curID, false);
            if (!ok && curLib > 0) ok = await cv.selectLibrary(curLib);
            if (!ok) ok = await cv.selectLibrary(Zotero.Libraries.userLibraryID);
            // My Library hidden here: the first library row shown.
            if (!ok) {
                for (let i = 0; i < cv.rowCount; i++) {
                    const r = cv.getRow(i);
                    if (r && r.isLibrary(true)) { await cv.selectWait(i); break; }
                }
            }
            cv.selection.selectEventsSuppressed = false;
            this._wvHidDecorate(win);
        } catch (e) { Zotero.debug("[Weavero] hidden-collections refresh err: " + e); }
    }

    async _wvHidRefreshAll() {
        const wins = wvMainWins();
        for (const w of wins) await this._wvHidRefreshWin(w);
    }

    /** Per window: the tree filter, the menu entries, the Group Libraries
     *  line's menu, and the blue dots. Idempotent; re-run on pref change. */
    _wvHidApply(win: any) {
        try {
            const doc = win && win.document;
            const cv = win && win.ZoteroPane && win.ZoteroPane.collectionsView;
            if (!doc || !cv || typeof cv._includedInTree !== "function") {
                // A NEW main window: onMainWindowLoad runs before ZoteroPane
                // has created its collections tree (found live 2026-10-05: a
                // second window's set was saved but never filtered). Retry
                // until it exists (bounded, ~15 s).
                const n = (win && win._wvHidApplyTries) || 0;
                if (win && !win.closed && n < 60) {
                    win._wvHidApplyTries = n + 1;
                    win.setTimeout(() => {
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (p && !p._wvDestroyed) p._wvHidApply(win);
                    }, 250);
                }
                return;
            }
            const P: any = this;
            const live = (): any => {
                const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                return p && !p._wvDestroyed ? p : null;
            };
            // 1. Tree filter: an instance property over the prototype method
            //    (teardown deletes it), always calling the PROTOTYPE -- so a
            //    re-apply after a hot reload never stacks wrappers.
            const proto = Object.getPrototypeOf(cv)._includedInTree;
            const firstWrap = !Object.prototype.hasOwnProperty.call(cv, "_includedInTree");
            cv._includedInTree = function (object: any, resetCache: any) {
                try {
                    const p = live();
                    if (p && p._wvHidIsHidden(object, win)) return false;
                    // A library (My Library's {libraryID}, a group): this
                    // window's rule for its special collections is laid over
                    // Zotero's setting before the filter counts its rows.
                    if (p && object && object.libraryID != null && object.key == null) p._wvHidOverlayLib(this, object.libraryID);
                } catch (_) {}
                return proto.call(this, object, resetCache);
            };
            // Stamped like every wrap on a long-lived object (src-ts.md). No
            // "already wired" check reads it: the wrap is replaced on every
            // apply, so a hot update can never leave the old build's in place.
            cv._includedInTree._wvTag = P._wvWireTag();
            // The special collections (Unfiled, Duplicates, ...): hidden here
            // through the tree's copy of Zotero's setting, per library, as the
            // rows are built.
            P._wvHidWrapExpandRow(cv, (type: string, lib: number, zoteroShown: boolean) => {
                const p = live();
                return zoteroShown && !(p && p._wvHidIsHidden({ type, libraryID: lib }, win));
            }, P._wvWireTag());
            // A collection whose every child is hidden shows no arrow.
            P._wvHidWrapContainerEmpty(cv, P._wvWireTag());
            // A set restored before the filter attached (the anchor's, from
            // the window store at startup): the tree was built without it.
            if (firstWrap && cv.tree && P._wvHidHasAny(win._wvHid)) P._wvHidRefreshWin(win);
            // 2. Stylesheet for the dots -- REPLACED on every apply, never
            //    "skip if present": after a hot update the old build's rules
            //    would stay (src-ts.md, "injected DOM outlives the build").
            {
                let s: any = doc.getElementById("wv-hid-sheet");
                if (!s) {
                    s = wvHtmlEl(doc, "style");
                    s.id = "wv-hid-sheet";
                    (doc.documentElement || doc).appendChild(s);
                }
                s.textContent = [
                    ".wv-hid-dot { flex: none; width: 7px; height: 7px; border-radius: 50%;",
                    "  margin-inline: auto 8px; background: var(--accent-blue, #4072e5); }",
                    // On the SELECTED row the dot vanished into the accent-blue
                    // selection (MJT 2026-10-16): take the row's text colour --
                    // white on the focused selection (--color-accent-text), the
                    // normal text colour on the unfocused grey one
                    // (_virtualized-table.scss .row.selected).
                    "#collection-tree .row.selected .wv-hid-dot { background: currentColor; }",
                    "#collection-tree .row .cell.primary:has(> .wv-hid-dot) > .cell-text { flex: 0 1 auto; }",
                    // The Show submenus: Zotero's eye icon, drawn like its
                    // own menu icons (svgicon-menu: context fill, secondary).
                    // BOTH properties: Firefox 153 (Zotero 11) paints a menu
                    // icon only from `--menuitem-icon` and resets
                    // list-style-image to none -- the icon was gone on 11
                    // (Zotero 11 for Developers, audit 2026-10-13); 10 and
                    // macOS native menus still read list-style-image.
                    ".wv-hid-show { list-style-image: url(\"chrome://zotero/skin/16/universal/view.svg\");",
                    "  --menuitem-icon: url(\"chrome://zotero/skin/16/universal/view.svg\");",
                    "  -moz-context-properties: fill, fill-opacity; fill: var(--fill-secondary); }",
                    // Each Show entry carries its row's own icon, from Zotero's
                    // collection-tree set (themed files per light / dark;
                    // Recently Read's is universal, filled purple as in the
                    // tree; both properties as above). MJT 2026-10-20.
                    ...(() => {
                        const base = "chrome://zotero/skin/collection-tree/16/";
                        const themed: Array<[string, string]> = [["collection", "collection"], ["search", "search"], ["unfiled", "unfiled"],
                            ["duplicates", "duplicates"], ["publications", "publications"], ["retracted", "retracted"], ["group", "library-group"], ["library", "library"],
                            // The whole sections (2026-10-20): the heading's and the Feeds row's own icons.
                            ["groups", "groups"], ["feeds", "feed-library"],
                            // A feed hidden on its own (2026-10-21).
                            ["feed", "feed"]];
                        const rule = (cls: string, url: string) => ".wv-hid-icon-" + cls + " { list-style-image: url(\"" + url + "\"); --menuitem-icon: url(\"" + url + "\"); }";
                        const out: string[] = [];
                        for (const [cls, file] of themed) out.push(rule(cls, base + "light/" + file + ".svg"));
                        out.push("@media (prefers-color-scheme: dark) {");
                        for (const [cls, file] of themed) out.push("  " + rule(cls, base + "dark/" + file + ".svg"));
                        out.push("}");
                        // Firefox's menu.css paints the icon part with
                        // `--menuitem-icon-fill` (currentColor by default), not
                        // with the item's `fill` -- the clock came out grey
                        // (MJT 2026-10-20); `fill` stays for list-style-image
                        // (macOS native menus).
                        const recent = base + "universal/recent.svg";
                        out.push(".wv-hid-icon-recentlyRead { list-style-image: url(\"" + recent + "\"); --menuitem-icon: url(\"" + recent + "\");"
                            + " --menuitem-icon-fill: var(--tag-purple); -moz-context-properties: fill, fill-opacity; fill: var(--tag-purple); }");
                        // The icon is a CHILD element (Firefox 153: `img.menu-icon`;
                        // older: `image.menu-iconic-icon`) and Zotero's menu rule
                        // sets ITS fill (`menupopup :is(image, .menu-icon) { fill:
                        // var(--fill-secondary) }`, _menu.scss) -- nothing on the
                        // item reaches it: the clock stayed grey in the real
                        // submenu while the item computed purple (MJT's screenshot,
                        // 2026-10-20). Outranks Zotero's rule (0,2,0 vs 0,1,1).
                        out.push(".wv-hid-icon-recentlyRead > .menu-icon, .wv-hid-icon-recentlyRead .menu-iconic-icon {"
                            + " fill: var(--tag-purple); -moz-context-properties: fill, fill-opacity; }");
                        return out;
                    })(),
                ].join("\n");
            }
            // 3. Context-menu entries (the menu's OWN popupshowing/hidden only).
            const menu = doc.getElementById("zotero-collectionmenu");
            if (menu) {
                if (menu._wvHidH) {
                    menu.removeEventListener("popupshowing", menu._wvHidH.onShow);
                    menu.removeEventListener("popuphidden", menu._wvHidH.onHide);
                }
                // A previous instance's leftovers, classes or not (the
                // marker survives the window strip), before Zotero's next
                // positional pass counts them (2026-10-20).
                wvHidMenuClear(menu);
                const onShow = (ev: any) => {
                    if (ev.target !== menu) return;
                    const p = live(); if (!p) return;
                    // A build of Zotero's still in flight (awaiting the items
                    // list) stamps the menu BY POSITION when it lands: nothing
                    // of ours goes in before that; the wrap (3b) adds the
                    // entries once the last pass is through (2026-10-20).
                    if (p._wvHidMenuBuilding(menu)) return;
                    p._wvHidBuildMenu(win, menu);
                };
                const onHide = (ev: any) => {
                    if (ev.target !== menu) return;
                    wvHidMenuClear(menu);
                    try { const p = live(); if (p) p._wvHidNativeRestore(menu); } catch (_) {}
                };
                menu.addEventListener("popupshowing", onShow);
                menu.addEventListener("popuphidden", onHide);
                menu._wvHidH = { onShow, onHide };
            }
            // 3b. Zotero's buildCollectionContextMenu addresses the menu's
            //     children BY INDEX (`menu.childNodes[i]` <- option i) and can
            //     run again while the menu is open: a Weavero node among
            //     Zotero's shifted every later definition (Delete came out as
            //     "Hide", MJT 2026-10-05). The Show submenu now sits INSIDE
            //     Zotero's Show group (MJT 2026-10-16), so the build is wrapped:
            //     Weavero's entries step out before Zotero's pass and are
            //     rebuilt after it when the menu is open.
            try {
                const ZP: any = win.ZoteroPane;
                wvWrap(ZP, "buildCollectionContextMenu", "wv-hid", P._wvWireTag(), (orig: any) => async function (this: any, ...args: any[]) {
                    const m: any = win.document.getElementById("zotero-collectionmenu");
                    // Builds overlap (a right-click while the first still
                    // awaits the items list): the count keeps every entry of
                    // ours out until the LAST pass has stamped, and the menu's
                    // own popupshowing holds back meanwhile. Two stripped
                    // generations of Hide + Show Hidden once sat among
                    // Zotero's nodes, every id shifted, "Rename" on a Hide
                    // (MJT's My Library and Feeds menus, 2026-10-20).
                    if (m) { m._wvHidBuilding = (m._wvHidBuilding || 0) + 1; m._wvHidBuildingAt = Date.now(); wvHidMenuClear(m); }
                    try { return await orig.apply(this, args); }
                    finally {
                        try {
                            if (m) m._wvHidBuilding = Math.max(0, (m._wvHidBuilding || 0) - 1);
                            const p = live();
                            // Rebuilt for the rows now selected -- into an OPEN
                            // menu only. Entries put into a closed one (the old
                            // "whatever was there comes back") stayed until the
                            // next reload stripped their classes, and Zotero's
                            // next pass counted them as its own.
                            const open = !!(m && (m.state === "open" || m.state === "showing"));
                            if (p && m && !m._wvHidBuilding) { p._wvHidMenuCheck(m); if (open) p._wvHidBuildMenu(win, m); }
                        } catch (_) {}
                    }
                });
            } catch (_) {}
            // 4. The Group Libraries line: not selectable, so Zotero opens no
            //    menu there -- Weavero's own, when groups are hidden.
            const tree = doc.getElementById("collection-tree");
            if (tree) {
                if (tree._wvHidCtx) tree.removeEventListener("contextmenu", tree._wvHidCtx, true);
                const onCtx = (e: any) => {
                    try {
                        const p = live(); if (!p || !p._wvHidOn()) return;
                        const el = e.target && e.target.closest && e.target.closest(".row[id^='collection-tree-row-']");
                        if (!el) return;
                        const c2 = win.ZoteroPane.collectionsView;
                        const row = c2.getRow(parseInt(el.id.slice("collection-tree-row-".length), 10));
                        if (!row || !row.isHeader() || row.ref.id !== "group-libraries-header") return;
                        // Always ours: with nothing hidden there, the menu
                        // holds a plain Manage Hidden… (MJT 2026-10-20).
                        e.preventDefault(); e.stopPropagation();
                        p._wvHidOpenGroupsMenu(win, e.screenX, e.screenY);
                    } catch (_) {}
                };
                tree.addEventListener("contextmenu", onCtx, true);
                tree._wvHidCtx = onCtx;
            }
            // 5. Dots, re-applied after every tree render (mutation-quiet).
            if (tree && !win._wvHidMO) {
                // Decorate INSIDE the observer callback -- a microtask, before
                // the next paint. Zotero's renderItem clears each row's
                // innerHTML on every render, a selection change included, so
                // the dot goes with the render; a setTimeout(0) re-add landed
                // a paint later and the dot visibly lagged the selection colour
                // (MJT 2026-10-16). The dots' own mutations are filtered out
                // above, and a re-entrant batch is skipped, so this cannot loop.
                let running = false;
                const mo = new win.MutationObserver((recs: any[]) => {
                    if (recs.every((r: any) => [...(r.addedNodes || []), ...(r.removedNodes || [])]
                        .every((n: any) => n.classList && n.classList.contains("wv-hid-dot")))) return;
                    if (running) return;
                    running = true;
                    try { const p = live(); if (p) p._wvHidDecorate(win); } catch (_) {}
                    running = false;
                });
                mo.observe(tree, { childList: true, subtree: true });
                win._wvHidMO = mo;
            }
            P._wvHidDecorate(win);
        } catch (e) { Zotero.debug("[Weavero] _wvHidApply err: " + e); }
    }

    /** Blue dot at the end of a library row with hidden collections or
     *  searches (My Library also counts hidden group libraries, which have
     *  nowhere else to show once all are hidden), and of the Group Libraries
     *  line with hidden groups. Writes only on a real change. */
    _wvHidDecorate(win: any) {
        try {
            const doc = win.document;
            const cv = win.ZoteroPane && win.ZoteroPane.collectionsView;
            const tree = doc.getElementById("collection-tree");
            if (!cv || !tree) return;
            const on = this._wvHidOn();
            const groups = on ? this._wvHidListGroups(win).length : 0;
            // A hidden My Library: the Group Libraries line's business too.
            const libsHidden = on ? this._wvHidListLibraries(win).length : 0;
            // Hidden groups are the Group Libraries line's business (its dot,
            // its menu); My Library carries them only while that line is gone
            // (every group hidden) -- MJT 2026-10-16.
            // With the whole section hidden the heading is gone too, and the
            // section is what My Library lists -- not the groups one by one.
            const groupsOnMyLibrary = groups && !this._wvHidGroupsHeaderShown(win) && !this._wvHidSectionHidden(win, "groups") ? groups : 0;
            const sections = on ? this._wvHidListSections(win) : [];
            for (const el of Array.from(tree.querySelectorAll(".row[id^='collection-tree-row-']")) as any[]) {
                let n = 0, what = "", everywhere = 0;
                if (on) {
                    const row = cv.getRow(parseInt(el.id.slice("collection-tree-row-".length), 10));
                    if (row && row.isLibrary(true)) {
                        // The special collections (Unfiled, Duplicates, ...)
                        // never light the dot, hidden here or by Zotero's
                        // setting (MJT 2026-10-20: "My Library only has
                        // Unfiled Items, but the blue dot is not removed"):
                        // Zotero can hide those itself; the dot is for the
                        // collections, searches, libraries and sections.
                        n = this._wvHidListLibrary(row.ref.libraryID, win).filter((h: any) => h.key[0] !== "V").length;
                        what = n ? (n === 1 ? "1 hidden collection or saved search" : n + " hidden collections or saved searches") : "";
                        if (row.ref.libraryID === Zotero.Libraries.userLibraryID && groupsOnMyLibrary) {
                            what += (n ? ", " : "") + (groupsOnMyLibrary === 1 ? "1 hidden group library" : groupsOnMyLibrary + " hidden group libraries");
                            n += groupsOnMyLibrary;
                        }
                        // Whole sections (Group Libraries, Feeds) come back from
                        // My Library's menu (MJT 2026-10-20).
                        if (row.ref.libraryID === Zotero.Libraries.userLibraryID && sections.length) {
                            what += (what ? ", " : "") + sections.map((s: any) => "the " + s.label + " section").join(", ");
                            n += sections.length;
                        }
                        // Those Zotero's own setting hides (every window) are
                        // listed in the Show submenu and named in the tooltip
                        // when the dot shows for another reason.
                        everywhere = this._wvHidZoteroHidden(row.ref.libraryID).length;
                    }
                    // The Feeds row: its feeds hidden one by one (MJT 2026-10-21:
                    // "the blue dot on the Feeds line, same as My Library").
                    else if (row && row.isFeeds && row.isFeeds()) {
                        const nf = this._wvHidListFeeds(win).length;
                        if (nf) { n = nf; what = nf === 1 ? "1 hidden feed" : nf + " hidden feeds"; }
                    }
                    else if (row && row.isHeader() && row.ref.id === "group-libraries-header" && (groups || libsHidden)) {
                        n = groups + libsHidden;
                        what = [groups ? (groups === 1 ? "1 hidden group library" : groups + " hidden group libraries") : "",
                            libsHidden ? (libsHidden === 1 ? "1 hidden library" : libsHidden + " hidden libraries") : ""].filter(Boolean).join(", ");
                    }
                }
                let dot: any = el.querySelector(".wv-hid-dot");
                if (!n) { if (dot) dot.remove(); continue; }
                const cell = el.querySelector(".cell.primary") || el;
                if (!dot) {
                    dot = wvHtmlEl(doc, "span");
                    dot.className = "wv-hid-dot";
                    cell.appendChild(dot);
                }
                const here = what ? "In this window: " + what : "";
                const tip = [here, everywhere ? everywhere + " hidden in every window (Zotero's setting)" : ""].filter(Boolean).join("; ") + " — right-click to show";
                if (dot.getAttribute("title") !== tip) dot.setAttribute("title", tip);
            }
        } catch (_) {}
    }

    /** Hide / Show entries in Zotero's collections menu. It acts on the
     *  selected rows -- the right-clicked row, which Weavero's right-click
     *  handling makes the selection while the menu is open, or the whole
     *  multi-selection when the right-click lands inside it. */
    _wvHidBuildMenu(win: any, menu: any) {
        try {
            wvHidMenuClear(menu);
            // Zotero's own items Weavero stands in for come back as Zotero left
            // them before this showing decides again.
            this._wvHidNativeRestore(menu);
            const doc = win.document;
            // ZOTERO BUG (upstream register #25): on Recently Read / Unfiled /
            // Duplicates / Retracted / My Publications Zotero writes "Hide"
            // straight into its Delete item's label, but on a collection it
            // labels it through Fluent -- and Fluent only retranslates when
            // data-l10n-id/args CHANGE. Collection -> Recently Read -> a
            // collection again left "Hide" on Delete, next to Weavero's own
            // Hide (MJT's screenshot 2026-10-05). The menu is fully built
            // before popupshowing: in delete mode (its delete-collection icon
            // class), retranslate. Hide mode is left alone.
            try {
                const dc = menu.querySelector("#deleteCollection");
                if (dc && !dc.hidden && dc.getAttribute("data-l10n-id")
                    && dc.classList.contains("zotero-menuitem-delete-collection") && doc.l10n) {
                    doc.l10n.translateElements([dc]);
                }
            } catch (_) {}
            if (!this._wvHidOn()) return;
            const zp = win.ZoteroPane;
            const rows: any[] = (zp.getCollectionTreeRows && zp.getCollectionTreeRows()) || [];
            if (!rows.length) return;
            const P: any = this;
            // `icon`: the row's own icon class (the sheet in _wvHidApply).
            // Every node of ours carries the ownership marker: the class
            // sweep of a reload strips wv- classes off a node that also has
            // Zotero's (menuitem-iconic, the Hide icon class), the attribute
            // stays, and the strip and the clear find it by that.
            const mk = (label: string, fn: () => void, cls = true, icon?: string) =>
                wvMenuItem(doc, { label, cls: cls ? "wv-hid-entry" : undefined, iconClass: icon ? "wv-hid-icon-" + icon : undefined, attrs: WV_HID_OWNED_ATTR, onCommand: () => fn() });
            // Weavero's entries may sit among Zotero's own: the build wrap (3b
            // in _wvHidApply) steps them out before Zotero's positional pass
            // (`menu.childNodes[i]` <- option i; a node inside it once turned
            // Zotero's Delete into "Hide", 2026-10-05) and puts them back after.
            // The end of the menu, after a separator of ours, is only the
            // fallback when Zotero's anchors are missing.
            const sepTop = doc.createXULElement("menuseparator");
            sepTop.classList.add("wv-hid-entry");
            sepTop.setAttribute("data-wv-owned", "hid");
            const atEnd = (node: any) => { if (!sepTop.parentNode) menu.appendChild(sepTop); menu.appendChild(node); };
            const shown = (id: string) => { const n = menu.querySelector(":scope > #" + id); return n && !n.hidden ? n : null; };
            // Hide: collections / saved searches (several at once) / group libraries.
            // A special collection's row stands for itself ("V<type>"); any
            // other row for its object.
            const objs = rows.map((r: any) => (P._wvHidVirtualOf(r) ? r : r.ref));
            const special = rows.filter((r: any) => !!P._wvHidVirtualOf(r)).length;
            // Zotero's own Hide design (the item it shows on Unfiled /
            // Duplicates / Recently Read, MJT 2026-10-05): its localized
            // "Hide" label and its crossed-eye icon class (scss _menu.scss,
            // hide-collection: "hide"). Several rows keep a count.
            let hideLabel = "", hideStr = "Hide";
            try { hideStr = Zotero.getString("general.hide") || "Hide"; } catch (_) {}
            if (rows.every((r: any) => r.isCollection() || r.isSearch() || P._wvHidVirtualOf(r))) {
                // A special collection counts as a collection to the user.
                const nc = rows.filter((r: any) => r.isCollection()).length + special, ns = rows.length - nc;
                hideLabel = rows.length === 1 ? hideStr
                    : !ns ? "Hide " + nc + " Collections"
                    : !nc ? "Hide " + ns + " Saved Searches"
                    : "Hide " + rows.length + " Collections and Saved Searches";
            }
            else if (rows.every((r: any) => r.isFeed && r.isFeed())) {
                // Feeds one by one (MJT 2026-10-21): the Feeds row stays to come
                // back from, so any feed still shown can go.
                if (rows.some((r: any) => !this._wvHidFeeds(this._wvHidState(win)).includes(r.ref.libraryID))) {
                    hideLabel = rows.length === 1 ? hideStr : "Hide " + rows.length + " Feeds";
                }
            }
            else if (rows.every((r: any) => r.isLibrary(true))) {
                // Libraries, My Library included (MJT 2026-10-20): offered while
                // at least one of them can go (never the last one shown).
                if (rows.some((r: any) => P._wvHidCanHideLibrary(win, r.ref.libraryID))) {
                    hideLabel = rows.length === 1 ? hideStr
                        : rows.every((r: any) => r.isGroup()) ? "Hide " + rows.length + " Group Libraries" : "Hide " + rows.length + " Libraries";
                }
            }
            else if (rows.length === 1 && P._wvHidSectionOfRow(rows[0]) === "feeds") {
                // The Feeds row: the whole section, every feed with it (MJT
                // 2026-10-20). A single feed has no Hide of its own.
                if (P._wvHidCanHideSection(win, "feeds")) hideLabel = hideStr;
            }
            let hideItem: any = null;
            if (hideLabel) {
                const hi = mk(hideLabel, () => P._wvHidHide(objs, win));
                hideItem = hi;
                hi.classList.add("menuitem-iconic", "zotero-menuitem-hide-collection");
                // Where Zotero keeps its own Hide -- the Delete slot that My
                // Publications, Unfiled, Duplicates... relabel "Hide": the end
                // of the editing group, right above the separator before
                // Export (MJT 2026-10-16: "On the context menu of My
                // Publications, the Hide option is above Export. It should be
                // the same also for other collections and libraries"). With
                // that separator hidden (an archived library), right above the
                // Export block itself.
                // Right above Zotero's Delete item (MJT 2026-10-20: "Hide should
                // be above Delete Collection"): Delete Collection… / Delete
                // Saved Search… / Delete Collection and Items…; on a special
                // collection that item is Zotero's own Hide, which steps aside.
                // Library rows have no Delete: the end of the editing group,
                // then moved above Show Hidden below.
                const before = shown("deleteCollection") || shown("deleteCollectionAndItems")
                    || shown("sep3") || shown("exportCollection") || shown("exportFile")
                    || shown("createBibCollection") || shown("loadReport");
                if (before) menu.insertBefore(hi, before);
                else atEnd(hi);
                // On a special collection Zotero relabels its Delete item
                // "Hide" (its setting: every window). Weavero's Hide (this
                // window) takes its place (MJT 2026-10-19).
                if (special) { const dc = menu.querySelector(":scope > #deleteCollection"); if (dc) this._wvHidNativeHide(menu, dc); }
            }
            // Show: on a library row, in the group of Zotero's own "Show ..."
            // items -- right after the last of them (MJT 2026-10-16: "placed
            // together with the Zotero native show options"); safe there
            // since the build wrap steps Weavero's entries out of Zotero's
            // positional pass. The end of the menu is the fallback (a build
            // that renamed the ids would still get the entry).
            const placeInShowGroup = (node: any) => {
                const showIds = ["showPublications", "showRetracted", "showRecentlyRead", "showUnfiled", "showDuplicates"];
                let after: any = null;
                for (const id of showIds) { const n = menu.querySelector("#" + id); if (n) { after = n; break; } }
                if (after && after.parentNode === menu) menu.insertBefore(node, after.nextSibling);
                else atEnd(node);
            };
            if (rows.length === 1 && rows[0].isFeed && rows[0].isFeed()) {
                // A feed's menu has no Show group and nothing of its own to show
                // back: the manager's entry at the end; Hide stays above
                // Unsubscribe (Zotero's Delete slot), as above Delete elsewhere.
                const mi = mk("Manage Hidden…", () => P._wvHidOpenManager(win));
                mi.classList.add("menuitem-iconic", "wv-hid-show");
                atEnd(mi);
            }
            else if (rows.length === 1 && P._wvHidSectionOfRow(rows[0]) === "feeds") {
                // The Feeds row: the feeds hidden one by one come back from
                // here, as hidden collections do from their library row and
                // hidden groups from the Group Libraries line (MJT 2026-10-21:
                // "the blue dot on the Feeds lines, same as My Library"). Hide
                // (the whole section) sits right above it.
                const feeds = this._wvHidListFeeds(win);
                let node: any;
                if (feeds.length) {
                    node = doc.createXULElement("menu");
                    node.classList.add("wv-hid-entry", "menu-iconic", "wv-hid-show");
                    node.setAttribute("data-wv-owned", "hid");
                    node.setAttribute("label", "Show Hidden Feeds");
                    const pp = doc.createXULElement("menupopup");
                    pp.appendChild(mk("Manage Hidden…", () => P._wvHidOpenManager(win), false));
                    pp.appendChild(mk("Show All (" + feeds.length + ")", () => P._wvHidShow(win, null, null, null, null, null, feeds.map((f: any) => f.libraryID)), false));
                    pp.appendChild(doc.createXULElement("menuseparator"));
                    for (const f of feeds) pp.appendChild(mk(f.label, () => P._wvHidShow(win, null, null, null, null, null, [f.libraryID]), false, "feed"));
                    node.appendChild(pp);
                }
                else {
                    node = mk("Manage Hidden…", () => P._wvHidOpenManager(win));
                    node.classList.add("menuitem-iconic", "wv-hid-show");
                }
                atEnd(node);
                if (hideItem) menu.insertBefore(hideItem, node);
            }
            else if (rows.length === 1 && rows[0].isLibrary(true)) {
                const libID = rows[0].ref.libraryID;
                const hidden = this._wvHidListLibrary(libID, win);
                // The special collections Zotero's own setting hides (every
                // window): Zotero's separate "Show Unfiled Items", "Show
                // Duplicate Items", ... fold into the one Show submenu, marked
                // (MJT 2026-10-19: "merge the native Show collection").
                const everywhere = this._wvHidZoteroHidden(libID);
                for (const id of ["showPublications", "showRetracted", "showRecentlyRead", "showUnfiled", "showDuplicates"]) {
                    const n = menu.querySelector(":scope > #" + id);
                    if (n && !n.hidden) this._wvHidNativeHide(menu, n);
                }
                // Hidden group libraries belong to the Group Libraries line's
                // own menu (MJT 2026-10-16: "not necessary to put the hidden
                // libraries in the right-click menu on My Library"). My
                // Library lists them only while that line is gone -- every
                // group hidden, nothing left to right-click.
                // With the whole section hidden, the section is listed, not
                // the groups one by one.
                const groups = (libID === Zotero.Libraries.userLibraryID && !this._wvHidGroupsHeaderShown(win) && !this._wvHidSectionHidden(win, "groups"))
                    ? this._wvHidListGroups(win) : [];
                // The whole sections (Group Libraries, Feeds) come back from
                // here: a hidden heading has no row to right-click (2026-10-20).
                const sections = libID === Zotero.Libraries.userLibraryID ? this._wvHidListSections(win) : [];
                if (hidden.length || groups.length || everywhere.length || sections.length) {
                    const sm = doc.createXULElement("menu");
                    sm.classList.add("wv-hid-entry", "menu-iconic", "wv-hid-show");
                    sm.setAttribute("data-wv-owned", "hid");
                    // The label names what the submenu holds -- hidden group
                    // libraries are listed here too, under their own heading
                    // (MJT 2026-10-16: "Show Hidden Collections also includes
                    // hidden Libraries"). Same shape as the Hide labels.
                    const libsHere = groups.length + sections.length;
                    sm.setAttribute("label", (hidden.length || everywhere.length) && libsHere ? "Show Hidden Collections and Libraries"
                        : sections.some((s: any) => s.which === "feeds") ? "Show Hidden Libraries"
                        : libsHere ? "Show Hidden Group Libraries" : "Show Hidden Collections");
                    const pp = doc.createXULElement("menupopup");
                    const total = hidden.length + groups.length + everywhere.length + sections.length;
                    // Several at once, both ways: the manager card (MJT
                    // 2026-10-16; it replaced the dev.39 checklist panel).
                    pp.appendChild(mk("Manage Hidden…", () => P._wvHidOpenManager(win), false));
                    pp.appendChild(mk("Show All (" + total + ")", () => {
                        P._wvHidShow(win, libID, null, groups.map((g: any) => g.libraryID), null, sections.map((s: any) => s.which));
                        for (const z of everywhere) P._wvHidShowZotero(win, libID, z.type);
                    }, false));
                    pp.appendChild(doc.createXULElement("menuseparator"));
                    // In the collections pane's order, this window's entries
                    // and Zotero's "(all windows)" ones together (MJT
                    // 2026-10-20: "the same as in the collections pane").
                    const entries: any[] = [
                        ...hidden.map((h: any) => ({ rank: h.rank, names: h.names, item: () => {
                            const icon = h.key[0] === "S" ? "search" : h.key[0] === "V" ? h.key.slice(1) : "collection";
                            return mk(h.key[0] === "S" ? h.label + " (saved search)" : h.label, () => P._wvHidShow(win, libID, [h.key]), false, icon);
                        } })),
                        ...everywhere.map((z: any) => ({ rank: this._wvHidPaneRank(z.type), names: [z.label], item: () =>
                            mk(z.label + " (all windows)", () => P._wvHidShowZotero(win, libID, z.type), false, z.type) })),
                    ].sort((a, b) => this._wvHidPaneCompare(a, b));
                    for (const e of entries) pp.appendChild(e.item());
                    if (groups.length) {
                        if (hidden.length) pp.appendChild(doc.createXULElement("menuseparator"));
                        const hd = mk("Group Libraries", () => {}, false); hd.setAttribute("disabled", "true");
                        pp.appendChild(hd);
                        for (const g of groups) pp.appendChild(mk(g.label, () => P._wvHidShow(win, null, null, [g.libraryID]), false, "group"));
                    }
                    if (sections.length) {
                        if (hidden.length || everywhere.length || groups.length) pp.appendChild(doc.createXULElement("menuseparator"));
                        for (const s of sections) pp.appendChild(mk(s.label, () => P._wvHidShow(win, null, null, null, null, [s.which]), false, s.which));
                    }
                    sm.appendChild(pp);
                    placeInShowGroup(sm);
                    // On a library row Hide sits right above Show Hidden, both
                    // in Zotero's Show group (MJT 2026-10-20).
                    if (hideItem) menu.insertBefore(hideItem, sm);
                }
                else {
                    // Nothing hidden here: the manager is still the way to
                    // hide several at once (MJT 2026-10-16: "should still be
                    // available in the menu at the top level") -- a plain
                    // item, same place, same icon.
                    const mi = mk("Manage Hidden…", () => P._wvHidOpenManager(win));
                    mi.classList.add("menuitem-iconic", "wv-hid-show");
                    placeInShowGroup(mi);
                    if (hideItem) menu.insertBefore(hideItem, mi);
                }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvHidBuildMenu err: " + e); }
    }

    /** The hidden manager: a real, resizable WINDOW (MJT 2026-10-16: "a
     *  normal window with maximize, minimize and close options", no Close
     *  button, "I should also be able to resize"), one per main window --
     *  Zotero's basicViewer chrome window, the host the Plugins Manager
     *  rides in too, with its <browser> replaced by the manager (Weavero
     *  ships no chrome-registered pages). The shown tree on the LEFT (My
     *  Library with its collections nested and its saved searches, then
     *  every visible group library with its own; a hidden parent takes its
     *  subtree, as in the pane), this window's HIDDEN entries on the RIGHT
     *  by library, then the hidden groups. Hide / Show move the selection
     *  across through _wvHidHide / _wvHidShow; the main window's refresh
     *  re-renders the manager (_wvHidRefreshWin). Escape, Ctrl/Cmd+W or the
     *  close box end it; closing the main window closes it. */
    /** Every open manager re-reads its title: the count of main windows or a
     *  window's name changed (MJT 2026-10-21: "the title bar of the Hidden
     *  Manager does not directly update when opening a new window" -- it was
     *  re-read on the set's renders only). Called from the main-window load /
     *  unload hooks and from a window's rename. */
    _wvHidMgrRefreshTitles() {
        for (const w of wvMainWins()) {
            try {
                const mw = w._wvHidMgrWin;
                if (mw && !mw.closed && typeof mw._wvHidMgrTitle === "function") mw.document.title = mw._wvHidMgrTitle();
            } catch (_) {}
        }
    }

    _wvHidOpenManager(win: any): any {
        try {
            const existing: any = win._wvHidMgrWin;
            if (existing && !existing.closed) { try { existing.focus(); } catch (_) {} return existing; }
            const P: any = this;
            const arg: any = { uri: "about:blank", options: {} };
            arg.wrappedJSObject = arg;
            const w: any = (Services as any).ww.openWindow(null, "chrome://zotero/content/standalone/basicViewer.xhtml", "",
                "chrome,dialog=no,resizable,centerscreen,width=760,height=560", arg);
            if (!w) return null;
            win._wvHidMgrWin = w;
            w._wvHidManagerFor = win;
            const onMainUnload = () => { try { if (!w.closed) w.close(); } catch (_) {} };
            win.addEventListener("unload", onMainUnload, { once: true });
            // basicViewer's own load handler (registered at script time) runs
            // first and loads the uri into its browser; ours then replaces
            // the browser with the manager. The unload hook goes in only now:
            // registered right after openWindow it caught the initial
            // about:blank document's unload, dropped win._wvHidMgrWin while
            // the manager was still on screen, and the next "Manage Hidden…"
            // opened a second one (2026-10-16, dev.43).
            w.addEventListener("load", () => {
                try { w._wvHidMgrReady = Promise.resolve(P._wvHidBuildManager(w, win)).catch((e: any) => { w._wvHidMgrErr = String(e) + "\n" + (e && e.stack); Zotero.debug("[Weavero] _wvHidOpenManager build err: " + w._wvHidMgrErr); throw e; }); } catch (e) { w._wvHidMgrErr = String(e); Zotero.debug("[Weavero] _wvHidOpenManager build err: " + e); }
                const doc0 = w.document;
                const onUnload = (e: any) => {
                    if (e && e.target && e.target !== doc0) return;
                    try { w.removeEventListener("unload", onUnload); } catch (_) {}
                    try { win.removeEventListener("unload", onMainUnload); } catch (_) {}
                    try { if (win._wvHidMgrWin === w) win._wvHidMgrWin = null; } catch (_) {}
                };
                w.addEventListener("unload", onUnload);
            }, { once: true });
            return w;
        } catch (e) { Zotero.debug("[Weavero] _wvHidOpenManager err: " + e); return null; }
    }

    /** Fill a freshly loaded basicViewer window `w` with the manager for the
     *  main window `win`: TWO NATIVE COLLECTION TREES -- Zotero's own
     *  CollectionTree, mounted the way its Select Items dialog mounts one
     *  (selectItemsDialog.js: CollectionTree.init(element, options)); MJT
     *  2026-10-16: "the whole design of the collections pane should be
     *  reproduced". Icons and colours, fonts, twisties, selection and focus
     *  states, keys, type-to-find and the filter are Zotero's own. Weavero
     *  decides only which objects each tree includes (an instance
     *  `_includedInTree`, the hook the pane's hiding rides too), marks the
     *  rows that cannot move, keeps the trees from writing the pane's
     *  remembered expansion, and moves the selection with Hide / Show. */
    async _wvHidBuildManager(w: any, win: any) {
        const doc = w.document;
        const P: any = this;
        // "Collections and Libraries Manager" (MJT 2026-10-21, was "Hidden
        // Manager"), naming its main window when there are several
        // (MJT 2026-10-21): the window's custom title or "Window N", as the
        // Move Tabs menu names them. Re-read on every render.
        const titleFor = () => {
            try { return "Collections and Libraries Manager" + ((Zotero.getMainWindows() || []).length > 1 ? " — " + P._wvWindowName(win) : ""); }
            catch (_) { return "Collections and Libraries Manager"; }
        };
        // The viewer's title follows its browser ("about:blank"): ours, now
        // and once more after the browser's load would have spoken.
        doc.title = titleFor();
        w.setTimeout(() => { try { doc.title = titleFor(); } catch (_) {} }, 400);
        w._wvHidMgrTitle = titleFor;
        // The viewer persists size and position per DOCUMENT URL, a key the
        // Plugins Manager shares: with `persist` left on, closing the manager
        // wrote its size over the Plugins Manager's (1373x8441 on the dev
        // profile, 2026-10-16, dev.43).
        try { doc.documentElement.removeAttribute("persist"); } catch (_) {}
        // Our size, not the viewer's 1000x700 minimum.
        try { doc.documentElement.style.minWidth = "520px"; doc.documentElement.style.minHeight = "360px"; } catch (_) {}
        try { const tb = doc.getElementById("navigator-toolbox"); if (tb) tb.style.display = "none"; } catch (_) {}
        try { const br = doc.getElementById("browser"); if (br) br.remove(); } catch (_) {}
        // The viewer's `onload="window.sizeToContent()"` fits the window to
        // its content during this same load event -- with a few hundred rows,
        // a window thousands of pixels tall. Size and centre over the main
        // window now and once more after that handler.
        const W = 760, H = 560;
        const fit = () => {
            try {
                if (w.closed) return;
                w.resizeTo(W, H);
                const s: any = win.screen;
                let x = win.screenX + Math.round((win.outerWidth - W) / 2);
                let y = win.screenY + Math.round((win.outerHeight - H) / 2);
                if (s) {
                    x = Math.max(s.availLeft, Math.min(x, s.availLeft + s.availWidth - W));
                    y = Math.max(s.availTop, Math.min(y, s.availTop + s.availHeight - H));
                }
                w.moveTo(x, y);
            } catch (_) {}
        };
        fit();
        w.setTimeout(fit, 0);
        // Zotero's custom elements (its search box) and strings, loaded as
        // its own dialogs load them (selectItemsDialog.xhtml).
        try { if (!w._wvZoteroCE) { w._wvZoteroCE = true; Services.scriptloader.loadSubScript("chrome://zotero/content/customElements.js", w); } } catch (e) { Zotero.debug("[Weavero] manager customElements err: " + e); }
        try { if (doc.l10n) doc.l10n.addResourceIds(["zotero.ftl"]); } catch (_) {}

        const css = [
            "#main-window { background: var(--material-background, #fff); color: var(--fill-primary); }",
            // flex-basis 0px, not `flex: 1` (0%): a percentage basis in a
            // column of indefinite height resolves to `content`, and the
            // window's sizeToContent then took the full list height.
            ".wv-hid-mgr-box { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; flex: 1 1 0px; min-height: 0; box-sizing: border-box; font: message-box; }",
            ".wv-hid-mgr-search { display: flex; }",
            ".wv-hid-mgr-search > * { flex: 1 1 auto; margin: 0; }",
            ".wv-hid-mgr-panes { display: flex; gap: 10px; align-items: stretch; flex: 1 1 0px; min-height: 0; }",
            ".wv-hid-mgr-pane { flex: 1 1 0px; min-width: 0; display: flex; flex-direction: column; gap: 4px; min-height: 0; position: relative; }",
            ".wv-hid-mgr-cap { font-size: 10px; font-weight: 600; opacity: .65; text-transform: uppercase; letter-spacing: .04em; }",
            // The tree hosts carry Zotero's #zotero-collections-tree id: the
            // collection-tree rules (icons per type and per focus state, the
            // sizes) key on it, as in Zotero's own dialogs. Their background,
            // which Zotero clears under #main-window, is the side pane's.
            "#main-window .wv-hid-mgr-tree#zotero-collections-tree { flex: 1 1 0px; min-height: 120px; display: flex; flex-direction: column; overflow: hidden;",
            "  border: 1px solid var(--material-panedivider, rgba(127,127,127,.4)); border-radius: 5px; background: var(--material-sidepane, var(--fill-quinary, rgba(127,127,127,.06))); }",
            // The pinned parents' overlay goes inside the tree (2026-10-21).
            ".wv-hid-mgr-tree .virtualized-table { flex: 1 1 0px; min-height: 0; position: relative; }",
            ...WV_COLL_STICKY_CSS,
            // Rows that can be neither hidden nor shown from where they are
            // (My Library, headings, the parents and contents that only give
            // a hidden entry its place): grey italics and a tooltip saying
            // why (MJT 2026-10-16: "signaled in a special way").
            ".wv-hid-mgr-tree .row.wv-hid-fixed:not(.selected) { color: var(--fill-secondary); }",
            ".wv-hid-mgr-tree .row.wv-hid-fixed .cell-text { font-style: italic; }",
            // Hidden by Zotero's own setting (every window): a small mark.
            ".wv-hid-mgr-global { margin-inline-start: 6px; font-size: 10px; opacity: .65; white-space: nowrap; }",
            ".wv-hid-mgr-empty { position: absolute; inset: 22px 0 0 0; display: flex; align-items: center; justify-content: center; pointer-events: none; color: var(--fill-secondary); font-style: italic; }",
            ".wv-hid-mgr-empty[hidden] { display: none; }",
            // Weavero's indent guides, when the pane has them.
            ".wv-hid-mgr-tree.wv-indent-guides .row .cell-indent {",
            "  align-self: stretch; display: inline-block;",
            "  background-image: repeating-linear-gradient(to right, transparent 0 7px,",
            "    color-mix(in srgb, currentColor 22%, transparent) 7px 8px, transparent 8px 16px);",
            "  background-repeat: no-repeat; }",
            ".wv-hid-mgr-mid { display: flex; flex-direction: column; justify-content: center; gap: 8px; }",
            ".wv-hid-mgr-btn { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 5px; border: 1px solid var(--material-panedivider, rgba(127,127,127,.4)); background: var(--fill-quinary, rgba(127,127,127,.08)); color: inherit; cursor: pointer; white-space: nowrap; }",
            ".wv-hid-mgr-btn:hover { background: var(--fill-quarternary, rgba(127,127,127,.16)); }",
            ".wv-hid-mgr-btn:disabled { opacity: .5; cursor: default; }",
            // Show All sits a little apart from the pair that moves the selection.
            ".wv-hid-mgr-showall { margin-top: 14px; }",
            // A drag over a pane's free area / caption: the hide / show zone lit.
            ".wv-hid-mgr-pane.wv-hid-mgr-dropzone .wv-hid-mgr-tree { outline: 2px solid var(--color-accent, #4072e5); outline-offset: -2px; }",
            ".wv-hid-mgr-pane.wv-hid-mgr-dropzone .wv-hid-mgr-cap { opacity: 1; color: var(--color-accent, #4072e5); }",
        ].join("\n");
        const st: any = wvHtmlEl(doc, "style"); st.id = "wv-hid-mgr-style"; st.textContent = css;
        doc.documentElement.appendChild(st);

        const el = (cls: string, tag = "div", text?: string): any => {
            const d: any = wvHtmlEl(doc, tag, cls);
            if (text != null) d.textContent = text;
            return d;
        };
        const box = el("wv-hid-mgr-box");
        // One filter for both trees (MJT 2026-10-16: "a search box that will
        // find matches in both columns"): Zotero's own search box, its
        // "Filter collections" text, feeding each tree's own setFilter.
        const searchBar = el("wv-hid-mgr-search");
        // customElements.js registers its elements LAZILY: customElements.get()
        // answers undefined until one is created, so create and look.
        let search: any = null;
        try {
            const st2: any = doc.createXULElement("search-textbox");
            if (st2 && "inputField" in st2) search = st2;
        } catch (_) {}
        if (search) {
            search.setAttribute("data-l10n-id", "zotero-collections-search");
            search.setAttribute("data-l10n-attrs", "placeholder");
            search.setAttribute("timeout", "250");
        } else {
            search = wvHtmlEl(doc, "input");
            search.setAttribute("type", "search");
            search.setAttribute("placeholder", "Filter Collections");
        }
        search.id = "wv-hid-mgr-search";
        searchBar.appendChild(search);
        const panes = el("wv-hid-mgr-panes");
        const left = el("wv-hid-mgr-pane wv-hid-mgr-left");
        const leftHost = el("wv-hid-mgr-tree"); leftHost.id = "zotero-collections-tree";
        left.append(el("wv-hid-mgr-cap", "div", "Shown"), leftHost);
        const mid = el("wv-hid-mgr-mid");
        const hideBtn = el("wv-hid-mgr-btn wv-hid-mgr-hide", "button", "Hide →");
        const showBtn = el("wv-hid-mgr-btn wv-hid-mgr-show", "button", "← Show");
        // Everything on the right back at once (MJT 2026-10-20: "a way to
        // recover all hidden at the same time").
        const showAllBtn = el("wv-hid-mgr-btn wv-hid-mgr-showall", "button", "← Show All");
        showAllBtn.title = "Show everything hidden in this window (and what Zotero's own setting hides)";
        hideBtn.disabled = true; showBtn.disabled = true; showAllBtn.disabled = true;
        mid.append(hideBtn, showBtn, showAllBtn);
        const right = el("wv-hid-mgr-pane wv-hid-mgr-right");
        const rightHost = el("wv-hid-mgr-tree"); rightHost.id = "zotero-collections-tree";
        const rightEmpty = el("wv-hid-mgr-empty", "div", "Nothing hidden");
        right.append(el("wv-hid-mgr-cap", "div", "Hidden"), rightHost, rightEmpty);   // "Hidden", not "in this window" (MJT 2026-10-21): the title names the window
        panes.append(left, mid, right);
        box.append(searchBar, panes);
        doc.documentElement.appendChild(box);

        const inSearch = (t: any) => !!t && (t === search || (search.contains && search.contains(t)));
        w.addEventListener("keydown", (e: any) => {
            // Escape closes -- unless it is clearing a filter (Zotero's box
            // clears on keypress, after this keydown).
            if (e.key === "Escape") {
                if (inSearch(e.target) && search.value) return;
                e.preventDefault(); try { w.close(); } catch (_) {} return;
            }
            // Ctrl/Cmd+F: the filter (the viewer's own Find targets an
            // element this window does not have).
            if (wvAccel(e) && !e.altKey && !e.shiftKey && (e.key === "f" || e.key === "F")) {
                e.preventDefault(); e.stopPropagation();
                try { search.focus(); search.select(); } catch (_) {}
            }
        });
        // The pane's own keys that would act on the library from here --
        // Delete / Backspace (delete the collection), F2 (rename) -- stop
        // before the tree sees them; its handler would reach for a
        // ZoteroPane this window does not have.
        box.addEventListener("keydown", (e: any) => {
            const host = e.target && e.target.closest && e.target.closest(".wv-hid-mgr-tree");
            if (!host) return;
            if (e.key !== "F2" && e.key !== "Delete" && !((Zotero as any).isMac && e.key === "Backspace")) return;
            // Zotero's tree handlers for these reach for a ZoteroPane this
            // window lacks: the manager's own, the pane's keys (F2 renames,
            // Delete / Mac Backspace deletes, with Shift -- Cmd on Mac -- the
            // items too). 2026-10-20.
            e.preventDefault(); e.stopPropagation();
            const side = host === leftHost ? "left" : "right";
            const t = trees[side];
            if (!t) return;
            const rows = selectedRows(t).filter((r: any) => movable(side, r));
            if (e.key === "F2") { if (rows.length === 1 && rows[0].isCollection()) rename(t, rows[0]); }
            else swallow(del(t, rows, (Zotero as any).isMac ? !!e.metaKey : !!e.shiftKey));
        }, true);

        // ---- which rows each tree holds
        const userLib = Zotero.Libraries.userLibraryID;
        // groups: hidden group libraries; hiddenLibs: those plus a hidden My
        // Library (their contents are on the right as context); libs:
        // libraries with hidden entries inside them (their row gives those
        // entries their place); ancestors: parents of hidden collections.
        let sets: any = { groups: new Set(), hiddenLibs: new Set(), libs: new Set(), feeds: new Set(), ancestors: new Set(), sections: new Set() };
        const computeSets = () => {
            const s: any = { groups: new Set(), hiddenLibs: new Set(), libs: new Set(), feeds: new Set(), ancestors: new Set(), sections: new Set() };
            const hst = P._wvHidState(win);
            for (const g of hst.groups || []) { s.groups.add(Number(g)); s.hiddenLibs.add(Number(g)); }
            for (const l of P._wvHidLibs(hst)) s.hiddenLibs.add(Number(l));
            for (const f of P._wvHidFeeds(hst)) s.feeds.add(Number(f));   // feeds hidden one by one (2026-10-21)
            // A whole section (2026-10-20): with Group Libraries hidden every
            // group is on the right as context under its heading.
            for (const sec of P._wvHidSections(hst)) s.sections.add(sec);
            if (s.sections.has("groups")) { try { for (const g of Zotero.Groups.getAll()) if (g && g.libraryID > 0) s.hiddenLibs.add(g.libraryID); } catch (_) {} }
            for (const lk of Object.keys(hst.hidden || {})) {
                const lib = parseInt(lk, 10), keys: string[] = hst.hidden[lk] || [];
                if (!keys.length) continue;
                s.libs.add(lib);
                for (const k of keys) {
                    if (k[0] !== "C") continue;
                    let c: any = null;
                    try { c = (Zotero.Collections as any).getByLibraryAndKey(lib, k.slice(1)); } catch (_) {}
                    let pid = c ? c.parentID : null;
                    while (pid) {
                        s.ancestors.add(pid);
                        let pc: any = null;
                        try { pc = Zotero.Collections.get(pid); } catch (_) {}
                        pid = pc ? pc.parentID : null;
                    }
                }
            }
            // Libraries whose special collections Zotero's own setting hides
            // (every window): listed on the right too, marked.
            try {
                for (const lib of Zotero.Libraries.getAll()) {
                    if (!lib || lib.libraryType === "feed") continue;
                    if (P._wvHidZoteroHidden(lib.libraryID).length) s.libs.add(lib.libraryID);
                }
            } catch (_) {}
            sets = s;
        };
        const refOf = (o: any) => (o && o.ref && typeof o.type === "string") ? o.ref : o;
        const typeOf = (o: any) => String((o && o._ObjectType) || "");
        // A special collection hidden in THIS window.
        const hiddenHereV = (type: string, lib: number) => !!P._wvHidIsHidden({ type, libraryID: lib }, win);
        // LEFT: everything the pane would show, minus this window's hidden set.
        const includeLeft = (o: any) => {
            o = refOf(o);
            return !P._wvHidIsHidden(o, win);
        };
        // RIGHT: the hidden entries, what they hide with them (a hidden
        // collection's sub-collections, a hidden group's contents) and the
        // parents that give them their place.
        const includeRight = (o: any) => {
            o = refOf(o);
            if (!o) return false;
            const t = typeOf(o);
            if (t === "Collection") return sets.hiddenLibs.has(o.libraryID) || !!P._wvHidCollHiddenDeep(o, win) || sets.ancestors.has(o.id);
            if (t === "Search") return sets.hiddenLibs.has(o.libraryID) || !!P._wvHidIsHidden(o, win);
            if (t === "Group") return sets.groups.has(o.libraryID) || sets.libs.has(o.libraryID) || sets.sections.has("groups");
            // A feed: with its hidden section (2026-10-20), or hidden on its own
            // (2026-10-21). The Feeds row (the plain object it is built on):
            // with the section, or as the parent of feeds hidden one by one.
            if (t === "Feed") return sets.sections.has("feeds") || sets.feeds.has(o.libraryID);
            if (P._wvHidSectionOfRow(o) === "feeds" || (o.updateFeed && o.libraryID == null)) return sets.sections.has("feeds") || sets.feeds.size > 0;
            // My Library's own {libraryID}: hidden here, or holding hidden entries.
            if (o.libraryID != null && !t) return sets.hiddenLibs.has(o.libraryID) || sets.libs.has(o.libraryID);
            return false;
        };
        // What can move from where it is, and why not otherwise.
        const virt = (tr: any) => P._wvHidVirtualOf(tr);
        const isObj = (tr: any) => !!tr && (tr.isCollection() || tr.isSearch() || tr.isLibrary(true) || !!virt(tr));
        // A whole section's row: the Group Libraries heading, the Feeds row.
        const isSection = (tr: any) => !!tr && !!P._wvHidSectionOfRow(tr);
        const hiddenHere = (tr: any) => !!P._wvHidIsHidden(virt(tr) ? tr : tr.ref, win);
        // Hidden by Zotero's own setting (every window), not by this window.
        const hiddenEverywhere = (tr: any) => {
            const v = virt(tr);
            try { return !!v && !(Zotero.Prefs as any).getVirtualCollectionStateForLibrary(v.libraryID, v.type); } catch (_) { return false; }
        };
        const why = (side: string, tr: any): string => {
            if (!tr || (tr.isSeparator && tr.isSeparator())) return "";
            const sec = P._wvHidSectionOfRow(tr);
            if (side === "left") {
                // A whole section (2026-10-20): the Group Libraries heading
                // (only while My Library is shown), the Feeds row.
                if (sec) return P._wvHidCanHideSection(win, sec) ? "" : "The Group Libraries section can be hidden only while My Library is shown";
                if (tr.isFeed && tr.isFeed()) return "";   // a feed on its own (2026-10-21); the Feeds row stays
                // A library, My Library included (MJT 2026-10-20) -- never the
                // last one shown.
                if (tr.isLibrary(true)) return P._wvHidCanHideLibrary(win, tr.ref.libraryID) ? "" : "The last library shown cannot be hidden: show another library first";
                if (isObj(tr)) return "";
                return "A heading: select the libraries under it to hide them";
            }
            if (sec) return sets.sections.has(sec) ? "" : (sec === "groups" ? "A heading: select the hidden libraries under it to show them" : "Not hidden: shown here for the hidden entries inside it");
            // A row hidden through what holds it -- its section, its library, a
            // parent collection -- can be selected too, and Show brings that
            // holder back with it (MJT 2026-10-21, design "A": a collection
            // dropped onto a hidden one became its child, grey, with no way
            // back; `hint` names what Show will do). The selective-sync
            // convention: picking a child implies its ancestors.
            if (tr.isGroup()) return (sets.groups.has(tr.ref.libraryID) || sets.sections.has("groups")) ? "" : "Not hidden: shown here for the hidden entries inside it";
            if (tr.isFeed && tr.isFeed()) return (sets.feeds.has(tr.ref.libraryID) || sets.sections.has("feeds")) ? "" : "Not hidden: shown here for the hidden entries inside it";
            if (isObj(tr) && (hiddenHere(tr) || hiddenEverywhere(tr))) return "";
            if (tr.isHeader && tr.isHeader()) return "A heading: select the hidden libraries under it to show them";
            if ((tr.isCollection() || tr.isSearch()) && sets.hiddenLibs.has(tr.ref.libraryID)) return "";
            if (tr.isCollection() && P._wvHidCollHiddenDeep(tr.ref, win)) return "";
            return "Not hidden: shown here for the hidden entries inside it";
        };
        // The tooltip of a movable row on the right that is hidden through its
        // holder: what Show brings back with it.
        const hint = (tr: any): string => {
            try {
                if (!tr || P._wvHidSectionOfRow(tr)) return "";
                const lib = tr.ref && tr.ref.libraryID;
                if (tr.isGroup()) return (!sets.groups.has(lib) && sets.sections.has("groups")) ? "Hidden with the Group Libraries section: Show brings the section back" : "";
                if (tr.isFeed && tr.isFeed()) return (!sets.feeds.has(lib) && sets.sections.has("feeds")) ? "Hidden with the Feeds section: Show brings the section back" : "";
                if ((tr.isCollection() || tr.isSearch()) && !hiddenHere(tr) && sets.hiddenLibs.has(lib)) return "Hidden with its library: Show brings the library back";
                if (tr.isCollection() && !hiddenHere(tr) && P._wvHidCollHiddenDeep(tr.ref, win)) return "Hidden with its parent collection: Show brings the parent back";
            } catch (_) {}
            return "";
        };

        // ---- the trees
        let CT: any = null;
        try { const m = w.require("zotero/collectionTree"); CT = m && (m.default || m); } catch (e) { Zotero.debug("[Weavero] manager require err: " + e); }
        if (!CT || typeof CT.init !== "function") throw new Error("Zotero's CollectionTree is not available");
        const cvMain: any = win.ZoteroPane && win.ZoteroPane.collectionsView;
        const trees: any = {};
        // The selection as the user sees it: while filtering, Zotero keeps the
        // focused row that stopped matching at the end of the tree, invisible
        // (`_hiddenFocusedRow`, there for the pane's item list) -- it must
        // not arm Hide / Show (dev.48: "My Notes" stayed selected out of
        // sight under a "test" filter).
        const selectedRows = (t: any): any[] => {
            try {
                const hid = t._hiddenFocusedRow;
                return Array.from(t.selection.selected as Set<number>).map((i: number) => t.getRow(i))
                    .filter((r: any) => r && !(hid && r.id === hid.id));
            } catch (_) { return []; }
        };
        const movable = (side: string, tr: any) => (isObj(tr) || isSection(tr)) && !why(side, tr);
        // Anything on the right that can come back (this window's set, or a
        // row Zotero's own setting hides).
        const rightHasMovable = () => {
            try { const t = trees.right; if (!t) return false; for (let i = 0; i < t.rowCount; i++) if (movable("right", t.getRow(i))) return true; } catch (_) {}
            return false;
        };
        const syncButtons = () => {
            try { hideBtn.disabled = !(trees.left && selectedRows(trees.left).some((r: any) => movable("left", r))); } catch (_) {}
            try { showBtn.disabled = !(trees.right && selectedRows(trees.right).some((r: any) => movable("right", r))); } catch (_) {}
            try { showAllBtn.disabled = !rightHasMovable(); } catch (_) {}
        };
        let busy = false;
        const hideSel = async () => {
            if (busy || !trees.left) return;
            const objs = selectedRows(trees.left).filter((r: any) => movable("left", r)).map((r: any) => (virt(r) ? r : r.ref));
            if (!objs.length) return;
            busy = true;
            try { await P._wvHidHide(objs, win); } catch (e) { Zotero.debug("[Weavero] manager hide err: " + e); }
            busy = false;
        };
        // What Show takes out of the set for a row (or a dropped ref) to come
        // back: its own entry; hidden by Zotero's own setting, its switch; or,
        // hidden through its holder, that holder -- its section, its library,
        // the hidden ancestors of a collection (MJT 2026-10-21, design "A").
        const emptyReveal = () => ({ byLib: {} as any, groups: [] as number[], libs: [] as number[], feeds: [] as number[], sections: [] as string[], everywhere: [] as any[] });
        const revealLib = (lib: number, b: any) => {
            if (sets.groups.has(lib)) b.groups.push(lib);
            else if (lib === Zotero.Libraries.userLibraryID) b.libs.push(lib);
            else if (sets.sections.has("groups")) b.sections.push("groups");
        };
        const reveal = (x: any, b: any) => {
            const sec = P._wvHidSectionOfRow(x);
            if (sec) { b.sections.push(sec); return; }   // the heading / the Feeds row: the whole section
            const v = P._wvHidVirtualOf(x);
            if (v) {
                if (P._wvHidIsHidden(x, win)) (b.byLib[v.libraryID] = b.byLib[v.libraryID] || []).push("V" + v.type);
                else b.everywhere.push(v);   // hidden by Zotero's own setting: back through its switch
                return;
            }
            const ref = (x && x.ref !== undefined && typeof x.isCollection === "function") ? x.ref : x;
            if (!ref) return;
            const lib = ref.libraryID;
            if (P._wvHidIsUserLibraryRef(ref)) { b.libs.push(lib); return; }   // a hidden My Library
            if (P._wvHidIsGroup(ref)) { if (sets.groups.has(lib)) b.groups.push(lib); else if (sets.sections.has("groups")) b.sections.push("groups"); return; }
            if (P._wvHidSectionOfLib(ref) === "feeds") { if (sets.feeds.has(lib)) b.feeds.push(lib); else if (sets.sections.has("feeds")) b.sections.push("feeds"); return; }
            const key = P._wvHidKey(ref);
            if (!key) return;
            if (P._wvHidIsHidden(ref, win)) { (b.byLib[lib] = b.byLib[lib] || []).push(key); return; }
            if (sets.hiddenLibs.has(lib)) { revealLib(lib, b); return; }
            if (key[0] === "C") {
                let c: any = ref.parentID ? Zotero.Collections.get(ref.parentID) : null, g = 0;
                while (c && g++ < 64) {
                    if (P._wvHidIsHidden(c, win)) { const k = P._wvHidKey(c); if (k) (b.byLib[lib] = b.byLib[lib] || []).push(k); }
                    c = c.parentID ? Zotero.Collections.get(c.parentID) : null;
                }
            }
        };
        const revealAny = (b: any) => !!(Object.keys(b.byLib).length || b.groups.length || b.libs.length || b.feeds.length || b.sections.length || b.everywhere.length);
        const applyReveal = async (b: any) => {
            for (const lk of Object.keys(b.byLib)) await P._wvHidShow(win, parseInt(lk, 10), b.byLib[lk]);
            if (b.groups.length || b.libs.length || b.sections.length || b.feeds.length) await P._wvHidShow(win, null, null, b.groups.length ? b.groups : null, b.libs.length ? b.libs : null, b.sections.length ? b.sections : null, b.feeds.length ? b.feeds : null);
            for (const v of b.everywhere) await P._wvHidShowZotero(win, v.libraryID, v.type);
        };
        const showSel = async () => {
            if (busy || !trees.right) return;
            const b = emptyReveal();
            for (const r of selectedRows(trees.right).filter((x: any) => movable("right", x))) reveal(r, b);
            if (!revealAny(b)) return;
            busy = true;
            try { await applyReveal(b); } catch (e) { Zotero.debug("[Weavero] manager show err: " + e); }
            busy = false;
        };
        const showAll = async () => {
            if (busy) return;
            busy = true;
            try { await P._wvHidShowAll(win); } catch (e) { Zotero.debug("[Weavero] manager show all err: " + e); }
            busy = false;
        };
        // Show again whatever was dropped on the left zone -- a collection,
        // a saved search, a group, My Library's {libraryID}, a section's row
        // or ref, a special row (hidden here, or by Zotero's setting): the
        // counterpart of _wvHidHide's object handling.
        const showObjs = async (objs: any[]) => {
            const b = emptyReveal();
            for (const o of objs) reveal(o, b);
            if (revealAny(b)) await applyReveal(b);
        };
        hideBtn.addEventListener("click", () => { hideSel(); });
        showBtn.addEventListener("click", () => { showSel(); });
        showAllBtn.addEventListener("click", () => { showAll(); });

        // Each tree's rows get the fixed-row mark in the same microtask as
        // Zotero's render (it rebuilds a row's content on every render), so
        // the mark never lags a paint.
        const decorate = (side: string) => {
            const t = trees[side], host = side === "left" ? leftHost : rightHost;
            if (!t) return;
            for (const rowEl of Array.from(host.querySelectorAll(".row[id^='collection-tree-row-']")) as any[]) {
                let tr: any = null;
                try { tr = t.getRow(parseInt(rowEl.id.slice("collection-tree-row-".length), 10)); } catch (_) {}
                const reason = why(side, tr);
                // Hidden by Zotero's own setting, in every window: marked, and
                // Show brings it back everywhere.
                const global = side === "right" && !!tr && hiddenEverywhere(tr) && !hiddenHere(tr);
                const title = reason || (global ? "Hidden in every window by Zotero's own setting: Show brings it back everywhere" : (side === "right" ? hint(tr) : ""));
                if (rowEl.classList.contains("wv-hid-fixed") !== !!reason) rowEl.classList.toggle("wv-hid-fixed", !!reason);
                if (rowEl.classList.contains("wv-hid-global") !== global) rowEl.classList.toggle("wv-hid-global", global);
                if ((rowEl.getAttribute("title") || "") !== title) { if (title) rowEl.setAttribute("title", title); else rowEl.removeAttribute("title"); }
                const mark = rowEl.querySelector(".wv-hid-mgr-global");
                if (global && !mark) {
                    const sp: any = wvHtmlEl(doc, "span", "wv-hid-mgr-global", "(all windows)");
                    (rowEl.querySelector(".cell.primary") || rowEl).appendChild(sp);
                }
                else if (!global && mark) mark.remove();
            }
        };
        const mos: any[] = [];
        const watch = (side: string, host: any) => {
            const mo = new w.MutationObserver(() => { try { decorate(side); } catch (_) {} });
            mo.observe(host, { childList: true, subtree: true });
            mos.push(mo);
        };
        // CollectionTree.refresh() leaves selection events suppressed (the
        // pane's own refresh path re-enables them too, _wvHidRefreshWin):
        // without this the buttons never heard of a selection (dev.47).
        const reloadTree = async (t: any) => {
            await t.reload();
            try { t.selection.selectEventsSuppressed = false; } catch (_) {}
        };
        // ONE open-state map for both trees, seeded from the pane's in-memory
        // state. Zotero's _saveOpenStates rebuilds a tree's _containerState
        // from its VISIBLE rows on every toggle, so a collection that moved
        // across (no longer visible here, never seen there) always arrived
        // closed (MJT 2026-10-20: "the expansion state should stay the
        // same"). Before each reload every tree's visible containers are
        // written into the map (true / false, explicitly -- Zotero drops
        // closed collections), and each tree reloads from the map with its
        // own visible rows' states on top.
        const visibleOpenState = (t: any): any => {
            const own: any = {};
            try {
                for (let i = 0; i < t.rowCount; i++) {
                    const r = t.getRow(i);
                    if (r && r.isContainer && r.isContainer()) own[r.id] = !!t.isContainerOpen(i);
                }
            } catch (_) {}
            return own;
        };
        // Seed, lowest first: the pane's remembered state; what this
        // manager last decided for this main window (a hidden collection is
        // out of the pane's sight, so the pane's entry for it goes stale:
        // "WV 8-level L1" closed here came back open on the next opening,
        // MJT 2026-10-20); what the pane SHOWS right now, which wins for the
        // rows it shows. Remembered on every refresh and at close.
        let openState: any = {};
        try {
            openState = Object.assign({}, JSON.parse(JSON.stringify((cvMain && cvMain._containerState) || {})),
                win._wvHidMgrOpenState || {}, cvMain ? visibleOpenState(cvMain) : {});
        } catch (_) {}
        const remember = () => { try { win._wvHidMgrOpenState = Object.assign({}, openState); } catch (_) {} };
        const configure = async (side: string, t: any) => {
            const proto = Object.getPrototypeOf(t);
            const inc = side === "left" ? includeLeft : includeRight;
            t._includedInTree = function (object: any, resetCache: any) {
                try { if (!inc(object)) return false; } catch (_) {}
                return proto._includedInTree.call(this, object, resetCache);
            };
            // The special collections (Unfiled, Duplicates, ...; never the
            // Bin): on the left those Zotero shows and this window does not
            // hide, on the right those hidden here or by Zotero's own setting.
            P._wvHidWrapExpandRow(t, side === "left"
                ? (type: string, lib: number, zs: boolean) => zs && !hiddenHereV(type, lib)
                : (type: string, lib: number, zs: boolean) => !zs || hiddenHereV(type, lib), P._wvWireTag());
            // A collection whose every child is out of this side shows no arrow (the pane's rule).
            P._wvHidWrapContainerEmpty(t, P._wvWireTag());
            // WV-TEMP-134361: the collection whose id equals its library's may drop on the library row.
            P._wvCollectionDropFixApply(t, P._wvWireTag());
            // Rows that cannot move cannot be selected either (MJT 2026-10-19:
            // "I should not be able to select My Library" -- since 2026-10-20
            // only the last library shown, the headings and the context rows):
            // Zotero's own isSelectable keeps separators and headings out and
            // honours its Select All scope, so Ctrl/Cmd+A works as in the
            // collections pane (MJT 2026-10-20) -- its scope, minus the rows
            // that cannot move.
            t.isSelectable = (index: number) => {
                let r: any = null; try { r = t.getRow(index); } catch (_) {}
                if (!r || (r.isSeparator && r.isSeparator())) return false;
                // A heading only as a whole section (Group Libraries, 2026-10-20).
                if (r.isHeader && r.isHeader() && !isSection(r)) return false;
                if (!movable(side, r)) return false;
                if (t._selectAllScope) return t._selectAllScope(r, index);
                return true;
            };
            // Ctrl/Cmd+A: the rows of the selection's level, as the pane's
            // (collectionTree.jsx _handleSelectAll: the library roots of one
            // visibility group, or the rows sharing a parent with a selected
            // row) -- but here the saved searches and the special collections
            // of that level come along, and a selected one of them starts the
            // scope too (MJT 2026-10-20: "no reason to exclude the special
            // collections"); the pane leaves them out because they cannot be
            // shown together. isSelectable above still drops what cannot move.
            t._handleSelectAll = async () => {
                const idx: number[] = Array.from(t.selection.selected as Set<number>);
                if (!idx.length) return;
                const vgs = new Set<string>(), parents = new Set<number>();
                for (const i of idx) {
                    const r = t.getRow(i);
                    if (!r) continue;
                    if (r.isLibrary(true)) vgs.add(r.visibilityGroup);
                    else parents.add(t.getParentIndex(i));
                }
                t._selectAllScope = (row: any, index: number) => {
                    if (row.isLibrary(true)) return vgs.has(row.visibilityGroup);
                    return parents.has(t.getParentIndex(index)) && (row.isCollection() || row.isSearch() || !!virt(row));
                };
                try { t.selection.selectAll(); }
                finally { t._selectAllScope = null; }
            };
            // The table takes isSelectable as a render-time prop.
            try { t.forceUpdate(); } catch (_) {}
            // Expansion starts as the pane shows it now (its in-memory
            // state), and what is opened or closed here stays here: the
            // trees never write the pane's remembered state
            // (sourceList.persist).
            t._storeOpenStates = () => {};
            t._containerState = Object.assign({}, openState);
            // The tree's inline editor commits through window.Zotero_Tabs.rename
            // (the main window's tab title) -- absent here, and a throw there
            // left the editor open. Same save, without it.
            t.commitEditingName = async function () {
                const tr = this._editing;
                if (!tr || !tr.editingName) return;
                tr.ref.name = tr.editingName;
                delete tr.editingName;
                await tr.ref.saveTx({ undoAction: "undo-action-rename-collection" });
            };
            await reloadTree(t);
            // Zotero's init selected the initial folder (My Library) before
            // the rows above could refuse it, and a refresh keeps the selection
            // set: drop a selection the tree would refuse now.
            try {
                if ([...t.selection.selected].some((i: number) => !t.isSelectable(i))) {
                    t.selection.selectEventsSuppressed = true;
                    t.selection.clearSelection();
                    t.selection.selectEventsSuppressed = false;
                }
            } catch (_) {}
        };
        // Newly hidden entries on the right come into view once; what the
        // user closes here afterwards stays closed.
        const revealed = new Set<string>();
        const revealRight = async () => {
            const t = trees.right; if (!t) return;
            const hst = P._wvHidState(win);
            for (const lk of Object.keys(hst.hidden || {})) {
                const lib = parseInt(lk, 10);
                for (const k of hst.hidden[lk] || []) {
                    const id = lib + ":" + k;
                    if (revealed.has(id)) continue;
                    revealed.add(id);
                    try {
                        if (k[0] === "C") {
                            const c: any = (Zotero.Collections as any).getByLibraryAndKey(lib, k.slice(1));
                            if (c) await t.expandToCollection(c.id);
                        } else {
                            await t.expandLibrary(lib);
                        }
                    } catch (_) {}
                }
            }
        };
        const onSel = (from?: string) => {
            // A selection the tree would refuse (Zotero's initial folder landing
            // after configure's own clear, a row turned fixed) is dropped --
            // never during a scoped Select All, whose scope would read every
            // other row as refused.
            try {
                for (const side of ["left", "right"]) {
                    const t = trees[side];
                    if (!t || t._selectAllScope) continue;
                    if ([...t.selection.selected].some((i: number) => !t.isSelectable(i))) {
                        t.selection.selectEventsSuppressed = true;
                        t.selection.clearSelection();
                        t.selection.selectEventsSuppressed = false;
                    }
                }
            } catch (_) {}
            // ONE selection across the two panes: a selection made in one pane
            // clears the other's, so the pane being worked in is the only one
            // with a selection and only its button is on (MJT 2026-10-21: "I
            // find it confusing that Hide is still enabled even though I am
            // working in the right pane" -- the left kept its grey selection
            // and Hide → stayed armed). The refresh restores each pane's own
            // rows with its events suppressed, so this sees user selections
            // (and the row-drop's selectByID in the target pane) only.
            try {
                const other = from === "left" ? "right" : (from === "right" ? "left" : null);
                const t = from ? trees[from] : null, o = other ? trees[other] : null;
                if (t && o && t.selection.count > 0 && o.selection.count > 0) {
                    o.selection.selectEventsSuppressed = true;
                    o.selection.clearSelection();
                    o.selection.selectEventsSuppressed = false;
                }
            } catch (_) {}
            syncButtons();
        };
        // ---- Zotero's collection actions on the manager's own rows (MJT
        // 2026-10-20: New Subcollection, Rename, Move To, Copy To, Hide /
        // Show, Delete Collection, Export). ZoteroPane's versions act on the
        // MAIN window's selection, where a hidden collection has no row, so
        // the manager does the same things itself with Zotero's parts: its
        // "Untitled" name and New Collection dialog, the tree's inline
        // editor, createMenuForTarget for the targets (Zotero's own
        // exclusions), its confirmation strings and deleteSelection, its
        // exporter. `w._wvHidMgrConfirm` and `w.openDialog` are what the spec
        // stands in for.
        const editable = (libraryID: number): boolean => { try { const l: any = Zotero.Libraries.get(libraryID); return !!(l && l.editable); } catch (_) { return false; } };
        // The actions run detached from the menu / key event: a late rejection
        // (the tree torn down under a save, a refused save) is logged, never
        // left unhandled (it surfaced as a phantom failure in the runner).
        const swallow = (p: any) => { try { if (p && typeof p.catch === "function") p.catch((e: any) => Zotero.debug("[Weavero] manager action err: " + e)); } catch (_) {} };
        w._wvHidMgrConfirm = async (title: string, message: string): Promise<boolean> => {
            const ps: any = Services.prompt;
            const flags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING + ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
            return ps.confirmEx(w, title, message, flags, title, "", "", "", {}) === 0;
        };
        const l10nValues = async (ids: any[]): Promise<string[]> => {
            try { if (doc.l10n) return await doc.l10n.formatValues(ids); } catch (_) {}
            return ids.map((x: any) => String(x.id));
        };
        const newSubcollection = async (row: any) => {
            const parent = row.ref, libraryID = parent.libraryID;
            if (!editable(libraryID)) return null;
            const prefix = Zotero.getString("pane.collections.untitled");
            const name = (Zotero.Utilities.Internal as any).getNextName(prefix,
                Zotero.Collections.getByParent(parent.id).map((c: any) => String(c.name)).filter((s: string) => s.startsWith(prefix)));
            const io: any = { name, libraryID, parentCollectionID: parent.id };
            w.openDialog("chrome://zotero/content/newCollectionDialog.xhtml", "_blank", "chrome,modal,centerscreen,resizable=no", io);
            const out = io.dataOut;
            if (!out) return null;
            const c: any = new Zotero.Collection();
            c.libraryID = out.libraryID; c.name = out.name || name; c.parentID = out.parentCollectionID;
            return c.saveTx();
        };
        const rename = (t: any, row: any) => {
            if (!row || !row.isCollection() || !editable(row.ref.libraryID)) return;
            try { t.startEditing(row); } catch (e) { Zotero.debug("[Weavero] manager rename err: " + e); }
        };
        const moveTo = async (cols: any[], target: any) => {
            for (const c of cols) {
                if (target.libraryID !== c.libraryID) continue;   // Zotero: within the library only
                c.parentID = target.objectType === "collection" ? target.id : null;
                await c.saveTx({ undoAction: "undo-action-move-collection" });
            }
        };
        const rowFor = (t: any, target: any) => {
            try { return new (Zotero as any).CollectionTreeRow(t, target.objectType === "collection" ? "collection" : (target.libraryType === "group" ? "group" : "library"), target); }
            catch (_) { return null; }
        };
        const copyTo = async (t: any, col: any, target: any) => {
            const copyOptions = {
                tags: Zotero.Prefs.get("groups.copyTags"), childNotes: Zotero.Prefs.get("groups.copyChildNotes"), childLinks: Zotero.Prefs.get("groups.copyChildLinks"),
                childFileAttachments: Zotero.Prefs.get("groups.copyChildFileAttachments"), annotations: Zotero.Prefs.get("groups.copyAnnotations"),
            };
            await t.executeCollectionCopy({ collection: col, targetCollectionID: target.objectType === "collection" ? target.id : null, targetLibraryID: target.libraryID, targetTreeRow: rowFor(t, target), copyOptions });
        };
        const del = async (t: any, rows: any[], deleteItems: boolean) => {
            const allCols = rows.length > 0 && rows.every((r: any) => r.isCollection());
            const allSearches = rows.length > 0 && rows.every((r: any) => r.isSearch());
            if ((!allCols && !allSearches) || !editable(rows[0].ref.libraryID)) return;
            const count = rows.length;
            let title = "", message = "";
            if (allCols && deleteItems) [title, message] = await l10nValues([{ id: "collections-delete-with-items-title", args: { count } }, { id: "collections-delete-with-items-message", args: { count } }]);
            else if (allCols) { let keep = ""; [title, message, keep] = await l10nValues([{ id: "collections-delete-title", args: { count } }, { id: "collections-delete-message", args: { count } }, { id: "collections-delete-keep-items", args: { count } }]); message += "\n\n" + keep; }
            else [title, message] = await l10nValues([{ id: "collections-delete-search-title", args: { count } }, { id: "collections-delete-search-message", args: { count } }]);
            if (!(await w._wvHidMgrConfirm(title, message))) return;
            await t.deleteSelection(deleteItems);   // Zotero's own, on this tree's selection
        };
        const exportCols = (cols: any[]) => {
            try {
                const Ex: any = (win as any).Zotero_File_Exporter;
                const ex = new Ex();
                ex.name = cols.map((c: any) => c.getName()).join(", ");
                ex.collections = cols;
                ex.save();
            } catch (e) { Zotero.debug("[Weavero] manager export err: " + e); }
        };
        const menuCmd = (fn: (ev: any, target: any) => any) => (ev: any, target: any) => { if (ev.target.tagName === "menuitem") { try { swallow(fn(ev, target)); } catch (e) { Zotero.debug("[Weavero] manager target err: " + e); } ev.stopPropagation(); } };
        // Move To ▸: this library's root first, then its collections (Zotero's
        // buildMoveCollectionMenu: never into itself, its parent or a child).
        const buildMoveMenu = (popup: any, cols: any[]) => {
            popup.replaceChildren();
            const lib: any = Zotero.Libraries.get(cols[0].libraryID);
            const li: any = doc.createXULElement("menuitem");
            li.setAttribute("label", lib.name); li.setAttribute("image", lib.treeViewImage); li.setAttribute("value", lib.treeViewID);
            li.classList.add("menuitem-iconic");
            li.disabled = cols.every((c: any) => !c.parentID);
            li.addEventListener("command", (ev: any) => menuCmd(() => moveTo(cols, lib))(ev, lib));
            popup.appendChild(li);
            popup.appendChild(doc.createXULElement("menuseparator"));
            for (const col of Zotero.Collections.getByLibrary(lib.libraryID)) {
                const node = (Zotero.Utilities.Internal as any).createMenuForTarget(col, popup, null,
                    menuCmd((_ev: any, target: any) => moveTo(cols, target)),
                    (target: any) => cols.some((c: any) => c === target || c.parentKey === target.key || c.hasDescendent("collection", target.id)));
                if (node) popup.append(node);
            }
        };
        // Copy To ▸: every library (Zotero's buildCopyCollectionMenu: not into
        // itself or a read-only group; a library already holding a linked
        // copy greys out once the check comes back).
        const buildCopyMenu = (popup: any, t: any, col: any) => {
            popup.replaceChildren();
            let tops: any[] = Zotero.Libraries.getAll().filter((l: any) => l && l.libraryType !== "feed");
            const libs = tops.slice();
            if (tops.length === 1) {
                const lib = tops[0];
                const li: any = doc.createXULElement("menuitem");
                li.setAttribute("label", lib.name); li.setAttribute("image", lib.treeViewImage); li.setAttribute("value", lib.treeViewID);
                li.classList.add("menuitem-iconic");
                li.addEventListener("command", (ev: any) => menuCmd(() => copyTo(t, col, lib))(ev, lib));
                popup.appendChild(li);
                popup.appendChild(doc.createXULElement("menuseparator"));
                tops = Zotero.Collections.getByLibrary(lib.libraryID);
            }
            for (const obj of tops) {
                const node = (Zotero.Utilities.Internal as any).createMenuForTarget(obj, popup, null,
                    menuCmd((_ev: any, target: any) => copyTo(t, col, target)),
                    (target: any) => col === target || (target.libraryType === "group" && !target.editable));
                if (node) popup.append(node);
            }
            (async () => {
                try {
                    const linked: any = {};
                    for (const lib of libs) {
                        if (lib.libraryID === col.libraryID) continue;
                        if (await col.getLinkedCollection(lib.libraryID, true)) linked[lib.libraryID] = true;
                        for (const d of col.getDescendents(false, "collection")) {
                            const sub: any = Zotero.Collections.get(d.id);
                            if (sub && await sub.getLinkedCollection(lib.libraryID, true)) linked[lib.libraryID] = true;
                        }
                    }
                    for (const el of Array.from(popup.childNodes) as any[]) {
                        const v = el.getAttribute && el.getAttribute("value");
                        if (v && v[0] === "L" && linked[v.slice(1)]) el.disabled = true;
                    }
                } catch (_) {}
            })();
        };
        // Right-click on a row -- Zotero's tree selects it first when it is
        // outside the selection, and the Menu key / Shift+F10 come here too
        // (virtualized-table onItemContextMenu). Zotero's order for a
        // collection, Hide / Show above Delete as in the pane; a library,
        // section or special row gets Hide / Show alone.
        const openCtx = (side: string, _e: any, x: number, y: number) => {
            try {
                const old = doc.getElementById("wv-hid-mgr-menu");
                if (old) { try { old.hidePopup(); } catch (_) {} old.remove(); }
                const t = trees[side];
                if (!t) return;
                const rows = selectedRows(t).filter((r: any) => movable(side, r));
                const cols = rows.filter((r: any) => r.isCollection()).map((r: any) => r.ref);
                const one = rows.length === 1 ? rows[0] : null;
                const libID = rows.length ? rows[0].ref.libraryID : null;
                const oneLib = rows.length > 0 && rows.every((r: any) => r.ref && r.ref.libraryID === libID);
                const canEdit = libID != null && editable(libID);
                const allCols = rows.length > 0 && rows.every((r: any) => r.isCollection());
                const allSearches = rows.length > 0 && rows.every((r: any) => r.isSearch());
                const pop: any = doc.createXULElement("menupopup");
                pop.id = "wv-hid-mgr-menu";
                const label = (el: any, l10n: any, fallback: string) => {
                    if (l10n && doc.l10n) doc.l10n.setAttributes(el, l10n.id, l10n.args || {});
                    else el.setAttribute("label", fallback);
                };
                const item = (cls: string, l10n: any, fallback: string, fn: () => any, enabled: boolean) =>
                    wvMenuItem(doc, { cls, l10n: (l10n && doc.l10n) ? l10n : undefined, label: fallback, disabled: !enabled, onCommand: () => fn() }, pop);
                const submenu = (cls: string, l10n: any, fallback: string, build: (popup: any) => void, enabled: boolean) => {
                    const m: any = doc.createXULElement("menu");
                    m.className = cls;
                    label(m, l10n, fallback);
                    if (!enabled) m.setAttribute("disabled", "true");
                    const mp: any = doc.createXULElement("menupopup");
                    mp.addEventListener("popupshowing", (ev: any) => { if (ev.target === mp) { try { build(mp); } catch (e) { Zotero.debug("[Weavero] manager submenu err: " + e); } } });
                    m.appendChild(mp);
                    pop.appendChild(m);
                    return m;
                };
                const sep = () => pop.appendChild(doc.createXULElement("menuseparator"));
                if (one && one.isCollection()) {
                    item("wv-hid-mgr-new", null, "New Subcollection…", () => newSubcollection(one), canEdit);
                    sep();
                    item("wv-hid-mgr-rename", { id: "collections-menu-rename" }, "Rename", () => rename(t, one), canEdit);
                }
                if (allCols && oneLib) {
                    submenu("wv-hid-mgr-move", { id: "collections-menu-move-collection" }, "Move To", (mp) => buildMoveMenu(mp, cols), canEdit);
                    if (one) submenu("wv-hid-mgr-copy", { id: "collections-menu-copy-collection" }, "Copy To", (mp) => buildCopyMenu(mp, t, cols[0]), true);
                }
                const n = rows.length;
                item("wv-hid-mgr-hideshow", null, side === "left" ? (n > 1 ? "Hide " + n + " →" : "Hide →") : (n > 1 ? "← Show " + n : "← Show"),
                    () => { if (side === "left") hideSel(); else showSel(); }, n > 0);
                if (allCols || allSearches) {
                    item("wv-hid-mgr-delete", { id: allCols ? "collections-menu-delete" : "collections-menu-delete-search", args: { count: n } },
                        allCols ? (n > 1 ? "Delete Collections…" : "Delete Collection…") : (n > 1 ? "Delete Searches…" : "Delete Search…"), () => del(t, rows, false), canEdit);
                    if (allCols) item("wv-hid-mgr-delete-items", { id: "collections-menu-delete-with-items", args: { count: n } },
                        n > 1 ? "Delete Collections and Items…" : "Delete Collection and Items…", () => del(t, rows, true), canEdit);
                }
                if (allCols) { sep(); item("wv-hid-mgr-export", { id: "collections-menu-export" }, "Export…", () => exportCols(cols), true); }
                pop.addEventListener("popuphidden", (ev: any) => { if (ev.target === pop) pop.remove(); });
                (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
                pop.openPopupAtScreen(x, y, true);
            } catch (err) { Zotero.debug("[Weavero] manager context menu err: " + err); }
        };
        const opts = (side: string) => ({
            onSelectionChange: () => onSel(side),
            onContextMenu: (e: any, x: number, y: number) => openCtx(side, e, x, y),
            multiSelect: true,
            // Zotero's own drag of collections and saved searches and its
            // drops on rows (re-parent, library row = the root, another
            // library = a copy, its canDrop rules) -- MJT 2026-10-20; the
            // panes' free areas are Weavero's hide / show zones (below).
            dragAndDrop: true,
            // The special collections are offered (MJT 2026-10-19) and the
            // Feeds row as a whole section (2026-10-20); the Bin, which Zotero
            // never hides, is not.
            hideSources: ["trash"],
            initialFolder: "L" + userLib,
            // Enter and double-click: move the selection across. A double-click
            // names its row: only a row that is part of the selection moves it.
            // A row that cannot be selected (the Group Libraries heading) left
            // the earlier selection in place, and the double-click hid THAT
            // (MJT 2026-10-19).
            onActivate: (_e: any, indices: any) => {
                const t = trees[side];
                if (t && Array.isArray(indices) && indices.length
                        && !indices.every((i: number) => t.selection.isSelected(i))) return;
                if (side === "left") hideSel(); else showSel();
            },
        });
        computeSets();
        trees.left = await CT.init(leftHost, opts("left"));
        trees.right = await CT.init(rightHost, opts("right"));
        await configure("left", trees.left);
        await configure("right", trees.right);
        await revealRight();
        watch("left", leftHost); watch("right", rightHost);
        // ---- Drag and drop (MJT 2026-10-20: "drag and drop collections and
        // libraries from Shown to Hidden and also within a pane to move
        // collections to become a subcollection of another collection, or back
        // to the root"; decisions: a drop on a ROW is Zotero's own move in both
        // panes -- dragAndDrop above -- while a pane's FREE AREA and caption
        // are Weavero's zone: a drop there hides (right) or shows (left) what
        // was dragged). Zotero's tree drags only collections and saved
        // searches (onDragStart returns before setData for the rest): library,
        // heading and Feeds rows carry Weavero's own type, which the zones
        // alone accept. A drag from the main window's collections pane carries
        // zotero/collection too and drops here the same way.
        const WV_ROWS = "application/x-weavero-hid-rows";
        const rowOfEvent = (side: string, e: any) => {
            const el = e.target && e.target.closest && e.target.closest(".row[id^='collection-tree-row-']");
            if (!el || !trees[side]) return null;
            try { return trees[side].getRow(parseInt(el.id.slice("collection-tree-row-".length), 10)) || null; } catch (_) { return null; }
        };
        // A pinned parent (the sticky overlay) counts as a row too: no zone
        // lights under it, and a drop there does nothing, as in the pane.
        const onRow = (e: any) => !!(e.target && e.target.closest && (e.target.closest(".row[id^='collection-tree-row-']") || e.target.closest(".wv-coll-sticky")));
        const onHostDragStart = (side: string) => (e: any) => {
            try {
                const row = rowOfEvent(side, e);
                if (!row || row.isCollection() || row.isSearch() || !e.dataTransfer) return;   // Zotero's own drag
                const t = trees[side];
                const sel = selectedRows(t).filter((r: any) => movable(side, r) && !r.isCollection() && !r.isSearch());
                const rows = sel.some((r: any) => r.id === row.id) ? sel : (movable(side, row) ? [row] : []);
                if (!rows.length) return;
                e.dataTransfer.setData(WV_ROWS, JSON.stringify({ side, ids: rows.map((r: any) => r.id) }));
                e.dataTransfer.effectAllowed = "move";
            } catch (_) {}
        };
        const zoneAccepts = (dt: any) => { try { return !!dt && (dt.types.includes("zotero/collection") || dt.types.includes("zotero/search") || dt.types.includes(WV_ROWS)); } catch (_) { return false; } };
        const dropObjects = (dt: any): any[] => {
            const objs: any[] = [];
            try {
                if (dt.types.includes(WV_ROWS)) {
                    const { side, ids } = JSON.parse(dt.getData(WV_ROWS) || "{}");
                    const src = trees[side];
                    for (const id of ids || []) {
                        const i = src ? src.getRowIndexByID(id) : false;
                        if (i === false || i == null) continue;
                        const r = src.getRow(i);
                        if (r) objs.push(virt(r) ? r : r.ref);
                    }
                } else {
                    const dd = (Zotero as any).DragDrop.getDataFromDataTransfer(dt);
                    if (dd.dataType === "zotero/collection") { for (const id of dd.data) { const c: any = Zotero.Collections.get(id); if (c) objs.push(c); } }
                    else if (dd.dataType === "zotero/search") { for (const id of dd.data) { const s: any = Zotero.Searches.get(id); if (s) objs.push(s); } }
                }
            } catch (_) {}
            return objs;
        };
        const wireZone = (side: string, pane: any) => {
            // A drag that ends elsewhere -- Escape, a drop outside the window,
            // a drop on a row or on the other pane -- sends this pane neither
            // dragleave nor drop, and the lit zone stayed lit (MJT 2026-10-21:
            // "what is the blue line around SHOWN?"). dragover repeats while
            // the pointer is over the zone, so a lit zone unlights itself
            // 400 ms after the last one.
            let unlit: any = null;
            const mark = (on: boolean) => {
                pane.classList.toggle("wv-hid-mgr-dropzone", on);
                if (unlit) { w.clearTimeout(unlit); unlit = null; }
                if (on) unlit = w.setTimeout(() => { unlit = null; pane.classList.remove("wv-hid-mgr-dropzone"); }, 400);
            };
            pane.addEventListener("dragover", (e: any) => {
                if (onRow(e)) { mark(false); return; }   // the row's own drop (Zotero's)
                if (!zoneAccepts(e.dataTransfer)) return;
                e.preventDefault();
                try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
                mark(true);
            });
            pane.addEventListener("dragleave", (e: any) => { if (!e.relatedTarget || !pane.contains(e.relatedTarget)) mark(false); });
            pane.addEventListener("drop", (e: any) => {
                mark(false);
                if (onRow(e) || !zoneAccepts(e.dataTransfer)) return;
                e.preventDefault(); e.stopPropagation();
                const objs = dropObjects(e.dataTransfer);
                if (!objs.length) return;
                swallow(side === "right" ? P._wvHidHide(objs, win) : showObjs(objs));
            });
        };
        leftHost.addEventListener("dragstart", onHostDragStart("left"), true);
        rightHost.addEventListener("dragstart", onHostDragStart("right"), true);
        wireZone("left", left); wireZone("right", right);
        // ---- A drop on a ROW is Zotero's own move (dragAndDrop above), and
        // the PANE it lands in decides the hidden state (MJT 2026-10-21: "I
        // should be able to reorganize hidden collections in the Hidden part.
        // So a drag to a grey line should still work, just making it hidden
        // in that library or collection" -- a grey row is a shown ancestor
        // kept as context, so a drop on it alone left the collection shown
        // and it never appeared on the right); the Shown pane shows what
        // lands on its rows, the counterpart. Then the target expands and the
        // moved collection is selected in THAT tree, as the collections pane
        // does (MJT 2026-10-21: "it should automatically expand, as in the
        // collections pane") -- the pane gets it from the moved row staying
        // selected through its re-add (collectionTree.jsx notify ->
        // selectByID -> expandToCollection), but here the dragged row may
        // belong to the OTHER tree. A drop into another library is Zotero's
        // COPY: the copy, found through the linked-collection relation Zotero
        // records, is what is hidden / shown and selected. Zotero's own refusals
        // (canDrop: not a collection or library row, onto itself or a
        // descendant) come back false and nothing more happens.
        const wireRowDrop = (side: string, t: any) => {
            const proto = Object.getPrototypeOf(t);
            t.onDrop = async function (this: any, e: any, index: number) {
                let target: any = null, objs: any[] = [];
                try { target = this.getRow(index); } catch (_) {}
                try {
                    const dd = (Zotero as any).DragDrop.getDataFromDataTransfer(e.dataTransfer);
                    if (dd && (dd.dataType === "zotero/collection" || dd.dataType === "zotero/search")) objs = dropObjects(e.dataTransfer);
                } catch (_) {}
                const r = await proto.onDrop.call(this, e, index);
                if (r === false || w.closed || !target || !objs.length || !target.ref) return r;
                try {
                    if (!((target.isCollection && target.isCollection()) || (target.isLibrary && target.isLibrary(true)))) return r;
                    const libID = target.ref.libraryID;
                    const landed: any[] = [];
                    for (const o of objs) {
                        if (!o || o.libraryID == null) continue;
                        if (o.libraryID === libID) { landed.push(o); continue; }
                        try { const c = typeof o.getLinkedCollection === "function" ? await o.getLinkedCollection(libID, true) : null; if (c) landed.push(c); } catch (_) {}
                    }
                    if (!landed.length) return r;
                    // The target open BEFORE any refresh, which captures the
                    // trees' visible expansion (visibleOpenState) and reloads from it.
                    try {
                        const i2 = this.getRowIndexByID(target.id);
                        if (i2 !== false && i2 != null && !this.isContainerEmpty(i2) && !this.isContainerOpen(i2)) await this.toggleOpenState(i2);
                    } catch (_) {}
                    openState[target.id] = true;
                    if (side === "right") await P._wvHidHide(landed, win); else await showObjs(landed);
                    try { await pending; } catch (_) {}
                    const t2 = trees[side];
                    if (!t2 || w.closed) return r;
                    const ids = landed.map((o: any) => (o.objectType === "search" ? "S" : "C") + o.id);
                    // selectByID expands to the row (the pane's own path), so a
                    // row under a CLOSED target needs no wait -- the earlier
                    // wait for it to be visible ran its full 2 s there (MJT
                    // 2026-10-21: "a time delay before Outline got expanded").
                    // A few short retries cover the trees' own notify still in
                    // flight; selectByID answers false while the row is unknown.
                    let first = true;
                    for (const id of ids) {
                        if (first) {
                            first = false;
                            let ok = false;
                            for (let k = 0; k < 10 && !ok && !w.closed; k++) {
                                try { ok = (await t2.selectByID(id)) !== false; } catch (_) { ok = false; }
                                if (!ok) await new Promise((res) => w.setTimeout(res, 100));
                            }
                            continue;
                        }
                        const i3 = t2.getRowIndexByID(id);
                        if (i3 !== false && i3 != null) t2.selection.toggleSelect(i3);
                    }
                } catch (err) { Zotero.debug("[Weavero] manager row drop err: " + err); }
                return r;
            };
        };
        wireRowDrop("left", trees.left); wireRowDrop("right", trees.right);
        decorate("left"); decorate("right");
        rightEmpty.hidden = trees.right.rowCount > 0;
        syncButtons();
        w._wvHidMgrTrees = trees;
        // ---- The collections pane's reading aids in both trees, under the
        // same settings (MJT 2026-10-21: "Can you do the same pinning in the
        // Hidden Manager?"): the pinned parents (sticky scroll) and the
        // indent guides with their header skip. No path tooltips: a row's
        // title here is the manager's own reason or hint (decorate). Each
        // tree is an aids target (_wvCollAidsPaneTarget documents the shape);
        // re-applied from _wvApplyCollectionsTreeAids on a pref change.
        const aids: any = { left: {}, right: {} };
        const aidsTarget = (side: string): any => {
            const host = side === "left" ? leftHost : rightHost;
            const t = trees[side];
            const tree = host.querySelector("#collection-tree") || host.querySelector(".virtualized-table");
            if (!t || !tree) return null;
            return {
                win: w, doc, tree, cv: t, st: aids[side], overlayId: "wv-hid-mgr-sticky-" + side,
                view: () => trees[side],
                refresh: () => { const x = aidsTarget(side); if (x) P._wvCollAidsRender(x); },
                // A pinned copy of a context row (grey italics) looks the part.
                decorateRow: (rowEl: any, idx: number) => { let tr: any = null; try { tr = t.getRow(idx); } catch (_) {} if (why(side, tr)) rowEl.classList.add("wv-hid-fixed"); },
                // Right-click: the manager's own menu for the row, selected
                // first as Zotero's row handler selects it (selection.select
                // refuses a row isSelectable refuses) -- with its events
                // suppressed, so the tree does not scroll to the row (the
                // pinned copy stands for it); the release fires the
                // selection change (onSel: one selection, the buttons) and
                // the repaint.
                onContext: (e: any, now: number) => {
                    try {
                        if (!t.selection.isSelected(now)) {
                            t.selection.selectEventsSuppressed = true;
                            try { t.selection.select(now); } finally { t.selection.selectEventsSuppressed = false; }
                        }
                    } catch (_) {}
                    openCtx(side, e, e.screenX, e.screenY);
                },
            };
        };
        const applyAids = () => {
            const sticky = !!P._getCollectionsTreeAid("collectionsStickyParents");
            const guides = !!P._getCollectionsTreeAid("collectionsIndentGuides");
            leftHost.classList.toggle("wv-indent-guides", guides); rightHost.classList.toggle("wv-indent-guides", guides);
            for (const side of ["left", "right"]) {
                const tgt = aidsTarget(side);
                if (!tgt) continue;
                if (sticky || guides) P._wvCollAidsWire(tgt, { sticky, tips: false, guides }); else P._wvCollAidsUnwireTarget(tgt);
            }
        };
        try { applyAids(); } catch (e) { Zotero.debug("[Weavero] manager aids err: " + e); }
        w._wvHidMgrApplyAids = applyAids;
        w._wvHidMgrAids = aids;   // the two trees' aid states, for the specs and the bridge

        // Filter both trees (collectionTree.setFilter: context rows, opened
        // branches, the earlier layout back when cleared).
        const applyFilter = () => {
            const v = String(search.value || "");
            const runs = ["left", "right"].map((side: string) => {
                try { return Promise.resolve(trees[side].setFilter(v)); } catch (e) { return Promise.reject(e); }
            });
            // setFilter reselects with its events suppressed: the buttons
            // and marks are brought up to date once both trees are done.
            Promise.allSettled(runs).then((res: any[]) => {
                for (const r of res) if (r.status === "rejected") Zotero.debug("[Weavero] manager filter err: " + r.reason);
                if (w.closed) return;
                decorate("left"); decorate("right");
                syncButtons();
            });
        };
        search.addEventListener(search.localName === "search-textbox" ? "command" : "input", applyFilter);
        // Enter / Down in the box: into the first tree with a match.
        search.addEventListener("keydown", (e: any) => {
            if (e.key !== "ArrowDown" && e.key !== "Enter") return;
            for (const side of ["left", "right"]) {
                const t = trees[side];
                if (!t || !t.rowCount) continue;
                let i = 0;
                try {
                    if (search.value) {
                        i = -1;
                        for (let k = 0; k < t.rowCount; k++) { if (t._matchesFilter(t.getRow(k)).matchesFilter && t.isSelectable(k)) { i = k; break; } }
                    }
                } catch (_) {}
                if (i < 0) continue;
                e.preventDefault(); e.stopPropagation();
                try { t.selection.select(i); t.tree.focus(); } catch (_) {}
                return;
            }
        });

        // A change of the hidden set (here, from the menus, or another
        // window's store): both trees again, the selection kept by row where
        // it still exists, else the row now at the cursor's place (Zotero
        // after a removal).
        let pending: any = null;
        const refresh = async () => {
            if (w.closed) return;
            computeSets();
            // Expansion: what each tree shows now goes into the shared map
            // first (a row moving across carries its state), then each tree
            // reloads from the map, its own rows' states on top.
            const own: any = {};
            for (const side of ["left", "right"]) {
                if (!trees[side]) continue;
                own[side] = visibleOpenState(trees[side]);
                Object.assign(openState, own[side]);
            }
            remember();
            for (const side of ["left", "right"]) {
                const t = trees[side];
                if (!t) continue;
                const ids = selectedRows(t).map((r: any) => r.id);
                const at = t.selection.focused;
                t._containerState = Object.assign({}, openState, own[side] || {});
                await reloadTree(t);
                try {
                    const idx = ids.map((id: string) => t.getRowIndexByID(id)).filter((i: any) => i !== false && i != null);
                    if (idx.length) {
                        t.selection.selectEventsSuppressed = true;
                        t.selection.clearSelection();
                        for (const i of idx) t.selection.toggleSelect(i);
                        t.selection.selectEventsSuppressed = false;
                    } else if (ids.length && t.rowCount) {
                        // Only for a pane that HAD a selection (its rows moved
                        // or vanished): a pane without one stays without one,
                        // the other pane holding the window's single selection.
                        let i = Math.min(Math.max(0, at), t.rowCount - 1);
                        while (i > 0 && !t.isSelectable(i)) i--;
                        // Suppressed like the restore above: a refresh never
                        // counts as working in this pane (onSel would clear
                        // the other pane's restored selection).
                        t.selection.selectEventsSuppressed = true;
                        t.selection.select(i);
                        t.selection.selectEventsSuppressed = false;
                    }
                } catch (_) {}
            }
            await revealRight();
            if (search.value) applyFilter();
            decorate("left"); decorate("right");
            rightEmpty.hidden = !!trees.right && trees.right.rowCount > 0;
            syncButtons();
        };
        w._wvHidMgrRender = () => {
            try { doc.title = titleFor(); } catch (_) {}   // the window count may have changed
            pending = (pending || Promise.resolve()).then(refresh, refresh).catch((e: any) => Zotero.debug("[Weavero] manager refresh err: " + e));
            return pending;
        };
        // Zotero's own Hide / Show of a special collection while the manager
        // is open (its menu, any window): its setting is a pref.
        const prefObs: any[] = [];
        for (const key of ["duplicateLibraries", "unfiledLibraries", "recentlyReadLibraries", "retractedLibraries", "publications"]) {
            try { prefObs.push(Zotero.Prefs.registerObserver(key, () => { try { if (!w.closed) w._wvHidMgrRender(); } catch (_) {} })); } catch (_) {}
        }
        w.addEventListener("unload", () => {
            for (const id of prefObs) { try { Zotero.Prefs.unregisterObserver(id); } catch (_) {} }
            for (const mo of mos) { try { mo.disconnect(); } catch (_) {} }
            for (const side of ["left", "right"]) { try { const x = aidsTarget(side); if (x) P._wvCollAidsUnwireTarget(x); } catch (_) {} }
            // The trees' last expansion, for the next opening.
            try { for (const side of ["left", "right"]) { if (trees[side]) Object.assign(openState, visibleOpenState(trees[side])); } remember(); } catch (_) {}
            for (const side of ["left", "right"]) { try { trees[side] && trees[side].unregister(); } catch (_) {} }
        }, { once: true });
        try { search.focus(); } catch (_) {}
    }

    /** Whether the collections tree currently shows the "Group Libraries"
     *  header row (Zotero drops it when no group is left to show). */
    _wvHidGroupsHeaderShown(win: any): boolean {
        try {
            const cv = win && win.ZoteroPane && win.ZoteroPane.collectionsView;
            if (!cv || typeof cv.getRow !== "function") return false;
            for (let i = 0; i < cv.rowCount; i++) {
                const r = cv.getRow(i);
                if (r && r.isHeader && r.isHeader() && r.ref && r.ref.id === "group-libraries-header") return true;
            }
        } catch (_) {}
        return false;
    }

    /** The Group Libraries line's own menu. */
    _wvHidOpenGroupsMenu(win: any, x: number, y: number) {
        try {
            const doc = win.document;
            const old = doc.getElementById("wv-hid-groups-menu");
            if (old) old.remove();
            const groups = this._wvHidListGroups(win);
            // A hidden My Library comes back from here too (2026-10-20).
            const libs = this._wvHidListLibraries(win);
            const P: any = this;
            const pop = doc.createXULElement("menupopup");
            pop.id = "wv-hid-groups-menu";
            const mk = (label: string, fn: () => void, icon?: string) =>
                wvMenuItem(doc, { label, iconClass: icon ? "wv-hid-icon-" + icon : undefined, onCommand: () => fn() });
            // Hide the whole section -- every group, the heading with them,
            // groups joined later too (MJT 2026-10-20) -- in Zotero's own Hide
            // look; only while My Library is shown, the row to come back from.
            if (P._wvHidCanHideSection(win, "groups")) {
                let hideStr = "Hide";
                try { hideStr = Zotero.getString("general.hide") || "Hide"; } catch (_) {}
                const hi = mk(hideStr, () => P._wvHidHide([{ id: "group-libraries-header", libraryID: -1 }], win));
                hi.classList.add("menuitem-iconic", "zotero-menuitem-hide-collection");
                pop.appendChild(hi);
                pop.appendChild(doc.createXULElement("menuseparator"));
            }
            if (!groups.length && !libs.length) {
                // Nothing hidden from here: the manager is still the way to
                // hide several at once -- a plain item, as on a library row
                // (MJT 2026-10-20: "should always show the Manage Hidden option").
                const mi = mk("Manage Hidden…", () => P._wvHidOpenManager(win));
                mi.classList.add("menuitem-iconic", "wv-hid-show");
                pop.appendChild(mi);
            }
            else {
                const sm = doc.createXULElement("menu");
                sm.classList.add("menu-iconic", "wv-hid-show");
                sm.setAttribute("label", libs.length ? "Show Hidden Libraries" : "Show Hidden Group Libraries");
                const pp = doc.createXULElement("menupopup");
                pp.appendChild(mk("Manage Hidden…", () => P._wvHidOpenManager(win)));
                pp.appendChild(mk("Show All (" + (groups.length + libs.length) + ")",
                    () => P._wvHidShow(win, null, null, groups.map((g: any) => g.libraryID), libs.map((l: any) => l.libraryID))));
                pp.appendChild(doc.createXULElement("menuseparator"));
                for (const l of libs) pp.appendChild(mk(l.label, () => P._wvHidShow(win, null, null, null, [l.libraryID]), "library"));
                for (const g of groups) pp.appendChild(mk(g.label, () => P._wvHidShow(win, null, null, [g.libraryID]), "group"));
                sm.appendChild(pp);
                pop.appendChild(sm);
            }
            pop.addEventListener("popuphidden", (ev: any) => { if (ev.target === pop) pop.remove(); });
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.openPopupAtScreen(x, y, true);
        } catch (e) { Zotero.debug("[Weavero] _wvHidOpenGroupsMenu err: " + e); }
    }

    /** Shutdown / disable: unwrap every window and show everything again. */
    async _wvHidTeardown() {
        const wins = wvMainWins();
        for (const w of wins) {
            try {
                const doc = w.document;
                const cv = w.ZoteroPane && w.ZoteroPane.collectionsView;
                if (cv && Object.prototype.hasOwnProperty.call(cv, "_includedInTree")) delete cv._includedInTree;
                if (cv && Object.prototype.hasOwnProperty.call(cv, "_expandRow")) delete cv._expandRow;
                if (cv) this._wvHidUnwrapContainerEmpty(cv);
                if (cv) WV_HID_VISIBLE.delete(cv);
                const menu: any = doc.getElementById("zotero-collectionmenu");
                if (menu && menu._wvHidH) {
                    menu.removeEventListener("popupshowing", menu._wvHidH.onShow);
                    menu.removeEventListener("popuphidden", menu._wvHidH.onHide);
                    delete menu._wvHidH;
                }
                try { wvUnwrap(w.ZoteroPane, "buildCollectionContextMenu", "wv-hid"); } catch (_) {}
                const tree: any = doc.getElementById("collection-tree");
                if (tree && tree._wvHidCtx) { tree.removeEventListener("contextmenu", tree._wvHidCtx, true); delete tree._wvHidCtx; }
                if (w._wvHidMO) { try { w._wvHidMO.disconnect(); } catch (_) {} delete w._wvHidMO; }
                try { const mw = w._wvHidMgrWin; if (mw && !mw.closed) mw.close(); w._wvHidMgrWin = null; } catch (_) {}
                for (const el of Array.from(doc.querySelectorAll(".wv-hid-dot, .wv-hid-entry, " + WV_HID_OWNED + ", #wv-hid-groups-menu, #wv-hid-mgr, #wv-hid-sheet")) as any[]) { try { if (el.hidePopup) el.hidePopup(); } catch (_) {} el.remove(); }
                if (cv && cv.tree) { await cv.refresh(); cv.tree.invalidate(); cv.selection.selectEventsSuppressed = false; }
            } catch (_) {}
        }
    }

    /** The collections-tree reading aids (MJT 2026-09-25, after issue #45):
     *   - PINNED PARENTS (VS Code's tree "sticky scroll", explorer default on,
     *     7 levels there): the parents of the rows at the top of the pane stay
     *     pinned above them, outermost first, at most `collectionsStickyMax`
     *     levels (default 7, as VS Code) and never more than 40 % of the pane height --
     *     both VS Code's rules; beyond the cap the DEEPEST parents drop, like
     *     VS Code (`stickyNodes.slice(0, i)`). A click scrolls the parent's
     *     own row to just under the remaining pinned rows and selects it (VS
     *     Code's handleStickyScrollMouseEvent); its arrow collapses it.
     *   - FULL-PATH TOOLTIP on every row below the top level (the main
     *     window's root `tooltip="html-tooltip"` shows HTML titles).
     *   - INDENT GUIDES: one faint vertical line per level, drawn in each
     *     row's indent (16 px per level, the line at the parent's arrow).
     *  Zotero's tree offers no hook for any of this: an overlay inside
     *  #collection-tree, fed by the pane's scroll (capture) and a
     *  MutationObserver on the rows. Per window, re-applied on pref change. */
    _wvApplyCollectionsTreeAids(win: any) {
        try {
            const doc = win && win.document;
            const tree: any = doc && doc.getElementById("collection-tree");
            if (!tree) return;
            const P: any = this;
            const sticky = !!P._getCollectionsTreeAid("collectionsStickyParents");
            const tips = !!P._getCollectionsTreeAid("collectionsPathTooltip");
            const guides = !!P._getCollectionsTreeAid("collectionsIndentGuides");
            let st: any = win._wvCollAids;
            if (!st) st = win._wvCollAids = {};
            // Stylesheet (once per window).
            if (!doc.getElementById("wv-coll-aids-sheet")) {
                const s = wvHtmlEl(doc, "style");
                s.id = "wv-coll-aids-sheet";
                s.textContent = [
                    "#collection-tree { position: relative; }",
                    "#collection-tree.wv-indent-guides .row .cell-indent {",
                    "  align-self: stretch; display: inline-block;",
                    "  background-image: repeating-linear-gradient(to right, transparent 0 7px,",
                    "    color-mix(in srgb, currentColor 22%, transparent) 7px 8px, transparent 8px 16px);",
                    // Leading columns whose parent has no arrow (the Group
                    // Libraries header) carry no guide: --wv-guide-skip.
                    "  background-repeat: no-repeat;",
                    "  background-position: var(--wv-guide-skip, 0px) 0;",
                    "  background-size: calc(100% - var(--wv-guide-skip, 0px)) 100%;",
                    "}",
                    ...WV_COLL_STICKY_CSS,
                ].join("\n");
                (doc.documentElement || doc).appendChild(s);
            }
            tree.classList.toggle("wv-indent-guides", guides);
            // The window's open manager follows the same settings in its two
            // trees (MJT 2026-10-21: "the same pinning in the Hidden Manager").
            try { const mw = win._wvHidMgrWin; if (mw && !mw.closed && typeof mw._wvHidMgrApplyAids === "function") mw._wvHidMgrApplyAids(); } catch (_) {}
            const needWiring = sticky || tips || guides;
            if (!needWiring) { P._wvCollAidsUnwire(win); return; }
            P._wvCollAidsWire(P._wvCollAidsPaneTarget(win), { sticky, tips, guides });
        } catch (e) { Zotero.debug("[Weavero] _wvApplyCollectionsTreeAids err: " + e); }
    }

    /** The pane's tree as an aids TARGET -- the one shape the pinned parents
     *  work on; the manager's two trees are targets too (_wvHidBuildManager,
     *  2026-10-21). A target: { win, doc, tree (the #collection-tree
     *  element, where the overlay goes), cv (the view that rendered), st
     *  (the wiring state, kept across calls), overlayId, view() (the live
     *  view), refresh() (recompute + render), onContext(e, now) (a pinned
     *  row's right-click, with the row's index now), decorateRow?(rowEl,
     *  idx) }. Built afresh on every call: the pane's view is replaced when
     *  its tree re-inits. */
    _wvCollAidsPaneTarget(win: any): any {
        const st: any = win && win._wvCollAids;
        if (!st) return null;
        const P: any = this;
        const doc = win.document;
        const view = () => win.ZoteroPane && win.ZoteroPane.collectionsView;
        const cv = view();
        return {
            win, doc, tree: doc.getElementById("collection-tree"), cv, st, overlayId: "wv-coll-sticky", view,
            refresh: () => P._wvCollAidsUpdate(win),
            onContext: (e: any, now: number) => P._wvCollAidsPaneContext(win, cv, e, now),
        };
    }

    /** Recompute + render the pane's pinned parents. */
    _wvCollAidsUpdate(win: any) {
        const tgt = (this as any)._wvCollAidsPaneTarget(win);
        if (tgt) (this as any)._wvCollAidsRender(tgt);
    }

    /** Wire a target once -- the scroll (capture: the body scrolls inside the
     *  tree element), the window's resize, a MutationObserver on the rows
     *  (Zotero re-renders them on every change), the path tooltips -- and
     *  render; the flags are re-read on every call. */
    _wvCollAidsWire(tgt: any, flags: { sticky: boolean; tips: boolean; guides: boolean }) {
        const st: any = tgt && tgt.st;
        if (!st || !tgt.tree) return;
        const P: any = this;
        const win = tgt.win, tree = tgt.tree;
        // Tooltips turned off: the rows keep their attribute (Zotero resets a
        // row's content, not the row itself), so they are stripped here.
        if (st.tips && !flags.tips) { try { for (const el of Array.from(tree.querySelectorAll(".row[title]")) as any[]) el.removeAttribute("title"); } catch (_) {} }
        st.sticky = flags.sticky; st.tips = flags.tips; st.guides = flags.guides;
        if (!st.wired) {
            st.wired = true;
            st.tree = tree;
            const schedule = () => {
                if (st.pending) return;
                st.pending = win.setTimeout(() => { st.pending = null; try { tgt.refresh(); } catch (_) {} }, 0);
            };
            st.onScroll = () => { try { tgt.refresh(); } catch (_) {} };
            tree.addEventListener("scroll", st.onScroll, true);
            st.onResize = schedule;
            win.addEventListener("resize", st.onResize);
            st.mo = new win.MutationObserver((recs: any[]) => {
                // Our own overlay re-render must not re-trigger itself.
                const ov = st.overlay;
                if (ov && recs.every((r: any) => ov === r.target || ov.contains(r.target))) return;
                schedule();
            });
            st.mo.observe(tree, { childList: true, subtree: true });
            st.onOver = (e: any) => {
                try {
                    if (!st.tips) return;
                    const rowEl = e.target && e.target.closest && e.target.closest(".row");
                    if (!rowEl || (st.overlay && st.overlay.contains(rowEl))) return;
                    const m = /collection-tree-row-(\d+)$/.exec(rowEl.id || "");
                    if (!m) return;
                    const cv = tgt.view();
                    const path = cv ? P._wvCollRowPath(cv, parseInt(m[1], 10)) : null;
                    if (path) { if (rowEl.getAttribute("title") !== path) rowEl.setAttribute("title", path); }
                    else if (rowEl.hasAttribute("title")) rowEl.removeAttribute("title");
                } catch (_) {}
            };
            tree.addEventListener("mouseover", st.onOver, true);
        }
        st.lastKey = null;
        tgt.refresh();
    }

    /** Recompute + render a target's pinned parents (VS Code's
     *  findStickyState, simplified to the collections tree's uniform rows). */
    _wvCollAidsRender(tgt: any) {
        const st: any = tgt && tgt.st;
        if (!st) return;
        const win = tgt.win, doc = tgt.doc, tree = tgt.tree, cv = tgt.cv;
        const jw = cv && cv.tree && cv.tree._jsWindow;
        const pos = (i: number) => (this as any)._wvRowPos(jw, i);
        const clear = () => { if (st.overlay) { st.overlay.remove(); st.overlay = null; } st.lastKey = ""; };
        if (tree && cv) (this as any)._wvCollGuidePass(tree, cv, !!st.guides);
        if (!st.sticky || !tree || !jw || (typeof jw.getRowPosition !== "function" && typeof jw._getItemPosition !== "function")) { clear(); return; }
        const rowH = jw.itemHeight || 22;
        const P: any = this;
        P._wvCollHookReveal(jw, cv);
        const max = P._wvCollStickyMax(jw);
        const off = jw.scrollOffset || 0;
        const n = cv.rowCount || 0;
        const rowAt = (y: number) => {   // index of the row covering content offset y
            let i = Math.max(0, Math.min(n - 1, Math.floor(y / rowH)));
            while (i > 0 && pos(i) > y) i--;
            while (i + 1 < n && pos(i + 1) <= y) i++;
            return i;
        };
        let pinned: number[] = [];
        for (let iter = 0; iter < 12 && n; iter++) {
            const under = rowAt(off + pinned.length * rowH + 1);
            const chain: number[] = [];
            let p = cv.getParentIndex(under), guard = 0;
            while (p != null && p >= 0 && guard++ < 64) { chain.unshift(p); p = cv.getParentIndex(p); }
            const next: number[] = [];
            for (let k = 0; k < chain.length && k < max; k++) {
                // Pinned only once its own row has scrolled past its slot.
                if (pos(chain[k]) - off < k * rowH) next.push(chain[k]); else break;
            }
            if (next.length === pinned.length && next.every((x, i) => x === pinned[i])) break;
            pinned = next;
        }
        const key = pinned.map((i) => { const r = cv.getRow(i); return (r && r.id) + ":" + (r && r.getName()); }).join("|");
        if (key === st.lastKey && (st.overlay || !pinned.length)) return;
        st.lastKey = key;
        if (!pinned.length) { clear(); return; }
        let ov: any = st.overlay;
        if (!ov) {
            ov = st.overlay = wvHtmlEl(doc, "div");
            ov.className = "wv-coll-sticky";
            // The wv- ID matters: _wvStripWindowChrome removes [id^='wv-']
            // elements whole, but UNWRAPS class-only wv- shells holding
            // native-classed children (.row) — which dumped the pinned rows
            // into the tree on every reload/update (2026-09-25).
            ov.id = tgt.overlayId || "wv-coll-sticky";
            tree.appendChild(ov);
        }
        while (ov.firstChild) ov.firstChild.remove();
        // The rows sit inside the body's side padding (8 px today); without
        // the same padding the pinned rows ran 8 px left of their twisties
        // and the indent guides (MJT 2026-09-25). Read, never hard-coded.
        try {
            const body = tree.querySelector(".virtualized-table-body");
            if (body) {
                const cs = win.getComputedStyle(body);
                ov.style.paddingInlineStart = cs.paddingInlineStart;
                ov.style.paddingInlineEnd = cs.paddingInlineEnd;
            }
        } catch (_) {}
        pinned.forEach((idx, slot) => {
            const r = cv.getRow(idx);
            const rowEl: any = wvHtmlEl(doc, "div", "row wv-sticky-row");
            rowEl.style.height = rowH + "px";
            const skip = P._wvCollGuideSkipPx(cv, idx);
            if (skip) rowEl.style.setProperty("--wv-guide-skip", skip + "px");
            const cell = wvHtmlEl(doc, "span"); cell.className = "cell label primary";
            const ind: any = wvHtmlEl(doc, "span", "cell-indent");
            ind.style.paddingInlineStart = (16 * (cv.getLevel(idx) || 0)) + "px";
            // An arrow only where Zotero draws one (container, not empty) —
            // the Group Libraries header has a bare spacer (MJT 2026-09-25).
            let hasArrow = true;
            try { hasArrow = !!cv.isContainer(idx) && !(cv.isContainerEmpty && cv.isContainerEmpty(idx)); } catch (_) {}
            const tw: any = wvHtmlEl(doc, "span", hasArrow ? "icon icon-css icon-twisty twisty open" : "spacer-twisty");
            if (hasArrow) tw.style.pointerEvents = "auto";
            const ic = wvHtmlEl(doc, "span");
            let iconName = "collection";
            try { iconName = cv.getIconName(idx) || iconName; } catch (_) {}
            ic.className = "icon icon-css icon-" + iconName + " cell-icon";
            const tx = wvHtmlEl(doc, "span", "cell-text", r ? r.getName() : "");
            cell.appendChild(ind); cell.appendChild(tw); cell.appendChild(ic); cell.appendChild(tx);
            rowEl.appendChild(cell);
            if (st.tips) { const path = P._wvCollRowPath(cv, idx); if (path) rowEl.setAttribute("title", path); }
            if (tgt.decorateRow) { try { tgt.decorateRow(rowEl, idx); } catch (_) {} }
            const id = r && r.id;
            rowEl.addEventListener("mousedown", (e: any) => { try { e.stopPropagation(); } catch (_) {} });
            rowEl.addEventListener("click", (e: any) => {
                try {
                    e.stopPropagation();
                    const now = id != null ? cv.getRowIndexByID(id) : -1;
                    if (now === false || now < 0) return;
                    if (e.target === tw && hasArrow) { cv.toggleOpenState(now); return; }
                    // Its own row just under the remaining pinned rows, then select it.
                    jw.scrollTo(Math.max(0, pos(now) - slot * rowH));
                    cv.selection.select(now);
                } catch (_) {}
            });
            // Right-click: the row's menu, as its own row offers it (MJT
            // 2026-10-21: "When My Library is pinned by scrolling, I cannot
            // get the context menu on it by right-click") -- the target's
            // own handler, without the scroll.
            rowEl.addEventListener("contextmenu", (e: any) => {
                try {
                    e.preventDefault(); e.stopPropagation();
                    const now = id != null ? cv.getRowIndexByID(id) : -1;
                    if (now === false || now < 0) return;
                    if (tgt.onContext) tgt.onContext(e, now);
                } catch (_) {}
            });
            ov.appendChild(rowEl);
        });
    }

    /** A pinned row's right-click in the PANE. Zotero's row handler
     *  (virtualized-table _handleContextMenu) selects the row unless it
     *  already is, then hands the event to ZoteroPane.onCollectionsContextMenuOpen,
     *  which builds the menu and opens it at the pointer. The menu and its
     *  commands act on the SELECTED row, so the pinned row is selected -- for
     *  the menu's sake only (MJT 2026-10-21: "a right-click on a pinned row
     *  selects it, which is not wanted"). The pane's collection handler is
     *  held off for that select, which reaches it synchronously
     *  (collectionTree._handleSelectionChange -> _onSelectionChange -> the
     *  pane's prop), so the items list stays where it is; the previous
     *  selection comes back the same way when the menu closes with no
     *  command. A command (New Subcollection, Rename, Delete...) leaves the
     *  selection to Zotero, as from the row itself. The select runs with
     *  its events suppressed: TreeSelection.select scrolls the row into
     *  view otherwise (virtualized-table.jsx), and the pane jumped to the
     *  pinned row's own place (2026-10-21, found by the manager's spec);
     *  the setter's release fires the selection change (the held-off
     *  handler) and the repaint. */
    _wvCollAidsPaneContext(win: any, cv: any, e: any, now: number) {
        try {
            const doc = win.document;
            const zp = win.ZoteroPane;
            if (!zp || typeof zp.onCollectionsContextMenuOpen !== "function") return;
            const quiet = (fn: () => void) => {
                const own = Object.prototype.hasOwnProperty.call(zp, "onCollectionSelected");
                const orig = zp.onCollectionSelected;
                zp.onCollectionSelected = () => {};
                try { fn(); } finally { if (own) zp.onCollectionSelected = orig; else delete zp.onCollectionSelected; }
            };
            if (!(cv.selection.isSelected && cv.selection.isSelected(now))) {
                const prev: number[] = Array.from(cv.selection.selected || []);
                const prevFocused = cv.selection.focused;
                quiet(() => {
                    cv.selection.selectEventsSuppressed = true;
                    try { cv.selection.select(now); } finally { cv.selection.selectEventsSuppressed = false; }
                });
                const popup = doc.getElementById("zotero-collectionmenu");
                if (popup && prev.length) {
                    let commanded = false;
                    const onCommand = () => { commanded = true; };
                    const onHidden = (ev: any) => {
                        if (ev.target !== popup) return;
                        popup.removeEventListener("popuphidden", onHidden);
                        // A chosen item's command lands right after the
                        // hide, in the same task: decide a tick later.
                        win.setTimeout(() => {
                            popup.removeEventListener("command", onCommand, true);
                            if (commanded) return;
                            try {
                                quiet(() => {
                                    cv.selection.selectEventsSuppressed = true;
                                    cv.selection.clearSelection();
                                    for (const i of prev) if (i < cv.rowCount) cv.selection.toggleSelect(i);
                                    if (prevFocused != null && prevFocused < cv.rowCount) cv.selection.focused = prevFocused;
                                    cv.selection.selectEventsSuppressed = false;
                                });
                            } catch (_) {}
                        }, 0);
                    };
                    popup.addEventListener("command", onCommand, true);
                    popup.addEventListener("popuphidden", onHidden);
                }
            }
            zp.onCollectionsContextMenuOpen(e, e.screenX, e.screenY);
        } catch (_) {}
    }

    /** Width of the leading indent columns that get NO guide for row `idx`:
     *  a guide stands for a parent you can expand or collapse, so a parent
     *  without an arrow (the Group Libraries header: not a container) draws
     *  none (MJT 2026-09-25). Zotero shows the arrow for isContainer &&
     *  !isContainerEmpty; any ancestor has children, so isContainer decides.
     *  Such parents are top-level, so the skipped columns are a prefix. */
    _wvCollGuideSkipPx(cv: any, idx: number): number {
        try {
            let skipLevels = 0, p = cv.getParentIndex(idx), guard = 0;
            while (p != null && p >= 0 && guard++ < 64) {
                if (!cv.isContainer(p)) skipLevels = Math.max(skipLevels, (cv.getLevel(p) || 0) + 1);
                p = cv.getParentIndex(p);
            }
            return skipLevels * 16;
        } catch (_) { return 0; }
    }

    /** Stamp --wv-guide-skip on the rendered rows. Zotero REUSES row divs
     *  for other indices (innerHTML reset), so every pass rewrites or clears
     *  the stamp; the tree's MutationObserver re-runs it on each re-render. */
    _wvCollGuidePass(tree: any, cv: any, on: boolean) {
        try {
            const body = tree.querySelector(".virtualized-table-body");
            if (!body) return;
            for (const rowEl of Array.from(body.querySelectorAll(".row")) as any[]) {
                const m = on ? /collection-tree-row-(\d+)$/.exec(rowEl.id || "") : null;
                const skip = m ? (this as any)._wvCollGuideSkipPx(cv, parseInt(m[1], 10)) : 0;
                const cur = rowEl.style.getPropertyValue("--wv-guide-skip");
                if (skip) { if (cur !== skip + "px") rowEl.style.setProperty("--wv-guide-skip", skip + "px"); }
                else if (cur) rowEl.style.removeProperty("--wv-guide-skip");
            }
        } catch (_) {}
    }

    /** How many parent rows can be pinned: the pref (default 7, VS Code's), at most 10,
     *  never more than 40 % of the pane (VS Code's maxWidgetViewRatio). */
    _wvCollStickyMax(jw: any): number {
        const rowH = (jw && jw.itemHeight) || 22;
        const H = jw && typeof jw.getWindowHeight === "function" ? jw.getWindowHeight() : 0;
        let max = parseInt(String(Zotero.Prefs.get("weavero.collectionsStickyMax")), 10);
        if (!(max >= 1)) max = 7;
        return Math.min(max, 10, Math.max(0, Math.floor((H * 0.4) / rowH)));
    }

    /** Height the pinned parents cover when row `idx` sits just under them
     *  (0 with the aid off): every scroll that brings a row to the top edge
     *  must leave this much room, or the row lands under the pinned rows
     *  (MJT 2026-09-25: a "top" bookmark jump hid its own collection). */
    _wvCollPinnedPx(cv: any, idx: number): number {
        try {
            if (!(this as any)._getCollectionsTreeAid("collectionsStickyParents")) return 0;
            const jw = cv && cv.tree && cv.tree._jsWindow;
            if (!jw) return 0;
            let depth = 0, p = cv.getParentIndex(idx);
            while (p != null && p >= 0 && depth < 64) { depth++; p = cv.getParentIndex(p); }
            return Math.min(depth, (this as any)._wvCollStickyMax(jw)) * (jw.itemHeight || 22);
        } catch (_) { return 0; }
    }

    /** Zotero's own reveal (arrow keys, type-to-find, select) goes through
     *  windowed-list scrollToRow(index, force, topOffset), which already
     *  takes a top offset for its sticky section headers: widen it by the
     *  pinned parents. Instance-level, restored by _wvCollAidsUnwireTarget.
     *  `cv` is the view the list belongs to (the manager's trees are not
     *  among the main windows' views). */
    _wvCollHookReveal(jw: any, cv?: any) {
        if (!jw || jw._wvOrigScrollToRow || typeof jw.scrollToRow !== "function") return;
        const P: any = this;
        const orig = jw.scrollToRow;
        jw._wvOrigScrollToRow = orig;
        jw.scrollToRow = function (this: any, index: number, force?: boolean, topOffset?: number) {
            let off = topOffset || 0;
            try {
                const v = cv || P._wvCollViewOf(jw);
                if (v && !force) off = Math.max(off, P._wvCollPinnedPx(v, index));
            } catch (_) {}
            return orig.call(this, index, force, off);
        };
    }

    _wvCollViewOf(jw: any): any {
        for (const w of (wvMainWins()) as any[]) {
            const cv = w && w.ZoteroPane && w.ZoteroPane.collectionsView;
            if (cv && cv.tree && cv.tree._jsWindow === jw) return cv;
        }
        return null;
    }

    /** Unwire a target: its listeners and observer, the overlay, the reveal
     *  hook; the state object is emptied (a later wire starts clean). */
    _wvCollAidsUnwireTarget(tgt: any) {
        const st: any = tgt && tgt.st;
        if (!st) return;
        try {
            const cv = tgt.view ? tgt.view() : tgt.cv;
            const jw = cv && cv.tree && cv.tree._jsWindow;
            if (jw && jw._wvOrigScrollToRow) { jw.scrollToRow = jw._wvOrigScrollToRow; delete jw._wvOrigScrollToRow; }
        } catch (_) {}
        try {
            const tree: any = st.tree || tgt.tree;
            if (st.wired) {
                if (tree) {
                    tree.removeEventListener("scroll", st.onScroll, true);
                    tree.removeEventListener("mouseover", st.onOver, true);
                }
                tgt.win.removeEventListener("resize", st.onResize);
                try { st.mo.disconnect(); } catch (_) {}
                if (st.pending) { try { tgt.win.clearTimeout(st.pending); } catch (_) {} }
            }
            if (st.overlay) st.overlay.remove();
            // The tooltips are the aid's own in the pane; the manager's rows
            // carry its reasons and hints, which stay.
            if (tree && st.tips) for (const el of Array.from(tree.querySelectorAll(".row[title]")) as any[]) el.removeAttribute("title");
            if (tree) for (const el of Array.from(tree.querySelectorAll(".row")) as any[]) el.style.removeProperty("--wv-guide-skip");
        } catch (_) {}
        for (const k of Object.keys(st)) delete st[k];
    }

    _wvCollAidsUnwire(win: any) {
        const tgt = (this as any)._wvCollAidsPaneTarget(win);
        if (!tgt) return;
        (this as any)._wvCollAidsUnwireTarget(tgt);
        win._wvCollAids = { };
    }

    _wvTeardownCollectionsTreeAids() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                try { (this as any)._wvCollAidsUnwire(w); } catch (_) {}
                try {
                    const tree = w.document.getElementById("collection-tree");
                    if (tree) tree.classList.remove("wv-indent-guides");
                    const s = w.document.getElementById("wv-coll-aids-sheet");
                    if (s) s.remove();
                } catch (_) {}
                try { delete w._wvCollAids; } catch (_) {}
            }
        } catch (_) {}
    }

    _wvTeardownPaneDragNoCollapse() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                for (const id of ["zotero-collections-splitter", "zotero-items-splitter", "zotero-context-splitter"]) {
                    try {
                        const sp: any = w.document && w.document.getElementById(id);
                        if (sp && sp.hasAttribute("data-wv-collapse")) {
                            sp.setAttribute("collapse", sp.getAttribute("data-wv-collapse"));
                            sp.removeAttribute("data-wv-collapse");
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    _wvApplyCollectionsPaneToggle(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            let btn: any = doc.getElementById("wv-tb-toggle-collections-pane");
            const pane = doc.getElementById("zotero-collections-pane");
            const splitter = doc.getElementById("zotero-collections-splitter");
            if (!(this as any)._getCollectionsPaneToggle() || !pane) {
                if (btn) btn.remove();
                // Button off: Zotero's full-width band is the way back again.
                try { if (splitter) splitter.removeAttribute("wv-thin"); } catch (_) {}
                try { if (win._wvCollPaneObs) { win._wvCollPaneObs.disconnect(); delete win._wvCollPaneObs; } } catch (_) {}
                return;
            }
            const collBar = doc.getElementById("zotero-collections-toolbar");
            const itemsBar = doc.getElementById("zotero-items-toolbar");
            if (!collBar || !itemsBar) return;
            if (!btn) {
                btn = doc.createXULElement("toolbarbutton");
                btn.id = "wv-tb-toggle-collections-pane";
                btn.className = "zotero-tb-button";
                btn.setAttribute("tabindex", "-1");
                btn.setAttribute("tooltiptext", "Toggle Collections Pane");
                btn.style.listStyleImage = 'url("chrome://zotero/skin/20/universal/sidebar.svg")';
                // Zotero's id-mapped buttons get `fill: currentColor` from
                // their SCSS rule; without it the glyph's context-fill paints
                // black in the dark theme (measured 2026-09-22).
                btn.style.fill = "currentColor";
                btn.addEventListener("command", () => {
                    try {
                        const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (live && !live._wvDestroyed) live._wvCollectionsPaneToggle(win);
                    } catch (e) {}
                });
            }
            // The button reopens the pane, so the collapsed splitter's drag band
            // shrinks to 1 px (CSS in constants.ts keys on this attribute).
            try { if (splitter && !splitter.hasAttribute("wv-thin")) splitter.setAttribute("wv-thin", "true"); } catch (_) {}
            const collapsed = pane.hasAttribute("collapsed");
            const home = collapsed ? itemsBar : collBar;
            if (btn.parentNode !== home || home.firstChild !== btn) home.insertBefore(btn, home.firstChild);
            btn.style.marginInlineStart = "0px";
            // Zotero's toolbar buttons keep an 8-px rhythm (`margin: 0 4px`
            // each). New Collection carries no margin, New Item carries 4.
            btn.style.marginInlineEnd = collapsed ? "4px" : "8px";
            if (collapsed) {
                // Match the open-state offset: the collections toolbar's inset
                // (its container's padding, the pane sits at x = 0).
                let target = 8;
                try {
                    const tb = doc.getElementById("zotero-toolbar-collection-tree");
                    const v = tb && parseFloat(win.getComputedStyle(tb).paddingInlineStart);
                    if (v != null && !isNaN(v)) target = Math.round(v);
                } catch (_) {}
                const fix = () => {
                    try {
                        btn.style.marginInlineStart = "0px";
                        const l = Math.round(btn.getBoundingClientRect().left);
                        if (l !== target) btn.style.marginInlineStart = (target - l) + "px";
                    } catch (_) {}
                };
                fix();
                try { win.requestAnimationFrame(fix); } catch (_) {}
            }
            if (!win._wvCollPaneObs) {
                const obs = new win.MutationObserver(() => {
                    try {
                        const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (live && !live._wvDestroyed) live._wvApplyCollectionsPaneToggle(win);
                    } catch (e) {}
                });
                obs.observe(pane, { attributes: true, attributeFilter: ["collapsed"] });
                win._wvCollPaneObs = obs;
            }
        } catch (e) { Zotero.debug("[Weavero] _wvApplyCollectionsPaneToggle err: " + e); }
    }

    /** Issue #58: a handle on the Tag Selector's top edge -- a pill just
     *  under Zotero's own tags splitter (constants.ts `.wv-ts-handle`), so
     *  nothing in the layout moves and the band around it still drags. A
     *  click on the pill collapses or expands the selector THROUGH THE
     *  SPLITTER'S STATE, the way a drag shut does: the selector object
     *  stays, its selection stays, the list stays filtered, View -> Layout
     *  reads the same `collapsed`, and Zotero persists the state
     *  (zotero-persist on the splitter). The pill is a fixed-position host
     *  at the END of the pane, placed from the splitter's rect: a XUL
     *  splitter paints neither children nor generated content (2026-10-14),
     *  it captures the mouse on press (a child's click would land on it),
     *  and it collapses its IMMEDIATE sibling (a host next to it would be
     *  the one collapsed). `fixed="true"`: the splitter's drag writes a
     *  height on every other child of the pane (CollectChildInfos skips
     *  `fixed` and `hidden`), and MJT's first real drag left the host 0 px
     *  tall with the pill 6 px up over the tree. Per window: the splitter
     *  holds the observers, the items view's refresh signal keeps the mark
     *  honest (Zotero clears the tag filter on a collection switch).
     *  Extras -> Collections pane, default on. */
    _wvApplyTagSelectorHandle(win: any) {
        try {
            const doc = win && win.document;
            const sp: any = doc && doc.getElementById("zotero-tags-splitter");
            const ct: any = doc && doc.getElementById("zotero-tag-selector-container");
            if (!sp || !ct || !sp.parentNode) return;
            if (!(this as any)._getTagSelectorHandle()) {
                this._wvTeardownTagSelectorHandleIn(win);
                return;
            }
            if (sp.getAttribute("wv-handle") !== "true") sp.setAttribute("wv-handle", "true");
            const pane: any = sp.parentNode;
            const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
            let host: any = null;
            for (const c of pane.children) { if (c.classList && c.classList.contains("wv-ts-handle")) { host = c; break; } }
            // A XUL box, not an HTML div: the splitter's drag resizes every
            // child of the pane except XUL elements marked fixed / hidden
            // (nsSplitterFrame CollectChildInfos checks nsXULElement only --
            // an HTML host got `height: 0px` written on it, 2026-10-14). A
            // box paints ::before (a splitter does not). An older HTML host
            // from a previous build is replaced.
            if (host && host.namespaceURI !== XUL_NS) { try { wvUnlisten(host, "tsHandle:click"); host.remove(); } catch (_) {} host = null; }
            if (!host) {
                host = doc.createXULElement("box");
                host.className = "wv-ts-handle";
                host.setAttribute("fixed", "true");
                pane.appendChild(host);
            }
            else if (pane.lastElementChild !== host) pane.appendChild(host);
            // Whatever moves the splitter -- a drag (the container's height),
            // the window (the tree container's height and width), a collapse,
            // the pane or the tab going away (both report 0 x 0) -- shows up
            // as a size change on one of its two neighbours.
            if (!sp._wvTsRO && win.ResizeObserver) {
                const ro = new win.ResizeObserver(() => {
                    try { const lp: any = wvLivePlugin(); if (lp) lp._wvTagSelectorHandleRefresh(win); } catch (_) {}
                });
                ro.observe(ct);
                if (sp.previousElementSibling) ro.observe(sp.previousElementSibling);
                sp._wvTsRO = ro;
            }
            const tag = (this as any)._wvWireTag();
            wvListen(host, "tsHandle:click", "click", (e: any) => {
                try {
                    if (e.button !== 0) return;
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvTagSelectorHandleToggle(win);
                } catch (_) {}
            }, false, tag);
            // Collapses and expands from elsewhere (View -> Layout, a drag
            // shut): the mark and the tooltip follow.
            if (!sp._wvTsObs) {
                const obs = new win.MutationObserver(() => {
                    try { const lp: any = wvLivePlugin(); if (lp) lp._wvTagSelectorHandleRefresh(win); } catch (_) {}
                });
                obs.observe(ct, { attributes: true, attributeFilter: ["collapsed"] });
                sp._wvTsObs = obs;
            }
            // One listener for the window's life, resolving the live instance
            // at fire time (a reload must not stack a second).
            try {
                const iv = win.ZoteroPane && win.ZoteroPane.itemsView;
                if (iv && iv.onRefresh && sp._wvTsRefreshIv !== iv) {
                    iv.onRefresh.addListener(() => {
                        try { const lp: any = wvLivePlugin(); if (lp) lp._wvTagSelectorHandleRefresh(win); } catch (_) {}
                    });
                    sp._wvTsRefreshIv = iv;
                }
            } catch (_) {}
            this._wvTagSelectorHandleRefresh(win);
        } catch (e) { Zotero.debug("[Weavero] _wvApplyTagSelectorHandle err: " + e); }
    }

    /** Zotero bug met through Weavero's extra main windows (2026-10-17,
     *  register #32): zoteroPane.xhtml loads tagSelectorContainer.js into
     *  EVERY main window and the script assigns its class to the shared
     *  `Zotero.TagSelector` -- the last window opened wins. The class renders
     *  through ITS window's React, on that window's timers: once that window
     *  closed, `ZoteroPane.initTagSelector()` in another window (View ->
     *  Layout re-show, the handle, a drag open) awaited a render that never
     *  ran, and the Tag Selector never came back until restart. Native Zotero
     *  has one main window. Each window's own class is kept at wiring (the
     *  class's global IS its window: loadSubScript into the window). */
    _wvTagSelectorClassKeep(win: any) {
        try {
            const cls = (Zotero as any).TagSelector;
            if (cls && (Components as any).utils.getGlobalForObject(cls) === win) WV_TS_CLASS.set(win, cls);
        } catch (_) {}
    }

    /** A main window is closing: if the global class is its own (or its
     *  window is gone), hand the global to a live window's own class. */
    _wvTagSelectorClassRelease(win: any) {
        try {
            const Z: any = Zotero;
            const Cu: any = (Components as any).utils;
            const cls = Z.TagSelector;
            let owner: any = null;
            try { owner = cls ? Cu.getGlobalForObject(cls) : null; } catch (_) {}
            if (owner && owner !== win && !Cu.isDeadWrapper(owner) && !owner.closed) return;
            for (const w of (wvMainWins())) {
                if (w === win || w.closed) continue;
                const own = WV_TS_CLASS.get(w);
                if (own) { Z.TagSelector = own; return; }
            }
        } catch (e) { Zotero.debug("[Weavero] Tag Selector class hand-back err: " + e); }
    }

    /** The tags the items list is filtered by: Zotero keeps them on the
     *  collection row (collectionTreeRow.setTags), whatever the selector
     *  shows. Plural rows first (Zotero 11), the singular before it. */
    _wvTagFilterTags(win: any): string[] {
        try {
            const iv = win.ZoteroPane && win.ZoteroPane.itemsView;
            if (!iv) return [];
            const row = (iv.collectionTreeRows && iv.collectionTreeRows[0]) || iv.collectionTreeRow;
            const t = row && row.tags;
            return t ? Array.from(t) : [];
        } catch (_) { return []; }
    }

    /** The pill's place, mark and tooltip. Place: on the divider line (the
     *  splitter's bottom border) while open, on the band once collapsed;
     *  hidden while the splitter has no box. Mark: collapsed with the list
     *  filtered by a tag -- nothing else says so once the selector is out of
     *  sight. Mutation-quiet when nothing changed. */
    _wvTagSelectorHandleRefresh(win: any) {
        try {
            const doc = win && win.document;
            const sp: any = doc && doc.getElementById("zotero-tags-splitter");
            const ct: any = doc && doc.getElementById("zotero-tag-selector-container");
            if (!sp || !ct || sp.getAttribute("wv-handle") !== "true") return;
            const collapsed = ct.hasAttribute("collapsed");
            const tags = this._wvTagFilterTags(win);
            const marked = collapsed && tags.length > 0;
            const mark = marked ? "1" : "0";
            if (sp.getAttribute("data-wv-mark") !== mark) sp.setAttribute("data-wv-mark", mark);
            const tip = collapsed
                ? (marked
                    ? "Expand the Tag Selector (the list is filtered by " + (tags.length === 1 ? "the tag “" + tags[0] + "”" : tags.length + " tags") + ")"
                    : "Expand the Tag Selector")
                : "Collapse the Tag Selector (drag to resize)";
            let host: any = null;
            for (const c of sp.parentNode ? sp.parentNode.children : []) { if (c.classList && c.classList.contains("wv-ts-handle")) { host = c; break; } }
            if (!host) return;
            if (host.getAttribute("title") !== tip) host.setAttribute("title", tip);
            const r = sp.getBoundingClientRect();
            const show = r.width > 0 && r.height > 0;
            if (host.hidden !== !show) host.hidden = !show;
            if (!show) return;
            // Open: in the selector's 8 px top padding, clear of the tree's
            // last row above the divider and of the first tag row below.
            // Collapsed: the middle of the band.
            const cy = collapsed ? r.top + r.height / 2 : r.bottom + 3;
            const left = Math.round(r.left + r.width / 2 - 24) + "px";
            const top = Math.round(cy - 6) + "px";
            if (host.style.left !== left) host.style.left = left;
            if (host.style.top !== top) host.style.top = top;
        } catch (_) {}
    }

    /** Collapse or expand the Tag Selector from the handle. Collapsing is
     *  the splitter's own collapse (state -> the container's `collapsed`):
     *  the selector object, its selection and the list's filter all stay.
     *  Expanding when Zotero has no selector object -- View -> Layout hid it
     *  (toggleTagSelector uninits), or the splitter was persisted collapsed
     *  across a restart (initTagSelector skips a collapsed container;
     *  zotero#5573) -- goes through Zotero's own path (initTagSelector +
     *  setTagScope), then puts back the highlight of the tag the list is
     *  STILL filtered by: Zotero's own re-show builds an empty selector over
     *  a filtered list (verified 2026-10-14; upstream register #30). */
    async _wvTagSelectorHandleToggle(win: any) {
        try {
            const doc = win && win.document;
            const sp: any = doc && doc.getElementById("zotero-tags-splitter");
            const ct: any = doc && doc.getElementById("zotero-tag-selector-container");
            const ZP: any = win && win.ZoteroPane;
            if (!sp || !ct || !ZP) return;
            if (!ct.hasAttribute("collapsed")) {
                sp.setAttribute("state", "collapsed");
                // The splitter collapses its sibling itself (XUL); the
                // attribute is the state View -> Layout reads.
                if (!ct.hasAttribute("collapsed")) ct.setAttribute("collapsed", "true");
            }
            else {
                sp.setAttribute("state", "open");
                if (ct.hasAttribute("collapsed")) ct.removeAttribute("collapsed");
                const had = !!ZP.tagSelector;
                if (!had) await ZP.initTagSelector();
                await ZP.setTagScope();
                const ts = ZP.tagSelector;
                if (ts) {
                    if (!had) {
                        const tags = this._wvTagFilterTags(win);
                        if (tags.length && ts.getTagSelection && !ts.getTagSelection().size) {
                            ts.selectedTags = new Set(tags);
                            try { ts.forceUpdate(); } catch (_) {}
                        }
                    }
                    try { ts.handleResize(); } catch (_) {}
                }
            }
            this._wvTagSelectorHandleRefresh(win);
        } catch (e) { Zotero.debug("[Weavero] _wvTagSelectorHandleToggle err: " + e); }
    }

    /** The handle off in one window: the splitter is Zotero's again. The
     *  items-view refresh listener stays (it resolves the live plugin and
     *  finds no handle); the selector keeps whatever state it has. */
    _wvTeardownTagSelectorHandleIn(win: any) {
        try {
            const doc = win && win.document;
            const sp: any = doc && doc.getElementById("zotero-tags-splitter");
            if (!sp) return;
            sp.removeAttribute("wv-handle");
            sp.removeAttribute("data-wv-mark");
            try { if (sp._wvTsObs) { sp._wvTsObs.disconnect(); delete sp._wvTsObs; } } catch (_) {}
            try { if (sp._wvTsRO) { sp._wvTsRO.disconnect(); delete sp._wvTsRO; } } catch (_) {}
            try {
                for (const el of [...(sp.parentNode ? sp.parentNode.querySelectorAll(":scope > .wv-ts-handle") : [])]) {
                    wvUnlisten(el, "tsHandle:click");
                    el.remove();
                }
            } catch (_) {}
        } catch (_) {}
    }

    /** The collections search magnifier collapses the box on a second click.
     *  Zotero hides the button while the box is open and, if it were shown,
     *  a click would only focus the box; the box closes on blur when empty.
     *  With the box on its own line (constants.ts) the button keeps its
     *  place at the end of row 1 -- the natural spot to close from (MJT,
     *  2026-09-22: "so that it can be collapsed back from another click at
     *  the same position"). Capture on the toolbar, ahead of Zotero's own
     *  listener on the button: clear the filter, blur, hide. The button
     *  carries `open` while the box shows (Zotero's pressed look).
     *
     *  A REAL click is mousedown first: the box loses focus, Zotero's blur
     *  handler closes it (when empty), and by the time `click` arrives the
     *  box is closed -- Zotero's listener then opens it again (MJT,
     *  2026-09-22: "a second click on the magnifier opens it again"). So a
     *  box that blur-closed within the last 350 ms belongs to this gesture,
     *  and the click is swallowed.
     *
     *  Ctrl+F / ⌘F with the focus in the collections pane opens THIS box,
     *  not the items quick search (MJT, 2026-09-22): a capture keydown on
     *  the window runs before Zotero's <key> (GlobalKeyListener sits in the
     *  system group and yields once the event is default-prevented).
     *
     *  An empty box closes on blur (Zotero's listener, registered by
     *  function reference at init -- so it is swapped, not wrapped). A blur
     *  because the WINDOW lost focus -- Settings, another window -- keeps
     *  the box: it was opened on purpose and is there again on return,
     *  focused (MJT, 2026-09-22: toggling a setting closed it). A blur
     *  inside the window still closes it, as Zotero does. */
    _wvWireCollectionsSearchToggle(win: any) {
        try {
            const doc = win && win.document;
            const bar = doc && doc.getElementById("zotero-collections-toolbar");
            const field = doc && doc.getElementById("zotero-collections-search");
            const sbtn = doc && doc.getElementById("zotero-tb-collections-search");
            if (!bar || !field || !sbtn || doc._wvCollSearchWired) return;
            doc._wvCollSearchWired = true;
            const onClick = (e: any) => {
                try {
                    if (!(e.target && e.target.closest && e.target.closest("#zotero-tb-collections-search"))) return;
                    if (!field.classList.contains("visible")) {
                        // Closed by this gesture's own mousedown/blur: done.
                        if (Date.now() - (doc._wvCollSearchClosedAt || 0) < 350) { e.stopPropagation(); e.preventDefault(); }
                        return;   // otherwise Zotero opens it
                    }
                    e.stopPropagation();
                    e.preventDefault();
                    field.value = "";
                    try { win.ZoteroPane.collectionsView.setFilter(""); } catch (_) {}
                    try { field.blur(); } catch (_) {}
                    try { win.ZoteroPane.hideCollectionSearch(); } catch (_) {}
                } catch (_) {}
            };
            bar.addEventListener("click", onClick, true);
            const onKey = (ke: any) => {
                try {
                    const accel = wvAccel(ke);
                    if (!accel || ke.shiftKey || ke.altKey || String(ke.key).toLowerCase() !== "f") return;
                    const pane = doc.getElementById("zotero-collections-pane");
                    const ae = doc.activeElement;
                    if (!pane || !ae || !pane.contains(ae) || pane.hasAttribute("collapsed")) return;   // elsewhere: Zotero's find
                    ke.preventDefault();
                    ke.stopPropagation();
                    if (field.classList.contains("visible")) { try { field.focus(); field.select && field.select(); } catch (_) {} }
                    else sbtn.click();   // Zotero opens and focuses it
                } catch (_) {}
            };
            win.addEventListener("keydown", onKey, true);
            doc._wvCollSearchKeyHandler = onKey;   // for the guard (trusted keys cannot be made in a spec)
            const ZP: any = win.ZoteroPane, origHide = ZP && ZP.hideCollectionSearch;
            const onBlur = (ev: any) => {
                try {
                    if (!doc.hasFocus()) return;   // the window lost focus: keep the box
                    if (origHide) origHide.call(ZP, ev);
                } catch (_) {}
            };
            if (origHide) { field.removeEventListener("blur", origHide); field.addEventListener("blur", onBlur); }
            let wasVisible = field.classList.contains("visible");
            const obs = new win.MutationObserver(() => {
                try {
                    const vis = field.classList.contains("visible");
                    if (vis) sbtn.setAttribute("open", "true");
                    else sbtn.removeAttribute("open");
                    if (wasVisible && !vis) doc._wvCollSearchClosedAt = Date.now();
                    if (!wasVisible && vis) {
                        // Zotero enables and focuses the box only 250 ms after
                        // revealing it -- the length of its own max-width
                        // animation, which the full-width line no longer has.
                        // Focus at once; Zotero's later pass is a no-op (MJT,
                        // 2026-09-22: "why the delay before the blue line").
                        field.removeAttribute("disabled");
                        field.classList.remove("expanding");
                        try { field.focus(); } catch (_) {}
                    }
                    wasVisible = vis;
                } catch (_) {}
            });
            obs.observe(field, { attributes: true, attributeFilter: ["class"] });
            doc._wvCollSearchUnwire = () => {
                try { bar.removeEventListener("click", onClick, true); } catch (_) {}
                try { win.removeEventListener("keydown", onKey, true); } catch (_) {}
                delete doc._wvCollSearchKeyHandler;
                if (origHide) { try { field.removeEventListener("blur", onBlur); field.addEventListener("blur", origHide); } catch (_) {} }
                try { obs.disconnect(); } catch (_) {}
                try { sbtn.removeAttribute("open"); } catch (_) {}
                delete doc._wvCollSearchWired; delete doc._wvCollSearchUnwire;
            };
        } catch (e) { Zotero.debug("[Weavero] _wvWireCollectionsSearchToggle err: " + e); }
    }

    /** Reader tab: Ctrl/Cmd+F with focus on chrome OUTSIDE the reader (the
     *  item pane on the right, the context pane's sidenav, the tab strip...)
     *  opens the reader's find bar. Zotero binds `key_find` to `cmd_find` in
     *  every tab, and cmd_find selects the library's quick-search box --
     *  invisible in a reader tab, so nothing happened (MJT, 2026-09-23);
     *  only the Edit menu's reader entry calls toggleFindPopup. Focus INSIDE
     *  an embedded document (the reader itself, a note editor, a preview)
     *  is left to that document. Cascades from the Extras master. */
    _wvWireReaderFindKey(win: any) {
        try {
            const doc = win && win.document;
            if (!doc || doc._wvReaderFindKeyHandler) return;
            const route = (tabType: string, active: any, readerBrowser: any) => {
                if (tabType !== "reader") return false;
                if (!active || active === doc.body || active === doc.documentElement) return true;   // nothing focused: the tab itself
                const ln = active.localName;
                if (ln === "browser" || ln === "iframe") return false;   // an embedded document handles its own keys
                if (readerBrowser && readerBrowser.contains && readerBrowser.contains(active)) return false;
                return true;
            };
            const onKey = (ke: any) => {
                try {
                    const accel = wvAccel(ke);
                    if (!accel || ke.shiftKey || ke.altKey || String(ke.key).toLowerCase() !== "f") return;
                    const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!p || p._wvDestroyed || !p._getEnableVisualExtras()) return;
                    const tabs = win.Zotero_Tabs;
                    if (!tabs || tabs.selectedType !== "reader") return;
                    const reader = (Zotero as any).Reader.getByTabID(tabs.selectedID);
                    if (!reader || typeof reader.toggleFindPopup !== "function") return;
                    if (!route("reader", doc.activeElement, reader._iframe)) return;
                    ke.preventDefault();
                    ke.stopPropagation();
                    reader.toggleFindPopup({ open: true });
                } catch (_) {}
            };
            win.addEventListener("keydown", onKey, true);
            doc._wvReaderFindKeyHandler = onKey;   // for the guard (trusted keys cannot be made in a spec)
            doc._wvReaderFindRoute = route;
            doc._wvReaderFindUnwire = () => {
                try { win.removeEventListener("keydown", onKey, true); } catch (_) {}
                delete doc._wvReaderFindKeyHandler; delete doc._wvReaderFindRoute; delete doc._wvReaderFindUnwire;
            };
        } catch (e) { Zotero.debug("[Weavero] _wvWireReaderFindKey err: " + e); }
    }

    _wvUnwireReaderFindKey() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) { try { const d = w.document; if (d && d._wvReaderFindUnwire) d._wvReaderFindUnwire(); } catch (e) {} }
        } catch (e) {}
    }

    _wvUnwireCollectionsSearchToggle() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) { try { const d = w.document; if (d && d._wvCollSearchUnwire) d._wvCollSearchUnwire(); } catch (e) {} }
        } catch (e) {}
    }

    /** View -> Layout -> Collections Pane's own logic (standalone.js
     *  onViewMenuItemClick): splitter state + pane `collapsed`, then
     *  updateLayoutConstraints -- so the menu's checkbox and pane.persist
     *  stay in step with the button. */
    _wvCollectionsPaneToggle(win: any) {
        try {
            const doc = win && win.document;
            const pane = doc && doc.getElementById("zotero-collections-pane");
            const sp = doc && doc.getElementById("zotero-collections-splitter");
            if (!pane || !sp) return;
            if (pane.hasAttribute("collapsed")) {
                sp.setAttribute("state", "open");
                pane.removeAttribute("collapsed");
            } else {
                sp.setAttribute("state", "collapsed");
                wvSetBoolAttr(pane, "collapsed", true);   // the literal "true": Zotero 10 ignores toggleAttribute's "" (lib/dom.ts)
            }
            try { win.ZoteroPane.updateLayoutConstraints(); } catch (_) {}
            // Re-home now (the observer does it too, a microtask later).
            try { this._wvApplyCollectionsPaneToggle(win); } catch (_) {}
        } catch (e) { Zotero.debug("[Weavero] _wvCollectionsPaneToggle err: " + e); }
    }

    _wvTeardownCollectionsPaneToggle() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                try { const b = w.document && w.document.getElementById("wv-tb-toggle-collections-pane"); if (b) b.remove(); } catch (e) {}
                try { const s = w.document && w.document.getElementById("zotero-collections-splitter"); if (s) s.removeAttribute("wv-thin"); } catch (e) {}
                try { if (w._wvCollPaneObs) { w._wvCollPaneObs.disconnect(); delete w._wvCollPaneObs; } } catch (e) {}
            }
        } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEMPORARY BACKPORT — REMOVE WHEN ZOTERO SHIPS IT  (grep tag: WV-TEMP-133039)
    // Zotero 896a3f829 (Dan Stillman, 2026-10-13, main; NOT in
    // 11.0-beta.1+b0db83d9d), "Clear stuck drag-and-drop row highlight in
    // trees" -- forums 133039 and 134011, upstream register #23. Both trees
    // remember the drop target by row INDEX (`_dropRow`), cleared only on the
    // row's dragleave, on drop and on dragend; a drag that ends without those
    // reaching the tree (an external file taken out of the window fast) left
    // a grey row -- at the same position in every collection -- until the
    // next drag. The commit's fix, mirrored: clear the indicator on the
    // tree's next mousemove (no mousemove fires during a native drag, so one
    // with a drop row still set means the drag ended unseen), and whenever
    // the items list's rows change (`handleRowModelUpdate`, index-based).
    // MJT 2026-10-19: "include that fix into Weavero for me to test".
    //
    // BEYOND the commit (MJT 2026-10-19, "Can you make a better fix?"): the
    // dev.54 drag ring showed WHY the row sticks -- Gecko skips a row's
    // dragleave when the pointer leaves it fast; the next drag event lands on
    // another element (the item pane's text box) with no leave for the row,
    // four times in one drag. The commit's mousemove clear then waits for the
    // pointer to come back over THAT tree (the collections pane's row stayed
    // grey while the user worked in the items list). So a tree's drop row is
    // also cleared as soon as a drag event targets anything OUTSIDE the tree,
    // or leaves the window (a dragleave / dragexit without a relatedTarget):
    // the grey goes during the drag, before the drop, in both trees. And
    // since Gecko can skip every leave when the drag exits the window
    // straight from a row (dev.55 ring), a watchdog checks Gecko's drag
    // session every 250 ms while a tree holds a drop row: once no drag is
    // on, the row is stale.
    //
    // RETIRE the mousemove / rows-change part WHEN the trees carry Zotero's
    // own `_clearDropIndicator` (it then installs nothing;
    // test/stuck-drop-row.spec.js's tripwire says when). The drag-event part
    // stays until Zotero clears on drag events too.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireStuckDropRowFix(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            if (!ZP) return;
            const tag = this._wvWireTag();
            const clear = (tree: any) => {
                try {
                    const r = tree._dropRow;
                    if (r === null || r === undefined) return;
                    // Zotero's own clear once it ships (896a3f829), else its twin.
                    if (typeof tree._clearDropIndicator === "function") { tree._clearDropIndicator(); return; }
                    tree._dropRow = null;
                    // A row that no longer exists goes with the next full render.
                    if (tree.tree && r < tree.rowCount) tree.tree.invalidateRow(r);
                } catch (_) {}
            };
            const trees = (): Array<[string, any]> => [["items", ZP.itemsView], ["collections", ZP.collectionsView]];
            // Gecko's drag session for this window: it ends when the drag
            // leaves the window or drops, whatever events it skipped.
            const sessionOn = (): boolean => {
                try {
                    const ds = (Components as any).classes["@mozilla.org/widget/dragservice;1"].getService((Components as any).interfaces.nsIDragService);
                    let ses: any = null;
                    try { ses = ds.getCurrentSession(win); } catch (_) { ses = ds.getCurrentSession(); }
                    return !!ses;
                } catch (_) { return true; }   // unknown: never clear on a guess
            };
            // While a tree holds a drop row, check every 250 ms that a drag is
            // still on; once it is over, the row is stale. (dev.55 ring, MJT's
            // real drag: dragover on row 20, then the drag left the window
            // with NO leave at all -- only a dragexit on the tab bar.)
            let watch: any = null;
            try { const prev = WV_DROP_WATCH.get(win); if (prev) prev(); } catch (_) {}
            WV_DROP_WATCH.set(win, () => { if (watch) { try { win.clearTimeout(watch); } catch (_) {} watch = null; } });
            const arm = () => {
                if (watch) return;
                const tick = () => {
                    watch = null;
                    try {
                        if (!trees().some(([, t]) => t && t._dropRow != null)) return;
                        if (!sessionOn()) { for (const [, t] of trees()) if (t) clear(t); return; }
                        watch = win.setTimeout(tick, 250);
                    } catch (_) {}
                };
                try { watch = win.setTimeout(tick, 250); } catch (_) { watch = null; }
            };
            // A drag event over anything outside a tree, or leaving the
            // window: that tree's drop row is stale (Gecko skipped its
            // dragleave). Capture on the window, so no handler below can
            // keep it from us; cheap -- a contains() only while a row is set.
            const onDragElsewhere = (e: any) => {
                try {
                    // A leave / exit with no related target: the drag left the
                    // window (dev.55: a dragexit on the tab bar was the only one).
                    const leaving = e.type === "dragleave" || e.type === "dragexit";
                    if (leaving && e.relatedTarget) return;   // within the window: the next dragenter / dragover decides
                    for (const [name, tree] of trees()) {
                        if (!tree || tree._dropRow == null || !tree.domEl) continue;
                        if (!leaving && tree.domEl.contains(e.target)) continue;
                        clear(tree);
                    }
                    if (!leaving) arm();
                } catch (_) {}
            };
            for (const t of ["dragenter", "dragover", "dragleave", "dragexit"]) wvListen(win, "stuckDropRow:" + t, t, onDragElsewhere, true, tag);
            for (const [name, tree] of [["items", ZP.itemsView], ["collections", ZP.collectionsView]] as Array<[string, any]>) {
                if (!tree || !tree.domEl || typeof tree._clearDropIndicator === "function") continue;
                wvListen(tree.domEl, "stuckDropRow:" + name, "mousemove", () => clear(tree), { passive: true }, tag);
            }
            const iv = ZP.itemsView;
            if (iv && typeof iv._clearDropIndicator !== "function") {
                // Row indexes are about to change: the index-based highlight goes.
                wvWrap(iv, "handleRowModelUpdate", "stuckDropRow", tag, (orig: any) => function (this: any, ...args: any[]) {
                    clear(this);
                    return orig.apply(this, args);
                });
            }
        } catch (e) { Zotero.debug("[Weavero] _wvWireStuckDropRowFix err: " + e); }
    }

    _wvTeardownStuckDropRowFix() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                const ZP = w && w.ZoteroPane;
                if (!ZP) continue;
                for (const [name, tree] of [["items", ZP.itemsView], ["collections", ZP.collectionsView]] as Array<[string, any]>) {
                    try { if (tree && tree.domEl) wvUnlisten(tree.domEl, "stuckDropRow:" + name); } catch (e) {}
                }
                for (const t of ["dragenter", "dragover", "dragleave", "dragexit"]) { try { wvUnlisten(w, "stuckDropRow:" + t); } catch (e) {} }
                try { const cancel = WV_DROP_WATCH.get(w); if (cancel) { cancel(); WV_DROP_WATCH.delete(w); } } catch (e) {}
                try { if (ZP.itemsView) wvUnwrap(ZP.itemsView, "handleRowModelUpdate", "stuckDropRow"); } catch (e) {}
            }
        } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134330 -- the Tag Selector scoped to the collections tree's NEW
    // rows (forums.zotero.org/discussion/134330, MJT 2026-10-19; upstream
    // register #31). When the collections tree reloads with the same rows
    // selected -- every move to the trash ('refresh' 'trash'), filtering the
    // collections pane, Weavero's hide / show of a collection, an Extras
    // toggle -- onCollectionSelected returns at "selection hasn't changed" and
    // the items view keeps its rows, while ZoteroPane.setTagScope hands the
    // Tag Selector getCollectionTreeRows(): the tree's new rows, without the
    // quick search or the tag filter and with a cache nothing clears. The
    // quick search stopped narrowing the Tag Selector; a new item's tag went
    // missing. Zotero's own setTagScope runs unchanged, reading the rows the
    // items view shows: getCollectionTreeRows is answered with them for the
    // synchronous start of the call, where setTagScope reads it (the fix
    // offered upstream does the same read inside setTagScope).
    //
    // RETIRE WHEN Zotero's setTagScope scopes to the items view's rows itself
    // (then this installs nothing); test/tag-scope-rows.spec.js's tripwire
    // says when.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireTagScopeRowsFix(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            if (!ZP || typeof ZP.setTagScope !== "function") return;
            const wraps = ZP._wvWraps && ZP._wvWraps.setTagScope;
            const native = wraps ? wraps.native : ZP.setTagScope;
            if (/itemsView/.test(String(native))) return;   // Zotero's own fix is in
            wvWrap(ZP, "setTagScope", "tagScopeRows", this._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                const rows = this.itemsView && this.itemsView.collectionTreeRows;
                if (!rows || !rows.length) return orig.apply(this, args);
                const own = Object.prototype.hasOwnProperty.call(this, "getCollectionTreeRows");
                const prev = this.getCollectionTreeRows;
                this.getCollectionTreeRows = () => rows;
                try { return orig.apply(this, args); }
                finally {
                    if (own) this.getCollectionTreeRows = prev;
                    else delete this.getCollectionTreeRows;
                }
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireTagScopeRowsFix err: " + e); }
    }

    _wvTeardownTagScopeRowsFix() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                try { if (w && w.ZoteroPane) wvUnwrap(w.ZoteroPane, "setTagScope", "tagScopeRows"); } catch (e) {}
            }
        } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134357 (forums.zotero.org/discussion/134357, upstream register
    // #34; MJT 2026-10-21: "fix it in Weavero
    // until they fix it upstream"). Zotero 11: ZoteroPane.updateNewNoteMenu --
    // the popupshowing of the toolbar's New Note menu and of File > New --
    // sets the child-note command's `disabled` to a stringified boolean,
    // "false" for an eligible item; the menuitem linked to the command then
    // carries `disabled=""`, and Firefox 153 treats the attribute's presence
    // as disabled: "New Item Note" greyed and dead (matches :disabled, the
    // command never fires). On Zotero 10 / Firefox 140 "false" meant enabled.
    // After Zotero's pass a "false" goes, and with it the attribute it left
    // on the popup's menuitems; a "true" stays. Installs nothing once
    // upstream no longer spells the stringified set.
    //
    // RETIRE WHEN updateNewNoteMenu uses toggleAttribute / removeAttribute;
    // test/new-note-menu.spec.js's tripwire says when.
    // ─────────────────────────────────────────────────────────────────────────
    _wvWireNewNoteMenuFix(win: any) {
        try {
            const ZP = win && win.ZoteroPane;
            if (!ZP || typeof ZP.updateNewNoteMenu !== "function") return;
            const wraps = ZP._wvWraps && ZP._wvWraps.updateNewNoteMenu;
            const native = wraps ? wraps.native : ZP.updateNewNoteMenu;
            if (!/setAttribute\(\s*["']disabled["']\s*,\s*!this\.canEdit\(\)/.test(String(native))) return;   // Zotero's own fix is in
            wvWrap(ZP, "updateNewNoteMenu", "newNoteMenu", this._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                try {
                    const doc = win.document;
                    const cmd = doc.getElementById("cmd_zotero_newChildNote");
                    if (cmd && cmd.getAttribute("disabled") === "false") {
                        cmd.removeAttribute("disabled");
                        const popup = args[1];
                        const items = popup && popup.querySelectorAll ? popup.querySelectorAll("menuitem[command='cmd_zotero_newChildNote']") : [];
                        for (const mi of Array.from(items) as any[]) mi.removeAttribute("disabled");
                    }
                } catch (e) {}
                return r;
            });
        } catch (e) { Zotero.debug("[Weavero] _wvWireNewNoteMenuFix err: " + e); }
    }

    _wvTeardownNewNoteMenuFix() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                try { if (w && w.ZoteroPane) wvUnwrap(w.ZoteroPane, "updateNewNoteMenu", "newNoteMenu"); } catch (e) {}
            }
        } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134361 (forums.zotero.org/discussion/134361, upstream
    // register #35; MJT 2026-10-21: "Then fix in Weavero"). collectionTree.jsx canDropCheck refuses a dragged collection
    // "onto itself" and "into its own children" by comparing the collection's
    // id with `treeRow.ref.id` -- for a LIBRARY row the library's own id --
    // so the collection whose id equals its library's (My Library: collection
    // 1, the database's first) can never be dropped on the library row, nor
    // any collection holding it. Over the pane's tree and the manager's two:
    // a zotero/collection drag over an editable library row is allowed
    // (Zotero's own answer minus the two comparisons -- a cross-library drop
    // is its copy and never reached them; the drop's async check still
    // runs); every other row and type is Zotero's. `canDropCheck` is a class
    // field (an own arrow function), replaced on the instance with the
    // original kept; a re-apply wraps the original. Installs nothing once
    // upstream compares against collection rows only.
    //
    // RETIRE WHEN canDropCheck runs the two comparisons under isCollection();
    // test/collection-drop-lib.spec.js's tripwire says when.
    // ─────────────────────────────────────────────────────────────────────────
    _wvCollectionDropFixApply(cv: any, tag: string): boolean {
        try {
            const orig = cv._wvOrigCanDropCheck || cv.canDropCheck;
            if (typeof orig !== "function") return false;
            const src = String(orig);
            // Zotero's own fix is in: the comparison gone, or guarded on the row's kind.
            if (!/\bid\s*==\s*treeRow\.ref\.id\b/.test(src) || /isCollection\(\)\s*&&\s*id\s*==\s*treeRow\.ref\.id\b/.test(src)) return false;
            cv._wvOrigCanDropCheck = orig;
            const wrapped = (row: number, orient: number, dataTransfer: any) => {
                try {
                    if (orient === 0) {
                        const tr = cv.getRow(row);
                        if (tr && tr.editable && typeof tr.isLibrary === "function" && tr.isLibrary(true)) {
                            const dd = (Zotero as any).DragDrop.getDataFromDataTransfer(dataTransfer);
                            if (dd && dd.dataType === "zotero/collection") return true;
                        }
                    }
                } catch (_) {}
                return orig(row, orient, dataTransfer);
            };
            (wrapped as any)._wvTag = tag;
            cv.canDropCheck = wrapped;
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvCollectionDropFixApply err: " + e); return false; }
    }

    _wvCollectionDropFixRemove(cv: any) {
        try { if (cv && cv._wvOrigCanDropCheck) { cv.canDropCheck = cv._wvOrigCanDropCheck; delete cv._wvOrigCanDropCheck; } } catch (_) {}
    }

    /** The pane's tree; a new main window's tree may not exist yet at
     *  onMainWindowLoad (as _wvHidApply found), so this retries, bounded. */
    _wvWireCollectionDropFix(win: any) {
        try {
            const cv = win && win.ZoteroPane && win.ZoteroPane.collectionsView;
            if (!cv) {
                const n = (win && win._wvDropFixTries) || 0;
                if (win && !win.closed && n < 60) {
                    win._wvDropFixTries = n + 1;
                    win.setTimeout(() => {
                        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (p && !p._wvDestroyed) p._wvWireCollectionDropFix(win);
                    }, 250);
                }
                return;
            }
            delete win._wvDropFixTries;
            this._wvCollectionDropFixApply(cv, this._wvWireTag());
        } catch (e) { Zotero.debug("[Weavero] _wvWireCollectionDropFix err: " + e); }
    }

    _wvTeardownCollectionDropFix() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                try { this._wvCollectionDropFixRemove(w.ZoteroPane && w.ZoteroPane.collectionsView); } catch (e) {}
                try {
                    const mw = w._wvHidMgrWin;
                    const trees = mw && !mw.closed && mw._wvHidMgrTrees;
                    if (trees) for (const side of ["left", "right"]) this._wvCollectionDropFixRemove(trees[side]);
                } catch (e) {}
            }
        } catch (e) {}
    }

    _wvTeardownTagSelectorHandle() {
        try {
            const wins: any[] = wvMainWins();
            for (const w of wins) {
                try { this._wvTeardownTagSelectorHandleIn(w); } catch (e) {}
                try {
                    const sp: any = w.document && w.document.getElementById("zotero-tags-splitter");
                    if (sp) delete sp._wvTsRefreshIv;
                } catch (e) {}
            }
        } catch (e) {}
    }

    /** Hide the side panes of the Advanced Search window when Settings says
     *  so: the collections pane and the item pane collapse the way Zotero's
     *  own View -> Layout does it (pane `collapsed` + splitter `state`, then
     *  updateLayoutConstraints -- standalone.js onViewMenuItemClick). Run
     *  once the window's pane init is over, since unserializePersist has set
     *  the inherited layout by then. Managed windows persist their layout
     *  under a per-window key (`_wvApplyPerWindowPanePersist`), so this never
     *  reaches the primary. */
    _wvAdvSearchApplyPaneLayout(nw: any) {
        try {
            if (!(this as any)._getAdvSearchWindowHidePanes()) return;
            const doc = nw && nw.document;
            if (!doc) return;
            const collapse = (paneId: string, splitterId: string) => {
                const pane = doc.getElementById(paneId), sp = doc.getElementById(splitterId);
                if (!pane || !sp) return;
                sp.setAttribute("state", "collapsed");
                wvSetBoolAttr(pane, "collapsed", true);
            };
            collapse("zotero-collections-pane", "zotero-collections-splitter");
            collapse("zotero-item-pane", "zotero-items-splitter");
            try { nw.ZoteroPane.updateLayoutConstraints(); } catch (_) {}
        } catch (e) { Zotero.debug("[Weavero] _wvAdvSearchApplyPaneLayout err: " + e); }
    }

    /** Remember the Advanced Search window's size: on resize (debounced --
     *  Gecko fires `resize` with the paint cycle, so never while the window
     *  is occluded) and again at unload, which sees the final size whatever
     *  happened in between (measured 2026-09-22). Normal state only -- a
     *  maximized size would bring the full screen back. One hook per window. */
    _wvAdvSearchRememberSize(nw: any) {
        if (!nw || nw._wvAdvSearchSizeWired) return;
        nw._wvAdvSearchSizeWired = true;
        let timer: any = null;
        // `closed` is already true DURING unload (measured 2026-09-22), so
        // only the debounced resize path checks it.
        const store = (atUnload?: boolean) => {
            try {
                if ((!atUnload && nw.closed) || nw.windowState !== nw.STATE_NORMAL) return;
                // INNER size: the width/height features set the content
                // area, so storing the outer size would grow the window by
                // its frame on every open (measured: 1240 -> 1256).
                const w = nw.innerWidth, h = nw.innerHeight;
                if (w >= 100 && h >= 100) Zotero.Prefs.set("weavero.advSearchWindowSize", w + "x" + h);
            } catch (_) {}
        };
        nw.addEventListener("resize", () => {
            try { if (timer) nw.clearTimeout(timer); timer = nw.setTimeout(() => store(false), 400); } catch (_) {}
        });
        nw.addEventListener("unload", () => store(true));
    }

    async _wvAdvSearchOpenNewWindow() {
        try {
            if (!(this as any)._wvMultiMainOn()) return;   // Multiple main windows off
            // click + synthesized command can both reach the interceptor for
            // one gesture -- collapse them.
            const now = Date.now();
            if (now - ((this as any)._wvAdvSearchLastOpen || 0) < 500) return;
            (this as any)._wvAdvSearchLastOpen = now;
            // Direct watcher spawn so we hold the HANDLE from t=0 (the
            // window itself is up in ~160ms; polling getMainWindows at 100ms
            // was most of the perceived latency -- "It should be faster",
            // measured 2026-09-01). Same pending flag + clean session state
            // as _wvOpenEmptyMainWindow.
            (this as any)._wvPendingDevWindow = true;
            try { (this as any)._wvClearSessionPaneState(); } catch (_) {}
            this._wvPrimeNewWindowLanding("L" + Zotero.Libraries.userLibraryID);   // lands on My Library by design
            const { AppConstants } = ChromeUtils.importESModule(
                "resource://gre/modules/AppConstants.sys.mjs");
            let nw: any = null;
            try {
                nw = Services.ww.openWindow(null, AppConstants.BROWSER_CHROME_URL,
                    "_blank", this._wvAdvSearchWindowFeatures(), null);
            } catch (e) { (this as any)._wvPendingDevWindow = false; throw e; }
            const setT = wvTimeout;
            const t0 = Date.now();
            // Gate on a FUNCTIONAL items view, not just ZoteroPane + deck:
            // toggleAdvancedSearchState reaches itemsView.setFilter, and
            // calling at deck-exists time (~160ms) THROWS and leaves the pane
            // closed (measured: itemsView ready ~860ms, deck open ~975ms).
            while (Date.now() - t0 < 15000) {
                try {
                    const iv = nw && nw.ZoteroPane && nw.ZoteroPane.itemsView;
                    if (iv && typeof iv.setFilter === "function"
                            && nw.document
                            && nw.document.getElementById("zotero-advanced-search-pane-deck")) {
                        break;
                    }
                    if (nw && nw.closed) return;
                } catch (_) {}
                await new Promise(r => setT(r, 25));
            }
            // Gesture-initiated: if the bg-restore contract happens to be
            // active (startup, or a stuck flag), this window is the USER'S
            // choice -- claim it so the contract redirects instead of
            // fighting the raise (same rule as a mousedown claim).
            try {
                if ((this as any)._wvBgRestoreOn) {
                    (nw as any)._wvBgUserClaimed = true;
                    (this as any)._wvBgUserChosenWin = nw;
                }
            } catch (_) {}
            try { nw.focus(); } catch (_) {}
            try { this._wvAdvSearchRememberSize(nw); } catch (_) {}
            try { this._wvAdvSearchApplyPaneLayout(nw); } catch (_) {}
            try { await nw.ZoteroPane.toggleAdvancedSearchState("open"); }
            catch (e) { Zotero.debug("[Weavero] advsearch-new-window open err: " + e); }
            // FOCUS PARITY with the in-main open (native focuses the pane's
            // conditions menu). The toggle DOES focus it, but the window's
            // still-running init pulls focus back (items tree / quick
            // search), so the pane looked unfocused ("should focus the same
            // place as when opened in the main window", MJT 2026-09-01).
            // Re-assert until it sticks, bounded.
            try {
                const deck = nw.document.getElementById("zotero-advanced-search-pane-deck");
                const pane = deck && deck.pane;
                if (pane) {
                    // SETTLE-AND-HOLD, not first-success: breaking on the
                    // first :focus-within let the window's late init steal
                    // focus right back (the conditions menu "flickered,
                    // finally not selected"), and OS focus sometimes never
                    // transferred at all (window opened BEHIND) -- both
                    // MJT 2026-09-01. Done only after ~600ms of continuous
                    // window+pane focus; bounded at 6s.
                    // OS focus is BEST-EFFORT and bounded (it needs a user
                    // gesture; retrying forever fights pane.focus() — each
                    // window.focus() resets the internal focus the previous
                    // iteration just set, measured live). Pane-internal focus
                    // is the stability criterion.
                    const t1 = Date.now();
                    let stable = 0, osTries = 0;
                    while (Date.now() - t1 < 6000 && stable < 6) {
                        try {
                            if (nw.closed) return;
                            if (!nw.document.hasFocus() && osTries < 10) {
                                osTries++;
                                nw.focus();
                            }
                            if (pane.matches(":focus-within")) {
                                stable++;
                            }
                            else {
                                stable = 0;
                                pane.focus();
                            }
                        } catch (_) {}
                        await new Promise(r => setT(r, 100));
                    }
                }
            } catch (_) {}
        } catch (e) { Zotero.debug("[Weavero] _wvAdvSearchOpenNewWindow err: " + e); }
    }

    /** Ctrl+T / Cmd+T in a main window: the "open a library item" picker.
     *  The key is taken ONLY when the live plugin exists and the Tabs &
     *  Windows master is on -- it was swallowed before any check, so with
     *  the master off, or after a disable, Ctrl+T did nothing at all and
     *  other plugins' bindings were blocked (survey 2026-10-06). Stamped
     *  with the wire tag and unwired by destroy. */
    _wvWireMainNewTabShortcut(win: any) {
        try {
            if (!win) return;
            const tag = (this as any)._wvWireTag();
            if (win._wvMainNewTabKeyH && win._wvMainNewTabKeyH._wvTag === tag) return;
            this._wvUnwireMainNewTabShortcut(win);
            const h: any = (ke: any) => {
                try {
                    const accel = wvAccel(ke);
                    if (!accel || ke.shiftKey || ke.altKey
                        || String(ke.key).toLowerCase() !== "t") return;
                    const live: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!live || live._wvDestroyed) return;
                    if (!live._getTabsAndWindowsMaster()) return;
                    ke.preventDefault(); ke.stopPropagation();
                    live._wvMainNewTabPicker(win);
                } catch (e2) {}
            };
            h._wvTag = tag;
            win.addEventListener("keydown", h, true);
            win._wvMainNewTabKeyH = h;
        } catch (e) {}
    }

    _wvUnwireMainNewTabShortcut(win: any) {
        try {
            if (win && win._wvMainNewTabKeyH) {
                win.removeEventListener("keydown", win._wvMainNewTabKeyH, true);
                delete win._wvMainNewTabKeyH;
            }
        } catch (e) {}
    }

    async _wvMainNewTabPicker(win: any) {
        try {
            const io: any = {
                dataIn: null, dataOut: null,
                deferred: Zotero.Promise.defer(),
                itemTreeID: "weavero-main-newtab-select",
            };
            win.openDialog("chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            await io.deferred.promise;
            if (!io.dataOut || !io.dataOut.length) return;
            const items: any = await Zotero.Items.getAsync(io.dataOut);
            // Reader.open lands in the FOCUSED main window — assert ours
            // (multi-main-window safety).
            try { win.focus(); } catch (e) {}
            for (const it of items) {
                try {
                    if (it.isNote && it.isNote()) {
                        // ZoteroPane.openNote is the REAL note-tab opener (the
                        // hook Better Notes drives too) — a bare Zotero_Tabs.add
                        // makes a shell tab whose editor never mounts ("Why is
                        // the note not loading?", 2026-07-13).
                        if (typeof win.ZoteroPane.openNote === "function") {
                            await win.ZoteroPane.openNote(it.id, { openInWindow: false });
                        } else {
                            win.Zotero_Tabs.add({ type: "note", data: { itemID: it.id }, select: true });
                        }
                        continue;
                    }
                    let openID: any = null;
                    if (it.attachmentReaderType) openID = it.id;
                    else if (it.isRegularItem && it.isRegularItem()) {
                        const att: any = await it.getBestAttachment();
                        if (att && att.attachmentReaderType) openID = att.id;
                    }
                    if (openID == null) continue;
                    await (Zotero.Reader as any).open(openID, null, { openInWindow: false, allowDuplicate: false });
                } catch (e2) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMainNewTabPicker err: " + e); }
    }

    async _wvOpenInTarget(srcWin: any, targetWin: any, groupID: any, createNewGroup?: boolean) {
        try {
            const zp = srcWin && srcWin.ZoteroPane;
            const sel = (zp && typeof zp.getSelectedItems === "function") ? zp.getSelectedItems() : [];
            const isReaderWin = !!(targetWin && targetWin._wvWT);
            // "New Group" → create one (empty name, next colour) up front so all
            // selected items land in the SAME new group (main + reader windows; a
            // reader window hosts groups via wvGroupId stamps).
            let readerGroupID: any = null;
            if (createNewGroup) {
                try { const g = this._tabGroupCreate("", this._wvTabGroupNextColor()); if (isReaderWin) readerGroupID = g.id; else groupID = g.id; } catch (e) {}
            }
            for (const it of sel) {
                const isNote = !!(it && typeof it.isNote === "function" && it.isNote());
                const att = isNote ? null : this._wvGetBestAttachmentSync(it);
                if (!isNote && !att) continue;
                try { if (targetWin && targetWin.focus) targetWin.focus(); } catch (e) {}
                if (isReaderWin) {
                    // A Weavero multi-tab reader window: a note mounts a <note-editor>
                    // tab (_wvWTMountTab dispatches on isNote), an attachment adds a
                    // lazy reader tab. For "New Group", stamp the new tab into it.
                    try {
                        let tabId: any;
                        if (isNote) tabId = await this._wvWTMountTab(targetWin, it.id, { allowDuplicate: true, select: true });
                        else { tabId = this._wvWTAddLazyReaderTab(targetWin, att.id); if (tabId && this._wvWTSwitch) this._wvWTSwitch(targetWin, tabId); }
                        if (tabId && readerGroupID != null) { try { this._wvReaderStampTabGroup(targetWin, tabId, readerGroupID); } catch (e) {} }
                    } catch (e) { Zotero.debug("[Weavero] open-in reader-win err: " + e); }
                    continue;
                }
                // Main window: a note opens as a note tab; an attachment via Reader.open.
                let tabID: any = null;
                if (isNote) {
                    try {
                        if (typeof targetWin.ZoteroPane.openNote === "function") {
                            // Real note-tab opener (see _wvMainNewTabPicker) —
                            // the bare add() left an editor-less shell tab.
                            const r0 = await targetWin.ZoteroPane.openNote(it.id, { openInWindow: false });
                            tabID = (r0 && (r0.id || r0)) || targetWin.Zotero_Tabs.selectedID;
                        } else {
                            const r = targetWin.Zotero_Tabs.add({ type: "note", data: { itemID: it.id }, select: true });
                            tabID = r && r.id;
                        }
                    }
                    catch (e) { Zotero.debug("[Weavero] open-in note err: " + e); continue; }
                } else {
                    let reader: any = null;
                    try { reader = await (Zotero.Reader as any).open(att.id, null, { openInWindow: false, allowDuplicate: true }); }
                    catch (e) { Zotero.debug("[Weavero] open-in Reader.open err: " + e); continue; }
                    tabID = reader && reader.tabID;
                }
                if (groupID && tabID && this._wvTabGroupAddTab) {
                    let tries = 0;
                    const tryAdd = () => {
                        try {
                            const Z = targetWin.Zotero_Tabs;
                            if (Z && Z._tabs && Z._tabs.some((t: any) => t.id === tabID)) {
                                this._wvTabGroupAddTab(targetWin, tabID, groupID);
                                return;
                            }
                        } catch (e) {}
                        if (tries++ < 20) (targetWin.setTimeout || setTimeout)(tryAdd, 50);
                    };
                    tryAdd();
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvOpenInTarget err: " + e);
        }
    }

    /** The tab state a new main window opens with: the library tab, then one
     *  reader or note tab per entry {itemID, isNote}, the last one selected --
     *  one builder since 2026-10-21 for Open in New Main Window and Move Tabs
     *  to New Main Window (survey 2026-10-06). */
    _wvNewWindowTabState(entries: any[]): any[] {
        const tabState: any[] = [{ type: "library", title: "My Library", data: { icon: "library" }, selected: false }];
        for (const e of entries) {
            const item: any = Zotero.Items.get(e.itemID);
            let title = "";
            try {
                if (e.isNote) {
                    title = (item && item.getNoteTitle && item.getNoteTitle())
                        || (item && item.getDisplayTitle && item.getDisplayTitle()) || "Note";
                } else {
                    const parent: any = item && item.parentID ? Zotero.Items.get(item.parentID) : null;
                    title = (parent && parent.getDisplayTitle && parent.getDisplayTitle())
                        || (item && item.getDisplayTitle && item.getDisplayTitle()) || "";
                }
            } catch (er) {}
            if (e.isNote) {
                tabState.push({ type: "note", title, data: { itemID: e.itemID } });
            } else {
                const ct = String((item && item.attachmentContentType) || "").toLowerCase();
                const icon = ct === "application/pdf" ? "attachmentPDF"
                    : ct === "application/epub+zip" ? "attachmentEPUB" : "attachmentSnapshot";
                tabState.push({ type: "reader", title, data: { itemID: e.itemID, icon } });
            }
        }
        if (tabState.length > 1) tabState[tabState.length - 1].selected = true;   // the last item
        return tabState;
    }

    /** Group the tabs of `itemIDs` open in `win` into a fresh group -- the
     *  "+ New Group" variant of the two openers above. */
    _wvGroupItemTabsIn(win: any, itemIDs: any[]) {
        try {
            const groupID = (this as any)._tabGroupCreate("", (this as any)._wvTabGroupNextColor()).id;
            const ids = new Set(itemIDs);
            for (const t of (win.Zotero_Tabs._tabs || [])) {
                if (t.data && ids.has(t.data.itemID)) { try { (this as any)._wvTabGroupAddTab(win, t.id, groupID); } catch (e) {} }
            }
        } catch (e) { Zotero.debug("[Weavero] _wvGroupItemTabsIn err: " + e); }
    }

    /** Open the selected items' best attachments in a BRAND-NEW main window (and,
     *  with createNewGroup, a fresh tab group there). The window's tab state is
     *  built up front and queued, so the dev-window restore path opens the window
     *  with the items ALREADY in it (via restoreState) — clean, no flash, no
     *  post-open delay (vs. the old open-then-move approach). Notes /
     *  attachment-less items are skipped. */
    async _wvOpenInNewMainWindow(srcWin: any, createNewGroup?: boolean) {
        const LOG = (m: string) => { try { Zotero.debug("[Weavero][NewMainWindow] " + m); } catch (e) {} };
        try {
            if (!(this as any)._wvMultiMainOn()) return;   // Multiple main windows off
            const zp = srcWin && srcWin.ZoteroPane;
            const sel = (zp && typeof zp.getSelectedItems === "function") ? zp.getSelectedItems() : [];
            // One entry per openable item: a note (opens as a note tab) or an
            // attachment's best reader-able file.
            const entries: any[] = [];
            for (const it of sel) {
                if (it && typeof it.isNote === "function" && it.isNote()) entries.push({ itemID: it.id, isNote: true });
                else { const a = this._wvGetBestAttachmentSync(it); if (a) entries.push({ itemID: a.id, isNote: false }); }
            }
            if (!entries.length) { LOG("nothing openable -> abort"); return; }
            const tabState = this._wvNewWindowTabState(entries);
            // Queue the state + open a clean managed window. _wvInitDevMainWindow
            // restoreState()s it, so the window appears with the items already there.
            const s = (this as any)._wvSpawnMainWindowStart({ tabs: tabState });
            if (!s) { LOG("openMainWindow THREW"); return; }
            LOG("opened clean window, " + entries.length + " item tab(s) queued, createNewGroup=" + !!createNewGroup);
            if (!createNewGroup) return;
            // "New Group" variant: once the window is up + restored (its items are
            // already shown), group the item tabs into a fresh group.
            const newWin = await (this as any)._wvSpawnMainWindowWait(s, { wait: "init", timerWin: srcWin });
            if (!newWin) { LOG("new window not found for grouping"); return; }
            this._wvGroupItemTabsIn(newWin, entries.map((e: any) => e.itemID));
            LOG("grouped item tabs in new window");
        } catch (e) { LOG("OUTER THREW: " + e); }
    }

    /** Move the given tab(s) — main-window `Zotero_Tabs` ids OR reader-window
     *  `_wvWT` ids — into a BRAND-NEW main window via the same clean restoreState
     *  path as `_wvOpenInNewMainWindow`, then close them in the source (a MOVE).
     *  With `createNewGroup`, groups the moved tabs in the new window. The "New
     *  Main Window" entry in the Move Tabs submenu calls this. */
    async _wvMoveTabsToNewMainWindow(srcWin: any, tabIds: any[], createNewGroup?: boolean) {
        try {
            const srcIsReader = !!(srcWin && srcWin._wvWT);
            const entries: any[] = [];   // { itemID, isNote, tabId }
            for (const id of (tabIds || [])) {
                let itemID: any = null, isNote = false;
                if (srcIsReader) {
                    const t = (srcWin._wvWT.tabs || []).find((x: any) => String(x.id) === String(id));
                    if (t) { itemID = t.itemID; isNote = (t.type === "note"); }
                } else {
                    const Z = srcWin.Zotero_Tabs;
                    const t = Z && Z._tabs.find((x: any) => x.id === id);
                    if (t && t.id !== "zotero-pane" && t.type !== "library") {
                        itemID = t.data && t.data.itemID;
                        isNote = !!(t.type && String(t.type).indexOf("note") !== -1);
                    }
                }
                if (itemID != null) entries.push({ itemID, isNote, tabId: id });
            }
            if (!entries.length) return;
            const tabState = this._wvNewWindowTabState(entries);
            const s = (this as any)._wvSpawnMainWindowStart({ tabs: tabState });
            if (!s) return;
            // Wait for the new window to come up + restore, then close the source
            // tabs (the MOVE) and optionally group the moved tabs. A window that
            // never settles (slow start, failed init) keeps the source tabs -- a
            // "move" must not become a "close" (survey 2026-10-06); the helper
            // takes the queued spawn back so a later window does not adopt it.
            const newWin = await (this as any)._wvSpawnMainWindowWait(s, { wait: "init", timerWin: srcWin, dropOnTimeout: true });
            if (!newWin) { Zotero.debug("[Weavero] _wvMoveTabsToNewMainWindow: new window never settled; source tabs kept"); return; }
            for (const e of entries) {
                try {
                    if (srcIsReader) this._wvWTCloseTab(srcWin, e.tabId);
                    else { (this as any)._wvBlindAutomationTabClose(e.tabId); srcWin.Zotero_Tabs.close(e.tabId); }
                } catch (er) {}
            }
            if (createNewGroup) this._wvGroupItemTabsIn(newWin, entries.map((e: any) => e.itemID));
        } catch (e) { Zotero.debug("[Weavero] _wvMoveTabsToNewMainWindow err: " + e); }
    }

    /** Move the given tab(s) into a BRAND-NEW standalone READER window. From a
     *  reader-window source with no grouping we tear off (preserves reader state);
     *  otherwise (main-window source, or "+ New Group") we open the items in one
     *  fresh reader window, close the sources, and group them there. */
    async _wvMoveTabsToNewReaderWindow(srcWin: any, tabIds: any[], createNewGroup?: boolean) {
        try {
            const srcIsReader = !!(srcWin && srcWin._wvWT);
            if (srcIsReader && !createNewGroup) {
                // No-reload tear-off (keeps scroll/zoom/selection).
                if (tabIds.length === 1) { try { (this as any)._wvWTTearOffTab(srcWin, tabIds[0]); } catch (e) {} }
                else { try { (this as any)._wvWTTearOffTabs(srcWin, tabIds); } catch (e) {} }
                return;
            }
            // Resolve tab(s) → openables (reader/note) + remember the source ids.
            const openables: any[] = [], closers: any[] = [];
            for (const id of (tabIds || [])) {
                let itemID: any = null, isNote = false;
                if (srcIsReader) {
                    const t = (srcWin._wvWT.tabs || []).find((x: any) => String(x.id) === String(id));
                    if (t) { itemID = t.itemID; isNote = (t.type === "note"); }
                } else {
                    const Z = srcWin.Zotero_Tabs;
                    const t = Z && Z._tabs.find((x: any) => x.id === id);
                    if (t && t.id !== "zotero-pane" && t.type !== "library") {
                        itemID = t.data && t.data.itemID;
                        isNote = !!(t.type && String(t.type).indexOf("note") !== -1);
                    }
                }
                if (itemID != null) { openables.push({ id: itemID, kind: isNote ? "note" : "reader" }); closers.push(id); }
            }
            if (!openables.length) return;
            const win: any = await (this as any)._wvOpenItemsInOneReaderWindow(openables);
            // Close the source tabs (the MOVE).
            for (const id of closers) {
                try {
                    if (srcIsReader) (this as any)._wvWTCloseTab(srcWin, id);
                    else { (this as any)._wvBlindAutomationTabClose(id); srcWin.Zotero_Tabs.close(id); }
                } catch (e) {}
            }
            if (createNewGroup && win && win._wvWT) {
                try {
                    const ids = (win._wvWT.tabs || []).map((t: any) => t.id);
                    if (ids.length) (this as any)._wvTabGroupNewFromDeckTabs(win, ids);
                } catch (e) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvMoveTabsToNewReaderWindow err: " + e); }
    }

    /** Register the reader-tab right-click menu entries via Zotero's
     *  MenuManager plugin API (`target: "main/tab"`). Two entries, both
     *  acting on the tab's own item (the file attachment being read):
     *    Copy Select Link — `zotero://select/…/items/<key>` (selects
     *                       the attachment row in the library)
     *    Copy Open Link   — `zotero://open/…/items/<key>` (re-opens
     *                       that document in the reader)
     *  Each is hidden (`onShowing` → `setVisible(false)`) when the
     *  Copy-Item-Link pref is off or the link doesn't apply (e.g. a
     *  linked-URL attachment with no file). No-op on Zotero builds
     *  without `MenuManager.registerMenu`. */
    /** Items for a main-window tab context-menu action that honours the
     *  Weavero tab MULTI-selection: when `tabID` is part of a >1-tab
     *  selection, the items of ALL selected tabs (tab-bar order, duplicate
     *  tabs of one item collapsed); else null — the caller falls back to
     *  the single clicked tab. Split out of `_registerTabContextMenu` so
     *  the resolution is testable (Guard: test/copy-as-multi.spec.js). */
    _wvTabCtxTargetItems(win: any, tabID: any) {
        try {
            if (!win || !tabID || tabID === "zotero-pane") return null;
            const tgts = this._wvTabMultiSelTargets
                ? this._wvTabMultiSelTargets(win, tabID) : null;
            if (!tgts || tgts.length <= 1) return null;
            const Z: any = win.Zotero_Tabs;
            const items: any[] = []; const seen = new Set();
            for (const id of tgts) {
                const t = Z && Z._tabs && Z._tabs.find((x: any) => x.id === id);
                if (!t || t.id === "zotero-pane" || t.type === "library") continue;
                const itemID = t.data && t.data.itemID;
                if (itemID == null) continue;
                const it: any = Zotero.Items.get(itemID);
                if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); }
            }
            return items.length ? items : null;
        } catch (e) { return null; }
    }

    /** Per-window wrap of `ZoteroPane.copySelectedItemsToClipboard` — the
     *  quick-copy shortcuts (Ctrl+Shift+A citation / Ctrl+Shift+C
     *  bibliography). Upstream's `getSelectedItems` returns ONLY the active
     *  tab's item for reader/note tabs (zoteroPane.js `case 'reader'`), so
     *  with several tabs multi-selected the shortcut copied one citation
     *  (reported 2026-09-03). When the ACTIVE tab is part of a >1-tab
     *  Weavero multi-selection, feed ALL selected tabs' items through the
     *  ORIGINAL native logic (note formats, bibliography filtering, export
     *  mode all stay upstream's) by shadowing the two getters it reads
     *  synchronously at call top. Library tab active → untouched: the
     *  items-tree selection governs, as natively.
     *  Guard: test/copy-as-multi.spec.js. */
    _wvWireQuickCopyMultiTab(win: any) {
        try {
            const ZP: any = win && win.ZoteroPane;
            if (!ZP || typeof ZP.copySelectedItemsToClipboard !== "function") return;
            const tag = (this as any)._wvWireTag();
            if (ZP._wvQuickCopyWired === tag) return;
            // Foreign stamp = wrapped by another build. The member is an
            // OWN-prop function with no prototype fallback, so restore the
            // saved original (kept on the host) before wiring fresh.
            if (ZP._wvOrigCopySelectedToClipboard) {
                ZP.copySelectedItemsToClipboard = ZP._wvOrigCopySelectedToClipboard;
            }
            const orig = ZP.copySelectedItemsToClipboard;
            ZP._wvOrigCopySelectedToClipboard = orig;
            ZP.copySelectedItemsToClipboard = function (asCitations?: any) {
                // Saved-and-restored, NEVER deleted: getSelectedItems /
                // getSortedItems are themselves own props of ZoteroPane —
                // delete would destroy them with no prototype fallback.
                let savedSel: any = null, savedSort: any = null, shadowed = false;
                try {
                    // Live plugin at event time — closures go stale on reload.
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    const ZT: any = win.Zotero_Tabs;
                    if (lp && ZT && ZT.selectedID && ZT.selectedID !== "zotero-pane"
                        && lp._wvTabCtxTargetItems) {
                        const tabItems = lp._wvTabCtxTargetItems(win, ZT.selectedID);
                        if (tabItems && tabItems.length > 1) {
                            // Upstream's per-tab routing (`case 'reader'`):
                            // an attachment cites its parent; notes stay.
                            const ids: any[] = []; const seen = new Set();
                            for (let it of tabItems) {
                                try {
                                    if (it.isAttachment && it.isAttachment() && it.parentItem) it = it.parentItem;
                                } catch (e) {}
                                if (it && !seen.has(it.id)) { seen.add(it.id); ids.push(it.id); }
                            }
                            if (ids.length > 1) {
                                savedSel = this.getSelectedItems;
                                savedSort = this.getSortedItems;
                                this.getSelectedItems = (asIDs: any) => (asIDs ? ids.slice() : Zotero.Items.get(ids));
                                this.getSortedItems = (asIDs: any) => (asIDs ? ids.slice() : Zotero.Items.get(ids));
                                shadowed = true;
                            }
                        }
                    }
                } catch (e) { Zotero.debug("[Weavero] quick-copy multi-tab err: " + e); }
                try {
                    return orig.apply(this, arguments);
                }
                finally {
                    if (shadowed) {
                        try { this.getSelectedItems = savedSel; } catch (e) {}
                        try { this.getSortedItems = savedSort; } catch (e) {}
                    }
                }
            };
            ZP._wvQuickCopyWired = tag;
        } catch (e) { Zotero.debug("[Weavero] _wvWireQuickCopyMultiTab err: " + e); }
    }

    _wvUnwireQuickCopyMultiTab(win: any) {
        try {
            const ZP: any = win && win.ZoteroPane;
            if (!ZP || !ZP._wvOrigCopySelectedToClipboard) return;
            ZP.copySelectedItemsToClipboard = ZP._wvOrigCopySelectedToClipboard;
            delete ZP._wvOrigCopySelectedToClipboard;
            delete ZP._wvQuickCopyWired;
        } catch (e) {}
    }

    _registerTabContextMenu() {
        try {
            if (!((Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.registerMenu === "function")) {
                this._dbg("[Weavero] MenuManager unavailable; skip tab-menu register");
                return;
            }
            this._teardownTabContextMenu();
            const self = this;
            // ---- "Copy As" submenu: the WV_COPY_AS list (url.ts) as MenuManager
            // children, the same list the reader window's tab menu builds from.
            // The tab's `ctx.items[0]` is the ATTACHMENT the reader opened; the
            // copies act on the WHOLE tab multi-selection when the clicked tab is
            // part of it (matching Move/Close/Pin/Duplicate -- 2026-09-03:
            // "Citation" copied only the clicked tab), else the clicked tab.
            const tabItemsOf = (ctx) => {
                try {
                    const win: any = ctx && ctx.menuElem && ctx.menuElem.ownerDocument
                        && ctx.menuElem.ownerDocument.defaultView;
                    const multi = self._wvTabCtxTargetItems
                        ? self._wvTabCtxTargetItems(win, ctx && ctx.tabID) : null;
                    if (multi && multi.length) return multi;
                } catch (e) {}
                const one = ctx && ctx.items && ctx.items[0];
                return one ? [one] : [];
            };
            const copyAsChildren: any[] = self._wvCopyAsMenuManagerEntries(tabItemsOf);
            const copyAsSubmenu = {
                menuType: "submenu",
                icon: self._menuItemIconURLLight,
                darkIcon: self._menuItemIconURLDark,
                onShowing: (_ev, ctx) => {
                    try {
                        if (!self._getEnableCopyItemLink()) { ctx.setVisible(false); return; }
                        if (!(ctx.items && ctx.items[0])) { ctx.setVisible(false); return; }
                        ctx.setVisible(true);
                        ctx.menuElem.setAttribute("label", "Copy As");
                    } catch (e) { try { ctx.setVisible(false); } catch (e2) {} }
                },
                menus: copyAsChildren,
            };
            // "View Online", "Show File", "Open in External Viewer": the three
            // entries both tab menus add for the clicked tab's item, from the
            // one list in tabs.ts (WV_TAB_MENU_ENTRIES) as MenuManager entries.
            // MenuManager appends plugin entries at the bottom of the popup and
            // exposes no positional API; `_wvRepositionTabExternal` (see
            // `_setupTabExternalRepositioner`) moves them up under "Show in
            // Library" by their markers.
            const tabEntries: any[] = self._wvTabMenuManagerEntries();
            const id = (Zotero as any).MenuManager.registerMenu({
                menuID: "weavero-tab-copy-links",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [copyAsSubmenu, ...tabEntries],
            });
            if (id) this._tabMenuID = id;
            this._dbg("[Weavero] tab-menu registered: " + id);
        } catch (e) {
            Zotero.debug("[Weavero] _registerTabContextMenu err: " + e);
        }
    }

    _teardownTabContextMenu() {
        try {
            if (this._tabMenuID && (Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.unregisterMenu === "function") {
                (Zotero as any).MenuManager.unregisterMenu(this._tabMenuID);
            }
        } catch (e) {}
        this._tabMenuID = null;
    }

    /** Per-window popupshowing listener that moves the "Open in External
     *  Viewer" menuitem up to sit directly after "Show in Library".
     *
     *  Why this isn't a monkey-patch: TabBar.init runs at window load and
     *  captures `Zotero_Tabs._openMenu.bind(this)` into the React component
     *  (tabs.js:542). Any later override of `_openMenu` is bypassed by that
     *  captured bound reference. Listening for `popupshowing` survives
     *  hot-reload because the new listener attaches on the next plugin load
     *  and runs against the live popup whose lifecycle is independent.
     *
     *  We identify the tab popup by its first menuitem being
     *  `Zotero.getString("general.showInLibrary")`. Our own entry is
     *  marked with `data-wv-tab-external` in the MenuManager onShowing
     *  handler. */
    _setupTabExternalRepositioner(win: any) {
        try {
            if (!win || !win.document) return;
            if ((win as any)._wvTabExtRepositioner) return;
            const doc = win.document;
            const showInLib = (typeof Zotero !== "undefined" && Zotero.getString)
                ? Zotero.getString("general.showInLibrary") : null;

            // Capture the right-clicked tab id so the popupshowing handler
            // can resolve the tab's library and stamp the matching library
            // icon onto "Show in Library" (My Library → library.svg, group
            // → library-group.svg, feed → feed-library.svg — via the
            // existing `_bmShowInLibraryIcon` helper).
            const tabState = { id: null as string | null, ts: 0 };
            const plugin: any = this;
            const ctxHandler = (ev: any) => {
                try {
                    const tabEl = ev.target && ev.target.closest
                        && ev.target.closest("#tab-bar-container .tab[data-id]");
                    if (tabEl) {
                        tabState.id = tabEl.getAttribute("data-id");
                        tabState.ts = Date.now();
                    }
                } catch (_) {}
            };
            const container = doc.getElementById("tab-bar-container") || doc;
            container.addEventListener("contextmenu", ctxHandler, true);

            const handler = (ev: any) => {
                try {
                    const popup = ev.target;
                    if (!popup || popup.localName !== "menupopup") return;
                    const first = popup.firstElementChild;
                    if (!first || first.localName !== "menuitem") return;
                    const firstLabel = first.getAttribute("label");
                    if (showInLib ? (firstLabel !== showInLib)
                                  : (firstLabel !== "Show in Library")) return;

                    // Stamp the library-aware icon on "Show in Library"
                    // (only if no icon set yet, so we don't fight a future
                    // upstream addition). Tab id was captured by
                    // `ctxHandler` above; resolve to the tab's item and
                    // pass the libraryID to `_bmShowInLibraryIcon`.
                    try {
                        if (tabState.id && (Date.now() - tabState.ts) <= 1500
                            && !first.getAttribute("image")) {
                            const Z = win.Zotero_Tabs;
                            const info = Z && typeof Z._getTab === "function"
                                ? Z._getTab(tabState.id) : null;
                            const tab = info && info.tab;
                            const itemID = tab && tab.data && tab.data.itemID;
                            const item: any = itemID && Zotero.Items.get(itemID);
                            if (item && item.libraryID != null) {
                                const iconURL = plugin._bmShowInLibraryIcon
                                    && plugin._bmShowInLibraryIcon({ libraryID: item.libraryID }, win);
                                if (iconURL) {
                                    first.classList.add("menuitem-iconic");
                                    first.setAttribute("image", iconURL);
                                }
                                // For items in a group or feed library,
                                // attach the rich Weavero library card
                                // (icon + library name) to the menuitem,
                                // reusing the same `wv-tab-library-tooltip`
                                // that the tab strip itself uses. The
                                // populate handler reads the libraryID off
                                // the `data-wv-show-in-library-libid`
                                // marker we stamp here. My Library is
                                // skipped — the tooltip would just restate
                                // the obvious.
                                try {
                                    const lib: any = Zotero.Libraries.get(item.libraryID);
                                    if (lib && lib.libraryType && lib.libraryType !== "user"
                                            && lib.name && !first.getAttribute("tooltip")) {
                                        first.setAttribute(
                                            "tooltip", "wv-tab-library-tooltip");
                                        first.setAttribute(
                                            "data-wv-show-in-library-libid",
                                            String(item.libraryID));
                                    }
                                } catch (_) {}
                            }
                        }
                    } catch (_) {}

                    // Pull the "top cluster" items up to sit right after "Show in
                    // Library", in the CANONICAL order (`_wvTabMenuOrder()` in
                    // tabs.ts) — so the main-window native menu matches every other
                    // window's tab menu (Move Tab above View Online, then Show File,
                    // External Viewer, …). One source of truth; native items below
                    // the cluster stay where Zotero put them.
                    let anchor: any = first;
                    try {
                        const lp2: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        const order: string[] = (lp2 && lp2._wvTabMenuOrder) ? lp2._wvTabMenuOrder() : [];
                        const TOP = new Set(["viewOnline", "showFile", "externalViewer",
                                             "openNotes", "removeFromGroup", "groupTab",
                                             "moveTab"]);
                        const found: any = {};
                        for (const ch of Array.from(popup.children) as any[]) {
                            const k = (lp2 && lp2._wvTabMenuItemKey) ? lp2._wvTabMenuItemKey(ch) : null;
                            if (k && TOP.has(k) && !found[k]) found[k] = ch;
                        }
                        for (const key of order) {
                            if (!TOP.has(key)) continue;
                            const el = found[key];
                            if (!el || el.parentNode !== popup) continue;
                            if (anchor.nextElementSibling !== el) anchor.after(el);
                            anchor = el;
                        }
                    } catch (_) {}
                } catch (e) {
                    Zotero.debug("[Weavero] tab popupshowing reposition err: " + e);
                }
            };
            // Bubble phase, NOT capture: MenuManager's `onShowing` hooks
            // (which set our `data-wv-tab-external` attribute and labels)
            // run at the popup's target phase, between capture and bubble.
            // Listening in capture means we'd run before MenuManager and
            // the entry wouldn't be there to find.
            doc.addEventListener("popupshowing", handler, false);
            (win as any)._wvTabExtRepositioner = { handler, ctxHandler, container };
        } catch (e) {
            Zotero.debug("[Weavero] _setupTabExternalRepositioner err: " + e);
        }
    }

    _teardownTabExternalRepositioner(win: any) {
        try {
            if (!win) return;
            const wired = (win as any)._wvTabExtRepositioner;
            if (!wired) return;
            try { win.document.removeEventListener("popupshowing", wired.handler, false); } catch (_) {}
            try { wired.container.removeEventListener("contextmenu", wired.ctxHandler, true); } catch (_) {}
            delete (win as any)._wvTabExtRepositioner;
        } catch (e) {}
    }

    /** Watch for the Mozilla "Software Update" wizard (`Update:Wizard`) to
     *  open, and append a small "Currently installed" line showing the
     *  running Zotero version inside each wizardpage's content vbox. The
     *  built-in dialog never displays the current version anywhere — only
     *  "No Updates Found" — which is mildly frustrating when you're trying
     *  to confirm what build you're on. Cosmetic-only; the rest of the
     *  dialog is untouched. */
    _setupUpdateWindowListener() {
        if ((this as any)._wvUpdateWinListener) return;
        const inject = (w: any) => {
            try {
                if (!w || !w.document) return;
                const wiz = w.document.querySelector("wizard");
                if (!wiz) return;
                // Match the "About Zotero" dialog's version-line format:
                //   `${Zotero.version} (${64|32}-bit)` on Windows/Linux,
                //   plain `Zotero.version` on macOS (no bitness suffix).
                // (Source: chrome/content/zotero/about.xhtml#L31-37.)
                let ver = (typeof Zotero !== "undefined" && Zotero.version) || "?";
                try {
                    if (typeof Zotero !== "undefined" && !Zotero.isMac
                        && (Services as any).appinfo) {
                        ver += " (" + ((Services as any).appinfo.is64Bit ? "64" : "32") + "-bit)";
                    }
                } catch (_) {}
                const versionText = "Currently installed: Zotero " + ver;
                // One-shot stylesheet that overrides Mozilla's chrome-level
                // `user-select: none` so the user can SELECT + COPY any
                // text inside the dialog (version line, "No Updates Found"
                // header, "There are no updates available" body, etc.).
                if (!w.document.getElementById("wv-update-win-style")) {
                    const style = wvHtmlEl(w.document, "style");
                    style.id = "wv-update-win-style";
                    style.textContent = "#updates, #updates label, #updates description,"
                        + " #updates wizardpage, #updates .wv-update-current-version {"
                        + " -moz-user-select: text !important;"
                        + " user-select: text !important; }";
                    (w.document.documentElement || w.document.body || wiz).appendChild(style);
                }

                const pages = w.document.querySelectorAll("wizardpage");
                for (const page of pages) {
                    if (page.querySelector(".wv-update-current-version")) continue;
                    const host = page.querySelector("vbox.update-content") || page;
                    if (!host) continue;
                    const sep = w.document.createXULElement("separator");
                    sep.setAttribute("class", "thin wv-update-current-version-sep");
                    // XUL <description> (real child text nodes — NOT
                    // `<label value="…">`) so the text stays user-
                    // selectable while inheriting the parent vbox's
                    // native left alignment. The earlier HTML <span>
                    // (with display:block / margin-top inline) was
                    // visually shifted right of the surrounding XUL
                    // <description>s because of the box-model mismatch
                    // — `description` aligns natively without inline
                    // overrides.
                    const lbl = w.document.createXULElement("description");
                    lbl.setAttribute("class", "wv-update-current-version");
                    lbl.textContent = versionText;
                    lbl.setAttribute("style",
                        "opacity: 0.7; margin-top: 8px;"
                        + " font: inherit; color: inherit;");
                    host.appendChild(sep);
                    host.appendChild(lbl);
                }
            } catch (e) {
                Zotero.debug("[Weavero] update-win inject err: " + e);
            }
        };
        const onLoad = (w: any) => {
            try {
                if (!w || !w.document || !w.document.documentElement) return;
                const wt = wvWinType(w);
                if (wt !== "Update:Wizard") return;
                inject(w);
            } catch (e) {
                Zotero.debug("[Weavero] update-win load err: " + e);
            }
        };
        const listener: any = {
            onOpenWindow: (xulWindow: any) => {
                try {
                    const w = xulWindow.docShell && xulWindow.docShell.domWindow;
                    if (!w) return;
                    wvWhenWindowLoaded(w, onLoad);   // not a readyState check: see lib/dom.ts
                } catch (e) {}
            },
            onCloseWindow: () => {},
            onWindowTitleChange: () => {},
        };
        try { Services.wm.addListener(listener); }
        catch (e) { Zotero.debug("[Weavero] update-win addListener err: " + e); return; }
        (this as any)._wvUpdateWinListener = listener;
        // Already-open windows (rare on first install, but safe to scan).
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (wvWinType(w) === "Update:Wizard") {
                    inject(w);
                }
            }
        } catch (_) {}
    }

    _teardownUpdateWindowListener() {
        try {
            const l = (this as any)._wvUpdateWinListener;
            if (!l) return;
            try { Services.wm.removeListener(l); } catch (_) {}
            (this as any)._wvUpdateWinListener = null;
            // Strip injected labels from any open update window so a
            // restart-less reload leaves the dialog clean.
            try {
                const en = Services.wm.getEnumerator(null);
                while (en.hasMoreElements()) {
                    const w: any = en.getNext();
                    if (!w || !w.document) continue;
                    const wt = wvWinType(w);
                    if (wt !== "Update:Wizard") continue;
                    for (const n of w.document.querySelectorAll(".wv-update-current-version")) {
                        try {
                            const prev = n.previousElementSibling;
                            if (prev && prev.localName === "separator"
                                && prev.classList.contains("wv-update-current-version-sep")) {
                                prev.remove();
                            }
                            n.remove();
                        } catch (_) {}
                    }
                    try { w.document.getElementById("wv-update-win-style")?.remove(); }
                    catch (_) {}
                }
            } catch (_) {}
        } catch (_) {}
    }

    /** Hook the collections-tree right-click menu
     *  (`#zotero-collectionmenu`) and insert "Copy Collection Link" on
     *  a collection row, or "Copy Saved Search Link" on a saved-search
     *  row (`zotero://select/<lib>/collections/<key>` resp.
     *  `…/searches/<key>`). Zotero doesn't expose a copy-link
     *  affordance for either by default; this matches the items-list
     *  copy-link entry so users have a consistent way to drop
     *  `zotero://select/...` URIs.
     *
     *  Same lifecycle as `_setupItemsListContextMenu`: bind once,
     *  rebuild the entry on each open, strip on `popuphidden` so we
     *  never leave a stale entry. */
    _setupCollectionsContextMenu() {
        try {
            // Pref gate (URI utilities → Copy Collection Link).
            // Skip the binding entirely when the toggle is off so the
            // popupshowing handler doesn't even run.
            if (!this._getEnableCopyCollectionLink()) {
                this._teardownCollectionsContextMenu();
                return;
            }
            // EVERY main window (survey 2026-10-06 #17): bound to
            // getMainWindow() alone, one window had the entry and closing
            // any main window removed it from that one too. Same per-menu
            // handler list as the items menu. Guard: test/survey-fixes-e.spec.js.
            for (const w of (Zotero.getMainWindows() || [])) {
                try { this._setupCollectionsMenuForWindow(w); } catch (e) {}
            }
        } catch (e) {
            Zotero.debug("[Weavero] _setupCollectionsContextMenu err: " + e);
        }
    }

    _setupCollectionsMenuForWindow(win: any) {
        try {
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-collectionmenu");
            if (!menu) return;
            this._removeCollectionMenuHandlerFor(menu);   // dedup THIS window only
            const COPY_COLL_ID   = "wv-collectionmenu-copy-link";
            const COPY_SEARCH_ID = "wv-collectionmenu-copy-search-link";
            const ALL_IDS = [COPY_COLL_ID, COPY_SEARCH_ID];
            // `zotero://select/<lib-prefix>/<collections|searches>/<key>`.
            const buildCollectionURI = (col) =>
                "zotero://select/" + this._zoteroLibPrefix(col.libraryID)
                + "/collections/" + col.key;
            const buildSearchURI = (s) =>
                "zotero://select/" + this._zoteroLibPrefix(s.libraryID)
                + "/searches/" + s.key;
            // Append a copy-link menuitem. `resolve()` re-reads the
            // selected object at click time (the selection may move
            // between popupshowing and the actual click).
            const addEntry = (id, label, resolve, buildURI) => {
                const cl = doc.createXULElement("menuitem");
                cl.id = id;
                cl.setAttribute("label", label);
                const linkIconURL = this._menuItemIconURL;
                if (linkIconURL) {
                    cl.classList.add("menuitem-iconic");
                    cl.setAttribute("image", linkIconURL);
                }
                cl.addEventListener("command", () => {
                    try {
                        const obj = resolve();
                        if (!obj || !obj.key) return;
                        Zotero.Utilities.Internal.copyTextToClipboard(buildURI(obj));
                    } catch (cmdErr) {
                        Zotero.debug("[Weavero] collectionmenu copy-link cmd err: " + cmdErr);
                    }
                });
                menu.appendChild(cl);
            };
            const onShowing = () => {
                try {
                    for (const id of ALL_IDS) {
                        const stale = doc.getElementById(id);
                        if (stale) stale.remove();
                    }
                    const zp = win.ZoteroPane;
                    // `getSelectedCollection` returns the Collection for
                    // a collection row, false otherwise; `getSelected
                    // SavedSearch` returns the Search for a saved-search
                    // row. Library roots, feeds, trash, etc. give false
                    // for both → no entry.
                    const col = this._wvSelectedCollection(win);
                    if (col && col.key) {
                        addEntry(COPY_COLL_ID, "Copy Collection Link",
                            () => this._wvSelectedCollection(win),
                            buildCollectionURI);
                        return;
                    }
                    const search = this._wvSelectedSavedSearch(win);
                    if (search && search.key) {
                        addEntry(COPY_SEARCH_ID, "Copy Saved Search Link",
                            () => this._wvSelectedSavedSearch(win),
                            buildSearchURI);
                    }
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] collectionmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = (ev: any) => {
                // Ignore popuphidden events that bubbled up from descendant
                // submenu popups. See `_setupItemsListContextMenu` for
                // the full rationale (issue #8).
                if (!ev || ev.target !== menu) return;
                try {
                    for (const id of ALL_IDS) {
                        const el = doc.getElementById(id);
                        if (el) el.remove();
                    }
                } catch (e) {}
            };
            const onShowingGuarded = (ev: any) => {
                if (!ev || ev.target !== menu) return;
                onShowing();
            };
            menu.addEventListener("popupshowing", onShowingGuarded);
            menu.addEventListener("popuphidden", onHidden);
            if (!this._collectionMenuHandlersList) this._collectionMenuHandlersList = [];
            this._collectionMenuHandlersList.push({ menu, onShowing: onShowingGuarded, onHidden });
        } catch (e) {
            Zotero.debug("[Weavero] _setupCollectionsMenuForWindow err: " + e);
        }
    }

    /** Remove (and unbind) any previously-bound handler for a specific menu. */
    _removeCollectionMenuHandlerFor(menu: any) {
        if (!this._collectionMenuHandlersList) { this._collectionMenuHandlersList = []; return; }
        this._collectionMenuHandlersList = this._collectionMenuHandlersList.filter((h: any) => {
            if (h.menu !== menu) return true;
            try { menu.removeEventListener("popupshowing", h.onShowing); } catch (e) {}
            try { menu.removeEventListener("popuphidden", h.onHidden); } catch (e) {}
            try {
                for (const id of ["wv-collectionmenu-copy-link", "wv-collectionmenu-copy-search-link"]) {
                    const stale = menu.ownerDocument.getElementById(id);
                    if (stale) stale.remove();
                }
            } catch (e) {}
            return false;
        });
    }

    /** One window's menu, or every window's with no argument. */
    _teardownCollectionsContextMenu(win?: any) {
        if (win) {
            try {
                const menu = win.document && win.document.getElementById("zotero-collectionmenu");
                if (menu) this._removeCollectionMenuHandlerFor(menu);
            } catch (e) {}
            return;
        }
        for (const h of (this._collectionMenuHandlersList || []).slice()) {
            try { this._removeCollectionMenuHandlerFor(h.menu); } catch (e) {}
        }
        this._collectionMenuHandlersList = [];
    }


    // ---- Items tree (event delegation — no DOM injection, no blink) --------

    // ---- Items tree helpers -----------------------------------------------

    /** Scan visible annotation-comment cells, stamp data-has-rich, and inject
     *  colored URL spans. `docArg`: the window's document when called from
     *  that window's mark observer (#17); the focused main window's otherwise. */
    _markCellLinks(docArg?: any) {
        if (!this._getEnableItemsList()) {
            this._stripItemsList(docArg);
            // The row decorations at the end of this pass are NOT link
            // features: Selection Target dimming / match styling (Sort &
            // Filters) and the Added By tints (Visual extras) must keep
            // repainting rows that scroll into view when the items-list
            // link surface is off (survey 2026-10-06; each gates itself).
            try {
                const doc = docArg || Zotero.getMainWindow().document;
                this._paintAddedByCells(doc);
                this._applySelectionTargetVisuals(doc.defaultView);
            } catch (e) {}
            return;
        }
        try {
            const doc = docArg || Zotero.getMainWindow().document;
            const allCells: any = doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment");
            this._dbg("[Weavero] _markCellLinks: found " + allCells.length + " annotation cells");
            let stamped = 0;
            const wantInline = this._getInlineLinks();
            for (const cell of allCells) {
                // Already processed (in either mode) — .wv-text-wrap is set
                // by every full rebuild. Skip if the wrap matches the current
                // mode (inline ↔ has spans, icons-only ↔ no spans). On a
                // mismatch (e.g. virtualized cell rendered before the user
                // toggled), flatten and fall through to a fresh rebuild.
                if (cell.querySelector(".wv-text-wrap")) {
                    const cachedWrap = cell.querySelector(".wv-text-wrap");
                    const cachedMode = cachedWrap.getAttribute("data-render-mode") || "url";
                    const t = cell.getAttribute("data-comment-text")
                        || (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                    // wantMode key combines inline state with whether
                    // markdown rendering should fire for this comment.
                    // Mode key encodes which inline-mode sub-toggles affect
                    // THIS cell. URL-bearing text + URLs sub on → "url".
                    // Markdown text + Markdown sub on → "md". Both → "url+md".
                    // Neither (URLs/Md off OR text has none of either) → "plain".
                    let wantMode;
                    if (!wantInline) {
                        wantMode = "plain";
                    } else {
                        const norm_t = this.normalize(t);
                        const wantMd = this._getEnableCommentMarkdown()
                            && this.MD_REGEX.test(norm_t);
                        // URL_REGEX excludes schemes whose master is
                        // off (URLs/Zotero/App Links each remove their
                        // alternation from URL_SCHEME_ALT), so no
                        // additional `_getEnableInlineUrls() && ...`
                        // gate — that hid Zotero/app links when URLs
                        // was off.
                        const wantUrl = this.URL_REGEX.test(norm_t);
                        if (wantMd && wantUrl) wantMode = "url+md";
                        else if (wantMd) wantMode = "md";
                        else if (wantUrl) wantMode = "url";
                        else wantMode = "plain";
                    }
                    // Validate the wrap actually still has the right rendered
                    // structure. Zotero's items-tree React reconciliation
                    // has been observed to keep our .wv-text-wrap element
                    // (with its data-render-mode attribute) but strip the
                    // span children — leaving the wrap with just a text
                    // node, which renders the comment as plain unstyled
                    // text. The cache check therefore needs to verify that
                    // expected spans are still present, not just that the
                    // wrap is non-empty.
                    const sourceEmpty = !t;
                    const wrapEmpty = !cachedWrap.firstChild;
                    const sourceHasURL = !sourceEmpty
                        && this.URL_REGEX.test(this.normalize(t));
                    const expectURLSpan = sourceHasURL
                        && (wantMode === "url" || wantMode === "url+md");
                    const wrapMissingURLSpan = expectURLSpan
                        && !cachedWrap.querySelector(".wv-url-span");
                    const sourceHasMD = !sourceEmpty
                        && this._getEnableCommentMarkdown()
                        && this.MD_REGEX.test(this.normalize(t));
                    const expectMdSpan = sourceHasMD && wantMode === "url+md";
                    const wrapMissingMdSpan = expectMdSpan
                        && !cachedWrap.querySelector(".wv-md");
                    const cacheValid = cachedMode === wantMode
                        && !(wrapEmpty && !sourceEmpty)
                        && !wrapMissingURLSpan
                        && !wrapMissingMdSpan;
                    // Rebuild rate limit: when Zotero's React reconciliation
                    // strips our spans, we'd normally rebuild → it strips
                    // again → observer fires → rebuild → forever (Zotero
                    // hangs). Per-cell rebuild timestamp lets us bail out
                    // if we just rebuilt this cell. The retry-rebuild
                    // scheduled below in _applyInlineLinksPref picks up
                    // legitimate strips after the rate-limit window.
                    const lastRebuild = parseInt(
                        cell.getAttribute("data-wv-last-rebuild") || "0", 10);
                    const tooSoon = (Date.now() - lastRebuild) < 300;
                    if (cacheValid || (!cacheValid && tooSoon)) {
                        this._dbg("[Weavero] cache HIT mode=" + cachedMode
                            + " text=" + JSON.stringify(t.slice(0, 40))
                            + (cacheValid ? "" : " (rate-limited)"));
                        if (!cell.hasAttribute("data-has-rich")) {
                            if (this._commentHasIconableContent(t)) { cell.setAttribute("data-has-rich", "true"); stamped++; }
                        }
                        // data-icon-wanted gates the items-tree chain icon's
                        // visibility per the mode-aware _iconWantedFor (Inline
                        // = URL-only; Icon mode = per-content-type sub-toggles).
                        // ALWAYS update on cache HIT — the new icon sub-toggles
                        // can flip this without changing wantMode.
                        if (this._iconWantedFor(t)) {
                            cell.setAttribute("data-icon-wanted", "true");
                        } else {
                            cell.removeAttribute("data-icon-wanted");
                        }
                        // Stamp data-has-url so CSS can hide the icon
                        // for markdown-only cells when the pref is off.
                        if (this.URL_REGEX.test(this.normalize(t))) {
                            cell.setAttribute("data-has-url", "true");
                        } else {
                            cell.removeAttribute("data-has-url");
                        }
                        if (!cell.querySelector(".wv-tree-icon")) {
                            const ic = doc.createElement("span");
                            ic.className = "wv-tree-icon";
                            this._applyIconState(ic, t);
                            cell.appendChild(ic);
                        }
                        // Patch hover-tooltip title onto URL spans that
                        // were created by an earlier plugin version
                        // (pre-0.1.47) which didn't set the attribute.
                        // Without this, the cache-HIT path would leave
                        // old spans title-less indefinitely. URL source:
                        // data-href (markdown-link span) or textContent
                        // (plain-URL span).
                        for (const sp of cachedWrap.querySelectorAll(".wv-url-span")) {
                            if (!sp.hasAttribute("title")) {
                                const u = sp.getAttribute("data-href")
                                    || sp.textContent || "";
                                if (u) sp.setAttribute("title", u);
                            }
                        }
                        continue;
                    }
                    this._dbg("[Weavero] cache MISS cached=" + cachedMode
                        + " want=" + wantMode + " text=" + JSON.stringify(t.slice(0, 40)));
                    // Mode mismatch: flatten the cell so the rebuild path
                    // below sees raw text and produces output in the new mode.
                    const stashed = cell.getAttribute("data-comment-text");
                    const wrap = cell.querySelector(".wv-text-wrap");
                    const flatText = stashed
                        || (wrap ? (wrap.textContent || "") : "")
                        || (cell.textContent || "").replace(/[\s\u00A0]*🔗\s*$/, "").trim();
                    cell.textContent = flatText;
                    cell.removeAttribute("data-has-rich");
                    cell.removeAttribute("data-icon-wanted");
                    cell.removeAttribute("data-comment-text");
                    cell.removeAttribute("data-truncated");
                    cell.removeAttribute("data-has-url");
                    // fall through to rebuild
                }

                // Source text: prefer the stashed data-comment-text (clean
                // raw text) over cell.textContent (which would include any
                // leftover icon glyphs and re-introduce them on rebuild).
                const text = (
                    cell.getAttribute("data-comment-text")
                    || (cell.textContent || "")
                          .replace(/[\s\u00A0]*🔗\s*$/, "")
                ).trim();
                if (!this._commentHasIconableContent(text)) {
                    // No URL/markdown content. But the comment may
                    // still overflow visually — wrap the plain text
                    // in .wv-text-wrap and keep a wv-tree-icon
                    // element so _updateTruncationFlags can detect
                    // overflow and show the icon as a "click to see
                    // full text" affordance via the
                    // [data-truncated="true"] CSS rule. Without
                    // this the icon disappears entirely when (e.g.)
                    // the URLs toggle hides the only URL in a long
                    // comment that was previously the icon's reason
                    // to exist.
                    cell.setAttribute("data-has-rich", "true");
                    cell.removeAttribute("data-icon-wanted");
                    cell.removeAttribute("data-has-url");
                    cell.setAttribute("data-comment-text", text);
                    const plainWrap = doc.createElement("span");
                    plainWrap.className = "wv-text-wrap";
                    plainWrap.setAttribute("data-render-mode", "plain");
                    plainWrap.textContent = text;
                    const plainIcon = doc.createElement("span");
                    plainIcon.className = "wv-tree-icon";
                    this._applyIconState(plainIcon, text);
                    while (cell.firstChild) cell.removeChild(cell.firstChild);
                    cell.appendChild(plainWrap);
                    cell.appendChild(plainIcon);
                    cell.setAttribute("data-wv-last-rebuild", String(Date.now()));
                    continue;
                }
                cell.setAttribute("data-has-rich", "true");
                if (this._iconWantedFor(text)) {
                    cell.setAttribute("data-icon-wanted", "true");
                } else {
                    cell.removeAttribute("data-icon-wanted");
                }
                if (this.URL_REGEX.test(this.normalize(text))) {
                    cell.setAttribute("data-has-url", "true");
                } else {
                    cell.removeAttribute("data-has-url");
                }
                stamped++;

                // Rebuild cell content. In inline mode we render URLs and
                // (if comment-markdown is on) markdown formatting via the
                // unified `_buildCommentFragment` helper (see reader.ts) —
                // single source of truth for span emission so any future
                // per-scheme toggle gates in one place.
                const norm = this.normalize(text);
                const inlineMode = this._getInlineLinks();
                const useMd = inlineMode && this._getEnableCommentMarkdown();
                let frag;
                if (inlineMode) {
                    frag = this._buildCommentFragment(text, {
                        doc, useMd, isTreeMode: true,
                    });
                    // Cell-renderer-specific styling: inline `color` on
                    // each url-span so the active theme's CSS variable
                    // propagates without a re-render. The unified helper
                    // doesn't add this (popup/sidebar don't need it).
                    for (const sp of (frag as any).querySelectorAll(".wv-url-span")) {
                        const cls = this._urlLinkClass(sp.getAttribute("data-href") || sp.textContent || "");
                        sp.style.setProperty("color", "var(--" + cls + ")", "important");
                    }
                } else {
                    // Icons-only mode: plain text only.
                    frag = doc.createDocumentFragment();
                    frag.appendChild(doc.createTextNode(norm));
                }
                // inlineUrls retained for the cache-key / renderMode
                // computation below — it's just inlineMode now (URL
                // gating moved into URL_SCHEME_ALT).
                const inlineUrls = inlineMode;

                // Wrap text/url-spans in .wv-text-wrap so flex ellipsis
                // clips them without touching the icon's slot.
                const wrap = doc.createElement("span");
                wrap.className = "wv-text-wrap";
                // Record the mode we just rendered in so the cache check
                // on the next pass can detect pref/text changes.
                let renderMode;
                if (!inlineMode) {
                    renderMode = "plain";
                } else {
                    const hasMd = useMd && this.MD_REGEX.test(norm);
                    const hasUrl = inlineUrls && this.URL_REGEX.test(norm);
                    if (hasMd && hasUrl) renderMode = "url+md";
                    else if (hasMd) renderMode = "md";
                    else if (hasUrl) renderMode = "url";
                    else renderMode = "plain";
                }
                wrap.setAttribute("data-render-mode", renderMode);
                wrap.appendChild(frag);

                // Real-DOM tree icon (shown in Icon & popup mode / on truncated rows)
                const treeIcon = doc.createElement("span");
                treeIcon.className = "wv-tree-icon";
                this._applyIconState(treeIcon, text);

                // Stash the clean comment text so the popup handler doesn't
                // pick up the trailing 🔗 from textContent.
                cell.setAttribute("data-comment-text", norm);

                while (cell.firstChild) cell.removeChild(cell.firstChild);
                cell.appendChild(wrap);
                cell.appendChild(treeIcon);
                // Re-insert the Added By badge — the rebuild above
                // wipes it. Reads `data-wv-added-by[-color]` set by
                // the annotation-row renderRow patch.
                try { this._appendAddedByBadgeFromCell(cell); } catch (e) {}

                // v0.0.128 diagnostic: log every rebuild so we can see if
                // _markCellLinks is firing and what it produces.
                cell.setAttribute("data-wv-last-rebuild", String(Date.now()));
                this._dbg("[Weavero] rebuild: useMd=" + useMd
                    + " mode=" + renderMode
                    + " input=" + JSON.stringify(text.slice(0, 60))
                    + " result=" + JSON.stringify(wrap.textContent.slice(0, 60))
                    + " childCount=" + wrap.children.length
                    + " urlSpans=" + cell.querySelectorAll(".wv-url-span").length);
            }
            this._dbg("[Weavero] _markCellLinks: stamped " + stamped + " cells with data-has-rich");

            // Note-annotation rows in the items tree don't use `.tight` and
            // store their text in `.cell.title > span.cell-text` instead of
            // `.cell.annotation-comment`. Color URLs there too. Regular
            // annotation rows don't have `.cell-text` inside their comment
            // cell, so this selector matches note rows only.
            const noteSpans = doc.querySelectorAll(".annotation-row .cell-text");
            let noteMarked = 0;
            for (const span of noteSpans) {
                if (this._markTextLinks(span, { mode: "tree" })) noteMarked++;
            }
            if (noteMarked) {
                this._dbg("[Weavero] _markCellLinks: marked "
                    + noteMarked + " note-annotation cells");
            }

            // Note ITEMS (standalone / child notes) in the items tree show
            // their first line in `.cell.title .cell-text`. Colour URLs there
            // too so a bare link in a note's first line is clickable in the
            // library view (the generic `.wv-url-span` click/colour/hover
            // handlers already cover any tree row). linksOnly: a note title
            // isn't a markdown body, so don't strip markers from it.
            // `_markTextLinks` is idempotent, so the tree mutation observer
            // re-firing this pass settles without a loop.
            // NB: `data-item-type` lives on the ROW'S ICON, not the row, so we
            // key off `.cell.title .icon[data-item-type="note"]` and mark its
            // sibling `.cell-text`.
            let noteItemMarked = 0;
            if (this._getEnableNotesList()) {
                for (const icon of doc.querySelectorAll(
                        ".cell.title .icon[data-item-type=\"note\"]") as any) {
                    const cell = icon.closest(".cell.title");
                    const ct = cell && cell.querySelector(".cell-text");
                    if (ct && this._markTextLinks(ct, { mode: "tree", linksOnly: true })) noteItemMarked++;
                }
            }
            if (noteItemMarked) {
                this._dbg("[Weavero] _markCellLinks: marked "
                    + noteItemMarked + " note-item title cells");
            }

            // After layout settles, mark cells whose text-wrap is overflowing
            // so the icon shows as a fallback even when the pref is off.
            const win = doc.defaultView;
            if (win && win.requestAnimationFrame) {
                win.requestAnimationFrame(() => {
                    try { this._updateTruncationFlags(doc); }
                    catch(e) { Zotero.debug("[Weavero] truncation flag error: " + e); }
                });
            }

            // Relations icon — anchored to the right edge of every
            // annotation row that has related items, regardless of
            // whether the comment has URLs or markdown. Runs AFTER the
            // cell-rebuild loop above (which wipes children) so the icon
            // survives. Idempotent: skips cells whose annotation already
            // has the icon attached.
            for (const cell of allCells) {
                this._decorateAnnotationRowRelations(cell);
            }
            // Cover the OTHER annotation row layouts: note / area /
            // ink / image / text annotations, and highlight/underline
            // annotations without a comment, all use a different
            // upstream layout — the row has no `.annotation-comment`
            // cell because the displayable text is in `.cell.title`.
            // These rows otherwise wouldn't get the related-items
            // indicator. Decorate the title cell instead.
            // (See itemTreeRow.js — `.annotation-comment` is added
            // only for `["highlight", "underline"].includes(type)`
            // AND when `annotationComment` is set.)
            const otherRows: any = doc.querySelectorAll(".annotation-row");
            for (const row of otherRows) {
                if (row.querySelector(":scope > .cell.annotation-comment")) {
                    continue; // handled in the loop above
                }
                const titleCell = row.querySelector(":scope > .cell.title");
                if (titleCell) {
                    this._decorateAnnotationRowRelations(titleCell);
                }
            }
            // Per-user color tinting on the built-in Added By column.
            // Skip when the colors pref is off (clear any prior tint).
            this._paintAddedByCells(doc);
            // Selection Target visual state — apply `.wv-not-target`
            // to row divs whose kind isn't in the selection-target
            // tick set (mirrors Zotero's `.context-row` behaviour).
            this._applySelectionTargetVisuals(doc.defaultView);
        } catch(e) {
            Zotero.debug("[Weavero] _markCellLinks error: " + e);
        }
    }

    // =====================================================================
    // (filter.ts methods _pauseFilterPatches and _patchIsSelectable that
    //  physically lived between this and the next pane block have been
    //  hoisted into modules/filter.ts.)
    // =====================================================================

    /** Walk visible items-tree rows and toggle `.wv-not-target` based
     *  on the row's kind vs `_filterState.selectionTarget`. Together
     *  with the CSS rule on `.wv-not-target:not(.selected)` and the
     *  `isSelectable` patch (see `_patchIsSelectable`), this
     *  reproduces Zotero's quick-search context-row behaviour:
     *  unticked kinds are dimmed AND skipped by Ctrl+A select-all. */
    _applySelectionTargetVisuals(winArg?: any) {
        try {
            // Per window (survey 2026-10-06 step 4): the tree painted is the
            // caller's window's, else the filter's target window -- the same
            // window `_filterState` (read below) binds to. The focused window
            // was painted with another window's state before.
            // Pref gate (Filters group → Selection Target).
            if (!this._getEnableSelectionTarget()) {
                // When toggled off, clear any wv-not-target classes so
                // previously-dimmed rows return to normal.
                try {
                    const win0 = winArg || this._wvFilterTargetWin();
                    const doc0 = win0 && win0.document;
                    if (doc0) {
                        for (const r of doc0.querySelectorAll(".row.wv-not-target") as any) {
                            r.classList.remove("wv-not-target");
                        }
                    }
                } catch (e) {}
                return;
            }
            // Re-attempt the isSelectable prop-patch on every paint —
            // React replaces props on each re-render, so a single
            // patch at init can be wiped. Idempotent.
            try { this._patchIsSelectable(); } catch (e) {}
            const win = winArg || this._wvFilterTargetWin();
            const doc = win && win.document;
            if (!doc) return;
            // Keep the Selection Target chip cue in an open filter popup in
            // sync with whatever the resolved target currently is.
            try {
                const popup: any = doc.getElementById("wv-filter-popup");
                if (popup && (popup.state === "open" || popup.state === "showing")) {
                    this._updateSelectionTargetAutoCues(popup);
                }
            } catch (e) {}
            const tree = doc.getElementById("item-tree-main")
                || doc.getElementById("item-tree-main-default");
            if (!tree) return;
            // Resolved Selection Target — explicit chips, or the smart
            // default inferred from the active filters (e.g. annotation
            // filters → annotations). Shared with the Ctrl+A gate
            // (`_patchIsSelectable`), so the dimmed rows match what
            // select-all will actually pick.
            const eff = this._effectiveSelectionTargetKinds();
            const allOn = !!(eff.parent && eff.attachment && eff.note && eff.annotation);
            const state = this._filterState;
            // The ∩ multi-collection mode only narrows the rows; it paints
            // no match / non-target styling (independent of the filter).
            const filterActive = !!state && this._wvUserFilterActive(state);
            const qsValue = this._currentQuickSearchValue;
            const rows: any = tree.querySelectorAll(".row");
            for (const row of rows) {
                const item = this._getItemFromTreeRow(row);
                if (!item) {
                    row.classList.remove("wv-not-target");
                    row.classList.remove("wv-primary");
                    continue;
                }
                // Use the canonical `_rowKindOf` mapping rather
                // than re-deriving here — that helper correctly
                // classifies **child notes** (item notes) as
                // `attachment` (they sit at the attachment tree
                // level) and **standalone notes** as `parent`.
                // Re-deriving naively (`!isAnnotation && !isAttachment
                // → parent`) would lump child notes into the
                // `parent` bucket and incorrectly leave them white
                // when Selection Target is restricted to Parent.
                const kind = this._rowKindOf(item) || "parent";
                const kindOK = !!eff[kind];
                let primary = true;
                if (filterActive) {
                    try { primary = this._rowIsPrimary(item, state); }
                    catch (e) { primary = true; }
                }
                // Demote primary when Zotero tagged this as a
                // `context-row` (parent-promoted by the quick-
                // search, its own data didn't match) AND it would
                // ONLY be primary via the quick-search kind-match.
                // Re-evaluate without the search to see if some
                // other chip independently picks the row — if not,
                // it's an ancestor of a search match, not a real
                // match itself. Without this demotion, every
                // parent of a search-matched attachment would
                // render white even when its own title doesn't
                // match the query.
                let realPrimary = primary;
                if (filterActive && primary && qsValue
                    && row.classList && row.classList.contains("context-row")) {
                    const saved = this._currentQuickSearchValue;
                    try {
                        this._currentQuickSearchValue = "";
                        const primNoQS = this._rowIsPrimary(item, state);
                        if (!primNoQS) realPrimary = false;
                    } catch (e) {}
                    this._currentQuickSearchValue = saved;
                }
                row.classList.toggle("wv-not-target",
                    (!allOn && !kindOK) || (filterActive && !realPrimary));
                row.classList.toggle("wv-primary", filterActive && realPrimary);
            }
        } catch (e) {
            Zotero.debug("[Weavero] _applySelectionTargetVisuals err: " + e);
        }
    }

    /** Wrap the user name in the built-in `addedBy` column with a
     *  per-user color pill matching `.wv-annotation-added-by` so the
     *  two surfaces read as one design. The pill is `max-width: 100%`
     *  with its own `text-overflow: ellipsis`, so the column width is
     *  never increased — long names truncate inside the pill. Header
     *  cells (which contain `.draggable` resizer + `.label` children)
     *  live in `.virtualized-table-header`, not `.row`, so the
     *  `.row .cell.addedBy` selector skips them. When the colors pref
     *  is off (or text is empty) any prior pill is unwrapped back to
     *  plain text. Idempotent: re-runs on every `_markCellLinks`
     *  pass. */
    _paintAddedByCells(doc) {
        try {
            const itemsTree = doc.getElementById("item-tree-main")
                || doc.getElementById("item-tree-main-default");
            if (!itemsTree) return;
            const cells: any = itemsTree.querySelectorAll(
                ".row .cell.addedBy");
            const colorOn = this._getEnableAddedByColors();
            for (const cell of cells) {
                const existing = cell.querySelector(
                    ":scope > .wv-added-by-pill");
                const name = (existing
                    ? existing.textContent
                    : cell.textContent || "").trim();
                if (!colorOn || !name) {
                    // Unwrap to plain text when colors are off or
                    // there's no name.
                    if (existing) {
                        cell.textContent = name;
                    }
                    continue;
                }
                const colour = this._colorForUser(name);
                const bg = this._withAlpha(colour, 0.18);
                if (existing) {
                    if (existing.dataset.wvName === name
                        && existing.dataset.wvColor === colour) {
                        continue;
                    }
                    existing.textContent = name;
                    existing.style.color = colour;
                    existing.style.backgroundColor = bg;
                    existing.dataset.wvName = name;
                    existing.dataset.wvColor = colour;
                    continue;
                }
                const span = wvHtmlEl(doc, "span", "wv-added-by-pill", name);
                span.style.color = colour;
                span.style.backgroundColor = bg;
                span.dataset.wvName = name;
                span.dataset.wvColor = colour;
                cell.textContent = "";
                cell.appendChild(span);
            }
        } catch (e) {
            Zotero.debug("[Weavero] _paintAddedByCells err: " + e);
        }
    }

    /** Resolve the Zotero.Item backing an items-tree row from its DOM
     *  node. Virtualized rows carry their index in the `id` attribute
     *  (set by upstream `virtualized-table.jsx` as
     *  `<treeID>-row-<index>`); we extract that index and look up the
     *  ref via `ZoteroPane.itemsView.getRow(index).ref`. Returns null
     *  if the row, the pane, or the view isn't available. */
    _getItemFromTreeRow(row) {
        if (!row || !row.id) return null;
        const m = /-row-(\d+)$/.exec(row.id);
        if (!m) return null;
        const index = parseInt(m[1], 10);
        if (!Number.isFinite(index)) return null;
        try {
            const win = Zotero.getMainWindow();
            const zp = win && win.ZoteroPane;
            const view = zp && zp.itemsView;
            if (!view || typeof view.getRow !== "function") return null;
            const r: any = view.getRow(index);
            return (r && r.ref) || null;
        } catch (e) { return null; }
    }

    /** Register the "Related" items-list column. Mirrors Zotero's
     *  built-in `numNotes` column shape: icon-only header, narrow
     *  static width, count text in the cell (empty when zero so the
     *  column reads as blank for items with no relations).
     *
     *  Uses Zotero's ItemTreeManager plugin API (introduced 2023; the
     *  registered dataKey is auto-prefixed with our plugin ID).
     *  Auto-removed when the plugin is uninstalled via `pluginID`,
     *  but we also call `unregisterColumn` in `destroy()` so a hot
     *  plugin reload during dev cleanly recycles the column. */
    /** Column-picker provenance mark (user request 2026-07-15): a small
     *  Weavero logo at the END of the picker lines for Weavero-registered
     *  columns, so their origin is visible at a glance. The picker popup
     *  (#zotero-column-picker) is created fresh on every open — a
     *  capture-phase popupshowing listener decorates its entries by
     *  resolving each menuitem's colindex against the live tree columns. */
    /** CROSS-WINDOW items-list drop (user request 2026-07-16): drag
     *  items from another main window's items list and drop them
     *  anywhere on THIS window's items list to add them to the
     *  collection this window is showing — natively only the
     *  collections-pane rows accept the drop. The drop is DELEGATED
     *  to the native collectionTree.onDrop at the selected row's
     *  index, so every native rule applies (canDropCheck, the
     *  cross-library copy options, "already in collection"
     *  rejection). Same-window drags are left entirely to native
     *  handling, gated by a per-window dragstart stamp. */
    _wvWireItemsCrossWindowDrop(win: any) {
        try {
            // Keyed, instance-tagged listeners (lib/listen.ts; wiring slice 3).
            // A boolean guard once left dev.13's listeners running while
            // dev.14's never attached (2026-07-16); the hand-bumped
            // WV_XWINDROP_VER that replaced it kept a build's handlers until
            // someone bumped it.
            if (!win) return;
            const doc = win.document;
            const tag = (this as any)._wvWireTag();
            // Builds before the keyed wiring left their handlers here: peel them.
            try {
                const prev: any = (win as any)._wvXWinDropHandlers;
                if (prev) {
                    try { doc.removeEventListener("dragstart", prev.start, true); } catch (e) {}
                    for (const t of ["dragover", "drop"]) {
                        try { win.removeEventListener(t, prev[t], true); } catch (e) {}
                        try { doc.removeEventListener(t, prev[t], true); } catch (e) {}
                    }
                    delete (win as any)._wvXWinDropHandlers;
                    delete (win as any)._wvXWinDropVer;
                }
            } catch (e) {}
            const live = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
            const onDragStart = () => {
                try {
                    const p: any = live();
                    if (p) { p._wvDragSourceWin = win; p._wvXDropOverSeen = false; }
                } catch (e) {}
            };
            wvListen(doc, "xwinDrop:dragstart", "dragstart", onDragStart, true, tag);
            // Returns the collections-view drop index, or false when this
            // drag isn't ours to handle. NOTE: index 0 is valid — callers
            // must compare against false, not truthiness.
            const eligible = (e: any, why?: boolean) => {
                try {
                    const types = (e.dataTransfer && e.dataTransfer.types) || [];
                    if (![...types].includes("zotero/item")) return false;
                    const p: any = live();
                    if (!p) return false;
                    if (p._wvDragSourceWin === win) { if (why) trace("reject: same-window drag"); return false; }
                    const el = doc.getElementById("zotero-items-tree");
                    if (!el || !el.contains(e.target)) { if (why) trace("reject: outside items tree (target=" + (e.target && e.target.id || e.target && e.target.className || "?") + ")"); return false; }
                    const cv = win.ZoteroPane && win.ZoteroPane.collectionsView;
                    if (!cv || !cv.selection) { if (why) trace("reject: no collectionsView"); return false; }
                    const idx = cv.selection.focused;
                    (Zotero as any).DragDrop.currentOrientation = 0;
                    const ok = cv.canDropCheck(idx, 0, e.dataTransfer);
                    if (!ok) { if (why) trace("reject: canDropCheck false @row " + idx); return false; }
                    return idx;
                } catch (er) { if (why) trace("reject: eligible err " + er); return false; }
            };
            // WINDOW-level capture, not document: the native items-tree
            // drag handlers are registered on the document long before
            // Weavero's, so a same-node capture listener runs AFTER them
            // and can't stop them vetoing the dropEffect — with a real
            // drag the drop event then never fires (the synthetic tests
            // pass because they dispatch the drop directly; user report
            // 2026-07-16). The window is ABOVE the document in the event
            // path, so these run first unconditionally. A trace ring
            // (`_wvXDropTrace`) records each stage for field debugging.
            const trace = (m: string) => {
                try {
                    const p: any = live();
                    if (!p) return;
                    p._wvXDropTrace = p._wvXDropTrace || [];
                    p._wvXDropTrace.push(Date.now() + " " + m);
                    if (p._wvXDropTrace.length > 40) p._wvXDropTrace.shift();
                    // Mirror to the debug log: the ring lives on the plugin
                    // instance and a reload wipes it — one field report's
                    // evidence was lost exactly that way (2026-07-16).
                    Zotero.debug("[Weavero][xdrop] " + m);
                } catch (er) {}
            };
            const onDragOver = (e: any) => {
                try {
                    const p: any = live();
                    const first = p && !p._wvXDropOverSeen;
                    if (eligible(e, first) === false) return;
                    if (first) { p._wvXDropOverSeen = true; trace("dragover: accepted over items tree"); }
                    e.preventDefault();
                    e.stopPropagation();
                    // Zotero 10.0.4+ (c59734e97): the trees' onDrop acts on
                    // `Zotero.DragDrop.currentDropEffect`, which their own
                    // onDragOver records through setDropEffect(), not on the
                    // drop event's dropEffect. This handler pre-empts the
                    // native items-tree dragover, so record the effect the
                    // same way -- else the delegate (`cv.onDrop` below) reads
                    // whatever the last native hover left behind (a 'move'
                    // from the collections pane, say). Older builds: the same
                    // call just sets dropEffect (scan 2026-09-30).
                    const cvFx = win.ZoteroPane && win.ZoteroPane.collectionsView;
                    if (cvFx && typeof cvFx.setDropEffect === "function") cvFx.setDropEffect(e, "copy");
                    else e.dataTransfer.dropEffect = "copy";
                } catch (er) {}
            };
            wvListen(win, "xwinDrop:dragover", "dragover", onDragOver, true, tag);
            const onDrop = (e: any) => {
                try {
                    const idx = eligible(e, true);
                    if (idx === false) return;
                    trace("drop: fired @row " + idx);
                    e.preventDefault();
                    e.stopPropagation();
                    const cv = win.ZoteroPane.collectionsView;
                    (Zotero as any).DragDrop.currentOrientation = 0;
                    // GENERAL cross-window / multi-collection drop (user
                    // request 2026-07-16). The merged items view is the
                    // UNION of every selected collection, so a drop adds
                    // the items to EVERY selected collection — across any
                    // mix of libraries. Algorithm (see _wvDropItemsIntoCollections):
                    //   • same-library collection → addItems directly.
                    //   • other-library collection → ensure ONE copy of
                    //     each item exists in that library (reuse a linked
                    //     copy if present, else the collections-view's own
                    //     _copyItem — same machinery, same copy options as
                    //     the native pane drop), then add those copies.
                    // Covers all four cases the user listed: cross-library
                    // → 1 coll, → N colls same lib, → N colls across libs.
                    // Read the item ids NOW (dataTransfer dies after the
                    // handler returns); resolve everything else in the
                    // async worker.
                    const collRows = ((win.ZoteroPane.getCollectionTreeRows
                        ? (win.ZoteroPane.getCollectionTreeRows() || []) : []) as any[])
                        .filter((r: any) => r && r.isCollection && r.isCollection());
                    if (!collRows.length) {
                        // Library root / saved search / etc. — let native handle it.
                        trace("drop: no collection selected → native delegate");
                        Promise.resolve(cv.onDrop(e, idx)).catch((er: any) =>
                            Zotero.debug("[Weavero] cross-window drop err: " + er));
                        return;
                    }
                    const dd = (Zotero as any).DragDrop.getDataFromDataTransfer(e.dataTransfer);
                    const ids = ((dd && dd.data) || []).map((x: any) => parseInt(x, 10)).filter((n: any) => !isNaN(n));
                    const collIDs = collRows.map((r: any) => r.ref.id);
                    trace("drop: " + collRows.length + " collection(s), " + ids.length + " item id(s)");
                    // LIVE plugin resolution, NOT the wire-time `this` (the
                    // project convention for persistent listeners): a
                    // captured `this` pinned the dev.19 instance's OLD
                    // worker through two reloads while its fixed twin sat
                    // unused on the new prototype — the third stale-code
                    // bite of 2026-07-16. With live() the worker can be
                    // fixed without re-wiring at all.
                    const lp: any = live();
                    if (!lp || !lp._wvDropItemsIntoCollections) { trace("drop: no live plugin"); return; }
                    Promise.resolve(lp._wvDropItemsIntoCollections(cv, ids, collIDs, trace))
                        .catch((er: any) => { trace("drop: worker err " + er); Zotero.debug("[Weavero] cross-window drop err: " + er); });
                } catch (er) {}
            };
            wvListen(win, "xwinDrop:drop", "drop", onDrop, true, tag);
        } catch (e) {}
    }

    /** Add the given items to EVERY target collection, copying across
     *  libraries as needed (user request 2026-07-16). `cv` = a
     *  collections view exposing `_copyItem` (Zotero's own cross-
     *  library item copy — reuses a linked copy when one exists, and
     *  applies the group-copy prefs). Per target LIBRARY: resolve the
     *  in-library id of each dragged item (itself if same-library, an
     *  existing linked copy, else a fresh _copyItem), then add those
     *  ids to each of that library's target collections in one
     *  transaction. Items and collections are re-resolved here (the
     *  handler passed plain ids), so nothing stale crosses the async
     *  boundary. */
    async _wvDropItemsIntoCollections(cv: any, itemIDs: number[], collIDs: number[], trace?: (m: string) => void) {
        const tr = trace || (() => {});
        const items: any[] = (await Zotero.Items.getAsync(itemIDs) || [])
            .filter((it: any) => it && it.isTopLevelItem && it.isTopLevelItem());
        if (!items.length) { tr("worker: no top-level items"); return; }
        const cols: any[] = (await Promise.all(collIDs.map((id: number) => Zotero.Collections.getAsync(id))))
            .filter(Boolean);
        if (!cols.length) { tr("worker: no collections"); return; }
        // Group target collections by their library.
        const byLib = new Map<number, any[]>();
        for (const c of cols) {
            if (!byLib.has(c.libraryID)) byLib.set(c.libraryID, []);
            byLib.get(c.libraryID)!.push(c);
        }
        // _copyItem's stub target row — the INSTALLED build's _copyItem
        // reads exactly `targetTreeRow.isPublications()` and
        // `targetTreeRow.filesEditable` (enumerated live 2026-07-16
        // after a bare `{ref:{}}` stub broke the group→user direction
        // with "isPublications is not a function"; filesEditable is
        // resolved per target library below).
        const mkTargetRow = (libraryID: number): any => ({
            ref: {},
            isPublications: () => false,
            get filesEditable() {
                try { return !!(Zotero.Libraries.get(libraryID) as any).filesEditable; } catch (e) { return true; }
            },
        });
        const copyOptions = {
            tags: Zotero.Prefs.get("groups.copyTags"),
            childNotes: Zotero.Prefs.get("groups.copyChildNotes"),
            childLinks: Zotero.Prefs.get("groups.copyChildLinks"),
            childFileAttachments: Zotero.Prefs.get("groups.copyChildFileAttachments"),
            annotations: Zotero.Prefs.get("groups.copyAnnotations"),
        };
        for (const [libraryID, libCols] of byLib) {
            // Resolve each item's id IN this library.
            const idsInLib: number[] = [];
            for (const it of items) {
                try {
                    if (it.libraryID === libraryID) { idsInLib.push(it.id); continue; }
                    // Existing linked copy? Reuse it — no duplicate.
                    let linked: any = null;
                    try { linked = await it.getLinkedItem(libraryID, true); } catch (e) {}
                    if (linked) { idsInLib.push(linked.id); continue; }
                    // Else copy across libraries via the native machinery.
                    if (typeof cv._copyItem === "function") {
                        let newID: any = null;
                        await Zotero.DB.executeTransaction(async () => {
                            newID = await cv._copyItem({ item: it, targetLibraryID: libraryID, targetTreeRow: mkTargetRow(libraryID), options: copyOptions });
                        });
                        if (newID != null) { idsInLib.push(newID); tr("worker: copied item " + it.id + " → " + newID + " in lib " + libraryID); }
                    }
                } catch (e) { tr("worker: resolve err item " + (it && it.id) + " lib " + libraryID + ": " + e); }
            }
            if (!idsInLib.length) continue;
            await Zotero.DB.executeTransaction(async () => {
                for (const col of libCols) {
                    try { await col.addItems(idsInLib); tr("worker: added " + idsInLib.length + " to C" + col.id + " (lib " + libraryID + ")"); }
                    catch (e) { tr("worker: addItems err C" + col.id + ": " + e); }
                }
            });
        }
    }

    /** macOS only (issue #48, pascaloettli, macOS 26 / Zotero 10.0.4):
     *  Zotero opens the column picker as a CONTEXT menu at a screen point
     *  -- `openPopupAtScreen(x, y, true)` -- and on Mac Gecko shows context
     *  menus as native NSMenus (widget.macos.native-context-menus, on by
     *  default). A native item takes a label, one left-side icon, a key
     *  equivalent and a tick, nothing else, so the provenance mark above
     *  (`::after`, right end) never shows there. Opened WITHOUT the context
     *  flag, Gecko draws the menu itself -- as it already does for every
     *  anchored popup in Zotero on Mac (toolbar dropdowns; Gecko has no
     *  native form of those) -- with Zotero's own Mac menu styling, and the
     *  mark renders as on Windows. The flag otherwise governs only
     *  positioning flips and which open popups roll up together
     *  (nsMenuPopupFrame / nsXULPopupManager, esr140).
     *  Wraps the window's XULPopupElement prototype: Zotero creates the
     *  picker popup afresh on every open and the header keeps its own bound
     *  copy of the opener, so neither can be patched instead. Versioned;
     *  the wrapper resolves the live plugin and passes through once it is
     *  gone. `_wvForceMacPickerFix` lets the spec and a Windows live check
     *  exercise the wrap. */
    _wvWireColumnPickerNativeFix(win: any) {
        try {
            if (!win) return;
            if (!(Zotero as any).isMac && !(this as any)._wvForceMacPickerFix) return;
            const proto: any = win.XULPopupElement && win.XULPopupElement.prototype;
            if (!proto || typeof proto.openPopupAtScreen !== "function") return;
            const VER = 1;
            if (proto._wvPickerNativeFixVer === VER) return;
            const orig = proto._wvPickerNativeFixOrig || proto.openPopupAtScreen;
            proto._wvPickerNativeFixOrig = orig;
            proto.openPopupAtScreen = function (this: any, x: any, y: any, isContextMenu?: any, ...rest: any[]) {
                try {
                    if (isContextMenu && this && this.id === "zotero-column-picker") {
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (lp && !lp._wvDestroyed) return orig.call(this, x, y, false, ...rest);
                    }
                } catch (e) {}
                return orig.apply(this, arguments as any);
            };
            proto._wvPickerNativeFixVer = VER;
        } catch (e) {}
    }

    _wvUnwireColumnPickerNativeFix(win: any) {
        try {
            const proto: any = win && win.XULPopupElement && win.XULPopupElement.prototype;
            if (proto && proto._wvPickerNativeFixOrig) {
                proto.openPopupAtScreen = proto._wvPickerNativeFixOrig;
                delete proto._wvPickerNativeFixOrig;
                delete proto._wvPickerNativeFixVer;
            }
        } catch (e) {}
    }

    _wvWireColumnPickerMark(win: any) {
        try {
            if (!win) return;
            // Keyed (lib/listen.ts; wiring slice 3): a boolean stamp kept the
            // first build's handler on every window until a restart.
            wvListen(win.document, "colPickMark:popupshowing", "popupshowing", (ev: any) => {
                try {
                    const pop = ev.target;
                    if (!pop || pop.id !== "zotero-column-picker") return;
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!lp || lp._wvDestroyed) return;
                    lp._wvDecorateColumnPicker(win, pop);
                } catch (e) {}
            }, true, (this as any)._wvWireTag());
        } catch (e) {}
    }

    _wvDecorateColumnPicker(win: any, pop: any) {
        try {
            const doc = win.document;
            this._wvEnsureColPickStyles(doc);
            const iv: any = win.ZoteroPane && win.ZoteroPane.itemsView;
            const cols = iv && iv.tree && iv.tree._getColumns ? iv.tree._getColumns() : null;
            if (!cols) return;
            // querySelectorAll descends into the "More Columns" submenu too.
            for (const mi of pop.querySelectorAll("menuitem[colindex]")) {
                const idx = parseInt(mi.getAttribute("colindex"), 10);
                const col = cols[idx];
                if (col && String(col.dataKey || "").indexOf("weavero") === 0) {
                    mi.classList.add("wv-colpick-ours");
                }
            }
        } catch (e) {}
    }

    _wvEnsureColPickStyles(doc: any) {
        try {
            // Re-create rather than keep an existing element: a stale
            // copy from a previous plugin load would pin old URLs.
            doc.getElementById("wv-colpick-styles")?.remove();
            const style = wvHtmlEl(doc, "style");
            style.id = "wv-colpick-styles";
            // Theme-matched PNG logo variants, NOT icon.svg: the SVG
            // logo is dark blue + black strokes, which at menu-mark
            // size on the dark theme reads as an unidentifiable grey
            // chain (user report 2026-07-15). icon-light-16.png is the
            // dark artwork (for light theme), icon-dark-16.png the
            // light artwork (for dark theme) — verified by pixel
            // brightness. prefers-color-scheme works in the chrome
            // XUL menu context (same technique as the items-tree menu
            // icons, see index.ts).
            const root = String((this as any)._rootURI || "");
            style.textContent = [
                "menuitem.wv-colpick-ours::after {",
                "  content: ''; display: inline-block;",
                "  width: 12px; height: 12px;",
                "  margin-inline-start: 7px; vertical-align: -2px;",
                "  background: url('" + root + "icons/icon-light-16.png') center/contain no-repeat;",
                "}",
                "@media (prefers-color-scheme: dark) {",
                "  menuitem.wv-colpick-ours::after {",
                "    background-image: url('" + root + "icons/icon-dark-16.png');",
                "  }",
                "}",
            ].concat(((Zotero as any).isMac || (this as any)._wvForceMacPickerFix) ? [
                // macOS: the picker is drawn by Gecko since #48 (see
                // _wvWireColumnPickerNativeFix), whose Mac rows carry
                // `--menuitem-padding: 3px 9px` (toolkit/themes/shared/
                // menu.css, esr140; Zotero's mac _menupopup.scss leaves it).
                // The reporter's screenshots (macOS 26 Tahoe, same text
                // height) measured the native rows at 24 px and the drawn
                // ones at 22 px, so one more pixel above and below matches
                // the native menu they replace. Only this popup; first
                // attempt, to be confirmed on a real Mac (issue #48).
                "#zotero-column-picker > menuitem,",
                "#zotero-column-picker > menu {",
                "  padding-block: 4px;",
                "}",
            ] : []).join("\n");
            (doc.head || doc.documentElement).appendChild(style);
        } catch (e) {}
    }

    _registerItemTreeColumns() {
        try {
            if (!Zotero.ItemTreeManager
                || typeof Zotero.ItemTreeManager.registerColumn !== "function") {
                this._dbg("[Weavero] ItemTreeManager unavailable; skip column register");
                return;
            }
            // Use Zotero's built-in `related.svg`. virtualized-table
            // expands `iconPath` into an `iconLabel` <span class="icon
            // icon-bg"> with backgroundImage:url(...), and the
            // presence of iconLabel triggers the `cell-icon` class
            // (zero column padding, fixed icon sizing). htmlLabel
            // alone does NOT trigger cell-icon, so the SVG would
            // render with normal padding and stretch oddly.
            // Shared cell renderer: blank when count is 0, count
            // text otherwise. Matches numNotes' display pattern at
            // itemTree.jsx:2299 (`treeRow.numNotes() || \"\"`).
            const renderCount = (_index, data, column, _isFirstColumn, doc) => {
                const span = doc.createElement("span");
                span.className = "cell " + (column.className || "");
                span.textContent = (data && data > 0) ? String(data) : "";
                return span;
            };
            // Both columns return numbers (0 when empty) from
            // dataProvider so _compareField skips the
            // empty-string-sorts-last shortcut and 0 collates
            // before 1, mirroring numNotes at itemTree.jsx:550-552.
            this._weaveroColumnKeys = this._weaveroColumnKeys || [];

            // Register Annotations BEFORE Related so when both are
            // visible the Annotations column appears first by
            // default. Zotero's column ordering follows registration
            // order (after the built-in columns).
            //
            // Annotations column: count of annotations on the item
            // itself when it's an attachment, or sum across all
            // attachments when it's a regular item. Annotations
            // themselves and notes get 0 — Zotero only shows
            // annotations under attachment containers.
            // Pref-gated by enableAnnotationsCountColumn (Visual extras).
            const annKey = this._getEnableAnnotationsCountColumn()
                ? (Zotero.ItemTreeManager as any).registerColumn({
                dataKey: "weaveroAnnotations",
                label: "Annotations",
                pluginID: "weavero@mjthoraval",
                // General "any annotation" glyph (Zotero's own item-pane
                // annotation-count icon), not the highlight-specific one -- the
                // column counts ALL annotation types, not just highlights.
                iconPath: "chrome://zotero/skin/16/universal/annotation.svg",
                width: "30",
                minWidth: 26,
                staticWidth: true,
                fixedWidth: true,
                showInColumnPicker: true,
                zoteroPersist: ["width", "hidden", "sortDirection"],
                dataProvider: (item) => {
                    try {
                        if (!item) return 0;
                        // `getAnnotations` throws on non-file
                        // attachments (web links / snapshots without
                        // a file). The outer try/catch swallows it,
                        // but the throw still spams the console —
                        // gate on `isFileAttachment` to avoid the
                        // call altogether.
                        if (item.isFileAttachment && item.isFileAttachment()) {
                            const ids = item.getAnnotations() || [];
                            return ids.length;
                        }
                        if (item.isRegularItem && item.isRegularItem()) {
                            let total = 0;
                            const attIds = (item.getAttachments && item.getAttachments()) || [];
                            for (const id of attIds) {
                                const att = Zotero.Items.get(id);
                                if (!att || !att.isFileAttachment
                                    || !att.isFileAttachment()) continue;
                                const annIds = att.getAnnotations() || [];
                                total += annIds.length;
                            }
                            return total;
                        }
                        return 0;
                    } catch (e) { return 0; }
                },
                renderCell: renderCount,
            })
                : null;
            if (annKey) this._weaveroColumnKeys.push(annKey);

            // Recursive tag count — returns {manual, auto}. Walks the
            // same item subtree as the Related column (own +
            // file-attachment annotations + child attachments + child
            // notes). Tag types in Zotero: type 0 is a manual tag,
            // type 1 is an automatic tag (set by translators / bulk
            // imports).
            const tagSubtreeCount = (item) => {
                if (!item) return { manual: 0, auto: 0 };
                let m = 0, a = 0;
                const addOwn = (i) => {
                    try {
                        const tags = (i.getTags && i.getTags()) || [];
                        for (const t of tags) {
                            if (t && t.type === 1) a++;
                            else m++;
                        }
                    } catch (e) {}
                };
                addOwn(item);
                try {
                    if (item.isFileAttachment && item.isFileAttachment()) {
                        const anns = (item.getAnnotations
                            && item.getAnnotations()) || [];
                        for (const ann of anns) {
                            const sub = tagSubtreeCount(ann);
                            m += sub.manual;
                            a += sub.auto;
                        }
                    }
                    if (item.isRegularItem && item.isRegularItem()) {
                        const attIds = (item.getAttachments
                            && item.getAttachments()) || [];
                        for (const id of attIds) {
                            const att = Zotero.Items.get(id);
                            if (att) {
                                const sub = tagSubtreeCount(att);
                                m += sub.manual;
                                a += sub.auto;
                            }
                        }
                        const noteIds = (item.getNotes
                            && item.getNotes()) || [];
                        for (const id of noteIds) {
                            const n = Zotero.Items.get(id);
                            if (n) {
                                const sub = tagSubtreeCount(n);
                                m += sub.manual;
                                a += sub.auto;
                            }
                        }
                    }
                } catch (e) {}
                return { manual: m, auto: a };
            };
            const ownTagCount = (item) => {
                let m = 0, a = 0;
                try {
                    const tags = (item.getTags && item.getTags()) || [];
                    for (const t of tags) {
                        if (t && t.type === 1) a++;
                        else m++;
                    }
                } catch (e) {}
                return { manual: m, auto: a };
            };

            const tagsKey = (Zotero.ItemTreeManager as any).registerColumn({
                dataKey: "weaveroTags",
                label: "Tags",
                pluginID: "weavero@mjthoraval",
                iconPath: "chrome://zotero/skin/16/universal/tag.svg",
                // Wide enough for "manual|auto" when the auto count is
                // on; otherwise the same 30px the Annotations column
                // uses. Persisted width (from a later toggle) overrides
                // this on subsequent loads — see the toggle handler in
                // index.ts which updates the live column + the pref.
                width: String(this._tagsColumnWidth()),
                minWidth: this._getEnableTagsCountAuto() ? 30 : 26,
                staticWidth: true,
                fixedWidth: true,
                showInColumnPicker: true,
                zoteroPersist: ["width", "hidden", "sortDirection"],
                // dataProvider returns the rolled-up TOTAL for sort
                // ordering (manual + auto across the whole subtree).
                // The actual two-number rendering happens in
                // renderCell which has access to row context.
                dataProvider: (item) => {
                    try {
                        const c = tagSubtreeCount(item);
                        return c.manual + c.auto;
                    } catch (e) { return 0; }
                },
                // Mirrors the Related column's expansion semantics:
                // collapsed → roll-up across descendants, expanded →
                // own count. `this` is wrapped by the manager so
                // reach the itemsView via ZoteroPane.
                renderCell: (index, _data, column, _isFirstColumn, document) => {
                    const span = document.createElement("span");
                    span.className = "cell " + (column.className || "");
                    let counts = { manual: 0, auto: 0 };
                    try {
                        const win = Zotero.getMainWindow();
                        const itemsView = win && win.ZoteroPane
                            && win.ZoteroPane.itemsView;
                        if (itemsView) {
                            const row: any = itemsView.getRow(index);
                            const item = row && row.ref;
                            if (item) {
                                const isContainer = itemsView.isContainer(index);
                                const isOpen = isContainer
                                    && itemsView.isContainerOpen(index);
                                counts = isOpen
                                    ? ownTagCount(item)
                                    : tagSubtreeCount(item);
                            }
                        }
                    } catch (e) {}
                    // The live plugin's getter: the auto count is an Extras
                    // option and goes with Extras (prefs.4, MJT 2026-10-17;
                    // a raw pref read here ignored it).
                    let showAuto = true;
                    try {
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (lp && typeof lp._getEnableTagsCountAuto === "function") showAuto = !!lp._getEnableTagsCountAuto();
                    } catch (e) {}
                    if (counts.manual > 0) {
                        const m = document.createElement("span");
                        m.className = "wv-tags-count-manual";
                        m.textContent = String(counts.manual);
                        span.appendChild(m);
                    }
                    if (showAuto && counts.auto > 0) {
                        if (counts.manual > 0) {
                            const sep = document.createElement("span");
                            sep.className = "wv-tags-count-sep";
                            sep.textContent = "|";
                            span.appendChild(sep);
                        }
                        const a = document.createElement("span");
                        a.className = "wv-tags-count-auto";
                        a.textContent = String(counts.auto);
                        span.appendChild(a);
                    }
                    return span;
                },
            });
            if (tagsKey) this._weaveroColumnKeys.push(tagsKey);

            // Recursive count — own relations + every descendant's
            // relations (attachment, annotation, note). Walks through
            // file-attachment annotations (other attachment types
            // can't host annotations) and through all child notes /
            // attachments of regular items.
            const relatedSubtreeCount = (item) => {
                if (!item) return 0;
                let total = 0;
                try {
                    total += (item.relatedItems
                        && item.relatedItems.length) || 0;
                } catch (e) {}
                try {
                    if (item.isFileAttachment && item.isFileAttachment()) {
                        const anns = (item.getAnnotations
                            && item.getAnnotations()) || [];
                        for (const ann of anns) {
                            try {
                                total += (ann && ann.relatedItems
                                    && ann.relatedItems.length) || 0;
                            } catch (e) {}
                        }
                    }
                    if (item.isRegularItem && item.isRegularItem()) {
                        const attIds = (item.getAttachments
                            && item.getAttachments()) || [];
                        for (const id of attIds) {
                            const att = Zotero.Items.get(id);
                            if (att) total += relatedSubtreeCount(att);
                        }
                        const noteIds = (item.getNotes
                            && item.getNotes()) || [];
                        for (const id of noteIds) {
                            const n = Zotero.Items.get(id);
                            try {
                                total += (n && n.relatedItems
                                    && n.relatedItems.length) || 0;
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
                return total;
            };

            // Pref-gated by enableRelatedColumn (Visual extras tab).
            const relKey = this._getEnableRelatedColumn()
                ? (Zotero.ItemTreeManager as any).registerColumn({
                dataKey: "weaveroRelated",
                label: "Related",
                pluginID: "weavero@mjthoraval",
                iconPath: "chrome://zotero/skin/16/universal/related.svg",
                width: "30",
                minWidth: 26,
                staticWidth: true,
                fixedWidth: true,
                showInColumnPicker: true,
                zoteroPersist: ["width", "hidden", "sortDirection"],
                // dataProvider returns the rolled-up subtree count so
                // sorting compares total relatedness across each
                // item's whole subtree. renderCell may swap to the
                // own count when the row's container is open.
                dataProvider: (item) => {
                    try { return relatedSubtreeCount(item); }
                    catch (e) { return 0; }
                },
                // We CAN'T rely on `this` inside renderCell — Zotero's
                // ItemTreeManager wraps the function in an arrow
                // try/catch (`(...args) => { try { return val(...args)
                // } catch (e) {...} }`), so `this` is the wrapper's
                // outer scope, not the itemsView. Reach the itemsView
                // explicitly via `ZoteroPane.itemsView`. Then we can
                // ask whether the row is an open container (→ display
                // own count, since children are visible with their
                // own counts) or collapsed/leaf (→ display the
                // rolled-up subtree count from `data`).
                renderCell: (index, data, column, _isFirstColumn, document) => {
                    const span = document.createElement("span");
                    span.className = "cell " + (column.className || "");
                    let display = data || 0;
                    try {
                        const win = Zotero.getMainWindow();
                        const itemsView = win && win.ZoteroPane
                            && win.ZoteroPane.itemsView;
                        if (itemsView) {
                            const isContainer = itemsView.isContainer(index);
                            const isOpen = isContainer
                                && itemsView.isContainerOpen(index);
                            if (isOpen) {
                                const row: any = itemsView.getRow(index);
                                const item = row && row.ref;
                                display = (item && item.relatedItems
                                    && item.relatedItems.length) || 0;
                            }
                        }
                    } catch (e) {}
                    span.textContent = (Number(display) > 0) ? String(display) : "";
                    return span;
                },
            })
                : null;
            if (relKey) this._weaveroColumnKeys.push(relKey);

            // No Added By column — Zotero already ships an `addedBy`
            // column that's auto-enabled in group libraries (see
            // upstream itemTreeColumns.jsx:378). Annotation rows
            // render as a single line via AnnotationItemTreeRow, not
            // per-column cells, so a column wouldn't help anyway.
            // We surface the annotation's "added by" by patching the
            // annotation row renderer (see `_ensureAnnotationRowPatched`).

            // No identifier columns (DOI / PMID / PMCID) — Weavero
            // shipped them briefly (v0.15.8-dev.9x, after the forum ask
            // https://forums.zotero.org/discussion/132715/pmid-pmcid-in-extra-column),
            // then removed them 2026-07-15: retorquere's
            // zotero-pmcid-fetcher already provides PMID/PMCID columns
            // with the same field-first + Extra-fallback strategy, and
            // duplicating them here wasn't worth the overlap. The
            // "Has PMID" / "Has PMCID" filter-pane filters remain
            // Weavero's (see filter.ts).

            this._dbg("[Weavero] columns registered: "
                + this._weaveroColumnKeys.join(", "));
        } catch (e) {
            Zotero.debug("[Weavero] _registerItemTreeColumns err: " + e);
        }
    }

    _unregisterItemTreeColumns() {
        try {
            if (Zotero.ItemTreeManager
                && typeof Zotero.ItemTreeManager.unregisterColumn === "function"
                && this._weaveroColumnKeys) {
                for (const k of this._weaveroColumnKeys) {
                    try { Zotero.ItemTreeManager.unregisterColumn(k); }
                    catch (e) {}
                }
            }
            this._weaveroColumnKeys = [];
        } catch (e) {
            Zotero.debug("[Weavero] _unregisterItemTreeColumns err: " + e);
        }
    }

    /** Add (or refresh) a `.wv-tree-rel-icon` at the right edge of the
     *  annotation-comment cell when the underlying annotation has
     *  related items. Anchors to the cell as a flex sibling so the
     *  icon stays visible even when the comment text overflows with
     *  ellipsis. Click opens the same relations popup the reader
     *  sidebar uses. */
    _decorateAnnotationRowRelations(cell) {
        if (!cell) return;
        // Pref gate (Relations group → Chain badge).
        if (!this._getEnableChainBadge()) return;
        const row = cell.closest && cell.closest(".annotation-row");
        if (!row) return;
        const item = this._getItemFromTreeRow(row);
        // Highlight/underline rows with no comment carry `q-mark-close`
        // on the title cell — the closing quote is rendered via the
        // cell's `::after` pseudo-element, so any child of the title
        // cell lands *before* the closing quote (reading as part of
        // the highlighted text). For that case anchor the icon on the
        // row as a sibling instead, after the title cell and after
        // the badge that the renderRow patch already placed there.
        const hostOnRow = cell.classList.contains("title")
            && cell.hasAttribute("q-mark-close");
        const iconHost = hostOnRow ? row : cell;
        // If hosting on row, remove any stale icon that prior code may
        // have stuffed inside the title cell (defensive — the previous
        // version always appended to the cell).
        if (hostOnRow) {
            const insideStale = cell.querySelector(":scope > .wv-tree-rel-icon");
            if (insideStale) insideStale.remove();
        }
        if (!item || !item.isAnnotation || !item.isAnnotation()) {
            cell.removeAttribute("data-has-relations");
            const stale = iconHost.querySelector(":scope > .wv-tree-rel-icon");
            if (stale) stale.remove();
            return;
        }
        const related = this._getAnnotationRelatedItems(item);
        const existing = iconHost.querySelector(":scope > .wv-tree-rel-icon");
        if (!related.length) {
            cell.removeAttribute("data-has-relations");
            if (existing) existing.remove();
            return;
        }
        cell.setAttribute("data-has-relations", "1");
        if (existing) {
            // Refresh tooltip + count if it changed since last decorate.
            const newTitle = related.length + " Related";
            if (existing.title !== newTitle) existing.title = newTitle;
            return;
        }
        const doc = cell.ownerDocument;
        const icon = doc.createElement("span");
        icon.className = "wv-tree-rel-icon";
        icon.title = related.length + " Related";
        icon.appendChild(this._makeRelationsSvg(doc));
        // Capture the item's library + key — re-resolve at click time so
        // a relation added/removed since render is reflected.
        const lib = item.libraryID;
        const key = item.key;
        icon.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            try {
                const ann = Zotero.Items.getByLibraryAndKey(lib, key);
                if (!ann) return;
                const sc = this._screenCoords(icon);
                this.openRelationsPopup(ann, {
                    anchorNode: icon,
                    ...(sc ? { anchorScreen: sc } : {}),
                });
            } catch (err) {
                Zotero.debug("[Weavero] tree-rel click err: " + err);
            }
        });
        // Row selection on mousedown / mouseup is suppressed by
        // _treeMouseDownHandler / _treeMouseUpHandler at the document
        // capture level — see those handlers for the rationale (must
        // run before upstream's row capture listener fires).
        // For row-anchored icons, append at the end so it lands AFTER
        // the badge (the badge is also a row sibling, inserted via
        // `title.after(badge)` in `_appendAddedByBadgeAfterTitle`).
        iconHost.appendChild(icon);
    }

    /** Toggle data-truncated on cells whose text-wrap is overflowing. */
    _updateTruncationFlags(docArg?: any) {
        const doc = docArg || Zotero.getMainWindow().document;
        const cells: any = doc.querySelectorAll(
            ".annotation-row.tight .cell.annotation-comment[data-has-rich]");
        let n = 0;
        for (const cell of cells) {
            const wrap = cell.querySelector(".wv-text-wrap");
            if (!wrap) continue;
            const isTrunc = wrap.scrollWidth > wrap.clientWidth + 1;
            if (isTrunc) {
                if (cell.getAttribute("data-truncated") !== "true") {
                    cell.setAttribute("data-truncated", "true");
                    n++;
                }
            } else if (cell.hasAttribute("data-truncated")) {
                cell.removeAttribute("data-truncated");
                n++;
            }
        }
        if (n) this._dbg("[Weavero] truncation flags updated: " + n + " cells");
    }

    /** Per WINDOW (survey 2026-10-06 #17): the handlers, the mark observer
     *  and the timers live on `win._wvTreeDelegate`. As plugin-wide
     *  singletons, only the last-loaded window had the delegate and closing
     *  any main window removed it from the focused one (the teardown even
     *  unbound from `Zotero.getMainWindow()`, whichever window that was).
     *  Guard: test/survey-fixes-e.spec.js. */
    _setupTreeClickDelegate(win?: any) {
        // Its 1 s retry is a WINDOW timer: it outlives destroy(), and a dead
        // instance then wired the Copy Link menu for good (2026-10-13).
        if ((this as any)._wvDestroyed) return;
        win = win || Zotero.getMainWindow();
        if (!win || win.closed || !win.document) return;
        const doc  = win.document;
        this._teardownTreeClickDelegate(win);
        const H: any = (win._wvTreeDelegate = { click: null, down: null, up: null, resize: null, resizeTimer: null, mo: null, lastHandled: 0 });

        // Initial mark pass
        this._markCellLinks(doc);

        // Watch for tree re-renders to re-mark cells (attribute only — lightweight)
        // Zotero 10 beta.4 (PR #5802 — Item tree refactor) renamed the
        // items-tree element from `item-tree-main-default` to `item-tree-main`.
        // Prefer the new ID; fall back to the old one for older builds.
        const tree = doc.getElementById("item-tree-main")
                  || doc.getElementById("item-tree-main-default");
        if (tree) {
            // Run _markCellLinks SYNCHRONOUSLY in the observer callback rather
            // than via setTimeout. MutationObserver callbacks are microtasks,
            // so they run before the next browser paint — meaning the user
            // never sees the raw markdown text flash when Zotero replaces a
            // cell's contents (e.g. on virtualized scroll, item swap, or item
            // selection). The previous setTimeout(..., 0) was a macrotask, and
            // the browser could paint between Zotero's DOM mutation and our
            // re-render. The cache check inside _markCellLinks (cachedMode ===
            // wantMode) prevents work amplification on our own DOM writes.
            H.mo = new win.MutationObserver(() => {
                try { this._markCellLinks(doc); }
                catch(e) { Zotero.debug("[Weavero] tree mark error: " + e); }
            });
            H.mo.observe(tree,
                { childList: true, subtree: true, characterData: true });
        } else {
            delete win._wvTreeDelegate;
            win.setTimeout(() => this._setupTreeClickDelegate(win), 1000);
            return;
        }

        // URL hover tooltips: rely on Mozilla's native `html-tooltip`
        // (declared in `zoteroPane.xhtml` and wired into the items
        // tree by upstream's `virtualized-table.jsx::_setXulTooltip()`)
        // — but Zotero's React mouseover handler at
        // `virtualized-table.jsx:955` (`_handleMouseOver`) actively
        // STRIPS the `title` attribute from any cell descendant whose
        // text fits without overflow. URL spans always fit, so without
        // a counter-measure our `title="<url>"` is removed before the
        // tooltip listener fires.
        //
        // Counter-measure: a delegated mouseover handler on the items-
        // tree XUL element (an ANCESTOR of the `.virtualized-table`
        // div React handles). DOM bubbling means it fires AFTER React's
        // strip but well before Mozilla's 500ms tooltip delay. The
        // handler re-sets `title` from the span's `data-href` (markdown
        // links) or its text content (bare URLs).
        const treeXul: any = doc.getElementById("item-tree-main")
            || doc.getElementById("item-tree-main-default");
        if (treeXul) {
            // Keyed, instance-tagged (lib/listen.ts; wiring slice 3). Builds
            // before it stamped `_wvUrlTitleListener` and skipped: peel that.
            if (treeXul._wvUrlTitleListener) {
                try { treeXul.removeEventListener("mouseover", treeXul._wvUrlTitleListener); } catch (e) {}
                delete treeXul._wvUrlTitleListener;
            }
            // React 17+ uses event delegation: its `onMouseOver`
            // runs AFTER native bubble-phase listeners on the same
            // element, so a synchronous restore here gets stripped
            // again immediately. Defer with `setTimeout(…, 0)` —
            // Zotero's strip lands first, then this fires from the
            // task queue and re-sets the title. Mozilla's tooltip
            // listener won't read `title` until popupshowing fires
            // (~500ms later), giving us a comfortable window.
            //
            // Covers all Weavero spans that (a) have a text-node
            // first child (so Zotero's handler doesn't early-return
            // on missing `.cell-text`) AND (b) live INSIDE a `.cell`
            // (so the handler's early-return on `closest('.cell')`
            // doesn't trigger). Currently:
            //   • `.wv-url-span` — title is the URL (data-href or
            //     textContent for bare URLs).
            //   • `.wv-annotation-added-by` — title is "Added by
            //     <name>", with name = the badge's textContent.
            //     Only stripped when the badge is INSIDE a
            //     `.cell.annotation-comment` (annotations with a
            //     comment); badges that are row-siblings (no-comment
            //     rows) are left alone by Zotero's handler.
            // Other Weavero items-tree elements with `title` are
            // safe by construction (SVG / element first child →
            // `.wv-tree-rel-icon`, `.wv-tree-icon`).
            const restore = (e) => {
                const t = e.target;
                if (!t || !t.closest) return;
                let target = null, want = null;
                const url = t.closest(".wv-url-span");
                if (url) {
                    target = url;
                    want = url.getAttribute("data-href")
                        || url.textContent || "";
                } else {
                    const badge = t.closest(".wv-annotation-added-by");
                    if (badge) {
                        target = badge;
                        const name = (badge.textContent || "").trim();
                        if (name) want = "Added by " + name;
                    }
                }
                if (!target || !want) return;
                win.setTimeout(() => {
                    if (target.getAttribute("title") !== want) {
                        target.setAttribute("title", want);
                    }
                }, 0);
            };
            wvListen(treeXul, "urlTitle:mouseover", "mouseover", restore, false, (this as any)._wvWireTag());
        }

        // Right-click "Copy Link" menu for URL spans. Same pattern as
        // the tooltip widget — DOM-rendered menu attached to
        // documentElement, shown on contextmenu over a `.wv-url-span`
        // or `.wv-link` element. Suppresses Zotero's own row context
        // menu so the user gets just the link-relevant action.
        if (!this._urlMenuState) {
            const ms: any = { el: null, url: "" };
            const ensureMenu = () => {
                if (ms.el) return ms.el;
                const m = doc.createElement("div");
                m.id = "wv-url-menu";
                m.className = "wv-url-menu";
                const item = doc.createElement("div");
                item.className = "wv-url-menu-item";
                item.textContent = "Copy Link";
                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (ms.url) {
                        try {
                            Zotero.Utilities.Internal.copyTextToClipboard(ms.url);
                        } catch (err) {
                            Zotero.debug("[Weavero] copy link err: " + err);
                        }
                    }
                    // Use hideMenu (not just display:none) so the
                    // wv-context-menu-open class is cleared too.
                    hideMenu();
                });
                m.appendChild(item);
                doc.documentElement.appendChild(m);
                ms.el = m;
                return m;
            };
            const hideMenu = () => {
                const wasShown = !!(ms.el && ms.el.style.display !== "none");
                if (ms.el) ms.el.style.display = "none";
                // Reactivate hover (cursor + tooltip). The class is
                // normally removed on the first mousemove after onCtx
                // (see the one-shot mousemove handler), but we also
                // remove it here so a dismiss-without-moving cleans up.
                let hadClass = false;
                try {
                    hadClass = doc.documentElement.classList.contains("wv-context-menu-open");
                    doc.documentElement.classList.remove("wv-context-menu-open");
                } catch(err) {}
                if (ms.firstMoveHandler) {
                    try { doc.removeEventListener("mousemove", ms.firstMoveHandler, true); } catch(err) {}
                    ms.firstMoveHandler = null;
                }
                this._dbg("[Weavero] hideMenu fired"
                    + " wasShown=" + wasShown
                    + " hadClass=" + hadClass);
            };
            const onCtx = (e) => {
                // Walk composedPath() so we match urlSpans even when the
                // event target is a Text node (no .closest), descends into
                // a shadow root (right-pane <annotation-row> in some Zotero
                // builds), or sits inside an iframe whose contentDocument
                // is included in the path. Falls back to .closest() on the
                // raw target when composedPath isn't available.
                let sp = null;
                const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
                for (const node of path) {
                    if (!node || !node.classList) continue;
                    if (node.classList.contains("wv-url-span")
                        || node.classList.contains("wv-link")) {
                        sp = node;
                        break;
                    }
                }
                if (!sp && e.target && e.target.closest) {
                    sp = e.target.closest(".wv-url-span")
                        || e.target.closest(".wv-link");
                }
                this._dbg("[Weavero] onCtx target="
                    + (e.target ? (e.target.nodeName || "?") + "/" + (e.target.nodeType || "?") : "null")
                    + " spMatched=" + !!sp
                    + " button=" + e.button);
                if (!sp) return;
                // Inside the in-document annotation popup, let the
                // browser's native context menu handle URL spans —
                // users expect "Copy Link Location" / "Open Link" /
                // etc., not our minimal Copy-Link menu. Our spans are
                // <a href> elements, so the native menu renders the
                // full link-specific options.
                if (sp.closest && sp.closest(".annotation-popup")) return;
                e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.stopPropagation();
                const url = sp.getAttribute("data-href")
                    || sp.getAttribute("href")
                    || sp.getAttribute("title")
                    || sp.textContent || "";
                if (!url) return;
                ms.url = url;
                // Flip the suppress class so the cursor over the link
                // turns from pointer back to default while the menu is
                // up. The class is dropped on first mousemove or when
                // the menu closes, restoring the pointer cursor.
                doc.documentElement.classList.add("wv-context-menu-open");
                if (ms.firstMoveHandler) {
                    try { doc.removeEventListener("mousemove", ms.firstMoveHandler, true); } catch(err) {}
                    ms.firstMoveHandler = null;
                }
                const onFirstMove = () => {
                    doc.documentElement.classList.remove("wv-context-menu-open");
                    try { doc.removeEventListener("mousemove", onFirstMove, true); } catch(err) {}
                    ms.firstMoveHandler = null;
                };
                ms.firstMoveHandler = onFirstMove;
                doc.addEventListener("mousemove", onFirstMove, true);
                const m = ensureMenu();
                // Position at cursor; clamp to viewport so the menu
                // doesn't overflow the right / bottom edge.
                //
                // The menu has `position: fixed` (see .wv-url-menu
                // CSS), so left/top are in main-chrome-window viewport
                // coordinates. For events that cross iframe / chrome
                // <browser> boundaries, `e.clientX/Y` semantics vary
                // (Mozilla retargets some, leaves others alone). The
                // robust primitive is screen coordinates:
                //   * e.screenX/Y      — cursor in OS screen px
                //   * win.mozInnerScreenX/Y — chrome content area's
                //                        top-left in OS screen px
                // Their difference is always main-window-viewport.
                let cx, cy;
                if (typeof e.screenX === "number"
                        && typeof win.mozInnerScreenX === "number") {
                    cx = e.screenX - win.mozInnerScreenX;
                    cy = e.screenY - win.mozInnerScreenY;
                } else {
                    // Fallback if mozInnerScreenX isn't exposed —
                    // accept the popup may land in the wrong place
                    // for cross-frame clicks rather than crash.
                    cx = e.clientX;
                    cy = e.clientY;
                }
                const vw = win.innerWidth || 1920;
                const vh = win.innerHeight || 1080;
                m.style.display = "block";
                let left = cx;
                let top  = cy;
                if (left + m.offsetWidth + 8 > vw) {
                    left = Math.max(8, vw - m.offsetWidth - 8);
                }
                if (top + m.offsetHeight + 8 > vh) {
                    top = Math.max(8, vh - m.offsetHeight - 8);
                }
                m.style.left = left + "px";
                m.style.top  = top + "px";
                // Refresh the pointerdown targets — iframes (PDF reader
                // tabs, etc.) may have been added since init.
                if (ms.collectPointerTargets) {
                    const want = ms.collectPointerTargets();
                    const have = new Set(ms.pointerTargets || []);
                    for (const t of want) {
                        if (have.has(t)) continue;
                        try { t.addEventListener("pointerdown", ms.handlers.onPointerDown, { capture: true }); } catch(err) {}
                    }
                    ms.pointerTargets = want;
                }
            };
            const onPointerDown = (e) => {
                // Don't dismiss when the press lands inside our own menu —
                // that would cancel the menu-item click before it fires.
                // wvWithin: its scrollbar's anonymous thumb too (#55).
                if (ms.el && wvWithin(ms.el, e.target)) return;
                hideMenu();
            };
            // Click stays as a fallback for keyboard-synthesised activations
            // (Space / Enter on a focused element fire `click` but not
            // `pointerdown`).
            const onAnyClick = () => hideMenu();
            const onKey = (e) => { if (e.key === "Escape") hideMenu(); };
            const onWheel = () => hideMenu();
            const onWinBlur = () => hideMenu();
            const root = doc.documentElement;
            root.addEventListener("contextmenu", onCtx, true);
            root.addEventListener("click", onAnyClick, true);
            root.addEventListener("keydown", onKey, true);
            root.addEventListener("wheel", onWheel, { capture: true, passive: true });
            // pointerdown: matches Zotero reader's overlay-popup idiom.
            // Attach to the main document AND every iframe's contentDocument,
            // because a pointerdown inside an iframe does not bubble to the
            // parent document even during capture phase. Iframes are mostly
            // the PDF reader frame in this app, but the same logic applies
            // anywhere — we re-discover the live iframe list on every menu
            // open, since iframes are added/removed as the user navigates.
            const collectPointerTargets = () => {
                const targets = [doc];
                try {
                    for (const f of doc.querySelectorAll("iframe") as any) {
                        const fd = f.contentDocument;
                        if (fd) targets.push(fd);
                    }
                } catch (e) { /* cross-origin frames throw; skip them */ }
                return targets;
            };
            ms.pointerTargets = collectPointerTargets();
            for (const t of ms.pointerTargets) {
                try { t.addEventListener("pointerdown", onPointerDown, { capture: true }); } catch(e) {}
            }
            try { win.addEventListener("blur", onWinBlur); } catch(e) {}
            ms.root = root;
            ms.win = win;
            ms.handlers = { onCtx, onAnyClick, onKey, onWheel, onPointerDown, onWinBlur };
            ms.collectPointerTargets = collectPointerTargets;
            this._urlMenuState = ms;
        }

        // Click handler: only fires if mousedown didn't already handle it
        // (e.g. keyboard-synthesised click). Otherwise just suppress the click.
        H.click = (e) => {
            // Defensive: `click` should not fire for non-left-clicks per the
            // DOM spec, but Mozilla can synthesize one in some platform
            // paths (notably right-click on a focused element that looks
            // link-like — pointer cursor + tooltip + data-href). If that
            // happens, bail before any launchURL path can run, otherwise
            // the right-click would open the link instead of opening our
            // context menu.
            if (e.button !== 0) {
                this._dbg("[Weavero] tree click suppressed: button=" + e.button);
                return;
            }
            const recentlyHandled = (Date.now() - H.lastHandled) < 600;
            if (recentlyHandled) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.preventDefault();
                this._dbg("[Weavero] click suppressed (handled by mousedown)");
                return;
            }
            const urlSpan = e.target.closest && e.target.closest(".wv-url-span");
            if (urlSpan) {
                const cell = urlSpan.closest(".annotation-row.tight .cell.annotation-comment");
                if (!cell) return;
                e.stopPropagation(); e.preventDefault();
                const url = (urlSpan.getAttribute("data-href")
                          || urlSpan.textContent || "").trim();
                if (!url) return;
                if (url.startsWith("zotero://")) this.handleZoteroURI(url);
                else this._launchURL(url);
                return;
            }
            const treeIcon = e.target.closest && e.target.closest(".wv-tree-icon");
            if (!treeIcon) return;
            const cell = treeIcon.closest(
                ".annotation-row.tight .cell.annotation-comment");
            if (!cell) return;
            e.stopPropagation(); e.preventDefault();
            const text = cell.getAttribute("data-comment-text")
                || (cell.textContent || "").replace(/[\s\u00A0]*🔗\s*$/, "").trim();
            this.openCommentPopup(text, { anchorNode: treeIcon });
        };
        // Fire the action from mousedown, before React's row-selection logic
        // can re-render the cell and destroy the span before mouseup fires.
        // We block subsequent click/mouseup with a short-lived flag so the
        // action doesn't double-fire.
        H.lastHandled = 0;
        H.down = (e) => {
            const tgt = e.target;
            const tgtDesc = tgt
                ? (tgt.nodeName + "." + (tgt.className || "(no class)"))
                : "null";
            this._dbg("[Weavero] mousedown received: target=" + tgtDesc
                + " button=" + e.button + " phase=" + e.eventPhase);
            if (e.button !== 0) return;
            if (!tgt || !tgt.closest) return;

            // .wv-tree-rel-icon owns its own click handler that opens
            // the relations popup directly. Suppress the row's
            // capture-phase _captureMouseUpDown (virtualized-table.jsx)
            // so the FIRST click goes straight to the popup instead of
            // selecting the row first. Document-level capture runs
            // before the row's, so stopPropagation here cuts the chain
            // cleanly.
            if (tgt.closest(".wv-tree-rel-icon")) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                return;
            }

            // Click on .wv-md-preview inside an in-document annotation
            // popup → enter edit mode. The popup is implemented as a
            // XUL panel in the main window (not in the reader iframe),
            // so the iframe-side sidebarPreviewClick handler never sees
            // these events — we have to handle them here, in the main
            // window's mousedown handler. Skip if the click was on a
            // URL span (the URL handler will fire instead).
            if (!tgt.closest(".wv-url-span")) {
                const previewInPopup = tgt.closest(".wv-md-preview");
                const popupAncestor = previewInPopup
                    && previewInPopup.closest(".annotation-popup");
                if (previewInPopup && popupAncestor) {
                    const cmt = previewInPopup.closest(".comment");
                    const content = cmt && cmt.querySelector(".content");
                    if (cmt && content) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                        cmt.classList.add("wv-editing");
                        // Defer focus so the wv-editing class' CSS has
                        // applied (un-hides .content); calling focus()
                        // on a still-display:none element silently fails.
                        const cwin = doc.defaultView || Zotero.getMainWindow();
                        const raf = (cwin && cwin.requestAnimationFrame)
                            ? cwin.requestAnimationFrame.bind(cwin)
                            : (cb) => setTimeout(cb, 0);
                        raf(() => {
                            try {
                                content.focus();
                                const sel = cwin && cwin.getSelection && cwin.getSelection();
                                if (sel) {
                                    const range = doc.createRange();
                                    range.selectNodeContents(content);
                                    range.collapse(false);
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                }
                            } catch(err) {}
                        });
                        this._dbg("[Weavero] mainPreviewClick: entered edit mode for popup");
                        return;
                    }
                }
            }

            // Use composedPath() so we can detect spans inside open shadow roots
            // (right-pane <annotation-row> uses one in some Zotero versions).
            const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
            let urlSpan = null, treeIcon = null;
            for (const node of path) {
                if (!node || !node.classList) continue;
                if (!urlSpan && node.classList.contains("wv-url-span")) urlSpan = node;
                if (!treeIcon && node.classList.contains("wv-tree-icon")) treeIcon = node;
                if (urlSpan && treeIcon) break;
            }
            if (!urlSpan && tgt.closest) urlSpan = tgt.closest(".wv-url-span");
            if (!treeIcon && tgt.closest) treeIcon = tgt.closest(".wv-tree-icon");
            this._dbg("[Weavero] mousedown lookup: urlSpan="
                + !!urlSpan + " treeIcon=" + !!treeIcon);

            // Only URL-span and visible tree-icon clicks are handled.
            // Plain text in the cell: ignored, row selection proceeds.
            if (!urlSpan && !treeIcon) return;

            this._dbg("[Weavero] mousedown: blocking + firing action urlSpan="
                + !!urlSpan + " treeIcon=" + !!treeIcon);
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            e.preventDefault();
            H.lastHandled = Date.now();

            if (urlSpan) {
                // Markdown links [label](url) put the destination in
                // data-href; the visible textContent is the label.
                const url = (urlSpan.getAttribute("data-href")
                          || urlSpan.textContent || "").trim();
                if (!url) {
                    this._dbg("[Weavero] tree url click: empty url, ignored");
                    return;
                }
                if (url.startsWith("zotero://")) this.handleZoteroURI(url);
                else this._launchURL(url);
                return;
            }
            // Tree icon click → open popup with full comment (sans icon glyph).
            // Use a lenient lookup: prefer .annotation-row.tight, fall back
            // to any .cell.annotation-comment ancestor (some Zotero builds
            // omit the .tight modifier in newer DOM layouts).
            let cell = treeIcon.closest(
                ".annotation-row.tight .cell.annotation-comment")
                || treeIcon.closest(".cell.annotation-comment")
                || treeIcon.parentElement;
            if (!cell) {
                this._dbg("[Weavero] tree icon click: no cell ancestor for icon");
                return;
            }
            const text = cell.getAttribute("data-comment-text")
                || (cell.textContent || "").replace(/[\s\u00A0]*🔗\s*$/, "").trim();
            if (!text) {
                this._dbg("[Weavero] tree icon click: empty text, ignored");
                return;
            }
            this._dbg("[Weavero] tree icon click: opening popup ("
                + text.length + " chars: " + text.slice(0, 40).replace(/\n/g, " ") + ")");
            // Capture the icon's viewport rect SYNCHRONOUSLY here — Zotero
            // re-renders the items tree on row selection, which detaches
            // the original icon and gives it a 0,0,0,0 rect by the time a
            // deferred callback fires.
            let capturedRect = null;
            try {
                const r = treeIcon.getBoundingClientRect();
                capturedRect = {
                    left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                    width: r.width, height: r.height
                };
            } catch(rerr) {}
            // Defer one tick: Zotero's tree row click handler also fires on
            // mousedown, and a synchronous popup open racing against it
            // can be dismissed by Zotero's own focus/blur flow.
            const win = Zotero.getMainWindow();
            const setTimeoutFn = win && win.setTimeout || setTimeout;
            setTimeoutFn(() => {
                try {
                    this.openCommentPopup(text, {
                        anchorNode: treeIcon,
                        anchorRect: capturedRect
                    });
                }
                catch(err) { Zotero.debug("[Weavero] openCommentPopup err: " + err); }
            }, 0);
        };
        doc.addEventListener("mousedown", H.down, true);

        // Also block the corresponding click so it can't re-trigger or focus
        H.up = (e) => {
            // Mirror the mousedown short-circuit for .wv-tree-rel-icon
            // — _handleMouseUp finalises selection on left-click, so
            // we have to suppress the mouseup leg too.
            const tgt = e.target;
            if (e.button === 0 && tgt && tgt.closest
                    && tgt.closest(".wv-tree-rel-icon")) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                return;
            }
            if (Date.now() - H.lastHandled < 600) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        doc.addEventListener("mouseup", H.up, true);

        doc.addEventListener("click", H.click, true);

        // Window resize → re-evaluate truncation flags so the fallback icon
        // toggles when the user widens/narrows the items column.
        H.resize = () => {
            if (H.resizeTimer) win.clearTimeout(H.resizeTimer);
            H.resizeTimer = win.setTimeout(() => {
                H.resizeTimer = null;
                try { this._updateTruncationFlags(doc); }
                catch(e) { Zotero.debug("[Weavero] resize truncation error: " + e); }
            }, 120);
        };
        win.addEventListener("resize", H.resize);

        Zotero.debug("[Weavero] tree mousedown/click delegates attached (document capture)");
    }

    /** One window's delegate, or every main window's with no argument. */
    _teardownTreeClickDelegate(win?: any) {
        if (!win) {
            for (const w of (Zotero.getMainWindows() || [])) {
                try { this._teardownTreeClickDelegate(w); } catch (e) {}
            }
            return;
        }
        const H: any = win._wvTreeDelegate;
        if (!H) return;
        try {
            const doc = win.document;
            if (doc) {
                if (H.click) doc.removeEventListener("click", H.click, true);
                if (H.down) doc.removeEventListener("mousedown", H.down, true);
                if (H.up) doc.removeEventListener("mouseup", H.up, true);
            }
            if (H.resize) win.removeEventListener("resize", H.resize);
            if (H.resizeTimer) win.clearTimeout(H.resizeTimer);
            if (H.mo) H.mo.disconnect();
        } catch(e) {}
        delete win._wvTreeDelegate;
    }

    // =====================================================================
    // (filter.ts methods — the bulk of the filter group state + UI
    //  rendering — that physically lived between this and the next pane
    //  block have been hoisted into modules/filter.ts.)
    // =====================================================================

    _setupLibrariesBoxHighlight(win) {
        if (!win) return;
        // Pref gate (Relations group → Libraries highlight).
        if (!this._getEnableLibrariesHighlight()) {
            try { this._teardownLibrariesBoxHighlight(win); } catch (e) {}
            return;
        }
        const doc = win.document;
        if (!doc) return;

        // Initial pass — boxes may already be mounted on plugin
        // (re)start.
        try { this._decorateAllLibrariesBoxes(win); } catch (e) {}

        if (win._wvLibrariesBoxMo) {
            try { win._wvLibrariesBoxMo.disconnect(); } catch (e) {}
        }
        // Top-level observer on the document — every render of a
        // libraries-collections-box mutates its `.body`. We coalesce
        // bursts of mutations behind a 50 ms timer so a full panel
        // re-render only triggers one decoration pass.
        let scheduled = false;
        const mo = new win.MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            win.setTimeout(() => {
                scheduled = false;
                try { this._decorateAllLibrariesBoxes(win); }
                catch (e) {}
            }, 50);
        });
        mo.observe(doc.documentElement, {
            childList: true,
            subtree: true,
        });
        win._wvLibrariesBoxMo = mo;
    }

    _teardownLibrariesBoxHighlight(win) {
        if (!win) return;
        const doc = win.document;
        try {
            if (win._wvLibrariesBoxMo) {
                win._wvLibrariesBoxMo.disconnect();
                delete win._wvLibrariesBoxMo;
            }
        } catch (e) {}
        // Strip our marker class from any rows that still carry it.
        try {
            if (!doc) return;
            for (const r of doc.querySelectorAll(
                ".wv-libraries-current-library")) {
                r.classList.remove("wv-libraries-current-library");
            }
        } catch (e) {}
    }

    _decorateAllLibrariesBoxes(win) {
        const doc = win.document;
        if (!doc) return;
        const boxes = doc.querySelectorAll("libraries-collections-box");
        for (const box of boxes) {
            try { this._decorateLibrariesBox(box); }
            catch (e) {}
        }
    }

    _decorateLibrariesBox(box) {
        if (!box) return;
        const body = box.querySelector(".body");
        if (!body) return;

        // Always strip prior markers first — set is idempotent.
        for (const r of body.querySelectorAll(
            ".wv-libraries-current-library")) {
            r.classList.remove("wv-libraries-current-library");
        }

        const item = box._item;
        if (!item) return;
        const linkedItems = box._linkedItems || [];
        // Only highlight when the item is replicated across libraries
        // — for a single-library item the existing visual is fine.
        if (linkedItems.length === 0) return;

        const libID = item.libraryID;
        if (libID == null) return;
        let lib;
        try { lib = Zotero.Libraries.get(libID); }
        catch (e) { return; }
        if (!lib) return;
        const treeViewID = lib.treeViewID;
        if (!treeViewID) return;

        const win = winOf(box);
        const escape = (s) => (win && win.CSS && win.CSS.escape)
            ? win.CSS.escape(s) : String(s).replace(/"/g, "\\\"");
        const targetRow = body.querySelector(
            `.row[data-id="${escape(treeViewID)}"]`);
        if (targetRow) {
            targetRow.classList.add("wv-libraries-current-library");
        }
    }

    // =====================================================================
    // (filter.ts UI rendering methods that physically lived between this
    //  and the next pane block have been hoisted into modules/filter.ts.)
    // =====================================================================

    decorateContextMenu(idoc) {
        if (!idoc || !idoc.querySelectorAll) return 0;
        // Per-prefix icon factory:
        //   "Add Related"            → inline <svg> chain via
        //                              _makeRelationsSvg (fill=
        //                              currentColor → reads on light AND
        //                              dark menu backgrounds).
        //   "Copy Select/Open Link"  → the plugin's needle <img>, same
        //                              icon the items-list / related-
        //                              item "Copy … Link" entries use.
        const buildIconNode = (text) => {
            if (text.startsWith("Add Related")) {
                return this._makeRelationsSvg(idoc);
            }
            if (text.startsWith("Copy Select Link") || text.startsWith("Copy Open Link")) {
                const iconURL = this._menuItemIconURL;
                if (!iconURL) return null;
                const img: any = idoc.createElement("img");
                img.src = iconURL;
                img.setAttribute("width", "16");
                img.setAttribute("height", "16");
                img.style.display = "block";
                return img;
            }
            return null;
        };
        const buttons = idoc.querySelectorAll(".context-menu .row.basic");
        let touched = 0;
        for (const btn of buttons) {
            if (btn.dataset && btn.dataset.wvDecorated) continue;
            const text = (btn.textContent || "").trim();
            let match = false;
            for (const prefix of MENU_LABEL_PREFIXES) {
                if (text.startsWith(prefix)) { match = true; break; }
            }
            if (!match) continue;
            const iconNode = buildIconNode(text);
            if (!iconNode) continue;
            try {
                const wrap = idoc.createElement("div");
                wrap.className = "icon";
                wrap.appendChild(iconNode);
                btn.insertBefore(wrap, btn.firstChild);
                btn.dataset.wvDecorated = "1";
                touched++;
            } catch(e) {
                Zotero.debug("[Weavero] decorateContextMenu insert err: " + e);
            }
        }
        if (buttons.length) {
            this._dbg("[Weavero] decorateContextMenu: items="
                + buttons.length + " touched=" + touched);
        }
        return touched;
    }

    // ---- Right pane annotation list ---------------------------------------

    /** Try to find a child via querySelector, falling back to shadowRoot. */
    _qsDeep(host, sel) {
        let el = host.querySelector?.(sel);
        if (el) return el;
        if (host.shadowRoot) {
            el = host.shadowRoot.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    _injectPaneRowIcon(row) {
        // Wire the type-aware right-click menu for this annotation-row
        // before the right-pane pref check below. The menu provides
        // basic navigation (Show in Library, Open in Reader, Copy
        // Item Link, etc.) and shouldn't depend on whether the user
        // has Weavero's right-pane rendering enabled — it's a generic
        // affordance the user expects on any annotation row.
        this._wireAnnotationRowContextMenu(row);

        // Pref check at the top because the pane mutation observer calls
        // this directly for each affected row (the sync-render path that
        // avoids the right-pane FOUC). Without this check, toggling the
        // right-pane pref off feeds an infinite cycle: strip → observer
        // fires → sync render re-applies our markup → 80 ms safety-net
        // scan strips again → ... Same shape as the items-list freeze
        // bug fixed in v0.0.149.
        if (!this._getEnableRightPane()) return;
        // Relations icon is independent of comment content (an
        // annotation with no comment can still have relations).
        // Run this BEFORE the comment-iconable bailout below, which
        // would otherwise short-circuit the relations decoration on
        // plain-text-only comments. Bug surfaced in v0.5.1: a Test
        // comment annotation kept its relation in data but the
        // chain icon never appeared on the right-pane card because
        // _commentHasIconableContent returned false and we returned.
        try { this._decoratePaneRowRelations(row); }
        catch (e) {
            Zotero.debug("[Weavero] _decoratePaneRowRelations err: " + e.message);
        }
        const commentEl = this._qsDeep(row, ".body .comment")
                       || this._qsDeep(row, ".comment");
        if (!commentEl) {
            this._dbg("[Weavero] pane row: no commentEl found"
                + " (hasShadow=" + !!row.shadowRoot + ")");
            return;
        }
        // textContent of a rendered comment is the STRIPPED form (markers
        // gone, e.g. "strike only" rather than "~~strike only~~"), so we
        // can't rely on it alone to decide whether the comment has rich
        // content. Three states to handle:
        //   1. Spans still present  → trust data-wv-raw, fall back to text.
        //   2. Spans stripped, textContent matches data-wv-rendered → spans
        //      got reaped by Zotero's React reconciliation; data-wv-raw is
        //      still the source of truth, so we use it. Without this case,
        //      _commentHasIconableContent would see only the markerless inner
        //      text and bail with "no rich content", leaving the comment
        //      stuck as raw markdown forever.
        //   3. Spans stripped AND textContent differs from data-wv-rendered
        //      → user edited the comment; live textContent is fresh.
        const ourMarkers = commentEl.querySelector(".wv-md, .wv-url-span");
        const cachedRaw = commentEl.getAttribute("data-wv-raw");
        const cachedRendered = commentEl.getAttribute("data-wv-rendered");
        const liveText = commentEl.textContent || "";
        let plainText;
        if (ourMarkers) {
            // Reconstruct from spans if data-wv-raw was lost — liveText
            // is the stripped form and would lose markdown markers.
            plainText = cachedRaw || this._reconstructSourceFromSpans(commentEl);
        } else if (cachedRaw && cachedRendered !== null && liveText === cachedRendered) {
            plainText = cachedRaw;
        } else {
            plainText = liveText;
        }
        // Bail only if there's nothing to render — neither URL nor markdown
        // formatting. Use _commentHasIconableContent (NOT _iconWantedFor) so
        // that the user-facing icon prefs control only the icon, not the
        // inline rendering. Items-tree's _markCellLinks gates the same way;
        // until v0.1.77 the right pane gated on the icon pref by accident,
        // which made markdown-only comments stop rendering when the user
        // turned the icon off.
        if (!this._commentHasIconableContent(plainText)) {
            this._dbg("[Weavero] pane row: no rich content in commentEl");
            return;
        }
        // If commentEl is inside a shadow root, main-doc styles don't reach it.
        // Inject a small stylesheet into that shadow root once.
        const root = commentEl.getRootNode();
        if (root !== row.ownerDocument && root.host && !root.getElementById?.("wv-shadow-style")) {
            try {
                const s = row.ownerDocument.createElement("style");
                s.id = "wv-shadow-style";
                s.textContent = ":root { " + wvLinkVars("light") + " }"
                    + ":root.wv-ui-dark { " + wvLinkVars("dark") + " }"
                    + ".wv-url-span { cursor: pointer !important; }"
                    + ".wv-url-span.wv-link-http   { color: var(--wv-link-http)   !important; }"
                    + ".wv-url-span.wv-link-zotero { color: var(--wv-link-zotero) !important; }"
                    + ".wv-url-span.wv-link-app    { color: var(--wv-link-app)    !important; }"
                    // Preview-panel rules: show the formatted preview
                    // when not editing, swap to raw .content on focus.
                    + ".wv-md-preview { font: inherit; color: inherit;"
                    + "  line-height: inherit; white-space: pre-wrap;"
                    + "  word-wrap: break-word; overflow-wrap: break-word; }"
                    + ".comment.wv-comment-preview .content { display: none; }"
                    + ".comment.wv-comment-preview > *:not(.wv-md-preview) { display: none; }"
                    + ".comment.wv-comment-preview .editor > *:not(.wv-md-preview) { display: none; }"
                    + ".comment.wv-comment-preview .wv-md-preview { display: block; }"
                    + ".comment.wv-comment-preview.wv-editing .content { display: block; }"
            + ".comment.wv-comment-preview.wv-editing > *:not(.wv-md-preview) { display: revert; }"
            + ".comment.wv-comment-preview.wv-editing .editor > *:not(.wv-md-preview) { display: revert; }"
                    + ".comment.wv-comment-preview.wv-editing .wv-md-preview { display: none; }"
                    + ".wv-md-bold { font-weight: 700; }"
                    + ".wv-md-italic { font-style: italic; }"
                    + ".wv-md-strike { text-decoration: line-through; opacity: 0.85; }"
                    + ".wv-md-code { font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace;"
                    + "  font-size: 92%; padding: 0 3px; border-radius: 3px;"
                    + "  background: rgba(127,127,127,0.15); }";
                root.appendChild(s);
            } catch(e) { Zotero.debug("[Weavero] shadow style inject failed: " + e); }
        }

        // Zotero 10's right-pane comment is a non-editable <div class="comment">
        // (verified via the v0.0.129 pane row diag). Since nothing inside it
        // is contenteditable, we can render markdown + URL spans directly into
        // the element — same approach the items-list cell uses. The earlier
        // architecture comment claiming this would break editing was based on
        // a previous Zotero version where the .comment was contenteditable.
        // Defensive: if a future Zotero version makes this editable, fall
        // back to URL-only marking which has edit-mode protections.
        let fresh;
        if (commentEl.isContentEditable) {
            fresh = this._markTextLinks(commentEl);
        } else {
            fresh = this._renderPaneCommentInline(commentEl);
        }
        this._dbg("[Weavero] pane row: "
            + (fresh ? "MARKED FRESH" : "already marked / skipped")
            + " (commentEl in " + (commentEl.getRootNode() === row.ownerDocument
                ? "light DOM" : "shadow DOM") + ")");

        // Decide whether the popup-icon button adds value.
        //   - Mode 2 (icons-only) and unrendered-markdown cases: the helper
        //     returns true; show the icon.
        //   - Otherwise: show only if the comment is overflowing, i.e. some
        //     URLs / formatted text may be clipped by Zotero's layout.
        let shouldShowIcon = this._iconAddsValueBeyondInline(plainText);
        if (!shouldShowIcon) {
            try {
                shouldShowIcon =
                    commentEl.scrollHeight > commentEl.clientHeight + 1
                    || commentEl.scrollWidth > commentEl.clientWidth + 1;
            } catch(e) { shouldShowIcon = false; }
        }
        // Existing comment-icon button (if any). The relations icon
        // (`.wv-btn-relations` below) is a separate button that LIVES
        // alongside this one, so we exclude it from the selector.
        let existingBtn = this._qsDeep(row,
            "." + BTN_PANE_CLASS + ":not(.wv-btn-relations)");
        const actionEl = this._qsDeep(row, ".head .action")
                      || this._qsDeep(row, ".action");

        if (!shouldShowIcon) {
            // Mode/overflow no longer warrants the icon — clean up if
            // it was added on a previous pass. Don't return: the
            // relations icon may still be wanted on this row.
            existingBtn?.remove();
            existingBtn = null;
        } else if (!existingBtn && actionEl) {
            const doc = row.ownerDocument;
            const btn = wvHtmlEl(doc, "button", BTN_CLASS + " " + BTN_PANE_CLASS);
            this._applyIconState(btn, plainText);
            btn.addEventListener("click", e => {
                e.stopPropagation(); e.preventDefault();
                this.openCommentPopup(plainText, { anchorNode: btn });
            });
            // Order policy: comment LEFT, relations RIGHT. If a
            // relations button is already present in `.action`,
            // insert comment BEFORE it. Otherwise append to the end.
            const existingRel = this._qsDeep(row, ".wv-btn-relations");
            if (existingRel && existingRel.parentNode === actionEl) {
                actionEl.insertBefore(btn, existingRel);
            } else {
                actionEl.appendChild(btn);
            }
            existingBtn = btn;
        }

    }

    /** Add (or refresh / remove) the right-pane chain icon for a
     *  single `<annotation-row>` based on the annotation's current
     *  `relatedItems`. Independent of comment content — pulled out
     *  of `_injectPaneRowIcon` so plain-text-only comments still
     *  surface relations. Order policy: comment icon LEFT, relations
     *  RIGHT. Inserts the relations button after any existing
     *  comment button; falls back to appendChild when no comment
     *  button is present yet. */
    _decoratePaneRowRelations(row) {
        const ann = row && row.annotation;
        if (!ann) return;
        const actionEl = this._qsDeep(row, ".head .action")
                      || this._qsDeep(row, ".action");
        const wantsRel = this._getAnnotationRelatedItems(ann).length > 0;
        const existingRel = this._qsDeep(row, ".wv-btn-relations");
        if (!wantsRel) {
            existingRel?.remove();
            return;
        }
        if (existingRel) {
            const newTitle = this._getAnnotationRelatedItems(ann).length + " Related";
            if (existingRel.title !== newTitle) existingRel.title = newTitle;
            return;
        }
        if (!actionEl) return;
        const doc = row.ownerDocument;
        const relBtn = wvHtmlEl(doc, "button");
        relBtn.className = BTN_CLASS + " " + BTN_PANE_CLASS
            + " wv-btn-relations";
        const count = this._getAnnotationRelatedItems(ann).length;
        relBtn.title = count + " Related";
        relBtn.appendChild(this._makeRelationsSvg(doc));
        relBtn.addEventListener("click", e => {
            e.stopPropagation(); e.preventDefault();
            this.openRelationsPopup(ann, { anchorNode: relBtn });
        });
        const commentBtnEl = actionEl.querySelector(
            "." + BTN_PANE_CLASS + ":not(.wv-btn-relations)");
        if (commentBtnEl) {
            actionEl.insertBefore(relBtn, commentBtnEl.nextSibling);
        } else {
            actionEl.appendChild(relBtn);
        }
    }

    /**
     * Render a non-editable right-pane comment with inline markdown + URL
     * spans. Replaces commentEl's children with a fragment where:
     *   - **bold**, *italic*, ~~strike~~, `code` / ``code`` markers are
     *     consumed and the inner text wrapped in styled spans.
     *   - [label](url) becomes a clickable URL span with data-href.
     *   - Bare https://, zotero://, etc. URLs become clickable URL spans.
     * Markers are stripped from view so the user sees rendered formatting.
     *
     * Idempotent via two element attributes:
     *   - data-wv-raw stores the original source text (so subsequent
     *     passes can recover the unstripped text — commentEl.textContent
     *     would otherwise reflect the stripped view).
     *   - data-wv-source stores the cache key (md-pref + normalized text).
     *     A pass with a matching key short-circuits without rebuilding.
     *
     * Returns true when a rebuild actually occurred.
     */
    _renderPaneCommentInline(commentEl) {
        if (!commentEl || !commentEl.ownerDocument) return false;
        const doc = commentEl.ownerDocument;

        // Icons-only mode (Mode 2): "comments stay plain text". Restore the
        // raw source if we previously rendered formatting into this element,
        // then bail. Matches items list and sidebar Mode 2 behaviour.
        if (!this._getInlineLinks()) {
            const cachedRaw = commentEl.getAttribute("data-wv-raw");
            if (cachedRaw !== null) {
                while (commentEl.firstChild) commentEl.removeChild(commentEl.firstChild);
                commentEl.appendChild(doc.createTextNode(cachedRaw));
                commentEl.removeAttribute("data-wv-raw");
                commentEl.removeAttribute("data-wv-source");
                commentEl.removeAttribute("data-wv-rendered");
            }
            return false;
        }

        // Source text. Same three-state decision as _injectPaneRowIcon —
        // textContent of a rendered comment is the stripped form, so we
        // can't trust it after Zotero reaps our spans. data-wv-rendered
        // is the textContent we last produced; if liveText still matches
        // it, our raw cache is valid. If liveText differs, the user edited
        // the comment and we use the fresh text.
        // NOTE: textContent collapses any <br> separators Zotero might use,
        // which is fine here — the right pane intentionally renders comments
        // as a single line, so we don't try to reintroduce line breaks. The
        // PDF-reader sidebar uses the parallel _renderPreviewPanel which DOES
        // preserve breaks via _readCommentTextWithBreaks.
        const ourMarkers = commentEl.querySelector(".wv-md, .wv-url-span");
        const cachedRaw = commentEl.getAttribute("data-wv-raw");
        const cachedRendered = commentEl.getAttribute("data-wv-rendered");
        const liveText = commentEl.textContent || "";
        let raw;
        if (ourMarkers) {
            // Reconstruct from spans if data-wv-raw was lost — liveText
            // is the stripped form and would lose markdown markers.
            raw = cachedRaw || this._reconstructSourceFromSpans(commentEl);
        } else if (cachedRaw && cachedRendered !== null && liveText === cachedRendered) {
            raw = cachedRaw;
        } else {
            raw = liveText;
        }
        const norm = this.normalize(raw);
        const useMd = this._getEnableCommentMarkdown();
        // URL_REGEX excludes schemes whose master is off — no extra
        // `_getEnableInlineUrls() && ...` gate (that hid Zotero/app
        // links when URLs was off).
        const hasUrls = this.hasURI(raw);
        const hasMd   = useMd && this.MD_REGEX.test(norm);
        if (!hasUrls && !hasMd) return false;

        // Cache key invalidates when text or relevant prefs change.
        // BUT only honour the cache if our rendered output is still intact —
        // Zotero's React reconciliation can strip .wv-md / .wv-url-span
        // children while preserving the data-wv-source attribute. We detect
        // that via two signals:
        //   1. ourMarkers is non-null (some of our spans still in the DOM).
        //   2. liveText still matches data-wv-rendered (no partial reap that
        //      preserved one span class but stripped the other).
        // If either fails, fall through and rebuild.
        // Cache key encodes markdown + URL_SCHEME_ALT (which itself
        // captures URLs / Zotero Links / App Links toggle state) so
        // any link-related pref change invalidates the cache.
        const cacheKey = (useMd ? "m" : "") + ":"
            + this.URL_SCHEME_ALT + ":" + norm;
        const cacheHit = ourMarkers
            && commentEl.getAttribute("data-wv-source") === cacheKey
            && cachedRendered !== null
            && liveText === cachedRendered;
        if (cacheHit) return false;
        // If markers are gone, drop the stale attributes so a downstream
        // observer pass (or our own next call) sees an unrendered cell.
        if (!ourMarkers) {
            commentEl.removeAttribute("data-wv-source");
        }

        // Build the formatted fragment via the unified renderer
        // (single source of truth across all 4 surfaces — see
        // reader.ts `_buildCommentFragment`).
        const frag = this._buildCommentFragment(raw, {
            doc, useMd, isTreeMode: true,
        });

        // Stash the raw source BEFORE replacing children — afterwards
        // commentEl.textContent reflects the stripped/formatted view.
        commentEl.setAttribute("data-wv-raw", raw);
        while (commentEl.firstChild) commentEl.removeChild(commentEl.firstChild);
        commentEl.appendChild(frag);
        commentEl.setAttribute("data-wv-source", cacheKey);
        // Record the textContent we just produced so a later pass can tell
        // whether the live text is "spans-stripped form of cachedRaw" (use
        // cachedRaw) or "user edited" (use liveText).
        commentEl.setAttribute("data-wv-rendered", commentEl.textContent || "");
        this._dbg("[Weavero] pane comment rendered:"
            + " useMd=" + useMd
            + " childCount=" + commentEl.childNodes.length);
        return true;
    }

    /** `docArg`: the window's document when called from that window's pane
     *  observer (#17); the focused main window's otherwise. */
    _scanPaneRows(docArg?: any) {
        if (!this._getEnableRightPane()) {
            this._stripRightPane();
            return;
        }
        const doc = docArg || Zotero.getMainWindow().document;
        // Scan ALL <annotation-row> custom elements anywhere in the document.
        // Zotero shows these in two right-pane views — the attachment's
        // annotation list (under #zotero-view-item) and the single-annotation
        // detail view (in a different container). The items tree uses a CSS
        // class .annotation-row on plain <div>s, NOT the custom element, so
        // tag-selecting `annotation-row` is unique to the right pane.
        const rows = doc.querySelectorAll("annotation-row");
        this._dbg("[Weavero] _scanPaneRows: found " + rows.length
            + " annotation-row elements");
        for (const row of rows)
            this._injectPaneRowIcon(row);
        const spans = doc.querySelectorAll("annotation-row .wv-url-span");
        this._dbg("[Weavero] _scanPaneRows: " + spans.length
            + " .wv-url-span elements live after pass");
        // Same surface — process related-box annotation rows so URLs
        // and markdown in the (already-truncated) display title are
        // styled like the rest of the comment surfaces.
        try { this._processRelatedBoxes(doc); }
        catch(e) { Zotero.debug("[Weavero] _processRelatedBoxes err: " + e); }
    }

    /** Clear DOM markers left behind by a previous plugin instance
     *  (after an in-place plugin upgrade). The old plugin's event
     *  handlers are bound to closures that the new instance can't
     *  see, so any element that the new code skips because of an
     *  "already processed" marker is effectively dead. Re-running
     *  init alone doesn't help — the marker is on the DOM, not on
     *  the plugin instance.
     *
     *  Called from `onMainWindowLoad` so that an upgrade recovers
     *  to a working state without the user having to disable +
     *  re-enable the plugin manually. */
    _resetStaleMarkers(doc) {
        if (!doc || !doc.querySelectorAll) return;
        try {
            // Related-box rows: clear render-cache + context-menu
            // wire flags so `_processRelatedBoxes` reprocesses
            // every row from scratch.
            for (const l of doc.querySelectorAll(
                    "related-box .body .row .label[data-wv-related-rendered]")) {
                l.removeAttribute("data-wv-related-rendered");
                // Same elements may carry the _markTextLinks cache
                // markers too; clear them so the rebuild path runs.
                l.removeAttribute("data-wv-source");
                l.removeAttribute("data-wv-rendered");
                l.removeAttribute("data-wv-raw");
                l.removeAttribute("data-wv-last-rebuild");
            }
            for (const r of doc.querySelectorAll(
                    "related-box .body .row[data-wv-ctx-wired]")) {
                r.removeAttribute("data-wv-ctx-wired");
            }
            // Right-pane comment cells and any other element that
            // carries our render-cache markers. The previous plugin's
            // markers would otherwise stick around and make the new
            // instance's cache check skip the rebuild it needs to do.
            for (const el of doc.querySelectorAll(
                    "[data-wv-source], [data-wv-rendered], [data-wv-raw],"
                    + " [data-wv-last-rebuild]")) {
                el.removeAttribute("data-wv-source");
                el.removeAttribute("data-wv-rendered");
                el.removeAttribute("data-wv-raw");
                el.removeAttribute("data-wv-last-rebuild");
            }
        } catch (e) {
            Zotero.debug("[Weavero] _resetStaleMarkers err: " + e);
        }
    }

    /** Render URLs / markdown inline inside the right pane's "Related"
     *  section labels, but only for related items that ARE annotations.
     *  Upstream (`relatedBox.js`) builds each related row as
     *      `<div class="row"><div class="box">[icon][span.label]</div></div>`
     *  where the `.label` text is `relatedItem.getDisplayTitle()`. For
     *  annotations that title is built by `Zotero.Item.updateDisplayTitle`
     *  as `"<text>" <comment>` (each part already truncated to 50 chars
     *  + ellipsis), so it's "the visible part" by construction — the
     *  CSS column ellipsis only kicks in if the row is even narrower.
     *  We pass the label span through `_markTextLinks(.., {mode:"tree"})`
     *  which is the same path the items-tree note rows use: it strips
     *  markdown markers and renders inline `.wv-url-span`s, preserving
     *  text length and therefore preserving any column-level ellipsis.
     *
     *  Detection: upstream's `getCSSIcon('annotation-…')` builds an
     *  `<img class="annotation-icon">` for annotations and a different
     *  span structure for everything else. Querying for
     *  `.row .box img.annotation-icon` selects only annotation rows.
     */
    _processRelatedBoxes(doc) {
        if (!doc) return;
        // Process every label, not just annotation rows. Other related
        // items (web pages, attachments) can have URLs in their displayTitle
        // too, and unwrapping during destroy would otherwise leave them
        // stuck as plain text on re-enable. _markTextLinks is idempotent —
        // labels without URL/markdown content are no-ops.
        const labels = doc.querySelectorAll(
            "related-box .body .row .box .label");
        let touched = 0;
        for (const label of labels) {
            try {
                const box = label.closest(".box");
                const ariaText = box && box.getAttribute("aria-label");
                const liveTextBefore = label.textContent || "";
                const wvMdBefore = label.querySelectorAll(".wv-md").length;
                const wvUrlBefore = label.querySelectorAll(".wv-url-span").length;
                const sourceAttr = label.getAttribute("data-wv-source");
                // Recover the original raw displayTitle from the parent
                // .box's aria-label. Zotero sets aria-label = label.textContent
                // exactly once at row-render time and never updates it
                // afterwards (see relatedBox.js:123 in zotero/zotero), so
                // it's a frozen copy of the source — useful when the live
                // label content has been corrupted (older plugin instance,
                // partial reaping). But once WE'VE rendered, liveText is
                // legitimately the stripped form ("Test app link" instead
                // of "[Test app link](url)") and that's NOT corruption —
                // resetting would cause an infinite reset → render → reset
                // loop via the mutation observer.
                //
                // So only reset when the label has no spans of ours AND
                // the live text differs from aria-label.
                let didReset = false;
                const hasOurSpans = !!label.querySelector(".wv-md, .wv-url-span");
                if (ariaText && ariaText !== liveTextBefore && !hasOurSpans) {
                    while (label.firstChild) label.removeChild(label.firstChild);
                    label.appendChild(doc.createTextNode(ariaText));
                    label.removeAttribute("data-wv-source");
                    label.removeAttribute("data-wv-rendered");
                    label.removeAttribute("data-wv-raw");
                    label.removeAttribute("data-wv-last-rebuild");
                    delete label.dataset.wvRelatedRendered;
                    didReset = true;
                }
                // Always call _markTextLinks. Its cache check now validates
                // that the expected spans are still in the DOM, so skipping
                // here on a textContent match alone would mask cases where
                // some other code path stripped our spans (e.g.
                // _applyInlineLinksPref unwraps every .wv-url-span globally).
                const raw = label.textContent || "";
                let renderResult;
                if (this._markTextLinks(label, { mode: "tree" })) {
                    label.dataset.wvRelatedRendered = raw;
                    touched++;
                    renderResult = "rebuilt";
                } else {
                    renderResult = "no-rebuild";
                }
            } catch (e) {
                Zotero.debug("[Weavero] related label render err: " + e);
            }
        }
        if (touched) {
            this._dbg("[Weavero] _processRelatedBoxes: rendered "
                + touched + "/" + labels.length + " row(s)");
        }
        // Attach a contextmenu listener to EVERY related-box row (not
        // just annotation ones) so the user can right-click any related
        // item and get the type-aware open-options menu. Keyed and
        // instance-tagged (lib/listen.ts): the dataset flag alone was reset
        // at every startup, so after each reload a row carried one MORE
        // handler, the old ones calling into dead instances (54 on MJT's
        // main window after three reloads; wiring slice 3, 2026-10-12). The
        // listener resolves the row's item lazily at click time.
        const rows = doc.querySelectorAll("related-box .body .row");
        const tag = (this as any)._wvWireTag();
        for (const row of rows) {
            wvListen(row, "relatedRowCtx:contextmenu", "contextmenu", (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const item = this._resolveRelatedRowItem(row);
                    if (!item) return;
                    this._openRelatedItemContextMenu(item, e.screenX, e.screenY);
                } catch (err) {
                    Zotero.debug("[Weavero] rel-box ctx err: " + err);
                }
            }, false, tag);
            if (row.dataset) row.dataset.wvCtxWired = "1";
        }
    }

    /** Resolve the Zotero.Item backing a `<div class="row">` inside the
     *  right-pane Related section. Upstream's relatedBox.js doesn't
     *  expose the id on the row DOM (it captures it in a click-handler
     *  closure), so we pivot off the currently-selected item: the
     *  related-box always shows ITS relations, so iterating
     *  `parent.relatedItems` and matching by display title resolves the
     *  row in O(N) where N is small (related-section size). Falls
     *  through to null if nothing matches — caller bails. */
    _resolveRelatedRowItem(row) {
        if (!row) return null;
        try {
            const win = Zotero.getMainWindow();
            const zp = win && win.ZoteroPane;
            const labelEl = row.querySelector(".label");
            const labelText = labelEl ? (labelEl.textContent || "").trim() : "";
            if (!zp || !labelText) return null;
            // Build a candidate set of "owning" items: every selected
            // item AND every annotation child of every selected item
            // (in case the related-box is for an attachment but a
            // related annotation is what we right-clicked under it).
            const selected = (typeof zp.getSelectedItems === "function")
                ? zp.getSelectedItems() : [];
            const candidates = new Set();
            for (const it of selected) {
                if (it) candidates.add(it);
            }
            for (const owner of candidates as any) {
                const keys = (owner && owner.relatedItems) || [];
                for (const k of keys) {
                    let it;
                    try { it = Zotero.Items.getByLibraryAndKey(owner.libraryID, k); }
                    catch (e) { continue; }
                    if (!it) continue;
                    let title;
                    try { title = (it.getDisplayTitle() || "").trim(); }
                    catch (e) { title = ""; }
                    if (title === labelText) return it;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _resolveRelatedRowItem err: " + e);
        }
        return null;
    }

    /** Per WINDOW (survey 2026-10-06 #17): the observer, its scan timer and
     *  the comment focus handlers live on `win._wvPaneObs`. The singleton
     *  observed one window, and the focus handlers were attached once, to
     *  whichever window was set up first. Guard: test/survey-fixes-e.spec.js. */
    _setupPaneObserver(win?: any) {
        win = win || Zotero.getMainWindow();
        if (!win || win.closed || !win.document) return;
        const doc = win.document;
        this._teardownPaneObserver(win);
        const P: any = (win._wvPaneObs = { mo: null, focusIn: null, focusOut: null, scanTimer: null });

        // Initial pass — there may already be rows present.
        this._scanPaneRows(doc);

        // Anchor the observer to documentElement, not #zotero-view-item:
        // Zotero's renderer can replace the right-pane container itself when
        // the selected item changes, which detaches an observer attached to
        // the inner element. The whole-document observer is broader but the
        // callback exits early unless a mutation involves annotation-row,
        // so the runtime cost stays small.
        const scheduleScan = () => {
            if (P.scanTimer) win.clearTimeout(P.scanTimer);
            // Short debounce: just enough to coalesce a burst of
            // mutations into one scan, while leaving as little
            // visible plain-text "flash" window as possible between
            // Zotero rendering the related-box label and Weavero
            // rewriting it as a clickable URL/markdown span. The
            // previous 80ms value was long enough that switching
            // between item notes flickered noticeably; 8ms lands in
            // the next animation frame.
            P.scanTimer = win.setTimeout(() => {
                P.scanTimer = null;
                try { this._scanPaneRows(doc); }
                catch(e) { Zotero.debug("[Weavero] pane scan error: " + e); }
            }, 8);
        };

        P.mo = new win.MutationObserver(mutations => {
            const rowsToRender = new Set();
            let needsScan = false;
            let needsRelatedScan = false;
            let needsNotesScan = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const tag = node.tagName?.toLowerCase();
                    if (tag === "annotation-row") {
                        rowsToRender.add(node);
                        needsScan = true;
                        continue;
                    }
                    if (node.querySelector) {
                        const found = node.querySelector("annotation-row");
                        if (found) {
                            rowsToRender.add(found);
                            needsScan = true;
                        }
                    }
                    // Related-box rows. Three shapes worth catching:
                    //   1. The whole <related-box> mounting fresh.
                    //   2. The body div's contents being repopulated.
                    //   3. A single .row being appended.
                    if (tag === "related-box"
                        || (node.classList
                            && (node.classList.contains("row")
                                || node.classList.contains("body")))
                        || (node.querySelector
                            && (node.querySelector("related-box")
                                || node.querySelector(
                                    "related-box .body .row")))) {
                        needsRelatedScan = true;
                    }
                    // Note surfaces: items-tree <note-row>, right-pane
                    // <notes-box>, right-pane <note-editor>. Catch the
                    // element itself or any descendant, since all three
                    // can mount nested inside a re-rendered container.
                    if (tag === "note-row" || tag === "notes-box" || tag === "note-editor"
                        || (node.querySelector
                            && (node.querySelector("note-row")
                                || node.querySelector("notes-box")
                                || node.querySelector("note-editor")))) {
                        needsNotesScan = true;
                    }
                }
                // Comment text edits inside an existing row also count.
                const tgt = m.target;
                if (tgt && tgt.closest) {
                    const annotRow = tgt.closest("annotation-row");
                    if (annotRow) {
                        rowsToRender.add(annotRow);
                        needsScan = true;
                    }
                    // Label text changes inside related-box rows (e.g.
                    // a related annotation's display title was re-rendered).
                    if (tgt.closest("related-box")) {
                        needsRelatedScan = true;
                    }
                    // Note text edits / re-renders inside any of the
                    // note surfaces.
                    if (tgt.closest("note-row")
                        || tgt.closest("notes-box")
                        || tgt.closest("note-editor")) {
                        needsNotesScan = true;
                    }
                }
            }
            // Synchronous per-row re-render — runs in the observer microtask,
            // before the browser paints, so the user never sees the raw
            // markdown text flash when navigating between annotations. The
            // cache check inside _renderPaneCommentInline prevents re-entry
            // on the mutations our own writes generate.
            for (const row of rowsToRender) {
                try { this._injectPaneRowIcon(row); }
                catch(e) { Zotero.debug("[Weavero] sync pane re-render: " + e); }
            }
            if (needsRelatedScan) {
                try { this._processRelatedBoxes(doc); }
                catch(e) { Zotero.debug(
                    "[Weavero] related-box scan err: " + e); }
            }
            // Either the pane toggle or the editor toggle can drive this scan;
            // each _process* self-gates on its own pref.
            if (needsNotesScan && (this._getEnableNotes() || this._getEnableNotesPane())) {
                try { this._processNoteRows(doc); }
                catch(e) { Zotero.debug("[Weavero] note-rows scan err: " + e); }
                try { this._processNotesBoxes(doc); }
                catch(e) { Zotero.debug("[Weavero] notes-box scan err: " + e); }
                try { this._processNoteEditors(doc); }
                catch(e) { Zotero.debug("[Weavero] note-editors scan err: " + e); }
            }
            // Debounced full scan as a safety net for rows we missed (e.g.
            // sibling rows added in the same batch but not in mutation targets).
            if (needsScan) scheduleScan();
        });
        P.mo.observe(doc.documentElement,
            { childList: true, subtree: true, characterData: true });
        Zotero.debug("[Weavero] pane observer attached to documentElement");

        // Focus toggle for right-pane comment editing. When a .content
        // inside a .comment.wv-comment-preview gets focus, swap to raw
        // editable text. On focusout, swap back to the rendered preview.
        // Also handles shadow-DOM cases since focusin bubbles through
        // shadow boundaries when composed:true (the default).
        {
            P.focusIn = (e) => {
                try {
                    const target = e && e.composedPath ? e.composedPath()[0] : e && e.target;
                    if (!target || !target.classList) return;
                    if (!target.classList.contains("content")) return;
                    const cmt = target.closest && target.closest(".comment");
                    if (cmt && cmt.classList.contains("wv-comment-preview")) {
                        cmt.classList.add("wv-editing");
                    }
                } catch(err) {}
            };
            P.focusOut = (e) => {
                try {
                    const target = e && e.composedPath ? e.composedPath()[0] : e && e.target;
                    if (!target || !target.classList) return;
                    if (!target.classList.contains("content")) return;
                    const cmt = target.closest && target.closest(".comment");
                    if (cmt) cmt.classList.remove("wv-editing");
                    // Re-render the preview after edit.
                    if (cmt) {
                        try { this._renderPreviewPanel(cmt); }
                        catch(err) {}
                    }
                } catch(err) {}
            };
            doc.addEventListener("focusin", P.focusIn, true);
            doc.addEventListener("focusout", P.focusOut, true);
        }
    }

    /** One window's observer + focus handlers, or every main window's. */
    _teardownPaneObserver(win?: any) {
        if (!win) {
            for (const w of (Zotero.getMainWindows() || [])) {
                try { this._teardownPaneObserver(w); } catch (e) {}
            }
            return;
        }
        const P: any = win._wvPaneObs;
        if (!P) return;
        try { if (P.mo) P.mo.disconnect(); } catch (e) {}
        try { if (P.scanTimer) win.clearTimeout(P.scanTimer); } catch (e) {}
        try {
            const doc = win.document;
            if (doc) {
                if (P.focusIn) doc.removeEventListener("focusin", P.focusIn, true);
                if (P.focusOut) doc.removeEventListener("focusout", P.focusOut, true);
            }
        } catch (e) {}
        delete win._wvPaneObs;
    }

    // ---- Compact title bar (main window) -----------------------------------
    /** Hide the menubar row (#titlebar) and move the window controls into the
     *  tab strip — Firefox-style "tabs in titlebar." The menubar collapses
     *  to 0 via CSS keyed off `[autohide][inactive]`; an Alt-up keystroke
     *  toggles `inactive` so the menubar can still be summoned.
     *
     *  Per-window state is stashed on `win._wvCompactTitleBar` so revert can
     *  restore the original DOM structure cleanly. Idempotent — applying
     *  twice is a no-op. Gated by `_getCompactTitleBarMain()` upstream.
     *
     *  Mac is excluded — macOS draws traffic-light controls itself, and
     *  `.titlebar-buttonbox` is empty there. Same exclusion the windingwind
     *  community script uses. */
    _applyCompactTitleBar(win) {
        try {
            if (!win || !win.document) return;
            if ((Zotero as any).isMac) return;
            const doc = win.document;
            if (win._wvCompactTitleBar) return;   // already applied
            const titlebar = doc.getElementById("titlebar");
            const zoteroTitleBar = doc.getElementById("zotero-title-bar");
            const menubar = doc.getElementById("toolbar-menubar");
            if (!titlebar || !zoteroTitleBar || !menubar) return;
            const buttonbox = titlebar.querySelector(".titlebar-buttonbox");
            const iconContainer = titlebar.querySelector(".titlebar-icon-container");
            if (!buttonbox) return;

            // Stash for revert.
            const stash: any = {
                buttonboxOrigParent: buttonbox.parentNode,
                buttonboxOrigNext: buttonbox.nextSibling,
            };

            // 1) Move window-controls buttonbox to right end of the tab strip.
            zoteroTitleBar.appendChild(buttonbox);

            // 1b) Firefox-style titlebar spacer — a fixed 40 px draggable
            //     strip placed IMMEDIATELY left of the window controls.
            //     The buttonbox is absolute-positioned, so this in-flow
            //     spacer ends up flush against the buttonbox's left edge
            //     (the buttonbox sits over the 138 px padding-right zone).
            //     Drag-region opt-in is in the shared stylesheet.
            // Drop any pre-tabs spacer left over from an earlier build that
            // shipped one — the post-tabs slot is enough to grab the window.
            try { for (const old of zoteroTitleBar.querySelectorAll(".wv-titlebar-spacer[type='pre-tabs']")) old.remove(); } catch (_) {}
            let postSpacer = zoteroTitleBar.querySelector(".wv-titlebar-spacer[type='post-tabs']");
            if (!postSpacer) {
                postSpacer = wvHtmlEl(doc, "div");
                postSpacer.setAttribute("class", "wv-titlebar-spacer");
                postSpacer.setAttribute("type", "post-tabs");
                // Place just before the buttonbox; the buttonbox was appended
                // last in step 1 so it's at the end of zoteroTitleBar.
                zoteroTitleBar.insertBefore(postSpacer, buttonbox);
            }
            stash.postSpacer = postSpacer;
            // The anchor/colour window indicator renders at its library-tab
            // FALLBACK spot when it runs before this spacer exists (its CSS
            // is derived from a hasSpacer probe at update time). Re-derive
            // it now that the preferred top-right slot is available (user
            // report 2026-07-15: mark stuck beside the library tab).
            try { (this as any)._wvUpdateMainWindowIndicator(win); } catch (e) {}

            // 2) Leave the icon container alone — it lives inside `#titlebar`,
            //    so it collapses naturally when our :has() CSS rule hides
            //    the row, and reappears together with the menubar when
            //    Alt is pressed. Matches Firefox-on-Windows where the
            //    app icon is part of the title-bar row.

            // 3) Mark menubar as hidden via a custom data attribute we own.
            //    Earlier versions used Mozilla's `autohide="true"` +
            //    `inactive="true"` pair, but that activates Mozilla's
            //    built-in autohide manager — which re-collapses the
            //    menubar moments after our Alt-down reveals it (the
            //    user-reported "underlines flicker then disappear"
            //    symptom). A custom attribute keeps the collapse state
            //    entirely in our hands.
            menubar.setAttribute("wv-compact-hidden", "true");

            // 4) Inject the CSS rule that collapses the menubar via our
            //    custom attribute, AND its parent #titlebar.
            this._ensureCompactTitleBarStyles(doc);

            // 5) Alt-up toggles the menubar -- lib/menubar.ts, Firefox's
            //    MenuBarListener model, the one machine for the main, reader
            //    and note windows. The main window's extra rule: while the
            //    Weavero filter popup (or one of its child popups, or a
            //    reader's filter popup hosted in this window) is showing, Alt
            //    is part of an Alt-click "exclude" gesture, and an Alt tap
            //    also hides any open popup as a Mozilla side effect -- the
            //    panel's own Alt-swallowing capture listeners run AFTER this
            //    window-level capture listener (the window is the outermost
            //    node), so the popup state is checked here, not there.
            //    Every handler bails on a closed window: the first crash this
            //    code caused was an Alt+F -> Close flow whose deferred timer
            //    touched a dead menubar ("can't access dead object").
            const isDead = () => {
                try { return !win || win.closed; } catch (e) { return true; }
            };
            const isCollapsed = () => menubar.getAttribute("wv-compact-hidden") === "true";
            const isFilterPopupOpen = () => {
                try {
                    if (isDead()) return false;
                    const doc = win.document;
                    if (!doc) return false;
                    const panel: any = doc.getElementById("wv-filter-popup");
                    if (panel && (panel.state === "open" || panel.state === "showing")) {
                        return true;
                    }
                    // Section-picker / chip-edit sub-popups built by
                    // _openFilterPanelForGroup live elsewhere in the
                    // doc but share the `wv-filter-` class prefix.
                    const open = doc.querySelector(
                        "panel[id^='wv-filter-'], menupopup[id^='wv-filter-']"
                    );
                    if (open && (open.state === "open" || open.state === "showing")) {
                        return true;
                    }
                    // READER filter popup — it lives in a reader iframe (not
                    // the chrome window's doc), has id `wv-reader-filter-popup`
                    // (see RP_FILTER_POPUP_ID in reader-panels.ts), and is an
                    // HTML <div> (no XUL .state). Walk open readers whose
                    // chrome host IS this window and check.
                    try {
                        const readers: any[] = (Zotero as any).Reader && (Zotero as any).Reader._readers || [];
                        for (const r of readers) {
                            const hostWin = r && r._iframe && r._iframe.ownerDocument && r._iframe.ownerDocument.defaultView;
                            if (hostWin !== win) continue;
                            const idoc = r._iframe.contentDocument;
                            if (idoc && idoc.getElementById("wv-reader-filter-popup")) return true;
                        }
                    } catch (er) {}
                } catch (er) {}
                return false;
            };
            const alt = wvAltReveal({ win, menubar, tag: "menubar", suppress: isFilterPopupOpen });
            stash.altOff = alt.off;
            stash.menubar = menubar;

            // Keep the window controls at the absolute top-right of the window
            // (convention: controls never sit below another strip). The revealed
            // menubar becomes the top row ABOVE the tab strip, so move the
            // buttonbox up into its original title-bar slot while the menubar is
            // shown, and back down to the tab strip when it collapses — the
            // controls always head whichever row is topmost (Firefox's mechanic).
            const positionButtonbox = () => {
                try {
                    if (isDead()) return;
                    if (isCollapsed()) {
                        if (buttonbox.parentNode !== zoteroTitleBar) zoteroTitleBar.appendChild(buttonbox);
                        zoteroTitleBar.style.paddingInlineEnd = "";   // buttonbox reserves its own width
                        zoteroTitleBar.style.paddingInlineStart = "";
                    } else {
                        // Measure the buttonbox (still in the tab strip) and reserve
                        // that width on the tab strip so moving the controls up to
                        // the menu row doesn't shift the tabs.
                        const w = Math.round(buttonbox.getBoundingClientRect().width);
                        const p = stash.buttonboxOrigParent;
                        if (p && buttonbox.parentNode !== p) {
                            const nxt = stash.buttonboxOrigNext;
                            if (nxt && nxt.parentNode === p) p.insertBefore(buttonbox, nxt);
                            else p.appendChild(buttonbox);
                        }
                        if (w > 0) {
                            // Buttons on the left (GTK reversed placement): they
                            // vacate the strip's START, so reserve there.
                            let rev = false;
                            try { rev = win.matchMedia("(-moz-gtk-csd-reversed-placement)").matches; } catch (e) {}
                            if (rev) zoteroTitleBar.style.paddingInlineStart = w + "px";
                            else zoteroTitleBar.style.paddingInlineEnd = w + "px";
                        }
                    }
                } catch (er) {}
            };
            try {
                const mo = new win.MutationObserver(positionButtonbox);
                mo.observe(menubar, { attributes: true, attributeFilter: ["wv-compact-hidden"] });
                stash.buttonboxObserver = mo;
            } catch (er) {}
            stash.captionReserveObserver = (this as any)._wvTrackCaptionReserve(win, zoteroTitleBar, buttonbox);

            // Insert the hamburger button just left of the window controls.
            // Inserts before postSpacer (which sits before the buttonbox), so
            // the hamburger ends up flush against the spacer's left edge.
            try {
                const stripEl = zoteroTitleBar;
                const beforeEl = postSpacer || buttonbox;
                (this as any)._wvEnsureHamburger?.(win, stripEl, beforeEl);
            } catch (e) {}

            win._wvCompactTitleBar = stash;
        } catch (e) {
            Zotero.debug("[Weavero] _applyCompactTitleBar err: " + e);
            // Auto-revert any partial mutations from this apply attempt so
            // the window is never left half-mutated, and skip this WINDOW
            // for the session. The user's master pref is NOT touched: one
            // transient failure in one window used to switch the setting
            // off permanently for every window type, and the observer then
            // migrated reader-window tabs into main (survey 2026-10-06).
            try { this._revertCompactTitleBar(win); } catch (er) {}
            try { win._wvCompactTitleBarFailed = true; } catch (er) {}
        }
    }

    /** Undo `_applyCompactTitleBar`. Idempotent and tolerant of partial
     *  state: cleans up CSS, listeners, buttonbox position, menubar
     *  attributes, and icon-container display whether or not a complete
     *  stash exists. Each step is independently try/catch'd so a single
     *  failed step doesn't abort the rest of the cleanup. */
    _revertCompactTitleBar(win) {
        try {
            if (!win || !win.document) return;
            try { if (win.closed) return; } catch (e) { return; }
            const doc = win.document;
            const titlebar = doc.getElementById("titlebar");
            const menubar = doc.getElementById("toolbar-menubar");
            const iconContainer = titlebar ? titlebar.querySelector(".titlebar-icon-container") : null;
            const buttonbox = doc.querySelector(".titlebar-buttonbox");
            const stash = win._wvCompactTitleBar || {};

            // 0. Stop the buttonbox-position observer before touching the
            //    menubar attribute, so it doesn't fire mid-revert; and clear the
            //    tab-strip width reservation it may have set.
            try { if (stash.buttonboxObserver) stash.buttonboxObserver.disconnect(); } catch (e) {}
            try { if (stash.captionReserveObserver) stash.captionReserveObserver.disconnect(); } catch (e) {}
            try {
                const ztb = doc.getElementById("zotero-title-bar");
                if (ztb) { ztb.style.paddingInlineEnd = ""; ztb.style.paddingInlineStart = ""; ztb.style.removeProperty("--wv-ctl-reserve"); }
            } catch (e) {}
            // Remove the hamburger button + popup.
            try { (this as any)._wvRemoveHamburger?.(win); } catch (e) {}

            // 1. Move buttonbox back. If we have an original anchor, use
            //    it; otherwise force it back into #titlebar (the canonical
            //    home) so manual reverts after a stash loss still recover.
            try {
                if (buttonbox) {
                    const anchorParent = stash.buttonboxOrigParent || titlebar;
                    const anchorNext = stash.buttonboxOrigNext;
                    if (anchorParent) {
                        if (anchorNext && anchorNext.parentNode === anchorParent) {
                            anchorParent.insertBefore(buttonbox, anchorNext);
                        } else {
                            anchorParent.appendChild(buttonbox);
                        }
                    }
                }
            } catch (e) {}

            // 1b. Remove our titlebar spacers (pre-tabs / post-tabs). Use the
            //     stashed refs when present, else fall back to a query so
            //     spacers from a partial earlier apply still get cleaned up.
            try {
                const spacers: any[] = [];
                if (stash.preSpacer) spacers.push(stash.preSpacer);
                if (stash.postSpacer) spacers.push(stash.postSpacer);
                const ztb = doc.getElementById("zotero-title-bar");
                if (ztb) for (const s of ztb.querySelectorAll(".wv-titlebar-spacer")) spacers.push(s);
                for (const s of spacers) { try { s.remove(); } catch (_) {} }
            } catch (e) {}

            // 2. Restore icon container display. Newer code (post-v0.8.8-
            //    dev.20) doesn't touch the icon container — but older
            //    stashes may have an iconDisplay value, so we still
            //    honour it for users upgrading mid-session.
            try { if (iconContainer && "iconDisplay" in stash) iconContainer.style.display = stash.iconDisplay || ""; } catch (e) {}

            // 3. Restore menubar: just strip our custom hide-attribute.
            //    Earlier builds also poked Mozilla's `autohide` /
            //    `inactive` attrs, but we no longer set them (that was
            //    causing Mozilla's autohide system to fight us). Removing
            //    them unconditionally is still safe — they default to
            //    absent on the stock Zotero menubar — and keeps revert
            //    robust against partial state from older versions.
            try {
                if (menubar) {
                    menubar.removeAttribute("wv-compact-hidden");
                    menubar.removeAttribute("autohide");
                    menubar.removeAttribute("inactive");
                }
            } catch (e) {}

            // 4. Unhook the Alt-reveal machine (lib/menubar.ts). The per-handler
            //    removals below serve a stash left by a build before 2026-10-21.
            try { stash.altOff?.(); } catch (e) {}
            try { if (stash.keyDown) win.removeEventListener("keydown", stash.keyDown, true); } catch (e) {}
            try { if (stash.keyUp) win.removeEventListener("keyup", stash.keyUp, true); } catch (e) {}
            try { if (stash.escapeKey) win.removeEventListener("keydown", stash.escapeKey, true); } catch (e) {}
            try { if (stash.docMouseDown) win.removeEventListener("mousedown", stash.docMouseDown, true); } catch (e) {}
            try { if (stash.menuCommand && menubar) menubar.removeEventListener("command", stash.menuCommand); } catch (e) {}
            try { if (stash.popupHidden && menubar) menubar.removeEventListener("popuphidden", stash.popupHidden, true); } catch (e) {}   // legacy: older stashes set this

            // 5. Remove injected CSS.
            try { doc.getElementById("wv-compact-titlebar-styles")?.remove(); } catch (e) {}

            // 6. Clear the stash so future apply() runs fresh.
            try { delete win._wvCompactTitleBar; } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _revertCompactTitleBar err: " + e);
        }
    }

    /** Keep `--wv-ctl-reserve` on `row` equal to the caption-button box's
     *  footprint from the right edge (its width + right margin), so the drag
     *  spacer before it ends exactly where the buttons begin. Measured, not
     *  assumed: 138px on Windows (3 x 46, no margin), 100px with GTK's three
     *  buttons + Zotero's 10px margin, less when the desktop hides some.
     *  While the box sits elsewhere (Alt menu row shown) the row keeps the
     *  last value; positionButtonbox's inline padding governs then. Returns
     *  the observer for teardown. Guard: test/caption-reserve.spec.js. */
    _wvTrackCaptionReserve(win: any, row: any, box: any): any {
        try {
            if (!win || !row || !box) return null;
            const apply = () => {
                try {
                    if (box.parentNode !== row) return;
                    const w = box.getBoundingClientRect().width;
                    if (!(w > 0)) return;
                    // Width + the margin to the window edge. Only one side has
                    // a margin (right normally, left with the buttons on the
                    // left), so the sum is that one.
                    const cs = win.getComputedStyle(box);
                    const m = (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
                    const v = Math.round(w + m) + "px";
                    if (row.style.getPropertyValue("--wv-ctl-reserve") !== v) row.style.setProperty("--wv-ctl-reserve", v);
                } catch (e) {}
            };
            apply();
            const RO = win.ResizeObserver;
            if (!RO) return null;
            const ro = new RO(() => apply());
            ro.observe(box);
            return ro;
        } catch (e) { return null; }
    }

    /** Desktop button side changed while windows are open (GNOME
     *  button-layout): Gecko notifies `look-and-feel-changed`, but some open
     *  windows never re-evaluate their media rules -- measured 2026-10-01
     *  (Zotero 10.0.5-beta.2, Wayland): the Plugins Manager kept the old side
     *  for Weavero's rules AND for Zotero's own skin rule and the GTK button
     *  order, its MediaQueryList fired no `change`, and neither focus, a
     *  forced restyle nor a 1px resize helped; which window was missed varied
     *  (once the reader window too). A full-zoom round trip in the same task
     *  makes the window re-evaluate everything, zoom back at exactly 1.
     *  Only windows whose probe (`--wv-csd-rev` on the root, set by Weavero's
     *  title-bar stylesheets) disagrees with matchMedia are nudged, so
     *  windows that did update -- and every look change that does not move
     *  the buttons (light/dark theme) -- are left alone. Checked twice: the
     *  main window applied the change ~1s after the notification.
     *  Long-lived observer on a global service: stamped with _wvWireTag and
     *  re-registered on mismatch (see the notifier rule in src-ts.md).
     *  Guard: test/csd-refresh.spec.js. */
    _wvWireCsdRefresh(this: any) {
        try {
            const g: any = Zotero as any;
            const tag = this._wvWireTag();
            if (g._wvCsdRefreshObs && g._wvCsdRefreshObs._wvTag === tag) return;
            this._wvUnwireCsdRefresh();
            const obs: any = {
                _wvTag: tag,
                observe() {
                    try {
                        const lp: any = g.Weavero && g.Weavero.plugin;
                        if (!lp || lp._wvWireTag() !== obs._wvTag) return;
                        const later = (fn: () => void, ms: number) => {
                            try { wvTimeout(fn, ms); } catch (e) {}
                        };
                        later(() => { try { lp._wvRefreshStaleCsdWindows(); } catch (e) {} }, 400);
                        later(() => { try { lp._wvRefreshStaleCsdWindows(); } catch (e) {} }, 1500);
                    } catch (e) {}
                },
            };
            Services.obs.addObserver(obs, "look-and-feel-changed");
            g._wvCsdRefreshObs = obs;
        } catch (e) { Zotero.debug("[Weavero] _wvWireCsdRefresh err: " + e); }
    }

    _wvUnwireCsdRefresh(this: any) {
        try {
            const g: any = Zotero as any;
            if (g._wvCsdRefreshObs) {
                try { Services.obs.removeObserver(g._wvCsdRefreshObs, "look-and-feel-changed"); } catch (e) {}
                delete g._wvCsdRefreshObs;
            }
        } catch (e) {}
    }

    /** Nudge every open window whose title-bar rules are evaluated for the
     *  other button side. Returns the number nudged. */
    _wvRefreshStaleCsdWindows(this: any): number {
        let n = 0;
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try {
                    if (!w || w.closed || !w.document || !w.document.documentElement) continue;
                    const root = w.document.documentElement;
                    const probe = String(w.getComputedStyle(root).getPropertyValue("--wv-csd-rev")).trim();
                    if (probe !== "0" && probe !== "1") continue;   // no Weavero title bar here
                    const want = w.matchMedia("(-moz-gtk-csd-reversed-placement)").matches ? "1" : "0";
                    if (probe === want) continue;
                    const bc = w.browsingContext;
                    if (!bc) continue;
                    const z = bc.fullZoom;
                    bc.fullZoom = z * 1.001;
                    root.getBoundingClientRect();   // flush with the changed zoom
                    bc.fullZoom = z;
                    n++;
                    Zotero.debug("[Weavero] re-evaluated window chrome after a button-side change: " + (wvWinType(w) || w.location.href));
                }
                catch (e) {}
            }
        }
        catch (e) {}
        return n;
    }

    /** One-time CSS for the compact-title-bar mode. Collapses
     *  `#toolbar-menubar[autohide][inactive]` and the parent `#titlebar`
     *  to zero height; positions the moved buttonbox flush right in the
     *  tab strip. */
    _ensureCompactTitleBarStyles(doc) {
        try {
            wvRemoveStyle(doc, "wv-compact-titlebar-styles");   // always replaced (src-ts.md sheet replace)
            const style = wvHtmlEl(doc, "style");
            style.id = "wv-compact-titlebar-styles";
            style.textContent = [
                /* Collapse via height-only — NOT visibility:collapse — so
                   the menubar stays in the focusable element tree.
                   Mozilla's Alt-handler synchronously tries to focus the
                   first menu; if the menubar is visibility:collapse'd,
                   that focus fails and Mozilla only shows the brief
                   "Alt-held" accesskey hint instead of full activation.
                   height:0 + overflow:hidden visually collapses while
                   keeping menus focusable. */
                "#toolbar-menubar[wv-compact-hidden='true'] {",
                "  height: 0 !important; min-height: 0 !important;",
                "  overflow: hidden !important;",
                "}",
                "#titlebar:has(#toolbar-menubar[wv-compact-hidden='true']) {",
                "  height: 0 !important; min-height: 0 !important;",
                "  overflow: hidden !important;",
                /* Kill #titlebar's 1px border-bottom too. Its content collapses
                   to 0, but that border (a light rgba(255,255,255,.18) divider)
                   keeps rendering as a stray 1px highlight line floating at the
                   very top of the window above the dark tab bar — the "top 1px
                   bar" that should vanish WITH the hidden title bar, not linger. */
                "  border-width: 0 !important;",
                "}",
                /* When the menubar IS summoned (Alt), give #titlebar the same
                   --material-panedivider bottom line the tab strip carries —
                   a clearly visible divider, uniform with the reader-window
                   menubar. The XUL default is a near-invisible light hairline
                   (rgba(255,255,255,.18)), which read as "missing". */
                "#titlebar:has(#toolbar-menubar:not([wv-compact-hidden='true'])) {",
                "  border-bottom: var(--material-panedivider) !important;",
                "}",
                /* Buttonbox: absolute-positioned over the right edge of the
                   tab strip. Flex layout fights us (tab-bar-container is
                   sized to its content width and won't shrink even with
                   min-width:0 in this XUL context), so step out of the flex
                   flow entirely. */
                /* Make the tab strip's empty / reserved area window-draggable
                   too (incl. the space the controls vacate when the Alt menu is
                   shown). Children keep their own dragging: #tab-bar-container
                   drags with tabs opting out, #zotero-tabs-toolbar + buttonbox
                   stay no-drag, so only the empty area becomes a drag handle. */
                "#zotero-title-bar { position: relative; -moz-window-dragging: drag; }",
                "#zotero-title-bar > .titlebar-buttonbox {",
                "  position: absolute;",
                "  top: 0; right: 0; height: 100%;",
                "  z-index: 5;",
                "  -moz-window-dragging: no-drag;",
                "}",
                /* Reserve right-edge space inside the tab strip so tabs and
                   the zotero-tabs-toolbar don't slide under the buttonbox.
                   The width is MEASURED (_wvTrackCaptionReserve): 138px was
                   the Windows box (46 x 3), and on Linux the GTK box is 90px +
                   Zotero's 10px margins, which left a 38px empty band between
                   the 40px drag spacer and the buttons (2026-10-01). 138px
                   stays as the fallback until the first measurement. */
                "#zotero-title-bar:has(> .titlebar-buttonbox) {",
                "  padding-right: var(--wv-ctl-reserve, 138px);",
                "}",
                /* Linux: the spacer meets the buttons, as on Windows and in
                   Firefox on Linux (browser-shared.css: the 40px .titlebar-spacer
                   is followed directly by the in-flow button box). Zotero's
                   Linux skin gives .titlebar-buttonbox `margin: 0 10px`; keep
                   the right-hand 10px, drop the left. */
                "@media (-moz-platform: linux) {",
                "  #zotero-title-bar > .titlebar-buttonbox { margin-inline-start: 0; }",
                "}",
                /* Desktops with the window buttons on the LEFT (GNOME
                   button-layout "close,minimize,maximize:"; Gecko exposes it as
                   -moz-gtk-csd-reversed-placement, which Zotero's own Linux skin
                   honours with `.titlebar-buttonbox { order: -1 }`). Mirror the
                   group: buttons at the left edge, the 40px drag spacer (and the
                   anchor drawn in it) right after them, the reservation on the
                   left. The hamburger is the application menu, not a window
                   control: it stays at the right end, as Firefox's menu button
                   does (2026-10-01). */
                // Staleness probe for _wvWireCsdRefresh: the root says which
                // side these rules were last evaluated for.
                ":root { --wv-csd-rev: 0; }",
                "@media (-moz-gtk-csd-reversed-placement) { :root { --wv-csd-rev: 1; } }",
                "@media (-moz-gtk-csd-reversed-placement) {",
                "  #zotero-title-bar > .titlebar-buttonbox { right: auto; left: 0; margin-inline: 10px 0; }",
                "  #zotero-title-bar:has(> .titlebar-buttonbox) {",
                "    padding-right: 10px; padding-left: var(--wv-ctl-reserve, 138px); }",
                "  #zotero-title-bar > .wv-titlebar-spacer { order: -1; }",
                "}",
                /* The revealed menu-bar row is window-draggable like a real title
                   bar (click-and-hold the empty area to move the window); the
                   menus and the window controls opt out so they stay clickable —
                   the buttonbox is forced no-drag regardless of which row it's in. */
                "#toolbar-menubar { -moz-window-dragging: drag; }",
                "#toolbar-menubar menu, #toolbar-menubar menuitem { -moz-window-dragging: no-drag; }",
                ".titlebar-buttonbox { -moz-window-dragging: no-drag; }",
                /* Firefox-style titlebar spacers — fixed 40 px draggable strips
                   that reserve grabbable area before the tabs (pre-tabs) and
                   between the tabs and the tabs-toolbar (post-tabs). Using
                   flex-basis ensures the spacer isn't consumed by the
                   tab-bar-container's flex-grow when tabs fill the strip. */
                "#zotero-title-bar > .wv-titlebar-spacer {",
                "  flex: 0 0 40px; width: 40px; min-width: 40px;",
                "  -moz-window-dragging: drag;",
                "}",
                /* Hamburger button — Firefox-style application menu trigger
                   that sits just left of the window controls in compact
                   title bar mode. SVG drawn as three horizontal lines using
                   currentColor; transparent background with subtle hover. */
                "#zotero-title-bar > .wv-hamburger-btn {",
                "  display: flex; align-items: center; justify-content: center;",
                // 28×28 + border-radius 5px + align-self center: match the
                // sync-button hover-box exactly (sync is `#zotero-tb-sync`,
                // a XUL <toolbarbutton> 28×28 with 5px corners).
                "  width: 28px; height: 28px; align-self: center;",
                "  padding: 0; margin: 0;",
                "  border: none; appearance: none; -moz-appearance: none;",
                "  border-radius: 5px;",
                "  background: transparent;",
                "  color: currentColor; opacity: 0.65;",
                "  cursor: default;",
                "  -moz-window-dragging: no-drag;",
                "  flex: 0 0 28px;",
                "}",
                "#zotero-title-bar > .wv-hamburger-btn svg {",
                "  width: 16px; height: 16px;",
                // Filled rects (Firefox app-menu style) — no stroke.
                // `fill: currentColor` inherits the .wv-hamburger-btn
                // colour (0.65 alpha black light / 0.70 alpha white dark).
                "  fill: currentColor;",
                "}",
                "#zotero-title-bar > .wv-hamburger-btn:hover { background-color: rgba(127,127,127,0.18); opacity: 1; }",
                "#zotero-title-bar > .wv-hamburger-btn:active { background-color: rgba(127,127,127,0.30); }",
                /* Widen the hamburger popup so submenu labels + chevron
                   don't run together. 147px (~2/3 of the original 220px
                   target) fits the top-level menu names (File / Edit /
                   View / Tools / Help) with breathing room for the
                   chevron column without taking over the title bar. */
                "#wv-hamburger-popup { min-width: 147px; }",
                "#wv-hamburger-popup > menu,",
                "#wv-hamburger-popup > menuitem { padding-inline: 12px; }",
            ].join("\n");
            (doc.documentElement || doc).appendChild(style);
        } catch (e) {
            Zotero.debug("[Weavero] _ensureCompactTitleBarStyles err: " + e);
        }
    }

    // ---- Plugins Manager search box -------------------------------------------
    // Zotero's Plugins Manager (Tools → Plugins) is Firefox's about:addons
    // page inside a basicViewer window, with no way to filter a long plugin
    // list. Inject a search box above the cards; Ctrl+F focuses it.

    /** Relative "updated …" wording for a plugin card. ≥14 days switches to
     *  the absolute date inline — "82 days ago" reads worse than the date.
     *  Guard: test/plugins-meta.spec.js. */
    _wvPMRelTime(this: any, when: number): { rel: string, abs: string } {
        const d = new Date(when);
        const abs = d.toLocaleString();
        const age = Date.now() - when;
        const MIN = 60000, H = 3600000, DAY = 86400000;
        let rel;
        if (!(when > 0)) { rel = "unknown"; }
        else if (age < MIN) rel = "just now";
        else if (age < H) rel = Math.floor(age / MIN) + " min ago";
        else if (age < DAY) { const h = Math.floor(age / H); rel = h + (h === 1 ? " hour ago" : " hours ago"); }
        else if (age < 14 * DAY) { const dd = Math.floor(age / DAY); rel = dd + (dd === 1 ? " day ago" : " days ago"); }
        else rel = d.toLocaleDateString();
        return { rel, abs };
    }

    /** GitHub owner behind a plugin, from the URLs the addon exposes, in
     *  order of authority: homepage, update URL, install source. Only
     *  github.com / raw.githubusercontent.com count — gitee, S3, vanity
     *  domains and file: installs give nothing. Surveyed 2026-09-09 over 28
     *  installed plugins: 9 declare no author at all, and 8 of the other 19
     *  declare one that differs from the owner (a real name behind a handle,
     *  an org, a spelling variant), so the owner is extra information, not a
     *  substitute. Guard: test/plugins-meta.spec.js. */
    _wvPMGitHubOwner(this: any, addon: any): string {
        try {
            const urls = [addon.homepageURL, addon.updateURL, addon.sourceURI && addon.sourceURI.spec];
            for (const u of urls) {
                const m = /^https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\/([^\/?#]+)/i.exec(String(u || ""));
                if (m && m[1]) return m[1];
            }
        } catch (e) {}
        return "";
    }

    /** Author + version + last-update meta line under each plugin card's
     *  name (list view only — the detail view shows all three natively, in
     *  this same order: Author, Version, Last Updated). The author is
     *  `addon.creator.name`, exactly what the detail view's Author row
     *  renders (aboutaddons.js `.addon-detail-row-author`), followed by the
     *  GitHub owner in brackets when that adds information (MJT 2026-09-09):
     *  `Will Shanks [wshanks]`, `[retorquere]` for an author-less plugin,
     *  plain `windingwind` when the two coincide. Plugins with neither start
     *  at the version. Plain text on purpose — the detail view already
     *  carries the homepage link.
     *  Steady-state no-op: text/title are written only on change, so the
     *  MutationObserver that calls this cannot loop. */
    _wvPMDecorateCards(this: any, doc: any) {
        try {
            for (const card of doc.querySelectorAll("addon-list addon-card")) {
                const addon = (card as any).addon;
                if (!addon) continue;
                const nc = card.querySelector(".addon-name-container");
                if (!nc || !nc.parentElement) continue;
                let meta: any = card.querySelector(".wv-pm-meta");
                if (!meta) {
                    meta = doc.createElement("div");
                    meta.className = "wv-pm-meta";
                    meta.style.cssText = "font-size: 12px; opacity: .65; margin: 1px 0 2px;";
                    nc.insertAdjacentElement("afterend", meta);
                }
                const t = this._wvPMRelTime(addon.updateDate ? addon.updateDate.getTime
                    ? addon.updateDate.getTime() : Number(addon.updateDate) : 0);
                const author = (addon.creator && addon.creator.name ? String(addon.creator.name) : "").trim();
                const owner = this._wvPMGitHubOwner(addon);
                // Compare on the name part: "qrkks <34028312@qq.com>" IS qrkks.
                const authorName = author.replace(/\s*<[^>]*>\s*$/, "").trim();
                const who = owner && owner.toLowerCase() !== authorName.toLowerCase()
                    ? (author ? author + " " : "") + "[" + owner + "]"
                    : author;
                const txt = (who ? who + " · " : "") + "v" + (addon.version || "?") + " · updated " + t.rel;
                if (meta.textContent !== txt) meta.textContent = txt;
                if (meta.getAttribute("title") !== t.abs) meta.setAttribute("title", t.abs);
            }
        } catch (e) {}
    }

    /** basicViewer chrome for the Plugins Manager (final shape, MJT
     *  2026-09-07 after two iterations): the NATIVE title bar stays — window
     *  name + OS min/max/close (real buttons courtesy of the dialog=no
     *  reroute) — and the menubar row below it slims down to a ☰ at the top
     *  right, the same spot the main window's hamburger occupies. The
     *  hamburger is the SHARED builder (`_wvEnsureHamburger`, reader.ts):
     *  it cascades the LIVE File/Edit/View popups, so every command and
     *  shortcut keeps working. The menus collapse via height-0 (NOT
     *  display:none — the popups must stay renderable, same lesson as the
     *  compact title bar's Alt-reveal). Skipped on macOS. Linux gets the same
     *  bar through its own rules in the style block below (issue #50). */
    _wvPMSetupChrome(this: any, win: any, _doc: any) {
        try {
            if ((Zotero as any).isMac) return;
            // The drawn bar follows Hide title bar -> Plugins Manager (issue
            // #50, MJT 2026-10-05). Off: the native title bar and menu bar
            // stay. The window is still a normal one (dialog=no reroute), so
            // its maximize is still Weavero's doing and Linux still needs the
            // restore-size keeper.
            if (!this._getCompactTitleBarPluginsManager || !this._getCompactTitleBarPluginsManager()) {
                if ((Zotero as any).isLinux && !win._wvPMRestoreOnly) win._wvPMRestoreOnly = this._wvPMKeepRestoreSize(win) || null;
                return;
            }
            if (win._wvPMRestoreOnly) { try { win._wvPMRestoreOnly(); } catch (e) {} win._wvPMRestoreOnly = null; }
            if (win._wvPMChrome) {
                // Built early (before the page named the window): make sure
                // the name caught up, whatever the title observer saw.
                try {
                    const c = win._wvPMChrome, t = win.document.title;
                    if (c.titleEl && t && t !== "about:blank" && c.titleEl.textContent !== t) c.titleEl.textContent = t;
                } catch (e) {}
                return;
            }
            const cdoc = win.document;
            const toolbar = cdoc.getElementById("toolbar-menubar");
            const items = cdoc.getElementById("menubar-items");
            if (!toolbar || !items) return;
            if (!cdoc.getElementById("wv-pm-chrome-styles")) {
                const style = wvHtmlEl(cdoc, "style");
                style.id = "wv-pm-chrome-styles";
                style.textContent = [
                    "#menubar-items[wv-pm-hidden='true'] {",
                    "  height: 0 !important; min-height: 0 !important;",
                    "  overflow: hidden !important;",
                    "}",
                    // The menus' own toolbar gives up its row entirely — the
                    // drawn title bar replaces it.
                    "#toolbar-menubar { flex: 0 0 0 !important; width: 0 !important;",
                    "  overflow: hidden !important; }",
                    // The toolbox row IS the title bar: draggable everywhere
                    // except the interactive pieces; in-flow content stops
                    // 138px short of the right edge, where the shared skin
                    // absolute-positions the caption buttons.
                    ".menubar-container { padding-right: var(--wv-ctl-reserve, 138px);",
                    "  -moz-window-dragging: drag; }",
                    // Linux (issue #50, 2026-09-30): the row and the absolute
                    // caption-button box above come from scss/win/_titleBar.scss
                    // (`#titlebar, .menubar-container { flex-direction: row; ... }`,
                    // `.titlebar-buttonbox { position: absolute; inset-inline-end: 0 }`).
                    // scss/linux/_titleBar.scss has NO .menubar-container rule,
                    // keys its row on #titlebar (absent in basicViewer) and keeps
                    // the buttonbox in flow, so `customtitlebar` stripped the GTK
                    // title bar while the pieces stacked in a 128px column
                    // (measured 2026-10-01, Zotero 10.0.5). These are the main
                    // window's own compact-title-bar declarations
                    // (_ensureCompactTitleBarStyles: `#zotero-title-bar` row +
                    // `> .titlebar-buttonbox`), so both windows lay out alike.
                    // Scoped to Linux: Windows keeps riding its skin untouched.
                    // Guard: test/plugins-chrome-platform.spec.js.
                    "@media (-moz-platform: linux) {",
                    "  .menubar-container { flex-direction: row; position: relative;",
                    // content-box: the 1px divider sits BELOW the 36px row, as on
                    // #zotero-title-bar (37px in all) -- the toolbox is border-box.
                    "    box-sizing: content-box; height: var(--tab-min-height);",
                    "    background: var(--material-tabbar);",
                    "    border-bottom: var(--material-panedivider); }",
                    "  .menubar-container > .titlebar-buttonbox { position: absolute;",
                    "    top: 0; right: 0; height: 100%; z-index: 5; margin-inline-start: 0; }",
                    "  #toolbar-menubar { margin: 0 !important; min-width: 0 !important; }",
                    // The name as GTK's own title bar draws it (MJT 2026-10-14:
                    // "formatted same as without Weavero"): centred on the
                    // WINDOW, in the system UI font, bold. Measured on Ubuntu /
                    // Yaru: `font: caption` is GNOME's interface font (Sans 10 =
                    // 13.33px), and bold "Plugins Manager" in it is 112.9px wide,
                    // the native title's width (Cantarell, the WM title font, gives
                    // 99px). Absolute, so the hamburger and the buttons cannot push
                    // it off centre; the max-width keeps it clear of them on both
                    // sides, for either button placement (reserve + 40px spacer +
                    // 28px hamburger + 12px gap), ellipsized below that.
                    "  .menubar-container > .wv-pm-title { position: absolute; left: 50%; top: 50%;",
                    "    transform: translate(-50%, -50%); margin: 0;",
                    "    max-width: calc(100% - 2 * (var(--wv-ctl-reserve, 138px) + 80px));",
                    "    font: caption; font-weight: bold; }",
                    "}",
                    // Window buttons on the LEFT (GTK reversed placement): the
                    // main window's mirror -- buttons at the left edge, the 40px
                    // drag spacer right after them, the hamburger at the right
                    // end (2026-10-01); the name stays centred (Linux rule above).
                    // Staleness probe for _wvWireCsdRefresh.
                    ":root { --wv-csd-rev: 0; }",
                    "@media (-moz-gtk-csd-reversed-placement) { :root { --wv-csd-rev: 1; } }",
                    "@media (-moz-gtk-csd-reversed-placement) {",
                    "  .menubar-container > .titlebar-buttonbox { right: auto; left: 0; margin-inline: 10px 0; }",
                    "  .menubar-container { padding-right: 10px; padding-left: var(--wv-ctl-reserve, 138px); }",
                    "  .menubar-container > .wv-pm-drag-spacer { order: -1; }",
                    "}",
                    ".wv-pm-title { align-self: center; margin-inline-start: 4px;",
                    "  font-size: 12px; white-space: nowrap; overflow: hidden;",
                    "  text-overflow: ellipsis; -moz-window-dragging: drag; }",
                    ".wv-pm-drag-flex { flex: 1 1 auto; -moz-window-dragging: drag; }",
                    // The main window's 40px spacer between the hamburger and
                    // the window controls — the 'separation' (MJT 2026-09-07).
                    ".wv-pm-drag-spacer { flex: 0 0 40px; width: 40px;",
                    "  -moz-window-dragging: drag; }",
                    // EXACT declarations of the main window's hamburger
                    // (_ensureCompactTitleBarStyles) — size, colour, opacity
                    // treatment and the 16px SVG, so the two windows match
                    // pixel-for-pixel (MJT 2026-09-07 design pass).
                    ".wv-hamburger-btn {",
                    "  display: flex; align-items: center; justify-content: center;",
                    "  width: 28px; height: 28px; align-self: center;",
                    "  padding: 0; margin: 0;",
                    "  border: none; appearance: none; -moz-appearance: none;",
                    "  border-radius: 5px;",
                    "  background: transparent;",
                    "  color: currentColor; opacity: 0.65;",
                    "  cursor: default;",
                    "  -moz-window-dragging: no-drag;",
                    "  flex: 0 0 28px;",
                    "}",
                    ".wv-hamburger-btn svg {",
                    "  width: 16px; height: 16px;",
                    "  fill: currentColor;",
                    "}",
                    ".wv-hamburger-btn:hover { background-color: rgba(127,127,127,0.18); opacity: 1; }",
                    ".wv-hamburger-btn:active { background-color: rgba(127,127,127,0.30); }",
                    ".titlebar-buttonbox { -moz-window-dragging: no-drag; }",
                    "#wv-hamburger-popup { min-width: 147px; }",
                    "#wv-hamburger-popup > menu,",
                    "#wv-hamburger-popup > menuitem { padding-inline: 12px; }",
                ].join("\n");
                (cdoc.documentElement || cdoc).appendChild(style);
            }
            items.setAttribute("wv-pm-hidden", "true");
            const toolbox = toolbar.parentElement;   // .menubar-container -> the title bar row
            cdoc.documentElement.setAttribute("customtitlebar", "true");
            // Left side: Z icon (dblclick closes, native titlebar behaviour)
            // + the window's name — the native-design half the drawn bar
            // must keep (MJT 2026-09-07).
            const iconBox = cdoc.createXULElement("hbox");
            iconBox.id = "wv-pm-titlebar-icon";
            iconBox.className = "titlebar-icon-container";
            const icon: any = wvHtmlEl(cdoc, "div");
            icon.className = "titlebar-icon";
            icon.addEventListener("dblclick", (ev: any) => { if (ev.button === 0) win.close(); });
            iconBox.appendChild(icon);
            toolbox.insertBefore(iconBox, toolbar);
            const titleEl: any = wvHtmlEl(cdoc, "div", "wv-pm-title");
            // No page document yet (`_doc` null) = the early call: the window
            // is still titled with the app name, so the name starts EMPTY and
            // the observer below fills it -- "Zotero" would flash in the bar
            // for the first frames otherwise.
            titleEl.textContent = _doc ? (cdoc.title || "Plugins Manager") : "";
            toolbox.insertBefore(titleEl, toolbar);
            // The name FOLLOWS the window title: with the early setup (see
            // _wvPMOpenViewerNonDialog) the bar exists before the page has
            // named the window -- the title reads "Zotero", then
            // "about:blank", and only becomes "Plugins Manager" on
            // basicViewer.js's `pagetitlechanged` (measured 2026-10-01).
            // document.title is the root's `title` attribute in a XUL window.
            let titleObs: any = null;
            try {
                titleObs = new win.MutationObserver(() => {
                    try {
                        const t = cdoc.title;
                        if (t && t !== "about:blank" && titleEl.textContent !== t) titleEl.textContent = t;
                    } catch (e) {}
                });
                titleObs.observe(cdoc.documentElement, { attributes: true, attributeFilter: ["title"] });
            } catch (e) {}
            // Right side: [flex drag area][☰][40px drag spacer][caption buttons]
            const dragFlex: any = wvHtmlEl(cdoc, "div", "wv-pm-drag-flex", undefined, toolbox);
            const dragSpacer: any = wvHtmlEl(cdoc, "div", "wv-pm-drag-spacer", undefined, toolbox);
            const btn = this._wvEnsureHamburger
                ? this._wvEnsureHamburger(win, toolbox, dragSpacer, { mirrorOnly: true }) : null;
            // Caption buttons — main-window markup; the shared skin
            // absolute-positions the box at the top right.
            const bb = cdoc.createXULElement("hbox");
            bb.id = "wv-pm-buttonbox";
            bb.className = "titlebar-buttonbox titlebar-color";
            const mkBtn = (cls: string, fn: () => void) => {
                const b = cdoc.createXULElement("toolbarbutton");
                b.className = "titlebar-button " + cls;
                b.addEventListener("command", fn);
                bb.appendChild(b);
            };
            mkBtn("titlebar-min", () => { try { win.minimize(); } catch (e) {} });
            mkBtn("titlebar-max", () => { try { win.maximize(); } catch (e) {} });
            mkBtn("titlebar-restore", () => { try { win.restore(); } catch (e) {} });
            mkBtn("titlebar-close", () => { try { win.close(); } catch (e) {} });
            toolbox.appendChild(bb);
            // The reservation follows the real box (138px was the Windows one).
            const reserveObs = this._wvTrackCaptionReserve(win, toolbox, bb);
            // Linux only: the GTK restore problem it fixes does not exist on
            // Windows, where it would override Windows' own restore
            // rectangle (e.g. after a cross-DPI move) -- pre-release review
            // 2026-10-05, Windows kept exactly as before.
            const restoreSize = (Zotero as any).isLinux ? this._wvPMKeepRestoreSize(win) : null;
            win._wvPMChrome = { toolbar, items, btn, iconBox, titleEl, dragFlex, dragSpacer, bb, titleObs, reserveObs, restoreSize };
        } catch (e) { Zotero.debug("[Weavero] _wvPMSetupChrome err: " + e); }
    }

    /** Maximize -> restore must give back the size the window had. Zotero
     *  opens the manager as a dialog with no maximize at all; the maximize
     *  button is Weavero's (dialog=no reroute + drawn bar), so is this:
     *  on Linux (GTK, Zotero 10.0.5-beta.2, measured 2026-10-01) the window
     *  came back 52x52px larger, 1000x700 -> 1052x752 inner, every time --
     *  on leaving maximized each dimension became max(previous, declared
     *  minimum 1000x700 + the 52px CSD margin); with the minimum lowered it
     *  came back at exactly the previous size (measured).
     *  1. PREVENT: while the window is maximized its declared minimum
     *     (root min-width / min-height) is lowered, so the restore lands on
     *     the previous size in one step; the minimum is put back once the
     *     window is normal again. The first version only CORRECTED after the
     *     restore (resizeBy ~200ms later): the window visibly went
     *     1920 -> 1052 -> 1000, the flicker MJT reported (2026-10-01).
     *  2. CORRECT, as a fallback only: remember the last SETTLED normal INNER
     *     size and resize back by the difference if the restore still missed.
     *     Inner, not outer: the outer size includes the CSD decoration, which
     *     was still settling after the window opened (an outer-based restore
     *     came back 1px short once). "Settled" = unchanged for 300ms:
     *     maximizing first fires a resize to full screen while windowState
     *     still reads NORMAL (3ms before sizemodechange), and restoring fires
     *     the transitional size as NORMAL right after the mode change --
     *     recording either would undo the fix. Returns a teardown.
     *  Guard: test/plugins-chrome-platform.spec.js. */
    _wvPMKeepRestoreSize(this: any, win: any): (() => void) | null {
        try {
            if (!win || typeof win.addEventListener !== "function") return null;
            let saved: [number, number] | null = null;
            let commitT: any = null, fixT: any = null, minT: any = null, holdUntil = 0;
            const isNormal = () => { try { return win.windowState === win.STATE_NORMAL; } catch (e) { return false; } };
            const root: any = win.document && win.document.documentElement;
            let origMin: [string, string] | null = null;   // the declared minimum while it is lowered
            const lowerMin = () => {
                try {
                    if (!root || origMin) return;
                    origMin = [root.style.minWidth, root.style.minHeight];
                    root.style.minWidth = "300px";
                    root.style.minHeight = "200px";
                } catch (e) {}
            };
            const restoreMin = () => {
                try {
                    if (!root || !origMin) return;
                    root.style.minWidth = origMin[0];
                    root.style.minHeight = origMin[1];
                    origMin = null;
                } catch (e) {}
            };
            const commitSoon = () => {
                try {
                    if (commitT) win.clearTimeout(commitT);
                    if (!isNormal() || Date.now() < holdUntil) { commitT = null; return; }
                    const w = win.innerWidth, h = win.innerHeight;
                    commitT = win.setTimeout(() => {
                        commitT = null;
                        try {
                            if (isNormal() && Date.now() >= holdUntil && win.innerWidth === w && win.innerHeight === h) saved = [w, h];
                        } catch (e) {}
                    }, 300);
                } catch (e) {}
            };
            const onMode = () => {
                try {
                    if (commitT) { win.clearTimeout(commitT); commitT = null; }
                    if (fixT) { win.clearTimeout(fixT); fixT = null; }
                    if (minT) { win.clearTimeout(minT); minT = null; }
                    if (!isNormal()) {
                        // Entering maximized (or minimized): keep `saved`, and lower
                        // the minimum so the coming restore lands on it directly.
                        lowerMin();
                        return;
                    }
                    // Back to normal: the grown size arrives as NORMAL just after
                    // this event -- correct it once it has, and record nothing
                    // until the correction is through.
                    holdUntil = Date.now() + 700;
                    const target = saved;
                    fixT = win.setTimeout(() => {
                        fixT = null;
                        try {
                            if (target && isNormal()) {
                                const dw = target[0] - win.innerWidth, dh = target[1] - win.innerHeight;
                                if (dw || dh) win.resizeBy(dw, dh);
                            }
                        } catch (e) {}
                        win.setTimeout(() => { holdUntil = 0; commitSoon(); }, 450);
                    }, 200);
                    // The declared minimum comes back once the size is settled
                    // (raising it while the window is already at least that
                    // large does not move the window -- measured).
                    minT = win.setTimeout(() => { minT = null; if (isNormal()) restoreMin(); }, 700);
                } catch (e) {}
            };
            win.addEventListener("resize", commitSoon);
            win.addEventListener("sizemodechange", onMode);
            commitSoon();
            return () => {
                try { win.removeEventListener("resize", commitSoon); } catch (e) {}
                try { win.removeEventListener("sizemodechange", onMode); } catch (e) {}
                try { if (commitT) win.clearTimeout(commitT); if (fixT) win.clearTimeout(fixT); if (minT) win.clearTimeout(minT); } catch (e) {}
                restoreMin();
            };
        } catch (e) { return null; }
    }

    /** Hide title bar (or its Plugins Manager child) changed: every open
     *  manager takes or drops the drawn bar now (issue #50). On Linux (GNOME,
     *  CSD) an open manager JUMPS: Gecko cannot switch the decorations of a
     *  shown window in place -- SetCustomTitlebar hides it, rebuilds the
     *  native window and shows it again, restoring the size but not the
     *  position (widget/gtk/nsWindow.cpp, ESR 140), and Wayland lets the
     *  compositor place the re-shown window. Kept live anyway: MJT preferred
     *  that to "applies on the next open" (2026-10-05). Windows switches in
     *  place. A fresh manager gets the bar before first show, so no jump. */
    _wvPMReapplyChrome(this: any) {
        try {
            // The drawn bar needs the `dialog=no` reroute that "Plugins
            // Manager extras" owns (a fresh manager checks both, pane.ts
            // _wvPMMaybeInject); the live re-apply checked only the title-bar
            // child and drew caption buttons on a dialog window (survey
            // 2026-10-06).
            const on = (Zotero as any).isMac ? false
                : !!(this._getCompactTitleBarPluginsManager && this._getCompactTitleBarPluginsManager()
                    && this._getEnablePluginsSearch && this._getEnablePluginsSearch());
            // @ts-ignore - enumerator is iterable in Zotero's Gecko
            for (const w of Services.wm.getEnumerator("zotero:basicViewer") as any) {
                try {
                    if (!String(w.viewerOriginalURI || "").includes("extensions/aboutaddons")) continue;
                    if (on && !w._wvPMChrome) this._wvPMSetupChrome(w, null);
                    else if (!on && w._wvPMChrome) { this._wvPMTeardownChrome(w); this._wvPMSetupChrome(w, null); }
                } catch (e) {}
            }
        } catch (e) {}
    }

    _wvPMTeardownChrome(this: any, win: any) {
        try {
            if (win && win._wvPMRestoreOnly) { try { win._wvPMRestoreOnly(); } catch (e) {} win._wvPMRestoreOnly = null; }
            const c = win && win._wvPMChrome;
            if (!c) return;
            try { win.document.documentElement.removeAttribute("customtitlebar"); } catch (e) {}
            try { c.items.removeAttribute("wv-pm-hidden"); } catch (e) {}
            try { if (c.titleObs) c.titleObs.disconnect(); } catch (e) {}
            try { if (c.reserveObs) c.reserveObs.disconnect(); } catch (e) {}
            try { if (c.restoreSize) c.restoreSize(); } catch (e) {}
            try { c.toolbar.parentElement.style.removeProperty("--wv-ctl-reserve"); } catch (e) {}
            try { this._wvRemoveHamburger(win); } catch (e) {}
            for (const k of ["iconBox", "titleEl", "dragFlex", "dragSpacer", "bb"]) {
                try { if (c[k]) c[k].remove(); } catch (e) {}
            }
            try { const st = win.document.getElementById("wv-pm-chrome-styles"); if (st) st.remove(); } catch (e) {}
            delete win._wvPMChrome;
        } catch (e) {}
    }

    /** Wrap `Zotero.openInViewer` so the Plugins Manager opens as a NORMAL
     *  window instead of a dialog: upstream hard-codes `dialog=yes`, which on
     *  Windows strips minimize/maximize from the title bar (user ask
     *  2026-09-07: "same control buttons as on the main window"). Only the
     *  aboutaddons URI is rerouted — everything else goes to the original.
     *  Mirrors upstream's dedupe-and-focus and onLoad plumbing
     *  (zotero.js `openInViewer`, verified 10.0.2-beta.7). */
    _wvWireViewerOpen(this: any) {
        try {
            const Z: any = Zotero as any;
            const tag = this._wvWireTag();
            if (Z._wvViewerOpenWired === tag) return;
            if (Z._wvOrigOpenInViewer) Z.openInViewer = Z._wvOrigOpenInViewer;
            const orig = Z.openInViewer;
            if (typeof orig !== "function") return;
            Z._wvOrigOpenInViewer = orig;
            Z.openInViewer = function (uri: any, options: any) {
                try {
                    const lp: any = Z.Weavero && Z.Weavero.plugin;
                    if (lp && typeof uri === "string" && uri.includes("extensions/aboutaddons")) {
                        return lp._wvPMOpenViewerNonDialog(uri, options, orig, this);
                    }
                } catch (e) {}
                return orig.apply(this, arguments);
            };
            Z._wvViewerOpenWired = tag;
        } catch (e) { Zotero.debug("[Weavero] _wvWireViewerOpen err: " + e); }
    }

    _wvUnwireViewerOpen(this: any) {
        try {
            const Z: any = Zotero as any;
            if (!Z._wvOrigOpenInViewer) return;
            Z.openInViewer = Z._wvOrigOpenInViewer;
            delete Z._wvOrigOpenInViewer;
            delete Z._wvViewerOpenWired;
        } catch (e) {}
    }

    /** The manager reopens on the Plugins list, never on the view it was
     *  closed on: about:addons restores `extensions.ui.lastCategory` at
     *  initialization (aboutaddons.js, "Select an initial view") and Zotero
     *  never resets it, so a manager closed on Recent Updates came back there
     *  (MJT 2026-09-23). Set, not cleared: the page writes the pref on every
     *  view change, and a cleared user pref can refuse re-creation until
     *  restart (the cleared-pref trap). */
    _wvPMResetLastView(this: any): void {
        try { Services.prefs.setStringPref("extensions.ui.lastCategory", "addons://list/extension"); } catch (e) {}
    }

    _wvPMOpenViewerNonDialog(this: any, uri: string, options: any, orig: any, thisArg: any) {
        // Same shape as upstream, only `dialog=no` differs.
        const viewerWins = Services.wm.getEnumerator("zotero:basicViewer");
        // @ts-ignore - enumerator is iterable in Zotero's Gecko
        for (const existingWin of viewerWins as any) {
            if (existingWin.viewerOriginalURI === uri
                    && existingWin.viewerUserContextId === (options && options.userContextId)) {
                existingWin.focus();
                return existingWin;
            }
        }
        this._wvPMResetLastView();   // a fresh manager starts on the Plugins list
        const ww: any = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
            .getService(Components.interfaces.nsIWindowWatcher);
        const arg: any = { uri, options: Object.assign({}, options, { onLoad: undefined }) };
        arg.wrappedJSObject = arg;
        const win: any = ww.openWindow(null, "chrome://zotero/content/standalone/basicViewer.xhtml",
            null, "chrome,dialog=no,resizable,centerscreen,menubar,scrollbars", arg);
        // Draw the bar BEFORE the window is first shown. `customtitlebar`
        // decides the window's decorations, and upstream sets it at script
        // time for that reason (titlebar.js: "Set attributes that affect
        // window chrome sizing immediately"). The injection path only runs
        // once about:addons has loaded, ~270ms after the window is on screen;
        // on Linux switching decorations that late makes GTK take the window
        // down and put it back up -- the manager visibly opened, closed and
        // reopened (measured 2026-10-01, Zotero 10.0.5-beta.2, Wayland: shown
        // at 76ms with the native bar, deactivate/activate at 316ms when the
        // attribute landed; at DOMContentLoaded there is a single activate).
        // The late call in _wvPMInject stays as the path for a manager that
        // was already open (plugin reload) -- it no-ops on `_wvPMChrome`.
        // Guard: test/plugins-chrome-platform.spec.js.
        try {
            const early = function (ev: any) {
                try {
                    if (!ev || ev.target !== win.document) return;
                    win.removeEventListener("DOMContentLoaded", early, true);
                    const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (lp && lp._getEnablePluginsSearch && lp._getEnablePluginsSearch()) lp._wvPMSetupChrome(win, null);
                } catch (e) {}
            };
            win.addEventListener("DOMContentLoaded", early, true);
        } catch (e) {}
        if (options && options.onLoad) {
            const func = function () {
                win.removeEventListener("load", func);
                win.setTimeout(() => {
                    try {
                        const browser = win.document.documentElement.getElementsByTagName("browser")[0];
                        const innerFunc = function () {
                            browser.removeEventListener("pageshow", innerFunc);
                            try { options.onLoad(browser.contentDocument); } catch (e) {}
                        };
                        browser.addEventListener("pageshow", innerFunc);
                    } catch (e) {}
                });
            };
            win.addEventListener("load", func);
        }
        return win;
    }

    _registerPluginsSearch(this: any) {
        try {
            if (!this._getEnablePluginsSearch || !this._getEnablePluginsSearch()) return;
            this._wvWireViewerOpen();
            // Keep the "Recent Updates" sidebar category permanently visible
            // (MJT 2026-09-07): aboutaddons hides it behind
            // `extensions.ui.recent-updates.hidden` (default true) and only
            // the gear menu ever reveals it. A plain platform pref — set via
            // Services.prefs, not Zotero.Prefs.
            try { Services.prefs.setBoolPref("extensions.ui.recent-updates.hidden", false); } catch (e) {}
            if (this._wvPMObserver) return;
            const self = this;
            const tryInject = (w: any) => { try { self._wvPMMaybeInject(w); } catch (e) {} };
            const obs = {
                observe(subject: any, topic: string) {
                    if (topic !== "domwindowopened") return;
                    try {
                        subject.addEventListener("load", () => tryInject(subject), { once: true });
                    } catch (e) {}
                },
            };
            Services.obs.addObserver(obs as any, "domwindowopened");
            this._wvPMObserver = obs;
            // Manager may already be open (e.g. plugin reloaded from it).
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) tryInject(en.getNext());
        } catch (e) { Zotero.debug("[Weavero] _registerPluginsSearch err: " + e); }
    }

    _teardownPluginsSearch(this: any) {
        try {
            this._wvUnwireViewerOpen();
            // Guarded per the cleared-pref trap (a user-value-only pref that
            // is cleared can refuse re-creation until restart).
            try { Services.prefs.clearUserPref("extensions.ui.recent-updates.hidden"); } catch (e) {}
            if (this._wvPMObserver) {
                try { Services.obs.removeObserver(this._wvPMObserver, "domwindowopened"); } catch (e) {}
                this._wvPMObserver = null;
            }
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try {
                    this._wvPMTeardownChrome(w);
                    const br = w.document && w.document.querySelector("browser");
                    const cd = br && br.contentDocument;
                    if (!cd) continue;
                    const box = cd.getElementById("wv-pm-searchbox");
                    if (box) box.remove();
                    // The rules go with the box: the next build's injection
                    // must not inherit a stale stylesheet (dev.21, 2026-09-09).
                    const st = cd.getElementById("wv-pm-search-styles");
                    if (st) st.remove();
                    for (const m of cd.querySelectorAll(".wv-pm-meta")) m.remove();
                    this._wvPMRemoveRecentFrame(cd);   // heading row + dropdown
                    this._wvPMRemoveSidebar(cd);       // Zotero 11 sidebar -> stock
                    if (cd._wvPMKeyHandler) {
                        try { cd.removeEventListener("keydown", cd._wvPMKeyHandler, true); } catch (e) {}
                        try { w.document.removeEventListener("keydown", cd._wvPMKeyHandler, true); } catch (e) {}
                        delete cd._wvPMKeyHandler;
                    }
                    if (cd._wvPMMo) { try { cd._wvPMMo.disconnect(); } catch (e) {} delete cd._wvPMMo; }
                    for (const c of cd.querySelectorAll("addon-card[hidden]")) c.hidden = false;
                } catch (e) {}
            }
        } catch (e) {}
    }

    /** `win` just loaded — if it's a basicViewer hosting about:addons, inject
     *  once its content finishes loading (the page loads async in a browser). */
    _wvPMMaybeInject(this: any, win: any) {
        try {
            if (!win || !win.document || !win.location) return;
            if (!String(win.location.href).includes("basicViewer")) return;
            const self = this;
            const pageDoc = () => {
                const br = win.document.querySelector("browser");
                const cd = br && br.contentDocument;
                return cd && String(cd.location && cd.location.href).includes("aboutaddons") ? cd : null;
            };
            // `_wvPMMo` marks a document _wvPMInject already wired. The search
            // box cannot: it leaves the DOM on the detail view.
            const check = () => {
                try {
                    const cd = pageDoc();
                    if (!cd) return false;
                    if (cd._wvPMMo) return true;
                    if (cd.readyState !== "complete") return false;
                    self._wvPMInject(win, cd);
                    return true;
                } catch (e) { return false; }
            };
            if (check()) return;
            // Inject the moment the page creates its <addon-list>, inside the
            // same mutation batch -- i.e. before that list is ever painted.
            // The poll below only looks every 250ms and waits for
            // readyState "complete": the box landed up to a quarter second
            // after the cards and pushed them down (measured 2026-10-01:
            // first card 296ms, box 318ms on a lucky tick). The poll stays as
            // the fallback for a page that opens on a view without a list.
            let earlyMo: any = null;
            const armEarly = () => {
                try {
                    if (earlyMo) return;
                    const cd = pageDoc();
                    if (!cd || !cd.documentElement) return;
                    const tryNow = () => {
                        if (cd._wvPMMo) return true;
                        if (!cd.body || !cd.querySelector("addon-list")) return false;
                        const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        if (!lp || !lp._getEnablePluginsSearch || !lp._getEnablePluginsSearch()) return true;
                        lp._wvPMInject(win, cd);
                        return true;
                    };
                    if (tryNow()) return;
                    earlyMo = new win.MutationObserver(() => {
                        try { if (tryNow()) earlyMo.disconnect(); } catch (e) {}
                    });
                    earlyMo.observe(cd.documentElement, { childList: true, subtree: true });
                } catch (e) {}
            };
            armEarly();
            try {
                const br = win.document.querySelector("browser");
                if (br) br.addEventListener("DOMContentLoaded", () => armEarly(), true);
            } catch (e) {}
            let tries = 0;
            const t = win.setInterval(() => {
                try {
                    armEarly();
                    if (check() || ++tries > 40) {
                        win.clearInterval(t);
                        try { if (earlyMo) earlyMo.disconnect(); } catch (e) {}
                    }
                } catch (e) {}
            }, 250);
        } catch (e) {}
    }

    _wvPMInject(this: any, win: any, doc: any) {
        try {
            if (doc.getElementById("wv-pm-searchbox")) return;
            const main = doc.getElementById("main") || doc.body;
            if (!main) return;
            const self = this;
            this._wvPMSetupChrome(win, doc);   // menubar -> hamburger popup (non-Mac)
            const wrap = doc.createElement("div");
            wrap.id = "wv-pm-searchbox";
            // z-index 1: above the scrolling cards, but BELOW the page's own
            // popups (the gear menu opens over the bar, not under it).
            wrap.style.cssText = "position: sticky; top: 0; z-index: 1; padding: 10px 16px 8px;"
                + " background: var(--background-color, Window);"
                + " display: flex; gap: 8px; align-items: center;";
            // Gecko 140 draws no clear affordance on <input type=search>, so
            // the box is input + a × INSIDE its right edge, the quick search's
            // contract (search-textbox.css / searchTextbox.js): same
            // close-12.svg in currentColor, shown only while there is text,
            // click clears and keeps focus in the field. Static rules live in
            // a <style> because an inline `display` would beat the UA's
            // [hidden] rule and the button could never hide. about:addons
            // styles every <button> with min-width 6.3em / min-height 32px,
            // and min-* beats width/height -- without the resets the × was a
            // 94px-wide hover slab (MJT 2026-09-09).
            // Always REPLACE the rules: a hot reload re-injects into a window
            // whose <style> came from the previous build (the teardown
            // removes it too, but belt and braces -- dev.21's min-size fix
            // was invisible in the open window until the rules were replaced).
            {
                const stale = doc.getElementById("wv-pm-search-styles");
                if (stale) { try { stale.remove(); } catch (e) {} }
                const style = doc.createElement("style");
                style.id = "wv-pm-search-styles";
                style.textContent = [
                    // Measured on the main window's quick search (2026-09-09):
                    // field 28px, glyph 12px in a 14px slot, opacity 1, no
                    // background in any state, cursor default. This field is
                    // 33px, so the same proportions give a 14px glyph in a
                    // 16px slot.
                    "#wv-pm-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%);",
                    "  width: 16px; height: 16px; min-width: 0; min-height: 0; max-width: 16px; max-height: 16px;",
                    "  padding: 0; margin: 0; border: 0; border-radius: 0;",
                    "  background: none; color: inherit; cursor: default;",
                    "  display: flex; align-items: center; justify-content: center; }",
                    "#wv-pm-clear:hover, #wv-pm-clear:active { background: none; }",
                    "#wv-pm-clear[hidden] { display: none; }",
                    "#wv-pm-clear > img { width: 14px; height: 14px; -moz-context-properties: fill; fill: currentColor; }",
                    // Firefox 153 (Zotero 11) adds a NATIVE clear button to
                    // search inputs in chrome documents: two × in the box
                    // (Zotero 11 for Developers, audit 2026-10-13). Ours stays
                    // (same look on 10 and 11).
                    "#wv-pm-field input::-moz-search-clear-button { display: none; }",
                ].join("\n");
                (doc.head || doc.documentElement).appendChild(style);
            }
            const field = doc.createElement("div");
            field.id = "wv-pm-field";
            field.style.cssText = "position: relative; flex: 1; display: flex;";
            const input = doc.createElement("input");
            input.type = "search";
            input.placeholder = "Search installed plugins  (Ctrl+F)";
            input.style.cssText = "flex: 1; box-sizing: border-box; padding: 7px 32px 7px 12px;"
                + " font-size: 14px; border-radius: 6px; color: inherit;"
                + " border: 1px solid color-mix(in srgb, currentColor 30%, transparent);"
                + " background: color-mix(in srgb, currentColor 6%, transparent);";
            field.appendChild(input);
            const clear = doc.createElement("button");
            clear.type = "button";
            clear.id = "wv-pm-clear";
            clear.title = "Clear";
            clear.setAttribute("aria-label", "Clear");
            const xIcon = doc.createElement("img");
            xIcon.src = "resource://content-accessible/close-12.svg";
            xIcon.alt = "";
            clear.appendChild(xIcon);
            field.appendChild(clear);
            wrap.appendChild(field);
            const syncClear = () => { try { clear.hidden = !input.value; } catch (e) {} };
            const apply = () => {
                try {
                    const q = String(input.value || "").trim().toLowerCase();
                    for (const card of doc.querySelectorAll("addon-card")) {
                        let txt = card.getAttribute("addon-id") || "";
                        const n = card.querySelector(".addon-name");
                        const d = card.querySelector(".addon-description");
                        if (n) txt += " " + (n.textContent || "");
                        if (d) txt += " " + (d.textContent || "");
                        card.hidden = !!q && !txt.toLowerCase().includes(q);
                    }
                } catch (e) {}
                syncClear();
            };
            syncClear();
            input.addEventListener("input", apply);
            // mousedown would move focus to the button; keep it in the field
            // so the user can keep typing after clearing.
            clear.addEventListener("mousedown", (e: any) => { try { e.preventDefault(); } catch (er) {} });
            clear.addEventListener("click", () => {
                input.value = "";
                apply();
                try { input.focus(); } catch (e) {}
            });
            input.addEventListener("keydown", (e: any) => {
                if (e.key === "Escape" && input.value) {
                    e.preventDefault(); e.stopPropagation();
                    input.value = ""; apply();
                }
            });
            // about:addons re-renders #main on every view switch. Show the box ONLY
            // on the LIST view (an <addon-list> is present); on a single-plugin
            // DETAIL view there's nothing to search, so remove it — it returns when
            // you go back to the list. Observe a STABLE ancestor (body) so we catch
            // #main itself being replaced. The insert/remove are guarded (only on a
            // state change) so they can't loop; the filter writes `hidden` (an
            // attribute), not childList, so it can't retrigger either.
            try {
                const sync = () => {
                    try {
                        self._wvPMEnsureSidebar(doc);   // Zotero 11: Plugins / Recent Updates sidebar
                        const isList = !!doc.querySelector("addon-list");
                        const box = doc.getElementById("wv-pm-searchbox");
                        if (isList) {
                            const m = doc.getElementById("main") || doc.body;
                            if (!box && m) m.insertBefore(wrap, m.firstChild);
                            apply();   // keep the filter applied as cards (re)render
                            self._wvPMDecorateCards(doc);   // version + updated meta lines
                            self._wvPMEnsureRecentFrame(win, doc);   // Recent Updates time frame
                            // Already-open managers initialized before the
                            // recent-updates pref flip — unhide directly.
                            try {
                                const rb: any = doc.querySelector('button[name="recent-updates"]');
                                if (rb && rb.hidden) rb.hidden = false;
                            } catch (e) {}
                        } else if (box) {
                            box.remove();   // detail view → nothing to search
                        }
                    } catch (e) {}
                };
                const mo = new win.MutationObserver(() => { try { sync(); } catch (e) {} });
                mo.observe(doc.body || main, { childList: true, subtree: true });
                doc._wvPMMo = mo;
                sync();   // set the correct initial state (inserts on the list view)
            } catch (e) {}
            // Ctrl+F → focus the box. Capture on both the content document
            // and the chrome window so it works wherever focus sits.
            const key = (e: any) => {
                if (wvAccel(e) && !e.shiftKey && !e.altKey
                        && String(e.key).toLowerCase() === "f") {
                    e.preventDefault(); e.stopPropagation();
                    try { input.focus(); input.select(); } catch (er) {}
                }
            };
            doc.addEventListener("keydown", key, true);
            win.document.addEventListener("keydown", key, true);
            doc._wvPMKeyHandler = key;
            try { input.focus(); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvPMInject err: " + e); }
    }

    // ---- Plugins Manager: the sidebar on Zotero 11 ----------------------------
    // Zotero 11 hides about:addons' whole sidebar and centres the content
    // column (zotero/zotero 78d21617a, "fx153: Hide the about:addons sidebar":
    // Firefox 153 rebuilt the sidebar as <moz-page-nav>, which broke Zotero's
    // per-category hide rules, and its new "Add-ons" heading would repeat
    // "Manage Your Plugins"). Recent Updates became a dead end -- no way back,
    // and the view is remembered -- and the column shrank to its content
    // (upstream-bugs #26). Weavero shows the sidebar again the way Zotero 10
    // had it: Plugins and Recent Updates always, Available Updates (n) while
    // updates are pending, no heading, no footer links; giving the grid its
    // sidebar column back also gives the cards their width. MJT 2026-10-12:
    // the sidebar uses empty horizontal space, a switch above the list would
    // cost a row of plugins. Firefox 153 markup only -- Zotero 10's sidebar is
    // native and left alone. Retire when Zotero offers a way between the views.
    // Guard: test/plugins-sidebar-z11.spec.js.

    /** Bring the reduced sidebar back (idempotent; the page observer calls it
     *  on every mutation, so each step checks before it writes). */
    _wvPMEnsureSidebar(this: any, doc: any): void {
        try {
            const cb: any = doc && doc.querySelector("categories-box");
            const nav: any = cb && cb.querySelector("moz-page-nav");
            if (!nav) return;   // Zotero 10: Firefox 140's sidebar, native
            wvInjectStyle(doc, "wv-pm-sidebar-styles", WV_PM_SIDEBAR_CSS);
            // The heading ("Add-ons" + logo) and the footer links live in the
            // nav's shadow root, which exposes no ::part to style from outside.
            // (Looked up IN the shadow root: wvInjectStyle's document lookup
            // cannot see it and would append a copy on every pass.)
            const sr: any = nav.shadowRoot;
            if (sr) {
                let st: any = sr.getElementById("wv-pm-sidebar-shadow");
                if (!st) {
                    st = wvHtmlEl(doc, "style");
                    st.id = "wv-pm-sidebar-shadow";
                    sr.appendChild(st);
                }
                if (st.textContent !== WV_PM_SIDEBAR_SHADOW_CSS) st.textContent = WV_PM_SIDEBAR_SHADOW_CSS;
            }
            // "Extensions" -> "Plugins" (Zotero 11 dropped its relabel in the
            // same commit): Firefox's own `addon-category-plugin` string, so it
            // is translated wherever Firefox is. Lit re-applies a binding only
            // when its value changes, so the swap holds across re-renders.
            const ext: any = doc.getElementById("category-extension");
            if (ext) {
                const span: any = ext.querySelector('span[data-l10n-id="addon-category-extension"]');
                if (span) span.setAttribute("data-l10n-id", "addon-category-plugin");
                if (ext.getAttribute("data-l10n-id") === "addon-category-extension-title") {
                    ext.setAttribute("data-l10n-id", "addon-category-plugin-title");
                }
            }
            // Recent Updates ALWAYS listed: Firefox 153 shows that category
            // only while it is the current view (categories-box.mjs: "unhidden
            // only via ... View Recent Updates"), so the old
            // `extensions.ui.recent-updates.hidden` pref no longer keeps it.
            // The set is rebuilt with the page's own Set constructor -- the
            // component calls Set methods (union) on it.
            const hidden: any = cb._hiddenCategories;
            if (hidden && typeof hidden.has === "function" && hidden.has("recent-updates")) {
                const PageSet: any = (doc.defaultView && doc.defaultView.Set) || Set;
                const next: any = new PageSet(hidden);
                next.delete("recent-updates");
                cb._hiddenCategories = next;
            }
        } catch (e) { Zotero.debug("[Weavero] _wvPMEnsureSidebar err: " + e); }
    }

    /** Undo `_wvPMEnsureSidebar` (Weavero disabled, or the extras switched
     *  off): stock Zotero 11 again from the next render. */
    _wvPMRemoveSidebar(this: any, doc: any): void {
        try {
            wvRemoveStyle(doc, "wv-pm-sidebar-styles");
            const cb: any = doc && doc.querySelector("categories-box");
            const nav: any = cb && cb.querySelector("moz-page-nav");
            try { const sr: any = nav && nav.shadowRoot; const st: any = sr && sr.getElementById("wv-pm-sidebar-shadow"); if (st) st.remove(); } catch (e) {}
            const ext: any = doc && doc.getElementById("category-extension");
            if (ext) {
                const span: any = ext.querySelector('span[data-l10n-id="addon-category-plugin"]');
                if (span) span.setAttribute("data-l10n-id", "addon-category-extension");
                if (ext.getAttribute("data-l10n-id") === "addon-category-plugin-title") {
                    ext.setAttribute("data-l10n-id", "addon-category-extension-title");
                }
            }
        } catch (e) {}
    }

    // ---- Plugins Manager: Recent Updates time frame ---------------------------
    // about:addons hard-codes "recent" as the last 2 days (aboutaddons.js
    // `UPDATES_RECENT_TIMESPAN`) and shows no hint of it. A dropdown on the
    // "Recent Updates" heading row says how far back the list goes and lets
    // the user pick (MJT 2026-09-23); the choice is a Weavero pref, so it
    // holds across managers and restarts. Nothing of Zotero's is patched: the
    // list's own `setSections` + `render` are called with our filter.

    /** The time frames offered, in days; 0 = All. Zotero's own is 2. */
    static readonly WV_PM_RECENT_FRAMES: ReadonlyArray<[number, string]> = [
        [1, "Last day"], [2, "Last 2 days"], [7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [0, "All"],
    ];

    /** Days the Recent Updates list covers (0 = all); default 2 = Zotero's own. */
    _wvPMRecentDays(this: any): number {
        try {
            const v = Zotero.Prefs.get("weavero.pluginsRecentUpdatesDays");
            const n = typeof v === "number" ? v : parseInt(String(v), 10);
            if (!Number.isFinite(n) || n < 0) return 2;
            return _PaneMixin.WV_PM_RECENT_FRAMES.some(([d]) => d === n) ? n : 2;
        } catch (e) { return 2; }
    }

    /** Our version of the view's section filter: same shape as aboutaddons.js
     *  (`!addon.hidden && addon.updateDate && addon.updateDate > limit`), the
     *  limit taken from the frame; 0 = no limit. */
    _wvPMRecentSections(this: any, days: number): any[] {
        const limit = days > 0 ? Date.now() - days * 86400000 : -Infinity;
        return [{
            headingId: "recent-updates-heading",
            filterFn: (addon: any) => !addon.hidden && !!addon.updateDate && addon.updateDate > limit,
        }];
    }

    /** Re-filter the list to `days` and re-render it. Idempotent per list: the
     *  frame is stamped on the element before the async render, so the
     *  observer's re-entries during the render see it applied. */
    _wvPMApplyRecentFrame(this: any, list: any, days: number): void {
        try {
            if (!list || typeof list.setSections !== "function" || typeof list.render !== "function") return;
            list._wvRecentDays = days;
            list.setSections(this._wvPMRecentSections(days));
            Promise.resolve(list.render()).catch(() => {});
        } catch (e) { Zotero.debug("[Weavero] _wvPMApplyRecentFrame err: " + e); }
    }

    /** On the Recent Updates view, keep a heading row "Recent Updates … [Last N
     *  days ▾]" at the top of the list's section and the list filtered to the
     *  stored frame. Called from the injection's body observer on every
     *  re-render, so it must be a steady-state no-op: the row is rebuilt only
     *  when the list's render wiped it, the frame re-applied only when the
     *  list carries another one. A view reload builds a NEW <addon-list> with
     *  Zotero's 2-day sections; a stored 2 is left as is (same result, no
     *  second render), anything else is re-applied once. Empty result: the
     *  page renders no heading, so the row carries its own, or the frame
     *  could never be widened again. */
    _wvPMEnsureRecentFrame(this: any, win: any, doc: any): void {
        try {
            const list: any = doc.querySelector("addon-list");
            if (!list) return;
            const heading = doc.querySelector('addon-list h2.list-section-heading[data-l10n-id="recent-updates-heading"]');
            let onRecent = !!heading;
            if (!onRecent) {
                try {
                    // "addons://updates/recent" live (measured 2026-09-23); match the tail.
                    const gvc = doc.defaultView && doc.defaultView.gViewController;
                    onRecent = !!(gvc && /updates\/recent$/.test(String(gvc.currentViewId || "")));
                } catch (e) {}
                if (!onRecent) {
                    try { onRecent = !!(list.sections && list.sections[0] && list.sections[0].headingId === "recent-updates-heading"); } catch (e) {}
                }
            }
            if (!onRecent) return;
            const days = this._wvPMRecentDays();
            // The frame: Zotero's own render (no stamp) equals a stored 2.
            if (list._wvRecentDays === undefined && days === 2) list._wvRecentDays = 2;
            if (list._wvRecentDays !== days) { this._wvPMApplyRecentFrame(list, days); return; }   // the render rebuilds the DOM; back here after it
            // The row. Host: the section node when the list has one, else the list.
            let host: any = null;
            try { host = (list.sections && list.sections[0] && list.sections[0].node) || null; } catch (e) {}
            if (!host || !host.isConnected) host = list;
            let row: any = doc.getElementById("wv-pm-recent-row");
            if (row && !row.isConnected) row = null;
            // A render is async: the observer can run between the wipe and the
            // new section, when the row can only go into the list itself. Once
            // the section exists, the row moves into it (a no-op afterwards).
            if (row && host !== list && row.parentNode !== host) host.insertBefore(row, host.firstChild);
            if (!row) {
                // Own sheet, replaced on every build: the search box's sheet is
                // under a spec that forbids fades and hover tints there. Discreet
                // (MJT 2026-09-23, "the font is too large"): the cards' meta-line
                // size and colour, no background until hovered; the page's button
                // rules set 600 15px and a 32px minimum, so each is an override.
                {
                    const stale = doc.getElementById("wv-pm-recent-styles");
                    if (stale) { try { stale.remove(); } catch (e) {} }
                    const style = doc.createElement("style");
                    style.id = "wv-pm-recent-styles";
                    style.textContent = [
                        "#wv-pm-recent-frame { font-size: 12px; font-weight: normal; line-height: 1.2;",
                        "  min-height: 0; min-width: 0; height: auto; padding: 4px 8px; margin: 0; margin-inline-start: auto;",
                        "  border-radius: 4px; background: transparent;",
                        "  color: var(--text-color-deemphasized, color-mix(in srgb, currentColor 70%, transparent)); }",
                        "#wv-pm-recent-frame:hover { background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; }",
                        "#wv-pm-recent-frame:active { background: color-mix(in srgb, currentColor 14%, transparent); }",
                        "#wv-pm-recent-frame > img { width: 10px; height: 10px; }",
                    ].join("\n");
                    (doc.head || doc.documentElement).appendChild(style);
                }
                row = doc.createElement("div");
                row.id = "wv-pm-recent-row";
                row.style.cssText = "display: flex; align-items: center; gap: 12px;";
                // The control is the page's own kind: a plain <button> in the
                // page's button style, opening a <panel-list> of <panel-item>s
                // -- what the gear menu and the cards' "…" use. Not an HTML
                // <select>: the basic viewer hosts no dropdown for content
                // selects (Firefox's browser window provides one), so a select
                // here opens nothing (MJT 2026-09-23: "I cannot click on it").
                const btn = doc.createElement("button");
                btn.id = "wv-pm-recent-frame";
                btn.title = "How far back Recent Updates goes";
                btn.setAttribute("aria-haspopup", "menu");
                btn.setAttribute("aria-expanded", "false");
                btn.style.cssText = "margin-inline-start: auto; display: inline-flex; align-items: center; gap: 5px;";
                const label = doc.createElement("span");
                label.className = "wv-pm-recent-label";
                btn.appendChild(label);
                const arrow = doc.createElement("img");
                arrow.src = "chrome://global/skin/icons/arrow-down-12.svg";
                arrow.alt = "";
                arrow.style.cssText = "width: 12px; height: 12px; -moz-context-properties: fill; fill: currentColor;";
                btn.appendChild(arrow);
                const panel: any = doc.createElement("panel-list");
                panel.setAttribute("role", "menu");
                const self = this;
                const setLabel = (d: number) => {
                    try {
                        const f = _PaneMixin.WV_PM_RECENT_FRAMES.find(([x]) => x === d);
                        label.textContent = f ? f[1] : "Last " + d + " days";
                        row.dataset.days = String(d);
                        for (const it of Array.from(panel.querySelectorAll("panel-item")) as any[]) {
                            const on = it.dataset.days === String(d);
                            if (it.hasAttribute("checked") !== on) { if (on) it.setAttribute("checked", "true"); else it.removeAttribute("checked"); }
                        }
                    } catch (e) {}
                };
                const pick = (d: number) => {
                    try {
                        if (!Number.isFinite(d)) return;
                        Zotero.Prefs.set("weavero.pluginsRecentUpdatesDays", d);
                        setLabel(d);
                        const l: any = doc.querySelector("addon-list");
                        if (l) self._wvPMApplyRecentFrame(l, d);
                    } catch (e) {}
                };
                for (const [d, text] of _PaneMixin.WV_PM_RECENT_FRAMES) {
                    const it: any = doc.createElement("panel-item");
                    it.setAttribute("type", "checkbox");
                    it.setAttribute("role", "menuitemradio");
                    it.dataset.days = String(d);
                    // Zotero's own frame is named as the default in the menu (MJT
                    // 2026-09-23); the button keeps the short label.
                    it.textContent = d === 2 ? text + " (default)" : text;
                    it.addEventListener("click", () => pick(d));
                    panel.appendChild(it);
                }
                // Anchor = the BUTTON, passed explicitly: panel-list anchors to the
                // event's target by default, which is the label <span> inside the
                // button, and the menu then lines up with the text, not the
                // control (MJT 2026-09-23, "should be better aligned").
                // A second click CLOSES: panel-list hides itself on any mousedown
                // outside it -- the button included -- so by the click the menu
                // is already closed and a plain toggle reopened it (MJT
                // 2026-09-23). Remember at mousedown whether it was open; a click
                // that follows such a mousedown does nothing. Keyboard activation
                // (Enter / Space) has no mousedown and toggles as before.
                btn.addEventListener("mousedown", () => { try { btn._wvWasOpen = !!panel.open; } catch (er) {} });
                btn.addEventListener("click", (e: any) => {
                    try {
                        const wasOpen = !!btn._wvWasOpen; btn._wvWasOpen = false;
                        if (wasOpen) return;
                        // panel-list measures the EVENT's composed target in setAlign
                        // (not the anchor node it is handed), so a click on the label
                        // text or on the arrow gave two different positions (MJT
                        // 2026-09-23). Its `_savedComposedTarget` short-circuit takes
                        // the button instead.
                        try { e._savedComposedTarget = btn; } catch (er) {}
                        if (typeof panel.toggle === "function") panel.toggle(e, btn);
                    } catch (er) {}
                });
                // Right-aligned under the button with a small gap, whatever the
                // page's left/right choice: its setAlign writes left/top and
                // removes `showing`; run right after it, in the same microtask
                // continuation, so the first paint is already at our position
                // (the "shown" event only fires a frame later).
                try {
                    const origSetAlign = panel.setAlign;
                    if (typeof origSetAlign === "function") {
                        panel.setAlign = async function (...a: any[]) {
                            const r = await origSetAlign.apply(this, a);
                            try {
                                const b = btn.getBoundingClientRect(), p = panel.getBoundingClientRect();
                                const dx = p.right - b.right;
                                if (Math.abs(dx) > 0.5) panel.style.left = (parseFloat(panel.style.left || "0") - dx) + "px";
                                const below = panel.getAttribute("valign") !== "top";
                                panel.style.top = (parseFloat(panel.style.top || "0") + (below ? 4 : -4)) + "px";
                            } catch (er) {}
                            return r;
                        };
                    }
                } catch (er) {}
                try {
                    panel.addEventListener("shown", () => { try { btn.setAttribute("aria-expanded", "true"); } catch (e) {} });
                    panel.addEventListener("hidden", () => { try { btn.setAttribute("aria-expanded", "false"); } catch (e) {} });
                } catch (e) {}
                row._wvPick = pick;
                row._wvSetLabel = setLabel;
                row.appendChild(btn);
                row.appendChild(panel);
                host.insertBefore(row, host.firstChild);
            }
            // The heading goes INTO the row (moved once); with no cards the page
            // renders none, so the row keeps its own until one appears.
            const btn: any = row.querySelector("#wv-pm-recent-frame");
            const h2: any = doc.querySelector('addon-list h2.list-section-heading[data-l10n-id="recent-updates-heading"]');
            if (h2 && h2.parentNode !== row) {
                const own = row.querySelector("h2[data-wv-own]");
                if (own) own.remove();
                h2.style.marginInlineEnd = "auto";
                row.insertBefore(h2, btn);
            } else if (!h2 && !row.querySelector("h2")) {
                const own = doc.createElement("h2");
                own.className = "list-section-heading";
                own.setAttribute("data-wv-own", "1");
                own.textContent = "Recent Updates";
                own.style.marginInlineEnd = "auto";
                row.insertBefore(own, btn);
            }
            if (row.dataset.days !== String(days) && typeof row._wvSetLabel === "function") row._wvSetLabel(days);
        } catch (e) { Zotero.debug("[Weavero] _wvPMEnsureRecentFrame err: " + e); }
    }

    /** Undo the heading row in a page (teardown / feature off): the heading
     *  goes back where the page put it, the row goes. The list keeps its
     *  current cards until its next render. */
    _wvPMRemoveRecentFrame(this: any, doc: any): void {
        try {
            try { const st = doc && doc.getElementById("wv-pm-recent-styles"); if (st) st.remove(); } catch (e) {}
            const row: any = doc && doc.getElementById("wv-pm-recent-row");
            if (!row) return;
            try { const p = row.querySelector("panel-list"); if (p && p.open && typeof p.hide === "function") p.hide(); } catch (e) {}
            const h2 = row.querySelector('h2[data-l10n-id="recent-updates-heading"]');
            if (h2) { h2.style.marginInlineEnd = ""; row.parentNode.insertBefore(h2, row); }
            row.remove();
        } catch (e) {}
    }
}

const _paneDescriptors = Object.getOwnPropertyDescriptors(_PaneMixin.prototype);
delete (_paneDescriptors as any).constructor;
export const paneMethods = _paneDescriptors;
