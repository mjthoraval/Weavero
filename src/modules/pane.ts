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

class _PaneMixin {
    [k: string]: any;
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
            const COPY_SELECT_ID = "wv-itemmenu-copy-select";          // single combined Select link
            const COPY_SELECT_SEP_ID = "wv-itemmenu-copy-select-sep";  // multi: separate Select links
            const COPY_OPEN_ID = "wv-itemmenu-copy-open";              // Open link(s)
            const SEP_ID = "wv-itemmenu-separator";
            const ALL_IDS = [ADD_REL_ID, COPY_SELECT_ID, COPY_SELECT_SEP_ID, COPY_OPEN_ID, SEP_ID];
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
                    for (const id of ALL_IDS) {
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

                    // All of Weavero's items-menu entries form one
                    // block at the bottom of the native menu: a single
                    // separator above, then the Copy Select/Open Link
                    // entries, then "Add Related…" — no separators
                    // inside the block. Each entry is still gated by its
                    // own pref (URI utilities / Relations groups).

                    const wantCopy = this._getEnableCopyItemLink();
                    const wantAdd = this._getEnableAddRelatedMenu();
                    if (!wantCopy && !wantAdd) return;

                    // Separator above the whole block (skip if the
                    // native menu already ends with one).
                    {
                        const last = menu.lastElementChild as any;
                        if (!last || last.localName !== "menuseparator") {
                            const sep = doc.createXULElement("menuseparator");
                            sep.id = SEP_ID;
                            menu.appendChild(sep);
                        }
                    }

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
                    const addEntry = (id, label, action) => {
                        const cl = doc.createXULElement("menuitem");
                        cl.id = id;
                        cl.setAttribute("label", label);
                        if (menuIcon) {
                            cl.classList.add("menuitem-iconic");
                            cl.setAttribute("image", menuIcon);
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
                                Zotero.debug("[Weavero] itemmenu copy-link cmd err: " + cmdErr);
                            }
                        });
                        menu.appendChild(cl);
                    };
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

                    addEntry(COPY_SELECT_ID, "Copy Select Link" + collSuffix,
                        (fresh) => this._copyCombinedSelectLink(fresh, collScopeNow()));
                    if (multi) {
                        addEntry(COPY_SELECT_SEP_ID,
                            "Copy Select Links (Separate Links per Item)" + collSuffix,
                            (fresh) => this._copyItemLinks(fresh, "select", collScopeNow()));
                        if (openTargets.length) {
                            addEntry(COPY_OPEN_ID, "Copy Open Links (Separate Links per Item)",
                                (fresh) => this._copyItemLinks(fresh, "open"));
                        }
                    } else if (openTargets.length) {
                        addEntry(COPY_OPEN_ID, "Copy Open Link" + openExtSuffix,
                            (fresh) => this._copyItemLinks(fresh, "open"));
                    }
                    }   // /wantCopy

                    // --- Add Related… ---------------------------- (same
                    // block as the copy entries — no separator between)
                    if (wantAdd) {
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
                    }   // /wantAdd
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] itemmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = () => {
                try {
                    for (const id of ALL_IDS) {
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
                for (const id of ["wv-itemmenu-add-related", "wv-itemmenu-copy-select", "wv-itemmenu-copy-select-sep", "wv-itemmenu-copy-open", "wv-itemmenu-separator"]) {
                    const stale = menu.ownerDocument.getElementById(id);
                    if (stale) stale.remove();
                }
            } catch (e) {}
        } catch (e) {}
        this._itemMenuHandlers = null;
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
    _registerTabContextMenu() {
        try {
            if (!((Zotero as any).MenuManager
                && typeof (Zotero as any).MenuManager.registerMenu === "function")) {
                this._dbg("[Weavero] MenuManager unavailable; skip tab-menu register");
                return;
            }
            this._teardownTabContextMenu();
            const self = this;
            const makeEntry = (kind) => ({
                menuType: "menuitem",
                icon: self._menuItemIconURLLight,
                darkIcon: self._menuItemIconURLDark,
                onShowing: (_ev, ctx) => {
                    try {
                        if (!self._getEnableCopyItemLink()) { ctx.setVisible(false); return; }
                        const item = ctx.items && ctx.items[0];
                        if (!item) { ctx.setVisible(false); return; }
                        const link = kind === "open"
                            ? self._buildOpenLink(item)
                            : self._buildSelectLink(item);
                        if (!link) { ctx.setVisible(false); return; }
                        ctx.setVisible(true);
                        let label = kind === "open" ? "Copy Open Link" : "Copy Select Link";
                        if (kind === "open" && self._isExternalOpenTarget(item)) {
                            label += " (external app)";
                        }
                        ctx.menuElem.setAttribute("label", label);
                    } catch (e) {
                        Zotero.debug("[Weavero] tab-menu onShowing err: " + e);
                        try { ctx.setVisible(false); } catch (e2) {}
                    }
                },
                onCommand: (_ev, ctx) => {
                    try {
                        const item = ctx.items && ctx.items[0];
                        if (item) self._copyItemLinks([item], kind);
                    } catch (e) {
                        Zotero.debug("[Weavero] tab-menu onCommand err: " + e);
                    }
                },
            });
            const id = (Zotero as any).MenuManager.registerMenu({
                menuID: "weavero-tab-copy-links",
                pluginID: "weavero@mjthoraval",
                target: "main/tab",
                menus: [
                    makeEntry("select"),
                    makeEntry("open"),
                ],
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
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-collectionmenu");
            if (!menu) return;
            this._teardownCollectionsContextMenu();
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
                    const col = (zp && typeof zp.getSelectedCollection === "function")
                        ? zp.getSelectedCollection() : null;
                    if (col && col.key) {
                        addEntry(COPY_COLL_ID, "Copy Collection Link",
                            () => win.ZoteroPane.getSelectedCollection(),
                            buildCollectionURI);
                        return;
                    }
                    const search = (zp && typeof zp.getSelectedSavedSearch === "function")
                        ? zp.getSelectedSavedSearch() : null;
                    if (search && search.key) {
                        addEntry(COPY_SEARCH_ID, "Copy Saved Search Link",
                            () => win.ZoteroPane.getSelectedSavedSearch(),
                            buildSearchURI);
                    }
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] collectionmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = () => {
                try {
                    for (const id of ALL_IDS) {
                        const el = doc.getElementById(id);
                        if (el) el.remove();
                    }
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
                for (const id of ["wv-collectionmenu-copy-link", "wv-collectionmenu-copy-search-link"]) {
                    const stale = menu.ownerDocument.getElementById(id);
                    if (stale) stale.remove();
                }
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
            this._applySelectionTargetVisuals();
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
    _applySelectionTargetVisuals() {
        try {
            // Pref gate (Filters group → Selection Target).
            if (!this._getEnableSelectionTarget()) {
                // When toggled off, clear any wv-not-target classes so
                // previously-dimmed rows return to normal.
                try {
                    const win0 = Zotero.getMainWindow();
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
            const win = Zotero.getMainWindow();
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
            const allOn = !!(eff.parent && eff.attachment && eff.annotation);
            const state = this._filterState;
            const filterActive = !!state && this._isFilterActive(state);
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

            // Pref-gated by enableRelatedColumn (Relations group).
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
    _updateTruncationFlags() {
        const doc = Zotero.getMainWindow().document;
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
        const treeXul: any = doc.getElementById("item-tree-main")
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

        const win = box.ownerGlobal;
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

    // ---- Compact title bar (main window) -----------------------------------
    /** Hide the menubar row (#titlebar) and move the window controls into the
     *  tab strip — Firefox-style "tabs in titlebar." The menubar collapses
     *  to 0 via CSS keyed off `[autohide][inactive]`; an Alt-up keystroke
     *  toggles `inactive` so the menubar can still be summoned.
     *
     *  Per-window state is stashed on `win._wvCompactTitleBar` so revert can
     *  restore the original DOM structure cleanly. Idempotent — applying
     *  twice is a no-op. Gated by `_getCompactTitleBar()` upstream.
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

            // 5) Wire Alt-up to toggle `inactive`. Press-and-release-alone
            //    toggles the menubar; Alt+other-key (combos like Alt+F for
            //    accesskey) only shows the menubar without re-toggling.
            //    Escape / focusout collapses it back.
            //
            //    Every listener early-returns if `win.closed` is true. The
            //    first crash this code caused was an Alt+F → Close flow:
            //    the window started tearing down, then a deferred
            //    setTimeout fired with a dead reference to the menubar
            //    ("can't access dead object" → uncaught exception →
            //    crash). The popup-hide handler now runs synchronously
            //    (no setTimeout) and bails on a closed window.
            let altAlone = false;
            let menubarWasVisibleAtAltDown = false;
            const isDead = () => {
                try { return !win || win.closed; } catch (e) { return true; }
            };
            const isCollapsed = () => menubar.getAttribute("wv-compact-hidden") === "true";
            const collapse = () => {
                try {
                    if (isDead()) return;
                    menubar.setAttribute("wv-compact-hidden", "true");
                } catch (er) {}
            };
            // True when the Weavero filter popup (or any of its
            // child popups, e.g. the per-section pickers) is currently
            // showing. We use this to suppress menubar reveal/toggle
            // on Alt — users hold Alt inside the filter popup to do
            // alt-click "exclude" toggles, and an Alt-tap also hides
            // any open popup as a Mozilla side effect. The filter
            // panel installs its own Alt-swallowing keydown/keyup
            // listeners in capture, but those fire AFTER this
            // window-level capture listener (window is the outermost
            // node, so its capture handlers run first). So the panel
            // can't stop us; we have to check the popup state here.
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
                } catch (er) {}
                return false;
            };
            // Alt-DOWN — if the menubar is currently collapsed, reveal it
            // synchronously. By the time Mozilla's native Alt-UP handler
            // fires, the menubar is visible and focusable, so Mozilla can
            // activate it the usual way: focus the first menu, underline
            // accesskey letters, arm letter-key shortcuts. JS can't trigger
            // that activation directly (the menubar is a plain HTMLDivElement
            // with no MozMenuBarController — activation is in C++ widget
            // code), but it does happen automatically when Mozilla sees an
            // Alt keystroke on a visible-and-focusable menubar.
            const keyDown = (e: any) => {
                try {
                    if (isDead()) return;
                    // When the Weavero filter popup is open, Alt is part
                    // of an alt-click "exclude" gesture, not a menubar
                    // request — bail before touching menubar state so
                    // we don't reveal the menubar AND so menubarWasVisibleAtAltDown
                    // stays in the right state for the next real Alt.
                    if (isFilterPopupOpen()) {
                        altAlone = false;
                        return;
                    }
                    if (e.key === "Alt" && !e.repeat) {
                        altAlone = true;
                        const wasCollapsed = isCollapsed();
                        menubarWasVisibleAtAltDown = !wasCollapsed;
                        if (wasCollapsed) menubar.removeAttribute("wv-compact-hidden");
                    } else if (e.altKey) {
                        altAlone = false;   // Alt+other-key combo
                    }
                } catch (er) {}
            };
            // Alt-UP — handle the "Alt as a toggle" case (press Alt again to
            // dismiss). If the menubar was already visible when Alt went
            // down, this is the user toggling off → collapse. Otherwise the
            // keydown already revealed it and Mozilla activates it; we do
            // nothing here.
            const keyUp = (e: any) => {
                try {
                    if (isDead()) return;
                    if (e.key !== "Alt") return;
                    // Same suppression as keyDown — keep alt-release inside
                    // the filter popup a non-event for the menubar.
                    if (isFilterPopupOpen()) {
                        altAlone = false;
                        return;
                    }
                    if (!altAlone) return;
                    altAlone = false;
                    if (menubarWasVisibleAtAltDown) collapse();
                } catch (er) {}
            };
            // Esc behaviour matches Firefox: if a menu (File/Edit/...) is
            // currently open, Mozilla's own Esc handler closes that menu
            // and leaves the menubar active for keyboard navigation —
            // we don't collapse in that case. Only collapse when the
            // menubar is visible but no menu is open (a second Esc, or
            // Esc-while-just-activated).
            const escapeKey = (e: any) => {
                try {
                    if (isDead()) return;
                    if (e.key !== "Escape" || isCollapsed()) return;
                    const openMenu = menubar.querySelector("menu[open='true'], menupopup[state='open']");
                    if (openMenu) return;   // let Mozilla close the menu
                    collapse();
                } catch (er) {}
            };
            // Mousedown anywhere outside the menubar (and outside any open
            // menu popup) collapses the menubar — Firefox-style. Use
            // mousedown rather than click so a normal interaction (e.g.
            // tab-click) collapses the bar before the click target's own
            // handler runs.
            const docMouseDown = (e: any) => {
                try {
                    if (isDead()) return;
                    if (isCollapsed()) return;
                    const t = e.target;
                    if (!t || typeof t.closest !== "function") return;
                    if (t.closest("#toolbar-menubar")) return;
                    if (t.closest("menupopup")) return;
                    collapse();
                } catch (er) {}
            };
            // popupHidden — intentionally left empty (and the listener
            // isn't registered below). Earlier versions auto-collapsed
            // the menubar when a menu closed, but that doesn't match
            // Firefox: Firefox keeps the menubar active after Esc (the
            // user can press F/E/V/... again, or arrow to a sibling
            // menu). The auto-collapse also desynced Mozilla's
            // internal menubar-active state, causing the next Alt to
            // flicker-toggle-deactivate instead of activating fresh.
            // Now: menubar stays visible after a menu closes, and the
            // user dismisses it via Esc-with-no-open-menu, Alt-toggle,
            // or clicking outside.

            // Menu-item activation: when the user clicks an item
            // (Tools → Plugins, Edit → Copy, etc.) the menubar should
            // retract — Firefox behaviour. Mozilla fires `command` on
            // the clicked menuitem; it bubbles up to the menubar. We
            // listen there and collapse. The action runs regardless
            // (the menuitem's own oncommand handler executes first
            // because we listen on the bubble phase, not capture).
            const menuCommand = (e: any) => {
                try {
                    if (isDead() || isCollapsed()) return;
                    if (!menubar.contains(e.target)) return;
                    collapse();
                } catch (er) {}
            };
            win.addEventListener("keydown", keyDown, true);
            win.addEventListener("keyup", keyUp, true);
            win.addEventListener("keydown", escapeKey, true);
            win.addEventListener("mousedown", docMouseDown, true);
            menubar.addEventListener("command", menuCommand);
            stash.keyDown = keyDown;
            stash.keyUp = keyUp;
            stash.escapeKey = escapeKey;
            stash.docMouseDown = docMouseDown;
            stash.menuCommand = menuCommand;
            stash.menubar = menubar;

            win._wvCompactTitleBar = stash;
        } catch (e) {
            Zotero.debug("[Weavero] _applyCompactTitleBar err: " + e);
            // Auto-revert any partial mutations from this apply attempt
            // and disable the pref so the next startup doesn't retry.
            // Without this, a crash here can leave the window in a
            // half-mutated state that breaks subsequent operations.
            try { this._revertCompactTitleBar(win); } catch (er) {}
            try { Zotero.Prefs.set("weavero.compactTitleBar", false); } catch (er) {}
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

            // 4. Remove listeners we attached. Each handler is its own
            //    try because removeEventListener with undefined handler is
            //    fine, but `win` may be in an odd state.
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

    /** One-time CSS for the compact-title-bar mode. Collapses
     *  `#toolbar-menubar[autohide][inactive]` and the parent `#titlebar`
     *  to zero height; positions the moved buttonbox flush right in the
     *  tab strip. */
    _ensureCompactTitleBarStyles(doc) {
        try {
            if (doc.getElementById("wv-compact-titlebar-styles")) return;
            const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
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
                "}",
                /* Buttonbox: absolute-positioned over the right edge of the
                   tab strip. Flex layout fights us (tab-bar-container is
                   sized to its content width and won't shrink even with
                   min-width:0 in this XUL context), so step out of the flex
                   flow entirely. */
                "#zotero-title-bar { position: relative; }",
                "#zotero-title-bar > .titlebar-buttonbox {",
                "  position: absolute;",
                "  top: 0; right: 0; height: 100%;",
                "  z-index: 5;",
                "  -moz-window-dragging: no-drag;",
                "}",
                /* Reserve right-edge space inside the tab strip so tabs and
                   the zotero-tabs-toolbar don't slide under the buttonbox.
                   138px = buttonbox width (46 × 3). */
                "#zotero-title-bar:has(> .titlebar-buttonbox) {",
                "  padding-right: 138px;",
                "}",
            ].join("\n");
            (doc.documentElement || doc).appendChild(style);
        } catch (e) {
            Zotero.debug("[Weavero] _ensureCompactTitleBarStyles err: " + e);
        }
    }
}

const _paneDescriptors = Object.getOwnPropertyDescriptors(_PaneMixin.prototype);
delete (_paneDescriptors as any).constructor;
export const paneMethods = _paneDescriptors;
