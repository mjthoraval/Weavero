// Module: reader and popup rendering — the largest module by
// line count.
//
// Encompasses three loosely-coupled clusters that all live in
// the reader/popup surface:
//
// - Popup panel: the floating panel that opens on
//   click-icon to show a comment with rendered URLs/markdown
//   (_getOrCreatePanel, _makeLink, _renderInlineMarkdown,
//   _makeCopyBtn, openCommentPopup, openRelationsPopup).
// - Reader DOM wiring: outer-frame style injection, the
//   sidebar/context handlers (_sidebarHandler, _contextHandler),
//   in-PDF annotation popup MutationObserver, the proactive
//   delete-key handler, and the reader observer pipeline that
//   wires everything to a Reader instance lifecycle
//   (_setupReaderObserver, _wireUpDomViewReader,
//   _setupInnerReaderObserver).
// - Sidebar/cell processing: link marking inside reader-sidebar
//   annotation cells (_markTextLinks, _markCellLinks), themed
//   reader-frame stylesheet injection, and the note-annotation
//   overlay icons.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via
// defineProperties.

import {
    PANEL_ID, BTN_CLASS, BTN_SIDEBAR_CLASS, BTN_POPUP_CLASS,
} from "./constants";

class _ReaderMixin {
    [k: string]: any;

    // ---- Popup panel -------------------------------------------------------

    /** Resolve the outer window the popup should render into.
     *
     *  The annotation icons live in three different DOM contexts: the
     *  reader's PDF iframe, the reader sidebar, and the main-window
     *  items-tree / right-pane. When the reader is opened in a SEPARATE
     *  window, the iframe and sidebar live inside that standalone
     *  reader window — Zotero.getMainWindow() returns the LIBRARY
     *  window, so naively using it as the popup host renders the popup
     *  off-screen (on the wrong window).
     *
     *  Resolution order: explicit opts.win → derive from anchorNode's
     *  ownerDocument.defaultView.top → fall back to main window. The
     *  `.top` walk handles iframe-nested anchors (PDF viewer, snapshot
     *  reader); the .defaultView guard handles dead documents. */
    /** Build an <img> for any chrome:// SVG icon, with a data: URL
     *  fallback so it displays inside resource:// documents (the
     *  reader's `reader.html` blocks <img src="chrome://...">
     *  loads — only privileged JS can fetch those URLs).
     *
     *  Sets the chrome URL as the initial src so the main-window
     *  case stays synchronous; on first call from a resource doc the
     *  cached data: URL takes over once fetched. The `_iconDataUriCache`
     *  lives on `this` and is GC'd at plugin unload. */
    _makeChromeIcon(doc, chromeUrl, className) {
        const ns = "http://www.w3.org/1999/xhtml";
        const img = doc.createElementNS(ns, "img");
        img.className = className;
        if (!this._iconDataUriCache) this._iconDataUriCache = Object.create(null);
        const cached = this._iconDataUriCache[chromeUrl];
        img.setAttribute("src", cached || chromeUrl);
        if (cached) return img;
        (async () => {
            try {
                const res = await fetch(chromeUrl);
                if (!res.ok) return;
                const svg = await res.text();
                const dataUri = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
                this._iconDataUriCache[chromeUrl] = dataUri;
                try { img.setAttribute("src", dataUri); } catch (e) {}
            } catch (e) {
                Zotero.debug("[Weavero] icon fetch err: " + chromeUrl + " " + e);
            }
        })();
        return img;
    }

    /** Item-type icon (`chrome://zotero/skin/item-type/16/{theme}/{kebab}.svg`).
     *  Theme via prefers-color-scheme on the target window; kebab name
     *  from data-item-type camelCase, preserving PDF / EPUB acronyms
     *  intact (mirrors scss/components/_item-tree.scss line 380). */
    _makeItemTypeIcon(doc, win, name) {
        const isDark = !!(win && win.matchMedia
            && win.matchMedia("(prefers-color-scheme: dark)").matches);
        const theme = isDark ? "dark" : "light";
        const kebab = (name || "document")
            .replace(/([a-z\d])([A-Z])/g, "$1-$2")
            .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
            .toLowerCase();
        const chromeUrl = "chrome://zotero/skin/item-type/16/" + theme + "/" + kebab + ".svg";
        return this._makeChromeIcon(doc, chromeUrl, "wv-rel-icon");
    }

    /** Attach a mousedown listener to every document reachable from
     *  the popup's host window — its own doc, every parent doc up
     *  to top, and every nested iframe doc. Without this the popup
     *  doesn't dismiss when the user clicks the PDF iframe (one
     *  level INSIDE reader.html) or the main Zotero pane (one level
     *  ABOVE reader.html), because mousedown events don't cross
     *  document boundaries.
     *
     *  Returns a teardown function that removes every listener.
     *  Defers attachment one tick so the click that opened the popup
     *  doesn't immediately match. */
    _attachOutsideClickDismiss(panel, hostDoc, hostWin, onOutside) {
        const docs: Set<any> = new Set();
        const visited: Set<any> = new Set();
        const collectDown = (doc) => {
            if (!doc || visited.has(doc)) return;
            visited.add(doc);
            docs.add(doc);
            try {
                for (const f of doc.querySelectorAll("iframe, browser")) {
                    let cd = null;
                    try { cd = f.contentDocument; } catch (e) {}
                    if (cd) collectDown(cd);
                }
            } catch (e) {}
        };
        // In Zotero 10's reader, the iframe's window has parent === self
        // (process-isolated), so we can't walk UP from hostWin. Use the
        // window-mediator instead to enumerate all top-level chrome
        // windows, then recurse into their iframes from the top.
        try {
            const wm = Components.classes[
                "@mozilla.org/appshell/window-mediator;1"]
                .getService(Components.interfaces.nsIWindowMediator);
            const en = wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try { if (w.document) collectDown(w.document); } catch (e) {}
            }
        } catch (e) {}
        // Belt-and-braces: also walk down from the host doc directly
        // in case the mediator missed it (e.g., a pref-pane subdoc).
        collectDown(hostDoc);

