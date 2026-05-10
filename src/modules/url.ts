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
        const parts = ["https?:\\/\\/", "zotero:\\/\\/"];
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
                        // Scheme names are alphanumeric only — no regex
                        // metachars to escape. Convert `/` in `sep` to
                        // `\/` for embedding in a regex source string.
                        parts.push(def.name + def.sep.replace(/\//g, "\\/"));
                    }
                } catch (e) {}
            }
        }
        this._urlSchemeAltCache = parts.join("|");
        return this._urlSchemeAltCache;
    },

    /** Single-match regex for a URL in plain text. The body class
     *  `[^\s<>"')\]]+` stops at whitespace and the punctuation that's
     *  most commonly trailing punctuation. Cached and invalidated
     *  with `URL_SCHEME_ALT`. */
    get URL_REGEX() {
        if (this._urlRegexCache) return this._urlRegexCache;
        this._urlRegexCache = new RegExp(
            "(" + this.URL_SCHEME_ALT + ")[^\\s<>\"')\\]]*");
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
        if (!url) return "wv-link-http";
        if (url.startsWith("zotero://")) return "wv-link-zotero";
        if (/^https?:\/\//i.test(url))   return "wv-link-http";
        return "wv-link-app";
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
