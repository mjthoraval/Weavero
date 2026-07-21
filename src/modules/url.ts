// Module: URL handling — scheme registry, URL detection regex,
// link classification, launch dispatch, and the per-scheme
// `network.protocol-handler.warn-external.<x>` sync.
//
// Methods get mixed onto `WeaveroPlugin.prototype` from
// `src/index.ts` via `Object.defineProperties` +
// `Object.getOwnPropertyDescriptors` — that pattern (rather
// than `Object.assign`) preserves getters as getters instead
// of evaluating them once at module load time.

/** User-toggleable URL schemes. The two always-on schemes
 *  (`https?://`, `zotero://`) are baked into URL_REGEX directly;
 *  this list adds optional ones the user can enable in the prefs
 *  pane.
 *    sep "://" → matches `<name>://...`
 *    sep ":"   → matches `<name>:...` (mailto, tel, magnet, …)
 *  Ordering: alphabetical within tier (bare-colon `name:` first,
 *  then slash `name://`). Keep in sync with the SCHEMES list in
 *  prefs.js and the grid in prefs.html. */
import { schemeAltPart, joinSchemeAlt, buildUrlRegex, urlLinkClass } from "../lib/links";

export const URL_SCHEMES = [
    // ---- Tier 1: bare-colon schemes (name:) -------------------------------
    { name: "magnet",   pref: "enableMagnetScheme",   sep: ":",
      label: "magnet:",     desc: "Torrent magnet links" },
    { name: "mailto",   pref: "enableMailtoScheme",   sep: ":",
      label: "mailto:",     desc: "Email addresses" },
    { name: "skype",    pref: "enableSkypeScheme",    sep: ":",
      label: "skype:",      desc: "Skype calls / chats" },
    { name: "sms",      pref: "enableSmsScheme",      sep: ":",
      label: "sms:",        desc: "SMS messages" },
    { name: "spotify",  pref: "enableSpotifyScheme",  sep: ":",
      label: "spotify:",    desc: "Spotify tracks / playlists" },
    { name: "tel",      pref: "enableTelScheme",      sep: ":",
      label: "tel:",        desc: "Phone numbers" },
    // ---- Tier 2: slash schemes (name://) ----------------------------------
    { name: "discord",  pref: "enableDiscordScheme",  sep: "://",
      label: "discord://",  desc: "Discord servers" },
    { name: "evernote", pref: "enableEvernoteScheme", sep: "://",
      label: "evernote://", desc: "Evernote notes" },
    { name: "figma",    pref: "enableFigmaScheme",    sep: "://",
      label: "figma://",    desc: "Figma files" },
    { name: "file",     pref: "enableFileScheme",     sep: "://",
      label: "file://",     desc: "Local files" },
    { name: "ftp",      pref: "enableFtpScheme",      sep: "://",
      label: "ftp://",      desc: "FTP servers" },
    { name: "msteams",  pref: "enableMsteamsScheme",  sep: "://",
      label: "msteams://",  desc: "Microsoft Teams" },
    { name: "notion",   pref: "enableNotionScheme",   sep: "://",
      label: "notion://",   desc: "Notion pages" },
    { name: "obsidian", pref: "enableObsidianScheme", sep: "://",
      label: "obsidian://", desc: "Obsidian notes" },
    { name: "slack",    pref: "enableSlackScheme",    sep: "://",
      label: "slack://",    desc: "Slack channels" },
    { name: "vscode",   pref: "enableVscodeScheme",   sep: "://",
      label: "vscode://",   desc: "VS Code workspaces / files" },
    { name: "zoommtg",  pref: "enableZoomScheme",     sep: "://",
      label: "zoommtg://",  desc: "Zoom meetings" },
];

// Better BibTeX export-translator IDs (stable, registered by the BBT plugin).
// Verified present in the live 10.0-beta runtime via
// `Zotero.Translators.getAllForType("export")`. Used by the "Copy As → BibTeX /
// BibLaTeX" submenu entries, which are only shown when BBT is active.
export const BBT_BIBTEX_TRANSLATOR_ID = "ca65189f-8815-4afe-8c8b-8c7c15f0edca";
export const BBT_BIBLATEX_TRANSLATOR_ID = "f895aa0d-f28e-47fe-b247-2ea77c6ed583";

