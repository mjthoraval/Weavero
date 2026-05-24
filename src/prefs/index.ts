// Module: preferences pane binding script.
//
// Loaded into the prefs window via Zotero.PreferencePanes.register(
// {scripts: ["prefs.js"]}); the runtime puts us in a Cu.Sandbox whose
// sandboxPrototype is the outer prefs window — so `document` is the
// prefs window's document, NOT our pane HTML's document. To bind to
// the radios declared in prefs.html, we walk the prefs window for
// the browser/iframe whose contentDocument actually contains our
// markup.
//
// Bundled via esbuild from src/prefs/index.ts to addon/prefs.js
// (preserving the filename Zotero looks up by name). esbuild's IIFE
// wrapper takes the place of the original `(function(){...})()`.

    const PREF_BRANCH = "weavero.inlineLinks";
    const PREF_PATH   = "extensions.zotero." + PREF_BRANCH;
    const RADIO_SEL   = "input[name='wv-mode']";

    function dbg(msg) {
        try { Zotero.debug("[Weavero][prefs] " + msg); } catch (e) {}
    }
    dbg("script loaded");

    function readPref() {
        try {
            const v = Zotero.Prefs.get(PREF_BRANCH);
            return v === undefined ? true : !!v;
        } catch (e) { dbg("readPref err: " + e); return true; }
    }
    function writePref(inline) {
        try { Zotero.Prefs.set(PREF_BRANCH, !!inline); dbg("writePref -> " + !!inline); }
        catch (e) { dbg("writePref err: " + e); }
    }

    /** Search the prefs window for the document that actually contains our
     *  radio inputs. Looks at the current document first, then walks every
     *  browser/iframe (and their nested children) until one matches. */
    function findPaneDoc() {
        try {
            if (document.querySelector(RADIO_SEL)) return document;
        } catch (e) {}
        const seen = new Set();
        const frames = [];
        const collect = (root) => {
            try {
                const fs = root.querySelectorAll("browser, iframe");
                for (const f of fs) frames.push(f);
            } catch (e) {}
        };
        collect(document);
        for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            if (seen.has(f)) continue;
            seen.add(f);
            let cd = null;
            try { cd = f.contentDocument; } catch (e) {}
            if (!cd) continue;
            try {
                if (cd.querySelector(RADIO_SEL)) return cd;
            } catch (e) {}
            // Nested frames inside this one.
            collect(cd);
        }
        return null;
    }

    function paintCards(doc) {
        const radios = doc.querySelectorAll(RADIO_SEL);
        for (const r of radios) {
            const card = r.closest && r.closest(".wv-radio-card");
            if (card) card.classList.toggle("is-checked", r.checked);
        }
    }
    function selectMode(doc, mode) {
        for (const r of doc.querySelectorAll(RADIO_SEL))
            r.checked = (r.value === mode);
        paintCards(doc);
    }

    function bind(doc) {
        const radios = Array.from(doc.querySelectorAll(RADIO_SEL)) as any[];
        dbg("bind: radios=" + radios.length + " in doc URL=" + doc.URL);
        if (!radios.length) return false;

        const initial = readPref();
        dbg("bind: initial pref=" + initial + " -> mode=" + (initial ? "inline" : "icon"));
        selectMode(doc, initial ? "inline" : "icon");

        for (const r of radios) {
            // Don't double-bind on a re-init.
            if (r.dataset.wvBound) continue;
            r.dataset.wvBound = "1";
            r.addEventListener("change", () => {
                if (!r.checked) return;
                dbg("change -> " + r.value);
                writePref(r.value === "inline");
                paintCards(doc);
            });
            r.addEventListener("click", () => {
                // Some platforms don't dispatch 'change' if the radio is
                // already checked; the click event is the safety net.
                if (r.checked) {
                    dbg("click(checked) -> " + r.value);
                    writePref(r.value === "inline");
                    paintCards(doc);
                }
            });
        }

        // External pref changes (e.g. another window) — keep UI in sync.
        // The observer's `doc` is captured by closure and may become a dead
        // CCW once the prefs window is closed; guard with a closed flag and
        // a try/catch so the orphan callback doesn't throw.
        let closed = false;
        try {
            const obs = {
                observe: (_s, _t, data) => {
                    if (closed) return;
                    try {
                        if (data === PREF_PATH) {
                            const v = readPref();
                            dbg("observer -> " + v);
                            selectMode(doc, v ? "inline" : "icon");
                        }
                    } catch (e) {
                        // Most likely the doc went away between unload
                        // dispatch and observer-removal — mark closed and
                        // attempt cleanup.
                        closed = true;
                        try { Services.prefs.removeObserver(PREF_PATH, obs); } catch (_) {}
                    }
                }
            };
            Services.prefs.addObserver(PREF_PATH, obs, false);
            const win = doc.defaultView;
            if (win) {
                win.addEventListener("unload", () => {
                    closed = true;
                    try { Services.prefs.removeObserver(PREF_PATH, obs); } catch (e) {}
                }, { once: true });
            }
        } catch (e) { dbg("observer err: " + e); }

        return true;
    }

    // === Per-feature enable checkboxes ====================================
    // Sub-checkboxes inside the two display-mode radio cards. The Inline
    // card's enableInlineUrls / enableCommentMarkdown only apply when
    // Inline is active; the Icon & Popup card's enableIconUrls /
    // enableIconMarkdown / enableIconAppLinks only apply when Icon mode
    // is active. All default to true so each mode shows full content
    // affordances out of the box.
    const FEATURES = [
        // Tab masters (v0.8.1-dev.3)
        "enableLinksAndRelations",
        "enableVisualExtras",
        // Pre-existing
        "enableInlineUrls",
        "enableCommentMarkdown",
        "enableIconUrls",
        "enableIconMarkdown",
        "enableIconAppLinks",
        "enableAppLinks",
        "enableZoteroLinks",
        "enableAppLinksSkipConfirm",
        "enableReaderViewIcons",
        "enableTagsCountAuto",
        "enableAnnotationAddedBy",
        "enableAddedByColors",
        "debug",
        // v0.8.1 — URI utilities
        "enableUriUtilities",
        "enableCopyItemLink",
        "enableCopyCollectionLink",
        // v0.8.1 — Relations and linked items
        "enableRelations",
        "enableAddRelatedMenu",
        "enableChainBadge",
        "enableOpenRelatedSubmenu",
        "enableRelatedColumn",
        "enableLibrariesHighlight",
        // v0.8.1 — Filters
        "enableFilters",
        "enableItemsTreeFilter",
        "enableSelectionTarget",
        "enableTabsLibraryFilter",
        "enableTabsFileTypeFilter",
        // v0.8.1 — Visual extras
        "enableAnnotationsCountColumn",
        "enableGroupLibraryGlyph",
        // v0.8.8 — Window bars
        "compactTitleBar",
        "compactTitleBarMain",
        "compactTitleBarReader",
    ];

    // === Per-surface enable checkboxes ====================================
    const SURFACES = [
        "enableItemsList",
        "enableRightPane",
        "enableNotes",
        "enableReaderSidebar",
        "enableReaderView",
    ];

    // === Per-scheme enable checkboxes =====================================
    // Optional URL schemes the user can enable in the "Extra link schemes"
    // collapsible. Keep in sync with `URL_SCHEMES` in bootstrap.js. Each
    // pref defaults to FALSE — opt-in.
    // Alphabetical within tier (bare-colon `name:` first, then slash
    // `name://`). Keep in sync with URL_SCHEMES in bootstrap.js.
    const SCHEMES = [
        // Tier 1: bare-colon
        "enableMagnetScheme",
        "enableMailtoScheme",
        "enableSkypeScheme",
        "enableSmsScheme",
        "enableSpotifyScheme",
        "enableTelScheme",
        // Tier 2: slash
        "enableDiscordScheme",
        "enableEvernoteScheme",
        "enableFigmaScheme",
        "enableFileScheme",
        "enableFtpScheme",
        "enableMsteamsScheme",
        "enableNotionScheme",
        "enableObsidianScheme",
        "enableSlackScheme",
        "enableVscodeScheme",
        "enableZoomScheme",
    ];
    // Default-on for surfaces and most features; default-off for the
    // debug toggle so the box starts unchecked when the pref hasn't been
    // touched yet. All optional URL schemes also default to off — opt-in.
    const FEATURES_DEFAULT_OFF = new Set([
        "debug",
        "enableAppLinks", "enableAppLinksSkipConfirm",
        "enableNotes",
        "compactTitleBar",
        ...SCHEMES,
    ]);
    function readSurface(name) {
        try {
            const v = Zotero.Prefs.get("weavero." + name);
            const def = FEATURES_DEFAULT_OFF.has(name) ? false : true;
            return v === undefined ? def : !!v;
        } catch (e) { return !FEATURES_DEFAULT_OFF.has(name); }
    }
    function writeSurface(name, on) {
        try { Zotero.Prefs.set("weavero." + name, !!on); }
        catch (e) {}
    }
    function bindSurfaces(doc) {
        const boxes = Array.from(doc.querySelectorAll("input[name='wv-surface']")) as any[];
        if (!boxes.length) return false;
        for (const cb of boxes) {
            cb.checked = readSurface(cb.value);
            if (cb.dataset.wvBound) continue;
            cb.dataset.wvBound = "1";
            cb.addEventListener("change", () => {
                dbg("surface " + cb.value + " -> " + cb.checked);
                writeSurface(cb.value, cb.checked);
            });
        }
        // Pref observer so external changes refresh checkboxes. Guard
        // against the captured `doc` becoming a dead CCW after window close.
        let closed = false;
        try {
            const obs = {
                observe: (_s, _t, data) => {
                    if (closed) return;
                    try {
                        for (const name of SURFACES) {
                            if (data === "extensions.zotero.weavero." + name) {
                                const cb = doc.querySelector(
                                    "input[name='wv-surface'][value='" + name + "']");
                                if (cb) cb.checked = readSurface(name);
                            }
                        }
                    } catch (e) {
                        closed = true;
                        try {
                            for (const name of SURFACES) {
                                Services.prefs.removeObserver(
                                    "extensions.zotero.weavero." + name, obs);
                            }
                        } catch (_) {}
                    }
                }
            };
            for (const name of SURFACES) {
                Services.prefs.addObserver(
                    "extensions.zotero.weavero." + name, obs, false);
            }
            const win = doc.defaultView;
            if (win) {
                win.addEventListener("unload", () => {
                    closed = true;
                    try {
                        for (const name of SURFACES) {
                            Services.prefs.removeObserver(
                                "extensions.zotero.weavero." + name, obs);
                        }
                    } catch (e) {}
                }, { once: true });
            }
        } catch (e) { dbg("surface observer err: " + e); }
        return true;
    }

    /** Sync the Debug section's <details open> attribute with the
     *  weavero.debug pref. ONLY called on initial pane mount — toggling
     *  the checkbox in-session does NOT re-collapse / re-expand the
     *  section. Next time the user opens Settings, the section state
     *  matches the pref again, giving a glanceable indicator that
     *  debug is active. */
    function syncDebugDetails(doc) {
        const cb = doc.querySelector("input[name='wv-feature'][value='debug']");
        if (!cb) return;
        const details = cb.closest("details");
        if (!details) return;
        details.open = !!cb.checked;
    }

    function bindFeatures(doc) {
        const boxes = Array.from(doc.querySelectorAll("input[name='wv-feature']")) as any[];
        if (!boxes.length) return false;
        for (const cb of boxes) {
            cb.checked = readSurface(cb.value);
            // For shared Display Mode toggles (data-wv-also), force the
            // alias prefs to match the canonical at mount time so any
            // out-of-sync state from earlier per-mode UIs gets healed.
            const also0 = (cb.dataset.wvAlso || "").split(",")
                .map((s) => s.trim()).filter(Boolean);
            for (const alias of also0) {
                if (readSurface(alias) !== cb.checked) writeSurface(alias, cb.checked);
            }
            if (cb.dataset.wvBound) continue;
            cb.dataset.wvBound = "1";
            cb.addEventListener("change", () => {
                dbg("feature " + cb.value + " -> " + cb.checked);
                writeSurface(cb.value, cb.checked);
                // data-wv-also: comma-separated list of additional pref
                // names that should mirror this checkbox's value. Used by
                // the shared Display Mode toggles where ONE UI checkbox
                // governs both the Inline-mode and Icon-mode prefs (e.g.
                // enableInlineUrls + enableIconUrls).
                const also = (cb.dataset.wvAlso || "").split(",")
                    .map((s) => s.trim()).filter(Boolean);
                for (const alias of also) writeSurface(alias, cb.checked);
            });
        }
        // Initial sync after all checkboxes have their value loaded.
        // No re-sync on change / external pref update — that's by design;
        // the section state is meant to match the pref only at open time.
        syncDebugDetails(doc);
        let closed = false;
        try {
            const obs = {
                observe: (_s, _t, data) => {
                    if (closed) return;
                    try {
                        for (const name of FEATURES) {
                            if (data === "extensions.zotero.weavero." + name) {
                                const cb = doc.querySelector(
                                    "input[name='wv-feature'][value='" + name + "']");
                                if (cb) cb.checked = readSurface(name);
                            }
                        }
                    } catch (e) {
                        closed = true;
                        try {
                            for (const name of FEATURES) {
                                Services.prefs.removeObserver(
                                    "extensions.zotero.weavero." + name, obs);
                            }
                        } catch (_) {}
                    }
                }
            };
            for (const name of FEATURES) {
                Services.prefs.addObserver(
                    "extensions.zotero.weavero." + name, obs, false);
            }
            const win = doc.defaultView;
            if (win) {
                win.addEventListener("unload", () => {
                    closed = true;
                    try {
                        for (const name of FEATURES) {
                            Services.prefs.removeObserver(
                                "extensions.zotero.weavero." + name, obs);
                        }
                    } catch (e) {}
                }, { once: true });
            }
        } catch (e) { dbg("feature observer err: " + e); }
        return true;
    }

    /** Bind the "Extra link schemes" checkboxes (`name=wv-scheme`).
     *  Same shape as `bindSurfaces` — read/write via the shared
     *  readSurface / writeSurface helpers (same `weavero.<name>` pref
     *  layout, just a different `name=` attribute on the inputs and
     *  a different observer-tracked list. */
    function bindSchemes(doc) {
        const boxes = Array.from(doc.querySelectorAll("input[name='wv-scheme']")) as any[];
        if (!boxes.length) return false;
        for (const cb of boxes) {
            cb.checked = readSurface(cb.value);
            if (cb.dataset.wvBound) continue;
            cb.dataset.wvBound = "1";
            cb.addEventListener("change", () => {
                dbg("scheme " + cb.value + " -> " + cb.checked);
                writeSurface(cb.value, cb.checked);
            });
        }
        let closed = false;
        try {
            const obs = {
                observe: (_s, _t, data) => {
                    if (closed) return;
                    try {
                        for (const name of SCHEMES) {
                            if (data === "extensions.zotero.weavero." + name) {
                                const cb = doc.querySelector(
                                    "input[name='wv-scheme'][value='" + name + "']");
                                if (cb) cb.checked = readSurface(name);
                            }
                        }
                    } catch (e) {
                        closed = true;
                        try {
                            for (const name of SCHEMES) {
                                Services.prefs.removeObserver(
                                    "extensions.zotero.weavero." + name, obs);
                            }
                        } catch (_) {}
                    }
                }
            };
            for (const name of SCHEMES) {
                Services.prefs.addObserver(
                    "extensions.zotero.weavero." + name, obs, false);
            }
            const win = doc.defaultView;
            if (win) {
                win.addEventListener("unload", () => {
                    closed = true;
                    try {
                        for (const name of SCHEMES) {
                            Services.prefs.removeObserver(
                                "extensions.zotero.weavero." + name, obs);
                        }
                    } catch (e) {}
                }, { once: true });
            }
        } catch (e) { dbg("scheme observer err: " + e); }
        return true;
    }

    // === Active-tab persistence ============================================
    // The three top-level tabs (Enhanced Links and Relations / Filters /
    // Visual extras) are pure-CSS via radio inputs; reloading the prefs
    // pane (e.g. after a plugin re-install during dev iteration) resets
    // the radios to their HTML-default first tab. Persist the user's
    // last-viewed tab to a pref so the pane reopens where they left off.
    const TAB_PREF = "weavero.activeTab";
    const TAB_IDS  = ["links", "filters", "extras"];
    function bindTabs(doc) {
        const radios = TAB_IDS
            .map((id) => doc.getElementById("wv-tab-" + id))
            .filter(Boolean);
        if (radios.length !== TAB_IDS.length) return false;

        // Restore the saved tab (default to "links").
        let saved = "links";
        try {
            const v = Zotero.Prefs.get(TAB_PREF);
            if (typeof v === "string" && TAB_IDS.indexOf(v) !== -1) saved = v;
        } catch (e) {}
        for (const r of radios as any[]) r.checked = (r.id === "wv-tab-" + saved);

        for (const r of radios as any[]) {
            if (r.dataset.wvTabBound) continue;
            r.dataset.wvTabBound = "1";
            r.addEventListener("change", () => {
                if (!r.checked) return;
                const id = (r.id || "").replace(/^wv-tab-/, "");
                if (TAB_IDS.indexOf(id) === -1) return;
                try { Zotero.Prefs.set(TAB_PREF, id); }
                catch (e) { dbg("activeTab write err: " + e); }
            });
        }
        return true;
    }

    /** Give the pane a right-click → "Copy" (+ "Select All") menu for
     *  selected text. Zotero's preferences window doesn't supply a
     *  content context menu, so without this a right-click on text in
     *  our pane does nothing. The pane iframe is an HTML document, but
     *  a XUL <menupopup> needs a XUL host — so the popup is created in
     *  the (XUL) prefs window that owns the iframe; `openPopupAtScreen`
     *  positions it by screen coords regardless of where it lives.
     *  Editable fields (none here, but defensive) keep their own
     *  native editing menu. */
    const XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    function bindContextMenu(doc) {
        const win = doc.defaultView;
        if (!win) return false;
        if (doc.documentElement && (doc.documentElement as any).dataset
            && (doc.documentElement as any).dataset.wvCtxBound) return true;
        // Walk up to a window whose root element is XUL (the prefs window).
        let xulWin: any = null;
        try {
            let w: any = win;
            for (let i = 0; i < 6 && w; i++) {
                const root = w.document && w.document.documentElement;
                if (root && root.namespaceURI === XULNS) { xulWin = w; break; }
                if (w.parent === w) break;
                w = w.parent;
            }
        } catch (e) {}
        if (!xulWin) xulWin = win;   // fallback — may not render, but won't throw
        const xdoc = xulWin.document;
        const makeXul = (tag) => {
            try { return (xdoc as any).createXULElement
                ? (xdoc as any).createXULElement(tag)
                : xdoc.createElementNS(XULNS, tag); }
            catch (e) { return xdoc.createElementNS(XULNS, tag); }
        };
        let popup: any = null;
        const ensurePopup = () => {
            if (popup && popup.isConnected) return popup;
            try {
                popup = makeXul("menupopup");
                popup.id = "wv-prefs-ctxmenu";
                const copy = makeXul("menuitem");
                copy.setAttribute("label", "Copy");
                copy.addEventListener("command", () => {
                    try {
                        const sel = win.getSelection ? String(win.getSelection()) : "";
                        if (sel) Zotero.Utilities.Internal.copyTextToClipboard(sel);
                    } catch (e) { dbg("ctxmenu copy err: " + e); }
                });
                popup.appendChild(copy);
                const all = makeXul("menuitem");
                all.setAttribute("label", "Select All");
                all.addEventListener("command", () => {
                    try {
                        const s = win.getSelection && win.getSelection();
                        if (s && s.selectAllChildren && doc.body) s.selectAllChildren(doc.body);
                    } catch (e) { dbg("ctxmenu selectall err: " + e); }
                });
                popup.appendChild(all);
                const host = (xdoc.querySelector && xdoc.querySelector("popupset"))
                    || xdoc.documentElement;
                host.appendChild(popup);
            } catch (e) { dbg("ctxmenu build err: " + e); popup = null; }
            return popup;
        };
        doc.addEventListener("contextmenu", (e: any) => {
            try {
                const t = e.target;
                const editable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
                    || (typeof t.isContentEditable === "boolean" && t.isContentEditable));
                if (editable) return;   // let native editing menu handle it
                const sel = win.getSelection ? String(win.getSelection()).trim() : "";
                if (!sel) return;       // nothing selected → no menu
                const p = ensurePopup();
                if (!p || typeof p.openPopupAtScreen !== "function") return;
                // Disable "Copy" when (somehow) there's no selection.
                try {
                    const copyMi = p.firstChild;
                    if (copyMi) copyMi.setAttribute("disabled", sel ? "false" : "true");
                } catch (_) {}
                e.preventDefault();
                e.stopPropagation();
                p.openPopupAtScreen(e.screenX, e.screenY, true);
            } catch (e2) { dbg("ctxmenu err: " + e2); }
        }, true);
        if (doc.documentElement && (doc.documentElement as any).dataset) {
            (doc.documentElement as any).dataset.wvCtxBound = "1";
        }
        return true;
    }

    /** Point the in-pane icon-sample <img> at the plugin's bundled
     *  logo PNG. A relative `src` doesn't work here — the pane HTML is
     *  injected into the prefs window, so its base URL isn't ours — so
     *  we derive the addon root from the registered pane `src`
     *  (`<rootURI>prefs.html`) and set an absolute URL. Swaps the
     *  light/dark logo with the colour scheme. */
    function bindIconSamples(doc) {
        const img: any = doc.getElementById("wv-doc-icon-link");
        if (!img) return false;
        let src = "";
        try {
            const pane = (Zotero.PreferencePanes.pluginPanes || [])
                .find((p) => p.pluginID === "weavero@mjthoraval");
            src = String((pane && pane.src) || "");
        } catch (e) {}
        // Strip the trailing "prefs.html" (with any query/fragment) to
        // get the addon root; bail if it didn't look as expected.
        const rootURI = src.replace(/prefs\.html(?:[?#].*)?$/, "");
        if (!rootURI || rootURI === src) return false;
        const win = doc.defaultView;
        const setSrc = (dark) => {
            img.src = rootURI + "icons/icon-" + (dark ? "dark" : "light") + "-16.png";
        };
        let mql: any = null;
        try { mql = win && win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)"); }
        catch (e) {}
        setSrc(!!(mql && mql.matches));
        if (mql && !img.dataset.wvThemeBound) {
            img.dataset.wvThemeBound = "1";
            try { mql.addEventListener("change", (ev) => setSrc(!!ev.matches)); } catch (e) {}
        }
        return true;
    }

    /** Poll for the pane document — the iframe may not be fully ready when
     *  the script first runs, even though Zotero awaits a delay() before
     *  loading us. We retry up to ~3 s. */
    function start(retries) {
        const doc = findPaneDoc();
        if (doc && bind(doc)) {
            try { bindSurfaces(doc); } catch (e) { dbg("bindSurfaces err: " + e); }
            try { bindFeatures(doc); } catch (e) { dbg("bindFeatures err: " + e); }
            try { bindSchemes(doc);  } catch (e) { dbg("bindSchemes err: " + e); }
            try { bindTabs(doc);     } catch (e) { dbg("bindTabs err: " + e); }
            try { bindContextMenu(doc); } catch (e) { dbg("bindContextMenu err: " + e); }
            try { bindIconSamples(doc); } catch (e) { dbg("bindIconSamples err: " + e); }
            dbg("bound on retry=" + (60 - retries));
            return;
        }
        if (retries > 0) {
            setTimeout(() => start(retries - 1), 50);
        } else {
            dbg("gave up — no pane doc with " + RADIO_SEL);
        }
    }
    // Zotero loads this script TWICE: first via setDefaultPrefs() in a
    // sandbox with no window (so `document` is undefined), then again when
    // the prefs pane actually opens. Skip the no-window invocation — it
    // can't bind anything anyway and just throws a noisy startup error.
    if (typeof document !== "undefined") {
        start(60);
    } else {
        dbg("script loaded without document — skipping (this is the setDefaultPrefs pre-pass)");
    }
