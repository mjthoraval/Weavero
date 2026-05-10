// @ts-nocheck — see note below.
// Weavero — bundled main module.
//
// `bootstrap.js` (a thin plain-JS shim) loads this file via
// `Services.scriptloader.loadSubScript` on plugin startup, then
// calls `Zotero.Weavero.hooks.onStartup({...})` to hand off the
// lifecycle. Everything that used to live at top-level in
// bootstrap.js — the constants, the `WeaveroPlugin` class, the
// startup/shutdown/onMainWindowLoad/onMainWindowUnload bodies —
// is bundled here. Module-by-module split is layered on top in
// later commits.
//
// `// @ts-check` was used during the v0.7 toolchain bring-up to
// surface latent bugs — three real ones were caught and fixed.
// It's `// @ts-nocheck` now: the remaining ~170 type errors on
// this single 19k-line file are DOM Node-vs-Element narrowing
// noise (querySelector returns Element, parentNode returns Node,
// etc.) — not real bugs, but they pollute `npm run typecheck`
// and would block CI from being a hard typecheck gate.
// Phase 3 of the TS migration tackles them per-module.

import {
    STYLE_ID, PANEL_ID,
    BTN_CLASS, BTN_TREE_CLASS, BTN_PANE_CLASS,
    BTN_POPUP_CLASS, BTN_SIDEBAR_CLASS,
    SCHEME_SVG_TEMPLATE, MENU_LABEL_PREFIXES, PLUGIN_CSS,
} from "./modules/constants";
import { URL_SCHEMES, urlMethods } from "./modules/url";
import { annotationMethods } from "./modules/annotation";
import { tabsMethods } from "./modules/tabs";
import { noteEditorMethods } from "./modules/note-editor";
import { readerMethods } from "./modules/reader";

// Captured by the IIFE bundle's closure; the class methods read
// `_rootURI` to build absolute URIs for resources inside the XPI
// (icons, prefs.html, fetched assets). Set in onStartup.
let _rootURI = "";


// ===========================================================================

class WeaveroPlugin {

    INVISIBLE_RE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;
    TRAILING_RE  = /[.,;:!?)\]\}>'"`]+$/;


    constructor() {
        this._readerObservers = new WeakMap();
        this._notifierIDs     = [];
        this._pollInterval    = null;
        this._treeObserver    = null;
        this._treeScanTimer   = null;
        this._paneObserver    = null;
        // Keys we just removed via the delete notifier. The debounced
        // _processNoteAnnotationOverlays scan that fires ~100 ms later
        // calls attachment.getAnnotations(); if Zotero's in-memory cache
        // hasn't settled yet, that call still returns the deleted
        // annotation and the badge gets recreated. We exclude these keys
        // from wantList for ~2 s, by which time the cache has caught up.
        // Map<key, timestamp>.
        this._recentlyDeletedKeys = new Map();
    }

    // ---- Utilities --------------------------------------------------------


    // ---- CSS injection -----------------------------------------------------

    injectStyles() {
        const doc = Zotero.getMainWindow().document;
        // Always remove any existing weavero-styles element first.
        // Zotero's in-place plugin upgrade flow doesn't reliably tear
        // down the previous plugin's DOM additions before the new init
        // runs — if we just `return` on existing-style, the new init
        // sees the OLD plugin's style element (with potentially stale
        // PLUGIN_CSS content from before the update) and skips. Result:
        // popup CSS rules don't match the new plugin's expectations,
        // padding/line-breaks/etc disappear until the user manually
        // disables and re-enables the plugin (which fully runs init
        // again from a clean state).
        const existing = doc.getElementById(STYLE_ID);
        if (existing) existing.remove();
        const s = doc.createElement("style");
        s.id = STYLE_ID;
        s.textContent = PLUGIN_CSS;
        (doc.head || doc.documentElement).appendChild(s);
    }

    removeStyles() {
        try {
            const el = Zotero.getMainWindow().document.getElementById(STYLE_ID);
            if (el) el.remove();
        } catch {}
    }

    // ---- zotero:// URI dispatch --------------------------------------------

    async handleZoteroURI(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const getLib = () => {
                if (parts[0] === "groups")
                    return Zotero.Groups.getLibraryIDFromGroupID(Number(parts[1]));
                return Zotero.Libraries.userLibraryID;
            };
            const lastKey = parts[parts.length - 1];

            if (url.startsWith("zotero://select/")) {
                // Path shapes Zotero accepts:
                //   .../items/<key>            (user-library item)
                //   .../collections/<key>      (user-library collection)
                //   .../searches/<key>         (user-library saved search)
                //   .../groups/<gid>/items/<key>
                //   .../groups/<gid>/collections/<key>
                //   .../groups/<gid>/searches/<key>
                // The selector keyword is the second-to-last segment;
                // the key is always last. Falling back to "items"
                // preserves behavior for the legacy bare form.
                const lib = getLib();
                const kind = parts[parts.length - 2] || "items";
                const win  = Zotero.getMainWindow();
                const pane = Zotero.getActiveZoteroPane();
                // When the link is clicked from a note tab (or any
                // non-library tab), `selectItem` / `selectCollection`
                // affect the library tab in the background but the
                // user keeps seeing the note. Switch to the library
                // tab first so the result is visible. Mirrors the
                // "Show in Library" affordance on the annotation
                // context menu.
                const switchToLibrary = () => {
                    try {
                        if (win.Zotero_Tabs
                            && typeof win.Zotero_Tabs.select === "function") {
                            win.Zotero_Tabs.select("zotero-pane");
                        }
                    } catch (e) {}
                };
                if (kind === "collections") {
                    const col = Zotero.Collections.getByLibraryAndKey(lib, lastKey);
                    if (col && pane.collectionsView
                        && typeof pane.collectionsView.selectCollection === "function") {
                        switchToLibrary();
                        await pane.collectionsView.selectCollection(col.id);
                        win.focus();
                    }
                    return;
                }
                if (kind === "searches") {
                    const search = Zotero.Searches.getByLibraryAndKey(lib, lastKey);
                    if (search && pane.collectionsView
                        && typeof pane.collectionsView.selectSearch === "function") {
                        switchToLibrary();
                        await pane.collectionsView.selectSearch(search.id);
                        win.focus();
                    }
                    return;
                }
                // Default: items
                const item = Zotero.Items.getByLibraryAndKey(lib, lastKey);
                if (item) {
                    switchToLibrary();
                    await pane.selectItem(item.id);
                    win.focus();
                }
                return;
            }
            if (url.startsWith("zotero://open")) {
                const item = Zotero.Items.getByLibraryAndKey(getLib(), lastKey);
                if (!item) return;
                const loc = {};
                const page = u.searchParams.get("page");
                const ann  = u.searchParams.get("annotation");
                if (page !== null) loc.pageIndex = Number(page) - 1;
                if (ann) loc.annotationID = ann;
                await Zotero.Reader.open(item.id, loc);
                return;
            }
            if (url.startsWith("zotero://note/")) {
                let key, lib;
                if (parts[0] === "u")      { lib = Zotero.Libraries.userLibraryID; key = parts[1]; }
                else if (parts[0] === "g" || parts[0] === "groups")
                                           { lib = getLib(); key = lastKey; }
                else                       { lib = Zotero.Libraries.userLibraryID; key = lastKey; }
                if (!key) return;
                const note = Zotero.Items.getByLibraryAndKey(lib, key);
                if (!note) return;
                const win  = Zotero.getMainWindow();
                const pane = win.ZoteroPane;
                try {
                    if (typeof pane.openNote === "function") await pane.openNote(note.id);
                    else if (typeof pane.openNoteWindow === "function") await pane.openNoteWindow(note.id);
                    else await pane.selectItem(note.id);
                    win.focus();
                } catch { await pane.selectItem(note.id); win.focus(); }
                return;
            }
            Zotero.launchURL(url);
        } catch (err) {
            Zotero.debug("[Weavero] handleZoteroURI error: " + err.message);
        }
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
    _setupItemsListContextMenu() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-itemmenu");
            if (!menu) return;
            this._teardownItemsListContextMenu();
            const ADD_REL_ID = "wv-itemmenu-add-related";
            const COPY_LINK_ID = "wv-itemmenu-copy-link";
            const SEP_ID = "wv-itemmenu-separator";
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
            // Build a `zotero://select/...` URI for an item, picking
            // the right library prefix (`library` vs `groups/<gid>`)
            // so the link works for both personal and group items.
            const buildSelectURI = (item) => {
                let prefix = "library";
                try {
                    if (item.libraryID !== Zotero.Libraries.userLibraryID) {
                        const gid = Zotero.Groups.getGroupIDFromLibraryID(
                            item.libraryID);
                        if (gid) prefix = "groups/" + gid;
                    }
                } catch (e) {}
                return "zotero://select/" + prefix + "/items/" + item.key;
            };
            const onShowing = () => {
                try {
                    // Remove any prior entries before re-adding.
                    for (const id of [ADD_REL_ID, COPY_LINK_ID, SEP_ID]) {
                        const stale = doc.getElementById(id);
                        if (stale) stale.remove();
                    }
                    const zp = win.ZoteroPane;
                    const selected = (zp && typeof zp.getSelectedItems === "function")
                        ? zp.getSelectedItems() : [];
                    const targets = selected.filter(isRelatable);
                    if (!targets.length) return;
                    const isDark = doc.documentElement
                        && doc.documentElement.classList.contains("wv-ui-dark");

                    // Order mirrors _buildAnnotationContextMenu
                    // exactly: Copy Item Link → separator → Add
                    // Related…. Keeps the same affordance ordering
                    // across both context-menu surfaces (annotation
                    // popup vs items-list).

                    // --- Copy Item Link --------------------------
                    // Mirrors the entry on the annotation context
                    // menu (_buildAnnotationContextMenu). Zotero
                    // doesn't expose this in the items-tree menu by
                    // default, so we add it for parity with the
                    // annotation surface. Multi-selection: copy
                    // newline-separated URIs so the user gets one
                    // link per selected item.
                    const cl = doc.createXULElement("menuitem");
                    cl.id = COPY_LINK_ID;
                    cl.setAttribute("label", targets.length > 1
                        ? "Copy Item Links  (" + targets.length + " items)"
                        : "Copy Item Link");
                    const linkIconURL = this._menuItemIconURL;
                    if (linkIconURL) {
                        cl.classList.add("menuitem-iconic");
                        cl.setAttribute("image", linkIconURL);
                    }
                    cl.addEventListener("command", () => {
                        try {
                            const zp2 = win.ZoteroPane;
                            const sel2 = (zp2 && typeof zp2.getSelectedItems === "function")
                                ? zp2.getSelectedItems() : [];
                            const fresh = sel2.filter(isRelatable);
                            if (!fresh.length) return;
                            const uris = fresh.map(buildSelectURI).join("\n");
                            Zotero.Utilities.Internal.copyTextToClipboard(uris);
                        } catch (cmdErr) {
                            Zotero.debug(
                                "[Weavero] itemmenu copy-link cmd err: " + cmdErr);
                        }
                    });
                    menu.appendChild(cl);

                    // Separator between the two Weavero entries —
                    // matches the addSep() in
                    // _buildAnnotationContextMenu between Copy Item
                    // Link and Add Related….
                    const sep = doc.createXULElement("menuseparator");
                    sep.id = SEP_ID;
                    menu.appendChild(sep);

                    // --- Add Related… ----------------------------
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
                            await this._addRelatedItemDialog(fresh);
                        } catch (cmdErr) {
                            Zotero.debug(
                                "[Weavero] itemmenu add-related cmd err: " + cmdErr);
                        }
                    });
                    menu.appendChild(mi);
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] itemmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = () => {
                try {
                    for (const id of [ADD_REL_ID, COPY_LINK_ID, SEP_ID]) {
                        const el = doc.getElementById(id);
                        if (el) el.remove();
                    }
                } catch (e) {}
            };
            menu.addEventListener("popupshowing", onShowing);
            menu.addEventListener("popuphidden", onHidden);
            this._itemMenuHandlers = { menu, onShowing, onHidden };
        } catch (e) {
            Zotero.debug("[Weavero] _setupItemsListContextMenu err: " + e);
        }
    }

    _teardownItemsListContextMenu() {
        if (!this._itemMenuHandlers) return;
        try {
            const { menu, onShowing, onHidden } = this._itemMenuHandlers;
            try { menu.removeEventListener("popupshowing", onShowing); } catch (e) {}
            try { menu.removeEventListener("popuphidden", onHidden); } catch (e) {}
            try {
                for (const id of ["wv-itemmenu-add-related", "wv-itemmenu-copy-link", "wv-itemmenu-separator"]) {
                    const stale = menu.ownerDocument.getElementById(id);
                    if (stale) stale.remove();
                }
            } catch (e) {}
        } catch (e) {}
        this._itemMenuHandlers = null;
    }

    /** Hook the collections-tree right-click menu
     *  (`#zotero-collectionmenu`) and insert "Copy Collection Link"
     *  when the right-clicked row is a regular collection. Zotero
     *  doesn't expose a copy-link affordance for collections by
     *  default; this matches the items-list copy-link entry so users
     *  have a consistent way to drop `zotero://select/...` URIs.
     *
     *  Same lifecycle as `_setupItemsListContextMenu`: bind once,
     *  rebuild the entry on each open, strip on `popuphidden` so we
     *  never leave a stale entry. */
    _setupCollectionsContextMenu() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-collectionmenu");
            if (!menu) return;
            this._teardownCollectionsContextMenu();
            const COPY_LINK_ID = "wv-collectionmenu-copy-link";
            // Build a `zotero://select/<lib-prefix>/collections/<key>`
            // URI for a collection. Same library-prefix logic as the
            // items-list copy-link.
            const buildCollectionURI = (col) => {
                let prefix = "library";
                try {
                    if (col.libraryID !== Zotero.Libraries.userLibraryID) {
                        const gid = Zotero.Groups.getGroupIDFromLibraryID(
                            col.libraryID);
                        if (gid) prefix = "groups/" + gid;
                    }
                } catch (e) {}
                return "zotero://select/" + prefix + "/collections/" + col.key;
            };
            const onShowing = () => {
                try {
                    const stale = doc.getElementById(COPY_LINK_ID);
                    if (stale) stale.remove();
                    const zp = win.ZoteroPane;
                    // Skip when the right-clicked row isn't a real
                    // collection (could be a library root, saved
                    // search, feed, or trash). `getSelectedCollection`
                    // returns the Collection object for a collection
                    // row; everything else returns null/false.
                    const col = (zp && typeof zp.getSelectedCollection === "function")
                        ? zp.getSelectedCollection() : null;
                    if (!col || !col.key) return;
                    const cl = doc.createXULElement("menuitem");
                    cl.id = COPY_LINK_ID;
                    cl.setAttribute("label", "Copy Collection Link");
                    const linkIconURL = this._menuItemIconURL;
                    if (linkIconURL) {
                        cl.classList.add("menuitem-iconic");
                        cl.setAttribute("image", linkIconURL);
                    }
                    cl.addEventListener("command", () => {
                        try {
                            // Re-resolve at click time in case the
                            // selection moved between popupshowing
                            // and the user actually clicking.
                            const zp2 = win.ZoteroPane;
                            const col2 = (zp2 && typeof zp2.getSelectedCollection === "function")
                                ? zp2.getSelectedCollection() : null;
                            if (!col2 || !col2.key) return;
                            const uri = buildCollectionURI(col2);
                            Zotero.Utilities.Internal.copyTextToClipboard(uri);
                        } catch (cmdErr) {
                            Zotero.debug(
                                "[Weavero] collectionmenu copy-link cmd err: " + cmdErr);
                        }
                    });
                    menu.appendChild(cl);
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] collectionmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = () => {
                try {
                    const el = doc.getElementById(COPY_LINK_ID);
                    if (el) el.remove();
                } catch (e) {}
            };
            menu.addEventListener("popupshowing", onShowing);
            menu.addEventListener("popuphidden", onHidden);
            this._collectionMenuHandlers = { menu, onShowing, onHidden };
        } catch (e) {
            Zotero.debug("[Weavero] _setupCollectionsContextMenu err: " + e);
        }
    }

    _teardownCollectionsContextMenu() {
        if (!this._collectionMenuHandlers) return;
        try {
            const { menu, onShowing, onHidden } = this._collectionMenuHandlers;
            try { menu.removeEventListener("popupshowing", onShowing); } catch (e) {}
            try { menu.removeEventListener("popuphidden", onHidden); } catch (e) {}
            try {
                const stale = menu.ownerDocument.getElementById("wv-collectionmenu-copy-link");
                if (stale) stale.remove();
            } catch (e) {}
        } catch (e) {}
        this._collectionMenuHandlers = null;
    }


    // ---- Items tree (event delegation — no DOM injection, no blink) --------

    // ---- Items tree helpers -----------------------------------------------

    /** Return the character offset of (textNode, offsetInNode) relative to container. */
    _absoluteOffset(container, textNode, offsetInNode) {
        let total = 0;
        const walker = container.ownerDocument.createTreeWalker(
            container, 0x4 /* NodeFilter.SHOW_TEXT */, null);
        let node;
        while ((node = walker.nextNode())) {
            if (node === textNode) return total + offsetInNode;
            total += node.textContent.length;
        }
        return -1;
    }

    /**
     * If the pixel coords (x,y) land on a URL inside cell, return that URL.
     * Returns null if the click was in the ::after icon zone (past all text content).
     */
    _getURLAtClick(cell, x, y) {
        const doc = cell.ownerDocument;
        // If click is to the right of the full text content, it's on the ::after icon
        try {
            const textRange = doc.createRange();
            textRange.selectNodeContents(cell);
            const textRect = textRange.getBoundingClientRect();
            if (textRect.width > 0 && x > textRect.right + 2) return null;
        } catch(e) {}

        let charOffset = -1;
        try {
            if (doc.caretRangeFromPoint) {
                const range = doc.caretRangeFromPoint(x, y);
                if (range && range.startContainer.nodeType === 3)
                    charOffset = this._absoluteOffset(
                        cell, range.startContainer, range.startOffset);
            } else if (doc.caretPositionFromPoint) {
                const pos = doc.caretPositionFromPoint(x, y);
                if (pos && pos.offsetNode.nodeType === 3)
                    charOffset = this._absoluteOffset(
                        cell, pos.offsetNode, pos.offset);
            }
        } catch(e) { return null; }
        if (charOffset < 0) return null;

        const text = this.normalize(cell.textContent || "");
        const regex = new RegExp(this.URL_REGEX.source, "g");
        let m;
        while ((m = regex.exec(text)) !== null) {
            const url = m[0].replace(this.TRAILING_RE, "");
            if (charOffset >= m.index && charOffset <= m.index + m[0].length)
                return url;
        }
        return null;
    }

    /** Scan visible annotation-comment cells, stamp data-has-rich, and inject colored URL spans. */
    _markCellLinks() {
        if (!this._getEnableItemsList()) {
            this._stripItemsList();
            return;
        }
        try {
            const doc = Zotero.getMainWindow().document;
            const allCells = doc.querySelectorAll(
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
                        const wantUrl = this._getEnableInlineUrls()
                            && this.URL_REGEX.test(norm_t);
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
                    cell.removeAttribute("data-has-rich");
                    cell.removeAttribute("data-icon-wanted");
                    cell.removeAttribute("data-has-url");
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
                // (if comment-markdown is on) markdown formatting directly.
                // Cells aren't editable, so we can format inline without
                // the preview-panel architecture used in the PDF reader.
                const norm = this.normalize(text);
                const frag = doc.createDocumentFragment();
                const inlineMode = this._getInlineLinks();
                const useMd = inlineMode && this._getEnableCommentMarkdown();
                const inlineUrls = inlineMode && this._getEnableInlineUrls();
                if (inlineMode) {
                    // Group order (when useMd):
                    //   1 bold, 2 italic, 3 strike, 4 code-double, 5 code-single,
                    //   6 link label, 7 link url, 8 bare URL.
                    const TOKEN = useMd ? new RegExp(
                        "\\*\\*([\\s\\S]+?)\\*\\*"
                        + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
                        + "|~~([\\s\\S]+?)~~"
                        + "|``([\\s\\S]+?)``"
                        + "|`([^`\\n]+?)`"
                        + "|\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
                        + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
                        "g"
                    ) : new RegExp(this.URL_REGEX.source, "g");
                    const wrapMd = (cls, inner) => {
                        const span = doc.createElement("span");
                        span.className = "wv-md " + cls;
                        span.textContent = inner;
                        frag.appendChild(span);
                    };
                    let last = 0, m;
                    while ((m = TOKEN.exec(norm)) !== null) {
                        if (m.index > last)
                            frag.appendChild(doc.createTextNode(norm.slice(last, m.index)));
                        if (useMd && m[1] !== undefined) {
                            wrapMd("wv-md-bold", m[1]);
                        } else if (useMd && m[2] !== undefined) {
                            wrapMd("wv-md-italic", m[2]);
                        } else if (useMd && m[3] !== undefined) {
                            wrapMd("wv-md-strike", m[3]);
                        } else if (useMd && m[4] !== undefined) {
                            // ``code`` (double backtick).
                            wrapMd("wv-md-code", m[4]);
                        } else if (useMd && m[5] !== undefined) {
                            // `code` (single backtick).
                            wrapMd("wv-md-code", m[5]);
                        } else if (useMd && m[6] !== undefined && m[7] !== undefined) {
                            // Markdown link [label](url). With URLs sub-toggle
                            // off, drop the URL part and render just the label
                            // as plain text — the user can still see what was
                            // linked, just without the colour/click affordance.
                            if (inlineUrls) {
                                const url = m[7];
                                const cls = this._urlLinkClass(url);
                                const span = doc.createElement("span");
                                span.className = "wv-url-span " + cls;
                                span.title = url;
                                span.textContent = m[6];
                                span.setAttribute("data-href", url);
                                // Inline `color` references the same CSS
                                // variable as the class rule, so theme
                                // toggles propagate without re-rendering
                                // (and so app-link spans get the violet
                                // colour, which the old hard-coded
                                // "zotero ? orange : blue" branch missed).
                                span.style.setProperty("color",
                                    "var(--" + cls + ")", "important");
                                // Cursor is set via stylesheet so our
                                // :root.wv-context-menu-open suppress rule
                                // can override it to default while the
                                // right-click menu is open. Inline
                                // cursor:pointer !important would beat the
                                // stylesheet rule by specificity.
                                frag.appendChild(span);
                            } else {
                                frag.appendChild(doc.createTextNode(m[6]));
                            }
                        } else {
                            // Bare URL (group 8 in md regex, group 0 in URL-only regex).
                            const raw = useMd ? m[8] : m[0];
                            if (raw === undefined) { last = m.index + m[0].length; continue; }
                            if (inlineUrls) {
                                const url   = raw.replace(this.TRAILING_RE, "");
                                const trail = raw.slice(url.length);
                                const cls = this._urlLinkClass(url);
                                const span = doc.createElement("span");
                                span.className = "wv-url-span " + cls;
                                span.title = url;
                                span.textContent = url;
                                span.style.setProperty("color",
                                    "var(--" + cls + ")", "important");
                                // (See comment above re: stylesheet cursor.)
                                frag.appendChild(span);
                                if (trail) frag.appendChild(doc.createTextNode(trail));
                            } else {
                                // URLs sub-toggle off — emit raw URL as plain text.
                                frag.appendChild(doc.createTextNode(raw));
                            }
                        }
                        last = m.index + m[0].length;
                    }
                    if (last < norm.length)
                        frag.appendChild(doc.createTextNode(norm.slice(last)));
                } else {
                    // Icons-only mode: plain text only.
                    frag.appendChild(doc.createTextNode(norm));
                }

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

                // Real-DOM tree icon (display:none unless :root.wv-show-tree-icon)
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

            // After layout settles, mark cells whose text-wrap is overflowing
            // so the icon shows as a fallback even when the pref is off.
            const win = Zotero.getMainWindow();
            if (win && win.requestAnimationFrame) {
                win.requestAnimationFrame(() => {
                    try { this._updateTruncationFlags(); }
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
            const otherRows = doc.querySelectorAll(".annotation-row");
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
            this._applySelectionTargetVisuals();
        } catch(e) {
            Zotero.debug("[Weavero] _markCellLinks error: " + e);
        }
    }

    /** Temporarily un-patch the items-tree rowProvider so Zotero's
     *  internal load / refresh logic sees the live `_rows` instead
     *  of our stale `getRow` / `getRowCount`. Mirrors the inactive
     *  branch of `_applyItemsListFilterInner` (line ~11934). The
     *  next `_applyItemsListFilter()` call re-installs the patches
     *  with a fresh `keep` array. */
    _pauseFilterPatches() {
        try {
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            const rp = itemsView && itemsView.rowProvider;
            if (!rp || !rp._wvOrigGetRow) return;
            delete rp.getRow;
            delete rp.getRowCount;
            delete rp._wvOrigGetRow;
            delete rp._wvOrigGetRowCount;
            if (rp._wvOrigGetLevel) {
                delete rp.getLevel;
                delete rp._wvOrigGetLevel;
            }
            if (rp._wvOrigIsContainer) {
                delete rp.isContainer;
                delete rp._wvOrigIsContainer;
            }
            if (rp._wvOrigIsContainerOpen) {
                delete rp.isContainerOpen;
                delete rp._wvOrigIsContainerOpen;
            }
            if (rp._wvOrigIsContainerEmpty) {
                delete rp.isContainerEmpty;
                delete rp._wvOrigIsContainerEmpty;
            }
            if (rp._wvOrigToggleOpenState) {
                delete rp.toggleOpenState;
                delete rp._wvOrigToggleOpenState;
            }
            if (rp._wvOrigExpandRows) {
                delete rp.expandRows;
                delete rp._wvOrigExpandRows;
            }
            if (rp._wvOrigCollapseRows) {
                delete rp.collapseRows;
                delete rp._wvOrigCollapseRows;
            }
            if (rp._wvOrigExpandAllRows) {
                delete rp.expandAllRows;
                delete rp._wvOrigExpandAllRows;
            }
            if (rp._wvOrigCollapseAllRows) {
                delete rp.collapseAllRows;
                delete rp._wvOrigCollapseAllRows;
            }
            delete rp._wvFilterSelfCall;
        } catch (e) {
            Zotero.debug("[Weavero][filter] _pauseFilterPatches err: " + e);
        }
    }

    /** Patch `isSelectable(idx, selectAll)` so the bottom Selection
     *  Target ticks gate Ctrl+A. Two patch sites:
     *
     *    1. `itemsView.isSelectable` — overrides the instance
     *       method so any FUTURE `this.isSelectable.bind(this)` in
     *       upstream's `itemTree.jsx::render()` (line 1383) captures
     *       our wrapper and the bound prop honours the gate after
     *       the next render.
     *    2. `itemsView.tree.props.isSelectable` — replaces the
     *       LIVE bound prop on the already-rendered
     *       virtualized-table so Ctrl+A works immediately, before
     *       any re-render happens.
     *
     *  The virtualized-table reads `this._tree.props.isSelectable`
     *  on every select-all (`virtualized-table.jsx:182, 570, …`),
     *  so the prop replacement is what makes Ctrl+A actually skip
     *  rows. The instance-method patch is the durable fallback
     *  that keeps things working across React re-renders.
     *
     *  Returns `false` from the wrapper only when `selectAll` is
     *  true AND the row's kind is unticked — individual clicks
     *  still go through `orig`. Idempotent. */
    _patchIsSelectable() {
        try {
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (!itemsView) return;
            const self = this;
            const gateFn = (orig) => function (index, selectAll) {
                if (selectAll) {
                    const tgt = self._filterState
                        && self._filterState.selectionTarget;
                    const allOn = !tgt
                        || (tgt.parent && tgt.attachment && tgt.annotation);
                    if (!allOn) {
                        let row = null;
                        try { row = itemsView.getRow(index); } catch (e) {}
                        const item = row && row.ref;
                        if (item) {
                            const isAnn = !!(item.isAnnotation && item.isAnnotation());
                            const isAtt = !isAnn
                                && !!(item.isAttachment && item.isAttachment());
                            const isParent = !isAnn && !isAtt;
                            const inTarget = (isAnn && tgt.annotation)
                                || (isAtt && tgt.attachment)
                                || (isParent && tgt.parent);
                            if (!inTarget) return false;
                        }
                    }
                }
                return orig.call(this, index, selectAll);
            };
            // Patch 1 — instance method (durable across re-renders).
            if (!itemsView._wvIsSelectableOrig) {
                const orig = itemsView.isSelectable.bind(itemsView);
                itemsView._wvIsSelectableOrig = orig;
                itemsView.isSelectable = gateFn(orig);
            }
            // Patch 2 — live prop on the already-rendered table.
            // React replaces `props` on every re-render, so we tag
            // the WRAPPED FUNCTION (not the props object) and skip
            // re-patching only if the current prop already IS our
            // wrapper. This way fresh-prop renders get re-patched.
            const vTable = itemsView.tree;
            if (vTable && vTable.props) {
                const propOrig = vTable.props.isSelectable;
                if (typeof propOrig === "function" && !propOrig._wvWrapped) {
                    try {
                        const wrapped = gateFn(propOrig);
                        wrapped._wvWrapped = true;
                        vTable.props.isSelectable = wrapped;
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero] _patchIsSelectable: prop write blocked: " + e);
                    }
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _patchIsSelectable err: " + e);
        }
    }

    /** Walk visible items-tree rows and toggle `.wv-not-target` based
     *  on the row's kind vs `_filterState.selectionTarget`. Together
     *  with the CSS rule on `.wv-not-target:not(.selected)` and the
     *  `isSelectable` patch (see `_patchIsSelectable`), this
     *  reproduces Zotero's quick-search context-row behaviour:
     *  unticked kinds are dimmed AND skipped by Ctrl+A select-all. */
    _applySelectionTargetVisuals() {
        try {
            // Re-attempt the isSelectable prop-patch on every paint —
            // React replaces props on each re-render, so a single
            // patch at init can be wiped. Idempotent.
            try { this._patchIsSelectable(); } catch (e) {}
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const tree = doc.getElementById("item-tree-main")
                || doc.getElementById("item-tree-main-default");
            if (!tree) return;
            const tgt = (this._filterState && this._filterState.selectionTarget) || {};
            const exc = (this._filterState && this._filterState.selectionTargetExclude) || {};
            const incCount = (tgt.parent ? 1 : 0)
                + (tgt.attachment ? 1 : 0)
                + (tgt.annotation ? 1 : 0);
            const excCount = (exc.parent ? 1 : 0)
                + (exc.attachment ? 1 : 0)
                + (exc.annotation ? 1 : 0);
            const noFilter = (incCount === 0 && excCount === 0);
            const rows = tree.querySelectorAll(".row");
            for (const row of rows) {
                if (noFilter) {
                    row.classList.remove("wv-not-target");
                    continue;
                }
                const item = this._getItemFromTreeRow(row);
                if (!item) {
                    row.classList.remove("wv-not-target");
                    continue;
                }
                const isAnn = !!(item.isAnnotation && item.isAnnotation());
                const isAtt = !isAnn
                    && !!(item.isAttachment && item.isAttachment());
                const isParent = !isAnn && !isAtt;
                const kind = isAnn ? "annotation" : isAtt ? "attachment" : "parent";
                // Empty include set → all kinds pass the include test.
                const passesInc = (incCount === 0) || !!tgt[kind];
                const passesExc = !exc[kind];
                const inTarget = passesInc && passesExc;
                row.classList.toggle("wv-not-target", !inTarget);
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
            const cells = itemsTree.querySelectorAll(
                ".row .cell.addedBy");
            const colorOn = this._getEnableAddedByColors();
            const NS_HTML = "http://www.w3.org/1999/xhtml";
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
                const span = doc.createElementNS(NS_HTML, "span");
                span.className = "wv-added-by-pill";
                span.textContent = name;
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
            const r = view.getRow(index);
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
            const annKey = Zotero.ItemTreeManager.registerColumn({
                dataKey: "weaveroAnnotations",
                label: "Annotations",
                pluginID: "weavero@mjthoraval",
                iconPath: "chrome://zotero/skin/16/universal/annotate-highlight.svg",
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
            });
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

            const tagsKey = Zotero.ItemTreeManager.registerColumn({
                dataKey: "weaveroTags",
                label: "Tags",
                pluginID: "weavero@mjthoraval",
                iconPath: "chrome://zotero/skin/16/universal/tag.svg",
                width: "44",
                minWidth: 30,
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
                            const row = itemsView.getRow(index);
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
                    let showAuto = true;
                    try {
                        const v = Zotero.Prefs.get(
                            "weavero.enableTagsCountAuto");
                        if (typeof v === "boolean") showAuto = v;
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

            const relKey = Zotero.ItemTreeManager.registerColumn({
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
                                const row = itemsView.getRow(index);
                                const item = row && row.ref;
                                display = (item && item.relatedItems
                                    && item.relatedItems.length) || 0;
                            }
                        }
                    } catch (e) {}
                    span.textContent = (display > 0) ? String(display) : "";
                    return span;
                },
            });
            if (relKey) this._weaveroColumnKeys.push(relKey);

            // No Added By column — Zotero already ships an `addedBy`
            // column that's auto-enabled in group libraries (see
            // upstream itemTreeColumns.jsx:378). Annotation rows
            // render as a single line via AnnotationItemTreeRow, not
            // per-column cells, so a column wouldn't help anyway.
            // We surface the annotation's "added by" by patching the
            // annotation row renderer (see `_ensureAnnotationRowPatched`).

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
    _updateTruncationFlags() {
        const doc = Zotero.getMainWindow().document;
        const cells = doc.querySelectorAll(
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

    _setupTreeClickDelegate() {
        const doc  = Zotero.getMainWindow().document;
        const win  = Zotero.getMainWindow();

        // Initial mark pass
        this._markCellLinks();

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
            this._treeMarkObserver = new win.MutationObserver(() => {
                try { this._markCellLinks(); }
                catch(e) { Zotero.debug("[Weavero] tree mark error: " + e); }
            });
            this._treeMarkObserver.observe(tree,
                { childList: true, subtree: true, characterData: true });
        } else {
            win.setTimeout(() => this._setupTreeClickDelegate(), 1000);
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
        const treeXul = doc.getElementById("item-tree-main")
            || doc.getElementById("item-tree-main-default");
        if (treeXul && !treeXul._wvUrlTitleListener) {
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
            treeXul.addEventListener("mouseover", restore);
            treeXul._wvUrlTitleListener = restore;
        }

        // Right-click "Copy Link" menu for URL spans. Same pattern as
        // the tooltip widget — DOM-rendered menu attached to
        // documentElement, shown on contextmenu over a `.wv-url-span`
        // or `.wv-link` element. Suppresses Zotero's own row context
        // menu so the user gets just the link-relevant action.
        if (!this._urlMenuState) {
            const ms = { el: null, url: "" };
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
                if (ms.el && ms.el.contains(e.target)) return;
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
                    for (const f of doc.querySelectorAll("iframe")) {
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
        this._treeClickHandler = (e) => {
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
            const recentlyHandled = (Date.now() - this._lastHandledTime) < 600;
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
        this._lastHandledTime = 0;
        this._treeMouseDownHandler = (e) => {
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
            this._lastHandledTime = Date.now();

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
        doc.addEventListener("mousedown", this._treeMouseDownHandler, true);

        // Also block the corresponding click so it can't re-trigger or focus
        this._treeMouseUpHandler = (e) => {
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
            if (Date.now() - this._lastHandledTime < 600) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        doc.addEventListener("mouseup", this._treeMouseUpHandler, true);

        doc.addEventListener("click", this._treeClickHandler, true);

        // Window resize → re-evaluate truncation flags so the fallback icon
        // toggles when the user widens/narrows the items column.
        this._resizeHandler = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = win.setTimeout(() => {
                try { this._updateTruncationFlags(); }
                catch(e) { Zotero.debug("[Weavero] resize truncation error: " + e); }
            }, 120);
        };
        win.addEventListener("resize", this._resizeHandler);

        Zotero.debug("[Weavero] tree mousedown/click delegates attached (document capture)");
    }

    _teardownTreeClickDelegate() {
        try {
            const doc = Zotero.getMainWindow().document;
            const win = Zotero.getMainWindow();
            doc.removeEventListener("click", this._treeClickHandler, true);
            doc.removeEventListener("mousedown", this._treeMouseDownHandler, true);
            doc.removeEventListener("mouseup", this._treeMouseUpHandler, true);
            if (this._resizeHandler) win.removeEventListener("resize", this._resizeHandler);
            clearTimeout(this._resizeTimer);
            if (this._treeMarkObserver) this._treeMarkObserver.disconnect();
            clearTimeout(this._treeMarkTimer);
        } catch(e) {}
        this._treeClickHandler     = null;
        this._treeMouseDownHandler = null;
        this._treeMouseUpHandler   = null;
        this._resizeHandler        = null;
        this._resizeTimer          = null;
        this._treeMarkObserver     = null;
        this._treeMarkTimer        = null;
    }

    // ---- Items-list filter dropdown -------------------------------------
    //
    // Linear-style filter chips above the items tree. v0 covers annotation
    // colour only; the structure is set up to extend with tag / has-comment
    // / etc. without rewriting.
    //
    // Filtering is post-render: we hide non-matching `.row` elements via a
    // CSS class. Zotero's virtualized table positions every row absolutely
    // (`top: <index>*<rowHeight>px`), so display:none drops the row from
    // layout without disturbing siblings — we get visual gaps instead of
    // a re-flowed list, but no integration with the data layer is needed.

    /** Zotero's eight standard annotation colours, in the same order
     *  the colour picker shows them. Sourced from upstream
     *  `chrome/content/zotero/xpcom/data/item.js`'s Annotation.colors. */
    _ANNOTATION_COLORS = [
        { value: "#ffd400", label: "Yellow" },
        { value: "#ff6666", label: "Red" },
        { value: "#5fb236", label: "Green" },
        { value: "#2ea8e5", label: "Blue" },
        { value: "#a28ae5", label: "Purple" },
        { value: "#e56eee", label: "Magenta" },
        { value: "#f19837", label: "Orange" },
        { value: "#aaaaaa", label: "Gray" },
    ];

    // Standard Zotero annotation types (see upstream
    // chrome/content/zotero/xpcom/data/item.js — `_annotationTypes`).
    // Glyph is a small marker shown in the chip / picker; label is what
    // the user sees.
    // Same SVGs the reader toolbar imports (see upstream
    // reader/src/common/components/toolbar.js — `annotate-*.svg`).
    // The `image` annotation type uses `annotate-area.svg` upstream;
    // we mirror that mapping. Icons are themed at render time via
    // CSS mask-image + currentColor so they follow text colour in
    // both dark and light themes.
    _ANNOTATION_TYPES = [
        { value: "highlight", label: "Highlight",
          icon: "chrome://zotero/skin/16/universal/annotate-highlight.svg" },
        { value: "underline", label: "Underline",
          icon: "chrome://zotero/skin/16/universal/annotate-underline.svg" },
        { value: "note",      label: "Note",
          icon: "chrome://zotero/skin/16/universal/annotate-note.svg" },
        { value: "image",     label: "Image",
          icon: "chrome://zotero/skin/16/universal/annotate-area.svg" },
        { value: "ink",       label: "Ink",
          icon: "chrome://zotero/skin/16/universal/annotate-ink.svg" },
        { value: "text",      label: "Text",
          icon: "chrome://zotero/skin/16/universal/annotate-text.svg" },
    ];

    // Attachment file kinds — values match `item.getItemTypeIconName(true)`
    // (camelCase, skipLinkMode=true). Notes are intentionally excluded
    // since Zotero handles them as their own row kind.
    _ATTACHMENT_FILE_TYPES = [
        { value: "attachmentPDF",      label: "PDF",
          icon: "chrome://zotero/skin/item-type/16/light/attachment-pdf.svg" },
        { value: "attachmentEPUB",     label: "EPUB",
          icon: "chrome://zotero/skin/item-type/16/light/attachment-epub.svg" },
        { value: "attachmentSnapshot", label: "Snapshot",
          icon: "chrome://zotero/skin/item-type/16/light/attachment-snapshot.svg" },
        { value: "attachmentImage",    label: "Image",
          icon: "chrome://zotero/skin/item-type/16/light/attachment-image.svg" },
        { value: "attachmentVideo",    label: "Video",
          icon: "chrome://zotero/skin/item-type/16/light/attachment-video.svg" },
        { value: "attachmentWebLink",  label: "Web Link",
          icon: "chrome://zotero/skin/item-type/16/light/attachment-web-link.svg" },
        { value: "attachmentFile",     label: "Other File",
          icon: "chrome://zotero/skin/item-type/16/light/attachment-link.svg" },
    ];

    /** Empty filter group — one AND-combination of fields. The
     *  top-level `_filterState` is `{ groups: [...] }` where each
     *  group has this shape. Groups are OR'd at the top level. */
    _emptyFilterGroup() {
        return {
            // Annotation-scope (kept on annotation rows directly).
            // For the icon-grid facets (`annotationColor`, `annotationType`,
            // `attachmentFileType`), a parallel `*Exclude` array carries
            // the Alt+click negative-selection set. The two arrays are
            // mutually exclusive per value: setting one state clears the
            // other.
            annotationColor: [],
            annotationColorExclude: [],
            annotationType: [],
            annotationTypeExclude: [],
            annotationHasComment: null,
            annotationTag: [],
            annotationTagExclude: [],
            annotationAuthor: [],
            annotationAuthorExclude: [],
            // Parent metadata type (book / journalArticle / webpage /
            // …) — applies to regular items only.
            itemType: [],
            itemTypeExclude: [],
            // `attachmentFileType` narrows attachments by file kind
            // (PDF / EPUB / Snapshot / Image / Video / Web Link /
            // Other File). Notes are excluded — Zotero handles those
            // separately. Multi-select.
            attachmentFileType: [],
            attachmentFileTypeExclude: [],
            addedBy: [],
            addedByExclude: [],
            // Per-row-kind scope for the addedBy filter — checked
            // only when `addedBy` is non-empty. Defaults to all-on
            // so a freshly added Added By filter behaves the same
            // as before this scope option existed.
            addedByScope: {
                topLevel: true,
                attachments: true,
                annotations: true,
            },
            // Cross-level filters — applied to every row kind
            // (parent / attachment / annotation) the same way.
            // Tri-state like `annotationHasComment`:
            //   null  → off
            //   true  → must have the property
            //   false → must NOT have the property (alt+click)
            hasRelated: null,
            hasLink: null,
            hasTag: null,
            // Per-filter row-kind scope for the three cross-level
            // tri-states. Default all-on = current behavior (filter
            // applies to every kind). Each key maps to a row kind:
            //   annotation = annotation rows
            //   attachment = attachment rows + item notes (notes
            //                 attached to a regular item — same
            //                 tree level)
            //   parent     = regular items + standalone notes
            //                 (top-level rows)
            // Unchecking a kind makes the filter relax through for
            // that kind (the row passes regardless of the property).
            hasRelatedScope: { annotation: true, attachment: true, parent: true },
            // Has Link's scope keys are text-source-specific rather
            // than row-kind-generic, since URL detection only makes
            // sense in three text fields:
            //   annotationComment → annotation.annotationComment
            //   itemNoteText      → note body, child notes
            //   standaloneText    → note body, top-level notes
            // Other row kinds (attachment, regular item) never
            // satisfy Has Link and aren't surfaced in the scope.
            hasLinkScope: {
                annotationComment: true,
                itemNoteText: true,
                standaloneText: true,
            },
            hasTagScope: { annotation: true, attachment: true, parent: true },
            // Note-kind defining tri-states. Strict per-row.
            // (Zotero's UI calls notes attached to a regular item
            // "Item Notes" — `itemNote=true` matches those.)
            //   itemNote=true        → row must be a note attached
            //                          to a regular item
            //   standaloneNote=true  → row must be a top-level
            //                          (parentless) note
            // exclude variants reject those rows.
            itemNote: null,
            standaloneNote: null,
            // Parent-targeting tri-state filters (regular items
            // only; non-regulars relax through). Each is `null /
            // true / false` for off / include / exclude.
            hasAbstract: null,
            hasDOI: null,
            hasURL: null,
            hasAttachment: null,
            // Attachment-targeting tri-state — file attachments only.
            hasAnnotations: null,
            // Publication multi-select (parent items only). State
            // shape mirrors Tag / Author / Added By: parallel
            // include + exclude arrays of titles.
            publication: [],
            publicationExclude: [],
        };
    }

    /** Returns true iff at least one field in the group is set. */
    _isGroupActive(group) {
        if (!group) return false;
        if (group.annotationColor && group.annotationColor.length) return true;
        if (group.annotationColorExclude && group.annotationColorExclude.length) return true;
        if (group.annotationType && group.annotationType.length) return true;
        if (group.annotationTypeExclude && group.annotationTypeExclude.length) return true;
        if (group.annotationHasComment != null) return true;
        if (group.annotationTag && group.annotationTag.length) return true;
        if (group.annotationTagExclude && group.annotationTagExclude.length) return true;
        if (group.annotationAuthor && group.annotationAuthor.length) return true;
        if (group.annotationAuthorExclude && group.annotationAuthorExclude.length) return true;
        if (group.itemType && group.itemType.length) return true;
        if (group.itemTypeExclude && group.itemTypeExclude.length) return true;
        if (group.attachmentFileType && group.attachmentFileType.length) return true;
        if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) return true;
        if (group.addedBy && group.addedBy.length) return true;
        if (group.addedByExclude && group.addedByExclude.length) return true;
        if (group.hasRelated != null) return true;
        if (group.hasLink != null) return true;
        if (group.hasTag != null) return true;
        if (group.itemNote != null) return true;
        if (group.standaloneNote != null) return true;
        if (group.hasAbstract != null) return true;
        if (group.hasDOI != null) return true;
        if (group.hasURL != null) return true;
        if (group.hasAttachment != null) return true;
        if (group.hasAnnotations != null) return true;
        if (group.publication && group.publication.length) return true;
        if (group.publicationExclude && group.publicationExclude.length) return true;
        return false;
    }

    /** Returns true iff any group has any active condition or any
     *  global filter (Collection / Saved Search) is set. */
    _isFilterActive(state) {
        if (!state) return false;
        if (state.collections && state.collections.length) return true;
        if (state.collectionsExclude && state.collectionsExclude.length) return true;
        if (state.savedSearches && state.savedSearches.length) return true;
        if (state.savedSearchesExclude && state.savedSearchesExclude.length) return true;
        if (!state.groups) return false;
        return state.groups.some(g => this._isGroupActive(g));
    }

    /** True iff the row passes the GLOBAL filters at the bottom of
     *  the panel: Collection membership and Saved Search match.
     *  Both are OR within (any of the selected collections /
     *  searches matches), AND across the two filters. Empty filter
     *  → trivially passes. Annotations/attachments inherit their
     *  enclosing regular item's collection membership for the
     *  purpose of this check (so collection-filtering keeps
     *  whole subtrees together). */
    _rowPassesGlobalFilters(item, state) {
        if (!item || !state) return true;
        const owner = (item.isRegularItem && item.isRegularItem())
            ? item
            : this._getEnclosingRegularItem(item);
        const itemCols = owner && owner.getCollections
            ? owner.getCollections()
            : [];
        if (state.collections && state.collections.length) {
            const has = itemCols.some(id => state.collections.includes(id));
            if (!has) return false;
        }
        if (state.collectionsExclude && state.collectionsExclude.length) {
            const inExc = itemCols.some(
                id => state.collectionsExclude.includes(id));
            if (inExc) return false;
        }
        if ((state.savedSearches && state.savedSearches.length)
            || (state.savedSearchesExclude && state.savedSearchesExclude.length)) {
            const candidate = owner ? owner.id : item.id;
            if (state.savedSearches && state.savedSearches.length) {
                const idSet = this._savedSearchResults;
                if (!idSet) return false; // not yet computed
                if (!idSet.has(candidate)) return false;
            }
            if (state.savedSearchesExclude && state.savedSearchesExclude.length) {
                const exSet = this._savedSearchExcludeResults;
                if (!exSet) return false; // not yet computed
                if (exSet.has(candidate)) return false;
            }
        }
        return true;
    }

    /** Convenience: the group new chips / section toggles target. */
    _activeGroup() {
        const s = this._filterState;
        if (!s || !s.groups || !s.groups.length) return null;
        const i = Math.max(0,
            Math.min(s.activeGroupIndex || 0, s.groups.length - 1));
        return s.groups[i];
    }

    /** Walk parents until we find a regular item (book, article, …).
     *  Annotations live under attachments, attachments under regular
     *  items — the regular item is what carries author/type/etc. */
    _getEnclosingRegularItem(item) {
        if (!item) return null;
        if (item.isRegularItem && item.isRegularItem()) return item;
        if (item.parentItemID) {
            const p = Zotero.Items.get(item.parentItemID);
            if (p) return this._getEnclosingRegularItem(p);
        }
        return null;
    }

    /** Annotation author name — uses `annotationAuthorName` for users
     *  without a registered Zotero account, falling back to
     *  `Zotero.Users.getName(createdByUserID)` for users with an
     *  account, and "(local)" for the local user (no createdByUserID). */
    _getAnnotationAuthor(ann) {
        try {
            if (ann.annotationAuthorName) return ann.annotationAuthorName;
            const uid = ann.createdByUserID;
            if (uid != null && Zotero.Users && Zotero.Users.getName) {
                const n = Zotero.Users.getName(uid);
                if (n) return n;
            }
        } catch (e) {}
        return "(local)";
    }

    /** User name for the group-library member who added this item.
     *  Annotations carry the same `createdByUserID` field — for
     *  group annotations this is who drew the highlight. Returns
     *  empty string when the field isn't set (typical for items in
     *  the user's own library). */
    _getItemAddedBy(item) {
        if (!item) return "";
        try {
            const uid = item.createdByUserID;
            if (uid != null && uid !== false && Zotero.Users
                && Zotero.Users.getName) {
                const n = Zotero.Users.getName(uid);
                if (n) return n;
            }
        } catch (e) {}
        return "";
    }

    /** Read `data-wv-added-by` / `data-wv-added-by-color` from the
     *  comment cell and append a fresh badge as the cell's last
     *  child. Called both from the renderRow patch (initial) and
     *  from `_markCellLinks` after the cell is wiped + rebuilt with
     *  `.wv-text-wrap` and `.wv-tree-icon`. The badge ends up after
     *  `.wv-text-wrap` and before any later-inserted right-edge
     *  icons (related icon etc.). Idempotent — removes any prior
     *  `.wv-annotation-added-by` first. */
    _appendAddedByBadgeFromCell(cell) {
        if (!cell) return;
        const name = cell.getAttribute("data-wv-added-by");
        if (!name) return;
        const old = cell.querySelector(":scope > .wv-annotation-added-by");
        if (old) old.remove();
        const colour = cell.getAttribute("data-wv-added-by-color");
        const doc = cell.ownerDocument;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const badge = doc.createElementNS(NS_HTML, "span");
        badge.className = "wv-annotation-added-by";
        badge.textContent = name;
        badge.title = "Added by " + name;
        if (colour && this._getEnableAddedByColors()) {
            badge.style.color = colour;
            badge.style.backgroundColor = this._withAlpha(colour, 0.18);
        }
        // Insert before any link-icon (.wv-tree-icon for the URL
        // chain) or related-icon (.wv-tree-rel-icon for the
        // relations badge) so the order ends as
        // [text] [badge] [link icon] [relations icon]. Otherwise
        // append at the end of the cell — any later-arriving icon
        // (added by _markCellLinks / _decorateAnnotationRowRelations)
        // appends after the badge naturally.
        const icon = cell.querySelector(
            ":scope > .wv-tree-icon, :scope > .wv-tree-rel-icon");
        if (icon) icon.before(badge);
        else cell.appendChild(badge);
    }

    /** Fallback for annotation types with no `.annotation-comment`
     *  cell (image / ink / type-name placeholder). Insert the badge
     *  as a sibling right after the title cell. */
    _appendAddedByBadgeAfterTitle(rowDiv, name) {
        if (!rowDiv || !name) return;
        const old = rowDiv.querySelector(":scope > .wv-annotation-added-by");
        if (old) old.remove();
        const doc = rowDiv.ownerDocument;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const badge = doc.createElementNS(NS_HTML, "span");
        badge.className = "wv-annotation-added-by";
        badge.textContent = name;
        badge.title = "Added by " + name;
        if (this._getEnableAddedByColors()) {
            const colour = this._colorForUser(name);
            badge.style.color = colour;
            badge.style.backgroundColor = this._withAlpha(colour, 0.18);
        }
        const title = rowDiv.querySelector(":scope > .cell.title");
        if (title) title.after(badge);
        else rowDiv.appendChild(badge);
    }

    /** Stable per-user accent colour. Hashes the user name to an
     *  index into a small palette so each user always gets the same
     *  colour (and different users get visually distinct ones).
     *  Palette mirrors Zotero's annotation/tag colours so the
     *  badges feel native. */
    _colorForUser(name) {
        const palette = [
            "#5e6ad2", // indigo
            "#2ea8e5", // azure
            "#5fb236", // green
            "#a28ae5", // purple
            "#e56eee", // magenta
            "#f19837", // orange
            "#ff6666", // red
            "#aaaaaa", // gray
        ];
        if (!name) return palette[0];
        let h = 0;
        for (let i = 0; i < name.length; i++) {
            h = ((h * 31) + name.charCodeAt(i)) | 0;
        }
        return palette[Math.abs(h) % palette.length];
    }

    /** Convert a #rrggbb hex colour + 0..1 alpha into an `rgba(...)`
     *  string. Used to derive a tinted badge background from the
     *  text colour without hand-defining a separate per-user
     *  background palette. */
    _withAlpha(hex, alpha) {
        if (!hex || hex[0] !== "#" || hex.length !== 7) return hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }

    /** Patch `AnnotationItemTreeRow.renderRow` (upstream
     *  itemTreeRow.js:510) so an "added-by" badge appears at the
     *  end of the annotation's row content. Annotation rows are
     *  rendered as a single line (icon + text + comment), not split
     *  into per-column cells, so a column-based approach doesn't
     *  surface this info. The class isn't on Zotero global — find
     *  its prototype via the first existing annotation row in the
     *  active items view, then monkey-patch. Idempotent. */
    _ensureAnnotationRowPatched() {
        if (this._annotationRowPatched) return;
        const win = Zotero.getMainWindow();
        const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
        const rp = itemsView && itemsView.rowProvider;
        if (!rp || !rp._rows) return;
        let annRow = null;
        for (const r of rp._rows) {
            if (r && r.type === "annotation") { annRow = r; break; }
        }
        if (!annRow) return;
        const proto = Object.getPrototypeOf(annRow);
        if (!proto || typeof proto.renderRow !== "function") return;
        if (proto._wvRenderRowOrig) {
            this._annotationRowPatched = proto;
            return;
        }
        const origRender = proto.renderRow;
        proto._wvRenderRowOrig = origRender;
        const self = this;
        proto.renderRow = function (div, index, columns, rowData, renderCtx) {
            origRender.call(this, div, index, columns, rowData, renderCtx);
            try {
                if (!self._getEnableAnnotationAddedBy()) return;
                const ann = this.ref;
                const addedBy = self._getItemAddedBy(ann);
                if (!addedBy) return;
                // Three layouts:
                //   1. highlight / underline WITH comment — separate
                //      `.cell.annotation-comment` exists; badge goes
                //      inside the comment cell.
                //   2. highlight / underline WITHOUT comment — only
                //      `.cell.title` exists, holding the highlighted
                //      text wrapped in quotation marks via CSS
                //      pseudo-elements (`q-mark-close` on the title
                //      renders the closing quote ::after the cell).
                //      Badge must sit OUTSIDE the title cell as a
                //      row sibling, otherwise it lands BEFORE the
                //      closing quote and reads as "inside the
                //      highlighted text".
                //   3. note / text / image / ink — title cell holds
                //      the comment / type-name. Badge goes inside
                //      the title cell, before any link / rel icon.
                const commentCell = div.querySelector(".cell.annotation-comment");
                if (commentCell) {
                    commentCell.setAttribute("data-wv-added-by", addedBy);
                    commentCell.setAttribute("data-wv-added-by-color",
                        self._colorForUser(addedBy));
                    self._appendAddedByBadgeFromCell(commentCell);
                    return;
                }
                const isQuoted = ["highlight", "underline"]
                    .includes(ann.annotationType);
                if (isQuoted) {
                    self._appendAddedByBadgeAfterTitle(div, addedBy);
                    return;
                }
                const titleCell = div.querySelector(".cell.title");
                if (!titleCell) return;
                titleCell.setAttribute("data-wv-added-by", addedBy);
                titleCell.setAttribute("data-wv-added-by-color",
                    self._colorForUser(addedBy));
                self._appendAddedByBadgeFromCell(titleCell);
            } catch (e) {
                Zotero.debug("[Weavero] annotation row badge err: " + e);
            }
        };
        this._annotationRowPatched = proto;
        // Force a re-render of currently visible annotation rows so
        // the badge appears immediately rather than waiting for the
        // next data event.
        try { itemsView.tree && itemsView.tree.invalidate(); } catch (e) {}
    }

    _unpatchAnnotationRow() {
        const proto = this._annotationRowPatched;
        if (proto && proto._wvRenderRowOrig) {
            try { proto.renderRow = proto._wvRenderRowOrig; } catch (e) {}
            try { delete proto._wvRenderRowOrig; } catch (e) {}
        }
        this._annotationRowPatched = null;
    }

    /** All author names associated with `item`. For annotations: the
     *  annotation author (group-library user). For other items: the
     *  item's creators (authors), formatted as "First Last". */
    _getItemAuthors(item) {
        const out = [];
        if (!item) return out;
        try {
            if (item.isAnnotation && item.isAnnotation()) {
                // Annotations don't have item creators — fall back to
                // the annotation author (the group-library user who
                // drew the highlight).
                out.push(this._getAnnotationAuthor(item));
                return out;
            }
            const creators = (item.getCreators && item.getCreators()) || [];
            for (const c of creators) {
                const name = c.name
                    || ((c.firstName || "") + " " + (c.lastName || "")).trim();
                if (name) out.push(name);
            }
        } catch (e) {}
        return out;
    }

    /** Per-row filter check against a single group. Filters that
     *  target a specific kind (annotationColor, attachmentFileType,
     *  itemType) DON'T fail rows of other kinds — they simply skip.
     *  Cross-kind JOIN constraints are enforced by
     *  `_rowSatisfiesTreeJoin`; "did this row hit on its own kind?"
     *  is handled by `_rowHasOwnKindMatch`. Universal filters (tag,
     *  author, addedBy with the row in scope) apply to every row. */
    _rowPassesFilters(item, group, opts) {
        if (!item || !group) return false;
        opts = opts || {};

        // Kind-specific filters now use a TREE-JOIN model: filters
        // that target a kind don't fail rows of OTHER kinds — they
        // simply don't apply. This lets `annotationColor=yellow`
        // and `attachmentFileType=PDF` co-exist (the yellow
        // annotation passes the relaxed attachmentFileType, and
        // the PDF attachment passes the relaxed annotationColor).
        // The cross-kind JOIN constraint is then enforced separately
        // by `_rowSatisfiesTreeJoin` (the tree must contain a
        // matching row at every kind a filter targets).
        if (group.itemType && group.itemType.length) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && !group.itemType.includes(item.itemType)) {
                return false;
            }
        }
        if (group.itemTypeExclude && group.itemTypeExclude.length) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && group.itemTypeExclude.includes(item.itemType)) {
                return false;
            }
        }
        if (group.attachmentFileType && group.attachmentFileType.length) {
            const isAtt = !!(item.isAttachment && item.isAttachment());
            if (isAtt) {
                const kind = (item.getItemTypeIconName
                    && item.getItemTypeIconName(true)) || "";
                if (!group.attachmentFileType.includes(kind)) return false;
            }
        }
        if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) {
            const isAtt = !!(item.isAttachment && item.isAttachment());
            if (isAtt) {
                const kind = (item.getItemTypeIconName
                    && item.getItemTypeIconName(true)) || "";
                if (group.attachmentFileTypeExclude.includes(kind)) return false;
            }
        }
        if (group.annotationColor && group.annotationColor.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && !group.annotationColor.includes(item.annotationColor)) {
                return false;
            }
        }
        if (group.annotationColorExclude && group.annotationColorExclude.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && group.annotationColorExclude.includes(item.annotationColor)) {
                return false;
            }
        }
        if (group.annotationType && group.annotationType.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && !group.annotationType.includes(item.annotationType)) {
                return false;
            }
        }
        if (group.annotationTypeExclude && group.annotationTypeExclude.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && group.annotationTypeExclude.includes(item.annotationType)) {
                return false;
            }
        }
        if (group.annotationHasComment != null) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn) {
                const txt = item.annotationComment;
                const hasComment = !!(txt && String(txt).trim().length);
                if (hasComment !== group.annotationHasComment) return false;
            }
        }
        // Cross-level checks — apply to every row kind, strict
        // per-row matching. Each item is evaluated independently;
        // descendants of a matching parent are NOT auto-kept by
        // virtue of the parent matching (so picking Has Related
        // on a parent only shows the parent + the cascade-required
        // ancestors, not the parent's full subtree). Ancestor-keep
        // for tree shape happens via `_hasMatchingAnnotation` in
        // the apply loop, which is what brings the parent in when
        // a descendant matches.
        // Cross-level filters honour their per-kind scope: a row
        // whose kind has its scope flag OFF relaxes through (the
        // filter doesn't apply at that level). `_rowKindOf` maps
        // every row to one of {annotation, attachment, parent};
        // anything else (e.g. unknown kinds) trivially in scope.
        const inScope = (scopeObj, kind) =>
            !scopeObj || !kind || scopeObj[kind] !== false;
        if (group.hasRelated != null) {
            const k = this._rowKindOf(item);
            if (inScope(group.hasRelatedScope, k)) {
                const rels = (item.relatedItems && item.relatedItems.length) || 0;
                if ((rels > 0) !== group.hasRelated) return false;
            }
        }
        if (group.hasLink != null) {
            // Has Link's scope keys are text-source-specific
            // (annotationComment / itemNoteText / standaloneText).
            // Rows that aren't one of those text sources fall
            // outside Has Link's universe entirely → trivially pass.
            const sk = this._hasLinkScopeKeyOf(item);
            if (sk) {
                const sc = group.hasLinkScope;
                if (!sc || sc[sk] !== false) {
                    const has = this._itemHasLinks(item);
                    if (has !== group.hasLink) return false;
                }
            }
        }
        if (group.hasTag != null) {
            const k = this._rowKindOf(item);
            if (inScope(group.hasTagScope, k)) {
                const tags = (item.getTags && item.getTags()) || [];
                const has = tags.length > 0;
                if (has !== group.hasTag) return false;
            }
        }
        // Note-kind defining filters. Strict per-row check: when
        // include is set, ONLY note items of the requested sub-kind
        // pass; everything else fails. Exclude rejects the matching
        // sub-kind. The cascade still keeps ancestors of the few
        // notes that match (item notes pull in their parent regular
        // item) because `_hasMatchingAnnotation` walks `item.getNotes`
        // and returns true for any primary descendant.
        if (group.itemNote != null) {
            const isNote = !!(item.isNote && item.isNote());
            const isChild = isNote && !!item.parentItem;
            if (isChild !== group.itemNote) return false;
        }
        if (group.standaloneNote != null) {
            const isNote = !!(item.isNote && item.isNote());
            const isStandalone = isNote && !item.parentItem;
            if (isStandalone !== group.standaloneNote) return false;
        }
        // Parent-targeting "Has *" tri-states. Each one only fails
        // when the item IS a regular item and doesn't satisfy the
        // chosen direction. Non-regulars relax through (matches the
        // pattern used by `annotationHasComment` for non-annotations).
        if (group.hasAbstract != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const v = !!(item.getField
                    && String(item.getField("abstractNote") || "").trim().length);
                if (v !== group.hasAbstract) return false;
            }
        }
        if (group.hasDOI != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const v = !!(item.getField
                    && String(item.getField("DOI") || "").trim().length);
                if (v !== group.hasDOI) return false;
            }
        }
        if (group.hasURL != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const v = !!(item.getField
                    && String(item.getField("url") || "").trim().length);
                if (v !== group.hasURL) return false;
            }
        }
        if (group.hasAttachment != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const ids = (item.getAttachments && item.getAttachments()) || [];
                const v = ids.length > 0;
                if (v !== group.hasAttachment) return false;
            }
        }
        if (group.hasAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                const ids = item.getAnnotations() || [];
                const v = ids.length > 0;
                if (v !== group.hasAnnotations) return false;
            }
        }
        // Publication — regular items only.
        const wantedPub = group.publication;
        const wantedPubX = group.publicationExclude;
        if ((wantedPub && wantedPub.length)
            || (wantedPubX && wantedPubX.length)) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const pub = (item.getField
                    && item.getField("publicationTitle")) || "";
                if (wantedPub && wantedPub.length
                    && !wantedPub.includes(pub)) return false;
                if (wantedPubX && wantedPubX.length
                    && wantedPubX.includes(pub)) return false;
            }
        }
        const wantedTags = group.annotationTag;
        const wantedTagsX = group.annotationTagExclude;
        if ((wantedTags && wantedTags.length)
            || (wantedTagsX && wantedTagsX.length)) {
            const tags = (item.getTags && item.getTags()) || [];
            const names = tags.map(t => t && t.tag).filter(Boolean);
            if (wantedTags && wantedTags.length
                && !wantedTags.some(t => names.includes(t))) return false;
            if (wantedTagsX && wantedTagsX.length
                && wantedTagsX.some(t => names.includes(t))) return false;
        }
        const wantedAuthors = group.annotationAuthor;
        const wantedAuthorsX = group.annotationAuthorExclude;
        if ((wantedAuthors && wantedAuthors.length)
            || (wantedAuthorsX && wantedAuthorsX.length)) {
            const authors = this._getItemAuthors(item);
            if (wantedAuthors && wantedAuthors.length
                && !wantedAuthors.some(a => authors.includes(a))) return false;
            if (wantedAuthorsX && wantedAuthorsX.length
                && wantedAuthorsX.some(a => authors.includes(a))) return false;
        }
        const wantedAddedBy = group.addedBy;
        if (wantedAddedBy && wantedAddedBy.length) {
            // Row-kind scope: addedBy applies only to row kinds the
            // user opted into.
            //
            // Default mode (primary check, opts.relaxOutOfScopeAddedBy
            // is false): out-of-scope rows FAIL — they're never
            // primary by addedBy alone. They can still be kept by
            // ancestor-keep (`_hasMatchingAnnotation`) or by the
            // filtered subtree-keep below.
            //
            // Relaxed mode (opts.relaxOutOfScopeAddedBy is true):
            // out-of-scope rows AUTO-PASS — used during subtree-keep
            // so e.g. attachments under a primary top-level item
            // come along when the user said "addedBy applies to
            // top-level only".
            const scope = group.addedByScope || {
                topLevel: true, attachments: true, annotations: true,
            };
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            const isAttach = !isAnn
                && !!(item.isAttachment && item.isAttachment());
            const isTopLevel = !isAnn && !isAttach;
            const inScope = (isAnn && scope.annotations)
                || (isAttach && scope.attachments)
                || (isTopLevel && scope.topLevel);
            if (!inScope) {
                if (!opts.relaxOutOfScopeAddedBy) return false;
                // else: skip the addedBy check entirely.
            } else {
                const addedBy = this._getItemAddedBy(item);
                if (!addedBy || !wantedAddedBy.includes(addedBy)) return false;
            }
        }
        const wantedAddedByX = group.addedByExclude;
        if (wantedAddedByX && wantedAddedByX.length) {
            const scope = group.addedByScope || {
                topLevel: true, attachments: true, annotations: true,
            };
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            const isAttach = !isAnn
                && !!(item.isAttachment && item.isAttachment());
            const isTopLevel = !isAnn && !isAttach;
            const inScope = (isAnn && scope.annotations)
                || (isAttach && scope.attachments)
                || (isTopLevel && scope.topLevel);
            if (inScope) {
                const addedBy = this._getItemAddedBy(item);
                if (addedBy && wantedAddedByX.includes(addedBy)) return false;
            }
        }
        return true;
    }

    /** True iff `item` should be a primary kept match. ORs across
     *  the state's groups: the row passes if it satisfies ANY active
     *  group's AND-conjoined fields. */
    _rowIsPrimary(item, state) {
        if (!this._isFilterActive(state)) return false;
        if (!this._rowPassesGlobalFilters(item, state)) return false;
        // Global-only mode: when no per-section filter is set but
        // the global filters (Collection / Saved Search) are
        // restricted, every row that passes the global filters is
        // primary by virtue of those alone.
        const anyGroupActive = state.groups
            && state.groups.some(g => this._isGroupActive(g));
        if (!anyGroupActive) return true;
        // A row is primary iff:
        //   1. It satisfies the group's filters (kind-specific
        //      filters are RELAXED for non-target rows — see
        //      `_rowPassesFilters`).
        //   2. AT LEAST ONE filter in the group actually targets
        //      this row's kind AND matches. Without (2) every
        //      regular item would trivially pass when the only
        //      active filter is annotation-targeting (because the
        //      annotation filter relaxes for non-annotations) —
        //      we'd flood the result with unrelated parents.
        return state.groups.some(g => this._isGroupActive(g)
            && this._rowPassesFilters(item, g)
            && this._rowHasOwnKindMatch(item, g)
            && this._rowSatisfiesTreeJoin(item, g));
    }

    /** Tree-JOIN check: when filters in `group` target multiple
     *  kinds (e.g., annotationColor=yellow + attachmentFileType=PDF),
     *  only the path (parent ⊃ attachment ⊃ annotation) where each
     *  level matches its targeting filter is kept.
     *
     *  Concrete behaviours per active filter combination:
     *
     *  - Yellow only      → annotation: passes annOK; ancestor (att, reg)
     *                       trivially OK (no filter targets them).
     *  - PDF only         → attachment: passes attOK; reg trivially OK;
     *                       child annotations not constrained.
     *  - Yellow + PDF     → annotation: passes annOK AND parent
     *                       attachment passes attOK; PDF passes attOK
     *                       AND has a yellow ann child; reg has a PDF
     *                       child with a yellow ann child.
     *  - +itemType=book   → adds reg's filter to every level's check. */
    _rowSatisfiesTreeJoin(item, group) {
        if (!item || !group) return false;
        const annActive = (group.annotationColor && group.annotationColor.length)
            || (group.annotationColorExclude && group.annotationColorExclude.length)
            || (group.annotationType && group.annotationType.length)
            || (group.annotationTypeExclude && group.annotationTypeExclude.length)
            || group.annotationHasComment != null;
        const attActive = !!(
            (group.attachmentFileType && group.attachmentFileType.length)
            || (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length));
        const regActive = !!(
            (group.itemType && group.itemType.length)
            || (group.itemTypeExclude && group.itemTypeExclude.length));

        const isAnn = !!(item.isAnnotation && item.isAnnotation());
        const isAtt = !isAnn && !!(item.isAttachment && item.isAttachment());
        const isReg = !isAnn && !isAtt
            && !!(item.isRegularItem && item.isRegularItem());

        if (isAnn) {
            if (attActive) {
                const att = item.parentItem;
                if (!att || !this._kindOK(att, group, "attachment")) return false;
            }
            if (regActive) {
                const att = item.parentItem;
                const reg = att && att.parentItem;
                if (!reg || !this._kindOK(reg, group, "regular")) return false;
            }
            return true;
        }
        if (isAtt) {
            if (annActive) {
                // `item.getAnnotations` exists on every Item (it's on
                // the prototype) but THROWS unless the item is a file
                // attachment. Web-link / standalone-link attachments
                // hit this path with attachmentFileType + Has Related
                // active. Gate by `isFileAttachment` instead.
                const anns = (item.isFileAttachment && item.isFileAttachment())
                    ? (item.getAnnotations() || []) : [];
                let hasOK = false;
                for (const a of anns) {
                    if (this._kindOK(a, group, "annotation")) { hasOK = true; break; }
                }
                if (!hasOK) return false;
            }
            if (regActive) {
                const reg = item.parentItem;
                if (!reg || !this._kindOK(reg, group, "regular")) return false;
            }
            return true;
        }
        if (isReg) {
            if (attActive || annActive) {
                const attIds = (typeof item.getAttachments === "function")
                    ? (item.getAttachments() || []) : [];
                let hasOK = false;
                for (const aId of attIds) {
                    const att = Zotero.Items.get(aId);
                    if (!att) continue;
                    if (attActive && !this._kindOK(att, group, "attachment")) continue;
                    if (annActive) {
                        // Same `isFileAttachment` gate as the isAtt
                        // branch above — non-file attachments throw
                        // from getAnnotations.
                        const anns = (att.isFileAttachment && att.isFileAttachment())
                            ? (att.getAnnotations() || []) : [];
                        const someAnnOK = anns.some(
                            a => this._kindOK(a, group, "annotation"));
                        if (!someAnnOK) continue;
                    }
                    hasOK = true;
                    break;
                }
                if (!hasOK) return false;
            }
            return true;
        }
        // Notes — only kind left. Notes have no attachments and no
        // annotations of their own, so a group with annActive or
        // attActive set can never be satisfied by a note as
        // "primary at its kind". Without this, a note carrying a
        // matching cross-level filter (e.g. Has Related) AND a
        // kind-active filter (e.g. annotationType=Underline) would
        // wrongly pass tree-join because the fall-through `return
        // true` ignored the unsatisfiable kind constraint.
        const isNote = !!(item.isNote && item.isNote());
        if (isNote) {
            if (annActive || attActive) return false;
            if (regActive) {
                const reg = item.parentItem;
                if (!reg || !this._kindOK(reg, group, "regular")) return false;
            }
            return true;
        }
        return true;
    }

    /** Map an item to one of three "row kinds" used by the
     *  cross-level filter scope sub-filters.
     *  - "annotation" — annotation rows
     *  - "attachment" — attachment rows AND item notes (notes
     *                    attached to a regular item), since they
     *                    sit at the same tree level
     *  - "parent"     — regular items AND standalone notes
     *                    (top-level rows in the items tree)
     *  Returns `null` for anything else. */
    _rowKindOf(item) {
        if (!item) return null;
        if (item.isAnnotation && item.isAnnotation()) return "annotation";
        if (item.isAttachment && item.isAttachment()) return "attachment";
        if (item.isNote && item.isNote()) {
            return item.parentItem ? "attachment" : "parent";
        }
        if (item.isRegularItem && item.isRegularItem()) return "parent";
        return null;
    }

    /** Strict kind-specific check: returns true iff `item` is
     *  actually of `kind` AND passes all filters in `group` that
     *  target that kind. Used by `_rowSatisfiesTreeJoin`. */
    _kindOK(item, group, kind) {
        if (!item || !group) return false;
        if (kind === "annotation") {
            if (!(item.isAnnotation && item.isAnnotation())) return false;
            if (group.annotationColor && group.annotationColor.length
                && !group.annotationColor.includes(item.annotationColor)) return false;
            if (group.annotationColorExclude && group.annotationColorExclude.length
                && group.annotationColorExclude.includes(item.annotationColor)) return false;
            if (group.annotationType && group.annotationType.length
                && !group.annotationType.includes(item.annotationType)) return false;
            if (group.annotationTypeExclude && group.annotationTypeExclude.length
                && group.annotationTypeExclude.includes(item.annotationType)) return false;
            if (group.annotationHasComment != null) {
                const txt = item.annotationComment;
                const has = !!(txt && String(txt).trim().length);
                if (has !== group.annotationHasComment) return false;
            }
            return true;
        }
        if (kind === "attachment") {
            if (!(item.isAttachment && item.isAttachment())) return false;
            const k = (item.getItemTypeIconName
                && item.getItemTypeIconName(true)) || "";
            if (group.attachmentFileType && group.attachmentFileType.length
                && !group.attachmentFileType.includes(k)) return false;
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length
                && group.attachmentFileTypeExclude.includes(k)) return false;
            return true;
        }
        if (kind === "regular") {
            if (!(item.isRegularItem && item.isRegularItem())) return false;
            if (group.itemType && group.itemType.length
                && !group.itemType.includes(item.itemType)) return false;
            if (group.itemTypeExclude && group.itemTypeExclude.length
                && group.itemTypeExclude.includes(item.itemType)) return false;
            return true;
        }
        return false;
    }

    /** True iff at least one filter in `group` targets `item`'s
     *  kind AND matches. This is the "primary at its kind" check
     *  that distinguishes a row directly satisfying a kind-specific
     *  filter (→ primary) from one trivially passing because every
     *  applicable filter relaxed for its kind (→ ancestor only).
     *  Universal filters (Tag, Author, Added By with the row in
     *  scope) also count — picking a tag should make tagged rows
     *  primary regardless of kind. */
    _rowHasOwnKindMatch(item, group) {
        if (!item || !group) return false;
        const isAnn = !!(item.isAnnotation && item.isAnnotation());
        const isAtt = !isAnn
            && !!(item.isAttachment && item.isAttachment());
        const isNote = !isAnn && !isAtt
            && !!(item.isNote && item.isNote());
        const isReg = !isAnn && !isAtt && !isNote;

        // Annotation-targeting filters. Pure-exclude on a kind also
        // counts as a "kind match" — e.g. "exclude yellow" alone
        // should make every NON-yellow annotation primary.
        if (isAnn) {
            if (group.annotationColor && group.annotationColor.length
                && group.annotationColor.includes(item.annotationColor)) {
                return true;
            }
            if (group.annotationColorExclude && group.annotationColorExclude.length
                && !group.annotationColorExclude.includes(item.annotationColor)) {
                return true;
            }
            if (group.annotationType && group.annotationType.length
                && group.annotationType.includes(item.annotationType)) {
                return true;
            }
            if (group.annotationTypeExclude && group.annotationTypeExclude.length
                && !group.annotationTypeExclude.includes(item.annotationType)) {
                return true;
            }
            if (group.annotationHasComment != null) {
                const txt = item.annotationComment;
                const has = !!(txt && String(txt).trim().length);
                if (has === group.annotationHasComment) return true;
            }
        }

        // Attachment-targeting filter
        if (isAtt) {
            const kind = (item.getItemTypeIconName
                && item.getItemTypeIconName(true)) || "";
            if (group.attachmentFileType && group.attachmentFileType.length
                && group.attachmentFileType.includes(kind)) {
                return true;
            }
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length
                && !group.attachmentFileTypeExclude.includes(kind)) {
                return true;
            }
        }

        // Regular-targeting filters
        if (isReg) {
            if (group.itemType && group.itemType.length
                && group.itemType.includes(item.itemType)) {
                return true;
            }
            if (group.itemTypeExclude && group.itemTypeExclude.length
                && !group.itemTypeExclude.includes(item.itemType)) {
                return true;
            }
        }

        // Universal filters — apply to any row, count as
        // "kind match" when they pass. Both include AND exclude can
        // satisfy: "exclude tag X" alone makes every non-X-tagged row
        // primary, mirroring the icon-grid Alt+click behaviour.
        if ((group.annotationTag && group.annotationTag.length)
            || (group.annotationTagExclude && group.annotationTagExclude.length)) {
            const tags = (item.getTags && item.getTags()) || [];
            const names = tags.map(t => t && t.tag).filter(Boolean);
            if (group.annotationTag && group.annotationTag.length
                && group.annotationTag.some(t => names.includes(t))) {
                return true;
            }
            if (group.annotationTagExclude && group.annotationTagExclude.length
                && !group.annotationTagExclude.some(t => names.includes(t))) {
                return true;
            }
        }
        if ((group.annotationAuthor && group.annotationAuthor.length)
            || (group.annotationAuthorExclude && group.annotationAuthorExclude.length)) {
            const authors = this._getItemAuthors(item);
            if (group.annotationAuthor && group.annotationAuthor.length
                && group.annotationAuthor.some(a => authors.includes(a))) {
                return true;
            }
            if (group.annotationAuthorExclude && group.annotationAuthorExclude.length
                && !group.annotationAuthorExclude.some(a => authors.includes(a))) {
                return true;
            }
        }
        if ((group.addedBy && group.addedBy.length)
            || (group.addedByExclude && group.addedByExclude.length)) {
            const sc = group.addedByScope || {
                topLevel: true, attachments: true, annotations: true,
            };
            const inScope = (isAnn && sc.annotations)
                || (isAtt && sc.attachments)
                || ((isReg || isNote) && sc.topLevel);
            if (inScope) {
                const addedBy = this._getItemAddedBy(item);
                if (addedBy && group.addedBy
                    && group.addedBy.length
                    && group.addedBy.includes(addedBy)) return true;
                if (group.addedByExclude && group.addedByExclude.length
                    && (!addedBy || !group.addedByExclude.includes(addedBy))) {
                    return true;
                }
            }
        }
        // Cross-level filters — universal, count as kind-match for
        // any row that satisfies them. This makes annotations whose
        // comments contain a URL primary, attachments with a `url`
        // field primary, parents with `relatedItems` primary, etc.,
        // so the cascade pulls in their ancestors and (for parents)
        // walks their subtree on the keep pass.
        // Cross-level scope check (mirrors _rowPassesFilters).
        const cInScope = (scopeObj, kind) =>
            !scopeObj || !kind || scopeObj[kind] !== false;
        if (group.hasRelated != null) {
            const k = this._rowKindOf(item);
            if (cInScope(group.hasRelatedScope, k)) {
                const rels = (item.relatedItems && item.relatedItems.length) || 0;
                if ((rels > 0) === group.hasRelated) return true;
            }
        }
        if (group.hasLink != null) {
            const sk = this._hasLinkScopeKeyOf(item);
            if (sk) {
                const sc = group.hasLinkScope;
                if (!sc || sc[sk] !== false) {
                    const has = this._itemHasLinks(item);
                    if (has === group.hasLink) return true;
                }
            }
        }
        if (group.hasTag != null) {
            const k = this._rowKindOf(item);
            if (cInScope(group.hasTagScope, k)) {
                const tags = (item.getTags && item.getTags()) || [];
                const has = tags.length > 0;
                if (has === group.hasTag) return true;
            }
        }
        // Note-kind defining filters count as a kind-match for the
        // matching row, so child / standalone notes become primary
        // and the cascade pulls in their ancestors.
        if (group.itemNote != null) {
            const isCN = !!(item.isNote && item.isNote() && !!item.parentItem);
            if (isCN === group.itemNote) return true;
        }
        if (group.standaloneNote != null) {
            const isSN = !!(item.isNote && item.isNote() && !item.parentItem);
            if (isSN === group.standaloneNote) return true;
        }
        // Parent-targeting Has-* — only regular items can be primary
        // for these. Non-regulars don't count as kind matches here.
        if (isReg) {
            if (group.hasAbstract != null) {
                const v = !!(item.getField
                    && String(item.getField("abstractNote") || "").trim().length);
                if (v === group.hasAbstract) return true;
            }
            if (group.hasDOI != null) {
                const v = !!(item.getField
                    && String(item.getField("DOI") || "").trim().length);
                if (v === group.hasDOI) return true;
            }
            if (group.hasURL != null) {
                const v = !!(item.getField
                    && String(item.getField("url") || "").trim().length);
                if (v === group.hasURL) return true;
            }
            if (group.hasAttachment != null) {
                const ids = (item.getAttachments && item.getAttachments()) || [];
                const v = ids.length > 0;
                if (v === group.hasAttachment) return true;
            }
            if ((group.publication && group.publication.length)
                || (group.publicationExclude && group.publicationExclude.length)) {
                const pub = (item.getField
                    && item.getField("publicationTitle")) || "";
                if (group.publication && group.publication.length
                    && group.publication.includes(pub)) return true;
                if (group.publicationExclude && group.publicationExclude.length
                    && !group.publicationExclude.includes(pub)) return true;
            }
        }
        // Has Annotations — file attachments only.
        if (group.hasAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                const ids = item.getAnnotations() || [];
                const v = ids.length > 0;
                if (v === group.hasAnnotations) return true;
            }
        }
        return false;
    }


    /** Highlight the row in each `<libraries-collections-box>` whose
     *  library owns the currently-displayed item, but ONLY when the
     *  item also exists in other libraries (linked items). Upstream
     *  marks the row matching the active collection-tree branch
     *  (`.box.current` -> bold), but in a reader tab there's no
     *  active collection, and even in My Library the bold-only cue is
     *  easy to miss when the user wants to know *which library this
     *  item came from*. Adds a coloured background to the
     *  library-row of `box._item` whenever `box._linkedItems` is
     *  non-empty. */
    _setupLibrariesBoxHighlight(win) {
        if (!win) return;
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

        const win = box.ownerGlobal;
        const escape = (s) => (win && win.CSS && win.CSS.escape)
            ? win.CSS.escape(s) : String(s).replace(/"/g, "\\\"");
        const targetRow = body.querySelector(
            `.row[data-id="${escape(treeViewID)}"]`);
        if (targetRow) {
            targetRow.classList.add("wv-libraries-current-library");
        }
    }

    _setupItemsListFilter() {
        const win = Zotero.getMainWindow();
        const doc = win && win.document;
        if (!doc) return;
        const container = doc.getElementById("zotero-items-pane-container");
        const itemsPane = doc.getElementById("zotero-items-pane");
        const searchBox = doc.getElementById("zotero-tb-search");
        if (!container || !itemsPane || !searchBox) {
            // Items pane mounts asynchronously on first window open; retry.
            win.setTimeout(() => this._setupItemsListFilter(), 1000);
            return;
        }
        if (doc.getElementById("wv-filter-bar")) return;

        // Toolbar button — XUL <toolbarbutton type="menu"> next to the
        // quick-search box. The `type="menu"` attribute is what gives
        // it native toggle behaviour: when its child popup is open
        // and the user clicks the button again, XUL closes it AND
        // suppresses the would-be re-open. This is the same trick
        // the quick-search dropmarker uses (chrome://zotero/content/
        // elements/quickSearchTextbox.js — `dropmarker.setAttribute(
        // "type", "menu")` + `dropmarker.append(this.searchModePopup)`).
        // Inherits `.zotero-tb-button` styling and the universal
        // filter.svg icon (themed via context-fill).
        const tbBtn = doc.createXULElement("toolbarbutton");
        tbBtn.id = "wv-filter-tb-button";
        tbBtn.className = "zotero-tb-button";
        tbBtn.setAttribute("type", "menu");
        tbBtn.setAttribute("tabindex", "-1");
        tbBtn.setAttribute("tooltiptext", "Filter items");
        tbBtn.style.setProperty("-moz-context-properties",
            "fill, fill-opacity, stroke, stroke-opacity");
        tbBtn.style.fill = "currentColor";
        // The XUL <toolbarbutton> normally auto-renders an icon child
        // from its `image` attribute — but only when it has NO real
        // children. Once we add our own children (popup panel +
        // dropmarker chevron) the auto-content insertion stops, so
        // we have to render the icon as a real child too. Both
        // `.toolbarbutton-icon` and `.toolbarbutton-menu-dropmarker`
        // already have CSS in `_toolbarbutton.scss` that themes them
        // via `currentColor` / context-fill.
        const icon = doc.createXULElement("image");
        icon.className = "toolbarbutton-icon";
        icon.setAttribute("src",
            "chrome://zotero/skin/16/universal/filter.svg");
        tbBtn.appendChild(icon);
        const dropmarker = doc.createXULElement("image");
        dropmarker.className = "toolbarbutton-menu-dropmarker";
        tbBtn.appendChild(dropmarker);

        // The panel must be a CHILD of the toolbar button for
        // type="menu" toggle behaviour. We create it once here and
        // (re)build its contents on `popupshowing` so the rendered
        // selection state always reflects the current `_filterState`.
        const panel = doc.createXULElement("panel");
        panel.id = "wv-filter-popup";
        panel.setAttribute("type", "arrow");
        // Skip the default Mozilla XUL panel fade-in animation so
        // the filter window appears at full opacity in one step
        // instead of fading from 0 → 1 over ~150 ms (which reads
        // as a "faint then clear" two-step appearance because
        // content has already rendered when the fade begins).
        // Same flag Zotero's own tabs-menu / sync-error / lookup
        // panels use (zoteroPane.xhtml).
        panel.setAttribute("animate", "false");
        // `position` controls anchoring relative to the parent menu
        // button; "after_end" right-aligns the popup to the button so
        // the wide popup body extends LEFTWARD into the items-pane
        // area instead of off-screen to the right.
        panel.setAttribute("position", "after_end");
        // Delegate HTML `title` tooltips to Zotero's own page-mode
        // tooltip element (declared in `zoteroPane.xhtml` as
        // `<tooltip id="html-tooltip" page="true"/>`). Mozilla's
        // tooltip listener handles position, delay, theming, and
        // OS-native cursor offset for us — exactly matching every
        // other tooltip in the Zotero UI. No custom JS needed.
        panel.setAttribute("tooltip", "html-tooltip");
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const inner = doc.createElementNS(NS_HTML, "div");
        inner.className = "wv-filter-popup-inner wv-filter-panel-inner";
        panel.appendChild(inner);
        panel.addEventListener("popupshowing", () => {
            // Drop any in-memory caches so dynamic-list pickers
            // (tags, authors) re-fetch from SQL on each fresh open
            // and search inputs reset to empty.
            this._cachedAnnotationTags = null;
            this._cachedAnnotationAuthors = null;
            this._cachedAddedByUsers = null;
            this._cachedPublications = null;
            this._tagSearchQuery = "";
            this._authorSearchQuery = "";
            this._itemTypeSearchQuery = "";
            this._addedBySearchQuery = "";
            this._publicationSearchQuery = "";
            this._renderFilterPanelContents(panel, inner);
        });

        // Swallow lone-Alt key events. On Windows, tapping Alt
        // activates the menubar (or the system menu) and Mozilla
        // hides any open popup as a side effect — including this
        // filter panel, which is annoying since users hold Alt to
        // alt-click for exclude. Stopping the keydown/keyup chain
        // when the Alt key is the only modifier prevents the
        // menubar activation while still letting Alt+click reach
        // its target buttons inside the panel.
        const swallowLoneAlt = (e) => {
            if (e.key !== "Alt") return;
            if (e.ctrlKey || e.shiftKey || e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
        };
        panel.addEventListener("keydown", swallowLoneAlt, true);
        panel.addEventListener("keyup", swallowLoneAlt, true);
        tbBtn.appendChild(panel);
        searchBox.parentNode.insertBefore(tbBtn, searchBox.nextSibling);

        // Chips bar — sits between the toolbar and the items tree.
        // Hidden when no filters are active so the items tree gets its
        // full vertical space back; appears only when at least one chip
        // exists.
        const bar = doc.createElementNS(NS_HTML, "div");
        bar.id = "wv-filter-bar";
        bar.className = "wv-filter-bar";
        bar.style.display = "none";
        container.insertBefore(bar, itemsPane);

        // Filter state: a list of GROUPS. Each group is an
        // AND-combination of fields (same shape as the pre-groups
        // flat state); groups are OR'd together at the top level.
        // The active group index tracks which group new chips /
        // section toggles target — set by the entry point that
        // opens the panel (toolbar `+`, chip click, `+ Group`).
        //
        // Migration: a pre-groups session may have left a flat state
        // sitting on `this._filterState`. Detect by absence of the
        // `groups` key and wrap it as the first (and only) group.
        if (!this._filterState) {
            this._filterState = {
                groups: [this._emptyFilterGroup()],
                activeGroupIndex: 0,
            };
        } else if (!this._filterState.groups) {
            const flat = this._filterState;
            this._filterState = {
                groups: [Object.assign(this._emptyFilterGroup(), flat)],
                activeGroupIndex: 0,
            };
        }
        this._filterBar = bar;
        this._filterTbBtn = tbBtn;
        this._renderFilterBar();
        this._patchIsSelectable();

        // Re-apply filter when scroll / data-change brings new rows into
        // the virtualized window. We watch the inner tree element for
        // childList mutations — every row append/remove fires here.
        const treeInner = doc.getElementById("item-tree-main")
            || doc.getElementById("zotero-items-tree");
        if (treeInner && win.MutationObserver) {
            this._filterTreeObserver = new win.MutationObserver(() => {
                // Skip the apply during a collection swap — the
                // `changeCollectionTreeRow` wrap will re-apply
                // exactly once after `_rows` has fully reloaded.
                if (this._collectionSwapping) return;
                this._applyItemsListFilter();
                // Patch the annotation row class as soon as the
                // first annotation row exists in `_rows`. Idempotent
                // — re-checks on every tree mutation but only
                // installs once.
                try { this._ensureAnnotationRowPatched(); } catch (e) {}
            });
            this._filterTreeObserver.observe(treeInner,
                { childList: true, subtree: true });
        }

        // Collection-switch hook. The mutation observer above isn't
        // reliable across collection swaps: Zotero's
        // `CollectionViewItemTree.changeCollectionTreeRow` swaps
        // rows on the same `rowProvider` instance, so our patched
        // `getRow` survives but its `keep` array still maps to the
        // OLD `_rows`. Without an explicit re-apply tied to the
        // swap, the items view shows stale (previous-collection)
        // rows after returning to a previously visited collection.
        //
        // Patch the method to re-apply the filter once the swap
        // resolves. Idempotent — a flag on the instance prevents
        // double-wrapping across plugin reloads.
        try {
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (itemsView && typeof itemsView.changeCollectionTreeRow === "function"
                && !itemsView._wvCollChangeWrapped) {
                const origChange = itemsView.changeCollectionTreeRow.bind(itemsView);
                itemsView._wvCollChangeWrapped = true;
                itemsView.changeCollectionTreeRow = async (treeRow) => {
                    // Critical: un-patch the rowProvider BEFORE
                    // Zotero's collection-load logic runs. Otherwise
                    // the load reads our stale `getRowCount` (the
                    // OLD collection's `keep` length) and works on
                    // ghost rows past the new `_rows` end, leaving
                    // `_rows` partially populated. This was the
                    // observed bug where switching from L1 → C16 →
                    // L1 left My Library showing 7 rows / 151
                    // visible instead of the full set.
                    //
                    // Also: SUPPRESS the mutation-observer re-apply
                    // during the swap. The observer fires on DOM
                    // changes mid-load; if we let it apply, it
                    // reinstalls stale patches against partially-
                    // loaded `_rows`, then Zotero's load completes
                    // with mismatched `keep` ↔ `_rows` (root cause
                    // of "row 4 already found for item 81" warnings
                    // and "Attempting to get row data for a non-
                    // existant tree row 4" errors).
                    this._collectionSwapping = true;
                    this._pauseFilterPatches();
                    let result;
                    try { result = await origChange(treeRow); }
                    finally {
                        // Microtask defer — runs as soon as the
                        // current event loop tick yields, which is
                        // BEFORE any 80ms `_filterApplying` guard
                        // would normally bounce a sync call. This
                        // collapses the visible "unfiltered rows
                        // flash" between origChange resolving and
                        // our re-apply finishing.
                        Promise.resolve().then(() => {
                            try {
                                this._collectionSwapping = false;
                                this._filterApplying = false;
                                this._applyItemsListFilter({ cascade: true });
                                this._patchIsSelectable();
                            } catch (e) {
                                Zotero.debug(
                                    "[Weavero][filter] post-swap reapply err: " + e);
                            }
                        });
                    }
                    return result;
                };
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] changeCollectionTreeRow wrap err: " + e);
        }

        // Diagnostic wrapper around selectItems so we see exactly
        // what state Zotero has when it tries to select a freshly
        // created item — what `_rowMap[id]` returns vs the wrapped
        // `getRowCount`. Idempotent.
        try {
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (itemsView && typeof itemsView.selectItems === "function"
                && !itemsView._wvSelectItemsWrapped) {
                const origSelect = itemsView.selectItems.bind(itemsView);
                itemsView._wvSelectItemsWrapped = true;
                itemsView.selectItems = async (ids, noRecurse, noScroll) => {
                    try {
                        const rp = itemsView.rowProvider;
                        const info = {
                            ids: ids,
                            rowsLen: rp && rp._rows ? rp._rows.length : "?",
                            wrappedCount: itemsView.rowCount,
                            origCount: rp && rp._wvOrigGetRowCount
                                ? rp._wvOrigGetRowCount() : "n/a",
                        };
                        for (const id of ids || []) {
                            info["rowMap[" + id + "]"] =
                                itemsView._rowMap ? itemsView._rowMap[id] : "n/a";
                        }
                        Zotero.debug(
                            "[Weavero][add-debug] selectItems entry: "
                            + JSON.stringify(info));
                    } catch (e) {}
                    let result;
                    try { result = await origSelect(ids, noRecurse, noScroll); }
                    catch (e) {
                        Zotero.debug(
                            "[Weavero][add-debug] selectItems threw: " + e);
                        throw e;
                    }
                    Zotero.debug(
                        "[Weavero][add-debug] selectItems returned: " + result
                        + " selectionFocused="
                        + (itemsView.selection
                            ? itemsView.selection.focused : "n/a"));
                    return result;
                };
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] selectItems wrap err: " + e);
        }
    }

    _teardownItemsListFilter() {
        try {
            if (this._filterTreeObserver) {
                this._filterTreeObserver.disconnect();
                this._filterTreeObserver = null;
            }
        } catch (e) {}
        // Restore the rowProvider methods we monkey-patched. Without
        // this, plugin disable would leave the items list still
        // filtering through our state.
        try {
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            const rp = itemsView && itemsView.rowProvider;
            if (rp && rp._wvOrigGetRow) {
                // Delete the own-property monkey-patches so the
                // prototype methods show through. Reassigning to
                // `rp._wvOrigGetRow` would just reinstall a bound
                // copy (which still works, but `delete` is cleaner
                // and avoids re-stacking on next reload).
                delete rp.getRow;
                delete rp.getRowCount;
                delete rp._wvOrigGetRow;
                delete rp._wvOrigGetRowCount;
                if (rp._wvOrigGetLevel) {
                    delete rp.getLevel;
                    delete rp._wvOrigGetLevel;
                }
                if (rp._wvOrigIsContainer) {
                    delete rp.isContainer;
                    delete rp._wvOrigIsContainer;
                }
                if (rp._wvOrigIsContainerOpen) {
                    delete rp.isContainerOpen;
                    delete rp._wvOrigIsContainerOpen;
                }
                if (rp._wvOrigIsContainerEmpty) {
                    delete rp.isContainerEmpty;
                    delete rp._wvOrigIsContainerEmpty;
                }
                if (rp._wvOrigToggleOpenState) {
                    delete rp.toggleOpenState;
                    delete rp._wvOrigToggleOpenState;
                }
                if (rp._wvOrigExpandRows) {
                    delete rp.expandRows;
                    delete rp._wvOrigExpandRows;
                }
                if (rp._wvOrigCollapseRows) {
                    delete rp.collapseRows;
                    delete rp._wvOrigCollapseRows;
                }
                if (rp._wvOrigExpandAllRows) {
                    delete rp.expandAllRows;
                    delete rp._wvOrigExpandAllRows;
                }
                if (rp._wvOrigCollapseAllRows) {
                    delete rp.collapseAllRows;
                    delete rp._wvOrigCollapseAllRows;
                }
                delete rp._wvFilterSelfCall;
                this._partialCollapseOnFilterClear(rp, itemsView);
                try { itemsView.tree && itemsView.tree.invalidate(); } catch (e) {}
            }
        } catch (e) {}
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (doc) {
                const bar = doc.getElementById("wv-filter-bar");
                if (bar) bar.remove();
                const tbBtn = doc.getElementById("wv-filter-tb-button");
                if (tbBtn) tbBtn.remove();
                for (const row of doc.querySelectorAll(".row.wv-filter-hidden")) {
                    row.classList.remove("wv-filter-hidden");
                }
                const popup = doc.getElementById("wv-filter-popup");
                if (popup) popup.remove();
            }
        } catch (e) {}
        this._filterBar = null;
        this._filterTbBtn = null;
    }

    /** (Re)build the filter-bar contents from `_filterState`. Called on
     *  setup, on every chip add/remove, and after popup commit. The bar
     *  is hidden when no filters are active — the toolbar "+" button is
     *  the entry point in that state. */
    _renderFilterBar() {
        const bar = this._filterBar;
        if (!bar) return;
        const doc = bar.ownerDocument;
        while (bar.firstChild) bar.removeChild(bar.firstChild);

        const state = this._filterState;
        if (!this._isFilterActive(state)) {
            bar.style.display = "none";
            return;
        }
        bar.style.display = "";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const groups = state.groups || [];

        // Render each ACTIVE group inline. Groups are visually
        // separated by an "OR" badge; chips inside a group are
        // implicitly AND'd.
        let firstActive = true;
        for (let gi = 0; gi < groups.length; gi++) {
            const group = groups[gi];
            if (!this._isGroupActive(group)) continue;
            if (!firstActive) {
                const orSep = doc.createElementNS(NS_HTML, "span");
                orSep.className = "wv-filter-or";
                orSep.textContent = "OR";
                bar.appendChild(orSep);
            }
            firstActive = false;

            if (group.annotationColor && group.annotationColor.length) {
                bar.appendChild(this._buildColorChip(doc, group, gi));
            }
            if (group.annotationColorExclude && group.annotationColorExclude.length) {
                bar.appendChild(this._buildColorChip(doc, group, gi, true));
            }
            if (group.annotationType && group.annotationType.length) {
                bar.appendChild(this._buildTypeChip(doc, group, gi));
            }
            if (group.annotationTypeExclude && group.annotationTypeExclude.length) {
                bar.appendChild(this._buildTypeChip(doc, group, gi, true));
            }
            if (group.annotationHasComment != null) {
                bar.appendChild(this._buildHasCommentChip(doc, group, gi));
            }
            if (group.annotationTag && group.annotationTag.length) {
                bar.appendChild(this._buildTagChip(doc, group, gi));
            }
            if (group.annotationTagExclude && group.annotationTagExclude.length) {
                bar.appendChild(this._buildTagChip(doc, group, gi, true));
            }
            if (group.annotationAuthor && group.annotationAuthor.length) {
                bar.appendChild(this._buildAuthorChip(doc, group, gi));
            }
            if (group.annotationAuthorExclude && group.annotationAuthorExclude.length) {
                bar.appendChild(this._buildAuthorChip(doc, group, gi, true));
            }
            if (group.itemType && group.itemType.length) {
                bar.appendChild(this._buildItemTypeChip(doc, group, gi));
            }
            if (group.itemTypeExclude && group.itemTypeExclude.length) {
                bar.appendChild(this._buildItemTypeChip(doc, group, gi, true));
            }
            if (group.attachmentFileType && group.attachmentFileType.length) {
                bar.appendChild(this._buildAttachmentFileTypeChip(doc, group, gi));
            }
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) {
                bar.appendChild(this._buildAttachmentFileTypeChip(doc, group, gi, true));
            }
            if (group.addedBy && group.addedBy.length) {
                bar.appendChild(this._buildAddedByChip(doc, group, gi));
            }
            if (group.addedByExclude && group.addedByExclude.length) {
                bar.appendChild(this._buildAddedByChip(doc, group, gi, true));
            }
            if (group.hasRelated != null) {
                bar.appendChild(this._buildHasRelatedChip(doc, group, gi));
            }
            if (group.hasLink != null) {
                bar.appendChild(this._buildHasLinkChip(doc, group, gi));
            }
            if (group.hasTag != null) {
                bar.appendChild(this._buildHasTagChip(doc, group, gi));
            }
            if (group.itemNote != null) {
                bar.appendChild(this._buildItemNoteChip(doc, group, gi));
            }
            if (group.standaloneNote != null) {
                bar.appendChild(this._buildStandaloneNoteChip(doc, group, gi));
            }
            if (group.hasAbstract != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasAbstract", "Has Abstract"));
            }
            if (group.hasDOI != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasDOI", "Has DOI"));
            }
            if (group.hasURL != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasURL", "Has URL"));
            }
            if (group.hasAttachment != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasAttachment", "Has Attachment File"));
            }
            if (group.hasAnnotations != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasAnnotations", "Has Annotations"));
            }
            if (group.publication && group.publication.length) {
                bar.appendChild(this._buildPublicationChip(doc, group, gi));
            }
            if (group.publicationExclude && group.publicationExclude.length) {
                bar.appendChild(this._buildPublicationChip(doc, group, gi, true));
            }
        }

        // Trailing "+ Filter" — adds a chip to the LAST active group.
        const addBtn = doc.createElementNS(NS_HTML, "button");
        addBtn.type = "button";
        addBtn.className = "wv-filter-add";
        addBtn.textContent = "+ Filter";
        addBtn.title = "Add a filter to the current group (AND with the existing chips in this group).";
        addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            // Target last-active group when opening from the bar.
            for (let i = groups.length - 1; i >= 0; i--) {
                if (this._isGroupActive(groups[i])) {
                    state.activeGroupIndex = i;
                    break;
                }
            }
            // _openFilterPanel resolves the toolbar button itself —
            // no anchor argument needed.
            this._openFilterPanel();
        });
        bar.appendChild(addBtn);

        // "+ Group" — append a brand-new empty group and open the
        // panel scoped to it. The user can pick filters in the panel
        // and they go into the new group, OR'd with the existing
        // ones.
        const addGroupBtn = doc.createElementNS(NS_HTML, "button");
        addGroupBtn.type = "button";
        addGroupBtn.className = "wv-filter-add wv-filter-add-group";
        addGroupBtn.textContent = "+ OR Group";
        addGroupBtn.title = "Start a new OR group — its filters are AND'd internally and the group's results are unioned with the others.";
        addGroupBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            state.groups.push(this._emptyFilterGroup());
            state.activeGroupIndex = state.groups.length - 1;
            this._openFilterPanel();
        });
        bar.appendChild(addGroupBtn);

        // "Clear all" — wipes every group and resets to a single
        // empty group. Pushed to the right via `margin-left: auto`
        // in `.wv-filter-bar .wv-filter-clear`.
        const clearBtn = doc.createElementNS(NS_HTML, "button");
        clearBtn.type = "button";
        clearBtn.className = "wv-filter-clear";
        clearBtn.textContent = "Clear all";
        clearBtn.title = "Remove every active filter and reset to a single empty group.";
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._clearAllFilters();
        });
        bar.appendChild(clearBtn);
    }

    /** Reset every filter back to its empty default and re-apply.
     *  Re-renders the chip bar (which then hides itself, no chips)
     *  and the open panel (so the section visuals deselect). */
    _clearAllFilters() {
        this._filterState = {
            groups: [this._emptyFilterGroup()],
            activeGroupIndex: 0,
        };
        this._savedSearchResults = null;
        this._savedSearchExcludeResults = null;
        // Drop the session "recently added" carry-over too — with
        // no filter active, every item is visible anyway.
        if (this._wvRecentlyAddedItemIDs) {
            this._wvRecentlyAddedItemIDs.clear();
        }
        this._pillOrder = [];
        this._renderFilterBar();
        this._applyItemsListFilter();
        // Clear any leftover Selection Target dimming from the old
        // state — _applyItemsListFilter doesn't touch wv-not-target.
        try { this._applySelectionTargetVisuals(); } catch (e) {}
        const win = Zotero.getMainWindow();
        const doc = win && win.document;
        const popup = doc && doc.getElementById("wv-filter-popup");
        if (popup
            && (popup.state === "open" || popup.state === "showing")) {
            const inner = popup.querySelector(".wv-filter-panel-inner");
            if (inner) this._renderFilterPanelContents(popup, inner);
        }
    }

    /** Generic chip builder. Each chip is `Field | op | value(s) | ×`,
     *  with click-on-non-× re-opening the value picker. */
    _buildFilterChip(doc, opts) {
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const chip = doc.createElementNS(NS_HTML, "div");
        chip.className = "wv-filter-chip";
        chip.title = "Click to edit — opens the filter popup focused on this group.";

        const fieldSeg = doc.createElementNS(NS_HTML, "span");
        fieldSeg.className = "wv-chip-seg wv-chip-field";
        fieldSeg.textContent = opts.field;
        chip.appendChild(fieldSeg);

        const opSeg = doc.createElementNS(NS_HTML, "span");
        opSeg.className = "wv-chip-seg wv-chip-op";
        opSeg.textContent = opts.op;
        chip.appendChild(opSeg);

        const valSeg = doc.createElementNS(NS_HTML, "span");
        valSeg.className = "wv-chip-seg wv-chip-value";
        opts.fillValue(valSeg);
        chip.appendChild(valSeg);

        const removeSeg = doc.createElementNS(NS_HTML, "span");
        removeSeg.className = "wv-chip-seg wv-chip-remove";
        removeSeg.textContent = "×";
        removeSeg.title = "Remove filter";
        removeSeg.addEventListener("click", (e) => {
            e.stopPropagation();
            opts.onRemove();
            this._renderFilterBar();
            this._applyItemsListFilter();
        });
        chip.appendChild(removeSeg);

        chip.addEventListener("click", (e) => {
            if (e.target === removeSeg) return;
            opts.onEdit(chip);
        });
        return chip;
    }

    /** Helper: when a chip's `×` removes the LAST active filter from
     *  a non-first group, drop the empty group entirely so it doesn't
     *  linger as an "OR with nothing". The first group stays even
     *  when empty (so the bar can collapse cleanly). */
    _pruneEmptyGroups() {
        const s = this._filterState;
        if (!s || !s.groups) return;
        for (let i = s.groups.length - 1; i > 0; i--) {
            if (!this._isGroupActive(s.groups[i])) s.groups.splice(i, 1);
        }
        if (s.activeGroupIndex >= s.groups.length) {
            s.activeGroupIndex = s.groups.length - 1;
        }
    }

    /** Open the filter panel scoped to the given group index. The
     *  `anchor` arg is accepted for callsite compatibility (some
     *  callers wire this onto a button-click handler) but is unused
     *  — `_openFilterPanel` always anchors to the toolbar button. */
    _openFilterPanelForGroup(anchor, groupIdx) {
        this._filterState.activeGroupIndex = groupIdx;
        this._openFilterPanel();
    }

    _buildColorChip(doc, group, gi, exclude) {
        const colors = exclude ? group.annotationColorExclude : group.annotationColor;
        return this._buildFilterChip(doc, {
            field: "Annotation Color",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                const NS_HTML = "http://www.w3.org/1999/xhtml";
                for (const c of colors) {
                    const sw = doc.createElementNS(NS_HTML, "span");
                    sw.className = "wv-chip-swatch";
                    sw.style.background = c;
                    valSeg.appendChild(sw);
                }
                const labelText = colors.map(c => {
                    const def = this._ANNOTATION_COLORS.find(x => x.value === c);
                    return def ? def.label : c;
                }).join(", ");
                const labelSpan = doc.createElementNS(NS_HTML, "span");
                labelSpan.textContent = labelText;
                valSeg.appendChild(labelSpan);
            },
            onRemove: () => {
                if (exclude) group.annotationColorExclude = [];
                else group.annotationColor = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildTypeChip(doc, group, gi, exclude) {
        const types = exclude ? group.annotationTypeExclude : group.annotationType;
        return this._buildFilterChip(doc, {
            field: "Annotation Type",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                const labelText = types.map(t => {
                    const def = this._ANNOTATION_TYPES.find(x => x.value === t);
                    return def ? def.label : t;
                }).join(", ");
                valSeg.textContent = labelText;
            },
            onRemove: () => {
                if (exclude) group.annotationTypeExclude = [];
                else group.annotationType = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasCommentChip(doc, group, gi) {
        // value=true  → include (annotations WITH comment)
        // value=false → exclude (annotations WITHOUT comment)
        const value = group.annotationHasComment;
        return this._buildFilterChip(doc, {
            field: "Has Comment",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.annotationHasComment = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasRelatedChip(doc, group, gi) {
        const value = group.hasRelated;
        return this._buildFilterChip(doc, {
            field: "Has Related",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.hasRelated = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasLinkChip(doc, group, gi) {
        const value = group.hasLink;
        return this._buildFilterChip(doc, {
            field: "Has Link",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.hasLink = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasTagChip(doc, group, gi) {
        const value = group.hasTag;
        return this._buildFilterChip(doc, {
            field: "Has Tag",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.hasTag = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildItemNoteChip(doc, group, gi) {
        const value = group.itemNote;
        return this._buildFilterChip(doc, {
            field: "Item Note",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.itemNote = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildStandaloneNoteChip(doc, group, gi) {
        const value = group.standaloneNote;
        return this._buildFilterChip(doc, {
            field: "Standalone Note",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.standaloneNote = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasFieldChip(doc, group, gi, key, fieldLabel) {
        const value = group[key];
        return this._buildFilterChip(doc, {
            field: fieldLabel,
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group[key] = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildPublicationChip(doc, group, gi, exclude) {
        const list = exclude ? group.publicationExclude : group.publication;
        return this._buildFilterChip(doc, {
            field: "Publication",
            op: exclude ? "excludes any" : "includes any",
            fillValue: (valSeg) => { valSeg.textContent = list.join(", "); },
            onRemove: () => {
                if (exclude) group.publicationExclude = [];
                else group.publication = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }



    _buildTagChip(doc, group, gi, exclude) {
        const tags = exclude ? group.annotationTagExclude : group.annotationTag;
        return this._buildFilterChip(doc, {
            field: "Tag",
            op: exclude ? "excludes any" : "includes any",
            fillValue: (valSeg) => { valSeg.textContent = tags.join(", "); },
            onRemove: () => {
                if (exclude) group.annotationTagExclude = [];
                else group.annotationTag = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildAuthorChip(doc, group, gi, exclude) {
        const authors = exclude ? group.annotationAuthorExclude : group.annotationAuthor;
        return this._buildFilterChip(doc, {
            field: "Author",
            op: exclude ? "excludes any" : "includes any",
            fillValue: (valSeg) => { valSeg.textContent = authors.join(", "); },
            onRemove: () => {
                if (exclude) group.annotationAuthorExclude = [];
                else group.annotationAuthor = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildItemTypeChip(doc, group, gi, exclude) {
        const types = exclude ? group.itemTypeExclude : group.itemType;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        return this._buildFilterChip(doc, {
            field: "Item Type",
            op: exclude ? "is not" : "is",
            // Render the value segment as a row of item-type icons
            // (no localised name) — the icon already conveys the
            // type and saves chip width when several types are
            // selected.
            fillValue: (valSeg) => {
                while (valSeg.firstChild) valSeg.removeChild(valSeg.firstChild);
                for (const t of types) {
                    const icon = doc.createElementNS(NS_HTML, "span");
                    icon.className = "icon icon-css icon-item-type";
                    icon.dataset.itemType = t;
                    let label = t;
                    try { label = Zotero.ItemTypes.getLocalizedString(t); }
                    catch (e) {}
                    icon.title = label;
                    valSeg.appendChild(icon);
                }
            },
            onRemove: () => {
                if (exclude) group.itemTypeExclude = [];
                else group.itemType = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildAttachmentFileTypeChip(doc, group, gi, exclude) {
        const kinds = exclude ? group.attachmentFileTypeExclude : group.attachmentFileType;
        const labelOf = (k) => {
            const def = this._ATTACHMENT_FILE_TYPES.find(x => x.value === k);
            return def ? def.label : k;
        };
        return this._buildFilterChip(doc, {
            field: "Attachment File Type",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                valSeg.textContent = kinds.map(labelOf).join(", ");
            },
            onRemove: () => {
                if (exclude) group.attachmentFileTypeExclude = [];
                else group.attachmentFileType = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildAddedByChip(doc, group, gi, exclude) {
        const users = exclude ? group.addedByExclude : group.addedBy;
        const colorOn = this._getEnableAddedByColors();
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        return this._buildFilterChip(doc, {
            field: "Added By",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                if (!colorOn) {
                    valSeg.textContent = users.join(", ");
                    return;
                }
                // Per-user colored pills inside the chip's value
                // segment — reuses the same per-user palette as the
                // annotation badge and the addedBy column pill.
                while (valSeg.firstChild) valSeg.removeChild(valSeg.firstChild);
                users.forEach((u, k) => {
                    if (k > 0) {
                        const sep = doc.createElementNS(NS_HTML, "span");
                        sep.className = "wv-chip-value-sep";
                        sep.textContent = ", ";
                        valSeg.appendChild(sep);
                    }
                    const pill = doc.createElementNS(NS_HTML, "span");
                    pill.className = "wv-chip-value-user";
                    pill.textContent = u;
                    const colour = this._colorForUser(u);
                    pill.style.color = colour;
                    pill.style.backgroundColor = this._withAlpha(colour, 0.18);
                    valSeg.appendChild(pill);
                });
            },
            onRemove: () => {
                if (exclude) group.addedByExclude = [];
                else group.addedBy = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    /** Build the XUL <panel> shell used by every filter popover, plus
     *  return an HTML inner div for callers to fill in. The panel hosts
     *  an HTML subtree so it gets native arrow-popup positioning and
     *  outside-click dismissal for free. */
    /** Populate the persistent panel with all three filter sections.
     *  Called from `popupshowing` (XUL fires this every time the
     *  type="menu" toolbar button opens its child popup) so the
     *  visible state always tracks `_filterState`.
     *
     *  Section toggles re-render IN PLACE on every click so the
     *  selection visuals stay in sync without rebuilding the whole
     *  panel (which would dismiss the popover). */

    /** Tri-state toggle for icon-grid (single-value) filters: plain
     *  click → toggle in the include set; Alt+click → toggle in the
     *  exclude set.
     *
     *  Single-value semantics: an annotation has ONE color, an
     *  attachment has ONE file type, etc. Mixing include and exclude
     *  on the same facet is therefore always degenerate — including
     *  yellow already implies "not red, not blue, ...", so adding
     *  "exclude red" is no-op (or contradiction if values overlap).
     *  To make the UI represent intent cleanly, switching mode (i.e.
     *  adding to the OTHER set when at least one value is currently
     *  set) CLEARS the prior set entirely. The two sets therefore
     *  never coexist non-empty for these facets.
     *
     *  Returns the new {include, exclude} arrays. */
    _toggleIncludeExclude(value, includeArr, excludeArr, altKey) {
        const inc = new Set(includeArr || []);
        const exc = new Set(excludeArr || []);
        if (altKey) {
            if (exc.has(value)) {
                exc.delete(value);
            } else {
                // Switching into / staying in exclude mode: drop
                // every value from the include set so the facet
                // never has both directions active at once.
                exc.add(value);
                inc.clear();
            }
        } else {
            if (inc.has(value)) {
                inc.delete(value);
            } else {
                inc.add(value);
                exc.clear();
            }
        }
        return { include: [...inc], exclude: [...exc] };
    }

    /** Wire a search-input + suggestion-box pair to show on focus
     *  and hide on focus moving away OR a mousedown outside `opts`.
     *  The document-level mousedown handler covers clicks on inert
     *  popup regions (group headers, padding, section titles) that
     *  never take focus and therefore wouldn't fire a focusout.
     *  Outside-clicks also blur the search input so the caret leaves
     *  the popup along with the suggestions collapsing. */
    _wireFilterBoxFocus(doc, search, box, opts) {
        let onDocMouseDown = null;
        const hideBox = () => {
            box.style.display = "none";
            if (onDocMouseDown) {
                doc.removeEventListener("mousedown", onDocMouseDown, true);
                onDocMouseDown = null;
            }
        };
        const showBox = () => {
            if (box.style.display !== "none") return;
            box.style.display = "";
            if (!onDocMouseDown) {
                onDocMouseDown = (e) => {
                    if (opts.contains(e.target)) return;
                    try { search.blur(); } catch (err) {}
                    hideBox();
                };
                doc.addEventListener("mousedown", onDocMouseDown, true);
            }
        };
        opts.addEventListener("focusin", showBox);
        opts.addEventListener("focusout", (e) => {
            if (e.relatedTarget && opts.contains(e.relatedTarget)) return;
            hideBox();
        });
    }

    _renderFilterPanelContents(panel, inner) {
        // The panel is a child of the toolbar button (for native
        // type="menu" toggle), so positioning is handled by XUL via
        // the panel's `position="after_end"` attribute. We size the
        // inner contents to span from the search-box-left to the
        // items-pane-right; XUL slides the popup leftward as needed
        // because we right-align it to the (right-of-search) button.
        const doc = panel.ownerDocument;
        // Section titles are hidden, so we no longer pad the popup
        // with the legacy 150 px title column. Width is just enough
        // to span the items-pane area, capped at 320 px so the
        // popup stays compact even on wide screens.
        const tbSearch = doc.getElementById("zotero-tb-search");
        const itemsPane = doc.getElementById("zotero-items-pane");
        if (tbSearch && itemsPane) {
            try {
                const sRect = tbSearch.getBoundingClientRect();
                const pRect = itemsPane.getBoundingClientRect();
                const span = Math.round(pRect.right - sRect.left) - 8;
                const w = Math.min(280, Math.max(200, span));
                inner.style.minWidth = w + "px";
                inner.style.maxWidth = w + "px";
                inner.style.setProperty("--wv-title-col", "0px");
            } catch (e) {}
        }

        // Clear any prior content (this fires every popupshowing).
        while (inner.firstChild) inner.removeChild(inner.firstChild);

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const colorSection = doc.createElementNS(NS_HTML, "div");
        const typeSection = doc.createElementNS(NS_HTML, "div");
        const commentSection = doc.createElementNS(NS_HTML, "div");
        // The Attachment File Type section also hosts the Item Note
        // tile (right of the file-type icons, after a vertical bar).
        const attachmentFileTypeSection = doc.createElementNS(NS_HTML, "div");
        // Has Annotations tri-state — Attachment group, below the
        // file-type / item-note row.
        const hasAnnotationsSection = doc.createElementNS(NS_HTML, "div");
        // Item Type row — sits ABOVE the unified search section.
        // Has its own trigger + selected-icon chips. The Standalone
        // Note tile is also rendered inline at the right end of
        // this row (after a vertical separator).
        const itemTypeRowSection = doc.createElementNS(NS_HTML, "div");
        // Parent-targeting Has-* row (Has DOI / Has URL / Has
        // Abstract / Has Attachment File) — Parent group.
        const parentHasFieldsSection = doc.createElementNS(NS_HTML, "div");
        // Unified search section — one search input + suggestion box
        // with a mode dropdown that switches between Tag, Author,
        // Added By, Collection, Saved Search.
        const searchSection = doc.createElementNS(NS_HTML, "div");
        // Cross-level icon-trigger group (Has Related, Has Link).
        const crossLevelSection = doc.createElementNS(NS_HTML, "div");

        // Selection Target uses include/exclude semantics like every
        // other filter group: empty include + empty exclude means
        // "show all". Picking a kind narrows to just that kind;
        // alt+clicking excludes the kind. The previous "all on"
        // default was inconsistent with the rest of the panel.
        if (!this._filterState.selectionTarget) {
            this._filterState.selectionTarget = {};
        }
        if (!this._filterState.selectionTargetExclude) {
            this._filterState.selectionTargetExclude = {};
        }
        const selTarget = this._filterState.selectionTarget;
        const selTargetExc = this._filterState.selectionTargetExclude;
        if (!this._filterState.collections) this._filterState.collections = [];
        if (!this._filterState.collectionsExclude) this._filterState.collectionsExclude = [];
        if (!this._filterState.savedSearches) this._filterState.savedSearches = [];
        if (!this._filterState.savedSearchesExclude) this._filterState.savedSearchesExclude = [];

        // Top bar — Alt+click hint on the left, then a text "Clear"
        // button and the red × ("Clear and Close") on the right.
        // Lives at the very top of the popup so the × ends up roughly
        // above the rightmost Annotation Color swatch instead of
        // pushing the popup wider on a separate header row.
        const topBar = doc.createElementNS(NS_HTML, "div");
        topBar.className = "wv-filter-top-bar";
        const hint = doc.createElementNS(NS_HTML, "span");
        hint.className = "wv-filter-top-hint";
        hint.textContent = "Alt+click to exclude";
        topBar.appendChild(hint);
        // "Clear" — text button, clears all filters but keeps the
        // popup open so the user can rebuild from scratch without
        // re-opening the panel.
        const clearTextBtn = doc.createElementNS(NS_HTML, "button");
        clearTextBtn.type = "button";
        clearTextBtn.className = "wv-filter-clear-btn";
        clearTextBtn.textContent = "Clear";
        clearTextBtn.title = "Clear all filters (keep this window open)";
        clearTextBtn.setAttribute("aria-label", "Clear all filters");
        clearTextBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._clearAllFilters();
        });
        topBar.appendChild(clearTextBtn);
        const clearBtn = doc.createElementNS(NS_HTML, "button");
        clearBtn.type = "button";
        clearBtn.className = "wv-filter-clear-icon";
        // The × glyph is drawn via CSS pseudo-elements (two rotated
        // bars) for pixel-perfect centering. `aria-label` carries the
        // semantics for screen readers; tooltip is set via `title`.
        clearBtn.setAttribute("aria-label", "Clear and Close");
        clearBtn.title = "Clear and Close";
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._clearAllFilters();
            // Also dismiss the popup — there's nothing left to
            // interact with once every filter is cleared.
            try { panel.hidePopup(); } catch (err) {}
        });
        topBar.appendChild(clearBtn);
        inner.appendChild(topBar);
        const renderHeader = () => {
            const active = this._isFilterActive(this._filterState);
            clearTextBtn.style.visibility = active ? "" : "hidden";
            clearBtn.style.visibility = active ? "" : "hidden";
        };

        // Helper: insert a labeled group header above a section
        // group. The optional `todo` text appears in italics next
        // to the title — used on "Multi scope" to flag pending work.
        // `rightSlot`, when provided, is appended on the right side
        // of the header (margin-left: auto); used by the first
        // header to host the Clear-filter × button.
        const addGroupHeader = (label, todo, rightSlot) => {
            const hdr = doc.createElementNS(NS_HTML, "div");
            hdr.className = "wv-filter-group-header";
            const t = doc.createElementNS(NS_HTML, "span");
            t.className = "wv-filter-group-header-title";
            t.textContent = label;
            hdr.appendChild(t);
            if (todo) {
                const td = doc.createElementNS(NS_HTML, "span");
                td.className = "wv-filter-group-header-todo";
                td.textContent = todo;
                hdr.appendChild(td);
            }
            if (rightSlot) {
                rightSlot.style.marginLeft = "auto";
                hdr.appendChild(rightSlot);
            }
            inner.appendChild(hdr);
        };

        // "Added By" is meaningful only in group libraries (where
        // multiple users can contribute) — hide it in the user's
        // personal library since `createdByUserID` is never set
        // there. Library is sampled at panel-open time so switching
        // libraries while the panel is closed picks up automatically
        // on next open.
        const win = doc.defaultView;
        const activeLibraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        const isGroupLibrary = activeLibraryID
            !== Zotero.Libraries.userLibraryID;

        // Section order, top → bottom:
        //   Annotation  — color / type / comment
        //   Attachment  — file-type / item-note / has-annotations
        //   Parent      — Item Type / standalone note / has-fields
        //   Cross-level — has-* + multi-select search
        //   Selection Target — Ctrl+A target picker (bottom bar)
        addGroupHeader("Annotation");
        inner.appendChild(colorSection);
        inner.appendChild(typeSection);
        inner.appendChild(commentSection);

        addGroupHeader("Attachment");
        // attachmentFileTypeSection now also renders the Item Note
        // tile inline (right of the file-type icons, after a thin
        // vertical separator).
        inner.appendChild(attachmentFileTypeSection);
        inner.appendChild(hasAnnotationsSection);

        addGroupHeader("Parent");
        inner.appendChild(itemTypeRowSection);
        // Item Type row already hosts the Standalone Note tile at
        // its right end (after a vertical separator), so the only
        // section to append here is the Has-fields row.
        inner.appendChild(parentHasFieldsSection);

        addGroupHeader("Cross-level");
        inner.appendChild(crossLevelSection);
        // Multi-selection search bar (Tag / Author / Added By /
        // Collection / Saved Search) — sits in the Cross-level
        // group, directly under the Has Related / Has Link icons,
        // since these searches all match across row kinds the same
        // way the icon triggers do.
        inner.appendChild(searchSection);

        // Bottom: Selection Target bar (controls Ctrl+A scope only,
        // doesn't affect filtering itself).
        const selChoices = [
            { key: "parent",     label: "Parent",
              tip: "Regular items + standalone notes will be selectable in Ctrl+A." },
            { key: "attachment", label: "Attachment",
              tip: "Attachment rows will be selectable in Ctrl+A." },
            { key: "annotation", label: "Annotation",
              tip: "Annotation rows will be selectable in Ctrl+A." },
        ];
        const buildToggleBar = (label, labelTip, stateInc, stateExc, choices, onToggle, extraClass) => {
            const bar = doc.createElementNS(NS_HTML, "div");
            bar.className = "wv-filter-scope-bar"
                + (extraClass ? " " + extraClass : "");
            const lbl = doc.createElementNS(NS_HTML, "span");
            lbl.className = "wv-filter-scope-bar-label";
            lbl.textContent = label;
            if (labelTip) lbl.title = labelTip;
            bar.appendChild(lbl);
            for (const t of choices) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt wv-filter-scope-toggle";
                btn.textContent = t.label;
                btn.title = t.tip || t.label;
                if (stateInc[t.key]) btn.dataset.selected = "true";
                if (stateExc[t.key]) btn.dataset.excluded = "true";
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onToggle(t.key, !!e.altKey);
                });
                bar.appendChild(btn);
            }
            return bar;
        };
        // Tri-state toggle for object-shaped state (key → bool).
        // Mirrors `_toggleIncludeExclude`'s semantics:
        //   plain click   : neutral → include → neutral
        //   alt+click     : neutral → exclude → neutral
        //   crossing modes: clears the other flag.
        const toggleObjTriState = (inc, exc, key, altKey) => {
            const wasInc = !!inc[key];
            const wasExc = !!exc[key];
            delete inc[key];
            delete exc[key];
            if (altKey) {
                if (!wasExc) exc[key] = true;
            }
            else {
                if (!wasInc) inc[key] = true;
            }
        };
        const selBar = buildToggleBar(
            "Selection Target:",
            "Pick which row kinds Ctrl+A selects in the items list. Empty = all kinds. Click a kind to narrow, Alt+click to exclude. Excluded kinds are dimmed and skipped by select-all.",
            selTarget, selTargetExc, selChoices,
            (key, altKey) => {
                toggleObjTriState(selTarget, selTargetExc, key, altKey);
                this._renderFilterPanelContents(panel, inner);
                this._applySelectionTargetVisuals();
            },
            "wv-filter-seltarget-bar wv-filter-bottom-bar"
        );
        inner.appendChild(selBar);

        const searchCtx = { libraryID: activeLibraryID, isGroupLibrary, panel };
        const refreshAll = () => {
            this._renderColorSection(doc, colorSection, refreshAll);
            this._renderTypeSection(doc, typeSection, refreshAll);
            this._renderHasCommentSection(doc, commentSection, refreshAll);
            this._renderAttachmentFileTypeSection(doc, attachmentFileTypeSection, refreshAll);
            this._renderHasAnnotationsSection(doc, hasAnnotationsSection, refreshAll);
            this._renderItemTypeRow(doc, itemTypeRowSection, refreshAll, searchCtx);
            this._renderParentHasFieldsSection(doc, parentHasFieldsSection, refreshAll);
            this._renderUnifiedSearchSection(doc, searchSection, refreshAll, searchCtx);
            this._renderCrossLevelSection(doc, crossLevelSection, refreshAll);
            renderHeader();
        };
        refreshAll();
    }

    /** Re-edit a chip → open the same panel by triggering the toolbar
     *  button. Routing through the button keeps every "show panel"
     *  path on the same native type="menu" toggle, which means the
     *  open/close behaviour stays consistent regardless of entry. */
    _openFilterPanel() {
        const win = Zotero.getMainWindow();
        if (!win) return;
        const doc = win.document;
        const tbBtn = doc.getElementById("wv-filter-tb-button");
        if (!tbBtn) return;
        // `open` is the XUL menubutton API for programmatically
        // showing the child popup; mirrors a click on the button.
        try { tbBtn.open = true; } catch (e) {}
    }

    /** Unified search section — one search input with a mode dropdown
     *  on the left that switches between Tag, Author, Added By,
     *  Collection, and Saved Search. Suggestions appear in the same
     *  box; clicking a suggestion adds it to the appropriate state
     *  field (per-group for Tag/Author/Added By, global for
     *  Collection/Saved Search).
     *
     *  Each mode keeps its own search query and visual selection
     *  state, so switching modes preserves what the user typed and
     *  picked previously. */
    _renderUnifiedSearchSection(doc, section, refreshAll, ctx) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Search";
        title.title = "Pick a facet from the dropdown then type to filter that facet's values. Click a suggestion to add it. Saved Search and Collection apply globally; Tag, Author and Added By apply to the current OR group.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const libraryID = ctx.libraryID;
        const isGroupLibrary = ctx.isGroupLibrary;
        const panel = ctx.panel;

        // Mode definitions. Each mode supplies async value-loading +
        // selection accessors. `ranked` enables the exact / prefix /
        // substring tiering used by Tag / Author / Added By.
        const modes = [];
        modes.push({
            key: "tag",
            label: "Tag",
            placeholder: "Search tags…",
            queryField: "_tagSearchQuery",
            emptyAll: "No annotation tags in this library",
            emptyFiltered: "No matching tags",
            ranked: true,
            getValues: async () => {
                if (this._cachedAnnotationTags) return this._cachedAnnotationTags;
                const t = await this._collectAnnotationTags(libraryID);
                this._cachedAnnotationTags = t;
                return t;
            },
            getSelectedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationTag) || []),
            getExcludedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationTagExclude) || []),
            valueId: (v) => v,
            valueLabel: (v) => v,
            getLabelById: (id) => id,
            // Tag icon shows ONLY on selected pills, not in the
            // suggestion list — the list rows are labelled by name
            // and the icon would just add visual weight.
            iconInList: false,
            // Tag icon, themed via Mozilla `-moz-context-properties`
            // so its `context-fill` paths take currentColor. Coloured
            // tags (per `Zotero.Tags.getColor`) override the default
            // with the tag's user-assigned hue. Default falls back to
            // `--accent-orange` — the same variable Zotero uses for
            // the Tags section in the item pane sidenav (see
            // scss/abstracts/_variables.scss → `$item-pane-sections:
            // ("tags": var(--accent-orange))`), so the chip reads as
            // visually consistent with that section.
            renderIcon: (parent, id) => {
                const NS = "http://www.w3.org/1999/xhtml";
                const icon = parent.ownerDocument.createElementNS(NS, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/tag.svg";
                let color = "var(--accent-orange)";
                try {
                    const c = Zotero.Tags.getColor(libraryID, id);
                    if (c && c.color) color = c.color;
                } catch (e) {}
                icon.style.color = color;
                parent.insertBefore(icon, parent.firstChild);
            },
            // Decorate suggestion-list rows so coloured / emoji tags
            // render the same way the tag selector does:
            // coloured non-emoji → bold name with a small coloured
            // dot before it; emoji tags → bold (the emoji glyph is
            // already in the name); plain → no special styling.
            // The dot itself is drawn by the `.wv-filter-tag-colored`
            // CSS rule via a `::before` pseudo, painted with the
            // `--wv-tag-color` CSS variable we set inline.
            styleButton: (btn, id /*, selected */) => {
                let color = null;
                try {
                    const c = Zotero.Tags.getColor(libraryID, id);
                    if (c && c.color) color = c.color;
                } catch (e) {}
                let isEmoji = false;
                try {
                    isEmoji = !!(Zotero.Utilities.Internal
                        && Zotero.Utilities.Internal.containsEmoji
                        && Zotero.Utilities.Internal.containsEmoji(id));
                } catch (e) {}
                if (color) {
                    btn.classList.add("wv-filter-tag-colored");
                    btn.style.setProperty("--wv-tag-color", color);
                }
                if (isEmoji) btn.classList.add("wv-filter-tag-emoji");
            },
            onToggle: (id, sel, altKey) => {
                const g = this._activeGroup();
                if (!g) return;
                const exc = new Set(g.annotationTagExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                g.annotationTag = [...sel];
                g.annotationTagExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        modes.push({
            key: "publication",
            label: "Publication",
            placeholder: "Search publications…",
            queryField: "_publicationSearchQuery",
            emptyAll: "No publications in this library",
            emptyFiltered: "No matching publications",
            ranked: true,
            getValues: async () => {
                if (this._cachedPublications) return this._cachedPublications;
                const t = await this._collectPublications(libraryID);
                this._cachedPublications = t;
                return t;
            },
            getSelectedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().publication) || []),
            getExcludedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().publicationExclude) || []),
            valueId: (v) => v,
            valueLabel: (v) => v,
            getLabelById: (id) => id,
            onToggle: (id, sel, altKey) => {
                const g = this._activeGroup();
                if (!g) return;
                const exc = new Set(g.publicationExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                g.publication = [...sel];
                g.publicationExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        modes.push({
            key: "author",
            label: "Author",
            placeholder: "Search authors…",
            queryField: "_authorSearchQuery",
            emptyAll: "No annotation authors in this library",
            emptyFiltered: "No matching authors",
            ranked: true,
            getValues: async () => {
                if (this._cachedAnnotationAuthors) return this._cachedAnnotationAuthors;
                const a = await this._collectAnnotationAuthors(libraryID);
                this._cachedAnnotationAuthors = a;
                return a;
            },
            getSelectedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationAuthor) || []),
            getExcludedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationAuthorExclude) || []),
            valueId: (v) => v,
            valueLabel: (v) => v,
            getLabelById: (id) => id,
            onToggle: (id, sel, altKey) => {
                const g = this._activeGroup();
                if (!g) return;
                const exc = new Set(g.annotationAuthorExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                g.annotationAuthor = [...sel];
                g.annotationAuthorExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        if (isGroupLibrary) {
            modes.push({
                key: "addedBy",
                label: "Added By",
                placeholder: "Search users…",
                queryField: "_addedBySearchQuery",
                emptyAll: "No tracked creators in this library",
                emptyFiltered: "No matching users",
                ranked: true,
                getValues: async () => {
                    if (this._cachedAddedByUsers) return this._cachedAddedByUsers;
                    const u = await this._collectAddedByUsers(libraryID);
                    this._cachedAddedByUsers = u;
                    return u;
                },
                getSelectedSet: () => new Set(
                    (this._activeGroup() && this._activeGroup().addedBy) || []),
                getExcludedSet: () => new Set(
                    (this._activeGroup() && this._activeGroup().addedByExclude) || []),
                valueId: (v) => v,
                valueLabel: (v) => v,
                getLabelById: (id) => id,
                onToggle: (id, sel, altKey) => {
                    const g = this._activeGroup();
                    if (!g) return;
                    const exc = new Set(g.addedByExclude || []);
                    if (altKey) {
                        if (exc.has(id)) exc.delete(id);
                        else { exc.add(id); sel.delete(id); }
                    } else {
                        if (sel.has(id)) sel.delete(id);
                        else { sel.add(id); exc.delete(id); }
                    }
                    g.addedBy = [...sel];
                    g.addedByExclude = [...exc];
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                },
                styleButton: (btn, val, sel) => {
                    if (!this._getEnableAddedByColors()) return;
                    const colour = this._colorForUser(val);
                    btn.style.color = colour;
                    btn.style.borderColor = this._withAlpha(colour, 0.4);
                    btn.style.backgroundColor = this._withAlpha(
                        colour, sel.has(val) ? 0.28 : 0.12);
                },
            });
        }
        // (Item Type now lives in its own dedicated row above the
        // search box — see `_renderItemTypeRow`.)
        modes.push({
            key: "collection",
            label: "Collection",
            placeholder: "Search collections…",
            queryField: "_collectionSearchQuery",
            emptyAll: "No collections in this library",
            emptyFiltered: "No matching collections",
            ranked: false,
            verticalList: true,
            getValues: async () => {
                try {
                    return (Zotero.Collections.getByLibrary(libraryID, true) || [])
                        .map(c => ({ id: c.id, name: c.name }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                } catch (e) {
                    Zotero.debug("[Weavero][filter] collections enum err: " + e);
                    return [];
                }
            },
            getSelectedSet: () => new Set(this._filterState.collections || []),
            getExcludedSet: () => new Set(
                this._filterState.collectionsExclude || []),
            valueId: (v) => v.id,
            valueLabel: (v) => v.name,
            getLabelById: (id) => {
                try {
                    const c = Zotero.Collections.get(id);
                    return c ? c.name : String(id);
                } catch (e) { return String(id); }
            },
            // Use Zotero's `.icon icon-css icon-collection` class
            // chain so the icon picks up the themed blue folder
            // shipped under chrome://zotero/skin/collection-tree/...
            // (same image as the collections pane, theme-aware).
            renderIcon: (parent, id) => {
                const NS = "http://www.w3.org/1999/xhtml";
                const icon = parent.ownerDocument.createElementNS(NS, "span");
                icon.className = "icon icon-css icon-collection";
                parent.insertBefore(icon, parent.firstChild);
            },
            onToggle: (id, sel, altKey) => {
                const exc = new Set(
                    this._filterState.collectionsExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                this._filterState.collections = [...sel];
                this._filterState.collectionsExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        modes.push({
            key: "savedSearch",
            label: "Saved Search",
            placeholder: "Search saved searches…",
            queryField: "_savedSearchSearchQuery",
            emptyAll: "No saved searches in this library",
            emptyFiltered: "No matching saved searches",
            ranked: false,
            verticalList: true,
            getValues: async () => {
                try {
                    return (Zotero.Searches.getByLibrary(libraryID) || [])
                        .map(s => ({ id: s.id, name: s.name }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                } catch (e) {
                    Zotero.debug("[Weavero][filter] saved searches enum err: " + e);
                    return [];
                }
            },
            getSelectedSet: () => new Set(this._filterState.savedSearches || []),
            getExcludedSet: () => new Set(
                this._filterState.savedSearchesExclude || []),
            valueId: (v) => v.id,
            valueLabel: (v) => v.name,
            getLabelById: (id) => {
                try {
                    const s = Zotero.Searches.get(id);
                    return s ? s.name : String(id);
                } catch (e) { return String(id); }
            },
            // Use Zotero's `.icon icon-css icon-search` so the
            // saved-search icon picks up the themed colour from
            // chrome://zotero/skin/collection-tree/... — same as
            // the collections pane.
            renderIcon: (parent, id) => {
                const NS = "http://www.w3.org/1999/xhtml";
                const icon = parent.ownerDocument.createElementNS(NS, "span");
                icon.className = "icon icon-css icon-search";
                parent.insertBefore(icon, parent.firstChild);
            },
            onToggle: async (id, sel, altKey) => {
                const exc = new Set(
                    this._filterState.savedSearchesExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                this._filterState.savedSearches = [...sel];
                this._filterState.savedSearchesExclude = [...exc];
                await this._refreshSavedSearchResults();
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });

        // Resolve the active mode (default → first in list / "tag").
        if (!this._unifiedSearchMode
            || !modes.find(m => m.key === this._unifiedSearchMode)) {
            this._unifiedSearchMode = modes[0].key;
        }
        let mode = modes.find(m => m.key === this._unifiedSearchMode);

        // Top row — dropdown trigger (▾) + search input on one line.
        // The trigger shows ONLY a chevron (no label), matching
        // Zotero's quick-search dropmarker. Selected mode is read
        // off the search input's placeholder; tooltip on hover gives
        // the affordance.
        const topRow = doc.createElementNS(NS_HTML, "div");
        topRow.className = "wv-filter-search-row";
        opts.appendChild(topRow);

        // Search wrap — a single rounded box that holds BOTH the
        // ▾ trigger and the text input, mirroring Zotero's quick
        // search field (where the dropmarker is embedded inside
        // the search field rather than sitting beside it).
        const searchWrap = doc.createElementNS(NS_HTML, "div");
        searchWrap.className = "wv-filter-search-wrap";
        topRow.appendChild(searchWrap);

        const trigger = doc.createElementNS(NS_HTML, "button");
        trigger.type = "button";
        trigger.className = "wv-filter-mode-trigger";
        trigger.textContent = "▾"; // ▾
        trigger.title = "Choose what to filter";
        searchWrap.appendChild(trigger);

        // XUL menupopup — renders as its own toplevel widget so it
        // can extend BEYOND the parent <panel>'s clipping bounds.
        // An HTML popover here would be clipped at the panel's edge,
        // hiding any items that fall below it (the Search section
        // sits low in the panel).
        //
        // Park it in `mainPopupSet`, the standard XUL container for
        // toplevel popups in the main window. Nesting it inside the
        // wv-filter-popup <panel> leaves openPopup() as a no-op
        // (popups inside popups don't initialize correctly here).
        const popupHost = doc.getElementById("mainPopupSet")
            || doc.documentElement;
        const STALE_MENUS = popupHost.querySelectorAll(
            "menupopup.wv-filter-mode-menupopup");
        for (const m of STALE_MENUS) m.remove();
        const menuPopup = doc.createXULElement("menupopup");
        menuPopup.className = "wv-filter-mode-menupopup";
        popupHost.appendChild(menuPopup);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = mode.label;
        search.value = this[mode.queryField] || "";
        searchWrap.appendChild(search);

        // Suggestion box — appears directly under the search row
        // (only when the input has focus). Stacked above the
        // selected-pills list so picks fall down into the chip
        // area, mirroring the visual flow.
        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        // Selected-pills list — sits below the suggestion box,
        // always visible when there's at least one selection.
        const selectedList = doc.createElementNS(NS_HTML, "div");
        selectedList.className = "wv-filter-selected-list";
        opts.appendChild(selectedList);

        // Inline focus wiring — wired on the SEARCH INPUT only so
        // clicking the mode trigger doesn't pop the suggestion box.
        // Outside-clicks (anywhere not in topRow / box) collapse the
        // box and blur the input.
        let onDocMouseDown = null;
        const hideBox = () => {
            box.style.display = "none";
            if (onDocMouseDown) {
                doc.removeEventListener("mousedown", onDocMouseDown, true);
                onDocMouseDown = null;
            }
        };
        const showBox = () => {
            if (box.style.display !== "none") return;
            box.style.display = "";
            if (!onDocMouseDown) {
                onDocMouseDown = (e) => {
                    if (box.contains(e.target)) return;
                    if (topRow.contains(e.target)) return;
                    try { search.blur(); } catch (err) {}
                    hideBox();
                };
                doc.addEventListener("mousedown", onDocMouseDown, true);
            }
        };
        search.addEventListener("focus", showBox);
        search.addEventListener("blur", (e) => {
            if (e.relatedTarget && box.contains(e.relatedTarget)) return;
            hideBox();
        });

        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        box.appendChild(placeholder);

        const SUGGEST_LIMIT = 10;
        const rankFn = (all, q) => {
            const exact = [], pre = [], sub = [];
            for (const v of all) {
                const lc = mode.valueLabel(v).toLowerCase();
                if (lc === q) exact.push(v);
                else if (lc.startsWith(q)) pre.push(v);
                else if (lc.includes(q)) sub.push(v);
            }
            return [...exact, ...pre, ...sub];
        };

        let cached = null;

        // Render chips below the search box for values picked across
        // ALL modes — both include AND exclude. Switching modes
        // doesn't drop pills picked under previous modes. Excluded
        // pills get the red border + diagonal slash, matching the
        // icon-grid Alt+click visual.
        //
        // Insertion-order preservation: `this._pillOrder` is a
        // session list of stable pill keys ("modeKey:i:id" or
        // "modeKey:e:id"). Each render prunes stale keys (values
        // no longer selected/excluded) and appends any new ones —
        // so existing pills stay where they were and additions land
        // at the end of the row, regardless of mode-iteration order.
        const renderSelectedList = () => {
            while (selectedList.firstChild) {
                selectedList.removeChild(selectedList.firstChild);
            }
            if (!this._pillOrder) this._pillOrder = [];
            const buildPill = (m, id, isExclude) => {
                const label = m.getLabelById
                    ? m.getLabelById(id) : String(id);
                const pill = doc.createElementNS(NS_HTML, "span");
                pill.className = "wv-filter-selected-pill";
                if (isExclude) pill.dataset.exclude = "true";
                if (m.pillIconOnly) pill.dataset.iconOnly = "true";
                pill.title = (isExclude ? "Not " : "")
                    + m.label + ": " + label;
                if (m.renderIcon) {
                    m.renderIcon(pill, id);
                } else {
                    const modeLbl = doc.createElementNS(
                        NS_HTML, "span");
                    modeLbl.className = "wv-filter-selected-pill-mode";
                    modeLbl.textContent = (isExclude ? "Not " : "")
                        + m.label + ":";
                    pill.appendChild(modeLbl);
                }
                if (!m.pillIconOnly) {
                    const lbl = doc.createElementNS(NS_HTML, "span");
                    lbl.className = "wv-filter-selected-pill-label";
                    lbl.textContent = label;
                    pill.appendChild(lbl);
                }
                const x = doc.createElementNS(NS_HTML, "button");
                x.type = "button";
                x.className = "wv-filter-selected-pill-x";
                x.textContent = "×";
                x.title = "Remove";
                x.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    // Always pass the INCLUDE set as `sel` — onToggle's
                    // first arg is treated internally as the include
                    // side; passing the exclude set there used to
                    // overwrite the include array with the exclude
                    // contents when both directions were active.
                    // `altKey=isExclude` tells onToggle to operate on
                    // the exclude side when the pill came from there.
                    await m.onToggle(id, m.getSelectedSet(), isExclude);
                    renderSelectedList();
                    renderButtons();
                });
                // Alt+click on the pill body (not the ×) switches
                // the pill from include → exclude or back, the same
                // way Alt+click in the suggestion list does on a
                // fresh value. The ×'s own handler stops propagation
                // so this only fires for clicks on the pill itself.
                pill.addEventListener("click", async (e) => {
                    if (!e.altKey) return;
                    e.stopPropagation();
                    await m.onToggle(id, m.getSelectedSet(), !isExclude);
                    renderSelectedList();
                    renderButtons();
                });
                pill.appendChild(x);
                selectedList.appendChild(pill);
            };
            // Build the set of currently-active pills + a lookup
            // from stable key → {mode, id, isExclude}.
            const activeMap = new Map();
            for (const m of modes) {
                let sel = null, exc = null;
                try { sel = m.getSelectedSet(); } catch (e) {}
                try {
                    if (m.getExcludedSet) exc = m.getExcludedSet();
                } catch (e) {}
                if (sel && sel.size) {
                    for (const id of sel) {
                        const k = m.key + ":i:" + id;
                        activeMap.set(k, { m, id, isExclude: false });
                    }
                }
                if (exc && exc.size) {
                    for (const id of exc) {
                        const k = m.key + ":e:" + id;
                        activeMap.set(k, { m, id, isExclude: true });
                    }
                }
            }
            // Drop stale keys (values that are no longer selected
            // or excluded) and append any newly-active keys.
            this._pillOrder = this._pillOrder.filter(k => activeMap.has(k));
            const inOrder = new Set(this._pillOrder);
            for (const k of activeMap.keys()) {
                if (!inOrder.has(k)) this._pillOrder.push(k);
            }
            // Render in the preserved order.
            for (const k of this._pillOrder) {
                const entry = activeMap.get(k);
                if (entry) buildPill(entry.m, entry.id, entry.isExclude);
            }
        };

        const renderButtons = () => {
            if (!cached) return;
            while (box.firstChild) box.removeChild(box.firstChild);
            // Vertical mode (Item Type / Collection / Saved Search):
            // one row per value, icon + label. `columns` (default 1)
            // turns the box into a grid for facets with many short
            // labels (Item Type → 2-col).
            if (mode.verticalList) {
                box.dataset.vertical = "true";
                box.dataset.columns = String(mode.columns || 1);
            } else {
                box.removeAttribute("data-vertical");
                box.removeAttribute("data-columns");
            }
            const q = (this[mode.queryField] || "").trim().toLowerCase();
            const selected = mode.getSelectedSet();
            const excluded = mode.getExcludedSet
                ? mode.getExcludedSet() : new Set();
            // Real (non-separator) candidates with already-included AND
            // already-excluded values dropped — both states show as
            // pills below, so neither needs to appear in the suggestions.
            const isPicked = (id) => selected.has(id) || excluded.has(id);
            const candidates = cached.filter(
                v => !v.separator && !isPicked(mode.valueId(v)));
            let list;
            if (!q) {
                // Empty query → show full cache, preserving group
                // separators only between two surviving groups.
                list = [];
                let lastWasItem = false;
                let pendingSep = null;
                for (const v of cached) {
                    if (v.separator) { pendingSep = v; continue; }
                    if (isPicked(mode.valueId(v))) continue;
                    if (pendingSep && lastWasItem) list.push(pendingSep);
                    pendingSep = null;
                    list.push(v);
                    lastWasItem = true;
                }
            }
            else if (mode.ranked) list = rankFn(candidates, q);
            else list = candidates.filter(
                v => mode.valueLabel(v).toLowerCase().includes(q));
            const overflow = q ? Math.max(0, list.length - SUGGEST_LIMIT) : 0;
            list = q ? list.slice(0, SUGGEST_LIMIT) : list;
            if (!list.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q ? mode.emptyFiltered : mode.emptyAll;
                box.appendChild(empty);
                return;
            }
            for (const v of list) {
                if (v.separator) {
                    const sep = doc.createElementNS(NS_HTML, "div");
                    sep.className = "wv-filter-list-separator";
                    box.appendChild(sep);
                    continue;
                }
                const id = mode.valueId(v);
                const label = mode.valueLabel(v);
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = label;
                if (mode.renderIcon && mode.iconInList !== false) {
                    mode.renderIcon(btn, mode.valueId(v));
                }
                // Label in a span so ellipsis works inside flex-row
                // (vertical-list) layout. The default pill layout
                // already handles ellipsis via `display: inline-block`
                // on the button, but the span is harmless there.
                const lblSpan = doc.createElementNS(NS_HTML, "span");
                lblSpan.className = "wv-filter-opt-label";
                lblSpan.textContent = label;
                btn.appendChild(lblSpan);
                if (mode.styleButton) mode.styleButton(btn, id, selected);
                btn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const altKey = !!e.altKey;
                    const wasSelected = selected.has(id);
                    await mode.onToggle(id, selected, altKey);
                    // Mode hook for ADDS only — used by Item Type
                    // to bump its own filter-MRU. Exclude-toggles
                    // also count as a "use" for MRU purposes.
                    if (!wasSelected && mode.onAdd) {
                        try { mode.onAdd(id); } catch (err) {}
                    }
                    // Pick → clear search, close suggestions, blur,
                    // and surface the choice as a chip below.
                    this[mode.queryField] = "";
                    search.value = "";
                    hideBox();
                    try { search.blur(); } catch (err) {}
                    renderSelectedList();
                    renderButtons();
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };

        const loadAndRender = async () => {
            try {
                cached = await mode.getValues();
                if (!section.isConnected) return;
                renderSelectedList();
                renderButtons();
            } catch (e) {
                Zotero.debug("[Weavero][filter] unified search load err: " + e);
            }
        };

        const switchMode = (newKey) => {
            const next = modes.find(m => m.key === newKey);
            if (!next) return;
            mode = next;
            this._unifiedSearchMode = next.key;
            search.placeholder = mode.label;
            search.value = this[mode.queryField] || "";
            cached = null;
            // Clear any chips from the prior mode while we load.
            while (selectedList.firstChild) {
                selectedList.removeChild(selectedList.firstChild);
            }
            while (box.firstChild) box.removeChild(box.firstChild);
            const ph = doc.createElementNS(NS_HTML, "span");
            ph.style.opacity = "0.5";
            ph.style.fontSize = "12px";
            ph.textContent = "Loading…";
            box.appendChild(ph);
            loadAndRender();
        };

        // Populate the menupopup. Mark the active mode with
        // `checked="true"` so it shows a check mark; rebuilt on each
        // open so the indicator tracks the current mode.
        const buildMenu = () => {
            while (menuPopup.firstChild) {
                menuPopup.removeChild(menuPopup.firstChild);
            }
            for (const m of modes) {
                const item = doc.createXULElement("menuitem");
                item.setAttribute("label", m.label);
                item.setAttribute("type", "radio");
                item.setAttribute("name", "wv-filter-mode");
                if (m.key === mode.key) item.setAttribute("checked", "true");
                item.addEventListener("command", () => {
                    switchMode(m.key);
                    try { search.focus(); } catch (err) {}
                });
                menuPopup.appendChild(item);
            }
        };

        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (menuPopup.state === "open" || menuPopup.state === "showing") {
                menuPopup.hidePopup();
                return;
            }
            buildMenu();
            // `after_start` = below the trigger, left-aligned.
            // Native XUL popup escapes the parent panel's clipping.
            menuPopup.openPopup(trigger, "after_start", 0, 2,
                false, false);
        });

        search.addEventListener("input", () => {
            this[mode.queryField] = search.value || "";
            renderButtons();
        });

        loadAndRender();
    }

    /** Item Type row — sits above the unified Search box. Layout:
     *
     *    [▾]  [icon] [icon] [icon] …
     *
     *  The ▾ trigger toggles a vertical 2-column list of types
     *  (icon + localised name) below the row. Picking a type adds
     *  its bare icon as a chip to the right of the trigger;
     *  clicking the chip removes it. Alt+click on a list row
     *  excludes (red border + slash). Recently-used types come
     *  first in the list, identical to the previous Item Type
     *  picker in the unified search. */
    _renderItemTypeRow(doc, section, refreshAll, ctx) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section wv-filter-itype-row";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        // Hidden title (CSS hides .wv-filter-section-title globally).
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Item Type";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        // Trigger row — native XUL menulist (matches the "Search in
        // library" trigger in advanced search) + selected-icon chips
        // inline. Using `<menulist native="true">` gives us the exact
        // platform-native chrome (border, background, dropmarker)
        // that advanced search uses, without any CSS approximation.
        // The native popup it would normally open is suppressed via
        // `popupshowing.preventDefault()` — we keep the custom 2-col
        // HTML grid below so picked types still appear with icons,
        // and so Alt+click-to-exclude works the way it does on every
        // other facet in the panel.
        const triggerRow = doc.createElementNS(NS_HTML, "div");
        triggerRow.className = "wv-filter-itype-trigger-row";
        opts.appendChild(triggerRow);

        const trigger = doc.createXULElement("menulist");
        trigger.setAttribute("native", "true");
        trigger.setAttribute("label", "Item Type");
        trigger.className = "wv-filter-itype-trigger";
        trigger.setAttribute("tooltiptext", "Item Type — click to choose");
        // Empty popup — required for the menulist to render its
        // dropmarker. The popupshowing handler cancels the native
        // open and instead toggles our custom 2-col HTML grid.
        // Using `popupshowing` (rather than `click`) catches every
        // way the menulist tries to open (mouse, keyboard).
        const triggerPopup = doc.createXULElement("menupopup");
        trigger.appendChild(triggerPopup);
        triggerRow.appendChild(trigger);

        const selectedRow = doc.createElementNS(NS_HTML, "div");
        selectedRow.className = "wv-filter-itype-selected";
        triggerRow.appendChild(selectedRow);

        // Standalone Note tile, right end of the trigger row, after
        // a thin vertical separator. The selectedRow above takes
        // all remaining flex space, so the separator + tile sit
        // flush against the right edge naturally.
        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-filter-vertical-separator";
        triggerRow.appendChild(sep);

        const sg0 = this._activeGroup();
        const snCur = sg0 ? sg0.standaloneNote : null;
        const snBtn = doc.createElementNS(NS_HTML, "button");
        snBtn.type = "button";
        snBtn.className = "wv-filter-opt wv-filter-opt-icon";
        snBtn.title = "Standalone Note — show only top-level "
            + "(parentless) notes. Alt+click to exclude (hide "
            + "standalone notes).";
        if (snCur === true) snBtn.dataset.selected = "true";
        else if (snCur === false) snBtn.dataset.excluded = "true";
        const snIcon = doc.createElementNS(NS_HTML, "img");
        snIcon.className = "wv-filter-svg";
        snIcon.src = "chrome://zotero/skin/16/universal/note.svg";
        snIcon.alt = "Standalone Note";
        snIcon.style.color = "var(--accent-yellow)";
        snBtn.appendChild(snIcon);
        snBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.standaloneNote === false) ? null : false;
            else next = (g.standaloneNote === true) ? null : true;
            g.standaloneNote = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        triggerRow.appendChild(snBtn);

        // Vertical 2-col suggestion list (hidden until trigger is
        // clicked).
        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.dataset.vertical = "true";
        box.dataset.columns = "2";
        box.style.display = "none";
        opts.appendChild(box);

        let cached = null;

        const loadValues = async () => {
            try {
                const SPECIAL = new Set([
                    "attachment", "note", "annotation",
                ]);
                const raw = Zotero.ItemTypes.getTypes() || [];
                const all = raw
                    .filter(t => !SPECIAL.has(t.name))
                    .map(t => {
                        let label = t.name;
                        try {
                            label = Zotero.ItemTypes.getLocalizedString(t.name);
                        } catch (e) {}
                        return { id: t.name, name: label };
                    });
                const allById = new Map(all.map(v => [v.id, v]));
                const wvMru = (Zotero.Prefs.get(
                    "extensions.zotero.weavero.itemTypeFilterMRU", true) || "")
                    .split(",").filter(Boolean);
                const zMru = (Zotero.Prefs.get(
                    "newItemTypeMRU") || "").split(",").filter(Boolean);
                // Cap at 5 to match Zotero's "New Item" toolbar
                // button (zoteroPane.js stores 5 in `newItemTypeMRU`).
                // Higher caps were confusing — users expect the same
                // shortlist they see when creating new items.
                const seen = new Set();
                const recent = [];
                for (const name of [...wvMru, ...zMru]) {
                    if (seen.has(name)) continue;
                    const v = allById.get(name);
                    if (!v) continue;
                    seen.add(name);
                    recent.push(v);
                    if (recent.length >= 5) break;
                }
                const rest = [...all]
                    .sort((a, b) => a.name.localeCompare(b.name));
                if (recent.length && rest.length) {
                    return [...recent, { separator: true }, ...rest];
                }
                return [...recent, ...rest];
            } catch (e) {
                Zotero.debug("[Weavero][filter] item types enum err: " + e);
                return [];
            }
        };

        const bumpMRU = (id) => {
            try {
                const KEY = "extensions.zotero.weavero.itemTypeFilterMRU";
                const cur = (Zotero.Prefs.get(KEY, true) || "")
                    .split(",").filter(Boolean);
                const i = cur.indexOf(id);
                if (i !== -1) cur.splice(i, 1);
                cur.unshift(id);
                Zotero.Prefs.set(KEY, cur.slice(0, 5).join(","), true);
            } catch (e) {}
        };

        const buildSelectedChip = (id, isExclude) => {
            const chip = doc.createElementNS(NS_HTML, "span");
            chip.className = "wv-filter-itype-chip";
            if (isExclude) chip.dataset.exclude = "true";
            const icon = doc.createElementNS(NS_HTML, "span");
            icon.className = "icon icon-css icon-item-type";
            icon.dataset.itemType = id;
            let label = id;
            try { label = Zotero.ItemTypes.getLocalizedString(id); }
            catch (e) {}
            chip.title = (isExclude ? "Not " : "") + label;
            chip.appendChild(icon);
            chip.addEventListener("click", (e) => {
                e.stopPropagation();
                const g = this._activeGroup();
                if (!g) return;
                if (e.altKey) {
                    // Alt+click switches the chip's side (include ↔
                    // exclude) — _toggleIncludeExclude with altKey
                    // matching the TARGET side does exactly that
                    // under Item Type's single-value semantics.
                    const next = this._toggleIncludeExclude(id,
                        g.itemType || [], g.itemTypeExclude || [],
                        !isExclude);
                    g.itemType = next.include;
                    g.itemTypeExclude = next.exclude;
                } else {
                    if (isExclude) {
                        g.itemTypeExclude = (g.itemTypeExclude || [])
                            .filter(x => x !== id);
                    } else {
                        g.itemType = (g.itemType || []).filter(x => x !== id);
                    }
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                renderSelected();
                renderList();
            });
            return chip;
        };

        const renderSelected = () => {
            while (selectedRow.firstChild) {
                selectedRow.removeChild(selectedRow.firstChild);
            }
            const g = this._activeGroup();
            const sel = (g && g.itemType) || [];
            const exc = (g && g.itemTypeExclude) || [];
            for (const id of sel) selectedRow.appendChild(buildSelectedChip(id, false));
            for (const id of exc) selectedRow.appendChild(buildSelectedChip(id, true));
        };

        const renderList = () => {
            if (!cached) return;
            while (box.firstChild) box.removeChild(box.firstChild);
            const g = this._activeGroup();
            const sel = new Set((g && g.itemType) || []);
            const exc = new Set((g && g.itemTypeExclude) || []);
            const isPicked = (id) => sel.has(id) || exc.has(id);
            const list = [];
            let lastWasItem = false;
            let pendingSep = null;
            for (const v of cached) {
                if (v.separator) { pendingSep = v; continue; }
                if (isPicked(v.id)) continue;
                if (pendingSep && lastWasItem) list.push(pendingSep);
                pendingSep = null;
                list.push(v);
                lastWasItem = true;
            }
            if (!list.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = "No item types available";
                box.appendChild(empty);
                return;
            }
            for (const v of list) {
                if (v.separator) {
                    const sep = doc.createElementNS(NS_HTML, "div");
                    sep.className = "wv-filter-list-separator";
                    box.appendChild(sep);
                    continue;
                }
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = v.name;
                const icon = doc.createElementNS(NS_HTML, "span");
                icon.className = "icon icon-css icon-item-type";
                icon.dataset.itemType = v.id;
                btn.appendChild(icon);
                const lbl = doc.createElementNS(NS_HTML, "span");
                lbl.className = "wv-filter-opt-label";
                lbl.textContent = v.name;
                btn.appendChild(lbl);
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const g2 = this._activeGroup();
                    if (!g2) return;
                    const next = this._toggleIncludeExclude(
                        v.id,
                        g2.itemType || [],
                        g2.itemTypeExclude || [],
                        !!e.altKey);
                    g2.itemType = next.include;
                    g2.itemTypeExclude = next.exclude;
                    if (!e.altKey && next.include.includes(v.id)) {
                        bumpMRU(v.id);
                    }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderSelected();
                    renderList();
                });
                box.appendChild(btn);
            }
        };

        // Toggle list visibility — outside-click closes.
        let listOpen = false;
        let onDocMouseDown = null;
        const showList = () => {
            if (listOpen) return;
            listOpen = true;
            box.style.display = "";
            if (!onDocMouseDown) {
                onDocMouseDown = (e) => {
                    // Trigger toggles the list itself.
                    if (trigger.contains(e.target)) return;
                    // Clicks inside the open list (picking a type)
                    // are handled by the menuitem listener below.
                    if (box.contains(e.target)) return;
                    // Clicks on an actual chip remove that chip —
                    // keep the list open so the user can keep
                    // pruning. Use a chip-class check rather than
                    // `selectedRow.contains` so empty space inside
                    // selectedRow (visible once it has chips and
                    // grows in height) doesn't accidentally count
                    // as a chip click and trap the dropdown open.
                    if (e.target.closest
                        && e.target.closest(".wv-filter-itype-chip")) return;
                    // Anywhere else (including empty space on the
                    // trigger row, or anywhere outside the section)
                    // collapses the list.
                    hideList();
                };
                doc.addEventListener("mousedown", onDocMouseDown, true);
            }
        };
        const hideList = () => {
            if (!listOpen) return;
            listOpen = false;
            box.style.display = "none";
            if (onDocMouseDown) {
                doc.removeEventListener("mousedown", onDocMouseDown, true);
                onDocMouseDown = null;
            }
        };
        // The menulist's empty popup is suppressed; toggling happens
        // here, in the popup-show sequence's earliest hook so the
        // native popup never visually opens. setTimeout(…, 0) yields
        // back to the platform so any in-flight popup-state cleanup
        // finishes before we run our show/hide.
        triggerPopup.addEventListener("popupshowing", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const iwin = doc.defaultView || doc.ownerGlobal;
            iwin.setTimeout(() => {
                if (listOpen) hideList();
                else showList();
            }, 0);
        });

        // Initial render.
        renderSelected();
        loadValues().then((v) => {
            cached = v;
            if (!section.isConnected) return;
            renderList();
        });
    }

    /** Replace `section`'s contents with the Annotation Color picker.
     *  `refreshAll` is invoked after a click so the other sections in
     *  the same panel can also re-render (handy if a filter type ever
     *  cross-affects another). */
    _renderColorSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Annotation Color";
        title.title = "Show only annotations whose color matches one of the selected swatches.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.annotationColor) || []);
        const excluded = new Set((g0 && g0.annotationColorExclude) || []);
        for (const def of this._ANNOTATION_COLORS) {
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const inExc = excluded.has(def.value);
            btn.title = def.label;
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (inExc) btn.dataset.excluded = "true";

            const sw = doc.createElementNS(NS_HTML, "span");
            sw.className = "wv-chip-swatch";
            sw.style.background = def.value;
            btn.appendChild(sw);

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    def.value, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.annotationColor = next.include;
                    g.annotationColorExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            opts.appendChild(btn);
        }
    }

    _renderTypeSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Annotation Type";
        title.title = "Show only annotations of the selected types (Highlight, Underline, Note, Image, Ink, Text).";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.annotationType) || []);
        const excluded = new Set((g0 && g0.annotationTypeExclude) || []);
        for (const def of this._ANNOTATION_TYPES) {
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const inExc = excluded.has(def.value);
            btn.title = def.label;
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (inExc) btn.dataset.excluded = "true";

            // Use <img> with -moz-context-properties (instead of CSS
            // mask-image) so the icon picks up `currentColor` for BOTH
            // `fill="context-fill"` AND `stroke="context-fill"` paths.
            // mask-image only renders filled regions, which makes the
            // stroke-only `annotate-note.svg` come out blank.
            const icon = doc.createElementNS(NS_HTML, "img");
            icon.className = "wv-filter-svg";
            icon.src = def.icon;
            btn.appendChild(icon);

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    def.value, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.annotationType = next.include;
                    g.annotationTypeExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            opts.appendChild(btn);
        }
    }

    /** True iff `item` is one of the three text sources Has Link
     *  scans AND that text contains a URL. The three sources are:
     *    - annotation.annotationComment
     *    - item-note body (note with a regular-item parent)
     *    - standalone-note body (top-level note)
     *  Attachment URL fields and regular-item URL fields are
     *  intentionally NOT checked — Has Link is about URLs the user
     *  embedded in their own text, not metadata fields. */
    _itemHasLinks(item) {
        if (!item) return false;
        try {
            if (item.isAnnotation && item.isAnnotation()) {
                return this.hasURI(item.annotationComment || "");
            }
            if (item.isNote && item.isNote()) {
                const note = (item.getNote && item.getNote()) || "";
                return this.hasURI(note);
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /** Map an item to one of Has Link's three scope keys, or
     *  `null` if Has Link doesn't apply to this kind at all. */
    _hasLinkScopeKeyOf(item) {
        if (!item) return null;
        if (item.isAnnotation && item.isAnnotation()) return "annotationComment";
        if (item.isNote && item.isNote()) {
            return item.parentItem ? "itemNoteText" : "standaloneText";
        }
        return null;
    }

    /** Cross-level section — three icon-only tri-state buttons that
     *  apply to every row kind:
     *    - Has Related: item has at least one related-item link
     *    - Has Link:    item has a URL in annotation comment or note text (per `_itemHasLinks`)
     *    - Has Tag:     item carries at least one tag (manual or auto)
     *  Click toggles include, Alt+click toggles exclude. */
    _renderCrossLevelSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Cross-level";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        // Default kind list (Has Tag / Has Related) — three row-
        // kind buckets following `_rowKindOf`. Item notes are
        // attachments (same tree level) so the "Attachment" bucket
        // covers both attachment files AND item notes; non-note
        // attachments are referred to as "Attachment Files"
        // elsewhere in the UI.
        const KINDS_ROW = [
            { key: "annotation", label: "Annotation" },
            { key: "attachment", label: "Attachment" },
            { key: "parent",     label: "Parent" },
        ];
        // Has Link's kind list — text-source-specific buckets
        // (URL detection only fires on annotation comments and
        // note bodies; attachment URL fields and regular-item URL
        // fields don't count).
        const KINDS_HAS_LINK = [
            { key: "annotationComment", label: "Annotation Comment" },
            { key: "itemNoteText",      label: "Item Note Text" },
            { key: "standaloneText",    label: "Standalone Note Text" },
        ];

        // Each cross-level filter renders as a slot containing the
        // main icon button + a small `▾` scope arrow. Click the
        // icon to toggle include/exclude (Alt+click for exclude);
        // click the arrow to choose which row kinds the filter
        // applies to.
        const buildBtn = (key, scopeKey, kindList, label, iconBuilder, tip) => {
            const slot = doc.createElementNS(NS_HTML, "div");
            slot.className = "wv-filter-cross-slot";

            const cur = g0 ? g0[key] : null;
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon wv-filter-cross-main";
            btn.title = tip;
            if (cur === true) btn.dataset.selected = "true";
            else if (cur === false) btn.dataset.excluded = "true";
            const icon = iconBuilder(doc);
            if (icon) btn.appendChild(icon);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const g = this._activeGroup();
                if (!g) return;
                let next;
                if (e.altKey) next = (g[key] === false) ? null : false;
                else next = (g[key] === true) ? null : true;
                g[key] = next;
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            slot.appendChild(btn);

            // Scope arrow. `data-modified` flags non-default scopes
            // so the user sees at a glance which filters are
            // narrowed below the all-on default.
            const arrow = doc.createElementNS(NS_HTML, "button");
            arrow.type = "button";
            arrow.className = "wv-filter-cross-scope-arrow";
            arrow.title = "Choose which row kinds this filter applies to";
            arrow.textContent = "▾";
            const scope = (g0 && g0[scopeKey]) || {};
            const allOn = kindList.every(k => scope[k.key] !== false);
            if (!allOn) arrow.dataset.modified = "true";
            arrow.addEventListener("click", (e) => {
                e.stopPropagation();
                this._openCrossLevelScopePopup(
                    arrow, scopeKey, kindList, refreshAll);
            });
            slot.appendChild(arrow);

            opts.appendChild(slot);
        };

        // Order: Has Tag (leftmost) → Has Related → Has Link.
        buildBtn(
            "hasTag", "hasTagScope", KINDS_ROW,
            "Has Tag",
            (d) => {
                const icon = d.createElementNS(NS_HTML, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/tag.svg";
                icon.alt = "Has Tag";
                icon.style.color = "var(--accent-orange)";
                return icon;
            },
            "Has Tag — items carrying at least one tag. "
            + "Alt+click to exclude. ▾ to scope by row kind.");
        buildBtn(
            "hasRelated", "hasRelatedScope", KINDS_ROW,
            "Has Related",
            (d) => {
                const icon = d.createElementNS(NS_HTML, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/related.svg";
                icon.alt = "Has Related";
                icon.style.color = "var(--accent-wood)";
                return icon;
            },
            "Has Related — items with at least one related-item link. "
            + "Alt+click to exclude. ▾ to scope by row kind.");
        buildBtn(
            "hasLink", "hasLinkScope", KINDS_HAS_LINK,
            "Has Link",
            (d) => this._makeLinkSvg(d),
            "Has Link — items whose annotation comment or note text "
            + "contains a URL. Alt+click to exclude. ▾ to choose "
            + "which text source(s) to scan.");
    }

    /** Open a small dropdown anchored under `anchor` with checkboxes
     *  toggling the per-kind scope of a cross-level filter.
     *  `scopeKey` is the group field name (`hasRelatedScope`,
     *  `hasLinkScope`, `hasTagScope`). `kinds` is the list of
     *  scope checkboxes to render: `[{key, label}]`. */
    _openCrossLevelScopePopup(anchor, scopeKey, kinds, refreshAll) {
        const doc = anchor.ownerDocument;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        // Drop any existing popup before opening a new one — the
        // user just clicked an arrow, treat the previous popup as
        // dismissed regardless of which arrow it belonged to.
        const inner = anchor.closest(".wv-filter-popup-inner")
            || doc.querySelector(".wv-filter-popup-inner");
        if (!inner) return;
        const stale = inner.querySelectorAll(".wv-filter-scope-popup");
        for (const s of stale) s.remove();

        const g = this._activeGroup();
        if (!g) return;
        if (!g[scopeKey]) {
            // Lazy default: every key in the kinds list set true.
            g[scopeKey] = {};
            for (const k of kinds) g[scopeKey][k.key] = true;
        }
        const scope = g[scopeKey];

        const pop = doc.createElementNS(NS_HTML, "div");
        pop.className = "wv-filter-scope-popup";

        const heading = doc.createElementNS(NS_HTML, "div");
        heading.className = "wv-filter-scope-popup-head";
        heading.textContent = "Apply to";
        pop.appendChild(heading);

        for (const k of kinds) {
            const lbl = doc.createElementNS(NS_HTML, "label");
            lbl.className = "wv-filter-scope-popup-row";
            const cb = doc.createElementNS(NS_HTML, "input");
            cb.type = "checkbox";
            cb.checked = scope[k.key] !== false;
            cb.addEventListener("change", () => {
                scope[k.key] = !!cb.checked;
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            lbl.appendChild(cb);
            const txt = doc.createElementNS(NS_HTML, "span");
            txt.textContent = k.label;
            lbl.appendChild(txt);
            pop.appendChild(lbl);
        }

        // Position relative to the panel's inner box. The arrow's
        // bounding rect is in viewport coords; subtract the inner's
        // own viewport position to get a coordinate the popup can
        // use as `position: absolute` inside `inner`.
        inner.appendChild(pop);
        try {
            const r = anchor.getBoundingClientRect();
            const ir = inner.getBoundingClientRect();
            pop.style.left = Math.max(0, (r.left - ir.left) - 4) + "px";
            pop.style.top = (r.bottom - ir.top + 2) + "px";
        } catch (e) {}

        // Close on outside-click. setTimeout so the click that
        // opened the popup doesn't immediately re-close it.
        let onDoc = null;
        const close = () => {
            try { pop.remove(); } catch (e) {}
            if (onDoc) {
                doc.removeEventListener("mousedown", onDoc, true);
                onDoc = null;
            }
        };
        onDoc = (e) => {
            if (pop.contains(e.target)) return;
            if (anchor.contains(e.target)) return;
            close();
        };
        const win = doc.defaultView || doc.ownerGlobal;
        win.setTimeout(() => doc.addEventListener("mousedown", onDoc, true), 0);
    }

    /** Single-button tri-state section (matches `_renderHasCommentSection`'s
     *  shape) for boolean kind filters that target a row sub-kind.
     *  `key` is the group field name; `iconBuilder(doc)` returns an
     *  icon element. The button cycles include / exclude via plain
     *  click and Alt+click respectively, with `data-selected` /
     *  `data-excluded` for the standard CSS treatment. */
    _renderBoolKindIconSection(doc, section, refreshAll, opts) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = opts.title;
        section.appendChild(title);

        const optsBox = doc.createElementNS(NS_HTML, "div");
        optsBox.className = "wv-filter-options";
        section.appendChild(optsBox);

        const g0 = this._activeGroup();
        const cur = g0 ? g0[opts.key] : null;
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        btn.title = opts.tip;
        if (cur === true) btn.dataset.selected = "true";
        else if (cur === false) btn.dataset.excluded = "true";
        const icon = opts.iconBuilder(doc);
        if (icon) btn.appendChild(icon);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) {
                next = (g[opts.key] === false) ? null : false;
            }
            else {
                next = (g[opts.key] === true) ? null : true;
            }
            g[opts.key] = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        optsBox.appendChild(btn);
    }

    /** Item Note tile is now rendered inline by
     *  `_renderAttachmentFileTypeSection` (right of the file-type
     *  icons, after a vertical separator). This shim is kept as a
     *  no-op placeholder in case external code references the
     *  method name. */
    _renderItemNoteSection(_doc, _section, _refreshAll) {
        // Intentionally empty.
    }

    /** Standalone Note tile is now rendered inline by
     *  `_renderItemTypeRow` (right end of the Item Type row, after
     *  a vertical separator). No-op shim for back-compat. */
    _renderStandaloneNoteSection(_doc, _section, _refreshAll) {
        // Intentionally empty.
    }

    /** Render a row of parent-targeting "Has *" tri-state icon
     *  buttons (Has DOI, Has URL, Has Abstract, Has Attachment File).
     *  All four sit on the same line in the Parent group. */
    _renderParentHasFieldsSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Parent Has";
        section.appendChild(title);

        const optsBox = doc.createElementNS(NS_HTML, "div");
        optsBox.className = "wv-filter-options";
        section.appendChild(optsBox);

        const g0 = this._activeGroup();
        // Optional `color` ties the icon's currentColor to one of
        // Zotero's `$item-pane-sections` palette entries so the
        // Has-* tiles read as the same surface as their right-pane
        // section header.
        const buildBtn = (key, label, iconSrc, tip, color) => {
            const cur = g0 ? g0[key] : null;
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            btn.title = tip;
            if (cur === true) btn.dataset.selected = "true";
            else if (cur === false) btn.dataset.excluded = "true";
            const icon = doc.createElementNS(NS_HTML, "img");
            icon.className = "wv-filter-svg";
            icon.src = iconSrc;
            icon.alt = label;
            if (color) icon.style.color = color;
            btn.appendChild(icon);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const g = this._activeGroup();
                if (!g) return;
                let next;
                if (e.altKey) {
                    next = (g[key] === false) ? null : false;
                } else {
                    next = (g[key] === true) ? null : true;
                }
                g[key] = next;
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            optsBox.appendChild(btn);
        };
        // Order matches Zotero's right-pane sidenav for a regular
        // item: Info fields (DOI, URL) → Abstract → Attachments.
        // Colors come from `$item-pane-sections` (`scss/abstracts/
        // _variables.scss`): Abstract → `--accent-azure`,
        // Attachments → `--accent-green`. DOI / URL don't have
        // dedicated section entries so they stay neutral
        // (currentColor).
        buildBtn("hasDOI", "Has DOI",
            "chrome://zotero/skin/16/universal/crossref.svg",
            "Has DOI — regular items with a DOI. Alt+click to exclude.");
        buildBtn("hasURL", "Has URL",
            "chrome://zotero/skin/16/universal/globe.svg",
            "Has URL — regular items with a URL field. "
            + "Alt+click to exclude.");
        buildBtn("hasAbstract", "Has Abstract",
            "chrome://zotero/skin/16/universal/abstract.svg",
            "Has Abstract — regular items with a non-empty abstract. "
            + "Alt+click to exclude.",
            "var(--accent-azure)");
        buildBtn("hasAttachment", "Has Attachment File",
            "chrome://zotero/skin/16/universal/attachment.svg",
            "Has Attachment File — regular items with at least "
            + "one attachment file (PDF, EPUB, snapshot, etc.). "
            + "Distinct from Item Note — item notes are also "
            + "attachment-level rows but have their own tile in "
            + "the Attachment group. Alt+click to exclude.",
            "var(--accent-green)");
    }

    /** Single-tile "Has Annotations" tri-state for the Attachment
     *  group. */
    _renderHasAnnotationsSection(doc, section, refreshAll) {
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        this._renderBoolKindIconSection(doc, section, refreshAll, {
            key: "hasAnnotations",
            title: "Has Annotations",
            tip: "Has Annotations — file attachments with at least "
                + "one annotation. Alt+click to exclude.",
            iconBuilder: (d) => {
                const icon = d.createElementNS(NS_HTML, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/attachment-annotations.svg";
                icon.alt = "Has Annotations";
                // Zotero maps `attachment-annotations` to
                // `--tag-purple` in the item-pane sections palette
                // — same icon, same colour.
                icon.style.color = "var(--tag-purple)";
                return icon;
            },
        });
    }

    _renderHasCommentSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Has Comment";
        title.title = "Has Comment";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        // Single button labelled "Has Comment" with three states:
        //   null  → no filter (idle)
        //   true  → include (annotations WITH a comment) — selected
        //   false → exclude (annotations WITHOUT a comment) — slashed
        // Click toggles include; Alt+click toggles exclude. Mutually
        // exclusive: switching to one clears the other, mirroring the
        // icon-grid Alt+click idiom.
        const g0 = this._activeGroup();
        const cur = g0 ? g0.annotationHasComment : null;
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        if (cur === true) btn.dataset.selected = "true";
        else if (cur === false) btn.dataset.excluded = "true";
        btn.title = "Has Comment — annotations with non-empty "
            + "comment text. Alt+click to exclude.";
        // Speech-bubble + capital C, painted in `--tag-purple`
        // (Zotero's annotation-pane accent). Inline SVG rather than
        // a chrome:// URL since this is a Weavero-specific glyph
        // not shipped with Zotero.
        btn.appendChild(this._makeHasCommentSvg(doc));
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) {
                // Alt+click toggles exclude.
                next = (g.annotationHasComment === false) ? null : false;
            } else {
                // Plain click toggles include.
                next = (g.annotationHasComment === true) ? null : true;
            }
            g.annotationHasComment = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        opts.appendChild(btn);
    }

    /** Build the Has Comment glyph — a rounded speech bubble with a
     *  capital "C" inside, painted in `--tag-purple` to match the
     *  annotation-pane accent. Inline SVG so we don't need to ship
     *  a separate file in `src/icons/`. */
    _makeHasCommentSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-filter-svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("fill", "none");
        svg.style.color = "var(--tag-purple)";
        const path = doc.createElementNS(NS, "path");
        // Coordinates aligned to the `.5` grid so the 1-px stroke
        // covers integer pixel rows (otherwise the stroke center
        // straddles two rows and anti-aliases to a blurry line —
        // exactly the trick Zotero's `annotate-note.svg` uses,
        // e.g. `1.5`, `8.5`, `14.5`). Bubble body: (1.5, 1.5) →
        // (14.5, 11.5), corner radius ≈ 1.5; tail tip at (4.5, 14.5).
        path.setAttribute("d",
            "M1.5 3C1.5 2.17 2.17 1.5 3 1.5H13"
            + "C13.83 1.5 14.5 2.17 14.5 3V10"
            + "C14.5 10.83 13.83 11.5 13 11.5H6.5"
            + "L4.5 14.5V11.5H3"
            + "C2.17 11.5 1.5 10.83 1.5 10V3Z");
        path.setAttribute("stroke", "currentColor");
        // Match Zotero's stroke-only icons — `annotate-note.svg`
        // and friends omit `stroke-width` so it defaults to 1.
        path.setAttribute("stroke-width", "1");
        path.setAttribute("stroke-linejoin", "round");
        // `.wv-filter-svg { fill: currentColor }` would otherwise
        // fill the bubble with the same purple as the C text,
        // hiding the letter. Inline style beats the class rule.
        path.style.fill = "none";
        svg.appendChild(path);
        const text = doc.createElementNS(NS, "text");
        // C is centered on the bubble body (y midpoint ≈ 6.5).
        // font-size 8 with cap-height ~5.6 → baseline at y=9 puts
        // the cap visually centered. font-weight 600 (semi-bold)
        // approximates the ~1.5-px stroke thickness of Zotero's
        // letter-glyph icons (annotate-text "T", annotate-highlight
        // "A") which draw their strokes as filled paths of that
        // width. Bold (700) was too heavy and crowded the bubble.
        text.setAttribute("x", "8");
        text.setAttribute("y", "9");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-family",
            "-apple-system, Segoe UI, sans-serif");
        text.setAttribute("font-size", "8");
        text.setAttribute("font-weight", "600");
        text.setAttribute("fill", "currentColor");
        text.textContent = "C";
        svg.appendChild(text);
        return svg;
    }

    /** Annotation Tag picker — dynamic-list section with a GitHub-
     *  style filter input above the tag chips. Tags are scoped to
     *  the active library; we collect all tags actually attached to
     *  annotation items there (via SQL — fast through
     *  `Zotero.DB.columnQueryAsync`). The fetch runs once per popup
     *  open (cached on `_cachedAnnotationTags`); typing in the
     *  filter input only re-renders the chip list, so input focus
     *  is preserved across keystrokes.
     *
     *  Multi-select with ANY-of semantics. */
    _renderTagSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Tag";
        title.title = "Filter by tag — type to search the library's tags. Multi-select.";
        section.appendChild(title);

        // Stacked layout: input on top, tag list below. Both sit
        // inside the standard `.wv-filter-options` flex column for
        // alignment with the section title.
        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter tags…";
        search.value = this._tagSearchQuery || "";
        opts.appendChild(search);

        // The tag list is collapsed by default — only the search
        // input is visible until the user focuses it. Mirrors
        // GitHub's tag picker: clean section by default, suggestions
        // appear on demand. We re-expand on focus-in to anywhere
        // inside the section (so clicking a chip keeps the list
        // open) and re-collapse when focus leaves entirely.
        const tagBox = doc.createElementNS(NS_HTML, "div");
        tagBox.className = "wv-filter-tag-list";
        tagBox.style.display = "none";
        opts.appendChild(tagBox);

        this._wireFilterBoxFocus(doc, search, tagBox, opts);

        // Initial placeholder while we fetch tags (replaced on
        // success / error / cache hit).
        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        tagBox.appendChild(placeholder);

        // GitHub-style ranking — when the user is typing a query,
        // show a small set of suggestions ordered by relevance:
        //   1. exact match (case-insensitive)
        //   2. prefix match
        //   3. substring match
        // Within each tier, alphabetical. Capped at SUGGEST_LIMIT
        // so a long tag library doesn't drown out the picker; if
        // matches were truncated we surface "+N more" so the user
        // knows to refine. With an empty query we show every tag
        // (still chip-style multi-select).
        const SUGGEST_LIMIT = 10;
        const rankMatches = (allTags, q) => {
            const exact = [], prefix = [], substring = [];
            for (const t of allTags) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) prefix.push(t);
                else if (lc.includes(q)) substring.push(t);
            }
            return [...exact, ...prefix, ...substring];
        };

        // (Re-)render only the chip list — keeps the search input
        // intact so typing doesn't drop focus.
        const renderButtons = (allTags) => {
            while (tagBox.firstChild) tagBox.removeChild(tagBox.firstChild);
            const q = (this._tagSearchQuery || "").trim().toLowerCase();
            let ranked;
            if (q) ranked = rankMatches(allTags, q);
            else ranked = allTags;
            const overflow = q ? Math.max(0, ranked.length - SUGGEST_LIMIT) : 0;
            const filtered = q ? ranked.slice(0, SUGGEST_LIMIT) : ranked;
            if (!filtered.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q
                    ? "No matching tags"
                    : "No annotation tags in this library";
                tagBox.appendChild(empty);
                return;
            }
            const selected = new Set(
                (this._activeGroup() && this._activeGroup().annotationTag) || []);
            for (const tag of filtered) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = tag;
                if (selected.has(tag)) btn.dataset.selected = "true";
                btn.textContent = tag;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(tag)) selected.delete(tag);
                    else selected.add(tag);
                    { const g = this._activeGroup(); if (g) g.annotationTag = [...selected]; }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    // Re-render only this section's buttons (NOT
                    // `refreshAll`) so the search input keeps focus.
                    renderButtons(allTags);
                });
                tagBox.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                tagBox.appendChild(more);
            }
        };

        // Type-to-filter wiring. We rebuild the chip list on every
        // keystroke; `tagBox` rebuild is local so the input element
        // is preserved and keeps focus.
        search.addEventListener("input", () => {
            this._tagSearchQuery = search.value || "";
            const cached = this._cachedAnnotationTags;
            if (cached) renderButtons(cached);
        });

        const win = doc.defaultView;
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);

        // Use cached tags if we already fetched during this popup
        // open (cache cleared on `popupshowing`). Otherwise fetch.
        if (this._cachedAnnotationTags) {
            renderButtons(this._cachedAnnotationTags);
            return;
        }
        this._collectAnnotationTags(libraryID).then((tags) => {
            this._cachedAnnotationTags = tags;
            // Bail if the section was rebuilt mid-fetch — the new
            // render kicked off its own pass already.
            if (!section.isConnected) return;
            renderButtons(tags);
        }).catch((e) => {
            Zotero.debug("[Weavero][filter] tag fetch err: " + e);
            if (!section.isConnected) return;
            while (tagBox.firstChild) tagBox.removeChild(tagBox.firstChild);
            const err = doc.createElementNS(NS_HTML, "span");
            err.style.opacity = "0.5";
            err.style.fontSize = "12px";
            err.textContent = "(failed to load tags)";
            tagBox.appendChild(err);
        });
    }

    /** Distinct tag names attached to annotation items in the given
     *  library. SQL does the heavy lifting — much faster than
     *  iterating all items and calling `getTags()` on each one. */
    async _collectAnnotationTags(libraryID) {
        // (Misnamed for history) Library-wide distinct tag names —
        // covers tags on any item type, not just annotations, since
        // the Tag filter is now generic.
        //
        // Sort order matches Zotero's tag selector / tags box:
        // coloured tags first (by their assigned position), then
        // emoji-leading tags alphabetically, then everything else
        // alphabetically. We delegate to `Zotero.Tags.compareTagsOrder`
        // (xpcom/data/tags.js) so the filter list stays in sync if
        // upstream tweaks the rule. After sorting, a `{separator:true}`
        // marker is inserted after the last coloured tag — the
        // unified-search renderer already knows how to draw it as a
        // group divider, mirroring tagSelectorList.jsx's separator
        // between coloured and non-coloured rows.
        if (libraryID == null) return [];
        const sql = "SELECT DISTINCT t.name "
            + "FROM tags t "
            + "JOIN itemTags it ON it.tagID = t.tagID "
            + "JOIN items i ON i.itemID = it.itemID "
            + "WHERE i.libraryID = ? "
            + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
        try {
            const names = await Zotero.DB.columnQueryAsync(sql, [libraryID]);
            let tagColors = null;
            try { tagColors = Zotero.Tags.getColors(libraryID); }
            catch (e) {}
            try {
                names.sort((a, b) => Zotero.Tags.compareTagsOrder(libraryID, a, b));
            } catch (e) {
                names.sort((a, b) => String(a).localeCompare(String(b)));
            }
            if (tagColors && tagColors.size) {
                const firstUncoloredIdx = names.findIndex(
                    n => !tagColors.get(n));
                if (firstUncoloredIdx > 0) {
                    return [
                        ...names.slice(0, firstUncoloredIdx),
                        { separator: true },
                        ...names.slice(firstUncoloredIdx),
                    ];
                }
            }
            return names;
        } catch (e) {
            Zotero.debug("[Weavero][filter] _collectAllTags err: " + e);
            return [];
        }
    }

    /** Distinct annotation authors in the library, returned as
     *  display names. Looks at `createdByUserID` on each annotation
     *  and resolves to `Zotero.Users.getName(userID)` (or the literal
     *  `annotationAuthorName` string for unauthenticated users). */
    async _collectAnnotationAuthors(libraryID) {
        // (Misnamed for history) Library-wide distinct author names —
        // unions item creators (any item type) with annotation
        // authors (group-library users / annotationAuthorName).
        if (libraryID == null) return [];
        const names = new Set();
        try {
            const creatorSql = "SELECT DISTINCT c.firstName, c.lastName "
                + "FROM creators c "
                + "JOIN itemCreators ic ON ic.creatorID = c.creatorID "
                + "JOIN items i ON i.itemID = ic.itemID "
                + "WHERE i.libraryID = ? "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
            const creators = await Zotero.DB.queryAsync(creatorSql, [libraryID]);
            for (const r of creators) {
                const n = ((r.firstName || "") + " " + (r.lastName || "")).trim();
                if (n) names.add(n);
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] creators query err: " + e);
        }
        try {
            const annSql = "SELECT DISTINCT IFNULL(ia.authorName, '') AS authorName, "
                + "IFNULL(i.createdByUserID, -1) AS createdByUserID "
                + "FROM items i "
                + "LEFT JOIN itemAnnotations ia ON ia.itemID = i.itemID "
                + "WHERE i.itemTypeID = ("
                + "  SELECT itemTypeID FROM itemTypes WHERE typeName = 'annotation'"
                + ") "
                + "AND i.libraryID = ? "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
            const rows = await Zotero.DB.queryAsync(annSql, [libraryID]);
            for (const r of rows) {
                if (r.authorName) {
                    names.add(r.authorName);
                    continue;
                }
                if (r.createdByUserID != null && r.createdByUserID >= 0
                    && Zotero.Users && Zotero.Users.getName) {
                    const n = Zotero.Users.getName(r.createdByUserID);
                    if (n) names.add(n);
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] annotation authors query err: " + e);
        }
        return [...names].sort((a, b) => a.localeCompare(b));
    }

    _renderAuthorSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Author";
        title.title = "Filter by author / creator. Multi-select; OR within authors.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter authors…";
        search.value = this._authorSearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        box.appendChild(placeholder);

        const SUGGEST_LIMIT = 10;
        const rank = (all, q) => {
            const exact = [], pre = [], sub = [];
            for (const t of all) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) pre.push(t);
                else if (lc.includes(q)) sub.push(t);
            }
            return [...exact, ...pre, ...sub];
        };
        const renderButtons = (all) => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._authorSearchQuery || "").trim().toLowerCase();
            const ranked = q ? rank(all, q) : all;
            const overflow = q ? Math.max(0, ranked.length - SUGGEST_LIMIT) : 0;
            const filtered = q ? ranked.slice(0, SUGGEST_LIMIT) : ranked;
            if (!filtered.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q
                    ? "No matching authors"
                    : "No annotation authors in this library";
                box.appendChild(empty);
                return;
            }
            const selected = new Set(
                (this._activeGroup() && this._activeGroup().annotationAuthor) || []);
            for (const a of filtered) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = a;
                if (selected.has(a)) btn.dataset.selected = "true";
                btn.textContent = a;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(a)) selected.delete(a);
                    else selected.add(a);
                    { const g = this._activeGroup(); if (g) g.annotationAuthor = [...selected]; }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons(all);
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };

        search.addEventListener("input", () => {
            this._authorSearchQuery = search.value || "";
            const cached = this._cachedAnnotationAuthors;
            if (cached) renderButtons(cached);
        });

        const win = doc.defaultView;
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);

        if (this._cachedAnnotationAuthors) {
            renderButtons(this._cachedAnnotationAuthors);
            return;
        }
        this._collectAnnotationAuthors(libraryID).then((authors) => {
            this._cachedAnnotationAuthors = authors;
            if (!section.isConnected) return;
            renderButtons(authors);
        }).catch((e) => {
            Zotero.debug("[Weavero][filter] author fetch err: " + e);
        });
    }

    /** Attachment File Type — multi-select buttons with icons,
     *  one per attachment file kind (PDF, EPUB, Snapshot, Image,
     *  Video, Web Link, Other File). Notes are excluded — Zotero
     *  treats them as their own row kind, handled via Item Category
     *  / Note Type. */
    _renderAttachmentFileTypeSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Attachment File Type";
        title.title = "Filter attachments by file kind (PDF, EPUB, Snapshot, Image, Video, Web Link, Other File). Multi-select.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.attachmentFileType) || []);
        const excluded = new Set((g0 && g0.attachmentFileTypeExclude) || []);
        for (const def of this._ATTACHMENT_FILE_TYPES) {
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const inExc = excluded.has(def.value);
            btn.title = def.label;
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (inExc) btn.dataset.excluded = "true";
            // Theme-aware: Zotero's `.icon-item-type[data-item-type]`
            // rules (defined in `_item-tree.scss`) ship separate
            // light/dark SVG paths and resolve at runtime to the
            // correct one for the active theme. `def.value` is
            // already the camelCase form (attachmentPDF, …).
            const icon = doc.createElementNS(NS_HTML, "span");
            icon.className = "icon icon-css icon-item-type";
            icon.setAttribute("data-item-type", def.value);
            btn.appendChild(icon);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    def.value, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.attachmentFileType = next.include;
                    g.attachmentFileTypeExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            opts.appendChild(btn);
        }

        // Item Note tile sits to the right of the file-type icons,
        // after a thin vertical separator. Item notes are
        // attachment-level rows (same tree depth as attachments)
        // — the file-type tiles target attachment-files, the Item
        // Note tile targets the OTHER kind of attachment-level
        // row, hence the visual grouping.
        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-filter-vertical-separator";
        opts.appendChild(sep);

        const inCur = g0 ? g0.itemNote : null;
        const inBtn = doc.createElementNS(NS_HTML, "button");
        inBtn.type = "button";
        inBtn.className = "wv-filter-opt wv-filter-opt-icon";
        inBtn.title = "Item Note — show only notes attached to a regular item. "
            + "Alt+click to exclude (hide item notes).";
        if (inCur === true) inBtn.dataset.selected = "true";
        else if (inCur === false) inBtn.dataset.excluded = "true";
        const inIcon = doc.createElementNS(NS_HTML, "img");
        inIcon.className = "wv-filter-svg";
        inIcon.src = "chrome://zotero/skin/16/universal/note.svg";
        inIcon.alt = "Item Note";
        // Same `--accent-yellow` Zotero uses for the notes section.
        inIcon.style.color = "var(--accent-yellow)";
        inBtn.appendChild(inIcon);
        inBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.itemNote === false) ? null : false;
            else next = (g.itemNote === true) ? null : true;
            g.itemNote = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        opts.appendChild(inBtn);
    }

    /** Distinct user names who created (added) items in `libraryID`.
     *  Most useful for group libraries where multiple members
     *  contribute. In a personal library this typically returns
     *  zero or one entry. */
    /** Distinct non-empty `publicationTitle` values across all
     *  regular items in the library. Used by the Publication mode
     *  in the unified search. */
    async _collectPublications(libraryID) {
        if (libraryID == null) return [];
        try {
            const fieldSql = "SELECT fieldID FROM fields WHERE fieldName = 'publicationTitle'";
            const fieldRow = await Zotero.DB.valueQueryAsync(fieldSql);
            if (!fieldRow) return [];
            const sql = "SELECT DISTINCT idv.value AS title "
                + "FROM itemDataValues idv "
                + "JOIN itemData id ON id.valueID = idv.valueID "
                + "JOIN items i ON i.itemID = id.itemID "
                + "WHERE id.fieldID = ? "
                + "AND i.libraryID = ? "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems) "
                + "AND idv.value <> ''";
            const rows = await Zotero.DB.columnQueryAsync(sql, [fieldRow, libraryID]);
            return (rows || []).sort((a, b) => String(a).localeCompare(String(b)));
        } catch (e) {
            Zotero.debug("[Weavero][filter] _collectPublications err: " + e);
            return [];
        }
    }

    async _collectAddedByUsers(libraryID) {
        if (libraryID == null) return [];
        try {
            // `createdByUserID` lives on the `groupItems` table, not
            // on `items`. Join through itemID, scope to the active
            // library via `items.libraryID`, exclude trashed.
            const sql = "SELECT DISTINCT gi.createdByUserID "
                + "FROM groupItems gi "
                + "JOIN items i ON i.itemID = gi.itemID "
                + "WHERE i.libraryID = ? "
                + "AND gi.createdByUserID IS NOT NULL "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
            const ids = await Zotero.DB.columnQueryAsync(sql, [libraryID]);
            const names = new Set();
            for (const uid of ids) {
                if (uid != null && Zotero.Users && Zotero.Users.getName) {
                    const n = Zotero.Users.getName(uid);
                    if (n) names.add(n);
                }
            }
            return [...names].sort((a, b) => a.localeCompare(b));
        } catch (e) {
            Zotero.debug("[Weavero][filter] _collectAddedByUsers err: " + e);
            return [];
        }
    }

    /** Multi-select Collection picker — narrows the items list to
     *  members of any selected collection in the active library.
     *  Stored in `_filterState.collections` (array of collection
     *  IDs). */
    _renderCollectionSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Collection";
        title.title = "Narrow the items list to members of any of the selected collections in the active library. Multi-select; OR.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const win = doc.defaultView;
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        let cols = [];
        try {
            cols = (Zotero.Collections.getByLibrary(libraryID, true) || [])
                .map(c => ({ id: c.id, name: c.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            Zotero.debug("[Weavero][filter] collections enum err: " + e);
        }
        if (!cols.length) {
            const empty = doc.createElementNS(NS_HTML, "span");
            empty.style.opacity = "0.5";
            empty.style.fontSize = "12px";
            empty.textContent = "No collections in this library.";
            opts.appendChild(empty);
            return;
        }

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter collections…";
        search.value = this._collectionSearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const SUGGEST_LIMIT = 12;
        const renderButtons = () => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._collectionSearchQuery || "").trim().toLowerCase();
            let list = cols;
            if (q) list = cols.filter(c => c.name.toLowerCase().includes(q));
            const overflow = q ? Math.max(0, list.length - SUGGEST_LIMIT) : 0;
            list = q ? list.slice(0, SUGGEST_LIMIT) : list;
            const selected = new Set(this._filterState.collections || []);
            for (const c of list) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = c.name;
                if (selected.has(c.id)) btn.dataset.selected = "true";
                btn.textContent = c.name;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(c.id)) selected.delete(c.id);
                    else selected.add(c.id);
                    this._filterState.collections = [...selected];
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons();
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };
        search.addEventListener("input", () => {
            this._collectionSearchQuery = search.value || "";
            renderButtons();
        });
        renderButtons();
    }

    /** Multi-select Saved Search picker — narrows the items list to
     *  matches of any selected saved search. Each saved search runs
     *  asynchronously and yields a set of item IDs; results are
     *  cached per-search via `_savedSearchResults` and consulted
     *  synchronously in the filter pass.
     *
     *  Mirrors `_renderCollectionSection`: a search input on top, the
     *  suggestions box below revealed only when the input has focus. */
    _renderSavedSearchSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Saved Search";
        title.title = "Narrow the items list to matches of any of the selected saved searches in the active library. Multi-select; OR.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const win = doc.defaultView;
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        let searches = [];
        try {
            searches = (Zotero.Searches.getByLibrary(libraryID) || [])
                .map(s => ({ id: s.id, name: s.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            Zotero.debug("[Weavero][filter] saved searches enum err: " + e);
        }
        if (!searches.length) {
            const empty = doc.createElementNS(NS_HTML, "span");
            empty.style.opacity = "0.5";
            empty.style.fontSize = "12px";
            empty.textContent = "No saved searches in this library.";
            opts.appendChild(empty);
            return;
        }

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter saved searches…";
        search.value = this._savedSearchSearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const SUGGEST_LIMIT = 12;
        const renderButtons = () => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._savedSearchSearchQuery || "").trim().toLowerCase();
            let list = searches;
            if (q) list = searches.filter(s => s.name.toLowerCase().includes(q));
            const overflow = q ? Math.max(0, list.length - SUGGEST_LIMIT) : 0;
            list = q ? list.slice(0, SUGGEST_LIMIT) : list;
            const selected = new Set(this._filterState.savedSearches || []);
            for (const s of list) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = s.name;
                if (selected.has(s.id)) btn.dataset.selected = "true";
                btn.textContent = s.name;
                btn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (selected.has(s.id)) selected.delete(s.id);
                    else selected.add(s.id);
                    this._filterState.savedSearches = [...selected];
                    // Recompute the saved-search ID cache before
                    // applying so the filter has fresh data.
                    await this._refreshSavedSearchResults();
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons();
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };
        search.addEventListener("input", () => {
            this._savedSearchSearchQuery = search.value || "";
            renderButtons();
        });
        renderButtons();
    }

    /** Run every saved search referenced in `_filterState.savedSearches`,
     *  union the matching item IDs into a Set on `_savedSearchResults`.
     *  Called from the saved-search button click and from the filter
     *  apply path (`_applyItemsListFilter`) so the per-row check can
     *  read it synchronously. */
    async _refreshSavedSearchResults() {
        const runOne = async (sid) => {
            try {
                const search = Zotero.Searches.get(sid);
                if (!search) return [];
                return (await search.search()) || [];
            } catch (e) {
                Zotero.debug("[Weavero][filter] saved-search "
                    + sid + " run err: " + e);
                return [];
            }
        };
        try {
            const incIds = (this._filterState && this._filterState.savedSearches)
                || [];
            const excIds = (this._filterState && this._filterState.savedSearchesExclude)
                || [];
            if (!incIds.length) {
                this._savedSearchResults = null;
            } else {
                const all = new Set();
                for (const sid of incIds) {
                    const matched = await runOne(sid);
                    for (const itemID of matched) all.add(itemID);
                }
                this._savedSearchResults = all;
            }
            if (!excIds.length) {
                this._savedSearchExcludeResults = null;
            } else {
                const all = new Set();
                for (const sid of excIds) {
                    const matched = await runOne(sid);
                    for (const itemID of matched) all.add(itemID);
                }
                this._savedSearchExcludeResults = all;
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] _refreshSavedSearchResults err: " + e);
            this._savedSearchResults = null;
            this._savedSearchExcludeResults = null;
        }
    }

    _renderAddedBySection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Added By";
        title.title = "Filter by who created the item (group libraries). Use the scope ticks below to choose which row kinds the filter applies to.";
        section.appendChild(title);

        // Row-kind scope checkboxes — control which row kinds the
        // `addedBy` filter applies to. Hidden until the user has
        // selected at least one user; the choice would have no
        // observable effect before that.
        const scopeRow = doc.createElementNS(NS_HTML, "div");
        scopeRow.className = "wv-filter-scope-row";
        section.appendChild(scopeRow);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter users…";
        search.value = this._addedBySearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        box.appendChild(placeholder);

        const SUGGEST_LIMIT = 10;
        const rank = (all, q) => {
            const exact = [], pre = [], sub = [];
            for (const t of all) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) pre.push(t);
                else if (lc.includes(q)) sub.push(t);
            }
            return [...exact, ...pre, ...sub];
        };
        const renderScope = () => {
            while (scopeRow.firstChild) scopeRow.removeChild(scopeRow.firstChild);
            const group = this._activeGroup();
            const hasUsers = !!(group && group.addedBy
                && group.addedBy.length);
            if (!hasUsers) {
                scopeRow.style.display = "none";
                return;
            }
            scopeRow.style.display = "";
            if (!group.addedByScope) {
                group.addedByScope = {
                    topLevel: true, attachments: true, annotations: true,
                };
            }
            const scope = group.addedByScope;
            const items = [
                { key: "topLevel",    label: "Top-level items" },
                { key: "attachments", label: "Attachments" },
                { key: "annotations", label: "Annotations" },
            ];
            for (const it of items) {
                const lbl = doc.createElementNS(NS_HTML, "label");
                lbl.className = "wv-filter-scope-cb";
                const cb = doc.createElementNS(NS_HTML, "input");
                cb.type = "checkbox";
                cb.checked = !!scope[it.key];
                cb.addEventListener("change", (e) => {
                    e.stopPropagation();
                    scope[it.key] = cb.checked;
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                });
                const txt = doc.createElementNS(NS_HTML, "span");
                txt.textContent = it.label;
                lbl.appendChild(cb);
                lbl.appendChild(txt);
                scopeRow.appendChild(lbl);
            }
        };
        const renderButtons = (all) => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._addedBySearchQuery || "").trim().toLowerCase();
            const ranked = q ? rank(all, q) : all;
            const overflow = q ? Math.max(0, ranked.length - SUGGEST_LIMIT) : 0;
            const filtered = q ? ranked.slice(0, SUGGEST_LIMIT) : ranked;
            if (!filtered.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q
                    ? "No matching users"
                    : "No tracked creators in this library";
                box.appendChild(empty);
                return;
            }
            const selected = new Set(
                (this._activeGroup() && this._activeGroup().addedBy) || []);
            const colorOn = this._getEnableAddedByColors();
            for (const u of filtered) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = u;
                if (selected.has(u)) btn.dataset.selected = "true";
                btn.textContent = u;
                if (colorOn) {
                    const colour = this._colorForUser(u);
                    btn.style.color = colour;
                    btn.style.borderColor = this._withAlpha(colour, 0.4);
                    // Selected → stronger fill so the user-color tint
                    // still reads as "active". Idle → subtle 0.12-alpha
                    // wash so the per-user hue is visible without
                    // looking selected.
                    btn.style.backgroundColor = this._withAlpha(
                        colour, selected.has(u) ? 0.28 : 0.12);
                }
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(u)) selected.delete(u);
                    else selected.add(u);
                    { const g = this._activeGroup(); if (g) g.addedBy = [...selected]; }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons(all);
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
            renderScope();
        };

        search.addEventListener("input", () => {
            this._addedBySearchQuery = search.value || "";
            const cached = this._cachedAddedByUsers;
            if (cached) renderButtons(cached);
        });

        const win = doc.defaultView;
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);

        // Render the scope row immediately even while user list is
        // loading — so the ticks appear without waiting on the SQL
        // round-trip when the popup re-opens with users already
        // selected.
        renderScope();

        if (this._cachedAddedByUsers) {
            renderButtons(this._cachedAddedByUsers);
            return;
        }
        this._collectAddedByUsers(libraryID).then((users) => {
            this._cachedAddedByUsers = users;
            if (!section.isConnected) return;
            renderButtons(users);
        }).catch((e) => {
            Zotero.debug("[Weavero][filter] addedBy fetch err: " + e);
        });
    }

    /** Apply the active filter at the data layer by monkey-patching
     *  `itemsView.getRow` and `itemsView.getRowCount`. The virtualized
     *  table reads row count + row data through these — patching them
     *  yields a real filtered view (no gaps, scroll geometry intact),
     *  the same approach Zotero's quick search uses underneath.
     *
     *  Steps on filter activation:
     *    1. Save the original methods on the items view.
     *    2. Auto-expand every container whose subtree contains a
     *       matching annotation, so the matching annotations actually
     *       exist as rows in `_rows`.
     *    3. Build a filtered-index array: matching annotations + their
     *       ancestors (so the tree structure stays valid).
     *    4. Replace `getRow(filteredIdx)` with a lookup through that
     *       array, and `getRowCount()` with its length.
     *    5. Invalidate the tree so it re-renders against the new
     *       count + row data.
     *
     *  On filter clear, restore the saved originals and re-invalidate. */
    _applyItemsListFilter(opts) {
        // Guard — `tree.invalidate()` re-renders rows, which fires the
        // tree mutation observer that calls us back. Without this we'd
        // recurse on every filter apply.
        if (this._filterApplying) return;
        this._filterApplying = true;
        try { this._applyItemsListFilterInner(opts); }
        finally {
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout) || setTimeout;
            // Defer clearing so observer fires that are queued from our
            // own mutations get filtered out too.
            setT(() => { this._filterApplying = false; }, 80);
        }
    }

    _applyItemsListFilterInner(opts) {
        // Auto-expand cascade is opt-IN. The MutationObserver-fired
        // reapply must NOT cascade (it would re-open every parent the
        // user just collapsed via the twisty/`-` key). Only the
        // explicit color-picker click passes `cascade: true`.
        const cascade = !!(opts && opts.cascade);
        const win = Zotero.getMainWindow();
        if (!win) return;
        const itemsView = win.ZoteroPane && win.ZoteroPane.itemsView;
        if (!itemsView || !itemsView.tree) return;

        // Library-change detection. Collection IDs and saved-search
        // IDs are library-scoped — a filter set in library A makes
        // every row fail the global check in library B (none of the
        // items in B belong to A's collections). Detect the switch
        // and reset both filters + the saved-search results cache.
        try {
            const curLib = win.ZoteroPane && win.ZoteroPane.getSelectedLibraryID
                ? win.ZoteroPane.getSelectedLibraryID() : null;
            if (this._lastLibraryID !== undefined
                && this._lastLibraryID !== curLib
                && this._filterState) {
                if (this._filterState.collections
                    && this._filterState.collections.length) {
                    this._filterState.collections = [];
                }
                if (this._filterState.savedSearches
                    && this._filterState.savedSearches.length) {
                    this._filterState.savedSearches = [];
                }
                this._savedSearchResults = null;
                try { this._renderFilterBar(); } catch (e) {}
            }
            this._lastLibraryID = curLib;
        } catch (e) {
            Zotero.debug("[Weavero][filter] library-change check err: " + e);
        }

        // The virtualized table reads `getRowCount` directly off
        // `itemsView.rowProvider` (see itemTree.jsx:1362) — patching the
        // wrapper on `itemsView` is bypassed. The wrapper just delegates,
        // so the rowProvider is the real source of truth. Patch both for
        // safety: the wrapper is used by `_renderItem`, the rowProvider
        // is used by `getRowCount` and many other callers.
        const rp = itemsView.rowProvider;
        if (!rp) return;

        const state = this._filterState;
        const active = this._isFilterActive(state);

        // Filter cleared: restore originals by deleting the
        // own-property patches so prototype methods show through.
        if (!active) {
            if (rp._wvOrigGetRow) {
                delete rp.getRow;
                delete rp.getRowCount;
                delete rp._wvOrigGetRow;
                delete rp._wvOrigGetRowCount;
                if (rp._wvOrigGetLevel) {
                    delete rp.getLevel;
                    delete rp._wvOrigGetLevel;
                }
                if (rp._wvOrigIsContainer) {
                    delete rp.isContainer;
                    delete rp._wvOrigIsContainer;
                }
                if (rp._wvOrigIsContainerOpen) {
                    delete rp.isContainerOpen;
                    delete rp._wvOrigIsContainerOpen;
                }
                if (rp._wvOrigIsContainerEmpty) {
                    delete rp.isContainerEmpty;
                    delete rp._wvOrigIsContainerEmpty;
                }
                if (rp._wvOrigToggleOpenState) {
                    delete rp.toggleOpenState;
                    delete rp._wvOrigToggleOpenState;
                }
                if (rp._wvOrigExpandRows) {
                    delete rp.expandRows;
                    delete rp._wvOrigExpandRows;
                }
                if (rp._wvOrigCollapseRows) {
                    delete rp.collapseRows;
                    delete rp._wvOrigCollapseRows;
                }
                if (rp._wvOrigExpandAllRows) {
                    delete rp.expandAllRows;
                    delete rp._wvOrigExpandAllRows;
                }
                if (rp._wvOrigCollapseAllRows) {
                    delete rp.collapseAllRows;
                    delete rp._wvOrigCollapseAllRows;
                }
                delete rp._wvFilterSelfCall;
                this._partialCollapseOnFilterClear(rp, itemsView);
                try { itemsView.tree.invalidate(); } catch (e) {}
            }
            return;
        }

        // Save originals on first activation. Cover `getLevel` too:
        // virtualized-table.jsx's `_getDepth(index)` (used for indent
        // and parent twisty arrows) walks the shared `_rows` array
        // through `getLevel(idx)` / `getParentIndex(idx)`, so without
        // mapping `idx` back to the original space the visual depth
        // is computed for the wrong row.
        //
        // Always walk to the PROTOTYPE-defined method, not whatever's
        // currently on the instance. Plugin disable+enable leaves
        // monkey-patched versions on the instance (via own properties)
        // whose closures hold stale `keep` arrays from the previous
        // plugin module — saving those as "the original" and then
        // re-patching produces a chain with mismatched indices.
        const findProtoMethod = (obj, name) => {
            let p = Object.getPrototypeOf(obj);
            while (p) {
                if (Object.prototype.hasOwnProperty.call(p, name)
                    && typeof p[name] === "function") {
                    return p[name];
                }
                p = Object.getPrototypeOf(p);
            }
            return null;
        };
        // Patch the rowProvider only. `itemsView.getLevel` etc. are
        // arrow-function fields on the LibraryTree base that simply
        // delegate to `this.rowProvider.<same>(idx)` — so patching at
        // the rp level is reached by every public consumer (the
        // virtualized table's bound props all dispatch through to rp).
        // Patching itemsView in addition would double-stack mapping
        // (keep[keep[idx]]).
        if (!rp._wvOrigGetRow) {
            const rpGetRow = findProtoMethod(rp, "getRow");
            const rpGetRowCount = findProtoMethod(rp, "getRowCount");
            const rpGetLevel = findProtoMethod(rp, "getLevel");
            const rpIsContainer = findProtoMethod(rp, "isContainer");
            const rpIsContainerOpen = findProtoMethod(rp, "isContainerOpen");
            const rpIsContainerEmpty = findProtoMethod(rp, "isContainerEmpty");
            const rpToggle = findProtoMethod(rp, "toggleOpenState");
            const rpExpand = findProtoMethod(rp, "expandRows");
            const rpCollapse = findProtoMethod(rp, "collapseRows");
            const rpExpandAll = findProtoMethod(rp, "expandAllRows");
            const rpCollapseAll = findProtoMethod(rp, "collapseAllRows");
            rp._wvOrigGetRow = (rpGetRow || rp.getRow).bind(rp);
            rp._wvOrigGetRowCount = (rpGetRowCount || rp.getRowCount).bind(rp);
            if (rpGetLevel) rp._wvOrigGetLevel = rpGetLevel.bind(rp);
            if (rpIsContainer) rp._wvOrigIsContainer = rpIsContainer.bind(rp);
            if (rpIsContainerOpen) rp._wvOrigIsContainerOpen = rpIsContainerOpen.bind(rp);
            if (rpIsContainerEmpty) rp._wvOrigIsContainerEmpty = rpIsContainerEmpty.bind(rp);
            if (rpToggle) rp._wvOrigToggleOpenState = rpToggle.bind(rp);
            if (rpExpand) rp._wvOrigExpandRows = rpExpand.bind(rp);
            if (rpCollapse) rp._wvOrigCollapseRows = rpCollapse.bind(rp);
            if (rpExpandAll) rp._wvOrigExpandAllRows = rpExpandAll.bind(rp);
            if (rpCollapseAll) rp._wvOrigCollapseAllRows = rpCollapseAll.bind(rp);
        }

        const origGetRow = rp._wvOrigGetRow;
        const origGetRowCount = rp._wvOrigGetRowCount;

        // ---- Per-apply hot-path caches (perf) ----
        // Hoisted here (above the cascade pass) so Pass 1's
        // `_hasMatchingAnnotation` calls share the cache with
        // Pass 2's `_rowIsPrimary` checks. Without this, cascade
        // recomputes per-item primary verdicts that pass 2 then
        // recomputes again.
        const isPrimaryCache = new Map();
        const isPrimary = (item) => {
            if (!item) return false;
            const id = item.id;
            if (id != null && isPrimaryCache.has(id)) {
                return isPrimaryCache.get(id);
            }
            const v = this._rowIsPrimary(item, state);
            if (id != null) isPrimaryCache.set(id, v);
            return v;
        };
        const hasMatchCache = new Map();
        const hasMatch = (item) => {
            if (!item) return false;
            const id = item.id;
            if (id != null && hasMatchCache.has(id)) {
                return hasMatchCache.get(id);
            }
            // Inline a cache-aware version of `_hasMatchingAnnotation`
            // so its recursive descents into attachments / notes /
            // annotations also hit the cache. The original method
            // calls `this._rowIsPrimary` directly without caching.
            let v = false;
            try {
                if (isPrimary(item)) {
                    v = true;
                } else if (item.isFileAttachment && item.isFileAttachment()) {
                    const anns = (typeof item.getAnnotations === "function")
                        ? (item.getAnnotations() || []) : [];
                    for (const ann of anns) {
                        if (isPrimary(ann)) { v = true; break; }
                    }
                } else if (item.isRegularItem && item.isRegularItem()) {
                    const attIds = (typeof item.getAttachments === "function")
                        ? item.getAttachments() : [];
                    for (const aId of attIds) {
                        const att = Zotero.Items.get(aId);
                        if (att && hasMatch(att)) { v = true; break; }
                    }
                    if (!v) {
                        const noteIds = (typeof item.getNotes === "function")
                            ? item.getNotes() : [];
                        for (const nId of noteIds) {
                            const n = Zotero.Items.get(nId);
                            if (n && isPrimary(n)) { v = true; break; }
                        }
                    }
                }
            } catch (e) {
                Zotero.debug("[Weavero][filter] hasMatch err: " + e);
            }
            if (id != null) hasMatchCache.set(id, v);
            return v;
        };

        // True iff `item` has at least one STRICT descendant that is
        // primary. Used by Pass 1 to decide whether to auto-expand a
        // container — we don't want to expand a container just
        // because IT is primary (e.g., picking
        // `attachmentFileType=PDF` shouldn't auto-expand each PDF
        // attachment to reveal its annotations; the user only asked
        // about the attachment level). Only when a deeper-level row
        // is primary should the container open.
        const hasPrimaryDescendant = (item) => {
            if (!item) return false;
            if (item.isFileAttachment && item.isFileAttachment()) {
                const anns = (typeof item.getAnnotations === "function")
                    ? (item.getAnnotations() || []) : [];
                for (const ann of anns) {
                    if (isPrimary(ann)) return true;
                }
                return false;
            }
            if (item.isRegularItem && item.isRegularItem()) {
                const attIds = (typeof item.getAttachments === "function")
                    ? item.getAttachments() : [];
                for (const aId of attIds) {
                    const att = Zotero.Items.get(aId);
                    // `hasMatch(att)` covers both "att itself is
                    // primary" and "att has a primary annotation".
                    // Either way, the regular item must open so the
                    // attachment row becomes visible.
                    if (att && hasMatch(att)) return true;
                }
                const noteIds = (typeof item.getNotes === "function")
                    ? item.getNotes() : [];
                for (const nId of noteIds) {
                    const n = Zotero.Items.get(nId);
                    if (n && isPrimary(n)) return true;
                }
            }
            return false;
        };

        // Pass 1 — auto-expand containers whose subtree contains a
        // STRICTLY DEEPER primary match (an attachment under a parent,
        // an annotation under an attachment, etc.). Walk FORWARDS so
        // the new child rows inserted by an open get visited next
        // iteration — otherwise the cascade stops one level deep
        // (we'd open the top-level item but never recurse into its
        // newly-visible attachments, leaving the matching annotations
        // themselves collapsed).
        //
        // The check uses `hasPrimaryDescendant`, NOT `hasMatch`. The
        // distinction matters: a container that is itself primary
        // (e.g., a PDF attachment under `attachmentFileType=PDF`)
        // should be SHOWN at its own depth but NOT auto-opened to
        // reveal its annotations — those would only be visible if
        // another filter targeted them. Only filters that actually
        // hit a deeper level cause the container to open.
        //
        // BATCH STRATEGY: collect every closed-container index that
        // needs opening in one pass, then open them all via
        // `rp.expandRows(indices)` (single `refreshRowMap` + single
        // `runListeners('update')` instead of N). Repeat until a
        // pass identifies nothing new. This collapses N invalidate
        // events into ~2-3 (one per depth level), which is what was
        // making the cascade feel slower than `expandAllRows`.
        //
        // Only runs when `cascade` is explicitly opted in (initial
        // activation or color-set change). The MutationObserver and
        // toggle-triggered reapplies skip the cascade — otherwise it
        // would re-open every parent the user just collapsed.
        if (cascade) {
            const wasFlag = rp._wvFilterSelfCall;
            rp._wvFilterSelfCall = true;
            try {
                let depth = 0;
                const MAX_DEPTH = 8;
                while (depth++ < MAX_DEPTH) {
                    const toOpen = [];
                    const total = origGetRowCount();
                    for (let i = 0; i < total; i++) {
                        let row;
                        try { row = origGetRow(i); } catch (e) { row = null; }
                        if (!row || !row.ref) continue;
                        const item = row.ref;
                        const isContainer = typeof row.isContainer === "function"
                            && row.isContainer();
                        if (!isContainer) continue;
                        const isOpen = typeof row.isContainerOpen === "function"
                            && row.isContainerOpen();
                        if (isOpen) continue;
                        if (!hasPrimaryDescendant(item)) continue;
                        toOpen.push(i);
                        if (item.id != null) {
                            if (!this._filterOpenedIDs) {
                                this._filterOpenedIDs = new Set();
                            }
                            this._filterOpenedIDs.add(item.id);
                        }
                    }
                    if (!toOpen.length) break;
                    if (typeof rp._wvOrigExpandRows === "function") {
                        try { rp._wvOrigExpandRows(toOpen); }
                        catch (e) {
                            Zotero.debug("[Weavero][filter] expandRows err: " + e);
                        }
                    } else {
                        // Fallback — should never hit since we always
                        // capture expandRows during patch install.
                        for (const i of toOpen) {
                            try { itemsView.openContainer(i); } catch (e) {}
                        }
                    }
                }
            } finally {
                rp._wvFilterSelfCall = wasFlag;
            }
            Zotero.debug("[Weavero][filter] expanded; total rows now: "
                + origGetRowCount());
        }

        // Pass 2 — collect indices to keep: primary matches + every
        // ancestor row that contains them (so the tree shape is
        // preserved). For item-scope-alone matches the entire subtree
        // of the primary regular item is kept too.
        const total = origGetRowCount();
        // Build via Set to dedupe — when a regular item is primary,
        // its inner loop pushes descendant indices that the outer
        // loop will also visit, so naive push-twice produces dupes.
        const keepSet = new Set();
        const pushKeep = (i) => keepSet.add(i);
        // (Per-apply caches `isPrimary` / `hasMatch` are defined
        // earlier — above the cascade pass — so both passes share
        // the memoised verdicts.)
        // Hoist the "any per-section filter active?" check — it's
        // an invariant of the apply pass but was being recomputed
        // for every descendant inside `subtreeIncludes`.
        const anyGroupActive = state.groups
            && state.groups.some(g => this._isGroupActive(g));
        const activeGroups = anyGroupActive
            ? state.groups.filter(g => this._isGroupActive(g))
            : [];
        // Strict per-row matching: every row is judged on its own
        // primary status. Non-primary rows are kept ONLY when they
        // happen to be ancestors of a primary descendant (so the
        // tree shape stays valid). Descendants of a primary parent
        // are NOT auto-kept — they're visited in the outer loop and
        // will be kept iff they themselves pass the filter, which is
        // the behaviour the user expects from each filter trigger
        // (e.g. picking `itemType=book` shows books, not their
        // attachments / notes / annotations as well).
        for (let j = 0; j < total; j++) {
            let row;
            try { row = origGetRow(j); } catch (e) { continue; }
            if (!row || !row.ref) continue;
            const item = row.ref;
            if (isPrimary(item)) {
                pushKeep(j);
            } else if (hasMatch(item)) {
                // Ancestor-keep — `hasMatch` is true when some
                // descendant is primary, so this row needs to stay
                // visible to preserve the path down to the match.
                pushKeep(j);
            }
        }
        // Force-include rows whose underlying item the user just
        // CREATED in this session (tracked via the item-add notifier).
        // Without this, a freshly created item that doesn't yet match
        // the active filter (e.g. a new Journal Article with no
        // annotations under an annotation-color filter) gets hidden
        // immediately and the items pane lands in an inconsistent
        // state — Zotero selects the new item but our filter has
        // dropped its row, so itemBox can't find it. We also walk up
        // and keep ancestor rows so the tree path stays valid.
        const recentIDs = this._wvRecentlyAddedItemIDs;
        if (recentIDs && recentIDs.size) {
            for (let j = 0; j < total; j++) {
                let row;
                try { row = origGetRow(j); } catch (e) { continue; }
                if (!row || !row.ref) continue;
                if (!recentIDs.has(row.ref.id)) continue;
                pushKeep(j);
                let lvl = row.level || 0;
                for (let k = j - 1; k >= 0 && lvl > 0; k--) {
                    let kr;
                    try { kr = origGetRow(k); } catch (e) { continue; }
                    if (!kr) continue;
                    const kLvl = kr.level || 0;
                    if (kLvl < lvl) {
                        pushKeep(k);
                        lvl = kLvl;
                    }
                }
            }
        }
        // Materialise the deduped keep set as a sorted array. The
        // rest of the apply logic (`getRow` patch etc.) consumes
        // this as the row-index translation table.
        const keep = [...keepSet].sort((a, b) => a - b);

        Zotero.debug("[Weavero][filter] kept " + keep.length
            + " of " + total + " rows");

        // Patch the data layer on the rowProvider — the virtualized
        // table reads through it directly (see itemTree.jsx:1362).
        // Patching `itemsView.getRow` alone would only catch the
        // ItemTree wrapper, not the prop the virtualized table calls.
        //
        // SELF flag: rp's own internals (e.g. _toggleOpenState) call
        // `this.getRow(idx)` / `this.getLevel(idx)` etc. with REAL
        // indices into `_rows`. Without a bypass our translating
        // patches double-translate (keep[realIdx]) and the toggle
        // operates on the wrong row — twisty/+ key would no-op or
        // open the wrong subtree. The flag is set during calls into
        // the original toggleOpenState / expandRows / collapseRows,
        // so any nested data-access falls through to the raw method.
        const SELF = "_wvFilterSelfCall";
        const self = this;

        // Defensive bounds-check: between an original toggle's
        // `runListeners('update', ..., {restoreSelection: true})` and
        // our reapply, `_rows` may have shrunk while `keep` still
        // holds an index past the new tail. Returning `undefined`
        // (rather than letting the original throw "non-existent tree
        // row N") lets the caller no-op cleanly. The pre-crash
        // path `_restoreSelection -> selection.select(realIdx) ->
        // itemSelected -> getRow(...).ref` would still throw on
        // `.ref`, but the fix below (sync reapply before listeners
        // fire) prevents that path from being reached.
        const safeReal = function (idx) {
            const r = keep[idx];
            if (r === undefined) return -1;
            if (r >= rp._rows.length) return -1;
            return r;
        };

        rp.getRow = function (idx) {
            if (this[SELF]) return rp._wvOrigGetRow(idx);
            const r = safeReal(idx);
            if (r < 0) return undefined;
            return rp._wvOrigGetRow(r);
        };
        rp.getRowCount = function () {
            if (this[SELF]) return rp._wvOrigGetRowCount();
            return keep.length;
        };
        if (rp._wvOrigGetLevel) {
            rp.getLevel = function (idx) {
                if (this[SELF]) return rp._wvOrigGetLevel(idx);
                const r = safeReal(idx);
                if (r < 0) return 0;
                return rp._wvOrigGetLevel(r);
            };
        }
        // The Container probes call `this.getRow(idx)` internally —
        // method-dispatch on `rp.getRow` (our patched translating
        // version). Set SELF for the duration of the original call so
        // the inner getRow sees the raw real index instead of doing a
        // second `keep[idx]` translation. Same for getLevel-using
        // probes (only isContainerEmpty in some impls), but
        // getLevel/getRow themselves are field-accesses with no
        // dispatch, so they don't need the flag.
        const wrapProbe = function (origFn, fallback) {
            return function (idx) {
                if (this[SELF]) return origFn.call(this, idx);
                const realIdx = safeReal(idx);
                if (realIdx < 0) return fallback;
                const wasFlag = this[SELF];
                this[SELF] = true;
                try { return origFn.call(this, realIdx); }
                finally { this[SELF] = wasFlag; }
            };
        };
        if (rp._wvOrigIsContainer) {
            rp.isContainer = wrapProbe(rp._wvOrigIsContainer, false);
        }
        if (rp._wvOrigIsContainerOpen) {
            rp.isContainerOpen = wrapProbe(rp._wvOrigIsContainerOpen, false);
        }
        if (rp._wvOrigIsContainerEmpty) {
            rp.isContainerEmpty = wrapProbe(rp._wvOrigIsContainerEmpty, true);
        }

        // Twisty clicks (toggleOpenState) and `+`/`-` keyboard
        // shortcuts (expandRows / collapseRows) hand FILTERED indices
        // to the rowProvider. Translate through `keep`, set the SELF
        // flag so internal `this.getRow`/`this.getLevel` calls inside
        // the original see the raw real index. The original then
        // mutates `_rows` AND fires `runListeners('update', ...,
        // {restoreSelection: true})`, which dispatches a selection
        // restore that reads `rowMap[id]` (REAL idx after the toggle)
        // and calls `selection.select(realIdx)` — but `selection` is
        // in FILTERED space, so the table looks up `getRow(realIdx)`
        // which lands past the end of `keep` and crashes.
        //
        // Defer the listeners until AFTER we rebuild `keep`, so
        // selection restoration sees a fresh filtered view. We swap
        // `runListeners` for a queue while the original runs, rebuild
        // keep synchronously, then flush.
        const wrapToggle = function (origFn) {
            return function (filteredIdx, skipRowMapRefresh) {
                if (this[SELF]) {
                    return origFn.call(this, filteredIdx, skipRowMapRefresh);
                }
                const realIdx = keep[filteredIdx];
                if (realIdx === undefined) return;
                const wasFlag = this[SELF];
                this[SELF] = true;
                const queued = [];
                const origListeners = rp.runListeners;
                rp.runListeners = function (...args) { queued.push(args); };
                try {
                    return origFn.call(this, realIdx, skipRowMapRefresh);
                } finally {
                    rp.runListeners = origListeners;
                    this[SELF] = wasFlag;
                    self._reapplyFilterSync();
                    for (const args of queued) {
                        try { rp.runListeners.apply(rp, args); }
                        catch (e) {
                            Zotero.debug("[Weavero][filter] listener err: " + e);
                        }
                    }
                }
            };
        };
        const wrapMulti = function (origFn) {
            return function (indices) {
                if (this[SELF]) return origFn.call(this, indices);
                const real = (indices || []).map(i => keep[i])
                    .filter(x => x !== undefined);
                const wasFlag = this[SELF];
                this[SELF] = true;
                const queued = [];
                const origListeners = rp.runListeners;
                rp.runListeners = function (...args) { queued.push(args); };
                try {
                    return origFn.call(this, real);
                } finally {
                    rp.runListeners = origListeners;
                    this[SELF] = wasFlag;
                    self._reapplyFilterSync();
                    for (const args of queued) {
                        try { rp.runListeners.apply(rp, args); }
                        catch (e) {
                            Zotero.debug("[Weavero][filter] listener err: " + e);
                        }
                    }
                }
            };
        };
        if (rp._wvOrigToggleOpenState) {
            rp.toggleOpenState = wrapToggle(rp._wvOrigToggleOpenState);
        }
        if (rp._wvOrigExpandRows) {
            rp.expandRows = wrapMulti(rp._wvOrigExpandRows);
        }
        if (rp._wvOrigCollapseRows) {
            rp.collapseRows = wrapMulti(rp._wvOrigCollapseRows);
        }

        // `+` (expandAllRows) and `-` (collapseAllRows) keys take no
        // indices — they iterate `this.rowCount` (= `_rows.length`,
        // raw real count) and call `this.isContainer(i)` etc. with
        // real indices. Run them with SELF set so our patched probes
        // pass-through to the originals (real-space). Same listener
        // queue + sync reapply pattern as wrapToggle, since the
        // original fires `runListeners('update', ..., {restoreSelection})`
        // at the end.
        const wrapAll = function (origFn) {
            return function (...args) {
                if (this[SELF]) return origFn.apply(this, args);
                const wasFlag = this[SELF];
                this[SELF] = true;
                const queued = [];
                const origListeners = rp.runListeners;
                rp.runListeners = function (...lArgs) { queued.push(lArgs); };
                try {
                    return origFn.apply(this, args);
                } finally {
                    rp.runListeners = origListeners;
                    this[SELF] = wasFlag;
                    self._reapplyFilterSync();
                    for (const lArgs of queued) {
                        try { rp.runListeners.apply(rp, lArgs); }
                        catch (e) {
                            Zotero.debug("[Weavero][filter] listener err: " + e);
                        }
                    }
                }
            };
        };
        if (rp._wvOrigExpandAllRows) {
            rp.expandAllRows = wrapAll(rp._wvOrigExpandAllRows);
        }
        if (rp._wvOrigCollapseAllRows) {
            rp.collapseAllRows = wrapAll(rp._wvOrigCollapseAllRows);
        }

        try { itemsView.tree.invalidate(); } catch (e) {}
    }

    /** Debounce a re-apply of the items-list filter after the
     *  user toggles a container's open state. The toggle changes
     *  `_rows` (rows added/removed), so our `keep` array goes stale —
     *  newly-visible matching annotations need to be folded in,
     *  newly-hidden non-matching rows need to drop out. The debounce
     *  collapses bursts (e.g. multi-row keyboard expand) into a single
     *  pass. */
    /** Synchronous reapply — called from the toggle/expand/collapse
     *  wrappers AFTER the original has mutated `_rows` but BEFORE
     *  upstream's queued `runListeners('update', ...)` fires. The
     *  listener dispatches selection restore via `rowMap[id]` (real
     *  idx), then `selection.select(realIdx)` — which the table
     *  treats as a FILTERED idx and looks up `getRow(realIdx)`. If
     *  `keep` is stale at that point, the lookup crashes. Rebuild
     *  `keep` first so the restore lands on a valid filtered row. */
    _reapplyFilterSync() {
        try { this._applyItemsListFilterInner(); }
        catch (e) {
            Zotero.debug("[Weavero][filter] sync reapply err: " + e);
        }
    }

    /** Mimic Zotero 9's quick-search clear behaviour: when the filter
     *  goes away, leave the level-0 parents we cascade-opened in their
     *  expanded state but collapse the deeper attachment-level
     *  containers we opened, so the tree settles into a "halfway"
     *  state instead of staying fanned out down to every annotation.
     *  Only touches containers whose item id was recorded during our
     *  cascade — a parent the user had manually expanded before
     *  applying the filter is left alone. */
    _partialCollapseOnFilterClear(rp, itemsView) {
        const opened = this._filterOpenedIDs;
        this._filterOpenedIDs = null;
        if (!opened || !opened.size) return;
        if (!rp || !rp._rows) return;
        // `_toggleOpenState` is the low-level mutate-only path —
        // doesn't fire `runListeners('update', ...)`, so no selection
        // restore storms during teardown. `refreshRowMap` syncs the
        // id→idx lookup once at the end.
        const toggle = rp._toggleOpenState
            && rp._toggleOpenState.bind(rp);
        if (!toggle) return;
        // Iterate from the bottom so closing one doesn't shift the
        // indices of those still to check.
        for (let i = rp._rows.length - 1; i >= 0; i--) {
            const row = rp._rows[i];
            if (!row || !row.ref) continue;
            if (!opened.has(row.ref.id)) continue;
            // Z9 keeps level-0 parents open after clear; we match that.
            if ((row.level || 0) < 1) continue;
            const isOpenContainer = row.isContainer && row.isContainer()
                && row.isContainerOpen && row.isContainerOpen();
            if (!isOpenContainer) continue;
            try { toggle(i, true); }
            catch (e) {
                Zotero.debug("[Weavero][filter] partial-collapse err: " + e);
            }
        }
        try { rp.refreshRowMap && rp.refreshRowMap(); } catch (e) {}
        try { rp.runListeners && rp.runListeners("update", true, {
            restoreSelection: true,
        }); } catch (e) {}
    }

    /** Recursively check whether `item` contains an annotation whose
     *  color is in the `allowed` set. Walks attachments for regular
     *  items so a parent regular-item is included whenever any of its
     *  file-attachments hold a matching annotation.
     *
     *  IMPORTANT: `getAnnotations()` throws ("can only be called on file
     *  attachments") for anything that isn't a file attachment, so the
     *  branches must gate on the item type — a generic try/catch would
     *  silently return false for every regular item and drop their
     *  parent rows from the keep set. */
    /** True iff `item` is itself a primary match OR has any
     *  descendant that is. Used to decide whether a row should be
     *  kept as an ancestor-of-match (so the tree shape is preserved). */
    _hasMatchingAnnotation(item, state) {
        if (!item) return false;
        try {
            if (this._rowIsPrimary(item, state)) return true;
            if (item.isFileAttachment && item.isFileAttachment()) {
                const anns = (typeof item.getAnnotations === "function")
                    ? (item.getAnnotations() || []) : [];
                for (const ann of anns) {
                    if (this._rowIsPrimary(ann, state)) return true;
                }
                return false;
            }
            if (item.isRegularItem && item.isRegularItem()) {
                const attIds = (typeof item.getAttachments === "function")
                    ? item.getAttachments() : [];
                for (const id of attIds) {
                    const att = Zotero.Items.get(id);
                    if (att && this._hasMatchingAnnotation(att, state)) {
                        return true;
                    }
                }
                const noteIds = (typeof item.getNotes === "function")
                    ? item.getNotes() : [];
                for (const id of noteIds) {
                    const n = Zotero.Items.get(id);
                    if (n && this._rowIsPrimary(n, state)) return true;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] hasMatch err: " + e);
        }
        return false;
    }

    /** Decorate the iframe-rendered annotation context menu so our
     *  contributed entries ("Open comment popup", "Add related item…")
     *  show the plugin icon next to their label.
     *
     *  In Zotero 10 every annotation context menu is `internal: true`
     *  (see upstream reader/src/common/context-menu.js), which means
     *  it's rendered inside the reader iframe by React
     *  (reader/src/common/components/context-menu.js — `BasicRow`
     *  emits `<button class="row basic">…label…</button>`), not as
     *  chrome XUL. The chrome `_openContextMenu` is never called for
     *  this menu, so chrome-side decoration is impossible.
     *
     *  Instead we watch the iframe DOM for `.context-menu` to mount
     *  (handled in `_setupReaderObserver`'s observer) and from this
     *  helper insert a `<div class="icon"><img src=icon-16.png/></div>`
     *  as the first child of every matching `.row.basic`. Wrapping in
     *  `<div class="icon">` reuses the existing upstream
     *  `.context-menu .icon` rules so spacing matches built-in items
     *  that already use icons (eraser/highlight/etc.) — only the
     *  `<img>` itself needs sizing CSS, which `_injectReaderStyles`
     *  adds to the iframe. */
    decorateContextMenu(idoc) {
        if (!idoc || !idoc.querySelectorAll) return 0;
        // Per-prefix icon factory:
        //   "Add Related" → inline <svg> chain via _makeRelationsSvg
        //                    (uses fill="currentColor" — inherits the
        //                     menu's theme text color, so it reads on
        //                     both light AND dark menu backgrounds).
        const buildIconNode = (text) => {
            if (text.startsWith("Add Related")) {
                return this._makeRelationsSvg(idoc);
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
            plainText = cachedRaw || liveText;
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
                s.textContent = ":root { --wv-link-http: #1a73e8;"
                    + " --wv-link-zotero: #8b4513; --wv-link-app: #9333ea; }"
                    + ":root.wv-ui-dark { --wv-link-http: #8ab4f8;"
                    + " --wv-link-zotero: #cd853f; --wv-link-app: #c084fc; }"
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
                    + ".comment.wv-comment-preview .wv-md-preview { display: block; }"
                    + ".comment.wv-comment-preview.wv-editing .content { display: block; }"
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
            const btn = doc.createElementNS(
                "http://www.w3.org/1999/xhtml", "button");
            btn.className = BTN_CLASS + " " + BTN_PANE_CLASS;
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
        const relBtn = doc.createElementNS(
            "http://www.w3.org/1999/xhtml", "button");
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
            raw = cachedRaw || liveText;
        } else if (cachedRaw && cachedRendered !== null && liveText === cachedRendered) {
            raw = cachedRaw;
        } else {
            raw = liveText;
        }
        const norm = this.normalize(raw);
        const useMd = this._getEnableCommentMarkdown();
        const useUrls = this._getEnableInlineUrls();
        const hasUrls = useUrls && this.hasURI(raw);
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
        const cacheKey = (useMd ? "m" : "") + (useUrls ? "u" : "") + ":" + norm;
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

        const frag = doc.createDocumentFragment();
        // Group order (when useMd):
        //   1 bold, 2 italic, 3 strike, 4 code-double, 5 code-single,
        //   6 link label, 7 link url, 8 bare URL.
        const TOKEN = useMd ? new RegExp(
            "\\*\\*([\\s\\S]+?)\\*\\*"
            + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
            + "|~~([\\s\\S]+?)~~"
            + "|``([\\s\\S]+?)``"
            + "|`([^`\\n]+?)`"
            + "|\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
            "g"
        ) : new RegExp(this.URL_REGEX.source, "g");

        const wrapMd = (cls, inner) => {
            const span = doc.createElement("span");
            span.className = "wv-md " + cls;
            span.textContent = inner;
            frag.appendChild(span);
        };

        let last = 0, m;
        while ((m = TOKEN.exec(norm)) !== null) {
            if (m.index > last)
                frag.appendChild(doc.createTextNode(norm.slice(last, m.index)));
            if (useMd && m[1] !== undefined) {
                wrapMd("wv-md-bold", m[1]);
            } else if (useMd && m[2] !== undefined) {
                wrapMd("wv-md-italic", m[2]);
            } else if (useMd && m[3] !== undefined) {
                wrapMd("wv-md-strike", m[3]);
            } else if (useMd && m[4] !== undefined) {
                wrapMd("wv-md-code", m[4]);
            } else if (useMd && m[5] !== undefined) {
                wrapMd("wv-md-code", m[5]);
            } else if (useMd && m[6] !== undefined && m[7] !== undefined) {
                // Markdown link [label](url). Drop the URL span when URLs
                // sub-toggle is off — render just the label as plain text.
                if (useUrls) {
                    const url = m[7];
                    const span = doc.createElement("span");
                    span.className = "wv-url-span "
                        + this._urlLinkClass(url);
                    span.title = url;
                    span.textContent = m[6];
                    span.setAttribute("data-href", url);
                    frag.appendChild(span);
                } else {
                    frag.appendChild(doc.createTextNode(m[6]));
                }
            } else {
                // Bare URL — group 8 in md regex, group 0 in URL-only regex.
                const rawTok = useMd ? m[8] : m[0];
                if (rawTok === undefined) { last = m.index + m[0].length; continue; }
                if (useUrls) {
                    const url   = rawTok.replace(this.TRAILING_RE, "");
                    const trail = rawTok.slice(url.length);
                    const span = doc.createElement("span");
                    span.className = "wv-url-span "
                        + this._urlLinkClass(url);
                    span.title = url;
                    span.textContent = url;
                    frag.appendChild(span);
                    if (trail) frag.appendChild(doc.createTextNode(trail));
                } else {
                    frag.appendChild(doc.createTextNode(rawTok));
                }
            }
            last = m.index + m[0].length;
        }
        if (last < norm.length)
            frag.appendChild(doc.createTextNode(norm.slice(last)));

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

    _scanPaneRows() {
        if (!this._getEnableRightPane()) {
            this._stripRightPane();
            return;
        }
        const doc = Zotero.getMainWindow().document;
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
        // DIAG: log how many labels we found and a sample of their state.
        // Crucial for diagnosing why disable+re-enable doesn't restore the
        // visual rendering — tells us whether labels are even present, and
        // whether the live textContent matches the aria-label source.
        Zotero.debug("[Weavero][diag] _processRelatedBoxes: "
            + labels.length + " label(s) found");
        let diagIdx = 0;
        for (const label of labels) {
            try {
                const box = label.closest(".box");
                const ariaText = box && box.getAttribute("aria-label");
                const liveTextBefore = label.textContent || "";
                const wvMdBefore = label.querySelectorAll(".wv-md").length;
                const wvUrlBefore = label.querySelectorAll(".wv-url-span").length;
                const sourceAttr = label.getAttribute("data-wv-source");
                if (diagIdx < 3) {
                    Zotero.debug("[Weavero][diag] label[" + diagIdx + "]"
                        + " live=" + JSON.stringify(liveTextBefore.slice(0, 80))
                        + " aria=" + JSON.stringify((ariaText || "").slice(0, 80))
                        + " wvMd=" + wvMdBefore + " wvUrl=" + wvUrlBefore
                        + " src=" + JSON.stringify(sourceAttr));
                }
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
                if (diagIdx < 3) {
                    const wvMdAfter = label.querySelectorAll(".wv-md").length;
                    const wvUrlAfter = label.querySelectorAll(".wv-url-span").length;
                    Zotero.debug("[Weavero][diag] label[" + diagIdx + "]"
                        + " reset=" + didReset
                        + " result=" + renderResult
                        + " wvMd=" + wvMdAfter + " wvUrl=" + wvUrlAfter
                        + " liveAfter=" + JSON.stringify(
                            (label.textContent || "").slice(0, 80)));
                }
                diagIdx++;
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
        // item and get the type-aware open-options menu. Idempotent —
        // skip rows already wired via dataset flag. The listener
        // resolves the row's item lazily at click time.
        const rows = doc.querySelectorAll("related-box .body .row");
        for (const row of rows) {
            if (row.dataset && row.dataset.wvCtxWired) continue;
            row.addEventListener("contextmenu", (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const item = this._resolveRelatedRowItem(row);
                    if (!item) return;
                    this._openRelatedItemContextMenu(item, e.screenX, e.screenY);
                } catch (err) {
                    Zotero.debug("[Weavero] rel-box ctx err: " + err);
                }
            });
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
            for (const owner of candidates) {
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

    _setupPaneObserver() {
        const doc = Zotero.getMainWindow().document;
        const win = doc.defaultView;

        // Initial pass — there may already be rows present.
        this._scanPaneRows();

        // Anchor the observer to documentElement, not #zotero-view-item:
        // Zotero's renderer can replace the right-pane container itself when
        // the selected item changes, which detaches an observer attached to
        // the inner element. The whole-document observer is broader but the
        // callback exits early unless a mutation involves annotation-row,
        // so the runtime cost stays small.
        let scanTimer = null;
        const scheduleScan = () => {
            if (scanTimer) win.clearTimeout(scanTimer);
            scanTimer = win.setTimeout(() => {
                scanTimer = null;
                try { this._scanPaneRows(); }
                catch(e) { Zotero.debug("[Weavero] pane scan error: " + e); }
            }, 80);
        };

        this._paneObserver = new win.MutationObserver(mutations => {
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
            if (needsNotesScan && this._getEnableNotes()) {
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
        this._paneObserver.observe(doc.documentElement,
            { childList: true, subtree: true, characterData: true });
        Zotero.debug("[Weavero] pane observer attached to documentElement");

        // Focus toggle for right-pane comment editing. When a .content
        // inside a .comment.wv-comment-preview gets focus, swap to raw
        // editable text. On focusout, swap back to the rendered preview.
        // Also handles shadow-DOM cases since focusin bubbles through
        // shadow boundaries when composed:true (the default).
        if (!this._paneFocusInHandler) {
            this._paneFocusInHandler = (e) => {
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
            this._paneFocusOutHandler = (e) => {
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
            doc.addEventListener("focusin", this._paneFocusInHandler, true);
            doc.addEventListener("focusout", this._paneFocusOutHandler, true);
        }
    }

    // ---- Settings ---------------------------------------------------------

    _getShowTreeIcon() {
        try { return !!Zotero.Prefs.get("weavero.showTreeIcon"); }
        catch(e) { return false; }
    }

    _getInlineLinks() {
        try {
            const v = Zotero.Prefs.get("weavero.inlineLinks");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    // ---- Per-surface enable/disable prefs ---------------------------------
    // The user can independently enable each of the four surfaces where we
    // decorate annotation comments. All default to true.
    _getEnableItemsList() {
        try {
            const v = Zotero.Prefs.get("weavero.enableItemsList");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    _getEnableRightPane() {
        try {
            const v = Zotero.Prefs.get("weavero.enableRightPane");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    /** Show the per-annotation Added By badge in the items tree.
     *  Effective only in group libraries (the underlying field is
     *  empty in My Library). Default ON. */
    _getEnableAnnotationAddedBy() {
        try {
            const v = Zotero.Prefs.get("weavero.enableAnnotationAddedBy");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    /** Tint the Added By column text and annotation badge with a
     *  per-user color (hashed from the user name into a small palette
     *  via `_colorForUser`). Default ON. */
    _getEnableAddedByColors() {
        try {
            const v = Zotero.Prefs.get("weavero.enableAddedByColors");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    /** Notes — standalone + child note items across every surface
     *  (items-tree note rows, right-pane Notes box, the note editor
     *  in both the right pane and the pop-out note window). Defaults
     *  OFF so existing users don't see new clickable spans on notes
     *  they've already curated until they explicitly opt in. */
    _getEnableNotes() {
        try {
            const v = Zotero.Prefs.get("weavero.enableNotes");
            return v === undefined ? false : !!v;
        } catch(e) { return false; }
    }
    /** Reader sidebar — the annotation list on the left side of the
     *  reader. Format-agnostic (PDF / EPUB / snapshot). */
    _getEnableReaderSidebar() {
        try {
            const v = Zotero.Prefs.get("weavero.enableReaderSidebar");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Reader document view — the page area where the document renders.
     *  Covers in-document annotation popups and the link badges drawn
     *  over annotation icons. Format-agnostic. */
    _getEnableReaderView() {
        try {
            const v = Zotero.Prefs.get("weavero.enableReaderView");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Sub-toggle of enableReaderView. When false, badges (.wv-marker-badge)
     *  and floating text-annotation buttons (.wv-text-annotation-btn) are NOT
     *  drawn over the document. In-document annotation popups (the small
     *  popup that shows when the user clicks an annotation) still receive
     *  URL / markdown rendering. Default true. */
    _getEnableReaderViewIcons() {
        try {
            const v = Zotero.Prefs.get("weavero.enableReaderViewIcons");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    /** Master switch for inline markdown rendering inside the popup.
     *  Default true. When false: _commentHasIconableContent ignores markdown
     *  marks (so the icon doesn't appear on markdown-only comments) and
     *  _renderInlineMarkdown degrades to a URL-only render. */
    _getEnableMarkdown() {
        // Hardcoded true since v0.0.161: the popup always renders markdown.
        // The original `enableMarkdown` toggle is gone from the UI — having
        // it off didn't add user value (the popup is the only fully
        // formatted view, so disabling it left no way to see markdown).
        return true;
    }

    /** Render markdown directly inside annotation comments. Sub-toggle of
     *  Inline mode (only effective when _getInlineLinks() is also true).
     *  Default true. */
    _getEnableCommentMarkdown() {
        try {
            const v = Zotero.Prefs.get("weavero.enableCommentMarkdown");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Render URLs as coloured/clickable spans directly inside annotation
     *  comments. Sub-toggle of Inline mode (only effective when
     *  _getInlineLinks() is also true). Default true. */
    _getEnableInlineUrls() {
        try {
            const v = Zotero.Prefs.get("weavero.enableInlineUrls");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Show the chain icon on URL-bearing comments in Icon & Popup mode.
     *  Sub-toggle parallel to enableInlineUrls but mode-flipped. Only
     *  effective when _getInlineLinks() is FALSE. Default true. */
    _getEnableIconUrls() {
        try {
            const v = Zotero.Prefs.get("weavero.enableIconUrls");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Show the chain icon on markdown-bearing comments in Icon & Popup mode.
     *  In Icon mode the popup is the only access to formatted markdown, so
     *  without this toggle markdown-only comments would have no affordance.
     *  Default true. */
    _getEnableIconMarkdown() {
        try {
            const v = Zotero.Prefs.get("weavero.enableIconMarkdown");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Show the chain icon on app-link-bearing comments (mailto:, obsidian://,
     *  vscode://, ...) in Icon & Popup mode. Requires the master enableAppLinks
     *  toggle to be on (master invalidates URL_REGEX, dominating this sub).
     *  Default true. */
    _getEnableIconAppLinks() {
        try {
            const v = Zotero.Prefs.get("weavero.enableIconAppLinks");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** True when markdown rendering is on for AT LEAST ONE surface.
     *  Used by _commentHasIconableContent to decide whether markdown markers
     *  count as "iconable" — if neither popup nor inline rendering will
     *  format them, the marks are just text. */
    _anyMarkdownEnabled() {
        return this._getEnableMarkdown() || this._getEnableCommentMarkdown();
    }

    /** Hidden debug pref. When true, every routine sidebar/render pass
     *  emits verbose [Weavero] traces. Default false (silent).
     *  Toggle via Tools → Developer → Run JavaScript:
     *    Zotero.Prefs.set("weavero.debug", true);
     *  Errors and significant one-time events still log unconditionally. */
    _getDebug() {
        try {
            const v = Zotero.Prefs.get("weavero.debug");
            return v === undefined ? false : !!v;
        } catch(e) { return false; }
    }

    /** Routine debug log — only fires when the debug pref is on. Use this
     *  for per-render-pass spam (sidebar scans, span cache hits, etc.).
     *  Errors and rare events should keep using Zotero.debug() directly. */
    _dbg(msg) {
        if (this._getDebug()) Zotero.debug(msg);
    }

    /** Strip every decoration we add to the items-tree annotation rows. */
    _stripItemsList() {
        // Re-entry guard: with the items-list mutation observer running
        // synchronously (v0.0.132), every DOM change we make here instantly
        // re-fires _markCellLinks, which would call us again. Without this
        // guard we recurse / livelock when there are many annotation cells
        // visible. The idempotent shortcuts below also help.
        if (this._stripItemsListBusy) return;
        this._stripItemsListBusy = true;
        try {
            const doc = Zotero.getMainWindow().document;
            // 1. Restore tight annotation-comment cells (highlight / underline /
            //    image / ink / note rows) to plain text. SKIP cells that are
            //    already clean — touching them triggers redundant childList
            //    mutations that fire the tree observer in a tight loop and
            //    freeze Zotero.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment")) {
                const isDirty =
                    cell.querySelector(".wv-text-wrap, .wv-tree-icon, .wv-tree-rel-icon, .wv-url-span")
                    || cell.hasAttribute("data-comment-text")
                    || cell.hasAttribute("data-has-rich")
                    || cell.hasAttribute("data-has-relations")
                    || cell.hasAttribute("data-truncated");
                if (!isDirty) continue;

                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                }
                // Only assign textContent when it actually changes —
                // assigning the same value still emits a childList mutation.
                if (cell.textContent !== text) cell.textContent = text;
                if (cell.hasAttribute("data-has-rich"))     cell.removeAttribute("data-has-rich");
                if (cell.hasAttribute("data-icon-wanted"))   cell.removeAttribute("data-icon-wanted");
                if (cell.hasAttribute("data-has-relations")) cell.removeAttribute("data-has-relations");
                if (cell.hasAttribute("data-comment-text"))  cell.removeAttribute("data-comment-text");
                if (cell.hasAttribute("data-truncated"))     cell.removeAttribute("data-truncated");
                if (cell.hasAttribute("data-has-url"))       cell.removeAttribute("data-has-url");
            }
            // 2. Unwrap any URL spans we injected into other annotation-row
            //    types (text annotations and area / image annotations show
            //    their text in `.cell-text` and get coloured spans there).
            //    `.annotation-row` is the items-tree class — the right-pane
            //    uses the `<annotation-row>` custom *element*, which is a
            //    different selector and won't match.
            for (const span of doc.querySelectorAll(".annotation-row .wv-url-span")) {
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // 3. Remove any leftover tree icons that escaped the cell flatten.
            for (const ic of doc.querySelectorAll(".annotation-row .wv-tree-icon")) {
                ic.remove();
            }
            // 3b. Same for the relations icon.
            for (const ic of doc.querySelectorAll(".annotation-row .wv-tree-rel-icon")) {
                ic.remove();
            }
        } catch(e) {
            Zotero.debug("[Weavero] _stripItemsList: " + e);
        } finally {
            this._stripItemsListBusy = false;
        }
    }

    /** Strip URL spans + popup buttons from right-pane <annotation-row>s. */
    _stripRightPane() {
        try {
            const doc = Zotero.getMainWindow().document;
            for (const span of doc.querySelectorAll(
                    "annotation-row .wv-url-span")) {
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // Revert inline-md rendering: restore the comment text from the
            // cached raw source so disabling the feature gives the user back
            // the original (markered) text instead of a stripped view.
            for (const cmt of doc.querySelectorAll(
                    "annotation-row .comment[data-wv-raw]")) {
                const raw = cmt.getAttribute("data-wv-raw") || "";
                while (cmt.firstChild) cmt.removeChild(cmt.firstChild);
                cmt.appendChild(doc.createTextNode(raw));
                cmt.removeAttribute("data-wv-raw");
                cmt.removeAttribute("data-wv-source");
            }
            for (const btn of doc.querySelectorAll(
                    "annotation-row .wv-btn-pane")) {
                btn.remove();
            }
            // Related-box label rendering: replace decorated labels
            // with a flat textNode of the same text.
            for (const label of doc.querySelectorAll(
                    "related-box .body .row .label[data-wv-related-rendered]")) {
                const t = label.dataset.wvRelatedRendered || label.textContent || "";
                while (label.firstChild) label.removeChild(label.firstChild);
                label.appendChild(doc.createTextNode(t));
                delete label.dataset.wvRelatedRendered;
            }
        } catch(e) { Zotero.debug("[Weavero] _stripRightPane: " + e); }
    }

    /** Re-inject sidebar 🔗 buttons on existing annotation rows whose
     *  comments contain URLs. Mirrors what _sidebarHandler does on render,
     *  but we walk the DOM ourselves because the Reader event has already
     *  fired for every visible row by the time the user toggles the pref. */
    _reinjectSidebarButtons(outerDoc, reader) {
        if (!outerDoc || !reader || !reader._item) return;
        try { this._ensureReaderOuterStyles(outerDoc); } catch(e) {}
        // Resolve the outer-iframe slot to inject into. Tried in priority
        // order; first match wins. The slot is typically a `.head`/
        // `<header>` end-area, sibling to the React `.custom-sections`
        // div where event-driven appends land.
        const findSlot = (row) =>
               row.querySelector(".head .end")
            || row.querySelector("header .end")
            || row.querySelector(".head .menu")
            || row.querySelector("header .menu")
            || row.querySelector(".head")
            || row.querySelector("header")
            || row;
        let addedComment = 0, addedRel = 0;
        const rows = outerDoc.querySelectorAll(".annotation-row, .annotation");
        for (const row of rows) {
            const key = this._findAnnotationKey(row, reader);
            const lib = this.libraryIDFromReader(reader);

            // Capture both icons up-front. The event-driven path
            // (`_sidebarHandler`) places them inside
            // `.custom-sections > .section > .wv-icon-group`; the
            // re-inject path (this function) historically placed them
            // directly in `.end`. To keep the visual order
            // [comment, relations, kebab] regardless of which level
            // each icon happens to live at, we use the OTHER icon as
            // the insertion reference rather than the slot's
            // lastElementChild. That way new buttons land as siblings
            // of any pre-existing icon.
            let existingBtn = row.querySelector(
                "." + BTN_SIDEBAR_CLASS + ":not(.wv-btn-relations)");
            let existingRel = row.querySelector(".wv-btn-relations");
            const comment = key ? this.getModelComment(lib, key) : "";
            const wantsComment = !!key
                && this._iconWantedFor(comment)
                && this._iconAddsValueBeyondInline(comment);
            const ann = this._getAnnotationItem(lib, key);
            const wantsRel = !!ann
                && this._getAnnotationRelatedItems(ann).length > 0;

            // ---- Comment icon -------------------------------------------
            if (!wantsComment) {
                existingBtn?.remove();
                existingBtn = null;
            } else if (!existingBtn) {
                const target = findSlot(row);
                const btn = outerDoc.createElementNS(
                    "http://www.w3.org/1999/xhtml", "button");
                btn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS;
                this._applyIconState(btn, comment);
                const cmt = comment;
                btn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(btn);
                    this.openCommentPopup(cmt, {
                        anchorNode: btn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                // If a relations button is already present, insert
                // BEFORE it (within its parent) so the order stays
                // [comment, relations]. Otherwise fall back to
                // insert-before-kebab in the slot.
                if (existingRel && existingRel.parentNode) {
                    existingRel.parentNode.insertBefore(btn, existingRel);
                } else {
                    const last = target.lastElementChild;
                    if (last) target.insertBefore(btn, last);
                    else      target.appendChild(btn);
                }
                existingBtn = btn;
                addedComment++;
            }

            // ---- Relations icon -----------------------------------------
            // Independent of comment content. Decision: present iff the
            // annotation has any related items right now. Also
            // self-heals when the last relation is removed (icon goes
            // away) or the first is added (icon appears).
            if (!wantsRel) {
                existingRel?.remove();
                existingRel = null;
            } else if (!existingRel) {
                const target = findSlot(row);
                const relBtn = outerDoc.createElementNS(
                    "http://www.w3.org/1999/xhtml", "button");
                relBtn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS
                    + " wv-btn-relations";
                const count = this._getAnnotationRelatedItems(ann).length;
                relBtn.title = count + " Related";
                relBtn.appendChild(this._makeRelationsSvg(outerDoc));
                relBtn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(relBtn);
                    this.openRelationsPopup(ann, {
                        anchorNode: relBtn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                // If a comment button is present (or was just added
                // above), place relations immediately AFTER it in the
                // same parent — guarantees [comment, relations]. The
                // `existingBtn` variable was updated when the comment
                // block inserted a fresh one, so this branch sees the
                // up-to-date state. Otherwise insert-before-kebab.
                if (existingBtn && existingBtn.parentNode) {
                    existingBtn.parentNode.insertBefore(
                        relBtn, existingBtn.nextSibling);
                } else {
                    const last = target.lastElementChild;
                    if (last) target.insertBefore(relBtn, last);
                    else      target.appendChild(relBtn);
                }
                addedRel++;
            }
        }
        if (addedComment || addedRel) {
            this._dbg("[Weavero] sidebar reinject: comment=" + addedComment
                + " relations=" + addedRel);
        }
    }

    /** Convenience wrapper: re-decorate every open reader's sidebar.
     *  Called from the item-modify notifier (relations changes don't
     *  flow through the reader's React annotation prop, so the
     *  renderSidebarAnnotationHeader event won't re-fire — we have to
     *  drive the refresh ourselves) and from `onMainWindowLoad` /
     *  `init` to cover already-rendered rows after a plugin restart. */
    _reinjectAllSidebars() {
        if (!this._getEnableReaderSidebar()) return;
        try {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (idoc) this._reinjectSidebarButtons(idoc, reader);
                } catch(e) {}
            }
        } catch(e) {
            Zotero.debug("[Weavero] _reinjectAllSidebars err: " + e.message);
        }
    }

    /** Strip URL spans from sidebar comments + remove sidebar 🔗 buttons.
     *  If `idoc` is omitted, strips across every open reader. */
    _stripReaderSidebar(idoc) {
        if (!idoc) {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document) this._stripReaderSidebar(iwin.document);
                } catch(e) {}
            }
            return;
        }
        try {
            // Sidebar URL spans live inside .annotation-row / .annotation
            // wrappers; we exclude .annotation-popup so the in-PDF popup's
            // own spans aren't yanked away from underneath that surface.
            const sels = [
                ".annotation-row .comment .wv-url-span",
                ".annotation-row .body .wv-url-span",
                ".annotation .comment .wv-url-span",
            ];
            for (const sel of sels) {
                for (const span of idoc.querySelectorAll(sel)) {
                    if (span.closest(".annotation-popup")) continue;
                    span.replaceWith(idoc.createTextNode(span.textContent || ""));
                }
            }
            // Tear down preview-panel DOM completely: remove the .wv-md-preview
            // overlays, drop the wv-comment-preview/wv-editing classes from
            // each .comment, so the raw .content becomes visible again. Also
            // unwrap any .wv-md-* spans so the rendered formatting reverts.
            for (const cmt of idoc.querySelectorAll(
                    ".annotation-row .comment, .annotation .comment")) {
                if (cmt.closest(".annotation-popup")) continue;
                for (const p of cmt.querySelectorAll(".wv-md-preview")) p.remove();
                cmt.classList.remove("wv-comment-preview");
                cmt.classList.remove("wv-editing");
                // Clear the rebuild rate-limit timestamp so the next
                // _renderPreviewPanel call after a pref toggle can run
                // immediately (the rate limit is only a loop-breaker —
                // a deliberate user-driven rebuild shouldn't have to
                // wait it out).
                cmt.removeAttribute("data-wv-last-rebuild");
            }
            for (const span of idoc.querySelectorAll(
                    ".wv-md-bold, .wv-md-italic, .wv-md-strike, .wv-md-code")) {
                if (span.closest(".annotation-popup")) continue;
                span.replaceWith(idoc.createTextNode(span.textContent || ""));
            }
            for (const btn of idoc.querySelectorAll("." + BTN_SIDEBAR_CLASS)) {
                btn.remove();
            }
        } catch(e) { Zotero.debug("[Weavero] _stripReaderSidebar: " + e); }
    }

    /** Strip in-PDF popup decoration + marker badges + text-annotation
     *  buttons. If `idoc` is omitted, strips across every open reader. */
    _stripPdfView(idoc) {
        if (!idoc) {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document) this._stripPdfView(iwin.document);
                } catch(e) {}
            }
            return;
        }
        try {
            for (const b of idoc.querySelectorAll(".wv-marker-badge")) b.remove();
            for (const b of idoc.querySelectorAll(".wv-text-annotation-btn")) b.remove();
            for (const popup of idoc.querySelectorAll(".annotation-popup")) {
                for (const span of popup.querySelectorAll(".wv-url-span")) {
                    span.replaceWith(idoc.createTextNode(span.textContent || ""));
                }
                for (const btn of popup.querySelectorAll("." + BTN_POPUP_CLASS)) {
                    btn.remove();
                }
            }
        } catch(e) { Zotero.debug("[Weavero] _stripPdfView: " + e); }
    }

    /** Apply a per-surface pref change at runtime — re-runs the surface's
     *  entry point, which now strips or rebuilds based on the new pref. */
    _applySurfacePref(surface) {
        Zotero.debug("[Weavero] _applySurfacePref: " + surface);
        try {
            if (surface === "itemsList") {
                this._markCellLinks();
                return;
            }
            if (surface === "rightPane") {
                this._scanPaneRows();
                return;
            }
            if (surface === "notes") {
                // Three sub-surfaces share one toggle:
                //   1. <note-row>       — items-tree note rows
                //   2. <notes-box>      — right-pane Notes section on a
                //                         parent item
                //   3. <note-editor>    — the contenteditable iframe
                //                         in both the right pane and
                //                         the pop-out note window
                try { this._processNoteRows(); }
                catch(e) { Zotero.debug("[Weavero] _processNoteRows err: " + e); }
                try { this._processNotesBoxes(); }
                catch(e) { Zotero.debug("[Weavero] _processNotesBoxes err: " + e); }
                try { this._processNoteEditors(); }
                catch(e) { Zotero.debug("[Weavero] _processNoteEditors err: " + e); }
                return;
            }
            if (surface !== "readerSidebar" && surface !== "readerView") return;
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                // Outer reader iframe — sidebar list + the in-document popup
                // (`.annotation-popup`) live here.
                const iwin = reader._iframeWindow
                    || (reader._iframe && reader._iframe.contentWindow);
                const outerDoc = iwin && iwin.document;
                if (outerDoc) {
                    if (surface === "readerSidebar") {
                        this._processReaderSidebar(outerDoc);
                        // renderSidebarAnnotationHeader only fires on row
                        // re-render, so a pref-flip alone won't restore the
                        // sidebar 🔗 buttons. Re-inject manually.
                        if (this._getEnableReaderSidebar()) {
                            try { this._reinjectSidebarButtons(outerDoc, reader); }
                            catch(e) { Zotero.debug("[Weavero] sidebar reinject err: " + e); }
                        }
                    }
                    if (surface === "readerView") {
                        for (const popup of outerDoc.querySelectorAll(".annotation-popup")) {
                            this._injectIconIntoPopup(popup, reader);
                        }
                    }
                }
                if (surface === "readerView") {
                    // Inner viewer iframe — marker badges and text-annotation
                    // buttons live here. We cache the doc when our inner
                    // observer wires up; if that hasn't run yet, fall back
                    // to walking the outer doc's iframes for viewer.html.
                    let innerDoc = null;
                    try {
                        const cached = this._readerObservers
                            && this._readerObservers.get(reader);
                        innerDoc = cached && cached.innerDoc;
                    } catch(e) {}
                    if (!innerDoc && outerDoc) {
                        for (const f of outerDoc.querySelectorAll("iframe")) {
                            try {
                                const cd = f.contentDocument;
                                if (cd && (cd.URL || "").includes("viewer.html")) {
                                    innerDoc = cd;
                                    break;
                                }
                            } catch(e) {}
                        }
                    }
                    if (innerDoc) {
                        this._processTextAnnotations(innerDoc);
                        this._processNoteAnnotationOverlays(innerDoc, reader);
                    }
                }
                // Each entry point above gates on its own getter and strips
                // on disabled, so this rescan handles both directions.
            }
        } catch(e) { Zotero.debug("[Weavero] _applySurfacePref err: " + e); }
    }

    /** Apply the inline-vs-icons-only mode change at runtime.
     *  - Toggles :root.wv-icons-only so the tree icon is always visible in
     *    Mode 2 (the only access path to URLs there).
     *  - Wipes existing per-cell state in the items tree so the next mark
     *    pass rebuilds in the new mode (with or without coloured spans).
     *  - Strips any leftover .wv-url-span elements elsewhere so the switch
     *    feels live; right-pane / sidebar will re-mark on the next scan
     *    according to the new mode. */
    _applyInlineLinksPref(inline) {
        Zotero.debug("[Weavero] _applyInlineLinksPref: inline=" + inline);
        try {
            const win = Zotero.getMainWindow();
            const doc = win.document;
            const root = doc.documentElement;
            root.classList.toggle("wv-icons-only", !inline);

            // Items tree: restore each cell to its raw text so the next
            // _markCellLinks pass rebuilds it in the new mode. Removing the
            // .wv-text-wrap directly would wipe the cell content (the wrap
            // holds the text), leaving _markCellLinks nothing to rebuild.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment")) {
                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                }
                // Flatten back to plain text — also drops the .wv-tree-icon
                // and any leftover .wv-url-span children.
                cell.textContent = text;
                cell.removeAttribute("data-has-rich");
                cell.removeAttribute("data-icon-wanted");
                cell.removeAttribute("data-comment-text");
                cell.removeAttribute("data-truncated");
                cell.removeAttribute("data-has-url");
                // Reset the rate-limit timestamp so the upcoming rebuild
                // can run regardless of how recent the previous one was.
                cell.removeAttribute("data-wv-last-rebuild");
            }
            this._markCellLinks();
            // Zotero's items-tree React reconciliation can strip our spans
            // after our rebuild. Schedule retries that clear the per-cell
            // rate-limit attribute and re-run _markCellLinks. The first
            // retry runs at the next animation frame (~16 ms) — early
            // enough that the user never sees plain text — and a backup
            // retry at 150 ms catches reconciliations that happen later
            // than that. The rate-limit on _markCellLinks (which we just
            // cleared per-cell) means these retries can't induce a loop:
            // each retry rebuilds at most once, then is blocked again
            // until the next retry's clear.
            const tryRecover = () => {
                for (const cell of doc.querySelectorAll(
                        ".annotation-row.tight .cell.annotation-comment")) {
                    cell.removeAttribute("data-wv-last-rebuild");
                }
                try { this._markCellLinks(); } catch(e) {}
            };
            if (win.requestAnimationFrame) {
                win.requestAnimationFrame(tryRecover);
            }
            win.setTimeout(tryRecover, 150);

            // Right pane / items-tree-note rows: unwrap any leftover URL spans
            // back into plain text. Marking will re-add them only if Mode 1.
            //
            // CRITICAL: stripping the span invalidates the cache validation
            // markers (data-wv-source / data-wv-rendered / data-wv-last-rebuild,
            // _processRelatedBoxes' data-wv-related-rendered) — without
            // clearing them, the next pass thinks "already rendered" and
            // skips the rebuild that's needed to recreate the span we
            // just removed.
            //
            // BUT — `data-wv-raw` is not a cache marker; it's the SOURCE
            // text (the raw markdown). For text-annotation rows the only
            // copy of the original source is `data-wv-raw` on the
            // .cell-text — `el.textContent` is the stripped form
            // ("bold ..." not "**bold** ..."). Clearing data-wv-raw here
            // would force the next rebuild to read textContent and
            // permanently lose the markdown markers, leaving bold
            // unrendered after a disable/re-enable cycle.
            for (const span of doc.querySelectorAll(".wv-url-span")) {
                let p = span.parentNode;
                while (p && p.nodeType === 1) {
                    if (p.hasAttribute("data-wv-source")
                        || p.hasAttribute("data-wv-rendered")
                        || p.hasAttribute("data-wv-last-rebuild")
                        || (p.dataset && p.dataset.wvRelatedRendered)) {
                        p.removeAttribute("data-wv-source");
                        p.removeAttribute("data-wv-rendered");
                        p.removeAttribute("data-wv-last-rebuild");
                        if (p.dataset) delete p.dataset.wvRelatedRendered;
                        // NOTE: data-wv-raw deliberately NOT cleared.
                        break;
                    }
                    p = p.parentNode;
                }
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // Trigger a fresh pane scan so right-pane rows re-mark per the
            // new mode (no-op in Mode 2 since _markTextLinks skips early).
            try { this._scanPaneRows(); } catch(e) {}

            // Reader iframe(s): unwrap leftover spans, then explicitly re-run
            // the sidebar marker + popup icon pass for the new mode. Relying
            // on the iframe mutation observer alone fails when Mode 2 → Mode 1
            // because there's nothing to mutate (no spans to strip), so no
            // observer callback fires and the sidebar stays plain text.
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (!idoc) continue;
                    // Unwrap any leftover URL spans from when we used to mark
                    // .content directly. SKIP spans inside .wv-md-preview —
                    // those are part of our preview-panel DOM, owned by
                    // _renderPreviewPanel; tearing them down here without
                    // also invalidating the preview's data-source cache
                    // would leave them un-restored on the next pass (the
                    // cache hit makes _renderPreviewPanel skip the rebuild).
                    for (const span of idoc.querySelectorAll(".wv-url-span")) {
                        if (span.closest(".wv-md-preview")) continue;
                        span.replaceWith(idoc.createTextNode(span.textContent || ""));
                    }
                    // Re-mark per the new mode (idempotent in Mode 1, no-op
                    // in Mode 2 since _markTextLinks returns early).
                    this._processReaderSidebar(idoc);
                    // Mode 1 ↔ Mode 2 also flips _iconAddsValueBeyondInline
                    // for every comment, so the 🔗 sidebar buttons must be
                    // re-evaluated. The sidebar handler only fires on row
                    // render (not on pref change), so without this the
                    // buttons stay in whatever state Mode 1 left them.
                    if (this._getEnableReaderSidebar()) {
                        try { this._reinjectSidebarButtons(idoc, reader); }
                        catch(e) { Zotero.debug(
                            "[Weavero] sidebar reinject (inline-links) err: " + e); }
                    }
                    // Re-evaluate any open in-PDF popups too.
                    for (const popup of idoc.querySelectorAll(".annotation-popup")) {
                        this._injectIconIntoPopup(popup, reader);
                    }
                } catch(e) {}
            }
        } catch(e) {
            Zotero.debug("[Weavero] _applyInlineLinksPref error: " + e);
        }
    }

    /** Previously toggled :root.wv-md-disabled to drive M-icon
     *  visibility. The M-icon decoration was removed in v0.3.130; the
     *  pref now only affects whether markdown is rendered inline.
     *  Kept as a no-op so call sites don't need refactoring; safe to
     *  delete in a future cleanup. */
    _applyCommentMarkdownPref() {}

    _applyTreeIconPref(show) {
        Zotero.debug("[Weavero] _applyTreeIconPref called: " + show);
        try {
            const win = Zotero.getMainWindow();
            const el = win.document.documentElement;
            el.classList.toggle("wv-show-tree-icon", show);
            this._dbg("[Weavero] wv-show-tree-icon class set to: " + show
                + " (classList has it: " + el.classList.contains("wv-show-tree-icon") + ")");
            this._dbg("[Weavero] documentElement diag: tagName=" + el.tagName
                + " localName=" + el.localName
                + " namespaceURI=" + el.namespaceURI);
            if (show) {
                // Immediate stamp pass
                this._markCellLinks();
                // Delayed stamp after tree re-renders settle (PDF open / item-select re-renders follow pref change)
                win.setTimeout(() => {
                    this._dbg("[Weavero] _applyTreeIconPref delayed _markCellLinks firing");
                    this._markCellLinks();
                }, 250);
            }
        } catch(e) { Zotero.debug("[Weavero] _applyTreeIconPref error: " + e); }
    }

    _registerPrefPane() {
        try {
            // Theme-aware icon: pick the dark variant if Zotero's
            // UI is currently dark. Theme is detected once at
            // registration; switching theme mid-session won't swap
            // the pref-pane icon (Zotero's PreferencePanes API has
            // no live-update path), but startup is the dominant
            // case anyway.
            const theme = this._detectUIDark() ? "dark" : "light";
            Zotero.PreferencePanes.register({
                pluginID : "weavero@mjthoraval",
                src      : _rootURI + "prefs.html",
                scripts  : [_rootURI + "prefs.js"],
                label    : "Weavero",
                // Plugin icon bundled under icons/ at the XPI root.
                // The pref-pane sidebar renders this around 16–20 px,
                // so pick the smallest bundled size; bigger would
                // just downscale and look softer.
                image    : _rootURI + "icons/icon-" + theme + "-32.png",
            });
        } catch(e) {
            Zotero.debug("[Weavero] _registerPrefPane error: " + e);
        }
    }

    // ---- Init / Destroy ---------------------------------------------------

    async init() {
        // 0. Register default pref values so Zotero's pref-binding system can find them
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.showTreeIcon", false);
        } catch(e) {}
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.inlineLinks", true);
        } catch(e) {}
        // Per-surface enable prefs — default to true so the four core
        // surfaces are decorated out of the box. (Notes default OFF —
        // see below.)
        for (const k of ["enableItemsList", "enableRightPane",
                         "enableReaderSidebar", "enableReaderView"]) {
            try {
                Services.prefs.getDefaultBranch("extensions.zotero.")
                    .setBoolPref("weavero." + k, true);
            } catch(e) {}
        }
        // Notes default to OFF — it's a new surface (post-v0.3.42) and
        // we don't want to surprise existing users with new clickable
        // spans / formatting on notes they've already curated.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.enableNotes", false);
        } catch(e) {}
        // Migration: if the old enablePdfReader pref was explicitly set
        // (rare — user disabled the reader integration), mirror its value
        // into the new sidebar+view keys the first time we run with them
        // missing. The old pref then becomes inert (nothing reads it).
        try {
            const oldVal = Zotero.Prefs.get("weavero.enablePdfReader");
            if (oldVal !== undefined) {
                const sb = Zotero.Prefs.get("weavero.enableReaderSidebar");
                const vw = Zotero.Prefs.get("weavero.enableReaderView");
                if (sb === undefined) {
                    Zotero.Prefs.set("weavero.enableReaderSidebar", !!oldVal);
                }
                if (vw === undefined) {
                    Zotero.Prefs.set("weavero.enableReaderView", !!oldVal);
                }
            }
        } catch(e) {
            Zotero.debug("[Weavero] enablePdfReader migration err: " + e);
        }
        // Inline-mode sub-toggles (URLs / Markdown) and Icon & Popup-mode
        // sub-toggles (URLs / Markdown / App links). Default to true so
        // both modes show full content affordances out of the box. The Icon-
        // mode sub-toggles let users pick which content types trigger the
        // chain icon when comments stay plain text in the items tree.
        for (const k of ["enableInlineUrls", "enableCommentMarkdown",
                         "enableReaderViewIcons",
                         "enableIconUrls", "enableIconMarkdown",
                         "enableIconAppLinks"]) {
            try {
                Services.prefs.getDefaultBranch("extensions.zotero.")
                    .setBoolPref("weavero." + k, true);
            } catch(e) {}
        }
        // Diagnostic / advanced toggles default to FALSE.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.debug", false);
        } catch(e) {}
        // App links master toggle — defaults to FALSE so the per-scheme
        // ticks below have no effect until the user explicitly opts in.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.enableAppLinks", false);
        } catch(e) {}
        // Skip-confirmation toggle — defaults to FALSE so Firefox's
        // safety prompt stays in place unless the user opts out.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.enableAppLinksSkipConfirm", false);
        } catch(e) {}
        // Extra URL schemes default to FALSE — opt-in. Avoids
        // surprising the user with new clickable spans on existing
        // comments after an update.
        for (const def of URL_SCHEMES) {
            try {
                Services.prefs.getDefaultBranch("extensions.zotero.")
                    .setBoolPref("weavero." + def.pref, false);
            } catch(e) {}
        }

        // 1. CSS — and clear any leftover popup panel from a previous
        // plugin instance. Same rationale as injectStyles' defensive
        // remove-then-add: Zotero's in-place plugin upgrade flow doesn't
        // reliably tear down DOM artifacts the previous version added,
        // so init must be defensive about cleaning before adding fresh.
        try {
            const oldPanel = Zotero.getMainWindow().document.getElementById(PANEL_ID);
            if (oldPanel) oldPanel.remove();
        } catch(e) {}
        this.injectStyles();
        // Plugin-upgrade recovery: clear DOM markers left behind by
        // a previous plugin instance. Without this, the new code
        // sees `data-wv-related-rendered` / `data-wv-ctx-wired` etc.
        // on related-box rows and skips reprocessing — leaving the
        // rendered DOM (and its event handlers) tied to the dead
        // old closures. Runs from init() (covers plugin enable /
        // upgrade cases where onMainWindowLoad doesn't refire) and
        // also from onMainWindowLoad below (covers new windows).
        try {
            const win = Zotero.getMainWindow();
            this._resetStaleMarkers(win && win.document);
        } catch(e) {}

        // 2. Reader event listeners
        Zotero.Reader.registerEventListener(
            "renderSidebarAnnotationHeader", this._sidebarHandler, "weavero");
        Zotero.Reader.registerEventListener(
            "createAnnotationContextMenu", this._contextHandler, "weavero");

        // 3. Notifier: new reader tabs
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: async (event, type) => {
                if (type !== "tab" || event !== "add") return;
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 250));
                    for (const reader of Zotero.Reader._readers || [])
                        if (!this._readerObservers.has(reader)) this._setupReaderObserver(reader);
                }
            }
        }, ["tab"], "weavero-tab"));

        // 3b. Notifier: annotation lifecycle (delete/trash/modify).
        // Backstop for the proactive Delete/Backspace handler — the
        // notifier fires only after Zotero's DB transaction + queue
        // commit (often ~100–300 ms after the keystroke), so this
        // path runs second. We still use it because it's the only
        // signal that catches non-keyboard deletions (right-click →
        // Delete, undo, sync). Keys are stamped into
        // _recentlyDeletedKeys so the inner observer's debounced
        // overlay scan can't recreate badges while Zotero's in-memory
        // cache is still settling.
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: (event, type, ids, extraData) => {
                if (type !== "item") return;
                if (event !== "delete" && event !== "trash"
                    && event !== "modify" && event !== "add") return;

                // Pull annotation keys from extraData (the items are
                // already gone from the DB so id-based lookup fails).
                const deletedKeys = new Set();
                if (event === "delete" || event === "trash") {
                    if (extraData && typeof extraData === "object") {
                        for (const id of ids || []) {
                            const meta = extraData[id];
                            if (meta && meta.key) deletedKeys.add(meta.key);
                        }
                    }
                }

                // Track the most-recently-touched annotation per
                // reader. The proactive Delete-key handler uses this
                // when `selectedAnnotationIDs` returns a stale key
                // (the bug we're working around: after a delete,
                // creating a fresh annotation, then pressing Delete,
                // the reader's selectedAnnotationIDs still pointed at
                // the previous, deleted key — so the proactive path
                // tried to remove a badge that was already gone, and
                // the slow notifier path was the only thing that
                // could clean up the new annotation's badge).
                if (event === "add" || event === "modify") {
                    try {
                        for (const id of ids || []) {
                            let item;
                            try { item = Zotero.Items.get(id); } catch (e2) { continue; }
                            if (!item || !item.isAnnotation || !item.isAnnotation()) continue;
                            const parentID = item.parentItemID;
                            const key = item.key;
                            if (!parentID || !key) continue;
                            for (const reader of Zotero.Reader._readers || []) {
                                if (reader._item && reader._item.id === parentID) {
                                    const data = this._readerObservers.get(reader);
                                    if (data) {
                                        data.lastTouchedAnnotationKey = key;
                                        this._dbg("[Weavero] lastTouched: key="
                                            + key + " event=" + event);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        Zotero.debug("[Weavero] lastTouched track error: " + e);
                    }
                }

                // ── Filter-side reapply hooks. Must run BEFORE the
                // 'add' early-return below, otherwise the items-list
                // filter never recomputes after item creation.
                if (event === "add" && ids && ids.length) {
                    if (!this._wvRecentlyAddedItemIDs) {
                        this._wvRecentlyAddedItemIDs = new Set();
                    }
                    for (const id of ids) this._wvRecentlyAddedItemIDs.add(id);
                }
                if (event === "add" || event === "modify"
                    || event === "delete" || event === "trash") {
                    try {
                        const fa = this._isFilterActive(this._filterState);
                        Zotero.debug("[Weavero][add-debug] notifier"
                            + " event=" + event
                            + " ids=" + JSON.stringify(ids)
                            + " filterActive=" + fa);
                        if (fa) {
                            const win = Zotero.getMainWindow();
                            const itemsView = win && win.ZoteroPane
                                && win.ZoteroPane.itemsView;
                            const rp = itemsView && itemsView.rowProvider;
                            const info = {
                                rowsLen: rp && rp._rows ? rp._rows.length : "?",
                                wrappedRowCount: itemsView && itemsView.rowCount,
                                origRowCount: rp && rp._wvOrigGetRowCount
                                    ? rp._wvOrigGetRowCount() : "n/a",
                            };
                            for (const id of ids || []) {
                                info["rowMap[" + id + "]"] = itemsView
                                    && itemsView._rowMap
                                    ? itemsView._rowMap[id] : "n/a";
                            }
                            Zotero.debug(
                                "[Weavero][add-debug] state at notifier: "
                                + JSON.stringify(info));
                        }
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero][add-debug] state probe err: " + e);
                    }
                }
                if (event === "add" && ids && ids.length
                    && this._isFilterActive(this._filterState)) {
                    Zotero.debug(
                        "[Weavero][add-debug] pausing filter patches"
                        + " for add of " + JSON.stringify(ids));
                    try {
                        this._pauseFilterPatches();
                        Zotero.debug(
                            "[Weavero][add-debug] paused OK");
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero][add-debug] pause err: " + e);
                    }
                }
                if ((event === "add" || event === "modify"
                    || event === "delete" || event === "trash")
                    && this._isFilterActive(this._filterState)) {
                    try {
                        const win = Zotero.getMainWindow();
                        if (this._filterReapplyTimer) {
                            win.clearTimeout(this._filterReapplyTimer);
                        }
                        const scheduledIDs = ids ? [...ids] : [];
                        const evt = event;
                        this._filterReapplyTimer = win.setTimeout(() => {
                            this._filterReapplyTimer = null;
                            Zotero.debug(
                                "[Weavero][add-debug] deferred reapply firing"
                                + " (event=" + evt
                                + " scheduledIDs=" + JSON.stringify(scheduledIDs)
                                + " recentlyAddedSize="
                                + (this._wvRecentlyAddedItemIDs
                                    ? this._wvRecentlyAddedItemIDs.size : 0)
                                + ")");
                            try {
                                this._applyItemsListFilter({ cascade: false });
                                const itemsView2 = Zotero.getMainWindow()
                                    && Zotero.getMainWindow().ZoteroPane
                                    && Zotero.getMainWindow().ZoteroPane.itemsView;
                                const rp2 = itemsView2 && itemsView2.rowProvider;
                                const post = {
                                    wrappedCount: itemsView2 && itemsView2.rowCount,
                                    origCount: rp2 && rp2._wvOrigGetRowCount
                                        ? rp2._wvOrigGetRowCount() : "n/a",
                                };
                                for (const id of scheduledIDs) {
                                    post["rowMap[" + id + "]"] = itemsView2
                                        && itemsView2._rowMap
                                        ? itemsView2._rowMap[id] : "n/a";
                                }
                                Zotero.debug(
                                    "[Weavero][add-debug] post-reapply: "
                                    + JSON.stringify(post));
                            } catch (e) {
                                Zotero.debug(
                                    "[Weavero][add-debug] reapply err: " + e);
                            }
                        }, 100);
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero][filter] notifier reapply schedule err: " + e);
                    }
                }

                // Only the delete/trash/modify branches do reader-
                // doc work below; 'add' alone just primes the
                // lastTouched tracker and exits.
                if (event === "add") return;

                for (const reader of Zotero.Reader._readers || []) {
                    const data = this._readerObservers.get(reader);
                    const innerDoc = data && data.innerDoc;
                    if (!innerDoc) continue;

                    // Stamp deleted keys so the debounced overlay scan
                    // skips recreating their badges. Cleared again by
                    // _processNoteAnnotationOverlays once getAnnotations()
                    // stops returning the key (cache caught up), or
                    // after 60 s as a safety net.
                    if (deletedKeys.size) {
                        const now = Date.now();
                        for (const k of deletedKeys) {
                            this._recentlyDeletedKeys.set(k, now);
                        }
                    }

                    // Direct DOM removal by key — both inner PDF.js
                    // and outer reader iframe (badges may live in
                    // either depending on Zotero's layout).
                    let removed = 0;
                    if (deletedKeys.size) {
                        let outerDoc = null;
                        try {
                            const iwin = reader._iframeWindow
                                || (reader._iframe && reader._iframe.contentWindow);
                            if (iwin && iwin.document) outerDoc = iwin.document;
                        } catch (e) {}
                        for (const doc of [innerDoc, outerDoc]) {
                            if (!doc) continue;
                            for (const k of deletedKeys) {
                                for (const badge of doc.querySelectorAll(
                                    ".wv-marker-badge[data-wv-for=\"" + k + "\"]")) {
                                    badge.remove();
                                    removed++;
                                }
                            }
                        }
                        if (removed) {
                            this._dbg("[Weavero] notifier "
                                + event + " removed " + removed
                                + " badge(s) keys="
                                + JSON.stringify([...deletedKeys]));
                        }
                    }

                    // Refresh text-annotation buttons. For delete/
                    // trash skip the full overlay scan — getAnnotations()
                    // may still return the just-deleted annotation
                    // (cache stale), and the inner observer will run
                    // the scan ~100 ms later anyway, by which time the
                    // _recentlyDeletedKeys gate is in place.
                    try { this._processTextAnnotations(innerDoc); }
                    catch (e) { Zotero.debug("[Weavero] notifier text-ann scan: " + e); }
                    if (event !== "delete" && event !== "trash") {
                        try { this._processNoteAnnotationOverlays(innerDoc, reader); }
                        catch (e) { Zotero.debug("[Weavero] notifier overlay scan: " + e); }
                    }
                }

                // Refresh relations icons across both surfaces (reader
                // sidebar + right pane). Relations are stored as
                // `dc:relation` triples on items and don't flow into
                // the reader's React annotation prop or trigger a
                // right-pane row re-render — so neither
                // renderSidebarAnnotationHeader nor the right-pane
                // mutation observer catches a relation add/remove.
                // We drive the refresh from the notifier instead:
                // `addRelatedItem` / `removeRelatedItem` both `save()`
                // the involved items, which fires "modify".
                //
                // Bounded by visible rows (typically <50 per surface)
                // and gated on each surface pref, so this is cheap to
                // run on every item modification.
                if (event === "modify" || event === "add"
                    || event === "delete" || event === "trash") {
                    try { this._reinjectAllSidebars(); }
                    catch (e) { Zotero.debug(
                        "[Weavero] notifier sidebar reinject: " + e); }
                    try { this._scanPaneRows(); }
                    catch (e) { Zotero.debug(
                        "[Weavero] notifier pane reinject: " + e); }
                }

                // Items-list filter: when active, the row-keep array
                // is computed against the current `_rows` snapshot. A
                // new item lands in `_rows` via Zotero's own notifier
                // handler — but our `keep` doesn't know about it, so
                // the new row is invisible (and the items pane goes
                // inconsistent: itemBox tries to render `this.item`
                // and gets `undefined`). Defer a re-apply so Zotero's
                // tree handler runs first; debounced so a burst of
                // modifies (e.g. during sync) doesn't thrash.
                //
                // Newly-created items are tracked in a session Set so
                // the filter pass can force-include them — otherwise
                // a brand-new item that doesn't yet match the active
                // filter (e.g. a fresh Journal Article with no yellow
                // annotations under an annotation-color=yellow filter)
                // would be created, selected by Zotero, then promptly
                // hidden, leaving the item box without a current
                // item.
            }
        }, ["item"], "weavero-item"));

        // 4. Polling fallback for readers
        this._pollInterval = setInterval(() => {
            for (const reader of Zotero.Reader._readers || [])
                if (!this._readerObservers.has(reader)) this._setupReaderObserver(reader);
        }, 2000);

        // 5. Readers already open at load time
        for (const reader of Zotero.Reader._readers || [])
            await this._setupReaderObserver(reader);

        // 6. Tree: event delegation (no DOM injection, no blink)
        this._setupTreeClickDelegate();

        // 6a1. Items-list filter bar (chips + popover above the items
        // tree). Self-retries until the items pane is mounted.
        this._setupItemsListFilter();

        // 6a2. Patch the "List all tabs" panel to group rows by
        // library when 2+ libraries are open in tabs. Self-retries
        // if the tabs-menu-panel custom element isn't upgraded yet.
        try {
            this._setupTabsMenuLibrarySort(Zotero.getMainWindow());
        } catch (e) {}
        // 6a3. Highlight the library row of the current item in any
        // `libraries-collections-box` (item pane) when the item is
        // replicated across libraries.
        try {
            this._setupLibrariesBoxHighlight(Zotero.getMainWindow());
        } catch (e) {}

        // 6b. Resolve the icon URLs used by `decorateContextMenu`. The
        // reader iframe is content (loaded from `resource://zotero/`),
        // which Mozilla's CheckLoadURI policy forbids from linking to
        // `jar:file:///…/weavero.xpi!/icon-16.png` — `<img src>` set
        // to the raw `_rootURI + …` path triggers a "may not load or
        // link to" Security Error and renders the broken-image glyph.
        // Workaround: fetch the icon once at startup and embed it as
        // a `data:image/png;base64,…` URL, which is allowed inside
        // content. Cache BOTH light and dark variants on the instance
        // so we can swap them based on theme without re-encoding.
        // `decorateContextMenu` reads `_menuItemIconURL` (a getter
        // below) to pick the right variant at use time.
        const encodeIcon = async (path) => {
            try {
                const resp = await fetch(_rootURI + path);
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let bin = "";
                for (let i = 0; i < bytes.length; i++) {
                    bin += String.fromCharCode(bytes[i]);
                }
                return "data:image/png;base64," + btoa(bin);
            } catch(e) {
                Zotero.debug("[Weavero] menu icon encode err ("
                    + path + "): " + e);
                return "";
            }
        };
        this._menuItemIconURLLight = await encodeIcon("icons/icon-light-16.png");
        this._menuItemIconURLDark  = await encodeIcon("icons/icon-dark-16.png");
        // Back-compat alias: callers that read `_menuItemIconURL`
        // directly (rather than the getter below) get the
        // theme-appropriate URL via the getter property.
        Object.defineProperty(this, "_menuItemIconURL", {
            get: () => this._detectUIDark()
                ? this._menuItemIconURLDark
                : this._menuItemIconURLLight,
            configurable: true,
        });
        // (Chain icon for the iframe React menu is rendered as inline
        // <svg> by `decorateContextMenu` via `_makeRelationsSvg`, which
        // uses a baked amber fill via prefers-color-scheme — see
        // `_injectReaderStyles`.)
        // For the chrome XUL items-tree menu, bake amber-fill data URLs
        // (one per theme) so the chain icon matches the sidebar's
        // `.wv-btn-relations` color regardless of theme. The system
        // chrome://...related.svg uses `context-fill` which resolves
        // to the menu's neutral icon color, not amber.
        try {
            this._relationsIconURLLight = "data:image/svg+xml;base64,"
                + btoa(SCHEME_SVG_TEMPLATE.replace("__FILL__", "#7a4a00"));
            this._relationsIconURLDark = "data:image/svg+xml;base64,"
                + btoa(SCHEME_SVG_TEMPLATE.replace("__FILL__", "#ffb84d"));
        } catch (e) {
            Zotero.debug("[Weavero] relations icon encode err: " + e);
            this._relationsIconURLLight = "";
            this._relationsIconURLDark  = "";
        }

        // 7. Right pane
        this._setupPaneObserver();

        // 7b. Items-tree right-click menu — adds "Add related item…"
        // when the right-clicked selection contains annotation(s).
        this._setupItemsListContextMenu();
        // 7b-bis. Collections-tree right-click menu — adds
        // "Copy Collection Link" on collection rows.
        this._setupCollectionsContextMenu();

        // 7c. Pop-out note windows — main-window pane observer doesn't
        // see them, so wire a Window Mediator listener that catches
        // note.xhtml windows as they open.
        this._setupNoteWindowListener();
        // Initial pass over any note surface that's already mounted
        // when the plugin starts (e.g. user enabled the toggle, then
        // restarted Zotero with a note already selected).
        if (this._getEnableNotes()) {
            try { this._processNoteRows(); }
            catch(e) { Zotero.debug("[Weavero] init note-rows err: " + e); }
            try { this._processNotesBoxes(); }
            catch(e) { Zotero.debug("[Weavero] init notes-box err: " + e); }
            try { this._processNoteEditors(); }
            catch(e) { Zotero.debug("[Weavero] init note-editors err: " + e); }
        }

        // 8. Preferences pane + apply saved icon pref
        this._registerPrefPane();
        // Items-list "Related" column.
        this._registerItemTreeColumns();
        this._applyTreeIconPref(this._getShowTreeIcon());
        this._applyInlineLinksPref(this._getInlineLinks());
        this._applyCommentMarkdownPref();
        this._applyUIThemeClass();
        // Sync per-scheme `network.protocol-handler.warn-external.<x>`
        // prefs with the user's "Open without confirmation" choice.
        // Idempotent — covers a Zotero restart with the toggle still on.
        try { this._applyAppLinkConfirmPref(); }
        catch(e) { Zotero.debug("[Weavero] init confirm sync err: " + e); }
        // React to OS-driven theme changes by listening on the main
        // window's prefers-color-scheme media query. Zotero's
        // theme-detection isn't fully exposed, but UI bg luma is
        // what _detectUIDark samples — and a media-query change is
        // a strong signal that bg may have flipped, so a re-detect
        // is appropriate.
        try {
            const win = Zotero.getMainWindow();
            if (win && win.matchMedia) {
                this._uiThemeMq = win.matchMedia("(prefers-color-scheme: dark)");
                this._uiThemeMqHandler = () => this._applyUIThemeClass();
                if (typeof this._uiThemeMq.addEventListener === "function") {
                    this._uiThemeMq.addEventListener("change", this._uiThemeMqHandler);
                }
            }
            // Also watch the Zotero main window's documentElement for
            // attribute/class flips. Zotero's three theme settings
            // (System / Light / Dark in General → Appearance) toggle
            // an attribute on this node; the matchMedia listener
            // above only catches the System-mode case where a flip
            // is OS-driven. Without this observer, a direct setting
            // change between Light and Dark wouldn't fire any of our
            // hooks until the next reader open / window load.
            const win2 = Zotero.getMainWindow();
            const doc2 = win2 && win2.document;
            if (doc2 && doc2.documentElement && win2.MutationObserver) {
                this._uiThemeObserver = new win2.MutationObserver(() => {
                    try { this._applyUIThemeClass(); } catch (e) {}
                });
                this._uiThemeObserver.observe(doc2.documentElement, {
                    attributes: true,
                    attributeFilter: [
                        "class", "lwtheme", "lwthemetextcolor",
                        "theme", "data-theme",
                    ],
                });
            }
        } catch (e) {}

        // 9. Watch pref changes from Settings pane
        // Use root branch + broad match to diagnose what path Zotero actually writes
        try {
            this._prefBranch = Services.prefs.getBranch("");
            this._prefObserver = {
                observe: (_s, _t, data) => {
                    if (data.includes("weavero")) {
                        this._dbg("[Weavero] pref changed at path: " + data);
                    }
                    if (data === "extensions.zotero.weavero.showTreeIcon") {
                        this._applyTreeIconPref(this._getShowTreeIcon());
                    }
                    if (data === "extensions.zotero.weavero.inlineLinks") {
                        this._applyInlineLinksPref(this._getInlineLinks());
                    }
                    if (data === "extensions.zotero.weavero.enableItemsList") {
                        this._applySurfacePref("itemsList");
                    }
                    if (data === "extensions.zotero.weavero.enableRightPane") {
                        this._applySurfacePref("rightPane");
                    }
                    if (data === "extensions.zotero.weavero.enableNotes") {
                        // Toggling Notes off → strip decorated content
                        // back to plain text BEFORE the rescan (which
                        // would no-op since `_processNote*` early-return
                        // when the toggle is off). Toggling on → rescan
                        // re-decorates everything.
                        try {
                            if (!this._getEnableNotes()) this._stripNotes();
                        } catch(e) { Zotero.debug("[Weavero] strip-notes err: " + e); }
                        this._applySurfacePref("notes");
                    }
                    if (data === "extensions.zotero.weavero.enableReaderSidebar") {
                        this._applySurfacePref("readerSidebar");
                    }
                    if (data === "extensions.zotero.weavero.enableReaderView") {
                        this._applySurfacePref("readerView");
                    }
                    if (data === "extensions.zotero.weavero.enableReaderViewIcons") {
                        this._applySurfacePref("readerView");
                    }
                    // Tags column auto-count toggle — re-render the
                    // items view so already-painted Tags cells pick
                    // up the new pref. Without this the change only
                    // shows after scrolling or selection moves.
                    if (data === "extensions.zotero.weavero.enableTagsCountAuto") {
                        try {
                            const w = Zotero.getMainWindow();
                            const iv = w && w.ZoteroPane && w.ZoteroPane.itemsView;
                            if (iv && iv.tree && iv.tree.invalidate) {
                                iv.tree.invalidate();
                            }
                        } catch(e) {
                            Zotero.debug("[Weavero] tags-pref invalidate err: " + e);
                        }
                    }
                    // Added By prefs — invalidate so annotation-row badges
                    // and addedBy-column tints rebuild with the new state.
                    if (data === "extensions.zotero.weavero.enableAnnotationAddedBy"
                        || data === "extensions.zotero.weavero.enableAddedByColors") {
                        try {
                            const w = Zotero.getMainWindow();
                            const iv = w && w.ZoteroPane && w.ZoteroPane.itemsView;
                            if (iv && iv.tree && iv.tree.invalidate) {
                                iv.tree.invalidate();
                            }
                            // The badge gating is in renderRow, the tint
                            // is in `_paintAddedByCells` (called from
                            // `_markCellLinks`). Invalidation triggers
                            // both.
                            try { this._markCellLinks(); } catch(e) {}
                        } catch(e) {
                            Zotero.debug("[Weavero] addedBy-pref invalidate err: " + e);
                        }
                    }
                    // Content-type sub-prefs — Inline mode (enableInlineUrls /
                    // enableCommentMarkdown) and Icon & Popup mode (enableIcon*).
                    // Toggling any of these changes how comments render or
                    // whether the chain icon attaches on every surface, so
                    // rescan all four. The comment-md pref also drives
                    // :root.wv-md-disabled (gates M-icon visibility in the
                    // items list).
                    //
                    // Strip the right-pane and reader-sidebar spans /
                    // previews BEFORE re-scanning so any stale state
                    // (e.g. URL spans from a previous "URLs on" render)
                    // is cleared. The re-scan then rebuilds whatever the
                    // new prefs call for. Without this, URL-only comments
                    // retain their old spans because the early-return
                    // case in _renderPaneCommentInline can't safely strip
                    // (running on every observer fire risks an infinite
                    // loop during sidebar tear-down).
                    if (data === "extensions.zotero.weavero.enableInlineUrls"
                        || data === "extensions.zotero.weavero.enableCommentMarkdown"
                        || data === "extensions.zotero.weavero.enableIconUrls"
                        || data === "extensions.zotero.weavero.enableIconMarkdown"
                        || data === "extensions.zotero.weavero.enableIconAppLinks") {
                        if (data === "extensions.zotero.weavero.enableCommentMarkdown") {
                            this._applyCommentMarkdownPref();
                        }
                        try { this._stripRightPane(); } catch(e) {}
                        for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                            try {
                                const iwin = reader._iframeWindow
                                    || (reader._iframe && reader._iframe.contentWindow);
                                const idoc = iwin && iwin.document;
                                if (idoc) this._stripReaderSidebar(idoc);
                            } catch(e) {}
                        }
                        this._applySurfacePref("itemsList");
                        this._applySurfacePref("rightPane");
                        this._applySurfacePref("readerSidebar");
                        this._applySurfacePref("readerView");
                    }
                    // Skip-confirm toggle — sync warn-external prefs.
                    if (data === "extensions.zotero.weavero.enableAppLinksSkipConfirm") {
                        try { this._applyAppLinkConfirmPref(); }
                        catch(e) { Zotero.debug("[Weavero] confirm sync err: " + e); }
                    }
                    // Extra-scheme toggles — invalidate the cached
                    // URL_REGEX / URL_SCHEME_ALT, then strip and rescan
                    // every surface so newly-enabled schemes start
                    // rendering and newly-disabled ones flatten back to
                    // plain text. Same teardown sequence as the
                    // inline-toggle branch above.
                    // Also fires for the master `enableAppLinks` toggle
                    // since flipping it changes which schemes the regex
                    // includes.
                    if (/^extensions\.zotero\.weavero\.enable\w+Scheme$/.test(data)
                        || data === "extensions.zotero.weavero.enableAppLinks") {
                        // Re-apply warn-external prefs too, since the
                        // set of "enabled schemes that should skip
                        // confirmation" depends on this pref.
                        try { this._applyAppLinkConfirmPref(); }
                        catch(e) { Zotero.debug("[Weavero] confirm sync err: " + e); }
                        // Refresh note-editor stylesheets too — the
                        // app-link colour rules depend on enabled schemes.
                        try { this._refreshAllNoteEditorStyles(); }
                        catch(e) { Zotero.debug("[Weavero] note-css refresh err: " + e); }
                        this._urlRegexCache     = null;
                        this._urlSchemeAltCache = null;
                        try { this._stripRightPane(); } catch(e) {}
                        for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                            try {
                                const iwin = reader._iframeWindow
                                    || (reader._iframe && reader._iframe.contentWindow);
                                const idoc = iwin && iwin.document;
                                if (idoc) this._stripReaderSidebar(idoc);
                            } catch(e) {}
                        }
                        this._applySurfacePref("itemsList");
                        this._applySurfacePref("rightPane");
                        this._applySurfacePref("readerSidebar");
                        this._applySurfacePref("readerView");
                    }
                }
            };
            this._prefBranch.addObserver("", this._prefObserver, false);
            Zotero.debug("[Weavero] pref observer registered on root branch");
        } catch(e) { Zotero.debug("[Weavero] pref observer error: " + e); }

        Zotero.debug("[Weavero] initialized — showTreeIcon=" + this._getShowTreeIcon());
    }

    /** Called by the bootstrap shim when a fresh main window opens. The
     *  previous window's observers/handlers (if any) hold stale doc
     *  references — tear them down and re-attach to the live window.
     *  Called BEFORE init() too if Zotero opens the window before the
     *  plugin's init resolves; the teardown calls are no-op safe so this
     *  is idempotent. */
    onMainWindowLoad(_window) {
        try {
            this._teardownTreeClickDelegate();
            this._teardownItemsListContextMenu();
            this._teardownCollectionsContextMenu();
            this._teardownTabsMenuLibrarySort(_window);
            this._teardownLibrariesBoxHighlight(_window);
            this._paneObserver?.disconnect();
            this._paneObserver = null;
            this._treeMarkObserver?.disconnect();
            this._treeMarkObserver = null;
            // Drop the URL-title restorer attached to the items-tree
            // XUL element (defends against Zotero's overflow handler
            // stripping our title; see `_setupTreeClickDelegate`).
            try {
                const _doc = _window && _window.document;
                const _tree = _doc && (_doc.getElementById("item-tree-main")
                    || _doc.getElementById("item-tree-main-default"));
                if (_tree && _tree._wvUrlTitleListener) {
                    _tree.removeEventListener("mouseover", _tree._wvUrlTitleListener);
                    delete _tree._wvUrlTitleListener;
                }
            } catch(e) {}
            // Plugin-upgrade recovery: clear any DOM markers the
            // OLD plugin instance left behind. Without this, the
            // new code sees `data-wv-related-rendered` /
            // `data-wv-ctx-wired` etc. on related-box rows and
            // skips reprocessing — leaving the rendered DOM
            // (and its event handlers) tied to the dead old
            // closures, which then no-op.
            try { this._resetStaleMarkers(_window && _window.document); }
            catch(e) {}
            // (Re-)inject the plugin stylesheet and clear any leftover
            // popup panel. On a Zotero startup, init() runs as part of
            // plugin startup BEFORE any main window has been created, so
            // its injectStyles() call silently throws (Zotero.getMainWindow()
            // returns null). Re-running it here, when a window is
            // guaranteed to exist, finally lands the CSS — without this,
            // the comment popup looks unstyled until the user disables
            // and re-enables the plugin. injectStyles' defensive
            // remove-then-add makes calling twice idempotent.
            try {
                const oldPanel = _window
                    && _window.document
                    && _window.document.getElementById(PANEL_ID);
                if (oldPanel) oldPanel.remove();
            } catch(e) {}
            this.injectStyles();
            // Re-attach to the now-live document.
            this._setupTreeClickDelegate();
            this._setupItemsListContextMenu();
            this._setupCollectionsContextMenu();
            this._setupPaneObserver();
            this._setupItemsListFilter();
            this._setupTabsMenuLibrarySort(_window);
            this._setupLibrariesBoxHighlight(_window);
            // Re-apply CSS-class state (these set classes on root.documentElement).
            this._applyTreeIconPref(this._getShowTreeIcon());
            this._applyInlineLinksPref(this._getInlineLinks());
            this._applyCommentMarkdownPref();
            this._applyUIThemeClass();
            // Refresh sidebar icons across any open readers. The
            // renderSidebarAnnotationHeader event won't re-fire for rows
            // that were already mounted before the plugin (re-)started,
            // so without this pass the relations + comment icons would
            // be missing on those rows until the user scrolls or the
            // annotation otherwise re-renders.
            try { this._reinjectAllSidebars(); } catch(e) {}
        } catch(e) {
            Zotero.debug("[Weavero] onMainWindowLoad init err: " + e);
        }
    }

    /** Called by the bootstrap shim when the main window closes. Disconnect
     *  observers eagerly so the next mutation in the dying doc doesn't go
     *  through dead refs. Lighter than destroy() — preferences observer,
     *  reader event listeners etc. survive across windows. */
    onMainWindowUnload(_window) {
        try {
            this._teardownTreeClickDelegate();
            this._teardownItemsListContextMenu();
            this._teardownCollectionsContextMenu();
            this._paneObserver?.disconnect();
            this._paneObserver = null;
            this._treeMarkObserver?.disconnect();
            this._treeMarkObserver = null;
        } catch(e) {
            Zotero.debug("[Weavero] onMainWindowUnload err: " + e);
        }
    }

    destroy() {
        // 1. Tear down listeners / observers / timers.
        if (this._prefObserver && this._prefBranch) {
            try { this._prefBranch.removeObserver("", this._prefObserver); } catch(e) {}
            this._prefObserver = null;
            this._prefBranch = null;
        }
        if (this._uiThemeMq && this._uiThemeMqHandler) {
            try {
                if (typeof this._uiThemeMq.removeEventListener === "function") {
                    this._uiThemeMq.removeEventListener("change", this._uiThemeMqHandler);
                }
            } catch (e) {}
            this._uiThemeMq = null;
            this._uiThemeMqHandler = null;
        }
        if (this._uiThemeObserver) {
            try { this._uiThemeObserver.disconnect(); } catch (e) {}
            this._uiThemeObserver = null;
        }

        try { Zotero.Reader.unregisterEventListener("renderSidebarAnnotationHeader", "weavero"); } catch(e) {}
        try { Zotero.Reader.unregisterEventListener("createAnnotationContextMenu", "weavero"); } catch(e) {}
        this._unregisterItemTreeColumns();
        try { this._unpatchAnnotationRow(); } catch (e) {}

        for (const id of this._notifierIDs || []) {
            try { Zotero.Notifier.unregisterObserver(id); } catch(e) {}
        }
        this._notifierIDs = [];

        clearInterval(this._pollInterval); this._pollInterval = null;
        this._teardownTreeClickDelegate();
        this._teardownItemsListContextMenu();
        this._teardownCollectionsContextMenu();
        this._teardownNoteWindowListener();
        this._teardownItemsListFilter();
        try {
            this._teardownTabsMenuLibrarySort(Zotero.getMainWindow());
        } catch (e) {}
        try {
            this._teardownLibrariesBoxHighlight(Zotero.getMainWindow());
        } catch (e) {}
        this._paneObserver?.disconnect(); this._paneObserver = null;

        // Clear any `network.protocol-handler.warn-external.<x>`
        // overrides we set so the user's profile doesn't carry our
        // pref churn after the plugin is removed. Only clears values
        // we recognise as ours (FALSE) — leaves any TRUE overrides
        // the user might have set themselves intact.
        try {
            for (const def of URL_SCHEMES) {
                const prefName = "network.protocol-handler.warn-external." + def.name;
                try {
                    if (Services.prefs.prefHasUserValue(prefName)
                            && Services.prefs.getBoolPref(prefName, true) === false) {
                        Services.prefs.clearUserPref(prefName);
                    }
                } catch(e) {}
            }
        } catch(e) {}

        // 2. Clean up everything we put into the main window's DOM.
        try {
            const doc = Zotero.getMainWindow().document;
            const root = doc.documentElement;

            // Drop the mode classes we add to <html>
            root.classList.remove("wv-show-tree-icon", "wv-icons-only", "wv-ui-dark");

            // DIAG: pre-unwrap snapshot of related-box labels so we can
            // see the live state at disable-time.
            try {
                const relLabels = doc.querySelectorAll(
                    "related-box .body .row .box .label");
                Zotero.debug("[Weavero][diag] destroy: "
                    + relLabels.length + " related-box label(s) before unwrap");
                let i = 0;
                for (const l of relLabels) {
                    if (i >= 3) break;
                    const box = l.closest(".box");
                    Zotero.debug("[Weavero][diag] destroy pre[" + i + "]"
                        + " live=" + JSON.stringify(
                            (l.textContent || "").slice(0, 80))
                        + " aria=" + JSON.stringify(
                            ((box && box.getAttribute("aria-label")) || "").slice(0, 80))
                        + " wvMd=" + l.querySelectorAll(".wv-md").length
                        + " wvUrl=" + l.querySelectorAll(".wv-url-span").length);
                    i++;
                }
            } catch (e) {}

            // Strip notes surfaces (items-tree note rows, right-pane
            // notes-box labels, note-editor iframes — both right-pane
            // and pop-out windows). _stripNotes does the cell-by-cell
            // unwrap + removes the injected note-editor stylesheet +
            // detaches the per-iframe listeners, mirroring what
            // happens when the user unticks the Notes surface pref.
            // Without this call, plugin-disable leaves stale rendered
            // links / formatted text in note content until the user
            // re-enables the plugin or restarts Zotero.
            try { this._stripNotes(); } catch(e) {}

            // Restore items-tree annotation comment cells to their raw text.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment")) {
                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s ]*🔗\s*$/, "")
                              .trim();
                }
                cell.textContent = text;
                cell.removeAttribute("data-has-rich");
                cell.removeAttribute("data-icon-wanted");
                cell.removeAttribute("data-comment-text");
                cell.removeAttribute("data-truncated");
                cell.removeAttribute("data-has-url");
            }

            // Unwrap leftover .wv-md / .wv-url-span elements (right pane,
            // related-box labels, note rows). These need source-text restoration
            // so a re-enable can re-parse the original markdown / URLs.
            //
            // Two render modes produce these spans:
            //   - "tree" mode (related-box, items-list note .cell-text):
            //     markdown markers / link brackets are STRIPPED so the row
            //     reads cleanly. Restore them here so re-render works.
            //   - "non-tree" mode (right pane / popup): the markers / brackets
            //     are emitted as adjacent text nodes around the span. Just
            //     unwrap; the surrounding text already has them.
            //
            // Detect mode by looking at the previous sibling text node — if
            // it ends with the expected marker / bracket, we're in non-tree
            // mode (markers already preserved). Otherwise we're in tree mode
            // and need to re-emit them.
            for (const span of doc.querySelectorAll(".wv-md")) {
                const cls = span.className || "";
                let marker = "";
                if (cls.includes("wv-md-bold"))         marker = "**";
                else if (cls.includes("wv-md-italic"))  marker = "*";
                else if (cls.includes("wv-md-strike"))  marker = "~~";
                else if (cls.includes("wv-md-code"))    marker = "`";
                const prev = span.previousSibling;
                const haveMarker = !!(prev && prev.nodeType === 3
                    && (prev.nodeValue || "").endsWith(marker));
                const inner = span.textContent || "";
                const text = haveMarker ? inner : (marker + inner + marker);
                span.replaceWith(doc.createTextNode(text));
            }
            for (const span of doc.querySelectorAll(".wv-url-span")) {
                const inner = span.textContent || "";
                const href = span.getAttribute("data-href") || "";
                let text;
                if (!href || inner === href) {
                    // Bare URL — same in both modes.
                    text = inner;
                } else {
                    // Markdown link [label](url). Tree mode strips the brackets
                    // so the label is the only text; restore as `[label](url)`.
                    // Non-tree mode keeps `[` before and `](url)` after as
                    // adjacent text nodes; just unwrap the label.
                    const prev = span.previousSibling;
                    const prevHasBracket = !!(prev && prev.nodeType === 3
                        && (prev.nodeValue || "").endsWith("["));
                    text = prevHasBracket ? inner
                        : ("[" + inner + "](" + href + ")");
                }
                span.replaceWith(doc.createTextNode(text));
            }

            // Remove any of our buttons / icons that escaped the cell-restore
            // pass (e.g. injected outside .annotation-row.tight). Unwrap
            // `.wv-text-wrap` separately — it contains the host element's
            // text content, so removing it would erase the label / row.
            for (const wrap of doc.querySelectorAll(".wv-text-wrap")) {
                const parent = wrap.parentNode;
                if (!parent) continue;
                while (wrap.firstChild) {
                    parent.insertBefore(wrap.firstChild, wrap);
                }
                parent.removeChild(wrap);
            }
            for (const el of doc.querySelectorAll(
                    ".wv-btn, .wv-tree-icon")) {
                el.remove();
            }

            // DIAG: post-unwrap snapshot of related-box labels.
            try {
                const relLabels = doc.querySelectorAll(
                    "related-box .body .row .box .label");
                let i = 0;
                for (const l of relLabels) {
                    if (i >= 3) break;
                    Zotero.debug("[Weavero][diag] destroy post[" + i + "]"
                        + " live=" + JSON.stringify(
                            (l.textContent || "").slice(0, 80))
                        + " wvMd=" + l.querySelectorAll(".wv-md").length
                        + " wvUrl=" + l.querySelectorAll(".wv-url-span").length);
                    i++;
                }
            } catch (e) {}

            // Drop our cache markers from any element that wasn't already
            // wiped above (related-box labels, right-pane comments, note
            // .cell-text spans). Without this the next plugin instance
            // sees `data-wv-source` from the old run and skips the rebuild.
            for (const el of doc.querySelectorAll(
                    "[data-wv-source], [data-wv-rendered], [data-wv-raw],"
                    + " [data-wv-related-rendered], [data-wv-ctx-wired],"
                    + " [data-wv-last-rebuild]")) {
                el.removeAttribute("data-wv-source");
                el.removeAttribute("data-wv-rendered");
                el.removeAttribute("data-wv-raw");
                el.removeAttribute("data-wv-related-rendered");
                el.removeAttribute("data-wv-ctx-wired");
                el.removeAttribute("data-wv-last-rebuild");
            }

            // Remove the popup panel + main-window stylesheet.
            doc.getElementById(PANEL_ID)?.remove();
            this.removeStyles();

            // Clean up the right-click Copy Link menu.
            if (this._urlMenuState) {
                try {
                    const ms = this._urlMenuState;
                    if (ms.root && ms.handlers) {
                        try { ms.root.removeEventListener("contextmenu", ms.handlers.onCtx, true); } catch(e) {}
                        try { ms.root.removeEventListener("click", ms.handlers.onAnyClick, true); } catch(e) {}
                        try { ms.root.removeEventListener("keydown", ms.handlers.onKey, true); } catch(e) {}
                        try { ms.root.removeEventListener("wheel", ms.handlers.onWheel, { capture: true, passive: true }); } catch(e) {}
                    }
                    if (ms.pointerTargets && ms.handlers && ms.handlers.onPointerDown) {
                        for (const t of ms.pointerTargets) {
                            try { t.removeEventListener("pointerdown", ms.handlers.onPointerDown, { capture: true }); } catch(e) {}
                        }
                    }
                    if (ms.firstMoveHandler) {
                        try { doc.removeEventListener("mousemove", ms.firstMoveHandler, true); } catch(e) {}
                    }
                    if (ms.win && ms.handlers && ms.handlers.onWinBlur) {
                        try { ms.win.removeEventListener("blur", ms.handlers.onWinBlur); } catch(e) {}
                    }
                    if (ms.el && ms.el.parentNode) ms.el.parentNode.removeChild(ms.el);
                } catch(e) {}
                this._urlMenuState = null;
            }
            // Make sure the suppress class doesn't outlive the menu —
            // would otherwise leave links stuck with default cursor
            // after a teardown that didn't go through hideMenu.
            try { root.classList.remove("wv-context-menu-open"); } catch(e) {}
        } catch(e) {
            Zotero.debug("[Weavero] destroy main-doc cleanup error: " + e);
        }

        // 3. Clean up open reader iframes.
        try {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (!idoc) continue;

                    // Disconnect observer + drop the iframe-doc listeners.
                    const data = this._readerObservers.get(reader);
                    if (data) {
                        try { data.observer && data.observer.disconnect(); } catch(e) {}
                        try { data.innerObserver && data.innerObserver.disconnect(); } catch(e) {}
                        if (data.sidebarMouseDown) {
                            try { idoc.removeEventListener("mousedown",
                                data.sidebarMouseDown, true); } catch(e) {}
                        }
                        if (data.sidebarFocusIn) {
                            try { idoc.removeEventListener("focusin",
                                data.sidebarFocusIn, true); } catch(e) {}
                        }
                        if (data.sidebarFocusOut) {
                            try { idoc.removeEventListener("focusout",
                                data.sidebarFocusOut, true); } catch(e) {}
                        }
                        // Proactive Delete/Backspace listeners (both
                        // window and document on each iframe frame).
                        if (data.proactiveOuterDoc) {
                            try { idoc.removeEventListener("keydown",
                                data.proactiveOuterDoc, true); } catch(e) {}
                        }
                        if (data.proactiveOuterWin && data.proactiveOuterWindow) {
                            try { data.proactiveOuterWindow.removeEventListener("keydown",
                                data.proactiveOuterWin, true); } catch(e) {}
                        }
                        if (data.selectionTrackerOuter) {
                            try { idoc.removeEventListener("mousedown",
                                data.selectionTrackerOuter, true); } catch(e) {}
                        }
                        // Inner-iframe cleanup: text-annotation buttons,
                        // marker icon badges, our stylesheet, the inner
                        // proactive keydown + selection tracker listeners,
                        // and (for DOM-view readers) the shadow-root
                        // MutationObserver and scroll/resize handlers.
                        const innerDoc = data.innerDoc;
                        const innerWindow = data.innerWindow;
                        if (innerDoc) {
                            try {
                                if (data.proactiveInnerDoc) {
                                    try { innerDoc.removeEventListener("keydown",
                                        data.proactiveInnerDoc, true); } catch(e) {}
                                }
                                if (data.proactiveInnerWin && innerWindow) {
                                    try { innerWindow.removeEventListener("keydown",
                                        data.proactiveInnerWin, true); } catch(e) {}
                                }
                                if (data.selectionTrackerInner) {
                                    try { innerDoc.removeEventListener("mousedown",
                                        data.selectionTrackerInner, true); } catch(e) {}
                                }
                                if (data.dragEndPointerUp
                                        && data.dragEndPointerUpWindow) {
                                    try { data.dragEndPointerUpWindow
                                        .removeEventListener("pointerup",
                                            data.dragEndPointerUp, true);
                                    } catch(e) {}
                                }
                                if (data.domViewObserver) {
                                    try { data.domViewObserver.disconnect(); } catch(e) {}
                                }
                                if (data.domViewResizeObserver) {
                                    try { data.domViewResizeObserver.disconnect(); } catch(e) {}
                                }
                                if (data.domViewScrollHandler && innerWindow) {
                                    try { innerWindow.removeEventListener("scroll",
                                        data.domViewScrollHandler, true); } catch(e) {}
                                    try { innerWindow.removeEventListener("resize",
                                        data.domViewScrollHandler); } catch(e) {}
                                }
                                for (const btn of innerDoc.querySelectorAll(
                                        ".wv-text-annotation-btn")) {
                                    btn.remove();
                                }
                                for (const b of innerDoc.querySelectorAll(
                                        ".wv-marker-badge")) {
                                    b.remove();
                                }
                                innerDoc.getElementById(
                                    "weavero-inner-styles")?.remove();
                            } catch(e) {}
                        }
                    }

                    // Full sidebar teardown: unwrap URL spans, remove
                    // .wv-md-preview panels and the wv-comment-preview
                    // class, drop any markdown-style spans, and remove
                    // sidebar buttons. This is what _stripReaderSidebar
                    // does — calling it directly keeps the cleanup logic
                    // in one place.
                    //
                    // Without removing .wv-md-preview here, the stale
                    // preview node survives plugin disable. On re-enable,
                    // _renderPreviewPanel's data-source cache hits on
                    // that stale node and returns early — leaving the
                    // OLD instance's render (with its URL spans already
                    // unwrapped by this very pass) in place. URL-bearing
                    // comments then look broken while markdown-only ones
                    // look fine, matching the disable/enable regression.
                    try { this._stripReaderSidebar(idoc); } catch(e) {}
                    // Strip any of our wrappers / buttons that fell
                    // outside _stripReaderSidebar's targeted selectors
                    // (e.g. .wv-btn placed on rows that weren't part of
                    // .annotation-row / .annotation, or popup spans).
                    for (const span of idoc.querySelectorAll(".wv-url-span")) {
                        span.replaceWith(idoc.createTextNode(span.textContent || ""));
                    }
                    for (const el of idoc.querySelectorAll(".wv-btn")) el.remove();
                    idoc.getElementById("weavero-reader-styles")?.remove();
                    // _ensureReaderOuterStyles also injects into idoc
                    // (preview-panel CSS for the reader sidebar). Without
                    // this cleanup, a stale element from this instance
                    // leaks across disable/enable and the next instance's
                    // remove-then-add still does the right thing — but
                    // we strip it here for symmetry and to keep the doc
                    // clean during the time the plugin is off.
                    idoc.getElementById("weavero-reader-outer-styles")?.remove();
                } catch(e) {}
            }
        } catch(e) {}

        Zotero.debug("[Weavero] destroyed");
    }
}

// === Module mixins ==========================================================
// Each module file (`modules/<name>.ts`) exports an object whose
// values are methods (and getters/setters) declared with
// `function (this: WeaveroPlugin, …)`. Mixing them in via
// `defineProperties` + `getOwnPropertyDescriptors` preserves
// getters as getters — `Object.assign` would invoke them once
// at module-load time and assign the resulting value, which is
// not what we want for stateful instance getters like URL_REGEX.

Object.defineProperties(
    WeaveroPlugin.prototype,
    Object.getOwnPropertyDescriptors(urlMethods),
);
// annotationMethods is already a PropertyDescriptorMap (built
// from a class prototype with `constructor` filtered out — see
// modules/annotation.ts), so it goes in directly.
Object.defineProperties(
    WeaveroPlugin.prototype,
    annotationMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    tabsMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    noteEditorMethods,
);
Object.defineProperties(
    WeaveroPlugin.prototype,
    readerMethods,
);

// === Lifecycle hooks (called by bootstrap.js shim) ==========================
// The shim awaits `Zotero.initializationPromise` before calling
// onStartup, so we don't re-await it here.

let _Weavero = null;

Zotero.Weavero = {
    plugin: null,
    hooks: {
        onStartup({ id, version, rootURI }) {
            _rootURI = rootURI;
            try {
                _Weavero = new WeaveroPlugin();
                Zotero.Weavero.plugin = _Weavero;
                _Weavero.init().catch(e =>
                    Zotero.debug("[Weavero] init error: " + e)
                );
            } catch (e) {
                Zotero.debug("[Weavero] startup error: " + e);
            }
        },
        onShutdown() {
            if (_Weavero) { _Weavero.destroy(); _Weavero = null; }
            Zotero.Weavero.plugin = null;
        },
        onMainWindowLoad(window) {
            if (!_Weavero) return;
            try { _Weavero.onMainWindowLoad(window); }
            catch (e) { Zotero.debug("[Weavero] onMainWindowLoad error: " + e); }
        },
        onMainWindowUnload(window) {
            if (!_Weavero) return;
            try { _Weavero.onMainWindowUnload(window); }
            catch (e) { Zotero.debug("[Weavero] onMainWindowUnload error: " + e); }
        },
    },
};