export const urlMethods = {
    /** Source string for the alternation between the always-on schemes
     *  (`https?://`, `zotero://`) and any user-enabled extra schemes
     *  from `URL_SCHEMES`. Cached on the instance and invalidated by
     *  the pref observer when an `enable*Scheme` toggle changes.
     *  Returned WITHOUT outer parentheses or body suffix so callers
     *  that build their own combined regex (e.g. the markdown TOKEN
     *  regex) can drop it in directly. */
    get URL_SCHEME_ALT() {
        if (this._urlSchemeAltCache) return this._urlSchemeAltCache;
        const parts: string[] = [];
        // URLs toggle (v0.8.2) — when off, http/https are excluded from
        // the regex so plain web URLs render as text. The shared
        // Display Mode "URLs" checkbox dual-writes to enableInlineUrls
        // AND enableIconUrls; reading either is fine since they're
        // always synced. Default ON.
        let httpUrlsOn = true;
        try {
            const v = Zotero.Prefs.get("weavero.enableInlineUrls");
            httpUrlsOn = v === undefined ? true : !!v;
        } catch (e) {}
        if (httpUrlsOn) {
            parts.push("https?:\\/\\/");
            // Schemeless `www.` web links (gated by the same URLs toggle).
            // `\b` avoids matching mid-word (e.g. "awww."); launch prepends
            // https:// (see _launchURL) and urlLinkClass buckets it as http.
            parts.push("\\bwww\\.");
        }
        // Zotero links toggle (v0.8.1) — when off, zotero:// is
        // excluded from the URL regex so deep links render as plain
        // text. Default ON. Mirrors the App Links pattern below.
        let zoteroLinksOn = true;
        try {
            const v = Zotero.Prefs.get("weavero.enableZoteroLinks");
            zoteroLinksOn = v === undefined ? true : !!v;
        } catch (e) {}
        if (zoteroLinksOn) parts.push("zotero:\\/\\/");
        // Master "App links" toggle gates ALL URL_SCHEMES — when off,
        // even ticked individual schemes don't render. This lets the
        // user opt out of every non-web scheme with one click.
        let appLinksOn = false;
        try { appLinksOn = !!Zotero.Prefs.get("weavero.enableAppLinks"); }
        catch (e) {}
        if (appLinksOn) {
            for (const def of URL_SCHEMES) {
                try {
                    if (Zotero.Prefs.get("weavero." + def.pref)) {
                        // Assembly rules live in src/lib/links.ts.
                        parts.push(schemeAltPart(def.name, def.sep));
                    }
                } catch (e) {}
            }
        }
        // Empty-parts sentinel and join rules live in src/lib/links.ts.
        this._urlSchemeAltCache = joinSchemeAlt(parts);
        return this._urlSchemeAltCache;
    },

    /** Single-match regex for a URL in plain text. The body class
     *  `[^\s<>"')\]]+` stops at whitespace and the punctuation that's
     *  most commonly trailing punctuation. Cached and invalidated
     *  with `URL_SCHEME_ALT`. */
    get URL_REGEX() {
        if (this._urlRegexCache) return this._urlRegexCache;
        this._urlRegexCache = buildUrlRegex(this.URL_SCHEME_ALT);
        return this._urlRegexCache;
    },

    /** Classify a URL into one of three CSS class buckets so each kind
     *  is colour-coded distinctly across all surfaces:
     *    `wv-link-http`   — http(s)://… (default web links, blue)
     *    `wv-link-zotero` — zotero://…  (Zotero deep links, orange)
     *    `wv-link-app`    — anything else (mailto:, obsidian://,
     *                       slack://, …) — the user-enabled
     *                       App-link schemes, purple. */
    _urlLinkClass(url) {
        return urlLinkClass(url);   // thin adapter — src/lib/links.ts
    },

    // ---- zotero:// item-link builders -------------------------------------
    // Shared by every "Copy … Link" affordance (items-list right-click
    // menu, related-item / right-pane menus, reader annotation menu,
    // reader-tab menu). Two link kinds:
    //   • SELECT — `zotero://select/<lib>/items/<key>` — works for any
    //     item type (regular, attachment, note, annotation); just
    //     selects the item in the library.
    //   • OPEN   — `zotero://open/<lib>/items/<key>[?annotation=…]`
    //     — for a *stored file* attachment (any type), the annotation's
    //     parent attachment, or a regular item's best attachment.
    //     Clicking it does exactly what Zotero's own `zotero://open`
    //     handler does (`Zotero.FileHandlers.open`): PDF / EPUB / HTML-
    //     snapshot files open in Zotero's reader (or the user's
    //     configured external reader), every other file type opens with
    //     the OS default app — same as double-clicking the attachment.
    //     Returns null for notes, linked-URL attachments (no file), and
    //     items with no attachment. A `zotero://note/…` link is
    //     Better-Notes-specific; see TODO. Zotero registers both
    //     `zotero://open` and `zotero://open-pdf` for this; we emit the
    //     shorter modern `zotero://open` form.

    /** "library" for the user library, "groups/<gid>" for a group. */
    _zoteroLibPrefix(libraryID) {
        try {
            if (libraryID !== Zotero.Libraries.userLibraryID) {
                const gid = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
                if (gid) return "groups/" + gid;
            }
        } catch (e) {}
        return "library";
    },

    /** The collection currently selected in the library pane's left
     *  tree, as a `zotero://select` scope segment, or null when the
     *  selected row isn't a real collection (library root, a saved
     *  search, My Publications, Trash, …) or no main window is open.
     *  Used so "Copy Select Link" from inside a collection produces
     *  `zotero://select/<lib>/collections/<collKey>/items/<itemKey>` —
     *  Zotero navigates to that collection (expanding its ancestors)
     *  before selecting the item. Only the leaf collection key fits in
     *  the URL; the full path is reconstructed on click. */
    _currentCollectionScope(win?) {
        try {
            const zp = (win || Zotero.getMainWindow())?.ZoteroPane;
            if (!zp || typeof zp.getSelectedCollection !== "function") return null;
            const col = zp.getSelectedCollection();
            if (!col || !col.key) return null;
            return {
                scope: this._zoteroLibPrefix(col.libraryID) + "/collections/" + col.key,
                libraryID: col.libraryID,
            };
        } catch (e) { return null; }
    },

    /** `zotero://select/…/items/<key>` for any item, or null.
     *  When `collScope` (from `_currentCollectionScope`) is given and
     *  the item lives in that same library, the link is scoped to that
     *  collection so clicking it navigates there first. */
    _buildSelectLink(item, collScope?) {
        if (!item || !item.key) return null;
        if (collScope && collScope.scope && collScope.libraryID === item.libraryID) {
            return "zotero://select/" + collScope.scope + "/items/" + item.key;
        }
        return "zotero://select/" + this._zoteroLibPrefix(item.libraryID)
            + "/items/" + item.key;
    },

    /** ONE `zotero://select` link that selects every item in `items`:
     *    1 item   → the plain path form (`…/items/<key>`)
     *    2+ items → the multi-key query form (`…/items?itemKey=K1,K2,…`)
     *  — which Zotero's own select handler accepts (it splits `itemKey`
     *  on commas). `collScope` (from `_currentCollectionScope`) scopes
     *  the link to that collection when all items live there. Returns
     *  null if `items` is empty or spans multiple libraries (no single
     *  link can express that — the caller should fall back to one link
     *  per item). */
    _buildCombinedSelectLink(items, collScope?) {
        const arr = (Array.isArray(items) ? items : [items]).filter((i) => i && i.key);
        if (!arr.length) return null;
        if (arr.length === 1) return this._buildSelectLink(arr[0], collScope);
        const lib = arr[0].libraryID;
        if (!arr.every((i) => i.libraryID === lib)) return null;
        const useScope = collScope && collScope.scope && collScope.libraryID === lib;
        const base = useScope ? collScope.scope : this._zoteroLibPrefix(lib);
        return "zotero://select/" + base + "/items?itemKey=" + arr.map((i) => i.key).join(",");
    },

    /** Copy the single combined Select link for `items` to the
     *  clipboard. Falls back to newline-joined per-item links if a
     *  single link can't express the selection (items span libraries).
     *  Returns the number of links copied (1 for the combined form). */
    _copyCombinedSelectLink(items, opts?) {
        const arr = (Array.isArray(items) ? items : [items]).filter((i) => i && i.key);
        if (!arr.length) return 0;
        const collScope = opts && opts.collScope;
        const combined = this._buildCombinedSelectLink(arr, collScope);
        const text = combined
            || arr.map((i) => this._buildSelectLink(i, collScope)).filter(Boolean).join("\n");
        if (!text) return 0;
        try {
            Zotero.Utilities.Internal.copyTextToClipboard(text);
        } catch (e) {
            Zotero.debug("[Weavero] _copyCombinedSelectLink err: " + e);
            return 0;
        }
        return combined ? 1 : arr.length;
    },

    /** True when `att` is a stored (not linked-URL) file attachment —
     *  i.e. it has an on-disk file `zotero://open` can hand to the
     *  reader or the OS default app. Excludes linked-URL "attachments"
     *  (web links, which have no file) and notes. */
    _isOpenableFileAttachment(att) {
        try {
            if (!att || !att.isAttachment || !att.isAttachment()) return false;
            if (att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
                return false;
            }
            return !!(att.isFileAttachment && att.isFileAttachment());
        } catch (e) { return false; }
    },

    /** For a regular item, pick the attachment an "Open" link should
     *  target — preferring PDF, then EPUB, then HTML snapshot, then any
     *  other stored file attachment (which `zotero://open` opens with
     *  the OS default app). Linked-URL attachments are skipped (no
     *  file). Returns the attachment Zotero.Item or null. Sync — relies
     *  on the item's attachments already being loaded (true for items
     *  shown in any UI surface). Mirrors the spirit of
     *  `getBestAttachment()` without the async DB round-trip. */
    _openableAttachmentFor(item) {
        try {
            if (!item || !item.isRegularItem || !item.isRegularItem()) return null;
            const ids = (item.getAttachments && item.getAttachments()) || [];
            const rank = (t) => (t === "pdf" ? 0 : t === "epub" ? 1 : t === "snapshot" ? 2 : 3);
            let best = null, bestRank = 99;
            for (const id of ids) {
                const att = Zotero.Items.get(id);
                if (!this._isOpenableFileAttachment(att)) continue;
                const r = rank(att.attachmentReaderType);
                if (r < bestRank) { best = att; bestRank = r; }
            }
            return best;
        } catch (e) { return null; }
    },

    /** `zotero://open/…` link for an item, or null when no openable
     *  file applies:
     *    stored file attachment → …/items/<key>
     *    annotation             → …/items/<parentAttachmentKey>?annotation=<key>
     *    regular item           → …/items/<bestAttachmentKey>  (see above)
     *    note / linked-URL / no-attachment / other → null */
    _buildOpenLink(item) {
        if (!item) return null;
        try {
            if (item.isAnnotation && item.isAnnotation()) {
                const parent = item.parentItem
                    || (item.parentItemID && Zotero.Items.get(item.parentItemID));
                if (!this._isOpenableFileAttachment(parent)) return null;
                return "zotero://open/" + this._zoteroLibPrefix(parent.libraryID)
                    + "/items/" + parent.key + "?annotation=" + item.key;
            }
            if (item.isAttachment && item.isAttachment()) {
                if (!this._isOpenableFileAttachment(item)) return null;
                return "zotero://open/" + this._zoteroLibPrefix(item.libraryID)
                    + "/items/" + item.key;
            }
            if (item.isRegularItem && item.isRegularItem()) {
                const att = this._openableAttachmentFor(item);
                if (!att) return null;
                return "zotero://open/" + this._zoteroLibPrefix(att.libraryID)
                    + "/items/" + att.key;
            }
        } catch (e) {}
        return null;
    },

    /** True when at least one of `items` has an open link. */
    _anyHasOpenLink(items) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        return arr.some((it) => !!this._buildOpenLink(it));
    },

    /** Whether `item`'s open link (if any) opens in an *external* app
     *  rather than Zotero's reader — i.e. the file it points at is not
     *  a PDF / EPUB / HTML snapshot. Used to suffix the "Copy Open
     *  Link" menu label with "(external app)" so the user knows the
     *  link won't open inside Zotero. Returns false when there's no
     *  open link at all (the menu entry is hidden in that case). */
    _isExternalOpenTarget(item) {
        try {
            if (!item) return false;
            let att = null;
            if (item.isAnnotation && item.isAnnotation()) {
                att = item.parentItem
                    || (item.parentItemID && Zotero.Items.get(item.parentItemID));
            } else if (item.isAttachment && item.isAttachment()) {
                att = item;
            } else if (item.isRegularItem && item.isRegularItem()) {
                att = this._openableAttachmentFor(item);
            }
            if (!this._isOpenableFileAttachment(att)) return false;
            const t = att.attachmentReaderType;
            return !(t === "pdf" || t === "epub" || t === "snapshot");
        } catch (e) { return false; }
    },

    /** Copy `items`' links to the clipboard, one per line.
     *  kind="select" → one line per item; `opts.collScope` (from
     *    `_currentCollectionScope`) scopes the links to that collection.
     *  kind="open"   → only items that have an open link contribute.
     *  Returns the number of links copied (0 = nothing copied). */
    _copyItemLinks(items, kind, opts?) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        const collScope = opts && opts.collScope;
        const links: string[] = [];
        for (const it of arr) {
            const link = kind === "open"
                ? this._buildOpenLink(it)
                : this._buildSelectLink(it, collScope);
            if (link) links.push(link);
        }
        if (!links.length) return 0;
        try {
            Zotero.Utilities.Internal.copyTextToClipboard(links.join("\n"));
        } catch (e) {
            Zotero.debug("[Weavero] _copyItemLinks err: " + e);
            return 0;
        }
        return links.length;
    },

    // ---- "Copy As" submenu: citation / bibliography / export / web link ----

    /** Resolve the cite style + locale for Copy Citation / Copy Bibliography.
     *  Reuses the user's QuickCopy default (`export.quickCopy.setting`, e.g.
     *  `bibliography=http://www.zotero.org/styles/<id>`) so it matches what
     *  drag-copy / Ctrl+Shift+C produce. Falls back to the first visible style
     *  when the QuickCopy default is an `export=` translator (no cite style). */
    _wvCiteStyleAndLocale() {
        let style: string | null = null;
        let locale: string | null = null;
        try {
            const setting = Zotero.Prefs.get("export.quickCopy.setting");
            const obj: any = setting && Zotero.QuickCopy.unserializeSetting(setting);
            if (obj && obj.mode === "bibliography" && obj.id) style = obj.id;
            if (obj && obj.locale) locale = obj.locale;
        } catch (e) {}
        if (!locale) { try { locale = Zotero.Prefs.get("export.quickCopy.locale") as any; } catch (e) {} }
        if (!style) {
            try {
                const vis = Zotero.Styles.getVisible();
                if (vis && vis.length) style = vis[0].styleID;
            } catch (e) {}
        }
        return { style, locale };
    },

    /** Copy a citation (asCitations=true) or bibliography (false) for `items`
     *  to the clipboard, using the user's QuickCopy cite style. Copies plain
     *  text + HTML flavors (asHTML=false → both), so it pastes correctly into
     *  both plain and rich targets. Returns true on success. */
    _copyCitationOrBibliography(items, asCitations) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        if (!arr.length) return false;
        try {
            const win: any = Zotero.getMainWindow();
            const FI = win && win.Zotero_File_Interface;
            if (!FI || typeof FI.copyItemsToClipboard !== "function") return false;
            const { style, locale } = this._wvCiteStyleAndLocale();
            if (!style) return false;
            FI.copyItemsToClipboard(arr, style, locale || undefined, false, !!asCitations);
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _copyCitationOrBibliography err: " + e);
            return false;
        }
    },

    /** Copy `items` in an export format (e.g. a Better BibTeX translator) to the
     *  clipboard via Zotero's own export-to-clipboard path. Async (translation),
     *  but fire-and-forget — the API writes to the clipboard when done. */
    _copyExportToClipboard(items, translatorID) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        if (!arr.length || !translatorID) return false;
        try {
            const win: any = Zotero.getMainWindow();
            const FI = win && win.Zotero_File_Interface;
            if (!FI || typeof FI.exportItemsToClipboard !== "function") return false;
            FI.exportItemsToClipboard(arr, { mode: "export", id: translatorID });
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _copyExportToClipboard err: " + e);
            return false;
        }
    },

    /** True when Better BibTeX is installed and active (so the BibTeX/BibLaTeX
     *  "Copy As" entries should appear). */
    _isBetterBibTeXActive() {
        try {
            const bbt: any = (Zotero as any).BetterBibTeX;
            return !!(bbt && typeof bbt === "object" && !bbt.uninstalled);
        } catch (e) { return false; }
    },

    /** Populate a <menupopup> `sub` with the "Copy As" entries (Citation /
     *  Bibliography / Citation Key / Select Link / Open Link / Online Library
     *  Link / BBT) for the single item returned by `getItem()` — the same set the
     *  items-list "Copy As" submenu builds, reused for the reader-/note-window tab
     *  menus so every window's tab menu matches. Citation-style entries operate on
     *  the item's top-level parent (citing an attachment cites its parent). */
    _wvBuildCopyAsSubmenu(doc: any, sub: any, getItem: () => any) {
        const self: any = this;
        // The "cite-able" item: the regular parent for an attachment, else self.
        const citeItem = () => {
            try {
                const it: any = getItem();
                if (!it) return null;
                if (it.isAttachment && it.isAttachment() && it.parentID) return Zotero.Items.get(it.parentID);
                return it;
            } catch (e) { return null; }
        };
        const add = (label: string, action: (arr: any[]) => void, itemFn?: () => any) => {
            const mi = doc.createXULElement("menuitem");
            mi.setAttribute("label", label);
            mi.addEventListener("command", (e: any) => {
                try { e.stopPropagation(); } catch (er) {}
                try { const it = (itemFn || getItem)(); if (it) action([it]); } catch (er) { Zotero.debug("[Weavero] reader copy-as cmd err: " + er); }
            });
            sub.appendChild(mi);
            return mi;
        };
        const sep = () => sub.appendChild(doc.createXULElement("menuseparator"));
        try {
            add("Citation", (a) => self._copyCitationOrBibliography(a, true), citeItem);
            add("Bibliography", (a) => self._copyCitationOrBibliography(a, false), citeItem);
            const ci = citeItem();
            if (ci && self._anyHasCitationKey && self._anyHasCitationKey([ci])) {
                add("Citation Key", (a) => self._copyCitationKeys(a), citeItem);
            }
            sep();
            add("Select Link", (a) => self._copyCombinedSelectLink(a, {}));
            const it0: any = getItem();
            if (it0 && self._buildOpenLink && self._buildOpenLink(it0)) {
                add("Open Link", (a) => self._copyItemLinks(a, "open"));
            }
            if (ci && self._anyHasWebURL && self._anyHasWebURL([ci])) {
                add("Online Library Link", (a) => self._copyOnlineLibraryLinks(a), citeItem);
            }
            if (self._isBetterBibTeXActive && self._isBetterBibTeXActive()) {
                sep();
                add("[BBT] BibTeX", (a) => self._copyExportToClipboard(a, BBT_BIBTEX_TRANSLATOR_ID), citeItem);
                add("[BBT] BibLaTeX", (a) => self._copyExportToClipboard(a, BBT_BIBLATEX_TRANSLATOR_ID), citeItem);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvBuildCopyAsSubmenu err: " + e); }
    },

    /** Online (web) library URL for an item — the page on zotero.org:
     *    user library  → https://www.zotero.org/<username>/items/<key>
     *    group library → https://www.zotero.org/groups/<groupID>/items/<key>
     *  Annotations resolve to their parent attachment (annotations have no web
     *  page of their own). Null when not logged in (user libraries) or the
     *  group id can't be resolved. Mirrors zotero/zotero#2917's `getItemWebURL`,
     *  which isn't in the released client yet. */
    _buildItemWebURL(item) {
        try {
            if (!item || !item.key) return null;
            let target = item;
            if (item.isAnnotation && item.isAnnotation()) {
                target = item.parentItem
                    || (item.parentItemID && Zotero.Items.get(item.parentItemID)) || null;
            }
            if (!target || !target.key) return null;
            const base = "https://www.zotero.org/";
            const libraryID = target.libraryID;
            if (libraryID !== Zotero.Libraries.userLibraryID) {
                const gid = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
                if (!gid) return null;
                return base + "groups/" + gid + "/items/" + target.key;
            }
            const username = (Zotero.Users.getCurrentUsername
                && Zotero.Users.getCurrentUsername()) || null;
            if (!username) return null;
            return base + encodeURIComponent(username) + "/items/" + target.key;
        } catch (e) { return null; }
    },

    /** True when at least one of `items` yields a web-library URL. */
    _anyHasWebURL(items) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        return arr.some((it) => !!this._buildItemWebURL(it));
    },

    /** Copy the web-library URL(s) for `items`, one per line. */
    _copyOnlineLibraryLinks(items) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        const urls = arr.map((it) => this._buildItemWebURL(it)).filter(Boolean);
        if (!urls.length) return 0;
        try { Zotero.Utilities.Internal.copyTextToClipboard(urls.join("\n")); }
        catch (e) { Zotero.debug("[Weavero] _copyOnlineLibraryLinks err: " + e); return 0; }
        return urls.length;
    },

    /** Read an item's citation key — the NATIVE Zotero `citationKey` field
     *  (item field 9). Better BibTeX populates/manages this same field when
     *  active, so this one accessor returns the right key either way. "" when
     *  the item has no key. */
    _itemCitationKey(item) {
        try {
            const k = item && item.getField && item.getField("citationKey");
            return k ? String(k).trim() : "";
        } catch (e) { return ""; }
    },

    /** True when at least one of `items` has a non-empty citation key (so the
     *  "Citation Key" menu entry is only shown when there's something to copy —
     *  common to be empty without BBT, since Zotero doesn't auto-generate one). */
    _anyHasCitationKey(items) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        return arr.some((it) => !!this._itemCitationKey(it));
    },

    /** Copy the citation key(s) for `items`, one per line, skipping items with
     *  no key. Returns the number copied. */
    _copyCitationKeys(items) {
        const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
        const keys = arr.map((it) => this._itemCitationKey(it)).filter(Boolean);
        if (!keys.length) return 0;
        try { Zotero.Utilities.Internal.copyTextToClipboard(keys.join("\n")); }
        catch (e) { Zotero.debug("[Weavero] _copyCitationKeys err: " + e); return 0; }
        return keys.length;
    },

    /** Launch a URL the way Zotero would — with a fast no-prompt path
     *  for app-link schemes (mailto:, obsidian://, slack://, …) gated
     *  on the user's `enableAppLinksSkipConfirm` preference.
     *
     *  When skip-confirm is OFF (default): fall through to
     *  `Zotero.launchURL`, which goes through `svc.loadURI` → OS
     *  dispatch → Firefox's "Open with…" prompt. The user gets the
     *  safety dialog they expect.
     *
     *  When skip-confirm is ON: call `handlerInfo.launchWithURI`
     *  directly on the user-stored handler info. This bypasses the
     *  prompt entirely. We use the user-stored variant
     *  (`getProtocolHandlerInfo`, not `…FromOS`) so the
     *  `alwaysAskBeforeHandling` / `preferredAction` overrides set
     *  by `_applyAppLinkConfirmPref` are honored. */
    _launchURL(url) {
        if (!url) return;
        // Schemeless `www.` links (uniform autolink -- URL_REGEX matches them
        // as web links): give them an https scheme before dispatch.
        if (/^www\./i.test(url)) url = "https://" + url;
        try {
            // zotero:// URLs must NOT go through the OS dispatch
            // (which would trigger Firefox's "Allow this site to open
            // the zotero link with Zotero?" prompt). Route them
            // through our internal handler that knows how to dispatch
            // zotero://select / zotero://open / zotero://note paths
            // directly into ZoteroPane / Reader / openNote.
            if (url.startsWith("zotero://")) {
                this.handleZoteroURI(url);
                return;
            }
            const cls = this._urlLinkClass(url);
            if (cls === "wv-link-app") {
                let skip = false;
                try { skip = !!Zotero.Prefs.get(
                    "weavero.enableAppLinksSkipConfirm"); }
                catch (e) {}
                if (skip) {
                    const m = /^([a-z][a-z0-9+.-]+):/i.exec(url);
                    const scheme = m && m[1].toLowerCase();
                    if (scheme) {
                        const svc = Components.classes[
                            "@mozilla.org/uriloader/external-protocol-service;1"]
                            .getService(Components.interfaces.nsIExternalProtocolService);
                        const handlerInfo = svc.getProtocolHandlerInfo(scheme);
                        if (handlerInfo) {
                            const uri = Services.io.newURI(url, null, null);
                            handlerInfo.launchWithURI(uri, null);
                            return;
                        }
                    }
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _launchURL direct err: " + e);
            // fall through
        }
        try { Zotero.launchURL(url); }
        catch (e) { Zotero.debug("[Weavero] _launchURL fallback err: " + e); }
    },

    /** Sync the per-scheme `network.protocol-handler.warn-external.<x>`
     *  Firefox prefs to match the user's "Open without confirmation"
     *  choice. When the master is on AND a scheme is enabled, set the
     *  per-scheme warn-external pref to FALSE — clicks open the app
     *  directly with no prompt. Otherwise CLEAR our override so the
     *  default behaviour (prompt) returns.
     *
     *  Called at init() and from the pref observer whenever any of:
     *    - weavero.enableAppLinks
     *    - weavero.enableAppLinksSkipConfirm
     *    - weavero.enable*Scheme
     *  changes. Idempotent — re-applying yields the same prefs.
     *
     *  We use `clearUserPref` to revert (instead of writing `true`)
     *  so the user's profile stays clean and the system default
     *  (`network.protocol-handler.warn-external-default = true`)
     *  takes effect for any scheme we don't manage. */
    _applyAppLinkConfirmPref() {
        try {
            const masterAppLinks = !!Zotero.Prefs.get("weavero.enableAppLinks");
            const skip = !!Zotero.Prefs.get("weavero.enableAppLinksSkipConfirm");

            // Modern Firefox shows TWO different dialogs depending on
            // the scheme + how it's registered:
            //   1. A simple "warn external" prompt — controlled by
            //      `network.protocol-handler.warn-external.<scheme>`.
            //   2. An app-picker prompt with a "Choose a different
            //      application" link — controlled by the handler
            //      service's `alwaysAskBeforeHandling` flag.
            // Skipping needs BOTH to be set. We touch the pref AND the
            // handler info per scheme; either one alone leaves the
            // user with a prompt for many real-world schemes.
            let externalSvc = null, handlerSvc = null;
            try {
                externalSvc = Components.classes[
                    "@mozilla.org/uriloader/external-protocol-service;1"]
                    .getService(Components.interfaces.nsIExternalProtocolService);
                handlerSvc = Components.classes[
                    "@mozilla.org/uriloader/handler-service;1"]
                    .getService(Components.interfaces.nsIHandlerService);
            } catch (e) {
                Zotero.debug("[Weavero] handler-svc unavailable: " + e);
            }

            for (const def of URL_SCHEMES) {
                const prefName = "network.protocol-handler.warn-external." + def.name;
                let enabledThis = false;
                try { enabledThis = !!Zotero.Prefs.get("weavero." + def.pref); }
                catch (e) {}
                const shouldSkip = masterAppLinks && skip && enabledThis;

                // ---- (1) warn-external pref --------------------------------
                try {
                    if (shouldSkip) {
                        Services.prefs.setBoolPref(prefName, false);
                    } else if (Services.prefs.prefHasUserValue(prefName)) {
                        // Only clear if the override is our own FALSE —
                        // never clobber an explicit TRUE the user may
                        // have set themselves.
                        const cur = Services.prefs.getBoolPref(prefName, true);
                        if (cur === false) Services.prefs.clearUserPref(prefName);
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] warn-external sync ("
                        + def.name + ") err: " + e);
                }

                // ---- (2) handler service -----------------------------------
                if (!externalSvc || !handlerSvc) continue;
                try {
                    const handlerInfo = externalSvc.getProtocolHandlerInfo(def.name);
                    if (!handlerInfo) continue;
                    if (shouldSkip) {
                        handlerInfo.alwaysAskBeforeHandling = false;
                        handlerInfo.preferredAction =
                            Components.interfaces.nsIHandlerInfo.useSystemDefault;
                    } else {
                        // Restore the safe default: ask before
                        // handling. We don't try to remember whatever
                        // value was there before — the safe behaviour
                        // is to ask, which matches Firefox's default
                        // for any scheme the user hasn't customised.
                        handlerInfo.alwaysAskBeforeHandling = true;
                    }
                    handlerSvc.store(handlerInfo);
                } catch (e) {
                    Zotero.debug("[Weavero] handler-svc sync ("
                        + def.name + ") err: " + e);
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _applyAppLinkConfirmPref err: " + e);
        }
    },
};
