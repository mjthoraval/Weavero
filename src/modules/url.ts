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
// Wire version for the ZoteroPane.loadURI hook. BUMP on any change to the
// wrapped closure -- a reload must unhook the stale copy and re-hook.
export const WV_LOADURI_WIRE_V = 1;

// Wire version for the Zotero.CommandLineIngester.ingest wrap (stolen-focus
// fix). Same bump discipline as WV_LOADURI_WIRE_V.
export const WV_CMDLINE_WIRE_V = 1;

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
            if (!zp) return null;
            const col = this._wvSelectedCollection(win);
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
            // The user's chosen default wins over the ranking below, exactly
            // as it does for double-click. This one is the worst place to get
            // wrong: the chosen key is BAKED INTO the link, so a "Copy Open
            // Link" built from the heuristic keeps opening the other file
            // forever -- for the user and for anyone they send it to (found
            // 2026-08-04). Only a stored FILE attachment can be a link target
            // (`zotero://open` requires one), so a chosen note or linked URL
            // correctly falls through to the ranking.
            try {
                const chosen = this._wvGetDefaultChild && this._wvGetDefaultChild(item);
                if (chosen && !chosen.deleted && this._isOpenableFileAttachment(chosen)) {
                    return chosen;
                }
            } catch (e) {}
            const ids = (item.getAttachments && item.getAttachments()) || [];
            const rank = (t) => (t === "pdf" ? 0 : t === "epub" ? 1 : t === "snapshot" ? 2 : 3);
            let best = null, bestRank = 99;
            for (const id of ids) {
                // `Zotero.Items.get` returns FALSE for a missing id (typed since
                // zotero-types 4.1.3) -- guard before touching the item.
                const att = Zotero.Items.get(id);
                if (!att || !this._isOpenableFileAttachment(att)) continue;
                const r = rank(att.attachmentReaderType);
                if (r < bestRank) { best = att; bestRank = r; }
            }
            return best;
        } catch (e) { return null; }
    },

    /* ---- PDF selection links -------------------------------------------
     *
     *  A PDF position (`{pageIndex, rects}`) has no representation in
     *  `zotero://open`: `OpenExtension` maps only annotation / page / cfi /
     *  sel, and the latter two are EPUB / snapshot selectors. Yet the reader
     *  itself handles positions fully -- `pdf-view.js` navigate() scrolls to
     *  `location.position` and calls `_highlightPosition()` on it. So only the
     *  URL vocabulary is missing, and `wvpos` supplies it.
     *
     *  Design constraints this satisfies:
     *    • SELF-CONTAINED -- the position travels inside the link, so it does
     *      not break when a bookmark/outline entry that produced it is deleted,
     *      renamed, or never existed on the reader's machine.
     *    • DEGRADES -- `page` is always emitted alongside, and Zotero ignores
     *      unknown query params, so a plain install still opens the right page.
     *      (Weavero's own link handler in index.ts reads `wvpos`.)
     *    • Carries the selected TEXT as a fallback for a future resolver: rects
     *      are exact but tied to this exact file, text survives re-pagination.
     */

    /** Encode `{position, text}` into a `wvpos` payload: compact JSON, base64,
     *  URL-safe. Coordinates are rounded to 2dp -- sub-point precision is
     *  meaningless for a highlight and costs link length. */
    _wvEncodeSelectionPos(sel: any): string | null {
        try {
            const p = sel && sel.position;
            if (!p || !Array.isArray(p.rects) || !p.rects.length) return null;
            const r2 = (n: any) => Math.round(Number(n) * 100) / 100;
            const payload: any = {
                p: p.pageIndex || 0,
                r: p.rects.map((r: any) => [r2(r[0]), r2(r[1]), r2(r[2]), r2(r[3])]),
            };
            // Format version. Bump on any breaking change to the payload;
            // the decoder stays tolerant of every version it has ever read.
            payload.v = 1;
            // TEXT FALLBACK, role-based (designed with the user 2026-08-02;
            // W3C TextQuoteSelector semantics for the context fields):
            //   short  (< 60)   -> full `t` + 16-char `tp`/`ts` context, which
            //                      disambiguates WHICH occurrence of a common
            //                      phrase was meant ("Figure 3" x20).
            //   medium (60-400) -> full `t` alone; a quote this long is unique
            //                      in a document and its end is start+length.
            //   long   (> 400)  -> `t` = FIRST 200 + `tt` = LAST 200. Same 400
            //                      budget as the old head-only cap, but the
            //                      tail lets a resolver recover the EXACT span
            //                      (end = tail match + 200) instead of only the
            //                      first 400 chars. A 200-char tail is unique,
            //                      so the interior-occurrence failure that
            //                      killed using `ts` as end anchor cannot
            //                      happen. `tt` present == "t is truncated".
            const t = String((sel.text || "")).replace(/\s+/g, " ").trim();
            if (t) {
                if (t.length > 400) {
                    payload.t = t.slice(0, 200);
                    payload.tt = t.slice(-200);
                } else {
                    payload.t = t;
                    if (t.length < 60) {
                        const tp = String(sel.prefix || "").replace(/\s+/g, " ").slice(-16);
                        const ts = String(sel.suffix || "").replace(/\s+/g, " ").slice(0, 16);
                        if (tp) payload.tp = tp;
                        if (ts) payload.ts = ts;
                    }
                }
            }
            // KIND. A pin is a POINT, stored as a zero-area rect
            // (`rects: [[x,y,x,y]]`, `anchor: "point"`). Encoding it like a text
            // selection would decode fine and then paint a zero-area highlight
            // -- i.e. nothing, while reporting success. Say so explicitly, and
            // fall back to detecting degeneracy so links built from pin
            // bookmarks that predate this flag still resolve correctly.
            const degenerate = payload.r.every((x: any) => x[2] - x[0] === 0 && x[3] - x[1] === 0);
            if (p.anchor === "point" || degenerate) payload.k = "pin";
            const json = JSON.stringify(payload);
            const b64 = btoa(unescape(encodeURIComponent(json)));
            return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        } catch (e) { return null; }
    },

    /** Inverse of `_wvEncodeSelectionPos`. Returns `{position, text}` or null. */
    _wvDecodeSelectionPos(raw: string): any {
        try {
            if (!raw) return null;
            let b64 = String(raw).replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4) b64 += "=";
            const json = decodeURIComponent(escape(atob(b64)));
            const o = JSON.parse(json);
            if (!o || !Array.isArray(o.r) || !o.r.length) return null;
            const degenerate = o.r.every((x: any) => x[2] - x[0] === 0 && x[3] - x[1] === 0);
            return {
                position: { pageIndex: Number(o.p) || 0, rects: o.r },
                version: Number(o.v) || 0,
                text: typeof o.t === "string" ? o.t : "",
                // Present only when `text` is the truncated HEAD of a long
                // selection: the last 200 chars, for exact-span recovery.
                textTail: typeof o.tt === "string" ? o.tt : "",
                // TextQuoteSelector-style context (short selections only).
                prefix: typeof o.tp === "string" ? o.tp : "",
                suffix: typeof o.ts === "string" ? o.ts : "",
                kind: (o.k === "pin" || degenerate) ? "pin" : "text",
            };
        } catch (e) { return null; }
    },

    /** Intercept `zotero://open…&wvpos=…` at `ZoteroPane.loadURI`.
     *
     *  THE choke point for links arriving from OUTSIDE Zotero:
     *  `commandLineHandler.js` routes an external `zotero://` click to
     *  `mainWindow.ZoteroPane.loadURI(uri.spec)` with the URL still intact,
     *  before Zotero's protocol handler parses it and drops params it doesn't
     *  know. Weavero's own link surfaces call `handleZoteroURI` directly, so
     *  they never reached here -- which is why a link clicked in another app
     *  only ever landed on the page (trace ring stayed empty, 2026-07-31).
     *
     *  Only wvpos links are diverted; everything else calls straight through,
     *  so no existing behaviour changes. Versioned re-wiring (not a boolean):
     *  a reload must be able to unhook the STALE closure and re-hook, or the
     *  dead copy keeps running -- the trap `Notes.open` / `Reader.open` hit. */
    _wvWireLoadURIHook(win: any) {
        try {
            const zp: any = win && win.ZoteroPane;
            if (!zp || typeof zp.loadURI !== "function") return;
            if (zp._wvLoadURIWired === WV_LOADURI_WIRE_V) return;
            // Peel any earlier version before installing this one.
            if (zp._wvOrigLoadURI) {
                try { zp.loadURI = zp._wvOrigLoadURI; } catch (e) {}
                delete zp._wvOrigLoadURI;
                delete zp._wvLoadURIWired;
            }
            const orig = zp.loadURI;
            zp._wvOrigLoadURI = orig;
            zp.loadURI = function (uri: any, ...rest: any[]) {
                try {
                    // Resolve the LIVE plugin at call time -- never close over
                    // `this`; the wrap outlives any single plugin instance.
                    const plugin: any = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    if (plugin && typeof uri === "string"
                        && /^zotero:\/\/open/i.test(uri)
                        && /[?&]wvpos=/i.test(uri)) {
                        plugin._wvLinkRing("loadURI: intercepted wvpos link");
                        Promise.resolve(plugin.handleZoteroURI(uri)).catch(() => {});
                        return;
                    }
                } catch (e) {}
                return orig.apply(this, [uri, ...rest]);
            };
            zp._wvLoadURIWired = WV_LOADURI_WIRE_V;
            // Ring the successful wire — its ABSENCE in Zotero._wvLinkLog is
            // what diagnosed the unwired-window case (2026-08-05).
            try { this._wvLinkRing("loadURI hook wired (v" + WV_LOADURI_WIRE_V + ")"); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] _wvWireLoadURIHook err: " + e); }
    },

    /** Restore the native `loadURI` (shutdown / window unload). */
    _wvUnwireLoadURIHook(win: any) {
        try {
            const zp: any = win && win.ZoteroPane;
            if (zp && zp._wvOrigLoadURI) {
                zp.loadURI = zp._wvOrigLoadURI;
                delete zp._wvOrigLoadURI;
                delete zp._wvLoadURIWired;
            }
        } catch (e) {}
    },

    /** The window that already shows the document a `zotero://open` link
     *  targets — a reader window, or whichever main window hosts its tab —
     *  or null when the document isn't open anywhere (or the URL doesn't
     *  name an item). Used by the CommandLineIngester wrap to focus the
     *  RIGHT window on external link delivery. */
    _wvLinkTargetWindow(spec: string): any {
        try {
            const m = String(spec).match(/^zotero:\/\/open\/(?:library|groups\/(\d+))\/items\/([A-Z0-9]{8})/i);
            if (!m) return null;
            let libraryID = Zotero.Libraries.userLibraryID;
            if (m[1]) {
                const g: any = Zotero.Groups.get(parseInt(m[1], 10));
                if (!g) return null;
                libraryID = g.libraryID;
            }
            const item: any = Zotero.Items.getByLibraryAndKey(libraryID, m[2].toUpperCase());
            if (!item) return null;
            // The link normally names an attachment; if it names a regular
            // item, any of its attachments' readers counts as the target.
            const ids = new Set<number>([item.id]);
            try {
                if (item.isRegularItem && item.isRegularItem()) {
                    for (const aid of (item.getAttachments() || [])) ids.add(aid);
                }
            } catch (e) {}
            for (const r of ((Zotero as any).Reader && (Zotero as any).Reader._readers || [])) {
                try {
                    if (!r || !ids.has(r.itemID)) continue;
                    const w = r._window;   // main window for a ReaderTab, the
                                           // standalone window for window readers
                    if (w && !w.closed) return w;
                } catch (e) {}
            }
            return null;
        } catch (e) { return null; }
    },

    /** Fix the "stolen focus" on external links: `CommandLineIngester.ingest`
     *  unconditionally does `mainWindow.focus()` before loadURI (upstream
     *  commandLineHandler.js) -- so a link whose target lives in ANOTHER
     *  window briefly raised the last-active main window (its tab bar
     *  flashing over the target window read as a phantom tab, 2026-08-05).
     *  Wrap ingest: when the linked document is already open somewhere,
     *  focus ITS window and route the URL through loadURI WITHOUT the main
     *  raise; anything else falls through to the original untouched.
     *  Versioned re-wiring; live plugin resolution (reload-safe). */
    _wvWireCmdLineIngester() {
        try {
            const CI: any = (Zotero as any).CommandLineIngester;
            if (!CI || typeof CI.ingest !== "function") return;
            if (CI._wvIngestWired === WV_CMDLINE_WIRE_V) return;
            if (CI._wvOrigIngest) {
                try { CI.ingest = CI._wvOrigIngest; } catch (e) {}
                delete CI._wvOrigIngest;
                delete CI._wvIngestWired;
            }
            const orig = CI.ingest;
            CI._wvOrigIngest = orig;
            CI.ingest = async function (...args: any[]) {
                try {
                    const plugin: any = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    if (plugin) {
                        const { CommandLineOptions } = ChromeUtils.importESModule(
                            "chrome://zotero/content/modules/commandLineOptions.mjs");
                        const uri: any = CommandLineOptions.url;
                        if (uri && uri.schemeIs && uri.schemeIs("zotero")) {
                            const tw = plugin._wvLinkTargetWindow(uri.spec);
                            if (tw) {
                                plugin._wvLinkRing("cmdline: target open in “"
                                    + String(tw.document && tw.document.title || "?").slice(0, 20)
                                    + "” — focusing it, skipping the main-window raise");
                                try { tw.focus(); } catch (e) {}
                                const mw: any = Zotero.getMainWindow();
                                if (mw && mw.ZoteroPane) {
                                    try { mw.ZoteroPane.loadURI(uri.spec); } catch (e) {}
                                }
                                // Consume the URL so the original ingest can't
                                // re-handle it (and re-raise the main window);
                                // its file/CSL handling still runs below.
                                CommandLineOptions.url = null;
                            }
                        }
                    }
                } catch (e) {}
                return orig.apply(this, args);
            };
            CI._wvIngestWired = WV_CMDLINE_WIRE_V;
            this._wvLinkRing("cmdline ingester wired (v" + WV_CMDLINE_WIRE_V + ")");
        } catch (e) { Zotero.debug("[Weavero] _wvWireCmdLineIngester err: " + e); }
    },

    /** Restore the native ingest (shutdown). */
    _wvUnwireCmdLineIngester() {
        try {
            const CI: any = (Zotero as any).CommandLineIngester;
            if (CI && CI._wvOrigIngest) {
                CI.ingest = CI._wvOrigIngest;
                delete CI._wvOrigIngest;
                delete CI._wvIngestWired;
            }
        } catch (e) {}
    },

    /** The right-clicked point, in PDF coordinates: `{pageIndex, x, y}`.
     *  Resolves the page from the clicked element, then converts through that
     *  page's viewport (`convertToPdfPoint` expects coordinates relative to the
     *  page div, hence the rect subtraction). Null when the click wasn't over a
     *  rendered page. */
    _wvClickPointToPdf(reader: any, event: any): any {
        try {
            const ir = reader && reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const win = pv && pv._iframeWindow;
            const app = win && (win.PDFViewerApplication
                || (win.wrappedJSObject && win.wrappedJSObject.PDFViewerApplication));
            if (!app || !app.pdfViewer) return null;
            // COORDINATE SOURCE: the reader's view context menu carries the
            // click as `x` / `y` (see createViewContextMenu in the reader's
            // context-menu.js -- `x: params.x, y: params.y`), NOT clientX /
            // clientY. Reading only the DOM-event names made this return null
            // every time, so the entry never appeared (2026-07-31). Accept all
            // three shapes.
            const pick = (...vals: any[]) => vals.find((v) => Number.isFinite(v));
            const p0 = (event && event.params) || {};
            let cx = pick(event && event.clientX, event && event.x, p0.clientX, p0.x);
            let cy = pick(event && event.clientY, event && event.y, p0.clientY, p0.y);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
            // COORDINATE SPACES: the menu's x/y are in the READER's space,
            // while page rects come from the nested pdf.js iframe. Comparing
            // them directly shifted every point by the iframe's offset, so
            // clicks genuinely inside the sheet tested as outside it and the
            // pin entries vanished (2026-07-31). Same conversion the existing
            // pin capture uses (`_wvCaptureReaderPosition`).
            try {
                if (pv._iframe) {
                    const br = pv._iframe.getBoundingClientRect();
                    cx -= br.x;
                    cy -= br.y;
                }
            } catch (e) {}
            const pages = app.pdfViewer._pages || [];
            // STRICTLY inside a page. A point outside the sheet has no PDF
            // coordinates, so a pin there is meaningless -- clamping a margin
            // click to the page edge (tried briefly) just invents a position
            // the user never indicated. Outside a page, callers get null and
            // omit the entry; the page-level link remains available.
            for (let i = 0; i < pages.length; i++) {
                const pageView = pages[i];
                if (!pageView || !pageView.div || !pageView.viewport) continue;
                const r = pageView.div.getBoundingClientRect();
                if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) continue;
                const pt = pageView.viewport.convertToPdfPoint(cx - r.left, cy - r.top);
                if (!pt) return null;
                return { pageIndex: i, x: pt[0], y: pt[1] };
            }
        } catch (e) {}
        return null;
    },

    /** Place the pin once the target page has actually RENDERED, then confirm
     *  it survived.
     *
     *  A fixed delay was a guess, and the log showed why it fails: `built` only
     *  means the page has a div and a viewport, so the pin could be placed at
     *  `renderingState: 0`, and the render triggered by our own scroll then
     *  wiped it (a marker lives in the page's layer). The highlight path never
     *  hit this because `_wvOutlineHighlightInPlace` already waits for
     *  `renderingState === 3`.
     *
     *  So: wait for state 3, place, then re-check once -- if a late render
     *  still took it, place it again. 2026-08-01. */
    _wvPlacePinWhenRendered(reader: any, pv: any, pageIndex: number, rects: any[], tries?: number, seqIn?: number) {
        const n = tries || 0;
        // Generation stamp: every NEW placement request (a fresh link click)
        // invalidates all in-flight poll loops and clear timers from earlier
        // clicks. Without it, N rapid clicks left N flat 2200 ms clears all
        // racing the ONE current pin, so it vanished at whatever remainder the
        // oldest timer happened to hold ("disappears at inconsistent times
        // when clicked several times", 2026-08-05). Same convention as the
        // highlight path's _wvHlSeq.
        let seq: any = seqIn;
        if (seq == null) {
            (pv as any)._wvLinkPinSeq = ((pv as any)._wvLinkPinSeq || 0) + 1;
            seq = (pv as any)._wvLinkPinSeq;
        }
        const live = () => (pv as any)._wvLinkPinSeq === seq;
        const w: any = Zotero.getMainWindow();
        const st: any = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
        try {
            const app = pv && pv._iframeWindow
                && (pv._iframeWindow.PDFViewerApplication
                    || (pv._iframeWindow.wrappedJSObject
                        && pv._iframeWindow.wrappedJSObject.PDFViewerApplication));
            const pgv = app && app.pdfViewer && app.pdfViewer._pages
                && app.pdfViewer._pages[pageIndex];
            const rendered = !!(pgv && pgv.div && pgv.viewport && pgv.renderingState === 3);
            if (rendered && !live()) {
                this._wvLinkRing("pin: placement superseded by a newer click (seq " + seq + ")");
                return;
            }
            if (rendered) {
                // RE-SCROLL, then place. The quarter-rule scroll in
                // _wvHighlightAfterOpen runs before the page has rendered, and
                // on a freshly-opened document the reader's own `page=`
                // navigation lands afterwards and scrolls to the PAGE TOP,
                // overriding it -- measured: the pin sat 1016px down a 962px
                // viewport, i.e. just past the fold (2026-08-01). Redoing it
                // here, with layout final, is what actually decides the landing.
                let top = rects[0];
                for (const rr of rects) if (rr && rr[3] > top[3]) top = rr;
                try { this._wvOutlineScrollToRect(pv, pageIndex, top); } catch (e) {}
                // HOLD it. The default marker self-fades 2.2s after placement,
                // but a link opens a document that is still settling -- the
                // reader's own navigation lands after ours -- so the fade can
                // expire before the view even arrives, leaving the right spot
                // with no pin on it (reported 2026-08-01). Place it persistent
                // and clear it on OUR clock, timed from when the view is
                // actually there.
                this._wvReaderShowPin(reader, { pageIndex, rects }, undefined, { persist: true });
                this._wvLinkRing("pin placed (renderingState=3, tries=" + n + ")");
                // Cleared 2200ms after the pin STOPS MOVING (see the watcher
                // below), matching _wvReaderShowPin's own startFade(2200)
                // convention -- an earlier flat 6s made link pins linger about
                // three times longer than every other marker in the plugin.

                // RE-PLACE after layout settles, unconditionally.
                //
                // On a link that OPENS the document (vs one already in a tab),
                // pdf.js lays pages out with estimated heights and then
                // REFLOWS once they are all measured. The pin is positioned
                // absolutely from pageView.div.offsetTop at placement time, so
                // the reflow moves the page and strands the marker at the old
                // offset -- measured as a client top of 24088 against a 962px
                // viewport, i.e. document-space coordinates that the container
                // scroll no longer applies to. Re-placing recomputes them
                // against the settled layout; it also covers the older case of
                // a late render simply dropping the element (2026-08-01).
                // Clear on the plugin's usual marker convention
                // (_wvReaderShowPin's own startFade(2200)).
                //
                // NO reflow watcher here: dev.20/21 re-placed the pin whenever
                // the page's offsetTop moved, on the theory that a fresh open
                // reflowed underneath it. The trace disproved that -- the
                // watcher never fired once, and the page never moved. The real
                // difference is the pin's PARENT on a freshly-opened document
                // (its rect comes back in document coords, i.e. it is not
                // inside the scrolling container), so the watcher was pure
                // complexity on the path.
                st(() => { try { if (live()) this._wvClearStalePin(pv); } catch (e) {} }, 2200);

                return;
            }
        } catch (e) {}
        // ~18s of patience. 6s proved too tight in practice: a page that has
        // to render from scratch (heavy PDF, slow machine, or a window Gecko
        // is throttling because it lacks focus) can exceed it, and giving up
        // is unrecoverable -- the pin never appears at all. Idle polls are
        // near-free; the ring records a give-up either way (2026-08-01).
        if (n < 120) {
            st(() => { if (live()) this._wvPlacePinWhenRendered(reader, pv, pageIndex, rects, n + 1, seq); }, 150);
        } else {
            this._wvLinkRing("pin: page never reached renderingState 3");
        }
    },

    /** Capped ring for the wvpos link path, baked into the BUILD so a failing
     *  click is already recorded rather than needing to be reproduced live
     *  (the lesson from the sidebar-oscillation hunt). Read with
     *  `Zotero._wvLinkLog.join("\n")`. */
    _wvLinkRing(m: string) {
        try {
            const Z: any = Zotero as any;
            if (!Z._wvLinkLog) Z._wvLinkLog = [];
            Z._wvLinkLog.push(new Date().toISOString().slice(11, 23) + " " + m);
            if (Z._wvLinkLog.length > 200) Z._wvLinkLog.shift();
        } catch (e) {}
    },

    /** Paint the `wvpos` highlight after a link has opened the document.
     *
     *  The reader DOES navigate to `location.position`, and its own
     *  `_highlightPosition()` runs -- but that just stores the object and
     *  re-renders, and the object we handed it was built in CHROME. Read from
     *  the view's compartment its `rects` come back undefined, so nothing is
     *  painted: the link lands on the right words with no highlight (reported
     *  2026-07-31). Zotero never hits this because its own positions are built
     *  inside the view.
     *
     *  So re-apply it through `_wvOutlineHighlightInPlace`, which already does
     *  the `cloneInto` dance for exactly this reason and is what the outline's
     *  own navigation uses. Polls briefly because the reader may still be
     *  opening when the link is followed. */
    _wvHighlightAfterOpen(itemID: number, position: any, tries?: number, kindIn?: string) {
        const n = tries || 0;
        const kind = kindIn
            || ((position && position.anchor === "point") ? "pin" : null)
            || ((position && Array.isArray(position.rects)
                 && position.rects.length
                 && position.rects.every((x: any) => x[2] - x[0] === 0 && x[3] - x[1] === 0))
                ? "pin" : "text");
        try {
            const reader: any = (Zotero.Reader._readers || [])
                .find((r: any) => r.itemID === itemID);
            if (!n) this._wvLinkRing("highlightAfterOpen: enter item=" + itemID
                + " readers=" + (Zotero.Reader._readers || []).length
                + " matched=" + !!reader);
            const ir = reader && reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const rects = position && position.rects;
            const pageIndex = (position && position.pageIndex) || 0;
            // READING MODE arrival. The PDF view is hidden there -- its pages
            // may never render, and the base-view highlight/pin would paint
            // into a view the user cannot see, so a link opening into an
            // RM-restored reader silently did nothing (review bug,
            // 2026-08-02). Route through the RM navigation instead: it maps
            // the PDF-space position into the reflow, lands it by the same
            // quarter rule, and shows the spotlight highlight (text) or the
            // RM pin marker (point).
            try {
                if (reader && this._wvReadingModeActive(reader)) {
                    const sdtv = this._wvOutlineRmView(reader);
                    if (sdtv) {
                        this._wvLinkRing("highlightAfterOpen: RM route page="
                            + pageIndex + " kind=" + kind);
                        const idoc = reader._iframeWindow && reader._iframeWindow.document;
                        const node: any = { title: "", position: { pageIndex, rects } };
                        if (kind === "pin") node.position.anchor = "point";
                        Promise.resolve(this._wvOutlineRmNavigate(reader, idoc, node)).catch(() => {});
                        return;
                    }
                    // RM is on but the SDT view isn't built yet (the reader is
                    // still opening) -- keep polling, same budget as the base
                    // path.
                    if (n < 120) {
                        const w0: any = Zotero.getMainWindow();
                        const st0: any = (w0 && w0.setTimeout) ? w0.setTimeout.bind(w0) : setTimeout;
                        st0(() => this._wvHighlightAfterOpen(itemID, position, n + 1, kind), 150);
                    } else {
                        this._wvLinkRing("highlightAfterOpen: RM view never became ready");
                    }
                    return;
                }
            } catch (e) {}
            // Wait for the target page to be BUILT -- both the scroll (which
            // reads the page viewport) and the highlight need real layout.
            let built = false;
            try {
                const app = pv && pv._iframeWindow
                    && (pv._iframeWindow.PDFViewerApplication
                        || (pv._iframeWindow.wrappedJSObject
                            && pv._iframeWindow.wrappedJSObject.PDFViewerApplication));
                const pageView = app && app.pdfViewer && app.pdfViewer._pages
                    && app.pdfViewer._pages[pageIndex];
                built = !!(pageView && pageView.div && pageView.viewport);
                // DEADLOCK BREAKER: pdf.js only builds pages near the viewport,
                // so waiting for the target page to be built before scrolling
                // to it waits forever when the reader is parked elsewhere --
                // observed as `built=false` for the full poll (2026-07-31).
                // Drive the page in first; the build then follows and the
                // quarter-rule scroll below refines the landing.
                if (!built && app && app.pdfViewer) {
                    if (n === 0 || n === 12 || n === 30) {
                        // A PRIMITIVE assignment, not scrollPageIntoView({...}):
                        // an options object built in chrome reads as empty
                        // across the Xray boundary, so the call no-ops WITHOUT
                        // throwing -- which is why the catch-fallback never ran
                        // (2026-07-31). Same class of bug as the highlight.
                        try { app.pdfViewer.currentPageNumber = pageIndex + 1; } catch (e2) {}
                        try {
                            const iw: any = pv._iframeWindow;
                            const Cu: any = (Components as any).utils;
                            if (iw && Cu) {
                                app.pdfViewer.scrollPageIntoView(
                                    Cu.cloneInto({ pageNumber: pageIndex + 1 }, iw));
                            }
                        } catch (e3) {}
                    }
                }
            } catch (e) {}

            if (built && Array.isArray(rects) && rects.length) {
                this._wvLinkRing("highlightAfterOpen: PAINT page=" + pageIndex
                    + " rects=" + rects.length + " afterTries=" + n);
                // TOPMOST rect drives the scroll: PDF y grows upward, so the
                // visually highest line is the one with the largest y1.
                let top = rects[0];
                for (const r of rects) if (r && r[3] > top[3]) top = r;
                // The QUARTER rule -- the same landing every outline and
                // bookmark navigation uses, rather than the reader's centring
                // (asked 2026-07-31).
                this._wvOutlineScrollToRect(pv, pageIndex, top);
                if (kind === "pin") {
                    // A point gets the PIN MARKER -- highlighting a zero-area
                    // rect paints nothing at all.
                    this._wvLinkRing("highlightAfterOpen: PIN page=" + pageIndex + " afterTries=" + n);
                    // DEFER past the scroll. The marker is appended into the
                    // page's layer, and the scroll we just issued makes pdf.js
                    // re-render that page -- dropping a pin added in the same
                    // tick (observed: the PIN branch ran, no element survived).
                    // `_wvOutlineNavPageTop` defers its page marker by 260ms for
                    // the same reason.
                    this._wvPlacePinWhenRendered(reader, pv, pageIndex, rects, 0);
                    return;
                }
                const gen = (pv._wvHlSeq = (pv._wvHlSeq || 0) + 1);
                try { this._wvClearStalePin(pv); } catch (e) {}
                this._wvOutlineHighlightInPlace(pv, pageIndex, rects, gen, 0);
                return;
            }
        } catch (e) {}
        if (n >= 60) this._wvLinkRing("highlightAfterOpen: GAVE UP after 60 tries");
        if (n < 60) {
            const w: any = Zotero.getMainWindow();
            const st: any = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
            st(() => this._wvHighlightAfterOpen(itemID, position, n + 1, kind), 150);
        }
    },

    /** The CURRENT text selection as `{position, text}` in PDF space, for
     *  link building -- Reading-Mode-aware.
     *
     *  In RM the selection lives in the SDT overlay, so the PDF-side reader
     *  returns null -- and the old `_wvLastSelection` fallback then served a
     *  selection made BEFORE entering RM, producing a link to the wrong text
     *  (review bug, 2026-08-02). Here RM selections are mapped back through
     *  `sdtv.toSelector()` (the same mapping the RM add-from-selection flow
     *  uses, so the stored position works in the base view too), and the
     *  stale fallback is never consulted while RM is active. */
    _wvReadSelectionForLink(reader: any): any {
        try {
            if (this._wvReadingModeActive(reader)) {
                const sdtv = this._wvOutlineRmView(reader);
                const iwin = sdtv && (Components as any).utils.waiveXrays(sdtv._iframeWindow);
                const selObj = iwin && iwin.getSelection && iwin.getSelection();
                if (!selObj || selObj.isCollapsed || !selObj.rangeCount) return null;
                const pos: any = sdtv.toSelector(selObj.getRangeAt(0));
                if (!pos || !Number.isInteger(pos.pageIndex)
                    || !Array.isArray(pos.rects) || !pos.rects.length) return null;
                return {
                    position: { pageIndex: pos.pageIndex,
                                rects: pos.rects.map((r: number[]) => [r[0], r[1], r[2], r[3]]) },
                    text: String(selObj.toString() || ""),
                };
            }
            return this._wvOutlineReadSelection(reader) || (reader._wvLastSelection || null);
        } catch (e) { return null; }
    },

    /** The 16-char context around a SHORT selection, read from the page's own
     *  text layer: `{prefix, suffix}` or null. Both the page text and the
     *  selection are whitespace-normalised the same way before matching, since
     *  the text layer breaks lines where the selection string does not. Any
     *  failure (page not rendered, text not found, selection spanning pages)
     *  returns null and the link is simply built without context -- the fields
     *  are an enhancement, never a requirement. */
    async _wvSelectionContext(reader: any, position: any, text: string): Promise<any> {
        try {
            const ir = reader && reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const iw: any = pv && pv._iframeWindow;
            const app = iw && (iw.PDFViewerApplication
                || (iw.wrappedJSObject && iw.wrappedJSObject.PDFViewerApplication));
            const pageView = app && app.pdfViewer && app.pdfViewer._pages
                && app.pdfViewer._pages[(position && position.pageIndex) || 0];
            if (!pageView || !pageView.pdfPage) return null;
            const tc = await pageView.pdfPage.getTextContent();
            if (!tc || !tc.items) return null;
            let pageText = "";
            for (const it of tc.items) pageText += (it.str || "") + " ";
            pageText = pageText.replace(/\s+/g, " ");
            const needle = String(text || "").replace(/\s+/g, " ").trim();
            if (!needle) return null;
            const i = pageText.indexOf(needle);
            if (i < 0) return null;
            return {
                prefix: pageText.slice(Math.max(0, i - 16), i),
                suffix: pageText.slice(i + needle.length, i + needle.length + 16),
            };
        } catch (e) { return null; }
    },

    /** Full selection link: `<base>?page=<N>&wvpos=<payload>`. `page` first so
     *  a plain Zotero (which ignores `wvpos`) still lands on the right page. */
    _wvBuildSelectionPosLink(linkBase: string, sel: any): string | null {
        try {
            const enc = this._wvEncodeSelectionPos(sel);
            if (!enc) return null;
            const pageIndex = (sel.position && Number.isInteger(sel.position.pageIndex))
                ? sel.position.pageIndex : 0;
            return linkBase + "?page=" + (pageIndex + 1) + "&wvpos=" + enc;
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