        const handler = (e) => {
            if (panel.style.display === "none") return;
            try {
                if (e.target && (e.target === panel || panel.contains(e.target))) return;
                // Don't dismiss when the mousedown is on the SAME anchor
                // that opened this popup — the anchor's own click handler
                // will run next and toggle the popup closed. Without this
                // skip, dismiss-on-mousedown closes the popup, then the
                // click event re-opens it (net effect: nothing happens).
                const opener = panel._wvOpenedFor;
                if (opener && (e.target === opener
                        || (opener.contains && opener.contains(e.target)))) {
                    return;
                }
            } catch (er) {}
            onOutside(e);
        };
        const teardown = () => {
            for (const d of docs) {
                try { d.removeEventListener("mousedown", handler, true); } catch (e) {}
            }
        };
        hostWin.setTimeout(() => {
            for (const d of docs) {
                try { d.addEventListener("mousedown", handler, true); } catch (e) {}
            }
        }, 0);
        return teardown;
    }

    /** Single source of truth for rendering "annotation comment text"
     *  to a DocumentFragment. All five surfaces (items-list highlight
     *  rows, items-list note rows, right pane, reader sidebar, reader
     *  popup) delegate the actual span-building to this function so a
     *  per-scheme toggle (URLs / Zotero Links / App Links / Markdown)
     *  added in the future only needs gating in ONE place.
     *
     *  Caller responsibilities (the wrapper in each surface):
     *    - cache key + cache hit detection (data-wv-source / data-render-mode)
     *    - replacing the target element's children with the returned frag
     *    - stamping cache attributes (data-wv-source, data-wv-rendered,
     *      data-wv-last-rebuild, data-wv-raw)
     *    - any surface-specific decoration (wv-tree-icon, etc.)
     *
     *  This helper does NOT touch any element other than building the
     *  fragment. It does not check enabled prefs other than via
     *  URL_REGEX (which already encodes URLs / Zotero Links / App Links
     *  state via URL_SCHEME_ALT).
     *
     *  ctx fields:
     *    doc         — Document for createElement (must support HTML namespace)
     *    useMd       — render markdown formatting? (false = bare URLs only)
     *    isTreeMode  — true: items-list mode strips markdown markers from
     *                  output, label-only for markdown links;
     *                  false: keeps markers and `[label](url)` literal
     *                  around the inner span (needed for in-place edits
     *                  in popup/sidebar where textContent must round-trip)
     *    lineBreaks  — true: split plain-text segments on \n and emit
     *                  <br> elements (right pane / sidebar preview).
     *                  false (default): keep \n as text characters
     *                  (items-list cells are single-line)
     *    stripMarkers — when isTreeMode is false but you want stripped-
     *                  marker output (the sidebar preview's behaviour:
     *                  "view shows formatted, edit shows source"). If
     *                  unset, defaults to isTreeMode.
     */
    _buildCommentFragment(text, ctx) {
        const doc = ctx.doc;
        const useMd = !!ctx.useMd;
        const isTreeMode = !!ctx.isTreeMode;
        const lineBreaks = !!ctx.lineBreaks;
        const stripMarkers = ctx.stripMarkers !== undefined
            ? !!ctx.stripMarkers : isTreeMode;
        const norm = this.normalize(text);
        const frag = doc.createDocumentFragment();

        // Plain-text emit. Splits on \n and emits <br> when ctx.lineBreaks
        // is set; otherwise just a text node.
        const emitText = (s) => {
            if (!s) return;
            if (!lineBreaks) {
                frag.appendChild(doc.createTextNode(s));
                return;
            }
            const parts = s.split("\n");
            for (let i = 0; i < parts.length; i++) {
                if (parts[i]) frag.appendChild(doc.createTextNode(parts[i]));
                if (i < parts.length - 1) frag.appendChild(doc.createElement("br"));
            }
        };

        // TOKEN regex group indices:
        //   useMd:    1 bold, 2 italic, 3 strike, 4 code-double,
        //             5 code-single, 6 link label, 7 link url,
        //             8 bare URL
        //   non-useMd: 1 link label, 2 link url, 3 bare URL
        // Markdown links work in BOTH modes — only the bold/italic/
        // strike/code alternations are gated on useMd. Double backtick
        // (group 4) must come before single backtick (group 5) so the
        // longer marker wins on consecutive backticks.
        const TOKEN = useMd ? new RegExp(
            "\\*\\*([\\s\\S]+?)\\*\\*"
            + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
            + "|~~([\\s\\S]+?)~~"
            + "|``([\\s\\S]+?)``"
            + "|`([^`\\n]+?)`"
            + "|\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
            "g"
        ) : new RegExp(
            "\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
            "g"
        );

        const wrapMd = (cls, marker, inner) => {
            if (!stripMarkers) frag.appendChild(doc.createTextNode(marker));
            const span = doc.createElement("span");
            span.className = "wv-md " + cls;
            span.textContent = inner;
            frag.appendChild(span);
            if (!stripMarkers) frag.appendChild(doc.createTextNode(marker));
        };
        const emitUrlSpan = (label, url) => {
            const span = doc.createElement("span");
            span.className = "wv-url-span " + this._urlLinkClass(url);
            span.title = url;
            span.textContent = label;
            span.setAttribute("data-href", url);
            frag.appendChild(span);
        };

        let last = 0, m;
        while ((m = TOKEN.exec(norm)) !== null) {
            if (m.index > last) {
                emitText(norm.slice(last, m.index));
            }
            if (useMd && m[1] !== undefined) {
                wrapMd("wv-md-bold", "**", m[1]);
            } else if (useMd && m[2] !== undefined) {
                wrapMd("wv-md-italic", "*", m[2]);
            } else if (useMd && m[3] !== undefined) {
                wrapMd("wv-md-strike", "~~", m[3]);
            } else if (useMd && m[4] !== undefined) {
                wrapMd("wv-md-code", "``", m[4]);
            } else if (useMd && m[5] !== undefined) {
                wrapMd("wv-md-code", "`", m[5]);
            } else {
                // Markdown link [label](url) — useMd groups 6/7, non-useMd 1/2.
                const linkLabel = useMd ? m[6] : m[1];
                const linkUrl   = useMd ? m[7] : m[2];
                if (linkLabel !== undefined && linkUrl !== undefined) {
                    const url = linkUrl.replace(this.TRAILING_RE, "");
                    // Render as styled link only if the URL's scheme is
                    // currently enabled (URLs / Zotero Links / App Links
                    // each remove their alternation from URL_SCHEME_ALT
                    // when off — `hasURI` checks via URL_REGEX). Else
                    // render as plain text.
                    if (this.hasURI(url)) {
                        if (!stripMarkers) frag.appendChild(doc.createTextNode("["));
                        emitUrlSpan(linkLabel, url);
                        if (!stripMarkers) frag.appendChild(doc.createTextNode("](" + linkUrl + ")"));
                    } else if (stripMarkers) {
                        emitText(linkLabel);
                    } else {
                        emitText("[" + linkLabel + "](" + linkUrl + ")");
                    }
                } else {
                    // Bare URL — useMd group 8, non-useMd group 3. The
                    // bare-URL alternative in TOKEN is built from
                    // URL_SCHEME_ALT, so any match here is already an
                    // enabled scheme — always render as a link.
                    const raw = useMd ? m[8] : m[3];
                    if (raw === undefined) {
                        last = m.index + m[0].length;
                        continue;
                    }
                    const url   = raw.replace(this.TRAILING_RE, "");
                    const trail = raw.slice(url.length);
                    emitUrlSpan(url, url);
                    if (trail) emitText(trail);
                }
            }
            last = m.index + m[0].length;
        }
        if (last < norm.length) {
            emitText(norm.slice(last));
        }
        return frag;
    }

    /** Reconstruct the markdown source text of a comment element by
     *  walking its rendered children — used as a fallback when
     *  `data-wv-raw` was lost (Zotero's React reconciliation can wipe
     *  our data-* attributes while keeping the span children). Without
     *  this, the recovery path falls back to `el.textContent` — the
     *  STRIPPED form, where `**bold**` is just "bold" — and a
     *  subsequent rebuild can't re-render the formatting, then
     *  permanently overwrites data-wv-raw with the stripped text.
     *
     *  Best-effort: double-backtick code can't be distinguished from
     *  single-backtick after rendering (both produce wv-md-code), so
     *  it's reconstructed as single-backtick. That's harmless — a
     *  rebuild from `` `code` `` produces the same output as from
     *  `` ``code`` ``. */
    _reconstructSourceFromSpans(el) {
        let out = "";
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 3) { out += node.nodeValue || ""; return; }
            if (node.nodeType !== 1) return;
            const tag = (node.tagName || "").toUpperCase();
            if (tag === "BR") { out += "\n"; return; }
            const cls = node.className || "";
            const txt = node.textContent || "";
            if (cls.indexOf("wv-md-bold") !== -1)   { out += "**" + txt + "**"; return; }
            if (cls.indexOf("wv-md-italic") !== -1) { out += "*"  + txt + "*";  return; }
            if (cls.indexOf("wv-md-strike") !== -1) { out += "~~" + txt + "~~"; return; }
            if (cls.indexOf("wv-md-code") !== -1)   { out += "`"  + txt + "`";  return; }
            if (cls.indexOf("wv-url-span") !== -1) {
                const href = node.getAttribute("data-href") || txt;
                // data-href differs from the visible text → it was a
                // markdown link [label](url); equal → bare URL.
                if (href && href !== txt) { out += "[" + txt + "](" + href + ")"; return; }
                out += href || txt;
                return;
            }
            // Some other element (e.g. a wrapping span) — recurse.
            for (const c of node.childNodes) walk(c);
        };
        for (const c of el.childNodes) walk(c);
        return out;
    }

    _resolvePopupWin(opts) {
        try {
            if (opts && opts.win) return opts.win;
            const anchor = opts && opts.anchorNode;
            if (anchor && anchor.ownerDocument) {
                const v = anchor.ownerDocument.defaultView;
                if (v) return v.top || v;
            }
        } catch (e) {}
        return Zotero.getMainWindow();
    }

    _getOrCreatePanel(doc) {
        // Standalone reader windows don't get a Weavero stylesheet
        // injection (no onMainWindowLoad hook fires for them), so the
        // popup falls back to default chrome colors and zero padding.
        // Lazy-inject here — first popup-open in a given window pulls
        // in PLUGIN_CSS so the wv-popup-* / wv-link / wv-separator
        // classes resolve.
        try { this.ensureStylesIn(doc); } catch (e) {}
        let panel = doc.getElementById(PANEL_ID);
        if (panel && panel.tagName && panel.tagName.toLowerCase() === "panel") {
            // Old XUL panel from a previous version — replace it.
            try { panel.remove(); } catch(e) {}
            panel = null;
        }
        if (!panel) {
            const ns = "http://www.w3.org/1999/xhtml";
            panel = doc.createElementNS(ns, "div");
            panel.id = PANEL_ID;
            panel.className = "wv-popup-overlay";
            panel.style.cssText = [
                "position: fixed",
                "z-index: 999999",
                "background: var(--material-toolbar, #fafafa)",
                "color: inherit",
                "border: 1px solid rgba(127,127,127,0.45)",
                "border-radius: 6px",
                "box-shadow: 0 4px 18px rgba(0,0,0,0.28)",
                "min-width: 300px; max-width: 520px",
                "max-height: 70vh; overflow: auto",
                "display: none",
            ].join(";");

            // Compatibility shim so existing call sites that still use the
            // XUL-panel API (panel.hidePopup, panel.state) keep working.
            panel.hidePopup = function () {
                if (panel.style.display !== "none") {
                    panel.style.display = "none";
                    Object.defineProperty(panel, "state",
                        { value: "closed", configurable: true, writable: true });
                }
                // Tear down any per-open tracking listeners (set by
                // openCommentPopup when an anchorNode is provided).
                if (panel._wvCleanup) {
                    try { panel._wvCleanup(); } catch (e) {}
                    panel._wvCleanup = null;
                }
            };
            Object.defineProperty(panel, "state",
                { value: "closed", configurable: true, writable: true });

            // Escape closes the popup; only fires when the popup is open.
            doc.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && panel.style.display !== "none") {
                    panel.hidePopup();
                }
            });

            const target = doc.body || doc.documentElement;
            target.appendChild(panel);
        }
        return panel;
    }

    _makeLink(doc, url, panel, label?) {
        const ns = "http://www.w3.org/1999/xhtml";
        const a = doc.createElementNS(ns, "a");
        a.href = url;
        a.textContent = (label != null && label !== "") ? label : url;
        // Hover tooltip showing the full URL — uses the browser's native
        // title-attribute tooltip so the delay and styling match what
        // Zotero shows for URL fields elsewhere in its UI.
        a.title = url;
        a.className = "wv-link " + this._urlLinkClass(url);
        a.addEventListener("click", e => {
            e.preventDefault();
            if (url.startsWith("zotero://")) this.handleZoteroURI(url);
            else this._launchURL(url);
            panel.hidePopup();
        });
        return a;
    }


    /**
     * Render a string as inline-markdown into a DocumentFragment.
     * Supported marks (best-effort, single-pass scanner with recursion for
     * styled spans): [label](url), **bold**, *italic*, ~~strike~~, `code`,
     * plus bare http(s)://, zotero:// URLs (carried through to _makeLink).
     * URLs that get rendered as links are added to `seen` so the caller can
     * avoid duplicating them in the "Additional links" footer.
     */
    _renderInlineMarkdown(text, doc, panel, seen) {
        const ns   = "http://www.w3.org/1999/xhtml";
        const frag = doc.createDocumentFragment();
        if (!text) return frag;
        // Markdown rendering disabled: degrade to plain text + URL spans
        // (the v0.0.78 popup behaviour).
        if (!this._getEnableMarkdown()) {
            const re = new RegExp(this.URL_REGEX.source, "g");
            let last = 0, m;
            while ((m = re.exec(text)) !== null) {
                if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
                const raw   = m[0];
                const url   = raw.replace(this.TRAILING_RE, "");
                const trail = raw.slice(url.length);
                if (seen) seen.add(url);
                frag.appendChild(this._makeLink(doc, url, panel));
                if (trail) frag.appendChild(doc.createTextNode(trail));
                last = m.index + raw.length;
            }
            if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
            return frag;
        }
        // Order matters: longer markers first so **bold** beats *italic*,
        // [label](url) beats bare-URL, etc.
        const TOKEN = new RegExp(
            // 1: link label, 2: link url
            "\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            // 3: bold content
            + "|\\*\\*([\\s\\S]+?)\\*\\*"
            // 4: italic content (require non-space inner boundary so " * 3" doesn't trigger)
            + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
            // 5: strike content
            + "|~~([\\s\\S]+?)~~"
            // 6: code content (double backtick — must come before single)
            + "|``([\\s\\S]+?)``"
            // 7: code content (single backtick)
            + "|`([^`\\n]+?)`"
            // 8: bare URL
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"')\\]]*)",
            "g"
        );
        let last = 0, m;
        while ((m = TOKEN.exec(text)) !== null) {
            if (m.index > last)
                frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
            if (m[1] !== undefined && m[2] !== undefined) {
                const label = m[1];
                const url   = m[2].replace(this.TRAILING_RE, "");
                if (seen) seen.add(url);
                frag.appendChild(this._makeLink(doc, url, panel, label));
            } else if (m[3] !== undefined) {
                const el = doc.createElementNS(ns, "strong");
                el.appendChild(this._renderInlineMarkdown(m[3], doc, panel, seen));
                frag.appendChild(el);
            } else if (m[4] !== undefined) {
                const el = doc.createElementNS(ns, "em");
                el.appendChild(this._renderInlineMarkdown(m[4], doc, panel, seen));
                frag.appendChild(el);
            } else if (m[5] !== undefined) {
                const el = doc.createElementNS(ns, "s");
                el.appendChild(this._renderInlineMarkdown(m[5], doc, panel, seen));
                frag.appendChild(el);
            } else if (m[6] !== undefined) {
                // ``code`` (double backtick).
                const el = doc.createElementNS(ns, "code");
                el.textContent = m[6];
                frag.appendChild(el);
            } else if (m[7] !== undefined) {
                // `code` (single backtick).
                const el = doc.createElementNS(ns, "code");
                el.textContent = m[7];
                frag.appendChild(el);
            } else if (m[8] !== undefined) {
                const raw   = m[8];
                const url   = raw.replace(this.TRAILING_RE, "");
                const trail = raw.slice(url.length);
                if (seen) seen.add(url);
                frag.appendChild(this._makeLink(doc, url, panel));
                if (trail) frag.appendChild(doc.createTextNode(trail));
            }
            last = m.index + m[0].length;
        }
        if (last < text.length)
            frag.appendChild(doc.createTextNode(text.slice(last)));
        return frag;
    }

    _makeCopyBtn(doc, win, url) {
        const ns = "http://www.w3.org/1999/xhtml";
        const btn = doc.createElementNS(ns, "button");
        btn.className = "wv-copy-btn";
        btn.textContent = "Copy";
        btn.title = "Copy URL to clipboard";
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const original = btn.textContent;
            (win.navigator.clipboard
                ? win.navigator.clipboard.writeText(url)
                : Promise.reject()
            ).catch(() => {
                // Fallback for restricted contexts
                const ta = doc.createElementNS(ns, "textarea");
                ta.value = url;
                ta.style.cssText = "position:fixed;opacity:0;";
                doc.documentElement.appendChild(ta);
                ta.focus(); ta.select();
                doc.execCommand("copy");
                ta.remove();
            }).finally(() => {
                btn.textContent = "✓";
                win.setTimeout(() => { btn.textContent = original; }, 1500);
            });
        });
        return btn;
    }

    openCommentPopup(comment, opts: any = {}) {
        if (!comment && !(opts.extraURLs && opts.extraURLs.length)) return;
        const win  = this._resolvePopupWin(opts);
        const doc  = win.document;
        const ns   = "http://www.w3.org/1999/xhtml";
        const norm = this.normalize(String(comment || ""));

        // Toggle: a click on the same anchor that opened the current
        // popup closes it instead of re-opening (matches stock
        // dropdown / popover behaviour).
        const existing = doc.getElementById(PANEL_ID);
        if (existing && existing.style.display === "block"
                && opts.anchorNode
                && existing._wvOpenedFor === opts.anchorNode) {
            try { existing.hidePopup(); }
            catch (e) { existing.style.display = "none"; }
            return;
        }

        const panel = this._getOrCreatePanel(doc);
        while (panel.firstChild) panel.removeChild(panel.firstChild);
        panel._wvOpenedFor = opts.anchorNode || null;

        const container = doc.createElementNS(ns, "div");
        container.className = "wv-popup-container";
        // Give the container a tabindex so the XUL panel always has at
        // least one focusable descendant. Markdown-only comments produce
        // popups with no <a> links and the panel was self-dismissing
        // ~40ms after openPopup with no popupshown event firing.
        container.setAttribute("tabindex", "-1");

        // Render comment text with inline markdown + hyperlinks
        const seen = new Set();
        container.appendChild(this._renderInlineMarkdown(norm, doc, panel, seen));

        // Extra URLs (from <a href> in DOM) not already shown inline
        const extras = (opts.extraURLs || []).filter(u => u && !seen.has(u));
        if (extras.length) {
            const sep = doc.createElementNS(ns, "div");
            sep.className = "wv-separator";
            sep.textContent = "Additional links in comment:";
            container.appendChild(sep);
        }
        for (const url of extras) {
            const row = doc.createElementNS(ns, "div");
            row.className = "wv-extra-row";
            row.appendChild(this._makeLink(doc, url, panel));
            row.appendChild(this._makeCopyBtn(doc, win, url));
            container.appendChild(row);
        }

        panel.appendChild(container);

        try {
            // Show first so we can measure for clamping inside the viewport.
            panel.style.display = "block";
            Object.defineProperty(panel, "state",
                { value: "open", configurable: true, writable: true });

            // Position the overlay. After-start of the anchor (below + left-aligned),
            // clamped to viewport edges with a small margin.
            const margin = 6;
            const vw = (win.innerWidth || doc.documentElement.clientWidth) - margin;
            const vh = (win.innerHeight || doc.documentElement.clientHeight) - margin;
            let left = margin, top = margin;
            // Prefer the rect captured at click-time — the live
            // getBoundingClientRect of opts.anchorNode may be stale if
            // Zotero re-rendered the tree row between click and open.
            // anchorScreen is checked BEFORE anchorNode: callers in
            // iframe contexts (PDF/snapshot readers) pass anchorScreen
            // because anchorNode.getBoundingClientRect() would return
            // iframe-local coords mis-applied to main-window
            // positioning. anchorNode-only is the main-window case.
            if (opts.anchorRect) {
                left = opts.anchorRect.left;
                top  = opts.anchorRect.bottom + 4;
            } else if (opts.anchorScreen) {
                const dx = (typeof win.mozInnerScreenX === "number") ? win.mozInnerScreenX : 0;
                const dy = (typeof win.mozInnerScreenY === "number") ? win.mozInnerScreenY : 0;
                left = opts.anchorScreen.x - dx;
                top  = opts.anchorScreen.y - dy;
            } else if (opts.anchorNode && opts.anchorNode.getBoundingClientRect) {
                const r = opts.anchorNode.getBoundingClientRect();
                if (r.width > 0 || r.height > 0) {
                    left = r.left;
                    top  = r.bottom + 4;
                }
            } else {
                left = 240; top = 200;
            }
            panel.style.left = "0px"; panel.style.top = "0px";
            const measured = panel.getBoundingClientRect();
            const w = measured.width  || 320;
            const h = measured.height || 80;
            if (left + w > vw) left = Math.max(margin, vw - w);
            if (top  + h > vh) top  = Math.max(margin, vh - h);
            panel.style.left = Math.round(left) + "px";
            panel.style.top  = Math.round(top)  + "px";

            this._dbg("[Weavero] openCommentPopup (HTML overlay): pos="
                + Math.round(left) + "," + Math.round(top) + " size=" + Math.round(w) + "x" + Math.round(h)
                + " anchor=" + (opts.anchorNode
                    ? (opts.anchorNode.tagName || "?") + "." + (opts.anchorNode.className || "")
                    : (opts.anchorScreen ? "screen" : "fallback")));

            // Click outside to dismiss — covers all reachable docs
            // (parent windows + nested iframes) so PDF-iframe clicks
            // and main-pane clicks both close the popup.
            try {
                const teardown = this._attachOutsideClickDismiss(
                    panel, doc, win, () => { panel.hidePopup(); teardown(); }
                );
            } catch(err) {
                Zotero.debug("[Weavero] outside-click bind err: " + err);
            }

            // Track the anchor on scroll/zoom so the popup follows the
            // annotation, mirroring Zotero's own annotation popup. Tear
            // down any prior tracking first (popup is reused across
            // opens, so previous open's listeners must be removed).
            if (panel._wvCleanup) {
                try { panel._wvCleanup(); } catch (e) {}
                panel._wvCleanup = null;
            }
            const anchor = opts.anchorNode;
            const anchorWin = anchor && anchor.ownerDocument
                && anchor.ownerDocument.defaultView;
            if (anchor && anchorWin) {
                let scheduled = false;
                const reposition = () => {
                    if (scheduled) return;
                    scheduled = true;
                    win.requestAnimationFrame(() => {
                        scheduled = false;
                        if (panel.style.display === "none") return;
                        if (!anchor.isConnected) {
                            // Anchor was removed (annotation deleted,
                            // page navigated): close the popup.
                            panel.hidePopup();
                            return;
                        }
                        // Recompute screen coords from the live anchor,
                        // mirror the initial-position logic.
                        const sc2 = this._screenCoords(anchor);
                        const dx2 = (typeof win.mozInnerScreenX === "number") ? win.mozInnerScreenX : 0;
                        const dy2 = (typeof win.mozInnerScreenY === "number") ? win.mozInnerScreenY : 0;
                        let nl, nt;
                        if (sc2) {
                            nl = sc2.x - dx2;
                            nt = sc2.y - dy2;
                        } else {
                            const r = anchor.getBoundingClientRect();
                            if (!r.width && !r.height) return;
                            nl = r.left;
                            nt = r.bottom + 4;
                        }
                        const m2 = panel.getBoundingClientRect();
                        const w2 = m2.width  || 320;
                        const h2 = m2.height || 80;
                        if (nl + w2 > vw) nl = Math.max(margin, vw - w2);
                        if (nt + h2 > vh) nt = Math.max(margin, vh - h2);
                        panel.style.left = Math.round(nl) + "px";
                        panel.style.top  = Math.round(nt) + "px";
                    });
                };
                // capture=true catches scrolls in any nested element
                // (e.g. the document scroll inside the inner iframe).
                anchorWin.addEventListener("scroll", reposition, true);
                anchorWin.addEventListener("resize", reposition);
                // Also listen on the main window so a scroll/resize of
                // the Zotero pane shifts the popup correspondingly.
                if (win !== anchorWin) {
                    win.addEventListener("scroll", reposition, true);
                    win.addEventListener("resize", reposition);
                }
                // Snapshot/EPUB readers zoom by setting the CSS custom
                // property `--scale` on the iframe's documentElement
                // (see snapshot-view.ts:_setScale). That's an inline-
                // style mutation, NOT a window resize — so observe
                // style attribute changes directly. PDF reader doesn't
                // hit this path, but the observer is cheap.
                let styleObserver = null;
                try {
                    const anchorDoc = anchor.ownerDocument;
                    if (anchorDoc && anchorDoc.documentElement) {
                        styleObserver = new anchorWin.MutationObserver(reposition);
                        styleObserver.observe(anchorDoc.documentElement, {
                            attributes: true,
                            attributeFilter: ["style"],
                        });
                    }
                } catch (e) {}
                panel._wvCleanup = () => {
                    try { anchorWin.removeEventListener("scroll", reposition, true); } catch (e) {}
                    try { anchorWin.removeEventListener("resize", reposition); } catch (e) {}
                    if (win !== anchorWin) {
                        try { win.removeEventListener("scroll", reposition, true); } catch (e) {}
                        try { win.removeEventListener("resize", reposition); } catch (e) {}
                    }
                    if (styleObserver) {
                        try { styleObserver.disconnect(); } catch (e) {}
                    }
                };
            }
        } catch(err) {
            Zotero.debug("[Weavero] openCommentPopup open err: " + err);
        }
    }

    /** Display-side relations popup. Lists the items the annotation is
     *  related to (read from `dc:relation` triples on the annotation
     *  item) — not editable for now; clicking a row navigates to the
     *  target item in the library, mirroring upstream `relatedBox.js`'s
     *  `_handleShowItem`.
     *
     *  Reuses the same XHTML overlay panel as `openCommentPopup` so
     *  positioning, dismissal, and tracking behaviour stay consistent.
     *  Doesn't reuse openCommentPopup itself because the content is
     *  rendered as a list of clickable item rows, not parsed as
     *  markdown. */
    openRelationsPopup(annotationItem, opts: any = {}) {
        if (!annotationItem) return;
        const win  = this._resolvePopupWin(opts);
        const doc  = win.document;
        const ns   = "http://www.w3.org/1999/xhtml";

        // Toggle on re-click of the same anchor (mirror of openCommentPopup).
        const existing = doc.getElementById(PANEL_ID);
        if (existing && existing.style.display === "block"
                && opts.anchorNode
                && existing._wvOpenedFor === opts.anchorNode) {
            try { existing.hidePopup(); }
            catch (e) { existing.style.display = "none"; }
            return;
        }

        const items = this._getAnnotationRelatedItems(annotationItem);

        const panel = this._getOrCreatePanel(doc);
        while (panel.firstChild) panel.removeChild(panel.firstChild);
        panel._wvOpenedFor = opts.anchorNode || null;

        const container = doc.createElementNS(ns, "div");
        // `wv-relations-popup` modifier — gives this popup the look of
        // the item pane's "Related" section (count header + a "+" add
        // button + a tight list of icon-titled rows) rather than the
        // comment / link popup's prose-card look, so the two are easy
        // to tell apart. No collapse caret (it's a popup, not a
        // collapsible pane section).
        container.className = "wv-popup-container wv-relations-popup";
        container.setAttribute("tabindex", "-1");

        // Header: [related icon]  "<N> Related"  +  "+" (add related item).
        const header = doc.createElementNS(ns, "div") as any;
        header.className = "wv-relations-header";
        let headIcon: any = null;
        try {
            headIcon = this._makeRelationsSvg(doc);
            headIcon.classList.add("wv-relations-header-icon");
            headIcon.setAttribute("aria-hidden", "true");
            header.appendChild(headIcon);
        } catch (e) {}
        const headTitle = doc.createElementNS(ns, "span") as any;
        headTitle.className = "wv-relations-header-title";
        headTitle.textContent = items.length + " Related";
        header.appendChild(headTitle);
        const addBtn = doc.createElementNS(ns, "span") as any;
        addBtn.className = "wv-relations-add";
        addBtn.setAttribute("role", "button");
        addBtn.setAttribute("tabindex", "0");
        addBtn.setAttribute("aria-label", "Add related item");
        addBtn.title = "Add related item…";
        // Inline plus.svg (same glyph as the item-pane "Related" add button).
        // Fall back to a text "+" only if the SVG build throws.
        try { addBtn.appendChild(this._makePlusSvg(doc)); }
        catch (e) { addBtn.textContent = "+"; }
        const doAdd = (e) => {
            try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
            try { panel.style.display = "none"; } catch (er) {}
            const w = Zotero.getMainWindow();
            const st = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
            st(() => {
                try {
                    this._addRelatedItemDialog([annotationItem])
                        .catch((err) => Zotero.debug("[Weavero] rel-popup add err: " + err));
                } catch (er) { Zotero.debug("[Weavero] rel-popup add err: " + er); }
            }, 0);
        };
        addBtn.addEventListener("click", doAdd);
        addBtn.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") doAdd(e);
        });
        header.appendChild(addBtn);
        container.appendChild(header);

        const list = doc.createElementNS(ns, "div");
        list.className = "wv-relations-list";
        if (!items.length) {
            const empty = doc.createElementNS(ns, "div");
            empty.className = "wv-rel-empty";
            empty.textContent = "No related items.";
            list.appendChild(empty);
        }
        for (const item of items) {
            const row = doc.createElementNS(ns, "div");
            row.className = "wv-rel-row";
            row.setAttribute("role", "button");
            row.setAttribute("tabindex", "0");
            row.title = "Open in library";

            // Type icon. Zotero stores annotation icons in the
            // `universal` colour folder
            // (`chrome://zotero/skin/16/universal/annotate-<type>.svg`),
            // and item-type icons under
            // `chrome://zotero/skin/item-type/16/<light|dark>/<kebab>.svg`.
            // Use <img src=...> directly rather than Zotero's
            // CSS-driven `.icon-css.icon-item-type[data-item-type=...]`
            // pattern — those rules live in zotero.css inside a
            // `.focus-states-target .row` scope (item-tree contexts),
            // so they don't apply inside our popup. Worse, in a
            // STANDALONE reader window, zotero.css isn't loaded at all,
            // so the icon would be invisible. Direct <img src> works
            // in any chrome window with no dependency on stylesheet
            // load order.
            let iconEl;
            try {
                if (item.isAnnotation && item.isAnnotation()) {
                    const t = item.annotationType || "highlight";
                    const aType = (t === "image") ? "area" : t;
                    const url = "chrome://zotero/skin/16/universal/annotate-"
                        + aType + ".svg";
                    iconEl = this._makeChromeIcon(doc, url,
                        "annotation-icon wv-rel-icon");
                    if (item.annotationColor) {
                        iconEl.style.fill = item.annotationColor;
                    }
                } else {
                    const name = (typeof item.getItemTypeIconName === "function")
                        ? item.getItemTypeIconName(true)
                        : "document";
                    iconEl = this._makeItemTypeIcon(doc, win, name);
                }
            } catch (e) {
                iconEl = this._makeItemTypeIcon(doc, win, "document");
            }

            const titleEl = doc.createElementNS(ns, "span");
            titleEl.className = "wv-rel-title";
            let titleText = "(untitled)";
            try { titleText = item.getDisplayTitle() || "(untitled)"; }
            catch (e) {}
            // Render URLs / markdown inside the related-item title (a
            // related annotation's title IS its comment text, which may
            // contain links). Uses the same unified renderer as every
            // other surface so a URL there gets styled. Tree mode
            // (markdown markers stripped). Wrapped in try/catch so a
            // render hiccup degrades to plain text rather than aborting
            // the whole popup build.
            try {
                const useMdTitle = this._getEnableCommentMarkdown();
                titleEl.appendChild(this._buildCommentFragment(titleText, {
                    doc, useMd: useMdTitle, isTreeMode: true,
                }));
            } catch (e) {
                titleEl.textContent = titleText;
            }

            row.appendChild(iconEl);
            row.appendChild(titleEl);

            const onActivate = async (e) => {
                // Click inside a url-span in the title: open that URL
                // instead of navigating to the related item.
                try {
                    const sp = e.target && e.target.closest
                        && e.target.closest(".wv-url-span");
                    if (sp) {
                        e.stopPropagation();
                        e.preventDefault();
                        const u = sp.getAttribute("data-href")
                            || sp.textContent || "";
                        if (u) {
                            if (u.startsWith("zotero://")) this.handleZoteroURI(u);
                            else this._launchURL(u);
                        }
                        try { panel.style.display = "none"; } catch (er) {}
                        return;
                    }
                } catch (er) {}
                e.stopPropagation();
                e.preventDefault();
                let opened = false;
                try {
                    if (item && item.isAnnotation && item.isAnnotation()) {
                        opened = await this._openAnnotationInReader(item);
                    }
                } catch (err) {
                    Zotero.debug("[Weavero] rel-popup activate err: " + err);
                }
                if (!opened) this._navigateToItem(item);
                try { panel.style.display = "none"; } catch (err) {}
            };
            row.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Intentionally keep the relations popup OPEN under
                // the context menu — the user is choosing how to open
                // THIS row's item; closing the popup discards their
                // place in the relations list.
                this._openRelatedItemContextMenu(item, e.screenX, e.screenY);
            });
            row.addEventListener("click", onActivate);
            row.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") onActivate(e);
            });

            list.appendChild(row);
        }
        container.appendChild(list);
        panel.appendChild(container);

        try {
            panel.style.display = "block";
            Object.defineProperty(panel, "state",
                { value: "open", configurable: true, writable: true });

            const margin = 6;
            const vw = (win.innerWidth || doc.documentElement.clientWidth) - margin;
            const vh = (win.innerHeight || doc.documentElement.clientHeight) - margin;
            let left = margin, top = margin;
            if (opts.anchorScreen) {
                const dx = (typeof win.mozInnerScreenX === "number") ? win.mozInnerScreenX : 0;
                const dy = (typeof win.mozInnerScreenY === "number") ? win.mozInnerScreenY : 0;
                left = opts.anchorScreen.x - dx;
                top  = opts.anchorScreen.y - dy;
            } else if (opts.anchorNode && opts.anchorNode.getBoundingClientRect) {
                const r = opts.anchorNode.getBoundingClientRect();
                if (r.width > 0 || r.height > 0) {
                    left = r.left;
                    top  = r.bottom + 4;
                }
            } else {
                left = 240; top = 200;
            }
            panel.style.left = "0px"; panel.style.top = "0px";
            const measured = panel.getBoundingClientRect();
            const w = measured.width  || 320;
            const h = measured.height || 80;
            if (left + w > vw) left = Math.max(margin, vw - w);
            if (top  + h > vh) top  = Math.max(margin, vh - h);
            panel.style.left = Math.round(left) + "px";
            panel.style.top  = Math.round(top)  + "px";

            // Click-outside dismiss — same multi-doc helper as
            // openCommentPopup, so PDF-iframe and main-pane clicks
            // both close the relations popup.
            const teardown = this._attachOutsideClickDismiss(
                panel, doc, win, () => { panel.style.display = "none"; teardown(); }
            );
        } catch (err) {
            Zotero.debug("[Weavero] openRelationsPopup open err: " + err);
        }
    }

    // ---- Reader sidebar button --------------------------------------------

    /** One-line summary of an element for debug logs — tag, id, classes,
     *  child count, first 40 chars of textContent. Tolerant to nullish. */
    _elSummary(el) {
        if (!el) return "(null)";
        const tag = (el.tagName || "?").toLowerCase();
        const id = el.id ? "#" + el.id : "";
        const cls = el.className && typeof el.className === "string"
            ? "." + el.className.replace(/\s+/g, ".")
            : "";
        const kids = el.children ? "[" + el.children.length + "ch]" : "";
        const txt = el.textContent ? JSON.stringify(String(el.textContent).slice(0, 40)) : "";
        return tag + id + cls + kids + " " + txt;
    }

    /** PLUGIN_CSS lives in the main Zotero doc, but the reader's outer
     *  iframe is its own document. Inject the URL/relations/markdown
     *  styling there too so sidebar buttons inherit the same look. */
    _ensureReaderOuterStyles(doc) {
        if (!doc) return;
        // Defensive remove-then-add: a previous plugin instance's style
        // element can survive destroy() (Zotero's disable/enable flow
        // doesn't always tear down DOM artifacts cleanly). An early-return
        // guard would leave the old version's CSS in force after re-enable
        // and the new code's preview-panel rules would never apply, which
        // shows up as a mix of correctly-rendered and unstyled comments
        // in the reader sidebar after the user toggles the plugin off/on.
        const existing = doc.getElementById("weavero-reader-outer-styles");
        if (existing) existing.remove();
        const s = doc.createElement("style");
        s.id = "weavero-reader-outer-styles";
        s.textContent =
            // Preview-panel CSS (v0.0.106). The sidebar comments live in
            // this outer reader iframe, so the visibility-swap rules need
            // to be present here too. URL-span colors and md-text styles
            // are inherited from the same global classes used in the main
            // doc. We restate them as a defensive duplicate because the
            // outer iframe has its own document and may not see the main
            // stylesheet.
            ".wv-md-preview {"
            + "  font: inherit; color: inherit; line-height: inherit;"
            + "  white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"
            + "}"
            + ".comment.wv-comment-preview .content { display: none; }"
            + ".comment.wv-comment-preview .wv-md-preview {"
            + "  display: -webkit-box;"
            + "  -webkit-box-orient: vertical;"
            + "  -webkit-line-clamp: var(--wv-preview-line-clamp, 3);"
            + "  overflow: hidden;"
            + "}"
            // Lift the truncation when the row is selected — Zotero
            // applies the `selected` class to the .annotation div on
            // click (mirrors its own expand-on-click behaviour).
            + ".annotation.selected .wv-md-preview { -webkit-line-clamp: unset; }"
            + ".annotation-popup .wv-md-preview { -webkit-line-clamp: unset; }"
            // Hide the overflow-only icon when the row is selected
            // (clamp lifted, full content shown inline).
            + ".annotation.selected .wv-btn-sidebar[data-wv-icon-reason='overflow'] { display: none; }"
            // Sidebar-button layout: URL-only buttons (no .wv-format-md
            // class) inherit a default display:block from somewhere in
            // Zotero's iframe styles, which pushes them onto their own
            // line below the header strip and out of view. Force the
            // same inline-flex layout the .wv-format-md rule uses, so
            // URL-only and format-md sidebar icons sit next to the kebab
            // identically.
            // Reader-side icons (sidebar header + in-PDF popup
            // header) — boxless. The buttons are <button> elements
            // so browser-default chrome (gray fill, beveled border,
            // padding) needs to be explicitly reset. Layout forces
            // inline-flex so the icon sits alongside the kebab
            // instead of wrapping below the header strip. Markdown-
            // bearing icons still get the amber disc via the
            // .wv-format-md rule below (with !important).
            + ".wv-btn.wv-btn-sidebar,"
            + ".wv-btn.wv-btn-popup {"
            + "  display: inline-flex !important;"
            + "  align-items: center;"
            + "  justify-content: center;"
            + "  flex-shrink: 0;"
            + "  line-height: 1;"
            + "  font-size: 11px;"
            + "  opacity: 1;"
            + "  background: transparent; border: none;"
            + "  padding: 1px 3px; border-radius: 3px;"
            + "  transition: background 0.15s;"
            + "}"
            + ".wv-btn.wv-btn-sidebar:hover,"
            + ".wv-btn.wv-btn-popup:hover {"
            + "  background: rgba(0, 0, 0, 0.07);"
            + "}"
            + ":root.wv-ui-dark .wv-btn.wv-btn-sidebar:hover,"
            + ":root.wv-ui-dark .wv-btn.wv-btn-popup:hover {"
            + "  background: rgba(255, 255, 255, 0.08);"
            + "}"
            // Amber-disc hover ring (type-2 / type-3 icons), same
            + ".comment.wv-comment-preview.wv-editing .content { display: block; }"
            + ".comment.wv-comment-preview.wv-editing .wv-md-preview { display: none; }"
            + ".wv-md-bold { font-weight: 700; }"
            + ".wv-md-italic { font-style: italic; }"
            + ".wv-md-strike { text-decoration: line-through; opacity: 0.85; }"
            + ".wv-md-code {"
            + "  font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace;"
            + "  font-size: 92%; padding: 0 3px; border-radius: 3px;"
            + "  background: rgba(127,127,127,0.15);"
            + "}"
            + ":root { --wv-link-http: #1a73e8;"
            +   " --wv-link-zotero: #8b4513; --wv-link-app: #9333ea; }"
            + ":root.wv-ui-dark { --wv-link-http: #8ab4f8;"
            +   " --wv-link-zotero: #cd853f; --wv-link-app: #c084fc; }"
            + ".wv-url-span { cursor: pointer !important; }"
            + ".wv-url-span.wv-link-http   { color: var(--wv-link-http); }"
            + ".wv-url-span.wv-link-zotero { color: var(--wv-link-zotero); }"
            + ".wv-url-span.wv-link-app    { color: var(--wv-link-app); }"
            + ".wv-link { cursor: pointer !important; }"
            + ".wv-link-svg {"
            + "  width: 1em; height: 1em; display: block; flex-shrink: 0;"
            + "}"
            // Annotation-header relations icon + side-by-side icon
            // group (mirrors PLUGIN_CSS — see the rationale there).
            + ".wv-icon-group {"
            + "  display: inline-flex; align-items: center; gap: 2px;"
            + "  flex-shrink: 0;"
            + "}"
            + ".wv-btn-relations { color: #7a4a00; }"
            + ".wv-btn-relations .wv-relations-svg {"
            + "  width: 14px; height: 14px; display: block; flex-shrink: 0;"
            + "}"
            + ":root.wv-ui-dark .wv-btn-relations { color: #ffb84d; }"
            + "";
        (doc.head || doc.documentElement).appendChild(s);
    }

    // Was `_sidebarHandler = (event) => { ... }` — an arrow-function
    // class field. Moved into the WeaveroPlugin constructor as a
    // bound shim that delegates here, since field initializers don't
    // survive the prototype-mixin lift. Call sites still use
    // `this._sidebarHandler` (the bound shim); body unchanged.
    _sidebarHandlerImpl(event) {
        if (!this._getEnableReaderSidebar()) return;
        const { doc, append, params, reader } = event;
        const cmt = params.annotation.comment || "";
        const ns = "http://www.w3.org/1999/xhtml";

        // Always inject the reader-iframe CSS up front. Both the
        // comment icon and the relations icon depend on it, and we
        // can't predict which (if any) will be appended without
        // running the per-icon checks below.
        try { this._ensureReaderOuterStyles(doc); } catch(e) {}

        // Build a single wrapper so multiple icons sit side-by-side.
        // Zotero's CustomSections wraps each `append()` call in its own
        // `<div class="section">`, and the parent `.custom-sections` is
        // block-level — so calling append() once per icon stacks the
        // icons vertically. We bundle everything into one container and
        // make a single append() call instead.
        //
        // Order policy: when BOTH icons apply the relations icon goes
        // LAST (rightmost of our icons, closest to the kebab/⋯ menu).
        // Rationale: relations is the closer analog to a native Zotero
        // feature, so it sits adjacent to the native menu button; the
        // comment icon is a Weavero-specific affordance and sits to
        // its left.
        const group = doc.createElementNS(ns, "span");
        group.className = "wv-icon-group";
        let appended = 0;

        // --- Comment icon (chain / amber-disc) ------------------------------
        // Only emitted when there's something the icon should reveal that
        // isn't already rendered inline by the preview panel.
        if (this._iconWantedFor(cmt) && this._iconAddsValueBeyondInline(cmt)) {
            const btn = doc.createElementNS(ns, "button");
            btn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS;
            this._applyIconState(btn, cmt);
            btn.addEventListener("click", e => {
                e.stopPropagation(); e.preventDefault();
                // Always pass anchorNode (so the popup can track it on
                // scroll/zoom). Pass anchorScreen too when available — the
                // button is in the reader's outer iframe, and the popup
                // lives in the main window, so screen coords are needed
                // for accurate initial placement.
                const sc = this._screenCoords(e.currentTarget);
                this.openCommentPopup(cmt, {
                    anchorNode: e.currentTarget,
                    ...(sc ? { anchorScreen: sc } : {}),
                });
            });
            group.appendChild(btn);
            appended++;
        }

        // --- Relations icon -------------------------------------------------
        // Surface the annotation's `dc:relation` triples (set from any
        // other item's "Related" pane that points at this annotation).
        // Independent of comment content: an annotation with no comment
        // can still have related items.
        //
        // Idempotent: if a re-inject pass already added a relations
        // button to this row (via _reinjectSidebarButtons, which lands
        // adjacent to but outside `.custom-sections`), skip — React's
        // clear-on-render cleanup only touches `.custom-sections`, so
        // duplicating here would visibly stack two icons.
        try {
            const lib = this.libraryIDFromReader(reader);
            const annKey = params.annotation && params.annotation.id;
            const ann = this._getAnnotationItem(lib, annKey);
            const related = this._getAnnotationRelatedItems(ann);
            const row = annKey
                ? doc.querySelector(
                    "[data-sidebar-annotation-id=\"" + annKey + "\"]")
                : null;
            const alreadyHasRelBtn = row
                && row.querySelector(".wv-btn-relations");
            if (related.length && !alreadyHasRelBtn) {
                const relBtn = doc.createElementNS(ns, "button");
                relBtn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS
                    + " wv-btn-relations";
                relBtn.title = related.length + " Related";
                relBtn.appendChild(this._makeRelationsSvg(doc));
                relBtn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(e.currentTarget);
                    this.openRelationsPopup(ann, {
                        anchorNode: e.currentTarget,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                group.appendChild(relBtn);
                appended++;
            }
        } catch (e) {
            Zotero.debug("[Weavero] sidebar relations icon err: " + e.message);
        }

        if (appended) append(group);
    }

    // ---- Reader context menu ----------------------------------------------

    // See _sidebarHandlerImpl — same arrow-field-to-method transform.
    _contextHandlerImpl(event) {
        const { append, params, reader } = event;
        const ids = params.ids || [];
        const lib = this.libraryIDFromReader(reader);
        // Diagnostic — confirms the event fires and shows what's in
        // params. Only logs when the debug pref is on.
        this._dbg("[Weavero] _contextHandler fire: ids="
            + JSON.stringify(ids) + " currentID=" + (params.currentID || "")
            + " lib=" + lib);
        if (!ids.length) return;
        const key = params.currentID || ids[0];

        // Each `append({...})` call crosses the reader-iframe ↔ chrome
        // compartment boundary, so the captured environment of any
        // `onCommand` closure must be primitives (strings, numbers).
        // Capturing XPCOM objects (e.g. a Zotero.Item array) trips a
        // "Permission denied to pass object to privileged code" check
        // inside upstream `appendCustomItemGroups`, which propagates
        // back through dispatchEvent and halts our handler — silently
        // dropping every menu item beyond the offending append.
        // Wrapping each call in its own try/catch is a safety net so
        // a future regression in one entry can't take out the others.

        // "Add related item…" — independent of comment content, gated
        // only on the annotation existing. The same
        // `createAnnotationContextMenu` path fires for both right-click
        // on an annotation AND the 3-dots ("more") button in the
        // sidebar header, so this single entry covers both.
        //
        // Resolve once now (so we know whether to show the entry and
        // what label to use), but capture only the primitive keys +
        // libraryID in the closure. Re-resolve to live items at click
        // time. This avoids the cross-compartment trap that broke
        // v0.3.7's version of this entry — that one captured the
        // resolved Zotero.Item array and threw on every menu open.
        const annKeys = [];
        for (const id of ids) {
            const ann = this._getAnnotationItem(lib, id);
            if (ann) annKeys.push(ann.key);
        }
        this._dbg("[Weavero] _contextHandler resolved " + annKeys.length
            + "/" + ids.length + " annotation item(s)");
        if (annKeys.length) {
            const capturedLib  = lib;
            const capturedKeys = annKeys.slice();
            // Capture `self` instead of relying on `this` inside the
            // closures: upstream Zotero clones our menu item objects via
            // `Components.utils.cloneInto(..., { cloneFunctions: true })`
            // when forwarding into the reader iframe, and although the
            // cloned function still executes in chrome when invoked,
            // resolving `this` through the cloned reflector has been
            // observed to crash the process. A direct named binding
            // sidesteps that path entirely. The captured env of every
            // `onCommand` must otherwise be primitives (the `params.ids`
            // → keys + libraryID), re-resolved to live items at click
            // time — capturing a Zotero.Item array here trips a
            // "Permission denied" check inside `appendCustomItemGroups`.
            const self = this;

            // Build all the Weavero entries up front, then `append` them
            // in ONE call: the reader's `append(...items)` pushes a
            // single item group, so they render as one section (with a
            // separator above, none inside) — the same layout as the
            // items-list right-click menu. Order matches it too:
            // Copy Select Link → Copy Open Link → Add Related….
            // The `createAnnotationContextMenu` event fires for both an
            // in-PDF right-click and the sidebar 3-dots ("more") button,
            // so this covers both reader surfaces, and (like the
            // items-list menu) it operates on every selected annotation.
            const items: any[] = [];
            if (self._getEnableCopyItemLink()) {
                items.push({
                    label: capturedKeys.length > 1
                        ? "Copy Select Links  (" + capturedKeys.length + " annotations)"
                        : "Copy Select Link",
                    onCommand: () => {
                        try {
                            const fresh = capturedKeys
                                .map(k => self._getAnnotationItem(capturedLib, k))
                                .filter(Boolean);
                            if (fresh.length) self._copyItemLinks(fresh, "select");
                        } catch (e) {
                            Zotero.debug("[Weavero] reader copy-select err: " + e);
                        }
                    },
                });
                // An annotation always lives on a file attachment, so an
                // open link normally applies — but verify per item so a
                // detached / orphaned annotation can't break the entry.
                let openCount = 0;
                try {
                    openCount = capturedKeys
                        .map(k => self._getAnnotationItem(capturedLib, k))
                        .filter(a => a && self._buildOpenLink(a)).length;
                } catch (e) {}
                if (openCount > 0) {
                    items.push({
                        label: openCount > 1
                            ? "Copy Open Links  (" + openCount + " annotations)"
                            : "Copy Open Link",
                        onCommand: () => {
                            try {
                                const fresh = capturedKeys
                                    .map(k => self._getAnnotationItem(capturedLib, k))
                                    .filter(Boolean);
                                if (fresh.length) self._copyItemLinks(fresh, "open");
                            } catch (e) {
                                Zotero.debug("[Weavero] reader copy-open err: " + e);
                            }
                        },
                    });
                }
            }
            items.push({
                label: annKeys.length > 1
                    ? "Add Related…  (" + annKeys.length + " annotations)"
                    : "Add Related…",
                onCommand: () => {
                    // Defer to next tick so the context menu fully
                    // closes / unwinds in the reader iframe before we
                    // open a new chrome dialog. Opening a modal-ish
                    // dialog while the menu is still tearing down has
                    // been the trigger of native crashes when
                    // chrome/iframe lifetimes overlap.
                    const win = Zotero.getMainWindow();
                    const setTimeoutFn = win && win.setTimeout
                        ? win.setTimeout.bind(win)
                        : setTimeout;
                    setTimeoutFn(() => {
                        try {
                            const fresh = capturedKeys
                                .map(k => self._getAnnotationItem(capturedLib, k))
                                .filter(Boolean);
                            Zotero.debug(
                                "[Weavero] add-related onCommand: resolved "
                                + fresh.length + "/" + capturedKeys.length
                                + " item(s) at click time");
                            if (!fresh.length) return;
                            self._addRelatedItemDialog(fresh)
                                .catch(err => Zotero.debug(
                                    "[Weavero] _addRelatedItemDialog rejected: " + err));
                        } catch (innerErr) {
                            Zotero.debug(
                                "[Weavero] add-related onCommand deferred err: " + innerErr);
                        }
                    }, 0);
                },
            });
            try { append(...items); }
            catch (e) { Zotero.debug("[Weavero] _contextHandler append err: " + e); }
        }
    }

    /** `createViewContextMenu` listener — right-click anywhere in the
     *  reader's view. Adds a single copy-link entry whose target depends
     *  on the reader type:
     *
     *  - **PDF** → "Copy Link to This Page" →
     *    `zotero://open/<lib>/items/<key>?page=<N>`, N = the 1-based
     *    number of the page that was *clicked*, resolved in order from:
     *    `params.position.pageIndex` (set when the click landed on text —
     *    works in spread / continuous-scroll layouts), the `.page:hover`
     *    element in the PDF.js viewer (clicks on a figure / blank margin
     *    of a non-topmost page), and finally `primaryViewStats.pageIndex`
     *    (the viewport-top page). The handler does `pageIndex = N - 1`.
     *  - **EPUB / snapshot** (DOM-based readers) →
     *    `zotero://open/<lib>/items/<key>?cfi=<cfi>` (EPUB) or
     *    `?sel=<cssSelector>` (snapshot), from `params.position`:
     *      • text selected → "Copy Link to Selected Text", a range CFI
     *        covering exactly the selection (following it flashes just
     *        that passage);
     *      • no selection → "Copy Link to This Location" — the clicked
     *        element's position, with a range CFI **collapsed to its
     *        start point** (`_collapseEpubCfiToStart`) so the link just
     *        scrolls there rather than flashing the whole element;
     *      • EPUB with no usable clicked position → the view's current
     *        reading-position CFI (`primaryViewState.cfi`, already a
     *        point).
     *    (A PDF can't carry a sub-page selection in the URL — there's no
     *    `?rects=` param yet, zotero/zotero#4508 — so on PDF the entry
     *    stays page-level even with text selected.) Unsupported reader
     *    types are skipped.
     *
     *  Gated on the same Copy-Item-Link pref as Weavero's other copy-link
     *  affordances (the tab menu, the items list, the annotation context
     *  menu).
     *
     *  Compartment caveat (same as `_contextHandlerImpl`): the
     *  `onCommand` closure may be `Components.utils.cloneInto`'d into
     *  the reader iframe with `cloneFunctions: true`, so it captures
     *  only the finished link string — a primitive — and no XPCOM
     *  object. (The context menu closes on click, so the visible page
     *  can't change between menu-open and command, hence pre-computing
     *  the link is fine.)
     *
     *  The Weavero glyph in front of the entry is added DOM-side:
     *  Zotero's reader context-menu renderer (`Reader._openContextMenu`)
     *  only honours a `color` swatch on appended items, not an arbitrary
     *  icon — so we attach a one-shot `popupshowing` listener to the
     *  reader window's popupset, find our menuitem by label when the
     *  menu renders, and turn it `menuitem-iconic` with the Weavero
     *  icon. Self-cleaning (removed once stamped, or after a backstop
     *  timeout); a no-op on anything unexpected.
     *
     *  See `_sidebarHandlerImpl` for why this is a plain method invoked
     *  through a bound shim (`this._viewContextHandler`, set in the
     *  constructor) rather than an arrow-function class field. */
    _viewContextHandlerImpl(event) {
        try {
            const { append, reader } = event || {};
            if (typeof append !== "function") return;
            // Bookmark menu items (current position / selection) — independent
            // of the copy-link pref.
            try { this._wvReaderViewContextMenu(event); } catch (e) {}
            if (!this._getEnableCopyItemLink()) return;
            if (!reader) return;
            const att = (reader.itemID && Zotero.Items.get(reader.itemID)) || null;
            if (!this._isOpenableFileAttachment(att)) return;
            const linkBase = "zotero://open/" + this._zoteroLibPrefix(att.libraryID)
                + "/items/" + att.key;

            let MENU_LABEL: string;
            let capturedLink: string;

            if (reader.type === "pdf") {
                // Which page did the user actually right-click on?
                //   1. params.position.pageIndex — the reader resolves the
                //      word (or selectable overlay) under the cursor; works
                //      in spread / continuous-scroll layouts. Most clicks in
                //      a typical document land on text, so this is the usual
                //      path.
                //   2. The .page:hover element in the PDF.js viewer — when
                //      the menu opens the pointer stops moving, so the page
                //      under the cursor is still in :hover. Covers clicks on
                //      a figure / blank margin of a non-topmost page.
                //   3. Fallback: the reader's "current" page (viewport top).
                let pageIndex: number | null = null;
                try {
                    const p = event && event.params;
                    const pos = p && (p.position || (p.overlay && p.overlay.position));
                    if (pos && Number.isInteger(pos.pageIndex) && pos.pageIndex >= 0) {
                        pageIndex = pos.pageIndex;
                    }
                } catch (e) {}
                if (pageIndex == null) {
                    try {
                        const cached = this._readerObservers && this._readerObservers.get(reader);
                        const innerDoc = (cached && cached.innerDoc)
                            || (reader._iframeWindow && reader._iframeWindow.document);
                        const hovered = innerDoc && innerDoc.querySelector
                            && innerDoc.querySelector(".page:hover");
                        const pageDiv = hovered
                            && (hovered.matches && hovered.matches(".page")
                                ? hovered
                                : (hovered.closest && hovered.closest(".page")));
                        const n = pageDiv && parseInt(pageDiv.getAttribute("data-page-number"), 10);
                        if (Number.isInteger(n) && n >= 1) pageIndex = n - 1;
                    } catch (e) {}
                }
                if (pageIndex == null) {
                    try {
                        const stats = reader._internalReader
                            && reader._internalReader._state
                            && reader._internalReader._state.primaryViewStats;
                        if (stats && Number.isInteger(stats.pageIndex) && stats.pageIndex >= 0) {
                            pageIndex = stats.pageIndex;
                        }
                    } catch (e) {}
                }
                if (pageIndex == null) pageIndex = 0;
                MENU_LABEL = "Copy Link to This Page";
                capturedLink = linkBase + "?page=" + (pageIndex + 1);
            }
            else if (reader.type === "epub" || reader.type === "snapshot") {
                // DOM-based readers: params.position describes the
                // right-clicked element — or, when text is selected, the
                // *selection's* range. It's a FragmentSelector (EPUB → an
                // `epubcfi(...)` value; a range CFI for a selection) or a
                // CssSelector (snapshots). The `zotero://open` handler
                // accepts `?cfi=` / `?sel=` respectively.
                //
                // Following such a link makes the reader flash whatever the
                // CFI/selector resolves to. For a *selection* link we want
                // that — it highlights exactly what you selected (no more).
                // For a *"this location"* link (no selection) the position
                // is the whole clicked element's contents, which on a
                // coarsely-marked-up EPUB can be a big block — so we
                // collapse a "this location" range CFI to its **start
                // point**, so the link just scrolls there with no big flash.
                let rawVal: string | null = null;
                let kind: "cfi" | "sel" | null = null;
                let fromClickedPosition = false;
                try {
                    const pos = event && event.params && event.params.position;
                    const val = (pos && typeof pos.value === "string" && pos.value) ? pos.value : null;
                    if (val) {
                        if (pos.type === "FragmentSelector") { rawVal = val; kind = "cfi"; fromClickedPosition = true; }
                        else if (pos.type === "CssSelector") { rawVal = val; kind = "sel"; fromClickedPosition = true; }
                    }
                } catch (e) {}
                let hasSelection = false;
                try {
                    const sst = reader._internalReader && reader._internalReader._state;
                    hasSelection = !!(sst && (sst.primaryViewSelectionPopup || sst.secondaryViewSelectionPopup));
                } catch (e) {}
                const isSelectionLink = hasSelection && fromClickedPosition;
                if (!rawVal && reader.type === "epub") {
                    // No usable clicked position → the view's current
                    // reading-position CFI (already a point, not a range).
                    try {
                        const cfi0 = reader._internalReader
                            && reader._internalReader._state
                            && reader._internalReader._state.primaryViewState
                            && reader._internalReader._state.primaryViewState.cfi;
                        if (typeof cfi0 === "string" && cfi0) {
                            rawVal = /^epubcfi\(/.test(cfi0) ? cfi0 : ("epubcfi(" + cfi0 + ")");
                            kind = "cfi";
                            // fromClickedPosition stays false → not a selection link
                        }
                    } catch (e) {}
                }
                if (!rawVal || !kind) return;   // nothing concrete to point at
                if (!isSelectionLink && kind === "cfi") {
                    rawVal = this._collapseEpubCfiToStart(rawVal);
                }
                const q = (kind === "cfi" ? "?cfi=" : "?sel=") + encodeURIComponent(rawVal);
                MENU_LABEL = isSelectionLink ? "Copy Link to Selected Text" : "Copy Link to This Location";
                capturedLink = linkBase + q;
            }
            else {
                return;   // unsupported reader type
            }

            try {
                append({
                    label: MENU_LABEL,
                    onCommand: () => {
                        try { Zotero.Utilities.Internal.copyTextToClipboard(capturedLink); }
                        catch (e) { Zotero.debug("[Weavero] copy reader-location link err: " + e); }
                    },
                });
            } catch (e) {
                Zotero.debug("[Weavero] _viewContextHandler append err: " + e);
            }

            // Stamp the Weavero glyph onto the entry once the popup renders.
            try {
                const win = reader._window;
                const ps  = reader._popupset;
                const iconURL = this._menuItemIconURL;
                if (win && ps && typeof ps.addEventListener === "function" && iconURL) {
                    const st = (win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
                    const ct = (win.clearTimeout) ? win.clearTimeout.bind(win) : clearTimeout;
                    let timer: any = null;
                    const onShow = (ev) => {
                        let stamped = false;
                        try {
                            const popup = ev && ev.target;
                            const mi = popup && popup.querySelector
                                && popup.querySelector('menuitem[label="' + MENU_LABEL + '"]');
                            if (mi) {
                                mi.classList.add("menuitem-iconic");
                                mi.setAttribute("image", iconURL);
                                stamped = true;
                            }
                            // not ours — leave the listener for the next popup
                        } catch (e) { stamped = true; }   // on error, stop rather than retry
                        if (stamped) {
                            try { ps.removeEventListener("popupshowing", onShow, true); } catch (e) {}
                            if (timer != null) { try { ct(timer); } catch (e) {} timer = null; }
                        }
                    };
                    ps.addEventListener("popupshowing", onShow, true);
                    timer = st(() => {
                        try { ps.removeEventListener("popupshowing", onShow, true); } catch (e) {}
                        timer = null;
                    }, 3000);
                }
            } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _viewContextHandler err: " + e);
        }
    }

    /** Collapse an EPUB *range* CFI `epubcfi(A,B,C)` (common-parent path A,
     *  start subpath B, end subpath C) to a *point* CFI `epubcfi(AB)` — the
     *  start of the range. Used so a "Copy Link to This Location" link
     *  (which derives from the whole clicked element's contents) just
     *  scrolls to that spot instead of making the reader flash the entire
     *  element. Splits on top-level commas only (commas inside `[…]` text
     *  assertions are left alone). A non-range CFI (no top-level commas, or
     *  anything unparseable) is returned unchanged. */
    _collapseEpubCfiToStart(cfi) {
        try {
            const s = String(cfi);
            const m = /^epubcfi\((.*)\)$/.exec(s);
            if (!m) return s;
            const parts: string[] = [];
            let depth = 0, cur = "";
            for (const ch of m[1]) {
                if (ch === "[") { depth++; cur += ch; }
                else if (ch === "]") { depth = Math.max(0, depth - 1); cur += ch; }
                else if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
                else cur += ch;
            }
            parts.push(cur);
            if (parts.length !== 3) return s;   // not a range CFI — leave it
            return "epubcfi(" + parts[0] + parts[1] + ")";
        } catch (e) { return cfi; }
    }

    /** `renderToolbar` listener — adds a "Move to Tab" button to the
     *  reader's top toolbar, but **only when the reader is a standalone
     *  window** (Zotero has no built-in way to dock such a window back
     *  into the main window's tab strip; the reverse — "Move Tab to New
     *  Window" — already exists in the reader-tab context menu, so we
     *  don't add a button for tabs). Clicking it closes the standalone
     *  window and opens the same item as a *new* tab in the main window
     *  (always a new one, even if a tab for the item is already open —
     *  Zotero allows duplicate readers, and "move this window to a tab"
     *  reads most naturally as moving *this* view rather than collapsing
     *  it onto another). Zotero persists the reader's view state, so the
     *  new tab picks up roughly where the window was.
     *
     *  Goes through the reader's `CustomSections type="Toolbar"` slot
     *  (the `.end` group, left of the find icon). The button gets
     *  `class="toolbar-button"` so it inherits the reader UI's own
     *  button styling; the click closure captures only `itemID` (a
     *  number — safe across the chrome↔iframe boundary the `append`
     *  shim cloneInto's through). The reader app re-fires this event on
     *  every re-render, so re-injection is automatic. */
    _toolbarHandlerImpl(event) {
        try {
            const { reader, doc, append } = event || {};
            if (typeof append !== "function" || !doc) return;
            // Standalone reader windows have no `tabID` (ReaderTab does).
            if (!reader || reader.tabID) return;
            const itemID = reader.itemID;
            if (!itemID) return;

            // Standalone reader windows also get a minimal one-tab strip
            // along the top (Firefox-ish), so the window reads as a tabbed
            // window rather than a chrome-less reader.
            try { this._ensureReaderWindowTabStrip(reader); } catch (e) {}

            // If the user enabled "Hide title bar" in prefs, also hide the
            // reader window's menubar (File / Edit / View / Go) and let
            // Alt summon it. Caveat: we can't remove the OS-drawn title
            // bar above (Windows commits chromemargin at window-create
            // time; setting it from a plugin runs too late). The menubar
            // row is the only thing under our control to collapse.
            try { if (this._getCompactTitleBar?.()) this._applyReaderCompactMenubar(reader); } catch (e) {}

            const NS_HTML = "http://www.w3.org/1999/xhtml";
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.className = "toolbar-button wv-reader-to-tab";
            btn.setAttribute("tabindex", "-1");
            btn.title = "Move this reader into a tab in the main Zotero window";
            // Tabbed-window glyph: an outlined window body with a tab strip
            // (one full-height active tab merging into the body, plus a
            // shorter faded tab behind it). fill="currentColor" — not
            // context-fill — so it inherits the toolbar button's text
            // colour and reads correctly in both themes (the built-in
            // icons' context-fill wasn't being applied to a custom-section
            // child, so the old glyph came out near-black on the dark
            // toolbar — and also read as a folder rather than tabs).
            btn.innerHTML =
                '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">'
                + '<rect x="1" y="5" width="14" height="9.5" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.3"/>'
                + '<path d="M2.4 5.7V3.7c0-0.39 0.31-0.7 0.7-0.7h3.2c0.39 0 0.7 0.31 0.7 0.7v2z"/>'
                + '<path d="M8.2 5.7V4.3c0-0.39 0.31-0.7 0.7-0.7h2.4c0.39 0 0.7 0.31 0.7 0.7v1.4z" fill-opacity="0.45"/>'
                + '</svg>';
            const self = this;
            const capturedItemID = itemID;
            btn.addEventListener("click", (e) => {
                try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
                self._moveReaderToTab(capturedItemID);
            });
            try { append(btn); }
            catch (e) { Zotero.debug("[Weavero] _toolbarHandler append err: " + e); }
        } catch (e) {
            Zotero.debug("[Weavero] _toolbarHandler err: " + e);
        }
    }

    /** Inject (once) a minimal one-tab strip across the top of a
     *  standalone reader window — a thin Firefox-ish tab bar showing the
     *  item title and an "×" that closes the window. It's inserted above
     *  the menubar, as the topmost rendered child of `<window>` (like
     *  Firefox, where the tab strip is at the very top), falling back to
     *  inside the reader's `<vbox>` above the `<browser>` if the window's
     *  shape isn't what we expect. So the window stacks: [OS title bar] /
     *  tab strip / menubar / reader toolbar / page. Idempotent: built
     *  once, the title re-set on each call (so it tracks `document.title`,
     *  which Zotero keeps current). No-op on anything that isn't a
     *  `zotero:reader` window. */
    _ensureReaderWindowTabStrip(reader) {
        try {
            const win = reader && reader._window;
            if (!win || !win.document) return;
            const doc = win.document;
            try {
                if (doc.documentElement.getAttribute("windowtype") !== "zotero:reader") return;
            } catch (e) { return; }

            const title = (() => {
                try {
                    if (doc.title) return doc.title;
                    const it = reader.itemID && Zotero.Items.get(reader.itemID);
                    return it ? it.getDisplayTitle() : "";
                } catch (e) { return ""; }
            })();

            // What kind of attachment is this? Used to pick an icon that
            // matches Zotero's items-tree convention (PDF / EPUB / snapshot).
            const readerType: string = (() => {
                try {
                    if (reader._type) return String(reader._type);
                    const it = reader.itemID && Zotero.Items.get(reader.itemID);
                    const ct = it?.attachmentContentType || "";
                    if (ct === "application/pdf") return "pdf";
                    if (ct === "application/epub+zip") return "epub";
                    if (ct === "text/html") return "snapshot";
                    return "";
                } catch (e) { return ""; }
            })();

            const HTML = "http://www.w3.org/1999/xhtml";
            let strip = doc.querySelector(".wv-window-tabstrip");
            if (!strip) {
                this._ensureReaderWindowTabStripStyles(doc);
                // Insert AFTER the menubar (not before it) so that when
                // the user summons the menubar via Alt, it appears ABOVE
                // the tab strip — Firefox layout. With the tab strip as
                // the first child of <window>, the menubar would slide
                // in below it, which is the wrong order.
                const winEl = doc.documentElement;
                const menubar = winEl && winEl.querySelector("menubar");
                const vbox = doc.getElementById("zotero-reader");
                const browserEl = doc.getElementById("reader");
                let anchor: any = null, anchorParent: any = null;
                if (menubar && menubar.parentNode === winEl) {
                    anchor = menubar.nextSibling;   // insert AFTER menubar
                    anchorParent = winEl;
                } else if (vbox && browserEl && browserEl.parentNode === vbox) {
                    anchor = browserEl; anchorParent = vbox;
                }
                if (!anchorParent) return;
                strip = doc.createElementNS(HTML, "div");
                strip.className = "wv-window-tabstrip";
                const tab = doc.createElementNS(HTML, "div");
                tab.className = "wv-window-tab";
                // File-type icon (PDF/EPUB/snapshot) on the left, matching
                // the items-tree / main-window tab convention.
                const iconEl = doc.createElementNS(HTML, "span");
                iconEl.className = "wv-window-tab-icon";
                if (readerType) iconEl.setAttribute("data-type", readerType);
                const titleEl = doc.createElementNS(HTML, "span");
                titleEl.className = "wv-window-tab-title";
                const closeBtn = doc.createElementNS(HTML, "button");
                closeBtn.className = "wv-window-tab-close";
                closeBtn.setAttribute("title", "Close");
                closeBtn.setAttribute("tabindex", "-1");
                closeBtn.textContent = "×";   // ×
                closeBtn.addEventListener("click", (e) => {
                    try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
                    try { if (typeof reader.close === "function") reader.close(); else win.close(); }
                    catch (er) { try { win.close(); } catch (er2) {} }
                });
                tab.appendChild(iconEl);
                tab.appendChild(titleEl);
                tab.appendChild(closeBtn);
                strip.appendChild(tab);
                if (anchor) anchorParent.insertBefore(strip, anchor);
                else anchorParent.appendChild(strip);

                // Mount the library-aware tooltip and the right-click
                // context menu so the reader window's tab behaves like
                // a main-window tab on hover and right-click.
                try { this._ensureReaderWindowTabTooltip(reader, tab); } catch (e) {}
                try { this._ensureReaderWindowTabContextMenu(reader, tab); } catch (e) {}
            }
            try {
                const titleEl = strip.querySelector(".wv-window-tab-title");
                if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
                // Do NOT set the HTML `title` attribute — that would show
                // the browser's default tooltip, which would race with
                // (and visually override) our custom XUL tooltip wired
                // by `_ensureReaderWindowTabTooltip`.
                // Keep the icon's type in sync (in case reader type changes).
                const iconEl = strip.querySelector(".wv-window-tab-icon");
                if (iconEl && readerType) iconEl.setAttribute("data-type", readerType);
            } catch (e) {}

            // If compact mode is already active on this window (apply ran
            // before the strip existed, e.g. via init() before the
            // toolbar event), add the window controls now that the strip
            // is in place. Idempotent — early-returns if already added.
            try {
                if (win._wvCompactMenubar) this._ensureReaderWindowControls(win);
            } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _ensureReaderWindowTabStrip err: " + e);
        }
    }

    /** One-time CSS for the standalone-reader-window tab strip, injected
     *  as a `<style>` in the reader window's document. Themed off
     *  Zotero's design tokens with solid fallbacks. */
    _ensureReaderWindowTabStripStyles(doc) {
        try {
            if (doc.getElementById("wv-window-tabstrip-styles")) return;
            const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
            style.id = "wv-window-tabstrip-styles";
            style.textContent = [
                /* Tab strip — matches main-window #zotero-title-bar in
                   height (36px) and styling so a reader window reads
                   visually like a Zotero tab. The whole strip is window-
                   draggable; the tab and close button opt out via
                   no-drag so they're clickable. */
                /* Strip background — matches the main window's
                   #zotero-title-bar (rgb(30,30,30) in dark, light
                   parchment in light). The tab itself sits brighter on
                   top, same raised-on-bar relationship as Zotero's
                   own tab bar. */
                ".wv-window-tabstrip {",
                "  display: flex; align-items: stretch; box-sizing: border-box;",
                "  height: 36px; padding: 4px 4px 0 4px;",
                "  background: rgb(245, 245, 245);",
                "  border-bottom: 1px solid rgba(0,0,0,0.12);",
                "  -moz-window-dragging: drag;",
                "}",
                "@media (prefers-color-scheme: dark) {",
                "  .wv-window-tabstrip { background: rgb(30, 30, 30); border-bottom-color: rgba(0,0,0,0.4); }",
                "}",
                /* Tab: rounded top corners, file-type icon + title +
                   close. Brighter than the strip — matches main
                   window's selected-tab styling (rgb(64,64,64) on dark,
                   nearly-white on light) so the tab visually pops out
                   of the bar. Font color + size + family mirrors the
                   main window's .tab-name exactly. */
                ".wv-window-tab {",
                "  display: flex; align-items: center; gap: 6px;",
                "  max-width: 360px; min-width: 0;",
                "  height: 32px;",
                "  padding: 0 4px 0 8px;",
                "  border-radius: 5px 5px 0 0;",
                "  background: rgb(255, 255, 255);",
                "  color: rgba(0, 0, 0, 0.898);",
                "  font: caption; font-size: 13px;",
                "  font-family: system-ui, -apple-system, sans-serif;",
                "  text-rendering: optimizelegibility;",
                "  -moz-window-dragging: no-drag;",
                "}",
                "@media (prefers-color-scheme: dark) {",
                "  .wv-window-tab { background: rgb(64, 64, 64); color: rgba(255, 255, 255, 0.898); }",
                "}",
                /* File-type icon: 16×16, pulled from Zotero's chrome
                   skin via data-type. PDF / EPUB / snapshot covered;
                   anything else falls through to attachment-link.svg. */
                /* File-type icon paths mirror what Zotero's main-window
                   tab uses (item-type/16/<theme>/attachment-<type>.svg).
                   Pick light vs. dark variant via prefers-color-scheme
                   so the icon stays visible in both themes. */
                ".wv-window-tab-icon {",
                "  flex-shrink: 0;",
                "  width: 16px; height: 16px;",
                "  background-size: contain;",
                "  background-repeat: no-repeat;",
                "  background-position: center;",
                "}",
                ".wv-window-tab-icon[data-type='pdf'] { background-image: url('chrome://zotero/skin/item-type/16/light/attachment-pdf.svg'); }",
                ".wv-window-tab-icon[data-type='epub'] { background-image: url('chrome://zotero/skin/item-type/16/light/attachment-epub.svg'); }",
                ".wv-window-tab-icon[data-type='snapshot'] { background-image: url('chrome://zotero/skin/item-type/16/light/attachment-snapshot.svg'); }",
                "@media (prefers-color-scheme: dark) {",
                "  .wv-window-tab-icon[data-type='pdf'] { background-image: url('chrome://zotero/skin/item-type/16/dark/attachment-pdf.svg'); }",
                "  .wv-window-tab-icon[data-type='epub'] { background-image: url('chrome://zotero/skin/item-type/16/dark/attachment-epub.svg'); }",
                "  .wv-window-tab-icon[data-type='snapshot'] { background-image: url('chrome://zotero/skin/item-type/16/dark/attachment-snapshot.svg'); }",
                "}",
                ".wv-window-tab-title {",
                "  flex: 1; min-width: 0;",
                "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
                "}",
                ".wv-window-tab-close {",
                "  flex-shrink: 0; appearance: none; -moz-appearance: none;",
                "  width: 18px; height: 18px; padding: 0; margin: 0;",
                "  border: none; border-radius: 3px; background: transparent;",
                "  color: inherit; cursor: pointer;",
                "  font: inherit; font-size: 15px; line-height: 16px; text-align: center;",
                "}",
                ".wv-window-tab-close:hover { background: rgba(127,127,127,0.28); }",
                ".wv-window-tab-close:active { background: rgba(127,127,127,0.4); }",
                /* Window controls — matches the main-window
                   `.titlebar-button` design: 46x36 buttons using
                   chrome://browser/skin/window-controls/*.svg icons,
                   themed via -moz-context-properties so the stroke
                   inherits currentColor. Same hover colors as Win11
                   title bar — neutral grey for min/max, red for close. */
                ".wv-window-controls {",
                "  display: flex; align-items: stretch;",
                "  margin-left: auto; height: 100%;",
                "  -moz-window-dragging: no-drag;",
                "}",
                ".wv-window-control {",
                "  display: block;",
                "  width: 46px; height: 100%; padding: 0; margin: 0;",
                "  border: none; appearance: none; -moz-appearance: none;",
                "  background-color: transparent;",
                "  background-position: center;",
                "  background-repeat: no-repeat;",
                "  background-size: 12px 12px;",   /* matches main-window's .toolbarbutton-icon 12px */
                "  -moz-context-properties: stroke; stroke: currentColor;",
                "  color: rgba(0, 0, 0, 0.55);",
                "  cursor: pointer;",
                "  font-size: 0;",   /* hide any fallback text */
                "}",
                "@media (prefers-color-scheme: dark) {",
                "  .wv-window-control { color: rgba(255, 255, 255, 0.55); }",
                "}",
                ".wv-window-control.wv-window-min { background-image: url('chrome://browser/skin/window-controls/minimize.svg'); }",
                ".wv-window-control.wv-window-max { background-image: url('chrome://browser/skin/window-controls/maximize.svg'); }",
                ".wv-window-control.wv-window-max[data-state='maximized'] { background-image: url('chrome://browser/skin/window-controls/restore.svg'); }",
                ".wv-window-control.wv-window-close { background-image: url('chrome://browser/skin/window-controls/close.svg'); }",
                ".wv-window-control:hover { background-color: rgba(127,127,127,0.18); }",
                ".wv-window-control:active { background-color: rgba(127,127,127,0.30); }",
                ".wv-window-control.wv-window-close:hover { background-color: #e81123; color: #fff; }",
                ".wv-window-control.wv-window-close:active { background-color: #c50f1f; color: #fff; }",
                /* Library-aware tab tooltip — same visual rules as the
                   main-window tooltip from constants.ts PLUGIN_CSS,
                   scoped to our reader-window tooltip ID. */
                "#wv-window-tab-tooltip .wv-tab-tooltip-wrap {",
                "  padding: 6px 8px;",
                "  min-width: 200px;",
                "  max-width: 480px;",
                "}",
                "#wv-window-tab-tooltip .wv-tab-tooltip-title {",
                "  font-weight: 600;",
                "  margin: 0 0 2px 0 !important;",
                "  white-space: normal;",
                "}",
                "#wv-window-tab-tooltip .wv-tab-tooltip-sep {",
                "  height: 1px;",
                "  margin: 2px 0;",
                "  background: rgba(127,127,127,0.3);",
                "}",
                "#wv-window-tab-tooltip .wv-tab-tooltip-header {",
                "  margin-top: 2px;",
                "  gap: 6px;",
                "}",
                "#wv-window-tab-tooltip .wv-tab-tooltip-icon {",
                "  width: 16px;",
                "  height: 16px;",
                "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
                "  fill: #59ADC4;",
                "}",
                "#wv-window-tab-tooltip .wv-tab-tooltip-libname {",
                "  margin: 0 !important;",
                "  font-weight: 600;",
                "}",
            ].join("\n");
            (doc.documentElement || doc).appendChild(style);
        } catch (e) {
            Zotero.debug("[Weavero] _ensureReaderWindowTabStripStyles err: " + e);
        }
    }

    /** Close the standalone reader window showing `itemID` and open the
     *  item as a *new* tab in the main Zotero window. `allowDuplicate`
     *  forces a fresh `ReaderTab` even if a tab for the item is already
     *  open (so the window's view becomes its own tab rather than
     *  collapsing onto the existing one). The window's view state is
     *  flushed on close (and Zotero auto-saves it continuously anyway),
     *  so the new tab restores roughly where the window was. */
    _moveReaderToTab(itemID) {
        try {
            const win = Zotero.getMainWindow();
            const readers = (Zotero.Reader as any)._readers || [];
            // The standalone-window instance for this item (no tabID).
            const wReader = readers.find((r) => r && r.itemID === itemID && !r.tabID);
            try { if (wReader && typeof wReader.close === "function") wReader.close(); } catch (e) {}
            const open = () => {
                try { (Zotero.Reader as any).open(itemID, null, { openInWindow: false, allowDuplicate: true }); }
                catch (e) { Zotero.debug("[Weavero] _moveReaderToTab open err: " + e); }
                try { if (win && win.focus) win.focus(); } catch (e) {}
            };
            // Defer a tick so the closing window's final state write lands
            // before the new tab reads it back.
            const st = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            st(open, 120);
        } catch (e) {
            Zotero.debug("[Weavero] _moveReaderToTab err: " + e);
        }
    }

    /** Open Zotero's standard select-items dialog filtered to the
     *  annotation's library, then add a symmetric `dc:relation` triple
     *  between every picked item and every annotation in `annotations`.
     *
     *  Mirrors upstream `relatedBox.js`'s `add` flow exactly — same
     *  dialog, same XPCOM path (`Zotero.Items.getAsync` →
     *  `addRelatedItem` → `save` inside a single transaction). The
     *  resulting `notify('modify', 'item', ...)` callbacks fire our
     *  notifier hook, which refreshes the relations icons across both
     *  reader sidebar and right pane — no need to re-render manually. */
    async _addRelatedItemDialog(annotations) {
        const list = Array.isArray(annotations) ? annotations : [annotations];
        const anchor = list[0];
        if (!anchor) return;
        const win = Zotero.getMainWindow();
        if (!win) return;
        try {
            const io = {
                dataIn: null,
                dataOut: null,
                deferred: Zotero.Promise.defer(),
                itemTreeID: "weavero-related-select",
                filterLibraryIDs: [anchor.libraryID],
            };
            win.openDialog(
                "chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            await io.deferred.promise;
            if (!io.dataOut || !io.dataOut.length) return;

            const targets: any = await Zotero.Items.getAsync(io.dataOut);
            if (!targets.length) return;
            // Cross-library relations aren't supported by Zotero's
            // relation predicate (URIs are library-scoped). Same alert
            // text upstream uses when blocking this case.
            if (targets[0].libraryID !== anchor.libraryID) {
                Zotero.alert(null, "",
                    "You cannot relate items in different libraries.");
                return;
            }

            await Zotero.DB.executeTransaction(async () => {
                for (const ann of list) {
                    for (const target of targets) {
                        // Skip self-relation. addRelatedItem also
                        // returns false if the relation already exists
                        // — we honor its return so we only save when
                        // something actually changed.
                        if (target.id === ann.id) continue;
                        if (ann.addRelatedItem(target)) {
                            await ann.save({ skipDateModifiedUpdate: true });
                        }
                        if (target.addRelatedItem(ann)) {
                            await target.save({ skipDateModifiedUpdate: true });
                        }
                    }
                }
            });
        } catch (e) {
            Zotero.debug("[Weavero] _addRelatedItemDialog err: " + e.message);
        }
    }

    // ============================================================================
    // The items-list / collections context menus (lines 2744-3032 in the
    // pre-split bundle) lived between these two halves of the reader cluster.
    // They are organizationally part of pane.ts and are extracted in phase 2.6.
    // ============================================================================

    // ---- In-PDF annotation popup (MutationObserver) -----------------------

    _screenCoords(el) {
        try {
            const iwin = el.ownerDocument.defaultView;
            const r = el.getBoundingClientRect();
            if (typeof iwin.mozInnerScreenX !== "number") return null;
            return { x: iwin.mozInnerScreenX + r.left + r.width / 2,
                     y: iwin.mozInnerScreenY + r.bottom + 2 };
        } catch { return null; }
    }

    _findAnnotationKey(popup, reader) {
        // 1. Content element with 8-char ID
        const contentEl = popup.querySelector(".comment .content[id]");
        if (contentEl) {
            const id = contentEl.getAttribute("id");
            if (/^[A-Z0-9]{8}$/.test(id)) return id;
        }
        // 2. Known data attributes — check the element itself first (Zotero's
        // sidebar rows carry `data-sidebar-annotation-id` on the .annotation
        // div), then walk descendants. Without the self-check we'd skip
        // straight to the selected-annotation fallback for any unselected
        // row whose comment .content lacks an id, attributing icons to the
        // wrong annotation or dropping them entirely.
        for (const attr of [
            "data-annotation-id", "data-key", "data-id",
            "data-sidebar-annotation-id"
        ]) {
            if (popup && popup.getAttribute) {
                const own = popup.getAttribute(attr);
                if (own && /^[A-Z0-9]{8}$/.test(own)) return own;
            }
            const el = popup.querySelector("[" + attr + "]");
            if (el) {
                const v = el.getAttribute(attr);
                if (/^[A-Z0-9]{8}$/.test(v)) return v;
            }
        }
        // 3. Reader internal state
        try {
            const ir = reader && reader._internalReader;
            for (const src of [
                ir && ir._state && ir._state.selectedAnnotationIDs,
                ir && ir.selectedAnnotationIDs,
                ir && ir._readerInstance && ir._readerInstance._state &&
                    ir._readerInstance._state.selectedAnnotationIDs
            ]) {
                if (Array.isArray(src) && src.length) return src[0];
            }
        } catch {}
        return null;
    }

    _injectIconIntoPopup(popup, reader) {
        if (!this._getEnableReaderView()) return;
        try {
            const preview = popup.querySelector(".preview");
            if (!preview) return;
            const header = preview.querySelector("header");
            if (!header) return;
            const doc    = popup.ownerDocument;
            const target = header.querySelector(".end") || header;
            // The reader-outer CSS carries the .wv-btn / .wv-btn-relations
            // rules — make sure it's present in this popup's document before
            // we append icons (idempotent; mirrors the sidebar path).
            try { this._ensureReaderOuterStyles(doc); } catch (e) {}

            const lib = this.libraryIDFromReader(reader);
            const key = this._findAnnotationKey(popup, reader);

            // --- Relations icon (independent of comment content) ------------
            // Mirrors the sidebar row: an annotation with related items gets a
            // chain icon next to the native kebab (⋯) button that opens the
            // relations popup. Runs first so the comment-icon early returns
            // below can't skip it; an area annotation with no comment can
            // still carry relations.
            try {
                const ann     = key ? this._getAnnotationItem(lib, key) : null;
                const related = ann ? this._getAnnotationRelatedItems(ann) : [];
                const existingRel = target.querySelector(".wv-btn-relations");
                if (related.length && !existingRel) {
                    const relBtn = doc.createElement("button");
                    relBtn.className = BTN_CLASS + " " + BTN_POPUP_CLASS
                        + " wv-btn-relations";
                    relBtn.setAttribute("tabindex", "-1");
                    relBtn.title = related.length + " Related";
                    relBtn.appendChild(this._makeRelationsSvg(doc));
                    relBtn.addEventListener("click", e => {
                        e.stopPropagation(); e.preventDefault();
                        const freshKey = this._findAnnotationKey(popup, reader);
                        const freshAnn = (freshKey
                            && this._getAnnotationItem(lib, freshKey)) || ann;
                        const sc = this._screenCoords(relBtn);
                        this.openRelationsPopup(freshAnn,
                            sc ? { anchorScreen: sc } : { anchorNode: relBtn });
                    });
                    const moreBtn = target.querySelector("button.more");
                    if (moreBtn) target.insertBefore(relBtn, moreBtn);
                    else target.appendChild(relBtn);
                } else if (!related.length && existingRel) {
                    existingRel.remove();
                }
            } catch (e) {
                Zotero.debug("[Weavero] popup relations icon err: " + e.message);
            }

            const commentEl = preview.querySelector(".comment");

            if (!commentEl) {
                // Popup lost its comment — remove the stale comment button
                // (leave the relations button: it doesn't need a comment).
                preview.querySelector("." + BTN_POPUP_CLASS
                    + ":not(.wv-btn-relations)")?.remove();
                return;
            }

            // Render markdown + URLs into a sibling .wv-md-preview pane,
            // mirroring the sidebar's architecture. .content stays as raw
            // text (editable); CSS swaps which one is visible based on the
            // wv-comment-preview / wv-editing classes that focusin/focusout
            // manage globally for every .content in the reader iframe. This
            // path replaces the older in-place _markTextLinks treatment which
            // could only colourise URLs and missed every other markdown form.
            this._renderPreviewPanel(commentEl);

            const existingBtn = target.querySelector("." + BTN_POPUP_CLASS
                + ":not(.wv-btn-relations)");

            const comment = this.getModelComment(lib, key) ?? (commentEl.textContent || "");
            const anchors = this.collectAnchorURLs(commentEl);
            const hasURIs = this._iconWantedFor(comment) || anchors.length > 0;

            // Decide whether the popup-icon button adds value here. Same
            // logic as the right pane and reader sidebar (_iconAddsValueBeyondInline)
            // — show only when inline rendering can't carry the comment by
            // itself, OR when the popup text is overflowing so some content
            // may be clipped.
            let shouldShow = this._iconWantedFor(comment)
                && this._iconAddsValueBeyondInline(comment);
            if (!shouldShow && hasURIs) {
                try {
                    // `popupTextEl` was a stale name from an earlier
                    // refactor — never declared in this scope, so the
                    // try/catch silently set `shouldShow = false` and
                    // the icon never auto-appeared on overflowing
                    // URI-bearing comments. The actual element whose
                    // overflow we want to test is the .comment node
                    // captured above.
                    shouldShow =
                        commentEl.scrollHeight > commentEl.clientHeight + 1
                        || commentEl.scrollWidth > commentEl.clientWidth + 1;
                } catch(e) { shouldShow = false; }
            }
            if (!shouldShow) {
                existingBtn?.remove();
                return;
            }
            if (existingBtn) return;

            const btn = doc.createElement("button");
            btn.className = BTN_CLASS + " " + BTN_POPUP_CLASS;
            btn.setAttribute("tabindex", "-1");
            this._applyIconState(btn, comment);
            btn.addEventListener("click", e => {
                e.stopPropagation(); e.preventDefault();
                const freshKey  = this._findAnnotationKey(popup, reader);
                const freshCmt  = this.getModelComment(lib, freshKey) ?? (commentEl.textContent || comment);
                const freshAnch = this.collectAnchorURLs(commentEl);
                const sc = this._screenCoords(btn);
                this.openCommentPopup(freshCmt, {
                    extraURLs: freshAnch,
                    ...(sc ? { anchorScreen: sc } : { anchorNode: btn })
                });
            });
            // Order: [comment][relations][more] — keep relations adjacent to
            // the native kebab, matching the sidebar's icon-group policy.
            const before = target.querySelector(".wv-btn-relations")
                || target.querySelector("button.more");
            if (before) target.insertBefore(btn, before); else target.appendChild(btn);
        } catch (err) {
            Zotero.debug("[Weavero] _injectIconIntoPopup error: " + err.message);
        }
    }

    /** Build a keydown handler that removes badges for the currently-
     *  selected annotation(s) the moment the user presses Delete /
     *  Backspace, instead of waiting for Zotero's `delete` notifier
     *  to fire (which only happens after the DB transaction +
     *  notifier queue commit, ~100–300 ms later, often longer when
     *  the main thread is busy refreshing item rows). The badge then
     *  vanishes in the same render frame as the highlight does,
     *  matching the user's mental model of "delete = gone".
     *
     *  We also stamp each removed key into _recentlyDeletedKeys so
     *  the inner observer's debounced overlay scan (which runs
     *  ~100 ms later in response to our DOM removal) won't recreate
     *  the badge while Zotero's in-memory annotation cache is still
     *  catching up. That entry is cleared again either by the
     *  upcoming notifier delete (which sets it itself) or by a
     *  later `_processNoteAnnotationOverlays` pass when
     *  getAnnotations() stops returning the key.
     *
     *  Skipped on contenteditable / input / textarea targets so
     *  Backspace continues to edit comment text instead of nuking
     *  the annotation. */
    /** Probe every reachable signal for the currently-selected
     *  annotation key(s) and return the union (NOT first-non-empty).
     *  We've seen Zotero's `selectedAnnotationIDs` keep stale keys
     *  after a delete + new-annotation-create — the proactive
     *  Delete-key handler then targets the wrong (already-gone) key
     *  and the new annotation's badge survives until the slow
     *  notifier path fires. Pulling from every source we can find
     *  and validating each against the live DOM (caller's job)
     *  defangs stale keys: their badge is already gone so the
     *  validation drops them silently. */
    _findSelectedAnnotationKeys(reader) {
        const found = new Set();
        const addAll = (arr) => {
            if (!Array.isArray(arr)) return;
            for (const k of arr) {
                if (typeof k === "string" && /^[A-Z0-9]{8}$/.test(k)) {
                    found.add(k);
                }
            }
        };

        // Reader-level state (Zotero 10 exposes some shapes here).
        try {
            addAll(reader && reader._selectedAnnotationIDs);
            if (reader && reader._state) {
                addAll(reader._state.selectedAnnotationIDs);
            }
            if (reader && typeof reader.getSelectedAnnotationIDs === "function") {
                try { addAll(reader.getSelectedAnnotationIDs()); } catch (e2) {}
            }
        } catch (e) {}

        // Internal reader (the wrapper around the iframe viewer).
        try {
            const ir = reader && reader._internalReader;
            if (ir) {
                addAll(ir.selectedAnnotationIDs);
                if (ir._state) addAll(ir._state.selectedAnnotationIDs);
                if (ir._readerInstance && ir._readerInstance._state) {
                    addAll(ir._readerInstance._state.selectedAnnotationIDs);
                }
                if (typeof ir.getSelectedAnnotationIDs === "function") {
                    try { addAll(ir.getSelectedAnnotationIDs()); } catch (e2) {}
                }
            }
        } catch (e) {}

        // Open .annotation-popup elements. The popup carries the
        // annotation key on its `.comment .content[id]` child (also
        // probed via _findAnnotationKey).
        try {
            const data = this._readerObservers.get(reader) || {};
            const iwin = reader._iframeWindow
                || (reader._iframe && reader._iframe.contentWindow);
            const docs = [data.innerDoc, iwin && iwin.document].filter(Boolean);
            for (const doc of docs) {
                for (const popup of doc.querySelectorAll(".annotation-popup")) {
                    const k = this._findAnnotationKey(popup, reader);
                    if (k && /^[A-Z0-9]{8}$/.test(k)) found.add(k);
                }
            }
        } catch (e) {}

        // Click tracker (set when user clicks on a marker badge or
        // annotation popup — see _trackAnnotationSelection).
        try {
            const data = this._readerObservers.get(reader);
            const k = data && data.lastClickedAnnotationKey;
            if (k && /^[A-Z0-9]{8}$/.test(k)) found.add(k);
        } catch (e) {}

        // Last-touched annotation (set by the notifier when an
        // annotation is added or its comment modified — see the
        // 'add'/'modify' handlers in init()). Catches the case where
        // the user creates a highlight, edits its comment, then
        // immediately presses Delete: `selectedAnnotationIDs` may
        // still hold the previously-selected (now deleted) key, but
        // the modify notifier just fired with the new key.
        try {
            const data = this._readerObservers.get(reader);
            const k = data && data.lastTouchedAnnotationKey;
            if (k && /^[A-Z0-9]{8}$/.test(k)) found.add(k);
        } catch (e) {}

        return [...found];
    }

    _makeProactiveDeleteKeydown(reader, where) {
        return (e) => {
            try {
                if (e.key !== "Delete" && e.key !== "Backspace") return;
                const t = e.target;
                if (t) {
                    const tag = (t.tagName || "").toLowerCase();
                    if (tag === "input" || tag === "textarea" || tag === "select") return;
                    if (t.isContentEditable) return;
                }

                const selectedKeys = this._findSelectedAnnotationKeys(reader);
                this._dbg("[Weavero] proactive keydown @"
                    + where + ": key=" + e.key
                    + " target=" + (t ? (t.tagName + "." + (t.className || "")) : "?")
                    + " selected=" + JSON.stringify(selectedKeys));

                if (!selectedKeys.length) return;

                const now = Date.now();
                const data = this._readerObservers.get(reader) || {};
                const innerDoc = data.innerDoc || null;
                const iwin = reader._iframeWindow
                    || (reader._iframe && reader._iframe.contentWindow);
                const outerDoc = iwin && iwin.document;
                let removed = 0;
                const removedKeys = [];
                for (const key of selectedKeys) {
                    if (!key) continue;
                    // Validate: only act on keys whose badge actually
                    // exists in the DOM. This drops stale entries
                    // (e.g. a `selectedAnnotationIDs` that still
                    // contains an already-deleted key) without
                    // poisoning _recentlyDeletedKeys, which would
                    // otherwise suppress legitimate badge re-creation
                    // for up to 60 s.
                    let badgesForKey = [];
                    for (const doc of [innerDoc, outerDoc]) {
                        if (!doc) continue;
                        const list = doc.querySelectorAll(
                            ".wv-marker-badge[data-wv-for=\"" + key + "\"]");
                        for (const b of list) badgesForKey.push(b);
                    }
                    if (!badgesForKey.length) continue;
                    this._recentlyDeletedKeys.set(key, now);
                    for (const badge of badgesForKey) {
                        badge.remove();
                        removed++;
                    }
                    removedKeys.push(key);
                }
                if (removed) {
                    this._dbg("[Weavero] proactive delete-key removal: "
                        + removed + " badge(s) for keys="
                        + JSON.stringify(removedKeys)
                        + " (candidates=" + JSON.stringify(selectedKeys) + ")");
                }
            } catch (err) {
                Zotero.debug("[Weavero] proactive keydown error: " + err);
            }
        };
    }

    /** Track the most recently clicked annotation per reader so the
     *  proactive Delete/Backspace handler has a fallback when the
     *  reader's `selectedAnnotationIDs`-style state doesn't expose
     *  the live selection. We set the key whenever the click target
     *  resolves to a known annotation surface (marker badge,
     *  annotation popup, or the canvas-rendered icon area) and clear
     *  it when the user clicks somewhere unrelated.
     *
     *  Also doubles as a lightweight diagnostic: every recorded key
     *  is logged so the next debug log shows exactly which clicks
     *  populated the tracker. */
    _trackAnnotationSelection(reader, doc) {
        if (!doc) return null;
        const handler = (e) => {
            try {
                const data = this._readerObservers.get(reader);
                if (!data) return;
                let key = null;
                const path = (typeof e.composedPath === "function")
                    ? e.composedPath() : [];
                const candidates = path.length ? path : [e.target];
                for (const node of candidates) {
                    if (!node || !node.getAttribute) continue;
                    // Marker badge — has the key directly.
                    if (node.classList && node.classList.contains("wv-marker-badge")) {
                        const k = node.getAttribute("data-wv-for");
                        if (k && /^[A-Z0-9]{8}$/.test(k)) { key = k; break; }
                    }
                    // Annotation popup — extract via _findAnnotationKey.
                    if (node.classList && node.classList.contains("annotation-popup")) {
                        const k = this._findAnnotationKey(node, reader);
                        if (k && /^[A-Z0-9]{8}$/.test(k)) { key = k; break; }
                    }
                }
                if (key) {
                    data.lastClickedAnnotationKey = key;
                    this._dbg("[Weavero] selection tracker: key=" + key);
                }
                // Don't clear on unrelated clicks — Zotero's annotation
                // selection persists across e.g. a click on the canvas
                // outside any annotation, until the user actually picks
                // a different one. The _recentlyDeletedKeys gate stops
                // a stale key from causing a false delete.
            } catch (err) {}
        };
        doc.addEventListener("mousedown", handler, true);
        return handler;
    }

    async _setupReaderObserver(reader) {
        if (this._readerObservers.has(reader)) return;
        try {
            if (typeof reader._waitForReader === "function") await reader._waitForReader();
            else if (reader._initPromise) await reader._initPromise;

            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            if (!iwin || !iwin.document) return;
            const idoc = iwin.document;
            if (!idoc.body) {
                await new Promise<void>(resolve => {
                    if (idoc.readyState === "complete") return resolve();
                    iwin.addEventListener("load", resolve, { once: true });
                });
            }

            // Inject scoped CSS into the iframe so URL spans are styled there too.
            this._injectReaderStyles(idoc);
            // Tag the outer reader iframe with .wv-ui-dark when needed
            // — the sidebar lives here and follows the UI theme.
            this._applyUIThemeClass();

            // Inject into any popups already open
            for (const p of idoc.querySelectorAll(".annotation-popup"))
                this._injectIconIntoPopup(p, reader);

            // Verbose edit-flow trace — observe every .content element
            // for mutations during edit. Track only the first ~5 elements
            // we encounter so we don't drown the log; reset on new doc.
            const _editTracedContents = new WeakSet();
            const traceContent = (content) => {
                if (!content || _editTracedContents.has(content)) return;
                _editTracedContents.add(content);
                try {
                    const mo = new iwin.MutationObserver(muts => {
                        for (const m of muts) {
                            try {
                                this._dbg("[Weavero][edit] content-mutation"
                                    + " type=" + m.type
                                    + " added=" + m.addedNodes.length
                                    + " removed=" + m.removedNodes.length
                                    + " kids=" + content.children.length
                                    + " text=" + JSON.stringify(String(content.textContent || "").slice(0, 40))
                                    + " active=" + (idoc.activeElement === content ? "ME"
                                        : this._elSummary(idoc.activeElement)));
                            } catch(err) {}
                        }
                    });
                    mo.observe(content, { childList: true, characterData: true, subtree: true });
                } catch(err) {}
            };
            // Initial sidebar pass after traceContent is defined.
            this._processReaderSidebar(idoc);
            try {
                for (const c of idoc.querySelectorAll(".annotation-row .comment .content, .annotation .comment .content")) {
                    traceContent(c);
                }
            } catch(err) {}

            // mousedown handler in the iframe — fires URL action on first click,
            // independent of whatever Zotero does on row selection.
            const sidebarMouseDown = (e) => {
                if (e.button !== 0) return;
                if (!e.target || !e.target.closest) return;
                // Verbose edit-flow trace — log every click that lands inside
                // an annotation comment area, even if we don't act on it.
                const inCommentArea = e.target.closest(
                    ".annotation-row .comment, .annotation .comment");
                if (inCommentArea) {
                    try {
                        const active = idoc.activeElement;
                        this._dbg("[Weavero][edit] mousedown in comment"
                            + " target=" + this._elSummary(e.target)
                            + " active=" + this._elSummary(active)
                            + " contentChildren=" + (inCommentArea.querySelector(".content")
                                ? inCommentArea.querySelector(".content").children.length
                                : "?")
                            + " contentEditable=" + (inCommentArea.querySelector(".content")
                                ? inCommentArea.querySelector(".content").contentEditable
                                : "?"));
                    } catch(err) {}
                }
                const urlSpan = e.target.closest(".wv-url-span");
                if (!urlSpan) return;
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.preventDefault();
                // Markdown links [label](url) put the destination in
                // data-href because the visible textContent is the label,
                // not the URL itself.
                const url = (urlSpan.getAttribute("data-href")
                          || urlSpan.textContent || "").trim();
                if (!url) return;
                if (url.startsWith("zotero://")) this.handleZoteroURI(url);
                else this._launchURL(url);
            };
            idoc.addEventListener("mousedown", sidebarMouseDown, true);

            let sidebarTimer = null;
            const scheduleSidebarScan = (delay) => {
                if (sidebarTimer) iwin.clearTimeout(sidebarTimer);
                sidebarTimer = iwin.setTimeout(() => {
                    sidebarTimer = null;
                    // Trace any new .content elements before the scan.
                    try {
                        for (const c of idoc.querySelectorAll(".annotation-row .comment .content, .annotation .comment .content")) {
                            traceContent(c);
                        }
                    } catch(err) {}
                    try { this._processReaderSidebar(idoc); }
                    catch(e) { Zotero.debug("[Weavero] sidebar scan error: " + e); }
                }, delay);
            };

            const observer = new iwin.MutationObserver(mutations => {
                let needsSyncScan = false;
                let needsCtxDecorate = false;
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.classList?.contains("annotation-popup"))
                            this._injectIconIntoPopup(node, reader);
                        else
                            node.querySelectorAll?.(".annotation-popup")
                                .forEach(p => this._injectIconIntoPopup(p, reader));
                        // Iframe-rendered annotation context menu — mounts
                        // as a `.context-menu` div under the iframe body
                        // when the user right-clicks an annotation. React
                        // renders the buttons synchronously with the
                        // wrapper, so they're already in the subtree by
                        // the time this observer fires.
                        if (node.classList?.contains("context-menu")
                            || node.querySelector?.(".context-menu")) {
                            needsCtxDecorate = true;
                        }
                        // Annotation row / comment additions: render the
                        // preview panel synchronously inside the observer
                        // callback (which is a microtask, runs before the
                        // next browser paint), so the raw .content text
                        // never flashes when the sidebar reopens. The
                        // data-source cache check in _renderPreviewPanel
                        // makes subsequent calls cheap.
                        if (node.matches?.(".annotation-row, .annotation, .comment")
                            || node.querySelector?.(
                                ".annotation-row .comment, .annotation .comment")) {
                            needsSyncScan = true;
                        }
                    }
                    // Also re-check when comment text mutates inside an existing popup
                    const popup = m.target?.closest?.(".annotation-popup");
                    if (popup) this._injectIconIntoPopup(popup, reader);
                }
                if (needsSyncScan) {
                    try { this._processReaderSidebar(idoc); }
                    catch(e) { Zotero.debug(
                        "[Weavero] sync sidebar scan: " + e); }
                }
                if (needsCtxDecorate) {
                    try { this.decorateContextMenu(idoc); }
                    catch(e) { Zotero.debug(
                        "[Weavero] context-menu decorate err: " + e); }
                }
                // Debounced safety-net scan for mutations we didn't classify
                // as a sync trigger (e.g. far-future Zotero DOM shapes).
                scheduleSidebarScan(80);
            });
            observer.observe(idoc.body || idoc.documentElement,
                { childList: true, subtree: true, characterData: true });

            // Overlay refresh after filter UI interaction. The annotation
            // filter (color / tag / author / search query) lives in the
            // outer iframe sidebar; toggling it updates the reader's
            // `_state.annotations[i]._hidden` flags but does NOT fire a
            // MutationObserver on the inner viewer iframe (the PDF view
            // re-renders annotations onto canvas, and pixel changes don't
            // trigger MO). Without an explicit hook our overlay badges
            // would stay floating over annotations the reader has hidden.
            //
            // Hook clicks (filter button toggles) and keyup (search field
            // typing) on the outer iframe and schedule a debounced
            // re-process of the inner overlays.
            let overlayRefreshTimer = null;
            const scheduleOverlayRefresh = () => {
                if (overlayRefreshTimer) iwin.clearTimeout(overlayRefreshTimer);
                overlayRefreshTimer = iwin.setTimeout(() => {
                    overlayRefreshTimer = null;
                    try {
                        const cached = this._readerObservers
                            && this._readerObservers.get(reader);
                        const innerDoc = cached && cached.innerDoc;
                        if (innerDoc) {
                            this._processNoteAnnotationOverlays(innerDoc, reader);
                            this._sweepStaleOverlays(innerDoc, reader);
                        }
                    } catch(e) {
                        Zotero.debug("[Weavero] overlay refresh err: " + e);
                    }
                }, 300);
            };
            idoc.addEventListener("click", scheduleOverlayRefresh, true);
            idoc.addEventListener("keyup", scheduleOverlayRefresh, true);

            // Preview-panel architecture (v0.0.106):
            // .content stays plain text — we never inject spans into it, so
            // Zotero's editor never sees foreign DOM. Instead we render a
            // sibling .wv-md-preview inside .comment showing the formatted
            // version. CSS (wv-comment-preview class) hides .content and
            // shows the preview when not editing; the wv-editing class on
            // .comment swaps which one is visible during edit mode.
            //
            // Focus on .content -> add wv-editing (raw shows, preview hides).
            // Blur from .content -> remove wv-editing, regenerate preview
            // from the post-edit text via scheduleSidebarScan.
            const sidebarFocusIn = (e) => {
                try {
                    const target = e && e.target;
                    if (!target || !target.classList) return;
                    if (!target.classList.contains("content")) return;
                    const cmt = target.closest(".comment");
                    if (cmt) cmt.classList.add("wv-editing");
                } catch(e2) {
                    Zotero.debug("[Weavero] focusin handler error: " + e2);
                }
            };
            idoc.addEventListener("focusin", sidebarFocusIn, true);

            const sidebarFocusOut = (e) => {
                try {
                    const target = e && e.target;
                    if (target && target.classList && target.classList.contains("content")) {
                        const cmt = target.closest(".comment");
                        if (cmt) cmt.classList.remove("wv-editing");
                    }
                } catch(err) {}
                scheduleSidebarScan(80);
            };
            idoc.addEventListener("focusout", sidebarFocusOut, true);

            // Click forwarder: clicks on the preview-panel body should focus
            // the sibling .content so Zotero's editor takes over. Clicks on
            // a URL span inside the preview are already handled by
            // sidebarMouseDown (it scans for .wv-url-span first).
            //
            // Native Zotero behaviour: the first click on an annotation row
            // selects the row; once selected, a click on the comment enters
            // edit mode. We mirror that by only forwarding into edit mode
            // when the .annotation is already .selected. For the first
            // click on an unselected row we don't preventDefault, so the
            // event bubbles up to Zotero's row-select handler.
            const sidebarPreviewClick = (e) => {
                try {
                    const target = e && e.target;
                    if (!target || !target.closest) return;
                    if (target.closest(".wv-url-span")) {
                        this._dbg("[Weavero] sidebarPreviewClick: skip (target in .wv-url-span)");
                        return;
                    }
                    const preview = target.closest(".wv-md-preview");
                    if (!preview) {
                        this._dbg("[Weavero] sidebarPreviewClick: skip (no .wv-md-preview ancestor)");
                        return;
                    }
                    const annotation = preview.closest(".annotation, .annotation-row");
                    const popup = preview.closest(".annotation-popup");
                    this._dbg("[Weavero] sidebarPreviewClick: target=" + this._elSummary(target)
                        + " hasPreview=true popup=" + !!popup
                        + " annotation=" + (annotation ? "."+annotation.className : "null")
                        + " selected=" + !!(annotation && annotation.classList.contains("selected")));
                    if (!popup && (!annotation || !annotation.classList.contains("selected"))) {
                        this._dbg("[Weavero] sidebarPreviewClick: skip (not popup & row not selected)");
                        return;
                    }
                    const cmt = preview.closest(".comment");
                    const content = cmt && cmt.querySelector(".content");
                    if (!content) return;
                    e.preventDefault();
                    e.stopPropagation();
                    cmt.classList.add("wv-editing");
                    // Defer focus + caret placement to the next animation
                    // frame. Adding wv-editing un-hides .content via CSS,
                    // but the layout hasn't applied yet — calling focus()
                    // synchronously on a still-display:none element can
                    // fail silently (this is what made edit-mode appear
                    // dead in the in-document annotation popup).
                    const win = idoc.defaultView;
                    const raf = (win && win.requestAnimationFrame)
                        ? win.requestAnimationFrame.bind(win)
                        : (cb) => setTimeout(cb, 0);
                    raf(() => {
                        try {
                            content.focus();
                            // Place the caret at the end of the text so typing
                            // appends to the existing comment instead of replacing.
                            const sel = win && win.getSelection && win.getSelection();
                            if (sel) {
                                const range = idoc.createRange();
                                range.selectNodeContents(content);
                                range.collapse(false);
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        } catch(err) {}
                    });
                } catch(e2) {
                    Zotero.debug("[Weavero] preview click error: " + e2);
                }
            };
            idoc.addEventListener("mousedown", sidebarPreviewClick, true);

            // Proactive Delete/Backspace handler — see
            // _makeProactiveDeleteKeydown for the rationale (skips the
            // ~100–300 ms wait between keystroke and the notifier
            // delete event). The reader has a deep frame stack
            // (Zotero main window > reader iframe > PDF.js viewer
            // iframe), and Zotero's own keyboard handlers attach at
            // the WINDOW level on these frames — a document-only
            // capture listener gets stopImmediatePropagation()'d
            // before it ever fires. So we attach at both window and
            // document on every frame the reader spans, with a label
            // so the diagnostic tells us which one actually caught
            // the keystroke.
            const proactiveOuterDoc =
                this._makeProactiveDeleteKeydown(reader, "outer-doc");
            const proactiveOuterWin =
                this._makeProactiveDeleteKeydown(reader, "outer-win");
            idoc.addEventListener("keydown", proactiveOuterDoc, true);
            iwin.addEventListener("keydown", proactiveOuterWin, true);

            // Selection tracker — see _trackAnnotationSelection.
            // _readerObservers.set has to happen first so the click
            // handler can find the data record.
            this._readerObservers.set(reader, {
                observer, sidebarMouseDown, sidebarFocusIn, sidebarFocusOut,
                sidebarPreviewClick,
                proactiveOuterDoc, proactiveOuterWin,
                proactiveOuterWindow: iwin
            });
            const selectionTrackerOuter =
                this._trackAnnotationSelection(reader, idoc);
            const dataAfterTracker = this._readerObservers.get(reader) || {};
            dataAfterTracker.selectionTrackerOuter = selectionTrackerOuter;
            this._readerObservers.set(reader, dataAfterTracker);

            // Also wire up text-annotation handling in the nested PDF.js iframe.
            // (The drag tracker for canvas annotations is wired from
            // INSIDE _setupInnerReaderObserver's wireUp closure — pointer
            // events on PDF.js's canvas fire only in the inner iframe and
            // do not bubble across the iframe boundary, so binding on
            // the outer doc never sees a highlight/image resize.)
            try { this._setupInnerReaderObserver(reader, idoc); }
            catch(e) { Zotero.debug("[Weavero] inner setup error: " + e); }
        } catch (err) {
            Zotero.debug("[Weavero] _setupReaderObserver error: " + err.message);
        }
    }

    /** Inject minimal CSS into the reader iframe (URL span colors + cursor).
     *  Defensive remove-then-add: see `_ensureReaderOuterStyles` for the
     *  rationale — a stale style element from a previous plugin instance
     *  must be replaced, not skipped, so the new code's rules win. */
    _injectReaderStyles(idoc) {
        if (!idoc) return;
        const existing = idoc.getElementById("weavero-reader-styles");
        if (existing) existing.remove();
        const s = idoc.createElement("style");
        s.id = "weavero-reader-styles";
        s.textContent = [
            ":root { --wv-link-http: #1a73e8;"
                + " --wv-link-zotero: #8b4513; --wv-link-app: #9333ea; }",
            ":root.wv-ui-dark { --wv-link-http: #8ab4f8;"
                + " --wv-link-zotero: #cd853f; --wv-link-app: #c084fc; }",
            ".wv-url-span { cursor: pointer !important; }",
            ".wv-url-span.wv-link-http   { color: var(--wv-link-http); }",
            ".wv-url-span.wv-link-zotero { color: var(--wv-link-zotero); }",
            ".wv-url-span.wv-link-app    { color: var(--wv-link-app); }",
            ".wv-link { cursor: pointer !important; }",
            // Mirror the main-window suppress rule inside the reader
            // iframe so a right-click in the sidebar / popup also
            // switches cursor to default and hides our tooltip while
            // the menu is up. The class on the OUTER documentElement
            // doesn't reach inside the iframe, so we apply our own
            // class on the iframe's root via the menu open/close path.
            ":root.wv-context-menu-open .wv-url-span,",
            ":root.wv-context-menu-open .wv-link { cursor: default !important; }",
            // Sidebar / popup button (the 🔗 icon) lives inside the reader
            // iframe, so we have to give it cursor:pointer here too — the
            // main-window stylesheet doesn't reach this document.
            ".wv-btn { cursor: pointer; opacity: 1;"
            + " transition: background 0.15s;"
            + " background: transparent; border: none;"
            + " padding: 1px 3px; border-radius: 3px; }",
            ".wv-btn:hover {"
            + " background: rgba(0, 0, 0, 0.07); }",
            ":root.wv-ui-dark .wv-btn:hover {"
            + " background: rgba(255, 255, 255, 0.08); }",
            // Chain SVG sizing for the reader iframe — same rule as
            // PLUGIN_CSS so URL-bearing buttons render the icon correctly.
            ".wv-link-svg {"
            + " width: 1em; height: 1em; display: block; flex-shrink: 0; }",
            // Plugin icon prepended to our annotation-context-menu items
            // by `decorateContextMenu`. Wrapped in `<div class="icon">`
            // so upstream's `.context-menu .icon` rules handle layout;
            // only the <img> itself needs sizing.
            ".context-menu .row.basic .wv-menuitem-icon {"
            + " width: 16px; height: 16px;"
            + " display: block; object-fit: contain; }",
            // Inline relations SVG used by `decorateContextMenu` for
            // "Add related item…". Same amber-brown as the sidebar's
            // `.wv-btn-relations` (the relations icon next to the
            // annotation header), so the menu entry visually matches
            // the icon the user sees on the annotation itself.
            //   Light theme: #7a4a00 (dark amber)
            //   Dark theme:  #ffb84d (light amber)
            // Theme detection via prefers-color-scheme — the reader
            // iframe doesn't reliably carry the wv-ui-dark / wv-reader-dark
            // class at this level, but it does honour the media query.
            ".context-menu .row.basic .icon .wv-relations-svg {"
            + " width: 16px; height: 16px; display: block; }",
            ".context-menu .row.basic .icon .wv-relations-svg path {"
            + " fill: #7a4a00 !important; }",
            "@media (prefers-color-scheme: dark) {",
            "  .context-menu .row.basic .icon .wv-relations-svg path {"
            + " fill: #ffb84d !important; }",
            "}",
        ].join("\n");
        (idoc.head || idoc.documentElement).appendChild(s);
    }

    /** Replace `el`'s contents with text + colored .wv-url-span elements.
     *  Mirrors the items-tree rebuild: drops any pre-existing structure
     *  (including Zotero-injected <a href> anchors) so URLs are styled
     *  consistently and clickable through our own handler. */
    _markTextLinks(el, opts) {
        if (!el || !el.querySelectorAll) return false;
        // Mode 2 (icons only): leave comment text plain.
        if (!this._getInlineLinks()) return false;

        // "tree" mode is set by the items-tree note/text-annotation row pass
        // (see _markCellLinks). Two differences from sidebar mode:
        //   1. Markdown rendering is gated on the user-facing
        //      enableCommentMarkdown pref instead of the hidden
        //      the (now-removed) experimental sidebar markdown toggle, because items-tree rows
        //      aren't editable so the v0.0.97 edit-mode breakage doesn't
        //      apply.
        //   2. Markdown markers (**, *, ~~, `) are stripped from the output
        //      so the row reads like the formatted preview, matching how
        //      highlight rows render via _markCellLinks's full rebuild.
        const isTreeMode = !!(opts && opts.mode === "tree");

        const doc = el.ownerDocument;

        // Don't touch a comment that's being edited — rebuilding the children
        // wipes the caret position, so each keystroke would reset the cursor
        // to position 0. We probe several signals here:
        //   1. el itself or a descendant is the focused element (typical
        //      case when user is typing into a contenteditable child of el).
        //   2. focused element is an ANCESTOR of el (Zotero's reader marks
        //      the outer .comment as the contenteditable container, so focus
        //      lives there while we're marking the inner .content).
        //   3. the selection's anchor node is inside el (covers transient
        //      focus loss on per-keystroke save → re-render — the active
        //      element bounces but the caret/selection stays in el).
        // We deliberately don't gate on the contenteditable attribute itself
        // because Zotero's reader sets contenteditable="" permanently on its
        // .content wrapper to make click-to-edit work; that would block all
        // marking, not just during active editing.
        // IMPORTANT: This MUST run before the stale-span detection below.
        // If the user is typing inside a span, unwrapping mid-edit thrashes
        // the contenteditable element and causes a hang.
        const active = doc && doc.activeElement;
        let activeRelated = false;
        if (active) {
            if (active === el) {
                this._dbg("[Weavero] _markTextLinks skip: active === el");
                return false;
            }
            if (el.contains(active)) {
                this._dbg("[Weavero] _markTextLinks skip: el.contains(active)");
                return false;
            }
            if (active.contains(el) && active.isContentEditable) {
                this._dbg("[Weavero] _markTextLinks skip: contenteditable ancestor focused");
                return false;
            }
            // Activity is "related" to el if focus is somewhere that could be
            // a transient blur during per-keystroke save (e.g. body briefly
            // takes focus before Zotero restores it). The classic non-related
            // case is focus on the iframe element or some sibling — at that
            // point the user has clearly clicked away and the selection
            // anchor (if still inside el) is stale.
            const tag = (active.tagName || "").toLowerCase();
            activeRelated = (tag === "body" || tag === "html" || active === doc.documentElement);
        } else {
            // No focused element at all — could be transient blur. Treat
            // selection anchor as authoritative.
            activeRelated = true;
        }
        if (activeRelated) {
            try {
                const win = doc && doc.defaultView;
                const sel = win && win.getSelection && win.getSelection();
                if (sel && sel.anchorNode && el.contains(sel.anchorNode)) {
                    this._dbg("[Weavero] _markTextLinks skip: selection anchor inside el (active=" + ((active && active.tagName) || "null") + ")");
                    return false;
                }
            } catch(e) { /* getSelection may throw in some doc contexts */ }
        }

        // We're not editing — safe to inspect. If our spans are already
        // present, compare them against the URLs in the current text:
        //   • exact match → skip (cache hit, common case).
        //   • count differs → likely React reconciliation corruption from a
        //     re-render that left our spans mixed with newly-injected text.
        //     We can't reliably "fix" this from inside without making the
        //     DOM more wrong; bail and wait for the next mutation. The
        //     focusin pre-unwrap (added in the sidebar listener) prevents
        //     this state from arising in the first place during edits.
        //   • same count, different URL text → an in-URL edit; unwrap and
        //     rebuild.
        const existing = el.querySelectorAll(".wv-url-span");
        if (existing.length) {
            const textNow = this.normalize(el.textContent || "");
            const reNow = new RegExp(this.URL_REGEX.source, "g");
            const want = [];
            let mNow;
            while ((mNow = reNow.exec(textNow)) !== null) {
                want.push(mNow[0].replace(this.TRAILING_RE, ""));
            }
            const have = [];
            for (const s of existing) have.push((s.textContent || "").trim());
            if (want.length !== have.length) {
                // The URL_REGEX-vs-textContent count comparison is
                // unreliable in two cases:
                //   1. Cell has wv-md spans (markdown rendering in
                //      play — `**bold**` text is not in textContent).
                //   2. Any wv-url-span is a MARKDOWN LINK, where
                //      span.textContent (label) != span.data-href
                //      (URL). textContent has the label, so URL_REGEX
                //      finds nothing but we legitimately have spans.
                // In either case, defer to the cache check below +
                // recovery path which uses cachedRaw to compute the
                // right wantMode without false-positives.
                let hasMdLinkSpan = false;
                for (const s of existing) {
                    const href = s.getAttribute("data-href") || "";
                    const label = s.textContent || "";
                    if (href && href !== label) {
                        hasMdLinkSpan = true;
                        break;
                    }
                }
                if (el.querySelector(".wv-md") || hasMdLinkSpan) {
                    this._dbg("[Weavero] _markTextLinks: count mismatch but markdown content present — deferring to cache path");
                } else {
                    // Pure URL-only render that drifted from current
                    // URL_REGEX: a scheme toggle was flipped, leaving
                    // stale styled URLs the regex no longer matches.
                    // Unwrap so the cell falls back to plain text.
                    this._dbg("[Weavero] _markTextLinks: span count mismatch (have="
                        + have.length + " want=" + want.length
                        + ") — unwrapping stale spans");
                    for (const s of existing) {
                        s.replaceWith(doc.createTextNode(s.textContent || ""));
                    }
                }
                // Fall through to the rebuild path below.
            } else {
            let same = true;
            for (let i = 0; i < want.length; i++) {
                if (want[i] !== have[i]) { same = false; break; }
            }
            if (same) {
                // URL spans are correct. But the cell may ALSO have
                // stale wv-md spans from a prior render when the
                // markdown toggle was on — toggling off doesn't
                // change URL_REGEX so this branch was firing
                // "cache hit" and bailing without noticing. Verify
                // markdown state matches what the current pref +
                // text content would produce. Critically: only
                // require a rebuild if the TEXT has markdown
                // markers — for plain-URL-only text, the markdown
                // toggle has no effect on output and we shouldn't
                // unwrap (doing so triggers a rebuild blocked by
                // the 250ms rate limit, leaving the cell stale).
                const liveHasMd = !!el.querySelector(".wv-md");
                const useMdNow = isTreeMode && this._getEnableCommentMarkdown();
                const sourceForMd = el.getAttribute("data-wv-raw") || el.textContent || "";
                const textHasMdMarkers = this.MD_REGEX.test(this.normalize(sourceForMd));
                const expectedMdSpan = textHasMdMarkers && useMdNow;
                const wantMdRebuild = liveHasMd !== expectedMdSpan;
                if (!wantMdRebuild) {
                    // Patch hover-tooltip title onto existing URL spans
                    // that were created by an earlier plugin version
                    // (pre-0.1.47) which didn't set the attribute.
                    for (const sp of existing) {
                        if (!sp.hasAttribute("title")) {
                            const u = sp.getAttribute("data-href")
                                || sp.textContent || "";
                            if (u) sp.setAttribute("title", u);
                        }
                    }
                    this._dbg("[Weavero] _markTextLinks skip: spans match current URLs (" + want.length + ")");
                    return false;
                }
                this._dbg("[Weavero] _markTextLinks: URLs match but markdown-state stale (liveHasMd="
                    + liveHasMd + " useMdNow=" + useMdNow + ") — unwrapping for rebuild");
                for (const s of existing) {
                    s.replaceWith(doc.createTextNode(s.textContent || ""));
                }
                // Also strip any wv-md spans so the rebuild starts clean.
                for (const sp of el.querySelectorAll(".wv-md")) {
                    sp.replaceWith(doc.createTextNode(sp.textContent || ""));
                }
                // Fall through to rebuild from cachedRaw.
            }
            this._dbg("[Weavero] _markTextLinks: in-URL edit detected, unwrapping " + have.length + " spans and rebuilding");
            for (const s of existing) {
                s.replaceWith(doc.createTextNode(s.textContent || ""));
            }
            // Fall through to full rebuild below.
            }
        }

        // Source-text recovery. Once we've rebuilt this element, our
        // children produce a textContent that's the STRIPPED form of the
        // original raw text (e.g. "bold something" instead of "**bold**
        // something"). If Zotero's reconciliation later removes our spans,
        // textContent loses the markdown markers / link URLs entirely and
        // we can't recreate the original from it. Stash the raw text in
        // `data-wv-raw` on rebuild and prefer it here when we can verify
        // the live text is still the form we last produced.
        const cachedRaw = el.getAttribute("data-wv-raw");
        const cachedRendered = el.getAttribute("data-wv-rendered");
        const liveText = el.textContent || "";
        const hasOurMarkers = !!el.querySelector(".wv-md, .wv-url-span");
        let text;
        if (hasOurMarkers) {
            // Spans still present. Prefer cachedRaw; if it was lost
            // (React wiped data-wv-raw), reconstruct from the spans —
            // NOT from liveText, which is the stripped form (`**bold**`
            // → "bold") and would permanently lose the markers.
            text = cachedRaw || this._reconstructSourceFromSpans(el);
        } else if (cachedRaw && cachedRendered !== null
                   && liveText === cachedRendered) {
            // Spans were reaped after our last rebuild; raw cache is the
            // source of truth.
            text = cachedRaw;
        } else {
            text = liveText;
        }
        // Markdown formatting (bold/italic/strike/code) only renders in tree
        // mode — items-tree note/text rows. Non-tree callers (the rare
        // contenteditable fallback in the right pane / sidebar) only need
        // URL marking + markdown-link rendering, both of which work
        // regardless of useMd. Full popup / sidebar markdown rendering goes
        // through _renderPreviewPanel and _renderPaneCommentInline now.
        const useMd = isTreeMode && this._getEnableCommentMarkdown();
        const hasMd = useMd && this.MD_REGEX.test(this.normalize(text));
        if (!this.hasURI(text) && !hasMd) {
            // No renderable content according to `text`. Two cases:
            //
            //   (a) text === cachedRaw: the source genuinely has no
            //       URL/markdown (e.g. a scheme toggle made the only
            //       URL un-renderable). Strip stale spans so the
            //       cell falls back to plain text matching the new
            //       pref state.
            //
            //   (b) text === liveText (recovery's stripped fallback,
            //       used when data-wv-raw was missing). Stripping
            //       here would destroy a VALID rendering we have no
            //       way to reconstruct. Bail and wait for the next
            //       cycle (e.g. when Zotero re-renders the row from
            //       its model and gives us fresh source text).
            const ranFromRaw = !!cachedRaw && text === cachedRaw;
            if (!ranFromRaw) return false;
            try {
                const stale = el.querySelectorAll(".wv-url-span, .wv-md");
                if (stale.length) {
                    const flat = (el.textContent || "").replace(/[\s ]+$/, "");
                    el.textContent = flat;
                    el.removeAttribute("data-wv-source");
                    el.removeAttribute("data-wv-rendered");
                    el.removeAttribute("data-wv-last-rebuild");
                }
            } catch (e) {}
            return false;
        }

        const norm = this.normalize(text);

        // Idempotency cache: encodes mode + content. For markdown-only
        // content (no URLs), the .wv-url-span cache check above is a no-op
        // because querySelectorAll returns 0, so without this we rebuilt
        // the DOM on every call. The popup observer in _setupReaderObserver
        // routes every popup mutation back to _injectIconIntoPopup, so a
        // non-idempotent _markTextLinks turns into an infinite loop:
        // rebuild → mutations → observer fires → _injectIconIntoPopup →
        // _markTextLinks → rebuild. Hangs Zotero. Same trick the right-pane
        // preview panel and items-list cells use.
        //
        // Honour the cache only if THREE conditions hold:
        //   1. data-wv-source matches the cache key.
        //   2. liveText matches data-wv-rendered (no partial reap that
        //      shifted textContent).
        //   3. The expected spans are still in the DOM. For bare URLs the
        //      stripped textContent equals the unstripped textContent, so
        //      check (2) is a no-op — without (3) we'd skip rebuild even
        //      though the .wv-url-span was reaped.
        // Cache key encodes mode + markdown toggle + URL_SCHEME_ALT
        // (so a URL/Zotero/App Links toggle invalidates the cache —
        // without this segment, flipping the App Links toggle leaves
        // mailto:/obsidian:// spans rendered from the previous scheme set).
        const cacheKey = (isTreeMode ? "t:" : "")
            + (useMd ? "m:" : ":")
            + this.URL_SCHEME_ALT + ":"
            + norm;
        const expectsURLSpan = this.hasURI(text);
        const expectsMdSpan = hasMd;
        const liveURLSpan = expectsURLSpan
            ? !!el.querySelector(".wv-url-span") : true;
        const liveMdSpan = expectsMdSpan
            ? !!el.querySelector(".wv-md") : true;
        if (el.getAttribute("data-wv-source") === cacheKey
            && cachedRendered !== null
            && cachedRendered === liveText
            && liveURLSpan
            && liveMdSpan) {
            this._dbg("[Weavero] _markTextLinks skip: data-wv-source cache hit");
            return false;
        }

        // Per-element rate limit. If Zotero's React reconciliation strips
        // our spans, the cache invalidates and we'd rebuild — Zotero strips
        // again — observer fires — loop. The 250 ms gate converts that
        // into a slow churn that can't lock the UI.
        const lastRebuild = parseInt(
            el.getAttribute("data-wv-last-rebuild") || "0", 10);
        if ((Date.now() - lastRebuild) < 250) {
            this._dbg("[Weavero] _markTextLinks skip: rate-limited");
            return false;
        }

        // Delegate fragment-building to the unified renderer so any
        // future per-scheme / per-content-type toggle gates in one
        // place across all five surfaces.
        const frag = this._buildCommentFragment(text, {
            doc, useMd, isTreeMode,
        });

        // Stash raw source BEFORE replacing children — afterwards textContent
        // reflects the stripped/formatted view, not the source markdown.
        el.setAttribute("data-wv-raw", text);
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(frag);
        el.setAttribute("data-wv-source", cacheKey);
        el.setAttribute("data-wv-last-rebuild", String(Date.now()));
        // Record the textContent we just produced so a later pass can detect
        // whether the live text is still our stripped form (spans got
        // reaped) or differs (user edited / new source).
        el.setAttribute("data-wv-rendered", el.textContent || "");
        return true;
    }

    /** Cheap synchronous orphan sweep — removes our overlays whose target
     *  is gone. Used by the inner-iframe MutationObserver on any childList
     *  removal so deletion feels instant; the full reconciliation pass
     *  (debounced 100 ms) handles creation + positioning. */
    _sweepStaleOverlays(idoc, reader) {
        if (!idoc) return;
        // Build set of annotation keys hidden by the reader's filter so
        // we can bypass the zoom grace period for filter-hidden buttons
        // and badges. Same source as _processNoteAnnotationOverlays.
        const hiddenKeys = new Set();
        try {
            const iwin = reader && reader._iframeWindow;
            const ireader = iwin && iwin.wrappedJSObject
                && iwin.wrappedJSObject._reader;
            const stateAnns = ireader && ireader._state
                && ireader._state.annotations;
            if (stateAnns && stateAnns.length) {
                for (const a of stateAnns) {
                    if (a && a._hidden && a.id) hiddenKeys.add(a.id);
                }
            }
        } catch (e) {}
        // Text annotations: button has a coord-derived stable ID
        // (`p{N}-t{top}-l{left}`); orphan = no textarea at the same
        // page+coords. Same tombstone-grace pattern as
        // _processTextAnnotations: don't remove a button just because
        // Zotero is mid-rerender of the textarea. Without this guard,
        // every textarea-removal mutation observed by the parent
        // mutation-observer would call us synchronously, we'd find no
        // matching textareas, and remove the button — exactly the
        // flicker we already saw with the per-scan sweep.
        //
        // Filter-hidden buttons skip the grace period: we know the
        // textarea won't reappear until the user clears the filter,
        // so making the user wait 1.5 s for the button to disappear
        // makes the filter feel unresponsive.
        try {
            const parsePxLiteral = (s) => {
                if (!s) return null;
                const m = /([0-9.]+)\s*px/.exec(s);
                return m ? parseFloat(m[1]) : null;
            };
            const liveStableIds = new Set();
            for (const ta of idoc.querySelectorAll("textarea.textAnnotation")) {
                const taTop  = parsePxLiteral(ta.style.top);
                const taLeft = parsePxLiteral(ta.style.left);
                const page = ta.closest && ta.closest(".page");
                if (taTop === null || taLeft === null || !page) continue;
                const pn = page.getAttribute("data-page-number") || "";
                liveStableIds.add(
                    "p" + pn + "-t" + taTop.toFixed(4) + "-l" + taLeft.toFixed(4));
            }
            const now = Date.now();
            const SWEEP_GRACE_MS = 1500;
            for (const btn of idoc.querySelectorAll(".wv-text-annotation-btn")) {
                const id = btn.dataset && btn.dataset.wvFor;
                if (!id) { btn.remove(); continue; }
                const annKey = btn.dataset && btn.dataset.wvAnnKey;
                if (annKey && hiddenKeys.has(annKey)) {
                    btn.remove();
                    continue;
                }
                if (liveStableIds.has(id)) {
                    btn.dataset.wvLastSeen = String(now);
                } else {
                    const lastSeen = parseInt(btn.dataset.wvLastSeen || "0", 10);
                    if (now - lastSeen > SWEEP_GRACE_MS) btn.remove();
                }
            }
        } catch(e) { this._dbg("[Weavero] sweep text-ann err: " + e); }

        // Marker badges: build live-key set from the canonical data layer
        // (attachment.getAnnotations()) and drop any badge whose key isn't
        // present. We avoid DOM-attribute guessing because Zotero's
        // .customAnnotationLayer children may not carry the key in a
        // predictable attribute across versions.
        //
        // Filter-out: also subtract annotations the reader has hidden
        // via its sidebar filter (color/tag/author/query). Those still
        // exist in the data model but the reader doesn't draw them on
        // the page, so leaving the badge floating over an empty spot
        // is exactly the bug this sweep is here to prevent.
        try {
            const att = reader && reader._item;
            if (!att) return;
            let anns = [];
            try { anns = att.getAnnotations() || []; } catch(e) { return; }
            const liveKeys = new Set(anns.map(a => a.key).filter(Boolean));
            // Reuse the hiddenKeys set computed at the top of this
            // function instead of re-walking _state.annotations.
            for (const k of hiddenKeys) liveKeys.delete(k);
            for (const badge of idoc.querySelectorAll(".wv-marker-badge")) {
                const k = badge.getAttribute("data-wv-for");
                if (!k || !liveKeys.has(k)) badge.remove();
            }
        } catch(e) { this._dbg("[Weavero] sweep badge err: " + e); }
    }

    /** Find sidebar annotation comment elements and inject URL spans. */
    /** Sample the inner-iframe body's background to decide whether the
     *  reader is showing light or dark pages, then write a dynamic
     *  stylesheet that drives bg/color/border/hover-bg for both
     *  .wv-marker-badge and .wv-text-annotation-btn. Both surfaces
     *  share one rule, so every reader-side icon (canvas badges +
     *  text-annotation buttons) adapts together. The static
     *  weavero-inner-styles sheet keeps only structural
     *  rules (position, z-index, transitions, opacity); colors live
     *  here so they can refresh when the theme changes. */
    _applyDynamicReaderTheme(idoc) {
        if (!idoc) return;
        let dark = false;
        try {
            const win = idoc.defaultView;
            const root = idoc.documentElement;
            // The reader's appearance theme (Original / Dark / Sepia /
            // custom) decides the actual rendered PDF page color, which
            // is what the badge sits on. Two reliable sources for that:
            //   1. The `--background-color` CSS variable PDF.js sets on
            //      <html>'s inline style (e.g. #FFFFFF for Original,
            //      #000000 for Dark).
            //   2. The `.page` element's computed background-color —
            //      same value, materialised on the page wrapper.
            // We try (1) first because it's the canonical declaration
            // and exists even before any page has rendered. Body bg /
            // data-color-scheme track the viewer CHROME (which follows
            // Zotero's UI theme), not the page rendering, so they're
            // the wrong signal for tinting the chain over the page.
            const parseLuma = (s) => {
                if (!s) return null;
                s = s.trim();
                let r = null, g = null, b = null;
                let m = s.match(/^#([0-9a-f]{3})$/i);
                if (m) {
                    r = parseInt(m[1][0] + m[1][0], 16);
                    g = parseInt(m[1][1] + m[1][1], 16);
                    b = parseInt(m[1][2] + m[1][2], 16);
                } else if ((m = s.match(/^#([0-9a-f]{6})$/i))) {
                    r = parseInt(m[1].slice(0, 2), 16);
                    g = parseInt(m[1].slice(2, 4), 16);
                    b = parseInt(m[1].slice(4, 6), 16);
                } else if ((m = s.match(
                        /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?/))) {
                    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
                    if (alpha < 0.5) return null;    // transparent → no info
                    r = +m[1]; g = +m[2]; b = +m[3];
                } else {
                    return null;
                }
                return 0.299 * r + 0.587 * g + 0.114 * b;
            };
            const sample = (el, propName?) => {
                if (!el) return null;
                const cs = win && win.getComputedStyle(el);
                if (!cs) return null;
                const v = propName ? cs.getPropertyValue(propName) : cs.backgroundColor;
                const luma = parseLuma(v);
                return luma === null ? null : luma < 128;
            };
            // 1. --background-color CSS var (PDF.js's declared page bg).
            let detected = sample(root, "--background-color");
            // 2. .page element's actual rendered bg.
            if (detected === null) detected = sample(idoc.querySelector(".page"));
            // 3. Body / html bg (only useful if the viewer chrome and
            //    page happen to share the theme).
            if (detected === null) detected = sample(idoc.body);
            if (detected === null) detected = sample(root);
            if (detected === null) {
                // Last resort: prefers-color-scheme.
                try {
                    detected = !!(win && win.matchMedia
                        && win.matchMedia("(prefers-color-scheme: dark)").matches);
                } catch (e) {}
            }
            dark = !!detected;
        } catch (e) {}
        const btnBg     = dark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.12)";
        const btnHovBg  = dark ? "rgba(255, 255, 255, 0.32)" : "rgba(0, 0, 0, 0.22)";
        const btnColor  = dark ? "#f4f4f4" : "#1a1a1a";
        const btnBorder = dark ? "1px solid rgba(255, 255, 255, 0.25)"
                               : "1px solid rgba(0, 0, 0, 0.18)";
        // Apply the .wv-reader-dark class to the inner iframe's
        // documentElement so the M-icon dark variant rule (in the
        // inner stylesheet) takes effect when the reader is in
        // dark mode.
        try {
            if (idoc.documentElement) {
                idoc.documentElement.classList.toggle("wv-reader-dark", dark);
            }
        } catch (e) {}
        let style = idoc.getElementById("weavero-inner-dynamic-styles");
        if (!style) {
            style = idoc.createElement("style");
            style.id = "weavero-inner-dynamic-styles";
            (idoc.head || idoc.documentElement).appendChild(style);
        }
        // Boxless look: no bg, no border, just the bare 🔗 / M glyph.
        // The `.wv-format-md` rules below (with !important) still draw
        // the amber disc + "M" for markdown-only / URL+markdown icons,
        // so type-2 and type-3 keep their distinguishing decoration.
        // Hover background mirrors Zotero's --fill-quinary look —
        // a very subtle translucent gray that adapts to theme. We
        // can't use the CSS variable inside the PDF.js iframe (it's
        // a separate document without Zotero chrome), so we set the
        // literal value computed from the same theme detection.
        const btnHoverBg = dark
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(0, 0, 0, 0.07)";
        // Only rewrite the stylesheet when the dark flag actually
        // flips. Setting textContent re-parses the rule set and
        // triggers a full style recalc — calling this every scan
        // (which happens on every PDF zoom tick) was a flicker
        // source. The dataset stamp lets repeat calls short-circuit.
        const expectedKey = dark ? "1" : "0";
        if (style.dataset.wvLastTheme !== expectedKey) {
            style.dataset.wvLastTheme = expectedKey;
            style.textContent =
                ".wv-marker-badge,"
                + ".wv-text-annotation-btn {"
                + "  color: " + btnColor + ";"
                + "}"
                + ".wv-marker-badge:hover,"
                + ".wv-text-annotation-btn:hover {"
                + "  background: " + btnHoverBg + ";"
                + "}";
        }
    }

    /** Sample the Zotero main window's body background to decide
     *  whether the UI is currently in dark mode. Mirrors the
     *  technique _applyDynamicReaderTheme uses for the reader, but
     *  scoped to the chrome (so the same logic produces the right
     *  answer regardless of how Zotero gets its theme — OS-driven,
     *  manual override, custom CSS). */
    _detectUIDark() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return false;
            // Zotero's main window is XUL — `doc.body` is null
            // because the root is <window>, not <html><body>. Sample
            // documentElement (or body if it exists, e.g. on platforms
            // where the chrome is HTML-rooted) instead, and fall back
            // to OS color-scheme preference if the bg is transparent
            // or unparseable.
            const target = doc.body || doc.documentElement;
            if (target) {
                const bg = win.getComputedStyle(target).backgroundColor || "";
                const m = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?/);
                if (m) {
                    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
                    if (alpha >= 0.5) {
                        const luma = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
                        return luma < 128;
                    }
                }
            }
            // Last resort: prefers-color-scheme.
            try {
                if (win.matchMedia
                    && win.matchMedia("(prefers-color-scheme: dark)").matches) {
                    return true;
                }
            } catch (e) {}
        } catch (e) {}
        return false;
    }

    /** Apply the .wv-ui-dark class to every UI surface that should
     *  follow the Zotero UI theme — the main window doc and each
     *  open reader's outer iframe doc (which hosts the reader
     *  sidebar). The PDF.js inner iframe is intentionally NOT
     *  touched here; it follows the reader theme via
     *  _applyDynamicReaderTheme's :root.wv-reader-dark class. */
    _applyUIThemeClass() {
        try {
            const dark = this._detectUIDark();
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (doc && doc.documentElement) {
                doc.documentElement.classList.toggle("wv-ui-dark", dark);
            }
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document && iwin.document.documentElement) {
                        iwin.document.documentElement.classList.toggle(
                            "wv-ui-dark", dark);
                    }
                } catch (e) {}
            }
            // Theme-aware pref-pane icon. Updates the stored
            // `image` on the registered pane (so future opens of
            // the prefs window pick up the new URL) AND the live
            // DOM of any currently-open prefs window (so the swap
            // is visible immediately, without reload).
            this._refreshPrefPaneIcon(dark);
        } catch (e) {
            Zotero.debug("[Weavero] _applyUIThemeClass err: " + e);
        }
    }

    /** Refresh the pref-pane icon URL on theme change. Mutates
     *  the registered pane's `image` field (which Zotero's
     *  preferences renderer reads when the prefs window mounts)
     *  AND finds any open prefs windows to update the rendered
     *  `<image>` element directly — see upstream
     *  preferences.js `_addPane` for the DOM shape. */
    _refreshPrefPaneIcon(isDark) {
        try {
            const theme = isDark ? "dark" : "light";
            const newURL = this._rootURI + "icons/icon-" + theme + "-32.png";
            const pluginID = "weavero@mjthoraval";
            const panes = (Zotero.PreferencePanes
                && Zotero.PreferencePanes.pluginPanes) || [];
            const ours = [];
            for (const pane of panes) {
                if (pane.pluginID === pluginID) {
                    pane.image = newURL;
                    ours.push(pane);
                }
            }
            if (!ours.length) return;
            const wins = Services.wm.getEnumerator("zotero:pref");
            while (wins.hasMoreElements()) {
                const w = wins.getNext() as any;
                try {
                    const wdoc = w.document;
                    for (const pane of ours) {
                        const item = wdoc.querySelector(
                            'richlistitem[value="' + pane.id + '"]');
                        const img = item && item.querySelector("image");
                        if (img) img.setAttribute("src", newURL);
                    }
                } catch (e) {}
            }
        } catch (e) {
            Zotero.debug("[Weavero] _refreshPrefPaneIcon err: " + e);
        }
    }

    /** Inject the floating 🔗 button next to text annotations whose value
     *  contains a URL. The button opens the popup with all clickable URLs.
     *  Idempotent — skips textareas that already have a button, and removes
     *  the button when a textarea no longer has any URL in its value. */
    _processTextAnnotations(idoc) {
        if (!this._getEnableReaderView() || !this._getEnableReaderViewIcons()) {
            for (const b of idoc.querySelectorAll(".wv-text-annotation-btn")) b.remove();
            return;
        }
        const annotations = idoc.querySelectorAll("textarea.textAnnotation");
        if (annotations.length) {
            this._dbg("[Weavero] _processTextAnnotations: "
                + annotations.length + " textarea.textAnnotation found");
        }

        // Refresh the dynamic theme stylesheet — covers both this
        // surface and the marker badges via the shared rule.
        this._applyDynamicReaderTheme(idoc);

        // Resolve the page-level scale-factor for this textarea so the
        // glyph + box scale with zoom (matches the marker-badge behaviour
        // for canvas-drawn annotations).
        const scaleFactorFor = (ta) => {
            try {
                const page = ta.closest && ta.closest(".page");
                if (page) {
                    const cs = idoc.defaultView.getComputedStyle(page);
                    let sf = parseFloat(cs.getPropertyValue("--scale-factor"));
                    if (sf && isFinite(sf)) return sf;
                    let p = page.parentElement;
                    while (p) {
                        const ps = idoc.defaultView.getComputedStyle(p);
                        sf = parseFloat(ps.getPropertyValue("--scale-factor"));
                        if (sf && isFinite(sf)) return sf;
                        p = p.parentElement;
                    }
                }
            } catch(e) {}
            return 1;
        };
        // Extract the unscaled px coordinate from a textarea's inline
        // top/left. PDF.js writes them as `calc(N px * var(--scale-factor))`
        // on most builds; we want N so we can rebuild the same expression
        // with our page-offset variable prepended. Returns null if no
        // px literal can be found — the caller falls back to dividing
        // offsetTop/offsetLeft by the scale-factor.
        const parsePxLiteral = (s) => {
            if (!s) return null;
            const m = /([0-9.]+)\s*px/.exec(s);
            return m ? parseFloat(m[1]) : null;
        };

        const overlay = this._ensureBadgeOverlay(idoc);
        if (!overlay) return;

        // Coord-based stable IDs are crucial for text annotations: Zotero
        // re-renders text annotations on zoom (the textarea is replaced
        // with a new DOM node, dataset.alTaId is gone). If we keyed the
        // button by alTaId, every zoom would orphan the old button and
        // the loop would create a fresh one — exactly the flicker the
        // user reports. PDF coordinates ARE stable across the textarea
        // re-creation (they're properties of the underlying annotation,
        // not the DOM node), so a key derived from page + coords
        // identifies "the same button" across re-renders.
        const stableIdFor = (pn, taTop, taLeft) =>
            "p" + pn + "-t" + taTop.toFixed(4) + "-l" + taLeft.toFixed(4);

        // First pass: figure out which textareas are eligible (URL or
        // markdown in their value, parsable coords) and collect their
        // stable IDs.
        const wanted = []; // {ta, text, page, pn, taTop, taLeft, stableId, pageOffTop, pageOffLeft}
        const expectedIds = new Set();
        for (const ta of annotations) {
            const text = (ta.value || ta.getAttribute("data-comment") || "").trim();
            if (!this._iconWantedFor(text)) continue;
            let taTop  = parsePxLiteral(ta.style.top);
            let taLeft = parsePxLiteral(ta.style.left);
            const page = ta.closest && ta.closest(".page");
            if (!page) continue;
            if (taTop === null || taLeft === null) {
                const sf = scaleFactorFor(ta) || 1;
                if (taTop  === null) taTop  = ta.offsetTop  / sf;
                if (taLeft === null) taLeft = ta.offsetLeft / sf;
            }
            if (!isFinite(taTop) || !isFinite(taLeft)) continue;
            const pn = page.getAttribute("data-page-number") || "";
            const pageOffTop  = page.offsetTop  + "px";
            const pageOffLeft = page.offsetLeft + "px";
            const stableId = stableIdFor(pn, taTop, taLeft);
            expectedIds.add(stableId);
            wanted.push({ ta, text, page, pn, taTop, taLeft, stableId, pageOffTop, pageOffLeft });
        }

        // Tombstone-grace sweep. Zotero re-creates text annotation
        // textareas during PDF.js's zoom transition — they vanish for
        // ~120 ms and reappear at the same PDF coords. If we removed
        // buttons the instant their stable ID isn't in expectedIds,
        // every zoom would briefly empty the overlay and the button
        // would visibly flicker out and back. Instead we stamp
        // `alLastSeen` whenever a button's stable ID matches a current
        // textarea, and only remove buttons whose lastSeen is older
        // than the grace period below — long enough to outlive a zoom
        // transient, short enough that a deleted annotation's button
        // is gone before the user notices.
        const now = Date.now();
        const SWEEP_GRACE_MS = 1500;
        for (const btn of overlay.querySelectorAll(".wv-text-annotation-btn")) {
            if (expectedIds.has(btn.dataset.wvFor)) {
                btn.dataset.wvLastSeen = String(now);
            } else {
                const lastSeen = parseInt(btn.dataset.wvLastSeen || "0", 10);
                if (now - lastSeen > SWEEP_GRACE_MS) btn.remove();
            }
        }
        // Sweep any pre-overlay leftovers in the inner doc (older
        // builds appended the button as a sibling of the textarea).
        for (const btn of idoc.querySelectorAll(".customAnnotationLayer .wv-text-annotation-btn")) {
            btn.remove();
        }

        for (const w of wanted) {
            let btn = overlay.querySelector(
                ".wv-text-annotation-btn[data-wv-for='" + w.stableId + "']");
            const isNew = !btn;
            if (isNew) {
                btn = idoc.createElement("button");
                btn.className = "wv-btn wv-text-annotation-btn";
                btn.dataset.wvFor = w.stableId;
                btn.dataset.wvPage = w.pn;
                btn.dataset.wvTopPdf  = String(w.taTop);
                btn.dataset.wvLeftPdf = String(w.taLeft);
                btn.dataset.wvPageOffTop  = w.pageOffTop;
                btn.dataset.wvPageOffLeft = w.pageOffLeft;
                btn.dataset.wvComment = w.text;
                btn.dataset.wvLastSeen = String(Date.now());
                // Capture the annotation key so the sweep can match
                // this button against filter-hidden annotations
                // immediately (bypassing the 1500 ms zoom-flicker
                // grace period). Zotero sets data-id on the textarea
                // to the annotation's item key — see page.js:996 in
                // zotero/reader.
                const annKey = w.ta && w.ta.getAttribute
                    ? w.ta.getAttribute("data-id") : null;
                if (annKey) btn.dataset.wvAnnKey = annKey;
                this._applyIconState(btn, w.text);
                btn.style.setProperty("--page-offset-top",  w.pageOffTop);
                btn.style.setProperty("--page-offset-left", w.pageOffLeft);
                btn.style.cssText += [
                    "position: absolute",
                    "top: calc(var(--page-offset-top, 0px) + "
                        + w.taTop + "px * var(--scale-factor, 1))",
                    "left: calc(var(--page-offset-left, 0px) + "
                        + w.taLeft + "px * var(--scale-factor, 1))",
                    "z-index: 99999",
                    "pointer-events: auto",
                    "font-size: calc(7px * var(--scale-factor, 1))",
                    "padding: 0",
                    "margin: 0",
                    "border: none",
                    "background: transparent",
                    "appearance: none",
                    "-moz-appearance: none",
                    "border-radius: calc(2px * var(--scale-factor, 1))",
                ].join("; ") + ";";
                btn.addEventListener("mousedown", e => {
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    e.preventDefault();
                }, true);
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // The textarea ref captured in the click closure may
                    // be stale (Zotero re-renders text annotations) —
                    // resolve it dynamically from the current DOM by the
                    // button's stable position-derived ID.
                    let liveTa = null;
                    for (const t of idoc.querySelectorAll("textarea.textAnnotation")) {
                        const tt = parsePxLiteral(t.style.top);
                        const tl = parsePxLiteral(t.style.left);
                        const tp = t.closest && t.closest(".page");
                        if (tt === null || tl === null || !tp) continue;
                        const tpn = tp.getAttribute("data-page-number") || "";
                        if (stableIdFor(tpn, tt, tl) === w.stableId) {
                            liveTa = t;
                            break;
                        }
                    }
                    const fresh = liveTa
                        ? (liveTa.value || liveTa.getAttribute("data-comment") || "").trim()
                        : w.text;
                    const sc = this._screenCoords(btn);
                    this.openCommentPopup(fresh, {
                        anchorNode: btn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                overlay.appendChild(btn);
                this._attachTextAnnotationStyleObserver(idoc, w.ta, btn, w.pn);
                continue;
            }
            // Existing button: refresh page-offset variables only (the
            // calc() expressions and PDF coords don't need touching as
            // long as the stable ID matches — i.e. the annotation didn't
            // move). _applyIconState is GATED on comment-text change:
            // setAttribute(data-has-url) fires a mutation even when the
            // value is the same, so calling it every scan would thrash
            // the button's attributes during zoom and produce a visible
            // flicker. We only re-apply when the comment actually
            // changed (user edit).
            if (btn.dataset.wvPage !== w.pn) btn.dataset.wvPage = w.pn;
            // Backfill annotation key onto buttons created by older
            // builds that didn't capture it. Without this the
            // filter-bypass in _sweepStaleOverlays can't match the
            // button to a hidden annotation.
            if (!btn.dataset.wvAnnKey) {
                const annKey = w.ta && w.ta.getAttribute
                    ? w.ta.getAttribute("data-id") : null;
                if (annKey) btn.dataset.wvAnnKey = annKey;
            }
            if (btn.dataset.wvComment !== w.text) {
                btn.dataset.wvComment = w.text;
                this._applyIconState(btn, w.text);
            }
            if (btn.dataset.wvPageOffTop !== w.pageOffTop) {
                btn.dataset.wvPageOffTop = w.pageOffTop;
                btn.style.setProperty("--page-offset-top", w.pageOffTop);
            }
            if (btn.dataset.wvPageOffLeft !== w.pageOffLeft) {
                btn.dataset.wvPageOffLeft = w.pageOffLeft;
                btn.style.setProperty("--page-offset-left", w.pageOffLeft);
            }
            this._attachTextAnnotationStyleObserver(idoc, w.ta, btn, w.pn);
        }
    }

    /** Attach a per-textarea MutationObserver on `style` so the icon
     *  button tracks PDF.js's drag/resize updates in real time. PDF.js
     *  rewrites the textarea's inline `top`/`left` on every pointermove
     *  while a text annotation is being moved or resized; the observer
     *  fires synchronously after each write, before paint, so the
     *  button follows at native repaint cadence — no save round-trip.
     *
     *  Without this, the button only repositioned when a periodic
     *  `_processTextAnnotations` scan ran (triggered by the iframe-
     *  childList MutationObserver or, after drop, by the modify
     *  notifier), giving a visible "icon snaps to position" lag.
     *
     *  Idempotent: keyed by textarea via WeakMap. If the same textarea
     *  later gets a new button (e.g. after a zoom re-render), the
     *  prior observer is disconnected and replaced. */
    _attachTextAnnotationStyleObserver(idoc, ta, btn, pn) {
        if (!this._textAnnotationStyleObservers) {
            this._textAnnotationStyleObservers = new WeakMap();
        }
        const existing = this._textAnnotationStyleObservers.get(ta);
        if (existing && existing.btn === btn) return;
        if (existing) {
            try { existing.obs.disconnect(); } catch(e) {}
        }
        const win = idoc.defaultView;
        if (!win || !win.MutationObserver) return;
        const parsePx = (s) => {
            const m = /([0-9.]+)\s*px/.exec(s || "");
            return m ? parseFloat(m[1]) : null;
        };
        let entry;
        const update = () => {
            if (!btn.isConnected) {
                try { entry.obs.disconnect(); } catch(e) {}
                this._textAnnotationStyleObservers.delete(ta);
                return;
            }
            const taTop  = parsePx(ta.style.top);
            const taLeft = parsePx(ta.style.left);
            if (taTop === null || taLeft === null) return;
            if (!isFinite(taTop) || !isFinite(taLeft)) return;
            btn.style.top = "calc(var(--page-offset-top, 0px) + "
                + taTop + "px * var(--scale-factor, 1))";
            btn.style.left = "calc(var(--page-offset-left, 0px) + "
                + taLeft + "px * var(--scale-factor, 1))";
            // Keep dataset coords + stableId in sync. The next
            // `_processTextAnnotations` pass derives stableId from
            // (page, taTop, taLeft); without this rewrite it would
            // miss the existing button under its new coords, create a
            // duplicate, and the tombstone-grace window would briefly
            // overlap two icons before sweeping the old one.
            const newStableId = "p" + pn
                + "-t" + taTop.toFixed(4)
                + "-l" + taLeft.toFixed(4);
            if (btn.dataset.wvFor !== newStableId) {
                btn.dataset.wvFor    = newStableId;
                btn.dataset.wvTopPdf  = String(taTop);
                btn.dataset.wvLeftPdf = String(taLeft);
            }
        };
        const obs = new win.MutationObserver(update);
        obs.observe(ta, { attributes: true, attributeFilter: ["style"] });
        entry = { obs, btn };
        this._textAnnotationStyleObservers.set(ta, entry);
    }

    /** While the user has the pointer down inside the reader iframe,
     *  poll the in-iframe Reader's pdf-view `action` state on each
     *  animation frame and re-place the corresponding badge. This is
     *  the only way to track canvas-rendered annotations (highlight /
     *  underline / image / ink) during edit — they have no DOM marker
     *  to observe; PDF.js redraws to canvas directly.
     *
     *  Upstream's pdf-view.js handles drag/resize by mutating
     *  `this.action.annotation.position` synchronously on each
     *  pointermove (`'updateAnnotationRange'` for highlight selection
     *  extension, `'resize'` and `'moveAndDrag'` for box annotations),
     *  then calls `this._render()`. The `position` is the same field
     *  our badge top/left calc() expressions are derived from, so
     *  reading it on rAF and recomputing is enough.
     *
     *  Cross-realm read goes through `iwin.wrappedJSObject._reader`
     *  (set by `index.zotero.js`). Wrapped property access from
     *  chrome works for plain data values (numbers, strings, simple
     *  objects); we only read scalars + arrays of scalars from
     *  position.rects[0].
     *
     *  Per-reader. The rAF only runs between pointerdown and
     *  pointerup, so idle CPU cost is zero. */
    _setupAnnotationDragTracker(reader, idoc) {
        const win = idoc && idoc.defaultView;
        if (!win || !win.requestAnimationFrame) return;
        if (!this._annotationDragTrackers) {
            this._annotationDragTrackers = new WeakMap();
        }
        if (this._annotationDragTrackers.has(reader)) return;
        const state: any = { active: false, raf: 0 };
        const readAction = () => {
            try {
                const iwin = reader._iframeWindow;
                if (!iwin || !iwin.wrappedJSObject) return null;
                const ireader = iwin.wrappedJSObject._reader;
                if (!ireader) return null;
                const view = ireader._primaryView;
                if (!view) return null;
                return view.action || null;
            } catch (e) { return null; }
        };
        const tick = () => {
            if (!state.active) { state.raf = 0; return; }
            try {
                const action = readAction();
                // The live position is split across two fields depending
                // on the action type:
                //   - 'updateAnnotationRange' (highlight / underline)
                //     writes to action.annotation.position.
                //   - 'resize' / 'moveAndDrag' (image / ink / text-box)
                //     writes to action.position and leaves
                //     action.annotation.position frozen at drag-start.
                // Prefer action.position when present, fall back to
                // action.annotation.position. (Upstream pdf-view.js:
                //   - L2740-2745 highlight: action.annotation = { ..., position: _position }
                //   - L2807-2808 image:     action.position = { ..., rects: [rect] }
                // )
                if (action && action.annotation && action.annotation.id) {
                    const livePos = action.position
                        || (action.annotation && action.annotation.position);
                    if (livePos && livePos.rects && livePos.rects.length) {
                        this._updateCanvasBadgePositionLive(idoc, {
                            id: action.annotation.id,
                            position: livePos,
                        });
                        // Snapshot the live position + the dragged key
                        // so the post-pointerup commit-pending guard
                        // (in `_processNoteAnnotationOverlays`) knows
                        // where the badge legitimately sits and can
                        // skip the database re-placement until the
                        // commit catches up.
                        state.lastDraggedKey = action.annotation.id;
                        state.lastLivePos = livePos;
                    }
                }
            } catch (e) {}
            state.raf = win.requestAnimationFrame(tick);
        };
        const start = () => {
            if (state.active) return;
            state.active = true;
            state.raf = win.requestAnimationFrame(tick);
        };
        const stop = () => {
            state.active = false;
            if (state.raf) {
                try { win.cancelAnimationFrame(state.raf); } catch(e) {}
            }
            state.raf = 0;
            // If a drag just ended, mark the dragged annotation as
            // "commit-pending" so the immediate dragEndPointerUp
            // rescan doesn't snap the badge back to the pre-drag
            // database position. The pending entry is consulted by
            // `_processNoteAnnotationOverlays` and cleared once the
            // database position matches the live drag-end position
            // (or after a 2 s safety timeout).
            if (state.lastDraggedKey && state.lastLivePos) {
                if (!this._dragEndPending) {
                    this._dragEndPending = new Map();
                }
                this._dragEndPending.set(state.lastDraggedKey, {
                    livePos: state.lastLivePos,
                    ts: Date.now(),
                });
                state.lastDraggedKey = null;
                state.lastLivePos = null;
            }
        };
        idoc.addEventListener("pointerdown", start, true);
        idoc.addEventListener("pointerup", stop, true);
        idoc.addEventListener("pointercancel", stop, true);
        win.addEventListener("blur", stop);
        this._annotationDragTrackers.set(reader, {
            stop, start, idoc, win,
            handlers: { start, stop }
        });
    }

    /** Re-place the .wv-marker-badge(s) for a single annotation given
     *  a live `annotation` object (from upstream's
     *  `_primaryView.action.annotation`). Mirrors the placement formula
     *  in `_processNoteAnnotationOverlays`: leftPdf = rect.x1, topPdf
     *  = pageHeight - rect.y2, with the comment badge offset by
     *  REL_OFFSET_PDF when a relations badge also exists for the same
     *  annotation. */
    _updateCanvasBadgePositionLive(idoc, ann) {
        const overlay = idoc.querySelector(".pdfViewer .wv-badge-overlay");
        if (!overlay) return;
        const key = ann.id;
        if (!key) return;
        const pos = ann.position;
        if (!pos || !pos.rects || !pos.rects.length) return;
        const r = pos.rects[0];
        if (!r || r.length < 4) return;
        const pageIdx = pos.pageIndex || 0;
        const pn = pageIdx + 1;
        const page = idoc.querySelector(
            ".pdfViewer .page[data-page-number=\"" + pn + "\"]");
        if (!page) return;
        const pageHeight = parseFloat(page.dataset.wvPageHeight || "");
        if (!pageHeight || !isFinite(pageHeight)) return;
        const x1 = r[0], y2 = r[3];
        if (!isFinite(x1) || !isFinite(y2)) return;
        // Mirror the steady-state placement constants from
        // _processNoteAnnotationOverlays. Keep in sync.
        const REL_OFFSET_PDF      = 8;
        const HANDLE_CLEAR_DX_PDF = 1.25;
        const HANDLE_CLEAR_DY_PDF = 1.25;
        const topPdf = pageHeight - y2 - HANDLE_CLEAR_DY_PDF;
        const cmtBadge = overlay.querySelector(
            ".wv-marker-badge[data-wv-for=\"" + key + "\"]"
            + "[data-wv-purpose=\"comment\"]");
        const relBadge = overlay.querySelector(
            ".wv-marker-badge[data-wv-for=\"" + key + "\"]"
            + "[data-wv-purpose=\"relations\"]");
        const hasBoth = !!(cmtBadge && relBadge);
        const place = (badge, leftPdf) => {
            badge.style.left = "calc(var(--page-offset-left, 0px) + "
                + leftPdf + "px * var(--scale-factor, 1))";
            badge.style.top = "calc(var(--page-offset-top, 0px) + ("
                + topPdf + "px - 5px) * var(--scale-factor, 1))";
            badge.dataset.wvLeftPdf = String(leftPdf);
            badge.dataset.wvTopPdf  = String(topPdf);
        };
        if (relBadge) place(relBadge, x1 + HANDLE_CLEAR_DX_PDF);
        if (cmtBadge) place(cmtBadge, x1 + HANDLE_CLEAR_DX_PDF
            + (hasBoth ? REL_OFFSET_PDF : 0));
    }

    /** Get / create the .wv-badge-overlay div that hosts BOTH our marker
     *  badges and our text-annotation buttons. Living inside .pdfViewer
     *  as a sibling of .page elements (instead of inside .page >
     *  .customAnnotationLayer where Zotero originally puts things) is
     *  what keeps these icons visible through PDF.js's zoom-stop
     *  re-render: the `loading` class transitions, opacity changes,
     *  and any inline-style flicker that PDF.js applies to .page
     *  can't reach a node outside of it. Opacity in particular is
     *  multiplicative across ancestors and CAN'T be overridden by
     *  a child's CSS — the only real fix is to live in a different
     *  subtree. The reposition observer is wired up on first creation
     *  so the page-offset CSS variables refresh when pages reflow. */
    _ensureBadgeOverlay(idoc) {
        const pdfViewer = idoc.querySelector(".pdfViewer");
        if (!pdfViewer) return null;
        let overlay = pdfViewer.querySelector(":scope > .wv-badge-overlay");
        if (!overlay) {
            overlay = idoc.createElement("div");
            overlay.className = "wv-badge-overlay";
            // High z-index defeats every PDF.js-side layer that might
            // otherwise paint above us. PDF.js's annotationLayer and
            // textLayer sit at z=2/z=3 within the page; .customAnnotationLayer
            // is at z=3. We pick a value that's safely above all of
            // them yet still finite (1e6 fits comfortably in 32-bit).
            overlay.style.cssText = "position: absolute; top: 0; left: 0;"
                + " width: 100%; height: 100%;"
                + " pointer-events: none; z-index: 1000000;";
            pdfViewer.appendChild(overlay);
            this._setupBadgeRepositionObserver(idoc, pdfViewer, overlay);
        }
        return overlay;
    }

    /** Watch .pdfViewer + each .page for `style` mutations (PDF.js sets
     *  --scale-factor on the viewer, and width/height on each page when
     *  zoom settles). When fired, refresh the per-icon `--page-offset-top`
     *  and `--page-offset-left` CSS variables so calc() in each badge's
     *  inline `top`/`left` re-evaluates with the new page position.
     *  All MutationObserver / requestAnimationFrame access goes through
     *  `idoc.defaultView`: globals from this constructor's scope don't
     *  exist inside the PDF.js inner iframe. */
    _setupBadgeRepositionObserver(idoc, pdfViewer, overlay) {
        if (!this._badgeRepositionObservers) {
            this._badgeRepositionObservers = new WeakMap();
        }
        if (this._badgeRepositionObservers.has(idoc)) return;
        const win = idoc.defaultView;
        if (!win || !win.MutationObserver || !win.requestAnimationFrame) {
            this._dbg("[Weavero] reposition obs: missing win APIs");
            return;
        }
        let raf = 0;
        const reposition = () => {
            if (raf) return;
            raf = win.requestAnimationFrame(() => {
                raf = 0;
                const icons = overlay.querySelectorAll(
                    ".wv-marker-badge, .wv-text-annotation-btn");
                for (const el of icons) {
                    const pn = el.dataset.wvPage;
                    if (!pn) continue;
                    const page = idoc.querySelector(
                        ".pdfViewer .page[data-page-number=\"" + pn + "\"]");
                    if (!page) continue;
                    const newTop  = page.offsetTop + "px";
                    const newLeft = page.offsetLeft + "px";
                    if (el.dataset.wvPageOffTop !== newTop) {
                        el.dataset.wvPageOffTop = newTop;
                        el.style.setProperty("--page-offset-top", newTop);
                    }
                    if (el.dataset.wvPageOffLeft !== newLeft) {
                        el.dataset.wvPageOffLeft = newLeft;
                        el.style.setProperty("--page-offset-left", newLeft);
                    }
                }
            });
        };
        const obs = new win.MutationObserver(reposition);
        obs.observe(pdfViewer, { attributes: true, attributeFilter: ["style"] });
        const pageObs = new win.MutationObserver(reposition);
        for (const page of pdfViewer.querySelectorAll(".page")) {
            pageObs.observe(page, { attributes: true, attributeFilter: ["style"] });
        }
        this._badgeRepositionObservers.set(idoc, { obs, pageObs, overlay });
    }

    /** Inject 🔗 badges over canvas-rendered annotations (note, highlight,
     *  underline, image, ink) whose comments contain URLs. These annotations
     *  have no DOM marker — Zotero draws the icon directly to the page
     *  canvas — so we can't decorate an existing element. Instead we use
     *  the annotation's PDF-coordinate rects + the page's CSS
     *  `--scale-factor` variable (the same mechanism Zotero uses to position
     *  text-annotation textareas) to place a DOM badge on top of the
     *  canvas at the matching screen location. The badge is purely visual
     *  (pointer-events: none); clicking the underlying icon still goes to
     *  Zotero's click handler as before, and our existing `_markTextLinks`
     *  pass styles the URL inside the popup that Zotero opens.
     *
     *  Implementation details:
     *    • Annotations come from `reader._item.getAnnotations()`. Text
     *      annotations are skipped (handled by `_processTextAnnotations`).
     *    • Per page, we find the matching `.customAnnotationLayer` via the
     *      enclosing `.page[data-page-number]`. PDF page index is 0-based
     *      while data-page-number is 1-based.
     *    • Position formula: PDF rects are bottom-up (y axis points up),
     *      while the viewer DOM is top-down. So
     *          left   = x1
     *          top    = pageHeight - y2
     *          width  = x2 - x1
     *          height = y2 - y1
     *      where pageHeight is the unscaled page height in PDF user space.
     *      We read pageHeight from the .page element's CSS height divided
     *      by `--scale-factor`.
     *    • Each value is then placed as `calc(<n>px * var(--scale-factor))`
     *      so the badge tracks zoom changes automatically. */
    _processNoteAnnotationOverlays(idoc, reader) {
        if (!this._getEnableReaderView() || !this._getEnableReaderViewIcons()) {
            for (const b of idoc.querySelectorAll(".wv-marker-badge")) b.remove();
            return;
        }
        if (!reader || !reader._item) return;
        const attachment = reader._item;

        // Pull all annotations belonging to this attachment. getAnnotations
        // is sync if items are loaded (which they are by the time the
        // reader has rendered).
        let annotations = [];
        try { annotations = attachment.getAnnotations() || []; }
        catch(e) { this._dbg("[Weavero] overlay: getAnnotations error: " + e); return; }

        // Build a set of annotation keys filtered out by the reader's
        // sidebar filters (color / tag / author / search query). The
        // reader's annotation manager stores a `_hidden: true` flag on
        // every annotation that doesn't match the active filter; the
        // PDF view simply skips drawing those, but `getAnnotations()`
        // returns the full list, so without this check we'd keep
        // overlay badges hovering over empty PDF space where the
        // filtered-out annotation used to be.
        //
        // The filter UI lives in the outer reader iframe, but the
        // annotation state is owned by `_reader` on that same window.
        // Cross-realm read of `_state.annotations[i]._hidden` is safe —
        // they're plain booleans set by the reader app itself.
        const hiddenKeys = new Set();
        try {
            const iwin = reader._iframeWindow;
            const ireader = iwin && iwin.wrappedJSObject
                && iwin.wrappedJSObject._reader;
            const stateAnns = ireader && ireader._state
                && ireader._state.annotations;
            if (stateAnns && stateAnns.length) {
                for (const a of stateAnns) {
                    if (a && a._hidden && a.id) hiddenKeys.add(a.id);
                }
            }
        } catch (e) {
            this._dbg("[Weavero] overlay: read filter state err: " + e);
        }

        // Drop entries from the recently-deleted set ONLY when
        // getAnnotations() also stops returning them — i.e. when Zotero's
        // in-memory cache has caught up. The fixed 2 s TTL was too short
        // in some cases; tying expiry to actual data consistency removes
        // the race window entirely. Time-based fallback (60 s) for keys
        // that for any reason never get returned again.
        if (this._recentlyDeletedKeys.size) {
            const liveKeys = new Set();
            for (const a of annotations) {
                if (a && a.key) liveKeys.add(a.key);
            }
            const cutoff = Date.now() - 60000;
            for (const [k, ts] of this._recentlyDeletedKeys) {
                if (!liveKeys.has(k) || ts < cutoff) {
                    this._recentlyDeletedKeys.delete(k);
                }
            }
        }

        // Group annotations by 0-based page index.
        // Each page list is a flat array of "badge requests" — an
        // annotation with a comment + relations produces TWO entries
        // (kind="comment", kind="relations") so the placement loop can
        // treat them independently.
        //
        // Order policy: when BOTH apply, the relations badge takes the
        // primary position (the spot the badge would occupy if it were
        // alone) and the comment badge is offset to the RIGHT by
        // REL_OFFSET_PDF. Rationale: relations is the closer analog
        // to a native Zotero feature, so the user's eye should land
        // there first. If only one applies, that one sits at the
        // primary position with no offset.
        //
        // Spacing tuned to read as a tight pair (was 12 — visibly two
        // separate icons; 8 leaves a hairline gap at 100 % zoom).
        const REL_OFFSET_PDF = 8;
        // Shift the badge up-and-right of the first-rect's top-left
        // corner so it doesn't overlap PDF.js's resize handle (drawn
        // at that exact corner for highlight / underline / image / ink
        // annotations). Values are in PDF unscaled px — calc()
        // multiplies them by --scale-factor so the offset stays
        // visually constant across zoom. Mirror in
        // _updateCanvasBadgePositionLive when changing.
        const HANDLE_CLEAR_DX_PDF = 1.25;
        const HANDLE_CLEAR_DY_PDF = 1.25;
        const byPage = new Map();
        let skippedAsRecent = 0;
        let stillReturnedKeys = [];
        for (const ann of annotations) {
            if (!ann || !ann.annotationType) continue;
            // Text annotations are handled by _processTextAnnotations and
            // already get the wv-text-annotation-btn — skip here.
            if (ann.annotationType === "text") continue;
            // Skip annotations the user has filtered out (color / tag
            // / author / search). The reader hides them in the PDF
            // view; our badge would be left dangling otherwise.
            if (hiddenKeys.has(ann.key)) continue;
            // Drag-end commit-pending guard. After a drag ends, the
            // pointerup handler fires an immediate rescan to snap the
            // badge to the final position — but Zotero may not have
            // committed the new position to the database yet, so
            // `attachment.getAnnotations()` returns the PRE-drag
            // position. Re-placing from the database here would snap
            // the badge back to the original spot; the followup
            // rescan 60 ms later would then snap it to the final spot
            // ("snap back, then forward" flicker, especially visible
            // on note annotations).
            //
            // Override with the live drag-end position until either
            // the database catches up (positions match) or a 2 s
            // safety timeout elapses. We can't `continue` here — that
            // would drop the annotation from `allWantKeys` and the
            // sweep loop below would remove the badge entirely.
            let liveOverridePos = null;
            if (this._dragEndPending) {
                const pending = this._dragEndPending.get(ann.key);
                if (pending) {
                    let dbPos = ann.annotationPosition;
                    if (typeof dbPos === "string") {
                        try { dbPos = JSON.parse(dbPos); } catch(e) {}
                    }
                    const dbRect = dbPos && dbPos.rects && dbPos.rects[0];
                    const lvRect = pending.livePos && pending.livePos.rects
                        && pending.livePos.rects[0];
                    const matches = dbRect && lvRect
                        && Math.abs(dbRect[0] - lvRect[0]) < 0.5
                        && Math.abs(dbRect[1] - lvRect[1]) < 0.5;
                    if (matches) {
                        this._dragEndPending.delete(ann.key);
                    } else if (Date.now() - pending.ts < 2000) {
                        liveOverridePos = pending.livePos;
                    } else {
                        this._dragEndPending.delete(ann.key);
                    }
                }
            }
            // Skip annotations we just deleted via the notifier — Zotero's
            // getAnnotations() may still return them transiently. Without
            // this exclusion, the badge we removed in the notifier gets
            // recreated here ~100 ms later.
            if (this._recentlyDeletedKeys.has(ann.key)) {
                skippedAsRecent++;
                stillReturnedKeys.push(ann.key);
                continue;
            }
            const comment = ann.annotationComment || "";
            const wantsComment = this._iconWantedFor(comment);
            let relCount = 0;
            try { relCount = (ann.relatedItems || []).length; } catch (e) {}
            const wantsRel = relCount > 0;
            if (!wantsComment && !wantsRel) continue;
            let pos = liveOverridePos || ann.annotationPosition;
            if (typeof pos === "string") {
                try { pos = JSON.parse(pos); } catch(e) { continue; }
            }
            if (!pos || !pos.rects || !pos.rects.length) continue;
            const pi = pos.pageIndex || 0;
            if (!byPage.has(pi)) byPage.set(pi, []);
            const list = byPage.get(pi);
            if (wantsRel) {
                list.push({ key: ann.key, type: ann.annotationType,
                    pos, kind: "relations", offsetPdf: 0,
                    relCount });
            }
            if (wantsComment) {
                list.push({ key: ann.key, type: ann.annotationType,
                    pos, comment, kind: "comment",
                    offsetPdf: wantsRel ? REL_OFFSET_PDF : 0 });
            }
        }

        // Refresh the dynamic theme stylesheet so badges adopt the
        // same bg/color/border the text-annotation buttons use. Cheap,
        // and keeps the two surfaces visually synchronized whenever
        // either path runs.
        this._applyDynamicReaderTheme(idoc);

        // Iterate visible pages and reconcile overlays.
        const pages = idoc.querySelectorAll(".pdfViewer .page[data-page-number]");
        let totalAdded = 0, totalRemoved = 0;
        // Find / create the overlay (sibling of pages inside .pdfViewer)
        // — see _ensureBadgeOverlay for the rationale. Sweep stale
        // badges across all pages at once now that they all live in
        // the same parent node. Composite cleanup key is "<key>:<purpose>"
        // so a comment badge and a relations badge for the same
        // annotation track independently — removing one doesn't sweep
        // the other.
        const overlay = this._ensureBadgeOverlay(idoc);
        if (!overlay) return;
        const allWantKeys = new Set();
        for (const page of pages) {
            const pn = parseInt(page.getAttribute("data-page-number"), 10);
            if (!Number.isFinite(pn)) continue;
            const wantList = byPage.get(pn - 1) || [];
            for (const a of wantList) allWantKeys.add(a.key + ":" + a.kind);
        }
        for (const old of overlay.querySelectorAll(".wv-marker-badge")) {
            const k = old.getAttribute("data-wv-for");
            // Pre-existing badges (from before the relations refactor)
            // have no `data-wv-purpose` — treat them as `comment`.
            const p = old.getAttribute("data-wv-purpose") || "comment";
            if (!allWantKeys.has(k + ":" + p)) { old.remove(); totalRemoved++; }
        }

        for (const page of pages) {
            const pn = parseInt(page.getAttribute("data-page-number"), 10);
            if (!Number.isFinite(pn)) continue;
            const pageIdx = pn - 1;

            const wantList = byPage.get(pageIdx) || [];
            if (!wantList.length) continue;

            // Compute page height in unscaled PDF units. PDF.js sets the
            // page's inline style as e.g. style="height: calc(841.92px *
            // var(--scale-factor))" — the unscaled height is the literal
            // number inside the calc(). Read it directly so we don't
            // depend on whether `--scale-factor` is exposed via
            // getComputedStyle().getPropertyValue() (which returns empty
            // for inherited custom properties in some cases).
            // Cache pageHeight on the page element. PDF document
            // dimensions are intrinsic — they don't change across the
            // session — but the source we read from (calc() in style
            // height) can briefly switch to an absolute-pixel form
            // during PDF.js's zoom transition, causing the regex to
            // miss and the float-division fallback to give a number
            // that's a few ulp off the calc-derived value. That tiny
            // delta breaks the dataset comparison in the per-badge
            // loop below — `String(topPdf)` differs across scans, the
            // gate fires, every badge's inline style is rewritten, and
            // the cascade of style invalidations at zoom-stop time
            // produces a visible flicker. Caching once on the page
            // element kills the source of the flicker.
            let pageHeight = parseFloat(page.dataset.wvPageHeight || "");
            if (!pageHeight || !isFinite(pageHeight)) {
                const inlineH = page.style.height || "";
                // PDF.js writes the unscaled page height in two forms
                // depending on the build:
                //   • Older: `calc(841.92px * var(--scale-factor))`
                //   • Newer: `round(down, var(--total-scale-factor) * 841.92px, ...)`
                // Both expose the literal unscaled value as a `<N>px`
                // token; this regex matches a bare px literal anywhere
                // in the expression so we get the intrinsic height
                // regardless of which form is in use. (We deliberately
                // don't try to parse the full expression — `round()`
                // wraps the literal in extra args that the original
                // calc-only regex couldn't handle.)
                const m = /(\d+(?:\.\d+)?)\s*px/.exec(inlineH);
                if (m) pageHeight = parseFloat(m[1]);
                if (!pageHeight || !isFinite(pageHeight)) {
                    // Fallback: rendered height ÷ scale-factor read from
                    // either the inline style of an ancestor or the
                    // computed style at the page element.
                    const cs = idoc.defaultView.getComputedStyle(page);
                    const pxHeight = parseFloat(cs.height) || 0;
                    let sf = parseFloat(cs.getPropertyValue("--scale-factor"));
                    if (!sf || !isFinite(sf)) {
                        let p = page.parentElement;
                        while (p && !sf) {
                            const ps = idoc.defaultView.getComputedStyle(p);
                            sf = parseFloat(ps.getPropertyValue("--scale-factor"));
                            if (sf && isFinite(sf)) break;
                            p = p.parentElement;
                        }
                    }
                    if (!sf || !isFinite(sf)) sf = 1;
                    pageHeight = pxHeight / sf;
                }
                if (pageHeight && isFinite(pageHeight)) {
                    page.dataset.wvPageHeight = String(pageHeight);
                }
            }
            if (!pageHeight || !isFinite(pageHeight)) continue;

            // Resolve scale-factor in JS so we can write plain pixel
            // values for left/top. Cascade-only `calc(... * var(--scale-factor))`
            // failed in practice (badges stacked at the layer origin), so we
            // both inline `position: absolute` and bake the scale into px.
            let sf = 0;
            try {
                const cs = idoc.defaultView.getComputedStyle(page);
                sf = parseFloat(cs.getPropertyValue("--scale-factor"));
                if (!sf || !isFinite(sf)) {
                    let p = page.parentElement;
                    while (p && (!sf || !isFinite(sf))) {
                        const ps = idoc.defaultView.getComputedStyle(p);
                        sf = parseFloat(ps.getPropertyValue("--scale-factor"));
                        if (sf && isFinite(sf)) break;
                        p = p.parentElement;
                    }
                }
                if (!sf || !isFinite(sf)) {
                    // Last-ditch: derive from rendered height vs. unscaled height.
                    const pxH = parseFloat(idoc.defaultView.getComputedStyle(page).height) || 0;
                    if (pageHeight > 0 && pxH > 0) sf = pxH / pageHeight;
                }
            } catch(e) { /* ignore */ }
            if (!sf || !isFinite(sf) || sf <= 0) sf = 1;

            const pageOffTop  = page.offsetTop  + "px";
            const pageOffLeft = page.offsetLeft + "px";
            for (const item of wantList) {
                const purpose = item.kind;  // "comment" | "relations"
                const r = item.pos.rects[0];
                const x1 = r[0], y1 = r[1], x2 = r[2], y2 = r[3];
                const leftPdf = x1 + (item.offsetPdf || 0) + HANDLE_CLEAR_DX_PDF;
                const topPdf  = pageHeight - y2 - HANDLE_CLEAR_DY_PDF;
                let badge = overlay.querySelector(
                    ".wv-marker-badge[data-wv-for=\"" + item.key + "\"]"
                    + "[data-wv-purpose=\"" + purpose + "\"]");
                const isNew = !badge;
                if (isNew) {
                    badge = idoc.createElement("div");
                    badge.className = "wv-marker-badge";
                    if (purpose === "relations") {
                        badge.classList.add("wv-rel-marker");
                    }
                    badge.setAttribute("data-wv-for", item.key);
                    badge.setAttribute("data-wv-purpose", purpose);
                    badge.dataset.wvPage = String(pn);
                    badge.dataset.wvLeftPdf = String(leftPdf);
                    badge.dataset.wvTopPdf  = String(topPdf);
                    badge.dataset.wvPageOffTop  = pageOffTop;
                    badge.dataset.wvPageOffLeft = pageOffLeft;
                    if (purpose === "comment") {
                        this._applyIconState(badge, item.comment || "");
                    } else {
                        // Relations badge — chain icon, no amber-disc
                        // states, no comment-driven tooltip. Title
                        // shows the related-items count.
                        const n = item.relCount || 0;
                        badge.title = n + " Related";
                        badge.appendChild(this._makeRelationsSvg(idoc));
                    }

                    badge.style.position      = "absolute";
                    badge.style.pointerEvents = "auto";
                    badge.style.cursor        = "pointer";
                    badge.style.userSelect    = "none";
                    badge.style.zIndex        = "5";
                    badge.style.fontSize      = "calc(7px * var(--scale-factor, 1))";
                    badge.style.padding       = "0px";
                    badge.style.borderRadius  = "calc(2px * var(--scale-factor, 1))";

                    // Position uses two CSS variables we own:
                    //   --page-offset-top / --page-offset-left
                    //     pixel offset of this page within .pdfViewer
                    //     (refreshed by the reposition observer when
                    //     pages reflow at zoom-stop)
                    //   --scale-factor   inherited from .pdfViewer
                    //     (PDF.js writes it on every zoom step)
                    // The annotation's PDF-space coords are baked as
                    // literals; the browser handles smooth zoom via
                    // calc() with no JS write per zoom step.
                    badge.style.setProperty("--page-offset-top",  pageOffTop);
                    badge.style.setProperty("--page-offset-left", pageOffLeft);
                    badge.style.left = "calc(var(--page-offset-left, 0px) + "
                        + leftPdf + "px * var(--scale-factor, 1))";
                    badge.style.top = "calc(var(--page-offset-top, 0px) + ("
                        + topPdf + "px - 5px) * var(--scale-factor, 1))";

                    const stopAndPrevent = (e) => {
                        e.stopPropagation();
                        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                        e.preventDefault();
                    };
                    badge.addEventListener("mousedown",  stopAndPrevent, true);
                    badge.addEventListener("pointerdown", stopAndPrevent, true);
                    if (purpose === "comment") {
                        badge.addEventListener("click", (e) => {
                            stopAndPrevent(e);
                            const c = badge.dataset.wvComment || "";
                            if (!c) return;
                            const sc = this._screenCoords(badge);
                            this.openCommentPopup(c, {
                                anchorNode: badge,
                                ...(sc ? { anchorScreen: sc } : {}),
                            });
                        }, true);
                    } else {
                        // Relations click: re-resolve the annotation
                        // item at click time so a relation that was
                        // added/removed since render is reflected.
                        const annKey = item.key;
                        const lib = attachment.libraryID;
                        badge.addEventListener("click", (e) => {
                            stopAndPrevent(e);
                            const annItem = this._getAnnotationItem(lib, annKey);
                            if (!annItem) return;
                            const sc = this._screenCoords(badge);
                            this.openRelationsPopup(annItem, {
                                anchorNode: badge,
                                ...(sc ? { anchorScreen: sc } : {}),
                            });
                        }, true);
                    }
                    overlay.appendChild(badge);
                    totalAdded++;
                }
                // Per-scan refresh: comment text + page-offset variable
                // (in case the annotation hopped pages OR the page
                // reflowed while our observer was off-frame). Comment
                // refresh is a no-op for relations badges.
                if (purpose === "comment") {
                    const newComment = item.comment || "";
                    if (badge.dataset.wvComment !== newComment) {
                        badge.dataset.wvComment = newComment;
                    }
                }
                if (badge.dataset.wvPage !== String(pn)) {
                    badge.dataset.wvPage = String(pn);
                }
                if (badge.dataset.wvPageOffTop !== pageOffTop) {
                    badge.dataset.wvPageOffTop = pageOffTop;
                    badge.style.setProperty("--page-offset-top", pageOffTop);
                }
                if (badge.dataset.wvPageOffLeft !== pageOffLeft) {
                    badge.dataset.wvPageOffLeft = pageOffLeft;
                    badge.style.setProperty("--page-offset-left", pageOffLeft);
                }
                // Position update guard: rewrite the calc() expressions
                // only if the annotation actually moved (rare). For
                // relations badges, the offset can also change if the
                // annotation gained/lost a comment badge alongside it.
                const leftKey = String(leftPdf);
                const topKey  = String(topPdf);
                if (!isNew && badge.dataset.wvLeftPdf !== leftKey) {
                    badge.dataset.wvLeftPdf = leftKey;
                    badge.style.left = "calc(var(--page-offset-left, 0px) + "
                        + leftPdf + "px * var(--scale-factor, 1))";
                }
                if (!isNew && badge.dataset.wvTopPdf !== topKey) {
                    badge.dataset.wvTopPdf = topKey;
                    badge.style.top = "calc(var(--page-offset-top, 0px) + ("
                        + topPdf + "px - 5px) * var(--scale-factor, 1))";
                }
            }
        }

        if (totalAdded || totalRemoved || skippedAsRecent) {
            this._dbg("[Weavero] overlay: pages=" + pages.length
                + " annsWithLinks=" + annotations.filter(a => a.annotationType !== "text"
                    && this.hasURI(a.annotationComment || "")).length
                + " badgesAdded=" + totalAdded + " badgesRemoved=" + totalRemoved
                + " skippedAsRecent=" + skippedAsRecent
                + " stillReturned=" + JSON.stringify(stillReturnedKeys)
                + " recentSize=" + this._recentlyDeletedKeys.size);
        }
    }

    /** Wire up icon overlays for a DOM-view reader (HTML snapshot or EPUB).
     *
     *  The DOM-view readers use a srcdoc iframe whose body contains an
     *  `#annotation-overlay` element with an open shadow root. Inside the
     *  shadow root, Zotero renders each annotation as an SVG/HTML element
     *  carrying `data-annotation-id="<numeric id>"`. Our icons go into the
     *  iframe's *light* DOM (sibling level) so React re-renders inside the
     *  shadow root don't reach them.
     *
     *  Re-runs the placement on:
     *  - shadow-root mutations (annotation create/edit/delete, page changes)
     *  - scroll/resize (positions are viewport-relative, change with scroll)
     */
    _wireUpDomViewReader(reader, innerWin, innerDoc) {
        try {
            this._dbg("[Weavero] DOM-view wireUp: URL=" + innerDoc.URL);

            // Inject our icon CSS into the iframe's light DOM. The badges
            // we place are siblings of the annotation-overlay element, so
            // they pick up styles from light-DOM stylesheets (not from
            // the shadow root).
            // Defensive remove-then-add: an old plugin instance's style
            // node may survive destroy(); skipping injection on a stale
            // element pins the page on the previous version's CSS.
            {
                const existing = innerDoc.getElementById("weavero-inner-styles");
                if (existing) existing.remove();
                const s = innerDoc.createElement("style");
                s.id = "weavero-inner-styles";
                // position: absolute with page coords (rect + scroll),
                // appended to documentElement (not body). This avoids
                // two problems with the inner iframe:
                //  1. body-level CSS transforms/filters/will-change/
                //     contain change the containing block for fixed
                //     descendants — making `position: fixed` anchor to
                //     body, not the viewport.
                //  2. body padding/margin offsets `position: absolute`
                //     children when body has `position: relative`.
                // documentElement (<html>) is far less likely to have
                // any of those properties; absolute positioning then
                // anchors to the initial containing block (page coords).
                // z-index: max int — Zotero's annotation overlay uses
                // 2147483647 too, but in body's stacking context. By
                // attaching to <html>, our badge's stacking context
                // sits above body's, so we paint on top.
                s.textContent =
                    ".wv-marker-badge {"
                    + "  position: absolute; pointer-events: auto; user-select: none;"
                    + "  cursor: pointer; line-height: 1;"
                    + "  z-index: 2147483647;"
                    + "  background: transparent; border: none; padding: 0;"
                    + "  display: inline-flex; align-items: center; justify-content: center;"
                    + "  width: 14px; height: 14px;"
                    + "  font-size: 14px;"  // controls 1em chain SVG size
                    + "  color: #7a4a00;"   // amber-brown, matches PDF reader
                    + "  transform: translateZ(0);"
                    + "}"
                    + ".wv-marker-badge:hover { opacity: 0.7; }"
                    // Same chain-link SVG used in the PDF reader. Sized
                    // to 1em so it fills the badge; stroke set on the
                    // path elements directly (currentColor's resolution
                    // order is unreliable across multiple style rules,
                    // see comment near _makeLinkSvg).
                    + ".wv-link-svg, .wv-relations-svg {"
                    + "  width: 1em; height: 1em; display: block; flex-shrink: 0;"
                    + "}"
                    // (Stroke-tint of `.wv-link-svg path` removed —
                    // the needle has its own multi-colour paint.)
                    // Relations marker — chain icon for `dc:relation`
                    // triples, painted in the same amber-brown as
                    // every other chain icon across the plugin
                    // (items list, sidebar, PDF reader badge,
                    // context-menu entry).
                    + ".wv-marker-badge.wv-rel-marker {"
                    + "  color: #7a4a00 !important;"
                    + "}"
                    + ":root.wv-reader-dark .wv-marker-badge.wv-rel-marker {"
                    + "  color: #ffb84d !important;"
                    + "}";
                (innerDoc.head || innerDoc.documentElement).appendChild(s);
            }

            const data = this._readerObservers.get(reader) || {};
            data.innerDoc = innerDoc;
            data.innerWindow = innerWin;
            data.isDomView = true;

            // Resolve the inner Reader instance ONCE per wireUp and
            // cache _primaryView / _annotationsByID on `data` for the
            // recompute loop (avoids re-walking the wrappedJSObject
            // chain on every scroll / zoom / mutation tick).
            try {
                const outerWin = reader && reader._iframeWindow;
                if (outerWin) {
                    const wrap = outerWin.wrappedJSObject;
                    const readerInst = outerWin._reader || (wrap && wrap._reader);
                    const primaryView = readerInst && readerInst._primaryView;
                    if (primaryView) {
                        data.domViewPrimaryView = primaryView;
                        data.domViewAnnsByID = primaryView._annotationsByID || null;
                        this._dbg("[Weavero] DOM-view wireUp: _reader OK "
                            + "(annsByID size=" + (data.domViewAnnsByID && data.domViewAnnsByID.size)
                            + ", hasToDisplayedRange="
                            + (typeof primaryView.toDisplayedRange === "function") + ")");
                    } else {
                        this._dbg("[Weavero] DOM-view wireUp: _reader/_primaryView missing — "
                            + "range strategy unavailable, will use DOM fallbacks");
                    }
                }
            } catch(e) {
                Zotero.debug("[Weavero] DOM-view wireUp: _reader resolve err: " + e.message);
            }

            // Single debounced recompute, shared across every trigger
            // (mutation, scroll, resize, zoom). rAF coalesces bursts
            // (e.g. continuous wheel-zoom) into one repaint per frame.
            let scheduled = false;
            const recompute = () => {
                if (scheduled) return;
                scheduled = true;
                innerWin.requestAnimationFrame(() => {
                    scheduled = false;
                    try { this._processDomViewAnnotationIcons(innerDoc, reader); }
                    catch(e) { Zotero.debug("[Weavero] DOM-view scan error: " + e); }
                });
            };

            // MutationObserver on the shadow root catches:
            //  - childList: annotation create/delete (React mounts/unmounts SVG nodes)
            //  - attributes: React re-renders that update existing SVG nodes
            //    (this is what fires during zoom — React adjusts x/y/width/height
            //    on the same elements rather than recreating them, so a
            //    childList-only observer misses it and badges drift).
            const overlay = innerDoc.getElementById("annotation-overlay");
            const shadowRoot = overlay && overlay.shadowRoot;
            if (shadowRoot && !data.domViewObserver) {
                const observer = new innerWin.MutationObserver(recompute);
                observer.observe(shadowRoot, {
                    childList: true, subtree: true, attributes: true,
                });
                data.domViewObserver = observer;
            }

            // ResizeObserver on the iframe body catches CSS-zoom and
            // font-size changes that don't fire scroll/resize on the window.
            if (innerWin.ResizeObserver && !data.domViewResizeObserver) {
                const ro = new innerWin.ResizeObserver(recompute);
                ro.observe(innerDoc.body);
                data.domViewResizeObserver = ro;
            }

            // Scroll/resize listeners cover regular scroll + window resize.
            // capture=true picks up scroll on inner scrollable elements.
            if (!data.domViewScrollHandler) {
                innerWin.addEventListener("scroll", recompute, true);
                innerWin.addEventListener("resize", recompute);
                data.domViewScrollHandler = recompute;
            }

            this._readerObservers.set(reader, data);

            // Initial placement.
            this._processDomViewAnnotationIcons(innerDoc, reader);

            this._dbg("[Weavero] DOM-view wireUp: observer + listeners attached");
        } catch(e) {
            Zotero.debug("[Weavero] DOM-view wireUp error: " + e);
        }
    }

    /** Place / update / remove `.wv-marker-badge` icons next to each
     *  annotation in the DOM-view reader's iframe, for any annotation
     *  whose comment has a URL or markdown.
     *
     *  Position is computed via the same `toDisplayedRange + collapse-
     *  to-first-character` sequence Zotero uses for its own comment
     *  indicator, so the chain badge overlays Zotero's blue speech-
     *  bubble. Badges are placed in the iframe's light DOM (attached
     *  to documentElement) and tagged with `data-wv-for="<key>"` so we
     *  can reconcile across re-runs (drop stale, update in place,
     *  create new).
     */
    _processDomViewAnnotationIcons(idoc, reader) {
        // Honor the master gates — when either pref is off, strip any
        // badges we previously placed and bail.
        if (!this._getEnableReaderView() || !this._getEnableReaderViewIcons()) {
            for (const b of idoc.querySelectorAll(".wv-marker-badge[data-wv-domview]")) {
                b.remove();
            }
            return;
        }
        if (!reader || !reader._item) return;

        const overlay = idoc.getElementById("annotation-overlay");
        const shadowRoot = overlay && overlay.shadowRoot;
        if (!shadowRoot) return;

        let annotations = [];
        try { annotations = reader._item.getAnnotations() || []; }
        catch(e) {
            this._dbg("[Weavero] DOM-view: getAnnotations error: " + e);
            return;
        }

        // Map<key, { ann, wantsComment, wantsRel }> — both flags can be
        // true on the same annotation, in which case we'll place TWO
        // badges (comment at primary position, relations offset 16 px
        // to the right). Same side-by-side pattern as the annotation
        // header and the PDF reader.
        const REL_OFFSET_PX = 16;
        const wantByKey = new Map();
        for (const ann of annotations) {
            if (!ann || !ann.key) continue;
            const comment = ann.annotationComment || "";
            const wantsComment = this._iconWantedFor(comment);
            let relCount = 0;
            try { relCount = (ann.relatedItems || []).length; } catch (e) {}
            const wantsRel = relCount > 0;
            if (!wantsComment && !wantsRel) continue;
            wantByKey.set(ann.key,
                { ann, wantsComment, wantsRel, relCount });
        }

        // Drop badges whose annotation no longer needs one. Composite
        // key "<annKey>:<purpose>" so a relations badge surviving past
        // a relation-removal and a comment badge surviving past a
        // comment-edit are reaped independently.
        for (const old of idoc.querySelectorAll(".wv-marker-badge[data-wv-domview]")) {
            const k = old.getAttribute("data-wv-for");
            const p = old.getAttribute("data-wv-purpose") || "comment";
            const entry = wantByKey.get(k);
            const stillWanted = entry
                && (p === "comment" ? entry.wantsComment : entry.wantsRel);
            if (!stillWanted) old.remove();
        }

        // primaryView / annsByID were resolved once at wireUp time and
        // cached on the reader's data object — see _wireUpDomViewReader.
        // (WADMAnnotation has `position` as a Selector, not a live
        // Range; we call `primaryView.toDisplayedRange(selector)` to
        // get a Range, the same method upstream uses, see dom-view.tsx:399.)
        const data = this._readerObservers.get(reader) || {};
        const primaryView = data.domViewPrimaryView || null;
        const annsByID = data.domViewAnnsByID || null;

        let placed = 0, skipped = 0;
        for (const [key, entry] of wantByKey) {
            const ann = entry.ann;
            // Strategy 1 (preferred): same method Zotero uses to position
            // its CommentIcon. Get the live Range via toDisplayedRange,
            // then mimic upstream's `collapseToOneCharacterAtStart` —
            // setEnd to start+1 so the range covers exactly one
            // character (NOT collapse(true) — empty ranges give
            // degenerate rects). Read range.getBoundingClientRect(),
            // place badge at (rect.left - 7, rect.top - 7) so its
            // center matches the comment indicator's center.
            let rect = null, isNoteIcon = false;
            try {
                const wadm = annsByID && annsByID.get(key);
                if (wadm && wadm.position && primaryView
                        && typeof primaryView.toDisplayedRange === "function") {
                    const range = primaryView.toDisplayedRange(wadm.position);
                    if (range && typeof range.cloneRange === "function") {
                        const r = range.cloneRange();
                        const sc = r.startContainer;
                        if (sc && sc.nodeValue && sc.nodeValue.length > r.startOffset) {
                            r.setEnd(sc, r.startOffset + 1);
                        } else {
                            r.collapse(true);
                        }
                        const rr = r.getBoundingClientRect();
                        if (rr.width || rr.height) rect = rr;
                    }
                }
            } catch(e) {
                this._dbg("[Weavero] DOM-view: range strategy err for "
                    + key + ": " + e.message);
            }

            // Strategy 2 (fallback, type-aware DOM lookup): used when
            // the range strategy fails (e.g. for note annotations whose
            // selector resolves to an empty range, or if _reader isn't
            // accessible). Pick by element kind in priority order.
            //
            //  - <svg data-annotation-id="X"> exists for notes (which
            //    pass `annotation` to CommentIcon). It IS the rendered
            //    24×24 note icon. Badge top-left = SVG top-left so the
            //    chain sits in the note icon's corner.
            //
            //  - For highlights/underlines, `data-annotation-id` lives
            //    on the inner <div class="annotation-div"> (one per
            //    highlight line, NOT on the wrapping <foreignObject>).
            //    Pick the topmost-then-leftmost div = first line's
            //    rect, anchor there.
            if (!rect) {
                const noteSvg = shadowRoot.querySelector(
                    'svg[data-annotation-id="' + key + '"]');
                if (noteSvg) {
                    const rr = noteSvg.getBoundingClientRect();
                    if (rr.width || rr.height) {
                        rect = rr;
                        isNoteIcon = true;
                    }
                }
            }
            if (!rect) {
                // For highlights/underlines the `data-annotation-id` is
                // on the inner annotation-div (not on the wrapping
                // <foreignObject>). One div per highlight line. Pick
                // the topmost-then-leftmost = first line's rect.
                const divs = shadowRoot.querySelectorAll(
                    'div[data-annotation-id="' + key + '"]');
                if (divs.length) {
                    let best = divs[0], bestRect = best.getBoundingClientRect();
                    for (let i = 1; i < divs.length; i++) {
                        const rr = divs[i].getBoundingClientRect();
                        if (rr.top < bestRect.top - 1
                            || (Math.abs(rr.top - bestRect.top) < 1 && rr.left < bestRect.left)) {
                            best = divs[i];
                            bestRect = rr;
                        }
                    }
                    if (bestRect.width || bestRect.height) rect = bestRect;
                }
            }
            if (!rect) {
                const any = shadowRoot.querySelector('[data-annotation-id="' + key + '"]');
                if (any) {
                    const rr = any.getBoundingClientRect();
                    if (rr.width || rr.height) rect = rr;
                }
            }

            if (!rect) {
                skipped++;
                this._dbg("[Weavero] DOM-view: skip key=" + key + " (no usable rect)");
                continue;
            }

            // position: absolute on documentElement → use PAGE coords
            // (rect + scroll). Visual placement matches the PDF
            // reader's badge-and-chain layout:
            //  - highlight (range strategy): comment indicator (14×14)
            //    is centered at first-char point (its top edge is at
            //    rect.top - 7). Place chain 2 px above that top edge
            //    so it pokes just out of the indicator's top:
            //      top = (rect.top - 7) - 2 = rect.top - 9
            //  - note-svg: rect IS the 24×24 note. Place chain at the
            //    note's top-left, raised by 8 so the chain's top half
            //    sits clearly above the note.
            //      left = rect.left, top = rect.top - 8
            const win = idoc.defaultView;
            const sX = (win && win.scrollX) || 0;
            const sY = (win && win.scrollY) || 0;
            const baseLeft = rect.left + sX;
            const baseTop  = rect.top  + sY - (isNoteIcon ? 8 : 9);

            // Helper: place / refresh one badge for a given purpose.
            // Both purposes share rect, top placement, and click-time
            // popup mechanics; they differ only in glyph, click target,
            // and horizontal offset.
            //
            // Order policy: relations gets the primary spot (closer to
            // a native Zotero feature). When BOTH badges apply, the
            // comment badge moves RIGHT by REL_OFFSET_PX; the relations
            // badge stays at the anchor.
            const placeBadge = (purpose) => {
                const isRel = purpose === "relations";
                const left = baseLeft
                    + (!isRel && entry.wantsRel ? REL_OFFSET_PX : 0);
                const top = baseTop;
                let badge = idoc.querySelector(
                    '.wv-marker-badge[data-wv-domview][data-wv-for="'
                    + key + '"][data-wv-purpose="' + purpose + '"]');
                if (!badge) {
                    badge = idoc.createElement("div");
                    badge.className = "wv-marker-badge";
                    if (isRel) badge.classList.add("wv-rel-marker");
                    badge.setAttribute("data-wv-domview", "1");
                    badge.setAttribute("data-wv-for", key);
                    badge.setAttribute("data-wv-purpose", purpose);
                    if (isRel) {
                        badge.appendChild(this._makeRelationsSvg(idoc));
                        const n = entry.relCount || 0;
                        badge.title = n + " Related";
                    } else {
                        badge.appendChild(this._makeLinkSvg(idoc));
                        badge.title = "Open comment";
                    }
                    badge.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        try {
                            // Prefer screen coords (mozInnerScreenX/Y +
                            // local rect): the popup is created in the
                            // main Zotero window, so anchorNode's
                            // getBoundingClientRect would return iframe-
                            // local coords misinterpreted as main-window
                            // coords. The PDF reader's badges use the
                            // same `_screenCoords` helper for the same
                            // reason.
                            const sc = this._screenCoords(badge);
                            if (isRel) {
                                // Re-resolve the annotation item at
                                // click time so a relation that was
                                // added/removed since render reflects
                                // in the popup.
                                const lib = reader._item.libraryID;
                                const annItem = this._getAnnotationItem(lib, key);
                                if (!annItem) return;
                                this.openRelationsPopup(annItem, {
                                    anchorNode: badge,
                                    ...(sc ? { anchorScreen: sc } : {}),
                                });
                            } else {
                                this.openCommentPopup(ann.annotationComment || "", {
                                    anchorNode: badge,
                                    ...(sc ? { anchorScreen: sc } : {}),
                                });
                            }
                        } catch(e) {
                            Zotero.debug("[Weavero] DOM-view badge click err: " + e);
                        }
                    });
                    // Append to documentElement (<html>), NOT body — see
                    // the CSS-injection comment for why.
                    idoc.documentElement.appendChild(badge);
                }
                badge.style.left = left + "px";
                badge.style.top  = top  + "px";
                placed++;
            };

            if (entry.wantsComment) placeBadge("comment");
            if (entry.wantsRel)     placeBadge("relations");
        }

        // Diagnostic — only emitted when weavero.debug is on.
        if (wantByKey.size || placed || skipped) {
            this._dbg("[Weavero] DOM-view: " + wantByKey.size
                + " annotation(s) want icons, " + placed
                + " badge(s) placed, " + skipped
                + " skipped (no DOM match or zero rect)");
        }
    }

    /** Set up our text-annotation processing on the inner PDF.js viewer
     *  iframe nested inside the outer reader iframe. Polls until the inner
     *  iframe + its document body are available, then wires up. */
    _setupInnerReaderObserver(reader, outerDoc) {
        let attempts = 0;

        const wireUp = (innerWin, innerDoc) => {
            try {
                this._dbg("[Weavero] inner wireUp: doc URL=" + innerDoc.URL);
                // Defensive remove-then-add: see _ensureReaderOuterStyles.
                {
                    const existing = innerDoc.getElementById("weavero-inner-styles");
                    if (existing) existing.remove();
                    const s = innerDoc.createElement("style");
                    s.id = "weavero-inner-styles";
                    s.textContent =
                        // Shared structural rule for both reader-side
                        // icon classes — boxless, just the bare glyph.
                        // The text-annotation button is a <button>
                        // element so browser-default chrome (gray
                        // fill, beveled border, padding) sneaks in
                        // unless we explicitly reset it. The marker
                        // badge is a <div> so the resets are no-ops
                        // there.
                        ".wv-marker-badge,"
                        + ".wv-text-annotation-btn {"
                        + "  position: absolute; pointer-events: auto; user-select: none;"
                        + "  line-height: 1; cursor: pointer;"
                        + "  background: transparent; border: none; padding: 0;"
                        + "  transition: background 0.15s;"
                        // Force the badge onto its own GPU compositing
                        // layer. PDF.js redraws the entire page surface
                        // at zoom stop (re-rasterizes the canvas), and
                        // the surrounding stacking context gets a brief
                        // "blank then re-paint" flash. translateZ(0)
                        // (the classic "null transform" hack) promotes
                        // the badge to its own layer.
                        + "  transform: translateZ(0);"
                        + "  backface-visibility: hidden;"
                        + "  contain: paint;"
                        + "}"
                        // Defense against PDF.js's .page.loading state.
                        // When PDF.js re-rasterizes the canvas at zoom
                        // stop, it briefly applies the `loading` class
                        // (and `loadingIcon`) to the .page element. The
                        // viewer's stylesheet uses that class to hide
                        // child layers via opacity / visibility so the
                        // user doesn't see a stale / partially-rendered
                        // state. Our badge is a child of .customAnnotationLayer
                        // — itself a child of .page — and gets caught
                        // in that flash. We force visibility / opacity
                        // through the transition with !important so
                        // the badge stays painted across the swap.
                        // High z-index defeats any overlay that
                        // PDF.js might draw via ::before/::after on
                        // the loading page.
                        + ".page > .customAnnotationLayer,"
                        + ".page.loading > .customAnnotationLayer,"
                        + ".page.loadingIcon > .customAnnotationLayer {"
                        + "  visibility: visible !important;"
                        + "  opacity: 1 !important;"
                        + "  display: block !important;"
                        + "  transform: none !important;"
                        + "  filter: none !important;"
                        + "}"
                        + ".wv-marker-badge,"
                        + ".wv-text-annotation-btn {"
                        + "  visibility: visible !important;"
                        + "  opacity: 1 !important;"
                        + "  z-index: 9999 !important;"
                        + "}"
                        // Chain SVG sizing — width/height 1em scales with
                        // the badge's calc-driven font-size so the icon
                        // tracks PDF.js zoom natively. Same for the
                        // relations SVG used by the new `.wv-rel-marker`
                        // badge variant.
                        + ".wv-link-svg, .wv-relations-svg {"
                        + "  width: 1em; height: 1em; display: block;"
                        + "  flex-shrink: 0;"
                        + "}"
                        // Relations marker badge — the chain icon for
                        // `dc:relation` triples. Painted in the same
                        // amber-brown as the items-list `.wv-tree-rel-icon`
                        // and sidebar `.wv-btn-relations` so all
                        // chain icons across the plugin read as one
                        // affordance.
                        //
                        // Override `color` (not `fill`) on the badge,
                        // because the path inside _makeRelationsSvg
                        // has `fill="currentColor"` baked in as an
                        // SVG attribute — that shadows any `fill` set
                        // on an ancestor SVG element. Setting `color`
                        // on the badge wins because currentColor
                        // resolves up to the nearest `color` rule.
                        // We need !important to beat
                        // `_applyDynamicReaderTheme`'s contrast color
                        // (`#f4f4f4` / `#1a1a1a`) on `.wv-marker-badge`.
                        + ".wv-marker-badge.wv-rel-marker {"
                        + "  color: #7a4a00 !important;"
                        + "}"
                        + ":root.wv-reader-dark .wv-marker-badge.wv-rel-marker {"
                        + "  color: #ffb84d !important;"
                        + "}"
                        // (No opacity override — uniform at 1 across themes;
                        // the hover-bg in the dynamic stylesheet provides
                        // the only hover affordance.)
                        + "";
                    (innerDoc.head || innerDoc.documentElement).appendChild(s);
                }

                const initialCount = innerDoc.querySelectorAll("textarea.textAnnotation").length;
                this._dbg("[Weavero] inner wireUp: "
                    + initialCount + " textarea.textAnnotation elements at init");
                this._processTextAnnotations(innerDoc);
                try { this._processNoteAnnotationOverlays(innerDoc, reader); }
                catch(e) { Zotero.debug("[Weavero] overlay scan error: " + e); }

                // Live-drag tracker for canvas-rendered annotations
                // (highlight / underline / image / ink). Wired here so
                // pointerdown/move/up events on PDF.js's canvas fire on
                // the inner doc — events do NOT bubble out to the outer
                // reader iframe, so binding from _setupReaderObserver
                // never saw the drag.
                try { this._setupAnnotationDragTracker(reader, innerDoc); }
                catch(e) { Zotero.debug("[Weavero] drag tracker setup err: " + e); }

                let timer = null;
                const observer = new innerWin.MutationObserver((muts) => {
                    // Immediate orphan sweep on any childList mutation that
                    // removed nodes — covers annotation deletion. The full
                    // re-scan (positioning, badge creation) stays on the
                    // 100 ms debounce so we don't thrash during render
                    // bursts. _sweepStaleOverlays is a cheap O(N) pass that
                    // only removes badges/buttons whose target is gone.
                    let hadRemovals = false;
                    for (const m of muts) {
                        if (m.type === "childList" && m.removedNodes && m.removedNodes.length) {
                            hadRemovals = true; break;
                        }
                    }
                    if (hadRemovals) {
                        try { this._sweepStaleOverlays(innerDoc, reader); }
                        catch(e) { Zotero.debug("[Weavero] sweep error: " + e); }
                    }
                    if (timer) innerWin.clearTimeout(timer);
                    timer = innerWin.setTimeout(() => {
                        timer = null;
                        try { this._processTextAnnotations(innerDoc); }
                        catch(e) { Zotero.debug("[Weavero] inner scan error: " + e); }
                        try { this._processNoteAnnotationOverlays(innerDoc, reader); }
                        catch(e) { Zotero.debug("[Weavero] overlay scan error: " + e); }
                    }, 100);
                });
                observer.observe(innerDoc.body || innerDoc.documentElement, {
                    childList: true, subtree: true,
                    attributes: true,
                    attributeFilter: ["data-comment", "value", "style"],
                });

                const data = this._readerObservers.get(reader) || {};
                data.innerObserver = observer;
                data.innerDoc = innerDoc;
                data.innerWindow = innerWin;

                // Proactive Delete/Backspace handler on the inner
                // PDF.js iframe. Attached at BOTH window and document
                // capture, because Zotero's reader keyboard handlers
                // run at the window level — a document-only listener
                // gets preempted before it fires. The handler short-
                // circuits if no annotation is selected, so attaching
                // broadly is safe.
                if (!data.proactiveInnerDoc) {
                    const proactiveInnerDoc =
                        this._makeProactiveDeleteKeydown(reader, "inner-doc");
                    const proactiveInnerWin =
                        this._makeProactiveDeleteKeydown(reader, "inner-win");
                    innerDoc.addEventListener("keydown", proactiveInnerDoc, true);
                    innerWin.addEventListener("keydown", proactiveInnerWin, true);
                    data.proactiveInnerDoc = proactiveInnerDoc;
                    data.proactiveInnerWin = proactiveInnerWin;
                }
                if (!data.selectionTrackerInner) {
                    data.selectionTrackerInner =
                        this._trackAnnotationSelection(reader, innerDoc);
                }

                // Drag-end repositioning. After the user finishes a
                // drag/resize of an annotation in the PDF, our overlay
                // badges need to move to the new annotation position.
                // Tracking during the drag is impractical (annotations
                // are canvas-rendered, not DOM, so MutationObserver
                // can't see them) — instead, fire a recompute on
                // pointerup so the badges land at the final spot once
                // Zotero commits the new position. setTimeout(120 ms)
                // gives Zotero's drag-end handler time to write the
                // updated position into the data model before we read
                // it back via `attachment.getAnnotations()`.
                if (!data.dragEndPointerUp) {
                    // Two-pass rescan: an immediate one (catches the
                    // common case where Zotero commits the new position
                    // synchronously before pointerup propagates) plus a
                    // 60-ms followup (covers the case where the commit
                    // is queued for the next tick). Two cheap rescans
                    // beats one delayed one — the perceived snap-to-
                    // new-position is now under 60 ms instead of 120 ms.
                    const rescan = (label) => {
                        try {
                            this._processNoteAnnotationOverlays(
                                innerDoc, reader);
                        } catch (err) {
                            Zotero.debug("[Weavero] drag-end overlay "
                                + "rescan (" + label + "): " + err);
                        }
                        try {
                            this._processTextAnnotations(innerDoc);
                        } catch (err) {
                            Zotero.debug("[Weavero] drag-end text "
                                + "rescan (" + label + "): " + err);
                        }
                    };
                    let followupTimer = null;
                    const dragEndPointerUp = (e) => {
                        if (e.button !== 0) return;
                        // Fire #1 inline — under most conditions Zotero's
                        // drag handler has already committed the new
                        // position by the time pointerup bubbles to us.
                        rescan("immediate");
                        if (followupTimer) {
                            innerWin.clearTimeout(followupTimer);
                        }
                        // Fire #2 after a short wait — safety net if the
                        // commit was async.
                        followupTimer = innerWin.setTimeout(() => {
                            followupTimer = null;
                            rescan("followup");
                        }, 60);
                    };
                    innerWin.addEventListener(
                        "pointerup", dragEndPointerUp, true);
                    data.dragEndPointerUp = dragEndPointerUp;
                    data.dragEndPointerUpWindow = innerWin;
                }

                this._readerObservers.set(reader, data);
                this._dbg("[Weavero] inner wireUp: observer attached");
            } catch(e) {
                Zotero.debug("[Weavero] inner wireUp error: " + e);
            }
        };

        const tryOnce = () => {
            attempts++;
            // Dead-wrapper guard: when the user closes / navigates the
            // reader window during the 1-second poll window, outerDoc
            // becomes a dead wrapper and `outerDoc.querySelector(...)`
            // throws "TypeError: can't access dead object". Returning
            // true halts the retry chain (no more tick re-schedules).
            if (this._isDead(outerDoc)) {
                this._dbg("[Weavero] inner setup: outerDoc is dead — "
                    + "reader was closed/navigated; abandoning retry");
                return true;
            }
            const innerFrame = outerDoc.querySelector("iframe");
            if (!innerFrame) {
                this._dbg("[Weavero] inner setup: no iframe found (attempt "
                    + attempts + ")");
                return false;
            }
            try {
                const innerWin = innerFrame.contentWindow;
                const innerDoc = innerWin && innerWin.document;
                if (!innerDoc) {
                    Zotero.debug("[Weavero] inner setup: no contentDocument (attempt "
                        + attempts + ")");
                    return false;
                }
                if (!innerDoc.body) {
                    Zotero.debug("[Weavero] inner setup: doc has no body yet (attempt "
                        + attempts + ", URL=" + innerDoc.URL + ")");
                    return false;
                }
                // The reader iframe initially holds about:blank, then
                // navigates to either the PDF.js viewer (PDF reader) or
                // a srcdoc-based DOM view (HTML snapshot, EPUB). Wiring
                // up before either is in place attaches our observer to
                // the now-dead about:blank document. Branch on which
                // reader type loaded.
                const url = String(innerDoc.URL || "");
                if (/viewer\.html/i.test(url)) {
                    wireUp(innerWin, innerDoc);
                    return true;
                }
                // DOM-view reader (HTML snapshot / EPUB) — identified by
                // the #annotation-overlay element that dom-view.tsx
                // attaches to the iframe body and gives a shadow root.
                if (innerDoc.getElementById("annotation-overlay")) {
                    this._wireUpDomViewReader(reader, innerWin, innerDoc);
                    return true;
                }
                Zotero.debug("[Weavero] inner setup: viewer not loaded yet (attempt "
                    + attempts + ", URL=" + url + ")");
                return false;
            } catch(e) {
                Zotero.debug("[Weavero] inner setup probe error (attempt "
                    + attempts + "): " + e);
                return false;
            }
        };

        if (tryOnce()) return null;

        // Poll up to 10 times (1s apart) waiting for the inner iframe to load.
        const win = (Zotero.getMainWindow && Zotero.getMainWindow()) || null;
        const sched = (cb, ms) => win
            ? win.setTimeout(cb, ms)
            : setTimeout(cb, ms);
        const tick = () => {
            if (attempts >= 10) {
                Zotero.debug("[Weavero] inner setup: gave up after "
                    + attempts + " attempts");
                return;
            }
            if (!tryOnce()) sched(tick, 1000);
        };
        sched(tick, 1000);
        return null;
    }

    /**
     * Render a sibling .wv-md-preview panel inside `commentEl` mirroring the
     * .content text with URLs and markdown formatted for display. Keeps
     * .content untouched so Zotero's contenteditable editor never sees foreign
     * DOM (which used to break click-to-edit and produce duplicated text).
     *
     * Visibility is controlled by CSS (.wv-comment-preview class) — when set,
     * .content hides and .wv-md-preview shows. The .wv-editing class on the
     * same .comment swaps them during edit mode (set by focusin handler).
     *
     * Idempotent: caches the rendered source in data-source, skips rebuild
     * when the source matches. Returns true when a render actually occurred.
     */
    _renderPreviewPanel(commentEl) {
        if (!commentEl || !commentEl.querySelector) return false;
        const doc = commentEl.ownerDocument;
        // .content is the editable text node; in Zotero 10 it's wrapped
        // by intermediate elements inside .comment, so we don't constrain
        // to direct-child selectors.
        const contentEl = commentEl.querySelector(".content");
        if (!contentEl) return false;



        // Icons-only mode (Mode 2): the user's pref says "comments stay
        // plain text", so tear down any preview overlay and let .content
        // show the raw source. The 🔗 icon button is the access path to
        // formatted view. Matches the items list's Mode 2 behaviour
        // (`useMd = inlineLinks && enableCommentMarkdown`).
        if (!this._getInlineLinks()) {
            for (const p of commentEl.querySelectorAll(".wv-md-preview")) p.remove();
            commentEl.classList.remove("wv-comment-preview");
            commentEl.classList.remove("wv-editing");
            return false;
        }

        // Read .content via _readCommentTextWithBreaks so multi-line
        // comments survive intact. textContent silently drops <br>
        // separators, which would (a) collapse the visual line break in
        // the rendered preview and (b) let the URL regex consume the next
        // line's text since nothing whitespace-y separates them anymore.
        const text  = this._readCommentTextWithBreaks(contentEl);
        const norm  = this.normalize(text);
        const useMd = this._getEnableCommentMarkdown();
        // hasURI uses URL_REGEX which only matches schemes whose
        // master toggle is on (URLs / Zotero Links / App Links each
        // remove their alternation from URL_SCHEME_ALT when off). No
        // additional `useUrls && ...` gate — that previous coupling
        // hid Zotero / app links whenever the URLs toggle was off.
        const hasUrls = this.hasURI(text);
        const hasMd   = useMd && this.MD_REGEX.test(norm);

        // Defensive cleanup: if a previous bug or version left multiple
        // .wv-md-preview nodes inside this .comment, drop all but the first.
        // Going forward we always reuse the single existing node.
        const allPreviews = commentEl.querySelectorAll(".wv-md-preview");
        for (let i = 1; i < allPreviews.length; i++) allPreviews[i].remove();

        // Existing preview lives as a sibling of .content (we put it
        // there). Search anywhere under .comment because .content's wrapper
        // varies between Zotero builds.
        let preview = allPreviews[0] || null;

        // Nothing worth rendering: tear down any stale preview, restore raw.
        if (!hasUrls && !hasMd) {
            if (preview) preview.remove();
            commentEl.classList.remove("wv-comment-preview");
            return false;
        }

        // Cache key encodes the markdown toggle + the current set of
        // enabled URL schemes (via URL_SCHEME_ALT) so flipping any
        // link-related pref invalidates the cache and forces a rebuild.
        const cacheKey = (useMd ? "m" : "") + ":"
            + this.URL_SCHEME_ALT + ":" + norm;
        if (preview && preview.getAttribute("data-source") === cacheKey) return false;

        // Per-comment rebuild rate limit. When Zotero's React reconciliation
        // strips our preview during sidebar close (or any other DOM
        // churn), cache invalidates and we'd rebuild — Zotero strips
        // again — observer fires — loop, hanging Zotero. The timestamp
        // converts the loop into a slow churn that can't lock the UI.
        const lastRebuild = parseInt(
            commentEl.getAttribute("data-wv-last-rebuild") || "0", 10);
        if ((Date.now() - lastRebuild) < 250) return false;

        if (!preview) {
            preview = doc.createElement("div");
            preview.className = "wv-md-preview";
            contentEl.insertAdjacentElement("afterend", preview);
        }

        // Copy contentEl's padding/margin to the preview so they line up
        // exactly. Zotero's CSS targets `.content` directly with its own
        // padding-left in the reader sidebar; without this our sibling
        // .wv-md-preview hangs flush against the left edge while plain
        // text-only comments (which still use .content) sit indented. We
        // re-apply on every render to follow any future Zotero CSS changes.
        try {
            const win = doc.defaultView;
            const cs = win && win.getComputedStyle && win.getComputedStyle(contentEl);
            if (cs) {
                for (const prop of ["padding-left", "padding-right",
                                    "padding-top", "padding-bottom",
                                    "margin-left", "margin-right",
                                    "margin-top", "margin-bottom"]) {
                    const v = cs.getPropertyValue(prop);
                    if (v) preview.style.setProperty(prop, v);
                }
            }
        } catch(e) {}

        // Build the formatted fragment via the unified renderer.
        // Sidebar preview shows STRIPPED markers (formatted view; raw
        // stays visible in .content during edit mode) and supports
        // multi-line comments via \n → <br> in plain-text segments.
        const frag = this._buildCommentFragment(text, {
            doc, useMd, isTreeMode: false,
            stripMarkers: true,
            lineBreaks: true,
        });

        while (preview.firstChild) preview.removeChild(preview.firstChild);
        preview.appendChild(frag);
        preview.setAttribute("data-source", cacheKey);
        commentEl.setAttribute("data-wv-last-rebuild", String(Date.now()));
        commentEl.classList.add("wv-comment-preview");
        return true;
    }

    /** Find the open Zotero.Reader instance whose iframe document matches
     *  the given idoc. Lets `_processReaderSidebar` (which only knows about
     *  the doc) hand off to per-reader logic that needs the reader. */
    _findReaderForDoc(idoc) {
        if (!idoc) return null;
        for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
            try {
                const iwin = r._iframeWindow
                    || (r._iframe && r._iframe.contentWindow);
                if (iwin && iwin.document === idoc) return r;
            } catch(e) {}
        }
        return null;
    }

    /** Walk the sidebar's annotation rows and add a 🔗 icon to any row
     *  whose .wv-md-preview is overflowing — i.e. the line-clamp is
     *  hiding content the user might need to reach (most importantly,
     *  URLs that fall past line 3). Idempotent: tracks added icons via
     *  data-wv-icon-reason="overflow" and removes them when the row no
     *  longer overflows. CSS hides the icon when the row is `.selected`
     *  (selection lifts the clamp, content is fully visible inline).
     *
     *  Skip this only in icons-only mode (Mode 2), where every row gets
     *  an icon via _iconAddsValueBeyondInline anyway. We DO run when
     *  comment-markdown rendering is off — URL-only comments in that
     *  mode still get a preview (URL spans only), still get clamped,
     *  and still need the popup escape hatch when the URL gets clipped. */
    _updateSidebarOverflowIcons(idoc) {
        if (!this._getEnableReaderSidebar()) return;
        if (!this._getInlineLinks()) return;
        const reader = this._findReaderForDoc(idoc);
        if (!reader || !reader._item) return;

        for (const row of idoc.querySelectorAll(".annotation, .annotation-row")) {
            const cmt = row.querySelector(".comment.wv-comment-preview");
            if (!cmt) continue;
            const preview = cmt.querySelector(".wv-md-preview");
            if (!preview) continue;
            const overflows = preview.scrollHeight > preview.clientHeight + 1;
            const existing = row.querySelector("." + BTN_SIDEBAR_CLASS);

            if (overflows) {
                if (existing) continue;
                const key = this._findAnnotationKey(row, reader);
                if (!key) continue;
                const lib = this.libraryIDFromReader(reader);
                const comment = this.getModelComment(lib, key);
                if (!comment) continue;
                // Respect the markdown-icon pref — a markdown-only
                // comment that overflows must NOT get an icon when
                // the user has opted out of markdown decorations,
                // even though the popup would still show formatting.
                if (!this._iconWantedFor(comment)) {
                    if (existing
                        && existing.getAttribute("data-wv-icon-reason") === "overflow") {
                        existing.remove();
                    }
                    continue;
                }
                const target = row.querySelector(".head .end")
                            || row.querySelector("header .end")
                            || row.querySelector(".head .menu")
                            || row.querySelector("header .menu")
                            || row.querySelector(".head")
                            || row.querySelector("header")
                            || row;
                const btn = idoc.createElementNS(
                    "http://www.w3.org/1999/xhtml", "button");
                btn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS;
                btn.setAttribute("data-wv-icon-reason", "overflow");
                this._applyIconState(btn, comment);
                btn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(btn);
                    this.openCommentPopup(comment, {
                        anchorNode: btn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                const last = target.lastElementChild;
                if (last) target.insertBefore(btn, last);
                else target.appendChild(btn);
            } else if (existing
                && existing.getAttribute("data-wv-icon-reason") === "overflow") {
                // Row no longer overflows (maybe the comment was edited
                // shorter, or layout widened) — drop the overflow-only icon.
                existing.remove();
            }
        }
    }

    _processReaderSidebar(idoc) {
        // Re-entry guard: closing the reader's annotations sidebar tears
        // down many DOM nodes, our preview-panel writes (or strips) react
        // to that, and the resulting mutations can fire the iframe
        // observer multiple times before the close animation settles.
        // Without this guard, large sidebars can hang Zotero while this
        // function recurses through itself.
        if (this._processReaderSidebarBusy) return;
        this._processReaderSidebarBusy = true;
        try {
            this._processReaderSidebarBody(idoc);
        } finally {
            this._processReaderSidebarBusy = false;
        }
        // Reader-panels affordances (filter button, bookmarks tab) live in the
        // same React-app document and re-inject idempotently on each scan.
        try { this._wvProcessReaderPanels(idoc); }
        catch (e) { Zotero.debug("[Weavero] _wvProcessReaderPanels err: " + e); }
    }

    _processReaderSidebarBody(idoc) {
        if (!this._getEnableReaderSidebar()) {
            this._stripReaderSidebar(idoc);
            return;
        }
        // The preview-panel CSS (visibility swap rules + markdown classes)
        // must be in this iframe before _renderPreviewPanel adds the
        // .wv-comment-preview class — otherwise that class is meaningless
        // and the raw .content stays visible alongside .wv-md-preview.
        // _sidebarHandler also calls this on each row render, but that
        // pathway is skipped on rows whose icon adds no value, so we
        // can't rely on it as the sole entry point.
        try { this._ensureReaderOuterStyles(idoc); } catch(e) {}

        // After rendering previews, schedule an overflow-icons pass on the
        // next animation frame. Layout has settled by then, so we can
        // measure scrollHeight vs clientHeight on each .wv-md-preview and
        // add a 🔗 icon to rows where the line-clamp is hiding part of the
        // comment (e.g. a URL clipped after line 3). Icon disappears on
        // selection via CSS — see `.annotation.selected .wv-btn-sidebar`.
        const iwin = idoc.defaultView;
        if (iwin && iwin.requestAnimationFrame) {
            iwin.requestAnimationFrame(() => {
                try { this._updateSidebarOverflowIcons(idoc); }
                catch(e) { Zotero.debug(
                    "[Weavero] overflow icons: " + e); }
            });
        }
        this._dbg("[Weavero] _processReaderSidebar entered (active="
            + (idoc.activeElement
                ? idoc.activeElement.tagName + "." + (idoc.activeElement.className || "(no class)")
                : "null") + ")");
        // Sidebar comments: don't touch .content (Zotero's contenteditable
        // editor lives there). Render a sibling .wv-md-preview inside each
        // .comment so URLs and markdown render in a non-editable preview
        // shown when not editing. CSS swaps preview <-> raw .content based
        // on the wv-editing class set by the focusin/focusout handlers.
        const seen = new Set();
        let count = 0;
        for (const sel of [".annotation-row .comment", ".annotation .comment"]) {
            for (const cmt of idoc.querySelectorAll(sel)) {
                if (seen.has(cmt)) continue;
                seen.add(cmt);
                if (this._renderPreviewPanel(cmt)) count++;
            }
        }
        if (count) this._dbg("[Weavero] sidebar: rendered " + count + " previews");

        // Mirror right-pane behaviour: hide the popup-icon button injected by
        // _sidebarHandler when (a) we're in Mode 1 and (b) the comment isn't
        // overflowing, since the inline coloured URLs already cover everything.
        // We hide via display:none rather than remove() so Zotero's React
        // re-renders don't fight us.
        const inline = this._getInlineLinks();
        const active = idoc.activeElement;
        for (const row of idoc.querySelectorAll(".annotation-row, .annotation")) {
            const btn = row.querySelector("button.wv-btn");
            if (!btn) continue;
            const commentEl = row.querySelector(".comment .content")
                          || row.querySelector(".comment")
                          || row.querySelector(".body");
            // Skip the visibility recompute for the row currently being
            // edited — the overflow measurement flickers as the comment
            // text grows on each keystroke, which makes the icon blink.
            // Whatever state the icon was in before the user started
            // editing stays put until they click away.
            if (active && row.contains(active)) continue;

            // Format-only / URL+format always need the icon: the formatted
            // preview lives only inside the popup, never inline. Plain-URL
            // comments keep the original "show on overflow only" rule when
            // we're in inline mode.
            const hasFormat = btn.getAttribute("data-has-format") === "markdown";
            let shouldShow = !inline || hasFormat;
            if (inline && !hasFormat && commentEl) {
                try {
                    shouldShow =
                        commentEl.scrollHeight > commentEl.clientHeight + 1
                        || commentEl.scrollWidth > commentEl.clientWidth + 1;
                } catch(e) { shouldShow = false; }
            }
            btn.style.display = shouldShow ? "" : "none";
        }
    }

    // ---- Compact title bar for reader windows -----------------------------
    /** Hide the reader window's menubar row (File / Edit / View / Go) and
     *  let Alt summon it — same mechanism as the main window's compact
     *  title bar, but adapted to the reader's simpler structure: a bare
     *  XUL `<menubar>` directly inside `<window>`, no `#titlebar` vbox,
     *  no icon container, no buttonbox to move.
     *
     *  Caveat: we can't also remove the OS-drawn title bar above the
     *  menubar — Windows commits chromemargin at window-create time and
     *  reader.xhtml doesn't set it. Net visual win is ~21px (the
     *  menubar row); the OS title bar (~30px) stays.
     *
     *  Idempotent — applying twice is a no-op. Per-window state stashed
     *  on `win._wvCompactMenubar`. Mac is excluded (matches main-window
     *  apply path). */
    _applyReaderCompactMenubar(reader) {
        try {
            if (!reader || reader.tabID) return;   // window-mode only
            const win = reader._window;
            if (!win || !win.document) return;
            if ((Zotero as any).isMac) return;
            if (win._wvCompactMenubar) return;
            const doc = win.document;
            const menubar = doc.querySelector("menubar");
            if (!menubar) return;

            const stash: any = {};

            // Also try to remove the OS-drawn title bar above the menubar
            // by setting `customtitlebar="true"` on the <window> element —
            // the modern Mozilla attribute Zotero's main window uses. The
            // user accepted this is an unstable approach: Mozilla docs
            // imply this attribute is consumed at widget-creation time,
            // but in practice setting it dynamically on a reader window
            // DOES collapse the OS title bar from ~39px to ~8px (just
            // the resize border) on Windows. If a future Firefox/Zotero
            // update tightens this behavior, the OS title bar will come
            // back — the rest of the compact-menubar logic will still
            // function regardless.
            const winEl = doc.documentElement;
            stash.customtitlebarOrig = winEl.getAttribute("customtitlebar");
            stash.drawtitleOrig = winEl.getAttribute("drawtitle");
            try {
                winEl.setAttribute("customtitlebar", "true");
                winEl.toggleAttribute("drawtitle", false);
            } catch (e) {}

            // Mark menubar hidden via the same custom attribute the main
            // window uses (different doc, so no conflict).
            menubar.setAttribute("wv-compact-hidden", "true");

            // Inject a Zotero "Z" icon as the first visual element of the
            // menubar — mirrors the main window's `.titlebar-icon-
            // container`, which sits to the left of the File / Edit /
            // View / ... menus. Uses Zotero's official `z.svg` chrome
            // resource. The icon is positioned absolutely so XUL's
            // menubar machinery (which iterates `<menu>` children for
            // accesskey activation) doesn't see it as a navigation
            // target. The menubar gets a left-pad to leave room for it.
            try {
                if (!menubar.querySelector(".wv-reader-menubar-icon")) {
                    const HTML = "http://www.w3.org/1999/xhtml";
                    const iconEl = doc.createElementNS(HTML, "span");
                    iconEl.className = "wv-reader-menubar-icon";
                    iconEl.setAttribute("aria-hidden", "true");
                    menubar.insertBefore(iconEl, menubar.firstChild);
                    stash.menubarIcon = iconEl;
                }
            } catch (e) {}

            // Add window controls to the tab strip (if it exists yet).
            // `_ensureReaderWindowControls` is also called from
            // `_ensureReaderWindowTabStrip` so that if the strip is
            // created AFTER compact mode was applied (e.g. apply ran in
            // init() before the toolbar event fired), the controls
            // still get added once the strip materializes.
            try { this._ensureReaderWindowControls(win, stash); } catch (e) {}

            // Inject collapsing CSS into this reader window's document.
            this._ensureReaderCompactMenubarStyles(doc);

            // Same listener logic as the main-window apply: reveal on
            // Alt-DOWN so Mozilla's native Alt-UP handler activates the
            // menubar (focuses first menu, underlines accesskeys);
            // toggle off on second Alt; Esc collapses only when no menu
            // is open; mousedown outside collapses.
            let altAlone = false;
            let menubarWasVisibleAtAltDown = false;
            const isDead = () => {
                try { return !win || win.closed; } catch (e) { return true; }
            };
            const isCollapsed = () => menubar.getAttribute("wv-compact-hidden") === "true";
            const collapse = () => {
                try { if (!isDead()) menubar.setAttribute("wv-compact-hidden", "true"); }
                catch (e) {}
            };
            const keyDown = (e: any) => {
                try {
                    if (isDead()) return;
                    if (e.key === "Alt" && !e.repeat) {
                        altAlone = true;
                        const wasCollapsed = isCollapsed();
                        menubarWasVisibleAtAltDown = !wasCollapsed;
                        if (wasCollapsed) menubar.removeAttribute("wv-compact-hidden");
                    } else if (e.altKey) {
                        altAlone = false;
                    }
                } catch (er) {}
            };
            const keyUp = (e: any) => {
                try {
                    if (isDead()) return;
                    if (e.key !== "Alt") return;
                    if (!altAlone) return;
                    altAlone = false;
                    if (menubarWasVisibleAtAltDown) collapse();
                } catch (er) {}
            };
            const escapeKey = (e: any) => {
                try {
                    if (isDead()) return;
                    if (e.key !== "Escape" || isCollapsed()) return;
                    const openMenu = menubar.querySelector("menu[open='true'], menupopup[state='open']");
                    if (openMenu) return;
                    collapse();
                } catch (er) {}
            };
            const docMouseDown = (e: any) => {
                try {
                    if (isDead() || isCollapsed()) return;
                    const t = e.target;
                    if (!t || typeof t.closest !== "function") return;
                    if (t.closest("menubar")) return;
                    if (t.closest("menupopup")) return;
                    collapse();
                } catch (er) {}
            };
            // When a menu item is activated (Tools → Plugins, File →
            // Print, etc.), retract the menubar — Firefox behaviour.
            // The action still runs; we listen on the bubble phase so
            // the menuitem's own oncommand handler executes first.
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

            // The reader window's "toolbar" (page nav, annotation tools,
            // sidebar buttons) lives inside an <iframe> that hosts
            // Zotero's reader app, NOT in this chrome doc. Mousedowns
            // there don't bubble to our chrome-doc listener — so we
            // also wire a mousedown listener INTO the iframe's content
            // document. Any click there collapses the menubar (the user
            // moved on from menu navigation).
            const wireIframe = () => {
                try {
                    const ifWin = reader._iframeWindow;
                    const ifDoc = ifWin && ifWin.document;
                    if (!ifDoc) {
                        Zotero.debug("[Weavero compact-dbg] wireIframe: ifDoc null, retry later");
                        return false;
                    }
                    if ((stash as any).iframeMouseDown) {
                        Zotero.debug("[Weavero compact-dbg] wireIframe: already wired, skip");
                        return true;
                    }

                    // Override `-moz-window-dragging: drag` on the reader
                    // toolbar's empty areas so mouse events actually fire
                    // there. Without this override, Mozilla intercepts
                    // every mouse/pointer/focus event on the drag region
                    // for window-drag handling, so a click on an empty
                    // toolbar area generates NO JS event at all — and our
                    // "click outside to dismiss" can't see it. Trade-off:
                    // the user can no longer window-drag by clicking the
                    // reader toolbar's empty area, but the tab strip
                    // above remains draggable for the same purpose.
                    try {
                        if (!ifDoc.getElementById("wv-reader-iframe-nodrag")) {
                            const style = ifDoc.createElement("style");
                            style.id = "wv-reader-iframe-nodrag";
                            style.textContent =
                                ".toolbar { -moz-window-dragging: no-drag !important; }";
                            (ifDoc.head || ifDoc.documentElement).appendChild(style);
                            stash.iframeNoDragStyle = style;
                        }
                    } catch (e) {}
                    const onEvt = (label: string) => (e: any) => {
                        try {
                            Zotero.debug("[Weavero compact-dbg] " + label
                                + " fired; isCollapsed=" + isCollapsed()
                                + " isDead=" + isDead()
                                + " target=" + (e.target?.tagName || "?")
                                + "." + ((e.target?.className || "") + "").slice(0, 30));
                            if (isDead() || isCollapsed()) return;
                            Zotero.debug("[Weavero compact-dbg] " + label + " -> collapse()");
                            collapse();
                        } catch (er) {
                            Zotero.debug("[Weavero compact-dbg] " + label + " err: " + er);
                        }
                    };
                    const mdH = onEvt("ifDoc.mousedown");
                    const muH = onEvt("ifDoc.mouseup");
                    const blurH = onEvt("win.blur");
                    const focusoutH = onEvt("win.focusout");
                    ifDoc.addEventListener("mousedown", mdH, true);
                    ifDoc.addEventListener("mouseup", muH, true);
                    win.addEventListener("blur", blurH, true);
                    win.addEventListener("focusout", focusoutH, true);

                    // Also forward the chrome window's Alt-toggle to the
                    // iframe doc. When focus is inside the reader app
                    // (PDF/EPUB viewer), the Alt keystroke is captured
                    // by the iframe and never reaches our chrome-window
                    // keydown/keyup listeners — so the menubar would
                    // never reveal. We re-attach those handlers here on
                    // the iframe doc as well; they manipulate the
                    // chrome-doc menubar element either way.
                    const kdInIframe = (e: any) => { try { stash.keyDown(e); } catch (er) {} };
                    const kuInIframe = (e: any) => { try { stash.keyUp(e); } catch (er) {} };
                    const escInIframe = (e: any) => { try { stash.escapeKey(e); } catch (er) {} };
                    ifDoc.addEventListener("keydown", kdInIframe, true);
                    ifDoc.addEventListener("keyup", kuInIframe, true);
                    ifDoc.addEventListener("keydown", escInIframe, true);
                    stash.ifKeyDown = kdInIframe;
                    stash.ifKeyUp = kuInIframe;
                    stash.ifEscape = escInIframe;

                    stash.iframeWin = ifWin;
                    stash.iframeMouseDown = mdH;
                    stash.iframeMouseUp = muH;
                    stash.winBlur = blurH;
                    stash.winFocusOut = focusoutH;
                    Zotero.debug("[Weavero compact-dbg] wireIframe: all listeners attached");
                    return true;
                } catch (e) {
                    Zotero.debug("[Weavero compact-dbg] wireIframe err: " + e);
                    return false;
                }
            };
            // Attach now if the iframe is ready; otherwise wait briefly
            // (the reader app finishes loading shortly after the chrome
            // doc). Bounded retry — bail after ~3s.
            if (!wireIframe()) {
                let retries = 30;
                const retry = () => {
                    if (isDead() || retries-- <= 0) return;
                    if (!wireIframe()) win.setTimeout(retry, 100);
                };
                win.setTimeout(retry, 100);
            }

            // Clean up our listeners + stash + iframe-doc references the
            // moment this reader window starts unloading. Without this,
            // the inner iframe doc (resource://zotero/reader/reader.html)
            // keeps our closures alive briefly past chrome-window close,
            // and those closures hold references to the dying chrome
            // window. That cross-document keepalive was preventing
            // Zotero's `ReaderWindow` from being spliced out of
            // `Zotero.Reader._readers`, leaving a dead entry that broke
            // subsequent `Zotero.Reader.open` calls.
            //
            // CRITICAL: bubble phase only, and require the event target
            // to be the chrome window's own document. With capture phase
            // (or without the target check), the listener also fires on
            // nested-iframe unloads — including the about:blank → reader.
            // html transition during initial load — which would run the
            // revert immediately and undo the apply.
            const onUnload = (e: any) => {
                if (e.target !== win.document) return;
                try { this._revertReaderCompactMenubar(reader); } catch (er) {}
                // Defensively splice this reader out of Zotero.Reader._readers.
                // Zotero's `<window onclose="reader.close()">` is supposed
                // to do this, but in compact-mode the close path runs
                // through our injected × button → `win.close()` and
                // sometimes Zotero's onClose splice doesn't fire — the
                // dead ReaderWindow stays in `_readers`, then the next
                // `Session.save()` captures it via `getWindowStates()`
                // and on restart that dead entry restores as a ghost
                // reader window. Splicing here makes the cleanup
                // deterministic.
                try {
                    const readersArr = (Zotero as any).Reader?._readers;
                    if (Array.isArray(readersArr)) {
                        const idx = readersArr.indexOf(reader);
                        if (idx >= 0) readersArr.splice(idx, 1);
                    }
                } catch (er) {}
                // Trigger a session save so Zotero's session.json no
                // longer references this just-closed reader. Without it,
                // the previous save snapshot may keep the reader listed
                // until the debounced save fires later.
                try {
                    if ((Zotero as any).Session?.debounceSave) {
                        (Zotero as any).Session.debounceSave();
                    }
                } catch (er) {}
            };
            win.addEventListener("unload", onUnload, { once: true });
            stash.onUnload = onUnload;

            win._wvCompactMenubar = stash;
        } catch (e) {
            Zotero.debug("[Weavero] _applyReaderCompactMenubar err: " + e);
            try { this._revertReaderCompactMenubar(reader); } catch (er) {}
        }
    }

    /** Undo `_applyReaderCompactMenubar`. Idempotent. */
    _revertReaderCompactMenubar(reader) {
        try {
            if (!reader) return;
            const win = reader._window;
            if (!win || !win.document) return;
            try { if (win.closed) return; } catch (e) { return; }
            const doc = win.document;
            const menubar = doc.querySelector("menubar");
            const stash = win._wvCompactMenubar || {};

            try { if (menubar) menubar.removeAttribute("wv-compact-hidden"); } catch (e) {}
            try { stash.menubarIcon?.remove(); } catch (e) {}

            // Remove the window controls we added to the tab strip, plus
            // the sizemodechange/resize listeners that kept the max icon
            // synced.
            try { stash.controls?.remove(); } catch (e) {}
            try {
                if (stash.syncMaxIcon) {
                    win.removeEventListener("sizemodechange", stash.syncMaxIcon);
                    win.removeEventListener("resize", stash.syncMaxIcon);
                }
            } catch (e) {}

            // Restore customtitlebar / drawtitle on the <window> root. If
            // they weren't set originally (typical case — reader.xhtml
            // has neither), remove our additions entirely so the OS
            // title bar comes back as Zotero ships it.
            try {
                const winEl = doc.documentElement;
                if (stash.customtitlebarOrig == null) winEl.removeAttribute("customtitlebar");
                else winEl.setAttribute("customtitlebar", stash.customtitlebarOrig);
                if (stash.drawtitleOrig == null) winEl.removeAttribute("drawtitle");
                else winEl.setAttribute("drawtitle", stash.drawtitleOrig);
            } catch (e) {}

            try { if (stash.keyDown) win.removeEventListener("keydown", stash.keyDown, true); } catch (e) {}
            try { if (stash.keyUp) win.removeEventListener("keyup", stash.keyUp, true); } catch (e) {}
            try { if (stash.escapeKey) win.removeEventListener("keydown", stash.escapeKey, true); } catch (e) {}
            try { if (stash.docMouseDown) win.removeEventListener("mousedown", stash.docMouseDown, true); } catch (e) {}
            try { if (stash.menuCommand && menubar) menubar.removeEventListener("command", stash.menuCommand); } catch (e) {}
            try { if (stash.onUnload) win.removeEventListener("unload", stash.onUnload); } catch (e) {}
            try {
                if (stash.iframeWin && stash.iframeWin.document) {
                    const ifD = stash.iframeWin.document;
                    if (stash.iframeMouseDown) ifD.removeEventListener("mousedown", stash.iframeMouseDown, true);
                    if (stash.iframeMouseUp) ifD.removeEventListener("mouseup", stash.iframeMouseUp, true);
                    if (stash.ifKeyDown) ifD.removeEventListener("keydown", stash.ifKeyDown, true);
                    if (stash.ifKeyUp) ifD.removeEventListener("keyup", stash.ifKeyUp, true);
                    if (stash.ifEscape) ifD.removeEventListener("keydown", stash.ifEscape, true);
                    try { stash.iframeNoDragStyle?.remove(); } catch (e) {}
                }
            } catch (e) {}
            try { if (stash.winBlur) win.removeEventListener("blur", stash.winBlur, true); } catch (e) {}
            try { if (stash.winFocusOut) win.removeEventListener("focusout", stash.winFocusOut, true); } catch (e) {}
            try { doc.getElementById("wv-reader-compact-menubar-styles")?.remove(); } catch (e) {}
            try { delete win._wvCompactMenubar; } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _revertReaderCompactMenubar err: " + e);
        }
    }

    /** Add Win11-style window controls (min / max-or-restore / close)
     *  to the right edge of the reader window's tab strip. Idempotent.
     *  Stash references on the existing `win._wvCompactMenubar` so
     *  revert can remove them and unhook listeners. Called from both
     *  `_applyReaderCompactMenubar` (when strip exists at apply time)
     *  AND `_ensureReaderWindowTabStrip` (when strip is created after
     *  apply, e.g. via init→apply→toolbar-render ordering). The order-
     *  agnostic design means controls always appear once both compact
     *  mode and the strip are present. */
    _ensureReaderWindowControls(win, stashOverride?: any) {
        try {
            if (!win || !win.document || win.closed) return;
            const stash = stashOverride || win._wvCompactMenubar;
            if (!stash) return;                  // compact mode not applied
            const doc = win.document;
            const strip = doc.querySelector(".wv-window-tabstrip");
            if (!strip) return;                  // tab strip not created yet
            if (strip.querySelector(".wv-window-controls")) return;   // already added

            const HTML = "http://www.w3.org/1999/xhtml";
            const controls = doc.createElementNS(HTML, "div");
            controls.className = "wv-window-controls";

            const mkCtl = (cls: string, label: string, handler: () => void) => {
                const btn = doc.createElementNS(HTML, "button");
                btn.className = "wv-window-control " + cls;
                btn.setAttribute("title", label);
                btn.setAttribute("tabindex", "-1");
                btn.setAttribute("aria-label", label);
                btn.addEventListener("click", (e: any) => {
                    try { e.stopPropagation(); e.preventDefault(); } catch (er) {}
                    try { handler(); } catch (er) {}
                });
                return btn;
            };

            const minBtn = mkCtl("wv-window-min", "Minimize", () => win.minimize());
            const maxBtn = mkCtl("wv-window-max", "Maximize", () => {
                if (win.windowState === win.STATE_MAXIMIZED) win.restore();
                else win.maximize();
            });
            const closeBtn = mkCtl("wv-window-close", "Close", () => win.close());

            // Keep the max/restore icon in sync via a data-state attribute.
            // The CSS rule `.wv-window-max[data-state='maximized']` swaps
            // the bg image from maximize.svg to restore.svg.
            const syncMaxIcon = () => {
                try {
                    if (win.windowState === win.STATE_MAXIMIZED) {
                        maxBtn.setAttribute("data-state", "maximized");
                        maxBtn.setAttribute("title", "Restore");
                        maxBtn.setAttribute("aria-label", "Restore");
                    } else {
                        maxBtn.removeAttribute("data-state");
                        maxBtn.setAttribute("title", "Maximize");
                        maxBtn.setAttribute("aria-label", "Maximize");
                    }
                } catch (e) {}
            };
            try {
                win.addEventListener("sizemodechange", syncMaxIcon);
                win.addEventListener("resize", syncMaxIcon);
            } catch (e) {}
            syncMaxIcon();

            controls.appendChild(minBtn);
            controls.appendChild(maxBtn);
            controls.appendChild(closeBtn);
            strip.appendChild(controls);

            stash.controls = controls;
            stash.syncMaxIcon = syncMaxIcon;
        } catch (e) {
            Zotero.debug("[Weavero] _ensureReaderWindowControls err: " + e);
        }
    }

    /** Mount a library-aware tooltip on the reader window's tab —
     *  mirrors the main-window's `#wv-tab-library-tooltip`. For an item
     *  in a group library, shows the title + library-group icon + name.
     *  For My Library items, falls back to a plain-text tooltip of the
     *  title. The tooltip element is created once per reader window
     *  document and wired via the XUL `tooltip="..."` attribute on the
     *  custom `.wv-window-tab` div. */
    _ensureReaderWindowTabTooltip(reader, tab) {
        try {
            if (!reader || !tab) return;
            const win = reader._window;
            if (!win || !win.document) return;
            const doc = win.document;
            const TOOLTIP_ID = "wv-window-tab-tooltip";
            let tooltip: any = doc.getElementById(TOOLTIP_ID);
            if (!tooltip) {
                tooltip = doc.createXULElement("tooltip");
                tooltip.id = TOOLTIP_ID;
                tooltip.addEventListener("popupshowing", (e: any) => {
                    try {
                        const ok = this._populateReaderTabTooltip(reader, tooltip);
                        if (!ok) e.preventDefault();
                    } catch (er) {
                        Zotero.debug("[Weavero] reader tab tooltip err: " + er);
                        e.preventDefault();
                    }
                });
                // Mount in any popupset, or fall back to documentElement.
                const popupset = doc.querySelector("popupset") || doc.documentElement;
                popupset.appendChild(tooltip);
            }
            // The XUL `tooltip="..."` attribute only auto-fires on XUL
            // elements; our tab is an HTML <div>, so the tooltip never
            // opens by itself. Wire mouseenter/mouseleave to open and
            // close the XUL tooltip element manually at the mouse
            // position, matching what XUL would do automatically on a
            // XUL element. ~500ms delay matches Mozilla's default
            // tooltip show timing.
            if (!(tab as any)._wvTtBound) {
                (tab as any)._wvTtBound = true;
                let showTimer: any = null;
                let lastScreenX = 0, lastScreenY = 0;
                let openX = 0, openY = 0;
                let isOpen = false;
                // Stash the trigger reader on the tooltip element so the
                // popupshowing populator can read it. We attach to the
                // tooltip object once.
                (tooltip as any)._wvReader = reader;
                const hideTip = () => {
                    try {
                        if (showTimer) { win.clearTimeout(showTimer); showTimer = null; }
                        const tt = doc.getElementById(TOOLTIP_ID);
                        if (tt && typeof tt.hidePopup === "function") tt.hidePopup();
                        isOpen = false;
                    } catch (er) {}
                };
                tab.addEventListener("mouseenter", (e: any) => {
                    try {
                        lastScreenX = e.screenX; lastScreenY = e.screenY;
                        if (showTimer) win.clearTimeout(showTimer);
                        showTimer = win.setTimeout(() => {
                            try {
                                const tt = doc.getElementById(TOOLTIP_ID);
                                if (tt && typeof tt.openPopupAtScreen === "function") {
                                    openX = lastScreenX; openY = lastScreenY;
                                    isOpen = true;
                                    tt.openPopupAtScreen(lastScreenX, lastScreenY, false);
                                }
                            } catch (er) {}
                        }, 500);
                    } catch (er) {}
                });
                // Every mousemove updates the tracked position. If the
                // tooltip is currently open and the cursor has moved
                // more than a few pixels from where the tooltip opened,
                // hide it — matches native tooltip behaviour (tooltip
                // follows you to a place, hides on cursor motion). The
                // small threshold avoids flickering from sub-pixel
                // mouse jitter.
                tab.addEventListener("mousemove", (e: any) => {
                    lastScreenX = e.screenX; lastScreenY = e.screenY;
                    if (isOpen) {
                        const dx = e.screenX - openX, dy = e.screenY - openY;
                        if (dx * dx + dy * dy > 25) hideTip();
                    }
                });
                tab.addEventListener("mouseleave", hideTip);
                tab.addEventListener("mousedown", hideTip);
                tab.addEventListener("contextmenu", hideTip);
            }
            // Keep the attribute for documentation purposes.
            tab.setAttribute("tooltip", TOOLTIP_ID);
        } catch (e) {
            Zotero.debug("[Weavero] _ensureReaderWindowTabTooltip err: " + e);
        }
    }

    /** popupshowing populator for the reader-window tab tooltip. Decides
     *  between rich (group library) and plain (My Library / no item)
     *  rendering — same dispatch the main-window tooltip uses. */
    _populateReaderTabTooltip(reader, tooltip) {
        try {
            const win = reader._window;
            const doc = win.document;
            while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
            tooltip.removeAttribute("label");

            const renderPlainLabel = (text) => {
                tooltip.setAttribute("label", text);
                const desc = doc.createXULElement("description");
                desc.setAttribute("class", "tooltip-label");
                desc.textContent = text;
                tooltip.appendChild(desc);
            };

            const item = (() => {
                try { return reader.itemID ? Zotero.Items.get(reader.itemID) : null; }
                catch (e) { return null; }
            })();
            // Use the reader's own `_title` (or the chrome window's
            // document.title — same value) for tooltip text. The
            // attachment item's `getDisplayTitle()` returns just the
            // content-type label (e.g. "PDF") for PDF/EPUB attachments,
            // which is NOT what the user wants to see — they want the
            // same title shown in the tab strip, which is the parent
            // document's title.
            const title = reader._title || doc.title
                || (item ? item.getDisplayTitle() : "");

            let lib = null;
            try { lib = item ? Zotero.Libraries.get(item.libraryID) : null; }
            catch (e) {}

            // Non-group library or no item: plain title tooltip.
            if (!lib || lib.libraryType !== "group") {
                if (title) { renderPlainLabel(title); return true; }
                return false;
            }

            // Group library: rich card with title + library header. Same
            // visual structure as the main-window tooltip (wv-tab-tooltip-
            // wrap > title + sep + header-row[icon + libname]).
            const wrap = doc.createXULElement("vbox");
            wrap.setAttribute("class", "wv-tab-tooltip-wrap");

            const titleEl = doc.createXULElement("description");
            titleEl.setAttribute("class", "wv-tab-tooltip-title");
            titleEl.textContent = title;
            wrap.appendChild(titleEl);

            const sep = doc.createXULElement("box");
            sep.setAttribute("class", "wv-tab-tooltip-sep");
            wrap.appendChild(sep);

            const headerRow = doc.createXULElement("hbox");
            headerRow.setAttribute("class", "wv-tab-tooltip-header");
            headerRow.setAttribute("align", "center");
            const iconEl = doc.createXULElement("image");
            iconEl.setAttribute("class", "wv-tab-tooltip-icon");
            iconEl.setAttribute("src",
                "chrome://zotero/skin/collection-tree/16/light/library-group.svg");
            headerRow.appendChild(iconEl);
            const nameEl = doc.createXULElement("description");
            nameEl.setAttribute("class", "wv-tab-tooltip-libname");
            nameEl.textContent = lib.name;
            headerRow.appendChild(nameEl);
            wrap.appendChild(headerRow);

            tooltip.appendChild(wrap);
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _populateReaderTabTooltip err: " + e);
            return false;
        }
    }

    /** Mount a right-click context menu on the reader window's tab —
     *  mirrors the main-window tab menu's most-used items. The standalone
     *  reader window can't host every item from Zotero's tab context menu
     *  (e.g. "Close Other Tabs" makes no sense in a one-tab window), so
     *  this provides the actionable subset:
     *    - Show in Library    — selects the reader's item in the main window
     *    - Move to Tab        — convert this window back into a tab
     *    - Copy Select Link   — `zotero://select/…/items/<key>`
     *    - Copy Open Link     — `zotero://open/…/items/<key>`
     *    - Close              — close the reader window
     *  Copy-link entries inherit the same enable-state from prefs as the
     *  main-window menu (gated by `_getEnableCopyItemLink`). */
    _ensureReaderWindowTabContextMenu(reader, tab) {
        try {
            if (!reader || !tab) return;
            const win = reader._window;
            if (!win || !win.document) return;
            const doc = win.document;
            const MENU_ID = "wv-window-tab-context-menu";
            let menu: any = doc.getElementById(MENU_ID);
            if (!menu) {
                menu = doc.createXULElement("menupopup");
                menu.id = MENU_ID;

                const mkItem = (label: string, onClick: () => void, opts?: { icon?: string; getVisible?: () => boolean }) => {
                    const it = doc.createXULElement("menuitem");
                    it.setAttribute("label", label);
                    if (opts?.icon) {
                        // XUL renders `image="..."` on a menuitem only when
                        // the item carries class="menuitem-iconic". Add
                        // both — the icon shows as a 16x16 sprite to the
                        // left of the label, matching the main-window tab
                        // context menu's iconic items.
                        it.setAttribute("class", "menuitem-iconic");
                        it.setAttribute("image", opts.icon);
                    }
                    it.addEventListener("command", (e: any) => {
                        try { e.stopPropagation(); } catch (er) {}
                        try { onClick(); } catch (er) {
                            Zotero.debug("[Weavero] reader tab menu err: " + er);
                        }
                    });
                    if (opts?.getVisible) (it as any)._wvGetVisible = opts.getVisible;
                    return it;
                };

                // Pick the right icon for the reader window's current
                // theme. The reader chrome uses the system theme,
                // matching what the main window picks (via
                // `_detectUIDark`). Same fallback chain that the main-
                // window tab menu uses.
                const wvIcon = (this as any)._detectUIDark?.()
                    ? (this as any)._menuItemIconURLDark
                    : (this as any)._menuItemIconURLLight;

                const showInLibrary = mkItem("Show in Library", () => {
                    try { reader.showInLibrary?.(); } catch (e) {}
                });
                const moveToTab = mkItem("Move Tab to Main Window", () => {
                    try { this._moveReaderToTab(reader.itemID); } catch (e) {}
                });
                const sep = doc.createXULElement("menuseparator");
                // Copy Select/Open Link — these are Weavero-added items
                // (the same two that appear in the main-window tab
                // context menu), so they get the Weavero icon to make
                // their provenance obvious.
                const copySelect = mkItem("Copy Select Link", () => {
                    try {
                        const item = Zotero.Items.get(reader.itemID);
                        if (item) this._copyItemLinks([item], "select");
                    } catch (e) {}
                }, { icon: wvIcon, getVisible: () => this._getEnableCopyItemLink?.() ?? false });
                const copyOpen = mkItem("Copy Open Link", () => {
                    try {
                        const item = Zotero.Items.get(reader.itemID);
                        if (item) this._copyItemLinks([item], "open");
                    } catch (e) {}
                }, { icon: wvIcon, getVisible: () => this._getEnableCopyItemLink?.() ?? false });
                const sep2 = doc.createXULElement("menuseparator");
                const closeItem = mkItem("Close", () => {
                    try { reader.close?.() ?? win.close(); } catch (e) {}
                });

                menu.appendChild(showInLibrary);
                menu.appendChild(moveToTab);
                menu.appendChild(sep);
                menu.appendChild(copySelect);
                menu.appendChild(copyOpen);
                menu.appendChild(sep2);
                menu.appendChild(closeItem);

                // popupshowing handler updates visibility of pref-gated items.
                menu.addEventListener("popupshowing", () => {
                    try {
                        for (const child of Array.from(menu.children) as any[]) {
                            if (typeof child._wvGetVisible === "function") {
                                const vis = child._wvGetVisible();
                                child.hidden = !vis;
                            }
                        }
                    } catch (e) {}
                });

                const popupset = doc.querySelector("popupset") || doc.documentElement;
                popupset.appendChild(menu);
            }
            // XUL's `context="..."` attribute only fires on XUL elements;
            // our tab is an HTML <div>, so it gets ignored. Wire an
            // explicit contextmenu listener that opens the menupopup
            // at the cursor position. preventDefault on the event so
            // the OS context menu doesn't also appear.
            if (!(tab as any)._wvCtxBound) {
                (tab as any)._wvCtxBound = true;
                tab.addEventListener("contextmenu", (e: any) => {
                    try {
                        e.preventDefault();
                        e.stopPropagation();
                        const m = doc.getElementById(MENU_ID);
                        if (m && typeof (m as any).openPopupAtScreen === "function") {
                            (m as any).openPopupAtScreen(e.screenX, e.screenY, true);
                        }
                    } catch (er) {
                        Zotero.debug("[Weavero] reader tab contextmenu err: " + er);
                    }
                });
            }
            // Keep the `context` attribute too — harmless on HTML elements
            // and matches what XUL elements would have.
            tab.setAttribute("context", MENU_ID);
        } catch (e) {
            Zotero.debug("[Weavero] _ensureReaderWindowTabContextMenu err: " + e);
        }
    }

    /** One-time CSS for the reader-window compact menubar: collapse the
     *  XUL `<menubar>` via height-0 (NOT visibility:collapse — keeps the
     *  menus in Mozilla's focusable tree so Alt-activation works). */
    _ensureReaderCompactMenubarStyles(doc) {
        try {
            if (doc.getElementById("wv-reader-compact-menubar-styles")) return;
            const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
            style.id = "wv-reader-compact-menubar-styles";
            style.textContent = [
                /* Hidden state — height-only collapse so menus stay
                   focusable for Alt-activation. */
                "menubar[wv-compact-hidden='true'] {",
                "  height: 0 !important; min-height: 0 !important;",
                "  overflow: hidden !important;",
                "}",
                /* Visible state — match the main window's titlebar row
                   height (36px) and add a left-pad for our injected Z
                   icon to occupy. */
                "menubar {",
                "  min-height: 36px;",
                "  padding-left: 40px;",
                "  align-items: center;",
                "  position: relative;",
                "}",
                /* The injected Z icon — absolute-positioned so XUL
                   menubar nav doesn't include it. Sized + placed to
                   match the main-window's .titlebar-icon (16px, 12px
                   from left edge, vertically centered). */
                ".wv-reader-menubar-icon {",
                "  position: absolute;",
                "  left: 12px; top: 50%;",
                "  transform: translateY(-50%);",
                "  width: 16px; height: 16px;",
                "  background-image: url('chrome://zotero/skin/z.svg');",
                "  background-size: contain;",
                "  background-repeat: no-repeat;",
                "  background-position: center;",
                "  pointer-events: none;",
                "}",
            ].join("\n");
            (doc.documentElement || doc).appendChild(style);
        } catch (e) {
            Zotero.debug("[Weavero] _ensureReaderCompactMenubarStyles err: " + e);
        }
    }
}

const _readerDescriptors = Object.getOwnPropertyDescriptors(_ReaderMixin.prototype);
delete (_readerDescriptors as any).constructor;
export const readerMethods = _readerDescriptors;
